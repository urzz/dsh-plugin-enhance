import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import SessionStore from '@deepseek-ai/dsh-session';
import SqliteSessionQuery from '@deepseek-ai/dsh-session-query-sqlite';
import * as JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import { SessionQueryError } from '@deepseek-ai/dsh-session-query';
import * as SessionQueryEnhance from '../session-query.js';

// All source logs and the disposable SQLite index live below this test's tmp.
// Only the tool registry and the agent/policy/approval seams are substitutes.
async function fixture(t, { mode = 'danger-full-access', config = {} } = {}) {
  const tmp = await mkdtemp(join(tmpdir(), 'session-query-enhance-test-'));
  const storageRoot = join(tmp, 'sessions');
  const cwd = join(tmp, 'workspace-a');
  const otherCwd = join(tmp, 'workspace-b');
  const ctx = new Context();
  const plugins = [];
  const detach = new Map();
  const writers = new Set();
  const definitions = new Map();
  const boundaries = new Map();
  const policy = { mode };
  const policyCalls = [];
  t.after(async () => {
    try {
      // Consumers finish before the JSONL provider, which owns open handles.
      for (const writer of writers) await writer.close();
      for (const remove of detach.values()) remove();
      for (const plugin of plugins.toReversed()) await plugin.dispose();
    } finally {
      assert.equal(relative(tmpdir(), tmp).startsWith('..'), false);
      assert.equal(isAbsolute(relative(tmpdir(), tmp)), false);
      await rm(tmp, { recursive: true, force: true });
    }
  });
  await mkdir(storageRoot);
  async function mount(plugin, options) {
    const fork = ctx.plugin(plugin, options);
    plugins.push(fork);
    await fork.await();
    assert.equal(fork.error, undefined);
    return fork;
  }
  await mount(SessionStore);
  await mount(JsonlPersistence, { root: storageRoot, compression: 'none' });
  await mount(SqliteSessionQuery, { path: join(tmp, 'query.sqlite'), snippetChars: 80 });
  ctx.provide('tools', {
    register(definition) {
      assert.equal(definitions.has(definition.name), false);
      definitions.set(definition.name, definition);
      return () => definitions.delete(definition.name);
    },
  });
  ctx.provide('sandboxPolicy', {
    resolve(request) { policyCalls.push(request); return policy; },
  });
  ctx.provide('agents', {
    turnBoundaryOf(session) { return { lastStepStartSeq: boundaries.get(session.id) ?? null }; },
  });
  await mount(SessionQueryEnhance, config);
  const tool = definitions.get('session_query_enhance');
  assert.ok(tool, 'Cordis mounted the plugin and registered its tool');

  function live(id, meta = {}) {
    const session = ctx.sessions.prepare(id, { meta: { cwd, createdAt: 100, ...meta } });
    detach.set(id, ctx.sessions.enter(session));
    ctx.sessions.announce(session);
    return session;
  }
  const caller = live('caller', { createdAt: 1000 });
  const agent = { session: caller };
  const execution = { agent, callId: 'session-query-test-call', signal: new AbortController().signal };
  const execute = (args, overrides = {}) => tool.execute(args, { ...execution, ...overrides });
  const call = async (args, overrides) => JSON.parse(await execute(args, overrides));

  async function persisted(id, meta, populate, { keepLive = false } = {}) {
    const session = live(id, meta);
    const writer = await ctx.sessionPersistence.create(session.header);
    writers.add(writer);
    await populate(session);
    await ctx.sessions.flush(session);
    await writer.close();
    writers.delete(writer);
    if (!keepLive) {
      detach.get(id)();
      detach.delete(id);
      assert.equal(ctx.sessions.get(id), undefined);
    }
    return session;
  }
  return { ctx, tmp, storageRoot, cwd, otherCwd, caller, agent, tool, policy, policyCalls, boundaries, live, persisted, execute, call };
}

function message(session, text, intent = { surfaceOp: 'append' }) {
  return session.append('user/message', {
    id: `${session.id}-message-${session.seq}`,
    role: 'user',
    source: { kind: 'user' },
    content: [{ type: 'text', text }],
  }, intent);
}

function title(session, text) {
  return session.append('session/title', { title: text, messageSeqs: [], source: { kind: 'user' } });
}

async function files(root) {
  const result = {};
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else result[relative(root, path)] = await readFile(path);
    }
  }
  await visit(root);
  return result;
}

const ids = result => result.items.map(item => item.header.id);
const seqs = result => result.items.map(item => item.seq).sort((a, b) => a - b);
const queryMethods = ['filterSessions', 'readTitleSnapshots', 'searchSessions', 'searchEvents', 'readEvent', 'traceSession', 'traceEvent'];
function observeCalls(t, service, methods = queryMethods) {
  const calls = [];
  for (const method of methods) {
    const original = service[method].bind(service);
    t.mock.method(service, method, async (...args) => {
      calls.push({ method, args });
      try {
        return await original(...args);
      } catch (error) {
        t.diagnostic(`${method}: ${error.stack}`);
        throw error;
      }
    });
  }
  return calls;
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('six actions read cold history across cwd, trace real replacements/lineage, and leave source logs and live store unchanged', async t => {
  const f = await fixture(t);
  const fullText = `quartz token original ${'unabridged historical detail '.repeat(30)}`;
  let original;
  let replacement;
  let followup;
  await f.persisted('root', { createdAt: 100 }, session => {
    original = message(session, fullText);
    replacement = message(session, 'quartz token consolidated', {
      surfaceOp: { op: 'replace', startSeq: original.seq, endSeq: original.seq },
      sourceEventSeqs: [original.seq],
    });
    followup = message(session, 'quartz token follow-up', { surfaceOp: 'append', sourceEventSeqs: [replacement.seq] });
    title(session, 'Root notes');
  });
  await f.persisted('child', { cwd: f.otherCwd, parentSession: 'root', origin: 'subagent', delegationDepth: 1, createdAt: 200 }, session => {
    message(session, 'quartz token child findings');
    title(session, 'Child notes');
    session.append('turn/start', { turn: 1 });
    session.append('turn/end', { turn: 1, reason: { kind: 'aborted' } });
  });
  await f.persisted('grandchild', { cwd: f.otherCwd, parentSession: 'child', origin: 'subagent', delegationDepth: 2, createdAt: 300 }, session => {
    message(session, 'quartz token grandchild findings');
    title(session, 'Grandchild notes');
  });
  message(f.caller, 'quartz token caller must not be returned');
  const before = await files(f.storageRoot);
  assert.equal(Object.keys(before).filter(path => path.endsWith('.jsonl')).length, 3);
  const liveBefore = f.ctx.sessions.list();
  const created = [];
  f.ctx.on('session/created', session => created.push(session.id));

  const all = await f.call({ action: 'list' });
  assert.deepEqual(ids(all), ['grandchild', 'child', 'root']);
  assert.equal(all.total, 3);
  assert.equal(all.items.every(item => !item.live && item.persisted), true);
  assert.equal(all.items.find(item => item.header.id === 'child').title.title, 'Child notes');
  assert.deepEqual(ids(await f.call({ action: 'list', cwd: f.cwd })), ['root']);
  assert.deepEqual(ids(await f.call({ action: 'list', cwd: `${f.cwd}-different` })), []);

  const search = await f.call({ action: 'search', query: 'quartz token' });
  assert.deepEqual(new Set(ids(search)), new Set(['root', 'child', 'grandchild']));
  assert.equal(search.hasMore, false);
  assert.equal(search.items.every(item => [...item.bestMatch.snippet].length <= 80), true);
  assert.deepEqual(new Set(ids(await f.call({ action: 'search', query: 'quartz token', cwd: f.otherCwd }))), new Set(['child', 'grandchild']));
  assert.deepEqual(ids(await f.call({ action: 'search', query: 'quartz OR token' })), [], 'query text is not executable FTS syntax');

  const shadowed = await f.call({ action: 'search_events', session_id: 'root', query: 'quartz token', surfaces: ['shadowed'] });
  assert.equal(shadowed.session.cwd, f.cwd);
  assert.deepEqual(seqs(shadowed), [original.seq]);
  const current = await f.call({ action: 'search_events', session_id: 'root', query: 'quartz token', surfaces: ['current'], event_types: ['user/message'], seq_from: replacement.seq, seq_to: followup.seq });
  assert.deepEqual(seqs(current), [replacement.seq, followup.seq]);
  const logOnly = await f.call({ action: 'search_events', session_id: 'child', query: 'aborted', event_types: ['turn/end'], surfaces: ['log-only'] });
  assert.equal(logOnly.items.length, 1);
  assert.equal(logOnly.items[0].type, 'turn/end');

  const read = await f.call({ action: 'read_event', session_id: 'root', seq: replacement.seq, before: 1, after: 1 });
  assert.deepEqual(read.target, replacement);
  assert.deepEqual(read.before, [original]);
  assert.deepEqual(read.after, [followup]);
  assert.equal(read.before[0].data.content[0].text, fullText, 'exact reads do not substitute search snippets');
  assert.equal(read.inheritedEventCount, 0);
  assert.equal(read.session.cwd, f.cwd);
  assert.equal((await f.call({ action: 'read_event', session_id: 'child', seq: 0 })).session.cwd, f.otherCwd);

  const lineage = await f.call({ action: 'trace_session', session_id: 'child' });
  assert.equal(lineage.target.header.id, 'child');
  assert.deepEqual(lineage.ancestors.map(item => item.header.id), ['root']);
  assert.equal(lineage.root.header.id, 'root');
  assert.equal(lineage.complete, true);
  assert.equal(lineage.descendants[0].session.header.id, 'grandchild');
  assert.deepEqual(lineage.descendants[0].descendants, []);

  const trace = await f.call({ action: 'trace_event', session_id: 'root', seq: original.seq });
  assert.equal(trace.target.surface, 'shadowed');
  assert.equal(trace.replacedBy, replacement.seq);
  assert.deepEqual(trace.replacementChain, [replacement.seq]);
  assert.deepEqual(trace.derivedEventSeqs, [replacement.seq]);
  const sources = await f.call({ action: 'trace_event', session_id: 'root', seq: replacement.seq });
  assert.deepEqual(sources.sourceEventSeqs, [original.seq]);
  assert.deepEqual(sources.replacedEventSeqs, [original.seq]);
  assert.deepEqual(sources.derivedEventSeqs, [followup.seq]);

  assert.deepEqual(f.ctx.sessions.list(), liveBefore, 'cold observations never enter the live store');
  assert.deepEqual(created, [], 'no cold target was transiently announced as live');
  assert.deepEqual(await files(f.storageRoot), before, 'every persisted filename and byte remains unchanged');
  assert.equal(f.tool.timeoutMs, 30000, 'Cordis applied the plugin Config default');
});

test('live state wins over an older JSONL copy for titles, search, exact reads and event traces', async t => {
  const f = await fixture(t, { config: { timeoutMs: 1500 } });
  let old;
  const live = await f.persisted('both', { cwd: f.otherCwd }, session => {
    old = message(session, 'obsolete lighthouse');
    title(session, 'Persisted title');
  }, { keepLive: true });
  // Closing the real writer makes the following events intentionally live-only.
  const fresh = message(live, 'new nebula discovery', {
    surfaceOp: { op: 'replace', startSeq: old.seq, endSeq: old.seq },
    sourceEventSeqs: [old.seq],
  });
  title(live, 'Live title');
  const reader = await f.ctx.sessionPersistence.open(live.id, 'read');
  try {
    assert.equal((await reader.read()).events.length, 2, 'the persisted copy really is older');
  } finally {
    await reader.close();
  }
  const before = await files(f.storageRoot);
  const listing = await f.call({ action: 'list' });
  assert.deepEqual(ids(listing), ['both']);
  assert.equal(listing.items[0].live, true);
  assert.equal(listing.items[0].persisted, true);
  assert.equal(listing.items[0].title.title, 'Live title');
  assert.deepEqual(ids(await f.call({ action: 'search', query: 'new nebula discovery' })), ['both']);
  assert.deepEqual(ids(await f.call({ action: 'search', query: 'obsolete lighthouse', surfaces: ['current'] })), []);
  assert.deepEqual(seqs(await f.call({ action: 'search_events', session_id: 'both', query: 'new nebula discovery' })), [fresh.seq]);
  assert.deepEqual((await f.call({ action: 'read_event', session_id: 'both', seq: fresh.seq })).target, fresh);
  assert.equal((await f.call({ action: 'trace_event', session_id: 'both', seq: old.seq })).replacedBy, fresh.seq);
  assert.equal(f.ctx.sessions.get('both'), live);
  assert.deepEqual(await files(f.storageRoot), before);
  assert.equal(f.tool.timeoutMs, 1500);
});

test('list offsets and bounded search pages retain results when the caller consumes a provider page', async t => {
  const f = await fixture(t);
  message(f.caller, 'shared beacon shared beacon shared beacon');
  message(f.caller, 'terminal beacon terminal beacon terminal beacon');
  for (let index = 1; index <= 4; index++) {
    await f.persisted(`match-${index}`, { createdAt: index }, session => {
      message(session, 'shared beacon');
      if (index <= 3) message(session, 'terminal beacon');
    });
  }
  const first = await f.call({ action: 'list', limit: 2 });
  assert.deepEqual(ids(first), ['match-4', 'match-3']);
  assert.equal(first.total, 4);
  assert.equal(first.nextOffset, 2);
  const second = await f.call({ action: 'list', limit: 2, offset: first.nextOffset });
  assert.deepEqual(ids(second), ['match-2', 'match-1']);
  assert.equal(second.nextOffset, undefined);
  assert.deepEqual(ids(await f.call({ action: 'list', offset: 4 })), []);

  const providerFirst = await f.ctx.sessionQuery.searchSessions({ query: 'shared beacon', limit: 1 });
  assert.equal(providerFirst.items[0].header.id, f.caller.id, 'the excluded caller occupies the strongest-hit page');
  const calls = observeCalls(t, f.ctx.sessionQuery, ['searchSessions']);
  const page = await f.call({ action: 'search', query: 'shared beacon', limit: 2 });
  assert.equal(page.items.length, 2);
  assert.equal(new Set(ids(page)).size, 2);
  assert.equal(ids(page).includes(f.caller.id), false);
  assert.equal(page.hasMore, true);
  assert.equal(typeof page.hint, 'string');
  assert.ok(calls.length > 1 && calls.some(call => call.args[0].cursor !== undefined), 'native cursors are followed to fill the requested result count');
  const full = await f.call({ action: 'search', query: 'shared beacon', limit: 100 });
  assert.equal(full.items.length, 4);
  assert.equal(full.hasMore, false);
  assert.equal(full.hint, undefined);
  // Two provider pages exhaust this corpus, but one accepted hit is still
  // beyond the tool limit: hasMore must account for that omitted hit too.
  const terminalPage = await f.call({ action: 'search', query: 'terminal beacon', limit: 2 });
  assert.equal(terminalPage.items.length, 2);
  assert.equal(terminalPage.hasMore, true);
  assert.equal((await f.call({ action: 'search', query: 'terminal beacon', limit: 3 })).hasMore, false);
});

test('own-session event search excludes the invoking step while explicit other-session search remains unrestricted', async t => {
  const f = await fixture(t);
  const historical = message(f.caller, 'orbit marker earlier history');
  const boundary = f.caller.append('step/start', { turn: 1, step: 1 });
  const ownStep = message(f.caller, 'orbit marker invoking step');
  f.boundaries.set(f.caller.id, boundary.seq);
  const other = f.live('other', { cwd: f.otherCwd });
  for (let index = 0; index < 3; index++) message(other, `orbit marker other ${index}`);

  assert.deepEqual(seqs(await f.call({ action: 'search_events', session_id: f.caller.id, query: 'orbit marker' })), [historical.seq]);
  assert.deepEqual(seqs(await f.call({ action: 'search_events', session_id: f.caller.id, query: 'orbit marker', seq_to: ownStep.seq + 100 })), [historical.seq]);
  assert.deepEqual(seqs(await f.call({ action: 'search_events', session_id: f.caller.id, query: 'orbit marker', seq_from: boundary.seq })), []);
  const otherPage = await f.call({ action: 'search_events', session_id: other.id, query: 'orbit marker', limit: 1 });
  assert.equal(otherPage.items.length, 1);
  assert.equal(otherPage.hasMore, true);
  assert.equal((await f.call({ action: 'search_events', session_id: other.id, query: 'orbit marker' })).items.length, 3);
  f.boundaries.delete(f.caller.id);
  assert.deepEqual(seqs(await f.call({ action: 'search_events', session_id: f.caller.id, query: 'orbit marker' })), [], 'an absent boundary cannot expose the current step');
});

test('every action refuses restricted callers before provider work; approval grants just the pending read', async t => {
  const f = await fixture(t, { mode: 'workspace-write' });
  await f.persisted('private', { cwd: f.otherCwd }, session => { message(session, 'confidential observation'); });
  const before = await files(f.storageRoot);
  const calls = observeCalls(t, f.ctx.sessionQuery);
  const persistenceCalls = observeCalls(t, f.ctx.sessionPersistence, ['list', 'open', 'stat']);
  const actions = [
    { action: 'list' },
    { action: 'search', query: 'confidential' },
    { action: 'search_events', session_id: 'private', query: 'confidential' },
    { action: 'read_event', session_id: 'private', seq: 0 },
    { action: 'trace_session', session_id: 'private' },
    { action: 'trace_event', session_id: 'private', seq: 0 },
  ];
  for (const args of actions) await assert.rejects(f.execute(args), /requires approval/);
  assert.deepEqual(calls, []);
  assert.deepEqual(persistenceCalls, []);

  const asked = deferred();
  const decision = deferred();
  const approval = { request(request) { asked.resolve(request); return decision.promise; } };
  f.ctx.provide('approval', approval);
  const pending = f.call({ action: 'read_event', session_id: 'private', seq: 0 });
  const request = await asked.promise;
  assert.equal(request.agent, f.agent);
  assert.equal(request.toolName, 'session_query_enhance');
  assert.equal(request.callId, 'session-query-test-call');
  assert.match(request.reason, /private/);
  assert.deepEqual(calls, [], 'no provider access while approval is pending');
  assert.deepEqual(persistenceCalls, []);
  decision.resolve('allowed-once');
  const allowed = await pending;
  assert.equal(allowed.target.data.content[0].text, 'confidential observation');
  assert.ok(calls.some(call => call.method === 'readEvent'));
  assert.ok(persistenceCalls.some(call => call.method === 'open'));
  assert.equal(f.policy.mode, 'workspace-write', 'one approval must not widen subsequent calls');
  const count = calls.length;
  const storageCount = persistenceCalls.length;
  for (const outcome of ['rejected', 'cancelled', 'unavailable']) {
    approval.request = async () => outcome;
    await assert.rejects(f.execute({ action: 'list' }), outcome === 'unavailable' ? /no approval channel is available/ : new RegExp(outcome));
    assert.equal(calls.length, count);
    assert.equal(persistenceCalls.length, storageCount);
  }
  assert.equal(f.ctx.sessions.get('private'), undefined);
  assert.deepEqual(await files(f.storageRoot), before);
});

test('cancellation retains the caller reason before work, after approval and after a real provider read', async t => {
  const f = await fixture(t);
  await f.persisted('cancel-target', { cwd: f.otherCwd }, session => { message(session, 'cancellable history'); });
  const before = await files(f.storageRoot);
  const calls = observeCalls(t, f.ctx.sessionQuery, ['readEvent']);
  const args = { action: 'read_event', session_id: 'cancel-target', seq: 0 };
  const beforeWork = new AbortController();
  const initialReason = new Error('caller cancelled before dispatch');
  beforeWork.abort(initialReason);
  await assert.rejects(f.execute(args, { signal: beforeWork.signal }), error => error === initialReason);
  assert.equal(calls.length, 0);
  assert.equal(f.policyCalls.length, 0);

  const duringApproval = new AbortController();
  const approvalReason = new Error('caller cancelled during approval');
  f.policy.mode = 'read-only';
  f.ctx.provide('approval', { request: async () => {
    duringApproval.abort(approvalReason);
    return 'allowed-once';
  } });
  await assert.rejects(f.execute(args, { signal: duringApproval.signal }), error => error === approvalReason);
  assert.equal(calls.length, 0);

  f.policy.mode = 'danger-full-access';
  const duringRead = new AbortController();
  const providerReason = new Error('caller cancelled as the read completed');
  const readEvent = f.ctx.sessionQuery.readEvent.bind(f.ctx.sessionQuery);
  t.mock.method(f.ctx.sessionQuery, 'readEvent', async (...params) => {
    const result = await readEvent(...params);
    duringRead.abort(providerReason);
    return result;
  });
  await assert.rejects(f.execute(args, { signal: duringRead.signal }), error => error === providerReason);
  assert.equal(calls.length, 1, 'the cancellation case still exercised the real cold reader');
  assert.equal(f.ctx.sessions.get('cancel-target'), undefined);
  assert.deepEqual(await files(f.storageRoot), before);
});

test('invalid inputs are rejected before policy resolution or access to history', async t => {
  const f = await fixture(t);
  const calls = observeCalls(t, f.ctx.sessionQuery);
  const invalid = [
    {},
    { action: 'delete', session_id: 'caller' },
    { action: 'list', limit: 0 },
    { action: 'list', limit: 101 },
    { action: 'list', offset: -1 },
    { action: 'list', limit: 1.5 },
    { action: 'list', cwd: '' },
    { action: 'list', session_id: 'caller' },
    { action: 'search', query: '   ' },
    { action: 'search', query: 'x', seq_from: 2, seq_to: 1 },
    { action: 'search', query: 'x', surfaces: ['unknown'] },
    { action: 'search', query: 'x', event_types: [''] },
    { action: 'search_events', query: 'x' },
    { action: 'search_events', query: 'x', session_id: '' },
    { action: 'read_event', session_id: 'caller', seq: -1 },
    { action: 'read_event', session_id: 'caller', seq: 0, before: 11 },
    { action: 'read_event', session_id: 'caller', seq: 0, after: 11 },
    { action: 'trace_session', session_id: 'caller', query: 'x' },
    { action: 'trace_event', session_id: 'caller', seq: 0.1 },
    { action: 'list', sandbox_permissions: 'danger-full-access' },
  ];
  for (const args of invalid) {
    await assert.rejects(f.execute(args), error => {
      assert.ok(error instanceof Error, JSON.stringify(args));
      return true;
    });
  }
  await assert.rejects(f.execute({ action: 'list' }, { agent: undefined }), /agent-bound caller/);
  assert.deepEqual(calls, []);
  assert.deepEqual(f.policyCalls, []);
});

test('provider not-found errors retain actionable codes without leaking source diagnostics', async t => {
  const f = await fixture(t);
  await f.persisted('existing', { cwd: f.otherCwd }, session => { message(session, 'some history'); });
  await assert.rejects(f.execute({ action: 'read_event', session_id: 'absent-private-id', seq: 0 }), error => {
    assert.ok(error instanceof SessionQueryError);
    assert.equal(error.code, 'SESSION_QUERY_SESSION_NOT_FOUND');
    assert.equal(error.message, 'Session was not found.');
    return true;
  });
  await assert.rejects(f.execute({ action: 'read_event', session_id: 'existing', seq: 999 }), error => {
    assert.ok(error instanceof SessionQueryError);
    assert.equal(error.code, 'SESSION_QUERY_EVENT_NOT_FOUND');
    assert.equal(error.message, 'Event was not found.');
    return true;
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
import { Loader, Group } from '@deepseek-ai/cordis-plugin-loader';
import { SessionStore } from '@deepseek-ai/dsh-session';
import SqliteSessionQuery from '@deepseek-ai/dsh-session-query-sqlite';
import { ToolsService } from '@deepseek-ai/dsh-tools';
import { parse } from 'yaml';

test('bundle exposes two components and owns the isolated query backend lifecycle', async t => {
  const ctx = new Context();
  ctx.provide('systemPrompt', { tools() {} });
  ctx.provide('agents', { turnBoundaryOf: () => ({}) });
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'danger-full-access' }) });
  ctx.provide('pluginManager', { listBundles: async () => [] });
  ctx.provide('pluginMarket', { listIndexes: async () => [] });
  ctx.provide('profileContext', { dir: '/unused-profile' });
  const sessions = ctx.plugin(SessionStore);
  const tools = ctx.plugin(ToolsService);
  const nativeQuery = ctx.plugin(SqliteSessionQuery, { path: ':memory:', openAt: 'never' });
  const loaderFiber = ctx.plugin(Loader, { baseUrl: new URL('../package.json', import.meta.url).href });
  await Promise.all([sessions.await(), tools.await(), nativeQuery.await(), loaderFiber.await()]);
  try {
    const rootQuery = ctx.sessionQuery;
    ctx.loader.builtins.group = Group;
    const patch = parse(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'));
    await ctx.loader.root.update(patch[0].insert);
    await ctx.loader.await();
    assert.deepEqual([...ctx.loader.entries()].filter(entry => !entry.options.group).map(entry => entry.options.name), [
      'dsh-plugin-enhance', 'dsh-plugin-enhance/session-query',
    ], 'the bundle inventory contains only the two user-facing components');
    const close = t.mock.method(SqliteSessionQuery.prototype, 'close');
    const tool = ctx.tools.get('session_query_enhance');
    assert.ok(tool, 'bundle registers the cross-workspace tool');
    assert.ok(ctx.tools.get('plugin_enhance'), 'existing updater still registers');
    assert.equal(tool.timeoutMs, 30000, 'component config defaults are applied');
    assert.equal(ctx.sessionQuery.config.openAt, 'never', 'the root query service is not replaced');
    const caller = ctx.sessions.create('bundle-caller', { meta: { cwd: '/workspace/a' } });
    const other = ctx.sessions.create('bundle-other', { meta: { cwd: '/workspace/b' } });
    other.append('user/message', {
      id: 'bundle-message', role: 'user', source: { kind: 'user' },
      content: [{ type: 'text', text: 'bundle isolation marker' }],
    }, { surfaceOp: 'append' });
    const result = JSON.parse(await tool.execute({ action: 'search', query: 'isolation marker' }, {
      agent: { session: caller }, callId: 'bundle-call', signal: new AbortController().signal,
    }));
    assert.deepEqual(result.items.map(item => item.header.id), ['bundle-other']);
    await assert.rejects(rootQuery.searchSessions({ query: 'isolation marker' }), { code: 'SESSION_QUERY_SEARCH_DISABLED' });
    await ctx.loader.update('dsh-plugin-enhance-session-query-tool', { disabled: true });
    await ctx.loader.await();
    assert.equal(ctx.tools.get('session_query_enhance'), undefined);
    assert.ok(ctx.tools.get('plugin_enhance'), 'disabling query leaves the updater active');
    assert.equal(close.mock.callCount(), 1, 'disabling query closes its internal backend');
    assert.equal(close.mock.calls[0].this.config.openAt, 'first-search', 'only the internal backend is closed');
    assert.equal(ctx.sessionQuery.config.openAt, 'never', 'the root query service survives component disable');

    await ctx.loader.update('dsh-plugin-enhance-session-query-tool', { disabled: false, config: { timeoutMs: 1500 } });
    await ctx.loader.await();
    const reloaded = ctx.tools.get('session_query_enhance');
    assert.equal(reloaded.timeoutMs, 1500, 'the existing component entry still accepts user configuration');
    const repeated = JSON.parse(await reloaded.execute({ action: 'search', query: 'isolation marker' }, {
      agent: { session: caller }, callId: 'bundle-reload-call', signal: new AbortController().signal,
    }));
    assert.deepEqual(repeated.items.map(item => item.header.id), ['bundle-other']);
    const queryFiber = ctx.loader.resolve('dsh-plugin-enhance-session-query-tool').fiber;
    await ctx.loader.root.update([]);
    await ctx.loader.await();
    await queryFiber.await(); // Removed entries are no longer tracked by loader.await().
    assert.equal(ctx.tools.get('session_query_enhance'), undefined);
    assert.equal(ctx.tools.get('plugin_enhance'), undefined);
    assert.equal(close.mock.callCount(), 2, 'unloading the bundle closes the reloaded backend');
    assert.equal(ctx.sessionQuery.config.openAt, 'never');
  } finally {
    await loaderFiber.dispose();
    await nativeQuery.dispose();
    await tools.dispose();
    await sessions.dispose();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { PluginEnhance, registerUpdateTool } from '../index.js';
import { TYPERT } from '../typert.host.js';
import { TYPERT_REMOTE } from '../typert.remote-client.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function providers(ctx) {
  ctx.provide('pluginManager', { listBundles: async () => [] });
  ctx.provide('pluginMarket', { listIndexes: async () => [] });
  ctx.provide('profileContext', { dir: '/unused-profile' });
}

test('real Cordis service mounts, exposes supported Remote markers, dispatches strict Gateway calls, and unloads', async () => {
  const ctx = new Context();
  providers(ctx);
  ctx.provide('typert', { local: { get: key => TYPERT_REMOTE.methods[key], hasSeen: () => false }, resources: { entries: () => [] } });
  ctx.provide('remoteAccess', { decide: () => ({ kind: 'deny', reason: 'test-denied' }) });
  const host = ctx.plugin(PluginEnhance, {});
  const gateway = ctx.plugin(TypertGatewayService, {});
  await settle();
  try {
    assert.deepEqual(remoteMethods(ctx.get('pluginEnhance')).map(m => m.method), ['check', 'start', 'status', 'retry']);
    assert.equal(TYPERT.invocations.length, 4);
    const owner = { principal: { kind: 'owner' }, signal: new AbortController().signal };
    const invoke = (method, args = {}, peer = owner) => ctx.get('typertGateway').invoke({ namespace: 'pluginEnhance', method, args, peer });
    const initial = await invoke('status');
    assert.equal(initial.generation, 0);
    const checked = await invoke('check');
    assert.equal(checked.generation, 1);
    assert.deepEqual(checked.items, []);
    assert.deepEqual(TYPERT_REMOTE.methods['pluginEnhance/status'].result.create().parse(checked), checked);
    await assert.rejects(invoke('start', { selection: { names: ['example'] } }), /boundary validation/i);
    await assert.rejects(invoke('retry', { selection: { names: [], approvedBuilds: ['unsafe'] } }), /boundary validation/i);
    await assert.rejects(invoke('status', {}, { ...owner, principal: { kind: 'external' } }), /access denied/i);
    assert.deepEqual(await TYPERT_REMOTE.methods['pluginEnhance/status'].invoke({ pluginEnhance: ctx.get('pluginEnhance') }, {}), checked);
    const progress = { requestId: 'native-request', step: 'restoring' };
    let forwarded;
    ctx.pluginEnhance.engine.updateProgress = value => { forwarded = value; };
    ctx.emit('plugin-manager/update-state', progress);
    assert.equal(forwarded, progress);
  } finally {
    await gateway.dispose();
    await host.dispose();
  }
  assert.equal(ctx.get('pluginEnhance'), undefined);
});

const bundle = (name, version = '1.0.0', enabled = false) => ({ name, version, source: `${name}@${version}`, enabled, installed: true, availability: 'profile', removable: true, updatable: true });
const versions = { status: 'listed', installed: '1.0.0', registry: 'https://private.example/', attempts: [], versions: [{ version: '2.0.0', tags: ['latest'], prerelease: false, bundle: true }], omitted: 0 };

test('Host delegates registry checks and updates to the native manager', async () => {
  const ctx = new Context();
  providers(ctx);
  const manager = ctx.pluginManager;
  let installed = bundle('example');
  const calls = [];
  manager.listBundles = async () => [structuredClone(installed)];
  manager.listVersions = async name => { calls.push(['list', name]); return versions; };
  manager.updateBundle = async (name, version, options) => {
    calls.push(['update', name, version, options]);
    assert.equal(options.registry, versions.registry);
    assert.equal(typeof options.requestId, 'string');
    ctx.emit('plugin-manager/update-state', { requestId: options.requestId, step: 'installing' });
    assert.equal(ctx.pluginEnhance.status().items[0].state, 'installing');
    installed = bundle(name, version);
    return { from: '1.0.0', to: version, step: 'install', result: { application: 'applied', bundle: name, version } };
  };
  const host = ctx.plugin(PluginEnhance, {});
  await settle();
  try {
    const checked = await ctx.pluginEnhance.check();
    assert.equal(checked.items[0].state, 'ready');
    const result = await ctx.pluginEnhance.start({ generation: checked.generation, names: ['example'] });
    assert.equal(result.items[0].state, 'succeeded');
    assert.equal(installed.enabled, false);
    assert.equal(calls[0][0], 'list');
    assert.equal(calls.at(-1)[0], 'update');
  } finally {
    await host.dispose();
  }
});

test('self-update survives real Cordis disposal and a replacement service resumes shared state', async () => {
  const ctx = new Context();
  providers(ctx);
  let bundles = [bundle('dsh-plugin-enhance', '1.0.0', true)];
  const manager = ctx.pluginManager;
  manager.listBundles = async () => structuredClone(bundles);
  manager.listVersions = async () => bundles[0].version === '1.0.0' ? versions : { ...versions, installed: '2.0.0', versions: [] };
  let host = ctx.plugin(PluginEnhance, {});
  let replacement;
  manager.updateBundle = async (name, version, options) => {
    await host.dispose();
    assert.equal(ctx.get('pluginEnhance'), undefined);
    bundles = [bundle(name, version, true)];
    host = ctx.plugin(PluginEnhance, {});
    await settle();
    replacement = ctx.pluginEnhance;
    assert.equal(replacement.status().busy, true);
    assert.equal(replacement.status().run.active, name);
    await assert.rejects(replacement.check(), /engine-busy/);
    ctx.emit('plugin-manager/update-state', { requestId: options.requestId, step: 'installing' });
    assert.equal(replacement.status().items[0].state, 'installing');
    return { from: '1.0.0', to: version, step: 'install', result: { application: 'applied', bundle: name, version } };
  };
  await settle();
  try {
    const original = ctx.pluginEnhance;
    const checked = await original.check();
    assert.equal(checked.items[0].state, 'ready');
    const result = await original.start({ generation: checked.generation, names: ['dsh-plugin-enhance'] });
    assert.notEqual(replacement, original);
    assert.notEqual(replacement.engine, original.engine, 'replacement uses its own engine implementation');
    assert.deepEqual(replacement.status(), result);
    assert.equal(result.items[0].state, 'succeeded');
    assert.equal(result.busy, false);
    assert.equal((await replacement.check()).items[0].state, 'current');
  } finally {
    await host.dispose();
  }
});

test('agent tool shares UI service and denies mutations in restricted mode without approval', async () => {
  let definition;
  let starts = 0;
  let checks = 0;
  const ctx = {
    tools: { register(value) { definition = value; return () => {}; } },
    sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) },
    get: () => undefined,
    pluginEnhance: { start: () => { starts++; }, check: async () => { checks++; return { generation: 3 }; } },
  };
  registerUpdateTool(ctx);
  const exec = { signal: new AbortController().signal, callId: 'test' };
  await assert.rejects(definition.execute({ action: 'start', generation: 1, names: ['example'] }, exec));
  assert.equal(starts, 0);
  ctx.sandboxPolicy.resolve = () => ({ mode: 'danger-full-access' });
  assert.deepEqual(JSON.parse(await definition.execute({ action: 'check' }, exec)), { generation: 3 });
  assert.equal(checks, 1);
});

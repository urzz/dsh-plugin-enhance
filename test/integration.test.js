import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { tmpdir } from 'node:os';
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { PluginEnhance, createNpmResolver, registerUpdateTool } from '../index.js';
import { TYPERT } from '../typert.host.js';
import { TYPERT_REMOTE } from '../typert.remote-client.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function providers(ctx) {
  ctx.provide('pluginManager', { listBundles: async () => [], registries: async () => ({ registry: null, fallbackRegistries: [], resolved: null }) });
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
  } finally {
    await gateway.dispose();
    await host.dispose();
  }
  assert.equal(ctx.get('pluginEnhance'), undefined);
});

test('npm metadata adapter preserves launcher invocation, profile cwd and private-registry isolation', async () => {
  const calls = [];
  const profile = { dir: '/profile-with-auth', packageManager: { command: '/app/node', args: ['/app/pnpm.cjs'], env: { APP_PROXY: 'proxy' } } };
  const resolve = createNpmResolver({
    profile,
    manager: { registries: async () => ({ registry: null, fallbackRegistries: ['https://registry.npmjs.org/'], resolved: 'https://private.example/' }) },
    view: async (...args) => { calls.push(args); return { exitCode: 0, timedOut: false, stdout: JSON.stringify({ name: '@private/example', version: '2.0.0', dsh: { bundle: {} } }), stderr: '' }; },
  });
  assert.equal((await resolve({ name: '@private/example' })).manifest.version, '2.0.0');
  assert.equal(calls[0][0], profile.dir);
  assert.equal(calls[0][1], '@private/example@latest');
  assert.equal(calls[0][2].command, '/app/node');
  assert.deepEqual(calls[0][2].args, ['/app/pnpm.cjs']);
  assert.deepEqual(calls[0][2].env, profile.packageManager.env);
  assert.equal(calls[0][2].registry, null);
  calls.length = 0;
  const failing = createNpmResolver({
    profile,
    manager: { registries: async () => ({ registry: null, fallbackRegistries: ['https://registry.npmjs.org/'], resolved: 'https://private.example/' }) },
    view: async (...args) => { calls.push(args); return { exitCode: 1, timedOut: true, stdout: '', stderr: 'ETIMEDOUT' }; },
  });
  await assert.rejects(failing({ name: '@private/example' }), /timeout/);
  assert.equal(calls.length, 1, 'private registry never falls back to public');
});

test('real launcher subprocess requests compatibility fields without invoking pnpm or mutating profiles', async () => {
  const resolve = createNpmResolver({
    profile: {
      dir: tmpdir(),
      packageManager: {
        command: process.execPath,
        args: ['--input-type=module', '-e', 'console.log(JSON.stringify({name:"example",version:"2.0.0",engines:{dsh:"0.2.1-rc.5"},peerDependencies:{"@deepseek-ai/dsh":"0.2.1-rc.5"},argv:process.argv,cwd:process.cwd(),marker:process.env.ENHANCE_TEST_MARKER}))', '--'],
        env: { ENHANCE_TEST_MARKER: 'launcher-env' },
      },
    },
    manager: { registries: async () => ({ registry: 'https://registry.npmjs.org/', fallbackRegistries: [], resolved: 'https://registry.npmjs.org/' }) },
  });
  const { manifest, registry } = await resolve({ name: 'example' });
  assert.equal(manifest.marker, 'launcher-env');
  assert.equal(manifest.cwd, tmpdir());
  assert.deepEqual(manifest.argv.slice(1), ['view', 'example@latest', 'name', 'version', 'dsh', 'engines', 'peerDependencies', '--json', '--registry=https://registry.npmjs.org/', '--config.fetch-retries=0']);
  assert.equal(manifest.engines.dsh, '0.2.1-rc.5');
  assert.equal(registry, 'https://registry.npmjs.org/');
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

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import * as zod from 'zod';
import { Context, Service } from '@deepseek-ai/cordis';
import * as gatewayClient from '@deepseek-ai/dsh-api-gateway/client';

// Exercise current client source without writing the release bundle.
const { outputFiles } = await build({
  entryPoints: [new URL('../client.source.js', import.meta.url).pathname],
  bundle: true, write: false, platform: 'browser', format: 'cjs',
  external: ['react', 'zod', '@deepseek-ai/dsh-client-ui-primitives'],
  banner: { js: "window.__ModuleLoader__.load({id:'dsh-plugin-enhance',factory(require){const module={exports:{}};" },
  footer: { js: 'return module.exports;}});' },
});
const source = outputFiles[0].text;
// Keep the UI tree inspectable while exercising the public component prop contract.
const primitives = { Button: 'button', Input: 'input', Tag: 'mark' };

test('update tab registers localized UI, selects only ready bundles and forwards checked generation', async () => {
  let plugin, Component, dictionaries, registration;
  let language = 'en';
  let cursor = 0;
  const states = [];
  const effects = [];
  const calls = [];
  const initial = { generation: 7, checkedAt: 123, busy: false, items: [
    ...['plugin-10', 'zeta', 'plugin-2', 'available', 'Alpha'].map(name => ({ name, currentVersion: '1.0.0', state: 'ready', source: `${name}@1`, enabled: true, target: { version: '2.0.0' } })),
    { name: 'protected', currentVersion: '1.0.0', state: 'blocked', source: 'file:../local', enabled: false, reason: 'not-removable' },
    ...['current', 'check-failed', 'failed', 'pending-builds', 'stale', 'removing', 'installing', 'succeeded', 'restart-required'].map(state => ({ name: state, state, currentVersion: '1.0.0', source: `${state}@1`, enabled: true })),
  ], marketErrors: [{ url: null, message: 'Native registry query failed' }] };
  for (const item of initial.items) item.support = item.state === 'blocked' ? 'unavailable' : item.name === 'Alpha' ? 'native' : 'extended';
  initial.items.push(
    { name: 'restoring', state: 'restoring', support: 'native', enabled: true },
    { name: 'restored', state: 'restored', support: 'native', enabled: true, retryable: true,
      result: { error: { diagnostic: 'Target install failed' } },
      restoreResult: { packageResult: { kind: 'ok', exitCode: 0, output: 'Previous version restored' } } },
  );
  Object.assign(initial.items.find(item => item.state === 'failed'), {
    reason: 'operation-error',
    result: { error: { code: 'operation-error', diagnostic: 'diagnostic-start' + 'x'.repeat(6000) + 'diagnostic-end' },
      packageResult: { kind: 'build-blocked', exitCode: 1, timedOut: true, truncated: true, logPath: '/tmp/pnpm.log', output: 'output-start' + 'y'.repeat(10000) + 'ERR_PNPM_IGNORED_BUILDS output-end' },
      pendingBuilds: [] },
  });
  initial.items.find(item => item.state === 'pending-builds').result = { error: { diagnostic: 'Activation diagnostic without a package run' } };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(value => value !== null && value !== undefined && value !== false) }),
    useState(value) { const index = cursor++; if (!(index in states)) states[index] = value; return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; },
    useRef(value) { return React.useState({ current: value })[0]; },
    useSyncExternalStore: () => {},
    useEffect(callback) { const index = cursor++; if (!(index in states)) { states[index] = true; effects.push(callback()); } },
  };
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { plugin = value.factory(name => { if (name === 'zod') return zod; if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives; assert.equal(name, 'react'); return React; }); } } }, setTimeout: () => 0, clearTimeout() {} });
  assert.deepEqual(Array.from(plugin.inject), ['slots', 'locale', 'remote']);
  let finishMount, unmounted = false;
  const mountReady = new Promise(resolve => { finishMount = resolve; });
  const resources = [];
  const remote = {
    async $mount(contribution) {
      assert.equal(contribution.package, 'dsh-plugin-enhance');
      assert.deepEqual(Array.from(contribution.descriptors, item => item.namespace + '/' + item.method), ['pluginEnhance/check', 'pluginEnhance/start', 'pluginEnhance/status', 'pluginEnhance/retry']);
      const input = contribution.methods['pluginEnhance/start'].input().create();
      assert.deepEqual(input.parse({ selection: { generation: 7, names: ['available'] } }), { selection: { generation: 7, names: ['available'] } });
      await mountReady;
      remote.pluginEnhance = {
        status: async () => ({ ok: true, value: initial }),
        start: async input => { calls.push(input); return { ok: true, value: input.names.length === 1 ? initial : { ...initial, items: initial.items.map(item => ({ ...item, state: 'succeeded' })) } }; },
      };
      return () => { delete remote.pluginEnhance; unmounted = true; };
    },
  };
  const activating = plugin.apply({
    effect(callback) { resources.push(callback()); },
    locale: { register(ns, dicts) { assert.equal(ns, 'dsh-plugin-enhance'); dictionaries = dicts; return () => {}; }, bind: () => key => dictionaries[language][key], subscribe: () => () => {}, getSnapshot: () => ({ revision: 1 }) },
    slots: { inject(name, callback) { assert.equal(name, 'plugins.tab'); callback(); }, register(options, component) { registration = options; Component = component; return () => {}; } },
    remote,
    inject(keys, callback) {
      assert.deepEqual(Array.from(keys), ['remote.pluginEnhance']);
      assert.ok(remote.pluginEnhance, 'namespace must be mounted before injection');
      return callback(this);
    },
  });
  assert.equal(registration, undefined);
  assert.equal(remote.pluginEnhance, undefined);
  finishMount();
  await activating;
  assert.equal(registration.label(), 'Enhanced management');
  assert.equal(dictionaries.zh.tab, '增强管理');
  assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries.zh).sort());
  const render = () => { cursor = 0; return Component(); };
  const flatten = node => typeof node !== 'object' ? [] : [node, ...node.children.flatMap(flatten)];
  render();
  await new Promise(resolve => setImmediate(resolve));
  let nodes = flatten(render());
  const button = text => nodes.find(node => node.type === 'button' && node.children.includes(text));
  const filter = label => nodes.find(node => node.type === 'button' && node.children.some(child => typeof child === 'string' && child.startsWith(label + ' (')));
  const search = () => nodes.find(node => node.type === 'input' && node.props.type === 'search');
  const headings = () => nodes.filter(node => node.type === 'h3').map(node => node.children[0]);
  assert.equal(button('Update selected').props.disabled, true);
  assert.equal(button('Update selected').props.variant, 'primary');
  assert.equal(button('Check for updates').props.variant, 'outline');
  assert.equal(button('Check for updates').props.size, 'sm');
  assert.equal(search().props['aria-label'], dictionaries.en.search);
  assert.ok(nodes.some(node => node.props.role === 'alert' && node.children.includes('Native registry query failed')));
  assert.ok(!nodes.some(node => node.children.includes('null: Native registry query failed')));
  const failure = nodes.find(node => node.type === 'tr' && flatten(node).some(child => child.props['aria-label'] === 'failed'));
  const failureNodes = flatten(failure);
  const diagnostics = failureNodes.filter(node => node.type === 'pre').map(node => node.children.join(''));
  assert.equal(diagnostics.length, 2);
  assert.ok(diagnostics[0].startsWith('diagnostic-start') && diagnostics[0].endsWith('diagnostic-end'));
  assert.ok(diagnostics[1].startsWith('output-start') && diagnostics[1].endsWith('ERR_PNPM_IGNORED_BUILDS output-end'));
  assert.ok(diagnostics[0].length < 2100 && diagnostics[1].length < 4100);
  for (const text of [dictionaries.en.buildBlocked, dictionaries.en.timedOut, dictionaries.en.outputTruncated, 'Full log: /tmp/pnpm.log', 'build-blocked · Exit code: 1']) {
    assert.ok(failureNodes.some(node => node.children.includes(text)), text);
  }
  assert.ok(nodes.some(node => node.type === 'pre' && node.children.includes('Activation diagnostic without a package run')));
  language = 'zh';
  const chinese = flatten(render());
  assert.ok(chinese.some(node => node.children.includes(dictionaries.zh.buildBlocked)));
  for (const key of ['native', 'extended', 'restoring', 'restored']) assert.ok(chinese.some(node => node.children.includes(dictionaries.zh[key])), key);
  assert.equal(registration.label(), '增强管理');
  assert.match(dictionaries.zh.buildBlocked, /官方插件管理器.*明确授权/);
  assert.match(dictionaries.en.buildBlocked, /explicitly approve.*official plugin manager/);
  language = 'en';
  nodes = flatten(render());
  await button('Update').props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(calls.shift())), { generation: 7, names: ['Alpha'] });
  nodes = flatten(render());
  assert.equal(filter('All plugins').props['aria-pressed'], true);
  const rowNames = tree => flatten(tree).filter(node => node.type === 'input' && node.props.type === 'checkbox' && node.props['aria-label'] !== 'Select visible updates').map(node => node.props['aria-label']);
  assert.deepEqual(initial.items.slice(0, 5).map(item => item.name), ['plugin-10', 'zeta', 'plugin-2', 'available', 'Alpha']);
  assert.deepEqual(headings(), ['Update available (5)', 'Updating (3)', 'Needs attention (5)', 'Updated (2)', 'Up to date (1)', 'Unavailable (1)']);
  assert.deepEqual(nodes.filter(node => node.type === 'table').map(rowNames), [
    ['Alpha', 'available', 'plugin-2', 'plugin-10', 'zeta'],
    ['installing', 'removing', 'restoring'],
    ['check-failed', 'failed', 'pending-builds', 'restored', 'stale'],
    ['restart-required', 'succeeded'],
    ['current'],
    ['protected'],
  ]);
  assert.ok(nodes.some(node => node.type === 'mark' && node.children.includes('Native support') && node.props.tone === 'neutral'));
  assert.ok(nodes.some(node => node.type === 'mark' && node.children.includes('Extended support')));
  assert.ok(nodes.some(node => node.children.includes('Update failed; previous version restored')));
  const restoredRow = nodes.find(node => node.type === 'tr' && flatten(node).some(child => child.props['aria-label'] === 'restored'));
  assert.ok(flatten(restoredRow).some(node => node.type === 'pre' && node.children.includes('Target install failed')));
  assert.ok(flatten(restoredRow).some(node => node.type === 'pre' && node.children.includes('Previous version restored')));
  assert.ok(flatten(restoredRow).some(node => node.children.includes('Restore details')));
  filter('Native support').props.onClick();
  nodes = flatten(render());
  assert.deepEqual(rowNames(render()), ['Alpha', 'restoring', 'restored']);
  filter('Update available').props.onClick();
  nodes = flatten(render());
  assert.deepEqual(rowNames(render()), ['Alpha']);
  filter('Extended support').props.onClick();
  nodes = flatten(render());
  assert.deepEqual(rowNames(render()), ['available', 'plugin-2', 'plugin-10', 'zeta']);
  filter('Unavailable').props.onClick();
  nodes = flatten(render());
  assert.ok(nodes.some(node => node.children.includes(dictionaries.en.noMatch)));
  button('Clear filters').props.onClick();
  nodes = flatten(render());
  filter('Unavailable').props.onClick();
  nodes = flatten(render());
  assert.deepEqual(rowNames(render()), ['protected']);
  filter('All support types').props.onClick();
  nodes = flatten(render());
  assert.equal(nodes.find(node => node.props['aria-label'] === 'protected').props.disabled, true);
  assert.equal(rowNames(render()).length, initial.items.length);
  filter('Update available').props.onClick();
  nodes = flatten(render());
  assert.deepEqual(rowNames(render()), ['Alpha', 'available', 'plugin-2', 'plugin-10', 'zeta']);
  search().props.onChange({ target: { value: 'plugin-' } });
  nodes = flatten(render());
  assert.deepEqual(rowNames(render()), ['plugin-2', 'plugin-10']);
  search().props.onChange({ target: { value: 'nothing-matches' } });
  nodes = flatten(render());
  assert.ok(nodes.some(node => node.children.includes(dictionaries.en.noMatch)));
  button('Clear filters').props.onClick();
  nodes = flatten(render());
  assert.equal(rowNames(render()).length, initial.items.length);
  nodes.find(node => node.type === 'input' && node.props['aria-label'] === 'Select visible updates').props.onChange({ target: { checked: true } });
  nodes = flatten(render());
  assert.equal(button('Update selected').props.disabled, false);
  await button('Update selected').props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ generation: 7, names: ['Alpha', 'available', 'plugin-2', 'plugin-10', 'zeta'] }]);
  nodes = flatten(render());
  assert.equal(filter('All plugins').props['aria-pressed'], true);
  filter('Update available').props.onClick();
  nodes = flatten(render());
  assert.ok(nodes.some(node => node.children.includes(dictionaries.en.noAvailable)));
  button('Clear filters').props.onClick();
  nodes = flatten(render());
  assert.deepEqual(headings(), [`Updated (${initial.items.length})`]);
  assert.ok(nodes.some(node => node.type === 'span' && node.children.includes('Updated')));
  for (const cleanup of effects) cleanup?.();
  for (const cleanup of resources.reverse()) await cleanup?.();
  assert.equal(unmounted, true);
  assert.equal(remote.pluginEnhance, undefined);
});

test('real Cordis and Client Remote allow the update tab to poll, check and unload', async () => {
  let plugin, Component, dictionaries;
  let tree;
  const effects = [];
  const calls = [];
  const snapshot = { generation: 0, items: [], marketErrors: [] };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(value => value !== null && value !== undefined && value !== false) }),
    useState: value => [value, () => {}],
    useRef: value => ({ current: value }),
    useSyncExternalStore() {},
    useEffect(callback) { effects.push(callback()); },
  };
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { plugin = value.factory(name => name === 'zod' ? zod : name === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : React); } } }, setTimeout: () => 0, clearTimeout() {} });
  const ctx = new Context();
  let mounted = false;
  ctx.provide('typert', { remotes: { register() { mounted = true; return () => { mounted = false; }; } } });
  ctx.provide('connection', {
    interactions: 'none',
    start: () => ({ stop() {} }),
    rpc: {
      open() {},
      async call(path, endpoint) { calls.push([path, endpoint]); return { ok: true, value: snapshot }; },
    },
  });
  ctx.provide('locale', {
    register(ns, dicts) { dictionaries = dicts; return () => {}; },
    bind: () => key => dictionaries.en[key], subscribe: () => () => {}, getSnapshot: () => ({}),
  });
  class Slots extends Service {
    constructor(ctx) { super(ctx, 'slots'); }
    inject(name, callback) { this.ctx.effect(callback); }
    register(options, component) { Component = component; return () => { Component = undefined; }; }
  }
  new Slots(ctx);
  const gateway = ctx.plugin(gatewayClient);
  await gateway;
  const client = ctx.plugin(plugin);
  try {
    await client;
    assert.equal(mounted, true);
    tree = Component();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, [['/api', 'pluginEnhance/status'], ['/api', 'pluginEnhance/check']]);
    const flatten = node => typeof node !== 'object' ? [] : [node, ...node.children.flatMap(flatten)];
    await flatten(tree).find(node => node.type === 'button' && node.children.includes('Check for updates')).props.onClick();
    assert.deepEqual(calls.at(-1), ['/api', 'pluginEnhance/check']);
  } finally {
    for (const cleanup of effects) cleanup?.();
    await client.dispose();
    await gateway.dispose();
  }
  assert.equal(Component, undefined);
  assert.equal(mounted, false);
  assert.equal(ctx.get('remote.pluginEnhance'), undefined);
});

test('failed Remote mounting rejects activation before registering the update tab', async () => {
  let plugin;
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { plugin = value.factory(name => {
    if (name === 'zod') return zod;
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
    assert.equal(name, 'react');
    return { createElement() {} };
  }); } } } });
  const failure = new Error('remote mount failed');
  await assert.rejects(plugin.apply({
    remote: { async $mount() { throw failure; } },
    effect() { assert.fail('no effects before Remote is ready'); },
    slots: { inject() { assert.fail('no tab before Remote is ready'); } },
  }), error => error === failure);
});

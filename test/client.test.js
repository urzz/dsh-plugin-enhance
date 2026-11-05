import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as zod from 'zod';
import { Context, Service } from '@deepseek-ai/cordis';
import * as gatewayClient from '@deepseek-ai/dsh-api-gateway/client';

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');

test('update tab registers localized UI, selects only ready bundles and forwards checked generation', async () => {
  let plugin, Component, dictionaries, registration;
  let cursor = 0;
  const states = [];
  const effects = [];
  const calls = [];
  const initial = { generation: 7, checkedAt: 123, busy: false, items: [
    ...['plugin-10', 'zeta', 'plugin-2', 'available', 'Alpha'].map(name => ({ name, currentVersion: '1.0.0', state: 'ready', source: `${name}@1`, enabled: true, target: { version: '2.0.0' } })),
    { name: 'protected', currentVersion: '1.0.0', state: 'blocked', source: 'file:../local', enabled: false, reason: 'not-removable' },
    ...['current', 'check-failed', 'failed', 'pending-builds', 'stale', 'removing', 'installing', 'succeeded', 'restart-required'].map(state => ({ name: state, state, currentVersion: '1.0.0', source: `${state}@1`, enabled: true })),
  ], marketErrors: [] };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(value => value !== null && value !== undefined && value !== false) }),
    useState(value) { const index = cursor++; if (!(index in states)) states[index] = value; return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; },
    useRef(value) { return React.useState({ current: value })[0]; },
    useSyncExternalStore: () => {},
    useEffect(callback) { const index = cursor++; if (!(index in states)) { states[index] = true; effects.push(callback()); } },
  };
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { plugin = value.factory(name => { if (name === 'zod') return zod; assert.equal(name, 'react'); return React; }); } } }, setTimeout: () => 0, clearTimeout() {} });
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
    locale: { register(ns, dicts) { assert.equal(ns, 'dsh-plugin-enhance'); dictionaries = dicts; return () => {}; }, bind: () => key => dictionaries.en[key], subscribe: () => () => {}, getSnapshot: () => ({ revision: 1 }) },
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
  assert.equal(registration.label(), 'Updates');
  assert.ok(dictionaries.zh.tab);
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
  await button('Update').props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(calls.shift())), { generation: 7, names: ['Alpha'] });
  nodes = flatten(render());
  assert.equal(filter('All plugins').props['aria-pressed'], true);
  const rowNames = tree => flatten(tree).filter(node => node.type === 'input' && node.props.type === 'checkbox' && node.props['aria-label'] !== 'Select visible updates').map(node => node.props['aria-label']);
  assert.deepEqual(initial.items.slice(0, 5).map(item => item.name), ['plugin-10', 'zeta', 'plugin-2', 'available', 'Alpha']);
  assert.deepEqual(headings(), ['Update available (5)', 'Updating (2)', 'Needs attention (4)', 'Updated (2)', 'Up to date (1)', 'Unavailable (1)']);
  assert.deepEqual(nodes.filter(node => node.type === 'table').map(rowNames), [
    ['Alpha', 'available', 'plugin-2', 'plugin-10', 'zeta'],
    ['installing', 'removing'],
    ['check-failed', 'failed', 'pending-builds', 'stale'],
    ['restart-required', 'succeeded'],
    ['current'],
    ['protected'],
  ]);
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
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { plugin = value.factory(name => name === 'zod' ? zod : React); } } }, setTimeout: () => 0, clearTimeout() {} });
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

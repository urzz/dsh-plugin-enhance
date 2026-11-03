import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');

test('update tab registers localized UI, selects only ready bundles and forwards checked generation', async () => {
  let plugin, Component, dictionaries, registration;
  let cursor = 0;
  const states = [];
  const effects = [];
  const calls = [];
  const initial = { generation: 7, checkedAt: 123, busy: false, items: [
    { name: 'available', currentVersion: '1.0.0', state: 'ready', source: 'available@1', enabled: true, target: { version: '2.0.0' } },
    { name: 'protected', currentVersion: '1.0.0', state: 'blocked', source: 'file:../local', enabled: false, reason: 'not-removable' },
  ], marketErrors: [] };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(value => value !== null && value !== undefined && value !== false) }),
    useState(value) { const index = cursor++; if (!(index in states)) states[index] = value; return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; },
    useRef(value) { return React.useState({ current: value })[0]; },
    useSyncExternalStore: () => {},
    useEffect(callback) { const index = cursor++; if (!(index in states)) { states[index] = true; effects.push(callback()); } },
  };
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { plugin = value.factory(name => { assert.equal(name, 'react'); return React; }); } } }, setTimeout: () => 0, clearTimeout() {} });
  plugin.apply({
    effect(callback) { callback(); },
    locale: { register(ns, dicts) { assert.equal(ns, 'dsh-plugin-enhance'); dictionaries = dicts; return () => {}; }, bind: () => key => dictionaries.en[key], subscribe: () => () => {}, getSnapshot: () => ({ revision: 1 }) },
    slots: { inject(name, callback) { assert.equal(name, 'plugins.tab'); callback(); }, register(options, component) { registration = options; Component = component; return () => {}; } },
    remote: { pluginEnhance: {
      status: async () => ({ ok: true, value: initial }),
      start: async input => { calls.push(input); return { ok: true, value: { ...initial, items: initial.items.map(item => ({ ...item, state: 'succeeded' })) } }; },
    } },
  });
  assert.equal(registration.label(), 'Updates');
  assert.ok(dictionaries.zh.tab);
  const render = () => { cursor = 0; return Component(); };
  const flatten = node => typeof node !== 'object' ? [] : [node, ...node.children.flatMap(flatten)];
  render();
  await new Promise(resolve => setImmediate(resolve));
  let nodes = flatten(render());
  const button = text => nodes.find(node => node.type === 'button' && node.children.includes(text));
  assert.equal(button('Update selected').props.disabled, true);
  assert.equal(nodes.find(node => node.props['aria-label'] === 'protected').props.disabled, true);
  button('Select all available').props.onClick();
  nodes = flatten(render());
  assert.equal(button('Update selected').props.disabled, false);
  await button('Update selected').props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ generation: 7, names: ['available'] }]);
  nodes = flatten(render());
  assert.ok(nodes.some(node => node.type === 'td' && node.children.includes('Updated')));
  for (const cleanup of effects) cleanup?.();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: [new URL('../workspace-archive/workspace-client.js', import.meta.url).pathname], bundle: true, write: false, platform: 'browser', format: 'cjs', external: ['react', '@deepseek-ai/dsh-client-ui-primitives'] });
function harness() {
  let Component, menu, dictionaries, language = 'en';
  const disposers = [], calls = [], subscriptions = new Set();
  let list = { items: [{ workspaceId: 'w', sessionIds: ['a', 'b', 'c', 'old'] }, { workspaceId: 'other', sessionIds: ['outside'] }], archivedSessionIds: ['old'] };
  const store = getSnapshot => ({ getSnapshot, subscribe(fn) { subscriptions.add(fn); return () => subscriptions.delete(fn); } });
  const effects = [];
  const React = { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(x => x != null && x !== false) }), useSyncExternalStore(subscribe, getSnapshot) { effects.push(subscribe(() => {})); return getSnapshot(); } };
  const module = { exports: {} };
  vm.runInNewContext(outputFiles[0].text, { module, exports: module.exports, require: name => name === 'react' ? React : { Button: 'button', Checkbox: 'checkbox', Modal: 'modal' }, Error });
  const permissions = new Set(['a', 'b', 'c', 'old']);
  let implementation = async () => {};
  const ctx = {
    effect(fn) { disposers.push(fn()); },
    locale: { ...store(() => language), bind: () => key => dictionaries[language][key], register(ns, dicts) { dictionaries = dicts; return () => {}; } },
    slots: { inject(name, fn) { assert.equal(name, 'shell.overlay'); disposers.push(fn()); }, register(options, component) { Component = component; return () => { Component = null; }; } },
    contextMenus: { register(value) { menu = value; return () => { menu = null; }; } },
    workspaces: { list: store(() => list), async archiveSession(...args) { calls.push(args); return implementation(args[0]); } },
    sessions: { list: store(() => ({ byId: Object.fromEntries(['a', 'b', 'c', 'old'].map(id => [id, { displayTitle: id }])) })) },
    remoteAccess: { source(resource, id, action) { assert.equal(resource, 'session'); assert.equal(action, 'workspace/archiveSession'); return store(() => permissions.has(id)); } },
  };
  module.exports.registerWorkspaceArchive(ctx);
  const flatten = node => !node || typeof node !== 'object' ? [] : [node, ...node.children.flatMap(flatten), ...(node.props.footer ? flatten(node.props.footer) : [])];
  const render = () => { effects.splice(0).forEach(fn => fn()); return flatten(Component()); };
  const button = label => render().find(n => n.type === 'button' && n.children.includes(label));
  const checkbox = label => render().find(n => n.type === 'checkbox' && n.props.label === label);
  return { ctx, calls, render, button, checkbox, permissions, get menu() { return menu; }, get dictionaries() { return dictionaries; }, get list() { return list; }, set implementation(fn) { implementation = fn; }, open() { menu.resolve({ workspaceId: 'w', displayTitle: 'Workspace' })[0].run(); }, language(value) { language = value; }, dispose() { effects.splice(0).forEach(fn => fn()); disposers.reverse().forEach(fn => fn?.()); }, subscriptions };
}

test('workspace menu, multilingual selection, partial failure, explicit retry, and native one-argument calls', async () => {
  const ui = harness();
  assert.equal(ui.menu.target, 'workspace');
  const action = ui.menu.resolve({ workspaceId: 'w', displayTitle: 'Workspace' })[0];
  assert.equal(action.id, 'archive-batch');
  assert.equal(action.icon.key, 'workspace.archive');
  assert.equal(ui.menu.resolve({ workspaceId: 'missing' }).length, 0);
  ui.open();
  assert.equal(ui.checkbox('old').props.disabled, true);
  assert.equal(ui.checkbox('outside'), undefined);
  assert.equal(ui.button('Select failed sessions'), undefined);
  assert.equal(ui.render().some(n => n.type === 'input'), false);
  ui.checkbox('a').props.onChange(true);
  ui.checkbox('c').props.onChange(true);
  assert.ok(ui.render().some(n => n.children.includes('Selected: 2')));
  ui.checkbox('Select all selectable sessions').props.onChange(true);
  let fail = true;
  ui.implementation = async id => { if (id === 'b' && fail) throw new Error('workspace/session-active: running agent'); };
  await ui.button('Archive selected').props.onClick();
  assert.deepEqual(ui.calls, [['a'], ['b'], ['c']]);
  assert.ok(ui.render().some(n => n.children.includes('workspace/session-active: running agent')));
  assert.equal(ui.checkbox('a').props.disabled, true);
  ui.button('Select failed sessions').props.onClick();
  assert.equal(ui.checkbox('b').props.checked, true);
  assert.ok(ui.render().some(n => n.children.includes('Selected: 1')));
  fail = false;
  await ui.button('Archive selected').props.onClick();
  assert.deepEqual(ui.calls, [['a'], ['b'], ['c'], ['b']]);
  assert.equal(ui.button('Select failed sessions'), undefined);
  ui.language('zh');
  assert.ok(ui.checkbox('全选可选会话'));
  assert.equal(ui.render().find(n => n.type === 'modal').props.title, '批量归档会话');
  assert.deepEqual(Object.keys(ui.dictionaries.en), Object.keys(ui.dictionaries.zh));
  ui.dispose();
  assert.equal(ui.subscriptions.size, 0);
});

test('in-flight batch blocks repeated clicks and close; rechecks membership, archives and permissions per item', async () => {
  const ui = harness(); ui.open();
  ui.checkbox('Select all selectable sessions').props.onChange(true);
  let resolve;
  ui.implementation = () => new Promise(done => { resolve = done; });
  const click = ui.button('Archive selected').props.onClick;
  const running = click();
  await click();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.checkbox('a').props.disabled, true);
  assert.equal(ui.checkbox('Select all selectable sessions').props.disabled, true);
  ui.checkbox('a').props.onChange(true);
  ui.checkbox('Select all selectable sessions').props.onChange(true);
  assert.ok(ui.render().some(n => n.children.includes('Selected: 0')));
  ui.render().find(n => n.type === 'modal').props.onClose();
  assert.ok(ui.render().find(n => n.type === 'modal'));
  ui.list.items[0].sessionIds = ['a', 'c', 'old'];
  ui.list.archivedSessionIds.push('c');
  resolve(); await running;
  assert.deepEqual(ui.calls, [['a']]);
  assert.ok(ui.render().some(n => n.children.includes('Session is no longer in this workspace.')));
  assert.ok(ui.render().some(n => n.children.includes('Already archived')));
  ui.dispose();
});

test('permission revocation is checked before queued commands and unloading stops remaining commands', async () => {
  for (const unload of [false, true]) {
    const ui = harness(); ui.open();
    ui.checkbox('Select all selectable sessions').props.onChange(true);
    let resolve;
    ui.implementation = () => new Promise(done => { resolve = done; });
    const running = ui.button('Archive selected').props.onClick();
    if (unload) ui.dispose();
    else { ui.permissions.delete('b'); ui.permissions.delete('c'); }
    resolve(); await running;
    assert.deepEqual(ui.calls, [['a']]);
    if (!unload) { assert.ok(ui.render().some(n => n.children.includes('Archive permission is unavailable.'))); ui.dispose(); }
    assert.equal(ui.subscriptions.size, 0);
  }
});


test('boolean Checkbox changes support deselection, select-all reset and live permission counts', () => {
  const ui = harness(); ui.open();
  ui.checkbox('a').props.onChange(true);
  ui.checkbox('b').props.onChange(true);
  ui.checkbox('a').props.onChange(false);
  assert.equal(ui.checkbox('a').props.checked, false);
  assert.equal(ui.checkbox('b').props.checked, true);
  assert.ok(ui.render().some(n => n.children.includes('Selected: 1')));
  ui.checkbox('Select all selectable sessions').props.onChange(true);
  ui.permissions.delete('b');
  assert.equal(ui.checkbox('b').props.disabled, true);
  assert.equal(ui.checkbox('b').props.checked, false);
  assert.ok(ui.render().some(n => n.children.includes('Selected: 2')));
  assert.equal(ui.checkbox('Select all selectable sessions').props.checked, true);
  ui.checkbox('Select all selectable sessions').props.onChange(false);
  assert.ok(ui.render().some(n => n.children.includes('Selected: 0')));
  assert.equal(ui.button('Archive selected').props.disabled, true);
  ui.button('Close').props.onClick();
  assert.equal(ui.render().length, 0);
  ui.dispose();
});

test('retry selects only failures still available and preserves native error text', async () => {
  const ui = harness(); ui.open();
  ui.checkbox('Select all selectable sessions').props.onChange(true);
  const message = 'active session\n' + 'long-error-'.repeat(100);
  ui.implementation = async id => { if (id !== 'c') throw new Error(message); };
  await ui.button('Archive selected').props.onClick();
  ui.permissions.delete('a');
  ui.button('Select failed sessions').props.onClick();
  assert.equal(ui.checkbox('a').props.checked, false);
  assert.equal(ui.checkbox('b').props.checked, true);
  assert.equal(ui.checkbox('c').props.checked, false);
  assert.ok(ui.render().some(n => n.children.includes(message)));
  ui.permissions.delete('b');
  assert.equal(ui.button('Select failed sessions').props.disabled, true);
  ui.dispose();
});

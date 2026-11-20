import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { Context, Service } from '@deepseek-ai/cordis';
import { Loader } from '@deepseek-ai/cordis-plugin-loader';

const { outputFiles } = await build({ entryPoints: [new URL('../workspace-archive/client.source.js', import.meta.url).pathname], bundle: true, write: false, platform: 'browser', format: 'cjs', external: ['react'] });
function harness({ cordis = false } = {}) {
  let Component, menu, dictionaries, language = 'en';
  const disposers = [], calls = [], renderSubscriptions = [];
  const subscriptions = new Set(), accessWatchers = new Map();
  const list = { items: [{ workspaceId: 'w', sessionIds: ['a', 'b', 'c', 'old'] }, { workspaceId: 'other', sessionIds: ['outside'] }], archivedSessionIds: ['old'] };
  const sessions = { byId: Object.fromEntries(['a', 'b', 'c', 'old', 'outside'].map(id => [id, { displayTitle: id, running: false }])) };
  const store = getSnapshot => ({ getSnapshot, subscribe(fn) { subscriptions.add(fn); return () => subscriptions.delete(fn); } });
  const permissions = new Set(['a', 'b', 'c', 'old']);
  let implementation = async () => {};
  const dialog = { open: false, showModal() { assert.equal(this.open, false); this.open = true; }, close() { this.open = false; } };
  const ref = { current: dialog };
  let effectRequest, effectCleanup, pendingEffect;
  const unmount = () => { renderSubscriptions.splice(0).forEach(fn => fn()); effectCleanup?.(); effectCleanup = undefined; effectRequest = undefined; };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(x => x != null && x !== false) }),
    useSyncExternalStore(subscribe, getSnapshot) { renderSubscriptions.push(subscribe(() => {})); return getSnapshot(); },
    useRef: () => ref,
    useEffect(fn, [request]) { if (request !== effectRequest) { effectCleanup?.(); effectCleanup = undefined; effectRequest = request; pendingEffect = fn; } },
  };
  const module = { exports: {} };
  vm.runInNewContext(outputFiles[0].text, { module, exports: module.exports, require: name => { assert.equal(name, 'react'); return React; }, Error });
  const services = {
    locale: { ...store(() => language), bind: () => key => dictionaries[language][key], register(ns, dicts) { assert.equal(ns, 'dsh-plugin-enhance.workspace'); dictionaries = dicts; return () => { dictionaries = null; }; } },
    slots: { inject(name, fn) { assert.equal(name, 'shell.overlay'); ctx.effect(fn); }, register(options, component) { assert.equal(Component, undefined); Component = component; return () => { Component = undefined; unmount(); }; } },
    contextMenus: { register(value) { assert.equal(menu, undefined); menu = value; return () => { menu = undefined; }; } },
    workspaces: { list: store(() => list), async archiveSession(...args) { calls.push(args); return implementation(args[0]); } },
    sessions: { list: store(() => sessions) },
    uiSession: { whenAccess(id, action, callback) {
      assert.equal(action, 'workspace/archiveSession');
      assert.equal(accessWatchers.has(id), false);
      let detach;
      const refresh = () => { if (permissions.has(id)) detach ??= callback(); else { detach?.(); detach = undefined; } };
      accessWatchers.set(id, refresh); refresh();
      return () => { detach?.(); detach = undefined; accessWatchers.delete(id); };
    } },
  };
  const ctx = cordis ? new Context() : { effect(fn) { disposers.push(fn()); } };
  if (cordis) {
    for (const [key, value] of Object.entries(services)) if (key !== 'slots') ctx.provide(key, value);
    class Slots extends Service {
      constructor(ctx) { super(ctx, 'slots'); }
      inject(_, callback) { this.ctx.effect(callback); }
      register(...args) { return services.slots.register(...args); }
    }
    new Slots(ctx);
  } else { Object.assign(ctx, services); module.exports.apply(ctx); }
  const flatten = node => !node || typeof node !== 'object' ? [] : [node, ...node.children.flatMap(flatten)];
  const render = () => {
    renderSubscriptions.splice(0).forEach(fn => fn());
    const tree = Component ? flatten(Component()) : [];
    if (pendingEffect) { const run = pendingEffect; pendingEffect = undefined; effectCleanup = run(); }
    return tree;
  };
  const button = label => render().find(n => n.type === 'button' && n.children.includes(label));
  const checkbox = label => render().find(n => n.type === 'input' && n.props['aria-label'] === label);
  return {
    ctx, client: module.exports, calls, render, button, checkbox, permissions, list, sessions, dialog, subscriptions, accessWatchers,
    get menu() { return menu; }, get dictionaries() { return dictionaries; },
    set implementation(fn) { implementation = fn; },
    notify() { for (const listener of [...subscriptions]) listener(); },
    permission(id, value) { value ? permissions.add(id) : permissions.delete(id); accessWatchers.get(id)?.(); },
    open(id = 'w') { menu.resolve({ workspaceId: id, displayTitle: 'Workspace' })[0].run(); },
    select(label, checked = true) { checkbox(label).props.onChange({ target: { checked } }); },
    language(value) { language = value; },
    dispose() { unmount(); disposers.reverse().forEach(fn => fn?.()); },
  };
}

const all = 'Select all selectable sessions';
const archive = 'Archive selected';

test('workspace menu, explicit selection, bilingual results and individual retry use native one-argument calls', async () => {
  const ui = harness();
  assert.equal(ui.menu.target, 'workspace');
  assert.equal(ui.menu.order, 200);
  const action = ui.menu.resolve({ workspaceId: 'w', displayTitle: 'Workspace' })[0];
  assert.equal(action.id, 'archive-batch');
  assert.equal(action.icon.key, 'workspace.archive');
  assert.equal(ui.menu.resolve({ workspaceId: 'missing' }).length, 0);
  assert.equal(ui.menu.resolve({ workspaceId: 'other' }).length, 0);
  ui.open();
  assert.equal(ui.button(archive).props.disabled, true);
  assert.equal(ui.checkbox('old').props.disabled, true);
  ui.select('a'); ui.select('b');
  ui.implementation = async id => { if (id === 'b') throw new Error('workspace/session-active: scheduled work is running'); };
  await ui.button(archive).props.onClick();
  assert.deepEqual(ui.calls, [['a'], ['b']]);
  assert.equal(ui.checkbox('a').props.disabled, true);
  assert.equal(ui.checkbox('c').props.checked, false);
  assert.ok(ui.render().some(n => n.children.includes('workspace/session-active: scheduled work is running')));
  ui.button('Select failed sessions').props.onClick();
  assert.equal(ui.checkbox('b').props.checked, true);
  assert.equal(ui.checkbox('c').props.checked, false);
  ui.implementation = async () => {};
  await ui.button(archive).props.onClick();
  assert.deepEqual(ui.calls, [['a'], ['b'], ['b']]);
  ui.language('zh');
  assert.ok(ui.render().some(n => n.children.includes('批量归档会话')));
  assert.ok(ui.render().some(n => n.children.includes('已归档')));
  ui.dispose();
  assert.equal(ui.subscriptions.size, 0);
  assert.equal(ui.accessWatchers.size, 0);
});

test('running, unknown and unauthorized sessions are disabled, and activity is rechecked between requests', async () => {
  const ui = harness();
  ui.sessions.byId.c.running = true;
  ui.permission('old', false);
  ui.open();
  assert.equal(ui.checkbox('c').props.disabled, true);
  ui.select(all);
  ui.implementation = async () => { ui.sessions.byId.b.running = true; };
  await ui.button(archive).props.onClick();
  assert.deepEqual(ui.calls, [['a']]);
  assert.ok(ui.render().some(n => n.children.includes('Session is running. Try again after its work finishes.')));
  assert.equal(ui.button('Select failed sessions').props.disabled, true);
  ui.sessions.byId.b.running = false;
  ui.button('Select failed sessions').props.onClick();
  assert.equal(ui.checkbox('b').props.checked, true);
  ui.permission('b', false);
  assert.equal(ui.checkbox('b').props.disabled, true);
  assert.equal(ui.button(archive).props.disabled, true);
  delete ui.sessions.byId.c;
  assert.equal(ui.checkbox('c').props.disabled, true);
  ui.dispose();
});

test('permission revocation, membership removal and concurrent archive are rechecked per selected item', async () => {
  for (const change of ['denied', 'removed', 'archived', 'missing-status']) {
    const ui = harness(); ui.open(); ui.select(all);
    ui.implementation = async id => {
      if (id !== 'a') return;
      if (change === 'denied') ui.permission('b', false);
      if (change === 'removed') { ui.list.items[0].sessionIds = ['a', 'c', 'old']; ui.notify(); }
      if (change === 'archived') ui.list.archivedSessionIds.push('b');
      if (change === 'missing-status') delete ui.sessions.byId.b;
    };
    await ui.button(archive).props.onClick();
    assert.deepEqual(ui.calls, [['a'], ['c']], change);
    const message = { denied: 'Archive permission is unavailable.', removed: 'Session is no longer in this workspace.', archived: 'Already archived', 'missing-status': 'Session status is unavailable.' }[change];
    assert.ok(ui.render().some(n => n.children.includes(message)), change);
    ui.dispose();
  }
});

test('dialog stays open and ignores duplicate submission or Escape during a batch', async () => {
  const ui = harness(); ui.open(); ui.select(all);
  let finish;
  ui.implementation = () => new Promise(resolve => { finish = resolve; });
  const submit = ui.button(archive).props.onClick;
  const pending = submit();
  assert.equal(ui.dialog.open, true);
  assert.equal(ui.button('Archiving…').props.disabled, true);
  await submit();
  assert.deepEqual(ui.calls, [['a']]);
  const cancel = ui.render().find(n => n.type === 'dialog').props.onCancel;
  let prevented = false;
  cancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(ui.dialog.open, true);
  ui.implementation = async () => {};
  finish(); await pending;
  ui.render().find(n => n.type === 'dialog').props.onCancel({ preventDefault() {} });
  assert.equal(ui.render().length, 0);
  assert.equal(ui.dialog.open, false);
  ui.dispose();
});

test('workspace removal retains failed selected results and isolates the other workspace', async () => {
  const ui = harness(); ui.open(); ui.select(all);
  ui.implementation = async () => { ui.list.items.splice(0, 1); ui.notify(); };
  await ui.button(archive).props.onClick();
  assert.deepEqual(ui.calls, [['a']]);
  assert.ok(ui.render().some(n => n.children.includes('Workspace is no longer available.')));
  assert.ok(ui.render().some(n => n.children.includes('Session is no longer in this workspace.')));
  assert.equal(ui.list.items[0].workspaceId, 'other');
  ui.dispose();
});

test('native Cordis disable removes archive resources, stops queued work and reenable mounts once without updater', async () => {
  const ui = harness({ cordis: true });
  const loaderFiber = ui.ctx.plugin(Loader, { baseUrl: new URL('../package.json', import.meta.url).href });
  await loaderFiber.await();
  ui.ctx.loader.builtins.archive = ui.client;
  try {
    await ui.ctx.loader.root.update([{ id: 'archive', name: 'cordis:archive', config: {} }]);
    await ui.ctx.loader.await();
    ui.open(); ui.select(all);
    let finish;
    ui.implementation = () => new Promise(resolve => { finish = resolve; });
    const pending = ui.button(archive).props.onClick();
    assert.deepEqual(ui.calls, [['a']]);
    await ui.ctx.loader.update('archive', { disabled: true });
    await ui.ctx.loader.await();
    assert.equal(ui.menu, undefined);
    assert.equal(ui.dictionaries, null);
    assert.equal(ui.dialog.open, false);
    assert.equal(ui.subscriptions.size, 0);
    assert.equal(ui.accessWatchers.size, 0);
    finish(); await pending;
    assert.deepEqual(ui.calls, [['a']], 'unload cannot undo the current request but never sends the next one');
    await ui.ctx.loader.update('archive', { disabled: false });
    await ui.ctx.loader.await();
    ui.open();
    assert.equal(ui.button(archive).props.disabled, true, 'a fresh component has no stale selections');
    assert.equal(ui.ctx.get('remote.pluginEnhance'), undefined, 'archive mounts without the updater Remote');
  } finally {
    await ui.ctx.loader.root.update([]);
    await ui.ctx.loader.await();
    await loaderFiber.dispose();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { Context, Service } from '@deepseek-ai/cordis';
import { Loader } from '@deepseek-ai/cordis-plugin-loader';
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot';

const root = new URL('../', import.meta.url);
const { outputFiles } = await build({ entryPoints: [new URL('workspace-archive/client.source.js', root).pathname], bundle: true, write: false, platform: 'browser', format: 'cjs', external: ['react', '@deepseek-ai/dsh-client-ui-primitives'] });
const module = { exports: {} };
vm.runInNewContext(outputFiles[0].text, { module, exports: module.exports, require(name) {
  if (name === 'react') return { createElement: (type, props, ...children) => ({ type, props, children }), useSyncExternalStore: (_, snapshot) => snapshot() };
  return { Modal: 'modal', Button: 'button', Checkbox: 'checkbox' };
} });
const plugin = module.exports;

test('bundle patch resolves an independently managed archive Host package', async () => {
  const patches = loadOverlayPatches('test', new URL('cordis.patch.yml', root).pathname);
  const rows = patches.flatMap(p => p.insert ?? []);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].id, 'dsh-plugin-enhance-workspace-archive');
  assert.equal(rows[1].name, 'dsh-plugin-enhance-workspace-archive');
  assert.equal(typeof (await import(rows[1].name)).apply, 'function');
});

test('real Loader disable removes archive resources, stops queued requests and re-enables once without update Remote', async () => {
  const ctx = new Context();
  const menus = new Set(), overlays = new Set(), dictionaries = new Set();
  let resolveRequest;
  const requests = [];
  const list = { getSnapshot: () => ({ items: [{ workspaceId: 'w', sessionIds: ['a', 'b'] }], archivedSessionIds: [] }), subscribe: () => () => {} };
  ctx.provide('locale', { register(_, value) { dictionaries.add(value); return () => dictionaries.delete(value); }, bind: () => key => key, getSnapshot: () => ({}) });
  ctx.provide('contextMenus', { register(menu) { menus.add(menu); return () => menus.delete(menu); } });
  ctx.provide('workspaces', { list, archiveSession(id) { requests.push(id); return new Promise(resolve => { resolveRequest = resolve; }); } });
  ctx.provide('sessions', { list: { getSnapshot: () => ({ byId: {} }) } });
  ctx.provide('remoteAccess', { source: () => ({ getSnapshot: () => true }) });
  class Slots extends Service {
    constructor(ctx) { super(ctx, 'slots'); }
    inject(_, callback) { this.ctx.effect(callback); }
    register(_, component) { overlays.add(component); return () => overlays.delete(component); }
  }
  new Slots(ctx);
  await ctx.plugin(Loader, { baseUrl: root.href });
  const loader = ctx.loader;
  loader.builtins.archive = plugin;
  const id = await loader.create({ id: 'dsh-plugin-enhance-workspace-archive', name: 'cordis:archive', config: {} });
  await loader.await();
  const entry = loader.resolve(id);
  try {
    assert.equal(menus.size, 1); assert.equal(overlays.size, 1); assert.equal(dictionaries.size, 1);
    menus.values().next().value.resolve({ workspaceId: 'w', displayTitle: 'Workspace' })[0].run();
    const overlay = overlays.values().next().value;
    const flatten = node => node && typeof node === 'object' ? [node, ...(node.children ?? []).flat(Infinity).flatMap(flatten)] : [];
    flatten(overlay()).find(n => n.type === 'checkbox' && n.props.label === 'all').props.onChange(true);
    const request = flatten(overlay().props.footer).find(n => n.props?.variant === 'primary').props.onClick();
    assert.deepEqual(requests, ['a']);
    await entry.update({ disabled: true }); await loader.await();
    assert.equal(menus.size, 0); assert.equal(overlays.size, 0); assert.equal(dictionaries.size, 0);
    resolveRequest(); await request;
    assert.deepEqual(requests, ['a']);
    await entry.update({ disabled: false }); await loader.await();
    assert.equal(menus.size, 1); assert.equal(overlays.size, 1); assert.equal(dictionaries.size, 1);
    assert.equal(overlays.values().next().value(), null);
  } finally {
    await entry.update({ disabled: true }); await loader.await();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
import { Loader } from '@deepseek-ai/cordis-plugin-loader';
import { ToolsService } from '@deepseek-ai/dsh-tools';
import { parse } from 'yaml';

test('bundle keeps the updater and archive row IDs and registers only the updater tool', async () => {
  const ctx = new Context();
  ctx.provide('systemPrompt', { tools() {} });
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'danger-full-access' }) });
  ctx.provide('pluginManager', { listBundles: async () => [] });
  ctx.provide('pluginMarket', { listIndexes: async () => [] });
  ctx.provide('profileContext', { dir: '/unused-profile' });
  const tools = ctx.plugin(ToolsService);
  const loaderFiber = ctx.plugin(Loader, { baseUrl: new URL('../package.json', import.meta.url).href });
  await Promise.all([tools.await(), loaderFiber.await()]);
  try {
    const patch = parse(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'));
    await ctx.loader.root.update(patch[0].insert);
    await ctx.loader.await();
    assert.deepEqual([...ctx.loader.entries()].map(entry => ({
      id: entry.options.id, name: entry.options.name,
    })), [
      { id: 'dsh-plugin-enhance', name: 'dsh-plugin-enhance' },
      { id: 'dsh-plugin-enhance-workspace-archive', name: 'dsh-plugin-enhance-workspace-archive' },
    ]);
    assert.deepEqual(ctx.tools.schemas().map(tool => tool.name), ['plugin_enhance']);
    assert.equal(ctx.get('sessionQuery'), undefined, 'the management bundle no longer mounts a query backend');
    const result = JSON.parse(await ctx.tools.get('plugin_enhance').execute({ action: 'check' }, {
      callId: 'bundle-call', signal: new AbortController().signal,
    }));
    assert.equal(result.generation, 1);
    assert.deepEqual(result.items, []);

    await ctx.loader.update('dsh-plugin-enhance-workspace-archive', { disabled: true });
    await ctx.loader.await();
    assert.ok(ctx.tools.get('plugin_enhance'), 'disabling archive leaves the updater active');
    await ctx.loader.update('dsh-plugin-enhance-workspace-archive', { disabled: false });
    await ctx.loader.await();
    const updaterFiber = ctx.loader.resolve('dsh-plugin-enhance').fiber;
    await ctx.loader.root.update([]);
    await ctx.loader.await();
    await updaterFiber.await(); // Removed entries are no longer tracked by loader.await().
    assert.equal(ctx.tools.get('plugin_enhance'), undefined);
  } finally {
    await loaderFiber.dispose();
    await tools.dispose();
  }
});

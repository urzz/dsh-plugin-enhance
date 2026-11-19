import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
import { Loader, Group } from '@deepseek-ai/cordis-plugin-loader';
import { SessionStore } from '@deepseek-ai/dsh-session';
import SqliteSessionQuery from '@deepseek-ai/dsh-session-query-sqlite';
import { ToolsService } from '@deepseek-ai/dsh-tools';
import { parse } from 'yaml';

test('bundle loads an isolated native query backend and unloads its registered tool', async () => {
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
    await ctx.loader.root.update([]);
    await ctx.loader.await();
    assert.equal(ctx.tools.get('session_query_enhance'), undefined);
    assert.equal(ctx.tools.get('plugin_enhance'), undefined);
    assert.equal(ctx.sessionQuery.config.openAt, 'never');
  } finally {
    await loaderFiber.dispose();
    await nativeQuery.dispose();
    await tools.dispose();
    await sessions.dispose();
  }
});

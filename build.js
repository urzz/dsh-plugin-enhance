import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';

const components = [
  ['dsh-plugin-enhance-updates', 'plugin-updates/client.source.js', 'plugin-updates/client.js'],
  ['dsh-plugin-enhance-workspace-archive', 'workspace-archive/client.source.js', 'workspace-archive/client.js'],
  // Preserve the original public client export and loader identity.
  ['dsh-plugin-enhance', 'plugin-updates/client.source.js', 'client.js'],
];
await Promise.all(components.map(([id, entry, outfile]) => build({
  entryPoints: [entry], outfile, bundle: true, preserveSymlinks: true,
  platform: 'browser', format: 'cjs',
  external: ['react', 'zod', '@deepseek-ai/dsh-client-ui-primitives'],
  banner: { js: `window.__ModuleLoader__.load({id:'${id}',factory(require){const module={exports:{}};` },
  footer: { js: 'return module.exports;}});' },
})));
for (const file of [
  'index.js', 'typert.host.js', 'typert.remote-client.js',
  'plugin-updates/index.js', 'plugin-updates/engine.js', 'plugin-updates/github.js',
  'plugin-updates/typert.host.js', 'plugin-updates/typert.remote-client.js',
  'workspace-archive/index.js', ...components.map(([, , outfile]) => outfile),
]) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });

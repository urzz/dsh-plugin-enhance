import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import * as zod from 'zod';
import { Context } from '@deepseek-ai/cordis';
import { composeEntries, createRuntimeResolution, loadOverlayPatches, PluginPackages, readPluginMeta, resolvePluginResource } from '@deepseek-ai/dsh-app-boot';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundleName = 'dsh-plugin-enhance';
const components = ['dsh-plugin-enhance-updates', 'dsh-plugin-enhance-workspace-archive'];
const metadata = {
  [bundleName]: {
    title: { en: 'DSH Enhance', zh: 'DSH 增强' },
    description: { en: 'Manage plugin updates and archive workspace sessions in bulk.', zh: '提供插件更新管理与工作区会话批量归档。' },
  },
  [components[0]]: {
    title: { en: 'Plugin Updates', zh: '插件更新' },
    description: { en: 'Check for plugin updates, update selected plugins in bulk, and retry failed updates.', zh: '检查插件更新，批量更新所选插件，并重试失败项。' },
  },
  [components[1]]: {
    title: { en: 'Bulk Session Archive', zh: '会话批量归档' },
    description: { en: 'Select and archive sessions within a workspace, with individual results.', zh: '在工作区中选择并批量归档会话，查看每项处理结果。' },
  },
};

// Use the release artifacts as installed: the profile contains only the bundle,
// with components nested inside it. No component aliases are created at profile root.
test('real npm tarball resolves native components, metadata and compatibility exports without hoisting', { timeout: 60000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-enhance-pack-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], { cwd: root, encoding: 'utf8', timeout: 30000 }))[0];
  const home = join(temporary, 'home');
  const profileDir = join(home, 'profiles', 'fixture');
  const bundle = join(profileDir, 'node_modules', bundleName);
  await mkdir(bundle, { recursive: true });
  execFileSync('tar', ['-xzf', join(temporary, packed.filename), '--strip-components=1', '-C', bundle], { timeout: 30000 });
  const manifest = JSON.parse(await readFile(join(bundle, 'package.json'), 'utf8'));
  assert.equal(manifest.name, bundleName);
  assert.deepEqual(manifest.bundledDependencies, components);
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), [...components].sort());
  assert.deepEqual(await readdir(join(profileDir, 'node_modules')), [bundleName]);
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({ name: 'fixture-profile', private: true, type: 'module', dependencies: { [bundleName]: manifest.version } }));

  // Supply the same DSH peers as the test runner, without leaking this repository's
  // component symlinks into the profile or the runtime's installation mapping.
  const runtime = join(temporary, 'runtime');
  await mkdir(join(runtime, 'node_modules'), { recursive: true });
  await symlink(await realpath(join(root, 'node_modules', '@deepseek-ai')), join(runtime, 'node_modules', '@deepseek-ai'), 'dir');
  const installAnchor = join(runtime, 'package.json');
  await writeFile(installAnchor, JSON.stringify({ name: 'fixture-runtime', private: true, type: 'module', dependencies: manifest.peerDependencies }));
  const patchPath = join(bundle, 'cordis.patch.yml');
  const patches = loadOverlayPatches('test', patchPath);
  const profile = {
    name: 'fixture', dir: profileDir,
    layers: [{ packageName: bundleName, packageDir: bundle, patchPaths: [patchPath], patches }],
    patchPath: join(profileDir, 'cordis.patch.yml'), patches: [], skippedBundles: [],
  };
  const rows = composeEntries([patches]);
  assert.deepEqual(rows.map(({ id, name }) => ({ id, name })), [
    { id: bundleName, name: components[0] },
    { id: components[1], name: components[1] },
  ]);
  const resolution = await createRuntimeResolution({ installAnchor, profile, home });
  for (const name of components) {
    const entries = resolution.entries.filter(entry => entry.name === name);
    assert.equal(entries.length, 1, `${name} must have one profile mapping`);
    assert.equal(entries[0].scope, 'profile');
    assert.equal(entries[0].packageDir, join(bundle, 'node_modules', name));
    assert.equal(entries[0].declarer, join(bundle, 'package.json'));
  }
  const ctx = new Context();
  const packages = ctx.plugin(PluginPackages, { resolution });
  try {
    await packages;
    const parentURL = pathToFileURL(join(profileDir, 'cordis.yml')).href;
    for (const name of [bundleName, ...components]) {
      const directory = name === bundleName ? bundle : join(bundle, 'node_modules', name);
      const pkg = ctx.pluginPackages.packageOf(name, parentURL);
      assert.equal(pkg.dir, directory);
      assert.equal(pkg.version, manifest.version, 'bundle and component versions must remain synchronized');
      if (name !== bundleName) assert.equal(pkg.manifest.private, true);
      const meta = readPluginMeta(name, parentURL);
      assert.equal(meta.error, undefined);
      assert.deepEqual(meta.title, metadata[name].title);
      assert.deepEqual(meta.description, metadata[name].description);
      for (const [suffix, relative] of [['', 'index.js'], ['/client', 'client.js'], ['/locale/en.json', 'locale/en.json'], ['/locale/zh.json', 'locale/zh.json']]) {
        const resource = resolvePluginResource(`${name}${suffix}`, parentURL);
        assert.equal(resource, join(directory, relative));
        await access(resource);
      }
      const clientPath = resolvePluginResource(`${name}/client`, parentURL);
      let registration;
      vm.runInNewContext(await readFile(clientPath, 'utf8'), { window: { __ModuleLoader__: { load(value) {
        assert.equal(registration, undefined, 'one client registration per entry');
        registration = value;
      } } } }, { filename: clientPath });
      assert.equal(registration.id, name);
      const client = registration.factory(specifier => {
        if (specifier === 'zod') return zod;
        if (specifier === 'react') return { createElement() {} };
        assert.equal(specifier, '@deepseek-ai/dsh-client-ui-primitives');
        return {};
      });
      assert.equal(typeof client.apply, 'function');
      assert.deepEqual(Array.from(client.inject), name === components[1]
        ? ['slots', 'locale', 'contextMenus', 'workspaces', 'sessions', 'remoteAccess']
        : ['slots', 'locale', 'remote']);
    }
    const load = specifier => import(pathToFileURL(resolvePluginResource(specifier, parentURL)).href);
    const [legacyHost, host] = await Promise.all([load(bundleName), load(components[0])]);
    assert.deepEqual(Object.keys(legacyHost), Object.keys(host));
    for (const key of Object.keys(host)) assert.equal(legacyHost[key], host[key]);
    const [legacyTypert, typert, legacyRemote, remote] = await Promise.all([
      load(`${bundleName}/typert`), load(`${components[0]}/typert`),
      load(`${bundleName}/remote`), load(`${components[0]}/remote`),
    ]);
    assert.equal(legacyTypert.TYPERT, typert.TYPERT);
    assert.equal(legacyRemote.TYPERT_REMOTE, remote.TYPERT_REMOTE);
    assert.equal(remote.TYPERT_REMOTE.package, bundleName, 'Remote ownership remains the updatable bundle');
    assert.equal(typeof (await load(components[1])).apply, 'function');
  } finally {
    await packages.dispose();
    await ctx.fiber.dispose();
  }
});

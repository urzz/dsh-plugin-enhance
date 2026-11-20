import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { Context } from '@deepseek-ai/cordis';
import { composeEntries, createRuntimeResolution, loadOverlayPatches, PluginPackages, readPluginMeta, resolvePluginResource } from '@deepseek-ai/dsh-app-boot';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundleName = 'dsh-plugin-enhance';
const component = 'dsh-plugin-enhance-workspace-archive';

// Only the bundle is installed at profile root: native discovery must find its nested private component.
test('packed archive component resolves native metadata, Host and matching Client entry without hoisting', { timeout: 60000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-enhance-archive-pack-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], { cwd: root, encoding: 'utf8', timeout: 30000 }))[0];
  const home = join(temporary, 'home');
  const profileDir = join(home, 'profiles', 'fixture');
  const bundle = join(profileDir, 'node_modules', bundleName);
  await mkdir(bundle, { recursive: true });
  execFileSync('tar', ['-xzf', join(temporary, packed.filename), '--strip-components=1', '-C', bundle], { timeout: 30000 });
  const manifest = JSON.parse(await readFile(join(bundle, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.bundledDependencies, [component]);
  assert.deepEqual(await readdir(join(profileDir, 'node_modules')), [bundleName]);
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({ name: 'fixture-profile', private: true, type: 'module', dependencies: { [bundleName]: manifest.version } }));
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
  const archiveRows = composeEntries([patches]).filter(row => row.id === component);
  assert.equal(archiveRows.length, 1);
  assert.equal(archiveRows[0].name, component);
  const resolution = await createRuntimeResolution({ installAnchor, profile, home });
  const entries = resolution.entries.filter(entry => entry.name === component);
  const directory = join(bundle, 'node_modules', component);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].scope, 'profile');
  assert.equal(entries[0].packageDir, directory);
  assert.equal(entries[0].declarer, join(bundle, 'package.json'));
  const ctx = new Context();
  const packages = ctx.plugin(PluginPackages, { resolution });
  try {
    await packages;
    const parentURL = pathToFileURL(join(profileDir, 'cordis.yml')).href;
    const pkg = ctx.pluginPackages.packageOf(component, parentURL);
    assert.equal(pkg.dir, directory);
    assert.equal(pkg.manifest.private, true);
    assert.equal(pkg.manifest.dsh.client.platform, 'web');
    assert.equal(pkg.manifest.dsh.client.immediately, undefined, 'the archive follows its Host row lifecycle');
    assert.deepEqual(pkg.manifest.dsh.client.external, ['react']);
    const meta = readPluginMeta(component, parentURL);
    assert.equal(meta.error, undefined);
    assert.deepEqual(meta.title, { en: 'Workspace Batch Archive', zh: '工作区批量归档' });
    assert.deepEqual(Object.keys(meta.description).sort(), ['en', 'zh']);
    for (const [suffix, relative] of [['', 'index.js'], ['/client', 'client.js'], ['/locale/en.json', 'locale/en.json'], ['/locale/zh.json', 'locale/zh.json']]) {
      const resource = resolvePluginResource(`${component}${suffix}`, parentURL);
      assert.equal(resource, join(directory, relative));
      await access(resource);
    }
    assert.equal(typeof (await import(pathToFileURL(resolvePluginResource(component, parentURL)).href)).apply, 'function');
    const clientPath = resolvePluginResource(`${component}/client`, parentURL);
    let registration;
    vm.runInNewContext(await readFile(clientPath, 'utf8'), { window: { __ModuleLoader__: { load(value) {
      assert.equal(registration, undefined);
      registration = value;
    } } } }, { filename: clientPath });
    assert.equal(registration.id, component);
    const client = registration.factory(specifier => { assert.equal(specifier, 'react'); return { createElement() {} }; });
    assert.equal(typeof client.apply, 'function');
    assert.deepEqual(Array.from(client.inject), ['slots', 'locale', 'contextMenus', 'workspaces', 'sessions', 'uiSession']);
  } finally {
    await packages.dispose();
    await ctx.fiber.dispose();
  }
});

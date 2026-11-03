import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateEngine } from '../engine.js';

const bundle = (name, extra = {}) => ({
  name, version: '1.0.0', source: `${name}@^1.0.0`, enabled: true,
  installed: true, availability: 'profile', removable: true, ...extra,
});
const outcome = extra => ({ changed: true, application: 'applied', stage: 'install', ...extra });
const manifest = name => ({ name, version: '2.0.0', dsh: { bundle: 'patch.yml' }, engines: { dsh: '>=0.2.0' } });

function fixture(initial = [bundle('alpha')], dependencies = {}) {
  let bundles = structuredClone(initial);
  const calls = [];
  const manager = {
    async listBundles() { return structuredClone(bundles); },
    async removeBundle(name) {
      calls.push(['remove', name]);
      bundles = bundles.filter(item => item.name !== name);
      return outcome({ stage: 'remove', target: name });
    },
    async installBundle(spec, options) {
      calls.push(['install', spec, options]);
      const name = spec.slice(0, spec.lastIndexOf('@'));
      bundles = bundles.filter(item => item.name !== name);
      bundles.push(bundle(name, { version: '2.0.0', source: spec, enabled: options.enabled }));
      return outcome({ bundle: name, version: '2.0.0', target: spec });
    },
  };
  const engine = createUpdateEngine({
    manager, runtimeVersion: '0.2.1-rc.5', selfName: 'updater',
    resolveNpmMetadata: async ({ name }) => ({ manifest: manifest(name) }),
    ...dependencies,
  });
  return { engine, manager, calls, change: value => { bundles = structuredClone(value); } };
}

const release = (version, options = {}) => ({
  version, install: { spec: `alpha@${version}`, registry: 'https://private.example' },
  compatibility: { compatible: true }, ...options,
});
const entry = (versions, defaultVersion = versions[0].version) => ({ name: 'alpha', versions, defaultVersion });
function market(entries) {
  const requests = [];
  return {
    requests,
    listIndexes: () => [{ url: 'https://market.example/index.json' }],
    async search(url, query) {
      requests.push({ url, query });
      return { fetchedAt: 1234, entries, nextOffset: null };
    },
  };
}

test('npm check, selected serial update and original disabled state', async () => {
  const f = fixture([bundle('alpha', { enabled: false }), bundle('beta')]);
  const check = await f.engine.check();
  assert.deepEqual(check.items.map(item => item.state), ['ready', 'ready']);
  const result = await f.engine.start({ generation: check.generation, names: ['alpha', 'beta'] });
  assert.deepEqual(f.calls.map(call => call.slice(0, 2)), [
    ['remove', 'alpha'], ['install', 'alpha@2.0.0'], ['remove', 'beta'], ['install', 'beta@2.0.0'],
  ]);
  assert.equal(f.calls[1][2].enabled, false);
  assert.equal(f.calls[1][2].saveExact, true);
  assert.deepEqual(result.items.map(item => item.state), ['succeeded', 'succeeded']);
  result.items[0].state = 'tampered';
  assert.equal(f.engine.status().items[0].state, 'succeeded');
});

test('market refresh paginates with fetchedAt and permits Git targets', async () => {
  const requests = [];
  const m = market([]);
  m.search = async (_url, query) => {
    requests.push(query);
    return query.offset === 0
      ? { fetchedAt: 100, entries: [], nextOffset: 100 }
      : { fetchedAt: 100, entries: [entry([release('2.0.0', {
        install: { spec: 'git+https://example.org/repo.git#abcdef' },
      })])], nextOffset: null };
  };
  const f = fixture([bundle('alpha', { source: 'git+https://example.org/repo.git#old' })], {
    market: m, resolveNpmMetadata: () => { throw new Error('must not use npm'); },
  });
  const check = await f.engine.check();
  assert.equal(requests[0].refresh, true);
  assert.equal(requests[1].fetchedAt, 100);
  assert.equal(requests[1].refresh, undefined);
  assert.equal(check.items[0].target.spec, 'git+https://example.org/repo.git#abcdef');
});

test('market uses compatible default instead of newest and passes registry unchanged', async () => {
  const m = market([entry([
    release('3.0.0', { compatibility: { compatible: false } }), release('2.0.0'),
  ], '2.0.0')]);
  const f = fixture(undefined, { market: m });
  const check = await f.engine.check();
  await f.engine.start({ generation: check.generation, names: ['alpha'] });
  assert.equal(f.calls[1][1], 'alpha@2.0.0');
  assert.equal(f.calls[1][2].registry, 'https://private.example');
});

test('exclude self, builtins, local, nonremovable, git and npm alias sources', async () => {
  const f = fixture([
    bundle('updater'), bundle('builtin', { availability: 'installation' }),
    bundle('local', { source: 'link:/tmp/local' }), bundle('locked', { removable: false }),
    bundle('git', { source: 'git+https://example.org/repo.git' }),
    bundle('alias', { source: 'alias@npm:other@1.0.0' }),
  ]);
  const check = await f.engine.check();
  assert.deepEqual(check.items.map(item => item.reason), [
    'self', 'builtin', 'local-or-unknown-source', 'not-removable', 'unsupported-source', 'unsupported-source',
  ]);
  assert.equal(f.calls.length, 0);
});

test('npm compatibility includes peer fallback and rejects name mismatch or nonbundle', async () => {
  for (const [change, reason] of [
    [{ engines: { dsh: '>=9' } }, 'incompatible'],
    [{ engines: { dsh: '' } }, 'incompatible'],
    [{ engines: undefined, peerDependencies: { '@deepseek-ai/dsh-core': '>=9' } }, 'incompatible'],
    [{ engines: undefined, peerDependencies: { '@deepseek-ai/dsh': '>=9' } }, 'incompatible'],
    [{ name: 'other' }, 'npm-package-name-mismatch'],
    [{ dsh: undefined }, 'not-bundle'],
  ]) {
    const f = fixture(undefined, { resolveNpmMetadata: async () => ({ manifest: { ...manifest('alpha'), ...change } }) });
    assert.equal((await f.engine.check()).items[0].reason, reason);
  }
});

test('engines.dsh overrides peer ranges; workspace peers match current runtime', async () => {
  for (const fields of [
    { engines: { dsh: '>=0.2.0' }, peerDependencies: { '@deepseek-ai/dsh-core': '>=9' } },
    { engines: undefined, peerDependencies: { '@deepseek-ai/dsh-core': 'workspace:^' } },
  ]) {
    const f = fixture(undefined, { resolveNpmMetadata: async () => ({ manifest: { ...manifest('alpha'), ...fields } }) });
    assert.equal((await f.engine.check()).items[0].state, 'ready');
  }
});

test('npm resolver registry is retained and different installed version is not success', async () => {
  const f = fixture(undefined, { resolveNpmMetadata: async () => ({ manifest: manifest('alpha'), registry: null }) });
  const install = f.manager.installBundle;
  f.manager.installBundle = async (...args) => ({ ...await install(...args), version: '1.9.0' });
  const check = await f.engine.check();
  const result = await f.engine.start({ generation: check.generation, names: ['alpha'] });
  assert.equal(f.calls[1][2].registry, null);
  assert.equal(result.items[0].reason, 'installed-target-mismatch');
  assert.equal(result.items[0].retryable, true);
});

test('market exemptions do not bypass incompatible candidate', async () => {
  const f = fixture(undefined, { market: market([entry([release('2.0.0', {
    compatibility: { compatible: false, exempted: true },
  })])]) });
  assert.equal((await f.engine.check()).items[0].reason, 'incompatible');
});

test('metadata failures remain visible and do not trigger unauthenticated fallback', async () => {
  const f = fixture(undefined, { resolveNpmMetadata: async () => { throw new Error('profile registry auth failed'); } });
  const result = await f.engine.check();
  assert.equal(result.items[0].state, 'check-failed');
  assert.equal(result.items[0].reason, 'profile registry auth failed');
  assert.equal(f.calls.length, 0);
});

test('index failure prevents silently switching a possible market package to npm', async () => {
  const m = market([]);
  m.search = async () => { throw new Error('market offline'); };
  const f = fixture(undefined, { market: m });
  const result = await f.engine.check();
  assert.equal(result.marketErrors[0].message, 'market offline');
  assert.equal(result.items[0].reason, 'market-unavailable');
});

test('reject stale generation and changed source without removing anything', async () => {
  const f = fixture();
  const old = await f.engine.check();
  const check = await f.engine.check();
  assert.throws(() => f.engine.start({ generation: old.generation, names: ['alpha'] }), /stale-check/);
  f.change([bundle('alpha', { source: 'alpha@npm:other@1' })]);
  const result = await f.engine.start({ generation: check.generation, names: ['alpha'] });
  assert.equal(result.items[0].state, 'stale');
  assert.equal(f.calls.length, 0);
});

test('no-HMR stop-profile allows overwrite; other removal failures do not', async () => {
  for (const code of ['stop-profile', 'bundle-in-use']) {
    const f = fixture();
    f.manager.removeBundle = async () => outcome({ application: 'failed', error: { code } });
    const install = f.manager.installBundle;
    f.manager.installBundle = async (...args) => ({ ...await install(...args), application: 'restart-required' });
    const check = await f.engine.check();
    const result = await f.engine.start({ generation: check.generation, names: ['alpha'] });
    assert.equal(f.calls.length, code === 'stop-profile' ? 1 : 0);
    assert.equal(result.items[0].state, code === 'stop-profile' ? 'restart-required' : 'failed');
  }
});

test('failed installation remains recoverable across check and retries without removing missing package', async () => {
  const f = fixture();
  const install = f.manager.installBundle;
  f.manager.installBundle = async () => outcome({ application: 'failed', error: { code: 'operation-error' } });
  const check = await f.engine.check();
  let result = await f.engine.start({ generation: check.generation, names: ['alpha'] });
  assert.equal(result.items[0].retryable, true);
  assert.equal(result.items[0].recovery.installed, false);
  result = await f.engine.check();
  assert.equal(result.items[0].state, 'failed');
  f.manager.installBundle = install;
  result = await f.engine.retry();
  assert.equal(result.items[0].state, 'succeeded');
  assert.deepEqual(f.calls.map(call => call[0]), ['remove', 'install']);
});

test('pending scripts and activation failures never report success or grant approval', async () => {
  for (const failure of [
    { application: 'failed' }, { pendingBuilds: ['native-dependency'] },
    { application: 'cancelled' }, { packageResult: { exitCode: 1 } },
  ]) {
    const f = fixture();
    const install = f.manager.installBundle;
    f.manager.installBundle = async (...args) => ({ ...await install(...args), ...failure });
    const check = await f.engine.check();
    const result = await f.engine.start({ generation: check.generation, names: ['alpha'] });
    assert.equal(result.items[0].retryable, true);
    assert.equal(result.items[0].state, failure.pendingBuilds ? 'pending-builds' : 'failed');
    assert.equal(f.calls[1][2].approvedBuilds, undefined);
    // Saved failed activation requires remove+install on retry, not a blind reinstall.
    f.manager.installBundle = install;
    assert.equal((await f.engine.retry()).items[0].state, 'succeeded');
    assert.equal(f.calls.filter(call => call[0] === 'remove').length, 2);
  }
});

test('retry refuses external replacement of a missing failed package', async () => {
  const f = fixture();
  f.manager.installBundle = async () => outcome({ application: 'failed' });
  const check = await f.engine.check();
  await f.engine.start({ generation: check.generation, names: ['alpha'] });
  f.change([bundle('alpha', { version: '9.0.0' })]);
  assert.equal((await f.engine.retry()).items[0].state, 'stale');
  assert.equal(f.calls.length, 1);
});

test('busy guard covers check and update; status exposes in-progress work', async () => {
  const f = fixture([bundle('alpha'), bundle('beta')]);
  let releaseInstall;
  const gate = new Promise(resolve => { releaseInstall = resolve; });
  const install = f.manager.installBundle;
  f.manager.installBundle = async (...args) => { await gate; return install(...args); };
  const check = await f.engine.check();
  const running = f.engine.start({ generation: check.generation, names: ['alpha', 'beta'] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.engine.status().busy, true);
  assert.equal(f.engine.status().run.active, 'alpha');
  assert.throws(() => f.engine.start({ generation: check.generation, names: ['beta'] }), /engine-busy/);
  assert.throws(() => f.engine.retry(), /engine-busy/);
  await assert.rejects(f.engine.check(), /engine-busy/);
  assert.equal(f.calls.filter(call => call[0] === 'remove').length, 1);
  releaseInstall();
  const result = await running;
  assert.equal(result.busy, false);
  assert.equal(result.run.completed, 2);
});

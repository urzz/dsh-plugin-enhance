import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateEngine, createUpdateState } from '../engine.js';

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

test('GitHub source checks its repository and installs the resolved target preserving disabled state', async () => {
  const source = 'github:owner/alpha#main';
  const spec = 'git+https://github.com/owner/alpha.git#main';
  const f = fixture([bundle('alpha', { source, enabled: false })], {
    resolveNpmMetadata: () => { throw new Error('must not use npm'); },
    resolveGithubMetadata: async input => {
      assert.equal(input.source, source);
      return { manifest: manifest('alpha'), spec };
    },
  });
  f.manager.installBundle = async (target, options) => {
    f.calls.push(['install', target, options]);
    f.change([bundle('alpha', { source: target, version: '2.0.0', enabled: options.enabled })]);
    return outcome({ bundle: 'alpha', version: '2.0.0' });
  };
  const check = await f.engine.check();
  assert.deepEqual(check.items[0].target, { spec, version: '2.0.0', origin: 'github' });
  const result = await f.engine.start({ generation: check.generation, names: ['alpha'] });
  assert.equal(result.items[0].state, 'succeeded');
  assert.equal(f.calls[1][1], spec);
  assert.equal(f.calls[1][2].enabled, false);
});

test('GitHub candidates enforce package identity, bundle, compatibility and newer versions', async () => {
  for (const [fields, state, reason] of [
    [{ name: 'other' }, 'check-failed', 'github-package-name-mismatch'],
    [{ dsh: undefined }, 'blocked', 'not-bundle'],
    [{ engines: { dsh: '>=9' } }, 'blocked', 'incompatible'],
    [{ version: 'broken' }, 'check-failed', 'invalid-target-version'],
    [{ version: '1.0.0' }, 'current', null],
    [{ version: '0.9.0' }, 'current', null],
  ]) {
    const f = fixture([bundle('alpha', { source: 'https://github.com/owner/alpha' })], {
      resolveGithubMetadata: async () => ({ manifest: { ...manifest('alpha'), ...fields }, spec: 'github:owner/alpha' }),
    });
    const item = (await f.engine.check()).items[0];
    assert.equal(item.state, state);
    assert.equal(item.reason, reason);
    assert.equal(f.calls.length, 0);
  }
});

test('GitHub query failure and market failure remain visible without npm fallback', async () => {
  const m = market([]);
  const f = fixture([bundle('alpha', { source: 'github:owner/alpha' })], {
    market: m,
    resolveGithubMetadata: async () => { throw new Error('github lookup failed'); },
    resolveNpmMetadata: () => { throw new Error('must not use npm'); },
  });
  assert.equal((await f.engine.check()).items[0].reason, 'github lookup failed');
  m.search = async () => { throw new Error('market offline'); };
  assert.equal((await f.engine.check()).items[0].reason, 'market-unavailable');
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

test('exclude builtins, local, nonremovable, git and npm alias sources', async () => {
  const f = fixture([
    bundle('builtin', { availability: 'installation' }),
    bundle('local', { source: 'link:/tmp/local' }), bundle('locked', { removable: false }),
    bundle('git', { source: 'git+https://example.org/repo.git' }),
    bundle('alias', { source: 'alias@npm:other@1.0.0' }),
  ]);
  const check = await f.engine.check();
  assert.deepEqual(check.items.map(item => item.reason), [
    'builtin', 'local-or-unknown-source', 'not-removable', 'unsupported-source', 'unsupported-source',
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


test('self is ready and runs last, preserving other selections in batches and retries', async () => {
  for (const explicitRetry of [false, true]) {
    const f = fixture([bundle('updater'), bundle('alpha'), bundle('beta')]);
    const check = await f.engine.check();
    assert.equal(check.items[0].state, 'ready');
    assert.equal(check.items[0].reason, null);
    assert.equal(check.items[0].target.spec, 'updater@2.0.0');
    const install = f.manager.installBundle;
    f.manager.installBundle = async spec => {
      f.calls.push(['failed-install', spec]);
      return outcome({ application: 'failed' });
    };
    const result = await f.engine.start({ generation: check.generation, names: ['updater', 'beta', 'alpha'] });
    assert.deepEqual(result.run.names, ['beta', 'alpha', 'updater']);
    assert.deepEqual(f.calls.filter(call => call[0] === 'remove').map(call => call[1]), ['beta', 'alpha', 'updater']);
    assert.ok(result.items.every(item => item.retryable));
    f.calls.length = 0;
    f.manager.installBundle = install;
    const retry = await f.engine.retry(explicitRetry ? { names: ['updater', 'beta', 'alpha'] } : undefined);
    const expected = explicitRetry ? ['beta', 'alpha', 'updater'] : ['alpha', 'beta', 'updater'];
    assert.deepEqual(retry.run.names, expected);
    assert.deepEqual(f.calls.map(call => call[1]), expected.map(name => `${name}@2.0.0`));
    assert.ok(retry.items.every(item => item.state === 'succeeded'));
  }
});

test('shared state survives module reload during self removal and uses fresh dependencies afterward', async t => {
  const reloaded = await import('../engine.js?self-update-reload');
  for (const [label, failure, expectedState, expectedReason] of [
    ['success', {}, 'succeeded', null],
    ['failed install', { application: 'failed', error: { code: 'activation-failed' } }, 'failed', 'activation-failed'],
    ['pending build', { pendingBuilds: ['native'] }, 'pending-builds', 'applied'],
    ['wrong version', { version: '1.9.0' }, 'failed', 'installed-target-mismatch'],
  ]) {
    await t.test(label, async () => {
      const state = createUpdateState();
      const f = fixture([bundle('updater', { enabled: false })], { state });
      const check = await f.engine.check();
      assert.equal(Object.hasOwn(check, 'plans'), false);
      let releaseRemoval;
      const gate = new Promise(resolve => { releaseRemoval = resolve; });
      let removed;
      const removalStarted = new Promise(resolve => { removed = resolve; });
      const remove = f.manager.removeBundle;
      f.manager.removeBundle = async name => {
        const result = await remove(name);
        removed();
        await gate;
        return result;
      };
      const install = f.manager.installBundle;
      f.manager.installBundle = async (...args) => ({ ...await install(...args), ...failure });
      const running = f.engine.start({ generation: check.generation, names: ['updater'] });
      await removalStarted;
      const freshCalls = [];
      const fresh = reloaded.createUpdateEngine({
        state, selfName: 'updater', runtimeVersion: '0.2.1-rc.5',
        manager: {
          listBundles: () => f.manager.listBundles(),
          removeBundle: async name => { freshCalls.push(['remove', name]); return remove(name); },
          installBundle: async (...args) => { freshCalls.push(['install', args[0]]); return install(...args); },
        },
        resolveNpmMetadata: async ({ name }) => {
          freshCalls.push(['resolve', name]);
          return { manifest: { ...manifest(name), version: '3.0.0' } };
        },
      });
      try {
        const during = fresh.status();
        assert.equal(during.busy, true);
        assert.equal(during.generation, check.generation);
        assert.equal(during.checkedAt, check.checkedAt);
        assert.deepEqual(during.run, { names: ['updater'], active: 'updater', completed: 0 });
        assert.equal(during.items[0].state, 'removing');
        assert.throws(() => fresh.start({ generation: check.generation, names: ['updater'] }), /engine-busy/);
        assert.throws(() => fresh.retry(), /engine-busy/);
        await assert.rejects(fresh.check(), /engine-busy/);
        assert.deepEqual(freshCalls, []);
      } finally {
        releaseRemoval();
      }
      const result = await running;
      assert.deepEqual(fresh.status(), result);
      assert.equal(result.busy, false);
      assert.equal(result.run.completed, 1);
      assert.equal(result.run.active, null);
      assert.equal(result.items[0].state, expectedState);
      assert.equal(result.items[0].reason, expectedReason);
      assert.equal(f.calls[1][2].enabled, false);
      if (expectedState !== 'succeeded') {
        assert.equal(result.items[0].retryable, true);
        // A fresh check preserves the failed plan, including the original 2.0.0 target.
        assert.equal((await fresh.check()).items[0].target.version, '2.0.0');
        const retried = await fresh.retry();
        assert.equal(retried.items[0].state, 'succeeded');
        assert.deepEqual(freshCalls, [['remove', 'updater'], ['install', 'updater@2.0.0']]);
      }
      const checked = await fresh.check();
      assert.equal(checked.items[0].target.version, '3.0.0');
      assert.deepEqual(freshCalls.at(-1), ['resolve', 'updater']);
      assert.equal(Object.hasOwn(fresh.status(), 'plans'), false);
    });
  }
});

test('default engine state and explicitly created state are independent', async () => {
  const first = fixture();
  const second = fixture();
  await first.engine.check();
  assert.equal(second.engine.status().generation, 0);
  assert.deepEqual(second.engine.status().items, []);
  const a = createUpdateState();
  const b = createUpdateState();
  a.plans.set('alpha', {});
  assert.equal(b.plans.size, 0);
});

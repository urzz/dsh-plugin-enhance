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
    manager, runtimeVersion: '0.2.2-rc.1', selfName: 'updater',
    market: market(initial.filter(({ name, source }) => source === `${name}@^1.0.0`).map(({ name }) => ({
      name, defaultVersion: '2.0.0', versions: [{
        ...release('2.0.0'), install: { spec: `${name}@2.0.0` },
      }],
    }))),
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

const nativeRelease = (version, extra = {}) => ({ version, bundle: true, prerelease: false, tags: [], ...extra });
const versionList = (versions = [nativeRelease('2.0.0')]) => ({
  status: 'listed', installed: '1.0.0', registry: 'https://private.example', versions,
});
function nativeFixture(dependencies = {}, initial = [bundle('alpha', { updatable: true, enabled: false })]) {
  const f = fixture(initial, dependencies);
  f.manager.listVersions = async () => versionList();
  f.manager.updateBundle = async (name, version, options) => {
    f.calls.push(['update', name, version, options]);
    const installed = await f.manager.listBundles();
    f.change(installed.map(item => item.name === name ? { ...item, version } : item));
    return { from: '1.0.0', to: version, step: 'install', result: outcome({ bundle: name, version }) };
  };
  return f;
}

test('native update delegates to the manager and preserves disabled state without remove/install', async () => {
  const f = nativeFixture();
  const check = await f.engine.check();
  assert.equal(check.items[0].support, 'native');
  const result = await f.engine.start({ generation: check.generation, names: ['alpha'] });
  assert.equal(result.items[0].state, 'succeeded');
  assert.equal(result.items[0].retryable, false);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].slice(0, 3), ['update', 'alpha', '2.0.0']);
  assert.equal(f.calls[0][3].registry, 'https://private.example');
  assert.equal(typeof f.calls[0][3].requestId, 'string');
  assert.equal((await f.manager.listBundles())[0].enabled, false);
});

test('native-only checks do not query markets; mixed checks survive market index and search failures', async () => {
  const unusedMarket = {
    listIndexes() { assert.fail('native-only check must not query markets'); },
  };
  assert.equal((await nativeFixture({ market: unusedMarket }).engine.check()).items[0].state, 'ready');
  for (const stage of ['indexes', 'search']) {
    const f = nativeFixture({
      market: {
        listIndexes() {
          if (stage === 'indexes') throw new Error('index offline');
          return [{ url: 'https://market.example/index.json' }];
        },
        search() { throw new Error('search offline'); },
      },
      resolveGithubMetadata() { assert.fail('market failure cannot fall back to GitHub'); },
    }, [bundle('alpha', { updatable: true }), bundle('beta', { source: 'github:owner/beta' })]);
    const check = await f.engine.check();
    assert.equal(check.items[0].state, 'ready');
    assert.equal(check.items[0].support, 'native');
    assert.equal(check.items[1].reason, 'market-unavailable');
    assert.equal(check.marketErrors.length, 1);
  }
});

test('native progress only follows the active requestId and ignores completed requests', async () => {
  const f = nativeFixture();
  const entered = Promise.withResolvers();
  const gate = Promise.withResolvers();
  const update = f.manager.updateBundle;
  f.manager.updateBundle = async (...args) => {
    entered.resolve(args[2].requestId);
    await gate.promise;
    return update(...args);
  };
  const check = await f.engine.check();
  const running = f.engine.start({ generation: check.generation, names: ['alpha'] });
  const requestId = await entered.promise;
  f.engine.updateProgress({ requestId: 'unrelated', step: 'restoring' });
  assert.equal(f.engine.status().items[0].state, 'checking');
  for (const step of ['removing', 'installing', 'restoring']) {
    f.engine.updateProgress({ requestId, step });
    assert.equal(f.engine.status().items[0].state, step);
  }
  gate.resolve();
  assert.equal((await running).items[0].state, 'succeeded');
  f.engine.updateProgress({ requestId, step: 'restoring' });
  assert.equal(f.engine.status().items[0].state, 'succeeded');
});

test('native failed target keeps restoration separate and retries through the manager', async () => {
  for (const restore of [outcome({ bundle: 'alpha', version: '1.0.0' }), outcome({ application: 'failed' }), undefined]) {
    const f = nativeFixture();
    const update = f.manager.updateBundle;
    const failure = outcome({ application: 'failed', error: { code: 'install-failed' } });
    f.manager.updateBundle = async (...args) => {
      f.calls.push(['failed-update', ...args]);
      return { from: '1.0.0', to: '2.0.0', step: 'install', result: failure, restore };
    };
    const check = await f.engine.check();
    const failed = await f.engine.start({ generation: check.generation, names: ['alpha'] });
    assert.equal(failed.items[0].state, restore?.application === 'applied' ? 'restored' : 'failed');
    assert.equal(failed.items[0].reason, 'install-failed');
    assert.deepEqual(failed.items[0].result, failure);
    assert.deepEqual(failed.items[0].restoreResult, restore);
    assert.equal(failed.items[0].retryable, true);
    assert.equal((await f.engine.check()).items[0].target.version, '2.0.0');
    f.manager.updateBundle = update;
    const retried = await f.engine.retry();
    assert.equal(retried.items[0].state, 'succeeded');
    assert.deepEqual(f.calls.map(call => call[0]), ['failed-update', 'update']);
    assert.notEqual(f.calls[0][3].requestId, f.calls[1][3].requestId);
  }
});

test('native results enforce exact installed target, build approval and activation failures', async () => {
  for (const [result, state, reason] of [
    [outcome({ bundle: 'other', version: '2.0.0' }), 'failed', 'installed-target-mismatch'],
    [outcome({ bundle: 'alpha', version: '1.9.0' }), 'failed', 'installed-target-mismatch'],
    [outcome({ bundle: 'alpha', version: '2.0.0', application: 'restart-required' }), 'restart-required', null],
    [outcome({ pendingBuilds: ['dependency'] }), 'pending-builds', 'applied'],
    [outcome({ application: 'failed', pendingBuilds: [], packageResult: { kind: 'build-blocked', exitCode: 1 }, error: { code: 'operation-error' } }), 'pending-builds', 'operation-error'],
    [outcome({ application: 'failed', error: { code: 'activation-failed' } }), 'failed', 'activation-failed'],
  ]) {
    const f = nativeFixture();
    f.manager.updateBundle = async () => ({ from: '1.0.0', to: '2.0.0', step: 'install', result });
    const check = await f.engine.check();
    const updated = await f.engine.start({ generation: check.generation, names: ['alpha'] });
    assert.equal(updated.items[0].state, state);
    assert.equal(updated.items[0].reason, reason);
    assert.deepEqual(updated.items[0].result, result);
    assert.deepEqual(f.calls, []);
  }
});

test('native update rejection never falls back and saved target activation failure cannot be retried', async () => {
  for (const savedTarget of [false, true]) {
    const f = nativeFixture();
    f.manager.updateBundle = async () => {
      if (!savedTarget) throw new Error('native transport failed');
      f.change([bundle('alpha', { version: '2.0.0', updatable: true, enabled: false })]);
      return { from: '1.0.0', to: '2.0.0', step: 'install', result: outcome({
        application: 'failed', error: { code: 'activation-failed' },
      }) };
    };
    const check = await f.engine.check();
    const result = await f.engine.start({ generation: check.generation, names: ['alpha'] });
    assert.equal(result.items[0].state, 'failed');
    assert.equal(result.items[0].reason, savedTarget ? 'activation-failed' : 'native transport failed');
    assert.equal(result.items[0].retryable, !savedTarget);
    assert.deepEqual(f.calls, []);
    if (savedTarget) assert.throws(() => f.engine.retry({ names: ['alpha'] }), /package-not-selectable/);
  }
});

test('extended market check, selected serial update and original disabled state', async () => {
  const f = fixture([bundle('alpha', { enabled: false }), bundle('beta')]);
  const check = await f.engine.check();
  assert.deepEqual(check.items.map(item => item.state), ['ready', 'ready']);
  assert.deepEqual(check.items.map(item => item.support), ['extended', 'extended']);
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

test('status publishes the full inventory before deferred markets and metadata resolve', async () => {
  const indexes = Promise.withResolvers();
  const search = Promise.withResolvers();
  const versions = Promise.withResolvers();
  const github = Promise.withResolvers();
  const enteredIndexes = Promise.withResolvers();
  const enteredSearch = Promise.withResolvers();
  const enteredVersions = Promise.withResolvers();
  const enteredGithub = Promise.withResolvers();
  const f = fixture([
    bundle('alpha', { enabled: false, updatable: true }),
    bundle('beta', { source: 'github:owner/beta#main' }),
    bundle('builtin', { availability: 'installation' }),
    bundle('missing', { installed: false }),
    bundle('locked', { removable: false }),
    bundle('local', { source: 'link:/tmp/local' }),
    bundle('invalid', { version: 'broken' }),
  ], {
    market: {
      listIndexes() { enteredIndexes.resolve(); return indexes.promise; },
      search() { enteredSearch.resolve(); return search.promise; },
    },
    resolveGithubMetadata() { enteredGithub.resolve(); return github.promise; },
  });
  f.manager.listVersions = () => { enteredVersions.resolve(); return versions.promise; };
  const running = f.engine.check();
  await enteredIndexes.promise;
  const during = f.engine.status();
  assert.equal(during.busy, true);
  assert.equal(during.generation, 0);
  assert.equal(during.checkedAt, null);
  assert.deepEqual(during.items.map(({ name, state, reason }) => ({ name, state, reason })), [
    { name: 'alpha', state: 'checking', reason: null },
    { name: 'beta', state: 'checking', reason: null },
    { name: 'builtin', state: 'blocked', reason: 'builtin' },
    { name: 'missing', state: 'blocked', reason: 'not-installed' },
    { name: 'locked', state: 'blocked', reason: 'not-removable' },
    { name: 'local', state: 'blocked', reason: 'local-or-unknown-source' },
    { name: 'invalid', state: 'blocked', reason: 'invalid-current-version' },
  ]);
  assert.deepEqual(during.items[0], {
    name: 'alpha', currentVersion: '1.0.0', enabled: false, source: 'alpha@^1.0.0',
    support: 'native', state: 'checking', reason: null, target: null, retryable: false,
  });
  during.items[0].state = 'tampered';
  assert.equal(f.engine.status().items[0].state, 'checking');
  assert.throws(() => f.engine.start({ generation: 0, names: ['alpha'] }), /engine-busy/);
  assert.throws(() => f.engine.retry(), /engine-busy/);
  await assert.rejects(f.engine.check(), /engine-busy/);

  indexes.resolve([{ url: 'https://market.example/index.json' }]);
  await enteredSearch.promise;
  assert.equal(f.engine.status().items.length, 7);
  assert.equal(f.engine.status().items[0].state, 'checking');
  search.resolve({ fetchedAt: 1234, entries: [], nextOffset: null });
  await enteredVersions.promise;
  assert.deepEqual(f.engine.status().items.slice(0, 2).map(item => item.state), ['checking', 'checking']);
  versions.resolve(versionList());
  await enteredGithub.promise;
  assert.deepEqual(f.engine.status().items.slice(0, 2).map(item => item.state), ['ready', 'checking']);
  github.resolve({ manifest: manifest('beta'), spec: 'github:owner/beta#main' });
  const result = await running;
  assert.equal(result.busy, false);
  assert.equal(result.generation, 1);
  assert.equal(typeof result.checkedAt, 'number');
  assert.deepEqual(result.items.slice(0, 2).map(item => item.state), ['ready', 'ready']);
  assert.equal(result.items.length, 7);
  assert.deepEqual(f.calls, []);
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
    market: m,
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
    [{ engines: { dsh: '' } }, 'blocked', 'incompatible'],
    [{ engines: undefined, peerDependencies: { '@deepseek-ai/dsh': '>=9' } }, 'blocked', 'incompatible'],
    [{ engines: undefined, peerDependencies: { '@deepseek-ai/dsh-core': '>=9' } }, 'blocked', 'incompatible'],
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
  assert.ok(check.items.every(item => item.support === 'unavailable'));
  assert.equal(f.calls.length, 0);
});

test('native selection skips prerelease, nonbundle, deprecated and incompatible releases', async () => {
  const f = nativeFixture();
  const list = versionList([
    nativeRelease('6.0.0-beta.1', { prerelease: true }),
    nativeRelease('5.0.0', { bundle: false }),
    nativeRelease('4.0.0', { deprecated: 'obsolete' }),
    nativeRelease('3.0.0', { incompatible: { reason: 'runtime' } }),
    nativeRelease('2.0.0', { tags: [] }),
    nativeRelease('1.5.0', { tags: ['latest'] }),
  ]);
  f.manager.listVersions = async name => { assert.equal(name, 'alpha'); return list; };
  const item = (await f.engine.check()).items[0];
  assert.equal(item.support, 'native');
  assert.equal(item.state, 'ready');
  assert.deepEqual(item.versions, list);
  assert.deepEqual(item.target, { version: '2.0.0', registry: list.registry, origin: 'native' });
});

test('native lists distinguish current, unavailable and no installable versions', async () => {
  for (const [list, state, reason] of [
    [versionList([]), 'current', null],
    [versionList([nativeRelease('1.0.0')]), 'current', null],
    [versionList([nativeRelease('0.9.0')]), 'current', null],
    [versionList([nativeRelease('2.0.0', { bundle: false })]), 'blocked', 'no-installable-version'],
    [{ status: 'unavailable', reason: 'registry-unavailable' }, 'check-failed', 'registry-unavailable'],
  ]) {
    const f = nativeFixture();
    f.manager.listVersions = async () => list;
    const item = (await f.engine.check()).items[0];
    assert.equal(item.support, 'native');
    assert.equal(item.state, state);
    assert.equal(item.reason, reason);
    assert.deepEqual(f.calls, []);
  }
});

test('engines.dsh overrides peer ranges; workspace peers match current runtime', async () => {
  for (const fields of [
    { engines: { dsh: '>=0.2.0' }, peerDependencies: { '@deepseek-ai/dsh-core': '>=9' } },
    { engines: undefined, peerDependencies: { '@deepseek-ai/dsh-core': 'workspace:^' } },
  ]) {
    const f = fixture([bundle('alpha', { source: 'github:owner/alpha' })], {
      resolveGithubMetadata: async () => ({ manifest: { ...manifest('alpha'), ...fields }, spec: 'github:owner/alpha' }),
    });
    assert.equal((await f.engine.check()).items[0].state, 'ready');
  }
});

test('market registry is retained and different installed version is not success', async () => {
  const f = fixture(undefined, { market: market([entry([release('2.0.0', {
    install: { spec: 'alpha@2.0.0', registry: null },
  })])]) });
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

test('native metadata failures remain visible without extended fallback', async () => {
  const f = nativeFixture({ market: market([entry([release('9.0.0')])]) });
  f.manager.listVersions = async () => { throw new Error('profile registry auth failed'); };
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

test('check replaces obsolete GitHub failures after a manual npm installation', async () => {
  for (const phase of ['remove', 'install']) {
    for (const version of ['1.5.0', '2.0.0']) {
      const f = fixture([bundle('alpha', { source: 'github:owner/alpha#main', enabled: false })], {
        resolveGithubMetadata: async () => ({ manifest: manifest('alpha'), spec: 'github:owner/alpha#main' }),
      });
      const operation = `${phase}Bundle`;
      const original = f.manager[operation];
      f.manager[operation] = async () => outcome({ application: 'failed', error: { code: 'operation-error' } });
      const check = await f.engine.check();
      const failed = await f.engine.start({ generation: check.generation, names: ['alpha'] });
      assert.equal(failed.items[0].retryable, true);
      f.manager[operation] = original;
      f.change([bundle('alpha', { version, source: `alpha@^${version}`, updatable: true })]);
      f.manager.listVersions = async () => versionList();
      f.manager.updateBundle = async (name, target, options) => {
        f.calls.push(['update', name, target, options]);
        f.change([bundle(name, { version: target, updatable: true })]);
        return { from: version, to: target, step: 'install', result: outcome({ bundle: name, version: target }) };
      };

      const refreshed = await f.engine.check();
      assert.equal(refreshed.items.length, 1);
      const [item] = refreshed.items;
      assert.equal(item.currentVersion, version);
      assert.equal(item.source, `alpha@^${version}`);
      assert.equal(item.enabled, true);
      assert.equal(item.reason, null);
      assert.equal(item.retryable, false);
      assert.equal(item.recovery, undefined);
      assert.equal(item.result, undefined);
      assert.throws(() => f.engine.retry({ names: ['alpha'] }), /package-not-selectable/);
      if (version === '2.0.0') {
        assert.equal(item.state, 'current');
      } else {
        assert.equal(item.state, 'ready');
        assert.equal(item.support, 'native');
        assert.equal(item.target.origin, 'native');
        const result = await f.engine.start({ generation: refreshed.generation, names: ['alpha'] });
        assert.equal(result.items[0].state, 'succeeded');
        assert.deepEqual(f.calls.at(-1).slice(0, 3), ['update', 'alpha', '2.0.0']);
      }
    }
  }
});

test('deferred checks retain retryable rows and plans for present and missing bundles', async () => {
  const m = market(['alpha', 'beta', 'gamma'].map(name => ({
    name, defaultVersion: '2.0.0', versions: [{ ...release('2.0.0'), install: { spec: `${name}@2.0.0` } }],
  })));
  const f = fixture([bundle('alpha'), bundle('beta')], { market: m });
  const remove = f.manager.removeBundle;
  const install = f.manager.installBundle;
  f.manager.removeBundle = name => name === 'alpha'
    ? outcome({ application: 'failed', error: { code: 'bundle-in-use' } }) : remove(name);
  f.manager.installBundle = async () => outcome({ application: 'failed' });
  const check = await f.engine.check();
  const failed = await f.engine.start({ generation: check.generation, names: ['alpha', 'beta'] });
  assert.ok(failed.items.every(item => item.retryable));
  f.change([bundle('alpha'), bundle('gamma')]);
  const gate = Promise.withResolvers();
  const entered = Promise.withResolvers();
  m.listIndexes = () => { entered.resolve(); return gate.promise; };
  const running = f.engine.check();
  await entered.promise;
  const during = f.engine.status();
  assert.equal(during.busy, true);
  assert.equal(during.generation, check.generation);
  assert.deepEqual(during.items.map(item => item.name), ['alpha', 'gamma', 'beta']);
  for (const item of failed.items) {
    assert.deepEqual(during.items.find(row => row.name === item.name), item);
  }
  assert.equal(during.items[1].state, 'checking');
  gate.resolve([]);
  await running;
  f.manager.removeBundle = remove;
  f.manager.installBundle = install;
  const retried = await f.engine.retry();
  assert.deepEqual(retried.items.filter(item => ['alpha', 'beta'].includes(item.name))
    .map(item => item.state), ['succeeded', 'succeeded']);
  assert.equal(f.calls.filter(call => call[0] === 'remove' && call[1] === 'beta').length, 1);
});

test('pending scripts and activation failures never report success or grant approval', async () => {
  for (const failure of [
    { application: 'failed' }, { pendingBuilds: ['native-dependency'] },
    { application: 'cancelled' }, { packageResult: { exitCode: 1 } },
    { application: 'failed', pendingBuilds: [], packageResult: { exitCode: 1, kind: 'build-blocked' }, error: { code: 'operation-error', diagnostic: 'ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED' } },
  ]) {
    const f = fixture();
    const install = f.manager.installBundle;
    f.manager.installBundle = async (...args) => ({ ...await install(...args), ...failure });
    const check = await f.engine.check();
    const result = await f.engine.start({ generation: check.generation, names: ['alpha'] });
    assert.equal(result.items[0].retryable, true);
    assert.equal(result.items[0].state, failure.pendingBuilds?.length || failure.packageResult?.kind === 'build-blocked' ? 'pending-builds' : 'failed');
    if (failure.error) assert.deepEqual(result.items[0].result.error, failure.error);
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
        state, selfName: 'updater', runtimeVersion: '0.2.2-rc.1',
        manager: {
          listBundles: () => f.manager.listBundles(),
          removeBundle: async name => { freshCalls.push(['remove', name]); return remove(name); },
          installBundle: async (...args) => { freshCalls.push(['install', args[0]]); return install(...args); },
        },
        market: {
          listIndexes: () => [{ url: 'https://market.example/index.json' }],
          search: async () => {
            freshCalls.push(['resolve', 'updater']);
            return { entries: [{ name: 'updater', defaultVersion: '3.0.0', versions: [
              { ...release('3.0.0'), install: { spec: 'updater@3.0.0' } },
            ] }], nextOffset: null };
          },
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

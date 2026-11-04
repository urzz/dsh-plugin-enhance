import semver from 'semver';
import { parseGithubSource } from './github.js';

const copy = value => structuredClone(value);
const identity = bundle => bundle && JSON.stringify([
  bundle.name, bundle.version, bundle.source, bundle.enabled, bundle.installed,
  bundle.availability, bundle.removable,
]);
function manifestCompatible(manifest, runtime) {
  const satisfies = range => typeof range === 'string' && range.trim() !== ''
    && semver.satisfies(runtime, range, { includePrerelease: true });
  if (manifest.engines && Object.hasOwn(manifest.engines, 'dsh')) return satisfies(manifest.engines.dsh);
  return Object.entries(manifest.peerDependencies ?? {}).every(([name, range]) => {
    if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) return true;
    return ['workspace:^', 'workspace:~', 'workspace:*'].includes(range) || satisfies(range);
  });
}
const localSource = source => /^(?:file:|link:|workspace:|\/|~|\.{1,2}\/)/.test(source);
const successful = result => !result.error && !result.pendingBuilds?.length
  && ['applied', 'restart-required'].includes(result.application)
  && (!result.packageResult || (result.packageResult.exitCode === 0 && !result.packageResult.timedOut));

/** Pure data retained across service reloads; dependencies belong to each engine. */
export function createUpdateState() {
  return {
    busy: false, generation: 0, checkedAt: null, items: [], marketErrors: [],
    run: null, plans: new Map(),
  };
}

/**
 * Pure, profile-independent update coordinator. Dependencies are current DSH services.
 * resolveNpmMetadata({name, source, runtimeVersion}) returns {manifest, registry?}.
 * It MUST use the profile's package-manager authentication, proxy and registry policy;
 * no network client or registry fallback is implemented here. manifest is the exact
 * candidate release (normally npm's latest tag), including dsh/engines/peerDependencies.
 *
 * resolveGithubMetadata({name, source, runtimeVersion}) returns {manifest, spec}
 * for the original GitHub ref; the resolver never runs repository code.
 * snapshot/status return detached JSON-safe state. check refreshes market indexes.
 * start({generation,names}) and retry({names?}) settle after the serial batch finishes.
 * Poll status while either runs. Concurrent mutations reject with engine-busy.
 * Recovery is in-memory: callers needing restart persistence must store snapshots.
 */
export function createUpdateEngine({
  manager, market, resolveNpmMetadata, resolveGithubMetadata, runtimeVersion, selfName,
  state = createUpdateState(),
}) {
  const snapshot = () => copy({
    generation: state.generation, checkedAt: state.checkedAt, busy: state.busy,
    items: state.items, marketErrors: state.marketErrors, run: state.run,
  });
  const assertIdle = () => { if (state.busy) throw new Error('engine-busy'); };

  async function locked(operation) {
    assertIdle();
    state.busy = true;
    try { await operation(); } finally { state.busy = false; }
    return snapshot();
  }

  async function readMarkets() {
    const entries = new Map();
    state.marketErrors = [];
    if (!market) return entries;
    for (const { url } of await market.listIndexes()) {
      try {
        let offset = 0;
        let fetchedAt;
        do {
          const page = await market.search(url, {
            sort: { kind: 'index' }, offset, limit: 100,
            ...(offset === 0 ? { refresh: true } : { fetchedAt }),
          });
          fetchedAt = page.fetchedAt;
          for (const entry of page.entries) {
            // Configured source order determines precedence, matching market selection.
            if (!entries.has(entry.name)) entries.set(entry.name, entry);
          }
          offset = page.nextOffset;
        } while (offset !== null);
      } catch (error) {
        state.marketErrors.push({ url, message: error.message });
      }
    }
    return entries;
  }

  async function check() {
    return locked(async () => {
      const bundles = await manager.listBundles();
      const markets = await readMarkets();
      const previous = new Map(state.items.filter(item => item.retryable).map(item => [item.name, item]));
      state.items = [];
      for (const bundle of bundles) {
        if (previous.has(bundle.name)) {
          state.items.push(previous.get(bundle.name));
          previous.delete(bundle.name);
          continue;
        }
        state.plans.delete(bundle.name);
        const item = {
          name: bundle.name, currentVersion: bundle.version ?? null, enabled: bundle.enabled,
          source: bundle.source ?? null, state: 'blocked', reason: null, target: null, retryable: false,
        };
        state.items.push(item);
        if (bundle.availability === 'installation') { item.reason = 'builtin'; continue; }
        if (!bundle.installed) { item.reason = 'not-installed'; continue; }
        if (!bundle.removable) { item.reason = 'not-removable'; continue; }
        if (!bundle.source || localSource(bundle.source)) { item.reason = 'local-or-unknown-source'; continue; }
        if (!semver.valid(bundle.version)) { item.reason = 'invalid-current-version'; continue; }
        try {
          let target;
          const entry = markets.get(bundle.name);
          if (entry) {
            const release = entry.versions.find(version => version.version === entry.defaultVersion);
            if (!release || !release.compatibility.compatible) {
              item.reason = 'incompatible'; continue;
            }
            target = { ...release.install, version: release.version, origin: 'market' };
          } else if (parseGithubSource(bundle.source)) {
            if (state.marketErrors.length) { item.reason = 'market-unavailable'; continue; }
            const { manifest, spec } = await resolveGithubMetadata({
              name: bundle.name, source: bundle.source, runtimeVersion,
            });
            if (manifest.name !== bundle.name) throw new Error('github-package-name-mismatch');
            if (manifest.dsh?.bundle === undefined) { item.reason = 'not-bundle'; continue; }
            if (!manifestCompatible(manifest, runtimeVersion)) { item.reason = 'incompatible'; continue; }
            target = { spec, version: manifest.version, origin: 'github' };
          } else {
            // Other Git hosts, tarballs and npm aliases cannot be converted to name@latest.
            const prefix = `${bundle.name}@`;
            if (!bundle.source.startsWith(prefix)
              || !/^(?:latest|[~^<>=*\d]|[A-Za-z][\w.-]*$)/.test(bundle.source.slice(prefix.length))
              || /(?:npm:|https?:|git[:+]|github:)/.test(bundle.source.slice(prefix.length))) {
              item.reason = 'unsupported-source'; continue;
            }
            // A failed index may own this package; do not silently switch source.
            if (state.marketErrors.length) { item.reason = 'market-unavailable'; continue; }
            const { manifest, registry } = await resolveNpmMetadata({
              name: bundle.name, source: bundle.source, runtimeVersion,
            });
            if (manifest.name !== bundle.name) throw new Error('npm-package-name-mismatch');
            if (manifest.dsh?.bundle === undefined) { item.reason = 'not-bundle'; continue; }
            if (!manifestCompatible(manifest, runtimeVersion)) { item.reason = 'incompatible'; continue; }
            target = {
              spec: `${bundle.name}@${manifest.version}`, version: manifest.version, origin: 'npm',
              ...(registry === undefined ? {} : { registry }),
            };
          }
          if (!semver.valid(target.version)) throw new Error('invalid-target-version');
          if (!semver.gt(target.version, bundle.version)) { item.state = 'current'; continue; }
          item.target = target;
          item.state = 'ready';
          state.plans.set(bundle.name, { expected: identity(bundle), enabled: bundle.enabled, target, removed: false });
        } catch (error) {
          item.state = 'check-failed';
          item.reason = error.message;
        }
      }
      // Failed installations can disappear from listBundles; keep their recovery plans.
      state.items.push(...previous.values());
      state.generation++;
      state.checkedAt = Date.now();
    });
  }

  async function update(item) {
    const plan = state.plans.get(item.name);
    const current = (await manager.listBundles()).find(bundle => bundle.name === item.name);
    if (identity(current) !== plan.expected) {
      item.state = 'stale'; item.reason = 'bundle-changed'; item.retryable = false;
      return;
    }
    item.reason = null;
    item.retryable = false;
    item.result = null;
    try {
      if (!plan.removed) {
        item.state = 'removing';
        const removal = await manager.removeBundle(item.name);
        item.result = removal;
        // stop-profile is raised before deselection/removal in DSH without HMR.
        // That installation path explicitly supports overwriting the dependency.
        if (removal.error?.code !== 'stop-profile') {
          if (!successful(removal)) {
            item.state = removal.pendingBuilds?.length ? 'pending-builds' : 'failed';
            item.reason = removal.error?.code ?? removal.application;
            item.retryable = true;
            return;
          }
          plan.removed = true;
        }
      }
      item.state = 'installing';
      const result = await manager.installBundle(plan.target.spec, {
        enabled: plan.enabled, saveExact: true,
        ...(plan.target.registry === undefined ? {} : { registry: plan.target.registry }),
      });
      item.result = result;
      if (successful(result)) {
        item.state = result.application === 'restart-required' ? 'restart-required' : 'succeeded';
        // Manager can install a different release due to minimumReleaseAge. Do not
        // report the requested release as installed unless the result confirms it.
        if (result.bundle !== item.name || result.version !== plan.target.version) {
          item.state = 'failed'; item.reason = 'installed-target-mismatch'; item.retryable = true;
        }
      } else {
        item.state = result.pendingBuilds?.length ? 'pending-builds' : 'failed';
        item.reason = result.error?.code ?? result.application;
        item.retryable = true;
      }
    } catch (error) {
      item.state = 'failed'; item.reason = error.message; item.retryable = true;
    } finally {
      // A failed install can have saved the dependency before activation failed.
      // Retry must compare that exact state, not blindly treat it as uninstalled.
      const after = (await manager.listBundles()).find(bundle => bundle.name === item.name);
      plan.expected = identity(after);
      if (after?.installed) plan.removed = false;
      else if (after === undefined || !after.installed) plan.removed = true;
      if (item.retryable) item.recovery = {
        originalVersion: item.currentVersion, enabled: plan.enabled, target: plan.target,
        installed: after?.installed ?? false,
      };
      else delete item.recovery;
    }
  }

  function select(names, predicate) {
    if (!Array.isArray(names) || !names.length || new Set(names).size !== names.length) {
      throw new Error('select-distinct-packages');
    }
    return names.map(name => {
      const item = state.items.find(candidate => candidate.name === name);
      if (!item || !predicate(item)) throw new Error(`package-not-selectable: ${name}`);
      return item;
    });
  }

  async function batch(selected) {
    // Stable ordering keeps the caller's queue order, with this bundle last.
    selected.sort((a, b) => Number(a.name === selfName) - Number(b.name === selfName));
    return locked(async () => {
      state.run = { names: selected.map(item => item.name), completed: 0, active: null };
      try {
        for (const item of selected) {
          state.run.active = item.name;
          await update(item);
          state.run.completed++;
        }
      } finally {
        state.run.active = null;
      }
    });
  }

  return {
    snapshot,
    status: snapshot,
    check,
    start({ generation: expectedGeneration, names }) {
      assertIdle();
      if (expectedGeneration !== state.generation || state.checkedAt === null) throw new Error('stale-check');
      return batch(select(names, item => item.state === 'ready'));
    },
    retry({ names = state.items.filter(item => item.retryable).map(item => item.name) } = {}) {
      assertIdle();
      return batch(select(names, item => item.retryable));
    },
  };
}

import semver from 'semver';
import { randomUUID } from 'node:crypto';
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
const needsBuildApproval = result => result.pendingBuilds?.length > 0 || result.packageResult?.kind === 'build-blocked';
const successful = result => !result.error && !needsBuildApproval(result)
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
 * Registry bundles use the official listVersions/updateBundle APIs. Only sources
 * outside the native update contract use the extended resolver and install flow.
 *
 * resolveGithubMetadata({name, source, runtimeVersion}) returns {manifest, spec}
 * for the original GitHub ref; the resolver never runs repository code.
 * snapshot/status return detached JSON-safe state. check refreshes market indexes.
 * start({generation,names}) and retry({names?}) settle after the serial batch finishes.
 * Poll status while either runs. Concurrent mutations reject with engine-busy.
 * Recovery is in-memory: callers needing restart persistence must store snapshots.
 */
export function createUpdateEngine({
  manager, market, resolveGithubMetadata, runtimeVersion, selfName,
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
    let indexes;
    try { indexes = await market.listIndexes(); }
    catch (error) {
      state.marketErrors.push({ url: null, message: error.message });
      return entries;
    }
    for (const { url } of indexes) {
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
      const installed = new Map(bundles.map(bundle => [bundle.name, bundle]));
      const previous = new Map();
      for (const item of state.items.filter(item => item.retryable)) {
        // Keep recovery only while the manager still matches the failed attempt.
        if (identity(installed.get(item.name)) === state.plans.get(item.name).expected) {
          previous.set(item.name, item);
        } else {
          state.plans.delete(item.name);
        }
      }
      const unchecked = [];
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
          source: bundle.source ?? null, support: 'unavailable', state: 'blocked', reason: null, target: null, retryable: false,
        };
        state.items.push(item);
        if (bundle.updatable) {
          item.support = 'native';
          item.state = 'checking';
          unchecked.push({ bundle, item });
          continue;
        }
        if (bundle.availability === 'installation') { item.reason = 'builtin'; continue; }
        if (!bundle.installed) { item.reason = 'not-installed'; continue; }
        if (!bundle.removable) { item.reason = 'not-removable'; continue; }
        if (!bundle.source || localSource(bundle.source)) { item.reason = 'local-or-unknown-source'; continue; }
        if (!semver.valid(bundle.version)) { item.reason = 'invalid-current-version'; continue; }
        item.state = 'checking';
        unchecked.push({ bundle, item });
      }
      // Publish the full inventory before market or package metadata queries.
      // Failed installations can disappear from listBundles; keep their recovery plans.
      state.items.push(...previous.values());
      const markets = unchecked.some(({ item }) => item.support !== 'native') ? await readMarkets() : new Map();
      if (!unchecked.some(({ item }) => item.support !== 'native')) state.marketErrors = [];
      for (const { bundle, item } of unchecked) {
        try {
          let target;
          const entry = markets.get(bundle.name);
          if (item.support === 'native') {
            const list = await manager.listVersions(bundle.name);
            item.versions = list;
            if (list.status !== 'listed') {
              item.state = 'check-failed'; item.reason = list.reason; continue;
            }
            // Match the official UI's default: newest installable stable release.
            const release = list.versions.find(version => version.bundle && !version.incompatible
              && version.deprecated === undefined && !version.prerelease);
            if (!release) {
              item.state = list.versions.length ? 'blocked' : 'current';
              item.reason = list.versions.length ? 'no-installable-version' : null;
              continue;
            }
            target = { version: release.version, registry: list.registry, origin: 'native' };
          } else if (entry) {
            item.support = 'extended';
            const release = entry.versions.find(version => version.version === entry.defaultVersion);
            if (!release || !release.compatibility.compatible) {
              item.reason = 'incompatible'; continue;
            }
            target = { ...release.install, version: release.version, origin: 'market' };
          } else if (parseGithubSource(bundle.source)) {
            item.support = 'extended';
            if (state.marketErrors.length) { item.reason = 'market-unavailable'; continue; }
            const { manifest, spec } = await resolveGithubMetadata({
              name: bundle.name, source: bundle.source, runtimeVersion,
            });
            if (manifest.name !== bundle.name) throw new Error('github-package-name-mismatch');
            if (manifest.dsh?.bundle === undefined) { item.reason = 'not-bundle'; continue; }
            if (!manifestCompatible(manifest, runtimeVersion)) { item.reason = 'incompatible'; continue; }
            target = { spec, version: manifest.version, origin: 'github' };
          } else {
            item.reason = state.marketErrors.length ? 'market-unavailable' : 'unsupported-source';
            continue;
          }
          if (!semver.valid(target.version)) throw new Error('invalid-target-version');
          if (!semver.gt(target.version, bundle.version)) { item.state = 'current'; continue; }
          item.target = target;
          item.state = 'ready';
          state.plans.set(bundle.name, { expected: identity(bundle), enabled: bundle.enabled, target, removed: false });
        } catch (error) {
          item.state = 'check-failed';
          item.reason = error.message;
        } finally {
          if (item.state === 'checking') item.state = 'blocked';
        }
      }
      state.generation++;
      state.checkedAt = Date.now();
    });
  }

  async function updateNative(item, plan) {
    const requestId = randomUUID();
    plan.requestId = requestId;
    item.state = 'checking';
    delete item.restoreResult;
    try {
      const outcome = await manager.updateBundle(item.name, plan.target.version, {
        registry: plan.target.registry, requestId,
      });
      item.result = outcome.result;
      item.restoreResult = outcome.restore;
      if (outcome.step === 'install' && successful(outcome.result)) {
        item.state = outcome.result.application === 'restart-required' ? 'restart-required' : 'succeeded';
        if (outcome.result.bundle !== item.name || outcome.result.version !== plan.target.version) {
          item.state = 'failed'; item.reason = 'installed-target-mismatch';
        }
      } else {
        item.state = outcome.restore && successful(outcome.restore) ? 'restored'
          : needsBuildApproval(outcome.result) ? 'pending-builds' : 'failed';
        item.reason = outcome.result.error?.code ?? outcome.result.application;
      }
    } catch (error) {
      item.state = 'failed'; item.reason = error.message;
    } finally {
      delete plan.requestId;
      const after = (await manager.listBundles()).find(bundle => bundle.name === item.name);
      plan.expected = identity(after);
      // Native update requires an installed, eligible, older version. A failed
      // activation may already have saved the target: that needs native review.
      item.retryable = !['succeeded', 'restart-required'].includes(item.state)
        && !!after?.updatable && semver.lt(after.version, plan.target.version);
    }
  }

  function updateProgress(progress) {
    const item = state.items.find(item => state.plans.get(item.name)?.requestId === progress.requestId);
    if (item) item.state = progress.step;
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
    if (plan.target.origin === 'native') return updateNative(item, plan);
    try {
      if (!plan.removed) {
        item.state = 'removing';
        const removal = await manager.removeBundle(item.name);
        item.result = removal;
        // stop-profile is raised before deselection/removal in DSH without HMR.
        // That installation path explicitly supports overwriting the dependency.
        if (removal.error?.code !== 'stop-profile') {
          if (!successful(removal)) {
            item.state = needsBuildApproval(removal) ? 'pending-builds' : 'failed';
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
        item.state = needsBuildApproval(result) ? 'pending-builds' : 'failed';
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
    updateProgress,
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

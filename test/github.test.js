import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { execa } from 'execa';
import { createGithubResolver, parseGithubSource } from '../github.js';

const manifest = { name: 'local-plugin', version: '1.0.0', dsh: { bundle: 'patch.yml' } };

test('parse supported GitHub sources, preserving transport and literal refs', () => {
  for (const [source, repository] of [
    ['github:owner/repo', 'https://github.com/owner/repo'],
    ['owner/repo', 'https://github.com/owner/repo'],
    ['https://github.com/owner/repo', 'https://github.com/owner/repo'],
    ['https://github.com/owner/repo.git', 'https://github.com/owner/repo.git'],
    ['git+https://github.com/owner/repo.git', 'https://github.com/owner/repo.git'],
    ['git+ssh://git@github.com/owner/repo.git', 'ssh://git@github.com/owner/repo.git'],
    ['git@github.com:owner/repo.git', 'git@github.com:owner/repo.git'],
  ]) {
    assert.deepEqual(parseGithubSource(source), { repository, ref: null });
    for (const ref of ['main', 'feature/update', 'v1.2.3', 'refs/tags/v1.2.3', 'a'.repeat(40)]) {
      assert.deepEqual(parseGithubSource(`${source}#${ref}`), { repository, ref });
    }
  }
});

test('reject unsupported hosts, credentials, paths, queries and malformed or qualified refs', () => {
  for (const source of [
    null, {}, '', 'npm:owner/repo', 'gitlab:owner/repo',
    'http://github.com/owner/repo', 'https://github.com.evil/owner/repo',
    'https://www.github.com/owner/repo', 'https://github.com:443/owner/repo',
    'https://git@github.com/owner/repo', 'https://user:pass@github.com/owner/repo',
    'git+ssh://user@github.com/owner/repo.git', 'git+ssh://git:pass@github.com/owner/repo.git',
    'git@other.example:owner/repo.git', 'owner', 'owner/repo/extra', 'owner//repo',
    '/owner/repo', 'owner/repo/', 'owner/..', 'owner/.', 'owner/.git',
    'owner/repo?query', 'https://github.com/owner/repo?query',
    'https://github.com/owner/%72epo', 'https://github.com/owner/../repo',
    ...['', 'main#again', 'semver:^1', 'path:packages/plugin', 'main?query',
      '../main', 'a..b', 'a//b', '/main', 'main/', '.main', 'main.', 'main.lock',
      'a/.hidden', 'a/b.lock', '@', 'a@{b', '-main', 'with space', 'a\\b',
      'a~1', 'a^', 'a:b', 'a*', 'a[b', 'a\n', '%6dain', 'main&path:subdir'].map(ref => `owner/repo#${ref}`),
  ]) assert.equal(parseGithubSource(source), null, String(source));
});

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'enhance-github-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repository = join(directory, 'source');
  const profile = { dir: directory, packageManager: { env: { GITHUB_TEST_PROFILE: 'forwarded' } } };
  const git = args => execa('git', args, { cwd: repository });
  await mkdir(repository);
  await git(['init', '--initial-branch=main']);
  await git(['config', 'user.name', 'Local Test']);
  await git(['config', 'user.email', 'local@example.invalid']);
  async function commit(value) {
    await writeFile(join(repository, 'package.json'), JSON.stringify(value));
    await git(['add', 'package.json']);
    await git(['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'fixture']);
    return (await git(['rev-parse', 'HEAD'])).stdout;
  }
  const first = await commit(manifest);
  await git(['tag', '-a', 'v1', '-m', 'version one']);
  const second = await commit({ ...manifest, version: '2.0.0', scripts: { prepare: 'exit 99' } });
  const calls = [];
  const runGit = async (args, options) => {
    calls.push({ args, options });
    const actual = [...args];
    if (actual.includes('fetch')) actual[actual.indexOf('--') + 1] = repository;
    return execa('git', actual, options);
  };
  return { directory, repository, profile, git, commit, first, second, calls, runGit };
}

async function assertCleaned(calls) {
  for (const { args } of calls.filter(call => call.args.includes('init'))) {
    const directory = dirname(args.at(-1));
    await assert.rejects(access(directory), { code: 'ENOENT' });
  }
}

test('local Git lookup follows HEAD, branches and tags, while explicit commits stay pinned', async t => {
  const f = await fixture(t);
  const resolve = createGithubResolver(f);
  for (const [ref, version] of [
    ['', '2.0.0'], ['main', '2.0.0'],
    ['v1', '1.0.0'], [f.first, '1.0.0'],
  ]) {
    const result = await resolve({ source: `github:owner/repo${ref ? `#${ref}` : ''}` });
    assert.equal(result.manifest.version, version);
    assert.equal(result.manifest.name, manifest.name);
    assert.equal(result.spec, `git+https://github.com/owner/repo${ref ? `#${ref}` : ''}`);
  }
  await f.commit({ ...manifest, version: '3.0.0' });
  const tracked = await resolve({ source: 'owner/repo#main' });
  assert.equal(tracked.spec, 'git+https://github.com/owner/repo#main');
  assert.equal((await resolve({ source: tracked.spec })).manifest.version, '3.0.0');
  assert.equal((await resolve({ source: `owner/repo#${f.first}` })).manifest.version, '1.0.0');
  const fetches = f.calls.filter(call => call.args.includes('fetch'));
  assert.deepEqual(fetches[0].args.slice(-5), ['fetch', '--depth=1', '--', 'https://github.com/owner/repo', 'HEAD']);
  assert.equal(fetches[2].args.at(-1), 'v1');
  assert.equal(fetches[3].args.at(-1), f.first);
  for (const { args, options } of f.calls) {
    assert.equal(options.cwd, f.profile.dir);
    assert.equal(options.env.GITHUB_TEST_PROFILE, 'forwarded');
    assert.equal(options.env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(options.env.GCM_INTERACTIVE, 'never');
    assert.equal(options.env.SSH_ASKPASS_REQUIRE, 'never');
    assert.equal(options.killDescendants, true);
    assert.equal(options.extendEnv, false);
    assert.equal(options.stdin, 'ignore');
    assert.equal(options.cancelSignal instanceof AbortSignal, true);
    assert.equal(args.includes('core.fsmonitor=false'), true);
    assert.equal(args.some(arg => arg.startsWith('core.hooksPath=')), true);
    assert.equal(args.includes('checkout'), false);
  }
  await assertCleaned(f.calls);
});

test('canonical tracking specs retain HTTPS and SSH authentication transports', async t => {
  const f = await fixture(t);
  const resolve = createGithubResolver(f);
  for (const [source, expected] of [
    ['git+https://github.com/owner/repo.git#main', 'git+https://github.com/owner/repo.git'],
    ['git+ssh://git@github.com/owner/repo.git#main', 'git+ssh://git@github.com/owner/repo.git'],
    ['git@github.com:owner/repo.git#main', 'git+ssh://git@github.com/owner/repo.git'],
  ]) assert.equal((await resolve({ source })).spec, `${expected}#main`);
  assert.deepEqual(f.calls.filter(call => call.args.includes('fetch')).map(call => call.args.at(-2)), [
    'https://github.com/owner/repo.git', 'ssh://git@github.com/owner/repo.git', 'git@github.com:owner/repo.git',
  ]);
  await assertCleaned(f.calls);
});

test('cleanup runs after failed fetches and invalid external manifests', async t => {
  const f = await fixture(t);
  const resolve = createGithubResolver(f);
  await assert.rejects(resolve({ source: 'owner/repo#missing-branch' }));
  for (const value of [null, [], 'text', {}, { name: 5, version: '1.0.0' },
    { name: 'plugin', version: 2 }, { name: '', version: '1.0.0' }]) {
    await f.commit(value);
    await assert.rejects(resolve({ source: 'owner/repo' }), /github-metadata-invalid/);
  }
  await writeFile(join(f.repository, 'package.json'), '{bad json');
  await f.git(['add', 'package.json']);
  await f.git(['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'invalid json']);
  await assert.rejects(resolve({ source: 'owner/repo' }), SyntaxError);
  await assertCleaned(f.calls);
});

test('Git templates and configured hooks cannot run during lookup', async t => {
  const f = await fixture(t);
  const templates = join(f.directory, 'templates');
  const hooks = join(templates, 'hooks');
  await mkdir(hooks, { recursive: true });
  const marker = join(f.directory, 'hook-ran');
  await writeFile(join(hooks, 'reference-transaction'), `#!/bin/sh\ntouch '${marker}'\nexit 99\n`, { mode: 0o755 });
  const config = join(f.directory, 'gitconfig');
  await writeFile(config, `[init]\n templateDir = ${templates}\n[core]\n hooksPath = ${hooks}\n`);
  f.profile.packageManager.env.GIT_CONFIG_GLOBAL = config;
  const result = await createGithubResolver(f)({ source: 'owner/repo' });
  assert.equal(result.manifest.version, '2.0.0');
  await assert.rejects(access(marker), { code: 'ENOENT' });
  await assertCleaned(f.calls);
});

test('unsupported and pre-cancelled requests never spawn Git', async () => {
  const controller = new AbortController();
  controller.abort(new Error('lookup-cancelled'));
  const resolve = createGithubResolver({
    profile: { dir: tmpdir() }, signal: controller.signal,
    runGit() { assert.fail('must not run Git'); },
  });
  await assert.rejects(resolve({ source: 'gitlab:owner/repo' }), /unsupported-github-source/);
  await assert.rejects(resolve({ source: 'owner/repo' }), /lookup-cancelled/);
});

test('cancellation terminates a running child and cleans the bare repository', async t => {
  const f = await fixture(t);
  const controller = new AbortController();
  const resolve = createGithubResolver({
    ...f, signal: controller.signal,
    async runGit(args, options) {
      if (!args.includes('fetch')) return f.runGit(args, options);
      const child = execa(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], options);
      controller.abort();
      return child;
    },
  });
  await assert.rejects(resolve({ source: 'owner/repo' }), error => error.isCanceled === true);
  await assertCleaned(f.calls);
});

test('timeout is shared across Git commands and cleans temporary resources', async t => {
  const f = await fixture(t);
  let calls = 0;
  const resolve = createGithubResolver({
    ...f, timeoutMs: 150,
    async runGit(args, options) {
      calls++;
      await delay(60, undefined, { signal: options.cancelSignal });
      return f.runGit(args, options);
    },
  });
  await assert.rejects(resolve({ source: 'owner/repo' }), error => error.name === 'AbortError'
    || error.name === 'TimeoutError' || error.isCanceled === true);
  assert.ok(calls >= 2, 'the total timeout spans more than one command');
  await assertCleaned(f.calls);
});

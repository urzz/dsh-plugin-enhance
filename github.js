import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess';

/** Recognize only GitHub repositories and literal Git refs, not pnpm qualifiers. */
export function parseGithubSource(source) {
  if (typeof source !== 'string') return null;
  const [location, ref, ...extra] = source.split('#');
  if (extra.length || (ref !== undefined && (!ref || ref === '@'
    || /[\s\x00-\x20\x7f~^:?*\[\\%&]/.test(ref) || ref.includes('..') || ref.includes('@{')
    || ref.startsWith('-') || ref.split('/').some(part => !part || part.startsWith('.')
      || part.endsWith('.') || part.endsWith('.lock'))))) return null;

  let repository;
  let path;
  const https = /^(?:git\+)?https:\/\/github\.com\/([^?#]+)$/.exec(location);
  const ssh = /^(?:git\+)?ssh:\/\/git@github\.com\/([^?#]+)$/.exec(location);
  const scp = /^git@github\.com:([^?#]+)$/.exec(location);
  if (https) {
    path = https[1];
    repository = `https://github.com/${path}`;
  } else if (ssh) {
    path = ssh[1];
    repository = `ssh://git@github.com/${path}`;
  } else if (scp) {
    path = scp[1];
    repository = location;
  } else {
    path = location.replace(/^github:/, '');
    repository = `https://github.com/${path}`;
  }
  const match = /^([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9_.-]+)$/.exec(path);
  if (!match) return null;
  const name = match[2].replace(/\.git$/, '');
  if (!name || name === '.' || name === '..') return null;
  return { repository, ref: ref ?? null };
}

const git = (args, options) => execa('git', args, options);

/** Read metadata without checking out files or running repository lifecycle code. */
export function createGithubResolver({ profile, timeoutMs = 20000, signal, runGit = git }) {
  return async ({ source }) => {
    const parsed = parseGithubSource(source);
    if (!parsed) throw new Error('unsupported-github-source');
    const lookupSignal = AbortSignal.any([
      AbortSignal.timeout(timeoutMs), ...signal === undefined ? [] : [signal],
    ]);
    lookupSignal.throwIfAborted();
    const directory = await mkdtemp(join(tmpdir(), 'plugin-enhance-github-'));
    try {
      const gitDir = join(directory, 'repository.git');
      const options = {
        cwd: profile.dir,
        env: {
          ...scrubbedParentEnv(), ...profile.packageManager?.env,
          GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never',
          GIT_ASKPASS: '', SSH_ASKPASS: '', SSH_ASKPASS_REQUIRE: 'never',
        },
        extendEnv: false, stdin: 'ignore', cancelSignal: lookupSignal,
        maxBuffer: 1024 * 1024, killDescendants: true, killSignal: 'SIGKILL',
      };
      const run = async args => {
        lookupSignal.throwIfAborted();
        const result = await runGit([
          '-c', `core.hooksPath=${directory}`, '-c', 'core.fsmonitor=false',
          '-c', 'credential.interactive=false', ...args,
        ], options);
        lookupSignal.throwIfAborted();
        return result.stdout.trim();
      };
      await run(['init', '--bare', '--template=', gitDir]);
      const inRepository = args => run([`--git-dir=${gitDir}`, ...args]);
      await inRepository(['fetch', '--depth=1', '--', parsed.repository, parsed.ref || 'HEAD']);
      const manifest = JSON.parse(await inRepository(['show', 'FETCH_HEAD:package.json']));
      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
        || typeof manifest.name !== 'string' || !manifest.name.trim()
        || typeof manifest.version !== 'string' || !manifest.version.trim()) {
        throw new Error('github-metadata-invalid');
      }
      const repository = parsed.repository.startsWith('git@')
        ? parsed.repository.replace('git@github.com:', 'ssh://git@github.com/') : parsed.repository;
      // Keep the tracked ref so future checks do not lose the original branch.
      return { manifest, spec: `git+${repository}${parsed.ref ? `#${parsed.ref}` : ''}` };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}

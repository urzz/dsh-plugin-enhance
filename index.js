import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
import { execa } from 'execa';
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess';
import { registryPlan } from '@deepseek-ai/dsh-plugin-manager/registry';
import { registryArguments } from '@deepseek-ai/dsh-plugin-manager/operations';
import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { approveEscalation } from '@deepseek-ai/dsh-sandbox';
import { z } from 'zod';
import { createUpdateEngine } from './engine.js';
import { TYPERT_REMOTE } from './typert.remote-client.js';

/** The manager's view helper omits compatibility fields; retain its exact spawn policy. */
export async function viewNpmMetadata(dir, spec, options) {
  const result = await execa(options.command ?? 'pnpm', [
    ...options.args ?? [], 'view', spec, 'name', 'version', 'dsh', 'engines', 'peerDependencies', '--json',
    ...registryArguments(options.registry ?? null), '--config.fetch-retries=0',
  ], {
    cwd: dir, env: { ...scrubbedParentEnv(), ...options.env }, extendEnv: false,
    reject: false, stdin: 'ignore', timeout: options.timeoutMs, maxBuffer: 1024 * 1024,
    ...options.signal === undefined ? {} : { cancelSignal: options.signal },
  });
  return { exitCode: result.exitCode ?? null, stdout: result.stdout, stderr: result.stderr, timedOut: result.timedOut };
}

/** Uses the launcher's executable and profile npmrc, just like pluginManager. */
export function createNpmResolver({ profile, manager, command = 'pnpm', timeoutMs = 20000, signal, view = viewNpmMetadata }) {
  return async ({ name }) => {
    const registries = registryPlan(undefined, await manager.registries());
    for (let index = 0; index < registries.length; index++) {
      signal?.throwIfAborted();
      const registry = registries[index];
      const result = await view(profile.dir, `${name}@latest`, {
        ...(profile.packageManager ?? { command }), registry, timeoutMs, signal,
      });
      signal?.throwIfAborted();
      if (result.exitCode === 0 && !result.timedOut) {
        const manifest = JSON.parse(result.stdout);
        if (!manifest || Array.isArray(manifest) || manifest.name !== name || typeof manifest.version !== 'string')
          throw new Error('npm-metadata-invalid');
        return { manifest, registry };
      }
      const unreachable = result.timedOut || /(?:ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ERR_PNPM_META_FETCH_FAIL|ERR_PNPM_FETCH_5\d\d)/.test(result.stderr);
      if (!unreachable || index === registries.length - 1)
        throw new Error(result.timedOut ? 'npm-metadata-timeout' : 'npm-metadata-query-failed');
    }
  };
}

const initializers = [];
export class PluginEnhance extends TypertRemoteService {
  static inject = ['pluginManager', 'pluginMarket', 'profileContext'];
  static Config = z.object({
    pnpmCommand: z.string().default('pnpm'),
    lookupTimeoutMs: z.number().int().min(1000).default(20000),
  });
  constructor(ctx, config = {}) {
    super(ctx, 'pluginEnhance');
    for (const initialize of initializers) initialize.call(this);
    const lookup = new AbortController();
    ctx.effect(() => () => lookup.abort(), 'plugin-enhance: cancel metadata lookup');
    this.engine = createUpdateEngine({
      manager: ctx.pluginManager, market: ctx.pluginMarket,
      resolveNpmMetadata: createNpmResolver({
        profile: ctx.profileContext, manager: ctx.pluginManager,
        command: config.pnpmCommand, timeoutMs: config.lookupTimeoutMs, signal: lookup.signal,
      }),
      runtimeVersion: getDshRuntimeVersion(), selfName: 'dsh-plugin-enhance',
    });
  }
  check() { return this.engine.check(); }
  status() { return this.engine.status(); }
  start(selection) {
    const input = TYPERT_REMOTE.methods['pluginEnhance/start'].input().create().parse({ selection });
    return this.engine.start(input.selection);
  }
  retry(selection) {
    const input = TYPERT_REMOTE.methods['pluginEnhance/retry'].input().create().parse({ selection });
    return this.engine.retry(input.selection);
  }
}
// Apply the public Stage-3 decorator API in JavaScript; no private descriptor symbols.
for (const name of ['check', 'start', 'status', 'retry']) {
  Remote(PluginEnhance.prototype[name], {
    kind: 'method', name, static: false, private: false,
    addInitializer(initialize) { initializers.push(initialize); },
  });
}

export function registerUpdateTool(ctx) {
  return ctx.tools.register(defineTool({
    name: 'plugin_enhance',
    description: 'Check and selectively update installed plugin bundles in this profile. check returns a generation and candidates; start requires that generation and exact names. Updates remove then reinstall and can leave failed bundles uninstalled. Poll status while a batch runs; retry failed items after fixing the cause. All calls require danger-full-access or approval. Build scripts and version exemptions are never approved by this tool; use plugin_manager with explicit user authorization for those.',
    parameters: {
      action: { type: 'string', enum: ['check', 'start', 'status', 'retry'], required: true, description: 'The shared UI business operation.' },
      generation: { type: 'integer', description: 'For start: generation from check.' },
      names: { type: 'array', items: { type: 'string' }, description: 'For start: selected candidate package names. For retry: failed package names, or omit to retry all failed items.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      const policy = ctx.sandboxPolicy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session });
      await approveEscalation({
        requestedMode: 'danger-full-access', effectiveMode: policy.mode,
        subject: 'plugin bundle updates',
        justification: `plugin_enhance ${args.action}. Updates persist across sessions and execute installed Host code outside the workspace sandbox.`,
      }, { approver: ctx.get('approval'), agent: exec.agent, callId: exec.callId, toolName: 'plugin_enhance', signal: exec.signal });
      exec.signal.throwIfAborted();
      const service = ctx.pluginEnhance;
      switch (args.action) {
        case 'check': return JSON.stringify(await service.check());
        case 'status': return JSON.stringify(await service.status());
        case 'start': return JSON.stringify(await service.start({ generation: args.generation, names: args.names }));
        case 'retry': return JSON.stringify(await service.retry(args.names === undefined ? {} : { names: args.names }));
        default: throw new Error('Unknown plugin_enhance action');
      }
    },
    presentCall: args => ({ card: 'generic', title: 'Update plugin bundles', kind: ['check', 'status'].includes(args.action) ? 'read' : 'other', rawInput: args }),
  }));
}

export const name = 'plugin-enhance';
export const inject = ['pluginManager', 'pluginMarket', 'profileContext'];
export const Config = PluginEnhance.Config;
export function apply(ctx, config) {
  ctx.plugin(PluginEnhance, config);
  ctx.inject(['pluginEnhance', 'tools', 'sandboxPolicy'], registerUpdateTool);
}

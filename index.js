import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { approveEscalation } from '@deepseek-ai/dsh-sandbox';
import { z } from 'zod';
import { createUpdateEngine, createUpdateState } from './engine.js';
import { createGithubResolver } from './github.js';
import { TYPERT_REMOTE } from './typert.remote-client.js';

const initializers = [];
// The official manager outlives this bundle's unload/reload. Retain only data,
// so a replacement service uses its new implementation and lookup controllers.
const UPDATE_STATE = Symbol.for('dsh-plugin-enhance.update-state');
export class PluginEnhance extends TypertRemoteService {
  static inject = ['pluginManager', 'pluginMarket', 'profileContext'];
  static Config = z.object({
    lookupTimeoutMs: z.number().int().min(1000).default(20000),
  });
  constructor(ctx, config = {}) {
    super(ctx, 'pluginEnhance');
    for (const initialize of initializers) initialize.call(this);
    const lookup = new AbortController();
    ctx.effect(() => () => lookup.abort(), 'plugin-enhance: cancel metadata lookup');
    this.engine = createUpdateEngine({
      manager: ctx.pluginManager, market: ctx.pluginMarket,
      resolveGithubMetadata: createGithubResolver({
        profile: ctx.profileContext, timeoutMs: config.lookupTimeoutMs, signal: lookup.signal,
      }),
      runtimeVersion: getDshRuntimeVersion(), selfName: 'dsh-plugin-enhance',
      state: ctx.pluginManager[UPDATE_STATE] ??= createUpdateState(),
    });
    ctx.on('plugin-manager/update-state', progress => this.engine.updateProgress(progress));
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
    description: 'Check and selectively update installed plugin bundles in this profile. check returns a generation and candidates; start requires that generation and exact names. Registry bundles use the native manager version listing and update API, which attempts to restore the previous version after target installation fails. Market and GitHub extensions remove then reinstall without automatic rollback; failed extensions can remain uninstalled. Poll status while a batch runs; retry failed items after fixing the cause. All calls require danger-full-access or approval. Build scripts and version exemptions are never approved by this tool; use plugin_manager with explicit user authorization for those.',
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

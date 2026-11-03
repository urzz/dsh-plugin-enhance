import { TYPERT_REMOTE } from './typert.remote-client.js';

export const TYPERT = {
  package: 'dsh-plugin-enhance',
  face: 'host',
  schemas: [],
  get invocations() { return TYPERT_REMOTE.descriptors; },
  model: {
    services: [{
      key: 'pluginEnhance', exportName: 'PluginEnhance',
      description: 'Check and selectively update installed plugin bundles.',
      members: ['check', 'start', 'status', 'retry'].map(name => ({
        kind: 'method', name, signature: `${name}(${name === 'start' ? 'selection: {generation: number; names: string[]}' : name === 'retry' ? 'selection: {names?: string[]}' : ''}): Promise<Snapshot>`,
        summary: TYPERT_REMOTE.methods[`pluginEnhance/${name}`].description,
      })),
    }],
    events: [], objects: [],
  },
};

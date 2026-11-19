// Plain JavaScript Remote descriptors built with the installed Typert public API.
import { z } from 'zod';
import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol/remote-info';

const codec = (name, create) => ({
  mode: 'strict', typeSymbol: `dsh-plugin-enhance#${name}`, create,
  get jsonSchema() { return z.toJSONSchema(create()); },
});
const selection = () => z.strictObject({ generation: z.number().int().nonnegative(), names: z.array(z.string().min(1)).min(1) });
const retry = () => z.strictObject({ names: z.array(z.string().min(1)).min(1).optional() });
const snapshot = () => z.record(z.string(), z.json());
const parameter = (name, create) => ({
  name, source: 'json', codec: codec(name, create), strictCodec: codec(name, create),
});
const method = (description, parameters) => ({
  service: 'pluginEnhance', invocation: { kind: 'direct' }, description, parameters,
  result: codec('Snapshot', snapshot),
});
export const TYPERT_REMOTE = createTypertRemoteInfo({
  package: 'dsh-plugin-enhance',
  methods: {
    'pluginEnhance/check': method('Check installed bundles for compatible updates.', []),
    'pluginEnhance/start': method('Queue updates for selected checked bundles.', [parameter('selection', selection)]),
    'pluginEnhance/status': method('Read the current update queue and outcomes.', []),
    'pluginEnhance/retry': method('Retry one failed update without granting build permission.', [parameter('selection', retry)]),
  },
}, z);

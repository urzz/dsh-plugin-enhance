window.__ModuleLoader__.load({id:'dsh-plugin-enhance',factory(require){const module={exports:{}};
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client.source.js
var client_source_exports = {};
__export(client_source_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_source_exports);

// typert.remote-client.js
var import_zod = require("zod");

// node_modules/@deepseek-ai/dsh-typert-protocol/lib/types/remote-info.js
function createTypertRemoteInfo(spec, zod) {
  return new RemoteInfo(spec, zod);
}
var RemoteInfo = class {
  spec;
  zod;
  index;
  constructor(spec, zod) {
    this.spec = spec;
    this.zod = zod;
  }
  get package() {
    return this.spec.package;
  }
  get descriptors() {
    return this.resolve().descriptors;
  }
  get methods() {
    return this.resolve().methods;
  }
  resolve() {
    if (this.index !== void 0)
      return this.index;
    const zod = this.zod;
    const descriptors = [];
    const methods = /* @__PURE__ */ Object.create(null);
    for (const [endpoint, definition] of Object.entries(this.spec.methods)) {
      const separator = endpoint.indexOf("/");
      const namespace = endpoint.slice(0, separator);
      const method2 = endpoint.slice(separator + 1);
      const parameters = definition.parameters.map((parameter2) => ({ ...parameter2, wire: parameter2.wire ?? parameter2.name }));
      const descriptor = {
        ...definition,
        id: `${this.spec.package}#${endpoint}`,
        namespace,
        method: method2,
        parameters,
        result: definition.result.description === void 0 ? definition.result : new ResultValue(definition.result)
      };
      if (definition.invocation.kind === "direct") {
        const inputs = [];
        const direct = Object.assign(descriptor, {
          input(options) {
            const strict = options?.strict === true;
            return inputs[strict ? 1 : 0] ??= new NamedInput(parameters, strict, zod);
          },
          invoke(remote, input, signal) {
            const named = input;
            const values = parameters.map((parameter2) => named[parameter2.wire]);
            if (definition.cancellation !== void 0)
              values.push(signal);
            const receiver = Reflect.get(remote, namespace);
            const call = Reflect.get(receiver, method2);
            return call.apply(receiver, values);
          }
        });
        methods[endpoint] = direct;
      }
      descriptors.push(descriptor);
    }
    return this.index = { descriptors, methods };
  }
};
function optional(parameter2) {
  return parameter2.source === "json" && parameter2.acceptsUndefined === true;
}
var NamedInput = class {
  parameters;
  strict;
  zod;
  schema;
  projection;
  constructor(parameters, strict, zod) {
    this.parameters = parameters;
    this.strict = strict;
    this.zod = zod;
  }
  codec(parameter2) {
    return this.strict ? parameter2.strictCodec : parameter2.codec;
  }
  create = () => this.schema ??= this.zod.strictObject(Object.fromEntries(this.parameters.map((parameter2) => {
    const value = this.codec(parameter2).create();
    return [parameter2.wire, optional(parameter2) ? value.optional() : value.nonoptional()];
  })));
  get jsonSchema() {
    return this.project().jsonSchema;
  }
  get jsonSchemaError() {
    return this.project().jsonSchemaError;
  }
  project() {
    if (this.projection !== void 0)
      return this.projection;
    const unavailable = this.parameters.find((parameter2) => this.codec(parameter2).jsonSchema === void 0);
    if (unavailable !== void 0) {
      return this.projection = { jsonSchemaError: this.codec(unavailable).jsonSchemaError ?? `No JSON Schema for parameter ${unavailable.wire}` };
    }
    return this.projection = {
      jsonSchema: {
        type: "object",
        properties: Object.fromEntries(this.parameters.map((parameter2) => [parameter2.wire, {
          ...this.codec(parameter2).jsonSchema,
          ...parameter2.description === void 0 ? {} : { description: parameter2.description }
        }])),
        required: this.parameters.filter((parameter2) => !optional(parameter2)).map((parameter2) => parameter2.wire),
        additionalProperties: false
      }
    };
  }
};
var ResultValue = class {
  spec;
  projection;
  constructor(spec) {
    this.spec = spec;
  }
  get mode() {
    return this.spec.mode;
  }
  get typeSymbol() {
    return this.spec.typeSymbol;
  }
  get create() {
    return this.spec.create;
  }
  get decode() {
    return this.spec.decode;
  }
  get encode() {
    return this.spec.encode;
  }
  get description() {
    return this.spec.description;
  }
  get jsonSchemaError() {
    return this.spec.jsonSchemaError;
  }
  get jsonSchema() {
    if (this.projection === void 0) {
      const schema = this.spec.jsonSchema;
      this.projection = { value: schema === void 0 ? void 0 : { ...schema, description: this.spec.description } };
    }
    return this.projection.value;
  }
};

// typert.remote-client.js
var codec = (name, create) => ({
  mode: "strict",
  typeSymbol: `dsh-plugin-enhance#${name}`,
  create,
  get jsonSchema() {
    return import_zod.z.toJSONSchema(create());
  }
});
var selection = () => import_zod.z.strictObject({ generation: import_zod.z.number().int().nonnegative(), names: import_zod.z.array(import_zod.z.string().min(1)).min(1) });
var retry = () => import_zod.z.strictObject({ names: import_zod.z.array(import_zod.z.string().min(1)).min(1).optional() });
var snapshot = () => import_zod.z.record(import_zod.z.string(), import_zod.z.json());
var parameter = (name, create) => ({
  name,
  source: "json",
  codec: codec(name, create),
  strictCodec: codec(name, create)
});
var method = (description, parameters) => ({
  service: "pluginEnhance",
  invocation: { kind: "direct" },
  description,
  parameters,
  result: codec("Snapshot", snapshot)
});
var TYPERT_REMOTE = createTypertRemoteInfo({
  package: "dsh-plugin-enhance",
  methods: {
    "pluginEnhance/check": method("Check installed bundles for compatible updates.", []),
    "pluginEnhance/start": method("Queue updates for selected checked bundles.", [parameter("selection", selection)]),
    "pluginEnhance/status": method("Read the current update queue and outcomes.", []),
    "pluginEnhance/retry": method("Retry one failed update without granting build permission.", [parameter("selection", retry)])
  }
}, import_zod.z);

// client.source.js
var React = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var h = React.createElement;
var copy = {
  en: { tab: "Updates", title: "Plugin updates", check: "Check for updates", selected: "Update selected", all: "Update all available", selectAll: "Select all available", retry: "Retry failed updates", empty: "Check for updates to load installed bundles.", none: "No installed bundles.", busy: "Working\u2026", name: "Plugin", version: "Version", state: "Status", details: "Details", notice: "Updates uninstall the old bundle before installing the new version. An installation failure can leave it uninstalled. Some changes require restarting DSH. Build scripts require separate approval in the plugin manager. The updater runs last; its tab may briefly disappear during reload. If it fails to return, reinstall it with the official plugin manager.", enabled: "Enabled", disabled: "Disabled", pending: "Review pending build scripts in the plugin manager before retrying.", loading: "Loading\u2026", ready: "Update available", current: "Up to date", skipped: "Skipped", error: "Failed", failed: "Failed", updating: "Updating", updated: "Updated", succeeded: "Updated", "restart-required": "Restart required", "pending-builds": "Build approval required", confirm: "I understand that a failed update may leave a plugin uninstalled.", source: "Source", blocked: "Unavailable", "check-failed": "Check failed", removing: "Removing old version", installing: "Installing", stale: "Changed; check again", builtin: "Updated with DSH.", "not-installed": "Not installed in this profile.", "not-removable": "Protected bundle.", "local-or-unknown-source": "Local or unknown source.", "invalid-current-version": "Invalid installed version.", incompatible: "Incompatible with this DSH version.", "unsupported-source": "This source needs a manual update.", "market-unavailable": "Market unavailable; check again before switching sources.", "not-bundle": "The target is not a bundle.", "bundle-changed": "The installed bundle changed; check again.", "installed-target-mismatch": "The installed version differs from the requested target." },
  zh: { tab: "\u66F4\u65B0", title: "\u63D2\u4EF6\u66F4\u65B0", check: "\u68C0\u67E5\u66F4\u65B0", selected: "\u66F4\u65B0\u6240\u9009", all: "\u66F4\u65B0\u5168\u90E8\u53EF\u66F4\u65B0\u9879", selectAll: "\u5168\u9009\u53EF\u66F4\u65B0\u9879", retry: "\u91CD\u8BD5\u5931\u8D25\u9879", empty: "\u70B9\u51FB\u68C0\u67E5\u66F4\u65B0\uFF0C\u8BFB\u53D6\u5DF2\u5B89\u88C5\u7EC4\u5408\u5305\u3002", none: "\u6CA1\u6709\u5DF2\u5B89\u88C5\u7EC4\u5408\u5305\u3002", busy: "\u6B63\u5728\u5904\u7406\u2026", name: "\u63D2\u4EF6", version: "\u7248\u672C", state: "\u72B6\u6001", details: "\u8BE6\u60C5", notice: "\u66F4\u65B0\u4F1A\u5148\u5378\u8F7D\u65E7\u7EC4\u5408\u5305\uFF0C\u518D\u5B89\u88C5\u65B0\u7248\u672C\u3002\u5B89\u88C5\u5931\u8D25\u53EF\u80FD\u5BFC\u81F4\u63D2\u4EF6\u5904\u4E8E\u672A\u5B89\u88C5\u72B6\u6001\uFF1B\u90E8\u5206\u53D8\u66F4\u9700\u8981\u91CD\u542F DSH\u3002\u6784\u5EFA\u811A\u672C\u9700\u8981\u5728\u63D2\u4EF6\u7BA1\u7406\u5668\u4E2D\u5355\u72EC\u6388\u6743\u3002\u66F4\u65B0\u5668\u81EA\u8EAB\u6392\u5728\u6700\u540E\uFF0C\u91CD\u8F7D\u65F6\u66F4\u65B0\u6807\u7B7E\u9875\u53EF\u80FD\u77ED\u6682\u6D88\u5931\uFF1B\u82E5\u672A\u6062\u590D\uFF0C\u8BF7\u7528\u5B98\u65B9\u63D2\u4EF6\u7BA1\u7406\u5668\u91CD\u65B0\u5B89\u88C5\u672C\u63D2\u4EF6\u3002", enabled: "\u5DF2\u542F\u7528", disabled: "\u5DF2\u505C\u7528", pending: "\u8BF7\u5728\u63D2\u4EF6\u7BA1\u7406\u5668\u4E2D\u68C0\u67E5\u5E76\u6388\u6743\u5F85\u5904\u7406\u7684\u6784\u5EFA\u811A\u672C\uFF0C\u7136\u540E\u91CD\u8BD5\u3002", loading: "\u52A0\u8F7D\u4E2D\u2026", ready: "\u53EF\u66F4\u65B0", current: "\u5DF2\u662F\u6700\u65B0", skipped: "\u5DF2\u8DF3\u8FC7", error: "\u5931\u8D25", failed: "\u5931\u8D25", updating: "\u66F4\u65B0\u4E2D", updated: "\u5DF2\u66F4\u65B0", succeeded: "\u5DF2\u66F4\u65B0", "restart-required": "\u9700\u8981\u91CD\u542F", "pending-builds": "\u9700\u8981\u811A\u672C\u6388\u6743", confirm: "\u6211\u5DF2\u4E86\u89E3\u66F4\u65B0\u5931\u8D25\u53EF\u80FD\u5BFC\u81F4\u63D2\u4EF6\u5904\u4E8E\u672A\u5B89\u88C5\u72B6\u6001\u3002", source: "\u6765\u6E90", blocked: "\u4E0D\u53EF\u66F4\u65B0", "check-failed": "\u68C0\u67E5\u5931\u8D25", removing: "\u6B63\u5728\u5378\u8F7D\u65E7\u7248", installing: "\u6B63\u5728\u5B89\u88C5", stale: "\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5", builtin: "\u968F DSH \u4E00\u8D77\u5347\u7EA7\u3002", "not-installed": "\u5F53\u524D profile \u672A\u5B89\u88C5\u3002", "not-removable": "\u53D7\u4FDD\u62A4\u7684\u7EC4\u5408\u5305\u3002", "local-or-unknown-source": "\u672C\u5730\u6216\u672A\u77E5\u6765\u6E90\u3002", "invalid-current-version": "\u5DF2\u5B89\u88C5\u7248\u672C\u53F7\u65E0\u6548\u3002", incompatible: "\u76EE\u6807\u7248\u672C\u4E0E\u5F53\u524D DSH \u4E0D\u517C\u5BB9\u3002", "unsupported-source": "\u6B64\u6765\u6E90\u9700\u8981\u624B\u52A8\u66F4\u65B0\u3002", "market-unavailable": "\u5E02\u573A\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u540E\u518D\u66F4\u65B0\u3002", "not-bundle": "\u76EE\u6807\u5305\u4E0D\u662F\u7EC4\u5408\u5305\u3002", "bundle-changed": "\u63D2\u4EF6\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u3002", "installed-target-mismatch": "\u5B9E\u9645\u5B89\u88C5\u7248\u672C\u4E0E\u76EE\u6807\u4E0D\u4E00\u81F4\u3002" }
};
Object.assign(copy.en, { onlyAvailable: "Only show available updates", noAvailable: "No updates available. View all plugins to see their status.", attention: "Needs attention" });
Object.assign(copy.zh, { onlyAvailable: "\u4EC5\u663E\u793A\u53EF\u66F4\u65B0", noAvailable: "\u6682\u65E0\u53EF\u66F4\u65B0\u9879\uFF0C\u53EF\u67E5\u770B\u5168\u90E8\u63D2\u4EF6\u4E86\u89E3\u72B6\u6001\u3002", attention: "\u9700\u5904\u7406" });
Object.assign(copy.en, { noAttention: "No plugins need attention.", selectAll: "Select visible updates", allPlugins: "All plugins", search: "Search plugins or sources", noMatch: "No matching plugins.", clear: "Clear filters", checking: "Checking for updates", update: "Update", retryOne: "Retry", deselect: "Clear selection", selectedCount: "selected", safety: "Update notes", lastChecked: "Last checked", notChecked: "Not checked yet", actions: "Actions", summary: "Installed bundles and update status" });
Object.assign(copy.zh, { noAttention: "\u6682\u65E0\u9700\u8981\u5904\u7406\u7684\u63D2\u4EF6\u3002", selectAll: "\u5168\u9009\u5F53\u524D\u53EF\u66F4\u65B0\u9879", allPlugins: "\u5168\u90E8\u63D2\u4EF6", search: "\u641C\u7D22\u63D2\u4EF6\u540D\u79F0\u6216\u6765\u6E90", noMatch: "\u6CA1\u6709\u5339\u914D\u7684\u63D2\u4EF6\u3002", clear: "\u6E05\u9664\u7B5B\u9009", checking: "\u6B63\u5728\u68C0\u67E5\u66F4\u65B0", update: "\u66F4\u65B0", retryOne: "\u91CD\u8BD5", deselect: "\u53D6\u6D88\u9009\u62E9", selectedCount: "\u9879\u5DF2\u9009\u62E9", safety: "\u66F4\u65B0\u987B\u77E5", lastChecked: "\u4E0A\u6B21\u68C0\u67E5", notChecked: "\u5C1A\u672A\u68C0\u67E5", actions: "\u64CD\u4F5C", summary: "\u5DF2\u5B89\u88C5\u7EC4\u5408\u5305\u53CA\u66F4\u65B0\u72B6\u6001" });
Object.assign(copy.en, { failureDetails: "Failure details", diagnostic: "Diagnostic", packageOutput: "Package manager output", exitCode: "Exit code", timedOut: "Package manager timed out.", outputTruncated: "Output shortened; see the full package manager log.", logPath: "Full log", buildBlocked: "Build scripts were blocked. Review the packages and explicitly approve their build scripts through the official plugin manager before retrying. This updater never grants build approval automatically." });
Object.assign(copy.zh, { failureDetails: "\u5931\u8D25\u8BE6\u60C5", diagnostic: "\u8BCA\u65AD\u4FE1\u606F", packageOutput: "\u5305\u7BA1\u7406\u5668\u8F93\u51FA", exitCode: "\u9000\u51FA\u7801", timedOut: "\u5305\u7BA1\u7406\u5668\u5DF2\u8D85\u65F6\u3002", outputTruncated: "\u8F93\u51FA\u5DF2\u622A\u77ED\uFF0C\u8BF7\u67E5\u770B\u5305\u7BA1\u7406\u5668\u5B8C\u6574\u65E5\u5FD7\u3002", logPath: "\u5B8C\u6574\u65E5\u5FD7", buildBlocked: "\u6784\u5EFA\u811A\u672C\u88AB\u963B\u6B62\u3002\u8BF7\u5148\u901A\u8FC7\u5B98\u65B9\u63D2\u4EF6\u7BA1\u7406\u5668\u68C0\u67E5\u76F8\u5173\u5305\uFF0C\u5E76\u660E\u786E\u6388\u6743\u5176\u6784\u5EFA\u811A\u672C\uFF0C\u7136\u540E\u91CD\u8BD5\u3002\u672C\u66F4\u65B0\u5668\u7EDD\u4E0D\u4F1A\u81EA\u52A8\u6388\u4E88\u6784\u5EFA\u6743\u9650\u3002" });
Object.assign(copy.en, { missingBuildList: "The plugin manager returned no packages awaiting approval. Check the failure details and DSH/pnpm compatibility before retrying." });
Object.assign(copy.zh, { missingBuildList: "\u63D2\u4EF6\u7BA1\u7406\u5668\u672A\u8FD4\u56DE\u5F85\u6388\u6743\u5305\u3002\u8BF7\u67E5\u770B\u5931\u8D25\u8BE6\u60C5\uFF0C\u5E76\u68C0\u67E5 DSH \u4E0E pnpm \u7684\u517C\u5BB9\u6027\u540E\u518D\u91CD\u8BD5\u3002" });
Object.assign(copy.en, { tab: "Enhanced management", title: "Enhanced management", support: "Update support", native: "Native support", extended: "Extended support", unavailable: "Unavailable", allSupport: "All support types", "no-installable-version": "No compatible stable version is available.", restoring: "Restoring previous version", restored: "Update failed; previous version restored", restoreDetails: "Restore details", notice: "Official updates use the plugin manager\u2019s update flow. Supplemental updates uninstall the old bundle before installing the new version; installation failure may leave it uninstalled. Some changes require restarting DSH. Build scripts require explicit approval in the official plugin manager. The updater runs last; if its tab does not return after reload, reinstall it with the official plugin manager." });
Object.assign(copy.zh, { tab: "\u589E\u5F3A\u7BA1\u7406", title: "\u589E\u5F3A\u7BA1\u7406", support: "\u66F4\u65B0\u652F\u6301\u7C7B\u578B", native: "\u539F\u751F\u652F\u6301", extended: "\u6269\u5C55\u652F\u6301", unavailable: "\u4E0D\u53EF\u7528", allSupport: "\u5168\u90E8\u652F\u6301\u7C7B\u578B", "no-installable-version": "\u6CA1\u6709\u517C\u5BB9\u7684\u6B63\u5F0F\u7248\u672C\u3002", restoring: "\u6B63\u5728\u6062\u590D\u65E7\u7248", restored: "\u66F4\u65B0\u5931\u8D25\uFF0C\u5DF2\u6062\u590D\u65E7\u7248", restoreDetails: "\u6062\u590D\u8BE6\u60C5", notice: "\u5B98\u65B9\u66F4\u65B0\u4F7F\u7528\u63D2\u4EF6\u7BA1\u7406\u5668\u7684\u66F4\u65B0\u6D41\u7A0B\u3002\u8865\u5145\u66F4\u65B0\u4F1A\u5148\u5378\u8F7D\u65E7\u7EC4\u5408\u5305\uFF0C\u518D\u5B89\u88C5\u65B0\u7248\u672C\uFF1B\u5B89\u88C5\u5931\u8D25\u53EF\u80FD\u5BFC\u81F4\u63D2\u4EF6\u5904\u4E8E\u672A\u5B89\u88C5\u72B6\u6001\u3002\u90E8\u5206\u53D8\u66F4\u9700\u8981\u91CD\u542F DSH\u3002\u6784\u5EFA\u811A\u672C\u9700\u8981\u5728\u5B98\u65B9\u63D2\u4EF6\u7BA1\u7406\u5668\u4E2D\u660E\u786E\u6388\u6743\u3002\u66F4\u65B0\u5668\u81EA\u8EAB\u6392\u5728\u6700\u540E\uFF1B\u82E5\u91CD\u8F7D\u540E\u6807\u7B7E\u9875\u672A\u6062\u590D\uFF0C\u8BF7\u7528\u5B98\u65B9\u63D2\u4EF6\u7BA1\u7406\u5668\u91CD\u65B0\u5B89\u88C5\u672C\u63D2\u4EF6\u3002" });
var itemGroups = [
  { label: "checking", states: ["checking"] },
  { label: "ready", states: ["ready"] },
  { label: "updating", states: ["removing", "installing", "restoring"] },
  { label: "attention", states: ["check-failed", "failed", "pending-builds", "stale", "restored"] },
  { label: "updated", states: ["succeeded", "restart-required"] },
  { label: "current", states: ["current"] },
  { label: "blocked", states: ["blocked"] }
];
var nameCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
var inject = ["slots", "locale", "remote"];
async function apply(ctx) {
  const unmount = await ctx.remote.$mount(TYPERT_REMOTE);
  ctx.effect(() => unmount);
  await ctx.inject(["remote.pluginEnhance"], registerUpdates);
}
function registerUpdates(ctx) {
  const ns = "dsh-plugin-enhance";
  ctx.effect(() => ctx.locale.register(ns, copy));
  const t = ctx.locale.bind(ns);
  const bounded = (text, limit) => text.length > limit ? `${text.slice(0, limit / 2)}
\u2026
${text.slice(-limit / 2)}` : text;
  function failureDetails(item, result = item.result, label = "failureDetails") {
    if (!["failed", "pending-builds", "restored"].includes(item.state)) return null;
    const diagnostic = result?.error?.diagnostic;
    const pkg = result?.packageResult;
    if (!diagnostic && !pkg) return null;
    const shortened = diagnostic?.length > 2e3 || pkg?.output?.length > 4e3 || pkg?.truncated;
    return h(
      "details",
      { className: "dpe-failure" },
      h("summary", null, t(label)),
      diagnostic && h("div", null, h("small", null, t("diagnostic")), h("pre", null, bounded(diagnostic, 2e3))),
      pkg && h(
        "div",
        null,
        h("small", null, `${pkg.kind ?? ""}${pkg.kind ? " \xB7 " : ""}${t("exitCode")}: ${pkg.exitCode}`),
        pkg.timedOut && h("p", null, t("timedOut")),
        pkg.output && h("div", null, h("small", null, t("packageOutput")), h("pre", null, bounded(pkg.output, 4e3))),
        pkg.logPath && h("small", null, `${t("logPath")}: ${bounded(pkg.logPath, 1e3)}`)
      ),
      shortened && h("p", null, t("outputTruncated"))
    );
  }
  function Updates() {
    React.useSyncExternalStore((fn) => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot());
    const [data, setData] = React.useState(null);
    const [selection2, setSelection] = React.useState([]);
    const [error, setError] = React.useState("");
    const [working, setWorking] = React.useState(false);
    const [filter, setFilter] = React.useState("all");
    const [query, setQuery] = React.useState("");
    const [support, setSupport] = React.useState("all");
    const mounted = React.useRef(true);
    async function call(method2, args) {
      const result = await ctx.remote.pluginEnhance[method2](...args === void 0 ? [] : [args]);
      if (!result.ok) throw result.error;
      return result.value;
    }
    React.useEffect(() => {
      mounted.current = true;
      let timer;
      let active = true;
      let initial = true;
      async function refresh() {
        try {
          const next = await call("status");
          if (!active) return;
          setData(next);
          if (initial && !next.checkedAt && !next.busy) execute("check");
          initial = false;
        } catch (e) {
          if (active) setError(e.message);
        }
        if (active) timer = setTimeout(refresh, 1200);
      }
      refresh();
      return () => {
        active = false;
        mounted.current = false;
        clearTimeout(timer);
      };
    }, []);
    async function execute(method2, args) {
      setWorking(true);
      setError("");
      try {
        const next = await call(method2, args);
        if (mounted.current) {
          setData(next);
          setSelection([]);
        }
      } catch (e) {
        if (mounted.current) setError(e.message);
      } finally {
        if (mounted.current) setWorking(false);
      }
    }
    const items = [...data?.items ?? []].sort((a, b) => nameCollator.compare(a.name, b.name) || a.name.localeCompare(b.name, "en"));
    const available = items.filter((item) => item.state === "ready");
    const attention = items.filter((item) => itemGroups.find((group) => group.label === "attention").states.includes(item.state));
    const matches = (item) => `${item.name} ${item.source ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    const visible = items.filter((item) => matches(item) && (support === "all" || item.support === support) && (filter === "all" || (filter === "ready" ? item.state === "ready" : attention.includes(item))));
    const selectable = visible.filter((item) => item.state === "ready");
    const selected = available.filter((item) => selection2.includes(item.name)).map((item) => item.name);
    const groups = itemGroups.map((group) => ({ ...group, items: visible.filter((item) => group.states.includes(item.state)) })).filter((group) => group.items.length);
    const busy = working || Boolean(data?.busy);
    const stateText = (value) => Object.hasOwn(copy.en, value) ? t(value) : value;
    const button = (label, action, disabled, primary = false) => h(import_dsh_client_ui_primitives.Button, { type: "button", size: "sm", variant: primary ? "primary" : "outline", onClick: action, disabled }, t(label));
    return h(
      "section",
      { className: "dpe", "aria-busy": busy },
      h("style", null, `
        .dpe{box-sizing:border-box;width:100%;max-width:1056px;min-width:0;margin:0 auto;padding:28px clamp(24px,4vw,48px) 48px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5}
        .dpe h2{margin:0;font-size:24px;font-weight:600;letter-spacing:-.5px}.dpe h3{font-size:14px;font-weight:600;margin:28px 0 12px}
        .dpe-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.dpe-toolbar,.dpe-filters,.dpe-support{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.dpe-toolbar{margin:16px 0}.dpe-filters{margin:24px 0 12px}.dpe-support{margin-bottom:16px}
        .dpe-search{margin-left:auto;min-width:180px;flex:1;max-width:320px}.dpe-notice{margin:20px 0;color:var(--dsw-alias-label-secondary);font-size:13px}.dpe summary{cursor:pointer}.dpe-notice p{line-height:1.7}
        .dpe-selection{padding:12px 0;border-block:1px solid var(--dsw-alias-border-l1)}.dpe-selection label{display:flex;align-items:center;gap:8px}.dpe-selection>span{margin-right:auto;color:var(--dsw-alias-label-secondary)}.dpe input[type=checkbox]{width:16px;height:16px;vertical-align:middle;accent-color:var(--dsw-alias-brand-primary)}
        .dpe-scroll{overflow-x:auto}.dpe table{border-collapse:collapse;width:100%;font-size:13px}.dpe th,.dpe td{padding:16px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--dsw-alias-border-l1)}.dpe th{font-weight:500;color:var(--dsw-alias-label-secondary)}.dpe td:first-child{min-width:160px;overflow-wrap:anywhere}.dpe td:nth-child(4){max-width:320px;overflow-wrap:anywhere}.dpe td:last-child{white-space:nowrap}.dpe td:last-child button+button{margin-left:8px}
        .dpe small{display:block;margin:4px 0;color:var(--dsw-alias-label-secondary)}.dpe-version{font-variant-numeric:tabular-nums}.dpe-badge{font-size:12px}.dpe-attention{color:var(--dsw-alias-state-error-primary)}.dpe-empty{padding:40px 0;text-align:center;color:var(--dsw-alias-label-secondary)}.dpe-error{color:var(--dsw-alias-state-error-primary);white-space:pre-wrap}.dpe pre{white-space:pre-wrap;overflow-wrap:anywhere}.dpe-failure{margin-top:8px}.dpe-failure pre{max-height:240px;overflow:auto}.dpe :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
        @media(max-width:767px){.dpe{padding:24px 20px 40px}.dpe-header{align-items:flex-start;flex-direction:column;gap:0}.dpe-search{order:-1;flex-basis:100%;max-width:none}.dpe table,.dpe tbody{display:block}.dpe thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.dpe tr{display:grid;grid-template-columns:1fr auto;padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}.dpe td{display:block;border:0;padding:4px 0}.dpe td:first-child{min-width:0}.dpe td:nth-child(4){max-width:none;grid-column:1/-1}.dpe td:last-child{grid-column:1/-1}.dpe-selection{position:static}}
      `),
      h(
        "header",
        { className: "dpe-header" },
        h("div", null, h("h2", null, t("title")), h("small", null, data?.checkedAt ? `${t("lastChecked")}: ${new Date(data.checkedAt).toLocaleString()}` : t("notChecked"))),
        h(
          "div",
          { className: "dpe-toolbar" },
          button("check", () => execute("check"), busy),
          button("all", () => execute("start", { generation: data.generation, names: available.map((item) => item.name) }), busy || !available.length, true)
        )
      ),
      h("details", { className: "dpe-notice" }, h("summary", null, t("safety")), h("p", null, t("notice"))),
      h(
        "div",
        { className: "dpe-filters", role: "group", "aria-label": t("summary") },
        ...[["all", "allPlugins", items.length], ["ready", "ready", available.length], ["attention", "attention", attention.length]].map(([value, label, count]) => h(import_dsh_client_ui_primitives.Button, { key: value, type: "button", size: "sm", variant: filter === value ? "primary" : "outline", "aria-pressed": filter === value, onClick: () => setFilter(value) }, `${t(label)} (${count})`)),
        h(import_dsh_client_ui_primitives.Input, { type: "search", className: "dpe-search", "aria-label": t("search"), placeholder: t("search"), value: query, onChange: (e) => setQuery(e.target.value) })
      ),
      h(
        "div",
        { className: "dpe-support", role: "group", "aria-label": t("support") },
        ...["all", "native", "extended", "unavailable"].map((value) => h(import_dsh_client_ui_primitives.Button, { key: value, type: "button", size: "sm", variant: support === value ? "primary" : "outline", "aria-pressed": support === value, onClick: () => setSupport(value) }, `${t(value === "all" ? "allSupport" : value)} (${value === "all" ? items.length : items.filter((item) => item.support === value).length})`))
      ),
      h(
        "div",
        { className: "dpe-toolbar dpe-selection" },
        h("label", null, h("input", {
          type: "checkbox",
          "aria-label": t("selectAll"),
          checked: selectable.length > 0 && selectable.every((item) => selected.includes(item.name)),
          disabled: busy || !selectable.length,
          onChange: (e) => setSelection(e.target.checked ? [.../* @__PURE__ */ new Set([...selected, ...selectable.map((item) => item.name)])] : selected.filter((name) => !selectable.some((item) => item.name === name)))
        }), " ", t("selectAll")),
        h("span", null, `${selected.length} ${t("selectedCount")}`),
        selected.length > 0 && button("deselect", () => setSelection([]), busy),
        button("selected", () => execute("start", { generation: data.generation, names: selected }), busy || !selected.length, true),
        items.some((item) => item.retryable) && button("retry", () => execute("retry", {}), busy)
      ),
      h("div", { role: "status", "aria-live": "polite" }, busy ? t(data?.run ? "busy" : "checking") : !data && !error ? t("loading") : ""),
      error && h("p", { className: "dpe-error", role: "alert" }, error),
      !items.length ? h("p", { className: "dpe-empty" }, t(busy || !data ? "loading" : data.checkedAt ? "none" : "notChecked")) : !groups.length ? h("div", { className: "dpe-empty" }, h("p", null, t(query.trim() || support !== "all" ? "noMatch" : filter === "attention" ? "noAttention" : "noAvailable")), button("clear", () => {
        setQuery("");
        setFilter("all");
        setSupport("all");
      }, false)) : groups.map((group) => h(
        "section",
        { key: group.label, "aria-label": t(group.label) },
        h("h3", null, `${t(group.label)} (${group.items.length})`),
        h("div", { className: "dpe-scroll" }, h(
          "table",
          { "aria-label": t(group.label) },
          h("thead", null, h("tr", null, ...["name", "version", "state", "details", "actions"].map((key) => h("th", { key, scope: "col" }, t(key))))),
          h("tbody", null, group.items.map((item) => h(
            "tr",
            { key: item.name },
            h("td", null, h("label", null, h("input", { type: "checkbox", "aria-label": item.name, disabled: busy || item.state !== "ready", checked: selection2.includes(item.name), onChange: (e) => setSelection((values) => e.target.checked ? [...values, item.name] : values.filter((value) => value !== item.name)) }), " ", item.name), h("small", null, t(item.enabled ? "enabled" : "disabled")), h(import_dsh_client_ui_primitives.Tag, { tone: "neutral" }, t(item.support))),
            h("td", { className: "dpe-version" }, item.currentVersion ?? "\u2014", item.target && h("small", null, `\u2192 ${item.target.version}`)),
            h("td", null, h("span", { className: `dpe-badge dpe-${group.label}` }, stateText(item.state))),
            h("td", null, item.reason && stateText(item.reason), item.result?.packageResult?.kind === "build-blocked" ? h("p", null, t("buildBlocked"), !item.result.pendingBuilds?.length && h("span", null, " ", t("missingBuildList"))) : item.state === "pending-builds" && h("p", null, t("pending")), failureDetails(item), item.restoreResult && failureDetails(item, item.restoreResult, "restoreDetails"), h("small", null, item.source)),
            h(
              "td",
              null,
              item.state === "ready" && button("update", () => execute("start", { generation: data.generation, names: [item.name] }), busy),
              item.retryable && button("retryOne", () => execute("retry", { names: [item.name] }), busy)
            )
          )))
        ))
      )),
      data?.marketErrors?.map((entry, index) => h("p", { key: `${entry.url}:${index}`, className: "dpe-error", role: "alert" }, entry.url ? `${entry.url}: ${entry.message}` : entry.message))
    );
  }
  ctx.slots.inject("plugins.tab", () => ctx.slots.register({ name: "plugins.tab", id: "dsh-plugin-enhance-updates", order: 30, label: () => t("tab") }, Updates));
}
return module.exports;}});

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
var h = React.createElement;
var copy = {
  en: { tab: "Updates", title: "Plugin updates", check: "Check for updates", selected: "Update selected", all: "Update all available", selectAll: "Select all available", retry: "Retry failed updates", empty: "Check for updates to load installed bundles.", none: "No installed bundles.", busy: "Working\u2026", name: "Plugin", version: "Version", state: "Status", details: "Details", notice: "Updates uninstall the old bundle before installing the new version. An installation failure can leave it uninstalled. Some changes require restarting DSH. Build scripts require separate approval in the plugin manager. The updater runs last; its tab may briefly disappear during reload. If it fails to return, reinstall it with the official plugin manager.", enabled: "Enabled", disabled: "Disabled", pending: "Review pending build scripts in the plugin manager before retrying.", loading: "Loading\u2026", ready: "Update available", current: "Up to date", skipped: "Skipped", error: "Failed", failed: "Failed", updating: "Updating", updated: "Updated", succeeded: "Updated", "restart-required": "Restart required", "pending-builds": "Build approval required", confirm: "I understand that a failed update may leave a plugin uninstalled.", source: "Source", blocked: "Unavailable", "check-failed": "Check failed", removing: "Removing old version", installing: "Installing", stale: "Changed; check again", builtin: "Updated with DSH.", "not-installed": "Not installed in this profile.", "not-removable": "Protected bundle.", "local-or-unknown-source": "Local or unknown source.", "invalid-current-version": "Invalid installed version.", incompatible: "Incompatible with this DSH version.", "unsupported-source": "This source needs a manual update.", "market-unavailable": "Market unavailable; check again before switching sources.", "not-bundle": "The target is not a bundle.", "bundle-changed": "The installed bundle changed; check again.", "installed-target-mismatch": "The installed version differs from the requested target." },
  zh: { tab: "\u66F4\u65B0", title: "\u63D2\u4EF6\u66F4\u65B0", check: "\u68C0\u67E5\u66F4\u65B0", selected: "\u66F4\u65B0\u6240\u9009", all: "\u66F4\u65B0\u5168\u90E8\u53EF\u66F4\u65B0\u9879", selectAll: "\u5168\u9009\u53EF\u66F4\u65B0\u9879", retry: "\u91CD\u8BD5\u5931\u8D25\u9879", empty: "\u70B9\u51FB\u68C0\u67E5\u66F4\u65B0\uFF0C\u8BFB\u53D6\u5DF2\u5B89\u88C5\u7EC4\u5408\u5305\u3002", none: "\u6CA1\u6709\u5DF2\u5B89\u88C5\u7EC4\u5408\u5305\u3002", busy: "\u6B63\u5728\u5904\u7406\u2026", name: "\u63D2\u4EF6", version: "\u7248\u672C", state: "\u72B6\u6001", details: "\u8BE6\u60C5", notice: "\u66F4\u65B0\u4F1A\u5148\u5378\u8F7D\u65E7\u7EC4\u5408\u5305\uFF0C\u518D\u5B89\u88C5\u65B0\u7248\u672C\u3002\u5B89\u88C5\u5931\u8D25\u53EF\u80FD\u5BFC\u81F4\u63D2\u4EF6\u5904\u4E8E\u672A\u5B89\u88C5\u72B6\u6001\uFF1B\u90E8\u5206\u53D8\u66F4\u9700\u8981\u91CD\u542F DSH\u3002\u6784\u5EFA\u811A\u672C\u9700\u8981\u5728\u63D2\u4EF6\u7BA1\u7406\u5668\u4E2D\u5355\u72EC\u6388\u6743\u3002\u66F4\u65B0\u5668\u81EA\u8EAB\u6392\u5728\u6700\u540E\uFF0C\u91CD\u8F7D\u65F6\u66F4\u65B0\u6807\u7B7E\u9875\u53EF\u80FD\u77ED\u6682\u6D88\u5931\uFF1B\u82E5\u672A\u6062\u590D\uFF0C\u8BF7\u7528\u5B98\u65B9\u63D2\u4EF6\u7BA1\u7406\u5668\u91CD\u65B0\u5B89\u88C5\u672C\u63D2\u4EF6\u3002", enabled: "\u5DF2\u542F\u7528", disabled: "\u5DF2\u505C\u7528", pending: "\u8BF7\u5728\u63D2\u4EF6\u7BA1\u7406\u5668\u4E2D\u68C0\u67E5\u5E76\u6388\u6743\u5F85\u5904\u7406\u7684\u6784\u5EFA\u811A\u672C\uFF0C\u7136\u540E\u91CD\u8BD5\u3002", loading: "\u52A0\u8F7D\u4E2D\u2026", ready: "\u53EF\u66F4\u65B0", current: "\u5DF2\u662F\u6700\u65B0", skipped: "\u5DF2\u8DF3\u8FC7", error: "\u5931\u8D25", failed: "\u5931\u8D25", updating: "\u66F4\u65B0\u4E2D", updated: "\u5DF2\u66F4\u65B0", succeeded: "\u5DF2\u66F4\u65B0", "restart-required": "\u9700\u8981\u91CD\u542F", "pending-builds": "\u9700\u8981\u811A\u672C\u6388\u6743", confirm: "\u6211\u5DF2\u4E86\u89E3\u66F4\u65B0\u5931\u8D25\u53EF\u80FD\u5BFC\u81F4\u63D2\u4EF6\u5904\u4E8E\u672A\u5B89\u88C5\u72B6\u6001\u3002", source: "\u6765\u6E90", blocked: "\u4E0D\u53EF\u66F4\u65B0", "check-failed": "\u68C0\u67E5\u5931\u8D25", removing: "\u6B63\u5728\u5378\u8F7D\u65E7\u7248", installing: "\u6B63\u5728\u5B89\u88C5", stale: "\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5", builtin: "\u968F DSH \u4E00\u8D77\u5347\u7EA7\u3002", "not-installed": "\u5F53\u524D profile \u672A\u5B89\u88C5\u3002", "not-removable": "\u53D7\u4FDD\u62A4\u7684\u7EC4\u5408\u5305\u3002", "local-or-unknown-source": "\u672C\u5730\u6216\u672A\u77E5\u6765\u6E90\u3002", "invalid-current-version": "\u5DF2\u5B89\u88C5\u7248\u672C\u53F7\u65E0\u6548\u3002", incompatible: "\u76EE\u6807\u7248\u672C\u4E0E\u5F53\u524D DSH \u4E0D\u517C\u5BB9\u3002", "unsupported-source": "\u6B64\u6765\u6E90\u9700\u8981\u624B\u52A8\u66F4\u65B0\u3002", "market-unavailable": "\u5E02\u573A\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u540E\u518D\u66F4\u65B0\u3002", "not-bundle": "\u76EE\u6807\u5305\u4E0D\u662F\u7EC4\u5408\u5305\u3002", "bundle-changed": "\u63D2\u4EF6\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u3002", "installed-target-mismatch": "\u5B9E\u9645\u5B89\u88C5\u7248\u672C\u4E0E\u76EE\u6807\u4E0D\u4E00\u81F4\u3002" }
};
Object.assign(copy.en, { onlyAvailable: "Only show available updates", noAvailable: "No updates available. Clear \u201COnly show available updates\u201D to view all bundles.", attention: "Needs attention" });
Object.assign(copy.zh, { onlyAvailable: "\u4EC5\u663E\u793A\u53EF\u66F4\u65B0", noAvailable: "\u6682\u65E0\u53EF\u66F4\u65B0\u9879\u3002\u53D6\u6D88\u201C\u4EC5\u663E\u793A\u53EF\u66F4\u65B0\u201D\u53EF\u67E5\u770B\u5168\u90E8\u7EC4\u5408\u5305\u3002", attention: "\u9700\u5904\u7406" });
var itemGroups = [
  { label: "ready", states: ["ready"] },
  { label: "updating", states: ["removing", "installing"] },
  { label: "attention", states: ["check-failed", "failed", "pending-builds", "stale"] },
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
  function Updates() {
    React.useSyncExternalStore((fn) => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot());
    const [data, setData] = React.useState(null);
    const [selection2, setSelection] = React.useState([]);
    const [error, setError] = React.useState("");
    const [working, setWorking] = React.useState(false);
    const [onlyAvailable, setOnlyAvailable] = React.useState(true);
    const mounted = React.useRef(true);
    async function call(method2, args) {
      const result = await ctx.remote.pluginEnhance[method2](...args === void 0 ? [] : [args]);
      if (!result.ok) throw result.error;
      return result.value;
    }
    React.useEffect(() => {
      mounted.current = true;
      let timer;
      async function refresh() {
        try {
          const next = await call("status");
          if (mounted.current) setData(next);
        } catch (e) {
          if (mounted.current) setError(e.message);
        }
        if (mounted.current) timer = setTimeout(refresh, 1200);
      }
      refresh();
      return () => {
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
    const groups = itemGroups.filter((group) => !onlyAvailable || group.label === "ready").map((group) => ({ ...group, items: items.filter((item) => group.states.includes(item.state)) })).filter((group) => group.items.length);
    const busy = working || Boolean(data?.busy);
    const stateText = (value) => Object.hasOwn(copy.en, value) ? t(value) : value;
    const button = (label, action, disabled) => h("button", { type: "button", onClick: action, disabled, className: "dpe-button" }, t(label));
    return h(
      "section",
      { className: "dpe", "aria-busy": busy },
      h("style", null, ".dpe{color:var(--dsw-alias-label-primary);padding:20px;max-width:1100px;margin:auto}.dpe-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.dpe-button{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 12px;cursor:pointer}.dpe-button:disabled{opacity:.45;cursor:default}.dpe-button:focus-visible,.dpe input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.dpe-notice{color:var(--dsw-alias-label-secondary);line-height:1.6}.dpe-scroll{overflow-x:auto}.dpe table{border-collapse:collapse;width:100%;margin-top:16px;font-size:13px}.dpe th,.dpe td{padding:12px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);text-align:left;vertical-align:top}.dpe small{display:block;color:var(--dsw-alias-label-secondary);margin-top:4px}.dpe-error{color:var(--dsw-alias-state-error-primary);white-space:pre-wrap}.dpe pre{white-space:pre-wrap;overflow-wrap:anywhere}"),
      h("h2", null, t("title")),
      h("p", { className: "dpe-notice" }, t("notice")),
      h(
        "div",
        { className: "dpe-toolbar" },
        button("check", () => execute("check"), busy),
        button("selectAll", () => setSelection(available.map((item) => item.name)), busy || !available.length),
        button("selected", () => execute("start", { generation: data.generation, names: selection2 }), busy || !selection2.length),
        button("all", () => execute("start", { generation: data.generation, names: available.map((item) => item.name) }), busy || !available.length),
        button("retry", () => execute("retry", {}), busy || !items.some((item) => item.retryable))
      ),
      busy && h("p", { role: "status" }, t("busy")),
      error && h("p", { className: "dpe-error", role: "alert" }, error),
      h("label", null, h("input", { type: "checkbox", checked: onlyAvailable, onChange: (e) => setOnlyAvailable(e.target.checked) }), " ", t("onlyAvailable")),
      !items.length ? h("p", null, t(data?.checkedAt ? "none" : "empty")) : !groups.length ? h("p", { role: "status" }, t("noAvailable")) : groups.map((group) => h(
        "section",
        { key: group.label, "aria-label": t(group.label) },
        h("h3", null, `${t(group.label)} (${group.items.length})`),
        h("div", { className: "dpe-scroll" }, h(
          "table",
          { "aria-label": t(group.label) },
          h("thead", null, h("tr", null, ...["name", "version", "state", "details"].map((key) => h("th", { key, scope: "col" }, t(key))))),
          h("tbody", null, group.items.map((item) => h(
            "tr",
            { key: item.name },
            h("td", null, h("label", null, h("input", { type: "checkbox", "aria-label": item.name, disabled: busy || item.state !== "ready", checked: selection2.includes(item.name), onChange: (e) => setSelection((values) => e.target.checked ? [...values, item.name] : values.filter((value) => value !== item.name)) }), " ", item.name), h("small", null, t(item.enabled ? "enabled" : "disabled"))),
            h("td", null, item.currentVersion, item.target && ` \u2192 ${item.target.version}`),
            h("td", null, stateText(item.state)),
            h("td", null, item.reason && stateText(item.reason), item.state === "pending-builds" && h("p", null, t("pending")), h("small", null, item.source))
          )))
        ))
      )),
      data?.marketErrors?.map((entry) => h("p", { key: entry.url, className: "dpe-error", role: "alert" }, `${entry.url}: ${entry.message}`))
    );
  }
  ctx.slots.inject("plugins.tab", () => ctx.slots.register({ name: "plugins.tab", id: "dsh-plugin-enhance-updates", order: 30, label: () => t("tab") }, Updates));
}
return module.exports;}});

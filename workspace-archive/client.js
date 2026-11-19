window.__ModuleLoader__.load({id:'dsh-plugin-enhance-workspace-archive',factory(require){const module={exports:{}};
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

// workspace-archive/client.source.js
var client_source_exports = {};
__export(client_source_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_source_exports);

// workspace-client.js
var import_react = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var h = import_react.default.createElement;
var NS = "dsh-plugin-enhance.workspace";
var archiveStyles = `
.enhance-archive-modal {
  width: min(480px, 100%);
  max-height: 100%;
  font-family: inherit;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
}
.enhance-archive-modal .enhance-archive-content {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.enhance-archive-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}
.enhance-archive-list { margin: 12px 0 0; padding: 0; list-style: none; }
.enhance-archive-row { padding: 8px 0; min-width: 0; }
.enhance-archive-row .enhance-archive-checkbox {
  display: flex;
  align-items: flex-start;
  min-width: 0;
  overflow-wrap: anywhere;
}
.enhance-archive-checkbox input { margin-top: 2px; }
.enhance-archive-checkbox span { min-width: 0; }
.enhance-archive-meta {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.enhance-archive-status { margin: 4px 0 0 22px; }
.enhance-archive-error { color: var(--dsw-alias-state-error-primary); }
.enhance-archive-error-message { margin: 2px 0 0; white-space: pre-wrap; }
.enhance-archive-footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.enhance-archive-retry { margin-top: 8px; align-self: flex-start; }
`;
var messages = {
  en: { title: "Archive sessions in bulk", description: "Choose sessions to archive. Active sessions may fail; running work is not stopped.", all: "Select all selectable sessions", selected: "Selected", archive: "Archive selected", close: "Close", pending: "Archiving\u2026", success: "Archived", archived: "Already archived", failed: "Failed", removed: "Session is no longer in this workspace.", denied: "Archive permission is unavailable.", empty: "No sessions in this workspace.", retry: "Select failed sessions", missing: "Workspace is no longer available." },
  zh: { title: "\u6279\u91CF\u5F52\u6863\u4F1A\u8BDD", description: "\u9009\u62E9\u8981\u5F52\u6863\u7684\u4F1A\u8BDD\u3002\u6D3B\u8DC3\u4F1A\u8BDD\u53EF\u80FD\u5931\u8D25\uFF0C\u4E0D\u4F1A\u505C\u6B62\u8FD0\u884C\u4E2D\u7684\u5DE5\u4F5C\u3002", all: "\u5168\u9009\u53EF\u9009\u4F1A\u8BDD", selected: "\u5DF2\u9009\u62E9", archive: "\u5F52\u6863\u6240\u9009\u4F1A\u8BDD", close: "\u5173\u95ED", pending: "\u6B63\u5728\u5F52\u6863\u2026", success: "\u5DF2\u5F52\u6863", archived: "\u5DF2\u7ECF\u5F52\u6863", failed: "\u5931\u8D25", removed: "\u4F1A\u8BDD\u5DF2\u4E0D\u5C5E\u4E8E\u6B64\u5DE5\u4F5C\u533A\u3002", denied: "\u5F53\u524D\u6CA1\u6709\u5F52\u6863\u6743\u9650\u3002", empty: "\u6B64\u5DE5\u4F5C\u533A\u6CA1\u6709\u4F1A\u8BDD\u3002", retry: "\u9009\u62E9\u5931\u8D25\u4F1A\u8BDD", missing: "\u5DE5\u4F5C\u533A\u5DF2\u4E0D\u5B58\u5728\u3002" }
};
function registerWorkspaceArchive(ctx) {
  let alive = true;
  let state = { request: null, selected: [], results: {}, busy: false };
  const listeners = /* @__PURE__ */ new Set();
  const update = (patch) => {
    if (alive) {
      state = { ...state, ...patch };
      for (const listener of listeners) listener();
    }
  };
  const source = { getSnapshot: () => state, subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  } };
  const t = ctx.locale.bind(NS);
  const workspace = (id) => ctx.workspaces.list.getSnapshot().items.find((row) => row.workspaceId === id);
  const allowed = (id) => ctx.remoteAccess.source("session", id, "workspace/archiveSession").getSnapshot();
  const archived = (id) => ctx.workspaces.list.getSnapshot().archivedSessionIds.includes(id);
  const eligible = (id) => workspace(state.request?.workspaceId)?.sessionIds.includes(id) && !archived(id) && state.results[id]?.status !== "success" && allowed(id);
  const close = () => {
    if (!state.busy) update({ request: null, selected: [], results: {} });
  };
  async function archive() {
    if (!alive || state.busy || !state.request) return;
    const ids = [...state.selected];
    if (!ids.length) return;
    const workspaceId = state.request.workspaceId;
    update({ busy: true, selected: [] });
    for (const id of ids) {
      if (!alive) break;
      let result;
      if (!workspace(workspaceId)?.sessionIds.includes(id)) result = { status: "failed", message: t("removed") };
      else if (archived(id)) result = { status: "archived" };
      else if (!allowed(id)) result = { status: "failed", message: t("denied") };
      else {
        update({ results: { ...state.results, [id]: { status: "pending" } } });
        try {
          await ctx.workspaces.archiveSession(id);
          result = { status: "success" };
        } catch (error) {
          result = { status: "failed", message: error instanceof Error ? error.message : String(error) };
        }
      }
      update({ results: { ...state.results, [id]: result } });
    }
    update({ busy: false });
  }
  function Overlay() {
    const current = import_react.default.useSyncExternalStore(source.subscribe, source.getSnapshot);
    const list = import_react.default.useSyncExternalStore((fn) => ctx.workspaces.list.subscribe(fn), () => ctx.workspaces.list.getSnapshot());
    const sessions = import_react.default.useSyncExternalStore((fn) => ctx.sessions.list.subscribe(fn), () => ctx.sessions.list.getSnapshot());
    import_react.default.useSyncExternalStore((fn) => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot());
    const permissionIds = list.items.find((item) => item.workspaceId === current.request?.workspaceId)?.sessionIds ?? [];
    import_react.default.useSyncExternalStore((listener) => {
      const disposers = permissionIds.map((id) => ctx.remoteAccess.source("session", id, "workspace/archiveSession").subscribe(listener));
      return () => disposers.forEach((dispose) => dispose());
    }, () => permissionIds.map((id) => allowed(id) ? "1" : "0").join(""));
    if (!current.request) return null;
    const row = list.items.find((item) => item.workspaceId === current.request.workspaceId);
    const ids = [.../* @__PURE__ */ new Set([...row?.sessionIds ?? [], ...Object.keys(current.results)])];
    const available = ids.filter(eligible);
    const selected = current.selected.filter((id) => available.includes(id));
    const toggle = (id, checked) => {
      if (!state.busy) update({ selected: checked ? [.../* @__PURE__ */ new Set([...state.selected, id])] : state.selected.filter((value) => value !== id) });
    };
    return h(
      import_dsh_client_ui_primitives.Modal,
      {
        open: true,
        className: "enhance-archive-modal",
        contentClassName: "enhance-archive-content",
        title: t("title"),
        description: `${current.request.displayTitle} \u2014 ${t("description")}`,
        closeLabel: t("close"),
        onClose: close,
        footer: h(
          "div",
          { className: "enhance-archive-footer" },
          h(import_dsh_client_ui_primitives.Button, { variant: "outline", disabled: current.busy, onClick: close }, t("close")),
          h(import_dsh_client_ui_primitives.Button, { variant: "primary", disabled: current.busy || !selected.length, onClick: archive }, t(current.busy ? "pending" : "archive"))
        )
      },
      h("style", null, archiveStyles),
      !row && h("p", { role: "alert", className: "enhance-archive-meta enhance-archive-error" }, t("missing")),
      h(
        "div",
        { className: "enhance-archive-toolbar" },
        h(import_dsh_client_ui_primitives.Checkbox, { label: t("all"), disabled: current.busy || !available.length, checked: available.length > 0 && selected.length === available.length, onChange: (checked) => {
          if (!state.busy) update({ selected: checked ? available : [] });
        } }),
        h("p", { className: "enhance-archive-meta", role: "status", "aria-live": "polite" }, `${t("selected")}: ${selected.length}`)
      ),
      Object.values(current.results).some((result) => result.status === "failed") && h(import_dsh_client_ui_primitives.Button, { className: "enhance-archive-retry", variant: "outline", disabled: current.busy || !available.some((id) => current.results[id]?.status === "failed"), onClick: () => {
        if (!state.busy) update({ selected: available.filter((id) => state.results[id]?.status === "failed") });
      } }, t("retry")),
      !ids.length && h("p", { className: "enhance-archive-meta" }, t("empty")),
      h("ul", { className: "enhance-archive-list" }, ids.map((id) => {
        const result = current.results[id];
        const status = result?.status === "success" ? "success" : list.archivedSessionIds.includes(id) ? "archived" : result?.status;
        return h(
          "li",
          { key: id, className: "enhance-archive-row" },
          h(import_dsh_client_ui_primitives.Checkbox, { className: "enhance-archive-checkbox", label: sessions.byId[id]?.displayTitle ?? id, checked: selected.includes(id), disabled: current.busy || !eligible(id), onChange: (checked) => toggle(id, checked) }),
          status && h("div", { className: `enhance-archive-meta enhance-archive-status${status === "failed" ? " enhance-archive-error" : ""}`, role: status === "failed" ? "alert" : "status" }, t(status), status === "failed" && h("p", { className: "enhance-archive-error-message" }, result.message))
        );
      }))
    );
  }
  ctx.effect(() => ctx.locale.register(NS, messages));
  ctx.effect(() => () => {
    alive = false;
    listeners.clear();
  });
  ctx.effect(() => ctx.contextMenus.register({
    id: "enhance.workspace.archive",
    target: "workspace",
    order: 200,
    resolve: ({ workspaceId, displayTitle }) => workspace(workspaceId)?.sessionIds.some(allowed) ? [{ id: "archive-batch", label: t("title"), run: () => {
      if (alive && !state.busy && workspace(workspaceId)) update({ request: { workspaceId, displayTitle }, selected: [], results: {} });
    } }] : []
  }));
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({ name: "shell.overlay", id: "enhance.workspace.archive" }, Overlay));
}

// workspace-archive/client.source.js
var inject = ["slots", "locale", "contextMenus", "workspaces", "sessions", "remoteAccess"];
var apply = registerWorkspaceArchive;
return module.exports;}});

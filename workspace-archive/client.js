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

// workspace-archive/workspace-client.js
var import_react = __toESM(require("react"), 1);
var h = import_react.default.createElement;
var NS = "dsh-plugin-enhance.workspace";
var archiveStyles = `
.enhance-archive-modal {
  box-sizing: border-box; width: min(480px, calc(100vw - 48px));
  max-height: calc(100dvh - 2 * max(24px, var(--dsh-frame-overlay-top, 24px)));
  margin: auto; padding: 24px; border: 0; border-radius: var(--dsw-radius-panel);
  background: var(--dsw-alias-bg-layer-2); box-shadow: var(--dsw-elevation-prominent);
  font: inherit; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere;
}
.enhance-archive-modal[open] { display: flex; flex-direction: column; gap: 20px; }
.enhance-archive-modal::backdrop { background: var(--dsw-alias-bg-mask-1); backdrop-filter: var(--dsw-mask-blur); }
.enhance-archive-header, .enhance-archive-toolbar, .enhance-archive-footer { display: flex; align-items: center; gap: 8px 16px; }
.enhance-archive-header, .enhance-archive-toolbar { justify-content: space-between; }
.enhance-archive-header h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.enhance-archive-description { margin: 0; font-size: 14px; line-height: 22px; }
.enhance-archive-content { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.enhance-archive-toolbar, .enhance-archive-footer { flex-wrap: wrap; }
.enhance-archive-list { margin: 12px 0 0; padding: 0; list-style: none; }
.enhance-archive-row { padding: 8px 0; min-width: 0; }
.enhance-archive-checkbox { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
.enhance-archive-checkbox input { flex: none; margin: 3px 0 0; accent-color: var(--dsw-alias-brand-primary); }
.enhance-archive-checkbox span { min-width: 0; }
.enhance-archive-meta { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.enhance-archive-status { margin: 4px 0 0 22px; }
.enhance-archive-error { color: var(--dsw-alias-state-error-primary); }
.enhance-archive-error-message { margin: 2px 0 0; white-space: pre-wrap; }
.enhance-archive-footer { justify-content: flex-end; }
.enhance-archive-button { padding: 6px 12px; border: 1px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-sm); background: transparent; color: inherit; font: inherit; cursor: pointer; }
.enhance-archive-button:disabled { opacity: .5; cursor: default; }
.enhance-archive-button:focus-visible, .enhance-archive-checkbox input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.enhance-archive-primary { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }
@media (hover: hover) { .enhance-archive-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); } .enhance-archive-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); } }
.enhance-archive-retry { margin-top: 8px; }
`;
var messages = {
  en: { title: "Archive sessions in bulk", description: "Choose sessions to archive. Running sessions are skipped; running work is never stopped.", all: "Select all selectable sessions", selected: "Selected", archive: "Archive selected", close: "Close", pending: "Archiving\u2026", success: "Archived", archived: "Already archived", failed: "Failed", removed: "Session is no longer in this workspace.", denied: "Archive permission is unavailable.", running: "Session is running. Try again after its work finishes.", unavailable: "Session status is unavailable.", empty: "No sessions in this workspace.", retry: "Select failed sessions", missing: "Workspace is no longer available." },
  zh: { title: "\u6279\u91CF\u5F52\u6863\u4F1A\u8BDD", description: "\u9009\u62E9\u8981\u5F52\u6863\u7684\u4F1A\u8BDD\u3002\u8FD0\u884C\u4E2D\u7684\u4F1A\u8BDD\u4F1A\u8DF3\u8FC7\uFF0C\u4E0D\u4F1A\u505C\u6B62\u8FD0\u884C\u4E2D\u7684\u5DE5\u4F5C\u3002", all: "\u5168\u9009\u53EF\u9009\u4F1A\u8BDD", selected: "\u5DF2\u9009\u62E9", archive: "\u5F52\u6863\u6240\u9009\u4F1A\u8BDD", close: "\u5173\u95ED", pending: "\u6B63\u5728\u5F52\u6863\u2026", success: "\u5DF2\u5F52\u6863", archived: "\u5DF2\u7ECF\u5F52\u6863", failed: "\u5931\u8D25", removed: "\u4F1A\u8BDD\u5DF2\u4E0D\u5C5E\u4E8E\u6B64\u5DE5\u4F5C\u533A\u3002", denied: "\u5F53\u524D\u6CA1\u6709\u5F52\u6863\u6743\u9650\u3002", running: "\u4F1A\u8BDD\u6B63\u5728\u8FD0\u884C\uFF0C\u8BF7\u7B49\u5F85\u5DE5\u4F5C\u7ED3\u675F\u540E\u91CD\u8BD5\u3002", unavailable: "\u4F1A\u8BDD\u72B6\u6001\u6682\u4E0D\u53EF\u7528\u3002", empty: "\u6B64\u5DE5\u4F5C\u533A\u6CA1\u6709\u4F1A\u8BDD\u3002", retry: "\u9009\u62E9\u5931\u8D25\u4F1A\u8BDD", missing: "\u5DE5\u4F5C\u533A\u5DF2\u4E0D\u5B58\u5728\u3002" }
};
function registerWorkspaceArchive(ctx) {
  let alive = true;
  let state = { request: null, selected: [], results: {}, busy: false };
  const listeners = /* @__PURE__ */ new Set();
  const permissions = /* @__PURE__ */ new Set();
  const accessDisposers = /* @__PURE__ */ new Map();
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
  const session = (id) => ctx.sessions.list.getSnapshot().byId[id];
  const archived = (id) => ctx.workspaces.list.getSnapshot().archivedSessionIds.includes(id);
  const eligible = (id) => workspace(state.request?.workspaceId)?.sessionIds.includes(id) && !archived(id) && state.results[id]?.status !== "success" && permissions.has(id) && session(id) && !session(id).running;
  const close = () => {
    if (!state.busy) update({ request: null, selected: [], results: {} });
  };
  const syncPermissions = () => {
    const ids = new Set(ctx.workspaces.list.getSnapshot().items.flatMap((row) => row.sessionIds));
    for (const [id, dispose] of accessDisposers) {
      if (!ids.has(id)) {
        accessDisposers.delete(id);
        dispose();
      }
    }
    for (const id of ids) {
      if (accessDisposers.has(id)) continue;
      accessDisposers.set(id, ctx.uiSession.whenAccess(id, "workspace/archiveSession", () => {
        permissions.add(id);
        update({});
        return () => {
          permissions.delete(id);
          update({});
        };
      }));
    }
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
      else if (!permissions.has(id)) result = { status: "failed", message: t("denied") };
      else if (!session(id)) result = { status: "failed", message: t("unavailable") };
      else if (session(id).running) result = { status: "failed", message: t("running") };
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
    const dialog = import_react.default.useRef(null);
    import_react.default.useEffect(() => {
      if (!current.request) return;
      const element = dialog.current;
      element.showModal();
      return () => element.close();
    }, [current.request]);
    if (!current.request) return null;
    const row = list.items.find((item) => item.workspaceId === current.request.workspaceId);
    const ids = [.../* @__PURE__ */ new Set([...row?.sessionIds ?? [], ...Object.keys(current.results)])];
    const available = ids.filter(eligible);
    const selected = current.selected.filter((id) => available.includes(id));
    const toggle = (id, checked) => {
      if (!state.busy) update({ selected: checked ? [.../* @__PURE__ */ new Set([...state.selected, id])] : state.selected.filter((value) => value !== id) });
    };
    const checkbox = (label, checked, disabled, onChange) => h("label", { className: "enhance-archive-checkbox" }, h("input", { type: "checkbox", "aria-label": label, checked, disabled, onChange: (event) => onChange(event.target.checked) }), h("span", null, label));
    const button = (label, props = {}) => h("button", { type: "button", ...props, className: `enhance-archive-button ${props.className ?? ""}` }, label);
    return h(
      "dialog",
      { ref: dialog, className: "enhance-archive-modal", "aria-labelledby": "enhance-archive-title", "aria-describedby": "enhance-archive-description", "aria-busy": current.busy, onCancel: (event) => {
        event.preventDefault();
        close();
      } },
      h("style", null, archiveStyles),
      h("header", { className: "enhance-archive-header" }, h("h2", { id: "enhance-archive-title" }, t("title")), button("\xD7", { "aria-label": t("close"), disabled: current.busy, onClick: close })),
      h("p", { id: "enhance-archive-description", className: "enhance-archive-description" }, `${current.request.displayTitle} \u2014 ${t("description")}`),
      h(
        "div",
        { className: "enhance-archive-content" },
        !row && h("p", { role: "alert", className: "enhance-archive-meta enhance-archive-error" }, t("missing")),
        h(
          "div",
          { className: "enhance-archive-toolbar" },
          checkbox(t("all"), available.length > 0 && selected.length === available.length, current.busy || !available.length, (checked) => {
            if (!state.busy) update({ selected: checked ? available : [] });
          }),
          h("p", { className: "enhance-archive-meta", role: "status", "aria-live": "polite" }, `${t("selected")}: ${selected.length}`)
        ),
        Object.values(current.results).some((result) => result.status === "failed") && button(t("retry"), { className: "enhance-archive-retry", disabled: current.busy || !available.some((id) => current.results[id]?.status === "failed"), onClick: () => {
          if (!state.busy) update({ selected: available.filter((id) => state.results[id]?.status === "failed") });
        } }),
        !ids.length && h("p", { className: "enhance-archive-meta" }, t("empty")),
        h("ul", { className: "enhance-archive-list" }, ids.map((id) => {
          const result = current.results[id];
          const status = result?.status === "success" ? "success" : list.archivedSessionIds.includes(id) ? "archived" : result?.status;
          const reason = !session(id) ? "unavailable" : session(id).running ? "running" : !permissions.has(id) ? "denied" : null;
          return h(
            "li",
            { key: id, className: "enhance-archive-row" },
            checkbox(sessions.byId[id]?.displayTitle ?? id, selected.includes(id), current.busy || !eligible(id), (checked) => toggle(id, checked)),
            status ? h("div", { className: `enhance-archive-meta enhance-archive-status${status === "failed" ? " enhance-archive-error" : ""}`, role: status === "failed" ? "alert" : "status" }, t(status), status === "failed" && h("p", { className: "enhance-archive-error-message" }, result.message)) : reason && h("p", { className: "enhance-archive-meta enhance-archive-status" }, t(reason))
          );
        }))
      ),
      h("footer", { className: "enhance-archive-footer" }, button(t("close"), { disabled: current.busy, onClick: close }), button(t(current.busy ? "pending" : "archive"), { className: "enhance-archive-primary", disabled: current.busy || !selected.length, onClick: archive }))
    );
  }
  ctx.effect(() => ctx.locale.register(NS, messages));
  ctx.effect(() => {
    syncPermissions();
    const unsubscribe = ctx.workspaces.list.subscribe(syncPermissions);
    return () => {
      alive = false;
      unsubscribe();
      for (const dispose of accessDisposers.values()) dispose();
      accessDisposers.clear();
      listeners.clear();
    };
  });
  ctx.effect(() => ctx.contextMenus.register({
    id: "enhance.workspace.archive",
    target: "workspace",
    order: 200,
    observe: () => [ctx.workspaces.list, source, ctx.locale],
    resolve: ({ workspaceId, displayTitle }) => workspace(workspaceId)?.sessionIds.some((id) => !archived(id) && permissions.has(id)) ? [{ id: "archive-batch", label: t("title"), icon: { key: "workspace.archive" }, run: () => {
      if (alive && !state.busy && workspace(workspaceId)) update({ request: { workspaceId, displayTitle }, selected: [], results: {} });
    } }] : []
  }));
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({ name: "shell.overlay", id: "enhance.workspace.archive" }, Overlay));
}

// workspace-archive/client.source.js
var inject = ["slots", "locale", "contextMenus", "workspaces", "sessions", "uiSession"];
var apply = registerWorkspaceArchive;
return module.exports;}});

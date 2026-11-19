import React from 'react';
import { Button, Checkbox, Modal } from '@deepseek-ai/dsh-client-ui-primitives';

const h = React.createElement;
const NS = 'dsh-plugin-enhance.workspace';
// Keep archive-only styles in the JS bundle: the client build has no CSS loader.
const archiveStyles = `
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
const messages = {
  en: { title: 'Archive sessions in bulk', description: 'Choose sessions to archive. Active sessions may fail; running work is not stopped.', all: 'Select all selectable sessions', selected: 'Selected', archive: 'Archive selected', close: 'Close', pending: 'Archiving…', success: 'Archived', archived: 'Already archived', failed: 'Failed', removed: 'Session is no longer in this workspace.', denied: 'Archive permission is unavailable.', empty: 'No sessions in this workspace.', retry: 'Select failed sessions', missing: 'Workspace is no longer available.' },
  zh: { title: '批量归档会话', description: '选择要归档的会话。活跃会话可能失败，不会停止运行中的工作。', all: '全选可选会话', selected: '已选择', archive: '归档所选会话', close: '关闭', pending: '正在归档…', success: '已归档', archived: '已经归档', failed: '失败', removed: '会话已不属于此工作区。', denied: '当前没有归档权限。', empty: '此工作区没有会话。', retry: '选择失败会话', missing: '工作区已不存在。' },
};

// Called only within the optional workspace-service injection scope.
export function registerWorkspaceArchive(ctx) {
  let alive = true;
  let state = { request: null, selected: [], results: {}, busy: false };
  const listeners = new Set();
  const update = patch => { if (alive) { state = { ...state, ...patch }; for (const listener of listeners) listener(); } };
  const source = { getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
  const t = ctx.locale.bind(NS);
  const workspace = id => ctx.workspaces.list.getSnapshot().items.find(row => row.workspaceId === id);
  const allowed = id => ctx.remoteAccess.source('session', id, 'workspace/archiveSession').getSnapshot();
  const archived = id => ctx.workspaces.list.getSnapshot().archivedSessionIds.includes(id);
  const eligible = id => workspace(state.request?.workspaceId)?.sessionIds.includes(id) && !archived(id) && state.results[id]?.status !== 'success' && allowed(id);
  const close = () => { if (!state.busy) update({ request: null, selected: [], results: {} }); };
  async function archive() {
    if (!alive || state.busy || !state.request) return;
    const ids = [...state.selected];
    if (!ids.length) return;
    const workspaceId = state.request.workspaceId;
    update({ busy: true, selected: [] });
    for (const id of ids) {
      if (!alive) break;
      let result;
      if (!workspace(workspaceId)?.sessionIds.includes(id)) result = { status: 'failed', message: t('removed') };
      else if (archived(id)) result = { status: 'archived' };
      else if (!allowed(id)) result = { status: 'failed', message: t('denied') };
      else {
        update({ results: { ...state.results, [id]: { status: 'pending' } } });
        try {
          await ctx.workspaces.archiveSession(id);
          result = { status: 'success' };
        } catch (error) {
          result = { status: 'failed', message: error instanceof Error ? error.message : String(error) };
        }
      }
      update({ results: { ...state.results, [id]: result } });
    }
    update({ busy: false });
  }
  function Overlay() {
    const current = React.useSyncExternalStore(source.subscribe, source.getSnapshot);
    const list = React.useSyncExternalStore(fn => ctx.workspaces.list.subscribe(fn), () => ctx.workspaces.list.getSnapshot());
    const sessions = React.useSyncExternalStore(fn => ctx.sessions.list.subscribe(fn), () => ctx.sessions.list.getSnapshot());
    React.useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot());
    const permissionIds = list.items.find(item => item.workspaceId === current.request?.workspaceId)?.sessionIds ?? [];
    React.useSyncExternalStore(listener => {
      const disposers = permissionIds.map(id => ctx.remoteAccess.source('session', id, 'workspace/archiveSession').subscribe(listener));
      return () => disposers.forEach(dispose => dispose());
    }, () => permissionIds.map(id => allowed(id) ? '1' : '0').join(''));
    if (!current.request) return null;
    const row = list.items.find(item => item.workspaceId === current.request.workspaceId);
    const ids = [...new Set([...(row?.sessionIds ?? []), ...Object.keys(current.results)])];
    const available = ids.filter(eligible);
    const selected = current.selected.filter(id => available.includes(id));
    const toggle = (id, checked) => { if (!state.busy) update({ selected: checked ? [...new Set([...state.selected, id])] : state.selected.filter(value => value !== id) }); };
    return h(Modal, { open: true, className: 'enhance-archive-modal', contentClassName: 'enhance-archive-content', title: t('title'), description: `${current.request.displayTitle} — ${t('description')}`, closeLabel: t('close'), onClose: close,
      footer: h('div', { className: 'enhance-archive-footer' },
        h(Button, { variant: 'outline', disabled: current.busy, onClick: close }, t('close')),
        h(Button, { variant: 'primary', disabled: current.busy || !selected.length, onClick: archive }, t(current.busy ? 'pending' : 'archive'))) },
    h('style', null, archiveStyles),
    !row && h('p', { role: 'alert', className: 'enhance-archive-meta enhance-archive-error' }, t('missing')),
    h('div', { className: 'enhance-archive-toolbar' },
      h(Checkbox, { label: t('all'), disabled: current.busy || !available.length, checked: available.length > 0 && selected.length === available.length, onChange: checked => { if (!state.busy) update({ selected: checked ? available : [] }); } }),
      h('p', { className: 'enhance-archive-meta', role: 'status', 'aria-live': 'polite' }, `${t('selected')}: ${selected.length}`)),
    Object.values(current.results).some(result => result.status === 'failed') && h(Button, { className: 'enhance-archive-retry', variant: 'outline', disabled: current.busy || !available.some(id => current.results[id]?.status === 'failed'), onClick: () => { if (!state.busy) update({ selected: available.filter(id => state.results[id]?.status === 'failed') }); } }, t('retry')),
    !ids.length && h('p', { className: 'enhance-archive-meta' }, t('empty')),
    h('ul', { className: 'enhance-archive-list' }, ids.map(id => {
      const result = current.results[id];
      const status = result?.status === 'success' ? 'success' : list.archivedSessionIds.includes(id) ? 'archived' : result?.status;
      return h('li', { key: id, className: 'enhance-archive-row' },
        h(Checkbox, { className: 'enhance-archive-checkbox', label: sessions.byId[id]?.displayTitle ?? id, checked: selected.includes(id), disabled: current.busy || !eligible(id), onChange: checked => toggle(id, checked) }),
        status && h('div', { className: `enhance-archive-meta enhance-archive-status${status === 'failed' ? ' enhance-archive-error' : ''}`, role: status === 'failed' ? 'alert' : 'status' }, t(status), status === 'failed' && h('p', { className: 'enhance-archive-error-message' }, result.message)));
    })));
  }
  ctx.effect(() => ctx.locale.register(NS, messages));
  ctx.effect(() => () => { alive = false; listeners.clear(); });
  ctx.effect(() => ctx.contextMenus.register({ id: 'enhance.workspace.archive', target: 'workspace', order: 200,
    resolve: ({ workspaceId, displayTitle }) => workspace(workspaceId)?.sessionIds.some(allowed) ? [{ id: 'archive-batch', label: t('title'), run: () => {
      if (alive && !state.busy && workspace(workspaceId)) update({ request: { workspaceId, displayTitle }, selected: [], results: {} });
    } }] : [],
  }));
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'enhance.workspace.archive' }, Overlay));
}

import { TYPERT_REMOTE } from './typert.remote-client.js';

import * as React from 'react';
const h = React.createElement;
const copy = {
  en: { tab: 'Updates', title: 'Plugin updates', check: 'Check for updates', selected: 'Update selected', all: 'Update all available', selectAll: 'Select all available', retry: 'Retry failed updates', empty: 'Check for updates to load installed bundles.', none: 'No installed bundles.', busy: 'Working…', name: 'Plugin', version: 'Version', state: 'Status', details: 'Details', notice: 'Updates uninstall the old bundle before installing the new version. An installation failure can leave it uninstalled. Some changes require restarting DSH. Build scripts require separate approval in the plugin manager. The updater runs last; its tab may briefly disappear during reload. If it fails to return, reinstall it with the official plugin manager.', enabled: 'Enabled', disabled: 'Disabled', pending: 'Review pending build scripts in the plugin manager before retrying.', loading: 'Loading…', ready: 'Update available', current: 'Up to date', skipped: 'Skipped', error: 'Failed', failed: 'Failed', updating: 'Updating', updated: 'Updated', succeeded: 'Updated', 'restart-required': 'Restart required', 'pending-builds': 'Build approval required', confirm: 'I understand that a failed update may leave a plugin uninstalled.', source: 'Source', blocked: 'Unavailable', 'check-failed': 'Check failed', removing: 'Removing old version', installing: 'Installing', stale: 'Changed; check again', builtin: 'Updated with DSH.', 'not-installed': 'Not installed in this profile.', 'not-removable': 'Protected bundle.', 'local-or-unknown-source': 'Local or unknown source.', 'invalid-current-version': 'Invalid installed version.', incompatible: 'Incompatible with this DSH version.', 'unsupported-source': 'This source needs a manual update.', 'market-unavailable': 'Market unavailable; check again before switching sources.', 'not-bundle': 'The target is not a bundle.', 'bundle-changed': 'The installed bundle changed; check again.', 'installed-target-mismatch': 'The installed version differs from the requested target.' },
  zh: { tab: '更新', title: '插件更新', check: '检查更新', selected: '更新所选', all: '更新全部可更新项', selectAll: '全选可更新项', retry: '重试失败项', empty: '点击检查更新，读取已安装组合包。', none: '没有已安装组合包。', busy: '正在处理…', name: '插件', version: '版本', state: '状态', details: '详情', notice: '更新会先卸载旧组合包，再安装新版本。安装失败可能导致插件处于未安装状态；部分变更需要重启 DSH。构建脚本需要在插件管理器中单独授权。更新器自身排在最后，重载时更新标签页可能短暂消失；若未恢复，请用官方插件管理器重新安装本插件。', enabled: '已启用', disabled: '已停用', pending: '请在插件管理器中检查并授权待处理的构建脚本，然后重试。', loading: '加载中…', ready: '可更新', current: '已是最新', skipped: '已跳过', error: '失败', failed: '失败', updating: '更新中', updated: '已更新', succeeded: '已更新', 'restart-required': '需要重启', 'pending-builds': '需要脚本授权', confirm: '我已了解更新失败可能导致插件处于未安装状态。', source: '来源', blocked: '不可更新', 'check-failed': '检查失败', removing: '正在卸载旧版', installing: '正在安装', stale: '状态已变化，请重新检查', builtin: '随 DSH 一起升级。', 'not-installed': '当前 profile 未安装。', 'not-removable': '受保护的组合包。', 'local-or-unknown-source': '本地或未知来源。', 'invalid-current-version': '已安装版本号无效。', incompatible: '目标版本与当前 DSH 不兼容。', 'unsupported-source': '此来源需要手动更新。', 'market-unavailable': '市场不可用，请重新检查后再更新。', 'not-bundle': '目标包不是组合包。', 'bundle-changed': '插件状态已变化，请重新检查。', 'installed-target-mismatch': '实际安装版本与目标不一致。' },
};
Object.assign(copy.en, { onlyAvailable: 'Only show available updates', noAvailable: 'No updates available. View all plugins to see their status.', attention: 'Needs attention' });
Object.assign(copy.zh, { onlyAvailable: '仅显示可更新', noAvailable: '暂无可更新项，可查看全部插件了解状态。', attention: '需处理' });
Object.assign(copy.en, { noAttention: 'No plugins need attention.', selectAll: 'Select visible updates', allPlugins: 'All plugins', search: 'Search plugins or sources', noMatch: 'No matching plugins.', clear: 'Clear filters', checking: 'Checking for updates', update: 'Update', retryOne: 'Retry', deselect: 'Clear selection', selectedCount: 'selected', safety: 'Update notes', lastChecked: 'Last checked', notChecked: 'Not checked yet', actions: 'Actions', summary: 'Installed bundles and update status' });
Object.assign(copy.zh, { noAttention: '暂无需要处理的插件。', selectAll: '全选当前可更新项', allPlugins: '全部插件', search: '搜索插件名称或来源', noMatch: '没有匹配的插件。', clear: '清除筛选', checking: '正在检查更新', update: '更新', retryOne: '重试', deselect: '取消选择', selectedCount: '项已选择', safety: '更新须知', lastChecked: '上次检查', notChecked: '尚未检查', actions: '操作', summary: '已安装组合包及更新状态' });
const itemGroups = [
  { label: 'checking', states: ['checking'] },
  { label: 'ready', states: ['ready'] },
  { label: 'updating', states: ['removing', 'installing'] },
  { label: 'attention', states: ['check-failed', 'failed', 'pending-builds', 'stale'] },
  { label: 'updated', states: ['succeeded', 'restart-required'] },
  { label: 'current', states: ['current'] },
  { label: 'blocked', states: ['blocked'] },
];
const nameCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export const inject = ['slots', 'locale', 'remote'];
export async function apply(ctx) {
  const unmount = await ctx.remote.$mount(TYPERT_REMOTE);
  ctx.effect(() => unmount);
  await ctx.inject(['remote.pluginEnhance'], registerUpdates);
}

function registerUpdates(ctx) {
  const ns = 'dsh-plugin-enhance';
  ctx.effect(() => ctx.locale.register(ns, copy));
  const t = ctx.locale.bind(ns);
  function Updates() {
    React.useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot());
    const [data, setData] = React.useState(null);
    const [selection, setSelection] = React.useState([]);
    const [error, setError] = React.useState('');
    const [working, setWorking] = React.useState(false);
    const [filter, setFilter] = React.useState('all');
    const [query, setQuery] = React.useState('');
    const mounted = React.useRef(true);
    async function call(method, args) {
      const result = await ctx.remote.pluginEnhance[method](...(args === undefined ? [] : [args]));
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
          const next = await call('status');
          if (!active) return;
          setData(next);
          if (initial && !next.checkedAt && !next.busy) execute('check');
          initial = false;
        } catch (e) { if (active) setError(e.message); }
        if (active) timer = setTimeout(refresh, 1200);
      }
      refresh();
      return () => { active = false; mounted.current = false; clearTimeout(timer); };
    }, []);
    async function execute(method, args) {
      setWorking(true); setError('');
      try { const next = await call(method, args); if (mounted.current) { setData(next); setSelection([]); } }
      catch (e) { if (mounted.current) setError(e.message); }
      finally { if (mounted.current) setWorking(false); }
    }
    const items = [...(data?.items ?? [])].sort((a, b) => nameCollator.compare(a.name, b.name) || a.name.localeCompare(b.name, 'en'));
    const available = items.filter(item => item.state === 'ready');
    const attention = items.filter(item => itemGroups.find(group => group.label === 'attention').states.includes(item.state));
    const matches = item => `${item.name} ${item.source ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    const visible = items.filter(item => matches(item) && (filter === 'all' || (filter === 'ready' ? item.state === 'ready' : attention.includes(item))));
    const selectable = visible.filter(item => item.state === 'ready');
    const selected = available.filter(item => selection.includes(item.name)).map(item => item.name);
    const groups = itemGroups
      .map(group => ({ ...group, items: visible.filter(item => group.states.includes(item.state)) }))
      .filter(group => group.items.length);
    const busy = working || Boolean(data?.busy);
    const stateText = value => Object.hasOwn(copy.en, value) ? t(value) : value;
    const button = (label, action, disabled, primary = false) => h('button', { type: 'button', onClick: action, disabled, className: `dpe-button${primary ? ' dpe-primary' : ''}` }, t(label));
    return h('section', { className: 'dpe', 'aria-busy': busy },
      h('style', null, '.dpe{box-sizing:border-box;width:100%;min-width:0;color:var(--dsw-alias-label-primary);padding:20px;margin:0}.dpe-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.dpe-button{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 12px;cursor:pointer}.dpe-button:disabled{opacity:.45;cursor:default}.dpe-button:focus-visible,.dpe input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.dpe-notice{color:var(--dsw-alias-label-secondary);line-height:1.6}.dpe-scroll{overflow-x:auto}.dpe table{border-collapse:collapse;width:100%;margin-top:16px;font-size:13px}.dpe th,.dpe td{padding:12px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);text-align:left;vertical-align:top}.dpe small{display:block;color:var(--dsw-alias-label-secondary);margin-top:4px}.dpe-error{color:var(--dsw-alias-state-error-primary);white-space:pre-wrap}.dpe pre{white-space:pre-wrap;overflow-wrap:anywhere}'),
      h('style', null, `.dpe{padding:24px 20px;max-width:1200px;font-size:14px}.dpe h2{margin:0;font-size:22px}.dpe h3{font-size:14px;margin:24px 0 8px}.dpe-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.dpe-notice{margin:18px 0;padding:12px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;font-size:13px}.dpe-notice summary{cursor:pointer}.dpe-filters{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0 12px}.dpe-button[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary,#2563eb);color:var(--dsw-alias-brand-primary,#2563eb);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2563eb) 9%,transparent)}.dpe .dpe-primary{background:var(--dsw-alias-brand-primary,#2563eb);color:#fff;border-color:transparent}.dpe-search{margin-left:auto;min-width:220px;flex:1;max-width:360px;font:inherit;padding:9px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:inherit}.dpe-selection{align-items:center;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);position:sticky;top:0;z-index:1}.dpe-selection label{display:flex;gap:8px;align-items:center}.dpe-selection span{color:var(--dsw-alias-label-secondary);margin-right:auto}.dpe input[type=checkbox]{accent-color:var(--dsw-alias-brand-primary,#2563eb);width:16px;height:16px;vertical-align:middle}.dpe-scroll{border:1px solid var(--dsw-alias-border-l1);border-radius:10px}.dpe table{margin:0;min-width:740px}.dpe th{background:var(--dsw-alias-bg-layer-1);font-weight:500;color:var(--dsw-alias-label-secondary)}.dpe th,.dpe td{padding:14px 12px}.dpe td:first-child{width:30%;overflow-wrap:anywhere}.dpe td:nth-child(4){max-width:320px;overflow-wrap:anywhere}.dpe td:last-child{white-space:nowrap}.dpe tr:last-child td{border-bottom:0}.dpe-version{font-variant-numeric:tabular-nums;white-space:nowrap}.dpe-badge{display:inline-block;padding:4px 8px;border-radius:6px;background:var(--dsw-alias-bg-layer-1);white-space:nowrap}.dpe-ready,.dpe-updated{color:var(--dsw-alias-brand-primary,#2563eb);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2563eb) 10%,transparent)}.dpe-attention{color:var(--dsw-alias-state-error-primary,#b91c1c)}.dpe-empty{padding:40px;text-align:center;color:var(--dsw-alias-label-secondary)}@media(max-width:640px){.dpe{padding:16px 0}.dpe-header{align-items:flex-start;flex-direction:column}.dpe-header .dpe-toolbar{margin:0}.dpe-search{max-width:none;min-width:100%;margin:4px 0}.dpe-selection{position:static}.dpe-selection label{flex-basis:100%}}`),
      h('header', { className: 'dpe-header' },
        h('div', null, h('h2', null, t('title')), h('small', null, data?.checkedAt ? `${t('lastChecked')}: ${new Date(data.checkedAt).toLocaleString()}` : t('notChecked'))),
        h('div', { className: 'dpe-toolbar' }, button('check', () => execute('check'), busy),
          button('all', () => execute('start', { generation: data.generation, names: available.map(item => item.name) }), busy || !available.length, true))),
      h('details', { className: 'dpe-notice' }, h('summary', null, t('safety')), h('p', null, t('notice'))),
      h('div', { className: 'dpe-filters', role: 'group', 'aria-label': t('summary') },
        ...[['all', 'allPlugins', items.length], ['ready', 'ready', available.length], ['attention', 'attention', attention.length]].map(([value, label, count]) =>
          h('button', { key: value, type: 'button', className: 'dpe-button', 'aria-pressed': filter === value, onClick: () => setFilter(value) }, `${t(label)} (${count})`)),
        h('input', { type: 'search', className: 'dpe-search', 'aria-label': t('search'), placeholder: t('search'), value: query, onChange: e => setQuery(e.target.value) })),
      h('div', { className: 'dpe-toolbar dpe-selection' },
        h('label', null, h('input', { type: 'checkbox', 'aria-label': t('selectAll'), checked: selectable.length > 0 && selectable.every(item => selected.includes(item.name)), disabled: busy || !selectable.length,
          onChange: e => setSelection(e.target.checked ? [...new Set([...selected, ...selectable.map(item => item.name)])] : selected.filter(name => !selectable.some(item => item.name === name))) }), ' ', t('selectAll')),
        h('span', null, `${selected.length} ${t('selectedCount')}`),
        selected.length > 0 && button('deselect', () => setSelection([]), busy),
        button('selected', () => execute('start', { generation: data.generation, names: selected }), busy || !selected.length, true),
        items.some(item => item.retryable) && button('retry', () => execute('retry', {}), busy)),
      h('div', { role: 'status', 'aria-live': 'polite' }, busy ? t(data?.run ? 'busy' : 'checking') : (!data && !error ? t('loading') : '')),
      error && h('p', { className: 'dpe-error', role: 'alert' }, error),
      !items.length ? h('p', { className: 'dpe-empty' }, t(busy || !data ? 'loading' : data.checkedAt ? 'none' : 'notChecked'))
        : !groups.length ? h('div', { className: 'dpe-empty' }, h('p', null, t(query.trim() ? 'noMatch' : filter === 'attention' ? 'noAttention' : 'noAvailable')), button('clear', () => { setQuery(''); setFilter('all'); }, false))
        : groups.map(group => h('section', { key: group.label, 'aria-label': t(group.label) },
          h('h3', null, `${t(group.label)} (${group.items.length})`),
          h('div', { className: 'dpe-scroll' }, h('table', { 'aria-label': t(group.label) },
            h('thead', null, h('tr', null, ...['name', 'version', 'state', 'details', 'actions'].map(key => h('th', { key, scope: 'col' }, t(key))))),
            h('tbody', null, group.items.map(item => h('tr', { key: item.name },
              h('td', null, h('label', null, h('input', { type: 'checkbox', 'aria-label': item.name, disabled: busy || item.state !== 'ready', checked: selection.includes(item.name), onChange: e => setSelection(values => e.target.checked ? [...values, item.name] : values.filter(value => value !== item.name)) }), ' ', item.name), h('small', null, t(item.enabled ? 'enabled' : 'disabled'))),
              h('td', { className: 'dpe-version' }, item.currentVersion ?? '—', item.target && h('small', null, `→ ${item.target.version}`)),
              h('td', null, h('span', { className: `dpe-badge dpe-${group.label}` }, stateText(item.state))),
              h('td', null, item.reason && stateText(item.reason), item.state === 'pending-builds' && h('p', null, t('pending')), h('small', null, item.source)),
              h('td', null, item.state === 'ready' && button('update', () => execute('start', { generation: data.generation, names: [item.name] }), busy),
                item.retryable && button('retryOne', () => execute('retry', { names: [item.name] }), busy))))))))),
      data?.marketErrors?.map(entry => h('p', { key: entry.url, className: 'dpe-error', role: 'alert' }, `${entry.url}: ${entry.message}`)));
  }
  ctx.slots.inject('plugins.tab', () => ctx.slots.register({ name: 'plugins.tab', id: 'dsh-plugin-enhance-updates', order: 30, label: () => t('tab') }, Updates));
}

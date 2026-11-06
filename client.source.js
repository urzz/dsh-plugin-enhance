import { TYPERT_REMOTE } from './typert.remote-client.js';

import * as React from 'react';
import { Button, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
const h = React.createElement;
const copy = {
  en: { tab: 'Updates', title: 'Plugin updates', check: 'Check for updates', selected: 'Update selected', all: 'Update all available', selectAll: 'Select all available', retry: 'Retry failed updates', empty: 'Check for updates to load installed bundles.', none: 'No installed bundles.', busy: 'Working…', name: 'Plugin', version: 'Version', state: 'Status', details: 'Details', notice: 'Updates uninstall the old bundle before installing the new version. An installation failure can leave it uninstalled. Some changes require restarting DSH. Build scripts require separate approval in the plugin manager. The updater runs last; its tab may briefly disappear during reload. If it fails to return, reinstall it with the official plugin manager.', enabled: 'Enabled', disabled: 'Disabled', pending: 'Review pending build scripts in the plugin manager before retrying.', loading: 'Loading…', ready: 'Update available', current: 'Up to date', skipped: 'Skipped', error: 'Failed', failed: 'Failed', updating: 'Updating', updated: 'Updated', succeeded: 'Updated', 'restart-required': 'Restart required', 'pending-builds': 'Build approval required', confirm: 'I understand that a failed update may leave a plugin uninstalled.', source: 'Source', blocked: 'Unavailable', 'check-failed': 'Check failed', removing: 'Removing old version', installing: 'Installing', stale: 'Changed; check again', builtin: 'Updated with DSH.', 'not-installed': 'Not installed in this profile.', 'not-removable': 'Protected bundle.', 'local-or-unknown-source': 'Local or unknown source.', 'invalid-current-version': 'Invalid installed version.', incompatible: 'Incompatible with this DSH version.', 'unsupported-source': 'This source needs a manual update.', 'market-unavailable': 'Market unavailable; check again before switching sources.', 'not-bundle': 'The target is not a bundle.', 'bundle-changed': 'The installed bundle changed; check again.', 'installed-target-mismatch': 'The installed version differs from the requested target.' },
  zh: { tab: '更新', title: '插件更新', check: '检查更新', selected: '更新所选', all: '更新全部可更新项', selectAll: '全选可更新项', retry: '重试失败项', empty: '点击检查更新，读取已安装组合包。', none: '没有已安装组合包。', busy: '正在处理…', name: '插件', version: '版本', state: '状态', details: '详情', notice: '更新会先卸载旧组合包，再安装新版本。安装失败可能导致插件处于未安装状态；部分变更需要重启 DSH。构建脚本需要在插件管理器中单独授权。更新器自身排在最后，重载时更新标签页可能短暂消失；若未恢复，请用官方插件管理器重新安装本插件。', enabled: '已启用', disabled: '已停用', pending: '请在插件管理器中检查并授权待处理的构建脚本，然后重试。', loading: '加载中…', ready: '可更新', current: '已是最新', skipped: '已跳过', error: '失败', failed: '失败', updating: '更新中', updated: '已更新', succeeded: '已更新', 'restart-required': '需要重启', 'pending-builds': '需要脚本授权', confirm: '我已了解更新失败可能导致插件处于未安装状态。', source: '来源', blocked: '不可更新', 'check-failed': '检查失败', removing: '正在卸载旧版', installing: '正在安装', stale: '状态已变化，请重新检查', builtin: '随 DSH 一起升级。', 'not-installed': '当前 profile 未安装。', 'not-removable': '受保护的组合包。', 'local-or-unknown-source': '本地或未知来源。', 'invalid-current-version': '已安装版本号无效。', incompatible: '目标版本与当前 DSH 不兼容。', 'unsupported-source': '此来源需要手动更新。', 'market-unavailable': '市场不可用，请重新检查后再更新。', 'not-bundle': '目标包不是组合包。', 'bundle-changed': '插件状态已变化，请重新检查。', 'installed-target-mismatch': '实际安装版本与目标不一致。' },
};
Object.assign(copy.en, { onlyAvailable: 'Only show available updates', noAvailable: 'No updates available. View all plugins to see their status.', attention: 'Needs attention' });
Object.assign(copy.zh, { onlyAvailable: '仅显示可更新', noAvailable: '暂无可更新项，可查看全部插件了解状态。', attention: '需处理' });
Object.assign(copy.en, { noAttention: 'No plugins need attention.', selectAll: 'Select visible updates', allPlugins: 'All plugins', search: 'Search plugins or sources', noMatch: 'No matching plugins.', clear: 'Clear filters', checking: 'Checking for updates', update: 'Update', retryOne: 'Retry', deselect: 'Clear selection', selectedCount: 'selected', safety: 'Update notes', lastChecked: 'Last checked', notChecked: 'Not checked yet', actions: 'Actions', summary: 'Installed bundles and update status' });
Object.assign(copy.zh, { noAttention: '暂无需要处理的插件。', selectAll: '全选当前可更新项', allPlugins: '全部插件', search: '搜索插件名称或来源', noMatch: '没有匹配的插件。', clear: '清除筛选', checking: '正在检查更新', update: '更新', retryOne: '重试', deselect: '取消选择', selectedCount: '项已选择', safety: '更新须知', lastChecked: '上次检查', notChecked: '尚未检查', actions: '操作', summary: '已安装组合包及更新状态' });
Object.assign(copy.en, { failureDetails: 'Failure details', diagnostic: 'Diagnostic', packageOutput: 'Package manager output', exitCode: 'Exit code', timedOut: 'Package manager timed out.', outputTruncated: 'Output shortened; see the full package manager log.', logPath: 'Full log', buildBlocked: 'Build scripts were blocked. Review the packages and explicitly approve their build scripts through the official plugin manager before retrying. This updater never grants build approval automatically.' });
Object.assign(copy.zh, { failureDetails: '失败详情', diagnostic: '诊断信息', packageOutput: '包管理器输出', exitCode: '退出码', timedOut: '包管理器已超时。', outputTruncated: '输出已截短，请查看包管理器完整日志。', logPath: '完整日志', buildBlocked: '构建脚本被阻止。请先通过官方插件管理器检查相关包，并明确授权其构建脚本，然后重试。本更新器绝不会自动授予构建权限。' });
Object.assign(copy.en, { missingBuildList: 'The plugin manager returned no packages awaiting approval. Check the failure details and DSH/pnpm compatibility before retrying.' });
Object.assign(copy.zh, { missingBuildList: '插件管理器未返回待授权包。请查看失败详情，并检查 DSH 与 pnpm 的兼容性后再重试。' });
Object.assign(copy.en, { tab: 'Enhanced management', title: 'Enhanced management', support: 'Update support', native: 'Native support', extended: 'Extended support', unavailable: 'Unavailable', allSupport: 'All support types', 'no-installable-version': 'No compatible stable version is available.', restoring: 'Restoring previous version', restored: 'Update failed; previous version restored', restoreDetails: 'Restore details', notice: 'Official updates use the plugin manager’s update flow. Supplemental updates uninstall the old bundle before installing the new version; installation failure may leave it uninstalled. Some changes require restarting DSH. Build scripts require explicit approval in the official plugin manager. The updater runs last; if its tab does not return after reload, reinstall it with the official plugin manager.' });
Object.assign(copy.zh, { tab: '增强管理', title: '增强管理', support: '更新支持类型', native: '原生支持', extended: '扩展支持', unavailable: '不可用', allSupport: '全部支持类型', 'no-installable-version': '没有兼容的正式版本。', restoring: '正在恢复旧版', restored: '更新失败，已恢复旧版', restoreDetails: '恢复详情', notice: '官方更新使用插件管理器的更新流程。补充更新会先卸载旧组合包，再安装新版本；安装失败可能导致插件处于未安装状态。部分变更需要重启 DSH。构建脚本需要在官方插件管理器中明确授权。更新器自身排在最后；若重载后标签页未恢复，请用官方插件管理器重新安装本插件。' });
const itemGroups = [
  { label: 'checking', states: ['checking'] },
  { label: 'ready', states: ['ready'] },
  { label: 'updating', states: ['removing', 'installing', 'restoring'] },
  { label: 'attention', states: ['check-failed', 'failed', 'pending-builds', 'stale', 'restored'] },
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
  const bounded = (text, limit) => text.length > limit ? `${text.slice(0, limit / 2)}\n…\n${text.slice(-limit / 2)}` : text;
  function failureDetails(item, result = item.result, label = 'failureDetails') {
    if (!['failed', 'pending-builds', 'restored'].includes(item.state)) return null;
    const diagnostic = result?.error?.diagnostic;
    const pkg = result?.packageResult;
    if (!diagnostic && !pkg) return null;
    const shortened = diagnostic?.length > 2000 || pkg?.output?.length > 4000 || pkg?.truncated;
    return h('details', { className: 'dpe-failure' },
      h('summary', null, t(label)),
      diagnostic && h('div', null, h('small', null, t('diagnostic')), h('pre', null, bounded(diagnostic, 2000))),
      pkg && h('div', null,
        h('small', null, `${pkg.kind ?? ''}${pkg.kind ? ' · ' : ''}${t('exitCode')}: ${pkg.exitCode}`),
        pkg.timedOut && h('p', null, t('timedOut')),
        pkg.output && h('div', null, h('small', null, t('packageOutput')), h('pre', null, bounded(pkg.output, 4000))),
        pkg.logPath && h('small', null, `${t('logPath')}: ${bounded(pkg.logPath, 1000)}`)),
      shortened && h('p', null, t('outputTruncated')));
  }
  function Updates() {
    React.useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot());
    const [data, setData] = React.useState(null);
    const [selection, setSelection] = React.useState([]);
    const [error, setError] = React.useState('');
    const [working, setWorking] = React.useState(false);
    const [filter, setFilter] = React.useState('all');
    const [query, setQuery] = React.useState('');
    const [support, setSupport] = React.useState('all');
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
    const visible = items.filter(item => matches(item) && (support === 'all' || item.support === support) && (filter === 'all' || (filter === 'ready' ? item.state === 'ready' : attention.includes(item))));
    const selectable = visible.filter(item => item.state === 'ready');
    const selected = available.filter(item => selection.includes(item.name)).map(item => item.name);
    const groups = itemGroups
      .map(group => ({ ...group, items: visible.filter(item => group.states.includes(item.state)) }))
      .filter(group => group.items.length);
    const busy = working || Boolean(data?.busy);
    const stateText = value => Object.hasOwn(copy.en, value) ? t(value) : value;
    const button = (label, action, disabled, primary = false) => h(Button, { type: 'button', size: 'sm', variant: primary ? 'primary' : 'outline', onClick: action, disabled }, t(label));
    return h('section', { className: 'dpe', 'aria-busy': busy },
      h('style', null, `
        .dpe{box-sizing:border-box;width:100%;max-width:1056px;min-width:0;margin:0 auto;padding:28px clamp(24px,4vw,48px) 48px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5}
        .dpe h2{margin:0;font-size:24px;font-weight:600;letter-spacing:-.5px}.dpe h3{font-size:14px;font-weight:600;margin:28px 0 12px}
        .dpe-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.dpe-toolbar,.dpe-filters,.dpe-support{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.dpe-toolbar{margin:16px 0}.dpe-filters{margin:24px 0 12px}.dpe-support{margin-bottom:16px}
        .dpe-search{margin-left:auto;min-width:180px;flex:1;max-width:320px}.dpe-notice{margin:20px 0;color:var(--dsw-alias-label-secondary);font-size:13px}.dpe summary{cursor:pointer}.dpe-notice p{line-height:1.7}
        .dpe-selection{padding:12px 0;border-block:1px solid var(--dsw-alias-border-l1)}.dpe-selection label{display:flex;align-items:center;gap:8px}.dpe-selection>span{margin-right:auto;color:var(--dsw-alias-label-secondary)}.dpe input[type=checkbox]{width:16px;height:16px;vertical-align:middle;accent-color:var(--dsw-alias-brand-primary)}
        .dpe-scroll{overflow-x:auto}.dpe table{border-collapse:collapse;width:100%;font-size:13px}.dpe th,.dpe td{padding:16px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--dsw-alias-border-l1)}.dpe th{font-weight:500;color:var(--dsw-alias-label-secondary)}.dpe td:first-child{min-width:160px;overflow-wrap:anywhere}.dpe td:nth-child(4){max-width:320px;overflow-wrap:anywhere}.dpe td:last-child{white-space:nowrap}.dpe td:last-child button+button{margin-left:8px}
        .dpe small{display:block;margin:4px 0;color:var(--dsw-alias-label-secondary)}.dpe-version{font-variant-numeric:tabular-nums}.dpe-badge{font-size:12px}.dpe-attention{color:var(--dsw-alias-state-error-primary)}.dpe-empty{padding:40px 0;text-align:center;color:var(--dsw-alias-label-secondary)}.dpe-error{color:var(--dsw-alias-state-error-primary);white-space:pre-wrap}.dpe pre{white-space:pre-wrap;overflow-wrap:anywhere}.dpe-failure{margin-top:8px}.dpe-failure pre{max-height:240px;overflow:auto}.dpe :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
        @media(max-width:767px){.dpe{padding:24px 20px 40px}.dpe-header{align-items:flex-start;flex-direction:column;gap:0}.dpe-search{order:-1;flex-basis:100%;max-width:none}.dpe table,.dpe tbody{display:block}.dpe thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.dpe tr{display:grid;grid-template-columns:1fr auto;padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}.dpe td{display:block;border:0;padding:4px 0}.dpe td:first-child{min-width:0}.dpe td:nth-child(4){max-width:none;grid-column:1/-1}.dpe td:last-child{grid-column:1/-1}.dpe-selection{position:static}}
      `),
      h('header', { className: 'dpe-header' },
        h('div', null, h('h2', null, t('title')), h('small', null, data?.checkedAt ? `${t('lastChecked')}: ${new Date(data.checkedAt).toLocaleString()}` : t('notChecked'))),
        h('div', { className: 'dpe-toolbar' }, button('check', () => execute('check'), busy),
          button('all', () => execute('start', { generation: data.generation, names: available.map(item => item.name) }), busy || !available.length, true))),
      h('details', { className: 'dpe-notice' }, h('summary', null, t('safety')), h('p', null, t('notice'))),
      h('div', { className: 'dpe-filters', role: 'group', 'aria-label': t('summary') },
        ...[['all', 'allPlugins', items.length], ['ready', 'ready', available.length], ['attention', 'attention', attention.length]].map(([value, label, count]) =>
          h(Button, { key: value, type: 'button', size: 'sm', variant: filter === value ? 'primary' : 'outline', 'aria-pressed': filter === value, onClick: () => setFilter(value) }, `${t(label)} (${count})`)),
        h(Input, { type: 'search', className: 'dpe-search', 'aria-label': t('search'), placeholder: t('search'), value: query, onChange: e => setQuery(e.target.value) })),
      h('div', { className: 'dpe-support', role: 'group', 'aria-label': t('support') },
        ...['all', 'native', 'extended', 'unavailable'].map(value => h(Button, { key: value, type: 'button', size: 'sm', variant: support === value ? 'primary' : 'outline', 'aria-pressed': support === value, onClick: () => setSupport(value) }, `${t(value === 'all' ? 'allSupport' : value)} (${value === 'all' ? items.length : items.filter(item => item.support === value).length})`))),
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
        : !groups.length ? h('div', { className: 'dpe-empty' }, h('p', null, t(query.trim() || support !== 'all' ? 'noMatch' : filter === 'attention' ? 'noAttention' : 'noAvailable')), button('clear', () => { setQuery(''); setFilter('all'); setSupport('all'); }, false))
        : groups.map(group => h('section', { key: group.label, 'aria-label': t(group.label) },
          h('h3', null, `${t(group.label)} (${group.items.length})`),
          h('div', { className: 'dpe-scroll' }, h('table', { 'aria-label': t(group.label) },
            h('thead', null, h('tr', null, ...['name', 'version', 'state', 'details', 'actions'].map(key => h('th', { key, scope: 'col' }, t(key))))),
            h('tbody', null, group.items.map(item => h('tr', { key: item.name },
              h('td', null, h('label', null, h('input', { type: 'checkbox', 'aria-label': item.name, disabled: busy || item.state !== 'ready', checked: selection.includes(item.name), onChange: e => setSelection(values => e.target.checked ? [...values, item.name] : values.filter(value => value !== item.name)) }), ' ', item.name), h('small', null, t(item.enabled ? 'enabled' : 'disabled')), h(Tag, { tone: 'neutral' }, t(item.support))),
              h('td', { className: 'dpe-version' }, item.currentVersion ?? '—', item.target && h('small', null, `→ ${item.target.version}`)),
              h('td', null, h('span', { className: `dpe-badge dpe-${group.label}` }, stateText(item.state))),
              h('td', null, item.reason && stateText(item.reason), item.result?.packageResult?.kind === 'build-blocked' ? h('p', null, t('buildBlocked'), !item.result.pendingBuilds?.length && h('span', null, ' ', t('missingBuildList'))) : item.state === 'pending-builds' && h('p', null, t('pending')), failureDetails(item), item.restoreResult && failureDetails(item, item.restoreResult, 'restoreDetails'), h('small', null, item.source)),
              h('td', null, item.state === 'ready' && button('update', () => execute('start', { generation: data.generation, names: [item.name] }), busy),
                item.retryable && button('retryOne', () => execute('retry', { names: [item.name] }), busy))))))))),
      data?.marketErrors?.map((entry, index) => h('p', { key: `${entry.url}:${index}`, className: 'dpe-error', role: 'alert' }, entry.url ? `${entry.url}: ${entry.message}` : entry.message)));
  }
  ctx.slots.inject('plugins.tab', () => ctx.slots.register({ name: 'plugins.tab', id: 'dsh-plugin-enhance-updates', order: 30, label: () => t('tab') }, Updates));
}

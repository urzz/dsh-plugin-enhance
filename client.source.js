import { TYPERT_REMOTE } from './typert.remote-client.js';

import * as React from 'react';
const h = React.createElement;
const copy = {
  en: { tab: 'Updates', title: 'Plugin updates', check: 'Check for updates', selected: 'Update selected', all: 'Update all available', selectAll: 'Select all available', retry: 'Retry failed updates', empty: 'Check for updates to load installed bundles.', none: 'No installed bundles.', busy: 'Working…', name: 'Plugin', version: 'Version', state: 'Status', details: 'Details', notice: 'Updates uninstall the old bundle before installing the new version. An installation failure can leave it uninstalled. Some changes require restarting DSH. Build scripts require separate approval in the plugin manager.', enabled: 'Enabled', disabled: 'Disabled', pending: 'Review pending build scripts in the plugin manager before retrying.', loading: 'Loading…', ready: 'Update available', current: 'Up to date', skipped: 'Skipped', error: 'Failed', failed: 'Failed', updating: 'Updating', updated: 'Updated', succeeded: 'Updated', 'restart-required': 'Restart required', 'pending-builds': 'Build approval required', confirm: 'I understand that a failed update may leave a plugin uninstalled.', source: 'Source', blocked: 'Unavailable', 'check-failed': 'Check failed', removing: 'Removing old version', installing: 'Installing', stale: 'Changed; check again', self: 'The updater cannot update itself.', builtin: 'Updated with DSH.', 'not-installed': 'Not installed in this profile.', 'not-removable': 'Protected bundle.', 'local-or-unknown-source': 'Local or unknown source.', 'invalid-current-version': 'Invalid installed version.', incompatible: 'Incompatible with this DSH version.', 'unsupported-source': 'This source needs a manual update.', 'market-unavailable': 'Market unavailable; check again before switching sources.', 'not-bundle': 'The target is not a bundle.', 'bundle-changed': 'The installed bundle changed; check again.', 'installed-target-mismatch': 'The installed version differs from the requested target.' },
  zh: { tab: '更新', title: '插件更新', check: '检查更新', selected: '更新所选', all: '更新全部可更新项', selectAll: '全选可更新项', retry: '重试失败项', empty: '点击检查更新，读取已安装组合包。', none: '没有已安装组合包。', busy: '正在处理…', name: '插件', version: '版本', state: '状态', details: '详情', notice: '更新会先卸载旧组合包，再安装新版本。安装失败可能导致插件处于未安装状态；部分变更需要重启 DSH。构建脚本需要在插件管理器中单独授权。', enabled: '已启用', disabled: '已停用', pending: '请在插件管理器中检查并授权待处理的构建脚本，然后重试。', loading: '加载中…', ready: '可更新', current: '已是最新', skipped: '已跳过', error: '失败', failed: '失败', updating: '更新中', updated: '已更新', succeeded: '已更新', 'restart-required': '需要重启', 'pending-builds': '需要脚本授权', confirm: '我已了解更新失败可能导致插件处于未安装状态。', source: '来源', blocked: '不可更新', 'check-failed': '检查失败', removing: '正在卸载旧版', installing: '正在安装', stale: '状态已变化，请重新检查', self: '更新器自身暂不支持更新。', builtin: '随 DSH 一起升级。', 'not-installed': '当前 profile 未安装。', 'not-removable': '受保护的组合包。', 'local-or-unknown-source': '本地或未知来源。', 'invalid-current-version': '已安装版本号无效。', incompatible: '目标版本与当前 DSH 不兼容。', 'unsupported-source': '此来源需要手动更新。', 'market-unavailable': '市场不可用，请重新检查后再更新。', 'not-bundle': '目标包不是组合包。', 'bundle-changed': '插件状态已变化，请重新检查。', 'installed-target-mismatch': '实际安装版本与目标不一致。' },
};
export const inject = ['slots', 'locale', 'remote'];
export async function apply(ctx) {
  const unmount = await ctx.remote.$mount(TYPERT_REMOTE);
  ctx.effect(() => unmount);
  const ns = 'dsh-plugin-enhance';
  ctx.effect(() => ctx.locale.register(ns, copy));
  const t = ctx.locale.bind(ns);
  function Updates() {
    React.useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot());
    const [data, setData] = React.useState(null);
    const [selection, setSelection] = React.useState([]);
    const [error, setError] = React.useState('');
    const [working, setWorking] = React.useState(false);
    const mounted = React.useRef(true);
    async function call(method, args) {
      const result = await ctx.remote.pluginEnhance[method](...(args === undefined ? [] : [args]));
      if (!result.ok) throw result.error;
      return result.value;
    }
    React.useEffect(() => {
      mounted.current = true;
      let timer;
      async function refresh() {
        try { const next = await call('status'); if (mounted.current) setData(next); }
        catch (e) { if (mounted.current) setError(e.message); }
        if (mounted.current) timer = setTimeout(refresh, 1200);
      }
      refresh();
      return () => { mounted.current = false; clearTimeout(timer); };
    }, []);
    async function execute(method, args) {
      setWorking(true); setError('');
      try { const next = await call(method, args); if (mounted.current) { setData(next); setSelection([]); } }
      catch (e) { if (mounted.current) setError(e.message); }
      finally { if (mounted.current) setWorking(false); }
    }
    const items = data?.items ?? [];
    const available = items.filter(item => item.state === 'ready');
    const busy = working || Boolean(data?.busy);
    const stateText = value => Object.hasOwn(copy.en, value) ? t(value) : value;
    const button = (label, action, disabled) => h('button', { type: 'button', onClick: action, disabled, className: 'dpe-button' }, t(label));
    return h('section', { className: 'dpe', 'aria-busy': busy },
      h('style', null, '.dpe{color:var(--dsw-alias-label-primary);padding:20px;max-width:1100px;margin:auto}.dpe-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.dpe-button{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 12px;cursor:pointer}.dpe-button:disabled{opacity:.45;cursor:default}.dpe-button:focus-visible,.dpe input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.dpe-notice{color:var(--dsw-alias-label-secondary);line-height:1.6}.dpe-scroll{overflow-x:auto}.dpe table{border-collapse:collapse;width:100%;margin-top:16px;font-size:13px}.dpe th,.dpe td{padding:12px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);text-align:left;vertical-align:top}.dpe small{display:block;color:var(--dsw-alias-label-secondary);margin-top:4px}.dpe-error{color:var(--dsw-alias-state-error-primary);white-space:pre-wrap}.dpe pre{white-space:pre-wrap;overflow-wrap:anywhere}'),
      h('h2', null, t('title')), h('p', { className: 'dpe-notice' }, t('notice')),
      h('div', { className: 'dpe-toolbar' },
        button('check', () => execute('check'), busy),
        button('selectAll', () => setSelection(available.map(item => item.name)), busy || !available.length),
        button('selected', () => execute('start', { generation: data.generation, names: selection }), busy || !selection.length),
        button('all', () => execute('start', { generation: data.generation, names: available.map(item => item.name) }), busy || !available.length),
        button('retry', () => execute('retry', {}), busy || !items.some(item => item.retryable))),
      busy && h('p', { role: 'status' }, t('busy')),
      error && h('p', { className: 'dpe-error', role: 'alert' }, error),
      !items.length ? h('p', null, t(data?.checkedAt ? 'none' : 'empty')) : h('div', { className: 'dpe-scroll' }, h('table', null,
        h('thead', null, h('tr', null, ...['name', 'version', 'state', 'details'].map(key => h('th', { key }, t(key))))),
        h('tbody', null, items.map(item => h('tr', { key: item.name },
          h('td', null, h('label', null, h('input', { type: 'checkbox', 'aria-label': item.name, disabled: busy || item.state !== 'ready', checked: selection.includes(item.name), onChange: e => setSelection(values => e.target.checked ? [...values, item.name] : values.filter(value => value !== item.name)) }), ' ', item.name), h('small', null, t(item.enabled ? 'enabled' : 'disabled'))),
          h('td', null, item.currentVersion, item.target && ` → ${item.target.version}`),
          h('td', null, stateText(item.state)),
          h('td', null, item.reason && stateText(item.reason), item.state === 'pending-builds' && h('p', null, t('pending')), h('small', null, item.source))))))),
      data?.marketErrors?.map(entry => h('p', { key: entry.url, className: 'dpe-error', role: 'alert' }, `${entry.url}: ${entry.message}`)));
  }
  ctx.slots.inject('plugins.tab', () => ctx.slots.register({ name: 'plugins.tab', id: 'dsh-plugin-enhance-updates', order: 30, label: () => t('tab') }, Updates));
}

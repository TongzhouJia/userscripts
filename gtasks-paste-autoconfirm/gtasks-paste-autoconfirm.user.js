// ==UserScript==
// @name         Google Tasks 粘贴确认自动跳过
// @namespace    https://github.com/TongzhouJia/userscripts
// @version      1.0.0
// @description  在 Google Tasks 粘贴生成多条任务时弹出的「确定要创建 N 个任务吗」确认框，自动点 OK。只认这句措辞，删除清单/任务等其他确认框不碰。Ctrl+Shift+A 开关，Ctrl+Shift+D 诊断。
// @author       tom
// @match        https://tasks.google.com/tasks/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ── 配置 ────────────────────────────────────────────────────────────
  const LS_KEY = 'gtasks-paste-autoconfirm';
  let enabled = localStorage.getItem(LS_KEY) !== 'off';

  // 只匹配「粘贴 …… 创建 N 个任务」这句措辞，中英文都兼容。
  // 房规：Google 的确认框全走同一套 MDC 组件，光凭
  // data-mdc-dialog-action="ok" 分不出这是哪个弹窗 ——
  // 删除清单/删除任务大概率也长这样，绝不能只认这个属性就点。
  const RE_PASTE_EN = /pasting.*creat.*tasks?/i;
  const RE_PASTE_ZH = /粘贴.*创建.*个?任务/;

  function isPasteCountDialog(dialogEl) {
    const text = (dialogEl.textContent || '').replace(/\s+/g, ' ');
    return RE_PASTE_EN.test(text) || RE_PASTE_ZH.test(text);
  }

  const handled = new WeakSet();

  function tryHandle(dialogEl) {
    if (!enabled || handled.has(dialogEl) || !isPasteCountDialog(dialogEl)) return;

    const okBtn = dialogEl.querySelector('button[data-mdc-dialog-action="ok"]');
    if (!okBtn) return;

    handled.add(dialogEl);
    okBtn.click();
    toast('✅ 已自动确认粘贴');
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches?.('div[role="dialog"][aria-modal="true"]')) tryHandle(root);
    root.querySelectorAll?.('div[role="dialog"][aria-modal="true"]').forEach(tryHandle);
  }

  // ── 观察：弹窗是异步插进 DOM 的，得靠 MutationObserver 而不是 paste 事件本身 ──
  new MutationObserver((mutations) => {
    for (const m of mutations) for (const node of m.addedNodes) scan(node);
  }).observe(document.body, { childList: true, subtree: true });

  // ── 快捷键 ──────────────────────────────────────────────────────────
  document.addEventListener(
    'keydown',
    (e) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      const k = e.key.toLowerCase();

      if (k === 'a') {
        e.preventDefault();
        enabled = !enabled;
        localStorage.setItem(LS_KEY, enabled ? 'on' : 'off');
        toast(enabled ? '✅ 已开启' : '⏸️ 已关闭');
      } else if (k === 'd') {
        e.preventDefault();
        const dialogs = [...document.querySelectorAll('div[role="dialog"][aria-modal="true"]')];
        console.log('[gtasks-paste-autoconfirm] 当前弹窗:', dialogs);
        dialogs.forEach((d) =>
          console.log('  文字:', (d.textContent || '').replace(/\s+/g, ' ').slice(0, 120))
        );
        toast(`🔍 找到 ${dialogs.length} 个弹窗，已打印到控制台`);
      }
    },
    true
  );

  // ── 角落提示条 ──────────────────────────────────────────────────────
  let tipEl, tipTimer;
  function toast(msg) {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.style.cssText = [
        'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
        'background:rgba(28,28,30,.92)', 'color:#f2f2f7',
        'font:13px/1.5 system-ui,sans-serif', 'padding:8px 12px',
        'border-radius:8px', 'pointer-events:none',
        'box-shadow:0 4px 16px rgba(0,0,0,.3)', 'transition:opacity .25s', 'opacity:0',
      ].join(';');
      document.body.appendChild(tipEl);
    }
    tipEl.textContent = msg;
    tipEl.style.opacity = '1';
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tipEl.style.opacity = '0'; }, 2200);
  }

  toast('🎧 脚本已就绪（Ctrl+Shift+A 开关 · Ctrl+Shift+D 诊断）');
})();

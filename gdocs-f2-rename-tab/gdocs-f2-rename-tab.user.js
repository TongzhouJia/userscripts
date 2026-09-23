// ==UserScript==
// @name         Google Docs 按 F2 重命名当前标签页
// @namespace    https://github.com/TongzhouJia/userscripts
// @version      1.0.0
// @description  在 Google 文档里按 F2，自动点当前标签页（Tab）的「⋮」→「Rename」，直接进入改名。Ctrl+Shift+A 开关，Ctrl+Shift+D 诊断。
// @author       tom
// @match        https://docs.google.com/document/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ── 配置 ────────────────────────────────────────────────────────────
  const TIMEOUT_MS = 2000;  // 等菜单弹出来的上限
  const LS_KEY = 'gdocs-f2-rename-tab';
  let enabled = localStorage.getItem(LS_KEY) !== 'off';

  const RE_RENAME = /^\s*(Rename|重命名)/i;

  // ── 定位：当前标签页的「⋮」按钮 ─────────────────────────────────────
  // 优先认 class chapter-overflow-menu-button（不随界面语言变），
  // 兜底认 aria-label / data-tooltip「Tab options」。
  function allOverflowButtons() {
    const set = new Set([
      ...document.querySelectorAll('.chapter-overflow-menu-button [role="button"]'),
      ...document.querySelectorAll('[role="button"][aria-label="Tab options"], [role="button"][data-tooltip="Tab options"]'),
    ]);
    return [...set];
  }

  // 从按钮往上爬，在「只包含这一个 ⋮ 按钮」的范围内找选中标记；
  // 一旦祖先包含了多个 ⋮ 按钮就停，免得爬到整个列表误判
  function isSelectedTab(btn) {
    let el = btn;
    for (let i = 0; i < 10 && el.parentElement; i++) {
      el = el.parentElement;
      if (el.querySelectorAll('.chapter-overflow-menu-button, [aria-label="Tab options"]').length > 1) return false;
      if (el.getAttribute('aria-selected') === 'true') return true;
      if (/(^|[-_\s])selected\b/i.test(el.className || '')) return true;
      if (el.querySelector('[aria-selected="true"]')) return true;
    }
    return false;
  }

  function findCurrentTabButton() {
    const btns = allOverflowButtons();
    return btns.find(isSelectedTab) || (btns.length === 1 ? btns[0] : null);
  }

  function findRenameItem() {
    return [...document.querySelectorAll('[role="menuitem"]')].find(
      (m) => m.offsetParent !== null && RE_RENAME.test(m.textContent || '')
    );
  }

  // ── 点击：Closure 的 goog-button / 菜单项认 mousedown+mouseup，不认 click() ──
  function press(el) {
    const opts = { bubbles: true, cancelable: true, view: window, button: 0 };
    el.dispatchEvent(new MouseEvent('mouseover', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
  }

  function waitFor(cond, cb, timeout = TIMEOUT_MS) {
    const t0 = performance.now();
    (function tick() {
      const r = cond();
      if (r) return cb(r);
      if (performance.now() - t0 > timeout) return cb(null);
      setTimeout(tick, 50);
    })();
  }

  function renameCurrentTab() {
    const btn = findCurrentTabButton();
    if (!btn) return toast('⚠️ 没找到当前标签页的 ⋮ 按钮（左侧标签栏收起了？）— Ctrl+Shift+D 看诊断');

    press(btn);
    // mousedown/mouseup 没打开菜单的话，再补一次 click（只补一次，免得开了又关）
    setTimeout(() => {
      if (btn.getAttribute('aria-expanded') !== 'true' && !findRenameItem()) btn.click();
    }, 150);

    waitFor(findRenameItem, (item) => {
      if (!item) return toast('⚠️ 菜单里没找到 Rename — Ctrl+Shift+D 看诊断');
      press(item);
      setTimeout(() => { if (item.isConnected && item.offsetParent !== null) item.click(); }, 150);
    });
  }

  // ── 快捷键 ──────────────────────────────────────────────────────────
  function onKeydown(e) {
    if (e.key === 'F2' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      renameCurrentTab();
      return;
    }
    if (!e.ctrlKey || !e.shiftKey) return;
    const k = e.key.toLowerCase();

    if (k === 'a') {
      e.preventDefault();
      enabled = !enabled;
      localStorage.setItem(LS_KEY, enabled ? 'on' : 'off');
      toast(enabled ? '✅ F2 改名已开启' : '⏸️ F2 改名已关闭');
    } else if (k === 'd') {
      e.preventDefault();
      const btns = allOverflowButtons();
      console.log('[gdocs-f2-rename-tab] 判定为当前标签的按钮:', findCurrentTabButton());
      console.table(btns.map((b, i) => ({
        i,
        selected: isSelectedTab(b),
        tabText: (b.closest('[role="treeitem"], [role="tab"]') || b.parentElement.parentElement).textContent.trim().slice(0, 30),
      })));
      btns.forEach((b, i) => console.log(`  #${i} 祖先链:`, b.parentElement.parentElement.parentElement));
      toast(`🔍 找到 ${btns.length} 个 ⋮ 按钮，已打印到控制台（F12）`);
    }
  }

  // 正文编辑区的按键发生在 .docs-texteventtarget-iframe 里，不会冒泡到顶层 document，
  // 所以顶层和这个 iframe 两边都要挂监听（iframe 会被重建，用 WeakSet 防重复挂）
  const hooked = new WeakSet();
  function hook(doc) {
    if (!doc || hooked.has(doc)) return;
    hooked.add(doc);
    doc.addEventListener('keydown', onKeydown, true);
  }
  hook(document);
  function hookIframes() {
    document.querySelectorAll('iframe.docs-texteventtarget-iframe').forEach((f) => {
      try { hook(f.contentDocument); } catch (_) { /* 跨域的不管 */ }
    });
  }
  hookIframes();
  setInterval(hookIframes, 1000);

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

  toast('✏️ F2 改标签名已就绪（Ctrl+Shift+A 开关 · Ctrl+Shift+D 诊断）');
})();

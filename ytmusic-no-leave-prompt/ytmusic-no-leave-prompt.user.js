// ==UserScript==
// @name         YouTube Music 关标签页别拦我
// @namespace    https://github.com/TongzhouJia/userscripts
// @version      1.0.1
// @description  干掉 YouTube Music 的「Leave site?」离开确认弹窗，Ctrl+W 直接关。Ctrl+Shift+A 开关，Ctrl+Shift+D 诊断。
// @author       tom
// @match        https://music.youtube.com/*
// @updateURL    https://raw.githubusercontent.com/TongzhouJia/userscripts/main/ytmusic-no-leave-prompt/ytmusic-no-leave-prompt.user.js
// @downloadURL  https://raw.githubusercontent.com/TongzhouJia/userscripts/main/ytmusic-no-leave-prompt/ytmusic-no-leave-prompt.user.js
// @grant        none
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ── 配置 ────────────────────────────────────────────────────────────
  // 想连 unload 一起拦就加进来；只想放行某些场景就从这里删
  const BLOCKED_EVENTS = ['beforeunload'];

  const LS_KEY = 'ytm-no-leave-prompt';
  let enabled = localStorage.getItem(LS_KEY) !== 'off';

  // 诊断用：记下拦了多少次、都是谁注册的
  const blocked = { addEventListener: 0, onbeforeunload: 0, callers: [] };

  function note(kind) {
    blocked[kind]++;
    if (blocked.callers.length < 20) {
      const line = (new Error().stack || '').split('\n')[3] || '(无栈信息)';
      blocked.callers.push(`${kind}: ${line.trim()}`);
    }
  }

  // ── 拦截点 1：addEventListener('beforeunload', ...) ──────────────────
  // 必须在 document-start 就换掉，晚一步 YTM 已经注册完了
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (enabled && BLOCKED_EVENTS.includes(String(type).toLowerCase())) {
      note('addEventListener');
      return; // 直接不注册，浏览器就没有理由弹框
    }
    return origAdd.call(this, type, listener, options);
  };

  // ── 拦截点 2：window.onbeforeunload = fn ────────────────────────────
  // 存下页面赋的值并原样读回，免得它自己的逻辑读到 null 就崩；
  // 但浏览器内部的 handler 槽位始终是空的 —— 弹框就没了
  let stashed = null;
  Object.defineProperty(window, 'onbeforeunload', {
    configurable: true,
    get() {
      return enabled ? stashed : null;
    },
    set(fn) {
      if (enabled) {
        stashed = fn;
        if (fn) note('onbeforeunload');
        return;
      }
      delete window.onbeforeunload;
      window.onbeforeunload = fn;
    },
  });

  // ── 快捷键 ──────────────────────────────────────────────────────────
  // 一律捕获阶段，否则会被 YTM 自己的播放器快捷键 handler 吃掉
  document.addEventListener(
    'keydown',
    (e) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      const k = e.key.toLowerCase();

      if (k === 'a') {
        e.preventDefault();
        enabled = !enabled;
        localStorage.setItem(LS_KEY, enabled ? 'on' : 'off');
        toast(enabled ? '✅ 已开启拦截' : '⏸️ 已关闭拦截（要刷新页面才完全恢复）');
      } else if (k === 'd') {
        e.preventDefault();
        console.log('[ytm-no-leave-prompt] 开关:', enabled ? '开' : '关');
        console.log('[ytm-no-leave-prompt] 已拦截:', {
          'addEventListener 次数': blocked.addEventListener,
          'onbeforeunload 赋值次数': blocked.onbeforeunload,
        });
        console.log('[ytm-no-leave-prompt] 注册来源:', blocked.callers);
        toast('🔍 已打印到控制台（F12）');
      }
    },
    true
  );

  // ── 角落提示条 ──────────────────────────────────────────────────────
  // document-start 时 body 还没有，等它出来再挂
  let tipEl, tipTimer;
  function toast(msg) {
    if (!document.body) return;
    if (!tipEl || !tipEl.isConnected) {
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
})();

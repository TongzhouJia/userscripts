// ==UserScript==
// @name         脚本名字
// @namespace    https://github.com/TongzhouJia/userscripts
// @version      1.0.0
// @description  一句话说清楚干什么。Ctrl+Shift+A 开关，Ctrl+Shift+D 诊断。
// @author       tom
// @match        https://example.com/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ── 配置 ────────────────────────────────────────────────────────────
  const SETTLE_MS = 400;    // 目标就绪后再静置多久才动手
  const TIMEOUT_MS = 4000;  // 等待上限

  const LS_KEY = 'my-script';
  let enabled = localStorage.getItem(LS_KEY) !== 'off';

  // ── 定位元素 ────────────────────────────────────────────────────────
  // 房规：优先 jsname / data-* / aria-label，绝不用 Material 的 VfPpkd-* class
  //（那是水波纹层，每个按钮都有）。写成多层兜底，任一命中即可。
  function findTarget() {
    const scope = document; // 需要的话缩小到某个面板，避免误中同名元素
    return (
      scope.querySelector('button[jsname="TODO"]') ||
      scope.querySelector('button[data-tooltip-label-on="TODO"]') ||
      [...scope.querySelectorAll('button, [role="button"]')].find((b) =>
        /TODO/i.test(b.getAttribute('aria-label') || '')
      ) ||
      null
    );
  }

  // 从某个已知元素往上爬，找到第一个含多个按钮的祖先，用来缩小查找范围
  function panelOf(el, minButtons = 2, maxHops = 8) {
    for (let i = 0; i < maxHops && el && el.parentElement; i++) {
      el = el.parentElement;
      if (el.querySelectorAll('button, [role="button"]').length >= minButtons) return el;
    }
    return null;
  }

  function isUsable(el) {
    // 注意：有些站点的按钮永远 disabled:false，别拿它当「就绪」判据
    return (
      el &&
      !el.disabled &&
      el.getAttribute('aria-disabled') !== 'true' &&
      el.offsetParent !== null
    );
  }

  // ── 等待：轮询条件，不要用固定 setTimeout ───────────────────────────
  function waitFor(cond, cb, { settle = SETTLE_MS, timeout = TIMEOUT_MS } = {}) {
    const t0 = performance.now();
    (function tick() {
      if (cond()) return setTimeout(cb, settle);
      if (performance.now() - t0 > timeout) return cb(null);
      setTimeout(tick, 60);
    })();
  }

  const norm = (s) => (s || '').replace(/\s+/g, '');

  // ── 触发 ────────────────────────────────────────────────────────────
  // 一律用捕获阶段（第三个参数 true），否则会被页面自己的 handler 吃掉
  document.addEventListener(
    'paste',
    (e) => {
      if (!enabled) return;
      const cb = e.clipboardData || window.clipboardData;
      const text = cb && cb.getData ? cb.getData('text') : '';
      if (!text || !text.trim()) return;

      const needle = norm(text).slice(0, 30);
      waitFor(
        () => norm(e.target.value).includes(needle),
        () => {
          const el = findTarget();
          if (isUsable(el)) {
            el.click(); // 切换型按钮只点一次，补发指针事件 = 点两下
            toast('✅ 完成');
          } else {
            toast('⚠️ 没找到目标 — 按 Ctrl+Shift+D 看诊断');
          }
        }
      );
    },
    true
  );

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
        console.log('[script] 命中的元素:', findTarget());
        console.table(
          [...document.querySelectorAll('button, [role="button"]')].map((b, i) => ({
            i,
            jsname: b.getAttribute('jsname'),
            'aria-label': b.getAttribute('aria-label'),
            text: (b.textContent || '').trim().slice(0, 24),
            disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
          }))
        );
        toast('🔍 已打印到控制台（F12）');
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

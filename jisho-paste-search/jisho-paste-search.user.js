// ==UserScript==
// @name         Jisho·粘贴自动搜索
// @namespace    https://github.com/TongzhouJia/userscripts
// @version      1.0.0
// @description  在 jisho.org 搜索框粘贴内容后自动发起搜索，不用再点放大镜。Ctrl+Shift+A 开关，Ctrl+Shift+D 诊断。
// @author       tom
// @match        https://jisho.org/*
// @match        https://*.jisho.org/*
// @icon         https://jisho.org/favicon.ico
// @updateURL    https://raw.githubusercontent.com/TongzhouJia/userscripts/main/jisho-paste-search/jisho-paste-search.user.js
// @downloadURL  https://raw.githubusercontent.com/TongzhouJia/userscripts/main/jisho-paste-search/jisho-paste-search.user.js
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ── 配置 ────────────────────────────────────────────────────────────
  const SETTLE_MS = 120;    // 文字落进输入框后再静置多久才提交（觉得抢跑就调大）
  const TIMEOUT_MS = 3000;  // 等文字到位的上限
  const TRIM_LINES = true;  // 多行粘贴时只取第一行非空内容（词典一次只查一个词）

  const LS_KEY = 'jisho-paste-search';
  let enabled = localStorage.getItem(LS_KEY) !== 'off';

  // ── 定位元素 ────────────────────────────────────────────────────────
  // 实测 DOM（2026-08）：
  //   <form class="search" id="search" action="/search" method="get">
  //     <input class="keyword japanese_gothic" name="keyword" id="keyword">
  //     <button type="submit" class="submit icon">…<svg class="icon search-icon">
  // id 和 name 都很稳，class 只当兜底。
  function findInput() {
    return (
      document.querySelector('#keyword') ||
      document.querySelector('form#search input[name="keyword"]') ||
      document.querySelector('input.keyword') ||
      null
    );
  }

  function findForm(input) {
    return (
      (input && input.form) ||
      document.querySelector('form#search') ||
      document.querySelector('form.search') ||
      document.querySelector('form[action="/search"]') ||
      null
    );
  }

  function findButton(form) {
    const scope = form || document;
    return (
      scope.querySelector('button[type="submit"].submit') ||
      scope.querySelector('button[type="submit"]') ||
      scope.querySelector('input[type="submit"]') ||
      null
    );
  }

  // 提交：优先 requestSubmit()，它会走页面自己的 submit 监听（表单校验、
  // 自动补全收起都靠它）；老浏览器没有就点按钮；再不行才 form.submit()
  //（后者不触发 submit 事件，算最后的兜底）。
  function doSearch(form) {
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
      return 'requestSubmit';
    }
    const btn = findButton(form);
    if (btn) {
      btn.click();
      return 'click';
    }
    form.submit();
    return 'submit';
  }

  // ── 等文字真正落进输入框 ────────────────────────────────────────────
  // 粘贴事件是在浏览器把文字写进 input 之前触发的，所以不能立刻读 value。
  // 轮询到刚粘的内容真的出现在框里再提交，比死等 setTimeout 又快又准。
  const norm = (s) => (s || '').replace(/\s+/g, '');

  function whenPasted(input, pasted, cb) {
    const needle = norm(pasted).slice(0, 20);
    const t0 = performance.now();
    (function tick() {
      const hit = needle ? norm(input.value).includes(needle) : input.value.trim();
      if (hit) return setTimeout(cb, SETTLE_MS);
      if (performance.now() - t0 > TIMEOUT_MS) return cb();
      setTimeout(tick, 40);
    })();
  }

  // 多行/带空白的剪贴板内容清理成一个查询词，并直接写回输入框
  function tidy(input, pasted) {
    if (!TRIM_LINES) return;
    const first = pasted.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    if (first && norm(input.value) !== norm(first)) {
      input.value = first;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (input.value !== input.value.trim()) {
      input.value = input.value.trim();
    }
  }

  // ── 触发：粘贴 ──────────────────────────────────────────────────────
  document.addEventListener(
    'paste',
    (e) => {
      if (!enabled) return;
      const input = e.target;
      if (!input || input !== findInput()) return;

      const cbData = e.clipboardData || window.clipboardData;
      const pasted = cbData && cbData.getData ? cbData.getData('text') : '';
      if (!pasted || !pasted.trim()) return;

      const form = findForm(input);
      if (!form) return toast('⚠️ 没找到搜索表单 — 按 Ctrl+Shift+D 看诊断');

      whenPasted(input, pasted, () => {
        if (!input.value.trim()) return toast('⚠️ 输入框还是空的，没提交');
        tidy(input, pasted);
        toast('🔎 搜索中：' + input.value.trim());
        doSearch(form);
      });
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
        toast(enabled ? '✅ 粘贴自动搜索：开' : '⏸️ 粘贴自动搜索：关');
      } else if (k === 'd') {
        e.preventDefault();
        const input = findInput();
        const form = findForm(input);
        console.log('[jisho-paste-search] 输入框:', input);
        console.log('[jisho-paste-search] 表单:', form, 'action=', form && form.action);
        console.log('[jisho-paste-search] 提交按钮:', findButton(form));
        console.log('[jisho-paste-search] requestSubmit 可用:', !!(form && form.requestSubmit));
        console.log('[jisho-paste-search] 开关:', enabled ? '开' : '关');
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

  toast('🈶 粘贴自动搜索已就绪（Ctrl+Shift+A 开关 · Ctrl+Shift+D 诊断）');
})();

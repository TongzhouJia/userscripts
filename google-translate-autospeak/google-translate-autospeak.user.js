// ==UserScript==
// @name         谷歌翻译·粘贴自动朗读
// @namespace    https://github.com/TongzhouJia
// @version      3.0.1
// @description  在 translate.google.com 粘贴后，等文字真正落进输入框，再点它自己的「听取原文」。Ctrl+Shift+A 开关，Ctrl+Shift+D 诊断。
// @author       tom
// @match        https://translate.google.com/*
// @icon         https://translate.google.com/favicon.ico
// @updateURL    https://raw.githubusercontent.com/TongzhouJia/userscripts/main/google-translate-autospeak/google-translate-autospeak.user.js
// @downloadURL  https://raw.githubusercontent.com/TongzhouJia/userscripts/main/google-translate-autospeak/google-translate-autospeak.user.js
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ── 配置 ────────────────────────────────────────────────────────────
  const SETTLE_MS = 400;   // 文字到位后再静置多久才点（觉得抢跑就调到 1000）
  const TIMEOUT_MS = 4000; // 等文字到位的上限

  const LS_KEY = 'gt-autospeak';
  let enabled = localStorage.getItem(LS_KEY) !== 'off';

  // ── 定位「听取原文」按钮 ────────────────────────────────────────────
  // 实测 DOM（2026-08）：
  //   <button jsname="UsVyAb" aria-label="听取原文"
  //           data-aria-label-off="听取原文" data-aria-label-on="停止聆听"
  //           data-tooltip-label-off="朗读" data-tooltip-label-on="停止">
  // 注意两个坑：
  //   1. class 全是 VfPpkd-Bz112c-*，那是 Material 水波纹层，每个按钮都有，不能用来认人。
  //   2. 别用「语音」两字匹配 aria-label —— 麦克风按钮叫「语音翻译」，会被抢先命中。
  const LISTEN_JSNAME = 'UsVyAb';
  const LABEL_RE = /听取|聆听|朗读|朗讀|发音|發音|listen|speak|聞く|読み上げ|듣기/i;
  const SPEAKER_PATH = 'M3 9v6h4l5 5V4L7 9H3'; // Material 喇叭图标的 path 开头

  // 从 textarea 往上爬到第一个含多个按钮的祖先 = 原文侧面板。
  // 限定在这里找，才不会误点译文侧的朗读。
  function sourcePanel() {
    const ta = document.querySelector('textarea');
    if (!ta) return null;
    let el = ta;
    for (let i = 0; i < 8 && el.parentElement; i++) {
      el = el.parentElement;
      if (el.querySelectorAll('button, [role="button"]').length >= 2) return el;
    }
    return null;
  }

  function findListenButton() {
    const panel = sourcePanel() || document;
    const btns = () => [...panel.querySelectorAll('button, [role="button"]')];
    return (
      panel.querySelector(`button[jsname="${LISTEN_JSNAME}"]`) ||
      panel.querySelector('button[data-tooltip-label-on="停止"]') ||
      btns().find((b) => LABEL_RE.test(b.getAttribute('data-aria-label-off') || '')) ||
      btns().find((b) => LABEL_RE.test(b.getAttribute('aria-label') || '')) ||
      btns().find((b) => b.querySelector(`svg path[d^="${SPEAKER_PATH}"]`)) ||
      null
    );
  }

  // 这按钮是播放/停止切换：播放中 aria-label 会变成 data-aria-label-on 的值
  function isPlaying(b) {
    const on = b.getAttribute('data-aria-label-on');
    return !!on && b.getAttribute('aria-label') === on;
  }

  function isUsable(b) {
    return (
      b &&
      !b.disabled &&
      b.getAttribute('aria-disabled') !== 'true' &&
      b.offsetParent !== null
    );
  }

  // 播放中就先停再放，保证从头读新内容
  function play(btn) {
    if (isPlaying(btn)) {
      btn.click();
      setTimeout(() => btn.click(), 200);
    } else {
      btn.click();
    }
  }

  // ── 等文字真正落进输入框 ────────────────────────────────────────────
  // 比「粘贴后死等 1 秒」可靠：只要 textarea 里出现了刚粘的内容就算到位，
  // 因此绝不可能读到上一段；到位后再静置 SETTLE_MS 让谷歌内部状态跟上。
  const norm = (s) => (s || '').replace(/\s+/g, '');

  function whenPasted(ta, pasted, cb) {
    const needle = norm(pasted).slice(0, 30);
    const t0 = performance.now();
    (function tick() {
      const hit = needle ? norm(ta.value).includes(needle) : ta.value.trim();
      if (hit) return setTimeout(() => cb(findListenButton()), SETTLE_MS);
      if (performance.now() - t0 > TIMEOUT_MS) return cb(null);
      setTimeout(tick, 60);
    })();
  }

  // ── 触发：粘贴 ──────────────────────────────────────────────────────
  document.addEventListener(
    'paste',
    (e) => {
      if (!enabled) return;
      const ta = e.target;
      if (!ta || ta.tagName !== 'TEXTAREA') return;
      const cb = e.clipboardData || window.clipboardData;
      const pasted = cb && cb.getData ? cb.getData('text') : '';
      if (!pasted || !pasted.trim()) return;

      whenPasted(ta, pasted, (btn) => {
        if (isUsable(btn)) {
          play(btn);
          toast('🔊 朗读中');
        } else {
          toast('⚠️ 没找到「听取原文」按钮 — 按 Ctrl+Shift+D 看诊断');
        }
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

      if (k === 's') {
        e.preventDefault();
        const btn = findListenButton();
        if (isUsable(btn)) btn.click(); // 手动键：单纯切换，播放中按=停
        else toast('⚠️ 朗读按钮不可用');
      } else if (k === 'a') {
        e.preventDefault();
        enabled = !enabled;
        localStorage.setItem(LS_KEY, enabled ? 'on' : 'off');
        toast(enabled ? '✅ 粘贴自动朗读：开' : '⏸️ 粘贴自动朗读：关');
      } else if (k === 'd') {
        e.preventDefault();
        const panel = sourcePanel();
        console.log('[autospeak] 源文本面板:', panel);
        console.log('[autospeak] 命中的朗读按钮:', findListenButton());
        console.table(
          [...(panel ? panel.querySelectorAll('button, [role="button"]') : [])].map((b, i) => ({
            i,
            jsname: b.getAttribute('jsname'),
            'aria-label': b.getAttribute('aria-label'),
            'label-off': b.getAttribute('data-aria-label-off'),
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

  toast('🎧 粘贴自动朗读已就绪（Ctrl+Shift+A 开关 · Ctrl+Shift+D 诊断）');
})();

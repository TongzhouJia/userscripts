// ==UserScript==
// @name         谷歌翻译·粘贴自动朗读
// @namespace    https://github.com/TongzhouJia
// @version      3.1.0
// @description  在 translate.google.com 粘贴后，等文字落进输入框且译文渲染完毕，再点它自己的「听取原文」；被重渲染掐断会自动续读。Ctrl+Shift+A 开关，Ctrl+Shift+D 诊断。
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
  const SETTLE_MS = 400;    // 文字到位后再静置多久才开始等 DOM 安静
  const TIMEOUT_MS = 4000;  // 等文字到位的上限
  const QUIET_MS = 700;     // DOM 连续这么久没变动才算「翻译渲染完了」（还被掐就调到 1200）
  const MAX_WAIT_MS = 8000; // 等 DOM 安静的上限，超时也照点（慢网别干等）
  const RESUME_MS = 3500;   // 开播后这么久内就停了，判定是被掐断，自动续读
  const MAX_RESUME = 1;     // 最多自动续几次（防死循环）

  const LS_KEY = 'gt-autospeak';
  let enabled = localStorage.getItem(LS_KEY) !== 'off';

  // ── 是不是真的整页刷新了？──────────────────────────────────────────
  // 整页刷新的话脚本会重跑，一切状态清零；SPA 重渲染不会。用 sessionStorage
  // 存上次开播的时间戳，脚本一启动就回头看：距上次开播不到 15 秒还重跑了，
  // 那就是真导航（诊断里会显示），否则就是 SPA 重渲染。
  const PLAY_TS_KEY = 'gt-autospeak-last-play';
  const prevPlay = Number(sessionStorage.getItem(PLAY_TS_KEY) || 0);
  const reloadedMidPlay = prevPlay > 0 && Date.now() - prevPlay < 15000;
  const markPlay = () => sessionStorage.setItem(PLAY_TS_KEY, String(Date.now()));
  let lastQuietReason = '(还没等过)';

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
      if (hit) return setTimeout(() => cb(true), SETTLE_MS);
      if (performance.now() - t0 > TIMEOUT_MS) return cb(false);
      setTimeout(tick, 60);
    })();
  }

  // ── 再等译文渲染完 ──────────────────────────────────────────────────
  // 「读一半突然断」的真凶：谷歌翻译是 SPA，不会整页刷新，但译文回来时它会把
  // 那一整块 c-wiz 重新渲染，朗读按钮连同背后播放音频的 <audio> 一起被换掉，
  // 声音就在半路没了。文字落进 textarea 只说明输入到位，翻译请求还在路上
  //（实测 800ms~2s），这时候点朗读必被后到的渲染掐断。
  //
  // 判据不用「译文出现了没」—— 译文侧的选择器（ryNqvb / jsname=W297wb）改版就废。
  // 改成等 DOM 安静：连续 QUIET_MS 没有任何 childList/characterData 变动，
  // 就认为这一轮渲染结束了。不依赖任何 Google 的 class 或 jsname。
  function whenQuiet(cb, { quiet = QUIET_MS, max = MAX_WAIT_MS } = {}) {
    const t0 = performance.now();
    let timer, done = false;

    const finish = (why) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      obs.disconnect();
      lastQuietReason = why;
      cb(why);
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish('quiet'), quiet);
    };

    const obs = new MutationObserver((muts) => {
      // 忽略自己那条提示条引起的变动，否则它一淡出就把静默计时重置了
      if (tipEl && muts.every((m) => tipEl === m.target || tipEl.contains(m.target))) return;
      if (performance.now() - t0 > max) return finish('timeout');
      arm();
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    arm();
  }

  // ── 断读自动续 ──────────────────────────────────────────────────────
  // 上面那道防线挡不住「译文回来得特别晚」或「谷歌自己二次渲染」的情况，
  // 所以再加一层兜底：起播后盯着 aria-label，如果 RESUME_MS 内就停了，
  // 那不是读完，是被掐了 —— 等 DOM 重新安静下来再读一遍。最多续 MAX_RESUME 次。
  function watchPlayback(attempt) {
    attempt = attempt || 0;
    const t0 = performance.now();
    let started = false;

    (function tick() {
      const btn = findListenButton();
      const playing = !!btn && isPlaying(btn);
      const dt = performance.now() - t0;

      if (!started) {
        if (playing) started = true;
        else if (dt > 2000) return; // 2 秒还没起播：可能界面语言让 aria-label 判据失效，放弃盯梢
        return setTimeout(tick, 150);
      }

      if (playing) return setTimeout(tick, 250);

      if (dt < RESUME_MS && attempt < MAX_RESUME) {
        toast('🔁 朗读被页面重渲染掐断，等它稳下来再读一遍');
        return whenQuiet(
          () => {
            const b = findListenButton();
            if (isUsable(b)) {
              play(b);
              watchPlayback(attempt + 1);
            } else {
              toast('⚠️ 续读失败：按钮不可用');
            }
          },
          { quiet: 600, max: 4000 }
        );
      }
      // 读满 RESUME_MS 才停 = 正常读完
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

      whenPasted(ta, pasted, (ok) => {
        if (!ok) return toast('⚠️ 文字没落进输入框，放弃');
        toast('⏳ 等译文渲染完…');
        whenQuiet(() => {
          const btn = findListenButton();
          if (isUsable(btn)) {
            markPlay();
            play(btn);
            toast('🔊 朗读中');
            watchPlayback();
          } else {
            toast('⚠️ 没找到「听取原文」按钮 — 按 Ctrl+Shift+D 看诊断');
          }
        });
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
        console.log('[autospeak] 上次等 DOM 安静的结果:', lastQuietReason, '(quiet=正常 / timeout=页面一直在动)');
        console.log(
          '[autospeak] 本次载入是不是读到一半整页刷新的:',
          reloadedMidPlay ? '是 —— 那就不是 SPA 重渲染，是真导航' : '否'
        );
        console.log('[autospeak] 导航类型:', (performance.getEntriesByType('navigation')[0] || {}).type);
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

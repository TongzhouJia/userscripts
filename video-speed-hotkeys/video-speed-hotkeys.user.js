// ==UserScript==
// @name         视频倍速快捷键
// @namespace    https://github.com/TongzhouJia/userscripts
// @version      1.0.0
// @description  Shift+1 恢复 1 倍速，Shift+2 双倍，Shift+3 三倍（三倍是播放器菜单里没有的）。Ctrl+Shift+A 开关，Ctrl+Shift+D 诊断。
// @author       tom
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/TongzhouJia/userscripts/main/video-speed-hotkeys/video-speed-hotkeys.user.js
// @downloadURL  https://raw.githubusercontent.com/TongzhouJia/userscripts/main/video-speed-hotkeys/video-speed-hotkeys.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ── 配置 ────────────────────────────────────────────────────────────
  // 数字键 → 倍速。想加 4 倍就写 Digit4: 4，菜单会跟着多一项。
  const RATES = { Digit1: 1, Digit2: 2, Digit3: 3 };

  const EXTRA_MENU_RATES = [3];   // 塞进 video.js 倍速菜单的自定义档位
  const REAPPLY_MS = 1500;        // 换清晰度/换源后多久内把倍速抢回来

  const LS_KEY = 'video-speed-hotkeys';
  let enabled = localStorage.getItem(LS_KEY) !== 'off';
  let wanted = null;              // 用户最后一次按出来的倍速

  // ── 找视频 ──────────────────────────────────────────────────────────
  // 页面上常有隐藏的预加载 video / 广告 video，挑「正在放的」或「最大的那个」
  function findVideo() {
    const vids = [...document.querySelectorAll('video')].filter(
      (v) => v.offsetParent !== null || v.readyState > 0
    );
    if (!vids.length) return null;
    const playing = vids.filter((v) => !v.paused && !v.ended);
    const pool = playing.length ? playing : vids;
    return pool.sort(
      (a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight
    )[0];
  }

  // video.js 会把 player 实例挂在 <video> 的 player 属性上，
  // 走它的 API 才能让界面上那个「播放速度」按钮同步显示新倍速。
  // @grant none 时脚本跑在页面上下文里，window.videojs 直接可见。
  function playerOf(video) {
    if (!video) return null;
    if (video.player && typeof video.player.playbackRate === 'function') return video.player;
    const vjs = window.videojs;
    if (vjs && video.id) {
      try {
        const p = vjs.getPlayer ? vjs.getPlayer(video.id) : vjs.players[video.id];
        if (p && typeof p.playbackRate === 'function') return p;
      } catch (e) { /* 没注册过这个 id，忽略 */ }
    }
    return null;
  }

  // 把自定义倍速加进菜单列表。video.js 只在列表里的档位才显示成「已选中」，
  // 不加也能变速，只是菜单上勾不到 3x。
  function extendMenu(player) {
    if (!player || typeof player.playbackRates !== 'function') return;
    try {
      const cur = player.playbackRates() || [];
      const merged = [...new Set([...cur, ...EXTRA_MENU_RATES])].sort((a, b) => a - b);
      if (merged.length !== cur.length) player.playbackRates(merged);
    } catch (e) { /* 老版本 video.js 没有这个 setter */ }
  }

  // ── 变速 ────────────────────────────────────────────────────────────
  function setRate(n) {
    const video = findVideo();
    if (!video) {
      toast('⚠️ 这个页面上没找到 video 元素');
      return false;
    }
    wanted = n;
    const player = playerOf(video);
    if (player) {
      extendMenu(player);
      try { player.playbackRate(n); } catch (e) { video.playbackRate = n; }
    } else {
      video.playbackRate = n;
    }
    // 有些播放器换源后会把倍速拍回 1，短时间内再抢一次
    const t0 = performance.now();
    (function hold() {
      if (wanted !== n || performance.now() - t0 > REAPPLY_MS) return;
      const v = findVideo();
      if (v && Math.abs(v.playbackRate - n) > 0.01) v.playbackRate = n;
      setTimeout(hold, 200);
    })();
    toast(`✅ ${n}x`);
    return true;
  }

  // ── 快捷键 ──────────────────────────────────────────────────────────
  // 用 e.code 不用 e.key：Shift+1 在美式键盘上 e.key 是 '!'，按布局还会变。
  function isTyping(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey && e.shiftKey) {
        const k = e.key.toLowerCase();
        if (k === 'a') {
          e.preventDefault();
          enabled = !enabled;
          localStorage.setItem(LS_KEY, enabled ? 'on' : 'off');
          toast(enabled ? '✅ 已开启' : '⏸️ 已关闭');
          return;
        }
        if (k === 'd') {
          e.preventDefault();
          diagnose();
          return;
        }
      }

      if (!enabled) return;
      if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      if (isTyping(e.target)) return;

      const rate = RATES[e.code];
      if (!rate) return;
      e.preventDefault();
      e.stopPropagation();          // 别让站点自己的数字键跳转进度
      if (!setRate(rate) && window.top === window) broadcast(rate);
    },
    true
  );

  // ── 播放器在 iframe 里的情况 ────────────────────────────────────────
  // 脚本在每个 frame 里各跑一份，但按键只会送到有焦点的那个 frame。
  // 顶层自己没视频时，把倍速指令广播给所有子 frame。
  function broadcast(rate) {
    for (const f of document.querySelectorAll('iframe')) {
      try { f.contentWindow.postMessage({ __vsh: true, rate }, '*'); } catch (e) { /* 跨域也能 post，忽略 */ }
    }
  }

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!enabled || !d || d.__vsh !== true || typeof d.rate !== 'number') return;
    if (!setRate(d.rate)) broadcast(d.rate);   // 自己也没有就继续往下传
  });

  // ── 诊断 ────────────────────────────────────────────────────────────
  function diagnose() {
    const vids = [...document.querySelectorAll('video')];
    console.log('[video-speed-hotkeys] frame:', location.href);
    console.log('[video-speed-hotkeys] window.videojs:', typeof window.videojs);
    console.log('[video-speed-hotkeys] 选中的 video:', findVideo());
    console.table(
      vids.map((v, i) => ({
        i,
        id: v.id,
        rate: v.playbackRate,
        paused: v.paused,
        size: `${v.clientWidth}x${v.clientHeight}`,
        vjsPlayer: !!playerOf(v),
        src: (v.currentSrc || v.src || '').slice(0, 60),
      }))
    );
    console.log('[video-speed-hotkeys] iframe 数量:', document.querySelectorAll('iframe').length);
    toast('🔍 已打印到控制台（F12）');
  }

  // ── 角落提示条 ──────────────────────────────────────────────────────
  let tipEl, tipTimer;
  function toast(msg) {
    if (!document.body) return;
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
    tipTimer = setTimeout(() => { tipEl.style.opacity = '0'; }, 1400);
  }
})();

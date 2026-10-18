// ==UserScript==
// @name         Gemini 一键切 Argon 高点
// @namespace    https://github.com/TongzhouJia/userscripts
// @version      1.0.0
// @description  gemini.google.com 上按 Ctrl+Shift+O：Gemini 自己照常开新对话，脚本等页面稳住后把模型切成 4 Argon、思考等级切成「高点」。切不动时按 Ctrl+Shift+D 把菜单结构存成文件给 Claude 看。
// @author       tom
// @match        https://gemini.google.com/*
// @grant        GM_info
// @run-at       document-idle
// @noframes
// @updateURL    https://raw.githubusercontent.com/TongzhouJia/userscripts/main/gemini-argon-hotkey/gemini-argon-hotkey.user.js
// @downloadURL  https://raw.githubusercontent.com/TongzhouJia/userscripts/main/gemini-argon-hotkey/gemini-argon-hotkey.user.js
// ==/UserScript==

// 带 @grant 是故意的：这样脚本跑在 Tampermonkey 的沙箱里，不受 Gemini 页面 CSP / Trusted Types 的管，
// DOM 和事件照样跟页面共用，这个脚本也用不着页面自己的全局变量。

(function () {
  'use strict';

  // ── 配置 ────────────────────────────────────────────────────────────
  const MODEL_RE = /Argon/i;                          // 菜单里要选的那个模型（「4 Argon / 复杂任务」）
  const LEVEL_MENU_RE = /思考等级|思考程度|thinking\s*level/i;  // 底下那个带小箭头的子菜单
  // 子菜单里要选的那一档（「高点 / 超级详尽」）。选中的那项前面可能带个 check 图标的字
  const isLevelItem = (t) => t.includes('高点') || /^(check\s*)?high\b/i.test(t);
  const isAnyLevel = (t) => /^(check\s*)?(低点|中等|高点|low|medium|high)/i.test(t);
  const LEVEL_WORD_RE = /高点|\bhigh\b/i;             // 选模型按钮上显示成「Argon 高点」就算切好了
  // 选模型那颗按钮上会出现的字，用来在一堆按钮里认出它
  const SWITCH_LABEL_RE = /Argon|Flash|Pro|Lite|Ultra|Deep\s*Think|思考|快速/i;
  const QUIET_MS = 400;     // 按下快捷键后，页面连续这么久没动静才动手（Gemini 正在开新对话、换界面）
  const MAX_WAIT_MS = 3000; // 等页面安静最多等这么久，到点不管了直接切
  const STEP_MS = 3000;     // 每一步（菜单弹出、按钮上的字变过来）最多等这么久

  // ── 小工具 ──────────────────────────────────────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => !!el && el.isConnected && el.getClientRects().length > 0;

  // 轮询到 cond() 返回真值为止，返回那个值；超时返回 null
  async function waitFor(cond, timeout = STEP_MS) {
    const t0 = performance.now();
    for (;;) {
      const v = cond();
      if (v) return v;
      if (performance.now() - t0 > timeout) return null;
      await sleep(50);
    }
  }

  // ── 定位 ────────────────────────────────────────────────────────────
  // 选模型那颗按钮：输入框旁边、上面写着「Argon 高点」「3.8 Flash」这种字、点了弹菜单的
  function findSwitch() {
    // 菜单开着的时候里面的项也是按钮（「思考等级」也带小箭头），一律不算
    const btns = [...document.querySelectorAll('button, [role="button"]')]
      .filter((b) => visible(b) && !b.closest('[role="menu"], [role="listbox"], .cdk-overlay-container'));
    const inSideNav = (b) => b.closest('nav, side-navigation-v2, bard-sidenav, mat-sidenav');
    return (
      btns.find((b) => /mode.*menu|model.*(menu|picker|switch)/i.test(b.getAttribute('data-test-id') || '')) ||
      btns.find((b) => b.closest('bard-mode-switcher')) ||
      btns.find((b) => b.getAttribute('aria-haspopup') && !inSideNav(b) && SWITCH_LABEL_RE.test(b.textContent)) ||
      btns.find((b) => !inSideNav(b) && SWITCH_LABEL_RE.test(b.textContent) &&
        b.getBoundingClientRect().top > innerHeight * 0.3 && norm(b.textContent).length < 30) ||
      null
    );
  }

  // 按钮上的字，去掉图标：Material 的图标是字体连字，textContent 里会混进「keyboard_arrow_down」这种
  function switchText() {
    const sw = findSwitch();
    if (!sw) return '';
    const c = sw.cloneNode(true);
    c.querySelectorAll('mat-icon, .material-icons, .material-symbols-outlined, .google-symbols, [class*="icon"]').forEach((i) => i.remove());
    return norm(c.textContent);
  }
  const done = () => MODEL_RE.test(switchText()) && LEVEL_WORD_RE.test(switchText());

  // 弹出来的菜单（主菜单、子菜单），按出现的先后排
  const menus = () => [...document.querySelectorAll('[role="menu"], [role="listbox"]')].filter(visible);

  function itemsOf(menu) {
    const items = [...menu.querySelectorAll('[role^="menuitem"], [role="option"]')];
    return (items.length ? items : [...menu.querySelectorAll('button')]).filter(visible);
  }

  const findItem = (menu, test) => (menu ? itemsOf(menu).find((it) => test(norm(it.textContent))) : null);

  function fullClick(el) {
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      el.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, { bubbles: true, cancelable: true, view: window }));
    }
    el.click();
  }

  // 点开主菜单。先只发一个 click（菜单按钮是开关型的，多发一轮指针事件等于点两下）；没弹出来再补整套指针事件
  async function openMenu() {
    const already = menus().find((m) => findItem(m, (t) => MODEL_RE.test(t) || LEVEL_MENU_RE.test(t)));
    if (already) return already;
    const sw = findSwitch();
    if (!sw) return null;
    sw.click();
    const hasModels = () => menus().find((m) => findItem(m, (t) => MODEL_RE.test(t) || LEVEL_MENU_RE.test(t)));
    return (await waitFor(hasModels, 1200)) || (fullClick(sw), await waitFor(hasModels));
  }

  // 点开「思考等级」子菜单：点击、悬停、键盘右箭头，哪个灵用哪个
  async function openLevelMenu(menu) {
    const trigger = findItem(menu, (t) => LEVEL_MENU_RE.test(t));
    if (!trigger) return null;
    const hasLevels = () => menus().find((m) => m !== menu && findItem(m, isAnyLevel));
    trigger.click();
    let sub = await waitFor(hasLevels, 800);
    if (!sub) {
      for (const type of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'mousemove']) {
        trigger.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, { bubbles: type !== 'mouseenter' && type !== 'pointerenter', view: window }));
      }
      sub = await waitFor(hasLevels, 800);
    }
    if (!sub) {
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
      sub = await waitFor(hasLevels, 800);
    }
    return sub;
  }

  function closeMenus() {
    for (let i = 0; i < 3 && menus().length; i++) {
      const target = document.activeElement || document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
    }
    document.querySelector('.cdk-overlay-backdrop')?.click();
  }

  // 切完把光标放回输入框：多半是刚开的新对话，他接着就要打字
  function focusInput() {
    const box = document.querySelector('rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"][role="textbox"], textarea');
    if (visible(box)) box.focus();
  }

  // ── 切模型 ──────────────────────────────────────────────────────────
  let busy = false;

  async function switchModel() {
    if (busy) return;
    busy = true;
    try {
      if (!(await waitFor(findSwitch))) return toast('没找到选模型的按钮。按 Ctrl+Shift+D 存一份页面结构给 Claude');
      if (done()) return toast(`已经是 ${switchText()} 了`);

      // 第一步：模型换成 Argon（已经是就跳过）
      if (!MODEL_RE.test(switchText())) {
        const menu = await openMenu();
        if (!menu) return toast('选模型的菜单没弹出来。按 Ctrl+Shift+D 存一份页面结构给 Claude');
        const item = findItem(menu, (t) => MODEL_RE.test(t));
        if (!item) {
          closeMenus();
          return toast('菜单里没有 Argon。按 Ctrl+Shift+D 存一份页面结构给 Claude');
        }
        item.click();
        if (!(await waitFor(() => MODEL_RE.test(switchText())))) {
          closeMenus();
          return toast('点了 Argon，按钮上的字没变过来');
        }
        await waitFor(() => !menus().length, 600);   // 菜单要是收了，等收起的动画走完再开下一次；没收就等满 0.6 秒接着用
      }

      // 第二步：思考等级换成高点（选完 Argon 菜单可能还开着，也可能收了，收了就再点开）
      if (!LEVEL_WORD_RE.test(switchText())) {
        const menu = await openMenu();
        const sub = menu && (await openLevelMenu(menu));
        const high = findItem(sub, isLevelItem);
        if (!high) {
          closeMenus();
          return toast(`模型是 ${switchText()}，思考等级没切成。按 Ctrl+Shift+D 存一份页面结构给 Claude`);
        }
        high.click();
      }

      if (await waitFor(done)) {
        if (menus().length) closeMenus();
        focusInput();
        toast(`已切到 ${switchText()}`);
      } else {
        toast(`点完了，可按钮上是「${switchText()}」，看一眼`);
      }
    } finally {
      busy = false;
    }
  }

  // ── 快捷键 ──────────────────────────────────────────────────────────
  const isHotkey = (e) => (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyO';
  let pending = 0;

  // Ctrl+Shift+O 是 Gemini 自己「开新对话」的键，这里不拦它：等新对话开好、页面安静下来再切模型
  // （新对话会把模型换回默认的，这正是要切的时候）
  function scheduleSwitch() {
    clearTimeout(pending);
    const t0 = performance.now();
    let last = t0;
    const mo = new MutationObserver(() => { last = performance.now(); });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    const tick = () => {
      const now = performance.now();
      if ((now - t0 > QUIET_MS && now - last > QUIET_MS) || now - t0 > MAX_WAIT_MS) {
        mo.disconnect();
        switchModel();
      } else {
        pending = setTimeout(tick, 100);
      }
    };
    pending = setTimeout(tick, 100);
  }

  // 捕获阶段只记下这一下，不吃掉事件
  window.addEventListener('keydown', (e) => {
    if (isHotkey(e) && !e.repeat) scheduleSwitch();
  }, true);

  // 冒泡阶段（Gemini 自己的处理都跑完了）：它没接这个键的话，替它 preventDefault，
  // 免得浏览器把 Ctrl+Shift+O 当成「打开书签管理器」开个新标签页
  window.addEventListener('keydown', (e) => {
    if (isHotkey(e) && !e.defaultPrevented) e.preventDefault();
  }, false);

  // Ctrl+Shift+D：诊断。把选模型按钮、两层菜单的 HTML 存成文件（下载文件夹），切不动的时候发给 Claude
  window.addEventListener('keydown', async (e) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || e.code !== 'KeyD') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    toast('正在抓菜单结构…');
    const out = [`# ${GM_info.script.name} ${GM_info.script.version} 诊断  ${new Date().toLocaleString()}`, `# ${location.href}`, ''];
    const sw = findSwitch();
    out.push('## 认出来的选模型按钮', sw ? sw.outerHTML : '（没认出来）', '');
    out.push('## 输入框附近的按钮');
    for (const b of document.querySelectorAll('button, [role="button"]')) {
      if (!visible(b) || b.closest('nav, side-navigation-v2, bard-sidenav, mat-sidenav') ||
          b.getBoundingClientRect().top < innerHeight * 0.3) continue;
      const attrs = [...b.attributes].filter((a) => /^(data-|aria-|role|mattooltip|jsname|class)/i.test(a.name))
        .map((a) => `${a.name}="${a.value.slice(0, 80)}"`).join(' ');
      out.push(`<${b.tagName.toLowerCase()} ${attrs}> ${norm(b.textContent).slice(0, 40)}`);
    }
    out.push('');
    const menu = await openMenu();
    out.push('## 主菜单', menu ? menu.outerHTML : '（没弹出来）', '');
    const sub = menu && (await openLevelMenu(menu));
    out.push('## 思考等级子菜单', sub ? sub.outerHTML : '（没弹出来）', '');
    out.push('## 弹层容器', document.querySelector('.cdk-overlay-container')?.outerHTML || '（没有 .cdk-overlay-container）');
    closeMenus();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/plain' }));
    a.download = `gemini-model-menu-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('存到下载文件夹了（gemini-model-menu-….txt），跟 Claude 说一声就行');
  }, true);

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
    tipTimer = setTimeout(() => { tipEl.style.opacity = '0'; }, 3000);
  }
})();

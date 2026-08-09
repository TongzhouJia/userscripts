# YouTube Music 关标签页别拦我

作用域：`https://music.youtube.com/*`

## 🎯 干什么

YouTube Music 网页版按 `Ctrl+W` 关标签页时，Chrome 会弹一个
「Leave site? / Changes you made may not be saved.」的确认框，得再点一次 Leave 才关得掉。
这个脚本把弹框的来源掐了，`Ctrl+W` 一下就关。

只影响 `music.youtube.com`，别的网站（正在填的表单之类）该拦还是拦。

## 🔧 原理

弹框只有两种触发方式，脚本在 `@run-at document-start` 时把两条路都堵上：

1. `addEventListener('beforeunload', ...)` —— 换掉 `EventTarget.prototype.addEventListener`，
   遇到 `beforeunload` 直接不注册。
2. `window.onbeforeunload = fn` —— 用 `defineProperty` 接管这个属性，
   页面赋的值存起来、读回去还是原样（免得它自己的逻辑读到 `null` 出错），
   但浏览器内部的 handler 槽位始终是空的。

⚠️ **`@run-at` 必须是 `document-start`**，改成 `document-idle` 就晚了 —— YTM 早就注册完了，拦了个寂寞。

## ⌨️ 快捷键

| 按键 | 作用 |
|---|---|
| `Ctrl+Shift+A` | 开关拦截（状态存 `localStorage` 的 `ytm-no-leave-prompt`） |
| `Ctrl+Shift+D` | 控制台打印：拦了几次、都是从哪注册的 |

## ⚙️ 配置项

文件顶部：

- `BLOCKED_EVENTS` —— 默认只拦 `beforeunload`。要连 `unload` 一起拦就加进去
  （一般不用，`unload` 不弹框）。

## 🕳️ 已知坑

- **关掉拦截（`Ctrl+Shift+A` 切到 ⏸️）后要刷新页面才完全恢复。** 已经被拦掉的那次注册补不回来，
  只有刷新让 YTM 重新注册一遍才行。
- **弹框不是 YTM 的 DOM，是浏览器原生的**，所以没法用「找按钮点一下」的路子绕过 ——
  只能从源头不让它注册。
- 如果哪天 YTM 改版又开始弹了，按 `Ctrl+Shift+D` 看「已拦截次数」：
  - 次数是 0 → 说明它换了别的路子（比如往 iframe 里注册），把 `@noframes` 去掉试试；
  - 次数不是 0 但还弹 → 大概率是脚本注入晚了，检查 `@run-at` 有没有被改。

# gtasks-paste-autoconfirm

在 [Google Tasks](https://tasks.google.com/tasks/) 里粘贴多行文字批量生成任务时，会弹出「By pasting into your task list, you are about to create N tasks. Do you really want to continue?」的确认框。这个脚本检测到这个弹窗后自动点 OK，不用每次手动点。

## 🔧 安装

从 raw 链接装（别复制粘贴，否则收不到更新，而且粘贴装很容易掉字符导致脚本静默不跑）：

```
https://raw.githubusercontent.com/TongzhouJia/userscripts/main/gtasks-paste-autoconfirm/gtasks-paste-autoconfirm.user.js
```

## ⌨️ 快捷键

| 键 | 作用 |
|---|---|
| `Ctrl+Shift+A` | 开 / 关自动确认（状态存 localStorage，刷新后保留） |
| `Ctrl+Shift+D` | 把当前页面上的弹窗打印到控制台（F12） |

## 🧩 它认的是什么

Google Tasks 的确认框是标准 MDC（Material Design Components）dialog：

```html
<div role="dialog" aria-modal="true">
  <h2>Caution</h2>
  <div>By pasting into your task list, you are about to create 27 tasks. Do you really want to continue?</div>
  <button data-mdc-dialog-action="cancel">Cancel</button>
  <button data-mdc-dialog-action="ok" data-mdc-dialog-initial-focus>OK</button>
</div>
```

`data-mdc-dialog-action="ok"` 是脚本用来定位按钮的依据，不用外层那些 `uW2Fw-*`/`mUIrbf-*` 一类哈希 class —— 那些是构建时生成的，Google 一改版就变。

## ⚠️ 已知坑 / 设计取舍

1. **不是见到 `role="dialog"` 就点。** Google Tasks 里删除清单、删除任务大概率也是同一套 MDC 组件，同样会有 `data-mdc-dialog-action="ok"` 的按钮。脚本额外检查弹窗文字必须匹配「粘贴……创建……个任务」（中英文都兼容），只对这一种弹窗动手，别的确认框原样弹出来等你手动点。
2. **靠 `MutationObserver` 而不是 `paste` 事件。** 弹窗是粘贴内容处理完之后才异步插进 DOM 的，`paste` 事件触发时它还不存在，只能盯 DOM 变化。
3. 只在 `tasks.google.com/tasks/*` 生效，不影响其他 Google 产品里长得像的弹窗。

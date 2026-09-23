# gdocs-f2-rename-tab

在 Google 文档（docs.google.com/document）里按 `F2`，自动点当前标签页（Tab）旁边的「⋮」→「Rename」，直接进入改名。

## 🔧 安装

```
https://raw.githubusercontent.com/TongzhouJia/userscripts/main/gdocs-f2-rename-tab/gdocs-f2-rename-tab.user.js
```

## ⌨️ 快捷键

| 键 | 作用 |
|---|---|
| `F2` | 重命名当前标签页 |
| `Ctrl+Shift+A` | 开 / 关 |
| `Ctrl+Shift+D` | 把找到的 ⋮ 按钮和「哪个算当前标签」打印到控制台 |

## ⚠️ 已知坑 / 设计取舍

1. **正文里的按键进的是 iframe。** Docs 的输入框是 `.docs-texteventtarget-iframe` 里的隐藏元素，keydown 不冒泡到顶层 document，脚本两边都挂监听。
2. **Closure 的 `goog-button` 不认 `click()`**，要发 `mousedown`+`mouseup`；没打开菜单才补一次 click，免得开了又关。
3. **当前标签的判定**：从每个 ⋮ 按钮往上爬，在只含这一个 ⋮ 的范围内找 `aria-selected="true"` 或带 `selected` 的 class。标签栏收起时按钮不存在，会提示。

# jisho-paste-search

在 [jisho.org](https://jisho.org) 的搜索框里粘贴内容后，自动发起搜索，不用再点放大镜或按回车。

## 🔧 安装

从 raw 链接装（别复制粘贴，否则收不到更新）：

```
https://raw.githubusercontent.com/TongzhouJia/userscripts/main/jisho-paste-search/jisho-paste-search.user.js
```

## ⌨️ 快捷键

| 键 | 作用 |
|---|---|
| `Ctrl+Shift+A` | 开 / 关粘贴自动搜索（状态存 localStorage，刷新后保留） |
| `Ctrl+Shift+D` | 把输入框、表单、提交按钮打印到控制台（F12） |

## ⚙️ 配置项

都在文件顶部：

| 常量 | 默认 | 说明 |
|---|---|---|
| `SETTLE_MS` | `120` | 文字落进输入框后再静置多久才提交。觉得偶尔搜到半截内容就往上调（比如 400）。 |
| `TIMEOUT_MS` | `3000` | 等文字到位的上限，超时就放弃。 |
| `TRIM_LINES` | `true` | 多行粘贴时只取第一行非空内容。想原样搜就改成 `false`。 |

## 🧩 它认的是什么

jisho 的 DOM（2026-08 实测）：

```html
<form class="search" id="search" action="/search" accept-charset="UTF-8" method="get">
  <button type="submit" class="submit icon" tabindex="2">
    <svg class="icon search-icon">…</svg>
  </button>
  <input class="keyword japanese_gothic" name="keyword" id="keyword">
</form>
```

`#keyword` 和 `form#search` 都很稳，脚本优先用它俩，class 只当兜底。

## ⚠️ 已知坑

1. **粘贴事件比 value 早。** `paste` 触发时浏览器还没把文字写进 input，当场读 `input.value` 拿到的是上一次的内容。脚本靠轮询「刚粘的内容出现在框里」来判断到位，不是死等固定延时。
2. **提交用 `form.requestSubmit()`，不是 `form.submit()`。** 后者不触发 `submit` 事件，页面自己挂的处理逻辑（自动补全收起等）会被跳过。兜底顺序是 `requestSubmit()` → 点提交按钮 → `form.submit()`。
3. **只对搜索框生效。** 粘到页面其它输入框（登录邮箱之类）不会误触发。
4. 手写 / 部首 / 语音那三个输入面板走的不是 paste 事件，不受影响。

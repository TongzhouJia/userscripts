# userscripts

我自己用的油猴（Tampermonkey）脚本合集。一个脚本一个目录，互不干扰。

## 📦 脚本列表

| 脚本 | 作用域 | 干什么 |
|---|---|---|
| [google-translate-autospeak](./google-translate-autospeak/) | `translate.google.com` | 粘贴文字后自动点「听取原文」朗读 |

## 🔧 安装

装了 [Tampermonkey](https://www.tampermonkey.net/) 之后，任选一种：

- 打开 `*.user.js` 的 raw 链接，浏览器会弹安装页
- 或者把文件拖进浏览器窗口
- 或者 Tampermonkey 面板 → 新建脚本 → 全选粘贴

改完脚本要重新粘一遍（本地文件和浏览器里那份不是同一份）。

## 🧱 新增脚本的房规

从 [`_template/template.user.js`](./_template/template.user.js) 复制一份开工，它已经带好了下面几个 helper。

- **目录结构**：`<script-name>/<script-name>.user.js` + 同目录一个 `README.md`（写清楚快捷键、配置项、已知坑）。
- **元数据**：`@name` 用中文，`@version` 走语义化版本，能不用 `@grant` 就写 `none`（不需要 GM API 时性能更好），`@run-at document-idle`，单页应用加 `@noframes`。
- **面向用户的文字一律中文 + emoji 状态标记**：🔊 进行中、✅ 成功、⚠️ 警告、❌ 失败、⏸️ 已暂停。统一用 `toast()` 打在右下角，不要用 `alert()`。
- **配置项提到文件顶部**当常量（`SETTLE_MS` 这种），并在 README 里说明「觉得不对就改这个数」。开关状态存 `localStorage`。
- **快捷键约定**：`Ctrl+Shift+A` 开关主功能，`Ctrl+Shift+D` 打印诊断信息到控制台。事件监听一律用捕获阶段（`addEventListener(..., true)`），否则会被页面自己的 handler 吃掉。

### ⚠️ 跟 Google 系页面打交道的血泪教训

这几条是写 google-translate-autospeak 时踩出来的，下次直接抄：

1. **绝对不要用 `VfPpkd-*` 这类 class 选元素。** 那是 Material 组件的内部结构（`VfPpkd-Bz112c-RLmnJb` 就是水波纹遮罩层），页面上每个按钮都有一个，认不出是哪个。
2. **优先用 `jsname` 属性。** Google 自己的代码靠它定位，比 class 稳得多。其次是 `data-*`、`aria-label`。
3. **`aria-label` 跟界面语言走，还容易误伤。** 匹配「语音」会把麦克风按钮「语音翻译」抓走。要么写多语言正则并避开近义词，要么优先读 `data-aria-label-off` 这种不随状态变的属性。
4. **选择器写成多层兜底**，任一命中即可 —— Google 改版时至少还有下一层顶着。
5. **别信 `disabled`。** 有些按钮输入框空着也是 `disabled: false`，拿它判断「就绪」是假的。
6. **别用固定延时等页面更新，等内容本身。** 轮询到目标文字真的出现在 DOM 里再动手，比 `setTimeout(1000)` 又快又稳。
7. **切换型按钮（播放/停止）只能点一次。** 补发一轮指针事件 = 点两下 = 刚开始就被停掉。合成 `click()` 会冒泡到 Google 的 jsaction 委托，够用了。

## 📄 License

MIT

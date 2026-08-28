# 视频倍速快捷键

给任意网页视频加倍速快捷键，**包括播放器菜单里根本没有的 3 倍速**。

## ⌨️ 快捷键

| 键 | 作用 |
|---|---|
| `Shift + 1` | 恢复正常速度（1x） |
| `Shift + 2` | 2 倍速 |
| `Shift + 3` | 3 倍速 |
| `Ctrl + Shift + A` | 开关脚本 |
| `Ctrl + Shift + D` | 打印诊断信息到控制台 |

在输入框 / 文本域 / 可编辑区域里打字时不触发。

## ⚙️ 配置项（脚本顶部）

- `RATES` —— 数字键到倍速的映射。想加 4 倍速就补一行 `Digit4: 4`。
- `EXTRA_MENU_RATES` —— 往 video.js 的「播放速度」菜单里塞的自定义档位，默认 `[3]`。
- `REAPPLY_MS` —— 换清晰度 / 换源之后，多长时间内把倍速抢回来，默认 1500ms。

## 🧠 它怎么干活的

1. 页面上常有隐藏的预加载 video 和广告 video，所以先挑**正在播放**的，没有再挑**面积最大**的。
2. 如果是 video.js 播放器（`<video>` 上挂着 `player`，或 `window.videojs` 认得它的 id），走 `player.playbackRate()`
   —— 这样界面上那个「播放速度」按钮会跟着显示新倍速。同时把 3x 加进 `playbackRates()` 列表，菜单里才勾得到。
   不是 video.js 就直接写 `video.playbackRate`，一样生效。
3. 播放器在 iframe 里的时候，按键只会送到有焦点的那个 frame。所以脚本在每个 frame 各跑一份，
   顶层自己没视频就 `postMessage` 广播给所有子 frame。

## ⚠️ 已知坑

- **千万别粘贴装。** 粘贴装出来的副本一旦缺个字符，Tampermonkey 注入时会报
  `Failed to execute 'appendChild' on 'Node': Invalid or unexpected token`，紧接着一句
  `injected: env: missing script "<uuid>"` —— 脚本压根没跑，表现就是「按键完全没反应」。
  从 raw 链接装，或者本地 `python3 -m http.server` 起一个端口从 `http://127.0.0.1:<端口>/...` 装。
- **本脚本用 `@grant unsafeWindow` 而不是 `none`。** 51cto 的 `videojs` 是页面全局，
  带 `@grant` 时脚本跑在沙箱里，普通 `window` 看不见它，必须走 `unsafeWindow`（脚本顶部的 `W`）。
  顺带的好处：带 `@grant` 的注入方式不走「内联 `<script>` + appendChild」那条路。

- **必须用 `e.code` 不能用 `e.key`。** `Shift+1` 在美式键盘上 `e.key` 是 `'!'`，换个布局又变别的，只有 `e.code === 'Digit1'` 是稳的。
- **换清晰度会把倍速拍回 1x。** 很多播放器切源时重建 video 元素。脚本按完键后 1.5 秒内会反复抢回来，
  但**手动换清晰度隔太久**就得重新按一次。
- **3x 不是所有源都撑得住。** 浏览器超过 4x 通常会静音（HTML5 规范允许实现在高倍速下不出声），3x 一般还有声。
- 监听全用捕获阶段并 `stopPropagation()`，否则会被站点自己的数字键快捷键（跳转到 10%/20% 进度）吃掉。

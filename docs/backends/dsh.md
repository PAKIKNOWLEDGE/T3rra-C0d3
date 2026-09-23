# 候选后端 C — dsh（`deepseek-harness`）+ 它的 Tauri 桌面壳

**身份**：`github.com/deepseek-ai/deepseek-harness`（下称 dsh）。
**232k star / 27.8k fork / MIT / `master` 分支 / 约 18,059 commits。**【文档】
桌面壳：`github.com/dsh-tauri/deepseek-harness-desktop`，**2.4k star / 161 fork。**【文档】

**一句话**：dsh 是 DeepSeek 官方的 agent harness，**"everything is a plugin"**，
建在 [Cordis](https://github.com/cordiverse/cordis) 上（有一篇配套论文）。【文档】

---

## 稳定性：仓库自己就说了会破

【文档】README 原文：

> *"DeepSeek Harness is in **developer preview** and iterating rapidly.
> **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**"*

桌面端 README 也重申：

> *"**开发预览** — 上游 `dsh` 仍在快速迭代，存在破坏性变更；本项目同步跟随。"*

这就是你说的"科研核弹试验场"。**它不是偶发破坏，是把破坏写进契约的。**

## 运行方式

【文档】`npx @deepseek-ai/dsh web` → 起 Web UI 在 `http://127.0.0.1:3080`，默认开浏览器。
桌面端首次运行会下载 Node 运行时 + Harness 内核（已装 `dsh` 则用安装版），
之后完全本地。**要求内核 `0.1.5-rc.2` 或更高。**

---

## 桌面壳的真实结构：它是个 iframe 套壳

【文档】官方架构图（简化）：

```
Tauri WebView (React)
  安装状态机 → 下载进度 → iframe
  加载 dsh Web 界面 + 侧边栏控制
        │ invoke 命令 + 事件
Tauri Rust 后端
  service/download   安装器 + 解压
  service/core       Harness 核心多版本管理
  service/profile    dsh 档案管理
  service/plugin     插件卸载 / 升级
  service/cli        dsh 命令 shim + PATH
  service/update     桌面端自更新
  service/workflow   dsh 进程生命周期
  task               dsh 健康检查
        │
runtime/ (Node.js v22.22.0)   dependencies/dsh/ (发行版)
        ▼
dsh --profile <档案> --host 127.0.0.1 --port 3080     (DSH_HOME=~/.dsh)
        ▼
http://127.0.0.1:3080/  ← 内嵌界面
```

**关键点：主聊天界面是 `iframe` 里的上游 dsh web UI，不是这个仓库的。**
这个仓库自己的价值在**壳**和**插件**：

内置插件（`packages/`）：`dsh-tauri`（与壳通信）、`dsh-tauri-connection`（跨源沙箱内嵌 WebView
的回环宿主，覆写两道鉴权闸门）、`dsh-tauri-model-config`、`dsh-tauri-ui`（自定义设置侧边栏）、
`dsh-tauri-worktree`、`dsh-tauri-panel-extension`、`dsh-tauri-panel-scheduler`、
`dsh-tauri-turnrewind`、`dsh-tauri-session`、`dsh-tauri-pet`、`dsh-tauri-rightclick` 等。【文档】

预设插件走社区：DSH Market、Better Sidebar、DSH Rewind、DSH-IM 等。

## 所以"换他的样式"意味着什么

- 你**不能**在这个仓库里改主界面——主界面在上游 dsh 里。
- 要改样式，只能：
  1. **fork dsh 本体**（一个 rc、天天破坏的巨型仓库），或
  2. **往 iframe 里注入 CSS**（脆弱，上游一改结构就崩），或
  3. 只在 `dsh-tauri-*` 那层加局部插件（改不了主聊天体验）。
- 无论哪条，你都在**把"omp 屎山"换成"dsh 屎山 + 天天 rebase"**。

## 顺带一条对 Tauri 判断有用的证据

【文档】桌面端 README 列了一堆 **Linux/WebKitGTK** 的坑：
AppImage 在 Wayland 下**黑屏/崩溃**、滚动发行版因随包 `libwayland-client` 与宿主 Mesa ABI
不匹配导致 `WebKitWebProcess` 直接 `abort()`（**双击后没有任何界面、也没有任何日志**），
并建议改用 `.deb` 或 `LD_PRELOAD=…` 兜底。

——这和 [`opencode.md`](./opencode.md) 里"Tauri/WebKit 在 Linux 上疼"是同一类问题，
**再次说明：Tauri 的坑集中在 macOS/Linux，不在 Windows/WebView2。**

## License：不是纯 MIT

【文档】MIT **附加 [非商用条款](https://github.com/dsh-tauri/deepseek-harness-desktop/blob/main/LICENSE.details)**
（`LICENSE.details`）。**如果要拿这个壳做任何带商业意图的东西，先读那份附加条款。**
（dsh 本体是纯 MIT。）

## 结论

三条路里**最差的一条**。后端持续破坏 + 界面不是自己的 + 许可证有附加条款。
只有在"我就是想立刻有个能跑的桌面 app、且不在乎上游天天变"时才有意义——
而这和"做一个符合我审美的、稳定的桌面 UI"是相反的目标。

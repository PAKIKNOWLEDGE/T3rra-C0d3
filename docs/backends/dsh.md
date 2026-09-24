# 候选后端 C — dsh + Tauri 桌面壳

**身份**：`github.com/deepseek-ai/deepseek-harness`（下称 dsh）。  
**232k star / 27.8k fork / MIT / `master` / 约 18,059 commits。**【文档】  
桌面壳：`github.com/dsh-tauri/deepseek-harness-desktop`，**2.4k star / 161 fork。**【文档】

**一句话**：dsh 是 DeepSeek 官方 agent harness，**"everything is a plugin"**，建在 [Cordis](https://github.com/cordiverse/cordis) 上。【文档】

---

## 稳定性：仓库自述会破坏兼容

【文档】README：

> *"DeepSeek Harness is in **developer preview** and iterating rapidly.  
> **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**"*

桌面端 README 同义重申。**破坏写进契约，不是偶发。**

## 运行方式

【文档】`npx @deepseek-ai/dsh web` → `http://127.0.0.1:3080`。  
桌面端首次运行下载 Node 运行时 + Harness 内核（已装则用安装版），之后完全本地。**要求内核 `0.1.5-rc.2+`。**

---

## 桌面壳结构：iframe 套壳

【文档】架构（简化）：

```
Tauri WebView (React)
  安装状态机 → 下载进度 → iframe
  加载 dsh Web 界面 + 侧边栏控制
        │ invoke 命令 + 事件
Tauri Rust 后端
  service/download | core | profile | plugin | cli | update | workflow
  task（健康检查）
        │
runtime/ (Node.js v22.22.0)   dependencies/dsh/
        ▼
dsh --profile <档案> --host 127.0.0.1 --port 3080    DSH_HOME=~/.dsh
        ▼
http://127.0.0.1:3080/  ← 内嵌界面
```

**关键点：主聊天界面是 iframe 里的上游 dsh web UI，不是本仓库的。**  
本仓库价值在壳与插件：`dsh-tauri`、`dsh-tauri-connection`、`dsh-tauri-model-config`、`dsh-tauri-ui`、`dsh-tauri-worktree`、`dsh-tauri-panel-extension`、`dsh-tauri-panel-scheduler`、`dsh-tauri-turnrewind`、`dsh-tauri-session`、`dsh-tauri-pet`、`dsh-tauri-rightclick` 等。【文档】  
社区：DSH Market、Better Sidebar、DSH Rewind 等。

## 「换样式」意味着什么

- **不能在本仓库改主界面**（主界面在上游）。
- 仅能：① fork dsh 本体（rc、天天破坏）；② 向 iframe 注入 CSS（上游改结构即崩）；③ 只在 `dsh-tauri-*` 局部插件加内容（改不到主聊天体验）。
- 任一路径都是把维护负担换成「更大仓库 + 频繁 rebase」。

## 对 Tauri 判断的补充证据

【文档】桌面端 README 列 Linux/WebKitGTK 问题：AppImage 在 Wayland 黑屏/崩溃、发行版因 `libwayland-client` 与 Mesa ABI 不匹配导致 `WebKitWebProcess` `abort()`（双击无界面无日志），建议 `.deb` 或 `LD_PRELOAD`。

与 `opencode.md` 同一结论：**Tauri 的坑集中在 macOS/Linux，不在 Windows/WebView2。**

## License

**MIT 附加[非商用条款](https://github.com/dsh-tauri/deepseek-harness-desktop/blob/main/LICENSE.details)**（`LICENSE.details`）。商用意图先读附加条款。  
（dsh 本体纯 MIT。）

## 结论

三条路中**优先级最低**：后端持续破坏 + 界面不是自己的 + 许可证有附加条款。  
仅当「立刻要一个能跑的桌面 app、不在乎上游天天变」时才有意义——与「稳定、符合自有审美的桌面 UI」目标相反。

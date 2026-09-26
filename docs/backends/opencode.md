# 候选后端 B — opencode

**身份**：`github.com/anomalyco/opencode`（原 `sst/opencode`）。  
**209k star / 27.5k fork / MIT / `dev` 分支 / 约 15,770 commits。**【文档】

**架构**：TypeScript client-server。TUI、web UI、desktop 均为 client；server 跑 agent loop、连 LLM、读写 SQLite。【文档】

---

## 三层接入面（窄 → 宽）

### 1）ACP —— 最接近现有代码

`opencode acp`，ACP **v1**，stdio 上换行分隔 JSON-RPC。  
为 ACP 进程起私有 OpenCode server；client 关 stdin 则退出。【文档】

暴露能力：

- session：**create / list / load / resume / fork / close / delete**【文档】
  ※ **2026-09-26 更正**：ACP 的 `sessionCapabilities` 里**没有 delete**，只有 close / fork / list / resume（审计 §4 最后一行）。删除要走 HTTP `DELETE`。
- load / fork **回放**已存消息
- **cancel** 进行中的 prompt（不关 session）
  ※ **2026-09-26 更正**：旧注「ACP 面无 `session/cancel`（-32601）」是实验方法错误，那次把它当 request 发了。它是 notification，端到端实测 53ms 可中断（审计 F1；`adapters/opencode-acp.md` §三）。
- 流式 text / reasoning / tool / permission / usage
- session options：模型与非 subagent agent 清单；会话中可改 **model / effort / mode**
- 广播 slash commands 与 skills【文档】

对照 t3rra 的 ACP：近似 omp 超集（permission 可用）。  
**映射表按 omp 报文编写，能否直吃 opencode 必须实测。**【未验 → 已实测，见 adapters】

### 2）HTTP server —— 比 ACP 宽

`opencode serve` 出 OpenAPI 3.1 + SSE。

- `GET /event`、`GET /global/event`：SSE 事件流
- v2 HTTP API：约 136 operation / 245 schema

v2 相关端点：

| 能力 | 端点 | 为什么重要 |
| --- | --- | --- |
| 事件流 | `GET /api/event` | 单一事实来源；**volatile**（慢消费者断流、断连丢事件） |
| 发消息 | `POST /api/session/{id}/prompt` | `files` 为本地附件 |
| 权限审批 | `/api/session/{id}/permission…/reply` | 补上 omp 死掉的 approval |
| 表单 | `/api/session/{id}/form` | 结构化提问 |
| diff | `GET /api/session/{id}/diff` | 每轮改了哪些文件 |
| 回滚 | `/revert/stage`、`/revert/commit` | 回合级回退 |
| todo | 消息类型中有 | 契约禁 task/plan 一等概念，接入前过溯源规则 |
| 文件 | `/api/fs/*` | 渲染层读文件 |
| 终端 | `/api/pty` + WebSocket | 真终端 |
| 插件 RPC | `POST /api/rpc/{rpcID}/{method}` | 扩展 |

**【文档】** v2 server API 为**故意破坏点**；`/api/event` 标明 volatile——对静默判断是真问题，需重连与补拉设计。

### 3）SDK

`@opencode-ai/sdk`（v1）/ `@opencode/client`（v2）。

---

## 图片：不走上传

【文档】v2 prompt：`{ text, files: PromptInput.FileAttachment[], … }`。图片为随 prompt 的本地附件。  
包列表无 omp 式 blob-broker / uploader / 图床子系统；配置仅 `media.image.auto_resize`（本地缩放）。

→ **omp「图片发布到第三方」的痛点在此后端不存在。**【文档】  
（未穷举全部代码，已核包列表与 prompt 契约。）

---

## 桌面端：结构类似，但放弃了 Tauri

【文档】

- SolidJS 前端，核心在 **`@opencode-ai/app`**（web/desktop 共用）；桌面为薄壳 + **sidecar**（打包 CLI 跑本地 server）。
- 壳**最初 Tauri 2，现已重写为 Electron**，Tauri 版将停发。

作者（Brendonovich）给出的理由：

1. **macOS / Linux 上 Tauri 用 WebKit**，性能与样式一致性差于 Chromium。
2. 跑 CLI 影响启动，且 **Windows 上偶发启动失败**。
3. 同步从 Bun 迁 Node，「server 跑在 Electron 自带 Node 进程」更合适。

自我澄清：*"不是说 Tauri/Electron 谁更好，只是 Electron 更契合他们的场景。"*

### 对 Tauri 决定的含义

- 旧仓 `AGENTS.md` 写 **Electron 完全不可接受**——与上游选择冲突，但：
  - **只在 Windows** → Tauri 用 **WebView2（Chromium）**，WebKit 坑不成立。
  - 「Rust 只做管道」正是 Tauri 合适用法。
  - 第 2 条（sidecar 启动）Windows 上真实：写 Tauri 时提前做「PATH → 已知位置 → 手填」回退。
- **结论：只出 Windows → Tauri 成立；将来 mac/Linux → 已知坑。**

---

## 版本与稳定性

- **v1 稳定线**：`v1.18.31`（2026-09-14 快照）。
- **v2 可用**，三处故意破坏：插件新 API；server API 与 clients 换契约；终端 client 配置 `tui.json(c)` → 单一 `cli.json`。
- 有正式迁移指南；已支持的 v1 行为应继续工作。
- **判断**：会破，但破在大版本、有 guide、有稳定线——好于 omp 日常破坏与 dsh 持续破坏。

## 生态

已有第三方客户端（如 `jazarie2/opencode-gui`、Paseo 等）。**「自建 opencode 前端」不是无人走过的路。**

## License

**MIT**。【文档】

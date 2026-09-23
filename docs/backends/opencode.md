# 候选后端 B — opencode

**身份**：`github.com/anomalyco/opencode`（原 `sst/opencode`）。
**209k star / 27.5k fork / MIT / `dev` 分支 / 约 15,770 commits。**【文档】

**一句话架构**：TypeScript 写到底的 **client-server**。TUI、web UI、desktop 都只是 client，
它们连一个 server，server 跑 agent loop、跟 LLM 通信、读写 SQLite。【文档】

---

## 三层接入面（从窄到宽）

### 1）ACP —— 最接近 t3rra-core 现有代码

`opencode acp`，ACP **v1**，stdio 上换行分隔的 JSON-RPC。
**它为一个 ACP 进程起一个私有的 OpenCode server**，不开 ACP 网络端口，
client 关 stdin 它就退出。【文档】

它对 client 暴露的能力：

- session 的 **create / list / load / resume / fork / close / delete**
- **load / fork 时回放**已存消息
- **cancel** 一个进行中的 prompt（不关 session）
- 流式 **text / reasoning / tool calls / permission requests / usage**
- **session options**：所有启用模型的清单、所有非 subagent 的 agent 清单；
  会话中可以改 **model / effort / mode**
- 向 client 广播 **available slash commands 与 skills**（`/compact` 走 compaction）【文档】

对照 t3rra-core 的 ACP 适配器：这**基本是 omp ACP 的超集**
（omp 的 `permissions = false`、`approval` 死掉，这里 permission 是有的）。
**但你现有的映射表是照 omp 报文写的，能不能直接吃 opencode 必须实测，不许猜。**【未验】

### 2）HTTP server —— 比 ACP 宽得多

`opencode serve` 出 **OpenAPI 3.1 + SSE**。
t3rra-core 的传输层（`src/agent/sources/pipe.ts`：fetch + EventSource）形状对得上。【文档】

- `GET /event`、`GET /global/event`：**SSE 事件流**
- v2 的 HTTP API：**136 个 operation / 245 个 schema**（`/api/…`）

v2 API 里对 t3rra-core 特别相关的：

| 能力 | 端点 | 为什么重要 |
| --- | --- | --- |
| 事件流 | `GET /api/event` | 单一事实来源；**契约里注明 volatile**（慢消费者会断流、断连期间事件丢失） |
| 发消息 | `POST /api/session/{id}/prompt` | body 里 `files: PromptInput.FileAttachment[]` —— **图片是本地附件** |
| 权限审批 | `GET/POST /api/session/{id}/permission…/reply` | **补上 omp 那个死掉的 `approval` 裁决** |
| 表单 / elicitation | `/api/session/{id}/form`（list/get/reply/cancel） | 需要人介入的结构化提问 |
| diff | `GET /api/session/{id}/diff` | 每轮改了哪些文件 |
| 回滚 | `/revert/stage`、`/revert/commit` | 回合级回退 |
| todo | `/api/session/{id}/…`（消息类型里有） | 注意：t3rra-core 契约**禁止**把 task/plan 当一等概念，要不要接要先过溯源规则 |
| 文件 | `GET /api/fs/read/*`、`/api/fs/list` | 渲染层要读文件时 |
| 终端 | `/api/pty` + WebSocket | 真终端 |
| 插件 RPC | `POST /api/rpc/{rpcID}/{method}` | 扩展 |

**【文档】**：v2 的 server API 是**故意的破坏点**（见下），且 `/api/event` 明确标注
"volatile by contract"——**慢消费者会溢出错流**。这对 t3rra-core 的静默判断是个真问题，
需要设计重连与补拉策略。

### 3）SDK

`@opencode-ai/sdk`（v1）/ `@opencode/client`（v2）。可以少手写 HTTP。

---

## 图片：不走上传

【文档】v2 的 prompt 请求体是
`{ text, files: PromptInput.FileAttachment[], agents, skills, metadata, delivery, resume }`。
图片是**随 prompt 一起交的本地附件**。

opencode 的包列表里**没有** omp 那种 `blob-broker` / uploader / 图床子系统。
v2 配置里图片相关的是 `media.image.auto_resize`（**本地缩放**，不是上传）。

→ **你在 omp 上遇到的"图片要发布到第三方"的痛点，在这个后端上不存在。**【文档】
（保留：我没穷举它的全部代码，只核了包列表与 prompt 契约。）

---

## 桌面端：和你想要的几乎一样，但它放弃了 Tauri

**【文档】** 桌面端结构：

- **SolidJS** 前端，核心在共享包 **`@opencode-ai/app`**（web 和 desktop 共用），
  桌面壳是一层**薄封装**，还带一个 **sidecar**（打包的 CLI，负责跑本地 server）。
- 壳**最初是 Tauri 2**，**现已重写为 Electron**，Tauri 版即将停发。

官方作者（Brendonovich）给的理由，逐条：

1. **Tauri 在 macOS / Linux 上用 WebKit**，渲染性能比 Chromium 差，
   且**样式上有细微不一致**，直接伤害"跨平台体验一致"这个目标。
2. **跑 CLI** 影响启动时间，且**在 Windows 上偶发启动失败**。
3. 叠加他们想从 **Bun 迁到 Node**，于是"让 server 直接跑在 Electron 自带的 Node 进程里"
   变得很香。

他们的自我澄清也很关键：*"这不是说 Tauri/Electron 谁更好更快，只是 Electron 更契合我们的场景"*，
并且 Tauri 版**保留期间**两者并存。

### 对 t3rra-core 的 Tauri 决定的含义

- t3rra-core 的 `AGENTS.md` §六写着 **"Electron 完全不可接受"**。这条与上面的证据冲突，
  但**冲突没有想象中大**：
  - 你**只在 Windows** 上跑 → Tauri 用 **WebView2（Chromium 内核）**，
    他们踩的 WebKit 坑**对你不成立**。
  - t3rra-core 已定 **"Rust 只做受监管的管道，不认识事件词汇"**，
    这正是 Tauri 最合适的用法（不把逻辑塞进 Rust）。
  - 他们的第 1 条理由在 **macOS / Linux**；第 2 条（sidecar 启动）是 Windows 上的真坑，
    值得你在写 Tauri 外壳时**提前设计"引擎探 PATH → 已知位置 → 手填"的回退**
    （t3rra-core 的 `NOTES.md` 已经踩到并写明了）。
- **结论**：**若只出 Windows，Tauri 决定成立；若将来要出 mac/Linux 包，这就是已知坑。**

---

## 版本与稳定性

- **v1 稳定线**：`v1.18.31`（2026-09-14 时点）。
- **v2 已可用**，含**三处故意的破坏性变更**：
  1. **插件**用新 API（V1 插件实现**不能**在 V2 跑）；
  2. **server API 与 clients 换新契约**（绑 HTTP API 的集成必须迁移）；
  3. **终端 client 配置**从分层 `tui.json(c)` 改为单一 `cli.json`（自动迁移）。
- 有**正式迁移指南**，且"已支持的 V1 行为应继续工作，坏了算兼容性 bug"。
- **判断**：它也会破，但**破在大版本上、有 guide、有稳定线**——
  这跟 omp 的日常破坏、和 dsh 的"持续破坏"是两个量级。

## 生态：自定义 UI 是**已被证明**的模式

【文档】已有多个基于 opencode API 的第三方客户端/桌面端
（如 `jazarie2/opencode-gui`、`Paseo` 等）。**"给 opencode 做自己的前端"不是没人走过的路。**

## License

**MIT**。【文档】

> **【归档 2026-09-26】** 2026-09-21 的快照（omp 时代）。现行状态见 [`docs/status.md`](../status.md)。

# 现状（2026-09-21 快照）

> **代际: core-era ｜ 状态: 仅历史 ｜ 取代: [`status.md`](./status-2026-09-26.md) @ 2026-09-23**
>
> 本文件不是当前状态。现行状态看 [`status.md`](./status-2026-09-26.md)。  
> 仍有效：§4 规则摘录（除 13–18 视觉，已被 [`design-contract.md`](./design-contract.md) 取代）、§6 omp 实测基线（历史对照）。  
> 已过时：§1「workspace 是空的」、§3「绑死 omp」、§5「引擎=omp 已定」。  
> 2026-09-23 起：本工作区即工程本体，引擎依据 [`adapters/opencode-acp.md`](../adapters/opencode-acp.md)。

## 1. 建成时这里是空的，工程在 t3rra-core（当时的说法）

`C:\DEV\develop\t3rra-C0d3` 建成时为空——**「从零开始」这个感觉是错的**。  
真正的实现在 `C:\DEV\develop\NIX\t3rra-core`（2026-09-23 起为上一代，只读参考）：

| 已完成 | 证据 |
| --- | --- |
| 界面（field console：左 rail + stage + dossier + step + dock） | `index.html` / `src/ui/{console,raw,dock}.ts` |
| 事件契约、纯折叠状态机、派生视图 | `src/agent/events.ts` / `state.ts` / `view/derive.ts` |
| ACP 适配器 + 脚本数据源 | `src/agent/sources/acp.ts` / `fake.ts` |
| dev 期子进程桥 | `plugins/omp-bridge.ts` |
| 真机往返 + 会话恢复 | `npm run check:live` |

**当时可证**（`NOTES.md` §十二，2026-09-21）：typecheck 干净 · 69 单测 · 41/41 DOM id · 19/19 静态检查 · 生产构建通过 · 断流 26 秒重连恢复。`git init` 基线 `16681ae`。

**渲染只能目视验收**——禁用无头浏览器（`AGENTS.md` §验证 19–21）。

## 2. 定位（t3rra-core 自述）

> **Workbench 是一个优秀 agent runtime 的桌面 frontend。**  
> 引擎可换，界面不可换。

| 归属 | 负责 |
| --- | --- |
| runtime | agent loop、memory、工具、workflow、多 agent、会话存储 |
| T3rra | 事件展示、状态理解、交互体验 |
| 之间 | 只有事件流 |

## 3. 绑死 omp 的部分（换引擎的成本边界）

- `src/agent/sources/acp.ts` — ACP 适配器（渲染层）
- `docs/adapters/acp.md` — 逐行映射与有损列（照 omp 报文）
- `traces/*.jsonl` — 真机报文、单测 fixture

架构承诺：**换引擎 = 再写一份 `AgentSource`，界面不动。**

## 4. 不可协商的规则（换后端时勿丢失）

摘自 `t3rra-core/AGENTS.md` §二，影响选型的条目：

1. **渲染层只读 `DerivedView`**，不读 `SessionState`。
2. **溯源**：每项可追到 `AgentEvent` 或时钟；派生块声明 `from: string[]`，并集覆盖日志全部 kind（机读）。
3. **事件流唯一事实来源**，单向。
4. **契约只一份、在 TS**。外壳只搬字节，不认事件词汇。
5. **task / plan / memory / workflow / multi-agent 不是 runtime 概念**，不进契约。
6. **能力声明描述传输形状**，不是已生效开关。
7. **不许用绝对毫秒判断卡没卡**：相位中位数基线，`×8` slow、`×25` stalled，样本 &lt;3 拒绝给判据。
10–12. 文案为工业控制状态报告；缺失显示 `NOT STATED` / `NOT REPORTED` / `NOT ESTABLISHED`，**宁可 absence，不许造合理值**。
13–18.（**已取代，勿再引用**）视觉以 [`design-contract.md`](./design-contract.md) 为准：**ark · complex · 仅暗色**；旧 endfield 为反面（[`design-critique.md`](./design-critique.md)）。
19–21. **无头浏览器禁用**；不得声称看过渲染结果。

现行完整规则：[`rules-inherited.md`](./rules-inherited.md)。

## 5. 已定决策（旧仓口径；**引擎一行已于 2026-09-23 改**）

| 决定 | 结论 |
| --- | --- |
| 引擎 | ~~omp~~ → **opencode**（`opencode acp`，ACP v1），见 `adapters/opencode-acp.md` |
| 传输 | ACP over stdio，JSONL LF 分帧 |
| 外壳 | Tauri。**Electron 不可接受** |
| 外壳边界 | Rust 只做受监管管道，不认识事件词汇 |
| 目录名 / 品牌 | `t3rra-core` / `T3rra Protocol`（现行树为 `t3rra-C0d3`） |
| 打包引擎 | 不做。用户自装、自登录 |
| provider 层 | 不做。`configOptions` 由运行时给清单，只渲染 |
| 会话存储 | 归引擎。界面只渲 `session/list`，不自存对话 |
| 语域 | OPERATOR / EXPERT，协议词汇仅 EXPERT |

## 6. omp 实测基线（历史对照）

引擎 `omp 18.2.6`，`omp acp`，protocolVersion **1**。opencode 对应实测见 `adapters/opencode-acp.md`：

- 冷启动 **1.13s**（initialize 937ms + session/new 186ms）→ 启动即 spawn。
- 首 token **4.58s**（trivial、warm session）。
- `clientCapabilities: {}` 时它不回头要 fs/terminal/elicitation → 惰性前端不饿死 runtime，前提是不声明。
- `streamingArgs = false`；`tool_call` 到达时 `rawInput` 已完整。
- **`permissions = false`：approval 在 omp 上是死的**（不声明 elicitation → plan 审批自动批准）。
- `messageId` 稳定但思考与正文共用 → 块边界仍要推。
- `usage_update` = 上下文填充率；`PromptResponse.usage` = 本轮 token——两个量。
- `tool_call.kind` 不可信（列目录标成 `read`）→ 显示用 `title`。
- `authenticate` 空凭据也返回 `{}` → 不能当「能干活」。
- `configOptions` 交完整 model/mode/thinking 清单 → 代码无需 provider/model 表。
- `session/load` 可用（约 4s），历史以 `session/update` 回放，含 `user_message_chunk`。

**环境（当时）**：Rust 1.95.0、VS BuildTools 18、WebView2 152、Node 24。

## 7. 为什么要换后端

1. **图片会离开本机**：omp `blob-broker` 把图片发布成 URL（图床/云盘/隧道）。见 [`backends/omp.md`](../backends/omp.md)。
2. **维护成本**：约 146 万行 TS + 24 万行 Rust，Bazel+Cargo+bun+Python。
3. **ACP 面窄**：`permissions=false`、approval 死、plan 从不出现——界面能做的许多事 omp 不在事件里说。

「runtime 没说的界面不许知道也不许编」在 omp 上会变成产品天花板。opencode 接入面更宽（[`backends/opencode.md`](../backends/opencode.md)）。

# 现状

## 1. 这个 workspace 是空的，t3rra-core 不是

`C:\DEV\develop\t3rra-C0d3` 建成时为空——**"从零开始"这个感觉是错的**。

真正的东西在 `C:\DEV\develop\NIX\t3rra-core`。它不是原型，是一个已经跑通真引擎的成品界面：

| 已完成 | 证据 |
| --- | --- |
| 界面（field console：左 rail + stage + dossier + step 条 + command dock） | `index.html` / `src/ui/{console,raw,dock}.ts` |
| 事件契约、纯折叠状态机、派生视图 | `src/agent/events.ts` / `state.ts` / `view/derive.ts` |
| ACP 适配器（真引擎）+ 脚本数据源 | `src/agent/sources/acp.ts` / `fake.ts` |
| dev 期子进程桥（将来 Rust 外壳的排练） | `plugins/omp-bridge.ts` |
| 真机往返 + 真机会话恢复 | `npm run check:live` 通过 |

**当前可证**（来自 t3rra-core 的 `NOTES.md` §十二，2026-09-21）：
typecheck 干净 · **69 条单测** · 41/41 DOM id · 19/19 静态检查 · 生产构建通过 ·
断流 26 秒后重连恢复（对真桥）。已 `git init`，基线 `16681ae`。

**渲染永远只有人眼能验收**——t3rra-core 明令禁用无头浏览器验证
（`AGENTS.md` §验证 19–21），这条不要动。

## 2. 定位（t3rra-core 自己写的）

> **Workbench 是一个优秀 agent runtime 的桌面 frontend。**
> Endfield 风格的 omp 桌面客户端。**引擎是可换的，界面是不可换的。**

| 归属 | 负责 |
| --- | --- |
| runtime | agent loop、memory、工具执行、workflow、多 agent、会话存储 |
| T3rra | 事件展示、状态理解、交互体验 |
| 之间 | 只有一件事：**事件流** |

## 3. 把它绑死在 omp 上的东西（换引擎的成本就这些）

- `src/agent/sources/acp.ts` —— 一份 ACP 适配器，**跑在渲染层**。
- `docs/adapters/acp.md` —— 逐行映射表与**有损列**，是照着 omp 的真实报文写的。
- `traces/*.jsonl` —— 真机报文，单测 fixture。

架构上的承诺（`AGENTS.md` §四）：**"换引擎 = 再写一份 `AgentSource` 实现，界面不动。"**
所以换后端的边际成本 ≈ 一个文件 + 一份映射表验证。

## 4. 不可协商的规则（不要在换后端时把它们弄丢）

摘 `t3rra-core/AGENTS.md` §二，会影响后端选型的那几条：

1. **渲染层只读 `DerivedView`**，不许读 `SessionState`。
2. **溯源规则**：屏幕上每一项必须能追到一个 `AgentEvent` 或时钟；
   每个派生块声明 `from: string[]`，并集必须覆盖日志里出现过的全部 kind。**这是机读校验。**
3. **事件流是唯一事实来源**，单向。
4. **契约只有一份实现，在 TS 里。** 任何外壳（Rust / Node 桥）只许搬字节，
   **不许认识事件词汇**。
5. **task / plan / memory / workflow / multi-agent 不是 runtime 概念**，不许进契约。
6. **能力声明描述传输形状**，不是已经生效的开关。
7. **不许用绝对毫秒判断卡没卡**：基线 = 当前相位实测间隔中位数，`×8` slow、`×25` stalled，
   样本 <3 **拒绝给判据**。
10–12. 文案是**工业控制系统状态报告**，不是 AI 助手对话；数据缺失显示
   `NOT STATED` / `NOT REPORTED`，**宁可显示 absence，不许造一个看着合理的值**。
13–18. 视觉遵循 3NDM1N15T4T0R · Endfield 设计语言；`border-radius: 0`；强调色面积 <5%。
19–21. **无头浏览器禁用**；因此**不得声称看见过渲染结果**。

## 5. 已定决策（`AGENTS.md` §六，不要重开辩论）

| 决定 | 结论 |
| --- | --- |
| 引擎 | omp（`omp acp`）——**这条是本次调研要动的唯一一条** |
| 传输 | ACP over stdio，JSONL 严格 LF 分帧 |
| 外壳 | Tauri。**Electron 完全不可接受**（用户明令） |
| 外壳边界 | Rust 只做受监管的管道，不认识事件词汇 |
| 目录名 / 品牌 | `t3rra-core` / `T3rra Protocol` |
| 打包引擎 | 不做。引擎由用户自己装、自己登录 |
| provider 层 | 不做。`configOptions` 由运行时给清单，只渲染，不建白名单 |
| 会话存储 | 归引擎。界面只渲染 `session/list`，绝不自己存对话 |
| 语域 | OPERATOR / EXPERT 分层，协议词汇只在 EXPERT 出现 |

## 6. omp 的实测基线（`NOTES.md` §八/§九/§十/§十二）

引擎 `omp 18.2.6`，`omp acp`，protocolVersion **1**：

- 冷启动 **1.13s** 可用（`initialize` 937ms + `session/new` 186ms）→ **必须启动即 spawn**。
- 首 token 延迟 **4.58s**（trivial 指令、warm session）。
- `clientCapabilities: {}` 时 **它一次都没回头找我们**（无 fs / terminal / elicitation）
  → 惰性前端不会饿死 runtime，前提是**什么都不声明**。
- `streamingArgs = false`；`tool_call` 到达时 `rawInput` 已完整。
- **`permissions = false`：五档裁决里的 `approval` 在 omp 上是死的**（不声明 elicitation 表单
  → plan 审批自动批准）。
- `messageId` 存在且稳定，但**思考与正文共用一个 id** → 块边界仍要推。
- `usage_update` 是**上下文填充率**，与 `PromptResponse.usage`（本轮 token）是两个量。
- `tool_call.kind` **不可信**（列目录被标成 `read`）→ **显示用 `title`**。
- `authenticate` 无凭据也返回 `{}` → **不能当成"能干活"**。
- `configOptions` 把 mode / model / thinking 的**完整清单**交给我们渲染
  → 代码里不需要任何 provider 或 model 表。这正是"换引擎＝换一个文件"的依据。
- `session/load` **可用**（约 4s），历史以普通 `session/update` **回放**；
  回放里含 `user_message_chunk`。恢复是对真引擎验证过的。

**环境已就绪**：Rust 1.95.0（`x86_64-pc-windows-msvc`）、VS BuildTools 18、WebView2 152、Node 24。

## 7. 为什么要重新选后端

不是"想换个玩具"，是三条具体的账：

1. **图片会离开你的机器。** omp 有 `blob-broker`，一条叫 `imageUrls exposure` 的子系统，
   把图片发布成 URL，内置一堆匿名/商业图床和隧道。详见 [`backends/omp.md`](./backends/omp.md)。
2. **omp 的维护成本。** `packages/` 下 5084 个 TS/TSX ≈ **146 万行**，
   `crates/` 466 个 Rust ≈ **24 万行**，Bazel + Cargo + bun + Python 混装。
   fork 它 = 承接这堆。
3. **omp 的 ACP 面很窄。** `permissions = false`、审批走 elicitation 且默认自动批准、
   `plan` 一次都没出现——**UI 想做的许多事，omp 根本没在事件里告诉我们**。

而 t3rra-core 的规则是"runtime 没通过事件告诉我们的，界面不许知道，也不许编"。
**当 runtime 什么都报不出来时，这套规则就变成了产品的天花板。**
候选 opencode 恰好在这点上相反：它的接入面比 ACP 宽得多（见
[`backends/opencode.md`](./backends/opencode.md)）。

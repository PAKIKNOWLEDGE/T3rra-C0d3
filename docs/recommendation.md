# 结论与建议

前置：[`current-state.md`](./current-state.md)、[`backends/omp.md`](./backends/omp.md)、
[`backends/opencode.md`](./backends/opencode.md)、[`backends/dsh.md`](./backends/dsh.md)。

---

## 1. 先把问题拆对：这是两个互斥的问题，不是三个选项

| 说法 | 实际意思 | 代价 |
| --- | --- | --- |
| **换引擎**（选项 1） | 保留 t3rra 的界面，换 runtime | 一个 `AgentSource` 实现 |
| **fork 别人的 desktop 改样式**（选项 2） | 放弃 t3rra 的界面，接受别人的设计 + 别人的后端 | 丢掉唯一值钱的东西：溯源契约 |

t3rra-core 的架构**本来就是为"换引擎"设计的**
（`AGENTS.md` §四："换引擎 = 再写一份 `AgentSource` 实现，界面不动"）。
所以选项 1 是**顺着你自己的设计走**，选项 2 是**把设计扔掉**。

## 2. 对比表

| 维度 | omp | **opencode** | dsh |
| --- | --- | --- | --- |
| 接入面 | ACP v1，**窄**（`permissions=false`、`plan` 不发、`approval` 死） | **ACP v1（宽）+ HTTP/SSE（OpenAPI 3.1）+ SDK** | **无稳定接入面**（上游 web UI + 插件 API） |
| 图片路径 | `blob-broker` **发布成 URL**，内置图床/云盘/隧道 | prompt **本地附件**，无上传子系统 | 未知 |
| 破坏性变更 | **日常**（一天多条 fix/bump） | **大版本**（v1→v2 三处故意破坏，有迁移指南） | **持续**（自述 preview，明说会破） |
| 代码规模 | 146 万行 TS + 24 万行 Rust，Bazel+Cargo+bun+py | 纯 TS monorepo（turborepo + bun） | 纯 TS + Cordis 插件 |
| 桌面壳 | — | **Tauri→Electron**（SolidJS 薄壳 + sidecar） | Tauri 2 + **iframe 上游 web UI** |
| 可改样式的程度 | 自建 | 自建，或 fork 共享 `@opencode-ai/app` | **改不到主界面**（不是这个仓库的） |
| License | 未核 | **MIT** | MIT **+ 非商用附加条款** |
| 生态 | — | 209k star，**已有第三方客户端** | 2.4k star（desktop） |

## 3. 建议（可反驳）

**不要 fork 任何别人的 desktop。走选项 1，但把说法改准：**

> **保留 t3rra，把后端从 omp 换成 opencode。**

理由：

1. **它保住你唯一值钱的东西**——那套"屏幕上每一项都能追到事件"的机械校验
   （`from` 并集覆盖全部 kind）。fork 别人的 UI 会把它扔掉。
2. **它解决你的两个真痛点**：图片不再离开本机；接入面从"窄 ACP"扩到
   "ACP + HTTP/SSE"，`approval` 这个死掉的裁决回来了。
3. **它的成本是已知的**：一个 `AgentSource` 文件 + 一份映射表验证。
4. **它的破坏是可预期的**：opencode 的破坏集中在大版本且带迁移指南，
   比 omp 的日常破坏、dsh 的持续破坏都好处理。

### 两条子路，二选一

| | A：ACP 复用（**先做这个**） | B：HTTP/SSE 新写 |
| --- | --- | --- |
| 做什么 | 新写 `src/agent/sources/opencode-acp.ts`，复用现有 ACP 契约 | 基于 `/api/event` + `/api/session/...` 写新 source |
| 界面改动 | **零** | 零（但契约可能升 schema） |
| 拿到什么 | session CRUD/load/fork、流式、**permission**、model/effort/mode 选项、slash commands | 上面全部 **+** diff、revert、form、fs、pty |
| 风险 | 低：契约不变 | 中：v2 server API 是**故意破坏点**，要跟着大版本走 |

**先 A 后 B。** A 是低风险入口，能立刻验证"opencode 能不能替代 omp"；
B 是真正吃到 opencode 长处的路，但要先确认 A 通了。

### Tauri 决定：保留，但记账

- `AGENTS.md` 写着"Electron 完全不可接受"。证据显示 opencode 官方**正是从 Tauri 退回 Electron**，
  原因具体且可复现（WebKit 在 mac/Linux 渲染/样式不一致、Windows sidecar 启动偶发失败）。
- **但冲突不大**：你在 Windows 上，Tauri 用 **WebView2（Chromium）**，那些 WebKit 坑对你不成立。
  dsh 的 Linux 黑屏教训也指向同一个结论：**Tauri 的坑在 mac/Linux，不在 Windows。**
- **所以**：只出 Windows → Tauri 决定成立。将来要出 mac/Linux → 这是已知坑，别到时候才发现。
- 写外壳时把 t3rra-core 已经踩到的**引擎定位回退**（探 PATH → 已知位置 → 手填）提前做进去，
  那正是 opencode 在 Windows 上翻车的地方。

## 4. 下一步：一个可证伪的 spike（零 token）

**目标**：用证据回答"t3rra 的 ACP 适配器能不能直接吃 `opencode acp`"，**而不是靠推测**。

- **做法**：照 t3rra-core 的 `scripts/spike-acp.mjs`，把子进程从 `omp acp` 换成 `opencode acp`；
  沿用它的规矩——**spike 不进产物，`src/` 永不 import**。
- **前置**：装 opencode（Windows：`scoop install opencode` 或 `npm i -g opencode-ai`），
  并 `opencode auth login`。
- **产物**：报文落 `traces/opencode/*.jsonl`，作为测试 fixture 与文档证据。
- **判据**（逐条可证伪）：
  1. `docs/adapters/acp.md` 映射表里，omp 的每种报文在 opencode 下**是否存在**；
  2. **有损列**是否变化（哪些字段 opencode 有、omp 没有，或反之）；
  3. session options 能否填满 t3rra 的 `model` / `mode` / `thinking`
     （omp 是靠 `configOptions` 拿完整清单的）；
  4. `session/load` 回放是否同样可用（t3rra 的会话恢复依赖它）。
- **只握手，不调模型** → 零 token。
- **产出**：`docs/adapters/opencode-acp.md`（照 `acp.md` 的格式，逐条标【实测】/【文档】/【猜测】）。

## 5. 已知的开放问题（写下来是为了别忘）

1. **目标平台只有 Windows 吗？** 决定 Tauri 结论是否成立。
2. **omp 的 `blob-broker` 默认是否启用？** 我只确认了 `startBlobBrokerFromEnvironment()`
   由环境变量驱动，**没验默认值**。这决定"留在 omp"是否还有一个低成本选项。
3. **opencode `/api/event` 是 volatile 的**（文档明说慢消费者会溢出错流、断连期间事件丢失）。
   这对 t3rra-core 的**静默判断 / 节奏基线**是实际威胁，需要设计重连 + 补拉策略
   （`session/:id/log` 支持 `after` 游标）。
4. **契约风险**：t3rra 的溯源规则禁止把 task/plan/memory 当一等概念，
   但 opencode 的 API 里**有** todo、有 subagent、有 skills。接的时候要过一遍溯源规则，
   别把上游概念直接漏进契约。

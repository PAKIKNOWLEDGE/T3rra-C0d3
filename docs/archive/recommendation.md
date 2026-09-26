> **【归档 2026-09-26】** 2026-09-21 的后端对比与选型论证。结论（opencode）已写进 [`AGENTS.md`](../../AGENTS.md) §二；spike 脚本仍引用本文 §4 的四个问题。

# 结论与建议

> **代际: core-era ｜ 状态: 部分作废（仅历史） ｜ 取代: [`status.md`](./status-2026-09-26.md) @ 2026-09-23**
>
> 写于 2026-09-21，口径为「**保留 core 界面、只换引擎**」。  
> **该口径已取代**：2026-09-23 起为**重写**，工程树 `t3rra-C0d3`（见 `status.md` 代际表）。
>
> - **仍有效**：§2 对比表（证据）、§4 判决标准、§5 开放问题、Tauri 记账。
> - **已作废**：§3「代价 = 一个 `AgentSource`」的小手术口径。
> - **§4 spike 已完成**：结论见 [`adapters/opencode-acp.md`](../adapters/opencode-acp.md) 与 `traces/opencode/`（四判据已闭合，含审批）。

前置：[`current-state.md`](./current-state.md)、[`backends/omp.md`](../backends/omp.md)、[`backends/opencode.md`](../backends/opencode.md)、[`backends/dsh.md`](../backends/dsh.md)。

---

## 1. 问题拆分：两个互斥问题，不是三个选项

| 说法 | 实际意思 | 代价 |
| --- | --- | --- |
| **换引擎**（选项 1） | 保留 t3rra 界面，换 runtime | 一个 `AgentSource` 实现（小手术口径；重写见 status） |
| **fork 他人 desktop 改样式**（选项 2） | 放弃 t3rra 界面，接受他人的设计与后端 | 丢掉溯源契约 |

t3rra-core 架构本为「换引擎」设计（`AGENTS.md` §四）。选项 1 顺着原设计；选项 2 扔掉设计。

## 2. 对比表

| 维度 | omp | **opencode** | dsh |
| --- | --- | --- | --- |
| 接入面 | ACP v1，**窄**（permissions=false、plan 不发、approval 死） | **ACP v1（宽）+ HTTP/SSE（OpenAPI 3.1）+ SDK** | **无稳定接入面**（上游 web UI + 插件 API） |
| 图片路径 | **blob-broker 发布成 URL**（图床/云盘/隧道） | prompt **本地附件**，无上传子系统 | 未知 |
| 破坏性变更 | **日常** | **大版本**（v1→v2 三处故意破坏，有迁移指南） | **持续**（自述 preview） |
| 代码规模 | 146 万行 TS + 24 万行 Rust | 纯 TS monorepo | 纯 TS + Cordis |
| 桌面壳 | — | **Tauri→Electron**（SolidJS 薄壳 + sidecar） | Tauri 2 + **iframe 上游 web UI** |
| 可改样式 | 自建 | 自建，或 fork `@opencode-ai/app` | **改不到主界面** |
| License | 未核 | **MIT** | MIT **+ 非商用附加条款** |
| 生态 | — | 209k star，已有第三方客户端 | 2.4k star（desktop） |

## 3. 建议（可反驳）

**不要 fork 任何别人的 desktop。** 更准的说法：

> **保留 t3rra 契约，把后端从 omp 换成 opencode。**

理由：

1. 保住唯一值钱的东西——「屏上每一项可追事件」的机械校验（`from` 并集覆盖）。
2. 解决两个真痛点：图片不离本机；接入面从窄 ACP 扩到 ACP + HTTP/SSE，approval 回来。
3. 成本已知（重写下为整个 `app/` 实现 + 映射表验证，见 status）。
4. 破坏可预期：大版本 + 迁移指南，好于 omp 日常破坏与 dsh 持续破坏。

### 两条子路，先 A 后 B

| | A：ACP（先做） | B：HTTP/SSE（后做） |
| --- | --- | --- |
| 做什么 | ACP source + 现有契约 | `/api/event` + `/api/session/...` |
| 界面改动 | 零 | 零（可能升 schema） |
| 拿到什么 | session CRUD/load、流式、permission、options | 上面全部 + diff、revert、form、fs、pty |
| 风险 | 低 | 中：v2 server API 为故意破坏点 |

### Tauri：保留，但记账

- 旧仓写明 **Electron 完全不可接受**。证据：opencode 官方从 Tauri 退回 Electron，原因在 mac/Linux WebKit 与 Windows sidecar 启动。
- **冲突有限**：Windows 上 Tauri 用 WebView2（Chromium），WebKit 坑不成立；Rust 只做管道正合适。
- **只出 Windows → Tauri 成立**；将来 mac/Linux → 已知坑，见 `backends/opencode.md`、`backends/dsh.md`。
- 写外壳时纳入引擎定位回退（PATH → 已知位置 → 手填）。

## 4. 下一步：可证伪 spike（零 token）【已完成】

**目标**：用证据回答「适配器能否吃 `opencode acp`」。

- 照 `scripts/spike-acp.mjs`，子进程换 `opencode acp`；**spike 不进产物，`src/` 永不 import**。
- 产物：`traces/opencode/*.jsonl`；产出 [`adapters/opencode-acp.md`](../adapters/opencode-acp.md)。
- 判据：报文是否存在；有损列变化；options 能否填 model/mode/thinking；`session/load` 是否可用。

**状态：四条判据已闭合**（2026-09-23）。

## 5. 开放问题（当时记录）

1. **目标平台是否仅 Windows？** → 已定：主平台 Windows，NixOS 为 P2（status）。
2. **omp blob-broker 默认是否启用？** 【未验】环境变量驱动；未验默认值。
3. **`/api/event` volatile**（慢消费者溢出、断连丢事件）→ 对静默判断是实际威胁；本项目走 ACP，HTTP 事件流仍未接入。重连/补拉需 `session/:id/log` 的 `after` 游标。
4. **契约风险**：禁 task/plan/memory 一等概念，但 opencode API 有 todo、subagent、skills——接入时过溯源规则，勿漏入。

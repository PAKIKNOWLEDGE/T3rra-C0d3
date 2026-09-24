# t3rra-C0d3 工作区文档

**现行真相只有一份：[`status.md`](./status.md)。** 结构与规矩见 [`../AGENTS.md`](../AGENTS.md)。  
其余文档是**带日期的证据与标准**，不承担「当前在做什么」；与 `status.md` 代际表冲突时，以它为准。

> **代际（2026-09-23）**：旧实现 `t3rra-core` 已弃用（只读参考）；**`t3rra-C0d3` 是唯一工程树**，产品代码在 `app/`。  
> `current-state.md`、`recommendation.md` 的「现状/策略」部分标为【仅历史】，文件头已写取代关系。

## 导航

| 文件 | 何时读 |
| --- | --- |
| [`status.md`](./status.md) | **先读**：现状、已决定事项、验收清单、事故记录 |
| [`handover.md`](./handover.md) | 运行方式、完成度三分、规矩、证据地图 |
| [`engine-contract-audit.md`](./engine-contract-audit.md) | **对引擎的假设哪些是错的**（2026-09-24 四路源码审计；20 项问题、12 项做对、修复顺序） |
| [`capability-map.md`](./capability-map.md) | **coding-agent 能力全图**：已有/半截/缺失、结构空洞、建议优先级（未拍板） |
| [`adapters/opencode-acp.md`](./adapters/opencode-acp.md) | 引擎实测映射表：报文、契约行为、有损列、未闭合项 |
| [`visual-guide.md`](./visual-guide.md) | 视觉优化：硬约束与可重构边界、防悬空对照表 |
| [`design-contract.md`](./design-contract.md) | 界面做法：ark 族 · complex · 仅暗色；§二 起可替换 |
| [`design-critique.md`](./design-critique.md) | 反面清单：endfield 风格的六个问题 |
| [`design-review.md`](./design-review.md) | 范本三方盲审记录：已修 / 未修 / 证据冲突 |
| [`blind-review-prompt.md`](./blind-review-prompt.md) · [`blind-review-result.md`](./blind-review-result.md) | 工程状态盲审（2026-09-23，**历史**）：问题清单与处置见 status |
| [`recommendation.md`](./recommendation.md) | 后端对比与结论（【仅历史】部分作废，见文件头） |
| [`backends/omp.md`](./backends/omp.md) · [`backends/opencode.md`](./backends/opencode.md) · [`backends/dsh.md`](./backends/dsh.md) | 三个候选后端的证据 |
| [`current-state.md`](./current-state.md) | 2026-09-21 快照（【仅历史】）；现行状态看 status.md |
| [`rules-inherited.md`](./rules-inherited.md) | 现行有效规则全集（自旧仓继承） |

## 证据分级

每条结论标来源。未验证的写未验证：

| 记号 | 含义 |
| --- | --- |
| **【实测】** | 本机跑过，或对本地 checkout 可复现 |
| **【源码】** | 在本地 checkout 源码中读到，未执行 |
| **【文档】** | 上游官方文档 / 发布说明 / 仓库首页 |
| **【未验】** | 推断，无证据；写出以便证伪 |

## 快照时点

- 后端调研：**2026-09-21**（`backends/*` 中 star、版本号为该日快照）
- 本机 omp：`18.2.6`（`~/.bun/bin/omp.exe`）
- opencode：**1.18.32**（2026-09-23，见 [`adapters/opencode-acp.md`](./adapters/opencode-acp.md)）
- dsh：`master`，**developer preview**，桌面端要求内核 `0.1.5-rc.2+`

**版本号会过时。** 重新决策前应重跑验证，不要直接引用本文档数字。

## 一句话结论（2026-09-21 口径，已部分被 status.md 取代）

不要 fork 任何别人的 desktop。上一代的界面与事件契约是**规则**来源；真正动作是**换引擎**（omp → opencode）。  
2026-09-23 起的修正：引擎决定不变，但「保留界面」指**保留契约与范本**，不是保留旧仓库实现——见 [`status.md`](./status.md)。

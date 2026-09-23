# t3rra-C0d3 工作区文档

**现行真相只有一份：[`status.md`](./status.md)。** 结构与规矩看 [`../AGENTS.md`](../AGENTS.md)。
其余文档是**带日期的证据与标准**，不承担"当前在做什么"——凡与 `status.md` 的代际表冲突，以它为准。

> **代际（2026-09-23）**：旧实现 `t3rra-core` **已弃用**（只读参考、规则出处）；
> **`t3rra-C0d3` 是唯一工程树**，产品代码写在这里（`app/`）。
> `current-state.md` 与 `recommendation.md` 的"现状/策略"部分标为【仅历史】，文件头都写了取代关系。

---

## 导航

| 文件 | 什么时候读 |
| --- | --- |
| [`status.md`](./status.md) | **先读这个**：现状、已决定的事、待拍板的开放项、事故记录（唯一允许写"决定了什么"的地方） |
| [`adapters/opencode-acp.md`](./adapters/opencode-acp.md) | **引擎的实测映射表**：报文全集、契约级行为、有损列、未闭合项（换引擎的依据） |
| [`design-contract.md`](./design-contract.md) | **界面标准答案**：ark 族 · complex · 只有暗色。色板/字体/构图/几何/动效/验收方式 |
| [`design-critique.md`](./design-critique.md) | **界面反面清单**：旧 endfield 风格"不对味"的六个病灶，防回潮 |
| [`design-review.md`](./design-review.md) | 范本盲审记录（三方独立）：已修/未修、契约修订、验收清单 |
| [`blind-review-prompt.md`](./blind-review-prompt.md) · [`blind-review-result.md`](./blind-review-result.md) | 工程状态的盲审：给审阅者的 prompt 与审阅结果（含它对文档假话的清单） |
| [`recommendation.md`](./recommendation.md) | 后端对比、建议、可证伪的下一步实验 |
| [`backends/omp.md`](./backends/omp.md) · [`backends/opencode.md`](./backends/opencode.md) · [`backends/dsh.md`](./backends/dsh.md) | 三个候选后端的证据（omp 的 blob-broker / opencode 的接入面与代价 / dsh 的被否理由） |
| [`current-state.md`](./current-state.md) | **2026-09-21 的快照**：上一版实现做到哪、上一版的引擎基线与不可协商的规则。**其中"现状"部分已过时，看 status.md** |

## 证据分级

这份调研里的每条结论都标了来源，因为本项目（t3rra-core）的规矩是
**没验证的就说没验证**。四档：

| 记号 | 含义 |
| --- | --- |
| **【实测】** | 本机跑过，或对本地 checkout 的源码可复现 |
| **【源码】** | 在本地 checkout 的源码里读到，但没执行 |
| **【文档】** | 来自上游官方文档 / 发布说明 / 仓库首页 |
| **【未验】** | 推断，没有证据。写出来是为了让它能被证伪 |

## 快照时点

- 后端调研快照：**2026-09-21**（`backends/*` 里的 star 数、版本号都是那天的）
- 本机 omp：`18.2.6`（`~/.bun/bin/omp.exe`）；本地 checkout 的 `git log` 顶部为
  `62a4aa98a4`（含 `chore: bump version to 18.2.5`）
- opencode：本机现为 **1.18.32**（2026-09-23 实测，见 [`adapters/opencode-acp.md`](./adapters/opencode-acp.md)）；
  那份后端文档写的是当时的 `dev` 分支与 `v1.18.31` 稳定线
- dsh：`master` 分支，**developer preview**，桌面端要求内核 `0.1.5-rc.2+`

**版本号都会过时。** 重新决策前应该重跑一遍验证，而不是引用这份文档的数字。

## 一句话结论（2026-09-21 的口径，已部分被 status.md 取代）

不要 fork 任何别人的 desktop。上一版实现（t3rra-core）的界面与事件契约是**规则**的来源，
真正的动作是**换引擎**：把后端从 omp 换成 opencode，架构上的边际成本 ≈ 一个 `AgentSource` 实现。
**这条在 2026-09-23 之后要重述**：引擎决定仍然成立（且有本机实测托底），
但"保留界面"指的是**保留契约与范本**，不是保留旧仓库的实现——见 [`status.md`](./status.md)。

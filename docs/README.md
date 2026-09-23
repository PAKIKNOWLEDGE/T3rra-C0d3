# T3rra 调研工作区

这个 workspace（`t3rra-C0d3`）在 2026-09-21 建成时是空的。**这里只放调研产物，不放代码。**

真正的项目代码在 `C:\DEV\develop\NIX\t3rra-core`（下称 **t3rra-core**），
omp 的上游源码在 `C:\DEV\develop\NIX\oh-my-pi`。

---

## 导航

| 文件 | 什么时候读 |
| --- | --- |
| [`current-state.md`](./current-state.md) | **先读这个**：workspace 为什么是空的、t3rra-core 已经做到哪、有哪些已定死不可协商的约束 |
| [`backends/omp.md`](./backends/omp.md) | 候选后端 A：`oh-my-pi`（现状引擎）。为什么"图片要上传到第三方"不是错觉 |
| [`backends/opencode.md`](./backends/opencode.md) | 候选后端 B：`opencode`。ACP + HTTP/SSE 三层接入面，图片不走上传 |
| [`backends/dsh.md`](./backends/dsh.md) | 候选后端 C：`deepseek-harness` + 它的 Tauri 桌面壳 |
| [`recommendation.md`](./recommendation.md) | 对比表、建议、以及可证伪的下一步实验 |
| [`adapters/opencode-acp.md`](./adapters/opencode-acp.md) | **opencode 的 ACP 实测映射表**（对照 omp）：报文全集、契约级行为、有损列、未闭合项 |
| [`design-critique.md`](./design-critique.md) | **界面反面清单**：旧 endfield 风格"不对味"的六个病灶，防回潮 |
| [`design-review.md`](./design-review.md) | **范本盲审记录**（三方独立）：对味缺口 + 用户友好缺口、已修/未修、契约的修正提案、以及"看什么"的验收清单 |
| [`design-contract.md`](./design-contract.md) | **界面标准答案**：ark 族 · complex · 只有暗色。色板/字体/构图/几何/动效/验收方式 |

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

- 快照日期：**2026-09-21**
- 本机 omp：`18.2.6`（`~/.bun/bin/omp.exe`）；本地 checkout 的 `git log` 顶部为
  `62a4aa98a4`（含 `chore: bump version to 18.2.5`）
- opencode：`dev` 分支，`v1.18.31` 为当时稳定线（2026-09-14），`v2` 已可用
- dsh：`master` 分支，**developer preview**，桌面端要求内核 `0.1.5-rc.2+`

**版本号都会过时。** 重新决策前应该重跑一遍验证，而不是引用这份文档的数字。

## 一句话结论

不要 fork 任何别人的 desktop。t3rra-core 的界面和事件契约已经做完且引擎可换，
真正的动作是**保留界面、把后端从 omp 换成 opencode**，代价是一个 `AgentSource` 实现。
详见 [`recommendation.md`](./recommendation.md)。

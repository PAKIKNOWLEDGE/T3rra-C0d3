# AGENTS.md — t3rra-C0d3 工作区交接文件

给接手这个工作区的 agent（或人）。**先读这份，再动任何东西。**

本文件只写两件事：**这里有什么**、**规矩是什么**。
**现状（在做什么、决定了什么）写在 [`docs/status.md`](./docs/status.md)**，那份有日期、会变；
本文件不写判定、不写立场，避免变成会撒谎的化石。

## 一、这个工作区有什么

| 位置 | 内容 |
| --- | --- |
| `app/` | 产品代码的位置（工程本体在此；目录按需要建立） |
| `docs/` | 调研与决策的落盘处：后端实测、选型、设计契约、盲审记录、现状与决定（`status.md`） |
| `demo/ark-console.html` | 界面范本（静态单文件，已验收为"范本"级；历史版本另存为 `*-accepted-*.html` 便于对比） |
| `spike/` + `traces/` | 零 token 的 ACP 探针与其报文证据（实测结论的来源，不进产物、`app/` 不 import） |
| `C:\DEV\develop\NIX\t3rra-core` | 相邻仓库（历史资产）：**当规则出处与负面参照读；改它之前先问仓库主人** |
| `C:\DEV\develop\NIX\oh-my-pi` | 候选引擎之一的上游 checkout（只读参考） |
| `C:\DEV\develop\NIX\.grok\skills\ark-ui` | 视觉参考系。**只看不加载**：不跑它的脚本、不进它的工作流 |

## 二、已锁定的决策（不许重开辩论）

1. **后端方向**：保留 t3rra 界面，引擎从 omp 换成 **opencode**
   （理由与对比见 `docs/recommendation.md`；尚未做 spike 实证）。
   omp 的 `blob-broker`（图片发布到第三方图床）是换引擎的直接动因，证据在
   `docs/backends/omp.md`。
2. **界面风格**：**ark 族 · complex 深度 · 只有暗色**。亮色主题已死。
   标准答案全在 **[`docs/design-contract.md`](./docs/design-contract.md)**——
   色板、字体三轨、舞台+仪表构图、几何、动效、验收方式。
3. **endfield 那套是反面教材**，六个病灶见
   [`docs/design-critique.md`](./docs/design-critique.md)。任何"怎么弄都不对味"的
   回潮，先对照它。
4. **外壳**：Tauri（Windows / WebView2 成立；mac/Linux 的 WebKit 坑是已知账，
   见 `docs/backends/opencode.md`）。Electron 不可接受（仓库主人明令）。

## 三、给 agent 的规矩

- **文档中文，标识符/事件 kind/日志英文**（沿用 t3rra-core 约定）。
- **无头浏览器禁用**。不跑 puppeteer/playwright/jsdom，也不跑 ark-ui 的
  audit/capture 脚本。界面交付 = 给可双击打开的路径 + 人话说明看什么，
  等仓库主人的眼睛验收。**不许自行宣布视觉通过。**
- **证据分级**：写结论必须标【实测】/【源码】/【文档】/【未验】（见 `docs/README.md`）。
  没验证的就说没验证。
- **声称完成必须有工具输出支撑**；范本的已知缺陷清单在
  `docs/design-contract.md` §七——修那些，别重构已验收的结构。
- **能定的先定，把否决权留给仓库主人**；不要把问题清单推回给他。
- 换引擎的下一步是**零 token spike**（`opencode acp` 抓报文对比
  `t3rra-core/docs/adapters/acp.md`），计划在 `docs/recommendation.md` §四。
  spike 不进产物、`src/` 永不 import——这是 t3rra-core 的既有规矩。

## 四、阅读顺序

1. 本文件
2. [`docs/design-contract.md`](./docs/design-contract.md)（界面标准答案）
3. [`docs/design-critique.md`](./docs/design-critique.md)（反面清单）
4. [`docs/design-review.md`](./docs/design-review.md)（范本盲审：已修/未修、待裁决的契约修订、验收清单）
5. [`docs/recommendation.md`](./docs/recommendation.md)（后端结论与下一步）
6. [`docs/adapters/opencode-acp.md`](./docs/adapters/opencode-acp.md)（候选引擎的实测映射表：报文全集、契约行为、有损列、未闭合项）
7. [`docs/status.md`](./docs/status.md)（**现状与决定：唯一允许写"我在做什么/决定了什么"的地方，带日期**）
8. 相邻仓库只读：需要规则原文时读 `NIX\t3rra-core\AGENTS.md`、`docs\event-model.md`、`docs\adapters\acp.md`；
   **在里面动手之前先问仓库主人**

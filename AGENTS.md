# AGENTS.md — t3rra-C0d3 工作区交接文件

给接手这个工作区的 agent（或人）。**先读这份，再动任何东西。**

本文件只写两件事：**这里有什么**、**规矩是什么**。
**现状（在做什么、决定了什么）写在 [`docs/status.md`](./docs/status.md)**，那份有日期、会变；
本文件不写判定、不写立场，避免变成会撒谎的化石。

**名字怎么叫（写法统一，别再造出第四套）**：现行工程树写作 **`t3rra-C0d3`**；
上一版实现的目录名是 **`t3rra-core`**。哪个现行、哪个退役、从哪天起，看 `docs/status.md` 的代际表。
界面上的**产品品牌**（屏幕上那几个字）是另一件事。

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

1. **后端方向**：保留 t3rra 的界面契约，引擎从 omp 换成 **opencode**
   （理由与对比见 `docs/recommendation.md`；**2026-09-23 已做完零 token spike**，
   实测结论见 `docs/adapters/opencode-acp.md` 与 `traces/opencode/`）。
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
- **视觉是开放项**：要做视觉优化，读 [`docs/visual-guide.md`](./docs/visual-guide.md)。
  那里把**硬约束**（不许悬空控件、不许造事实、无头禁令、信道边界）与**可自由重构的视觉**分开写——
  **视觉允许重构，换更好的方案不叫回潮**；`docs/design-contract.md` §二 起都是"做法"而非戒律。
  唯一可机检的悬空控件规则在 `npm run check:app`。
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
2. [`docs/status.md`](./docs/status.md)（**现行真相**：代际表、已决定的事、**仓库主人的验收清单**）
3. [`docs/handover.md`](./docs/handover.md)（**交接单**：真做完了什么／只做了一半什么／完全没做的是什么、规矩与坑、下一步怎么做）
4. [`docs/visual-guide.md`](./docs/visual-guide.md)（**做视觉先读这份**：四條硬约束 + 视觉可重构的边界）
5. [`docs/design-contract.md`](./docs/design-contract.md)（界面做法记录；§二 起都是可替换的"做法"）
6. [`docs/design-critique.md`](./docs/design-critique.md)（反面清单）、[`docs/design-review.md`](./docs/design-review.md)（范本盲审）
7. [`docs/recommendation.md`](./docs/recommendation.md)（后端结论）、[`docs/adapters/opencode-acp.md`](./docs/adapters/opencode-acp.md)（引擎实测映射表）
8. 旧仓库 `NIX\t3rra-core` **只读**：需要规则原文时读它的 `AGENTS.md`、`docs/event-model.md`、`docs/adapters/acp.md`；
   **改它之前先问仓库主人**（它的工作树本来就是脏的）

## 五、开工前必须知道的四条硬规矩

1. **"已知未做/只做了一半" 必须与 "已完成" 并列出现在汇报里。** 不许只写进代码注释或 tooltip——
   上一任就是把三个死按键写成 `<div>`（正好落在我自己闸的扫描范围之外），再拿"无悬空控件"当交付证据。
2. **元素清单制**：`app/ui-manifest.json` 里每个能被看见/被点到的元素都必须表态（`wired` 或 `static: 理由`）；
   没分类、清单陈旧、声称 wired 但代码里没引用 → `npm run check:app` 变红。
   *这个机制保证"存在必须被表态"，不保证"有用"——有用只有主人的手能判。*
3. **无头浏览器禁用**；**不许声称看过渲染结果**；交付界面 = 可双击路径 + 3–5 条"看什么"，等主人的眼睛。
4. **别在别人的工作树上用整文件回滚**（上一任在旧仓 `git checkout --` 连带毁掉别人 338 字节未提交改动）。
   回滚自己的改动之前先看 `git status`；或者 `git stash` / 先复制备份。

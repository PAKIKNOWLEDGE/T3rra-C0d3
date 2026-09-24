# AGENTS.md — t3rra-C0d3 工作区说明

给接手本工作区的开发者或代理。**先读本文件，再读 `docs/status.md`。**

本文件只写：**这里有什么、规矩是什么。**  
当前进度与已做决定见 [`docs/status.md`](./docs/status.md)（带日期，会更新）。

**命名**：工程树统一写 `t3rra-C0d3`。上一代实现在目录名 `t3rra-core`。代际与状态以 `docs/status.md` 的表为准。  
界面品牌名是另一件事，不在本文件定。

## 一、目录结构

| 路径 | 内容 |
| --- | --- |
| `app/` | 产品代码（工程本体；子目录按需建立） |
| `docs/` | 调研、决策、设计契约、现状（`status.md`） |
| `demo/ark-console.html` | 界面范本（静态单文件，已验收）；历史版本为 `*-accepted-*.html` |
| `spike/` + `traces/` | 零成本 ACP 探针及报文证据（不进产物，`app/` 不 import） |
| `C:\DEV\develop\NIX\t3rra-core` | 上一代实现（只读参考与规则出处）。**改前需仓库主人同意**（工作树有未提交改动） |
| `C:\DEV\develop\NIX\oh-my-pi` | 候选引擎上游 checkout（只读） |
| `C:\DEV\develop\NIX\.grok\skills\ark-ui` | 视觉参考。**只看不加载**：不跑其脚本、不进其工作流 |

## 二、已锁定的决定

1. **后端**：界面契约沿用 t3rra，引擎为 **opencode**（ACP）。依据与对比见 `docs/recommendation.md`；零成本实测见 `docs/adapters/opencode-acp.md`、`traces/opencode/`。  
   换引擎的直接原因：omp 的 `blob-broker` 会把图片发布到第三方图床，证据在 `docs/backends/omp.md`。
2. **界面**：**ark 族 · complex · 仅暗色**。色板、字体、构图、几何、动效、验收方式见 [`docs/design-contract.md`](./docs/design-contract.md)。
3. **反面参照**：endfield 风格的六个问题见 [`docs/design-critique.md`](./docs/design-critique.md)。
4. **外壳**：Tauri（Windows / WebView2 成立；mac/Linux 的 WebKit 问题见 `docs/backends/opencode.md`）。**Electron 不可接受**（仓库主人规定）。

## 三、工作规矩

- **文档用中文**；标识符、事件 kind、日志用英文（沿用 t3rra-core 约定）。
- **视觉改动**先读 [`docs/visual-guide.md`](./docs/visual-guide.md)。  
  硬约束仅四条：不许悬空控件、不许造事实（缺失写 absence）、无头浏览器禁用、信道与平台边界。  
  其余视觉内容允许重构；`docs/design-contract.md` §二 起是「当前做法」，不是戒律。  
  悬空控件的机检在 `npm run check:app`。
- **无头浏览器禁用**。不跑 puppeteer / playwright / jsdom，不跑 ark-ui 的 audit/capture。  
  界面交付 = 可打开的路径 + 3–5 条「看什么」，由仓库主人目视验收。**不得声称已看过渲染结果。**
- **结论必须标证据等级**：【实测】/【源码】/【文档】/【未验】（见 `docs/README.md`）。未验证就写未验证。
- **声称完成必须有工具输出支撑。** 仓库主人验收清单见 `docs/status.md`——清单未勾完之前，「闸全绿」不作为交付证据。
- **汇报时，「已知未做 / 只做了一半」必须与「已完成」并列**，不得只写在注释或 tooltip 里。
- 能定的先定，把否决权留给仓库主人；不要把问题清单推回给他。
- 探针（`spike/`）只写 `traces/`，`src/` 永不 import `spike/`。
- 换引擎的验证步骤与计划见 `docs/recommendation.md`。

## 四、阅读顺序（空上下文从这里进）

1. 本文件  
2. [`docs/status.md`](./docs/status.md) — 现行真相、验收清单、已拍板优先级  
3. [`docs/handover.md`](./docs/handover.md) — 运行方式、完成度三分、规矩与证据地图  
4. [`docs/capability-map.md`](./docs/capability-map.md) — coding-agent 能力全图（有/缺/结构空洞）  
5. [`docs/visual-guide.md`](./docs/visual-guide.md) — 做视觉前读  
6. [`docs/design-contract.md`](./docs/design-contract.md)、[`docs/design-critique.md`](./docs/design-critique.md)  
7. [`docs/recommendation.md`](./docs/recommendation.md)、[`docs/adapters/opencode-acp.md`](./docs/adapters/opencode-acp.md)  
8. 旧仓 `NIX\t3rra-core` **只读**：需要规则原文时读其 `AGENTS.md`、`docs/event-model.md`、`docs/adapters/acp.md`

## 五、开工前硬规矩（范式，不许绕）

1. **「已知未做 / 只做了一半」必须与「已完成」并列出现在汇报里。**  
   历史问题：死按键被写成 `<div>`，落在控件扫描范围外，再以「无悬空控件」作为交付证据。
2. **元素清单制**：`app/ui-manifest.json` 中每个可见/可点元素必须表态（`wired` 或 `static: 理由`）。  
   缺分类、清单陈旧、声称 wired 但代码无引用 → `npm run check:app` 失败。
3. **`wired` ≠ 可用（2026-09-23 范式）**  
   闸只证明「有引用」。控件诚实的定义是：**点击必有可观测结果——要么动作，要么可见错误**。  
   **禁止**在用户动作路径里静默 `return`（`if (…) return;` 不写 lastError/phase）。  
   这是 `＋ NEW` 在 6190ad4 后再次变成死键的直接原因（`facts.binary === undefined` 时无声退出）。  
   `check:app` 已禁止该 guard 形状。前置条件失败必须 `patch({ lastError, phaseNote })`。
4. **空态必须给出恢复动作**  
   清空列表 / 无会话 / 无引擎时，空态里必须有可点的下一步（如 `＋ CREATE SESSION`），  
   **禁止死胡同面板**——「没有入口能新建」是状态机缺陷，不是用户没看懂。
5. **状态合并，禁止整对象替换**  
   `facts = { … }` 整对象赋值会丢掉 `binary`/`cwd`，曾导致 NEW 静默失效。只允许 `patch` 合并。
6. **无头浏览器禁用**；不得声称看过渲染结果；交付界面 = 可打开路径 + 3–5 条「看什么」。
7. **不要在他人工作树上整文件回滚**（曾有 `git checkout --` 覆盖他人未提交改动的事故）。  
   回滚自己的改动前先看 `git status`，或先 `git stash` / 复制备份。

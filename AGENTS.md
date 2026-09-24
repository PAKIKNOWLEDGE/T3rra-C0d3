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
5. **中断（HALT）走 stdio `session/cancel` notification**，不走 HTTP `POST /session/{id}/abort`。  
   依据【实测】：`traces/opencode/opencode-acp-2026-09-24T10-34-39-594Z-cancel-notification.jsonl` —— 无 `id` 的 notification 在 53ms 内使在途 `session/prompt` 回 `stopReason:"cancelled"`。  
   旧结论「ACP 无中断能力」出自一个方法错误的探针（把 notification 当 request 发，得 `-32601`），据此建的 `acp --port` + 按路径分流结构已于 29f8ea0 删除。  
   HTTP `abort` 另有假成功问题【源码 + 实测】：不校验会话存在、恒返回 `true`。**不得把 HTTP 2xx 当作中断生效的证据。**
6. **产品目的 = 自用**（仓库主人 2026-09-24 确认）。因此「opencode 官方已有 app 与 TUI」不构成放弃理由；差异化对自用非必要条件。  
   派生的取舍顺序：**视觉层优先于后端存续**——界面必须留，大不了换引擎。故此条与 §三 的视觉层依赖闸同时生效。

## 三、工作规矩

- **文档用中文**；标识符、事件 kind、日志用英文（沿用 t3rra-core 约定）。
- **视觉改动**先读 [`docs/visual-guide.md`](./docs/visual-guide.md)。  
  硬约束仅四条：不许悬空控件、不许造事实（缺失写 absence）、无头浏览器禁用、信道与平台边界。  
  其余视觉内容允许重构；`docs/design-contract.md` §二 起是「当前做法」，不是戒律。  
  悬空控件的机检在 `npm run check:app`。
- **无头浏览器禁用**。不跑 puppeteer / playwright / jsdom，不跑 ark-ui 的 audit/capture。  
  界面交付 = 可打开的路径 + 3–5 条「看什么」，由仓库主人目视验收。**不得声称已看过渲染结果。**  
  **唯一例外（2026-09-24 登记）**：`test/**` 内允许用 jsdom 对 DOM **结构**做断言（节点、嵌套、属性），因为该禁令的成因是「代理声称看过渲染」，断言 `renderMarkdown` 产出 `<p>` 不属于该风险面。  
  边界：`app/` 产品代码与 `spike/` 探针**禁用** jsdom；且任何代理**不得**以 jsdom 结果作为「渲染已验收」的叙事——结构断言 ≠ 观感验收。
- **证据链必须可复现**（2026-09-24）。入库的每条 `traces/opencode/*.jsonl` 都要能由仓库内的 `spike/` 脚本重跑得到。  
  教训：`traces/opencode/*-halt-in-process.jsonl` 里的 `NOT_STOPPED_IN_WINDOW` 与 `idleSignal` 在现行 `spike/probe-halt-in-process.mjs` 中根本产生不出来（其 verdict 只有三个分支），  
  即该 trace 出自一个已丢失的脚本版本——**它的 verdict 字符串不可再作任何方向的解读**。  
  另一条：只有 TEMP 目录里的一次性脚本产出的 trace，等于没有证据。
- **视觉层不得依赖引擎层**，由 `npm run check:boundary` 机检（`app/src/ui/**`、`app/src/view/**` 不得 import `app/src/engine/**`、`app/plugins/**`、`app/src/main.ts`）。  
  这条是本仓库floor 的机械化形式：「界面必须留，大不了换后端」只有在依赖方向被强制时才是真的。
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
4. [`docs/engine-contract-audit.md`](./docs/engine-contract-audit.md) — **对引擎的假设哪些是错的**（接手必读，先于任何新功能）  
5. [`docs/capability-map.md`](./docs/capability-map.md) — coding-agent 能力全图（有/缺/结构空洞）  
6. [`docs/visual-guide.md`](./docs/visual-guide.md) — 做视觉前读  
7. [`docs/design-contract.md`](./docs/design-contract.md)、[`docs/design-critique.md`](./docs/design-critique.md)  
8. [`docs/recommendation.md`](./docs/recommendation.md)、[`docs/adapters/opencode-acp.md`](./docs/adapters/opencode-acp.md)  
9. 旧仓 `NIX\t3rra-core` **只读**：需要规则原文时读其 `AGENTS.md`、`docs/event-model.md`、`docs/adapters/acp.md`

**契约优先规矩（2026-09-24）**：本项目所有对 opencode 的接口假设**必须有源码或报文证据**，不得靠抓包反推。  
上游源码本地参考：`C:\DEV\develop\opencode`（只读）。新增/修改引擎交互前，先查该源码并在 `docs/adapters/opencode-acp.md` 登记 path:line 证据。

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

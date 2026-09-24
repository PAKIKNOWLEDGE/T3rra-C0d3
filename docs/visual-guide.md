# 视觉优化指南

> **读者**：做视觉优化的前端开发者/代理（需能读懂并重构代码）。  
> **分工**：硬约束写死；视觉本身只给方向与证据，**允许重构**。  
> 若有更好的方案，**换掉当前做法不构成回潮**，只要不违反 §1。

## 0. 目标

把 `app/` 推到 **ark 族 · complex 深度 · 仅暗色** 的工业信息系统水准，且**不许出现悬空控件**（§2）。视觉怎么做由执行者定。

## 1. 硬约束（仅此四条）

1. **不许有悬空按钮/控件**（定义与机检见 §2）。
2. **不许造事实**：屏上每个「事实」须能追到**一条事件或时钟**；缺失写 absence（`NOT STATED` / `NOT REPORTED` / `NOT ESTABLISHED`）。渲染层唯一数据来源是 `app/src/view/derive.ts` 的 `ConsoleView`。
3. **无头浏览器禁用**；**不许声称看过渲染结果**；验收归仓库主人——交付时给「可打开路径 + 看什么」。
4. **信道与平台**：Windows + WebView2、外壳按 Tauri 立项；`app/src/engine/transport.ts` 是唯一字节通道；**UI 不许认识事件词汇或引擎**（kind、相位名、引擎命令不进界面/外壳）。

除这四条外，其余均可讨论。

## 2. 「悬空控件」（可执行定义，不做审美判断）

满足任一条即悬空，**删除或补上真作用**：

- 点了无可观察结果（无 handler、空函数、注释写「以后再做」）；
- 指向的概念运行时不存在（例如写死 `ASK`——引擎模式只有 `build` / `plan`）；
- 显示值不来自数据（model 名、会话数、轮数等写死在界面）；
- 永远禁用且无可见原因文字；
- 声称尚未接上的能力（例如 HTTP 面未接却摆 `DIFF` 按钮）。

**机检**：`npm run check:app`  
① 每个 `<button>` / `<select>` 须有 `id` 且被 TS 引用；  
② 运行时词汇不得静态写死进界面。  
规则在 `tools/check-app.mjs`。另见 `app/ui-manifest.json` 元素清单。

## 3. 视觉方向、证据、自由度

**家族（ark · complex）**：近黑底、冷信号色、大面积舞台 + 边缘仪表、微标签（全大写 + 开放字距 + tabular 数字）、1px 装饰线、直角、一个大锚点 + 大量小字、装饰只做构图不做遥测。

**参考图（本机）**：

- `C:\DEV\develop\NIX\.grok\skills\ark-ui\assets\showcases\screenshots\ark-complex.png`
- `…\screenshots\mobile\ark-complex.png`
- `…\assets\promo\output\01-cover-landscape.png`、`03-depth-landscape.png`
- token 与配方：`…\ark-ui\assets\tokens\ark-ui.tokens.json`、`…\references\recipes.md`  
  （**只看不加载**：不跑该 skill 脚本、不进其工作流）

**反面参照**：[`design-critique.md`](./design-critique.md) —— endfield 风格六个问题：无舞台、四边盒子=后台味、无大数字锚点、只有直角没有切、展示字无人格、暗底放黄。

**当前基准**：`demo/ark-console.html`（已验收为范本级）——作对照，**不必逐像素照抄**。  
`app/` 目前是骨架级（层级对、未到范本级）。向范本水准推进，也允许做得更好。

**明确允许重构**：布局构图、层级节奏、type scale 与字距、色板取值（ark 气质内）、几何（切角/斜切/描边/角括号）、装饰层、动效编排，甚至舞台/档案栏/指令坞结构——只要 §1 不破。

**保留两条可验证底线**：

- 对比度：正文 ≥ 4.5:1；非文本 UI 边界 ≥ 3:1；**焦点环可见**（含填充色之上）。
- `prefers-reduced-motion: reduce` 下不动。
- 动效纪律（方向，非数值）：动 = 注意力，注意力是预算；**健康读数不动**；不为「好看」加动画。

## 4. 真实数据对照表（防悬空）

| 界面想显示 | 真实来源 | 注意 |
| --- | --- | --- |
| model / mode / effort | `configOptions`（`ConsoleView.options`） | 只渲染运行时清单；`effort` 仅部分模型有；模式仅 `build` / `plan` |
| 会话 id | `session/new` / `session/load` 响应 | |
| 会话列表、轮数 | `session/list` | 仅 `{sessionId, cwd, title, updatedAt}`，**无消息数** → 不许显示「多少轮」 |
| 审批 | `session/request_permission`，三档 `allow_once` / `allow_always` / `reject_once` | 默认配置不会来问（静默放行）；界面须能说清「为什么这次没问我」 |
| 思考 / 正文 / 工具 | `agent_thought_chunk` / `agent_message_chunk` / `tool_call(_update)` | 工具显示身份用 `title`（`kind` 实测不可信） |
| 用量 | `usage_update`（上下文填充）与 `PromptResponse.usage`（本轮） | **两个不同的量**，不许合成一个数字 |
| 未识别报文 | `ConsoleView.unmapped`（计数） | **不许猜成某个状态** |

更细清单与证据：`docs/adapters/opencode-acp.md` + `traces/opencode/`。

## 5. 工作流

1. 起服务：`$env:T3RRA_ENGINE="opencode"; npm run dev` → **`http://localhost:5191/`**
2. 主要改 `app/index.html`（token/CSS/结构）与 `app/src/ui/console.ts`（渲染）。  
   **不要动** `transport.ts` / `acp.ts` / `contract/events.ts` / `view/derive.ts`——除非有**契约层面**理由（先过 `rules-inherited.md` §五 变更纪律）。
3. 过闸：`npm run check:all`
4. 交付：给主人 **3–5 条「看什么」**，等其截图反馈后按像素改。**不得自行宣布视觉通过。**
5. 若视觉想法需要**新事实**：先溯源（能否追到事件）→ 再谈契约变更。

## 6. 已知未完成

- `app/` 是骨架观感：`app/index.html` 仅为范本子集（顶栏/舞台/档案栏/指令坞最简版）。
- **拉丁展示轨仍为平台字体**（Bahnschrift → Arial Narrow；可再分发展示字体未定）。CJK 已用随包 HarmonyOS Sans SC。
- 字法、几何、动效的具体数值可被更好方案替换——只要 §1 与 §4 成立。
- 静默判据（相位、节奏基线）**已实现**（`app/src/view/cadence.ts`）。
- 对话区已按验收 #5–#9 重做（回合、工具行、markdown、折叠）；观感待主人目视。

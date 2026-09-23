# 视觉优化指南（给前端能力更强的 agent）

> **面向谁**：来做视觉优化的前端 agent。前提是你能读懂并重构代码——**大概率比写这份指南的人更强**。
> **这份文件的分工**：**硬约束**写死（不许破）；**视觉本身**只给方向、证据和自由，**允许重构**。
> 也就是说：如果你有更好的视觉方案，**换掉现在的做法不叫"回潮"**，只要不违反 §1。

## 0. 一句话

把 `app/` 的观感推到它该有的水准——**ark 族 · complex 深度 · 只有暗色**的工业信息系统，
并且**不许出现悬空控件**（§2）。**视觉怎么做，你说了算。**

## 1. 硬约束（只有这四条不许破）

1. **不许有悬空按钮/控件**（定义与机读闸见 §2）。
2. **不许造事实**：屏幕上每一个"事实"必须能追到**一条事件或时钟**；缺失就写 absence
   （`NOT STATED` / `NOT REPORTED` / `NOT ESTABLISHED`）。渲染层唯一的数据来源是
   `app/src/view/derive.ts` 的 `ConsoleView`。
3. **无头浏览器禁用**；**不许声称看过渲染结果**；验收归**仓库主人的眼睛**——交付时给"可打开路径 + 看什么"。
4. **信道与平台**：Windows + WebView2、外壳按 Tauri 立项；`app/src/engine/transport.ts` 是唯一字节通道，
   **UI 不许认识事件词汇或引擎**（不许把 kind / 相位名 / 引擎命令泄进界面或外壳）。

除了这四条，**其余一切都是可商量的**。

## 2. "悬空控件"的定义（可执行；不做审美判断）

一个控件满足下面任一条，就是悬空，**必须删掉，或补上真作用**：

- **点了没有任何可观察结果**（没有 handler、handler 是空函数、注释写着"以后再做"）；
- **指向的概念运行时不存在**：例如写死一个 `ASK` —— 引擎的模式只有 `build` / `plan`；
- **显示的值不来自数据**：例如把某个 model 名、会话数、轮数直接写死在界面里；
- **永远禁用且不说明原因**（禁用必须有可见的原因文字，否则用户只会以为坏了）；
- **声称一个还没接的能力**：例如摆一个 `DIFF` 按钮，而 HTTP 面还没接。

**机读闸**：`npm run check:app` 会检查
① 每个 `<button>` / `<select>` 都有 `id` 且被 TS 引用（即真的接上了）；
② 运行时拥有的词汇没有被静态写死进界面。
两个检查都在 `tools/check-app.mjs`，规则简单到可以直接读。

## 3. 视觉：方向、证据、自由

**家族方向（ark 族 · complex）**：近黑底、冷信号色、大面积舞台 + 边缘仪表、
微标签（全大写 + 开放字距 + tabular 数字）、1px 装饰线、直角（无圆角）、
一个大锚点 + 一堆小字、装饰只做"构图"不做"遥测"。

**要看真的参考图**（这些图就在本机）：

- `C:\DEV\develop\NIX\.grok\skills\ark-ui\assets\showcases\screenshots\ark-complex.png`
- `…\screenshots\mobile\ark-complex.png`
- `…\assets\promo\output\01-cover-landscape.png`、`03-depth-landscape.png`
- token 与配方：`…\ark-ui\assets\tokens\ark-ui.tokens.json`、`…\references\recipes.md`
  （**只看不加载**：不要跑那个 skill 的脚本、不要进它的工作流）

**反面教材（别回去）**：`docs/design-critique.md` —— 旧 endfield 那套的六个病灶：
没有舞台（全是仪表）、四边盒子＝通用后台味、没有大数字锚点、只有直角没有"切"、
展示字体没有人格（正常字宽）、在暗底上放黄（用 ark 的骨架追 endfield 的皮）。

**当前基准**：`demo/ark-console.html` 是"视觉已经对味"的那一版，可以拿它当基准——
**但不必逐像素照抄**。`app/` 现在是骨架级观感（层级对、远没到范本级），
**把 `app/` 往这个水准推，并且允许你做得更好**。

**你可以重构的范围（明确授权）**：布局与构图、层级与节奏、type scale 与字距、
色板取值（在 ark token 的家族气质内）、几何（切角/斜切/描边/角括号）、装饰层、
动效编排、甚至可以换掉"舞台 / 档案栏 / 指令坞"这套结构——**只要 §1 不破**。

**但请保留两条可验证的底线**：

- **对比度**：正文 ≥ 4.5:1；非文本 UI 边界 ≥ 3:1；**焦点环必须可见**（含填充色控件之上）。
- **`prefers-reduced-motion: reduce` 下不动**。
- 另外一条来自反面清单的动效纪律：**动 = 注意力，注意力是预算**；**健康的读数不许动**；
  不要为了"好看"加动画。这条是方向，不是数值。

## 4. 你需要知道的"真实数据"（防悬空对照表）

| 界面想显示 | 真实来源 | 注意 |
| --- | --- | --- |
| model / mode / effort 档位 | `configOptions`（`ConsoleView.options`） | **只渲染运行时给的清单**；`effort` 只对"有 variants 的模型"出现；模式只有 `build` / `plan` |
| 会话 id | `session/new` / `session/load` 的响应 | |
| 会话列表、轮数 | `session/list` | **只给 `{sessionId, cwd, title, updatedAt}`，没有消息数** → 界面不许显示"多少轮" |
| 审批 | agent→client 的 `session/request_permission`，选项三档 `allow_once` / `allow_always` / `reject_once` | **默认配置下它不会来问**（静默放行）；界面要能说清"为什么这次没问我" |
| 思考 / 正文 / 工具 | `agent_thought_chunk` / `agent_message_chunk` / `tool_call(_update)` | 工具的显示身份用 `title`（`kind` 实测不可信） |
| 用量 | `usage_update`（上下文填充）与 `PromptResponse.usage`（本轮） | **是两个不同的量**，不许合成一个数字 |
| 未识别的报文 | `ConsoleView.unmapped`（计数） | **不许猜成某个状态** |

更细的清单与实测证据：`docs/adapters/opencode-acp.md` + `traces/opencode/`。

## 5. 怎么改（工作流）

1. 起服务：`$env:T3RRA_ENGINE="opencode"; npm run dev` → **`http://localhost:5191/`**
2. 主要动这两个文件：`app/index.html`（token / CSS / 结构）、`app/src/ui/console.ts`（渲染）。
   **不要动** `transport.ts` / `acp.ts` / `contract/events.ts` / `view/derive.ts`——
   除非你有**契约层面**的理由（那要先过 `rules-inherited.md` §五 的变更纪律）。
3. 过闸：`npm run check:all`（含 `check:app`、`check:demo`、`check:traces`、`check:docs`）。
4. 交付：给主人 **3–5 条"看什么"**，他截图回你，你**按像素改**。**不许自己宣布视觉通过。**
5. 如果某个视觉想法**需要一个新事实**：先过溯源（能不能追到事件）→ 再谈契约变更。

## 6. 已知未完成（别把这些当成"就该这样"）

- `app/` 是骨架观感：`app/index.html` 只是范本的一个子集（顶栏 / 舞台 / 档案栏 / 指令坞的最简版）。
- **拉丁展示轨仍是平台字体**（Bahnschrift → Arial Narrow；可再分发的展示字体还没定）。
  CJK 已经用随包的 HarmonyOS Sans SC。
- 字法、几何、动效的**具体数值**都可以被更好的方案替换——只要 §1 与 §4 成立。
- 静默判据（相位、节奏基线）**还没实现**：等它落地后，舞台会多出一块真正的主角内容
  （"卡了多久"的锚点），设计时请给它留位置。
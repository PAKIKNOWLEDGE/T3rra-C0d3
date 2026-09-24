# 现状与决定

**本文件是唯一允许记录「在做什么、决定了什么」的地方。** 按主题组织；条目过时就改或删。结构性说明（目录、通用规矩）见 [`AGENTS.md`](../AGENTS.md)。

## 代际

| 代 | 名字 | 状态 | 生效 |
| --- | --- | --- | --- |
| 旧 | `t3rra-core`（旧品牌 "T3rra Protocol"） | **弃用**：只读参考、规则出处 | 2026-09-23 |
| 现行 | **`t3rra-C0d3`** | **唯一工程树**（产品代码在 `app/`） | 2026-09-23 |

**命名**：对外只写 `t3rra-C0d3`。不再用裸 `t3rra` 指本项目，也不称 core（`C0d3` = leet 的 Code）。  
界面产品品牌另议，不在本表。

**叙事统一（2026-09-23）**：曾并存三套口径——A「只调研、工程在 core」、B「保 core 界面只换引擎」、C「重写、代码在 t3rra-C0d3」。**现仅 C 有效。**  
A 的载体 `current-state.md`、B 的载体 `recommendation.md` 已标【仅历史】并在文件头写明取代关系。与本表冲突时，以本表为准。

## 仓库主人验收清单（2026-09-23，主人提出、主人验收）

| # | 问题 | 状态 | 备注 |
| --- | --- | --- | --- |
| 1 | 中断（HALT）没有 | 待做 | ACP 无 `session/cancel`（实测 `-32601`）；HTTP 有 `POST /session/{id}/abort` → 需 HTTP 通道。当前真中断仅 `RESTART ⟲` |
| 2 | 会话列表 + 网页端删除 | **已修 · 仍待主人目视** | 整行=LOAD，`×`=删除；**打开页面不再自动 `session/new`**（曾一次打开就堆垃圾会话）。删除走引擎 HTTP；本机存储 `%USERPROFILE%\.local\share\opencode\`（主数据 `opencode.db`，另有 `storage/session_diff/ses_*.json`——**删后 diff 残留是否清掉【未验】**） |
| 2b | 打开即建垃圾会话 | **已修** | handshake 只 `initialize` + `session/list`；首条指令才 `session/new`（queued）；删当前会话不再自动再开 |
| 2c | BUILD/PLAN 点了像死 | **已修待目视** | 点击即乐观切换 `aria-pressed` 并本地改 `currentValue`，再发 `set_config_option`；缺会话时写 LAST ERROR |
| 2d | 舞台标题仍可能撑爆 | **已修** | `#topic` 单行 nowrap+ellipsis + `h1 max-height`；`shortTopic` 截到 28 字 |
| 3 | `02 EVENTS` 死按键 | **已修** | 真视图：原始事件日志 |
| 4 | `＋ NEW` 不明/死按键 | **已修** | 真动作：`session/new`（id 变更才清空旧流） |
| 5 | reasoning 不能收起 | **已修 · 主人已过** | thought 块可真折叠；对话区整批目视 **2026-09-23 通过** |
| 6 | 点输入框出现蓝框 | **已修 · 主人已过** | 焦点 = 左侧色条 + caret；输入框取消方框 outline |
| 7 | markdown 原样显示 | **已修 · 主人已过** | 最小安全渲染 `app/src/ui/markdown.ts`（只建 DOM）+ `test/markdown.test.ts` |
| 8 | 顶部走表数字太大 | **已修 · 主人已过** | 锚点 `clamp(42px, 5.5vw, 72px)`（原最大 152px） |
| 9 | 对话区像 Word 文档 | **已修 · 主人已过** | 回合分组 / 说话人 / 间距 / 工具行内嵌 / 时间戳；流为统一时间线。修过一次「整段指令塞进舞台 `h1` 撑爆标题」——现标题只取首行截断 |
| 10 | 审批无界面 | 待做 | 事件可收；三档选项渲成按钮并回包。默认配置下引擎不问（需 `permission.*="ask"`） |
| 11 | 闸门假阴性 | **已修** | 控件扫描 + `app/ui-manifest.json` 清单制（缺分类 / 陈旧 / 无引用 → 构建失败） |

**计数**：已修/已实现 **9**（#2–#9、#11），**待做 2**（#1 中断、#10 审批）。**#2 待主人目视勾选。**  
**优先级**：**#2 待验收** → **#10 审批** → **#1 中断**（HTTP 通道已具备，可共用 `POST /abort`）。  
**汇报要求**：「已知未做」必须与「已完成」并列；清单未勾完前，「闸全绿」不作为交付证据。

## 范式更新（2026-09-23，死键二次回潮后）

**审计**：`＋ NEW` 由上一任 `6190ad4`（Stop the dead keys）引入并自称已修死键；本会话沿用同一静默 guard（`facts.binary === undefined` 时 `return`），清空会话后再次变成死键。**`wired` ≠ 可用。**

| 范式 | 内容 | 落点 |
| --- | --- | --- |
| 控件诚实 | 点击必有可观测结果：动作或可见错误；禁止静默 `return` | `AGENTS.md` §五.3；`check:app` 禁 `if (…) return;` |
| 空态不死胡同 | 清空列表/无会话/无引擎必须给出恢复动作 | `sessionsList` 空态 `＋ CREATE SESSION` |
| 状态合并 | 禁止 `facts = {…}` 整对象替换（会丢 binary/cwd） | `main.ts` restart 只 `patch` |
| 失败可恢复 | `session/new`/`load` 失败必须恢复输入框 | `handleLine` error 路径 |

**事故**：仓库主人清空全部会话后无入口新建；`＋ NEW` 与「直接输入」均静默失效。

## 开放项（本轮观察，未排期）

### 网页端粘贴图片（可能不必先上 Tauri）

- **事实**：opencode CLI 自身支持粘贴图片；本仓库网页输入框**尚无**图片粘贴/附件 UI。
- **引擎面**【实测】`promptCapabilities.image: true`（见 [`adapters/opencode-acp.md`](./adapters/opencode-acp.md)）：图片随 prompt 本地附件，ACP 面可带图。
- **是否要 Tauri**【未验】：浏览器侧 `paste` / `File` API 在 WebView2/Chrome 通常够用，**未必**要壳；Tauri 更多是给以后原生拖放、剪贴板深层权限、打包时再确认。  
  **结论先记着：功能缺口在网页 UI，外壳依赖未证实——标开放，不进本轮代码。**

## 已确认的四条边界（2026-09-23，仓库主人）

1. **继承规则，不继承代码**  
   规则原文只读对照旧仓（`AGENTS.md` §二、`docs/event-model.md`、`docs/adapters/acp.md`），**旧仓不许写**（工作树脏）。  
   本仓「现行有效规则」在 [`rules-inherited.md`](./rules-inherited.md)（含 §二 8–9、22–25）；视觉 13–18 由 [`design-contract.md`](./design-contract.md) 取代。  
   旧仓代码 / 测试 / traces **不进 `app/`**。
2. **平台**  
   主平台 **Windows + WebView2**，外壳 **Tauri**，第一版验收仅 Windows；**NixOS 为 P2**（不做、不排除，不写「仅 Windows」）。  
   架构约束：壳只搬字节、不认识事件词汇；引擎定位 **PATH → 已知安装位置 → 手填**；禁写死主机路径；字体栈保留非 Windows 回退。
3. **重写范围**  
   **只继承规则与数据形状，实现全部新写。** 禁止 import / 复制旧仓 `state.ts`、`derive.ts`、`acp.ts`、`events.ts` 等实现。  
   允许对照抄走的只有语义与形状（事件/会话折叠、`from` 溯源、相位与静默判据数值）。
4. **验收**  
   **机读清单 + 主人抽查。** 机读：无重复 id、无悬空 class、文档相对链接可解析、文档声称的 kind ⊆ traces。  
   渲染观感 / 布局 / 动效 / 对比度终判归主人目视。**无头禁令有效。**

## 工程闸门

提交前 `npm run check:all` 必须全绿：

| 闸 | 命令 | 内容 |
| --- | --- | --- |
| 类型 | `npm run check` | `tsc --noEmit`（strict，覆盖 `app/` 与 `test/`） |
| 单测 | `npm test` | vitest |
| 控件/元素 | `npm run check:app` | 控件 id 接线、禁止词、`ui-manifest.json`、字体引用、渲染层 id |
| 范本 | `npm run check:demo` | 自包含、无重复 id、JS 引用齐全、无悬空 class、reduced-motion、内联脚本可解析 |
| 文档↔报文 | `npm run check:traces` | 适配器表中【实测】须有 trace；trace 中 kind 须在表中 |
| 文档链接 | `npm run check:docs` | 相对链接可解析 |

**规矩**：闸红不许提交；**不许为变绿而放宽闸**——改结论或补证据。

## 第一版里程碑（2026-09-23，主人实机确认）

**`app/` 可跑：引擎 = opencode（ACP），发一句话、流式上屏正常。**

```
npm install
npm run dev                                   # 默认引擎 opencode → http://localhost:5191/
# 需要时：$env:T3RRA_ENGINE="omp"; npm run dev
npm run check:all
```

| 层 | 验证方式 | 结果 |
| --- | --- | --- |
| 引擎 × ACP | `node spike/spike-acp-opencode.mjs --prompt --model <free-model>` | 真 prompt 流式、`end_turn`、免费模型 |
| 桥 × HTTP SSE | `node spike/probe-sse-http.mjs`（`node:http` 读 SSE） | initialize / session/new 正常 |
| 桥 × adapter × reducer | `node spike/probe-app-pipeline.mjs` | 流式 thought/message → `stopReason` |
| SSE × DOM | **主人目视** `http://localhost:5191/` | 2026-09-23 确认正常 |

**已知坑**：用 `fetch()` body reader 读长连接 SSE 会被 undici 压住，会伪造出「引擎沉默」。测 SSE 用 `node:http` 或 `EventSource`（应用用后者）。

## 引擎成熟度（2026-09-23，本机实测）

**够用级，非稳定级。** 风险在大版本破坏与 HTTP 面；本项目走 ACP，避开后者。

- **可用**：ACP v1 一致；capability 声明诚实；session new/load/fork/resume/list；`load` 回放规范（先流后响应）；图片随 prompt 本地走；MIT。
- **需盯**：① v1→v2 有意破坏，锁 1.18.x；② HTTP/SSE 文档自述 volatile——本项目未用，但 diff/revert/form/fs/pty 仅在该面；③ ACP 无 `thinking`（对应 `effort`，仅部分模型有）；`modes` 为 null，模式仅 `build`/`plan`；`session/list` 无消息数；④ 审批须 `permission.*="ask"` 才会询问，默认放行。
- **未验**：v2 HTTP 断连/溢流、`allow_always` 持久化、`usage_update` 字段是否即上下文填充率。

## 待补清单

| 优先级 | 类别 | 缺口 |
| --- | --- | --- |
| **P0** | 产品 | **验收 #2 已实现待目视**：会话列表 + 网页删除（`session/list` + HTTP `DELETE`） |
| P1 | 产品 | 审批三档界面（#10）；断链/错误态；多会话 |
| P2 | 产品 | HALT（#1；HTTP 透传已具备，`POST /session/{id}/abort`） |
| 开放 | 产品 | 网页粘贴图片（见上「开放项」；引擎 image capability 已实测有，UI 未做；**Tauri 依赖未证实**） |
| P2 | 工程 | Tauri 外壳（替换 `app/plugins/engine-bridge.ts`，`src/` 不动）；打包；Latin 展示轨仍用平台字体（可再分发展示字体未定） |
| — | 契约 | 显式 schema 版本号与变更纪律（规则 23） |
| — | 平台 | Windows ✓；NixOS = P2（WebKitGTK 见 `adapters/opencode-acp.md` §六.6） |

静默判据与对话区 #5–#9：**已实现并主人目视通过**（见验收表）。

## 静默判据（规则 7–9）与中断实测

**静默判据已实现**：`app/src/view/cadence.ts` + `test/cadence.test.ts`（10 例）。

- 基线 = 当前相位已测间隔的**中位数**；`×8` slow、`×25` stalled；**样本 &lt; 3 拒绝给判据**（`NOT ESTABLISHED`）；10 分钟硬上限仅兜底并标注 `HARD LIMIT EXCEEDED`，不冒充测量。
- **间隔按相位分账**（等待 / 流式 / 工具）；非运行期间丢弃；**换 model 丢样本**（规则 9）；新会话重置。
- 界面：运行时大锚点 = 静默秒数；判决 `Stalled / Slow / Nominal / Not Established`；右栏 `[ SIGNAL ]`（LEVEL / QUIET / BASELINE / SAMPLES n/3 / THRESHOLDS / LAST SIGN）。不运行时不判，锚点回会话秒表。

**中断**：ACP 面 `session/cancel` **不存在**（`-32601`，探针 `spike/probe-session-cancel.mjs`，trace `traces/opencode/*-cancel-probe.jsonl`）。  
HTTP 面有 `POST /session/{sessionID}/abort`、`POST /api/session/{sessionID}/interrupt`（本地 OpenAPI）。  
→ 当前唯一真中断是 `RESTART ⟲`；做 HALT 须接 HTTP 通道（同时解锁 diff / revert / pty）。

## 视觉分工

- **[`visual-guide.md`](./visual-guide.md)**：面向视觉改动。硬约束仅四条，其余明确允许重构。
- **`design-contract.md`**：锁定仅族 / 深度 / 暗色 / 平台；§二 起为可替换做法。
- **悬空控件机检**：`npm run check:app`——① button/select/input 须有 id 且被 TS 引用；② 运行时词汇不得静态写死在界面。其余「点了是否有合理反应」只能目视。

## 视觉第 2 代已接入 `app/`（2026-09-23）

**已接入**（视觉照搬样张，内容层只留真数据）：三层灰阶底、四档边线、字体轨（宽展示字 + Instrument Sans + IBM Plex Mono + 打字机轨 + HarmonyOS CJK）、角括号 HUD、`◆/◇`、反相 hover、记录戳、扫描分隔线、45° 切角、150–300ms 无弹跳。字体随包：`app/fonts/`（38 文件，许可见 `app/fonts/README.md`；闸检查字体引用是否齐全）。

**故意未接入（非遗漏）**：

| 样张有 | 未接入原因 | 解锁条件 |
| --- | --- | --- |
| 顶部 STALLED/IDLE/LOST/APPROVAL 状态条 | 样张 chrome；产品状态须由真引擎驱动 | — |
| 步骤带（01/02/03） | 「步骤」概念不在契约内 | 相位模型/步骤模型落地 |
| 扫描线坐标数字 | 装饰不带假遥测（分隔线保留，数字删） | — |
| `▶ HALT` | ACP 无 cancel（已实测），先不给按钮 | HTTP abort 通道 |
| 状态条外大锚点语义 | 现锚点为真实时钟；判决词为真实相位；比较行 `SILENCE NOT MEASURED` | 静默判据（已落地） |
| 会话切换 / EVENTS | 会话管理未做 | `session/list` + `session/load`（回放已实测可用） |

**真实交互**：`OPERATOR / EXPERT` 语域（EXPERT 显示 `[ TRANSPORT ]`：binary/cwd/exit/last error/unmapped/provenance）。舞台主标题 = 操作者指令的**首行短主题**（无则 absence；完整指令在流内）。  
**证据**：`npm run check:all` 六道闸通过；`spike/probe-app-pipeline.mjs` 跑通 thought → message → usage → `stopReason`。**渲染观感归主人目视。**

## 引擎与其它决定（2026-09-23）

- 工程写在 `C:\DEV\develop\t3rra-C0d3`，产品代码在 `app/`。`NIX\t3rra-core` 为上一代，改前先问主人。
- **引擎 = opencode（ACP v1）**。依据：`docs/adapters/opencode-acp.md` + `traces/opencode/` + `spike/`。四条核心判据已闭合（报文存在性、options、`session/load`、审批）。
- **界面 = ark 族 · complex · 仅暗色**，见 `docs/design-contract.md`；范本 `demo/ark-console.html`。
- **继承规则不继承代码**；实现新写。

## 2026-09-23（晚）：对话区 A 批 + 主人过验

- **文档全面翻新**：去掉代理人叙事口吻；`status` / `handover` / `AGENTS` 等按主题重写；过时假话（cadence 计数、cancel 未实测、静默未实现等）已改。
- **阶段 0**：引擎默认序改为 **opencode 优先**（`T3RRA_ENGINE=omp` 可退回）。
- **A 批 #5–#9 已实现**并 `check:all` 全绿（45 单测）；**主人目视「通过」**。
  - 舞台标题曾把整段指令塞进 `h1` 撑爆布局 → 已改为首行截断 + `h1` 两行钳制。
- **下一优先（主人）**：**#2 会话列表 + 删除**；开放项：网页粘贴图片（见上）。

## 2026-09-21（历史）

- 后端对比：`docs/recommendation.md`；界面契约与范本三方盲审：`docs/design-contract.md`、`docs/design-review.md`。
- 范本经三方盲审（主审 + 视觉 + 可用性），修判决语域、动作语义、可访问性、字法几何、窄窗口；未修项见 `design-review.md` §六/§七。

## 事故记录（保留）

- **2026-09-23**：在 `NIX\t3rra-core` 执行 `git checkout -- plugins/omp-bridge.ts` 时，覆盖了该文件中**他人 338 字节未提交改动**（无法从 git 恢复；无 stash、无 dangling blob）。已提交历史未受影响。  
  教训：改他人工作树前先看 `git status` 字节数；不要用整文件 checkout 回滚自己的改动。

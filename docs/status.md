# 现状与决定

**这份文件是唯一允许写"我在做什么、决定了什么"的地方。** 每条带日期；过时就改、就删，
不要让它变成会撒谎的化石。结构性的东西（哪里有什么、什么规矩）写在 `AGENTS.md`。

## 代际（先看这张表；它是机器可读的硬事实）

| 代 | 名字 | 状态 | 从何时起 |
| --- | --- | --- | --- |
| 旧 | `t3rra-core`（旧品牌写成 "T3rra Protocol"） | **弃用**：只读参考，规则出处 | 2026-09-23 |
| 现行 | **`t3rra-C0d3`** | **唯一工程树**（产品代码住这里） | 2026-09-23 |

**命名规则（废除混用）**：工程对外只写 `t3rra-C0d3`。文档里不再用裸 `t3rra` 指代本项目，
也不再把它叫 core（`C0d3` 是 leet 的 **Code**，不是 core）。
界面上的**产品品牌**（屏幕上那几个字）是另一件事，不在这里定。

**叙事止血（2026-09-23）**：这棵文档树上曾同时活着三套叙事——
A「只调研不放码，工程在 core」、B「保留 core 界面只换引擎的小手术」、C「整个重写，代码住 t3rra-C0d3」。
**现在只有 C 有效**：A 的载体（`current-state.md`）与 B 的载体（`recommendation.md`）都已标【仅历史】并在文件头写明取代关系；
任何与此冲突的句子，以本文件的代际表为准。

## 2026-09-23

### 工程闸门（写产品代码之前先立起来）

四道闸都在 `npm run check:all` 里，**提交前必须全绿**：

| 闸 | 命令 | 管什么 |
| --- | --- | --- |
| 类型 | `npm run check` | `tsc --noEmit`（strict；覆盖 `app/` 与 `test/`） |
| 单测 | `npm test` | vitest（9 条：引擎解析次序、trace 采集、文档解析、范本静态规则） |
| 范本 | `npm run check:demo` | 自包含 / 无重复 id / JS 引用的 id 都在 / 无悬空 class / reduced-motion / 内联脚本可解析 |
| 文档↔报文 | `npm run check:traces` | 适配器表里每条【实测】都必须有 trace 垫底；trace 里出现的 kind 必须在表里 |

**规矩**：闸红了不许提交；**不许为了让闸变绿而放宽闸**——要么改结论，要么补证据。
`check:traces` 第一次运行就是靠这条抓出我两处"只在控制台输出、没落盘"的结论。

### 盲审（2026-09-23）指出的问题与处置

| 盲审条目 | 处置 |
| --- | --- |
| 文档多真相源、三套叙事并存 | **已止血**：代际表 + 单一权威（本文件）+ 历史文件打【仅历史】标签 |
| 零工程闸门 | **已建**：见上表，四道闸全绿 |
| "实测"有两条没落盘（`effort`、load 时序） | **已补证据**（不是改小结论）：探针现在把 `load_timing` 与逐模型 option 清单写进 trace，文档引用该 trace |
| 范本模式组与引擎脱节（`ASK/DO/PLAN` vs 引擎的 `build/plan`） | **已改**：范本改成 `BUILD / PLAN`，并注明清单来自运行时、界面只渲染 |
| 跨仓探针依赖旧仓 dev bridge | **已删** `spike/probe-bridge-opencode.mjs`（重写后的应用会有自己的传输层检查） |
| 单点故障（验收只靠人眼） | **部分处置**：可机读的部分已清单化（重复 id / 悬空 class / 引用齐全 / 文档对账）；**渲染观感永远归人眼**（无头禁令不变） |
| 四件事没人拍板 | **仍待拍板** ↓ |

### 待仓库主人拍板（盲审逼出来的四件）

1. **"继承规则、不继承代码"是否确认**（规则原文在旧仓 `AGENTS.md` §二、`docs/event-model.md`、`docs/adapters/acp.md`）。
2. **目标平台是否只有 Windows**（决定外壳选型成不成立；Linux/WebKitGTK 的坑见 `adapters/opencode-acp.md` §六.6）。
3. **重写范围**：新的 `AgentSource` 是否复用旧仓的 `state.ts` / `derive.ts`
   （建议：**只继承规则与数据形状，实现新写**——旧实现与旧引擎的怪癖绑在一起）。
4. **验收方式**：是否接受"机读清单 + owner 抽查"来打破纯人眼单点（渲染观感仍归人眼）。

### 仓库主人确认的四条边界（2026-09-23，当面确认）

1. **继承规则、不继承代码**：规则原文只读对照旧仓（`AGENTS.md` §二 1–25、`docs/event-model.md`、
   `docs/adapters/acp.md`），**旧仓绝对不许写**（工作树是脏的）。
   本工作区的「现行有效规则全集」在 [`rules-inherited.md`](./rules-inherited.md)（含 §二 8–9、22–25 这些
   原先漏掉的条目），其中视觉 13–18 声明由 [`design-contract.md`](./design-contract.md) 取代。
   旧仓的**代码 / 测试 / traces 都不进 `app/`**。
2. **平台**：主平台 **Windows + WebView2**，外壳按 **Tauri** 立项，第一版验收**只含 Windows**；
   **NixOS 登记为 P2**（现在不做、也不排除，不写成"仅 Windows"）。跨平台打包那天再重审 WebKitGTK 的账。
   架构上现在就要守：**壳只搬字节、不认识事件词汇**；引擎定位顺序 **PATH → 已知安装位置 → 手填**，
   **禁止写死主机路径、路径用可移植拼接**；字体栈保留非 Windows 回退。
3. **重写范围**：**只继承规则与数据形状，实现全部新写**。禁止 import / 复制旧仓
   `state.ts` / `derive.ts` / `acp.ts` / `events.ts` 等实现。允许对照抄走的只有语义与形状
   （事件与会话折叠的数据形状、`from` 溯源约定、相位与静默判据的数值）。
   理由：旧实现与 omp 怪癖、Endfield 渲染、脏工作树缠在一起，**搬文件 = 搬坑**。
4. **验收**：**机读清单 + 主人抽查**。机读部分（无重复 id、无悬空 class、文档相对链接可解析、
   文档声称的 kind ⊆ traces 实际 kind）进 script；**渲染观感/布局/动效/对比度终判归主人的眼睛**；
   **无头禁令不动**，交付界面时给可双击路径 + 人话说明看什么。

### 第一版里程碑达成（2026-09-23，仓库主人实机确认）

**`app/` 已可跑：引擎 = opencode（ACP），发一句话、流式上屏正常。** 打开方式：

```
npm run dev              # 默认顺序（omp 优先）；本项目用：
$env:T3RRA_ENGINE="opencode"; npm run dev     # → http://localhost:5191/
```

链路证据（三层，逐层可复现）：

| 层 | 怎么验 | 结果 |
| --- | --- | --- |
| 引擎 × ACP | `node spike/spike-acp-opencode.mjs --prompt --model <free-model>` | 真 prompt：17 条 update、`end_turn`、免费模型零成本 |
| 引擎 × 应用的 dev bridge | `node spike/probe-sse-http.mjs` | 纯 `node:http` 读 SSE：initialize 3.8s、session/new 4.9s 到帧（**桥是好的**） |
| 桥 × adapter × reducer | `node spike/probe-app-pipeline.mjs` | prompt → 57s 起流出 thought/message chunk → `stopReason` 返回 |
| SSE × DOM | **主人的眼睛**（`http://localhost:5191/`） | **正常**（2026-09-23 确认） |

**教训（写进探针文件头）**：用 `fetch()` 的 body reader 读长连接 SSE 会被 undici 压住，
会伪造出"引擎沉默"的假象——测 SSE 用 `node:http`，或直接用 `EventSource`（应用就是这么做的）。

### runtime 成熟度评估（2026-09-23，全部基于本机实测）

**结论：够用的"能用"级，不是"成熟稳定"级。** 风险集中在大版本破坏与 HTTP 面，而我们走 ACP 面正好避开后者。

- **成熟的地方**：ACP v1 一致；capability 声明诚实；session 的 new/load/fork/resume/list 都在；
  `load` 回放规范（先流后响应）；图片随 prompt 本地走、不上传；MIT。
- **要盯的地方**：① v1→v2 是**故意的破坏点**，我们锁 1.18.x，升级要跟着迁移指南走；
  ② HTTP/SSE（`/api/event`）文档自述 volatile——**我们没用它**，但 diff / revert / form / fs / pty 只在那一面；
  ③ ACP 面缺 `thinking`（对应物是 `effort`，且只对有 variants 的模型出现）；`modes` 为 null、模式只有 `build`/`plan`；
  `session/list` 不带消息数；`session_info_update` 未出现；
  ④ 审批**必须配置** `permission.* = "ask"` 才会来问，默认静默放行。
- **未验**：v2 HTTP 的断连/溢流行为、`allow_always` 的持久化语义、`usage_update` 字段是否即上下文填充率。

### 还差什么

| 类别 | 缺的东西 |
| --- | --- |
| 产品功能 | 会话列表/恢复（`load` 已实测可用，纯界面活）；审批做成一等界面（三档 `allow_once`/`allow_always`/`reject_once`）；断链/错误态；多会话 |
| **静默判据** | 相位与节奏基线（规则 7–9 的数值）**尚未实现**——这是"看 agent 卡没卡"的核心，下一块大头 |
| 工程 | Tauri 外壳（替换 `app/plugins/engine-bridge.ts`，`src/` 不动）；打包；Latin 展示轨仍用平台字体（可再分发字体未定） |
| 契约 | 显式 schema 版本号与变更纪律（规则 23） |
| 平台 | Windows ✓；NixOS = P2（WebKitGTK 的账记在 `adapters/opencode-acp.md` §六.6） |

### 视觉迭代的时机（回答：**现在就迭代，别等 Tauri**）

- 视觉迭代只动 `app/index.html` 的 token/CSS/布局与 `app/src/ui/console.ts` 的渲染；
  Tauri 换掉的只是 `app/src/engine/transport.ts` 那一层**字节通道**，`src/` 不动（架构承诺）。
- 而且**现在有真数据**：用真引擎、真流式迭代比拿静态范本准，也不用再维护两份东西。
- 边界：**可以随便改视觉，但不要为视觉去改事件契约**（规则 25：冻结渲染层输入契约）。
  若新视觉要求一个新事实 → 先过溯源（能不能追到事件）→ 才谈契约变更。
- 建议顺序：**视觉 1.0（拿 `demo/ark-console.html` 当基准，把 token/几何/动效移植进 `app/`）**
  → Tauri 外壳（只换通道）→ 功能（会话列表/审批/静默判据）→ 期间视觉继续小步迭代。

### 文档分工修正（2026-09-23，仓库主人要求）

视觉这件事以前被写成了铁律，那是错的。现在的分工：

- **[`visual-guide.md`](./visual-guide.md)**：给"前端能力更强的 agent"的视觉优化指南。
  **硬约束只有四条**（① 不许悬空控件 ② 不许造事实/缺失写 absence ③ 无头禁用、验收归主人眼睛
  ④ 信道与平台边界），其余视觉内容**明确授权重构**；并附"防悬空"的真实数据对照表。
- **`design-contract.md`**：锁定项只剩**族 / 深度 / 暗色 / 平台决定**；§二 起（色板数值、字体栈、
  构图、几何、动效）都是**做法，可替换**。
- **"悬空控件"的可机检部分**：新增 `npm run check:app`——① 每个 button/select/input 必须有 id
  且被 TS 引用（真的接上了）；② 运行时词汇（`ASK`/`DO`/`PLAN`/`BUILD`/`EFFORT`/`THINKING`/
  `DIFF`/`REVERT`/`PTY`/`TODO`/`SUBAGENT`）不许作为静态文字出现在界面里。
  剩下的"点了有没有合理反应"只有眼睛能判。

### 视觉第 2 代接进 `app/`（2026-09-23，仓库主人要求"接进主仓库用用看"）

**接进去的**（视觉层照搬样张 `tmp/demo/ark-console-v2.html`，内容层只留真数据）：
底色改三层灰阶（**不用纯黑**）、边线四档、字体轨换成"宽展示字 + Instrument Sans + IBM Plex Mono +
**打字机存档轨** + HarmonyOS CJK"、角括号 HUD 面板、`◆/◇` 菱形、反相 hover、记录戳、扫描分隔线、
45° 切角（活动格/主操作）、动效 150–300ms 无弹跳。字体随包进仓库：`app/fonts/`（38 个文件，
见 `app/fonts/README.md` 的许可表；闸会检查字体引用是否齐全）。

**故意没接的（每条都有理由，别当成漏了）**：

| 样张里有 | 为什么产品里没有 | 解锁需要 |
| --- | --- | --- |
| 顶部 `STALLED/IDLE/LOST/APPROVAL` 状态条 | 那是**样张展示用 chrome**；产品里这些态由真引擎决定，摆一个不由数据驱动的切换器就是悬空控件 | —— |
| 步骤带（01/02/03 + `7 MATCHES`） | "步骤"这个概念在契约里还不存在 | 静默判据 / 相位模型落地 |
| 扫描线上的坐标数字 | **装饰不许带假遥测**（分隔线保留，数字删） | —— |
| `▶ HALT` 中断按钮 | ACP 的 `session/cancel` **还没实测**，先不给按钮 | 一次零成本探针 |
| 状态条之外的大锚点语义 | 现在锚点是**时钟**（真实）；判决词是真实相位（`Idle/Ready/Running`），比较行明写 `SILENCE NOT MEASURED` | 静默判据（规则 7–9） |
| 会话切换 / EVENTS 视图 | 视图与会话管理还没做 | 会话列表 + `session/load`（回放已实测可用） |

**新增的真实交互**：`OPERATOR / EXPERT` 语域（EXPERT 才显示 `[ TRANSPORT ]`：binary/cwd/exit/
last error/unmapped/provenance）——这是纯展示层，接线在 `console.ts`，闸确认已接。
舞台主标题 = **操作者自己的指令**（我们真正持有的"任务主题"事实）；没有指令时显示 absence。

**本轮证据**：`npm run check:all` 六道闸全绿（tsc · 19 单测 · 5/5 控件接线 + 字体 38/38 ·
范本静态 · 文档↔报文 · 文档链接）；`spike/probe-app-pipeline.mjs` 用免费模型跑通：
thought 流式 → `agent_message_chunk`("ok") → `usage_update`（按 COUNTED 记）→ 响应带 `stopReason`。
**渲染观感仍归主人的眼睛**（无头禁令不变）。

### 静默判据落地 + 中断的实测结论（2026-09-23）

**静默判据（规则 7–9）已实现并有测试**：`app/src/view/cadence.ts`（纯函数，时钟注入）+ `test/cadence.test.ts`（11 例）。

- 基线 = **当前相位**已测间隔的**中位数**；`×8` 记 slow、`×25` 记 stalled；**样本 < 3 一律拒绝给判据**
  （显示 `NOT ESTABLISHED`）；10 分钟硬上限**只作兜底**，并且明确标出来（`HARD LIMIT EXCEEDED`），不冒充测量。
- **间隔按相位分账**（等待 / 流式 / 工具）：规则 8 说间隔归给"等待期间活跃"的相位，所以首字延迟与工具节奏
  不能共用一个基线。**这一条是测试抓出来的**——我最初把各相位混进一个样本表，4 条测试当场变红。
- 非运行期间的间隔丢弃；**换 model 丢样本**（规则 9）；新会话重置。
- 界面效果：运行时**大锚点变成"静默秒数"**，判决词给 `Stalled / Slow / Nominal / Not Established`，
  比较行给 `QUIET Ns · USUALLY Xms · ×R`；右栏新增 `[ SIGNAL ]` 面板（LEVEL / QUIET / BASELINE /
  SAMPLES `n/3` / THRESHOLDS / LAST SIGN）。**不运行时不判**，锚点退回会话秒表。

**中断的实测结论**：`session/cancel` 在 ACP 面**不存在**（`-32601 Method not found`，探针
`spike/probe-session-cancel.mjs` 实测，trace 在 `traces/opencode/*-cancel-probe.jsonl`）。
HTTP 面有 `POST /session/{sessionID}/abort` 与 `/api/session/{sessionID}/interrupt`（本地 OpenAPI 导出里查到的）。
→ **所以现在坞里唯一真中断是 `RESTART ⟲`（杀进程重开）；要做 HALT，得先接 HTTP 通道**
（那一步同时解锁 `diff` / `revert` / `pty`）。

### 仓库主人的验收清单（2026-09-23，**他本人提出、他本人验**）

这张账存在的理由：同一轮里，我把三个 rail 项写成 `<div>`，正好躲过我自己的 `check:app`
（它只扫 `button/select/input`），然后拿"5/5 控件接线、无悬空控件"当交付证据。
**闸防的是我自己的声称，不是他的体验**；这张账换过来：**条目来自他的体验，勾选权在他手里。**

| # | 他提的问题 | 状态 | 备注 / 卡在哪 |
| --- | --- | --- | --- |
| 1 | 中断（HALT）没有 | 待做 | ACP 无 `session/cancel`（实测 `-32601`）；HTTP 有 `POST /session/{id}/abort` → 需接 HTTP 通道。当前真中断只有 `RESTART ⟲` |
| 2 | 会话列表 + **在网页端删除会话** | 待做 | `session/list` 在 ACP 面可用；删除在 HTTP 面（`DELETE /session/{sessionID}`，本地 OpenAPI 实测存在） |
| 3 | `02 EVENTS` 是死按键 | **已修（本轮）** | 真视图：原始事件日志（真实数据） |
| 4 | `＋ NEW` 是什么、也是死按键 | **已修（本轮）** | 真按键：起新会话（`session/new`） |
| 5 | reasoning 不能收起 | 待做 | 需要可折叠的思考块（真折叠，不是装饰） |
| 6 | 点输入框出现蓝框 | 待做 | 焦点指示要保留（可访问性），但改成非方框：左侧色条 + caret |
| 7 | markdown 语法原样显示 | 待做 | 需要最小安全渲染（只建 DOM 节点，绝不注入 HTML/脚本） |
| 8 | 顶部走表数字太大 | 待做 | 缩小锚点字号 |
| 9 | 对话区像 Word 文档，不像 agent 交互界面 | 待做 | 重做流式渲染：回合分组 / 说话人 / 间距 / 工具行 / 时间 |
| 10 | 审批（approval）没有界面 | 待做 | ACP 事件已能收到；要把三档选项渲成按钮并回包 |
| 11 | 闸门是假阴性（防的是谁） | **已修（本轮）** | `check:app` 现在会抓"看着能点但不是控件"的元素；跑出来正好命中那三个 rail 项 |

**规矩**：我下次汇报时，**"已知没做/已知只做了一半"必须与"已完成"并列出现**，
不许只写进代码注释或 tooltip。这张账没勾完之前，任何一个"闸全绿"都不算交付证据。

### 本轮其它决定

- **工程写在本工作区**（`C:\DEV\develop\t3rra-C0d3`），产品代码的落点 `app/`。
  `NIX\t3rra-core` 是上一版实现，改它之前先问仓库主人。
- **引擎方向：opencode**（ACP v1）。依据不是推测而是本机实测：`docs/adapters/opencode-acp.md`
  与 `traces/opencode/`、`spike/`。四个核心判据已闭合（报文存在性、options、`session/load` 回放、审批）。
- **界面标准：ark 族 · complex · 只有暗色**，以 `docs/design-contract.md` 为准（含 2026-09-21 的修订），
  范本是 `demo/ark-console.html`。
- **继承的是规则，不是代码**：溯源契约、静默判据、absence 规则、无头禁令、证据分级、specimen-first 验收，
  这些从上一版的文档里继承；实现要新写。
- **待仓库主人确认**：① 上面的"继承规则不继承代码"是否就是要的做法；
  ② 目标平台是否只有 Windows（影响外壳选型；Linux/WebKitGTK 的坑见 `docs/adapters/opencode-acp.md` §六.6）。

## 2026-09-21

- 后端结论与对比：`docs/recommendation.md`；界面契约与盲审：`docs/design-contract.md`、`docs/design-review.md`。
- 范本经历一轮三方盲审（我 + 视觉审 + 可用性审），修了判决语域、动作语义、可访问性、字法几何、窄窗口；
  未修项与被否的证据冲突都在 `docs/design-review.md` §六/§七。

## 已知事故记录（保留，不许抹）

- **2026-09-23**：我在 `NIX\t3rra-core` 执行 `git checkout -- plugins/omp-bridge.ts` 时，
  连带退掉了该文件里**别人的 338 字节未提交改动**（无法从 git 恢复；无 stash、无 dangling blob）。
  已提交历史未受影响，同仓库其他未提交文件未受影响。教训：**改别人的工作树之前先看 `git status` 的字节数，
  不要用整文件 checkout 做"回滚我自己的改动"**。
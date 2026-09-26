# 现状与决定

**本文件是唯一允许记录「在做什么、决定了什么」的地方。** 按主题组织；条目过时就改或删。结构性说明（目录、通用规矩）见 [`AGENTS.md`](../AGENTS.md)。  
**空上下文接手**：先本文件（验收账）→ [`handover.md`](./handover.md)（怎么跑、三分法）→ [`capability-map.md`](./capability-map.md)（coding-agent 能力全图与缺口）。

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
| 1 | 中断（HALT）没有 | **已按实测重写 · 待目视** | 旧结论「ACP `session/cancel` 不存在」是**实验方法错误**（带 id 当 request 发才得 `-32601`，F1）。2026-09-24 盲审实测：无 `id` 的 notification 直连 stdio，**53ms** 内 `session/prompt` 回 `stopReason:"cancelled"`【实测】。据此**删掉** HTTP `abort` 路线与桥的 `acp --port` + 按路径分流（`29f8ea0`）；HALT 现在只发 notification，并有 10s 看门狗：超时未收到回合结束就显式报 `CANCEL UNCONFIRMED`，不再拿 HTTP 200 当成功（F2） |
| 2 | 会话列表 + 网页端删除 | **主人已过 · 但发现引擎侧不一致（F21）** | 整行=LOAD、`×`=删除；不自动建会话；左轨/右栏/空态三处青色主操作新建；删除走引擎 HTTP；存储 `%USERPROFILE%\.local\share\opencode\`。**2026-09-24 实测新增**：`DELETE` 得 200、`GET` 得 404，但 ACP 的 `session/list` **仍列出该会话**（split-brain，F21）；已实测 `session/close` 可消除（两种顺序都行），**修法尚未接线**——删除目前仍只发一个 DELETE |
| 2b | 打开即建垃圾会话 | **已修** | handshake 只 `initialize` + `session/list`；首条指令才 `session/new`（queued）；删当前会话不再自动再开 |
| 2c | BUILD/PLAN 点了像死 | **已修待目视** | 点击即乐观切换 `aria-pressed` 并本地改 `currentValue`，再发 `set_config_option`；缺会话时写 LAST ERROR |
| 2d | 舞台标题仍可能撑爆 | **已修** | `#topic` 单行 nowrap+ellipsis + `shortTopic` 28 字 |
| 2e | 输入框中文字体回退 | **已修** | `--f-mono` = IBM Plex Mono → HarmonyOS Sans SC → Consolas（`39fc7f3`） |
| 3 | `02 EVENTS` 死按键 | **已修** | 真视图：原始事件日志 |
| 4 | `＋ NEW` 不明/死按键 | **已修** | 真动作：`session/new`（id 变更才清空旧流） |
| 5 | reasoning 不能收起 | **已修 · 主人已过** | thought 块可真折叠；对话区整批目视 **2026-09-23 通过** |
| 6 | 点输入框出现蓝框 | **已修 · 主人已过** | 焦点 = 左侧色条 + caret；输入框取消方框 outline |
| 7 | markdown 原样显示 | **已修 · 主人已过** | 最小安全渲染 `app/src/ui/markdown.ts`（只建 DOM）+ `test/markdown.test.ts` |
| 8 | 顶部走表数字太大 | **已修 · 主人已过** | 锚点 `clamp(42px, 5.5vw, 72px)`（原最大 152px） |
| 9 | 对话区像 Word 文档 | **已修 · 主人已过** | 回合分组 / 说话人 / 间距 / 工具行内嵌 / 时间戳；流为统一时间线。修过一次「整段指令塞进舞台 `h1` 撑爆标题」——现标题只取首行截断 |
| 10 | 审批无界面 | **已实现 · 待主人目视** | 底栏 `[ APPROVAL ]` 条：按引擎 `options` 渲三档按钮并回 `{outcome:{outcome:"selected",optionId}}`（与 trace 同形）。默认配置引擎不问（需 `permission.*="ask"`）——右栏 APPROVAL 空闲时写 `NOT REQUESTED` |
| 11 | 闸门假阴性 | **已修** | 控件扫描 + `app/ui-manifest.json` 清单制（缺分类 / 陈旧 / 无引用 → 构建失败） |

**计数**：**11/11 有代码**。#2、#5–#9 主人已过；#10 待目视；**#1 已按实测重写（分流删除），待目视**。  
**优先级（2026-09-24 两次更新）**：契约修复优先于一切新功能。**第一批已完成**：P0-a（notification cancel 端到端）· P0-a'（删分流、HALT 改 stdio）· P0-b（`prompt.failed`/`link.down`/`sessions.unavailable`/`permission.cancelled` + 错误不再映射成成功）· P0-c（`session/update` 按 `sessionId` 路由，非当前会话的更新丢弃并报出）· P0-d 的一部分（改为按**报文形状**判定响应，见下）· P0-e 实验部分（`session/close` 消除 split-brain，未接线）。  
**一处偏离审计建议**：P0-d 原写「请求 id 与引擎 id 分域」。**JSON-RPC 做不到**——id 由发起方自选，我方无法规定引擎不从 0 开始。实际改法是判响应看**形状**（响应无 `method` 且有 `result`/`error`，且该 id 确实在等），因此撞号不再可能把引擎的审批请求当响应吞掉；RESTART 另加 `pending.clear()` 与未决审批的 `cancelled` 回执。  
**理由**：审计确认此前对引擎的契约知识主要来自抓包反推，多处反推错了；在不修契约前继续堆功能等于在未验证的假设上加层。  
**汇报要求**：「已知未做」必须与「已完成」并列；清单未勾完前，「闸全绿」不作为交付证据。

## 契约审计（2026-09-24，本次最重要的交付）

四路只读子代理并行审计：上游 ACP 源码、上游 HTTP 源码、我方脏假设、官方前端范式。完整结果见 [`engine-contract-audit.md`](./engine-contract-audit.md)。

**必须承认**：项目已是屎山——不是代码量，是**契约知识靠抓包反推且多处反推错了**。审计确认 20 项问题，5 项属「造事实」级：

| 编号 | 一句话 |
| --- | --- |
| F1 | `session/cancel` **存在**（notification）；我方「不存在」是实验方法错误 → 整套 HALT 架构可能白建 |
| F2 | HTTP `abort` 恒 `true`；跨进程必然空操作但界面报成功 |
| F6 | `session/list` 出错被映射成「没有会话」；`load` 失败被伪造 `[ READY ]` |
| F7 | 契约缺 `prompt.failed` / `link.down` / `permission.cancelled` → 卡 RUNNING、假 LINK OK、审批挂死 |
| F11 | `session/list` 字段映射标【实测】但**仓内 0 条报文支持** |

另有：请求 id 与引擎 id 同域可吞审批（F5）、`session/update` 忽略 `sessionId` 致事实串台（F4）、工具行说旧话+造值（F8）、批准 edit 后引擎反向调 `fs/write_text_file` 我方未实现（F9）、`--version` 通过即当可用（F18）、jsdom 测试违反规则 19（F17）、验证体系六处盲区（F16）。

**同时列出 12 项做对的部分**（纯函数分层、不造数字、未知报文计数、审批回包形状、壳只搬字节等），见审计 §3——不是全盘否定，是**契约知识必须补课**。

### 能力全图（2026-09-23，子代理盘点入库）

完整对照与建议优先级见 [`capability-map.md`](./capability-map.md)。  
**结构空洞（摘要，与验收清单并列）**：**无项目/cwd 选择**（固定 `app/.sandbox`，桥 `/spawn` 已可收 cwd、UI 未暴露）；**无项目配置入口**（`permission.*=ask` 无法从 app 定位/编辑 → #10 默认不触发且无解释）；无 diff/文件/终端/搜索/图片等工作面；HTTP 透传按路径分流（仅 `/abort` → ACP 端口，其余 → serve），**分流状态未端到端复测**。**HALT（#1）代码接入：待复测、待主人目视。**  
**建议优先级（未拍板）**：cwd 选择器、配置面、多会话、fork/resume/close、审批 diff——详见能力全图 §3（其第 1 项 HALT 已代码接入，未复测/未目视）。

## 2026-09-24（批次 1）：视觉层固化 + HALT 重做 + 契约诚实层

无人值守执行，计划见 [`plan-contract-repair.md`](./plan-contract-repair.md)。**已完成的部分有单测，接上但未覆盖测试的部分列在下面**，不混为一谈。

**提交**：`b392e82` 视觉层独立性闸 · `91b5810` 盲审证据入库 · `29f8ea0` HALT 改 stdio notification 并删分流 · `ddb93cf` split-brain 缓解实测 · `2106010` 规则落盘 · `c4811e7` 契约表闭合 F1/F21。

**闸门现状**（`npm run check:all`，EXIT 0）：tsc 严格 · **70 项测试**（批次开始时 52，新增 12 项契约失败路径 + 5 项边界闸 + 3 项 HALT）· `check:app` 11 控件 0 悬空 · `check:boundary` 5 个视觉层文件 0 越界 · `check:traces` 25 份报文 · `check:docs` 链接全解。

**这一批改了什么行为**（不是改代码，是改"界面在故障时说真话"）：

| 审计条目 | 之前屏幕上会发生 | 现在 |
| --- | --- | --- |
| F6 | `session/list` 出错 → 显示 `NO SESSIONS · CREATE ONE`（把故障编成事实） | 保留上次列表 + 顶一条 `LIST FAILED · <原因>` + `↻ RETRY LIST`；真·空列表与取不到列表是两个不同状态 |
| F7 | `session/prompt` 返错 → 无事件，永远 `[ RUNNING ]` | `prompt.failed` 事件，`busy` 释放，`[ READY ]` + `TURN FAILED` + lastError |
| F7 | 字节通道断了 → 仍显示 `LINK OK` | `stream.onerror` → `link.down` → `[ LINK DOWN ]` + `PRESS RESTART ⟲`；EventSource 自动重连，恢复时 `open` 清掉该状态 |
| F6 | `session/load` 失败 → 伪造 `session.opened`，显示 `[ READY ]` 并把排队指令发进未打开的会话 | 伪造路径已删；失败就报失败，输入框回到可重试 |
| F4 | 别的会话/已放弃的旧 turn 的 chunk 混进当前流 | 每条 `session/update` 按 `params.sessionId` 判归属，非当前会话的更新**丢弃并显式报出**（不静默丢） |
| F5 | 引擎审批请求（id 从 0 起）与我方 pending 同号 → 被当响应吞掉，审批条不出现、永久挂死 | 响应按**形状**判定（响应无 `method` 且有 `result`/`error` 且 id 在等）；RESTART 清 `pending` |
| F10 | turn 取消 / RESTART 时未决审批永不回执 | 回 `outcome:"cancelled"`（该回复走引擎请求 id，单独记账于 `respondToEngineRequest`），界面 `PERMISSION CANCELLED` |
| F2 | HALT 拿 HTTP 2xx 当中断成功 | HTTP `abort` 通路整体删除；HALT 只发 stdio notification，10s 内无回合结束则显式 `CANCEL UNCONFIRMED` |

**已知未做 / 只做了一半（必读，与上表并列）**

- **F21 的修法没接线**：`session/close → DELETE` 已实测有效，但删除动作目前仍只发一个 DELETE。幽灵会话问题还在。
- **批次 1 的判定逻辑住在 `main.ts` / `transport.ts`，这两个文件零测试**（正是 F16）。已测的是纯函数层：`failureEvents`、`errorReasonOf`、`reduceView` 对新 kind 的处理、`translateLine` 报告 sessionId。因此：**"列表失败不清空"、"跨会话丢弃"、"LINK DOWN 检测"三条我只证明了决策函数正确，没证明接线正确**——需要真浏览器点一次，或者 T7 给 `main.ts` 建可测出口。
- `link.down` 只覆盖 SSE 通道报错；dev server 整体消失由既有 `engine.exited` 兜住，两者未统一成一个连接状态机。
- 视觉层表现**我没有看过**（无头浏览器禁用），不声称看过。目视点列在下面的验收请求里。
- 撤稿**只传播了 1/6 文件**（`adapters/opencode-acp.md` 由我补完）：`status.md` 已同步；`handover.md`、`capability-map.md`、`backends/opencode.md` 仍含旧错话，属批次 2。
- F17 jsdom：例外已在 `AGENTS.md` 登记（窄到 `test/**` 结构断言）。`tools/check-app.mjs` 的动态控件清单我写到一半发现属批次 T7 范围，**已回退**，半成品存 `tasks/T29/check-app-dynamic-controls.wip.mjs`。
- F20 `cwd: "."`：仍发相对路径，"违反 ACP" 那句证据等级已降为【文档/未验】。未改。
- 引擎存储里还留着探针造的测试会话（含本批次 `spike/` 跑出的），未清理。

## 2026-09-26（批次 3）：视觉第 3 代 · ark 金标准迁移（第一刀）

**决定（仓库主人 2026-09-26）**：视觉金标准从 `demo/ark-console.html` 换成 `tmp/OPUS5-5/ark.html`（两个外部 agent 产出的样张，主人判定"最对味"）。`end.html`（终末地族）冻结到 **P10000000000**，不并入主干——理由见下"为什么不做双主题"。

**第一刀做了什么**：只换 `app/index.html` 的 `<style>`——把 ark 的**设计语言**（蓝主操作、灰 `tile` 材质、浅色选中块、Bahnschrift 斜体数字、资源条色块、工单站卡左色条、浅色批准卡、`▸▸` chip 头）搬进运行界面。body 的 **54 个语义 id 与 console.ts 的 class 钩子逐字未动**（`check:app` 54/54、`check:boundary` 0 越界、tsc、70 测试全过【实测】）。

**搬语言、不搬假数据**：样张里的 `76K/200K`、上下文圆环百分比、计划清单、diff 行数、每会话"完成/已中止"状态——事件契约里没有真数据源的，一律不搬或写 absence。OPUS 样张只覆盖 4 个态，本仓新增的 5 个失败态（空列表/列表失败/断链/prompt失败/审批取消）它没画版式，第一刀沿用现有 absence 文案。

**一处推翻旧锁定（必须记）**：主信号色 青 `#35c8f0` → 蓝 `#1680c0`。这是采纳 ark.html 金标准的直接后果（ark 主操作即蓝），与 `AGENTS.md §二.2`"青色主信号"冲突。`--signal` 现指向 `--blue`，`--state` 仍酸绿=完成/在线。酸绿/黄/红在 ark 语言里各有专指（完成/终端/中止），见 `app/index.html` token 注释。

**为什么不做双主题**：`end.html` 的暗色版本身就是 `design-critique.md` 第 6 条判过"不对味"的东西——"用 ark 骨架追 endfield 皮"；且 OPUS README 自承 end 原生身份是亮色（白底黄黑），为迁就夜间偏好才做暗。两族主操作色、几何、语义各不相同，"双主题"实为两个 app。将来若要玩，单独 fork 或分支，不进主干。

**已知未做 / 只做了一半**

- **布局三栏重排（左会话/中记录/右概况）是第二刀**，本刀保持现有 grid（rail/stage/dossier）。
- **ark 的数据密集组件（圆环、计划、进度条、资源数字）没搬**——缺真数据源，硬搬就是造假。要么给契约加字段（引擎活），要么省。
- **5 个失败态的 ark 版式没做**：目前仍是纯文本 absence（`LIST FAILED ·…`），没按 ark 语言排版。
- **idle 大锚点 `—` 被 72px 斜体撑成一道大白杠**，像 glitch；拟在 `data-busy="false"` 时压暗压小，**待主人定**（不自作主张改观感）。
- **观感判断权在主人**：本刀我用一次性特批起了 dev server 截图，只用于自查有没有叠块/丢元素（结论：无），**不声称它"好看"，更不充当验收**。`check:all` 全绿不是交付证据。

**目视验收（看什么）**：`npm run dev` → `http://localhost:5191/`
1. 第一眼：是不是往 ark 金标准靠了（蓝主操作、灰块、浅色 chip、斜体大标题），还是哪处"诡异"。
2. 左轨 `＋ NEW` 蓝块、顶栏 ENGINE/SESSION 资源块、LINK DOWN 红点——配色语义对不对。
3. 起一个会话发消息，看流式正文/思考/工具行在 ark 语言下读起来顺不顺（工具行现在是左色条站卡式）。
4. idle 那个大白杠（`—`）要不要按我建议压暗。
5. 批准条弹出时是不是本屏唯一浅色块、够不够拽视线（需 `permission.*="ask"` 才触发）。

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
| **P0** | 产品 | **验收 #2 已过（主人目视）**：会话列表 + 网页删除（`session/list` + HTTP `DELETE`） |
| P1 | 产品 | 审批三档界面（#10）；断链/错误态；多会话 |
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

**中断（#1 代码接入·未复测，2026-09-24）**：ACP 面 `session/cancel` **不存在**（`-32601`，探针 `spike/probe-session-cancel.mjs`，trace `traces/opencode/*-cancel-probe.jsonl`）。  
HTTP 面 `POST /session/{sessionID}/abort` **只对拥有该 turn 的进程有效**：  
- 独立 `opencode serve` 收 abort 返回 `true` 但流不断（跨进程空操作，trace `*-abort-probe.jsonl`，探针 `spike/probe-http-abort.mjs`）；  
- `opencode acp --port P` 自带 HTTP 面（trace `*-acp-http-face.jsonl`）；打同一进程的 abort **实测真中断**：`session/prompt` 回 `stopReason:"cancelled"`，252ms，中断后会话可用（trace `opencode-acp-2026-09-24T04-22-08-065Z-halt-in-process.jsonl`，探针 `spike/probe-halt-in-process.mjs`）。  
→ 代码接入（**分流后未端到端复测**）：桥 spawn `acp --port`；隧道仅 `/abort` 分流到该端口，其余（含 DELETE）→ 懒起 serve；坞内 `■ HALT` + Esc。`RESTART ⟲` 保留为粗兜底；diff / revert / pty 仍可骑同一通道（未接）。

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
| `▶ HALT` | — | **已接入（2026-09-24，#1）**：坞内 `■ HALT`，走同进程 HTTP abort |
| 状态条外大锚点语义 | 现锚点为真实时钟；判决词为真实相位；比较行 `SILENCE NOT MEASURED` | 静默判据（已落地） |
| 会话切换 / EVENTS | — | **已接入（#3、#2）**：EVENTS 原始日志；会话列表 LOAD |

**真实交互**：`OPERATOR / EXPERT` 语域（EXPERT 显示 `[ TRANSPORT ]`：binary/cwd/exit/last error/unmapped/provenance）。舞台主标题 = 操作者指令的**首行短主题**（无则 absence；完整指令在流内）。  
**证据**：`npm run check:all` 六道闸通过；`spike/probe-app-pipeline.mjs` 跑通 thought → message → usage → `stopReason`。**渲染观感归主人目视。**

## 引擎与其它决定（2026-09-23）

- 工程写在 `C:\DEV\develop\t3rra-C0d3`，产品代码在 `app/`。`NIX\t3rra-core` 为上一代，改前先问主人。
- **引擎 = opencode（ACP v1）**。依据：`docs/adapters/opencode-acp.md` + `traces/opencode/` + `spike/`。四条核心判据已闭合（报文存在性、options、`session/load`、审批）。
- **界面 = ark 族 · complex · 仅暗色**，见 `docs/design-contract.md`；范本 `demo/ark-console.html`。
- **继承规则不继承代码**；实现新写。

## 2026-09-24：#1 HALT 批次（中途停，交他人接手）

**做了什么**（对应 handover「#1 代码接入」与本文验收表 #1 行）：

- 新探针与 trace：`probe-http-abort`（跨进程 abort = 空操作）、`probe-acp-http-face`（acp 自带 HTTP 面，零 token）、`probe-halt-in-process`（同进程 abort 真中断、中断后 turn 可用）、`probe-bridge-route`（桥隧道路由）。
- 产品代码：桥 spawn `acp --port` + 隧道按路径分流（仅 `/abort` → ACP 端口，其余含 DELETE → 懒起 serve）；`engine-http.abortSession`；坞内 `■ HALT` + Esc；`ui-manifest` 表态；`test/halt.test.ts`。
- 闸：本段提交时 `npm run check:all` 全绿（tsc · 52 单测 · 四道机检）。**全绿 ≠ 交付证据**（见上「汇报要求」）。

**如实记录的两处发现（未修，留给接手）**：

1. 同进程 DELETE 假成功：打到 ACP 端口的 `DELETE /session/{id}` 返回 `true`、再删 404，但 stdio `session/list` 仍列该会话（scratch 复测，trace 未入库）。当前分流让 DELETE 回serve，但该分流状态**未做回归复测**。
2. 经桥的真运行 turn abort **未端到端复测**：同进程 abort 的中断与可用性结论来自独立进程直连实测。

**环境副作用**：今日探针在 `app/.sandbox` 对应引擎存储留下若干测试会话（标题如 `Count 1-300…`、`New session - 2026-09-24T04:*` 等），可在界面删除。免费模型 `nemotron-3.5-lightning-free` 当日出现限流（首块延迟 17s→122s→不出流），部分探针轮次因此空转。

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

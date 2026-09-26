# 引擎契约全面审计报告

日期：**2026-09-24**。方法：四路只读子代理并行审计 —— 上游 ACP 源码、上游 HTTP 源码、我方脏假设、官方前端范式。  
**本文件是「黑盒猜测」的清算账。** 与 [`capability-map.md`](./capability-map.md) 的分工：capability-map 回答「产品功能有没有」；本文件回答「对引擎的每一次假设是否成立」。

**结论先行**：本项目此前对 opencode 的行为假设基本来自抓包反推，其中多处反推错了。最严重的一条：HALT 的整套架构（双进程、端口分流、正则路由）建立在一个**方法错误的否证实验**上（F1）。  
**修订记录 2026-09-24（同日，盲审之后）**：本文初稿的严重度分布有偏差，已按证据订正——F9 机制写错、F11 的「0 报文支持」已被真实报文推翻、F13 归因过重、F20 证据等级拔高、F1 的【未验】已闭合成【实测】。另新增 F21（split-brain），影响高于本文约一半条目。当前真相以 [`status.md`](./status.md) §4 与本文修订后条目为准。

**2026-09-26 说明**：§1 各条描述的是 2026-09-24 批次 1 **修复之前**的代码。F1、F2、F4、F5、F6、F7、F10 已修，F21 已实测出修法但未接线。逐条处置现状见本文 §5 与 `status.md` §4。§4 的「假话清单」已在 2026-09-26 文档重构中处理完。

## 0.0 严重度分层（初稿缺这一层，导致 20 条看起来同等致命）

| 层级 | 条目 | 含义 |
| --- | --- | --- |
| **架构级** | F1、F21、F4 | 决定结构去留与多会话可行性 |
| **造事实级** | F2、F6、F7、F8、F11(部分) | 界面显示并不存在的事实，违反规则 12 |
| **挂死级** | F5、F10、F19 | 状态机不可恢复 |
| **协议级** | F3、F20、F9(订正后) | 当前不炸，换环境即炸 |
| **卫生级** | F12–F18 | 证据链与规矩一致性，不影响当前运行。

---

## 0. 证据等级

沿用 [`README.md`](./README.md)：【实测】/【源码】/【文档】/【未验】。  
上游路径缩写：`ACPA` = `opencode/packages/opencode/src/acp/agent.ts`，`SVC` = `.../acp/service.ts`，`EVT` = `.../acp/event.ts`，`PERM` = `.../acp/permission.ts`，`H` = `.../server/routes/instance/httpapi/handlers/session.ts`，`RS` = `.../session/run-state.ts`，`S` = `.../session/session.ts`，`PRJ` = `core/src/session/projector.ts`。

---

## 1. 致命发现（按严重度）

### F1 · `session/cancel` 存在，是 notification；我们的「不存在」是实验方法错误 ★最高

- 上游 `ACPA:83-85` 实现 `cancel(params: CancelNotification)` → `SVC:357-360` → `abortBackingSession` → `POST /session/{id}/abort`（`SVC:336-345`）。【源码】
- SDK 分发规则：带 `id` = request，不带 = notification。`session/cancel` **只注册在 notification 分支**；以 request 发出会落到 `default` → opencode 未实现 `extMethod` → **`-32601`**。【SDK-remote】
- 我方探针 `spike/probe-session-cancel.mjs:99` 正是带 id 发的请求；trace 自证：`traces/opencode/opencode-acp-2026-09-23T14-50-17-823Z-cancel-probe.jsonl:11-12`（`{"dir":"out","id":5,"method":"session/cancel"}` → `-32601`）。【实测】
- **因此以下文档结论全部作废或须降级**：
  - `adapters/opencode-acp.md` §三「`session/cancel` 不存在」
  - `status.md` 验收 #1 备注、`handover.md`、`capability-map.md` 同条目
- **连带后果**：`engine-bridge.ts:340-343` 的「仅 `/abort` 分流到 ACP 端口」正则、`acp --port` spawn、双进程复杂度——**若 notification cancel 端到端可用，这一整块可删**。
- **已闭合（2026-09-24 盲审实测）**：notification 形式的 cancel 端到端可掐断在途 turn。  
  证据 `traces/opencode/opencode-acp-2026-09-24T10-34-39-594Z-cancel-notification.jsonl`【实测】：  
  `t=7936ms` 发出 `{"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId":…}}`（**无 `id`**）→ `t=7989ms`（**53ms**）收到 prompt 响应 `{"id":5,"result":{"stopReason":"cancelled",…}}` → `verdict:"CANCELLED_VIA_NOTIFICATION"`。  
  复现脚本已入仓：`spike/probe-cancel-notification.mjs`（纯 stdio，`spawn(bin,["acp"])`，**不需要 `--port`、不需要第二个进程、不需要桥**）。  
  **因此分流结构判定为冗余，删除即可**（见 §5 P0-a 已完成）。
- 残留未验：notification 在 `session/request_permission` 挂起时的行为；以及 cancel 之后引擎是否仍冲刷已排队 chunk（见 F13 的 186 条）。

### F2 · HTTP `abort` 恒返回 `true`，假成功无信号

- `H:232-235`：`promptSvc.cancel(id); return true` —— **不校验会话存在**。【源码】
- run-state 是 **进程内 + 按 directory 键控** 的内存 Map（`RS:35-50`、`RS:77-86`）；找不到 runner 就设 idle 并返回。跨进程必然 no-op 但 HTTP 200 `true`。【源码】
- 我方已有反证 trace：`opencode-acp-2026-09-24T04-37-51-820Z-bridge-route.jsonl` —— 对**假 id** abort 返回 `200 "true"`。【实测】
- 我方代码把 `status < 400` 当成功（`main.ts:468-478`），并播报「HALT SENT · AWAITING TURN END」。**中断是否生效，唯一权威是后续 `stopReason:"cancelled"` 或 status idle 事件，不是 HTTP 返回。**

### F3 · `abort` / `DELETE` 都不带 `directory` / `workspace`

- OpenAPI 两端口都定义了 `directory`、`workspace` query（本地导出 `traces/opencode/openapi-1.17.18.json`；SDK `sdk.gen.ts:3913-3937`）。【文档】
- 我方 `engine-http.ts:21,27` 只发裸路径。【源码】
- 单沙箱目录恰好掩盖了问题；**一旦接真实多项目根，立刻打错实例**。
- 注意：会话行存在时路由优先用 `session.directory`，`?directory=` 会被忽略（workspace-routing 中间件）；库里没有该会话时才回落到 query/cwd。【源码】

### F4 · `session/update` 的 `params.sessionId` 被我方完全忽略

- 每条 update 都带 `sessionId`（全部 trace）。【实测】
- `acp.ts:116-119` 不读它。后果：**别的会话/被放弃的旧 turn 的 chunk 会混进当前会话流**；多会话并发在契约层就不可能。违反规则 3（事件流唯一事实）。【源码】

### F5 · 请求 id 命名空间冲突 → 审批可被吞掉、turn 永久挂起

- 引擎→客户端的 `session/request_permission` 的 id 从 **`0`** 开始（trace `…05-59-54-343Z-prompt.jsonl:29`）。【实测】
- 我方 `main.ts:27-29` 自己的请求 id 从 1 递增，`pending` 混在一个 Map 里；RESTART 不清（`main.ts:426-446`）。【源码】
- 引擎请求 id 撞上我方 pending 记录时会被当「响应」吞掉 → 审批条不出现、永不回复 → 挂死。

### F6 · 错误响应被当成功映射（两处造事实）

| 路径 | 代码 | 后果 |
| --- | --- | --- |
| `session/list` 出错 / result undefined | `responses.ts:81-88` → `sessions: []` | **故障被渲染成「没有会话」**，右栏显示 `NO SESSIONS · CREATE ONE` |
| `session/load` 失败 | `main.ts:156-171` 用 `pendingLoadId` 伪造 `session.opened` | **失败的 load 显示成 `[ READY ]`**，还会自动把排队指令发进没打开的会话 |

均【源码】。直接违反规则 12（宁可 absence，不许造合理值）。

### F7 · `prompt` 错误响应没有任何事件（契约空洞）

- `responses.ts:96-104`：只处理有 `stopReason`；错误响应不产事件。`events.ts` 没有 `prompt.failed`。【源码】
- 后果：`busy` 恒 true、界面卡 `[ RUNNING ]`、HALT 反复假成功、`#pStop` 永远 `NOT REPORTED`。
- 同样缺失：`link.down`（EventSource 无 onerror，dev 重启后界面仍显示 LINK OK）、`request.unanswered`（`fs/*`、`terminal/*` 等 agent→client 请求被降级成 unmapped 且**永不回复** → 引擎侧永久挂起）。

### F8 · 工具行同时「说旧话」和「造值」

- 上游 `tool_call` 带 `status:"pending"`；我方 `acp.ts:89-90` + `derive.ts:171,177` 硬编 `"running"`。【实测反证】
- 上游 `tool_call_update` 会**更新 title**（如从 `"bash"` 改成真实命令行）；我方 `acp.ts:91-92` 丢弃 title/kind/locations/content。【实测】
- 非文本 `content`（image/resource_link/resource）被 `content?.text ?? ""` 吞成空串，连 unmapped 都不计。【源码 + 文档】

### F9 · 批准 `edit` 后引擎会反向调用 `fs/write_text_file`（机制已订正）

- `PERM:84-86`：批准且权限为 edit 时调 `writeProposedEdit(...).catch(() => {})`；`PERM:99-115` 读原文件 → `applyPatch` → `void this.input.connection.writeTextFile({sessionId, path, content})`。【源码】
- **订正（2026-09-24）**：`PERM:102` 的守卫是 `!this.input.connection.writeTextFile` —— 这是对 **AgentSideConnection 上方法存在性**的检查，**不是客户端 capability 协商**。`connection` 由 SDK 构造并原样透传（`agent.ts:26-27`），方法恒在。同理 `PERM:56` 对 `requestPermission` 也是存在性检查——这解释了我方 `clientCapabilities: {}` 为何仍收得到审批请求。  
  所以初稿那句「靠 SDK 侧 `client.writeTextFile?.()` 为 undefined 侥幸不炸」**机制归因错误**：请求确实会发过来，capability 挡不住它。
- **真实后果**：我方 `acp.ts:147` 把该请求降级为 unmapped 且**永不回复**。上游对这一路与对 `requestPermission` 不同——后者有 `.catch → reply(reject)`（`PERM:71-74`），前者是 `void` 且**无 catch**，promise 永不 settle。直接后果：**批准后的编辑内容不会写回客户端**，且文档此前从未记载这个请求会来。
- 残留【未验】：SDK（本机无包体）是否对悬空请求设超时/拒绝；若是，本条升级为"引擎侧未捕获拒绝"。

### F21 · split-brain：DB 已删的会话仍被 stdio `session/list` 列出 ★架构级

盲审提出。**影响高于本文约一半条目**——它打在已被仓库主人勾过的验收 #2（会话删除）上。

- 复现脚本：`spike/probe-split-brain.mjs`（provider-free，不花 token）。  
  trace：`traces/opencode/opencode-acp-2026-09-24T10-35-48-113Z-split-brain.jsonl`（盲审原始运行）+ `traces/opencode/opencode-acp-2026-09-24T11-00-34-512Z-split-brain.jsonl`（**本仓代码复现运行**）。【实测】
- 观测序列【实测】：`session/new` 建会话 → stdio `session/list` 含它 → 经**另一个** `opencode serve` 发 `DELETE /session/{id}` 得 **200** → 同端口 `GET /session/{id}` 得 **404 `NotFoundError`** → 再问 stdio `session/list`，**该会话仍在列**（`splitBrainStillListed:true`）。
- 机制：run-state 与进程内会话态是**内存态、按 directory 键控**（`RS:35-50`）；HTTP DELETE 只作用于数据库那一层，不会通知 ACP 子进程。与 F2 同源：**跨进程写操作对本进程内存态不可见**。【源码 + 实测】
- 后果：界面上删掉的会话，引擎仍认为存在；之后打在它身上的 `session/prompt` / `abort` 指向一个 DB 里已不存在的会话，而 HTTP 侧仍一律返回成功形状（F2 叠加）。
- **缓解已实测成立（P0-e 已完成实验部分）**：`session/close` 会把会话从 stdio `session/list` 中摘掉，两种顺序都有效。  
  证据 `traces/opencode/opencode-acp-2026-09-24T11-15-49-216Z-delete-verify.jsonl`（provider-free，可由 `spike/probe-delete-verify.mjs` 复现）【实测】：
  | 顺序 | stdio close | serve DELETE | 事后 stdio list 仍列出 |
  | --- | --- | --- | --- |
  | A：先 close 再 DELETE | ok `{}` | 200 | **false** |
  | B：先 DELETE 再 close | 200（**删完仍列出 = true**） | ok `{}` | **false** |
  机制【源码】：`SVC:347-355` `closeSession` 走 `session.remove(sessionId)`（内存态移除）+ `registeredMcp`/`sessionSnapshots` 清理 + `abortBackingSession`；HTTP DELETE 只动库行。因此**删除必须是两步**：stdio `session/close` → HTTP `DELETE`。取顺序 A（先 close 可顺带中断在途 turn）。  
  参数形状 `session/close` = `{ sessionId }`【源码】，实测返回 `{}`。  
  **待实施**：`app/src/main.ts` 的删除动作目前只发 HTTP DELETE，需要补这一步（T6 代码部分）。
- 残留【未验】：close 一个**正在跑 turn** 的会话时，客户端会收到哪些结束信号（`abortBackingSession` 之后 `session/prompt` 的响应形态）；以及 share 远端数据是否随删除清理。

### F10 · 审批的 `cancelled` 结局缺失

- ACP 规范：客户端 MUST 对所有未决 `request_permission` 回 `cancelled`；上游 `PERM:219-223` 把 cancelled 折成 `reject`。【文档 + 源码】
- 我方契约没有 cancelled 分支；HALT/RESTART 时未决审批永不回复。

### F11 · `session/list`：字段映射经报文证实正确；缺陷只剩分页（已订正）

初稿把这条写成"整条 #2 依赖未被报文支持的猜测"。**该说法已按新证据订正**——本仓现有 3 份 trace 记录了真实行（`10-35-48-113Z-split-brain`、`11-00-34-512Z-split-brain`、`10-34-39-594Z-cancel-notification`）。【实测】

- 真实行形状【实测】：`{sessionId, cwd, title, updatedAt}`，其中 **`updatedAt` 是 ISO-8601 字符串**（`"2026-09-24T10:35:50.218Z"`），与上游 `SVC:268` `new Date(item.time.updated).toISOString()` 一致。新建会话**有** title（`New session - <ISO>`）。
- 我方 `responses.ts:39-57` 的映射：`sessionId|id` 双写兼容、title/cwd 缺失退 `""`、`updatedAt` 用 `String()` 归一 → **对 ISO 字符串和缺字段都成立，映射本身正确**。#2 的字段部分不再悬空。
- 上游事实【源码】：`limit = 100` 硬编（`SVC:251`）；`roots: true` 只列 root 会话（`SVC:257`）；行按 `directory: params.cwd` 过滤（`SVC:256`）→ **列表是 cwd 作用域的**；`nextCursor` 仅在 `filtered.length > 100` 时给出，值是**毫秒十进制字符串**（`SVC:291`）——初稿把"毫秒"错记成了行字段 `updatedAt` 的类型，二者不同。
- 内存态未落盘会话（`SVC:271-279`）确实**没有 title**，与 server 行合并后**按 `updatedAt` 降序再排序**——初稿写"置顶"不准确，实际是先 prepend 再整体排序，落点由时间决定。
- **仍然成立的缺陷**：我方无分页消费，`nextCursor` 直接丢弃；超过 100 条 root 会话时界面只显示一页，且界面上没有任何"还有更多"的 absence 表达 → 违反规则 12。列为 P1-d。

### F12 · 五个已实现方法从未被我方使用

`session/resume`（不回放，只读 20 条恢复参数）、`session/fork`（回放 20 条）、`session/close`（内存移除 + best-effort abort）、`session/set_mode`、`session/set_model`。均【源码】。  
**load / resume / fork 的回放语义完全不同**——我方文档只写了 load。

### F13 · 选择性证据（订正：不可解读那个 verdict 字符串，而不是换一种解读）

同进程 HTTP abort 的三次 halt-in-process run，文档只引用了最干净的那次（252ms）。**"只引用有利样本"这个指控成立**，但初稿对另两次 run 的定性要收回并改写。

原始记录（`traces/opencode/opencode-acp-2026-09-24T04-16-30-753Z-halt-in-process.jsonl`，逐字）【实测】：

```
{"t_ms":61787,"dir":"verdict","verdict":"NOT_STOPPED_IN_WINDOW","updates":192,
 "updatesAfterAbort":186,"stoppedWithinMs":244,"mainStop":"cancelled","idleSignal":null}
```

可直接读出的事实只有三条：**主 turn 在 abort 后 244ms 以 `stopReason:"cancelled"` 结束**；此后仍有 **186** 条 update 到账；`idleSignal` 为 **null**（整个窗口内没观测到 idle 信号）。

**初稿与盲审复核都不该做的推断**：现行 `spike/probe-halt-in-process.mjs:149-152` 的 verdict 只有三个分支——`NO_STREAM_WITHIN_WINDOW` / `ABORT_SENT_BUT_TURN_NOT_STOPPED` / `STOPPED_IN_${ms}_AFTER_${n}_FLUSHED_UPDATES`——**它产生不了 `NOT_STOPPED_IN_WINDOW` 这个字符串**（`idleSignal` 字段同样不在现行源码的 record 里）。所以这三份 trace 出自一个已不在仓库中的旧版本脚本（即 F14），**那个 verdict 词的判据已不可恢复**：把它读成"中断失败"（初稿）或读成"探针误报、中断其实成功"（盲审）都缺乏依据。可依赖的只有上面那三条原始字段。

真正残留的问题有两个，都与那个词无关：

1. **186 条冲刷会污染 cadence 基线**——`derive.ts:210-211` 对 `cancelled` 没有特殊处理，`endTurn` 也不丢样本，于是取消后到账的 chunk 被当作正常回合节奏计入。列 P1-c。
2. **`idleSignal:null`**——窗口内没有权威回合结束信号可用，与 F7（缺 `prompt.failed` / `link.down`）同源：我方结束判定缺一个可依赖的信号源。

### F14 · 证据链已断的探针

- `spike/probe-http-abort.mjs:131` 经桥发 abort → 分流改动后它现在测的是**同进程** abort，会得出与文档相反的结论。【源码】
- `probe-halt-in-process.mjs` 现行源码的 verdict 分支只有 `:149-152` 那三个，**拼不出** trace 里的 `NOT_STOPPED_IN_WINDOW`，record 里也没有 `idleSignal` 字段 → 这三份 halt trace **无法由本仓代码复现**，出自一个已丢失的旧版本脚本。【实测·2026-09-24 二次确认】  
  **处置**：三份 halt trace 保留为历史证据，但任何结论不得引用其 verdict 字符串（见 F13）；HALT 的现行权威证据改为 `10-34-39-594Z-cancel-notification`（其复现脚本 `spike/probe-cancel-notification.mjs` 已入仓）。  
  新增探针一律要求**trace 可由仓库内脚本复现**：F21 已按此做（`11-00-34-512Z-split-brain` 是用入仓后的 `spike/probe-split-brain.mjs` 跑出来的）。
- `probe-bridge-route.mjs` 用 `tasklist` 进程数当分流判别器，同机任何 opencode 进程都是噪声；且把 abort 与 DELETE 两件事混成一个 verdict。【源码】

### F15 · 死代码：「失败可恢复」并未落地

`main.ts:242-249` 的 new/load 失败恢复分支**不可达**（`:240` 已 `return`，且这些 method `recognised` 恒 true）。【源码】  
而 `status.md` 范式表第 4 行把它写成已落地 → **文档与代码不一致**。

### F16 · 验证体系自身的盲区正好覆盖最贵的地方

| 盲区 | 事实 |
| --- | --- |
| `engine-bridge.ts` / `transport.ts` / `main.ts` / `console.ts` | **零测试** |
| `check:traces` | 只校验 §二 kind 表 + 精确文件名；`lib.mjs:36` 正则**不接受 `*`** → 文档里大量 `*-xxx.jsonl` glob 引用**永不被校验** |
| `check:app` 清单 | 只扫 `app/index.html` → 渲染器动态生成的 LOAD/×/CREATE/mode chips/selects/审批按钮**全部无从表态** |
| 静默 guard 正则 | 只认 `if (… === undefined) return;`；`=== ""`、`!== true` 等形态漏网 |
| `halt.test.ts` / `sessions.test.ts` | mock 无条件返回 `200 "true"`，**让假成功在测试里永久不可见**；测试标题「without inventing query junk」把「带 directory」预设成错误做法 |
| `acp-coverage.test.ts` | 从不把真实 permission options 报文喂进映射 |

### F17 · 规矩自相矛盾

`AGENTS.md` §三 / `rules-inherited.md` 规则 19：**不跑 jsdom**。  
`test/markdown.test.ts` 真跑 jsdom，`package.json` 列为 devDependency。【源码】  
未登记为例外 → 规矩与实现直接冲突。

### F18 · `--version` 退出码 0 = 可用，但文档写「锁 1.18.x」

`resolve.ts` / `probeVersion` 无任何版本下限或能力协商校验。【源码】  
同时 `resolve.ts:42-44` 仍把 omp 当默认可回退引擎，而 `--port`、`serve`、abort/DELETE 路径、list 字段全是 opencode 专属假设。

### F19 · 刷新页面落在 turn 中间 → 状态卡死

桥在 `streams` 为空时静默丢字节（`engine-bridge.ts:113-120`），60s 后 reap；无重放。`session/prompt` 响应永久丢失 → `pending` 残留、`busy` 恒 true。【源码】

### F20 · `cwd: "."` —— 我方发相对路径为【源码】，"违反 ACP" 这半句只能到【文档】

我方 `main.ts:302,413` 在无 `facts.cwd` 时传 `"."`（相对路径）。【源码】  
"ACP 要求 `cwd` MUST be absolute" 取自规范文档/已发布 SDK，**无法本地复核**：`@agentclientprotocol/sdk@0.21.0` 包体不在本机 checkout（依赖未安装），且上游 acp 源码里不含 `session/cancel`、`session/update` 等方法名字符串——它们全在该包里。故此条整体按【文档】+【未验】计，初稿标【文档 + 源码】属拔高。  
当前不可达（`facts.cwd` 在 spawn 后有值），仍按保守值改绝对路径（绝对路径在两种解读下都安全），但**不声称这是协议违规的证据**。

---

## 2. 官方前端范式（可直接抄，全部【源码】）

| 能力 | 官方做法 | t3rra 现状 |
| --- | --- | --- |
| 中断 | 发送按钮在 working+空输入时变 stop；**不乐观置 idle**，idle 由 `session.status` 事件驱动；TUI 连按两次 Esc 二次确认，第一下必给可见反馈 | HTTP true 即当成功；Esc 只绑在输入框 |
| 删除 | 确认对话框 → **等成功响应** → 级联收集子会话 → 列表剔除 + evict + tab 清理 → 导航兜底 父→相邻→新会话入口；失败 toast，**无乐观删除** | 本地合成 `sessions.removed`，未验证列表真少一条 |
| 列表 | 永远 `roots:true` + `limit` + 服务端 `search`；`session.created/updated/deleted` 事件增量 merge；断线重连后 refetch | 全量替换 + 无分页 + 无事件增量 |
| 新建 | **懒创建**：打开新会话页不建，首次 submit 才 `session.create` 再导航 | 已对齐（不自动建）✓ |
| 目录选择 | 项目下拉 + 恒定「+ add project」；本机 desktop → OS 原生目录对话框（Tauri 对位 plugin-dialog）；否则 → 服务端 `file.list`/`file.find` 内置树；`~`/盘符/UNC 规范化；选中后 `navigate('/'+b64(dir)+'/session')` | **完全没有** |
| 审批 | 单请求队列；blocked 时替换 composer；三按钮 once/always/reject；`responding` 锁；reject 可附言；auto-accept 两级 key + 血统继承 + 开启即清 pending + LRU 去重 | 底栏条已接，无队列/无锁/无 auto |
| cancelled 呈现 | `MessageAbortedError` → 分隔行「⨯ Interrupted」muted 色，**不走 error 通道、不计 usage、不触发重试通知** | 无区分 |
| busy 状态机 | `session_status.type: idle|busy|retry`；三通道合并（快照 seed / SSE / 本地乐观且失败回滚） | 单布尔 `busy` |
| 附件 | Blob 暂存 → submit 时转 data URL `file` part；图片白名单 png/jpeg/gif/webp | 只发 text |
| configOptions | model/effort/mode 三 select；effort 含 `"default"` 哨兵；未知 configId 报错不静默 | 泛化渲染 ✓，但丢弃 `type`/`description` |

---

## 3. 我们做对了什么（不居功，仅避免矫枉过正）

1. 纯函数分层（acp/responses/derive/cadence 无 I/O、时钟注入）确实可测。【源码】
2. 规则 4「壳只搬字节」在 transport/bridge 的文件头与实际代码一致；LF 分帧并解释了为何不用 readline（U+2028/29）。【源码】
3. **不造数字贯彻得不错**：`usage_update`/`available_commands_update` 双表分离且各带 why；`PromptResponse.usage` 不映射；cadence 样本 <3 拒判、硬上限标注不冒充测量。【源码 + test】
4. 未知报文计数不猜测（`message.unmapped` + 覆盖测试逼决策）。【源码 + test】
5. 工具身份用 `title` 不用 `kind`，有 trace 支撑。【实测】
6. 审批回包形状与 trace **逐字节一致**。【实测】
7. `set_config_option` 响应为权威 + mode-chip bug 的回归测试。【test】
8. 引擎定位不写死主机路径。【源码】
9. `patch` 合并 + `engineReady()` 消灭静默 return（上一代死键事故的正面修复）。【源码】
10. 空态有恢复动作（`＋ CREATE SESSION`）。【源码】
11. markdown 无 HTML 注入汇。【源码】
12. 探针资产完整（SSE/trace/verdict），且 handover 记录了 undici 压流的坑。【实测/文档】

---

## 4. 文档需即刻修正的假话清单（2026-09-26：已全部处理）

| 位置 | 现说法 | 应改为 |
| --- | --- | --- |
| `adapters/opencode-acp.md` §三 | `session/cancel` 不存在【实测】 | **notification 形式存在且端到端可用【实测】**（`10-34-39-594Z-cancel-notification.jsonl`）；请求形态 `-32601` 是实验方法错误 |
| `adapters` §三 | `session/list` 仅四字段【实测】 | 四字段映射**已被真实报文证实正确**【实测】；`updatedAt` 为 ISO 字符串；待补 `limit=100` 硬编 / `roots:true` / cwd 作用域 / `nextCursor` 毫秒串 / 我方无分页【源码】 |
| `adapters` §三 | `session/new` 中 `modes` 为 `null` | 字段**不存在**，非 null |
| `adapters` §二 | `usage_update` 字段待核 | 已明：`used=input+cache.read+cache.write`、`size=model.limit.context`、`cost{amount,currency:"USD"}`；**非无条件发** |
| `adapters` §二 | `session_info_update` 是否不存在（§六.5） | 可闭合：`plan`/`current_mode_update`/`session_info_update` 零发射点【源码】 |
| `adapters` §四 | approval 三档 | 补 optionId 字面量 `once/always/reject`；`cancelled`→折成 reject；批准后会有 `fs/write_text_file` |
| `status.md` #1 | ACP 无 cancel（实测 -32601）→ 需 HTTP | 见上；HTTP 路线**待 notification 验证后再定去留** |
| `status.md` #1 | 同进程 abort 实测 252ms 可中断 | 补：三次 run 中两次不干净（186 条冲刷 / NOT_STOPPED） |
| `status.md` 范式表 | 失败可恢复 → `handleLine` error 路径 | 该分支**死代码**，未落地 |
| `capability-map.md` | HTTP 透传「仅 DELETE」 | 补 directory/workspace 参数缺失、abort 恒 true |
| `handover.md` | 界面 LOAD 已接 | 补：失败时造 `session.opened`，未验证 |
| `backends/opencode.md` | ACP 暴露 `delete` | `sessionCapabilities` **无 delete**（close/fork/list/resume） |

---

## 5. 修复顺序与处置（2026-09-26 更新）

P0 批次已于 2026-09-24 完成（`status.md` §5）。下表保留原建议，并在每行开头标出处置。

| 优先级 | 动作 | 理由 |
| --- | --- | --- |
| ~~**P0-a**~~ | ~~新探针：notification `session/cancel` 端到端~~ | **已完成 2026-09-24**【实测】：`spike/probe-cancel-notification.mjs` → `10-34-39-594Z-cancel-notification.jsonl`，53ms `stopReason:"cancelled"`。**决定：分流删除**，cancel 走 stdio notification |
| ~~**P0-a'**~~ **已完成 `29f8ea0`** | 删除双进程分流：`engine-bridge.ts` 的 `acp --port` spawn 与 `/abort` 路径正则；HALT 改发 stdio notification；去掉 `status<400` 即成功的判定 | F1 + F2；这是唯一被实测判为冗余的结构 |
| ~~**P0-e**~~ **实测已完成（`ddb93cf`），修法未接线** | split-brain 缓解实测：删除前先 stdio `session/close`，再看 stdio `session/list` 是否仍列出 | F21；影响已被勾验收项 #2 |
| ~~**P0-b**~~ **已完成** | 契约补 `prompt.failed` / `link.down` / `permission.cancelled`；错误响应**不再当成功** | 止住「造事实」类缺陷（F6/F7/F10） |
| ~~**P0-c**~~ **已完成** | 所有 `session/update` 按 `params.sessionId` 路由 | 多会话前提；停止事实串台（F4） |
| ~~**P0-d**~~ **已完成（改为按报文形状判定响应；分域在 JSON-RPC 里做不到）** | 请求 id 与引擎请求 id 分域；RESTART 清 pending | 止住审批被吞、turn 挂死（F5） |
| **P1-a** 基本完成（10s 看门狗 + 以 `prompt.ended` 为准） | 中断判定改为事件驱动（`stopReason:cancelled` / status idle），HTTP 返回值只当「已受理」 | F2 |
| **P1-b** 未做（abort 已删，只剩 DELETE） | `abort`/`DELETE` 带 `directory`；分流正则失配时**显式失败**不回落（分流删除后此项只剩 `directory` + 失配须失败） | F3 |
| **P1-c** | 工具行映射 `status`/`title` 更新；非文本 content 走 unmapped；**cancelled 后的冲刷不计入 cadence 样本** | F8 + F13 残留问题 1 |
| **P1-d** | `session/list` 分页消费 `nextCursor`（>100 条时不得只显示一页且不声明 absence）；**字段映射已报文证实正确，不必重测** | F11（已订正） |
| **P1-e** | 回合结束的权威信号源：`idleSignal` 为 null 时如何定论 | F13 残留问题 2 + F7 |
| **P2-a** | 接 `resume`/`fork`/`close`/`set_mode`/`set_model` | 已声明能力零消费 |
| **P2-b** | 目录选择器（抄官方 picker） | 项目根硬伤 |
| **验证体系** | bridge/transport/main 加测；`check:traces` 支持 glob 与 prose 实测登记；清单覆盖动态控件；guard 正则扩形态；mock 不得恒 200 true | F16 |
| **规矩** | jsdom 例外登记（窄化到 `test/**` 的 DOM 结构断言）；版本下限校验；**新增 `check:boundary` 已落** | F17/F18 + T1 |

---

## 6. 本审计未能验证（不藏）

1. ~~notification `session/cancel` 端到端能否掐断在途 turn~~ → **已验 2026-09-24【实测】**，见 F1。新衍生出的未验项：cancel 发生时若有一条 `session/request_permission` 正挂在客户端，引擎侧如何收尾（关联 F10 的 MUST-cancelled）
2. `@agentclientprotocol/sdk@0.21.0` 包体不在本机（无 node_modules），方法名表取自 unpkg 已发布包【SDK-remote】，需 `bun install` 后比对 integrity 才能升【实测】
3. `session/fork`/`resume`/`close`/`set_mode`/`set_model` 本机从未上线
4. `always` 权限的持久化作用域
5. share 远端数据是否随删除清理
6. 跨包是否有 `plan`→update 的其它发射点
7. Windows 下 `fs/write_text_file` 的 path 字面量实际行为
8. MCP http/sse 折叠后引擎侧是否等价
9. `session/list` 不传 cwd 时的实际可见范围
10. 事件流断连 → `-32603` 路径无抓包
11. `--cwd` 参数在 acp 命令中疑似死参（handler 未引用），未测
12. **一切渲染观感**（无头禁令；本审计未开浏览器，不声称看过界面）

# 引擎契约全面审计报告

日期：**2026-09-24**。方法：四路只读子代理并行审计 —— 上游 ACP 源码、上游 HTTP 源码、我方脏假设、官方前端范式。  
**本文件是「黑盒猜测」的清算账。** 与 [`capability-map.md`](./capability-map.md) 的分工：capability-map 回答「产品功能有没有」；本文件回答「对引擎的每一次假设是否成立」。

**结论先行**：项目**已经是屎山**——不是代码量意义上的，是**契约知识全部靠抓包反推、且多处反推错了**。最严重的一条：我们整套 HALT 架构（双进程、端口分流、正则路由）建立在一个**方法错误的否证实验**上。

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
- **未闭合**：notification 形式的 cancel 端到端掐断在途 turn **仍未抓包验证**【未验】。需要新探针：`{"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId":…}}`（**无 id**）。

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

### F9 · 批准 `edit` 后引擎会反向调用 `fs/write_text_file`

- `PERM:84-86,99-115`：批准且权限为 edit 时，agent 调 client 的 `writeTextFile` 写回整文件。【源码】
- 我方 `clientCapabilities: {}` 且 `acp.ts:147` 把未知请求降级 unmapped 不回复。目前靠 SDK 侧 `client.writeTextFile?.()` 为 undefined 侥幸不炸，**但文档从未记载这条会来**。

### F10 · 审批的 `cancelled` 结局缺失

- ACP 规范：客户端 MUST 对所有未决 `request_permission` 回 `cancelled`；上游 `PERM:219-223` 把 cancelled 折成 `reject`。【文档 + 源码】
- 我方契约没有 cancelled 分支；HALT/RESTART 时未决审批永不回复。

### F11 · `session/list` 的分页与字段被过度声称

- 上游 `SVC:249-293`：`limit=100` 硬编码、`roots:true` 只列 root、`nextCursor` = 页尾 updatedAt 毫秒字符串、内存未落盘会话**置顶且无 title**。【源码】
- 我方 `responses.ts:39-57` 假设 `sessionId|id / title / updatedAt / cwd` 四字段，且**无分页**。
- **关键**：文档标【实测】，但仓内 **0 条 trace 记录过行字段名**（`grep updatedAt traces/*` → 0；spike 只 console.log keys）。整条 #2 验收依赖这个未被报文支持的映射。

### F12 · 五个已实现方法从未被我方使用

`session/resume`（不回放，只读 20 条恢复参数）、`session/fork`（回放 20 条）、`session/close`（内存移除 + best-effort abort）、`session/set_mode`、`session/set_model`。均【源码】。  
**load / resume / fork 的回放语义完全不同**——我方文档只写了 load。

### F13 · 选择性证据（文档只引用对自己有利的那次）

同进程 abort 的三次 halt-in-process trace：
| run | verdict | 说明 |
| --- | --- | --- |
| `04-13-06` | `NOT_STOPPED_IN_WINDOW` | 未停 |
| `04-16-30` | `updatesAfterAbort: 186` | **主响应 cancelled，但之后仍冲刷 186 条 update** |
| `04-22-08` | `STOPPED_IN_252MS_AFTER_0_FLUSHED_UPDATES` | 干净成功 |

文档只引用 04-22。【实测】  
且 `04-16` 的冲刷会污染 cadence 基线（`derive.ts:210-211` 对 cancelled 无特殊处理，`endTurn` 不丢样本）。

### F14 · 证据链已断的探针

- `spike/probe-http-abort.mjs:131` 经桥发 abort → 分流改动后它现在测的是**同进程** abort，会得出与文档相反的结论。【源码】
- `probe-halt-in-process.mjs` 现行源码里**不存在** trace 中的 `NOT_STOPPED_IN_WINDOW` / `idleSignal` 字段 → trace 无法从本仓复现。【实测】
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

### F20 · `cwd: "."` 违反 ACP

ACP 规范要求 `cwd` MUST be absolute path；我方 `main.ts:302,413` 在无 `facts.cwd` 时传 `"."`。现在走不到，一旦到即协议违规。【文档 + 源码】

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

## 4. 文档需即刻修正的假话清单

| 位置 | 现说法 | 应改为 |
| --- | --- | --- |
| `adapters/opencode-acp.md` §三 | `session/cancel` 不存在【实测】 | **notification 形式存在【源码】**；请求形态 `-32601` 是实验方法错误；notification 端到端【未验】 |
| `adapters` §三 | `session/list` 仅四字段【实测】 | 降级【未验】；补 `limit=100`/`roots:true`/`nextCursor`/内存会话置顶无 title【源码】 |
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

## 5. 修复顺序建议（待主人拍板，未开工）

| 优先级 | 动作 | 理由 |
| --- | --- | --- |
| **P0-a** | 新探针：notification `session/cancel` 端到端 | 决定整套双进程分流是留是删；不做这条，HALT 的一切结论都悬空 |
| **P0-b** | 契约补 `prompt.failed` / `link.down` / `permission.cancelled`；错误响应**不再当成功** | 止住「造事实」类缺陷（F6/F7/F10） |
| **P0-c** | 所有 `session/update` 按 `params.sessionId` 路由 | 多会话前提；停止事实串台（F4） |
| **P0-d** | 请求 id 与引擎请求 id 分域；RESTART 清 pending | 止住审批被吞、turn 挂死（F5） |
| **P1-a** | 中断判定改为事件驱动（`stopReason:cancelled` / status idle），HTTP 返回值只当「已受理」 | F2 |
| **P1-b** | `abort`/`DELETE` 带 `directory`；分流正则失配时**显式失败**不回落 | F3 |
| **P1-c** | 工具行映射 `status`/`title` 更新；非文本 content 走 unmapped | F8 |
| **P1-d** | `session/list` 分页 + 字段用真实报文重测并入库 | F11 |
| **P2-a** | 接 `resume`/`fork`/`close`/`set_mode`/`set_model` | 已声明能力零消费 |
| **P2-b** | 目录选择器（抄官方 picker） | 项目根硬伤 |
| **验证体系** | bridge/transport/main 加测；`check:traces` 支持 glob 与 prose 实测登记；清单覆盖动态控件；guard 正则扩形态；mock 不得恒 200 true | F16 |
| **规矩** | jsdom 例外登记或改测试；版本下限校验 | F17/F18 |

---

## 6. 本审计未能验证（不藏）

1. notification `session/cancel` 端到端能否掐断在途 turn（**最高优先待验**）
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

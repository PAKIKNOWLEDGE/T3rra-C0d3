# opencode ACP 实测映射表

时点：**2026-09-23**；**2026-09-24 按 [`engine-contract-audit.md`](../engine-contract-audit.md) 修订**（§三 cancel 端到端闭合与 session/list 实证、split-brain 入库、§四 F9 机制订正）。被测引擎：`opencode 1.18.32`（Windows，`opencode acp`），ACP `protocolVersion` **1**。  
对照基线：`omp 18.2.6`（t3rra-core）。对照对象：t3rra-core `docs/adapters/acp.md`（按 omp 报文，含有损列）。

**每条结论均标来源。** 与本文冲突时，**以本机实测为准**（本轮已纠正两处）。

工具与产物：

| 探针 | 用途 | 产物 |
| --- | --- | --- |
| `spike/spike-acp-opencode.mjs` | 握手 / 选项 / 可选真 prompt | `traces/opencode/*-handshake.jsonl`、`*-prompt.jsonl` |
| `spike/spike-acp-load.mjs` | **脱敏** load 回放（只记 kind） | `traces/opencode/*-load-redacted.jsonl` |
| `spike/spike-acp-sequencing.mjs` | load 时序 + effort 按模型 | `traces/opencode/*-sequencing-redacted.jsonl` |
| `spike/probe-session-cancel.mjs` | ACP `session/cancel` **request 形态**存在性（带 id → `-32601`；实验方法错误，见 §三订正） | `traces/opencode/*-cancel-probe.jsonl` |
| `spike/probe-http-abort.mjs` | **跨进程** abort（独立 serve）是否中断 | `traces/opencode/*-abort-probe.jsonl` |
| `spike/probe-acp-http-face.mjs` | `opencode acp --port` 是否自带 HTTP 面（零 token） | `traces/opencode/*-acp-http-face.jsonl` |
| `spike/probe-halt-in-process.mjs` | **同进程** abort 原始记录（已入库三份 trace 出自旧版脚本、不可由现行仓库复现，审计 F14；HALT 现行权威证据见下行） | `traces/opencode/*-halt-in-process.jsonl` |
| `spike/probe-cancel-notification.mjs` | `session/cancel` 无 `id` notification 端到端掐断（纯 stdio；不 `--port`、不第二进程、不桥） | `traces/opencode/opencode-acp-2026-09-24T10-34-39-594Z-cancel-notification.jsonl` |
| `spike/probe-split-brain.mjs` | HTTP `DELETE` 与 stdio `session/list` 的一致性（split-brain，provider-free） | `traces/opencode/opencode-acp-2026-09-24T10-35-48-113Z-split-brain.jsonl`、`traces/opencode/opencode-acp-2026-09-24T11-00-34-512Z-split-brain.jsonl` |
| （本地导出） | `opencode serve` `GET /doc` → OpenAPI 3.1，**162 paths** | `traces/opencode/openapi-1.17.18.json` |
| （官方 schema） | `https://opencode.ai/config.json` 的 `permission` | `traces/opencode/opencode-config.schema.json` |

规矩：spike 不进产物、`src/` 永不 import；**渲染/报文之外的判断不声称已验证**。

---

## 一、握手与能力【实测】

| 项 | 观测值 |
| --- | --- |
| agent | `OpenCode 1.18.32` |
| protocolVersion | `1`（与 omp 同） |
| authMethods | `[{ id: "opencode-login", name: "Login with opencode" }]` |
| agentCapabilities | `loadSession: true`、`sessionCapabilities: {close, fork, list, resume}`、`promptCapabilities: {embeddedContext: true, image: true}`、`mcpCapabilities: {http: true, sse: true}` |
| `authenticate(opencode-login)` | 返回 `{}` —— **与 omp 同坑：不是凭证证明** |
| 声明零能力后 | `reached back for: NOTHING`（未回头索取）→ 仅对**握手窗口**成立；capability 声明不拦截会话中 agent→client 请求（见下表后注与 §四 approval 行，审计 F9） |
| stderr | 0 行 |

**`promptCapabilities.image: true`**：图片随 prompt 交（本地附件），不是 omp 的 blob-broker 路径。

**`clientCapabilities: {}` 的含义（2026-09-24 订正，审计 F9）**：上表「未回头索取」只描述握手窗口。上游对 agent→client 调用的守卫是 `connection.requestPermission` / `connection.writeTextFile` 的**方法存在性检查**（`acp/permission.ts:56,102`），不是 capability 协商——声明空 capability 挡不住会话中的权限请求与 `fs/write_text_file`（行为见 §四 approval 行）。

## 二、`session/update` 报文全集【实测】

三次运行合并（空会话、历史回放、真 prompt）：

| kind | 出现场景 | 备注 |
| --- | --- | --- |
| `agent_message_chunk` | 真 prompt 流式 | 正文分块 |
| `agent_thought_chunk` | 真 prompt 流式 | 思考分块 |
| `user_message_chunk` | **仅回放** | 与 omp 同怪癖 |
| `tool_call` / `tool_call_update` | 真 prompt / 回放 | 成对 |
| `available_commands_update` | `session/new` 与 `session/load` 后 | slash/skills 广播 |
| **`usage_update`** | 真 prompt 结束时（**非无条件发**，条件见 §四 usage 行） | 字段【源码 2026-09-24】：`used = input + cache.read + cache.write`、`size = model.limit.context`、`cost {amount, currency:"USD"}`；⚠️ 与部分二手资料「不 emit」相反 |
| **`config_option_update`** | 改 model 后 | ⚠️ 上游文档未列此 kind |
| 未出现（可定论） | | `plan`、`current_mode_update`、`session_info_update`：协议联合有，但 `src/acp` **零发射点**【源码 2026-09-24】。`session/request_permission` 来不来问由 **permission 配置**决定、与 capability 声明无关（默认配置不问；配置 `permission.*="ask"` 后出现，见 §四与审计 F9） |

## 三、契约级行为【实测】

- **`session/load` 回放先流、响应后到**：有历史会话中 **141 条更新先到**，响应随后（sent 1848ms → response 2384ms）。  
  证据：`traces/opencode/opencode-acp-2026-09-23T06-46-05-107Z-sequencing-redacted.jsonl` 的 `load_timing`。  
  符合 ACP「MUST replay… respond only after all entries streamed」→ 适配器可把「load 已返回」当「历史完整」。  
  （首测曾挑到空会话、结论相反；换有历史会话才定——挑会话是此类实验的必要条件。）
- **`session/list` 四字段映射已被真实报文证实正确（2026-09-24 闭合，审计 F11）**：本仓 3 份 trace 记录了真实行（`traces/opencode/opencode-acp-2026-09-24T10-35-48-113Z-split-brain.jsonl`、`traces/opencode/opencode-acp-2026-09-24T11-00-34-512Z-split-brain.jsonl`、`traces/opencode/opencode-acp-2026-09-24T10-34-39-594Z-cancel-notification.jsonl`）【实测】。行形状 `{sessionId, cwd, title, updatedAt}`；**`updatedAt` 是 ISO-8601 字符串**（例 `"2026-09-24T10:35:50.218Z"`；上游 `acp/service.ts:268` `new Date(item.time.updated).toISOString()`）；新建会话**有** title（`New session - <ISO>`）。我方 `responses.ts:39-57` 的映射（sessionId|id 双写兼容、title/cwd 缺失退 `""`、`updatedAt` 用 `String()` 归一）对真实行全部成立——**映射本身正确**，旧「0 条报文支持」的说法作废。  
  已【源码】确认的行为：`limit=100` 硬编码、`roots:true` 只列 root 会话、`nextCursor` = 页尾条目 updatedAt 毫秒字符串、**内存中未落盘的会话置顶且无 title**。  
  **已接入产品**：`responses.ts` → `sessions.updated`；右栏 `[ SESSIONS ]`（**未做分页**）。删除走 HTTP **`DELETE /session/{sessionID}`**（OpenAPI）经桥 `/http` → 懒起 `opencode serve`（主人验收 #2 的路径；2026-09-24 曾把 DELETE 也改路由到 acp 端口，实测假成功——见下「DELETE 反向注意」——已改回分流）。  
  LOAD 走 ACP `session/load { sessionId, cwd, mcpServers }`（与 spike 同形）。
- **`session/cancel` 是 notification，不是「不存在」（2026-09-24 源码更正）**：  
  上游 `packages/opencode/src/acp/agent.ts:83` 实现 `cancel(CancelNotification)` → `service.ts:357-360` → `POST /session/{id}/abort`。  
  我方旧探针 `spike/probe-session-cancel.mjs` **以带 id 的 request 形式发出**，SDK 只在 notification 分支路由该名字 → 落到 `default` → `-32601`。  
  该 `-32601`【实测】只能证明「**request 形态不被支持**」，**不能**证明能力不存在。  
  notification 形态端到端**已实测可掐断在途 turn**【实测 2026-09-24】：`spike/probe-cancel-notification.mjs` → `traces/opencode/opencode-acp-2026-09-24T10-34-39-594Z-cancel-notification.jsonl`。  
  发 `{"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId":…}}`（**无 `id`**）后 **53ms**，在途 `session/prompt` 回 `{"stopReason":"cancelled"}`，verdict `CANCELLED_VIA_NOTIFICATION`。  
  纯 stdio，不需要 `--port`、不需要第二个进程、不需要桥。**HALT 因此走这条路径**；为 HTTP `abort` 而建的按路径分流结构已删除（commit 29f8ea0）。  
  → 详见 [`engine-contract-audit.md`](../engine-contract-audit.md) F1。当前 HTTP abort 路线的去留取决于这条验证。
- **HTTP `abort` 恒返回 `true`**：`handlers/session.ts:232-235` 不校验会话存在；run-state 是**进程内 + 按 directory 键控**的内存 Map（`session/run-state.ts:35-50,77-86`）。跨进程 abort = no-op 但 HTTP 200 `true`。反证 trace：`opencode-acp-2026-09-24T04-37-51-820Z-bridge-route.jsonl`（假 id → `200 "true"`）。**中断是否生效只能看 `stopReason:"cancelled"` / status 事件，不能看 HTTP 返回。**
- **`abort` / `DELETE` 的 `directory` / `workspace` 是 OpenAPI 定义的 query 参数**（本地导出 + `sdk/js/src/v2/gen/sdk.gen.ts:3913-3937`）；我方目前只发裸路径【源码】——单沙箱掩盖，接真项目根即错实例。
- **中断走 stdio notification，不走 HTTP**【实测 2026-09-24，commit 29f8ea0】：  
  - 权威路径：发无 `id` 的 `session/cancel` notification，在途 `session/prompt` 以 `stopReason:"cancelled"` 结束（**53ms**）。  
    探针 `spike/probe-cancel-notification.mjs`，trace `traces/opencode/opencode-acp-2026-09-24T10-34-39-594Z-cancel-notification.jsonl`。  
  - **HTTP `abort` 不再是本产品的中断手段，且它的返回值不构成证据**：`handlers/session.ts:227-235` 不校验会话存在、恒返回 `true`（上一条）。曾经为它建的 `acp --port` + 按路径分流已删除。  
  - 历史原料告警：`*-halt-in-process.jsonl` 三份 trace 出自一个已不在仓库中的旧版脚本（现行 `spike/probe-halt-in-process.mjs` 的 verdict 只有三个分支，拼不出其中的 `NOT_STOPPED_IN_WINDOW`），  
    **其 verdict 字符串不可作任何方向的解读**。可依赖的只有其中的原始字段：`mainStop:"cancelled"`、`stoppedWithinMs:244`、`updatesAfterAbort:186`、`idleSignal:null`。  
    仍成立的两个残留问题：取消后引擎还会冲刷大量 update（污染节奏基线）；窗口内没有权威的 idle 信号可用。
- **删除会话必须是两步：stdio `session/close` → HTTP `DELETE`**【实测 2026-09-24】：  
  单发 `DELETE` 只动库行——`DELETE` 得 200、同端口 `GET` 得 404，但 ACP 子进程的 `session/list` **仍列出该会话**（split-brain）。  
  证据：`traces/opencode/opencode-acp-2026-09-24T10-35-48-113Z-split-brain.jsonl`（盲审原始运行）+ `opencode-acp-2026-09-24T11-00-34-512Z-split-brain.jsonl`（可由 `spike/probe-split-brain.mjs` 复现）。  
  `session/close`（参数 `{sessionId}`，响应 `{}`）会做内存移除 + `abortBackingSession`（`acp/service.ts:347-355`）；实测先 close 再 DELETE、或先 DELETE 再 close，**事后 `session/list` 都不再列出**——见 `traces/opencode/opencode-acp-2026-09-24T11-15-49-216Z-delete-verify.jsonl`（`spike/probe-delete-verify.mjs`，provider-free）。  
  取顺序 **close → DELETE**（close 顺带中断在途 turn）。**此项代码尚未接**：`app/src/main.ts` 的删除目前只发 DELETE。【未验】close 一个正在跑 turn 的会话时客户端会收到哪些结束信号。
- **`session/set_config_option { sessionId, configId, value }` 可用**，响应带回**完整 `configOptions`**——界面照响应重渲染，不自维护清单。
- **`session/new` 响应不含 `modes`/`models` 字段**（`acp/service.ts:199-206`）：是**字段不存在**，不是 `null`。模式在 configOptions 的 `mode`。`load`/`resume`/`fork` 同样不返回。
- **`session/resume` / `session/fork` / `session/close` / `session/set_mode` / `session/set_model` 均已实现但本仓从未调用**【源码】。回放语义**不同**：`load` = 全量回放；`resume` = **完全不回放**（只读最近 20 条恢复 model/variant/mode）；`fork` = 只回放 20 条。
- **`session/cancel` 见上方更正条目**（notification 存在；请求形态 -32601 是实验方法错误）。

## 四、有损列（相对 omp）

| 能力 | omp | opencode 1.18.32【实测】 | 影响 |
| --- | --- | --- | --- |
| 模式 | `session.modes` | `modes: null`；`mode` 走 configOptions，**仅 `build` / `plan`** | 界面模式组仅两档（无 ASK）。按「只渲 runtime 清单」，这是正常输入 |
| effort | 有 `thinking` | **`effort`，仅对有 variants 的模型**：`deepseek-v4-pro`/`-flash`→`low`、`muse-spark-1.2/1.3`→`minimal`、`ling-3.0-flash-fin-free`→`low`；`big-pickle`/`mimo-v2.6`/`nemotron-*`→**无**。证据：`*-sequencing-redacted.jsonl` 逐模型 `set_config_option` 后清单 | 按当前模型清单动态渲染；先前「没有 effort」结论作废（当时默认模型无 variants） |
| `thinking` | 有该 option 名 | **不存在**；对应 `effort` | 契约若绑过 `thinking` 须改 |
| usage | `usage_update`＝上下文填充 | **有 `usage_update`**；字段【源码 2026-09-24】：`used = tokens.input + cache.read + cache.write`、`size = model.limit.context`、`cost = {amount: Σ assistant.cost, currency:"USD"}`。确为上下文填充率，与 `PromptResponse.usage`（token 明细）是两个量。**不是无条件发**：messages 拉取失败 / 无 providerID·modelID / 拿不到 context limit → 整条不发（`acp/usage.ts:195-206`、`service.ts:656-666`）。 | 两量区分成立；界面若显示填充率须容忍「本回合没有 usage_update」 |
| approval | **死的**（`permissions=false`） | **活着，但要配置才问**：项目 `permission.edit = "ask"` 后，真 prompt 触发 `session/request_permission`（agent→client，**非** `session/update`）。选项字面量【源码 `acp/permission.ts:20-24`】：`optionId` = `once` / `always` / `reject`，`kind` = `allow_once` / `allow_always` / `reject_once`（**无 reject_always**）。客户端 `reject` 后 turn 正常 `end_turn`。**`outcome:"cancelled"` 被引擎折成 `reject`**（`permission.ts:219-223`）。批准 `edit` 后引擎会**反向调用 client 的 `fs/write_text_file`** 写回整文件（`permission.ts:84-86,99-115`）——我方未实现该能力，目前靠 SDK 可选调用侥幸不炸，**文档必须记**。权限请求**按会话串行**（`permission.ts:37-49`）。 | omp 死掉的裁决在此恢复。**默认配置一次都不问**（静默放行）——是**配置问题不是能力缺口**，界面须能解释 |

## 五、对选型的含义

三条核心判据**已闭合**：

1. 报文是否存在 → **存在**，且多于上游说法（`usage_update`、`config_option_update`）。
2. options 能否填 model / mode / thinking → model ✓、mode ✓（两档）、effort **按模型** ✓、`thinking` 名 ✗。
3. `session/load` 是否可用 → **可用且规范**。

**代价仍是一个 AgentSource 实现**（架构承诺；本仓为整树重写，见 status）。界面侧三处均按 runtime 清单渲染：模式档数、effort 出现条件、会话列表无轮数。**图片不离本机**有报文层证据。

## 六、未闭合

1. **`allow_always` 语义**：权限记忆由引擎持久化（键是什么）还是每会话重来？界面显示「始终允许」前须知。
2. **默认静默放行**：默认 `permission` 不 `ask`，审批永不出现。产品是否点出「当前配置不会问你」——产品决策。
3. **`usage_update` 字段**是否即上下文填充率（与 `PromptResponse.usage` 是两量）。
4. **v2 HTTP SSE 断连/溢流**对静默判据的影响——本轮只测 ACP。
5. `session_info_update` 是否真的不存在。
6. **目标平台**：将来可能 NixOS。会翻出 Tauri 结论重审——WebKitGTK 坑见 `adapters/opencode-acp.md` 相关节与 `backends/dsh.md`。**现在不动，打包前须复核。**

# opencode ACP 实测映射表

时点：**2026-09-23**。被测引擎：`opencode 1.18.32`（Windows，`opencode acp`），ACP `protocolVersion` **1**。  
对照基线：`omp 18.2.6`（t3rra-core）。对照对象：t3rra-core `docs/adapters/acp.md`（按 omp 报文，含有损列）。

**每条结论均标来源。** 与本文冲突时，**以本机实测为准**（本轮已纠正两处）。

工具与产物：

| 探针 | 用途 | 产物 |
| --- | --- | --- |
| `spike/spike-acp-opencode.mjs` | 握手 / 选项 / 可选真 prompt | `traces/opencode/*-handshake.jsonl`、`*-prompt.jsonl` |
| `spike/spike-acp-load.mjs` | **脱敏** load 回放（只记 kind） | `traces/opencode/*-load-redacted.jsonl` |
| `spike/spike-acp-sequencing.mjs` | load 时序 + effort 按模型 | `traces/opencode/*-sequencing-redacted.jsonl` |
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
| 声明零能力后 | `reached back for: NOTHING`（未回头索取）→ 惰性前端前提**成立** |
| stderr | 0 行 |

**`promptCapabilities.image: true`**：图片随 prompt 交（本地附件），不是 omp 的 blob-broker 路径。

## 二、`session/update` 报文全集【实测】

三次运行合并（空会话、历史回放、真 prompt）：

| kind | 出现场景 | 备注 |
| --- | --- | --- |
| `agent_message_chunk` | 真 prompt 流式 | 正文分块 |
| `agent_thought_chunk` | 真 prompt 流式 | 思考分块 |
| `user_message_chunk` | **仅回放** | 与 omp 同怪癖 |
| `tool_call` / `tool_call_update` | 真 prompt / 回放 | 成对 |
| `available_commands_update` | `session/new` 与 `session/load` 后 | slash/skills 广播 |
| **`usage_update`** | 真 prompt 结束时 | ⚠️ 与部分二手资料「不 emit」相反 |
| **`config_option_update`** | 改 model 后 | ⚠️ 上游文档未列此 kind |
| 未出现 | | `session_info_update`；空能力客户端下 `session/request_permission` 初始不来问（配置 `permission.*="ask"` 后会出现，见 §四） |

## 三、契约级行为【实测】

- **`session/load` 回放先流、响应后到**：有历史会话中 **141 条更新先到**，响应随后（sent 1848ms → response 2384ms）。  
  证据：`traces/opencode/opencode-acp-2026-09-23T06-46-05-107Z-sequencing-redacted.jsonl` 的 `load_timing`。  
  符合 ACP「MUST replay… respond only after all entries streamed」→ 适配器可把「load 已返回」当「历史完整」。  
  （首测曾挑到空会话、结论相反；换有历史会话才定——挑会话是此类实验的必要条件。）
- **`session/list` 仅四字段**：`{sessionId, cwd, title, updatedAt}`，**无消息数/轮数**。  
  **已接入产品**：`responses.ts` → `sessions.updated`；右栏 `[ SESSIONS ]`。删除走 HTTP **`DELETE /session/{sessionID}`**（OpenAPI）经桥 `/http` + 本地 `opencode serve`。  
  LOAD 走 ACP `session/load { sessionId, cwd, mcpServers }`（与 spike 同形）。
- **`session/cancel` 不存在（本机 1.18.32）**：请求得 **`-32601 Method not found`**，stderr 同步出现。  
  → ACP 面无中断。替代：HTTP `POST /session/{sessionID}/abort`、`POST /api/session/{sessionID}/interrupt`（本地 OpenAPI）→ 中断走 HTTP 通道或杀进程（现 `RESTART ⟲`）。  
  trace：`traces/opencode/*-cancel-probe.jsonl`，探针 `spike/probe-session-cancel.mjs`。
- **`session/set_config_option { sessionId, configId, value }` 可用**，响应带回**完整 `configOptions`**——界面照响应重渲染，不自维护清单。
- **`session/new` 中 `modes` 为 `null`**：模式在 configOptions 的 `mode`。

## 四、有损列（相对 omp）

| 能力 | omp | opencode 1.18.32【实测】 | 影响 |
| --- | --- | --- | --- |
| 模式 | `session.modes` | `modes: null`；`mode` 走 configOptions，**仅 `build` / `plan`** | 界面模式组仅两档（无 ASK）。按「只渲 runtime 清单」，这是正常输入 |
| effort | 有 `thinking` | **`effort`，仅对有 variants 的模型**：`deepseek-v4-pro`/`-flash`→`low`、`muse-spark-1.2/1.3`→`minimal`、`ling-3.0-flash-fin-free`→`low`；`big-pickle`/`mimo-v2.6`/`nemotron-*`→**无**。证据：`*-sequencing-redacted.jsonl` 逐模型 `set_config_option` 后清单 | 按当前模型清单动态渲染；先前「没有 effort」结论作废（当时默认模型无 variants） |
| `thinking` | 有该 option 名 | **不存在**；对应 `effort` | 契约若绑过 `thinking` 须改 |
| usage | `usage_update`＝上下文填充 | **有 `usage_update`**；`PromptResponse.usage` 为 `{inputTokens, outputTokens, totalTokens, cachedReadTokens}` | 两量区分成立；`usage_update` 字段形状**待核** |
| approval | **死的**（`permissions=false`） | **活着，但要配置才问**：项目 `permission.edit = "ask"` 后，真 prompt 触发 `session/request_permission`（agent→client，**非** `session/update`），`toolCall kind=edit`，三档 `allow_once` / `allow_always` / `reject_once`；客户端 `reject` 后 turn 正常 `end_turn` | omp 死掉的裁决在此恢复。**默认配置一次都不问**（静默放行）——是**配置问题不是能力缺口**，界面须能解释 |

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

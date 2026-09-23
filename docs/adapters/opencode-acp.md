# opencode ACP 实测映射表

时点：**2026-09-23**。被测引擎：`opencode 1.18.32`（Windows，`opencode acp`），ACP `protocolVersion` **1**。
对照基线：`omp 18.2.6`（t3rra-core 现状引擎）。对照对象：t3rra-core 的 `docs/adapters/acp.md`
（那份是照 omp 报文写的，含"有损列"）。

**本文的每条结论都标了来源。** 二次资料与本文冲突时，**以本机实测为准**——本轮就抓到两处。

工具与产物（全部在本工作区，`t3rra-core` 未被改动）：

| 探针 | 用途 | 产物 |
| --- | --- | --- |
| `spike/spike-acp-opencode.mjs` | 握手 / 选项 / 可选出一次真 prompt | `traces/opencode/*-handshake.jsonl`、`*-prompt.jsonl` |
| `spike/spike-acp-load.mjs` | **脱敏** load 回放（只记 kind，不记文本/路径） | `traces/opencode/*-load-redacted.jsonl` |
| `spike/spike-acp-sequencing.mjs` | load 时序 + effort 按模型变化 | `traces/opencode/*-sequencing-redacted.jsonl` |
| （本地导出） | `opencode serve` 的 `GET /doc` → OpenAPI 3.1，**162 paths** | `traces/opencode/openapi-1.17.18.json` |
| （官方 schema） | `https://opencode.ai/config.json` 的 `permission` 定义 | `traces/opencode/opencode-config.schema.json` |

规矩沿用 t3rra-core：spike 不进产物、`src/` 永不 import；**渲染/报文之外的判断一律不许声称已验证**。

---

## 一、握手与能力【实测】

| 项 | 观测值 |
| --- | --- |
| agent | `OpenCode 1.18.32` |
| protocolVersion | `1`（与 omp 同） |
| authMethods | `[{ id: "opencode-login", name: "Login with opencode" }]` |
| agentCapabilities | `loadSession: true`、`sessionCapabilities: {close, fork, list, resume}`、`promptCapabilities: {embeddedContext: true, image: true}`、`mcpCapabilities: {http: true, sse: true}` |
| `authenticate(opencode-login)` | 返回 `{}` —— **与 omp 同一个坑：这不是凭证证明**，不能当"能干活" |
| 声明零能力后 | `reached back for: NOTHING`（它一次都没回头找我们）→ t3rra 的惰性前端前提**成立** |
| stderr | 0 行 |

**`promptCapabilities.image: true` 是换引擎第一动因的报文层证据**：图片随 prompt 交（本地附件），
不是 omp 那种先发布成 URL 的 blob-broker 路径。

## 二、`session/update` 报文全集【实测】

三次运行合并（空会话、有历史回放、一次真 prompt）：

| kind | 出现场景 | 备注 |
| --- | --- | --- |
| `agent_message_chunk` | 真 prompt 流式 | 正文分块 |
| `agent_thought_chunk` | 真 prompt 流式 | 思考分块 |
| `user_message_chunk` | **仅回放** | 与 omp 同一怪癖 |
| `tool_call` / `tool_call_update` | 真 prompt / 回放 | 成对出现 |
| `available_commands_update` | `session/new` 与 `session/load` 后 | slash commands/skills 广播 |
| **`usage_update`** | 真 prompt 结束时 | ⚠️ **与上游 issue/二手资料说的"opencode 不 emit"相反** |
| **`config_option_update`** | 改 model 后 | ⚠️ **任何文档里都没列过这个 kind** |
| 未出现 | | `session/request_permission`（空能力客户端下它从不来问）、`session_info_update` |

## 三、契约级行为【实测】

- **`session/load` 回放先流、响应后到**：有历史的会话里，**141 条更新先到**，响应随后（521ms 后）返回；
  → 符合 ACP "MUST replay the whole conversation, respond only after all entries streamed"
  → **适配器可以把"load 已返回"当"历史完整"的信号**。（这条我第一次测时挑到空会话，结论反了；
  换会话重测才定下来——所以"挑一个有历史的会话"是这类实验的必要条件。）
- **`session/list` 只给四个字段**：`{sessionId, cwd, title, updatedAt}`，**没有消息数/轮数**。
  界面若要显示"这个会话多少轮"，ACP 面里拿不到（要么不显示，要么走 HTTP API）。
- **`session/set_config_option { sessionId, configId, value }` 可用**，且**响应里带回完整的
  `configOptions`** —— 界面改 model/mode 后照它重渲染即可，不需要自己维护清单。
- `session/new` 里 **`modes` 为 `null`**：模式不在 `modes` 字段，而是 configOptions 的 `mode`。

## 四、有损列（相对 omp 的差分）

| 能力 | omp | opencode 1.18.32【实测】 | 影响 |
| --- | --- | --- | --- |
| 模式 | `session.modes` | `modes: null`；`mode` 走 configOptions，**只有 `build` / `plan`** | 界面模式组接上去**只有两档**（没有 ASK）。按"只渲染 runtime 给的清单"规矩，这是正常输入，不是损失 |
| effort | 有 `thinking` | **`effort`，且只对"有 variants 的模型"出现**：`deepseek-v4-pro`/`-flash`→`low`、`muse-spark-1.2/1.3`→`minimal`、`ling-3.0-flash-fin-free`→`low`；`big-pickle`/`mimo-v2.6`/`nemotron-*`→**无此 option** | 界面必须**按当前模型的清单**动态渲染；我先前"没有 effort"的结论作废（当时默认模型没有 variants） |
| `thinking` | 有这个 option 名 | **不存在**；对应物是 `effort` | 契约里若绑过 `thinking` 这个名字，要改 |
| usage | `usage_update`＝上下文填充率 | 实测**有 `usage_update`**，且 `PromptResponse.usage` 给 `{inputTokens, outputTokens, totalTokens, cachedReadTokens}` | 与"两个量（本轮 token vs 上下文填充）"的区分对得上；`usage_update` 的字段形状**待核** |
| approval | **死的**（`permissions=false`） | **活着，但要配置才会来问**：项目配置 `permission.edit = "ask"` 后，真 prompt 触发了 `session/request_permission`（**agent→client 请求，不是 `session/update`**），`toolCall kind=edit`，选项三档 `allow_once` / `allow_always` / `reject_once`；客户端选 `reject` 后 turn 正常 `end_turn` | **omp 那个死掉的裁决在这里回来了**。注意：**默认配置下它一次都不来问**（等于静默自动放行）——"approval 是否出现"是**配置问题，不是能力缺口**，界面要能解释这件事 |

## 五、对选型的含义

三条核心判据**已闭合**（`recommendation.md` §4）：

1. 映射表里"报文是否存在" → **存在**，且比上游说法多两种（`usage_update`、`config_option_update`）。
2. session options 能否填满 model / mode / thinking → model ✓、mode ✓（两档）、effort **按模型** ✓，`thinking` 这个名字 ✗。
3. `session/load` 回放是否可用 → **可用且规范**（回放先流、响应后到）。

**代价仍是一个 `AgentSource` 实现**（架构承诺成立）。界面侧要改的只有三处，且都是"按 runtime 的清单渲染"：
模式组档数、effort 的出现条件、会话列表不显示轮数。**图片不再离开本机**这条动因也拿到了报文层证据。

## 六、未闭合（写下来是为了别忘）

1. **`allow_always` 的语义**：选了它之后，权限记忆是引擎自己持久化（并按什么键记住）还是每会话重来？界面若显示"始终允许"必须知道这个答案。
2. **默认配置下的静默放行**：默认 `permission` 不给 `ask`，所以审批**永远不会出现**。产品要不要在界面上点出"当前配置不会问你"，还是只显示 runtime 给的事实？（这是产品决策，不是信息缺口。）
3. **`usage_update` 的字段**是否就是上下文填充率（与 `PromptResponse.usage` 是两个量）。
4. **v2 HTTP 的 SSE 断连/溢流行为**（文档自述 `volatile`）对 t3rra 静默判据与节奏基线的影响——本轮**只测了 ACP，没测 HTTP**。
5. `session_info_update` 是否真的不存在。
6. **目标平台**：仓库主人提到将来可能去 **NixOS** 上用这个 agent。这会把 Tauri 结论翻出来重审——已知账是 WebKitGTK 在 Linux 上的坑（踩过的证据：opencode 官方为此从 Tauri 退回 Electron；dsh 的桌面端 README 列了 Wayland 黑屏 / `WebKitWebProcess` `abort()` / Mesa ABI 不匹配）。**现在不动，但别到打包那天才发现。**
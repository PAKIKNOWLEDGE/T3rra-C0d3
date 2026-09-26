# 能力全图（coding-agent 前端对照）

**日期**：2026-09-24 盘点；**2026-09-26 修正**了 HALT、HTTP 分流、视觉三处过时描述。来源：对本仓 `app/` + `docs/` + `traces/` 的只读盘点（子代理），主总线整理入库。  
**用途**：空上下文接手时，除了 [`status.md`](./status.md) 验收账，还能一眼看到「完整 coding agent 应有什么 / 本仓有没有」。  
**契约正确性**另见 [`engine-contract-audit.md`](./engine-contract-audit.md)——本文件回答「功能有没有」，审计回答「对引擎的假设对不对」。**两者与 status 冲突时，以 status 为准；审计可推翻本文件的证据等级标注。**

**证据等级**见 [`README.md`](./README.md)：【实测】/【源码】/【文档】/【未验】。  
**状态**：`present` = 有；`partial` = 半截；`missing` = 缺；`N/A` = 本产品规则上不接。

**与验收清单的关系**：`status.md` §2 是**主人验收账**（交付标准）。本文件是**能力全景**（产品完整度地图）。两者冲突时，验收账优先；本文件补盲区。

---

## 0. 空上下文一分钟摘要

| 问 | 答 |
| --- | --- |
| 项目是什么 | opencode 的桌面控制台前端（ARK 族设计语言，见 [`design.md`](./design.md)），产品代码 `app/` |
| 引擎怎么接 | ACP stdio（桥）+ 通用 HTTP 透传 `/__t3/http` → 懒起 `opencode serve`（目前只用于 DELETE）。HALT 走 stdio notification，旧的 `/abort` 分流已于 `29f8ea0` 删除。**契约假设的正确性另见 [`engine-contract-audit.md`](./engine-contract-audit.md)** |
| 工作目录 | **固定** `app/.sandbox`——**没有选真实项目根的 UI**（已知硬伤） |
| 项目配置 | **app 内无入口**读写 `opencode.json` / `permission.*`（审批为何不问无处解释） |
| 验收账 | 见 `status.md` §2：全部有代码；#1、#10、#12（视觉第 3 代）待主人目视 |
| 最大结构性空洞 | cwd 选择器、设置/配置面、diff/文件/终端/图片等工作面（HALT 已接） |

---

## 1. 结论

核心最小闭环已有真实现：会话增删载、流式对话、工具行、markdown、reasoning、model/mode/effort、审批条、事件日志、静默判据、重启、HALT（#1，stdio `session/cancel` notification）。  
结构性空洞：**① 无项目/cwd 选择 ② 无设置/配置面 ③ 无 diff/文件/终端/搜索/图片等工作面**。  
HTTP 通道只接了一单：**DELETE**。diff、revert、pty、file、search 可以走同一通道，产品侧未接。

---

## 2. 能力对照表

### A. 项目 / 工作目录

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 显式项目根 / PWD 选择与显示 | **partial** | 【源码】`engine-bridge.ts` `sandboxDir()`；EXPERT `#pCwd` 只读 | 纯 UI + 桥 | cwd **恒为** `app/.sandbox`，用户不能选真目录 |
| `session/new` 传自定义 cwd | **partial** | 【源码】桥 `/spawn` 已收 `cwd`；`main.ts` 用 `facts.cwd` | 暴露 UI | 技术可通，缺选择器 |
| 多根 / 多项目 | **missing** | 无代码 | 产品决策 + UI | 单一 sandbox |
| 沙箱 vs 真 cwd | **partial** | 【源码】`sandboxDir()` 注释「never the owner's source」 | — | 刻意沙箱；切真目录 = 上一项 |
| 项目配置（`opencode.json` / `permission.*=ask`）定位与编辑 | **missing** | 【文档】adapters §四；config schema 在 traces；app 无 config 读写 | 文件通道 + 设置面 | **#10 审批不触发的根因没有 UI 解释入口** |

### B. 会话

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 列表 / 新建 / 加载 / 删除 | **present** | 验收 #2 主人已过 | ACP + HTTP DELETE | 整行 LOAD、`×` 删 |
| 重命名 | **missing** | 无代码；HTTP `PATCH /session/:id` 可改 title【源码】 | 契约/HTTP | title 只读 |
| fork / resume / close | **missing** | 【源码】上游 `acp/service.ts:295-407` **已实现**；capabilities 已声明 | 纯契约接线 | **回放语义各异**：load 全量 / resume 不回放 / fork 回放 20 条。见 [`engine-contract-audit.md`](./engine-contract-audit.md) F12 |
| archive | **missing**/【未验】 | 未查到 | — | 引擎面未确认 |
| 元数据 title/cwd/updatedAt | **present** | contract `SessionSummary` | ACP list | 四字段 |
| 消息数/轮数 | **N/A** | 【实测】list 无消息数；规则禁止造数 | — | — |

### C. 对话 / 运行时 UI

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 流式 / 工具行 / markdown / reasoning 折叠 / EVENTS / 静默 | **present** | 验收 #3 #5–#9 主人已过 | — | — |
| 中途取消 HALT | **present · 待目视**（#1） | 【实测】无 `id` 的 stdio `session/cancel` notification，53ms 内 `stopReason:"cancelled"`；10s 看门狗报「未确认」 | `…10-34-39-594Z-cancel-notification.jsonl` | HTTP abort 路线已删（恒返回 `true`，不可作证据）。见审计 F1/F2 |
| 重试 / 编辑末条 / fork 对话 | **missing** | 无代码 | 引擎机制多【未验】 | — |
| compact / 清上下文 | **missing** | `available_commands_update` 故意不映射（rule 5） | 【未验】+ 契约讨论 | — |
| 工具结果体（读了什么/grep 到什么） | **missing** | `tool_call` 只映射 title/status | **契约变更**（规则 23） | 目前只知「调了什么」 |

### D. 选项与配置

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| model / mode / effort / 任意 configOptions | **present** | 按 category 泛化，无 id 白名单 | ACP | — |
| permission（ask/allow）展示与设置 | **missing** | 在**配置文件**非 session option | 配置面 | 审批默认放行的根因 |
| 应用设置面板 | **missing** | 全仓无 | 纯 UI | — |
| 主题仅暗色外壳 | **N/A** | 设计锁定（[`design.md`](./design.md)） | — | 不是缺口 |
| 语言 i18n | **missing**（低） | `lang=zh-CN` 写死 | 纯 UI | — |

### E. 审批 / 安全

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 三档审批 UI | **partial**（#10 待目视） | 回包与 trace 同形【实测】 | 需 `permission.*=ask` | 默认永不触发；`optionId` 字面量 `once/always/reject`；`cancelled`→折成 reject；批准后引擎会反向调 `fs/write_text_file`（我方未实现）；权限按会话串行。见审计 F9/F10 |
| 审批时 diff 预览 | **missing** | HTTP `session.diff` 存在【文档】 | HTTP + UI | 盲签风险 |
| allow_always 语义 | **【未验】** | adapters §六.1 | 探针 | 点「始终允许」前须知 |
| 「当前配置不会问你」 | **missing** | adapters §六.2 | 读配置 | 现只写「没有请求」 |

### F. 文件与工具面

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 文件树 / 查看器 | **missing** | 无；OpenAPI 有 file 端点 | HTTP fs + UI | — |
| diff / revert | **missing** | OpenAPI 有；check-app 禁词 DIFF/REVERT | HTTP + UI | — |
| 终端 PTY | **missing** | OpenAPI 有 | WS + UI | 禁词 PTY |
| 搜索 / grep 面 | **missing** | OpenAPI 有 | HTTP + UI | — |
| todo/plan 一等视图 | **N/A** | 规则 5；禁词 TODO | — | 引擎有、契约拒 |

### G. 传输 / 外壳

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| ACP stdio | **present** | bridge + transport | — | 规则 4：唯一字节通道 |
| HTTP 透传 | **partial** | `transport.http` → 懒起 serve | — | 只用于 DELETE；**DELETE 未带 `directory`/`workspace`**（F3）；删除前没发 `session/close`（F21）。分流已删 |
| 断链 / 重启 / 链路态 | **partial**/present | 已连接 / 未连接；「字节通道已断开」结局条；重启 | — | 退出禁输入；无自动重开会话 |
| Tauri 外壳 | **missing**（P2） | status 待补清单 | Tauri 工程 | 替换 bridge 时 transport 不变 |

### H. 图片

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 引擎 image | **present**【实测】 | `promptCapabilities.image: true` | — | 本地附件 |
| 粘贴 / 附件 UI | **missing** | status 开放项 | 网页 paste/File | Tauri 是否必须【未验】 |
| prompt 带图 | **missing** | `main.ts` 只发 `[{type:"text"}]` | 发送路径加 image 块 | — |

### I. 多会话

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 列表存多条 | **present** | #2 | ACP list | — |
| 同时跑多个 / 后台会话 | **missing** | 单 transport、单 `view.sessionId`、全局 busy | 架构按会话分账 | status P1 曾列「多会话」 |
| 列表显示运行中 | **missing** | list 无状态字段 | 事件路由到非活动会话 | — |

### J. 操作流

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 设置面板 / 配置编辑器 | **missing** | 无 | UI + 文件 | 解锁「为何不问我」 |
| 空态可恢复 | **present** | 列表空态与记录空态都有「新建会话」、placeholder 链 | — | AGENTS §三 |
| 导出会话 | **missing** | eventLog/stream 在内存 | 本地导出 | 低成本 |
| Esc = HALT | **present**（#1） | 输入框内 Esc 走同一 `#halt` 路径（console.ts） | — | 「中止」只在运行中出现，与「发送」共用一个位置 |
| 可访问性 | **partial** | aria-*、focus、reduced-motion | — | 终判归主人目视 |
| 最近错误 / 失败恢复输入框 | **present** | AGENTS §三 | — | 最近错误在「诊断」分节（ⓘ） |

---

## 3. 建议优先级（子代理 Top 10，**未拍板**）

供主人取舍；**不是已决定计划**：

1. ~~HALT（验收 #1）~~ **已实现，待目视**：stdio notification  
2. **项目根 / cwd 选择器**——固定 sandbox = 不能对真项目干活  
3. **permission 配置可见/可设**——否则 #10 永看不到真请求  
4. 多会话并发 / 后台跑  
5. fork / resume / close 接线（ACP 已声明）  
6. 审批时 diff  
7. 粘贴图片  
8. 导出会话  
9. 工具结果体（规则 23 先改 adapters）  
10. 重试 / 编辑末条（引擎机制先【未验】）

并列：设置面板、PTY、文件浏览器、搜索——依赖重，建议 1–5 之后。

---

## 4. 未能验证

1. OpenAPI 162 路径未逐条展开；`session.rename` / compact 是否存在【未验】  
2. `allow_always` 持久化  
3. fork/resume/close 实际调用形状（仅 capabilities 声明）  
4. ~~跨进程 abort~~ → 已闭合：跨进程无效（返回 `true` 但流不断），HTTP abort 路线整体删除，改走 notification  
5. 删除后 `storage/session_diff/` 是否清理  
6. 一切渲染观感（无头禁令；本文件不含「看过界面」声称）

---

## 5. 维护

- 大状态变更（验收勾选、新能力落地）**改 [`status.md`](./status.md)**；本文件在能力档位变化时同步一行状态与证据。  
- 勿把本文件写成第二个「在做什么」——权威仍是 status。

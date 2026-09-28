# 能力全图（coding-agent 前端对照）

**整理：2026-09-28。** 基于已记录的实现与主人验收同步档位；本轮没有重新做代码审计。本文回答“能力有没有”，[status.md](./status.md) 回答“验收、遗留、现在做什么”，[审计](./engine-contract-audit.md)与 [ACP 映射](./adapters/opencode-acp.md)保留证据。

状态：`present` = 已有；`partial` = 明确缺少一部分；`missing` = 尚未实现；`N/A` = 当前产品不接。**present 不等于覆盖所有故障情形**。证据等级见 [文档索引](./README.md)。

## 0. 空上下文一分钟摘要

- 核心单会话浏览器控制台已由主人验收，ARK 视觉与动效保留。
- ACP stdio 承担主要引擎交互；HTTP 仅用于删除。中止用 notification，不用 HTTP abort。
- 项目目录可原生选择并导入；配置入口只覆盖项目 `permission.edit`。
- 下一阶段是 Tauri Windows 封装，未执行；多会话及工具工作面后置，准确范围见 status §4.6、§8。

## 1. 能力边界

列表里有多条历史会话不等于后台会话可并发运行。工单详情已有真实输出，不等于已有文件树或 diff 工作面。编辑审批可点击不等于 F9 写回已经闭合。下面按这些边界记录，不把未来计划标成 partial。

## 2. 能力对照表

### A. 项目 / 工作目录

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 显式项目根 / PWD 选择与显示 | **present** | 左栏 `#cwdInput` + `#cwdBrowse` + `#cwdApply`；系统目录选择器确定后自动导入并重启 ACP，也可手输后应用 | 纯 UI + 桥 | 目录存在性由桥确认 |
| `session/new` 传自定义 cwd | **present** | 【源码】桥 `/spawn` 收 `cwd`；`transport.spawn(cwd)`；`main.ts` 用 `facts.cwd` | — | 新引擎进程按所选目录启动 |
| 多根 / 多项目 | **missing** | 无项目列表 | 产品决策 + UI | 当前一次只运行一个 cwd |
| 沙箱 vs 真 cwd | **partial** | 【源码】`sandboxDir()` 仍是默认值 | — | 未选择时仍用 `app/.sandbox`；选中后可切真目录 |
| 项目配置（`opencode.json` / `permission.*=ask`）定位与编辑 | **partial** | 左栏「审批策略」读写项目级 `permission.edit`；其它规则仍需手工编辑 | 桥端 cwd 配置读写；上游加载路径与 `Config.update` 路径不一致 | **#10 现可解释并切换审批触发条件** |

### B. 会话

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 列表 / 新建 / 加载 / 删除 | **present** | 验收 #2 主人已过 | ACP + HTTP DELETE | 整块 = 打开、`×` = 删 |
| 重命名 | **missing** | 无代码；HTTP `PATCH /session/:id` 可改 title【源码】 | 契约/HTTP | title 只读 |
| fork / resume / close | **present** | 【源码】上游 `acp/service.ts:295-407` 已实现；本仓已接 `resume`、`fork`、`close`，其中 `resume` 用于刷新空闲会话恢复引擎态，`fork` 由会话行 ↗ 触发；主人已验收 | F12 | **回放语义各异**：load 全量 / resume 不回放 / fork 回放 20 条。见 [`engine-contract-audit.md`](./engine-contract-audit.md) F12 |
| archive | **missing**/【未验】 | 未查到 | — | 引擎面未确认 |
| 元数据 title/cwd/updatedAt | **present** | contract `SessionSummary` | ACP list | 四字段 |
| 消息数/轮数 | **N/A** | 【实测】list 无消息数；规则禁止造数 | — | — |

### C. 对话 / 运行时 UI

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 流式 / 工具行 / markdown / reasoning 折叠 / EVENTS / 静默 | **present** | 验收 #3 #5–#9 主人已过 | — | — |
| 中途取消 HALT | **present**（#1） | 【实测】无 `id` 的 stdio `session/cancel` notification，53ms 内 `stopReason:"cancelled"`；10s 看门狗报「未确认」 | `…10-34-39-594Z-cancel-notification.jsonl` | HTTP abort 路线已删（恒返回 `true`，不可作证据）。见审计 F1/F2 |
| 重试 / 编辑末条 | **missing** | 尚未接入；fork 单独见 B 节 | 引擎机制【未验】 | — |
| compact / 清上下文 | **missing** | `available_commands_update` 故意不映射（rule 5） | 【未验】+ 契约讨论 | — |
| 工具结果体（读了什么/grep 到什么） | **present** | F8 已接真实目标、参数、输出、错误；主人验收 | `tool_call(_update)` | 按需打开浮动 inspector；未报告字段不编造 |
| 上下文用量 | **present** | `usage_update` 映射 `usage.updated` | 引擎有条件发出 | 缺失显示未报告，不等于 token 明细 |

### D. 选项与配置

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| model / mode / effort / 任意 configOptions | **present** | 按 category 泛化，无 id 白名单 | ACP | — |
| permission（ask/allow）展示与设置 | **partial** | 左栏「审批策略」覆盖 `permission.edit`；其它 permission key 未接 | 配置面 | 默认放行原因可见、可切换 |
| 应用设置面板 | **missing** | 全仓无 | 纯 UI | — |
| 主题仅暗色外壳 | **N/A** | 设计锁定（[`design.md`](./design.md)） | — | 不是缺口 |
| 语言 i18n | **missing**（低） | `lang=zh-CN` 写死 | 纯 UI | — |

### E. 审批 / 安全

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 三档审批 UI | **partial**（UI 主人已验收） | 回包与 trace 同形【实测】 | 需 `permission.*=ask` | 默认永不触发；`optionId` 字面量 `once/always/reject`；`cancelled`→折成 reject；批准后引擎会反向调 `fs/write_text_file`（我方未实现）；权限按会话串行。见审计 F9/F10 |
| 审批时 diff 预览 | **missing** | HTTP `session.diff` 存在【文档】 | HTTP + UI | 盲签风险 |
| allow_always 语义 | **【未验】** | adapters §六.1 | 探针 | 点「始终允许」前须知 |
| 「当前配置不会问你」 | **present** | 启动后读取 cwd 下 `opencode.json`，左栏显示「默认放行」等策略；迟到读取不会覆盖新选择 | 读配置 | 更多 permission 规则仍需手工配置 |

### F. 文件与工具面

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 文件树 / 查看器 | **missing** | 无；OpenAPI 有 file 端点 | HTTP fs + UI | status §4.6 未来更新计划 |
| diff / revert | **missing** | OpenAPI 有；check-app 禁词 DIFF/REVERT | HTTP + UI | status §4.6 未来更新计划 |
| 终端 PTY | **missing** | OpenAPI 有 | WS + UI | status §4.6 未来更新计划 |
| 搜索 / grep 面 | **missing** | OpenAPI 有 | HTTP + UI | status §4.6 未来更新计划 |
| todo/plan 一等视图 | **N/A** | 规则 5；禁词 TODO | — | 引擎有、契约拒 |

### G. 传输 / 外壳

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| ACP stdio | **present** | bridge + transport | — | 规则 4：唯一字节通道 |
| HTTP 透传 | **partial** | `transport.http` → 懒起 serve | — | 只用于 DELETE；F21 已接 close → DELETE → list 确认；directory/workspace 遗留见 status §4 |
| 断链 / 重启 / 链路态 | **partial**/present | 已连接 / 未连接；「字节通道已断开」结局条；重启 | — | 退出禁输入；无自动重开会话 |
| Tauri 外壳 | **missing**（下一阶段） | status §8 仅有计划 | Rust 宿主 + 桌面 Transport + 生产构建 | 保留接口与 TS 契约，迁移系统 I/O |

### H. 图片

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 引擎 image | **present**【实测】 | `promptCapabilities.image: true` | — | 本地附件 |
| 粘贴 / 附件 UI | **missing** | status §4.6 未来更新计划 | 网页 paste/File | Tauri 是否必须【未验】 |
| prompt 带图 | **missing** | `main.ts` 只发 `[{type:"text"}]` | 发送路径加 image 块 | status §4.6 未来更新计划 |

### I. 多会话

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 列表存多条 | **present** | #2 | ACP list | — |
| 同时跑多个 / 后台会话 | **missing** | 单 `view.sessionId`、全局 busy；尚未做按会话分账 | 架构按会话分账 | status §4.6 未来更新计划 |
| 列表显示运行中 | **missing** | list 无状态字段 | 事件路由到非活动会话 | status §4.6 未来更新计划 |

### J. 操作流

| 能力 | 状态 | 证据 | 依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 完整配置编辑器 | **missing** | 现有编辑审批 selector 不等于完整配置面 | UI + 文件 | 应用设置面板见 D 节 |
| 空态可恢复 | **present** | 列表空态与记录空态都有「新建会话」、placeholder 链 | — | AGENTS §三 |
| 导出会话 | **missing** | eventLog/stream 在内存 | 本地导出 | status §4.6 未来更新计划 |
| Esc = HALT | **present**（#1） | 输入框内 Esc 走同一 `#halt` 路径（console.ts） | — | 「中止」只在运行中出现，与「发送」共用一个位置 |
| 可访问性 | **partial** | aria-*、focus、reduced-motion | — | 终判归主人目视 |
| 最近错误 / 失败恢复输入框 | **present** | AGENTS §三 | — | 最近错误在「诊断」分节（ⓘ） |

---

## 3. 实施顺序

只在 [status.md §8](./status.md) 维护当前 Tauri 计划；明确后置的能力见该文 §4.6。本文不再保留第二份 Top 10 排期。重命名、归档、完整设置、重试等其余 missing 项尚未排期。

## 4. 未能验证

- `allow_always` 的持久化作用域、F9 客户端写回及 Windows 路径边界。
- compact / archive 等未来能力的引擎接口，不能用旧 OpenAPI 快照直接定实现。
- 删除后的 share 远端数据和历史差异存储清理。
- WebView2 安装态、桌面 transport、安装 / 卸载与进程树清理，全部待 Tauri 阶段执行。
- 主人已有浏览器目视结论；本次文档整理未重新查看渲染，也没有桌面观感结论。

## 5. 维护

- 大状态变更（验收勾选、新能力落地）**改 [`status.md`](./status.md)**；本文件在能力档位变化时同步一行状态与证据。  
- 勿把本文件写成第二个「在做什么」——权威仍是 status。

# 现状

> **只写现在为真的事。** 条目过时就改或删；旧叙事进 [`archive/`](./archive/) 或 git 历史，不在这里堆日志。
> 决定只在 §5「决定记录」写一行（带日期）。规矩与目录见 [`AGENTS.md`](../AGENTS.md)。
> 最后整理：2026-09-28（浏览器版本收口、Tauri 封装规划）。重构前的全文存档：[`archive/status-2026-09-26.md`](./archive/status-2026-09-26.md)。

## 1. 一句话

**浏览器版核心主流程及视觉已由主人验收通过；Tauri 第一、二阶段已完成并通过主人验收。** 当前已有可运行的桌面开发版和 debug 可执行文件，可以进入安装包准备；生命周期压力验证、脱离仓库安装验证和正式安装包仍未完成。封装计划与阶段证据见 §8。

【文档：主人验收】已交付会话管理、历史回放、流式对话、中断、cwd 选择、项目编辑审批策略、刷新恢复、工单详情、上下文用量及 F12 会话能力。机读结果与目视验收分开登记，见 §3。

扩展功能按主人的取舍留到未来版本（§4.6）。这是范围收口，不代表技术限制已经消失；§4 的遗留项仍保留。

## 2. 仓库主人验收清单

验收依据：主人连续逐轮反馈及 2026-09-28「验收全部通过」。这是浏览器版本的使用验收，不替代安装包或所有引擎边界条件的验证。

| 范围 | 状态 | 交付行为 |
| --- | --- | --- |
| ARK 第 3 代、全局动效、顶栏资源布局 | 主人已验收 | 保留实心块、资源条、记录流、工单浮窗；页面进场与会话切换动效；减少动态效果时降级 |
| 会话新建 / 列表 / 打开 | 主人已验收 | 打开应用不自动建垃圾会话；历史回放结束恢复输入，缺少响应 session id 时用请求关联补足；迟到响应隔离 |
| F21 删除 | 主人已验收 | `session/close → HTTP DELETE → session/list`；仅列表确认消失才报告删除，失败保留原行 |
| 中断与错误恢复 | 主人已验收 | 按钮 / 输入框 Esc 发送无 id 的 `session/cancel`；等待回合结局，超时显示未确认；错误不伪装成空列表 |
| 回复、思考、事件、节奏 | 主人已验收 | 流式回复、markdown、折叠思考、事件日志；节奏样本不足写未建立 |
| cwd 与目录选择器 | 主人已验收 | 原生选择目录，确定后自动导入并重启 ACP；取消、失败或超时恢复可操作状态 |
| 审批卡与项目审批策略 | 主人已验收 | Workspace 设置 `permission.edit`，保存后重启；版本和 cwd 校验防迟到配置回退；F9 写回及 always 作用域仍见 §4 |
| usage | 主人已验收 | 有 `usage_update` 才显示上下文用量，缺失显示未报告 |
| F19 刷新恢复 | 主人已验收，保留已知竞争态 | 复用桥进程、补发有限缓存；恢复期间锁定输入，原回合结束后解锁；重复刷新不重复渲染恢复指令 |
| F8 工单详情 | 主人已验收 | 摘要保持低噪；点工单弹出 inspector，查看引擎真实目标、参数、状态、输出与错误 |
| F12 | 主人已验收 | 空闲刷新 `session/resume`；行内 ↗ `session/fork`；模式 / 模型走 `session/set_mode` / `session/set_model`；close 已由删除接入 |

## 3. 验证与复验入口

启动和前置条件集中在根目录 [README](../README.md)。浏览器打开终端打印的 URL（默认 `http://localhost:5191/`）；视觉对照 [demo/ark.html](../demo/ark.html)。本轮没有再次开浏览器或做代码审查，沿用主人的验收结论。

需要复验时用一个可丢弃的项目目录，opencode 1.18.x 已能在终端对话；选择引擎实际提供的模型。按以下五步走，每步检查可见结果：

1. 打开页面，点「选择目录」并确定：路径自动导入，重启后就绪；再打开选择器并取消，路径保持不变。
2. 把「审批策略」设为「每次询问」，发送 `请在当前目录创建 acceptance-note.txt，内容仅为 acceptance-ok。写入前等待批准。`：出现审批卡，先拒绝；再发同一指令并批准。分别核对拒绝没有写入、批准后文件真实存在；若 F9 路径导致未落盘，按 §4 记录失败，不能只凭卡片消失宣布写入成功。
3. 发送 `请先列出当前目录的文件，再读取其中一个文本文件并总结；不要修改文件。`：有真实回复与工单；点卡片可打开和关闭详情，内容不撑开中栏；没有 usage 时明确显示未报告。
4. 打开历史会话，等 placeholder 从「正在回放历史」变成「下达指令」再发送新指令；运行时刷新，应恢复同一会话，用户指令只出现一次；结束后恢复输入。中断另起一轮较长任务，预期最终显示中止或明确未确认。
5. 模式 / 模型切换后检查引擎回报，点 ↗ 得到分叉；空闲刷新可恢复选项。删除测试会话，预期核对列表后才消失，不自动新建会话。

### 第一阶段桌面骨架验收

前置：Windows x64、WebView2、Node / npm、Rust MSVC 工具链；本阶段不要求 opencode 已登录，因为窗口仍使用浏览器开发桥。仓库根目录执行 `npm run tauri:dev`，不打开 localhost 页面，直接观察 Tauri 窗口。

1. 等待窗口出现：预期看到 ARK 页面、随包字体和既有布局，不弹出空白页或 Vite 错误。
2. 调整窗口大小并观察资源条、工单 inspector、左侧会话列表：预期与浏览器版一致，不出现撑爆、遮挡或明显错位。
3. 关闭窗口后再次执行 `npm run tauri:dev`：预期窗口可再次启动，静态页面仍能加载。
4. 尝试点击页面控件：预期页面保持可见；涉及引擎、目录选择或配置的功能本阶段可暂不验收，因 Rust transport 尚未迁移。

人工验收结论只覆盖窗口与静态页面加载；通过后才进入 §8.4 第 2 阶段 Rust 字节宿主。

**机读检查【实测：2026-09-28】**：`npm run check:all` 七道闸全绿，10 个测试文件 / 89 项单测通过；`check:app` 为 13/13 控件接线、69/69 renderer id、2/2 字体文件；`check:boundary` 无越界，demo、traces、docs 检查通过。Tauri 第一阶段另通过 `npm run build`、`npx tauri info`、`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`、`cargo metadata --manifest-path src-tauri/Cargo.toml --no-deps`、`cargo check --manifest-path src-tauri/Cargo.toml`、`npx tauri build --debug --no-bundle`；可执行文件为 `src-tauri/target/debug/t3rra-c0d3.exe`。这些结果只证明静态页面与窗口骨架可编译，不证明尚未迁移的 Rust transport 或完整桌面宿主可用，也不替代人工复验。

## 4. 已知未做 / 只做了一半

以下依据现有审计与能力记录整理，本轮未重新审查产品代码。未验行为不因界面验收通过而升级为已验证。

| 遗留项 | 影响与处理边界 |
| --- | --- |
| F9：`fs/write_text_file` 未实现 | 上游批准 edit 后可反向请求写回；卡片批准不保证落盘。桌面版须做真实文件验收，若受此阻塞，应单独修契约再继续发布；不能顺手给壳开放任意路径写入 |
| F3：DELETE 未显式带 directory/workspace | 已有 cwd 选择不证明跨目录删除正确；会话存在时上游可从行数据取得目录。桌面回归必须覆盖非默认 cwd，失败则作为发布阻塞修复 |
| F11：列表只取首批 100 条 root 会话 | 不消费 `nextCursor`，大列表不完整；分页留待后续 |
| F13：取消后冲刷、缺权威 idle | 可能污染节奏样本；保持缺失提示，不根据 HTTP 成功推断空闲 |
| F19：排队输入竞争态 | 上游允许执行中继续接收并排队输入；主人已接受当前限制，不借封装扩展成多会话编排 |
| 连接与进程状态尚未统一 | SSE `link.down` 与 `engine.exited` 不等价；桌面宿主迁移时必须分别传递，不把断开视图当作引擎完成 |
| 审批语义和配置范围 | `allow_always` 持久化范围未验；入口只支持项目级 `permission.edit`，其它规则手动配置；JSONC / 无效 JSON 显式报错，不覆盖 |
| 版本与证据债务 | 默认引擎候选已修；已有最低版本检查不等于锁定 1.18.x 上界。F14 的旧探针例外见 AGENTS；F16/T7 已补接线测试与动态控件清单，但不代表宿主 I/O 全覆盖 |
| 工程 | 规则 22 构建产物断言、契约显式版本号尚未落地；Tauri 生产构建需要补前者，后者在下次 schema 变更时处理 |
| 视觉 | 窄窗、长会话折叠、字体回退与错误态限制统一见 [design.md §7](./design.md) |

已经修复的 F1/F2/F4/F5/F6/F7/F10/F15/F17/F18/F20 与后续 F8/F12/F16/F19/F21，不再混在待办里；审计保留发现时的证据快照，现状以本页为准。

## 4.5 当前收口

本轮已完成 §8.4 第 1、2 阶段并通过主人验收：**Tauri 依赖、Rust 工程、静态前端 build、开发窗口、ACP 子进程宿主、LF/UTF-8 字节分帧、stdin 写入、退出 / stderr / link-down 通道、本地 HTTP 透传和跨目录历史回放均已落地。** 浏览器仍保留开发桥；Tauri 窗口按运行时选择 Rust transport。当前未完成的是完整桌面回归、生命周期压力验证、脱离仓库安装验证和 NSIS 安装包，不把本阶段称为最终桌面版完成。

## 4.6 未来更新计划

主人明确后置：**多会话、文件树、diff、终端、搜索、会话导出、图片输入**。它们不阻塞当前桌面封装，也不能因包装成桌面端就标记为已完成。

其它候选能力（重命名 / 归档、多项目、完整设置、更多审批配置等）见 [capability-map.md](./capability-map.md)，尚未排实施顺序。NixOS 继续为 P2；不与 Windows 首包同时交付。

## 5. 决定记录

| 日期 | 决定 | 依据 / 位置 |
| --- | --- | --- |
| 2026-09-21 | 外壳只做暗色（夜里用） | 仓库主人 |
| 2026-09-23 | `t3rra-C0d3` 是唯一工程树；`t3rra-core` 只读，改前问主人 | 仓库主人 |
| 2026-09-23 | 四条边界：继承规则不继承代码；主平台 Windows + WebView2、NixOS 为 P2；实现全部新写；验收 = 机读清单 + 主人抽查 | 仓库主人；[`rules.md`](./rules.md) |
| 2026-09-23 | CJK 字体用 HarmonyOS Sans SC 随包 | 仓库主人；`app/fonts/README.md` |
| 2026-09-24 | 引擎 = opencode（ACP）；换掉 omp 的直接原因是 `blob-broker` 会把图片发到第三方图床 | [`backends/omp.md`](./backends/omp.md)；[`archive/recommendation.md`](./archive/recommendation.md) |
| 2026-09-24 | 外壳 Tauri，**Electron 不可接受** | 仓库主人 |
| 2026-09-24 | HALT 走 stdio `session/cancel` notification，删除 HTTP abort 与分流（`29f8ea0`） | 审计 F1/F2；trace `…cancel-notification.jsonl` |
| 2026-09-24 | 产品目的 = 自用；视觉层优先于后端存续 | 仓库主人 |
| 2026-09-24 | 契约修复优先于新功能；P0-d 采用按报文形状判定响应 | 审计 F1–F7、F10、F21；原批次进度见 git 历史 |
| 2026-09-24 | jsdom 仅允许在 `test/**` 做 DOM 结构断言 | AGENTS §三 |
| 2026-09-26 | **视觉金标准 = 3NDM1N15T4T0R 的 ARK 族**（明日方舟实机界面）；旧 `ark-console` 范式否定；主操作色由青改蓝 | [`design.md`](./design.md) |
| 2026-09-26 | END 族冻结，不做双主题 | [`design.md`](./design.md) §1 |
| 2026-09-26 | 设计是项目核心资产；**opencode 保留**。主人澄清：强调设计的重要性，不等于现在要换后端 | 仓库主人 |
| 2026-09-26 | 文档系统重构：一件事只写一处；被取代的文档归档不删 | [`AGENTS.md`](../AGENTS.md) §六 |
| 2026-09-26 | 现行实施顺序集中维护在 status，主人有否决权 | 冷启动接手测试发现「没有已决定的顺序」是最大的交接缺口 |
| 2026-09-26 | 验收采用「目视通过 → 记录现状 → 立即推进下一项 → 总闸复核」节奏；本轮 F16/T7 已完成 | 主人本轮验收反馈；`npm run check:all` |
| 2026-09-26 | 冷启动遇到当前任务依赖的文档或权威引用缺失时必须停下交给主人处理；交付可见行为时必须附完整验收路径、前置条件、操作步骤、预期结果和机读检查 | 主人本轮反馈；[`AGENTS.md`](../AGENTS.md)；[`rules.md`](./rules.md) |
| 2026-09-26 | `usage_update` 接入 `usage.updated` → `ConsoleView.usage` → 顶栏上下文圆环；缺失报文显示「未报告」 | 上游源码 `C:/DEV/develop/opencode/packages/opencode/src/acp/usage.ts:192-218`；`npm run check:all` |
| 2026-09-26 | F18 修正：默认只接受 opencode 且校验 `--version >= 1.18.0`；omp 仅显式启用 | `app/src/engine/resolve.ts`、`app/plugins/engine-bridge.ts`；`test/gates.test.ts` |
| 2026-09-26 | cwd 选择接入左栏；系统目录选择器确定后自动导入并重启 ACP，手输绝对路径仍可用 | `app/index.html`、`app/src/main.ts`、`app/plugins/engine-bridge.ts`；`npm run check:all` |
| 2026-09-26 | 验收修正：目录按钮必须是选择器并自动导入，不能只打开资源管理器让用户复制路径 | 主人验收反馈；`/__t3/choose-folder` 原生目录选择器 |
| 2026-09-26 | 目录选择器改用可见 `wscript.exe + Shell.Application`，避免 PowerShell 窗体宿主未响应；桥端 60 秒、前端 65 秒超时后恢复可操作状态 | 主人验收反馈「选目录」卡住；本机 `wscript.exe` 窗口标题「浏览文件夹」且进程正常响应；`npm run check:all` |
| 2026-09-26 | 接入项目配置入口：桥端读写 cwd 下 `opencode.json` 的 `permission.edit`，保存后重启 ACP；配置入口完成后推进 F19 | 上游 `/config` 路由 `httpapi/groups/config.ts:10-42` 与 `Config.update` `config.ts:638-650`、项目加载 `config/paths.ts:9-18`；`npm run check:all` |
| 2026-09-26 | 修复审批策略状态机回退：配置读取和连续切换均按 revision + cwd 丢弃迟到结果，回到会话不再覆盖新策略 | `app/src/main.ts`、`app/src/main-flow.ts`；82 项单测通过 |
| 2026-09-26 | 工单卡过程详情纳入 F8：先补齐 `tool_call` / `tool_call_update` 的真实字段，再做点击展开或弹出；摘要层保持低噪，详情层保留证据 | 主人关于 edit / bash 卡片展开的产品意图；契约优先 |
| 2026-09-26 | F19 修正：刷新期间复用 bridge client 与 ACP 子进程，桥端暂存无连接时的有限输出，前端恢复未完成 prompt 的请求上下文并保持输入锁定直到回合结束 | `app/plugins/engine-bridge.ts`、`app/src/main.ts`；桥端实测 `reused:true`、断线后 `replayed:true`；83 项单测 |
| 2026-09-26 | F19 状态机补修并验收通过：运行中断流保持 `busy`，刷新重放的旧 `prompt.ended` 不得结束当前回合；请求编号跨刷新递增，恢复指令按稳定身份去重 | `app/src/main.ts`、`app/src/view/derive.ts`；真实浏览器连续刷新实测：恢复中锁定、回合结束后解锁、用户指令单份；主人已验收。已知 opencode 执行中可继续接收并排队输入 |
| 2026-09-26 | F19 验收结论：opencode 在模型执行中仍接受后续输入并排队，属于上游消息编排行为；本轮记录为已知竞争态，不再阻断 F19 | 主人验收反馈；主流 agent 编排亦采用类似消息插队模型 |
| 2026-09-26 | F8 接入真实工单详情：卡片默认低噪摘要，点击后展示 `tool_call(_update)` 的目标、参数、状态、耗时、输出与错误；缺失字段明确显示「引擎未报告更多过程」 | 上游 `C:/DEV/develop/opencode/packages/opencode/src/acp/tool.ts:12-34,124-229`、`acp/event.ts:312-385`；`npm test`、`npm run check:app` |
| 2026-09-26 | 视觉打磨暂时优先于功能计划：工单详情改用浮动 inspector，避免展开内容撑爆中栏；全局动效以 `C:\DEV\develop\tmp\OPUS5-5` 为金标准，并保留 `prefers-reduced-motion` 降级 | 主人反馈；OPUS5-5 `console.html` / `specimen.js` 的工单交互与动效规则 |
| 2026-09-27 | 视觉返工 v2：资源条改为统一分组并垂直对齐；首次进场增加顶栏子元素错峰；切换会话时记录区和左栏列表按顺序滑入；`prefers-reduced-motion` 继续关闭全部动画 | `app/index.html`、`app/src/ui/console.ts`；`npm run check` |
| 2026-09-27 | 资源条错位根因修复：顶栏工单块误用右栏工单索引的 `.orders` 类，导致 `display:grid` 覆盖资源块布局；改用独立 `.work-count` 类并以可见页面盒模型确认图标、数字、标签处于同一行 | `app/index.html`；本机可见页面 DOM 盒模型复核 |
| 2026-09-28 | 视觉返工最终验收通过，推进 F12 第一段：模式/模型改走专用 ACP 方法；空闲刷新用 `session/resume` 恢复引擎态；会话列表新增 ↗ 分叉，沿用 `session/fork` 的新会话响应与 20 条回放语义 | 主人目视验收反馈；上游 `packages/opencode/src/acp/service.ts:295-498`；`npm run check:app`、`npm test` |
| 2026-09-28 | F12 全部验收通过；核心版本先收口，多会话、文件树、diff、搜索、终端、导出、图片移入未来更新计划 | 主人验收与产品取舍；§2、§4.6 |
| 2026-09-28 | 下一阶段仅规划 Tauri 2 / Windows WebView2 封装；本轮全面整理文档与经验，计划写完即停止，不实施壳 | 主人最新指令；§8 |
| 2026-09-28 | Tauri 第一阶段完成：依赖、`src-tauri/`、静态 build、开发窗口和 debug 可执行文件已落地；桌面 transport、原生目录 / 配置、生命周期与安装包仍未完成 | `npm run check:all`、`npm run build`、Tauri / Cargo 检查、`npx tauri build --debug --no-bundle` |
| 2026-09-28 | 修复 Tauri ACP stdin 误断：监控线程不再调用会提前关闭 stdin 的 `Child::wait()`，改用轮询 `try_wait()`；开发工作流改为由主人在外部终端运行长期 `tauri:dev`，Codex 只执行有限时长的构建与检查 | 主人截图反馈 `ENGINE STDIN UNAVAILABLE`；Rust 源码修复；后续以外部终端命令验收 |
| 2026-09-28 | 修复历史会话跨目录回放：列表行的 `cwd` 现在会更新 UI 工作目录；若与当前 ACP cwd 不同，先重启宿主再发送 `session/load`，避免历史会话显示或继续运行在应用 sandbox | 主人反馈：CLI 交叉验证会话位于 `C:\DEV\develop\文学概论202609`，UI 却显示 `...com.t3rra.console\\sandbox`；`main-flow` 回归测试，90 项单测 |
| 2026-09-28 | Tauri 第二阶段主人验收通过：桌面窗口可真实连接 opencode、发送 prompt、回放历史并按会话 cwd 重启宿主；进入打包准备，但不宣称安装包或生命周期已验收 | 主人验收反馈；`npm run check:all`、`npm run build`、Cargo fmt / Clippy、`npx tauri build --debug --no-bundle` |

## 6. 引擎基线

【实测：2026-09-23 历史记录】opencode 1.18.32 / ACP v1。当前开发使用范围为 1.18.x，不把最新 v2 当兼容升级。本轮未重新测版本或登录状态。

上游方法、回放语义、usage 条件与 permission 行为的依据统一见 [ACP 映射表](./adapters/opencode-acp.md)。旧选型报告只解释当时的决定，不作为当前 API 或桌面封装实现依据。

## 7. 经验与教训

以下是本轮开发反馈的归纳【文档：主人反馈、既有事故和决定记录】，不是新增代码审计结论。

| 经历 | 经验 / 后续做法 |
| --- | --- |
| ARK 重建最初只换颜色，仍被否决 | 设计迁移要同时对齐构图、组件、文案；金标准要有可打开的正本，不能靠风格关键词回忆 |
| 工单摘要低噪，但用户需要知道里面发生了什么 | 保留默认摘要，以按需详情承接证据；浮动 inspector 避免工具输出撑坏主记录流 |
| 资源条错位反复返工，最后定位到 `.orders` 类名冲突 | 表象是基线，根因是组件样式互相覆盖；先定位布局归属，不能层层叠补丁。机读结构通过不等于观感通过 |
| 「浏览」最初只打开资源管理器，后来目录选择器又挂起 | 用户目标是“选中并导入”；交互要闭合确定、取消、失败与超时四条路径。桌面版原生目录对话框仍需逐条验收 |
| 历史 load 无 sessionId，输入无法解锁 | 请求上下文是状态关联依据；不能假设响应会重复请求字段，迟到响应必须核对当前目标 |
| 审批策略被旧配置读取回退 | 异步读取须带 revision 与 cwd；重启、切换、刷新不是几个互不相关的按钮 |
| 刷新期间 prompt 丢结局、重复渲染 | 连接存活、引擎运行、当前视图是不同生命周期；恢复必须覆盖请求身份、缓存补发、去重和结束信号 |
| cancel 被误当 request，错误实验引出双进程分流 | 先读本机上游源码，再设计可复现探针；错误形态的否证不能推出能力不存在，HTTP 200 不能证明业务完成 |
| 文档仍写“待验”“未接”，实际功能早已通过 | 一件事只写一处；验收结束立即更新状态账，证据快照保留日期，能力地图只维护档位，避免多份待办互相竞争 |
| 2026-09-23 整文件回滚覆盖他人 338 字节改动 | 先查工作树；局部补丁，必要时备份。旧仓只读，不把别人的工作当作可重建资产 |
| 2026-09-26 长上下文耗尽，迁移多次失败 | 重要决定、路径、验收结果及时落盘；文档应能独立支持冷启动，缺少依赖立即停止并报告 |
| 当前版本已好用，能力全图仍很长 | 产品范围由主人决定；把扩展移入未来计划，发布工作不顺带演变成另一轮工作台重写 |

协作节奏继续采用「机读检查 → 给出具体操作与预期 → 主人验收 → 更新现状 → 下一阶段」。本轮主人明确只要计划，文档完成后停止。

## 8. Tauri 封装计划（进入打包准备）

### 8.1 目标与边界

交付 Windows x64 自用桌面应用：双击启动现有 ARK 界面，保留已验收的单会话流程，无需打开终端或启动 Vite。**Tauri 2 + WebView2 + Rust 宿主**为本计划路线；Electron 不可接受。NixOS、后台多会话和 §4.6 扩展均不进入首包。

首包建议复用本机已安装、已配置 provider 的 opencode 1.18.x，不内嵌或自动下载引擎，不复制登录密钥。安装的是控制台；运行仍依赖兼容 opencode 和 WebView2。这条路线最适合当前自用目标；将来引擎随包分发需另核版本、许可、更新与体积。

### 8.2 已知接口与参考依据

【源码：第二阶段已落地并验收】当前 `app/src/engine/transport.ts` 已声明统一宿主接口，并新增 `createTauriTransport()`；`app/src/main.ts` 在 Tauri 运行时选择它，浏览器继续使用 `createBridgeTransport()`。`src-tauri/src/main.rs` 已建立 Tauri Channel、ACP 子进程、LF 分帧、stdin、stderr / exit / channel 错误回传、原生目录选择、项目配置读写和本地 `opencode serve` HTTP 透传。开发版已经可以真实驱动 opencode；生命周期、脱离仓库安装、NSIS 包和完整回归仍待实现。

【文档：2026-09-28 已访问】以下 Tauri 2 官方资料支持计划，不证明本机已具备工具链或已跑通：

- [Windows 构建前置](https://v2.tauri.app/start/prerequisites/)：Rust / MSVC、C++ Build Tools、WebView2。
- [开发与资源配置](https://v2.tauri.app/develop/)：`devUrl`、`beforeDevCommand`、`frontendDist`；生产包加载本地构建产物。
- [前端调用 Rust](https://v2.tauri.app/develop/calling-rust/) 与 [Rust 调用前端](https://v2.tauri.app/develop/calling-frontend/)：命令请求用 invoke；Channel 用于有序流式数据，不把普通全局事件当可靠字节队列。
- [原生对话框](https://v2.tauri.app/plugin/dialog/)：用目录选择替代浏览器开发桥的 wscript 宿主。
- [Capabilities](https://v2.tauri.app/security/capabilities/)：插件权限按窗口声明；自定义 Rust 命令仍需明确参数校验和权限范围，不能以插件配置代替。
- [Windows 安装包](https://v2.tauri.app/distribute/windows-installer/)：NSIS / MSI 及 WebView2 安装策略；首包计划采用 NSIS，签名与自动更新暂不纳入自用首包。

### 8.3 保持的边界与宿主迁移清单

TS 保留 ACP 解析、请求关联、会话状态、错误判定、派生视图与渲染。Rust 负责进程与系统 I/O，不解析 tool、permission、phase 等引擎业务词汇。保留浏览器 dev transport 作为开发与对照入口，通过统一 Transport 接口选择宿主。

| 现有 Transport 能力 | 桌面宿主需要承担的工作 | 阶段验收证据 |
| --- | --- | --- |
| `probe` / `spawn` | 定位引擎、检查版本、按绝对 cwd 启动 `opencode acp`；兼容空格、中文路径及 Windows 可执行文件 / 启动器差异 | 缺引擎或不兼容时可见错误；配置本机绝对路径后成功握手 |
| `write` / `onLine` | stdin 写入与 stdout LF 分帧；UTF-8 跨块处理，不以 U+2028/U+2029 切帧；stderr 独立报告 | 分块中文、大量连续行和尾帧测试；真 prompt 流式回复 |
| `onExit` / `onError` / `onLinkDown` | 退出码、系统错误、视图连接断开分别回传；宿主流有序、订阅就绪后再发送 | 人为退出子进程时能看到故障并重启；不伪造 prompt 已结束 |
| `chooseFolder` | 原生单目录对话框，确定返回路径、取消返回空结果；异常可恢复 | 中文 / 空格路径自动导入；取消不改 cwd，不留下“正在打开” |
| `projectConfig` | 按选定 cwd 读写 `opencode.json`，保留其它键；限制为现有编辑策略，不引入通用文件写接口 | 策略持久化；JSONC、无效 JSON、无写权限显式报错且不毁文件 |
| `http` | 宿主管理按需启动的 `opencode serve`，透传状态码和正文；目标只限宿主拥有的本地服务 | 继续由 TS 执行 close → DELETE → list 确认；不把任意 URL 或系统 shell 暴露给页面 |
| `kill` / `dispose` | 区分终止本应用进程树与释放视图订阅；重启 / 退出清理自己启动的 ACP 与 serve | 无残留子进程，不误杀用户在其它终端运行的 opencode |

### 8.4 分阶段执行顺序

每阶段单独交付、单独验收，不一次捆成大改造。第一阶段已落地；后续阶段按下列边界继续。

1. **构建与窗口骨架【已完成】**。已检查本机 Rust / MSVC / WebView2，补齐并锁定构建依赖；建立 `src-tauri/`、固定应用标识，加入 `build`、`tauri:dev`、`tauri:build`；固定桌面 devUrl 端口并让占用显式失败；保留现有 ARK 内容区。已实测 `npm run build` 与 `npx tauri build --debug --no-bundle`，产物为 `src-tauri/target/debug/t3rra-c0d3.exe`。**此阶段只证明窗口与静态构建，不宣称引擎可用。**
2. **Rust 字节宿主与桌面 Transport【主人已验收】**。Tauri Channel 已承载有序事件；Rust 按进程代次隔离旧子进程输出，stdout / stderr 均按 LF 分帧并保留跨块 UTF-8，stdin 写入自动补帧尾；`exit`、引擎错误和 IPC 调用失败分别进入现有 TS 状态机。Tauri 运行时已选择 `createTauriTransport()`，浏览器桥仍保留。Windows npm 启动器 `.cmd` 已纳入解析与启动；真实 prompt、历史回放、跨目录 cwd 和基础失败恢复已由主人验收。
3. **目录、配置与持久化**。原生选择器、项目配置写入、引擎路径恢复入口接入。默认工作目录迁到应用数据目录下的 sandbox，不能使用安装目录或程序 cwd；已选择的绝对项目目录单独持久化，失效时提示重新选择。保留 opencode 自有的会话 / provider 存储；不把开发 `.sandbox`、traces 或密钥打包。完成非默认 cwd 下的删除与审批真实写入验证，§4 F3/F9 若影响路径即阻塞该项验收，按源码登记后单独修复。
4. **进程与窗口生命周期**。区分 WebView 刷新和退出应用：刷新可重订阅现存进程，有限缓存按序补发、去重；缓存溢出必须显式报恢复不完整，不默默继续。完整退出不承诺后台运行；运行中关闭需提供“取消关闭 / 停止并退出”，由 TS 按现有中断与审批取消契约收尾，宿主超时兜底只终止本应用拥有的进程。进程树机制需覆盖父进程异常退出。重开应用从历史 / resume 恢复可用会话，不能沿用失效 pending id 假装旧回合仍在跑。禁止单实例之外的窗口共享全局 busy；首包只开一个主窗口。
5. **Windows 安装包与交付复验**。计划 NSIS 按用户安装，沿用已固定的应用标识，确定首包版本和图标；WebView2 默认用已有运行时，缺失时引导 bootstrapper（需要联网），不声称离线自包含。不启动 Vite / Node 开发服务仍可运行；脱离仓库路径安装、升级、卸载并保留用户项目与引擎数据。按 [字体说明](../app/fonts/README.md) 核对 HarmonyOS 原许可并附必要声明；系统字体只引用、不复制。补规则 22 生产产物断言，最后提交并交付真实安装包路径。

工作量判断【未验：规划估算】：这是一次宿主迁移，建议约 4–6 个实现 / 验收轮次；第 2、4 阶段风险最高。Rust 工具链、Windows 进程清理或 F3/F9 实验若失败，会增加修复轮次；不承诺“一次套壳就完成”。

### 8.5 机读验收与人工验收

实施后必须分别记录结果；第一、二阶段结果已记录，以下为剩余阶段和完整桌面版所需检查：

- 现有 `npm run check:all` 全绿；桌面 transport 的完整对等测试、LF/UTF-8 分帧、异常退出、重连缓存、cwd/配置失败测试仍需补齐。
- Rust `cargo fmt --check`、`cargo check`、`cargo clippy -- -D warnings` 已通过；`cargo test` 尚无宿主专用测试。
- `npm run build` 已通过；`npm run tauri:build` 的完整 NSIS 安装包仍待执行。后续需核对静态资产、字体、无 dev 桥依赖、无 probe/trace/凭证入包。构建产物断言按规则 22 检查压缩后 token，不削弱现有闸。
- Windows 普通用户从安装目录启动，验证不依赖仓库工作目录；通过进程句柄核对关闭 / 重启 / 父进程异常退出后无所属子进程遗留。执行前记录本机工具链和引擎版本。

第一阶段人工验收前置：Windows x64、可用 WebView2；执行 `npm run tauri:dev`，窗口会加载固定的 `http://127.0.0.1:5191` 开发页面。此阶段不要求 opencode 已能对话，因为桌面 transport 尚未迁移；桌面版无供用户打开的 localhost URL。完整桌面验收仍需等第 2–5 阶段，届时再提供安装包绝对路径。

1. 双击启动安装后的应用：ARK 布局、字体、进场动效正常，无需终端；缩放窗口并在 100% / 125% / 150% 系统缩放下看资源条与工单浮窗，无遮挡错位；减少动态效果设置仍生效。
2. 选含中文和空格的测试项目目录，确定后自动导入，再取消一次选择：cwd 保持正确；切换编辑审批策略，重开应用仍保留；缺失路径 / 不可用引擎给出恢复入口。
3. 按 §3 第 2、3 步的 prompt 触发审批、工具与回复：拒绝不落盘，批准需实际落盘；工单详情可开关，错误不能被当成功。另起较长回合点中止，应给出真实结局或明确未确认。
4. 打开历史、发送新指令；运行中刷新桌面视图，回到同一会话且指令不重复、结束恢复输入；空闲切模式 / 模型、分叉、删除测试会话，行为与浏览器验收一致。
5. 运行中关闭，先取消关闭，再选择停止并退出；重开能继续使用，原回合不假装仍在跑；执行者核对所属进程已清理。安装升级 / 卸载后项目文件和 opencode 数据保留。

**完成条件**：五阶段产物、机读结果、主人桌面验收、已知限制说明和安装包路径齐备，才称“桌面版完成”。本页写好计划不代表任何一项已经实现。

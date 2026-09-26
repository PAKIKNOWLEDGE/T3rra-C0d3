# 现状

> **只写现在为真的事。** 条目过时就改或删；旧叙事进 [`archive/`](./archive/) 或 git 历史，不在这里堆日志。
> 决定只在 §5「决定记录」写一行（带日期）。规矩与目录见 [`AGENTS.md`](../AGENTS.md)。
> 最后整理：2026-09-26。重构前的全文存档：[`archive/status-2026-09-26.md`](./archive/status-2026-09-26.md)。

## 1. 一句话

`app/` 跑在开发浏览器里，经 ACP 驱动本机 opencode，能做这些事：

- 列出、打开、新建、删除会话；
- 流式显示回复、思考、工单；
- 批准或拒绝权限请求；
- 用 stdio `session/cancel` 中断本轮。

**视觉第 3 代（ARK 金标准）2026-09-26 重建完成，主人已目视验收。** 不是桌面应用：Tauri 壳一行没写。

## 2. 仓库主人验收清单

| # | 问题 | 状态 | 备注 |
| --- | --- | --- | --- |
| 12 | 界面不对味（金标准只搬了颜色） | **主人已验收** | 骨架、组件、文案三层一起换成 ARK。主人已完成目视验收 |
| 1 | 中断（HALT） | **已按实测重写 · 主人已验收** | 按钮与 Esc 发出无 `id` 的 stdio `session/cancel` notification（53ms 实测，trace `…10-34-39-594Z-cancel-notification.jsonl`）。10s 内没收到本轮结束就写明「未确认」，不拿 HTTP 200 当成功。第 3 代里「中止」和「发送」共用一个位置，运行中才出现 |
| 2 | 会话列表 + 删除 | **主人已过 · F21 已修** | 整块 = 打开，`×` = 删除，不自动建会话。删除现走 `session/close → DELETE → session/list`，只有列表确认缺失才报告已删除；历史回放完成后恢复输入 |
| 2b | 打开即建垃圾会话 | 已修 | 启动只做 `initialize` + `session/list`；第一条指令才 `session/new` |
| 2c | 模式按钮点了像死 | 已修 · 主人已验收 | 点击即乐观切换，再发 `set_config_option`。第 3 代为相连分段按钮 |
| 2d | 标题撑爆 | 已修 | 标题只取指令首行前 28 字，顶栏单行截断 |
| 19 | 浏览器刷新恢复运行态 | **主人已验收** | 刷新期间保持同一 session，运行中的工单继续，输入在恢复期间锁定，回合结束后恢复；已知 opencode 允许模型执行中继续提交输入，后续指令会排队，属于上游编排行为，本轮记录为已知竞争态 |
| 3 | EVENTS 死按键 | 已修 | 现为导航条的「事件」格：原始事件日志 |
| 4 | 新建是死按键 | 已修 | `session/new`。三个入口：左栏蓝块、列表空态、记录空态 |
| 5–9 | 对话区（折叠思考、焦点、markdown、锚点、像 Word） | 主人已验收 | 行为不变。第 3 代换了外观，大锚点已整体删除（#8 不再适用） |
| 10 | 审批界面 | 已实现 · 配置入口已接入 · 待主人目视 | 第 3 代为记录流里的浅色道具卡。左栏 Workspace 可设置项目级 `permission.edit`；切换后自动保存并重启 ACP，再按真 prompt 路径触发审批卡。已修复切换后回到会话时被迟到配置读取回退的问题 |
| 11 | 闸门假阴性 | 已修 | `app/ui-manifest.json` 清单制 |

**闸全绿不是交付证据。** 清单未勾完前，汇报必须把「已知未做」和「已完成」并列。

## 3. 视觉第 3 代：主人已验收

`npm run dev` → 以终端打印的地址为准（通常是 `http://localhost:5191/`），旁边打开 [`demo/ark.html`](../demo/ark.html) 对照。

1. **第一眼**：像不像金标准样张？
   - 顶栏：导航条 + 斜体 `RECORD` + 资源条；
   - 左栏：蓝色「新建会话」+ 灰色会话块，选中的是浅色块；
   - 中栏：记录簿 + 指令坞；
   - 右栏：属性行 + 各分节。
2. **发一条指令**，依次看：
   - 黑底「指令 01」名牌；
   - 回复卡（浅色 chip 上是引擎名）；
   - 工单站点卡：色条随引擎声明的 kind 变化，卡底写着 kind 原文；运行中有 ▶▶▶；
   - 坞里的红色「中止」。
3. **空态**：不开会话时，记录区是一张「还没有打开会话」卡，里面有蓝色新建按钮。
4. **上下文用量**：发送一条真 prompt，回合结束后看顶栏圆环；收到 `usage_update` 时显示百分比和 `used / size`，没有该事件时显示「未报告」，不显示 0。
5. **批准卡待验收**：配置入口已接入；将 Workspace 的「审批策略」切到「每次询问」，保存后再按真 prompt 路径触发。
6. **输入框聚焦**：按金标准是 1px 蓝边（没有外框 outline）。验收 #6 曾嫌「蓝框」。如果仍嫌，改回左侧色条。

主人已完成视觉第 3 代目视验收。机器自证的是：tsc、81 项单测、`check:app`（12 控件全接线，62/62 渲染 id，13 个可见元素、8 个动态控件创建点全部纳入清单）、`check:boundary`、`check:demo`、令牌与正本逐项比对。

**当前功能验收路径**：启动 `npm run dev`，打开终端打印的 URL；(1) 在左栏 Workspace 点「选择目录」，预期出现 Windows「浏览文件夹」对话框；选中真实项目并点确定，路径自动填入并开始重启，不需要复制粘贴；(2) 确认阶段先变为「重启中」再回到「就绪」，Workspace 行显示新路径；取消对话框时预期回到「就绪」，不改变 cwd；(3) 在「审批策略」切到「每次询问」，预期保存后自动重启 ACP，刷新后仍保持该策略；(4) 点击历史会话，确认「正在回放历史」变为「下达指令」后发送新 prompt；(5) 发送真 prompt，观察顶栏上下文圆环，若引擎发 `usage_update` 则显示百分比与 `used / size`，没有则显示「未报告」；(6) 在本轮运行中刷新浏览器，预期回到同一 session，阶段显示「恢复中」，输入保持锁定，收到原回合结束后恢复「就绪」和「下达指令」；(7) 删除一个会话，确认只有列表核对确认后它才消失；(8) 审批卡按 `permission.edit = "ask"` 路径触发；(9) 让 prompt 产生一个工具卡，先确认摘要保持低噪，再点击卡片打开右上浮动 inspector，确认详情不会撑开中栏；在更新到达后确认内容刷新，点击关闭按钮或再次点击卡片后 inspector 收起。机读检查：`npm run check:all`，`check:app` 应显示 13 个控件全接线；在 EVENTS 视图确认出现 `usage.updated` 或明确的 `message.unmapped`（缺字段时）。

## 4. 已知未做 / 只做了一半

**视觉**

- 样张里的计划、改动文件仍没画：没有数据源（[`design.md`](./design.md) §4「不画」表）。工单详情展开已接入；上下文圆环已接入，但 `usage_update` 不是每轮都发，缺失时显示「未报告」。
- 错误态只有结局条一种形态；长会话里站点卡没有折叠；窄窗只有两档；没有可随包分发的窄斜体数字字体。
- 全局动效第一版已接入；主人本轮验收约 99% 通过。待下一轮视觉返工：顶栏资源条元素错位，以及页面进场、会话切换动效覆盖不完整。

**引擎与契约**（证据见 [`engine-contract-audit.md`](./engine-contract-audit.md)）

- **F21：已修**：删除先发 `session/close`，再发 HTTP `DELETE`，最后以 `session/list` 确认目标会话已消失；HTTP `<400` 不再直接合成 `sessions.removed`。失败或列表仍返回目标会话时，原行保留并显示未确认。
- **F8：已实现 · 待主人目视**：工单卡默认保留低噪摘要；点击卡片打开浮动 inspector 查看引擎真实报告的目标、参数、状态、耗时、输出与错误；`tool_call_update` 会更新标题、状态和详情，字段缺失显示「引擎未报告更多过程」。
- **F18：已修**：默认候选链只接受 opencode，并校验 `--version >= 1.18.0`；omp 只在显式 `T3RRA_ENGINE=omp` 或 `T3RRA_OMP_BIN` 时启用。
- **F19：已修 · 主人已验收**：刷新时复用同一 bridge client / ACP 子进程；桥端在无 SSE 连接时暂存有限行并在重连后补发，前端持久化 cwd、session、未完成 `session/prompt` id 与当前指令，恢复期间锁定输入；断流不再把运行中的回合误判为结束，旧的 `prompt.ended` 响应不会解锁当前回合；连续刷新时恢复的用户指令只渲染一次。已知竞争态：opencode 允许模型执行中继续提交输入，后续指令会排队，属于上游消息编排行为，本轮不再扩展为本仓阻断。
- **F12**：`session/resume` / `fork` / `close` / `set_mode` / `set_model` 引擎已实现，本仓从未调用。
- **F16：已修**：`main.ts` 的列表失败、跨会话路由、断链事实已提炼为可测接线出口，并由回归测试覆盖。
- `link.down` 只覆盖 SSE 通道；和 `engine.exited` 没统一成一个连接状态机。
- **F9**：批准 `edit` 后引擎会反向调用 `fs/write_text_file`，我方没实现。
- **F20：已修**：握手后的 `SessionFacts.cwd` 来自桥的绝对 `sandboxDir()`，新建会话不再走相对路径；cwd 输入也只接受绝对目录。
- **F3**：HTTP `DELETE` 不带 `directory` 参数，单沙箱掩盖了问题。
- `session/list` 只取第一页（100 条），没消费 `nextCursor`。
- 回合结束没有权威的 idle 信号；取消后引擎还会冲刷大量 update，会污染节奏基线。

**工程**

- T7：动态控件清单已接入 `check:app`；当前扫描到 8 个 renderer-created 控件创建点，均有 `app/ui-manifest.json` 分类。
- 规则 22（构建产物断言）没落地。

**产品结构空洞**（全图见 [`capability-map.md`](./capability-map.md)）

- cwd 选择已接入左栏；未选择时仍在 `app/.sandbox`，选择后重启 ACP 到指定目录；Windows 目录选择器现由可见的 `wscript.exe` 原生对话框承载，取消或超时会恢复可操作状态；刷新时沿用当前 bridge client 与 cwd；尚无多项目列表。主人尚未复验本次选择器修复。
- 配置入口已接入，仅覆盖项目级 `permission.edit`；其它 `permission.*` 规则仍需手工编辑，审批卡尚未完成本轮目视验收。项目配置由桥端写入 cwd 下 `opencode.json`，并用同步版本与 cwd 校验丢弃迟到读取，避免切换策略后回到会话时 selector 回退；`opencode.jsonc` 与无效 JSON 继续显示可见错误；
- 没有 diff、文件、终端、搜索工作面；
- 只支持单会话；
- 网页端不能粘贴图片。引擎侧 `promptCapabilities.image: true` 已实测，是否需要 Tauri【未验】。
- Tauri 外壳与打包没做。

**审计与本节的关系**：[`engine-contract-audit.md`](./engine-contract-audit.md) 是证据；这里是现状。审计里仍开着的每一项都应在本节出现。如果发现漏了，补到本节，不要去审计里标进度。

## 4.5 下一步（建议顺序，2026-09-26 定；仓库主人可否决）

原则沿用 2026-09-24 的决定：先让界面不说假话，再加新东西。设计是核心资产，所以视觉上收益最大的数据接入排在结构功能前面。

1. **全局视觉打磨**：以 `C:\DEV\develop\tmp\OPUS5-5` 为金标准，统一浮动 inspector、进场、悬停、状态切换、运行中警示和 `prefers-reduced-motion` 规则；功能计划暂停推进。
2. **F8 主人目视验收**：检查浮动 inspector、字段缺失文案和实时更新。
3. 视觉验收完成后再依次处理 F12 与多会话；能力全图 §3 的其余项届时再排。

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
| 2026-09-24 | 契约修复优先于新功能。P0-a…e 已完成（P0-d 改为按报文形状判定响应） | 审计 §5 |
| 2026-09-24 | jsdom 仅允许在 `test/**` 做 DOM 结构断言 | AGENTS §三 |
| 2026-09-26 | **视觉金标准 = 3NDM1N15T4T0R 的 ARK 族**（明日方舟实机界面）；旧 `ark-console` 范式否定；主操作色由青改蓝 | [`design.md`](./design.md) |
| 2026-09-26 | END 族冻结，不做双主题 | [`design.md`](./design.md) §1 |
| 2026-09-26 | 设计是项目核心资产；**opencode 保留**。主人澄清：强调设计的重要性，不等于现在要换后端 | 仓库主人 |
| 2026-09-26 | 文档系统重构：一件事只写一处；被取代的文档归档不删 | [`AGENTS.md`](../AGENTS.md) §六 |
| 2026-09-26 | 下一步顺序见 §4.5（建议，主人可否决） | 冷启动接手测试发现「没有已决定的顺序」是最大的交接缺口 |
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
| 2026-09-26 | 工单浮动 inspector 与全局动效第一版通过约 99% 验收；顶栏资源条错位、页面进场和会话切换动效不完整，顺延下一轮视觉返工 | 主人本轮验收反馈 |

## 6. 引擎成熟度（2026-09-23 实测，opencode 1.18.32）

**够用级，不是稳定级。**

- **可用**：ACP v1 一致；session new/load/list 已用，fork/resume/close 已声明但本仓没调用；`load` 先流完历史再回响应；MIT。
- **需盯**：
  - v1 → v2 有意做了破坏性修改，锁定在 1.18.x；
  - HTTP / SSE 面自述不稳定，而 diff、revert、pty 只在那一面；
  - 没有 `thinking`，对应的是 `effort`，只有部分模型有；
  - 模式只有 `build` / `plan`；
  - 审批要 `permission.*="ask"` 才会问。

细节：[`adapters/opencode-acp.md`](./adapters/opencode-acp.md)。

## 7. 事故记录

- **2026-09-23**：在 `NIX\t3rra-core` 用 `git checkout -- plugins/omp-bridge.ts` 回滚，覆盖了该文件里**他人 338 字节未提交改动**，无法恢复。教训：改他人工作树前先看 `git status`；不用整文件 checkout 回滚。
- **2026-09-26**：主会话上下文约 28 万 token，余额不足导致 API 402，`/compact` 同样失败，迁移任务 6 次重发全部落空。教训：长设计会话里别塞满参考图，先把结论写进文件。

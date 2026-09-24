# 计划：视觉层固化 + 引擎契约修复

日期：2026-09-24　执行方式：无人值守（仓库主人外出，回来中断）
前提：本产品目的为**自用**（仓库主人 2026-09-24 确认）。因此"opencode 官方已有 app 与 TUI"不构成放弃理由——差异化对自用工具不是必要条件。

## 结论

继续。不推倒重来，不换后端。做两件事：

1. 把**视觉层与引擎的边界变成机检事实**，让"大不了换后端"成为可证明的命题，不是一句愿望。
2. 删掉已被实测证伪的假前提（HALT 的双进程端口分流），再逐条修复引擎契约层。

依据：盲审代理实测 `session/cancel` 以无 `id` 的 notification 直连 stdio 即可端到端中断在途 turn（53ms 收到 `stopReason:"cancelled"`）【实测：`traces/opencode/*-cancel-notification.jsonl`，本轮 T2 入库】。该实验证伪了"ACP 无中断能力"这一原判，因此分流架构是冗余代码，删除即可。

## 一、视觉层怎么保

边界现状（须由 T1 转为机检）：

| 层 | 文件 | 与引擎报文的关系 | 行数 |
| --- | --- | --- | --- |
| 视觉/范本 | `demo/ark-console.html` | 无关 | 1314 |
| 界面壳 | `app/index.html` | 无关 | 467 |
| UI 与派生 | `app/src/ui/*`、`app/src/view/derive.ts` | 只消费内部事件 | 约 1100 |
| 引擎适配 | `app/src/engine/*`、`app/src/contract/*`、`app/plugins/engine-bridge.ts` | 全部耦合 | 约 800（其中契约问题集中 400–500） |

换后端的真实代价 = 重写适配层，上面三行全部留下。

T1 的固化手段：新增机检规则，`app/src/ui/**` 与 `app/src/view/**` 不得 `import` `app/src/engine/**` 或 `app/plugins/**`；违规则 `npm run check:app` 失败。若现状已有违规，先修依赖方向再上闸。

## 二、本轮明确不做

- 不做 Tauri 迁移（整条 Tauri 链路至今未做过，属独立里程碑，不混进契约修复）。
- 不做目录选择器，也不接 `resume` / `fork` / `close` / `set_mode` / `set_model`（上游都有，列为 P2）。
- 不做新功能、不改视觉。
- 验收清单 #1、#10 **不自行验收**：只有仓库主人的眼睛能验收。本轮只保证代码在、并列出"看什么"。
- **不 push 远端**。

## 三、执行顺序（串行，不并行改文件）

| 步 | 内容 | 完成判据 |
| --- | --- | --- |
| T1 | 视觉层独立性固化为机检 | 闸能因真实违规而失败（须先做一次反向验证），`check:app` 全绿 |
| T2 | 盲审两个探针入 `spike/`、两份报文入 `traces/opencode/` | 探针可从仓库代码复现报文（避免重演 F14：trace 与仓库代码不可复现） |
| T3 | `docs/engine-contract-audit.md` 撤稿 F9（机制说错）、F11（字段名实为正确，但类型与分页游标假设需按实测改）、F13（归因过重：那是 verdict 字符串 bug，中断本身成功）；降级 hygiene 条目；新增 F21 split-brain | 三份文档同口径 |
| T4 | HALT 改走 stdio notification；删 `engine-bridge.ts` 的 `--port` 与按路径正则分流；删 `engine-http.ts` 的 HTTP abort；去掉 `status<400` 即报成功的假成功路径 | 真报文测试 + 不再产生 200 `true` 语义 |
| T5 | 契约修复：F4 按 `params.sessionId` 路由；F5 客户端与引擎请求 id 分域且 RESTART 清 `pending`；F6 错误响应不再映射为空列表/`session.opened`；F7 补 `prompt.failed` / `link.down` / `permission.cancelled` | 每条一个 provider-free 测试 |
| T6 | split-brain 缓解实测：DELETE 前先 stdio `session/close`，看 stdio `session/list` 是否仍列出 | 结论入 trace + 文档，标【实测】；不成立则登记为已知缺陷并停止 |
| T7 | 验证盲区：`engine-bridge`/`main` 加测试；`check:traces` 支持 glob；`check:app` 覆盖动态创建控件；静默 guard 正则加宽；mock 不得恒返回 `200 "true"` | 每个新闸都做一次反向验证（故意破坏，确认能失败） |
| T8 | 收尾：`check:all`、`docs/status.md` 三分栏（已完成 / 一半 / 未做）并列写出 | 汇报不拿"闸全绿"当交付证据 |

## 四、验证策略：provider-free 优先

免费模型限流会让验收回路不可靠（观测到 6 秒只拿到 3 条 update）。因此本轮判断引擎行为的实验一律优先**不需要模型**的探针：假 sessionId、空 `session/list`、坏 JSON、对不存在的会话发 cancel、`close` → `list`。

需要真 turn 的只保留两处：cancel 端到端（已完成，入库为证）、split-brain 复测（会话生命周期不需要模型）。

## 五、把否决权留给仓库主人的四个决定

1. **每个任务一个本地 commit，不 push**。若不接受，回来说一声，`git reset` 可退。
2. **F17（jsdom 违反禁令）**：在 `AGENTS.md` §三 登记窄例外——`test/**` 内允许用 jsdom 做 **DOM 结构断言**（断言节点树，不断言外观）；仍禁止任何代理以 jsdom 结果作为"渲染已验收"的叙事，`app/` 产品代码与 `spike/` 探针禁用 jsdom。理由：该禁令的成因是"代理声称看过渲染"，一个断言 `renderMarkdown` 产出 `<p>` 嵌在 `<div>` 里的单元测试不属于该风险面；原样保留 F17 就是保留一条已知违规。
3. **F20（`cwd: "."`）**：改为绝对路径。"ACP 要求绝对路径"这一点目前仍是【未验】——`@agentclientprotocol/sdk@0.21.0` 未装在本地，上游 acp 源码里也没有这些方法名字符串。我按保守值改，不改证据等级标注。
4. **T6 若无法消除 split-brain**：不擅自把删除语义改成"只显示未删的"，只登记为已知缺陷等你定夺。

## 六、回来后看什么

1. `docs/status.md` §本轮 —— 已完成 / 只做了一半 / 未做 三分栏并列。
2. `npm run check:all` 输出。
3. 目视清单：#10 审批 UI 的入口与三种结局；#1 会话区的渲染表现。这两项只有你能勾。

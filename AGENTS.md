# AGENTS.md — t3rra-C0d3

给接手本仓库的开发者或代理。**先读本文件，再读 [`docs/status.md`](./docs/status.md)。**
本文件只写三件事：这是什么、规矩是什么、东西在哪。进度与决定只写在 `status.md`。

## 一、这是什么

一个**自用**的桌面 coding-agent 控制台（类 codex）。引擎是 opencode（ACP，stdio），界面是**鹰角风格的 ARK 族设计语言**。

**设计语言是本项目最值钱的资产，整个项目围绕它转。** 取舍顺序是：视觉层 > 后端。界面必须留；引擎理论上可换，但目前不换（2026-09-26 主人澄清）。

## 二、锁定的决定（详情与日期见 `status.md` §5）

1. **视觉**：ARK 族（明日方舟实机界面），暗色外壳。正本在 `C:\DEV\develop\3NDM1N15T4T0R`，仓库内的权威说明是 [`docs/design.md`](./docs/design.md)。旧 `ark-console` 范式（细线 HUD、空心字、大锚点）已否定。
2. **引擎**：opencode（ACP）。证据在 [`docs/adapters/opencode-acp.md`](./docs/adapters/opencode-acp.md)、`traces/opencode/`。
3. **外壳**：Tauri。**Electron 不可接受。**
4. **中断**：stdio `session/cancel` **notification**（无 `id`）。不走 HTTP abort；**HTTP 2xx 不能当中断生效的证据**（abort 恒返回 `true`）。
5. **平台**：Windows + WebView2 为主，NixOS 为 P2。

## 三、硬规矩

**证据**

- 结论标证据等级：【实测】/【源码】/【文档】/【未验】。未验证就写未验证。
- **契约优先**：对 opencode 的任何接口假设都要有源码或报文证据，不许靠抓包反推。上游源码在 `C:\DEV\develop\opencode`（只读）；新增或修改引擎交互前，先在 `docs/adapters/opencode-acp.md` 登记 path:line。
- 证据链可复现：入库的每条 `traces/opencode/*.jsonl` 都要能由仓库内的 `spike/` 脚本重跑出来。只出自 TEMP 一次性脚本的 trace 等于没有证据。
- `*-halt-in-process.jsonl` 出自已丢失的脚本版本，**其 verdict 字符串不作任何解读**，只能用其中的原始字段。

**汇报**

- 声称完成必须有工具输出支撑。**闸全绿不是交付证据**：清单没勾完之前，汇报里「已知未做 / 只做了一半」必须和「已完成」并列，不能只写在注释或 tooltip 里。
- 能定的先定，把否决权留给仓库主人；不要把问题清单推回给他。

**界面**（视觉细则见 `docs/design.md`）

- **无头浏览器禁用**：不跑 puppeteer / playwright / jsdom，也不跑 ark-ui 的脚本。**不得声称看过渲染结果。** 交付界面时给「可打开的路径 + 3–5 条看什么」，由仓库主人目视验收。
  唯一例外：`test/**` 内可以用 jsdom 做 DOM **结构**断言。结构断言不等于观感验收。
- **元素清单制**：`app/ui-manifest.json` 里每个可见或可点的元素都要表态（`wired`，或 `static: 理由`）。
- **`wired` 不等于可用**：点击必须有可观测结果，要么发生动作，要么出现可见错误。**用户动作路径里禁止静默 `return`**，前置条件失败时必须 `patch({ lastError, phaseNote })`。
- **空态必须给恢复动作**（例如「新建会话」按钮），禁止死胡同面板。
- **状态只许合并**：`facts` 只能用 `patch` 合并，禁止整对象替换（曾因此丢掉 `binary`，导致新建变成死键）。
- **视觉层不依赖引擎层**：`app/src/ui/**`、`app/src/view/**` 不许 import `app/src/engine/**`、`app/plugins/**`、`app/src/main.ts`。

**工程**

- 提交前 `npm run check:all` 必须全绿。**不许为了变绿放宽闸**。七道闸见 [`docs/rules.md`](./docs/rules.md) §七。
- 探针只写 `traces/`，`app/` 永不 import `spike/`。
- 旧仓 `C:\DEV\develop\NIX\t3rra-core` 只读，改前要仓库主人同意（它的工作树有未提交改动）。
- **不要在他人工作树上整文件回滚**。回滚自己的改动前先看 `git status`，或先备份。
- 补丁写成脚本文件再跑，不用内联 `node -e`（PowerShell 引号曾多次悄悄改坏文件）。
- 测 SSE 用 `node:http` 或 `EventSource`，不要用 `fetch()` 的 body reader：undici 会压住长连接，看起来像「引擎沉默」。
- 文档用中文；标识符、事件 kind、日志用英文。

## 四、目录

| 路径 | 内容 |
| --- | --- |
| `app/` | 产品代码。`index.html`（外壳与令牌）、`src/ui/`（渲染）、`src/view/`（派生视图、节奏）、`src/engine/`（ACP 适配、传输）、`src/contract/`（事件契约）、`plugins/`（dev 桥） |
| `demo/ark.html` | 金标准样张的仓库内快照（正本在 3NDM1N15T4T0R） |
| `docs/` | 见下文 §六 |
| `spike/` + `traces/` | 零成本 ACP 探针及报文证据（不进产物） |
| `test/` · `tools/` | 单测 · 自研闸 |
| `tasks/` | 未完成任务的半成品（见 `status.md` §4） |
| `C:\DEV\develop\3NDM1N15T4T0R` | 设计语言正本（外部仓库） |
| `C:\DEV\develop\opencode` | opencode 上游源码（只读） |
| `C:\DEV\develop\NIX\t3rra-core` | 上一代实现（只读，规则出处） |

## 五、怎么跑

```
npm install
npm run dev          # → http://localhost:5191/，默认引擎 opencode
npm run check:all    # 提交前必须全绿
```

引擎解析顺序：`T3RRA_ENGINE_BIN` → `T3RRA_OMP_BIN` → 默认 opencode 优先 → 已知安装位置（`app/src/engine/resolve.ts`）。`T3RRA_ENGINE=omp` 可以退回 omp。

## 六、文档系统

| 文档 | 管什么 | 什么时候读 |
| --- | --- | --- |
| [`docs/status.md`](./docs/status.md) | **现在为真的事**：验收清单、已知未做、决定记录 | 每次接手 |
| [`docs/design.md`](./docs/design.md) | **视觉层唯一权威**：标准在哪、真数据映射、令牌、文案 | 动界面之前 |
| [`docs/rules.md`](./docs/rules.md) | 产品规则 1–25、七道闸 | 动契约、渲染、节奏之前 |
| [`docs/engine-contract-audit.md`](./docs/engine-contract-audit.md) | 对引擎的哪些假设是错的（F1–F21，附源码 path:line） | 动引擎交互之前 |
| [`docs/adapters/opencode-acp.md`](./docs/adapters/opencode-acp.md) | ACP 实测映射表（受 `check:traces` 约束） | 同上 |
| [`docs/capability-map.md`](./docs/capability-map.md) | coding-agent 能力全图：有、半截、缺 | 规划新功能 |
| [`docs/archive/`](./docs/archive/) | 被取代的旧文档，只作历史 | 需要考古时 |

**写文档的规矩**（2026-09-26 重构后生效）：

1. **一件事只写一处。** 其他地方只链接，不复述。复述会分叉：重构前同一条规矩散在 6 个文件里，数字互相矛盾。
2. **`status.md` 是现状，不是日志。** 过时的条目直接改或删；历史交给 git 和 `archive/`。
3. **决定写一行**进 `status.md` §5，带日期和依据。
4. **证据文档只写证据**，不写进度。进度写在 `status.md`。
5. 想新建文档，先问能不能并进现有文档。确实要整篇取代旧文档时，旧文档 `git mv` 进 `archive/`，并在顶部写明被谁取代。

# 盲审请求：t3rra-C0d3 工程状态

**给独立的审阅者（人或模型）。没人给你结论，请自己判。**
这份 prompt 是自足的：文件之外的事实都在这里，目录也写全了，不用猜。

## 0. 你是谁、被要求做什么

你是**独立盲审者**。请判断：这个工程现在健不健康、**会不会变成屎山**、最该先动什么。
你的价值在于**发现写这些文档的人自己看不见的问题**——不要客气，不要给好话。

**硬约束（违反即无效）**

- **只读**：不要修改、新建、删除仓库里的任何文件（`traces/`、`spike/` 也一样）。
- **不许无头浏览器**：不跑 puppeteer/playwright/jsdom，不跑 ark-ui 的 audit/capture 脚本。
- **不改本机任何配置**（尤其 `C:\Users\pachu77\.config\opencode\` 下面那份）。
- 旧仓库 `C:\DEV\develop\NIX\t3rra-core` **可以读、绝对不许写**：它的工作树是脏的
  （18 个未提交修改文件 + 未跟踪的脚本与 traces），在里面写东西等于毁掉别人的现场。

## 1. 背景事实（文件里读不到的，只有这份 prompt 有）

- 目标：做一个**"深夜看 agent 干活"的桌面控制台**（Windows 优先）。上一版实现在 `NIX\t3rra-core`。
- **引擎方向已从 omp 改成 opencode**。决定的依据是实测，不是推测：见 `docs/adapters/opencode-acp.md`
  与 `traces/opencode/`、`spike/`。
- 仓库主人 2026-09-23 明确表示：**整个项目打算重写**；他同时担心
  **"当前这个工作区会像旧项目一样变成屎山"**。
- **一起事故**（由写这份 prompt 的 agent 造成，已记录在 `docs/status.md`）：在旧仓库执行
  `git checkout -- plugins/omp-bridge.ts` 时，连带退掉了**别人 338 字节的未提交改动**，无法恢复
  （无 stash、无 dangling blob、无编辑器历史）。已提交历史未受影响；同仓库其他 18 个未提交文件未受影响。
- **本工作区于 2026-09-23 才进入版本控制**：`git init` + 基线提交 `3282df0`（40 个文件）。
  在此之前的所有改动都不可回溯——这份 prompt 写下时还没有 `.git`，行内若别处提到"没有版本控制"，
  是指那个时点。
- 本工作区与旧仓库的文档都**只用中文写**，标识符/事件名用英文。

## 2. 目录（从这里读；括号里是"读它该回答什么"）

工作区根：`C:\DEV\develop\t3rra-C0d3`

| 路径 | 是什么 | 读它回答什么 |
| --- | --- | --- |
| `AGENTS.md` | 交接文件：**这里有什么 + 规矩**（刚被改成中立版，不写判定与立场） | 一个陌生人能否只靠它上手？还残留哪些判定/硬编码？ |
| `docs/status.md` | **现状与决定**（唯一允许写"决定了什么"的地方，带日期），含事故记录 | 现状是否自洽？开放项是否清楚？ |
| `docs/README.md` | 文档导航 | 导航有没有指错/漏项 |
| `docs/current-state.md` | 上一版实现的现状 | 与代码/实测是否一致 |
| `docs/recommendation.md` | 后端对比与结论、可证伪的下一步 | 结论是否被证据托住 |
| `docs/backends/omp.md` | omp 的证据（含 blob-broker：图片发布到图床/云盘/隧道） | 换引擎的动因是否成立 |
| `docs/backends/opencode.md` | opencode 的接口面与代价（含 `/api/event` volatile、v2 破坏点） | 代价是否被低估 |
| `docs/backends/dsh.md` | 第三个候选及其被否理由 | 否得是否有理 |
| `docs/design-contract.md` | **界面标准答案**（ark 族 · complex · 只有暗色；色板/字体/构图/几何/动效/验收） | 契约里还有几条是无证据的"自造规则" |
| `docs/design-critique.md` | 界面反面清单（旧 endfield 风格的六个病灶） | 反面清单准不准 |
| `docs/design-review.md` | 范本的三方盲审记录（我 + 视觉审 + 可用性审）：已修/未修/证据冲突 | 哪些"已修"其实没验证 |
| `docs/adapters/opencode-acp.md` | **新引擎的实测映射表**（报文全集、契约行为、有损列、未闭合项） | 逐条能否复现；哪条是过度解读 |
| `demo/ark-console.html` | 界面范本（静态单文件；另一份 `ark-console-accepted-2026-09-21.html` 是上一版，用于对比） | 范本与契约、与引擎实测是否一致 |
| `demo/fonts/*.woff2` | 随包的 HarmonyOS Sans SC（可再分发） | 依赖是否合理 |
| `spike/spike-acp-opencode.mjs` | 零 token 的 ACP 握手/选项/可选出一次 prompt 的探针 | 探针的假设是否诚实 |
| `spike/spike-acp-load.mjs` | **脱敏**的 `session/load` 回放探针（只记报文种类，不记文本） | 回放结论是否站得住 |
| `spike/spike-acp-sequencing.mjs` | load 时序 + `effort` 按模型变化 | 时序结论是否可复现 |
| `spike/probe-bridge-opencode.mjs` | 从**旧仓库的 dev bridge** 端到端驱动 ACP（不经过浏览器） | 这条"无浏览器验证"是否合法、是否够 |
| `traces/opencode/*` | 报文证据：握手 / 回放 / 时序 / 一次真 prompt；另有两份本地导出：`openapi-1.17.18.json`（162 paths）、`opencode-config.schema.json`（官方 config schema） | 文档结论与报文是否对得上 |

相邻目录（本机其它位置）

| 路径 | 是什么 |
| --- | --- |
| `C:\DEV\develop\NIX\t3rra-core` | 上一版实现（**只读**）：它的 `AGENTS.md` / `NOTES.md` / `docs/event-model.md` / `docs/adapters/acp.md` 是"规则"的出处；工作树是脏的 |
| `C:\DEV\develop\NIX\oh-my-pi` | omp 上游源码 checkout（只读参考） |
| `C:\DEV\develop\NIX\.grok\skills\ark-ui` | 视觉参考系（**只看不加载**，别跑它的脚本） |

## 3. 环境事实（影响可复现性）

- 本机 `opencode` 版本 **1.18.32**，真二进制在
  `C:\Users\pachu77\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe`。
- 本机 opencode 全局配置在 `C:\Users\pachu77\.config\opencode\opencode.json`（里面挂了一个远程 MCP）——
  **不要改它**。探针用的是**项目级**配置（写在临时目录，跑完自删）。
- 探针会在本机 opencode 存储里**创建空会话**；`spike-acp-load.mjs` 会 **load 一个已有会话**，
  但 trace 里**只记报文种类与条数，不记文本、路径、标题**。你跑之前应当知道这一点。
- 只读的验证动作（推荐）：`git -C C:\DEV\develop\NIX\t3rra-core status` / `log` / `diff`（看旧仓库有多脏）、
  阅读 `traces/opencode/*.jsonl`、用浏览器**手动**打开 `demo/ark-console.html` 看观感。
- 会写文件/起进程的动作（要跑就得自己承担）：`node spike/*.mjs`（会写 `traces/opencode/` 新文件、
  起 `opencode acp` 子进程）、`npm --prefix C:\DEV\develop\NIX\t3rra-core test`（69 条单测，只读代码）。

## 4. 请回答的问题（要可证伪，别给好话）

1. **证据是真的，还是自我恭维？** 重跑探针、逐条对照 `docs/adapters/opencode-acp.md`；
   哪一条对不上，直接指出（报文、行号、命令输出）。
2. **文档里还有没有撒谎或过时的地方？** 已知两处，请再找更多：
   ① `AGENTS.md` §二 仍写着"尚未做 spike 实证"（已经做了）；
   ② 范本 `demo/ark-console.html` 的模式组是 `ASK / DO / PLAN`，而实测引擎只给 `build` / `plan` 两档。
3. **这个工作区会不会变成第二个屎山？** 按证据判，不要按印象：缺哪些闸（类型检查/测试/溯源校验/提交纪律）、
   什么被混在同一棵树里、哪个文件会最先腐烂、有没有"文档声明 > 实际能力"的地方。
4. **"继承规则、不继承代码"这条自洽吗？** 规则文本在旧仓库的哪些文件里？
   够不够一个人**只凭文档**重建实现？缺口在哪？
5. **谁在回避什么决定？** 列出没人拍板的开放项（平台范围、外壳选型、验收方式、是否复用旧代码的某几个文件）。
6. **单点故障在哪？** （只有一个人？验收只靠仓库主人的眼睛？没有自动化渲染验证？没有版本控制？）
7. **如果你接手，头三个动作是什么？第一件要删的东西是什么？**

## 5. 输出格式（中文；引用必须带路径）

- `## 结论`：三句以内，健康 / 亚健康 / 病（给出你的判定依据）
- `## 风险排序`：每条含 **证据（路径:行 或 命令输出）／影响／最小修法**
- `## 文档里的假话或过时处`：逐条给出文件与原文引用
- `## 该删的东西`
- `## 我没能验证的`（诚实列出）
- `## 接手清单`：三个动作，按顺序，各自的一句话理由

**总长不超过 1500 字**；不要复述文件内容；不要给客套话。
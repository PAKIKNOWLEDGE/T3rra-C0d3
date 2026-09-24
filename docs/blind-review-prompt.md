# 盲审请求：t3rra-C0d3 工程状态（2026-09-23，历史）

**独立审阅者说明。** 本文件为历史件，保留当时的问题清单；处置见 [`result.md`](./blind-review-result.md) 与现行 [`status.md`](./status.md)。

## 0. 任务

判断工程是否健康、是否会恶化为难维护的大型遗留码、最该先动什么。只列可证伪问题，不写客套。

**硬约束**

- **只读**：不改仓库内任何文件（含 `traces/`、`spike/`）。
- **无头浏览器禁用**：不跑 puppeteer/playwright/jsdom，不跑 ark-ui audit/capture。
- 不改本机配置（尤其 `C:\Users\pachu77\.config\opencode\`）。
- 旧仓 `C:\DEV\develop\NIX\t3rra-core` **可读不可写**（工作树脏）。

## 1. 背景

- 目标：Windows 优先的「深夜看 agent 干活」桌面控制台。上一代在 `NIX\t3rra-core`。
- **引擎 omp → opencode**，依据为实测（`docs/adapters/opencode-acp.md`、`traces/opencode/`、`spike/`）。
- 仓库主人 2026-09-23 要求整仓重写，并关注「是否会长成难维护的遗留码」。
- 事故（已记入 `status.md`）：旧仓 `git checkout -- plugins/omp-bridge.ts` 覆盖了他人 338 字节未提交改动，无法恢复。
- 本工作区 2026-09-23 才 `git init`（基线 `3282df0`）。此前改动不可回溯。
- 文档中文；标识符/事件名英文。

## 2. 目录

工作区根：`C:\DEV\develop\t3rra-C0d3`

| 路径 | 读它回答什么 |
| --- | --- |
| `AGENTS.md` | 陌生人能否只靠它上手 |
| `docs/status.md` | 现状是否自洽；开放项是否清楚 |
| `docs/README.md` | 导航有无指错/漏项 |
| `docs/current-state.md` | 与代码/实测是否一致 |
| `docs/recommendation.md` | 结论是否被证据托住 |
| `docs/backends/*.md` | 换引擎动因与代价是否成立 |
| `docs/design-contract.md` | 有无无证据的自造规则 |
| `docs/design-critique.md` · `design-review.md` | 反面清单是否准；「已修」是否可信 |
| `docs/adapters/opencode-acp.md` | 逐条能否复现；有无过度解读 |
| `demo/ark-console.html` | 范本与契约、引擎是否一致 |
| `spike/*.mjs` | 探针假设是否诚实 |
| `traces/opencode/*` | 文档结论与报文是否对得上 |

相邻：`NIX\t3rra-core`（只读规则出处）、`NIX\oh-my-pi`（omp 上游）、`NIX\.grok\skills\ark-ui`（视觉参考，只看不加载）。

## 3. 环境

- opencode **1.18.32**：`C:\Users\pachu77\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe`
- 全局配置 `C:\Users\pachu77\.config\opencode\opencode.json` **勿改**；探针用临时项目配置。
- `spike-acp-load.mjs` 会 load 已有会话；trace 只记种类与条数，不记文本。
- 只读动作：`git -C … status/log/diff`、读 traces、手动打开范本。
- 会写文件/起进程：`node spike/*.mjs`、`npm --prefix … test`。

## 4. 问题（须可证伪）

1. 证据是否真实：重跑探针、对照 `opencode-acp.md`，指出对不上的条目（报文、行号、输出）。
2. 文档是否有假话或过时（已知：`AGENTS.md` 曾写「尚未 spike」；范本曾写 `ASK/DO/PLAN` 而引擎仅 `build/plan`）。请再找。
3. 会不会成为难维护的遗留码：缺哪些闸、什么混在一棵树、哪个文件会先腐、有无「声明 > 能力」。
4. 「继承规则不继承代码」是否自洽；只凭本仓文档能否重建实现；缺口在哪。
5. 谁在回避哪些决定（平台、外壳、验收、是否复用旧代码）。
6. 单点故障（一人、纯人眼验收、无自动化渲染验证等）。
7. 若接手：头三个动作是什么；第一件该删什么。

## 5. 输出格式

- `## 结论`：三句内，健康 / 亚健康 / 病
- `## 风险排序`：证据（路径:行 或 命令输出）／影响／最小修法
- `## 文档里的假话或过时处`
- `## 该删的东西`
- `## 我没能验证的`
- `## 接手清单`：三个动作，顺序，各一句话理由

**总长 ≤ 1500 字**；不复述文件内容；不写客套。

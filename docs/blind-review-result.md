# 盲审结果：t3rra-C0d3 工程状态

- 日期：2026-09-23
- 方式：只读审阅（未改仓库、未跑探针、未开无头浏览器）
- 对照输入：`docs/blind-review-prompt.md`、`AGENTS.md`、`docs/**`、`demo/**`、`spike/**`、`traces/opencode/**`、旧仓只读 `C:\DEV\develop\NIX\t3rra-core`

---

## 结论

**亚健康，偏向“文档调研很扎实、工程闸门为零”的过渡态。**  
证据层（`traces/opencode/*`、`docs/adapters/opencode-acp.md`）大体可对上，并非自我恭维；但多份导航/现状文档互相打架，本工作区无测试/类型检查/溯源校验，且“已修”视觉项无法机读复核——按此结构续写，**会变成第二座屎山**。  
依据：假话≥5处、闸门=0、双真相源≥3对、开放决定至少4项无人拍板。

---

## 风险排序

### 1. 文档多真相源，status 说不清谁权威

- **证据**
  - `docs/README.md:3`「只放调研产物，不放代码」
  - `docs/status.md:8`「工程写在本工作区/`app/`」
  - `docs/README.md:14` 导航首推 `current-state.md`，却不链 `status.md` / `AGENTS.md`
  - `docs/current-state.md:67` 仍写「引擎 omp——已定」
- **影响**：接手者先读错文件，把已推翻结论当铁律。
- **最小修法**：README 导航改为 `status` → `AGENTS` → `design-contract` → `adapters/opencode-acp`；`current-state` 标【过时快照】并删/划掉 §5 引擎行。

### 2. 零工程闸门

- **证据**：根目录无 `package.json` / `tsconfig` / `.gitignore` / CI；仅 1 个 baseline commit（`3282df0`）。旧仓才有 `npm run check` / `test`（`t3rra-core/package.json`）。
- **影响**：`app/` 一开写就无 typecheck / 单测 / `from` 溯源并集校验；适配器文档 vs traces 无脚本对账。
- **最小修法**：先落 `check` + 最小 vitest +「文档报文 kind ⊆ traces」校验脚本，再写产品代码。

### 3. 「实测」有两条落盘证据缺口

- **证据**
  - `docs/adapters/opencode-acp.md:55`「141 条更新…521ms 后返回」——`spike/spike-acp-load.mjs:98-104` **故意不记 load 响应**；`*-load-redacted.jsonl` 只有 142 条 update、无 result。
  - 全部 traces **无 `effort` 字样**，但 `opencode-acp.md:70` 写了各模型 effort 取值。
- **影响**：最像“自我恭维”的两处恰在适配器表。
- **最小修法**：标【未落盘/仅控制台】或重跑时把响应 `t_ms`、`set_config_option` 全文写入脱敏 trace。

### 4. 范本模式组与引擎脱节 + 契约自相矛盾

- **证据**
  - `demo/ark-console.html:773-775` 为 `ASK / DO / PLAN`；traces 中 mode 仅 `build` / `plan`。
  - `docs/design-contract.md:14` 称主标题已改任务主题，`:126-127` 仍写「仍未修」；`docs/design-review.md:141` 称已做。
- **影响**：验收“已修”清单不可信；接真引擎会渲染假档位。
- **最小修法**：契约 §七 与 review 对齐；模式组改 runtime 驱动或标 DEMO-only。

### 5. 单点故障

- **证据**
  - 视觉验收仅「仓库主人的眼睛」（`docs/design-contract.md:129-136`）
  - 一人仓；`spike/probe-bridge-opencode.mjs` 依赖旧仓 dev bridge
  - 旧仓 18 个脏修改 + 已毁 338B（`docs/status.md:27-30`）
- **影响**：无自动化渲染/契约回归；跨仓探针一脏就断。
- **最小修法**：允许的机读项清单化（重复 id、悬空 class、kind 对账）；bridge 探针固定旧仓 commit，或把桥以只读快照复制进本仓。

### 6.「继承规则不继承代码」未拍板，摘录还不完整

- **证据**
  - `docs/status.md:16-17` 待确认
  - 规则原文：旧仓 `AGENTS.md` §二、`docs/event-model.md`、`docs/adapters/acp.md`
  - `docs/current-state.md:56-61` **漏了 8–9**（间隔归相位、换 model 丢样本），且 13–18 仍是 Endfield，已被 `docs/design-contract.md` 取代
- **影响**：只读本仓文档无法重建静默判据与契约变更纪律（22–25）。
- **最小修法**：把「有效规则全集」一页化（含 8–9、22–25、design-contract 覆盖声明），旧仓只作只读指针。

---

## 文档里的假话或过时处

| 位置 | 原文 / 事实 |
| --- | --- |
| `AGENTS.md:24` | 「尚未做 spike 实证」——已有 `spike/` + `traces/` + `opencode-acp.md` |
| `docs/README.md:3` | 「只放调研、不放代码」vs `docs/status.md:8` 工程落在本仓 |
| `docs/README.md:48-49` | 「代价是一个 AgentSource」——与 `status.md` 重写计划并存，未说明是否仍成立 |
| `docs/current-state.md:67` | 引擎仍写 omp 已定 |
| `docs/current-state.md:60` | 视觉仍 Endfield，已被 `docs/design-contract.md:5-7` 废止 |
| `docs/design-contract.md:126-127` | 主标题「仍未修」vs 同文件修订记录 + 范本已改 |
| `docs/adapters/opencode-acp.md:55,70` | 521ms / effort 明细无对应落盘 |
| 盲审 prompt §1（`docs/blind-review-prompt.md`） | 「工作区没有 .git」——实有，且已 baseline 提交（prompt 过时） |
| `docs/backends/*` star 数等【文档】 | 快照 2026-09-21；README 自承会过时，但导航仍当“先读现状” |

已知两处（AGENTS 的 spike 假话、ASK/DO/PLAN）确认成立；另见上表。

---

## 该删的东西

1. `docs/current-state.md` §5「引擎=omp 已定」整表（或改归档）——最毒的化石。
2. `docs/README.md`「不放代码」定性及过时「一句话结论」，改为 `status.md` 的指针。
3. 范本硬编码 **ASK**（及 DO 命名）——与 runtime 两档冲突；先标 DEMO 或删到 build/plan。
4. `.commandcode/` 若非项目资产：勿进主叙事树（现已入 git）。

---

## 我没能验证的

- 未重跑任何 spike（会写 traces / 起进程，且违反本次“只读”约束）。
- 未开浏览器，故一切「已修」视觉 / 对比度 / design-review 只能读代码与算术记录。
- `effort`、521ms、blob-broker 默认值、`allow_always` 持久化、HTTP `/api/event` volatile——文档自认未闭合，本次亦未验。
- 旧仓 69 测试未跑；旧仓脏树未逐文件 diff。
- HarmonyOS 字体许可仅按文档采信。

---

## 接手清单

1. **一天内清假话对齐**：改 `AGENTS.md:24`、`README` / `status` / `current-state` / `design-contract §七` 四处矛盾——先保证只读一个入口就能得到真现状。
2. **立闸再写码**：`gitignore` + `check`/`test` + adapter↔traces kind 对账 + 要求新结论必须挂 trace 路径；没有闸不建 `app/`。
3. **拍板四件事**（逼 owner 一次）：
   - 是否确认「继承规则不继承代码」
   - 平台是否仅 Windows
   - 重写范围（新 `AgentSource` 是否复用旧 `state.ts` / `derive.ts`）
   - 验收是否允许「机读清单 + owner 抽查」以打破纯人眼单点

**第一件要删的**：`docs/current-state.md` 里仍生效的「引擎已定 omp」决策表——它会在导航首屏把人带进已废弃的世界。

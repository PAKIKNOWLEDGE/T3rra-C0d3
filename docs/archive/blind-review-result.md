> **【归档 2026-09-26】** 2026-09-23 工程盲审的结果。处置已并入 [`docs/status.md`](../status.md)。

# 盲审结果：t3rra-C0d3 工程状态（2026-09-23，历史）

- 日期：2026-09-23  
- 方式：只读（未改仓、未跑探针、未开无头浏览器）  
- 输入：[`blind-review-prompt.md`](./blind-review-prompt.md)、`AGENTS.md`、`docs/**`、`demo/**`、`spike/**`、`traces/opencode/**`、旧仓只读

> 本文件为历史记录。多数条目已在后续 `status.md` 中处置；现行状态以 `status.md` 为准。

---

## 结论

**亚健康**：证据层（traces、适配器表）大体可对上；当时多份导航/现状文档互相冲突，工程闸门为零，「已修」视觉项无法机读复核。按当时结构续写，**会恶化为难维护的遗留码**。  
依据：假话 ≥5 处、闸门=0、双真相源 ≥3 对、开放决定至少 4 项无人拍板。

---

## 风险排序

### 1. 文档多真相源，权威不清

- 证据：`docs/README.md` 曾写「只放调研不放代码」；`status.md` 写工程在本仓；导航首推 `current-state.md` 不链 `status.md`；`current-state.md` 曾写「引擎 omp 已定」。
- 影响：接手者先读错文件，把已推翻结论当铁律。
- 最小修法：README 改为 status → AGENTS 导航；`current-state` 标过时并改引擎行。

### 2. 零工程闸门（当时）

- 证据：无 `package.json` / tsconfig / CI；仅 baseline commit。
- 影响：无 typecheck、单测、溯源并集校验、适配器↔traces 对账。
- 最小修法：先落 check + vitest + kind 对账，再写产品代码。  
  **后续已建六道闸**（见现行 `status.md`）。

### 3. 「实测」两处落盘缺口（当时）

- 证据：load 响应 `t_ms`、`effort` 曾只在控制台。
- 最小修法：补进脱敏 trace 或降级标注。  
  **后续已补证据。**

### 4. 范本模式组与引擎脱节

- 证据：范本 `ASK/DO/PLAN` vs 引擎仅 `build/plan`；契约 §七 与 review 有「已改/未改」矛盾。
- 最小修法：范本改 runtime 驱动或标 DEMO；契约对齐。  
  **后续范本已改 `BUILD/PLAN`。**

### 5. 单点故障

- 证据：验收仅目视；一人仓；跨仓探针依赖旧仓 bridge；旧仓 18 个脏文件。
- 最小修法：可机读项清单化；bridge 探针固定或快照。  
  **后续已建清单制与 check:app。**

### 6. 「继承规则不继承代码」未拍板、摘录不完整（当时）

- 证据：`current-state` 漏规则 8–9；13–18 仍为 Endfield。
- 最小修法：规则一页化。  
  **后续已写 `rules-inherited.md`，四条边界已由主人确认。**

---

## 文档里的假话或过时处（当时）

| 位置 | 问题 |
| --- | --- |
| `AGENTS.md` | 「尚未做 spike」——已有 spike/traces/适配器表 |
| `docs/README.md` | 「不放代码」vs status 工程落在本仓 |
| `docs/current-state.md` | 引擎仍写 omp 已定；视觉仍 Endfield |
| `docs/design-contract.md` | 主标题「仍未修」vs 同文件修订记录 |
| `docs/adapters/opencode-acp.md` | 521ms / effort 无落盘（后已补） |
| `blind-review-prompt.md` | 「没有 .git」——时点后已有 git |
| `docs/backends/*` | star/版本为 2026-09-21 快照 |

---

## 该删的东西（当时）

1. `current-state.md` §5「引擎=omp 已定」整表（或归档）。
2. `README.md`「不放代码」定性及过时「一句话结论」。
3. 范本硬编码 `ASK`——与 runtime 冲突，删到 build/plan。
4. `.commandcode/` 若非项目资产：勿进主叙事树（当时已在 git）。

---

## 没能验证的

- 未重跑 spike；未开浏览器（一切「已修」视觉只能读代码与算术记录）。
- `effort`、521ms、blob-broker 默认、`allow_always` 持久化、`/api/event` volatile——文档自认未闭合。
- 旧仓 69 测试未跑；旧仓脏树未逐文件 diff。
- HarmonyOS 字体许可仅按文档采信。

---

## 接手清单（当时）

1. **一天内清假话对齐**：改 AGENTS / README / status / current-state / design-contract 矛盾——只读一个入口就能得到真现状。
2. **立闸再写码**：gitignore + check/test + adapter↔traces 对账；新结论必须挂 trace 路径。
3. **拍板四件事**：是否「继承规则不继承代码」；平台是否仅 Windows；是否复用旧 `state.ts`/`derive.ts`；验收是否允许「机读 + 主人抽查」。

**第一件要删的**：`current-state.md` 中仍生效的「引擎已定 omp」决策表。

**后续**：四条边界已拍板；闸门已建；范本模式组已改。现行未完成项见 `status.md` 验收清单。

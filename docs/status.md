# 现状与决定

**这份文件是唯一允许写"我在做什么、决定了什么"的地方。** 每条带日期；过时就改、就删，
不要让它变成会撒谎的化石。结构性的东西（哪里有什么、什么规矩）写在 `AGENTS.md`。

## 代际（先看这张表；它是机器可读的硬事实）

| 代 | 名字 | 状态 | 从何时起 |
| --- | --- | --- | --- |
| 旧 | `t3rra-core`（旧品牌写成 "T3rra Protocol"） | **弃用**：只读参考，规则出处 | 2026-09-23 |
| 现行 | **`t3rra-C0d3`** | **唯一工程树**（产品代码住这里） | 2026-09-23 |

**命名规则（废除混用）**：工程对外只写 `t3rra-C0d3`。文档里不再用裸 `t3rra` 指代本项目，
也不再把它叫 core（`C0d3` 是 leet 的 **Code**，不是 core）。
界面上的**产品品牌**（屏幕上那几个字）是另一件事，不在这里定。

**叙事止血（2026-09-23）**：这棵文档树上曾同时活着三套叙事——
A「只调研不放码，工程在 core」、B「保留 core 界面只换引擎的小手术」、C「整个重写，代码住 t3rra-C0d3」。
**现在只有 C 有效**：A 的载体（`current-state.md`）与 B 的载体（`recommendation.md`）都已标【仅历史】并在文件头写明取代关系；
任何与此冲突的句子，以本文件的代际表为准。

## 2026-09-23

- **工程写在本工作区**（`C:\DEV\develop\t3rra-C0d3`），产品代码的落点建议 `app/`。
  `NIX\t3rra-core` 是上一版实现，改它之前先问仓库主人。
- **引擎方向：opencode**（ACP v1）。依据不是推测而是本机实测：`docs/adapters/opencode-acp.md`
  与 `traces/opencode/`、`spike/`。四个核心判据已闭合（报文存在性、options、`session/load` 回放、审批）。
- **界面标准：ark 族 · complex · 只有暗色**，以 `docs/design-contract.md` 为准（含 2026-09-21 的修订），
  范本是 `demo/ark-console.html`。
- **继承的是规则，不是代码**：溯源契约、静默判据、absence 规则、无头禁令、证据分级、specimen-first 验收，
  这些从上一版的文档里继承；实现要新写。
- **待仓库主人确认**：① 上面的"继承规则不继承代码"是否就是要的做法；
  ② 目标平台是否只有 Windows（影响外壳选型；Linux/WebKitGTK 的坑见 `docs/adapters/opencode-acp.md` §六.6）。

## 2026-09-21

- 后端结论与对比：`docs/recommendation.md`；界面契约与盲审：`docs/design-contract.md`、`docs/design-review.md`。
- 范本经历一轮三方盲审（我 + 视觉审 + 可用性审），修了判决语域、动作语义、可访问性、字法几何、窄窗口；
  未修项与被否的证据冲突都在 `docs/design-review.md` §六/§七。

## 已知事故记录（保留，不许抹）

- **2026-09-23**：我在 `NIX\t3rra-core` 执行 `git checkout -- plugins/omp-bridge.ts` 时，
  连带退掉了该文件里**别人的 338 字节未提交改动**（无法从 git 恢复；无 stash、无 dangling blob）。
  已提交历史未受影响，同仓库其他未提交文件未受影响。教训：**改别人的工作树之前先看 `git status` 的字节数，
  不要用整文件 checkout 做"回滚我自己的改动"**。
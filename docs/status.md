# 现状与决定

**这份文件是唯一允许写"我在做什么、决定了什么"的地方。** 每条带日期；过时就改、就删，
不要让它变成会撒谎的化石。结构性的东西（哪里有什么、什么规矩）写在 `AGENTS.md`。

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
> **【归档 2026-09-26】** 被 [`docs/rules.md`](../rules.md) 取代（编号 1–25 不变）。本文 §六 视觉与 §三 文案已过时。

# 现行有效规则全集（继承自旧仓）

> **代际: 现行 ｜ 状态: 生效 ｜ 来源: 只读对照 `C:\DEV\develop\NIX\t3rra-core`**
>
> 本页是**唯一有效规则清单**。原文来自旧仓（只读，不许写）：
> `AGENTS.md` §二（1–25）、§五、`docs/event-model.md`、`docs/adapters/acp.md`。
> 四条边界由仓库主人 2026-09-23 确认（见 `status.md`）：
> **① 继承规则、不继承代码；② 主平台 Windows、NixOS 为 P2；③ 只继承规则与数据形状；
> ④ 验收 = 机读清单 + 主人抽查（渲染观感归人眼）。**
>
> 旧仓代码 / 测试 / traces **不进 `app/`**；`app/` 只按规则与数据形状重新实现。

## 一、架构（不许重开）

1. **渲染层只许读派生视图，不许读会话状态**。（旧实现名 `DerivedView` / `SessionState`；名可换，层级不可换。）
2. **溯源规则**：屏幕上每一项必须能追到一个 `AgentEvent` 或时钟；每个派生块声明 `from: string[]`，
   且**并集必须覆盖日志里出现过的全部 kind**——机读校验（见 §八）。
3. **事件流是唯一事实来源**，单向：Event Stream → Session State → Derived View → UI。
4. **契约只有一份实现，在 TS 里**。任何外壳（Rust / Node 桥）**只许搬字节**，
   **不许认识事件词汇**（kind、相位名、静默判据）。
5. **`task` / `plan` / `memory` / `workflow` / `multi-agent` 不是 runtime 概念**，不许进契约。
   （opencode API 有 todo / subagent / skills——接入时不得漏入，见 §二.23–25。）
6. **能力声明描述传输形状**，不是已生效的开关。

## 二、静默判断（数值照抄，勿自行发明）

7. **不许用绝对毫秒判断卡没卡。** 基线 = **当前相位实测事件间隔的中位数**；
   `×8` 记 slow、`×25` 记 stalled；**样本 &lt; 3 拒绝给判据**（显示 `CADENCE NOT ESTABLISHED`）。
   硬上限（10 分钟）**只作兜底，不得冒充测量**。
8. **间隔归给「等待期间活跃」的相位**，不是新事件打开的那个；**非 busy 期间的间隔丢弃**。
9. **换 model 丢弃样本**；同 model 重连保留。

## 三、文案

10. **工业控制系统状态报告，不是 AI 助手对话。** 机器报告，不解释，不安慰。
11. 禁用词：正在做、卡住了吗、需要你、它还在跑、只是话不多。
12. **数据缺失要显式说出来**：`NOT STATED` / `NOT REPORTED` / `NOT ESTABLISHED`。
    **宁可显示 absence，不许造一个看着合理的值。**

## 四、验证与交付

19. **无头浏览器禁用**（仓库主人规定）。不跑 puppeteer/playwright/jsdom、不跑 ark-ui 的 audit/capture。
20. 因此**不得声称看见过渲染结果**。能自证的只有：typecheck、单测、静态检查、机读对账。
21. 交付界面改动：给**可直接打开的路径** + 人话「看什么」，由**仓库主人**验收。
22. 静态断言针对**压缩后的输出**做 token 断言，不按语法断言（minifier 会去引号、改反引号）。

## 五、契约变更纪律

23. **改 schema 前，先改 `docs/adapters/<name>.md` 的映射与有损列，再升 schema 版本号。**
24. **「第二个适配器造不出来的字段，本来就不该在契约里。」**
25. 不承诺「只加不改」；承诺的是：**冻结渲染层的输入契约**，schema 在真实适配器验证前允许调整。

## 六、视觉（本节已被取代）

13–18（Endfield 设计语言、`border-radius: 0`、强调色 &lt;5%、动效纪律、不引游戏美术、不引用游戏名）
→ 以 [`design-contract.md`](./design-contract.md) 为准：**ark 族 · complex · 仅暗色**。

仍然有效的**精神**：`border-radius: 0`（直角）、强调色面积 &lt;5%、
动效只用于揭示层级或确认输入、**健康读数不动**、不引入语言之外的颜色、不引用具体游戏名。

## 七、旧仓已踩过的坑（仍适用的）

- **把新后端接到旧界面上**：换引擎时易沿用旧结构，旧界面假设会渗进新契约。
- **把关键限制写在好消息后面**：限制/缺陷写在自己的位置上。
- **`package.json` 重写时丢掉 `devDependencies`**：下次 `npm uninstall` 会删掉依赖。
- **空断言**（`expect(x).toBeGreaterThanOrEqual(0)`）等于自欺。
- **hover 反色违反对比底线**（实测 2.88:1 / 1.05:1）：设计规则须连数值约束一起遵守。
- **`min-height: 100vh` 放进 grid 容器**：内容驱动会撑破视口。
- **双击打不开构建产物**：`file://` 下浏览器可能拒绝 fetch ES module——交付「双击打开」时先想清这条。

## 八、本工作区的机读闸（`npm run check:all`）

| 规则 | 闸 |
| --- | --- |
| 2（溯源并集覆盖） | 已落：`test/acp-coverage.test.ts` 断言 `from` 并集 ⊇ 契约 kind 与 traces 产出的 kind |
| 19/20（无头禁令、不许声称看见） | `tools/check-demo.mjs` + 文档措辞（不写「我看见了」） |
| 21（交付可打开 + 看什么） | 交付说明写入 `status.md`；`check-demo.mjs` 保证范本自包含 |
| 22（断言针对压缩输出） | **待落**：构建产物 token 断言 |
| 23/24（映射先行、不许有造不出来的字段） | `tools/check-traces.mjs`：文档声称的 kind ⊆ traces 实际 kind |
| 文档互链 | `tools/check-docs.mjs`：相对链接必须可解析 |

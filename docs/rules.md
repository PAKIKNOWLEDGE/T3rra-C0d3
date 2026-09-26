# 产品规则（1–25）

> 规则原文继承自上一代 `NIX\t3rra-core`（只读），只继承规则与数据形状，不继承代码。编号不变，代码与测试注释按编号引用（例如 `rules §一.2`）。
> 取代 [`archive/rules-inherited.md`](./archive/rules-inherited.md)。视觉规则（旧 13–18）移到 [`design.md`](./design.md)。
> 工作流程上的规矩（证据、无头禁令、悬空控件、提交）在 [`AGENTS.md`](../AGENTS.md)，这里只放产品本身的规则。

## 一、架构（不许重开）

1. **渲染层只读派生视图，不读会话状态。** 本仓对应 `ConsoleView`（`app/src/view/derive.ts`）；名字可换，层级不可换。
2. **溯源。** 屏幕上每一项都要能追到一个 `AgentEvent` 或时钟。每个派生块声明 `from: string[]`，并集必须覆盖日志里出现过的全部 kind（机检：`test/acp-coverage.test.ts`）。
3. **事件流是唯一事实来源，单向流动**：Event Stream → State → Derived View → UI。
4. **契约只有一份实现，在 TS 里。** 外壳（Rust / Node 桥）只搬字节，不认识事件词汇（kind、相位名、静默判据）。
5. **`task` / `plan` / `memory` / `workflow` / `multi-agent` 不是 runtime 概念**，不进契约。opencode 有 todo / subagent / skills，接入时不得漏进来。
6. **能力声明描述的是传输形状**，不是已经生效的开关。

## 二、静默判断（数值照抄，不许自行发明）

7. **不许用绝对毫秒判断卡没卡。**
   - 基线 = 当前相位实测事件间隔的中位数。
   - 超过基线 `×8` 记偏慢，`×25` 记停滞。
   - 样本少于 3 个时拒绝给判据，界面写「未建立」。
   - 10 分钟硬上限只作兜底，不能冒充测量。
8. **间隔记在「等待期间活跃」的那个相位上**，不记在新事件打开的相位上。非运行期间的间隔丢弃。
9. **换 model 就丢弃样本**；同一个 model 重连则保留。

实现：`app/src/view/cadence.ts` + `test/cadence.test.ts`。

## 三、文案

10. **界面是作业终端，不是 AI 助手在聊天。** 只报告事实，不解释、不安慰。
11. **禁止判词和拟人安慰**：STALLED / NEEDS YOU / SUSPENDED、「卡住了吗」「它还在跑」「只是话不多」。
    功能名词可以用，包括「需要你批准」（金标准原文）。
12. **数据缺失要显式说出来**，写「未告知 / 未报告 / 未建立」。**宁可显示缺失，也不造一个看着合理的值。**

用词表见 [`design.md`](./design.md) §6。

## 四、验证与交付

19. **无头浏览器禁用。** 例外只有 `test/**` 内用 jsdom 做 DOM 结构断言（2026-09-24 登记，见 AGENTS §三）。
20. 因此**不得声称看见过渲染结果**。能自证的只有 typecheck、单测、静态检查、机读对账。
21. 交付界面改动时给**可直接打开的路径**和人话写的「看什么」，由仓库主人验收。
22. 针对构建产物的静态断言要按**压缩后的 token** 写，不按源码语法写。**未落地**：目前还没有构建产物断言。

## 五、契约变更纪律

23. **改 schema 前，先改 `docs/adapters/<name>.md` 的映射与有损列，再升 schema 版本号。**
24. **第二个适配器造不出来的字段，本来就不该进契约。**
25. 不承诺「只加不改」；承诺的是**冻结渲染层的输入契约**。在真实适配器验证之前，schema 允许调整。

## 六、上一代踩过、现在仍适用的坑

- 换引擎时沿用旧界面结构，旧假设会渗进新契约。
- 把关键限制写在好消息后面。限制要写在它自己的位置上。
- 重写 `package.json` 时丢了 `devDependencies`。
- 空断言（`expect(x).toBeGreaterThanOrEqual(0)`）等于自欺。
- hover 反色违反对比度底线（实测 2.88:1 / 1.05:1）。
- `min-height: 100vh` 放进 grid 容器会撑破视口。
- `file://` 下浏览器可能拒绝 ES module，交付「双击打开」前先想清楚这一点。

## 七、机读闸（`npm run check:all`）

| 闸 | 命令 | 管什么 |
| --- | --- | --- |
| 类型 | `npm run check` | `tsc --noEmit`（strict，覆盖 `app/` 与 `test/`） |
| 单测 | `npm test` | vitest；规则 2 的溯源覆盖、规则 7–9 的静默判据、契约失败路径 |
| 控件 | `npm run check:app` | 控件 id 接线、`ui-manifest.json` 表态、禁止词、渲染层 id 可解析、字体文件齐全、禁止静默 guard |
| 边界 | `npm run check:boundary` | 视觉层（`app/src/ui/**`、`app/src/view/**`）不 import 引擎层 |
| 范本 | `npm run check:demo` | `demo/*.html` 自包含、无重复 id、无悬空 class、有 reduced-motion、内联脚本可解析 |
| 文档↔报文 | `npm run check:traces` | `docs/adapters/opencode-acp.md` §二 声称的 kind 与 `traces/opencode/` 实际出现的 kind 双向一致；引用的 trace 存在 |
| 文档链接 | `npm run check:docs` | `docs/**` 与 `AGENTS.md` 的相对链接可解析 |

**闸红不许提交；不许为了变绿放宽闸**：要么改结论，要么补证据。

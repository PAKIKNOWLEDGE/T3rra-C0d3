# t3rra

给 [opencode](https://github.com/sst/opencode) 做的桌面控制台。不是重新发明 agent——循环、工具、会话、provider、审批全归引擎，这里只负责**把运行时如实摊在界面上**。

后端是 **opencode**（经 ACP 协议），界面是 ark 族、暗色、为读代码流密度调过的一套 HUD。上一代实现用的是 oh-my-pi（omp）+ endfield 风格，已作废；其代码与结论只在 `docs/` 里作为反面参照和历史保留。

## 现在能做什么

打开它，连上本机 opencode，可以：起会话、发消息、看它一步步流式干活（正文 / 思考 / 工具调用）、批准或拒绝它的权限请求、看历史会话列表、建新会话、删会话、**中途掐断它**（`■ HALT` 或输入框 `Esc`）。

引擎出错时界面会报出错，不会假装"一切正常"或"什么都没有"——这是本项目对 UI 的第一要求，写进 `AGENTS.md` 并有单测。

## 现在不能做什么（截至 2026-09-24）

- **不是桌面应用**：跑在开发用浏览器里，Tauri 壳一行没写，没有安装包。
- **单会话**：多会话并发在契约层已能路由，但没有并发的交互设计。
- **不能选项目目录**：只在临时沙箱目录里干活。
- 会话超过 100 条只显示一页。
- 视觉/观感由仓库主人口头验收，任何"我看着挺好"都不算数。

这些的逐条状态在 [`docs/status.md`](docs/status.md)，功能全图在 [`docs/capability-map.md`](docs/capability-map.md)。

## 跑起来

```bash
npm install
npm run check:all     # tsc + vitest + 5 道自研闸（app/boundary/demo/traces/docs），全绿才谈交付
npm run dev           # 起 vite，界面在其打印的地址上
```

前提：本机装有 `opencode`（`T3RRA_ENGINE_BIN` 指定完整路径更稳）。

## 仓库地图

| 路径 | 是什么 |
| --- | --- |
| `app/` | 产品本体（界面、契约、引擎适配、渲染器）|
| `docs/` | 现状、设计、规则、决策、审计（**接手先读 `status.md`**）|
| `demo/` | 界面范本，已验收，`check:demo` 校验它 |
| `spike/` + `traces/` | 引擎探针与报文证据。不进产物、`src/` 永不 import 它们 |
| `tools/` | 自研闸门（`check-app` / `check-boundary` / `check-traces` / `check-docs` / `check-demo`）|

## 接手必读

1. **先读 [`AGENTS.md`](AGENTS.md)**（规矩：无头浏览器禁用、结论标证据等级、悬空控件、状态合并只能用 patch、不整文件回滚）。
2. 再读 `docs/status.md` 和 `docs/engine-contract-audit.md`。
3. 对 opencode 行为的任何改动必须带证据等级【实测】/【源码】/【文档】/【未验】。抓包、读 `docs/` 或旧 README 得来的"知道"，**未经源码/报文核对一律算猜测**。

> 这个"证据"规矩不是洁癖：本项目整套 HALT 架构曾建立在一个错误实验（误以为 ACP 不能中断）上，全部靠抓包反推的对齐做完才拆掉。

## 关于代际与命名

工程名 / 仓库名用 `t3rra`。这里是**重写后的 opencode 后端一代**；`t3rra-core` 仓库 URL 是历史地址。上一代（omp + endfield 风格）的产物已被视为废料，其结论只在 `docs/` 里作为反面参照和证据保留。界面品牌名是另一件事，不在本 README 决定。

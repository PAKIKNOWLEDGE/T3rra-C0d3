# t3rra

给 [opencode](https://github.com/sst/opencode) 做的桌面控制台。agent 的循环、工具、provider 和审批策略全都归 opencode；这个项目**只把运行状态如实摊在界面上**。

后端是 **opencode**（经 ACP 协议），界面是 ark 族、暗色、按读代码流的密度调过的一套 HUD。上一代实现用的是 oh-my-pi（omp）配 endfield 风格，代码和结论留在 `docs/` 里作反面参照和历史背景。

## 现在能做什么

打开它，连上本机 opencode，能起会话、发消息、看它一步步流式干活（正文 / 思考 / 工具调用）、批准或拒绝权限请求，也能看历史会话、建新会话、删会话，**中途掐断它**（`■ HALT` 或输入框 `Esc`）。

引擎出错时界面会报错，不会假装"一切正常"或"什么都没有"。这条规则写进了 `AGENTS.md`，有对应的单测。

## 现在不能做什么（截至 2026-09-24）

- 不是桌面应用：跑在开发浏览器里，Tauri 壳一行没写，没有安装包。
- 单会话：多会话并发在契约层已能路由，但没有配套的交互设计。
- 不能选项目目录：只在临时沙箱目录里干活。
- 会话超过 100 条只显示一页。
- 自动化闸全绿不构成界面交付证据；视觉观感由仓库主人目视确认。

逐条状态在 [`docs/status.md`](docs/status.md)，功能全图在 [`docs/capability-map.md`](docs/capability-map.md)。

## 跑起来

```bash
npm install
npm run check:all     # tsc + vitest + 5 道自研闸（app / boundary / demo / traces / docs）
npm run dev           # 起 vite，界面在其打印的地址上
```

前提：本机装有 `opencode`。`T3RRA_ENGINE_BIN` 指定完整路径更稳。

## 仓库地图

| 路径 | 是什么 |
| --- | --- |
| `app/` | 产品本体（界面、契约、引擎适配、渲染器） |
| `docs/` | 现状、设计、规则、决策、审计。**接手先读 `status.md`** |
| `demo/` | 界面范本，已验收，`check:demo` 校验它 |
| `spike/` + `traces/` | 引擎探针与报文证据。不进产物，`src/` 永不 import 它们 |
| `tools/` | 自研闸门（`check-app` / `check-boundary` / `check-traces` / `check-docs` / `check-demo`） |

## 接手必读

1. 先读 [`AGENTS.md`](AGENTS.md)（规矩：无头浏览器禁用、结论标证据等级、悬空控件、状态合并只能用 `patch`、不整文件回滚）。
2. 再读 `docs/status.md` 和 `docs/engine-contract-audit.md`。
3. 对 opencode 行为的任何改动必须带证据等级【实测】/【源码】/【文档】/【未验】。抓包、读 `docs/` 或旧 README 得来的"知道"，**未经源码与报文核对一律算猜测**。

> 证据规矩是用代价换来的。整套 HALT 架构曾建立在一个错误实验（误以为 ACP 不能中断）上，读源码对齐报文之后才把它拆掉。

## 关于代际与命名

仓库名 `T3rra-C0d3`。这里是**重写后的 opencode 后端一代**，旧名 `t3rra-core` 的 URL 由 GitHub 自动重定向。上一代（omp + endfield 风格）的产物已视为废料，其结论只留在 `docs/` 作反面参照与证据。界面品牌名不在本 README 处理，另见 `AGENTS.md` 二、命名。

# t3rra

给 [opencode](https://github.com/sst/opencode) 做的桌面控制台，自用。agent 的循环、工具、provider 和审批策略都归 opencode 管；这个项目负责把运行状态**如实**、**好看**地摊在界面上。

界面是鹰角风格的 **ARK 族设计语言**，取自明日方舟的实机系统页：灰色实心块、浅色选中块、蓝色主操作、基建站点卡式的工单、道具弹窗式的批准卡。设计语言是这个项目的核心资产，说明见 [`docs/design.md`](docs/design.md)。仓库内的金标准样张是 [`demo/ark.html`](demo/ark.html)，可以双击打开。

## 现在能做什么

- 连上本机 opencode（ACP，stdio）；
- 列出、打开、新建、删除会话；
- 流式看回复、思考和工单；
- 批准或拒绝权限请求；
- 中途掐断本轮：点「中止」，或在输入框按 `Esc`。

引擎出错时，界面会报出错误，不会假装一切正常，也不会显示成「什么都没有」。

## 现在不能做什么

- 还不是桌面应用：跑在开发浏览器里，Tauri 壳没写，没有安装包。
- 只能单会话；不能选项目目录，只在沙箱目录里工作。
- 看不到 diff、文件、终端，也看不到上下文用量（契约里还没有这些数据）。

逐条状态见 [`docs/status.md`](docs/status.md)。

## 跑起来

```bash
npm install
npm run check:all     # tsc + vitest + 5 道自研闸
npm run dev           # → http://localhost:5191/
```

本机需要装有 `opencode`。用 `T3RRA_ENGINE_BIN` 指定完整路径更稳。

## 接手

先读 [`AGENTS.md`](AGENTS.md)（规矩和文档地图），再读 [`docs/status.md`](docs/status.md)。

## 代际与命名

仓库名 `T3rra-C0d3`，是重写后的 opencode 后端一代。旧名 `t3rra-core` 的 URL 由 GitHub 自动重定向。上一代（omp 引擎 + endfield 风格）以及更早的 `ark-console` 细线 HUD 范式都已否定，只在 `docs/archive/` 里留作历史。

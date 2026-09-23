# 仓库里带的字体（以及它们的许可）

界面的字体轨照 `docs/visual-guide.md` 的"当前一代"来：**宽展示字 + 技术 grotesque + 数据等宽 + 打字机存档轨 + 中文随包**。
这里只放**可以再分发**的字体；商业/受限的那些不进仓库（见文末"想额外对照怎么办"）。

| 文件 | 家族 | 用途（在 `app/index.html` 里的轨） | 许可 | 来源 |
| --- | --- | --- | --- | --- |
| `fonts.css` | —— | 本地化的 `@font-face` 表（把 Google Fonts 的 CDN 地址换成本目录文件名） | —— | 由 `fonts.googleapis.com` 的 CSS 重写而来 |
| （多组哈希名 `.woff2`） | Michroma · Archivo · Orbitron · Instrument Sans · IBM Plex Mono · Special Elite · Courier Prime · Oswald | 展示轨 / UI 轨 / 数据轨 / 打字机轨（含各 unicode-range 子集） | **OFL 1.1**（Google Fonts） | Google Fonts |
| `HarmonyOS_Sans_SC_Regular.woff2` · `HarmonyOS_Sans_SC_Bold.woff2` | HarmonyOS Sans SC | 中文（正文轨与展示轨的 CJK 字形） | 华为"免费商用"授权（**随包前请读原文**；本仓库主人 2026-09-23 裁定用它） | 由上一版实现 `NIX\t3rra-core\assets\fonts\` 复制 |

## 为什么没有"设计师自用那几款"

`Akira Expanded`（Demo 版）、`Clash Display`、`Satoshi`、`MiSans`、`京華老宋体`、几个打字机体
都来自那个字体库站点，**许可不允许我们随包分发**，所以**不进仓库**。
需要本地对照时可以这样用（只在你自己的机器上、不进提交）：

1. 把文件放到本目录，命名照 `docs/visual-guide.md` 的记录；
2. 在 `app/index.html` 的 `<style>` 前临时加一段 `@font-face`，把家族名放进对应字体栈的最前面；
3. **别把这些文件提交上来。**

## 缺字体会怎样

`fonts.css` 里的每条 `@font-face` 都带 `font-display: swap`，而且每一条字体栈都以通用族收尾
（`sans-serif` / `monospace`），**文件缺席时只会回退，不会崩**。
`npm run check:app` 会检查 `fonts.css` 引用的文件是否都在——少文件会让闸变红，避免"悄悄换字体"那种漂移。
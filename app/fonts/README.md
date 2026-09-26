# 仓库里带的字体（以及它们的许可）

字体轨照金标准 ARK 族来（`docs/design.md` §5）：**中文随包 + 系统数字轨 + 系统等宽轨**。

| 轨 | 字体 | 来源 | 许可 |
| --- | --- | --- | --- |
| 正文 / 标题 | `HarmonyOS_Sans_SC_Regular.woff2` · `HarmonyOS_Sans_SC_Bold.woff2`（本目录） | 由上一版实现 `NIX\t3rra-core\assets\fonts\` 复制 | 华为「免费商用」授权（**随包前请读原文**；仓库主人 2026-09-23 裁定用它） |
| 数字 / 英文角标 | Bahnschrift SemiCondensed → Bahnschrift → Arial Narrow | Windows 自带，不进仓库 | 系统字体 |
| 等宽 | Cascadia Mono → JetBrains Mono → Consolas | Windows 自带，不进仓库 | 系统字体 |

`fonts.css` 只声明 HarmonyOS 两个字重。

## 已移除

2026-09-26 删除了旧 HUD 一代的 Google Fonts 切片：Michroma、Archivo、Orbitron、Instrument Sans、IBM Plex Mono、Special Elite、Courier Prime、Oswald，共 35 个 `.woff2`，许可均为 OFL 1.1。它们承载的是被否定的「科幻 HUD」气质，新界面不再引用。需要时可从 git 历史取回。

## 已知空白

方舟那种窄粗斜体数字，目前由 Bahnschrift SemiCondensed 加浏览器合成斜体顶替，**没有可随包分发的替代**。在 mac/Linux 上会回退到 Arial Narrow 或系统无衬线字体。见 `docs/design.md` §7。

## 缺字体会怎样

每条字体栈都以通用族收尾，文件缺席时只会回退，不会崩。`npm run check:app` 会检查 `fonts.css` 引用的文件是否都在。

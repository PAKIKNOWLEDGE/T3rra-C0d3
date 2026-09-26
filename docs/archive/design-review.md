> **【归档 2026-09-26】** 对旧范本 `demo/ark-console.html`（现 `docs/archive/demo/`）的三方盲审记录。范本已被否定。

# 盲审记录：`demo/ark-console.html`

日期：2026-09-21。对象：`demo/ark-console.html`（已验收为范本级）。  
标准：[`design-contract.md`](./design-contract.md)、[`design-critique.md`](./design-critique.md)、ark-ui 真图与 token、真产品交互纪律（`t3rra-core` 的 `dock.ts` / `console.ts` / `derive.ts`）。

**方式**：三方独立——主审一遍 + 两个子代理各审一条线（视觉对味 / 用户友好），子代理未读主审结论。重合条目按高可信，单方条目按存疑列于 §六。本轮具备视觉能力，参考系为读图而非文字描述。

**全程无渲染、无浏览器、无无头脚本**（工作区规矩）。下文「长什么样」均为【源码】+【参考图】+【算术】。**布局、动效、对比度终判归仓库主人目视。** 已修项对比度为 WCAG 实算。

## 一、结论

**骨架对味，约完成一半；对用户不够友好——两条都能修，当时已修。**

对味缺口：家族签名被降成背景幽灵、舞台缺蓝图层、停滞秒数全屏出现四次。  
对用户最要紧：×39 停滞被写成 `SLOW + Not Required`；唯一能解决问题的 HALT 最不显眼；除语域与时钟外控件几乎无反馈；焦点环在填充按钮上等于不存在。

## 二、证据分级

| 记号 | 含义 |
| --- | --- |
| 【源码】 | 被审文件或 t3rra-core 源码 |
| 【参考图】 | 视觉能力看过参考系图片 |
| 【算术】 | 按字号/字宽/令牌推算，非渲染结果 |
| 【未验】 | 无证据；写出以便证伪 |

## 三、三方结论重合与分歧

| 条目 | 主审 | 视觉 | 可用性 | 判定 |
| --- | --- | --- | --- | --- |
| 停滞判成 `SLOW / Not Required`，产品为 `stalled` | ✔ | — | ✔ | **成立**，已修 |
| HALT 最不显眼、DO 最显眼 | ✔ | — | ✔ | **成立**，已修 |
| 47 出现 4 次，破契约 §四 | ✔ | ✔ | ✔ | **成立**，已修 |
| 焦点环在填充按钮上不可见 | ✔ | ✔ | ✔ | **成立**，已修 |
| 家族签名（第二行描边）未做，幽灵大于锚点 | — | ✔ | — | **成立**，已修 |
| 舞台缺蓝图/线框层 | — | ✔ | — | **成立**，已修 |
| 15–44px 挤了 6 档中间尺寸 | ✔ | ✔ | — | **成立**，已修 |
| 窄窗顶栏溢出、指令坞滚出屏 | — | ✔ | ✔ | **成立**，已修 |
| 动作与模式压成一排、模式无 `aria-pressed` | — | — | ✔ | **成立**，已修 |
| `COMMAND AWAITING` 与产品 `AWAITING COMMAND` 说反 | ✔ | — | ✔ | **成立**，已修 |
| 酸绿被当装饰用于 grep 命中 | — | ✔ | — | **成立**，已修 |
| `--panel` 与 ark token 不一致 | — | ✔ | — | **成立**，已修 |
| 未选中导航应为「暗一档的青」 | — | ✔ | — | **不采**：主审读图为中性灰，证据冲突 → 不动（§六.1） |
| 契约「禁四面框」过度解读 | — | ✔ | — | **部分采**：不修范本，记提案（§七.5） |

## 四、已修（改动在 `demo/ark-console.html`）

按用户影响排序。

### 4.1 判决与文案

- 舞台判决 `Silent` → **`Stalled`**（产品档位名）；删自相矛盾的 `SLOW` 后缀。
- `[ 06 // NEEDS YOU ]` 的 `Not Required` + 硬限未达 → **`Nothing for 47s`**。原写法两处错：把 10 分钟硬兜底当「没到极限」理由（它是 backstop）；产品在 `isBusy && stalled` 时给 `NOTHING FOR <秒>s`。**卡死就是卡死。**
- `[ 05 // STUCK ]` 补 **`STALLS AT ×25`**；档位词 **`Stalled`**（秒数归舞台锚点）。
- 占位符 `COMMAND AWAITING` → **`RUNNING · ESC TO HALT`**（产品忙碌态；空闲为 `AWAITING COMMAND`）。Esc 出路写在可见处。

### 4.2 动作与模式

- 拆为 `.actions`（仅 HALT）与 `.modes`（`role="group"`、各按钮 `aria-pressed`）。顺序：动作 → 模式 → 指令坞 → SEND。
- **HALT 为填充主操作**；模式选中青色擦入；SEND 描边。
- **动作是状态，不是配置**：HALT 仅忙碌时存在。按 HALT/Esc 真停：秒数冻结、HALT 消失、占位符 `AWAITING COMMAND`、步骤带 `HALTED · 47s`、档案栏 idle 判决、比较行 `SILENCE NOT MEANINGFUL`。SEND/回车重新武装。
- 状态词由 `html[data-run]` 在 CSS 切换，键鼠只改数值。

### 4.3 可访问性

- 焦点环移到控件外（`outline-offset: 2px`）；原内缩在青底上实测 **1.00:1**。顶栏满格控件用 `outline-offset: -3px` + `currentColor`。
- 对比度：`VISUAL DEMO` 去透明度（2.63→6.37）；`NO SIGNAL` 提到 10px/82%（7.52:1）；`--rule-control` 4.20:1。
- 装饰 `aria-hidden`；时间线 `role="img"`；幽灵字删除；步骤带 `ol/li` + `aria-current="step"`。
- 左轨 `aria-disabled` + `title`（范本无第二视图）；OPERATOR 下导航 `pointer-events: none`。
- `prefers-reduced-motion` 全局关动效。

### 4.4 字法与几何

- 展示轨 **Bahnschrift**；标题**第一行实心、第二行描边**；背景幽灵字删除（原 250px 大于锚点 190px）。
- 字号 ~18 档 → **8 档**；字距 13 档 → **6 档**。
- 舞台补蓝图线框层（96px 网格 + 内联 SVG，`aria-hidden`）。
- 步骤带编号与名字共用基线。
- 进场动画 `fill-mode: both` → `backwards`，消除时间线永久 clip-path 裁切；`padding-top/margin-top` 借高，馈送高度不变。
- 馈送：日志段 `overflow-y: auto` 自滚，开屏滚到最新；`OUTPUT SUSPENDED` 在日志段外、`flex: 0 0 auto`。不用渐隐/硬裁（两轮实机均遮字）。
- 秒数大字仅 **2 处**；`--panel` → `rgba(8,10,11,.82)`；grep 命中改正文白（state 仅在线/完成）。

### 4.5 边界态、任务主题、字体

- **状态条（范本 chrome，非产品）**：`STALLED / IDLE / LOST / APPROVAL` 四态，各态锚点/判决/动作/档案栏不同；`LOST` 档案栏整块 `Not reported`。`HALTED` 为第五态（Esc，不进状态条）。呼吸块仅 STALLED/APPROVAL。
- **舞台主标题 = 任务主题**（主人裁定）：`主题令牌抽取` / `CSS Token Extraction`，工具下沉馈送首行。
- **CJK**：随包 `fonts/HarmonyOS_Sans_SC_{Regular,Bold}.woff2`。Latin 展示轨仍为权宜（Bahnschrift 不可再分发）。
- 判决词与 `NEEDS YOU` 加 `aria-live="polite"`。
- 时间线游标带 `data-age`，随静默重算。

### 4.6 窄窗

- ≤960px：指令坞 sticky bottom。
- ≤700px：顶栏折两行（含 `VISUAL DEMO`）；步骤带横滚、格下限 190px。

## 五、自证项（可机检部分）

```
external refs: none
ids: 25 | duplicates: none
JS id refs: 22 | missing in DOM: none
classes used but not styled: none
reduced-motion block: true
inline on*= handlers: 0
font sizes (12, 含 3 clamp) · letter-spacings (6)
JS SYNTAX OK
```

同级依赖仅 `demo/fonts/` 两个 woff2（失败则回退微软雅黑，不影响其余自证）。

## 六、已知未修

1. **未选中导航颜色**：视觉审读为暗青，主审读为中性灰 → 保持 `--muted`，待主人裁决或放大参考图。
2. **无运行时输出写路径**：SEND 仅在 `HALTED` 重新武装；忙碌忽略（不伪造输出）。事件流为唯一事实来源。
3. **Latin 展示轨仍为平台字体**：可再分发窄/宽成对字体未完成。

**状态条边界**：数值为范本给定（非实测）；`LOST` 无动作（产品重连在传输层）；不发明按钮。

## 七、契约修正（六条已写入 `design-contract.md`，2026-09-21）

1. `--panel` → ark token `rgba(8,10,11,.82)`。
2. 描边字 = 标题第二行，非背景幽灵。
3. 「同一数不许两处」→ 大字号 ≤2 处；正文引用原文不算。
4. 展示字体候选需补宽体。
5. 「禁四面框」→ 禁四面**圆角**卡片 chrome；细边框+强边合法。
6. chamfer 归属标【未验】。

## 八、验收方式（不可协商）

**请用目视验收，勿仅依赖自证。**

| 文件 | 说明 |
| --- | --- |
| `demo/ark-console.html` | 本轮修改版 |
| `demo/ark-console-accepted-2026-09-21.html` | 上次验收备份 |

看什么（按优先级）：

1. **Esc / `▶ HALT`**：秒数停、HALT 消失、步骤带 `HALTED · 47s`、档案栏 idle、占位符 `AWAITING COMMAND`；回车/SEND 跑回去——验「动作是状态」。
2. **Tab 走一遍**：每个控件青色焦点环可见，尤其填充色 HALT 与 DO。
3. **舞台**：第一行实心 + 第二行描边；蓝图线框；47 为全屏最大（无幽灵字）。
4. **档案栏三问**：`Running bash` / `Stalled`（含 ×25）/ `Nothing for 47s`。
5. **EXPERT**：时间线与会话块多协议读数；宽 &lt;700px 顶栏折行且 `VISUAL DEMO` 仍在、坞钉底。
6. **状态条四态**：`LOST` 应整块 `Not reported` / `—`。
7. **对比旧版**：旧版 DO 为唯一填充、HALT 灰、标题仅幽灵字。

**未做到**：无渲染证据。1280/1440 与 390px 观感只能目视判断。

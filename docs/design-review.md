# 盲审记录：`demo/ark-console.html` 的"对味"与"好用"

日期：2026-09-21。被审对象：`demo/ark-console.html`（单文件静态范本，仓库主人已验收为"范本级"）。
对照标准：[`design-contract.md`](./design-contract.md)（正面标准答案）、
[`design-critique.md`](./design-critique.md)（反面清单）、ark-ui 参考系的**真图**
（`assets/showcases/screenshots/ark-complex.png`、`mobile/ark-complex.png`、`assets/promo/output/*.png`、
`assets/tokens/ark-ui.tokens.json`、`references/recipes.md`），以及真产品的交互纪律
（`t3rra-core/src/ui/dock.ts`、`src/ui/console.ts`、`src/view/derive.ts`、`index.html`）。

**本次审阅方式**：三方独立出结论——我自己一遍，再拉两个子代理各审一条线（"视觉对味"与"用户友好"），
两份子代理意见**没有喂过我的结论**（真盲审）。三方重合的条目按高可信处理，只有一方提的按存疑处理并列在
§六。**本轮换了基模，具备视觉能力**，所以参考系是"真的看图"而不是读文字描述——这一点是上一轮做不到的，
也是本轮推翻契约里两条自造规则的依据。

## 一、结论

**骨架对味，味只到一半；而且它对用户不够友好——但两条都能修，且已经修了。**
对味上的缺口是三处：家族签名（标题第二行的描边空心字）被降级成了一块几乎看不见的背景幽灵、
舞台没有蓝图艺术层、以及全屏的"同一个数出现四次"（停滞秒数 47）。对用户最要命的一条是：
**这块屏把 ×39 的停滞写成了"SLOW + Not Required"，等于教深夜的人走开**；其次，唯一能解决问题的
那个按钮（HALT）是全屏最不显眼的一个，而无关的 DO 反而是唯一填充色按钮；再其次，除了语域切换和时钟，
屏上所有控件点下去都没有反应，焦点环在填充按钮上等于不存在。

## 二、证据分级与"我没验证什么"

| 记号 | 本文件里的含义 |
| --- | --- |
| 【源码】 | 在被审文件或 t3rra-core 源码里读到的行 |
| 【参考图】 | 我（或子代理）用视觉能力看过参考系图片 |
| 【算术】 | 按字号/字宽/令牌值推算的数值，不是渲染结果 |
| 【未验】 | 没有证据，写出来是为了能被证伪 |

**本条最重要：全程没有渲染，没有打开浏览器，没跑任何无头脚本**（沿用 t3rra-core 与工作区规矩）。
所以下文所有"长什么样"的判断都是【源码】+【参考图】+【算术】。**布局、动效、对比度的最终观感只有
仓库主人的眼睛能判**。已修部分的对比度是**实算**的（WCAG 相对亮度、sRGB 线性化），不是感觉。

## 三、三方独立结论的重合与分歧

| 条目 | 我 | 视觉审 | 可用性审 | 判定 |
| --- | --- | --- | --- | --- |
| 停滞被判成 `SLOW / Not Required`，产品判据是 `stalled` | ✔ | — | ✔ | **成立**，已修 |
| HALT 最不显眼、DO 最显眼（产品恰好相反） | ✔ | — | ✔ | **成立**，已修 |
| 47 出现 4 次，破契约 §四 | ✔ | ✔ | ✔ | **成立**，已修 |
| 焦点环在填充按钮上不可见 | ✔ | ✔ | ✔ | **成立**，已修 |
| 家族签名（标题第二行描边）没做，幽灵比锚点还大 | — | ✔ | — | **成立**，已修（见 §七.2） |
| 舞台缺蓝图/线框艺术层 | — | ✔ | — | **成立**，已修 |
| 15–44px 之间挤了 6 档中间尺寸 | ✔ | ✔ | — | **成立**，已修 |
| 窄窗口顶栏会横向溢出、指令坞会滚出屏幕 | — | ✔ | ✔ | **成立**，已修 |
| 动作与模式被压成一排、模式无 `aria-pressed` | — | — | ✔ | **成立**，已修 |
| `COMMAND AWAITING` 把产品的 `AWAITING COMMAND` 说反 | ✔ | — | ✔ | **成立**，已修 |
| 酸绿（state）被当装饰用在 grep 命中上 | — | ✔ | — | **成立**，已修 |
| `--panel` 值与 ark token 不一致 | — | ✔ | — | **成立**，已修 |
| 未选中的导航应是"暗一档的青色" | — | ✔ | — | **不采**：我复看参考图读作中性灰，两条证据冲突，按"没把握就不动"处理（§六.1） |
| 契约"禁四面框"过度解读 | — | ✔ | — | **部分采**：不修范本，只记提案（§七.5） |

## 四、已修（本轮改动，全部在 `demo/ark-console.html`）

按"用户会遇到什么"排序，不是按 CSS 改动量排序。

### 4.1 判决与文案（对用户最要命的一条）

- 舞台判决词 `Silent` → **`Stalled`**（产品 `derive.ts` 的档位名，也是产品档案 chip 的文字），
  并删掉自相矛盾的 `SLOW` 后缀：档位是 `stalled`，比较值是 `×39`。
- `[ 06 // NEEDS YOU ]` 的值 `Not Required` + `HARD LIMIT 10:00 NOT REACHED` → **`Nothing for 47s`**。
  原写法有两处错：一是拿 10 分钟硬兜底当"没到极限"的理由，而**这个兜底只在"完全没有基线"时才成立**
  （`derive.ts` 的 `SILENT_HARD_LIMIT_MS` 注释明说它是 backstop，不是停滞定义）；二是产品在
  `isBusy && level === "stalled"` 时给的判决就是 `NOTHING FOR <秒>s`。**卡死就是卡死，不是"没事"。**
- 档案栏 `[ 05 // STUCK ]` 补上 **`STALLS AT ×25`**（产品的停滞阈值，单一来源进脚本常量），
  档位词从"一个大数字 47s"改成 **`Stalled`**：秒数由舞台锚点拥有，档案栏给判据。
- 指令坞占位符 `COMMAND AWAITING` → **`RUNNING · ESC TO HALT`**（产品 `dock.ts` 忙碌态原文；
  空闲/停掉时是 `AWAITING COMMAND`）。原来那句既说反了语序，又在"工具卡了 47 秒"的屏上说
  "命令在等"，自相矛盾；顺带**把 Esc 这条出路写在了用户看得到的地方**。

### 4.2 动作与模式（第二要命）

- 拆成两个容器：`.actions`（**动作**，只装 HALT）+ `.modes`（**模式**，`role="group" aria-label="command mode"`，
  三个按钮各带 `aria-pressed`），顺序按产品与参考图：动作 → 模式 → 指令坞 → SEND。
- **HALT 变成填充主操作**（产品里它就是 `btn--primary`），模式选中态改成青色"擦入"（产品
  `[aria-pressed="true"]` 的写法），SEND 回到描边按钮。**"卡住时该按哪个"不再需要猜。**
- **动作是状态，不是配置**：HALT 现在只在忙碌时存在。按 HALT 或 Esc 会真的停：
  秒数冻结、HALT 从槽里消失、占位符变 `AWAITING COMMAND`、步骤带从 `NO SIGNAL` 变 `HALTED ·
  47s`、档案栏换成 `Not measured` / `Nothing needed`（产品的 idle 判决），舞台的比较值换成
  `SILENCE NOT MEANINGFUL`（产品 `dossierRows` 原文——停掉以后，静默不再有可比对象）。
  SEND / 回车把它重新武装。**这样这个范本可以"试"，而不是只能看。**
- 状态词全部由 `html[data-run]` 在 CSS 里换，键盘/鼠标只改数值：同一个事实不会两处维护。

### 4.3 可访问性

- **焦点环挪到控件外**（`outline-offset: 2px`，产品 `field-console.css` 同款）：原先是 `-2px` 内缩，
  画在 DO 的青底之内，**实测对比 1.00:1，等于没有焦点指示**。顶栏语域这种满格控件用
  `outline-offset: -3px` + `outline-color: currentColor`（两种选中底色下都成立，且不会被视口边缘裁掉）。
- 对比度实算与修正：`VISUAL DEMO` 标记因 `opacity:.55` 只有 **2.63:1** → 取消透明度（回到 6.37:1）；
  `NO SIGNAL` 标签 9px、青 60% ≈ **4.42:1** → 提到 10px、82%（**7.52:1**）；可点控件的新边界
  令牌 `--rule-control: rgba(244,246,246,.40)` = **4.20:1**（原来 SEND 的边只有 2.62:1，低于
  WCAG 1.4.11 的 3:1）。
- 装饰与语义：角括号、呼吸块、时间线的每个游标标成 `aria-hidden`，时间线整体给 `role="img"`
  加文字描述；删掉的背景幽灵字不再让读屏器读出第二个 "SCAN"；步骤带改成 `ol/li` 并给活动格
  `aria-current="step"`（产品的写法）。
- 左轨不再假装能点：`aria-disabled="true"` + `cursor: default` + `title` 说明范本没有第二个视图，
  同时保留产品的语域门禁（OPERATOR 下导航项 `pointer-events: none`，即"这是读数不是导航"）。
- `prefers-reduced-motion` 依旧***全局***关掉动效，擦入的终态靠"颜色写在终态上"保留。

### 4.4 字法与几何

- **展示轨换 Bahnschrift**（DIN 系，Windows/WebView2 自带；已确认本机 `C:\Windows\Fonts\bahnschrift.ttf`
  存在），回退 Arial Narrow。同时把大标题从 3 行式排版改成**家族签名：第一行实心、第二行描边**
  （`-webkit-text-stroke`，与参考图三张一致），**背景幽灵字删除**——它原来 250px，比真正的锚点
  （190px 的 47）还大，等于装饰压过读数。
- 字号从 ~18 档收到 **8 档**（10 / 11.5 / 12.5 / 13 / 16 / 18 / 19 / 22 + 三个响应式 clamp），
  字距从 13 档收到 **6 档**（-0.02 / -0.04 / 0.06 / 0.12 / 0.16 / 0.22）。"大 + 极小、中间少"才成立。
- 舞台补**蓝图线框层**：点阵之上加 96px 青色工程网格 + 一条内联 SVG 折线（透明度 .15），
  相标签前加一条青色引导短线——都是参考图上舞台必有的构造层，纯装饰、`aria-hidden`。
- 步骤带格内基线对齐：编号与名字**共用一条基线**（`align-self: baseline`），读数另起一行。
- **进场动画不再留永久裁剪框**（仓库主人在实机上看出来的第一条）：`LAST · tool.started` 这行标签
  挂在时间线轨道上方，而 `.timeline` 的进场动画带着 `both` 收场，终态 `clip-path: inset(0)` 被永久留下
  ——等于给时间线套了一个裁剪框，标签出框的部分被切掉。修法：`fill-mode` 由 `both` 改 `backwards`
  （动画结束把裁剪交还给元素），并让 `.timeline` 用 `padding-top: 22px` + `margin-top: -22px`
  把这 22px 从上方借来——标签落在边框盒之内，**而馈送的高度一点没少**（只加 padding 会从馈送身上抠走
  22px，那正是下一轮"顾此失彼"的来源）。**这一条在旧范本里就有，属于 §七.1 的"错位"。**
- **馈送不再用任何形式的"渐隐/硬裁"**（两轮实机反馈换来的结论，都有像素证据）：
  第一版用"盒子高度百分比"渐隐，实测把 `OUTPUT SUSPENDED` 按 **74%→59%** 的亮度吃掉（那句话偏偏
  落在盒子最底部，调百分比救不了）；第二版改成 `overflow: hidden` 硬裁，实测被切的是日志最后一行
  ——两种都是"遮字"。最终：日志段 `overflow-y: auto` 自己滚（照真产品 `.stage-main` 的做法），
  开屏滚到最新一行；`OUTPUT SUSPENDED` 在日志段之外、`flex: 0 0 auto`，上方加一条 1px 细线。
- 秒数只留 **2 处大字**（舞台锚点 + 步骤带侧读数），档案栏只说判据与档位。
- 令牌对齐 ark token：`--panel` → `rgba(8,10,11,.82)`（契约里那串 `rgba(10,13,14,.86)` 无出处）。
- grep 命中不再用酸绿（`state` 只给完成/在线），改成正文白；`LINK OK` 的绿点保持（这是在线态）。

### 4.6 边界态、任务主题、字体（仓库主人点名要的三条）

- **A1 边界态（我定、已做）**：顶栏的 `VISUAL DEMO` 旁加了一条**范本状态条**（`STALLED / IDLE /
  LOST / APPROVAL`），只属于演示、不是产品控件。四个状态各自的文案与结构变化：
  | 状态 | 舞台锚点 | 判决 | 动作槽 | 档案栏 |
  | --- | --- | --- | --- | --- |
  | STALLED（默认） | 静默秒数（每秒走） | `Stalled` + `USUALLY 1.2s · ×n` | `▶ HALT` | `Running bash` / `Stalled` / `Nothing for Ns` |
  | IDLE | `—`（无读数） | `Idle` + `NO RUN IN FLIGHT` | 空 | `Nothing running` / `Not measured` / `Nothing needed` |
  | LOST | 断链秒数 | `Connection lost` + `RUNTIME UNREACHABLE` | 空 | **`Not reported`**，行值全部 `—`（"宁可显示 absence"） |
  | APPROVAL | 等待裁决秒数 | `Approval waiting` + `REQUIRES YOUR DECISION` | `◎ APPROVE` + `✕ DENY` | `Awaiting approval` / `WRITE ACCESS · src/theme/tokens.css` |
  加上 Esc 触发的 `HALTED`（第五个，不进状态条），**动作槽逐状态增减**——这就是"动作是状态，
  不是配置"最直观的一幕。呼吸块只在 `STALLED`/`APPROVAL` 动，活动格脉冲只在 `STALLED` 动。
- **A2 舞台主标题 = 任务主题（已做，主人裁定）**：大标题从工具名改成任务主题 + 双语第二行
  （`主题令牌抽取` 实心 / `CSS Token Extraction` 描边），当前工具下沉到馈送第一行
  （`▶ bash HARDCODED COLOR SCAN`，青色）。契约 §四 已按此改写。
- **A3 CJK 字体（已做，主人裁定）**：随包 `fonts/HarmonyOS_Sans_SC_{Regular,Bold}.woff2`
  （取自 t3rra-core 的 assets，可再分发），`@font-face` 相对路径加载；CJK 与展示轨的 CJK 字形都落到它。
  **Latin 展示轨仍是权宜**（Bahnschrift 不可再分发；技术轨/数据轨本机缺失会回退）。
- **A5 状态变化可播报（已做）**：舞台判决词与档案栏 `NEEDS YOU` 加了 `aria-live="polite"`。
- **A6 时间线跟着秒数走（已做）**：每根游标带 `data-age`，按当前静默重算位置，静默超过整窗就隐去——
  "读数"和"图形"不再各说各话。

### 4.5 窄窗口

- ≤960px：指令坞 `position: sticky; bottom: 0`——**要中断的时候不能再让按钮滚出屏幕**。
- ≤700px：顶栏折两行（品牌/任务/链路一行，耗时/语域/范本标记一行），**什么都不丢**（尤其
  `VISUAL DEMO` 标记不能是第一个被挤出视口的东西）；`counter` 允许换行；步骤带横向滚动、格子有 190px 下限。

## 五、自证项（能机器验的只有这些，已经不是"看"了）

```
external refs: none                 ← 自包含，无 fetch / 无外链
ids: 25 | duplicates: none          ← 无重复 id
JS id refs: 22 | missing in DOM: none
querySelector targets: [data-age] · #stateSwitch button · button[data-mode] · .feed-lines
classes used but not styled: none   ← 没有悬空的类名
reduced-motion block: true
inline on*= handlers: 0
font sizes (12, 含 3 个 clamp) · letter-spacings (6)
JS SYNTAX OK                        ← node --check 过
```

唯一的同级依赖是 `demo/fonts/`（两个 woff2）——它加载失败也只是回退微软雅黑，不影响其余自证项。

## 六、已知但未修（连同理由）

2026-09-21 收盘时，第 2/4/5/7 条与字体中的 CJK 部分已经修掉（见 §4.6）；**仍然没修的是这三条**：

1. **未选中导航的颜色**：视觉审读参考图为"暗一档的青色"，我复读为中性灰。两条证据冲突 →
   不动（保持 `--muted`）。要定这条，得放大参考图像素或由仓库主人裁决。
2. **没有运行时输出的写路径**：SEND / 回车只在 `HALTED` 状态下"重新武装"，忙碌时被忽略
   （不伪造输出）。这是 t3rra-core "事件流是唯一事实来源"决定的，范本不该造内容。
3. **Latin 展示轨仍是平台字体**：Bahnschrift 不可再分发，技术轨（Space Grotesk）与数据轨
   （IBM Plex Mono）本机也没有，会回退系统字体。契约 §三 那条"可再分发的窄/宽成对字体"**仍未完成**。

**状态条自身的边界（新做的 A1，先把话说清）**：

- 状态条是**范本chrome**，产品里没有这个控件；它换来的是"边界态能被看见"，代价是顶栏多了 4 个按钮。
- 四个状态的**数值都是范本给的**（`LOST` 的 8s、`APPROVAL` 的 12s 等），形状照产品但值不是实测。
- `LOST` 状态**不给任何动作**：范本没有重连路径，产品的重连在传输层、不在界面词汇里。
  若将来要在这里给出口，得先有协议层的说法，不许界面自己发明一个按钮。

## 七、契约修正（**六条已全部落进 `design-contract.md`**，2026-09-21）

仓库主人把这一节交给我按提案改（"其他的我不知道咋办 你看着修"），所以下面每条都**已就地改过契约**，
并留了修订记录在契约开头。清单保留在这里作为"为什么改"的证据索引：

1. **`--panel` 值抄错了**：契约 §二 写 `rgba(10,13,14,.86)`，ark token（`ark-ui.tokens.json`）是
   `rgba(8,10,11,.82)`。范本已按 token 改，契约该跟着改。
2. **"幽灵描边大字"是契约对家族签名的改写**：`design-critique.md` 的原话与三张参考图都是
   **标题第二行只描边不填充**（实心 + 描边成对出现），没有一张把描边字当背景幽灵。建议契约
   §四 的"超大锚点"与"标题第二行"分开写，别混成一件事。
3. **"同一个数不许出现两处以上"太严**：真产品自己在档案栏同时给出 `QUIET 47s` 与
   `NOTHING FOR 47s`（`console.ts` 的 `dossierRows` 与 `derive.ts` 的 needs headline），
   而且那是**正确的**——判据必须能自报。建议改成"**大字号显示不超过两处；正文句子里引用原文不算**"。
   范本按这条执行：47 只在大字号上出现两次。
4. **字体候选只选了一半**：契约 §三 给的候选（Oswald / Saira Condensed / Archivo）全是窄体，
   而参考图的展示字是**宽重**无衬线；`design-critique.md` 自己写的是"极宽或极窄"。
   要补一个宽体候选（例如 Archivo Expanded / Saira Extra Condensed 之类成对）。
5. **"禁四面框"读得太狠**：`design-language.md` 禁的是"四面**圆角**卡片 chrome"，
   而参考图的 `ZONE // C-07` 面板恰恰是**细边框 + 一条青色强边**。"一条强边"≠"禁止任何框线"。
6. **chamfer 的归属缺证据**："可点主操作切 45° 角"在参考图里找不到对应（切角出现在大块斜切场，
   不在按钮上）。范本保留现状，但这条应当标为【未验】而不是规则。

## 八、验收方式（不可协商）

**请用眼睛验收，别信我的自证。** 两个文件都直接双击打开即可：

| 文件 | 是什么 |
| --- | --- |
| `demo/ark-console.html` | **本轮改过的版本**（上面所有修复都在里面） |
| `demo/ark-console-accepted-2026-09-21.html` | 你上次验收的那一版，原样备份，用于左右对比 |

看什么（人话清单，按优先级）：

1. **先按 Esc**（或点左下 `▶ HALT`）：秒数停住、HALT 从槽里消失、步骤带变 `HALTED · 47s`、
   档案栏变 `Not measured / Nothing needed`、占位符变 `AWAITING COMMAND`；再敲回车或点 SEND 让它跑回去。
   ——这一条是在验"动作是状态，不是配置"。
2. **Tab 键走一遍**（输入框 → SEND → HALT/模式 → 顶栏语域）：每个控件的青色焦点环都要看得见，
   尤其**按在填充色的 HALT 与 DO 上时**。
3. **看舞台**：第一行实心 + 第二行描边的标题；青色蓝图线框；那个 47 是全屏最大的东西（幽灵字已经删掉）。
4. **看档案栏三个问题**：`Running bash` / `Stalled`（含 `STALLS AT ×25`）/ `Nothing for 47s`。
5. **切 EXPERT**：时间线与会话块里多出协议读数；把窗口缩到 700px 以下，看顶栏是否折成两行且
   `VISUAL DEMO` 标记还在、指令坞是否钉在底部。
6. **来回点顶栏的 `STALLED / IDLE / LOST / APPROVAL`**（新加的状态条）：看三个问题、动作槽、
   链路标记、时间线缺口怎么各自变化。**`LOST` 那一下最值得看**——档案栏应该整块变成
   `Not reported` 与 `—`，而不是继续报一个看着合理的值。
7. **对比旧版**：旧版的 DO 是唯一填充按钮、HALT 是灰的、标题只有一个 `SCAN` 幽灵字。

**我未做到的**：没有渲染证据。布局在 1280/1440 宽、以及 390px 手机宽下的实际观感，只有你的眼睛能判。
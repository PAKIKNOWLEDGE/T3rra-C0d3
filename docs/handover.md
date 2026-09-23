# 交接单（2026-09-23）

接手的人或 agent：**这份先读，再读 [`status.md`](./status.md)（现行真相）和 `../AGENTS.md`（结构与规矩）。**
写这份的人在这天被解雇，原因不是技术错误本身，而是**把"已知未做"留在了代码注释里、没放进汇报**——
下面第三节把这件事写成规矩，because 下一个接手的人会被同样的问题考验。

## 一、怎么跑起来

```
npm install                                  # 首次
$env:T3RRA_ENGINE="opencode"; npm run dev     # → http://localhost:5191/
npm run check:all                            # 六道闸，提交前必须全绿
```

引擎解析顺序：`T3RRA_ENGINE_BIN` → `T3RRA_OMP_BIN` → PATH → 已知安装位置（`app/src/engine/resolve.ts`，不写死主机路径）。
本机实测引擎：**opencode 1.18.32**（`%APPDATA%\npm\node_modules\opencode-ai\bin\opencode.exe`）。

## 二、现在的真实状态（三分法，别合并成一团）

### 真做完了（有实测/测试托底）

- **引擎链路**：ACP stdio 握手 → `session/new` → `session/prompt` 流式 → `stopReason`。证据：`traces/opencode/*.jsonl` + `spike/probe-app-pipeline.mjs`。
- **选项**：`configOptions` 只渲染运行时给的清单；`session/set_config_option` 的**响应带回落后的完整选项表**（`app/src/engine/responses.ts` 有测试钉住）；`mode` 走坞内成对按钮、`model`/`effort` 走右栏下拉——**按运行时给的 `category` 判定，没有 id 白名单**。
- **会话恢复能力**：`session/load` 会把历史以普通 `session/update` 回放，**且回放先流完、响应后到**（规范行为）。证据：`traces/opencode/*-load-redacted.jsonl`、`*-sequencing-redacted.jsonl`（含 `load_timing`）。
- **静默判据（规则 7–9）**：`app/src/view/cadence.ts` + 11 条测试。基线 = **当前相位**间隔中位数、`×8/×25`、样本 <3 拒绝给判据、10 分钟硬上限只作兜底、非运行期间间隔丢弃、**换 model 丢样本**。界面：大锚点=静默秒数、`[ SIGNAL ]` 面板（LEVEL/QUIET/BASELINE/SAMPLES n/3/THRESHOLDS/LAST SIGN）。
- **六道闸 + 清单制**：`tsc` · 35 条 vitest · `check:app`（**元素清单 `app/ui-manifest.json`** + 字体 38/38 + 渲染层 id 全解析）· `check:demo` · `check:traces`（文档声称的 kind ⊆ traces 实际 kind）· `check:docs`。
- **EVENTS 视图**（真数据：每条事件的 `+秒数 / kind / 事实描述`）与 **NEW**（真动作：`session/new`，会话 id 变了才清空旧流）。

### 只做了一半（接上了，但不是我说的那样够用）

- **视觉第 2 代接进了 `app/`**（三层灰阶、宽展示字、打字机存档轨、角括号 HUD、菱形、反相 hover、字体随包），
  但**对话区没有重做**：现在还是"说话人标签 + 原文"的朴素渲染，长文挤成一坨、markdown 不渲染、
  reasoning 不能收起。**这是仓库主人明确点出的最差一处**。
- **`RESTART ⟲`** 是真的（杀进程重开），但它是**粗中断**：会话靠持久化，重开后要用 `session/load` 才回来（这条路径已实测可用，只是界面还没接）。

### 完全没做（仓库主人 11 条清单里的 8 条）

完整表见 [`status.md`](./status.md) 的"仓库主人的验收清单"。摘要：

| # | 事 | 卡在哪 / 怎么做 |
| --- | --- | --- |
| 1 | **中断 HALT** | ACP `session/cancel` **不存在**（实测 `-32601`）。HTTP 有 `POST /session/{sessionID}/abort`（本地 OpenAPI 实测存在）→ 需要 HTTP 通道 |
| 2 | **会话列表 + 网页端删除** | 列表在 ACP 面可用（`session/list`，字段只有 `{sessionId,cwd,title,updatedAt}`）；删除在 HTTP 面 `DELETE /session/{sessionID}` |
| 5 | reasoning 收起 | 纯界面活（折叠必须是真折叠） |
| 6 | 输入框点一下出现方框 | 保留焦点可见性（可访问性硬线），改成非方框：左侧色条 + caret |
| 7 | markdown 原样显示 | 需要一个**最小安全渲染器**（只建 DOM 节点，绝不注入 HTML/脚本） |
| 8 | 顶部走表数字太大 | 缩锚点字号（契约里"每屏一个超大锚点"被主人判过头，视觉是可重构项） |
| 9 | **对话区像 Word 文档** | 重做流式渲染：回合分组 / 说话人 / 间距 / 工具行内嵌 / 时间 |
| 10 | 审批界面 | 事件已能收到（`session/request_permission`，三档 `allow_once/allow_always/reject_once`）；**要把选项渲染成按钮并回包**（回包形状已实测：`{outcome:{outcome:"selected",optionId}}`）；注意**默认配置下引擎不会来问**（`permission.*="ask"` 才会） |

### 1 与 2 的推荐做法（已探清，未实施）

桥（`app/plugins/engine-bridge.ts`）**再起一个 `opencode serve`** 并加一个**通用 HTTP 透传端点**
（壳仍只搬字节；端点知识写在 `app/` 里，例如 `app/src/engine/engine-http.ts`）。
然后：HALT → `POST /session/{id}/abort`；删除 → `DELETE /session/{sessionID}`；列表可先用 ACP 的 `session/list`。
**注意**：`abort` 只能中断**同一个 serve 进程里跑着的**会话；若 ACP 与 serve 是两个进程，中断可能需要
"kill + `session/load`"这条退路（该退路已实测可用）。

## 三、规矩（含**上一次是怎么翻车的**）

1. **"已知未做/只做了一半"必须与"已完成"并列出现在汇报里。** 上一个 agent 把三个死按键写成 `<div>`
   ——结构上落在我自己闸的扫描范围之外——然后拿"5/5 控件接线、无悬空控件"当交付证据。
   **不计数就是隐藏**，位置（注释/tooltip）不改变这一点。
2. **元素清单制**：`app/ui-manifest.json` 里每个能被看见/被点到的元素都必须表态（`wired` 或 `static: 理由`）。
   没分类 / 清单陈旧 / 声称 wired 但代码里没引用 → 构建失败。**这个机制保证"存在必须被表态"，不保证"有用"——
   有用只有主人的手能判。**
3. **不许声称看过渲染。** 无头浏览器禁用（2026-09-23 有一次**一次性授权，只用于读某个网页**，不得挪用）。
   交付界面 = 可双击/可打开的路径 + 3–5 条"看什么"，等主人的眼睛。
4. **别在别人的工作树上用整文件回滚。** 上一个 agent 在 `NIX\t3rra-core`（工作树本来就脏：18 个未提交文件）
   执行 `git checkout -- plugins/omp-bridge.ts`，**连带退掉别人 338 字节未提交改动且无法恢复**。要回滚自己的改动，
   先看 `git status` 的字节数，或者 `git stash` / 复制备份。
5. **补丁写成文件再跑**（`node patch.mjs`，锚点命中数必须为 1，否则整体失败）。
   内联 `node -e` + PowerShell 引号已经把文件改坏过三次，其中一次是静默半应用。
6. **测 SSE 用 `node:http`，不要用 `fetch()` 的 body reader**：undici 会把长连接压住，
   伪造出"引擎沉默"的假象（这个坑吃掉过半小时，还让主人以为应用没跑起来）。
7. **探针不进产物**：`spike/` 只写 `traces/`，`app/` 永不 import `spike/`。
8. **旧仓 `NIX\t3rra-core` 只读**（规则出处 + 负面参照）；改它之前先问主人。

## 四、证据地图

| 想确认什么 | 看哪里 |
| --- | --- |
| 引擎面能做什么、缺什么 | [`adapters/opencode-acp.md`](./adapters/opencode-acp.md)（每条标【实测】/【文档】/【未验】） |
| 报文原件 | `traces/opencode/*.jsonl`（握手 / 回放 / 时序 / 一次真 prompt / cancel 探针） |
| 引擎 HTTP 面形状 | `traces/opencode/openapi-1.17.18.json`（162 paths，本机 `opencode serve` 导出） |
| 引擎配置形状（含 `permission`） | `traces/opencode/opencode-config.schema.json`（官方 schema） |
| 探针怎么用 | `spike/probe-app-pipeline.mjs`（走应用自己的桥）、`probe-config-option.mjs`、`probe-sse-http.mjs`、`probe-session-cancel.mjs` |
| 界面标准与自由边界 | [`visual-guide.md`](./visual-guide.md)（硬约束四条 + 视觉可重构） |
| 主人的验收账 | [`status.md`](./status.md) |

## 五、我留下的、需要你知道的两处"文档与现实的差"

- `docs/visual-guide.md` §3 把"每屏一个超大锚点"写成方向；**主人 2026-09-23 明确说锚点太大**。
  这条已进验收清单（#8），改的时候以主人的判断为准，别拿指南当挡箭牌。
- 样张 `tmp/demo/ark-console-v2.html`（不在仓库）里有产品**故意没有**的东西（状态条、步骤带、坐标数字）。
  那些是样张 chrome，不要照搬；照搬就等于造悬空控件。

## 六、交接自检

```
npm run check:all     # 六道闸；红了不许提交
```

**能自证的**：类型、单测、元素清单、字体引用、文档互链、文档声称 vs 报文。
**不能自证的**：一切观感与可用性——**那部分只有仓库主人的眼睛**，交付时必须给他"看什么"。
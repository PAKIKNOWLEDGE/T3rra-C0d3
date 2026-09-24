# 交接说明

面向接手本仓库的开发者或代理。阅读顺序：本文件 → [`status.md`](./status.md)（现行真相）→ [`../AGENTS.md`](../AGENTS.md)（结构与通用规矩）。

## 一、如何运行

```
npm install                                  # 首次
npm run dev                                   # → http://localhost:5191/（默认引擎 opencode）
# 需要强制指定时：
$env:T3RRA_ENGINE="opencode"; npm run dev     # 或 T3RRA_ENGINE="omp"
npm run check:all                            # 六道闸，提交前须全绿
```

引擎解析顺序：`T3RRA_ENGINE_BIN` → `T3RRA_OMP_BIN` → **默认 opencode 优先** → 已知安装位置  
（`app/src/engine/resolve.ts`，不写死主机路径）。`T3RRA_ENGINE=omp` 可退回 omp。  
本机实测引擎：**opencode 1.18.32**（`%APPDATA%\npm\node_modules\opencode-ai\bin\opencode.exe`）。

## 二、完成度（三分，勿合并）

### 已完成（有实测或测试）

- **引擎链路**：ACP stdio 握手 → `session/new` → `session/prompt` 流式 → `stopReason`。证据：`traces/opencode/*.jsonl`、`spike/probe-app-pipeline.mjs`。
- **选项**：`configOptions` 只渲染运行时清单；`session/set_config_option` 响应带回完整选项表（`app/src/engine/responses.ts` 有测试）；`mode` 为坞内成对按钮，`model`/`effort` 为右栏下拉——按 `category` 判定，无 id 白名单。
- **会话恢复能力**：`session/load` 以普通 `session/update` 回放历史，**先流完、响应后到**（规范行为）。证据：`traces/opencode/*-load-redacted.jsonl`、`*-sequencing-redacted.jsonl`（含 `load_timing`）。  
  **界面 LOAD 已接**（会话列表按钮，见 #2）。
- **静默判据（规则 7–9）**：`app/src/view/cadence.ts` + `test/cadence.test.ts`（10 例）。基线 = 当前相位间隔中位数、`×8/×25`、样本 &lt;3 拒绝给判据、10 分钟硬上限仅兜底、非运行期间丢弃、换 model 丢样本。界面：大锚点=静默秒数、`[ SIGNAL ]` 面板。
- **六道闸 + 清单制**：`tsc` · vitest 49 条 · `check:app`（`app/ui-manifest.json` + 字体 38/38 + 渲染层 id）· `check:demo` · `check:traces` · `check:docs`。
- **EVENTS 视图**（`+秒数 / kind / 事实描述`）与 **NEW**（`session/new`，id 变更才清空）。
- **对话区（验收 #5–#9）**：回合分组、工具行按到达序内嵌、时间戳、安全 markdown、reasoning 真折叠、输入焦点左侧色条、锚点缩号。见 `derive.ts` 统一流、`ui/turns.ts`、`ui/markdown.ts`。  
  **主人目视 2026-09-23「通过」**。舞台标题只取指令首行截断（曾整段进 `h1` 撑爆，已修）。
- **会话列表 + 删除（验收 #2，已实现待目视）**：右栏 `[ SESSIONS ]`；列表/加载走 ACP，删除走桥 `/http` → `opencode serve`。测试 `test/sessions.test.ts`。  
  **状态机**：打开页面**不**自动 `session/new`；首条指令排队创建；删当前会话不再自动再开。BUILD/PLAN 点击乐观切换。  
  **删除落盘**【部分实测】：引擎数据在 `%USERPROFILE%\.local\share\opencode\`（`opencode.db` + `storage/session_diff/ses_*.json`）。HTTP DELETE 后列表应消失；**session_diff 是否清掉【未验】**——本机曾堆大量空 diff（与自动建会话有关）。

### 半完成

- **视觉第 2 代已接入 `app/`**；对话区已过，#2 面板待主人目视。
- **`RESTART ⟲`**：真动作（杀进程重开），但是**粗中断**。重开后可用会话列表 LOAD 回放。

### 未完成（验收清单 11 条中的 2 条）

完整表见 [`status.md`](./status.md)「仓库主人验收清单」。摘要：

| # | 事项 | 卡点 / 做法 |
| --- | --- | --- |
| 1 | **中断 HALT** | ACP `session/cancel` 不存在（实测 `-32601`）。HTTP `POST /session/{sessionID}/abort` → 桥 `/http` 已具备 |
| 10 | 审批界面 | 事件可收；选项渲成按钮并回包（形状已实测）。默认配置下引擎不问（须 `permission.*="ask"`） |

### 开放项（未排期）

- **网页粘贴图片**：opencode CLI 支持；本网页 UI 未做。ACP `promptCapabilities.image: true` 已实测有。**是否必须 Tauri 未验**——浏览器 paste/File 或许够用，先记开放，不进 P0。

### #1 推荐做法（通道已就绪）

桥已有通用 HTTP 透传（`POST /__t3/http` + 懒起 `opencode serve`）。HALT → 在 `app/src/engine/engine-http.ts` 加 `POST /session/{id}/abort` 即可。  
**注意**：`abort` 只能中断**同一 serve 进程**内的会话；若与 ACP 分进程，可能需要「kill + `session/load`」退路（已实测可用）。

## 三、规矩

1. **「已知未做 / 只做了一半」必须与「已完成」并列出现在汇报中。**  
   历史问题：死按键写成 `<div>`（落在 `button/select/input` 扫描之外），随后以「5/5 接线、无悬空控件」作为交付证据。**未计入汇报 = 隐藏**；写在注释或 tooltip 里不改变这一点。
2. **元素清单制**：`app/ui-manifest.json` 中每个可见/可点元素必须表态（`wired` 或 `static: 理由`）。缺分类 / 清单陈旧 / 声称 wired 但代码无引用 → 构建失败。  
   保证「存在必须被表态」，不保证「有用」——有用与否由仓库主人判断。
3. **不得声称看过渲染。** 无头浏览器禁用（曾有一次性授权用于只读网页，不可挪用）。  
   交付界面 = 可打开路径 + 3–5 条「看什么」，等主人目视。
4. **勿在他人工作树整文件回滚。** 旧仓曾因 `git checkout -- plugins/omp-bridge.ts` 覆盖他人 338 字节未提交改动且无法恢复。回滚自己改动前先 `git status` / `git stash` / 备份。
5. **补丁写成文件再跑**（`node patch.mjs`，锚点命中数须为 1，否则失败）。  
   内联 `node -e` + PowerShell 引号已多次静默改坏文件。
6. **测 SSE 用 `node:http`，不要用 `fetch()` body reader**：undici 会压住长连接，伪造「引擎沉默」。
7. **探针不进产物**：`spike/` 只写 `traces/`；`app/` 永不 import `spike/`。
8. **旧仓 `NIX\t3rra-core` 只读**（规则出处 + 负面参照）；改前问仓库主人。

## 四、证据地图

| 要确认什么 | 位置 |
| --- | --- |
| 引擎能做什么、缺什么 | [`adapters/opencode-acp.md`](./adapters/opencode-acp.md)（【实测】/【文档】/【未验】） |
| 报文原件 | `traces/opencode/*.jsonl` |
| 引擎 HTTP 面 | `traces/opencode/openapi-1.17.18.json`（162 paths） |
| 引擎配置（含 permission） | `traces/opencode/opencode-config.schema.json` |
| 探针用法 | `spike/probe-app-pipeline.mjs`、`probe-config-option.mjs`、`probe-sse-http.mjs`、`probe-session-cancel.mjs` |
| 界面标准与可改边界 | [`visual-guide.md`](./visual-guide.md) |
| 主人验收账 | [`status.md`](./status.md) |

## 五、文档与现实的两处差（接手时注意）

- `docs/visual-guide.md` 若仍把「静默判据未实现」写成待办，以 **`status.md` + `cadence.ts` 为准**（已实现）。改视觉时以主人判断为准（锚点字号见验收 #8），勿拿指南当挡箭牌。
- 样张 `tmp/demo/ark-console-v2.html`（不在仓库）含状态条、步骤带、坐标数字等**产品故意没有**的元素；照搬即等于造悬空控件。对照表见 `status.md`「视觉第 2 代」。

## 六、交接自检

```
npm run check:all     # 六道闸；红了不许提交
```

**能自证的**：类型、单测、元素清单、字体引用、文档互链、文档声称 vs 报文。  
**不能自证的**：一切观感与可用性——交付时必须给仓库主人「看什么」。

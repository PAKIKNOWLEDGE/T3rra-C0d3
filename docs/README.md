# docs/

入口是 [`../AGENTS.md`](../AGENTS.md) §六，那里说明了每份文档管什么、什么时候读。本页只放索引和证据分级。

## 现行

| 文件 | 性质 |
| --- | --- |
| [`status.md`](./status.md) | 现状（唯一） |
| [`design.md`](./design.md) | 视觉权威（唯一） |
| [`rules.md`](./rules.md) | 产品规则 1–25 与七道闸 |

## 证据（带日期；与 `status.md` 冲突时以 `status.md` 的现状为准，证据本身不改）

| 文件 | 内容 |
| --- | --- |
| [`engine-contract-audit.md`](./engine-contract-audit.md) | 2026-09-24 四路源码审计，F1–F21 |
| [`adapters/opencode-acp.md`](./adapters/opencode-acp.md) | ACP 实测映射（路径被 `check:traces` 硬编码，不要移动） |
| [`capability-map.md`](./capability-map.md) | 能力全图 |
| [`backends/omp.md`](./backends/omp.md) · [`backends/opencode.md`](./backends/opencode.md) · [`backends/dsh.md`](./backends/dsh.md) | 2026-09-21 三个候选后端的调研 |

## 归档

[`archive/`](./archive/) 里的文件都已被取代，每份顶部都写了被谁取代。`archive/demo/` 是被否定的旧范本 `ark-console`。

## 证据分级

每条结论都标来源。未验证的写未验证：

| 记号 | 含义 |
| --- | --- |
| **【实测】** | 本机跑过，或能在本地 checkout 上复现 |
| **【源码】** | 在本地 checkout 源码里读到，没有执行 |
| **【文档】** | 上游官方文档、发布说明或仓库首页 |
| **【未验】** | 推断，没有证据；写出来是为了便于证伪 |

**版本号会过时。** 本机 opencode 为 1.18.32（2026-09-23）。重新决策前要重跑验证，不要直接引用文档里的数字。

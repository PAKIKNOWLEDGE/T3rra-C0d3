# 候选后端 A — omp（`oh-my-pi`）

**身份**：`github.com/can1357/oh-my-pi`，本机 checkout `C:\DEV\develop\NIX\oh-my-pi`。  
t3rra-core 曾用引擎。本机版本 `18.2.6`。【实测】

**接入面**：`omp acp` —— ACP over stdio，protocolVersion **1**。  
ACP 适配器曾在 t3rra-core 跑通真机往返与会话恢复。【实测】

---

## 图片：`blob-broker` 子系统

`packages/coding-agent/src/blob-broker/` 为一等子系统，含 **`imageUrls` exposure**：把图片**发布成 URL** 再用 URL 引用（省 token/带宽），而非内联 base64。

【源码】目录内 23 个文件，包括：

```
broker.ts  context-images.ts  daemon.ts  destinations.ts  exposure.ts
publication.ts  savings.ts  server.ts  service.ts  store.ts
stream-fallback.ts  uploader-runtime.ts
uploaders-anonymous.ts  uploaders-cloud-drives.ts  uploaders-discord.ts
uploaders-image-hosts.ts  uploaders-legacy.ts  uploaders-object-storage.ts
uploaders-self-hosted.ts  uploaders.ts
provider-files-{anthropic,gemini,openai}.ts  provider-file-types.ts
```

### 内置目标

| 类别 | 目标 |
| --- | --- |
| 匿名图床 | `catbox`、`litterbox`、`0x0`、`uguu`、`tmpfiles`、`pomf` |
| 商业图床 | `imgur`、`imageshack`、`flickr`、`photobucket`、`chevereto`、`vgy.me`、`ShareX` |
| 云盘 / 对象存储 | `dropbox`、`onedrive`、object-storage |
| 传输 | `ftp` / `ftps` / `sftp`、self-hosted、legacy（含 `transfer.sh`） |
| Provider 文件 API | Anthropic / OpenAI / Gemini 各自 file client |

匿名与自建组在 `blob-uploaders-anonymous.test.ts`、`blob-uploaders-self-hosted-legacy.test.ts` 中有断言。【源码】

### 隧道（`exposure.ts`）

可将本地 blob server 暴露为公网 URL：`cloudflared`、`localhost.run`、`pinggy`、`ngrok` 等；bind 可为 loopback 或 `0.0.0.0`。  
`server.ts` 含 render callback（`http://127.0.0.1:${body.callbackPort}${RENDER_CALLBACK_PATH}…`，带 `RENDER_CALLBACK_TOKEN_HEADER`）。【源码】

### 配套 CLI

`omp images <status|doctor|probe|purge>`（`images-cli.ts`），另有 `BlobBrokerSavingsStatus` 与 savings journal——**它在统计「省了多少」**。【源码】

### 结论与保留

- **图片会离开本机去第三方**（若目标为图床/云盘/隧道）。有意取舍，不是 bug。
- 可配置 self-hosted / `127.0.0.1` / 纯 provider file API，理论上可不出本机；但是完整发布管线，不是想长期维护的地方。
- **【未验】** 默认是否启用。`cli.ts` 为 `startBlobBrokerFromEnvironment()`（环境变量驱动）；未验 `resolveBlobBrokerConfigs` 默认分支。

### 终端内联渲染（另一套，勿混）

TUI 另有原生图片协议：`kitty-graphics.ts`、`sixel.ts`、`deccara.ts`、`terminal-capabilities.ts`；`image.ts` 有 `DEFAULT_MAX_INLINE_IMAGES = 8` 预算。降级文案 `[Image: <mime> <WxH>]`。  
**这是「终端里怎么画图」，与「把图发布成 URL」是两回事。**【源码】

---

## 规模：fork 要承接什么

【实测】本地 checkout（排除 `node_modules`）：

| | 文件数 | 行数 |
| --- | --- | --- |
| TS / TSX（`packages/`） | **5084** | **1,464,198** |
| Rust（`crates/`） | **466** | **239,647** |

构建：Bazel + Cargo + bun + Python 混装（`MODULE.bazel.lock` ≈ 4 MB，`THIRD-PARTY-NOTICES.txt` ≈ 1 MB）。

## 变更节奏

`git log` 顶部为密集 `fix` / `perf` / `bump`，一天内多条。**无稳定发布节奏。**【实测/源码】

## License

根目录有 `LICENSE`（约 1.1 KB），**类型未核**。【未验】

## 对选型的影响

即便不换引擎，omp 的 ACP 面也窄（见 [`current-state.md`](../current-state.md) §6）：`permissions = false`、approval 死、plan 从不出现。  
「runtime 没告诉界面的，界面不许知道」在 omp 上会变成产品天花板。

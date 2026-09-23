# 候选后端 A — omp（`oh-my-pi`）

**身份**：`github.com/can1357/oh-my-pi`，本机 checkout 在 `C:\DEV\develop\NIX\oh-my-pi`。
t3rra-core 现在的引擎。本机版本 `18.2.6`。【实测】

**接入面**：`omp acp` —— ACP over stdio，protocolVersion **1**。
ACP 适配器已在 t3rra-core 落地并跑通真机往返 + 会话恢复。【实测】

---

## 图片：`blob-broker` —— 你说的不是错觉

`packages/coding-agent/src/blob-broker/` 是一等子系统，**其中一条就叫 `imageUrls` exposure**。
它的工作是把图片**发布成 URL**，再用 URL 引用（省 token / 省带宽），而不是内联 base64。

【源码】目录内共 23 个文件，包括：

```
broker.ts  context-images.ts  daemon.ts  destinations.ts  exposure.ts
publication.ts  savings.ts  server.ts  service.ts  store.ts
stream-fallback.ts  uploader-runtime.ts
uploaders-anonymous.ts  uploaders-cloud-drives.ts  uploaders-discord.ts
uploaders-image-hosts.ts  uploaders-legacy.ts  uploaders-object-storage.ts
uploaders-self-hosted.ts  uploaders.ts
provider-files-{anthropic,gemini,openai}.ts  provider-file-types.ts
```

### 内置的目标（`destinations.ts` / uploaders）

| 类别 | 目标 |
| --- | --- |
| **匿名图床** | `catbox`、`litterbox`、`0x0`、`uguu`、`tmpfiles`、`pomf` |
| **商业图床** | `imgur`、`imageshack`、`flickr`、`photobucket`、`chevereto`、`vgy.me`、`ShareX`（含 delegated file uploader） |
| **云盘 / 对象存储** | `dropbox`、`onedrive`、object-storage |
| **传输** | `ftp` / `ftps` / `sftp`、self-hosted、legacy（含 `transfer.sh`） |
| **转发到 provider 文件 API** | Anthropic / OpenAI / Gemini 各自的 file client |

匿名与自建那两组，在 `packages/coding-agent/test/blob-uploaders-anonymous.test.ts`
与 `blob-uploaders-self-hosted-legacy.test.ts` 里被逐条断言。【源码】

### 还带隧道（`exposure.ts`）

`exposure.ts` 可以把**本地** blob server 通过隧道暴露成公网 URL：
`cloudflared`、`localhost.run`、`pinggy`、`ngrok` 等；bind host 是 loopback 或 `0.0.0.0`。
`server.ts` 里还有一条 render callback：
`http://127.0.0.1:${body.callbackPort}${RENDER_CALLBACK_PATH}${encodeURIComponent(body.key)}`，
带 `RENDER_CALLBACK_TOKEN_HEADER` 令牌。【源码】

### 配套 CLI

`omp images <status|doctor|probe|purge>`（`packages/coding-agent/src/cli/images-cli.ts`），
外加 `BlobBrokerSavingsStatus` 与 savings journal——**它在统计"省了多少"**。【源码】

### 结论与保留

- **图片会离开你的机器去第三方**（若目标选了图床/云盘/隧道）。这是有意的工程取舍，不是 bug。
- 它是**可配置的**：有 self-hosted / 本地 `127.0.0.1` / 纯 provider file API 的路径，
  理论上能压成"不出本机"。但这是一整套为了省 token 的发布管线，不是你想长期介入的地方。
- **【未验】** 默认是否启用。`cli.ts` 里是 `startBlobBrokerFromEnvironment()`
  （环境变量驱动），我**没有**验证默认值。要坐实"装完默认就传"需要跑一次或读
  `resolveBlobBrokerConfigs` 的默认分支。

### 旁边还有一套终端内联渲染（不等于上面那套）

omp 的 TUI 自己支持原生图片协议：`packages/tui/src/kitty-graphics.ts`、
`src/render/sixel.ts`、`src/deccara.ts`、`src/terminal-capabilities.ts`；
`src/components/image.ts` 里有 `DEFAULT_MAX_INLINE_IMAGES = 8` 的预算与
`SurfaceSplit` 的 live/text 降级。降级文案是 `[Image: <mime> <WxH>]`（`imageFallback`）。
**这是"终端里怎么画图"，和上面"把图发布成 URL"是两回事**，别把两者混为一谈。【源码】

---

## 规模：fork 它要承接什么

【实测】对本地 checkout 统计（排除 `node_modules`）：

| | 文件数 | 行数 |
| --- | --- | --- |
| TS / TSX（`packages/`） | **5084** | **1,464,198** |
| Rust（`crates/`） | **466** | **239,647** |

构建系统是 **Bazel + Cargo + bun + Python 混装**（`MODULE.bazel.lock` 约 4 MB，
`THIRD-PARTY-NOTICES.txt` 约 1 MB）。TUI 一个包就有 100+ 主题、60+ overlay。

## 变更节奏

`git log` 顶部是密集的 `fix(...)` / `perf(...)` / `chore: bump version`，
一天内多条、含 `Merge pull request`。**没有稳定的发布节奏可言。**【实测/源码】

## License

仓库根有 `LICENSE`（约 1.1 KB），**类型未核**。【未验】

## 对 t3rra-core 的实际影响

即便不换引擎，omp 的 ACP 面也很窄（见 [`current-state.md`](../current-state.md) §6）：
`permissions = false`、`approval` 裁决是死的、`plan` 从不出现。
**"runtime 没告诉我们的，界面不许知道"这条规矩，在这里会变成产品天花板。**

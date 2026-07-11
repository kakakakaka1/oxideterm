<h1 align="center">⚡ OxideTerm — Native</h1>

<p align="center">
  <strong>面向远程服务器、带 AI 能力的原生运维工作区 —— 纯 Rust 原生应用</strong>
  <br>
  SSH、Telnet、串口、RDP/VNC、SFTP、端口转发、Raw TCP/UDP 和轻量编辑，集中在一个原生工作区。
  <br>
  GPU 直接渲染。免费，无需注册。
  <br>
  <strong>不捆绑 WebView。不采集遥测。无需订阅。BYOK 优先。纯 Rust SSH，不依赖 OpenSSL/libssh2。</strong>
</p>


<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0--gpui--preview.16-blue" alt="版本">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="平台">
  <img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="许可证">
  <img src="https://img.shields.io/badge/rust-2024%20edition-orange" alt="Rust 2024">
  <img src="https://img.shields.io/badge/ui-GPUI-green" alt="GPUI">
</p>

<p align="center">
  <sub><a href="https://github.com/AnalyseDeCircuit/oxideterm">OxideTerm</a> 的下一代原生版本 —— GPU 渲染、零 WebView，使用 <a href="https://github.com/zed-industries/zed/tree/main/crates/gpui">GPUI</a>（Zed 的渲染框架）</sub>
</p>

<p align="center">
  <a href="../../README.md">English</a> | <a href="README.zh-Hans.md">简体中文</a> | <a href="README.zh-Hant.md">繁體中文</a> | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a> | <a href="README.fr.md">Français</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../docs/media/oxideterm-native-hero.png" alt="OxideTerm Native 功能概览" width="920">
</p>

<div align="center">

<a href="../../docs/media/ai-terminal-demo.mp4">
  <img src="../../docs/media/ai-terminal-demo.gif" alt="OxideSens 在 OxideTerm 中打开终端" width="920">
</a>

*观看 OxideSens 按照用户请求在 OxideTerm 中打开一个终端。*

</div>

---

## OxideTerm Native 是什么

OxideTerm Native 是一个**纯 Rust GPUI 桌面应用**——面向 SSH、文件、端口转发、Raw TCP/UDP 和远程桌面工作流的开源运维工作区。

**你可以做什么：**

- 在一个原生工作区里管理 SSH、Telnet、串口、RDP/VNC、SFTP、端口转发、Raw TCP/UDP、本地 Shell 和轻量编辑
- 通过宽限期重连，让远程工作更能扛住网络抖动
- 让 OxideSens AI 通过你自己的 AI 提供商检查实时会话，并执行经过批准的工作区操作

它**不是**托管云端 Agent 平台，也不是 Electron、Tauri 或网页终端：没有 Chromium、WebView、JavaScript 或 CSS。

---

## 为什么选择 Native？

| 如果你在意... | OxideTerm Native 提供... |
|---|---|
| 一个远程节点，多种工具 | 终端、SFTP、端口转发、RDP/VNC、Raw TCP/UDP、trzsz、原生 IDE、监控和 OxideSens AI 都挂在同一个工作区上 |
| 零 WebView 原生外壳 | GPUI 直接在 GPU 表面绘制桌面界面 — 没有 DOM、CSS、JavaScript、Chromium 或 WebKit 运行时 |
| 本地优先运维工作流 | SSH、Telnet、SFTP、端口转发、RDP/VNC、Raw TCP/UDP、本地 Shell、串口终端和配置管理都无需注册 |
| BYOK OxideSens AI，而不是平台点数 | OxideSens 使用你自己的 OpenAI/Anthropic/Gemini/Ollama/OpenAI 兼容端点，支持 MCP、RAG 和经过批准的工作区操作 |
| 重连稳定性 | 宽限期会先探测旧连接 30 秒再替换它，短暂网络中断时 TUI 应用仍有机会存活 |
| 纯 Rust SSH 与凭证安全 | SSH 栈使用 `russh` + `ring`，不依赖 OpenSSL/libssh2；已存储凭证使用系统钥匙串，`.oxide` 使用 ChaCha20-Poly1305 + Argon2id |

---

## 截图

原生界面遵循当前 Tauri 版本相同的 OxideTerm 工作区模型与视觉语言。

<table>
<tr>
<td align="center"><strong>SSH 终端 + OxideSens AI</strong><br/><br/><img src="../../docs/screenshots/terminal/SSHTERMINAL.png" alt="带 OxideSens AI 的 SSH 终端" /></td>
<td align="center"><strong>SFTP 文件管理器</strong><br/><br/><img src="../../docs/screenshots/sftp/sftp.png" alt="SFTP 双窗格文件管理器与传输队列" /></td>
</tr>
<tr>
<td align="center"><strong>内置 IDE</strong><br/><br/><img src="../../docs/screenshots/miniIDE/miniide.png" alt="内置 IDE 模式" /></td>
<td align="center"><strong>智能端口转发</strong><br/><br/><img src="../../docs/screenshots/PORTFORWARD/PORTFORWARD.png" alt="带自动检测的智能端口转发" /></td>
</tr>
</table>

---

## 与 WebView 版本的区别

| 方面 | WebView/Tauri | Native |
|---|---|---|
| 渲染 | Chromium/Safari/WebKit2GTK + CSS | GPUI GPU 表面，即时模式，纯 Rust |
| 终端数据流 | WebSocket → JS 事件循环 → xterm.js | Rust 输入 → `TerminalState` → GPUI 渲染 |
| IPC 开销 | 每次命令都要 JSON-RPC | 进程内函数调用 |
| SSH keepalive | JavaScript 定时器 | Rust async task |
| 插件运行时 | 浏览器沙箱中的 ESM | wasmtime WASM + 类型化 Rust 宿主 API |
| CLI | 依赖桌面应用运行 | 独立二进制，直接链接 crate |
| 运行时边界 | 浏览器运行时 + WebView 桥接 | 原生进程；不捆绑浏览器运行时 |

## 功能概览

| 分类 | 功能 |
|---|---|
| 终端 | 本地 PTY、SSH、Telnet、Raw TCP/UDP 终端、本地串口终端、分屏、shell integration、命令标记、asciicast 录制/回放、trzsz、Sixel/Kitty 图形、渲染策略 |
| SSH 与认证 | 连接池、无限 ProxyJump、Grace Period 重连、Host-key TOFU、SSH Agent 转发、密码/密钥/证书/键盘交互认证 |
| SFTP / IDE | 双栏浏览器、传输队列、预览、书签、原子写入、远程文件树、多标签编辑、冲突处理 |
| 转发 | Local、Remote、Dynamic SOCKS5，保存规则，重连恢复，死亡报告，空闲超时 |
| 远程桌面 | 内置 RDP 与 VNC 标签页，支持重连控制、视口尺寸适配、键盘、鼠标、剪贴板和光标基础能力 |
| Raw TCP/UDP | Raw TCP 与 Raw UDP 终端，用于临时服务、设备协议和数据报调试 |
| AI | OxideSens 支持 OpenAI、Anthropic、Gemini、Ollama/兼容端点、MCP、RAG、命令审批 |
| 云同步与 `.oxide` | push/pull/apply/resolve，S3/WebDAV/Git，回滚备份；加密导入导出连接、转发、设置、快捷命令和插件设置 |
| 插件与 CLI | WASM 沙箱、原生宿主 API、插件设置；CLI 含 settings、connections、forwards、quick-commands、plugins、secrets、cloud-sync、backup、report 等命令 |

## 内部实现

OxideTerm Native 移除了 WebView 桥接，并把终端、SSH、Telnet、RDP、VNC、Raw TCP/UDP、SFTP、转发、IDE、AI、插件和 CLI 保持在一套 Rust 原生架构中。完整实现细节保留在下方，方便需要工程细节的读者展开查看。

<details>
<summary><strong>架构、SSH 内部、GPUI 外壳、重连、AI、插件与更多细节</strong></summary>
<br>

### 核心进程内直连，无 WebView 桥接

```text
GPUI 渲染循环
  WorkspaceApp / 标签页界面 / GPUI 视图
        │ 进程内 Arc<> / async
领域 Crate
  NodeRouter → SshConnectionRegistry
  TerminalState ← SSH PTY channel
  SftpSession / ForwardManager / IdeWorkspace
  AiProvider / CloudSyncService / PluginHost
```

界面与 SSH/终端后端之间没有序列化边界。终端字节直接修改 `TerminalState`，GPUI 读取状态并发出 GPU 绘制命令。

### 纯 Rust SSH — russh (ring)

原生版本把与 Tauri 版本同源的 `russh` 栈直接链接进桌面应用二进制：

- **SSH 栈不依赖 OpenSSL/libssh2**：SSH 密码学能力由 `ring` 提供
- 完整 SSH2：密钥交换、channel、SFTP 子系统和端口转发
- ChaCha20-Poly1305 / AES-GCM、Ed25519/RSA/ECDSA 密钥
- SSH Agent：Unix `SSH_AUTH_SOCK` 与 Windows `\\.\pipe\openssh-ssh-agent`
- 多跳 ProxyJump，每一跳独立认证

### Grace Period 智能重连

重连语义与 Tauri 版本保持一致，但 orchestration 全部在 Rust async 任务内完成：

1. 通过 SSH keepalive 检测连接超时，没有 JavaScript timer throttle
2. 快照终端 pane、SFTP 传输、端口转发和 IDE 文件状态
3. **Grace Period**：先探测旧连接 30 秒，网络切换时 TUI 应用有机会原地存活
4. 旧连接无法恢复时，新 SSH 连接会恢复转发、续传并重新打开 IDE 文件

Pipeline: `queued → snapshot → grace-period → ssh-connect → await-terminal → restore-forwards → resume-transfers → restore-ide → verify → done`

### SSH 连接池与节点路由

`SshConnectionRegistry` 使用 `DashMap` 管理连接，沿用 Tauri 的 node-first 架构，但没有 WebSocket 生命周期桥接：

- 一个物理 SSH 连接可被 terminal、SFTP、port forward 和 IDE 同时消费
- 每条连接都有 `connecting → active → idle → link_down → reconnecting` 状态机
- UI 只按 `nodeId` 操作，`NodeRouter` 原子解析到底层 `connectionId`
- `NodeRuntimeStore` 将节点拓扑快照持久化到 `session_tree.json`
- 跳板机失效会级联标记下游节点为 `link_down`

### OxideSens AI

OxideSens 仍然是 BYOK 优先，原生版本把上下文构建放在进程内完成：

- 提供商：OpenAI、Anthropic、Gemini、Ollama 或任意 OpenAI 兼容端点
- MCP：stdio 与 SSE 传输，支持工具发现与调用
- RAG：BM25 全文检索、HNSW 向量索引、RRF 融合与 CJK 双字词分词器
- 发往提供商的消息会过滤凭证模式；工作区上下文与操作仍由用户控制
- API 密钥存入系统钥匙串，并明确排除在结构化日志和桌面核心消息负载之外

### GPUI 桌面外壳

整个 UI 使用 GPUI 直接绘制，没有 DOM/CSS/JavaScript 渲染管线：

- 工作区标签类型：本地终端、SSH、Telnet、串口、RDP、VNC、Raw TCP/UDP、SFTP、IDE、Forwards、Settings、Plugin、Topology 等
- 二叉窗格树与可拖拽分隔条，每个终端标签最多 4 个窗格
- 命令面板、全局快捷键和侧边栏都使用 GPUI primitive
- 即时模式渲染直接响应 Rust 状态变化，无需序列化往返

### 终端状态与渲染

终端渲染先建模为 Rust 状态，再由 GPUI 绘制：

- PTY 输出进入 `TerminalState`；scrollback、光标、选择区、marks 和搜索状态都保留在 Rust 中
- 渲染策略可在 Boost、Normal、Idle 之间切换，不需要等待浏览器事件循环配合
- Sixel 与 Kitty graphics 作为终端持有的资源跟踪，而不是 DOM node 或 canvas overlay
- 分屏窗格共享同一套工作区状态，标签恢复与重连可以一起快照终端拓扑

### SFTP 与 IDE 工作区

远程文件属于同一个 node 工作区，而不是割裂的附属功能：

- SFTP session 通过 `NodeRouter` 解析，重连替换底层 SSH 连接时 UI 的 node address 不变
- 传输队列独立跟踪方向、进度、重试状态和限速，不依赖当前可见文件 pane
- IDE 标签页同时保存未保存缓冲区、远程路径、冲突状态和恢复元数据
- 后端支持时，远程写入走 staged/atomic 行为，减少普通编辑流程里的半写入文件

### 插件、CLI 与诊断

原生分支把扩展和支持功能保持在 Rust 原生边界内：

- 插件运行在 wasmtime 沙箱中，使用类型化宿主能力，而不是浏览器全局对象
- CLI 直接链接领域 crate，覆盖 doctor、settings、connections、forwards、便携包、备份和报告
- 诊断优先输出计数、路径、功能标志与脱敏提示，避免暴露带秘密的原始 payload
- 会修改状态的 CLI 流程使用 dry-run 计划、`--yes` guards 和回滚备份

### 端口转发 — 无锁 I/O

端口转发语义与 Tauri 相同，但独立为 Rust crate：

- Local `-L`、Remote `-R`、Dynamic SOCKS5 `-D`
- SSH Channel 由单一 `ssh_io` task 持有，避免 `Arc<Mutex<Channel>>`
- 支持重连自动恢复、死亡上报和空闲超时

### trzsz 内联文件传输

trzsz 继续走终端数据流，不需要额外端口或远端 agent：

- 上传/下载复用已有 terminal stream
- 可穿透 ProxyJump 链路
- 原生文件选择器不受浏览器内存限制
- 支持双向传输、目录传输和可配置限制

### `.oxide` 加密导出

加密格式与 Tauri 版本保持一致：

- **ChaCha20-Poly1305 AEAD** 认证加密
- **Argon2id KDF**：256 MB memory cost、4 iterations，提升 GPU 暴力破解成本
- 覆盖 connections、forwards、settings、快捷命令、插件设置和便携密钥

</details>

---

## 从源码运行

```sh
cargo run
OXIDETERM_RENDER_PROFILE=compatibility cargo run
./scripts/build-cli.sh
./scripts/build-agent.sh
```

CLI 二进制输出到 `crates/oxideterm-gpui-app/resources/cli-bin/<target-triple>/oxideterm`。

## CLI

```sh
cargo run -p oxideterm-cli -- doctor --strict
cargo run -p oxideterm-cli -- settings validate --strict --json
cargo run -p oxideterm-cli -- connections search prod
cargo run -p oxideterm-cli -- cloud-sync push --dry-run --json
cargo run -p oxideterm-cli -- report --bundle ./oxideterm-report.zip
cargo run -p oxideterm-cli -- --config-dir ./fixture-config doctor --strict
```

## 技术栈

| 层级 | 技术 | 说明 |
|---|---|---|
| 界面框架 | GPUI（Zed） | GPU 加速的即时模式界面，纯 Rust 实现 |
| 运行时 | Tokio + DashMap | 异步运行时与并发映射 |
| SSH | russh（`ring`） | SSH 栈不依赖 OpenSSL/libssh2，支持 SSH Agent |
| 终端 | portable-pty + alacritty_terminal | 本地伪终端、终端模拟与 Sixel/Kitty 图形 |
| 插件 | wasmtime | WASM 隔离与原生宿主 API |
| AI 与检索 | SSE + BM25 + HNSW | 提供商流式传输、CJK 双字词与 RRF 融合 |

## 开发

```sh
cargo check --workspace
cargo test --workspace
cargo fmt --all --check
```

日常迭代优先检查单个 crate；改动跨越 crate 边界时，再检查整个工作区。

## 安全

| 关注点 | 实现 |
|---|---|
| 已存储凭证 | macOS 钥匙串 / Windows Credential Manager / libsecret |
| 内存中的秘密 | 持有秘密的类型和临时缓冲区在支持的所有权边界使用 `zeroize` / `Zeroizing` |
| 诊断 | 支持报告优先输出结构化元数据和脱敏提示，避免携带秘密的原始负载 |
| AI 上下文 | 发往提供商的消息会过滤凭证模式；工作区上下文与操作仍由用户控制 |
| `.oxide` | ChaCha20-Poly1305 + Argon2id |
| CLI 写操作 | dry-run 计划、`--yes` 保护和回滚备份 |
| 插件 | wasmtime 隔离与基于能力的宿主 API |

## 发布状态

- [x] SSH Agent 转发、Grace Period 重连、GPUI 桌面 shell
- [x] 无 WebSocket 的进程内终端数据流
- [x] SFTP、端口转发、IDE、AI、云同步、插件、CLI
- [x] 本地串口与 Telnet 终端
- [x] RDP/VNC 远程桌面与 Raw TCP/UDP 终端
- [x] 完整 ProxyCommand
- [ ] 审计日志

## 提供商中立性

OxideTerm 是 BYOK 优先，并保持提供商中立。

提供商集成是为了让用户连接他们已经信任的工具。它们不是排行榜，不是广告牌，也不是奖励那些最热情开口者的机制。

是否写进文档，取决于兼容性、可维护性、安全性和真实用户价值。可见度跟随有用性，而不是热情程度。

## 贡献

已有 Tauri 功能迁移到原生版本时，应保持行为、标签、交互状态和工作流一致，除非明确记录替代设计。新 crate 必须承担真实职责，不能只是重新导出或堆放函数；应按数据传输对象、验证、持久化、视图模型、协议适配器、展示构建器等能力拆分。

```sh
cargo run -p oxideterm-cli -- report --bundle ./oxideterm-report.zip
```

## 支持与维护

带有可复现步骤和脱敏诊断信息的 bug 报告与回归问题会优先处理。功能请求会根据范围、安全性以及是否符合 OxideTerm 的远程服务器工作区方向来评估。

<p align="center">
  <a href="https://github.com/AnalyseDeCircuit/oxideterm/stargazers">
    <img src="https://img.shields.io/github/stars/AnalyseDeCircuit/oxideterm?style=social" alt="GitHub stars">
  </a>
</p>

如果 OxideTerm 帮助了你的工作流，GitHub Star、问题复现、翻译修正、插件或 PR 都能让项目更容易继续推进。

---

## 许可证

**GPL-3.0-only**。详细的第三方声明见 [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md)，其他通知见 [`NOTICE`](../../NOTICE)。

## 致谢

感谢 `russh`、`GPUI`、`alacritty_terminal`、`portable-pty`、`wasmtime` 和 `tree-sitter`。

<h1 align="center">⚡ OxideTerm — Native</h1>

<p align="center">
  <strong>Không gian làm việc vận hành máy chủ từ xa có AI — ứng dụng gốc viết hoàn toàn bằng Rust</strong>
  <br>
  Terminal SSH, Telnet, nối tiếp, RDP/VNC, SFTP, chuyển tiếp cổng, Raw TCP/UDP và chỉnh sửa nhẹ trong một không gian làm việc gốc.
  <br>
  Kết xuất GPU. Miễn phí. Không cần tài khoản.
  <br>
  <strong>Không đóng gói WebView. Không thu thập dữ liệu đo từ xa. Không thuê bao. Ưu tiên BYOK. SSH thuần Rust không dùng OpenSSL/libssh2.</strong>
</p>


<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0--gpui--preview.16-blue" alt="Version">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform">
  <img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="License">
  <img src="https://img.shields.io/badge/rust-2024%20edition-orange" alt="Rust 2024">
  <img src="https://img.shields.io/badge/ui-GPUI-green" alt="GPUI">
</p>

<p align="center">
  <sub>Phiên bản gốc lớn tiếp theo của <a href="https://github.com/AnalyseDeCircuit/oxideterm">OxideTerm</a> — kết xuất bằng GPU, không WebView, dùng <a href="https://github.com/zed-industries/zed/tree/main/crates/gpui">GPUI</a> (khung kết xuất của Zed)</sub>
</p>

<p align="center">
  <a href="../../README.md">English</a> | <a href="README.zh-Hans.md">简体中文</a> | <a href="README.zh-Hant.md">繁體中文</a> | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a> | <a href="README.fr.md">Français</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../docs/media/oxideterm-native-hero.png" alt="Tổng quan tính năng của OxideTerm Native" width="920">
</p>

<div align="center">

<a href="../../docs/media/ai-terminal-demo.mp4">
  <img src="../../docs/media/ai-terminal-demo.gif" alt="OxideSens mở terminal bên trong OxideTerm" width="920">
</a>

*OxideSens làm theo yêu cầu của người dùng và mở một terminal bên trong OxideTerm.*

</div>

---

## Bạn có thể làm gì

- Quản lý SSH, Telnet, nối tiếp, RDP/VNC, SFTP, chuyển tiếp cổng, Raw TCP/UDP, shell cục bộ và chỉnh sửa nhẹ trong một không gian làm việc native
- Giữ công việc từ xa tiếp tục qua mạng chập chờn với cơ chế kết nối lại Grace Period
- Yêu cầu OxideSens AI kiểm tra phiên đang chạy và thực hiện các thao tác đã được phê duyệt trong không gian làm việc qua nhà cung cấp AI của bạn

---

## Vì sao chọn OxideTerm Native?

| Nếu bạn quan tâm đến... | OxideTerm Native mang lại... |
|---|---|
| Một nút từ xa, nhiều công cụ | Terminal, SFTP, chuyển tiếp cổng, RDP/VNC, Raw TCP/UDP, trzsz, IDE native, giám sát và OxideSens AI cùng gắn với một không gian làm việc |
| Shell native không WebView | GPUI vẽ giao diện desktop trực tiếp lên bề mặt GPU, không DOM, CSS, JavaScript, Chromium hay runtime WebKit |
| Luồng vận hành ưu tiên cục bộ | SSH, Telnet, SFTP, chuyển tiếp, RDP/VNC, Raw TCP/UDP, shell cục bộ, terminal nối tiếp và cấu hình hoạt động không cần đăng ký |
| OxideSens AI dùng BYOK thay vì credit nền tảng | OxideSens dùng điểm truy cập OpenAI/Anthropic/Gemini/Ollama/OpenAI-compatible của bạn với MCP, RAG và thao tác không gian làm việc đã được phê duyệt |
| Kết nối lại ổn định | Grace Period kiểm tra kết nối cũ 30 giây trước khi thay thế, giúp TUI sống sót qua mất mạng ngắn |
| SSH thuần Rust và thông tin xác thực an toàn | Ngăn xếp SSH dùng `russh` + `ring` không cần OpenSSL/libssh2; thông tin xác thực đã lưu dùng kho khóa hệ điều hành và `.oxide` dùng ChaCha20-Poly1305 + Argon2id |

## Nó là gì / không phải gì

OxideTerm Native tập trung vào **không gian làm việc AI ưu tiên cục bộ cho máy chủ từ xa**, được xây lại thành ứng dụng desktop GPUI thuần Rust. Nó dành cho người dùng muốn terminal, remote desktop, raw socket, tệp, cổng, truyền tải, chỉnh sửa nhẹ, console nối tiếp và OxideSens AI xoay quanh máy của họ và các nút từ xa.

Nó không phải nền tảng tác nhân đám mây được lưu trữ. Nó cũng không phải Electron, Tauri hay terminal web: không Chromium, không WebView, không JavaScript, không CSS.

---

## Ảnh chụp màn hình

Giao diện native theo cùng mô hình không gian làm việc và ngôn ngữ hình ảnh OxideTerm như nhánh Tauri hiện tại.

<table>
<tr>
<td align="center"><strong>Terminal SSH + OxideSens AI</strong><br/><br/><img src="../../docs/screenshots/terminal/SSHTERMINAL.png" alt="Terminal SSH với OxideSens AI" /></td>
<td align="center"><strong>Trình quản lý tệp SFTP</strong><br/><br/><img src="../../docs/screenshots/sftp/sftp.png" alt="Trình quản lý tệp SFTP hai bảng với hàng đợi truyền tải" /></td>
</tr>
<tr>
<td align="center"><strong>IDE tích hợp</strong><br/><br/><img src="../../docs/screenshots/miniIDE/miniide.png" alt="Chế độ IDE tích hợp" /></td>
<td align="center"><strong>Chuyển tiếp cổng thông minh</strong><br/><br/><img src="../../docs/screenshots/PORTFORWARD/PORTFORWARD.png" alt="Chuyển tiếp cổng thông minh với phát hiện tự động" /></td>
</tr>
</table>

---

## Khác gì so với WebView/Tauri

| Khía cạnh | WebView/Tauri | Native |
|---|---|---|
| Kết xuất | Chromium/Safari/WebKit2GTK + CSS | GPUI, bề mặt GPU, chế độ tức thời, Rust thuần |
| Luồng dữ liệu terminal | WebSocket → JS event loop → xterm.js | đầu vào Rust → `TerminalState` → kết xuất GPUI |
| IPC | JSON-RPC cho từng lệnh | lời gọi hàm trong tiến trình |
| SSH keepalive | JavaScript timer | Rust async task |
| Runtime plugin | ESM trong sandbox trình duyệt | WASM wasmtime + API host Rust có kiểu |
| CLI | Cần desktop app chạy | Standalone binary |
| Ranh giới runtime | Runtime trình duyệt + cầu WebView | Tiến trình native; không kèm runtime trình duyệt |

## Tính năng

| Danh mục | Tính năng |
|---|---|
| Terminal | PTY cục bộ, SSH, Telnet, terminal Raw TCP/UDP, terminal nối tiếp cục bộ, chia pane, tích hợp shell, đánh dấu lệnh, asciicast, trzsz, Sixel/Kitty graphics, chính sách kết xuất |
| SSH & Auth | pool kết nối, ProxyJump không giới hạn, kết nối lại Grace Period, TOFU khóa host, chuyển tiếp SSH Agent, password/key/cert/keyboard-interactive |
| SFTP / IDE | trình duyệt hai bảng, hàng đợi truyền tải, xem trước, đánh dấu, ghi nguyên tử, cây tệp từ xa, trình soạn thảo nhiều tab, giải quyết xung đột |
| Forwarding | Local, Remote, Dynamic SOCKS5, quy tắc đã lưu, khôi phục sau kết nối lại, báo cáo kết thúc, hết thời gian nhàn rỗi |
| Remote desktop | Tab RDP và VNC tích hợp, điều khiển kết nối lại, kích thước theo viewport, bàn phím, chuột, clipboard và con trỏ |
| Raw TCP/UDP | Terminal Raw TCP và Raw UDP để debug dịch vụ tạm thời, giao thức thiết bị và datagram |
| AI | OxideSens với OpenAI, Anthropic, Gemini, Ollama/compatible, MCP, RAG và phê duyệt lệnh |
| Cloud Sync / `.oxide` | push/pull/apply/resolve, S3/WebDAV/Git, rollback backups, encrypted import/export |
| Plugin / CLI | sandbox WASM, API host native, cài đặt plugin; CLI cho settings, connections, forwards, plugins, bí mật, cloud-sync, backup, report |

## Kiến trúc

OxideTerm Native loại bỏ cầu WebView và giữ terminal, SSH, Telnet, RDP, VNC, Raw TCP/UDP, SFTP, chuyển tiếp, IDE, AI, plugin và CLI trong một kiến trúc Rust native. Các chi tiết triển khai đầy đủ được giữ lại bên dưới.

<details>
<summary><strong>Kiến trúc, nội bộ SSH, shell GPUI, kết nối lại, AI, plugins và hơn nữa</strong></summary>
<br>

### Kiến trúc — lõi cùng tiến trình, không cầu nối WebView

```text
GPUI Render Loop
  WorkspaceApp / bề mặt tab / khung nhìn GPUI
        │ trong tiến trình Arc<> / async
Các crate miền
  NodeRouter → SshConnectionRegistry
  TerminalState ← SSH PTY channel
  SftpSession / ForwardManager / IdeWorkspace
  AiProvider / CloudSyncService / PluginHost
```

Không có ranh giới tuần tự hóa giữa giao diện và phần nền SSH/terminal. Dữ liệu terminal sửa `TerminalState` trực tiếp; GPUI đọc trạng thái và phát lệnh vẽ GPU.

### SSH Rust thuần — russh (ring)

Phiên bản gốc liên kết trực tiếp ngăn xếp `russh` của bản Tauri vào tệp thực thi desktop:

- **Ngăn xếp SSH không dùng OpenSSL/libssh2** — `ring` cung cấp mật mã SSH
- SSH2 đầy đủ: trao đổi khóa, kênh, phân hệ SFTP, chuyển tiếp cổng
- ChaCha20-Poly1305 / AES-GCM, khóa Ed25519/RSA/ECDSA
- SSH Agent trên Unix (`SSH_AUTH_SOCK`) và Windows (`\\.\pipe\openssh-ssh-agent`)
- ProxyJump nhiều bước nhảy với xác thực độc lập ở từng bước

### Kết nối lại thông minh với Grace Period

Hành vi kết nối lại khớp với bản Tauri, nhưng toàn bộ điều phối chạy trong các tác vụ Rust bất đồng bộ:

1. Phát hiện SSH keepalive timeout mà không bị JavaScript timer throttling
2. Chụp lại bảng terminal, truyền tải SFTP, chuyển tiếp và tệp IDE
3. Probe kết nối cũ trong 30 giây Grace Period để TUI apps có thể sống qua thay đổi mạng
4. Nếu không phục hồi được, kết nối lại, khôi phục chuyển tiếp, tiếp tục truyền tải và mở lại tệp IDE

Pipeline: `queued → snapshot → grace-period → ssh-connect → await-terminal → restore-forwards → resume-transfers → restore-ide → verify → done`

### SSH pool kết nối và node routing

`SshConnectionRegistry` dùng `DashMap`, giữ mô hình node-first của Tauri nhưng bỏ WebSocket lifecycle bridge:

- Một SSH connection vật lý có thể phục vụ bảng terminal, SFTP, chuyển tiếp cổng và IDE work
- Mỗi kết nối đi qua `connecting → active → idle → link_down → reconnecting`
- UI gọi theo `nodeId`; `NodeRouter` resolve `connectionId` đang active một cách atomic
- `NodeRuntimeStore` lưu topology snapshots vào `session_tree.json`
- Lỗi máy chủ trung chuyển sẽ truyền trạng thái `link_down` tới các nút phía sau

### OxideSens AI

OxideSens vẫn ưu tiên BYOK, với xây dựng ngữ cảnh chạy trong tiến trình:

- Nhà cung cấp: OpenAI, Anthropic, Gemini, Ollama hoặc điểm truy cập OpenAI-compatible
- MCP: truyền qua stdio và SSE, khám phá và gọi công cụ
- RAG: tìm kiếm toàn văn BM25, chỉ mục vector HNSW, Reciprocal Rank Fusion và bộ tách từ bigram CJK
- Thông điệp gửi tới nhà cung cấp được lọc mẫu thông tin xác thực; ngữ cảnh không gian làm việc và hành động vẫn do người dùng kiểm soát
- Khóa API được lưu trong kho khóa hệ điều hành và chủ động loại khỏi nhật ký có cấu trúc cùng thông điệp của lõi desktop

### Giao diện desktop GPUI

UI được vẽ trực tiếp bằng GPUI, không có DOM/CSS/JavaScript rendering pipeline:

- Các loại tab trong không gian làm việc: terminal cục bộ, SSH, Telnet, nối tiếp, RDP, VNC, Raw TCP/UDP, SFTP, IDE, Forwards, Settings, Plugin, Topology và hơn nữa
- Binary pane tree với dividers kéo được, tối đa bốn panes mỗi terminal tab
- Command palette, global key bindings và sidebars dùng GPUI primitives
- Kết xuất chế độ tức thời phản ứng với trạng thái Rust mà không cần tuần tự hóa khứ hồi

### Trạng thái terminal và kết xuất

Kết xuất terminal được mô hình hóa trước thành trạng thái Rust, rồi GPUI vẽ ra:

- PTY output đi vào `TerminalState`; scrollback, cursor, selection, marks và search state đều ở trong Rust
- Kết xuất policy có thể chuyển giữa Boost, Normal và Idle mà không cần browser event loop hợp tác
- Sixel và Kitty graphics được theo dõi như terminal-owned assets, không phải DOM nodes hoặc canvas overlays
- Các pane dùng chung mô hình trạng thái không gian làm việc, nên khôi phục tab và kết nối lại có thể snapshot topology terminal cùng nhau

### Không gian làm việc SFTP và IDE

Tệp từ xa là một phần của cùng không gian làm việc của nút, không phải tính năng tách rời:

- SFTP sessions được resolve qua `NodeRouter`, nên kết nối lại có thể thay underlying SSH connection mà không đổi node address của UI
- Hàng đợi truyền theo dõi hướng, tiến độ, trạng thái thử lại và giới hạn tốc độ độc lập với các khung tệp đang hiển thị
- Tab IDE lưu cùng bộ đệm chưa lưu, đường dẫn từ xa, trạng thái xung đột và siêu dữ liệu khôi phục
- Khi backend hỗ trợ, remote writes dùng staged/atomic behavior để tránh partial writes trong edit flow thông thường

### Plugin, CLI và chẩn đoán

Nhánh gốc giữ phần mở rộng và bề mặt hỗ trợ trong ranh giới Rust gốc:

- Plugins chạy trong wasmtime sandbox với năng lực host có kiểu thay vì biến toàn cục trình duyệt
- CLI link trực tiếp crate miền cho doctor, settings, connections, forwards, gói di động, backups và reports
- Chẩn đoán ưu tiên số đếm, đường dẫn, cờ tính năng và gợi ý đã che thay vì payload thô có bí mật
- CLI flows có thay đổi state dùng dry-run plans, `--yes` guards và rollback backups khi phù hợp

### Chuyển tiếp cổng — I/O không khóa

Forwarding giữ semantics của Tauri trong một Rust crate độc lập:

- Local `-L`, Remote `-R`, Dynamic SOCKS5 `-D`
- Một task `ssh_io` sở hữu mỗi SSH Channel, tránh `Arc<Mutex<Channel>>`
- Reconnect auto-restore, báo cáo kết thúc và hết thời gian nhàn rỗi

### trzsz — truyền file in-band

trzsz tiếp tục dùng terminal stream, không cần port phụ hoặc remote agent:

- Upload/download qua terminal stream hiện có
- Hoạt động xuyên qua ProxyJump chains
- Native file pickers tránh giới hạn bộ nhớ của browser
- Transfer hai chiều, hỗ trợ thư mục, limits có thể cấu hình

### Export `.oxide` mã hóa

Định dạng gói mã hóa khớp với bản Tauri:

- **ChaCha20-Poly1305 AEAD** authenticated encryption
- **Argon2id KDF**: 256 MB memory cost, 4 iterations, tăng chi phí GPU brute-force
- Bao gồm connections, forwards, settings, quick commands, cài đặt plugin và portable bí mật

</details>

---

## Chạy từ mã nguồn

```sh
cargo run
OXIDETERM_RENDER_PROFILE=compatibility cargo run
./scripts/build-cli.sh
./scripts/build-agent.sh
```

## CLI

```sh
cargo run -p oxideterm-cli -- doctor --strict
cargo run -p oxideterm-cli -- settings validate --strict --json
cargo run -p oxideterm-cli -- connections search prod
cargo run -p oxideterm-cli -- cloud-sync push --dry-run --json
cargo run -p oxideterm-cli -- report --bundle ./oxideterm-report.zip
```

## Ngăn xếp công nghệ

| Lớp | Công nghệ | Ghi chú |
|---|---|---|
| Giao diện | GPUI (Zed) | Chế độ tức thời dùng GPU, thuần Rust |
| Môi trường chạy | Tokio + DashMap | Xử lý bất đồng bộ và bản đồ đồng thời |
| SSH | russh (`ring`) | Không dùng OpenSSL/libssh2 trong ngăn xếp SSH; hỗ trợ SSH Agent |
| Terminal | portable-pty + alacritty_terminal | PTY cục bộ, mô phỏng terminal và đồ họa Sixel/Kitty |
| Plugin | wasmtime | Cách ly WASM với API máy chủ gốc |
| AI và tìm kiếm | SSE + BM25 + HNSW | Truyền dữ liệu nhà cung cấp, bigram CJK và hợp nhất RRF |

## Phát triển

```sh
cargo check --workspace
cargo test --workspace
cargo fmt --all --check
```

Khi phát triển, hãy ưu tiên kiểm tra từng crate; sau đó kiểm tra toàn bộ workspace nếu thay đổi vượt qua ranh giới giữa các crate.

## Bảo mật

| Concern | Implementation |
|---|---|
| Thông tin xác thực đã lưu | macOS Keychain / Windows Credential Manager / libsecret |
| Bí mật trong bộ nhớ | Kiểu dữ liệu chứa bí mật và bộ đệm tạm dùng `zeroize` / `Zeroizing` tại các ranh giới sở hữu được hỗ trợ |
| Chẩn đoán | Báo cáo hỗ trợ ưu tiên siêu dữ liệu có cấu trúc và gợi ý đã che thay cho dữ liệu chứa bí mật |
| Ngữ cảnh AI | Thông điệp gửi tới nhà cung cấp được lọc mẫu thông tin xác thực; ngữ cảnh workspace và hành động vẫn do người dùng kiểm soát |
| `.oxide` | ChaCha20-Poly1305 + Argon2id |
| Ghi bằng CLI | Kế hoạch chạy thử, bảo vệ `--yes`, bản sao lưu khôi phục |
| Plugin | Cách ly wasmtime và API máy chủ dựa trên năng lực |

## Trạng thái phát hành

- [x] chuyển tiếp SSH Agent, kết nối lại Grace Period, GPUI desktop shell
- [x] Luồng dữ liệu terminal trong tiến trình, không dùng WebSocket
- [x] SFTP, chuyển tiếp, IDE, AI, đồng bộ đám mây, plugin, CLI
- [x] Terminal nối tiếp cục bộ và Telnet
- [x] Remote desktop RDP/VNC và terminal Raw TCP/UDP
- [x] Full ProxyCommand
- [ ] Audit logging

## Đóng góp

Khi chuyển một tính năng hiện có từ Tauri, hãy giữ nguyên hành vi, nhãn, trạng thái tương tác và quy trình trừ khi đã có thiết kế thay thế được ghi rõ. Mỗi crate mới phải đảm nhận một trách nhiệm miền thực sự.

```sh
cargo run -p oxideterm-cli -- report --bundle ./oxideterm-report.zip
```

## Trung lập nhà cung cấp

OxideTerm ưu tiên BYOK và giữ trung lập giữa các nhà cung cấp.

Tích hợp nhà cung cấp tồn tại để giúp người dùng kết nối các công cụ họ đã tin tưởng. Chúng không phải bảng xếp hạng, biển quảng cáo, hay hệ thống thưởng cho bên nào hỏi han nhiệt tình nhất.

Khả năng tương thích, khả năng bảo trì, tính bảo mật và giá trị thực cho người dùng quyết định nội dung được ghi vào tài liệu. Mức độ hiển thị đi theo tính hữu ích, không theo mức độ vận động.

## Hỗ trợ và bảo trì

Báo cáo lỗi và hồi quy có bước tái hiện cùng chẩn đoán đã che được ưu tiên. Yêu cầu tính năng được đánh giá theo phạm vi, an toàn và mức độ phù hợp với định hướng không gian làm việc máy chủ từ xa của OxideTerm.

<p align="center">
  <a href="https://github.com/AnalyseDeCircuit/oxideterm/stargazers">
    <img src="https://img.shields.io/github/stars/AnalyseDeCircuit/oxideterm?style=social" alt="GitHub stars">
  </a>
</p>

Nếu OxideTerm hỗ trợ quy trình làm việc của bạn, một ngôi sao GitHub, báo cáo tái hiện lỗi, bản sửa dịch thuật, plugin hoặc pull request đều giúp dự án tiếp tục phát triển.

---

## Giấy phép

**GPL-3.0-only**. Thông báo chi tiết về bên thứ ba nằm trong [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md), cùng thông tin bổ sung trong [`NOTICE`](../../NOTICE).

## Lời cảm ơn

Xin cảm ơn `russh`, `GPUI`, `alacritty_terminal`, `portable-pty`, `wasmtime` và `tree-sitter`.

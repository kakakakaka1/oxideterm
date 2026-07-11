<h1 align="center">⚡ OxideTerm — Native</h1>

<p align="center">
  <strong>リモートサーバー向け AI 搭載ネイティブ運用ワークスペース — 純粋 Rust ネイティブアプリ</strong>
  <br>
  SSH、Telnet、シリアル、RDP/VNC、SFTP、ポート転送、Raw TCP/UDP、軽量編集を 1 つのネイティブワークスペースに。
  <br>
  GPU 直接レンダリング。無料、アカウント不要。
  <br>
  <strong>WebView の同梱なし。テレメトリなし。サブスクリプションなし。BYOK 優先。OpenSSL/libssh2 に依存しない純 Rust SSH。</strong>
</p>


<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0--gpui--preview.16-blue" alt="Version">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform">
  <img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="License">
  <img src="https://img.shields.io/badge/rust-2024%20edition-orange" alt="Rust 2024">
  <img src="https://img.shields.io/badge/ui-GPUI-green" alt="GPUI">
</p>

<p align="center">
  <sub><a href="https://github.com/AnalyseDeCircuit/oxideterm">OxideTerm</a> の次期メジャーなネイティブ版 — GPU レンダリング、WebView なし、<a href="https://github.com/zed-industries/zed/tree/main/crates/gpui">GPUI</a>（Zed のレンダリングフレームワーク）を使用</sub>
</p>

<p align="center">
  <a href="../../README.md">English</a> | <a href="README.zh-Hans.md">简体中文</a> | <a href="README.zh-Hant.md">繁體中文</a> | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a> | <a href="README.fr.md">Français</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="../../docs/media/oxideterm-native-hero.png" alt="OxideTerm Native の機能概要" width="920">
</p>

<div align="center">

<a href="../../docs/media/ai-terminal-demo.mp4">
  <img src="../../docs/media/ai-terminal-demo.gif" alt="OxideSens が OxideTerm 内でターミナルを開くデモ" width="920">
</a>

*OxideSens がユーザーの依頼に従い、OxideTerm 内でターミナルを開く様子です。*

</div>

---

## OxideTerm Native とは

OxideTerm Native は**純粋 Rust GPUI デスクトップアプリ**——SSH、ファイル、ポート転送、Raw TCP/UDP、リモートデスクトップのワークフロー向けオープンソース運用ワークスペースです。

**できること：**

- SSH、Telnet、シリアル、RDP/VNC、SFTP、ポート転送、Raw TCP/UDP、ローカルシェル、軽量編集を 1 つのネイティブワークスペースで管理
- Grace Period による再接続で、ネットワークが揺れてもリモート作業を維持
- OxideSens AI に、自分の AI プロバイダー経由で実行中のセッション確認と承認済みワークスペース操作の実行を任せる

ホスト型のクラウドエージェント基盤ではありません。Electron、Tauri、Web ターミナルでもありません。Chromium、WebView、JavaScript、CSS はありません。

---

## なぜ OxideTerm Native か？

| 重視すること... | OxideTerm Native が提供すること... |
|---|---|
| 1 つのリモートノード、多数のツール | ターミナル、SFTP、ポート転送、RDP/VNC、Raw TCP/UDP、trzsz、ネイティブ IDE、監視、OxideSens AI が同じワークスペースに接続 |
| ゼロ WebView ネイティブシェル | GPUI が GPU サーフェスに直接デスクトップ UI を描画 — DOM、CSS、JavaScript、Chromium、WebKit ランタイムなし |
| ローカルファースト運用ワークフロー | SSH、Telnet、SFTP、転送、RDP/VNC、Raw TCP/UDP、ローカルシェル、シリアル端末、設定はサインアップ不要 |
| BYOK OxideSens AI（プラットフォームクレジット不要） | OxideSens はあなたの OpenAI/Anthropic/Gemini/Ollama/互換エンドポイントを MCP、RAG、承認済みワークスペース操作と共に使用 |
| 再接続の安定性 | Grace Period が 30 秒間古い接続を確認 — TUI アプリが短いネットワーク切断でも生き残る |
| 純 Rust SSH と認証情報の安全性 | SSH スタックは OpenSSL/libssh2 を使わない `russh` + `ring`。保存する認証情報には OS のキーチェーンを使い、`.oxide` は ChaCha20-Poly1305 + Argon2id を使用 |

---

## スクリーンショット

ネイティブ UI は、現在の Tauri 系列と同じ OxideTerm のワークスペースモデルとビジュアル言語を踏襲します。

<table>
<tr>
<td align="center"><strong>SSH ターミナル + OxideSens AI</strong><br/><br/><img src="../../docs/screenshots/terminal/SSHTERMINAL.png" alt="OxideSens AI 付き SSH ターミナル" /></td>
<td align="center"><strong>SFTP ファイルマネージャー</strong><br/><br/><img src="../../docs/screenshots/sftp/sftp.png" alt="転送キュー付き SFTP デュアルペインファイルマネージャー" /></td>
</tr>
<tr>
<td align="center"><strong>内蔵 IDE</strong><br/><br/><img src="../../docs/screenshots/miniIDE/miniide.png" alt="内蔵 IDE モード" /></td>
<td align="center"><strong>スマートポートフォワーディング</strong><br/><br/><img src="../../docs/screenshots/PORTFORWARD/PORTFORWARD.png" alt="自動検出付きスマートポートフォワーディング" /></td>
</tr>
</table>

---

## WebView 版との違い

| 項目 | WebView/Tauri | Native |
|---|---|---|
| 描画 | Chromium/Safari/WebKit2GTK + CSS | GPUI GPU サーフェス、即時モード、純粋 Rust |
| ターミナルデータの流れ | WebSocket → JS event loop → xterm.js | Rust 入力 → `TerminalState` → GPUI 描画 |
| IPC | コマンドごとに JSON-RPC | プロセス内関数呼び出し |
| SSH keepalive | JavaScript timer | Rust async task |
| プラグイン実行環境 | ブラウザーサンドボックスの ESM | wasmtime WASM + typed Rust ホスト API |
| CLI | desktop app の起動が必要 | standalone binary |
| ランタイム境界 | ブラウザランタイム + WebView ブリッジ | ネイティブプロセス。ブラウザランタイムを同梱しません |

## 機能概要

| カテゴリ | 機能 |
|---|---|
| ターミナル | ローカル PTY、SSH、Telnet、Raw TCP/UDP ターミナル、ローカルシリアル端末、分割ペイン、シェル連携、コマンドマーク、asciicast、trzsz、Sixel/Kitty graphics、描画ポリシー |
| SSH と認証 | 接続プール、無制限 ProxyJump、Grace Period 再接続、ホスト鍵 TOFU、SSH Agent 転送、password/key/cert/keyboard-interactive |
| SFTP / IDE | 2 ペインブラウザー、転送キュー、プレビュー、ブックマーク、アトミック書き込み、リモートファイルツリー、マルチタブエディター、競合解決 |
| ポート転送 | Local、Remote、Dynamic SOCKS5、保存済みルール、再接続時の復元、停止報告、アイドルタイムアウト |
| リモートデスクトップ | 内蔵 RDP/VNC タブ、再接続操作、ビューポートサイズ調整、キーボード、マウス、クリップボード、カーソル処理 |
| Raw TCP/UDP | 一時的なサービス、デバイスプロトコル、データグラムのデバッグ向け Raw TCP/UDP ターミナル |
| AI | OxideSens: OpenAI、Anthropic、Gemini、Ollama/compatible、MCP、RAG、コマンド承認 |
| クラウド同期 / `.oxide` | push/pull/apply/resolve、S3/WebDAV/Git、ロールバックバックアップ、暗号化インポート/エクスポート |
| プラグイン / CLI | WASM サンドボックス、ネイティブホスト API、プラグイン別設定；CLI は settings、connections、転送、plugins、secrets、cloud-sync、backup、report など |

## 内部構造

OxideTerm Native は WebView ブリッジを取り除き、ターミナル、SSH、Telnet、RDP、VNC、Raw TCP/UDP、SFTP、ポート転送、IDE、AI、プラグイン、CLI を 1 つの Rust ネイティブアーキテクチャに保ちます。実装詳細は下に残しています。

<details>
<summary><strong>アーキテクチャ, SSH 内部, GPUI シェル, 再接続, AI, プラグインなど</strong></summary>
<br>

### アーキテクチャ — プロセス内コア、WebView ブリッジなし

```text
GPUI 描画ループ
  WorkspaceApp / タブ画面 / GPUI ビュー
        │ プロセス内 Arc<> / async
ドメイン Crate
  NodeRouter → SshConnectionRegistry
  TerminalState ← SSH PTY channel
  SftpSession / ForwardManager / IdeWorkspace
  AiProvider / CloudSyncService / PluginHost
```

UI と SSH/ターミナルバックエンドの間にシリアライズ境界はありません。ターミナルのバイト列は `TerminalState` を直接変更し、GPUI が状態を読み取って GPU 描画命令を発行します。

### 純粋な Rust SSH — russh (ring)

ネイティブ版は Tauri 版と同じ `russh` スタックをデスクトップバイナリへ直接リンクします。

- **SSH スタックは OpenSSL/libssh2 に非依存** — SSH 暗号処理には `ring` を使用
- 完整 SSH2: 鍵交換、チャネル、SFTP サブシステム、ポート転送
- ChaCha20-Poly1305 / AES-GCM、Ed25519/RSA/ECDSA 鍵
- SSH Agent: Unix (`SSH_AUTH_SOCK`) と Windows (`\\.\pipe\openssh-ssh-agent`)
- 各ホップで独立して認証する多段 ProxyJump

### Grace Period 付きスマート再接続

再接続の動作は Tauri 版と同じですが、処理の調整は Rust の非同期タスク内で完結します。

1. JavaScript timer throttling なしで SSH keepalive timeout を検出
2. ターミナルペイン、SFTP 転送、転送、IDE ファイルをスナップショット
3. Grace Period 中に旧接続を 30 秒 probe し、ネットワーク切替時も TUI apps を残せるようにする
4. 復旧できない場合は再接続し、転送を復元し、転送を再開して IDE ファイルを再オープン

Pipeline: `queued → snapshot → grace-period → ssh-connect → await-terminal → restore-forwards → resume-transfers → restore-ide → verify → done`

### SSH 接続プールとノードルーティング

`SshConnectionRegistry` は `DashMap` backed で、WebSocket lifecycle bridge なしに Tauri の node-first model を維持します。

- 1 つの物理 SSH connection がターミナルペイン、SFTP、ポート転送、IDE 作業を共有
- 各接続は `connecting → active → idle → link_down → reconnecting` を遷移
- UI は `nodeId` でコマンドを出し、`NodeRouter` がアクティブな `connectionId` をアトミックに解決
- `NodeRuntimeStore` がトポロジースナップショットを `session_tree.json` に永続化
- ジャンプホスト障害は下流ノードへ `link_down` を連鎖的に伝播

### OxideSens AI

OxideSens は BYOK 優先のまま、コンテキスト構築はプロセス内で行います。

- プロバイダー: OpenAI、Anthropic、Gemini、Ollama、任意の OpenAI 互換エンドポイント
- MCP: stdio / SSE トランスポート、ツールの検出と呼び出し
- RAG: BM25 全文検索、HNSW ベクトル索引、Reciprocal Rank Fusion、CJK バイグラムトークナイザー
- プロバイダーへ送るメッセージは認証情報パターンをマスクし、ワークスペースのコンテキストと操作はユーザーが管理します
- API キーは OS のキーチェーンに保存し、構造化ログとデスクトップコアのメッセージ対象から明示的に除外します

### GPUI デスクトップシェル

UI は GPUI で直接描画され、DOM/CSS/JavaScript rendering pipeline はありません。

- ワークスペースタブの種類: local terminal、SSH、Telnet、Serial、RDP、VNC、Raw TCP/UDP、SFTP、IDE、Forwards、Settings、Plugin、Topology など
- draggable dividers 付き binary pane tree、terminal tab ごとに最大 4 panes
- Command palette、global key bindings、sidebars は GPUI primitives
- 即時モード描画はシリアライズの往復なしで Rust の状態変化に反応

### ターミナル状態と描画

ターミナル描画はまず Rust の状態としてモデル化され、その後 GPUI が描画します。

- PTY 出力は `TerminalState` に入り、scrollback、cursor、selection、marks、検索状態は Rust 側に保持されます
- 描画ポリシーは Boost、Normal、Idle の間で切り替えられ、ブラウザーイベントループの協調を待ちません
- Sixel と Kitty graphics は DOM nodes や canvas overlays ではなく、terminal-owned assets として追跡されます
- 分割ペインは同じワークスペース状態モデルを共有し、タブ復元と再接続でターミナル構成をまとめてスナップショットできます

### SFTP と IDE ワークスペース

リモートファイルは分離された付属機能ではなく、同じノードワークスペースの一部です。

- SFTP sessions は `NodeRouter` 経由で解決され、再接続が基盤の SSH 接続を差し替えても UI のノードアドレスは変わりません
- 転送キューは表示中のファイルペインから独立して方向、進捗、再試行状態、速度制限を追跡します
- IDE タブは未保存バッファ、リモートパス、競合状態、復元メタデータをまとめて保持します
- Backend が対応する場合、remote writes は staged/atomic behavior を使い、通常の edit flow に partial writes を出しにくくします

### プラグイン、CLI、診断

ネイティブ版は拡張機能とサポート機能を Rust ネイティブの境界内に保ちます。

- Plugins はブラウザーのグローバルではなく型付きホスト機能を使い、wasmtime サンドボックスで実行されます
- CLI はドメイン crate に直接リンクし、doctor、settings、connections、転送、ポータブルバンドル、バックアップ、レポートを扱います
- 診断は秘密を含む生ペイロードではなく、件数、パス、機能フラグ、マスク済みヒントを優先します
- 状態を変更する CLI 処理はドライラン計画、`--yes` 保護、ロールバック用バックアップを使います

### ポート転送 — ロックフリー I/O

Forwarding は Tauri semantics を standalone Rust crate で保持します。

- Local `-L`、Remote `-R`、Dynamic SOCKS5 `-D`
- 単一の `ssh_io` task が各 SSH Channel を所有し、`Arc<Mutex<Channel>>` を避ける
- 再接続 auto-restore、停止報告、アイドルタイムアウト

### trzsz — 帯域内ファイル転送

trzsz は引き続き terminal stream を使い、追加 port や remote agent は不要です。

- 既存 terminal stream 経由の upload/download
- ProxyJump chains 越しに動作
- Native file pickers により browser memory limits を回避
- 双方向 transfer、directory support、configurable limits

### `.oxide` 暗号化エクスポート

暗号化バンドル形式は Tauri 版と同じです。

- **ChaCha20-Poly1305 AEAD** authenticated encryption
- **Argon2id KDF**: 256 MB memory cost、4 iterations により GPU brute-force cost を上げる
- connections、転送、settings、クイックコマンド、プラグイン設定、ポータブルシークレットを含む

</details>

---

## ソースから実行

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

## 技術スタック

| レイヤー | 技術 | 補足 |
|---|---|---|
| UI | GPUI (Zed) | GPU 対応の即時モード、純 Rust |
| ランタイム | Tokio + DashMap | 非同期処理と並行マップ |
| SSH | russh (`ring`) | SSH スタックは OpenSSL/libssh2 に非依存、SSH Agent 対応 |
| ターミナル | portable-pty + alacritty_terminal | ローカル PTY、端末エミュレーション、Sixel/Kitty グラフィックス |
| プラグイン | wasmtime | ネイティブホスト API を備えた WASM 分離 |
| AI と検索 | SSE + BM25 + HNSW | プロバイダー配信、CJK バイグラム、RRF 統合 |

## 開発

```sh
cargo check --workspace
cargo test --workspace
cargo fmt --all --check
```

開発中は crate 単位の確認を優先し、複数の crate にまたがる変更では最後にワークスペース全体を確認してください。

## セキュリティ

| Concern | Implementation |
|---|---|
| 保存済み認証情報 | macOS Keychain / Windows Credential Manager / libsecret |
| メモリ上の秘密情報 | 秘密情報を保持する型と一時バッファは、対応する所有権境界で `zeroize` / `Zeroizing` を使用 |
| 診断 | サポート出力は秘密情報を含むデータより、構造化メタデータとマスク済み情報を優先 |
| AI コンテキスト | プロバイダーへ送るメッセージは認証情報パターンをマスクし、ワークスペースのコンテキストと操作はユーザーが管理 |
| `.oxide` | ChaCha20-Poly1305 + Argon2id |
| CLI 書き込み | ドライラン計画、`--yes` 保護、ロールバック用バックアップ |
| プラグイン | wasmtime による分離と能力ベースのホスト API |

## リリース状況

- [x] SSH Agent 転送、Grace Period 再接続、GPUI desktop shell
- [x] WebSocket を使わないプロセス内のターミナルデータフロー
- [x] SFTP、ポート転送、IDE、AI、クラウド同期、プラグイン、CLI
- [x] ローカルシリアル端末
- [x] RDP/VNC リモートデスクトップと Raw TCP/UDP ターミナル
- [x] Full ProxyCommand
- [ ] Audit logging

## コントリビューション

Tauri 版の既存機能を移植する場合は、代替設計が明記されていない限り、挙動、ラベル、操作状態、ワークフローを揃えてください。新しい crate は単なる再エクスポートではなく、明確なドメイン責務を担う必要があります。

```sh
cargo run -p oxideterm-cli -- report --bundle ./oxideterm-report.zip
```

## プロバイダー中立性

OxideTerm は BYOK 優先であり、プロバイダー中立です。

プロバイダー連携は、ユーザーがすでに信頼しているツールへ接続するためのものです。ランキング、広告枠、あるいは最も熱心に声をかけてきた相手への報酬ではありません。

ドキュメントに掲載する内容は、互換性、保守性、安全性、そして実際の利用価値で決まります。掲載の優先度は有用性に従い、声の大きさには左右されません。

## サポートとメンテナンス

再現手順とマスク済み診断を含むバグ報告と回帰を優先します。機能リクエストは範囲、安全性、OxideTerm のリモートサーバー向けワークスペースという方向性との整合性に基づいて検討します。

<p align="center">
  <a href="https://github.com/AnalyseDeCircuit/oxideterm/stargazers">
    <img src="https://img.shields.io/github/stars/AnalyseDeCircuit/oxideterm?style=social" alt="GitHub stars">
  </a>
</p>

OxideTerm が役立ったなら、GitHub のスター、問題の再現報告、翻訳の修正、プラグイン、プルリクエストがプロジェクトの継続を支えます。

---

## ライセンス

**GPL-3.0-only**。詳細な第三者ライセンス情報は [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) に、追加の通知は [`NOTICE`](../../NOTICE) に記載しています。

## 謝辞

`russh`、`GPUI`、`alacritty_terminal`、`portable-pty`、`wasmtime`、`tree-sitter` に感謝します。

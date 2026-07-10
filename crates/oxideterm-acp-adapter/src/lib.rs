// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! ACP stdio adapter entrypoint for local agent CLIs that do not expose ACP directly.

use std::{
    collections::HashMap,
    ffi::OsString,
    path::PathBuf,
    process::Stdio as ProcessStdio,
    sync::{Arc, Mutex},
};

use agent_client_protocol::{
    Agent, Client, ConnectionTo, Dispatch, Stdio,
    schema::{
        AgentCapabilities, CancelNotification, CloseSessionRequest, CloseSessionResponse,
        ContentBlock, ContentChunk, DeleteSessionRequest, DeleteSessionResponse, Implementation,
        InitializeRequest, InitializeResponse, NewSessionRequest, NewSessionResponse,
        PermissionOption, PermissionOptionKind, PromptRequest, PromptResponse, ProtocolVersion,
        RequestPermissionOutcome, RequestPermissionRequest, SessionId, SessionNotification,
        SessionUpdate, StopReason, ToolCall, ToolCallStatus, ToolCallUpdate, ToolCallUpdateFields,
        ToolKind,
    },
};
use clap::{Parser, ValueEnum};
use serde_json::{Value, json};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::{mpsc, oneshot},
    time::{Duration, timeout},
};
use uuid::Uuid;

pub const ACP_ADAPTER_ARG: &str = "--acp-adapter";

mod claude;
mod codex;

use claude::stream_claude_code_provider;
use codex::stream_codex_app_server_provider;

#[derive(Debug, Parser)]
#[command(name = "oxideterm --acp-adapter")]
#[command(about = "Bridge local coding-agent CLIs to ACP stdio.")]
struct Cli {
    #[arg(value_enum)]
    provider: AdapterProvider,

    #[arg(long)]
    command: Option<String>,

    #[arg(long = "arg")]
    extra_args: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
enum AdapterProvider {
    ClaudeCode,
    Codex,
}

#[derive(Clone, Debug)]
struct AdapterConfig {
    provider: AdapterProvider,
    command: String,
    extra_args: Vec<String>,
}

#[derive(Clone, Debug)]
struct SessionState {
    cwd: PathBuf,
    claude_session_id: Option<String>,
    codex_thread_id: Option<String>,
}

type Sessions = Arc<Mutex<HashMap<SessionId, SessionState>>>;
type ActiveRuns = Arc<Mutex<HashMap<SessionId, ActiveRun>>>;

struct ProviderOutcome {
    stop_reason: StopReason,
    claude_session_id: Option<String>,
    codex_thread_id: Option<String>,
}

#[derive(Clone)]
struct ActiveRun {
    run_id: Uuid,
    cancel_tx: mpsc::UnboundedSender<()>,
}

pub fn run_from_env_if_requested() {
    let mut args = std::env::args_os();
    let _program = args.next();
    if args.next().as_deref() != Some(std::ffi::OsStr::new(ACP_ADAPTER_ARG)) {
        return;
    }

    // The adapter path must finish before GPUI initializes so stdout stays a
    // clean ACP transport and no singleton UI lock is acquired by child agents.
    let cli_args = std::iter::once(OsString::from("oxideterm-acp-adapter")).chain(args);
    let cli = Cli::try_parse_from(cli_args).unwrap_or_else(|error| error.exit());
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap_or_else(|error| {
            eprintln!("failed to start ACP adapter runtime: {error}");
            std::process::exit(1);
        });
    let exit_code = match runtime.block_on(run_adapter(cli)) {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("ACP adapter failed: {error}");
            1
        }
    };
    std::process::exit(exit_code);
}

async fn run_adapter(cli: Cli) -> agent_client_protocol::Result<()> {
    let config = Arc::new(AdapterConfig::from_cli(cli));
    let sessions = Sessions::default();
    let active_runs = ActiveRuns::default();

    Agent
        .builder()
        .name("oxideterm-acp-adapter")
        .on_receive_request(
            {
                let config = Arc::clone(&config);
                async move |initialize: InitializeRequest, responder, _connection| {
                    let protocol_version = supported_protocol_version(initialize.protocol_version);
                    responder.respond(
                        InitializeResponse::new(protocol_version)
                            .agent_capabilities(AgentCapabilities::new())
                            .agent_info(Implementation::new(
                                config.provider.agent_name(),
                                env!("CARGO_PKG_VERSION"),
                            )),
                    )
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            {
                let sessions = Arc::clone(&sessions);
                async move |request: NewSessionRequest, responder, _connection| {
                    let session_id = SessionId::new(format!(
                        "oxideterm-{}-{}",
                        env!("CARGO_PKG_VERSION"),
                        Uuid::new_v4()
                    ));
                    // Store only the session root needed to launch the wrapped CLI.
                    sessions.lock().expect("session registry lock").insert(
                        session_id.clone(),
                        SessionState {
                            cwd: request.cwd,
                            claude_session_id: None,
                            codex_thread_id: None,
                        },
                    );
                    responder.respond(NewSessionResponse::new(session_id))
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            {
                let config = Arc::clone(&config);
                let sessions = Arc::clone(&sessions);
                let active_runs = Arc::clone(&active_runs);
                async move |request: PromptRequest, responder, connection: ConnectionTo<Client>| {
                    match handle_prompt(&config, &sessions, &active_runs, request, connection).await
                    {
                        Ok(response) => responder.respond(response),
                        Err(error) => responder.respond_with_error(error),
                    }
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            {
                let sessions = Arc::clone(&sessions);
                let active_runs = Arc::clone(&active_runs);
                async move |request: CloseSessionRequest, responder, _connection| {
                    cancel_active_run(&active_runs, &request.session_id);
                    sessions
                        .lock()
                        .expect("session registry lock")
                        .remove(&request.session_id);
                    responder.respond(CloseSessionResponse::new())
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            {
                let sessions = Arc::clone(&sessions);
                let active_runs = Arc::clone(&active_runs);
                async move |request: DeleteSessionRequest, responder, _connection| {
                    cancel_active_run(&active_runs, &request.session_id);
                    sessions
                        .lock()
                        .expect("session registry lock")
                        .remove(&request.session_id);
                    responder.respond(DeleteSessionResponse::new())
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_notification(
            {
                let active_runs = Arc::clone(&active_runs);
                async move |cancel: CancelNotification, _connection| {
                    cancel_active_run(&active_runs, &cancel.session_id);
                    Ok(())
                }
            },
            agent_client_protocol::on_receive_notification!(),
        )
        .on_receive_dispatch(
            async move |message: Dispatch, connection: ConnectionTo<Client>| {
                message.respond_with_error(
                    agent_client_protocol::Error::method_not_found()
                        .data("oxideterm-acp-adapter unsupported ACP method"),
                    connection,
                )
            },
            agent_client_protocol::on_receive_dispatch!(),
        )
        .connect_to(Stdio::new())
        .await
}

fn cancel_active_run(active_runs: &ActiveRuns, session_id: &SessionId) {
    if let Some(run) = active_runs
        .lock()
        .expect("active ACP run lock")
        .remove(session_id)
    {
        // The prompt task owns the child process; the channel keeps cancellation
        // routed through that owner so process cleanup remains single-threaded.
        let _ = run.cancel_tx.send(());
    }
}

fn cleanup_active_run(active_runs: &ActiveRuns, session_id: &SessionId, run_id: Uuid) {
    let mut runs = active_runs.lock().expect("active ACP run lock");
    if runs.get(session_id).is_some_and(|run| run.run_id == run_id) {
        runs.remove(session_id);
    }
}

impl AdapterConfig {
    fn from_cli(cli: Cli) -> Self {
        let command = cli
            .command
            .unwrap_or_else(|| cli.provider.default_command().to_string());
        Self {
            provider: cli.provider,
            command,
            extra_args: cli.extra_args,
        }
    }
}

impl AdapterProvider {
    fn default_command(self) -> &'static str {
        match self {
            Self::ClaudeCode => "claude",
            Self::Codex => "codex",
        }
    }

    fn agent_name(self) -> &'static str {
        match self {
            Self::ClaudeCode => "OxideTerm Claude Code ACP Adapter",
            Self::Codex => "OxideTerm Codex ACP Adapter",
        }
    }
}

fn supported_protocol_version(version: ProtocolVersion) -> ProtocolVersion {
    match version {
        ProtocolVersion::V1 => ProtocolVersion::V1,
        _ => ProtocolVersion::V1,
    }
}

async fn handle_prompt(
    config: &AdapterConfig,
    sessions: &Sessions,
    active_runs: &ActiveRuns,
    request: PromptRequest,
    connection: ConnectionTo<Client>,
) -> Result<PromptResponse, agent_client_protocol::Error> {
    let session = sessions
        .lock()
        .expect("session registry lock")
        .get(&request.session_id)
        .cloned()
        .ok_or_else(|| agent_client_protocol::util::internal_error("ACP session was not found"))?;
    let prompt = prompt_text(&request.prompt);
    if prompt.trim().is_empty() {
        return Err(agent_client_protocol::util::internal_error(
            "ACP prompt did not contain text content",
        ));
    }

    let outcome = stream_provider(
        config,
        active_runs,
        request.session_id.clone(),
        session,
        prompt,
        connection,
    )
    .await?;
    if let Some(codex_thread_id) = outcome.codex_thread_id.clone()
        && let Some(session) = sessions
            .lock()
            .expect("session registry lock")
            .get_mut(&request.session_id)
    {
        session.codex_thread_id = Some(codex_thread_id);
    }
    if let Some(claude_session_id) = outcome.claude_session_id.clone()
        && let Some(session) = sessions
            .lock()
            .expect("session registry lock")
            .get_mut(&request.session_id)
    {
        session.claude_session_id = Some(claude_session_id);
    }
    Ok(PromptResponse::new(outcome.stop_reason))
}

async fn stream_provider(
    config: &AdapterConfig,
    active_runs: &ActiveRuns,
    session_id: SessionId,
    session: SessionState,
    prompt: String,
    connection: ConnectionTo<Client>,
) -> Result<ProviderOutcome, agent_client_protocol::Error> {
    match config.provider {
        AdapterProvider::ClaudeCode => {
            stream_claude_code_provider(
                config,
                active_runs,
                session_id,
                session.cwd,
                session.claude_session_id,
                prompt,
                connection,
            )
            .await
        }
        AdapterProvider::Codex => {
            stream_codex_app_server_provider(
                config,
                active_runs,
                session_id,
                session.cwd,
                session.codex_thread_id,
                prompt,
                connection,
            )
            .await
        }
    }
}

fn emit_text_chunk(
    connection: &ConnectionTo<Client>,
    session_id: &SessionId,
    text: &str,
) -> Result<(), agent_client_protocol::Error> {
    if !text.is_empty() {
        connection.send_notification(SessionNotification::new(
            session_id.clone(),
            SessionUpdate::AgentMessageChunk(ContentChunk::new(ContentBlock::from(text))),
        ))?;
    }
    Ok(())
}

fn emit_thought_chunk(
    connection: &ConnectionTo<Client>,
    session_id: &SessionId,
    text: &str,
) -> Result<(), agent_client_protocol::Error> {
    if !text.is_empty() {
        connection.send_notification(SessionNotification::new(
            session_id.clone(),
            SessionUpdate::AgentThoughtChunk(ContentChunk::new(ContentBlock::from(text))),
        ))?;
    }
    Ok(())
}

fn prompt_text(blocks: &[ContentBlock]) -> String {
    blocks
        .iter()
        .filter_map(|block| match block {
            ContentBlock::Text(text) => Some(text.text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

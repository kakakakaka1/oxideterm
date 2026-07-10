// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

use super::*;

pub(super) fn detect_ssh_agent_available() -> Option<bool> {
    let sock = std::env::var_os("SSH_AUTH_SOCK")?;
    Some(!sock.is_empty() && std::path::Path::new(&sock).exists())
}

pub(super) fn proxy_chain_from_form(
    form: &mut NewConnectionForm,
) -> Result<Option<Vec<ProxyHopConfig>>, String> {
    if form.proxy_hops.is_empty() {
        return Ok(None);
    }

    let mut chain = Vec::new();
    for hop in form.proxy_hops.iter().filter(|hop| hop.complete()) {
        if hop.auth_tab == SshAuthTab::ManagedKey && hop.managed_key_id.trim().is_empty() {
            return Err("Proxy hop managed key is required".to_string());
        }
        chain.push(ProxyHopConfig {
            host: hop.host.trim().to_string(),
            port: hop.port.trim().parse::<u16>().unwrap_or(22),
            username: hop.username.trim().to_string(),
            auth: auth_method_from_proxy_hop(hop),
            agent_forwarding: hop.agent_forwarding,
            legacy_ssh_compatibility: hop.legacy_ssh_compatibility,
            strict_host_key_checking: true,
            trust_host_key: None,
            expected_host_key_fingerprint: None,
        });
    }

    Ok(Some(chain))
}

pub(super) fn proxy_session_tree_endpoints(
    config: &SshConfig,
) -> Vec<NativeSessionTreeConnectEndpoint> {
    let mut endpoints = config
        .proxy_chain
        .as_ref()
        .map(|chain| {
            chain
                .iter()
                .map(|hop| NativeSessionTreeConnectEndpoint::new(hop.host.clone(), hop.port))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    endpoints.push(NativeSessionTreeConnectEndpoint::new(
        config.host.clone(),
        config.port,
    ));
    endpoints
}

pub(super) fn prepare_proxy_chain_test_config(config: &mut SshConfig) {
    config.strict_host_key_checking = true;
    config.trust_host_key = Some(false);
    config.expected_host_key_fingerprint = None;

    if let Some(chain) = config.proxy_chain.as_mut() {
        for hop in chain {
            hop.strict_host_key_checking = true;
            hop.trust_host_key = Some(false);
            hop.expected_host_key_fingerprint = None;
        }
    }
}

pub(super) fn prepare_tree_connect_config(config: &mut SshConfig) -> Result<(), String> {
    // Tauri resolves `default_key` to the first existing default key before
    // adding/connecting SessionTree nodes, while test_connection keeps its own
    // dynamic loader. Native mirrors that split here.
    resolve_default_key_for_tree_auth(&mut config.auth)?;
    if let Some(chain) = config.proxy_chain.as_mut() {
        for hop in chain {
            resolve_default_key_for_tree_auth(&mut hop.auth)?;
        }
    }
    Ok(())
}

pub(super) fn resolve_default_key_for_tree_auth(auth: &mut AuthMethod) -> Result<(), String> {
    match auth {
        AuthMethod::Key { key_path, .. } if key_path.trim().is_empty() => {
            *key_path = first_available_default_key_path().map_err(|error| error.to_string())?;
            Ok(())
        }
        _ => Ok(()),
    }
}

pub(super) fn auth_method_from_proxy_hop(hop: &NewConnectionProxyHop) -> AuthMethod {
    match hop.auth_tab {
        SshAuthTab::Password => AuthMethod::password_secret(zeroizing_secret_clone(&hop.password)),
        SshAuthTab::DefaultKey => {
            AuthMethod::key_secret("", zeroizing_non_empty_secret(&hop.passphrase))
        }
        SshAuthTab::SshKey => AuthMethod::key_secret(
            hop.key_path.trim().to_string(),
            zeroizing_non_empty_secret(&hop.passphrase),
        ),
        SshAuthTab::ManagedKey => AuthMethod::managed_key_secret(
            hop.managed_key_id.trim().to_string(),
            zeroizing_non_empty_secret(&hop.passphrase),
        ),
        SshAuthTab::Certificate => AuthMethod::certificate_secret(
            hop.key_path.trim().to_string(),
            hop.cert_path.trim().to_string(),
            zeroizing_non_empty_secret(&hop.passphrase),
        ),
        SshAuthTab::Agent => AuthMethod::Agent,
        SshAuthTab::TwoFactor => AuthMethod::KeyboardInteractive,
    }
}

pub(super) fn form_from_runtime_config(
    config: &SshConfig,
    title: Option<&str>,
    default_group: String,
) -> NewConnectionForm {
    let auth_fields = runtime_auth_form_fields(&config.auth);
    let mut form = NewConnectionForm {
        name: title
            .filter(|title| !title.trim().is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| format!("{}@{}", config.username, config.host)),
        host: config.host.clone(),
        port: config.port.to_string(),
        username: config.username.clone(),
        auth_tab: auth_fields.auth_tab,
        password: auth_fields.password,
        key_path: auth_fields.key_path,
        managed_key_id: auth_fields.managed_key_id,
        cert_path: auth_fields.cert_path,
        passphrase: auth_fields.passphrase,
        group: default_group,
        post_connect_command: config.post_connect_command.clone().unwrap_or_default(),
        agent_forwarding: config.agent_forwarding,
        legacy_ssh_compatibility: config.legacy_ssh_compatibility,
        save_password: auth_fields.save_password,
        ..NewConnectionForm::default()
    };

    if let Some(chain) = &config.proxy_chain {
        form.proxy_hops = chain
            .iter()
            .cloned()
            .map(proxy_hop_form_from_runtime_config)
            .collect();
        form.proxy_chain_expanded = !form.proxy_hops.is_empty();
    }
    if let Some(proxy) = &config.upstream_proxy {
        form.upstream_proxy_policy = NewConnectionUpstreamProxyPolicy::Custom;
        form.upstream_proxy_protocol = match proxy.protocol {
            UpstreamProxyProtocol::Socks5 => SavedUpstreamProxyProtocol::Socks5,
            UpstreamProxyProtocol::HttpConnect => SavedUpstreamProxyProtocol::HttpConnect,
        };
        form.upstream_proxy_host = proxy.host.clone();
        form.upstream_proxy_port = proxy.port.to_string();
        form.upstream_proxy_remote_dns = proxy.remote_dns;
        form.upstream_proxy_no_proxy = proxy.no_proxy.clone();
        if let UpstreamProxyAuth::Password { username, password } = &proxy.auth {
            form.upstream_proxy_auth = NewConnectionUpstreamProxyAuth::Password;
            form.upstream_proxy_username = username.clone();
            form.upstream_proxy_password = password.as_str().to_string();
        }
    }
    form
}

pub(super) fn proxy_hop_form_from_runtime_config(config: ProxyHopConfig) -> NewConnectionProxyHop {
    let auth_fields = runtime_auth_form_fields(&config.auth);
    NewConnectionProxyHop {
        saved_connection_id: String::new(),
        host: config.host,
        port: config.port.to_string(),
        username: config.username,
        auth_tab: auth_fields.auth_tab,
        key_path: auth_fields.key_path,
        managed_key_id: auth_fields.managed_key_id,
        cert_path: auth_fields.cert_path,
        // Dynamic drill-down save-as must persist a usable proxy chain. Runtime
        // secrets are copied only after the user explicitly asks to save this
        // live path; the connection store then moves them into the keychain.
        password: auth_fields.password,
        passphrase: auth_fields.passphrase,
        agent_forwarding: config.agent_forwarding,
        legacy_ssh_compatibility: config.legacy_ssh_compatibility,
    }
}

struct RuntimeAuthFormFields {
    auth_tab: SshAuthTab,
    password: String,
    key_path: String,
    managed_key_id: String,
    cert_path: String,
    passphrase: String,
    save_password: bool,
}

fn runtime_auth_form_fields(auth: &AuthMethod) -> RuntimeAuthFormFields {
    match auth {
        AuthMethod::Password { password } => RuntimeAuthFormFields {
            auth_tab: SshAuthTab::Password,
            password: password.as_str().to_string(),
            key_path: String::new(),
            managed_key_id: String::new(),
            cert_path: String::new(),
            passphrase: String::new(),
            save_password: true,
        },
        AuthMethod::Key {
            key_path,
            passphrase,
        } if key_path.trim().is_empty() => RuntimeAuthFormFields {
            auth_tab: SshAuthTab::DefaultKey,
            password: String::new(),
            key_path: String::new(),
            managed_key_id: String::new(),
            cert_path: String::new(),
            passphrase: passphrase
                .as_ref()
                .map(|value| value.as_str().to_string())
                .unwrap_or_default(),
            save_password: false,
        },
        AuthMethod::Key {
            key_path,
            passphrase,
        } => RuntimeAuthFormFields {
            auth_tab: SshAuthTab::SshKey,
            password: String::new(),
            key_path: key_path.clone(),
            managed_key_id: String::new(),
            cert_path: String::new(),
            passphrase: passphrase
                .as_ref()
                .map(|value| value.as_str().to_string())
                .unwrap_or_default(),
            save_password: false,
        },
        AuthMethod::ManagedKey { key_id, passphrase } => RuntimeAuthFormFields {
            auth_tab: SshAuthTab::ManagedKey,
            password: String::new(),
            key_path: String::new(),
            managed_key_id: key_id.clone(),
            cert_path: String::new(),
            passphrase: passphrase
                .as_ref()
                .map(|value| value.as_str().to_string())
                .unwrap_or_default(),
            save_password: false,
        },
        AuthMethod::Certificate {
            key_path,
            cert_path,
            passphrase,
        } => RuntimeAuthFormFields {
            auth_tab: SshAuthTab::Certificate,
            password: String::new(),
            key_path: key_path.clone(),
            managed_key_id: String::new(),
            cert_path: cert_path.clone(),
            passphrase: passphrase
                .as_ref()
                .map(|value| value.as_str().to_string())
                .unwrap_or_default(),
            save_password: false,
        },
        AuthMethod::Agent => RuntimeAuthFormFields {
            auth_tab: SshAuthTab::Agent,
            password: String::new(),
            key_path: String::new(),
            managed_key_id: String::new(),
            cert_path: String::new(),
            passphrase: String::new(),
            save_password: false,
        },
        AuthMethod::KeyboardInteractive => RuntimeAuthFormFields {
            auth_tab: SshAuthTab::TwoFactor,
            password: String::new(),
            key_path: String::new(),
            managed_key_id: String::new(),
            cert_path: String::new(),
            passphrase: String::new(),
            save_password: false,
        },
    }
}

#[cfg(test)]
mod runtime_save_tests {
    use super::*;
    use zeroize::Zeroizing;

    #[test]
    fn runtime_proxy_hop_form_preserves_password_for_save_as() {
        let hop = proxy_hop_form_from_runtime_config(ProxyHopConfig {
            host: "jump.example.com".to_string(),
            port: 22,
            username: "ops".to_string(),
            auth: AuthMethod::password_secret(Zeroizing::new("jump-secret".to_string())),
            agent_forwarding: true,
            legacy_ssh_compatibility: true,
            strict_host_key_checking: true,
            trust_host_key: None,
            expected_host_key_fingerprint: None,
        });

        assert_eq!(hop.auth_tab, SshAuthTab::Password);
        assert_eq!(hop.password, "jump-secret");
        assert!(hop.agent_forwarding);
        assert!(hop.legacy_ssh_compatibility);
    }

    #[test]
    fn runtime_proxy_hop_form_preserves_key_passphrase_for_save_as() {
        let hop = proxy_hop_form_from_runtime_config(ProxyHopConfig {
            host: "jump.example.com".to_string(),
            port: 22,
            username: "ops".to_string(),
            auth: AuthMethod::key_secret(
                "/home/ops/.ssh/id_ed25519",
                Some(Zeroizing::new("key-secret".to_string())),
            ),
            agent_forwarding: false,
            legacy_ssh_compatibility: false,
            strict_host_key_checking: true,
            trust_host_key: None,
            expected_host_key_fingerprint: None,
        });

        assert_eq!(hop.auth_tab, SshAuthTab::SshKey);
        assert_eq!(hop.key_path, "/home/ops/.ssh/id_ed25519");
        assert_eq!(hop.passphrase, "key-secret");
    }

    #[test]
    fn runtime_target_form_marks_password_for_persistence() {
        let form = form_from_runtime_config(
            &SshConfig {
                host: "target.example.com".to_string(),
                port: 22,
                username: "deploy".to_string(),
                auth: AuthMethod::password_secret(Zeroizing::new("target-secret".to_string())),
                ..SshConfig::default()
            },
            None,
            "Ungrouped".to_string(),
        );

        assert_eq!(form.auth_tab, SshAuthTab::Password);
        assert_eq!(form.password, "target-secret");
        assert!(form.save_password);
    }

    #[test]
    fn runtime_form_preserves_upstream_proxy_password_for_save_as() {
        let form = form_from_runtime_config(
            &SshConfig {
                host: "target.example.com".to_string(),
                port: 22,
                username: "deploy".to_string(),
                auth: AuthMethod::Agent,
                upstream_proxy: Some(oxideterm_ssh::UpstreamProxyConfig {
                    protocol: UpstreamProxyProtocol::Socks5,
                    host: "127.0.0.1".to_string(),
                    port: 1080,
                    auth: UpstreamProxyAuth::Password {
                        username: "proxy-user".to_string(),
                        password: Zeroizing::new("proxy-secret".to_string()),
                    },
                    remote_dns: true,
                    no_proxy: String::new(),
                }),
                ..SshConfig::default()
            },
            None,
            "Ungrouped".to_string(),
        );

        assert_eq!(
            form.upstream_proxy_auth,
            NewConnectionUpstreamProxyAuth::Password
        );
        assert_eq!(form.upstream_proxy_username, "proxy-user");
        assert_eq!(form.upstream_proxy_password, "proxy-secret");
    }

    #[test]
    fn saved_connection_title_sync_updates_only_matching_nodes() {
        let mut nodes = HashMap::from([
            (
                NodeId::new("node-home"),
                WorkspaceSshNode {
                    saved_connection_id: Some("home".to_string()),
                    config: SshConfig {
                        host: "100.118.61.75".to_string(),
                        ..SshConfig::default()
                    },
                    title: "Old Home".to_string(),
                    terminal_ids: Vec::new(),
                    readiness: NodeReadiness::Ready,
                },
            ),
            (
                NodeId::new("node-prod"),
                WorkspaceSshNode {
                    saved_connection_id: Some("prod".to_string()),
                    config: SshConfig {
                        host: "prod.example.com".to_string(),
                        ..SshConfig::default()
                    },
                    title: "Production".to_string(),
                    terminal_ids: Vec::new(),
                    readiness: NodeReadiness::Ready,
                },
            ),
        ]);

        assert!(sync_saved_connection_node_title_for_nodes(
            &mut nodes,
            "home",
            "Renamed Home"
        ));

        let home = nodes.get(&NodeId::new("node-home")).unwrap();
        let prod = nodes.get(&NodeId::new("node-prod")).unwrap();
        assert_eq!(home.title, "Renamed Home");
        assert_eq!(home.config.host, "100.118.61.75");
        assert_eq!(prod.title, "Production");
    }

    #[test]
    fn raw_tcp_form_config_maps_protocol_options_to_terminal_runtime() {
        let config = raw_tcp_session_config_from_form(
            "device.local".to_string(),
            443,
            oxideterm_connections::RawTcpLineEnding::Lf,
            oxideterm_connections::RawTcpDisplayMode::Mixed,
            oxideterm_connections::RawTcpSendMode::Hex,
            oxideterm_connections::RawTcpTlsMode::Enabled,
            oxideterm_connections::RawTcpTlsVerification::AllowInvalidCertificates,
            Some("device-tls.local".to_string()),
        );

        assert_eq!(config.host, "device.local");
        assert_eq!(config.port, 443);
        assert_eq!(config.line_ending, RawTcpLineEnding::Lf);
        assert_eq!(config.display_mode, RawTcpDisplayMode::Mixed);
        assert_eq!(config.send_mode, RawTcpSendMode::Hex);
        assert!(config.tls.enabled);
        assert_eq!(
            config.tls.verification,
            RawTcpTlsVerification::AllowInvalidCertificates
        );
        assert_eq!(config.tls.server_name.as_deref(), Some("device-tls.local"));
    }

    #[test]
    fn raw_tcp_profile_editor_form_preserves_saved_options() {
        let now = chrono::Utc::now();
        let profile = RawTcpProfile {
            id: "raw-tcp-1".to_string(),
            name: "Lab console".to_string(),
            group: Some("Lab".to_string()),
            host: "device.local".to_string(),
            port: 443,
            line_ending: oxideterm_connections::RawTcpLineEnding::None,
            display_mode: oxideterm_connections::RawTcpDisplayMode::Mixed,
            send_mode: oxideterm_connections::RawTcpSendMode::Hex,
            tls_mode: oxideterm_connections::RawTcpTlsMode::Enabled,
            tls_verification:
                oxideterm_connections::RawTcpTlsVerification::AllowInvalidCertificates,
            tls_server_name: Some("device-tls.local".to_string()),
            connect_on_open: false,
            created_at: now,
            updated_at: now,
            last_used_at: None,
        };

        let form = form_from_raw_tcp_profile(&profile, "Ungrouped".to_string());

        assert_eq!(form.transport, NewConnectionTransport::RawTcp);
        assert_eq!(form.raw_tcp_profile_name, "Lab console");
        assert_eq!(form.host, "device.local");
        assert_eq!(form.port, "443");
        assert_eq!(form.group, "Lab");
        assert_eq!(form.raw_tcp_line_ending, profile.line_ending);
        assert_eq!(form.raw_tcp_display_mode, profile.display_mode);
        assert_eq!(form.raw_tcp_send_mode, profile.send_mode);
        assert_eq!(form.raw_tcp_tls_mode, profile.tls_mode);
        assert_eq!(form.raw_tcp_tls_verification, profile.tls_verification);
        assert_eq!(form.raw_tcp_tls_server_name, "device-tls.local");
    }

    #[test]
    fn raw_tcp_save_request_maps_form_options() {
        let form = NewConnectionForm {
            raw_tcp_profile_name: "Lab console".to_string(),
            group: "Lab".to_string(),
            raw_tcp_line_ending: oxideterm_connections::RawTcpLineEnding::Lf,
            raw_tcp_display_mode: oxideterm_connections::RawTcpDisplayMode::Mixed,
            raw_tcp_send_mode: oxideterm_connections::RawTcpSendMode::Hex,
            raw_tcp_tls_mode: oxideterm_connections::RawTcpTlsMode::Enabled,
            raw_tcp_tls_verification:
                oxideterm_connections::RawTcpTlsVerification::AllowInvalidCertificates,
            ..NewConnectionForm::default()
        };

        let request = raw_tcp_save_request_from_form(
            &form,
            Some("raw-tcp-1".to_string()),
            "device.local",
            443,
            Some("device-tls.local".to_string()),
            &oxideterm_i18n::I18n::default(),
        );

        assert_eq!(request.id.as_deref(), Some("raw-tcp-1"));
        assert_eq!(request.name, "Lab console");
        assert_eq!(request.group.as_deref(), Some("Lab"));
        assert_eq!(request.host, "device.local");
        assert_eq!(request.port, 443);
        assert_eq!(request.line_ending, Some(form.raw_tcp_line_ending));
        assert_eq!(request.display_mode, Some(form.raw_tcp_display_mode));
        assert_eq!(request.send_mode, Some(form.raw_tcp_send_mode));
        assert_eq!(request.tls_mode, Some(form.raw_tcp_tls_mode));
        assert_eq!(
            request.tls_verification,
            Some(form.raw_tcp_tls_verification)
        );
        assert_eq!(request.tls_server_name.as_deref(), Some("device-tls.local"));
    }

    #[test]
    fn raw_udp_form_config_maps_datagram_options_to_terminal_runtime() {
        let config = raw_udp_session_config_from_form(
            "metrics.local".to_string(),
            8125,
            Some("127.0.0.1".to_string()),
            0,
            oxideterm_connections::RawUdpLineEnding::None,
            oxideterm_connections::RawUdpDisplayMode::Mixed,
            oxideterm_connections::RawUdpSendMode::Hex,
        );

        assert_eq!(config.remote_host, "metrics.local");
        assert_eq!(config.remote_port, 8125);
        assert_eq!(config.local_bind_host.as_deref(), Some("127.0.0.1"));
        assert_eq!(config.local_bind_port, 0);
        assert_eq!(config.line_ending, RawUdpLineEnding::None);
        assert_eq!(config.display_mode, RawUdpDisplayMode::Mixed);
        assert_eq!(config.send_mode, RawUdpSendMode::Hex);
    }

    #[test]
    fn raw_udp_profile_editor_form_preserves_saved_options() {
        let now = chrono::Utc::now();
        let profile = RawUdpProfile {
            id: "raw-udp-1".to_string(),
            name: "StatsD".to_string(),
            group: Some("Lab".to_string()),
            remote_host: "metrics.local".to_string(),
            remote_port: 8125,
            local_bind_host: Some("127.0.0.1".to_string()),
            local_bind_port: 0,
            line_ending: oxideterm_connections::RawUdpLineEnding::None,
            display_mode: oxideterm_connections::RawUdpDisplayMode::Mixed,
            send_mode: oxideterm_connections::RawUdpSendMode::Hex,
            connect_on_open: false,
            created_at: now,
            updated_at: now,
            last_used_at: None,
        };

        let form = form_from_raw_udp_profile(&profile, "Ungrouped".to_string());

        assert_eq!(form.transport, NewConnectionTransport::RawUdp);
        assert_eq!(form.raw_udp_profile_name, "StatsD");
        assert_eq!(form.host, "metrics.local");
        assert_eq!(form.port, "8125");
        assert_eq!(form.group, "Lab");
        assert_eq!(form.raw_udp_local_bind_host, "127.0.0.1");
        assert_eq!(form.raw_udp_local_bind_port, "0");
        assert_eq!(form.raw_udp_line_ending, profile.line_ending);
        assert_eq!(form.raw_udp_display_mode, profile.display_mode);
        assert_eq!(form.raw_udp_send_mode, profile.send_mode);
    }

    #[test]
    fn raw_udp_save_request_maps_form_options() {
        let form = NewConnectionForm {
            raw_udp_profile_name: "StatsD".to_string(),
            group: "Lab".to_string(),
            raw_udp_line_ending: oxideterm_connections::RawUdpLineEnding::None,
            raw_udp_display_mode: oxideterm_connections::RawUdpDisplayMode::Mixed,
            raw_udp_send_mode: oxideterm_connections::RawUdpSendMode::Hex,
            ..NewConnectionForm::default()
        };

        let request = raw_udp_save_request_from_form(
            &form,
            Some("raw-udp-1".to_string()),
            "metrics.local",
            8125,
            Some("127.0.0.1".to_string()),
            0,
            &oxideterm_i18n::I18n::default(),
        );

        assert_eq!(request.id.as_deref(), Some("raw-udp-1"));
        assert_eq!(request.name, "StatsD");
        assert_eq!(request.group.as_deref(), Some("Lab"));
        assert_eq!(request.remote_host, "metrics.local");
        assert_eq!(request.remote_port, 8125);
        assert_eq!(request.local_bind_host.as_deref(), Some("127.0.0.1"));
        assert_eq!(request.local_bind_port, Some(0));
        assert_eq!(request.line_ending, Some(form.raw_udp_line_ending));
        assert_eq!(request.display_mode, Some(form.raw_udp_display_mode));
        assert_eq!(request.send_mode, Some(form.raw_udp_send_mode));
    }
}

pub(super) fn serial_profile_name_or_port(name: &str, port_path: &str) -> String {
    let name = name.trim();
    if name.is_empty() {
        port_path.to_string()
    } else {
        name.to_string()
    }
}

pub(super) fn telnet_profile_name_or_endpoint(name: &str, host: &str, port: u16) -> String {
    let name = name.trim();
    if name.is_empty() {
        format!("{}:{}", host.trim(), port)
    } else {
        name.to_string()
    }
}

pub(super) fn raw_tcp_profile_name_or_endpoint(name: &str, host: &str, port: u16) -> String {
    let name = name.trim();
    if name.is_empty() {
        format!("{}:{}", host.trim(), port)
    } else {
        name.to_string()
    }
}

pub(super) fn raw_udp_profile_name_or_endpoint(name: &str, host: &str, port: u16) -> String {
    let name = name.trim();
    if name.is_empty() {
        format!("{}:{}", host.trim(), port)
    } else {
        name.to_string()
    }
}

pub(super) fn raw_tcp_save_request_from_form(
    form: &NewConnectionForm,
    profile_id: Option<String>,
    host: &str,
    port: u16,
    tls_server_name: Option<String>,
    i18n: &oxideterm_i18n::I18n,
) -> SaveRawTcpProfileRequest {
    SaveRawTcpProfileRequest {
        id: profile_id,
        name: raw_tcp_profile_name_or_endpoint(&form.raw_tcp_profile_name, host, port),
        group: serial_profile_group_from_form(&form.group, i18n),
        host: host.to_string(),
        port,
        line_ending: Some(form.raw_tcp_line_ending.clone()),
        display_mode: Some(form.raw_tcp_display_mode.clone()),
        send_mode: Some(form.raw_tcp_send_mode.clone()),
        tls_mode: Some(form.raw_tcp_tls_mode.clone()),
        tls_verification: Some(form.raw_tcp_tls_verification.clone()),
        tls_server_name,
        connect_on_open: None,
    }
}

pub(super) fn form_from_raw_tcp_profile(
    profile: &RawTcpProfile,
    ungrouped_label: String,
) -> NewConnectionForm {
    // Raw TCP profiles are edited through the shared connection modal, but they
    // must stay outside the SSH saved-connection edit path.
    NewConnectionForm {
        transport: NewConnectionTransport::RawTcp,
        host: profile.host.clone(),
        port: profile.port.to_string(),
        group: profile.group.clone().unwrap_or(ungrouped_label),
        raw_tcp_profile_name: profile.name.clone(),
        raw_tcp_line_ending: profile.line_ending.clone(),
        raw_tcp_display_mode: profile.display_mode.clone(),
        raw_tcp_send_mode: profile.send_mode.clone(),
        raw_tcp_tls_mode: profile.tls_mode.clone(),
        raw_tcp_tls_verification: profile.tls_verification.clone(),
        raw_tcp_tls_server_name: profile.tls_server_name.clone().unwrap_or_default(),
        focused_field: super::super::form_state::NewConnectionField::RawTcpProfileName,
        field_focused: true,
        save_connection: true,
        agent_available: detect_ssh_agent_available(),
        ..NewConnectionForm::default()
    }
}

pub(super) fn raw_udp_save_request_from_form(
    form: &NewConnectionForm,
    profile_id: Option<String>,
    remote_host: &str,
    remote_port: u16,
    local_bind_host: Option<String>,
    local_bind_port: u16,
    i18n: &oxideterm_i18n::I18n,
) -> SaveRawUdpProfileRequest {
    SaveRawUdpProfileRequest {
        id: profile_id,
        name: raw_udp_profile_name_or_endpoint(
            &form.raw_udp_profile_name,
            remote_host,
            remote_port,
        ),
        group: serial_profile_group_from_form(&form.group, i18n),
        remote_host: remote_host.to_string(),
        remote_port,
        local_bind_host,
        local_bind_port: Some(local_bind_port),
        line_ending: Some(form.raw_udp_line_ending.clone()),
        display_mode: Some(form.raw_udp_display_mode.clone()),
        send_mode: Some(form.raw_udp_send_mode.clone()),
        connect_on_open: None,
    }
}

pub(super) fn form_from_raw_udp_profile(
    profile: &RawUdpProfile,
    ungrouped_label: String,
) -> NewConnectionForm {
    // Raw UDP shares the connection modal shell but stores datagram-specific
    // settings separately from Raw TCP's stream/TLS options.
    NewConnectionForm {
        transport: NewConnectionTransport::RawUdp,
        host: profile.remote_host.clone(),
        port: profile.remote_port.to_string(),
        group: profile.group.clone().unwrap_or(ungrouped_label),
        raw_udp_profile_name: profile.name.clone(),
        raw_udp_local_bind_host: profile.local_bind_host.clone().unwrap_or_default(),
        raw_udp_local_bind_port: profile.local_bind_port.to_string(),
        raw_udp_line_ending: profile.line_ending.clone(),
        raw_udp_display_mode: profile.display_mode.clone(),
        raw_udp_send_mode: profile.send_mode.clone(),
        focused_field: super::super::form_state::NewConnectionField::RawUdpProfileName,
        field_focused: true,
        save_connection: true,
        agent_available: detect_ssh_agent_available(),
        ..NewConnectionForm::default()
    }
}

pub(super) fn raw_tcp_session_config_from_form(
    host: String,
    port: u16,
    line_ending: oxideterm_connections::RawTcpLineEnding,
    display_mode: oxideterm_connections::RawTcpDisplayMode,
    send_mode: oxideterm_connections::RawTcpSendMode,
    tls_mode: oxideterm_connections::RawTcpTlsMode,
    tls_verification: oxideterm_connections::RawTcpTlsVerification,
    tls_server_name: Option<String>,
) -> RawTcpSessionConfig {
    RawTcpSessionConfig {
        host,
        port,
        line_ending: terminal_raw_tcp_line_ending(&line_ending),
        display_mode: terminal_raw_tcp_display_mode(&display_mode),
        send_mode: terminal_raw_tcp_send_mode(&send_mode),
        tls: RawTcpTlsConfig {
            enabled: matches!(tls_mode, oxideterm_connections::RawTcpTlsMode::Enabled),
            verification: terminal_raw_tcp_tls_verification(&tls_verification),
            server_name: tls_server_name,
        },
    }
}

pub(super) fn raw_udp_session_config_from_form(
    remote_host: String,
    remote_port: u16,
    local_bind_host: Option<String>,
    local_bind_port: u16,
    line_ending: oxideterm_connections::RawUdpLineEnding,
    display_mode: oxideterm_connections::RawUdpDisplayMode,
    send_mode: oxideterm_connections::RawUdpSendMode,
) -> RawUdpSessionConfig {
    RawUdpSessionConfig {
        remote_host,
        remote_port,
        local_bind_host,
        local_bind_port,
        line_ending: terminal_raw_udp_line_ending(&line_ending),
        display_mode: terminal_raw_udp_display_mode(&display_mode),
        send_mode: terminal_raw_udp_send_mode(&send_mode),
    }
}

pub(super) fn terminal_raw_tcp_line_ending(
    line_ending: &oxideterm_connections::RawTcpLineEnding,
) -> RawTcpLineEnding {
    match line_ending {
        oxideterm_connections::RawTcpLineEnding::Lf => RawTcpLineEnding::Lf,
        oxideterm_connections::RawTcpLineEnding::CrLf => RawTcpLineEnding::CrLf,
        oxideterm_connections::RawTcpLineEnding::Cr => RawTcpLineEnding::Cr,
        oxideterm_connections::RawTcpLineEnding::None => RawTcpLineEnding::None,
    }
}

pub(super) fn terminal_raw_tcp_display_mode(
    display_mode: &oxideterm_connections::RawTcpDisplayMode,
) -> RawTcpDisplayMode {
    match display_mode {
        oxideterm_connections::RawTcpDisplayMode::Text => RawTcpDisplayMode::Text,
        oxideterm_connections::RawTcpDisplayMode::Hex => RawTcpDisplayMode::Hex,
        oxideterm_connections::RawTcpDisplayMode::Mixed => RawTcpDisplayMode::Mixed,
    }
}

pub(super) fn terminal_raw_tcp_send_mode(
    send_mode: &oxideterm_connections::RawTcpSendMode,
) -> RawTcpSendMode {
    match send_mode {
        oxideterm_connections::RawTcpSendMode::Text => RawTcpSendMode::Text,
        oxideterm_connections::RawTcpSendMode::Hex => RawTcpSendMode::Hex,
    }
}

pub(super) fn terminal_raw_udp_line_ending(
    line_ending: &oxideterm_connections::RawUdpLineEnding,
) -> RawUdpLineEnding {
    match line_ending {
        oxideterm_connections::RawUdpLineEnding::Lf => RawUdpLineEnding::Lf,
        oxideterm_connections::RawUdpLineEnding::CrLf => RawUdpLineEnding::CrLf,
        oxideterm_connections::RawUdpLineEnding::Cr => RawUdpLineEnding::Cr,
        oxideterm_connections::RawUdpLineEnding::None => RawUdpLineEnding::None,
    }
}

pub(super) fn terminal_raw_udp_display_mode(
    display_mode: &oxideterm_connections::RawUdpDisplayMode,
) -> RawUdpDisplayMode {
    match display_mode {
        oxideterm_connections::RawUdpDisplayMode::Text => RawUdpDisplayMode::Text,
        oxideterm_connections::RawUdpDisplayMode::Hex => RawUdpDisplayMode::Hex,
        oxideterm_connections::RawUdpDisplayMode::Mixed => RawUdpDisplayMode::Mixed,
    }
}

pub(super) fn terminal_raw_udp_send_mode(
    send_mode: &oxideterm_connections::RawUdpSendMode,
) -> RawUdpSendMode {
    match send_mode {
        oxideterm_connections::RawUdpSendMode::Text => RawUdpSendMode::Text,
        oxideterm_connections::RawUdpSendMode::Hex => RawUdpSendMode::Hex,
    }
}

pub(super) fn terminal_raw_tcp_tls_verification(
    verification: &oxideterm_connections::RawTcpTlsVerification,
) -> RawTcpTlsVerification {
    match verification {
        oxideterm_connections::RawTcpTlsVerification::System => RawTcpTlsVerification::System,
        oxideterm_connections::RawTcpTlsVerification::AllowInvalidCertificates => {
            RawTcpTlsVerification::AllowInvalidCertificates
        }
    }
}

pub(super) fn remote_desktop_protocol_for_transport(
    transport: NewConnectionTransport,
) -> Option<RemoteDesktopProtocol> {
    match transport {
        NewConnectionTransport::Rdp => Some(RemoteDesktopProtocol::Rdp),
        NewConnectionTransport::Vnc => Some(RemoteDesktopProtocol::Vnc),
        _ => None,
    }
}

pub(super) fn remote_desktop_profile_label(
    name: &str,
    protocol: RemoteDesktopProtocol,
    host: &str,
    port: u16,
) -> String {
    let name = name.trim();
    if name.is_empty() {
        format!(
            "{}://{}:{port}",
            protocol.provider_id(),
            remote_desktop_label_host(host)
        )
    } else {
        name.to_string()
    }
}

pub(super) fn remote_desktop_label_host(host: &str) -> String {
    if host.contains(':') && !host.starts_with('[') {
        // Keep IPv6 endpoint labels parseable when shown in tab titles.
        format!("[{host}]")
    } else {
        host.to_string()
    }
}

pub(super) fn serial_profile_group_from_form(
    group: &str,
    i18n: &oxideterm_i18n::I18n,
) -> Option<String> {
    let group = group.trim();
    if group.is_empty()
        || group == "Ungrouped"
        || group == "未分组"
        || group == i18n.t("ssh.form.ungrouped")
        || group == i18n.t("sessionManager.edit_properties.ungrouped")
    {
        None
    } else {
        Some(group.to_string())
    }
}

pub(super) fn serial_profile_parity_from_terminal(
    parity: oxideterm_terminal::SerialParity,
) -> oxideterm_connections::SerialParity {
    match parity {
        oxideterm_terminal::SerialParity::None => oxideterm_connections::SerialParity::None,
        oxideterm_terminal::SerialParity::Odd => oxideterm_connections::SerialParity::Odd,
        oxideterm_terminal::SerialParity::Even => oxideterm_connections::SerialParity::Even,
    }
}

pub(super) fn serial_profile_flow_from_terminal(
    flow: oxideterm_terminal::SerialFlowControl,
) -> oxideterm_connections::SerialFlowControl {
    match flow {
        oxideterm_terminal::SerialFlowControl::None => {
            oxideterm_connections::SerialFlowControl::None
        }
        oxideterm_terminal::SerialFlowControl::Software => {
            oxideterm_connections::SerialFlowControl::Software
        }
        oxideterm_terminal::SerialFlowControl::Hardware => {
            oxideterm_connections::SerialFlowControl::Hardware
        }
    }
}

pub(super) fn zeroizing_secret_clone(value: &str) -> zeroize::Zeroizing<String> {
    zeroize::Zeroizing::new(value.to_string())
}

pub(super) fn zeroizing_non_empty_secret(value: &str) -> Option<zeroize::Zeroizing<String>> {
    (!value.is_empty()).then(|| zeroizing_secret_clone(value))
}

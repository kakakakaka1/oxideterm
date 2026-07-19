fn oxideterm_terminal_env(config: &LocalPtyConfig, _shell: &ShellInfo) -> HashMap<String, String> {
    let mut terminal_env = HashMap::from([
        ("OXIDETERM_TERM".to_string(), "true".to_string()),
        ("TERM".to_string(), "xterm-256color".to_string()),
        ("TERM_PROGRAM".to_string(), "oxideterm".to_string()),
        (
            "TERM_PROGRAM_VERSION".to_string(),
            env!("CARGO_PKG_VERSION").to_string(),
        ),
        ("COLORTERM".to_string(), "truecolor".to_string()),
    ]);

    #[cfg(target_os = "macos")]
    {
        let lang = env::var("LANG").unwrap_or_default();
        if lang.is_empty() || lang == "C" || lang == "POSIX" {
            let detected = std::process::Command::new("defaults")
                .args(["read", ".GlobalPreferences", "AppleLocale"])
                .output()
                .ok()
                .and_then(|output| {
                    output
                        .status
                        .success()
                        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
                })
                .filter(|locale| !locale.is_empty())
                .map(|locale| format!("{locale}.UTF-8"))
                .unwrap_or_else(|| "en_US.UTF-8".to_string());
            terminal_env.insert("LANG".to_string(), detected.clone());
            terminal_env.insert("LC_ALL".to_string(), detected);
        }
    }

    #[cfg(unix)]
    if let Ok(mut path) = env::var("PATH") {
        for additional in ["/usr/local/bin", "/usr/local/sbin", "/opt/homebrew/bin"] {
            if !path.contains(additional) && std::path::Path::new(additional).exists() {
                path.push(':');
                path.push_str(additional);
            }
        }
        terminal_env.insert("PATH".to_string(), path);
    }

    #[cfg(target_os = "windows")]
    {
        terminal_env.insert("PYTHONIOENCODING".to_string(), "utf-8".to_string());
        terminal_env.insert("TERM_PROGRAM".to_string(), "OxideTerm".to_string());
        if _shell.id.starts_with("wsl") {
            terminal_env.insert("WSL_UTF8".to_string(), "1".to_string());
            let mut wslenv_vars = vec!["TERM", "COLORTERM", "TERM_PROGRAM", "TERM_PROGRAM_VERSION"];
            if config.oh_my_posh_enabled {
                if let Some(theme) = config
                    .oh_my_posh_theme
                    .as_deref()
                    .filter(|theme| !theme.is_empty())
                {
                    terminal_env.insert("POSH_THEME".to_string(), theme.to_string());
                    wslenv_vars.push("POSH_THEME/p");
                }
            }
            terminal_env.insert("WSLENV".to_string(), wslenv_vars.join(":"));
        } else if config.oh_my_posh_enabled {
            if let Some(theme) = config
                .oh_my_posh_theme
                .as_deref()
                .filter(|theme| !theme.is_empty())
            {
                terminal_env.insert("POSH_THEME".to_string(), theme.to_string());
            }
        }
    }

    terminal_env.extend(config.env.clone());
    terminal_env
}

#[cfg(any(target_os = "windows", test))]
fn powershell_profile_loader() -> &'static str {
    // PowerShell's host-dependent startup path is unreliable when a PTY also
    // supplies -Command. Load each standard profile explicitly and only once.
    "$__oxideterm_profiles = @($PROFILE.AllUsersAllHosts, $PROFILE.AllUsersCurrentHost, $PROFILE.CurrentUserAllHosts, $PROFILE.CurrentUserCurrentHost) | Where-Object { $_ } | Select-Object -Unique; foreach ($__oxideterm_profile in $__oxideterm_profiles) { if (Test-Path -LiteralPath $__oxideterm_profile) { . $__oxideterm_profile } }; Remove-Variable -Name __oxideterm_profile, __oxideterm_profiles -ErrorAction SilentlyContinue"
}

#[cfg(any(target_os = "windows", test))]
fn powershell_init_args(config: &LocalPtyConfig, shell: &ShellInfo) -> Option<Vec<String>> {
    if !matches!(shell.id.as_str(), "powershell" | "pwsh") {
        return None;
    }

    let mut init_parts = Vec::new();
    if config.load_profile {
        init_parts.push(powershell_profile_loader().to_string());
    }
    init_parts.push(
        "try { [Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}".to_string(),
    );

    if config.oh_my_posh_enabled {
        let omp = if let Some(theme) = config
            .oh_my_posh_theme
            .as_deref()
            .filter(|theme| !theme.is_empty())
        {
            format!(
                "if (Get-Command oh-my-posh -ErrorAction SilentlyContinue) {{ oh-my-posh init pwsh --config '{}' | Invoke-Expression }}",
                theme.replace('\'', "''")
            )
        } else {
            "if (Get-Command oh-my-posh -ErrorAction SilentlyContinue) { oh-my-posh init pwsh | Invoke-Expression }".to_string()
        };
        init_parts.push(omp);
    }

    init_parts.push("Clear-Host".to_string());
    // PowerShell -LiteralPath does not expand "$HOME"; resolve the default cwd
    // before building the initialization command.
    let cwd = config
        .cwd
        .as_ref()
        .cloned()
        .or_else(|| std::env::var_os("HOME").map(std::path::PathBuf::from))
        .or_else(|| std::env::var_os("USERPROFILE").map(std::path::PathBuf::from))
        .or_else(|| std::env::current_dir().ok())
        .map(|path| path.display().to_string())
        .unwrap_or_else(|| ".".to_string())
        .replace('\'', "''");
    init_parts.push(format!("Set-Location -LiteralPath '{cwd}'"));

    // Prevent PowerShell from loading a host-dependent subset before the
    // deterministic loader above sources the configured profiles exactly once.
    let mut args = shell_args_for_profile(shell, false);
    args.push("-Command".to_string());
    args.push(init_parts.join("; "));
    Some(args)
}

fn focus_report_sequence(enabled: bool, focused: bool) -> Option<&'static [u8]> {
    enabled.then_some(if focused { b"\x1b[I" } else { b"\x1b[O" })
}

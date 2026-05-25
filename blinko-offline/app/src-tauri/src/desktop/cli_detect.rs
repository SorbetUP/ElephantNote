use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct CliBinaryInfo {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiCliDetectResult {
    pub codex: CliBinaryInfo,
    pub claude: CliBinaryInfo,
}

fn home_dir() -> Option<PathBuf> {
    if let Ok(h) = std::env::var("HOME") {
        if !h.trim().is_empty() {
            return Some(PathBuf::from(h));
        }
    }
    if let Ok(h) = std::env::var("USERPROFILE") {
        if !h.trim().is_empty() {
            return Some(PathBuf::from(h));
        }
    }
    None
}

fn split_path_env() -> Vec<PathBuf> {
    let Some(paths) = std::env::var_os("PATH") else {
        return Vec::new();
    };
    std::env::split_paths(&paths).collect()
}

fn common_bin_dirs() -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();

    // These directories are often missing from PATH for GUI apps on macOS.
    if cfg!(target_os = "macos") {
        out.push(PathBuf::from("/opt/homebrew/bin"));
        out.push(PathBuf::from("/usr/local/bin"));
        out.push(PathBuf::from("/usr/bin"));
        out.push(PathBuf::from("/bin"));
        out.push(PathBuf::from("/opt/local/bin")); // MacPorts
    } else if cfg!(target_os = "linux") {
        out.push(PathBuf::from("/usr/local/bin"));
        out.push(PathBuf::from("/usr/bin"));
        out.push(PathBuf::from("/bin"));
        out.push(PathBuf::from("/snap/bin"));
    }

    if let Some(home) = home_dir() {
        // bun installs shims here by default
        out.push(home.join(".bun/bin"));
        // common user bins
        out.push(home.join(".local/bin"));
        out.push(home.join("bin"));
        out.push(home.join(".cargo/bin"));

        // common JS toolchain shims
        out.push(home.join(".volta/bin"));
        out.push(home.join(".asdf/shims"));
        out.push(home.join(".npm-global/bin"));
        out.push(home.join(".npm-packages/bin"));
        out.push(home.join(".yarn/bin"));
        out.push(home.join(".yarn/global/node_modules/.bin"));
        out.push(home.join(".local/share/pnpm"));
        out.push(home.join(".local/share/pnpm/global/5/node_modules/.bin"));
        out.push(home.join("Library/pnpm")); // macOS pnpm home

        // nvm per-version bins (macOS GUI apps often miss these from PATH)
        let nvm_node = home.join(".nvm/versions/node");
        if let Ok(rd) = std::fs::read_dir(&nvm_node) {
            for ent in rd.flatten() {
                let p = ent.path();
                if p.is_dir() {
                    out.push(p.join("bin"));
                }
            }
        }
    }

    out
}

fn candidate_filenames(base: &str) -> Vec<String> {
    if cfg!(windows) {
        // Windows PATH resolution may match cmd/bat shims.
        let mut out = Vec::new();
        out.push(format!("{base}.exe"));
        out.push(format!("{base}.cmd"));
        out.push(format!("{base}.bat"));
        out.push(base.to_string());
        out
    } else {
        vec![base.to_string()]
    }
}

fn is_probably_executable(path: &Path) -> bool {
    if !path.exists() || !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(md) = std::fs::metadata(path) {
            return (md.permissions().mode() & 0o111) != 0;
        }
    }
    true
}

fn find_in_path(base: &str) -> Option<PathBuf> {
    for dir in split_path_env().into_iter().chain(common_bin_dirs()) {
        for name in candidate_filenames(base) {
            let p = dir.join(&name);
            if is_probably_executable(&p) {
                return Some(p);
            }
        }
    }
    None
}

#[cfg(unix)]
fn extract_path_from_shell_output(text: &str) -> Option<PathBuf> {
    for line in text.lines() {
        let l = line.trim();
        if l.is_empty() {
            continue;
        }
        // `command -v` can sometimes print extra output (from shell init).
        // Scan tokens and pick the first executable-looking path.
        for tok in l.split_whitespace() {
            let t = tok.trim();
            if t.is_empty() {
                continue;
            }
            if t.starts_with("~/") {
                if let Some(home) = home_dir() {
                    let p = home.join(t.trim_start_matches("~/"));
                    if is_probably_executable(&p) {
                        return Some(p);
                    }
                }
            }
            if t.starts_with('/') {
                let p = PathBuf::from(t);
                if is_probably_executable(&p) {
                    return Some(p);
                }
            }
        }
    }
    None
}

#[cfg(unix)]
async fn resolve_with_shell(base: &str) -> Option<PathBuf> {
    // On macOS, GUI apps often have a truncated PATH. Using the user's shell as a login
    // shell tends to produce the PATH they actually use in Terminal.
    let mut shells: Vec<PathBuf> = Vec::new();
    if let Ok(s) = std::env::var("SHELL") {
        if !s.trim().is_empty() {
            shells.push(PathBuf::from(s));
        }
    }
    shells.push(PathBuf::from("/bin/zsh"));
    shells.push(PathBuf::from("/bin/bash"));
    shells.push(PathBuf::from("/bin/sh"));

    let cmd = format!("type -P {base} 2>/dev/null || command -v {base} 2>/dev/null");

    // Try both login and interactive-login shells. Many users set PATH in `.zshrc`.
    let arg_sets: &[&[&str]] = &[&["-lc"], &["-lic"]];

    for shell in shells {
        if !shell.exists() {
            continue;
        }

        for argset in arg_sets {
            let mut p = Command::new(&shell);
            p.args(*argset);
            p.arg(&cmd);
            p.stdin(std::process::Stdio::null());
            p.stdout(std::process::Stdio::piped());
            p.stderr(std::process::Stdio::null());

            let out = tokio::time::timeout(Duration::from_secs(3), p.output())
                .await
                .ok()?
                .ok()?;
            if !out.status.success() {
                continue;
            }
            let text = String::from_utf8_lossy(&out.stdout);
            if let Some(p) = extract_path_from_shell_output(&text) {
                return Some(p);
            }
        }
    }
    None
}

#[cfg(not(unix))]
async fn resolve_with_shell(_base: &str) -> Option<PathBuf> {
    None
}

fn find_first_existing(candidates: &[PathBuf]) -> Option<PathBuf> {
    for p in candidates {
        if is_probably_executable(p) {
            return Some(p.to_path_buf());
        }
    }
    None
}

async fn try_version(bin: &Path, args: &[&str]) -> Result<Option<String>, String> {
    let mut cmd = Command::new(bin);
    cmd.args(args);
    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let out = tokio::time::timeout(Duration::from_secs(3), cmd.output())
        .await
        .map_err(|_| "Timed out".to_string())?
        .map_err(|e| e.to_string())?;

    let mut text = String::new();
    if !out.stdout.is_empty() {
        text.push_str(&String::from_utf8_lossy(&out.stdout));
    }
    if text.trim().is_empty() && !out.stderr.is_empty() {
        text.push_str(&String::from_utf8_lossy(&out.stderr));
    }
    let line = text.lines().next().unwrap_or("").trim().to_string();
    Ok(if line.is_empty() { None } else { Some(line) })
}

async fn detect_one(name: &str, explicit_candidates: Vec<PathBuf>) -> CliBinaryInfo {
    let mut found_path = find_first_existing(&explicit_candidates).or_else(|| find_in_path(name));
    if found_path.is_none() {
        found_path = resolve_with_shell(name).await;
    }
    let Some(bin) = found_path else {
        return CliBinaryInfo {
            found: false,
            path: None,
            version: None,
            error: Some("Not found".to_string()),
        };
    };

    let version = match try_version(&bin, &["--version"]).await {
        Ok(v) if v.is_some() => v,
        _ => {
            // Some CLIs use `version` subcommand.
            try_version(&bin, &["version"]).await.ok().flatten()
        }
    };

    CliBinaryInfo {
        found: true,
        path: Some(bin.to_string_lossy().to_string()),
        version,
        error: None,
    }
}

#[tauri::command]
pub async fn detect_ai_cli_binaries() -> Result<AiCliDetectResult, String> {
    let mut claude_candidates = Vec::new();
    if let Some(home) = home_dir() {
        claude_candidates.push(home.join(".local/bin/claude"));
        claude_candidates.push(home.join(".local/bin/claude-code"));
        claude_candidates.push(home.join("bin/claude"));
        claude_candidates.push(home.join("bin/claude-code"));
        claude_candidates.push(home.join(".cargo/bin/claude"));
        claude_candidates.push(home.join(".cargo/bin/claude-code"));
    }

    let mut codex_candidates = Vec::new();
    if let Some(home) = home_dir() {
        codex_candidates.push(home.join(".local/bin/codex"));
        codex_candidates.push(home.join("bin/codex"));
        codex_candidates.push(home.join(".cargo/bin/codex"));
    }

    let codex = detect_one("codex", codex_candidates).await;
    let mut claude = detect_one("claude", claude_candidates).await;
    if !claude.found {
        // Some installs expose the CLI as `claude-code` instead of `claude`.
        claude = detect_one("claude-code", Vec::new()).await;
    }

    Ok(AiCliDetectResult { codex, claude })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    fn make_executable(path: &Path) {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(path).unwrap().permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(path, perms).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn extract_path_from_shell_output_handles_noise() {
        let p = std::env::temp_dir().join("blinko_cli_detect_test_bin");
        std::fs::write(&p, b"#!/bin/sh\necho ok\n").unwrap();
        make_executable(&p);

        let out = format!("Last login: Fri Feb  7 21:00:00 on ttys000\n{}\n", p.display());
        let found = extract_path_from_shell_output(&out).unwrap();
        assert_eq!(found, p);

        let _ = std::fs::remove_file(&p);
    }
}

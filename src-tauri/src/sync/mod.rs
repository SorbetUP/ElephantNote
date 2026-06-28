use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Serialize, Clone, Debug)]
pub struct GitStatus {
  pub initialized: bool,
  pub branch: Option<String>,
  pub dirty: bool,
  pub pending: u32,
  pub error: Option<String>,
}

pub struct GitSyncEngine;

impl GitSyncEngine {
  pub fn git(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
      .args(args)
      .current_dir(cwd)
      .output()
      .map_err(|e| format!("git spawn failed: {e}"))?;
    if output.status.success() {
      Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
      let stderr = String::from_utf8_lossy(&output.stderr).to_string();
      Err(format!("git {} failed: {stderr}", args.join(" ")))
    }
  }

  pub fn init(cwd: &Path) -> Result<(), String> {
    Self::git(cwd, &["init"])?;
    Ok(())
  }

  pub fn status(cwd: &Path) -> GitStatus {
    let initialized = cwd.join(".git").exists();
    if !initialized {
      return GitStatus {
        initialized: false,
        branch: None,
        dirty: false,
        pending: 0,
        error: None,
      };
    }
    let porcelain = Self::git(cwd, &["status", "--porcelain"]).unwrap_or_default();
    let branch = Self::git(cwd, &["branch", "--show-current"])
      .ok()
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty());
    let pending = porcelain.lines().filter(|l| !l.trim().is_empty()).count() as u32;
    GitStatus {
      initialized: true,
      branch,
      dirty: pending > 0,
      pending,
      error: None,
    }
  }

  pub fn commit_all(cwd: &Path, message: &str) -> Result<(), String> {
    Self::git(cwd, &["add", "-A"])?;
    let status = Self::git(cwd, &["status", "--porcelain"])?;
    if status.trim().is_empty() {
      return Ok(());
    }
    Self::git(cwd, &["commit", "-m", message])?;
    Ok(())
  }

  pub fn pull(cwd: &Path) -> Result<(), String> {
    Self::git(cwd, &["pull", "--rebase", "--no-edit"])?;
    Ok(())
  }

  pub fn push(cwd: &Path) -> Result<(), String> {
    Self::git(cwd, &["push"])?;
    Ok(())
  }

  pub fn snapshot(cwd: &Path, message: &str) -> Result<(), String> {
    Self::commit_all(cwd, message)?;
    Self::push(cwd)?;
    Ok(())
  }
}

#[derive(Serialize, Clone, Debug)]
pub struct LanSyncStatus {
  pub peer_url: Option<String>,
  pub online: bool,
  pub last_error: Option<String>,
}

pub struct LanPeerProtocol;

impl LanPeerProtocol {
  pub fn validate_pair_code(code: &str) -> Result<String, String> {
    let trimmed = code.trim();
    if trimmed.len() < 6 || trimmed.len() > 64 {
      return Err("pair code must be 6-64 chars".into());
    }
    if !trimmed.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
      return Err("pair code contains unsupported characters".into());
    }
    Ok(trimmed.to_string())
  }

  pub async fn probe_peer(peer_url: &str) -> Result<bool, String> {
    let client = reqwest::Client::builder()
      .timeout(std::time::Duration::from_secs(3))
      .build()
      .map_err(|e| e.to_string())?;
    let response = client
      .get(format!("{}/elephantnote/ping", peer_url.trim_end_matches('/')))
      .send()
      .await
      .map_err(|e| e.to_string())?;
    Ok(response.status().is_success())
  }

  pub fn status(peer_url: Option<&str>, last_error: Option<String>) -> LanSyncStatus {
    LanSyncStatus {
      peer_url: peer_url.map(|s| s.to_string()),
      online: false,
      last_error,
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;

  #[test]
  fn status_reports_uninitialized_for_fresh_dir() {
    let dir = std::env::temp_dir().join(format!("elephantnote_git_test_{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let status = GitSyncEngine::status(&dir);
    assert!(!status.initialized);
    assert!(status.branch.is_none());
    assert!(!status.dirty);
    fs::remove_dir_all(&dir).ok();
  }

  #[test]
  fn validate_pair_code_rejects_short_codes() {
    assert!(LanPeerProtocol::validate_pair_code("abc").is_err());
    assert!(LanPeerProtocol::validate_pair_code("").is_err());
  }

  #[test]
  fn validate_pair_code_rejects_invalid_chars() {
    assert!(LanPeerProtocol::validate_pair_code("with spaces!").is_err());
    assert!(LanPeerProtocol::validate_pair_code("semi;colon").is_err());
  }

  #[test]
  fn validate_pair_code_accepts_valid_codes() {
    assert!(LanPeerProtocol::validate_pair_code("ABCD-1234").is_ok());
    assert!(LanPeerProtocol::validate_pair_code("pair_code_x42").is_ok());
  }

  #[test]
  fn validate_pair_code_trims_whitespace() {
    let result = LanPeerProtocol::validate_pair_code("  ABCD123  ").unwrap();
    assert_eq!(result, "ABCD123");
  }

  #[test]
  fn lan_status_shape_serializes() {
    let status = LanPeerProtocol::status(Some("http://192.168.1.2:7878"), None);
    let json = serde_json::to_value(&status).unwrap();
    assert_eq!(json.get("peer_url").and_then(|v| v.as_str()), Some("http://192.168.1.2:7878"));
  }

  #[test]
  fn git_status_no_git_binary_returns_error_properly() {
    let dir = std::env::temp_dir().join("nonexistent_git_dir_xyz");
    let result = GitSyncEngine::git(&dir, &["status"]);
    assert!(result.is_err());
  }
}
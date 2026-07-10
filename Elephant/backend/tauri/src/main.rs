#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{env, fs, path::PathBuf};

const ELEPHANTNOTE_CODEX_HOME: &str = "codex-home";

fn user_home() -> Option<PathBuf> {
  env::var_os("HOME")
    .map(PathBuf::from)
    .or_else(|| env::var_os("USERPROFILE").map(PathBuf::from))
}

fn configure_isolated_codex_home() {
  let Some(home) = user_home() else {
    eprintln!("[Codex][home] unable to resolve user home; keeping inherited CODEX_HOME");
    return;
  };

  let source_home = env::var_os("CODEX_HOME")
    .map(PathBuf::from)
    .unwrap_or_else(|| home.join(".codex"));
  let isolated_home = home.join(".elephantnote").join(ELEPHANTNOTE_CODEX_HOME);

  if let Err(error) = fs::create_dir_all(&isolated_home) {
    eprintln!(
      "[Codex][home] unable to create isolated home path={} error={error}",
      isolated_home.display()
    );
    return;
  }

  let source_auth = source_home.join("auth.json");
  let isolated_auth = isolated_home.join("auth.json");
  if !isolated_auth.exists() && source_auth.is_file() {
    match fs::copy(&source_auth, &isolated_auth) {
      Ok(_) => {
        #[cfg(unix)]
        {
          use std::os::unix::fs::PermissionsExt;
          if let Ok(metadata) = fs::metadata(&isolated_auth) {
            let mut permissions = metadata.permissions();
            permissions.set_mode(0o600);
            let _ = fs::set_permissions(&isolated_auth, permissions);
          }
        }
        eprintln!(
          "[Codex][home] seeded authentication source={} target={}",
          source_auth.display(),
          isolated_auth.display()
        );
      }
      Err(error) => eprintln!(
        "[Codex][home] unable to seed authentication source={} error={error}",
        source_auth.display()
      ),
    }
  }

  env::set_var("CODEX_HOME", &isolated_home);
  eprintln!(
    "[Codex][home] isolated path={} inherited_config=false",
    isolated_home.display()
  );
}

fn main() {
  configure_isolated_codex_home();
  elephantnote_tauri::run();
}

use std::path::{Path, PathBuf};

pub const HIDDEN_ROOT: &str = ".elephantnote";
pub const CONFIG_DIR: &str = "config";
pub const WIKI_DIR: &str = "wiki";
pub const MODELS_DIR: &str = "models";
pub const SYNC_DIR: &str = "sync";
pub const INDEX_DIR: &str = "index";
pub const CACHE_DIR: &str = "cache";
pub const STATE_DIR: &str = "state";
pub const TRASH_DIR: &str = "trash";
pub const ASSETS_DIR: &str = "assets";

pub const WORKSPACE_FILE: &str = "workspace.json";
pub const VAULT_FILE: &str = "vault.json";
pub const CALENDAR_FILE: &str = "calendar.json";
pub const SOURCES_FILE: &str = "sources.json";
pub const WIKI_FILE: &str = "wiki.json";
pub const MODELS_FILE: &str = "models.json";
pub const SYNC_FILE: &str = "sync.json";
pub const INDEX_FILE: &str = "index.json";

pub fn hidden_root(vault_root: impl AsRef<Path>) -> PathBuf {
  vault_root.as_ref().join(HIDDEN_ROOT)
}

pub fn hidden_dir(vault_root: impl AsRef<Path>, name: &str) -> PathBuf {
  hidden_root(vault_root).join(name)
}

pub fn config_file(vault_root: impl AsRef<Path>, file: &str) -> PathBuf {
  hidden_dir(vault_root, CONFIG_DIR).join(file)
}

pub fn wiki_file(vault_root: impl AsRef<Path>, file: &str) -> PathBuf {
  hidden_dir(vault_root, WIKI_DIR).join(file)
}

pub fn models_file(vault_root: impl AsRef<Path>, file: &str) -> PathBuf {
  hidden_dir(vault_root, MODELS_DIR).join(file)
}

pub fn sync_file(vault_root: impl AsRef<Path>, file: &str) -> PathBuf {
  hidden_dir(vault_root, SYNC_DIR).join(file)
}

pub fn index_file(vault_root: impl AsRef<Path>, file: &str) -> PathBuf {
  hidden_dir(vault_root, INDEX_DIR).join(file)
}

pub fn assets_dir(vault_root: impl AsRef<Path>) -> PathBuf {
  hidden_dir(vault_root, ASSETS_DIR)
}

pub fn required_hidden_dirs() -> [&'static str; 8] {
  [CONFIG_DIR, WIKI_DIR, MODELS_DIR, SYNC_DIR, INDEX_DIR, CACHE_DIR, STATE_DIR, TRASH_DIR]
}

pub fn is_hidden_vault_path(relative_path: &str) -> bool {
  relative_path
    .replace('\\', "/")
    .split('/')
    .next()
    .is_some_and(|first| first == HIDDEN_ROOT || first.starts_with('.'))
}

pub fn is_visible_vault_path(relative_path: &str) -> bool {
  !is_hidden_vault_path(relative_path)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn builds_hidden_root_path() {
    assert!(hidden_root("vault").ends_with("vault/.elephantnote"));
  }

  #[test]
  fn builds_canonical_metadata_paths() {
    assert!(config_file("vault", WORKSPACE_FILE).ends_with("vault/.elephantnote/config/workspace.json"));
    assert!(wiki_file("vault", WIKI_FILE).ends_with("vault/.elephantnote/wiki/wiki.json"));
    assert!(models_file("vault", MODELS_FILE).ends_with("vault/.elephantnote/models/models.json"));
    assert!(sync_file("vault", SYNC_FILE).ends_with("vault/.elephantnote/sync/sync.json"));
    assert!(index_file("vault", INDEX_FILE).ends_with("vault/.elephantnote/index/index.json"));
  }

  #[test]
  fn exposes_required_hidden_dirs() {
    let dirs = required_hidden_dirs();
    assert!(dirs.contains(&CONFIG_DIR));
    assert!(dirs.contains(&WIKI_DIR));
    assert!(dirs.contains(&MODELS_DIR));
    assert!(dirs.contains(&SYNC_DIR));
  }

  #[test]
  fn distinguishes_hidden_and_visible_paths() {
    assert!(is_hidden_vault_path(".elephantnote/config/workspace.json"));
    assert!(is_hidden_vault_path(".git/config"));
    assert!(is_visible_vault_path("Projects/note.md"));
  }
}

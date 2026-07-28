use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

use crate::infra::write_atomically;
use crate::vault::config as vault_config;

type ResultValue<T> = Result<T, String>;

fn now() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn active_vault_root(app: &AppHandle) -> ResultValue<PathBuf> {
    let root = vault_config::get_active_vault(app)?.path;
    if root.trim().is_empty() {
        return Err("Cannot save a note without an active vault.".to_string());
    }
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    fs::canonicalize(root).map_err(|error| error.to_string())
}

fn confined_write_target(root: &Path, candidate: &Path) -> ResultValue<PathBuf> {
    let target = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        root.join(candidate)
    };
    let parent = target
        .parent()
        .ok_or_else(|| "Cannot write a path without a parent directory.".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let parent = fs::canonicalize(parent).map_err(|error| error.to_string())?;
    if !parent.starts_with(root) {
        return Err(format!(
            "Refusing to write outside the active vault: {}",
            target.to_string_lossy()
        ));
    }
    let file_name = target
        .file_name()
        .ok_or_else(|| "Cannot write a path without a file name.".to_string())?;
    let resolved = parent.join(file_name);
    if resolved
        .extension()
        .and_then(|extension| extension.to_str())
        .is_none_or(|extension| !extension.eq_ignore_ascii_case("md"))
    {
        return Err(format!(
            "Refusing to save Markdown into a non-Markdown file: {}",
            resolved.to_string_lossy()
        ));
    }
    Ok(resolved)
}

fn write_if_changed_atomically(path: &Path, content: &str) -> ResultValue<bool> {
    if fs::read(path)
        .ok()
        .is_some_and(|existing| existing == content.as_bytes())
    {
        return Ok(false);
    }
    write_atomically(path, content.as_bytes()).map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn tauri_marktext_write_file_atomic(
    app: AppHandle,
    pathname: String,
    content: String,
) -> ResultValue<Value> {
    if pathname.trim().is_empty() {
        return Err("Cannot save MarkText file without a pathname.".to_string());
    }
    let root = active_vault_root(&app)?;
    let path = confined_write_target(&root, Path::new(&pathname))?;
    let changed = write_if_changed_atomically(&path, &content)?;
    Ok(json!({
        "ok": true,
        "changed": changed,
        "fullPath": path.to_string_lossy(),
        "updatedAt": now(),
        "atomic": true
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "elephantnote_atomic_note_{name}_{}",
            std::process::id()
        ))
    }

    #[test]
    fn confined_target_rejects_parent_escape() {
        let root = temporary_root("escape");
        let outside = root.parent().unwrap().join("outside.md");
        fs::create_dir_all(&root).unwrap();
        let canonical = fs::canonicalize(&root).unwrap();
        let error = confined_write_target(&canonical, &outside).unwrap_err();
        assert!(error.contains("outside the active vault"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn atomic_write_replaces_complete_markdown() {
        let root = temporary_root("replace");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("note.md");
        fs::write(&path, "old").unwrap();
        assert!(write_if_changed_atomically(&path, "new complete value").unwrap());
        assert_eq!(fs::read_to_string(&path).unwrap(), "new complete value");
        assert!(!write_if_changed_atomically(&path, "new complete value").unwrap());
        assert!(!path.with_extension("md.tmp").exists());
        fs::remove_dir_all(root).ok();
    }
}

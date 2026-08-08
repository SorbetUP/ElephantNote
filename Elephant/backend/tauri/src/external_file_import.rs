use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::AppHandle;

use crate::vault::config::get_active_vault;

type R<T> = Result<T, String>;

fn normalize_relative_path(value: &str) -> String {
    value
        .replace('\\', "/")
        .split('/')
        .filter(|part| !part.is_empty() && *part != "." && *part != "..")
        .collect::<Vec<_>>()
        .join("/")
}

fn safe_leaf_name(value: &str) -> R<String> {
    let value = value.trim();
    if value.is_empty()
        || value == "."
        || value == ".."
        || value.contains('\0')
        || value.contains('/')
        || value.contains('\\')
    {
        return Err("The imported file name is invalid.".to_string());
    }
    Ok(value.to_string())
}

fn canonical_vault_root(root: &Path) -> R<PathBuf> {
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    fs::canonicalize(root).map_err(|error| error.to_string())
}

fn target_directory(root: &Path, relative_path: &str) -> R<PathBuf> {
    let canonical_root = canonical_vault_root(root)?;
    let relative_path = normalize_relative_path(relative_path);
    let requested = if relative_path.is_empty() {
        canonical_root.clone()
    } else {
        canonical_root.join(relative_path)
    };
    fs::create_dir_all(&requested).map_err(|error| error.to_string())?;
    let canonical = fs::canonicalize(&requested).map_err(|error| error.to_string())?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Refusing to import a file outside the active vault.".to_string());
    }
    Ok(canonical)
}

fn collision_safe_path(directory: &Path, file_name: &str) -> PathBuf {
    let original = Path::new(file_name);
    let stem = original
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("file");
    let extension = original.extension().and_then(|value| value.to_str());

    for index in 0..10_000_u32 {
        let candidate_name = if index == 0 {
            file_name.to_string()
        } else if let Some(extension) = extension {
            format!("{stem}-{index}.{extension}")
        } else {
            format!("{stem}-{index}")
        };
        let candidate = directory.join(candidate_name);
        if !candidate.exists() {
            return candidate;
        }
    }

    directory.join(format!("{stem}-{}", std::process::id()))
}

#[tauri::command]
pub fn tauri_entries_import_external_file(
    app: AppHandle,
    source_path: String,
    target_directory_path: Option<String>,
    filename: Option<String>,
) -> R<Value> {
    if source_path.trim().is_empty() {
        return Err("An external source path is required.".to_string());
    }

    let source = PathBuf::from(&source_path);
    let source_metadata = fs::symlink_metadata(&source).map_err(|error| error.to_string())?;
    if source_metadata.file_type().is_symlink() {
        return Err("Refusing to import a symbolic link.".to_string());
    }
    if !source_metadata.is_file() {
        return Err("Only regular files can be imported into a vault folder.".to_string());
    }
    let source = fs::canonicalize(&source).map_err(|error| error.to_string())?;

    let vault = get_active_vault(&app)?;
    let root = PathBuf::from(&vault.path);
    let relative_directory = normalize_relative_path(
        target_directory_path.as_deref().unwrap_or_default(),
    );
    let directory = target_directory(&root, &relative_directory)?;
    let fallback_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "The source file has no usable name.".to_string())?;
    let file_name = safe_leaf_name(filename.as_deref().unwrap_or(fallback_name))?;
    let destination = collision_safe_path(&directory, &file_name);

    let copied_bytes = fs::copy(&source, &destination).map_err(|error| error.to_string())?;
    let canonical_root = canonical_vault_root(&root)?;
    let relative_path = destination
        .strip_prefix(&canonical_root)
        .map_err(|_| "The imported file escaped the active vault.".to_string())?
        .to_string_lossy()
        .replace('\\', "/");

    Ok(json!({
        "ok": true,
        "name": destination.file_name().and_then(|value| value.to_str()).unwrap_or(&file_name),
        "path": relative_path,
        "fullPath": destination.to_string_lossy(),
        "sourcePath": source.to_string_lossy(),
        "bytes": copied_bytes
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "elephant-external-import-{name}-{}",
            std::process::id()
        ))
    }

    #[test]
    fn collision_safe_path_never_overwrites_existing_file() {
        let root = temp_root("collision");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("document.pdf"), b"original").unwrap();
        assert_eq!(
            collision_safe_path(&root, "document.pdf")
                .file_name()
                .and_then(|value| value.to_str()),
            Some("document-1.pdf")
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn unsafe_leaf_names_are_rejected() {
        assert!(safe_leaf_name("../outside.txt").is_err());
        assert!(safe_leaf_name("folder/file.txt").is_err());
        assert!(safe_leaf_name("file.txt").is_ok());
    }
}

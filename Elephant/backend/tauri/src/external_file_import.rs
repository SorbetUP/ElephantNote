use serde_json::{json, Value};
use std::{
    fs, io,
    path::{Path, PathBuf},
};
use tauri::AppHandle;

use crate::vault::config::get_active_vault;

type R<T> = Result<T, String>;

fn normalize_relative_path(value: &str) -> R<String> {
    let normalized = value.replace('\\', "/");
    let first_part = normalized.split('/').next().unwrap_or_default();
    if normalized.starts_with('/') || first_part.ends_with(':') {
        return Err("The import directory must be relative to the active vault.".to_string());
    }

    let mut parts = Vec::new();
    for part in normalized.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            return Err("The import directory cannot contain parent traversal.".to_string());
        }
        parts.push(part);
    }
    Ok(parts.join("/"))
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
    let relative_path = normalize_relative_path(relative_path)?;
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

fn collision_candidate(directory: &Path, file_name: &str, index: u32) -> PathBuf {
    let original = Path::new(file_name);
    let stem = original
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("file");
    let extension = original.extension().and_then(|value| value.to_str());

    let candidate_name = if index == 0 {
        file_name.to_string()
    } else if let Some(extension) = extension {
        format!("{stem}-{index}.{extension}")
    } else {
        format!("{stem}-{index}")
    };
    directory.join(candidate_name)
}

fn copy_collision_safe(source: &Path, directory: &Path, file_name: &str) -> R<(PathBuf, u64)> {
    for index in 0..10_000_u32 {
        let candidate = collision_candidate(directory, file_name, index);
        let mut source_file = fs::File::open(source).map_err(|error| error.to_string())?;
        let mut destination = match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        };

        let copied_bytes = match io::copy(&mut source_file, &mut destination) {
            Ok(bytes) => bytes,
            Err(error) => {
                let _ = fs::remove_file(&candidate);
                return Err(error.to_string());
            }
        };
        if let Err(error) = destination.sync_all() {
            let _ = fs::remove_file(&candidate);
            return Err(error.to_string());
        }
        return Ok((candidate, copied_bytes));
    }

    Err("Unable to allocate a collision-safe destination name.".to_string())
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
    let relative_directory =
        normalize_relative_path(target_directory_path.as_deref().unwrap_or_default())?;
    let directory = target_directory(&root, &relative_directory)?;
    let fallback_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "The source file has no usable name.".to_string())?;
    let file_name = safe_leaf_name(filename.as_deref().unwrap_or(fallback_name))?;
    let (destination, copied_bytes) = copy_collision_safe(&source, &directory, &file_name)?;
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
            collision_candidate(&root, "document.pdf", 1)
                .file_name()
                .and_then(|value| value.to_str()),
            Some("document-1.pdf")
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn collision_safe_copy_does_not_clobber_existing_file() {
        let root = temp_root("copy");
        fs::create_dir_all(&root).unwrap();
        let source = root.join("source.pdf");
        fs::write(root.join("document.pdf"), b"original").unwrap();
        fs::write(&source, b"imported").unwrap();

        let (destination, bytes) = copy_collision_safe(&source, &root, "document.pdf").unwrap();

        assert_eq!(
            destination.file_name().and_then(|value| value.to_str()),
            Some("document-1.pdf")
        );
        assert_eq!(bytes, 8);
        assert_eq!(fs::read(root.join("document.pdf")).unwrap(), b"original");
        assert_eq!(fs::read(destination).unwrap(), b"imported");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn traversal_in_import_directory_is_rejected() {
        assert!(normalize_relative_path("../outside").is_err());
        assert!(normalize_relative_path("nested/../../outside").is_err());
        assert!(normalize_relative_path("/outside").is_err());
        assert_eq!(
            normalize_relative_path("./nested\\folder").unwrap(),
            "nested/folder"
        );
    }

    #[test]
    fn unsafe_leaf_names_are_rejected() {
        assert!(safe_leaf_name("../outside.txt").is_err());
        assert!(safe_leaf_name("folder/file.txt").is_err());
        assert!(safe_leaf_name("file.txt").is_ok());
    }
}

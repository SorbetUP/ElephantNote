use crate::chunking::analyze_markdown;
use crate::model::{RebuildFailure, RebuildReport};
use crate::storage::KnowledgeStore;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub fn rebuild_vault(vault_root: &Path) -> Result<RebuildReport, String> {
    let canonical_root = fs::canonicalize(vault_root).map_err(|error| error.to_string())?;
    let mut files = Vec::new();
    scan_markdown_files(&canonical_root, &canonical_root, &mut files)?;
    files.sort();

    let mut store = KnowledgeStore::open(&canonical_root)?;
    store.initialize_relations()?;
    let mut report = RebuildReport::default();
    let mut present_paths = HashSet::new();

    for absolute_path in files {
        report.scanned += 1;
        let relative_path = absolute_path
            .strip_prefix(&canonical_root)
            .unwrap_or(&absolute_path)
            .to_string_lossy()
            .replace('\\', "/");
        present_paths.insert(relative_path.clone());

        let result = index_path(&store, &absolute_path, &relative_path);
        match result {
            Ok(IndexDecision::Unchanged) => {
                let relation_result = store
                    .inspect_document(&relative_path)
                    .and_then(|document| {
                        document
                            .as_ref()
                            .map(|snapshot| store.sync_markdown_relations(snapshot))
                            .transpose()
                    });
                match relation_result {
                    Ok(_) => report.unchanged += 1,
                    Err(error) => report.failed.push(RebuildFailure {
                        relative_path,
                        error,
                    }),
                }
            }
            Ok(IndexDecision::Changed(snapshot)) => {
                let index_result = store
                    .upsert_document(&snapshot)
                    .and_then(|_| store.sync_markdown_relations(&snapshot).map(|_| ()));
                if let Err(error) = index_result {
                    report.failed.push(RebuildFailure {
                        relative_path,
                        error,
                    });
                } else {
                    report.indexed += 1;
                }
            }
            Err(error) => report.failed.push(RebuildFailure {
                relative_path,
                error,
            }),
        }
    }

    report.removed = store.prune_documents(&present_paths)?;
    Ok(report)
}

enum IndexDecision {
    Unchanged,
    Changed(crate::model::DocumentSnapshot),
}

fn index_path(
    store: &KnowledgeStore,
    absolute_path: &Path,
    relative_path: &str,
) -> Result<IndexDecision, String> {
    let markdown = fs::read_to_string(absolute_path).map_err(|error| error.to_string())?;
    let content_hash = blake3::hash(markdown.as_bytes()).to_hex().to_string();
    if store.existing_hash(relative_path)?.as_deref() == Some(content_hash.as_str()) {
        return Ok(IndexDecision::Unchanged);
    }
    let modified_at = fs::metadata(absolute_path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);
    Ok(IndexDecision::Changed(analyze_markdown(
        relative_path,
        &markdown,
        modified_at,
    )))
}

fn scan_markdown_files(root: &Path, current: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in fs::read_dir(current).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if ignored_name(&name) {
            continue;
        }
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            scan_markdown_files(root, &path, out)?;
        } else if metadata.is_file() && name.to_ascii_lowercase().ends_with(".md") {
            let canonical = fs::canonicalize(&path).map_err(|error| error.to_string())?;
            if canonical.starts_with(root) {
                out.push(canonical);
            }
        }
    }
    Ok(())
}

fn ignored_name(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules" || name.ends_with('~') || name.ends_with(".tmp")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::relations::{KnowledgeNodeKind, KnowledgeNodeRef};
    use crate::storage::KnowledgeStore;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_vault(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "elephant-knowledge-{name}-{}-{stamp}",
            std::process::id()
        ))
    }

    #[test]
    fn rebuild_is_incremental_and_ignores_hidden_files() {
        let root = temp_vault("incremental");
        fs::create_dir_all(root.join("Notes")).unwrap();
        fs::create_dir_all(root.join(".assets")).unwrap();
        fs::write(root.join("Notes/A.md"), "# A\nalpha").unwrap();
        fs::write(root.join(".assets/hidden.md"), "# Hidden").unwrap();

        let first = rebuild_vault(&root).unwrap();
        assert_eq!(first.scanned, 1);
        assert_eq!(first.indexed, 1);
        assert_eq!(first.unchanged, 0);

        let second = rebuild_vault(&root).unwrap();
        assert_eq!(second.indexed, 0);
        assert_eq!(second.unchanged, 1);

        let store = KnowledgeStore::open(&root).unwrap();
        assert_eq!(store.status().unwrap().documents, 1);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn rebuild_projects_explicit_wikilinks_as_typed_relations() {
        let root = temp_vault("relations");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("A.md"), "# A\nSee [[B]].").unwrap();
        rebuild_vault(&root).unwrap();

        let store = KnowledgeStore::open(&root).unwrap();
        let relations = store
            .relations_for_node(
                &KnowledgeNodeRef {
                    kind: KnowledgeNodeKind::Document,
                    id: "A.md".into(),
                },
                false,
            )
            .unwrap();
        assert_eq!(relations.len(), 1);
        assert_eq!(relations[0].target.id, "B");

        let second = rebuild_vault(&root).unwrap();
        assert_eq!(second.unchanged, 1);
        let relations = store
            .relations_for_node(
                &KnowledgeNodeRef {
                    kind: KnowledgeNodeKind::Document,
                    id: "A.md".into(),
                },
                false,
            )
            .unwrap();
        assert_eq!(relations.len(), 1);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn rebuild_prunes_deleted_notes() {
        let root = temp_vault("delete");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("A.md"), "# A\nalpha").unwrap();
        rebuild_vault(&root).unwrap();
        fs::remove_file(root.join("A.md")).unwrap();
        let report = rebuild_vault(&root).unwrap();
        assert_eq!(report.removed, 1);
        assert_eq!(
            KnowledgeStore::open(&root)
                .unwrap()
                .status()
                .unwrap()
                .documents,
            0
        );
        fs::remove_dir_all(root).ok();
    }
}

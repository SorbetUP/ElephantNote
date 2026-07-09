use crate::chunking::analyze_markdown;
use crate::model::{RebuildFailure, RebuildReport};
use crate::storage::KnowledgeStore;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, UNIX_EPOCH};

pub fn rebuild_vault(vault_root: &Path) -> Result<RebuildReport, String> {
    let started_at = Instant::now();
    eprintln!(
        "[Knowledge][Rebuild] start requested_vault={}",
        vault_root.display()
    );

    let canonical_root = fs::canonicalize(vault_root).map_err(|error| {
        eprintln!(
            "[Knowledge][Rebuild] error stage=canonicalize vault={} error={}",
            vault_root.display(),
            error
        );
        error.to_string()
    })?;
    let mut files = Vec::new();
    scan_markdown_files(&canonical_root, &canonical_root, &mut files).map_err(|error| {
        eprintln!(
            "[Knowledge][Rebuild] error stage=scan vault={} error={}",
            canonical_root.display(),
            error
        );
        error
    })?;
    files.sort();
    eprintln!(
        "[Knowledge][Rebuild] scan:complete vault={} markdown_files={}",
        canonical_root.display(),
        files.len()
    );

    let mut store = KnowledgeStore::open(&canonical_root).map_err(|error| {
        eprintln!(
            "[Knowledge][Rebuild] error stage=open_store vault={} error={}",
            canonical_root.display(),
            error
        );
        error
    })?;
    store.initialize_relations()?;
    store.initialize_wikis()?;
    let mut report = RebuildReport::default();
    let mut present_paths = HashSet::new();

    for absolute_path in files {
        let file_started_at = Instant::now();
        report.scanned += 1;
        let relative_path = absolute_path
            .strip_prefix(&canonical_root)
            .unwrap_or(&absolute_path)
            .to_string_lossy()
            .replace('\\', "/");
        present_paths.insert(relative_path.clone());
        eprintln!("[Knowledge][Rebuild] file:start path={relative_path}");

        match index_path(&store, &absolute_path, &relative_path) {
            Ok(IndexDecision::Unchanged) => {
                let relation_result = store.inspect_document(&relative_path).and_then(|document| {
                    document
                        .as_ref()
                        .map(|snapshot| store.sync_markdown_relations(snapshot))
                        .transpose()
                });
                match relation_result {
                    Ok(relation_count) => {
                        report.unchanged += 1;
                        eprintln!(
                            "[Knowledge][Rebuild] file:unchanged path={} relations={} duration_ms={}",
                            relative_path,
                            relation_count.unwrap_or(0),
                            file_started_at.elapsed().as_millis()
                        );
                    }
                    Err(error) => {
                        eprintln!(
                            "[Knowledge][Rebuild] file:error path={} stage=relations duration_ms={} error={}",
                            relative_path,
                            file_started_at.elapsed().as_millis(),
                            error
                        );
                        report.failed.push(RebuildFailure {
                            relative_path,
                            error,
                        });
                    }
                }
            }
            Ok(IndexDecision::Changed(snapshot)) => {
                let changed_path = snapshot.relative_path.clone();
                let sections = snapshot.sections.len();
                let chunks = snapshot.chunks.len();
                let explicit_links = snapshot.explicit_links.len();
                let index_result = (|| {
                    store.upsert_document(&snapshot)?;
                    let relations = store.sync_markdown_relations(&snapshot)?;
                    let outdated_wikis = store.mark_wikis_outdated_for_source(&changed_path)?;
                    Ok::<_, String>((relations, outdated_wikis))
                })();

                match index_result {
                    Ok((relations, outdated_wikis)) => {
                        report.indexed += 1;
                        eprintln!(
                            "[Knowledge][Rebuild] file:indexed path={} sections={} chunks={} explicit_links={} relations={} outdated_wikis={} duration_ms={}",
                            relative_path,
                            sections,
                            chunks,
                            explicit_links,
                            relations,
                            outdated_wikis,
                            file_started_at.elapsed().as_millis()
                        );
                    }
                    Err(error) => {
                        eprintln!(
                            "[Knowledge][Rebuild] file:error path={} stage=index duration_ms={} error={}",
                            relative_path,
                            file_started_at.elapsed().as_millis(),
                            error
                        );
                        report.failed.push(RebuildFailure {
                            relative_path,
                            error,
                        });
                    }
                }
            }
            Err(error) => {
                eprintln!(
                    "[Knowledge][Rebuild] file:error path={} stage=read duration_ms={} error={}",
                    relative_path,
                    file_started_at.elapsed().as_millis(),
                    error
                );
                report.failed.push(RebuildFailure {
                    relative_path,
                    error,
                });
            }
        }
    }

    report.removed = store.prune_documents(&present_paths).map_err(|error| {
        eprintln!(
            "[Knowledge][Rebuild] error stage=prune vault={} error={}",
            canonical_root.display(),
            error
        );
        error
    })?;
    eprintln!(
        "[Knowledge][Rebuild] complete vault={} scanned={} indexed={} unchanged={} removed={} failed={} duration_ms={}",
        canonical_root.display(),
        report.scanned,
        report.indexed,
        report.unchanged,
        report.removed,
        report.failed.len(),
        started_at.elapsed().as_millis()
    );
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
        let path = entry.path();
        if ignored_name(&name) {
            eprintln!(
                "[Knowledge][Rebuild] scan:skip reason=ignored path={}",
                path.display()
            );
            continue;
        }
        let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
        if metadata.file_type().is_symlink() {
            eprintln!(
                "[Knowledge][Rebuild] scan:skip reason=symlink path={}",
                path.display()
            );
            continue;
        }
        if metadata.is_dir() {
            scan_markdown_files(root, &path, out)?;
        } else if metadata.is_file() && name.to_ascii_lowercase().ends_with(".md") {
            let canonical = fs::canonicalize(&path).map_err(|error| error.to_string())?;
            if canonical.starts_with(root) {
                out.push(canonical);
            } else {
                eprintln!(
                    "[Knowledge][Rebuild] scan:skip reason=outside_vault path={}",
                    canonical.display()
                );
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

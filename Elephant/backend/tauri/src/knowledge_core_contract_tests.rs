use elephantnote_knowledge_core::{
    rebuild_vault, ChatKnowledgeAction, KnowledgeStore,
};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_vault(name: &str) -> PathBuf {
  let stamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap()
    .as_nanos();
  std::env::temp_dir().join(format!(
    "elephantnote-knowledge-contract-{name}-{}-{stamp}",
    std::process::id()
  ))
}

#[test]
fn rebuild_indexes_full_markdown_chunks_and_wikilinks() {
  let root = temp_vault("rebuild");
  fs::create_dir_all(root.join("Notes")).unwrap();
  fs::write(
    root.join("Notes/Iroh.md"),
    "# Iroh\n\nIroh provides peer-to-peer connectivity.\n\nSee [[Hole punching]].",
  )
  .unwrap();

  let report = rebuild_vault(&root).unwrap();
  assert_eq!(report.scanned, 1);
  assert_eq!(report.indexed, 1);
  assert!(report.failed.is_empty());

  let store = KnowledgeStore::open(&root).unwrap();
  let status = store.status().unwrap();
  assert_eq!(status.documents, 1);
  assert!(status.sections >= 1);
  assert!(status.chunks >= 1);
  assert_eq!(status.explicit_links, 1);

  let hits = store.search("peer connectivity", 10).unwrap();
  assert_eq!(hits.len(), 1);
  assert_eq!(hits[0].relative_path, "Notes/Iroh.md");
  assert!(hits[0].end_offset > hits[0].start_offset);

  fs::remove_dir_all(root).ok();
}

#[test]
fn rebuild_is_incremental_and_prunes_deleted_notes() {
  let root = temp_vault("incremental");
  fs::create_dir_all(&root).unwrap();
  fs::write(root.join("A.md"), "# A\nalpha").unwrap();

  assert_eq!(rebuild_vault(&root).unwrap().indexed, 1);
  let second = rebuild_vault(&root).unwrap();
  assert_eq!(second.indexed, 0);
  assert_eq!(second.unchanged, 1);

  fs::remove_file(root.join("A.md")).unwrap();
  let third = rebuild_vault(&root).unwrap();
  assert_eq!(third.removed, 1);
  assert_eq!(KnowledgeStore::open(&root).unwrap().status().unwrap().documents, 0);

  fs::remove_dir_all(root).ok();
}

#[test]
fn chat_cannot_silently_overwrite_a_note() {
  let missing_hash = ChatKnowledgeAction::ReplaceNote {
    relative_path: "Notes/Iroh.md".into(),
    content: "# Changed".into(),
    expected_hash: String::new(),
  }
  .validate();
  assert!(!missing_hash.valid);
  assert!(missing_hash.requires_approval);

  let guarded = ChatKnowledgeAction::ReplaceNoteRange {
    relative_path: "Notes/Iroh.md".into(),
    start_offset: 10,
    end_offset: 20,
    replacement: "updated".into(),
    expected_hash: "abc".into(),
  }
  .validate();
  assert!(guarded.valid);
  assert!(guarded.mutates_user_content);
  assert!(guarded.requires_approval);
}

#[test]
fn chat_rejects_hidden_or_outside_paths() {
  for relative_path in ["../outside.md", ".elephantnote/wiki/Iroh.md", "/tmp/Iroh.md"] {
    let validation = ChatKnowledgeAction::CreateNote {
      relative_path: relative_path.into(),
      title: "Iroh".into(),
      content: "# Iroh".into(),
    }
    .validate();
    assert!(!validation.valid, "unsafe path accepted: {relative_path}");
  }
}

from pathlib import Path

ROOT = Path('.')


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected exactly one match, found {count}: {old[:120]!r}')
    write(path, content.replace(old, new, 1))


# Keep Wiki source and Wiki-to-Wiki edges on the graph surface. The backend
# already returns them, but the renderer used to discard every edge type except
# semantic and explicit-link.
helper = 'Elephant/frontend/app/components/views/semanticGraphViewHelpers.js'
replace_once(
    helper,
    """const normalizeGraphEdge = (edge = {}) => ({
  ...edge,
  source: String(edge.source || '').trim(),
  target: String(edge.target || '').trim(),
  type: String(edge.type || 'semantic').trim(),
  reason: String(edge.reason || edge.type || 'semantic').trim(),
  weight: Number(edge.weight ?? edge.score ?? 0) || 0
})""",
    """const normalizeGraphEdge = (edge = {}) => {
  const type = String(
    edge.type || edge.edgeType || edge.edge_type || edge.relationType || edge.relation_type || 'semantic'
  ).trim()
  return {
    ...edge,
    source: String(edge.source || '').trim(),
    target: String(edge.target || '').trim(),
    type,
    relationType: String(edge.relationType || edge.relation_type || '').trim(),
    reason: String(edge.reason || type || 'semantic').trim(),
    weight: Number(edge.weight ?? edge.score ?? 0) || 0
  }
}"""
)
replace_once(
    helper,
    """const semanticViewModelCache = new WeakMap()
const vaultGraphCache = new WeakMap()""",
    """const semanticViewModelCache = new WeakMap()
const vaultGraphCache = new WeakMap()
const VISIBLE_KNOWLEDGE_EDGE_TYPES = new Set([
  'semantic',
  'explicit-link',
  'wiki-source',
  'wiki-link'
])"""
)
replace_once(
    helper,
    """    if (includeStructure) return true
    return edge.type === 'semantic' || edge.type === 'explicit-link'""",
    """    if (includeStructure) return true
    return VISIBLE_KNOWLEDGE_EDGE_TYPES.has(edge.type)"""
)


# Upgrade already accepted generated Wikis instead of requiring users to delete
# and regenerate them. Citation metadata in SQLite is authoritative, so legacy
# footnotes can be converted without asking the model again.
library = 'Elephant/backend/tauri/src/knowledge_wiki_library.rs'
replace_once(
    library,
    "use elephantnote_knowledge_core::{KnowledgeStore, WikiDraft, WikiDraftStatus};",
    "use elephantnote_knowledge_core::{KnowledgeStore, WikiCitation, WikiDraft, WikiDraftStatus};"
)

migration_helpers = r'''
fn markdown_link_component(value: &str) -> String {
    let mut output = String::new();
    for character in value.chars() {
        match character {
            ' ' => output.push_str("%20"),
            '(' => output.push_str("%28"),
            ')' => output.push_str("%29"),
            '#' => output.push_str("%23"),
            '%' => output.push_str("%25"),
            '?' => output.push_str("%3F"),
            _ => output.push(character),
        }
    }
    output
}

fn markdown_heading_anchor(value: &str) -> String {
    let mut output = String::new();
    let mut pending_dash = false;
    for character in value.trim().to_lowercase().chars() {
        if character.is_alphanumeric() {
            if pending_dash && !output.is_empty() {
                output.push('-');
            }
            output.push(character);
            pending_dash = false;
        } else if !output.is_empty() {
            pending_dash = true;
        }
    }
    output
}

fn markdown_note_target(citation: &WikiCitation) -> String {
    let path = markdown_link_component(&citation.document_path);
    let anchor = markdown_heading_anchor(&citation.heading);
    if anchor.is_empty() {
        format!("../../{path}")
    } else {
        format!("../../{path}#{anchor}")
    }
}

fn wiki_slug(value: &str) -> String {
    let mut slug = String::new();
    let mut pending_dash = false;
    for character in value.trim().chars() {
        if character.is_alphanumeric() {
            if pending_dash && !slug.is_empty() {
                slug.push('-');
            }
            slug.extend(character.to_lowercase());
            pending_dash = false;
        } else if !slug.is_empty() {
            pending_dash = true;
        }
    }
    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        "wiki".into()
    } else {
        slug.chars().take(120).collect()
    }
}

fn citation_number(citation: &WikiCitation, fallback: usize) -> usize {
    citation
        .key
        .strip_prefix("source-")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(fallback)
}

fn migrate_related_wikilinks(markdown: &str) -> String {
    let mut in_related_section = false;
    markdown
        .lines()
        .map(|line| {
            let trimmed = line.trim();
            if let Some(heading) = trimmed.strip_prefix("## ") {
                in_related_section = heading.trim().eq_ignore_ascii_case("related wikis");
                return line.to_string();
            }
            if !in_related_section || !trimmed.starts_with("- [[") || !trimmed.ends_with("]]" ) {
                return line.to_string();
            }
            let raw = &trimmed[4..trimmed.len() - 2];
            let mut parts = raw.splitn(2, '|');
            let target = parts.next().unwrap_or("").split('#').next().unwrap_or("").trim();
            let label = parts.next().unwrap_or(target).trim();
            if target.is_empty() {
                return line.to_string();
            }
            let indentation = &line[..line.len() - line.trim_start().len()];
            format!("{indentation}- [{label}](./{}.md)", wiki_slug(target))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn migrate_legacy_generated_markdown(draft: &WikiDraft, markdown: &str) -> Option<String> {
    let has_legacy_citation = draft
        .citations
        .iter()
        .any(|citation| markdown.contains(&format!("[^{}]", citation.key)));
    let has_legacy_related = markdown.lines().any(|line| {
        let trimmed = line.trim();
        trimmed.starts_with("- [[") && trimmed.ends_with("]]" )
    });
    if !has_legacy_citation && !has_legacy_related {
        return None;
    }

    let source_heading = "\n## Sources\n";
    let mut body = markdown
        .find(source_heading)
        .map(|index| markdown[..index].trim_end().to_string())
        .unwrap_or_else(|| markdown.trim_end().to_string());
    body = migrate_related_wikilinks(&body);

    let mut citations = draft.citations.iter().enumerate().collect::<Vec<_>>();
    citations.sort_by_key(|(index, citation)| citation_number(citation, index + 1));
    for (index, citation) in &citations {
        let number = citation_number(citation, index + 1);
        body = body.replace(
            &format!("[^{}]", citation.key),
            &format!("[{number}]({})", markdown_note_target(citation)),
        );
    }

    body.push_str("\n\n## Sources\n\n");
    for (index, citation) in citations {
        let number = citation_number(citation, index + 1);
        body.push_str(&format!(
            "{number}. [{} — {}]({})\n",
            citation.document_title,
            citation.heading,
            markdown_note_target(citation)
        ));
    }
    Some(body)
}

fn atomic_write_migrated_wiki(target: &Path, markdown: &str) -> Result<(), String> {
    let parent = target
        .parent()
        .ok_or_else(|| "Generated Wiki path has no parent directory.".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = target.with_extension(format!("md.{}.migration.tmp", std::process::id()));
    fs::write(&temporary, markdown).map_err(|error| error.to_string())?;
    if let Err(error) = fs::rename(&temporary, target) {
        let _ = fs::remove_file(&temporary);
        return Err(error.to_string());
    }
    Ok(())
}

fn migrate_wiki_draft(
    root: &Path,
    store: &KnowledgeStore,
    mut draft: WikiDraft,
) -> Result<WikiDraft, String> {
    let (relative_path, current_markdown) = disk_markdown(root, &draft);
    let Some(migrated) = migrate_legacy_generated_markdown(&draft, &current_markdown) else {
        return Ok(draft);
    };

    if let Some(relative_path) = &relative_path {
        atomic_write_migrated_wiki(&root.join(relative_path), &migrated)?;
    }
    draft.markdown = migrated;
    store.save_wiki_draft(&draft)?;
    eprintln!(
        "[knowledge] wiki-library:migrated-links draft={} path={}",
        draft.id,
        relative_path.as_deref().unwrap_or("database-only")
    );
    Ok(draft)
}
'''
replace_once(
    library,
    """fn draft_item(root: &Path, draft: WikiDraft) -> WikiLibraryItem {""",
    migration_helpers + "\nfn draft_item(root: &Path, draft: WikiDraft) -> WikiLibraryItem {"
)
replace_once(
    library,
    """    let mut wikis = store
        .list_wiki_drafts(None, limit)?
        .into_iter()
        .filter(|draft| !matches!(draft.status, WikiDraftStatus::Rejected))
        .map(|draft| draft_item(&root, draft))
        .collect::<Vec<_>>();""",
    """    let mut wikis = store
        .list_wiki_drafts(None, limit)?
        .into_iter()
        .filter(|draft| !matches!(draft.status, WikiDraftStatus::Rejected))
        .map(|draft| migrate_wiki_draft(&root, &store, draft))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .map(|draft| draft_item(&root, draft))
        .collect::<Vec<_>>();"""
)
replace_once(
    library,
    """    #[test]
    fn candidate_ids_are_stable_and_normalized() {""",
    r'''    #[test]
    fn legacy_generated_markdown_is_upgraded_to_navigable_links() {
        let draft = WikiDraft {
            id: "wiki-legacy".into(),
            topic: "Iroh".into(),
            title: "Iroh".into(),
            slug: "iroh".into(),
            markdown: String::new(),
            citations: vec![WikiCitation {
                key: "source-1".into(),
                document_path: "Notes/Iroh guide.md".into(),
                document_title: "Iroh guide".into(),
                chunk_id: "chunk-1".into(),
                heading: "Direct connections".into(),
                start_offset: 0,
                end_offset: 20,
            }],
            source_paths: vec!["Notes/Iroh guide.md".into()],
            source_hash: "hash".into(),
            model_id: "model".into(),
            status: WikiDraftStatus::Accepted,
            created_at: 1,
            updated_at: 1,
        };
        let legacy = "# Iroh\n\nIroh connects peers. [^source-1]\n\n## Related wikis\n\n- [[Peer networking]]\n\n## Sources\n\n[^source-1]: [[Notes/Iroh guide.md#Direct connections|Iroh guide — Direct connections]] (bytes 0–20)";
        let migrated = migrate_legacy_generated_markdown(&draft, legacy).expect("migration");
        assert!(migrated.contains(
            "[1](../../Notes/Iroh%20guide.md#direct-connections)"
        ));
        assert!(migrated.contains("- [Peer networking](./peer-networking.md)"));
        assert!(migrated.contains(
            "1. [Iroh guide — Direct connections](../../Notes/Iroh%20guide.md#direct-connections)"
        ));
        assert!(!migrated.contains("[^source-1]"));
    }

    #[test]
    fn candidate_ids_are_stable_and_normalized() {'''
)


# Focused renderer regression test: Wiki edges must survive the renderer surface
# filter and alternate backend field names must normalize consistently.
write(
    'tests/app/unit/wikiGraphSurface.spec.js',
    """import { describe, expect, it } from 'vitest'\n\nimport { buildSemanticGraphSurface } from '../../../Elephant/frontend/app/components/views/semanticGraphViewHelpers.js'\n\ndescribe('Wiki graph surface', () => {\n  it('keeps Wiki source and Wiki bridge edges visible', () => {\n    const surface = buildSemanticGraphSurface({\n      graph: {\n        nodes: [\n          { id: 'wiki:one', kind: 'wiki', title: 'Wiki one' },\n          { id: 'wiki:two', kind: 'wiki', title: 'Wiki two' },\n          { id: 'Notes/A.md', kind: 'note', title: 'A' }\n        ],\n        edges: [\n          { source: 'wiki:one', target: 'Notes/A.md', edgeType: 'wiki-source' },\n          { source: 'wiki:one', target: 'wiki:two', edge_type: 'wiki-link' }\n        ],\n        clusters: []\n      }\n    })\n\n    expect(surface.edges.map((edge) => edge.type)).toEqual(['wiki-source', 'wiki-link'])\n    expect(surface.edgeCounts.get('wiki:one')).toBe(2)\n    expect(surface.edgeCounts.get('Notes/A.md')).toBe(1)\n  })\n})\n"""
)

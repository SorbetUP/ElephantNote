from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text, pattern, repl, label, flags=0):
    out, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return out

# -----------------------------------------------------------------------------
# Global + local semantic Wiki pipeline with live progress
# -----------------------------------------------------------------------------
path = Path('Elephant/backend/tauri/src/knowledge_wiki_discovery.rs')
text = path.read_text()
text = replace_once(
    text,
    'use elephantnote_knowledge_core::KnowledgeStore;',
    'use elephantnote_knowledge_core::{EmbeddingInput, EmbeddingStore, KnowledgeStore};',
    'discovery embedding imports',
)
text = replace_once(text, 'use tauri::AppHandle;', 'use tauri::{AppHandle, Emitter};', 'tauri emitter import')
text = replace_once(
    text,
    '''struct DocumentVector {
    path: String,
    title: String,
    excerpt: String,
    vector: Vec<f32>,
}''',
    '''struct DocumentVector {
    path: String,
    title: String,
    content_hash: String,
    excerpt: String,
    vector: Vec<f32>,
}''',
    'document vector content hash',
)

helpers = r'''
#[cfg(not(mobile))]
fn emit_embedding_progress(app: &AppHandle, payload: Value) {
    let _ = app.emit("elephantnote:knowledge:embedding-progress", payload);
}

#[cfg(not(mobile))]
fn provisional_zone_payload(
    documents: &[DocumentVector],
    route_threshold: f32,
    limit: usize,
) -> Vec<Value> {
    if documents.len() < 6 {
        return Vec::new();
    }
    let vectors = documents
        .iter()
        .map(|document| document.vector.clone())
        .collect::<Vec<_>>();
    build_topic_communities(&vectors, route_threshold)
        .into_iter()
        .filter(|community| community.members.len() >= 4)
        .take(limit.clamp(1, 12))
        .enumerate()
        .filter_map(|(index, community)| {
            let representative = community
                .representatives
                .first()
                .copied()
                .or_else(|| community.members.first().copied())?;
            let document = documents.get(representative)?;
            let source_paths = community
                .members
                .iter()
                .filter_map(|member| documents.get(*member).map(|value| value.path.clone()))
                .collect::<Vec<_>>();
            Some(json!({
                "id": format!("live-zone-{index}"),
                "title": document.title,
                "topic": document.title.trim().to_lowercase(),
                "preview": format!(
                    "Zone sémantique provisoire de {} notes. Le titre sera précisé après validation.",
                    source_paths.len()
                ),
                "sourcePaths": source_paths,
                "sourceCount": community.members.len(),
                "coherence": community.coherence,
                "distinctiveness": community.distinctiveness,
            }))
        })
        .collect()
}

#[cfg(not(mobile))]
fn emit_live_zones(
    app: &AppHandle,
    output: &[Option<DocumentVector>],
    route_threshold: f32,
    processed: usize,
    total: usize,
) {
    let completed = output.iter().flatten().cloned().collect::<Vec<_>>();
    let zones = provisional_zone_payload(&completed, route_threshold, 8);
    emit_embedding_progress(
        app,
        json!({
            "phase": "zones",
            "processed": processed,
            "total": total,
            "zones": zones,
        }),
    );
}
'''
text = replace_once(text, '#[cfg(not(mobile))]\nfn default_true() -> bool {', helpers + '\n#[cfg(not(mobile))]\nfn default_true() -> bool {', 'progress helpers insertion')

new_document_vectors = r'''#[cfg(not(mobile))]
async fn document_vectors(
    app: &AppHandle,
    root: &Path,
    route: &EmbeddingRoute,
) -> Result<Vec<DocumentVector>, String> {
    let model_key = format!(
        "wiki-multiview-v3|{}|{}|{}",
        route.source, route.endpoint, route.model
    );
    let (mut output, missing) = {
        let connection = open_connection(root)?;
        let documents = load_documents(&connection)?;
        let mut output = Vec::<Option<DocumentVector>>::with_capacity(documents.len());
        let mut missing = Vec::<(usize, String, String, String, String, Vec<String>)>::new();
        for (path, title, content_hash, excerpt, views) in documents {
            if title.trim().is_empty() && excerpt.trim().is_empty() {
                continue;
            }
            let cached = connection
                .query_row(
                    "SELECT vector_json FROM wiki_embedding_cache WHERE document_path=?1 AND model_key=?2 AND content_hash=?3",
                    params![path, model_key, content_hash],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(|error| error.to_string())?;
            let index = output.len();
            if let Some(raw) = cached {
                if let Ok(values) = serde_json::from_str::<Vec<f32>>(&raw) {
                    if let Ok(vector) = normalize_vector(values) {
                        output.push(Some(DocumentVector {
                            path,
                            title,
                            content_hash,
                            excerpt,
                            vector,
                        }));
                        continue;
                    }
                }
            }
            output.push(None);
            missing.push((index, path, title, content_hash, excerpt, views));
        }
        (output, missing)
    };

    let total = output.len();
    emit_embedding_progress(
        app,
        json!({
            "phase": "start",
            "processed": 0,
            "total": total,
            "model": route.model,
        }),
    );

    let store = KnowledgeStore::open(root)?;
    let canonical_embeddings = EmbeddingStore::open(store.database_path())?;
    let cached_rows = output
        .iter()
        .flatten()
        .map(|document| {
            (
                EmbeddingInput {
                    relative_path: document.path.clone(),
                    title: document.title.clone(),
                    content_hash: document.content_hash.clone(),
                    text: format!("{}\n\n{}", document.title, document.excerpt),
                },
                document.vector.clone(),
            )
        })
        .collect::<Vec<_>>();
    for batch in cached_rows.chunks(128) {
        canonical_embeddings.save_batch(&route.model, route.threshold, batch)?;
    }

    let mut processed = 0usize;
    for document in output.iter().flatten() {
        processed += 1;
        emit_embedding_progress(
            app,
            json!({
                "phase": "note",
                "processed": processed,
                "total": total,
                "path": document.path,
                "title": document.title,
                "cached": true,
            }),
        );
        if processed == total || processed % 192 == 0 {
            emit_live_zones(app, &output, route.threshold, processed, total);
        }
    }

    for batch in missing.chunks(16) {
        let inputs = batch
            .iter()
            .flat_map(|(_, _, _, _, _, views)| views.iter().cloned())
            .collect::<Vec<_>>();
        let vectors = embed_batch(app, route, &inputs).await?;
        let mut vector_offset = 0usize;
        let connection = open_connection(root)?;
        let mut canonical_rows = Vec::with_capacity(batch.len());
        for (index, path, title, content_hash, excerpt, views) in batch {
            let view_count = views.len();
            if view_count == 0 || vector_offset + view_count > vectors.len() {
                return Err(format!("Missing embedding views for document {path}."));
            }
            let vector = average_vectors(&vectors[vector_offset..vector_offset + view_count])?;
            vector_offset += view_count;
            connection
                .execute(
                    "INSERT INTO wiki_embedding_cache(document_path, model_key, content_hash, vector_json, updated_at)
                     VALUES (?1, ?2, ?3, ?4, unixepoch())
                     ON CONFLICT(document_path, model_key) DO UPDATE SET
                       content_hash=excluded.content_hash,
                       vector_json=excluded.vector_json,
                       updated_at=unixepoch()",
                    params![path, model_key, content_hash, serde_json::to_string(&vector).map_err(|error| error.to_string())?],
                )
                .map_err(|error| error.to_string())?;
            let document = DocumentVector {
                path: path.clone(),
                title: title.clone(),
                content_hash: content_hash.clone(),
                excerpt: excerpt.clone(),
                vector: vector.clone(),
            };
            canonical_rows.push((
                EmbeddingInput {
                    relative_path: path.clone(),
                    title: title.clone(),
                    content_hash: content_hash.clone(),
                    text: format!("{}\n\n{}", title, excerpt),
                },
                vector,
            ));
            output[*index] = Some(document);
        }
        if vector_offset != vectors.len() {
            return Err("Embedding provider returned unassigned document views.".into());
        }
        canonical_embeddings.save_batch(&route.model, route.threshold, &canonical_rows)?;
        for (index, path, title, _, _, _) in batch {
            processed += 1;
            emit_embedding_progress(
                app,
                json!({
                    "phase": "note",
                    "processed": processed,
                    "total": total,
                    "path": path,
                    "title": title,
                    "cached": false,
                }),
            );
            let _ = index;
        }
        if processed == total || processed % 192 < batch.len() {
            emit_live_zones(app, &output, route.threshold, processed, total);
        }
    }

    let documents = output.into_iter().flatten().collect::<Vec<_>>();
    let zones = provisional_zone_payload(&documents, route.threshold, 8);
    emit_embedding_progress(
        app,
        json!({
            "phase": "complete",
            "processed": documents.len(),
            "total": total,
            "zones": zones,
            "model": route.model,
        }),
    );
    Ok(documents)
}
'''
text = regex_once(
    text,
    r'#\[cfg\(not\(mobile\)\)\]\nasync fn document_vectors\(.*?\n}\n\n#\[cfg\(not\(mobile\)\)\]\nfn candidate_overlap',
    new_document_vectors + '\n#[cfg(not(mobile))]\nfn candidate_overlap',
    'replace document_vectors',
    re.S,
)

text = replace_once(
    text,
    'use topic_graph::{assign_competitively, build_assignment_profile, build_topic_communities};',
    'use topic_graph::{\n    assign_competitively, build_assignment_profile, build_topic_communities,\n    refine_assignment_locally,\n};',
    'local refinement import',
)
text = replace_once(
    text,
    '    let assignments = assign_competitively(&profiles, &vectors);',
    '''    let raw_assignments = assign_competitively(&profiles, &vectors);
    let assignments = raw_assignments
        .iter()
        .enumerate()
        .map(|(index, members)| {
            let core_count = profiles[index].core_members.len();
            let max_members = core_count.saturating_mul(3).clamp(minimum_sources, 180);
            refine_assignment_locally(&profiles[index], members, &vectors, max_members)
        })
        .collect::<Vec<_>>();''',
    'local refinement call',
)

command = r'''
#[tauri::command]
pub async fn tauri_knowledge_wiki_embedding_map(app: AppHandle) -> Result<Value, String> {
    #[cfg(mobile)]
    {
        let _ = app;
        Err("Semantic Wiki mapping is unavailable on mobile in this build.".into())
    }
    #[cfg(not(mobile))]
    {
        let root = active_vault_root(&app)?;
        let config = crate::tauri_extra_commands::load_ai_config(&app)?;
        let route = embedding_route(&config)?;
        let documents = document_vectors(&app, &root, &route).await?;
        let zones = provisional_zone_payload(&documents, route.threshold, 12);
        Ok(json!({
            "documents": documents.len(),
            "model": route.model,
            "zones": zones,
        }))
    }
}

'''
text = replace_once(text, '#[tauri::command]\npub async fn tauri_knowledge_wiki_semantic_discover(', command + '#[tauri::command]\npub async fn tauri_knowledge_wiki_semantic_discover(', 'embedding map command')
path.write_text(text)

# -----------------------------------------------------------------------------
# Local refinement inside each provisional Wiki zone
# -----------------------------------------------------------------------------
path = Path('Elephant/backend/tauri/src/knowledge_wiki_discovery/topic_graph.rs')
text = path.read_text()
refine_fn = r'''
pub(super) fn refine_assignment_locally(
    profile: &AssignmentProfile,
    members: &[usize],
    vectors: &[Vec<f32>],
    max_members: usize,
) -> Vec<usize> {
    if members.is_empty() {
        return profile.core_members.clone();
    }
    let core_set = profile.core_members.iter().copied().collect::<HashSet<_>>();
    let local_vectors = members
        .iter()
        .filter_map(|index| vectors.get(*index).cloned())
        .collect::<Vec<_>>();
    let local_threshold = (profile.floor + 0.055).clamp(0.54, 0.88);
    let communities = build_topic_communities(&local_vectors, local_threshold);
    let selected_local = communities
        .iter()
        .max_by(|left, right| {
            let left_core = left
                .members
                .iter()
                .filter(|local| members.get(**local).is_some_and(|value| core_set.contains(value)))
                .count();
            let right_core = right
                .members
                .iter()
                .filter(|local| members.get(**local).is_some_and(|value| core_set.contains(value)))
                .count();
            left_core
                .cmp(&right_core)
                .then_with(|| left.coherence.total_cmp(&right.coherence))
                .then_with(|| left.members.len().cmp(&right.members.len()))
        })
        .map(|community| {
            community
                .members
                .iter()
                .filter_map(|local| members.get(*local).copied())
                .collect::<HashSet<_>>()
        })
        .unwrap_or_default();

    let mut ranked = members
        .iter()
        .copied()
        .filter(|index| {
            core_set.contains(index)
                || selected_local.contains(index)
                || cosine(&profile.vector, &vectors[*index]) >= profile.floor + 0.065
        })
        .map(|index| (index, cosine(&profile.vector, &vectors[index])))
        .collect::<Vec<_>>();
    ranked.sort_by(|left, right| {
        let left_core = core_set.contains(&left.0);
        let right_core = core_set.contains(&right.0);
        right_core
            .cmp(&left_core)
            .then_with(|| right.1.total_cmp(&left.1))
            .then_with(|| left.0.cmp(&right.0))
    });
    ranked.dedup_by_key(|entry| entry.0);
    ranked.truncate(max_members.max(profile.core_members.len()));
    let mut refined = ranked.into_iter().map(|entry| entry.0).collect::<Vec<_>>();
    for core in &profile.core_members {
        if !refined.contains(core) {
            refined.push(*core);
        }
    }
    refined.sort_unstable();
    refined.dedup();
    refined
}

'''
text = replace_once(text, '#[cfg(test)]\nmod tests {', refine_fn + '#[cfg(test)]\nmod tests {', 'refinement function insertion')
text = replace_once(
    text,
    '    #[test]\n    fn competitive_assignment_caps_ambiguous_membership_to_two_topics() {',
    '''    #[test]
    fn local_refinement_drops_remote_assignment_tail() {
        let vectors = vec![
            normalized(&[1.0, 0.0, 0.0]),
            normalized(&[0.99, 0.03, 0.0]),
            normalized(&[0.97, 0.08, 0.0]),
            normalized(&[0.75, 0.66, 0.0]),
            normalized(&[0.0, 1.0, 0.0]),
        ];
        let profile = build_assignment_profile(&[0, 1, 2], &vectors[0], &vectors, 0.60).unwrap();
        let refined = refine_assignment_locally(&profile, &[0, 1, 2, 3, 4], &vectors, 4);
        assert!(refined.contains(&0));
        assert!(refined.contains(&1));
        assert!(refined.contains(&2));
        assert!(!refined.contains(&4));
    }

    #[test]
    fn competitive_assignment_caps_ambiguous_membership_to_two_topics() {''',
    'refinement test',
)
path.write_text(text)

# -----------------------------------------------------------------------------
# Wiki writing: readable web sources, no dead related-Wiki links, focused prose
# -----------------------------------------------------------------------------
path = Path('Elephant/backend/knowledge-core/src/wiki_core.rs')
text = path.read_text()
text = replace_once(
    text,
    'use std::collections::{BTreeMap, HashMap, HashSet};',
    'use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};',
    'BTreeSet import',
)
old_prompt = '''Treat the result as a Wikipedia-quality page, not a short summary. Build a substantial introduction and as many useful sections as the evidence supports, up to {max_sections}. Prefer 12–24 sections for broad topics and 3–8 developed paragraph-length claims per section. Cover definitions, context, history, core concepts, mechanisms, variants, applications, comparisons, limitations, controversies, practical implications, terminology and chronology when relevant. Avoid filler, repetition and invented precision. Every summary and section claim must be an object with text and citation_chunk_ids; summary is always an array, never a string. Claims grounded in the vault cite one or more supplied chunk IDs. Claims grounded in web research cite one or more exact absolute HTTPS URLs returned by web search in citation_chunk_ids. Never invent a chunk ID or URL. Do not place citation markers inside text. related_wikis contains only short concept names suitable for wikilinks, never file paths.'''
new_prompt = '''Write an evidence-driven reference page for this specific vault, not a generic encyclopedia dump. The supplied notes are the primary evidence: identify their recurring ideas, concrete examples, decisions, disagreements and gaps, and exclude notes that only match by a weak keyword or incidental phrase. Use web research only to verify definitions, dates and important external context. Build a concise but substantial introduction and only the sections that materially improve understanding, up to {max_sections}; for broad topics prefer 8–14 sections with 2–5 dense paragraph-length claims each. Do not mechanically enumerate every possible application, risk or historical milestone. Avoid filler, repetition, marketing language, unsupported generalities and invented precision. Every summary and section claim must be an object with text and citation_chunk_ids; summary is always an array, never a string. Claims grounded in the vault cite one or more supplied chunk IDs. Claims grounded in web research cite one or more exact absolute HTTPS URLs returned by web search in citation_chunk_ids. Never invent a chunk ID or URL. Do not place citation markers inside text. related_wikis contains only short concept names; the renderer will keep them non-clickable until a matching Wiki actually exists.'''
text = replace_once(text, old_prompt, new_prompt, 'wiki synthesis prompt')
text = replace_once(
    text,
    '    let mut citation_numbers = BTreeMap::<String, usize>::new();\n    let mut markdown = String::new();',
    '    let mut citation_numbers = BTreeMap::<String, usize>::new();\n    let mut web_citations = BTreeSet::<String>::new();\n    let mut markdown = String::new();',
    'web citation set',
)
text = text.replace(
    '            &source_by_id,\n        )?;',
    '            &source_by_id,\n            &mut web_citations,\n        )?;',
)
if text.count('&mut web_citations') < 2:
    raise SystemExit('render_claims calls were not both updated')
text = regex_once(
    text,
    r'''            markdown\.push_str\(&format!\(\n                "- \[\{\}\]\(\./\{\}\.md\)\n"\s*,\n                related\.trim\(\),\n                slugify\(related\)\n            \)\);''',
    '''            markdown.push_str(&format!("- {}\\n", related.trim()));''',
    'plain related wiki rendering',
    re.S,
)
web_section = r'''
    if !web_citations.is_empty() {
        markdown.push_str("\n## Web sources\n\n");
        for url in &web_citations {
            markdown.push_str(&format!("- [{}]({})\n", web_citation_label(url), url));
        }
    }

'''
text = replace_once(text, '    let slug = slugify(&synthesis.title);', web_section + '    let slug = slugify(&synthesis.title);', 'web sources section')
label_helpers = r'''
fn humanize_url_segment(value: &str) -> String {
    value
        .trim_matches('/')
        .split(|character: char| matches!(character, '-' | '_' | '+'))
        .filter(|part| !part.is_empty())
        .map(|part| {
            let decoded = part.replace("%20", " ");
            let mut characters = decoded.chars();
            characters
                .next()
                .map(|first| first.to_uppercase().collect::<String>() + characters.as_str())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn web_citation_label(url: &str) -> String {
    let without_scheme = url.strip_prefix("https://").unwrap_or(url);
    let mut parts = without_scheme.splitn(2, '/');
    let host = parts.next().unwrap_or("").trim_start_matches("www.");
    let path = parts.next().unwrap_or("");
    let provider = if host.contains("wikipedia.org") {
        "Wikipedia".to_string()
    } else if host.contains("nist.gov") {
        "NIST".to_string()
    } else if host.contains("stanford.edu") {
        "Stanford".to_string()
    } else if host.contains("ibm.com") {
        "IBM".to_string()
    } else if host.contains("arxiv.org") {
        "arXiv".to_string()
    } else {
        host.split('.').next().map(humanize_url_segment).unwrap_or_else(|| "Web".into())
    };
    let last = path
        .split(['?', '#'])
        .next()
        .unwrap_or("")
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("");
    let title = humanize_url_segment(last);
    if title.is_empty() || title.chars().all(|character| character.is_ascii_digit()) {
        provider
    } else {
        format!("{provider} — {title}")
    }
}

'''
text = replace_once(text, 'fn render_claims(\n', label_helpers + 'fn render_claims(\n', 'web citation label helpers')
text = replace_once(
    text,
    '    source_by_id: &HashMap<&str, &WikiSourceChunk>,\n) -> Result<(), String> {',
    '    source_by_id: &HashMap<&str, &WikiSourceChunk>,\n    web_citations: &mut BTreeSet<String>,\n) -> Result<(), String> {',
    'render_claims signature',
)
text = replace_once(
    text,
    '            if is_web_citation(chunk_id) {\n                references.push(format!("[Source web]({chunk_id})"));\n                continue;\n            }',
    '            if is_web_citation(chunk_id) {\n                web_citations.insert(chunk_id.clone());\n                references.push(format!("[{}]({chunk_id})", web_citation_label(chunk_id)));\n                continue;\n            }',
    'readable inline web citation',
)
text = replace_once(
    text,
    '    #[test]\n    fn rejects_uncited_or_unknown_claims() {',
    '''    #[test]
    fn web_citation_labels_are_human_readable() {
        assert_eq!(
            web_citation_label("https://en.wikipedia.org/wiki/Machine_learning"),
            "Wikipedia — Machine Learning"
        );
        assert!(web_citation_label("https://airc.nist.gov/airmf-resources/airmf/0-ai-rmf-1-0/")
            .starts_with("NIST"));
    }

    #[test]
    fn rejects_uncited_or_unknown_claims() {''',
    'web citation label test',
)
path.write_text(text)

# -----------------------------------------------------------------------------
# Existing generated related links become inert unless the target exists
# -----------------------------------------------------------------------------
path = Path('Elephant/backend/tauri/src/knowledge_wiki_library.rs')
text = path.read_text()
new_migrate = r'''fn migrate_related_wikilinks(markdown: &str) -> String {
    let mut in_related_section = false;
    markdown
        .lines()
        .map(|line| {
            let trimmed = line.trim();
            if let Some(heading) = trimmed.strip_prefix("## ") {
                in_related_section = heading.trim().eq_ignore_ascii_case("related wikis");
                return line.to_string();
            }
            if !in_related_section {
                return line.to_string();
            }
            let label = if trimmed.starts_with("- [[") && trimmed.ends_with("]]" ) {
                let raw = &trimmed[4..trimmed.len() - 2];
                let mut parts = raw.splitn(2, '|');
                let target = parts.next().unwrap_or("").split('#').next().unwrap_or("").trim();
                parts.next().unwrap_or(target).trim().to_string()
            } else if let Some(rest) = trimmed.strip_prefix("- [") {
                rest.find("](")
                    .map(|end| rest[..end].trim().to_string())
                    .unwrap_or_default()
            } else {
                String::new()
            };
            if label.is_empty() {
                return line.to_string();
            }
            let indentation = &line[..line.len() - line.trim_start().len()];
            format!("{indentation}- {label}")
        })
        .collect::<Vec<_>>()
        .join("\n")
}
'''
text = regex_once(
    text,
    r'fn migrate_related_wikilinks\(markdown: &str\) -> String \{.*?\n}\n\nfn migrate_legacy_generated_markdown',
    new_migrate + '\nfn migrate_legacy_generated_markdown',
    'related links migration function',
    re.S,
)
text = regex_once(
    text,
    r'''    let has_legacy_related = markdown\.lines\(\)\.any\(\|line\| \{\n        let trimmed = line\.trim\(\);\n        trimmed\.starts_with\(\"- \\[\\[\"\) && trimmed\.ends_with\(\"\\]\\]\"\)\n    \}\);''',
    '''    let mut in_related_section = false;
    let has_legacy_related = markdown.lines().any(|line| {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix("## ") {
            in_related_section = heading.trim().eq_ignore_ascii_case("related wikis");
            return false;
        }
        in_related_section
            && ((trimmed.starts_with("- [[") && trimmed.ends_with("]]"))
                || (trimmed.starts_with("- [") && trimmed.contains("](./")))
    });''',
    'detect standard dead related links',
)
path.write_text(text)

# -----------------------------------------------------------------------------
# Register map command
# -----------------------------------------------------------------------------
path = Path('Elephant/backend/tauri/src/lib_min.rs')
text = path.read_text()
text = replace_once(
    text,
    '            knowledge_wiki_discovery::tauri_knowledge_wiki_semantic_discover,',
    '            knowledge_wiki_discovery::tauri_knowledge_wiki_embedding_map,\n            knowledge_wiki_discovery::tauri_knowledge_wiki_semantic_discover,',
    'register embedding map command',
)
path.write_text(text)

# -----------------------------------------------------------------------------
# Live graph construction and provisional Wiki approval
# -----------------------------------------------------------------------------
path = Path('Elephant/frontend/app/components/views/AtomicGraphView.vue')
text = path.read_text()
text = replace_once(
    text,
    '''          <button
            type="button"
            class="en-card-open"
            @click="openSelectedNode"
          >
            Ouvrir la note
            <ArrowRight class="en-card-open-icn" />
          </button>''',
    '''          <div v-if="selectedNode.kind === 'wiki-candidate'" class="en-card-candidate-actions">
            <button type="button" class="en-card-open" @click="approveLiveWikiZone">
              Proposer ce Wiki
              <ArrowRight class="en-card-open-icn" />
            </button>
            <button type="button" class="en-card-reject" @click="rejectLiveWikiZone">Ignorer</button>
          </div>
          <button
            v-else
            type="button"
            class="en-card-open"
            @click="openSelectedNode"
          >
            {{ selectedNode.kind === 'wiki' ? 'Ouvrir le Wiki' : 'Ouvrir la note' }}
            <ArrowRight class="en-card-open-icn" />
          </button>''',
    'candidate actions template',
)
text = replace_once(
    text,
    'const indexBuilding = ref(false)\n',
    '''const indexBuilding = ref(false)
const embeddingProgress = ref(null)
const embeddedVisiblePaths = ref(new Set())
const liveWikiZones = ref([])
const pendingEmbeddedPaths = []
let embeddingRevealRaf = null
let embeddingUnlisten = null
let mapBuildStartedForVault = ''
''',
    'live graph state',
)
old_raw = '''const rawGraph = computed(() => {
  if (indexReady.value) {
    return selectSemanticGraphSource({
      inspectionGraph: searchStore.indexInspection?.graph
    })
  }
  return fallbackGraph.value || { nodes: [], edges: [], clusters: [] }
})'''
new_raw = '''const rawGraph = computed(() => {
  const base = indexReady.value
    ? selectSemanticGraphSource({ inspectionGraph: searchStore.indexInspection?.graph })
    : (fallbackGraph.value || { nodes: [], edges: [], clusters: [] })
  if (!liveWikiZones.value.length) return base
  const nodes = [...(base.nodes || [])]
  const edges = [...(base.edges || [])]
  const nodeIdByPath = new Map(nodes.map((node) => [node.relativePath || node.path || node.id, node.id]))
  for (const zone of liveWikiZones.value) {
    const id = `wiki-candidate:${zone.id || zone.topic || zone.title}`
    nodes.push({
      id,
      path: '',
      relativePath: '',
      title: zone.title || 'Wiki possible',
      kind: 'wiki-candidate',
      type: 'wiki-candidate',
      summary: zone.preview || 'Zone sémantique provisoire',
      sourceCount: Number(zone.sourceCount || zone.sourcePaths?.length || 0),
      chunkCount: 0,
      sourcePaths: zone.sourcePaths || [],
      topic: zone.topic || zone.title || '',
      provisional: true
    })
    for (const sourcePath of zone.sourcePaths || []) {
      const target = nodeIdByPath.get(sourcePath)
      if (!target) continue
      edges.push({
        id: `${id}:${target}`,
        source: id,
        target,
        type: 'wiki-source',
        relationType: 'provisional_wiki_source',
        weight: 1,
        provisional: true
      })
    }
  }
  return { ...base, nodes, edges }
})'''
text = replace_once(text, old_raw, new_raw, 'raw graph live zones')
text = replace_once(
    text,
    "const statusMessage = computed(() => {\n  if (indexBuilding.value) return 'Construction de l\\'index sémantique…'",
    '''const statusMessage = computed(() => {
  if (indexBuilding.value && embeddingProgress.value) {
    const processed = Number(embeddingProgress.value.processed || 0)
    const total = Number(embeddingProgress.value.total || 0)
    return total > 0 ? `Embedding et construction du graphe… ${processed}/${total}` : 'Préparation de l’index sémantique…'
  }
  if (indexBuilding.value) return 'Construction de l\\'index sémantique…'
''',
    'progress status',
)
text = replace_once(text, "    const isWiki = node.kind === 'wiki'", "    const isWiki = node.kind === 'wiki' || node.kind === 'wiki-candidate'", 'candidate wiki node')
text = replace_once(
    text,
    '''    const hiddenByQuery = !queryVisibleIds.has(id)
    const hiddenByTimelapse = timelapseVisibleIds ? !timelapseVisibleIds.has(id) : false
    graphInstance.setNodeAttribute(id, 'hidden', hiddenByQuery || hiddenByTimelapse)''',
    '''    const hiddenByQuery = !queryVisibleIds.has(id)
    const hiddenByTimelapse = timelapseVisibleIds ? !timelapseVisibleIds.has(id) : false
    const data = graphInstance.getNodeAttribute(id, 'data') || {}
    const path = data.relativePath || data.path || id
    const isCandidate = data.kind === 'wiki-candidate' || data.kind === 'wiki'
    const hiddenByEmbedding = indexBuilding.value && embeddedVisiblePaths.value.size > 0 && !isCandidate && !embeddedVisiblePaths.value.has(path)
    graphInstance.setNodeAttribute(id, 'hidden', hiddenByQuery || hiddenByTimelapse || hiddenByEmbedding)''',
    'embedding visibility',
)
functions = r'''
function scheduleEmbeddedReveal () {
  if (embeddingRevealRaf !== null) return
  const reveal = () => {
    const next = new Set(embeddedVisiblePaths.value)
    for (let index = 0; index < 8 && pendingEmbeddedPaths.length; index++) {
      next.add(pendingEmbeddedPaths.shift())
    }
    embeddedVisiblePaths.value = next
    refreshGraphVisibility()
    if (pendingEmbeddedPaths.length) embeddingRevealRaf = requestAnimationFrame(reveal)
    else embeddingRevealRaf = null
  }
  embeddingRevealRaf = requestAnimationFrame(reveal)
}

function handleEmbeddingProgress (event) {
  const payload = event?.payload || event || {}
  embeddingProgress.value = payload
  if (payload.phase === 'start') {
    indexBuilding.value = true
    embeddedVisiblePaths.value = new Set()
    liveWikiZones.value = []
    pendingEmbeddedPaths.splice(0)
    if (!graphData.value?.nodes?.length) {
      loadGraphData()
      scheduleGraphMount()
    }
    return
  }
  if (payload.phase === 'note' && payload.path) {
    pendingEmbeddedPaths.push(payload.path)
    scheduleEmbeddedReveal()
    return
  }
  if ((payload.phase === 'zones' || payload.phase === 'complete') && Array.isArray(payload.zones)) {
    liveWikiZones.value = payload.zones
    loadGraphData()
    scheduleGraphMount()
  }
  if (payload.phase === 'complete') {
    indexBuilding.value = false
  }
}

async function installEmbeddingProgressListener () {
  try {
    const { listen } = await import('@tauri-apps/api/event')
    embeddingUnlisten = await listen('elephantnote:knowledge:embedding-progress', handleEmbeddingProgress)
  } catch (error) {
    console.warn('AtomicGraphView: embedding progress listener unavailable', error)
  }
}

async function buildSemanticMap () {
  const vaultPath = store.activeVault?.path || ''
  if (!vaultPath || mapBuildStartedForVault === vaultPath) return
  mapBuildStartedForVault = vaultPath
  indexBuilding.value = true
  try {
    const invoke = globalThis.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') return
    const result = await invoke('tauri_knowledge_wiki_embedding_map')
    if (Array.isArray(result?.zones)) liveWikiZones.value = result.zones
    await searchStore.inspect()
  } catch (error) {
    console.error('AtomicGraphView: semantic map build failed', error)
  } finally {
    indexBuilding.value = false
    loadGraphData()
    scheduleGraphMount()
  }
}

async function approveLiveWikiZone () {
  const zone = selectedNode.value
  if (!zone || zone.kind !== 'wiki-candidate') return
  try {
    const invoke = globalThis.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') return
    await invoke('tauri_knowledge_wiki_library_add_candidate', {
      topic: zone.topic || zone.title,
      title: zone.title,
      sourcePaths: zone.sourcePaths || []
    })
    liveWikiZones.value = liveWikiZones.value.filter((item) => `wiki-candidate:${item.id || item.topic || item.title}` !== selectedNodeRef)
    deselectNode()
    window.dispatchEvent(new CustomEvent('elephantnote:knowledge-changed', { detail: { reason: 'live-wiki-approved' } }))
    loadGraphData()
    scheduleGraphMount()
  } catch (error) {
    console.error('AtomicGraphView: approve live Wiki zone failed', error)
  }
}

async function rejectLiveWikiZone () {
  const zone = selectedNode.value
  if (!zone || zone.kind !== 'wiki-candidate') return
  try {
    const invoke = globalThis.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') return
    await invoke('tauri_knowledge_wiki_library_reject', { topic: zone.topic || zone.title })
    liveWikiZones.value = liveWikiZones.value.filter((item) => `wiki-candidate:${item.id || item.topic || item.title}` !== selectedNodeRef)
    deselectNode()
    loadGraphData()
    scheduleGraphMount()
  } catch (error) {
    console.error('AtomicGraphView: reject live Wiki zone failed', error)
  }
}

'''
text = replace_once(text, 'function openSelectedNode () {', functions + 'function openSelectedNode () {', 'live graph functions')
text = replace_once(
    text,
    '''onMounted(() => {
  canvasStore.loadPositions(store.activeVaultId || 'default')
  ensureGraphData()
})''',
    '''onMounted(() => {
  canvasStore.loadPositions(store.activeVaultId || 'default')
  void installEmbeddingProgressListener()
  ensureGraphData()
  void buildSemanticMap()
})''',
    'graph mount semantic map',
)
text = replace_once(
    text,
    '''  if (graphMountRaf) cancelAnimationFrame(graphMountRaf)
  destroySigma()''',
    '''  if (graphMountRaf) cancelAnimationFrame(graphMountRaf)
  if (embeddingRevealRaf) cancelAnimationFrame(embeddingRevealRaf)
  if (typeof embeddingUnlisten === 'function') embeddingUnlisten()
  destroySigma()''',
    'graph unmount progress cleanup',
)
text = replace_once(
    text,
    '.en-graph-premium {',
    '''.en-card-candidate-actions {
  display: flex;
  gap: 8px;
}

.en-card-candidate-actions .en-card-open {
  flex: 1;
}

.en-card-reject {
  border: 1px solid var(--en-border);
  border-radius: 9px;
  padding: 0 14px;
  color: var(--en-muted);
  background: var(--en-soft);
}

.en-graph-premium {''',
    'candidate actions css',
)
path.write_text(text)

# -----------------------------------------------------------------------------
# Regression contracts
# -----------------------------------------------------------------------------
path = Path('tests/app/unit/wikiDiscoveryQualityRegression.spec.js')
text = path.read_text()
anchor = "    expect(source).toContain('wiki:semantic-discovery-v2')\n"
if anchor in text:
    text = replace_once(
        text,
        anchor,
        anchor + "    expect(source).toContain('tauri_knowledge_wiki_embedding_map')\n    expect(source).toContain('elephantnote:knowledge:embedding-progress')\n    expect(source).toContain('refine_assignment_locally')\n",
        'wiki discovery regression assertions',
    )
path.write_text(text)

path = Path('tests/app/unit/graphWikiScaleRegression.spec.js')
text = path.read_text()
anchor = "    expect(source).toContain('Selecting a note must not rewrite the camera ratio')\n"
text = replace_once(
    text,
    anchor,
    anchor + "    expect(source).toContain('tauri_knowledge_wiki_embedding_map')\n    expect(source).toContain('wiki-candidate')\n",
    'graph live regression assertions',
)
path.write_text(text)

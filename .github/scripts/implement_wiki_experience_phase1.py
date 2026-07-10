from pathlib import Path
import re

ROOT = Path('.')


def load(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def save(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    text = load(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one occurrence, found {count}: {old[:120]!r}')
    save(path, text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    text = load(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{path}: regex expected one occurrence, found {count}: {pattern[:120]!r}')
    save(path, updated)


# ---------------------------------------------------------------------------
# AI settings: Provider, Model and Reasoning share one desktop row.
# ---------------------------------------------------------------------------
settings = 'Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue'
replace_once(
    settings,
    '        <div class="en-ai-card-body en-ai-grid">\n          <label>\n            <span>Provider</span>\n',
    '        <div class="en-ai-card-body en-ai-grid en-ai-chat-route-grid">\n          <label>\n            <span>Provider</span>\n'
)
replace_once(
    settings,
    '.en-provider-form, .en-ai-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }',
    '.en-provider-form, .en-ai-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }\n.en-ai-chat-route-grid { grid-template-columns: minmax(220px, 1fr) minmax(260px, 1.2fr) minmax(150px, .55fr); }\n.en-ai-chat-route-grid label.wide { grid-column: 1 / -1; }'
)
replace_once(
    settings,
    '  .en-provider-form, .en-ai-grid { grid-template-columns: 1fr; }\n  label.wide { grid-column: auto; }',
    '  .en-provider-form, .en-ai-grid, .en-ai-chat-route-grid { grid-template-columns: 1fr; }\n  label.wide, .en-ai-chat-route-grid label.wide { grid-column: auto; }'
)


# ---------------------------------------------------------------------------
# Candidate discovery: reject low-information words, add title phrases and
# produce a deterministic preview instead of a bare frequency explanation.
# ---------------------------------------------------------------------------
wikis = 'Elephant/backend/tauri/src/knowledge_wikis.rs'
replace_once(
    wikis,
    'pub struct WikiCandidate {\n    pub topic: String,\n    pub title: String,\n    pub source_paths: Vec<String>,\n    pub reason: String,\n    pub score: usize,\n}',
    'pub struct WikiCandidate {\n    pub topic: String,\n    pub title: String,\n    pub source_paths: Vec<String>,\n    pub reason: String,\n    pub preview: String,\n    pub suggested_sections: Vec<String>,\n    pub source_titles: Vec<String>,\n    pub score: usize,\n}'
)
replace_once(
    wikis,
    '        "getting",\n        "started",\n    ];',
    '        "getting",\n        "started",\n        "elle",\n        "elles",\n        "il",\n        "ils",\n        "lui",\n        "eux",\n        "votre",\n        "vos",\n        "notre",\n        "nos",\n        "leur",\n        "leurs",\n        "celui",\n        "celle",\n        "ceux",\n        "celles",\n        "quel",\n        "quelle",\n        "quels",\n        "quelles",\n        "tout",\n        "tous",\n        "toute",\n        "toutes",\n        "cours",\n        "article",\n        "page",\n        "document",\n        "contenu",\n        "misc",\n        "other",\n        "general",\n        "untitled",\n        "mine",\n        "yours",\n        "ours",\n        "theirs",\n        "some",\n        "each",\n        "every",\n    ];'
)
replace_once(
    wikis,
    '    match signal {\n        "hashtag" => entry.hashtag_hits += 1,\n        "folder" => entry.folder_hits += 1,\n        _ => entry.title_hits += 1,\n    }',
    '    match signal {\n        "hashtag" => entry.hashtag_hits += 1,\n        "folder" => entry.folder_hits += 1,\n        "title_phrase" => entry.title_hits += 2,\n        _ => entry.title_hits += 1,\n    }'
)
replace_once(
    wikis,
    '    let mut groups = HashMap::<String, CandidateAccumulator>::new();\n\n    for row in rows {',
    '    let mut groups = HashMap::<String, CandidateAccumulator>::new();\n    let mut document_titles = HashMap::<String, String>::new();\n\n    for row in rows {'
)
replace_once(
    wikis,
    '        let (path, title, first_chunk) = row.map_err(|error| error.to_string())?;\n        let mut seen_in_document = HashSet::new();\n        for token in title.split_whitespace() {\n            let signal = if token.starts_with(\'#\') {\n                "hashtag"\n            } else {\n                "title"\n            };\n            if let Some(topic) = normalized_candidate_word(token) {\n                if seen_in_document.insert(topic.clone()) {\n                    add_candidate_signal(&mut groups, topic, &path, signal);\n                }\n            }\n        }',
    '        let (path, title, first_chunk) = row.map_err(|error| error.to_string())?;\n        document_titles.insert(path.clone(), title.clone());\n        let mut seen_in_document = HashSet::new();\n        let mut title_topics = Vec::new();\n        for token in title.split_whitespace() {\n            let signal = if token.starts_with(\'#\') {\n                "hashtag"\n            } else {\n                "title"\n            };\n            if let Some(topic) = normalized_candidate_word(token) {\n                if seen_in_document.insert(topic.clone()) {\n                    add_candidate_signal(&mut groups, topic.clone(), &path, signal);\n                }\n                if signal == "title" {\n                    title_topics.push(topic);\n                }\n            }\n        }\n        for pair in title_topics.windows(2) {\n            if pair[0] == pair[1] {\n                continue;\n            }\n            let phrase = format!("{} {}", pair[0], pair[1]);\n            if seen_in_document.insert(phrase.clone()) {\n                add_candidate_signal(&mut groups, phrase, &path, "title_phrase");\n            }\n        }'
)
old_candidates = '''    let mut candidates = groups
        .into_iter()
        .filter_map(|(topic, group)| {
            if existing_topics.contains(&topic) || group.paths.len() < 3 {
                return None;
            }
            let score = group.hashtag_hits * 4 + group.folder_hits * 2 + group.title_hits;
            if score < 6 {
                return None;
            }
            let mut source_paths = group.paths.into_iter().collect::<Vec<_>>();
            source_paths.sort();
            source_paths.truncate(DEFAULT_MAX_DOCUMENTS);
            let reason = if group.hashtag_hits >= group.folder_hits
                && group.hashtag_hits >= group.title_hits
            {
                format!("{} notes partagent le thème #{}", source_paths.len(), topic)
            } else if group.folder_hits >= group.title_hits {
                format!(
                    "{} notes forment un groupe de dossier cohérent",
                    source_paths.len()
                )
            } else {
                format!(
                    "{} notes répètent ce concept dans leur titre",
                    source_paths.len()
                )
            };
            Some(WikiCandidate {
                title: title_for_topic(&topic),
                topic,
                source_paths,
                reason,
                score,
            })
        })
        .collect::<Vec<_>>();'''
new_candidates = '''    let mut candidates = groups
        .into_iter()
        .filter_map(|(topic, group)| {
            if existing_topics.contains(&topic) || group.paths.len() < 3 {
                return None;
            }
            let score = group.hashtag_hits * 4 + group.folder_hits * 2 + group.title_hits;
            let phrase_topic = topic.contains(' ');
            if score < 6
                || (!phrase_topic
                    && group.hashtag_hits == 0
                    && group.folder_hits == 0
                    && group.title_hits < 5)
            {
                return None;
            }
            let mut source_paths = group.paths.into_iter().collect::<Vec<_>>();
            source_paths.sort();
            source_paths.truncate(DEFAULT_MAX_DOCUMENTS);
            let source_titles = source_paths
                .iter()
                .filter_map(|path| document_titles.get(path))
                .cloned()
                .collect::<Vec<_>>();
            let topic_terms = topic.split_whitespace().collect::<HashSet<_>>();
            let mut section_counts = HashMap::<String, usize>::new();
            for title in &source_titles {
                let mut seen = HashSet::new();
                for token in title.split_whitespace().filter_map(normalized_candidate_word) {
                    if topic_terms.contains(token.as_str()) || !seen.insert(token.clone()) {
                        continue;
                    }
                    *section_counts.entry(token).or_default() += 1;
                }
            }
            let mut section_scores = section_counts.into_iter().collect::<Vec<_>>();
            section_scores.sort_by(|left, right| {
                right.1.cmp(&left.1).then(left.0.cmp(&right.0))
            });
            let mut suggested_sections = section_scores
                .into_iter()
                .filter(|(_, count)| *count >= 2)
                .take(4)
                .map(|(value, _)| title_for_topic(&value))
                .collect::<Vec<_>>();
            if suggested_sections.is_empty() {
                suggested_sections = vec!["Vue d’ensemble".into(), "Références principales".into()];
            }
            let reason = if group.hashtag_hits >= group.folder_hits
                && group.hashtag_hits >= group.title_hits
            {
                format!("{} notes partagent le thème #{}", source_paths.len(), topic)
            } else if group.folder_hits >= group.title_hits {
                format!(
                    "{} notes forment un groupe de dossier cohérent",
                    source_paths.len()
                )
            } else if phrase_topic {
                format!(
                    "{} notes partagent le concept spécifique « {} »",
                    source_paths.len(), topic
                )
            } else {
                format!(
                    "{} notes répètent ce concept dans leur titre",
                    source_paths.len()
                )
            };
            let preview = format!(
                "Synthèse de {} notes autour de {}. Axes probables : {}.",
                source_paths.len(),
                title_for_topic(&topic),
                suggested_sections.join(", ")
            );
            Some(WikiCandidate {
                title: title_for_topic(&topic),
                topic,
                source_paths,
                reason,
                preview,
                suggested_sections,
                source_titles,
                score,
            })
        })
        .collect::<Vec<_>>();'''
replace_once(wikis, old_candidates, new_candidates)


# ---------------------------------------------------------------------------
# Library objects expose the proposal preview to the renderer.
# ---------------------------------------------------------------------------
library = 'Elephant/backend/tauri/src/knowledge_wiki_library.rs'
replace_once(
    library,
    '    pub excerpt: String,\n    pub reason: String,\n    pub path: Option<String>,',
    '    pub excerpt: String,\n    pub reason: String,\n    pub preview: String,\n    pub suggested_sections: Vec<String>,\n    pub source_titles: Vec<String>,\n    pub path: Option<String>,'
)
replace_once(
    library,
    '        excerpt: candidate.reason.clone(),\n        reason: candidate.reason,\n        path: None,',
    '        excerpt: candidate.preview.clone(),\n        reason: candidate.reason,\n        preview: candidate.preview,\n        suggested_sections: candidate.suggested_sections,\n        source_titles: candidate.source_titles,\n        path: None,'
)
old_draft_item = '''fn draft_item(root: &Path, draft: WikiDraft) -> WikiLibraryItem {
    let (path, markdown) = disk_markdown(root, &draft);
    let status = match draft.status {
        WikiDraftStatus::Accepted => "ready",
        WikiDraftStatus::Outdated => "outdated",
        WikiDraftStatus::Proposed => "draft",
        WikiDraftStatus::Rejected => "rejected",
    };
    WikiLibraryItem {
        id: format!("wiki:{}", draft.id),
        kind: "wiki".into(),
        status: status.into(),
        title: draft.title,
        topic: draft.topic,
        excerpt: plain_excerpt(&markdown),
        reason: String::new(),
        path,
        source_paths: draft.source_paths,
        score: 0,
        model_id: draft.model_id,
        markdown,
        draft_id: Some(draft.id),
        citations_count: draft.citations.len(),
        updated_at: draft.updated_at,
    }
}'''
new_draft_item = '''fn draft_item(root: &Path, draft: WikiDraft) -> WikiLibraryItem {
    let (path, markdown) = disk_markdown(root, &draft);
    let status = match draft.status {
        WikiDraftStatus::Accepted => "ready",
        WikiDraftStatus::Outdated => "outdated",
        WikiDraftStatus::Proposed => "draft",
        WikiDraftStatus::Rejected => "rejected",
    };
    let excerpt = plain_excerpt(&markdown);
    let source_titles = draft
        .source_paths
        .iter()
        .map(|path| {
            Path::new(path)
                .file_stem()
                .and_then(|name| name.to_str())
                .unwrap_or(path)
                .to_string()
        })
        .collect::<Vec<_>>();
    WikiLibraryItem {
        id: format!("wiki:{}", draft.id),
        kind: "wiki".into(),
        status: status.into(),
        title: draft.title,
        topic: draft.topic,
        excerpt: excerpt.clone(),
        reason: String::new(),
        preview: excerpt,
        suggested_sections: Vec::new(),
        source_titles,
        path,
        source_paths: draft.source_paths,
        score: 0,
        model_id: draft.model_id,
        markdown,
        draft_id: Some(draft.id),
        citations_count: draft.citations.len(),
        updated_at: draft.updated_at,
    }
}'''
replace_once(library, old_draft_item, new_draft_item)


# ---------------------------------------------------------------------------
# Wiki library UX: real preview on click, honest rebuild action, wider cards,
# and immediate graph/search invalidation after lifecycle changes.
# ---------------------------------------------------------------------------
wiki_view = 'Elephant/frontend/app/components/views/WikiView.vue'
replace_once(wiki_view, '@click="loadLibrary"', '@click="analyseNotes"')
replace_once(
    wiki_view,
    '''        <p class="en-wiki-excerpt">
          {{ entry.excerpt || 'Wiki sans aperçu.' }}
        </p>

        <div class="en-wiki-meta">''',
    '''        <p class="en-wiki-excerpt">
          {{ entry.excerpt || 'Wiki sans aperçu.' }}
        </p>

        <section
          v-if="entry.kind === 'suggestion' && selectedSuggestionId === entry.id"
          class="en-wiki-preview"
          @click.stop
        >
          <strong>Ce Wiki proposerait</strong>
          <p>{{ entry.preview || entry.reason }}</p>
          <div v-if="entry.suggestedSections?.length" class="en-wiki-preview-section">
            <span>Plan probable</span>
            <ul>
              <li v-for="section in entry.suggestedSections" :key="section">{{ section }}</li>
            </ul>
          </div>
          <div v-if="entry.sourceTitles?.length" class="en-wiki-preview-section">
            <span>Notes principales</span>
            <ul>
              <li v-for="title in entry.sourceTitles.slice(0, 6)" :key="title">{{ title }}</li>
            </ul>
          </div>
        </section>

        <div class="en-wiki-meta">'''
)
replace_once(
    wiki_view,
    "import { useVaultStore } from '../../stores/vaultStore'",
    "import { useVaultStore } from '../../stores/vaultStore'\nimport { useSearchStore } from '../../stores/searchStore'"
)
replace_once(
    wiki_view,
    'const store = useVaultStore()\nconst entries = ref([])',
    'const store = useVaultStore()\nconst searchStore = useSearchStore()\nconst entries = ref([])'
)
replace_once(
    wiki_view,
    '''const loadLibrary = async() => {
  if (runtimeUnavailable.value || loading.value) return
  loading.value = true
  globalError.value = ''
  try {
    const result = await runtime.value.libraryList({ limit: 500 })
    entries.value = Array.isArray(result) ? result : []
  } catch (error) {
    globalError.value = normalizeError(error)
  } finally {
    loading.value = false
  }
}
''',
    '''const loadLibrary = async() => {
  if (runtimeUnavailable.value || loading.value) return
  loading.value = true
  globalError.value = ''
  try {
    const result = await runtime.value.libraryList({ limit: 500 })
    entries.value = Array.isArray(result) ? result : []
  } catch (error) {
    globalError.value = normalizeError(error)
  } finally {
    loading.value = false
  }
}

const refreshKnowledgeViews = async(reason) => {
  window.dispatchEvent(new CustomEvent('elephantnote:knowledge-changed', { detail: { reason } }))
  try {
    await searchStore.inspect()
  } catch {
    // The Wiki operation succeeded; a later Graph open can retry inspection.
  }
}

const analyseNotes = async() => {
  if (runtimeUnavailable.value || loading.value) return
  loading.value = true
  globalError.value = ''
  try {
    await globalThis.elephantnote?.knowledge?.rebuild?.()
    const result = await runtime.value.libraryList({ limit: 500 })
    entries.value = Array.isArray(result) ? result : []
    await refreshKnowledgeViews('wiki-analysis')
  } catch (error) {
    globalError.value = normalizeError(error)
  } finally {
    loading.value = false
  }
}
'''
)
replace_once(
    wiki_view,
    '    await loadLibrary()\n  } catch (error) {\n    setEntryError(entry.id, normalizeError(error))',
    '    await loadLibrary()\n    await refreshKnowledgeViews(\'wiki-generated\')\n  } catch (error) {\n    setEntryError(entry.id, normalizeError(error))'
)
replace_once(
    wiki_view,
    "    selectedSuggestionId.value = ''\n  } catch (error) {\n    setEntryError(entry.id, normalizeError(error))",
    "    selectedSuggestionId.value = ''\n    await refreshKnowledgeViews('wiki-suggestion-rejected')\n  } catch (error) {\n    setEntryError(entry.id, normalizeError(error))"
)
replace_once(
    wiki_view,
    '    await runtime.value.accept(entry.draftId)\n    await loadLibrary()',
    "    await runtime.value.accept(entry.draftId)\n    await loadLibrary()\n    await refreshKnowledgeViews('wiki-published')"
)
replace_once(
    wiki_view,
    '    entries.value = entries.value.filter((item) => item.id !== entry.id)\n  } catch (error) {\n    setEntryError(entry.id, normalizeError(error))',
    "    entries.value = entries.value.filter((item) => item.id !== entry.id)\n    await refreshKnowledgeViews('wiki-deleted')\n  } catch (error) {\n    setEntryError(entry.id, normalizeError(error))"
)
replace_once(
    wiki_view,
    '  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));',
    '  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));'
)
replace_once(
    wiki_view,
    '  font-size: clamp(22px, 1.8vw, 30px);',
    '  font-size: clamp(19px, 1.35vw, 24px);'
)
replace_once(
    wiki_view,
    '''.en-wiki-meta {
  display: flex;''',
    '''.en-wiki-preview {
  display: grid;
  gap: 10px;
  margin: 0 0 14px;
  border-top: 1px solid var(--en-border);
  border-bottom: 1px solid var(--en-border);
  padding: 12px 0;
  color: var(--en-text);
}

.en-wiki-preview > p {
  margin: 0;
  color: var(--en-muted);
  line-height: 1.45;
}

.en-wiki-preview-section {
  display: grid;
  gap: 4px;
}

.en-wiki-preview-section > span {
  color: var(--en-muted);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.en-wiki-preview-section ul {
  margin: 0;
  padding-left: 18px;
  color: var(--en-muted);
  font-size: 13px;
}

.en-wiki-meta {
  display: flex;'''
)


# ---------------------------------------------------------------------------
# Chat runtime: respect the RAG switch, accurately explain indexed-note access,
# honour the custom system prompt and expose citations under the renderer key.
# ---------------------------------------------------------------------------
chat_runtime = 'Elephant/backend/tauri/src/chat_runtime.rs'
pattern = r'''#\[cfg\(not\(mobile\)\)\]\nfn grounded_messages\(.*?\n\}\n\n#\[cfg\(not\(mobile\)\)\]\nfn local_runtime_config'''
replacement = '''#[cfg(not(mobile))]
fn rag_enabled(payload: &Value) -> bool {
    ai_config(payload)
        .pointer("/routes/chat/enableRag")
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

#[cfg(not(mobile))]
fn configured_system_prompt(payload: &Value) -> String {
    text(
        ai_config(payload)
            .pointer("/routes/chat")
            .unwrap_or(&Value::Null),
        &["systemPrompt", "system_prompt"],
    )
}

#[cfg(not(mobile))]
fn grounded_messages(
    app: &AppHandle,
    payload: &Value,
    query: &str,
) -> (Vec<Value>, Vec<KnowledgeSearchHit>) {
    let hits = if rag_enabled(payload) {
        knowledge_hits(app, query, 6)
    } else {
        Vec::new()
    };
    let context = hits
        .iter()
        .enumerate()
        .map(|(index, hit)| {
            format!(
                "[{}] {} — {} ({})\\n{}",
                index + 1,
                hit.title,
                hit.heading,
                hit.relative_path,
                hit.excerpt
            )
        })
        .collect::<Vec<_>>()
        .join("\\n\\n");
    let access_contract = if !rag_enabled(payload) {
        "La recherche dans les notes est désactivée pour cette requête. Ne prétends pas avoir consulté la vault."
            .to_string()
    } else if hits.is_empty() {
        "Tu peux interroger l’index local ElephantNote, mais aucun passage pertinent n’a été trouvé pour cette requête. Ne dis pas que tu n’as aucun accès aux notes : précise seulement qu’aucun résultat pertinent n’a été récupéré."
            .to_string()
    } else {
        format!(
            "Tu peux consulter les passages de notes indexées fournis ci-dessous. Utilise-les pour les affirmations concernant la vault et cite-les avec [1], [2], etc. Tu n’as pas un accès libre au disque : ton accès est limité à l’index et aux outils ElephantNote. N’affirme jamais que tu n’as aucun accès aux notes lorsque des passages sont présents.\\n\\n{context}"
        )
    };
    let custom = configured_system_prompt(payload);
    let system = if custom.is_empty() {
        format!("Tu es l’assistant ElephantNote. Réponds en français par défaut. {access_contract}")
    } else {
        format!("{custom}\\n\\nCapacités ElephantNote : {access_contract}")
    };
    let mut messages = vec![json!({ "role": "system", "content": system })];
    messages.extend(extract_messages(payload));
    (messages, hits)
}

#[cfg(not(mobile))]
fn citations_from_hits(hits: &[KnowledgeSearchHit]) -> Vec<Value> {
    hits.iter()
        .map(|hit| {
            json!({
                "path": hit.relative_path,
                "relativePath": hit.relative_path,
                "title": hit.title,
                "heading": hit.heading,
                "chunkId": hit.chunk_id,
                "excerpt": hit.excerpt,
                "score": hit.score,
                "startOffset": hit.start_offset,
                "endOffset": hit.end_offset
            })
        })
        .collect()
}

#[cfg(not(mobile))]
fn local_runtime_config'''
regex_once(chat_runtime, pattern, replacement, flags=re.S)
replace_once(
    chat_runtime,
    '''        let result =
            codex_app_server::chat_with_effort(&app, &model, &prompt, reasoning_effort.as_deref())
                .await?;
        return Ok(json!({
            "answer": result.answer,
            "sources": hits,''',
    '''        let result =
            codex_app_server::chat_with_effort(&app, &model, &prompt, reasoning_effort.as_deref())
                .await?;
        let citations = citations_from_hits(&hits);
        return Ok(json!({
            "answer": result.answer,
            "sources": hits,
            "citations": citations,'''
)
replace_once(
    chat_runtime,
    '''        let local =
            local_llama_runtime::chat_with_selected_model(&app, &model, &messages, &payload)
                .await?
                .ok_or_else(|| format!("Selected local model could not be resolved: {model}"))?;
        Ok(json!({
          "answer": local.answer,
          "sources": hits,''',
    '''        let local =
            local_llama_runtime::chat_with_selected_model(&app, &model, &messages, &payload)
                .await?
                .ok_or_else(|| format!("Selected local model could not be resolved: {model}"))?;
        let citations = citations_from_hits(&hits);
        Ok(json!({
          "answer": local.answer,
          "sources": hits,
          "citations": citations,'''
)


# Renderer wording and citation fallback.
chat_view = 'Elephant/frontend/app/components/views/ChatView.vue'
replace_once(
    chat_view,
    "chatStore.setRuntimeMessage('Searching notes and generating with local AI...')",
    "chatStore.setRuntimeMessage('Searching indexed notes and generating an answer...')"
)
replace_once(
    chat_view,
    "    chatStore.setRuntimeMessage('Answered with local RAG.')",
    "    chatStore.setRuntimeMessage(result?.provider === 'codex' ? 'Answered with Codex and indexed notes.' : 'Answered with the configured AI route.')"
)
replace_once(
    chat_view,
    '      citations: result?.citations || [],',
    '      citations: result?.citations || result?.sources || [],'
)


# ---------------------------------------------------------------------------
# Render source references as standard Markdown links that Muya already knows,
# instead of unsupported footnote markers and WikiLink-only targets.
# ---------------------------------------------------------------------------
wiki_core = 'Elephant/backend/knowledge-core/src/wiki_core.rs'
replace_once(
    wiki_core,
    '''    if !synthesis.related_wikis.is_empty() {
        markdown.push_str("\n## Related wikis\n\n");
        for related in &synthesis.related_wikis {
            markdown.push_str(&format!("- [[{}]]\n", related.trim()));
        }
    }

    let mut citations = Vec::new();
    if !citation_numbers.is_empty() {
        markdown.push_str("\n## Sources\n\n");
        for (chunk_id, number) in &citation_numbers {
            let source = source_by_id
                .get(chunk_id.as_str())
                .ok_or_else(|| format!("Missing source chunk while rendering: {chunk_id}"))?;
            let key = format!("source-{number}");
            let anchor = if source.heading.trim().is_empty() {
                String::new()
            } else {
                format!("#{}", source.heading.trim())
            };
            markdown.push_str(&format!(
                "[^{}]: [[{}{}|{} — {}]] (bytes {}–{})\n",
                key,
                source.document_path,
                anchor,
                source.document_title,
                source.heading,
                source.start_offset,
                source.end_offset
            ));
            citations.push(WikiCitation {
                key,
                document_path: source.document_path.clone(),
                document_title: source.document_title.clone(),
                chunk_id: source.chunk_id.clone(),
                heading: source.heading.clone(),
                start_offset: source.start_offset,
                end_offset: source.end_offset,
            });
        }
    }''',
    '''    if !synthesis.related_wikis.is_empty() {
        markdown.push_str("\n## Related wikis\n\n");
        for related in &synthesis.related_wikis {
            markdown.push_str(&format!(
                "- [{}](./{}.md)\n",
                related.trim(),
                slugify(related)
            ));
        }
    }

    let mut citations = Vec::new();
    if !citation_numbers.is_empty() {
        markdown.push_str("\n## Sources\n\n");
        let mut numbered = citation_numbers.iter().collect::<Vec<_>>();
        numbered.sort_by_key(|(_, number)| **number);
        for (chunk_id, number) in numbered {
            let source = source_by_id
                .get(chunk_id.as_str())
                .ok_or_else(|| format!("Missing source chunk while rendering: {chunk_id}"))?;
            let key = format!("source-{number}");
            markdown.push_str(&format!(
                "{}. [{} — {}]({})\n",
                number,
                source.document_title,
                source.heading,
                markdown_note_target(source)
            ));
            citations.push(WikiCitation {
                key,
                document_path: source.document_path.clone(),
                document_title: source.document_title.clone(),
                chunk_id: source.chunk_id.clone(),
                heading: source.heading.clone(),
                start_offset: source.start_offset,
                end_offset: source.end_offset,
            });
        }
    }'''
)
old_render_claims = '''fn render_claims(
    markdown: &mut String,
    claims: &[WikiClaim],
    citation_numbers: &mut BTreeMap<String, usize>,
    source_by_id: &HashMap<&str, &WikiSourceChunk>,
) -> Result<(), String> {
    for claim in claims {
        let mut references = Vec::new();
        for chunk_id in &claim.citation_chunk_ids {
            if !source_by_id.contains_key(chunk_id.as_str()) {
                return Err(format!("Unknown source chunk while rendering: {chunk_id}"));
            }
            let next = citation_numbers.len() + 1;
            let number = *citation_numbers.entry(chunk_id.clone()).or_insert(next);
            references.push(format!("[^source-{number}]"));
        }
        references.sort();
        references.dedup();
        markdown.push_str(claim.text.trim());
        markdown.push(' ');
        markdown.push_str(&references.join(""));
        markdown.push_str("\n\n");
    }
    Ok(())
}'''
new_render_claims = '''fn markdown_link_component(value: &str) -> String {
    let mut output = String::new();
    for character in value.chars() {
        match character {
            ' ' => output.push_str("%20"),
            '(' => output.push_str("%28"),
            ')' => output.push_str("%29"),
            '#' => output.push_str("%23"),
            '%' => output.push_str("%25"),
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

fn markdown_note_target(source: &WikiSourceChunk) -> String {
    let path = markdown_link_component(&source.document_path);
    let anchor = markdown_heading_anchor(&source.heading);
    if anchor.is_empty() {
        format!("../../{path}")
    } else {
        format!("../../{path}#{anchor}")
    }
}

fn render_claims(
    markdown: &mut String,
    claims: &[WikiClaim],
    citation_numbers: &mut BTreeMap<String, usize>,
    source_by_id: &HashMap<&str, &WikiSourceChunk>,
) -> Result<(), String> {
    for claim in claims {
        let mut references = Vec::new();
        for chunk_id in &claim.citation_chunk_ids {
            let source = source_by_id
                .get(chunk_id.as_str())
                .ok_or_else(|| format!("Unknown source chunk while rendering: {chunk_id}"))?;
            let next = citation_numbers.len() + 1;
            let number = *citation_numbers.entry(chunk_id.clone()).or_insert(next);
            references.push(format!("[{number}]({})", markdown_note_target(source)));
        }
        references.sort();
        references.dedup();
        markdown.push_str(claim.text.trim());
        if !references.is_empty() {
            markdown.push(' ');
            markdown.push_str(&references.join(" "));
        }
        markdown.push_str("\n\n");
    }
    Ok(())
}'''
replace_once(wiki_core, old_render_claims, new_render_claims)


# Graph related-Wiki parser understands both legacy [[Wiki]] and the new
# standard Markdown links emitted by the renderer.
wiki_graph = 'Elephant/backend/knowledge-core/src/wiki_graph_projection.rs'
replace_once(
    wiki_graph,
    '''        let mut remainder = trimmed;
        while let Some(start) = remainder.find("[[") {
            let after_start = &remainder[start + 2..];
            let Some(end) = after_start.find("]]" ) else {'''.replace('find("]]" )', 'find("]]" )'),
    '''        let mut remainder = trimmed;
        while let Some(start) = remainder.find("[[") {
            let after_start = &remainder[start + 2..];
            let Some(end) = after_start.find("]]" ) else {'''.replace('find("]]" )', 'find("]]" )')
)
# The exact legacy parser is easier to extend by inserting a second pass before
# the per-line loop ends.
replace_once(
    wiki_graph,
    '''            remainder = &after_start[end + 2..];
        }
    }
    references.sort();''',
    '''            remainder = &after_start[end + 2..];
        }
        let mut markdown_remainder = trimmed;
        while let Some(open) = markdown_remainder.find("](") {
            let after_open = &markdown_remainder[open + 2..];
            let Some(close) = after_open.find(')') else {
                break;
            };
            let target = after_open[..close]
                .split('#')
                .next()
                .unwrap_or("")
                .trim()
                .trim_start_matches("./")
                .trim_end_matches(".md");
            if !target.is_empty() {
                references.push(target.to_string());
            }
            markdown_remainder = &after_open[close + 1..];
        }
    }
    references.sort();'''
)

print('Wiki experience phase 1 patch applied.')

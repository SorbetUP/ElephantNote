from pathlib import Path
import re

ROOT = Path('.')


def load(path):
    return (ROOT / path).read_text(encoding='utf-8')


def save(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = load(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one occurrence, got {count}: {old[:120]!r}')
    save(path, text.replace(old, new, 1))


def regex_once(path, pattern, replacement, flags=0):
    text = load(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{path}: regex expected one occurrence, got {count}: {pattern[:120]!r}')
    save(path, updated)


# ---------------------------------------------------------------------------
# Extend the typed action contract with Wiki-library state operations.
# ---------------------------------------------------------------------------
actions = 'Elephant/backend/knowledge-core/src/actions.rs'
replace_once(
    actions,
    '''    CreateWiki {
        title: String,
        topic: String,
        #[serde(default)]
        source_paths: Vec<String>,
    },
    CreateNote {''',
    '''    CreateWiki {
        title: String,
        topic: String,
        #[serde(default)]
        source_paths: Vec<String>,
    },
    ProposeWiki {
        title: String,
        topic: String,
        #[serde(default)]
        source_paths: Vec<String>,
    },
    RejectWikiSuggestion {
        topic: String,
    },
    DeleteWiki {
        draft_id: String,
    },
    CreateNote {'''
)
replace_once(
    actions,
    '''    pub fn requires_approval(&self) -> bool {
        self.mutates_user_content() || matches!(self, Self::CreateWiki { .. })
    }''',
    '''    pub fn requires_approval(&self) -> bool {
        self.mutates_user_content()
            || matches!(
                self,
                Self::CreateWiki { .. }
                    | Self::ProposeWiki { .. }
                    | Self::RejectWikiSuggestion { .. }
                    | Self::DeleteWiki { .. }
            )
    }'''
)
replace_once(
    actions,
    '''            Self::CreateWiki {
                title,
                topic,
                source_paths,
            } => {
                if title.trim().is_empty() {
                    errors.push("Wiki title cannot be empty.".into());
                }
                if topic.trim().is_empty() {
                    errors.push("Wiki topic cannot be empty.".into());
                }
                for path in source_paths {
                    validate_note_path(path, &mut errors);
                }
            }
            Self::CreateNote {''',
    '''            Self::CreateWiki {
                title,
                topic,
                source_paths,
            }
            | Self::ProposeWiki {
                title,
                topic,
                source_paths,
            } => {
                if title.trim().is_empty() {
                    errors.push("Wiki title cannot be empty.".into());
                }
                if topic.trim().is_empty() {
                    errors.push("Wiki topic cannot be empty.".into());
                }
                for path in source_paths {
                    validate_note_path(path, &mut errors);
                }
            }
            Self::RejectWikiSuggestion { topic } => {
                if topic.trim().is_empty() {
                    errors.push("Wiki suggestion topic cannot be empty.".into());
                }
            }
            Self::DeleteWiki { draft_id } => {
                if draft_id.trim().is_empty() {
                    errors.push("Wiki draft ID cannot be empty.".into());
                }
            }
            Self::CreateNote {'''
)


# ---------------------------------------------------------------------------
# Preview and core execution contract.
# ---------------------------------------------------------------------------
chat_actions = 'Elephant/backend/knowledge-core/src/chat_actions.rs'
replace_once(
    chat_actions,
    '''    CreateWiki {
        title: String,
        topic: String,
        source_paths: Vec<String>,
    },
    CreateNote {''',
    '''    CreateWiki {
        title: String,
        topic: String,
        source_paths: Vec<String>,
        operation: String,
    },
    WikiSuggestion {
        title: String,
        topic: String,
        source_paths: Vec<String>,
        operation: String,
    },
    DeleteWiki {
        draft_id: String,
    },
    CreateNote {'''
)
replace_once(
    chat_actions,
    '''        ChatKnowledgeAction::CreateWiki { .. } => {
            return Err("Wiki actions require the cited model-backed Wiki generator.".into());
        }
        ChatKnowledgeAction::CreateNote {''',
    '''        ChatKnowledgeAction::CreateWiki { .. }
        | ChatKnowledgeAction::ProposeWiki { .. }
        | ChatKnowledgeAction::RejectWikiSuggestion { .. }
        | ChatKnowledgeAction::DeleteWiki { .. } => {
            return Err("Wiki actions require the ElephantNote Wiki runtime.".into());
        }
        ChatKnowledgeAction::CreateNote {'''
)
replace_once(
    chat_actions,
    '''        ChatKnowledgeAction::CreateWiki {
            title,
            topic,
            source_paths,
        } => Ok(ChatActionPreview::CreateWiki {
            title: title.clone(),
            topic: topic.clone(),
            source_paths: source_paths.clone(),
        }),
        ChatKnowledgeAction::CreateNote {''',
    '''        ChatKnowledgeAction::CreateWiki {
            title,
            topic,
            source_paths,
        } => Ok(ChatActionPreview::CreateWiki {
            title: title.clone(),
            topic: topic.clone(),
            source_paths: source_paths.clone(),
            operation: "generate".into(),
        }),
        ChatKnowledgeAction::ProposeWiki {
            title,
            topic,
            source_paths,
        } => Ok(ChatActionPreview::WikiSuggestion {
            title: title.clone(),
            topic: topic.clone(),
            source_paths: source_paths.clone(),
            operation: "propose".into(),
        }),
        ChatKnowledgeAction::RejectWikiSuggestion { topic } => {
            Ok(ChatActionPreview::WikiSuggestion {
                title: topic.clone(),
                topic: topic.clone(),
                source_paths: Vec::new(),
                operation: "reject".into(),
            })
        }
        ChatKnowledgeAction::DeleteWiki { draft_id } => Ok(ChatActionPreview::DeleteWiki {
            draft_id: draft_id.clone(),
        }),
        ChatKnowledgeAction::CreateNote {'''
)


# ---------------------------------------------------------------------------
# Persist user-added Wiki suggestions in the same SQLite library.
# ---------------------------------------------------------------------------
library = 'Elephant/backend/tauri/src/knowledge_wiki_library.rs'
replace_once(
    library,
    '''CREATE INDEX IF NOT EXISTS wiki_candidate_decisions_decision_idx
  ON wiki_candidate_decisions(decision, updated_at DESC);
"#;''',
    '''CREATE INDEX IF NOT EXISTS wiki_candidate_decisions_decision_idx
  ON wiki_candidate_decisions(decision, updated_at DESC);
CREATE TABLE IF NOT EXISTS wiki_manual_candidates (
  topic TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_paths_json TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
"#;'''
)
insert_after_clear = '''fn clear_candidate_decision(store: &KnowledgeStore, topic: &str) -> Result<(), String> {
    let connection = open_library_connection(store)?;
    connection
        .execute(
            "DELETE FROM wiki_candidate_decisions WHERE topic=?1",
            params![normalize_topic(topic)],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}
'''
manual_helpers = insert_after_clear + '''
fn save_manual_candidate(
    store: &KnowledgeStore,
    topic: &str,
    title: &str,
    source_paths: &[String],
    reason: &str,
) -> Result<(), String> {
    let topic = normalize_topic(topic);
    let title = title.trim();
    if topic.is_empty() || title.is_empty() {
        return Err("A manual Wiki suggestion requires a topic and title.".into());
    }
    let source_paths_json = serde_json::to_string(source_paths).map_err(|error| error.to_string())?;
    open_library_connection(store)?
        .execute(
            "INSERT INTO wiki_manual_candidates(topic, title, source_paths_json, reason, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, unixepoch(), unixepoch())
             ON CONFLICT(topic) DO UPDATE SET
               title=excluded.title,
               source_paths_json=excluded.source_paths_json,
               reason=excluded.reason,
               updated_at=unixepoch()",
            params![topic, title, source_paths_json, reason.trim()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn remove_manual_candidate(store: &KnowledgeStore, topic: &str) -> Result<(), String> {
    open_library_connection(store)?
        .execute(
            "DELETE FROM wiki_manual_candidates WHERE topic=?1",
            params![normalize_topic(topic)],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn manual_candidates(store: &KnowledgeStore) -> Result<Vec<WikiCandidate>, String> {
    let connection = open_library_connection(store)?;
    let mut statement = connection
        .prepare(
            "SELECT topic, title, source_paths_json, reason
             FROM wiki_manual_candidates ORDER BY updated_at DESC, topic",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            let source_paths_json: String = row.get(2)?;
            let source_paths = serde_json::from_str::<Vec<String>>(&source_paths_json)
                .unwrap_or_default();
            let topic: String = row.get(0)?;
            let title: String = row.get(1)?;
            let reason: String = row.get(3)?;
            Ok(WikiCandidate {
                topic,
                title: title.clone(),
                source_paths: source_paths.clone(),
                preview: if reason.trim().is_empty() {
                    format!("Proposition ajoutée depuis le Chat pour synthétiser {} source(s).", source_paths.len())
                } else {
                    reason.clone()
                },
                suggested_sections: Vec::new(),
                source_titles: source_paths
                    .iter()
                    .map(|path| {
                        Path::new(path)
                            .file_stem()
                            .and_then(|name| name.to_str())
                            .unwrap_or(path)
                            .to_string()
                    })
                    .collect(),
                reason,
                score: usize::MAX,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}
'''
replace_once(library, insert_after_clear, manual_helpers)
replace_once(
    library,
    '''    let mut suggestions = tauri_knowledge_wiki_candidates(app, Some(limit))?
        .into_iter()
        .filter(|candidate| !rejected.contains(&normalize_topic(&candidate.topic)))
        .map(candidate_item)
        .collect::<Vec<_>>();''',
    '''    let existing_topics = store
        .list_wiki_drafts(None, 1_000)?
        .into_iter()
        .map(|draft| normalize_topic(&draft.topic))
        .collect::<HashSet<_>>();
    let mut seen_topics = HashSet::new();
    let mut suggestions = manual_candidates(&store)?
        .into_iter()
        .chain(tauri_knowledge_wiki_candidates(app, Some(limit))?)
        .filter(|candidate| {
            let topic = normalize_topic(&candidate.topic);
            !rejected.contains(&topic)
                && !existing_topics.contains(&topic)
                && seen_topics.insert(topic)
        })
        .map(candidate_item)
        .collect::<Vec<_>>();'''
)
replace_once(
    library,
    '''    let accepted = tauri_knowledge_wiki_accept(app, generated.draft.id)?;
    eprintln!('''.replace("eprintln!('''", "eprintln!("),
    '''    let accepted = tauri_knowledge_wiki_accept(app, generated.draft.id)?;
    remove_manual_candidate(&store, &accepted.topic)?;
    eprintln!('''.replace("eprintln!('''", "eprintln!(")
)
# Add propose command before reject.
replace_once(
    library,
    '''#[tauri::command]
pub fn tauri_knowledge_wiki_library_reject(''',
    '''#[tauri::command]
pub fn tauri_knowledge_wiki_library_propose(
    app: AppHandle,
    topic: String,
    title: String,
    source_paths: Vec<String>,
    reason: Option<String>,
) -> Result<WikiLibraryItem, String> {
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    clear_candidate_decision(&store, &topic)?;
    save_manual_candidate(
        &store,
        &topic,
        &title,
        &source_paths,
        reason.as_deref().unwrap_or(""),
    )?;
    let candidate = manual_candidates(&store)?
        .into_iter()
        .find(|candidate| normalize_topic(&candidate.topic) == normalize_topic(&topic))
        .ok_or_else(|| "Unable to reload manual Wiki suggestion.".to_string())?;
    Ok(candidate_item(candidate))
}

#[tauri::command]
pub fn tauri_knowledge_wiki_library_reject('''
)


# ---------------------------------------------------------------------------
# Tauri action execution routes Wiki actions to the real Wiki library.
# ---------------------------------------------------------------------------
tauri_actions = 'Elephant/backend/tauri/src/knowledge_chat_actions.rs'
replace_once(
    tauri_actions,
    'use serde::Serialize;',
    'use serde::Serialize;\nuse serde_json::{json, Value};'
)
replace_once(
    tauri_actions,
    '''#[tauri::command]
pub fn tauri_knowledge_chat_action_execute(
    app: AppHandle,
    proposal_id: String,
) -> Result<ChatActionExecution, String> {''',
    '''fn completed_execution(mut proposal: ChatActionProposal, result: Value) -> ChatActionExecution {
    proposal.status = ChatActionStatus::Executed;
    proposal.result = Some(result.clone());
    proposal.error = None;
    proposal.updated_at = unix_timestamp();
    ChatActionExecution { proposal, result }
}

#[tauri::command]
pub async fn tauri_knowledge_chat_action_execute(
    app: AppHandle,
    proposal_id: String,
) -> Result<ChatActionExecution, String> {'''
)
old_execute_match = '''    match execute_approved_chat_action(&root, &store, &proposal) {
        Ok(execution) => {
            store.save_chat_action_proposal(&execution.proposal)?;
            Ok(execution)
        }
        Err(error) => {
            let mut failed = proposal;
            failed.status = ChatActionStatus::Failed;
            failed.error = Some(error.clone());
            failed.updated_at = unix_timestamp();
            store.save_chat_action_proposal(&failed)?;
            Err(error)
        }
    }'''
new_execute_match = '''    let execution = match &proposal.action {
        ChatKnowledgeAction::CreateWiki {
            title,
            topic,
            source_paths,
        } => {
            let item = crate::knowledge_wiki_library::tauri_knowledge_wiki_library_generate(
                app.clone(),
                topic.clone(),
                Some(title.clone()),
                source_paths.clone(),
                json!({}),
            )
            .await?;
            completed_execution(
                proposal.clone(),
                json!({ "operation": "generate_wiki", "wiki": item }),
            )
        }
        ChatKnowledgeAction::ProposeWiki {
            title,
            topic,
            source_paths,
        } => {
            let item = crate::knowledge_wiki_library::tauri_knowledge_wiki_library_propose(
                app.clone(),
                topic.clone(),
                title.clone(),
                source_paths.clone(),
                Some(proposal.rationale.clone()),
            )?;
            completed_execution(
                proposal.clone(),
                json!({ "operation": "propose_wiki", "suggestion": item }),
            )
        }
        ChatKnowledgeAction::RejectWikiSuggestion { topic } => {
            crate::knowledge_wiki_library::tauri_knowledge_wiki_library_reject(
                app.clone(),
                topic.clone(),
            )?;
            completed_execution(
                proposal.clone(),
                json!({ "operation": "reject_wiki_suggestion", "topic": topic }),
            )
        }
        ChatKnowledgeAction::DeleteWiki { draft_id } => {
            crate::knowledge_wiki_library::tauri_knowledge_wiki_library_delete(
                app.clone(),
                draft_id.clone(),
                Some(true),
            )?;
            completed_execution(
                proposal.clone(),
                json!({ "operation": "delete_wiki", "draftId": draft_id }),
            )
        }
        _ => execute_approved_chat_action(&root, &store, &proposal)?,
    };
    store.save_chat_action_proposal(&execution.proposal)?;
    Ok(execution)'''
replace_once(tauri_actions, old_execute_match, new_execute_match)


# Register the manual-proposal command.
lib_min = 'Elephant/backend/tauri/src/lib_min.rs'
replace_once(
    lib_min,
    '''            knowledge_wiki_library::tauri_knowledge_wiki_library_generate,
            knowledge_wiki_library::tauri_knowledge_wiki_library_reject,''',
    '''            knowledge_wiki_library::tauri_knowledge_wiki_library_generate,
            knowledge_wiki_library::tauri_knowledge_wiki_library_propose,
            knowledge_wiki_library::tauri_knowledge_wiki_library_reject,'''
)


# ---------------------------------------------------------------------------
# Chat runtime action protocol. Codex may propose typed actions but ElephantNote
# remains the executor and requires approval for every mutation.
# ---------------------------------------------------------------------------
chat_runtime = 'Elephant/backend/tauri/src/chat_runtime.rs'
replace_once(
    chat_runtime,
    'use elephantnote_knowledge_core::{KnowledgeSearchHit, KnowledgeStore};',
    'use elephantnote_knowledge_core::{ChatKnowledgeAction, KnowledgeSearchHit, KnowledgeStore};'
)
replace_once(
    chat_runtime,
    '''fn selected_chat_reasoning_effort(payload: &Value) -> Option<String> {
    let route = ai_config(payload)
        .pointer("/routes/chat")
        .unwrap_or(&Value::Null);
    let effort = text(route, &["reasoningEffort", "reasoning_effort", "effort"]);
    (!effort.is_empty()).then_some(effort)
}
''',
    '''fn selected_chat_reasoning_effort(payload: &Value) -> Option<String> {
    let route = ai_config(payload)
        .pointer("/routes/chat")
        .unwrap_or(&Value::Null);
    let effort = text(route, &["reasoningEffort", "reasoning_effort", "effort"]);
    (!effort.is_empty()).then_some(effort)
}

fn tools_enabled(payload: &Value) -> bool {
    ai_config(payload)
        .pointer("/routes/chat/enableTools")
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

fn action_protocol() -> &'static str {
    r#"When the user explicitly asks ElephantNote to perform or propose an action, append one or more exact tagged JSON blocks after the human-readable answer:
<elephantnote_action>{\"action\":\"create_wiki\",\"title\":\"Title\",\"topic\":\"topic\",\"source_paths\":[\"Note.md\"],\"rationale\":\"why\"}</elephantnote_action>
Supported action values are search_notes, create_wiki, propose_wiki, reject_wiki_suggestion, delete_wiki, create_note, append_to_note, replace_note_range and replace_note. Use only source paths and content hashes explicitly present in the ElephantNote context. create_wiki means generate the cited Wiki after approval; propose_wiki only adds a proposal to the Wiki library. Note mutations must include expected_hash and require the complete replacement or appended content. Never say an action is complete: ElephantNote will show an approval card and execute it only after approval. Do not emit an action for a question that merely asks for information."#
}

fn extract_action_blocks(answer: &str) -> (String, Vec<Value>) {
    const OPEN: &str = "<elephantnote_action>";
    const CLOSE: &str = "</elephantnote_action>";
    let mut cleaned = String::new();
    let mut actions = Vec::new();
    let mut remaining = answer;
    while let Some(start) = remaining.find(OPEN) {
        cleaned.push_str(&remaining[..start]);
        let after_open = &remaining[start + OPEN.len()..];
        let Some(end) = after_open.find(CLOSE) else {
            cleaned.push_str(&remaining[start..]);
            remaining = "";
            break;
        };
        let raw = after_open[..end].trim();
        if let Ok(value) = serde_json::from_str::<Value>(raw) {
            actions.push(value);
        }
        remaining = &after_open[end + CLOSE.len()..];
    }
    cleaned.push_str(remaining);
    (cleaned.trim().to_string(), actions)
}

fn prepare_model_actions(app: &AppHandle, values: Vec<Value>) -> Vec<Value> {
    values
        .into_iter()
        .filter_map(|mut value| {
            let rationale = value
                .get("rationale")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if let Some(object) = value.as_object_mut() {
                object.remove("rationale");
            }
            let action = serde_json::from_value::<ChatKnowledgeAction>(value).ok()?;
            crate::knowledge_chat_actions::tauri_knowledge_chat_action_prepare(
                app.clone(),
                action,
                Some(rationale),
            )
            .ok()
            .and_then(|prepared| serde_json::to_value(prepared).ok())
        })
        .collect()
}
'''
)
# Add hashes/full context for write-intent queries.
replace_once(
    chat_runtime,
    '''    let access_contract = if !rag_enabled(payload) {''',
    '''    let write_intent = {
        let value = query.to_lowercase();
        ["modifie", "modifier", "update", "mets à jour", "ajoute", "append", "remplace", "replace"]
            .iter()
            .any(|needle| value.contains(needle))
    };
    let full_note_context = if write_intent {
        let Ok(vault) = crate::vault::config::get_active_vault(app) else {
            String::new()
        };
        let store = KnowledgeStore::open(Path::new(&vault.path)).ok();
        hits.iter()
            .take(3)
            .filter_map(|hit| store.as_ref()?.inspect_document(&hit.relative_path).ok().flatten())
            .map(|document| {
                let body = document
                    .chunks
                    .iter()
                    .map(|chunk| chunk.text.as_str())
                    .collect::<Vec<_>>()
                    .join("\n\n");
                format!(
                    "<full_note path=\"{}\" content_hash=\"{}\">\n{}\n</full_note>",
                    document.relative_path, document.content_hash, body
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n")
    } else {
        String::new()
    };
    let access_contract = if !rag_enabled(payload) {'''
)
replace_once(
    chat_runtime,
    '''            "Tu peux consulter les passages de notes indexées fournis ci-dessous. Utilise-les pour les affirmations concernant la vault et cite-les avec [1], [2], etc. Tu n’as pas un accès libre au disque : ton accès est limité à l’index et aux outils ElephantNote. N’affirme jamais que tu n’as aucun accès aux notes lorsque des passages sont présents.\n\n{context}"
        )''',
    '''            "Tu peux consulter les passages de notes indexées fournis ci-dessous. Utilise-les pour les affirmations concernant la vault et cite-les avec [1], [2], etc. Tu n’as pas un accès libre au disque : ton accès est limité à l’index et aux outils ElephantNote. N’affirme jamais que tu n’as aucun accès aux notes lorsque des passages sont présents.\n\n{context}\n\n{full_note_context}"
        )'''
)
replace_once(
    chat_runtime,
    '''    let system = if custom.is_empty() {
        format!("Tu es l’assistant ElephantNote. Réponds en français par défaut. {access_contract}")
    } else {
        format!("{custom}\n\nCapacités ElephantNote : {access_contract}")
    };''',
    '''    let tools = if tools_enabled(payload) {
        format!("\n\nActions disponibles : {}", action_protocol())
    } else {
        String::new()
    };
    let system = if custom.is_empty() {
        format!("Tu es l’assistant ElephantNote. Réponds en français par défaut. {access_contract}{tools}")
    } else {
        format!("{custom}\n\nCapacités ElephantNote : {access_contract}{tools}")
    };'''
)
# Codex response: parse and prepare action cards.
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
        let (answer, action_values) = if tools_enabled(&payload) {
            extract_action_blocks(&result.answer)
        } else {
            (result.answer.clone(), Vec::new())
        };
        let actions = prepare_model_actions(&app, action_values);
        return Ok(json!({
            "answer": answer,
            "actions": actions,
            "sources": hits,'''
)
# Local response too.
replace_once(
    chat_runtime,
    '''        Ok(json!({
          "answer": local.answer,
          "sources": hits,''',
    '''        let (answer, action_values) = if tools_enabled(&payload) {
          extract_action_blocks(&local.answer)
        } else {
          (local.answer.clone(), Vec::new())
        };
        let actions = prepare_model_actions(&app, action_values);
        Ok(json!({
          "answer": answer,
          "actions": actions,
          "sources": hits,'''
)


# ---------------------------------------------------------------------------
# Renderer action approval cards.
# ---------------------------------------------------------------------------
chat_view = 'Elephant/frontend/app/components/views/ChatView.vue'
replace_once(
    chat_view,
    '''            <div v-if="message.citations?.length" class="en-chat-citations">''',
    '''            <section v-if="message.actions?.length" class="en-chat-actions">
              <article
                v-for="action in message.actions"
                :key="action.proposal?.id"
                class="en-chat-action-card"
              >
                <div>
                  <strong>{{ actionTitle(action) }}</strong>
                  <p>{{ actionSummary(action) }}</p>
                  <small v-if="action.proposal?.rationale">{{ action.proposal.rationale }}</small>
                </div>
                <div class="en-chat-action-buttons">
                  <span v-if="action.proposal?.status === 'executed'" class="en-chat-action-state">Effectué</span>
                  <span v-else-if="action.proposal?.status === 'rejected'" class="en-chat-action-state">Refusé</span>
                  <template v-else>
                    <button
                      type="button"
                      :disabled="action.busy"
                      @click="approveAction(message, action)"
                    >
                      Approuver
                    </button>
                    <button
                      type="button"
                      :disabled="action.busy"
                      @click="rejectAction(message, action)"
                    >
                      Refuser
                    </button>
                  </template>
                </div>
                <p v-if="action.error" class="en-chat-action-error">{{ action.error }}</p>
              </article>
            </section>

            <div v-if="message.citations?.length" class="en-chat-citations">'''
)
replace_once(
    chat_view,
    '''const splitParagraphs = (content) => {''',
    '''const actionTitle = (entry) => {
  const action = entry?.proposal?.action?.action || ''
  const labels = {
    search_notes: 'Rechercher dans les notes',
    create_wiki: 'Générer un Wiki',
    propose_wiki: 'Ajouter une proposition de Wiki',
    reject_wiki_suggestion: 'Refuser une proposition de Wiki',
    delete_wiki: 'Supprimer un Wiki',
    create_note: 'Créer une note',
    append_to_note: 'Ajouter à une note',
    replace_note_range: 'Modifier une partie de note',
    replace_note: 'Mettre à jour une note'
  }
  return labels[action] || 'Action ElephantNote'
}

const actionSummary = (entry) => {
  const preview = entry?.proposal?.preview || {}
  return preview.topic || preview.relative_path || preview.draft_id || entry?.proposal?.rationale || ''
}

const updateActionInMessage = (message, action, patch) => {
  const actions = (message.actions || []).map((current) =>
    current.proposal?.id === action.proposal?.id ? { ...current, ...patch } : current
  )
  chatStore.updateMessage(message.id, { actions })
}

const approveAction = async(message, action) => {
  const proposalId = action?.proposal?.id
  if (!proposalId || action.busy) return
  updateActionInMessage(message, action, { busy: true, error: '' })
  try {
    await globalThis.elephantnote?.knowledge?.chatActions?.approve?.(proposalId)
    const execution = await globalThis.elephantnote?.knowledge?.chatActions?.execute?.(proposalId)
    updateActionInMessage(message, action, {
      busy: false,
      execution,
      proposal: execution?.proposal || { ...action.proposal, status: 'executed' }
    })
    window.dispatchEvent(new CustomEvent('elephantnote:knowledge-changed', {
      detail: { reason: 'chat-action-executed', proposalId }
    }))
    await searchStore.inspect().catch(() => {})
  } catch (error) {
    updateActionInMessage(message, action, {
      busy: false,
      error: error?.message || String(error)
    })
  }
}

const rejectAction = async(message, action) => {
  const proposalId = action?.proposal?.id
  if (!proposalId || action.busy) return
  updateActionInMessage(message, action, { busy: true, error: '' })
  try {
    const proposal = await globalThis.elephantnote?.knowledge?.chatActions?.reject?.(proposalId)
    updateActionInMessage(message, action, { busy: false, proposal })
  } catch (error) {
    updateActionInMessage(message, action, {
      busy: false,
      error: error?.message || String(error)
    })
  }
}

const splitParagraphs = (content) => {'''
)
replace_once(
    chat_view,
    '''      toolCalls
    })''',
    '''      toolCalls,
      actions: Array.isArray(result?.actions) ? result.actions : []
    })'''
)
# Add action card styling before citations style marker.
replace_once(
    chat_view,
    '''.en-chat-citations {''',
    '''.en-chat-actions {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.en-chat-action-card {
  display: grid;
  gap: 10px;
  border: 1px solid var(--chat-border);
  border-radius: 12px;
  padding: 12px;
  background: var(--chat-surface);
}

.en-chat-action-card p,
.en-chat-action-card small {
  margin: 4px 0 0;
  color: var(--chat-text-secondary);
}

.en-chat-action-buttons {
  display: flex;
  gap: 8px;
}

.en-chat-action-buttons button {
  min-height: 32px;
  border: 1px solid var(--chat-border);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--chat-text);
  background: var(--chat-surface-hover);
}

.en-chat-action-state {
  color: var(--chat-text-secondary);
  font-size: 12px;
}

.en-chat-action-error {
  color: #ef4444 !important;
}

.en-chat-citations {'''
)


# Runtime bridge/client expose manual proposals.
client = 'Elephant/frontend/src/renderer/src/platform/knowledgeRuntimeClient.js'
replace_once(
    client,
    '''  rejectWikiSuggestion: (topic) => invokeKnowledgeCommand('tauri_knowledge_wiki_library_reject', { topic }),''',
    '''  proposeWikiSuggestion: ({ topic, title, sourcePaths = [], reason = '' }) =>
    invokeKnowledgeCommand('tauri_knowledge_wiki_library_propose', { topic, title, sourcePaths, reason }),
  rejectWikiSuggestion: (topic) => invokeKnowledgeCommand('tauri_knowledge_wiki_library_reject', { topic }),'''
)
bridge = 'Elephant/frontend/src/renderer/src/platform/installKnowledgeRuntimeBridge.js'
replace_once(
    bridge,
    '''      libraryGenerate: knowledgeRuntimeClient.generateWikiLibraryItem,
      libraryReject: knowledgeRuntimeClient.rejectWikiSuggestion,''',
    '''      libraryGenerate: knowledgeRuntimeClient.generateWikiLibraryItem,
      libraryPropose: knowledgeRuntimeClient.proposeWikiSuggestion,
      libraryReject: knowledgeRuntimeClient.rejectWikiSuggestion,'''
)

print('Chat knowledge action implementation applied.')

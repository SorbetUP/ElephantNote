from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing marker: {label}')
    return text.replace(old, new, 1)

# Discovery: never retain rusqlite connections across await points.
path = Path('Elephant/backend/tauri/src/knowledge_wiki_discovery.rs')
text = path.read_text(encoding='utf-8')
start = text.index('#[cfg(not(mobile))]\nasync fn document_vectors(')
end = text.index('\n#[cfg(not(mobile))]\nfn recompute_centroid', start)
new_fn = r'''#[cfg(not(mobile))]
async fn document_vectors(
    root: &Path,
    route: &EmbeddingRoute,
) -> Result<Vec<DocumentVector>, String> {
    let model_key = format!("{}|{}|{}", route.source, route.endpoint, route.model);
    let (mut output, missing) = {
        let connection = open_connection(root)?;
        let documents = load_documents(&connection)?;
        let mut output = Vec::<Option<DocumentVector>>::with_capacity(documents.len());
        let mut missing = Vec::<(usize, String, String, String, String)>::new();
        for (path, title, content_hash, body) in documents {
            let excerpt = body.chars().take(3_000).collect::<String>();
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
                            excerpt,
                            vector,
                        }));
                        continue;
                    }
                }
            }
            output.push(None);
            missing.push((index, path, title, content_hash, excerpt));
        }
        (output, missing)
    };

    for batch in missing.chunks(32) {
        let inputs = batch
            .iter()
            .map(|(_, _, title, _, excerpt)| format!("Title: {title}\n\n{excerpt}"))
            .collect::<Vec<_>>();
        let vectors = embed_batch(route, &inputs).await?;
        {
            let connection = open_connection(root)?;
            for ((index, path, title, content_hash, excerpt), vector) in batch.iter().zip(vectors) {
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
                output[*index] = Some(DocumentVector {
                    path: path.clone(),
                    title: title.clone(),
                    excerpt: excerpt.clone(),
                    vector,
                });
            }
        }
    }
    Ok(output.into_iter().flatten().collect())
}
'''
text = text[:start] + new_fn + text[end:]
text = replace_once(
    text,
    '''    let root = active_vault_root(app)?;
    let connection = open_connection(&root)?;
    let config = crate::tauri_extra_commands::load_ai_config(app)?;
    let route = embedding_route(&config)?;
    let documents = document_vectors(&connection, &route).await?;''',
    '''    let root = active_vault_root(app)?;
    let config = crate::tauri_extra_commands::load_ai_config(app)?;
    let route = embedding_route(&config)?;
    let documents = document_vectors(&root, &route).await?;''',
    'discovery connection before await'
)
text = replace_once(
    text,
    '    persist_candidates(&connection, &candidates)?;',
    '''    {
        let connection = open_connection(&root)?;
        persist_candidates(&connection, &candidates)?;
    }''',
    'persist after await connection'
)
text = text.replace('if let Some((cluster_index, similarity)) =', 'if let Some((cluster_index, _similarity)) =', 1)
path.write_text(text, encoding='utf-8')

# Action execution: reload KnowledgeStore after async generation instead of retaining SQLite across await.
path = Path('Elephant/backend/tauri/src/knowledge_chat_actions.rs')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    '''async fn execute_wiki_action(
    app: AppHandle,
    store: &KnowledgeStore,
    proposal: ChatActionProposal,
) -> Result<ChatActionExecution, String> {''',
    '''async fn execute_wiki_action(
    app: AppHandle,
    proposal: ChatActionProposal,
) -> Result<ChatActionExecution, String> {''',
    'wiki action store parameter'
)
text = text.replace(
    'crate::knowledge_wiki_library::tauri_knowledge_wiki_library_generate(\n                app,',
    'crate::knowledge_wiki_library::tauri_knowledge_wiki_library_generate(\n                app.clone(),',
    1
)
text = text.replace(
    'crate::knowledge_wiki_library::tauri_knowledge_wiki_library_add_candidate(\n                app,',
    'crate::knowledge_wiki_library::tauri_knowledge_wiki_library_add_candidate(\n                app.clone(),',
    1
)
text = text.replace(
    'crate::knowledge_wiki_library::tauri_knowledge_wiki_library_reject(app, topic.clone())?',
    'crate::knowledge_wiki_library::tauri_knowledge_wiki_library_reject(app.clone(), topic.clone())?',
    1
)
text = text.replace(
    'crate::knowledge_wiki_library::tauri_knowledge_wiki_library_delete(\n                app,',
    'crate::knowledge_wiki_library::tauri_knowledge_wiki_library_delete(\n                app.clone(),',
    1
)
text = replace_once(
    text,
    '''    };
    completed_execution(store, proposal, result)
}''',
    '''    };
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    completed_execution(&store, proposal, result)
}''',
    'reopen store after wiki await'
)
start = text.index('#[tauri::command]\npub async fn tauri_knowledge_chat_action_execute(')
end = text.index('\nfn unix_timestamp()', start)
new_execute = r'''#[tauri::command]
pub async fn tauri_knowledge_chat_action_execute(
    app: AppHandle,
    proposal_id: String,
) -> Result<ChatActionExecution, String> {
    let root = active_vault_root(&app)?;
    let proposal = {
        let store = active_store(&root)?;
        store
            .chat_action_proposal(&proposal_id)?
            .ok_or_else(|| format!("Unknown chat action proposal: {proposal_id}"))?
    };

    let is_wiki = matches!(
        proposal.action,
        ChatKnowledgeAction::CreateWiki { .. }
            | ChatKnowledgeAction::AddWikiSuggestion { .. }
            | ChatKnowledgeAction::RejectWikiSuggestion { .. }
            | ChatKnowledgeAction::DeleteWiki { .. }
    );
    let result = if is_wiki {
        execute_wiki_action(app.clone(), proposal.clone()).await
    } else {
        let store = active_store(&root)?;
        execute_approved_chat_action(&root, &store, &proposal).and_then(|execution| {
            store.save_chat_action_proposal(&execution.proposal)?;
            Ok(execution)
        })
    };

    match result {
        Ok(execution) => Ok(execution),
        Err(error) => {
            let mut failed = proposal;
            failed.status = ChatActionStatus::Failed;
            failed.error = Some(error.clone());
            failed.updated_at = unix_timestamp();
            active_store(&root)?.save_chat_action_proposal(&failed)?;
            Err(error)
        }
    }
}
'''
text = text[:start] + new_execute + text[end:]
path.write_text(text, encoding='utf-8')

# Remove stale numeric helper warning in the migration path.
path = Path('Elephant/backend/tauri/src/knowledge_wiki_library.rs')
text = path.read_text(encoding='utf-8')
text = text.replace(
    '        let number = citation_number(citation, index + 1);\n        let target = markdown_note_target(citation);',
    '        let number = citation_number(citation, index + 1);\n        let target = markdown_note_target(citation);',
    1
)
path.write_text(text, encoding='utf-8')

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    content = target.read_text(encoding='utf-8')
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}')
    target.write_text(content.replace(old, new, 1), encoding='utf-8')


chat = 'Elephant/backend/tauri/src/chat_runtime.rs'
replace_once(
    chat,
    '''fn looks_like_exact_count_request(query: &str) -> bool {
    let normalized = query.to_lowercase();
    [
        "combien de note",
        "combien de notes",
        "nombre de note",
        "nombre de notes",
        "compte les note",
        "compte le nombre",
        "count notes",
        "how many notes",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
}
''',
    '''fn exact_count_literal(query: &str) -> Option<String> {
    let normalized = query.to_lowercase();
    let is_count = [
        "combien de note",
        "combien de notes",
        "nombre de note",
        "nombre de notes",
        "compte les note",
        "compte le nombre",
        "count notes",
        "how many notes",
    ]
    .iter()
    .any(|needle| normalized.contains(needle));
    if !is_count {
        return None;
    }
    const FILLERS: &[&str] = &[
        "a", "au", "aux", "avec", "combien", "compte", "compter", "contenant",
        "contiennent", "contient", "dans", "de", "dedans", "des", "du", "ecrit",
        "écrit", "est", "fois", "how", "le", "les", "many", "mot", "mots",
        "nombre", "note", "notes", "please", "qui", "stp", "svp", "the", "un",
        "une", "y",
    ];
    let terms = query
        .split(|character: char| !character.is_alphanumeric())
        .map(|value| value.trim().to_lowercase())
        .filter(|value| value.chars().count() >= 2)
        .filter(|value| !FILLERS.contains(&value.as_str()))
        .collect::<Vec<_>>();
    (!terms.is_empty()).then(|| terms.join(" "))
}
''',
)
replace_once(
    chat,
    '''    if looks_like_exact_count_request(query) {
        let literal = query
            .split_whitespace()
            .rev()
            .find(|value| value.chars().any(char::is_alphanumeric))
            .unwrap_or(query)
            .trim_matches(|character: char| !character.is_alphanumeric());
        crate::knowledge_chat_actions::exact_note_search(&store, literal, 100).unwrap_or_default()
    } else {
        crate::knowledge_chat_actions::hybrid_note_search(&store, query, limit).unwrap_or_default()
    }''',
    '''    if let Some(literal) = exact_count_literal(query) {
        crate::knowledge_chat_actions::exact_note_search(&store, &literal, 100)
            .unwrap_or_default()
    } else {
        crate::knowledge_chat_actions::hybrid_note_search(&store, query, limit).unwrap_or_default()
    }''',
)

actions = 'Elephant/backend/tauri/src/knowledge_chat_actions.rs'
replace_once(
    actions,
    '''    let exact_query = trimmed
        .strip_prefix("exact:")
        .or_else(|| trimmed.strip_prefix('='))
        .map(str::trim)
        .filter(|value| !value.is_empty());''',
    '''    let explicit_exact = trimmed
        .strip_prefix("exact:")
        .or_else(|| trimmed.strip_prefix('='))
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let implicit_exact = (meaningful_terms.len() == 1
        && trimmed.eq_ignore_ascii_case(&meaningful_terms[0]))
        .then_some(trimmed);
    let exact_query = explicit_exact.or(implicit_exact);''',
)

library = 'Elephant/backend/tauri/src/knowledge_wiki_library.rs'
replace_once(
    library,
    '''        .find(|draft| {
            wiki_slug(&draft.title) == title_key
                || (!topic_key.is_empty() && normalize_topic(&draft.topic) == topic_key)
        }))''',
    '''        .find(|draft| {
            let draft_title = wiki_slug(&draft.title);
            let related_title = draft_title.chars().count().min(title_key.chars().count()) >= 5
                && (draft_title.contains(&title_key) || title_key.contains(&draft_title));
            draft_title == title_key
                || related_title
                || (!topic_key.is_empty() && normalize_topic(&draft.topic) == topic_key)
        }))''',
)
replace_once(
    library,
    '''    let mut revised = generated.draft;
    revised.id = existing.id.clone();''',
    '''    let temporary_id = generated.draft.id.clone();
    let mut revised = generated.draft;
    if temporary_id != existing.id {
        let _ = store.set_wiki_draft_status(&temporary_id, WikiDraftStatus::Rejected);
    }
    revised.id = existing.id.clone();''',
)

relations = 'Elephant/backend/tauri/src/knowledge_relations.rs'
replace_once(
    relations,
    '''            Err(error) => eprintln!("[Knowledge][Graph] embeddings:unavailable reason={error}"),''',
    '''            Err(error) => eprintln!(
                "[Knowledge][Graph] embeddings:unavailable reason={error}"
            ),''',
)

print('Applied final Chat/Wiki acceptance refinements.')

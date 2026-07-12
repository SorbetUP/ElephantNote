from pathlib import Path

path = Path('.github/scripts/apply_chat_wiki_acceptance_fixes.py')
content = path.read_text(encoding='utf-8')
start_marker = "replace_once(\n    actions,\n    '''    if let ChatKnowledgeAction::SearchNotes"
end_marker = "replace_once(\n    actions,\n    '''        ChatKnowledgeAction::AddWikiSuggestion"
start = content.index(start_marker)
end = content.index(end_marker, start)
replacement = r'''replace_once(
    actions,
    '''fn relaxed_note_search(
    store: &KnowledgeStore,
    query: &str,
    limit: usize,
) -> Result<Vec<KnowledgeSearchHit>, String> {
    let meaningful_terms = meaningful_search_terms(query);
    let hits = hybrid_note_search(store, query, limit)?;
    eprintln!(
        "[Knowledge][ChatSearch] query={:?} terms={} results={} strategy=hybrid",
        query,
        meaningful_terms.len(),
        hits.len()
    );
    Ok(hits)
}''',
    '''fn relaxed_note_search(
    store: &KnowledgeStore,
    query: &str,
    limit: usize,
) -> Result<Vec<KnowledgeSearchHit>, String> {
    let meaningful_terms = meaningful_search_terms(query);
    let trimmed = query.trim();
    let exact_query = trimmed
        .strip_prefix("exact:")
        .or_else(|| trimmed.strip_prefix('='))
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let (hits, strategy) = if let Some(exact_query) = exact_query {
        (exact_note_search(store, exact_query, limit)?, "exact")
    } else {
        (hybrid_note_search(store, query, limit)?, "hybrid")
    };
    eprintln!(
        "[Knowledge][ChatSearch] query={:?} terms={} results={} strategy={}",
        query,
        meaningful_terms.len(),
        hits.len(),
        strategy
    );
    Ok(hits)
}''',
)
'''
path.write_text(content[:start] + replacement + content[end:], encoding='utf-8')
print('Adapted acceptance fixer to relaxed_note_search compatibility facade.')

from pathlib import Path
import re


def block_end(text: str, brace: int) -> int:
    depth = 0
    in_string = False
    escape = False
    for index in range(brace, len(text)):
        char = text[index]
        if in_string:
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                end = index + 1
                while end < len(text) and text[end] in ' \t\r\n':
                    end += 1
                return end
    raise RuntimeError('Unbalanced Rust block')


def remove_test_function(text: str, name: str) -> str:
    match = re.search(rf'(?m)^\s*#\[test\]\s*\n\s*fn\s+{re.escape(name)}\s*\(', text)
    if not match:
        return text
    brace = text.find('{', match.end())
    if brace < 0:
        raise RuntimeError(f'No body for test {name}')
    return text[:match.start()] + text[block_end(text, brace):]


def remove_enclosing_for_loop(text: str, marker: str) -> str:
    marker_index = text.find(marker)
    if marker_index < 0:
        return text
    start = text.rfind('\n  for index in ', 0, marker_index)
    if start < 0:
        raise RuntimeError(f'No generated loop found for {marker}')
    start += 1
    brace = text.find('{', start, marker_index)
    if brace < 0:
        raise RuntimeError(f'No loop body found for {marker}')
    return text[:start] + text[block_end(text, brace):]


path = Path('Elephant/backend/knowledge-core/src/graph.rs')
text = path.read_text()
text = text.replace('use rusqlite::{params, Connection};', 'use rusqlite::Connection;')
text = text.replace(
    '#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]\npub struct KnowledgeGraph {',
    '#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]\npub struct KnowledgeGraph {'
)
path.write_text(text)

path = Path('Elephant/backend/tauri/build.rs')
text = path.read_text()
text = re.sub(
    r'(?m)^\s*out\.push_str\("use crate::search_logic::\{normalize_query, score_text\};\\n"\);\s*\n',
    '',
    text,
)
text = remove_enclosing_for_loop(text, 'generated_search_case_')
text = remove_enclosing_for_loop(text, 'generated_case_whitespace_query_case_')
if 'search_logic' in text or 'normalize_query' in text or 'score_text' in text:
    raise RuntimeError('Legacy search parity contracts remain in build.rs')
path.write_text(text)

path = Path('Elephant/backend/tauri/src/vault/commands.rs')
text = path.read_text()
for name in [
    'search_scan_respects_result_limit',
    'search_scan_ignores_hidden_directories',
]:
    text = remove_test_function(text, name)
if 'scan_notes(' in text:
    raise RuntimeError('Legacy scan_notes reference remains')
path.write_text(text)

path = Path('Elephant/backend/tauri/src/tauri_extra_commands.rs')
text = remove_test_function(
    path.read_text(),
    'search_index_builds_documents_and_wikilink_edges'
)
if 'build_search_index(' in text:
    raise RuntimeError('Legacy build_search_index reference remains')
path.write_text(text)

from pathlib import Path

path = Path('Elephant/backend/knowledge-core/src/wiki_core.rs')
text = path.read_text(encoding='utf-8')
text = text.replace(
    '            let number = *citation_numbers.entry(chunk_id.clone()).or_insert(next);\n',
    '            citation_numbers.entry(chunk_id.clone()).or_insert(next);\n'
)
text = text.replace(
    '        assert!(rendered.markdown.contains("[1](../../Notes/Iroh.md"));',
    '        assert!(rendered.markdown.contains("[Iroh](../../Notes/Iroh.md"));'
)
path.write_text(text, encoding='utf-8')

path = Path('Elephant/backend/tauri/src/knowledge_wiki_library.rs')
text = path.read_text(encoding='utf-8')
text = text.replace(
    '        let number = citation_number(citation, index + 1);\n        body.push_str(&format!(',
    '        body.push_str(&format!(',
    1
)
text = text.replace(
    '        assert!(migrated.contains("[1](../../Notes/Iroh%20guide.md#direct-connections)"));',
    '        assert!(migrated.contains("[Direct connections](../../Notes/Iroh%20guide.md#direct-connections)"));'
)
text = text.replace(
    '            "1. [Iroh guide — Direct connections](../../Notes/Iroh%20guide.md#direct-connections)"',
    '            "- [Iroh guide — Direct connections](../../Notes/Iroh%20guide.md#direct-connections)"'
)
path.write_text(text, encoding='utf-8')

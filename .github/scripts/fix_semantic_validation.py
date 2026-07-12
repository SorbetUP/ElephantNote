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

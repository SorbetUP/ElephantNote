from pathlib import Path

path = Path('Elephant/backend/knowledge-core/src/wiki_core.rs')
text = path.read_text(encoding='utf-8')
old = '''    #[test]
    fn renders_markdown_and_footnotes_from_structured_claims() {
'''
new = '''    #[test]
    fn renders_navigable_markdown_links_from_structured_claims() {
'''
if old in text:
    text = text.replace(old, new, 1)
old_assertions = '''        assert!(rendered.markdown.contains("[^source-1]"));
        assert!(rendered.markdown.contains("[[Notes/Iroh.md#Iroh"));
        assert!(rendered.markdown.contains("[[Peer-to-peer networking]]"));
'''
new_assertions = '''        assert!(rendered.markdown.contains("[1](../../Notes/Iroh.md"));
        assert!(rendered
            .markdown
            .contains("[Peer-to-peer networking](./peer-to-peer-networking.md)"));
'''
if old_assertions not in text:
    raise SystemExit('Expected Wiki rendering assertions were not found')
path.write_text(text.replace(old_assertions, new_assertions, 1), encoding='utf-8')

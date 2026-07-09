from pathlib import Path

path = Path('Elephant/backend/knowledge-core/src/graph.rs')
text = path.read_text()
text = text.replace('use rusqlite::{params, Connection};', 'use rusqlite::Connection;')
text = text.replace(
    '#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]\npub struct KnowledgeGraph {',
    '#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]\npub struct KnowledgeGraph {'
)
path.write_text(text)

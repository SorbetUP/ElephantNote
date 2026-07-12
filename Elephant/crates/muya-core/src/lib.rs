//! DOM-independent core for the Muya replacement.
//!
//! The crate owns the document model, Markdown syntax registry, parsing,
//! serialization and eventually transactions, selection and history. Browser
//! and Tauri integrations remain adapters around this crate.

pub mod model;
pub mod parser;
pub mod serializer;
pub mod syntax;

pub use model::{Document, Node, NodeId, NodeKind, SourceRange};
pub use parser::parse_markdown;
pub use serializer::to_markdown;

//! DOM-independent core for the Muya replacement.
//!
//! The crate owns the document model, Markdown syntax registry, parsing,
//! serialization, semantic transactions, history and logical selections.
//! Browser and Tauri integrations remain adapters around this crate.

pub mod edit;
pub mod history;
pub mod model;
pub mod parser;
pub mod selection;
pub mod serializer;
pub mod syntax;

pub use edit::{Command, EditError, Operation, Transaction, Utf16Range};
pub use history::History;
pub use model::{Document, Node, NodeId, NodeKind, SourceRange};
pub use parser::parse_markdown;
pub use selection::{Selection, SelectionPoint};
pub use serializer::to_markdown;

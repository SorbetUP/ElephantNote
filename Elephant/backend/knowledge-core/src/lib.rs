pub mod actions;
pub mod chunking;
pub mod model;
pub mod pipeline;
pub mod storage;

pub use actions::{ActionValidation, ChatKnowledgeAction};
pub use chunking::analyze_markdown;
pub use model::{
    DocumentSnapshot, ExplicitLink, KnowledgeChunk, KnowledgeSearchHit, KnowledgeSection,
    KnowledgeStatus, RebuildFailure, RebuildReport,
};
pub use pipeline::rebuild_vault;
pub use storage::KnowledgeStore;

pub mod actions;
pub mod chunking;
pub mod extraction;
pub mod model;
pub mod pipeline;
pub mod storage;
pub mod taxonomy;

pub use actions::{ActionValidation, ChatKnowledgeAction};
pub use chunking::analyze_markdown;
pub use extraction::{
    build_tagging_request, parse_tagging_response, ExtractionValidation, StructuredModelRequest,
    StructuredTask, TagSuggestion, TaggingExtraction,
};
pub use model::{
    DocumentSnapshot, ExplicitLink, KnowledgeChunk, KnowledgeSearchHit, KnowledgeSection,
    KnowledgeStatus, RebuildFailure, RebuildReport,
};
pub use pipeline::rebuild_vault;
pub use storage::KnowledgeStore;
pub use taxonomy::{
    canonical_tag_key, clean_display_name, normalize_alias, stable_tag_id, CanonicalTag,
    NewTagCandidate, TagAlias, TagStatus,
};

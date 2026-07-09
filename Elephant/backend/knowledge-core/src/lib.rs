pub mod actions;
pub mod chat_action_storage;
pub mod chat_actions;
pub mod chunking;
pub mod extraction;
pub mod graph;
pub mod model;
pub mod pipeline;
pub mod relation_extraction;
pub mod relation_storage;
pub mod relations;
pub mod storage;
pub mod taxonomy;
pub mod taxonomy_storage;

pub use actions::{ActionValidation, ChatKnowledgeAction};
pub use chat_actions::{
    execute_approved_chat_action, prepare_chat_action, ChatActionExecution, ChatActionPreview,
    ChatActionProposal, ChatActionStatus,
};
pub use chunking::analyze_markdown;
pub use extraction::{
    build_tagging_request, parse_tagging_response, ExtractionValidation, StructuredModelRequest,
    StructuredTask, TagSuggestion, TaggingExtraction,
};
pub use graph::{KnowledgeGraph, KnowledgeGraphCluster, KnowledgeGraphEdge, KnowledgeGraphNode};
pub use model::{
    DocumentSnapshot, ExplicitLink, KnowledgeChunk, KnowledgeSearchHit, KnowledgeSection,
    KnowledgeStatus, RebuildFailure, RebuildReport,
};
pub use pipeline::rebuild_vault;
pub use relation_extraction::{
    build_relation_extraction_request, parse_relation_extraction_response, ExtractedRelation,
    RelationExtraction, RelationExtractionValidation,
};
pub use relations::{
    stable_relation_id, KnowledgeNodeKind, KnowledgeNodeRef, KnowledgeRelation, RelationOrigin,
    RelationStatus, RelationType, RelationValidation,
};
pub use storage::KnowledgeStore;
pub use taxonomy::{
    canonical_tag_key, clean_display_name, normalize_alias, stable_tag_id, CanonicalTag,
    NewTagCandidate, TagAlias, TagStatus,
};
pub use taxonomy_storage::{DocumentTagAssignment, TagAssignmentOrigin, TagAssignmentStatus};

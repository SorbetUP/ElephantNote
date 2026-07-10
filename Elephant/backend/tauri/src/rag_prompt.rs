use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct RagCitation {
    pub title: String,
    pub path: String,
    pub snippet: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct WikiContext {
    pub source_title: Option<String>,
    pub source_path: Option<String>,
    pub graph_nodes: u32,
    pub graph_semantic_links: u32,
    pub graph_clusters: u32,
    pub cluster_label: Option<String>,
    pub cluster_node_count: u32,
    pub related_nodes: Vec<RelatedNode>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct RelatedNode {
    pub title: String,
    pub link_type: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct RagPrompt {
    pub system_message: String,
    pub prompt: String,
}

pub fn build_rag_chat_prompt(
    message: &str,
    citations: &[RagCitation],
    wiki: Option<&WikiContext>,
) -> RagPrompt {
    let context_block = citations
        .iter()
        .enumerate()
        .map(|(i, c)| format!("[{}] {} ({})\n{}", i + 1, c.title, c.path, c.snippet))
        .collect::<Vec<_>>()
        .join("\n\n");

    let wiki_block = wiki.map(|w| {
        let mut lines = vec!["Wiki context:".to_string()];
        let src = w
            .source_title
            .clone()
            .or_else(|| w.source_path.clone())
            .unwrap_or_else(|| "unknown".to_string());
        lines.push(format!("- Source: {src}"));
        lines.push(format!(
            "- Graph: {} nodes, {} semantic links, {} clusters",
            w.graph_nodes, w.graph_semantic_links, w.graph_clusters
        ));
        if let Some(label) = &w.cluster_label {
            lines.push(format!(
                "- Cluster: {label} ({} notes)",
                w.cluster_node_count
            ));
        }
        if !w.related_nodes.is_empty() {
            let preview: Vec<String> = w
                .related_nodes
                .iter()
                .take(5)
                .enumerate()
                .map(|(i, n)| format!("{}. {} [{}]", i + 1, n.title, n.link_type))
                .collect();
            lines.push(format!("- Related notes: {}", preview.join("; ")));
        }
        lines.join("\n")
    });

    let has_context = !citations.is_empty() || wiki_block.is_some();

    let prompt = if has_context {
        let mut sections = vec![format!("Question: {message}"), "Local context:".to_string()];
        sections.push(if context_block.is_empty() {
            "No direct note citation matched.".to_string()
        } else {
            context_block.clone()
        });
        if let Some(wb) = &wiki_block {
            sections.push(format!("\n{wb}"));
        }
        sections.join("\n\n")
    } else {
        format!(
      "Question: {message}\n\nNo local note citation matched this message. Answer normally as the ElephantNote chat assistant. Do not claim that a local note matched unless citations are provided."
    )
    };

    let system_message = if has_context {
        "You are a private local notes assistant. Use the provided citations, semantic graph, and wiki context for grounded factual claims. Cite relevant sources with markers like [1]. If the user asks for general help, you may also answer normally while keeping citations for note-derived claims."
    } else {
        "You are the ElephantNote chat assistant. No local note citation matched the user message, so answer normally without pretending to have local-note evidence."
    };

    RagPrompt {
        system_message: system_message.to_string(),
        prompt,
    }
}

#[tauri::command]
pub fn tauri_rag_build_prompt(
    message: String,
    citations: Vec<RagCitation>,
    wiki: Option<WikiContext>,
) -> RagPrompt {
    build_rag_chat_prompt(&message, &citations, wiki.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_state_yields_no_context_prompt() {
        let p = build_rag_chat_prompt("Hello", &[], None);
        assert!(p.prompt.contains("Question: Hello"));
        assert!(p.prompt.contains("No local note citation matched"));
        assert!(p.system_message.contains("chat assistant"));
    }

    #[test]
    fn citations_populate_context_block() {
        let c = vec![
            RagCitation {
                title: "A".into(),
                path: "a.md".into(),
                snippet: "alpha text".into(),
            },
            RagCitation {
                title: "B".into(),
                path: "b.md".into(),
                snippet: "beta text".into(),
            },
        ];
        let p = build_rag_chat_prompt("What?", &c, None);
        assert!(p.prompt.contains("[1] A (a.md)"));
        assert!(p.prompt.contains("[2] B (b.md)"));
        assert!(p.system_message.contains("private local notes assistant"));
    }

    #[test]
    fn wiki_block_appends_when_present() {
        let w = WikiContext {
            source_title: Some("Origin".into()),
            graph_nodes: 10,
            graph_semantic_links: 4,
            graph_clusters: 2,
            related_nodes: vec![RelatedNode {
                title: "Related".into(),
                link_type: "semantic".into(),
            }],
            ..Default::default()
        };
        let p = build_rag_chat_prompt("Q", &[], Some(&w));
        assert!(p.prompt.contains("Wiki context:"));
        assert!(p.prompt.contains("- Source: Origin"));
        assert!(p.prompt.contains("10 nodes, 4 semantic links, 2 clusters"));
        assert!(p.prompt.contains("1. Related [semantic]"));
    }

    #[test]
    fn system_message_swaps_when_context_present() {
        let no_ctx = build_rag_chat_prompt("x", &[], None);
        let with_ctx = build_rag_chat_prompt("x", &[RagCitation::default()], None);
        assert_ne!(no_ctx.system_message, with_ctx.system_message);
    }

    #[test]
    fn related_notes_truncated_to_five() {
        let w = WikiContext {
            related_nodes: (0..10)
                .map(|i| RelatedNode {
                    title: format!("R{i}"),
                    link_type: "l".into(),
                })
                .collect(),
            ..Default::default()
        };
        let p = build_rag_chat_prompt("x", &[RagCitation::default()], Some(&w));
        assert!(p.prompt.contains("1. R0"));
        assert!(!p.prompt.contains("6. R5"));
    }
}

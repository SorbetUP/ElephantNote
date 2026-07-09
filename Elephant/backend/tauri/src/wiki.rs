use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct WikiCitation {
  pub path: String,
  pub title: String,
  pub excerpt: String,
  #[serde(default)]
  pub tags: Vec<String>,
  #[serde(default)]
  pub source_count: u32,
  #[serde(default)]
  pub chunk_count: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct WikiProposal {
  pub id: String,
  pub topic: String,
  pub title: String,
  pub summary: String,
  #[serde(default)]
  pub citations: Vec<WikiCitation>,
  pub status: String,
  pub created_at: String,
  pub updated_at: String,
}

pub fn slugify(value: &str) -> String {
  let lowered = value.to_lowercase();
  let mut out = String::with_capacity(lowered.len());
  for c in lowered.chars() {
    if c.is_ascii_alphanumeric() {
      out.push(c);
    } else if c == '-' {
      if !out.ends_with('-') && !out.is_empty() {
        out.push('-');
      }
    } else if !out.ends_with('-') && !out.is_empty() {
      out.push('-');
    }
  }
  let slug = out.trim_matches('-').to_string();
  if slug.is_empty() {
    "topic".into()
  } else {
    slug
  }
}

fn node_path(node: &Value) -> String {
  node
    .get("relativePath")
    .or_else(|| node.get("path"))
    .or_else(|| node.get("id"))
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_string()
}

fn is_note_like(node: &Value) -> bool {
  let path = node_path(node);
  if path.is_empty() {
    return false;
  }
  let kind = node
    .get("kind")
    .or_else(|| node.get("type"))
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_lowercase();
  if kind == "folder" || kind == "directory" {
    return false;
  }
  if kind == "note" {
    return true;
  }
  path.to_ascii_lowercase().ends_with(".md")
}

fn citation_of(node: &Value) -> WikiCitation {
  WikiCitation {
    path: node_path(node),
    title: node
      .get("title")
      .or_else(|| node.get("relativePath"))
      .or_else(|| node.get("path"))
      .or_else(|| node.get("id"))
      .and_then(|v| v.as_str())
      .unwrap_or("Untitled")
      .to_string(),
    excerpt: node.get("summary").or_else(|| node.get("plainText")).and_then(|v| v.as_str()).unwrap_or("").trim().to_string(),
    tags: node
      .get("tags")
      .and_then(|v| v.as_array())
      .map(|arr| {
        arr
          .iter()
          .filter_map(|tag| tag.as_str().map(|s| s.to_string()))
          .collect()
      })
      .unwrap_or_default(),
    source_count: node
      .get("sourceCount")
      .or_else(|| node.get("sources"))
      .and_then(|v| v.as_array())
      .map(|arr| arr.len() as u32)
      .unwrap_or(0),
    chunk_count: node
      .get("chunkCount")
      .or_else(|| node.get("chunks"))
      .and_then(|v| v.as_array())
      .map(|arr| arr.len() as u32)
      .unwrap_or(0),
  }
}

fn graph_summary(topic: &str, node_count: usize, semantic_link_count: usize, source_count: usize) -> String {
  let node_phrase = format!("{node_count} note{}", if node_count == 1 { "" } else { "s" });
  let link_phrase = if semantic_link_count > 0 {
    format!(" and {semantic_link_count} semantic link{}", if semantic_link_count == 1 { "" } else { "s" })
  } else {
    String::new()
  };
  let source_phrase = if source_count > 0 {
    format!(" from {source_count} cited source{}", if source_count == 1 { "" } else { "s" })
  } else {
    String::new()
  };
  format!("This wiki proposal connects {node_phrase} around {topic}{link_phrase}{source_phrase}.")
}

pub fn build_wiki_proposals_from_graph(graph: &Value) -> Vec<WikiProposal> {
  let nodes = graph.get("nodes").and_then(|v| v.as_array()).cloned().unwrap_or_default();
  let edges = graph.get("edges").and_then(|v| v.as_array()).cloned().unwrap_or_default();
  let clusters = graph.get("clusters").and_then(|v| v.as_array()).cloned().unwrap_or_default();

  let note_nodes: Vec<Value> = nodes.iter().filter(|n| is_note_like(n)).cloned().collect();
  let by_path: std::collections::HashMap<String, Value> = note_nodes
    .iter()
    .map(|node| (node_path(node), node.clone()))
    .collect();
  let semantic_edges: Vec<Value> = edges
    .iter()
    .filter(|e| e.get("type").and_then(|v| v.as_str()) == Some("semantic"))
    .cloned()
    .collect();

  let mut proposals: Vec<WikiProposal> = Vec::new();
  let now = chrono::Utc::now().to_rfc3339();

  for cluster in &clusters {
    let paths: Vec<String> = cluster
      .get("paths")
      .and_then(|v| v.as_array())
      .map(|arr| {
        arr
          .iter()
          .filter_map(|p| p.as_str().map(|s| s.to_string()))
          .collect()
      })
      .unwrap_or_default();
    let path_set: HashSet<String> = paths.iter().cloned().collect();
    let cluster_nodes: Vec<Value> = paths.iter().filter_map(|p| by_path.get(p).cloned()).collect();
    if cluster_nodes.len() < 2 {
      continue;
    }
    let citations: Vec<WikiCitation> = cluster_nodes
      .iter()
      .take(8)
      .map(citation_of)
      .filter(|c| !c.path.is_empty())
      .collect();
    if citations.len() < 2 {
      continue;
    }
    let topic = cluster
      .get("label")
      .or_else(|| cluster.get("id"))
      .and_then(|v| v.as_str())
      .or_else(|| citations.first().map(|c| c.title.as_str()))
      .unwrap_or("Wiki topic")
      .trim()
      .to_string();
    let source_count: u32 = cluster_nodes
      .iter()
      .map(|node| {
        node
          .get("sourceCount")
          .and_then(|v| v.as_u64())
          .unwrap_or(0) as u32
          + node
            .get("sources")
            .and_then(|v| v.as_array())
            .map(|arr| arr.len() as u32)
            .unwrap_or(0)
      })
      .sum();
    let semantic_link_count = semantic_edges
      .iter()
      .filter(|edge| {
        let src = edge.get("source").and_then(|v| v.as_str()).unwrap_or("");
        let tgt = edge.get("target").and_then(|v| v.as_str()).unwrap_or("");
        path_set.contains(src) || path_set.contains(tgt)
      })
      .count();
    proposals.push(WikiProposal {
      id: format!("wiki-{}", slugify(&topic)),
      topic: topic.clone(),
      title: topic.clone(),
      summary: graph_summary(&topic, cluster_nodes.len(), semantic_link_count, source_count as usize),
      citations,
      status: "proposed".into(),
      created_at: now.clone(),
      updated_at: now.clone(),
    });
  }

  proposals.sort_by(|a, b| {
    b.citations
      .len()
      .cmp(&a.citations.len())
      .then_with(|| a.topic.cmp(&b.topic))
  });
  proposals
}

#[tauri::command]
pub fn tauri_wiki_proposals(graph: Option<Value>) -> Vec<WikiProposal> {
  build_wiki_proposals_from_graph(&graph.unwrap_or(Value::Null))
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn slugify_handles_accents_and_punctuation() {
    assert_eq!(slugify("Café Latte"), "caf-latte");
    assert_eq!(slugify(""), "topic");
    assert_eq!(slugify("---"), "topic");
    assert_eq!(slugify("Hello, World!"), "hello-world");
  }

  #[test]
  fn is_note_like_requires_md_or_note_kind() {
    assert!(is_note_like(&json!({ "relativePath": "note.md" })));
    assert!(is_note_like(&json!({ "kind": "note", "relativePath": "x" })));
    assert!(!is_note_like(&json!({ "kind": "folder", "relativePath": "sub" })));
    assert!(!is_note_like(&json!({})));
  }

  #[test]
  fn empty_graph_returns_no_proposals() {
    assert!(build_wiki_proposals_from_graph(&json!({})).is_empty());
  }

  #[test]
  fn cluster_with_two_notes_yields_proposal() {
    let graph = json!({
      "nodes": [
        { "relativePath": "a.md", "title": "Alpha" },
        { "relativePath": "b.md", "title": "Beta" }
      ],
      "clusters": [{ "id": "c1", "label": "Topic", "paths": ["a.md", "b.md"] }],
      "edges": []
    });
    let proposals = build_wiki_proposals_from_graph(&graph);
    assert_eq!(proposals.len(), 1);
    assert_eq!(proposals[0].topic, "Topic");
    assert_eq!(proposals[0].citations.len(), 2);
    assert!(proposals[0].id.starts_with("wiki-"));
  }

  #[test]
  fn cluster_with_single_note_is_skipped() {
    let graph = json!({
      "nodes": [{ "relativePath": "only.md", "title": "Solo" }],
      "clusters": [{ "id": "c1", "paths": ["only.md"] }]
    });
    assert!(build_wiki_proposals_from_graph(&graph).is_empty());
  }

  #[test]
  fn citations_truncate_to_eight_per_cluster() {
    let paths: Vec<Value> = (0..20).map(|i| json!({ "relativePath": format!("n{i}.md"), "title": format!("Note {i}") })).collect();
    let paths_array: Vec<String> = (0..20).map(|i| format!("n{i}.md")).collect();
    let graph = json!({
      "nodes": paths,
      "clusters": [{ "id": "big", "label": "Big", "paths": paths_array }]
    });
    let proposals = build_wiki_proposals_from_graph(&graph);
    assert_eq!(proposals.len(), 1);
    assert_eq!(proposals[0].citations.len(), 8);
  }

  #[test]
  fn proposals_sort_by_citations_count_desc_then_topic() {
    let graph = json!({
      "nodes": [
        { "relativePath": "z.md", "title": "Z" },
        { "relativePath": "y.md", "title": "Y" },
        { "relativePath": "x.md", "title": "X" },
        { "relativePath": "w.md", "title": "W" }
      ],
      "clusters": [
        { "id": "a", "label": "AAA", "paths": ["z.md", "y.md"] },
        { "id": "b", "label": "BBB", "paths": ["z.md", "y.md", "x.md", "w.md"] }
      ]
    });
    let proposals = build_wiki_proposals_from_graph(&graph);
    assert_eq!(proposals.len(), 2);
    assert!(proposals[0].citations.len() >= proposals[1].citations.len());
  }

  #[test]
  fn graph_summary_pluralizes_correctly() {
    let s = graph_summary("t", 2, 3, 1);
    assert!(s.contains("2 notes"));
    assert!(s.contains("3 semantic links"));
    assert!(s.contains("1 cited source"));
  }

  #[test]
  fn citation_contains_tags_when_present() {
    let node = json!({ "relativePath": "a.md", "title": "A", "tags": ["alpha", "beta"] });
    let c = citation_of(&node);
    assert_eq!(c.tags, vec!["alpha", "beta"]);
  }

  #[test]
  fn paired_id_is_slugified_topic() {
    let graph = json!({
      "nodes": [
        { "relativePath": "a.md", "title": "A" },
        { "relativePath": "b.md", "title": "B" }
      ],
      "clusters": [{ "id": "c", "label": "Coffee, Tea & Spices", "paths": ["a.md", "b.md"] }]
    });
    let proposals = build_wiki_proposals_from_graph(&graph);
    assert_eq!(proposals[0].id, "wiki-coffee-tea-spices");
  }
}
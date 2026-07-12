from pathlib import Path
import re

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing marker: {label}')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Real embedding-assisted Wiki discovery.
# ---------------------------------------------------------------------------
write('Elephant/backend/tauri/src/knowledge_wiki_discovery.rs', r'''#[cfg(not(mobile))]
use crate::chat_runtime::codex_app_server;
use elephantnote_knowledge_core::KnowledgeStore;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const DISCOVERY_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS wiki_saved_candidates (
  topic TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  preview TEXT NOT NULL,
  suggested_sections_json TEXT NOT NULL,
  source_paths_json TEXT NOT NULL,
  source_titles_json TEXT NOT NULL,
  score INTEGER NOT NULL,
  origin TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS wiki_embedding_cache (
  document_path TEXT NOT NULL,
  model_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  vector_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY(document_path, model_key)
);
"#;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SemanticWikiCandidate {
    pub topic: String,
    pub title: String,
    pub reason: String,
    pub preview: String,
    pub suggested_sections: Vec<String>,
    pub source_paths: Vec<String>,
    pub source_titles: Vec<String>,
    pub score: usize,
    pub coherence: f32,
}

#[cfg(not(mobile))]
#[derive(Debug, Clone)]
struct EmbeddingRoute {
    source: String,
    model: String,
    endpoint: String,
    api_key: String,
    headers: HashMap<String, String>,
    threshold: f32,
}

#[cfg(not(mobile))]
#[derive(Debug, Clone)]
struct DocumentVector {
    path: String,
    title: String,
    excerpt: String,
    vector: Vec<f32>,
}

#[cfg(not(mobile))]
#[derive(Debug, Clone)]
struct Cluster {
    centroid: Vec<f32>,
    members: Vec<usize>,
    coherence: f32,
}

#[cfg(not(mobile))]
#[derive(Debug, Deserialize)]
struct DiscoveryEnvelope {
    #[serde(default)]
    candidates: Vec<DiscoveryLabel>,
}

#[cfg(not(mobile))]
#[derive(Debug, Deserialize)]
struct DiscoveryLabel {
    cluster_id: usize,
    #[serde(default = "default_true")]
    include: bool,
    title: String,
    topic: String,
    reason: String,
    preview: String,
    #[serde(default)]
    suggested_sections: Vec<String>,
}

#[cfg(not(mobile))]
fn default_true() -> bool {
    true
}

fn active_vault_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(PathBuf::from(crate::vault::config::get_active_vault(app)?.path))
}

fn open_connection(root: &Path) -> Result<Connection, String> {
    let store = KnowledgeStore::open(root)?;
    let connection = Connection::open(store.database_path()).map_err(|error| error.to_string())?;
    connection
        .execute_batch(DISCOVERY_SCHEMA)
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

#[cfg(not(mobile))]
fn string_at(value: &Value, pointer: &str) -> String {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("")
        .to_string()
}

#[cfg(not(mobile))]
fn provider_source(provider: &Value) -> String {
    match provider.get("type").and_then(Value::as_str).unwrap_or("") {
        "openai-compatible" => "api".into(),
        value => value.to_string(),
    }
}

#[cfg(not(mobile))]
fn embedding_route(config: &Value) -> Result<EmbeddingRoute, String> {
    let route = config.pointer("/routes/embedding").unwrap_or(&Value::Null);
    let source = route
        .get("source")
        .or_else(|| route.get("provider"))
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("")
        .to_string();
    let model = route
        .get("model")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("")
        .to_string();
    if source.is_empty() || source == "disabled" || model.is_empty() {
        return Err("Configure a real embedding provider and model in AI > Search before semantic Wiki discovery.".into());
    }

    let provider = config
        .pointer("/providers/list")
        .and_then(Value::as_array)
        .and_then(|rows| rows.iter().find(|row| provider_source(row) == source));
    let endpoint = route
        .get("endpoint")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| provider.and_then(|row| row.get("endpoint").and_then(Value::as_str).map(str::to_string)))
        .or_else(|| {
            if source == "app-local" {
                let value = string_at(config, "/localRuntime/llamaBaseUrl");
                (!value.is_empty()).then_some(value)
            } else {
                None
            }
        })
        .ok_or_else(|| "The selected embedding route has no endpoint. ElephantNote will not fake semantic discovery with lexical matching.".to_string())?;
    let api_key = provider
        .and_then(|row| row.get("apiKey").and_then(Value::as_str))
        .unwrap_or("")
        .to_string();
    let headers = provider
        .and_then(|row| row.get("headers").and_then(Value::as_object))
        .map(|object| {
            object
                .iter()
                .filter_map(|(key, value)| value.as_str().map(|value| (key.clone(), value.to_string())))
                .collect()
        })
        .unwrap_or_default();
    let threshold = route
        .get("wikiClusterThreshold")
        .or_else(|| route.get("clusterThreshold"))
        .and_then(Value::as_f64)
        .unwrap_or(0.72)
        .clamp(0.45, 0.95) as f32;
    Ok(EmbeddingRoute {
        source,
        model,
        endpoint,
        api_key,
        headers,
        threshold,
    })
}

#[cfg(not(mobile))]
fn normalize_vector(mut vector: Vec<f32>) -> Result<Vec<f32>, String> {
    if vector.is_empty() || vector.iter().any(|value| !value.is_finite()) {
        return Err("Embedding provider returned an empty or invalid vector.".into());
    }
    let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
    if norm <= f32::EPSILON {
        return Err("Embedding provider returned a zero vector.".into());
    }
    for value in &mut vector {
        *value /= norm;
    }
    Ok(vector)
}

#[cfg(not(mobile))]
fn cosine(left: &[f32], right: &[f32]) -> f32 {
    if left.len() != right.len() || left.is_empty() {
        return -1.0;
    }
    left.iter().zip(right).map(|(a, b)| a * b).sum()
}

#[cfg(not(mobile))]
fn embedding_url(route: &EmbeddingRoute) -> String {
    let base = route.endpoint.trim_end_matches('/');
    if route.source == "ollama" {
        if base.ends_with("/api/embed") {
            base.to_string()
        } else {
            format!("{base}/api/embed")
        }
    } else if base.ends_with("/embeddings") {
        base.to_string()
    } else if base.ends_with("/v1") {
        format!("{base}/embeddings")
    } else {
        format!("{base}/v1/embeddings")
    }
}

#[cfg(not(mobile))]
fn request_headers(route: &EmbeddingRoute) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    if !route.api_key.trim().is_empty() {
        let value = HeaderValue::from_str(&format!("Bearer {}", route.api_key.trim()))
            .map_err(|error| error.to_string())?;
        headers.insert(AUTHORIZATION, value);
    }
    for (key, value) in &route.headers {
        let name = HeaderName::from_bytes(key.as_bytes()).map_err(|error| error.to_string())?;
        let value = HeaderValue::from_str(value).map_err(|error| error.to_string())?;
        headers.insert(name, value);
    }
    Ok(headers)
}

#[cfg(not(mobile))]
async fn embed_batch(route: &EmbeddingRoute, inputs: &[String]) -> Result<Vec<Vec<f32>>, String> {
    let client = reqwest::Client::new();
    let body = if route.source == "ollama" {
        json!({ "model": route.model, "input": inputs })
    } else {
        json!({ "model": route.model, "input": inputs })
    };
    let response = client
        .post(embedding_url(route))
        .headers(request_headers(route)?)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Embedding request failed: {error}"))?;
    let status = response.status();
    let value: Value = response
        .json()
        .await
        .map_err(|error| format!("Embedding response is not JSON: {error}"))?;
    if !status.is_success() {
        return Err(format!("Embedding provider returned {status}: {value}"));
    }
    let raw = if route.source == "ollama" {
        value
            .get("embeddings")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    } else {
        let mut rows = value
            .get("data")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        rows.sort_by_key(|row| row.get("index").and_then(Value::as_u64).unwrap_or(u64::MAX));
        rows.into_iter()
            .map(|row| row.get("embedding").cloned().unwrap_or(Value::Null))
            .collect()
    };
    if raw.len() != inputs.len() {
        return Err(format!(
            "Embedding provider returned {} vectors for {} inputs.",
            raw.len(),
            inputs.len()
        ));
    }
    raw.into_iter()
        .map(|row| {
            let values = row
                .as_array()
                .ok_or_else(|| "Embedding vector is not an array.".to_string())?
                .iter()
                .map(|value| value.as_f64().map(|value| value as f32).ok_or_else(|| "Embedding vector contains a non-number.".to_string()))
                .collect::<Result<Vec<_>, _>>()?;
            normalize_vector(values)
        })
        .collect()
}

#[cfg(not(mobile))]
fn load_documents(connection: &Connection) -> Result<Vec<(String, String, String, String)>, String> {
    let mut statement = connection
        .prepare(
            "SELECT d.relative_path, d.title, d.content_hash,
                    COALESCE((SELECT group_concat(text, '\n') FROM
                      (SELECT text FROM chunks WHERE document_path=d.relative_path ORDER BY ordinal LIMIT 4)), '')
             FROM documents d ORDER BY d.relative_path",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[cfg(not(mobile))]
async fn document_vectors(
    connection: &Connection,
    route: &EmbeddingRoute,
) -> Result<Vec<DocumentVector>, String> {
    let model_key = format!("{}|{}|{}", route.source, route.endpoint, route.model);
    let documents = load_documents(connection)?;
    let mut output = Vec::<Option<DocumentVector>>::with_capacity(documents.len());
    let mut missing = Vec::<(usize, String, String, String, String)>::new();
    for (path, title, content_hash, body) in documents {
        let excerpt = body.chars().take(3_000).collect::<String>();
        if title.trim().is_empty() && excerpt.trim().is_empty() {
            continue;
        }
        let cached = connection
            .query_row(
                "SELECT vector_json FROM wiki_embedding_cache WHERE document_path=?1 AND model_key=?2 AND content_hash=?3",
                params![path, model_key, content_hash],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        let index = output.len();
        if let Some(raw) = cached {
            if let Ok(vector) = serde_json::from_str::<Vec<f32>>(&raw).and_then(|value| normalize_vector(value).map_err(serde_json::Error::custom)) {
                output.push(Some(DocumentVector { path, title, excerpt, vector }));
                continue;
            }
        }
        output.push(None);
        missing.push((index, path, title, content_hash, excerpt));
    }

    for batch in missing.chunks(32) {
        let inputs = batch
            .iter()
            .map(|(_, _, title, _, excerpt)| format!("Title: {title}\n\n{excerpt}"))
            .collect::<Vec<_>>();
        let vectors = embed_batch(route, &inputs).await?;
        for ((index, path, title, content_hash, excerpt), vector) in batch.iter().zip(vectors) {
            connection
                .execute(
                    "INSERT INTO wiki_embedding_cache(document_path, model_key, content_hash, vector_json, updated_at)
                     VALUES (?1, ?2, ?3, ?4, unixepoch())
                     ON CONFLICT(document_path, model_key) DO UPDATE SET
                       content_hash=excluded.content_hash,
                       vector_json=excluded.vector_json,
                       updated_at=unixepoch()",
                    params![path, model_key, content_hash, serde_json::to_string(&vector).map_err(|error| error.to_string())?],
                )
                .map_err(|error| error.to_string())?;
            output[*index] = Some(DocumentVector {
                path: path.clone(),
                title: title.clone(),
                excerpt: excerpt.clone(),
                vector,
            });
        }
    }
    Ok(output.into_iter().flatten().collect())
}

#[cfg(not(mobile))]
fn recompute_centroid(cluster: &mut Cluster, documents: &[DocumentVector]) {
    if cluster.members.is_empty() {
        return;
    }
    let dimensions = documents[cluster.members[0]].vector.len();
    let mut centroid = vec![0.0; dimensions];
    for index in &cluster.members {
        for (target, value) in centroid.iter_mut().zip(&documents[*index].vector) {
            *target += *value;
        }
    }
    if let Ok(normalized) = normalize_vector(centroid) {
        cluster.centroid = normalized;
    }
    cluster.coherence = cluster
        .members
        .iter()
        .map(|index| cosine(&cluster.centroid, &documents[*index].vector))
        .sum::<f32>()
        / cluster.members.len() as f32;
}

#[cfg(not(mobile))]
fn cluster_documents(documents: &[DocumentVector], threshold: f32) -> Vec<Cluster> {
    let mut clusters = Vec::<Cluster>::new();
    for (index, document) in documents.iter().enumerate() {
        let best = clusters
            .iter()
            .enumerate()
            .filter(|(_, cluster)| cluster.members.len() < 80)
            .map(|(cluster_index, cluster)| (cluster_index, cosine(&cluster.centroid, &document.vector)))
            .max_by(|left, right| left.1.total_cmp(&right.1));
        if let Some((cluster_index, similarity)) = best.filter(|(_, similarity)| *similarity >= threshold) {
            clusters[cluster_index].members.push(index);
            recompute_centroid(&mut clusters[cluster_index], documents);
        } else {
            clusters.push(Cluster {
                centroid: document.vector.clone(),
                members: vec![index],
                coherence: 1.0,
            });
        }
    }
    clusters.retain(|cluster| cluster.members.len() >= 3);
    clusters.sort_by(|left, right| {
        right
            .members
            .len()
            .cmp(&left.members.len())
            .then_with(|| right.coherence.total_cmp(&left.coherence))
    });
    clusters
}

#[cfg(not(mobile))]
fn json_object_from_text(text: &str) -> Result<&str, String> {
    let start = text.find('{').ok_or_else(|| "Semantic discovery model returned no JSON object.".to_string())?;
    let end = text.rfind('}').ok_or_else(|| "Semantic discovery model returned incomplete JSON.".to_string())?;
    if end < start {
        return Err("Semantic discovery model returned invalid JSON boundaries.".into());
    }
    Ok(&text[start..=end])
}

#[cfg(not(mobile))]
fn persist_candidates(connection: &Connection, candidates: &[SemanticWikiCandidate]) -> Result<(), String> {
    for candidate in candidates {
        connection
            .execute(
                "INSERT INTO wiki_saved_candidates(topic, title, reason, preview, suggested_sections_json, source_paths_json, source_titles_json, score, origin, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'semantic', unixepoch())
                 ON CONFLICT(topic) DO UPDATE SET
                   title=excluded.title,
                   reason=excluded.reason,
                   preview=excluded.preview,
                   suggested_sections_json=excluded.suggested_sections_json,
                   source_paths_json=excluded.source_paths_json,
                   source_titles_json=excluded.source_titles_json,
                   score=excluded.score,
                   origin='semantic',
                   updated_at=unixepoch()",
                params![
                    candidate.topic.trim().to_lowercase(),
                    candidate.title,
                    candidate.reason,
                    candidate.preview,
                    serde_json::to_string(&candidate.suggested_sections).map_err(|error| error.to_string())?,
                    serde_json::to_string(&candidate.source_paths).map_err(|error| error.to_string())?,
                    serde_json::to_string(&candidate.source_titles).map_err(|error| error.to_string())?,
                    candidate.score as i64,
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(not(mobile))]
async fn discover(app: &AppHandle, limit: usize) -> Result<Vec<SemanticWikiCandidate>, String> {
    let root = active_vault_root(app)?;
    let connection = open_connection(&root)?;
    let config = crate::tauri_extra_commands::load_ai_config(app)?;
    let route = embedding_route(&config)?;
    let documents = document_vectors(&connection, &route).await?;
    if documents.len() < 3 {
        return Err("Semantic discovery needs at least three indexed notes with embeddings.".into());
    }
    let clusters = cluster_documents(&documents, route.threshold);
    if clusters.is_empty() {
        return Err("The embedding index did not contain a coherent group of at least three notes.".into());
    }

    let chat_route = config.pointer("/routes/chat").unwrap_or(&Value::Null);
    let source = chat_route
        .get("source")
        .or_else(|| chat_route.get("provider"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let model = chat_route.get("model").and_then(Value::as_str).unwrap_or("");
    if source != "codex" || model.trim().is_empty() {
        return Err("Semantic Wiki discovery currently requires the real Codex Chat route to name and qualify embedding clusters.".into());
    }
    let effort = chat_route
        .get("reasoningEffort")
        .and_then(Value::as_str)
        .unwrap_or("medium");

    let cluster_payload = clusters
        .iter()
        .take(limit.saturating_mul(2).clamp(4, 24))
        .enumerate()
        .map(|(cluster_id, cluster)| {
            let notes = cluster
                .members
                .iter()
                .take(14)
                .map(|index| {
                    let document = &documents[*index];
                    json!({
                        "path": document.path,
                        "title": document.title,
                        "excerpt": document.excerpt.chars().take(260).collect::<String>()
                    })
                })
                .collect::<Vec<_>>();
            json!({
                "cluster_id": cluster_id,
                "size": cluster.members.len(),
                "coherence": cluster.coherence,
                "notes": notes
            })
        })
        .collect::<Vec<_>>();
    let prompt = format!(
        "You are organizing a personal note vault into a small set of useful Wiki topics. The note groups below were produced by real embedding similarity, not keyword matching. Reject noisy groups such as timestamp dumps, generic social-media fragments, duplicates, or clusters without a stable concept. Prefer broad topics that help organize many notes, but keep clearly different subjects separate. Return exactly one JSON object with this shape and no prose:\n{{\"candidates\":[{{\"cluster_id\":0,\"include\":true,\"title\":\"Readable title\",\"topic\":\"normalized topic\",\"reason\":\"Why this group deserves a Wiki\",\"preview\":\"What the Wiki would cover\",\"suggested_sections\":[\"Section\"]}}]}}\n\nEmbedding clusters:\n{}",
        serde_json::to_string_pretty(&cluster_payload).map_err(|error| error.to_string())?
    );
    let result = codex_app_server::chat_with_effort(app, model, &prompt, Some(effort)).await?;
    let envelope: DiscoveryEnvelope = serde_json::from_str(json_object_from_text(&result.answer)?)
        .map_err(|error| format!("Invalid semantic Wiki discovery JSON: {error}"))?;

    let existing_topics = KnowledgeStore::open(&root)?
        .list_wiki_drafts(None, 1_000)?
        .into_iter()
        .map(|draft| draft.topic.trim().to_lowercase())
        .collect::<HashSet<_>>();
    let by_cluster = envelope
        .candidates
        .into_iter()
        .filter(|candidate| candidate.include)
        .map(|candidate| (candidate.cluster_id, candidate))
        .collect::<HashMap<_, _>>();
    let mut candidates = Vec::new();
    for (cluster_id, cluster) in clusters.iter().enumerate() {
        let Some(label) = by_cluster.get(&cluster_id) else {
            continue;
        };
        let topic = label.topic.trim().to_lowercase();
        if topic.is_empty() || label.title.trim().is_empty() || existing_topics.contains(&topic) {
            continue;
        }
        let mut members = cluster.members.clone();
        members.sort_by(|left, right| {
            cosine(&cluster.centroid, &documents[*right].vector)
                .total_cmp(&cosine(&cluster.centroid, &documents[*left].vector))
        });
        let source_paths = members
            .iter()
            .take(24)
            .map(|index| documents[*index].path.clone())
            .collect::<Vec<_>>();
        let source_titles = members
            .iter()
            .take(24)
            .map(|index| documents[*index].title.clone())
            .collect::<Vec<_>>();
        candidates.push(SemanticWikiCandidate {
            topic,
            title: label.title.trim().to_string(),
            reason: label.reason.trim().to_string(),
            preview: label.preview.trim().to_string(),
            suggested_sections: label
                .suggested_sections
                .iter()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .take(8)
                .collect(),
            source_paths,
            source_titles,
            score: ((cluster.coherence * 1_000.0) as usize).saturating_add(cluster.members.len()),
            coherence: cluster.coherence,
        });
    }
    candidates.sort_by(|left, right| right.score.cmp(&left.score));
    candidates.truncate(limit.clamp(1, 24));
    persist_candidates(&connection, &candidates)?;
    eprintln!(
        "[knowledge] wiki:semantic-discovery documents={} clusters={} accepted={} embedding_model={} label_model={}",
        documents.len(),
        clusters.len(),
        candidates.len(),
        route.model,
        model
    );
    Ok(candidates)
}

#[tauri::command]
pub async fn tauri_knowledge_wiki_semantic_discover(
    app: AppHandle,
    limit: Option<usize>,
) -> Result<Vec<SemanticWikiCandidate>, String> {
    #[cfg(mobile)]
    {
        let _ = (app, limit);
        Err("Semantic Wiki discovery is unavailable on mobile in this build.".into())
    }
    #[cfg(not(mobile))]
    {
        discover(&app, limit.unwrap_or(12).clamp(1, 24)).await
    }
}

#[cfg(all(test, not(mobile)))]
mod tests {
    use super::*;

    #[test]
    fn cosine_clustering_groups_related_vectors_and_rejects_singletons() {
        let documents = vec![
            DocumentVector { path: "a".into(), title: "A".into(), excerpt: String::new(), vector: normalize_vector(vec![1.0, 0.0]).unwrap() },
            DocumentVector { path: "b".into(), title: "B".into(), excerpt: String::new(), vector: normalize_vector(vec![0.98, 0.05]).unwrap() },
            DocumentVector { path: "c".into(), title: "C".into(), excerpt: String::new(), vector: normalize_vector(vec![0.95, 0.1]).unwrap() },
            DocumentVector { path: "d".into(), title: "D".into(), excerpt: String::new(), vector: normalize_vector(vec![0.0, 1.0]).unwrap() },
        ];
        let clusters = cluster_documents(&documents, 0.8);
        assert_eq!(clusters.len(), 1);
        assert_eq!(clusters[0].members.len(), 3);
        assert!(clusters[0].coherence > 0.95);
    }

    #[test]
    fn embedding_url_does_not_duplicate_v1() {
        let route = EmbeddingRoute {
            source: "api".into(),
            model: "embed".into(),
            endpoint: "https://example.test/v1".into(),
            api_key: String::new(),
            headers: HashMap::new(),
            threshold: 0.72,
        };
        assert_eq!(embedding_url(&route), "https://example.test/v1/embeddings");
    }
}
''')

# ---------------------------------------------------------------------------
# Register discovery and prewarm Codex at startup.
# ---------------------------------------------------------------------------
path = 'Elephant/backend/tauri/src/lib_min.rs'
text = read(path)
text = replace_once(
    text,
    'pub mod knowledge_wiki_library;\npub mod knowledge_wikis;',
    'pub mod knowledge_wiki_discovery;\npub mod knowledge_wiki_library;\npub mod knowledge_wikis;',
    'lib module registration'
)
text = replace_once(
    text,
    '''            let sync_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let state = sync_handle.state::<sync::IrohSyncState>();
                if let Err(error) = state.runtime(&sync_handle).await {
                    eprintln!("[ElephantNote Sync] Failed to start Iroh runtime: {error}");
                }
            });
            Ok(())''',
    '''            let sync_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let state = sync_handle.state::<sync::IrohSyncState>();
                if let Err(error) = state.runtime(&sync_handle).await {
                    eprintln!("[ElephantNote Sync] Failed to start Iroh runtime: {error}");
                }
            });
            #[cfg(not(mobile))]
            {
                let codex_handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    chat_runtime::prewarm_saved_codex(&codex_handle).await;
                });
            }
            Ok(())''',
    'codex prewarm setup'
)
text = replace_once(
    text,
    '            knowledge_wikis::tauri_knowledge_wiki_reject,\n            knowledge_wiki_library::tauri_knowledge_wiki_library_list,',
    '            knowledge_wikis::tauri_knowledge_wiki_reject,\n            knowledge_wiki_discovery::tauri_knowledge_wiki_semantic_discover,\n            knowledge_wiki_library::tauri_knowledge_wiki_library_list,',
    'discovery command registration'
)
text = replace_once(
    text,
    '            knowledge_wiki_library::tauri_knowledge_wiki_library_list,\n            knowledge_wiki_library::tauri_knowledge_wiki_library_generate,',
    '            knowledge_wiki_library::tauri_knowledge_wiki_library_list,\n            knowledge_wiki_library::tauri_knowledge_wiki_library_add_candidate,\n            knowledge_wiki_library::tauri_knowledge_wiki_library_generate,',
    'manual candidate command registration'
)
write(path, text)

# ---------------------------------------------------------------------------
# AI config must persist critical route changes and be reusable at startup.
# ---------------------------------------------------------------------------
path = 'Elephant/backend/tauri/src/tauri_extra_commands.rs'
text = read(path)
text = replace_once(
    text,
    '''#[tauri::command]
pub fn tauri_ai_config_set(app: AppHandle, config: Value) -> R<Value> {
    let path = provider_config_path(&app)?;
    write_json(path, &config)?;
    Ok(config)
}''',
    '''pub(crate) fn save_ai_config(app: &AppHandle, config: &Value) -> R<()> {
    let path = provider_config_path(app)?;
    write_json(path, config)
}

#[tauri::command]
pub fn tauri_ai_config_set(app: AppHandle, config: Value) -> R<Value> {
    save_ai_config(&app, &config)?;
    Ok(config)
}''',
    'save ai config helper'
)
write(path, text)

# ---------------------------------------------------------------------------
# Extend guarded knowledge actions with Wiki library operations.
# ---------------------------------------------------------------------------
path = 'Elephant/backend/knowledge-core/src/actions.rs'
text = read(path)
text = replace_once(
    text,
    '''    CreateWiki {
        title: String,
        topic: String,
        #[serde(default)]
        source_paths: Vec<String>,
    },
    CreateNote {''',
    '''    CreateWiki {
        title: String,
        topic: String,
        #[serde(default)]
        source_paths: Vec<String>,
    },
    AddWikiSuggestion {
        title: String,
        topic: String,
        #[serde(default)]
        source_paths: Vec<String>,
    },
    RejectWikiSuggestion {
        topic: String,
    },
    DeleteWiki {
        draft_id: String,
    },
    CreateNote {''',
    'wiki action variants'
)
text = replace_once(
    text,
    '''    pub fn requires_approval(&self) -> bool {
        self.mutates_user_content() || matches!(self, Self::CreateWiki { .. })
    }''',
    '''    pub fn requires_approval(&self) -> bool {
        self.mutates_user_content()
            || matches!(
                self,
                Self::CreateWiki { .. }
                    | Self::AddWikiSuggestion { .. }
                    | Self::RejectWikiSuggestion { .. }
                    | Self::DeleteWiki { .. }
            )
    }''',
    'wiki approvals'
)
text = replace_once(
    text,
    '''            Self::CreateWiki {
                title,
                topic,
                source_paths,
            } => {
                if title.trim().is_empty() {
                    errors.push("Wiki title cannot be empty.".into());
                }
                if topic.trim().is_empty() {
                    errors.push("Wiki topic cannot be empty.".into());
                }
                for path in source_paths {
                    validate_note_path(path, &mut errors);
                }
            }
            Self::CreateNote {''',
    '''            Self::CreateWiki {
                title,
                topic,
                source_paths,
            }
            | Self::AddWikiSuggestion {
                title,
                topic,
                source_paths,
            } => {
                if title.trim().is_empty() {
                    errors.push("Wiki title cannot be empty.".into());
                }
                if topic.trim().is_empty() {
                    errors.push("Wiki topic cannot be empty.".into());
                }
                for path in source_paths {
                    validate_note_path(path, &mut errors);
                }
            }
            Self::RejectWikiSuggestion { topic } => {
                if topic.trim().is_empty() {
                    errors.push("Wiki suggestion topic cannot be empty.".into());
                }
            }
            Self::DeleteWiki { draft_id } => {
                if draft_id.trim().is_empty() {
                    errors.push("Wiki draft id cannot be empty.".into());
                }
            }
            Self::CreateNote {''',
    'wiki action validation'
)
write(path, text)

path = 'Elephant/backend/knowledge-core/src/chat_actions.rs'
text = read(path)
text = replace_once(
    text,
    '''    CreateWiki {
        title: String,
        topic: String,
        source_paths: Vec<String>,
    },
    CreateNote {''',
    '''    CreateWiki {
        title: String,
        topic: String,
        source_paths: Vec<String>,
        operation: String,
    },
    WikiDecision {
        topic: String,
        operation: String,
    },
    DeleteWiki {
        draft_id: String,
    },
    CreateNote {''',
    'chat preview variants'
)
text = replace_once(
    text,
    '''        ChatKnowledgeAction::CreateWiki { .. } => {
            return Err("Wiki actions require the cited model-backed Wiki generator.".into());
        }''',
    '''        ChatKnowledgeAction::CreateWiki { .. }
        | ChatKnowledgeAction::AddWikiSuggestion { .. }
        | ChatKnowledgeAction::RejectWikiSuggestion { .. }
        | ChatKnowledgeAction::DeleteWiki { .. } => {
            return Err("Wiki actions are executed by the Tauri Wiki library adapter.".into());
        }''',
    'delegated wiki execution'
)
text = replace_once(
    text,
    '''        ChatKnowledgeAction::CreateWiki {
            title,
            topic,
            source_paths,
        } => Ok(ChatActionPreview::CreateWiki {
            title: title.clone(),
            topic: topic.clone(),
            source_paths: source_paths.clone(),
        }),
        ChatKnowledgeAction::CreateNote {''',
    '''        ChatKnowledgeAction::CreateWiki {
            title,
            topic,
            source_paths,
        } => Ok(ChatActionPreview::CreateWiki {
            title: title.clone(),
            topic: topic.clone(),
            source_paths: source_paths.clone(),
            operation: "generate".into(),
        }),
        ChatKnowledgeAction::AddWikiSuggestion {
            title,
            topic,
            source_paths,
        } => Ok(ChatActionPreview::CreateWiki {
            title: title.clone(),
            topic: topic.clone(),
            source_paths: source_paths.clone(),
            operation: "suggest".into(),
        }),
        ChatKnowledgeAction::RejectWikiSuggestion { topic } => Ok(ChatActionPreview::WikiDecision {
            topic: topic.clone(),
            operation: "reject".into(),
        }),
        ChatKnowledgeAction::DeleteWiki { draft_id } => Ok(ChatActionPreview::DeleteWiki {
            draft_id: draft_id.clone(),
        }),
        ChatKnowledgeAction::CreateNote {''',
    'wiki preview generation'
)
write(path, text)

# Replace Tauri action adapter with an async implementation that delegates Wiki work.
write('Elephant/backend/tauri/src/knowledge_chat_actions.rs', r'''use elephantnote_knowledge_core::{
    execute_approved_chat_action, prepare_chat_action, ChatActionExecution, ChatActionProposal,
    ChatActionStatus, ChatKnowledgeAction, KnowledgeStore,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

fn active_vault_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(PathBuf::from(crate::vault::config::get_active_vault(app)?.path))
}

fn active_store(root: &Path) -> Result<KnowledgeStore, String> {
    KnowledgeStore::open(root)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedChatAction {
    pub proposal: ChatActionProposal,
    pub execution: Option<ChatActionExecution>,
}

#[tauri::command]
pub fn tauri_knowledge_chat_action_prepare(
    app: AppHandle,
    action: ChatKnowledgeAction,
    rationale: Option<String>,
) -> Result<PreparedChatAction, String> {
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    let mut proposal = prepare_chat_action(&root, action, rationale.unwrap_or_default())?;

    if !proposal.action.requires_approval() {
        proposal.status = ChatActionStatus::Approved;
        store.save_chat_action_proposal(&proposal)?;
        let execution = execute_approved_chat_action(&root, &store, &proposal)?;
        store.save_chat_action_proposal(&execution.proposal)?;
        return Ok(PreparedChatAction {
            proposal: execution.proposal.clone(),
            execution: Some(execution),
        });
    }

    store.save_chat_action_proposal(&proposal)?;
    Ok(PreparedChatAction {
        proposal,
        execution: None,
    })
}

#[tauri::command]
pub fn tauri_knowledge_chat_action_get(
    app: AppHandle,
    proposal_id: String,
) -> Result<Option<ChatActionProposal>, String> {
    let root = active_vault_root(&app)?;
    active_store(&root)?.chat_action_proposal(&proposal_id)
}

#[tauri::command]
pub fn tauri_knowledge_chat_actions_list(
    app: AppHandle,
    status: Option<ChatActionStatus>,
    limit: Option<usize>,
) -> Result<Vec<ChatActionProposal>, String> {
    let root = active_vault_root(&app)?;
    active_store(&root)?.list_chat_action_proposals(status, limit.unwrap_or(100))
}

#[tauri::command]
pub fn tauri_knowledge_chat_action_approve(
    app: AppHandle,
    proposal_id: String,
) -> Result<ChatActionProposal, String> {
    let root = active_vault_root(&app)?;
    active_store(&root)?.transition_chat_action(&proposal_id, ChatActionStatus::Approved)
}

#[tauri::command]
pub fn tauri_knowledge_chat_action_reject(
    app: AppHandle,
    proposal_id: String,
) -> Result<ChatActionProposal, String> {
    let root = active_vault_root(&app)?;
    active_store(&root)?.transition_chat_action(&proposal_id, ChatActionStatus::Rejected)
}

fn completed_execution(
    store: &KnowledgeStore,
    mut proposal: ChatActionProposal,
    result: Value,
) -> Result<ChatActionExecution, String> {
    proposal.status = ChatActionStatus::Executed;
    proposal.result = Some(result.clone());
    proposal.error = None;
    proposal.updated_at = unix_timestamp();
    store.save_chat_action_proposal(&proposal)?;
    Ok(ChatActionExecution { proposal, result })
}

async fn execute_wiki_action(
    app: AppHandle,
    store: &KnowledgeStore,
    proposal: ChatActionProposal,
) -> Result<ChatActionExecution, String> {
    if !matches!(proposal.status, ChatActionStatus::Approved) {
        return Err("Chat action must be explicitly approved before execution.".into());
    }
    let result = match &proposal.action {
        ChatKnowledgeAction::CreateWiki {
            title,
            topic,
            source_paths,
        } => {
            let config = crate::tauri_extra_commands::load_ai_config(&app)?;
            let item = crate::knowledge_wiki_library::tauri_knowledge_wiki_library_generate(
                app,
                topic.clone(),
                Some(title.clone()),
                source_paths.clone(),
                json!({ "aiConfig": config }),
            )
            .await?;
            serde_json::to_value(item).map_err(|error| error.to_string())?
        }
        ChatKnowledgeAction::AddWikiSuggestion {
            title,
            topic,
            source_paths,
        } => {
            let item = crate::knowledge_wiki_library::tauri_knowledge_wiki_library_add_candidate(
                app,
                topic.clone(),
                Some(title.clone()),
                Some(source_paths.clone()),
            )?;
            serde_json::to_value(item).map_err(|error| error.to_string())?
        }
        ChatKnowledgeAction::RejectWikiSuggestion { topic } => {
            crate::knowledge_wiki_library::tauri_knowledge_wiki_library_reject(app, topic.clone())?;
            json!({ "operation": "reject_wiki_suggestion", "topic": topic })
        }
        ChatKnowledgeAction::DeleteWiki { draft_id } => {
            let draft_id = draft_id.strip_prefix("wiki:").unwrap_or(draft_id).to_string();
            crate::knowledge_wiki_library::tauri_knowledge_wiki_library_delete(
                app,
                draft_id.clone(),
                Some(true),
            )?;
            json!({ "operation": "delete_wiki", "draftId": draft_id })
        }
        _ => return Err("Not a Wiki action.".into()),
    };
    completed_execution(store, proposal, result)
}

#[tauri::command]
pub async fn tauri_knowledge_chat_action_execute(
    app: AppHandle,
    proposal_id: String,
) -> Result<ChatActionExecution, String> {
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    let proposal = store
        .chat_action_proposal(&proposal_id)?
        .ok_or_else(|| format!("Unknown chat action proposal: {proposal_id}"))?;

    let is_wiki = matches!(
        proposal.action,
        ChatKnowledgeAction::CreateWiki { .. }
            | ChatKnowledgeAction::AddWikiSuggestion { .. }
            | ChatKnowledgeAction::RejectWikiSuggestion { .. }
            | ChatKnowledgeAction::DeleteWiki { .. }
    );
    let result = if is_wiki {
        execute_wiki_action(app, &store, proposal.clone()).await
    } else {
        execute_approved_chat_action(&root, &store, &proposal)
            .and_then(|execution| {
                store.save_chat_action_proposal(&execution.proposal)?;
                Ok(execution)
            })
    };

    match result {
        Ok(execution) => Ok(execution),
        Err(error) => {
            let mut failed = proposal;
            failed.status = ChatActionStatus::Failed;
            failed.error = Some(error.clone());
            failed.updated_at = unix_timestamp();
            store.save_chat_action_proposal(&failed)?;
            Err(error)
        }
    }
}

fn unix_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}
''')

# ---------------------------------------------------------------------------
# Wiki library: persistent semantic/manual candidates, clean excerpts, manual add.
# ---------------------------------------------------------------------------
path = 'Elephant/backend/tauri/src/knowledge_wiki_library.rs'
text = read(path)
text = replace_once(
    text,
    '''CREATE INDEX IF NOT EXISTS wiki_candidate_decisions_decision_idx
  ON wiki_candidate_decisions(decision, updated_at DESC);
"#;''',
    '''CREATE INDEX IF NOT EXISTS wiki_candidate_decisions_decision_idx
  ON wiki_candidate_decisions(decision, updated_at DESC);
CREATE TABLE IF NOT EXISTS wiki_saved_candidates (
  topic TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  preview TEXT NOT NULL,
  suggested_sections_json TEXT NOT NULL,
  source_paths_json TEXT NOT NULL,
  source_titles_json TEXT NOT NULL,
  score INTEGER NOT NULL,
  origin TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
"#;''',
    'saved candidate schema'
)
old_plain = '''fn plain_excerpt(markdown: &str) -> String {
    let mut output = String::new();
    for line in markdown.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("<!--") {
            continue;
        }
        for character in trimmed.chars() {
            if matches!(character, '*' | '_' | '`' | '[' | ']' | '>' | '|') {
                continue;
            }
            output.push(character);
            if output.chars().count() >= 220 {
                return format!("{}…", output.trim());
            }
        }
        output.push(' ');
    }
    output.trim().to_string()
}'''
new_plain = '''fn plain_excerpt(markdown: &str) -> String {
    let mut output = String::new();
    let mut frontmatter = false;
    let mut first_nonempty = true;
    for line in markdown.lines() {
        let trimmed = line.trim();
        if first_nonempty && trimmed.is_empty() {
            continue;
        }
        if first_nonempty {
            first_nonempty = false;
            if trimmed == "---" {
                frontmatter = true;
                continue;
            }
        }
        if frontmatter {
            if trimmed == "---" {
                frontmatter = false;
            }
            continue;
        }
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("<!--") {
            continue;
        }
        for character in trimmed.chars() {
            if matches!(character, '*' | '_' | '`' | '[' | ']' | '>' | '|') {
                continue;
            }
            output.push(character);
            if output.chars().count() >= 220 {
                return format!("{}…", output.trim());
            }
        }
        output.push(' ');
    }
    output.trim().to_string()
}'''
text = replace_once(text, old_plain, new_plain, 'frontmatter excerpt')
insert_after = '''fn candidate_item(candidate: WikiCandidate) -> WikiLibraryItem {
    WikiLibraryItem {
        id: candidate_id(&candidate.topic),
        kind: "suggestion".into(),
        status: "suggested".into(),
        title: candidate.title,
        topic: candidate.topic,
        excerpt: candidate.preview.clone(),
        reason: candidate.reason,
        preview: candidate.preview,
        suggested_sections: candidate.suggested_sections,
        source_titles: candidate.source_titles,
        path: None,
        source_paths: candidate.source_paths,
        score: candidate.score,
        model_id: String::new(),
        markdown: String::new(),
        draft_id: None,
        citations_count: 0,
        updated_at: 0,
    }
}
'''
extra = insert_after + r'''
fn saved_candidate_items(store: &KnowledgeStore) -> Result<Vec<WikiLibraryItem>, String> {
    let connection = open_library_connection(store)?;
    let mut statement = connection
        .prepare(
            "SELECT topic, title, reason, preview, suggested_sections_json,
                    source_paths_json, source_titles_json, score, origin, updated_at
             FROM wiki_saved_candidates ORDER BY score DESC, updated_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            let topic = row.get::<_, String>(0)?;
            let title = row.get::<_, String>(1)?;
            let reason = row.get::<_, String>(2)?;
            let preview = row.get::<_, String>(3)?;
            let sections = serde_json::from_str::<Vec<String>>(&row.get::<_, String>(4)?)
                .unwrap_or_default();
            let paths = serde_json::from_str::<Vec<String>>(&row.get::<_, String>(5)?)
                .unwrap_or_default();
            let titles = serde_json::from_str::<Vec<String>>(&row.get::<_, String>(6)?)
                .unwrap_or_default();
            let score = row.get::<_, i64>(7)?.max(0) as usize;
            let origin = row.get::<_, String>(8)?;
            let updated_at = row.get::<_, i64>(9)?;
            Ok(WikiLibraryItem {
                id: candidate_id(&topic),
                kind: "suggestion".into(),
                status: origin,
                title,
                topic,
                excerpt: preview.clone(),
                reason,
                preview,
                suggested_sections: sections,
                source_titles: titles,
                path: None,
                source_paths: paths,
                score,
                model_id: String::new(),
                markdown: String::new(),
                draft_id: None,
                citations_count: 0,
                updated_at,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn persist_saved_candidate(
    store: &KnowledgeStore,
    item: &WikiLibraryItem,
    origin: &str,
) -> Result<(), String> {
    let connection = open_library_connection(store)?;
    connection
        .execute(
            "INSERT INTO wiki_saved_candidates(topic, title, reason, preview, suggested_sections_json,
                                                source_paths_json, source_titles_json, score, origin, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, unixepoch())
             ON CONFLICT(topic) DO UPDATE SET
               title=excluded.title,
               reason=excluded.reason,
               preview=excluded.preview,
               suggested_sections_json=excluded.suggested_sections_json,
               source_paths_json=excluded.source_paths_json,
               source_titles_json=excluded.source_titles_json,
               score=excluded.score,
               origin=excluded.origin,
               updated_at=unixepoch()",
            params![
                normalize_topic(&item.topic),
                item.title,
                item.reason,
                item.preview,
                serde_json::to_string(&item.suggested_sections).map_err(|error| error.to_string())?,
                serde_json::to_string(&item.source_paths).map_err(|error| error.to_string())?,
                serde_json::to_string(&item.source_titles).map_err(|error| error.to_string())?,
                item.score as i64,
                origin,
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}
'''
text = replace_once(text, insert_after, extra, 'saved candidate helpers')
text = replace_once(
    text,
    '''    let mut suggestions = tauri_knowledge_wiki_candidates(app, Some(limit))?
        .into_iter()
        .filter(|candidate| !rejected.contains(&normalize_topic(&candidate.topic)))
        .map(candidate_item)
        .collect::<Vec<_>>();
    suggestions.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then(left.title.cmp(&right.title))
    });

    let mut wikis = store''',
    '''    let mut suggestions = saved_candidate_items(&store)?
        .into_iter()
        .filter(|candidate| !rejected.contains(&normalize_topic(&candidate.topic)))
        .collect::<Vec<_>>();
    let mut seen_topics = suggestions
        .iter()
        .map(|candidate| normalize_topic(&candidate.topic))
        .collect::<HashSet<_>>();
    suggestions.extend(
        tauri_knowledge_wiki_candidates(app, Some(limit))?
            .into_iter()
            .filter(|candidate| !rejected.contains(&normalize_topic(&candidate.topic)))
            .filter(|candidate| seen_topics.insert(normalize_topic(&candidate.topic)))
            .map(candidate_item),
    );
    suggestions.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then(left.title.cmp(&right.title))
    });

    let mut wikis = store''',
    'merge persisted candidates'
)
manual_command = r'''
#[tauri::command]
pub fn tauri_knowledge_wiki_library_add_candidate(
    app: AppHandle,
    topic: String,
    title: Option<String>,
    source_paths: Option<Vec<String>>,
) -> Result<WikiLibraryItem, String> {
    let topic = topic.trim().to_string();
    if topic.is_empty() {
        return Err("Wiki suggestion topic cannot be empty.".into());
    }
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    clear_candidate_decision(&store, &topic)?;
    let mut paths = source_paths.unwrap_or_default();
    if paths.is_empty() {
        paths = store
            .search(&topic, 32)?
            .into_iter()
            .map(|hit| hit.relative_path)
            .collect::<Vec<_>>();
    }
    paths.sort();
    paths.dedup();
    paths.truncate(24);
    let source_titles = paths
        .iter()
        .map(|path| {
            Path::new(path)
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or(path)
                .to_string()
        })
        .collect::<Vec<_>>();
    let title = title
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            let mut characters = topic.chars();
            characters
                .next()
                .map(|first| first.to_uppercase().collect::<String>() + characters.as_str())
                .unwrap_or_else(|| "Wiki".into())
        });
    let preview = if paths.is_empty() {
        format!("Sujet ajouté manuellement. ElephantNote recherchera les sources pertinentes lors de la génération de « {title} ».")
    } else {
        format!("Sujet ajouté manuellement avec {} note(s) déjà retrouvée(s).", paths.len())
    };
    let item = WikiLibraryItem {
        id: candidate_id(&topic),
        kind: "suggestion".into(),
        status: "manual".into(),
        title,
        topic,
        excerpt: preview.clone(),
        reason: "Proposition ajoutée explicitement par l’utilisateur.".into(),
        preview,
        suggested_sections: vec!["Vue d’ensemble".into(), "Concepts et références".into()],
        source_titles,
        path: None,
        source_paths: paths,
        score: 100_000,
        model_id: String::new(),
        markdown: String::new(),
        draft_id: None,
        citations_count: 0,
        updated_at: unix_timestamp(),
    };
    persist_saved_candidate(&store, &item, "manual")?;
    eprintln!(
        "[knowledge] wiki-library:manual-candidate topic={} sources={}",
        item.topic,
        item.source_paths.len()
    );
    Ok(item)
}

'''
text = replace_once(
    text,
    '#[tauri::command]\npub async fn tauri_knowledge_wiki_library_generate(',
    manual_command + '#[tauri::command]\npub async fn tauri_knowledge_wiki_library_generate(',
    'manual candidate command'
)
# Add timestamp helper outside tests if absent.
text = replace_once(
    text,
    '\n#[cfg(test)]\nmod tests {',
    '''
fn unix_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {''',
    'library timestamp helper'
)
write(path, text)

# ---------------------------------------------------------------------------
# Contextual citation labels rather than numeric links.
# ---------------------------------------------------------------------------
path = 'Elephant/backend/knowledge-core/src/wiki_core.rs'
text = read(path)
text = replace_once(
    text,
    '''        for (chunk_id, number) in numbered {
            let source = source_by_id
                .get(chunk_id.as_str())
                .ok_or_else(|| format!("Missing source chunk while rendering: {chunk_id}"))?;
            let key = format!("source-{number}");
            markdown.push_str(&format!(
                "{}. [{} — {}]({})
",
                number,
                source.document_title,
                source.heading,
                markdown_note_target(source)
            ));''',
    '''        for (chunk_id, number) in numbered {
            let source = source_by_id
                .get(chunk_id.as_str())
                .ok_or_else(|| format!("Missing source chunk while rendering: {chunk_id}"))?;
            let key = format!("source-{number}");
            markdown.push_str(&format!(
                "- [{} — {}]({})
",
                source.document_title,
                source.heading,
                markdown_note_target(source)
            ));''',
    'source list labels'
)
text = replace_once(
    text,
    '''fn render_claims(
    markdown: &mut String,
    claims: &[WikiClaim],''',
    '''fn citation_label(source: &WikiSourceChunk) -> String {
    let heading = source.heading.trim();
    let title = source.document_title.trim();
    let value = if !heading.is_empty() && !heading.eq_ignore_ascii_case(title) {
        heading
    } else if !title.is_empty() {
        title
    } else {
        "Source"
    };
    value.chars().take(72).collect()
}

fn render_claims(
    markdown: &mut String,
    claims: &[WikiClaim],''',
    'citation label helper'
)
text = replace_once(
    text,
    '            references.push(format!("[{number}]({})", markdown_note_target(source)));',
    '            references.push(format!("[{}]({})", citation_label(source), markdown_note_target(source)));',
    'contextual inline citation'
)
write(path, text)

# Migrate existing numeric links to contextual labels and clean source list.
path = 'Elephant/backend/tauri/src/knowledge_wiki_library.rs'
text = read(path)
text = replace_once(
    text,
    '''fn citation_number(citation: &WikiCitation, fallback: usize) -> usize {
    citation
        .key
        .strip_prefix("source-")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(fallback)
}
''',
    '''fn citation_number(citation: &WikiCitation, fallback: usize) -> usize {
    citation
        .key
        .strip_prefix("source-")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(fallback)
}

fn citation_display_label(citation: &WikiCitation) -> String {
    let heading = citation.heading.trim();
    let title = citation.document_title.trim();
    let value = if !heading.is_empty() && !heading.eq_ignore_ascii_case(title) {
        heading
    } else if !title.is_empty() {
        title
    } else {
        "Source"
    };
    value.chars().take(72).collect()
}
''',
    'migration citation label helper'
)
text = replace_once(
    text,
    '''    if !has_legacy_citation && !has_legacy_related {
        return None;
    }''',
    '''    let has_numeric_citation = draft.citations.iter().enumerate().any(|(index, citation)| {
        let number = citation_number(citation, index + 1);
        markdown.contains(&format!("[{number}]({})", markdown_note_target(citation)))
    });
    if !has_legacy_citation && !has_legacy_related && !has_numeric_citation {
        return None;
    }''',
    'detect numeric migration'
)
text = replace_once(
    text,
    '''        body = body.replace(
            &format!("[^{}]", citation.key),
            &format!("[{number}]({})", markdown_note_target(citation)),
        );''',
    '''        let target = markdown_note_target(citation);
        let label = citation_display_label(citation);
        body = body.replace(
            &format!("[^{}]", citation.key),
            &format!("[{label}]({target})"),
        );
        body = body.replace(
            &format!("[{number}]({target})"),
            &format!("[{label}]({target})"),
        );''',
    'replace legacy and numeric citations'
)
text = replace_once(
    text,
    '''        body.push_str(&format!(
            "{number}. [{} — {}]({})\n",
            citation.document_title,
            citation.heading,
            markdown_note_target(citation)
        ));''',
    '''        body.push_str(&format!(
            "- [{} — {}]({})\n",
            citation.document_title,
            citation.heading,
            markdown_note_target(citation)
        ));''',
    'clean migrated source list'
)
write(path, text)

# ---------------------------------------------------------------------------
# Chat runtime: truthful real tool proposals, saved Codex promotion/prewarm.
# ---------------------------------------------------------------------------
path = 'Elephant/backend/tauri/src/chat_runtime.rs'
text = read(path)
text = replace_once(
    text,
    'use elephantnote_knowledge_core::{KnowledgeSearchHit, KnowledgeStore};',
    'use elephantnote_knowledge_core::{ChatKnowledgeAction, KnowledgeSearchHit, KnowledgeStore};',
    'chat action import'
)
text = replace_once(
    text,
    '''fn with_saved_ai_config(app: &AppHandle, payload: Value) -> Value {
    let mut payload = if payload.is_object() {
        payload
    } else {
        json!({ "message": payload })
    };
    if ai_config(&payload).pointer("/routes/chat").is_none() {
        if let Ok(config) = crate::tauri_extra_commands::load_ai_config(app) {
            if let Some(object) = payload.as_object_mut() {
                object.insert("aiConfig".into(), config);
            }
        }
    }
    payload
}''',
    r'''fn promote_saved_codex_route(config: &mut Value) -> bool {
    let codex_model = config
        .pointer("/providers/codex/model")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("")
        .to_string();
    if codex_model.is_empty() {
        return false;
    }
    let route = config.pointer("/routes/chat").unwrap_or(&Value::Null);
    let source = text(route, &["source", "provider"]);
    let model = text(route, &["model"]);
    let stale_default = source.is_empty()
        || source == "disabled"
        || (source == "app-local" && (model.is_empty() || model == "smollm2-node-llama-cpp"));
    if !stale_default {
        return false;
    }
    let Some(root) = config.as_object_mut() else {
        return false;
    };
    let routes = root.entry("routes").or_insert_with(|| json!({}));
    let Some(routes) = routes.as_object_mut() else {
        return false;
    };
    let chat = routes.entry("chat").or_insert_with(|| json!({}));
    let Some(chat) = chat.as_object_mut() else {
        return false;
    };
    chat.insert("source".into(), json!("codex"));
    chat.insert("provider".into(), json!("codex"));
    chat.insert("transport".into(), json!("codex"));
    chat.insert("endpoint".into(), json!("codex://app-server"));
    chat.insert("model".into(), json!(codex_model));
    chat.entry("reasoningEffort").or_insert_with(|| json!("medium"));
    chat.entry("enableTools").or_insert_with(|| json!(true));
    true
}

fn with_saved_ai_config(app: &AppHandle, payload: Value) -> Value {
    let mut payload = if payload.is_object() {
        payload
    } else {
        json!({ "message": payload })
    };
    if ai_config(&payload).pointer("/routes/chat").is_none() {
        if let Ok(mut config) = crate::tauri_extra_commands::load_ai_config(app) {
            let promoted = promote_saved_codex_route(&mut config);
            if promoted {
                let _ = crate::tauri_extra_commands::save_ai_config(app, &config);
                eprintln!("[Codex][config] promoted saved Codex model to the active Chat route");
            }
            if let Some(object) = payload.as_object_mut() {
                object.insert("aiConfig".into(), config);
            }
        }
    }
    payload
}

#[cfg(not(mobile))]
pub async fn prewarm_saved_codex(app: &AppHandle) {
    let Ok(mut config) = crate::tauri_extra_commands::load_ai_config(app) else {
        return;
    };
    let promoted = promote_saved_codex_route(&mut config);
    let source = config
        .pointer("/routes/chat/source")
        .and_then(Value::as_str)
        .unwrap_or("");
    if source != "codex" {
        return;
    }
    if promoted {
        let _ = crate::tauri_extra_commands::save_ai_config(app, &config);
    }
    match codex_app_server::command(app, &json!({ "codexOperation": "status" })).await {
        Ok(status) => eprintln!(
            "[Codex][startup] prewarm connected={} promoted={}",
            status.get("connected").and_then(Value::as_bool).unwrap_or(false),
            promoted
        ),
        Err(error) => eprintln!("[Codex][startup] prewarm failed: {error}"),
    }
}''',
    'saved codex promotion'
)
text = replace_once(
    text,
    '''#[cfg(not(mobile))]
fn configured_system_prompt(payload: &Value) -> String {''',
    '''#[cfg(not(mobile))]
fn tools_enabled(payload: &Value) -> bool {
    ai_config(payload)
        .pointer("/routes/chat/enableTools")
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

#[cfg(not(mobile))]
fn configured_system_prompt(payload: &Value) -> String {''',
    'tools enabled helper'
)
# Insert action parsing helpers before local runtime config.
marker = '''#[cfg(not(mobile))]
fn local_runtime_config(payload: &Value) -> &Value {'''
helpers = r'''#[cfg(not(mobile))]
fn tool_contract() -> &'static str {
    r#"You have real ElephantNote tools. Never claim that you cannot search notes, create a note, update a note, add/reject a Wiki suggestion, generate a Wiki, or delete a Wiki. Read-only note context is already supplied when relevant. When the user explicitly requests an action, append exactly one machine-readable block after the human answer:
<elephantnote_actions>[{"action":"search_notes","query":"...","limit":10}]</elephantnote_actions>
Supported action names and fields:
- search_notes: query, limit
- create_note: relative_path, title, content
- append_to_note: relative_path, content (omit expected_hash; ElephantNote adds the current hash)
- replace_note: relative_path, content (omit expected_hash)
- replace_note_range: relative_path, start_offset, end_offset, replacement (omit expected_hash)
- add_wiki_suggestion: title, topic, source_paths
- create_wiki: title, topic, source_paths
- reject_wiki_suggestion: topic
- delete_wiki: draft_id
Do not invent successful execution. Mutating actions are shown to the user for approval and only execute after approval. Do not put the action block in Markdown fences."#
}

#[cfg(not(mobile))]
fn action_block(answer: &str) -> (String, Vec<Value>) {
    const START: &str = "<elephantnote_actions>";
    const END: &str = "</elephantnote_actions>";
    let Some(start) = answer.find(START) else {
        return (answer.trim().to_string(), Vec::new());
    };
    let body_start = start + START.len();
    let Some(relative_end) = answer[body_start..].find(END) else {
        return (answer.trim().to_string(), Vec::new());
    };
    let end = body_start + relative_end;
    let actions = serde_json::from_str::<Value>(answer[body_start..end].trim())
        .ok()
        .and_then(|value| match value {
            Value::Array(values) => Some(values),
            Value::Object(_) => Some(vec![value]),
            _ => None,
        })
        .unwrap_or_default();
    let mut visible = String::new();
    visible.push_str(answer[..start].trim_end());
    visible.push_str(answer[end + END.len()..].trim_start());
    (visible.trim().to_string(), actions)
}

#[cfg(not(mobile))]
fn enrich_write_guard(app: &AppHandle, value: &mut Value) -> R<()> {
    let action = value.get("action").and_then(Value::as_str).unwrap_or("");
    if !matches!(action, "append_to_note" | "replace_note" | "replace_note_range") {
        return Ok(());
    }
    if value.get("expected_hash").and_then(Value::as_str).is_some_and(|value| !value.trim().is_empty()) {
        return Ok(());
    }
    let path = value
        .get("relative_path")
        .and_then(Value::as_str)
        .ok_or_else(|| "A note action is missing relative_path.".to_string())?;
    let root = Path::new(&crate::vault::config::get_active_vault(app)?.path).to_path_buf();
    let store = KnowledgeStore::open(&root)?;
    let hash = store
        .existing_hash(path)?
        .ok_or_else(|| format!("Cannot prepare note action because the note is not indexed: {path}"))?;
    value
        .as_object_mut()
        .ok_or_else(|| "Action payload must be an object.".to_string())?
        .insert("expected_hash".into(), json!(hash));
    Ok(())
}

#[cfg(not(mobile))]
fn prepare_assistant_actions(app: &AppHandle, actions: Vec<Value>) -> (Vec<Value>, Vec<String>) {
    let mut prepared = Vec::new();
    let mut errors = Vec::new();
    for mut value in actions.into_iter().take(8) {
        let rationale = value
            .get("rationale")
            .and_then(Value::as_str)
            .map(str::to_string);
        if let Some(object) = value.as_object_mut() {
            object.remove("rationale");
        }
        if let Err(error) = enrich_write_guard(app, &mut value) {
            errors.push(error);
            continue;
        }
        let action = match serde_json::from_value::<ChatKnowledgeAction>(value) {
            Ok(action) => action,
            Err(error) => {
                errors.push(format!("Invalid ElephantNote action: {error}"));
                continue;
            }
        };
        match crate::knowledge_chat_actions::tauri_knowledge_chat_action_prepare(
            app.clone(),
            action,
            rationale,
        ) {
            Ok(result) => match serde_json::to_value(result) {
                Ok(value) => prepared.push(value),
                Err(error) => errors.push(error.to_string()),
            },
            Err(error) => errors.push(error),
        }
    }
    (prepared, errors)
}

'''
text = replace_once(text, marker, helpers + marker, 'assistant action helpers')
text = replace_once(
    text,
    '''    let system = if custom.is_empty() {
        format!("Tu es l’assistant ElephantNote. Réponds en français par défaut. {access_contract}")
    } else {
        format!(
            "{custom}

Capacités ElephantNote : {access_contract}"
        )
    };''',
    '''    let tools = if tools_enabled(payload) {
        format!("\n\n{}", tool_contract())
    } else {
        String::new()
    };
    let system = if custom.is_empty() {
        format!("Tu es l’assistant ElephantNote. Réponds en français par défaut. {access_contract}{tools}")
    } else {
        format!(
            "{custom}\n\nCapacités ElephantNote : {access_contract}{tools}"
        )
    };''',
    'tool-aware system prompt'
)
text = replace_once(
    text,
    '''        let result =
            codex_app_server::chat_with_effort(&app, &model, &prompt, reasoning_effort.as_deref())
                .await?;
        let citations = citations_from_hits(&hits);
        return Ok(json!({
            "answer": result.answer,
            "sources": hits,
            "citations": citations,
            "runtime": "codex-app-server",
            "provider": "codex",
            "model": result.model,
            "reasoningEffort": reasoning_effort,
            "threadId": result.thread_id
        }));''',
    '''        let result =
            codex_app_server::chat_with_effort(&app, &model, &prompt, reasoning_effort.as_deref())
                .await?;
        let (answer, raw_actions) = if tools_enabled(&payload) {
            action_block(&result.answer)
        } else {
            (result.answer.clone(), Vec::new())
        };
        let (actions, action_errors) = prepare_assistant_actions(&app, raw_actions);
        let citations = citations_from_hits(&hits);
        return Ok(json!({
            "answer": answer,
            "sources": hits,
            "citations": citations,
            "actions": actions,
            "actionErrors": action_errors,
            "runtime": "codex-app-server",
            "provider": "codex",
            "model": result.model,
            "reasoningEffort": reasoning_effort,
            "threadId": result.thread_id
        }));''',
    'Codex action response'
)
write(path, text)

# ---------------------------------------------------------------------------
# AI settings: enable tools by default and save route/model changes immediately.
# ---------------------------------------------------------------------------
path = 'Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue'
text = read(path)
text = text.replace('      enableTools: false,', '      enableTools: true,', 1)
text = replace_once(
    text,
    '@change="onCodexModelChanged"',
    '@change="onCodexModelChanged"',
    'codex model change marker'
)
text = replace_once(
    text,
    '<select v-model="form.routes.chat.reasoningEffort">',
    '<select v-model="form.routes.chat.reasoningEffort" @change="saveConfig({ silent: true, reason: \'codex-reasoning\' })">',
    'reasoning immediate save'
)
text = replace_once(
    text,
    '''const onCodexModelChanged = () => {
  applyCodexReasoningDefault()
  scheduleAutosave('codex-model')
}''',
    '''const onCodexModelChanged = async() => {
  applyCodexReasoningDefault()
  await saveConfig({ silent: true, reason: 'codex-model' })
}''',
    'model immediate save'
)
text = replace_once(
    text,
    '''const onChatSourceChanged = () => {
  if (form.value.routes.chat.source === 'codex') {''',
    '''const onChatSourceChanged = async() => {
  if (form.value.routes.chat.source === 'codex') {''',
    'source async save start'
)
text = replace_once(
    text,
    '''  }
  scheduleAutosave('chat-source')
}
const toggleLocalAi''',
    '''  }
  await saveConfig({ silent: true, reason: 'chat-source' })
}
const toggleLocalAi''',
    'source immediate save end'
)
write(path, text)

# ---------------------------------------------------------------------------
# Wiki view: manual topic entry and real semantic discovery action.
# ---------------------------------------------------------------------------
path = 'Elephant/frontend/app/components/views/WikiView.vue'
text = read(path)
text = replace_once(
    text,
    '''      <div class="en-wiki-toolbar-actions">
        <button
          class="en-toolbar-button"
          type="button"
          :disabled="loading"
          @click="analyseNotes"
        >''',
    '''      <div class="en-wiki-toolbar-actions">
        <div class="en-wiki-topic-entry">
          <input
            v-model.trim="manualTopic"
            type="text"
            placeholder="Ajouter un sujet de Wiki…"
            @keydown.enter.prevent="addManualTopic"
          >
          <button type="button" :disabled="!manualTopic || loading" @click="addManualTopic">
            <Plus class="en-icon" /> Ajouter
          </button>
        </div>
        <button
          class="en-toolbar-button"
          type="button"
          :disabled="loading || discovering"
          @click="discoverWithAi"
        >
          <Sparkles class="en-icon" />
          {{ discovering ? 'Analyse sémantique…' : 'Proposer avec l’IA' }}
        </button>
        <button
          class="en-toolbar-button"
          type="button"
          :disabled="loading"
          @click="analyseNotes"
        >''',
    'wiki manual semantic toolbar'
)
text = replace_once(
    text,
    '  LoaderCircle,\n  MoreHorizontal,',
    '  LoaderCircle,\n  MoreHorizontal,\n  Plus,',
    'plus icon import'
)
text = replace_once(
    text,
    '''const globalError = ref('')
const selectedSuggestionId = ref('')''',
    '''const globalError = ref('')
const manualTopic = ref('')
const discovering = ref(false)
const selectedSuggestionId = ref('')''',
    'wiki topic refs'
)
text = replace_once(
    text,
    '''const normalizeError = (error) => error?.message || String(error || 'Erreur inconnue')''',
    '''const normalizeError = (error) => error?.message || String(error || 'Erreur inconnue')
const invoke = (command, payload = {}) => {
  const fn = globalThis.window?.__TAURI__?.core?.invoke
  if (typeof fn !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
  return fn(command, payload)
}''',
    'wiki invoke helper'
)
insert = r'''
const addManualTopic = async() => {
  const topic = manualTopic.value.trim()
  if (!topic || loading.value) return
  loading.value = true
  globalError.value = ''
  try {
    await invoke('tauri_knowledge_wiki_library_add_candidate', { topic, title: null, sourcePaths: null })
    manualTopic.value = ''
    await loadLibrary()
    await refreshKnowledgeViews('wiki-manual-candidate')
  } catch (error) {
    globalError.value = normalizeError(error)
  } finally {
    loading.value = false
  }
}

const discoverWithAi = async() => {
  if (discovering.value || loading.value) return
  discovering.value = true
  globalError.value = ''
  try {
    await invoke('tauri_knowledge_wiki_semantic_discover', { limit: 12 })
    await loadLibrary()
    await refreshKnowledgeViews('wiki-semantic-discovery')
  } catch (error) {
    globalError.value = normalizeError(error)
  } finally {
    discovering.value = false
  }
}

'''
text = replace_once(text, 'const analyseNotes = async() => {', insert + 'const analyseNotes = async() => {', 'wiki actions')
# Append toolbar CSS before media query.
text = replace_once(
    text,
    '@media (max-width: 900px) {',
    '''.en-wiki-topic-entry { display: flex; align-items: center; gap: 8px; min-width: min(360px, 34vw); }
.en-wiki-topic-entry input { min-width: 0; flex: 1; height: 40px; padding: 0 12px; border: 1px solid var(--en-border); border-radius: 10px; background: var(--en-surface); color: var(--en-text); }
.en-wiki-topic-entry button { height: 40px; display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; border: 1px solid var(--en-border); border-radius: 10px; background: var(--en-soft); color: var(--en-text); }

@media (max-width: 900px) {''',
    'wiki topic CSS'
)
write(path, text)

# ---------------------------------------------------------------------------
# Chat UI: show real pending actions with approval/rejection controls.
# ---------------------------------------------------------------------------
path = 'Elephant/frontend/app/components/views/ChatView.vue'
text = read(path)
text = replace_once(
    text,
    '''            <div v-if="message.citations?.length" class="en-chat-citations">''',
    '''            <section v-if="message.actions?.length" class="en-chat-actions">
              <article v-for="action in message.actions" :key="action.proposal?.id" class="en-chat-action-card">
                <div class="en-chat-action-copy">
                  <strong>{{ actionLabel(action) }}</strong>
                  <span>{{ actionSummary(action) }}</span>
                  <small v-if="action.error">{{ action.error }}</small>
                </div>
                <div class="en-chat-action-controls">
                  <span class="en-chat-action-status">{{ action.proposal?.status || 'proposed' }}</span>
                  <template v-if="action.proposal?.status === 'proposed'">
                    <button type="button" :disabled="action.busy" @click="approveAction(message, action)">Approuver</button>
                    <button type="button" :disabled="action.busy" @click="rejectAction(message, action)">Refuser</button>
                  </template>
                </div>
              </article>
            </section>

            <div v-if="message.citations?.length" class="en-chat-citations">''',
    'chat action cards template'
)
text = replace_once(
    text,
    '''const openNote = (value, fallbackTitle = '') => {''',
    r'''const invoke = (command, payload = {}) => {
  const fn = globalThis.window?.__TAURI__?.core?.invoke
  if (typeof fn !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
  return fn(command, payload)
}

const actionLabel = (entry) => {
  const action = entry?.proposal?.action || {}
  return ({
    search_notes: 'Rechercher dans les notes',
    create_note: 'Créer une note',
    append_to_note: 'Ajouter à une note',
    replace_note: 'Mettre à jour une note',
    replace_note_range: 'Modifier un passage',
    add_wiki_suggestion: 'Ajouter une proposition de Wiki',
    create_wiki: 'Générer un Wiki',
    reject_wiki_suggestion: 'Refuser une proposition de Wiki',
    delete_wiki: 'Supprimer un Wiki'
  })[action.action] || 'Action ElephantNote'
}

const actionSummary = (entry) => {
  const preview = entry?.proposal?.preview || {}
  if (preview.kind === 'search') return preview.query
  if (preview.kind === 'create_wiki') return `${preview.title} · ${preview.source_paths?.length || 0} sources`
  if (preview.kind === 'wiki_decision') return preview.topic
  if (preview.kind === 'delete_wiki') return preview.draft_id
  if (preview.kind === 'create_note' || preview.kind === 'modify_note') return preview.relative_path
  return entry?.proposal?.rationale || ''
}

const persistActionPatch = (message, target, patch) => {
  const actions = (message.actions || []).map((entry) => entry === target ? { ...entry, ...patch } : entry)
  chatStore.updateMessage(message.id, { actions })
}

const refreshAfterAction = async() => {
  window.dispatchEvent(new CustomEvent('elephantnote:knowledge-changed', { detail: { reason: 'chat-action' } }))
  await searchStore.inspect().catch(() => {})
}

const approveAction = async(message, entry) => {
  const id = entry?.proposal?.id
  if (!id || entry.busy) return
  persistActionPatch(message, entry, { busy: true, error: '' })
  try {
    await invoke('tauri_knowledge_chat_action_approve', { proposalId: id })
    const execution = await invoke('tauri_knowledge_chat_action_execute', { proposalId: id })
    persistActionPatch(message, entry, { busy: false, proposal: execution.proposal, execution })
    await refreshAfterAction()
  } catch (error) {
    persistActionPatch(message, entry, { busy: false, error: error?.message || String(error) })
  }
}

const rejectAction = async(message, entry) => {
  const id = entry?.proposal?.id
  if (!id || entry.busy) return
  persistActionPatch(message, entry, { busy: true, error: '' })
  try {
    const proposal = await invoke('tauri_knowledge_chat_action_reject', { proposalId: id })
    persistActionPatch(message, entry, { busy: false, proposal })
  } catch (error) {
    persistActionPatch(message, entry, { busy: false, error: error?.message || String(error) })
  }
}

const openNote = (value, fallbackTitle = '') => {''',
    'chat action methods'
)
text = replace_once(
    text,
    '''      wikiContext: result?.wikiContext || null,
      toolCalls''',
    '''      wikiContext: result?.wikiContext || null,
      actions: result?.actions || [],
      actionErrors: result?.actionErrors || [],
      toolCalls''',
    'chat result actions'
)
# Add styling near citations styles if marker exists.
text = replace_once(
    text,
    '.en-chat-citations {',
    '''.en-chat-actions { display: grid; gap: 8px; margin-top: 12px; }
.en-chat-action-card { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid color-mix(in srgb, var(--en-primary) 38%, var(--en-border)); border-radius: 12px; background: color-mix(in srgb, var(--en-primary) 7%, var(--en-surface)); }
.en-chat-action-copy { min-width: 0; flex: 1; display: grid; gap: 3px; }
.en-chat-action-copy span, .en-chat-action-copy small { color: var(--en-muted); font-size: 12px; }
.en-chat-action-copy small { color: #ef4444; }
.en-chat-action-controls { display: flex; align-items: center; gap: 7px; }
.en-chat-action-controls button { min-height: 30px; padding: 0 10px; border: 1px solid var(--en-border); border-radius: 8px; background: var(--en-surface); color: var(--en-text); }
.en-chat-action-status { color: var(--en-muted); font-size: 11px; text-transform: capitalize; }

.en-chat-citations {''',
    'chat action CSS'
)
write(path, text)

# ---------------------------------------------------------------------------
# Graph: territory halos, modest Wiki nodes, unassigned notes hidden by default.
# ---------------------------------------------------------------------------
path = 'Elephant/frontend/app/components/views/AtomicGraphView.vue'
text = read(path)
text = text.replace('<span class="en-filter-label">Orphelins</span>', '<span class="en-filter-label">Afficher les notes non classées</span>', 1)
text = text.replace('const panelOpen = ref(true)', 'const panelOpen = ref(false)', 1)
# Insert connected IDs and filter behavior.
text = replace_once(
    text,
    '''const filteredNodes = computed(() => {
  const nodes = semanticModel.value.nodes
  const q = filterQuery.value.trim().toLowerCase()
  if (!q) return nodes
  return nodes.filter((n) => {
    const title = String(n.title || '').toLowerCase()
    const tags = Array.isArray(n.tags) ? n.tags.join(' ').toLowerCase() : ''
    return title.includes(q) || tags.includes(q)
  })
})''',
    '''const classifiedNodeIds = computed(() => {
  const ids = new Set()
  for (const node of semanticModel.value.nodes) {
    if ((node.kind || node.type) === 'wiki') ids.add(node.id)
  }
  for (const edge of semanticModel.value.edges) {
    if (edge.type === 'wiki-source' || edge.type === 'wiki-link' || edge.type === 'semantic' || edge.type === 'explicit-link') {
      ids.add(edge.source)
      ids.add(edge.target)
    }
  }
  return ids
})

const filteredNodes = computed(() => {
  let nodes = semanticModel.value.nodes
  if (!filterOrphans.value && classifiedNodeIds.value.size) {
    nodes = nodes.filter((node) => classifiedNodeIds.value.has(node.id))
  }
  const q = filterQuery.value.trim().toLowerCase()
  if (!q) return nodes
  return nodes.filter((n) => {
    const title = String(n.title || '').toLowerCase()
    const tags = Array.isArray(n.tags) ? n.tags.join(' ').toLowerCase() : ''
    return title.includes(q) || tags.includes(q)
  })
})''',
    'graph connected filter'
)
text = replace_once(
    text,
    'let labelCanvas = null\nlet neighborsMap = new Map()',
    'let labelCanvas = null\nlet territoryCanvas = null\nlet neighborsMap = new Map()',
    'territory canvas state'
)
# Wiki node size and labels metadata.
text = replace_once(
    text,
    '''    const isWiki = node.kind === 'wiki'
    const baseSize = 3 + connectivity * 6 + (node.kind === 'folder' ? 3 : 0) + (isWiki ? 5 : 0)''',
    '''    const isWiki = node.kind === 'wiki'
    const baseSize = isWiki ? 5.5 : 2.5 + connectivity * 4 + (node.kind === 'folder' ? 2 : 0)''',
    'wiki node size'
)
text = replace_once(
    text,
    '''      data: node
    })''',
    '''      data: node,
      isWiki,
      classified: classifiedNodeIds.value.has(id)
    })''',
    'graph node metadata'
)
# Candidate labels include metadata.
text = replace_once(
    text,
    '''      label: attrs.label || '',
      fullLabel: attrs.fullLabel || attrs.label || ''
    })''',
    '''      label: attrs.label || '',
      fullLabel: attrs.fullLabel || attrs.label || '',
      isWiki: attrs.isWiki === true,
      classified: attrs.classified === true
    })''',
    'label metadata'
)
text = replace_once(
    text,
    '''    if (!pinned && !showLabels.value) continue
    if (!pinned && c.rsize < effectiveThreshold) continue''',
    '''    if (!pinned && !showLabels.value) continue
    if (!pinned && !c.isWiki && !c.classified && c.rsize < effectiveThreshold * 1.8) continue
    if (!pinned && !c.isWiki && c.rsize < effectiveThreshold) continue''',
    'label declutter'
)
# Insert territory drawing before drawLabels.
marker = 'function drawLabels (sigma, graph, container) {'
territory_fn = r'''function drawTerritories (sigma, graph, container) {
  if (!territoryCanvas) return
  const width = container.clientWidth
  const height = container.clientHeight
  if (!width || !height) return
  const ratio = window.devicePixelRatio || 1
  territoryCanvas.width = width * ratio
  territoryCanvas.height = height * ratio
  territoryCanvas.style.width = `${width}px`
  territoryCanvas.style.height = `${height}px`
  const ctx = territoryCanvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const wikiIds = graph.nodes().filter((id) => graph.getNodeAttribute(id, 'isWiki') === true)
  for (const wikiId of wikiIds) {
    const points = []
    const wikiAttrs = graph.getNodeAttributes(wikiId)
    points.push(sigma.graphToViewport({ x: wikiAttrs.x, y: wikiAttrs.y }))
    graph.forEachEdge(wikiId, (_edge, attrs, source, target) => {
      if (attrs.edgeType !== 'wiki-source') return
      const other = source === wikiId ? target : source
      if (!graph.hasNode(other) || graph.getNodeAttribute(other, 'hidden')) return
      const node = graph.getNodeAttributes(other)
      points.push(sigma.graphToViewport({ x: node.x, y: node.y }))
    })
    if (points.length < 2) continue
    const center = points.reduce((output, point) => ({ x: output.x + point.x, y: output.y + point.y }), { x: 0, y: 0 })
    center.x /= points.length
    center.y /= points.length
    const radius = Math.max(64, ...points.map((point) => Math.hypot(point.x - center.x, point.y - center.y))) + 34
    const gradient = ctx.createRadialGradient(center.x, center.y, radius * 0.12, center.x, center.y, radius)
    gradient.addColorStop(0, 'rgba(217,133,69,0.13)')
    gradient.addColorStop(0.72, 'rgba(217,133,69,0.07)')
    gradient.addColorStop(1, 'rgba(217,133,69,0.015)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(217,133,69,0.42)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([7, 7])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(235,176,122,0.9)'
    ctx.font = '600 12px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(wikiAttrs.fullLabel || wikiAttrs.label || 'Wiki', center.x, center.y - radius + 20)
  }
}

'''
text = replace_once(text, marker, territory_fn + marker, 'territory draw function')
# Territory canvas setup and render.
text = replace_once(
    text,
    '''  labelCanvas = document.createElement('canvas')
  labelCanvas.style.position = 'absolute' ''',
    '''  territoryCanvas = document.createElement('canvas')
  territoryCanvas.style.position = 'absolute'
  territoryCanvas.style.inset = '0'
  territoryCanvas.style.pointerEvents = 'none'
  territoryCanvas.style.zIndex = '0'
  container.prepend(territoryCanvas)

  labelCanvas = document.createElement('canvas')
  labelCanvas.style.position = 'absolute' ''',
    'territory canvas mount'
)
text = replace_once(
    text,
    '''    if (renderer && graphInstance && containerRef.value) {
      drawLabels(renderer, graphInstance, containerRef.value)
    }''',
    '''    if (renderer && graphInstance && containerRef.value) {
      drawTerritories(renderer, graphInstance, containerRef.value)
      drawLabels(renderer, graphInstance, containerRef.value)
    }''',
    'territory render hook'
)
text = replace_once(
    text,
    '''  if (labelCanvas && labelCanvas.parentNode) {
    labelCanvas.remove()
    labelCanvas = null
  }
  graphInstance = null''',
    '''  if (labelCanvas && labelCanvas.parentNode) {
    labelCanvas.remove()
    labelCanvas = null
  }
  if (territoryCanvas && territoryCanvas.parentNode) {
    territoryCanvas.remove()
    territoryCanvas = null
  }
  graphInstance = null''',
    'territory canvas cleanup'
)
write(path, text)

# ---------------------------------------------------------------------------
# Tests: contextual citations and clean frontmatter excerpt.
# ---------------------------------------------------------------------------
path = 'Elephant/backend/knowledge-core/src/wiki_core.rs'
text = read(path)
text = text.replace('assert!(rendered.markdown.contains("[1]("));', 'assert!(rendered.markdown.contains("[Intro]("));')
write(path, text)

print('semantic Wiki, agent actions, Codex prewarm, citations, and graph territory patch applied')

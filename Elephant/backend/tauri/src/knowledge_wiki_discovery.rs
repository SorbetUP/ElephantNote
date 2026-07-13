#[cfg(not(mobile))]
use crate::chat_runtime::codex_app_server;
use elephantnote_knowledge_core::{EmbeddingInput, EmbeddingStore, KnowledgeStore};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

#[cfg(not(mobile))]
mod topic_graph;
#[cfg(not(mobile))]
use topic_graph::{
    assign_competitively, build_assignment_profile, build_topic_communities,
    refine_assignment_locally,
};

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
  metadata_json TEXT NOT NULL DEFAULT '{}',
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
    pub core_source_count: usize,
    pub confidence: f32,
    pub distinctiveness: f32,
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
    content_hash: String,
    excerpt: String,
    vector: Vec<f32>,
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
    #[serde(default)]
    cluster_id: Option<usize>,
    #[serde(default)]
    cluster_ids: Vec<usize>,
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
#[derive(Debug, Clone)]
struct PendingTopic {
    topic: String,
    title: String,
    reason: String,
    preview: String,
    suggested_sections: Vec<String>,
    core_members: Vec<usize>,
}

#[cfg(not(mobile))]
fn emit_embedding_progress(app: &AppHandle, payload: Value) {
    let _ = app.emit("elephantnote:knowledge:embedding-progress", payload);
}

#[cfg(not(mobile))]
fn provisional_zone_payload(
    documents: &[DocumentVector],
    route_threshold: f32,
    limit: usize,
) -> Vec<Value> {
    if documents.len() < 6 {
        return Vec::new();
    }
    let vectors = documents
        .iter()
        .map(|document| document.vector.clone())
        .collect::<Vec<_>>();
    build_topic_communities(&vectors, route_threshold)
        .into_iter()
        .filter(|community| community.members.len() >= 4)
        .take(limit.clamp(1, 12))
        .enumerate()
        .filter_map(|(index, community)| {
            let representative = community
                .representatives
                .first()
                .copied()
                .or_else(|| community.members.first().copied())?;
            let document = documents.get(representative)?;
            let source_paths = community
                .members
                .iter()
                .filter_map(|member| documents.get(*member).map(|value| value.path.clone()))
                .collect::<Vec<_>>();
            Some(json!({
                "id": format!("live-zone-{index}"),
                "title": document.title,
                "topic": document.title.trim().to_lowercase(),
                "preview": format!(
                    "Zone sémantique provisoire de {} notes. Le titre sera précisé après validation.",
                    source_paths.len()
                ),
                "sourcePaths": source_paths,
                "sourceCount": community.members.len(),
                "coherence": community.coherence,
                "distinctiveness": community.distinctiveness,
            }))
        })
        .collect()
}

#[cfg(not(mobile))]
fn emit_live_zones(
    app: &AppHandle,
    output: &[Option<DocumentVector>],
    route_threshold: f32,
    processed: usize,
    total: usize,
) {
    let completed = output.iter().flatten().cloned().collect::<Vec<_>>();
    let zones = provisional_zone_payload(&completed, route_threshold, 8);
    emit_embedding_progress(
        app,
        json!({
            "phase": "zones",
            "processed": processed,
            "total": total,
            "zones": zones,
        }),
    );
}

#[cfg(not(mobile))]
fn default_true() -> bool {
    true
}

fn active_vault_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(PathBuf::from(
        crate::vault::config::get_active_vault(app)?.path,
    ))
}

fn open_connection(root: &Path) -> Result<Connection, String> {
    let store = KnowledgeStore::open(root)?;
    let connection = Connection::open(store.database_path()).map_err(|error| error.to_string())?;
    connection
        .execute_batch(DISCOVERY_SCHEMA)
        .map_err(|error| error.to_string())?;
    let _ = connection.execute(
        "ALTER TABLE wiki_saved_candidates ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'",
        [],
    );
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
        .or_else(|| {
            (source == "app-local").then_some("http://127.0.0.1:39282/v1".to_string())
        })
        .ok_or_else(|| "The selected embedding route has no endpoint. Elephant will not replace semantic discovery with lexical matching.".to_string())?;
    let api_key = provider
        .and_then(|row| row.get("apiKey").and_then(Value::as_str))
        .unwrap_or("")
        .to_string();
    let headers = provider
        .and_then(|row| row.get("headers").and_then(Value::as_object))
        .map(|object| {
            object
                .iter()
                .filter_map(|(key, value)| {
                    value.as_str().map(|value| (key.clone(), value.to_string()))
                })
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
async fn embed_batch(
    app: &AppHandle,
    route: &EmbeddingRoute,
    inputs: &[String],
) -> Result<Vec<Vec<f32>>, String> {
    if route.source == "app-local" {
        let config = crate::tauri_extra_commands::load_ai_config(app)?;
        let payload = json!({ "aiConfig": config });
        let mut vectors = Vec::with_capacity(inputs.len());
        for input in inputs {
            let vector = crate::local_llama_runtime::embed_with_selected_model(
                app,
                &route.model,
                input,
                &payload,
            )
            .await?;
            vectors.push(normalize_vector(vector)?);
        }
        return Ok(vectors);
    }
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
                .map(|value| {
                    value
                        .as_f64()
                        .map(|value| value as f32)
                        .ok_or_else(|| "Embedding vector contains a non-number.".to_string())
                })
                .collect::<Result<Vec<_>, _>>()?;
            normalize_vector(values)
        })
        .collect()
}

#[cfg(not(mobile))]
fn trim_view(value: &str, limit: usize) -> String {
    value.chars().take(limit).collect::<String>()
}

#[cfg(not(mobile))]
fn document_text_views(title: &str, chunks: &[String]) -> (String, Vec<String>) {
    let clean_chunks = chunks
        .iter()
        .map(|chunk| chunk.trim())
        .filter(|chunk| !chunk.is_empty())
        .collect::<Vec<_>>();
    if clean_chunks.is_empty() {
        let title = title.trim();
        return (
            title.to_string(),
            (!title.is_empty())
                .then(|| vec![format!("Title: {title}")])
                .unwrap_or_default(),
        );
    }

    let last = clean_chunks.len().saturating_sub(1);
    let middle = clean_chunks.len() / 2;
    let mut groups = vec![
        vec![0, 1.min(last)],
        vec![middle.saturating_sub(1), middle, (middle + 1).min(last)],
        vec![last.saturating_sub(1), last],
    ];
    for group in &mut groups {
        group.sort_unstable();
        group.dedup();
    }
    groups.dedup();

    let mut views = groups
        .iter()
        .map(|indices| {
            let body = indices
                .iter()
                .filter_map(|index| clean_chunks.get(*index))
                .map(|chunk| trim_view(chunk, 1_500))
                .collect::<Vec<_>>()
                .join("\n\n");
            trim_view(&format!("Title: {}\n\n{}", title.trim(), body), 2_200)
        })
        .filter(|view| !view.trim().is_empty())
        .collect::<Vec<_>>();
    views.dedup();

    let mut excerpt_indices = vec![
        0,
        1.min(last),
        clean_chunks.len() / 3,
        middle,
        clean_chunks.len().saturating_mul(2) / 3,
        last.saturating_sub(1),
        last,
    ];
    excerpt_indices.sort_unstable();
    excerpt_indices.dedup();
    let excerpt = excerpt_indices
        .iter()
        .filter_map(|index| clean_chunks.get(*index))
        .map(|chunk| trim_view(chunk, 700))
        .collect::<Vec<_>>()
        .join("\n…\n");
    (trim_view(&excerpt, 3_500), views)
}

#[cfg(not(mobile))]
fn average_vectors(vectors: &[Vec<f32>]) -> Result<Vec<f32>, String> {
    let dimensions = vectors
        .first()
        .map(Vec::len)
        .ok_or_else(|| "Cannot average an empty embedding set.".to_string())?;
    if dimensions == 0 || vectors.iter().any(|vector| vector.len() != dimensions) {
        return Err("Document embedding views have incompatible dimensions.".into());
    }
    let mut average = vec![0.0; dimensions];
    for vector in vectors {
        for (target, value) in average.iter_mut().zip(vector) {
            *target += *value;
        }
    }
    normalize_vector(average)
}

#[cfg(not(mobile))]
fn load_documents(
    connection: &Connection,
) -> Result<Vec<(String, String, String, String, Vec<String>)>, String> {
    let mut chunks_by_path = HashMap::<String, Vec<String>>::new();
    {
        let mut chunks_statement = connection
            .prepare("SELECT document_path, text FROM chunks ORDER BY document_path, ordinal")
            .map_err(|error| error.to_string())?;
        let rows = chunks_statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| error.to_string())?;
        for row in rows {
            let (path, text) = row.map_err(|error| error.to_string())?;
            chunks_by_path.entry(path).or_default().push(text);
        }
    }

    let mut statement = connection
        .prepare("SELECT relative_path, title, content_hash FROM documents ORDER BY relative_path")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| error.to_string())?;
    let mut documents = Vec::new();
    for row in rows {
        let (path, title, content_hash) = row.map_err(|error| error.to_string())?;
        let chunks = chunks_by_path.remove(&path).unwrap_or_default();
        let (excerpt, views) = document_text_views(&title, &chunks);
        documents.push((path, title, content_hash, excerpt, views));
    }
    Ok(documents)
}

#[cfg(not(mobile))]
async fn document_vectors(
    app: &AppHandle,
    root: &Path,
    route: &EmbeddingRoute,
) -> Result<Vec<DocumentVector>, String> {
    let model_key = format!(
        "wiki-multiview-v3|{}|{}|{}",
        route.source, route.endpoint, route.model
    );
    let (mut output, missing) = {
        let connection = open_connection(root)?;
        let documents = load_documents(&connection)?;
        let mut output = Vec::<Option<DocumentVector>>::with_capacity(documents.len());
        let mut missing = Vec::<(usize, String, String, String, String, Vec<String>)>::new();
        for (path, title, content_hash, excerpt, views) in documents {
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
                if let Ok(values) = serde_json::from_str::<Vec<f32>>(&raw) {
                    if let Ok(vector) = normalize_vector(values) {
                        output.push(Some(DocumentVector {
                            path,
                            title,
                            content_hash,
                            excerpt,
                            vector,
                        }));
                        continue;
                    }
                }
            }
            output.push(None);
            missing.push((index, path, title, content_hash, excerpt, views));
        }
        (output, missing)
    };

    let total = output.len();
    emit_embedding_progress(
        app,
        json!({
            "phase": "start",
            "processed": 0,
            "total": total,
            "model": route.model,
        }),
    );

    let store = KnowledgeStore::open(root)?;
    let canonical_embeddings = EmbeddingStore::open(store.database_path())?;
    let cached_rows = output
        .iter()
        .flatten()
        .map(|document| {
            (
                EmbeddingInput {
                    relative_path: document.path.clone(),
                    title: document.title.clone(),
                    content_hash: document.content_hash.clone(),
                    text: format!(
                        "{}

{}",
                        document.title, document.excerpt
                    ),
                },
                document.vector.clone(),
            )
        })
        .collect::<Vec<_>>();
    for batch in cached_rows.chunks(128) {
        canonical_embeddings.save_batch(&route.model, route.threshold, batch)?;
    }

    let mut processed = 0usize;
    for document in output.iter().flatten() {
        processed += 1;
        emit_embedding_progress(
            app,
            json!({
                "phase": "note",
                "processed": processed,
                "total": total,
                "path": document.path,
                "title": document.title,
                "cached": true,
            }),
        );
        if processed == total || processed % 192 == 0 {
            emit_live_zones(app, &output, route.threshold, processed, total);
        }
    }

    for batch in missing.chunks(16) {
        let inputs = batch
            .iter()
            .flat_map(|(_, _, _, _, _, views)| views.iter().cloned())
            .collect::<Vec<_>>();
        let vectors = embed_batch(app, route, &inputs).await?;
        let mut vector_offset = 0usize;
        let connection = open_connection(root)?;
        let mut canonical_rows = Vec::with_capacity(batch.len());
        for (index, path, title, content_hash, excerpt, views) in batch {
            let view_count = views.len();
            if view_count == 0 || vector_offset + view_count > vectors.len() {
                return Err(format!("Missing embedding views for document {path}."));
            }
            let vector = average_vectors(&vectors[vector_offset..vector_offset + view_count])?;
            vector_offset += view_count;
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
            let document = DocumentVector {
                path: path.clone(),
                title: title.clone(),
                content_hash: content_hash.clone(),
                excerpt: excerpt.clone(),
                vector: vector.clone(),
            };
            canonical_rows.push((
                EmbeddingInput {
                    relative_path: path.clone(),
                    title: title.clone(),
                    content_hash: content_hash.clone(),
                    text: format!(
                        "{}

{}",
                        title, excerpt
                    ),
                },
                vector,
            ));
            output[*index] = Some(document);
        }
        if vector_offset != vectors.len() {
            return Err("Embedding provider returned unassigned document views.".into());
        }
        canonical_embeddings.save_batch(&route.model, route.threshold, &canonical_rows)?;
        for (index, path, title, _, _, _) in batch {
            processed += 1;
            emit_embedding_progress(
                app,
                json!({
                    "phase": "note",
                    "processed": processed,
                    "total": total,
                    "path": path,
                    "title": title,
                    "cached": false,
                }),
            );
            let _ = index;
        }
        if processed == total || processed % 192 < batch.len() {
            emit_live_zones(app, &output, route.threshold, processed, total);
        }
    }

    let documents = output.into_iter().flatten().collect::<Vec<_>>();
    let zones = provisional_zone_payload(&documents, route.threshold, 8);
    emit_embedding_progress(
        app,
        json!({
            "phase": "complete",
            "processed": documents.len(),
            "total": total,
            "zones": zones,
            "model": route.model,
        }),
    );
    Ok(documents)
}

#[cfg(not(mobile))]
fn candidate_overlap(left: &[String], right: &[String]) -> f32 {
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    let right_set = right.iter().collect::<HashSet<_>>();
    let shared = left
        .iter()
        .filter(|value| right_set.contains(*value))
        .count();
    shared as f32 / left.len().min(right.len()) as f32
}

#[cfg(not(mobile))]
fn topic_matches_existing(topic: &str, existing_topics: &HashSet<String>) -> bool {
    let topic = topic.trim().to_lowercase();
    existing_topics.iter().any(|existing| {
        let comparable = topic.chars().count().min(existing.chars().count()) >= 5;
        topic == *existing
            || (comparable && (topic.contains(existing) || existing.contains(&topic)))
    })
}

#[cfg(not(mobile))]
fn minimum_topic_sources(document_count: usize) -> usize {
    (document_count / 100).clamp(8, 24)
}

#[cfg(not(mobile))]
fn is_generic_topic(title: &str, topic: &str) -> bool {
    let normalized = format!("{} {}", title, topic)
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                ' '
            }
        })
        .collect::<String>();
    let tokens = normalized
        .split_whitespace()
        .filter(|token| token.len() > 1)
        .collect::<Vec<_>>();
    let generic = [
        "site",
        "discover",
        "découvrez",
        "decouvrez",
        "comment",
        "account",
        "compte",
        "code",
        "programming",
        "programmation",
        "animation",
        "photo",
        "video",
        "note",
        "notes",
        "project",
        "projet",
        "content",
        "contenu",
    ];
    tokens.len() <= 2 && tokens.iter().all(|token| generic.contains(token))
}

#[cfg(not(mobile))]
fn target_topic_limit(document_count: usize, requested: usize) -> usize {
    let natural = ((document_count as f32).sqrt() / 4.0).round() as usize;
    natural.clamp(4, 12).min(requested.clamp(1, 24))
}

#[cfg(not(mobile))]
fn json_object_from_text(text: &str) -> Result<&str, String> {
    let start = text
        .find('{')
        .ok_or_else(|| "Semantic discovery model returned no JSON object.".to_string())?;
    let end = text
        .rfind('}')
        .ok_or_else(|| "Semantic discovery model returned incomplete JSON.".to_string())?;
    if end < start {
        return Err("Semantic discovery model returned invalid JSON boundaries.".into());
    }
    Ok(&text[start..=end])
}

#[cfg(not(mobile))]
fn persist_candidates(
    connection: &Connection,
    candidates: &[SemanticWikiCandidate],
) -> Result<(), String> {
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
    let config = crate::tauri_extra_commands::load_ai_config(app)?;
    let route = embedding_route(&config)?;
    let documents = document_vectors(app, &root, &route).await?;
    if documents.len() < 3 {
        return Err(
            "Semantic discovery needs at least three indexed notes with embeddings.".into(),
        );
    }
    let vectors = documents
        .iter()
        .map(|document| document.vector.clone())
        .collect::<Vec<_>>();
    let clusters = build_topic_communities(&vectors, route.threshold);
    if clusters.is_empty() {
        return Err(
            "The embedding index did not contain a coherent group of at least three notes.".into(),
        );
    }

    let chat_route = config.pointer("/routes/chat").unwrap_or(&Value::Null);
    let source = chat_route
        .get("source")
        .or_else(|| chat_route.get("provider"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let model = chat_route
        .get("model")
        .and_then(Value::as_str)
        .unwrap_or("");
    if source != "codex" || model.trim().is_empty() {
        return Err("Semantic Wiki discovery currently requires the real Codex Chat route to name and qualify embedding clusters.".into());
    }
    let effort = chat_route
        .get("reasoningEffort")
        .and_then(Value::as_str)
        .unwrap_or("medium");

    let minimum_sources = minimum_topic_sources(documents.len());
    let cluster_payload = clusters
        .iter()
        .take(limit.saturating_mul(6).clamp(18, 72))
        .enumerate()
        .map(|(cluster_id, cluster)| {
            let notes = cluster
                .representatives
                .iter()
                .map(|index| {
                    let document = &documents[*index];
                    json!({
                        "path": document.path,
                        "title": document.title,
                        "excerpt": document.excerpt.chars().take(320).collect::<String>()
                    })
                })
                .collect::<Vec<_>>();
            json!({
                "cluster_id": cluster_id,
                "size": cluster.members.len(),
                "coherence": cluster.coherence,
                "distinctiveness": cluster.distinctiveness,
                "notes": notes
            })
        })
        .collect::<Vec<_>>();
    let proposal_limit = target_topic_limit(documents.len(), limit);
    let prompt = format!(
        "You are designing a durable knowledge map for a personal note vault. The groups below are deterministic mutual-nearest-neighbor GRAPH COMMUNITIES, not final Wiki proposals. Merge communities only when they form one durable subject. Return at most {} high-value topics, not a quota. Every included topic must have at least {} core notes after merging. Prefer topics that are specific enough to be useful, broad enough to organize a meaningful part of the vault, distinct from the other proposals, and likely to support a substantial reference article. Reject activity fragments, timestamp dumps, duplicated posts, generic interface vocabulary, media-format labels, and vague labels such as Site, Discover, Comment, Account, Code, Programming or Animation. A community id may belong to at most one topic. Use the representative notes, community coherence and distinctiveness to decide. Return exactly one JSON object with this shape and no prose:\n{{\"candidates\":[{{\"cluster_ids\":[0,3,7],\"include\":true,\"title\":\"Readable specific title\",\"topic\":\"normalized specific topic\",\"reason\":\"Why this subject is useful and distinct\",\"preview\":\"Precise scope of the future Wiki\",\"suggested_sections\":[\"Section\"]}}]}}\n\nGraph communities:\n{}",
        proposal_limit,
        minimum_sources,
        serde_json::to_string_pretty(&cluster_payload).map_err(|error| error.to_string())?
    );
    let result = codex_app_server::chat_with_effort(app, model, &prompt, Some(effort)).await?;
    let envelope: DiscoveryEnvelope = serde_json::from_str(json_object_from_text(&result.answer)?)
        .map_err(|error| format!("Invalid semantic Wiki discovery JSON: {error}"))?;

    let existing_wikis = KnowledgeStore::open(&root)?.list_wiki_drafts(None, 1_000)?;
    let existing_topics = existing_wikis
        .iter()
        .map(|draft| draft.topic.trim().to_lowercase())
        .collect::<HashSet<_>>();
    let existing_source_sets = existing_wikis
        .iter()
        .filter(|draft| !draft.source_paths.is_empty())
        .map(|draft| draft.source_paths.clone())
        .collect::<Vec<_>>();

    let mut used_communities = HashSet::new();
    let mut pending = Vec::<PendingTopic>::new();
    for label in envelope
        .candidates
        .into_iter()
        .filter(|candidate| candidate.include)
    {
        let topic = label.topic.trim().to_lowercase();
        let title = label.title.trim().to_string();
        if topic.is_empty() || title.is_empty() || topic_matches_existing(&topic, &existing_topics)
        {
            continue;
        }
        let mut community_ids = label.cluster_ids.clone();
        if let Some(cluster_id) = label.cluster_id {
            community_ids.push(cluster_id);
        }
        community_ids.sort_unstable();
        community_ids.dedup();
        community_ids.retain(|cluster_id| {
            *cluster_id < clusters.len() && !used_communities.contains(cluster_id)
        });
        if community_ids.is_empty() {
            continue;
        }

        let mut core_set = HashSet::new();
        let mut weighted_distinctiveness = 0.0;
        let mut weighted_size = 0usize;
        for community_id in &community_ids {
            let community = &clusters[*community_id];
            core_set.extend(community.members.iter().copied());
            weighted_distinctiveness += community.distinctiveness * community.members.len() as f32;
            weighted_size += community.members.len();
        }
        let mut core_members = core_set.into_iter().collect::<Vec<_>>();
        core_members.sort_unstable();
        let merged_distinctiveness = weighted_distinctiveness / weighted_size.max(1) as f32;
        if core_members.len() < minimum_sources {
            eprintln!(
                "[knowledge] wiki:topic-rejected reason=small-core title={} communities={:?} core_sources={} minimum_sources={}",
                title,
                community_ids,
                core_members.len(),
                minimum_sources
            );
            continue;
        }
        if is_generic_topic(&title, &topic)
            && (core_members.len() < minimum_sources.saturating_mul(2)
                || merged_distinctiveness < 0.08)
        {
            eprintln!(
                "[knowledge] wiki:topic-rejected reason=generic title={} communities={:?} core_sources={} distinctiveness={:.4}",
                title,
                community_ids,
                core_members.len(),
                merged_distinctiveness
            );
            continue;
        }
        used_communities.extend(community_ids.iter().copied());
        pending.push(PendingTopic {
            topic,
            title,
            reason: label.reason.trim().to_string(),
            preview: label.preview.trim().to_string(),
            suggested_sections: label
                .suggested_sections
                .iter()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .take(12)
                .collect(),
            core_members,
        });
    }

    let descriptor_inputs = pending
        .iter()
        .map(|topic| {
            format!(
                "Knowledge topic: {}\nScope: {}\nSections: {}",
                topic.title,
                topic.preview,
                topic.suggested_sections.join(", ")
            )
        })
        .collect::<Vec<_>>();
    let descriptor_vectors = if descriptor_inputs.is_empty() {
        Vec::new()
    } else {
        embed_batch(app, &route, &descriptor_inputs).await?
    };

    let mut qualified = Vec::<PendingTopic>::new();
    let mut profiles = Vec::new();
    for (topic, descriptor_vector) in pending.into_iter().zip(descriptor_vectors) {
        let Some(profile) = build_assignment_profile(
            &topic.core_members,
            &descriptor_vector,
            &vectors,
            route.threshold,
        ) else {
            continue;
        };
        if profile.confidence < 0.24
            || (profile.distinctiveness < -0.02
                && topic.core_members.len() < minimum_sources.saturating_mul(2))
        {
            eprintln!(
                "[knowledge] wiki:topic-rejected reason=weak-separation title={} core_sources={} confidence={:.4} distinctiveness={:.4}",
                topic.title,
                topic.core_members.len(),
                profile.confidence,
                profile.distinctiveness
            );
            continue;
        }
        qualified.push(topic);
        profiles.push(profile);
    }

    let raw_assignments = assign_competitively(&profiles, &vectors);
    let assignments = raw_assignments
        .iter()
        .enumerate()
        .map(|(index, members)| {
            let core_count = profiles[index].core_members.len();
            let max_members = core_count.saturating_mul(3).clamp(minimum_sources, 180);
            refine_assignment_locally(&profiles[index], members, &vectors, max_members)
        })
        .collect::<Vec<_>>();
    let mut candidates = Vec::new();
    for ((topic, profile), members) in qualified
        .into_iter()
        .zip(profiles.into_iter())
        .zip(assignments)
    {
        if members.len() < minimum_sources {
            continue;
        }
        let source_paths = members
            .iter()
            .map(|index| documents[*index].path.clone())
            .collect::<Vec<_>>();
        if existing_source_sets
            .iter()
            .any(|existing| candidate_overlap(&source_paths, existing) >= 0.72)
        {
            eprintln!(
                "[knowledge] wiki:topic-rejected reason=existing-wiki-overlap title={} sources={}",
                topic.title,
                source_paths.len()
            );
            continue;
        }
        let source_titles = members
            .iter()
            .map(|index| documents[*index].title.clone())
            .collect::<Vec<_>>();
        let core_sources = topic.core_members.len();
        let related_sources = source_paths.len().saturating_sub(core_sources);
        eprintln!(
            "[knowledge] wiki:topic-qualified topic={} core_sources={} related_sources={} total_sources={} floor={:.4} coherence={:.4} distinctiveness={:.4} confidence={:.4}",
            topic.topic,
            core_sources,
            related_sources,
            source_paths.len(),
            profile.floor,
            profile.coherence,
            profile.distinctiveness,
            profile.confidence
        );
        candidates.push(SemanticWikiCandidate {
            topic: topic.topic,
            title: topic.title,
            reason: topic.reason,
            preview: topic.preview,
            suggested_sections: topic.suggested_sections,
            source_paths,
            source_titles,
            score: members
                .len()
                .saturating_mul(1_000)
                .saturating_add(core_sources.saturating_mul(250))
                .saturating_add((profile.confidence * 1_000.0) as usize),
            coherence: profile.coherence,
            core_source_count: core_sources,
            confidence: profile.confidence,
            distinctiveness: profile.distinctiveness,
        });
    }
    candidates.sort_by(|left, right| right.score.cmp(&left.score));
    let mut deduplicated: Vec<SemanticWikiCandidate> = Vec::new();
    for candidate in candidates {
        let duplicate = deduplicated.iter().any(|existing| {
            candidate.topic == existing.topic
                || candidate_overlap(&candidate.source_paths, &existing.source_paths) >= 0.65
        });
        if !duplicate {
            deduplicated.push(candidate);
        }
    }
    deduplicated.truncate(proposal_limit);
    let candidates = deduplicated;
    {
        let connection = open_connection(&root)?;
        connection
            .execute(
                "DELETE FROM wiki_saved_candidates WHERE origin='semantic'",
                [],
            )
            .map_err(|error| error.to_string())?;
        persist_candidates(&connection, &candidates)?;
    }
    eprintln!(
        "[knowledge] wiki:semantic-discovery-v2 documents={} communities={} accepted={} embedding_model={} label_model={}",
        documents.len(),
        clusters.len(),
        candidates.len(),
        route.model,
        model
    );
    Ok(candidates)
}

#[tauri::command]
pub async fn tauri_knowledge_wiki_embedding_map(app: AppHandle) -> Result<Value, String> {
    #[cfg(mobile)]
    {
        let _ = app;
        Err("Semantic Wiki mapping is unavailable on mobile in this build.".into())
    }
    #[cfg(not(mobile))]
    {
        let root = active_vault_root(&app)?;
        let config = crate::tauri_extra_commands::load_ai_config(&app)?;
        let route = embedding_route(&config)?;
        let documents = document_vectors(&app, &root, &route).await?;
        let zones = provisional_zone_payload(&documents, route.threshold, 12);
        Ok(json!({
            "documents": documents.len(),
            "model": route.model,
            "zones": zones,
        }))
    }
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
    fn document_views_cover_opening_middle_and_end() {
        let chunks = (0..9)
            .map(|index| format!("chunk-{index}"))
            .collect::<Vec<_>>();
        let (excerpt, views) = document_text_views("Long note", &chunks);
        assert_eq!(views.len(), 3);
        assert!(views[0].contains("chunk-0"));
        assert!(views[1].contains("chunk-4"));
        assert!(views[2].contains("chunk-8"));
        assert!(excerpt.contains("chunk-0"));
        assert!(excerpt.contains("chunk-8"));
    }

    #[test]
    fn averaged_views_are_normalized() {
        let averaged = average_vectors(&[
            normalize_vector(vec![1.0, 0.0]).unwrap(),
            normalize_vector(vec![0.0, 1.0]).unwrap(),
        ])
        .unwrap();
        let norm = averaged
            .iter()
            .map(|value| value * value)
            .sum::<f32>()
            .sqrt();
        assert!((norm - 1.0).abs() < 1e-5);
    }

    #[test]
    fn topic_source_floor_scales_with_the_vault() {
        assert_eq!(minimum_topic_sources(200), 8);
        assert_eq!(minimum_topic_sources(1_393), 13);
        assert_eq!(minimum_topic_sources(10_000), 24);
    }

    #[test]
    fn candidate_overlap_detects_near_duplicate_topics() {
        let left = vec!["a".into(), "b".into(), "c".into()];
        let right = vec!["a".into(), "b".into(), "c".into(), "d".into()];
        assert_eq!(candidate_overlap(&left, &right), 1.0);
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

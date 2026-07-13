#[cfg(not(mobile))]
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
fn load_documents(
    connection: &Connection,
) -> Result<Vec<(String, String, String, String)>, String> {
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
    app: &AppHandle,
    root: &Path,
    route: &EmbeddingRoute,
) -> Result<Vec<DocumentVector>, String> {
    let model_key = format!("{}|{}|{}", route.source, route.endpoint, route.model);
    let (mut output, missing) = {
        let connection = open_connection(root)?;
        let documents = load_documents(&connection)?;
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
                if let Ok(values) = serde_json::from_str::<Vec<f32>>(&raw) {
                    if let Ok(vector) = normalize_vector(values) {
                        output.push(Some(DocumentVector {
                            path,
                            title,
                            excerpt,
                            vector,
                        }));
                        continue;
                    }
                }
            }
            output.push(None);
            missing.push((index, path, title, content_hash, excerpt));
        }
        (output, missing)
    };

    for batch in missing.chunks(32) {
        let inputs = batch
            .iter()
            .map(|(_, _, title, _, excerpt)| format!("Title: {title}\n\n{excerpt}"))
            .collect::<Vec<_>>();
        let vectors = embed_batch(app, route, &inputs).await?;
        {
            let connection = open_connection(root)?;
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
            .filter(|(_, cluster)| cluster.members.len() < 400)
            .map(|(cluster_index, cluster)| {
                (cluster_index, cosine(&cluster.centroid, &document.vector))
            })
            .max_by(|left, right| left.1.total_cmp(&right.1));
        if let Some((cluster_index, _similarity)) =
            best.filter(|(_, similarity)| *similarity >= threshold)
        {
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
fn minimum_topic_sources(document_count: usize) -> usize {
    (document_count / 100).clamp(8, 24)
}

#[cfg(not(mobile))]
fn centroid_for_members(members: &[usize], documents: &[DocumentVector]) -> Option<Vec<f32>> {
    let first = *members.first()?;
    let dimensions = documents.get(first)?.vector.len();
    let mut centroid = vec![0.0; dimensions];
    for index in members {
        let document = documents.get(*index)?;
        if document.vector.len() != dimensions {
            return None;
        }
        for (target, value) in centroid.iter_mut().zip(&document.vector) {
            *target += *value;
        }
    }
    normalize_vector(centroid).ok()
}

#[cfg(not(mobile))]
fn expanded_members(
    profile: &[f32],
    core_members: &[usize],
    documents: &[DocumentVector],
    route_threshold: f32,
) -> (Vec<usize>, f32) {
    let mut ranked = documents
        .iter()
        .enumerate()
        .map(|(index, document)| (index, cosine(profile, &document.vector)))
        .collect::<Vec<_>>();
    ranked.sort_by(|left, right| right.1.total_cmp(&left.1));

    let mut core_scores = core_members
        .iter()
        .filter_map(|index| documents.get(*index))
        .map(|document| cosine(profile, &document.vector))
        .collect::<Vec<_>>();
    core_scores.sort_by(|left, right| left.total_cmp(right));
    let core_quartile = core_scores
        .get(core_scores.len().saturating_sub(1) / 4)
        .copied()
        .unwrap_or(route_threshold);
    let semantic_floor = (route_threshold - 0.18).clamp(0.48, 0.72);
    let adaptive_floor = (core_quartile - 0.10).clamp(semantic_floor, 0.74);
    let target = core_members
        .len()
        .saturating_mul(3)
        .clamp(minimum_topic_sources(documents.len()), 400);

    let mut selected = core_members.iter().copied().collect::<HashSet<_>>();
    for (index, score) in ranked {
        if selected.len() >= 400 {
            break;
        }
        if score >= adaptive_floor || selected.len() < target {
            selected.insert(index);
        } else if selected.len() >= target {
            break;
        }
    }
    let mut selected = selected.into_iter().collect::<Vec<_>>();
    selected.sort_by(|left, right| {
        cosine(profile, &documents[*right].vector)
            .total_cmp(&cosine(profile, &documents[*left].vector))
    });
    selected.truncate(400);
    (selected, adaptive_floor)
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
    let clusters = cluster_documents(&documents, route.threshold);
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
            let mut representative_members = cluster.members.clone();
            representative_members.sort_by(|left, right| {
                cosine(&cluster.centroid, &documents[*right].vector)
                    .total_cmp(&cosine(&cluster.centroid, &documents[*left].vector))
            });
            let notes = representative_members
                .iter()
                .take(10)
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
                "notes": notes
            })
        })
        .collect::<Vec<_>>();
    let prompt = format!(
        "You are designing a durable knowledge map for a personal note vault. The embedding groups below are MICRO-CLUSTERS, not final Wiki proposals. Merge related micro-clusters into a small set of broad, specific MACRO-TOPICS. Return at most {} candidates. Each included candidate must combine enough evidence to represent a durable subject: at least {} core notes after merging, preferably 25 or more. Reject timestamp dumps, duplicated social posts, generic UI words and vague labels such as Site, Discover, Comment, Account, Code, Programming or Animation unless the notes clearly describe one specific stable subject. A cluster id may belong to at most one candidate. Keep genuinely different subjects separate. Return exactly one JSON object with this shape and no prose:\n{{\"candidates\":[{{\"cluster_ids\":[0,3,7],\"include\":true,\"title\":\"Readable specific title\",\"topic\":\"normalized specific topic\",\"reason\":\"Why the merged evidence deserves a Wiki\",\"preview\":\"What the Wiki would cover\",\"suggested_sections\":[\"Section\"]}}]}}\n\nEmbedding micro-clusters:\n{}",
        limit.clamp(1, 24),
        minimum_sources,
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
    let mut candidates = Vec::new();
    for label in envelope
        .candidates
        .into_iter()
        .filter(|candidate| candidate.include)
    {
        let topic = label.topic.trim().to_lowercase();
        if topic.is_empty()
            || label.title.trim().is_empty()
            || topic_matches_existing(&topic, &existing_topics)
        {
            continue;
        }
        let mut cluster_ids = label.cluster_ids.clone();
        if let Some(cluster_id) = label.cluster_id {
            cluster_ids.push(cluster_id);
        }
        cluster_ids.sort_unstable();
        cluster_ids.dedup();
        cluster_ids.retain(|cluster_id| *cluster_id < clusters.len());
        if cluster_ids.is_empty() {
            continue;
        }

        let mut core_set = HashSet::new();
        for cluster_id in &cluster_ids {
            core_set.extend(clusters[*cluster_id].members.iter().copied());
        }
        let mut core_members = core_set.into_iter().collect::<Vec<_>>();
        if core_members.len() < minimum_sources {
            eprintln!(
                "[knowledge] wiki:macro-candidate rejected title={} clusters={:?} core_sources={} minimum_sources={}",
                label.title.trim(),
                cluster_ids,
                core_members.len(),
                minimum_sources
            );
            continue;
        }
        core_members.sort_unstable();
        let Some(profile) = centroid_for_members(&core_members, &documents) else {
            continue;
        };
        let (members, expansion_floor) =
            expanded_members(&profile, &core_members, &documents, route.threshold);
        if members.len() < minimum_sources {
            continue;
        }
        let source_paths = members
            .iter()
            .map(|index| documents[*index].path.clone())
            .collect::<Vec<_>>();
        let source_titles = members
            .iter()
            .map(|index| documents[*index].title.clone())
            .collect::<Vec<_>>();
        let coherence = members
            .iter()
            .map(|index| cosine(&profile, &documents[*index].vector))
            .sum::<f32>()
            / members.len() as f32;
        eprintln!(
            "[knowledge] wiki:macro-candidate topic={} clusters={:?} core_sources={} expanded_sources={} floor={:.4} coherence={:.4}",
            topic,
            cluster_ids,
            core_members.len(),
            members.len(),
            expansion_floor,
            coherence
        );
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
                .take(12)
                .collect(),
            source_paths,
            source_titles,
            score: members
                .len()
                .saturating_mul(1_000)
                .saturating_add((coherence.max(0.0) * 1_000.0) as usize),
            coherence,
        });
    }
    candidates.sort_by(|left, right| right.score.cmp(&left.score));
    let mut deduplicated: Vec<SemanticWikiCandidate> = Vec::new();
    for candidate in candidates {
        let duplicate = deduplicated.iter().any(|existing| {
            candidate.topic == existing.topic
                || candidate_overlap(&candidate.source_paths, &existing.source_paths) >= 0.72
        });
        if !duplicate {
            deduplicated.push(candidate);
        }
    }
    deduplicated.truncate(limit.clamp(1, 24));
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
            DocumentVector {
                path: "a".into(),
                title: "A".into(),
                excerpt: String::new(),
                vector: normalize_vector(vec![1.0, 0.0]).unwrap(),
            },
            DocumentVector {
                path: "b".into(),
                title: "B".into(),
                excerpt: String::new(),
                vector: normalize_vector(vec![0.98, 0.05]).unwrap(),
            },
            DocumentVector {
                path: "c".into(),
                title: "C".into(),
                excerpt: String::new(),
                vector: normalize_vector(vec![0.95, 0.1]).unwrap(),
            },
            DocumentVector {
                path: "d".into(),
                title: "D".into(),
                excerpt: String::new(),
                vector: normalize_vector(vec![0.0, 1.0]).unwrap(),
            },
        ];
        let clusters = cluster_documents(&documents, 0.8);
        assert_eq!(clusters.len(), 1);
        assert_eq!(clusters[0].members.len(), 3);
        assert!(clusters[0].coherence > 0.95);
    }

    #[test]
    fn topic_source_floor_scales_with_the_vault() {
        assert_eq!(minimum_topic_sources(200), 8);
        assert_eq!(minimum_topic_sources(1_393), 13);
        assert_eq!(minimum_topic_sources(10_000), 24);
    }

    #[test]
    fn macro_topic_expansion_grows_a_small_core() {
        let documents = vec![
            DocumentVector {
                path: "a".into(),
                title: "A".into(),
                excerpt: String::new(),
                vector: normalize_vector(vec![1.0, 0.0]).unwrap(),
            },
            DocumentVector {
                path: "b".into(),
                title: "B".into(),
                excerpt: String::new(),
                vector: normalize_vector(vec![0.99, 0.03]).unwrap(),
            },
            DocumentVector {
                path: "c".into(),
                title: "C".into(),
                excerpt: String::new(),
                vector: normalize_vector(vec![0.96, 0.08]).unwrap(),
            },
            DocumentVector {
                path: "d".into(),
                title: "D".into(),
                excerpt: String::new(),
                vector: normalize_vector(vec![0.92, 0.15]).unwrap(),
            },
        ];
        let profile = centroid_for_members(&[0, 1], &documents).unwrap();
        let (expanded, floor) = expanded_members(&profile, &[0, 1], &documents, 0.72);
        assert_eq!(expanded.len(), 4);
        assert!((0.48..=0.74).contains(&floor));
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

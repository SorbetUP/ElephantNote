use elephantnote_knowledge_core::{
    EmbeddingInput, EmbeddingStatus, EmbeddingStore, KnowledgeStore,
};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::Path;
use tauri::{AppHandle, Emitter};

const BUILTIN_EMBEDDING_MODEL: &str = "elephantnote-feature-hash-384-v1";
const BUILTIN_EMBEDDING_DIMENSIONS: usize = 384;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingRebuildReport {
    pub model_id: String,
    pub source: String,
    pub scanned: usize,
    pub updated: usize,
    pub dimensions: usize,
    pub wiki_only: bool,
}

#[derive(Clone)]
struct EmbeddingRoute {
    source: String,
    model: String,
    endpoint: String,
    threshold: f32,
    api_key: String,
    headers: HeaderMap,
    config: Value,
}

fn text(value: &Value, keys: &[&str]) -> String {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .unwrap_or("")
        .to_string()
}

fn provider_source(provider: &Value) -> String {
    match text(provider, &["type"]).as_str() {
        "openai-compatible" => "api".into(),
        value => value.to_string(),
    }
}

fn header_map(provider: &Value) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    let api_key = text(provider, &["apiKey", "api_key"]);
    if !api_key.is_empty() {
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {api_key}"))
                .map_err(|error| error.to_string())?,
        );
    }
    if let Some(values) = provider.get("headers").and_then(Value::as_object) {
        for (name, value) in values {
            let Some(value) = value.as_str() else {
                continue;
            };
            headers.insert(
                HeaderName::from_bytes(name.as_bytes()).map_err(|error| error.to_string())?,
                HeaderValue::from_str(value).map_err(|error| error.to_string())?,
            );
        }
    }
    Ok(headers)
}

fn builtin_embedding_route(config: Value) -> EmbeddingRoute {
    EmbeddingRoute {
        source: "builtin".into(),
        model: BUILTIN_EMBEDDING_MODEL.into(),
        endpoint: String::new(),
        threshold: 0.24,
        api_key: String::new(),
        headers: HeaderMap::new(),
        config,
    }
}

fn embedding_route(app: &AppHandle) -> Result<EmbeddingRoute, String> {
    let config = crate::tauri_extra_commands::load_ai_config(app)?;
    let route = config
        .pointer("/routes/embedding")
        .cloned()
        .unwrap_or(Value::Null);
    let source = text(&route, &["source", "provider"]);
    let model = text(&route, &["model", "modelId"]);
    if source.is_empty() || source == "disabled" || model.is_empty() {
        return Ok(builtin_embedding_route(config));
    }
    let provider = config
        .pointer("/providers/list")
        .and_then(Value::as_array)
        .and_then(|providers| {
            providers.iter().find(|provider| {
                provider
                    .get("enabled")
                    .and_then(Value::as_bool)
                    .unwrap_or(true)
                    && provider_source(provider) == source
            })
        })
        .cloned()
        .unwrap_or(Value::Null);
    let endpoint = text(&route, &["endpoint"]);
    let endpoint = if endpoint.is_empty() {
        text(&provider, &["endpoint", "baseUrl", "base_url"])
    } else {
        endpoint
    };
    let threshold = route
        .get("threshold")
        .and_then(Value::as_f64)
        .unwrap_or(0.35) as f32;
    Ok(EmbeddingRoute {
        source,
        model,
        endpoint,
        threshold,
        api_key: text(&provider, &["apiKey", "api_key"]),
        headers: header_map(&provider)?,
        config,
    })
}

fn endpoint_join(base: &str, suffix: &str) -> String {
    format!(
        "{}/{}",
        base.trim_end_matches('/'),
        suffix.trim_start_matches('/')
    )
}

fn parse_openai_embeddings(value: &Value) -> Result<Vec<Vec<f32>>, String> {
    let data = value
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| "Embedding provider returned no data array.".to_string())?;
    data.iter()
        .map(|entry| {
            entry
                .get("embedding")
                .and_then(Value::as_array)
                .ok_or_else(|| "Embedding provider returned a malformed vector.".to_string())?
                .iter()
                .map(|value| {
                    value
                        .as_f64()
                        .map(|number| number as f32)
                        .ok_or_else(|| "Embedding vector contains a non-number.".to_string())
                })
                .collect()
        })
        .collect()
}

async fn embed_openai_compatible(
    route: &EmbeddingRoute,
    texts: &[String],
) -> Result<Vec<Vec<f32>>, String> {
    if route.endpoint.trim().is_empty() {
        return Err(format!(
            "Embedding provider `{}` has no endpoint.",
            route.source
        ));
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .default_headers(route.headers.clone())
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .post(endpoint_join(&route.endpoint, "embeddings"))
        .json(&json!({ "model": route.model, "input": texts }))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    let value = response
        .json::<Value>()
        .await
        .map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(value
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("Embedding provider request failed.")
            .to_string());
    }
    parse_openai_embeddings(&value)
}

async fn embed_ollama(route: &EmbeddingRoute, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
    let base = if route.endpoint.trim().is_empty() {
        crate::ollama::OllamaRuntime::base_url()
    } else {
        route.endpoint.clone()
    };
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .post(endpoint_join(&base, "api/embed"))
        .json(&json!({ "model": route.model, "input": texts }))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if response.status().is_success() {
        let value = response
            .json::<Value>()
            .await
            .map_err(|error| error.to_string())?;
        if let Some(vectors) = value.get("embeddings").and_then(Value::as_array) {
            return vectors
                .iter()
                .map(|vector| {
                    vector
                        .as_array()
                        .ok_or_else(|| "Ollama returned a malformed embedding.".to_string())?
                        .iter()
                        .map(|value| {
                            value.as_f64().map(|number| number as f32).ok_or_else(|| {
                                "Ollama embedding contains a non-number.".to_string()
                            })
                        })
                        .collect()
                })
                .collect();
        }
    }
    let mut output = Vec::with_capacity(texts.len());
    for text in texts {
        output.push(crate::ollama::OllamaRuntime::embed(&route.model, text).await?);
    }
    Ok(output)
}

fn stable_feature_hash(value: &str) -> usize {
    let mut hash = 2_166_136_261u32;
    for byte in value.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(16_777_619);
    }
    hash as usize
}

fn builtin_embedding(text: &str) -> Vec<f32> {
    let tokens = text
        .split(|character: char| !character.is_alphanumeric())
        .map(|token| token.trim().to_lowercase())
        .filter(|token| token.chars().count() >= 2)
        .collect::<Vec<_>>();
    let mut vector = vec![0.0f32; BUILTIN_EMBEDDING_DIMENSIONS];
    for (index, token) in tokens.iter().enumerate() {
        let hash = stable_feature_hash(token);
        let slot = hash % BUILTIN_EMBEDDING_DIMENSIONS;
        let sign = if (hash / BUILTIN_EMBEDDING_DIMENSIONS) % 2 == 0 {
            1.0
        } else {
            -1.0
        };
        vector[slot] += sign;
        if let Some(next) = tokens.get(index + 1) {
            let bigram = format!("{token}:{next}");
            let bigram_hash = stable_feature_hash(&bigram);
            let bigram_slot = bigram_hash % BUILTIN_EMBEDDING_DIMENSIONS;
            let bigram_sign = if (bigram_hash / BUILTIN_EMBEDDING_DIMENSIONS) % 2 == 0 {
                1.0
            } else {
                -1.0
            };
            vector[bigram_slot] += bigram_sign * 0.65;
        }
    }
    let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
    if norm > 0.0 {
        for value in &mut vector {
            *value /= norm;
        }
    }
    vector
}

async fn embed_batch(
    app: &AppHandle,
    route: &EmbeddingRoute,
    texts: &[String],
) -> Result<Vec<Vec<f32>>, String> {
    match route.source.as_str() {
        "builtin" => Ok(texts.iter().map(|text| builtin_embedding(text)).collect()),
        "app-local" => {
            let mut output = Vec::with_capacity(texts.len());
            for text in texts {
                output.push(
                    crate::local_llama_runtime::embed_with_selected_model(
                        app,
                        &route.model,
                        text,
                        &json!({ "aiConfig": route.config }),
                    )
                    .await?,
                );
            }
            Ok(output)
        }
        "ollama" => embed_ollama(route, texts).await,
        "api" | "openrouter" | "mistral" | "lmstudio" | "llamacpp" => {
            embed_openai_compatible(route, texts).await
        }
        source => Err(format!("Unsupported embedding provider: {source}")),
    }
}

#[tauri::command]
pub async fn tauri_knowledge_embeddings_rebuild(
    app: AppHandle,
    only_wiki_sources: Option<bool>,
) -> Result<EmbeddingRebuildReport, String> {
    let route = embedding_route(&app)?;
    let vault = crate::vault::config::get_active_vault(&app)?;
    let store = KnowledgeStore::open(Path::new(&vault.path))?;
    store.initialize_wikis()?;
    let embeddings = EmbeddingStore::open(store.database_path())?;
    let wiki_only = only_wiki_sources.unwrap_or(false);
    let paths = if wiki_only {
        Some(embeddings.wiki_source_paths()?)
    } else {
        None
    };
    let inputs = embeddings.pending_inputs(&route.model, paths.as_ref(), 100_000)?;
    let scanned = inputs.len();
    let mut updated = 0usize;
    let mut dimensions = 0usize;
    for batch in inputs.chunks(16) {
        let texts = batch
            .iter()
            .map(|input| input.text.clone())
            .collect::<Vec<_>>();
        let vectors = embed_batch(&app, &route, &texts).await?;
        if vectors.len() != batch.len() {
            return Err(format!(
                "Embedding provider returned {} vectors for {} documents.",
                vectors.len(),
                batch.len()
            ));
        }
        dimensions = vectors.first().map(Vec::len).unwrap_or(dimensions);
        let rows = batch
            .iter()
            .cloned()
            .zip(vectors)
            .collect::<Vec<(EmbeddingInput, Vec<f32>)>>();
        updated += embeddings.save_batch(&route.model, route.threshold, &rows)?;
    }
    let _ = app.emit(
        "elephantnote:knowledge-changed",
        json!({ "reason": "embeddings-rebuilt", "updated": updated }),
    );
    Ok(EmbeddingRebuildReport {
        model_id: route.model,
        source: route.source,
        scanned,
        updated,
        dimensions,
        wiki_only,
    })
}

#[tauri::command]
pub fn tauri_knowledge_embeddings_status(app: AppHandle) -> Result<EmbeddingStatus, String> {
    let vault = crate::vault::config::get_active_vault(&app)?;
    let store = KnowledgeStore::open(Path::new(&vault.path))?;
    EmbeddingStore::open(store.database_path())?.status()
}

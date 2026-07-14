use elephantnote_knowledge_core::{
    build_wiki_synthesis_request, collect_wiki_sources, parse_and_render_wiki, rebuild_vault,
    wiki_draft_from_rendered, KnowledgeStore, WikiDraft, WikiDraftStatus, WikiSourceChunk,
};
use serde_json::{json, Value};
use std::{
    collections::BTreeSet,
    env,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};

const PROTOCOL: &str = "elephant-addon-service-v1";

struct KnowledgeService {
    vault: PathBuf,
}

impl KnowledgeService {
    fn from_environment() -> Result<Self, String> {
        let raw = env::var("ELEPHANT_VAULT_DIR")
            .map_err(|_| "ELEPHANT_VAULT_DIR is required for the Knowledge service".to_string())?;
        let vault = PathBuf::from(raw);
        let canonical = std::fs::canonicalize(&vault).map_err(|error| error.to_string())?;
        if !canonical.is_dir() {
            return Err("The Knowledge service vault is not a directory".into());
        }
        Ok(Self { vault: canonical })
    }

    fn store(&self) -> Result<KnowledgeStore, String> {
        let store = KnowledgeStore::open(&self.vault)?;
        store.initialize_relations()?;
        store.initialize_taxonomy()?;
        store.initialize_wikis()?;
        Ok(store)
    }
}

fn success(id: u64, result: Value) -> Value {
    json!({ "protocol": PROTOCOL, "id": id, "ok": true, "result": result })
}

fn failure(id: u64, message: impl Into<String>) -> Value {
    json!({ "protocol": PROTOCOL, "id": id, "ok": false, "error": { "message": message.into() } })
}

fn required_string(params: &Value, key: &str) -> Result<String, String> {
    let value = params.get(key).and_then(Value::as_str).unwrap_or("").trim();
    if value.is_empty() {
        Err(format!("{key} is required"))
    } else {
        Ok(value.to_string())
    }
}

fn wiki_status(value: Option<&str>) -> Option<WikiDraftStatus> {
    match value.unwrap_or("") {
        "proposed" => Some(WikiDraftStatus::Proposed),
        "accepted" => Some(WikiDraftStatus::Accepted),
        "rejected" => Some(WikiDraftStatus::Rejected),
        "outdated" => Some(WikiDraftStatus::Outdated),
        _ => None,
    }
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn sources_for_topic(
    store: &KnowledgeStore,
    topic: &str,
    limit: usize,
) -> Result<Vec<WikiSourceChunk>, String> {
    let hits = store.search(topic, limit.clamp(1, 100))?;
    let mut paths = BTreeSet::new();
    for hit in hits {
        paths.insert(hit.relative_path);
    }
    let mut documents = Vec::new();
    for path in paths {
        if let Some(document) = store.inspect_document(&path)? {
            documents.push(document);
        }
    }
    Ok(collect_wiki_sources(&documents))
}

fn handle(service: &KnowledgeService, method: &str, params: Value) -> Result<Value, String> {
    match method {
        "service.start" | "knowledge.status" => {
            serde_json::to_value(service.store()?.status()?).map_err(|error| error.to_string())
        }
        "service.stop" => Ok(json!({ "stopped": true })),
        "knowledge.rebuild" => {
            serde_json::to_value(rebuild_vault(&service.vault)?).map_err(|error| error.to_string())
        }
        "knowledge.search" => {
            let query = required_string(&params, "query")?;
            let limit = params.get("limit").and_then(Value::as_u64).unwrap_or(20) as usize;
            serde_json::to_value(service.store()?.search(&query, limit)?)
                .map_err(|error| error.to_string())
        }
        "knowledge.inspect" => {
            let path = required_string(&params, "relativePath")?;
            serde_json::to_value(service.store()?.inspect_document(&path)?)
                .map_err(|error| error.to_string())
        }
        "knowledge.graph" => {
            let include = params
                .get("includeSuggestions")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            serde_json::to_value(service.store()?.graph_projection(include)?)
                .map_err(|error| error.to_string())
        }
        "knowledge.wiki.sources" => {
            let topic = required_string(&params, "topic")?;
            let limit = params.get("limit").and_then(Value::as_u64).unwrap_or(24) as usize;
            serde_json::to_value(sources_for_topic(&service.store()?, &topic, limit)?)
                .map_err(|error| error.to_string())
        }
        "knowledge.wiki.request" => {
            let topic = required_string(&params, "topic")?;
            let requested_title = params
                .get("requestedTitle")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty());
            let limit = params.get("limit").and_then(Value::as_u64).unwrap_or(24) as usize;
            let max_sections = params
                .get("maxSections")
                .and_then(Value::as_u64)
                .unwrap_or(12) as usize;
            let sources = sources_for_topic(&service.store()?, &topic, limit)?;
            Ok(json!({
                "request": build_wiki_synthesis_request(&topic, requested_title, &sources, max_sections),
                "sources": sources
            }))
        }
        "knowledge.wiki.render" => {
            let topic = required_string(&params, "topic")?;
            let response_json = required_string(&params, "responseJson")?;
            let model_id = required_string(&params, "modelId")?;
            let max_sections = params
                .get("maxSections")
                .and_then(Value::as_u64)
                .unwrap_or(12) as usize;
            let sources: Vec<WikiSourceChunk> = serde_json::from_value(
                params
                    .get("sources")
                    .cloned()
                    .unwrap_or(Value::Array(vec![])),
            )
            .map_err(|error| error.to_string())?;
            let rendered = parse_and_render_wiki(&response_json, &topic, &sources, max_sections)?;
            let draft = wiki_draft_from_rendered(&topic, rendered, &model_id, now());
            let store = service.store()?;
            store.save_wiki_draft(&draft)?;
            serde_json::to_value(draft).map_err(|error| error.to_string())
        }
        "knowledge.wiki.list" => {
            let status = wiki_status(params.get("status").and_then(Value::as_str));
            let limit = params.get("limit").and_then(Value::as_u64).unwrap_or(100) as usize;
            serde_json::to_value(service.store()?.list_wiki_drafts(status, limit)?)
                .map_err(|error| error.to_string())
        }
        "knowledge.wiki.get" => {
            let id = required_string(&params, "draftId")?;
            serde_json::to_value(service.store()?.wiki_draft(&id)?)
                .map_err(|error| error.to_string())
        }
        "knowledge.wiki.save" => {
            let draft: WikiDraft =
                serde_json::from_value(params.get("draft").cloned().unwrap_or(Value::Null))
                    .map_err(|error| error.to_string())?;
            let store = service.store()?;
            store.save_wiki_draft(&draft)?;
            serde_json::to_value(draft).map_err(|error| error.to_string())
        }
        "knowledge.wiki.accept" => {
            let id = required_string(&params, "draftId")?;
            let (draft, path) = service.store()?.accept_wiki_draft(&service.vault, &id)?;
            Ok(json!({ "draft": draft, "path": relative_to(&service.vault, &path) }))
        }
        "knowledge.wiki.reject" => {
            let id = required_string(&params, "draftId")?;
            serde_json::to_value(
                service
                    .store()?
                    .set_wiki_draft_status(&id, WikiDraftStatus::Rejected)?,
            )
            .map_err(|error| error.to_string())
        }
        _ => Err(format!("Unsupported Knowledge service method: {method}")),
    }
}

fn relative_to(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

#[tokio::main]
async fn main() {
    let service = match KnowledgeService::from_environment() {
        Ok(service) => service,
        Err(error) => {
            eprintln!("[knowledge-service] {error}");
            std::process::exit(1);
        }
    };
    let mut lines = BufReader::new(io::stdin()).lines();
    let mut writer = BufWriter::new(io::stdout());
    while let Ok(Some(line)) = lines.next_line().await {
        let request: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(error) => {
                let response = failure(0, format!("Invalid service request JSON: {error}"));
                let _ = writer.write_all(format!("{response}\n").as_bytes()).await;
                let _ = writer.flush().await;
                continue;
            }
        };
        let id = request.get("id").and_then(Value::as_u64).unwrap_or(0);
        let protocol = request
            .get("protocol")
            .and_then(Value::as_str)
            .unwrap_or("");
        let method = request.get("method").and_then(Value::as_str).unwrap_or("");
        let params = request.get("params").cloned().unwrap_or_else(|| json!({}));
        let response = if protocol != PROTOCOL {
            failure(id, format!("Unsupported service protocol: {protocol}"))
        } else {
            match handle(&service, method, params) {
                Ok(result) => success(id, result),
                Err(error) => failure(id, error),
            }
        };
        if writer
            .write_all(format!("{response}\n").as_bytes())
            .await
            .is_err()
        {
            break;
        }
        if writer.flush().await.is_err() {
            break;
        }
        if method == "service.stop" {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_vault() -> PathBuf {
        env::temp_dir().join(format!(
            "elephant-knowledge-addon-{}-{}",
            std::process::id(),
            now()
        ))
    }

    #[test]
    fn rebuild_search_graph_and_wiki_storage_share_one_package_database() {
        let vault = temp_vault();
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::write(vault.join("A.md"), "# Alpha\nAlpha links to [[Beta]].").unwrap();
        std::fs::write(vault.join("Beta.md"), "# Beta\nBeta is related to Alpha.").unwrap();
        let service = KnowledgeService {
            vault: std::fs::canonicalize(&vault).unwrap(),
        };
        let report = handle(&service, "knowledge.rebuild", json!({})).unwrap();
        assert_eq!(report["scanned"], 2);
        let hits = handle(
            &service,
            "knowledge.search",
            json!({ "query": "Alpha", "limit": 10 }),
        )
        .unwrap();
        assert!(hits.as_array().is_some_and(|values| !values.is_empty()));
        let graph = handle(&service, "knowledge.graph", json!({})).unwrap();
        assert_eq!(graph["nodes"].as_array().map(Vec::len), Some(2));
        std::fs::remove_dir_all(vault).ok();
    }
}

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use which::which;

const DEFAULT_OLLAMA_BASE: &str = "http://127.0.0.1:11434";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OllamaModel {
    pub name: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub modified_at: String,
}

#[derive(Deserialize, Debug)]
pub struct OllamaListResponse {
    pub models: Vec<OllamaModel>,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct OllamaStatus {
    pub available: bool,
    pub binary_path: Option<String>,
    pub base_url: String,
    pub error: Option<String>,
}

pub struct OllamaRuntime;

impl OllamaRuntime {
    pub fn base_url() -> String {
        std::env::var("OLLAMA_BASE_URL").unwrap_or_else(|_| DEFAULT_OLLAMA_BASE.into())
    }

    pub fn status() -> OllamaStatus {
        let mut path: Option<String> = which("ollama")
            .ok()
            .map(|p| p.to_string_lossy().to_string());
        let mut available = path.is_some();
        if !available {
            let mut extra_paths: Vec<PathBuf> = vec![
                PathBuf::from("/opt/homebrew/bin/ollama"),
                PathBuf::from("/usr/local/bin/ollama"),
                PathBuf::from("/Applications/Ollama.app/Contents/Resources/ollama"),
            ];
            if let Some(home) = std::env::var_os("HOME") {
                let mut p = PathBuf::from(home);
                p.push(".local/bin/ollama");
                extra_paths.push(p);
            }
            for candidate in extra_paths {
                if candidate.exists() {
                    path = Some(candidate.to_string_lossy().to_string());
                    available = true;
                    break;
                }
            }
        }
        OllamaStatus {
            available,
            binary_path: path,
            base_url: Self::base_url(),
            error: if available {
                None
            } else {
                Some("ollama binary not found".into())
            },
        }
    }

    pub async fn list_models() -> Result<Vec<OllamaModel>, String> {
        let base = Self::base_url();
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;
        let response: OllamaListResponse = client
            .get(format!("{}/api/tags", base.trim_end_matches('/')))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        Ok(response.models)
    }

    pub async fn generate(model: &str, prompt: &str) -> Result<String, String> {
        let base = Self::base_url();
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|e| e.to_string())?;
        let body = serde_json::json!({ "model": model, "prompt": prompt, "stream": false });
        let response: serde_json::Value = client
            .post(format!("{}/api/generate", base.trim_end_matches('/')))
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        response
            .get("response")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "no response field".into())
    }

    pub async fn embed(model: &str, text: &str) -> Result<Vec<f32>, String> {
        let base = Self::base_url();
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| e.to_string())?;
        let body = serde_json::json!({ "model": model, "prompt": text });
        let response: serde_json::Value = client
            .post(format!("{}/api/embeddings", base.trim_end_matches('/')))
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        response
            .get("embedding")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|x| x.as_f64().map(|f| f as f32))
                    .collect()
            })
            .ok_or_else(|| "no embedding returned".into())
    }
}

#[tauri::command]
pub fn tauri_ollama_status() -> OllamaStatus {
    OllamaRuntime::status()
}

#[tauri::command]
pub async fn tauri_ollama_list() -> Result<Vec<OllamaModel>, String> {
    OllamaRuntime::list_models().await
}

#[tauri::command]
pub async fn tauri_ollama_generate(model: String, prompt: String) -> Result<String, String> {
    OllamaRuntime::generate(&model, &prompt).await
}

#[tauri::command]
pub async fn tauri_ollama_embed(model: String, text: String) -> Result<Vec<f32>, String> {
    OllamaRuntime::embed(&model, &text).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_url_overridable_via_env() {
        std::env::set_var("OLLAMA_BASE_URL", "http://localhost:9");
        assert_eq!(OllamaRuntime::base_url(), "http://localhost:9");
        std::env::set_var("OLLAMA_BASE_URL", "http://localhost:10");
        assert_eq!(OllamaRuntime::base_url(), "http://localhost:10");
        std::env::remove_var("OLLAMA_BASE_URL");
    }

    #[test]
    fn default_base_url_points_to_localhost() {
        std::env::remove_var("OLLAMA_BASE_URL");
        let url = OllamaRuntime::base_url();
        assert!(url.contains("127.0.0.1:11434") || url.contains("localhost:11434"));
    }

    #[test]
    fn status_serializes_to_json() {
        let s = OllamaStatus {
            available: true,
            binary_path: Some("/usr/local/bin/ollama".into()),
            base_url: "http://x".into(),
            error: None,
        };
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json.get("available").and_then(|v| v.as_bool()), Some(true));
    }

    #[test]
    fn ollama_model_size_defaults_to_zero() {
        let model: OllamaModel = serde_json::from_str(r#"{"name":"llama3"}"#).unwrap();
        assert_eq!(model.name, "llama3");
        assert_eq!(model.size, 0);
    }

    #[test]
    fn list_response_parses_multiple_models() {
        let json = serde_json::json!({
          "models": [
            { "name": "llama3", "size": 1000, "modified_at": "2024-01-01" },
            { "name": "phi3", "size": 500, "modified_at": "2024-02-01" }
          ]
        });
        let parsed: OllamaListResponse = serde_json::from_value(json).unwrap();
        assert_eq!(parsed.models.len(), 2);
        assert_eq!(parsed.models[1].name, "phi3");
    }
}

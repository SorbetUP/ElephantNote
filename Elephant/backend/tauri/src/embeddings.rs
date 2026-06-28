use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS embeddings (
  rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  vault_id TEXT NOT NULL,
  note_path TEXT NOT NULL,
  model_id TEXT NOT NULL,
  vec BLOB NOT NULL,
  dim INTEGER NOT NULL,
  mtime INTEGER NOT NULL DEFAULT 0,
  UNIQUE(vault_id, note_path, model_id)
);
CREATE INDEX IF NOT EXISTS embeddings_vault_idx ON embeddings(vault_id);
";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EmbeddingHit {
  pub path: String,
  pub score: f32,
}

pub struct EmbeddingStore {
  pub conn: Connection,
}

impl EmbeddingStore {
  pub fn open(vault_root: &Path) -> rusqlite::Result<Self> {
    let db_dir = vault_root.join(".elephantnote").join("index");
    fs::create_dir_all(&db_dir).ok();
    let db_path = db_dir.join("embeddings.sqlite");
    let conn = Connection::open(db_path)?;
    conn.execute_batch(SCHEMA)?;
    Ok(EmbeddingStore { conn })
  }

  pub fn open_in_memory() -> rusqlite::Result<Self> {
    let conn = Connection::open_in_memory()?;
    conn.execute_batch(SCHEMA)?;
    Ok(EmbeddingStore { conn })
  }

  pub fn upsert(&self, vault_id: &str, note_path: &str, model_id: &str, vec: &[f32], mtime: i64) -> rusqlite::Result<()> {
    let bytes: Vec<u8> = vec.iter().flat_map(|f| f.to_le_bytes()).collect();
    self.conn.execute(
      "INSERT INTO embeddings (vault_id, note_path, model_id, vec, dim, mtime)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(vault_id, note_path, model_id) DO UPDATE SET vec=excluded.vec, dim=excluded.dim, mtime=excluded.mtime",
      params![vault_id, note_path, model_id, bytes, vec.len() as i64, mtime],
    )?;
    Ok(())
  }

  pub fn remove(&self, vault_id: &str, note_path: &str) -> rusqlite::Result<()> {
    self.conn.execute(
      "DELETE FROM embeddings WHERE vault_id=?1 AND note_path=?2",
      params![vault_id, note_path],
    )?;
    Ok(())
  }

  pub fn clear_vault(&self, vault_id: &str) -> rusqlite::Result<()> {
    self.conn.execute("DELETE FROM embeddings WHERE vault_id=?1", params![vault_id])?;
    Ok(())
  }

  pub fn search(&self, vault_id: &str, query_vec: &[f32], k: usize) -> rusqlite::Result<Vec<EmbeddingHit>> {
    let mut stmt = self.conn.prepare(
      "SELECT note_path, vec, dim FROM embeddings WHERE vault_id=?1",
    )?;
    let rows = stmt.query_map(params![vault_id], |row| {
      let path: String = row.get(0)?;
      let blob: Vec<u8> = row.get(1)?;
      let _dim: i64 = row.get(2)?;
      Ok((path, blob))
    })?;
    let mut hits: Vec<EmbeddingHit> = rows
      .filter_map(|r| r.ok())
      .filter_map(|(path, blob)| {
        let vec = decode_vec(&blob)?;
        let score = cosine(&vec, query_vec)?;
        Some(EmbeddingHit { path, score })
      })
      .collect();
    hits.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    hits.truncate(k);
    Ok(hits)
  }

  pub fn count(&self, vault_id: &str) -> rusqlite::Result<i64> {
    self.conn.query_row(
      "SELECT COUNT(*) FROM embeddings WHERE vault_id=?1",
      params![vault_id],
      |row| row.get(0),
    )
  }
}

fn decode_vec(blob: &[u8]) -> Option<Vec<f32>> {
  if blob.len() % 4 != 0 {
    return None;
  }
  Some(
    blob
      .chunks_exact(4)
      .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
      .collect(),
  )
}

fn cosine(a: &[f32], b: &[f32]) -> Option<f32> {
  if a.is_empty() || a.len() != b.len() {
    return None;
  }
  let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
  let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
  let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
  if norm_a < 1e-10 || norm_b < 1e-10 {
    return Some(0.0);
  }
  Some(dot / (norm_a * norm_b))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EmbedRequest {
  pub model: String,
  pub input: String,
}

#[derive(Deserialize, Debug)]
pub struct EmbedResponse {
  pub data: Vec<EmbedData>,
}

#[derive(Deserialize, Debug)]
pub struct EmbedData {
  pub embedding: Vec<f32>,
}

pub async fn embed_text(base_url: &str, model: &str, text: &str) -> Result<Vec<f32>, String> {
  let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(60))
    .build()
    .map_err(|e| e.to_string())?;
  let request = EmbedRequest {
    model: model.to_string(),
    input: text.to_string(),
  };
  let res: EmbedResponse = client
    .post(format!("{}/embeddings", base_url.trim_end_matches('/')))
    .json(&request)
    .send()
    .await
    .map_err(|e| e.to_string())?
    .json()
    .await
    .map_err(|e| e.to_string())?;
  res.data.into_iter().next().map(|d| d.embedding).ok_or_else(|| "no embedding in response".into())
}

#[tauri::command]
pub async fn tauri_embeddings_embed(base_url: String, model: String, text: String) -> Result<Vec<f32>, String> {
  embed_text(&base_url, &model, &text).await
}

#[tauri::command]
pub fn tauri_embeddings_store(app: tauri::AppHandle, vault_id: String, note_path: String, model_id: String, vector: Vec<f32>) -> Result<(), String> {
  let vault = crate::vault::config::get_active_vault(&app).map_err(|e| e.to_string())?;
  let store = EmbeddingStore::open(std::path::Path::new(&vault.path)).map_err(|e| e.to_string())?;
  store.upsert(&vault_id, &note_path, &model_id, &vector, 0).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tauri_embeddings_search(app: tauri::AppHandle, vault_id: String, query_vector: Vec<f32>, k: Option<usize>) -> Result<Vec<EmbeddingHit>, String> {
  let vault = crate::vault::config::get_active_vault(&app).map_err(|e| e.to_string())?;
  let store = EmbeddingStore::open(std::path::Path::new(&vault.path)).map_err(|e| e.to_string())?;
  store
    .search(&vault_id, &query_vector, k.unwrap_or(20))
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tauri_embeddings_count(app: tauri::AppHandle, vault_id: String) -> Result<i64, String> {
  let vault = crate::vault::config::get_active_vault(&app).map_err(|e| e.to_string())?;
  let store = EmbeddingStore::open(std::path::Path::new(&vault.path)).map_err(|e| e.to_string())?;
  store.count(&vault_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tauri_embeddings_clear_vault(app: tauri::AppHandle, vault_id: String) -> Result<(), String> {
  let vault = crate::vault::config::get_active_vault(&app).map_err(|e| e.to_string())?;
  let store = EmbeddingStore::open(std::path::Path::new(&vault.path)).map_err(|e| e.to_string())?;
  store.clear_vault(&vault_id).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn cosine_similarity_orthogonal() {
    let a = vec![1.0, 0.0];
    let b = vec![0.0, 1.0];
    assert!((cosine(&a, &b).unwrap() - 0.0).abs() < 1e-6);
  }

  #[test]
  fn cosine_similarity_identical() {
    let a = vec![1.0, 2.0, 3.0];
    assert!((cosine(&a, &a).unwrap() - 1.0).abs() < 1e-6);
  }

  #[test]
  fn cosine_similarity_opposite() {
    let a = vec![1.0, 0.0];
    let b = vec![-1.0, 0.0];
    assert!((cosine(&a, &b).unwrap() - (-1.0)).abs() < 1e-6);
  }

  #[test]
  fn decode_encode_roundtrip() {
    let original = vec![1.5_f32, -2.0, 3.14];
    let bytes: Vec<u8> = original.iter().flat_map(|f| f.to_le_bytes()).collect();
    let decoded = decode_vec(&bytes).unwrap();
    assert_eq!(decoded.len(), 3);
    assert!((decoded[0] - 1.5).abs() < 1e-6);
    assert!((decoded[2] - 3.14).abs() < 1e-6);
  }

  #[test]
  fn upsert_and_search_ranks_by_cosine() {
    let store = EmbeddingStore::open_in_memory().unwrap();
    store.upsert("v", "a.md", "model", &[1.0, 0.0, 0.0], 0).unwrap();
    store.upsert("v", "b.md", "model", &[0.0, 1.0, 0.0], 0).unwrap();
    store.upsert("v", "c.md", "model", &[1.0, 1.0, 0.0], 0).unwrap();
    let hits = store.search("v", &[1.0, 0.0, 0.0], 3).unwrap();
    assert_eq!(hits.len(), 3);
    assert_eq!(hits[0].path, "a.md");
    assert!((hits[0].score - 1.0).abs() < 1e-6);
  }

  #[test]
  fn upsert_is_idempotent() {
    let store = EmbeddingStore::open_in_memory().unwrap();
    store.upsert("v", "n.md", "m", &[1.0, 0.0], 0).unwrap();
    store.upsert("v", "n.md", "m", &[0.0, 1.0], 1).unwrap();
    assert_eq!(store.count("v").unwrap(), 1);
    let hits = store.search("v", &[0.0, 1.0], 1).unwrap();
    assert_eq!(hits.len(), 1);
    assert!((hits[0].score - 1.0).abs() < 1e-6);
  }

  #[test]
  fn remove_clears_embedding() {
    let store = EmbeddingStore::open_in_memory().unwrap();
    store.upsert("v", "g.md", "m", &[1.0, 0.0], 0).unwrap();
    store.remove("v", "g.md").unwrap();
    assert_eq!(store.count("v").unwrap(), 0);
  }

  #[test]
  fn clear_vault_keeps_other_vaults() {
    let store = EmbeddingStore::open_in_memory().unwrap();
    store.upsert("v1", "a.md", "m", &[1.0], 0).unwrap();
    store.upsert("v2", "b.md", "m", &[1.0], 0).unwrap();
    store.clear_vault("v1").unwrap();
    assert_eq!(store.count("v1").unwrap(), 0);
    assert_eq!(store.count("v2").unwrap(), 1);
  }

  #[test]
  fn search_truncates_to_k() {
    let store = EmbeddingStore::open_in_memory().unwrap();
    for i in 0..5 {
      store.upsert("v", &format!("n{i}.md"), "m", &[i as f32, 0.0], 0).unwrap();
    }
    assert_eq!(store.search("v", &[1.0, 0.0], 2).unwrap().len(), 2);
  }

  #[test]
  fn mismatched_dimensions_return_none() {
    assert!(cosine(&[1.0, 2.0], &[1.0]).is_none());
    assert!(cosine(&[], &[]).is_none());
  }

  #[test]
  fn embed_request_serializes() {
    let req = EmbedRequest {
      model: "test-model".into(),
      input: "hello".into(),
    };
    let json = serde_json::to_value(&req).unwrap();
    assert_eq!(json.get("model").and_then(|v| v.as_str()), Some("test-model"));
    assert_eq!(json.get("input").and_then(|v| v.as_str()), Some("hello"));
  }

  #[test]
  fn embed_response_parses_single_embedding() {
    let json = serde_json::json!({
      "data": [{ "embedding": [0.1, 0.2, 0.3] }]
    });
    let res: EmbedResponse = serde_json::from_value(json).unwrap();
    assert_eq!(res.data.len(), 1);
    assert_eq!(res.data[0].embedding.len(), 3);
  }
}
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

const EMBEDDING_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS document_embeddings (
  document_path TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  model_id TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  vector_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(document_path) REFERENCES documents(relative_path) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS document_embeddings_model_idx
  ON document_embeddings(model_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS embedding_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingInput {
    pub relative_path: String,
    pub title: String,
    pub content_hash: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingSimilarity {
    pub source: String,
    pub target: String,
    pub score: f32,
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingStatus {
    pub documents: usize,
    pub model_id: String,
    pub dimensions: usize,
    pub threshold: String,
}

pub struct EmbeddingStore {
    database_path: PathBuf,
}

impl EmbeddingStore {
    pub fn open(database_path: &Path) -> Result<Self, String> {
        let conn = Connection::open(database_path).map_err(|error| error.to_string())?;
        conn.execute_batch(EMBEDDING_SCHEMA)
            .map_err(|error| error.to_string())?;
        Ok(Self {
            database_path: database_path.to_path_buf(),
        })
    }

    fn connection(&self) -> Result<Connection, String> {
        let conn = Connection::open(&self.database_path).map_err(|error| error.to_string())?;
        conn.execute_batch(EMBEDDING_SCHEMA)
            .map_err(|error| error.to_string())?;
        Ok(conn)
    }

    pub fn wiki_source_paths(&self) -> Result<HashSet<String>, String> {
        let conn = self.connection()?;
        let mut statement = match conn.prepare(
            "SELECT source_paths_json FROM wiki_drafts WHERE status IN ('accepted', 'outdated', 'proposed')",
        ) {
            Ok(statement) => statement,
            Err(_) => return Ok(HashSet::new()),
        };
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        let mut paths = HashSet::new();
        for row in rows {
            let raw = row.map_err(|error| error.to_string())?;
            for path in serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default() {
                if !path.trim().is_empty() {
                    paths.insert(path);
                }
            }
        }
        Ok(paths)
    }

    pub fn pending_inputs(
        &self,
        model_id: &str,
        only_paths: Option<&HashSet<String>>,
        limit: usize,
    ) -> Result<Vec<EmbeddingInput>, String> {
        let conn = self.connection()?;
        let existing = {
            let mut statement = conn
                .prepare(
                    "SELECT document_path, content_hash FROM document_embeddings WHERE model_id=?1",
                )
                .map_err(|error| error.to_string())?;
            let rows = statement
                .query_map(params![model_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|error| error.to_string())?;
            rows.collect::<Result<HashMap<_, _>, _>>()
                .map_err(|error| error.to_string())?
        };
        let mut statement = conn
            .prepare(
                "SELECT d.relative_path, d.title, d.content_hash,
                        COALESCE((SELECT group_concat(text, '\n\n') FROM
                          (SELECT c.text AS text FROM chunks c
                           WHERE c.document_path=d.relative_path ORDER BY c.ordinal LIMIT 6)), '')
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
        let mut output = Vec::new();
        for row in rows {
            let (relative_path, title, content_hash, body) =
                row.map_err(|error| error.to_string())?;
            if only_paths.is_some_and(|paths| !paths.contains(&relative_path)) {
                continue;
            }
            if existing
                .get(&relative_path)
                .is_some_and(|hash| hash == &content_hash)
            {
                continue;
            }
            let text = format!("{title}\n\n{body}")
                .chars()
                .take(8_000)
                .collect::<String>();
            if text.trim().is_empty() {
                continue;
            }
            output.push(EmbeddingInput {
                relative_path,
                title,
                content_hash,
                text,
            });
            if output.len() >= limit.clamp(1, 100_000) {
                break;
            }
        }
        Ok(output)
    }

    pub fn save_batch(
        &self,
        model_id: &str,
        threshold: f32,
        rows: &[(EmbeddingInput, Vec<f32>)],
    ) -> Result<usize, String> {
        let mut conn = self.connection()?;
        let transaction = conn.transaction().map_err(|error| error.to_string())?;
        let mut written = 0usize;
        for (input, raw_vector) in rows {
            let vector = normalize_vector(raw_vector)?;
            let vector_json = serde_json::to_string(&vector).map_err(|error| error.to_string())?;
            transaction
                .execute(
                    "INSERT INTO document_embeddings(
                       document_path, content_hash, model_id, dimensions, vector_json, updated_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, unixepoch())
                     ON CONFLICT(document_path) DO UPDATE SET
                       content_hash=excluded.content_hash,
                       model_id=excluded.model_id,
                       dimensions=excluded.dimensions,
                       vector_json=excluded.vector_json,
                       updated_at=unixepoch()",
                    params![
                        input.relative_path,
                        input.content_hash,
                        model_id,
                        vector.len() as i64,
                        vector_json,
                    ],
                )
                .map_err(|error| error.to_string())?;
            written += 1;
        }
        transaction
            .execute(
                "INSERT INTO embedding_meta(key, value) VALUES ('model_id', ?1)
                 ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                params![model_id],
            )
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO embedding_meta(key, value) VALUES ('threshold', ?1)
                 ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                params![threshold.to_string()],
            )
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        Ok(written)
    }

    pub fn status(&self) -> Result<EmbeddingStatus, String> {
        let conn = self.connection()?;
        let documents = conn
            .query_row("SELECT COUNT(*) FROM document_embeddings", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|error| error.to_string())? as usize;
        let model_id = meta_value(&conn, "model_id")?.unwrap_or_default();
        let threshold = meta_value(&conn, "threshold")?.unwrap_or_else(|| "0.35".into());
        let dimensions = conn
            .query_row(
                "SELECT dimensions FROM document_embeddings ORDER BY updated_at DESC LIMIT 1",
                [],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .unwrap_or(0) as usize;
        Ok(EmbeddingStatus {
            documents,
            model_id,
            dimensions,
            threshold,
        })
    }

    pub fn semantic_edges_for_paths(
        &self,
        paths: &[String],
        max_neighbors: usize,
    ) -> Result<Vec<EmbeddingSimilarity>, String> {
        if paths.len() < 2 {
            return Ok(Vec::new());
        }
        let wanted = paths.iter().cloned().collect::<HashSet<_>>();
        let conn = self.connection()?;
        let model_id = meta_value(&conn, "model_id")?.unwrap_or_default();
        if model_id.is_empty() {
            return Ok(Vec::new());
        }
        let threshold = meta_value(&conn, "threshold")?
            .and_then(|value| value.parse::<f32>().ok())
            .unwrap_or(0.35)
            .clamp(-1.0, 1.0);
        let mut statement = conn
            .prepare("SELECT document_path, vector_json FROM document_embeddings WHERE model_id=?1")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params![model_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| error.to_string())?;
        let mut vectors = HashMap::<String, Vec<f32>>::new();
        for row in rows {
            let (path, raw) = row.map_err(|error| error.to_string())?;
            if !wanted.contains(&path) {
                continue;
            }
            if let Ok(vector) = serde_json::from_str::<Vec<f32>>(&raw) {
                if !vector.is_empty() {
                    vectors.insert(path, vector);
                }
            }
        }
        let mut selected = HashMap::<(String, String), f32>::new();
        for source in paths {
            let Some(source_vector) = vectors.get(source) else {
                continue;
            };
            let mut candidates = paths
                .iter()
                .filter(|target| *target != source)
                .filter_map(|target| {
                    vectors
                        .get(target)
                        .map(|target_vector| (target.clone(), dot(source_vector, target_vector)))
                })
                .filter(|(_, score)| *score >= threshold)
                .collect::<Vec<_>>();
            candidates.sort_by(|left, right| right.1.total_cmp(&left.1));
            for (target, score) in candidates.into_iter().take(max_neighbors.clamp(1, 8)) {
                let pair = if source < &target {
                    (source.clone(), target)
                } else {
                    (target, source.clone())
                };
                selected
                    .entry(pair)
                    .and_modify(|current| *current = current.max(score))
                    .or_insert(score);
            }
        }
        let mut output = selected
            .into_iter()
            .map(|((source, target), score)| EmbeddingSimilarity {
                source,
                target,
                score,
                model_id: model_id.clone(),
            })
            .collect::<Vec<_>>();
        output.sort_by(|left, right| {
            left.source
                .cmp(&right.source)
                .then_with(|| left.target.cmp(&right.target))
        });
        Ok(output)
    }
}

fn meta_value(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM embedding_meta WHERE key=?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
    .map_err(|error| error.to_string())
}

fn normalize_vector(vector: &[f32]) -> Result<Vec<f32>, String> {
    if vector.is_empty() {
        return Err("Embedding provider returned an empty vector.".into());
    }
    let norm = vector
        .iter()
        .map(|value| (*value as f64) * (*value as f64))
        .sum::<f64>()
        .sqrt();
    if !norm.is_finite() || norm <= f64::EPSILON {
        return Err("Embedding provider returned a zero or invalid vector.".into());
    }
    Ok(vector
        .iter()
        .map(|value| (*value as f64 / norm) as f32)
        .collect())
}

fn dot(left: &[f32], right: &[f32]) -> f32 {
    if left.len() != right.len() || left.is_empty() {
        return -1.0;
    }
    left.iter()
        .zip(right)
        .map(|(a, b)| a * b)
        .sum::<f32>()
        .clamp(-1.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chunking::analyze_markdown;
    use crate::KnowledgeStore;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_vault() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("elephant-embedding-store-{stamp}"))
    }

    #[test]
    fn creates_real_similarity_edges_from_persisted_vectors() {
        let root = temp_vault();
        fs::create_dir_all(&root).unwrap();
        let mut store = KnowledgeStore::open(&root).unwrap();
        let alpha = analyze_markdown("alpha.md", "# Alpha\n\nMinecraft mod server", 1);
        let beta = analyze_markdown("beta.md", "# Beta\n\nMinecraft plugin server", 1);
        let gamma = analyze_markdown("gamma.md", "# Gamma\n\nCooking recipe", 1);
        store.upsert_document(&alpha).unwrap();
        store.upsert_document(&beta).unwrap();
        store.upsert_document(&gamma).unwrap();
        let embeddings = EmbeddingStore::open(store.database_path()).unwrap();
        embeddings
            .save_batch(
                "test",
                0.7,
                &[
                    (
                        EmbeddingInput {
                            relative_path: "alpha.md".into(),
                            title: "Alpha".into(),
                            content_hash: alpha.content_hash,
                            text: "alpha".into(),
                        },
                        vec![1.0, 0.0],
                    ),
                    (
                        EmbeddingInput {
                            relative_path: "beta.md".into(),
                            title: "Beta".into(),
                            content_hash: beta.content_hash,
                            text: "beta".into(),
                        },
                        vec![0.98, 0.2],
                    ),
                    (
                        EmbeddingInput {
                            relative_path: "gamma.md".into(),
                            title: "Gamma".into(),
                            content_hash: gamma.content_hash,
                            text: "gamma".into(),
                        },
                        vec![0.0, 1.0],
                    ),
                ],
            )
            .unwrap();
        let edges = embeddings
            .semantic_edges_for_paths(&["alpha.md".into(), "beta.md".into(), "gamma.md".into()], 2)
            .unwrap();
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].source, "alpha.md");
        assert_eq!(edges[0].target, "beta.md");
        fs::remove_dir_all(root).ok();
    }
}

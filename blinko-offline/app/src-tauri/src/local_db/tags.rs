use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub icon: Option<String>,
    pub sort_order: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct TagRelation {
    pub id: i64,
    pub note_id: i64,
    pub tag_id: i64,
    pub tag: Tag,
}

#[derive(FromRow)]
struct TagRelationRow {
    pub id: i64,
    pub note_id: i64,
    pub tag_id: i64,
    pub tag_name: String,
    pub tag_icon: Option<String>,
    pub tag_sort_order: i64,
    pub tag_created_at: DateTime<Utc>,
    pub tag_updated_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct TagRepository {
    pool: SqlitePool,
}

impl TagRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert_tag_by_name(&self, name: &str) -> Result<Tag, String> {
        let trimmed = normalize_tag_name(name);
        if trimmed.is_empty() {
            return Err("Tag name is empty".to_string());
        }
        if let Some(tag) = sqlx::query_as::<_, Tag>(
            "SELECT id, name, icon, sort_order, created_at, updated_at FROM tags WHERE name = ?",
        )
        .bind(&trimmed)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get tag by name: {e}"))?
        {
            return Ok(tag);
        }

        let now = Utc::now();
        sqlx::query(
            "INSERT INTO tags (name, icon, sort_order, created_at, updated_at) VALUES (?, NULL, 0, ?, ?)",
        )
        .bind(&trimmed)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to insert tag: {e}"))?;

        self.get_by_name(&trimmed)
            .await?
            .ok_or_else(|| "Failed to load created tag".to_string())
    }

    pub async fn list_all(&self) -> Result<Vec<Tag>, String> {
        sqlx::query_as::<_, Tag>(
            "SELECT id, name, icon, sort_order, created_at, updated_at FROM tags ORDER BY sort_order ASC, name ASC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list tags: {e}"))
    }

    pub async fn get_by_id(&self, id: i64) -> Result<Option<Tag>, String> {
        sqlx::query_as::<_, Tag>(
            "SELECT id, name, icon, sort_order, created_at, updated_at FROM tags WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get tag: {e}"))
    }

    pub async fn get_by_name(&self, name: &str) -> Result<Option<Tag>, String> {
        sqlx::query_as::<_, Tag>(
            "SELECT id, name, icon, sort_order, created_at, updated_at FROM tags WHERE name = ?",
        )
        .bind(name)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get tag by name: {e}"))
    }

    pub async fn update_tag_name(&self, id: i64, new_name: &str) -> Result<Tag, String> {
        let trimmed = normalize_tag_name(new_name);
        if trimmed.is_empty() {
            return Err("Tag name is empty".to_string());
        }
        let now = Utc::now();
        sqlx::query("UPDATE tags SET name = ?, updated_at = ? WHERE id = ?")
            .bind(&trimmed)
            .bind(now)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to update tag name: {e}"))?;

        self.get_by_id(id)
            .await?
            .ok_or_else(|| "Failed to load updated tag".to_string())
    }

    pub async fn update_tag_icon(&self, id: i64, icon: Option<&str>) -> Result<Tag, String> {
        let now = Utc::now();
        sqlx::query("UPDATE tags SET icon = ?, updated_at = ? WHERE id = ?")
            .bind(icon)
            .bind(now)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to update tag icon: {e}"))?;

        self.get_by_id(id)
            .await?
            .ok_or_else(|| "Failed to load updated tag".to_string())
    }

    pub async fn update_tag_order(&self, id: i64, sort_order: i64) -> Result<Tag, String> {
        let now = Utc::now();
        sqlx::query("UPDATE tags SET sort_order = ?, updated_at = ? WHERE id = ?")
            .bind(sort_order)
            .bind(now)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to update tag order: {e}"))?;

        self.get_by_id(id)
            .await?
            .ok_or_else(|| "Failed to load updated tag".to_string())
    }

    pub async fn delete_tag(&self, id: i64) -> Result<(), String> {
        sqlx::query("DELETE FROM note_tags WHERE tag_id = ?")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to delete tag relations: {e}"))?;

        sqlx::query("DELETE FROM tags WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to delete tag: {e}"))?;

        Ok(())
    }

    pub async fn list_note_ids_for_tag(&self, tag_id: i64) -> Result<Vec<i64>, String> {
        let rows = sqlx::query_as::<_, (i64,)>("SELECT note_id FROM note_tags WHERE tag_id = ?")
            .bind(tag_id)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to list note ids for tag: {e}"))?;
        Ok(rows.into_iter().map(|row| row.0).collect())
    }

    pub async fn set_note_tags_by_names(
        &self,
        note_id: i64,
        names: &[String],
    ) -> Result<Vec<Tag>, String> {
        let mut unique = Vec::new();
        let mut seen = HashSet::new();
        for name in names.iter() {
            let trimmed = normalize_tag_name(name);
            let lowercase_key = trimmed.to_lowercase();  // Case-insensitive comparison

            if trimmed.is_empty() || seen.contains(&lowercase_key) {
                continue;
            }
            seen.insert(lowercase_key);
            unique.push(trimmed);
        }

        let mut tag_ids = Vec::new();
        let mut tags = Vec::new();
        for name in unique.iter() {
            let tag = self.upsert_tag_by_name(name).await?;
            tag_ids.push(tag.id);
            tags.push(tag);
        }

        self.set_note_tags(note_id, &tag_ids).await?;
        Ok(tags)
    }

    pub async fn add_tag_to_notes(&self, tag_id: i64, note_ids: &[i64]) -> Result<(), String> {
        if note_ids.is_empty() {
            return Ok(());
        }
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|e| format!("Failed to begin transaction: {e}"))?;
        for note_id in note_ids {
            sqlx::query("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)")
                .bind(note_id)
                .bind(tag_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed to add tag relation: {e}"))?;
        }
        tx.commit()
            .await
            .map_err(|e| format!("Failed to commit tag relations: {e}"))?;
        Ok(())
    }

    pub async fn list_relations_for_note(&self, note_id: i64) -> Result<Vec<TagRelation>, String> {
        let rows = sqlx::query_as::<_, TagRelationRow>(
            "SELECT note_tags.rowid as id, note_tags.note_id as note_id, note_tags.tag_id as tag_id, 
                    tags.name as tag_name, tags.icon as tag_icon, tags.sort_order as tag_sort_order, 
                    tags.created_at as tag_created_at, tags.updated_at as tag_updated_at
             FROM note_tags
             JOIN tags ON tags.id = note_tags.tag_id
             WHERE note_tags.note_id = ?",
        )
        .bind(note_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list tag relations: {e}"))?;

        Ok(rows
            .into_iter()
            .map(|row| TagRelation {
                id: row.id,
                note_id: row.note_id,
                tag_id: row.tag_id,
                tag: Tag {
                    id: row.tag_id,
                    name: row.tag_name,
                    icon: row.tag_icon,
                    sort_order: row.tag_sort_order,
                    created_at: row.tag_created_at,
                    updated_at: row.tag_updated_at,
                },
            })
            .collect())
    }

    async fn set_note_tags(&self, note_id: i64, tag_ids: &[i64]) -> Result<(), String> {
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|e| format!("Failed to begin transaction: {e}"))?;

        sqlx::query("DELETE FROM note_tags WHERE note_id = ?")
            .bind(note_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to clear note tags: {e}"))?;

        for tag_id in tag_ids {
            sqlx::query("INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)")
                .bind(note_id)
                .bind(tag_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed to insert note tag: {e}"))?;
        }

        tx.commit()
            .await
            .map_err(|e| format!("Failed to commit note tags: {e}"))?;
        Ok(())
    }
}

pub fn extract_tag_names(content: &str) -> Vec<String> {
    fn strip_code_fences(input: &str) -> String {
        // Remove Markdown fenced code blocks (```...```), which often contain `#` tokens that
        // should not become tags (e.g. shebangs, headings in examples, code comments).
        let mut out = String::with_capacity(input.len());
        let mut rest = input;
        loop {
            let Some(start) = rest.find("```") else {
                out.push_str(rest);
                break;
            };
            out.push_str(&rest[..start]);
            let after = &rest[(start + 3)..];
            let Some(end) = after.find("```") else {
                // Unclosed fence: drop the remainder.
                break;
            };
            rest = &after[(end + 3)..];
        }
        out
    }

    let mut seen = HashSet::new();
    let mut tags = Vec::new();
    let without_code_blocks = strip_code_fences(content);
    for token in without_code_blocks.split_whitespace() {
        let Some(stripped) = token.strip_prefix('#') else {
            continue;
        };
        // Be conservative: don't turn shebangs ("#!/usr/bin/env") or path fragments ("#/usr/bin") into tags.
        // Keep behavior stable across devices by rejecting invalid leading characters instead of trimming them away.
        let cleaned = stripped
            .trim_end_matches(|c: char| !(c.is_alphanumeric() || c == '_' || c == '-' || c == '/'));
        if cleaned.is_empty() || cleaned.starts_with('!') || cleaned.starts_with('/') {
            continue;
        }
        // Heuristic: ignore short purely-numeric tokens that usually come from "Issue #14" or counters.
        if cleaned.chars().all(|c| c.is_numeric()) && cleaned.chars().count() < 4 {
            continue;
        }
        // Validate hierarchical segments: each segment must be non-empty and start with an alnum/_.
        let mut ok = true;
        for seg in cleaned.split('/') {
            if seg.is_empty() {
                ok = false;
                break;
            }
            let mut chars = seg.chars();
            let Some(first) = chars.next() else {
                ok = false;
                break;
            };
            if !(first.is_alphanumeric() || first == '_') {
                ok = false;
                break;
            }
            if !chars.all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
                ok = false;
                break;
            }
        }
        if !ok {
            continue;
        }
        let normalized = normalize_tag_name(cleaned);
        if seen.insert(normalized.clone()) {
            tags.push(normalized);
        }
    }
    tags
}

fn normalize_tag_name(name: &str) -> String {
    name.trim().trim_start_matches('#').to_string()
}

#[cfg(test)]
mod tests {
    use super::extract_tag_names;

    #[test]
    fn extract_tag_names_filters_path_shebang_and_short_numeric() {
        let content = r#"
hello #alpha #!/usr/bin/env #/usr/bin/env #0 #14 #2024 #Projet/Math #course, #code.
```sh
#should_not_be_seen
```
"#;

        let tags = extract_tag_names(content);

        assert!(tags.contains(&"alpha".to_string()));
        assert!(tags.contains(&"2024".to_string()));
        assert!(tags.contains(&"Projet/Math".to_string()));
        assert!(tags.contains(&"course".to_string()));
        assert!(tags.contains(&"code".to_string()));

        assert!(!tags.contains(&"/usr/bin/env".to_string()));
        assert!(!tags.contains(&"usr/bin/env".to_string()));
        assert!(!tags.contains(&"0".to_string()));
        assert!(!tags.contains(&"14".to_string()));
        assert!(!tags.contains(&"should_not_be_seen".to_string()));
    }

    #[test]
    fn extract_tag_names_validates_segments() {
        let content = "#ok #foo/bar-baz #foo//bar #-nope #nope-/x #nope./x #nope/--bad";
        let tags = extract_tag_names(content);
        assert!(tags.contains(&"ok".to_string()));
        assert!(tags.contains(&"foo/bar-baz".to_string()));
        assert!(tags.contains(&"nope-/x".to_string()));

        assert!(!tags.contains(&"foo//bar".to_string()));
        assert!(!tags.contains(&"-nope".to_string()));
        assert!(!tags.contains(&"nope./x".to_string()));
        assert!(!tags.contains(&"nope/--bad".to_string()));
    }
}

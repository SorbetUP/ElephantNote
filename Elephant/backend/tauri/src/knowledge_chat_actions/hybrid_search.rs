use elephantnote_knowledge_core::{KnowledgeSearchHit, KnowledgeStore};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::{HashMap, HashSet};

const RRF_K: f64 = 60.0;
const MAX_SEMANTIC_SEEDS: usize = 6;
const MAX_GRAPH_NEIGHBORS: usize = 24;

#[derive(Default)]
struct RankedHit {
    hit: Option<KnowledgeSearchHit>,
    score: f64,
    signals: HashSet<&'static str>,
}

pub(crate) fn exact_note_search(
    store: &KnowledgeStore,
    query: &str,
    limit: usize,
) -> Result<Vec<KnowledgeSearchHit>, String> {
    let needle = query.trim();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.clamp(1, 100);
    let candidate_limit = (limit * 12).clamp(48, 1_200) as i64;
    let conn = Connection::open(store.database_path()).map_err(|error| error.to_string())?;
    let mut statement = conn
        .prepare(
            "SELECT c.id, d.relative_path, d.title, s.heading, c.text,
                    c.start_offset, c.end_offset,
                    CASE WHEN instr(lower(d.title), lower(?1)) > 0 THEN 2 ELSE 1 END AS exact_rank
             FROM chunks c
             JOIN documents d ON d.relative_path=c.document_path
             JOIN sections s ON s.id=c.section_id
             WHERE instr(lower(d.title), lower(?1)) > 0
                OR instr(lower(c.text), lower(?1)) > 0
             ORDER BY exact_rank DESC, d.relative_path, c.ordinal
             LIMIT ?2",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![needle, candidate_limit], |row| {
            let text = row.get::<_, String>(4)?;
            Ok(KnowledgeSearchHit {
                chunk_id: row.get(0)?,
                relative_path: row.get(1)?,
                title: row.get(2)?,
                heading: row.get(3)?,
                excerpt: excerpt(&text, 360),
                score: row.get::<_, i64>(7)? as f64,
                start_offset: row.get::<_, i64>(5)?.max(0) as usize,
                end_offset: row.get::<_, i64>(6)?.max(0) as usize,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut seen_paths = HashSet::new();
    let mut output = Vec::new();
    for row in rows {
        let hit = row.map_err(|error| error.to_string())?;
        if seen_paths.insert(hit.relative_path.clone()) {
            output.push(hit);
            if output.len() >= limit {
                break;
            }
        }
    }
    Ok(output)
}

pub(crate) fn hybrid_note_search(
    store: &KnowledgeStore,
    query: &str,
    limit: usize,
) -> Result<Vec<KnowledgeSearchHit>, String> {
    let limit = limit.clamp(1, 100);
    let candidate_limit = (limit * 5).clamp(20, 300);
    let terms = meaningful_search_terms(query);
    let mut ranked = HashMap::<String, RankedHit>::new();

    merge_ranked_hits(
        &mut ranked,
        store.search(query, candidate_limit)?,
        1.0,
        "phrase",
    );

    for (index, term) in terms.iter().take(10).enumerate() {
        merge_ranked_hits(
            &mut ranked,
            store.search(term, candidate_limit.min(80))?,
            0.72 / (1.0 + index as f64 * 0.04),
            "term",
        );
    }

    let seed_paths = ranked
        .values()
        .filter_map(|entry| entry.hit.as_ref())
        .map(|hit| hit.relative_path.clone())
        .take(MAX_SEMANTIC_SEEDS)
        .collect::<Vec<_>>();

    if !seed_paths.is_empty() {
        merge_semantic_documents(store, &seed_paths, &mut ranked, candidate_limit)?;
        merge_graph_neighbors(store, &seed_paths, &mut ranked)?;
    }

    apply_title_path_boosts(query, &terms, &mut ranked);

    let mut output = ranked
        .into_values()
        .filter_map(|mut entry| {
            let mut hit = entry.hit.take()?;
            hit.score = entry.score;
            Some(hit)
        })
        .collect::<Vec<_>>();
    output.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.relative_path.cmp(&right.relative_path))
            .then_with(|| left.start_offset.cmp(&right.start_offset))
    });

    // Search results represent distinct notes, not repeated chunks from one note.
    let mut seen_documents = HashSet::<String>::new();
    output.retain(|hit| seen_documents.insert(hit.relative_path.clone()));
    output.truncate(limit);
    Ok(output)
}

fn merge_ranked_hits(
    ranked: &mut HashMap<String, RankedHit>,
    hits: Vec<KnowledgeSearchHit>,
    weight: f64,
    signal: &'static str,
) {
    for (rank, hit) in hits.into_iter().enumerate() {
        let contribution = weight / (RRF_K + rank as f64 + 1.0);
        let entry = ranked.entry(hit.chunk_id.clone()).or_default();
        if entry.hit.is_none() {
            entry.hit = Some(hit);
        }
        entry.score += contribution;
        entry.signals.insert(signal);
    }
}

fn merge_semantic_documents(
    store: &KnowledgeStore,
    seed_paths: &[String],
    ranked: &mut HashMap<String, RankedHit>,
    candidate_limit: usize,
) -> Result<(), String> {
    let conn = Connection::open(store.database_path()).map_err(|error| error.to_string())?;
    let Some((model_id, dimensions)) = embedding_model(&conn)? else {
        return Ok(());
    };
    let seed_vectors = load_vectors(&conn, &model_id, Some(seed_paths))?;
    if seed_vectors.is_empty() {
        return Ok(());
    }
    let centroid = normalized_centroid(seed_vectors.values(), dimensions);
    if centroid.is_empty() {
        return Ok(());
    }
    let all_vectors = load_vectors(&conn, &model_id, None)?;
    let mut documents = all_vectors
        .into_iter()
        .filter_map(|(path, vector)| {
            let similarity = dot(&centroid, &vector);
            (similarity.is_finite() && similarity > 0.08).then_some((path, similarity))
        })
        .collect::<Vec<_>>();
    documents.sort_by(|left, right| right.1.total_cmp(&left.1));

    for (rank, (path, similarity)) in documents.into_iter().take(candidate_limit).enumerate() {
        let Some(snapshot) = store.inspect_document(&path)? else {
            continue;
        };
        for chunk in snapshot.chunks.into_iter().take(2) {
            let heading = snapshot
                .sections
                .iter()
                .find(|section| section.id == chunk.section_id)
                .map(|section| section.heading.clone())
                .unwrap_or_else(|| snapshot.title.clone());
            let entry = ranked.entry(chunk.id.clone()).or_default();
            if entry.hit.is_none() {
                entry.hit = Some(KnowledgeSearchHit {
                    relative_path: snapshot.relative_path.clone(),
                    title: snapshot.title.clone(),
                    heading,
                    chunk_id: chunk.id,
                    excerpt: excerpt(&chunk.text, 360),
                    score: 0.0,
                    start_offset: chunk.start_offset,
                    end_offset: chunk.end_offset,
                });
            }
            entry.score += (0.95 * similarity as f64) / (RRF_K + rank as f64 + 1.0);
            entry.signals.insert("embedding");
        }
    }
    Ok(())
}

fn merge_graph_neighbors(
    store: &KnowledgeStore,
    seed_paths: &[String],
    ranked: &mut HashMap<String, RankedHit>,
) -> Result<(), String> {
    let conn = Connection::open(store.database_path()).map_err(|error| error.to_string())?;
    let mut aliases = HashSet::new();
    for path in seed_paths {
        aliases.insert(path.to_lowercase());
        aliases.insert(path.trim_end_matches(".md").to_lowercase());
        if let Some(snapshot) = store.inspect_document(path)? {
            aliases.insert(snapshot.title.to_lowercase());
            for link in snapshot.explicit_links {
                aliases.insert(link.target.to_lowercase());
            }
        }
    }

    let mut neighbors = Vec::<String>::new();
    let mut statement = match conn.prepare(
        "SELECT DISTINCT w.document_path, d.relative_path, d.title, w.target
         FROM wikilinks w JOIN documents d ON d.relative_path=w.document_path
         LIMIT 5000",
    ) {
        Ok(statement) => statement,
        Err(_) => return Ok(()),
    };
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
    for row in rows {
        let (source, path, title, target) = row.map_err(|error| error.to_string())?;
        let source_matches = aliases.contains(&source.to_lowercase())
            || aliases.contains(&path.to_lowercase())
            || aliases.contains(&title.to_lowercase());
        let target_matches = aliases.contains(&target.to_lowercase());
        if source_matches || target_matches {
            neighbors.push(path);
        }
        if neighbors.len() >= MAX_GRAPH_NEIGHBORS {
            break;
        }
    }
    neighbors.sort();
    neighbors.dedup();

    for (rank, path) in neighbors.into_iter().enumerate() {
        let Some(snapshot) = store.inspect_document(&path)? else {
            continue;
        };
        for chunk in snapshot.chunks.into_iter().take(1) {
            let heading = snapshot
                .sections
                .iter()
                .find(|section| section.id == chunk.section_id)
                .map(|section| section.heading.clone())
                .unwrap_or_else(|| snapshot.title.clone());
            let entry = ranked.entry(chunk.id.clone()).or_default();
            if entry.hit.is_none() {
                entry.hit = Some(KnowledgeSearchHit {
                    relative_path: snapshot.relative_path.clone(),
                    title: snapshot.title.clone(),
                    heading,
                    chunk_id: chunk.id,
                    excerpt: excerpt(&chunk.text, 360),
                    score: 0.0,
                    start_offset: chunk.start_offset,
                    end_offset: chunk.end_offset,
                });
            }
            entry.score += 0.52 / (RRF_K + rank as f64 + 1.0);
            entry.signals.insert("graph");
        }
    }
    Ok(())
}

fn apply_title_path_boosts(query: &str, terms: &[String], ranked: &mut HashMap<String, RankedHit>) {
    let normalized_query = query.trim().to_lowercase();
    for entry in ranked.values_mut() {
        let Some(hit) = entry.hit.as_ref() else {
            continue;
        };
        let title = hit.title.to_lowercase();
        let path = hit.relative_path.to_lowercase();
        let heading = hit.heading.to_lowercase();
        if !normalized_query.is_empty()
            && (title.contains(&normalized_query) || heading.contains(&normalized_query))
        {
            entry.score += 0.035;
            entry.signals.insert("exact-title");
        }
        let matches = terms
            .iter()
            .filter(|term| {
                title.contains(term.as_str())
                    || heading.contains(term.as_str())
                    || path.contains(term.as_str())
            })
            .count();
        entry.score += matches as f64 * 0.006;
    }
}

fn meaningful_search_terms(query: &str) -> Vec<String> {
    const STOP_WORDS: &[&str] = &[
        "afin",
        "avec",
        "dans",
        "des",
        "est",
        "faire",
        "les",
        "mais",
        "mes",
        "mon",
        "pour",
        "que",
        "quel",
        "quelle",
        "sur",
        "une",
        "un",
        "the",
        "and",
        "for",
        "from",
        "this",
        "with",
        "what",
        "where",
        "when",
        "comment",
        "peux",
        "peut",
        "notes",
        "note",
        "cherche",
        "recherche",
        "trouve",
        "trouver",
    ];
    let mut terms = query
        .split(|character: char| !character.is_alphanumeric())
        .map(|term| term.trim().to_lowercase())
        .filter(|term| term.chars().count() >= 3)
        .filter(|term| !STOP_WORDS.contains(&term.as_str()))
        .collect::<Vec<_>>();
    terms.sort();
    terms.dedup();
    terms
}

fn embedding_model(conn: &Connection) -> Result<Option<(String, usize)>, String> {
    conn.query_row(
        "SELECT model_id, dimensions FROM document_embeddings
         GROUP BY model_id, dimensions ORDER BY MAX(updated_at) DESC LIMIT 1",
        [],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? as usize)),
    )
    .optional()
    .map_err(|error| error.to_string())
}

fn load_vectors(
    conn: &Connection,
    model_id: &str,
    only_paths: Option<&[String]>,
) -> Result<HashMap<String, Vec<f32>>, String> {
    let wanted = only_paths.map(|paths| paths.iter().cloned().collect::<HashSet<_>>());
    let mut statement = conn
        .prepare("SELECT document_path, vector_json FROM document_embeddings WHERE model_id=?1")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![model_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| error.to_string())?;
    let mut output = HashMap::new();
    for row in rows {
        let (path, raw) = row.map_err(|error| error.to_string())?;
        if wanted.as_ref().is_some_and(|paths| !paths.contains(&path)) {
            continue;
        }
        let vector = serde_json::from_str::<Vec<f32>>(&raw).unwrap_or_default();
        if !vector.is_empty() {
            output.insert(path, vector);
        }
    }
    Ok(output)
}

fn normalized_centroid<'a>(
    vectors: impl Iterator<Item = &'a Vec<f32>>,
    dimensions: usize,
) -> Vec<f32> {
    if dimensions == 0 {
        return Vec::new();
    }
    let mut centroid = vec![0.0f32; dimensions];
    let mut count = 0.0f32;
    for vector in vectors {
        if vector.len() != dimensions {
            continue;
        }
        for (target, value) in centroid.iter_mut().zip(vector) {
            *target += *value;
        }
        count += 1.0;
    }
    if count == 0.0 {
        return Vec::new();
    }
    for value in &mut centroid {
        *value /= count;
    }
    let norm = centroid
        .iter()
        .map(|value| value * value)
        .sum::<f32>()
        .sqrt();
    if norm <= f32::EPSILON {
        return Vec::new();
    }
    for value in &mut centroid {
        *value /= norm;
    }
    centroid
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

fn excerpt(value: &str, max_chars: usize) -> String {
    let compact = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.chars().count() <= max_chars {
        return compact;
    }
    let mut output = compact.chars().take(max_chars).collect::<String>();
    output.push('…');
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_instruction_noise_from_queries() {
        let terms = meaningful_search_terms(
            "Peux-tu rechercher dans mes notes comment fonctionne Iroh sync ?",
        );
        assert!(terms.contains(&"iroh".to_string()));
        assert!(terms.contains(&"sync".to_string()));
        assert!(!terms.contains(&"notes".to_string()));
    }

    #[test]
    fn centroid_is_normalized() {
        let vectors = [vec![1.0, 0.0], vec![0.0, 1.0]];
        let centroid = normalized_centroid(vectors.iter(), 2);
        let norm = centroid
            .iter()
            .map(|value| value * value)
            .sum::<f32>()
            .sqrt();
        assert!((norm - 1.0).abs() < 0.0001);
    }
}

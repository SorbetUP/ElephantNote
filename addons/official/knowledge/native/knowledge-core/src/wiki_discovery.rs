use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WikiDiscoveryDocument {
    pub path: String,
    pub title: String,
    pub vector: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WikiTopicCommunity {
    pub id: usize,
    pub source_paths: Vec<String>,
    pub source_titles: Vec<String>,
    pub representative_paths: Vec<String>,
    pub representative_titles: Vec<String>,
    pub coherence: f32,
    pub distinctiveness: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WikiTopicLabel {
    pub community_id: usize,
    pub title: String,
    pub topic: String,
    #[serde(default)]
    pub reason: String,
    #[serde(default)]
    pub preview: String,
    #[serde(default)]
    pub suggested_sections: Vec<String>,
    #[serde(default = "default_true")]
    pub include: bool,
}

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

#[derive(Debug, Clone)]
struct Community {
    members: Vec<usize>,
    representatives: Vec<usize>,
    coherence: f32,
    distinctiveness: f32,
}

fn default_true() -> bool {
    true
}

fn normalize(mut vector: Vec<f32>) -> Option<Vec<f32>> {
    if vector.is_empty() || vector.iter().any(|value| !value.is_finite()) {
        return None;
    }
    let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
    if norm <= f32::EPSILON {
        return None;
    }
    for value in &mut vector {
        *value /= norm;
    }
    Some(vector)
}

fn cosine(left: &[f32], right: &[f32]) -> f32 {
    if left.is_empty() || left.len() != right.len() {
        return -1.0;
    }
    left.iter().zip(right).map(|(a, b)| a * b).sum()
}

fn percentile(sorted: &[f32], quantile: f32) -> f32 {
    if sorted.is_empty() {
        return -1.0;
    }
    let position = ((sorted.len() - 1) as f32 * quantile.clamp(0.0, 1.0)).round() as usize;
    sorted[position.min(sorted.len() - 1)]
}

fn centroid(members: &[usize], vectors: &[Vec<f32>]) -> Option<Vec<f32>> {
    let first = *members.first()?;
    let dimensions = vectors.get(first)?.len();
    let mut output = vec![0.0; dimensions];
    for index in members {
        let vector = vectors.get(*index)?;
        if vector.len() != dimensions {
            return None;
        }
        for (target, value) in output.iter_mut().zip(vector) {
            *target += *value;
        }
    }
    normalize(output)
}

fn exact_neighbors(vectors: &[Vec<f32>], k: usize) -> Vec<Vec<(usize, f32)>> {
    let mut neighbors = vec![Vec::new(); vectors.len()];
    for left in 0..vectors.len() {
        let mut row = Vec::with_capacity(vectors.len().saturating_sub(1));
        for right in 0..vectors.len() {
            if left != right {
                row.push((right, cosine(&vectors[left], &vectors[right])));
            }
        }
        row.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        row.truncate(k);
        neighbors[left] = row;
    }
    neighbors
}

fn coarse_neighbors(vectors: &[Vec<f32>], k: usize) -> Vec<Vec<(usize, f32)>> {
    let anchor_count = vectors.len().clamp(64, 256);
    let anchors = (0..anchor_count)
        .map(|slot| slot.saturating_mul(vectors.len()) / anchor_count)
        .collect::<Vec<_>>();
    let mut buckets = vec![Vec::<usize>::new(); anchor_count];
    for (index, vector) in vectors.iter().enumerate() {
        let bucket = anchors
            .iter()
            .enumerate()
            .map(|(slot, anchor)| (slot, cosine(vector, &vectors[*anchor])))
            .max_by(|left, right| {
                left.1
                    .total_cmp(&right.1)
                    .then_with(|| right.0.cmp(&left.0))
            })
            .map(|(slot, _)| slot)
            .unwrap_or(0);
        buckets[bucket].push(index);
    }

    let mut neighbors = vec![Vec::new(); vectors.len()];
    for bucket in buckets {
        for left in &bucket {
            let mut row = bucket
                .iter()
                .copied()
                .filter(|right| right != left)
                .map(|right| (right, cosine(&vectors[*left], &vectors[right])))
                .collect::<Vec<_>>();
            for anchor in &anchors {
                if anchor != left && !bucket.contains(anchor) {
                    row.push((*anchor, cosine(&vectors[*left], &vectors[*anchor])));
                }
            }
            row.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
            row.dedup_by_key(|entry| entry.0);
            row.truncate(k);
            neighbors[*left] = row;
        }
    }
    neighbors
}

fn label_propagation(adjacency: &[Vec<(usize, f32)>]) -> Vec<usize> {
    let mut labels = (0..adjacency.len()).collect::<Vec<_>>();
    let mut order = (0..adjacency.len()).collect::<Vec<_>>();
    order.sort_by(|left, right| {
        adjacency[*right]
            .len()
            .cmp(&adjacency[*left].len())
            .then_with(|| left.cmp(right))
    });

    for _ in 0..24 {
        let mut changed = false;
        for node in &order {
            if adjacency[*node].is_empty() {
                continue;
            }
            let mut scores = HashMap::<usize, (f32, usize)>::new();
            for (neighbor, weight) in &adjacency[*node] {
                let entry = scores.entry(labels[*neighbor]).or_insert((0.0, 0));
                entry.0 += *weight;
                entry.1 += 1;
            }
            let current_label = labels[*node];
            let current_score = scores.get(&current_label).copied().unwrap_or((0.0, 0));
            if let Some((best_label, best_score)) = scores.into_iter().max_by(|left, right| {
                left.1
                     .0
                    .total_cmp(&right.1 .0)
                    .then_with(|| left.1 .1.cmp(&right.1 .1))
                    .then_with(|| right.0.cmp(&left.0))
            }) {
                let better = best_score.0 > current_score.0 + 1e-5
                    || (best_score.0 >= current_score.0 - 1e-5 && best_score.1 > current_score.1);
                if best_label != current_label && better {
                    labels[*node] = best_label;
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
    labels
}

fn representatives(
    members: &[usize],
    community_centroid: &[f32],
    vectors: &[Vec<f32>],
    limit: usize,
) -> Vec<usize> {
    let mut ranked = members
        .iter()
        .copied()
        .map(|index| (index, cosine(community_centroid, &vectors[index])))
        .collect::<Vec<_>>();
    ranked.sort_by(|left, right| {
        right
            .1
            .total_cmp(&left.1)
            .then_with(|| left.0.cmp(&right.0))
    });
    let mut selected = Vec::new();
    for (index, centrality) in ranked {
        if selected.is_empty() {
            selected.push(index);
            continue;
        }
        let redundancy = selected
            .iter()
            .map(|selected_index| cosine(&vectors[index], &vectors[*selected_index]))
            .fold(-1.0, f32::max);
        if centrality - 0.30 * redundancy > 0.20 || selected.len() < 3 {
            selected.push(index);
        }
        if selected.len() >= limit {
            break;
        }
    }
    selected
}

fn communities(vectors: &[Vec<f32>], route_threshold: f32) -> Vec<Community> {
    if vectors.len() < 3 {
        return Vec::new();
    }
    let k = ((vectors.len() as f32).sqrt().round() as usize)
        .clamp(8, 32)
        .min(vectors.len().saturating_sub(1));
    let neighbors = if vectors.len() <= 6_000 {
        exact_neighbors(vectors, k)
    } else {
        coarse_neighbors(vectors, k)
    };
    let neighbor_sets = neighbors
        .iter()
        .map(|row| row.iter().map(|entry| entry.0).collect::<HashSet<_>>())
        .collect::<Vec<_>>();
    let global_floor = (route_threshold - 0.22).clamp(0.42, 0.74);
    let local_floors = neighbors
        .iter()
        .map(|row| {
            let mut scores = row.iter().map(|entry| entry.1).collect::<Vec<_>>();
            scores.sort_by(|left, right| left.total_cmp(right));
            percentile(&scores, 0.38).max(global_floor)
        })
        .collect::<Vec<_>>();

    let mut adjacency = vec![Vec::<(usize, f32)>::new(); vectors.len()];
    for left in 0..neighbors.len() {
        for (right, similarity) in &neighbors[left] {
            if *right <= left || !neighbor_sets[*right].contains(&left) {
                continue;
            }
            let denominator = neighbor_sets[left].len().min(neighbor_sets[*right].len());
            let shared = if denominator == 0 {
                0.0
            } else {
                neighbor_sets[left]
                    .intersection(&neighbor_sets[*right])
                    .count() as f32
                    / denominator as f32
            };
            let strict = *similarity >= route_threshold + 0.06;
            let supported =
                *similarity >= local_floors[left].max(local_floors[*right]) && shared >= 0.10;
            if !strict && !supported {
                continue;
            }
            let weight = *similarity + shared * 0.18;
            adjacency[left].push((*right, weight));
            adjacency[*right].push((left, weight));
        }
    }

    let labels = label_propagation(&adjacency);
    let mut grouped = HashMap::<usize, Vec<usize>>::new();
    for (index, label) in labels.into_iter().enumerate() {
        if !adjacency[index].is_empty() {
            grouped.entry(label).or_default().push(index);
        }
    }

    let mut output = Vec::new();
    for mut members in grouped.into_values() {
        members.sort_unstable();
        members.dedup();
        if members.len() < 3 {
            continue;
        }
        let Some(center) = centroid(&members, vectors) else {
            continue;
        };
        let coherence = members
            .iter()
            .map(|index| cosine(&center, &vectors[*index]))
            .sum::<f32>()
            / members.len() as f32;
        let member_set = members.iter().copied().collect::<HashSet<_>>();
        let mut background = vectors
            .iter()
            .enumerate()
            .filter(|(index, _)| !member_set.contains(index))
            .map(|(_, vector)| cosine(&center, vector))
            .collect::<Vec<_>>();
        background.sort_by(|left, right| left.total_cmp(right));
        let distinctiveness = coherence - percentile(&background, 0.95);
        let representative_members = representatives(&members, &center, vectors, 10);
        output.push(Community {
            members,
            representatives: representative_members,
            coherence,
            distinctiveness,
        });
    }
    output.sort_by(|left, right| {
        let left_utility = left.members.len() as f32
            * (left.coherence - 0.35).max(0.05)
            * (left.distinctiveness + 0.08).max(0.02);
        let right_utility = right.members.len() as f32
            * (right.coherence - 0.35).max(0.05)
            * (right.distinctiveness + 0.08).max(0.02);
        right_utility
            .total_cmp(&left_utility)
            .then_with(|| right.members.len().cmp(&left.members.len()))
    });
    output
}

pub fn load_discovery_documents(
    database_path: &Path,
) -> Result<Vec<WikiDiscoveryDocument>, String> {
    let connection = Connection::open(database_path).map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT e.document_path, d.title, e.vector_json
             FROM document_embeddings e
             JOIN documents d ON d.relative_path=e.document_path
             WHERE e.dimensions > 0
             ORDER BY e.document_path",
        )
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
    let mut output = Vec::new();
    let mut dimensions = None;
    for row in rows {
        let (path, title, raw) = row.map_err(|error| error.to_string())?;
        let Some(vector) = serde_json::from_str::<Vec<f32>>(&raw)
            .ok()
            .and_then(normalize)
        else {
            continue;
        };
        if dimensions.is_some_and(|value| value != vector.len()) {
            continue;
        }
        dimensions = Some(vector.len());
        output.push(WikiDiscoveryDocument {
            path,
            title,
            vector,
        });
    }
    Ok(output)
}

pub fn discover_topic_communities(
    documents: &[WikiDiscoveryDocument],
    threshold: f32,
    limit: usize,
) -> Vec<WikiTopicCommunity> {
    let vectors = documents
        .iter()
        .map(|document| document.vector.clone())
        .collect::<Vec<_>>();
    communities(&vectors, threshold.clamp(0.45, 0.95))
        .into_iter()
        .take(limit.clamp(1, 12))
        .enumerate()
        .map(|(id, community)| WikiTopicCommunity {
            id,
            source_paths: community
                .members
                .iter()
                .filter_map(|index| documents.get(*index).map(|value| value.path.clone()))
                .collect(),
            source_titles: community
                .members
                .iter()
                .filter_map(|index| documents.get(*index).map(|value| value.title.clone()))
                .collect(),
            representative_paths: community
                .representatives
                .iter()
                .filter_map(|index| documents.get(*index).map(|value| value.path.clone()))
                .collect(),
            representative_titles: community
                .representatives
                .iter()
                .filter_map(|index| documents.get(*index).map(|value| value.title.clone()))
                .collect(),
            coherence: community.coherence,
            distinctiveness: community.distinctiveness,
        })
        .collect()
}

pub fn finalize_semantic_candidates(
    communities: &[WikiTopicCommunity],
    labels: &[WikiTopicLabel],
) -> Vec<SemanticWikiCandidate> {
    let labels = labels
        .iter()
        .filter(|label| label.include)
        .map(|label| (label.community_id, label))
        .collect::<HashMap<_, _>>();
    let mut candidates = communities
        .iter()
        .filter_map(|community| {
            let label = labels.get(&community.id)?;
            let title = label.title.trim();
            let topic = label.topic.trim();
            if title.len() < 2 || topic.len() < 2 || community.source_paths.len() < 3 {
                return None;
            }
            let confidence = (0.62 * ((community.coherence - 0.45) / 0.45).clamp(0.0, 1.0)
                + 0.38 * ((community.distinctiveness + 0.02) / 0.22).clamp(0.0, 1.0))
            .clamp(0.0, 1.0);
            Some(SemanticWikiCandidate {
                topic: topic.to_string(),
                title: title.to_string(),
                reason: label.reason.trim().to_string(),
                preview: label.preview.trim().to_string(),
                suggested_sections: label
                    .suggested_sections
                    .iter()
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty())
                    .take(12)
                    .collect(),
                source_paths: community.source_paths.clone(),
                source_titles: community.source_titles.clone(),
                score: community.source_paths.len(),
                coherence: community.coherence,
                core_source_count: community.source_paths.len(),
                confidence,
                distinctiveness: community.distinctiveness,
            })
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        right
            .confidence
            .total_cmp(&left.confidence)
            .then_with(|| right.score.cmp(&left.score))
            .then_with(|| left.title.cmp(&right.title))
    });
    candidates
}

pub fn provisional_labels(communities: &[WikiTopicCommunity]) -> Vec<WikiTopicLabel> {
    communities
        .iter()
        .map(|community| {
            let title = community
                .representative_titles
                .first()
                .cloned()
                .unwrap_or_else(|| "Semantic topic".to_string());
            WikiTopicLabel {
                community_id: community.id,
                topic: title.clone(),
                title,
                reason: format!(
                    "Semantic community of {} mutually related notes.",
                    community.source_paths.len()
                ),
                preview: community
                    .representative_titles
                    .iter()
                    .take(4)
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(" · "),
                suggested_sections: Vec::new(),
                include: true,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vector(values: &[f32]) -> Vec<f32> {
        normalize(values.to_vec()).unwrap()
    }

    fn document(path: &str, title: &str, values: &[f32]) -> WikiDiscoveryDocument {
        WikiDiscoveryDocument {
            path: path.into(),
            title: title.into(),
            vector: vector(values),
        }
    }

    #[test]
    fn unrelated_topics_become_distinct_communities() {
        let documents = vec![
            document("rust-1.md", "Rust ownership", &[1.0, 0.00, 0.0]),
            document("rust-2.md", "Rust borrowing", &[0.99, 0.03, 0.0]),
            document("rust-3.md", "Rust lifetimes", &[0.97, 0.08, 0.0]),
            document("ml-1.md", "Machine learning", &[0.0, 1.0, 0.00]),
            document("ml-2.md", "Neural networks", &[0.0, 0.99, 0.03]),
            document("ml-3.md", "Model training", &[0.0, 0.97, 0.08]),
        ];
        let communities = discover_topic_communities(&documents, 0.72, 12);
        let mut sizes = communities
            .iter()
            .map(|community| community.source_paths.len())
            .collect::<Vec<_>>();
        sizes.sort_unstable();
        assert_eq!(sizes, vec![3, 3]);
    }

    #[test]
    fn final_candidates_keep_quality_evidence() {
        let community = WikiTopicCommunity {
            id: 0,
            source_paths: vec!["a.md".into(), "b.md".into(), "c.md".into()],
            source_titles: vec!["A".into(), "B".into(), "C".into()],
            representative_paths: vec!["a.md".into()],
            representative_titles: vec!["A".into()],
            coherence: 0.88,
            distinctiveness: 0.31,
        };
        let label = WikiTopicLabel {
            community_id: 0,
            title: "Rust language".into(),
            topic: "rust".into(),
            reason: "Strong evidence".into(),
            preview: "Ownership and borrowing".into(),
            suggested_sections: vec!["Ownership".into()],
            include: true,
        };
        let candidates = finalize_semantic_candidates(&[community], &[label]);
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].core_source_count, 3);
        assert!(candidates[0].confidence > 0.5);
        assert_eq!(candidates[0].suggested_sections, vec!["Ownership"]);
    }
}

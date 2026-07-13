use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone)]
pub(super) struct TopicCommunity {
    pub centroid: Vec<f32>,
    pub members: Vec<usize>,
    pub representatives: Vec<usize>,
    pub coherence: f32,
    pub distinctiveness: f32,
}

#[derive(Debug, Clone)]
pub(super) struct AssignmentProfile {
    pub vector: Vec<f32>,
    pub floor: f32,
    pub core_members: Vec<usize>,
    pub coherence: f32,
    pub distinctiveness: f32,
    pub confidence: f32,
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

fn percentile(sorted: &[f32], percentile: f32) -> f32 {
    if sorted.is_empty() {
        return -1.0;
    }
    let position = ((sorted.len() - 1) as f32 * percentile.clamp(0.0, 1.0)).round() as usize;
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

fn representative_members(
    members: &[usize],
    community_centroid: &[f32],
    vectors: &[Vec<f32>],
    limit: usize,
) -> Vec<usize> {
    if members.is_empty() || limit == 0 {
        return Vec::new();
    }
    let mut candidates = members
        .iter()
        .copied()
        .map(|index| (index, cosine(community_centroid, &vectors[index])))
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        right
            .1
            .total_cmp(&left.1)
            .then_with(|| left.0.cmp(&right.0))
    });

    let mut selected = vec![candidates[0].0];
    while selected.len() < limit.min(candidates.len()) {
        let next = candidates
            .iter()
            .filter(|(index, _)| !selected.contains(index))
            .map(|(index, centrality)| {
                let redundancy = selected
                    .iter()
                    .map(|selected_index| cosine(&vectors[*index], &vectors[*selected_index]))
                    .fold(-1.0, f32::max);
                (*index, 0.74 * *centrality - 0.26 * redundancy)
            })
            .max_by(|left, right| {
                left.1
                    .total_cmp(&right.1)
                    .then_with(|| right.0.cmp(&left.0))
            })
            .map(|(index, _)| index);
        let Some(next) = next else {
            break;
        };
        selected.push(next);
    }
    selected
}

fn exact_neighbor_lists(vectors: &[Vec<f32>], k: usize) -> Vec<Vec<(usize, f32)>> {
    let mut neighbors = vec![Vec::new(); vectors.len()];
    for left in 0..vectors.len() {
        let mut row = Vec::with_capacity(vectors.len().saturating_sub(1));
        for right in 0..vectors.len() {
            if left == right {
                continue;
            }
            row.push((right, cosine(&vectors[left], &vectors[right])));
        }
        row.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        row.truncate(k);
        neighbors[left] = row;
    }
    neighbors
}

fn coarse_neighbor_lists(vectors: &[Vec<f32>], k: usize) -> Vec<Vec<(usize, f32)>> {
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

fn shared_neighbor_ratio(left: usize, right: usize, neighbor_sets: &[HashSet<usize>]) -> f32 {
    let left_set = &neighbor_sets[left];
    let right_set = &neighbor_sets[right];
    let denominator = left_set.len().min(right_set.len());
    if denominator == 0 {
        return 0.0;
    }
    left_set.intersection(right_set).count() as f32 / denominator as f32
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
            let best = scores.into_iter().max_by(|left, right| {
                left.1
                     .0
                    .total_cmp(&right.1 .0)
                    .then_with(|| left.1 .1.cmp(&right.1 .1))
                    .then_with(|| right.0.cmp(&left.0))
            });
            if let Some((best_label, best_score)) = best {
                let materially_better = best_score.0 > current_score.0 + 1e-5
                    || (best_score.0 >= current_score.0 - 1e-5 && best_score.1 > current_score.1);
                if best_label != current_label && materially_better {
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

pub(super) fn build_topic_communities(
    vectors: &[Vec<f32>],
    route_threshold: f32,
) -> Vec<TopicCommunity> {
    if vectors.len() < 3 {
        return Vec::new();
    }
    let k = ((vectors.len() as f32).sqrt().round() as usize)
        .clamp(8, 32)
        .min(vectors.len().saturating_sub(1));
    let neighbors = if vectors.len() <= 6_000 {
        exact_neighbor_lists(vectors, k)
    } else {
        coarse_neighbor_lists(vectors, k)
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
            let shared = shared_neighbor_ratio(left, *right, &neighbor_sets);
            let strict_similarity = *similarity >= route_threshold + 0.06;
            let locally_supported =
                *similarity >= local_floors[left].max(local_floors[*right]) && shared >= 0.10;
            if !strict_similarity && !locally_supported {
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

    let mut communities = Vec::new();
    for mut members in grouped.into_values() {
        members.sort_unstable();
        members.dedup();
        if members.len() < 3 {
            continue;
        }
        let Some(community_centroid) = centroid(&members, vectors) else {
            continue;
        };
        let coherence = members
            .iter()
            .map(|index| cosine(&community_centroid, &vectors[*index]))
            .sum::<f32>()
            / members.len() as f32;
        let member_set = members.iter().copied().collect::<HashSet<_>>();
        let mut background = vectors
            .iter()
            .enumerate()
            .filter(|(index, _)| !member_set.contains(index))
            .map(|(_, vector)| cosine(&community_centroid, vector))
            .collect::<Vec<_>>();
        background.sort_by(|left, right| left.total_cmp(right));
        let distinctiveness = coherence - percentile(&background, 0.95);
        let representatives = representative_members(&members, &community_centroid, vectors, 10);
        communities.push(TopicCommunity {
            centroid: community_centroid,
            members,
            representatives,
            coherence,
            distinctiveness,
        });
    }
    communities.sort_by(|left, right| {
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
    communities
}

pub(super) fn build_assignment_profile(
    core_members: &[usize],
    descriptor_vector: &[f32],
    vectors: &[Vec<f32>],
    route_threshold: f32,
) -> Option<AssignmentProfile> {
    let core_centroid = centroid(core_members, vectors)?;
    if descriptor_vector.len() != core_centroid.len() {
        return None;
    }
    let blended = normalize(
        core_centroid
            .iter()
            .zip(descriptor_vector)
            .map(|(core, descriptor)| core * 0.82 + descriptor * 0.18)
            .collect(),
    )?;
    let core_set = core_members.iter().copied().collect::<HashSet<_>>();
    let mut core_scores = core_members
        .iter()
        .map(|index| cosine(&blended, &vectors[*index]))
        .collect::<Vec<_>>();
    core_scores.sort_by(|left, right| left.total_cmp(right));
    let mut background_scores = vectors
        .iter()
        .enumerate()
        .filter(|(index, _)| !core_set.contains(index))
        .map(|(_, vector)| cosine(&blended, vector))
        .collect::<Vec<_>>();
    background_scores.sort_by(|left, right| left.total_cmp(right));

    let core_q20 = percentile(&core_scores, 0.20);
    let background_p95 = percentile(&background_scores, 0.95);
    let absolute_floor = (route_threshold - 0.24).clamp(0.44, 0.68);
    let floor = ((core_q20 + background_p95) / 2.0)
        .max(absolute_floor)
        .min((core_q20 - 0.015).max(absolute_floor));
    let coherence = core_scores.iter().sum::<f32>() / core_scores.len().max(1) as f32;
    let distinctiveness = core_q20 - background_p95;
    let confidence = (0.62 * ((coherence - 0.45) / 0.45).clamp(0.0, 1.0)
        + 0.38 * ((distinctiveness + 0.02) / 0.22).clamp(0.0, 1.0))
    .clamp(0.0, 1.0);
    Some(AssignmentProfile {
        vector: blended,
        floor,
        core_members: core_members.to_vec(),
        coherence,
        distinctiveness,
        confidence,
    })
}

pub(super) fn assign_competitively(
    profiles: &[AssignmentProfile],
    vectors: &[Vec<f32>],
) -> Vec<Vec<usize>> {
    let mut assignments = profiles
        .iter()
        .map(|profile| profile.core_members.iter().copied().collect::<HashSet<_>>())
        .collect::<Vec<_>>();
    let core_owners = profiles
        .iter()
        .enumerate()
        .flat_map(|(topic, profile)| {
            profile
                .core_members
                .iter()
                .copied()
                .map(move |member| (member, topic))
        })
        .collect::<HashMap<_, _>>();

    for (document_index, vector) in vectors.iter().enumerate() {
        if let Some(owner) = core_owners.get(&document_index) {
            assignments[*owner].insert(document_index);
            continue;
        }
        let mut eligible = profiles
            .iter()
            .enumerate()
            .map(|(topic, profile)| (topic, cosine(&profile.vector, vector), profile.floor))
            .filter(|(_, score, floor)| *score >= *floor)
            .collect::<Vec<_>>();
        eligible.sort_by(|left, right| {
            right
                .1
                .total_cmp(&left.1)
                .then_with(|| left.0.cmp(&right.0))
        });
        let Some((best_topic, best_score, _)) = eligible.first().copied() else {
            continue;
        };
        assignments[best_topic].insert(document_index);
        if let Some((second_topic, second_score, second_floor)) = eligible.get(1).copied() {
            let strongly_supported = second_score >= second_floor + 0.05;
            let genuinely_ambiguous = best_score - second_score <= 0.035;
            if strongly_supported && genuinely_ambiguous {
                assignments[second_topic].insert(document_index);
            }
        }
    }

    assignments
        .into_iter()
        .map(|members| {
            let mut members = members.into_iter().collect::<Vec<_>>();
            members.sort_unstable();
            members
        })
        .collect()
}

pub(super) fn refine_assignment_locally(
    profile: &AssignmentProfile,
    members: &[usize],
    vectors: &[Vec<f32>],
    max_members: usize,
) -> Vec<usize> {
    if members.is_empty() {
        return profile.core_members.clone();
    }
    let core_set = profile.core_members.iter().copied().collect::<HashSet<_>>();
    let local_vectors = members
        .iter()
        .filter_map(|index| vectors.get(*index).cloned())
        .collect::<Vec<_>>();
    let local_threshold = (profile.floor + 0.055).clamp(0.54, 0.88);
    let communities = build_topic_communities(&local_vectors, local_threshold);
    let selected_local = communities
        .iter()
        .max_by(|left, right| {
            let left_core = left
                .members
                .iter()
                .filter(|local| {
                    members
                        .get(**local)
                        .is_some_and(|value| core_set.contains(value))
                })
                .count();
            let right_core = right
                .members
                .iter()
                .filter(|local| {
                    members
                        .get(**local)
                        .is_some_and(|value| core_set.contains(value))
                })
                .count();
            left_core
                .cmp(&right_core)
                .then_with(|| left.coherence.total_cmp(&right.coherence))
                .then_with(|| left.members.len().cmp(&right.members.len()))
        })
        .map(|community| {
            community
                .members
                .iter()
                .filter_map(|local| members.get(*local).copied())
                .collect::<HashSet<_>>()
        })
        .unwrap_or_default();

    let mut ranked = members
        .iter()
        .copied()
        .filter(|index| {
            core_set.contains(index)
                || selected_local.contains(index)
                || cosine(&profile.vector, &vectors[*index]) >= profile.floor + 0.065
        })
        .map(|index| (index, cosine(&profile.vector, &vectors[index])))
        .collect::<Vec<_>>();
    ranked.sort_by(|left, right| {
        let left_core = core_set.contains(&left.0);
        let right_core = core_set.contains(&right.0);
        right_core
            .cmp(&left_core)
            .then_with(|| right.1.total_cmp(&left.1))
            .then_with(|| left.0.cmp(&right.0))
    });
    ranked.dedup_by_key(|entry| entry.0);
    ranked.truncate(max_members.max(profile.core_members.len()));
    let mut refined = ranked.into_iter().map(|entry| entry.0).collect::<Vec<_>>();
    for core in &profile.core_members {
        if !refined.contains(core) {
            refined.push(*core);
        }
    }
    refined.sort_unstable();
    refined.dedup();
    refined
}

#[cfg(test)]
mod tests {
    use super::*;

    fn normalized(values: &[f32]) -> Vec<f32> {
        normalize(values.to_vec()).unwrap()
    }

    #[test]
    fn mutual_neighbor_graph_separates_unrelated_topics() {
        let vectors = vec![
            normalized(&[1.0, 0.00, 0.0]),
            normalized(&[0.99, 0.03, 0.0]),
            normalized(&[0.97, 0.08, 0.0]),
            normalized(&[0.0, 1.0, 0.00]),
            normalized(&[0.0, 0.99, 0.03]),
            normalized(&[0.0, 0.97, 0.08]),
        ];
        let communities = build_topic_communities(&vectors, 0.72);
        let mut sizes = communities
            .iter()
            .map(|community| community.members.len())
            .collect::<Vec<_>>();
        sizes.sort_unstable();
        assert_eq!(sizes, vec![3, 3]);
    }

    #[test]
    fn topic_assignment_does_not_fill_with_unrelated_notes() {
        let vectors = vec![
            normalized(&[1.0, 0.0]),
            normalized(&[0.99, 0.03]),
            normalized(&[0.96, 0.08]),
            normalized(&[0.0, 1.0]),
        ];
        let profile =
            build_assignment_profile(&[0, 1], &normalized(&[1.0, 0.0]), &vectors, 0.72).unwrap();
        let assignments = assign_competitively(&[profile], &vectors);
        assert_eq!(assignments[0], vec![0, 1, 2]);
    }

    #[test]
    fn local_refinement_drops_remote_assignment_tail() {
        let vectors = vec![
            normalized(&[1.0, 0.0, 0.0]),
            normalized(&[0.99, 0.03, 0.0]),
            normalized(&[0.97, 0.08, 0.0]),
            normalized(&[0.75, 0.66, 0.0]),
            normalized(&[0.0, 1.0, 0.0]),
        ];
        let profile = build_assignment_profile(&[0, 1, 2], &vectors[0], &vectors, 0.60).unwrap();
        let refined = refine_assignment_locally(&profile, &[0, 1, 2, 3, 4], &vectors, 4);
        assert!(refined.contains(&0));
        assert!(refined.contains(&1));
        assert!(refined.contains(&2));
        assert!(!refined.contains(&4));
    }

    #[test]
    fn competitive_assignment_caps_ambiguous_membership_to_two_topics() {
        let vectors = vec![
            normalized(&[1.0, 0.0, 0.0]),
            normalized(&[0.0, 1.0, 0.0]),
            normalized(&[0.0, 0.0, 1.0]),
            normalized(&[0.72, 0.69, 0.0]),
        ];
        let profiles = vec![
            build_assignment_profile(&[0], &vectors[0], &vectors, 0.45).unwrap(),
            build_assignment_profile(&[1], &vectors[1], &vectors, 0.45).unwrap(),
            build_assignment_profile(&[2], &vectors[2], &vectors, 0.45).unwrap(),
        ];
        let assignments = assign_competitively(&profiles, &vectors);
        let memberships = assignments
            .iter()
            .filter(|members| members.contains(&3))
            .count();
        assert!(memberships <= 2);
    }
}

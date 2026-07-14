use crate::extraction::{StructuredModelRequest, StructuredTask};
use crate::model::{DocumentSnapshot, KnowledgeChunk};
use serde::{de::Error as _, Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WikiDraftStatus {
    Proposed,
    Accepted,
    Rejected,
    Outdated,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WikiSourceChunk {
    pub document_path: String,
    pub document_title: String,
    pub chunk_id: String,
    pub heading: String,
    pub start_offset: usize,
    pub end_offset: usize,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WikiSynthesis {
    pub title: String,
    #[serde(default, deserialize_with = "deserialize_claims")]
    pub summary: Vec<WikiClaim>,
    #[serde(default)]
    pub sections: Vec<WikiSection>,
    #[serde(
        default,
        alias = "relatedWikis",
        deserialize_with = "deserialize_strings"
    )]
    pub related_wikis: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WikiSection {
    pub heading: String,
    #[serde(default, deserialize_with = "deserialize_claims")]
    pub claims: Vec<WikiClaim>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WikiClaim {
    pub text: String,
    #[serde(default, alias = "citationChunkIds", alias = "citations")]
    pub citation_chunk_ids: Vec<String>,
}

fn strings_from_value(value: &Value) -> Vec<String> {
    match value {
        Value::String(value) => vec![value.trim().to_string()],
        Value::Array(values) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

fn extract_inline_citations(text: &str) -> (String, Vec<String>) {
    let mut citations = Vec::new();
    let mut cursor = text;
    while let Some(start) = cursor.find("[chunk-") {
        let after = &cursor[start + 1..];
        let Some(end) = after.find(']') else {
            break;
        };
        let candidate = &after[..end];
        if candidate
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
        {
            citations.push(candidate.to_string());
        }
        cursor = &after[end + 1..];
    }
    citations.sort();
    citations.dedup();
    let mut cleaned = text.to_string();
    for citation in &citations {
        cleaned = cleaned.replace(&format!("[{citation}]"), "");
    }
    (
        cleaned.split_whitespace().collect::<Vec<_>>().join(" "),
        citations,
    )
}

fn claims_from_value(value: &Value) -> Result<Vec<WikiClaim>, String> {
    match value {
        Value::Null => Ok(Vec::new()),
        Value::String(text) => {
            let (text, citation_chunk_ids) = extract_inline_citations(text);
            Ok(vec![WikiClaim {
                text,
                citation_chunk_ids,
            }])
        }
        Value::Array(values) => {
            let mut claims = Vec::new();
            for value in values {
                claims.extend(claims_from_value(value)?);
            }
            Ok(claims)
        }
        Value::Object(object) => {
            let raw_text = ["text", "claim", "content", "summary"]
                .iter()
                .find_map(|key| object.get(*key).and_then(Value::as_str))
                .unwrap_or("");
            let mut citation_chunk_ids = ["citation_chunk_ids", "citationChunkIds", "citations"]
                .iter()
                .find_map(|key| object.get(*key))
                .map(strings_from_value)
                .unwrap_or_default();
            let (text, inline) = extract_inline_citations(raw_text);
            if citation_chunk_ids.is_empty() {
                citation_chunk_ids = inline;
            }
            Ok(vec![WikiClaim {
                text,
                citation_chunk_ids,
            }])
        }
        _ => Err("Wiki claims must be a string, object, or array.".into()),
    }
}

fn deserialize_claims<'de, D>(deserializer: D) -> Result<Vec<WikiClaim>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    claims_from_value(&value).map_err(D::Error::custom)
}

fn deserialize_strings<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    Ok(strings_from_value(&value))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WikiValidation {
    pub valid: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WikiCitation {
    pub key: String,
    pub document_path: String,
    pub document_title: String,
    pub chunk_id: String,
    pub heading: String,
    pub start_offset: usize,
    pub end_offset: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RenderedWiki {
    pub title: String,
    pub slug: String,
    pub markdown: String,
    pub citations: Vec<WikiCitation>,
    pub source_paths: Vec<String>,
    pub source_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WikiDraft {
    pub id: String,
    pub topic: String,
    pub title: String,
    pub slug: String,
    pub markdown: String,
    pub citations: Vec<WikiCitation>,
    pub source_paths: Vec<String>,
    pub source_hash: String,
    pub model_id: String,
    pub status: WikiDraftStatus,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn collect_wiki_sources(documents: &[DocumentSnapshot]) -> Vec<WikiSourceChunk> {
    let mut sources = Vec::new();
    for document in documents {
        let headings = document
            .sections
            .iter()
            .map(|section| (section.id.as_str(), section.heading.as_str()))
            .collect::<HashMap<_, _>>();
        for chunk in &document.chunks {
            sources.push(source_from_chunk(document, chunk, &headings));
        }
    }
    sources
}

fn source_from_chunk(
    document: &DocumentSnapshot,
    chunk: &KnowledgeChunk,
    headings: &HashMap<&str, &str>,
) -> WikiSourceChunk {
    WikiSourceChunk {
        document_path: document.relative_path.clone(),
        document_title: document.title.clone(),
        chunk_id: chunk.id.clone(),
        heading: headings
            .get(chunk.section_id.as_str())
            .copied()
            .unwrap_or(document.title.as_str())
            .to_string(),
        start_offset: chunk.start_offset,
        end_offset: chunk.end_offset,
        text: chunk.text.clone(),
    }
}

pub fn build_wiki_synthesis_request(
    topic: &str,
    requested_title: Option<&str>,
    sources: &[WikiSourceChunk],
    max_sections: usize,
) -> StructuredModelRequest {
    let source_text = sources
        .iter()
        .map(|source| {
            format!(
                "<source chunk_id=\"{}\" document=\"{}\" heading=\"{}\">\n{}\n</source>",
                source.chunk_id, source.document_path, source.heading, source.text
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    let schema = r#"{
  "title": "Short wiki title",
  "summary": [
    { "text": "One factual summary claim.", "citation_chunk_ids": ["chunk-id-from-sources"] }
  ],
  "sections": [
    {
      "heading": "Section heading",
      "claims": [
        { "text": "One factual section claim.", "citation_chunk_ids": ["chunk-id-from-sources"] }
      ]
    }
  ],
  "related_wikis": ["Related concept"]
}"#;
    StructuredModelRequest {
        task: StructuredTask::WriteWikiSection,
        system_prompt: format!(
            "You write a long-form, rigorous encyclopedia article from the supplied personal notes and, when the web-search tool is available, current reliable web research. Return exactly one JSON object and no prose or Markdown fences. The object must use this exact shape:
{schema}
Write an evidence-driven reference page for this specific vault, not a generic encyclopedia dump. The supplied notes are the primary evidence: identify their recurring ideas, concrete examples, decisions, disagreements and gaps, and exclude notes that only match by a weak keyword or incidental phrase. Use web research only to verify definitions, dates and important external context. Build a concise but substantial introduction and only the sections that materially improve understanding, up to {max_sections}; for broad topics prefer 8–14 sections with 2–5 dense paragraph-length claims each. Do not mechanically enumerate every possible application, risk or historical milestone. Avoid filler, repetition, marketing language, unsupported generalities and invented precision. Every summary and section claim must be an object with text and citation_chunk_ids; summary is always an array, never a string. Claims grounded in the vault cite one or more supplied chunk IDs. Claims grounded in web research cite one or more exact absolute HTTPS URLs returned by web search in citation_chunk_ids. Never invent a chunk ID or URL. Do not place citation markers inside text. related_wikis contains only short concept names; the renderer will keep them non-clickable until a matching Wiki actually exists."
        ),
        user_prompt: format!(
            "Topic: {}\nRequested title: {}\n\nSources:\n{}",
            topic.trim(),
            requested_title.unwrap_or("").trim(),
            source_text
        ),
        json_schema_name: "elephantnote_wiki_synthesis_v1".into(),
        max_output_tokens: 24_576,
    }
}

impl WikiSynthesis {
    pub fn validate(&self, sources: &[WikiSourceChunk], max_sections: usize) -> WikiValidation {
        let mut errors = Vec::new();
        if self.title.trim().is_empty() {
            errors.push("Wiki title cannot be empty.".into());
        }
        if self.title.chars().count() > 200 {
            errors.push("Wiki title exceeds 200 characters.".into());
        }
        if self.summary.is_empty() {
            errors.push("Wiki summary must contain at least one cited claim.".into());
        }
        if self.sections.len() > max_sections {
            errors.push(format!(
                "Wiki contains {} sections; the configured maximum is {max_sections}.",
                self.sections.len()
            ));
        }
        let allowed_chunks = sources
            .iter()
            .map(|source| source.chunk_id.as_str())
            .collect::<HashSet<_>>();
        let mut headings = HashSet::new();
        validate_claims("Summary", &self.summary, &allowed_chunks, &mut errors);
        for (index, section) in self.sections.iter().enumerate() {
            let heading = section.heading.trim();
            if heading.is_empty() {
                errors.push(format!("Wiki section {index} has an empty heading."));
            }
            let normalized = heading.to_lowercase();
            if !headings.insert(normalized) {
                errors.push(format!("Wiki section heading is duplicated: {heading}."));
            }
            if section.claims.is_empty() {
                errors.push(format!("Wiki section `{heading}` contains no claims."));
            }
            validate_claims(heading, &section.claims, &allowed_chunks, &mut errors);
        }

        let mut related = HashSet::new();
        for value in &self.related_wikis {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                errors.push("Related wiki names cannot be empty.".into());
            }
            if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
                errors.push(format!("Invalid related wiki name: {trimmed}."));
            }
            if !related.insert(trimmed.to_lowercase()) {
                errors.push(format!("Related wiki is duplicated: {trimmed}."));
            }
        }

        WikiValidation {
            valid: errors.is_empty(),
            errors,
        }
    }
}

fn is_web_citation(value: &str) -> bool {
    value.starts_with("https://")
        && !value
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
}

fn validate_claims(
    section: &str,
    claims: &[WikiClaim],
    allowed_chunks: &HashSet<&str>,
    errors: &mut Vec<String>,
) {
    let mut seen = HashSet::new();
    for (index, claim) in claims.iter().enumerate() {
        let text = claim.text.trim();
        if text.is_empty() {
            errors.push(format!("Claim {index} in `{section}` is empty."));
        }
        if !seen.insert(text.to_lowercase()) {
            errors.push(format!("Duplicate claim in `{section}`: {text}."));
        }
        if claim.citation_chunk_ids.is_empty() {
            errors.push(format!(
                "Claim {index} in `{section}` must cite at least one source chunk."
            ));
        }
        for chunk_id in &claim.citation_chunk_ids {
            if !allowed_chunks.contains(chunk_id.as_str()) && !is_web_citation(chunk_id) {
                errors.push(format!(
                    "Claim {index} in `{section}` cites an unknown chunk or invalid web URL: {chunk_id}."
                ));
            }
        }
    }
}

fn shared_prefix_length(left: &str, right: &str) -> usize {
    left.bytes()
        .zip(right.bytes())
        .take_while(|(left, right)| left == right)
        .count()
}

fn recover_chunk_id(candidate: &str, allowed: &[String]) -> Option<String> {
    if allowed.iter().any(|value| value == candidate) {
        return Some(candidate.to_string());
    }
    if let Some(value) = allowed
        .iter()
        .find(|value| candidate.contains(value.as_str()) || value.contains(candidate))
    {
        return Some(value.clone());
    }
    allowed
        .iter()
        .map(|value| (shared_prefix_length(candidate, value), value))
        .max_by_key(|(prefix, _)| *prefix)
        .filter(|(prefix, _)| *prefix >= 18)
        .map(|(_, value)| value.clone())
}

fn normalize_claim_citations(claims: &mut [WikiClaim], allowed: &[String]) {
    for claim in claims {
        let mut normalized = Vec::new();
        for candidate in &claim.citation_chunk_ids {
            if let Some(chunk_id) = recover_chunk_id(candidate, allowed) {
                if !normalized.contains(&chunk_id) {
                    normalized.push(chunk_id);
                }
            } else {
                normalized.push(candidate.clone());
            }
        }
        claim.citation_chunk_ids = normalized;
    }
}

fn normalize_synthesis_citations(synthesis: &mut WikiSynthesis, sources: &[WikiSourceChunk]) {
    let allowed = sources
        .iter()
        .map(|source| source.chunk_id.clone())
        .collect::<Vec<_>>();
    normalize_claim_citations(&mut synthesis.summary, &allowed);
    for section in &mut synthesis.sections {
        normalize_claim_citations(&mut section.claims, &allowed);
    }
}

pub fn parse_and_render_wiki(
    response_json: &str,
    topic: &str,
    sources: &[WikiSourceChunk],
    max_sections: usize,
) -> Result<RenderedWiki, String> {
    let mut synthesis: WikiSynthesis = serde_json::from_str(response_json)
        .map_err(|error| format!("Invalid wiki synthesis JSON: {error}"))?;
    normalize_synthesis_citations(&mut synthesis, sources);
    let validation = synthesis.validate(sources, max_sections);
    if !validation.valid {
        return Err(validation.errors.join(" "));
    }
    render_wiki(&synthesis, topic, sources)
}

pub fn render_wiki(
    synthesis: &WikiSynthesis,
    topic: &str,
    sources: &[WikiSourceChunk],
) -> Result<RenderedWiki, String> {
    let source_by_id = sources
        .iter()
        .map(|source| (source.chunk_id.as_str(), source))
        .collect::<HashMap<_, _>>();
    let mut citation_numbers = BTreeMap::<String, usize>::new();
    let mut web_citations = BTreeSet::<String>::new();
    let mut markdown = String::new();
    markdown.push_str("---\n");
    markdown.push_str("generated: true\n");
    markdown.push_str("generator: elephantnote-knowledge-core\n");
    markdown.push_str(&format!("topic: {}\n", yaml_scalar(topic)));
    markdown.push_str("---\n\n");
    markdown.push_str(&format!("# {}\n\n", synthesis.title.trim()));

    render_claims(
        &mut markdown,
        &synthesis.summary,
        &mut citation_numbers,
        &source_by_id,
        &mut web_citations,
    )?;
    for section in &synthesis.sections {
        markdown.push_str(&format!("\n## {}\n\n", section.heading.trim()));
        render_claims(
            &mut markdown,
            &section.claims,
            &mut citation_numbers,
            &source_by_id,
            &mut web_citations,
        )?;
    }

    if !synthesis.related_wikis.is_empty() {
        markdown.push_str(
            "
## Related wikis

",
        );
        for related in &synthesis.related_wikis {
            markdown.push_str(&format!(
                "- {}
",
                related.trim()
            ));
        }
    }

    let mut citations = Vec::new();
    if !citation_numbers.is_empty() {
        markdown.push_str(
            "
## Sources

",
        );
        let mut numbered = citation_numbers.iter().collect::<Vec<_>>();
        numbered.sort_by_key(|(_, number)| **number);
        for (chunk_id, number) in numbered {
            let source = source_by_id
                .get(chunk_id.as_str())
                .ok_or_else(|| format!("Missing source chunk while rendering: {chunk_id}"))?;
            let key = format!("source-{number}");
            markdown.push_str(&format!(
                "- [{} — {}]({})
",
                source.document_title,
                source.heading,
                markdown_note_target(source)
            ));
            citations.push(WikiCitation {
                key,
                document_path: source.document_path.clone(),
                document_title: source.document_title.clone(),
                chunk_id: source.chunk_id.clone(),
                heading: source.heading.clone(),
                start_offset: source.start_offset,
                end_offset: source.end_offset,
            });
        }
    }

    if !web_citations.is_empty() {
        markdown.push_str("\n## Web sources\n\n");
        for url in &web_citations {
            markdown.push_str(&format!("- [{}]({})\n", web_citation_label(url), url));
        }
    }

    let slug = slugify(&synthesis.title);
    let mut source_paths = sources
        .iter()
        .map(|source| source.document_path.clone())
        .collect::<Vec<_>>();
    source_paths.sort();
    source_paths.dedup();
    let source_hash = source_hash(sources);
    Ok(RenderedWiki {
        title: synthesis.title.trim().to_string(),
        slug,
        markdown,
        citations,
        source_paths,
        source_hash,
    })
}

fn markdown_link_component(value: &str) -> String {
    let mut output = String::new();
    for character in value.chars() {
        match character {
            ' ' => output.push_str("%20"),
            '(' => output.push_str("%28"),
            ')' => output.push_str("%29"),
            '#' => output.push_str("%23"),
            '%' => output.push_str("%25"),
            _ => output.push(character),
        }
    }
    output
}

fn markdown_heading_anchor(value: &str) -> String {
    let mut output = String::new();
    let mut pending_dash = false;
    for character in value.trim().to_lowercase().chars() {
        if character.is_alphanumeric() {
            if pending_dash && !output.is_empty() {
                output.push('-');
            }
            output.push(character);
            pending_dash = false;
        } else if !output.is_empty() {
            pending_dash = true;
        }
    }
    output
}

fn markdown_note_target(source: &WikiSourceChunk) -> String {
    let path = markdown_link_component(&source.document_path);
    let anchor = markdown_heading_anchor(&source.heading);
    if anchor.is_empty() {
        format!("../../{path}")
    } else {
        format!("../../{path}#{anchor}")
    }
}

fn citation_label(source: &WikiSourceChunk) -> String {
    let heading = source.heading.trim();
    let title = source.document_title.trim();
    let value = if !heading.is_empty() && !heading.eq_ignore_ascii_case(title) {
        heading
    } else if !title.is_empty() {
        title
    } else {
        "Source"
    };
    value.chars().take(72).collect()
}

fn humanize_url_segment(value: &str) -> String {
    value
        .trim_matches('/')
        .split(|character: char| matches!(character, '-' | '_' | '+'))
        .filter(|part| !part.is_empty())
        .map(|part| {
            let decoded = part.replace("%20", " ");
            let mut characters = decoded.chars();
            characters
                .next()
                .map(|first| first.to_uppercase().collect::<String>() + characters.as_str())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn web_citation_label(url: &str) -> String {
    let without_scheme = url.strip_prefix("https://").unwrap_or(url);
    let mut parts = without_scheme.splitn(2, '/');
    let host = parts.next().unwrap_or("").trim_start_matches("www.");
    let path = parts.next().unwrap_or("");
    let provider = if host.contains("wikipedia.org") {
        "Wikipedia".to_string()
    } else if host.contains("nist.gov") {
        "NIST".to_string()
    } else if host.contains("stanford.edu") {
        "Stanford".to_string()
    } else if host.contains("ibm.com") {
        "IBM".to_string()
    } else if host.contains("arxiv.org") {
        "arXiv".to_string()
    } else {
        host.split('.')
            .next()
            .map(humanize_url_segment)
            .unwrap_or_else(|| "Web".into())
    };
    let last = path
        .split(['?', '#'])
        .next()
        .unwrap_or("")
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("");
    let title = humanize_url_segment(last);
    if title.is_empty() || title.chars().all(|character| character.is_ascii_digit()) {
        provider
    } else {
        format!("{provider} — {title}")
    }
}

fn render_claims(
    markdown: &mut String,
    claims: &[WikiClaim],
    citation_numbers: &mut BTreeMap<String, usize>,
    source_by_id: &HashMap<&str, &WikiSourceChunk>,
    web_citations: &mut BTreeSet<String>,
) -> Result<(), String> {
    for claim in claims {
        let mut references = Vec::new();
        for chunk_id in &claim.citation_chunk_ids {
            if is_web_citation(chunk_id) {
                web_citations.insert(chunk_id.clone());
                references.push(format!("[{}]({chunk_id})", web_citation_label(chunk_id)));
                continue;
            }
            let source = source_by_id
                .get(chunk_id.as_str())
                .ok_or_else(|| format!("Unknown source chunk while rendering: {chunk_id}"))?;
            let next = citation_numbers.len() + 1;
            citation_numbers.entry(chunk_id.clone()).or_insert(next);
            references.push(format!(
                "[{}]({})",
                citation_label(source),
                markdown_note_target(source)
            ));
        }
        references.sort();
        references.dedup();
        markdown.push_str(claim.text.trim());
        if !references.is_empty() {
            markdown.push(' ');
            markdown.push_str(&references.join(" "));
        }
        markdown.push_str(
            "

",
        );
    }
    Ok(())
}

pub fn wiki_draft_from_rendered(
    topic: &str,
    rendered: RenderedWiki,
    model_id: &str,
    timestamp: i64,
) -> WikiDraft {
    let mut hasher = blake3::Hasher::new();
    hasher.update(b"wiki-draft");
    hasher.update(&[0]);
    hasher.update(topic.as_bytes());
    hasher.update(&[0]);
    hasher.update(rendered.source_hash.as_bytes());
    hasher.update(&[0]);
    hasher.update(rendered.markdown.as_bytes());
    let hex = hasher.finalize().to_hex().to_string();
    WikiDraft {
        id: format!("wiki-{}", &hex[..24]),
        topic: topic.trim().to_string(),
        title: rendered.title,
        slug: rendered.slug,
        markdown: rendered.markdown,
        citations: rendered.citations,
        source_paths: rendered.source_paths,
        source_hash: rendered.source_hash,
        model_id: model_id.to_string(),
        status: WikiDraftStatus::Proposed,
        created_at: timestamp,
        updated_at: timestamp,
    }
}

pub fn source_hash(sources: &[WikiSourceChunk]) -> String {
    let mut sorted = sources.to_vec();
    sorted.sort_by(|left, right| left.chunk_id.cmp(&right.chunk_id));
    let mut hasher = blake3::Hasher::new();
    hasher.update(b"wiki-sources");
    for source in sorted {
        hasher.update(&[0]);
        hasher.update(source.document_path.as_bytes());
        hasher.update(&[0]);
        hasher.update(source.chunk_id.as_bytes());
        hasher.update(&[0]);
        hasher.update(source.text.as_bytes());
    }
    hasher.finalize().to_hex().to_string()
}

pub fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut pending_dash = false;
    for character in value.trim().chars() {
        if character.is_alphanumeric() {
            if pending_dash && !slug.is_empty() {
                slug.push('-');
            }
            for lower in character.to_lowercase() {
                slug.push(lower);
            }
            pending_dash = false;
        } else {
            pending_dash = true;
        }
    }
    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        "wiki".into()
    } else {
        slug.chars().take(120).collect()
    }
}

fn yaml_scalar(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chunking::analyze_markdown;

    fn sources() -> Vec<WikiSourceChunk> {
        let documents = vec![
            analyze_markdown(
                "Notes/Iroh.md",
                "# Iroh\n\nIroh attempts direct peer-to-peer connections and can use relays.",
                1,
            ),
            analyze_markdown(
                "Notes/Sync.md",
                "# Sync\n\nElephantNote uses Iroh as its synchronization transport.",
                1,
            ),
        ];
        collect_wiki_sources(&documents)
    }

    #[test]
    fn web_citation_labels_are_human_readable() {
        assert_eq!(
            web_citation_label("https://en.wikipedia.org/wiki/Machine_learning"),
            "Wikipedia — Machine Learning"
        );
        assert!(
            web_citation_label("https://airc.nist.gov/airmf-resources/airmf/0-ai-rmf-1-0/")
                .starts_with("NIST")
        );
    }

    #[test]
    fn rejects_uncited_or_unknown_claims() {
        let sources = sources();
        let synthesis = WikiSynthesis {
            title: "Iroh".into(),
            summary: vec![WikiClaim {
                text: "Unsupported claim".into(),
                citation_chunk_ids: vec!["missing".into()],
            }],
            sections: Vec::new(),
            related_wikis: Vec::new(),
        };
        let validation = synthesis.validate(&sources, 8);
        assert!(!validation.valid);
        assert!(validation
            .errors
            .iter()
            .any(|error| error.contains("unknown chunk")));
    }

    #[test]
    fn renders_navigable_markdown_links_from_structured_claims() {
        let sources = sources();
        let synthesis = WikiSynthesis {
            title: "Iroh synchronization".into(),
            summary: vec![WikiClaim {
                text: "Iroh supports direct peer-to-peer connectivity with relay fallback.".into(),
                citation_chunk_ids: vec![sources[0].chunk_id.clone()],
            }],
            sections: vec![WikiSection {
                heading: "Use in ElephantNote".into(),
                claims: vec![WikiClaim {
                    text: "ElephantNote uses Iroh as its synchronization transport.".into(),
                    citation_chunk_ids: vec![sources[1].chunk_id.clone()],
                }],
            }],
            related_wikis: vec!["Peer-to-peer networking".into()],
        };
        let rendered = render_wiki(&synthesis, "Iroh", &sources).unwrap();
        assert!(rendered.markdown.contains("generated: true"));
        assert!(rendered.markdown.contains("[Iroh](../../Notes/Iroh.md"));
        assert!(rendered.markdown.contains("- Peer-to-peer networking"));
        assert!(!rendered.markdown.contains("./peer-to-peer-networking.md"));
        assert_eq!(rendered.citations.len(), 2);
    }

    #[test]
    fn accepts_string_summary_with_inline_chunk_citations() {
        let sources = sources();
        let response = serde_json::json!({
            "title": "Iroh",
            "summary": format!("Iroh provides connectivity. [{}]", sources[0].chunk_id),
            "sections": [],
            "related_wikis": []
        })
        .to_string();
        let rendered = parse_and_render_wiki(&response, "Iroh", &sources, 8).unwrap();
        assert!(rendered.markdown.contains("Iroh provides connectivity."));
        assert_eq!(rendered.citations.len(), 1);
    }

    #[test]
    fn output_is_stable_for_same_sources_and_synthesis() {
        let sources = sources();
        let synthesis = WikiSynthesis {
            title: "Iroh".into(),
            summary: vec![WikiClaim {
                text: "Iroh provides connectivity.".into(),
                citation_chunk_ids: vec![sources[0].chunk_id.clone()],
            }],
            sections: Vec::new(),
            related_wikis: Vec::new(),
        };
        let first = render_wiki(&synthesis, "Iroh", &sources).unwrap();
        let second = render_wiki(&synthesis, "Iroh", &sources).unwrap();
        assert_eq!(first, second);
        assert_eq!(
            slugify("  Iroh & Synchronisation  "),
            "iroh-synchronisation"
        );
    }
}

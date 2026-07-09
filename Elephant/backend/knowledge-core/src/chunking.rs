use crate::model::{DocumentSnapshot, ExplicitLink, KnowledgeChunk, KnowledgeSection};
use std::path::Path;

const TARGET_CHUNK_CHARS: usize = 2_400;
const MAX_CHUNK_CHARS: usize = 3_600;

#[derive(Debug, Clone)]
struct HeadingMarker {
    start: usize,
    level: u8,
    heading: String,
}

#[derive(Debug, Clone)]
struct TextBlock {
    start: usize,
    end: usize,
}

pub fn analyze_markdown(relative_path: &str, markdown: &str, modified_at: i64) -> DocumentSnapshot {
    let content_hash = blake3::hash(markdown.as_bytes()).to_hex().to_string();
    let title = extract_title(relative_path, markdown);
    let sections = extract_sections(relative_path, markdown, &title);
    let chunks = chunk_sections(relative_path, markdown, &sections);
    let explicit_links = extract_wikilinks(markdown);

    DocumentSnapshot {
        relative_path: normalize_relative_path(relative_path),
        title,
        content_hash,
        modified_at,
        sections,
        chunks,
        explicit_links,
    }
}

fn normalize_relative_path(value: &str) -> String {
    value.replace('\\', "/").trim_start_matches('/').to_string()
}

fn extract_title(relative_path: &str, markdown: &str) -> String {
    if let Some(title) = frontmatter_title(markdown) {
        return title;
    }
    for line in markdown.lines() {
        if let Some((1, heading)) = parse_heading(line) {
            if !heading.is_empty() {
                return heading;
            }
        }
    }
    Path::new(relative_path)
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Untitled")
        .to_string()
}

fn frontmatter_title(markdown: &str) -> Option<String> {
    let mut lines = markdown.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }
    for line in lines {
        let trimmed = line.trim();
        if trimmed == "---" {
            break;
        }
        if let Some(value) = trimmed.strip_prefix("title:") {
            let title = value.trim().trim_matches(['\'', '"']).trim();
            if !title.is_empty() {
                return Some(title.to_string());
            }
        }
    }
    None
}

fn parse_heading(line: &str) -> Option<(u8, String)> {
    let trimmed = line.trim_start();
    let level = trimmed.chars().take_while(|character| *character == '#').count();
    if !(1..=6).contains(&level) {
        return None;
    }
    let rest = trimmed.get(level..)?;
    if !rest.starts_with(char::is_whitespace) {
        return None;
    }
    let heading = rest.trim().trim_end_matches('#').trim().to_string();
    Some((level as u8, heading))
}

fn extract_sections(relative_path: &str, markdown: &str, document_title: &str) -> Vec<KnowledgeSection> {
    let mut markers = Vec::new();
    let mut offset = 0usize;
    let mut fence: Option<char> = None;

    for line in markdown.split_inclusive('\n') {
        let trimmed = line.trim_start();
        if let Some(marker) = fence_marker(trimmed) {
            match fence {
                Some(active) if active == marker => fence = None,
                None => fence = Some(marker),
                _ => {}
            }
        } else if fence.is_none() {
            if let Some((level, heading)) = parse_heading(line.trim_end_matches(['\r', '\n'])) {
                markers.push(HeadingMarker { start: offset, level, heading });
            }
        }
        offset += line.len();
    }

    if markers.is_empty() {
        return vec![make_section(relative_path, document_title, 0, 0, markdown.len(), 0)];
    }

    let mut sections = Vec::new();
    if markers[0].start > 0 && !markdown[..markers[0].start].trim().is_empty() {
        sections.push(make_section(relative_path, document_title, 0, 0, markers[0].start, 0));
    }

    for (index, marker) in markers.iter().enumerate() {
        let end = markers.get(index + 1).map(|next| next.start).unwrap_or(markdown.len());
        sections.push(make_section(
            relative_path,
            &marker.heading,
            marker.level,
            marker.start,
            end,
            sections.len(),
        ));
    }
    sections
}

fn make_section(relative_path: &str, heading: &str, level: u8, start: usize, end: usize, ordinal: usize) -> KnowledgeSection {
    let id = stable_id("section", &[relative_path, &start.to_string(), &end.to_string(), heading]);
    KnowledgeSection {
        id,
        heading: heading.to_string(),
        level,
        ordinal,
        start_offset: start,
        end_offset: end,
    }
}

fn fence_marker(trimmed: &str) -> Option<char> {
    if trimmed.starts_with("```") {
        Some('`')
    } else if trimmed.starts_with("~~~") {
        Some('~')
    } else {
        None
    }
}

fn chunk_sections(relative_path: &str, markdown: &str, sections: &[KnowledgeSection]) -> Vec<KnowledgeChunk> {
    let mut chunks = Vec::new();
    for section in sections {
        let blocks = extract_blocks(markdown, section.start_offset, section.end_offset);
        let packed = pack_blocks(markdown, &blocks);
        for (start, end) in packed {
            if start >= end || end > markdown.len() {
                continue;
            }
            let text = markdown[start..end].trim().to_string();
            if text.is_empty() {
                continue;
            }
            let content_hash = blake3::hash(text.as_bytes()).to_hex().to_string();
            let id = stable_id("chunk", &[relative_path, &start.to_string(), &end.to_string(), &content_hash]);
            let token_estimate = (text.chars().count() + 3) / 4;
            chunks.push(KnowledgeChunk {
                id,
                section_id: section.id.clone(),
                ordinal: chunks.len(),
                start_offset: start,
                end_offset: end,
                token_estimate,
                content_hash,
                text,
            });
        }
    }
    chunks
}

fn extract_blocks(markdown: &str, start: usize, end: usize) -> Vec<TextBlock> {
    let slice = &markdown[start..end];
    let mut blocks = Vec::new();
    let mut block_start: Option<usize> = None;
    let mut cursor = start;
    let mut fence: Option<char> = None;

    for line in slice.split_inclusive('\n') {
        let line_start = cursor;
        let line_end = cursor + line.len();
        let trimmed = line.trim();
        if block_start.is_none() && !trimmed.is_empty() {
            block_start = Some(line_start);
        }
        if let Some(marker) = fence_marker(line.trim_start()) {
            match fence {
                Some(active) if active == marker => fence = None,
                None => fence = Some(marker),
                _ => {}
            }
        }
        if fence.is_none() && trimmed.is_empty() {
            if let Some(begin) = block_start.take() {
                if begin < line_start {
                    blocks.push(TextBlock { start: begin, end: line_start });
                }
            }
        } else if fence.is_none() && parse_heading(line.trim_end_matches(['\r', '\n'])).is_some() {
            if let Some(begin) = block_start.take() {
                blocks.push(TextBlock { start: begin, end: line_end });
            }
        }
        cursor = line_end;
    }
    if let Some(begin) = block_start {
        blocks.push(TextBlock { start: begin, end });
    }
    blocks
}

fn pack_blocks(markdown: &str, blocks: &[TextBlock]) -> Vec<(usize, usize)> {
    let mut packed = Vec::new();
    let mut current: Option<(usize, usize)> = None;

    for block in blocks {
        if block.end <= block.start {
            continue;
        }
        if markdown[block.start..block.end].chars().count() > MAX_CHUNK_CHARS {
            if let Some(value) = current.take() {
                packed.push(value);
            }
            packed.extend(split_large_block(markdown, block.start, block.end));
            continue;
        }

        match current {
            None => current = Some((block.start, block.end)),
            Some((start, end)) => {
                let combined_chars = markdown[start..block.end].chars().count();
                if combined_chars > TARGET_CHUNK_CHARS && markdown[start..end].chars().count() >= TARGET_CHUNK_CHARS / 2 {
                    packed.push((start, end));
                    current = Some((block.start, block.end));
                } else if combined_chars > MAX_CHUNK_CHARS {
                    packed.push((start, end));
                    current = Some((block.start, block.end));
                } else {
                    current = Some((start, block.end));
                }
            }
        }
    }
    if let Some(value) = current {
        packed.push(value);
    }
    packed
}

fn split_large_block(markdown: &str, start: usize, end: usize) -> Vec<(usize, usize)> {
    let mut result = Vec::new();
    let mut chunk_start = start;
    let mut last_break = start;
    let mut chars = 0usize;

    for (relative, character) in markdown[start..end].char_indices() {
        let absolute = start + relative;
        chars += 1;
        if character == '\n' || character == '.' || character == '!' || character == '?' {
            last_break = absolute + character.len_utf8();
        }
        if chars >= MAX_CHUNK_CHARS {
            let split = if last_break > chunk_start { last_break } else { absolute + character.len_utf8() };
            result.push((chunk_start, split));
            chunk_start = split;
            last_break = split;
            chars = 0;
        }
    }
    if chunk_start < end {
        result.push((chunk_start, end));
    }
    result
}

fn extract_wikilinks(markdown: &str) -> Vec<ExplicitLink> {
    let mut links = Vec::new();
    let mut cursor = 0usize;
    while let Some(relative_start) = markdown[cursor..].find("[[") {
        let start = cursor + relative_start;
        let content_start = start + 2;
        let Some(relative_end) = markdown[content_start..].find("]]" ) else { break };
        let content_end = content_start + relative_end;
        let raw = markdown[content_start..content_end].trim();
        let (target, label) = raw.split_once('|').map(|(target, label)| (target, label)).unwrap_or((raw, raw));
        let target = target.split('#').next().unwrap_or("").trim();
        if !target.is_empty() {
            links.push(ExplicitLink {
                target: target.to_string(),
                label: label.trim().to_string(),
                start_offset: start,
                end_offset: content_end + 2,
            });
        }
        cursor = content_end + 2;
    }
    links
}

fn stable_id(namespace: &str, parts: &[&str]) -> String {
    let mut hasher = blake3::Hasher::new();
    hasher.update(namespace.as_bytes());
    for part in parts {
        hasher.update(&[0]);
        hasher.update(part.as_bytes());
    }
    format!("{namespace}-{}", &hasher.finalize().to_hex()[..24])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_prefers_frontmatter_then_heading() {
        assert_eq!(extract_title("x.md", "---\ntitle: 'Front'\n---\n# Heading"), "Front");
        assert_eq!(extract_title("x.md", "# Heading\nBody"), "Heading");
        assert_eq!(extract_title("Folder/My note.md", "Body"), "My note");
    }

    #[test]
    fn sections_and_chunks_keep_valid_source_offsets() {
        let markdown = "# Alpha\n\nFirst paragraph.\n\n## Code\n\n```rust\nfn main() {}\n```\n";
        let snapshot = analyze_markdown("Notes/a.md", markdown, 1);
        assert_eq!(snapshot.sections.len(), 2);
        assert!(!snapshot.chunks.is_empty());
        for chunk in snapshot.chunks {
            assert!(chunk.start_offset < chunk.end_offset);
            assert!(chunk.end_offset <= markdown.len());
            assert!(!markdown[chunk.start_offset..chunk.end_offset].trim().is_empty());
        }
    }

    #[test]
    fn fenced_code_is_not_split_on_blank_lines() {
        let markdown = "# Code\n\n```rust\nfn a() {}\n\nfn b() {}\n```\n";
        let snapshot = analyze_markdown("code.md", markdown, 0);
        assert_eq!(snapshot.chunks.len(), 1);
        assert!(snapshot.chunks[0].text.contains("fn a"));
        assert!(snapshot.chunks[0].text.contains("fn b"));
    }

    #[test]
    fn extracts_wikilinks_with_alias_and_fragment() {
        let markdown = "See [[Iroh#Relays|Iroh relays]] and [[CRDT]].";
        let links = extract_wikilinks(markdown);
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].target, "Iroh");
        assert_eq!(links[0].label, "Iroh relays");
        assert_eq!(&markdown[links[0].start_offset..links[0].end_offset], "[[Iroh#Relays|Iroh relays]]");
    }

    #[test]
    fn ids_are_stable_for_same_document() {
        let first = analyze_markdown("a.md", "# A\nBody", 1);
        let second = analyze_markdown("a.md", "# A\nBody", 2);
        assert_eq!(first.sections[0].id, second.sections[0].id);
        assert_eq!(first.chunks[0].id, second.chunks[0].id);
    }
}

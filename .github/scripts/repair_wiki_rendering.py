from pathlib import Path
import re

core = Path('Elephant/backend/knowledge-core/src/wiki_core.rs')
text = core.read_text(encoding='utf-8')

rendered_tail = '''    if !synthesis.related_wikis.is_empty() {
        markdown.push_str("\n## Related wikis\n\n");
        for related in &synthesis.related_wikis {
            markdown.push_str(&format!(
                "- [{}](./{}.md)\n",
                related.trim(),
                slugify(related)
            ));
        }
    }

    let mut citations = Vec::new();
    if !citation_numbers.is_empty() {
        markdown.push_str("\n## Sources\n\n");
        let mut numbered = citation_numbers.iter().collect::<Vec<_>>();
        numbered.sort_by_key(|(_, number)| **number);
        for (chunk_id, number) in numbered {
            let source = source_by_id
                .get(chunk_id.as_str())
                .ok_or_else(|| format!("Missing source chunk while rendering: {chunk_id}"))?;
            let key = format!("source-{number}");
            markdown.push_str(&format!(
                "{}. [{} — {}]({})\n",
                number,
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

'''
text, count = re.subn(
    r'    if !synthesis\.related_wikis\.is_empty\(\) \{.*?\n    let slug = slugify',
    rendered_tail + '    let slug = slugify',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f'Could not replace Wiki rendered tail: {count}')

helpers = '''fn markdown_link_component(value: &str) -> String {
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

fn render_claims(
    markdown: &mut String,
    claims: &[WikiClaim],
    citation_numbers: &mut BTreeMap<String, usize>,
    source_by_id: &HashMap<&str, &WikiSourceChunk>,
) -> Result<(), String> {
    for claim in claims {
        let mut references = Vec::new();
        for chunk_id in &claim.citation_chunk_ids {
            let source = source_by_id
                .get(chunk_id.as_str())
                .ok_or_else(|| format!("Unknown source chunk while rendering: {chunk_id}"))?;
            let next = citation_numbers.len() + 1;
            let number = *citation_numbers.entry(chunk_id.clone()).or_insert(next);
            references.push(format!("[{number}]({})", markdown_note_target(source)));
        }
        references.sort();
        references.dedup();
        markdown.push_str(claim.text.trim());
        if !references.is_empty() {
            markdown.push(' ');
            markdown.push_str(&references.join(" "));
        }
        markdown.push_str("\n\n");
    }
    Ok(())
}

'''
text, count = re.subn(
    r'fn render_claims\(.*?\n\}\n\npub fn wiki_draft_from_rendered',
    helpers + 'pub fn wiki_draft_from_rendered',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f'Could not replace Wiki claim renderer: {count}')
core.write_text(text, encoding='utf-8')

graph = Path('Elephant/backend/knowledge-core/src/wiki_graph_projection.rs')
text = graph.read_text(encoding='utf-8')
parser = '''fn parse_related_wiki_references(markdown: &str) -> Vec<String> {
    let mut in_related_section = false;
    let mut references = Vec::new();
    for line in markdown.lines() {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix("## ") {
            in_related_section = heading.trim().eq_ignore_ascii_case("related wikis");
            continue;
        }
        if !in_related_section {
            continue;
        }
        let mut legacy = trimmed;
        while let Some(start) = legacy.find("[[") {
            let after_start = &legacy[start + 2..];
            let Some(end) = after_start.find("]]" ) else {
                break;
            };
            let raw = &after_start[..end];
            let target = raw
                .split('|')
                .next()
                .unwrap_or(raw)
                .split('#')
                .next()
                .unwrap_or(raw)
                .trim();
            if !target.is_empty() {
                references.push(target.to_string());
            }
            legacy = &after_start[end + 2..];
        }
        let mut standard = trimmed;
        while let Some(open) = standard.find("](") {
            let after_open = &standard[open + 2..];
            let Some(close) = after_open.find(')') else {
                break;
            };
            let target = after_open[..close]
                .split('#')
                .next()
                .unwrap_or("")
                .trim()
                .trim_start_matches("./")
                .trim_end_matches(".md");
            if !target.is_empty() {
                references.push(target.to_string());
            }
            standard = &after_open[close + 1..];
        }
    }
    references.sort();
    references.dedup();
    references
}

'''
text, count = re.subn(
    r'fn parse_related_wiki_references\(.*?\n\}\n\nfn normalize_wiki_reference',
    parser + 'fn normalize_wiki_reference',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f'Could not replace related Wiki parser: {count}')
graph.write_text(text, encoding='utf-8')

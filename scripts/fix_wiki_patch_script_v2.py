from pathlib import Path

path = Path('scripts/apply_wiki_pipeline_v3.py')
text = path.read_text()
old = '''text = regex_once(
    text,
    r'''    let has_legacy_related = markdown\\.lines\\(\\)\\.any\\(\\|line\\| \\{\\n        let trimmed = line\\.trim\\(\\);\\n        trimmed\\.starts_with\\(\\"- \\\\[\\\\[\\"\\) && trimmed\\.ends_with\\(\\"\\\\]\\\\]\\"\\)\\n    \\}\\);''',
    '''    let mut in_related_section = false;
    let has_legacy_related = markdown.lines().any(|line| {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix("## ") {
            in_related_section = heading.trim().eq_ignore_ascii_case("related wikis");
            return false;
        }
        in_related_section
            && ((trimmed.starts_with("- [[") && trimmed.ends_with("]]"))
                || (trimmed.starts_with("- [") && trimmed.contains("](./")))
    });''',
    'detect standard dead related links',
)
'''
new = '''text = replace_once(
    text,
    '''    let has_legacy_related = markdown.lines().any(|line| {
        let trimmed = line.trim();
        trimmed.starts_with("- [[") && trimmed.ends_with("]]" )
    });'''.replace('ends_with("]]" )', 'ends_with("]]" )'),
    '''    let mut in_related_section = false;
    let has_legacy_related = markdown.lines().any(|line| {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix("## ") {
            in_related_section = heading.trim().eq_ignore_ascii_case("related wikis");
            return false;
        }
        in_related_section
            && ((trimmed.starts_with("- [[") && trimmed.ends_with("]]"))
                || (trimmed.starts_with("- [") && trimmed.contains("](./")))
    });''',
    'detect standard dead related links',
)
'''
if old not in text:
    start = text.find("text = regex_once(\n    text,\n    r'''    let has_legacy_related")
    end_marker = "    'detect standard dead related links',\n)\n"
    if start < 0:
        raise SystemExit('related-link patch block start not found')
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit('related-link patch block end not found')
    end += len(end_marker)
    text = text[:start] + new + text[end:]
else:
    text = text.replace(old, new, 1)
path.write_text(text)

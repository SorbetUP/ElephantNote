from pathlib import Path

path = Path('scripts/apply_wiki_pipeline_v3.py')
text = path.read_text()
start = text.find("text = regex_once(\n    text,\n    r'''    let has_legacy_related")
end_marker = "    'detect standard dead related links',\n)\n"
if start < 0:
    raise SystemExit('related-link patch block start not found')
end = text.find(end_marker, start)
if end < 0:
    raise SystemExit('related-link patch block end not found')
end += len(end_marker)
old_source = (
    '    let has_legacy_related = markdown.lines().any(|line| {\n'
    '        let trimmed = line.trim();\n'
    '        trimmed.starts_with("- [[") && trimmed.ends_with("]]" )\n'
    '    });'
).replace('ends_with("]]" )', 'ends_with("]]")')
new_source = (
    '    let mut in_related_section = false;\n'
    '    let has_legacy_related = markdown.lines().any(|line| {\n'
    '        let trimmed = line.trim();\n'
    '        if let Some(heading) = trimmed.strip_prefix("## ") {\n'
    '            in_related_section = heading.trim().eq_ignore_ascii_case("related wikis");\n'
    '            return false;\n'
    '        }\n'
    '        in_related_section\n'
    '            && ((trimmed.starts_with("- [[") && trimmed.ends_with("]]"))\n'
    '                || (trimmed.starts_with("- [") && trimmed.contains("](./")))\n'
    '    });'
)
replacement = (
    'text = replace_once(\n'
    '    text,\n'
    f'    {old_source!r},\n'
    f'    {new_source!r},\n'
    "    'detect standard dead related links',\n"
    ')\n'
)
text = text[:start] + replacement + text[end:]
path.write_text(text)

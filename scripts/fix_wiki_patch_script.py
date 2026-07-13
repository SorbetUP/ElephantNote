from pathlib import Path

path = Path('scripts/apply_wiki_pipeline_v3.py')
text = path.read_text()
old = """text = text.replace(
    '            &source_by_id,\\n        )?;',
    '            &source_by_id,\\n            &mut web_citations,\\n        )?;',
)
if text.count('&mut web_citations') < 2:
    raise SystemExit('render_claims calls were not both updated')
"""
new = """text, render_call_count = re.subn(
    r'(\\s+&source_by_id,\\n)(\\s+\\)\\?;)',
    r'\\1            &mut web_citations,\\n\\2',
    text,
    count=2,
)
if render_call_count != 2:
    raise SystemExit(f'render_claims calls: expected 2 matches, found {render_call_count}')
"""
if text.count(old) != 1:
    raise SystemExit('staged render-call matcher not found exactly once')
path.write_text(text.replace(old, new, 1))

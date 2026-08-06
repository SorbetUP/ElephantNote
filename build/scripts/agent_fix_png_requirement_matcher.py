from pathlib import Path

path = Path('build/scripts/verify-packaged-feature-matrix.mjs')
text = path.read_text()
old = "  'png-preview-written-to-disk': (block) => /preview[.]bytes/.test(block) && /[.]png/.test(block),"
new = "  'png-preview-written-to-disk': (block) => /preview[.]bytes/.test(block) && /png/i.test(block),"
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected one PNG matcher, found {count}')
path.write_text(text.replace(old, new, 1))

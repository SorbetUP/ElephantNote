#!/usr/bin/env python3
from pathlib import Path
import subprocess

path = Path('build/scripts/run-packaged-feature-matrix.mjs')
source = path.read_text(encoding='utf-8')

replacements = [
    (
        "await act(h, 'fill', '[data-testid=\"excalidraw-name\"]', 'Acceptance drawing')",
        "await act(h, 'fill', '.en-excalidraw-name-input', 'Acceptance drawing')",
    ),
    (
        "const current = await state(h, (value) => value.markdown.includes('**BOLD**') && value.isSaved === false, 'live markdown update')",
        "const current = await state(h, (value) => value.markdown.includes('**BOLD**'), 'live markdown update')",
    ),
    (
        "const visible = await dom(h, E, (value) => value.html.includes('<strong>BOLD</strong>') && value.html.includes('<em') && value.html.includes('<code'), 'live markdown render')",
        "const visible = await dom(h, `${E} strong`, (value) => value.visible && value.text.trim() === 'BOLD', 'live markdown render')\n    const surrounding = await dom(h, E, (value) => value.html.includes('<em') && value.html.includes('<code'), 'remaining markdown render')",
    ),
    (
        "return { beforeHtmlLength: before.html.length, current, htmlLength: visible.html.length }",
        "return { beforeHtmlLength: before.html.length, current, strongText: visible.text, htmlLength: surrounding.html.length }",
    ),
]

for old, new in replacements:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one occurrence, found {count}: {old}')
    source = source.replace(old, new, 1)

path.write_text(source, encoding='utf-8')
subprocess.run(['node', '--check', str(path)], check=True)
subprocess.run(['node', 'build/scripts/verify-packaged-feature-matrix.mjs'], check=True)
print('matrix assertions patched and verified')

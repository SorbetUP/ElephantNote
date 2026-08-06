from pathlib import Path

path = Path('build/scripts/run-packaged-feature-matrix.mjs')
text = path.read_text()
broken = "path: sourcePath }}], {{ clientX: 0.55, clientY: 0.65 }})"
fixed = "path: sourcePath }], { clientX: 0.55, clientY: 0.65 })"
count = text.count(broken)
if count != 4:
    raise SystemExit(f'expected four malformed drop calls, found {count}')
path.write_text(text.replace(broken, fixed))

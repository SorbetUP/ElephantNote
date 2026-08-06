from pathlib import Path

path = Path('build/scripts/run-packaged-feature-matrix.mjs')
text = path.read_text()
old = "    ok(wrapper?.bytes > 0 && wrapperMarkdown.includes(preview.relativePath), `Excalidraw wrapper note is missing the preview link: ${wrapperMarkdown}`)\n"
new = "    const expectedPreviewLink = `](${preview.relativePath})`\n    ok(\n      wrapper?.bytes > 0 &&\n      wrapperMarkdown.includes(expectedPreviewLink) &&\n      !wrapperMarkdown.includes('../.assets/'),\n      `Excalidraw wrapper note has an invalid preview link: ${wrapperMarkdown}`\n    )\n"
if text.count(old) != 1:
    raise SystemExit(f'expected one wrapper assertion, found {text.count(old)}')
path.write_text(text.replace(old, new, 1))

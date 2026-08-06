from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


automation_path = Path('Elephant/frontend/src/renderer/src/platform/automationAcceptancePhysicalSurface.js')
automation = automation_path.read_text()
old_drop = """        const transfer = createTransfer(target, materialized)
        for (const name of ['dragenter', 'dragover', 'drop']) {
          element.dispatchEvent(createDragEvent(target, name, transfer, options))
        }
"""
new_drop = """        const transfer = createTransfer(target, materialized)
        const rect = element.getBoundingClientRect()
        const coordinate = (value, start, size) => {
          const parsed = Number(value)
          if (!Number.isFinite(parsed)) return start + size / 2
          return Math.abs(parsed) <= 1 ? start + parsed * size : parsed
        }
        const dragOptions = {
          ...options,
          clientX: coordinate(options.clientX, rect.left, rect.width),
          clientY: coordinate(options.clientY, rect.top, rect.height)
        }
        for (const name of ['dragenter', 'dragover', 'drop']) {
          element.dispatchEvent(createDragEvent(target, name, transfer, dragOptions))
        }
"""
if old_drop in automation:
    automation = replace_once(automation, old_drop, new_drop, 'visible drop coordinates')
elif 'const coordinate = (value, start, size)' not in automation:
    raise SystemExit('visible drop coordinate patch target not found')
automation_path.write_text(automation)

matrix_path = Path('build/scripts/run-packaged-feature-matrix.mjs')
matrix = matrix_path.read_text()
old_excalidraw = """    await act(h, 'fill', '[data-testid=\"excalidraw-name\"]', 'Acceptance drawing')
    await act(h, 'pointerDrag', '.en-excalidraw-canvas canvas', [
"""
new_excalidraw = """    await act(h, 'fill', '[data-testid=\"excalidraw-name\"]', 'Acceptance drawing')
    await act(h, 'click', '[data-testid=\"toolbar-rectangle\"]')
    await act(h, 'pointerDrag', '.en-excalidraw-canvas canvas', [
"""
if old_excalidraw in matrix:
    matrix = replace_once(matrix, old_excalidraw, new_excalidraw, 'Excalidraw tool selection')
elif 'toolbar-rectangle' not in matrix:
    raise SystemExit('Excalidraw tool insertion target not found')

old_folder = r'''  'drop-file-into-vault-folder': async (h) => {
    await prepareVault(h)
    await set(h, 'createFolder', 'Drop target')
    const sourcePath = externalFile(h, 'drop.txt', 'drop-marker')
    await act(h, 'dropFiles', '.folder-name[title="Drop target"], .en-sidebar', [{ name: 'drop.txt', type: 'text/plain', path: sourcePath }])
    const path = join(h.vaultRoot, 'Drop target/drop.txt')
    for (let attempt = 0; attempt < 200 && !existsSync(path); attempt += 1) await z(100)
    ok(existsSync(path), 'drop folder failed')
    ok(readFileSync(path, 'utf8') === 'drop-marker', 'drop folder bytes differ')
    return { sourcePath, path }
  },
'''
new_folder = r'''  'drop-file-into-vault-folder': async (h) => {
    await prepareVault(h)
    const previous = new Set(readdirSync(h.vaultRoot))
    await act(h, 'click', '.en-create-button:not(.en-create-button-primary):not(.en-create-excalidraw-button)')
    const folderName = await waitForNewEntry(
      h.vaultRoot,
      previous,
      (entry) => statSync(join(h.vaultRoot, entry)).isDirectory(),
      'visible drop target folder creation'
    )
    const folderSelector = `.en-sidebar-tree-label[title="${escapeCssAttribute(folderName)}"]`
    await act(h, 'waitFor', folderSelector, 20_000)
    const sourcePath = externalFile(h, 'drop.txt', 'drop-marker')
    await act(h, 'dropFiles', folderSelector, [{ name: 'drop.txt', type: 'text/plain', path: sourcePath }])
    const path = join(h.vaultRoot, folderName, 'drop.txt')
    for (let attempt = 0; attempt < 200 && !existsSync(path); attempt += 1) await z(100)
    ok(existsSync(path), `drop folder failed for ${folderName}`)
    ok(readFileSync(path, 'utf8') === 'drop-marker', 'drop folder bytes differ')
    return { sourcePath, folderName, path, visibleTarget: folderSelector }
  },
'''
if old_folder in matrix:
    matrix = replace_once(matrix, old_folder, new_folder, 'folder drop journey')
elif 'visible drop target folder creation' not in matrix:
    raise SystemExit('folder drop feature target not found')

for filename in ['drop.png', 'linked.txt', 'addon-route.pdf', 'system-route.pdf']:
    old = f"path: sourcePath }}])"
    # Replace only inside the line containing the expected filename.
    lines = matrix.splitlines()
    matches = [index for index, line in enumerate(lines) if f"name: '{filename}'" in line and old in line]
    if len(matches) == 1:
        index = matches[0]
        lines[index] = lines[index].replace(old, "path: sourcePath }}], {{ clientX: 0.55, clientY: 0.65 }})")
        matrix = '\n'.join(lines) + ('\n' if matrix.endswith('\n') else '')
    elif len(matches) == 0 and f"name: '{filename}'" in matrix and 'clientX: 0.55' in matrix:
        pass
    else:
        raise SystemExit(f'{filename}: expected one drop call, found {len(matches)}')
matrix_path.write_text(matrix)

verifier_path = Path('build/scripts/verify-packaged-feature-matrix.mjs')
verifier = verifier_path.read_text()
old_visible = """    'excalidraw-open-close': {
      required: [/click/],
      forbidden: [/tauri_drawings_create/, /openExcalidraw/, /readExcalidraw/, /closeExcalidraw/]
    }
"""
new_visible = """    'excalidraw-open-close': {
      required: [/click/, /toolbar-rectangle/, /pointerDrag/, /walkVaultFiles/, /elements/, /data-entry-path/],
      forbidden: [/tauri_drawings_create/, /openExcalidraw/, /readExcalidraw/, /closeExcalidraw/]
    }
"""
if old_visible in verifier:
    verifier = replace_once(verifier, old_visible, new_visible, 'Excalidraw verifier contract')
elif 'required: [/click/, /toolbar-rectangle/' not in verifier:
    raise SystemExit('Excalidraw verifier target not found')

old_drop_check = """  for (const id of ['drop-file-into-vault-folder', 'drop-image-into-note', 'drop-file-link-into-note']) {
    if (!/dropFiles/.test(featureBlock(source, id))) failures.push(`${id} must dispatch an actual renderer drop sequence.`)
  }
"""
new_drop_check = """  for (const id of ['drop-file-into-vault-folder', 'drop-image-into-note', 'drop-file-link-into-note']) {
    const block = featureBlock(source, id)
    if (!/act\\(h, ['\"]dropFiles['\"]/.test(block)) failures.push(`${id} must dispatch a claimed visible renderer drop sequence.`)
    if (/(?:set|setup)\\s*\\([^\\n]*dropFiles/.test(block)) failures.push(`${id} must not hide the drop inside fixture setup.`)
  }
  const folderDrop = featureBlock(source, 'drop-file-into-vault-folder')
  if (!/en-create-button/.test(folderDrop) || /(?:set|setup)\\s*\\([^\\n]*createFolder/.test(folderDrop)) {
    failures.push('drop-file-into-vault-folder must create its target through the visible folder button.')
  }
  if (!/en-sidebar-tree-label/.test(folderDrop) || /, \\.en-sidebar/.test(folderDrop)) {
    failures.push('drop-file-into-vault-folder must target the exact visible folder row without a sidebar fallback.')
  }
"""
if old_drop_check in verifier:
    verifier = replace_once(verifier, old_drop_check, new_drop_check, 'drop verifier contract')
elif 'must target the exact visible folder row' not in verifier:
    raise SystemExit('drop verifier target not found')

old_tokens = "for (const token of ['pressShortcut', 'pasteText', 'dropFiles', 'DataTransfer', 'DragEvent', 'installPdfViewerProbe', 'readFileOpenHistory'])"
new_tokens = "for (const token of ['pressShortcut', 'pasteText', 'dropFiles', 'pointerDrag', 'DataTransfer', 'DragEvent', 'installPdfViewerProbe', 'readFileOpenHistory'])"
if old_tokens in verifier:
    verifier = replace_once(verifier, old_tokens, new_tokens, 'physical surface tokens')

requirements_guard = r'''
const featureRequirementMatchers = {
  'visible-pointer-draw': (block) => /toolbar-rectangle/.test(block) && /pointerDrag/.test(block),
  'scene-written-to-disk': (block) => /walkVaultFiles/.test(block) && /sceneFile/.test(block) && /elements/.test(block),
  'png-preview-written-to-disk': (block) => /preview[.]bytes/.test(block) && /[.]png/.test(block),
  'saved-drawing-reopened-from-library': (block) => /data-entry-path/.test(block) && /reopened/.test(block),
  'physical-keyboard-shortcut': (block) => /act\(h, ['"]pressShortcut['"]/.test(block),
  'physical-data-transfer-drop': (block) => /act\(h, ['"]dropFiles['"]/.test(block),
  'byte-identical-disk-copy': (block) => /readFileSync/.test(block) && /drop-marker/.test(block),
  'visible-image-render': (block) => /readDom|dom/.test(block) && /img/.test(block),
  'asset-written-to-disk': (block) => /[.]assets/.test(block) && /existsSync/.test(block),
  'visible-clickable-link': (block) => /readDom|dom/.test(block) && /a`| a['"]| a\)/.test(block),
  'attachment-written-to-disk': (block) => /assetPath/.test(block) && /existsSync/.test(block)
}
for (const [id, requirements] of Object.entries(manifest.featureRequirements || {})) {
  assert(manifest.requiredFeatures.includes(id), `featureRequirements references unknown feature ${id}.`)
  const block = featureBlock(runner, id)
  for (const requirement of requirements) {
    const matcher = featureRequirementMatchers[requirement]
    assert(typeof matcher === 'function', `Unknown feature requirement ${requirement} for ${id}.`)
    if (matcher) assert(matcher(block), `${id} does not satisfy declared requirement ${requirement}.`)
  }
}
'''
anchor = "assert(new Set(manifest.requiredFeatures).size === manifest.requiredFeatures.length, 'Feature ids must be unique.')\nerrors.push(...runnerContractErrors(runner))"
if 'const featureRequirementMatchers' not in verifier:
    verifier = replace_once(
        verifier,
        anchor,
        "assert(new Set(manifest.requiredFeatures).size === manifest.requiredFeatures.length, 'Feature ids must be unique.')\n" + requirements_guard + "errors.push(...runnerContractErrors(runner))",
        'feature requirement enforcement'
    )
verifier_path.write_text(verifier)

workflow_path = Path('.github/workflows/packaged-feature-matrix.yml')
workflow = workflow_path.read_text()
push_start = workflow.find('\n  push:\n')
concurrency_start = workflow.find('\n\nconcurrency:', push_start)
if push_start >= 0 and concurrency_start > push_start:
    workflow = workflow[:push_start] + '\n  workflow_dispatch:\n' + workflow[concurrency_start:]
elif 'workflow_dispatch:' not in workflow:
    raise SystemExit('workflow trigger patch target not found')
for path_line in [
    "      - 'build/scripts/lib/real-app-harness.mjs'\n",
    "      - 'Elephant/frontend/app/**'\n"
]:
    if path_line not in workflow:
        insertion = "      - 'build/scripts/run-packaged-feature-matrix.mjs'\n"
        workflow = replace_once(workflow, insertion, insertion + path_line, f'workflow path {path_line.strip()}')
workflow_path.write_text(workflow)

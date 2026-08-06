from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


core_path = Path('Elephant/backend/tauri/src/core_commands.rs')
core = core_path.read_text()
start = core.find('#[tauri::command]\npub fn tauri_drawings_write')
end = core.find('#[tauri::command]\npub fn tauri_features_get', start)
if start < 0 or end < 0:
    raise SystemExit('tauri_drawings_write block not found')
new_write = r'''#[tauri::command]
pub fn tauri_drawings_write(
    app: AppHandle,
    relative_path: String,
    scene: Option<Value>,
    scene_blob: Option<String>,
    image_blob: Option<Vec<u8>>,
) -> R<Value> {
    let root = active_vault_root(&app)?;
    let scene_path = writable_relative_path(&root, &relative_path)?;
    let scene = match scene {
        Some(scene) => scene,
        None => {
            let raw = scene_blob
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "A drawing scene is required.".to_string())?;
            serde_json::from_str::<Value>(&raw)
                .map_err(|error| format!("Invalid Excalidraw scene JSON: {error}"))?
        }
    };
    write_json(scene_path.clone(), &scene)?;

    let preview_path = if let Some(bytes) = image_blob.filter(|bytes| !bytes.is_empty()) {
        let path = scene_path.with_extension("png");
        fs::write(&path, bytes).map_err(|error| error.to_string())?;
        Some(path)
    } else {
        None
    };

    let public_path = |path: &Path| {
        path.strip_prefix(&root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/")
    };
    Ok(json!({
      "ok": true,
      "path": public_path(&scene_path),
      "fullPath": scene_path.to_string_lossy(),
      "previewPath": preview_path.as_deref().map(public_path),
      "previewFullPath": preview_path.as_ref().map(|path| path.to_string_lossy().to_string())
    }))
}

'''
core = core[:start] + new_write + core[end:]
core_path.write_text(core)


toolbar_path = Path('Elephant/frontend/app/components/library/LibraryToolbar.vue')
toolbar = toolbar_path.read_text()
import_marker = "import { useVaultStore } from '../../stores/vaultStore'\n"
if "elephantnoteClient" not in toolbar:
    toolbar = replace_once(
        toolbar,
        import_marker,
        import_marker + "import { elephantnoteClient } from '../../services/elephantnoteClient'\n",
        'LibraryToolbar client import'
    )
old_handler_start = toolbar.find('const handleExcalidrawSave = async (payload) => {')
old_handler_end = toolbar.find('\n</script>', old_handler_start)
if old_handler_start < 0 or old_handler_end < 0:
    raise SystemExit('LibraryToolbar Excalidraw handler not found')
new_handler = r'''const drawingSlug = (value = '') => {
  const normalized = String(value || 'drawing')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'drawing'
}

const markdownText = (value = '') => String(value || '').replace(/[\\\]]/g, '\\$&')

const relativeAssetLink = (notePath, assetPath) => {
  const noteParent = window.path.dirname(notePath)
  const from = noteParent === '.' ? '' : noteParent
  return window.path.relative(from, assetPath).replace(/\\/g, '/')
}

const handleExcalidrawSave = async (payload) => {
  if (!payload?.imageBlob || !payload?.sceneBlob || !store.activeVault?.path) return
  actionError.value = ''
  try {
    const displayName = String(payload.baseName || 'drawing').trim() || 'drawing'
    const slug = drawingSlug(displayName)
    const storageTitle = `excalidraw-${slug}`
    const created = await window.elephantnote?.drawings?.create?.({ title: storageTitle })
    const scenePath = created?.path || created?.relativePath
    if (!scenePath) throw new Error('The drawing backend did not return a scene path.')

    const saved = await window.elephantnote?.drawings?.write?.({
      relativePath: scenePath,
      sceneBlob: payload.sceneBlob,
      imageBlob: Array.from(payload.imageBlob)
    })
    const previewPath = saved?.previewPath
    if (!previewPath) throw new Error('The drawing backend did not write a PNG preview.')

    const noteResult = await elephantnoteClient.notes.create({
      relativePath: store.currentPath || '',
      filename: `${slug}.md`,
      title: displayName
    })
    const note = noteResult?.note
    if (!note?.path) throw new Error('The drawing wrapper note was not created.')
    const previewLink = relativeAssetLink(note.path, previewPath)
    await elephantnoteClient.notes.write({
      relativePath: note.path,
      markdown: `# ${markdownText(displayName)}\n\n![${markdownText(displayName)}](${previewLink})\n`
    })

    isExcalidrawOpen.value = false
    await store.openDirectory(store.currentPath || '', { record: false })
    const entry = store.entries.find((candidate) => candidate.path === note.path) || note
    store.openNote(entry)
  } catch (error) {
    actionError.value = error?.message || 'Unable to save Excalidraw.'
    console.error('[library] save Excalidraw failed', error)
  }
}'''
toolbar = toolbar[:old_handler_start] + new_handler + toolbar[old_handler_end:]
toolbar_path.write_text(toolbar)


matrix_path = Path('build/scripts/run-packaged-feature-matrix.mjs')
matrix = matrix_path.read_text()
feature_start = matrix.find("  'excalidraw-open-close': async (h) => {")
feature_end = matrix.find("  'text-basic-editing': async (h) => {", feature_start)
if feature_start < 0 or feature_end < 0:
    raise SystemExit('Excalidraw matrix block not found')
new_feature = r'''  'excalidraw-open-close': async (h) => {
    await prepareVault(h)
    const before = new Set(walkVaultFiles(h.vaultRoot).map((entry) => entry.relativePath))
    await act(h, 'click', '.en-create-excalidraw-button')
    const opened = await dom(h, '[data-testid="excalidraw-dialog"]', (value) => value.visible, 'visible Excalidraw open')
    const canvas = await dom(h, '.en-excalidraw-canvas canvas', (value) => value.visible, 'Excalidraw canvas')
    ok(!opened.text.includes('failed') && canvas.visible, 'Excalidraw opened with an error')
    await act(h, 'fill', '[data-testid="excalidraw-name"]', 'Acceptance drawing')
    await act(h, 'click', '[data-testid="toolbar-rectangle"]')
    await act(h, 'pointerDrag', '.en-excalidraw-canvas canvas', [
      { x: 0.24, y: 0.34 },
      { x: 0.40, y: 0.58 },
      { x: 0.57, y: 0.43 },
      { x: 0.74, y: 0.62 }
    ])
    await act(h, 'click', '.en-excalidraw-button.primary')
    await absent(h, '[data-testid="excalidraw-dialog"]', 'visible Excalidraw save close')

    let added = []
    for (let attempt = 0; attempt < 200; attempt += 1) {
      added = walkVaultFiles(h.vaultRoot).filter((entry) => !before.has(entry.relativePath))
      if (
        added.some((entry) => /[.]png$/i.test(entry.relativePath)) &&
        added.some((entry) => /[.]excalidraw$/i.test(entry.relativePath)) &&
        added.some((entry) => /[.]md$/i.test(entry.relativePath))
      ) break
      await z(50)
    }
    const preview = added.find((entry) => /[.]assets[/]excalidraw-acceptance-drawing[.]png$/i.test(entry.relativePath))
    const sceneFile = added.find((entry) => /[.]assets[/]excalidraw-acceptance-drawing[.]excalidraw$/i.test(entry.relativePath))
    const wrapper = added.find((entry) => /acceptance-drawing[.]md$/i.test(entry.relativePath))
    const scene = sceneFile ? JSON.parse(readFileSync(sceneFile.absolutePath, 'utf8')) : null
    const wrapperMarkdown = wrapper ? readFileSync(wrapper.absolutePath, 'utf8') : ''
    ok(preview?.bytes > 0, `Excalidraw PNG preview missing or empty: ${JSON.stringify(added)}`)
    ok(sceneFile?.bytes > 0 && scene?.elements?.length > 0, `Excalidraw scene missing drawn elements: ${JSON.stringify(added)}`)
    ok(wrapper?.bytes > 0 && wrapperMarkdown.includes(preview.relativePath), `Excalidraw wrapper note is missing the preview link: ${wrapperMarkdown}`)

    await act(h, 'waitFor', editorInputSelector, 20_000)
    const renderedImage = await dom(h, `${editorSelector} img`, (value) => value.visible, 'saved Excalidraw preview in wrapper note')
    ok(renderedImage.visible, 'saved Excalidraw preview is not visible in its note')
    await act(h, 'waitFor', '.en-excalidraw-edit-button', 20_000)
    await act(h, 'click', '.en-excalidraw-edit-button')
    const reopened = await dom(h, '[data-testid="excalidraw-dialog"]', (value) => value.visible, 'saved Excalidraw reopen from note')
    const reopenedCanvas = await dom(h, '.en-excalidraw-canvas canvas', (value) => value.visible, 'reopened Excalidraw canvas')
    ok(!reopened.text.includes('failed') && reopenedCanvas.visible, 'saved Excalidraw could not be reopened')
    await act(h, 'click', '[data-testid="excalidraw-close"]')
    await absent(h, '[data-testid="excalidraw-dialog"]', 'visible Excalidraw close')
    return {
      opened: true,
      drawnElements: scene.elements.length,
      preview: preview.relativePath,
      scene: sceneFile.relativePath,
      wrapper: wrapper.relativePath,
      reopenedFromVisibleNote: true,
      closed: true
    }
  },
'''
matrix = matrix[:feature_start] + new_feature + matrix[feature_end:]
matrix_path.write_text(matrix)


manifest_path = Path('tests/trust/packaged-feature-matrix.json')
manifest = manifest_path.read_text()
manifest = manifest.replace('saved-drawing-reopened-from-library', 'saved-drawing-reopened-from-note')
manifest_path.write_text(manifest)


verifier_path = Path('build/scripts/verify-packaged-feature-matrix.mjs')
verifier = verifier_path.read_text()
verifier = verifier.replace('/data-entry-path/', '/en-excalidraw-edit-button/')
verifier = verifier.replace("'saved-drawing-reopened-from-library': (block) => /data-entry-path/.test(block) && /reopened/.test(block),", "'saved-drawing-reopened-from-note': (block) => /en-excalidraw-edit-button/.test(block) && /reopenedFromVisibleNote/.test(block),")
verifier_path.write_text(verifier)

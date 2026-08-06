#!/usr/bin/env python3
from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    content = target.read_text(encoding="utf-8")
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one guarded block in {path}, found {count}")
    target.write_text(content.replace(old, new, 1), encoding="utf-8")


replace_once(
    "Elephant/frontend/src/renderer/src/muya/realMuyaRustAdapter.js",
    """  __drop (event) {
    const files = Array.from(event?.dataTransfer?.files || [])
    const images = files.filter((file) => String(file.type || '').startsWith('image/'))
    event.preventDefault()
    event.stopImmediatePropagation()
    if (images.length) {
      Promise.all(images.map((file) => this.__persistImage(file))).catch(this.__reportRustError)
      return
    }
    const text = String(event?.dataTransfer?.getData?.('text/plain') || '')
    if (!text) return
    this.__applyRust('drop', (engine) => {
      const selection = this.__selection().selection
      return engine.replaceRange(selection.anchor, selection.focus, text)
    }).catch(() => {})
  }
""",
    """  __drop (event) {
    const files = Array.from(event?.dataTransfer?.files || [])
    const images = files.filter((file) => String(file.type || '').startsWith('image/'))
    event.preventDefault()
    event.stopImmediatePropagation()

    if (files.length && typeof this.options?.onFileDrop === 'function') {
      this.__onUserMutation?.('drop:files')
      console.info('[elephantnote:muya-rust] drop:delegated', {
        fileCount: files.length,
        imageCount: images.length
      })
      return Promise.resolve(this.options.onFileDrop(files, event))
        .catch(this.__reportRustError)
    }

    if (images.length) {
      Promise.all(images.map((file) => this.__persistImage(file))).catch(this.__reportRustError)
      return
    }
    const text = String(event?.dataTransfer?.getData?.('text/plain') || '')
    if (!text) return
    this.__applyRust('drop', (engine) => {
      const selection = this.__selection().selection
      return engine.replaceRange(selection.anchor, selection.focus, text)
    }).catch(() => {})
  }
""",
)

replace_once(
    "Elephant/frontend/src/renderer/src/components/editorWithTabs/runtimeEditor.vue",
    ':on-file-drop="fileHandlers.dropped"',
    ':on-file-drop="handleFileDrop"',
)

replace_once(
    "Elephant/frontend/src/renderer/src/components/editorWithTabs/runtimeEditor.vue",
    """    void (async () => {
      await positionDropSelection(runtime, event)
      await fileHandlers.dropped(files)
    })().catch((error) => console.error('[elephantnote:file-drop] failed', error))
""",
    """    void handleFileDrop(files, event)
      .catch((error) => console.error('[elephantnote:file-drop] failed', error))
""",
)

replace_once(
    "Elephant/frontend/src/renderer/src/components/editorWithTabs/runtimeEditor.vue",
    """const fileHandlers = {
  ...createRuntimeFileHandlers({
    currentFile,
    projectTree,
    dispatch: dispatchRustBusCommand,
    dropImage: imageHandlers.dropped
  }),
  openLink: createRuntimeLinkHandler({ currentFile, projectTree })
}
const imageToolbar = useRuntimeImageToolbar(imageHandlers)
""",
    """const fileHandlers = {
  ...createRuntimeFileHandlers({
    currentFile,
    projectTree,
    dispatch: dispatchRustBusCommand,
    dropImage: imageHandlers.dropped
  }),
  openLink: createRuntimeLinkHandler({ currentFile, projectTree })
}
const handleFileDrop = async (files, event) => {
  const list = Array.from(files || [])
  if (!list.length) return false
  if (event && rustRuntime.value) {
    await positionDropSelection(rustRuntime.value, event)
  }
  console.info('[elephantnote:file-drop] product handler entered', {
    fileCount: list.length
  })
  return fileHandlers.dropped(list)
}
const imageToolbar = useRuntimeImageToolbar(imageHandlers)
""",
)

replace_once(
    "Elephant/frontend/app/components/editor/ExcalidrawDialog.vue",
    "import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'",
    "import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'",
)

replace_once(
    "Elephant/frontend/app/components/editor/ExcalidrawDialog.vue",
    """              v-model="editableBaseName"
              type="text"
              class="en-excalidraw-name-input"
""",
    """              v-model="editableBaseName"
              type="text"
              class="en-excalidraw-name-input"
              data-testid="excalidraw-name"
""",
)

replace_once(
    "Elephant/frontend/app/components/editor/ExcalidrawDialog.vue",
    """const mountEl = ref(null)
const apiRef = ref(null)
const root = ref(null)
const excalidrawModule = ref(null)
const isSaving = ref(false)
const initialData = ref(null)
""",
    """const mountEl = ref(null)
// React roots, modules and imperative APIs must never be deeply proxied by Vue.
// Proxying these opaque objects corrupts React's internal context/Fiber stacks.
const apiRef = shallowRef(null)
const root = shallowRef(null)
const excalidrawModule = shallowRef(null)
const isSaving = ref(false)
const initialData = shallowRef(null)
""",
)

replace_once(
    "Elephant/frontend/src/renderer/src/components/editorWithTabs/runtimeFileLinks.js",
    """const nextAvailablePath = async (directory, name, fileUtils, pathApi) => {
  const parsed = pathApi.parse(safeName(name))
  for (let index = 0; index < 10000; index += 1) {
    const suffix = index === 0 ? '' : `-${index}`
    const candidate = pathApi.join(directory, `${parsed.name}${suffix}${parsed.ext}`)
""",
    """const nextAvailablePath = async (directory, name, fileUtils, pathApi) => {
  const normalizedName = safeName(name)
  const extension = pathApi.extname(normalizedName)
  const stem = pathApi.basename(normalizedName, extension) || 'file'
  for (let index = 0; index < 10000; index += 1) {
    const suffix = index === 0 ? '' : `-${index}`
    const candidate = pathApi.join(directory, `${stem}${suffix}${extension}`)
""",
)

replace_once(
    "Elephant/frontend/src/renderer/src/editor-rust/domRenderer/helpers.js",
    """export const safeUrl = (value) => {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^(https?:|mailto:|tel:|#|\\/|\\.\\/|\\.\\.\\/)/i.test(url)) return url
  return ''
}
""",
    """export const safeUrl = (value) => {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^(https?:|mailto:|tel:|#|\\/|\\.\\/|\\.\\.\\/)/i.test(url)) return url
  // Preserve portable vault-relative links such as .assets/report.pdf while
  // rejecting unknown or executable URL schemes such as javascript:.
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return ''
  return url
}
""",
)

required_contracts = {
    "Elephant/frontend/src/renderer/src/muya/realMuyaRustAdapter.js": (
        "this.options.onFileDrop(files, event)",
        "drop:delegated",
    ),
    "Elephant/frontend/src/renderer/src/components/editorWithTabs/runtimeEditor.vue": (
        ':on-file-drop="handleFileDrop"',
        "product handler entered",
    ),
    "Elephant/frontend/app/components/editor/ExcalidrawDialog.vue": (
        "const apiRef = shallowRef(null)",
        'data-testid="excalidraw-name"',
    ),
    "Elephant/frontend/src/renderer/src/components/editorWithTabs/runtimeFileLinks.js": (
        "const extension = pathApi.extname(normalizedName)",
    ),
    "Elephant/frontend/src/renderer/src/editor-rust/domRenderer/helpers.js": (
        "Preserve portable vault-relative links",
    ),
}
for path, required_values in required_contracts.items():
    content = Path(path).read_text(encoding="utf-8")
    for required in required_values:
        if required not in content:
            raise SystemExit(f"Missing required patched contract in {path}: {required}")

print("Applied guarded drop, relative-link and Excalidraw isolation fixes.")

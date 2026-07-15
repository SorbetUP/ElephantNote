<template>
  <div
    class="muya-rust-runtime-shell"
    :data-muya-runtime-mode="mode"
  >
    <div
      ref="rootRef"
      class="muya-rust-runtime-editor"
      data-testid="muya-rust-runtime-editor"
    />
    <div
      v-if="errorMessage"
      class="muya-rust-runtime-error"
      role="alert"
    >
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { parseEditorResponse } from '../editor-rust/protocol'
import { initializeExperimentalRustRuntime } from '../editor-rust/runtime'

const props = defineProps({
  modelValue: { type: String, default: '' },
  mode: { type: String, default: 'rust' },
  factory: { type: Function, default: null },
  onFileDrop: { type: Function, default: null },
  onUriDrop: { type: Function, default: null },
  onImageClick: { type: Function, default: null }
})

const emit = defineEmits(['update:modelValue', 'ready', 'change', 'error'])
const rootRef = ref(null)
const errorMessage = ref('')
let runtime = null
let runtimeMarkdown = ''
let mountGeneration = 0
let syncTimer = null
let syncRequested = false
let syncInFlight = null
const internallyEmittedMarkdown = new Set()

const reportError = (error) => {
  errorMessage.value = error?.message || String(error)
  emit('error', error)
}

const readRuntimeMarkdown = async () => {
  if (!runtime) return runtimeMarkdown
  const response = parseEditorResponse(await runtime.bridge.engine.snapshot_json())
  if (response.type !== 'snapshot') {
    throw new TypeError(`Expected a Rust snapshot, received ${response.type}.`)
  }
  return String(response.payload.markdown || '')
}

const rememberInternalEmission = (markdown) => {
  internallyEmittedMarkdown.add(markdown)
  if (internallyEmittedMarkdown.size <= 64) return
  const oldest = internallyEmittedMarkdown.values().next().value
  internallyEmittedMarkdown.delete(oldest)
}

const flushMarkdownSync = () => {
  if (syncInFlight) return syncInFlight
  const generation = mountGeneration
  syncInFlight = (async () => {
    try {
      do {
        syncRequested = false
        const next = await readRuntimeMarkdown()
        if (generation !== mountGeneration) return
        runtimeMarkdown = next
        if (next !== props.modelValue) {
          rememberInternalEmission(next)
          emit('update:modelValue', next)
          emit('change', next)
        }
      } while (syncRequested && generation === mountGeneration)
    } catch (error) {
      if (generation === mountGeneration) reportError(error)
    } finally {
      syncInFlight = null
      if (syncRequested && generation === mountGeneration) scheduleMarkdownSync([true])
    }
  })()
  return syncInFlight
}

const scheduleMarkdownSync = (patches = []) => {
  if (!patches.length) return
  syncRequested = true
  if (syncTimer || syncInFlight) return
  syncTimer = window.setTimeout(() => {
    syncTimer = null
    void flushMarkdownSync()
  }, 0)
}

const destroyRuntime = () => {
  if (syncTimer) {
    window.clearTimeout(syncTimer)
    syncTimer = null
  }
  syncRequested = false
  runtime?.destroy()
  runtime = null
}

const mountRuntime = async (markdown) => {
  const generation = ++mountGeneration
  destroyRuntime()
  internallyEmittedMarkdown.clear()
  errorMessage.value = ''
  runtimeMarkdown = String(markdown || '')
  rootRef.value?.replaceChildren()

  try {
    const nextRuntime = await initializeExperimentalRustRuntime(
      { markdown: runtimeMarkdown },
      {
        factory: props.factory || undefined,
        useBundledWasm: !props.factory,
        domContainer: rootRef.value,
        captureInput: true,
        applyPatches: scheduleMarkdownSync,
        onFileDrop: props.onFileDrop,
        onUriDrop: props.onUriDrop,
        onImageClick: props.onImageClick
      },
      reportError
    )
    if (generation !== mountGeneration) {
      nextRuntime.destroy()
      return
    }
    runtime = nextRuntime
    emit('ready', runtime)
  } catch (error) {
    if (generation === mountGeneration) reportError(error)
  }
}

onMounted(() => {
  void mountRuntime(props.modelValue)
})

watch(
  () => props.modelValue,
  (next) => {
    const normalized = String(next || '')
    if (internallyEmittedMarkdown.delete(normalized)) return
    if (normalized !== runtimeMarkdown) void mountRuntime(normalized)
  }
)

watch(
  () => props.onFileDrop,
  (callback) => {
    if (runtime?.inputController) runtime.inputController.onFileDrop = callback || null
  }
)

watch(
  () => props.onUriDrop,
  (callback) => {
    if (runtime?.inputController) runtime.inputController.onUriDrop = callback || null
  }
)

watch(
  () => props.onImageClick,
  (callback) => {
    if (runtime?.inputController) runtime.inputController.onImageClick = callback || null
  }
)

onBeforeUnmount(() => {
  mountGeneration += 1
  destroyRuntime()
  internallyEmittedMarkdown.clear()
})
</script>

<style scoped>
.muya-rust-runtime-shell {
  position: relative;
  width: 100%;
  min-height: 100%;
}

.muya-rust-runtime-editor {
  min-height: 100%;
  outline: none;
  white-space: pre-wrap;
}

.muya-rust-runtime-error {
  position: absolute;
  inset: 16px 16px auto;
  padding: 12px 14px;
  border: 1px solid var(--errorColor, #c33);
  border-radius: 6px;
  background: var(--editorBgColor);
  color: var(--errorColor, #c33);
  font-size: 13px;
  white-space: normal;
}
</style>

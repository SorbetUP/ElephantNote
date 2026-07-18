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
let internalPropUpdatePending = false
let internalPropResetTimer = null

const reportError = (error) => {
  errorMessage.value = error?.message || String(error)
  const details = {
    name: error?.name || 'Error',
    message: errorMessage.value,
    revision: runtime?.bridge?.revision ?? null,
    selection: runtime?.bridge?.selection ?? null,
    markdownLength: runtimeMarkdown.length
  }
  window.__ELEPHANT_DEBUG_LOGS__ = Array.isArray(window.__ELEPHANT_DEBUG_LOGS__)
    ? window.__ELEPHANT_DEBUG_LOGS__
    : []
  window.__ELEPHANT_DEBUG_LOGS__.push({
    at: new Date().toISOString(),
    level: 'error',
    message: '[elephantnote:rust-editor] runtime error',
    details
  })
  if (window.__ELEPHANT_DEBUG_LOGS__.length > 1000) {
    window.__ELEPHANT_DEBUG_LOGS__.splice(0, window.__ELEPHANT_DEBUG_LOGS__.length - 1000)
  }
  console.error('[elephantnote:rust-editor] runtime error', details)
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

const markInternalPropUpdate = () => {
  internalPropUpdatePending = true
  if (internalPropResetTimer) window.clearTimeout(internalPropResetTimer)
  internalPropResetTimer = window.setTimeout(() => {
    internalPropResetTimer = null
    internalPropUpdatePending = false
  }, 0)
}

const flushMarkdownSync = () => {
  if (syncInFlight) return syncInFlight
  const generation = mountGeneration
  syncInFlight = (async () => {
    try {
      while (true) {
        syncRequested = false
        const next = await readRuntimeMarkdown()
        if (generation !== mountGeneration) return
        runtimeMarkdown = next
        if (next !== props.modelValue) {
          markInternalPropUpdate()
          emit('update:modelValue', next)
          emit('change', next)
        }
        if (!syncRequested) break
      }
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
  if (internalPropResetTimer) {
    window.clearTimeout(internalPropResetTimer)
    internalPropResetTimer = null
  }
  internalPropUpdatePending = false
  syncRequested = false
  runtime?.destroy()
  runtime = null
}

const mountRuntime = async (markdown) => {
  const generation = ++mountGeneration
  destroyRuntime()
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
    if (internalPropUpdatePending) {
      internalPropUpdatePending = false
      if (internalPropResetTimer) {
        window.clearTimeout(internalPropResetTimer)
        internalPropResetTimer = null
      }
      return
    }
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

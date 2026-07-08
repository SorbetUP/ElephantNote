<template>
  <Teleport to="body">
    <div class="en-excalidraw-overlay">
      <section class="en-excalidraw-shell">
        <header class="en-excalidraw-header">
          <div class="en-excalidraw-name-wrap">
            <input
              v-model="editableBaseName"
              type="text"
              class="en-excalidraw-name-input"
              spellcheck="false"
              placeholder="drawing"
              aria-label="Drawing name"
              @pointerdown.stop
              @pointerup.stop
              @mousedown.stop
              @mouseup.stop
              @click.stop
              @keydown.stop
            >
          </div>

          <div class="en-excalidraw-actions">
            <button
              type="button"
              class="en-excalidraw-button secondary"
              aria-label="Cancel"
              title="Cancel"
              @pointerdown.stop
              @pointerup.stop.prevent="handleClose"
              @mousedown.stop
              @mouseup.stop.prevent="handleClose"
              @click.stop.prevent="handleClose"
            >
              ✕
            </button>
            <button
              type="button"
              class="en-excalidraw-button primary"
              :disabled="isSaving || !apiRef || !!errorMessage"
              aria-label="Save"
              title="Save"
              @pointerdown.stop
              @pointerup.stop.prevent="handleSave"
              @mousedown.stop
              @mouseup.stop.prevent="handleSave"
              @click.stop.prevent="handleSave"
            >
              {{ isSaving ? '…' : '✓' }}
            </button>
          </div>
        </header>

        <div
          v-if="errorMessage"
          class="en-excalidraw-error"
        >
          <strong>Excalidraw failed to open.</strong>
          <p>{{ errorMessage }}</p>
        </div>

        <main
          v-show="!errorMessage"
          ref="mountEl"
          class="en-excalidraw-canvas"
        />
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import React from 'react'
import { createRoot } from 'react-dom/client'
import {
  loadExcalidrawModule,
  createInitialExcalidrawData,
  exportExcalidrawBlob,
  exportExcalidrawSceneBlob,
  ensurePngName
} from '../../services/excalidraw'

const props = defineProps({
  title: {
    type: String,
    default: 'Excalidraw'
  },
  theme: {
    type: String,
    default: 'light'
  },
  fileName: {
    type: String,
    default: 'excalidraw.png'
  },
  initialBlob: {
    type: Blob,
    default: null
  },
  saveMode: {
    type: String,
    default: 'png'
  },
  insertOnSave: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'save'])

const mountEl = ref(null)
const apiRef = shallowRef(null)
const root = shallowRef(null)
const isSaving = ref(false)
const initialData = shallowRef(null)
const errorMessage = ref('')
let mounted = true

const stripKnownExtensions = (value) => {
  return String(value || '')
    .replace(/\.excalidraw\.png$/i, '')
    .replace(/\.excalidraw$/i, '')
    .replace(/\.png$/i, '')
}

const blobToBytes = async(blob) => new Uint8Array(await blob.arrayBuffer())

const editableBaseName = ref(stripKnownExtensions(props.fileName) || 'drawing')
const normalizedBaseName = computed(() => {
  const cleaned = stripKnownExtensions(editableBaseName.value).trim()
  return cleaned || 'drawing'
})
const resolvedFileName = computed(() => ensurePngName(normalizedBaseName.value))

class ExcalidrawErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  componentDidCatch(error) {
    this.setState({ error })
    this.props.onError?.(error)
  }

  render() {
    if (this.state.error) return null
    return this.props.children
  }
}

const handleClose = () => {
  emit('close')
}

const waitForCanvasMount = async () => {
  await nextTick()
  await new Promise((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise((resolve) => requestAnimationFrame(() => resolve()))
  const rect = mountEl.value?.getBoundingClientRect?.()
  if (!rect || rect.width < 1 || rect.height < 1) {
    throw new Error('Excalidraw canvas is not visible yet.')
  }
}

const renderCanvas = async () => {
  await waitForCanvasMount()
  if (!mounted) return
  const mod = await loadExcalidrawModule()
  initialData.value = markRaw(await createInitialExcalidrawData({
    blob: props.initialBlob,
    theme: props.theme
  }))

  if (!mountEl.value) throw new Error('Excalidraw mount element is missing.')
  const reactRoot = root.value || markRaw(createRoot(mountEl.value))
  root.value = reactRoot
  reactRoot.render(
    React.createElement(
      ExcalidrawErrorBoundary,
      {
        onError: (error) => {
          console.error('Excalidraw runtime failed:', error)
          errorMessage.value = error?.message || 'The drawing canvas could not be initialized.'
        }
      },
      React.createElement(mod.Excalidraw, {
        initialData: initialData.value,
        theme: props.theme,
        excalidrawAPI: (api) => {
          apiRef.value = api ? markRaw(api) : null
        },
        UIOptions: {
          canvasActions: {
            saveToActiveFile: false,
            loadScene: false,
            export: false,
            clearCanvas: true,
            toggleTheme: false
          }
        }
      })
    )
  )
}

const handleSave = async () => {
  if (!apiRef.value || isSaving.value) return
  isSaving.value = true
  errorMessage.value = ''
  try {
    const sceneBlob = await exportExcalidrawSceneBlob({
      api: apiRef.value,
      theme: props.theme
    })
    const blob = await exportExcalidrawBlob({
      api: apiRef.value,
      theme: props.theme
    })
    emit('save', {
      blob,
      imageBlob: await blobToBytes(blob),
      fileName: resolvedFileName.value,
      baseName: normalizedBaseName.value,
      sceneBlob: await sceneBlob.text()
    })
  } catch (error) {
    console.error('Failed to save Excalidraw:', error)
    errorMessage.value = error?.message || 'The drawing could not be saved.'
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  document.body.classList.add('en-excalidraw-open')
  renderCanvas().catch((error) => {
    console.error('Failed to open Excalidraw:', error)
    errorMessage.value = error?.message || 'The drawing canvas could not be initialized.'
  })
})

onBeforeUnmount(() => {
  mounted = false
  document.body.classList.remove('en-excalidraw-open')
  root.value?.unmount?.()
  root.value = null
})
</script>

<style scoped>
.en-excalidraw-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  background: var(--en-bg, #0f172a);
  -webkit-app-region: no-drag;
}

.en-excalidraw-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--en-bg, #0f172a);
  color: var(--en-text, #eef2ff);
  position: relative;
  padding-top: 28px;
  -webkit-app-region: no-drag;
}

.en-excalidraw-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 0 8px 0 86px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
  background: color-mix(in srgb, var(--en-bg, #0f172a) 94%, transparent);
  backdrop-filter: blur(16px);
  z-index: 4;
}

.en-excalidraw-name-wrap {
  flex: 1;
  max-width: 420px;
}

.en-excalidraw-name-input {
  width: 100%;
  height: 20px;
  border: 0;
  outline: 0;
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.12);
  color: inherit;
  font: inherit;
  font-size: 12px;
  padding: 0 8px;
}

.en-excalidraw-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.en-excalidraw-button {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(148, 163, 184, 0.12);
  color: inherit;
  cursor: pointer;
  line-height: 1;
}

.en-excalidraw-button.primary {
  background: #2563eb;
  color: white;
  border-color: #2563eb;
}

.en-excalidraw-button:disabled {
  opacity: 0.5;
  cursor: wait;
}

.en-excalidraw-error {
  margin: 96px auto;
  max-width: 520px;
  border-radius: 16px;
  padding: 24px;
  background: rgba(239, 68, 68, 0.12);
  color: #fecaca;
}

.en-excalidraw-canvas {
  flex: 1;
  min-height: 0;
  height: calc(100vh - 28px);
  height: calc(100dvh - 28px);
  background: #fff;
}

@media (max-width: 760px), (pointer: coarse) {
  .en-excalidraw-shell {
    padding-top: calc(58px + env(safe-area-inset-top, 0px));
  }

  .en-excalidraw-header {
    height: calc(58px + env(safe-area-inset-top, 0px));
    padding: calc(env(safe-area-inset-top, 0px) + 8px) 10px 8px;
    gap: 10px;
  }

  .en-excalidraw-name-wrap {
    max-width: none;
  }

  .en-excalidraw-name-input {
    height: 42px;
    border-radius: 14px;
    padding: 0 12px;
    font-size: 16px;
  }

  .en-excalidraw-button {
    width: 42px;
    height: 42px;
    font-size: 18px;
  }

  .en-excalidraw-canvas {
    height: calc(100dvh - 58px - env(safe-area-inset-top, 0px));
  }
}
</style>

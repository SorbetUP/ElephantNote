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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import React from 'react'
import { createRoot } from 'react-dom/client'
import {
  loadExcalidrawModule,
  createInitialExcalidrawData,
  exportExcalidrawBlob,
  exportExcalidrawSceneBlob,
  ensureExcalidrawName
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
const apiRef = ref(null)
const root = ref(null)
const isSaving = ref(false)
const initialData = ref(null)
const errorMessage = ref('')

const stripKnownExtensions = (value) => {
  return String(value || '')
    .replace(/\.excalidraw\.png$/i, '')
    .replace(/\.excalidraw$/i, '')
    .replace(/\.png$/i, '')
}

const editableBaseName = ref(stripKnownExtensions(props.fileName) || 'drawing')
const normalizedBaseName = computed(() => {
  const cleaned = stripKnownExtensions(editableBaseName.value).trim()
  return cleaned || 'drawing'
})
const resolvedFileName = computed(() => ensureExcalidrawName(normalizedBaseName.value))

const handleClose = () => {
  emit('close')
}

const renderCanvas = async () => {
  const mod = await loadExcalidrawModule()
  initialData.value = await createInitialExcalidrawData({
    blob: props.initialBlob,
    theme: props.theme
  })

  if (!mountEl.value) throw new Error('Excalidraw mount element is missing.')
  root.value = createRoot(mountEl.value)
  root.value.render(
    React.createElement(mod.Excalidraw, {
      initialData: initialData.value,
      theme: props.theme,
      excalidrawAPI: (api) => {
        apiRef.value = api
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
      fileName: resolvedFileName.value,
      baseName: normalizedBaseName.value,
      sceneBlob
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
  document.body.classList.remove('en-excalidraw-open')
  root.value?.unmount?.()
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
  background: rgba(15, 23, 42, 0.78);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 2147483000;
  pointer-events: auto;
  user-select: none;
  -webkit-app-region: drag;
}

.en-excalidraw-name-wrap {
  min-width: 0;
  width: min(320px, 34vw);
  max-width: 320px;
  flex: 0 1 auto;
  -webkit-app-region: no-drag;
}

.en-excalidraw-name-input {
  width: 100%;
  height: 20px;
  border: 0;
  outline: none;
  padding: 0;
  background: transparent;
  color: #e5e7eb;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 20px;
  letter-spacing: 0;
  pointer-events: auto;
  user-select: text;
  -webkit-app-region: no-drag;
}

.en-excalidraw-name-input::placeholder {
  color: #94a3b8;
}

.en-excalidraw-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

.en-excalidraw-button {
  width: 20px;
  min-width: 20px;
  height: 20px;
  border: 0;
  border-radius: 5px;
  padding: 0;
  color: var(--en-text, #eef2ff);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  transition:
    background 140ms ease,
    transform 140ms ease,
    opacity 140ms ease;
}

.en-excalidraw-button.secondary {
  background: transparent;
  color: #cbd5e1;
}

.en-excalidraw-button.secondary:hover {
  background: rgba(255, 255, 255, 0.06);
}

.en-excalidraw-button.primary {
  background: transparent;
  color: #86efac;
}

.en-excalidraw-button.primary:hover:not(:disabled),
.en-excalidraw-button.secondary:hover:not(:disabled) {
  transform: translateY(-1px);
}

.en-excalidraw-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.en-excalidraw-canvas {
  flex: 1;
  min-height: 0;
  background: #f8f8f8;
  padding-top: 28px;
}

.en-excalidraw-canvas :deep(.excalidraw) {
  width: 100%;
  height: 100%;
}

@media (max-width: 640px) {
  .en-excalidraw-header {
    top: 0;
    height: 28px;
    padding: 0 8px 0 10px;
  }

  .en-excalidraw-name-wrap {
    width: min(220px, 42vw);
    max-width: 220px;
  }

  .en-excalidraw-name-input {
    font-size: 12px;
  }

  .en-excalidraw-canvas {
    padding-top: 28px;
  }
}

.en-excalidraw-error {
  margin: 24px;
  padding: 18px;
  border: 1px solid #ef4444;
  border-radius: 10px;
  background: rgba(127, 29, 29, 0.24);
}

.en-excalidraw-error p {
  margin: 8px 0 0;
}
</style>

<style>
body.en-excalidraw-open .ag-image-toolbar,
body.en-excalidraw-open .ag-quick-insert,
body.en-excalidraw-open .ag-float-wrapper,
body.en-excalidraw-open .ag-format-picker,
body.en-excalidraw-open .ag-front-menu {
  display: none !important;
}
</style>

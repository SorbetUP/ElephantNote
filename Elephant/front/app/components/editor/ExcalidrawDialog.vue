<template>
  <Teleport to="body">
    <div class="en-excalidraw-overlay">
      <section class="en-excalidraw-shell">
        <header class="en-excalidraw-header">
          <div class="en-excalidraw-title">
            <div class="en-excalidraw-badge">Excalidraw</div>
            <div>
              <h2>{{ title }}</h2>
              <p>{{ resolvedFileName }}</p>
            </div>
          </div>

          <div class="en-excalidraw-actions">
            <button
              type="button"
              class="en-excalidraw-button secondary"
              @click="$emit('close')"
            >
              Close
            </button>
            <button
              type="button"
              class="en-excalidraw-button primary"
              :disabled="isSaving || !apiRef || !!errorMessage"
              @click="handleSave"
            >
              {{ isSaving ? 'Saving…' : saveLabel }}
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
  ensureExcalidrawName,
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
const apiRef = ref(null)
const root = ref(null)
const isSaving = ref(false)
const initialData = ref(null)
const errorMessage = ref('')
const resolvedFileName = computed(() => props.saveMode === 'scene'
  ? ensureExcalidrawName(props.fileName)
  : ensurePngName(props.fileName))
const saveLabel = computed(() => props.insertOnSave ? 'Save & insert image' : 'Save drawing')

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
    const fileName = resolvedFileName.value
    emit('save', { blob, fileName, sceneBlob })
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
}

.en-excalidraw-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--en-bg, #0f172a);
  color: var(--en-text, #eef2ff);
}

.en-excalidraw-header {
  min-height: 86px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 0 26px;
  border-bottom: 1px solid var(--en-border, #263449);
  background: color-mix(in srgb, var(--en-surface, #111827) 92%, transparent);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
  z-index: 2;
}

.en-excalidraw-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
}

.en-excalidraw-badge {
  width: 46px;
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: #6c63ff;
  color: #fff;
  font-size: 0;
  font-weight: 900;
}

.en-excalidraw-badge::before {
  content: '✎';
  font-size: 24px;
  line-height: 1;
}

.en-excalidraw-title h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}

.en-excalidraw-title p {
  margin: 5px 0 0;
  color: var(--en-muted, #9ca3af);
  font-size: 13px;
  word-break: break-all;
}

.en-excalidraw-actions {
  display: flex;
  gap: 10px;
}

.en-excalidraw-button {
  min-width: 108px;
  height: 42px;
  border: 1px solid var(--en-border, #263449);
  border-radius: 10px;
  padding: 0 16px;
  color: var(--en-text, #eef2ff);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.en-excalidraw-button.secondary {
  background: transparent;
}

.en-excalidraw-button.secondary:hover {
  background: rgba(148, 163, 184, 0.14);
}

.en-excalidraw-button.primary {
  border-color: #60a5fa;
  background: #2563eb;
  color: #fff;
}

.en-excalidraw-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.en-excalidraw-canvas {
  flex: 1;
  min-height: 0;
  background: #f8f8f8;
}

.en-excalidraw-canvas :deep(.excalidraw) {
  width: 100%;
  height: 100%;
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

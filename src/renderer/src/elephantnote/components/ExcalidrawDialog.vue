<template>
  <div
    class="en-excalidraw-backdrop"
    @click.self="$emit('close')"
  >
    <div class="en-excalidraw-shell">
      <header class="en-excalidraw-header">
        <div class="en-excalidraw-title">
          <h3>{{ title }}</h3>
          <span>{{ resolvedFileName }}</span>
        </div>
        <div class="en-excalidraw-actions">
          <button
            type="button"
            class="en-ghost-button"
            :disabled="false"
            @click="$emit('close')"
          >
            Close
          </button>
          <button
            type="button"
            class="en-primary-button"
            :disabled="isSaving || !apiRef || !!errorMessage"
            @click="handleSave"
          >
            {{ isSaving ? 'Saving...' : saveLabel }}
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
      <div
        v-show="!errorMessage"
        ref="mountEl"
        class="en-excalidraw-canvas"
      />
    </div>
  </div>
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
} from '../services/excalidraw'

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
const saveLabel = computed(() => props.saveMode === 'scene' ? 'Save drawing' : 'Save image')

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
    const blob = props.saveMode === 'scene'
      ? await exportExcalidrawSceneBlob({
        api: apiRef.value,
        theme: props.theme
      })
      : await exportExcalidrawBlob({
        api: apiRef.value,
        theme: props.theme
      })
    const fileName = resolvedFileName.value
    emit('save', { blob, fileName })
  } catch (error) {
    console.error('Failed to save Excalidraw:', error)
    errorMessage.value = error?.message || 'The drawing could not be saved.'
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  renderCanvas().catch((error) => {
    console.error('Failed to open Excalidraw:', error)
    errorMessage.value = error?.message || 'The drawing canvas could not be initialized.'
  })
})

onBeforeUnmount(() => {
  root.value?.unmount?.()
})
</script>

<style scoped>
.en-excalidraw-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  background: rgba(3, 7, 18, 0.62);
}

.en-excalidraw-shell {
  width: min(1200px, calc(100vw - 40px));
  height: min(820px, calc(100vh - 40px));
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  border: 1px solid var(--en-border, #263449);
  border-radius: 8px;
  background: var(--en-panel, #111827);
  color: var(--en-text, #eef2ff);
  box-shadow: 0 24px 72px rgba(0, 0, 0, 0.35);
}

.en-excalidraw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--en-border, #263449);
}

.en-excalidraw-title h3 {
  margin: 0;
  font-size: 16px;
}

.en-excalidraw-title span {
  display: block;
  margin-top: 2px;
  color: var(--en-muted, #9ca3af);
  font-size: 12px;
}

.en-excalidraw-actions {
  display: flex;
  gap: 10px;
}

.en-ghost-button,
.en-primary-button {
  min-width: 96px;
  height: 38px;
  border: 1px solid var(--en-border, #263449);
  border-radius: 8px;
  padding: 0 14px;
  color: var(--en-text, #eef2ff);
  background: transparent;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.en-primary-button {
  border-color: #60a5fa;
  background: #2563eb;
  color: #ffffff;
}

.en-primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.en-ghost-button:hover {
  background: rgba(148, 163, 184, 0.14);
}

.en-excalidraw-canvas {
  min-height: 0;
}

.en-excalidraw-canvas :deep(.excalidraw) {
  height: 100%;
}

.en-excalidraw-error {
  margin: 24px;
  padding: 18px;
  border: 1px solid #ef4444;
  border-radius: 8px;
  background: rgba(127, 29, 29, 0.24);
}

.en-excalidraw-error p {
  margin: 8px 0 0;
}
</style>

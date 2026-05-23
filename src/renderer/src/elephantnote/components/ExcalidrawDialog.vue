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
            :disabled="isSaving"
            @click="$emit('close')"
          >
            Close
          </button>
          <button
            type="button"
            class="en-primary-button"
            :disabled="isSaving"
            @click="handleSave"
          >
            {{ isSaving ? 'Saving...' : 'Save image' }}
          </button>
        </div>
      </header>
      <div
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
import { loadExcalidrawModule, createInitialExcalidrawData, exportExcalidrawBlob, ensurePngName } from '../services/excalidraw'

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
  }
})

const emit = defineEmits(['close', 'save'])

const mountEl = ref(null)
const apiRef = ref(null)
const root = ref(null)
const isSaving = ref(false)
const initialData = ref(null)
const resolvedFileName = computed(() => ensurePngName(props.fileName))

const renderCanvas = async () => {
  const mod = await loadExcalidrawModule()
  initialData.value = await createInitialExcalidrawData({
    blob: props.initialBlob,
    theme: props.theme
  })

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
  try {
    const blob = await exportExcalidrawBlob({
      api: apiRef.value,
      theme: props.theme
    })
    const fileName = resolvedFileName.value
    emit('save', { blob, fileName })
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  renderCanvas().catch((error) => {
    console.error('Failed to open Excalidraw:', error)
    emit('close')
  })
})

onBeforeUnmount(() => {
  root.value?.unmount?.()
})
</script>

<template>
  <Teleport to="body">
    <div class="en-excalidraw-overlay" :style="themeTokens">
      <section class="en-excalidraw-shell" role="dialog" aria-modal="true" :aria-label="t('excalidraw.title')">
        <header class="en-excalidraw-header">
          <div class="en-excalidraw-identity">
            <span class="en-excalidraw-mark" aria-hidden="true">
              <svg viewBox="0 0 64 64" role="img">
                <path d="M18 48 45 21l5 5-27 27-9 2 4-7Z" />
                <path d="m39 16 9 9" />
                <path d="M20 17 47 44" />
                <path d="m43 48 5-5 3 9-9-3Z" />
              </svg>
            </span>
            <div class="en-excalidraw-heading">
              <strong>{{ t('excalidraw.title') }}</strong>
              <span>{{ t('excalidraw.localBadge') }}</span>
            </div>
          </div>

          <label class="en-excalidraw-name-wrap">
            <span>{{ t('excalidraw.drawingName') }}</span>
            <input
              v-model="editableBaseName"
              type="text"
              class="en-excalidraw-name-input"
              spellcheck="false"
              :placeholder="t('excalidraw.drawingPlaceholder')"
              :aria-label="t('excalidraw.drawingName')"
              @pointerdown.stop
              @click.stop
              @keydown.stop
            >
          </label>

          <div class="en-excalidraw-actions">
            <button
              type="button"
              class="en-excalidraw-button secondary"
              :aria-label="t('excalidraw.cancel')"
              @click.stop.prevent="handleClose"
            >
              <X aria-hidden="true" />
              <span>{{ t('common.cancel') }}</span>
              <kbd>Esc</kbd>
            </button>
            <button
              type="button"
              class="en-excalidraw-button primary"
              :disabled="isSaving || !apiRef || !!errorMessage"
              :aria-label="t('excalidraw.save')"
              @click.stop.prevent="handleSave"
            >
              <LoaderCircle v-if="isSaving" class="spinning" aria-hidden="true" />
              <Check v-else aria-hidden="true" />
              <span>{{ isSaving ? t('common.saving') : t('common.save') }}</span>
              <kbd>{{ isMacOS ? '⌘S' : 'Ctrl S' }}</kbd>
            </button>
          </div>
        </header>

        <div v-if="errorMessage" class="en-excalidraw-error" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>{{ t('excalidraw.failedTitle') }}</strong>
            <p>{{ errorMessage }}</p>
          </div>
        </div>

        <main v-else class="en-excalidraw-workspace">
          <div class="en-excalidraw-hint">
            <span class="en-excalidraw-hint-mark" aria-hidden="true" />
            {{ t('excalidraw.hint') }}
          </div>
          <div ref="mountEl" class="en-excalidraw-canvas" />
        </main>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlertTriangle, Check, LoaderCircle, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { getThemeMode, getThemeTokens } from 'common/elephantnote/appearance'
import { getExcalidrawBackgroundColor } from 'elephant-shared/excalidrawAssets'
import {
  loadExcalidrawModule,
  createInitialExcalidrawData,
  exportExcalidrawBlob,
  exportExcalidrawSceneBlob,
  ensurePngName
} from '../../services/excalidraw'

const props = defineProps({
  title: { type: String, default: 'Excalidraw' },
  theme: { type: String, default: 'light' },
  fileName: { type: String, default: 'excalidraw.png' },
  initialBlob: { type: Blob, default: null },
  saveMode: { type: String, default: 'png' },
  insertOnSave: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'save'])
const { t } = useI18n()
const mountEl = ref(null)
const apiRef = ref(null)
const root = ref(null)
const excalidrawModule = ref(null)
const isSaving = ref(false)
const initialData = ref(null)
const errorMessage = ref('')
const isMacOS = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`)

// ElephantNote themes have full palettes; Excalidraw only accepts the two
// canonical modes. Every app theme is therefore reduced to light or dark here.
const excalidrawTheme = computed(() => getThemeMode(props.theme))
const themeTokens = computed(() => getThemeTokens(props.theme))

const stripKnownExtensions = (value) => String(value || '')
  .replace(/\.excalidraw\.png$/i, '')
  .replace(/\.excalidraw$/i, '')
  .replace(/\.png$/i, '')

const blobToBytes = async (blob) => new Uint8Array(await blob.arrayBuffer())
const editableBaseName = ref(stripKnownExtensions(props.fileName) || 'drawing')
const normalizedBaseName = computed(() => stripKnownExtensions(editableBaseName.value).trim() || 'drawing')
const resolvedFileName = computed(() => ensurePngName(normalizedBaseName.value))

const handleClose = () => emit('close')

const renderExcalidraw = () => {
  if (!root.value || !excalidrawModule.value) return
  root.value.render(
    React.createElement(excalidrawModule.value.Excalidraw, {
      initialData: initialData.value,
      theme: excalidrawTheme.value,
      name: normalizedBaseName.value,
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

const applyExcalidrawTheme = (theme) => {
  renderExcalidraw()
  const api = apiRef.value
  if (!api?.updateScene) return
  api.updateScene({
    appState: {
      ...api.getAppState?.(),
      theme,
      viewBackgroundColor: getExcalidrawBackgroundColor(theme)
    }
  })
}

const renderCanvas = async () => {
  excalidrawModule.value = await loadExcalidrawModule()
  initialData.value = await createInitialExcalidrawData({
    blob: props.initialBlob,
    theme: excalidrawTheme.value
  })

  if (!mountEl.value) throw new Error('Excalidraw mount element is missing.')
  root.value = createRoot(mountEl.value)
  renderExcalidraw()
}

watch(excalidrawTheme, (theme) => {
  applyExcalidrawTheme(theme)
}, { flush: 'post' })

const handleSave = async () => {
  if (!apiRef.value || isSaving.value) return
  isSaving.value = true
  errorMessage.value = ''
  try {
    const sceneBlob = await exportExcalidrawSceneBlob({ api: apiRef.value, theme: excalidrawTheme.value })
    const blob = await exportExcalidrawBlob({ api: apiRef.value, theme: excalidrawTheme.value })
    emit('save', {
      blob,
      imageBlob: await blobToBytes(blob),
      fileName: resolvedFileName.value,
      baseName: normalizedBaseName.value,
      sceneBlob: await sceneBlob.text()
    })
  } catch (error) {
    console.error('Failed to save Excalidraw:', error)
    errorMessage.value = error?.message || t('excalidraw.failedSave')
  } finally {
    isSaving.value = false
  }
}

const handleKeyboard = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    handleClose()
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void handleSave()
  }
}

onMounted(() => {
  document.body.classList.add('en-excalidraw-open')
  window.addEventListener('keydown', handleKeyboard, true)
  renderCanvas().catch((error) => {
    console.error('Failed to open Excalidraw:', error)
    errorMessage.value = error?.message || t('excalidraw.failedInitialize')
  })
})

onBeforeUnmount(() => {
  document.body.classList.remove('en-excalidraw-open')
  window.removeEventListener('keydown', handleKeyboard, true)
  root.value?.unmount?.()
})
</script>

<style scoped>
.en-excalidraw-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  padding: 12px;
  background:
    radial-gradient(circle at 50% -20%, color-mix(in srgb, var(--en-primary) 18%, transparent), transparent 44%),
    var(--en-bg);
  color: var(--en-text);
  -webkit-app-region: no-drag;
}

.en-excalidraw-shell {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: 62px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--en-border);
  border-radius: 18px;
  background: color-mix(in srgb, var(--en-surface) 94%, transparent);
  box-shadow: var(--en-card-shadow);
}

.en-excalidraw-header {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(220px, 420px) minmax(260px, 1fr);
  align-items: center;
  gap: 18px;
  padding: 0 14px 0 18px;
  border-bottom: 1px solid var(--en-border);
  background: color-mix(in srgb, var(--en-surface) 92%, transparent);
  backdrop-filter: blur(18px) saturate(135%);
  z-index: 4;
}

.en-excalidraw-identity,
.en-excalidraw-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.en-excalidraw-mark {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 10px;
  background: color-mix(in srgb, var(--en-primary) 14%, var(--en-soft));
  color: var(--en-primary);
}

.en-excalidraw-mark svg { width: 23px; height: 23px; fill: none; stroke: currentColor; stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
.en-excalidraw-heading { min-width: 0; display: grid; gap: 2px; }
.en-excalidraw-heading strong { font-size: 13px; }
.en-excalidraw-heading span { color: var(--en-muted); font-size: 10px; }

.en-excalidraw-name-wrap { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 9px; color: var(--en-muted); font-size: 10.5px; }
.en-excalidraw-name-input {
  width: 100%;
  height: 36px;
  border: 1px solid var(--en-border);
  outline: 0;
  border-radius: 9px;
  background: var(--en-bg);
  color: var(--en-text);
  font: inherit;
  font-size: 12px;
  padding: 0 10px;
}
.en-excalidraw-name-input:focus { border-color: var(--en-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--en-primary) 14%, transparent); }
.en-excalidraw-actions { justify-content: flex-end; }

.en-excalidraw-button {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--en-border);
  border-radius: 9px;
  padding: 0 10px;
  background: var(--en-bg);
  color: var(--en-text);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.en-excalidraw-button svg { width: 15px; height: 15px; }
.en-excalidraw-button.primary { border-color: var(--en-primary); background: var(--en-primary); color: #fff; }
.en-excalidraw-button:disabled { opacity: 0.5; cursor: wait; }
.en-excalidraw-button kbd { padding: 2px 5px; border: 1px solid color-mix(in srgb, currentColor 22%, transparent); border-radius: 5px; font: 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; opacity: 0.72; }
.spinning { animation: en-spin 0.8s linear infinite; }

.en-excalidraw-workspace { position: relative; min-height: 0; padding: 12px; background: var(--en-bg); }
.en-excalidraw-hint {
  position: absolute;
  left: 50%;
  bottom: 22px;
  z-index: 8;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: min(620px, calc(100% - 48px));
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--en-border) 80%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--en-surface) 88%, transparent);
  color: var(--en-muted);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(14px);
  font-size: 10px;
  pointer-events: none;
}
.en-excalidraw-hint-mark { width: 6px; height: 6px; border-radius: 50%; background: var(--en-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--en-primary) 14%, transparent); }
.en-excalidraw-canvas { width: 100%; height: 100%; overflow: hidden; border: 1px solid var(--en-border); border-radius: 14px; background: #fff; box-shadow: 0 12px 34px rgba(0, 0, 0, 0.12); }

.en-excalidraw-error {
  align-self: start;
  display: flex;
  gap: 12px;
  margin: 70px auto;
  max-width: 560px;
  border: 1px solid color-mix(in srgb, var(--en-danger) 40%, var(--en-border));
  border-radius: 14px;
  padding: 18px;
  background: color-mix(in srgb, var(--en-danger) 10%, var(--en-surface));
  color: var(--en-text);
}
.en-excalidraw-error > svg { width: 20px; height: 20px; color: var(--en-danger); flex: 0 0 auto; }
.en-excalidraw-error p { margin: 5px 0 0; color: var(--en-muted); font-size: 12px; }

:global(.en-excalidraw-open .excalidraw .App-toolbar),
:global(.en-excalidraw-open .excalidraw .Island) {
  border: 1px solid color-mix(in srgb, var(--en-border) 76%, transparent) !important;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12) !important;
}

@keyframes en-spin { to { transform: rotate(360deg); } }

@media (max-width: 900px) {
  .en-excalidraw-overlay { padding: 0; }
  .en-excalidraw-shell { border: 0; border-radius: 0; }
  .en-excalidraw-header { grid-template-columns: minmax(0, 1fr) auto; }
  .en-excalidraw-name-wrap { grid-column: 1 / -1; grid-row: 2; padding-bottom: 8px; }
  .en-excalidraw-shell { grid-template-rows: 98px minmax(0, 1fr); }
  .en-excalidraw-heading span, .en-excalidraw-button kbd { display: none; }
}
</style>

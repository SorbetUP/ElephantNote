import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import { createMuyaFullEditorRuntime } from './fullEditorRuntime.js'
import { createRustBackedMuyaFullEditorRuntime } from './rustBackedFullEditorRuntime.js'
import { isRustMuyaEngineAvailable } from './rustEngineRuntime.js'
import { isMuyaRuntimeActive, isMuyaRuntimeEnabled, readMuyaRuntimeMode } from './runtimeFlags.js'

export const useMuyaRuntimeEditor = ({ markdown = ref(''), mode = ref(readMuyaRuntimeMode()), documentRef = null } = {}) => {
  const rootRef = shallowRef(null)
  const runtimeRef = shallowRef(null)
  const ready = ref(false)
  const mounted = ref(false)
  const enabled = computed(() => isMuyaRuntimeEnabled(mode.value))
  const active = computed(() => isMuyaRuntimeActive(mode.value))
  const html = computed(() => runtimeRef.value?.html || '')
  const state = computed(() => runtimeRef.value?.state || null)

  const mount = async() => {
    if (!rootRef.value || !enabled.value) return null

    const options = { document: documentRef?.value || globalThis.document }
    const rustAvailable = isRustMuyaEngineAvailable(globalThis)

    if (active.value && !rustAvailable) {
      throw new Error('Active Muya mode requires the Rust Tauri engine; JavaScript fallback is disabled.')
    }

    const engineKind = rustAvailable ? 'rust' : 'javascript'
    runtimeRef.value = rustAvailable
      ? createRustBackedMuyaFullEditorRuntime(rootRef.value, markdown.value || '', options)
      : createMuyaFullEditorRuntime(rootRef.value, markdown.value || '', options)

    rootRef.value.dataset.muyaEngine = engineKind
    rootRef.value.dataset.muyaRuntimeMode = mode.value
    globalThis.console?.info?.('[muya-runtime] mounted', {
      engine: engineKind,
      mode: mode.value
    })

    mounted.value = true
    if (runtimeRef.value?.readyPromise) await runtimeRef.value.readyPromise
    ready.value = true
    return runtimeRef.value
  }

  const destroy = () => {
    runtimeRef.value?.destroy?.()
    runtimeRef.value?.live?.cancel?.()
    runtimeRef.value = null
    ready.value = false
    mounted.value = false
  }

  const setMarkdown = async(next, group = 'external') => {
    markdown.value = next
    if (runtimeRef.value) await runtimeRef.value.setMarkdown(next, group)
  }

  const syncFromRuntime = async() => {
    if (!runtimeRef.value) return markdown.value
    if (runtimeRef.value.syncDomToRust) {
      markdown.value = await runtimeRef.value.syncDomToRust('input')
    } else {
      runtimeRef.value.renderLiveNow?.('input')
      markdown.value = runtimeRef.value.markdown
    }
    return markdown.value
  }

  const scheduleLiveRender = () => {
    runtimeRef.value?.scheduleLiveRender?.()
  }

  onMounted(() => { void mount() })
  onBeforeUnmount(destroy)

  watch(markdown, (next) => {
    if (!runtimeRef.value || runtimeRef.value.markdown === next) return
    void runtimeRef.value.setMarkdown(next || '', 'external')
  })

  watch(mode, () => {
    if (enabled.value && rootRef.value && !runtimeRef.value) void mount()
    if (!enabled.value && runtimeRef.value) destroy()
  })

  return {
    rootRef,
    runtimeRef,
    ready,
    mounted,
    enabled,
    active,
    html,
    state,
    mount,
    destroy,
    setMarkdown,
    syncFromRuntime,
    scheduleLiveRender
  }
}

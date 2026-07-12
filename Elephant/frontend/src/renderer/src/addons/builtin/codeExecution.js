import bus from '@/bus'
import { useEditorStore } from '@/store/editor'
import { installExecutableCodeBlocks } from '../../platform/executableCodeBlocks'
import {
  renderExecutableOutput,
  renderExecutableRunButton
} from '../../../../muya/lib/parser/render/renderBlock/renderExecutableCodeRuntime'
import CodeExecutionSettings from './ui/CodeExecutionSettings.vue'
import { mountSettingsComponent } from './settingsComponentHost'

const ADDON_ID = 'elephant.code-execution'

const refreshCurrentEditor = () => {
  const editorStore = useEditorStore()
  const currentId = editorStore.currentFile?.id
  const tab = currentId ? editorStore.tabs.find((item) => item.id === currentId) : editorStore.currentFile
  if (!tab?.id || typeof tab.markdown !== 'string') return
  bus.emit('file-changed', {
    id: tab.id,
    markdown: tab.markdown,
    cursor: tab.cursor || null,
    muyaIndexCursor: tab.muyaIndexCursor || null,
    renderCursor: false,
    history: tab.history,
    blocks: tab.blocks
  })
}

const setExecutionEnabled = async (enabled, logger = console) => {
  const programs = globalThis.elephantnote?.programs
  if (!programs?.list || !programs?.set) return
  try {
    const state = await programs.list()
    const environments = Object.fromEntries((state.environments || []).map((environment) => [environment.id, {
      enabled: environment.enabled !== false,
      executable: environment.configuredExecutable || ''
    }]))
    const customEnvironments = (state.customEnvironments || []).map((environment) => ({
      id: environment.id,
      label: environment.label,
      aliases: environment.aliases || [],
      executable: environment.configuredExecutable || environment.executable || '',
      args: environment.args || [],
      enabled: environment.enabled !== false,
      template: environment.template || 'custom'
    }))
    await programs.set({
      environments: {
        executionEnabled: enabled === true,
        outputLineLimit: state.outputLineLimit || 200,
        environments,
        customEnvironments
      }
    })
    logger.info?.('[code-addon] execution-state', { enabled: enabled === true })
  } catch (error) {
    logger.warn?.('[code-addon] execution-state:failed', { enabled: enabled === true, error: error?.message || String(error) })
  }
}

export const codeExecutionAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Code execution',
    version: '2.1.0',
    description: 'Runs trusted fenced code blocks with selectable local interpreters.',
    author: 'ElephantNote',
    icon: 'terminal',
    defaultEnabled: false,
    removable: true,
    permissions: ['programs.list', 'programs.configure', 'programs.run'],
    contributes: { settings: true, editor: true }
  },

  activate(ctx) {
    const runtime = installExecutableCodeBlocks(globalThis)

    ctx.addSettingsSection({
      id: `${ADDON_ID}.settings`,
      section: 'editor',
      chrome: false,
      title: 'Code execution',
      description: 'Configure retained output and interpreters.',
      order: 55,
      render: mountSettingsComponent(ctx, CodeExecutionSettings)
    })

    ctx.addEditorExtension({
      id: `${ADDON_ID}.fenced-code-runtime`,
      decorateContainer({ block, children }) {
        if (block?.type !== 'pre' || block?.functionType !== 'fencecode') return children
        return [renderExecutableRunButton(block), ...children, renderExecutableOutput(block)]
      }
    })
    globalThis.__ELEPHANT_CODE_EXECUTION_ENABLED__ = true
    void setExecutionEnabled(true, ctx.logger)
    queueMicrotask(refreshCurrentEditor)

    return () => {
      runtime?.dispose?.()
      delete globalThis.__ELEPHANT_CODE_EXECUTION_ENABLED__
      void setExecutionEnabled(false, ctx.logger)
      for (const element of document.querySelectorAll('.en-code-native-run, .en-code-native-output')) {
        element.remove()
      }
      queueMicrotask(refreshCurrentEditor)
    }
  }
}

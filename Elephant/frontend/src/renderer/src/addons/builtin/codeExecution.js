import bus from '@/bus'
import { useEditorStore } from '@/store/editor'
import { installExecutableCodeBlocks } from '../../platform/executableCodeBlocks'
import {
  renderExecutableOutput,
  renderExecutableRunButton
} from '../../../../muya/lib/parser/render/renderBlock/renderExecutableCodeRuntime'

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

export const codeExecutionAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Code execution',
    version: '1.1.0',
    description: 'Runs trusted fenced code blocks with locally installed interpreters.',
    author: 'ElephantNote',
    icon: 'terminal',
    defaultEnabled: false,
    removable: true,
    permissions: ['programs.list', 'programs.configure', 'programs.run'],
    contributes: { settings: true, editor: true }
  },

  activate(ctx) {
    const runtime = installExecutableCodeBlocks(globalThis)
    ctx.addEditorExtension({
      id: `${ADDON_ID}.fenced-code-runtime`,
      decorateContainer({ block, children }) {
        if (block?.type !== 'pre' || block?.functionType !== 'fencecode') return children
        return [renderExecutableRunButton(block), ...children, renderExecutableOutput(block)]
      }
    })
    globalThis.__ELEPHANT_CODE_EXECUTION_ENABLED__ = true
    queueMicrotask(refreshCurrentEditor)

    return () => {
      runtime?.dispose?.()
      delete globalThis.__ELEPHANT_CODE_EXECUTION_ENABLED__
      for (const element of document.querySelectorAll('.en-code-native-run, .en-code-native-output')) {
        element.remove()
      }
      queueMicrotask(refreshCurrentEditor)
    }
  }
}

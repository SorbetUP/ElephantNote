import { installExecutableCodeBlocks } from '../../platform/executableCodeBlocks'

const ADDON_ID = 'elephant.code-execution'

export const codeExecutionAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Code execution',
    version: '1.0.0',
    description: 'Runs trusted fenced code blocks with locally installed interpreters.',
    author: 'ElephantNote',
    icon: 'terminal',
    defaultEnabled: false,
    removable: true,
    permissions: ['programs.list', 'programs.configure', 'programs.run'],
    contributes: { settings: true, editor: true }
  },

  activate() {
    const runtime = installExecutableCodeBlocks(globalThis)
    return () => runtime?.dispose?.()
  }
}

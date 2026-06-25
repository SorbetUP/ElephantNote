import { useEditorStore } from '@/store/editor'
import { useLayoutStore } from '@/store/layout'
import { useProjectStore } from '@/store/project'
import { isDiagnosticVerbose, pushDiagnosticLog } from './rendererDiagnostics'

const summarizeProject = (store) => ({
  root: store.projectTree?.pathname || null,
  rootName: store.projectTree?.name || null,
  pendingTreeEvents: store.pendingTreeEvents?.length || 0,
  activeItem: store.activeItem?.pathname || null
})

const summarizeEditor = (store) => ({
  currentFileId: store.currentFile?.id || null,
  currentFilePath: store.currentFile?.pathname || null,
  currentMarkdownLength: store.currentFile?.markdown?.length || 0,
  tabCount: store.tabs?.length || 0,
  tabIds: store.tabs?.map((tab) => tab.id).slice(0, 8) || []
})

const summarizeLayout = (store) => ({
  showSideBar: store.showSideBar,
  showTabBar: store.showTabBar,
  leftColumn: store.leftColumn,
  rightColumn: store.rightColumn
})

export const installStoreDiagnostics = () => {
  const projectStore = useProjectStore()
  const editorStore = useEditorStore()
  const layoutStore = useLayoutStore()

  pushDiagnosticLog('info', 'store-diagnostics:installed', {
    project: summarizeProject(projectStore),
    editor: summarizeEditor(editorStore),
    layout: summarizeLayout(layoutStore)
  })

  projectStore.$subscribe((mutation) => {
    if (!isDiagnosticVerbose()) return
    pushDiagnosticLog('info', 'pinia:project', {
      type: mutation.type,
      project: summarizeProject(projectStore)
    })
  })

  editorStore.$subscribe((mutation) => {
    const currentId = editorStore.currentFile?.id
    const activeTab = currentId ? editorStore.tabs.find((tab) => tab.id === currentId) : null
    if (activeTab && activeTab !== editorStore.currentFile) {
      editorStore.currentFile = activeTab
      pushDiagnosticLog('info', 'editor-state:current-file-synced-from-tab', {
        id: currentId,
        pathname: activeTab.pathname || null,
        markdownLength: typeof activeTab.markdown === 'string' ? activeTab.markdown.length : 0
      })
    }
    pushDiagnosticLog('info', 'pinia:editor', {
      type: mutation.type,
      editor: summarizeEditor(editorStore)
    })
  })

  layoutStore.$subscribe((mutation) => {
    if (!isDiagnosticVerbose()) return
    pushDiagnosticLog('info', 'pinia:layout', {
      type: mutation.type,
      layout: summarizeLayout(layoutStore)
    })
  })
}

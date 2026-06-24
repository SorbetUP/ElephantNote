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
  if (!isDiagnosticVerbose()) return

  const projectStore = useProjectStore()
  const editorStore = useEditorStore()
  const layoutStore = useLayoutStore()

  pushDiagnosticLog('info', 'store-diagnostics:installed', {
    project: summarizeProject(projectStore),
    editor: summarizeEditor(editorStore),
    layout: summarizeLayout(layoutStore)
  })

  projectStore.$subscribe((mutation) => {
    pushDiagnosticLog('info', 'pinia:project', {
      type: mutation.type,
      events: mutation.events,
      project: summarizeProject(projectStore)
    })
  })

  editorStore.$subscribe((mutation) => {
    pushDiagnosticLog('info', 'pinia:editor', {
      type: mutation.type,
      editor: summarizeEditor(editorStore)
    })
  })

  layoutStore.$subscribe((mutation) => {
    pushDiagnosticLog('info', 'pinia:layout', {
      type: mutation.type,
      layout: summarizeLayout(layoutStore)
    })
  })
}

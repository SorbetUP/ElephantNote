import AtomicGraphView from 'elephant-front/components/views/AtomicGraphView.vue'
import { installGraphRuntimeFixes } from 'elephant-front/runtime/graphRuntimeFixes'
import AiGraphFooterButton from './ui/AiGraphFooterButton.vue'

const ADDON_ID = 'elephant.graph'

export const graphAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Graph',
    version: '1.0.0',
    description: 'Adds the note, Wiki and semantic relationship graph.',
    author: 'ElephantNote',
    icon: 'git-fork',
    defaultEnabled: false,
    removable: true,
    permissions: ['notes.read', 'search.read'],
    contributes: { views: true, editor: true }
  },

  activate(ctx) {
    const graphRuntime = installGraphRuntimeFixes(globalThis)

    ctx.addView({
      id: `${ADDON_ID}.workspace`,
      title: 'Graph',
      description: 'Explore note, Wiki and semantic relationships.',
      icon: 'git-fork',
      kind: 'ai-graph-v1',
      component: AtomicGraphView,
      order: 35
    })

    ctx.registerContribution('editor.footer-items', {
      id: `${ADDON_ID}.footer-button`,
      order: 20,
      component: AiGraphFooterButton
    })

    return () => graphRuntime?.dispose?.()
  }
}

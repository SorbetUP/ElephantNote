const EDITOR_EXTENSION_AREA = 'editor.extensions'

const getEditorExtensions = () => {
  const manager = globalThis?.__ELEPHANT_ADDONS__
  if (typeof manager?.getContributions !== 'function') return []
  return manager.getContributions(EDITOR_EXTENSION_AREA)
    .map((entry) => entry?.contribution)
    .filter(Boolean)
}

export const applyEditorContainerExtensions = ({ parent, block, children, h, t }) => {
  let nextChildren = Array.isArray(children) ? children : []

  for (const extension of getEditorExtensions()) {
    if (typeof extension.decorateContainer !== 'function') continue
    try {
      const result = extension.decorateContainer({ parent, block, children: nextChildren, h, t })
      if (Array.isArray(result)) nextChildren = result
    } catch (error) {
      console.error('[editor-extension] container decoration failed', {
        id: extension.id || '',
        blockKey: block?.key || '',
        error
      })
    }
  }

  return nextChildren
}

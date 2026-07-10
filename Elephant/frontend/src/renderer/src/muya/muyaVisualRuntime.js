import prism, { loadLanguage, transformAliasToOrigin } from 'muya/lib/prism'

import { renderPreviewBlock } from './previewRenderersRuntime.js'

const visualTasks = new WeakMap()

const codeLanguage = (block) => {
  const explicit = block?.dataset?.language || ''
  if (explicit) return explicit
  const code = block?.querySelector?.('.ag-code-content, code')
  return [...(code?.classList || [])]
    .find((className) => className.startsWith('language-'))
    ?.slice('language-'.length) || ''
}

const highlightCodeBlock = async(block) => {
  const code = block.querySelector('.ag-code-content, code')
  if (!code || code.dataset.muyaHighlighted === 'true') return
  const requestedLanguage = codeLanguage(block)
  if (!requestedLanguage || requestedLanguage === 'text' || requestedLanguage === 'plain') return

  const language = transformAliasToOrigin([requestedLanguage])[0] || requestedLanguage
  try {
    await loadLanguage(language)
    const grammar = prism.languages[language]
    if (!grammar) return
    const source = code.textContent || ''
    code.innerHTML = prism.highlight(source, grammar, language)
    code.classList.add(`language-${language}`)
    code.dataset.muyaHighlighted = 'true'
  } catch (error) {
    console.warn('[muya-runtime] unable to highlight code block', {
      language,
      error: error?.message || String(error)
    })
  }
}

const ensureDiagramContainer = (pre) => {
  if (pre.parentElement?.matches?.('figure.ag-container-block')) return pre.parentElement
  const documentRef = pre.ownerDocument
  const figure = documentRef.createElement('figure')
  figure.className = 'ag-paragraph ag-container-block'
  figure.dataset.role = String(pre.dataset.language || '').toUpperCase()
  figure.dataset.muyaBlock = 'code_fence'
  pre.before(figure)
  pre.removeAttribute('data-muya-block')
  figure.append(pre)
  return figure
}

const ensurePreview = (container, kind) => {
  let preview = container.querySelector(':scope > .ag-container-preview')
  if (!preview) {
    preview = container.ownerDocument.createElement('div')
    preview.className = 'ag-paragraph ag-container-preview'
    preview.setAttribute('contenteditable', 'false')
    preview.dataset.muyaUi = 'true'
    container.append(preview)
  }
  preview.dataset.previewKind = kind
  return preview
}

const renderMathPreview = async(figure, block) => {
  const preview = ensurePreview(figure, 'katex')
  const result = await renderPreviewBlock(block)
  preview.innerHTML = result.html || ''
  preview.classList.toggle('ag-math-error', !result.ok)
}

const renderDiagramPreview = async(pre, block, index) => {
  const container = ensureDiagramContainer(pre)
  const preview = ensurePreview(container, block.language || 'diagram')
  const result = await renderPreviewBlock({ ...block, previewId: `muya-diagram-${index}` })
  preview.innerHTML = result.html || ''
  preview.classList.toggle('ag-warn', !result.ok)
}

const enhance = async(root, state) => {
  if (!root || !state?.blocks) return
  const renderedBlocks = [...root.children]

  await Promise.all(state.blocks.map(async(block, index) => {
    const rendered = renderedBlocks[index]
    if (!rendered) return

    if (block.type === 'code_fence') {
      rendered.dataset.language = block.language || ''
      if (block.language === 'mermaid') {
        await renderDiagramPreview(rendered, block, index)
      } else {
        await highlightCodeBlock(rendered)
      }
      return
    }

    if (block.type === 'math_block') {
      await renderMathPreview(rendered, block)
    }
  }))
}

export const enhanceMuyaVisuals = (root, state) => {
  const previous = visualTasks.get(root) || Promise.resolve()
  const task = previous.catch(() => {}).then(() => enhance(root, state))
  visualTasks.set(root, task)
  return task
}

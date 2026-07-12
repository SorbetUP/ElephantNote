import loadRenderer from '../../renderers'
import { CLASS_OR_ID, PREVIEW_DOMPURIFY_CONFIG } from '../../config'
import { sanitize } from '../../utils'

export const renderMermaidCache = async(stateRender) => {
  if (!stateRender.mermaidCache.size) return

  const mermaid = await loadRenderer('mermaid')
  mermaid.initialize({
    securityLevel: 'strict',
    theme: stateRender.muya.options.mermaidTheme
  })
  for (const [key, value] of stateRender.mermaidCache.entries()) {
    const { code } = value
    const target = document.querySelector(key)
    if (!target) continue
    try {
      mermaid.parse(code)
      target.innerHTML = sanitize(code, PREVIEW_DOMPURIFY_CONFIG, true)
      mermaid.init(undefined, target)
    } catch (err) {
      target.innerHTML = '< Invalid Mermaid Codes >'
      target.classList.add(CLASS_OR_ID.AG_MATH_ERROR)
    }
  }
  stateRender.mermaidCache.clear()
}

const createDiagramOptions = (stateRender, functionType) => {
  const options = {}
  if (functionType === 'sequence') {
    Object.assign(options, { theme: stateRender.muya.options.sequenceTheme })
  } else if (functionType === 'vega-lite') {
    Object.assign(options, {
      actions: false,
      tooltip: false,
      renderer: 'svg',
      theme: stateRender.muya.options.vegaTheme
    })
  }
  return options
}

const renderDiagramTarget = async(render, target, key, code, functionType, options) => {
  if (functionType === 'flowchart' || functionType === 'sequence') {
    const diagram = render.parse(code)
    target.innerHTML = ''
    diagram.drawSVG(target, options)
  } else if (functionType === 'plantuml') {
    const diagram = render.parse(code)
    target.innerHTML = ''
    diagram.insertImgElement(target)
  } else if (functionType === 'vega-lite') {
    await render(key, JSON.parse(code), options)
  }
}

export const renderDiagramCache = async(stateRender) => {
  const cache = stateRender.diagramCache
  if (!cache.size) return

  const renderMap = {
    flowchart: await loadRenderer('flowchart'),
    sequence: await loadRenderer('sequence'),
    plantuml: await loadRenderer('plantuml'),
    'vega-lite': await loadRenderer('vega-lite')
  }

  for (const [key, value] of cache.entries()) {
    const target = document.querySelector(key)
    if (!target) continue
    const { code, functionType } = value
    const render = renderMap[functionType]
    const options = createDiagramOptions(stateRender, functionType)
    try {
      await renderDiagramTarget(render, target, key, code, functionType, options)
    } catch (err) {
      target.innerHTML = `< Invalid ${functionType === 'flowchart' ? 'Flow Chart' : 'Sequence'} Codes >`
      target.classList.add(CLASS_OR_ID.AG_MATH_ERROR)
    }
  }
  stateRender.diagramCache.clear()
}

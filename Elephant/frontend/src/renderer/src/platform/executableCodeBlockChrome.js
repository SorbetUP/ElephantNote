const HOST_SELECTOR = [
  '[data-code-block]',
  '[data-role="code-block"]',
  '[data-type="code-block"]',
  '.ag-code-block',
  '.code-block'
].join(', ')

const LANGUAGE_SELECTOR = [
  '.ag-language-input',
  '.language-input',
  '.ag-code-language',
  '.code-block-language',
  '[data-function-type="languageInput"]',
  '[functiontype="languageInput"]',
  '[data-role="language-input"]',
  '[data-language-input]',
  '[data-placeholder*="language" i]',
  '[placeholder*="language" i]',
  '[aria-label*="language" i]'
].join(', ')

const normalize = (value = '') => String(value).trim().toLowerCase()
  .replace(/^language-/, '')
  .replace(/^lang-/, '')

const languageFromPre = (pre) => {
  const code = pre?.querySelector?.('code')
  for (const element of [pre, code]) {
    const explicit = element?.dataset?.language || element?.dataset?.lang || element?.getAttribute?.('lang')
    if (explicit) return normalize(explicit)
    for (const className of element?.classList || []) {
      if (className.startsWith('language-')) return normalize(className.slice('language-'.length))
      if (className.startsWith('lang-')) return normalize(className.slice('lang-'.length))
    }
  }
  return ''
}

const visibleText = (element) => normalize(element?.textContent || element?.value || element?.dataset?.value || '')

const codeHost = (pre) => pre?.closest?.(HOST_SELECTOR) || pre?.parentElement || pre

const nearbyElements = (host, pre) => {
  const elements = new Set()
  for (const root of [host, pre?.parentElement, pre?.previousElementSibling, host?.previousElementSibling]) {
    if (!root) continue
    if (root.nodeType === 1) elements.add(root)
    for (const element of root.querySelectorAll?.('*') || []) elements.add(element)
  }
  return [...elements].filter((element) => !pre?.contains?.(element))
}

const findLanguageControl = (host, pre, language) => {
  const explicit = nearbyElements(host, pre).find((element) => element.matches?.(LANGUAGE_SELECTOR))
  if (explicit) return explicit
  if (!language) return null
  return nearbyElements(host, pre).find((element) => {
    if (element.closest?.('.en-code-runtime-layer')) return false
    if (element.matches?.('button, svg, path, pre, code')) return false
    if (element.children.length > 1) return false
    return visibleText(element) === language
  }) || null
}

const findNativeCopyControl = (host, pre) => nearbyElements(host, pre).find((element) => {
  if (element.closest?.('.en-code-runtime-layer')) return false
  const className = String(element.className || '').toLowerCase()
  const label = `${element.getAttribute?.('aria-label') || ''} ${element.getAttribute?.('title') || ''}`.toLowerCase()
  if (!element.matches?.('button, [role="button"], [tabindex]') && !className.includes('copy')) return false
  return className.includes('copy') || label.includes('copy')
}) || null

const findFenceHint = (host, pre, languageControl) => nearbyElements(host, pre).find((element) => {
  if (element === languageControl || element.closest?.('.en-code-runtime-layer')) return false
  if (element.matches?.('button, pre, code')) return false
  const className = String(element.className || '').toLowerCase()
  const text = visibleText(element)
  return text === 'code fence' || (className.includes('fence') && text.includes('fence'))
}) || null

const codeText = (pre) => String(
  pre?.querySelector?.('code')?.innerText ??
  pre?.querySelector?.('code')?.textContent ??
  pre?.innerText ??
  pre?.textContent ??
  ''
).replace(/\u00a0/g, ' ')

const copyText = async(text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0'
  document.body.append(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

const ensureCopyButton = (state) => {
  const toolbar = state.toolbar
  if (!toolbar || toolbar.querySelector('.en-code-runner-copy')) return
  const runButton = toolbar.querySelector('.en-code-runner-run')
  const button = document.createElement('button')
  const icon = document.createElement('span')
  button.type = 'button'
  button.className = 'en-code-runner-copy'
  button.setAttribute('aria-label', 'Copy code')
  button.title = 'Copy code'
  icon.className = 'en-code-runner-copy-icon'
  button.append(icon)
  button.addEventListener('mousedown', (event) => event.preventDefault())
  button.addEventListener('click', async(event) => {
    event.preventDefault()
    event.stopPropagation()
    try {
      await copyText(codeText(state.pre))
      button.classList.add('is-copied')
      button.setAttribute('aria-label', 'Code copied')
      button.title = 'Code copied'
      setTimeout(() => {
        button.classList.remove('is-copied')
        button.setAttribute('aria-label', 'Copy code')
        button.title = 'Copy code'
      }, 1200)
    } catch (error) {
      console.error('[Code:UI] copy:error', { blockId: state.id, error: error?.message || String(error) })
    }
  })
  toolbar.insertBefore(button, runButton)
}

const clearPreviousChrome = (state) => {
  for (const key of ['languageControl', 'nativeCopyControl', 'fenceHint', 'host']) {
    state.chrome?.[key]?.classList?.remove(
      'en-code-runtime-language-control',
      'en-code-runtime-native-copy',
      'en-code-runtime-fence-hint',
      'en-code-runtime-host'
    )
  }
}

const enhanceState = (state) => {
  if (!state?.pre?.isConnected || !state.toolbar?.isConnected) return
  const host = codeHost(state.pre)
  const language = languageFromPre(state.pre) || normalize(state.language)
  const languageControl = findLanguageControl(host, state.pre, language)
  const nativeCopyControl = findNativeCopyControl(host, state.pre)
  const fenceHint = findFenceHint(host, state.pre, languageControl)

  const previous = state.chrome || {}
  if (
    previous.host !== host ||
    previous.languageControl !== languageControl ||
    previous.nativeCopyControl !== nativeCopyControl ||
    previous.fenceHint !== fenceHint
  ) clearPreviousChrome(state)

  host?.classList?.add('en-code-runtime-host')
  state.pre.classList.add('en-code-runtime-pre')
  languageControl?.classList?.add('en-code-runtime-language-control')
  nativeCopyControl?.classList?.add('en-code-runtime-native-copy')
  fenceHint?.classList?.add('en-code-runtime-fence-hint')
  ensureCopyButton(state)
  state.chrome = { host, languageControl, nativeCopyControl, fenceHint }
}

export const installExecutableCodeBlockChrome = (target = globalThis, runtime) => {
  if (!runtime || runtime.__chromeInstalled) return runtime
  runtime.__chromeInstalled = true
  let scheduled = false

  const refresh = () => {
    scheduled = false
    for (const state of runtime.states.values()) enhanceState(state)
  }
  const schedule = () => {
    if (scheduled) return
    scheduled = true
    ;(target.requestAnimationFrame || ((callback) => setTimeout(callback, 0)))(refresh)
  }

  const originalScan = runtime.scan.bind(runtime)
  runtime.scan = (reason) => {
    const result = originalScan(reason)
    schedule()
    return result
  }
  const originalScheduleScan = runtime.scheduleScan.bind(runtime)
  runtime.scheduleScan = (reason) => {
    originalScheduleScan(reason)
    schedule()
  }

  const observer = new MutationObserver((records) => {
    if (records.some((record) => [...record.addedNodes, ...record.removedNodes].some((node) =>
      node?.nodeType === 1 && !runtime.layer.contains(node)))) schedule()
  })
  observer.observe(document.documentElement || document.body, { subtree: true, childList: true })

  const originalDispose = runtime.dispose.bind(runtime)
  runtime.dispose = () => {
    observer.disconnect()
    for (const state of runtime.states.values()) clearPreviousChrome(state)
    originalDispose()
  }

  schedule()
  return runtime
}

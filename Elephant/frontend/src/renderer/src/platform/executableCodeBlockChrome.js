import './executableCodeBlocks.chrome.css'

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

const RUNTIME_SELECTOR = '.en-code-runtime-layer, .en-code-runtime-toolbar, .en-code-output'

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
const isRuntimeElement = (element) => Boolean(element?.closest?.(RUNTIME_SELECTOR))
const codeHost = (pre) => pre?.closest?.(HOST_SELECTOR) || pre?.parentElement || pre

const nearbyElements = (host, pre) => {
  const elements = new Set()
  for (const root of [host, pre?.parentElement, pre?.previousElementSibling, host?.previousElementSibling]) {
    if (!root || isRuntimeElement(root)) continue
    if (root.nodeType === 1) elements.add(root)
    for (const element of root.querySelectorAll?.('*') || []) {
      if (!isRuntimeElement(element)) elements.add(element)
    }
  }
  return [...elements].filter((element) => !pre?.contains?.(element) && !isRuntimeElement(element))
}

const findLanguageControl = (host, pre, language) => {
  const candidates = nearbyElements(host, pre)
  const explicit = candidates.find((element) => element.matches?.(LANGUAGE_SELECTOR))
  if (explicit) return explicit
  if (!language) return null
  return candidates.find((element) => {
    if (element.matches?.('button, svg, path, pre, code')) return false
    if (element.children.length > 1) return false
    return visibleText(element) === language
  }) || null
}

const findNativeCopyControl = (host, pre) => nearbyElements(host, pre).find((element) => {
  if (isRuntimeElement(element)) return false
  const className = String(element.className || '').toLowerCase()
  if (className.includes('en-code-runner-')) return false
  const label = `${element.getAttribute?.('aria-label') || ''} ${element.getAttribute?.('title') || ''}`.toLowerCase()
  if (!element.matches?.('button, [role="button"], [tabindex]') && !className.includes('copy')) return false
  return className.includes('copy') || label.includes('copy')
}) || null

const findFenceHint = (host, pre, languageControl) => nearbyElements(host, pre).find((element) => {
  if (element === languageControl || isRuntimeElement(element)) return false
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

const ensureRunButtonInvariant = (state) => {
  const toolbar = state?.toolbar
  if (!toolbar?.isConnected) return null
  const runButton = toolbar.querySelector('.en-code-runner-run')
  if (!runButton) {
    console.error('[Code:UI] toolbar:run-button-missing', { blockId: state?.id || '' })
    return null
  }

  let icon = runButton.querySelector('.en-code-runner-run-icon')
  if (!icon) {
    icon = document.createElement('span')
    icon.className = 'en-code-runner-run-icon'
    runButton.replaceChildren(icon)
    console.warn('[Code:UI] toolbar:run-icon-repaired', { blockId: state?.id || '' })
  }

  // executableCodeBlocksV3 historically resolves the active control with
  // querySelector('button'). Keep Run first among buttons until that runtime is
  // fully consolidated, while CSS controls the visual order independently.
  const firstButton = toolbar.querySelector('button')
  if (firstButton !== runButton) toolbar.insertBefore(runButton, firstButton)
  for (const button of [...toolbar.querySelectorAll('button')]) {
    if (button !== runButton && button.previousElementSibling !== runButton) runButton.after(button)
  }
  return runButton
}

const ensureCopyButton = (state) => {
  const toolbar = state.toolbar
  const runButton = ensureRunButtonInvariant(state)
  if (!toolbar || !runButton) return

  let button = toolbar.querySelector('.en-code-runner-copy')
  if (!button) {
    button = document.createElement('button')
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
  }
  runButton.after(button)
  ensureRunButtonInvariant(state)
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
  ensureRunButtonInvariant(state)
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

const mutationTouchesToolbar = (record) => {
  if (record.target?.closest?.('.en-code-runtime-toolbar')) return true
  return [...record.addedNodes, ...record.removedNodes].some((node) =>
    node?.nodeType === 1 && (
      node.matches?.('.en-code-runtime-toolbar, .en-code-runner-run, .en-code-runner-run-icon, .en-code-runner-copy') ||
      node.querySelector?.('.en-code-runtime-toolbar, .en-code-runner-run, .en-code-runner-run-icon, .en-code-runner-copy')
    ))
}

export const installExecutableCodeBlockChrome = (target = globalThis, runtime) => {
  if (!runtime || runtime.__chromeInstalled) return runtime
  runtime.__chromeInstalled = true
  let scheduled = false

  const refresh = () => {
    scheduled = false
    for (const state of runtime.states.values()) {
      try {
        enhanceState(state)
      } catch (error) {
        console.error('[Code:UI] chrome:enhance-error', {
          blockId: state?.id || '',
          error: error?.message || String(error)
        })
      }
    }
  }
  const schedule = () => {
    if (scheduled) return
    scheduled = true
    ;(target.requestAnimationFrame || ((callback) => setTimeout(callback, 0)))(refresh)
  }

  const originalScan = runtime.scan.bind(runtime)
  runtime.scan = (reason) => {
    // Repair toolbar structure before V3 renders it again. This specifically
    // prevents extra controls from changing querySelector('button') semantics.
    for (const state of runtime.states.values()) ensureRunButtonInvariant(state)
    const result = originalScan(reason)
    schedule()
    return result
  }
  const originalScheduleScan = runtime.scheduleScan.bind(runtime)
  runtime.scheduleScan = (reason) => {
    for (const state of runtime.states.values()) ensureRunButtonInvariant(state)
    originalScheduleScan(reason)
    schedule()
  }

  const observer = new MutationObserver((records) => {
    const toolbarMutation = records.some(mutationTouchesToolbar)
    const editorMutation = records.some((record) => [...record.addedNodes, ...record.removedNodes].some((node) =>
      node?.nodeType === 1 && !runtime.layer.contains(node)))
    if (toolbarMutation || editorMutation) schedule()
  })
  observer.observe(document.documentElement || document.body, { subtree: true, childList: true })

  const originalDispose = runtime.dispose.bind(runtime)
  runtime.dispose = () => {
    observer.disconnect()
    for (const state of runtime.states.values()) clearPreviousChrome(state)
    originalDispose()
  }

  runtime.refreshCodeBlockChrome = refresh
  runtime.scheduleCodeBlockChrome = schedule
  schedule()
  return runtime
}

const ADDON_ID = 'elephant.code-execution'
const CONFIG_KEY = 'mobile-config'
const TOOLBAR_CLASS = 'elephant-mobile-code-toolbar'
const OUTPUT_CLASS = 'elephant-mobile-code-output'

const JAVASCRIPT_ALIASES = new Set(['javascript', 'js', 'jsx', 'node', 'mjs', 'cjs'])

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const formatWorkerValueSource = `
const __format = (value) => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || value.message;
  try { return JSON.stringify(value); } catch (_) { return String(value); }
};
`

export default class ElephantMobileCodeExecutionAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.observer = null
    this.running = new Map()
    this.config = { retainOutput: true, outputLineLimit: 200, timeoutMs: 30000 }
  }

  async loadConfig() {
    const stored = await this.api.storage.get(CONFIG_KEY).catch(() => null)
    if (stored && typeof stored === 'object') {
      this.config = {
        retainOutput: stored.retainOutput !== false,
        outputLineLimit: Math.max(1, Math.min(20000, Number(stored.outputLineLimit) || 200)),
        timeoutMs: Math.max(1000, Math.min(120000, Number(stored.timeoutMs) || 30000))
      }
    }
  }

  saveConfig() {
    return this.api.storage.set(CONFIG_KEY, this.config)
  }

  getLanguage(block) {
    const direct = block.dataset?.language || block.dataset?.lang || block.getAttribute?.('data-code-language') || ''
    const className = block.querySelector?.('code')?.className || block.className || ''
    const match = String(className).match(/(?:language-|lang-)([\w.+-]+)/i)
    return String(direct || match?.[1] || 'text').toLowerCase()
  }

  getCode(block) {
    const code = block.querySelector?.('code')
    return String(code?.textContent ?? block.textContent ?? '')
      .replace(/^(Run|Stop|Running…|Copy)\s*/i, '')
      .trimEnd()
  }

  async copyBlock(block, button) {
    const code = this.getCode(block)
    if (!code) return
    await this.window.navigator.clipboard.writeText(code)
    button.textContent = 'Copied'
    this.window.setTimeout(() => { button.textContent = 'Copy' }, 900)
  }

  stopBlock(block, output) {
    const session = this.running.get(block)
    if (!session) return false
    session.cancel()
    output.hidden = false
    output.textContent = 'Execution stopped.'
    output.dataset.exitCode = 'stopped'
    return true
  }

  executeJavaScript(block, code) {
    const limit = this.config.outputLineLimit
    const workerSource = `
${formatWorkerValueSource}
const __nativePost = self.postMessage.bind(self);
for (const __name of ['fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest', 'importScripts', 'Worker', 'SharedWorker']) {
  try { Object.defineProperty(self, __name, { value: undefined, writable: false, configurable: false }); } catch (_) {}
}
const __lines = [];
const __limit = ${limit};
const __write = (...values) => {
  if (__lines.length >= __limit) return;
  __lines.push(values.map(__format).join(' '));
};
self.console = Object.freeze({ log: __write, info: __write, warn: __write, error: __write, debug: __write });
self.onmessage = async () => {
  try {
    const __result = await (async () => {
${code}
    })();
    if (__result !== undefined) __write(__result);
    __nativePost({ ok: true, stdout: __lines.join('\\n'), stderr: '', code: 0 });
  } catch (error) {
    __nativePost({
      ok: false,
      stdout: __lines.join('\\n'),
      stderr: error && (error.stack || error.message) ? (error.stack || error.message) : String(error),
      code: 1
    });
  }
};
`
    const blob = new Blob([workerSource], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    const worker = new Worker(url, { name: 'elephant-code-execution-mobile' })

    return new Promise((resolve, reject) => {
      let settled = false
      let timer = 0
      const finish = (handler, value) => {
        if (settled) return
        settled = true
        this.window.clearTimeout(timer)
        this.running.delete(block)
        worker.terminate()
        URL.revokeObjectURL(url)
        handler(value)
      }
      const cancel = () => finish(reject, new Error('Execution stopped.'))
      timer = this.window.setTimeout(() => {
        finish(reject, new Error(`JavaScript execution timed out after ${Math.round(this.config.timeoutMs / 1000)} seconds.`))
      }, this.config.timeoutMs)
      this.running.set(block, { cancel })
      worker.onmessage = (event) => finish(resolve, event?.data || {})
      worker.onerror = (event) => finish(reject, new Error(event?.message || 'JavaScript worker failed.'))
      worker.postMessage({ run: true })
    })
  }

  async runBlock(block, button, output) {
    if (this.stopBlock(block, output)) {
      button.textContent = 'Run'
      return
    }

    const language = this.getLanguage(block)
    if (!JAVASCRIPT_ALIASES.has(language)) {
      output.hidden = false
      output.textContent = `${language || 'This language'} requires a desktop interpreter. Android and iOS currently execute JavaScript only.`
      output.dataset.exitCode = 'unsupported-mobile-language'
      return
    }

    const code = this.getCode(block)
    if (!code) return
    button.textContent = 'Stop'
    output.hidden = false
    output.textContent = 'Running JavaScript in a separate Worker…'
    try {
      const result = await this.executeJavaScript(block, code)
      const stdout = String(result?.stdout || '')
      const stderr = String(result?.stderr || '')
      output.textContent = [stdout, stderr].filter(Boolean).join(stdout && stderr ? '\n' : '') || `Exited with code ${result?.code ?? 0}`
      output.dataset.exitCode = String(result?.code ?? 0)
      if (!this.config.retainOutput) {
        this.window.setTimeout(() => {
          output.hidden = true
          output.textContent = ''
        }, 2500)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.textContent = message
      output.dataset.exitCode = message === 'Execution stopped.' ? 'stopped' : 'error'
    } finally {
      button.textContent = 'Run'
    }
  }

  decorateBlock(block) {
    if (!(block instanceof this.window.HTMLElement)) return
    if (block.querySelector(`:scope > .${TOOLBAR_CLASS}`)) return
    const code = block.querySelector('code')
    if (!code && !block.matches('[data-function-type="fencecode"], .ag-code-block, pre')) return

    const documentRef = block.ownerDocument
    block.classList.add('elephant-mobile-code-block')
    const toolbar = node(documentRef, 'div', TOOLBAR_CLASS)
    const language = node(documentRef, 'span', 'elephant-mobile-code-language', this.getLanguage(block))
    const actions = node(documentRef, 'div', 'elephant-mobile-code-actions')
    const copy = node(documentRef, 'button', '', 'Copy')
    const run = node(documentRef, 'button', '', 'Run')
    const output = node(documentRef, 'pre', OUTPUT_CLASS)
    copy.type = 'button'
    run.type = 'button'
    output.hidden = true

    copy.onclick = (event) => {
      event.preventDefault()
      event.stopPropagation()
      void this.copyBlock(block, copy)
    }
    run.onclick = (event) => {
      event.preventDefault()
      event.stopPropagation()
      void this.runBlock(block, run, output)
    }
    actions.append(copy, run)
    toolbar.append(language, actions)
    block.prepend(toolbar)
    block.append(output)
  }

  scan(root = this.window.document) {
    const selectors = [
      'pre[data-language]',
      'pre[data-lang]',
      '[data-function-type="fencecode"]',
      '.ag-code-block',
      '.muya-code-block'
    ].join(',')
    for (const block of root.querySelectorAll?.(selectors) || []) this.decorateBlock(block)
  }

  installEditorRuntime() {
    this.scan()
    this.observer = new this.window.MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes || []) {
          if (added?.nodeType !== 1) continue
          if (added.matches?.('pre,[data-function-type="fencecode"],.ag-code-block,.muya-code-block')) this.decorateBlock(added)
          this.scan(added)
        }
      }
    })
    this.observer.observe(this.window.document.body, { childList: true, subtree: true })
  }

  async renderSettings(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-mobile-code-settings')
    const notice = node(documentRef, 'p', '', 'Android and iOS execute JavaScript in a separate Web Worker. Python, shells and custom local interpreters remain desktop-only.')
    const retain = node(documentRef, 'input')
    retain.type = 'checkbox'
    retain.checked = this.config.retainOutput
    retain.onchange = () => {
      this.config.retainOutput = retain.checked
      void this.saveConfig()
    }
    const retainLabel = node(documentRef, 'label', 'elephant-mobile-code-setting')
    retainLabel.append(node(documentRef, 'span', '', 'Retain output'), retain)
    root.append(notice, retainLabel)
    container.replaceChildren(root)
    return () => root.remove()
  }

  async onload(api) {
    await this.loadConfig()
    api.ui.registerStyle(`
      .elephant-mobile-code-block { position:relative; }
      .elephant-mobile-code-toolbar { min-height:32px; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:0 8px; border-bottom:1px solid var(--en-border); background:var(--en-soft); color:var(--en-muted); font-size:11px; }
      .elephant-mobile-code-actions { display:flex; align-items:center; gap:4px; }
      .elephant-mobile-code-toolbar button { min-width:48px; min-height:30px; border:0; border-radius:6px; background:transparent; color:var(--en-text); cursor:pointer; }
      .elephant-mobile-code-output { margin:0; padding:10px; max-height:260px; overflow:auto; border-top:1px solid var(--en-border); background:var(--en-soft); color:var(--en-text); white-space:pre-wrap; }
      .elephant-mobile-code-settings { display:grid; gap:14px; }
      .elephant-mobile-code-setting { display:flex; align-items:center; justify-content:space-between; gap:16px; }
    `, 'code-execution-mobile-package')
    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'editor',
      chrome: false,
      title: 'Code execution',
      description: 'Run JavaScript on Android and iOS without a downloaded executable.',
      order: 55,
      render: (container) => this.renderSettings(container)
    })
    this.window.__ELEPHANT_CODE_EXECUTION_ENABLED__ = true
    this.installEditorRuntime()
  }

  onunload() {
    for (const session of this.running.values()) session.cancel()
    this.running.clear()
    this.observer?.disconnect()
    this.observer = null
    delete this.window.__ELEPHANT_CODE_EXECUTION_ENABLED__
    for (const element of this.window.document.querySelectorAll(`.${TOOLBAR_CLASS}, .${OUTPUT_CLASS}`)) element.remove()
  }
}

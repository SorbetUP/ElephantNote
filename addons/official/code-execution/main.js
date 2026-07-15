const ADDON_ID = 'elephant.code-execution'
const RUN_BUTTON_CLASS = 'elephant-physical-code-run'
const COPY_BUTTON_CLASS = 'elephant-physical-code-copy'
const OUTPUT_CLASS = 'elephant-physical-code-output'
const CONFIG_KEY = 'config'
const DEFAULT_TIMEOUT_MS = 15_000
const POLL_INTERVAL_MS = 120

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const DEFAULT_INTERPRETERS = Object.freeze({
  python: { id: 'python', label: 'Python', executable: 'python3', args: ['-'] },
  javascript: { id: 'javascript', label: 'JavaScript', executable: 'node', args: ['-'] },
  shell: { id: 'shell', label: 'Shell', executable: 'bash', args: ['-s'] },
  ruby: { id: 'ruby', label: 'Ruby', executable: 'ruby', args: ['-'] },
  php: { id: 'php', label: 'PHP', executable: 'php', args: [] },
  perl: { id: 'perl', label: 'Perl', executable: 'perl', args: ['-'] },
  lua: { id: 'lua', label: 'Lua', executable: 'lua', args: ['-'] }
})

const languageAliases = Object.freeze({
  js: 'javascript',
  jsx: 'javascript',
  node: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  rb: 'ruby',
  pl: 'perl'
})

const clone = (value) => JSON.parse(JSON.stringify(value))
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const defaultConfig = () => ({
  retainOutput: true,
  defaultInterpreter: 'python',
  outputLineLimit: 200,
  interpreters: clone(DEFAULT_INTERPRETERS)
})

const normalizeInterpreter = (id, value = {}) => ({
  id: String(value.id || id).trim(),
  label: String(value.label || value.id || id).trim(),
  executable: String(value.executable || '').trim(),
  args: Array.isArray(value.args) ? value.args.map((entry) => String(entry)) : []
})

const normalizeConfig = (value = {}) => {
  const defaults = defaultConfig()
  const source = value && typeof value === 'object' ? value : {}
  const interpreters = { ...defaults.interpreters }
  for (const [id, interpreter] of Object.entries(source.interpreters || {})) {
    const normalized = normalizeInterpreter(id, interpreter)
    if (normalized.id) interpreters[normalized.id] = normalized
  }
  return {
    retainOutput: source.retainOutput !== false,
    defaultInterpreter: String(source.defaultInterpreter || defaults.defaultInterpreter),
    outputLineLimit: Math.max(1, Math.min(20000, Number(source.outputLineLimit) || defaults.outputLineLimit)),
    interpreters
  }
}

const executionText = (result = {}) => {
  const stdout = String(result.stdout || '')
  const stderr = String(result.stderr || '')
  const body = [stdout, stderr].filter(Boolean).join(stdout && stderr ? '\n' : '')
  if (body) return body
  if (result.interrupted) return 'Execution stopped.'
  if (result.timedOut) return `Execution timed out after ${DEFAULT_TIMEOUT_MS / 1000} seconds.`
  return `Exited with code ${result.code ?? 0}`
}

export default class ElephantCodeExecutionAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.observer = null
    this.disposeEditorWatch = null
    this.disposeRuntimeWatch = null
    this.activeRuntime = null
    this.config = defaultConfig()
    this.activeExecutions = new Map()
  }

  async loadConfig() {
    this.config = normalizeConfig(await this.api.storage.get(CONFIG_KEY))
    return this.config
  }

  async saveConfig() {
    this.config = normalizeConfig(this.config)
    await this.api.storage.set(CONFIG_KEY, this.config)
    return this.config
  }

  getLanguage(block) {
    const direct = block.dataset?.language || block.dataset?.lang || block.getAttribute?.('data-code-language') || ''
    const className = block.querySelector?.('code')?.className || block.className || ''
    const match = String(className).match(/(?:language-|lang-)([\w.+-]+)/i)
    const raw = String(direct || match?.[1] || this.config.defaultInterpreter || 'text').toLowerCase()
    return languageAliases[raw] || raw
  }

  getCode(block) {
    const clone = block.cloneNode?.(true)
    clone?.querySelectorAll?.('.elephant-physical-code-toolbar, .elephant-physical-code-output')
      .forEach((element) => element.remove())
    const code = clone?.querySelector?.('code')
    return String(code?.textContent ?? clone?.textContent ?? block.textContent ?? '').trimEnd()
  }

  resolveInterpreter(language) {
    return this.config.interpreters[language] || this.config.interpreters[this.config.defaultInterpreter] || null
  }

  async copyBlock(block, button) {
    const code = this.getCode(block)
    if (!code) return
    await this.window.navigator.clipboard.writeText(code)
    const previous = button.textContent
    button.textContent = 'Copied'
    this.window.setTimeout(() => { button.textContent = previous }, 900)
  }

  async cancelBlock(block, button, output) {
    const active = this.activeExecutions.get(block)
    if (!active) return false
    button.disabled = true
    button.textContent = 'Stopping…'
    output.hidden = false
    output.textContent = 'Stopping the interpreter…'
    try {
      await this.api.native.call('execution.cancel', { executionId: active.executionId })
      active.cancelRequested = true
      return true
    } catch (error) {
      output.textContent = error instanceof Error ? error.message : String(error)
      output.dataset.exitCode = 'cancel-error'
      button.disabled = false
      button.textContent = 'Stop'
      return false
    }
  }

  async waitForExecution(executionId, button, output) {
    while (true) {
      const snapshot = await this.api.native.call('execution.status', { executionId })
      if (!snapshot?.running) return snapshot
      const elapsed = Math.max(0, Date.now() - Number(snapshot.startedAtMs || Date.now()))
      button.disabled = false
      button.textContent = 'Stop'
      output.textContent = `Running… ${(elapsed / 1000).toFixed(1)} s`
      await sleep(POLL_INTERVAL_MS)
    }
  }

  async runBlock(block, button, output) {
    if (this.activeExecutions.has(block)) {
      await this.cancelBlock(block, button, output)
      return
    }

    const language = this.getLanguage(block)
    const interpreter = this.resolveInterpreter(language)
    const code = this.getCode(block)
    if (!code) return
    if (!interpreter?.executable) {
      output.hidden = false
      output.textContent = `No interpreter is configured for ${language}.`
      output.dataset.exitCode = 'configuration-error'
      return
    }

    button.disabled = true
    button.textContent = 'Starting…'
    output.hidden = false
    output.textContent = `Checking ${interpreter.label || interpreter.id}…`
    try {
      const status = await this.api.native.call('interpreter.status', {
        executable: interpreter.executable,
        args: interpreter.args
      })
      if (!status?.available) throw new Error(status?.error || `${interpreter.executable} is unavailable`)

      const started = await this.api.native.call('execute', {
        executable: interpreter.executable,
        args: interpreter.args,
        code,
        cwd: '',
        outputLineLimit: this.config.outputLineLimit,
        timeoutMs: DEFAULT_TIMEOUT_MS
      })
      const executionId = String(started?.executionId || '')
      if (!executionId) throw new Error('The Code execution service returned no execution id.')
      this.activeExecutions.set(block, { executionId, cancelRequested: false })
      button.disabled = false
      button.textContent = 'Stop'
      output.textContent = `Running ${interpreter.label || interpreter.id}…`

      const snapshot = await this.waitForExecution(executionId, button, output)
      if (snapshot?.error) throw new Error(snapshot.error)
      const result = snapshot?.result || {}
      output.textContent = executionText(result)
      output.dataset.exitCode = result.interrupted
        ? 'interrupted'
        : result.timedOut
          ? 'timeout'
          : String(result.code ?? 0)
      output.dataset.truncated = String(Boolean(result.truncated))
      if (!this.config.retainOutput && result.success) {
        this.window.setTimeout(() => {
          output.hidden = true
          output.textContent = ''
        }, 2500)
      }
      await this.api.native.call('execution.forget', { executionId }).catch(() => {})
    } catch (error) {
      output.textContent = error instanceof Error ? error.message : String(error)
      output.dataset.exitCode = 'error'
    } finally {
      this.activeExecutions.delete(block)
      button.disabled = false
      button.textContent = 'Run'
    }
  }

  decorateBlock(block) {
    if (!(block instanceof this.window.HTMLElement)) return
    if (block.querySelector(`:scope > .elephant-physical-code-toolbar`)) return
    if (block.getAttribute('data-elephant-editor-kind') !== 'code_block') return

    const documentRef = block.ownerDocument
    block.classList.add('elephant-physical-code-block')
    const toolbar = node(documentRef, 'div', 'elephant-physical-code-toolbar')
    const language = node(documentRef, 'span', 'elephant-physical-code-language', this.getLanguage(block))
    const actions = node(documentRef, 'div', 'elephant-physical-code-actions')
    const copy = node(documentRef, 'button', COPY_BUTTON_CLASS, 'Copy')
    copy.type = 'button'
    const run = node(documentRef, 'button', RUN_BUTTON_CLASS, 'Run')
    run.type = 'button'
    const output = node(documentRef, 'pre', OUTPUT_CLASS)
    output.hidden = true

    copy.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void this.copyBlock(block, copy)
    })
    run.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void this.runBlock(block, run, output)
    })
    actions.append(copy, run)
    toolbar.append(language, actions)
    block.prepend(toolbar)
    block.append(output)
  }

  scan(runtime = this.activeRuntime) {
    const blocks = runtime?.queryBlocks?.({ kind: 'code_block' }) || []
    for (const descriptor of blocks) this.decorateBlock(descriptor.element || descriptor)
  }

  attachEditorRuntime(runtime) {
    this.observer?.disconnect()
    this.disposeRuntimeWatch?.()
    this.observer = null
    this.disposeRuntimeWatch = null
    this.activeRuntime = runtime?.engine === 'rust' ? runtime : null
    if (!this.activeRuntime) return

    this.scan(this.activeRuntime)
    this.disposeRuntimeWatch = this.activeRuntime.watch?.(() => this.scan(this.activeRuntime), {
      immediate: false
    }) || null

    const root = this.activeRuntime.root
    if (root && this.window.MutationObserver) {
      this.observer = new this.window.MutationObserver(() => this.scan(this.activeRuntime))
      this.observer.observe(root, { childList: true, subtree: true })
    }
  }

  installEditorRuntime() {
    this.disposeEditorWatch = this.api.editor.watch(({ value }) => this.attachEditorRuntime(value))
  }

  async renderSettings(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-code-settings')
    container.replaceChildren(root)
    await this.loadConfig()

    const feedback = node(documentRef, 'p', 'elephant-code-feedback')
    const save = async () => {
      await this.saveConfig()
      feedback.textContent = 'Saved.'
      this.window.setTimeout(() => { feedback.textContent = '' }, 1200)
    }

    const retainRow = node(documentRef, 'label', 'elephant-code-setting-row')
    const retainCopy = node(documentRef, 'div')
    retainCopy.append(node(documentRef, 'strong', '', 'Retain output'), node(documentRef, 'span', '', 'Keep the last result visible inside the note.'))
    const retain = node(documentRef, 'input')
    retain.type = 'checkbox'
    retain.checked = this.config.retainOutput
    retain.onchange = () => { this.config.retainOutput = retain.checked; void save() }
    retainRow.append(retainCopy, retain)

    const defaultRow = node(documentRef, 'label', 'elephant-code-setting-row')
    const defaultCopy = node(documentRef, 'div')
    defaultCopy.append(node(documentRef, 'strong', '', 'Interpreter'), node(documentRef, 'span', '', 'Fallback interpreter when a code language has no exact match.'))
    const select = node(documentRef, 'select')
    const refreshSelect = () => {
      select.replaceChildren()
      for (const interpreter of Object.values(this.config.interpreters)) {
        const option = node(documentRef, 'option', '', interpreter.label || interpreter.id)
        option.value = interpreter.id
        option.selected = interpreter.id === this.config.defaultInterpreter
        select.append(option)
      }
    }
    refreshSelect()
    select.onchange = () => { this.config.defaultInterpreter = select.value; void save() }
    defaultRow.append(defaultCopy, select)

    const interpreterList = node(documentRef, 'div', 'elephant-code-interpreter-list')
    const renderInterpreters = () => {
      interpreterList.replaceChildren()
      for (const interpreter of Object.values(this.config.interpreters)) {
        const row = node(documentRef, 'div', 'elephant-code-interpreter-row')
        const id = node(documentRef, 'input')
        id.value = interpreter.id
        id.disabled = Object.prototype.hasOwnProperty.call(DEFAULT_INTERPRETERS, interpreter.id)
        const label = node(documentRef, 'input')
        label.value = interpreter.label
        const executable = node(documentRef, 'input')
        executable.value = interpreter.executable
        executable.placeholder = 'Executable'
        const args = node(documentRef, 'input')
        args.value = interpreter.args.join(' ')
        args.placeholder = 'Arguments before stdin code'
        const status = node(documentRef, 'button', '', 'Test')
        status.type = 'button'
        status.onclick = async () => {
          status.disabled = true
          try {
            const result = await this.api.native.call('interpreter.status', { executable: executable.value.trim() })
            feedback.textContent = result?.available ? `${label.value || interpreter.id}: available` : result?.error || 'Unavailable'
          } catch (error) {
            feedback.textContent = error instanceof Error ? error.message : String(error)
          } finally {
            status.disabled = false
          }
        }
        const remove = node(documentRef, 'button', 'danger', 'Remove')
        remove.type = 'button'
        remove.disabled = Object.prototype.hasOwnProperty.call(DEFAULT_INTERPRETERS, interpreter.id)
        remove.onclick = () => {
          delete this.config.interpreters[interpreter.id]
          if (this.config.defaultInterpreter === interpreter.id) this.config.defaultInterpreter = 'python'
          refreshSelect()
          renderInterpreters()
          void save()
        }
        const persist = () => {
          interpreter.label = label.value.trim() || interpreter.id
          interpreter.executable = executable.value.trim()
          interpreter.args = args.value.trim() ? args.value.trim().split(/\s+/) : []
          void save()
        }
        label.onchange = persist
        executable.onchange = persist
        args.onchange = persist
        row.append(id, label, executable, args, status, remove)
        interpreterList.append(row)
      }
    }
    renderInterpreters()

    const add = node(documentRef, 'button', 'elephant-code-add', 'Add interpreter')
    add.type = 'button'
    add.onclick = () => {
      let index = 1
      while (this.config.interpreters[`custom-${index}`]) index += 1
      const id = `custom-${index}`
      this.config.interpreters[id] = { id, label: `Custom ${index}`, executable: '', args: ['-'] }
      refreshSelect()
      renderInterpreters()
      void save()
    }

    root.append(retainRow, defaultRow, interpreterList, add, feedback)
    return () => root.remove()
  }

  async onload(api) {
    await this.loadConfig()
    api.ui.registerStyle(`
      .elephant-physical-code-block { position:relative; }
      .elephant-physical-code-toolbar { min-height:32px; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:0 8px; border-bottom:1px solid var(--en-border); background:var(--en-soft); color:var(--en-muted); font-size:11px; }
      .elephant-physical-code-actions { display:flex; align-items:center; gap:4px; }
      .elephant-physical-code-toolbar button { min-width:48px; min-height:26px; border:0; border-radius:6px; background:transparent; color:var(--en-text); cursor:pointer; }
      .elephant-physical-code-toolbar button:disabled { opacity:.6; cursor:default; }
      .elephant-physical-code-output { margin:0; padding:10px; max-height:260px; overflow:auto; border-top:1px solid var(--en-border); background:var(--en-soft); color:var(--en-text); white-space:pre-wrap; overflow-wrap:anywhere; }
      .elephant-physical-code-output[data-exit-code="interrupted"] { color:var(--en-muted); }
      .elephant-physical-code-output[data-exit-code="timeout"],.elephant-physical-code-output[data-exit-code="error"] { color:var(--en-danger,#b42318); }
      .elephant-code-settings { display:grid; gap:8px; }
      .elephant-code-setting-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 0; border-bottom:1px solid var(--en-border); }
      .elephant-code-setting-row > div { display:grid; gap:4px; }
      .elephant-code-setting-row span,.elephant-code-feedback { color:var(--en-muted); font-size:11px; }
      .elephant-code-setting-row select,.elephant-code-interpreter-row input { min-height:34px; padding:0 9px; border:1px solid var(--en-border); border-radius:8px; background:var(--en-surface); color:var(--en-text); box-sizing:border-box; }
      .elephant-code-interpreter-list { display:grid; gap:8px; }
      .elephant-code-interpreter-row { display:grid; grid-template-columns:110px 1fr 1.3fr 1.2fr auto auto; gap:7px; align-items:center; }
      .elephant-code-interpreter-row button,.elephant-code-add { min-height:34px; padding:0 10px; border:1px solid var(--en-border); border-radius:8px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-code-interpreter-row button.danger { color:var(--en-danger,#b42318); }
      @media(max-width:720px){.elephant-code-interpreter-row{grid-template-columns:1fr}.elephant-code-setting-row{align-items:flex-start}.elephant-physical-code-toolbar button{min-height:40px;min-width:58px}}
    `, 'code-execution-package')

    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'editor',
      chrome: false,
      title: 'Code execution',
      description: 'Configure retained output and package-owned interpreters.',
      order: 55,
      render: (container) => this.renderSettings(container)
    })

    this.window.__ELEPHANT_CODE_EXECUTION_ENABLED__ = true
    this.installEditorRuntime()
  }

  async onunload() {
    this.disposeEditorWatch?.()
    this.disposeRuntimeWatch?.()
    this.disposeEditorWatch = null
    this.disposeRuntimeWatch = null
    this.activeRuntime = null
    this.observer?.disconnect()
    this.observer = null
    delete this.window.__ELEPHANT_CODE_EXECUTION_ENABLED__
    const active = [...this.activeExecutions.values()]
    this.activeExecutions.clear()
    await Promise.all(active.map(({ executionId }) =>
      this.api.native.call('execution.cancel', { executionId }).catch(() => null)
    ))
    for (const element of this.window.document.querySelectorAll(`.${RUN_BUTTON_CLASS}, .${COPY_BUTTON_CLASS}, .${OUTPUT_CLASS}, .elephant-physical-code-toolbar`)) {
      element.remove()
    }
  }
}

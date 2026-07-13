const ADDON_ID = 'elephant.code-execution'
const RUN_BUTTON_CLASS = 'elephant-physical-code-run'
const OUTPUT_CLASS = 'elephant-physical-code-output'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const languageAliases = {
  js: 'javascript',
  node: 'javascript',
  py: 'python',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  rs: 'rust'
}

export default class ElephantCodeExecutionAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.observer = null
    this.executionEnabled = false
  }

  programs() {
    const programs = this.window?.elephantnote?.programs
    if (!programs?.list || !programs?.set || !programs?.run) throw new Error('Program execution API is unavailable')
    return programs
  }

  getLanguage(block) {
    const direct = block.dataset?.language || block.dataset?.lang || block.getAttribute?.('data-code-language') || ''
    const className = block.querySelector?.('code')?.className || block.className || ''
    const match = String(className).match(/(?:language-|lang-)([\w.+-]+)/i)
    const raw = String(direct || match?.[1] || 'text').toLowerCase()
    return languageAliases[raw] || raw
  }

  getCode(block) {
    const code = block.querySelector?.('code')
    return String(code?.textContent ?? block.textContent ?? '')
      .replace(/^(Run|Stop|Copy)\s*/i, '')
      .trimEnd()
  }

  async runBlock(block, button, output) {
    const language = this.getLanguage(block)
    const code = this.getCode(block)
    if (!code) return
    button.disabled = true
    button.textContent = 'Stop'
    output.hidden = false
    output.textContent = 'Running…'
    try {
      const result = await this.programs().run(language, code, '')
      const stdout = String(result?.stdout || '')
      const stderr = String(result?.stderr || '')
      const text = [stdout, stderr].filter(Boolean).join(stderr && stdout ? '\n' : '') || `Exited with code ${result?.code ?? 0}`
      output.textContent = text
      output.dataset.exitCode = String(result?.code ?? 0)
    } catch (error) {
      output.textContent = error instanceof Error ? error.message : String(error)
      output.dataset.exitCode = 'error'
    } finally {
      button.disabled = false
      button.textContent = 'Run'
    }
  }

  decorateBlock(block) {
    if (!(block instanceof HTMLElement)) return
    if (block.querySelector(`:scope > .${RUN_BUTTON_CLASS}`)) return
    const code = block.querySelector('code')
    if (!code && !block.matches('[data-function-type="fencecode"], .ag-code-block, pre')) return
    const documentRef = block.ownerDocument
    block.classList.add('elephant-physical-code-block')
    const toolbar = node(documentRef, 'div', 'elephant-physical-code-toolbar')
    const language = node(documentRef, 'span', '', this.getLanguage(block))
    const run = node(documentRef, 'button', RUN_BUTTON_CLASS, 'Run')
    run.type = 'button'
    const output = node(documentRef, 'pre', OUTPUT_CLASS)
    output.hidden = true
    run.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation()
      void this.runBlock(block, run, output)
    })
    toolbar.append(language, run)
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
    this.observer = new MutationObserver((mutations) => {
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

  async setExecutionEnabled(enabled) {
    const programs = this.programs()
    const state = await programs.list()
    const environments = Object.fromEntries((state.environments || []).map((environment) => [environment.id, {
      enabled: environment.enabled !== false,
      executable: environment.configuredExecutable || ''
    }]))
    await programs.set({
      environments: {
        executionEnabled: enabled === true,
        outputLineLimit: state.outputLineLimit || 200,
        environments,
        customEnvironments: state.customEnvironments || []
      }
    })
    this.executionEnabled = enabled === true
  }

  async renderSettings(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-code-settings')
    container.replaceChildren(root)
    const state = await this.programs().list()
    let retainOutput = state.retainOutput !== false
    let selectedInterpreter = state.defaultEnvironment || state.environments?.find((item) => item.enabled !== false)?.id || 'python'

    const retainRow = node(documentRef, 'label', 'elephant-code-setting-row')
    const retainCopy = node(documentRef, 'div')
    retainCopy.append(node(documentRef, 'strong', '', 'Retain output'), node(documentRef, 'span', '', 'Keep the last result visible inside the note.'))
    const retain = node(documentRef, 'input')
    retain.type = 'checkbox'; retain.checked = retainOutput
    retainRow.append(retainCopy, retain)

    const interpreterRow = node(documentRef, 'label', 'elephant-code-setting-row')
    const interpreterCopy = node(documentRef, 'div')
    interpreterCopy.append(node(documentRef, 'strong', '', 'Interpreter'), node(documentRef, 'span', '', 'Default environment for executable code blocks.'))
    const select = node(documentRef, 'select')
    for (const environment of [...(state.environments || []), ...(state.customEnvironments || [])]) {
      const option = node(documentRef, 'option', '', environment.label || environment.id)
      option.value = environment.id
      option.selected = environment.id === selectedInterpreter
      select.append(option)
    }
    interpreterRow.append(interpreterCopy, select)

    const feedback = node(documentRef, 'p', 'elephant-code-feedback')
    const save = async () => {
      retainOutput = retain.checked
      selectedInterpreter = select.value
      const environments = Object.fromEntries((state.environments || []).map((environment) => [environment.id, {
        enabled: environment.enabled !== false,
        executable: environment.configuredExecutable || ''
      }]))
      await this.programs().set({
        environments: {
          executionEnabled: true,
          retainOutput,
          defaultEnvironment: selectedInterpreter,
          outputLineLimit: state.outputLineLimit || 200,
          environments,
          customEnvironments: state.customEnvironments || []
        }
      })
      feedback.textContent = 'Saved.'
    }
    retain.onchange = () => void save()
    select.onchange = () => void save()
    root.append(retainRow, interpreterRow, feedback)
    return () => root.remove()
  }

  async onload(api) {
    api.ui.registerStyle(`
      .elephant-physical-code-block { position:relative; }
      .elephant-physical-code-toolbar { min-height:32px; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:0 8px; border-bottom:1px solid var(--en-border); background:var(--en-soft); color:var(--en-muted); font-size:11px; }
      .elephant-physical-code-toolbar button { min-width:54px; min-height:26px; border:0; border-radius:6px; background:transparent; color:var(--en-text); cursor:pointer; }
      .elephant-physical-code-output { margin:0; padding:10px; max-height:260px; overflow:auto; border-top:1px solid var(--en-border); background:var(--en-soft); color:var(--en-text); white-space:pre-wrap; }
      .elephant-code-settings { display:grid; gap:2px; }
      .elephant-code-setting-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 0; border-bottom:1px solid var(--en-border); }
      .elephant-code-setting-row > div { display:grid; gap:4px; }
      .elephant-code-setting-row span,.elephant-code-feedback { color:var(--en-muted); font-size:11px; }
      .elephant-code-setting-row select { min-height:34px; padding:0 9px; border:1px solid var(--en-border); border-radius:8px; background:var(--en-surface); color:var(--en-text); }
    `, 'code-execution-package')

    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'editor',
      chrome: false,
      title: 'Code execution',
      description: 'Configure retained output and interpreters.',
      order: 55,
      render: (container) => this.renderSettings(container)
    })

    this.window.__ELEPHANT_CODE_EXECUTION_ENABLED__ = true
    await this.setExecutionEnabled(true)
    this.installEditorRuntime()
  }

  async onunload() {
    this.observer?.disconnect()
    this.observer = null
    delete this.window.__ELEPHANT_CODE_EXECUTION_ENABLED__
    await this.setExecutionEnabled(false).catch(() => {})
    for (const element of this.window.document.querySelectorAll(`.${RUN_BUTTON_CLASS}, .${OUTPUT_CLASS}, .elephant-physical-code-toolbar`)) element.remove()
  }
}

const ADDON_ID = 'elephant.ai-ocr'
const SIDECAR_STATUS = 'tauri_addons_sidecar_status'
const SIDECAR_CALL = 'tauri_addons_sidecar_call'

const element = (documentRef, tag, className = '', text = '') => {
  const node = documentRef.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

export default class ElephantOcrAddon {
  constructor(api) {
    this.api = api
    this.invoke = api.experimental?.tauri?.core?.invoke
    this.document = api.experimental?.document
  }

  requireInvoke() {
    if (typeof this.invoke !== 'function') {
      throw new Error('The Elephant native addon bridge is unavailable')
    }
    return this.invoke
  }

  sidecarStatus() {
    return this.requireInvoke()(SIDECAR_STATUS, { addonId: ADDON_ID })
  }

  sidecarCall(method, params = {}, timeoutMs = 30_000) {
    return this.requireInvoke()(SIDECAR_CALL, {
      addonId: ADDON_ID,
      method,
      params,
      timeoutMs
    })
  }

  broker(method, params = {}) {
    return this.requireInvoke()('tauri_addons_call', {
      addonId: ADDON_ID,
      method,
      params
    })
  }

  async getSetting(key, fallback) {
    const value = await this.broker('storage.get', { key })
    return value == null ? fallback : value
  }

  setSetting(key, value) {
    return this.broker('storage.set', { key, value })
  }

  async recognize(path, options = {}) {
    const imagePath = String(path || '').trim()
    if (!imagePath) throw new Error('An image path is required')
    const languages = String(options.languages || await this.getSetting('languages', 'eng,fra')).trim()
    return await this.sidecarCall('ocr.image', {
      path: imagePath,
      languages,
      output: options.output || await this.getSetting('output', 'plain-text')
    }, 120_000)
  }

  async onload(api) {
    api.resources.provide('ocr', Object.freeze({
      status: () => this.sidecarStatus(),
      recognize: (path, options) => this.recognize(path, options)
    }))

    api.commands.register({
      id: `${ADDON_ID}.run`,
      title: 'Run OCR on image',
      description: 'Recognize text from an image through the installed OCR sidecar.',
      run: async (payload = {}) => await this.recognize(payload.path, payload)
    })

    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'ai',
      slot: 'ai.ocr',
      chrome: false,
      title: 'OCR',
      description: 'Configure the separately installed OCR sidecar.',
      order: 63,
      render: (container) => this.renderSettings(container)
    })
  }

  renderSettings(container) {
    const documentRef = this.document || container?.ownerDocument
    if (!documentRef || !container) return () => {}
    container.replaceChildren()

    const root = element(documentRef, 'section', 'elephant-ocr-addon-settings')
    const header = element(documentRef, 'header', 'elephant-ocr-addon-header')
    const titleWrap = element(documentRef, 'div')
    titleWrap.append(
      element(documentRef, 'h4', '', 'OCR sidecar'),
      element(documentRef, 'p', '', 'OCR code and native dependencies exist only inside this installed addon package.')
    )
    const statusBadge = element(documentRef, 'span', 'elephant-ocr-addon-badge', 'Checking…')
    header.append(titleWrap, statusBadge)

    const form = element(documentRef, 'div', 'elephant-ocr-addon-form')
    const languagesLabel = element(documentRef, 'label')
    languagesLabel.append(element(documentRef, 'span', '', 'Languages'))
    const languagesInput = element(documentRef, 'input')
    languagesInput.type = 'text'
    languagesInput.placeholder = 'eng,fra'
    languagesLabel.append(languagesInput)

    const outputLabel = element(documentRef, 'label')
    outputLabel.append(element(documentRef, 'span', '', 'Output'))
    const outputSelect = element(documentRef, 'select')
    for (const [value, label] of [['plain-text', 'Plain text'], ['markdown', 'Markdown']]) {
      const option = element(documentRef, 'option', '', label)
      option.value = value
      outputSelect.append(option)
    }
    outputLabel.append(outputSelect)

    const imageLabel = element(documentRef, 'label', 'wide')
    imageLabel.append(element(documentRef, 'span', '', 'Test image path'))
    const imageInput = element(documentRef, 'input')
    imageInput.type = 'text'
    imageInput.placeholder = '/path/to/image.png'
    imageLabel.append(imageInput)

    const actions = element(documentRef, 'div', 'elephant-ocr-addon-actions wide')
    const refreshButton = element(documentRef, 'button', '', 'Refresh status')
    refreshButton.type = 'button'
    const runButton = element(documentRef, 'button', '', 'Run OCR')
    runButton.type = 'button'
    const feedback = element(documentRef, 'pre', 'elephant-ocr-addon-feedback wide')
    actions.append(refreshButton, runButton)
    form.append(languagesLabel, outputLabel, imageLabel, actions, feedback)
    root.append(header, form)
    container.append(root)

    const updateStatus = async () => {
      statusBadge.textContent = 'Checking…'
      statusBadge.dataset.available = 'false'
      try {
        const status = await this.sidecarStatus()
        statusBadge.textContent = status.available ? `Ready · ${status.platform}` : 'Unavailable'
        statusBadge.dataset.available = String(status.available === true)
        if (!status.available && status.error) feedback.textContent = status.error
      } catch (error) {
        statusBadge.textContent = 'Unavailable'
        feedback.textContent = error instanceof Error ? error.message : String(error)
      }
    }

    const saveSettings = () => Promise.all([
      this.setSetting('languages', languagesInput.value.trim() || 'eng,fra'),
      this.setSetting('output', outputSelect.value || 'plain-text')
    ])

    const runOcr = async () => {
      runButton.disabled = true
      feedback.textContent = 'Running OCR…'
      try {
        await saveSettings()
        const result = await this.recognize(imageInput.value, {
          languages: languagesInput.value,
          output: outputSelect.value
        })
        feedback.textContent = result?.text || ''
      } catch (error) {
        feedback.textContent = error instanceof Error ? error.message : String(error)
      } finally {
        runButton.disabled = false
      }
    }

    const onLanguagesChange = () => void this.setSetting('languages', languagesInput.value.trim() || 'eng,fra')
    const onOutputChange = () => void this.setSetting('output', outputSelect.value || 'plain-text')
    refreshButton.addEventListener('click', updateStatus)
    runButton.addEventListener('click', runOcr)
    languagesInput.addEventListener('change', onLanguagesChange)
    outputSelect.addEventListener('change', onOutputChange)

    void Promise.all([
      this.getSetting('languages', 'eng,fra'),
      this.getSetting('output', 'plain-text')
    ]).then(([languages, output]) => {
      languagesInput.value = String(languages || 'eng,fra')
      outputSelect.value = String(output || 'plain-text')
    })
    void updateStatus()

    return () => {
      refreshButton.removeEventListener('click', updateStatus)
      runButton.removeEventListener('click', runOcr)
      languagesInput.removeEventListener('change', onLanguagesChange)
      outputSelect.removeEventListener('change', onOutputChange)
      root.remove()
    }
  }
}

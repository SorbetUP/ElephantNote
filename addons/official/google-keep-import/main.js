const ADDON_ID = 'elephant.google-keep-import'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

export default class ElephantGoogleKeepImportAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
  }

  async call(action, payload = {}) {
    const client = this.window?.elephantnote?.api
    if (typeof client?.call !== 'function') throw new Error(`Elephant API is unavailable for ${action}`)
    const response = await client.call(action, payload)
    if (response?.ok === false) throw new Error(response.error?.message || `${action} failed`)
    return response?.data ?? response
  }

  render(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-import-package')
    const status = node(documentRef, 'p', 'elephant-import-status')
    const setStatus = (text, error = false) => {
      status.textContent = text
      status.classList.toggle('error', error)
    }

    const keepRow = node(documentRef, 'div', 'elephant-import-row')
    const keepCopy = node(documentRef, 'div', 'elephant-import-copy')
    keepCopy.append(
      node(documentRef, 'strong', '', 'Google Keep archive'),
      node(documentRef, 'span', '', 'Convert an exported archive into local Markdown notes.')
    )
    const keepButton = node(documentRef, 'button', 'elephant-primary-button', 'Import Google Keep')
    keepButton.type = 'button'
    keepButton.addEventListener('click', async () => {
      keepButton.disabled = true
      keepButton.textContent = 'Importing…'
      setStatus('')
      try {
        const result = await this.call('import.googleKeep')
        setStatus(result?.canceled
          ? 'Import canceled.'
          : `Imported ${result?.imported || 0} note${result?.imported === 1 ? '' : 's'}.`)
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), true)
      } finally {
        keepButton.disabled = false
        keepButton.textContent = 'Import Google Keep'
      }
    })
    keepRow.append(keepCopy, keepButton)

    const form = node(documentRef, 'div', 'elephant-import-grid')
    const urlLabel = node(documentRef, 'label')
    const urlInput = node(documentRef, 'input')
    urlInput.type = 'url'
    urlInput.placeholder = 'https://example.com/article'
    urlLabel.append(node(documentRef, 'span', '', 'Source URL'), urlInput)
    const destinationLabel = node(documentRef, 'label')
    const destinationInput = node(documentRef, 'input')
    destinationInput.type = 'text'
    destinationInput.value = 'Sources'
    destinationInput.placeholder = 'Sources'
    destinationLabel.append(node(documentRef, 'span', '', 'Destination folder'), destinationInput)
    form.append(urlLabel, destinationLabel)

    const actions = node(documentRef, 'div', 'elephant-import-actions')
    const pageButton = node(documentRef, 'button', '', 'Import page')
    const rssButton = node(documentRef, 'button', '', 'Import RSS')
    const runSourceImport = async (kind) => {
      const url = urlInput.value.trim()
      if (!url) {
        setStatus('Enter a source URL first.', true)
        return
      }
      pageButton.disabled = true
      rssButton.disabled = true
      setStatus('')
      try {
        const destinationRelativePath = destinationInput.value.trim() || 'Sources'
        if (kind === 'page') {
          const result = await this.call('sources.ingestUrl', { url, destinationRelativePath })
          setStatus(`Imported ${result?.source?.title || 'source'}.`)
        } else {
          const result = await this.call('sources.importRss', { url, destinationRelativePath, limit: 20 })
          setStatus(`Imported ${result?.imported || 0} feed item${result?.imported === 1 ? '' : 's'}.`)
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), true)
      } finally {
        pageButton.disabled = false
        rssButton.disabled = false
      }
    }
    pageButton.addEventListener('click', () => void runSourceImport('page'))
    rssButton.addEventListener('click', () => void runSourceImport('rss'))
    actions.append(pageButton, rssButton)

    root.append(keepRow, form, actions, status)
    container.replaceChildren(root)
    return () => root.remove()
  }

  async onload(api) {
    api.ui.registerStyle(`
      .elephant-import-package { display:grid; gap:14px; }
      .elephant-import-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:15px 16px; border:1px solid var(--en-border); border-radius:12px; background:var(--en-surface); }
      .elephant-import-copy { display:grid; gap:4px; }
      .elephant-import-copy span, .elephant-import-status { color:var(--en-muted); font-size:12px; }
      .elephant-import-grid { display:grid; grid-template-columns:2fr 1fr; gap:12px; }
      .elephant-import-grid label { display:grid; gap:5px; color:var(--en-muted); font-size:11px; }
      .elephant-import-grid input { width:100%; box-sizing:border-box; padding:9px 10px; border:1px solid var(--en-border); border-radius:8px; background:var(--en-surface); color:var(--en-text); }
      .elephant-import-actions { display:flex; gap:8px; }
      .elephant-import-actions button, .elephant-primary-button { min-height:34px; padding:0 12px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-primary-button { background:var(--en-primary); border-color:var(--en-primary); color:white; }
      .elephant-import-status { min-height:18px; margin:0; }
      .elephant-import-status.error { color:var(--en-danger,#b42318); }
      @media (max-width:760px) { .elephant-import-row { align-items:stretch; flex-direction:column; } .elephant-import-grid { grid-template-columns:1fr; } }
    `, 'google-keep-import-package')

    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'import',
      navigationLabel: 'Import',
      navigationIcon: 'download',
      standalone: true,
      chrome: false,
      title: 'Import',
      description: 'Import Google Keep archives, web pages and RSS feeds.',
      order: 20,
      render: (container) => this.render(container)
    })
  }
}

import {
  INVITE_FILE_ACCEPT,
  buildSyncInviteFileName,
  copySyncInvite,
  downloadSyncInvite,
  parseSyncInvite,
  readSyncInviteFile,
  validateSyncInvitePayload
} from './invite.js'

const ADDON_ID = 'elephant.sync'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const invitePayloadFromResult = (result = {}) => String(
  result.rawInvite || result.qrPayload || result.invite || result.manualCode || result.code || result.url || ''
).trim()

const inviteFileName = (status, payload) => {
  const structured = parseSyncInvite(payload)
  return buildSyncInviteFileName(
    status?.vaultName || status?.folderName || 'vault',
    structured?.inviteId || status?.endpointId || 'pairing'
  )
}

export default class ElephantSyncAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.listeners = new Set()
    this.status = { state: 'idle' }
  }

  invoke(command, payload = {}) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return invoke(command, payload)
  }

  async refreshStatus() {
    this.status = await this.invoke('iroh_sync_status').catch((error) => ({ state: 'error', error: error.message || String(error) }))
    for (const listener of this.listeners) listener(this.status)
    return this.status
  }

  subscribe(listener) {
    this.listeners.add(listener)
    listener(this.status)
    return () => this.listeners.delete(listener)
  }

  renderTopBar(container) {
    const documentRef = container.ownerDocument
    const button = node(documentRef, 'button', 'elephant-sync-topbar', 'Sync')
    container.replaceChildren(button)
    let running = false
    const apply = (status) => {
      const state = status?.state || status?.status || 'idle'
      button.dataset.state = state
      button.title = status?.error || `Sync: ${state}`
      button.textContent = running || ['syncing', 'running'].includes(state) ? 'Syncing…' : state === 'error' ? 'Sync error' : 'Sync'
    }
    const off = this.subscribe(apply)
    button.onclick = async () => {
      if (running) return
      running = true
      apply({ state: 'running' })
      try {
        await this.invoke('iroh_sync_run', { payload: {} })
        await this.refreshStatus()
      } catch (error) {
        this.status = { state: 'error', error: error.message || String(error) }
        apply(this.status)
      } finally {
        running = false
        apply(this.status)
      }
    }
    void this.refreshStatus()
    return () => { off(); button.remove() }
  }

  renderSettings(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-sync-settings')
    container.replaceChildren(root)
    let disposed = false
    let outgoingPayload = ''

    const feedback = node(documentRef, 'p', 'elephant-sync-feedback')
    const setFeedback = (message = '', kind = '') => {
      feedback.textContent = message
      feedback.dataset.kind = kind
      feedback.hidden = !message
    }

    const refresh = async () => {
      const status = await this.refreshStatus()
      if (disposed) return
      root.replaceChildren()

      const header = node(documentRef, 'header', 'elephant-sync-header')
      const copy = node(documentRef, 'div')
      const state = status?.state || status?.status || 'idle'
      copy.append(
        node(documentRef, 'h3', '', 'Sync'),
        node(documentRef, 'p', '', `State: ${state}${status?.endpointId ? ` · ${status.endpointId}` : ''}`)
      )
      const run = node(documentRef, 'button', '', 'Sync now')
      run.onclick = async () => {
        run.disabled = true
        setFeedback('Synchronizing the active vault…')
        try {
          await this.invoke('iroh_sync_run', { payload: {} })
          setFeedback('Synchronization completed.', 'success')
          await refresh()
        } catch (error) {
          setFeedback(error?.message || String(error), 'error')
        } finally {
          run.disabled = false
        }
      }
      header.append(copy, run)
      root.append(header)

      const outgoing = node(documentRef, 'div', 'elephant-sync-card')
      outgoing.append(
        node(documentRef, 'h4', '', 'Invite another device'),
        node(documentRef, 'p', 'elephant-sync-muted', 'Create a short-lived encrypted invitation. Share it only with the device that should join this vault.')
      )
      const outgoingText = node(documentRef, 'textarea', 'elephant-sync-invite-output')
      outgoingText.readOnly = true
      outgoingText.rows = 5
      outgoingText.placeholder = 'Create an invitation to reveal its pairing payload.'
      outgoingText.value = outgoingPayload
      const outgoingActions = node(documentRef, 'div', 'elephant-sync-actions')
      const create = node(documentRef, 'button', 'primary', 'Create invitation')
      const copyInvite = node(documentRef, 'button', '', 'Copy')
      const saveInvite = node(documentRef, 'button', '', 'Save file')
      copyInvite.disabled = !outgoingPayload
      saveInvite.disabled = !outgoingPayload

      create.onclick = async () => {
        create.disabled = true
        setFeedback('Creating an encrypted invitation…')
        try {
          const result = await this.invoke('iroh_sync_create_invite')
          outgoingPayload = invitePayloadFromResult(result)
          if (!outgoingPayload) throw new Error('The Sync service returned an empty invitation.')
          validateSyncInvitePayload(outgoingPayload)
          outgoingText.value = outgoingPayload
          copyInvite.disabled = false
          saveInvite.disabled = false
          setFeedback('Invitation created. It expires automatically.', 'success')
        } catch (error) {
          setFeedback(error?.message || String(error), 'error')
        } finally {
          create.disabled = false
        }
      }
      copyInvite.onclick = async () => {
        try {
          await copySyncInvite(this.window, outgoingPayload)
          setFeedback('Invitation copied to the clipboard.', 'success')
        } catch (error) {
          outgoingText.focus()
          outgoingText.select()
          setFeedback(error?.message || String(error), 'error')
        }
      }
      saveInvite.onclick = () => {
        try {
          const fileName = inviteFileName(status, outgoingPayload)
          downloadSyncInvite(documentRef, outgoingPayload, fileName)
          setFeedback(`Saved ${fileName}.`, 'success')
        } catch (error) {
          setFeedback(error?.message || String(error), 'error')
        }
      }
      outgoingActions.append(create, copyInvite, saveInvite)
      outgoing.append(outgoingText, outgoingActions)
      root.append(outgoing)

      const incoming = node(documentRef, 'div', 'elephant-sync-card')
      incoming.append(
        node(documentRef, 'h4', '', 'Join an existing vault'),
        node(documentRef, 'p', 'elephant-sync-muted', 'Paste a manual code, Elephant Sync link or JSON invitation, or import the invitation file from another device.')
      )
      const incomingText = node(documentRef, 'textarea', 'elephant-sync-invite-input')
      incomingText.placeholder = 'Paste an Elephant Sync invitation'
      incomingText.rows = 5
      const fileInput = node(documentRef, 'input', 'elephant-sync-file-input')
      fileInput.type = 'file'
      fileInput.accept = INVITE_FILE_ACCEPT
      fileInput.hidden = true
      const incomingActions = node(documentRef, 'div', 'elephant-sync-actions')
      const importInvite = node(documentRef, 'button', '', 'Import file')
      const accept = node(documentRef, 'button', 'primary', 'Pair this device')
      importInvite.onclick = () => fileInput.click()
      fileInput.onchange = async () => {
        const file = fileInput.files?.[0]
        fileInput.value = ''
        if (!file) return
        try {
          incomingText.value = await readSyncInviteFile(file)
          setFeedback(`Loaded ${file.name}. Review the invitation, then pair this device.`, 'success')
        } catch (error) {
          setFeedback(error?.message || String(error), 'error')
        }
      }
      accept.onclick = async () => {
        accept.disabled = true
        setFeedback('Validating and accepting the invitation…')
        try {
          const validated = validateSyncInvitePayload(incomingText.value)
          await this.invoke('iroh_sync_accept_invite', { invite: validated.payload })
          incomingText.value = ''
          setFeedback('Device paired successfully.', 'success')
          await refresh()
        } catch (error) {
          setFeedback(error?.message || String(error), 'error')
        } finally {
          accept.disabled = false
        }
      }
      incomingActions.append(importInvite, accept)
      incoming.append(incomingText, fileInput, incomingActions)
      root.append(incoming)

      feedback.hidden = !feedback.textContent
      root.append(feedback)

      const details = node(documentRef, 'details', 'elephant-sync-details')
      const summary = node(documentRef, 'summary', '', 'Technical status')
      const pre = node(documentRef, 'pre')
      pre.textContent = JSON.stringify(status, null, 2)
      details.append(summary, pre)
      root.append(details)
    }

    void refresh()
    return () => { disposed = true; root.remove() }
  }

  async onload(api) {
    api.ui.registerStyle(`
      .elephant-sync-topbar { min-height:30px; padding:0 10px; border:1px solid var(--en-border); border-radius:8px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-sync-topbar[data-state=error] { color:var(--en-danger,#b42318); }
      .elephant-sync-settings { display:grid; gap:14px; min-width:0; }
      .elephant-sync-header { display:flex; justify-content:space-between; align-items:center; gap:12px; }
      .elephant-sync-header h3,.elephant-sync-header p,.elephant-sync-card h4,.elephant-sync-card p { margin:0; }
      .elephant-sync-header p,.elephant-sync-muted { color:var(--en-muted); font-size:12px; line-height:1.5; }
      .elephant-sync-header button,.elephant-sync-actions button { min-height:38px; padding:0 12px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-sync-actions button.primary { border-color:var(--en-primary); background:var(--en-primary); color:#fff; }
      .elephant-sync-header button:disabled,.elephant-sync-actions button:disabled { cursor:not-allowed; opacity:.55; }
      .elephant-sync-card { display:grid; gap:10px; min-width:0; padding:14px; border:1px solid var(--en-border); border-radius:14px; background:var(--en-surface); }
      .elephant-sync-card textarea { width:100%; min-width:0; box-sizing:border-box; resize:vertical; padding:10px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-bg); color:var(--en-text); font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; overflow-wrap:anywhere; }
      .elephant-sync-actions { display:flex; flex-wrap:wrap; gap:8px; }
      .elephant-sync-feedback { margin:0; padding:10px 12px; border-radius:10px; background:var(--en-soft); color:var(--en-muted); font-size:12px; }
      .elephant-sync-feedback[data-kind=success] { color:#166534; background:color-mix(in srgb,#22c55e 12%,var(--en-surface)); }
      .elephant-sync-feedback[data-kind=error] { color:var(--en-danger,#b42318); background:color-mix(in srgb,var(--en-danger,#b42318) 10%,var(--en-surface)); }
      .elephant-sync-details { min-width:0; border:1px solid var(--en-border); border-radius:12px; background:var(--en-soft); color:var(--en-muted); }
      .elephant-sync-details summary { cursor:pointer; padding:10px 12px; font-size:12px; }
      .elephant-sync-details pre { max-height:240px; overflow:auto; margin:0; padding:0 12px 12px; font-size:11px; white-space:pre-wrap; overflow-wrap:anywhere; }
      @media (max-width:620px) {
        .elephant-sync-header { align-items:stretch; flex-direction:column; }
        .elephant-sync-header button,.elephant-sync-actions button { width:100%; }
        .elephant-sync-actions { display:grid; grid-template-columns:1fr; }
      }
    `, 'sync-package')
    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')

    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'sync',
      navigationLabel: 'Sync',
      navigationIcon: 'cloud',
      standalone: true,
      chrome: false,
      title: 'Sync',
      description: 'Pair devices and synchronize vaults over encrypted Iroh connections.',
      order: 50,
      render: (container) => this.renderSettings(container)
    })

    api.workspace.registerContribution('top-bar.items', {
      id: `${ADDON_ID}.navigation-control`,
      kind: 'sync-control-v2',
      component: bridge.createDomComponent({ name: 'ElephantPhysicalSyncTopbar', mount: (container) => this.renderTopBar(container) }),
      order: 30
    })

    await this.refreshStatus()
  }

  onunload() {
    return this.invoke('iroh_sync_shutdown').catch(() => {})
  }
}

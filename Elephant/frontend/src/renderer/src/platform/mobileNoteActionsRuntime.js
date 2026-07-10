import bus from '@/bus'
import { useVaultStore } from 'elephant-front/stores/vaultStore'

const FLAG = '__ELEPHANT_MOBILE_NOTE_ACTIONS__'

const splitPath = (pathname = '') => {
  const parts = String(pathname || '').split('/').filter(Boolean)
  const fileName = parts.pop() || 'Untitled.md'
  return { parent: parts.join('/'), fileName }
}

const extensionParts = (fileName = '') => {
  const match = String(fileName).match(/^(.*?)(\.[^.]+)?$/)
  return {
    base: match?.[1] || 'Untitled',
    extension: match?.[2] || '.md'
  }
}

const joinPath = (...parts) => parts
  .flatMap((part) => String(part || '').split('/'))
  .filter(Boolean)
  .join('/')

const duplicateCurrentNote = async (target) => {
  const store = useVaultStore()
  const sourcePath = store.openedNotePath
  if (!sourcePath) throw new Error('Open a note before duplicating it.')
  const bridge = target.elephantnote
  if (!bridge?.notes?.read || !bridge?.notes?.write || !bridge?.listDirectory) {
    throw new Error('The native note backend is unavailable.')
  }

  const { parent, fileName } = splitPath(sourcePath)
  const { base, extension } = extensionParts(fileName)
  const entries = await bridge.listDirectory({ relativePath: parent, includePreview: false })
  const existing = new Set((Array.isArray(entries) ? entries : []).map((entry) => entry.path))
  let index = 1
  let candidate
  do {
    const suffix = index === 1 ? ' copy' : ` copy ${index}`
    candidate = joinPath(parent, `${base}${suffix}${extension}`)
    index += 1
  } while (existing.has(candidate))

  const source = await bridge.notes.read({ relativePath: sourcePath })
  const markdown = String(source?.content ?? source?.markdown ?? '')
  await bridge.notes.write({ relativePath: candidate, markdown })
  const refreshed = await bridge.listDirectory({ relativePath: parent, includePreview: true })
  if (parent === store.currentPath) store.entries = refreshed
  if (!parent) store.rootEntries = refreshed
  const entry = refreshed.find((item) => item.path === candidate) || {
    path: candidate,
    title: `${base} copy`,
    kind: 'note',
    type: 'note',
    updatedAt: new Date().toISOString()
  }
  store.openNote(entry)
}

const visibleTagButtons = (target) => [...target.document.querySelectorAll(
  '.en-main.has-editor-open .en-note-chip-rail .en-note-chip:not(.en-note-chip-add):not(.en-note-chip-muted)'
)]

const closeTagManager = (target) => {
  target.document.querySelector('.en-mobile-tag-manager-backdrop')?.remove()
}

const renderTagManager = (target) => {
  closeTagManager(target)
  const buttons = visibleTagButtons(target)
  const backdrop = target.document.createElement('div')
  backdrop.className = 'en-mobile-tag-manager-backdrop'
  backdrop.innerHTML = `
    <section class="en-mobile-tag-manager" role="dialog" aria-modal="true" aria-label="Tags">
      <header>
        <strong>Tags</strong>
        <button type="button" data-tag-action="close" aria-label="Close">×</button>
      </header>
      <div class="en-mobile-tag-list"></div>
      <button type="button" class="en-mobile-tag-add" data-tag-action="add">+ Add tag</button>
    </section>
  `
  const list = backdrop.querySelector('.en-mobile-tag-list')
  if (!buttons.length) {
    list.innerHTML = '<p>No tags on this note.</p>'
  } else {
    buttons.forEach((sourceButton, index) => {
      const row = target.document.createElement('div')
      row.className = 'en-mobile-tag-row'
      const label = target.document.createElement('span')
      label.textContent = sourceButton.textContent?.trim() || `Tag ${index + 1}`
      const remove = target.document.createElement('button')
      remove.type = 'button'
      remove.dataset.tagRemove = String(index)
      remove.setAttribute('aria-label', `Remove ${label.textContent}`)
      remove.textContent = 'Remove'
      row.append(label, remove)
      list.appendChild(row)
    })
  }

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop || event.target.closest('[data-tag-action="close"]')) {
      closeTagManager(target)
      return
    }
    if (event.target.closest('[data-tag-action="add"]')) {
      closeTagManager(target)
      target.document.querySelector('.en-main.has-editor-open .en-note-chip-add')?.click?.()
      return
    }
    const remove = event.target.closest('[data-tag-remove]')
    if (!remove) return
    const index = Number(remove.dataset.tagRemove)
    const sourceButton = visibleTagButtons(target)[index]
    sourceButton?.dispatchEvent?.(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: target
    }))
    target.requestAnimationFrame(() => renderTagManager(target))
  })
  target.document.body.appendChild(backdrop)
}

export const installMobileNoteActionsRuntime = (target = globalThis) => {
  if (!target?.document || target[FLAG]) return false
  target[FLAG] = true

  const onDuplicate = () => {
    void duplicateCurrentNote(target).catch((error) => {
      console.error('[mobile-note-actions] duplicate failed', error)
      target.alert?.(error?.message || String(error))
    })
  }
  const onTags = () => renderTagManager(target)

  bus.on('elephantnote:duplicate-note', onDuplicate)
  bus.on('elephantnote:open-tags', onTags)

  target.__ELEPHANT_MOBILE_NOTE_ACTIONS_DISPOSE__ = () => {
    bus.off('elephantnote:duplicate-note', onDuplicate)
    bus.off('elephantnote:open-tags', onTags)
    closeTagManager(target)
    target[FLAG] = false
  }
  return true
}

installMobileNoteActionsRuntime()

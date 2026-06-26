import bus from '@/bus'

const SLASH_LOG_PREFIX = '[slash-menu]'

const describeElement = (element) => {
  if (!element) return null
  const className = typeof element.className === 'string'
    ? element.className
    : String(element.getAttribute?.('class') || '')
  return {
    tag: element.tagName || '',
    id: element.id || '',
    className,
    text: String(element.textContent || '').trim().slice(0, 120),
    role: element.getAttribute?.('role') || '',
    ariaLabel: element.getAttribute?.('aria-label') || ''
  }
}

const findSlashMenuContainer = (target) => {
  if (!target?.closest) return null
  return target.closest('.ag-quick-insert, .ag-front-menu, [class*="quick"], [class*="front"]')
}

const findSlashMenuItem = (target) => {
  const container = findSlashMenuContainer(target)
  if (!container || !target?.closest) return null
  return target.closest('.item, [role="menuitem"], button, li, .sub-title, a, div')
}

const findSlashMenuTarget = (target) => {
  if (!target?.closest) return null
  return target.closest([
    '[class*="quick"]',
    '[class*="insert"]',
    '[class*="front"]',
    '[class*="menu"]',
    '[class*="ag-"]',
    '[role="menuitem"]',
    'button',
    'li'
  ].join(','))
}

const activeEditorSnapshot = () => {
  const active = document.activeElement
  const selection = window.getSelection?.()
  return {
    activeElement: describeElement(active),
    selectionTextLength: String(selection?.toString?.() || '').length,
    rangeCount: selection?.rangeCount || 0
  }
}

const isExcalidrawMenuChoice = (item, rawTarget) => {
  const itemText = String(item?.textContent || '').trim().toLowerCase()
  const targetText = String(rawTarget?.textContent || '').trim().toLowerCase()
  const itemClass = String(item?.getAttribute?.('class') || '').toLowerCase()
  const targetClass = String(rawTarget?.getAttribute?.('class') || '').toLowerCase()
  return itemText === 'insert drawing' ||
    itemText === 'excalidraw' ||
    targetText === 'insert drawing' ||
    targetText === 'excalidraw' ||
    itemClass.includes('excalidraw') ||
    targetClass.includes('excalidraw')
}

const openExcalidrawFromSlashMenu = () => {
  const fileName = `excalidraw-${Date.now()}.png`
  bus.emit('ELEPHANT::open-excalidraw', {
    fileName,
    title: 'Excalidraw',
    saveMode: 'png',
    insertOnSave: true
  })
}

export const installSlashMenuDiagnostics = (target = globalThis) => {
  if (!target?.document || target.__ELEPHANT_SLASH_MENU_DIAGNOSTICS__) return false
  target.__ELEPHANT_SLASH_MENU_DIAGNOSTICS__ = true

  const keydown = (event) => {
    if (event.key !== '/' && event.key !== 'Enter' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const slashLike = event.key === '/' || Boolean(document.querySelector('[class*="quick"], [class*="front"], [class*="menu"]'))
    if (!slashLike) return
    console.info(`${SLASH_LOG_PREFIX} keydown`, {
      key: event.key,
      code: event.code,
      target: describeElement(event.target),
      defaultPrevented: event.defaultPrevented,
      ...activeEditorSnapshot()
    })
  }

  const preserveSelectionBeforeMenuClick = (event) => {
    const menuItem = findSlashMenuItem(event.target)
    if (!menuItem) return
    event.preventDefault()
    console.info(`${SLASH_LOG_PREFIX} preserve-selection`, {
      eventType: event.type,
      item: describeElement(menuItem),
      rawTarget: describeElement(event.target),
      defaultPrevented: event.defaultPrevented,
      ...activeEditorSnapshot()
    })
  }

  const handleSlashMenuClick = (event) => {
    const menuItem = findSlashMenuItem(event.target)
    const menuContainer = findSlashMenuContainer(event.target)
    if (!menuItem || !menuContainer || !isExcalidrawMenuChoice(menuItem, event.target)) return
    console.info(`${SLASH_LOG_PREFIX} excalidraw-command`, {
      item: describeElement(menuItem),
      rawTarget: describeElement(event.target),
      ...activeEditorSnapshot()
    })
    window.setTimeout(openExcalidrawFromSlashMenu, 0)
  }

  const pointer = (event) => {
    const menuTarget = findSlashMenuTarget(event.target)
    if (!menuTarget) return
    console.info(`${SLASH_LOG_PREFIX} ${event.type}`, {
      target: describeElement(menuTarget),
      rawTarget: describeElement(event.target),
      button: event.button,
      defaultPrevented: event.defaultPrevented,
      ...activeEditorSnapshot()
    })
  }

  const mutationObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes || []) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue
        const element = node
        const match = element.matches?.('[class*="quick"], [class*="front"], [class*="menu"]')
          ? element
          : element.querySelector?.('[class*="quick"], [class*="front"], [class*="menu"]')
        if (match) {
          console.info(`${SLASH_LOG_PREFIX} mounted`, { target: describeElement(match) })
        }
      }
    }
  })

  document.addEventListener('keydown', keydown, true)
  document.addEventListener('pointerdown', preserveSelectionBeforeMenuClick, true)
  document.addEventListener('mousedown', preserveSelectionBeforeMenuClick, true)
  document.addEventListener('pointerdown', pointer, true)
  document.addEventListener('click', handleSlashMenuClick, true)
  document.addEventListener('click', pointer, true)
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true })
  console.info(`${SLASH_LOG_PREFIX} diagnostics:installed`)
  return true
}

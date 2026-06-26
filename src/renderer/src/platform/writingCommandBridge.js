import bus from '@/bus'

const COMMAND_LOG_PREFIX = '[writing-command]'
const DUPLICATE_COMMAND_WINDOW_MS = 350

let lastCommand = { name: '', at: 0 }

const normalizeCommand = (command = '') => String(command || '').trim().toLowerCase()

const shouldSkipDuplicateCommand = (command) => {
  const now = Date.now()
  const duplicate = lastCommand.name === command && now - lastCommand.at < DUPLICATE_COMMAND_WINDOW_MS
  lastCommand = { name: command, at: now }
  return duplicate
}

const openExcalidraw = () => {
  bus.emit('ELEPHANT::open-excalidraw', {
    fileName: `excalidraw-${Date.now()}.png`,
    title: 'Excalidraw',
    saveMode: 'png',
    insertOnSave: true
  })
}

const runWritingCommand = (command) => {
  const normalized = normalizeCommand(command)
  if (!normalized) return false
  if (shouldSkipDuplicateCommand(normalized)) {
    console.info(`${COMMAND_LOG_PREFIX} duplicate ignored`, { command: normalized })
    return true
  }
  console.info(`${COMMAND_LOG_PREFIX} run`, { command: normalized })
  switch (normalized) {
    case 'heading-2':
      bus.emit('paragraph', 'heading 2')
      return true
    case 'bold':
      bus.emit('format', 'strong')
      return true
    case 'italic':
      bus.emit('format', 'em')
      return true
    case 'strike':
      bus.emit('format', 'del')
      return true
    case 'link':
      bus.emit('format', 'link')
      return true
    case 'bullets':
      bus.emit('paragraph', 'ul-bullet')
      return true
    case 'numbers':
      bus.emit('paragraph', 'ol-order')
      return true
    case 'tasks':
      bus.emit('paragraph', 'ul-task')
      return true
    case 'code':
      bus.emit('format', 'inline_code')
      return true
    case 'quote':
      bus.emit('paragraph', 'blockquote')
      return true
    case 'table':
      bus.emit('paragraph', 'table')
      return true
    case 'excalidraw':
      openExcalidraw()
      return true
    case 'horizontal-rule':
      bus.emit('insert-horizontal-rule')
      return true
    default:
      console.warn(`${COMMAND_LOG_PREFIX} unknown`, { command })
      return false
  }
}

export const installWritingCommandBridge = (target = globalThis) => {
  if (target.__ELEPHANT_WRITING_COMMAND_BRIDGE__) return false
  target.__ELEPHANT_WRITING_COMMAND_BRIDGE__ = true
  bus.on('elephantnote-writing-command', runWritingCommand)
  console.info(`${COMMAND_LOG_PREFIX} installed`)
  return true
}

import { editorCommands } from 'muya/lib/rust/protocol'

const normalize = (value) => String(value || '').trim().toLowerCase()

export const rustFormatCommand = (type) => {
  switch (normalize(type)) {
    case 'strong':
    case 'bold':
      return editorCommands.toggleStrong()
    case 'em':
    case 'emphasis':
    case 'italic':
      return editorCommands.toggleEmphasis()
    case 'del':
    case 'strike':
    case 'strikethrough':
      return editorCommands.toggleStrike()
    default:
      return null
  }
}

export const rustParagraphCommand = (type) => {
  const value = normalize(type)
  if (value === 'paragraph' || value === 'p') return editorCommands.setParagraph()
  const match = value.match(/^heading(?:\s+|[-_])?([1-6])$/)
  return match ? editorCommands.setHeading(Number(match[1])) : null
}

export const rustBusCommand = (event, payload) => {
  switch (event) {
    case 'undo':
      return editorCommands.undo()
    case 'redo':
      return editorCommands.redo()
    case 'format':
      return rustFormatCommand(payload)
    case 'paragraph':
      return rustParagraphCommand(payload)
    case 'duplicate':
      return editorCommands.duplicateBlock()
    case 'deleteParagraph':
      return editorCommands.deleteBlock()
    case 'createParagraph':
      return editorCommands.insertParagraphAfterBlock()
    case 'insertParagraph':
      return editorCommands.insertParagraph()
    default:
      return null
  }
}

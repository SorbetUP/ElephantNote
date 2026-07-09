const INDENT = '  '

export const indentationForNewline = (source = '', offset = 0, language = '') => {
  const safeOffset = Math.max(0, Math.min(Number(offset) || 0, source.length))
  const lineStart = source.lastIndexOf('\n', safeOffset - 1) + 1
  const beforeCursor = source.slice(lineStart, safeOffset)
  const baseIndent = beforeCursor.match(/^\s*/)?.[0] || ''
  const trimmed = beforeCursor.trimEnd()
  const normalizedLanguage = String(language || '').toLowerCase()
  const opensBlock = /[:{[(]$/.test(trimmed) ||
    ((normalizedLanguage === 'ruby' || normalizedLanguage === 'bash' || normalizedLanguage === 'sh') && /\b(do|then)$/.test(trimmed))
  return `\n${baseIndent}${opensBlock ? INDENT : ''}`
}

export const indentationEdit = (source = '', start = 0, end = start, outdent = false) => {
  const safeStart = Math.max(0, Math.min(Number(start) || 0, source.length))
  const safeEnd = Math.max(safeStart, Math.min(Number(end) || safeStart, source.length))

  if (safeStart === safeEnd && !outdent) {
    return {
      replaceStart: safeStart,
      replaceEnd: safeEnd,
      replacement: INDENT,
      caretOffset: safeStart + INDENT.length
    }
  }

  const lineStart = source.lastIndexOf('\n', safeStart - 1) + 1
  const endBreak = source.indexOf('\n', safeEnd)
  const lineEnd = endBreak === -1 ? source.length : endBreak
  const block = source.slice(lineStart, lineEnd)
  const lines = block.split('\n')
  const replacement = lines
    .map((line) => outdent ? line.replace(/^( {1,2}|\t)/, '') : `${INDENT}${line}`)
    .join('\n')

  return {
    replaceStart: lineStart,
    replaceEnd: lineEnd,
    replacement,
    caretOffset: lineStart + replacement.length
  }
}

export const normalizeOutputLineLimit = (value, fallback = 200) => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(10, Math.min(5000, parsed))
}

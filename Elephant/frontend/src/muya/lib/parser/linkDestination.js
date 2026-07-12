export const parseSrcAndTitle = (text = '') => {
  const parts = text.split(/\s+/)
  if (parts.length === 1) return { src: text.trim(), title: '' }

  const rawTitle = text.replace(/^[^ ]+ +/, '')
  const titleReg = /^(['"])(.*?)\1$/
  const title = rawTitle && titleReg.test(rawTitle)
    ? rawTitle.replace(titleReg, '$2')
    : ''
  const src = title
    ? text.substring(0, text.length - rawTitle.length).trim()
    : text.trim()
  return { src, title }
}

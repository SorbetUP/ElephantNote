import runSanitize from './dompurify'

const HTML_TAG_REPLACEMENTS = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

export const escapeHTML = (value) =>
  value.replace(
    /[&<>'"]/g,
    (tag) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    })[tag] || tag
  )

export const unescapeHTML = (value) =>
  value.replace(
    /(?:&amp;|&lt;|&gt;|&quot;|&#39;)/g,
    (tag) => ({
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&#39;': "'",
      '&quot;': '"'
    })[tag] || tag
  )

export const escapeInBlockHtml = (html) => {
  return html.replace(/(<(style|script|title)[^<>]*>)([\s\S]*?)(<\/\2>)/g, (match, open, tag, content, close) => {
    return `${escapeHTML(open)}${content}${escapeHTML(close)}`
  })
}

export const escapeHtmlTags = (html) => {
  return html.replace(/[&<>"']/g, (character) => HTML_TAG_REPLACEMENTS[character])
}

export const sanitize = (html, purifyOptions, disableHtml) => {
  if (disableHtml) return runSanitize(escapeHtmlTags(html), purifyOptions)
  return runSanitize(escapeInBlockHtml(html), purifyOptions)
}

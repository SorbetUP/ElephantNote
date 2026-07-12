export const escape = function escape(html, encode) {
  if (encode) {
    if (escape.escapeTest.test(html)) {
      return html.replace(escape.escapeReplace, function(character) {
        return escape.replacements[character]
      })
    }
  } else if (escape.escapeTestNoEncode.test(html)) {
    return html.replace(escape.escapeReplaceNoEncode, function(character) {
      return escape.replacements[character]
    })
  }
  return html
}

escape.escapeTest = /[&<>"']/
escape.escapeReplace = /[&<>"']/g
escape.replacements = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}
escape.escapeTestNoEncode = /[<>"']|&(?!#?\w+;)/
escape.escapeReplaceNoEncode = /[<>"']|&(?!#?\w+;)/g

export const unescape = function unescape(html) {
  return html.replace(/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/gi, function(match, name) {
    name = name.toLowerCase()
    if (name === 'colon') return ':'
    if (name.charAt(0) === '#') {
      return name.charAt(1) === 'x'
        ? String.fromCharCode(parseInt(name.substring(2), 16))
        : String.fromCharCode(+name.substring(1))
    }
    return ''
  })
}

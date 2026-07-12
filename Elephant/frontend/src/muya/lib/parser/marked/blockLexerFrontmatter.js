export default function consumeFrontmatter(lexer, state) {
  if (!lexer.options.frontMatter) return
  const match = lexer.rules.frontmatter.exec(state.src)
  if (lexer.checkFrontmatter && state.top && match) {
    state.src = state.src.substring(match[0].length)
    let lang
    let style
    let text
    if (match[1]) {
      lang = 'yaml'
      style = '-'
      text = match[1]
    } else if (match[2]) {
      lang = 'toml'
      style = '+'
      text = match[2]
    } else if (match[3] || match[4]) {
      lang = 'json'
      style = match[3] ? ';' : '{'
      text = match[3] || match[4]
    }
    lexer.tokens.push({ type: 'frontmatter', text, style, lang })
  }
  lexer.checkFrontmatter = false
}

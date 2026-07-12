import footerHeaderCss from '../assets/styles/headerFooterStyle.css?inline'
import { EXPORT_DOMPURIFY_CONFIG } from '../config'
import { sanitize } from '../utils'

const HF_TABLE_START = '<table class="page-container">'
const HF_TABLE_END = '</table>'
const HF_TABLE_FOOTER = `<tfoot class="page-footer-fake"><tr><td>
  <div class="hf-container">
    &nbsp;
  </div>
</td></tr></tfoot>`

const createMarkdownArticle = html => `<article class="markdown-body">${html}</article>`

const getHeaderFooterStyledClass = value => {
  if (value === undefined) return ''
  return !value ? ' simple' : ' styled'
}

const createTableBody = html => `<tbody><tr><td>
  <div class="main-container">
    ${createMarkdownArticle(html)}
  </div>
</td></tr></tbody>`

const createTableHeader = options => {
  const { header, headerFooterStyled } = options
  const { type, left, center, right } = header
  let headerClass = type === 1 ? 'single' : ''
  headerClass += getHeaderFooterStyledClass(headerFooterStyled)
  return `<thead class="page-header ${headerClass}"><tr><th>
  <div class="hf-container">
    <div class="header-content-left">${left}</div>
    <div class="header-content">${center}</div>
    <div class="header-content-right">${right}</div>
  </div>
</th></tr></thead>`
}

const createRealFooter = options => {
  const { footer, headerFooterStyled } = options
  const { type, left, center, right } = footer
  let footerClass = type === 1 ? 'single' : ''
  footerClass += getHeaderFooterStyledClass(headerFooterStyled)
  return `<div class="page-footer ${footerClass}">
  <div class="hf-container">
    <div class="footer-content-left">${left}</div>
    <div class="footer-content">${center}</div>
    <div class="footer-content-right">${right}</div>
  </div>
</div>`
}

export default function prepareExportHtml(html, options) {
  const { header, footer } = options
  if (!header && !footer) return createMarkdownArticle(html)

  if (!options.extraCss) options.extraCss = footerHeaderCss
  else options.extraCss = footerHeaderCss + options.extraCss

  let output = HF_TABLE_START
  if (header) output += createTableHeader(options)
  if (footer) {
    output += HF_TABLE_FOOTER
    output = createRealFooter(options) + output
  }
  output = output + createTableBody(html) + HF_TABLE_END
  return sanitize(output, EXPORT_DOMPURIFY_CONFIG, false)
}

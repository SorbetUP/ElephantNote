import { PREVIEW_DOMPURIFY_CONFIG, URL_REG } from '../config'
import { getPageTitle, sanitize } from '../utils'

const pasteHtml = ContentState => {
  ContentState.prototype.standardizeHTML = async function(rawHtml) {
    if (/<body>[\s\S]*<\/body>/.test(rawHtml)) {
      const match = /<body>([\s\S]*)<\/body>/.exec(rawHtml)
      if (match && typeof match[1] === 'string') rawHtml = match[1]
    }

    const sanitizedHtml = sanitize(
      rawHtml,
      PREVIEW_DOMPURIFY_CONFIG,
      false
    )
    const wrapper = document.createElement('div')
    wrapper.innerHTML = sanitizedHtml

    for (const table of Array.from(wrapper.querySelectorAll('table'))) {
      const row = table.querySelector('tr')
      if (row.firstElementChild.tagName !== 'TH') {
        ;[...row.children].forEach(cell => {
          const th = document.createElement('th')
          th.innerHTML = cell.innerHTML
          cell.replaceWith(th)
        })
      }
      for (const paragraph of Array.from(table.querySelectorAll('p'))) {
        const span = document.createElement('span')
        span.innerHTML = paragraph.innerHTML
        paragraph.replaceWith(span)
      }
      for (const cell of table.querySelectorAll('td')) {
        const html = cell.innerHTML
        if (/<br>/.test(html)) {
          cell.innerHTML = html.replace(/<br>/g, '&lt;br&gt;')
        }
      }
    }

    for (const link of Array.from(wrapper.querySelectorAll('a'))) {
      const href = link.getAttribute('href')
      const text = link.textContent
      if (URL_REG.test(href) && href === text) {
        const title = await getPageTitle(href)
        if (title) {
          link.innerHTML = sanitize(
            title,
            PREVIEW_DOMPURIFY_CONFIG,
            true
          )
        } else {
          const span = document.createElement('span')
          span.innerHTML = sanitize(
            text,
            PREVIEW_DOMPURIFY_CONFIG,
            true
          )
          link.replaceWith(span)
        }
      }
    }
    return wrapper.innerHTML
  }
}

export default pasteHtml

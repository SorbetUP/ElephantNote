export const normalizeSourceUrl = (url = '') => {
  const value = String(url || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `https://${value}`
}

export const createSourceId = (url = '') => normalizeSourceUrl(url)
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

export const extractHtmlTitle = (html = '', fallback = 'Imported source') => {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return decodeHtml(match?.[1] || fallback).trim() || fallback
}

export const htmlToReadableText = (html = '') => decodeHtml(
  String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
)
  .split(/\r?\n/)
  .map((line) => line.replace(/\s+/g, ' ').trim())
  .map((line) => line.replace(/\s+([.,;:!?])/g, '$1'))
  .filter(Boolean)
  .slice(0, 120)
  .join('\n\n')

export const decodeHtml = (value = '') => String(value || '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")

const getXmlValue = (item = '', tag = '') => {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return decodeHtml(match?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim()
}

export const parseRssFeed = (xml = '') => {
  const itemMatches = String(xml || '').match(/<item[\s\S]*?<\/item>/gi) || []
  return itemMatches.map((item) => ({
    title: getXmlValue(item, 'title') || 'Untitled feed item',
    url: getXmlValue(item, 'link') || getXmlValue(item, 'guid'),
    publishedAt: getXmlValue(item, 'pubDate'),
    description: htmlToReadableText(getXmlValue(item, 'description'))
  })).filter((item) => item.url)
}

export const normalizeSourceRecord = (source = {}) => ({
  id: String(source.id || createSourceId(source.url)).trim(),
  url: normalizeSourceUrl(source.url),
  title: String(source.title || 'Imported source').trim(),
  type: String(source.type || 'url').trim(),
  notePath: String(source.notePath || '').trim(),
  importedAt: String(source.importedAt || new Date().toISOString()),
  metadata: source.metadata && typeof source.metadata === 'object' ? source.metadata : {}
})

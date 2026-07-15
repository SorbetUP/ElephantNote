import ElephantGraphAddonBase from './main.js'

const ADDON_ID = 'elephant.graph'

const normalizeTarget = (value = '') => String(value || '')
  .trim()
  .replaceAll('\\', '/')
  .replace(/\.md$/i, '')
  .replace(/^\/+|\/+$/g, '')
  .toLowerCase()

const titleFromPath = (path = '') => (String(path).split('/').pop() || 'Untitled')
  .replace(/\.md$/i, '')
  .replace(/[-_]+/g, ' ')

const extractTitle = (content, path) => String(content || '').match(/^#\s+(.+)$/m)?.[1]?.trim() || titleFromPath(path)
const extractLinks = (content = '') => [...String(content).matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)]
  .map((match) => normalizeTarget(match[1]))
  .filter(Boolean)
const extractTags = (content = '') => [...new Set(
  [...String(content).matchAll(/(^|\s)#([\p{L}\p{N}_-]{2,})/gu)]
    .map((match) => match[2].toLowerCase())
)]

export default class ElephantGraphAddon extends ElephantGraphAddonBase {
  async readNotes() {
    const entries = await this.invoke('tauri_addons_notes_list', {
      addonId: ADDON_ID,
      prefix: '.'
    })
    const notes = []
    for (const entry of Array.isArray(entries) ? entries : []) {
      try {
        const result = await this.broker('notes.read', { path: entry.path })
        const content = String(result?.content || '')
        notes.push({
          id: normalizeTarget(entry.path),
          path: String(entry.path),
          title: extractTitle(content, entry.path),
          kind: String(entry.path).startsWith('Wiki/') ? 'wiki' : 'note',
          links: extractLinks(content),
          tags: extractTags(content)
        })
      } catch (error) {
        console.warn('[graph-addon] note skipped', {
          path: entry?.path,
          error: error?.message || String(error)
        })
      }
    }
    return notes
  }
}

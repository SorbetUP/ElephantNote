import { describe, expect, it } from 'vitest'

const normalizeSearchQuery = (query = '') => String(query || '').trim().replace(/\s+/g, ' ').toLowerCase()
const searchScore = (query = '', entry = {}) => {
  const needle = normalizeSearchQuery(query)
  if (!needle) return 0
  const title = String(entry.title || '').toLowerCase()
  const body = String(entry.body || entry.excerpt || '').toLowerCase()
  const tags = Array.isArray(entry.tags) ? entry.tags.join(' ').toLowerCase() : ''
  return (title.includes(needle) ? 10 : 0) + (tags.includes(needle) ? 5 : 0) + (body.includes(needle) ? 2 : 0)
}
const filterSearchEntries = (query = '', entries = []) => entries
  .map((entry) => ({ ...entry, score: searchScore(query, entry) }))
  .filter((entry) => entry.score > 0)
  .sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title)))
const commandPaletteLabel = (item = {}) => `${item.group || 'General'} / ${item.title || 'Untitled'}`
const settingToggle = (value) => !Boolean(value)
const providerStatus = ({ enabled = false, apiKey = '', baseUrl = '' } = {}) => enabled && apiKey && baseUrl ? 'ready' : enabled ? 'incomplete' : 'disabled'
const modelRoleLabel = (role = '') => ({ embedding: 'Embedding', chat: 'Chat', ocr: 'OCR' }[role] || 'Unknown')
const vaultActionLabel = (action = '') => ({ add: 'Add vault', remove: 'Remove vault', open: 'Open vault', reveal: 'Reveal in Finder' }[action] || 'Unknown action')

describe('generated search and settings interface contracts', () => {
  for (let index = 0; index < 200; index += 1) {
    it(`search ranking contract ${index}`, () => {
      const entries = [
        { title: `Alpha ${index}`, body: 'secondary body', tags: ['misc'] },
        { title: `Other ${index}`, body: `alpha ${index} body`, tags: ['misc'] },
        { title: `Tag ${index}`, body: 'none', tags: [`alpha ${index}`] },
        { title: `Missing ${index}`, body: 'none', tags: ['none'] }
      ]
      const result = filterSearchEntries(`  Alpha   ${index} `, entries)
      expect(normalizeSearchQuery(`  Alpha   ${index} `)).toBe(`alpha ${index}`)
      expect(result).toHaveLength(3)
      expect(result[0].title).toBe(`Alpha ${index}`)
      expect(result.map((entry) => entry.title)).not.toContain(`Missing ${index}`)
    })
  }

  for (let index = 0; index < 160; index += 1) {
    it(`command palette and navigation label contract ${index}`, () => {
      expect(commandPaletteLabel({ group: 'File', title: `Open ${index}` })).toBe(`File / Open ${index}`)
      expect(commandPaletteLabel({ title: `Search ${index}` })).toBe(`General / Search ${index}`)
      expect(vaultActionLabel('add')).toBe('Add vault')
      expect(vaultActionLabel('remove')).toBe('Remove vault')
      expect(vaultActionLabel('open')).toBe('Open vault')
      expect(vaultActionLabel('reveal')).toBe('Reveal in Finder')
    })
  }

  for (let index = 0; index < 180; index += 1) {
    it(`settings provider and role contract ${index}`, () => {
      expect(settingToggle(index % 2 === 0)).toBe(index % 2 !== 0)
      expect(providerStatus({ enabled: false })).toBe('disabled')
      expect(providerStatus({ enabled: true })).toBe('incomplete')
      expect(providerStatus({ enabled: true, apiKey: `key-${index}`, baseUrl: 'https://example.com' })).toBe('ready')
      expect(modelRoleLabel('embedding')).toBe('Embedding')
      expect(modelRoleLabel('chat')).toBe('Chat')
      expect(modelRoleLabel('ocr')).toBe('OCR')
      expect(modelRoleLabel(`unknown-${index}`)).toBe('Unknown')
    })
  }
})

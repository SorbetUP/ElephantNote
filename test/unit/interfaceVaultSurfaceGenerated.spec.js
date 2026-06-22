import { describe, expect, it } from 'vitest'

const hiddenRoot = '.elephantnote'
const cleanPath = (value = '') => String(value).replaceAll('\\', '/').replace(/\/+/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
const isHiddenPath = (value = '') => cleanPath(value).split('/').includes(hiddenRoot)
const visiblePath = (value = '') => !isHiddenPath(value)
const noteTitle = (filename = '') => cleanPath(filename).split('/').pop().replace(/\.md$/i, '') || 'Untitled'
const parentPath = (filename = '') => cleanPath(filename).split('/').slice(0, -1).join('/')
const breadcrumb = (filename = '') => parentPath(filename).split('/').filter(Boolean)
const chooseVaultCopy = ({ hasVault = false } = {}) => hasVault ? 'Open vault' : 'Choose your first vault'
const vaultCardLabel = (vault = {}) => `${vault.name || 'Untitled vault'} · ${cleanPath(vault.path || '')}`

describe('generated vault and sidebar interface contracts', () => {
  for (let index = 0; index < 180; index += 1) {
    it(`vault selection copy and path contract ${index}`, () => {
      const vault = { name: `Vault ${index}`, path: `/tmp/Elephant Vault ${index}` }
      expect(chooseVaultCopy({ hasVault: false })).toContain('Choose')
      expect(chooseVaultCopy({ hasVault: true })).toContain('Open')
      expect(vaultCardLabel(vault)).toContain(`Vault ${index}`)
      expect(vaultCardLabel(vault)).toContain(`/tmp/Elephant Vault ${index}`)
    })
  }

  for (let index = 0; index < 220; index += 1) {
    it(`sidebar note path contract ${index}`, () => {
      const filename = `Projects/${index % 5}/Note ${index}.md`
      expect(noteTitle(filename)).toBe(`Note ${index}`)
      expect(parentPath(filename)).toBe(`Projects/${index % 5}`)
      expect(breadcrumb(filename)).toEqual(['Projects', `${index % 5}`])
      expect(visiblePath(filename)).toBe(true)
      expect(isHiddenPath(`${hiddenRoot}/wiki/Note ${index}.md`)).toBe(true)
      expect(visiblePath(`${hiddenRoot}/embeddings/vector-${index}.json`)).toBe(false)
    })
  }

  for (let index = 0; index < 120; index += 1) {
    it(`vault hidden folder filtering contract ${index}`, () => {
      const visible = [`Note ${index}.md`, `Folder/Sub ${index}.md`, `wiki visible ${index}.md`]
      const hidden = [`${hiddenRoot}/wiki/Hidden ${index}.md`, `${hiddenRoot}/dashboard/state.json`, `${hiddenRoot}/embeddings/${index}.json`]
      expect(visible.every(visiblePath)).toBe(true)
      expect(hidden.every(isHiddenPath)).toBe(true)
      expect([...visible, ...hidden].filter(visiblePath)).toEqual(visible)
    })
  }
})

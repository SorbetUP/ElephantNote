import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('addon catalogue interface', () => {
  it('keeps search and installed filtering in the top toolbar', () => {
    const panel = read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')

    expect(panel).toContain('class="en-addons-search"')
    expect(panel).toContain('v-model.trim="query"')
    expect(panel).toContain('class="en-installed-only-control"')
    expect(panel).not.toContain('class="en-addon-browser-search"')
    expect(panel).not.toContain('class="en-addon-browser-filter"')
  })

  it('renders tiles first and the list/detail browser only after selection', () => {
    const panel = read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')

    expect(panel).toContain('v-if="selectedEntry" class="en-addon-browser en-addon-browser-detail-mode"')
    expect(panel).toContain('v-else class="en-addon-catalogue"')
    expect(panel).toContain('class="en-addon-overview-card"')
    expect(panel).toContain('class="en-addon-browser-sidebar"')
    expect(panel).toContain('Back to catalogue')
    expect(panel).not.toContain('Browse the complete catalogue. Open an addon to manage it.')
    expect(panel).not.toContain('<h2>All addons</h2>')
  })

  it('deduplicates installed entries that also have updates', () => {
    const panel = read('Elephant/frontend/app/components/settings/AddonsSettingsPanel.vue')

    expect(panel).toContain('const entriesById = new Map()')
    expect(panel).toContain('existing.available = available')
    expect(panel).toContain("return 'Update available'")
  })
})

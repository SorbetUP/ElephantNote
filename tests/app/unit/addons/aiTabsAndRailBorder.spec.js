import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('AI settings navigation', () => {
  it('shows only the addon-owned AI tab strip', () => {
    const parentSettings = read('Elephant/frontend/src/renderer/src/addons/builtin/ui/AiProvidersSettings.vue')

    expect(parentSettings).toContain('class="en-ai-module-tabs"')
    expect(parentSettings).toContain(':global(.en-ai-providers-only .en-ai-toolbar)')
    expect(parentSettings).toContain('display: none !important')
  })
})

describe('workspace vertical border alignment', () => {
  it('uses the same rail width in flex layout and title strip divider math', () => {
    const layoutFixes = read('Elephant/frontend/app/styles/runtime-layout-fixes.css')

    expect(layoutFixes).toContain('width: 56px !important')
    expect(layoutFixes).toContain('flex: 0 0 56px !important')
    expect(layoutFixes).toContain('left: calc(56px + var(--en-sidebar-width)) !important')
    expect(layoutFixes).toContain('width: 1px !important')
  })
})

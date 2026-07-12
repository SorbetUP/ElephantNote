import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const settingsPath = 'Elephant/frontend/src/renderer/src/addons/builtin/ui/CodeExecutionSettings.vue'
const addonPath = 'Elephant/frontend/src/renderer/src/addons/builtin/codeExecution.js'
const obsoleteInjectorPath = 'Elephant/frontend/src/renderer/src/platform/executableCodeSettings.js'

describe('code execution settings contribution', () => {
  it('uses the Editor-owned Vue settings surface instead of a global DOM injector', () => {
    const addon = read(addonPath)

    expect(fs.existsSync(path.join(root, obsoleteInjectorPath))).toBe(false)
    expect(addon).toContain("section: 'editor'")
    expect(addon).toContain("component: () => import('./ui/CodeExecutionSettings.vue')")
    expect(addon).not.toContain('MutationObserver')
  })

  it('keeps the visible settings limited to retained output and interpreters', () => {
    const settings = read(settingsPath)

    expect(settings).toContain('Retained output')
    expect(settings).toContain('Interpreters')
    expect(settings).toContain('Add interpreter')
    expect(settings).toContain('customEnvironments')
    expect(settings).toContain('interpreterTemplates')
    expect(settings).toContain('INTERPRETERS_COLLAPSED_KEY')
    expect(settings).toContain('interpretersExpanded')
    expect(settings).not.toContain('Enable code execution')
    expect(settings).not.toContain('Run trusted fenced blocks with local interpreters.')
  })

  it('supports known templates and user-defined executable environments', () => {
    const settings = read(settingsPath)

    expect(settings).toContain('v-for="template in form.templates"')
    expect(settings).toContain('Fence language')
    expect(settings).toContain('Executable')
    expect(settings).toContain('Aliases')
    expect(settings).toContain('Arguments')
    expect(settings).toContain('custom-add:')
    expect(settings).toContain('custom-remove:')
  })
})

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('community addon trust boundary', () => {
  it('uses the Community Addons switch as the only user-facing approval', () => {
    const consent = read('Elephant/frontend/src/renderer/src/addons/permissionConsentGuard.js')
    const packs = read('Elephant/frontend/src/renderer/src/addons/builtin/addonProfiles.js')
    const settings = read('Elephant/frontend/app/components/settings/useAddonsSettings.js')
    const trusted = read('Elephant/frontend/src/renderer/src/addons/trustedAddonRuntime.js')

    expect(consent).not.toContain('.confirm')
    expect(packs).not.toContain('globalThis.confirm')
    expect(consent).toContain('full-app-access:auto-approved')
    expect(settings).toContain('setCommunityAddonsEnabled(true)')
    expect(settings).toContain('approveTrustedAddon(addon.manifest.id)')
    expect(trusted).toContain("COMMUNITY_ADDONS_PREF_KEY = 'addons.communityEnabled'")
    expect(trusted).toContain('Full app access approval is required for this exact addon package.')
  })

  it('retains hash-bound approval and safe-mode recovery without another dialog', () => {
    const consent = read('Elephant/frontend/src/renderer/src/addons/permissionConsentGuard.js')
    const packs = read('Elephant/frontend/src/renderer/src/addons/builtin/addonProfiles.js')

    expect(consent).toContain('external.getTrustState(addonId)')
    expect(consent).toContain('originalApproveTrusted(addonId)')
    expect(packs).toContain('await external.setSafeMode(false)')
    expect(packs).toContain('await external.approveTrusted(snapshot.manifest.id)')
  })
})

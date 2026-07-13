import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('physical Sync package ownership', () => {
  it('owns manifest scanning and deterministic planning inside the native package', () => {
    const service = read('addons/official/sync/native/src/main.rs')
    const manifest = read('addons/official/sync/native/src/manifest.rs')
    const plan = read('addons/official/sync/native/src/plan.rs')

    expect(service).toContain('mod manifest;')
    expect(service).toContain('mod plan;')
    expect(service).toContain('"sync.scan" => service.scan()')
    expect(service).toContain('"sync.plan" => service.plan(params).await')
    expect(service).toContain('"ownedCapabilities": ["endpoint", "manifest", "plan"]')
    expect(manifest).toContain('pub fn scan_vault')
    expect(manifest).toContain('path_is_or_is_below(&normalized, ".elephantnote/addons")')
    expect(plan).toContain('pub fn build_plan')
    expect(plan).toContain('plan_conflict')
  })

  it('publishes package-owned scan and plan methods through the trusted service resource', () => {
    const bridge = read('addons/official/sync/main.service.js')
    const manifest = read('addons/official/sync/manifest.json')

    expect(bridge).toContain("this.callNativeService('sync.scan'")
    expect(bridge).toContain("this.callNativeService('sync.plan'")
    expect(bridge).toContain("capabilities: Object.freeze(['endpoint', 'manifest', 'plan'])")
    expect(manifest).toContain('"runner": "service"')
    expect(manifest).toContain('"protocol": "elephant-addon-service-v1"')
  })
})

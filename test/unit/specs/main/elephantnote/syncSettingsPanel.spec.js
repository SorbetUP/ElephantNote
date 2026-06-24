import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const readSyncSettingsPanel = () => fs.readFileSync(
  path.join(root, 'Elephant/front/app/components/settings/SyncSettingsPanel.vue'),
  'utf8'
)

describe('SyncSettingsPanel critical interactions', () => {
  it('wires device connection buttons to the backend pairing action', () => {
    const source = readSyncSettingsPanel()

    expect(source).toContain('@click="connectDevice(device)"')
    expect(source).toContain('const connectDevice = async (device) => {')
    expect(source).toContain("peerDeviceId: device.id")
    expect(source).toContain("peerAddress: device.address || 'dynamic'")
    expect(source).toContain('elephantnoteClient.sync.run({')
  })

  it('does not fake device discovery with a UI-only timeout', () => {
    const source = readSyncSettingsPanel()

    expect(source).toContain('const startDiscovery = async () => {')
    expect(source).toContain('const status = await elephantnoteClient.sync.status()')
    expect(source).toContain('devices.value = Array.isArray(status?.peers)')
    expect(source).not.toContain('setTimeout(() => {')
  })

  it('calls the sync backend when allowing pairing', () => {
    const source = readSyncSettingsPanel()

    expect(source).toContain('const allowPairing = async () => {')
    expect(source).toContain("backend: 'syncthing-git'")
    expect(source).toContain('await elephantnoteClient.sync.run({ init: syncInitPayload() })')
    expect(source).not.toContain("syncMessage.value = 'Pairing allowed. Connect from the other device.'\n}")
  })

  it('clears the active remote when removing the selected provider', () => {
    const source = readSyncSettingsPanel()

    expect(source).toContain('const removed = providers.value.find((provider) => provider.id === id)')
    expect(source).toContain("if (removed?.remotePath === activeRemotePath.value) activeRemotePath.value = ''")
  })
})

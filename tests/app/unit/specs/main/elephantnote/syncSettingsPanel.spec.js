import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const readSyncSettingsPanel = () => fs.readFileSync(
  path.join(root, 'Elephant/frontend/app/components/settings/SyncSettingsPanel.vue'),
  'utf8'
)

describe('SyncSettingsPanel critical interactions', () => {
  it('creates manual pairing codes through the sync backend', () => {
    const source = readSyncSettingsPanel()

    expect(source).toContain('@click="createPairingCode"')
    expect(source).toContain('const createPairingCode = async () => {')
    expect(source).toContain('elephantnoteClient.sync.createInvite')
    expect(source).toContain('createdPairingCode.value')
    expect(source).toContain("remotePath: activeRemotePath.value")
  })

  it('accepts pasted pairing codes through the sync backend', () => {
    const source = readSyncSettingsPanel()

    expect(source).toContain('@click="acceptPairingCode"')
    expect(source).toContain('const acceptPairingCode = async () => {')
    expect(source).toContain('elephantnoteClient.sync.acceptInvite')
    expect(source).toContain('manualCode: pairingCodeInput.value.trim()')
    expect(source).toContain('devices.value = Array.isArray(status?.peers)')
  })

  it('uses real sync discovery without the old fake device flow', () => {
    const source = readSyncSettingsPanel()

    expect(source).toContain('elephantnoteClient.sync.discoverPeers')
    expect(source).toContain('@click="discoverPeers"')
    expect(source).toContain('Scan network')
    expect(source).not.toContain('setTimeout(() => {')
    expect(source).not.toContain('const startDiscovery = async () => {')
    expect(source).not.toContain('@click="connectDevice(device)"')
  })

  it('clears the active remote when removing the selected provider', () => {
    const source = readSyncSettingsPanel()

    expect(source).toContain('const removed = providers.value.find((provider) => provider.id === id)')
    expect(source).toContain("if (removed?.remotePath === activeRemotePath.value) activeRemotePath.value = ''")
  })
})

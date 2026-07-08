<template>
  <div class="en-sync-panel">
    <section class="en-settings-section stacked">
      <div>
        <h3>Devices</h3>
        <p>Scan the local network for ElephantNote devices, or pair with a manual code when Android USB/network isolation blocks discovery.</p>
      </div>
      <div class="en-form-grid">
        <label>
          <span>Shared sync target</span>
          <input v-model.trim="activeRemotePath" type="text" placeholder="/Volumes/ElephantSync or webdav:ElephantNote">
        </label>
        <label>
          <span>Selected vaults</span>
          <span class="en-settings-pill">{{ selectedVaultIds.length }} selected</span>
        </label>
      </div>
      <div class="en-settings-actions-row">
        <button type="button" :disabled="!canCreateInvite || loading" @click="createPairingCode">
          {{ loadingAction === 'create' ? 'Creating...' : 'Create pairing code' }}
        </button>
        <button type="button" :disabled="!pairingCodeInput.trim() || loading" @click="acceptPairingCode">
          {{ loadingAction === 'accept' ? 'Pairing...' : 'Accept pasted code' }}
        </button>
        <button type="button" :disabled="loading" @click="refreshStatus">
          Refresh
        </button>
        <button type="button" :disabled="loading" @click="discoverPeers">
          {{ loadingAction === 'discover' ? 'Scanning...' : 'Scan network' }}
        </button>
        <span class="en-settings-message">{{ syncMessage }}</span>
      </div>
      <div class="en-pairing-grid">
        <label>
          <span>Code from this device</span>
          <textarea readonly :value="createdPairingCode" placeholder="Create a pairing code, then paste it on the other device." />
        </label>
        <label>
          <span>Paste code from another device</span>
          <textarea v-model.trim="pairingCodeInput" placeholder="Paste ElephantNote pairing code here." />
        </label>
      </div>
      <div class="en-sync-list">
        <article v-if="!devices.length" class="en-sync-row muted">
          <div>
            <strong>No device found yet</strong>
            <p>Tap Scan network, or create a code on one device and accept it on the other.</p>
          </div>
        </article>
        <article v-for="device in devices" :key="device.id" class="en-sync-row">
          <div>
            <strong>{{ device.name }}</strong>
            <p>{{ device.address }} · {{ device.online ? 'online' : 'paired' }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="en-settings-section stacked">
      <div>
        <h3>Vaults</h3>
        <p>Select which vaults are allowed to sync.</p>
      </div>
      <div class="en-sync-list">
        <label v-for="vault in vaults" :key="vaultKey(vault)" class="en-sync-check-row">
          <input type="checkbox" :checked="isVaultSelected(vault)" @change="toggleVault(vault)">
          <span>
            <strong>{{ vault.name }}</strong>
            <small>{{ vault.path }}</small>
          </span>
        </label>
      </div>
    </section>

    <section class="en-settings-section stacked">
      <div>
        <h3>Sync providers</h3>
        <p>Add rclone remotes for cloud, NAS, WebDAV, Drive, OneDrive, SFTP, S3, or local test folders.</p>
      </div>
      <div class="en-form-grid">
        <label>
          <span>Name</span>
          <input v-model.trim="providerForm.name" type="text" placeholder="Personal WebDAV">
        </label>
        <label>
          <span>Type</span>
          <select v-model="providerForm.type">
            <option v-for="type in providerTypes" :key="type.id" :value="type.id">{{ type.label }}</option>
          </select>
        </label>
        <label class="wide">
          <span>Rclone remote or path</span>
          <input v-model.trim="providerForm.remotePath" type="text" placeholder="webdav:ElephantNote or drive:ElephantNote">
        </label>
      </div>
      <div class="en-settings-actions-row">
        <button type="button" :disabled="!providerForm.remotePath" @click="addProvider">Add provider</button>
        <button type="button" :disabled="!activeRemotePath || loading" @click="syncNow">Sync now</button>
        <span class="en-settings-message">{{ providerMessage }}</span>
      </div>
      <div class="en-sync-list">
        <article v-if="!providers.length" class="en-sync-row muted">
          <div>
            <strong>No provider configured</strong>
            <p>Add a rclone remote or a local/NAS path.</p>
          </div>
        </article>
        <article v-for="provider in providers" :key="provider.id" class="en-sync-row">
          <div>
            <strong>{{ provider.name }}</strong>
            <p>{{ provider.type }} · {{ provider.remotePath }}</p>
          </div>
          <div class="en-sync-row-actions">
            <button type="button" @click="useProvider(provider)">Use</button>
            <button type="button" class="danger" @click="removeProvider(provider.id)">Remove</button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { elephantnoteClient } from '../../services/elephantnoteClient'

const props = defineProps({
  vaults: { type: Array, default: () => [] },
  activeVaultPath: { type: String, default: '' }
})

const selectedVaultIds = ref([])
const createdPairingCode = ref('')
const pairingCodeInput = ref('')
const devices = ref([])
const loading = ref(false)
const loadingAction = ref('')
const syncMessage = ref('')
const providerMessage = ref('')
const activeRemotePath = ref('')
const providers = ref([])
const providerForm = ref({ name: '', type: 'webdav', remotePath: '' })
const providerTypes = [
  { id: 'webdav', label: 'WebDAV' },
  { id: 'drive', label: 'Google Drive' },
  { id: 'onedrive', label: 'OneDrive' },
  { id: 'sftp', label: 'SFTP' },
  { id: 's3', label: 'S3' },
  { id: 'local', label: 'Local/NAS folder' }
]
const selectedVaultKey = 'elephantnote:sync:selectedVaults'
const providerKey = 'elephantnote:sync:providers'
const canCreateInvite = computed(() => activeRemotePath.value.trim().length > 0 && selectedVaultIds.value.length > 0)
const vaultKey = (vault) => String(vault?.id || vault?.path || vault?.name || '')
const isVaultSelected = (vault) => selectedVaultIds.value.includes(vaultKey(vault))
const normalizeDevice = (peer = {}, index = 0) => {
  const id = String(peer.deviceId || peer.id || peer.name || `peer-${index}`)
  const address = String(peer.address || peer.peerAddress || peer.endpoint || peer.host || 'dynamic')
  return {
    id,
    name: String(peer.deviceName || peer.name || peer.label || id),
    address,
    online: peer.online === true
  }
}
const syncInitPayload = (extra = {}) => ({
  backend: 'syncthing-git',
  vaultIds: [...selectedVaultIds.value],
  remotePath: activeRemotePath.value,
  ...extra
})

const saveSelectedVaults = () => window.localStorage.setItem(selectedVaultKey, JSON.stringify(selectedVaultIds.value))
const toggleVault = (vault) => {
  const id = vaultKey(vault)
  if (!id) return
  selectedVaultIds.value = selectedVaultIds.value.includes(id)
    ? selectedVaultIds.value.filter((item) => item !== id)
    : [...selectedVaultIds.value, id]
  saveSelectedVaults()
}
const loadSelectedVaults = () => {
  try { selectedVaultIds.value = JSON.parse(window.localStorage.getItem(selectedVaultKey) || '[]') } catch { selectedVaultIds.value = [] }
  if (!selectedVaultIds.value.length && props.vaults.length) {
    const active = props.vaults.find((vault) => vault.path === props.activeVaultPath) || props.vaults[0]
    selectedVaultIds.value = [vaultKey(active)].filter(Boolean)
    saveSelectedVaults()
  }
}
const loadProviders = () => {
  try { providers.value = JSON.parse(window.localStorage.getItem(providerKey) || '[]') } catch { providers.value = [] }
}
const saveProviders = () => window.localStorage.setItem(providerKey, JSON.stringify(providers.value))
const addProvider = () => {
  if (!providerForm.value.remotePath) return
  const provider = {
    id: `provider-${Date.now()}`,
    name: providerForm.value.name || providerForm.value.remotePath,
    type: providerForm.value.type,
    remotePath: providerForm.value.remotePath
  }
  providers.value = [...providers.value, provider]
  activeRemotePath.value = provider.remotePath
  providerForm.value = { name: '', type: 'webdav', remotePath: '' }
  providerMessage.value = 'Provider added.'
  saveProviders()
}
const removeProvider = (id) => {
  const removed = providers.value.find((provider) => provider.id === id)
  providers.value = providers.value.filter((provider) => provider.id !== id)
  if (removed?.remotePath === activeRemotePath.value) activeRemotePath.value = ''
  saveProviders()
  providerMessage.value = 'Provider removed.'
}
const useProvider = (provider) => {
  activeRemotePath.value = provider.remotePath
  providerMessage.value = `${provider.name} selected.`
}
const createPairingCode = async () => {
  if (!canCreateInvite.value || loading.value) return
  loading.value = true
  loadingAction.value = 'create'
  syncMessage.value = 'Creating pairing code...'
  try {
    const result = await elephantnoteClient.sync.createInvite(syncInitPayload({
      deviceName: 'ElephantNote',
      remotePath: activeRemotePath.value
    }))
    createdPairingCode.value = result?.manualCode || result?.qrPayload || JSON.stringify(result?.invite || {})
    syncMessage.value = 'Pairing code created. Paste it on the other device.'
  } catch (error) {
    syncMessage.value = error instanceof Error ? error.message : 'Unable to create pairing code.'
  } finally {
    loading.value = false
    loadingAction.value = ''
  }
}
const acceptPairingCode = async () => {
  if (!pairingCodeInput.value.trim() || loading.value) return
  loading.value = true
  loadingAction.value = 'accept'
  syncMessage.value = 'Accepting pairing code...'
  try {
    const result = await elephantnoteClient.sync.acceptInvite({ manualCode: pairingCodeInput.value.trim() })
    const status = result?.status || await elephantnoteClient.sync.status()
    activeRemotePath.value = status.remotePath || activeRemotePath.value
    devices.value = Array.isArray(status?.peers) ? status.peers.map(normalizeDevice) : devices.value
    syncMessage.value = status.lastError || 'Device paired. Run Sync now on both devices.'
  } catch (error) {
    syncMessage.value = error instanceof Error ? error.message : 'Unable to accept pairing code.'
  } finally {
    loading.value = false
    loadingAction.value = ''
  }
}
const refreshStatus = async () => {
  loading.value = true
  try {
    const status = await elephantnoteClient.sync.status()
    activeRemotePath.value = status.remotePath || activeRemotePath.value
    devices.value = Array.isArray(status?.peers) ? status.peers.map(normalizeDevice) : devices.value
    syncMessage.value = status.lastError || ''
  } catch (error) {
    syncMessage.value = error instanceof Error ? error.message : 'Unable to load sync status.'
  } finally {
    loading.value = false
  }
}
const discoverPeers = async () => {
  if (loading.value) return
  loading.value = true
  loadingAction.value = 'discover'
  syncMessage.value = 'Scanning local network...'
  try {
    const result = await elephantnoteClient.sync.discoverPeers({ timeoutMs: 1400 })
    const status = result?.status || await elephantnoteClient.sync.status()
    const peers = Array.isArray(result?.peers) && result.peers.length ? result.peers : status?.peers
    devices.value = Array.isArray(peers) ? peers.map(normalizeDevice) : []
    syncMessage.value = result?.warning || (devices.value.length ? `${devices.value.length} device found.` : 'No device found. Use the manual pairing code if the phone is isolated by USB or Wi-Fi settings.')
  } catch (error) {
    syncMessage.value = error instanceof Error ? error.message : 'Network scan failed. Use the manual pairing code.'
  } finally {
    loading.value = false
    loadingAction.value = ''
  }
}
const syncNow = async () => {
  if (!activeRemotePath.value) return
  loading.value = true
  providerMessage.value = 'Synchronizing...'
  try {
    const status = await elephantnoteClient.sync.run({ init: { remotePath: activeRemotePath.value }, sync: { remotePath: activeRemotePath.value } })
    providerMessage.value = status.lastError || 'Synchronization finished.'
  } catch (error) {
    providerMessage.value = error instanceof Error ? error.message : 'Synchronization failed.'
  } finally {
    loading.value = false
  }
}

watch(() => props.vaults, loadSelectedVaults, { deep: true })
onMounted(() => {
  loadSelectedVaults()
  loadProviders()
  refreshStatus()
})
</script>

<style scoped>
.en-sync-panel { display: flex; flex-direction: column; gap: 18px; }
.en-sync-list { display: flex; flex-direction: column; gap: 12px; }
.en-sync-row, .en-sync-check-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 14px; background: var(--en-surface, #fff); }
.en-sync-row.muted { opacity: 0.72; }
.en-sync-row p { margin: 4px 0 0; color: var(--en-muted, #475467); }
.en-sync-row-actions { display: flex; gap: 8px; }
.en-sync-check-row { justify-content: flex-start; align-items: flex-start; }
.en-sync-check-row input { width: 18px; height: 18px; margin-top: 2px; }
.en-sync-check-row span { display: flex; flex-direction: column; gap: 4px; }
.en-sync-check-row small { color: var(--en-muted, #475467); word-break: break-all; }
.en-form-grid label.wide { grid-column: 1 / -1; }
.en-pairing-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.en-pairing-grid label { display: flex; flex-direction: column; gap: 8px; }
.en-pairing-grid textarea { min-height: 116px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.45; border: 1px solid var(--en-border, #c5cfdd); border-radius: 12px; padding: 12px; background: var(--en-surface, #fff); color: var(--en-text, #101828); }

@media (max-width: 760px), (pointer: coarse) {
  .en-sync-panel { gap: 14px; }
  .en-sync-row, .en-sync-check-row { align-items: stretch; flex-direction: column; gap: 12px; padding: 12px; border-radius: 12px; }
  .en-sync-row-actions { width: 100%; }
  .en-sync-row-actions button, .en-sync-row button { min-height: 44px; flex: 1; }
  .en-pairing-grid { grid-template-columns: 1fr; }
  .en-pairing-grid textarea { min-height: 132px; font-size: 12px; }
}
</style>

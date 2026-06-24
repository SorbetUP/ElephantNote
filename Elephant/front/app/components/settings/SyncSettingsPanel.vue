<template>
  <div class="en-sync-panel">
    <section class="en-settings-section stacked">
      <div>
        <h3>Devices</h3>
        <p>Add computers or phones found on the local network.</p>
      </div>
      <div class="en-form-grid">
        <label>
          <span>Pairing password</span>
          <input v-model="pairingPassword" type="password" placeholder="At least 8 characters">
        </label>
        <label>
          <span>Selected vaults</span>
          <span class="en-settings-pill">{{ selectedVaultIds.length }} selected</span>
        </label>
      </div>
      <div class="en-settings-actions-row">
        <button type="button" :disabled="discoveryRunning || loading" @click="startDiscovery">
          {{ discoveryRunning ? 'Searching...' : 'Find devices' }}
        </button>
        <button type="button" :disabled="!canPair || loading" @click="allowPairing">
          Allow pairing
        </button>
        <button type="button" :disabled="loading" @click="refreshStatus">
          Refresh
        </button>
        <span class="en-settings-message">{{ syncMessage }}</span>
      </div>
      <div class="en-sync-list">
        <article v-if="!devices.length" class="en-sync-row muted">
          <div>
            <strong>No device found</strong>
            <p>Open Elephant Note on another device, then search again.</p>
          </div>
        </article>
        <article v-for="device in devices" :key="device.id" class="en-sync-row">
          <div>
            <strong>{{ device.name }}</strong>
            <p>{{ device.address }}</p>
          </div>
          <button type="button" :disabled="!canPair || loading" @click="connectDevice(device)">Connect</button>
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
const pairingPassword = ref('')
const devices = ref([])
const discoveryRunning = ref(false)
const loading = ref(false)
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
const canPair = computed(() => pairingPassword.value.length >= 8 && selectedVaultIds.value.length > 0)
const vaultKey = (vault) => String(vault?.id || vault?.path || vault?.name || '')
const isVaultSelected = (vault) => selectedVaultIds.value.includes(vaultKey(vault))
const normalizeDevice = (peer = {}, index = 0) => {
  const id = String(peer.deviceId || peer.id || peer.name || `peer-${index}`)
  const address = String(peer.address || peer.peerAddress || peer.endpoint || 'dynamic')
  return {
    id,
    name: String(peer.name || peer.label || id),
    address
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
const startDiscovery = async () => {
  discoveryRunning.value = true
  syncMessage.value = 'Searching for devices...'
  try {
    const status = await elephantnoteClient.sync.status()
    devices.value = Array.isArray(status?.peers) ? status.peers.map(normalizeDevice) : []
    syncMessage.value = devices.value.length ? `${devices.value.length} device${devices.value.length === 1 ? '' : 's'} found.` : 'No device found yet.'
  } catch (error) {
    syncMessage.value = error instanceof Error ? error.message : 'Unable to search for devices.'
  } finally {
    discoveryRunning.value = false
  }
}
const allowPairing = async () => {
  if (!canPair.value || loading.value) return
  loading.value = true
  syncMessage.value = 'Preparing local pairing endpoint...'
  try {
    await elephantnoteClient.sync.run({ init: syncInitPayload() })
    syncMessage.value = 'Pairing allowed. Connect from the other device.'
  } catch (error) {
    syncMessage.value = error instanceof Error ? error.message : 'Unable to allow pairing.'
  } finally {
    loading.value = false
  }
}
const connectDevice = async (device) => {
  if (!canPair.value || loading.value || !device?.id) return
  loading.value = true
  syncMessage.value = `Connecting ${device.name}...`
  try {
    const status = await elephantnoteClient.sync.run({
      init: syncInitPayload({ peerDeviceId: device.id, peerAddress: device.address || 'dynamic' })
    })
    devices.value = Array.isArray(status?.peers) ? status.peers.map(normalizeDevice) : devices.value
    syncMessage.value = status.lastError || `${device.name} connected.`
  } catch (error) {
    syncMessage.value = error instanceof Error ? error.message : 'Unable to connect device.'
  } finally {
    loading.value = false
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
</style>

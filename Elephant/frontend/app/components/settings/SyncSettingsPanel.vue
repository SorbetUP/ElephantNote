<template>
  <div class="en-sync-panel">
    <section class="en-sync-card en-sync-hero" :class="`tone-${syncTone}`">
      <div class="en-sync-hero-main">
        <span class="en-sync-hero-icon">
          <RefreshCw v-if="isSyncing" class="spinning" aria-hidden="true" />
          <AlertTriangle v-else-if="hasError" aria-hidden="true" />
          <Link2 v-else-if="!pairedDevices.length" aria-hidden="true" />
          <CheckCircle2 v-else-if="hasCompletedSync" aria-hidden="true" />
          <FolderSync v-else aria-hidden="true" />
        </span>
        <div>
          <small>Synchronization</small>
          <h3>{{ syncHeadline }}</h3>
          <p>{{ syncDescription }}</p>
        </div>
      </div>
      <div class="en-sync-hero-actions">
        <button class="secondary icon-only" type="button" title="Refresh synchronization status" :disabled="loading || !hasVault" @click="refreshAll()">
          <RotateCw aria-hidden="true" />
        </button>
        <button v-if="pairedDevices.length" class="primary" type="button" :disabled="loading || !hasVault || isSyncing" @click="syncNow">
          <RefreshCw :class="{ spinning: isSyncing }" aria-hidden="true" />
          {{ isSyncing ? 'Synchronizing…' : 'Sync now' }}
        </button>
        <button v-else class="primary" type="button" :disabled="loading || !hasVault" @click="openPairing('create')">
          <Plus aria-hidden="true" /> Add a device
        </button>
      </div>
      <div class="en-sync-hero-meta">
        <span><Clock3 aria-hidden="true" />{{ lastRunLabel }}</span>
        <span><FolderSync aria-hidden="true" />{{ activeVaultName }}</span>
        <span v-if="transferLabel"><ArrowDownUp aria-hidden="true" />{{ transferLabel }}</span>
      </div>
    </section>

    <p v-if="statusMessage" class="en-sync-message" :class="{ error: hasError }">{{ statusMessage }}</p>

    <section v-if="reportedConflicts.length" class="en-sync-attention">
      <span class="en-conflict-icon warning"><AlertTriangle aria-hidden="true" /></span>
      <div>
        <strong>{{ reportedConflicts.length }} version{{ reportedConflicts.length === 1 ? '' : 's' }} preserved</strong>
        <p>Both devices changed the same note. No content was discarded.</p>
      </div>
      <button class="secondary compact" type="button" @click="scrollToConflicts">Review copies</button>
    </section>

    <section class="en-sync-card">
      <header class="en-sync-card-header">
        <div>
          <h4>Devices</h4>
          <span>Trusted ElephantNote installations for this vault.</span>
        </div>
        <button class="secondary compact" type="button" :disabled="!hasVault" @click="openPairing('create')">
          <Plus aria-hidden="true" /> Add device
        </button>
      </header>

      <div class="en-sync-list">
        <article v-if="!pairedDevices.length" class="en-sync-empty en-sync-empty-action">
          <span class="en-device-avatar"><Laptop aria-hidden="true" /></span>
          <div>
            <strong>No paired device</strong>
            <p>Create a temporary invitation and open it on another ElephantNote installation.</p>
          </div>
          <button class="primary compact" type="button" :disabled="!hasVault" @click="openPairing('create')">Start pairing</button>
        </article>

        <article v-for="device in pairedDevices" :key="device.endpointId" class="en-sync-device-row">
          <span class="en-device-avatar"><Laptop aria-hidden="true" /></span>
          <div class="en-sync-row-copy">
            <strong>{{ device.name || 'ElephantNote device' }}</strong>
            <p>Last synchronized {{ formatEpochSeconds(device.lastSeenAt, 'not yet') }}</p>
          </div>
          <span class="en-sync-status">Paired</span>
        </article>
      </div>
    </section>

    <section ref="conflictsSection" class="en-sync-card">
      <header class="en-sync-card-header">
        <div>
          <h4>Conflict protection</h4>
          <span>Both versions are kept when two devices edit the same note.</span>
        </div>
        <span class="en-sync-status active"><ShieldCheck aria-hidden="true" /> Protected</span>
      </header>

      <div class="en-sync-setting-row">
        <div>
          <strong>Keep recovered copies</strong>
          <p>Older versions remain locally in <code>.conflit/</code> before automatic cleanup.</p>
        </div>
        <div class="en-retention-control">
          <label>
            <input v-model.number="retentionDays" type="number" :min="conflictSettings.minimumRetentionDays || 1" :max="conflictSettings.maximumRetentionDays || 365" step="1" aria-label="Conflict retention days">
            <span>days</span>
          </label>
          <button class="secondary compact" type="button" :disabled="loading || !hasVault || !validRetention" @click="saveRetention">Save</button>
        </div>
      </div>

      <div class="en-sync-archive-heading">
        <div>
          <strong>Recovered copies</strong>
          <span>{{ archiveEntries.length ? `${archiveEntries.length} available on this device` : 'Nothing to review' }}</span>
        </div>
      </div>

      <div class="en-sync-list archive-list">
        <article v-if="!archiveEntries.length" class="en-sync-empty compact-empty">
          <span class="en-conflict-icon"><Archive aria-hidden="true" /></span>
          <div>
            <strong>No recovered copy</strong>
            <p>Conflicting versions will appear here and expire after {{ retentionDays }} day{{ retentionDays === 1 ? '' : 's' }}.</p>
          </div>
        </article>

        <article v-for="entry in archiveEntries" :key="entry.path" class="en-conflict-row">
          <span class="en-conflict-icon"><FileClock aria-hidden="true" /></span>
          <div class="en-sync-row-copy">
            <strong>{{ entry.path }}</strong>
            <p>{{ formatBytes(entry.size) }} · archived {{ formatTimestamp(entry.modifiedMs) }}</p>
          </div>
          <div class="en-conflict-actions">
            <button class="secondary compact" type="button" :disabled="loading || conflictActionPath === entry.path" @click="restoreConflict(entry)">
              <Undo2 aria-hidden="true" />{{ conflictActionPath === entry.path ? 'Working…' : 'Restore' }}
            </button>
            <button class="danger compact icon-only" type="button" title="Delete recovered copy" :disabled="loading || conflictActionPath === entry.path" @click="deleteConflict(entry)">
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        </article>
      </div>
      <p v-if="conflictMessage" class="en-sync-inline-message">{{ conflictMessage }}</p>
    </section>

    <details class="en-sync-card en-sync-advanced">
      <summary>
        <span><Settings2 aria-hidden="true" /> Advanced</span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div class="en-sync-advanced-content">
        <div>
          <span>Active vault</span>
          <strong>{{ activeVaultPath || 'No vault open' }}</strong>
        </div>
        <div>
          <span>Device identifier</span>
          <strong>{{ shortDeviceId }}</strong>
        </div>
        <p>The identifier and Iroh transport details are intended for diagnostics. Pairing invitations remain valid for ten minutes and should be treated as temporary credentials.</p>
      </div>
    </details>

    <div v-if="pairingOpen" class="en-pair-modal-backdrop" @click.self="closePairing">
      <section class="en-sync-card en-pair-modal" role="dialog" aria-modal="true" aria-labelledby="pairing-title">
        <header class="en-sync-card-header en-pair-modal-header">
          <div>
            <h4 id="pairing-title">Add a device</h4>
            <span>Connect another ElephantNote installation to this vault.</span>
          </div>
          <button class="secondary icon-only" type="button" title="Close" @click="closePairing"><X aria-hidden="true" /></button>
        </header>

        <div class="en-pair-mode" role="tablist" aria-label="Pairing method">
          <button type="button" role="tab" :aria-selected="pairingMode === 'create'" :class="{ active: pairingMode === 'create' }" @click="pairingMode = 'create'">
            <QrCode aria-hidden="true" /> Invite another device
          </button>
          <button type="button" role="tab" :aria-selected="pairingMode === 'join'" :class="{ active: pairingMode === 'join' }" @click="pairingMode = 'join'">
            <ScanLine aria-hidden="true" /> Scan or open an invitation
          </button>
        </div>

        <div v-if="pairingMode === 'create'" class="en-pair-pane">
          <template v-if="!inviteCode">
            <div class="en-pair-intro">
              <span class="en-pair-intro-icon"><ShieldCheck aria-hidden="true" /></span>
              <div>
                <strong>Create a one-time invitation</strong>
                <p>The invitation expires after ten minutes. Keep ElephantNote open until the other device accepts it.</p>
              </div>
            </div>
            <button class="primary" type="button" :disabled="loading || !hasVault" @click="createInvite">
              <QrCode aria-hidden="true" /> Create invitation
            </button>
          </template>

          <template v-else>
            <div class="en-pair-invitation-layout">
              <figure class="en-pair-qr">
                <img v-if="inviteQrDataUrl" :src="inviteQrDataUrl" alt="QR code containing the ElephantNote pairing invitation">
                <div v-else class="en-pair-qr-error"><AlertTriangle aria-hidden="true" /><span>QR generation failed. Use the invitation file instead.</span></div>
                <figcaption>On the other device, open ElephantNote → Settings → Sync → Scan or open an invitation.</figcaption>
              </figure>

              <div class="en-pair-share">
                <span class="en-sync-status" :class="{ active: inviteSecondsRemaining > 0 }">
                  <Clock3 aria-hidden="true" /> {{ inviteExpiryLabel }}
                </span>
                <h5>Share the invitation securely</h5>
                <p>The system share sheet can send the file through WhatsApp, Messages, Mail, or another installed application when supported.</p>
                <button class="primary" type="button" :disabled="inviteSecondsRemaining <= 0" @click="shareInviteFile">
                  <Send aria-hidden="true" /> Share invitation file…
                </button>
                <button class="secondary" type="button" :disabled="inviteSecondsRemaining <= 0" @click="downloadInviteFile">
                  <Download aria-hidden="true" /> Save invitation file
                </button>
                <button class="secondary" type="button" :disabled="inviteSecondsRemaining <= 0" @click="copyInvite">
                  <Copy aria-hidden="true" />{{ copied ? 'Copied' : 'Copy invitation code' }}
                </button>
              </div>
            </div>

            <div class="en-pair-security-note">
              <ShieldCheck aria-hidden="true" />
              <p>The QR code and <code>.elephantnote-invite</code> file contain the same temporary credential. Anyone who receives it before expiration can attempt to pair with this vault.</p>
            </div>
          </template>
        </div>

        <div v-else class="en-pair-pane">
          <SyncQrScanner
            :active="pairingOpen && pairingMode === 'join'"
            @decoded="handleScannedInvite"
            @error="handleScannerError"
          />

          <div class="en-pair-divider"><span>or open an invitation file</span></div>
          <div class="en-invite-drop" :class="{ ready: incomingInviteValid }" @dragover.prevent @drop.prevent="handleInviteDrop">
            <input ref="inviteFileInput" class="visually-hidden" type="file" :accept="INVITE_FILE_ACCEPT" @change="importInviteFile">
            <span class="en-pair-intro-icon"><FileUp aria-hidden="true" /></span>
            <div>
              <strong>{{ incomingInviteValid ? 'Invitation ready' : 'Open an invitation file' }}</strong>
              <p>{{ incomingInviteValid ? incomingInviteSummary : 'Choose a .elephantnote-invite file received through WhatsApp, Mail, Messages, or another application.' }}</p>
            </div>
            <button class="secondary" type="button" @click="inviteFileInput?.click()">Choose file</button>
          </div>

          <div class="en-pair-divider"><span>or paste the invitation code</span></div>
          <textarea v-model.trim="incomingInvite" rows="5" placeholder="Paste the ElephantNote invitation here" aria-label="ElephantNote pairing invitation" @input="validateIncomingInvite"></textarea>
          <p v-if="incomingInviteError" class="en-pair-validation error"><AlertTriangle aria-hidden="true" />{{ incomingInviteError }}</p>
          <p v-else-if="incomingInviteValid" class="en-pair-validation success"><CheckCircle2 aria-hidden="true" />{{ incomingInviteSummary }}</p>

          <div class="en-pair-footer">
            <p>Pairing authenticates the remote Iroh identity before saving it as a trusted device.</p>
            <button class="primary" type="button" :disabled="loading || !hasVault || !incomingInviteValid" @click="acceptInvite">
              <ShieldCheck aria-hidden="true" />{{ loading ? 'Pairing…' : 'Pair this device' }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  AlertTriangle,
  Archive,
  ArrowDownUp,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  FileClock,
  FileUp,
  FolderSync,
  Laptop,
  Link2,
  Plus,
  QrCode,
  RefreshCw,
  RotateCw,
  ScanLine,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  Undo2,
  X
} from '@lucide/vue'
import SyncQrScanner from './SyncQrScanner.vue'
import { irohSyncClient } from '../../services/irohSyncClient'
import {
  INVITE_FILE_ACCEPT,
  INVITE_MIME,
  MAX_INVITE_FILE_BYTES,
  buildSyncInviteFileName,
  createSyncInviteFile,
  generateSyncInviteQrDataUrl,
  parseSyncInvite,
  validateSyncInvitePayload
} from '../../services/syncInvite'

const props = defineProps({
  vaults: { type: Array, default: () => [] },
  activeVaultPath: { type: String, default: '' },
  initialPage: { type: String, default: 'overview' }
})

const status = ref({})
const conflictSettings = ref({
  retentionDays: 3,
  minimumRetentionDays: 1,
  maximumRetentionDays: 365,
  entries: []
})
const retentionDays = ref(3)
const inviteCode = ref('')
const inviteQrDataUrl = ref('')
const incomingInvite = ref('')
const incomingInviteError = ref('')
const incomingInviteDetails = ref(null)
const statusMessage = ref('')
const conflictMessage = ref('')
const loading = ref(false)
const syncing = ref(false)
const copied = ref(false)
const conflictActionPath = ref('')
const pairingOpen = ref(false)
const pairingMode = ref('create')
const nowSeconds = ref(Math.floor(Date.now() / 1000))
const inviteFileInput = ref(null)
const conflictsSection = ref(null)
let refreshTimer = null
let countdownTimer = null

const hasVault = computed(() => Boolean(props.activeVaultPath))
const activeVaultName = computed(() => {
  const active = props.vaults.find((vault) => vault?.path === props.activeVaultPath)
  return active?.name || status.value?.activeVault?.name || 'No active vault'
})
const pairedDevices = computed(() => Array.isArray(status.value?.peers) ? status.value.peers : [])
const archiveEntries = computed(() => Array.isArray(conflictSettings.value?.entries) ? conflictSettings.value.entries : [])
const reportedConflicts = computed(() => Array.isArray(status.value?.conflicts) ? status.value.conflicts : [])
const hasError = computed(() => Boolean(String(status.value?.lastError || '').trim()))
const isSyncing = computed(() => syncing.value || Boolean(status.value?.running))
const hasCompletedSync = computed(() => Number(status.value?.lastRunAt || 0) > 0 && !hasError.value)
const shortDeviceId = computed(() => shortId(status.value?.deviceId || 'Unavailable'))
const lastRunLabel = computed(() => {
  if (isSyncing.value) return 'Synchronization in progress'
  const formatted = formatEpochSeconds(status.value?.lastRunAt, '')
  return formatted ? `Last sync ${formatted}` : 'Not synchronized yet'
})
const transferLabel = computed(() => {
  const files = Number(status.value?.transferredFiles || 0)
  const bytes = Number(status.value?.transferredBytes || 0)
  return files ? `${files} file${files === 1 ? '' : 's'} · ${formatBytes(bytes)}` : ''
})
const validRetention = computed(() => {
  const value = Number(retentionDays.value)
  const minimum = Number(conflictSettings.value?.minimumRetentionDays || 1)
  const maximum = Number(conflictSettings.value?.maximumRetentionDays || 365)
  return Number.isInteger(value) && value >= minimum && value <= maximum
})
const syncTone = computed(() => {
  if (hasError.value) return 'error'
  if (isSyncing.value) return 'progress'
  if (hasCompletedSync.value) return 'success'
  return 'neutral'
})
const syncHeadline = computed(() => {
  if (!hasVault.value) return 'Open a vault to configure synchronization'
  if (hasError.value) return 'Synchronization needs attention'
  if (isSyncing.value) return 'Synchronizing your vault…'
  if (!pairedDevices.value.length) return 'Connect another device'
  if (hasCompletedSync.value) return 'Last synchronization completed'
  return 'Ready to synchronize'
})
const syncDescription = computed(() => {
  if (!hasVault.value) return 'Synchronization is configured separately for each vault.'
  if (hasError.value) return String(status.value?.lastError || 'The last synchronization failed.')
  if (isSyncing.value) return 'Comparing manifests and transferring only changed files.'
  if (!pairedDevices.value.length) return 'Pair another ElephantNote installation without a cloud account or shared folder.'
  if (hasCompletedSync.value) return `${pairedDevices.value.length} paired device${pairedDevices.value.length === 1 ? '' : 's'} for this vault.`
  return 'Your paired devices are ready for the first synchronization.'
})
const inviteDetails = computed(() => parseSyncInvite(inviteCode.value))
const inviteExpiresAt = computed(() => Number(inviteDetails.value?.expiresAt || 0))
const inviteSecondsRemaining = computed(() => Math.max(0, inviteExpiresAt.value - nowSeconds.value))
const inviteExpiryLabel = computed(() => {
  const seconds = inviteSecondsRemaining.value
  if (seconds <= 0) return 'Invitation expired'
  const minutes = Math.floor(seconds / 60)
  const remaining = String(seconds % 60).padStart(2, '0')
  return `Expires in ${minutes}:${remaining}`
})
const incomingInviteValid = computed(() => Boolean(incomingInviteDetails.value && !incomingInviteError.value))
const incomingInviteSummary = computed(() => {
  const details = incomingInviteDetails.value
  if (!details) return ''
  const label = details.folderLabel || details.deviceName || 'ElephantNote vault'
  const expires = formatEpochSeconds(details.expiresAt, 'soon')
  return `${label} · valid until ${expires}`
})
const inviteFileName = computed(() => buildSyncInviteFileName(
  activeVaultName.value,
  inviteDetails.value?.inviteId
))

const shortId = (value) => {
  const text = String(value || '')
  if (text.length <= 20) return text
  return `${text.slice(0, 10)}…${text.slice(-8)}`
}

const formatEpochSeconds = (value, fallback = 'Unknown') => {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback
  return new Date(seconds * 1000).toLocaleString()
}

const formatTimestamp = (value) => {
  const milliseconds = Number(value)
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 'unknown time'
  return new Date(milliseconds).toLocaleString()
}

const formatBytes = (value) => {
  const bytes = Number(value || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const amount = bytes / (1024 ** index)
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`
}

const errorMessage = (error, fallback) => error instanceof Error ? error.message : fallback

const validateIncomingInvite = () => {
  incomingInviteDetails.value = null
  incomingInviteError.value = ''
  if (!incomingInvite.value) return
  try {
    incomingInviteDetails.value = validateSyncInvitePayload(incomingInvite.value)
  } catch (error) {
    incomingInviteError.value = errorMessage(error, 'This invitation cannot be used.')
  }
}

const loadStatus = async () => {
  status.value = await irohSyncClient.status()
  statusMessage.value = status.value?.lastError || ''
}

const loadConflictSettings = async () => {
  const result = await irohSyncClient.conflictSettings()
  conflictSettings.value = result || conflictSettings.value
  retentionDays.value = Number(result?.retentionDays || 3)
  if (Number(result?.deletedFiles || 0) > 0) {
    conflictMessage.value = `${result.deletedFiles} expired conflict file(s) removed.`
  }
}

const refreshAll = async (silent = false) => {
  if (!hasVault.value || (loading.value && !silent)) return
  if (!silent) loading.value = true
  try {
    await Promise.all([loadStatus(), loadConflictSettings()])
  } catch (error) {
    statusMessage.value = errorMessage(error, 'Unable to load synchronization status.')
  } finally {
    if (!silent) loading.value = false
  }
}

const openPairing = (mode = 'create') => {
  pairingMode.value = mode
  pairingOpen.value = true
  if (mode === 'join') nextTick(() => inviteFileInput.value?.focus?.())
}

const closePairing = () => {
  pairingOpen.value = false
  inviteCode.value = ''
  inviteQrDataUrl.value = ''
  incomingInvite.value = ''
  incomingInviteDetails.value = null
  incomingInviteError.value = ''
  copied.value = false
}

const createInvite = async () => {
  if (!hasVault.value || loading.value) return
  loading.value = true
  statusMessage.value = 'Creating a secure one-time invitation…'
  try {
    const result = await irohSyncClient.createInvite({ deviceName: activeVaultName.value })
    inviteCode.value = String(result?.manualCode || result?.qrPayload || '')
    if (!inviteCode.value) throw new Error('The synchronization backend returned an empty invitation.')
    inviteQrDataUrl.value = await generateSyncInviteQrDataUrl(inviteCode.value)
    nowSeconds.value = Math.floor(Date.now() / 1000)
    copied.value = false
    statusMessage.value = 'Invitation created. Keep ElephantNote open until the other device accepts it.'
  } catch (error) {
    inviteQrDataUrl.value = ''
    statusMessage.value = errorMessage(error, 'Unable to create a synchronization invitation.')
  } finally {
    loading.value = false
  }
}

const copyInvite = async () => {
  if (!inviteCode.value) return
  try {
    await navigator.clipboard.writeText(inviteCode.value)
    copied.value = true
    statusMessage.value = 'Invitation code copied.'
  } catch {
    copied.value = false
    statusMessage.value = 'Clipboard access failed. Save the invitation file instead.'
  }
}

const createInviteFile = () => createSyncInviteFile(inviteCode.value, inviteFileName.value)

const downloadInviteFile = () => {
  if (!inviteCode.value || inviteSecondsRemaining.value <= 0) return false
  const blob = new Blob([inviteCode.value], { type: INVITE_MIME })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = inviteFileName.value
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  statusMessage.value = 'Invitation file saved. It remains valid until the displayed expiration time.'
  return true
}

const shareInviteFile = async () => {
  if (!inviteCode.value || inviteSecondsRemaining.value <= 0) return
  const file = createInviteFile()
  const sharePayload = {
    title: 'ElephantNote pairing invitation',
    text: 'Open this invitation from Settings → Sync within ten minutes.',
    files: [file]
  }
  const canShareFiles = typeof navigator.share === 'function' && (
    typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] })
  )
  if (!canShareFiles) {
    downloadInviteFile()
    statusMessage.value = 'Native sharing is unavailable here, so the invitation file was saved instead.'
    return
  }
  try {
    await navigator.share(sharePayload)
    statusMessage.value = 'Invitation shared. Keep ElephantNote open while the other device pairs.'
  } catch (error) {
    if (error?.name === 'AbortError') return
    downloadInviteFile()
    statusMessage.value = 'Sharing failed, so the invitation file was saved instead.'
  }
}

const readInviteFile = async (file) => {
  if (!file) return
  if (file.size > MAX_INVITE_FILE_BYTES) {
    incomingInviteError.value = 'This file is too large to be an ElephantNote invitation.'
    incomingInviteDetails.value = null
    return
  }
  try {
    incomingInvite.value = (await file.text()).trim()
    validateIncomingInvite()
    if (incomingInviteValid.value) statusMessage.value = `Loaded ${file.name}.`
  } catch (error) {
    incomingInviteDetails.value = null
    incomingInviteError.value = errorMessage(error, 'Unable to read this invitation file.')
  }
}

const importInviteFile = async (event) => {
  const input = event?.target
  await readInviteFile(input?.files?.[0])
  if (input) input.value = ''
}

const handleInviteDrop = async (event) => {
  await readInviteFile(event?.dataTransfer?.files?.[0])
}

const handleScannedInvite = (payload) => {
  incomingInvite.value = String(payload || '').trim()
  validateIncomingInvite()
  if (incomingInviteValid.value) {
    statusMessage.value = 'QR invitation decoded and validated. Confirm to pair this device.'
  }
}

const handleScannerError = (message) => {
  statusMessage.value = String(message || 'Unable to scan this QR code.')
}

const acceptInvite = async () => {
  if (!incomingInviteValid.value || !hasVault.value || loading.value) return
  loading.value = true
  statusMessage.value = 'Authenticating and pairing the remote device…'
  try {
    const result = await irohSyncClient.acceptInvite(incomingInvite.value)
    status.value = result?.status || await irohSyncClient.status()
    await loadConflictSettings()
    statusMessage.value = 'Device paired. You can synchronize now.'
    closePairing()
  } catch (error) {
    statusMessage.value = errorMessage(error, 'Unable to accept this invitation.')
  } finally {
    loading.value = false
  }
}

const syncNow = async () => {
  if (!pairedDevices.value.length || !hasVault.value || loading.value) return
  loading.value = true
  syncing.value = true
  statusMessage.value = 'Comparing manifests and transferring changed files…'
  try {
    status.value = await irohSyncClient.run()
    statusMessage.value = status.value?.lastError || 'Synchronization finished.'
    await loadConflictSettings()
  } catch (error) {
    statusMessage.value = errorMessage(error, 'Synchronization failed.')
  } finally {
    syncing.value = false
    loading.value = false
  }
}

const saveRetention = async () => {
  if (!validRetention.value || !hasVault.value || loading.value) return
  loading.value = true
  conflictMessage.value = 'Saving local conflict retention…'
  try {
    const result = await irohSyncClient.setConflictRetentionDays(retentionDays.value)
    conflictSettings.value = result
    retentionDays.value = Number(result?.retentionDays || retentionDays.value)
    conflictMessage.value = Number(result?.deletedFiles || 0) > 0
      ? `Saved. ${result.deletedFiles} expired conflict file(s) removed.`
      : 'Retention saved for this device.'
  } catch (error) {
    conflictMessage.value = errorMessage(error, 'Unable to save conflict retention.')
  } finally {
    loading.value = false
  }
}

const restoreConflict = async (entry) => {
  if (!entry?.path || loading.value) return
  loading.value = true
  conflictActionPath.value = entry.path
  conflictMessage.value = `Restoring ${entry.path}…`
  try {
    const result = await irohSyncClient.restoreConflict(entry.path)
    conflictSettings.value = result
    conflictMessage.value = `Restored as ${result?.restoredPath || 'a separate vault file'}.`
  } catch (error) {
    conflictMessage.value = errorMessage(error, 'Unable to restore this conflict copy.')
  } finally {
    conflictActionPath.value = ''
    loading.value = false
  }
}

const deleteConflict = async (entry) => {
  if (!entry?.path || loading.value) return
  if (!window.confirm(`Delete the temporary conflict copy "${entry.path}"?`)) return
  loading.value = true
  conflictActionPath.value = entry.path
  conflictMessage.value = `Deleting ${entry.path}…`
  try {
    conflictSettings.value = await irohSyncClient.deleteConflict(entry.path)
    conflictMessage.value = 'Temporary conflict copy deleted from this device.'
  } catch (error) {
    conflictMessage.value = errorMessage(error, 'Unable to delete this conflict copy.')
  } finally {
    conflictActionPath.value = ''
    loading.value = false
  }
}

const scrollToConflicts = async () => {
  await nextTick()
  conflictsSection.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}

const applyInitialPage = (page) => {
  if (page === 'devices') openPairing('create')
  if (page === 'conflicts') scrollToConflicts()
}

watch(() => props.initialPage, applyInitialPage)

watch(() => props.activeVaultPath, () => {
  closePairing()
  refreshAll()
})

onMounted(() => {
  refreshAll()
  applyInitialPage(props.initialPage)
  refreshTimer = window.setInterval(() => {
    if (!loading.value && hasVault.value) refreshAll(true)
  }, 5000)
  countdownTimer = window.setInterval(() => {
    nowSeconds.value = Math.floor(Date.now() / 1000)
  }, 1000)
})

onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer)
  if (countdownTimer) window.clearInterval(countdownTimer)
})
</script>

<style scoped>
.en-sync-panel { display: grid; gap: 14px; color: var(--en-text, #101828); }
.en-sync-hero { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; padding: 20px; overflow: hidden; }
.en-sync-hero::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--en-border-strong, #aebacd); }
.en-sync-hero.tone-success::before { background: #22c55e; }
.en-sync-hero.tone-error::before { background: #ef4444; }
.en-sync-hero.tone-progress::before { background: var(--en-primary, #2563eb); }
.en-sync-hero-main { min-width: 0; display: flex; align-items: flex-start; gap: 13px; }
.en-sync-hero-icon { width: 42px; height: 42px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 12px; background: color-mix(in srgb, var(--en-primary, #2563eb) 10%, var(--en-soft, #e9eff7)); color: var(--en-primary, #2563eb); }
.tone-success .en-sync-hero-icon { background: rgba(34, 197, 94, 0.1); color: #15803d; }
.tone-error .en-sync-hero-icon { background: rgba(239, 68, 68, 0.1); color: #b42318; }
.en-sync-hero-icon svg { width: 21px; height: 21px; }
.en-sync-hero small { display: block; margin-bottom: 4px; color: var(--en-muted, #667085); font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.08em; }
.en-sync-hero h3 { margin: 0; font-size: 18px; line-height: 1.25; letter-spacing: -0.025em; }
.en-sync-hero p { max-width: 600px; margin: 5px 0 0; color: var(--en-muted, #667085); font-size: 11.5px; line-height: 1.5; }
.en-sync-hero-actions { display: flex; align-items: flex-start; gap: 8px; }
.en-sync-hero-meta { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px 18px; padding-top: 13px; border-top: 1px solid var(--en-border, #c5cfdd); color: var(--en-muted, #667085); font-size: 10px; }
.en-sync-hero-meta span { min-width: 0; display: inline-flex; align-items: center; gap: 6px; }
.en-sync-hero-meta svg { width: 13px; height: 13px; }
.en-sync-message, .en-sync-inline-message { margin: 0; padding: 9px 12px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 9px; background: color-mix(in srgb, var(--en-soft, #e9eff7) 42%, transparent); color: var(--en-muted, #667085); font-size: 10.5px; }
.en-sync-message.error { color: #b42318; }
.en-sync-inline-message { margin: 0 16px 14px; }
.en-sync-attention { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 11px; padding: 11px 14px; border: 1px solid color-mix(in srgb, #f59e0b 34%, var(--en-border, #c5cfdd)); border-radius: 12px; background: color-mix(in srgb, #f59e0b 7%, var(--en-surface, #fff)); }
.en-sync-attention strong { font-size: 12px; }
.en-sync-attention p { margin: 2px 0 0; color: var(--en-muted, #667085); font-size: 10.5px; }
.en-sync-card-header > div { min-width: 0; }
.en-sync-card-header > div > span { display: block; margin-top: 2px; color: var(--en-muted, #667085); font-size: 10.5px; }
.en-sync-list { display: grid; }
.en-sync-device-row, .en-conflict-row, .en-sync-empty { min-height: 66px; display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 11px; padding: 10px 16px; }
.en-sync-device-row + .en-sync-device-row, .en-conflict-row + .en-conflict-row { border-top: 1px solid var(--en-border, #c5cfdd); }
.en-sync-row-copy { min-width: 0; }
.en-sync-row-copy strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
.en-sync-row-copy p, .en-sync-empty p, .en-sync-setting-row p { margin: 3px 0 0; color: var(--en-muted, #667085); font-size: 10.5px; line-height: 1.42; }
.en-device-avatar, .en-conflict-icon { width: 30px; height: 30px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 8px; background: var(--en-soft, #e9eff7); color: var(--en-primary, #2563eb); }
.en-device-avatar svg, .en-conflict-icon svg { width: 15px; height: 15px; }
.en-conflict-icon.warning { color: #b45309; background: rgba(245, 158, 11, 0.12); }
.en-sync-setting-row { min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 14px 16px; }
.en-sync-setting-row > div:first-child { min-width: 0; }
.en-sync-setting-row strong { font-size: 12.5px; }
.en-retention-control, .en-retention-control label, .en-conflict-actions { display: flex; align-items: center; gap: 7px; }
.en-retention-control input { width: 68px; }
.en-retention-control span { color: var(--en-muted, #667085); font-size: 10.5px; }
.en-sync-archive-heading { padding: 10px 16px; border-top: 1px solid var(--en-border, #c5cfdd); border-bottom: 1px solid var(--en-border, #c5cfdd); background: color-mix(in srgb, var(--en-bg, #f7f9fc) 76%, var(--en-surface, #fff)); }
.en-sync-archive-heading div { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.en-sync-archive-heading strong { font-size: 11.5px; }
.en-sync-archive-heading span { color: var(--en-muted, #667085); font-size: 10px; }
.en-sync-advanced summary { min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 16px; cursor: pointer; list-style: none; }
.en-sync-advanced summary::-webkit-details-marker { display: none; }
.en-sync-advanced summary > span { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 650; }
.en-sync-advanced summary svg { width: 15px; height: 15px; color: var(--en-muted, #667085); transition: transform 140ms ease; }
.en-sync-advanced[open] summary > svg { transform: rotate(180deg); }
.en-sync-advanced-content { display: grid; gap: 0; border-top: 1px solid var(--en-border, #c5cfdd); }
.en-sync-advanced-content > div { min-height: 56px; display: grid; grid-template-columns: 140px minmax(0, 1fr); align-items: center; gap: 14px; padding: 0 16px; }
.en-sync-advanced-content > div + div { border-top: 1px solid var(--en-border, #c5cfdd); }
.en-sync-advanced-content span { color: var(--en-muted, #667085); font-size: 10.5px; }
.en-sync-advanced-content strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.en-sync-advanced-content > p { margin: 0; padding: 12px 16px; border-top: 1px solid var(--en-border, #c5cfdd); color: var(--en-muted, #667085); font-size: 10.5px; line-height: 1.5; }
.en-pair-modal-backdrop { position: fixed; inset: 0; z-index: 3300; display: grid; place-items: center; padding: 24px; background: rgba(2, 6, 23, 0.46); backdrop-filter: blur(10px); }
.en-pair-modal { width: min(760px, 94vw); max-height: min(760px, 92vh); display: grid; grid-template-rows: auto auto minmax(0, 1fr); overflow: hidden; box-shadow: 0 30px 90px rgba(2, 6, 23, 0.32) !important; }
.en-pair-modal-header { border-bottom: 0 !important; }
.en-pair-mode { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; margin: 0 16px 12px; padding: 4px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 11px; background: var(--en-bg, #f7f9fc); }
.en-pair-mode button { border-color: transparent !important; background: transparent !important; color: var(--en-muted, #667085) !important; }
.en-pair-mode button.active { border-color: var(--en-border, #c5cfdd) !important; background: var(--en-surface, #fff) !important; color: var(--en-text, #101828) !important; box-shadow: 0 1px 4px rgba(2, 6, 23, 0.08); }
.en-pair-pane { min-height: 0; display: flex; flex-direction: column; gap: 14px; padding: 4px 20px 20px; overflow: auto; }
.en-pair-intro { display: flex; align-items: flex-start; gap: 12px; padding: 18px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 12px; background: var(--en-bg, #f7f9fc); }
.en-pair-intro-icon { width: 36px; height: 36px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 10px; background: color-mix(in srgb, var(--en-primary, #2563eb) 10%, var(--en-soft, #e9eff7)); color: var(--en-primary, #2563eb); }
.en-pair-intro-icon svg { width: 18px; height: 18px; }
.en-pair-intro strong, .en-invite-drop strong { font-size: 12.5px; }
.en-pair-intro p, .en-invite-drop p, .en-pair-share p, .en-pair-footer p { margin: 4px 0 0; color: var(--en-muted, #667085); font-size: 10.5px; line-height: 1.5; }
.en-pair-invitation-layout { display: grid; grid-template-columns: minmax(250px, 0.9fr) minmax(0, 1.1fr); gap: 18px; align-items: stretch; }
.en-pair-qr { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 16px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 12px; background: #fff; }
.en-pair-qr img { width: min(280px, 100%); aspect-ratio: 1; display: block; image-rendering: pixelated; }
.en-pair-qr figcaption { color: #667085; font-size: 9.5px; line-height: 1.4; text-align: center; }
.en-pair-qr-error { min-height: 230px; display: grid; place-items: center; gap: 8px; color: #b42318; font-size: 10.5px; text-align: center; }
.en-pair-share { display: flex; flex-direction: column; align-items: stretch; gap: 9px; padding: 16px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 12px; background: var(--en-bg, #f7f9fc); }
.en-pair-share > .en-sync-status { align-self: flex-start; }
.en-pair-share h5 { margin: 4px 0 0; font-size: 13px; }
.en-pair-security-note { display: flex; align-items: flex-start; gap: 9px; padding: 10px 12px; border: 1px solid color-mix(in srgb, #f59e0b 28%, var(--en-border, #c5cfdd)); border-radius: 10px; background: color-mix(in srgb, #f59e0b 6%, var(--en-surface, #fff)); color: var(--en-muted, #667085); }
.en-pair-security-note svg { width: 15px; height: 15px; flex: 0 0 auto; color: #b45309; }
.en-pair-security-note p { margin: 0; font-size: 10px; line-height: 1.5; }
.en-invite-drop { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 16px; border: 1px dashed var(--en-border-strong, #aebacd); border-radius: 12px; background: var(--en-bg, #f7f9fc); transition: border-color 140ms ease, background 140ms ease; }
.en-invite-drop.ready { border-style: solid; border-color: color-mix(in srgb, #16a34a 40%, var(--en-border, #c5cfdd)); background: color-mix(in srgb, #16a34a 5%, var(--en-bg, #f7f9fc)); }
.en-pair-divider { display: flex; align-items: center; gap: 10px; color: var(--en-muted, #667085); font-size: 9.5px; }
.en-pair-divider::before, .en-pair-divider::after { content: ''; height: 1px; flex: 1; background: var(--en-border, #c5cfdd); }
.en-pair-pane textarea { min-height: 108px; resize: vertical; font: 10px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace !important; }
.en-pair-validation { display: flex; align-items: center; gap: 7px; margin: -5px 0 0; font-size: 10.5px; }
.en-pair-validation svg { width: 14px; height: 14px; }
.en-pair-validation.error { color: #b42318; }
.en-pair-validation.success { color: #15803d; }
.en-pair-footer { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding-top: 4px; }
.en-pair-footer p { max-width: 420px; margin: 0; }
.visually-hidden { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; white-space: nowrap !important; border: 0 !important; }
.spinning { animation: spin 0.9s linear infinite; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) {
  .en-sync-hero { grid-template-columns: 1fr; }
  .en-sync-hero-actions { justify-content: flex-end; }
  .en-pair-invitation-layout { grid-template-columns: 1fr; }
  .en-pair-qr img { width: min(240px, 100%); }
}
@media (max-width: 620px) {
  .en-sync-device-row, .en-conflict-row, .en-sync-empty, .en-sync-attention { grid-template-columns: 32px minmax(0, 1fr); }
  .en-sync-device-row > :last-child, .en-conflict-row > :last-child, .en-sync-empty-action > :last-child, .en-sync-attention > :last-child { grid-column: 2; justify-self: start; }
  .en-sync-setting-row, .en-pair-footer { align-items: stretch; flex-direction: column; }
  .en-retention-control { justify-content: flex-start; }
  .en-pair-modal-backdrop { padding: 10px; }
  .en-pair-modal { width: 100%; max-height: 96vh; }
  .en-pair-mode { grid-template-columns: 1fr; }
  .en-invite-drop { grid-template-columns: 36px minmax(0, 1fr); }
  .en-invite-drop button { grid-column: 2; justify-self: start; }
}
</style>

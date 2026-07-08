<template>
  <section class="en-qr-scanner" :class="{ scanning }">
    <input
      ref="imageInput"
      class="visually-hidden"
      type="file"
      :accept="INVITE_IMAGE_ACCEPT"
      capture="environment"
      @change="scanImageFile"
    >

    <div v-if="!scanning" class="en-qr-scanner-actions">
      <button class="primary" type="button" :disabled="busy" @click="startCameraScanner">
        <Camera aria-hidden="true" />
        {{ busy ? 'Opening camera…' : 'Scan with camera' }}
      </button>
      <button class="secondary" type="button" :disabled="busy" @click="imageInput?.click()">
        <ImageUp aria-hidden="true" /> Use camera app or QR image
      </button>
    </div>

    <div v-else class="en-qr-preview">
      <video ref="video" autoplay muted playsinline aria-label="Live camera preview for QR scanning"></video>
      <span class="en-qr-frame" aria-hidden="true"></span>
      <div class="en-qr-preview-actions">
        <span><ScanLine aria-hidden="true" /> Point the camera at the ElephantNote QR code</span>
        <button class="secondary compact" type="button" @click="stopCameraScanner">Stop camera</button>
      </div>
    </div>

    <p class="en-qr-help">
      Live scanning stays on this device. On mobile, “Use camera app or QR image” can open the system camera and decode the captured photo after it returns to ElephantNote.
    </p>
    <p v-if="scannerError" class="en-qr-error"><AlertTriangle aria-hidden="true" />{{ scannerError }}</p>
  </section>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { AlertTriangle, Camera, ImageUp, ScanLine } from '@lucide/vue'
import { INVITE_IMAGE_ACCEPT, validateSyncInvitePayload } from '../../services/syncInvite'

const props = defineProps({
  active: { type: Boolean, default: true }
})

const emit = defineEmits(['decoded', 'error'])

const video = ref(null)
const imageInput = ref(null)
const scanning = ref(false)
const busy = ref(false)
const scannerError = ref('')
let scannerControls = null
let scannerReader = null
let resultHandled = false

const friendlyScannerError = (error, fallback) => {
  const name = String(error?.name || '')
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera access was denied. Allow camera access or use a QR image instead.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera was found on this device. Use a QR image instead.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The camera is already in use or could not be opened.'
  }
  return error instanceof Error && error.message ? error.message : fallback
}

const reportError = (message) => {
  scannerError.value = message
  emit('error', message)
}

const stopCameraScanner = () => {
  try {
    scannerControls?.stop?.()
  } catch {
    // The camera may already have stopped after a successful decode.
  }
  scannerControls = null
  scannerReader = null
  const stream = video.value?.srcObject
  if (stream?.getTracks) {
    for (const track of stream.getTracks()) track.stop()
  }
  if (video.value) video.value.srcObject = null
  scanning.value = false
  busy.value = false
  resultHandled = false
}

const acceptDecodedPayload = (payload) => {
  const normalized = String(payload || '').trim()
  validateSyncInvitePayload(normalized)
  resultHandled = true
  stopCameraScanner()
  scannerError.value = ''
  emit('decoded', normalized)
}

const startCameraScanner = async () => {
  if (busy.value || scanning.value) return
  scannerError.value = ''
  resultHandled = false
  busy.value = true
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Live camera scanning is unavailable in this webview. Use the system camera or a QR image instead.')
    }
    const { BrowserQRCodeReader } = await import('@zxing/browser')
    scannerReader = new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 150,
      delayBetweenScanSuccess: 500
    })
    scanning.value = true
    await new Promise((resolve) => requestAnimationFrame(resolve))
    scannerControls = await scannerReader.decodeFromConstraints(
      {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      },
      video.value,
      (result, error) => {
        if (result && !resultHandled) {
          try {
            acceptDecodedPayload(result.getText())
          } catch (validationError) {
            reportError(friendlyScannerError(validationError, 'The scanned QR code is not a valid ElephantNote invitation.'))
          }
          return
        }
        const errorName = String(error?.name || error?.constructor?.name || '')
        if (error && !['NotFoundException', 'ChecksumException', 'FormatException'].includes(errorName)) {
          reportError(friendlyScannerError(error, 'The QR scanner stopped unexpectedly.'))
        }
      }
    )
  } catch (error) {
    stopCameraScanner()
    reportError(friendlyScannerError(error, 'Unable to start the QR scanner.'))
  } finally {
    busy.value = false
  }
}

const scanImageFile = async (event) => {
  const input = event?.target
  const file = input?.files?.[0]
  if (input) input.value = ''
  if (!file) return
  scannerError.value = ''
  busy.value = true
  const objectUrl = URL.createObjectURL(file)
  try {
    const { BrowserQRCodeReader } = await import('@zxing/browser')
    const reader = new BrowserQRCodeReader()
    const result = await reader.decodeFromImageUrl(objectUrl)
    acceptDecodedPayload(result.getText())
  } catch (error) {
    reportError(friendlyScannerError(error, 'No readable ElephantNote QR code was found in this image.'))
  } finally {
    URL.revokeObjectURL(objectUrl)
    busy.value = false
  }
}

watch(() => props.active, (active) => {
  if (!active) stopCameraScanner()
})

onBeforeUnmount(stopCameraScanner)
</script>

<style scoped>
.en-qr-scanner { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 12px; background: var(--en-bg, #f7f9fc); }
.en-qr-scanner-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.en-qr-preview { position: relative; overflow: hidden; border-radius: 11px; background: #020617; min-height: 280px; }
.en-qr-preview video { width: 100%; min-height: 280px; max-height: 420px; display: block; object-fit: cover; }
.en-qr-frame { position: absolute; left: 50%; top: 50%; width: min(58%, 260px); aspect-ratio: 1; transform: translate(-50%, -56%); border: 2px solid rgba(255, 255, 255, 0.92); border-radius: 16px; box-shadow: 0 0 0 999px rgba(2, 6, 23, 0.34); pointer-events: none; }
.en-qr-preview-actions { position: absolute; inset: auto 10px 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 9px; border-radius: 9px; background: rgba(2, 6, 23, 0.72); color: #fff; backdrop-filter: blur(8px); }
.en-qr-preview-actions span { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; }
.en-qr-preview-actions svg { width: 14px; height: 14px; }
.en-qr-help { margin: 0; color: var(--en-muted, #667085); font-size: 10px; line-height: 1.45; }
.en-qr-error { display: flex; align-items: flex-start; gap: 7px; margin: 0; color: #b42318; font-size: 10.5px; line-height: 1.45; }
.en-qr-error svg { width: 14px; height: 14px; flex: 0 0 auto; }
.visually-hidden { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; white-space: nowrap !important; border: 0 !important; }
@media (max-width: 620px) {
  .en-qr-scanner-actions { grid-template-columns: 1fr; }
  .en-qr-preview-actions { align-items: stretch; flex-direction: column; }
}
</style>

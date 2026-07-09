import QRCodeGenerator from 'qrcode'

export const INVITE_PROTOCOL = 'elephantnote-iroh-sync-v1'
export const INVITE_MIME = 'application/vnd.elephantnote.sync-invite+json'
export const INVITE_EXTENSION = '.elephantnote-invite'
export const INVITE_FILE_ACCEPT = `${INVITE_EXTENSION},${INVITE_MIME},application/json`
export const INVITE_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/*'
export const MAX_INVITE_FILE_BYTES = 1024 * 1024

const normalizedPayload = (raw) => String(raw || '').trim()

export const parseSyncInvite = (raw) => {
  const payload = normalizedPayload(raw)
  if (!payload) return null
  try {
    const value = JSON.parse(payload)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

export const validateSyncInvitePayload = (raw, nowSeconds = Math.floor(Date.now() / 1000)) => {
  const payload = normalizedPayload(raw)
  let value
  try {
    value = JSON.parse(payload)
  } catch {
    throw new Error('This invitation is not valid JSON.')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.protocol !== INVITE_PROTOCOL) {
    throw new Error('This is not an ElephantNote synchronization invitation.')
  }
  if (!value.inviteId || !value.inviteToken || !value.endpointAddr || !value.folderId) {
    throw new Error('The invitation is incomplete.')
  }
  const expiresAt = Number(value.expiresAt || 0)
  if (!Number.isFinite(expiresAt) || expiresAt <= Number(nowSeconds)) {
    throw new Error('This invitation has expired. Create a new one on the other device.')
  }
  return value
}

export const buildSyncInviteFileName = (vaultName, inviteId) => {
  const safeVault = String(vaultName || 'vault')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'vault'
  const safeInviteId = String(inviteId || 'pairing')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .slice(0, 80) || 'pairing'
  return `ElephantNote-${safeVault}-${safeInviteId}${INVITE_EXTENSION}`
}

export const createSyncInviteFile = (payload, fileName) => {
  const normalized = normalizedPayload(payload)
  validateSyncInvitePayload(normalized)
  return new File([normalized], fileName, { type: INVITE_MIME })
}

export const generateSyncInviteQrDataUrl = async (payload) => {
  const normalized = normalizedPayload(payload)
  validateSyncInvitePayload(normalized)
  return QRCodeGenerator.toDataURL(normalized, {
    errorCorrectionLevel: 'L',
    width: 640,
    margin: 4,
    color: { dark: '#101828ff', light: '#ffffffff' }
  })
}

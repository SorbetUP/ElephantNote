export const INVITE_PROTOCOL = 'elephantnote-iroh-sync-v1'
export const INVITE_MIME = 'application/vnd.elephantnote.sync-invite+json'
export const INVITE_EXTENSION = '.elephantnote-invite'
export const INVITE_FILE_ACCEPT = `${INVITE_EXTENSION},${INVITE_MIME},application/json,text/plain`
export const MAX_INVITE_FILE_BYTES = 1024 * 1024

const normalizedPayload = (raw) => String(raw || '').trim()

const decodeBase64Url = (value = '') => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return decodeURIComponent(Array.from(atob(padded), (character) =>
    `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''))
}

export const unwrapSyncInvite = (raw) => {
  const payload = normalizedPayload(raw)
  if (!payload) return ''
  if (!/^elephant(?:note)?:\/\/sync\/invite/i.test(payload)) return payload
  const url = new URL(payload)
  const direct = url.searchParams.get('invite') || url.searchParams.get('payload')
  if (!direct) throw new Error('The Elephant Sync link contains no invitation payload.')
  try {
    return decodeBase64Url(direct)
  } catch {
    return direct
  }
}

export const parseSyncInvite = (raw) => {
  const payload = unwrapSyncInvite(raw)
  if (!payload) return null
  try {
    const value = JSON.parse(payload)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

export const validateSyncInvitePayload = (raw, nowSeconds = Math.floor(Date.now() / 1000)) => {
  const payload = unwrapSyncInvite(raw)
  if (!payload) throw new Error('Paste or import an Elephant Sync invitation.')
  const value = parseSyncInvite(payload)
  if (!value) {
    if (payload.length < 12) throw new Error('This manual pairing code is too short.')
    return { kind: 'manual', payload }
  }
  if (value.protocol !== INVITE_PROTOCOL) {
    throw new Error('This JSON document is not an Elephant Sync invitation.')
  }
  if (!value.inviteId || !value.inviteToken || !value.endpointAddr || !value.folderId) {
    throw new Error('The Elephant Sync invitation is incomplete.')
  }
  const expiresAt = Number(value.expiresAt || 0)
  if (!Number.isFinite(expiresAt) || expiresAt <= Number(nowSeconds)) {
    throw new Error('This Elephant Sync invitation has expired. Create a new one on the other device.')
  }
  return { kind: 'structured', payload, value }
}

const portableFileSegment = (value, fallback, maxLength) => String(value || fallback)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, maxLength) || fallback

export const buildSyncInviteFileName = (vaultName, inviteId) => {
  const safeVault = portableFileSegment(vaultName, 'vault', 48)
  const safeInviteId = portableFileSegment(inviteId, 'pairing', 80)
  return `Elephant-${safeVault}-${safeInviteId}${INVITE_EXTENSION}`
}

export const readSyncInviteFile = async (file) => {
  if (!file) throw new Error('No invitation file was selected.')
  if (Number(file.size || 0) > MAX_INVITE_FILE_BYTES) {
    throw new Error('The invitation file is larger than 1 MiB.')
  }
  const payload = await file.text()
  return validateSyncInvitePayload(payload).payload
}

export const downloadSyncInvite = (documentRef, payload, fileName) => {
  const validated = validateSyncInvitePayload(payload)
  const blob = new Blob([validated.payload], { type: INVITE_MIME })
  const url = URL.createObjectURL(blob)
  const anchor = documentRef.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  documentRef.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return fileName
}

export const copySyncInvite = async (windowRef, payload) => {
  const validated = validateSyncInvitePayload(payload)
  if (windowRef?.navigator?.clipboard?.writeText) {
    await windowRef.navigator.clipboard.writeText(validated.payload)
    return validated.payload
  }
  throw new Error('Clipboard access is unavailable. Select and copy the invitation manually.')
}

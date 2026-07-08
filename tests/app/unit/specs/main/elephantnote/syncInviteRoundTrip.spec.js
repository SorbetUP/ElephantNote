import { describe, expect, it } from 'vitest'
import QRCode from 'qrcode'
import { PNG } from 'pngjs'
import {
  BinaryBitmap,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource
} from '@zxing/library'
import {
  INVITE_MIME,
  buildSyncInviteFileName,
  createSyncInviteFile,
  generateSyncInviteQrDataUrl,
  validateSyncInvitePayload
} from '../../../../../../Elephant/frontend/app/services/syncInvite'

const NOW = 1_800_000_000

const createInvite = () => ({
  protocol: 'elephantnote-iroh-sync-v1',
  version: 1,
  backend: 'iroh',
  transport: 'iroh-quic-mdns',
  inviteId: 'invite-0123456789abcdef',
  inviteToken: 'a'.repeat(64),
  expiresAt: NOW + 600,
  folderId: 'vault-round-trip-test',
  folderLabel: 'Round trip vault',
  deviceName: 'Laptop A',
  endpointAddr: {
    id: 'b'.repeat(64),
    relayUrls: [],
    directAddresses: ['192.168.1.22:44555', '[fe80::1]:44555']
  },
  security: {
    transport: 'iroh-quic',
    authenticatedEncryption: true,
    identity: 'iroh-endpoint-id',
    cloudRequired: false
  }
})

const decodePngQr = (buffer) => {
  const png = PNG.sync.read(buffer)
  const luminances = new Uint8ClampedArray(png.width * png.height)
  for (let pixel = 0; pixel < luminances.length; pixel += 1) {
    const offset = pixel * 4
    luminances[pixel] = Math.floor((
      png.data[offset] +
      (2 * png.data[offset + 1]) +
      png.data[offset + 2]
    ) / 4)
  }
  const source = new RGBLuminanceSource(luminances, png.width, png.height)
  const bitmap = new BinaryBitmap(new HybridBinarizer(source))
  return new QRCodeReader().decode(bitmap).getText()
}

const readFileText = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(reader.error || new Error('Unable to read invitation file.'))
  reader.onload = () => resolve(String(reader.result || ''))
  reader.readAsText(file)
})

describe('ElephantNote synchronization invitation round trips', () => {
  it('generates a QR code that an independent ZXing decoder reads byte-for-byte', async () => {
    const payload = JSON.stringify(createInvite())
    const png = await QRCode.toBuffer(payload, {
      type: 'png',
      errorCorrectionLevel: 'L',
      width: 640,
      margin: 4
    })

    const decoded = decodePngQr(png)

    expect(decoded).toBe(payload)
    expect(validateSyncInvitePayload(decoded, NOW)).toEqual(createInvite())
  })

  it('uses the same scannable payload in the browser data URL generator', async () => {
    const payload = JSON.stringify(createInvite())
    const dataUrl = await generateSyncInviteQrDataUrl(payload)
    const png = Buffer.from(dataUrl.split(',')[1], 'base64')

    expect(dataUrl).toMatch(/^data:image\/png;base64,/)
    expect(decodePngQr(png)).toBe(payload)
  })

  it('exports a real invitation file that imports to the exact validated payload', async () => {
    const invite = createInvite()
    const payload = JSON.stringify(invite)
    const fileName = buildSyncInviteFileName(invite.folderLabel, invite.inviteId)
    const file = createSyncInviteFile(payload, fileName)
    const imported = await readFileText(file)

    expect(file.name).toBe('ElephantNote-Round-trip-vault-invite-0123456789abcdef.elephantnote-invite')
    expect(file.type).toBe(INVITE_MIME)
    expect(imported).toBe(payload)
    expect(validateSyncInvitePayload(imported, NOW)).toEqual(invite)
  })

  it('rejects expired, malformed and incomplete QR or file payloads', () => {
    const expired = { ...createInvite(), expiresAt: NOW }
    const incomplete = { ...createInvite() }
    delete incomplete.inviteToken

    expect(() => validateSyncInvitePayload('{broken', NOW)).toThrow('not valid JSON')
    expect(() => validateSyncInvitePayload(JSON.stringify(expired), NOW)).toThrow('expired')
    expect(() => validateSyncInvitePayload(JSON.stringify(incomplete), NOW)).toThrow('incomplete')
  })
})

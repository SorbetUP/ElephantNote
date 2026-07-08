import dgram from 'node:dgram'
import os from 'node:os'
import {
  LAN_DISCOVERY_GROUP,
  LAN_DISCOVERY_PORT,
  createPeerDescriptor,
  createPeerState,
  parsePeerDescriptor,
  serializePeerDescriptor
} from './lanPeerProtocol.js'

const DISCOVERY_TIMEOUT_MS = 1400

const localIpv4Addresses = () => Object.values(os.networkInterfaces())
  .flat()
  .filter((entry) => entry?.family === 'IPv4' && !entry.internal)
  .map((entry) => entry.address)

const closeSocket = (socket) => {
  try { socket.close() } catch {}
}

const createSocket = () => dgram.createSocket({ type: 'udp4', reuseAddr: true })

export const discoverLanPeers = ({
  self = {},
  timeoutMs = DISCOVERY_TIMEOUT_MS,
  port = LAN_DISCOVERY_PORT,
  group = LAN_DISCOVERY_GROUP
} = {}) => new Promise((resolve) => {
  const socket = createSocket()
  const peers = new Map()
  const selfId = String(self.deviceId || '').trim()
  const finish = () => {
    closeSocket(socket)
    resolve({
      ok: true,
      runtime: 'node-udp',
      group,
      port,
      peers: [...peers.values()]
    })
  }
  const timer = setTimeout(finish, Math.max(250, Number(timeoutMs) || DISCOVERY_TIMEOUT_MS))

  socket.on('message', (message, remote) => {
    try {
      const descriptor = parsePeerDescriptor(message.toString('utf8'))
      if (!descriptor.deviceId || descriptor.deviceId === selfId) return
      const host = descriptor.host || remote.address || ''
      peers.set(descriptor.deviceId, createPeerState({
        descriptor: { ...descriptor, host, address: host, endpoint: host },
        online: true
      }))
    } catch {
      // Ignore other multicast traffic on the same network.
    }
  })

  socket.on('error', () => {
    clearTimeout(timer)
    finish()
  })

  socket.bind(port, () => {
    try {
      socket.setBroadcast(true)
      socket.setMulticastTTL(2)
      socket.addMembership(group)
    } catch {}

    const hosts = localIpv4Addresses()
    const descriptor = serializePeerDescriptor({
      ...self,
      host: hosts[0] || '',
      port
    })
    socket.send(Buffer.from(descriptor), port, group, () => {})
  })
})

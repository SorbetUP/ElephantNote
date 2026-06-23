import { execFile } from 'child_process'
import { setTimeout as delay } from 'timers/promises'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const image = process.env.ELEPHANTNOTE_DOCKER_IMAGE || 'elephantnote-web-sync-pair-smoke'
const basePort = Number(process.env.PORT || 19787 + Math.floor(Math.random() * 1000))
const prefix = `elephantnote-sync-pair-${process.pid}-${Date.now()}`
const network = `${prefix}-net`
const remoteVolume = `${prefix}-remote`
const vaultA = `${prefix}-vault-a`
const vaultB = `${prefix}-vault-b`
const deviceA = `${prefix}-a`
const deviceB = `${prefix}-b`
const remotePath = '/git/elephantnote.git'

const resources = {
  containers: [deviceA, deviceB],
  volumes: [remoteVolume, vaultA, vaultB],
  network
}

const run = async(command, args, options = {}) => {
  try {
    const result = await execFileAsync(command, args, {
      maxBuffer: 1024 * 1024 * 20,
      ...options
    })
    return result.stdout
  } catch (error) {
    const details = [
      `${command} ${args.join(' ')} failed`,
      error.stdout ? `stdout:\n${error.stdout}` : '',
      error.stderr ? `stderr:\n${error.stderr}` : '',
      error.message || ''
    ].filter(Boolean).join('\n')
    throw new Error(details)
  }
}

const docker = (args, options) => run('docker', args, options)

const request = async(port, pathname, options = {}) => {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`${pathname} failed with HTTP ${response.status}: ${JSON.stringify(body)}`)
  return body
}

const waitForServer = async(port, label) => {
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    try {
      await request(port, '/api/sync/status')
      return
    } catch {
      await delay(500)
    }
  }
  throw new Error(`${label} did not become ready.`)
}

const startDevice = async(name, port, vaultVolume) => {
  await docker([
    'run',
    '--rm',
    '-d',
    '--name',
    name,
    '--network',
    network,
    '-p',
    `${port}:8787`,
    '-v',
    `${vaultVolume}:/data/vault`,
    '-v',
    `${remoteVolume}:/git`,
    image
  ])
}

const assertNoteListed = (notes, notePath, label) => {
  if (!notes.some((note) => note.path === notePath)) {
    throw new Error(`${label} did not list ${notePath}. Notes: ${JSON.stringify(notes)}`)
  }
}

const assertHistory = (status, operation, label) => {
  if (!status.history?.some((item) => item.operation === operation && item.status === 'done')) {
    throw new Error(`${label} expected completed ${operation}. History: ${JSON.stringify(status.history)}`)
  }
}

const assertClean = (status, label) => {
  if (status.queued !== 0) throw new Error(`${label} expected empty queue, got ${status.queued}.`)
  if (status.dirty) throw new Error(`${label} expected clean git tree.`)
  if (!status.deviceId || !status.folderId) throw new Error(`${label} expected sync identity fields.`)
}

const catFromContainer = async(container, absolutePath) => docker(['exec', container, 'cat', absolutePath])

try {
  await docker(['build', '-t', image, '.'])
  await docker(['network', 'create', network])
  for (const volume of resources.volumes) await docker(['volume', 'create', volume])
  await docker([
    'run',
    '--rm',
    '--name',
    `${prefix}-remote-init`,
    '-v',
    `${remoteVolume}:/git`,
    image,
    'sh',
    '-lc',
    `git init --bare ${remotePath}`
  ])

  await startDevice(deviceA, basePort, vaultA)
  await startDevice(deviceB, basePort + 1, vaultB)
  await waitForServer(basePort, 'device A')
  await waitForServer(basePort + 1, 'device B')

  await request(basePort, '/api/notes', {
    method: 'POST',
    body: { title: 'Two Device Sync A', body: 'Created on device A and expected on device B.' }
  })

  const pushedFromA = await request(basePort, '/api/sync/run', {
    method: 'POST',
    body: {
      init: { remote: remotePath },
      snapshot: { message: 'Device A sync snapshot' },
      push: {}
    }
  })
  assertClean(pushedFromA, 'device A push')
  assertHistory(pushedFromA, 'push', 'device A push')
  const branch = pushedFromA.branch || 'master'

  const pulledIntoB = await request(basePort + 1, '/api/sync/run', {
    method: 'POST',
    body: {
      init: { remote: remotePath, branch },
      pull: { branch }
    }
  })
  assertClean(pulledIntoB, 'device B pull')
  assertHistory(pulledIntoB, 'pull', 'device B pull')

  const notesOnB = await request(basePort + 1, '/api/notes')
  assertNoteListed(notesOnB, 'Two Device Sync A.md', 'device B')
  const contentOnB = await catFromContainer(deviceB, '/data/vault/Two Device Sync A.md')
  if (!contentOnB.includes('Created on device A and expected on device B.')) {
    throw new Error('Device B file content did not match the note created on device A.')
  }

  await request(basePort + 1, '/api/notes', {
    method: 'POST',
    body: { title: 'Two Device Sync B', body: 'Created on device B and expected on device A.' }
  })

  const pushedFromB = await request(basePort + 1, '/api/sync/run', {
    method: 'POST',
    body: {
      snapshot: { message: 'Device B sync snapshot' },
      push: { branch }
    }
  })
  assertClean(pushedFromB, 'device B push')
  assertHistory(pushedFromB, 'push', 'device B push')

  const pulledIntoA = await request(basePort, '/api/sync/run', {
    method: 'POST',
    body: {
      pull: { branch }
    }
  })
  assertClean(pulledIntoA, 'device A pull')
  assertHistory(pulledIntoA, 'pull', 'device A pull')

  const notesOnA = await request(basePort, '/api/notes')
  assertNoteListed(notesOnA, 'Two Device Sync B.md', 'device A')
  const contentOnA = await catFromContainer(deviceA, '/data/vault/Two Device Sync B.md')
  if (!contentOnA.includes('Created on device B and expected on device A.')) {
    throw new Error('Device A file content did not match the note created on device B.')
  }

  console.log(JSON.stringify({
    ok: true,
    image,
    branch,
    ports: { deviceA: basePort, deviceB: basePort + 1 },
    remotePath,
    checks: [
      'device A pushed a note to a shared bare git remote',
      'device B pulled and exposed the note through the API',
      'device B pushed a second note',
      'device A pulled and exposed the second note through the API'
    ]
  }, null, 2))
} finally {
  for (const container of resources.containers) await execFileAsync('docker', ['rm', '-f', container]).catch(() => {})
  await execFileAsync('docker', ['network', 'rm', resources.network]).catch(() => {})
  for (const volume of resources.volumes) await execFileAsync('docker', ['volume', 'rm', '-f', volume]).catch(() => {})
}

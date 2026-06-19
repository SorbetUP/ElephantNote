export const LLAMA_BACKEND_PRIORITY = Object.freeze([
  'cpu',
  'gpu',
  'mpu',
  'npu',
  'openvino'
])

const BACKEND_ALIASES = Object.freeze({
  wasm: 'cpu',
  webgpu: 'gpu',
  metal: 'mpu',
  mps: 'mpu',
  cuda: 'gpu',
  vulkan: 'gpu',
  sycl: 'gpu',
  opencl: 'gpu',
  hip: 'gpu',
  openvino: 'openvino',
  tpu: 'tpu'
})

export const normalizeLlamaBackend = (backend = '') => {
  const value = String(backend || '').trim().toLowerCase()
  if (!value) return ''
  return BACKEND_ALIASES[value] || value
}

export const normalizeLlamaBackendList = (backends = []) => {
  return [...new Set(backends.map(normalizeLlamaBackend).filter(Boolean))]
}

export const selectPreferredLlamaBackend = ({
  availableBackends = [],
  preferredOrder = LLAMA_BACKEND_PRIORITY
} = {}) => {
  const normalizedAvailable = new Set(normalizeLlamaBackendList(availableBackends))
  for (const backend of preferredOrder.map(normalizeLlamaBackend)) {
    if (normalizedAvailable.has(backend)) return backend
  }
  return ''
}

export const getMissingLlamaBackends = ({
  availableBackends = [],
  preferredOrder = LLAMA_BACKEND_PRIORITY
} = {}) => {
  const normalizedAvailable = new Set(normalizeLlamaBackendList(availableBackends))
  return preferredOrder
    .map(normalizeLlamaBackend)
    .filter((backend) => backend && !normalizedAvailable.has(backend))
}

export const deriveLlamaBackendsFromCapabilities = ({
  gpuTypes = [],
  hasOpenVino = false,
  hasNpu = false,
  runtime = 'node'
} = {}) => {
  const backends = new Set(['cpu'])
  const normalizedGpuTypes = normalizeLlamaBackendList(gpuTypes)
  for (const type of normalizedGpuTypes) {
    const backend = normalizeLlamaBackend(type)
    if (backend === 'cpu' || !backend) continue
    if (backend === 'openvino') {
      backends.add('openvino')
      continue
    }
    if (backend === 'mpu') {
      backends.add('mpu')
      continue
    }
    if (backend === 'gpu') {
      backends.add('gpu')
      continue
    }
  }

  if (runtime === 'browser' && globalThis.navigator?.gpu) {
    backends.add('gpu')
  }

  if (hasOpenVino) {
    backends.add('openvino')
    if (hasNpu) backends.add('npu')
  }

  return LLAMA_BACKEND_PRIORITY.filter((backend) => backends.has(backend))
}

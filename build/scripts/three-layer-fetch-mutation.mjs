const originalFetch = globalThis.fetch.bind(globalThis)

const parseBody = (body) => {
  if (typeof body !== 'string') return null
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

const mutationResponse = (mutation, result = { mutated: true, mutation }) => new Response(JSON.stringify({
  ok: true,
  requestId: `mutation-${mutation}`,
  result
}), {
  status: 200,
  headers: { 'content-type': 'application/json' }
})

globalThis.fetch = async(input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url
  const payload = parseBody(init?.body)
  const isCommand = String(url || '').endsWith('/v1/command')
  const mutation = process.env.ELEPHANT_LAYER_MUTATION

  if (
    mutation === 'backend-ignore-note-write' &&
    isCommand &&
    payload?.command === 'invokeTauri' &&
    payload?.args?.[0] === 'tauri_notes_write'
  ) {
    process.stderr.write('[three-layer-mutation] swallowed production tauri_notes_write\n')
    return mutationResponse(mutation, { ok: true, path: payload?.args?.[1]?.relativePath || null })
  }

  if (
    mutation === 'frontend-ignore-enter' &&
    isCommand &&
    payload?.command === 'press' &&
    payload?.args?.[1] === 'Enter'
  ) {
    process.stderr.write('[three-layer-mutation] swallowed frontend Enter input\n')
    return mutationResponse(mutation)
  }

  if (
    mutation === 'user-ignore-insert-text' &&
    isCommand &&
    payload?.command === 'insertText'
  ) {
    process.stderr.write('[three-layer-mutation] swallowed packaged user text input\n')
    return mutationResponse(mutation)
  }

  return originalFetch(input, init)
}

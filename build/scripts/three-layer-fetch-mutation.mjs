const originalFetch = globalThis.fetch.bind(globalThis)

const parseBody = (body) => {
  if (typeof body !== 'string') return null
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))

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

  const response = await originalFetch(input, init)

  // Selecting a vault acknowledges the backend command before the renderer has
  // necessarily completed its asynchronous project-tree activation. The normal
  // proof jobs get that settling time from their preceding build/startup work,
  // while the mutation verifier launches three exact AppImage instances back to
  // back. Keep the real setup command and UI path intact, but do not let the
  // verifier race openNote against the renderer's post-selection activation.
  if (mutation && isCommand && payload?.command === 'selectVault' && response.ok) {
    await sleep(5_000)
  }

  return response
}

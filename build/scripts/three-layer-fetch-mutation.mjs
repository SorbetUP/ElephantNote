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

const commandSucceeded = async(response) => {
  if (!response?.ok) return false
  try {
    const body = await response.clone().json()
    return body?.ok === true
  } catch {
    return false
  }
}

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

  let response = await originalFetch(input, init)

  // Vault selection returns after the backend accepts the path, while renderer
  // activation and project-tree hydration continue asynchronously. Mutation
  // verification starts exact AppImages back-to-back, so the fixture-only
  // openNote setup command can legitimately race that activation. Retry the
  // same authenticated setup command until the real renderer accepts it; the
  // user-facing scenarios and every mutation assertion remain unchanged.
  if (mutation && isCommand && payload?.command === 'openNote' && !(await commandSucceeded(response))) {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      await sleep(500)
      response = await originalFetch(input, init)
      if (await commandSucceeded(response)) break
    }
  }

  return response
}

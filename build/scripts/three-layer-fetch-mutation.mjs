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

const readCommandResult = async(endpoint, authorization, command, args = []) => {
  const response = await originalFetch(endpoint, {
    method: 'POST',
    headers: {
      authorization,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ command, args })
  })
  if (!response?.ok) return null
  try {
    const body = await response.json()
    return body?.ok === true ? body.result : null
  } catch {
    return null
  }
}

const noteIsActuallyOpen = async(url, init, expectedPath) => {
  const authorization = init?.headers?.authorization || init?.headers?.Authorization
  if (!authorization) return false
  const state = await readCommandResult(url, authorization, 'readState')
  const activePath = state?.activeFile?.path || state?.activeFile || state?.notePath || null
  const markdown = String(state?.markdown || '')
  const mirror = state?.rustMirror || state?.editorRuntime?.rustMirror || null
  const runtime = state?.editorRuntime || null
  return activePath === expectedPath &&
    markdown.length > 0 &&
    mirror?.active === true &&
    mirror?.phase === 'ready' &&
    !mirror?.error &&
    runtime?.active === true &&
    runtime?.contentEditableConnected === true
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

  // Vault selection returns when the backend accepts the path, while the real
  // renderer still hydrates its project tree asynchronously. The mutation
  // verifier launches the exact application repeatedly, which makes the fixture
  // setup openNote command more likely to hit that hydration window. Retry only
  // the same fixture activation. A late setup response is accepted exclusively
  // after the requested note, live contenteditable, and canonical Rust editor
  // are all demonstrably ready. This prevents a partially opened note from
  // failing before the deliberate mutation is exercised.
  if (mutation && isCommand && payload?.command === 'openNote' && !(await commandSucceeded(response))) {
    const expectedPath = payload?.args?.[0]
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      if (await noteIsActuallyOpen(url, init, expectedPath)) {
        process.stderr.write(`[three-layer-sensitivity] openNote reported late after real editor became ready ${expectedPath}\n`)
        return mutationResponse('observed-open-note', { path: expectedPath, observed: true })
      }
      await sleep(500)
      response = await originalFetch(input, init)
      if (await commandSucceeded(response)) break
    }
  }

  return response
}

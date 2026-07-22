const originalFetch = globalThis.fetch.bind(globalThis)

const parseBody = (body) => {
  if (typeof body !== 'string') return null
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

const mutationResponse = (mutation) => new Response(JSON.stringify({
  ok: true,
  result: {
    mutated: true,
    mutation
  }
}), {
  status: 200,
  headers: { 'content-type': 'application/json' }
})

globalThis.fetch = async(input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url
  const payload = parseBody(init?.body)
  const isCommand = String(url || '').endsWith('/v1/command')

  if (
    process.env.ELEPHANT_TRUST_MUTATION === 'ignore-enter' &&
    isCommand &&
    payload?.command === 'press' &&
    payload?.args?.[1] === 'Enter'
  ) {
    process.stderr.write('[markdown-trust-mutation] swallowed real Enter command\n')
    return mutationResponse('ignore-enter')
  }

  if (
    process.env.ELEPHANT_TRUST_MUTATION === 'ignore-save' &&
    isCommand &&
    payload?.command === 'save'
  ) {
    process.stderr.write('[markdown-trust-mutation] swallowed real save command\n')
    return mutationResponse('ignore-save')
  }

  return originalFetch(input, init)
}

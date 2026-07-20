const originalFetch = globalThis.fetch.bind(globalThis)

const parseBody = (body) => {
  if (typeof body !== 'string') return null
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

globalThis.fetch = async(input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url
  const payload = parseBody(init?.body)
  if (
    process.env.ELEPHANT_TRUST_MUTATION === 'ignore-enter' &&
    String(url || '').endsWith('/v1/command') &&
    payload?.command === 'press' &&
    payload?.args?.[1] === 'Enter'
  ) {
    process.stderr.write('[markdown-trust-mutation] swallowed real Enter command\n')
    return new Response(JSON.stringify({
      ok: true,
      result: {
        mutated: true,
        mutation: 'ignore-enter'
      }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  return originalFetch(input, init)
}

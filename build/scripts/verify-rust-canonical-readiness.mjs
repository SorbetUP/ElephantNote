#!/usr/bin/env node

import { createRustCanonicalReadiness } from '../../Elephant/frontend/src/renderer/src/muya/rustCanonicalReadiness.js'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const verifyBootstrapIsInert = async() => {
  let resets = 0
  let clipboardRefreshes = 0
  await createRustCanonicalReadiness({
    previousReady: null,
    reset: async() => { resets += 1 },
    refreshClipboard: async() => { clipboardRefreshes += 1 }
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert(resets === 0, `pre-session bootstrap scheduled ${resets} reset(s)`)
  assert(clipboardRefreshes === 0, `pre-session bootstrap scheduled ${clipboardRefreshes} clipboard refresh(es)`)
}

const verifyBarrierOrdering = async() => {
  const order = []
  let releaseReady
  const previousReady = new Promise((resolve) => { releaseReady = resolve })
  const ready = createRustCanonicalReadiness({
    previousReady,
    reset: async() => { order.push('reset') },
    refreshClipboard: async() => { order.push('clipboard') }
  })

  await Promise.resolve()
  assert(order.length === 0, `canonical reset overtook the session barrier: ${JSON.stringify(order)}`)
  order.push('session')
  releaseReady()
  await ready
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert(order.join(',') === 'session,reset,clipboard', `invalid canonical lifecycle order: ${JSON.stringify(order)}`)
}

const verifySingleWebKitRetry = async() => {
  let attempts = 0
  await createRustCanonicalReadiness({
    previousReady: Promise.resolve(),
    reset: async() => {
      attempts += 1
      if (attempts === 1) throw new Error('Rust Muya session is not initialized.')
    },
    refreshClipboard: async() => {}
  })
  assert(attempts === 2, `expected one WebKit lifecycle retry, got ${attempts} attempts`)
}

const verifyPersistentFailureRemainsVisible = async() => {
  let attempts = 0
  let failed = false
  try {
    await createRustCanonicalReadiness({
      previousReady: Promise.resolve(),
      reset: async() => {
        attempts += 1
        throw new Error('Rust Muya session is not initialized.')
      },
      refreshClipboard: async() => {}
    })
  } catch (error) {
    failed = error?.message === 'Rust Muya session is not initialized.'
  }
  assert(failed, 'persistent session initialization failure was swallowed')
  assert(attempts === 2, `persistent failure should stop after one retry, got ${attempts} attempts`)
}

const verifyClipboardCannotBlockMount = async() => {
  const reported = []
  await createRustCanonicalReadiness({
    previousReady: Promise.resolve(),
    reset: async() => {},
    refreshClipboard: async() => { throw new Error('clipboard unavailable') },
    reportClipboardError: (error) => reported.push(error.message)
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert(reported.length === 1 && reported[0] === 'clipboard unavailable', 'clipboard error was not isolated and reported')
}

await verifyBootstrapIsInert()
await verifyBarrierOrdering()
await verifySingleWebKitRetry()
await verifyPersistentFailureRemainsVisible()
await verifyClipboardCannotBlockMount()

console.log('[rust-canonical-readiness] bootstrap, session barrier, retry and clipboard isolation contracts pass')

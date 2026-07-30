const PATCH_FLAG = '__elephantAutomationCommandErrorObservabilityInstalled'
const EDITOR_INPUT_FLAG = '__elephantEditorInputDefaultsInstalled'

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const diagnosticError = (command, error) => {
  const originalMessage = error?.message || String(error)
  const originalStack = String(error?.stack || '')
  const message = `${command} failed: ${originalMessage}`
  const diagnostic = new Error(message)
  const diagnosticStack = String(diagnostic.stack || '')
  const preservedStack = originalStack && !originalStack.includes(originalMessage)
    ? `Original stack: ${originalStack}`
    : originalStack
  diagnostic.stack = `${diagnostic.name}: ${message}${preservedStack ? `\n${preservedStack}` : ''}${diagnosticStack ? `\nWrapper stack:\n${diagnosticStack}` : ''}`
  return diagnostic
}

const install = (target = globalThis) => {
  const api = target.__ELEPHANT_ACCEPTANCE_TEST__ || target.__ELEPHANT_AUTOMATION__
  if (!api || api[PATCH_FLAG] || !api[EDITOR_INPUT_FLAG] || typeof api.press !== 'function') return false

  const originalPress = api.press.bind(api)
  api.press = async(selector, key) => {
    try {
      return await originalPress(selector, key)
    } catch (error) {
      throw diagnosticError(`press(${JSON.stringify(key)})`, error)
    }
  }

  Object.defineProperty(api, PATCH_FLAG, { value: true, enumerable: false })
  console.info('[automation-api] installed command error observability')
  return true
}

const installWhenReady = async(target = globalThis) => {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (install(target)) return true
    await wait(20)
  }
  console.error('[automation-api] command error observability was not installed')
  return false
}

void installWhenReady()

export { install as installAutomationCommandErrorObservability }

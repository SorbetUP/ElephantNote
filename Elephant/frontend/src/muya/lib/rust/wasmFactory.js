let modulePromise = null

const loadBundle = async () => {
  if (!modulePromise) {
    modulePromise = import('muya-rust-wasm-bundle').then(async (module) => {
      await module.default()
      return module
    })
  }
  return modulePromise
}

export const createBundledMuyaRustEngine = async (markdown) => {
  const module = await loadBundle()
  return new module.MuyaEditor(String(markdown || ''))
}

let modulePromise = null

const loadBundle = async () => {
  if (!globalThis.__ELEPHANT_MUYA_WASM_BUNDLED__) {
    throw new Error(
      'Bundled Muya Rust support is not present. Use the experimental Rust editor build.'
    )
  }
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

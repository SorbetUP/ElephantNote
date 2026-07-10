import { describe, expect, it, vi } from 'vitest'
import {
  canonicalizeAndroidPrivateVaultPath,
  installTauriFileUtilsPathGuards,
  resolveTauriVaultPath
} from '@/platform/tauriFileUtilsPathGuards'

const CANONICAL_VAULT = '/data/user/0/com.elephantnote.app/vaults/Personal'
const ALIAS_VAULT = '/data/data/com.elephantnote.app/vaults/Personal'

const createTarget = () => {
  const writeFile = vi.fn(async () => undefined)
  const ensureDir = vi.fn(async () => undefined)
  const invoke = vi.fn(async (command) => {
    if (command === 'tauri_vaults_get') {
      return { activeVault: { path: CANONICAL_VAULT } }
    }
    return { ok: true }
  })
  return {
    target: {
      __TAURI__: { core: { invoke } },
      fileUtils: {
        writeFile,
        ensureDir,
        readFile: vi.fn(),
        stat: vi.fn(),
        outputFile: vi.fn(),
        copy: vi.fn(),
        copyFile: vi.fn(),
        move: vi.fn(),
        pathExistsSync: vi.fn(() => false),
        isSamePathSync: vi.fn(() => false),
        isChildOfDirectory: vi.fn(() => false),
        isFile: vi.fn(() => false),
        isDirectory: vi.fn(() => false)
      }
    },
    writeFile,
    ensureDir,
    invoke
  }
}

describe('Android private vault path aliases', () => {
  it('maps /data/data to the active /data/user/0 vault spelling', () => {
    expect(canonicalizeAndroidPrivateVaultPath(
      `${ALIAS_VAULT}/Untitled 3.md`,
      CANONICAL_VAULT
    )).toBe(`${CANONICAL_VAULT}/Untitled 3.md`)

    expect(canonicalizeAndroidPrivateVaultPath(
      `${ALIAS_VAULT}/.assets/excalidraw-1782487951450.png`,
      CANONICAL_VAULT
    )).toBe(`${CANONICAL_VAULT}/.assets/excalidraw-1782487951450.png`)
  })

  it('does not rewrite another Android package', () => {
    const outside = '/data/data/com.other.app/files/note.md'
    expect(canonicalizeAndroidPrivateVaultPath(outside, CANONICAL_VAULT)).toBe(outside)
  })

  it('resolves aliases using unfiltered Rust vault state', async () => {
    const { target, invoke } = createTarget()
    await expect(resolveTauriVaultPath(target, `${ALIAS_VAULT}/Daily/today.md`))
      .resolves.toBe(`${CANONICAL_VAULT}/Daily/today.md`)
    expect(invoke).toHaveBeenCalledWith('tauri_vaults_get')
  })

  it('routes note and hidden asset writes through the Rust-owned vault API', async () => {
    const { target, writeFile, ensureDir, invoke } = createTarget()
    expect(installTauriFileUtilsPathGuards(target)).toBe(true)

    await target.fileUtils.ensureDir(`${ALIAS_VAULT}/.assets`)
    await target.fileUtils.writeFile(`${ALIAS_VAULT}/Untitled 3.md`, '# Note')
    await target.fileUtils.writeFile(
      `${ALIAS_VAULT}/.assets/excalidraw-1782487951450.png`,
      new Blob(['image'], { type: 'image/png' })
    )

    expect(ensureDir).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
    expect(invoke).toHaveBeenCalledWith('tauri_vault_ensure_dir', {
      pathname: `${CANONICAL_VAULT}/.assets`
    })
    expect(invoke).toHaveBeenCalledWith('tauri_vault_write_binary', {
      pathname: `${CANONICAL_VAULT}/Untitled 3.md`,
      dataBase64: 'IyBOb3Rl'
    })
    expect(invoke).toHaveBeenCalledWith('tauri_vault_write_binary', {
      pathname: `${CANONICAL_VAULT}/.assets/excalidraw-1782487951450.png`,
      dataBase64: 'aW1hZ2U='
    })
  })
})

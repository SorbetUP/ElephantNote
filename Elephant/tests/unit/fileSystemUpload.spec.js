import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadImage } from '../../../src/renderer/src/util/fileSystem.js'

describe('file system uploads', () => {
  beforeEach(() => {
    window.electron = {
      shell: {
        exec: vi.fn()
      }
    }
    window.fileUtils = {
      isImageFile: vi.fn(() => true),
      stat: vi.fn(async() => ({ size: 1024 })),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      pathExistsSync: vi.fn(() => false),
      ensureDir: vi.fn(),
      copy: vi.fn(),
      move: vi.fn(),
      unlink: vi.fn()
    }
    window.path = path
    window.commandExists = {
      exists: vi.fn(() => false)
    }
  })

  it('uses the Tauri shell exec bridge for cliScript uploads', async() => {
    window.electron.shell.exec.mockResolvedValue({
      success: true,
      stdout: 'https://example.com/uploaded.png',
      stderr: '',
      status: 0
    })

    const result = await uploadImage(
      '/tmp/note.md',
      '/tmp/image.png',
      {
        currentUploader: 'cliScript',
        cliScript: 'pic-upload',
        githubToken: '',
        imageBed: { github: { owner: 'owner', repo: 'repo', branch: 'main' } }
      }
    )

    expect(result).toBe('https://example.com/uploaded.png')
    expect(window.electron.shell.exec).toHaveBeenCalledWith(
      'pic-upload',
      ['/tmp/image.png'],
      expect.objectContaining({ env: expect.objectContaining({ PATH: expect.any(String) }) })
    )
  })
})

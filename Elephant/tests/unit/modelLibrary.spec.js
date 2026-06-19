/* @vitest-environment node */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { ModelLibrary } from 'main_renderer/elephantnote/modelLibrary'

describe('ModelLibrary', () => {
  let tempDir = ''

  beforeEach(async() => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'elephant-model-library-'))
  })

  afterEach(async() => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('searches Hugging Face and returns normalized model info', async() => {
    const requests = []
    const responses = [
      {
        ok: true,
        status: 200,
        text: async() => JSON.stringify([
          {
            id: 'bartowski/SmolLM2-135M-Instruct-GGUF',
            likes: 42,
            downloads: 1337,
            pipeline_tag: 'text-generation',
            library_name: 'gguf',
            tags: ['gguf', 'llama'],
            siblings: [
              { rfilename: 'SmolLM2-135M-Instruct.Q4_K_M.gguf', size: 123456 }
            ]
          }
        ])
      },
      {
        ok: true,
        status: 200,
        text: async() => JSON.stringify({
          id: 'bartowski/SmolLM2-135M-Instruct-GGUF',
          likes: 42,
          downloads: 1337,
          pipeline_tag: 'text-generation',
          library_name: 'gguf',
          tags: ['gguf', 'llama'],
          siblings: [
            { rfilename: 'SmolLM2-135M-Instruct.Q4_K_M.gguf', size: 123456 }
          ]
        })
      }
    ]
    const library = new ModelLibrary({
      nodeRuntime: {
        modelDir: tempDir,
        listModels: async() => []
      },
      fetchImpl: async(url, options) => {
        requests.push({ url, options })
        return responses.shift()
      }
    })

    const result = await library.searchHuggingFaceModels({ query: 'SmolLM2', limit: 1 })
    const info = await library.getHuggingFaceModelInfo('bartowski/SmolLM2-135M-Instruct-GGUF')

    expect(requests[0].url).toContain('/api/models?')
    expect(info).toMatchObject({
      id: 'bartowski/SmolLM2-135M-Instruct-GGUF',
      repoId: 'bartowski/SmolLM2-135M-Instruct-GGUF',
      downloads: 1337,
      likes: 42
    })
    expect(result).toMatchObject({
      provider: 'huggingface',
      source: 'huggingface',
      query: 'SmolLM2',
      models: [
        {
          id: 'bartowski/SmolLM2-135M-Instruct-GGUF',
          repoId: 'bartowski/SmolLM2-135M-Instruct-GGUF',
          pipelineTag: 'text-generation',
          libraryName: 'gguf',
          downloads: 1337,
          likes: 42
        }
      ]
    })
  })

  it('caches Hugging Face search results locally', async() => {
    let fetchCount = 0
    const library = new ModelLibrary({
      nodeRuntime: {
        modelDir: tempDir,
        listModels: async() => []
      },
      fetchImpl: async() => {
        fetchCount += 1
        return {
          ok: true,
          status: 200,
          text: async() => JSON.stringify([
            {
              id: 'bartowski/SmolLM2-135M-Instruct-GGUF',
              downloads: 1337
            }
          ])
        }
      }
    })

    const first = await library.searchHuggingFaceModels({ query: 'SmolLM2', limit: 1 })
    const second = await library.searchHuggingFaceModels({ query: 'SmolLM2', limit: 1 })

    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(fetchCount).toBe(1)
  })

  it('downloads a Hugging Face model with the selected file name and writes a manifest', async() => {
    const downloadCalls = []
    const modelPath = path.join(tempDir, 'SmolLM2-135M-Instruct.Q4_K_M.gguf')
    const library = new ModelLibrary({
      nodeRuntime: {
        modelDir: tempDir,
        listModels: async() => []
      },
      fetchImpl: async() => ({
        ok: true,
        status: 200,
        text: async() => JSON.stringify({
          id: 'bartowski/SmolLM2-135M-Instruct-GGUF',
          siblings: [
            { rfilename: 'SmolLM2-135M-Instruct.Q4_K_M.gguf', size: 123456 }
          ]
        })
      })
    })

    library.nodeRuntime.downloadModel = async(model) => {
      downloadCalls.push(model)
      await fs.writeFile(modelPath, 'fake model contents')
      return {
        id: model.id,
        provider: 'node-llama-cpp',
        downloaded: true,
        modelPath
      }
    }

    const result = await library.downloadModel({
      provider: 'huggingface',
      repoId: 'bartowski/SmolLM2-135M-Instruct-GGUF',
      name: 'SmolLM2 135M Instruct',
      fileName: 'SmolLM2-135M-Instruct.Q4_K_M.gguf'
    })

    const manifest = JSON.parse(await fs.readFile(`${modelPath}.model.json`, 'utf8'))

    expect(downloadCalls[0]).toMatchObject({
      id: 'bartowski/SmolLM2-135M-Instruct-GGUF',
      uri: 'bartowski/SmolLM2-135M-Instruct-GGUF',
      fileName: 'SmolLM2-135M-Instruct.Q4_K_M.gguf'
    })
    expect(result).toMatchObject({
      downloaded: true,
      source: 'huggingface',
      repoId: 'bartowski/SmolLM2-135M-Instruct-GGUF',
      modelPath
    })
    expect(manifest).toMatchObject({
      source: 'huggingface',
      repoId: 'bartowski/SmolLM2-135M-Instruct-GGUF',
      fileName: 'SmolLM2-135M-Instruct.Q4_K_M.gguf',
      modelPath
    })
  })

  it('cancels an in-flight download by download id', async() => {
    const modelPath = path.join(tempDir, 'SmolLM2-135M-Instruct.Q4_K_M.gguf')
    let started = false
    let resolveStarted = () => {}
    const startedPromise = new Promise((resolve) => {
      resolveStarted = resolve
    })
    const library = new ModelLibrary({
      nodeRuntime: {
        modelDir: tempDir,
        listModels: async() => [],
        downloadModel: async(model, options = {}) => new Promise((resolve, reject) => {
          started = true
          resolveStarted()
          options.signal?.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
          setTimeout(() => {
            resolve({
              id: model.id,
              provider: 'node-llama-cpp',
              downloaded: true,
              modelPath
            })
          }, 1000)
        })
      },
      fetchImpl: async() => ({
        ok: true,
        status: 200,
        text: async() => JSON.stringify({
          id: 'bartowski/SmolLM2-135M-Instruct-GGUF',
          siblings: [
            { rfilename: 'SmolLM2-135M-Instruct.Q4_K_M.gguf', size: 123456 }
          ]
        })
      })
    })

    const pending = library.downloadModel({
      provider: 'huggingface',
      repoId: 'bartowski/SmolLM2-135M-Instruct-GGUF',
      name: 'SmolLM2 135M Instruct'
    }, { downloadId: 'download-1' })
    await startedPromise
    await library.cancelDownload({ downloadId: 'download-1' })

    await expect(pending).rejects.toThrow('aborted')
    expect(started).toBe(true)
  })

  it('activates, deactivates, and deletes a local model', async() => {
    const modelPath = path.join(tempDir, 'local.gguf')
    await fs.writeFile(modelPath, 'fake local model')
    const calls = []
    const library = new ModelLibrary({
      nodeRuntime: {
        modelDir: tempDir,
        listModels: async() => ([
          {
            id: 'local.gguf',
            name: 'local.gguf',
            model: 'local.gguf',
            provider: 'node-llama-cpp',
            path: modelPath
          }
        ]),
        loadModel: async(payload) => {
          calls.push({ type: 'loadModel', payload })
          return {
            mod: { name: 'fake-mod' },
            model: { dispose: async() => calls.push({ type: 'model.dispose' }) },
            modelPath
          }
        },
        unloadModel: async(value) => {
          calls.push({ type: 'unloadModel', value })
          return { unloaded: true, modelPath: value }
        }
      }
    })

    const activated = await library.activateModel({ id: 'local.gguf', path: modelPath, backend: 'cpu' })
    const active = await library.getActiveModel()
    const listed = await library.listLocalModels()
    const deactivated = await library.deactivateModel(modelPath)
    const deleted = await library.deleteModel({ path: modelPath })

    expect(activated).toMatchObject({
      active: true,
      modelPath,
      source: 'local'
    })
    expect(active).toMatchObject({
      modelPath
    })
    expect(listed.models[0]).toMatchObject({
      id: 'local.gguf',
      active: true,
      path: modelPath
    })
    expect(deactivated).toMatchObject({
      unloaded: true,
      modelPath
    })
    expect(deleted).toMatchObject({
      deleted: true,
      modelPath
    })
    expect(calls.some((call) => call.type === 'loadModel')).toBe(true)
    expect(calls.some((call) => call.type === 'unloadModel')).toBe(true)
    await expect(fs.stat(modelPath)).rejects.toThrow()
    await expect(fs.stat(`${modelPath}.model.json`)).rejects.toThrow()
    await expect(fs.stat(path.join(tempDir, 'model-index.json'))).resolves.toBeDefined()
  })
})

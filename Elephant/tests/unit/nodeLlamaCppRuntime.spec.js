/* @vitest-environment node */

import { describe, expect, it } from 'vitest'
import { NodeLlamaCppRuntime } from '../../back/app/runtime/nodeLlamaCppRuntime.js'

describe('NodeLlamaCppRuntime', () => {
  it('reports the available backends in priority order from module capabilities', async() => {
    const runtime = new NodeLlamaCppRuntime({
      moduleLoader: async() => ({
        getLlamaGpuTypes: async() => ['cuda', 'metal'],
        getModuleVersion: () => 'test-version',
        getLlama: async() => ({ gpu: 'cuda' })
      })
    })

    const status = await runtime.status()

    expect(status).toMatchObject({
      provider: 'node-llama-cpp',
      available: true,
      selectedBackend: 'cpu',
      supportedBackends: ['cpu', 'gpu', 'mpu']
    })
  })

  it('enables OpenVINO in the backend report when build options request it', async() => {
    const runtime = new NodeLlamaCppRuntime({
      llamaOptions: {
        cmakeOptions: {
          GGML_OPENVINO: 'ON'
        }
      },
      moduleLoader: async() => ({
        getLlamaGpuTypes: async() => [],
        getLlama: async() => ({ gpu: 'openvino' })
      })
    })

    const status = await runtime.status()

    expect(status).toMatchObject({
      selectedBackend: 'cpu',
      supportedBackends: ['cpu', 'openvino']
    })
  })

  it('reports NPU separately when OpenVINO is configured for NPU execution', async() => {
    const runtime = new NodeLlamaCppRuntime({
      llamaOptions: {
        openvinoDevice: 'NPU',
        cmakeOptions: {
          GGML_OPENVINO: 'ON',
          GGML_OPENVINO_DEVICE: 'NPU'
        }
      },
      moduleLoader: async() => ({
        getLlamaGpuTypes: async() => [],
        getLlama: async() => ({ gpu: 'openvino-npu' })
      })
    })

    const status = await runtime.status()

    expect(status).toMatchObject({
      selectedBackend: 'cpu',
      supportedBackends: ['cpu', 'npu', 'openvino']
    })
  })

  it('passes llama options through when loading a model', async() => {
    const calls = []
    const runtime = new NodeLlamaCppRuntime({
      llamaOptions: {
        build: 'auto',
        cmakeOptions: {
          GGML_OPENVINO: 'ON'
        }
      },
      moduleLoader: async() => ({
        getLlamaGpuTypes: async() => ['cuda'],
        getLlama: async(options) => {
          calls.push(options)
          return {
            loadModel: async(payload) => {
              calls.push(payload)
              return { id: 'loaded-model' }
            }
          }
        }
      })
    })

    runtime.resolveModel = async() => '/tmp/model.gguf'

    const result = await runtime.loadModel({
      id: 'model',
      path: '/tmp/model.gguf',
      backend: 'cpu'
    })

    expect(result).toMatchObject({
      modelPath: '/tmp/model.gguf'
    })
    expect(calls).toEqual([
      {
        build: 'auto',
        cmakeOptions: {
          GGML_OPENVINO: 'ON'
        }
      },
      {
        modelPath: '/tmp/model.gguf',
        gpuLayers: 0
      }
    ])
  })
})

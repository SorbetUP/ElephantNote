export class ModelRuntime {
  async listLocalModels() {
    return {
      provider: 'browser',
      available: true,
      raw: '',
      models: [],
      message: 'Browser models run in the Electron renderer with WebGPU/WebCPU. Main process model scanning is not used.'
    }
  }

  async downloadModel(model = {}) {
    if (!model?.id) throw new Error('Model id is required.')
    if (model.provider === 'browser' || model.provider === 'browser-webllm') {
      return {
        id: model.id,
        provider: model.provider,
        downloaded: false,
        message: 'Browser models are downloaded by the renderer when loaded. Use Settings > AI > Models.'
      }
    }
    return {
      id: model.id,
      provider: model.provider,
      downloaded: false,
      message: 'External model downloads are not managed by ElephantNote.'
    }
  }

  parseOllamaList() {
    return []
  }
}

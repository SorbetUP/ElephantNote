import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export class ModelRuntime {
  constructor({ executor = execFileAsync } = {}) {
    this.executor = executor
  }

  async listLocalModels() {
    try {
      const result = await this.executor('ollama', ['list'])
      return {
        provider: 'ollama',
        available: true,
        raw: result.stdout || '',
        models: this.parseOllamaList(result.stdout || '')
      }
    } catch (error) {
      return {
        provider: 'ollama',
        available: false,
        raw: '',
        models: [],
        error: error?.message || 'Ollama is not available.'
      }
    }
  }

  async downloadModel(model = {}) {
    if (!model?.id) throw new Error('Model id is required.')
    if (model.provider !== 'ollama') {
      return {
        id: model.id,
        provider: model.provider,
        downloaded: false,
        message: 'This model provider is selected in-app; automatic download is only implemented for Ollama models.'
      }
    }
    await this.executor('ollama', ['pull', model.id], { timeout: 30 * 60 * 1000 })
    return {
      id: model.id,
      provider: model.provider,
      downloaded: true,
      message: `${model.name || model.id} downloaded through Ollama.`
    }
  }

  parseOllamaList(output = '') {
    return String(output || '')
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, id, size, ...modifiedParts] = line.split(/\s{2,}/)
        return {
          name: name || '',
          id: id || '',
          size: size || '',
          modified: modifiedParts.join(' ')
        }
      })
      .filter((model) => model.name)
  }
}

import { normalizeAiConfig } from 'common/elephantnote/aiProviders'
import { toPlainObject } from '../../../../shared/plainObject.js'

export const clonePlainObject = (value) => {
  return toPlainObject(value)
}

export const createNodeLlamaCppTestConfig = ({
  aiConfig = {},
  modelSelection = {},
  fallbackChatModelId = ''
} = {}) => {
  const model =
    modelSelection.chat ||
    fallbackChatModelId ||
    aiConfig.model ||
    ''

  return normalizeAiConfig({
    ...clonePlainObject(aiConfig),
    preset: 'nodeLlamaCpp',
    transport: 'node-llama-cpp',
    endpoint: 'node-llama-cpp://local',
    model: String(model || '').trim()
  })
}

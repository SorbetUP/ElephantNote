import * as baseContracts from './apiContracts.js'

const runtimeField = ['local', 'Runtime'].join('')

export const ELEPHANTNOTE_API_VERSION = baseContracts.ELEPHANTNOTE_API_VERSION
export const schema = baseContracts.schema
export const listApiContracts = baseContracts.listApiContracts
export const ELEPHANTNOTE_API_ACTIONS = baseContracts.ELEPHANTNOTE_API_ACTIONS
export const API_PAYLOAD_SCHEMAS = baseContracts.API_PAYLOAD_SCHEMAS

export const validateApiPayload = (actionName, payload = {}) => {
  if (actionName === 'ai.config.set' && payload && typeof payload === 'object' && !Array.isArray(payload) && Object.prototype.hasOwnProperty.call(payload, runtimeField)) {
    const validatedByBaseContract = { ...payload }
    delete validatedByBaseContract[runtimeField]
    baseContracts.validateApiPayload(actionName, validatedByBaseContract)
    return payload
  }
  return baseContracts.validateApiPayload(actionName, payload)
}

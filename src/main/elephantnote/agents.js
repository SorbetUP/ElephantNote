import { ipcMain } from 'electron'

const agents = new Map()

const normalizeAgent = (agent = {}) => {
  const id = String(agent.id || '').trim()
  if (!id) throw new Error('Agent id is required.')
  return {
    id,
    name: String(agent.name || id),
    endpoint: String(agent.endpoint || ''),
    capabilities: Array.isArray(agent.capabilities)
      ? agent.capabilities.map((capability) => String(capability)).filter(Boolean)
      : []
  }
}

export const registerElephantNoteAgentIpc = () => {
  ipcMain.handle('en:agents:list', async() => listAgents())
  ipcMain.handle('en:agents:register', async(_event, payload) => {
    return registerAgent(payload)
  })
  ipcMain.handle('en:agents:unregister', async(_event, id) => {
    return unregisterAgent(id)
  })
  ipcMain.handle('en:agents:send', async(_event, payload = {}) => {
    return sendAgentMessage(payload)
  })
}

export const listAgents = () => [...agents.values()]

export const registerAgent = (payload) => {
  const agent = normalizeAgent(payload)
  agents.set(agent.id, agent)
  return agent
}

export const unregisterAgent = (id) => agents.delete(String(id || '').trim())

export const sendAgentMessage = (payload = {}) => {
  const id = String(payload.agentId || '').trim()
  const agent = agents.get(id)
  if (!agent) throw new Error('Unknown agent.')
  if (!agent.endpoint) throw new Error('Agent endpoint is not configured.')
  throw new Error('Agent transport is not configured for this local build.')
}

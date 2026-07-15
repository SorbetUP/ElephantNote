const DEFAULT_THRESHOLD = 0.72
const DEFAULT_PENDING_LIMIT = 100000

export const synchronizeKnowledgeEmbeddings = async ({
  knowledge,
  inference,
  threshold = DEFAULT_THRESHOLD,
  pendingLimit = DEFAULT_PENDING_LIMIT
} = {}) => {
  if (!knowledge?.pendingEmbeddings || !knowledge?.saveEmbeddings || !knowledge?.embeddingStatus) {
    return { available: false, reason: 'knowledge-embedding-api-unavailable' }
  }
  if (!inference?.embed || !inference?.status) {
    return { available: false, reason: 'ai-inference-unavailable' }
  }

  const inferenceStatus = await inference.status()
  const embeddingRoute = inferenceStatus?.embeddingRoute || {}
  const configuredProviders = Array.isArray(inferenceStatus?.configuredProviders)
    ? inferenceStatus.configuredProviders
    : []
  const providerId = String(embeddingRoute.providerId || embeddingRoute.provider || configuredProviders[0]?.id || '')
  const model = String(embeddingRoute.model || '')
  if (!providerId || !model) {
    return {
      available: false,
      reason: 'embedding-route-unconfigured',
      inferenceStatus
    }
  }

  const pending = await knowledge.pendingEmbeddings({
    modelId: model,
    limit: pendingLimit
  })
  const inputs = Array.isArray(pending) ? pending : []
  if (!inputs.length) {
    return {
      available: true,
      generated: 0,
      model,
      providerId,
      status: await knowledge.embeddingStatus()
    }
  }

  const rows = []
  const batchSize = 24
  for (let offset = 0; offset < inputs.length; offset += batchSize) {
    const batch = inputs.slice(offset, offset + batchSize)
    const embedded = await inference.embed(batch.map((input) => input.text), {
      providerId,
      model,
      batchSize
    })
    const vectors = Array.isArray(embedded?.vectors) ? embedded.vectors : []
    if (vectors.length !== batch.length) {
      throw new Error(`AI inference produced ${vectors.length} vectors for ${batch.length} Knowledge inputs.`)
    }
    for (let index = 0; index < batch.length; index += 1) {
      rows.push({ input: batch[index], vector: vectors[index] })
    }
  }

  const saved = await knowledge.saveEmbeddings({
    modelId: model,
    threshold,
    rows
  })
  return {
    available: true,
    generated: rows.length,
    written: Number(saved?.written || rows.length),
    model,
    providerId,
    status: saved?.status || await knowledge.embeddingStatus()
  }
}

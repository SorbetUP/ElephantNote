export const buildRagChatPrompt = ({
  message = '',
  citations = [],
  wikiContext = null
} = {}) => {
  const contextBlock = citations
    .map(
      (citation, index) =>
        `[${index + 1}] ${citation.title} (${citation.path})\n${citation.snippet}`
    )
    .join('\n\n')
  const wikiBlock = wikiContext
    ? [
        'Wiki context:',
        `- Source: ${wikiContext.source?.title || wikiContext.source?.path || 'unknown'}`,
        `- Graph: ${wikiContext.graphSummary?.nodes || 0} nodes, ${wikiContext.graphSummary?.semanticLinks || 0} semantic links, ${wikiContext.graphSummary?.clusters || 0} clusters`,
        wikiContext.cluster ? `- Cluster: ${wikiContext.cluster.label} (${wikiContext.cluster.nodeCount || 0} notes)` : '',
        wikiContext.relatedNodes?.length
          ? `- Related notes: ${wikiContext.relatedNodes.slice(0, 5).map((node, index) => `${index + 1}. ${node.title} [${node.linkType}]`).join('; ')}`
          : ''
      ].filter(Boolean).join('\n')
    : ''

  const sections = [
    `Question: ${message}`,
    'Local context:',
    contextBlock || 'No local notes matched.',
    wikiBlock ? `\n${wikiBlock}` : ''
  ].filter(Boolean)

  return {
    systemMessage: 'You are a private local notes assistant. Ground every factual claim in the provided citations and wiki context. Prefer the semantic graph over folder structure, and cite relevant sources with markers like [1].',
    prompt: sections.join('\n\n')
  }
}

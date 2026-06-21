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

  const hasLocalContext = citations.length > 0 || Boolean(wikiBlock)
  const sections = hasLocalContext
    ? [
        `Question: ${message}`,
        'Local context:',
        contextBlock || 'No direct note citation matched.',
        wikiBlock ? `\n${wikiBlock}` : ''
      ].filter(Boolean)
    : [
        `Question: ${message}`,
        'No local note citation matched this message. Answer normally as the ElephantNote chat assistant. Do not claim that a local note matched unless citations are provided.'
      ]

  return {
    systemMessage: hasLocalContext
      ? 'You are a private local notes assistant. Use the provided citations and wiki context for grounded factual claims. Cite relevant sources with markers like [1]. If the user asks for general help, you may also answer normally while keeping citations for note-derived claims.'
      : 'You are the ElephantNote chat assistant. No local note citation matched the user message, so answer normally without pretending to have local-note evidence.',
    prompt: sections.join('\n\n')
  }
}

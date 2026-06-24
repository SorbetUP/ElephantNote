const byCountDesc = (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))

const collectDocumentNodes = (documents = []) => {
  return documents.map((document) => ({
    id: document.relativePath,
    title: document.title,
    kind: 'note',
    relativePath: document.relativePath,
    summary: document.summary || document.plainText?.slice(0, 240) || '',
    sources: document.sources || [],
    tags: document.tags || [],
    chunkCount: Array.isArray(document.chunks) ? document.chunks.length : 0,
    sourceCount: Array.isArray(document.sources) ? document.sources.length : 0
  }))
}

const collectFolderNodes = (documents = []) => {
  const folders = new Map()
  for (const document of documents) {
    const folderPath = String(document.relativePath || '').includes('/')
      ? String(document.relativePath).split('/').slice(0, -1).join('/')
      : ''
    if (!folderPath) continue
    if (!folders.has(folderPath)) {
      folders.set(folderPath, {
        id: folderPath,
        title: folderPath.split('/').pop() || folderPath,
        kind: 'folder',
        relativePath: folderPath
      })
    }
  }
  return [...folders.values()]
}

const collectTagEdges = (documents = []) => {
  const byTag = new Map()
  for (const document of documents) {
    for (const tag of document.tags || []) {
      if (!tag) continue
      if (!byTag.has(tag)) byTag.set(tag, [])
      byTag.get(tag).push(document)
    }
  }
  const edges = []
  for (const [tag, taggedDocuments] of byTag.entries()) {
    if (taggedDocuments.length < 2) continue
    for (let index = 1; index < taggedDocuments.length; index += 1) {
      edges.push({
        id: `tag:${taggedDocuments[0].relativePath}->${taggedDocuments[index].relativePath}#${tag}`,
        source: taggedDocuments[0].relativePath,
        target: taggedDocuments[index].relativePath,
        type: 'tag',
        reason: `#${tag}`,
        weight: 0.58
      })
    }
  }
  return edges
}

const collectFolderEdges = (documents = []) => {
  const edges = []
  for (const document of documents) {
    const folderPath = String(document.relativePath || '').includes('/')
      ? String(document.relativePath).split('/').slice(0, -1).join('/')
      : ''
    if (!folderPath) continue
    edges.push({
      id: `folder:${folderPath}->${document.relativePath}`,
      source: folderPath,
      target: document.relativePath,
      type: 'folder',
      reason: 'folder',
      weight: 0.34
    })
  }
  return edges
}

export const createSemanticGraph = ({
  documents = [],
  semanticLinks = [],
  includeFolderEdges = true,
  includeTagEdges = true
} = {}) => {
  const documentNodes = collectDocumentNodes(documents)
  const folderNodes = collectFolderNodes(documents)
  const nodes = [...folderNodes, ...documentNodes]

  const edges = []
  if (includeFolderEdges) edges.push(...collectFolderEdges(documents))
  if (includeTagEdges) edges.push(...collectTagEdges(documents))
  for (const link of semanticLinks || []) {
    if (!link?.source || !link?.target) continue
    edges.push({
      id: link.id || `semantic:${link.source}->${link.target}`,
      source: link.source,
      target: link.target,
      type: 'semantic',
      reason: link.reason || 'embedding-similarity',
      weight: Number(link.score || 0)
    })
  }

  const byNode = new Map()
  for (const edge of edges) {
    if (!byNode.has(edge.source)) byNode.set(edge.source, [])
    if (!byNode.has(edge.target)) byNode.set(edge.target, [])
    byNode.get(edge.source).push(edge)
    byNode.get(edge.target).push(edge)
  }

  const clusters = []
  const byFolder = new Map()
  for (const node of documentNodes) {
    const folderPath = String(node.relativePath || '').includes('/')
      ? String(node.relativePath).split('/').slice(0, -1).join('/')
      : 'root'
    if (!byFolder.has(folderPath)) {
      byFolder.set(folderPath, {
        id: folderPath,
        label: folderPath === 'root' ? 'Root' : folderPath.split('/').pop() || folderPath,
        nodeCount: 0,
        paths: [],
        tags: new Map()
      })
    }
    const cluster = byFolder.get(folderPath)
    cluster.nodeCount += 1
    cluster.paths.push(node.relativePath)
    for (const tag of node.tags || []) {
      if (!tag) continue
      cluster.tags.set(tag, (cluster.tags.get(tag) || 0) + 1)
    }
  }
  for (const cluster of byFolder.values()) {
    clusters.push({
      id: cluster.id,
      label: cluster.label,
      nodeCount: cluster.nodeCount,
      paths: cluster.paths,
      tags: [...cluster.tags.entries()].sort(byCountDesc).slice(0, 8).map(([tag]) => tag)
    })
  }

  return {
    nodes,
    edges: edges.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id)),
    clusters: clusters.sort((a, b) => b.nodeCount - a.nodeCount || a.label.localeCompare(b.label))
  }
}

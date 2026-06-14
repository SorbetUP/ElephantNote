export const WORKSPACE_DIR = '.elephantnote'
export const WORKSPACE_FILE = 'workspace.json'
export const INDEX_FILE = 'index.json'
export const CALENDAR_FILE = 'calendar.json'
export const SOURCES_FILE = 'sources.json'
export const WIKI_FILE = 'wiki.json'

export const createId = (value) => {
  const id = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return id || 'vault'
}

export const getPathBasename = (value = '') => {
  const parts = String(value || '').replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.at(-1) || ''
}

export const stripMarkdownExtension = (value = '') =>
  String(value || '').replace(/\.md$/i, '')

export const createWorkspace = (vaultRoot) => {
  const vaultName = getPathBasename(vaultRoot) || 'Personal'
  return {
    version: 1,
    vaultName,
    sidebar: [
      {
        id: 'getting-started',
        title: 'Getting started',
        type: 'folder',
        path: 'Getting Started',
        collapsed: false,
        items: [
          {
            id: 'welcome',
            title: 'Welcome',
            type: 'note',
            path: 'Getting Started'
          }
        ]
      }
    ]
  }
}

export const createWelcomeMarkdown = (now = new Date()) => {
  const timestamp = now.toISOString()
  return `---
title: "Welcome"
type: "note"
tags: ["getting-started"]
createdAt: "${timestamp}"
updatedAt: "${timestamp}"
---

# Welcome to ElephantNote

Welcome to ElephantNote! This is your first local ElephantNote note.

## Getting started

- Create notes and organize your ideas.
- Use tags to connect related content.
- Everything is stored locally and privately.
- Powerful markdown support for writing anything.
`
}

export const normalizeRelativePath = (relativePath = '') => {
  if (typeof relativePath !== 'string') return ''
  const normalizedParts = []
  for (const part of relativePath.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') continue
    normalizedParts.push(part)
  }
  return normalizedParts.join('/')
}

export const isPathInsideRelativePath = (candidatePath, parentPath) => {
  const candidate = normalizeRelativePath(candidatePath)
  const parent = normalizeRelativePath(parentPath)
  return !!candidate && !!parent && (candidate === parent || candidate.startsWith(`${parent}/`))
}

export const isIgnoredVaultEntry = (name) => {
  return (
    name === WORKSPACE_DIR ||
    name === '.git' ||
    name === 'node_modules' ||
    name.startsWith('.') ||
    name.endsWith('~') ||
    name.endsWith('.tmp')
  )
}

export const parseMarkdownMeta = (markdown = '', fallbackName = 'Untitled') => {
  const meta = {}
  const frontmatterMatch = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (frontmatterMatch) {
    const lines = frontmatterMatch[1].split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const match = line.match(/^\s*([A-Za-z0-9_-]+):\s*(.*)$/)
      if (!match) continue
      const [, key, rawValue] = match
      const value = rawValue.trim()
      if (value.startsWith('[') && value.endsWith(']')) {
        meta[key] = splitInlineFrontmatterList(value.slice(1, -1))
          .map(normalizeFrontmatterListItem)
          .filter(Boolean)
      } else if (key === 'tags' && !value) {
        const tags = []
        for (let tagIndex = index + 1; tagIndex < lines.length; tagIndex += 1) {
          if (/^\s*[A-Za-z0-9_-]+:\s*/.test(lines[tagIndex])) break
          const tagMatch = lines[tagIndex].match(/^\s*-\s*(.+?)\s*$/)
          if (tagMatch) {
            tags.push(normalizeFrontmatterListItem(tagMatch[1]))
          }
        }
        meta[key] = tags.filter(Boolean)
      } else {
        meta[key] = value.replace(/^"|"$/g, '')
      }
    }
  }

  const body = frontmatterMatch ? markdown.slice(frontmatterMatch[0].length) : markdown
  const firstHeading = body.match(/^#\s+(.+)$/m)
  const title = meta.title || firstHeading?.[1] || stripMarkdownExtension(getPathBasename(fallbackName) || fallbackName)
  const excerpt = body
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_>#-]/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')

  const imageMatch = body.match(/!\[[^\]]*\]\(([^)]+)\)/)
  return {
    title,
    type: meta.type || 'note',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    createdAt: meta.createdAt || '',
    updatedAt: meta.updatedAt || '',
    excerpt,
    coverImage: imageMatch?.[1] || ''
  }
}

const normalizeFrontmatterListItem = (value = '') =>
  String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')

const splitInlineFrontmatterList = (value = '') => {
  const items = []
  let current = ''
  let quote = ''
  let escaped = false

  for (const char of String(value || '')) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      current += char
      escaped = true
      continue
    }
    if ((char === '"' || char === "'") && !quote) {
      quote = char
      current += char
      continue
    }
    if (char === quote) {
      quote = ''
      current += char
      continue
    }
    if (char === ',' && !quote) {
      items.push(current)
      current = ''
      continue
    }
    current += char
  }

  items.push(current)
  return items
}

export const nextAvailableName = (baseName, exists) => {
  if (!exists(baseName)) return baseName
  const extensionMatch = String(baseName || '').match(/(\.[^./\\]+)$/)
  const extension = extensionMatch?.[1] || ''
  const stem = extension ? baseName.slice(0, -extension.length) : baseName
  let index = 2
  while (exists(`${stem} ${index}${extension}`)) {
    index += 1
  }
  return `${stem} ${index}${extension}`
}

export const normalizeWorkspaceSidebar = (workspace = {}) => {
  const sidebar = []
  for (const item of workspace.sidebar || []) {
    if ((item.type === 'note' || item.type === 'folder') && item.path) {
      sidebar.push({
        ...item,
        id: item.id || createId(`${item.type}-${item.path}`),
        title: item.title || stripMarkdownExtension(getPathBasename(item.path)),
        path: normalizeRelativePath(item.path),
        collapsed: Boolean(item.collapsed)
      })
      continue
    }
    for (const child of item.items || []) {
      if (!child?.path) continue
      const type = child.type === 'note' ? 'note' : 'folder'
      sidebar.push({
        id: child.id || createId(`${type}-${child.path}`),
        title: child.title || stripMarkdownExtension(getPathBasename(child.path)),
        type,
        path: normalizeRelativePath(child.path),
        collapsed: false
      })
    }
  }
  return {
    ...workspace,
    sidebar
  }
}

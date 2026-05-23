import path from 'path'

export const WORKSPACE_DIR = '.elephantnote'
export const WORKSPACE_FILE = 'workspace.json'
export const INDEX_FILE = 'index.json'

export const createId = (value) => {
  const id = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return id || 'vault'
}

export const createWorkspace = (vaultRoot) => {
  const vaultName = path.basename(vaultRoot) || 'Personal'
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
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '')
  if (normalized === '.' || normalized === path.sep) return ''
  return normalized.replace(/^\/+|^\\+/, '')
}

export const resolveInsideVault = (vaultRoot, relativePath = '') => {
  const root = path.resolve(vaultRoot)
  const target = path.resolve(root, normalizeRelativePath(relativePath))
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path must stay inside the active vault.')
  }
  return target
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
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?/)
  if (frontmatterMatch) {
    const lines = frontmatterMatch[1].split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
      if (!match) continue
      const [, key, rawValue] = match
      const value = rawValue.trim()
      if (value.startsWith('[') && value.endsWith(']')) {
        meta[key] = value
          .slice(1, -1)
          .split(',')
          .map((item) => item.trim().replace(/^"|"$/g, ''))
          .filter(Boolean)
      } else if (key === 'tags' && !value) {
        const tags = []
        for (let tagIndex = index + 1; tagIndex < lines.length; tagIndex += 1) {
          if (/^[A-Za-z0-9_-]+:\s*/.test(lines[tagIndex])) break
          const tagMatch = lines[tagIndex].match(/^\s*-\s*(.+?)\s*$/)
          if (tagMatch) {
            tags.push(tagMatch[1].trim().replace(/^["']|["']$/g, '').replace(/^#+/, ''))
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
  const title = meta.title || firstHeading?.[1] || fallbackName.replace(/\.md$/i, '')
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

export const nextAvailableName = (baseName, exists) => {
  if (!exists(baseName)) return baseName
  const extension = path.extname(baseName)
  const stem = extension ? baseName.slice(0, -extension.length) : baseName
  let index = 2
  while (exists(`${stem} ${index}${extension}`)) {
    index += 1
  }
  return `${stem} ${index}${extension}`
}

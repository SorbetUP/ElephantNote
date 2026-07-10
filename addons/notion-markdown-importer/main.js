const INPUT_ROOT = 'Imports/Notion/'
const OUTPUT_ROOT = 'Imported/Notion/'
const REPORT_PATH = 'Reports/Notion Import.md'
const UUID_SUFFIX = /(?:\s+|-)[0-9a-f]{32}$/i

const withoutExtension = (value) => String(value || '').replace(/\.md$/i, '')
const normalizeSlashes = (value) => String(value || '').replace(/\\/g, '/')
const cleanSegment = (value) => {
  const cleaned = withoutExtension(value)
    .replace(UUID_SUFFIX, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
  return cleaned || 'Untitled'
}
const normalizeRelative = (value) => {
  const stack = []
  for (const part of normalizeSlashes(value).split('/')) {
    if (!part || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}
const sourceRelative = (path) => normalizeSlashes(path).startsWith(INPUT_ROOT)
  ? normalizeSlashes(path).slice(INPUT_ROOT.length)
  : normalizeSlashes(path)
const sourceKey = (path) => withoutExtension(normalizeRelative(sourceRelative(path))).toLocaleLowerCase()
const sourceDirectory = (path) => {
  const parts = normalizeRelative(sourceRelative(path)).split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
}
const titleFromContent = (fallback, content) => {
  const heading = String(content || '').split(/\r?\n/).find((line) => /^#\s+\S/.test(line.trim()))
  return heading ? heading.trim().replace(/^#\s+/, '') : fallback
}

const buildPlan = (entries) => {
  const used = new Set()
  const plan = []
  for (const entry of entries) {
    const relative = normalizeRelative(sourceRelative(entry.path))
    const parts = relative.split('/').filter(Boolean)
    const file = cleanSegment(parts.pop() || 'Untitled')
    const directories = parts.map(cleanSegment)
    const base = [...directories, file].join('/')
    let candidate = base
    let index = 2
    while (used.has(candidate.toLocaleLowerCase())) {
      candidate = `${base}-${index++}`
    }
    used.add(candidate.toLocaleLowerCase())
    plan.push({
      sourcePath: entry.path,
      sourceRelative: relative,
      outputPath: `${OUTPUT_ROOT}${candidate}.md`,
      outputKey: `${OUTPUT_ROOT}${candidate}`,
      title: file
    })
  }
  return plan
}

const buildLookup = (plan) => {
  const exact = new Map()
  const byBasename = new Map()
  for (const item of plan) {
    const key = sourceKey(item.sourcePath)
    exact.set(key, item)
    const base = key.split('/').pop()
    if (!byBasename.has(base)) byBasename.set(base, [])
    byBasename.get(base).push(item)
  }
  return { exact, byBasename }
}

const resolveLink = (rawTarget, sourcePath, lookup) => {
  let target = String(rawTarget || '').trim().replace(/^<|>$/g, '')
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) return null
  try { target = decodeURIComponent(target) } catch {}
  const hashIndex = target.indexOf('#')
  const anchor = hashIndex >= 0 ? target.slice(hashIndex) : ''
  target = hashIndex >= 0 ? target.slice(0, hashIndex) : target
  if (!/\.md$/i.test(target)) return null

  const relative = target.startsWith('/')
    ? normalizeRelative(target.slice(1))
    : normalizeRelative(`${sourceDirectory(sourcePath)}/${target}`)
  const key = withoutExtension(relative).toLocaleLowerCase()
  const direct = lookup.exact.get(key)
  if (direct) return { item: direct, anchor }
  const candidates = lookup.byBasename.get(key.split('/').pop()) || []
  if (candidates.length === 1) return { item: candidates[0], anchor }
  return { unresolved: true, target: rawTarget, ambiguous: candidates.length > 1 }
}

const rewriteLinks = (content, sourcePath, lookup, stats) => String(content || '').replace(
  /\[([^\]]+)\]\(([^)]+)\)/g,
  (original, label, rawTarget) => {
    const resolved = resolveLink(rawTarget, sourcePath, lookup)
    if (!resolved) return original
    if (resolved.unresolved) {
      stats.unresolved += 1
      if (resolved.ambiguous) stats.ambiguous += 1
      return original
    }
    stats.rewritten += 1
    const target = `${withoutExtension(resolved.item.outputPath)}${resolved.anchor || ''}`
    return `[[${target}|${String(label).replaceAll('|', '\\|')}]]`
  }
)

self.elephantAddon = {
  activate(api) {
    return api.commands.register({
      id: 'com.elephantnote.notion-markdown-importer.import',
      title: 'Import Notion Markdown export',
      description: `Import Markdown notes from ${INPUT_ROOT} into ${OUTPUT_ROOT}.`,
      async run() {
        const listed = await api.notes.list('Imports/Notion')
        const entries = (Array.isArray(listed) ? listed : []).slice(0, 1000)
        if (!entries.length) {
          throw new Error(`No Markdown notes found under ${INPUT_ROOT}`)
        }

        const plan = buildPlan(entries)
        const lookup = buildLookup(plan)
        const stats = { rewritten: 0, unresolved: 0, ambiguous: 0 }
        const imported = []

        for (const item of plan) {
          const source = await api.notes.read(item.sourcePath)
          let content = rewriteLinks(source.content, item.sourcePath, lookup, stats)
          if (!/^#\s+\S/m.test(content)) {
            content = `# ${item.title}\n\n${content}`
          }
          await api.notes.write(item.outputPath, content.endsWith('\n') ? content : `${content}\n`)
          imported.push({
            source: item.sourcePath,
            output: item.outputPath,
            title: titleFromContent(item.title, content)
          })
        }

        const generatedAt = new Date().toISOString()
        const report = [
          '---',
          'title: "Notion Import Report"',
          'type: "generated-report"',
          'tags: [notion, import]',
          `generatedAt: ${JSON.stringify(generatedAt)}`,
          '---',
          '',
          '# Notion Import Report',
          '',
          `Generated: ${generatedAt}`,
          '',
          '## Summary',
          '',
          `- Markdown notes imported: ${imported.length}`,
          `- Internal links rewritten: ${stats.rewritten}`,
          `- Unresolved links kept unchanged: ${stats.unresolved}`,
          `- Ambiguous links kept unchanged: ${stats.ambiguous}`,
          '- Attachments are not imported by API v1.',
          '',
          '## Imported notes',
          '',
          ...imported.map((item) => `- \`${item.source}\` → [[${withoutExtension(item.output)}|${String(item.title).replaceAll('|', '\\|')}]]`),
          ''
        ].join('\n')
        await api.notes.write(REPORT_PATH, report)
        return {
          path: REPORT_PATH,
          imported: imported.length,
          rewritten: stats.rewritten,
          unresolved: stats.unresolved,
          ambiguous: stats.ambiguous
        }
      }
    })
  }
}

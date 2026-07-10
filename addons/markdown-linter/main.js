const REPORT_PATH = 'Reports/Markdown Lint.md'

const analyze = (content) => {
  const text = String(content)
  const lines = text.split(/\r\n|\r|\n/)
  const trailingWhitespace = lines.filter((line) => /[ \t]+$/.test(line)).length
  const malformedHeadings = lines.filter((line) => /^#{1,6}[^#\s]/.test(line)).length
  const h1Count = lines.filter((line) => /^#\s+\S/.test(line)).length
  const excessiveBlankRuns = (text.match(/(?:\r?\n){4,}/g) || []).length
  const crlf = (text.match(/\r\n/g) || []).length
  const bareCr = (text.match(/\r(?!\n)/g) || []).length
  const lf = (text.match(/(?<!\r)\n/g) || []).length
  const mixedLineEndings = Number((crlf > 0 && lf > 0) || bareCr > 0)
  const missingFinalNewline = Number(text.length > 0 && !/(?:\r\n|\r|\n)$/.test(text))
  const issues = trailingWhitespace + malformedHeadings + Math.max(0, h1Count - 1) + excessiveBlankRuns + mixedLineEndings + missingFinalNewline
  return {
    issues,
    trailingWhitespace,
    malformedHeadings,
    extraH1: Math.max(0, h1Count - 1),
    excessiveBlankRuns,
    mixedLineEndings,
    missingFinalNewline
  }
}

const safeFix = (content) => {
  const original = String(content)
  let fixed = original.replace(/\r\n?/g, '\n')
  fixed = fixed.split('\n').map((line) => line.replace(/[ \t]+$/g, '')).join('\n')
  fixed = fixed.replace(/\n{4,}/g, '\n\n\n')
  if (fixed && !fixed.endsWith('\n')) fixed += '\n'
  return { content: fixed, changed: fixed !== original }
}

const noteLink = (path) => `[[${path.replace(/\.md$/i, '')}|${path.split('/').pop().replace(/\.md$/i, '')}]]`

const scan = async (api) => {
  const entries = (await api.notes.list('.')).filter((entry) => entry.path !== REPORT_PATH)
  const rows = []
  let failed = 0
  for (const entry of entries) {
    try {
      const note = await api.notes.read(entry.path)
      rows.push({ path: entry.path, content: note.content, analysis: analyze(note.content) })
    } catch {
      failed += 1
    }
  }
  return { rows, failed }
}

const report = async (api, rows, failed, mode, changed = []) => {
  const affected = rows.filter((row) => row.analysis.issues > 0)
    .sort((left, right) => right.analysis.issues - left.analysis.issues || left.path.localeCompare(right.path))
  const totals = affected.reduce((sum, row) => {
    for (const key of ['trailingWhitespace', 'malformedHeadings', 'extraH1', 'excessiveBlankRuns', 'mixedLineEndings', 'missingFinalNewline']) {
      sum[key] += row.analysis[key]
    }
    return sum
  }, {
    trailingWhitespace: 0,
    malformedHeadings: 0,
    extraH1: 0,
    excessiveBlankRuns: 0,
    mixedLineEndings: 0,
    missingFinalNewline: 0
  })
  const generatedAt = new Date().toISOString()
  const lines = [
    '---',
    'title: "Markdown Lint"',
    'type: "generated-report"',
    `generatedAt: ${JSON.stringify(generatedAt)}`,
    `mode: ${JSON.stringify(mode)}`,
    '---',
    '',
    '# Markdown Lint',
    '',
    `- Mode: ${mode}`,
    `- Notes analyzed: ${rows.length}`,
    `- Notes with issues before this run: ${affected.length}`,
    `- Notes changed by safe fixes: ${changed.length}`,
    `- Notes that could not be read: ${failed}`,
    '',
    '## Issue totals',
    '',
    `- Trailing whitespace lines: ${totals.trailingWhitespace}`,
    `- Malformed headings without a space: ${totals.malformedHeadings}`,
    `- Extra level-one headings: ${totals.extraH1}`,
    `- Excessive blank-line runs: ${totals.excessiveBlankRuns}`,
    `- Mixed line endings: ${totals.mixedLineEndings}`,
    `- Missing final newline: ${totals.missingFinalNewline}`,
    '',
    '## Notes to review',
    ''
  ]

  for (const row of affected) {
    const a = row.analysis
    lines.push(`- ${noteLink(row.path)} — ${a.issues} issue${a.issues === 1 ? '' : 's'}`)
    if (a.malformedHeadings) lines.push(`  - ${a.malformedHeadings} malformed heading${a.malformedHeadings === 1 ? '' : 's'}; not auto-fixed`)
    if (a.extraH1) lines.push(`  - ${a.extraH1} extra H1 heading${a.extraH1 === 1 ? '' : 's'}; not auto-fixed`)
  }
  if (!affected.length) lines.push('_No issues found._')

  lines.push('', '## Applied safe fixes', '')
  if (changed.length) for (const path of changed.sort()) lines.push(`- ${noteLink(path)}`)
  else lines.push('_No files changed._')
  lines.push('', '> Safe fixes only normalize line endings, remove trailing spaces, collapse very large blank runs, and add a final newline. Heading structure is never changed automatically.', '')

  await api.notes.write(REPORT_PATH, lines.join('\n'))
  return { path: REPORT_PATH, analyzed: rows.length, affected: affected.length, changed: changed.length, failed }
}

self.elephantAddon = {
  activate(api) {
    const disposeAudit = api.commands.register({
      id: 'com.elephantnote.markdown-linter.audit',
      title: 'Audit Markdown formatting',
      description: 'Write a report without modifying source notes.',
      async run() {
        const { rows, failed } = await scan(api)
        return report(api, rows, failed, 'audit')
      }
    })

    const disposeApply = api.commands.register({
      id: 'com.elephantnote.markdown-linter.apply-safe-fixes',
      title: 'Apply safe Markdown fixes',
      description: 'Explicitly apply conservative whitespace and line-ending fixes, then write a report.',
      async run() {
        const { rows, failed } = await scan(api)
        const changed = []
        for (const row of rows) {
          const fixed = safeFix(row.content)
          if (!fixed.changed) continue
          await api.notes.write(row.path, fixed.content)
          changed.push(row.path)
        }
        return report(api, rows, failed, 'apply-safe-fixes', changed)
      }
    })

    return () => {
      disposeAudit()
      disposeApply()
    }
  }
}

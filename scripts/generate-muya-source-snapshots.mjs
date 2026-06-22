import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const parityDir = path.join(root, 'elephant_tauri', 'parity')
const casesPath = path.join(parityDir, 'muya_deterministic_cases.json')
const outPath = path.join(parityDir, 'muya_source_snapshots.json')

const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'))

const readCase = (name) => cases.find((item) => item.name === name)

const snapshot = []

const richFrontmatter = readCase('rich-frontmatter')
if (richFrontmatter) {
  snapshot.push({
    name: 'rich-frontmatter',
    source: 'electron-muya-contract',
    expect: {
      frontmatter: {
        title: 'Demo',
        draft: false,
        score: 12,
        ratio: 1.5,
        tags: ['alpha', 'beta'],
        author: { name: 'Noam', role: 'engineer' }
      }
    }
  })
}

const footnotes = readCase('footnotes')
if (footnotes) {
  snapshot.push({
    name: 'footnotes',
    source: 'electron-muya-contract',
    expect: {
      footnotes: {
        definitionLabels: ['a'],
        referenceLabels: ['a'],
        htmlFragments: ['footnotes', 'Footnote text']
      }
    }
  })
}

const math = readCase('katex-like-math')
if (math) {
  snapshot.push({
    name: 'katex-like-math',
    source: 'electron-katex-contract',
    expect: {
      math: {
        inlineCount: 1,
        blockCount: 1,
        htmlFragments: ['math-inline', 'katex', 'math-block', 'katex-display', 'data-latex']
      }
    }
  })
}

const diagram = readCase('diagram-contract')
if (diagram) {
  snapshot.push({
    name: 'diagram-contract',
    source: 'electron-diagram-contract',
    expect: {
      diagrams: {
        count: 1,
        languages: ['mermaid'],
        htmlFragments: ['diagram-block', 'diagram-mermaid', 'data-diagram-language']
      }
    }
  })
}

const inlineMarks = readCase('nested-inline-marks')
if (inlineMarks) {
  snapshot.push({
    name: 'nested-inline-marks',
    source: 'electron-muya-contract',
    expect: { inlineMarks: { nestedKinds: ['strong_emphasis', 'strike_strong', 'link_code'] } }
  })
}

const table = readCase('table-alignment')
if (table) {
  snapshot.push({
    name: 'table-alignment',
    source: 'electron-muya-contract',
    expect: {
      tables: {
        count: 1,
        alignments: ['left', 'center', 'right'],
        columns: 3,
        rows: 1
      }
    }
  })
}

fs.writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`)
console.log(`Wrote ${snapshot.length} Muya source snapshots to ${path.relative(root, outPath)}`)
console.log('Next step: replace these contract adapters with calls into the real Electron/Muya renderer once the renderer harness is available.')

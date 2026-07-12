export const documentCases = [
  {
    name: 'empty-document',
    markdown: ''
  },
  {
    name: 'headings-and-paragraphs',
    markdown: '# Heading one\n\nParagraph with **bold**, *italic*, ~~strike~~ and `code`.\n\n## Heading two'
  },
  {
    name: 'nested-lists-and-tasks',
    markdown: '- parent\n  - child\n  - [x] finished\n  - [ ] pending\n\n1. first\n2. second'
  },
  {
    name: 'blockquote-and-breaks',
    markdown: '> quoted line\n>\n> second paragraph\n\nline with two spaces  \nnext line\n\n---'
  },
  {
    name: 'table-alignment',
    markdown: '| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |\n| d | e | f |'
  },
  {
    name: 'code-math-diagram',
    markdown: 'Inline $x + 1$ and `code`.\n\n```js\nconst value = 1\n```\n\n$$\ny = x^2\n$$\n\n```mermaid\ngraph TD;\nA-->B;\n```'
  },
  {
    name: 'links-images-footnotes',
    markdown: '[site](https://example.test "title") and ![alt](image.png) with a note[^a].\n\n[^a]: Footnote text'
  },
  {
    name: 'frontmatter-and-html',
    markdown: '---\ntitle: Demo\ntags:\n  - alpha\n  - beta\n---\n\n<div>html block</div>\n\n# Body'
  }
]

export const operationCases = [
  {
    name: 'format-selected-text',
    markdown: 'Alpha beta gamma',
    actions: [
      { type: 'cursor', anchor: { line: 0, ch: 6 }, focus: { line: 0, ch: 10 } },
      { type: 'call', method: 'format', args: ['strong'] }
    ]
  },
  {
    name: 'change-paragraph-type',
    markdown: 'Alpha\n\nBeta',
    actions: [
      { type: 'cursor', anchor: { line: 0, ch: 2 }, focus: { line: 0, ch: 2 } },
      { type: 'call', method: 'updateParagraph', args: ['h2'] }
    ]
  },
  {
    name: 'insert-duplicate-delete-paragraph',
    markdown: 'First\n\nSecond',
    actions: [
      { type: 'cursor', anchor: { line: 0, ch: 2 }, focus: { line: 0, ch: 2 } },
      { type: 'call', method: 'insertParagraph', args: ['after', 'Inserted', false] },
      { type: 'call', method: 'duplicate', args: [] },
      { type: 'call', method: 'deleteParagraph', args: [] }
    ]
  },
  {
    name: 'search-replace-navigation',
    markdown: 'alpha beta alpha\n\nalpha',
    actions: [
      { type: 'call', method: 'search', args: ['alpha', { selectHighlight: false }] },
      { type: 'call', method: 'find', args: ['next'] },
      { type: 'call', method: 'replace', args: ['omega', { selectHighlight: false }] }
    ]
  },
  {
    name: 'enter-and-backspace',
    markdown: '- item one\n- item two',
    actions: [
      { type: 'cursor', anchor: { line: 0, ch: 10 }, focus: { line: 0, ch: 10 } },
      { type: 'key', key: 'Enter', code: 'Enter' },
      { type: 'key', key: 'Backspace', code: 'Backspace' }
    ]
  },
  {
    name: 'tab-and-shift-tab',
    markdown: '- parent\n- child',
    actions: [
      { type: 'cursor', anchor: { line: 1, ch: 3 }, focus: { line: 1, ch: 3 } },
      { type: 'key', key: 'Tab', code: 'Tab' },
      { type: 'key', key: 'Tab', code: 'Tab', shiftKey: true }
    ]
  },
  {
    name: 'history-round-trip',
    markdown: 'Paragraph',
    actions: [
      { type: 'cursor', anchor: { line: 0, ch: 2 }, focus: { line: 0, ch: 2 } },
      { type: 'call', method: 'updateParagraph', args: ['h3'] },
      { type: 'call', method: 'undo', args: [] },
      { type: 'call', method: 'redo', args: [] }
    ]
  },
  {
    name: 'runtime-options',
    markdown: 'Text',
    actions: [
      { type: 'call', method: 'setTabSize', args: [2] },
      { type: 'call', method: 'setListIndentation', args: [4] },
      { type: 'call', method: 'setFocusMode', args: [true] },
      { type: 'call', method: 'setOptions', args: [{ spellcheckEnabled: true, hideQuickInsertHint: true }, false] }
    ]
  }
]

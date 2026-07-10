const TEMPLATE_ROOT = 'Templates'
const OUTPUT_ROOT = 'Generated'
const DEFAULT_TEMPLATE = 'Templates/Default.md'

const pad = (value, size = 2) => String(value).padStart(size, '0')
const slugify = (value) => String(value || 'untitled')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'untitled'

const valuesFor = (title, templatePath, now = new Date()) => ({
  title,
  slug: slugify(title),
  date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
  datetime: now.toISOString(),
  year: String(now.getFullYear()),
  month: pad(now.getMonth() + 1),
  day: pad(now.getDate()),
  template: templatePath.replace(/^Templates\//, '').replace(/\.md$/i, ''),
  uuid: globalThis.crypto?.randomUUID?.() || `${now.getTime()}-${Math.random().toString(16).slice(2)}`
})

const render = (source, values, extra = {}) => {
  const variables = { ...values, ...extra }
  return String(source).replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key) => {
    const value = variables[key]
    return value === undefined || value === null ? match : String(value)
  })
}

const defaultTemplate = () => [
  '---',
  'title: "{{title}}"',
  'created: "{{datetime}}"',
  'template: "{{template}}"',
  '---',
  '',
  '# {{title}}',
  '',
  'Created from `{{template}}` on {{date}} at {{time}}.',
  '',
  '## Notes',
  '',
  ''
].join('\n')

self.elephantAddon = {
  activate(api) {
    return api.commands.register({
      id: 'com.elephantnote.template-studio.create',
      title: 'Create note from template',
      description: 'Choose a Markdown template and expand date, title and custom variables into a new note.',
      async run(input = {}) {
        let entries = await api.notes.list(TEMPLATE_ROOT)
        let templateCreated = false
        if (!entries.length) {
          await api.notes.write(DEFAULT_TEMPLATE, defaultTemplate())
          entries = [{ path: DEFAULT_TEMPLATE, modifiedAt: Date.now(), size: defaultTemplate().length }]
          templateCreated = true
        }

        const requested = String(input.template || '').trim()
        const template = requested
          ? entries.find((entry) => entry.path === requested || entry.path === `${TEMPLATE_ROOT}/${requested}`)
          : [...entries].sort((left, right) => left.path.localeCompare(right.path))[0]
        if (!template) throw new Error(`Template not found: ${requested}`)

        const source = await api.notes.read(template.path)
        const now = new Date()
        const fallbackTitle = `${template.path.split('/').pop().replace(/\.md$/i, '')} ${now.toISOString().slice(0, 10)}`
        const title = String(input.title || fallbackTitle).trim().slice(0, 160) || fallbackTitle
        const values = valuesFor(title, template.path, now)
        const content = render(source.content, values, input.variables && typeof input.variables === 'object' ? input.variables : {})
        const stamp = `${values.date}/${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${pad(now.getMilliseconds(), 3)}`
        const outputPath = `${OUTPUT_ROOT}/${stamp}-${values.slug}.md`

        await api.notes.write(outputPath, content.endsWith('\n') ? content : `${content}\n`)
        return {
          path: outputPath,
          template: template.path,
          templateCreated,
          unresolvedVariables: [...new Set(content.match(/\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/g) || [])]
        }
      }
    })
  }
}

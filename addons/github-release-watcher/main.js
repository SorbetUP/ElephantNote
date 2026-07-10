const CONFIG_PATH = 'GitHub Releases/config.json'
const DASHBOARD_PATH = 'GitHub Releases/Release Dashboard.md'
const DEFAULT_REPOSITORIES = ['tauri-apps/tauri', 'vuejs/core', 'rust-lang/rust']

const normalizeRepository = (value) => {
  const repository = String(value || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '')
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ? repository : ''
}

const readConfig = async (api) => {
  try {
    const note = await api.notes.read(CONFIG_PATH)
    const parsed = JSON.parse(note.content)
    const repositories = Array.isArray(parsed?.repositories)
      ? parsed.repositories.map(normalizeRepository).filter(Boolean)
      : []
    if (!repositories.length) throw new Error('No valid repositories configured')
    return { repositories: [...new Set(repositories)].slice(0, 25), created: false }
  } catch {
    const template = { version: 1, repositories: DEFAULT_REPOSITORIES }
    await api.notes.write(CONFIG_PATH, `${JSON.stringify(template, null, 2)}\n`)
    return { repositories: DEFAULT_REPOSITORIES, created: true }
  }
}

const fetchLatestRelease = async (api, repository) => {
  const response = await api.http.request({
    url: `https://api.github.com/repos/${repository}/releases/latest`,
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ElephantNote-Addon'
    }
  })
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`)
  const payload = JSON.parse(response.body)
  if (!payload?.tag_name) throw new Error('GitHub response did not contain a release tag')
  return {
    repository,
    tag: payload.tag_name,
    name: payload.name || payload.tag_name,
    url: payload.html_url || `https://github.com/${repository}/releases`,
    publishedAt: payload.published_at || payload.created_at || null,
    prerelease: payload.prerelease === true,
    draft: payload.draft === true,
    notes: String(payload.body || '').trim().slice(0, 1200)
  }
}

const safeFileName = (repository) => repository.replace('/', '__').replace(/[^A-Za-z0-9_.-]/g, '_')

self.elephantAddon = {
  activate(api) {
    return api.commands.register({
      id: 'com.elephantnote.github-release-watcher.refresh',
      title: 'Refresh GitHub releases',
      description: `Read ${CONFIG_PATH}, fetch the latest releases and update the dashboard.`,
      async run() {
        const config = await readConfig(api)
        const previous = await api.storage.get('latestByRepository') || {}
        const latestByRepository = { ...previous }
        const results = []

        for (const repository of config.repositories) {
          try {
            const release = await fetchLatestRelease(api, repository)
            const previousTag = previous[repository]?.tag || null
            release.isNew = Boolean(previousTag && previousTag !== release.tag)
            release.firstSeen = !previousTag
            latestByRepository[repository] = release
            results.push({ ok: true, ...release })

            const notePath = `GitHub Releases/${safeFileName(repository)}.md`
            const note = [
              '---',
              `title: ${JSON.stringify(`${repository} ${release.tag}`)}`,
              'type: "github-release"',
              'tags: [github, release]',
              `repository: ${JSON.stringify(repository)}`,
              `release: ${JSON.stringify(release.tag)}`,
              `publishedAt: ${JSON.stringify(release.publishedAt || '')}`,
              '---',
              '',
              `# ${repository} ${release.tag}`,
              '',
              `- **Name:** ${release.name}`,
              `- **Published:** ${release.publishedAt || 'Unknown'}`,
              `- **Status:** ${release.prerelease ? 'Prerelease' : 'Stable'}`,
              `- **URL:** ${release.url}`,
              '',
              '## Release notes',
              '',
              release.notes || '_No release notes provided._',
              ''
            ].join('\n')
            await api.notes.write(notePath, note)
          } catch (error) {
            const cached = previous[repository]
            results.push({
              ok: false,
              repository,
              error: error.message || String(error),
              cached: cached || null
            })
          }
        }

        await api.storage.set('latestByRepository', latestByRepository)
        const generatedAt = new Date().toISOString()
        const lines = [
          '---',
          'title: "GitHub Release Dashboard"',
          'type: "generated-report"',
          'tags: [github, releases]',
          `generatedAt: ${JSON.stringify(generatedAt)}`,
          '---',
          '',
          '# GitHub Release Dashboard',
          '',
          `Generated: ${generatedAt}`,
          config.created ? `Configuration created: \`${CONFIG_PATH}\`` : `Configuration: \`${CONFIG_PATH}\``,
          '',
          '| Repository | Latest release | Published | Status |',
          '| --- | --- | --- | --- |'
        ]

        for (const result of results) {
          if (result.ok) {
            const state = result.isNew ? 'New release' : result.firstSeen ? 'First check' : 'Unchanged'
            lines.push(`| ${result.repository} | [${result.tag}](${result.url}) | ${result.publishedAt || 'Unknown'} | ${state} |`)
          } else if (result.cached) {
            lines.push(`| ${result.repository} | ${result.cached.tag} | ${result.cached.publishedAt || 'Unknown'} | Cached: ${result.error} |`)
          } else {
            lines.push(`| ${result.repository} | — | — | Error: ${result.error} |`)
          }
        }
        lines.push('')

        await api.notes.write(DASHBOARD_PATH, lines.join('\n'))
        return {
          path: DASHBOARD_PATH,
          configurationCreated: config.created,
          repositories: results.length,
          live: results.filter((result) => result.ok).length,
          cached: results.filter((result) => !result.ok && result.cached).length,
          errors: results.filter((result) => !result.ok && !result.cached).length,
          newReleases: results.filter((result) => result.ok && result.isNew).length
        }
      }
    })
  }
}

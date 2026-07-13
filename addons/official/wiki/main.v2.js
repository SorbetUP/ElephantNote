import ElephantWikiAddonBase from './main.js'

const ADDON_ID = 'elephant.wiki'
const PROVIDER_RESOURCE = 'wiki.provider'
const SEARCH_RESOURCE = 'search.provider'

const normalizeQuery = (value = '') => String(value || '').trim().toLowerCase()

export default class ElephantWikiAddon extends ElephantWikiAddonBase {
  invoke(command, payload = {}) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return invoke(command, payload)
  }

  async readNote(path) {
    const result = await this.invoke('tauri_addons_notes_read', {
      addonId: ADDON_ID,
      path
    })
    return String(result?.markdown || '')
  }

  async search(query, options = {}) {
    const normalized = normalizeQuery(query)
    if (!normalized) return []

    const searchProvider = this.api.resources.get(SEARCH_RESOURCE)
    if (searchProvider?.query) {
      const results = await searchProvider.query(query, {
        limit: Math.min(100, Math.max(1, Number(options.limit) || 20))
      })
      return results.map((result) => ({
        ...result,
        source: 'search.provider',
        wikiCandidate: !String(result.path || '').startsWith('Wiki/')
      }))
    }

    const records = await this.loadRecords()
    return records
      .filter((record) => [record.title, record.topic, record.summary]
        .some((value) => String(value || '').toLowerCase().includes(normalized)))
      .slice(0, Math.min(100, Math.max(1, Number(options.limit) || 20)))
      .map((record) => ({ ...record, source: 'wiki.records' }))
  }

  async status() {
    const records = await this.loadRecords()
    return {
      records: records.length,
      proposed: records.filter((record) => record.status === 'proposed').length,
      accepted: records.filter((record) => record.status === 'accepted').length,
      searchProvider: this.api.resources.has(SEARCH_RESOURCE),
      engine: 'package-owned-wiki'
    }
  }

  onload(api) {
    super.onload(api)
    api.resources.provide(PROVIDER_RESOURCE, Object.freeze({
      list: () => this.loadRecords(),
      generate: () => this.generateProposals(),
      accept: (id) => this.acceptRecord(id),
      dismiss: (id) => this.dismissRecord(id),
      search: (query, options) => this.search(query, options),
      status: () => this.status()
    }))
  }
}

<template>
  <div class="en-addon-packs-settings">
    <section class="en-settings-group en-addon-pack-create">
      <div class="en-settings-row en-settings-row-stacked">
        <div class="en-settings-row-copy">
          <strong>Create an addon pack</strong>
          <span>Capture installed addons, versions and enabled states in a portable .enaddonpack file.</span>
        </div>
        <div class="en-addon-pack-create-controls">
          <input v-model.trim="packName" class="en-compact-input" type="text" maxlength="80" placeholder="Pack name">
          <button class="en-primary-button" type="button" :disabled="busy || !packName" @click="createPack">
            <Plus aria-hidden="true" /> Create pack
          </button>
        </div>
      </div>
    </section>

    <section class="en-addon-pack-list-section">
      <header>
        <div>
          <h3>Addon packs</h3>
          <p>Apply a saved pack to install, update, enable and disable its addons.</p>
        </div>
        <button class="en-secondary-button" type="button" :disabled="busy" @click="loadPacks">
          <RefreshCw aria-hidden="true" /> Refresh
        </button>
      </header>

      <div class="en-settings-group en-addon-pack-list">
        <article v-for="pack in packs" :key="pack.path" class="en-addon-pack-row">
          <span class="en-addon-pack-icon"><Layers3 aria-hidden="true" /></span>
          <div class="en-addon-pack-copy">
            <div>
              <strong>{{ pack.name }}</strong>
              <small>{{ pack.addonCount }} addon{{ pack.addonCount === 1 ? '' : 's' }}</small>
              <span v-if="pack.protected" class="en-addon-pack-badge">Built in</span>
            </div>
            <p>{{ pack.description || pack.path }}</p>
            <code>{{ pack.path }}</code>
          </div>
          <div class="en-addon-pack-actions">
            <button class="en-primary-button" type="button" :disabled="busy" @click="applyPack(pack)">
              {{ pack.protected ? 'Install' : 'Apply' }}
            </button>
            <button v-if="!pack.protected && confirmDeletePath !== pack.path" class="en-danger-button" type="button" :disabled="busy" @click="confirmDeletePath = pack.path">Delete</button>
            <template v-else-if="!pack.protected">
              <button class="en-danger-button" type="button" :disabled="busy" @click="deletePack(pack)">Confirm</button>
              <button class="en-secondary-button" type="button" :disabled="busy" @click="confirmDeletePath = ''">Cancel</button>
            </template>
          </div>
        </article>
        <div v-if="loading" class="en-addon-pack-empty">Loading addon packs…</div>
        <div v-else-if="!packs.length" class="en-addon-pack-empty">No addon pack exists yet. Create one from the current setup.</div>
      </div>
    </section>

    <p v-if="message" class="en-addons-feedback" :class="{ error: messageIsError }">{{ message }}</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { Layers3, Plus, RefreshCw } from '@lucide/vue'
import { useAddonsStore } from '@/store/addons'
import { elephantnoteClient } from 'elephant-front/services/elephantnoteClient'

const PACK_DIRECTORY = '.elephantnote/addons/packs'
const DEFAULT_PACK_PATH = `${PACK_DIRECTORY}/default.enaddonpack`
const DEVELOP_PARITY_PACK_PATH = `${PACK_DIRECTORY}/develop-parity.enaddonpack`
const addonsStore = useAddonsStore()
const packs = ref([])
const packName = ref('My addon pack')
const loading = ref(false)
const busy = ref(false)
const message = ref('')
const messageIsError = ref(false)
const confirmDeletePath = ref('')

const showMessage = (text, error = false) => {
  message.value = text
  messageIsError.value = error
}

const normalizeEntries = (result) => Array.isArray(result) ? result : Array.isArray(result?.entries) ? result.entries : []
const packPath = (entry) => {
  const path = String(entry?.path || entry?.relativePath || '')
  if (!path) return ''
  return path.includes('/') ? path : `${PACK_DIRECTORY}/${path}`
}
const slugify = (value) => String(value || 'addon-pack')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48) || 'addon-pack'

const readPack = async (path) => {
  const note = await elephantnoteClient.notes.read(path)
  const raw = typeof note === 'string' ? note : note?.content
  const parsed = JSON.parse(String(raw || ''))
  if (parsed?.format !== 'elephantnote-addon-pack' || !Array.isArray(parsed.addons)) {
    throw new Error(`${path} is not an ElephantNote addon pack`)
  }
  return {
    path,
    name: String(parsed.name || path.split('/').pop()?.replace(/\.enaddonpack$/i, '') || 'Unnamed addon pack'),
    description: String(parsed.description || ''),
    addonCount: parsed.addons.length,
    createdAt: String(parsed.createdAt || ''),
    protected: parsed.protected === true || path === DEVELOP_PARITY_PACK_PATH
  }
}

const discoverPackPaths = async () => {
  try {
    const entries = normalizeEntries(await elephantnoteClient.directory.list(PACK_DIRECTORY))
    const paths = entries.map(packPath).filter((path) => path.toLowerCase().endsWith('.enaddonpack'))
    if (paths.length) return [...new Set(paths)]
  } catch {
    // The hidden pack directory may not exist yet. Known paths are checked below.
  }
  const paths = []
  for (const path of [DEVELOP_PARITY_PACK_PATH, DEFAULT_PACK_PATH]) {
    try {
      await elephantnoteClient.notes.read(path)
      paths.push(path)
    } catch {
      // Optional pack is absent.
    }
  }
  return paths
}

const loadPacks = async () => {
  loading.value = true
  try {
    await addonsStore.runAction('elephant.addon-packs.ensure-develop-parity')
    const paths = await discoverPackPaths()
    const results = await Promise.allSettled(paths.map(readPack))
    packs.value = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value)
      .sort((left, right) => Number(right.protected) - Number(left.protected) || right.createdAt.localeCompare(left.createdAt) || left.name.localeCompare(right.name))
    const invalidCount = results.filter((result) => result.status === 'rejected').length
    if (invalidCount) showMessage(`${invalidCount} invalid addon pack${invalidCount === 1 ? ' was' : 's were'} ignored.`, true)
  } catch (error) {
    packs.value = []
    showMessage(error instanceof Error ? error.message : String(error), true)
  } finally {
    loading.value = false
  }
}

const createPack = async () => {
  if (!packName.value || busy.value) return
  busy.value = true
  showMessage('')
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').replace('Z', '')
    const path = `${PACK_DIRECTORY}/${slugify(packName.value)}-${stamp}.enaddonpack`
    const result = await addonsStore.runAction('elephant.addon-packs.create', { path, name: packName.value })
    showMessage(`Created ${result?.path || path}.`)
    await loadPacks()
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), true)
  } finally {
    busy.value = false
  }
}

const applyPack = async (pack) => {
  if (!pack?.path || busy.value) return
  busy.value = true
  showMessage('')
  try {
    const result = await addonsStore.runAction('elephant.addon-packs.apply', { path: pack.path })
    showMessage(`Applied ${pack.name}: ${result?.applied || 0} addons processed.`)
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), true)
  } finally {
    busy.value = false
  }
}

const deletePack = async (pack) => {
  if (!pack?.path || pack.protected || busy.value) return
  busy.value = true
  try {
    await elephantnoteClient.entries.delete(pack.path)
    confirmDeletePath.value = ''
    showMessage(`Deleted ${pack.name}.`)
    await loadPacks()
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), true)
  } finally {
    busy.value = false
  }
}

onMounted(loadPacks)
</script>

<style scoped>
.en-addon-packs-settings { display: grid; gap: 16px; }
.en-addon-pack-create-controls { display: flex; align-items: center; gap: 8px; }
.en-addon-pack-create-controls input { min-width: 220px; flex: 1; }
.en-addon-pack-list-section { display: grid; gap: 8px; }
.en-addon-pack-list-section > header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 2px; }
.en-addon-pack-list-section h3, .en-addon-pack-list-section p { margin: 0; }
.en-addon-pack-list-section h3 { font-size: 13px; }
.en-addon-pack-list-section p { margin-top: 3px; color: var(--en-muted, #667085); font-size: 10.5px; }
.en-addon-pack-list { display: grid; }
.en-addon-pack-row { min-height: 78px; display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 13px 15px; }
.en-addon-pack-row + .en-addon-pack-row { border-top: 1px solid var(--en-border, #c5cfdd); }
.en-addon-pack-icon { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 9px; background: var(--en-soft, #e9eff7); color: var(--en-primary, #2563eb); }
.en-addon-pack-icon svg { width: 17px; height: 17px; }
.en-addon-pack-copy { min-width: 0; display: grid; gap: 3px; }
.en-addon-pack-copy > div { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.en-addon-pack-copy strong { font-size: 12.5px; }
.en-addon-pack-copy small, .en-addon-pack-copy p, .en-addon-pack-copy code { color: var(--en-muted, #667085); font-size: 10px; }
.en-addon-pack-copy p { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.en-addon-pack-copy code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.en-addon-pack-badge { padding: 2px 6px; border-radius: 999px; background: color-mix(in srgb, var(--en-primary, #2563eb) 14%, transparent); color: var(--en-primary, #2563eb); font-size: 9px; font-weight: 700; }
.en-addon-pack-actions { display: flex; align-items: center; gap: 6px; }
.en-addon-pack-empty { padding: 24px; color: var(--en-muted, #667085); font-size: 11.5px; text-align: center; }
@media (max-width: 720px) {
  .en-addon-pack-create-controls, .en-addon-pack-list-section > header { align-items: stretch; flex-direction: column; }
  .en-addon-pack-row { grid-template-columns: 36px minmax(0, 1fr); }
  .en-addon-pack-actions { grid-column: 2; flex-wrap: wrap; }
}
</style>

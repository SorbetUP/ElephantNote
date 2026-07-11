<template>
  <section class="en-settings-group">
    <div class="en-settings-row">
      <div class="en-settings-row-copy">
        <strong>Google Keep archive</strong>
        <span>Convert an exported archive into local Markdown notes.</span>
      </div>
      <button class="en-primary-button" type="button" :disabled="isImporting" @click="importGoogleKeep">
        <Download aria-hidden="true" />{{ isImporting ? 'Importing…' : 'Import Google Keep' }}
      </button>
    </div>

    <div class="en-form-grid">
      <label><span>Source URL</span><input v-model.trim="sourceUrl" type="url" placeholder="https://example.com/article"></label>
      <label><span>Destination folder</span><input v-model.trim="sourceDestination" type="text" placeholder="Sources"></label>
    </div>
    <div class="en-settings-inline-actions">
      <button type="button" :disabled="isImportingSource || !sourceUrl" @click="ingestSourceUrl">Import page</button>
      <button type="button" :disabled="isImportingSource || !sourceUrl" @click="importRssSource">Import RSS</button>
      <span>{{ sourceImportMessage || importMessage }}</span>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { Download } from '@lucide/vue'
import { elephantnoteClient } from 'elephant-front/services/elephantnoteClient'

const sourceUrl = ref('')
const sourceDestination = ref('Sources')
const sourceImportMessage = ref('')
const importMessage = ref('')
const isImporting = ref(false)
const isImportingSource = ref(false)

const importGoogleKeep = async () => {
  isImporting.value = true
  importMessage.value = ''
  try {
    const result = await elephantnoteClient.imports.googleKeep()
    importMessage.value = result?.canceled
      ? 'Import canceled.'
      : `Imported ${result.imported || 0} note${result.imported === 1 ? '' : 's'}.`
  } catch (error) {
    importMessage.value = error instanceof Error ? error.message : 'Import failed.'
  } finally {
    isImporting.value = false
  }
}

const ingestSourceUrl = async () => {
  isImportingSource.value = true
  sourceImportMessage.value = ''
  try {
    const result = await elephantnoteClient.sources.ingestUrl(sourceUrl.value, sourceDestination.value || 'Sources')
    sourceImportMessage.value = `Imported ${result.source?.title || 'source'}.`
  } catch (error) {
    sourceImportMessage.value = error instanceof Error ? error.message : 'Source import failed.'
  } finally {
    isImportingSource.value = false
  }
}

const importRssSource = async () => {
  isImportingSource.value = true
  sourceImportMessage.value = ''
  try {
    const result = await elephantnoteClient.sources.importRss(sourceUrl.value, sourceDestination.value || 'Sources')
    sourceImportMessage.value = `Imported ${result.imported || 0} feed item${result.imported === 1 ? '' : 's'}.`
  } catch (error) {
    sourceImportMessage.value = error instanceof Error ? error.message : 'RSS import failed.'
  } finally {
    isImportingSource.value = false
  }
}
</script>

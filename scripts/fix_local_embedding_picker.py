from pathlib import Path
import re

path = Path('Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue')
source = path.read_text()

model_pattern = re.compile(
    r'''          <label><span>Model</span><input\n'''
    r'''            v-model\.trim="form\.routes\.embedding\.model"\n'''
    r'''            type="text"\n'''
    r'''            placeholder="Embedding model id"\n'''
    r'''          ></label>'''
)
model_replacement = '''          <label>
            <span>Model</span>
            <div
              v-if="form.routes.embedding.source === 'app-local'"
              class="en-local-model-picker"
            >
              <select
                v-model="form.routes.embedding.model"
                :disabled="localModelsLoading"
              >
                <option value="">
                  {{ localEmbeddingModelPlaceholder }}
                </option>
                <option
                  v-for="model in localEmbeddingModels"
                  :key="resolveModelId(model)"
                  :value="resolveModelId(model)"
                >
                  {{ resolveModelName(model) }}
                </option>
              </select>
              <button
                class="secondary compact"
                type="button"
                :disabled="localModelsLoading"
                title="Refresh downloaded models"
                aria-label="Refresh downloaded models"
                @click="loadLocalModels"
              >
                <RotateCw
                  aria-hidden="true"
                  :class="{ spinning: localModelsLoading }"
                />
              </button>
            </div>
            <input
              v-else
              v-model.trim="form.routes.embedding.model"
              type="text"
              placeholder="Embedding model id"
            >
            <small v-if="form.routes.embedding.source === 'app-local'">
              {{ localEmbeddingModelHint }}
            </small>
          </label>'''
source, count = model_pattern.subn(model_replacement, source, count=1)
if count != 1:
    raise SystemExit('embedding model input block not found')

old_import = "import { resolveModelId, resolveModelName } from '../views/modelsViewHelpers'"
new_import = "import { getModelCapabilities, resolveModelId, resolveModelName } from '../views/modelsViewHelpers'"
if old_import not in source:
    raise SystemExit('modelsViewHelpers import not found')
source = source.replace(old_import, new_import, 1)

local_models_marker = "const localModels = ref([])\n"
if local_models_marker not in source:
    raise SystemExit('localModels ref marker not found')
source = source.replace(
    local_models_marker,
    "const localModels = ref([])\nconst localModelsLoading = ref(false)\nconst assignedEmbeddingModelId = ref('')\n",
    1,
)

selected_marker = "const selectedCodexModel = computed(() => codexModels.value.find((model) => (model.model || model.id) === form.value.routes.chat.model) || null)\n"
helpers = '''const selectedCodexModel = computed(() => codexModels.value.find((model) => (model.model || model.id) === form.value.routes.chat.model) || null)
const modelSupportsEmbedding = (model = {}) => getModelCapabilities(model)
  .some((capability) => String(capability).toLowerCase() === 'embedding')
const localEmbeddingModels = computed(() => {
  const current = String(form.value.routes.embedding.model || '').trim()
  const assigned = String(assignedEmbeddingModelId.value || '').trim()
  return localModels.value
    .filter((model) => {
      const id = resolveModelId(model)
      return Boolean(id) && (modelSupportsEmbedding(model) || id === current || id === assigned)
    })
    .sort((left, right) => resolveModelName(left).localeCompare(resolveModelName(right)))
})
const localEmbeddingModelPlaceholder = computed(() => {
  if (localModelsLoading.value) return 'Loading downloaded models…'
  return localEmbeddingModels.value.length
    ? 'Select a downloaded embedding model'
    : 'No downloaded embedding model'
})
const localEmbeddingModelHint = computed(() => {
  const count = localEmbeddingModels.value.length
  if (!count) return 'Download an embedding model from Models, then refresh this list.'
  return `${count} downloaded embedding model${count === 1 ? '' : 's'} available.`
})
'''
if selected_marker not in source:
    raise SystemExit('selectedCodexModel marker not found')
source = source.replace(selected_marker, helpers, 1)

loader_pattern = re.compile(
    r'''const loadLocalModels = async\(\) => \{.*?\n\}\nconst refreshCodex = async\(\) => \{''',
    re.S,
)
loader_replacement = '''const loadLocalModels = async() => {
  if (!form.value.localAi.enabled) {
    localModels.value = []
    assignedEmbeddingModelId.value = ''
    return
  }
  localModelsLoading.value = true
  try {
    const [result, selection] = await Promise.all([
      elephantnoteClient.models.listLocal?.() || elephantnoteClient.models.list?.(),
      elephantnoteClient.models.getSelection?.().catch(() => null)
    ])
    localModels.value = Array.isArray(result?.models) ? result.models.filter(Boolean) : []
    assignedEmbeddingModelId.value = String(selection?.embedding || '').trim()
    if (form.value.routes.embedding.source === 'app-local' && !form.value.routes.embedding.model) {
      const preferred = assignedEmbeddingModelId.value || resolveModelId(
        localModels.value.find(modelSupportsEmbedding)
      )
      if (preferred) form.value.routes.embedding.model = preferred
    }
  } catch (error) {
    log.warn('[ai-settings] local-models:failed', error)
  } finally {
    localModelsLoading.value = false
  }
}
const refreshCodex = async() => {'''
source, count = loader_pattern.subn(loader_replacement, source, count=1)
if count != 1:
    raise SystemExit('loadLocalModels block not found')

watch_pattern = re.compile(
    r'''watch\(\(\) => props\.initialPage, \(page\) => \{\n  if \(aiPages\.some\(\(item\) => item\.id === page\)\) activePage\.value = page\n\}\)'''
)
watch_replacement = '''watch(() => props.initialPage, (page) => {
  if (aiPages.some((item) => item.id === page)) activePage.value = page
})
watch(activePage, (page) => {
  if (page === 'embedding') void loadLocalModels()
})'''
source, count = watch_pattern.subn(watch_replacement, source, count=1)
if count != 1:
    raise SystemExit('initialPage watch block not found')

style_marker = '<style scoped>\n'
if style_marker not in source:
    raise SystemExit('style marker not found')
source = source.replace(
    style_marker,
    '''<style scoped>
.en-local-model-picker {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.en-local-model-picker button { min-width: 38px; padding-inline: 10px; }
.en-local-model-picker button svg { width: 16px; height: 16px; }
''',
    1,
)
path.write_text(source)

test_path = Path('tests/app/unit/aiEmbeddingModelPicker.spec.js')
test_path.write_text('''import fs from 'node:fs'\nimport path from 'node:path'\nimport { describe, expect, test } from 'vitest'\n\nconst source = fs.readFileSync(path.join(process.cwd(), 'Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue'), 'utf8')\n\ndescribe('local embedding model picker', () => {\n  test('lists downloaded embedding-capable models instead of requiring a raw id', () => {\n    expect(source).toContain('v-for=\\\"model in localEmbeddingModels\\\"')\n    expect(source).toContain('elephantnoteClient.models.listLocal?.()')\n    expect(source).toContain('elephantnoteClient.models.getSelection?.()')\n    expect(source).toContain('getModelCapabilities')\n    expect(source).toContain('Select a downloaded embedding model')\n  })\n\n  test('keeps manual model ids for external providers', () => {\n    expect(source).toMatch(/v-else[\\s\\S]*v-model\\.trim=\\\"form\\.routes\\.embedding\\.model\\\"/)\n  })\n})\n''')

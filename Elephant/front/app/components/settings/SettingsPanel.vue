<template>
  <div
    class="en-settings-backdrop"
    :class="[`en-theme-${themeMode}`, `en-theme-${themeClassId}`]"
    :style="settingsStyle"
    @click.self="$emit('close')"
  >
    <section class="en-settings-panel" :style="settingsStyle" aria-label="ElephantNote settings">
      <header class="en-settings-header">
        <div>
          <p>ElephantNote</p>
          <h2>Settings</h2>
        </div>
        <button class="en-settings-close" type="button" @click="$emit('close')">
          <X class="en-icon" />
        </button>
      </header>

      <div class="en-settings-grid">
        <aside class="en-settings-nav">
          <button
            v-for="item in sections"
            :key="item.id"
            type="button"
            :class="{ active: activeSection === item.id }"
            @click="activeSection = item.id"
          >
            {{ item.label }}
          </button>
        </aside>

        <div class="en-settings-content">
          <template v-if="activeSection === 'appearance'">
            <section class="en-settings-section">
              <div>
                <h3>Theme</h3>
                <p>{{ activeThemeLabel }}</p>
              </div>
              <button
                class="en-theme-switch"
                type="button"
                :class="{ dark: themeMode === 'dark' }"
                @click="emit('update-theme', oppositeTheme)"
              >
                <SunMedium class="en-theme-icon light" />
                <Moon class="en-theme-icon dark" />
                {{ themeMode === 'dark' ? 'Dark' : 'Light' }}
              </button>
            </section>

            <section class="en-settings-section stacked">
              <div>
                <h3>Graphic themes</h3>
                <p>Choose a visual family. Each family keeps matching light and dark variants.</p>
              </div>
              <div class="en-theme-grid">
                <button
                  v-for="family in themeFamilies"
                  :key="family.id"
                  type="button"
                  class="en-theme-card"
                  :class="{ active: activeThemeFamily.id === family.id }"
                  @click="emit('update-theme', getThemeVariant(family.id, themeMode))"
                >
                  <span class="en-theme-card-preview">
                    <i
                      v-for="swatch in family.swatches"
                      :key="swatch"
                      :style="{ backgroundColor: swatch }"
                    />
                  </span>
                  <span class="en-theme-card-copy">
                    <strong>{{ family.name }}</strong>
                    <small>{{ family.description }}</small>
                  </span>
                </button>
              </div>
            </section>

            <section class="en-settings-section">
              <div>
                <h3>Sidebar width</h3>
                <p>The navigation rail can also be resized by dragging its right edge.</p>
              </div>
              <label class="en-settings-range">
                <input
                  type="range"
                  min="184"
                  max="320"
                  :value="sidebarWidth"
                  @input="$emit('update-sidebar-width', Number($event.target.value))"
                />
                <output>{{ sidebarWidth }}px</output>
              </label>
            </section>
          </template>

          <template v-else-if="activeSection === 'vaults'">
            <section class="en-settings-section">
              <div>
                <h3>Active vault</h3>
                <p>The current vault path is shown here.</p>
              </div>
              <span class="en-settings-pill">{{ activeVaultName }}</span>
            </section>
            <section class="en-settings-section stacked">
              <div>
                <h3>Open vaults</h3>
                <p v-for="vault in vaults" :key="vault.id" class="en-settings-path">
                  {{ vault.name }} · {{ vault.path }}
                </p>
              </div>
            </section>
          </template>

          <template v-else-if="activeSection === 'editor'">
            <section class="en-settings-section">
              <div>
                <h3>Editor footer</h3>
                <p>Show the bottom bar with word count, typography controls, and theme shortcut.</p>
              </div>
              <button
                class="en-settings-toggle-pill"
                type="button"
                :class="{ active: preferences.showEditorFooter }"
                @click="setShowEditorFooter(!preferences.showEditorFooter)"
              >
                {{ preferences.showEditorFooter ? 'Visible' : 'Hidden' }}
              </button>
            </section>
            <section class="en-settings-section">
              <div>
                <h3>Tag prefix</h3>
                <p>Show or hide the # prefix before tag names in the note editor.</p>
              </div>
              <button
                class="en-settings-toggle-pill"
                type="button"
                :class="{ active: preferences.showTagHashInEditor }"
                @click="setShowTagHashInEditor(!preferences.showTagHashInEditor)"
              >
                {{ preferences.showTagHashInEditor ? 'Show #' : 'Hide #' }}
              </button>
            </section>
            <section class="en-settings-section stacked">
              <div>
                <h3>Autosave</h3>
                <p>Changes are written automatically after a short delay.</p>
              </div>
              <label class="en-settings-range">
                <input
                  type="range"
                  min="250"
                  max="5000"
                  step="250"
                  :value="preferences.autoSaveDelay"
                  @input="setAutoSaveDelay(Number($event.target.value))"
                />
                <output>{{ preferences.autoSaveDelay }} ms</output>
              </label>
            </section>
          </template>

          <template v-else-if="activeSection === 'import'">
            <section class="en-settings-section">
              <div>
                <h3>Import notes</h3>
                <p>Bring notes from a Google Keep export into the active vault.</p>
              </div>
              <button type="button" :disabled="isImporting" @click="importGoogleKeep">
                <Download class="en-icon" />
                {{ isImporting ? 'Importing...' : 'Import Google Keep' }}
              </button>
            </section>
            <section class="en-settings-section stacked">
              <div>
                <h3>Sources</h3>
                <p>Ingest a web page or RSS feed into local markdown notes.</p>
              </div>
              <div class="en-form-grid">
                <label>
                  <span>URL</span>
                  <input
                    v-model.trim="sourceUrl"
                    type="text"
                    placeholder="https://example.com/article"
                  />
                </label>
                <label>
                  <span>Destination folder</span>
                  <input v-model.trim="sourceDestination" type="text" placeholder="Sources" />
                </label>
              </div>
              <div class="en-settings-actions-row">
                <button
                  type="button"
                  :disabled="isImportingSource || !sourceUrl"
                  @click="ingestSourceUrl"
                >
                  Import URL
                </button>
                <button
                  type="button"
                  :disabled="isImportingSource || !sourceUrl"
                  @click="importRssSource"
                >
                  Import RSS
                </button>
                <span class="en-settings-message">{{ sourceImportMessage || importMessage }}</span>
              </div>
            </section>
          </template>

          <template v-else-if="activeSection === 'sites'">
            <section class="en-settings-section stacked">
              <div>
                <h3>Generated sites</h3>
                <p>Manage the current folder website preview.</p>
              </div>
              <div class="en-settings-actions-row">
                <button
                  type="button"
                  :class="{ active: featureFlags.sitePreview }"
                  @click="toggleFeature('sitePreview')"
                >
                  {{ featureFlags.sitePreview ? 'Enabled' : 'Disabled' }}
                </button>
                <span class="en-settings-pill">{{ siteStatusLabel }}</span>
                <button
                  type="button"
                  :disabled="!sitePreviewStore.previewUrl"
                  @click="sitePreviewStore.openPreviewExternal"
                >
                  Open
                </button>
                <button type="button" :disabled="!sitePreviewStore.info" @click="stopSitePreview">
                  Stop
                </button>
              </div>
            </section>
          </template>

          <template v-else-if="activeSection === 'sync'">
            <section class="en-settings-section stacked">
              <div>
                <h3>Synchronization</h3>
                <p>
                  Pair devices with Syncthing over the local network. Git is only used locally to
                  order snapshots.
                </p>
              </div>

              <div class="en-sync-status-grid">
                <article class="en-sync-status-card" :class="{ ok: syncStatus.deviceId }">
                  <GitBranch class="en-icon" />
                  <div>
                    <strong>Local Git history</strong>
                    <span>{{ syncStatus.branch || 'No branch yet' }}</span>
                  </div>
                </article>
                <article
                  class="en-sync-status-card"
                  :class="{
                    ok: syncStatus.syncthing?.connected,
                    warn: syncStatus.syncthing?.configured && !syncStatus.syncthing?.connected
                  }"
                >
                  <Wifi class="en-icon" />
                  <div>
                    <strong>{{
                      syncStatus.syncthing?.connected ? 'Syncthing connected' : 'Syncthing offline'
                    }}</strong>
                    <span>{{
                      syncStatus.syncthing?.folderState ||
                      syncStatus.syncthing?.lastError ||
                      'Waiting for configuration'
                    }}</span>
                  </div>
                </article>
                <article
                  class="en-sync-status-card"
                  :class="{ warn: syncStatus.dirty || syncStatus.queued }"
                >
                  <RefreshCw class="en-icon" />
                  <div>
                    <strong>{{ syncStatus.dirty ? 'Local changes' : 'Vault clean' }}</strong>
                    <span>{{ syncStatus.queued || 0 }} queued · Git history local</span>
                  </div>
                </article>
              </div>

              <div class="en-form-grid">
                <label>
                  <span>Backend</span>
                  <select v-model="syncForm.backend">
                    <option value="git">Local Git only</option>
                    <option value="syncthing-git">Syncthing LAN + local Git</option>
                  </select>
                </label>
                <label>
                  <span>Branch</span>
                  <input v-model.trim="syncForm.branch" type="text" placeholder="main" />
                </label>
                <label>
                  <span>Peer device ID</span>
                  <input
                    v-model.trim="syncForm.peerDeviceId"
                    type="text"
                    placeholder="Syncthing device ID"
                  />
                </label>
                <label>
                  <span>Peer address / IP</span>
                  <input
                    v-model.trim="syncForm.peerAddress"
                    type="text"
                    placeholder="tcp://192.168.1.42:22000 or dynamic"
                  />
                </label>
                <label>
                  <span>Syncthing REST endpoint</span>
                  <input
                    v-model.trim="syncForm.syncthingEndpoint"
                    type="text"
                    placeholder="http://127.0.0.1:8384"
                  />
                </label>
                <label>
                  <span>Syncthing API key</span>
                  <input
                    v-model.trim="syncForm.syncthingApiKey"
                    type="password"
                    autocomplete="off"
                    placeholder="Optional"
                  />
                </label>
              </div>

              <div class="en-settings-actions-row">
                <button
                  type="button"
                  :class="{ active: featureFlags.gitSync }"
                  @click="toggleFeature('gitSync')"
                >
                  {{ featureFlags.gitSync ? 'Sync enabled' : 'Sync disabled' }}
                </button>
                <button type="button" :disabled="isSyncRunning" @click="configureSync">
                  <Server class="en-icon" />
                  {{ isSyncRunning ? 'Configuring...' : 'Configure' }}
                </button>
                <button type="button" :disabled="isSyncRunning" @click="runSync">
                  <RefreshCw class="en-icon" />
                  {{ isSyncRunning ? 'Synchronizing...' : 'Sync now' }}
                </button>
                <button type="button" :disabled="isSyncRunning" @click="loadSyncStatus">
                  Refresh status
                </button>
                <span class="en-settings-message">{{ syncMessage }}</span>
              </div>
            </section>

            <section class="en-settings-section stacked">
              <div>
                <h3>Connection details</h3>
                <p class="en-settings-path">Vault: {{ activeVaultPath || 'No active vault' }}</p>
                <p class="en-settings-path">
                  Device: {{ syncStatus.deviceId || 'Not initialized' }} · Folder:
                  {{ syncStatus.folderId || 'Not initialized' }}
                </p>
                <p class="en-settings-path">
                  Local Syncthing ID:
                  {{ syncStatus.syncthing?.localDeviceId || 'Start Syncthing to reveal it' }}
                </p>
                <p class="en-settings-path">Peer: {{ syncPeerLabel }}</p>
              </div>
              <div class="en-sync-history">
                <article
                  v-for="item in syncStatus.history || []"
                  :key="item.id"
                  :class="{ error: item.status === 'error' }"
                >
                  <strong>{{ item.operation }}</strong>
                  <span>{{ item.status }} · {{ formatSyncTime(item.updatedAt) }}</span>
                  <small v-if="item.error">{{ item.error }}</small>
                </article>
                <p v-if="!syncStatus.history?.length" class="en-settings-path">
                  No synchronization run has been recorded yet.
                </p>
              </div>
            </section>
          </template>

          <template v-else-if="activeSection === 'ai'">
            <section class="en-ai-shell">
              <header class="en-ai-header">
                <div>
                  <h3>AI model routing</h3>
                  <p>
                    Assign a dedicated GGUF model to embedding, chat, or OCR. Local chat and
                    embeddings use node-llama-cpp; OCR keeps its own target.
                  </p>
                </div>
              </header>

              <nav class="en-ai-tabs">
                <button
                  v-for="tab in aiTabs"
                  :key="tab.id"
                  type="button"
                  :class="{ active: activeAiTab === tab.id }"
                  @click="activeAiTab = tab.id"
                >
                  {{ tab.label }}
                </button>
              </nav>

              <section v-if="activeAiTab === 'setup'" class="en-settings-section stacked">
                <div>
                  <h3>Runtime</h3>
                  <p>{{ setupRuntimeMessage }}</p>
                </div>
                <div class="en-ai-runtime-grid">
                  <button
                    type="button"
                    :class="{ active: setupRuntime === 'node-llama-cpp' }"
                    @click="setSetupRuntime('node-llama-cpp')"
                  >
                    <strong>node-llama-cpp</strong>
                    <span>Local GGUF runtime</span>
                  </button>
                </div>

                <div
                  class="en-model-runtime-card"
                  :class="{ error: !localModelRuntime.available && modelRuntimeMessage }"
                >
                  <div>
                    <strong>{{
                      localModelRuntime.available ? 'Runtime ready' : 'Runtime not ready'
                    }}</strong>
                    <span>{{ modelRuntimeMessage || 'Check local runtime status.' }}</span>
                  </div>
                  <button type="button" @click="loadLocalModels">Check</button>
                </div>

                <div class="en-ai-setup-grid">
                  <article
                    v-for="step in aiSetupSteps"
                    :key="step.purpose"
                    class="en-ai-setup-card"
                    :class="{ installed: step.installed }"
                  >
                    <header>
                      <div>
                        <small>{{ step.label }}</small>
                        <strong>{{ step.model?.name || 'No model available' }}</strong>
                        <span
                          >{{ step.model?.provider || setupRuntime }} ·
                          {{ step.model?.size || 'unknown size' }}</span
                        >
                      </div>
                      <span>{{ step.installed ? 'Ready' : 'Needed' }}</span>
                    </header>
                    <p>
                      {{ step.model?.notes || 'No recommended model exists for this runtime yet.' }}
                    </p>
                    <div
                      v-if="step.model && isModelDownloading(step.model.id)"
                      class="en-model-progress"
                    >
                      <div :style="{ width: `${getModelProgress(step.model.id)}%` }" />
                    </div>
                    <p v-if="step.model && getModelMessage(step.model.id)" class="en-model-message">
                      {{ getModelMessage(step.model.id) }}
                    </p>
                    <button
                      type="button"
                      :disabled="
                        !step.model || !isModelLoadable(step.model) || modelDownload.active
                      "
                      @click="pullAtomicModel(step.model.id)"
                    >
                      {{ step.installed ? 'Test again' : 'Install and test' }}
                    </button>
                  </article>
                </div>

                <div class="en-settings-actions-row">
                  <button
                    type="button"
                    :disabled="modelDownload.active || isTestingAiConfig"
                    @click="runAiSetupTest"
                  >
                    {{ isTestingAiConfig ? 'Testing…' : 'Test complete AI setup' }}
                  </button>
                  <button type="button" @click="activeAiTab = 'search'">Embedding</button>
                  <button type="button" @click="activeAiTab = 'providers'">Models</button>
                  <span class="en-settings-message">{{
                    aiConfigMessage || modelSelectionMessage
                  }}</span>
                </div>
              </section>

              <section v-else-if="activeAiTab === 'providers'" class="en-ai-provider-panel">
                <div class="en-ai-panel-copy">
                  <h3>Assign the model for each role.</h3>
                  <p>
                    Choose a dedicated model for embedding, chat, and OCR. Chat and embeddings use
                    node-llama-cpp GGUF models; OCR keeps its own runtime target.
                  </p>
                </div>
                <div class="en-ai-slot-summary">
                  <article v-for="feature in aiFeatureRows" :key="`summary-${feature.id}`">
                    <small>{{ feature.title }}</small>
                    <strong>{{ feature.model?.name || 'No model selected' }}</strong>
                    <span>{{ feature.message }}</span>
                  </article>
                </div>
                <div class="en-ai-feature-list">
                  <article
                    v-for="feature in aiFeatureRows"
                    :key="feature.id"
                    class="en-ai-feature-row"
                  >
                    <div class="en-ai-feature-main">
                      <span class="en-ai-feature-icon">
                        <component :is="feature.icon" class="en-icon" />
                      </span>
                      <div>
                        <h4>{{ feature.title }}</h4>
                        <p>{{ feature.description }}</p>
                      </div>
                    </div>
                    <div class="en-ai-feature-controls">
                      <label class="en-ai-feature-provider">
                        <span>Assign to</span>
                        <select
                          v-model="modelSelection[feature.id]"
                          @change="updateRoutingModel(feature.id, modelSelection[feature.id])"
                        >
                          <option value="">No model</option>
                          <option
                            v-for="model in getRoutingModels(feature.id)"
                            :key="model.id"
                            :value="model.id"
                          >
                            {{ model.name }} · {{ model.provider }} · {{ model.size }}
                          </option>
                        </select>
                      </label>
                      <div class="en-ai-feature-status">
                        <span class="en-ai-status-pill" :class="feature.statusTone">
                          {{ feature.status }}
                          <CheckCircle2 v-if="feature.statusTone === 'ok'" class="en-icon" />
                        </span>
                        <p>{{ feature.model?.name || feature.message }}</p>
                        <small>{{ feature.message }}</small>
                      </div>
                      <button
                        type="button"
                        :disabled="
                          !feature.model || !isModelLoadable(feature.model) || modelDownload.active
                        "
                        @click="pullAtomicModel(feature.model.id)"
                      >
                        Load model
                        <Layers class="en-icon" />
                      </button>
                    </div>
                  </article>
                </div>
                <div class="en-settings-actions-row">
                  <button type="button" @click="loadLocalModels">Check runtime</button>
                  <button type="button" :disabled="isTestingAiConfig" @click="testAiConfig">
                    {{ isTestingAiConfig ? 'Testing...' : 'Test role routing' }}
                  </button>
                  <span class="en-settings-message">{{
                    aiConfigMessage || modelRuntimeMessage
                  }}</span>
                </div>
              </section>

              <section v-else-if="activeAiTab === 'models'" class="en-settings-section stacked">
                <div>
                  <h3>Model management</h3>
                  <p>
                    ElephantNote downloads GGUF files and loads them in the Electron main process
                    with node-llama-cpp.
                  </p>
                </div>

                <div
                  class="en-model-runtime-card"
                  :class="{ error: !localModelRuntime.available && modelRuntimeMessage }"
                >
                  <div>
                    <strong>{{
                      localModelRuntime.available
                        ? 'node-llama-cpp ready'
                        : 'node-llama-cpp not ready'
                    }}</strong>
                    <span>{{
                      modelRuntimeMessage ||
                      'Check the node-llama-cpp runtime and local GGUF model directory.'
                    }}</span>
                  </div>
                  <button type="button" @click="loadLocalModels">Check runtime</button>
                </div>

                <article v-for="group in modelGroups" :key="group.id" class="en-model-category">
                  <header>
                    <div>
                      <h4>{{ group.label }}</h4>
                      <p>{{ group.description }}</p>
                    </div>
                  </header>
                  <div class="en-model-slot-grid">
                    <label v-for="purpose in group.purposes" :key="purpose">
                      <span>{{ formatPurpose(purpose) }}</span>
                      <select v-model="modelSelection[purpose]">
                        <option value="">No model</option>
                        <option
                          v-for="model in getModelsForPurpose(purpose)"
                          :key="model.id"
                          :value="model.id"
                        >
                          {{ model.name }} · {{ model.provider }} · {{ model.size }}
                        </option>
                      </select>
                    </label>
                  </div>
                  <div class="en-model-catalog compact">
                    <article
                      v-for="model in getModelsForCategory(group.id)"
                      :key="model.id"
                      class="en-model-card"
                      :class="{
                        installed: isModelInstalled(model),
                        downloading: isModelDownloading(model.id),
                        failed:
                          getModelMessage(model.id)?.includes('Missing browser') ||
                          getModelMessage(model.id)?.includes('failed')
                      }"
                    >
                      <header>
                        <div>
                          <strong>{{ model.name }}</strong>
                          <span
                            >{{ model.purpose }} · {{ model.size }} ·
                            {{ model.browserModel || model.provider }}</span
                          >
                        </div>
                        <small>{{
                          isModelInstalled(model)
                            ? 'Loaded/cached'
                            : model.provider === 'browser'
                              ? 'Browser'
                              : 'External'
                        }}</small>
                      </header>
                      <p>{{ model.notes }}</p>
                      <div v-if="isModelDownloading(model.id)" class="en-model-progress">
                        <div :style="{ width: `${getModelProgress(model.id)}%` }" />
                      </div>
                      <p v-if="getModelMessage(model.id)" class="en-model-message">
                        {{ getModelMessage(model.id) }}
                      </p>
                      <button
                        type="button"
                        :disabled="!isModelLoadable(model) || modelDownload.active"
                        @click="pullAtomicModel(model.id)"
                      >
                        {{ getModelButtonLabel(model) }}
                      </button>
                    </article>
                  </div>
                </article>

                <article class="en-model-category">
                  <header>
                    <div>
                      <h4>Local library</h4>
                      <p>
                        Installed GGUF models, activation state, and the local model index used by
                        the app.
                      </p>
                    </div>
                  </header>
                  <div class="en-model-runtime-card">
                    <div>
                      <strong>{{ getActiveModelLabel }}</strong>
                      <span>{{
                        modelIndexMessage ||
                        'Model index is cached locally to speed up listing and lookup.'
                      }}</span>
                    </div>
                    <div class="en-settings-actions-row">
                      <button
                        type="button"
                        :disabled="isRefreshingModelIndex"
                        @click="refreshModelIndex"
                      >
                        {{ isRefreshingModelIndex ? 'Refreshing...' : 'Rebuild index' }}
                      </button>
                      <button type="button" @click="loadLocalModels">Reload</button>
                    </div>
                  </div>
                  <div class="en-model-catalog compact">
                    <article
                      v-for="model in localModels"
                      :key="model.path || model.id"
                      class="en-model-card"
                      :class="{
                        installed: true,
                        downloading: isModelDownloading(model.id),
                        failed: false
                      }"
                    >
                      <header>
                        <div>
                          <strong>{{ model.name }}</strong>
                          <span
                            >{{ model.source || 'local' }} ·
                            {{ model.fileName || model.filename || model.id }}</span
                          >
                        </div>
                        <small>{{ getModelStatusLabel(model) }}</small>
                      </header>
                      <p>{{ model.repoId || model.modelPath || model.path }}</p>
                      <div v-if="model.active" class="en-model-progress">
                        <div style="width: 100%" />
                      </div>
                      <p v-if="getModelMessage(model.id)" class="en-model-message">
                        {{ getModelMessage(model.id) }}
                      </p>
                      <div class="en-settings-actions-row">
                        <button
                          type="button"
                          :disabled="modelDownload.active && !isModelDownloading(model.id)"
                          @click="activateLocalModel(model)"
                        >
                          Activate
                        </button>
                        <button
                          type="button"
                          :disabled="!model.active && modelDownload.active"
                          @click="deactivateLocalModel(model)"
                        >
                          Unload
                        </button>
                        <button
                          type="button"
                          :disabled="model.active || modelDownload.active"
                          @click="deleteLocalModel(model)"
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  </div>
                </article>

                <article class="en-model-category">
                  <header>
                    <div>
                      <h4>Hugging Face search</h4>
                      <p>
                        Search the Hub, cache the result locally, then install the model with
                        progress and cancel support.
                      </p>
                    </div>
                  </header>
                  <div class="en-form-grid">
                    <label>
                      <span>Query</span>
                      <input
                        v-model.trim="hfSearchQuery"
                        type="text"
                        placeholder="SmolLM2 GGUF"
                        @keyup.enter="searchHuggingFaceModels"
                      />
                    </label>
                    <label>
                      <span>Limit</span>
                      <input v-model.number="hfSearchLimit" type="number" min="1" max="100" />
                    </label>
                  </div>
                  <div class="en-settings-actions-row">
                    <button
                      type="button"
                      :disabled="isSearchingHf"
                      @click="searchHuggingFaceModels"
                    >
                      {{ isSearchingHf ? 'Searching...' : 'Search Hugging Face' }}
                    </button>
                    <button
                      type="button"
                      :disabled="modelDownload.active"
                      @click="cancelCurrentDownload"
                    >
                      {{ getDownloadActionLabel() }}
                    </button>
                    <span class="en-settings-message">{{ hfSearchMessage }}</span>
                  </div>
                  <div class="en-model-catalog compact">
                    <article
                      v-for="model in huggingFaceModels"
                      :key="model.id"
                      class="en-model-card"
                      :class="{
                        installed: localModels.some((item) => item.repoId === model.repoId),
                        downloading: isModelDownloading(model.id)
                      }"
                    >
                      <header>
                        <div>
                          <strong>{{ model.name }}</strong>
                          <span
                            >{{ model.author || 'huggingface' }} ·
                            {{ model.pipelineTag || 'model' }}</span
                          >
                        </div>
                        <small
                          >{{ model.likes || 0 }} likes ·
                          {{ model.downloads || 0 }} downloads</small
                        >
                      </header>
                      <p>{{ (model.tags || []).slice(0, 6).join(' · ') }}</p>
                      <div v-if="isModelDownloading(model.id)" class="en-model-progress">
                        <div :style="{ width: `${getModelProgress(model.id)}%` }" />
                      </div>
                      <p v-if="getModelMessage(model.id)" class="en-model-message">
                        {{ getModelMessage(model.id) }}
                      </p>
                      <div class="en-settings-actions-row">
                        <button
                          type="button"
                          :disabled="modelDownload.active"
                          @click="downloadHuggingFaceModel(model, false)"
                        >
                          Install
                        </button>
                        <button
                          type="button"
                          :disabled="modelDownload.active"
                          @click="installAndActivateHuggingFaceModel(model)"
                        >
                          Install + activate
                        </button>
                      </div>
                    </article>
                  </div>
                </article>

                <div class="en-settings-actions-row">
                  <button type="button" @click="saveModelSelection">Save model slots</button>
                  <span class="en-settings-message">{{ modelSelectionMessage }}</span>
                </div>
                <p v-if="modelDir" class="en-settings-path">
                  Vault metadata directory: {{ modelDir }}
                </p>
                <p v-if="localModels.length" class="en-settings-path">
                  Browser cached/loaded: {{ localModels.map((model) => model.name).join(', ') }}
                </p>
              </section>

              <section v-else-if="activeAiTab === 'search'" class="en-ai-search">
                <div class="en-settings-section stacked">
                  <div>
                    <h3>Embedding model slot</h3>
                    <p>
                      Semantic search uses the embedding slot. Keep it on No model to use the
                      current built-in indexer.
                    </p>
                  </div>
                  <label>
                    <span>Embedding model</span>
                    <select v-model="modelSelection.embedding">
                      <option value="">No model / built-in</option>
                      <option
                        v-for="model in getModelsForPurpose('embedding')"
                        :key="model.id"
                        :value="model.id"
                      >
                        {{ model.name }} · {{ model.size }}
                      </option>
                    </select>
                  </label>
                  <div class="en-settings-actions-row">
                    <button type="button" @click="saveModelSelection">Save search model</button>
                  </div>
                </div>
                <search-settings-panel />
              </section>

              <section v-else-if="activeAiTab === 'chat'" class="en-settings-section stacked">
                <div>
                  <h3>Chat</h3>
                  <p>Local chat answers use the selected node-llama-cpp GGUF model.</p>
                </div>
                <div class="en-settings-actions-row">
                  <button type="button" :disabled="isTestingAiConfig" @click="testAiConfig">
                    {{ isTestingAiConfig ? 'Testing...' : 'Test local answer' }}
                  </button>
                  <span class="en-settings-message">{{ aiConfigMessage }}</span>
                </div>
              </section>

              <section v-else-if="activeAiTab === 'ocr'" class="en-settings-section stacked">
                <div>
                  <h3>OCR</h3>
                  <p>OCR extracts text content from images through the local Tesseract runtime.</p>
                </div>
                <div class="en-form-grid">
                  <label class="en-full-label">
                    <span>Image path</span>
                    <input
                      v-model.trim="ocrImagePath"
                      type="text"
                      placeholder="/path/to/image.png"
                    />
                  </label>
                </div>
                <div class="en-settings-actions-row">
                  <button type="button" :disabled="isRunningOcr || !ocrImagePath" @click="runOcr">
                    {{ isRunningOcr ? 'Extracting...' : 'Extract text' }}
                  </button>
                  <span class="en-settings-message">{{ ocrMessage }}</span>
                </div>
                <pre v-if="ocrText">{{ ocrText }}</pre>
              </section>

              <section v-else-if="activeAiTab === 'audio'" class="en-settings-section stacked">
                <div>
                  <h3>Audio workflow</h3>
                  <p>Audio uses the same model slots as future microphone and read-aloud tools.</p>
                </div>
                <div class="en-audio-grid">
                  <article>
                    <Mic class="en-icon" />
                    <strong>Speech to text</strong>
                    <span>{{ selectedModelName('speech-to-text') }}</span>
                  </article>
                  <article>
                    <Volume2 class="en-icon" />
                    <strong>Text to speech</strong>
                    <span>{{ selectedModelName('text-to-speech') }}</span>
                  </article>
                </div>
              </section>

              <section v-else-if="activeAiTab === 'tasks'" class="en-settings-section stacked">
                <div>
                  <h3>Tasks</h3>
                  <p>
                    Create simple task definitions now. Runtime execution is intentionally still
                    limited.
                  </p>
                </div>
                <div class="en-form-grid">
                  <label>
                    <span>Name</span>
                    <input v-model.trim="newTask.name" type="text" placeholder="Auto clean inbox" />
                  </label>
                  <label>
                    <span>Cadence</span>
                    <select v-model="newTask.cadence">
                      <option value="manual">Manual</option>
                      <option value="on-import">On import</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </label>
                </div>
                <label class="en-full-label">
                  <span>Description / prompt</span>
                  <textarea
                    v-model.trim="newTask.prompt"
                    rows="4"
                    placeholder="Describe what the LLM should do with notes, search, tags or wiki pages."
                  />
                </label>
                <div class="en-settings-actions-row">
                  <button
                    type="button"
                    :disabled="!newTask.name || !newTask.prompt"
                    @click="createTask"
                  >
                    Add task
                  </button>
                  <span class="en-settings-message">{{ taskMessage }}</span>
                </div>
                <div class="en-task-list">
                  <article v-for="task in taskTemplates" :key="task.id">
                    <header>
                      <strong>{{ task.name }}</strong>
                      <button
                        type="button"
                        :class="{ active: task.enabled }"
                        @click="toggleTask(task)"
                      >
                        {{ task.enabled ? 'Enabled' : 'Disabled' }}
                      </button>
                    </header>
                    <p>{{ task.description || task.prompt || task.actions.join(' -> ') }}</p>
                    <small
                      >{{ task.cadence }} · {{ task.actions.join(' -> ') || 'llm:prompt' }}</small
                    >
                    <button type="button" @click="runTask(task)">Run now</button>
                  </article>
                </div>
              </section>

              <section v-else-if="activeAiTab === 'api'" class="en-settings-section stacked">
                <div>
                  <h3>Agent and database access</h3>
                  <p>
                    This is the bridge for future agents such as Codex: they should access vault
                    data through approved API actions instead of reading arbitrary files.
                  </p>
                </div>
                <div class="en-api-summary">
                  <article>
                    <strong>Database</strong>
                    <span>Vault-local files and indexes under <code>.elephantnote</code></span>
                  </article>
                  <article>
                    <strong>Agent access</strong>
                    <span>Search, notes, wiki, summaries, model metadata and graph actions</span>
                  </article>
                  <article>
                    <strong>Safety boundary</strong>
                    <span
                      >Writes go through explicit API actions; direct uncontrolled DB writes are
                      avoided.</span
                    >
                  </article>
                </div>
                <button type="button" @click="loadAtomicApi">Inspect available actions</button>
                <pre v-if="atomicApiText">{{ atomicApiText }}</pre>
              </section>
            </section>
          </template>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import log from 'electron-log/renderer'
import {
  CheckCircle2,
  Download,
  GitBranch,
  Layers,
  MessageCircle,
  Mic,
  Moon,
  RefreshCw,
  ScanText,
  Search,
  Server,
  SunMedium,
  Volume2,
  Wifi,
  X
} from '@lucide/vue'
import { usePreferencesStore } from '@/store/preferences'
import { ELEPHANTNOTE_AI_PRESETS, normalizeAiConfig } from 'common/elephantnote/aiProviders'
import {
  ELEPHANTNOTE_THEME_FAMILIES,
  getOppositeThemeVariant,
  getThemeFamily,
  getThemeLabel,
  getThemeMode,
  getThemeTokens,
  getThemeVariant
} from 'common/elephantnote/appearance'
import {
  ATOMIC_MODEL_CATALOG,
  MODEL_GROUPS,
  PROGRAMMATIC_TASK_TEMPLATES,
  createDefaultModelSelection,
  getModelsByCategory,
  getModelsByPurpose
} from 'common/elephantnote/atomicWorkspace'
import {
  createSelectionPatchForModel,
  getModelRuntimeName,
  getRecommendedSetupModels,
  isRunnableSetupModel,
  isSetupModelInstalled
} from 'common/elephantnote/aiSetup'
import {
  clonePlainObject,
  createNodeLlamaCppTestConfig
} from './settingsModelHelpers'
import SearchSettingsPanel from '../../search/SearchSettingsPanel.vue'
import { useSitePreviewStore } from '../../sitePreview/sitePreviewStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'

const props = defineProps({
  theme: { type: String, required: true },
  sidebarWidth: { type: Number, required: true },
  vaults: { type: Array, default: () => [] },
  activeVaultName: { type: String, default: 'No vault' },
  activeVaultPath: { type: String, default: '' }
})

const emit = defineEmits(['close', 'update-theme', 'update-sidebar-width'])

const sections = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'vaults', label: 'Vaults' },
  { id: 'editor', label: 'Editor' },
  { id: 'import', label: 'Import' },
  { id: 'sites', label: 'Sites' },
  { id: 'sync', label: 'Sync' },
  { id: 'ai', label: 'AI' }
]

const aiTabs = [
  { id: 'providers', label: 'Roles' },
  { id: 'search', label: 'Embedding' },
  { id: 'chat', label: 'Chat' },
  { id: 'ocr', label: 'OCR' }
]

const activeSection = ref('appearance')
const activeAiTab = ref('providers')
const vaults = computed(() => props.vaults)
const theme = computed(() => props.theme)
const themeFamilies = ELEPHANTNOTE_THEME_FAMILIES
const themeMode = computed(() => getThemeMode(theme.value))
const themeClassId = computed(() => theme.value.replace(/[^a-z0-9-]/gi, '-'))
const activeThemeFamily = computed(() => getThemeFamily(theme.value))
const activeThemeLabel = computed(() => getThemeLabel(theme.value))
const oppositeTheme = computed(() => getOppositeThemeVariant(theme.value))
const preferences = usePreferencesStore()
const sitePreviewStore = useSitePreviewStore()
const aiConfig = ref(normalizeAiConfig())
const featureFlags = ref({
  askAi: true,
  sitePreview: true,
  gitSync: false,
  agents: true,
  semanticSearch: true
})
const setupRuntime = ref('node-llama-cpp')
const sourceUrl = ref('')
const sourceDestination = ref('Sources')
const sourceImportMessage = ref('')
const importMessage = ref('')
const isImporting = ref(false)
const isImportingSource = ref(false)
const isSyncRunning = ref(false)
const syncMessage = ref('')
const syncStatus = ref({
  backend: 'git',
  syncthing: {},
  history: []
})
const syncForm = ref({
  backend: 'syncthing-git',
  branch: 'main',
  peerDeviceId: '',
  peerAddress: 'dynamic',
  syncthingEndpoint: 'http://127.0.0.1:8384',
  syncthingApiKey: ''
})
const aiConfigMessage = ref('')
const isTestingAiConfig = ref(false)
const modelGroups = ref(MODEL_GROUPS)
const modelCatalog = ref(ATOMIC_MODEL_CATALOG)
const recommendedModels = ref([])
const modelSelection = ref(createDefaultModelSelection())
const modelSelectionMessage = ref('')
const modelRuntimeMessage = ref('')
const modelIndexMessage = ref('')
const modelDir = ref('')
const localModels = ref([])
const huggingFaceModels = ref([])
const hfSearchQuery = ref('SmolLM2 GGUF')
const hfSearchLimit = ref(20)
const hfSearchMessage = ref('')
const isSearchingHf = ref(false)
const isRefreshingModelIndex = ref(false)
const localModelRuntime = ref({
  available: false,
  webgpuAvailable: false,
  webcpuAvailable: true,
  transformersAvailable: false,
  dependencyError: ''
})
const modelDownload = ref({
  active: false,
  modelId: '',
  downloadId: '',
  percent: 0,
  phase: 'idle',
  message: '',
  error: ''
})
const modelDownloadMessages = ref({})
let stopModelDownloadProgressListener = () => {}
const taskTemplates = ref(PROGRAMMATIC_TASK_TEMPLATES)
const taskMessage = ref('')
const atomicApiText = ref('')
const newTask = ref({ name: '', cadence: 'manual', prompt: '' })
const ocrImagePath = ref('')
const ocrText = ref('')
const ocrMessage = ref('')
const isRunningOcr = ref(false)

const siteStatusLabel = computed(() => {
  if (sitePreviewStore.previewUrl) return 'Preview running'
  if (sitePreviewStore.lastBuild?.outputDir) return 'Static build ready'
  return 'No generated site active'
})

const syncPeerLabel = computed(() => {
  const peer = syncStatus.value.peers?.[0] || syncForm.value
  if (!peer?.deviceId && !syncForm.value.peerDeviceId) return 'No peer device configured'
  return `${peer.deviceId || syncForm.value.peerDeviceId} · ${peer.address || syncForm.value.peerAddress || 'dynamic'}`
})

const settingsStyle = computed(() => getThemeTokens(theme.value))

const setAutoSaveDelay = (value) =>
  preferences.SET_SINGLE_PREFERENCE({ type: 'autoSaveDelay', value })
const setShowEditorFooter = (value) =>
  preferences.SET_SINGLE_PREFERENCE({ type: 'showEditorFooter', value })
const setShowTagHashInEditor = (value) =>
  preferences.SET_SINGLE_PREFERENCE({ type: 'showTagHashInEditor', value })

const importGoogleKeep = async () => {
  isImporting.value = true
  importMessage.value = ''
  try {
    const result = await elephantnoteClient.imports.googleKeep()
    if (!result?.canceled) {
      importMessage.value = `Imported ${result.imported || 0} note${result.imported === 1 ? '' : 's'}.`
    }
  } catch (error) {
    importMessage.value = error instanceof Error ? error.message : 'Import failed.'
  } finally {
    isImporting.value = false
  }
}

const ingestSourceUrl = async () => {
  isImportingSource.value = true
  try {
    const result = await elephantnoteClient.sources.ingestUrl(
      sourceUrl.value,
      sourceDestination.value || 'Sources'
    )
    sourceImportMessage.value = `Imported ${result.source?.title || 'source'}.`
  } catch (error) {
    sourceImportMessage.value = error instanceof Error ? error.message : 'Source import failed.'
  } finally {
    isImportingSource.value = false
  }
}

const importRssSource = async () => {
  isImportingSource.value = true
  try {
    const result = await elephantnoteClient.sources.importRss(
      sourceUrl.value,
      sourceDestination.value || 'Sources'
    )
    sourceImportMessage.value = `Imported ${result.imported || 0} feed item${result.imported === 1 ? '' : 's'}.`
  } catch (error) {
    sourceImportMessage.value = error instanceof Error ? error.message : 'RSS import failed.'
  } finally {
    isImportingSource.value = false
  }
}

const stopSitePreview = async () => {
  await sitePreviewStore.stopPreview()
  sitePreviewStore.clear()
}

const toggleFeature = async (key) => {
  log.info('[settings] toggleFeature', { key, enabled: !featureFlags.value[key] })
  try {
    featureFlags.value = await elephantnoteClient.features.set(key, !featureFlags.value[key])
  } catch (error) {
    log.warn('Unable to update ElephantNote feature flag:', error)
  }
}

const syncInitPayload = () => ({
  backend: syncForm.value.backend,
  branch: syncForm.value.branch,
  syncthingEndpoint: syncForm.value.syncthingEndpoint,
  syncthingApiKey: syncForm.value.syncthingApiKey,
  peerDeviceId: syncForm.value.peerDeviceId,
  peerAddress: syncForm.value.peerAddress || 'dynamic'
})

const hydrateSyncForm = (status = {}) => {
  syncStatus.value = { syncthing: {}, history: [], ...status }
  syncForm.value = {
    ...syncForm.value,
    backend: status.backend || syncForm.value.backend,
    branch: status.branch || syncForm.value.branch,
    peerDeviceId: status.peers?.[0]?.deviceId || syncForm.value.peerDeviceId,
    peerAddress: status.peers?.[0]?.address || syncForm.value.peerAddress,
    syncthingEndpoint: status.syncthing?.endpoint || syncForm.value.syncthingEndpoint
  }
}

const loadSyncStatus = async () => {
  log.info('[settings] loadSyncStatus')
  try {
    hydrateSyncForm(await elephantnoteClient.sync.status())
    syncMessage.value = syncStatus.value.lastError || ''
  } catch (error) {
    log.warn('[settings] loadSyncStatus failed', error)
    syncMessage.value = error instanceof Error ? error.message : 'Unable to load sync status.'
  }
}

const configureSync = async () => {
  if (isSyncRunning.value) return
  isSyncRunning.value = true
  log.info('[settings] configureSync', syncInitPayload())
  syncMessage.value = 'Configuring synchronization...'
  try {
    hydrateSyncForm(
      await elephantnoteClient.sync.run({
        init: syncInitPayload()
      })
    )
    syncMessage.value = syncStatus.value.syncthing?.lastError || 'Synchronization configured.'
  } catch (error) {
    log.error('[settings] configureSync failed', error)
    syncMessage.value =
      error instanceof Error ? error.message : 'Synchronization configuration failed.'
  } finally {
    isSyncRunning.value = false
  }
}

const runSync = async () => {
  if (isSyncRunning.value) return
  isSyncRunning.value = true
  log.info('[settings] runSync', syncInitPayload())
  syncMessage.value = 'Synchronizing vault...'
  try {
    hydrateSyncForm(
      await elephantnoteClient.sync.run({
        init: syncInitPayload(),
        snapshot: { message: `ElephantNote manual sync ${new Date().toISOString()}` }
      })
    )
    syncMessage.value =
      syncStatus.value.lastError ||
      syncStatus.value.syncthing?.lastError ||
      'Synchronization finished.'
  } catch (error) {
    log.error('[settings] runSync failed', error)
    syncMessage.value = error instanceof Error ? error.message : 'Synchronization failed.'
  } finally {
    isSyncRunning.value = false
  }
}

const formatSyncTime = (value = '') => {
  if (!value) return 'unknown time'
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value))
  } catch {
    return value
  }
}

const testAiConfig = async () => {
  isTestingAiConfig.value = true
  log.info('[settings] testAiConfig:start')
  log.info('[settings] testAiConfig:state', {
    selectedEmbeddingModel: modelSelection.value.embedding || '',
    selectedChatModel: modelSelection.value.chat || '',
    selectedOcrModel: modelSelection.value.ocr || ''
  })
  const nextAiConfig = createNodeLlamaCppTestConfig({
    aiConfig: aiConfig.value,
    modelSelection: modelSelection.value,
    fallbackChatModelId: recommendedSetupModels.value.chat?.id || ''
  })
  aiConfigMessage.value = 'Testing node-llama-cpp model...'
  try {
    const aiConfigPayload = clonePlainObject(nextAiConfig)
    log.info('[settings] testAiConfig:payload-ready', {
      preset: aiConfigPayload.preset,
      transport: aiConfigPayload.transport,
      endpoint: aiConfigPayload.endpoint,
      model: aiConfigPayload.model
    })
    const result = await elephantnoteClient.ai.testConfig(aiConfigPayload)
    log.info('[settings] testAiConfig:testConfig:done', {
      latencyMs: result.latencyMs,
      model: result.model,
      embeddingDimensions: result.embeddingDimensions
    })
    aiConfig.value = normalizeAiConfig(nextAiConfig)
    log.info('[settings] testAiConfig:success', {
      latencyMs: result.latencyMs,
      model: result.model
    })
    aiConfigMessage.value = `node-llama-cpp OK · ${Math.round(result.latencyMs || 0)} ms · ${result.embeddingDimensions || 0} dims · ${result.response || 'response received'}`
  } catch (error) {
    log.error('[settings] testAiConfig failed', error)
    aiConfigMessage.value = error instanceof Error ? error.message : 'AI endpoint test failed.'
  } finally {
    isTestingAiConfig.value = false
  }
}

const formatPurpose = (purpose) =>
  purpose
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
const getModelsForPurpose = (purpose) => getModelsByPurpose(purpose, modelCatalog.value)
const getModelsForCategory = (category) => getModelsByCategory(category, modelCatalog.value)
const getRoutingModels = (purpose) =>
  purpose === 'ocr' ? getModelsForCategory('ocr') : getModelsForPurpose(purpose)
const getModelById = (id) => modelCatalog.value.find((item) => item.id === id || item.pull === id)
const updateRoutingModel = async (purpose, modelId) => {
  log.info('[settings] routing model changed', { purpose, modelId })
  try {
    await saveModelSelection()
  } catch (error) {
    log.error('[settings] updateRoutingModel failed', error)
  }
}
const selectedModelName = (purpose) =>
  modelCatalog.value.find((item) => item.id === modelSelection.value[purpose])?.name ||
  'Not selected'
const isModelInstalled = (model) => {
  if (!model?.id) return false
  return isSetupModelInstalled(model, localModels.value)
}
const isModelLoadable = (model) => isRunnableSetupModel(model)
const isModelDownloading = (id) => modelDownload.value.active && modelDownload.value.modelId === id
const getModelProgress = (id) =>
  isModelDownloading(id) ? Math.max(4, Math.min(100, Number(modelDownload.value.percent) || 4)) : 0
const getModelMessage = (id) =>
  isModelDownloading(id) ? modelDownload.value.message : modelDownloadMessages.value[id]
const getDownloadActionLabel = () =>
  modelDownload.value.phase === 'canceling' ? 'Canceling…' : 'Cancel'
const getActiveModelLabel = computed(() => {
  const active = localModels.value.find((model) => model.active) || null
  if (!active) return 'No model active'
  return `${active.name || active.id} · ${active.source || 'local'}`
})
const getModelStatusLabel = (model) => {
  if (model.active) return 'Active'
  if (model.source === 'huggingface') return 'HF'
  if (model.repoId) return 'Installed'
  return 'Local'
}
const getModelButtonLabel = (model) => {
  if (model.provider === 'local-ocr') return 'System OCR'
  if (!isModelLoadable(model)) return 'External'
  if (isModelDownloading(model.id)) return 'Loading…'
  if (isModelInstalled(model)) return 'Load / test again'
  return 'Download GGUF'
}
const recommendedSetupModels = computed(() =>
  getRecommendedSetupModels(modelCatalog.value, setupRuntime.value)
)
const getSelectedRoutingModel = (purpose) => {
  const id = modelSelection.value[purpose] || recommendedSetupModels.value[purpose]?.id || ''
  return getModelById(id) || recommendedSetupModels.value[purpose] || null
}
const aiSetupSteps = computed(() => [
  {
    purpose: 'embedding',
    label: 'Embedding',
    description: 'Used by semantic search and note recall.',
    model: getSelectedRoutingModel('embedding'),
    installed: isModelInstalled(getSelectedRoutingModel('embedding'))
  },
  {
    purpose: 'chat',
    label: 'Chat',
    description: 'Used by local chat answers.',
    model: getSelectedRoutingModel('chat'),
    installed: isModelInstalled(getSelectedRoutingModel('chat'))
  },
  {
    purpose: 'ocr',
    label: 'OCR',
    description: 'Used by image-to-text workflows.',
    model: getSelectedRoutingModel('ocr'),
    installed: isModelInstalled(getSelectedRoutingModel('ocr'))
  }
])
const aiFeatureRows = computed(() => [
  {
    id: 'embedding',
    title: 'Embedding',
    description: 'Embeddings de notes pour la recherche semantique.',
    icon: Search,
    model: getSelectedRoutingModel('embedding'),
    status: isModelInstalled(getSelectedRoutingModel('embedding')) ? 'Assigned' : 'Needs model',
    statusTone: isModelInstalled(getSelectedRoutingModel('embedding')) ? 'ok' : 'pending',
    message: isModelInstalled(getSelectedRoutingModel('embedding'))
      ? 'Local embeddings model is ready.'
      : 'Choose or download a GGUF model for embeddings.'
  },
  {
    id: 'chat',
    title: 'Chat',
    description: 'Reponse locale depuis un modele GGUF.',
    icon: MessageCircle,
    model: getSelectedRoutingModel('chat'),
    status: isModelInstalled(getSelectedRoutingModel('chat')) ? 'Assigned' : 'Needs model',
    statusTone: isModelInstalled(getSelectedRoutingModel('chat')) ? 'ok' : 'pending',
    message: isModelInstalled(getSelectedRoutingModel('chat'))
      ? 'Local chat model is ready for answer tests.'
      : 'Choose or download the GGUF model for chat.'
  },
  {
    id: 'ocr',
    title: 'OCR',
    description: 'Image vers contenu texte.',
    icon: ScanText,
    model: getSelectedRoutingModel('ocr'),
    status: isModelInstalled(getSelectedRoutingModel('ocr')) ? 'Assigned' : 'Needs model',
    statusTone: isModelInstalled(getSelectedRoutingModel('ocr')) ? 'ok' : 'pending',
    message: isModelInstalled(getSelectedRoutingModel('ocr'))
      ? 'Local OCR target is ready for extraction tests.'
      : 'Choose a model entry to associate with OCR.'
  }
])
const setupRuntimeMessage = computed(() => {
  return 'node-llama-cpp downloads GGUF models and runs local chat and embeddings inside the Electron main process. OCR uses local Tesseract.'
})

const setSetupRuntime = (runtime) => {
  setupRuntime.value = runtime
  const preset = ELEPHANTNOTE_AI_PRESETS.nodeLlamaCpp
  aiConfig.value = normalizeAiConfig({
    ...aiConfig.value,
    ...preset,
    preset: 'nodeLlamaCpp'
  })
  loadLocalModels()
}

const getPreferredModelIdForAiConfig = (fallbackId = '') => {
  return (
    [
      fallbackId,
      modelSelection.value.chat,
      modelSelection.value.embedding,
      modelSelection.value.summary,
      modelSelection.value.wiki,
      modelSelection.value.agent,
      modelSelection.value.tagging,
      modelSelection.value.naming,
      aiConfig.value.model,
      ''
    ].find(Boolean) || ''
  )
}

const resolveAiConfigModelRef = (modelRef = '') => {
  if (typeof modelRef === 'string') {
    return modelRef.trim()
  }
  if (!modelRef || typeof modelRef !== 'object') {
    return ''
  }
  return String(
    [
      modelRef.path,
      modelRef.modelPath,
      modelRef.fileName,
      modelRef.filename,
      modelRef.uri,
      modelRef.pull,
      modelRef.model,
      modelRef.id,
      modelRef.name,
      ''
    ].find(Boolean) || ''
  ).trim()
}

const syncAiConfigWithModel = async (modelRef = '', { persist = true } = {}) => {
  const nextModel = resolveAiConfigModelRef(modelRef) || getPreferredModelIdForAiConfig()
  log.info('[settings] syncAiConfigWithModel', {
    model: nextModel,
    persist
  })
  aiConfig.value = normalizeAiConfig({
    ...aiConfig.value,
    preset: 'nodeLlamaCpp',
    transport: 'node-llama-cpp',
    endpoint: 'node-llama-cpp://local',
    model: nextModel
  })
  if (persist) {
    const aiConfigPayload = clonePlainObject(aiConfig.value)
    await elephantnoteClient.ai.setConfig(aiConfigPayload)
  }
  return aiConfig.value
}

const saveModelSelection = async () => {
  try {
    log.info('[settings] saveModelSelection:start')
    const selectionPayload = clonePlainObject(modelSelection.value)
    modelSelection.value = {
      ...createDefaultModelSelection(),
      ...(await elephantnoteClient.models.setSelection(selectionPayload))
    }
    await syncAiConfigWithModel(getPreferredModelIdForAiConfig(), { persist: true })
    modelSelectionMessage.value = 'Model slots saved and AI config updated.'
    log.info('[settings] saveModelSelection:done', {
      selection: modelSelection.value
    })
  } catch (error) {
    log.error('[settings] saveModelSelection failed', error)
    window.localStorage.setItem(
      'elephantnote:atomicModelSelection',
      JSON.stringify(modelSelection.value)
    )
    modelSelectionMessage.value =
      error instanceof Error ? `${error.message} Saved locally.` : 'Model slots saved locally.'
  }
}

const syncDownloadProgress = (progress = {}) => {
  const downloadId = String(progress.downloadId || '').trim()
  if (
    !downloadId ||
    (modelDownload.value.downloadId && modelDownload.value.downloadId !== downloadId)
  ) {
    return
  }
  modelDownload.value = {
    ...modelDownload.value,
    active: true,
    downloadId,
    modelId: progress.modelId || progress.id || modelDownload.value.modelId,
    percent: Number(progress.percent ?? modelDownload.value.percent) || modelDownload.value.percent,
    phase: progress.phase || modelDownload.value.phase,
    message: progress.message || modelDownload.value.message
  }
}

const startModelDownloadProgressListener = () => {
  stopModelDownloadProgressListener?.()
  stopModelDownloadProgressListener =
    elephantnoteClient.models.onDownloadProgress?.(syncDownloadProgress) || (() => {})
  return stopModelDownloadProgressListener
}

const loadLocalModels = async () => {
  log.info('[settings] loadLocalModels')
  try {
    const result = await elephantnoteClient.models.list()
    localModels.value = result.models || []
    modelDir.value = result.modelDir || result.runtime?.modelDir || ''
    localModelRuntime.value = {
      available: Boolean(result.available),
      webgpuAvailable: false,
      webcpuAvailable: false,
      transformersAvailable: false,
      dependencyError: result.available ? '' : result.message
    }
    modelIndexMessage.value = result.indexUpdatedAt
      ? `Index updated ${new Date(result.indexUpdatedAt).toLocaleString()}.`
      : ''
    modelRuntimeMessage.value =
      result.message ||
      `${localModels.value.length} node-llama-cpp model${localModels.value.length === 1 ? '' : 's'} discovered.`
  } catch (error) {
    log.warn('[settings] loadLocalModels failed', error)
    localModelRuntime.value = {
      available: false,
      webgpuAvailable: false,
      webcpuAvailable: true,
      transformersAvailable: false,
      dependencyError: ''
    }
    modelRuntimeMessage.value =
      error instanceof Error ? error.message : 'Unable to inspect node-llama-cpp runtime.'
  }
}

const refreshModelIndex = async () => {
  if (isRefreshingModelIndex.value) return
  isRefreshingModelIndex.value = true
  log.info('[settings] refreshModelIndex')
  modelIndexMessage.value = 'Refreshing local model index...'
  try {
    await elephantnoteClient.models.refreshIndex()
    await loadLocalModels()
    modelIndexMessage.value = 'Local model index refreshed.'
  } catch (error) {
    log.error('[settings] refreshModelIndex failed', error)
    modelIndexMessage.value = error instanceof Error ? error.message : 'Index refresh failed.'
  } finally {
    isRefreshingModelIndex.value = false
  }
}

const searchHuggingFaceModels = async () => {
  if (isSearchingHf.value) return
  isSearchingHf.value = true
  log.info('[settings] searchHuggingFaceModels', {
    query: hfSearchQuery.value.trim(),
    limit: Number(hfSearchLimit.value) || 20
  })
  hfSearchMessage.value = 'Searching Hugging Face...'
  try {
    const result = await elephantnoteClient.models.searchHuggingFace({
      query: hfSearchQuery.value.trim(),
      limit: Number(hfSearchLimit.value) || 20,
      sort: 'downloads',
      direction: -1
    })
    huggingFaceModels.value = result.models || []
    hfSearchMessage.value =
      result.message ||
      `${huggingFaceModels.value.length} Hugging Face model${huggingFaceModels.value.length === 1 ? '' : 's'} found.`
  } catch (error) {
    log.warn('[settings] searchHuggingFaceModels failed', error)
    hfSearchMessage.value = error instanceof Error ? error.message : 'Hugging Face search failed.'
  } finally {
    isSearchingHf.value = false
  }
}

const downloadHuggingFaceModel = async (model, activate = false) =>
  downloadManagedModel(
    {
      ...model,
      provider: 'huggingface',
      source: 'huggingface',
      repoId: model.repoId || model.id,
      fileName: model.fileName || model.filename || ''
    },
    { activate }
  )

const installAndActivateHuggingFaceModel = async (model) => downloadHuggingFaceModel(model, true)

const cancelCurrentDownload = async () => {
  if (!modelDownload.value.active || !modelDownload.value.downloadId) return
  log.info('[settings] cancelCurrentDownload', { downloadId: modelDownload.value.downloadId })
  modelDownload.value = {
    ...modelDownload.value,
    phase: 'canceling',
    message: 'Canceling download...'
  }
  try {
    await elephantnoteClient.models.cancelDownload({ downloadId: modelDownload.value.downloadId })
    modelDownload.value = {
      active: false,
      modelId: '',
      downloadId: '',
      percent: 0,
      phase: 'canceled',
      message: 'Download canceled.',
      error: ''
    }
  } catch (error) {
    log.error('[settings] cancelCurrentDownload failed', error)
    modelDownload.value = {
      ...modelDownload.value,
      phase: 'error',
      message: error instanceof Error ? error.message : 'Cancel failed.'
    }
  }
}

const activateLocalModel = async (model) => {
  log.info('[settings] activateLocalModel', {
    id: model.id,
    path: model.path || model.modelPath || ''
  })
  try {
    await elephantnoteClient.models.activate({ model })
    await syncAiConfigWithModel(model, {
      persist: true
    })
    modelRuntimeMessage.value = `${model.name || model.id} activated.`
    await loadLocalModels()
  } catch (error) {
    log.error('[settings] activateLocalModel failed', error)
    modelRuntimeMessage.value = error instanceof Error ? error.message : 'Activation failed.'
  }
}

const deactivateLocalModel = async (model) => {
  log.info('[settings] deactivateLocalModel', {
    id: model.id,
    path: model.path || model.modelPath || ''
  })
  try {
    await elephantnoteClient.models.deactivate({
      modelRef: model.path || model.modelPath || model.id
    })
    modelRuntimeMessage.value = `${model.name || model.id} unloaded.`
    await loadLocalModels()
  } catch (error) {
    log.error('[settings] deactivateLocalModel failed', error)
    modelRuntimeMessage.value = error instanceof Error ? error.message : 'Unload failed.'
  }
}

const deleteLocalModel = async (model) => {
  log.info('[settings] deleteLocalModel', {
    id: model.id,
    path: model.path || model.modelPath || ''
  })
  try {
    await elephantnoteClient.models.remove({ modelRef: model.path || model.modelPath || model.id })
    modelRuntimeMessage.value = `${model.name || model.id} deleted.`
    await loadLocalModels()
  } catch (error) {
    log.error('[settings] deleteLocalModel failed', error)
    modelRuntimeMessage.value = error instanceof Error ? error.message : 'Delete failed.'
  }
}

const downloadManagedModel = async (model, { activate = false } = {}) => {
  if (modelDownload.value.active) return
  const isHuggingFace =
    model.provider === 'huggingface' || model.source === 'huggingface' || Boolean(model.repoId)
  if (!isHuggingFace && !isModelLoadable(model)) return
  const downloadId = `download-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const modelId = model.id || model.repoId || model.name || downloadId
  const startMessage = `Downloading ${model.name || model.id}...`
  log.info('[settings] downloadManagedModel:start', {
    modelId,
    activate,
    provider: model.provider || '',
    repoId: model.repoId || ''
  })
  modelRuntimeMessage.value = startMessage
  modelDownloadMessages.value = { ...modelDownloadMessages.value, [modelId]: startMessage }
  modelDownload.value = {
    active: true,
    modelId,
    downloadId,
    percent: 2,
    phase: 'starting',
    message: startMessage,
    error: ''
  }
  try {
    const result = await elephantnoteClient.models.download({
      ...model,
      ...(isHuggingFace
        ? {
            provider: 'huggingface',
            source: 'huggingface',
            repoId: model.repoId || model.id
          }
        : {}),
      downloadId
    })
    const runtimeModel = getModelRuntimeName(model)
    if (activate && result?.modelPath) {
      await elephantnoteClient.models.activate({
        model: {
          id: result.id || model.id,
          name: model.name || result.id || model.id,
          path: result.modelPath,
          modelPath: result.modelPath,
          provider: 'node-llama-cpp'
        }
      })
      await syncAiConfigWithModel(
        { path: result.modelPath, id: result.id || model.id },
        { persist: true }
      )
    }
    if (model.task === 'chat-completion') {
      await syncAiConfigWithModel(
        { path: result?.modelPath || model.path || model.modelPath || runtimeModel },
        { persist: true }
      )
    }
    const message = result?.message || `${model.name} ready through node-llama-cpp.`
    if (model?.purpose) {
      modelSelection.value = {
        ...modelSelection.value,
        ...createSelectionPatchForModel(model)
      }
      await saveModelSelection()
    }
    modelRuntimeMessage.value = message
    modelDownload.value = {
      active: false,
      modelId,
      downloadId,
      percent: 100,
      phase: 'done',
      message,
      error: ''
    }
    modelDownloadMessages.value = { ...modelDownloadMessages.value, [modelId]: message }
    await loadLocalModels()
    return true
  } catch (error) {
    log.error('[settings] downloadManagedModel failed', error)
    const message = error instanceof Error ? error.message : 'node-llama-cpp model download failed.'
    modelRuntimeMessage.value = message
    modelDownload.value = {
      active: false,
      modelId,
      downloadId,
      percent: 0,
      phase: 'error',
      message,
      error: message
    }
    modelDownloadMessages.value = { ...modelDownloadMessages.value, [modelId]: message }
    return false
  }
}

const pullAtomicModel = async (id) => {
  const model = getModelById(id)
  if (!model) return false
  log.info('[settings] pullAtomicModel', { id })
  return downloadManagedModel(model, { activate: false })
}

const runAiSetupTest = async () => {
  if (isTestingAiConfig.value || modelDownload.value.active) return
  isTestingAiConfig.value = true
  log.info('[settings] runAiSetupTest')
  aiConfigMessage.value = ''
  const models = [
    recommendedSetupModels.value.embedding,
    recommendedSetupModels.value.chat,
    recommendedSetupModels.value.ocr
  ].filter(Boolean)
  if (!models.length) {
    aiConfigMessage.value = 'No runnable model is available for this runtime.'
    isTestingAiConfig.value = false
    return
  }
  try {
    for (const model of models) {
      log.info('[settings] runAiSetupTest:model', {
        id: model.id,
        purpose: model.purpose || model.task || 'unknown',
        installed: model.installed
      })
      if (!model.installed) {
        await pullAtomicModel(model.id)
      }
    }
    aiConfigMessage.value = 'AI setup test passed: OCR, embedding, and chat slots are ready.'
  } catch (error) {
    log.error('[settings] runAiSetupTest failed', error)
    aiConfigMessage.value = error instanceof Error ? error.message : 'AI setup test failed.'
  } finally {
    isTestingAiConfig.value = false
  }
}

const loadAtomicCatalog = async () => {
  log.info('[settings] loadAtomicCatalog')
  try {
    const catalog = await elephantnoteClient.atomicFeatures.providers()
    recommendedModels.value = catalog.recommendedModels || []
    modelCatalog.value = catalog.recommendedModels?.length
      ? catalog.recommendedModels
      : ATOMIC_MODEL_CATALOG
    modelGroups.value = catalog.modelGroups?.length ? catalog.modelGroups : MODEL_GROUPS
  } catch {
    log.warn('[settings] loadAtomicCatalog fallback to static catalog')
    recommendedModels.value = ATOMIC_MODEL_CATALOG
  }
}

const loadModelSelection = async () => {
  log.info('[settings] loadModelSelection')
  try {
    modelSelection.value = {
      ...createDefaultModelSelection(),
      ...(await elephantnoteClient.models.getSelection())
    }
  } catch {
    modelSelection.value = createDefaultModelSelection()
  }
  await syncAiConfigWithModel(getPreferredModelIdForAiConfig(), { persist: false })
}

const loadTasks = async () => {
  log.info('[settings] loadTasks')
  try {
    taskTemplates.value = await elephantnoteClient.tasks.list()
  } catch (error) {
    log.warn('Unable to load ElephantNote tasks:', error)
  }
}

const createTask = async () => {
  const id =
    newTask.value.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `task-${Date.now()}`
  log.info('[settings] createTask', { id, cadence: newTask.value.cadence })
  try {
    taskTemplates.value = await elephantnoteClient.tasks.set({
      id,
      name: newTask.value.name,
      description: newTask.value.prompt,
      prompt: newTask.value.prompt,
      cadence: newTask.value.cadence,
      enabled: true,
      actions: ['llm:prompt']
    })
    newTask.value = { name: '', cadence: 'manual', prompt: '' }
    taskMessage.value = 'Task added.'
  } catch (error) {
    log.error('[settings] createTask failed', error)
    taskMessage.value = error instanceof Error ? error.message : 'Task creation failed.'
  }
}

const toggleTask = async (task) => {
  log.info('[settings] toggleTask', { id: task.id, enabled: !task.enabled })
  try {
    taskTemplates.value = await elephantnoteClient.tasks.set({ ...task, enabled: !task.enabled })
  } catch (error) {
    log.error('[settings] toggleTask failed', error)
    taskMessage.value = error instanceof Error ? error.message : 'Task update failed.'
  }
}

const runTask = async (task) => {
  log.info('[settings] runTask', { id: task.id })
  try {
    taskTemplates.value = await elephantnoteClient.tasks.run(task.id)
    taskMessage.value = `${task.name} finished.`
  } catch (error) {
    log.error('[settings] runTask failed', error)
    taskMessage.value = error instanceof Error ? error.message : 'Task run failed.'
  }
}

const loadAtomicApi = async () => {
  log.info('[settings] loadAtomicApi')
  try {
    atomicApiText.value = JSON.stringify(
      await elephantnoteClient.atomicFeatures.describeApi(),
      null,
      2
    )
  } catch (error) {
    log.error('[settings] loadAtomicApi failed', error)
    atomicApiText.value = error instanceof Error ? error.message : 'Unable to inspect API.'
  }
}

const runOcr = async () => {
  if (!ocrImagePath.value || isRunningOcr.value) return
  isRunningOcr.value = true
  log.info('[settings] runOcr', { imagePath: ocrImagePath.value })
  ocrMessage.value = 'Extracting text with local OCR...'
  ocrText.value = ''
  try {
    const result = await elephantnoteClient.ocr.extract(ocrImagePath.value, {
      language: 'eng',
      pageSegmentationMode: '11'
    })
    ocrText.value = result?.text || ''
    ocrMessage.value = result?.text
      ? 'OCR extraction complete.'
      : 'OCR completed without readable text.'
  } catch (error) {
    log.error('[settings] runOcr failed', error)
    ocrMessage.value = error instanceof Error ? error.message : 'OCR extraction failed.'
  } finally {
    isRunningOcr.value = false
  }
}

onMounted(async () => {
  log.info('[settings] mounted')
  try {
    featureFlags.value = await elephantnoteClient.features.get()
  } catch {}
  try {
    aiConfig.value = normalizeAiConfig(await elephantnoteClient.ai.getConfig())
  } catch {}
  startModelDownloadProgressListener()
  await Promise.allSettled([
    loadAtomicCatalog(),
    loadModelSelection(),
    loadTasks(),
    loadLocalModels(),
    loadSyncStatus()
  ])
})

onUnmounted(() => {
  stopModelDownloadProgressListener?.()
})
</script>

<style scoped>
.en-settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(8, 12, 18, 0.34);
}
.en-settings-panel {
  width: min(1040px, calc(100vw - 48px));
  max-height: min(820px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--en-border);
  border-radius: 14px;
  background: var(--en-surface);
  box-shadow: var(--en-card-shadow);
  overflow: hidden;
}
.en-settings-header {
  min-height: 88px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--en-border);
  background: color-mix(in srgb, var(--en-surface) 92%, var(--en-bg));
}
.en-settings-header p,
.en-settings-header h2 {
  margin: 0;
}
.en-settings-header p {
  color: var(--en-muted);
  font-size: 13px;
  font-weight: 700;
}
.en-settings-header h2 {
  margin-top: 4px;
  color: var(--en-text);
  font-size: 26px;
  line-height: 1.1;
}
.en-settings-close {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  color: var(--en-muted);
  background: transparent;
  cursor: pointer;
}
.en-settings-close:hover {
  color: var(--en-text);
  background: var(--en-soft);
}
.en-settings-grid {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: 188px minmax(0, 1fr);
}
.en-settings-nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-right: 1px solid var(--en-border);
  background: var(--en-sidebar-bg);
  overflow: auto;
}
.en-settings-nav button,
.en-ai-tabs button {
  min-height: 36px;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0 10px;
  color: var(--en-muted);
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.en-settings-nav button.active,
.en-ai-tabs button.active {
  color: var(--en-text);
  border-color: var(--en-border);
  background: var(--en-soft);
}
.en-settings-content {
  min-height: 0;
  overflow: auto;
  padding: 18px;
}
.en-settings-section {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px 18px;
  align-items: center;
  padding: 16px;
  border: 1px solid var(--en-border);
  border-radius: 12px;
  background: var(--en-bg);
  margin-bottom: 12px;
}
.en-settings-section.stacked {
  display: block;
}
.en-settings-section h3,
.en-ai-header h3 {
  margin: 0;
  color: var(--en-text);
  font-size: 17px;
}
.en-settings-section h4 {
  margin: 0;
  color: var(--en-text);
  font-size: 15px;
}
.en-settings-section p,
.en-ai-header p {
  margin: 5px 0 0;
  color: var(--en-muted);
  line-height: 1.45;
}
button {
  cursor: pointer;
}
.en-settings-section button,
.en-settings-actions-row button,
.en-theme-switch,
.en-ai-provider-grid button,
.en-model-catalog button,
.en-task-list button,
.en-ai-header button {
  min-height: 34px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-bg);
}
button.active {
  background: var(--en-soft-strong);
  border-color: var(--en-border-strong);
}
button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.en-theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.en-theme-card {
  min-height: 86px;
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  text-align: left;
}
.en-theme-card.active {
  border-color: color-mix(in srgb, var(--en-primary) 58%, var(--en-border));
  background: color-mix(in srgb, var(--en-primary) 12%, var(--en-bg));
}
.en-theme-card-preview {
  width: 54px;
  height: 54px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  overflow: hidden;
  border: 1px solid var(--en-border);
  border-radius: 8px;
}
.en-theme-card-preview i {
  min-width: 0;
  min-height: 0;
}
.en-theme-card-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.en-theme-card-copy strong {
  color: var(--en-text);
}
.en-theme-card-copy small {
  color: var(--en-muted);
  line-height: 1.35;
}
.en-settings-range {
  display: flex;
  gap: 10px;
  align-items: center;
}
.en-settings-pill,
.en-settings-message,
.en-settings-path {
  color: var(--en-muted);
}
.en-form-grid,
.en-model-slot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.en-form-grid label,
.en-model-slot-grid label,
.en-full-label {
  display: grid;
  gap: 5px;
  color: var(--en-muted);
}
input,
select,
textarea {
  min-height: 34px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 10px;
  color: var(--en-text);
  background: var(--en-surface);
}
textarea {
  padding: 10px;
  resize: vertical;
}
.en-settings-actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 12px;
}
.en-sync-status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
  margin-top: 14px;
}
.en-sync-status-card {
  min-height: 76px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--en-border);
  border-radius: 10px;
  background: var(--en-surface);
}
.en-sync-status-card.ok {
  border-color: color-mix(in srgb, var(--en-primary) 44%, var(--en-border));
  background: color-mix(in srgb, var(--en-primary) 7%, var(--en-bg));
}
.en-sync-status-card.warn {
  border-color: color-mix(in srgb, #f59e0b 45%, var(--en-border));
  background: color-mix(in srgb, #f59e0b 8%, var(--en-bg));
}
.en-sync-status-card > .en-icon {
  width: 24px;
  height: 24px;
  color: var(--en-primary);
}
.en-sync-status-card div {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.en-sync-status-card strong {
  color: var(--en-text);
  overflow-wrap: anywhere;
  text-transform: capitalize;
}
.en-sync-status-card span {
  color: var(--en-muted);
  overflow-wrap: anywhere;
  line-height: 1.35;
}
.en-sync-history {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}
.en-sync-history article {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 8px 12px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  background: var(--en-surface);
}
.en-sync-history article.error {
  border-color: color-mix(in srgb, #ef4444 50%, var(--en-border));
  background: color-mix(in srgb, #ef4444 8%, var(--en-bg));
}
.en-sync-history strong {
  color: var(--en-text);
  text-transform: capitalize;
}
.en-sync-history span,
.en-sync-history small {
  color: var(--en-muted);
  overflow-wrap: anywhere;
}
.en-sync-history small {
  grid-column: 2;
}
.en-ai-shell {
  display: grid;
  gap: 12px;
}
.en-ai-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 16px;
  border: 1px solid var(--en-border);
  border-radius: 12px;
  background: var(--en-bg);
}
.en-ai-setup-page {
  display: grid;
  gap: 12px;
}
.en-ai-hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  padding: 18px;
  border: 1px solid var(--en-border);
  border-radius: 14px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--en-primary) 9%, var(--en-bg)),
    var(--en-bg)
  );
}
.en-ai-hero small {
  color: var(--en-primary);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.en-ai-hero h3,
.en-ai-hero p,
.en-ai-quick-settings h4,
.en-ai-quick-settings p {
  margin: 0;
}
.en-ai-hero h3 {
  margin-top: 4px;
  color: var(--en-text);
  font-size: 22px;
}
.en-ai-hero p {
  margin-top: 6px;
  color: var(--en-muted);
  line-height: 1.45;
}
.en-ai-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.en-ai-hero-actions button,
.en-ai-quick-settings button,
.en-ai-primary-card button {
  min-height: 34px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-bg);
}
.en-ai-runtime-grid.compact {
  margin-top: 0;
}
.en-ai-status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
}
.en-ai-status-card {
  display: grid;
  gap: 5px;
  min-height: 76px;
  padding: 12px;
  border: 1px solid var(--en-border);
  border-radius: 12px;
  background: var(--en-bg);
}
.en-ai-status-card.ok {
  border-color: color-mix(in srgb, var(--en-primary) 42%, var(--en-border));
  background: color-mix(in srgb, var(--en-primary) 7%, var(--en-bg));
}
.en-ai-status-card.warn {
  border-color: color-mix(in srgb, #f59e0b 45%, var(--en-border));
  background: color-mix(in srgb, #f59e0b 8%, var(--en-bg));
}
.en-ai-status-card strong,
.en-ai-primary-card h4,
.en-ai-slot-summary strong {
  color: var(--en-text);
}
.en-ai-status-card span,
.en-ai-primary-card span,
.en-ai-primary-card p,
.en-ai-primary-card small,
.en-ai-slot-summary small {
  color: var(--en-muted);
  overflow-wrap: anywhere;
}
.en-ai-primary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}
.en-ai-primary-card {
  display: grid;
  gap: 12px;
  align-content: start;
  min-height: 242px;
  padding: 14px;
  border: 1px solid var(--en-border);
  border-radius: 14px;
  background: var(--en-bg);
}
.en-ai-primary-card.installed {
  border-color: color-mix(in srgb, var(--en-primary) 48%, var(--en-border));
  background: color-mix(in srgb, var(--en-primary) 7%, var(--en-bg));
}
.en-ai-primary-card header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.en-ai-primary-card header div {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.en-ai-primary-card h4 {
  margin: 0;
  font-size: 16px;
}
.en-ai-primary-card header > strong {
  flex: 0 0 auto;
  padding: 4px 8px;
  border: 1px solid var(--en-border);
  border-radius: 999px;
  background: var(--en-surface);
  font-size: 12px;
}
.en-ai-primary-card button {
  align-self: end;
}
.en-ai-quick-settings {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--en-border);
  border-radius: 14px;
  background: var(--en-bg);
}
.en-ai-quick-settings h4 {
  color: var(--en-text);
  font-size: 15px;
}
.en-ai-quick-settings p {
  margin-top: 4px;
  color: var(--en-muted);
}
.en-ai-slot-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}
.en-ai-slot-summary article {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--en-border);
  border-radius: 10px;
  background: var(--en-surface);
}
.en-ai-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  padding: 0;
  border: 1px solid var(--en-border);
  border-radius: 12px 12px 0 0;
  background: var(--en-bg);
  overflow: hidden;
}
.en-ai-tabs button {
  min-height: 44px;
  border-radius: 0;
  text-align: center;
  border-right-color: var(--en-border);
}
.en-ai-tabs button:last-child {
  border-right-color: transparent;
}
.en-ai-tabs button.active {
  border-color: transparent;
  border-bottom: 2px solid var(--en-primary);
  background: color-mix(in srgb, var(--en-surface) 82%, var(--en-bg));
}
.en-ai-provider-panel {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--en-border);
  border-top: 0;
  border-radius: 0 0 12px 12px;
  background: color-mix(in srgb, var(--en-bg) 94%, #05070b);
}
.en-ai-panel-copy h3,
.en-ai-panel-copy p {
  margin: 0;
}
.en-ai-panel-copy h3 {
  color: var(--en-text);
  font-size: 18px;
}
.en-ai-panel-copy p {
  margin-top: 5px;
  color: var(--en-muted);
}
.en-ai-feature-list {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 12px;
  padding: 4px 0 0;
  overflow: hidden;
}
.en-ai-feature-row {
  min-width: 0;
  display: grid;
  gap: 14px;
  align-content: start;
  min-height: 100%;
  padding: 16px;
  border: 1px solid var(--en-border);
  border-radius: 14px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--en-bg) 90%, var(--en-surface)),
    color-mix(in srgb, var(--en-bg) 96%, var(--en-primary))
  );
  box-shadow: 0 10px 30px rgba(10, 14, 20, 0.08);
}
.en-ai-feature-main {
  min-width: 0;
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
}
.en-ai-feature-icon {
  width: 46px;
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--en-primary) 30%, var(--en-border));
  border-radius: 8px;
  color: var(--en-primary);
  background: color-mix(in srgb, var(--en-primary) 22%, transparent);
}
.en-ai-feature-main h4,
.en-ai-feature-main p,
.en-ai-feature-status p,
.en-ai-feature-status small {
  margin: 0;
}
.en-ai-feature-main h4 {
  color: var(--en-text);
  font-size: 16px;
}
.en-ai-feature-main p,
.en-ai-feature-status p,
.en-ai-feature-status small,
.en-ai-feature-provider span {
  color: var(--en-muted);
  line-height: 1.35;
}
.en-ai-feature-provider {
  min-width: 0;
  display: grid;
  gap: 6px;
}
.en-ai-feature-provider select {
  min-width: 0;
  width: 100%;
}
.en-ai-feature-status {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.en-ai-feature-controls {
  display: grid;
  gap: 12px;
}
.en-ai-status-pill {
  width: fit-content;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--en-muted);
  background: var(--en-soft);
}
.en-ai-status-pill.ok {
  color: #9be46f;
  background: rgba(34, 197, 94, 0.16);
}
.en-ai-status-pill.pending {
  color: #f7c76a;
  background: rgba(245, 158, 11, 0.14);
}
.en-ai-status-pill.blocked {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.14);
}
.en-ai-feature-controls > button {
  min-width: 0;
  min-height: 36px;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 10px;
  color: var(--en-text);
  background: var(--en-bg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.en-ai-provider-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.en-ai-runtime-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.en-ai-runtime-grid button {
  min-height: 64px;
  display: grid;
  gap: 4px;
  align-content: center;
  text-align: left;
}
.en-ai-runtime-grid strong {
  color: var(--en-text);
}
.en-ai-runtime-grid span {
  color: var(--en-muted);
}
.en-ai-setup-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.en-ai-setup-card {
  display: grid;
  gap: 10px;
  min-height: 230px;
  border: 1px solid var(--en-border);
  border-radius: 12px;
  padding: 12px;
  background: var(--en-bg);
}
.en-ai-setup-card.installed {
  border-color: color-mix(in srgb, var(--en-primary) 48%, var(--en-border));
  background: color-mix(in srgb, var(--en-primary) 7%, var(--en-bg));
}
.en-ai-setup-card header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}
.en-ai-setup-card header div {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.en-ai-setup-card small,
.en-ai-setup-card span,
.en-ai-setup-card p {
  color: var(--en-muted);
}
.en-ai-setup-card strong {
  color: var(--en-text);
}
.en-ai-setup-card header > span {
  flex: 0 0 auto;
  padding: 4px 8px;
  border: 1px solid var(--en-border);
  border-radius: 999px;
  background: var(--en-surface);
  font-size: 12px;
}
.en-ai-setup-card button {
  align-self: end;
  min-height: 34px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-bg);
}
.en-model-category {
  border: 1px solid var(--en-border);
  border-radius: 12px;
  padding: 14px;
  background: var(--en-surface);
  margin-top: 12px;
}
.en-model-catalog,
.en-task-list,
.en-audio-grid,
.en-api-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.en-model-catalog.compact {
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}
.en-model-catalog article,
.en-task-list article,
.en-audio-grid article,
.en-api-summary article {
  border: 1px solid var(--en-border);
  border-radius: 12px;
  padding: 12px;
  background: var(--en-bg);
}
.en-model-catalog header,
.en-task-list header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}
.en-model-catalog span,
.en-model-catalog p,
.en-task-list p,
.en-task-list small,
.en-audio-grid span,
.en-api-summary span {
  color: var(--en-muted);
}
.en-model-runtime-card {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--en-border);
  border-radius: 12px;
  background: var(--en-surface);
}
.en-model-runtime-card.error {
  border-color: color-mix(in srgb, #ef4444 40%, var(--en-border));
  background: color-mix(in srgb, #ef4444 8%, var(--en-bg));
}
.en-model-runtime-card div {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.en-model-runtime-card strong {
  color: var(--en-text);
}
.en-model-runtime-card span {
  color: var(--en-muted);
  overflow-wrap: anywhere;
}
.en-model-card {
  display: grid;
  gap: 10px;
}
.en-model-card.installed {
  border-color: color-mix(in srgb, var(--en-primary) 48%, var(--en-border));
}
.en-model-card.failed {
  border-color: color-mix(in srgb, #ef4444 48%, var(--en-border));
}
.en-model-card header div {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.en-model-card small {
  flex: 0 0 auto;
  padding: 4px 8px;
  border: 1px solid var(--en-border);
  border-radius: 999px;
  color: var(--en-muted);
  background: var(--en-surface);
}
.en-model-progress {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--en-soft-strong);
}
.en-model-progress div {
  height: 100%;
  min-width: 4%;
  border-radius: inherit;
  background: var(--en-primary);
  transition: width 180ms ease;
}
.en-model-message {
  max-height: 76px;
  overflow: auto;
  padding: 8px;
  border-radius: 8px;
  background: var(--en-soft);
  overflow-wrap: anywhere;
  font-size: 12px;
}
.en-icon {
  width: 17px;
  height: 17px;
  vertical-align: middle;
}
.en-ai-search :deep(.en-search-settings) {
  margin: 0;
}
pre {
  white-space: pre-wrap;
  max-height: 320px;
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--en-border);
  border-radius: 10px;
  background: var(--en-soft);
  color: var(--en-text);
}
code {
  color: var(--en-primary);
}
@media (max-width: 980px) {
  .en-ai-feature-controls > button {
    width: 100%;
  }
}
@media (max-width: 760px) {
  .en-settings-grid {
    grid-template-columns: 1fr;
  }
  .en-settings-nav {
    flex-direction: row;
    border-right: 0;
    border-bottom: 1px solid var(--en-border);
  }
  .en-settings-section {
    grid-template-columns: 1fr;
  }
  .en-ai-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

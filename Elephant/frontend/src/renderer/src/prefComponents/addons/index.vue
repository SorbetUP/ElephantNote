<template>
  <div class="pref-addons">
    <div class="pref-addons-heading">
      <div>
        <h4>Addons</h4>
        <p class="pref-addons-description">
          Install community addons as isolated JavaScript workers. External addons start disabled and can only use the note paths, HTTPS hosts, storage and commands declared in their manifest.
        </p>
      </div>
      <el-button
        type="primary"
        :loading="operationInProgress"
        @click="installAddonPackage"
      >
        Install from file
      </el-button>
    </div>

    <el-alert
      v-if="lastError"
      class="pref-addons-alert"
      type="error"
      :closable="false"
      :title="lastError"
    />

    <section
      v-if="communityConsentLoaded"
      class="pref-community-safety"
      :class="{ enabled: communityAddonsEnabled }"
    >
      <template v-if="!communityAddonsEnabled">
        <div class="pref-community-safety-copy">
          <strong>Community addons are disabled</strong>
          <p>
            Addons are third-party code. Even with isolation and permission checks, ElephantNote cannot guarantee that every addon is safe, private or free of bugs. Only enable addons you trust and review the capabilities they request.
          </p>
        </div>
        <el-checkbox v-model="communityRiskAccepted">
          I understand that community addons can be unsafe and that I am responsible for the addons I enable.
        </el-checkbox>
        <el-button
          type="danger"
          plain
          :disabled="!communityRiskAccepted || operationInProgress"
          :loading="operationInProgress"
          @click="enableCommunityAddons"
        >
          Enable community addons
        </el-button>
      </template>

      <template v-else>
        <div class="pref-community-safety-copy">
          <strong>Community addons are enabled</strong>
          <p>
            Third-party addons may execute code, modify permitted notes or send permitted data over the network. Review each addon and its requested capabilities before enabling it.
          </p>
        </div>
        <el-button
          :disabled="operationInProgress"
          @click="disableCommunityAddons"
        >
          Disable community addons
        </el-button>
      </template>
    </section>

    <section class="pref-addons-summary">
      <div>
        <strong>{{ items.length }}</strong>
        <span>installed</span>
      </div>
      <div>
        <strong>{{ enabledAddons.length }}</strong>
        <span>enabled</span>
      </div>
      <div>
        <strong>{{ externalAddons.length }}</strong>
        <span>community addons</span>
      </div>
      <div>
        <strong>{{ contributionCount }}</strong>
        <span>active contributions</span>
      </div>
    </section>

    <section
      v-if="!installed"
      class="pref-addons-empty"
    >
      Addon system is not installed for this window.
    </section>

    <section
      v-else-if="!items.length"
      class="pref-addons-empty"
    >
      No addons are installed. Community packages use the <code>.enaddon</code> format.
    </section>

    <section
      v-else
      class="pref-addons-list"
    >
      <article
        v-for="addon in items"
        :key="addon.manifest.id"
        class="pref-addon-card"
      >
        <div class="pref-addon-card-main">
          <div>
            <div class="pref-addon-title-row">
              <h5>{{ addon.manifest.name }}</h5>
              <span
                class="pref-addon-source"
                :class="{ external: addon.manifest.source === 'external' }"
              >
                {{ addon.manifest.source === 'external' ? 'community worker' : 'built in' }}
              </span>
            </div>
            <code>{{ addon.manifest.id }}</code>
            <p>{{ addon.manifest.description || 'No description.' }}</p>
          </div>
          <div class="pref-addon-controls">
            <el-switch
              :model-value="addon.enabled"
              :disabled="operationInProgress || addon.status === 'activating' || (addon.manifest.source === 'external' && !communityAddonsEnabled)"
              @change="(value) => setAddonEnabled(addon.manifest.id, value)"
            />
            <el-button
              v-if="addon.manifest.source === 'external'"
              text
              type="danger"
              :disabled="operationInProgress"
              @click="uninstallAddon(addon)"
            >
              Uninstall
            </el-button>
          </div>
        </div>

        <div class="pref-addon-meta">
          <span>v{{ addon.manifest.version }}</span>
          <span>{{ addon.status }}</span>
          <span v-if="addon.manifest.author">by {{ addon.manifest.author }}</span>
          <span v-if="addon.manifest.runtime?.type">{{ addon.manifest.runtime.type }}</span>
          <span v-if="addon.manifest.defaultEnabled">default enabled</span>
          <span v-if="addon.manifest.source === 'external' && !communityAddonsEnabled">blocked by community mode</span>
        </div>

        <div
          v-if="permissionLabels(addon.manifest.permissions).length"
          class="pref-addon-permissions"
        >
          <strong>Granted capabilities:</strong>
          <span
            v-for="permission in permissionLabels(addon.manifest.permissions)"
            :key="permission"
          >
            {{ permission }}
          </span>
        </div>

        <p
          v-if="addon.error"
          class="pref-addon-error"
        >
          {{ addon.error.message }}
        </p>
      </article>
    </section>

    <section
      v-if="actions.length"
      class="pref-addon-contributions"
    >
      <h5>Addon actions</h5>
      <article
        v-for="action in actions"
        :key="`${action.addonId}:${action.id}`"
        class="pref-addon-action"
      >
        <div>
          <strong>{{ action.title }}</strong>
          <span>{{ action.id }} · {{ action.addonId }}</span>
          <p v-if="action.description">{{ action.description }}</p>
        </div>
        <el-button
          size="small"
          :disabled="!action.enabled || typeof action.run !== 'function'"
          @click="runAddonAction(action.id)"
        >
          Run
        </el-button>
      </article>
    </section>

    <section
      v-if="settingsSections.length"
      class="pref-addon-contributions"
    >
      <h5>Addon settings sections</h5>
      <article
        v-for="section in settingsSections"
        :key="`${section.addonId}:${section.id}`"
        class="pref-addon-action"
      >
        <div>
          <strong>{{ section.title }}</strong>
          <span>{{ section.id }} · {{ section.addonId }}</span>
          <p v-if="section.description">{{ section.description }}</p>
        </div>
      </article>
    </section>

    <section
      v-if="Object.keys(contributions).length"
      class="pref-addon-contributions"
    >
      <h5>Active contribution registry</h5>
      <div
        v-for="(entries, area) in contributions"
        :key="area"
        class="pref-addon-contribution-area"
      >
        <strong>{{ area }}</strong>
        <span>{{ entries.length }} item(s)</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessageBox } from 'element-plus'
import { open } from '@tauri-apps/plugin-dialog'
import { getAddonActions, getAddonSettingsSections } from '@/addons'
import { useAddonsStore } from '@/store/addons'

const addonsStore = useAddonsStore()
const communityRiskAccepted = ref(false)
const {
  installed,
  items,
  enabledAddons,
  externalAddons,
  contributionCount,
  contributions,
  lastError,
  operationInProgress,
  communityAddonsEnabled,
  communityConsentLoaded
} = storeToRefs(addonsStore)

const actions = computed(() => getAddonActions(contributions.value))
const settingsSections = computed(() => getAddonSettingsSections(contributions.value))

const permissionLabels = (permissions) => {
  if (Array.isArray(permissions)) return permissions
  if (!permissions || typeof permissions !== 'object') return []
  const labels = []
  for (const scope of permissions.notes?.read || []) labels.push(`Read notes: ${scope}`)
  for (const scope of permissions.notes?.write || []) labels.push(`Write notes: ${scope}`)
  for (const host of permissions.network?.hosts || []) labels.push(`HTTPS: ${host}`)
  if (permissions.storage) labels.push('Private addon storage')
  if (permissions.commands) labels.push('Register commands')
  return labels
}

const enableCommunityAddons = async () => {
  if (!communityRiskAccepted.value) return
  await addonsStore.setCommunityAddonsEnabled(true)
  communityRiskAccepted.value = false
}

const disableCommunityAddons = async () => {
  await ElMessageBox.confirm(
    'Disable community addons? All currently running community addons will be stopped. Installed packages and their private data will be kept.',
    'Disable community addons',
    { type: 'warning', confirmButtonText: 'Disable' }
  )
  await addonsStore.setCommunityAddonsEnabled(false)
  communityRiskAccepted.value = false
}

const setAddonEnabled = async (id, enabled) => {
  await addonsStore.setAddonEnabled(id, enabled)
}

const installAddonPackage = async () => {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [
      { name: 'ElephantNote addon', extensions: ['enaddon', 'zip'] }
    ]
  })
  if (typeof selected === 'string' && selected) {
    await addonsStore.installExternalAddon(selected)
  }
}

const uninstallAddon = async (addon) => {
  await ElMessageBox.confirm(
    `Uninstall ${addon.manifest.name}? Its private storage is kept so a later reinstall can recover its settings.`,
    'Uninstall addon',
    { type: 'warning', confirmButtonText: 'Uninstall' }
  )
  await addonsStore.uninstallExternalAddon(addon.manifest.id)
}

const runAddonAction = async (id) => {
  await addonsStore.runAction(id)
}
</script>

<style scoped>
.pref-addons {
  max-width: 900px;
  color: var(--editorColor);
}

.pref-addons-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.pref-addons-heading h4 {
  margin-top: 0;
}

.pref-addons-description {
  max-width: 680px;
  margin: 14px 0 20px;
  color: var(--editorColor60, var(--editorColor));
  line-height: 1.45;
}

.pref-addons-alert {
  margin-bottom: 16px;
}

.pref-community-safety {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 18px;
  padding: 18px;
  border: 1px solid var(--el-color-danger, #f56c6c);
  border-radius: 12px;
  background: var(--el-color-danger-light-9, rgba(245, 108, 108, 0.08));
}

.pref-community-safety.enabled {
  border-color: var(--el-color-warning, #e6a23c);
  background: var(--el-color-warning-light-9, rgba(230, 162, 60, 0.08));
}

.pref-community-safety-copy strong {
  font-size: 15px;
}

.pref-community-safety-copy p {
  max-width: 760px;
  margin: 7px 0 0;
  line-height: 1.5;
}

.pref-addons-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 18px;
}

.pref-addons-summary > div {
  border: 1px solid var(--floatBorderColor, var(--editorColor10));
  border-radius: 10px;
  padding: 14px;
  background: var(--floatBgColor, transparent);
}

.pref-addons-summary strong {
  display: block;
  font-size: 22px;
  line-height: 1;
}

.pref-addons-summary span,
.pref-addon-meta,
.pref-addon-permissions,
.pref-addon-contribution-area span,
.pref-addon-action span {
  color: var(--editorColor60, var(--editorColor));
  font-size: 12px;
}

.pref-addons-empty {
  border: 1px dashed var(--floatBorderColor, var(--editorColor10));
  border-radius: 10px;
  padding: 18px;
  color: var(--editorColor60, var(--editorColor));
}

.pref-addons-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pref-addon-card,
.pref-addon-action {
  border: 1px solid var(--floatBorderColor, var(--editorColor10));
  border-radius: 12px;
  padding: 16px;
  background: var(--floatBgColor, transparent);
}

.pref-addon-card-main,
.pref-addon-action,
.pref-addon-title-row,
.pref-addon-controls {
  display: flex;
}

.pref-addon-card-main,
.pref-addon-action {
  justify-content: space-between;
  gap: 16px;
}

.pref-addon-title-row,
.pref-addon-controls {
  align-items: center;
  gap: 10px;
}

.pref-addon-controls {
  flex-direction: column;
  align-items: flex-end;
}

.pref-addon-source {
  border: 1px solid var(--floatBorderColor, var(--editorColor10));
  border-radius: 999px;
  padding: 2px 8px;
  color: var(--editorColor60, var(--editorColor));
  font-size: 11px;
}

.pref-addon-source.external {
  border-color: var(--primaryColor, var(--el-color-primary));
  color: var(--primaryColor, var(--el-color-primary));
}

.pref-addon-action {
  align-items: center;
  margin-top: 10px;
}

.pref-addon-card h5,
.pref-addon-contributions h5 {
  margin: 0 0 6px;
  font-size: 16px;
}

.pref-addon-title-row h5 {
  margin: 0;
}

.pref-addon-card code {
  font-size: 12px;
  color: var(--editorColor60, var(--editorColor));
}

.pref-addon-card p,
.pref-addon-action p {
  margin: 10px 0 0;
  line-height: 1.4;
}

.pref-addon-meta,
.pref-addon-permissions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.pref-addon-permissions span,
.pref-addon-meta span {
  border: 1px solid var(--floatBorderColor, var(--editorColor10));
  border-radius: 999px;
  padding: 2px 8px;
}

.pref-addon-error {
  color: var(--el-color-danger, #f56c6c);
}

.pref-addon-contributions {
  margin-top: 22px;
  border-top: 1px solid var(--floatBorderColor, var(--editorColor10));
  padding-top: 18px;
}

.pref-addon-contribution-area {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--floatBorderColor, var(--editorColor10));
}

@media (max-width: 720px) {
  .pref-addons-heading {
    flex-direction: column;
  }

  .pref-addons-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pref-addon-card-main {
    flex-direction: column;
  }

  .pref-addon-controls {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }
}
</style>

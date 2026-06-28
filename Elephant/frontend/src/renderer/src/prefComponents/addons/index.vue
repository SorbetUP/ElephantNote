<template>
  <div class="pref-addons">
    <h4>Addons</h4>
    <p class="pref-addons-description">
      Manage ElephantNote addons. This page currently exposes the internal addon runtime and builtin addons; external package loading will be added after the sandbox and permission layer are implemented.
    </p>

    <el-alert
      v-if="lastError"
      class="pref-addons-alert"
      type="error"
      :closable="false"
      :title="lastError"
    />

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
      No addons are registered yet.
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
            <h5>{{ addon.manifest.name }}</h5>
            <code>{{ addon.manifest.id }}</code>
            <p>{{ addon.manifest.description || 'No description.' }}</p>
          </div>
          <el-switch
            :model-value="addon.enabled"
            :disabled="addon.status === 'activating'"
            @change="(value) => setAddonEnabled(addon.manifest.id, value)"
          />
        </div>

        <div class="pref-addon-meta">
          <span>v{{ addon.manifest.version }}</span>
          <span>{{ addon.status }}</span>
          <span v-if="addon.manifest.author">by {{ addon.manifest.author }}</span>
          <span v-if="addon.manifest.defaultEnabled">default enabled</span>
        </div>

        <div
          v-if="addon.manifest.permissions.length"
          class="pref-addon-permissions"
        >
          <strong>Permissions:</strong>
          <span
            v-for="permission in addon.manifest.permissions"
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
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { getAddonActions, getAddonSettingsSections } from '@/addons'
import { useAddonsStore } from '@/store/addons'

const addonsStore = useAddonsStore()
const {
  installed,
  items,
  enabledAddons,
  contributionCount,
  contributions,
  lastError
} = storeToRefs(addonsStore)

const actions = computed(() => getAddonActions(contributions.value))
const settingsSections = computed(() => getAddonSettingsSections(contributions.value))

const setAddonEnabled = async (id, enabled) => {
  await addonsStore.setAddonEnabled(id, enabled)
}

const runAddonAction = async (id) => {
  await addonsStore.runAction(id)
}
</script>

<style scoped>
.pref-addons {
  max-width: 860px;
  color: var(--editorColor);
}

.pref-addons-description {
  margin: 14px 0 20px;
  color: var(--editorColor60, var(--editorColor));
  line-height: 1.45;
}

.pref-addons-alert {
  margin-bottom: 16px;
}

.pref-addons-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
.pref-addon-action {
  display: flex;
  justify-content: space-between;
  gap: 16px;
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
</style>

<template>
  <article class="en-addon-row" :class="{ expanded }">
    <button class="en-addon-summary" type="button" @click="emit('toggle-details')">
      <span class="en-addon-logo"><Package aria-hidden="true" /></span>
      <span class="en-addon-copy">
        <span class="en-addon-title">
          <strong>{{ addon.manifest.name }}</strong>
          <small>v{{ addon.manifest.version }}</small>
        </span>
        <span>{{ addon.manifest.description || 'No description.' }}</span>
      </span>
      <ChevronDown class="en-addon-chevron" :class="{ rotated: expanded }" aria-hidden="true" />
    </button>

    <div class="en-addon-controls">
      <button
        class="en-switch"
        type="button"
        role="switch"
        :aria-label="`Enable ${addon.manifest.name}`"
        :aria-checked="addon.enabled"
        :class="{ active: addon.enabled }"
        :disabled="busy || addon.status === 'activating'"
        @click="emit('toggle-addon')"
      ><span /></button>
    </div>

    <div v-if="expanded" class="en-addon-details">
      <div class="en-addon-details-meta">
        <code>{{ addon.manifest.id }}</code>
        <span>{{ addon.manifest.author || 'Unknown author' }}</span>
        <span>{{ addon.status }}</span>
      </div>

      <div v-if="permissionLabels.length" class="en-addon-permissions">
        <span v-for="permission in permissionLabels" :key="permission">{{ permission }}</span>
      </div>

      <p v-if="addon.error" class="en-addon-error">{{ addon.error.message }}</p>

      <div v-if="actions.length" class="en-addon-commands">
        <button
          v-for="action in actions"
          :key="action.id"
          class="en-secondary-button"
          type="button"
          :disabled="busy || !addon.enabled || !action.enabled"
          @click="emit('run-action', action)"
        >
          <Play aria-hidden="true" /> {{ action.title }}
        </button>
      </div>

      <button
        v-if="addon.manifest.source === 'external'"
        class="en-danger-link"
        type="button"
        :disabled="busy"
        @click="emit('uninstall')"
      ><Trash2 aria-hidden="true" /> Uninstall</button>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { ChevronDown, Package, Play, Trash2 } from '@lucide/vue'

const props = defineProps({
  addon: { type: Object, required: true },
  actions: { type: Array, default: () => [] },
  expanded: { type: Boolean, default: false },
  busy: { type: Boolean, default: false }
})

const emit = defineEmits(['toggle-details', 'toggle-addon', 'run-action', 'uninstall'])

const permissionLabels = computed(() => {
  const permissions = props.addon?.manifest?.permissions
  if (Array.isArray(permissions)) return permissions
  if (!permissions || typeof permissions !== 'object') return []
  const labels = []
  for (const scope of permissions.notes?.read || []) labels.push(`Read ${scope}`)
  for (const scope of permissions.notes?.write || []) labels.push(`Write ${scope}`)
  for (const host of permissions.network?.hosts || []) labels.push(`HTTPS ${host}`)
  if (permissions.storage) labels.push('Private storage')
  if (permissions.commands) labels.push('Commands')
  return labels
})
</script>

<style scoped>
.en-addon-row + .en-addon-row { border-top: 1px solid var(--en-border, #c5cfdd); }
.en-addon-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
.en-addon-summary { min-width: 0; display: grid; grid-template-columns: 34px minmax(0, 1fr) 16px; align-items: center; gap: 11px; padding: 13px 14px; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.en-addon-summary:hover { background: color-mix(in srgb, var(--en-soft, #e9eff7) 52%, transparent); }
.en-addon-logo { width: 34px; height: 34px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 9px; background: var(--en-soft, #e9eff7); color: var(--en-primary, #2563eb); }
.en-addon-logo svg { width: 17px; height: 17px; }
.en-addon-copy { min-width: 0; display: grid; gap: 3px; }
.en-addon-copy > span:last-child { overflow: hidden; color: var(--en-muted, #667085); font-size: 10.5px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.en-addon-title { display: flex; align-items: baseline; gap: 7px; }
.en-addon-title strong { font-size: 12.5px; }
.en-addon-title small { color: var(--en-muted, #667085); font-size: 9.5px; }
.en-addon-chevron { width: 15px; height: 15px; color: var(--en-muted, #667085); transition: transform 140ms ease; }
.en-addon-chevron.rotated { transform: rotate(180deg); }
.en-addon-controls { display: flex; align-items: center; padding: 0 14px 0 8px; }
.en-addon-details { grid-column: 1 / -1; display: grid; gap: 10px; padding: 0 14px 14px 59px; }
.en-addon-details-meta, .en-addon-permissions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.en-addon-details-meta code, .en-addon-details-meta span, .en-addon-permissions span { color: var(--en-muted, #667085); font-size: 9.5px; }
.en-addon-permissions span { padding: 2px 6px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 999px; }
.en-addon-error { margin: 0; color: #b91c1c; font-size: 10.5px; }
.en-addon-commands { display: flex; flex-wrap: wrap; gap: 7px; }
.en-addon-commands button, .en-danger-link { font-size: 10.5px; }
.en-addon-commands svg, .en-danger-link svg { width: 13px; height: 13px; }
.en-danger-link { justify-self: start; }
@media (max-width: 720px) { .en-addon-details { padding-left: 14px; } }
</style>

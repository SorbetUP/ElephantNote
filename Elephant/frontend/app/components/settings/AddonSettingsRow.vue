<template>
  <article class="en-addon-row" :class="{ expanded }">
    <button class="en-addon-summary" type="button" @click="emit('toggle-details')">
      <span class="en-addon-logo"><Package aria-hidden="true" /></span>
      <span class="en-addon-copy">
        <span class="en-addon-title">
          <strong>{{ addon.manifest.name }}</strong>
          <small>v{{ addon.manifest.version }}</small>
          <span class="en-addon-access" :class="`is-${accessLevel}`">{{ accessLabel }}</span>
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

      <div class="en-addon-access-explanation" :class="`is-${accessLevel}`">
        <ShieldCheck v-if="accessLevel === 'isolated'" aria-hidden="true" />
        <ShieldAlert v-else-if="accessLevel === 'trusted'" aria-hidden="true" />
        <BadgeCheck v-else aria-hidden="true" />
        <div>
          <strong>{{ accessLabel }}</strong>
          <span>{{ accessDescription }}</span>
        </div>
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

      <div v-if="addon.manifest.source === 'external'" class="en-addon-uninstall">
        <button
          v-if="!confirmingUninstall"
          class="en-danger-link"
          type="button"
          :disabled="busy"
          @click="confirmingUninstall = true"
        ><Trash2 aria-hidden="true" /> Uninstall</button>
        <template v-else>
          <span>The package will be removed. Private addon data will be kept.</span>
          <button class="en-danger-link" type="button" :disabled="busy" @click="confirmUninstall">
            <Trash2 aria-hidden="true" /> Confirm uninstall
          </button>
          <button class="en-secondary-button" type="button" :disabled="busy" @click="confirmingUninstall = false">Cancel</button>
        </template>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { BadgeCheck, ChevronDown, Package, Play, ShieldAlert, ShieldCheck, Trash2 } from '@lucide/vue'
import { getAddonAccessLevel } from '@/addons/manifest'

const props = defineProps({
  addon: { type: Object, required: true },
  actions: { type: Array, default: () => [] },
  expanded: { type: Boolean, default: false },
  busy: { type: Boolean, default: false }
})

const emit = defineEmits(['toggle-details', 'toggle-addon', 'run-action', 'uninstall'])
const confirmingUninstall = ref(false)

watch(() => props.expanded, (expanded) => {
  if (!expanded) confirmingUninstall.value = false
})

const accessLevel = computed(() => getAddonAccessLevel(props.addon?.manifest))
const accessLabel = computed(() => ({
  isolated: 'Limited access',
  trusted: 'Full app access',
  system: 'Built in by ElephantNote'
}[accessLevel.value] || 'Unknown access'))
const accessDescription = computed(() => ({
  isolated: 'Runs in an isolated Worker and can only use the capabilities listed below.',
  trusted: 'Runs inside ElephantNote and can change the interface, editor and application behavior.',
  system: 'Ships with ElephantNote and is tested as part of the application.'
}[accessLevel.value] || ''))

const confirmUninstall = () => {
  confirmingUninstall.value = false
  emit('uninstall')
}

const permissionLabels = computed(() => {
  const manifest = props.addon?.manifest || {}
  const permissions = manifest.permissions
  const labels = []
  if (Array.isArray(permissions)) labels.push(...permissions)
  else if (permissions && typeof permissions === 'object') {
    for (const scope of permissions.notes?.read || []) labels.push(`Read ${scope}`)
    for (const scope of permissions.notes?.write || []) labels.push(`Write ${scope}`)
    for (const host of permissions.network?.hosts || []) labels.push(`HTTPS ${host}`)
    if (permissions.storage) labels.push('Private storage')
    if (permissions.commands) labels.push('Commands')
    if (permissions.native) labels.push('Native system access')
  }
  const views = Array.isArray(manifest.contributes?.views) ? manifest.contributes.views : []
  for (const view of views) labels.push(`Interactive workspace: ${view?.title || 'Addon'}`)
  return [...new Set(labels)]
})
</script>

<style scoped>
.en-addon-row + .en-addon-row { border-top: 1px solid var(--en-border, #c5cfdd); }
.en-addon-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
.en-addon-summary { min-width: 0; display: grid; grid-template-columns: 34px minmax(0, 1fr) 16px; align-items: center; gap: 11px; padding: 13px 14px; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.en-addon-summary:hover { background: color-mix(in srgb, var(--en-soft, #e9eff7) 52%, transparent); }
.en-addon-logo { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 9px; background: var(--en-soft, #e9eff7); color: var(--en-primary, #2563eb); }
.en-addon-logo svg { width: 17px; height: 17px; }
.en-addon-copy { min-width: 0; display: grid; gap: 3px; }
.en-addon-copy > span:last-child { overflow: hidden; color: var(--en-muted, #667085); font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
.en-addon-title { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.en-addon-title strong { font-size: 12.5px; }
.en-addon-title small { color: var(--en-muted, #667085); font-size: 9.5px; }
.en-addon-access { padding: 2px 6px; border-radius: 999px; font-size: 9px; font-weight: 650; }
.en-addon-access.is-isolated { background: color-mix(in srgb, #16a34a 13%, transparent); color: #15803d; }
.en-addon-access.is-trusted { background: color-mix(in srgb, #d97706 15%, transparent); color: #b45309; }
.en-addon-access.is-system { background: color-mix(in srgb, var(--en-primary, #2563eb) 13%, transparent); color: var(--en-primary, #2563eb); }
.en-addon-chevron { width: 15px; height: 15px; color: var(--en-muted, #667085); transition: transform 140ms ease; }
.en-addon-chevron.rotated { transform: rotate(180deg); }
.en-addon-controls { display: flex; align-items: center; padding: 0 14px 0 8px; }
.en-addon-details { grid-column: 1 / -1; display: grid; gap: 10px; padding: 0 14px 14px 59px; }
.en-addon-details-meta, .en-addon-permissions, .en-addon-uninstall { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.en-addon-details-meta code, .en-addon-details-meta span, .en-addon-permissions span, .en-addon-uninstall > span { color: var(--en-muted, #667085); font-size: 9.5px; }
.en-addon-permissions span { padding: 2px 6px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 999px; }
.en-addon-access-explanation { display: flex; gap: 9px; padding: 10px; border: 1px solid var(--en-border, #c5cfdd); border-radius: 10px; }
.en-addon-access-explanation > svg { width: 17px; height: 17px; flex: 0 0 auto; }
.en-addon-access-explanation > div { display: grid; gap: 2px; }
.en-addon-access-explanation strong { font-size: 11px; }
.en-addon-access-explanation span { color: var(--en-muted, #667085); font-size: 10px; line-height: 1.4; }
.en-addon-access-explanation.is-trusted { border-color: color-mix(in srgb, #d97706 38%, var(--en-border, #c5cfdd)); }
.en-addon-error { margin: 0; color: #b91c1c; font-size: 10.5px; }
.en-addon-commands { display: flex; flex-wrap: wrap; gap: 7px; }
.en-addon-commands button, .en-danger-link, .en-addon-uninstall .en-secondary-button { font-size: 10.5px; }
.en-addon-commands svg, .en-danger-link svg { width: 13px; height: 13px; }
.en-danger-link { justify-self: start; }
@media (max-width: 720px) { .en-addon-details { padding-left: 14px; } }
</style>

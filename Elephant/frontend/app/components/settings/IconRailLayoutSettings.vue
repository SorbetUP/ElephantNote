<template>
  <div class="en-rail-layout-settings">
    <header class="en-rail-layout-header">
      <strong>Vertical icon bar</strong>
      <div class="en-rail-layout-header-actions">
        <button type="button" title="Add divider" aria-label="Add divider" @click="addDivider"><Plus aria-hidden="true" /></button>
        <button type="button" title="Reset icon bar" aria-label="Reset icon bar" @click="resetLayout"><RotateCcw aria-hidden="true" /></button>
        <button type="button" :title="collapsed ? 'Expand icon bar settings' : 'Collapse icon bar settings'" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
          <ChevronDown :class="{ collapsed }" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div v-if="!collapsed" class="en-rail-layout-list" role="list" aria-label="Vertical icon bar order">
      <article
        v-for="(item, index) in orderedItems"
        :key="item.id"
        class="en-rail-layout-item"
        :class="{ hidden: isHidden(item.id), dragging: draggingId === item.id, separator: item.separator }"
        draggable="true"
        role="listitem"
        @dragstart="startDrag(item.id, $event)"
        @dragend="draggingId = ''"
        @dragover.prevent
        @drop.prevent="dropOn(item.id)"
      >
        <GripVertical class="en-rail-layout-grip" aria-hidden="true" />
        <div class="en-rail-layout-copy">
          <strong>{{ item.separator ? 'Divider' : item.label }}</strong>
          <span v-if="item.separator" class="en-rail-layout-divider-preview" aria-hidden="true" />
        </div>
        <div class="en-rail-layout-actions">
          <button type="button" :disabled="index === 0" :aria-label="`Move ${item.label || 'divider'} up`" @click="move(item.id, index - 1)"><ChevronUp aria-hidden="true" /></button>
          <button type="button" :disabled="index === orderedItems.length - 1" :aria-label="`Move ${item.label || 'divider'} down`" @click="move(item.id, index + 1)"><ChevronDown aria-hidden="true" /></button>
          <button v-if="item.separator" type="button" aria-label="Remove divider" @click="removeDivider(item.id)"><Trash2 aria-hidden="true" /></button>
          <button v-else type="button" :aria-label="`${isHidden(item.id) ? 'Show' : 'Hide'} ${item.label}`" @click="toggleVisibility(item.id)">
            <EyeOff v-if="isHidden(item.id)" aria-hidden="true" />
            <Eye v-else aria-hidden="true" />
          </button>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Plus, RotateCcw, Trash2 } from '@lucide/vue'
import { usePreferencesStore } from '@/store/preferences'
import { useAddonsStore } from '@/store/addons'
import { getAddonSidebarItems } from '@/addons'
import {
  CORE_ICON_RAIL_ITEMS,
  DEFAULT_ICON_RAIL_ORDER,
  addonViewRailId,
  createIconRailSeparatorId,
  isIconRailSeparatorId,
  moveIconRailItem,
  normalizeIconRailHidden,
  normalizeIconRailOrder
} from '../navigation/iconRailLayout'

const preferences = usePreferencesStore()
const addonsStore = useAddonsStore()
const draggingId = ref('')
const collapsed = ref(false)

const addonItems = computed(() => addonsStore.getContributions('views')
  .filter((entry) => entry?.contribution?.id && entry?.contribution?.title)
  .map((entry) => ({
    id: addonViewRailId(entry.contribution.id),
    label: entry.contribution.title,
    source: 'addon'
  })))

const legacyAddonItems = computed(() => getAddonSidebarItems(addonsStore.contributions).map((item) => ({
  id: `addon-item:${item.addonId}:${item.id}`,
  label: item.title || item.tooltip || item.id,
  source: 'addon'
})))

const availableItems = computed(() => [
  ...CORE_ICON_RAIL_ITEMS.map((item) => ({ ...item, source: 'core' })),
  ...addonItems.value,
  ...legacyAddonItems.value
])
const availableIds = computed(() => availableItems.value.map((item) => item.id))
const orderedIds = computed(() => normalizeIconRailOrder(preferences.iconRailOrder, availableIds.value))
const hiddenIds = computed(() => normalizeIconRailHidden(preferences.iconRailHidden, availableIds.value))
const orderedItems = computed(() => {
  const byId = new Map(availableItems.value.map((item) => [item.id, item]))
  return orderedIds.value.map((id) => isIconRailSeparatorId(id) ? { id, separator: true } : byId.get(id)).filter(Boolean)
})

const persistOrder = (order) => preferences.SET_SINGLE_PREFERENCE({
  type: 'iconRailOrder',
  value: normalizeIconRailOrder(order, availableIds.value)
})

const persistHidden = (hidden) => preferences.SET_SINGLE_PREFERENCE({
  type: 'iconRailHidden',
  value: normalizeIconRailHidden(hidden, availableIds.value)
})

const isHidden = (id) => hiddenIds.value.includes(id)
const move = (id, index) => persistOrder(moveIconRailItem(orderedIds.value, id, index))
const addDivider = () => persistOrder([...orderedIds.value, createIconRailSeparatorId()])
const removeDivider = (id) => persistOrder(orderedIds.value.filter((candidate) => candidate !== id))

const toggleVisibility = (id) => {
  const next = new Set(hiddenIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  persistHidden([...next])
}

const startDrag = (id, event) => {
  draggingId.value = id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }
}

const dropOn = (targetId) => {
  const sourceId = draggingId.value
  draggingId.value = ''
  if (!sourceId || sourceId === targetId) return
  const targetIndex = orderedIds.value.indexOf(targetId)
  persistOrder(moveIconRailItem(orderedIds.value, sourceId, targetIndex))
}

const resetLayout = () => {
  persistOrder(normalizeIconRailOrder(DEFAULT_ICON_RAIL_ORDER, availableIds.value))
  persistHidden([])
}
</script>

<style scoped>
.en-rail-layout-settings { width: 100%; display: grid; gap: 10px; }
.en-rail-layout-header { min-height: 34px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.en-rail-layout-header > strong { font-size: 13px; font-weight: 650; }
.en-rail-layout-header-actions, .en-rail-layout-actions { display: flex; gap: 4px; }
.en-rail-layout-header-actions button, .en-rail-layout-actions button { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 1px solid var(--en-border); border-radius: 7px; color: var(--en-text); background: var(--en-surface); cursor: pointer; }
.en-rail-layout-header-actions button:hover, .en-rail-layout-actions button:hover:not(:disabled) { background: var(--en-soft); }
.en-rail-layout-header-actions svg, .en-rail-layout-actions svg { width: 14px; height: 14px; }
.en-rail-layout-header-actions .collapsed { transform: rotate(-90deg); }
.en-rail-layout-list { display: grid; border: 1px solid var(--en-border); border-radius: 10px; overflow: hidden; }
.en-rail-layout-item { min-height: 48px; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 6px 9px; background: var(--en-surface); }
.en-rail-layout-item + .en-rail-layout-item { border-top: 1px solid var(--en-border); }
.en-rail-layout-item.dragging { opacity: .48; }
.en-rail-layout-item.hidden .en-rail-layout-copy { opacity: .55; }
.en-rail-layout-item.separator { min-height: 42px; }
.en-rail-layout-grip { width: 16px; height: 16px; color: var(--en-muted); cursor: grab; }
.en-rail-layout-copy { min-width: 0; display: flex; align-items: center; gap: 10px; }
.en-rail-layout-copy strong { flex: 0 0 auto; font-size: 12px; }
.en-rail-layout-divider-preview { width: 34px; height: 1px; background: var(--en-border-strong, var(--en-border)); }
.en-rail-layout-actions button:disabled { opacity: .35; cursor: default; }
</style>

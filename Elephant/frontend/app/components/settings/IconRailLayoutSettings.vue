<template>
  <div class="en-rail-layout-settings">
    <div class="en-rail-layout-toolbar">
      <p>Drag items or use the arrow buttons. Hidden items stay available from their original feature or addon.</p>
      <button type="button" @click="resetLayout"><RotateCcw aria-hidden="true" /> Reset</button>
    </div>

    <div class="en-rail-layout-list" role="list" aria-label="Vertical icon bar order">
      <article
        v-for="(item, index) in orderedItems"
        :key="item.id"
        class="en-rail-layout-item"
        :class="{ hidden: isHidden(item.id), dragging: draggingId === item.id }"
        draggable="true"
        role="listitem"
        @dragstart="startDrag(item.id, $event)"
        @dragend="draggingId = ''"
        @dragover.prevent
        @drop.prevent="dropOn(item.id)"
      >
        <GripVertical class="en-rail-layout-grip" aria-hidden="true" />
        <div class="en-rail-layout-copy">
          <strong>{{ item.label }}</strong>
          <span>{{ item.source === 'addon' ? 'Addon workspace' : item.description }}</span>
        </div>
        <div class="en-rail-layout-actions">
          <button type="button" :disabled="index === 0" :aria-label="`Move ${item.label} up`" @click="move(item.id, index - 1)">
            <ChevronUp aria-hidden="true" />
          </button>
          <button type="button" :disabled="index === orderedItems.length - 1" :aria-label="`Move ${item.label} down`" @click="move(item.id, index + 1)">
            <ChevronDown aria-hidden="true" />
          </button>
          <button type="button" :aria-label="`${isHidden(item.id) ? 'Show' : 'Hide'} ${item.label}`" @click="toggleVisibility(item.id)">
            <EyeOff v-if="isHidden(item.id)" aria-hidden="true" />
            <Eye v-else aria-hidden="true" />
          </button>
        </div>
      </article>
    </div>

    <p class="en-rail-layout-footnote">The vault switcher, sidebar toggle and Settings button remain fixed so navigation cannot become inaccessible.</p>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, RotateCcw } from '@lucide/vue'
import { usePreferencesStore } from '@/store/preferences'
import { useAddonsStore } from '@/store/addons'
import {
  CORE_ICON_RAIL_ITEMS,
  DEFAULT_ICON_RAIL_ORDER,
  addonViewRailId,
  moveIconRailItem,
  normalizeIconRailHidden,
  normalizeIconRailOrder
} from '../navigation/iconRailLayout'

const preferences = usePreferencesStore()
const addonsStore = useAddonsStore()
const draggingId = ref('')

const addonItems = computed(() => addonsStore.getContributions('views')
  .filter((entry) => entry?.contribution?.id && entry?.contribution?.title)
  .map((entry) => ({
    id: addonViewRailId(entry.contribution.id),
    label: entry.contribution.title,
    description: entry.contribution.description || 'Interactive addon workspace.',
    source: 'addon'
  })))

const availableItems = computed(() => [
  ...CORE_ICON_RAIL_ITEMS.map((item) => ({ ...item, source: 'core' })),
  ...addonItems.value
])
const availableIds = computed(() => availableItems.value.map((item) => item.id))
const orderedIds = computed(() => normalizeIconRailOrder(preferences.iconRailOrder, availableIds.value))
const hiddenIds = computed(() => normalizeIconRailHidden(preferences.iconRailHidden, availableIds.value))
const orderedItems = computed(() => {
  const byId = new Map(availableItems.value.map((item) => [item.id, item]))
  return orderedIds.value.map((id) => byId.get(id)).filter(Boolean)
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
.en-rail-layout-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.en-rail-layout-toolbar p, .en-rail-layout-footnote { margin: 0; color: var(--en-muted); font-size: 11px; line-height: 1.45; }
.en-rail-layout-toolbar button, .en-rail-layout-actions button { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--en-border); border-radius: 7px; color: var(--en-text); background: var(--en-surface); cursor: pointer; }
.en-rail-layout-toolbar button { gap: 6px; min-height: 30px; padding: 0 10px; font: inherit; font-size: 11px; }
.en-rail-layout-toolbar svg { width: 13px; height: 13px; }
.en-rail-layout-list { display: grid; border: 1px solid var(--en-border); border-radius: 10px; overflow: hidden; }
.en-rail-layout-item { min-height: 48px; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 6px 9px; background: var(--en-surface); }
.en-rail-layout-item + .en-rail-layout-item { border-top: 1px solid var(--en-border); }
.en-rail-layout-item.dragging { opacity: 0.48; }
.en-rail-layout-item.hidden .en-rail-layout-copy { opacity: 0.55; }
.en-rail-layout-grip { width: 16px; height: 16px; color: var(--en-muted); cursor: grab; }
.en-rail-layout-copy { min-width: 0; display: grid; gap: 2px; }
.en-rail-layout-copy strong { font-size: 12px; }
.en-rail-layout-copy span { overflow: hidden; color: var(--en-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.en-rail-layout-actions { display: flex; gap: 4px; }
.en-rail-layout-actions button { width: 28px; height: 28px; padding: 0; }
.en-rail-layout-actions button:hover:not(:disabled), .en-rail-layout-toolbar button:hover { background: var(--en-soft); }
.en-rail-layout-actions button:disabled { opacity: 0.35; cursor: default; }
.en-rail-layout-actions svg { width: 14px; height: 14px; }
@media (max-width: 720px) { .en-rail-layout-toolbar { align-items: flex-start; flex-direction: column; } }
</style>

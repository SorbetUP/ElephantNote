<template>
  <div
    class="en-sidebar-tree-node"
    :style="{ '--tree-depth': depth }"
  >
    <div
      v-if="entry.kind === 'folder' || entry.type === 'folder'"
      class="en-sidebar-tree-row"
      :class="{ active: isFolderActive }"
    >
      <button
        class="en-sidebar-tree-toggle"
        type="button"
        :aria-label="expanded ? `Collapse ${entry.title}` : `Expand ${entry.title}`"
        @click.stop="toggleExpanded"
      >
        <component
          :is="expanded ? ChevronDown : ChevronRight"
          class="en-sidebar-tree-chevron"
          :size="15"
        />
      </button>
      <button
        class="en-sidebar-tree-label"
        type="button"
        :title="entry.title"
        @click.stop="openFolder"
      >
        {{ entry.title }}
      </button>
      <span
        v-if="entry.count != null"
        class="en-sidebar-tree-count"
      >
        {{ entry.count }}
      </span>
      <button
        v-if="detachable"
        class="en-sidebar-tree-remove"
        type="button"
        :aria-label="`Remove ${entry.title} from sidebar`"
        title="Remove from sidebar"
        @click.stop="detachEntry(entry.path)"
      >
        <X :size="14" />
      </button>
    </div>
    <div
      v-else
      class="en-sidebar-tree-note"
      :class="{ active: activeNotePath === entry.path }"
      :title="entry.title"
    >
      <button
        class="en-sidebar-tree-label"
        type="button"
        @click.stop="openNote(entry)"
      >
        {{ entry.title }}
      </button>
      <span
        v-if="entry.count != null"
        class="en-sidebar-tree-count"
      >
        {{ entry.count }}
      </span>
      <button
        v-if="detachable"
        class="en-sidebar-tree-remove"
        type="button"
        :aria-label="`Remove ${entry.title} from sidebar`"
        title="Remove from sidebar"
        @click.stop="detachEntry(entry.path)"
      >
        <X :size="14" />
      </button>
    </div>
    <div
      v-if="expanded"
      class="en-sidebar-tree-children"
    >
      <SidebarTreeEntry
        v-for="child in children"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
        :active-path="activePath"
        :active-note-path="activeNotePath"
        :load-directory="loadDirectory"
        :open-directory="openDirectory"
        :open-note="openNote"
        :detach-entry="detachEntry"
        :detachable="detachable"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronRight, X } from '@lucide/vue'

defineOptions({ name: 'SidebarTreeEntry' })

const props = defineProps({
  entry: {
    type: Object,
    required: true
  },
  depth: {
    type: Number,
    default: 0
  },
  activePath: {
    type: String,
    default: ''
  },
  activeNotePath: {
    type: String,
    default: ''
  },
  loadDirectory: {
    type: Function,
    required: true
  },
  openDirectory: {
    type: Function,
    required: true
  },
  openNote: {
    type: Function,
    required: true
  },
  detachEntry: {
    type: Function,
    required: true
  },
  detachable: {
    type: Boolean,
    default: false
  }
})

const expanded = ref(false)
const loaded = ref(false)
const loading = ref(false)
const children = ref([])

const isFolderActive = computed(() => {
  const entryPath = props.entry?.path || ''
  return !!entryPath && (props.activePath === entryPath || props.activePath.startsWith(`${entryPath}/`))
})

const ensureChildren = async () => {
  if (loaded.value || loading.value) return
  loading.value = true
  try {
    children.value = await props.loadDirectory(props.entry.path)
    loaded.value = true
  } catch (err) {
    console.warn('Unable to load sidebar folder:', err)
    children.value = []
  } finally {
    loading.value = false
  }
}

const toggleExpanded = async () => {
  expanded.value = !expanded.value
  if (expanded.value) await ensureChildren()
}

const openFolder = async () => {
  await props.openDirectory(props.entry.path)
  expanded.value = true
  loaded.value = false
  await ensureChildren()
}

watch(isFolderActive, async (active) => {
  if (!active) return
  expanded.value = true
  await ensureChildren()
}, { immediate: true })
</script>

<style scoped>
.en-sidebar-tree-node {
  min-width: 0;
}

.en-sidebar-tree-row,
.en-sidebar-tree-note {
  width: 100%;
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 8px;
  padding: 0 10px 0 calc(10px + var(--tree-depth, 0) * 14px);
  color: var(--en-muted);
  background: transparent;
  font: inherit;
  text-align: left;
}

.en-sidebar-tree-row:hover .en-sidebar-tree-remove,
.en-sidebar-tree-note:hover .en-sidebar-tree-remove,
.en-sidebar-tree-remove:focus-visible {
  opacity: 1;
}

.en-sidebar-tree-row.active,
.en-sidebar-tree-note.active,
.en-sidebar-tree-row:hover,
.en-sidebar-tree-note:hover {
  color: var(--en-text);
  background: var(--en-soft);
}

.en-sidebar-tree-toggle {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  color: inherit;
  background: transparent;
}

.en-sidebar-tree-label,
.en-sidebar-tree-note {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-sidebar-tree-label {
  flex: 1;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
}

.en-sidebar-tree-remove {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  color: inherit;
  background: transparent;
  opacity: 0;
}

.en-sidebar-tree-remove:hover {
  color: var(--en-danger, #dc2626);
  background: var(--en-soft-strong, var(--en-soft));
}
</style>

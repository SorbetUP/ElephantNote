<template>
  <article
    class="en-card en-note-card"
    :class="{ 'is-featured': featured, 'is-pinned': isPinned }"
    draggable="true"
    @mouseenter="isHovering = true"
    @mouseleave="isHovering = false"
    @dragstart="handleDragStart"
    @click="$emit('open', entry)"
  >
    <div class="en-card-actions">
      <button
        class="en-card-pin-button"
        type="button"
        :class="{ visible: isPinned || isHovering }"
        :title="isPinned ? 'Unpin note' : 'Pin note'"
        :aria-label="isPinned ? 'Unpin note' : 'Pin note'"
        @click.stop.prevent="togglePin"
      >
        <Pin
          class="en-icon"
        />
      </button>
      <button
        class="en-card-menu"
        type="button"
        title="Delete note"
        aria-label="Delete note"
        @click.stop.prevent="toggleMenu"
      >
        <MoreHorizontal class="en-icon" />
      </button>
    </div>
    <div
      v-if="isMenuOpen"
      class="en-card-popover"
      @click.stop
    >
      <button
        type="button"
        @click="toggleSidebarVisibility"
      >
        <component
          :is="isSidebarVisible ? EyeOff : Eye"
          class="en-icon"
        />
        {{ isSidebarVisible ? 'Remove from sidebar' : 'Show in sidebar' }}
      </button>
      <button
        type="button"
        class="danger"
        @click="deleteEntry"
      >
        Delete
      </button>
    </div>
    <div class="en-note-card-head">
      <div class="en-note-card-title-row">
        <h3
          @dblclick.stop.prevent="renameEntry"
        >
          {{ title }}
        </h3>
      </div>
    </div>
    <p>{{ excerpt }}</p>
    <div class="en-tags">
      <span
        v-for="tag in entry.tags"
        :key="tag"
      >
        #{{ tag }}
      </span>
    </div>
    <footer>
      <span class="en-dot" />
      <span>{{ updated }}</span>
    </footer>
  </article>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Eye, EyeOff, MoreHorizontal, Pin } from '@lucide/vue'
import { useVaultStore } from '../stores/vaultStore'
import {
  getNoteCardExcerpt,
  getNoteCardTitle,
  getNoteCardUpdatedLabel
} from '../utils/noteCardView'

const props = defineProps({
  entry: {
    type: Object,
    required: true
  },
  featured: {
    type: Boolean,
    default: false
  }
})
const emit = defineEmits(['open', 'rename', 'delete'])

const store = useVaultStore()
const isMenuOpen = ref(false)
const isHovering = ref(false)

const title = computed(() => getNoteCardTitle(props.entry))
const updated = computed(() => getNoteCardUpdatedLabel(props.entry))
const excerpt = computed(() => getNoteCardExcerpt(props.entry))
const isPinned = computed(() => !!props.entry?.path && store.isEntryPinned(props.entry.path))
const isSidebarVisible = computed(() => !!props.entry?.path && store.isEntryVisibleInSidebar(props.entry.path))

const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value
}

const closeMenu = (event) => {
  if (!isMenuOpen.value) return
  if (event?.target?.closest?.('.en-note-card')) return
  isMenuOpen.value = false
}

const togglePin = () => {
  if (!props.entry?.path) return
  store.togglePinnedEntry(props.entry.path)
  isMenuOpen.value = false
}

const toggleSidebarVisibility = async () => {
  if (!props.entry?.path) return
  await store.toggleEntrySidebarVisibility(props.entry)
  isMenuOpen.value = false
}

const handleDragStart = (event) => {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
  }
  event.dataTransfer?.setData('application/x-elephantnote-entry', JSON.stringify({
    kind: 'note',
    path: props.entry.path,
    title: title.value
  }))
}

const renameEntry = () => {
  isMenuOpen.value = false
  emit('rename', props.entry)
}

const deleteEntry = () => {
  isMenuOpen.value = false
  emit('delete', props.entry)
}

onMounted(() => {
  window.addEventListener('click', closeMenu)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeMenu)
})
</script>

<style scoped>
.en-card {
  position: relative;
  min-height: 190px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 28px;
  color: var(--en-text);
  background: var(--en-bg);
  overflow: hidden;
}

.en-card:hover {
  border-color: var(--en-border-strong);
}

.en-card-actions {
  position: absolute;
  top: 18px;
  right: 18px;
  display: flex;
  gap: 10px;
}

.en-card-pin-button,
.en-card-menu {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  color: var(--en-muted);
  background: transparent;
}

.en-card-popover {
  position: absolute;
  top: 52px;
  right: 18px;
  z-index: 5;
  min-width: 190px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 8px;
  background: var(--en-surface);
}

.en-card-popover button {
  min-height: 34px;
  border: 0;
  color: var(--en-text);
  background: transparent;
  text-align: left;
}

.en-note-card h3 {
  max-width: calc(100% - 88px);
  margin: 0 0 8px;
  font-size: 30px;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.en-note-card p {
  margin: 0;
  color: color-mix(in srgb, var(--en-text) 90%, transparent);
  font-size: 18px;
  line-height: 1.35;
}

.en-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.en-tags span {
  color: var(--en-primary);
  font-size: 13px;
}

.en-note-card footer {
  position: absolute;
  left: 28px;
  bottom: 24px;
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--en-muted);
  font-size: 16px;
  font-weight: 700;
}

.en-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--en-primary);
}

.en-icon {
  width: 20px;
  height: 20px;
}
</style>

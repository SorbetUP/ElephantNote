<template>
  <header ref="rootRef" class="en-note-topbar" @click.stop>
    <div class="en-note-heading-block">
      <input
        class="en-note-title-input"
        type="text"
        :value="title"
        :placeholder="t('note.untitled')"
        :aria-label="t('note.titleLabel')"
        @change="$emit('update-title', $event.target.value)"
      >

      <div class="en-note-metadata-rail">
        <span v-if="noteDate" class="en-note-date-chip" :title="noteDate">
          <CalendarDays aria-hidden="true" />
          {{ noteDate }}
        </span>

        <template v-for="(tag, index) in visibleTags" :key="`${tag}-${index}`">
          <div v-if="localAddingTag && localEditingTag && localEditingIndex === index" class="en-note-chip-wrap">
            <note-tag-form
              :model-value="localTagDraft"
              :is-editing="true"
              @update:model-value="updateTagDraft"
              @submit="submitTag"
              @cancel="cancelTag"
            />
          </div>
          <button
            v-else
            class="en-note-chip"
            type="button"
            :title="displayTag(tag)"
            @click="startTagEdit(index, tag)"
            @contextmenu.prevent.stop="$emit('delete-tag', index)"
          >
            {{ displayTag(tag) }}
          </button>
        </template>

        <div v-if="hiddenTags.length" class="en-note-chip-wrap">
          <button
            class="en-note-chip en-note-chip-muted"
            type="button"
            :title="`${hiddenTags.length} tags`"
            @click="isHiddenTagsOpen = !isHiddenTagsOpen"
          >
            +{{ hiddenTags.length }}
          </button>
          <div v-if="isHiddenTagsOpen" class="en-note-chip-popover">
            <button
              v-for="(tag, index) in hiddenTags"
              :key="`${tag}-${index}`"
              type="button"
              @click="startHiddenTagEdit(index, tag)"
              @contextmenu.prevent.stop="$emit('delete-tag', index + visibleTags.length)"
            >
              {{ displayTag(tag) }}
            </button>
          </div>
        </div>

        <div class="en-note-chip-wrap">
          <button
            v-if="!localAddingTag"
            class="en-note-chip en-note-chip-add"
            type="button"
            :title="t('note.addTag')"
            :aria-label="t('note.addTag')"
            @click="startTagCreation"
          >
            <Plus aria-hidden="true" />
          </button>
          <note-tag-form
            v-else-if="!localEditingTag || localEditingIndex >= visibleTags.length"
            :model-value="localTagDraft"
            :is-editing="localEditingTag"
            @update:model-value="updateTagDraft"
            @submit="submitTag"
            @cancel="cancelTag"
          />
        </div>
      </div>
    </div>

    <div class="en-note-topbar-actions">
      <button
        class="en-note-action-button"
        :class="{ active: isPinned }"
        type="button"
        :title="isPinned ? t('note.unpin') : t('note.pin')"
        :aria-label="isPinned ? t('note.unpin') : t('note.pin')"
        @click="$emit('toggle-pin')"
      >
        <Pin aria-hidden="true" />
      </button>
      <button
        class="en-note-action-button"
        type="button"
        :title="t('note.close')"
        :aria-label="t('note.close')"
        @click="$emit('close')"
      >
        <X aria-hidden="true" />
      </button>
    </div>
  </header>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CalendarDays, Pin, Plus, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NoteTagForm from './NoteTagForm.vue'

const props = defineProps({
  title: { type: String, required: true },
  noteDate: { type: String, default: '' },
  tags: { type: Array, default: () => [] },
  showTagHash: { type: Boolean, default: true },
  isPinned: { type: Boolean, default: false },
  isAddingTag: { type: Boolean, default: false },
  isEditingTag: { type: Boolean, default: false },
  tagDraft: { type: String, default: '' }
})

const emit = defineEmits([
  'update-title',
  'toggle-pin',
  'close',
  'start-tag-creation',
  'edit-tag',
  'delete-tag',
  'submit-tag',
  'cancel-tag',
  'update-tag-draft'
])

const { t } = useI18n()
const rootRef = ref(null)
const localAddingTag = ref(props.isAddingTag)
const localEditingTag = ref(props.isEditingTag)
const localEditingIndex = ref(-1)
const localTagDraft = ref(props.tagDraft)
const isHiddenTagsOpen = ref(false)

const visibleTags = computed(() => props.tags.slice(0, 3))
const hiddenTags = computed(() => props.tags.slice(3))
const displayTag = (tag) => props.showTagHash ? `#${tag}` : tag

const focusFirstInput = async () => {
  await nextTick()
  rootRef.value?.querySelector?.('input[name="tag"]')?.focus?.()
}

const startTagCreation = () => {
  isHiddenTagsOpen.value = false
  localAddingTag.value = true
  localEditingTag.value = false
  localEditingIndex.value = -1
  localTagDraft.value = ''
  emit('start-tag-creation')
  emit('update-tag-draft', '')
  focusFirstInput()
}

const startTagEdit = (index, tag) => {
  isHiddenTagsOpen.value = false
  localAddingTag.value = true
  localEditingTag.value = true
  localEditingIndex.value = index
  localTagDraft.value = tag
  emit('edit-tag', index)
  emit('update-tag-draft', tag)
  focusFirstInput()
}

const startHiddenTagEdit = (index, tag) => {
  startTagEdit(index + visibleTags.value.length, tag)
}

const updateTagDraft = (value) => {
  localTagDraft.value = value
  emit('update-tag-draft', value)
}

const submitTag = (value = localTagDraft.value) => {
  localAddingTag.value = false
  localEditingTag.value = false
  localEditingIndex.value = -1
  emit('submit-tag', value)
}

const cancelTag = () => {
  localAddingTag.value = false
  localEditingTag.value = false
  localEditingIndex.value = -1
  localTagDraft.value = ''
  emit('cancel-tag')
}

const closeOnOutsideClick = (event) => {
  if (rootRef.value?.contains?.(event.target)) return
  isHiddenTagsOpen.value = false
}

onMounted(() => window.addEventListener('click', closeOnOutsideClick))
onBeforeUnmount(() => window.removeEventListener('click', closeOnOutsideClick))

watch(() => props.isAddingTag, (value) => {
  localAddingTag.value = value
})
watch(() => props.isEditingTag, (value) => {
  localEditingTag.value = value
  if (!value) localEditingIndex.value = -1
})
watch(() => props.tagDraft, (value) => {
  localTagDraft.value = value
})
</script>

<style scoped>
.en-note-topbar {
  position: relative;
  min-height: 82px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  padding: 12px var(--en-note-editor-gutter-right, var(--en-note-editor-gutter, 24px)) 11px var(--en-note-editor-gutter-left, var(--en-note-editor-gutter, 24px));
  color: var(--en-text);
  background: color-mix(in srgb, var(--en-bg) 92%, var(--en-surface));
  box-sizing: border-box;
  overflow: visible;
}

.en-note-topbar::after {
  content: '';
  position: absolute;
  left: var(--en-note-editor-gutter-left, var(--en-note-editor-gutter, 24px));
  right: var(--en-note-editor-gutter-right, var(--en-note-editor-gutter, 24px));
  bottom: 0;
  height: 1px;
  background: color-mix(in srgb, var(--en-border) 58%, transparent);
  pointer-events: none;
}

.en-note-heading-block {
  min-width: 0;
  display: grid;
  gap: 7px;
}

.en-note-title-input {
  width: min(100%, 780px);
  min-width: 120px;
  border: 0;
  padding: 0;
  color: var(--en-text);
  background: transparent;
  font: inherit;
  font-size: clamp(22px, 2.2vw, 30px);
  font-weight: 760;
  line-height: 1.12;
  letter-spacing: -0.035em;
  outline: none;
}

.en-note-title-input::placeholder { color: color-mix(in srgb, var(--en-muted) 64%, transparent); }

.en-note-metadata-rail,
.en-note-topbar-actions {
  display: flex;
  align-items: center;
  gap: 5px;
}

.en-note-metadata-rail {
  min-width: 0;
  flex-wrap: wrap;
}

.en-note-topbar-actions {
  align-self: start;
  padding-top: 4px;
  flex: 0 0 auto;
}

.en-note-chip-wrap { position: relative; display: inline-flex; align-items: center; }

.en-note-date-chip,
.en-note-chip,
.en-note-action-button {
  min-height: 28px;
  border: 1px solid color-mix(in srgb, var(--en-border) 88%, transparent);
  border-radius: 8px;
  color: var(--en-text);
  background: color-mix(in srgb, var(--en-surface) 52%, transparent);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.en-note-date-chip,
.en-note-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  white-space: nowrap;
}
.en-note-date-chip svg { width: 12px; height: 12px; }
.en-note-date-chip,
.en-note-chip-muted { color: var(--en-muted); }

.en-note-chip-add,
.en-note-action-button {
  width: 30px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.en-note-chip-add svg,
.en-note-action-button svg { width: 15px; height: 15px; }

.en-note-date-chip:hover,
.en-note-chip:hover,
.en-note-action-button:hover {
  border-color: var(--en-border-strong);
  background: var(--en-soft);
}

.en-note-action-button.active {
  border-color: color-mix(in srgb, #facc15 54%, var(--en-border));
  background: color-mix(in srgb, #facc15 9%, transparent);
  color: #d4a900;
}

.en-note-chip-popover {
  position: absolute;
  left: 0;
  top: calc(100% + 5px);
  z-index: 90;
  width: min(220px, calc(100vw - 24px));
  display: grid;
  gap: 3px;
  border: 1px solid var(--en-border);
  border-radius: 10px;
  padding: 5px;
  background: color-mix(in srgb, var(--en-surface) 95%, transparent);
  box-shadow: var(--en-card-shadow, 0 18px 44px rgba(0, 0, 0, 0.28));
  backdrop-filter: blur(14px);
}

.en-note-chip-popover button {
  min-height: 27px;
  border: 0;
  border-radius: 7px;
  padding: 0 7px;
  color: var(--en-text);
  background: transparent;
  font: inherit;
  font-size: 11px;
  text-align: left;
}
.en-note-chip-popover button:hover { background: var(--en-soft); }

:deep(.en-inline-tag-form) { display: inline-flex; align-items: center; gap: 4px; }
:deep(.en-inline-tag-form input),
:deep(.en-inline-tag-form button) {
  height: 28px;
  min-width: 0;
  border: 1px solid var(--en-border);
  border-radius: 7px;
  padding: 0 7px;
  color: var(--en-text);
  background: var(--en-surface);
  font: inherit;
  font-size: 11px;
}

@media (max-width: 720px) {
  .en-note-topbar {
    min-height: 76px;
    gap: 8px;
    padding-left: 16px;
    padding-right: 12px;
  }
  .en-note-topbar::after { left: 16px; right: 12px; }
  .en-note-title-input { font-size: 22px; }
  .en-note-date-chip { display: none; }
}
</style>

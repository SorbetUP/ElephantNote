<template>
  <footer class="en-note-footer">
    <div class="en-note-counts" aria-live="polite">
      <span><strong>{{ wordCount }}</strong> {{ t('common.words') }}</span>
      <span class="en-note-count-separator" aria-hidden="true" />
      <span><strong>{{ characterCount }}</strong> {{ t('common.characters') }}</span>
    </div>
    <div class="en-note-footer-actions">
      <button
        type="button"
        :title="t('note.openGraph')"
        :aria-label="t('note.openGraph')"
        @click="$emit('open-graph')"
      >
        <Share2 aria-hidden="true" />
        <span>{{ t('note.graph') }}</span>
      </button>
      <note-typography-menu
        :is-open="isTypographyOpen"
        @toggle="$emit('toggle-typography')"
        @set-text-scale="$emit('set-text-scale', $event)"
      />
      <button
        class="icon-only"
        type="button"
        :title="t('note.toggleTheme')"
        :aria-label="t('note.toggleTheme')"
        @click="$emit('toggle-theme')"
      >
        <component :is="themeIcon" aria-hidden="true" />
      </button>
    </div>
  </footer>
</template>

<script setup>
import { Share2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NoteTypographyMenu from './NoteTypographyMenu.vue'

const { t } = useI18n()

defineProps({
  wordCount: { type: Number, default: 0 },
  characterCount: { type: Number, default: 0 },
  isTypographyOpen: { type: Boolean, default: false },
  themeIcon: { type: [Object, Function, String], required: true }
})

defineEmits(['toggle-typography', 'set-text-scale', 'toggle-theme', 'open-graph'])
</script>

<style scoped>
.en-note-footer {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 var(--en-note-editor-gutter-right, 24px) 0 var(--en-note-editor-gutter-left, 24px);
  border-top: 1px solid color-mix(in srgb, var(--en-border) 62%, transparent);
  color: var(--en-muted);
  background: color-mix(in srgb, var(--en-bg) 90%, var(--en-surface));
  font-size: 10.5px;
}

.en-note-footer-actions,
.en-note-counts {
  display: flex;
  align-items: center;
}

.en-note-footer-actions { gap: 6px; }
.en-note-counts { gap: 8px; }
.en-note-counts strong { color: var(--en-text); font-weight: 650; }
.en-note-count-separator { width: 3px; height: 3px; border-radius: 50%; background: color-mix(in srgb, var(--en-muted) 60%, transparent); }

.en-note-footer-actions > button {
  min-width: 32px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid color-mix(in srgb, var(--en-border) 88%, transparent);
  border-radius: 8px;
  padding: 0 9px;
  color: var(--en-text);
  background: color-mix(in srgb, var(--en-surface) 52%, transparent);
  font: inherit;
  font-size: 10.5px;
  cursor: pointer;
}

.en-note-footer-actions > button.icon-only { width: 32px; padding: 0; }
.en-note-footer-actions button:hover { border-color: var(--en-border-strong); background: var(--en-soft); }
.en-note-footer-actions svg { width: 14px; height: 14px; }

@media (max-width: 620px) {
  .en-note-footer { padding: 0 12px; }
  .en-note-counts span:last-child,
  .en-note-count-separator,
  .en-note-footer-actions > button span { display: none; }
}
</style>

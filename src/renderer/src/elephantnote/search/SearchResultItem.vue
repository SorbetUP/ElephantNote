<template>
  <article class="en-search-result">
    <button
      class="en-search-result-main"
      type="button"
      @click="$emit('open', result)"
    >
      <div class="en-search-result-headline">
        <div class="en-search-result-title">
          <FileText class="en-search-result-icon" />
          <h3>{{ result.title }}</h3>
        </div>
        <span class="en-search-result-score">{{ scoreLabel }}</span>
      </div>
      <div class="en-search-result-path">
        {{ result.relativePath }}
      </div>
      <p
        v-for="(snippet, index) in snippets"
        :key="index"
        class="en-search-result-snippet"
      >
        {{ snippet }}
      </p>
      <div class="en-search-result-meta">
        <span>{{ matchLabel }}</span>
      </div>
    </button>
    <button
      class="en-search-result-open"
      type="button"
      title="Open note"
      @click="$emit('open', result)"
    >
      <ArrowUpRight />
    </button>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { ArrowUpRight, FileText } from '@lucide/vue'

defineEmits(['open'])

const props = defineProps({
  result: {
    type: Object,
    required: true
  }
})

const scoreLabel = computed(() => {
  const score = Number(props.result?.score || 0)
  if (score >= 0.85) return 'Very close'
  if (score >= 0.7) return 'Close'
  if (score >= 0.55) return 'Related'
  return 'Weak match'
})

const matchLabel = computed(() => {
  const matchType = String(props.result?.matchType || '').trim()
  if (matchType === 'hybrid') return 'Semantic + keyword'
  if (matchType === 'semantic') return 'Semantic'
  if (matchType === 'keyword') return 'Keyword'
  return 'Local match'
})

const snippets = computed(() => {
  return (props.result?.snippets || [])
    .map((snippet) => String(snippet?.text || '').trim())
    .filter(Boolean)
    .slice(0, 2)
})
</script>

<style scoped>
.en-search-result {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--en-border);
  border-radius: 16px;
  background: var(--en-surface);
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.en-search-result:hover,
.en-search-result:focus-within {
  border-color: color-mix(in srgb, var(--en-primary) 28%, var(--en-border));
  box-shadow: 0 14px 30px color-mix(in srgb, var(--en-primary) 8%, transparent);
  transform: translateY(-1px);
}

.en-search-result-main {
  display: grid;
  gap: 7px;
  min-width: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--en-text);
  text-align: left;
  cursor: pointer;
}

.en-search-result-headline {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.en-search-result-title {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.en-search-result-icon {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--en-primary);
}

.en-search-result h3 {
  margin: 0;
  min-width: 0;
  font-size: 15px;
  line-height: 1.3;
  font-weight: 800;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.en-search-result-score {
  flex: 0 0 auto;
  color: var(--en-muted);
  font-size: 12px;
  font-weight: 700;
}

.en-search-result-path {
  color: var(--en-primary);
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.en-search-result-snippet {
  margin: 0;
  color: var(--en-muted);
  font-size: 13px;
  line-height: 1.45;
}

.en-search-result-meta {
  color: var(--en-subtle);
  font-size: 12px;
  font-weight: 700;
  text-transform: capitalize;
}

.en-search-result-open {
  align-self: center;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border: 1px solid var(--en-border);
  border-radius: 12px;
  background: var(--en-soft);
  color: var(--en-text);
  cursor: pointer;
}

.en-search-result-open svg {
  width: 16px;
  height: 16px;
}

.en-search-result-open:hover,
.en-search-result-main:hover + .en-search-result-open {
  border-color: var(--en-primary);
  color: var(--en-primary);
}
</style>

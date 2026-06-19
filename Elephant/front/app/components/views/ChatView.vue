<template>
  <section class="en-chat-view">
    <header class="en-chat-header">
      <div class="en-chat-header-copy">
        <p class="en-chat-kicker">Semantic chat</p>
        <h1>Graph-aware local answers</h1>
        <p>
          Answers are grounded in local citations and can surface a compact wiki context for the
          selected notes.
        </p>
      </div>
      <div class="en-chat-header-meta">
        <span class="en-chat-chip">{{ messages.length }} turns</span>
        <span
          v-if="runtimeMessage"
          class="en-chat-chip en-chat-chip-active"
        >
          {{ runtimeMessage }}
        </span>
        <span
          v-if="graphPanel.summary.nodes"
          class="en-chat-chip"
        >
          {{ graphPanel.summary.nodes }} nodes
        </span>
        <span
          v-if="graphPanel.summary.semanticEdges"
          class="en-chat-chip"
        >
          {{ graphPanel.summary.semanticEdges }} semantic links
        </span>
      </div>
    </header>

    <section class="en-chat-context">
      <div class="en-chat-context-head">
        <div>
          <p class="en-chat-kicker">Semantic context</p>
          <h2>{{ activeContext?.source?.title || activeContext?.source?.path || 'Graph summary' }}</h2>
        </div>
        <span class="en-chat-chip">
          {{ graphPanel.summary.clusters }} clusters
        </span>
      </div>
      <p class="en-chat-context-summary">
        {{ activeContext?.source?.summary || 'The graph summary comes from the backend inspection payload.' }}
      </p>
      <div class="en-chat-context-meta">
        <span>{{ graphPanel.summary.semanticEdges }} semantic links</span>
        <span>{{ graphPanel.summary.structureEdges }} structure links</span>
        <span>{{ graphPanel.summary.sources }} cited sources</span>
        <span v-if="activeContext?.cluster">{{ activeContext.cluster.label }}</span>
      </div>
      <div
        v-if="graphPanel.clusters.length"
        class="en-chat-context-related"
      >
        <button
          v-for="cluster in graphPanel.clusters"
          :key="cluster.id || cluster.label"
          type="button"
          @click="sendQuickPrompt(`Focus on the ${cluster.label} cluster and explain the strongest semantic links.`)"
        >
          <strong>{{ cluster.label }}</strong>
          <small>{{ cluster.nodeCount }} notes</small>
        </button>
      </div>
    </section>

    <section class="en-chat-prompts">
      <button
        v-for="prompt in quickPrompts"
        :key="prompt.label"
        type="button"
        @click="sendQuickPrompt(prompt.prompt)"
      >
        <strong>{{ prompt.label }}</strong>
        <small>{{ prompt.hint }}</small>
      </button>
    </section>

    <div class="en-chat-log">
      <article
        v-for="message in messages"
        :key="message.id"
        class="en-chat-message"
        :class="[message.role, { 'has-context': message.wikiContext }]"
      >
        <header class="en-chat-message-head">
          <strong>{{ message.role === 'user' ? 'You' : 'Assistant' }}</strong>
          <span v-if="message.wikiContext?.graphSummary">
            {{ message.wikiContext.graphSummary.nodes }} nodes
          </span>
        </header>

        <p class="en-chat-message-body">
          {{ message.content }}
        </p>

        <section
          v-if="message.wikiContext"
          class="en-chat-message-context"
        >
          <p class="en-chat-kicker">Wiki context</p>
          <p>
            {{ message.wikiContext.source?.title || message.wikiContext.source?.path }}
          </p>
          <small>
            {{ message.wikiContext.graphSummary?.semanticLinks || 0 }} semantic links,
            {{ message.wikiContext.graphSummary?.clusters || 0 }} clusters
          </small>
        </section>

        <div
          v-if="message.citations?.length"
          class="en-chat-citations"
        >
          <button
            v-for="citation in message.citations"
            :key="citation.path"
            type="button"
            @click="openNote(citation.path, citation.title)"
          >
            {{ citation.title }}
          </button>
        </div>
      </article>
    </div>

    <form
      class="en-chat-form"
      @submit.prevent="send"
    >
      <input
        v-model.trim="draft"
        type="text"
        placeholder="Ask across your notes"
      >
      <button
        type="submit"
        :disabled="isSending || !draft"
      >
        {{ isSending ? 'Asking...' : 'Ask' }}
      </button>
    </form>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useVaultStore } from '../../stores/vaultStore'
import { useSearchStore } from '../../stores/searchStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { buildChatContextPanel } from './chatViewHelpers'

const store = useVaultStore()
const searchStore = useSearchStore()
const draft = ref('')
const isSending = ref(false)
const runtimeMessage = ref('')
const messages = ref([])
const graphPanel = computed(() => buildChatContextPanel({
  graph: searchStore.indexInspection?.graph
}))

const activeContext = computed(() => {
  const lastAssistant = [...messages.value]
    .reverse()
    .find((message) => message.role === 'assistant' && message.wikiContext)
  return lastAssistant?.wikiContext || null
})

const quickPrompts = computed(() => graphPanel.value.quickPrompts)

const pushMessage = (message) => {
  messages.value.push({
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...message
  })
}

const openNote = (value, fallbackTitle = '') => {
  const notePath = typeof value === 'string' ? value : value?.path || value?.relativePath || ''
  if (!notePath) return
  const note = [...store.entries, ...store.rootEntries, ...store.openedNotes]
    .find((entry) => entry?.path === notePath)
  if (note) {
    store.openNote(note)
    return
  }
  store.openNote({
    kind: 'note',
    type: 'note',
    path: notePath,
    title: fallbackTitle || notePath.split('/').pop()?.replace(/\.md$/i, '') || notePath
  })
}

const send = async () => {
  const question = draft.value
  if (!question) return
  draft.value = ''
  pushMessage({ role: 'user', content: question })
  isSending.value = true
  try {
    runtimeMessage.value = 'Searching notes and generating with local AI...'
    const result = await elephantnoteClient.rag.chat(question, 8)
    runtimeMessage.value = 'Answered with local RAG.'
    pushMessage({
      role: 'assistant',
      content: result?.answer || 'I did not find matching local notes.',
      citations: result?.citations || [],
      wikiContext: result?.wikiContext || null
    })
  } catch (error) {
    runtimeMessage.value = error instanceof Error ? error.message : 'Local AI chat failed.'
    pushMessage({
      role: 'assistant',
      content: runtimeMessage.value
    })
  } finally {
    isSending.value = false
  }
}

const sendQuickPrompt = async (prompt) => {
  draft.value = prompt
  await send()
}

onMounted(() => {
  searchStore.inspect().catch(() => {})
})
</script>

<style scoped>
.en-chat-view {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 14px;
  padding: 6px 28px 28px;
  overflow: hidden;
}

.en-chat-header,
.en-chat-context-head,
.en-chat-message-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.en-chat-header h1,
.en-chat-header p,
.en-chat-message p {
  margin: 0;
}

.en-chat-header-copy h1 {
  font-size: 28px;
  line-height: 1.1;
}

.en-chat-header-copy p:last-child,
.en-chat-context-summary,
.en-chat-message-body {
  color: var(--en-muted);
  line-height: 1.5;
}

.en-chat-kicker {
  margin-bottom: 6px !important;
  color: var(--en-muted);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 11px;
}

.en-chat-header-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.en-chat-chip {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  border: 1px solid var(--en-border);
  border-radius: 999px;
  color: var(--en-muted);
  background: var(--en-bg);
  font-size: 12px;
}

.en-chat-chip-active {
  color: var(--en-text);
  background: color-mix(in srgb, var(--en-primary) 10%, var(--en-bg));
}

.en-chat-context {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--en-border);
  border-radius: 18px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--en-primary) 8%, transparent), transparent 40%),
    color-mix(in srgb, var(--en-surface) 94%, transparent);
}

.en-chat-context h2 {
  margin: 0;
  font-size: 18px;
}

.en-chat-context-meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  color: var(--en-muted);
  font-size: 12px;
}

.en-chat-context-related {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
}

.en-chat-context-related button {
  display: grid;
  gap: 4px;
  justify-items: start;
  text-align: left;
  border: 1px solid var(--en-border);
  border-radius: 14px;
  padding: 10px 12px;
  color: var(--en-text);
  background: var(--en-bg);
}

.en-chat-context-related strong {
  font-size: 13px;
}

.en-chat-context-related small {
  color: var(--en-muted);
}

.en-chat-prompts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 720px) {
  .en-chat-prompts {
    grid-template-columns: 1fr;
  }
}

.en-chat-prompts button {
  display: grid;
  gap: 3px;
  border: 1px solid var(--en-border);
  border-radius: 14px;
  padding: 10px 12px;
  color: var(--en-text);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--en-primary) 7%, transparent), transparent 40%),
    var(--en-bg);
  text-align: left;
}

.en-chat-prompts strong {
  font-size: 13px;
}

.en-chat-prompts small {
  color: var(--en-muted);
}

.en-chat-log {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
}

.en-chat-message {
  max-width: min(720px, 92%);
  border: 1px solid var(--en-border);
  border-radius: 18px;
  padding: 14px 16px;
  background: var(--en-bg);
  box-shadow: 0 14px 42px color-mix(in srgb, #020617 8%, transparent);
}

.en-chat-message.user {
  align-self: flex-end;
  background: color-mix(in srgb, var(--en-primary) 8%, var(--en-bg));
}

.en-chat-message.assistant {
  align-self: flex-start;
}

.en-chat-message.has-context {
  border-color: color-mix(in srgb, var(--en-primary) 28%, var(--en-border));
}

.en-chat-message-head {
  margin-bottom: 10px;
}

.en-chat-message-head strong {
  font-size: 13px;
}

.en-chat-message-head span {
  color: var(--en-muted);
  font-size: 12px;
}

.en-chat-message-context {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--en-border);
}

.en-chat-message-context p {
  margin: 0;
}

.en-chat-message-context small {
  color: var(--en-muted);
}

.en-chat-citations {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.en-chat-citations button,
.en-chat-form button {
  min-height: 34px;
  border: 1px solid var(--en-border);
  border-radius: 12px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-surface, var(--en-bg));
}

.en-chat-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.en-chat-form input {
  min-width: 0;
  height: 42px;
  border: 1px solid var(--en-border);
  border-radius: 12px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-bg);
  font: inherit;
}

.en-chat-form button:disabled {
  opacity: 0.55;
}
</style>

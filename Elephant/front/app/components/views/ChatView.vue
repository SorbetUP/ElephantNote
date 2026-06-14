<template>
  <section class="en-chat-view">
    <header class="en-chat-header">
      <h1>Chat</h1>
      <p>Grounded answers from the active vault with local note citations.</p>
      <p
        v-if="runtimeMessage"
        class="en-chat-runtime"
      >
        {{ runtimeMessage }}
      </p>
    </header>

    <div class="en-chat-log">
      <article
        v-for="message in messages"
        :key="message.id"
        :class="`en-chat-message ${message.role}`"
      >
        <p>{{ message.content }}</p>
        <div
          v-if="message.citations?.length"
          class="en-chat-citations"
        >
          <button
            v-for="citation in message.citations"
            :key="citation.path"
            type="button"
            @click="store.openNote({ kind: 'note', path: citation.path, title: citation.title })"
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
import { ref } from 'vue'
import { useVaultStore } from '../../stores/vaultStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'

const store = useVaultStore()
const draft = ref('')
const isSending = ref(false)
const runtimeMessage = ref('')
const messages = ref([])

const pushMessage = (message) => {
  messages.value.push({
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...message
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
      citations: result?.citations || []
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
</script>

<style scoped>
.en-chat-view {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 18px;
  padding: 6px 28px 28px;
  overflow: hidden;
}

.en-chat-header h1,
.en-chat-header p,
.en-chat-message p {
  margin: 0;
}

.en-chat-header h1 {
  font-size: 28px;
  line-height: 1.15;
}

.en-chat-header p {
  margin-top: 6px;
  color: var(--en-muted);
}

.en-chat-runtime {
  overflow-wrap: anywhere;
  font-size: 12px;
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
  border-radius: 8px;
  padding: 14px;
  background: var(--en-bg);
}

.en-chat-message.user {
  align-self: flex-end;
  background: var(--en-soft);
}

.en-chat-message.assistant {
  align-self: flex-start;
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
  border-radius: 8px;
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
  height: 40px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-bg);
  font: inherit;
}

.en-chat-form button:disabled {
  opacity: 0.55;
}
</style>

<template>
  <section class="en-chat">
    <div
      v-if="historyOpen"
      class="en-chat-backdrop"
      @click="store.toggleChatHistory()"
    />

    <aside
      class="en-chat-history"
      :class="{ 'is-open': historyOpen }"
      aria-label="Chat history"
    >
      <header class="en-chat-history-head">
        <button
          type="button"
          class="en-icon-btn"
          aria-label="Close history"
          @click="store.toggleChatHistory()"
        >
          <X class="en-icon" />
        </button>
      </header>

      <div class="en-chat-history-actions">
        <button
          type="button"
          class="en-chat-history-row en-chat-history-row-primary"
          @click="startNewChat"
        >
          <Plus class="en-icon" />
          <span>New chat</span>
        </button>
      </div>

      <div class="en-chat-history-search">
        <input
          v-model.trim="chatStore.searchQuery"
          type="search"
          placeholder="Search conversations"
          spellcheck="false"
        >
      </div>

      <div class="en-chat-history-scroll">
        <p
          v-if="!chatStore.groupedConversations.length"
          class="en-chat-history-empty"
        >
          No conversations yet.
        </p>
        <section
          v-for="group in chatStore.groupedConversations"
          :key="group.id"
          class="en-chat-history-group"
        >
          <h3 class="en-chat-history-group-title">
            {{ group.label }}
          </h3>
          <button
            v-for="conversation in group.items"
            :key="conversation.id"
            type="button"
            class="en-chat-history-row en-chat-history-conversation"
            :class="{ active: conversation.id === chatStore.activeConversationId }"
            @click="chatStore.selectConversation(conversation.id)"
          >
            <MessageSquare class="en-icon" />
            <span class="en-chat-history-conversation-title">{{ conversation.title }}</span>
            <span
              class="en-chat-history-conversation-actions"
              @click.stop
            >
              <button
                type="button"
                class="en-icon-btn en-icon-btn-ghost"
                aria-label="Delete conversation"
                @click="chatStore.deleteConversation(conversation.id)"
              >
                <Trash2 class="en-icon" />
              </button>
            </span>
          </button>
        </section>
      </div>
    </aside>

    <section class="en-chat-main">
      <header class="en-chat-topbar">
        <button
          type="button"
          class="en-icon-btn"
          aria-label="Open chat history"
          @click="store.toggleChatHistory()"
        >
          <Menu class="en-icon" />
        </button>
        <div class="en-chat-topbar-title">
          <h2>{{ activeTitle || 'New chat' }}</h2>
          <small v-if="chatStore.runtimeMessage">{{ chatStore.runtimeMessage }}</small>
          <small v-else-if="graphSummary">{{ graphSummary }}</small>
        </div>
        <div class="en-chat-topbar-actions">
          <select
            v-model="selectedModel"
            class="en-chat-route-select"
            title="Modèle"
            @change="saveChatRoute"
          >
            <option
              v-for="model in availableModels"
              :key="model"
              :value="model"
            >
              {{ model }}
            </option>
          </select>
          <select
            v-model="reasoningEffort"
            class="en-chat-route-select en-chat-reasoning-select"
            title="Niveau de réflexion"
            @change="saveChatRoute"
          >
            <option value="low">
              Faible
            </option>
            <option value="medium">
              Moyen
            </option>
            <option value="high">
              Élevé
            </option>
          </select>
          <label
            class="en-chat-auto-approve"
            title="Approuver automatiquement les actions demandées"
          >
            <input
              v-model="autoApproveTools"
              type="checkbox"
              @change="persistAutoApprove"
            >
            <span>Auto</span>
          </label>
          <span
            v-if="chatStore.isSending"
            class="en-chat-status en-chat-status-pulse"
            aria-label="Assistant is working"
          />
          <button
            type="button"
            class="en-icon-btn"
            aria-label="Close chat"
            @click="store.closeChatSidebar()"
          >
            <X class="en-icon" />
          </button>
        </div>
      </header>

      <div
        ref="scrollRef"
        class="en-chat-scroll"
        @scroll="onScroll"
      >
        <section
          v-if="!chatStore.activeMessages.length"
          class="en-chat-empty"
        >
          <div class="en-chat-empty-head">
            <h1>Ask</h1>
            <p>Grounded answers from the active vault and semantic graph.</p>
          </div>
          <div class="en-chat-quick">
            <button
              v-for="prompt in quickPrompts"
              :key="prompt.label"
              type="button"
              class="en-chat-quick-row"
              @click="sendQuickPrompt(prompt.prompt)"
            >
              <span
                class="en-chat-quick-icon"
                :data-icon="prompt.icon"
              >
                <Sparkles
                  v-if="prompt.icon === 'graph'"
                  class="en-icon"
                />
                <Link
                  v-else-if="prompt.icon === 'link'"
                  class="en-icon"
                />
                <FileText
                  v-else-if="prompt.icon === 'doc'"
                  class="en-icon"
                />
                <BookOpen
                  v-else
                  class="en-icon"
                />
              </span>
              <span class="en-chat-quick-text">
                <strong>{{ prompt.label }}</strong>
                <small>{{ prompt.hint }}</small>
              </span>
            </button>
          </div>
        </section>

        <section
          v-else
          class="en-chat-thread"
        >
          <article
            v-for="message in chatStore.activeMessages"
            :key="message.id"
            class="en-chat-message"
            :class="[message.role]"
          >
            <header class="en-chat-message-head">
              <span
                class="en-chat-message-avatar"
                :data-role="message.role"
              >
                {{ message.role === 'user' ? 'U' : 'A' }}
              </span>
              <div class="en-chat-message-meta">
                <strong>{{ message.role === 'user' ? 'You' : 'Assistant' }}</strong>
                <small>{{ formatChatTimestamp(message.createdAt) }}</small>
              </div>
            </header>

            <div class="en-chat-message-body">
              <div
                v-if="message.streaming && !message.content"
                class="en-chat-thinking"
              >
                <LoaderCircle class="en-icon en-spin" />
                <span>{{ message.streamPhase || 'Raisonnement…' }}</span>
              </div>
              <template v-else>
                <p
                  v-for="(paragraph, index) in splitParagraphs(message.content)"
                  :key="`${message.id}-p-${index}`"
                >
                  {{ paragraph }}
                </p>
              </template>
              <small
                v-if="message.reasoningEffort && message.role === 'assistant'"
                class="en-chat-reasoning-meta"
              >
                Réflexion : {{ message.reasoningEffort }}
              </small>
            </div>

            <div
              v-if="message.toolCalls?.length"
              class="en-chat-tools"
            >
              <article
                v-for="tool in shapeToolCallsForAssistant(message.toolCalls)"
                :key="tool.id"
                class="en-chat-tool"
                :class="{ expanded: expandedTools[tool.id] }"
              >
                <button
                  type="button"
                  class="en-chat-tool-head"
                  @click="toggleTool(tool.id)"
                >
                  <span
                    class="en-chat-tool-status"
                    :data-status="tool.status"
                  />
                  <span class="en-chat-tool-name">{{ tool.name }}</span>
                  <span class="en-chat-tool-summary">{{ tool.summary }}</span>
                  <ChevronDown class="en-chat-tool-chevron" />
                </button>
                <div
                  v-if="expandedTools[tool.id]"
                  class="en-chat-tool-detail"
                >
                  <p class="en-chat-tool-detail-meta">
                    {{ tool.detail }}
                  </p>
                  <ul
                    v-if="tool.sources?.length"
                    class="en-chat-tool-sources"
                  >
                    <li
                      v-for="source in tool.sources"
                      :key="source.path"
                    >
                      <button
                        type="button"
                        @click="openNote(source.path, source.title)"
                      >
                        <strong>{{ source.title }}</strong>
                        <span>{{ source.excerpt }}</span>
                      </button>
                    </li>
                  </ul>
                </div>
              </article>
            </div>

            <div
              v-if="message.actions?.length"
              class="en-chat-actions"
            >
              <article
                v-for="entry in message.actions"
                :key="entry?.proposal?.id || JSON.stringify(entry)"
                class="en-chat-action-card"
              >
                <div class="en-chat-action-copy">
                  <strong>{{ actionLabel(entry) }}</strong>
                  <span>{{ actionSummary(entry) }}</span>
                  <small v-if="entry.error">{{ entry.error }}</small>
                </div>
                <div class="en-chat-action-controls">
                  <span class="en-chat-action-status">{{ actionStatus(entry) }}</span>
                  <template v-if="actionStatus(entry) === 'proposed'">
                    <button
                      type="button"
                      :disabled="entry.busy"
                      @click="executeAction(message, entry)"
                    >
                      Approuver
                    </button>
                    <button
                      type="button"
                      :disabled="entry.busy"
                      @click="rejectAction(message, entry)"
                    >
                      Refuser
                    </button>
                  </template>
                </div>
                <ul
                  v-if="actionSearchResults(entry).length"
                  class="en-chat-action-results"
                >
                  <li
                    v-for="result in actionSearchResults(entry)"
                    :key="`${result.relativePath}:${result.chunkId}`"
                  >
                    <button
                      type="button"
                      @click="openNote(result.relativePath, result.title)"
                    >
                      <strong>{{ result.title }}</strong>
                      <span>{{ result.excerpt }}</span>
                    </button>
                  </li>
                </ul>
              </article>
            </div>

            <div
              v-if="message.citations?.length"
              class="en-chat-citations"
            >
              <button
                v-for="(citation, index) in message.citations"
                :key="`${citation.path || citation.relativePath}:${citation.chunkId || index}`"
                type="button"
                class="en-chat-citation"
                @click="openNote(citation.path || citation.relativePath, citation.title)"
              >
                <span class="en-chat-citation-index">{{ index + 1 }}</span>
                <span>{{ citation.title || citation.path || citation.relativePath }}</span>
              </button>
            </div>
          </article>
        </section>
      </div>

      <form
        class="en-chat-composer"
        @submit.prevent="send"
      >
        <div class="en-chat-composer-capsule">
          <textarea
            ref="composerRef"
            v-model="draft"
            class="en-chat-composer-input"
            rows="1"
            placeholder="Ask"
            @input="autoGrowComposer"
            @keydown="onComposerKeydown"
          />
          <div class="en-chat-composer-controls">
            <button
              type="button"
              class="en-chat-composer-mode"
              @click="cycleChatMode"
            >
              <span>{{ chatModeLabel }}</span>
              <span class="en-chat-composer-caret">▾</span>
            </button>
            <button
              type="submit"
              class="en-chat-composer-send"
              :class="{ 'is-ready': canSend }"
              :disabled="!canSend"
              :aria-label="canSend ? 'Send' : 'Send (empty)'"
            >
              <ArrowUp class="en-icon" />
            </button>
          </div>
        </div>
      </form>
    </section>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  FileText,
  Link,
  LoaderCircle,
  Menu,
  MessageSquare,
  Plus,
  Sparkles,
  Trash2,
  X
} from '@lucide/vue'
import { useVaultStore } from '../../stores/vaultStore'
import { useSearchStore } from '../../stores/searchStore'
import { useChatStore } from '../../stores/chatStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import {
  buildChatContextPanel,
  formatChatTimestamp,
  shapeToolCallsForAssistant
} from './chatViewHelpers'

const store = useVaultStore()
const searchStore = useSearchStore()
const chatStore = useChatStore()

const draft = ref('')
const composerRef = ref(null)
const scrollRef = ref(null)
const expandedTools = ref({})
const stickToBottom = ref(true)
const activeAiConfig = ref(null)
const selectedModel = ref('')
const reasoningEffort = ref('medium')
const codexModels = ref([])
const autoApproveTools = ref(window.localStorage.getItem('elephantnote:chat:auto-approve') === 'true')
let activeStream = null
let unlistenChatStream = null

const availableModels = computed(() => {
  const values = new Set(codexModels.value)
  if (selectedModel.value) values.add(selectedModel.value)
  return [...values]
})

const graphPanel = computed(() =>
  buildChatContextPanel({ graph: searchStore.indexInspection?.graph })
)
const quickPrompts = computed(() => graphPanel.value.quickPrompts)
const historyOpen = computed(() => store.chatHistoryOpen)
const activeTitle = computed(() => chatStore.activeConversation?.title || '')
const graphSummary = computed(() => {
  const summary = graphPanel.value.summary
  if (!summary) return ''
  const parts = []
  if (summary.nodes) parts.push(`${summary.nodes} nodes`)
  if (summary.semanticEdges) parts.push(`${summary.semanticEdges} semantic links`)
  return parts.join(' · ')
})

const canSend = computed(() => Boolean(draft.value.trim()) && !chatStore.isSending)
const chatModeLabel = computed(() => {
  const mode = store.chatMode
  if (mode === 'simple') return 'Simple'
  if (mode === 'graph') return 'Graph-aware'
  return 'Advanced'
})

const startNewChat = () => {
  chatStore.createConversation()
  draft.value = ''
  nextTick(scrollToBottom)
}

const cycleChatMode = () => {
  const modes = ['advanced', 'graph', 'simple']
  const index = modes.indexOf(store.chatMode)
  store.setChatMode(modes[(index + 1) % modes.length])
}

const toggleTool = (id) => {
  expandedTools.value = { ...expandedTools.value, [id]: !expandedTools.value[id] }
}

const splitParagraphs = (content) => {
  if (!content) return ['']
  return String(content)
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean)
}

const autoGrowComposer = () => {
  const element = composerRef.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, 168)}px`
}

const onComposerKeydown = (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    if (canSend.value) send()
  }
}

const onScroll = () => {
  const element = scrollRef.value
  if (!element) return
  stickToBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight < 80
}

const scrollToBottom = async(force = false) => {
  await nextTick()
  const element = scrollRef.value
  if (!element || (!force && !stickToBottom.value)) return
  element.scrollTop = element.scrollHeight
}

const openNote = async(path, title) => {
  if (!path) return
  try {
    await store.openFileByRelativePath?.(path)
  } catch {
    chatStore.setRuntimeMessage(`Unable to open ${title || path}.`)
  }
}

const normalizeModelEntry = (entry) => {
  if (typeof entry === 'string') return entry
  return entry?.id || entry?.model || entry?.slug || entry?.name || ''
}

const readCodexModels = async() => {
  try {
    const result = await elephantnoteClient.ai.codexModels()
    codexModels.value = (Array.isArray(result) ? result : result?.models || [])
      .map(normalizeModelEntry)
      .filter(Boolean)
  } catch {
    codexModels.value = []
  }
}

const readAiConfig = async() => {
  const config = await elephantnoteClient.ai.configRead()
  activeAiConfig.value = config || {}
  const route = activeAiConfig.value?.routes?.chat || {}
  selectedModel.value = route.model || 'gpt-5.6-luna'
  reasoningEffort.value = route.reasoningEffort || 'medium'
}

const saveChatRoute = async() => {
  const config = JSON.parse(JSON.stringify(activeAiConfig.value || {}))
  config.routes ||= {}
  config.routes.chat ||= {}
  config.routes.chat.source = 'codex'
  config.routes.chat.provider = 'codex'
  config.routes.chat.transport = 'codex'
  config.routes.chat.endpoint = 'codex://app-server'
  config.routes.chat.model = selectedModel.value
  config.routes.chat.reasoningEffort = reasoningEffort.value
  config.routes.chat.enableRag = true
  config.routes.chat.enableTools = true
  config.routes.chat.stream = true
  activeAiConfig.value = await elephantnoteClient.ai.configWrite(config)
}

const persistAutoApprove = () => {
  window.localStorage.setItem('elephantnote:chat:auto-approve', String(autoApproveTools.value))
}

const handleStreamEvent = (event) => {
  const payload = event?.payload || event || {}
  if (!activeStream || (payload.streamId && payload.streamId !== activeStream.streamId)) return
  if (payload.delta) {
    const message = chatStore.activeMessages.find((entry) => entry.id === activeStream.messageId)
    chatStore.updateMessage(activeStream.messageId, { content: `${message?.content || ''}${payload.delta}`, streamPhase: '' })
    scrollToBottom()
  }
  if (payload.phase) chatStore.updateMessage(activeStream.messageId, { streamPhase: payload.phase })
}

const invokeProposal = async(command, proposalId) => elephantnoteClient.core.invoke(command, { proposalId })

const persistActionPatch = (message, entry, patch) => {
  const targetId = entry?.proposal?.id
  const actions = (message.actions || []).map((candidate) => candidate?.proposal?.id === targetId ? { ...candidate, ...patch } : candidate)
  chatStore.updateMessage(message.id, { actions })
}

const actionStatus = (entry) => entry?.proposal?.status || 'unknown'
const actionLabel = (entry) => {
  const labels = {
    search_notes: 'Rechercher dans les notes',
    create_note: 'Créer une note',
    append_to_note: 'Ajouter à une note',
    replace_note: 'Mettre à jour une note',
    replace_note_range: 'Modifier un passage',
    add_wiki_suggestion: 'Améliorer ou proposer un Wiki',
    create_wiki: 'Générer un Wiki',
    reject_wiki_suggestion: 'Refuser une proposition de Wiki',
    delete_wiki: 'Supprimer un Wiki'
  }
  return labels[entry?.proposal?.action?.action] || 'Action Elephant'
}

const actionSummary = (entry) => {
  const action = entry?.proposal?.action || {}
  return action.relativePath || action.title || action.topic || action.query || action.draftId || ''
}

const actionSearchResults = (entry) => {
  if (entry?.proposal?.action?.action !== 'search_notes') return []
  const result = entry?.execution?.result
  return Array.isArray(result) ? result : []
}

const executeAction = async(message, entry) => {
  const id = entry?.proposal?.id
  if (!id || entry.busy) return
  persistActionPatch(message, entry, { busy: true, error: '' })
  try {
    const execution = await invokeProposal('tauri_knowledge_chat_action_execute', id)
    persistActionPatch(message, entry, { busy: false, proposal: execution.proposal, execution })
    await refreshAfterAction()
  } catch (error) {
    persistActionPatch(message, entry, { busy: false, error: error instanceof Error ? error.message : String(error) })
  }
}

const rejectAction = async(message, entry) => {
  const id = entry?.proposal?.id
  if (!id || entry.busy) return
  persistActionPatch(message, entry, { busy: true, error: '' })
  try {
    const proposal = await invokeProposal('tauri_knowledge_chat_action_reject', id)
    persistActionPatch(message, entry, { busy: false, proposal })
    await refreshAfterAction()
  } catch (error) {
    persistActionPatch(message, entry, { busy: false, error: error instanceof Error ? error.message : String(error) })
  }
}

const refreshAfterAction = async() => {
  await Promise.allSettled([
    searchStore.refreshIndexInspection?.(),
    window.dispatchEvent(new CustomEvent('elephantnote:wiki-refresh'))
  ])
}

const appendConversationTranscript = () => chatStore.activeMessages.map((message) => ({ role: message.role, content: message.content }))

const send = async() => {
  const query = draft.value.trim()
  if (!query || chatStore.isSending) return
  chatStore.setSending(true)
  chatStore.setRuntimeMessage('')
  chatStore.addMessage('user', query)
  const assistantMessage = chatStore.addMessage('assistant', '', { streaming: true, streamPhase: 'Recherche et raisonnement…', actions: [], citations: [] })
  activeStream = { streamId: `chat-${Date.now()}-${assistantMessage.id}`, messageId: assistantMessage.id }
  draft.value = ''
  autoGrowComposer()
  stickToBottom.value = true
  scrollToBottom(true)
  try {
    const result = await elephantnoteClient.ai.chat({
      query,
      messages: appendConversationTranscript(),
      streamId: activeStream.streamId,
      model: selectedModel.value,
      reasoningEffort: reasoningEffort.value,
      autoApproveTools: autoApproveTools.value,
      mode: store.chatMode,
      limit: 8,
      aiConfig: activeAiConfig.value
    })
    chatStore.updateMessage(assistantMessage.id, {
      content: result?.answer || 'No response.',
      streaming: false,
      citations: Array.isArray(result?.citations) ? result.citations : [],
      actions: Array.isArray(result?.actions) ? result.actions : [],
      toolCalls: Array.isArray(result?.toolCalls) ? result.toolCalls : [],
      streamPhase: '',
      reasoningEffort: result?.reasoningEffort || reasoningEffort.value
    })
    // Auto mode is executed atomically by the Rust backend before this response arrives.
  } catch (error) {
    chatStore.setRuntimeMessage(error instanceof Error ? error.message : 'Local AI chat failed.')
    chatStore.updateMessage(assistantMessage.id, { content: chatStore.runtimeMessage, streaming: false, streamPhase: '' })
  } finally {
    chatStore.setSending(false)
    activeStream = null
    scrollToBottom(true)
  }
}

const sendQuickPrompt = (value) => {
  draft.value = value
  nextTick(() => {
    autoGrowComposer()
    send()
  })
}

watch(() => chatStore.activeMessages.length, () => scrollToBottom())

onMounted(async() => {
  await Promise.allSettled([readAiConfig(), readCodexModels()])
  try {
    const { listen } = await import('@tauri-apps/api/event')
    unlistenChatStream = await listen('elephantnote://chat-stream', handleStreamEvent)
  } catch {
    unlistenChatStream = null
  }
})

onBeforeUnmount(() => {
  if (typeof unlistenChatStream === 'function') unlistenChatStream()
})
</script>

<style scoped>
.en-chat {
  --chat-surface: color-mix(in srgb, var(--en-bg) 82%, var(--en-text) 18%);
  --chat-surface-hover: color-mix(in srgb, var(--en-bg) 72%, var(--en-text) 28%);
  --chat-surface-active: color-mix(in srgb, var(--en-bg) 62%, var(--en-text) 38%);
  --chat-border: color-mix(in srgb, var(--en-text) 16%, transparent);
  --chat-text: var(--en-text);
  --chat-text-secondary: color-mix(in srgb, var(--en-text) 72%, var(--en-bg) 28%);
  --chat-text-muted: color-mix(in srgb, var(--en-text) 54%, var(--en-bg) 46%);
  --chat-accent: var(--en-primary);
  --chat-accent-hover: color-mix(in srgb, var(--en-primary) 84%, white 16%);
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  overflow: hidden;
  background: var(--en-bg);
  color: var(--en-text);
}

.en-chat * {
  box-sizing: border-box;
}

.en-chat-backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--en-bg) 60%, transparent);
  z-index: 30;
  border: 0;
  padding: 0;
}

.en-chat-history {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: min(260px, 80%);
  z-index: 40;
  display: flex;
  flex-direction: column;
  background: var(--en-bg);
  border-right: 1px solid var(--en-border);
  transform: translateX(-100%);
  transition: transform 0.22s ease;
}

.en-chat-history.is-open {
  transform: translateX(0);
}

.en-chat-history-head {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 18px 18px 10px;
}

.en-chat-history-actions {
  display: grid;
  gap: 4px;
  padding: 4px 14px 10px;
}

.en-chat-history-search {
  padding: 0 14px 12px;
}

.en-chat-history-search input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--en-border);
  border-radius: 10px;
  background: var(--en-surface);
  color: var(--en-text);
  font: inherit;
  font-size: 13px;
}

.en-chat-history-search input::placeholder {
  color: var(--chat-text-muted);
}

.en-chat-history-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 14px 14px;
}

.en-chat-history-empty {
  margin: 20px 6px;
  color: var(--chat-text-muted);
  font-size: 13px;
}

.en-chat-history-group + .en-chat-history-group {
  margin-top: 16px;
}

.en-chat-history-group-title {
  margin: 0 6px 6px;
  color: var(--chat-text-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.en-chat-history-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 10px;
  border-radius: 10px;
  color: var(--en-text);
  background: transparent;
  border: 0;
  text-align: left;
  font-size: 13px;
  line-height: 1.3;
}

.en-chat-history-row:hover {
  background: var(--en-soft);
}

.en-chat-history-row.active {
  background: var(--chat-surface);
}

.en-chat-history-row-primary {
  background: var(--chat-surface);
  margin-bottom: 6px;
  font-weight: 500;
}

.en-chat-history-conversation-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-chat-history-conversation-actions {
  display: none;
  gap: 4px;
}

.en-chat-history-conversation:hover .en-chat-history-conversation-actions,
.en-chat-history-conversation.active .en-chat-history-conversation-actions {
  display: inline-flex;
}

.en-chat-main {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: var(--en-bg);
}

.en-chat-topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 12px 14px 10px;
  background: var(--en-bg);
  border-bottom: 1px solid color-mix(in srgb, var(--en-border) 65%, transparent);
}

.en-chat-topbar-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}

.en-chat-topbar-title h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--en-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-chat-topbar-title small {
  display: block;
  max-width: 100%;
  margin-top: 2px;
  overflow: hidden;
  color: var(--en-muted);
  font-size: 11px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-chat-topbar-actions {
  flex: 0 0 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.en-chat-status {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--en-primary);
}

.en-chat-status-pulse {
  animation: en-chat-pulse 1.1s ease-in-out infinite;
}

@keyframes en-chat-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

.en-icon-btn {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 10px;
  color: var(--en-text);
  background: transparent;
  cursor: pointer;
}

.en-icon-btn:hover {
  background: var(--en-soft);
}

.en-icon-btn-ghost {
  width: 26px;
  height: 26px;
  color: var(--en-muted);
  background: transparent;
}

.en-icon-btn-ghost:hover {
  color: var(--en-text);
  background: var(--en-soft);
}

.en-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.en-chat-history-row .en-icon {
  color: var(--en-muted);
}

.en-chat-scroll {
  min-height: 0;
  overflow-y: auto;
  padding: 10px 0 20px;
  scroll-behavior: smooth;
}

.en-chat-empty {
  display: flex;
  flex-direction: column;
  gap: 26px;
  padding: 10vh 22px 20px;
  color: var(--en-text);
}

.en-chat-empty-head h1 {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.en-chat-empty-head p {
  margin: 0;
  color: var(--en-muted);
  font-size: 13px;
}

.en-chat-quick {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.en-chat-quick-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 0;
  border-radius: 12px;
  color: var(--en-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.en-chat-quick-row:hover {
  background: var(--en-soft);
}

.en-chat-quick-icon {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: var(--en-text);
  background: var(--en-soft);
}

.en-chat-quick-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.en-chat-quick-text strong {
  font-size: 13px;
  font-weight: 500;
}

.en-chat-quick-text small {
  overflow: hidden;
  color: var(--en-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-chat-thread {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 6px 18px 20px;
}

.en-chat-message {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 100%;
}

.en-chat-message.user {
  align-self: flex-end;
  width: min(84%, 560px);
  padding: 12px 14px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--en-primary) 26%, var(--en-surface));
}

.en-chat-message.assistant {
  width: 100%;
}

.en-chat-message-head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.en-chat-message-avatar {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--chat-surface-active);
  color: var(--en-text);
  font-size: 11px;
  font-weight: 700;
}

.en-chat-message-avatar[data-role='user'] {
  background: var(--en-primary);
  color: #fff;
}

.en-chat-message-meta {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.en-chat-message-meta strong {
  font-size: 12px;
  font-weight: 600;
}

.en-chat-message-meta small {
  color: var(--en-muted);
  font-size: 10px;
}

.en-chat-message-body {
  color: var(--en-text);
  font-size: 14px;
  line-height: 1.65;
}

.en-chat-message-body p {
  margin: 0;
  white-space: pre-wrap;
}

.en-chat-message-body p + p {
  margin-top: 9px;
}

.en-chat-tools {
  display: grid;
  gap: 6px;
}

.en-chat-tool {
  overflow: hidden;
  border: 1px solid var(--en-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--en-surface) 82%, transparent);
}

.en-chat-tool-head {
  width: 100%;
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 0;
  color: var(--en-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.en-chat-tool-head:hover {
  background: var(--en-soft);
}

.en-chat-tool-status {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--en-muted);
}

.en-chat-tool-status[data-status='running'] {
  background: var(--en-primary);
  animation: en-chat-pulse 1.1s ease-in-out infinite;
}

.en-chat-tool-status[data-status='done'] {
  background: #4ade80;
}

.en-chat-tool-name {
  font-size: 12px;
  font-weight: 500;
}

.en-chat-tool-summary {
  flex: 1;
  min-width: 0;
  color: var(--en-muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-chat-tool-chevron {
  width: 15px;
  height: 15px;
  color: var(--en-muted);
  transition: transform 0.18s ease;
}

.en-chat-tool.expanded .en-chat-tool-chevron {
  transform: rotate(180deg);
}

.en-chat-tool-detail {
  padding: 0 11px 11px;
  border-top: 1px solid var(--en-border);
}

.en-chat-tool-detail-meta {
  margin: 8px 0;
  color: var(--en-muted);
  font-size: 11px;
}

.en-chat-tool-detail-meta code {
  background: var(--en-soft);
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 11px;
}

.en-chat-tool-sources {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.en-chat-actions { display: grid; gap: 8px; margin-top: 12px; }
.en-chat-action-card { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid color-mix(in srgb, var(--en-primary) 38%, var(--en-border)); border-radius: 12px; background: color-mix(in srgb, var(--en-primary) 7%, var(--en-surface)); }
.en-chat-action-copy { min-width: 0; flex: 1; display: grid; gap: 3px; }
.en-chat-action-copy span, .en-chat-action-copy small { color: var(--en-muted); font-size: 12px; }
.en-chat-action-copy small { color: #ef4444; }
.en-chat-action-controls { display: flex; align-items: center; gap: 7px; }
.en-chat-action-controls button { min-height: 30px; padding: 0 10px; border: 1px solid var(--en-border); border-radius: 8px; background: var(--en-surface); color: var(--en-text); }
.en-chat-action-status { color: var(--en-muted); font-size: 11px; text-transform: capitalize; }

.en-chat-citations {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.en-chat-citation {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 5px 9px;
  border: 1px solid var(--en-border);
  border-radius: 9px;
  color: var(--en-text);
  background: color-mix(in srgb, var(--en-bg) 60%, transparent);
  font-size: 11px;
  cursor: pointer;
}

.en-chat-citation:hover {
  background: var(--en-soft);
}

.en-chat-citation span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-chat-citation-index {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  background: var(--chat-surface-active);
  color: var(--en-text);
  font-size: 10px;
  font-weight: 700;
}

.en-chat-composer {
  padding: 6px 18px 18px;
  background: var(--en-bg);
}

.en-chat-composer-capsule {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--en-border);
  border-radius: 22px;
  background: var(--chat-surface);
}

.en-chat-composer-input {
  min-width: 0;
  min-height: 36px;
  max-height: 168px;
  border: 0;
  background: transparent;
  color: var(--en-text);
  font: inherit;
  font-size: 14px;
  line-height: 1.45;
  resize: none;
  padding: 8px 4px;
  overflow-y: auto;
  scrollbar-width: none;
}

.en-chat-composer-input::-webkit-scrollbar {
  display: none;
}

.en-chat-composer-input::placeholder {
  color: var(--en-muted);
}

.en-chat-composer-input:focus {
  outline: none;
}

.en-chat-composer-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.en-chat-composer-mode {
  height: 34px;
  padding: 0 11px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 10px;
  color: var(--en-muted);
  background: transparent;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.en-chat-composer-mode:hover {
  background: var(--en-soft);
  color: var(--en-text);
}

.en-chat-composer-caret {
  font-size: 10px;
  opacity: 0.7;
}

.en-chat-composer-send {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 12px;
  color: #ffffff;
  background: var(--chat-surface-active);
  cursor: pointer;
  transition:
    background 0.18s ease,
    transform 0.18s ease;
}

.en-chat-composer-send.is-ready {
  background: var(--en-primary);
}

.en-chat-composer-send.is-ready:hover {
  background: var(--chat-accent-hover);
  transform: translateY(-1px);
}

.en-chat-composer-send:disabled {
  cursor: default;
}

.en-chat-composer-send .en-icon {
  width: 17px;
  height: 17px;
}

.en-chat-scroll,
.en-chat-history-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--en-border) transparent;
}

.en-chat-scroll::-webkit-scrollbar,
.en-chat-history-scroll::-webkit-scrollbar {
  width: 7px;
}

.en-chat-scroll::-webkit-scrollbar-thumb,
.en-chat-history-scroll::-webkit-scrollbar-thumb {
  background: var(--en-border);
  border-radius: 999px;
}

.en-chat-scroll::-webkit-scrollbar-thumb:hover,
.en-chat-history-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--en-border-strong, var(--en-border));
}

@media (max-width: 720px) {
  .en-chat-empty {
    padding: 6vh 16px 20px;
  }

  .en-chat-thread {
    padding: 6px 12px 20px;
  }

  .en-chat-composer {
    padding: 6px 12px 14px;
  }

  .en-chat-topbar {
    padding: 10px 10px 8px;
  }

  .en-chat-topbar-title small {
    display: none;
  }

  .en-chat-route-select {
    max-width: 112px;
  }

  .en-chat-reasoning-select {
    max-width: 82px;
  }
}

@media (max-width: 560px) {
  .en-chat-topbar-title {
    display: none;
  }

  .en-chat-topbar-actions {
    flex: 1 1 auto;
    justify-content: flex-end;
  }

  .en-chat-route-select {
    min-width: 0;
    width: min(36vw, 132px);
  }

  .en-chat-reasoning-select {
    width: min(24vw, 86px);
  }
}
</style>


<style scoped>
.en-chat-route-select { min-width: 104px; max-width: 148px; height: 32px; border: 1px solid var(--chat-border); border-radius: 9px; background: var(--chat-surface); color: var(--chat-text); padding: 0 26px 0 9px; font-size: 12px; text-overflow: ellipsis; }
.en-chat-reasoning-select { min-width: 76px; max-width: 92px; }
.en-chat-auto-approve { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 9px; border: 1px solid var(--chat-border); border-radius: 9px; font-size: 12px; color: var(--chat-text-secondary); white-space: nowrap; }
.en-chat-thinking { display: inline-flex; align-items: center; gap: 8px; color: var(--chat-text-secondary); min-height: 28px; }
.en-spin { animation: en-chat-spin 0.9s linear infinite; }
@keyframes en-chat-spin { to { transform: rotate(360deg); } }
.en-chat-reasoning-meta { display: block; margin-top: 8px; color: var(--chat-text-muted); }
.en-chat-action-results { grid-column: 1 / -1; display: grid; gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
.en-chat-action-results button { width: 100%; display: grid; gap: 3px; text-align: left; border: 1px solid var(--chat-border); border-radius: 9px; background: color-mix(in srgb, var(--chat-surface) 88%, transparent); color: var(--chat-text); padding: 9px 10px; }
.en-chat-action-results span { color: var(--chat-text-secondary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    if old not in text:
        raise SystemExit(f"missing patch anchor in {path}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1))


replace_once(
    "Elephant/frontend/app/services/elephantnoteClient/domainClients.js",
    """const normalizeRagChatPayload = (payload, limit = 6) => {
  if (payload && typeof payload === 'object') {
    return {
      message: String(payload.message || '').trim(),
      limit: Number.isFinite(Number(payload.limit)) ? Number(payload.limit) : limit,
      messages: Array.isArray(payload.messages) ? payload.messages : []
    }
  }
  return {
    message: String(payload || '').trim(),
    limit,
    messages: []
  }
}
""",
    """const normalizeRagChatPayload = (payload, limit = 6) => {
  if (payload && typeof payload === 'object') {
    return {
      ...payload,
      message: String(payload.message || '').trim(),
      limit: Number.isFinite(Number(payload.limit)) ? Number(payload.limit) : limit,
      messages: Array.isArray(payload.messages) ? payload.messages : []
    }
  }
  return {
    message: String(payload || '').trim(),
    limit,
    messages: []
  }
}
""",
)

replace_once(
    "Elephant/frontend/app/components/views/AtomicGraphView.vue",
    "const filterOrphans = ref(false)",
    "const filterOrphans = ref(true)",
)

codex_path = Path("Elephant/backend/tauri/src/chat_runtime/codex_app_server.rs")
codex = codex_path.read_text()
codex = codex.replace(
    """pub async fn chat_with_effort(
    app: &AppHandle,
    model: &str,
    prompt: &str,
    reasoning_effort: Option<&str>,
) -> R<CodexChatResult> {
    let started = Instant::now();
""",
    """pub async fn chat_with_effort(
    app: &AppHandle,
    model: &str,
    prompt: &str,
    reasoning_effort: Option<&str>,
) -> R<CodexChatResult> {
    chat_with_effort_streaming(app, model, prompt, reasoning_effort, None).await
}

pub async fn chat_with_effort_streaming(
    app: &AppHandle,
    model: &str,
    prompt: &str,
    reasoning_effort: Option<&str>,
    stream_id: Option<&str>,
) -> R<CodexChatResult> {
    let started = Instant::now();
""",
    1,
)
codex = codex.replace(
    """            \"item/agentMessage/delta\" => {
                delta_count += 1;
                answer.push_str(delta_text(&event));
            }
""",
    """            \"item/agentMessage/delta\" => {
                delta_count += 1;
                let delta = delta_text(&event);
                answer.push_str(delta);
                if let Some(stream_id) = stream_id {
                    let _ = app.emit(
                        \"elephantnote://chat-stream\",
                        json!({ \"streamId\": stream_id, \"type\": \"delta\", \"delta\": delta }),
                    );
                }
            }
""",
    1,
)
codex = codex.replace(
    """            \"turn/completed\" => {
                if let Some(error) = turn_failure(&event) {
                    break Err(error);
                }
                break Ok(());
            }
""",
    """            \"turn/completed\" => {
                if let Some(error) = turn_failure(&event) {
                    break Err(error);
                }
                if let Some(stream_id) = stream_id {
                    let _ = app.emit(
                        \"elephantnote://chat-stream\",
                        json!({ \"streamId\": stream_id, \"type\": \"phase\", \"phase\": \"finalizing\" }),
                    );
                }
                break Ok(());
            }
""",
    1,
)
if "pub async fn chat_with_effort_streaming" not in codex:
    raise SystemExit("Codex streaming patch failed")
codex_path.write_text(codex)

runtime_path = Path("Elephant/backend/tauri/src/chat_runtime.rs")
runtime = runtime_path.read_text().replace(
    "use tauri::AppHandle;", "use tauri::{AppHandle, Emitter};", 1
)
old = """        let result =
            codex_app_server::chat_with_effort(&app, &model, &prompt, reasoning_effort.as_deref())
                .await?;
        let (answer, raw_actions) = if tools_enabled(&payload) {
            action_block(&result.answer)
        } else {
            (result.answer.clone(), Vec::new())
        };
        let (actions, action_errors) = prepare_assistant_actions(&app, raw_actions);
        let citations = citations_from_hits(&hits);
        return Ok(json!({
            \"answer\": answer,
"""
new = """        let stream_id = text(&payload, &[\"streamId\", \"stream_id\"]);
        let stream_id = (!stream_id.is_empty()).then_some(stream_id);
        let result = codex_app_server::chat_with_effort_streaming(
            &app,
            &model,
            &prompt,
            reasoning_effort.as_deref(),
            stream_id.as_deref(),
        )
        .await?;
        let (mut answer, raw_actions) = if tools_enabled(&payload) {
            action_block(&result.answer)
        } else {
            (result.answer.clone(), Vec::new())
        };
        let (actions, action_errors) = prepare_assistant_actions(&app, raw_actions);
        let search_results = actions
            .iter()
            .filter_map(|entry| entry.pointer(\"/execution/result\"))
            .filter(|value| value.is_array())
            .cloned()
            .collect::<Vec<_>>();
        if !search_results.is_empty() {
            if let Some(stream_id) = stream_id.as_deref() {
                let _ = app.emit(
                    \"elephantnote://chat-stream\",
                    json!({ \"streamId\": stream_id, \"type\": \"reset\", \"phase\": \"tool-results\" }),
                );
            }
            let tool_context = serde_json::to_string_pretty(&search_results)
                .map_err(|error| error.to_string())?;
            let followup_prompt = format!(
                \"{prompt}\\n\\nThe ElephantNote search tool returned the following real indexed-note results:\\n{tool_context}\\n\\nAnswer the user's request using these results. Cite note titles naturally. Do not emit another elephantnote_actions block.\"
            );
            answer = codex_app_server::chat_with_effort_streaming(
                &app,
                &model,
                &followup_prompt,
                reasoning_effort.as_deref(),
                stream_id.as_deref(),
            )
            .await?
            .answer;
        }
        let citations = citations_from_hits(&hits);
        return Ok(json!({
            \"answer\": answer,
"""
if old not in runtime:
    raise SystemExit("missing chat runtime Codex block")
runtime_path.write_text(runtime.replace(old, new, 1))

chat_path = Path("Elephant/frontend/app/components/views/ChatView.vue")
chat = chat_path.read_text()
chat = chat.replace(
    "import { computed, nextTick, onMounted, ref, watch } from 'vue'",
    "import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'",
    1,
)
chat = chat.replace("  Link,\n  Menu,", "  Link,\n  LoaderCircle,\n  Menu,", 1)
chat = chat.replace(
    """        <div class=\"en-chat-topbar-actions\">
          <span
            v-if=\"chatStore.isSending\"
            class=\"en-chat-status en-chat-status-pulse\"
            aria-label=\"Assistant is working\"
          />
""",
    """        <div class=\"en-chat-topbar-actions\">
          <select v-model=\"selectedModel\" class=\"en-chat-route-select\" title=\"Modèle\" @change=\"saveChatRoute\">
            <option v-for=\"model in availableModels\" :key=\"model\" :value=\"model\">{{ model }}</option>
          </select>
          <select v-model=\"reasoningEffort\" class=\"en-chat-route-select en-chat-reasoning-select\" title=\"Niveau de réflexion\" @change=\"saveChatRoute\">
            <option value=\"low\">Faible</option>
            <option value=\"medium\">Moyen</option>
            <option value=\"high\">Élevé</option>
          </select>
          <label class=\"en-chat-auto-approve\" title=\"Approuver automatiquement les actions demandées\">
            <input v-model=\"autoApproveTools\" type=\"checkbox\" @change=\"persistAutoApprove\">
            <span>Auto</span>
          </label>
          <span
            v-if=\"chatStore.isSending\"
            class=\"en-chat-status en-chat-status-pulse\"
            aria-label=\"Assistant is working\"
          />
""",
    1,
)
chat = chat.replace(
    """            <div class=\"en-chat-message-body\">
              <p v-for=\"(paragraph, index) in splitParagraphs(message.content)\" :key=\"index\">
                {{ paragraph }}
              </p>
            </div>
""",
    """            <div class=\"en-chat-message-body\">
              <div v-if=\"message.streaming && !message.content\" class=\"en-chat-thinking\">
                <LoaderCircle class=\"en-icon en-spin\" />
                <span>{{ message.streamPhase || 'Raisonnement…' }}</span>
              </div>
              <p v-for=\"(paragraph, index) in splitParagraphs(message.content)\" :key=\"index\">
                {{ paragraph }}
              </p>
              <small v-if=\"message.reasoningEffort\" class=\"en-chat-reasoning-meta\">Réflexion : {{ message.reasoningEffort }}</small>
            </div>
""",
    1,
)
chat = chat.replace(
    "@click=\"approveAction(message, action)\"",
    "@click.stop=\"approveAction(message, action)\"",
    1,
).replace(
    "@click=\"rejectAction(message, action)\"",
    "@click.stop=\"rejectAction(message, action)\"",
    1,
)
chat = chat.replace(
    """                </div>
              </article>
            </section>
""",
    """                </div>
                <ul v-if=\"actionSearchResults(action).length\" class=\"en-chat-action-results\">
                  <li v-for=\"result in actionSearchResults(action)\" :key=\"result.relative_path || result.relativePath || result.path\">
                    <button type=\"button\" @click.stop=\"openNote(result.relative_path || result.relativePath || result.path, result.title)\">
                      <strong>{{ result.title || result.relative_path || result.path }}</strong>
                      <span>{{ result.excerpt || result.heading || '' }}</span>
                    </button>
                  </li>
                </ul>
              </article>
            </section>
""",
    1,
)
chat = chat.replace(
    """const expandedTools = ref({})
const stickToBottom = ref(true)
""",
    """const expandedTools = ref({})
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
""",
    1,
)
chat = chat.replace(
    """const persistActionPatch = (message, target, patch) => {
  const actions = (message.actions || []).map((entry) => entry === target ? { ...entry, ...patch } : entry)
  chatStore.updateMessage(message.id, { actions })
}
""",
    """const persistActionPatch = (message, target, patch) => {
  const targetId = target?.proposal?.id
  const actions = (message.actions || []).map((entry) => {
    const matches = targetId ? entry?.proposal?.id === targetId : entry === target
    return matches ? { ...entry, ...patch } : entry
  })
  chatStore.updateMessage(message.id, { actions })
}

const actionSearchResults = (entry) => Array.isArray(entry?.execution?.result) ? entry.execution.result : []

const persistAutoApprove = () => {
  window.localStorage.setItem('elephantnote:chat:auto-approve', String(autoApproveTools.value))
}

const invokeProposal = (command, id) => invoke(command, { proposalId: id, proposal_id: id })

const executeAction = async(message, entry) => {
  const id = entry?.proposal?.id
  if (!id || entry.busy) return
  persistActionPatch(message, entry, { busy: true, error: '' })
  try {
    await invokeProposal('tauri_knowledge_chat_action_approve', id)
    const execution = await invokeProposal('tauri_knowledge_chat_action_execute', id)
    persistActionPatch(message, entry, { busy: false, proposal: execution.proposal, execution })
    await refreshAfterAction()
  } catch (error) {
    persistActionPatch(message, entry, { busy: false, error: error?.message || String(error) })
  }
}
""",
    1,
)
start = chat.find("const approveAction = async(message, entry) => {")
end = chat.find("\n\nconst rejectAction", start)
if start < 0 or end < 0:
    raise SystemExit("approveAction anchor missing")
chat = chat[:start] + "const approveAction = async(message, entry) => executeAction(message, entry)" + chat[end:]
chat = chat.replace(
    "const proposal = await invoke('tauri_knowledge_chat_action_reject', { proposalId: id })",
    "const proposal = await invokeProposal('tauri_knowledge_chat_action_reject', id)",
    1,
)
helpers = """const extractModelIds = (value) => {
  const output = new Set()
  const visit = (entry) => {
    if (Array.isArray(entry)) return entry.forEach(visit)
    if (!entry || typeof entry !== 'object') return
    const id = entry.id || entry.model || entry.slug
    if (typeof id === 'string' && id.trim()) output.add(id.trim())
    Object.values(entry).forEach(visit)
  }
  visit(value)
  return [...output].filter((id) => id.startsWith('gpt-'))
}

const loadChatRoute = async() => {
  try {
    const config = await elephantnoteClient.ai.getConfig()
    activeAiConfig.value = config && typeof config === 'object' ? config : {}
    selectedModel.value = activeAiConfig.value?.routes?.chat?.model || activeAiConfig.value?.providers?.codex?.model || ''
    reasoningEffort.value = activeAiConfig.value?.routes?.chat?.reasoningEffort || 'medium'
  } catch {}
  try {
    codexModels.value = extractModelIds(await invoke('tauri_knowledge_chat', { payload: { codexOperation: 'models' } }))
  } catch {}
}

const saveChatRoute = async() => {
  const config = structuredClone(activeAiConfig.value || {})
  config.routes ||= {}
  config.routes.chat ||= {}
  Object.assign(config.routes.chat, {
    source: 'codex', provider: 'codex', transport: 'codex', endpoint: 'codex://app-server',
    model: selectedModel.value, reasoningEffort: reasoningEffort.value, enableTools: true, stream: true
  })
  config.providers ||= {}
  config.providers.codex ||= {}
  config.providers.codex.model = selectedModel.value
  activeAiConfig.value = config
  await elephantnoteClient.ai.setConfig(config)
}

const handleStreamEvent = (event) => {
  const payload = event?.payload || event
  if (!activeStream || payload?.streamId !== activeStream.id) return
  const message = chatStore.activeMessages.find((entry) => entry.id === activeStream.messageId)
  if (!message) return
  if (payload.type === 'reset') chatStore.updateMessage(message.id, { content: '', streamPhase: 'Résultats trouvés, rédaction…' })
  else if (payload.type === 'delta') chatStore.updateMessage(message.id, { content: `${message.content || ''}${payload.delta || ''}`, streamPhase: 'Rédaction…' })
  else if (payload.type === 'phase') chatStore.updateMessage(message.id, { streamPhase: 'Finalisation…' })
  nextTick(scrollToBottom)
}

"""
chat = chat.replace("const send = async () => {\n", helpers + "const send = async () => {\n", 1)
chat = chat.replace(
    """  chatStore.addMessage({ role: 'user', content: question })
  chatStore.setSending(true)
""",
    """  chatStore.addMessage({ role: 'user', content: question })
  const streamId = `chat-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const assistantMessage = chatStore.addMessage({ role: 'assistant', content: '', streaming: true, streamPhase: 'Recherche et raisonnement…', reasoningEffort: reasoningEffort.value })
  activeStream = { id: streamId, messageId: assistantMessage.id }
  chatStore.setSending(true)
""",
    1,
)
chat = chat.replace(
    """    const result = await elephantnoteClient.rag.chat({
      message: question,
      limit,
      messages
    })
""",
    """    const result = await elephantnoteClient.rag.chat({
      message: question,
      limit,
      messages,
      aiConfig: activeAiConfig.value,
      streamId,
      autoApproveTools: autoApproveTools.value
    })
""",
    1,
)
old_result = """    chatStore.addMessage({
      role: 'assistant',
      content: result?.answer || 'I did not find matching local notes.',
      citations: result?.citations || result?.sources || [],
      wikiContext: result?.wikiContext || null,
      actions: result?.actions || [],
      actionErrors: result?.actionErrors || [],
      toolCalls
    })
"""
new_result = """    chatStore.updateMessage(assistantMessage.id, {
      content: result?.answer || 'I did not find matching local notes.',
      citations: result?.citations || result?.sources || [],
      wikiContext: result?.wikiContext || null,
      actions: result?.actions || [],
      actionErrors: result?.actionErrors || [],
      toolCalls,
      streaming: false,
      streamPhase: '',
      reasoningEffort: result?.reasoningEffort || reasoningEffort.value
    })
    if (autoApproveTools.value) {
      const message = chatStore.activeMessages.find((entry) => entry.id === assistantMessage.id)
      for (const action of message?.actions || []) {
        if (action?.proposal?.status === 'proposed') await executeAction(message, action)
      }
    }
"""
if old_result not in chat:
    raise SystemExit("assistant result anchor missing")
chat = chat.replace(old_result, new_result, 1)
chat = chat.replace(
    """    chatStore.addMessage({
      role: 'assistant',
      content: chatStore.runtimeMessage
    })
""",
    """    chatStore.updateMessage(assistantMessage.id, { content: chatStore.runtimeMessage, streaming: false, streamPhase: '' })
""",
    1,
)
chat = chat.replace(
    "    chatStore.setSending(false)\n    nextTick(scrollToBottom)",
    "    activeStream = null\n    chatStore.setSending(false)\n    nextTick(scrollToBottom)",
    1,
)
chat = chat.replace(
    """onMounted(() => {
  searchStore.inspect().catch(() => {})
  chatStore.ensureActiveConversation()
  nextTick(scrollToBottom)
})
""",
    """onMounted(async() => {
  searchStore.inspect().catch(() => {})
  chatStore.ensureActiveConversation()
  await loadChatRoute()
  const listen = window.__TAURI__?.event?.listen
  if (typeof listen === 'function') unlistenChatStream = await listen('elephantnote://chat-stream', handleStreamEvent)
  nextTick(scrollToBottom)
})

onBeforeUnmount(() => {
  if (typeof unlistenChatStream === 'function') unlistenChatStream()
})
""",
    1,
)
chat += """

<style scoped>
.en-chat-route-select { min-width: 112px; max-width: 170px; height: 32px; border: 1px solid var(--chat-border); border-radius: 9px; background: var(--chat-surface); color: var(--chat-text); padding: 0 28px 0 10px; font-size: 12px; }
.en-chat-reasoning-select { min-width: 82px; }
.en-chat-auto-approve { display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 9px; border: 1px solid var(--chat-border); border-radius: 9px; font-size: 12px; color: var(--chat-text-secondary); }
.en-chat-thinking { display: inline-flex; align-items: center; gap: 8px; color: var(--chat-text-secondary); min-height: 28px; }
.en-spin { animation: en-chat-spin 0.9s linear infinite; }
@keyframes en-chat-spin { to { transform: rotate(360deg); } }
.en-chat-reasoning-meta { display: block; margin-top: 8px; color: var(--chat-text-muted); }
.en-chat-action-results { grid-column: 1 / -1; display: grid; gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
.en-chat-action-results button { width: 100%; display: grid; gap: 3px; text-align: left; border: 1px solid var(--chat-border); border-radius: 9px; background: color-mix(in srgb, var(--chat-surface) 88%, transparent); color: var(--chat-text); padding: 9px 10px; }
.en-chat-action-results span { color: var(--chat-text-secondary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
"""
chat_path.write_text(chat)

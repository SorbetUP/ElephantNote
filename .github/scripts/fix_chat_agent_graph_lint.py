from pathlib import Path

path = Path("Elephant/frontend/app/components/views/ChatView.vue")
text = path.read_text()
text = text.replace(
    """  } catch {}
  try {
    codexModels.value = extractModelIds(await invoke('tauri_knowledge_chat', { payload: { codexOperation: 'models' } }))
  } catch {}
""",
    """  } catch (error) {
    console.warn('[chat] unable to load the saved AI route', error)
  }
  try {
    codexModels.value = extractModelIds(await invoke('tauri_knowledge_chat', { payload: { codexOperation: 'models' } }))
  } catch (error) {
    console.warn('[chat] unable to list Codex models', error)
  }
""",
    1,
)
text = text.replace(
    "const invokeProposal = (command, id) => invoke(command, { proposalId: id, proposal_id: id })",
    "const invokeProposal = (command, id) => invoke(command, { proposalId: id })",
    1,
)
text = text.replace(
    "const config = structuredClone(activeAiConfig.value || {})",
    "const config = JSON.parse(JSON.stringify(activeAiConfig.value || {}))",
    1,
)
path.write_text(text)

from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


panel_path = Path("Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue")
panel = panel_path.read_text()
panel = replace_once(
    panel,
    """            <small v-if="form.routes.embedding.source === 'app-local'">\n              {{ localEmbeddingModelHint }}\n            </small>\n""",
    "",
    "embedding availability hint markup",
)
panel = replace_once(
    panel,
    """const localEmbeddingModelHint = computed(() => {\n  const count = localEmbeddingModels.value.length\n  if (!count) return 'Download an embedding model from Models, then refresh this list.'\n  return `${count} downloaded embedding model${count === 1 ? '' : 's'} available.`\n})\n""",
    "",
    "embedding availability computed hint",
)
panel_path.write_text(panel)

codex_path = Path("Elephant/backend/tauri/src/chat_runtime/codex_app_server.rs")
codex = codex_path.read_text()
codex = replace_once(
    codex,
    """      \"config\": {\n        \"web_search\": \"live\",\n        \"tools\": {\n          \"web_search\": {\n            \"context_size\": \"high\",\n            \"allowed_domains\": null,\n            \"location\": null\n          }\n        }\n      },\n""",
    """      \"config\": {\n        \"web_search\": \"live\"\n      },\n""",
    "legacy Codex web search config",
)
codex = replace_once(
    codex,
    """        assert_eq!(\n            thread\n                .pointer(\"/config/tools/web_search/context_size\")\n                .and_then(Value::as_str),\n            Some(\"high\")\n        );\n""",
    """        assert!(thread.pointer(\"/config/tools\").is_none());\n""",
    "legacy Codex web search test assertion",
)
codex_path.write_text(codex)

picker_test_path = Path("tests/app/unit/aiEmbeddingModelPicker.spec.js")
picker_test = picker_test_path.read_text()
picker_test = replace_once(
    picker_test,
    "    expect(source).toContain('Select a downloaded embedding model')\n",
    "    expect(source).toContain('Select a downloaded embedding model')\n    expect(source).not.toContain('localEmbeddingModelHint')\n",
    "embedding picker test anchor",
)
picker_test_path.write_text(picker_test)

export const mutationTouchesToolbar = (record, toolbar) => {
  const target = record?.target
  if (!target || !toolbar) return false
  if (target === toolbar) return true
  if (target.nodeType === 3) return Boolean(toolbar.contains?.(target.parentElement))
  return Boolean(toolbar.contains?.(target))
}

export const relevantLanguageMutations = (records = [], toolbar) =>
  records.filter((record) => !mutationTouchesToolbar(record, toolbar))

export const applyLanguageUiState = ({
  languageElement,
  runButton,
  label,
  disabled,
  running = false
}) => {
  let changed = false
  if (languageElement.textContent !== label) {
    languageElement.textContent = label
    changed = true
  }
  if (!running && runButton.disabled !== disabled) {
    runButton.disabled = disabled
    changed = true
  }
  return changed
}

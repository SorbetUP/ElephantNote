# Acceptance test bridge

Development and E2E builds expose `window.__ELEPHANT_ACCEPTANCE_TEST__` after the renderer is mounted. Every command writes a structured entry to `window.__ELEPHANT_DEBUG_LOGS__` and to the terminal console.

```js
const test = window.__ELEPHANT_ACCEPTANCE_TEST__
await test.openNote('Projects/Beta.md')
test.setMarkdown('# Changed\n\nBody')
test.appendMarkdown('\n\nMore')
await test.save()
test.readState()     // Markdown, path, saved state and active vault
test.readDisplayed() // Markdown plus visible editor text/HTML
test.logs()          // Complete structured command log
```

The bridge is intended for functional automation, not visual assertions. It operates through the same Pinia stores, editor bus and save IPC used by the application.


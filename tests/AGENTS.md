# Elephant test instructions — mandatory

These instructions apply to every file under `tests/` and may not be weakened by a more local instruction file.

Legacy diagnostics are not product proof.

Generated test cases are forbidden.

Markdown editor changes require the real Tauri editor trust scenarios.

## The only three product test categories

Every maintained product test must belong to exactly one category declared in `tests/trust/test-layers.json`:

1. **backend-contract** — direct production Tauri/backend commands against a real vault and real filesystem. It proves backend behavior only and must not make a frontend claim.
2. **frontend-behavior** — the real renderer is driven through visible DOM controls and keyboard/input events. Direct store mutation, direct save, direct note opening and direct Tauri calls are forbidden inside the claimed scenario. Fixture setup must be recorded separately and excluded from the claim.
3. **packaged-user-journey** — the exact packaged executable is used from a clean profile, driven through visible controls, persisted to disk, killed, restarted and verified visibly. A development launcher is forbidden.

A diagnostic outside these categories may help locate a defect, but it is not product proof, must not be counted and must not make a release green.

The default `pnpm test` proof chain must execute all three categories. A category is `PROVEN` only when its structured artifact exists and every mandatory scenario is green. Otherwise the status is `NOT PROVEN`.

## Forbidden additions

Do not add:

- files or suites named `Generated`, `ParityGenerated`, `SurfaceGenerated` or equivalent;
- loops that manufacture separately counted `it()` or `test()` cases;
- local fake implementations that are asserted against themselves;
- source-file string checks as proof that runtime behavior works;
- a mock of the complete subsystem being claimed;
- duplicated fixtures where only an index changes;
- tests that remain green when the production implementation is removed or replaced with a no-op;
- Playwright, Electron test shells or a second browser automation path for Elephant product proof;
- frontend or user-journey actions implemented with `invokeTauri`, `setMarkdown`, `save`, `openNote`, `selectVault`, `executeCommand`, `installOfficialAddon` or `enableAddon`.

Representative input matrices belong inside one named contract test. One real behavior is one test or one product scenario, not hundreds of generated names.

## User-visible behavior

A change affecting UI, input, files, IPC, add-ons, runtimes or persistence requires a frontend-behavior scenario and, when release behavior is affected, a packaged-user-journey scenario through the Elephant external automation API.

The scenario must assert applicable evidence at each layer:

```text
real input → visible UI → production state → backend/runtime → disk → restart → logs
```

If one required layer is absent, report `NOT PROVEN`.

## Markdown editor

For Markdown/editor/input/selection/serialization/save changes, run the mandatory scenarios in `tests/trust/required-scenarios.json` through `build/scripts/run-markdown-editor-trust.mjs` as part of the frontend category.

The suite must use the real Tauri process and real keyboard/input commands. Helper-only assertions, direct synthetic calls to a reduced input rule, jsdom and source-text checks do not satisfy this obligation.

## Sensitivity

Before trusting a new product-proof scenario, temporarily sabotage the protected behavior and confirm the scenario becomes red. Restore the production implementation before committing. Record the mutation and failure evidence in the delivery report.

Never weaken an assertion because the application currently fails. Fix the product or report the failure.

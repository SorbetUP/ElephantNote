# Elephant test instructions — mandatory

These instructions apply to every file under `tests/` and may not be weakened by a more local instruction file.

Legacy diagnostics are not product proof.

Generated test cases are forbidden.

Markdown editor changes require the real Tauri editor trust scenarios.

## Test classification

Every test must be explicitly understood as one of:

- **product proof**: real application, real UI/input, production state, persistence and logs;
- **production contract**: direct call to an imported production API with exact deterministic assertions;
- **legacy diagnostic**: existing Vitest/jsdom/static test that may localize defects but cannot validate the product.

Do not describe a legacy diagnostic as product validation. Do not use its count in delivery reports.

## Forbidden additions

Do not add:

- files or suites named `Generated`, `ParityGenerated`, `SurfaceGenerated` or equivalent;
- loops that manufacture separately counted `it()` or `test()` cases;
- local fake implementations that are asserted against themselves;
- source-file string checks as proof that runtime behavior works;
- a mock of the complete subsystem being claimed;
- duplicated fixtures where only an index changes;
- tests that remain green when the production implementation is removed or replaced with a no-op;
- Playwright, Electron test shells or a second browser automation path for Elephant product proof.

Representative input matrices belong inside one named contract test. One real behavior is one test or one product scenario, not hundreds of generated names.

## User-visible behavior

A change affecting UI, input, files, IPC, add-ons, runtimes or persistence requires a product-proof scenario through the Elephant external automation API.

The scenario must assert applicable evidence at each layer:

```text
real input → visible UI → production state → backend/runtime → disk → restart → logs
```

If one required layer is absent, report `NOT PROVEN`.

## Markdown editor

For Markdown/editor/input/selection/serialization/save changes, run the mandatory scenarios in `tests/trust/required-scenarios.json` through `build/scripts/run-markdown-editor-trust.mjs`.

The suite must use the real Tauri process and real keyboard/input commands. Helper-only assertions, direct synthetic calls to a reduced input rule, jsdom and source-text checks do not satisfy this obligation.

## Sensitivity

Before trusting a new product-proof test, temporarily sabotage the protected behavior and confirm the scenario becomes red. Restore the production implementation before committing. Record the mutation and failure evidence in the delivery report.

Never weaken an assertion because the application currently fails. Fix the product or report the failure.

# Elephant test trust policy

This policy is mandatory. Test quantity is not a quality metric and must never be presented as product evidence.

## Evidence classes

### Product proof

A product-proof scenario must execute the real Elephant application through its production path. For desktop behavior this means a real Tauri process; for distributable behavior it means the packaged application. It must observe the real UI, application state, persistence and logs.

Only product-proof scenarios may support claims such as:

- the application starts;
- the editor works;
- Enter or cursor movement works;
- a note saves and survives restart;
- an add-on works;
- a runtime or model works;
- a mobile behavior works.

The default `pnpm test` command is reserved for product-proof validation. It may not point at the legacy Vitest suite.

### Production contract tests

A production contract test calls an exported production API or protocol implementation directly. It may prove that specific deterministic inputs produce specific outputs, but it does not prove that the UI or complete application works.

A contract test must:

- import the actual production implementation;
- use realistic, named cases tied to a product rule or regression;
- assert exact outputs and error behavior;
- avoid mocking the implementation being claimed;
- avoid recreating the production algorithm inside the test;
- demonstrate red-before-green for a regression.

### Legacy diagnostics

Existing Vitest/jsdom tests are legacy diagnostics unless individually audited and promoted. Their success must never be summarized as application health. They run only through explicitly named `test:legacy*` commands.

Legacy tests may still help localize a defect, but they cannot satisfy a product acceptance gate.

## Forbidden test construction

The following patterns are forbidden:

- filenames containing `Generated.spec`, `Generated.test`, `ParityGenerated`, or similar generated-test naming;
- loops that generate dozens or hundreds of separately counted `it()` or `test()` cases;
- a local fake function in the test that is asserted against itself instead of importing production;
- reading source files and asserting that strings exist as proof that behavior works;
- mounting only a reduced helper and claiming that the application works;
- mocking the complete subsystem being claimed;
- replacing filesystem, IPC, add-on runtime, Markdown engine or UI ownership with a fake and calling the result end-to-end;
- assertions whose only purpose is to increase the count;
- duplicated fixtures where only an index or label changes but the protected behavior does not;
- snapshots accepted without inspecting the actual behavioral change;
- tests that stay green when the production implementation is removed or replaced with a no-op.

One scenario may exercise many representative inputs inside one test. It must not manufacture hundreds of test names to inflate the reported total.

## User-visible behavior obligations

Every user-visible regression needs a product-proof scenario that observes all applicable layers:

```text
real input
→ visible UI
→ production state/API
→ backend or runtime
→ disk/external effect
→ restart
→ visible restored state
→ logs
```

A user-visible change is `NOT PROVEN` when any required layer is missing.

## Markdown editor obligations

Any change to the Markdown editor, Rust runtime, selection, input, clipboard, keyboard handling, serialization or save path must exercise the real editor through the external automation API.

At minimum, the blocking suite must cover:

- application startup and a visible Rust editor;
- ordinary Enter/new paragraph behavior;
- Enter after moving the caret to the middle of plain text;
- arrow-key caret movement followed by Enter;
- list continuation;
- exiting an empty list item with a second Enter;
- pressing Enter after a fenced code block without inheriting code formatting;
- repeated Enter/input operations without crash or error logs;
- exact editor state written to disk;
- process termination, restart and exact restoration.

For each scenario, the evidence artifact must contain the scenario identifier, result, duration and relevant UI/state/disk/log evidence.

## Negative sensitivity requirement

A new product-proof suite is not trusted until it has demonstrated that it fails when the protected behavior is deliberately broken.

For editor work, applicable temporary mutations include:

- ignore Enter events;
- force every new line to become a code block;
- turn save into a no-op;
- remove the Rust editor mount;
- throw during input dispatch;
- hide the editor surface;
- suppress persistence on restart.

The mutation must be temporary and must not be committed. The validation record must name the mutation and include the failing result. A suite that remains green under the mutation is itself defective.

## CI and reporting rules

- CI must report product-proof scenarios separately from legacy diagnostics.
- A legacy test count must never appear in a completion claim.
- `all tests pass` is prohibited. Reports must name exact commands and evidence classes.
- A green legacy diagnostic workflow cannot override a red or missing product-proof workflow.
- Product changes cannot merge while their required product-proof scenario is missing, skipped, cancelled or red.
- Test changes that remove or weaken a product-proof assertion require explicit justification and review.
- Generated test files or dynamic test-count inflation must fail the test-trust guard.

## Promotion of a legacy test

A legacy test may be promoted only after review proves that it:

1. imports the production implementation;
2. protects a named behavior or regression;
3. fails when that implementation is sabotaged;
4. does not duplicate another test merely to increase the count;
5. is documented as contract evidence, not application evidence.

Promotion does not make it product proof. User-visible claims still require the real application scenario.

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

The default `pnpm test` command is reserved for product-proof validation.

### Production contract tests

A production contract test calls an exported production API or protocol implementation directly. It may prove that specific deterministic inputs produce specific outputs, but it does not prove that the UI or complete application works.

A contract test must:

- exercise the actual production implementation;
- use realistic, named cases tied to a product rule or regression;
- assert exact outputs and error behavior;
- avoid mocking the implementation being claimed;
- avoid recreating the production algorithm inside the test;
- demonstrate red-before-green for a regression.

For Elephant, production contract tests belong with their implementation, primarily as Rust tests in the relevant crate. JavaScript `.spec` and `.test` suites are not accepted.

## Removed legacy system

The previous Vitest/jsdom suite was removed because it mixed generated cases, source-text assertions, mocks and reduced helpers into a misleading application-health count.

The following are prohibited from returning:

- JavaScript or TypeScript `.spec` and `.test` files under `tests/`;
- Vitest and jsdom dependencies or configuration;
- workflows invoking Vitest or deleted unit-test paths;
- generated test counts;
- source-text simulations presented as behavior tests.

A static invariant may be implemented as an explicitly named executable guard under `build/scripts/`. It must not be counted or described as a user-behavior test.

## Forbidden test construction

The following patterns are forbidden:

- filenames containing `Generated.spec`, `Generated.test`, `ParityGenerated`, or similar generated-test naming;
- loops that generate dozens or hundreds of separately counted cases;
- a local fake function asserted against itself instead of the production implementation;
- reading source files and asserting strings exist as proof that behavior works;
- mounting only a reduced helper and claiming the application works;
- mocking the complete subsystem being claimed;
- replacing filesystem, IPC, add-on runtime, Markdown engine or UI ownership with a fake and calling the result end-to-end;
- assertions whose only purpose is increasing a count;
- duplicated fixtures where only an index or label changes;
- snapshots accepted without inspecting the actual behavior;
- tests that remain green when production is removed or replaced with a no-op.

One product scenario may exercise many representative inputs. It must not manufacture hundreds of names to inflate a reported total.

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

The mutation must be temporary and must not be committed. The validation record must name the mutation and include the failing result. A suite that remains green under the mutation is defective.

## CI and reporting rules

- CI must report each product-proof scenario and its artifact.
- A test count must never appear in a completion claim.
- `all tests pass` is prohibited. Reports must name exact commands and evidence classes.
- A green static guard or Rust contract workflow cannot override a red or missing product-proof workflow.
- Product changes cannot merge while their required real-app scenario is missing, skipped, cancelled or red.
- Changes that remove or weaken a product-proof assertion require explicit justification and review.
- Generated tests, JavaScript test suites, source-text behavior simulations and workflow references to them must fail the test-trust guard.

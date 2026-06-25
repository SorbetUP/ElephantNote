# Contributing to ElephantNote

Thank you for your interest in ElephantNote.

ElephantNote is a local-first Markdown notes application focused on personal knowledge management, search, graph navigation, sync, and optional AI workflows. The project is moving fast, so contributions should prioritize correctness, tests, maintainability, and user safety.

## Current contribution status

ElephantNote is not yet a broad open-contribution project. Small, focused pull requests are welcome when they improve an existing area, fix a bug, add a test, improve documentation, or reduce technical risk.

Large features should be discussed before implementation. This is especially important for sync, security, AI providers, storage, plugin APIs, mobile support, and licensing-related changes.

## Development principles

- Keep notes as normal Markdown files.
- Avoid mandatory cloud dependencies for core personal workflows.
- Prefer local-first behavior and explicit user consent for external services.
- Do not hide broken behavior with skipped tests or fake green checks.
- Add or update tests when changing behavior.
- Keep logs useful for Electron, Tauri, sync, AI, and storage failures.
- Preserve third-party notices and license obligations.

## Before opening a pull request

Please make sure your change is focused and understandable. A good pull request should include:

- a clear description of the problem;
- the solution implemented;
- screenshots or screen recordings for UI changes;
- tests for behavior changes;
- notes about risks, limitations, or follow-up work.

## Useful commands

Install dependencies:

```bash
pnpm install
```

Run the Electron app:

```bash
pnpm dev
```

Run the Tauri app:

```bash
pnpm tauri:dev
```

Run tests and checks:

```bash
pnpm test:unit
pnpm test
pnpm coverage
pnpm test:e2e
pnpm security:guard
pnpm tauri:check
pnpm tauri:platform:check
pnpm prod:check
```

Sync smoke tests:

```bash
pnpm test:sync:docker
pnpm test:sync:docker:pair
```

## Pull request rules

- Target the active development branch unless maintainers say otherwise.
- Keep pull requests small enough to review.
- Do not mix unrelated refactors with feature work.
- Do not remove security checks to make CI pass.
- Do not skip tests unless the skip is justified, temporary, and clearly documented.
- Do not change the license model without explicit approval from the project owner.
- Preserve attribution for MarkText, Muya, and other third-party code.

## Bug fixes

A bug-fix pull request should explain:

- what was broken;
- how to reproduce it;
- why the fix is correct;
- what test now protects against regression.

## Feature work

Feature pull requests should explain:

- the user workflow being improved;
- the expected behavior;
- edge cases;
- how the feature behaves on Electron, Tauri, and supported platforms when relevant;
- what remains experimental.

## License note

ElephantNote project-specific code is distributed under the PolyForm Noncommercial License 1.0.0. Contributions to ElephantNote project-specific code are expected to follow that license model unless explicitly agreed otherwise.

Third-party code keeps its own license and attribution requirements.

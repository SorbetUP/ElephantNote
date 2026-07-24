# Elephant coding-agent instructions

Before changing any code, read and obey `/AGENTS.md` and `agent/skill/elephant-change-safety/SKILL.md`. Before changing any test, also read and obey `/tests/AGENTS.md` and `/tests/TEST_TRUST_POLICY.md`.

The following rules are non-negotiable:

- preserve the working `develop` UI and behavior unless the user explicitly asks for a change;
- integrate code from known-good branches/commits instead of manually recreating it;
- moving core functionality into an add-on is an extraction, not a redesign;
- never claim an add-on, Marvin/AI engine or runtime works from compilation, registration, mocks or status probes alone;
- reproduce regressions and demonstrate red-before-green tests;
- do not weaken tests, replace the system under test with mocks, swallow errors or return fake success;
- generated test files, loop-generated test counts and duplicated indexed fixtures are forbidden;
- Vitest/jsdom/static source checks are legacy diagnostics and are never product proof;
- user-visible behavior must be proven in the real Tauri application through the external automation API, with UI, state, disk and logs;
- Markdown editor changes must run the mandatory real Enter/cursor/save/restart scenarios in `tests/trust/required-scenarios.json`;
- run the real Tauri application and the packaged acceptance scenario for user-visible desktop claims;
- validate Android changes on an installed APK with real permissions and logs;
- retain structured renderer, Tauri and add-on/runtime logs;
- never report a legacy test count as evidence that Elephant works;
- use `PROVEN`, `PARTIALLY PROVEN`, `NOT PROVEN` or `BLOCKED` accurately;
- stop and report missing proof rather than inventing an implementation.

Run these guards before delivery:

```bash
node build/scripts/verify-agent-governance.mjs
node build/scripts/verify-test-trust.mjs
```

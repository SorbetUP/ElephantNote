# Muya JavaScript to Rust migration

The migration is intentionally stacked on `refactor/muya-js-modular-parity`.

## Invariant

For every JavaScript module migrated to Rust:

1. the decomposed JavaScript module remains the behavioral oracle;
2. the Rust module mirrors the same responsibility and observable semantics;
3. JavaScript UTF-16 offsets are preserved explicitly where applicable;
4. parity tests must pass before any runtime cutover;
5. runtime cutover happens at a stable editor boundary, never by adding one Tauri IPC round trip per keystroke or helper call;
6. the JavaScript implementation is removed only after the Rust path is active and the original-vs-candidate characterization suite remains green.

## First migrated foundation

| JavaScript oracle | Rust module | State |
| --- | --- | --- |
| `Elephant/frontend/src/muya/lib/utils/primitives.js` | `Elephant/backend/tauri/src/muya_engine/utils/primitives.rs` | Ported and unit-tested; awaiting parser-slice cutover |
| `Elephant/frontend/src/muya/lib/parser/marked/stringTools.js` | `Elephant/backend/tauri/src/muya_engine/parser/marked/string_tools.rs` | Ported with UTF-16 offset parity tests; awaiting parser-slice cutover |
| `Elephant/frontend/src/muya/lib/parser/marked/tableTools.js` | `Elephant/backend/tauri/src/muya_engine/parser/marked/table_tools.rs` | Ported and unit-tested; awaiting parser-slice cutover |
| `Elephant/frontend/src/muya/lib/parser/marked/uniqueId.js` | `Elephant/backend/tauri/src/muya_engine/parser/marked/unique_id.rs` | Ported with thread-safe monotonic IDs; awaiting parser-slice cutover |

## Cutover order

1. Pure marked/parser helpers.
2. Block and inline tokenization.
3. Markdown import/export and block tree.
4. Stateless edit transformations.
5. Cursor, selection and history state machine.
6. Rendering contracts.
7. DOM/event adapters left in JavaScript only where the browser owns the behavior; editor semantics remain in Rust.

The old JavaScript file is not deleted merely because a Rust translation exists. Deletion is the final step of each coherent slice, after differential validation and runtime activation.

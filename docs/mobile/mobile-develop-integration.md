# Mobile integration branch

## Purpose

`assistant/mobile-develop-refresh` is a spin-off branch based on the current `develop` branch. It preserves the merged Settings redesign while continuing the mobile usability work without modifying `develop` directly.

## Current mobile changes

- Full-screen Settings layout uses `100dvh` instead of relying only on legacy viewport units.
- Top and bottom safe-area insets are respected for Android and iOS system chrome.
- The former narrow, icon-only left rail becomes a horizontally scrollable bottom navigation on phone-sized screens.
- Navigation labels remain visible and each destination has a touch-sized target.
- Settings rows, forms, vault actions, search results, AI panels and Sync panels adapt to narrow widths.
- Compact landscape and coarse-pointer behavior are handled explicitly.

## Local mobile branch integration

The newer mobile branch described by the user was not present on GitHub when this branch was created. Its commits must be pushed before they can be merged or cherry-picked reliably.

Once available remotely:

1. Compare it with `assistant/mobile-develop-refresh`.
2. Cherry-pick or merge the functional mobile commits, not generated build output.
3. Resolve UI conflicts in favor of the current shared Settings primitives and mobile responsive contracts.
4. Preserve desktop and mobile vault semantics; do not introduce a mobile-only data format.
5. Run the focused Settings contract, lint, web build and the real Android/Tauri build path.

## Validation policy

Do not describe a mobile feature as working based only on static markup or a smoke assertion. Build results and real device/emulator behavior must be reported separately and accurately.

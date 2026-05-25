# Android: Drawer UX/gestures/perf

- Request: Left drawer looks broken; need edge-swipe gestures and smoother performance.
- Level: P2
- Date: 2026-02-20
- Slug: android-mobile-drawer-ux-gestures-perf

## Summary
- [x] Android: left drawer looked “broken” (icon-only/collapsed) and lacked edge-swipe gestures; UI felt sluggish (blur/animations/DnD).
- [x] Fix: mobile drawer variant renders expanded labels, burger width capped, edge-swipe open/close, reduce expensive blur/animations on Android.

## Repro Steps
- [ ] Android (Tauri).
- [ ] Open burger menu → previously: collapsed sidebar with lots of empty space.
- [ ] Try to swipe from left edge → previously: no gesture support.
- [ ] Scroll around / open Resources list → felt heavy on device.

## Environment
- [ ] Android device, Tauri WebView.

## Observed vs Expected
- Observed:
- Drawer shows a “collapsed” sidebar (icons centered), poor use of space; no edge swipe; reduced responsiveness.
- Expected:
- Drawer shows normal sidebar (icons + labels) with good spacing; edge swipe opens/closes; smoother scrolling and overlays.

## Hypotheses
- [x] `Sidebar` called `base.collapseSidebar()` on mobile, persisting collapsed state and forcing icon-only view.
- [x] Backdrop blur on fixed header/bottom bar is expensive on some Android WebViews.
- [x] DnD + list animations add jank on mobile.

## Investigation Plan
- [x] Inspect `Sidebar.tsx` mobile collapse behavior and burger menu integration.
- [x] Check fixed header/bottom bar styles for `backdropFilter`.

## Fix Plan
- [x] Sidebar: add mobile-drawer behavior (expanded, no resize handle) without mutating persisted desktop collapse state.
- [x] CommonLayout: set burger menu width to 80% with max width; add edge-swipe gesture (open from left edge, close on swipe left).
- [x] Perf: disable blur on Android header + bottom bar; disable Resources DnD on mobile; reduce motion on mobile Resources; remove sidebar halation background on mobile.

## Regression Tests
- [x] Vitest: update `Sidebar.mobile.test.tsx` to assert expanded drawer behavior and no persisted collapse mutation.

## Release Notes
- [x] Android: improved drawer UX, added edge-swipe gestures, and reduced UI jank on mobile.

## Risks
- [ ] Edge-swipe gesture may conflict with some horizontal scrollers; guarded to only open from ~20px edge and ignore common interactive targets.

## Rollout
- [x] Included in next Android debug arm64 APK build.

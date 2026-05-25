# Perf Plan: Faster Notes Loading When Scrolling Fast

## Request
- Improve perceived + actual loading speed of notes when the user scrolls quickly towards the bottom.

## Primary Metrics
- [ ] Time-to-next-notes after reaching near-bottom (ms)
- [ ] Number of user interactions needed to continue loading (goal: 0 extra “nudge” scrolls)
- [ ] Main-thread long tasks during pagination (count / duration)

## Performance Budget (Targets)
- [ ] When within ~1.5 viewport-heights of the bottom, next page request is started within 1 animation frame.
- [ ] After a page resolves, if the user is still near-bottom, the next page should start automatically (no manual scroll needed).
- [ ] Pagination merge work should be O(pageSize) rather than O(totalItems) per page when items have stable IDs.

## Baseline (How To Measure)
- [ ] Open the home feed with a large dataset (500+ notes).
- [ ] In Chrome DevTools Performance: record a fast scroll to the bottom, then keep the scroll position at the end.
- [ ] In Network: observe when the next `/notes.list` requests start relative to scroll.
- [ ] In Performance: check for long tasks around list merge + render.

## Diagnoses / Likely Bottlenecks
- [ ] Bottom detection triggered too late (small threshold), and debounced calls miss opportunities when scrolling fast.
- [ ] After a page loads, no further scroll event occurs, so the next page does not load until the user scrolls again.
- [ ] Page concatenation/dedup work grows with list size (O(N) per page) and can block the main thread.

## Implemented Changes
- [x] Fix pagination for `path=all`: load next page instead of resetting to page 1.
- [x] ScrollArea prefetches earlier (dynamic bottom offset) and supports async `onBottom`.
- [x] ScrollArea auto-fills: after a page resolves, if still near-bottom and content height increased, it schedules another load.
- [x] PromisePageState uses an incremental ID set for dedup/appends (O(pageSize) per page) when IDs exist.

## Validation
- [ ] Manual: on `path=all` and default feed, drag scrollbar to bottom; notes keep loading without extra scroll.
- [ ] DevTools: confirm request starts earlier than before (within a larger prefetch window).
- [ ] DevTools Performance: confirm fewer long tasks during repeated pagination.

## Rollout / Risk
- [ ] Risk: If an `onBottom` handler does not actually load more items (and scrollHeight doesn’t grow), auto-fill stops to avoid loops.
- [ ] Risk: Slightly earlier prefetch increases request frequency; list state already guards with `loading` + `isLoadAll`.

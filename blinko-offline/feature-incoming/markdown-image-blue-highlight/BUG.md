# Bug: Large blue highlight block to the right of images in rendered markdown (WebKit)

## Summary
- **Observed:** On iOS/WebKit (and some Tauri WebViews), tapping/selecting an image in rendered markdown can show a large blue highlight rectangle to the right of the image (as if the empty space is part of the image).
- **Expected:** Only the image area should be interactive/highlighted; no full-line highlight block.
- **Status:** Report created manually because `scripts/create_bug_folder.py` and `assets/BUG_TEMPLATE.md` were not found in this repo.

## Environment (known)
- Renderer: `app/src/components/Common/MarkdownRender/index.tsx` (ReactMarkdown)
- Image component: `app/src/components/Common/MarkdownRender/ImageWrapper.tsx`
- Platform where reproduced: iOS/WebKit screenshot (blue rectangle)

## Repro Steps
- [ ] Open a note containing markdown images (ex: `![a](/api/file/532)`).
- [ ] View the note (rendered markdown, not editor).
- [ ] Tap/select an image.
- [ ] Observe a large blue highlight rectangle filling the remaining horizontal space to the right of the image.

## Expected Behavior
- [ ] Tapping/selecting the image does not highlight an empty region to the right.
- [ ] If a highlight exists at all, it is confined to the image area.

## Actual Behavior
- [ ] A blue rectangle appears to the right of the image, suggesting the image (or its wrapper) occupies full width.

## Root Cause (most likely)
- [ ] `ImageWrapper` rendered a block-level wrapper (`div.w-full`) inside a markdown `<p>` which is invalid HTML and can trigger browser reflow/auto-closing of `<p>`, producing unexpected selection/tap-highlight behavior.
- [ ] On WebKit, the tap-highlight rectangle often matches the bounding box of the “clickable” element or a block wrapper, which was full width.

## Fix Plan (Implemented)
- [x] Make markdown image wrapper inline and not full width
  - [x] Change `ImageWrapper` outer wrapper from `<div class="block w-full">` to `<span class="inline-block">`.
  - [x] Add `WebkitTapHighlightColor: transparent` and keep `userSelect/WebkitUserDrag` protections.
- [x] Render image-only paragraphs as a non-`<p>` block
  - [x] In `MarkdownRender` `p` renderer, detect image-only paragraphs (including a link-wrapped image).
  - [x] Render them as `<div className="my-2 select-none">...</div>` to avoid WebKit selection/tap artifacts.
- [x] Add regression tests
  - [x] Unit test: image-only paragraph does not render an image inside `<p>`.
  - [x] Unit test: mixed text+image remains a `<p>`.

## Validation
- [x] `cd app && bun run test -- src/components/Common/MarkdownRender/__tests__/MarkdownRender.imageParagraphs.test.tsx src/components/Common/MarkdownRender/__tests__/ImageWrapper.fetchesApiImages.test.tsx`

## Acceptance Criteria
- [x] Rendered markdown no longer produces a large blue highlight rectangle to the right of images when tapping/selecting on iOS/WebKit.
- [x] Regression tests cover paragraph rendering behavior and prevent reintroducing invalid wrappers.


type StyleSnapshot = {
  el: HTMLElement;
  transform: string;
  transition: string;
  willChange: string;
  filter: string;
  perspective: string;
};

const shouldNeutralize = (cs: CSSStyleDeclaration) => {
  const t = cs.transform && cs.transform !== "none";
  const f = cs.filter && cs.filter !== "none";
  const p = (cs as any).perspective && (cs as any).perspective !== "none";
  const wc = (cs.willChange || "").includes("transform") || (cs.willChange || "").includes("filter");
  return t || f || p || wc;
};

export const applyEditorFullscreenLayoutFix = (opts?: { anchorEl?: HTMLElement | null }): (() => void) => {
  const targets: HTMLElement[] = [];
  const pageWrap = document.getElementById("page-wrap") as HTMLElement | null;
  const outer = document.getElementById("outer-container") as HTMLElement | null;
  if (pageWrap) targets.push(pageWrap);
  if (outer) targets.push(outer);

  // Also include burger-menu wrapper if present.
  const bmWrap = document.querySelector(".bm-menu-wrap") as HTMLElement | null;
  if (bmWrap) targets.push(bmWrap);

  // Also neutralize any transformed ancestor above the editor. If any ancestor has transform/filter/perspective,
  // `position: fixed` becomes relative to that ancestor (WebKit/Chromium) and fullscreen breaks.
  const anchor = opts?.anchorEl ?? null;
  if (anchor) {
    let cur: HTMLElement | null = anchor;
    // Walk up from the editor element to <body>.
    while (cur && cur !== document.body) {
      const cs = window.getComputedStyle(cur);
      if (shouldNeutralize(cs)) targets.push(cur);
      cur = cur.parentElement;
    }
  }

  // De-dupe while keeping stable order.
  const uniqTargets: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  for (const el of targets) {
    if (seen.has(el)) continue;
    seen.add(el);
    uniqTargets.push(el);
  }

  const snaps: StyleSnapshot[] = uniqTargets.map((el) => ({
    el,
    transform: el.style.transform,
    transition: el.style.transition,
    willChange: el.style.willChange,
    filter: el.style.filter,
    perspective: (el.style as any).perspective || "",
  }));

  const bodyOverflow = document.body.style.overflow;
  const htmlOverflow = document.documentElement.style.overflow;

  // Prevent background scrolling while fullscreen.
  document.body.style.overflow = "hidden";
  document.documentElement.style.overflow = "hidden";

  // IMPORTANT: If any ancestor has transform/filter, `position: fixed` becomes relative to that ancestor
  // (WebKit and Chromium). Neutralize those during fullscreen.
  for (const el of uniqTargets) {
    el.style.transform = "none";
    el.style.filter = "none";
    // @ts-ignore
    el.style.perspective = "none";
    el.style.willChange = "auto";
  }

  return () => {
    document.body.style.overflow = bodyOverflow;
    document.documentElement.style.overflow = htmlOverflow;

    for (const s of snaps) {
      s.el.style.transform = s.transform;
      s.el.style.transition = s.transition;
      s.el.style.willChange = s.willChange;
      s.el.style.filter = s.filter;
      // @ts-ignore
      s.el.style.perspective = s.perspective;
    }
  };
};

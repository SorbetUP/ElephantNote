# Fullscreen toggle breaks editor render

- Request: Lorsque l'on switch entre le mode plein ecran et normale alors le rendu ne se fait pas. il faut alors cliquer sur view mode et passer par une autre view pour reload le rendu du texte.
- Level: medium
- Date: 2026-02-11
- Slug: fullscreen-toggle-breaks-editor-render

## Summary
- [ ] Le toggle plein écran ↔ normal peut laisser l’éditeur (Vditor) “vide” (rendu texte/preview absent) jusqu’à ce qu’on change de `View mode` (ce qui force un re-render/re-init).
- [ ] Repro probable surtout sur l’éditeur `create`/`edit` qui utilise le bouton fullscreen de la toolbar (pas l’overlay `FullscreenEditor` dédié).
- [ ] Cause racine très probable: le DOM `#vditor-${mode}` est démonté/remonté lors du passage en fullscreen via un portal, alors que l’instance Vditor n’est ni détruite ni ré-initialisée sur changement de fullscreen.

## Repro Steps
- [ ] Ouvrir l’éditeur (ex: créer une note) avec du contenu (ou taper quelques lignes).
- [ ] Cliquer sur le bouton “fullscreen”.
- [ ] Revenir en mode normal.
- [ ] Observer que le contenu/rendu ne s’affiche plus (surface vide / preview non rendu).
- [ ] Ouvrir `View mode` et passer sur un autre mode (ex: `ir` → `wysiwyg` → `ir`) : le rendu revient.

## Environment
- [ ] Branch/SHA: `dev` / `b5d57505`
- [ ] Front: React + MobX, éditeur: `vditor`
- [ ] Constaté sur desktop (capture DevTools WebView/Chrome-like)

## Observed vs Expected
- Observed:
- Après un toggle fullscreen, l’éditeur ne “rendu” plus le texte tant qu’on ne force pas un changement de `View mode`.
- Expected:
- Le contenu et le rendu (édition + preview) restent stables après toggle fullscreen ↔ normal, sans action supplémentaire.

## Hypotheses
- [ ] `/Users/sorbet/Desktop/Dev/blinko/blinko-offline/app/src/components/Common/Editor/index.tsx`: le subtree qui contient `<div id="vditor-${mode}">` est rendu soit inline soit via `createPortal(...)`. Le switch `store.isFullscreen` change de branche => démontage/remontage du DOM du conteneur Vditor.
- [ ] `/Users/sorbet/Desktop/Dev/blinko/blinko-offline/app/src/components/Common/Editor/hooks/useEditor.ts`: l’effet `useEditorInit` (création `new Vditor(...)`) ne dépend pas de `store.isFullscreen`, donc aucun re-bind de Vditor sur le nouveau node après le remount.
- [ ] `handleFullScreen` installe `ResizeObserver` / `MutationObserver` et calcule `anchorEl` immédiatement après `store.setFullscreen(...)` (avant que le DOM “fullscreen” soit réellement en place), ce qui peut pointer vers l’ancien DOM (et aggraver l’état).
- [ ] Bug annexe: fuite d’event handler `editor:setViewMode` (le `off()` utilise une fonction différente de celle passée à `on()`), pouvant créer des effets cumulés difficiles à diagnostiquer.

## Investigation Plan
- [ ] Confirmer le démontage/remontage: observer dans DevTools si `#vditor-create` (ou `#vditor-edit`) est recréé (node différent) lors du toggle fullscreen.
- [ ] Confirmer que `new Vditor(...)` n’est pas rappelé sur toggle fullscreen (pas de re-init) et que `store.vditor` pointe vers un élément qui n’est plus dans le DOM.
- [ ] Vérifier si `store.vditor?.resize?.()` existe et si l’appeler après toggle résout partiellement (si le DOM n’est pas démonté).
- [ ] Vérifier la chronologie: `handleFullScreen()` (eventBus) vs re-render React/MobX; valider si les observers s’attachent au bon DOM.
- [ ] Vérifier les side effects: z-index, scroll, drag&drop, focus/caret après modifications.

## Fix Plan
- [ ] (Recommandé) Ne plus démonter le conteneur Vditor pendant le toggle fullscreen:
  - [ ] `/Users/sorbet/Desktop/Dev/blinko/blinko-offline/app/src/components/Common/Editor/index.tsx`: rendre l’éditeur dans une seule branche React (un seul subtree), et utiliser uniquement des classes CSS (`fixed inset-0 ...`) pour passer en plein écran, sans `createPortal` qui déplace/démonte le DOM Vditor.
  - [ ] Continuer d’utiliser `applyEditorFullscreenLayoutFix()` pour neutraliser transforms/filters des ancêtres (nécessaire pour `position: fixed` sur WebKit/Chromium).
- [ ] (Alternative si portal strictement nécessaire) Garder un portal **mais** stabiliser le node racine:
  - [ ] Créer un “portal container” stable (un `<div>` dédié) et le déplacer dans le DOM (`appendChild`) entre un placeholder inline et `document.body` sans remount React, afin de conserver le DOM Vditor et son instance.
- [ ] Dans `/Users/sorbet/Desktop/Dev/blinko/blinko-offline/app/src/components/Common/Editor/hooks/useEditor.ts`:
  - [ ] Après `store.setFullscreen(...)`, exécuter `adjustEditorHeight()` et l’installation des observers sur `requestAnimationFrame` (après commit DOM), en re-sélectionnant les éléments.
  - [ ] À l’entrée/sortie fullscreen, re-déclencher un rendu preview best-effort: `renderAllVditorContent(...)` + `applyThemeToEditor(...)` (et `vditor.resize()` si dispo).
  - [ ] Corriger la fuite d’event handler: déclarer un handler nommé pour `editor:setViewMode` et l’utiliser pour `on()`/`off()`.
- [ ] Mettre à jour/adapter les tests qui “figent” le portal:
  - [ ] `/Users/sorbet/Desktop/Dev/blinko/blinko-offline/app/src/components/Common/Editor/__tests__/fullscreenPortal.test.ts` doit refléter le nouveau comportement attendu (ou vérifier le nouveau mécanisme choisi).

## Regression Tests
- [ ] Ajouter un test qui échoue aujourd’hui et passe après fix:
  - [ ] Test RTL/Vitest avec mock de `vditor` vérifiant qu’après toggle fullscreen ↔ normal, le conteneur `#vditor-${mode}` conserve un rendu non vide (ou que l’instance est réattachée).
  - [ ] À défaut de test runtime, au minimum un test de structure qui garantit qu’on ne remonte pas dans une branche React séparée (pas de double render branch qui démonte Vditor).

## Release Notes
- [ ] Fix: l’éditeur ne devient plus vide après un toggle plein écran; plus besoin de changer de `View mode` pour récupérer le rendu.

## Risks
- [ ] Changer la stratégie fullscreen peut impacter: stacking context/z-index, scroll locking (`body overflow`), drag&drop, focus/caret, et comportements iOS.
- [ ] Si suppression du portal: vérifier les cas où des ancêtres ont `transform/filter` (déjà mitigé par `applyEditorFullscreenLayoutFix`) et où des `overflow`/layouts spécifiques clipperaient l’éditeur.

## Rollout
- [ ] Valider manuellement sur: desktop (Chrome/WebView), Safari/WebKit (si support), mobile (iOS/Android) avec notes longues + pièces jointes.
- [ ] Surveiller régressions sur: preview (math/mermaid/abcjs/mindmap), upload, references, et navigation (ESC, focus).

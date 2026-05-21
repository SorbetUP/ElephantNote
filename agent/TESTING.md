# Tests et validation

## Validation standard

Avant de pousser sur `develop`:

```bash
rtk pnpm lint
rtk pnpm test
rtk pnpm build
```

## Validation ciblee

Pour un changement limite aux composants ElephantNote:

```bash
rtk pnpm exec eslint src/renderer/src/elephantnote/components
rtk pnpm test
```

Pour un changement main process:

```bash
rtk pnpm exec eslint src/main/elephantnote src/preload/index.js
rtk pnpm test
```

## Warnings connus

ESLint peut afficher un warning Node sur `eslint.config.js` parce que le package ne declare pas `"type": "module"`. Ce warning n'est pas bloquant si la commande sort avec code 0.

Le build peut afficher des warnings Rollup sur des commentaires `#__PURE__` dans des dependances. Ce n'est pas bloquant si la commande sort avec code 0.

## Tests existants importants

- `test/unit/specs/elephantnote/core.spec.js`: workspace, parsing frontmatter, securite chemins.
- `test/unit/specs/elephantnote/noteCardView.spec.js`: helpers de cartes.
- `test/unit/specs/markdown-basic.spec.js`: roundtrip Muya Markdown.

## Ajouter un test

Ajouter un test quand:

- Une transformation Markdown change.
- Un helper pur est ajoute.
- Une operation de chemin ou de vault est modifiee.
- Un bug corrige risque de revenir.

Eviter les tests lourds pour un simple changement de layout CSS.


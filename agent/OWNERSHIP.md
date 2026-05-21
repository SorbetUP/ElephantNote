# Ownership technique

## Zones a modifier en priorite

UI ElephantNote:

- `src/renderer/src/elephantnote/components`
- `src/renderer/src/elephantnote/styles`

Etat ElephantNote:

- `src/renderer/src/elephantnote/stores`

Logique locale:

- `src/main/elephantnote`

Contrat renderer/main:

- `src/preload/index.js`

Markdown engine:

- `src/muya/lib`
- `src/renderer/src/components/editorWithTabs`

## Zones a eviter

- `node_modules/`
- `out/`
- `dist/`
- `build/`
- `legacy/`
- `blinko-offline/` sauf lecture ou doc de portage

## Quand toucher Blinko Offline

`blinko-offline/` est une reference. Modifier ce dossier seulement si la tache demande explicitement de maintenir cette reference.

Pour porter une feature, copier l'idee et reimplementer dans ElephantNote avec l'architecture locale.

## Quand toucher Muya

Toucher Muya seulement pour:

- parsing Markdown;
- export Markdown/HTML;
- comportement editeur bas niveau;
- syntax highlighting;
- selection/cursor interne.

Ne pas toucher Muya pour:

- ajouter un bouton toolbar;
- changer une carte;
- changer la sidebar;
- ajouter un panneau settings.


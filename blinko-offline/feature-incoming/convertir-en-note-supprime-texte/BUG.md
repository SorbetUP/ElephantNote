# Bug: "Convertir en Note" supprime le texte

## Resume
- **Observe**: quand on clique sur "convertir en Note", le contenu de la note disparait.
- **Attendu**: le type change (Blinko <-> Note) sans modifier le contenu.

## Contexte / Environnement
- App desktop Tauri (Blinko Offline).
- Repro signale via UI (bouton convertir).

## Reproduction
- [ ] Ouvrir une note existante avec du contenu.
- [ ] Cliquer sur "convertir en Note".
- [ ] Observer que le texte est vide apres conversion.

## Hypothese / Cause probable
- L'upsert envoie `content: null` quand `content` n'est pas fourni.
- Le backend traite `null` comme un effacement (ou remplace par string vide).

## Plan de correction
- [x] Ne pas envoyer `content` quand il n'est pas fourni.
- [ ] Verifier que les conversions changent uniquement `type`.
- [ ] Tester sur Blinko, Note, Todo.

## Changements proposes
- `app/src/store/blinkoStore.tsx`:
  - Ne pas inclure `content` dans le payload quand `content` est `null` ou `undefined`.

## Tests / Validation
- [ ] Creer une note avec du texte.
- [ ] Convertir en Note/ Blinko depuis le footer et le menu contextuel.
- [ ] Verifier que le texte reste intact.

## Notes
- La correction evite d'ecraser le contenu lors d'upsert partiel.

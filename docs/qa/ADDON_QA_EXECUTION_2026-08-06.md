# Exécution QA des addons — 6 août 2026

## Build ciblée

- Dépôt : `SorbetUP/ElephantNote`
- Base : PR #126, branche `agent/addon-runtime-stabilization`
- SHA de départ : `5a8174e4a48e9438a38767786c1e73fcbcc69a79`
- Branche de validation : `assistant/addon-independent-validation`
- Catalogue officiel épinglé : `SorbetUP/Elephant-Addons@7f75c12e8002082489745605209b8a3f21f44184`

## Règles de cette campagne

Chaque scénario doit utiliser :

1. l'AppImage exacte construite depuis le commit testé ;
2. un nouveau processus Elephant ;
3. un nouveau `HOME`, un nouveau répertoire de configuration et un nouveau vault ;
4. l'installation et l'activation du seul addon ciblé, hors dépendances obligatoires ;
5. des assertions sur l'interface, l'API runtime et les fichiers réels ;
6. un fichier JSON de verdict propre à l'addon ;
7. la poursuite des autres scénarios après un échec, afin de ne masquer aucun résultat.

Un passage au niveau package ou une compilation réussie ne vaut pas validation fonctionnelle.

## Lot 1 — parcours indépendants implémentés

### `elephant.dashboard`

- [ ] AppImage lancée dans un profil propre.
- [ ] Installation et activation sans erreur.
- [ ] Action `elephant.dashboard.open` exécutable.
- [ ] Création réelle de `.elephantnote/Dashboard.md`.
- [ ] Contenu affiché strictement identique au contenu disque.
- [ ] La note générée est effectivement ouverte.
- [ ] Une seconde génération reste fonctionnelle.
- [ ] Aucun autre fichier Markdown n'est créé ou modifié par l'addon.

### `elephant.recently-edited`

- [ ] AppImage lancée dans un profil propre.
- [ ] Installation et activation sans erreur.
- [ ] Section `.elephant-recent-notes` visible dans la barre latérale.
- [ ] Les cinq notes les plus récentes seulement sont visibles initialement.
- [ ] « Show more » affiche les huit notes préparées.
- [ ] Le repli masque réellement la liste.
- [ ] Aucun fichier Markdown du vault n'est modifié.

### `elephant.calendar`

- [ ] AppImage lancée dans un profil propre.
- [ ] Installation et activation sans erreur.
- [ ] Vue Calendar rendue dans l'application.
- [ ] Import d'un vrai événement ICS via `calendar.provider`.
- [ ] Événement visible dans la vue.
- [ ] Événement conservé après arrêt et redémarrage du même AppImage.
- [ ] Addon toujours activé après redémarrage.
- [ ] Suppression des événements fonctionnelle.
- [ ] Aucun fichier Markdown du vault n'est modifié.

### `elephant.google-keep-import`

- [ ] AppImage lancée dans un profil propre.
- [ ] Installation et activation sans erreur.
- [ ] Import de deux notes portant le même titre.
- [ ] Création de deux chemins distincts, sans écrasement.
- [ ] Conversion du texte, des labels et des checkboxes vérifiée sur disque.
- [ ] Note marquée comme supprimée ignorée par défaut.
- [ ] JSON invalide comptabilisé comme échec sans crash global.
- [ ] Nouvelle tentative sur un chemin existant refusée sans écrasement.
- [ ] Contenu lu dans l'application strictement identique au contenu disque.

## État actuel

`NOT PROVEN` tant que le workflow `Independent packaged addon acceptance` n'a pas produit les quatre verdicts JSON verts sur le SHA final.

Les tests de désactivation, désinstallation, mise à jour, permissions refusées, interaction entre addons et Bazzite/Wayland natif restent à ajouter aux lots suivants. Les cases ci-dessus ne doivent être cochées qu'après lecture des artefacts du workflow.

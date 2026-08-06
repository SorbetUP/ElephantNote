# Independent packaged feature matrix

Every feature below launches the exact packaged AppImage with a new HOME, XDG profile and disposable vault. A failure is recorded without preventing later features from executing. Each feature writes its own `PROVEN` or `NOT PROVEN` JSON and log.

The mandatory independent tests are:

1. application launch;
2. vault selection;
3. note creation;
4. folder creation;
5. external note discovery after file-manager creation;
6. external folder and nested-note discovery;
7. visible note editing;
8. truthful real-time autosave and disk persistence;
9. repeated note reading without crash;
10. Excalidraw creation, canvas initialization and close;
11. basic multiline text editing;
12. live Markdown formatting in canonical Markdown and rendered DOM;
13. settings search and theme round-trip;
14. sidebar hide/show through its visible button;
15. sidebar hide/show through the keyboard shortcut;
16. file drop into a selected vault folder;
17. image drop at the editor caret, copied into `.assets` and rendered;
18. generic file drop producing a clickable Markdown link;
19. PDF-addon routing when a PDF addon is installed;
20. system-default PDF fallback through the Tauri opener.

The matrix fails closed unless all twenty independent artifacts are `PROVEN`. The same runner is used by the Ubuntu exact-AppImage CI and the native Bazzite production proof.

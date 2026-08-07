# Addon source ownership

The Elephant application repository no longer tracks physical addon implementations or protected addon packs.

Canonical source: `https://github.com/SorbetUP/Elephant-Addons`

`ElephantNote` ne checkoute, ne copie et n’embarque plus les sources ou les packs
du dépôt addon. Le catalogue et les packages sont téléchargés depuis le dépôt
dédié par le runtime officiel. Les tests, le packaging physique/mobile et les
contrats de version vivent dans `Elephant-Addons`.

Elephant retains only the generic addon host, installer, permission broker, scoped APIs, service/sidecar host and UI extension points.

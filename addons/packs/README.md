# Elephant addon packs

Addon Packs is a core Elephant capability, not an addon. These files contain only physical optional packages resolved from `addons/catalog.json`.

- `develop-parity.enaddonpack` installs every first-party optional package.
- `base.enaddonpack` installs the same set without Calendar.

Excalidraw and Addon Packs are core features and must never be serialized in a pack. Google Keep Import and Recently edited are genuine optional packages and therefore remain in both packs.

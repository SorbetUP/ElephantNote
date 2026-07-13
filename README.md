# Elephant addon catalogue

This branch owns the source packages distributed through Elephant's addon catalogue.

## Core versus addons

Addon Packs and Excalidraw are application capabilities and are always part of Elephant. They are not catalogue entries and cannot be installed, disabled or removed as addons.

Google Keep Import and Recently edited are optional first-party addons. Their renderer implementations live entirely in this catalogue alongside AI, Wiki, Graph, Sync, Calendar, Sites and Code execution.

Every first-party `elephant.*` package is explicitly marked `official: true`. Official packages are verified by the application catalogue pipeline and remain independent from the third-party Community Addons preference.

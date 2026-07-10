# Addon Platform Proof

A deterministic acceptance addon for the external ElephantNote addon runtime.

It verifies:

- isolated Worker activation;
- command registration;
- brokered application metadata;
- private persistent storage;
- scoped note writing;
- scoped note read-back;
- permission-scoped note listing.

Running it twice increments a persisted counter and updates `Addon Proof/External Addon Platform Proof.md`. The command also lists `Addon Proof/` and confirms that the generated note is visible through the public `notes.list` API.

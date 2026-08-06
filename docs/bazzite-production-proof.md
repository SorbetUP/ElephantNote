# Bazzite production proof

This proof is intentionally separate from the Ubuntu/Xvfb AppImage job. It runs the exact AppImage on a real Bazzite Wayland session and fails closed unless all of the following are true:

- `/etc/os-release` identifies Bazzite;
- GNOME is the active desktop, with `XDG_SESSION_TYPE=wayland` and `WAYLAND_DISPLAY`;
- a Gear Lever desktop entry references the exact AppImage;
- SELinux is enforcing and the post-run journal contains no AVC denial;
- `xdg-desktop-portal.service` is active;
- the AppImage SHA-256 matches the expected hash;
- backend, visible frontend, crash recovery and official addon acceptance pass against that exact file.

The runner does not use Xvfb or `xdotool`. The native folder picker is not automatically controlled; the desktop portal is verified as active and the vault is then installed as fixture setup through the authenticated external app API.

## Local command

```bash
ELEPHANT_EXPECTED_APPIMAGE_SHA256=<sha256> \
node build/scripts/run-bazzite-production-proof.mjs /absolute/path/Elephant.AppImage
```

Use `--quick` only while iterating. A publishable result requires the exhaustive addon suite.

## Pre-merge execution on the active branch

Register the real machine as a self-hosted runner with the labels `bazzite`, `gnome` and `wayland`. Configure these repository variables:

- `ELEPHANT_BAZZITE_PROOF_ENABLED=1`
- `ELEPHANT_BAZZITE_APPIMAGE_PATH=/absolute/path/Elephant.AppImage`
- `ELEPHANT_BAZZITE_APPIMAGE_SHA256=<64-character-sha256>`
- optionally `ELEPHANT_BAZZITE_QUICK=1` during iteration only

A push touching the Bazzite proof files can then execute the real-machine job before the PR is merged. The manual dispatch remains available after the workflow is present on the default branch.

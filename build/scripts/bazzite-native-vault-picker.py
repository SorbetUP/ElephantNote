#!/usr/bin/env python3
"""Drive the real xdg-desktop-portal folder chooser through AT-SPI.

This script never calls Elephant's vault API. It waits for the native chooser,
opens the location entry with Ctrl+L, enters the requested absolute directory,
then invokes the visible Select/Open/Choose action. The caller must still prove
that Elephant reports the exact selected directory after the portal closes.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Iterable

try:
    import gi

    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi
except Exception as exc:  # pragma: no cover - host dependency failure
    print(json.dumps({"status": "NOT PROVEN", "error": f"AT-SPI unavailable: {exc}"}))
    raise SystemExit(2)


TIMEOUT_SECONDS = float(os.environ.get("ELEPHANT_PORTAL_PICKER_TIMEOUT", "30"))
POLL_SECONDS = 0.1
ENTER_KEYVAL = 0xFF0D
CONTROL_L_KEYVAL = 0xFFE3
LOWER_L_KEYVAL = ord("l")

DIALOG_ROLES = {
    "dialog",
    "file chooser",
    "file chooser dialog",
    "window",
}
TEXT_ROLES = {
    "entry",
    "text",
    "password text",
}
CONFIRM_NAMES = {
    "choose",
    "choose folder",
    "open",
    "select",
    "select folder",
    "choisir",
    "choisir un dossier",
    "ouvrir",
    "sélectionner",
    "sélectionner un dossier",
}
CANCEL_NAMES = {"cancel", "annuler"}


def safe_name(accessible) -> str:
    try:
        return str(accessible.get_name() or "").strip()
    except Exception:
        return ""


def safe_role(accessible) -> str:
    try:
        return str(accessible.get_role_name() or "").strip().lower()
    except Exception:
        return ""


def children(accessible) -> Iterable:
    try:
        count = int(accessible.get_child_count())
    except Exception:
        return []
    result = []
    for index in range(max(0, count)):
        try:
            child = accessible.get_child_at_index(index)
        except Exception:
            child = None
        if child is not None:
            result.append(child)
    return result


def descendants(accessible, max_nodes: int = 6000) -> list:
    found = []
    stack = [accessible]
    seen = set()
    while stack and len(found) < max_nodes:
        current = stack.pop()
        try:
            identity = current.get_object_locale(), current.get_process_id(), current.get_index_in_parent(), safe_name(current), safe_role(current)
        except Exception:
            identity = id(current)
        if identity in seen:
            continue
        seen.add(identity)
        found.append(current)
        stack.extend(reversed(list(children(current))))
    return found


def desktop_nodes() -> list:
    desktop = Atspi.get_desktop(0)
    nodes = []
    for application in children(desktop):
        nodes.extend(descendants(application))
    return nodes


def visible(accessible) -> bool:
    try:
        states = accessible.get_state_set()
        return bool(states.contains(Atspi.StateType.SHOWING) and states.contains(Atspi.StateType.VISIBLE))
    except Exception:
        return True


def has_chooser_controls(accessible) -> bool:
    names = {safe_name(node).casefold() for node in descendants(accessible, 1200) if visible(node)}
    return bool(names & CONFIRM_NAMES) and bool(names & CANCEL_NAMES)


def find_native_chooser():
    candidates = []
    for node in desktop_nodes():
        role = safe_role(node)
        name = safe_name(node)
        if role in DIALOG_ROLES and visible(node) and has_chooser_controls(node):
            candidates.append((role == "file chooser", "file" in name.casefold() or "folder" in name.casefold() or "dossier" in name.casefold(), node))
    if not candidates:
        return None
    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return candidates[0][2]


def wait_for(predicate, label: str, timeout: float = TIMEOUT_SECONDS):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() <= deadline:
        try:
            last = predicate()
        except Exception:
            last = None
        if last:
            return last
        time.sleep(POLL_SECONDS)
    raise RuntimeError(f"Timed out waiting for {label}")


def synth_key(keyval: int, synth_type) -> None:
    if not Atspi.generate_keyboard_event(keyval, None, synth_type):
        raise RuntimeError(f"AT-SPI rejected keyboard event {keyval:#x}/{synth_type}")


def open_location_entry() -> None:
    synth_key(CONTROL_L_KEYVAL, Atspi.KeySynthType.PRESS)
    try:
        synth_key(LOWER_L_KEYVAL, Atspi.KeySynthType.PRESSRELEASE)
    finally:
        synth_key(CONTROL_L_KEYVAL, Atspi.KeySynthType.RELEASE)


def editable_text(node):
    try:
        return node.get_editable_text_iface()
    except Exception:
        return None


def find_location_entry(dialog):
    entries = []
    for node in descendants(dialog, 2000):
        if safe_role(node) not in TEXT_ROLES or not visible(node):
            continue
        interface = editable_text(node)
        if interface is None:
            continue
        name = safe_name(node).casefold()
        score = int(any(token in name for token in ("location", "name", "path", "emplacement", "nom", "chemin")))
        entries.append((score, node, interface))
    if not entries:
        return None
    entries.sort(key=lambda item: item[0], reverse=True)
    return entries[0][1], entries[0][2]


def set_location(dialog, target: str) -> dict:
    open_location_entry()
    node, interface = wait_for(lambda: find_location_entry(dialog), "portal location entry")
    if not interface.set_text_contents(target):
        raise RuntimeError("Portal location entry rejected the target path")
    try:
        node.grab_focus()
    except Exception:
        pass
    synth_key(ENTER_KEYVAL, Atspi.KeySynthType.PRESSRELEASE)
    return {"entryName": safe_name(node), "entryRole": safe_role(node)}


def invoke_confirm(dialog) -> dict:
    def find_button():
        matches = []
        for node in descendants(dialog, 2000):
            if not visible(node):
                continue
            name = safe_name(node).casefold()
            if name not in CONFIRM_NAMES:
                continue
            try:
                action = node.get_action_iface()
                count = int(action.get_n_actions()) if action is not None else 0
            except Exception:
                action = None
                count = 0
            if action is not None and count > 0:
                matches.append((name in {"select", "select folder", "sélectionner", "sélectionner un dossier"}, node, action))
        if not matches:
            return None
        matches.sort(key=lambda item: item[0], reverse=True)
        return matches[0][1], matches[0][2]

    node, action = wait_for(find_button, "portal confirmation button")
    if not action.do_action(0):
        raise RuntimeError(f"Portal confirmation action failed for {safe_name(node)!r}")
    return {"buttonName": safe_name(node), "buttonRole": safe_role(node)}


def chooser_is_gone(dialog) -> bool:
    try:
        return not visible(dialog) or dialog.get_parent() is None
    except Exception:
        return True


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: bazzite-native-vault-picker.py ABSOLUTE_DIRECTORY")
    target = str(Path(sys.argv[1]).expanduser().resolve())
    if not Path(target).is_dir():
        raise RuntimeError(f"Vault picker target is not a directory: {target}")
    if str(os.environ.get("XDG_SESSION_TYPE", "")).lower() != "wayland":
        raise RuntimeError("Native vault picker proof requires XDG_SESSION_TYPE=wayland")
    Atspi.init()
    dialog = wait_for(find_native_chooser, "native xdg-desktop-portal folder chooser")
    evidence = {
        "status": "PROVEN",
        "target": target,
        "dialogName": safe_name(dialog),
        "dialogRole": safe_role(dialog),
    }
    evidence.update(set_location(dialog, target))
    time.sleep(0.25)
    evidence.update(invoke_confirm(dialog))
    wait_for(lambda: chooser_is_gone(dialog), "native folder chooser to close")
    print(json.dumps(evidence, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"status": "NOT PROVEN", "error": str(exc)}, ensure_ascii=False))
        raise SystemExit(1)

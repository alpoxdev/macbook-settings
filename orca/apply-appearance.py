#!/usr/bin/env python3
"""Merge orca/appearance.json's keys into the live Orca settings file.

Orca's orca-data.json is a live app database (repos, worktrees, ssh targets,
session cookies, ...) private to each machine, so it is never synced or
symlinked wholesale. This only overlays the appearance-related keys from
appearance.json into its "settings" object, leaving everything else intact.

Orca 1.4.x keeps the live file at profiles/<profile>/orca-data.json; the
top-level orca-data.json from older installs is still handled as a fallback.

Quit Orca before running this so it doesn't overwrite the file on exit.
"""
import json
import sys
from pathlib import Path

REPO_DIR = Path(__file__).resolve().parent
APPEARANCE_FILE = REPO_DIR / "appearance.json"
ORCA_DIR = Path.home() / "Library/Application Support/orca"


def resolve_data_file():
    """The file Orca is actually writing: newest profile file, else legacy top-level."""
    profiles = sorted(ORCA_DIR.glob("profiles/*/orca-data.json"),
                      key=lambda p: p.stat().st_mtime, reverse=True)
    for candidate in [*profiles, ORCA_DIR / "orca-data.json"]:
        if candidate.exists():
            return candidate
    return None


def main():
    data_file = resolve_data_file()
    if data_file is None:
        print(f"No Orca settings file under {ORCA_DIR} — launch Orca once first, then re-run this.")
        sys.exit(1)

    appearance = json.loads(APPEARANCE_FILE.read_text())
    data = json.loads(data_file.read_text())
    data.setdefault("settings", {}).update(appearance)

    backup = data_file.with_name(data_file.name + ".bak.pre-appearance")
    if not backup.exists():
        backup.write_text(data_file.read_text())
        print(f"Backed up {data_file} -> {backup}")

    data_file.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"Applied {len(appearance)} appearance settings to {data_file}")


if __name__ == "__main__":
    main()

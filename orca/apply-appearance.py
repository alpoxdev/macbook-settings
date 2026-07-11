#!/usr/bin/env python3
"""Merge orca/appearance.json's keys into the live Orca settings file.

Orca's orca-data.json is a live app database (repos, worktrees, ssh targets,
session cookies, ...) private to each machine, so it is never synced or
symlinked wholesale. This only overlays the appearance-related keys from
appearance.json into its "settings" object, leaving everything else intact.

Quit Orca before running this so it doesn't overwrite the file on exit.
"""
import json
import sys
from pathlib import Path

REPO_DIR = Path(__file__).resolve().parent
APPEARANCE_FILE = REPO_DIR / "appearance.json"
DATA_FILE = Path.home() / "Library/Application Support/orca/orca-data.json"


def main():
    if not DATA_FILE.exists():
        print(f"{DATA_FILE} not found — launch Orca once first, then re-run this.")
        sys.exit(1)

    appearance = json.loads(APPEARANCE_FILE.read_text())
    data = json.loads(DATA_FILE.read_text())
    data.setdefault("settings", {}).update(appearance)

    backup = DATA_FILE.with_name(DATA_FILE.name + ".bak.pre-appearance")
    if not backup.exists():
        backup.write_text(DATA_FILE.read_text())
        print(f"Backed up {DATA_FILE} -> {backup}")

    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"Applied {len(appearance)} appearance settings to {DATA_FILE}")


if __name__ == "__main__":
    main()

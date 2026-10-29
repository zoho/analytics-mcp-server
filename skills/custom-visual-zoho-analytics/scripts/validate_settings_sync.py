#!/usr/bin/env python3
"""
validate_settings_sync.py
─────────────────────────
Verifies that every setting declared in ZAViz_Manifest.json is actually read
in main.js AND every customSettings access in main.js exists in the manifest.

Three checks:
  1. Dead settings  — in manifest, never read in code
  2. Ghost reads    — read in code, not declared in manifest
  3. Default mismatches — manifest defaultValue ≠ getSetting() fallback

Usage (run from the visual's project folder):
  python validate_settings_sync.py
  python validate_settings_sync.py --manifest ZAViz_Manifest.json --js main.js

Exit code: 0 = all checks pass, 1 = one or more failures
"""

import argparse
import json
import re
import sys
from pathlib import Path

# ── ANSI colours ──────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
RESET  = "\033[0m"

def ok(msg):     print(f"    {GREEN}✓{RESET}  {msg}")
def err(msg):    print(f"    {RED}✗{RESET}  {msg}")
def warn(msg):   print(f"    {YELLOW}⚠{RESET}  {msg}")
def section(msg): print(f"\n{BOLD}{CYAN}{msg}{RESET}")
def divider():   print(f"{DIM}{'─' * 60}{RESET}")

# ── Manifest helpers ──────────────────────────────────────────────────────────
def extract_manifest_settings(manifest: dict) -> dict:
    """
    Returns {uniqueName: {type, defaultValue, label}} from flat array or
    grouped object settings.
    """
    raw = manifest.get("settings", [])
    items = []
    if isinstance(raw, list):
        items = raw
    elif isinstance(raw, dict):
        for section_items in raw.values():
            if isinstance(section_items, list):
                items.extend(section_items)

    result = {}
    for s in items:
        name = s.get("uniqueName")
        if name:
            result[name] = {
                "type":         s.get("type", ""),
                "defaultValue": s.get("defaultValue"),
                "label":        s.get("label", "(no label)"),
                "options":      s.get("options", []),
            }
    return result

# ── main.js helpers ───────────────────────────────────────────────────────────
def extract_code_reads(js: str) -> set:
    """
    All customSettings keys accessed in main.js — covers both:
      - direct dot access:   customSettings.myKey
      - getSetting() calls:  getSetting('myKey', ...)  or  getSetting("myKey", ...)
    Both patterns count as a code read of that setting.
    """
    dot_reads = set(re.findall(r'customSettings\.([A-Za-z0-9_]+)', js))
    get_reads = set(re.findall(r'getSetting\s*\(\s*["\'\'"]([A-Za-z0-9_]+)["\'\'"]\s*,', js))
    return dot_reads | get_reads

def extract_get_setting_calls(js: str) -> dict:
    """
    getSetting('key', fallback) or getSetting("key", fallback).
    Returns {key: fallback_string}.
    Only captures the first occurrence per key.
    """
    result = {}
    pattern = re.compile(r'getSetting\s*\(\s*["\']([A-Za-z0-9_]+)["\']\s*,\s*([^)]+?)\s*\)')
    for m in pattern.finditer(js):
        key      = m.group(1)
        fallback = m.group(2).strip().rstrip(',').strip()
        if key not in result:
            result[key] = fallback
    return result

# ── Default comparison ────────────────────────────────────────────────────────
def defaults_match(manifest_val, code_str: str, setting_type: str) -> bool:
    """
    Loosely compare manifest defaultValue with the getSetting() fallback string.
    Handles boolean coercion for toggle/checkBox, case-insensitive colour match.
    """
    cv = code_str.strip('"\'').strip()

    if setting_type in ("toggle", "checkBox"):
        m_bool = str(manifest_val).lower() in ("true", "1")
        c_bool = cv.lower() in ("true", "1")
        return m_bool == c_bool

    if setting_type == "colorComponent":
        return str(manifest_val).upper().lstrip('#') == cv.upper().lstrip('#')

    return str(manifest_val) == cv

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Validate Settings Sync: ZAViz_Manifest.json ↔ main.js"
    )
    parser.add_argument("--manifest", default="ZAViz_Manifest.json",
                        help="Path to ZAViz_Manifest.json (default: ./ZAViz_Manifest.json)")
    parser.add_argument("--js",       default="main.js",
                        help="Path to main.js (default: ./main.js)")
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    js_path       = Path(args.js)

    errors   = 0
    warnings = 0

    # ── File loading ──────────────────────────────────────────────────────────
    for p in (manifest_path, js_path):
        if not p.exists():
            print(f"{RED}ERROR:{RESET} File not found: {p}")
            sys.exit(1)

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"{RED}ERROR:{RESET} Invalid JSON in manifest — {e}")
        sys.exit(1)

    js_text = js_path.read_text(encoding="utf-8")

    # ── Extract ───────────────────────────────────────────────────────────────
    manifest_settings  = extract_manifest_settings(manifest)
    code_reads         = extract_code_reads(js_text)
    get_setting_calls  = extract_get_setting_calls(js_text)
    manifest_names     = set(manifest_settings.keys())

    print(f"\n{BOLD}Settings Sync Validator{RESET}")
    divider()
    print(f"  Manifest : {manifest_path}")
    print(f"  main.js  : {js_path}")
    print(f"  Settings declared in manifest : {len(manifest_names)}")
    print(f"  customSettings reads in code  : {len(code_reads)}")
    divider()

    # ── Check 1 — Dead settings ───────────────────────────────────────────────
    section("Check 1 — Dead Settings  (manifest declares, code never reads)")
    dead = sorted(manifest_names - code_reads)
    if not dead:
        ok("All manifest settings are read in main.js")
    else:
        for name in dead:
            s = manifest_settings[name]
            err(
                f'"{name}"  type={s["type"]}  label="{s["label"]}"'
                f'\n         → declared in manifest but never accessed via customSettings.{name}'
            )
            errors += 1

    # ── Check 2 — Ghost reads ─────────────────────────────────────────────────
    section("Check 2 — Ghost Reads  (code reads a key not declared in manifest)")
    ghost = sorted(code_reads - manifest_names)
    if not ghost:
        ok("All customSettings reads match a manifest entry")
    else:
        for name in ghost:
            err(
                f'customSettings.{name}'
                f'\n         → read in main.js but no matching uniqueName in manifest'
                f'  (will always return undefined)'
            )
            errors += 1

    # ── Check 3 — Default value mismatches ────────────────────────────────────
    section("Check 3 — Default Value Mismatches  (manifest defaultValue vs getSetting fallback)")

    if not get_setting_calls:
        warn("No getSetting() calls found in main.js — cannot verify default alignment")
        warn("Wrap every customSettings read with getSetting(key, default) for this check to run")
        warnings += 2
    else:
        checked = 0
        for name in sorted(manifest_names):
            if name not in get_setting_calls:
                # setting is read directly, not via getSetting — skip default check but note it
                if name in code_reads:
                    warn(
                        f'"{name}" — read directly via customSettings.{name} without getSetting().'
                        f'\n           Add getSetting("{name}", {json.dumps(manifest_settings[name]["defaultValue"])})'
                        f' to ensure fallback on undefined.'
                    )
                    warnings += 1
                continue

            checked += 1
            fallback     = get_setting_calls[name]
            manifest_val = manifest_settings[name]["defaultValue"]
            stype        = manifest_settings[name]["type"]

            if defaults_match(manifest_val, fallback, stype):
                ok(
                    f'"{name}": manifest default={json.dumps(manifest_val)}'
                    f'  ↔  getSetting fallback={fallback}'
                )
            else:
                err(
                    f'"{name}": manifest defaultValue={json.dumps(manifest_val)}'
                    f'\n         getSetting fallback  ={fallback}'
                    f'\n         → mismatch: setting will behave differently on first load vs. after user changes it'
                )
                errors += 1

        if checked == 0 and not warnings:
            warn("No getSetting() calls matched manifest keys — default alignment unchecked")
            warnings += 1

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    divider()
    print(f"  Errors   : {(RED + BOLD) if errors else GREEN}{errors}{RESET}")
    print(f"  Warnings : {YELLOW if warnings else GREEN}{warnings}{RESET}")
    divider()

    if errors == 0:
        print(f"\n{GREEN}{BOLD}  ✓  Settings Sync PASSED{RESET}\n")
        sys.exit(0)
    else:
        print(f"\n{RED}{BOLD}  ✗  Settings Sync FAILED — fix the errors above before running Gate 6 (package){RESET}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
run_all_validations.py — Full Gate Runner
──────────────────────────────────────────
Runs all four validation scripts in gate order and prints a final summary.

  Gate 3  → validate_manifest.py     (manifest schema)
  Gate 4a → validate_code.py         (ES5 + security + API misuse)
  Gate 4b → validate_settings_sync.py (manifest ↔ code settings sync)
  Gate 6  → validate_zip.py          (ZIP package pre-upload)

Usage:
  python run_all_validations.py
  python run_all_validations.py --manifest ZAViz_Manifest.json --js main.js --zip MyVisual.zip

  Omit --zip to skip the Gate 6 check (useful before packaging).

Exit: 0 = all pass, 1 = any failure
"""
import argparse, subprocess, sys
from pathlib import Path

G="\033[92m"; R="\033[91m"; Y="\033[93m"; B="\033[1m"; D="\033[0m"; DM="\033[2m"; C="\033[96m"

SCRIPTS_DIR = Path(__file__).parent

def run(script, args):
    cmd = [sys.executable, str(SCRIPTS_DIR / script)] + args
    result = subprocess.run(cmd, capture_output=False)
    return result.returncode == 0

def banner(text, width=55):
    pad = (width - len(text) - 2) // 2
    print(f"\n{B}{'═'*width}{D}")
    print(f"{B}{'═'*pad} {text} {'═'*(width-pad-len(text)-2)}{D}")
    print(f"{B}{'═'*width}{D}")

def main():
    p = argparse.ArgumentParser(description="Run all ZA custom visual validation scripts")
    p.add_argument("--manifest", default="ZAViz_Manifest.json")
    p.add_argument("--js",       default="main.js")
    p.add_argument("--zip",      default=None, help="ZIP path (Gate 6); omit to skip packaging check")
    a = p.parse_args()

    manifest = a.manifest
    js       = a.js
    zip_path = a.zip

    results = []

    # ── Gate 3 — Manifest ─────────────────────────────────────────────────────
    banner("Gate 3 — Manifest Validation")
    passed = run("validate_manifest.py", ["--manifest", manifest])
    results.append(("Gate 3  — Manifest",          passed))

    # ── Gate 4a — Code ────────────────────────────────────────────────────────
    banner("Gate 4a — Code (ES5 · Security · API)")
    passed = run("validate_code.py", ["--js", js])
    results.append(("Gate 4a — Code (ES5/Security/API)", passed))

    # ── Gate 4b — Settings Sync ───────────────────────────────────────────────
    banner("Gate 4b — Settings Sync")
    passed = run("validate_settings_sync.py", ["--manifest", manifest, "--js", js])
    results.append(("Gate 4b — Settings Sync",     passed))

    # ── Gate 6 — ZIP (optional) ───────────────────────────────────────────────
    if zip_path:
        banner("Gate 6 — ZIP Package")
        passed = run("validate_zip.py", [zip_path])
        results.append(("Gate 6  — ZIP Package",   passed))
    else:
        print(f"\n{DM}Gate 6 — ZIP skipped (no --zip argument){D}")
        results.append(("Gate 6  — ZIP Package",   None))

    # ── Summary ───────────────────────────────────────────────────────────────
    banner("SUMMARY")
    all_passed = True
    for name, status in results:
        if status is True:
            print(f"  {G}✓  PASS{D}  {name}")
        elif status is False:
            print(f"  {R}✗  FAIL{D}  {name}")
            all_passed = False
        else:
            print(f"  {Y}–  SKIP{D}  {name}")

    print()
    if all_passed:
        print(f"{G}{B}  All gates passed — visual is ready.{D}\n")
        sys.exit(0)
    else:
        print(f"{R}{B}  One or more gates failed — fix errors before uploading.{D}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
validate_zip.py  (Gate 6 — Package Validation)
────────────────────────────────────────────────
Validates a ZA custom visual ZIP before uploading to Zoho Analytics.

Checks:
  - ZIP opens without error
  - Size < 3 MB
  - ZAViz_Manifest.json and main.js are at ZIP root (not in a subfolder)
  - No nested directories
  - No disallowed file extensions (.ts .css .html .py etc.)
  - No junk files (.DS_Store .git node_modules __pycache__)
  - main.js contains generateCustomVisual export
  - main.js scanned for forbidden runtime keywords
  - No path traversal (..) in ZIP entry names

Usage:
  python validate_zip.py VisualName.zip
  python validate_zip.py --zip path/to/VisualName.zip

Exit: 0 = pass, 1 = fail
"""
import argparse, zipfile, sys, re
from pathlib import Path

G="\033[92m"; R="\033[91m"; Y="\033[93m"; B="\033[1m"; D="\033[0m"; DM="\033[2m"
def ok(m):   print(f"    {G}✓{D}  {m}")
def err(m):  print(f"    {R}✗{D}  {m}")
def warn(m): print(f"    {Y}⚠{D}  {m}")
def sec(m):  print(f"\n{B}{m}{D}")

ALLOWED_EXT   = {".js", ".json", ".png", ".jpg", ".jpeg"}
JUNK_PATTERNS = [".DS_Store", ".git", "node_modules", "__pycache__", "Thumbs.db", ".env"]
FORBIDDEN_KW  = [
    "fetch(", "XMLHttpRequest", "eval(", "new Function(",
    "localStorage", "sessionStorage", "indexedDB",
    "WebSocket", "EventSource",
    "window.top", "window.parent", "window.opener", "window.open(",
    "window.location", "document.cookie",
    "alert(", "confirm(", "prompt(",
    "<iframe", "<object", "<embed",
]

MAX_SIZE_MB = 3
MAX_FILES   = 5

def main():
    p = argparse.ArgumentParser()
    p.add_argument("zip_file", nargs="?", help="ZIP path (positional)")
    p.add_argument("--zip", dest="zip_flag", help="ZIP path (named)")
    a = p.parse_args()
    zip_path = Path(a.zip_file or a.zip_flag or "")

    if not zip_path.name:
        p.print_help(); sys.exit(1)

    errors = 0; warnings = 0

    print(f"\n{B}ZIP Package Validator{D}")
    print(f"{DM}{'─'*55}{D}")
    print(f"  File : {zip_path}")

    if not zip_path.exists():
        print(f"{R}ERROR:{D} File not found: {zip_path}"); sys.exit(1)

    # ── Check 1 — File size ───────────────────────────────────────────────────
    sec("Check 1 — File Size")
    size_mb = zip_path.stat().st_size / (1024*1024)
    if size_mb > MAX_SIZE_MB:
        err(f"ZIP is {size_mb:.2f} MB — max allowed is {MAX_SIZE_MB} MB"); errors += 1
    else:
        ok(f"Size: {size_mb:.2f} MB  (limit {MAX_SIZE_MB} MB)")

    # ── Open ZIP ──────────────────────────────────────────────────────────────
    try:
        zf = zipfile.ZipFile(zip_path, 'r')
    except zipfile.BadZipFile as e:
        err(f"Cannot open ZIP: {e}"); sys.exit(1)

    names = zf.namelist()

    # ── Check 2 — Structure ───────────────────────────────────────────────────
    sec("Check 2 — ZIP Structure")
    if len(names) > MAX_FILES:
        warn(f"{len(names)} files in ZIP — expected ≤ {MAX_FILES}"); warnings += 1
    else:
        ok(f"{len(names)} file(s)")

    for name in names:
        if ".." in name:
            err(f'Path traversal in entry "{name}" — remove it'); errors += 1
        if "/" in name.rstrip("/"):
            if not name.endswith("/"):
                err(f'Nested file "{name}" — all files must be at ZIP root'); errors += 1

    # Required files
    root_files = [n for n in names if "/" not in n.rstrip("/")]
    if "ZAViz_Manifest.json" not in root_files:
        err("ZAViz_Manifest.json missing from ZIP root"); errors += 1
    else:
        ok("ZAViz_Manifest.json present at root")

    if "main.js" not in root_files:
        err("main.js missing from ZIP root"); errors += 1
    else:
        ok("main.js present at root")

    # ── Check 3 — File types and junk ─────────────────────────────────────────
    sec("Check 3 — File Extensions and Junk Files")
    bad_ext = []
    junk    = []
    for name in names:
        if name.endswith("/"): continue
        basename = Path(name).name
        if any(j in name for j in JUNK_PATTERNS):
            junk.append(name)
        ext = Path(name).suffix.lower()
        if ext not in ALLOWED_EXT and ext != "":
            bad_ext.append(name)

    if bad_ext:
        for f in bad_ext:
            err(f'Disallowed file: "{f}" — only .js .json .png .jpg .jpeg allowed'); errors += 1
    else:
        ok("All file extensions are allowed")

    if junk:
        for f in junk:
            err(f'Junk file in ZIP: "{f}" — remove before upload'); errors += 1
    else:
        ok("No junk files detected")

    # ── Check 4 — main.js forbidden keywords ──────────────────────────────────
    sec("Check 4 — main.js Forbidden Runtime Keywords")
    if "main.js" in root_files:
        js = zf.read("main.js").decode("utf-8", errors="replace")
        found_kw = []
        for kw in FORBIDDEN_KW:
            for i, line in enumerate(js.split('\n'), 1):
                if kw.lower() in line.lower():
                    found_kw.append((i, kw, line.strip()))
                    break
        if found_kw:
            for lineno, kw, line in found_kw:
                err(f'Line {lineno}: forbidden keyword "{kw}" in main.js'); errors += 1
        else:
            ok("No forbidden runtime keywords in main.js")

        # generateCustomVisual export
        if "generateCustomVisual" not in js:
            err("generateCustomVisual not found in main.js — platform cannot call the visual"); errors += 1
        else:
            ok("generateCustomVisual function found")

    zf.close()

    # Summary
    print(f"\n{DM}{'─'*55}{D}")
    print(f"  Errors   : {(R+B) if errors else G}{errors}{D}")
    print(f"  Warnings : {Y if warnings else G}{warnings}{D}")
    print(f"{DM}{'─'*55}{D}")
    if errors == 0:
        print(f"\n{G}{B}  ✓  ZIP PASSED — ready to upload{D}\n")
        sys.exit(0)
    else:
        print(f"\n{R}{B}  ✗  ZIP FAILED — fix errors before uploading{D}\n")
        sys.exit(1)

if __name__=="__main__": main()

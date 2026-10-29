#!/usr/bin/env python3
"""
validate_manifest.py  (Gate 3 — Manifest Validation)
─────────────────────────────────────────────────────
Validates ZAViz_Manifest.json against the full Zoho Analytics manifest schema.

Checks:
  Layer 1 — JSON syntax and file parse
  Layer 2 — Top-level allowed fields (no version/engine)
  Layer 3 — Structure (drop areas): cardinality, dataType, element count
  Layer 4 — Settings shape (flat array vs grouped object, not mixed)
  Layer 5 — Per-setting: uniqueName, type, label, defaultValue, options

Usage:
  python validate_manifest.py
  python validate_manifest.py --manifest path/to/ZAViz_Manifest.json

Exit: 0 = pass, 1 = fail
"""
import argparse, json, re, sys
from pathlib import Path

G="\033[92m"; R="\033[91m"; Y="\033[93m"; B="\033[1m"; D="\033[0m"
def ok(m):   print(f"    {G}✓{D}  {m}")
def err(m):  print(f"    {R}✗{D}  {m}")
def warn(m): print(f"    {Y}⚠{D}  {m}")
def sec(m):  print(f"\n{B}{m}{D}")

ALLOWED_TOP   = {"name","icon","structure","dependencies","settings"}
FORBIDDEN_TOP = {"version","engine"}
VALID_TYPES   = {"checkBox","toggle","inputText","colorComponent","multipleToggle","dropdown"}
VALID_CARD    = {"single","multi"}
VALID_DT      = {"DIMENSIONAL","MEASURE"}
HEX_RE        = re.compile(r'^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$')
NAME_RE       = re.compile(r'^[A-Za-z0-9_]+$')

def flatten_settings(raw):
    if isinstance(raw, list): return raw
    if isinstance(raw, dict):
        items = []
        for v in raw.values():
            if isinstance(v, list): items.extend(v)
        return items
    return []

def is_mixed(raw):
    if isinstance(raw, list):
        return any(not isinstance(i, dict) for i in raw)
    return False

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--manifest", default="ZAViz_Manifest.json")
    a = p.parse_args()
    path = Path(a.manifest)
    errors = 0

    print(f"\n{B}Manifest Validator{D}")
    print(f"\033[2m{'─'*55}{D}")
    print(f"  File : {path}")

    if not path.exists():
        print(f"{R}ERROR:{D} File not found: {path}"); sys.exit(1)

    # Layer 1 — JSON parse
    sec("Layer 1 — JSON Syntax")
    try:
        txt = path.read_text(encoding="utf-8")
        m = json.loads(txt)
        ok("Valid JSON")
    except json.JSONDecodeError as e:
        err(f"JSON parse failed: {e}")
        sys.exit(1)

    # Layer 2 — Top-level keys
    sec("Layer 2 — Top-Level Fields")
    extra = set(m.keys()) - ALLOWED_TOP
    for k in sorted(extra):
        if k in FORBIDDEN_TOP:
            err(f'"{k}" is forbidden — not part of the ZAViz schema; remove it')
        else:
            err(f'"{k}" is not an allowed top-level key')
        errors += 1
    missing = {"name","icon","structure","dependencies","settings"} - set(m.keys())
    for k in sorted(missing):
        err(f'Required field "{k}" is missing'); errors += 1

    name = m.get("name","")
    if not (1 <= len(str(name)) <= 50):
        err(f'"name" must be 1–50 chars (got {len(str(name))})'); errors += 1
    else:
        ok(f'"name": {json.dumps(name)}')

    deps = m.get("dependencies",[])
    if not isinstance(deps, list):
        err('"dependencies" must be an array'); errors += 1
    elif len(deps) > 20:
        err(f'"dependencies" has {len(deps)} entries — max 20'); errors += 1
    else:
        ok(f'"dependencies": {len(deps)} entr{"y" if len(deps)==1 else "ies"}')

    if not extra and not missing:
        ok("No forbidden or unknown top-level keys")

    # Layer 3 — Structure
    sec("Layer 3 — Structure (Drop Areas)")
    structure = m.get("structure", [])
    if not isinstance(structure, list):
        err('"structure" must be an array'); errors += 1
    else:
        if not (1 <= len(structure) <= 8):
            err(f'{len(structure)} shelves — must be 1–8'); errors += 1
        else:
            ok(f'{len(structure)} shelf/shelves defined')
        labels = []
        for i, shelf in enumerate(structure):
            prefix = f'structure[{i}]'
            if not isinstance(shelf, list) or len(shelf) != 4:
                err(f'{prefix}: must have exactly 4 elements'); errors += 1; continue
            label, card, dtype, ops = shelf
            if label in labels:
                err(f'{prefix}: duplicate shelf name "{label}"'); errors += 1
            labels.append(label)
            if not (1 <= len(str(label)) <= 25):
                err(f'{prefix} label "{label}": must be 1–25 chars'); errors += 1
            if card not in VALID_CARD:
                err(f'{prefix}: cardinality "{card}" — must be "single" or "multi" (lowercase)'); errors += 1
            if dtype not in VALID_DT:
                err(f'{prefix}: dataType "{dtype}" — must be "DIMENSIONAL" or "MEASURE" (uppercase)'); errors += 1
            if errors == 0: ok(f'{prefix} "{label}": {card} {dtype} ✓')

    # Layer 4 — Settings shape
    sec("Layer 4 — Settings Shape")
    raw_settings = m.get("settings", [])
    if isinstance(raw_settings, list):
        ok("Settings is a flat array")
        if is_mixed(raw_settings):
            err("Settings mixes flat items with non-dict entries"); errors += 1
    elif isinstance(raw_settings, dict):
        ok("Settings is a grouped object")
        for grp, items in raw_settings.items():
            if not isinstance(items, list):
                err(f'Group "{grp}" value must be an array'); errors += 1
    else:
        err('"settings" must be an array or object'); errors += 1

    # Layer 5 — Per-setting items
    sec("Layer 5 — Per-Setting Items")
    settings = flatten_settings(raw_settings)
    seen_names = set()
    if not settings:
        warn("No settings defined")
    for i, s in enumerate(settings):
        prefix = f'settings[{i}]'
        uname = s.get("uniqueName","")
        stype = s.get("type","")
        label = s.get("label","")
        dv    = s.get("defaultValue")
        opts  = s.get("options")

        # uniqueName
        if not uname:
            err(f'{prefix}: missing uniqueName'); errors += 1
        elif not NAME_RE.match(uname):
            err(f'{prefix}: uniqueName "{uname}" — use camelCase only (^[A-Za-z0-9_]+$)'); errors += 1
        elif not (1 <= len(uname) <= 25):
            err(f'{prefix}: uniqueName "{uname}" — must be 1–25 chars'); errors += 1
        elif uname in seen_names:
            err(f'{prefix}: duplicate uniqueName "{uname}"'); errors += 1
        seen_names.add(uname)

        # type
        if stype not in VALID_TYPES:
            err(f'{prefix} "{uname}": type "{stype}" not valid — must be one of {sorted(VALID_TYPES)}'); errors += 1

        # label
        if not (1 <= len(str(label)) <= 25):
            err(f'{prefix} "{uname}": label "{label}" must be 1–25 chars (got {len(str(label))})'); errors += 1

        # defaultValue type check
        if stype in ("toggle","checkBox"):
            if not isinstance(dv, bool):
                err(f'{prefix} "{uname}": defaultValue must be boolean true/false, got {json.dumps(dv)}'); errors += 1
        elif stype == "inputText":
            if not isinstance(dv, str):
                err(f'{prefix} "{uname}": defaultValue must be a string, got {json.dumps(dv)}'); errors += 1
        elif stype == "colorComponent":
            if not isinstance(dv, str) or not HEX_RE.match(dv):
                err(f'{prefix} "{uname}": defaultValue must be "#RGB" or "#RRGGBB", got {json.dumps(dv)}'); errors += 1
        elif stype in ("multipleToggle","dropdown"):
            if opts is None:
                err(f'{prefix} "{uname}": "options" is required for type "{stype}"'); errors += 1
            elif not isinstance(opts, list):
                err(f'{prefix} "{uname}": "options" must be an array'); errors += 1
            else:
                for j, o in enumerate(opts):
                    if not isinstance(o, str):
                        err(f'{prefix} "{uname}" options[{j}]: must be a plain string, not {type(o).__name__}'); errors += 1
                if isinstance(dv, str) and opts and isinstance(opts[0], str):
                    if dv not in opts:
                        err(f'{prefix} "{uname}": defaultValue "{dv}" not in options {opts}'); errors += 1
                elif not isinstance(dv, str):
                    err(f'{prefix} "{uname}": defaultValue must be a string matching one of options'); errors += 1

        # options present for non-toggle types
        if stype in ("checkBox","toggle","inputText","colorComponent") and opts is not None:
            err(f'{prefix} "{uname}": "options" must not be present for type "{stype}"'); errors += 1

        if errors == 0: ok(f'"{uname}" ({stype}) ✓')

    # Summary
    print(f"\n\033[2m{'─'*55}{D}")
    print(f"  Errors : {(R+B) if errors else G}{errors}{D}")
    print(f"\033[2m{'─'*55}{D}")
    if errors == 0:
        print(f"\n{G}{B}  ✓  Manifest PASSED — safe to proceed to Gate 3.5{D}\n")
        sys.exit(0)
    else:
        print(f"\n{R}{B}  ✗  Manifest FAILED — fix errors before writing main.js{D}\n")
        sys.exit(1)

if __name__=="__main__": main()

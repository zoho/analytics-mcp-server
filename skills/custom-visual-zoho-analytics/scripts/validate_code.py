#!/usr/bin/env python3
"""
validate_code.py  (Gate 4 — main.js Code Review)
─────────────────────────────────────────────────
Scans main.js for three categories of issues:

  Check 1 — ES5 violations  (const/let/arrow/class/template literals/spread/import/export)
  Check 2 — Security        (fetch, eval, localStorage, WebSocket, window.top, etc.)
  Check 3 — ZAViz API misuse (wrong getSuitableStyle key, 0-based getFormattedValue,
                               coords passed to direct-action APIs, etc.)

Reports line numbers for every match so fixes are immediate.

Usage:
  python validate_code.py
  python validate_code.py --js path/to/main.js

Exit: 0 = pass, 1 = one or more errors
"""
import argparse, re, sys
from pathlib import Path

G="\033[92m"; R="\033[91m"; Y="\033[93m"; B="\033[1m"; D="\033[0m"; DM="\033[2m"
def ok(m):   print(f"    {G}✓{D}  {m}")
def err(m):  print(f"    {R}✗{D}  {m}")
def warn(m): print(f"    {Y}⚠{D}  {m}")
def sec(m):  print(f"\n{B}{m}{D}")

# ── Strip comments and strings so patterns don't fire inside them ─────────────
def strip_strings_and_comments(src):
    """Replace string/template/comment content with spaces (keeps line numbers)."""
    result = list(src)
    i = 0
    while i < len(src):
        # single-line comment
        if src[i:i+2] == "//":
            j = src.find('\n', i)
            if j == -1: j = len(src)
            for k in range(i, j): result[k] = ' '
            i = j
        # multi-line comment
        elif src[i:i+2] == "/*":
            j = src.find('*/', i+2)
            if j == -1: j = len(src)-2
            for k in range(i, j+2):
                if src[k] != '\n': result[k] = ' '
            i = j+2
        # backtick template literal
        elif src[i] == '`':
            j = i+1
            while j < len(src) and src[j] != '`':
                if src[j] == '\\': j += 1
                if src[j] != '\n': result[j] = ' '
                j += 1
            result[i] = ' '
            if j < len(src): result[j] = ' '
            i = j+1
        # single-quoted string
        elif src[i] == "'":
            j = i+1
            while j < len(src) and src[j] != "'" and src[j] != '\n':
                if src[j] == '\\': j += 1
                result[j] = ' '
                j += 1
            result[i] = ' '
            if j < len(src) and src[j] == "'": result[j] = ' '
            i = j+1
        # double-quoted string
        elif src[i] == '"':
            j = i+1
            while j < len(src) and src[j] != '"' and src[j] != '\n':
                if src[j] == '\\': j += 1
                result[j] = ' '
                j += 1
            result[i] = ' '
            if j < len(src) and src[j] == '"': result[j] = ' '
            i = j+1
        else:
            i += 1
    return ''.join(result)

def line_numbers(src, pattern, flags=0):
    """Return list of (lineno, matched_text) for all matches in src."""
    lines  = src.split('\n')
    hits   = []
    offset = 0
    for lineno, line in enumerate(lines, 1):
        for m in re.finditer(pattern, line, flags):
            hits.append((lineno, m.group().strip()))
        offset += len(line) + 1
    return hits

def report_hits(hits, label):
    for lineno, text in hits:
        print(f"    {R}✗{D}  Line {lineno}: {text!r}  ← {label}")
    return len(hits)

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--js", default="main.js")
    a = p.parse_args()
    path = Path(a.js)
    errors = 0; warnings = 0

    print(f"\n{B}Code Validator{D}")
    print(f"{DM}{'─'*55}{D}")
    print(f"  File : {path}")

    if not path.exists():
        print(f"{R}ERROR:{D} File not found: {path}"); sys.exit(1)

    raw  = path.read_text(encoding="utf-8")
    src  = strip_strings_and_comments(raw)
    raw_lines = raw.split('\n')

    # ── Check 1 — ES5 violations ──────────────────────────────────────────────
    sec("Check 1 — ES5 Compliance")
    es5_rules = [
        (r'\bconst\b',                               'Use var instead of const'),
        (r'\blet\b',                                 'Use var instead of let'),
        (r'=>',                                      'Arrow function — use function() {}'),
        (r'`',                                       'Template literal — use string concatenation'),
        (r'\bclass\b\s+\w+',                        'class keyword — not allowed in ES5'),
        (r'\bimport\b\s+',                          'import statement — not allowed'),
        (r'\bexport\b\s+(default|function|const|var|let|class)', 'export statement — not allowed'),
        (r'\bvar\s*\{[^}]+\}\s*=',                 'Object destructuring — not allowed in ES5'),
        (r'\bvar\s*\[[^\]]+\]\s*=',                'Array destructuring — not allowed in ES5'),
        (r'(?<!\.)\.{3}',                            'Spread/rest operator — not allowed in ES5'),
        (r'\bfunction\s*\w*\s*\([^)]*=[^)]*\)',     'Default parameter — not allowed in ES5'),
        (r'\bfor\s*\(.*\bof\b',                     'for...of loop — not allowed in ES5; use for loop'),
        (r'\bfor\s*\(.*\bin\b.*\b(?:let|const)\b', 'for...in with let/const — use var'),
        (r'\basync\b\s+function|\bawait\b\s+',      'async/await — not allowed in ES5'),
    ]
    clean = 0
    for pattern, label in es5_rules:
        hits = line_numbers(src, pattern)
        if hits:
            errors += report_hits(hits, label)
        else:
            clean += 1
    if clean == len(es5_rules):
        ok("No ES5 violations detected")

    # ── Check 2 — Security forbidden patterns ─────────────────────────────────
    sec("Check 2 — Security (Forbidden Patterns)")
    # Tuple: (pattern, label, use_ignorecase)
    # Function( is case-sensitive — must NOT use IGNORECASE (would match IIFE `function()`)
    sec_rules = [
        (r'\bfetch\s*\(',                           'fetch() — all dependencies must be in manifest, no runtime network calls',        True),
        (r'\bXMLHttpRequest\b',                     'XMLHttpRequest — not allowed',                                                     False),
        (r'\beval\s*\(',                            'eval() — not allowed',                                                             True),
        (r'(?:new\s+|[^a-zA-Z])Function\s*\(',     'Function() constructor — not allowed (dynamic code execution)',                    False),
        (r'\blocalStorage\b',                       'localStorage — not allowed',                                                       False),
        (r'\bsessionStorage\b',                     'sessionStorage — not allowed',                                                     False),
        (r'\bindexedDB\b',                          'indexedDB — not allowed',                                                          False),
        (r'\bWebSocket\b',                          'WebSocket — not allowed',                                                          False),
        (r'\bEventSource\b',                        'EventSource — not allowed',                                                        False),
        (r'\bwindow\.top\b',                        'window.top — cross-frame access not allowed',                                      False),
        (r'\bwindow\.parent\b',                     'window.parent — cross-frame access not allowed',                                   False),
        (r'\bwindow\.opener\b',                     'window.opener — not allowed',                                                     False),
        (r'\bwindow\.open\s*\(',                    'window.open() — not allowed',                                                     False),
        (r'\bwindow\.location\b',                   'window.location — navigation not allowed',                                        False),
        (r'\bdocument\.cookie\b',                   'document.cookie — not allowed',                                                   False),
        (r'\balert\s*\(',                           'alert() — not allowed',                                                            True),
        (r'\bconfirm\s*\(',                         'confirm() — not allowed',                                                          True),
        (r'\bprompt\s*\(',                          'prompt() — not allowed',                                                           True),
        (r'<iframe',                                '<iframe> injection — not allowed',                                                  True),
        (r'<object',                                '<object> injection — not allowed',                                                  True),
        (r'<embed',                                 '<embed> injection — not allowed',                                                   True),
    ]
    clean = 0
    for pattern, label, ci in sec_rules:
        flags = re.IGNORECASE if ci else 0
        hits = line_numbers(src, pattern, flags)
        if hits:
            errors += report_hits(hits, label)
        else:
            clean += 1
    if clean == len(sec_rules):
        ok("No forbidden security patterns found")

    # ── Check 3 — ZAViz API misuse ────────────────────────────────────────────
    sec("Check 3 — ZAViz API Correctness")

    # Wrong getSuitableStyle key (scan raw, these are inside strings)
    api_misuse = [
        (r"getSuitableStyle\s*\(\s*['\"]backgroundColor['\"]",
            "Wrong key 'backgroundColor' — use 'background'"),
        (r"getSuitableStyle\s*\(\s*['\"]color['\"]",
            "Wrong key 'color' — use 'fontColor'"),
        (r"getSuitableStyle\s*\(\s*['\"]chartColors['\"]",
            "Wrong key 'chartColors' — use 'legendColor'"),
        (r"getSuitableStyle\s*\(\s*['\"]palette['\"]",
            "Wrong key 'palette' — use 'legendColor'"),
        (r"getFormattedValue\s*\(\s*(?:idx\s*\([^)]+\)|[a-zA-Z_]\w*(?:\.\w+)*)\s*,",
            "getFormattedValue first arg appears to be 0-based — must be idx(col)+1 (1-based)"),
        (r"invokeViewUnderlyingData\s*\([^)]+,\s*\{",
            "invokeViewUnderlyingData does not accept coordinates — remove second argument"),
        (r"invokeExplainData\s*\([^)]+,\s*\{",
            "invokeExplainData does not accept coordinates — remove second argument"),
        (r"invokeDrillThrough\s*\([^)]+,\s*['\"][^'\"]+['\"],\s*\{",
            "invokeDrillThrough third arg looks like coordinates — it takes (payload, viewName) only"),
        (r"showInteractionMenu\s*\([^)]+\)\s*(?!.*\{)",
            "showInteractionMenu called without coordinates — second arg {x,y} is required"),
    ]
    clean = 0
    for pattern, label in api_misuse:
        hits = line_numbers(raw, pattern)
        if hits:
            errors += report_hits(hits, label)
        else:
            clean += 1
    if clean == len(api_misuse):
        ok("No ZAViz API misuse detected")

    # Warn: direct customSettings access without getSetting wrapper
    direct_hits = line_numbers(raw, r'customSettings\.([A-Za-z0-9_]+)')
    getset_hits = line_numbers(raw, r'getSetting\s*\(')
    if direct_hits and not getset_hits:
        warn(f"{len(direct_hits)} direct customSettings access(es) with no getSetting() wrapper — add fallback for robustness")
        warnings += len(direct_hits)

    # Summary
    print(f"\n{DM}{'─'*55}{D}")
    print(f"  Errors   : {(R+B) if errors else G}{errors}{D}")
    print(f"  Warnings : {Y if warnings else G}{warnings}{D}")
    print(f"{DM}{'─'*55}{D}")
    if errors == 0:
        print(f"\n{G}{B}  ✓  Code checks PASSED{D}\n")
        sys.exit(0)
    else:
        print(f"\n{R}{B}  ✗  Code checks FAILED — fix errors before packaging{D}\n")
        sys.exit(1)

if __name__=="__main__": main()

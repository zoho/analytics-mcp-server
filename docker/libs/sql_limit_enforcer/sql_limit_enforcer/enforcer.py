"""
sql_limit_enforcer.enforcer
~~~~~~~~~~~~~~~~~~~~~~~~~~~

Zero-dependency module that tokenizes a MySQL-compatible SELECT query and
enforces an upper bound on the outermost LIMIT clause.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto
from typing import List, Optional, Tuple


# ---------------------------------------------------------------------------
# Token types
# ---------------------------------------------------------------------------

class TokenType(Enum):
    WORD = auto()
    NUMBER = auto()
    WHITESPACE = auto()
    COMMA = auto()
    PAREN_OPEN = auto()
    PAREN_CLOSE = auto()
    STRING = auto()      # single-quoted, double-quoted, or backtick-quoted
    COMMENT = auto()     # -- line comment or /* block comment */
    SEMICOLON = auto()
    OTHER = auto()


@dataclass(slots=True)
class Token:
    type: TokenType
    value: str
    start: int          # position in original query string
    end: int            # exclusive end position
    depth: int          # parenthesis depth at the point this token starts


# ---------------------------------------------------------------------------
# Tokenizer
# ---------------------------------------------------------------------------

def tokenize(sql: str) -> List[Token]:
    """Tokenize a SQL string, tracking parenthesis depth for each token."""
    tokens: List[Token] = []
    i = 0
    n = len(sql)
    depth = 0

    while i < n:
        ch = sql[i]

        # --- Whitespace ---
        if ch in (' ', '\t', '\n', '\r'):
            start = i
            while i < n and sql[i] in (' ', '\t', '\n', '\r'):
                i += 1
            tokens.append(Token(TokenType.WHITESPACE, sql[start:i], start, i, depth))
            continue

        # --- Line comment: -- ... ---
        if ch == '-' and i + 1 < n and sql[i + 1] == '-':
            start = i
            i += 2
            while i < n and sql[i] != '\n':
                i += 1
            if i < n:
                i += 1  # consume the newline
            tokens.append(Token(TokenType.COMMENT, sql[start:i], start, i, depth))
            continue

        # --- Block comment: /* ... */ ---
        if ch == '/' and i + 1 < n and sql[i + 1] == '*':
            start = i
            i += 2
            while i < n and not (sql[i] == '*' and i + 1 < n and sql[i + 1] == '/'):
                i += 1
            i += 2  # skip */
            tokens.append(Token(TokenType.COMMENT, sql[start:i], start, i, depth))
            continue

        # --- Hash comment: # ... ---
        if ch == '#':
            start = i
            i += 1
            while i < n and sql[i] != '\n':
                i += 1
            if i < n:
                i += 1
            tokens.append(Token(TokenType.COMMENT, sql[start:i], start, i, depth))
            continue

        # --- Single-quoted string ---
        if ch == "'":
            start = i
            i += 1
            while i < n:
                if sql[i] == '\\':
                    i += 2  # skip escaped char
                elif sql[i] == "'":
                    if i + 1 < n and sql[i + 1] == "'":
                        i += 2  # doubled-quote escape
                    else:
                        i += 1
                        break
                else:
                    i += 1
            tokens.append(Token(TokenType.STRING, sql[start:i], start, i, depth))
            continue

        # --- Double-quoted string ---
        if ch == '"':
            start = i
            i += 1
            while i < n:
                if sql[i] == '\\':
                    i += 2
                elif sql[i] == '"':
                    if i + 1 < n and sql[i + 1] == '"':
                        i += 2
                    else:
                        i += 1
                        break
                else:
                    i += 1
            tokens.append(Token(TokenType.STRING, sql[start:i], start, i, depth))
            continue

        # --- Backtick-quoted identifier ---
        if ch == '`':
            start = i
            i += 1
            while i < n:
                if sql[i] == '`':
                    if i + 1 < n and sql[i + 1] == '`':
                        i += 2
                    else:
                        i += 1
                        break
                else:
                    i += 1
            tokens.append(Token(TokenType.STRING, sql[start:i], start, i, depth))
            continue

        # --- Parentheses ---
        if ch == '(':
            tokens.append(Token(TokenType.PAREN_OPEN, ch, i, i + 1, depth))
            depth += 1
            i += 1
            continue
        if ch == ')':
            depth -= 1
            tokens.append(Token(TokenType.PAREN_CLOSE, ch, i, i + 1, depth))
            i += 1
            continue

        # --- Comma ---
        if ch == ',':
            tokens.append(Token(TokenType.COMMA, ch, i, i + 1, depth))
            i += 1
            continue

        # --- Semicolon ---
        if ch == ';':
            tokens.append(Token(TokenType.SEMICOLON, ch, i, i + 1, depth))
            i += 1
            continue

        # --- Number (integer or decimal) ---
        if ch.isdigit():
            start = i
            while i < n and (sql[i].isdigit() or sql[i] == '.'):
                i += 1
            tokens.append(Token(TokenType.NUMBER, sql[start:i], start, i, depth))
            continue

        # --- Word (keyword or identifier) ---
        if ch.isalpha() or ch == '_':
            start = i
            while i < n and (sql[i].isalnum() or sql[i] == '_'):
                i += 1
            tokens.append(Token(TokenType.WORD, sql[start:i], start, i, depth))
            continue

        # --- Other (operators, dots, etc.) ---
        tokens.append(Token(TokenType.OTHER, ch, i, i + 1, depth))
        i += 1

    return tokens


# ---------------------------------------------------------------------------
# Enforcement logic
# ---------------------------------------------------------------------------

def _find_outermost_limit(tokens: List[Token]) -> Optional[int]:
    """Return the index of the outermost LIMIT keyword token, or None."""
    # We want the *last* LIMIT at depth 0 (in case of UNION queries, the
    # final LIMIT applies to the entire result).
    # A valid LIMIT clause must be followed by a NUMBER (possibly after
    # whitespace/comments).  This distinguishes the keyword from identifiers
    # like column or table names that happen to be called "limit".
    result: Optional[int] = None
    for idx, tok in enumerate(tokens):
        if (
            tok.type == TokenType.WORD
            and tok.value.upper() == 'LIMIT'
            and tok.depth == 0
        ):
            # Verify this is a real LIMIT clause (followed by a number)
            next_idx = _next_meaningful(tokens, idx + 1)
            if next_idx is not None and tokens[next_idx].type == TokenType.NUMBER:
                result = idx
    return result


def _next_meaningful(tokens: List[Token], start: int) -> Optional[int]:
    """Return index of the next non-whitespace, non-comment token from start."""
    for idx in range(start, len(tokens)):
        if tokens[idx].type not in (TokenType.WHITESPACE, TokenType.COMMENT):
            return idx
    return None


def _parse_count(value: str) -> Optional[int]:
    """Parse a LIMIT count token; return None if it is not a plain integer."""
    try:
        return int(value)
    except ValueError:
        return None


def enforce_limit(query: str, upper_limit: int) -> str:
    """
    Enforce an upper bound on the outermost LIMIT of a MySQL SELECT query.

    Parameters
    ----------
    query : str
        A MySQL-compatible SELECT statement.
    upper_limit : int
        The maximum number of rows allowed.

    Returns
    -------
    str
        The query with the LIMIT enforced.  Any trailing semicolons are
        stripped from the result.
    """
    if upper_limit < 0:
        raise ValueError("upper_limit must be a non-negative integer")

    tokens = tokenize(query)
    limit_idx = _find_outermost_limit(tokens)

    # Strip trailing semicolons and surrounding whitespace from the token list.
    # We do this *after* finding the LIMIT so we don't misidentify positions.
    while tokens and tokens[-1].type in (TokenType.SEMICOLON, TokenType.WHITESPACE):
        tokens.pop()

    if limit_idx is None:
        # Case (i): No outermost LIMIT. Append one.
        base = _rebuild(tokens)
        return f"{base} LIMIT {upper_limit}"

    # There is an outermost LIMIT. Parse what follows it.
    # Possible patterns:
    #   LIMIT <count>
    #   LIMIT <count> OFFSET <offset>
    #   LIMIT <offset>, <count>

    pos = _next_meaningful(tokens, limit_idx + 1)
    if pos is None or tokens[pos].type != TokenType.NUMBER:
        # Can't parse — return as-is (defensive)
        return _rebuild(tokens)

    first_num_idx = pos
    first_num_val = _parse_count(tokens[pos].value)
    if first_num_val is None:
        # Non-integer LIMIT count (e.g. LIMIT 10.5) — can't parse, return as-is
        return _rebuild(tokens)

    # Look ahead to determine the form
    next_pos = _next_meaningful(tokens, pos + 1)

    if next_pos is not None and tokens[next_pos].type == TokenType.COMMA:
        # Form: LIMIT <offset>, <count>
        count_idx_pos = _next_meaningful(tokens, next_pos + 1)
        if count_idx_pos is not None and tokens[count_idx_pos].type == TokenType.NUMBER:
            count_val = _parse_count(tokens[count_idx_pos].value)
            if count_val is None:
                # Non-integer count — can't parse, return as-is
                return _rebuild(tokens)
            if count_val <= upper_limit:
                # Case (ii): already within bounds
                return _rebuild(tokens)
            else:
                # Case (iii): override count
                tokens[count_idx_pos] = Token(
                    TokenType.NUMBER,
                    str(upper_limit),
                    tokens[count_idx_pos].start,
                    tokens[count_idx_pos].end,
                    tokens[count_idx_pos].depth,
                )
                return _rebuild(tokens)
        else:
            # Can't parse count after comma — return as-is
            return _rebuild(tokens)

    elif next_pos is not None and tokens[next_pos].type == TokenType.WORD and tokens[next_pos].value.upper() == 'OFFSET':
        # Form: LIMIT <count> OFFSET <offset>
        count_val = first_num_val
        if count_val <= upper_limit:
            return _rebuild(tokens)
        else:
            tokens[first_num_idx] = Token(
                TokenType.NUMBER,
                str(upper_limit),
                tokens[first_num_idx].start,
                tokens[first_num_idx].end,
                tokens[first_num_idx].depth,
            )
            return _rebuild(tokens)

    else:
        # Form: LIMIT <count>
        count_val = first_num_val
        if count_val <= upper_limit:
            return _rebuild(tokens)
        else:
            tokens[first_num_idx] = Token(
                TokenType.NUMBER,
                str(upper_limit),
                tokens[first_num_idx].start,
                tokens[first_num_idx].end,
                tokens[first_num_idx].depth,
            )
            return _rebuild(tokens)


def _rebuild(tokens: List[Token]) -> str:
    """Rebuild the SQL string from tokens."""
    return ''.join(tok.value for tok in tokens)

/**
 * sql-limit-enforcer/enforcer
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~
 *
 * Zero-dependency module that tokenizes a MySQL-compatible SELECT query and
 * enforces an upper bound on the outermost LIMIT clause.
 */

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

export enum TokenType {
  WORD = "WORD",
  NUMBER = "NUMBER",
  WHITESPACE = "WHITESPACE",
  COMMA = "COMMA",
  PAREN_OPEN = "PAREN_OPEN",
  PAREN_CLOSE = "PAREN_CLOSE",
  STRING = "STRING",   // single-quoted, double-quoted, or backtick-quoted
  COMMENT = "COMMENT", // -- line comment or /* block comment */
  SEMICOLON = "SEMICOLON",
  OTHER = "OTHER",
}

export interface Token {
  type: TokenType;
  value: string;
  start: number;  // position in original query string
  end: number;    // exclusive end position
  depth: number;  // parenthesis depth at the point this token starts
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isAlpha(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function isAlnum(ch: string): boolean {
  return isAlpha(ch) || isDigit(ch);
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

/**
 * Tokenize a SQL string, tracking parenthesis depth for each token.
 */
export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = sql.length;
  let depth = 0;

  while (i < n) {
    const ch = sql[i];

    // --- Whitespace ---
    if (isWhitespace(ch)) {
      const start = i;
      while (i < n && isWhitespace(sql[i])) {
        i++;
      }
      tokens.push({ type: TokenType.WHITESPACE, value: sql.slice(start, i), start, end: i, depth });
      continue;
    }

    // --- Line comment: -- ... ---
    if (ch === "-" && i + 1 < n && sql[i + 1] === "-") {
      const start = i;
      i += 2;
      while (i < n && sql[i] !== "\n") {
        i++;
      }
      if (i < n) {
        i++; // consume the newline
      }
      tokens.push({ type: TokenType.COMMENT, value: sql.slice(start, i), start, end: i, depth });
      continue;
    }

    // --- Block comment: /* ... */ ---
    if (ch === "/" && i + 1 < n && sql[i + 1] === "*") {
      const start = i;
      i += 2;
      while (i < n && !(sql[i] === "*" && i + 1 < n && sql[i + 1] === "/")) {
        i++;
      }
      i += 2; // skip */
      tokens.push({ type: TokenType.COMMENT, value: sql.slice(start, i), start, end: i, depth });
      continue;
    }

    // --- Hash comment: # ... ---
    if (ch === "#") {
      const start = i;
      i++;
      while (i < n && sql[i] !== "\n") {
        i++;
      }
      if (i < n) {
        i++;
      }
      tokens.push({ type: TokenType.COMMENT, value: sql.slice(start, i), start, end: i, depth });
      continue;
    }

    // --- Single-quoted string ---
    if (ch === "'") {
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === "\\") {
          i += 2; // skip escaped char
        } else if (sql[i] === "'") {
          if (i + 1 < n && sql[i + 1] === "'") {
            i += 2; // doubled-quote escape
          } else {
            i++;
            break;
          }
        } else {
          i++;
        }
      }
      tokens.push({ type: TokenType.STRING, value: sql.slice(start, i), start, end: i, depth });
      continue;
    }

    // --- Double-quoted string ---
    if (ch === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === "\\") {
          i += 2;
        } else if (sql[i] === '"') {
          if (i + 1 < n && sql[i + 1] === '"') {
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          i++;
        }
      }
      tokens.push({ type: TokenType.STRING, value: sql.slice(start, i), start, end: i, depth });
      continue;
    }

    // --- Backtick-quoted identifier ---
    if (ch === "`") {
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === "`") {
          if (i + 1 < n && sql[i + 1] === "`") {
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          i++;
        }
      }
      tokens.push({ type: TokenType.STRING, value: sql.slice(start, i), start, end: i, depth });
      continue;
    }

    // --- Parentheses ---
    if (ch === "(") {
      tokens.push({ type: TokenType.PAREN_OPEN, value: ch, start: i, end: i + 1, depth });
      depth++;
      i++;
      continue;
    }
    if (ch === ")") {
      depth--;
      tokens.push({ type: TokenType.PAREN_CLOSE, value: ch, start: i, end: i + 1, depth });
      i++;
      continue;
    }

    // --- Comma ---
    if (ch === ",") {
      tokens.push({ type: TokenType.COMMA, value: ch, start: i, end: i + 1, depth });
      i++;
      continue;
    }

    // --- Semicolon ---
    if (ch === ";") {
      tokens.push({ type: TokenType.SEMICOLON, value: ch, start: i, end: i + 1, depth });
      i++;
      continue;
    }

    // --- Number (integer or decimal) ---
    if (isDigit(ch)) {
      const start = i;
      while (i < n && (isDigit(sql[i]) || sql[i] === ".")) {
        i++;
      }
      tokens.push({ type: TokenType.NUMBER, value: sql.slice(start, i), start, end: i, depth });
      continue;
    }

    // --- Word (keyword or identifier) ---
    if (isAlpha(ch) || ch === "_") {
      const start = i;
      while (i < n && (isAlnum(sql[i]) || sql[i] === "_")) {
        i++;
      }
      tokens.push({ type: TokenType.WORD, value: sql.slice(start, i), start, end: i, depth });
      continue;
    }

    // --- Other (operators, dots, etc.) ---
    tokens.push({ type: TokenType.OTHER, value: ch, start: i, end: i + 1, depth });
    i++;
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Enforcement logic
// ---------------------------------------------------------------------------

/**
 * Return the index of the outermost LIMIT keyword token, or null.
 *
 * We want the *last* LIMIT at depth 0 (in case of UNION queries, the
 * final LIMIT applies to the entire result).
 * A valid LIMIT clause must be followed by a NUMBER (possibly after
 * whitespace/comments). This distinguishes the keyword from identifiers
 * like column or table names that happen to be called "limit".
 */
function findOutermostLimit(tokens: Token[]): number | null {
  let result: number | null = null;
  for (let idx = 0; idx < tokens.length; idx++) {
    const tok = tokens[idx];
    if (
      tok.type === TokenType.WORD &&
      tok.value.toUpperCase() === "LIMIT" &&
      tok.depth === 0
    ) {
      // Verify this is a real LIMIT clause (followed by a number)
      const nextIdx = nextMeaningful(tokens, idx + 1);
      if (nextIdx !== null && tokens[nextIdx].type === TokenType.NUMBER) {
        result = idx;
      }
    }
  }
  return result;
}

/**
 * Return index of the next non-whitespace, non-comment token from start.
 */
function nextMeaningful(tokens: Token[], start: number): number | null {
  for (let idx = start; idx < tokens.length; idx++) {
    if (
      tokens[idx].type !== TokenType.WHITESPACE &&
      tokens[idx].type !== TokenType.COMMENT
    ) {
      return idx;
    }
  }
  return null;
}

/**
 * Rebuild the SQL string from tokens.
 */
function rebuild(tokens: Token[]): string {
  return tokens.map((t) => t.value).join("");
}

/**
 * Enforce an upper bound on the outermost LIMIT of a MySQL SELECT query.
 *
 * @param query - A MySQL-compatible SELECT statement.
 * @param upperLimit - The maximum number of rows allowed.
 * @returns The query with the LIMIT enforced. Any trailing semicolons are
 *          stripped from the result.
 * @throws {Error} If upperLimit is negative.
 */
export function enforceLimit(query: string, upperLimit: number): string {
  if (upperLimit < 0) {
    throw new Error("upperLimit must be a non-negative integer");
  }

  const tokens = tokenize(query);
  const limitIdx = findOutermostLimit(tokens);

  // Strip trailing semicolons and surrounding whitespace from the token list.
  // We do this *after* finding the LIMIT so we don't misidentify positions.
  while (
    tokens.length > 0 &&
    (tokens[tokens.length - 1].type === TokenType.SEMICOLON ||
      tokens[tokens.length - 1].type === TokenType.WHITESPACE)
  ) {
    tokens.pop();
  }

  if (limitIdx === null) {
    // Case (i): No outermost LIMIT. Append one.
    const base = rebuild(tokens);
    return `${base} LIMIT ${upperLimit}`;
  }

  // There is an outermost LIMIT. Parse what follows it.
  // Possible patterns:
  //   LIMIT <count>
  //   LIMIT <count> OFFSET <offset>
  //   LIMIT <offset>, <count>

  const pos = nextMeaningful(tokens, limitIdx + 1);
  if (pos === null || tokens[pos].type !== TokenType.NUMBER) {
    // Can't parse — return as-is (defensive)
    return rebuild(tokens);
  }

  const firstNumIdx = pos;
  const firstNumVal = parseInt(tokens[pos].value, 10);

  // Look ahead to determine the form
  const nextPos = nextMeaningful(tokens, pos + 1);

  if (nextPos !== null && tokens[nextPos].type === TokenType.COMMA) {
    // Form: LIMIT <offset>, <count>
    const countIdxPos = nextMeaningful(tokens, nextPos + 1);
    if (countIdxPos !== null && tokens[countIdxPos].type === TokenType.NUMBER) {
      const countVal = parseInt(tokens[countIdxPos].value, 10);
      if (countVal <= upperLimit) {
        // Case (ii): already within bounds
        return rebuild(tokens);
      } else {
        // Case (iii): override count
        tokens[countIdxPos] = {
          ...tokens[countIdxPos],
          value: String(upperLimit),
        };
        return rebuild(tokens);
      }
    } else {
      // Can't parse count after comma — return as-is
      return rebuild(tokens);
    }
  } else if (
    nextPos !== null &&
    tokens[nextPos].type === TokenType.WORD &&
    tokens[nextPos].value.toUpperCase() === "OFFSET"
  ) {
    // Form: LIMIT <count> OFFSET <offset>
    const countVal = firstNumVal;
    if (countVal <= upperLimit) {
      return rebuild(tokens);
    } else {
      tokens[firstNumIdx] = {
        ...tokens[firstNumIdx],
        value: String(upperLimit),
      };
      return rebuild(tokens);
    }
  } else {
    // Form: LIMIT <count>
    const countVal = firstNumVal;
    if (countVal <= upperLimit) {
      return rebuild(tokens);
    } else {
      tokens[firstNumIdx] = {
        ...tokens[firstNumIdx],
        value: String(upperLimit),
      };
      return rebuild(tokens);
    }
  }
}

import { enforceLimit, tokenize, TokenType } from "../sql-limit-enforcer";

describe("tokenize", () => {
  it("tokenizes a basic SELECT", () => {
    const tokens = tokenize("SELECT * FROM t LIMIT 10");
    expect(tokens.map((t) => t.type)).toContain(TokenType.WORD);
    expect(tokens.map((t) => t.value).join("")).toBe("SELECT * FROM t LIMIT 10");
  });
});

describe("enforceLimit", () => {
  it("clamps a simple LIMIT", () => {
    expect(enforceLimit("SELECT * FROM t LIMIT 100", 10)).toBe("SELECT * FROM t LIMIT 10");
  });

  it("leaves an unchanged limit", () => {
    expect(enforceLimit("SELECT * FROM t LIMIT 5", 10)).toBe("SELECT * FROM t LIMIT 5");
  });

  it("preserves offset in LIMIT N OFFSET M", () => {
    expect(enforceLimit("SELECT * FROM t LIMIT 100 OFFSET 5", 10)).toBe(
      "SELECT * FROM t LIMIT 10 OFFSET 5",
    );
  });

  it("preserves M in LIMIT M, N", () => {
    expect(enforceLimit("SELECT * FROM t LIMIT 5, 100", 10)).toBe("SELECT * FROM t LIMIT 5, 10");
  });

  it("appends LIMIT when missing", () => {
    expect(enforceLimit("SELECT * FROM t", 10)).toBe("SELECT * FROM t LIMIT 10");
  });

  it("targets outermost limit in nested subquery", () => {
    const q = "SELECT * FROM (SELECT * FROM t LIMIT 100) x LIMIT 50";
    expect(enforceLimit(q, 10)).toBe("SELECT * FROM (SELECT * FROM t LIMIT 100) x LIMIT 10");
  });

  it("targets final limit in UNION", () => {
    const q = "SELECT * FROM a LIMIT 100 UNION SELECT * FROM b LIMIT 50";
    expect(enforceLimit(q, 10)).toBe("SELECT * FROM a LIMIT 100 UNION SELECT * FROM b LIMIT 10");
  });

  it("handles empty input", () => {
    expect(enforceLimit("", 10)).toBe(" LIMIT 10");
  });

  it("returns malformed input as-is", () => {
    expect(enforceLimit("SELECT * FROM t LIMIT 5,", 10)).toBe("SELECT * FROM t LIMIT 5,");
  });

  it("throws on negative upperLimit", () => {
    expect(() => enforceLimit("SELECT * FROM t", -1)).toThrow();
  });
});

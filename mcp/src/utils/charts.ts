/**
 * Normalizes a string for fuzzy search comparison.
 */
function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from(
    { length: a.length + 1 },
    () => Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function levenshteinSimilarity(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - levenshtein(a, b) / maxLength;
}

function chartTypeSimilarity(input: string, candidate: string): number {
  const a = normalizeForSearch(input);
  const b = normalizeForSearch(candidate);
  if (a === b) return 1;
  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const intersection = [...aTokens].filter((token) => bTokens.has(token));
  const tokenScore = intersection.length / Math.max(aTokens.size, bTokens.size);
  const editScore = levenshteinSimilarity(a, b);
  return editScore * 0.7 + tokenScore * 0.3;
}

/**
 * Finds the most likely chart type aliases for an unrecognized chart type
 * using fuzzy string matching.
 *
 * @param chartType - The user-provided chart type to match.
 * @param aliases   - A map of supported chart type aliases (key → canonical key).
 * @param limit     - Maximum number of suggestions to return.
 * @returns The closest matching chart type alias keys, ranked by similarity.
 */
export function getChartTypeSuggestions(
  chartType: string,
  aliases: Record<string, string>,
  limit = 3
): string[] {
  return Object.keys(aliases)
    .map((alias) => ({
      alias,
      score: chartTypeSimilarity(chartType, alias),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((result) => result.alias);
}

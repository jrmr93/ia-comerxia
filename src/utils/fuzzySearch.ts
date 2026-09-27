import { InventoryItem } from '../types.ts';

/**
 * Fuzzy Text Normalization & Search Utility
 * Handles typos, accent-free matching, live auto-complete, and "Did you mean?" suggestions.
 */

export function normalizeFuzzyText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics / accents
    .replace(/[^a-z0-9\s]/g, '') // remove non-alphanumeric symbols
    .trim();
}

export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function fuzzyWordMatchScore(queryWord: string, targetText: string): number {
  const normTarget = normalizeFuzzyText(targetText);
  const normQuery = normalizeFuzzyText(queryWord);
  if (!normQuery || !normTarget) return 0;

  if (normTarget.includes(normQuery)) return 1.0;

  const targetWords = normTarget.split(/\s+/);
  let maxScore = 0;

  for (const word of targetWords) {
    if (word.startsWith(normQuery)) return 0.95;
    if (word.includes(normQuery)) return 0.85;

    if (normQuery.length >= 3 && Math.abs(word.length - normQuery.length) <= 2) {
      const dist = levenshteinDistance(normQuery, word);
      if (dist === 1) maxScore = Math.max(maxScore, 0.8);
      else if (dist === 2 && normQuery.length >= 5) maxScore = Math.max(maxScore, 0.65);
    }
  }

  return maxScore;
}

export interface FuzzySearchResult {
  item: InventoryItem;
  score: number;
  exactMatch: boolean;
}

export function searchProductsFuzzy(
  products: InventoryItem[],
  query: string
): {
  matches: InventoryItem[];
  didYouMean: string | null;
  suggestedCategories: string[];
} {
  const rawQ = query.trim();
  if (!rawQ) {
    return { matches: products, didYouMean: null, suggestedCategories: [] };
  }

  const normQuery = normalizeFuzzyText(rawQ);
  const queryTokens = normQuery.split(/\s+/).filter(Boolean);

  const scoredList: FuzzySearchResult[] = [];

  (products || []).forEach((item) => {
    if (item.status === 'archived') return;

    const name = item.name || '';
    const sku = item.sku || '';
    const category = item.category || '';
    const tags = item.tags || '';
    const desc = item.description || '';

    const normName = normalizeFuzzyText(name);
    const normSku = normalizeFuzzyText(sku);
    const normCategory = normalizeFuzzyText(category);

    // Exact substring match
    const isExact =
      normName.includes(normQuery) ||
      normSku.includes(normQuery) ||
      normCategory.includes(normQuery) ||
      normalizeFuzzyText(desc).includes(normQuery) ||
      normalizeFuzzyText(tags).includes(normQuery);

    if (isExact) {
      scoredList.push({ item, score: 1.0, exactMatch: true });
      return;
    }

    // Token-by-token fuzzy scoring
    let tokenScoreSum = 0;
    queryTokens.forEach((token) => {
      const nameScore = fuzzyWordMatchScore(token, name);
      const categoryScore = fuzzyWordMatchScore(token, category);
      const tagScore = fuzzyWordMatchScore(token, tags);
      tokenScoreSum += Math.max(nameScore, categoryScore, tagScore);
    });

    const avgScore = queryTokens.length > 0 ? tokenScoreSum / queryTokens.length : 0;

    if (avgScore >= 0.55) {
      scoredList.push({ item, score: avgScore, exactMatch: false });
    }
  });

  scoredList.sort((a, b) => b.score - a.score);

  const matches = scoredList.map((s) => s.item);

  let didYouMean: string | null = null;
  const hasExactMatches = scoredList.some((s) => s.exactMatch);

  if (!hasExactMatches && matches.length > 0) {
    didYouMean = matches[0].name;
  }

  const categorySet = new Set<string>();
  matches.forEach((m) => {
    if (m.category) categorySet.add(m.category);
  });
  const suggestedCategories = Array.from(categorySet).slice(0, 3);

  return {
    matches,
    didYouMean,
    suggestedCategories,
  };
}

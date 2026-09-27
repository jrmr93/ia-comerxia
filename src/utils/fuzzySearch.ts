import { InventoryItem } from '../types.ts';

/**
 * Advanced Typo-Tolerant & Fuzzy Search Engine
 * Handles misspellings, typos, accent normalization, auto-complete, and smart "Did you mean?" suggestions.
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

/**
 * Calculates a fuzzy score (0.0 to 1.0) between a query word (potentially misspelled) and a target string.
 */
export function fuzzyWordMatchScore(queryWord: string, targetText: string): number {
  const normTarget = normalizeFuzzyText(targetText);
  const normQuery = normalizeFuzzyText(queryWord);
  if (!normQuery || !normTarget) return 0;

  // Exact substring match
  if (normTarget.includes(normQuery)) return 1.0;

  const targetWords = normTarget.split(/\s+/).filter(Boolean);
  let maxScore = 0;

  for (const word of targetWords) {
    if (word === normQuery) return 1.0;
    if (word.startsWith(normQuery)) return 0.95;
    if (normQuery.startsWith(word) && word.length >= 3) return 0.90;
    if (word.includes(normQuery)) return 0.85;

    const lenDiff = Math.abs(word.length - normQuery.length);

    // Allow Levenshtein typos based on word length
    if (normQuery.length >= 3 && lenDiff <= 3) {
      const dist = levenshteinDistance(normQuery, word);

      if (dist === 1) {
        maxScore = Math.max(maxScore, 0.85);
      } else if (dist === 2 && normQuery.length >= 4) {
        maxScore = Math.max(maxScore, 0.70);
      } else if (dist === 3 && normQuery.length >= 6) {
        maxScore = Math.max(maxScore, 0.55);
      }
    }

    // Prefix matching for typing speed (first 3 chars match)
    if (normQuery.length >= 3 && word.length >= 3 && normQuery.slice(0, 3) === word.slice(0, 3)) {
      maxScore = Math.max(maxScore, 0.60);
    }
  }

  return maxScore;
}

export interface FuzzySearchResult {
  item: InventoryItem;
  score: number;
  exactMatch: boolean;
}

/**
 * High-performance search function with multi-word typo tolerance, category suggestions, and "Did you mean?" suggestions.
 */
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
    const normDesc = normalizeFuzzyText(desc);
    const normTags = normalizeFuzzyText(tags);

    // 1. Exact substring check across all fields
    const isExact =
      normName.includes(normQuery) ||
      normSku.includes(normQuery) ||
      normCategory.includes(normQuery) ||
      normDesc.includes(normQuery) ||
      normTags.includes(normQuery);

    if (isExact) {
      scoredList.push({ item, score: 1.0, exactMatch: true });
      return;
    }

    // 2. Token-by-token fuzzy scoring for typos
    let tokenScoreSum = 0;
    let highestSingleTokenScore = 0;

    queryTokens.forEach((token) => {
      const nameScore = fuzzyWordMatchScore(token, name);
      const categoryScore = fuzzyWordMatchScore(token, category);
      const tagScore = fuzzyWordMatchScore(token, tags);
      const descScore = fuzzyWordMatchScore(token, desc) * 0.8;

      const bestTokenScore = Math.max(nameScore, categoryScore, tagScore, descScore);
      tokenScoreSum += bestTokenScore;
      highestSingleTokenScore = Math.max(highestSingleTokenScore, bestTokenScore);
    });

    const avgScore = queryTokens.length > 0 ? tokenScoreSum / queryTokens.length : 0;
    const finalScore = Math.max(avgScore, highestSingleTokenScore * 0.85);

    // Dynamic threshold: accepts item if score >= 0.40
    if (finalScore >= 0.40) {
      scoredList.push({ item, score: finalScore, exactMatch: false });
    }
  });

  // Sort descending by match score
  scoredList.sort((a, b) => b.score - a.score);

  // Fallback: If no matches were found under standard threshold, pick candidates with any partial token overlap
  if (scoredList.length === 0 && products.length > 0) {
    products.forEach((item) => {
      if (item.status === 'archived') return;
      const normName = normalizeFuzzyText(item.name || '');
      const normCat = normalizeFuzzyText(item.category || '');

      let fallbackScore = 0;
      queryTokens.forEach((token) => {
        if (normName.includes(token.slice(0, 2)) || normCat.includes(token.slice(0, 2))) {
          fallbackScore += 0.35;
        }
      });

      if (fallbackScore > 0) {
        scoredList.push({ item, score: fallbackScore, exactMatch: false });
      }
    });
    scoredList.sort((a, b) => b.score - a.score);
  }

  const matches = scoredList.map((s) => s.item);

  // Calculate "Did you mean?" suggestion if there are no exact matches but typo matches exist
  let didYouMean: string | null = null;
  const hasExactMatches = scoredList.some((s) => s.exactMatch);

  if (!hasExactMatches && matches.length > 0) {
    didYouMean = matches[0].name;
  }

  // Collect unique matching categories
  const categorySet = new Set<string>();
  matches.forEach((m) => {
    if (m.category) categorySet.add(m.category);
  });
  const suggestedCategories = Array.from(categorySet).slice(0, 4);

  return {
    matches,
    didYouMean,
    suggestedCategories,
  };
}

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
    if (normQuery.startsWith(word) && word.length >= 4) return 0.90;
    if (word.includes(normQuery) && normQuery.length >= 3) return 0.85;

    const lenDiff = Math.abs(word.length - normQuery.length);

    // Strict Levenshtein typos:
    // Allow max 1 edit for 4-5 letter words, max 2 edits for 6+ letter words.
    if (normQuery.length >= 4 && lenDiff <= 2) {
      const dist = levenshteinDistance(normQuery, word);

      if (dist === 1) {
        maxScore = Math.max(maxScore, 0.82);
      } else if (dist === 2 && normQuery.length >= 6) {
        maxScore = Math.max(maxScore, 0.68);
      }
    }
  }

  return maxScore;
}

export interface FuzzySearchResult {
  item: InventoryItem;
  score: number;
  exactMatch: boolean;
}

export interface SearchOptions {
  includeArchived?: boolean;
}

/**
 * High-performance search function with multi-word typo tolerance, category suggestions, and "Did you mean?" suggestions.
 */
export function searchProductsFuzzy(
  products: InventoryItem[],
  query: string,
  options?: SearchOptions
): {
  matches: InventoryItem[];
  didYouMean: string | null;
  suggestedCategories: string[];
} {
  const includeArchived = options?.includeArchived ?? false;
  const rawQ = query.trim();
  if (!rawQ) {
    return { matches: products, didYouMean: null, suggestedCategories: [] };
  }

  const normQuery = normalizeFuzzyText(rawQ);
  const queryTokens = normQuery.split(/\s+/).filter(Boolean);

  if (queryTokens.length === 0) {
    return { matches: products, didYouMean: null, suggestedCategories: [] };
  }

  const scoredList: FuzzySearchResult[] = [];

  (products || []).forEach((item) => {
    if (!includeArchived && item.status === 'archived') return;

    const name = item.name || '';
    const sku = item.sku || '';
    const category = item.category || '';
    const tags = item.tags || '';
    const desc = item.description || '';
    const barcode = item.barcode || '';
    const supplierName = item.supplierName || '';
    const supplierCode = item.supplierCode || (item as any).supplier_code || (
      item.extractedAttributes ? (() => {
        try {
          const p = typeof item.extractedAttributes === 'string' ? JSON.parse(item.extractedAttributes) : item.extractedAttributes;
          return p?.supplierCode || p?.supplier_code || p?.sku_proveedor || null;
        } catch { return null; }
      })() : null
    ) || '';

    const normName = normalizeFuzzyText(name);
    const normSku = normalizeFuzzyText(sku);
    const normCategory = normalizeFuzzyText(category);
    const normDesc = normalizeFuzzyText(desc);
    const normTags = normalizeFuzzyText(tags);
    const normBarcode = normalizeFuzzyText(String(barcode));
    const normSupplierName = normalizeFuzzyText(supplierName);
    const normSupplierCode = normalizeFuzzyText(String(supplierCode));

    // 1. Exact substring check across all fields
    const isExact =
      normName.includes(normQuery) ||
      normSku.includes(normQuery) ||
      normCategory.includes(normQuery) ||
      normDesc.includes(normQuery) ||
      normTags.includes(normQuery) ||
      (normBarcode && normBarcode.includes(normQuery)) ||
      (normSupplierCode && normSupplierCode.includes(normQuery)) ||
      (normSupplierName && normSupplierName.includes(normQuery));

    if (isExact) {
      scoredList.push({ item, score: 1.0, exactMatch: true });
      return;
    }

    // 2. Strict Token-by-Token Match Requirement
    // Every query token must match at least one attribute with score >= 0.65
    let minTokenScore = 1.0;
    let sumTokenScore = 0;

    for (const token of queryTokens) {
      const nameScore = fuzzyWordMatchScore(token, name);
      const skuScore = normSku.includes(token) ? 1.0 : 0;
      const barcodeScore = normBarcode.includes(token) ? 1.0 : 0;
      const supplierCodeScore = normSupplierCode.includes(token) ? 1.0 : 0;
      const categoryScore = fuzzyWordMatchScore(token, category);
      const tagScore = fuzzyWordMatchScore(token, tags);
      const supplierNameScore = fuzzyWordMatchScore(token, supplierName);
      const descScore = fuzzyWordMatchScore(token, desc) * 0.7;

      const bestTokenScore = Math.max(
        nameScore,
        skuScore,
        barcodeScore,
        supplierCodeScore,
        categoryScore,
        tagScore,
        supplierNameScore,
        descScore
      );
      if (bestTokenScore < minTokenScore) {
        minTokenScore = bestTokenScore;
      }
      sumTokenScore += bestTokenScore;
    }

    const avgTokenScore = queryTokens.length > 0 ? sumTokenScore / queryTokens.length : 0;

    // High fidelity threshold: require minTokenScore >= 0.65 and average >= 0.68
    if (minTokenScore >= 0.65 && avgTokenScore >= 0.68) {
      scoredList.push({ item, score: avgTokenScore, exactMatch: false });
    }
  });

  // Sort descending by match score
  scoredList.sort((a, b) => b.score - a.score);

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

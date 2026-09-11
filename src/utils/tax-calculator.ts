/**
 * Shared utility for unified IVA / Tax status detection and price calculation
 * across Telegram bot, web scraping, message simulations, and inventory entry.
 */

export type TaxStatus = 'INCLUDED' | 'PLUS_TAX' | 'NOT_SPECIFIED';

export interface TaxAdjustmentResult {
  taxStatus: TaxStatus;
  taxPercent: number;
  baseCostPrice: number;
  costPrice: number; // Final cost to store in inventory
  salePrice: number; // Suggested sale price (PVP)
  taxAmount: number; // Calculated tax amount
}

/**
 * Detects whether text indicates:
 * - "PLUS_TAX" (e.g., "más iva", "+ iva", "+iva", "sin iva", "no incluye iva", "neto + iva", "antes de iva")
 * - "INCLUDED" (e.g., "incluye iva", "iva incluido", "con iva", "iva inc.", "ya incluye iva")
 * - "NOT_SPECIFIED"
 */
export function detectTaxStatus(text: string): TaxStatus {
  if (!text || typeof text !== 'string') return 'NOT_SPECIFIED';

  // Normalize text to lower-case and strip diacritics (accents) for consistent matching
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Patterns for "+ IVA" / "más IVA" / tax not included
  const plusTaxPatterns = [
    /\+\s*iva\b/,
    /\bmas\s+iva\b/,
    /\bneto\s*\+\s*iva\b/,
    /\bsin\s+iva\b/,
    /\bno\s+incluye\s+iva\b/,
    /\bno\s+incluyen\s+iva\b/,
    /\bantes\s+de\s+iva\b/,
    /\biva\s+(?:no\s+incluido|adicional|por\s+separado|aparte)\b/,
    /\+\s*impuesto[s]?\b/,
    /\bmas\s+impuesto[s]?\b/,
    /\bsin\s+impuesto[s]?\b/,
    /\bno\s+incluye\s+impuesto[s]?\b/,
    /\bno\s+incluyen\s+impuesto[s]?\b/,
    /\+\s*igv\b/,
    /\bmas\s+igv\b/,
    /\bsin\s+igv\b/,
    /\+\s*itbis\b/,
    /\bmas\s+itbis\b/,
    /\+\s*vat\b/,
    /\bplus\s+vat\b/,
    /\bexcl(?:uding)?\s+vat\b/,
  ];

  // Patterns for "incluye IVA" / tax already included in price
  const inclTaxPatterns = [
    /\bincluye\s+iva\b/,
    /\bincluyen\s+iva\b/,
    /\biva\s+incluido\b/,
    /\biva\s+ya\s+incluido\b/,
    /\bya\s+incluye\s+iva\b/,
    /\bcon\s+iva\b/,
    /\biva\s+inc\.?\b/,
    /\bincl\.?\s*iva\b/,
    /\bincluye\s+impuesto[s]?\b/,
    /\bimpuesto[s]?\s+incluido[s]?\b/,
    /\bcon\s+impuesto[s]?\b/,
    /\bincluye\s+igv\b/,
    /\bigv\s+incluido\b/,
    /\bincluye\s+itbis\b/,
    /\bitbis\s+incluido\b/,
    /\binc(?:luding)?\s+vat\b/,
    /\bvat\s+incl(?:uded)?\b/,
  ];

  // Priority: if explicitly mentions plus/sin/no incluye iva, treat as PLUS_TAX
  if (plusTaxPatterns.some((pattern) => pattern.test(normalized))) {
    return 'PLUS_TAX';
  }

  if (inclTaxPatterns.some((pattern) => pattern.test(normalized))) {
    return 'INCLUDED';
  }

  return 'NOT_SPECIFIED';
}

/**
 * Calculates base cost, tax amount, final cost and suggested sale price
 * based on detected taxStatus and system taxPercent.
 */
export function calculateTaxAdjustment(params: {
  costPrice: number;
  taxStatus: TaxStatus;
  taxPercent?: number;
  profitMarginPercent?: number;
}): TaxAdjustmentResult {
  const { taxStatus } = params;
  const rawCost = Math.max(0.01, Number(params.costPrice) || 15);
  let effectiveTax = typeof params.taxPercent === 'number' && params.taxPercent >= 0
    ? params.taxPercent
    : 15;
  const effectiveMargin = Math.max(1, Number(params.profitMarginPercent) || 30);

  let baseCostPrice = rawCost;
  let finalCost = rawCost;
  let taxAmount = 0;

  if (taxStatus === 'PLUS_TAX') {
    // Content specifies WITHOUT tax (+ IVA / más IVA / sin IVA)
    baseCostPrice = rawCost;
    taxAmount = Math.round(rawCost * (effectiveTax / 100) * 100) / 100;
    finalCost = Math.round((baseCostPrice + taxAmount) * 100) / 100;
  } else if (taxStatus === 'INCLUDED') {
    // Content specifies WITH tax (con IVA / IVA incluido)
    finalCost = rawCost;
    baseCostPrice = Math.round((finalCost / (1 + effectiveTax / 100)) * 100) / 100;
    taxAmount = Math.round((finalCost - baseCostPrice) * 100) / 100;
  } else {
    // NOT_SPECIFIED: Content did NOT specify whether it has or doesn't have IVA.
    // User requirement: Assume VAT percentage is 0% and the product cost is the one read.
    effectiveTax = 0;
    finalCost = rawCost;
    baseCostPrice = rawCost;
    taxAmount = 0;
  }

  // Margin is applied on baseCostPrice (cost without tax) when tax is a tax credit
  const salePrice = Math.round(baseCostPrice * (1 + effectiveMargin / 100) * 100) / 100;

  return {
    taxStatus,
    taxPercent: effectiveTax,
    baseCostPrice,
    costPrice: finalCost,
    salePrice,
    taxAmount,
  };
}

/**
 * Adjusts an array of cost options to compute both costWithoutTax and costWithTax accurately.
 */
export function adjustCostOptionsForTax(
  costOptions: Array<{ label: string; price: number; costWithoutTax?: number; costWithTax?: number }>,
  taxStatus: TaxStatus,
  taxPercent: number
): Array<{ label: string; price: number; costWithoutTax?: number; costWithTax?: number }> {
  if (!Array.isArray(costOptions) || costOptions.length === 0) return [];
  const effTax = taxPercent >= 0 ? taxPercent : 15;

  return costOptions.map((opt) => {
    let optWithout: number;
    let optWith: number;
    let cleanLabel = opt.label;

    if (taxStatus === 'PLUS_TAX') {
      optWithout = opt.price;
      optWith = Math.round(opt.price * (1 + effTax / 100) * 100) / 100;
      if (!cleanLabel.includes('IVA')) cleanLabel = `${cleanLabel} (+${effTax}% IVA)`;
    } else if (taxStatus === 'INCLUDED') {
      optWith = opt.price;
      optWithout = Math.round((opt.price / (1 + effTax / 100)) * 100) / 100;
    } else {
      // NOT_SPECIFIED: 0% IVA, cost is exactly what was read
      optWith = opt.price;
      optWithout = opt.price;
    }

    return {
      ...opt,
      label: cleanLabel,
      price: optWith,
      costWithoutTax: optWithout,
      costWithTax: optWith,
    };
  });
}

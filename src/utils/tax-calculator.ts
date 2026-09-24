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
    baseCostPrice = Math.round(rawCost * 100) / 100;
    taxAmount = Math.round(rawCost * (effectiveTax / 100) * 100) / 100;
    finalCost = Math.round((baseCostPrice + taxAmount) * 100) / 100;
  } else if (taxStatus === 'INCLUDED') {
    // Content specifies WITH tax (con IVA / IVA incluido)
    finalCost = Math.round(rawCost * 100) / 100;
    baseCostPrice = Math.round((finalCost / (1 + effectiveTax / 100)) * 100) / 100;
    taxAmount = Math.round((finalCost - baseCostPrice) * 100) / 100;
  } else {
    // NOT_SPECIFIED: Content did NOT specify whether it has or doesn't have IVA.
    // User requirement: Assume VAT percentage is 0% and the product cost is the one read.
    effectiveTax = 0;
    finalCost = Math.round(rawCost * 100) / 100;
    baseCostPrice = finalCost;
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
 * If taxStatus is NOT_SPECIFIED, generates 2 options per price:
 * 1) Option 1: "Ya incluye IVA" (Base: price / (1 + effTax%), Con IVA: price) -> Default selected.
 * 2) Option 2: "Sin IVA / Más IVA" (Base: price, Con IVA: price * (1 + effTax%)).
 */
export function buildCostOptionsWithTaxVariants(
  costOptions: Array<{ label: string; price: number; costWithoutTax?: number; costWithTax?: number; taxStatus?: TaxStatus }>,
  taxStatus: TaxStatus,
  taxPercent: number
): Array<{ label: string; price: number; costWithoutTax?: number; costWithTax?: number; taxStatus?: TaxStatus }> {
  if (!Array.isArray(costOptions) || costOptions.length === 0) return [];
  const effTax = taxPercent >= 0 ? taxPercent : 15;

  const result: Array<{ label: string; price: number; costWithoutTax?: number; costWithTax?: number; taxStatus?: TaxStatus }> = [];

  for (const opt of costOptions) {
    if (taxStatus === 'PLUS_TAX') {
      const optWithout = Math.round(opt.price * 100) / 100;
      const optWith = Math.round(opt.price * (1 + effTax / 100) * 100) / 100;
      let cleanLabel = opt.label;
      if (!cleanLabel.toLowerCase().includes('iva')) {
        cleanLabel = `${cleanLabel} (+${effTax}% IVA)`;
      }
      result.push({
        ...opt,
        label: cleanLabel,
        price: optWith,
        costWithoutTax: optWithout,
        costWithTax: optWith,
        taxStatus: 'PLUS_TAX',
      });
    } else if (taxStatus === 'INCLUDED') {
      const optWith = Math.round(opt.price * 100) / 100;
      const optWithout = Math.round((opt.price / (1 + effTax / 100)) * 100) / 100;
      let cleanLabel = opt.label;
      if (!cleanLabel.toLowerCase().includes('iva')) {
        cleanLabel = `${cleanLabel} (Incluye IVA)`;
      }
      result.push({
        ...opt,
        label: cleanLabel,
        price: optWith,
        costWithoutTax: optWithout,
        costWithTax: optWith,
        taxStatus: 'INCLUDED',
      });
    } else {
      // NOT_SPECIFIED: User requirement #1: Generate two options for each price
      // Option A: Default selected (Ya incluye IVA)
      const opt1With = Math.round(opt.price * 100) / 100;
      const opt1Without = Math.round((opt.price / (1 + effTax / 100)) * 100) / 100;
      const baseLabel = opt.label.split(' ($')[0].split(' - ')[0];
      const label1 = `${baseLabel} (Ya incluye IVA - $${opt1With.toFixed(2)})`;

      // Option B: Sin IVA / Más IVA (+15% IVA)
      const opt2Without = Math.round(opt.price * 100) / 100;
      const opt2With = Math.round(opt.price * (1 + effTax / 100) * 100) / 100;
      const label2 = `${baseLabel} (Sin IVA - +${effTax}% IVA = $${opt2With.toFixed(2)})`;

      result.push({
        ...opt,
        label: label1,
        price: opt1With,
        costWithoutTax: opt1Without,
        costWithTax: opt1With,
        taxStatus: 'INCLUDED',
      });

      result.push({
        ...opt,
        label: label2,
        price: opt2With,
        costWithoutTax: opt2Without,
        costWithTax: opt2With,
        taxStatus: 'PLUS_TAX',
      });
    }
  }

  return result;
}

export function adjustCostOptionsForTax(
  costOptions: Array<{ label: string; price: number; costWithoutTax?: number; costWithTax?: number }>,
  taxStatus: TaxStatus,
  taxPercent: number
): Array<{ label: string; price: number; costWithoutTax?: number; costWithTax?: number }> {
  return buildCostOptionsWithTaxVariants(costOptions, taxStatus, taxPercent);
}

/**
 * Calculates the exact net unit profit (utilidad neta sin IVA) for an inventory product item.
 * For 0% IVA items: salePrice - costPrice (or profitAmount).
 * For 15% IVA items: salePriceWithoutTax - costWithoutTax (or profitAmount).
 * This prevents double-taxing the profit margin when computing aggregate inventory estimated profit.
 */
export function getItemUnitNetProfit(it: any): number {
  if (!it) return 0;

  // Parse extractedAttributes if string
  let attrs: any = {};
  if (typeof it.extractedAttributes === 'string' && it.extractedAttributes.trim()) {
    try {
      attrs = JSON.parse(it.extractedAttributes);
    } catch {}
  } else if (it.extractedAttributes && typeof it.extractedAttributes === 'object') {
    attrs = it.extractedAttributes;
  }

  // If item is a gift, profit is 0 (or salePrice if explicit gift sale price exists)
  if (attrs.isGift || it.isSupplierGift) {
    const sale = Number(it.salePrice) || 0;
    return Math.max(0, sale);
  }

  // 1. Explicit profitAmount stored in extractedAttributes or item
  if (typeof attrs.profitAmount === 'number' && !isNaN(attrs.profitAmount) && attrs.profitAmount >= 0) {
    return Math.round(attrs.profitAmount * 100) / 100;
  }
  if (typeof it.profitAmount === 'number' && !isNaN(it.profitAmount) && it.profitAmount >= 0) {
    return Math.round(it.profitAmount * 100) / 100;
  }

  // 2. Tax rate & zero tax status
  const rawTaxRate = attrs.taxRate ?? attrs.saleTaxPercent ?? attrs.purchaseTaxPercent ?? it.taxRate ?? it.purchaseTaxPercent ?? 15;
  const taxRate = typeof rawTaxRate === 'number' ? rawTaxRate : (parseFloat(String(rawTaxRate)) || 0);
  const isZeroTax = attrs.taxStatus === 'EXEMPT' || taxRate === 0;

  // 3. Determine costWithoutTax
  let costWithoutTax = 0;
  const rawCostWithout = attrs.costWithoutTax ?? it.costWithoutTax;
  if (rawCostWithout !== undefined && rawCostWithout !== null && !isNaN(Number(rawCostWithout)) && Number(rawCostWithout) >= 0) {
    costWithoutTax = Number(rawCostWithout);
  } else {
    const costWithTax = Number(attrs.costWithTax ?? it.costWithTax ?? it.costPrice) || 0;
    costWithoutTax = (!isZeroTax && taxRate > 0) ? costWithTax / (1 + taxRate / 100) : costWithTax;
  }

  // 4. Determine salePrice (PVP) and salePriceWithoutTax (subtotal sin IVA)
  const salePriceWithTax = Number(it.salePrice) || 0;
  let salePriceWithoutTax = 0;
  if (attrs.subtotalSinIVA !== undefined && attrs.subtotalSinIVA !== null && !isNaN(Number(attrs.subtotalSinIVA)) && Number(attrs.subtotalSinIVA) >= 0) {
    salePriceWithoutTax = Number(attrs.subtotalSinIVA);
  } else if (!isZeroTax && taxRate > 0) {
    salePriceWithoutTax = salePriceWithTax / (1 + taxRate / 100);
  } else {
    salePriceWithoutTax = salePriceWithTax;
  }

  // 5. Net Profit = salePriceWithoutTax - costWithoutTax
  const netProfit = Math.max(0, salePriceWithoutTax - costWithoutTax);
  return Math.round(netProfit * 100) / 100;
}

// Re-export SRI Ecuador Tax Engine primitives
export * from './ecuadorTaxCalculator.ts';


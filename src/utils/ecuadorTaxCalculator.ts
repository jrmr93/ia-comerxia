/**
 * Motor Unificado de Cálculo Comercial y Tributario (Facturación Electrónica SRI Ecuador)
 * 
 * Cumple estrictamente con la normativa tributaria ecuatoriana:
 * 1. Base Imponible = Subtotal Bruto - Descuento.
 * 2. IVA (15% o 0%) se calcula ÚNICAMENTE sobre la Base Imponible Neta (después del descuento).
 * 3. Costo de compra sin IVA es el costo real cuando el IVA de compra es crédito tributario.
 * 4. Utilidad = (Precio Venta Sin IVA - Descuento Unitario) - Costo Sin IVA.
 * 5. Redondeo estándar a 2 decimales para totales, manteniendo precisión interna.
 */

export interface EcuadorTaxLineItemInput {
  id?: number | string;
  name?: string;
  sku?: string;
  costWithoutTax?: number;       // Costo neto de compra sin IVA (proveedor)
  costWithTax?: number;          // Costo total pagado al proveedor con IVA
  purchaseTaxPercent?: number;   // Tarifa de IVA pagado en compra (por defecto 15%)
  
  pricingMode?: 'EXCLUDING_TAX' | 'INCLUDING_TAX'; // PVP ingresado sin IVA o con IVA
  unitSalePrice?: number;        // Precio de venta unitario (base o con IVA según pricingMode)
  
  profitCalculationMode?: 'MARKUP_PERCENT' | 'MARGIN_PERCENT' | 'FIXED_DOLLAR';
  profitValue?: number;          // Valor del margen %, markup %, o ganancia fija $
  
  discount?: number;             // Descuento unitario en dólares ($)
  discountPercent?: number;      // Descuento unitario en porcentaje (%)
  quantity: number;              // Cantidad de unidades
  
  applySaleTax?: boolean;        // ¿Grava IVA en venta? (true = 15%, false = 0%)
  saleTaxPercent?: number;       // Tarifa de IVA venta (por defecto 15%)
}

export interface EcuadorTaxLineItemResult {
  id?: number | string;
  name?: string;
  sku?: string;
  quantity: number;
  
  costWithoutTax: number;        // Costo base de compra (sin IVA)
  costWithTax: number;           // Costo pagado al proveedor (con IVA)
  
  markupPercent: number;         // % incremento sobre costo = ((PVP sin IVA - Costo sin IVA) / Costo sin IVA) * 100
  marginPercent: number;         // % margen sobre venta = ((PVP sin IVA - Costo sin IVA) / PVP sin IVA) * 100
  unitProfitAmount: number;      // Utilidad unitaria real en $ = (PVP neto sin IVA - Costo sin IVA)
  totalProfitAmount: number;     // Utilidad total de la línea en $ = unitProfitAmount * quantity
  
  unitPriceWithoutTax: number;   // PVP unitario de lista sin IVA (antes de descuento)
  unitPriceWithTax: number;      // PVP unitario con IVA (antes de descuento)
  unitDiscount: number;          // Descuento unitario en $
  netUnitPrice: number;          // Base imponible unitaria (PVP sin IVA - Descuento)
  
  lineSubtotal: number;          // Subtotal/Base imponible de la línea = netUnitPrice * quantity
  lineTaxPercent: number;        // Tarifa de IVA (15 o 0)
  lineTaxAmount: number;         // Monto de IVA de la línea = lineSubtotal * (lineTaxPercent / 100)
  lineTotal: number;             // Total de la línea con IVA = lineSubtotal + lineTaxAmount
}

export interface EcuadorInvoiceTotalsResult {
  subtotalTaxable15: number;     // Subtotal 15% (Base imponible que grava IVA 15%)
  subtotalTaxable5: number;      // Subtotal 5% (Base imponible que grava IVA 5%)
  subtotalZero0: number;         // Subtotal 0% / Exento (Base imponible tarifa 0%)
  subtotalNoTax: number;         // Subtotal Sin Impuestos (Suma de bases imponibles netas 0% + 15% + 5%)
  grossSubtotal: number;         // Subtotal Bruto sin descuentos
  totalDiscount: number;         // Total Descuento Aplicado en $
  taxAmount15: number;           // Monto de IVA 15%
  taxAmount5: number;            // Monto de IVA 5%
  totalTax: number;              // Total IVA (Venta)
  shippingFee: number;           // Valor Flete / Envío
  totalInvoiceAmount: number;    // VALOR TOTAL FACTURA (Subtotal neto + IVA + Envío)
  totalAccountingProfit: number; // Utilidad contable real total del pedido en $
  totalUnits: number;            // Total de unidades de productos en la factura
}

/**
 * Redondeo monetario preciso a N decimales (por defecto 2)
 */
export function roundMonetary(value: number, decimals: number = 2): number {
  if (isNaN(value) || !isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Descompone un precio ingresado con IVA incluido en su Base Imponible e IVA.
 * Ej: $115 con 15% IVA -> Base = $100.00, IVA = $15.00
 */
export function deconstructInclusivePrice(priceWithTax: number, taxRatePercent: number = 15): {
  priceWithoutTax: number;
  taxAmount: number;
} {
  const cleanPrice = Math.max(0, Number(priceWithTax) || 0);
  const rate = Math.max(0, Number(taxRatePercent) || 0) / 100;
  if (rate === 0) {
    return { priceWithoutTax: roundMonetary(cleanPrice), taxAmount: 0 };
  }
  const priceWithoutTax = roundMonetary(cleanPrice / (1 + rate));
  const taxAmount = roundMonetary(cleanPrice - priceWithoutTax);
  return { priceWithoutTax, taxAmount };
}

/**
 * Calcula el Precio de Venta de Lista (sin IVA) basado en la Ganancia Objetivo en $ o en Margen %
 */
export function calculatePriceFromProfitTarget(params: {
  costWithoutTax: number;
  profitValue: number;
  mode: 'FIXED_DOLLAR' | 'MARKUP_PERCENT' | 'MARGIN_PERCENT';
}): { unitPriceWithoutTax: number; unitProfitAmount: number; markupPercent: number; marginPercent: number } {
  const cost = Math.max(0, Number(params.costWithoutTax) || 0);
  const val = Number(params.profitValue) || 0;
  
  let unitPriceWithoutTax = cost;
  let unitProfitAmount = 0;
  
  if (params.mode === 'FIXED_DOLLAR') {
    unitProfitAmount = val;
    unitPriceWithoutTax = roundMonetary(cost + val);
  } else if (params.mode === 'MARKUP_PERCENT' || params.mode === 'MARGIN_PERCENT') {
    unitProfitAmount = roundMonetary(cost * (val / 100));
    unitPriceWithoutTax = roundMonetary(cost + unitProfitAmount);
  }
  
  const markupPercent = cost > 0 ? roundMonetary(((unitPriceWithoutTax - cost) / cost) * 100) : 0;
  const marginPercent = unitPriceWithoutTax > 0 ? roundMonetary(((unitPriceWithoutTax - cost) / unitPriceWithoutTax) * 100) : 0;
  
  return {
    unitPriceWithoutTax,
    unitProfitAmount,
    markupPercent,
    marginPercent,
  };
}

/**
 * Extrae el Valor Unitario Sin IVA (Base Imponible Unitaria = Costo sin IVA + % Ganancia)
 * a partir de los datos del producto o precio de catálogo. Si se proporciona un PVP con IVA,
 * desglosa el valor para obtener la base sin IVA.
 */
export function extractBaseUnitPriceWithoutTax(params: {
  rawSalePrice: number;
  costWithoutTax: number;
  applySaleTax?: boolean;
  saleTaxPercent?: number;
  marginPercent?: number;
  pricingMode?: 'EXCLUDING_TAX' | 'INCLUDING_TAX';
}): { unitPriceWithoutTax: number; marginPercent: number } {
  const cost = Math.max(0, Number(params.costWithoutTax) || 0);
  const rawSale = Math.max(0, Number(params.rawSalePrice) || 0);

  // 1. Si se especifica el margen %, calcular directamente sobre el costo sin IVA (Costo + Utilidad)
  if (params.marginPercent !== undefined && params.marginPercent > 0 && cost > 0) {
    const margin = Number(params.marginPercent);
    const unitPriceWithoutTax = roundMonetary(cost * (1 + margin / 100));
    return { unitPriceWithoutTax, marginPercent: margin };
  }

  // 2. Si la modalidad de precio es explícitamente INCLUDING_TAX, desglosar el IVA del PVP
  if (params.pricingMode === 'INCLUDING_TAX' && rawSale > 0) {
    const applyTax = params.applySaleTax !== false;
    const taxPct = applyTax ? Math.max(0, Number(params.saleTaxPercent ?? 15)) : 0;
    const deconstructed = deconstructInclusivePrice(rawSale, taxPct);
    const unitPriceWithoutTax = deconstructed.priceWithoutTax;
    const margin = cost > 0 ? roundMonetary(((unitPriceWithoutTax - cost) / cost) * 100) : 0;
    return { unitPriceWithoutTax, marginPercent: margin };
  }

  // 3. rawSale (PVP sin IVA) absorbe el Costo + Utilidad del producto directamente
  if (rawSale > 0) {
    const margin = cost > 0 ? roundMonetary(((rawSale - cost) / cost) * 100) : 0;
    return { unitPriceWithoutTax: roundMonetary(rawSale), marginPercent: margin };
  }

  return { unitPriceWithoutTax: cost, marginPercent: 0 };
}


/**
 * Calcula de forma completa y precisa todos los valores tributarios y comerciales de un ítem.
 * Flujo:
 * 1. Base Unitaria (PVP Sin IVA) = Costo + Utilidad.
 * 2. Base Imponible Unitaria Neta = (Costo + Utilidad) - Descuento ($).
 * 3. Subtotal de Línea = Base Imponible Unitaria Neta * Cantidad.
 * 4. IVA Amount = Subtotal de Línea * (Tarifa IVA % / 100).
 * 5. Total de Línea = Subtotal de Línea + IVA Amount.
 */
export function calculateLineItem(input: EcuadorTaxLineItemInput): EcuadorTaxLineItemResult {
  const qty = Math.max(1, Math.round(Number(input.quantity) || 1));
  const purchaseTax = input.purchaseTaxPercent !== undefined ? Math.max(0, Number(input.purchaseTaxPercent)) : 15;
  const applyTax = input.applySaleTax !== false;
  const saleTaxPercent = applyTax ? (input.saleTaxPercent !== undefined ? Math.max(0, Number(input.saleTaxPercent)) : 15) : 0;
  
  // 1. Resolver Costo Sin IVA y Costo Con IVA de compra
  let costWithoutTax = 0;
  let costWithTax = 0;
  
  if (input.costWithoutTax !== undefined && input.costWithoutTax >= 0) {
    costWithoutTax = roundMonetary(Number(input.costWithoutTax));
    costWithTax = input.costWithTax !== undefined
      ? roundMonetary(Number(input.costWithTax))
      : roundMonetary(costWithoutTax * (1 + purchaseTax / 100));
  } else if (input.costWithTax !== undefined && input.costWithTax >= 0) {
    costWithTax = roundMonetary(Number(input.costWithTax));
    const deconstructed = deconstructInclusivePrice(costWithTax, purchaseTax);
    costWithoutTax = deconstructed.priceWithoutTax;
  }
  
  // 2. Resolver Precio Unitario de Lista (PVP sin IVA = Costo + Utilidad / (1 - Descuento%))
  let unitPriceWithoutTax = 0;
  let unitPriceWithTax = 0;
  
  const discountPct = input.discountPercent !== undefined && input.discountPercent > 0 ? Number(input.discountPercent) : 0;
  const discountRate = Math.max(0, Math.min(0.99, discountPct / 100));

  if (input.unitSalePrice !== undefined && Number(input.unitSalePrice) > 0) {
    const rawPrice = Number(input.unitSalePrice);
    if (input.pricingMode === 'INCLUDING_TAX') {
      unitPriceWithTax = roundMonetary(rawPrice);
      const deconstructed = deconstructInclusivePrice(unitPriceWithTax, saleTaxPercent);
      unitPriceWithoutTax = deconstructed.priceWithoutTax;
    } else {
      unitPriceWithoutTax = roundMonetary(rawPrice);
      unitPriceWithTax = roundMonetary(unitPriceWithoutTax * (1 + saleTaxPercent / 100));
    }
  } else if (input.marginPercent !== undefined && Number(input.marginPercent) > 0 && costWithoutTax > 0) {
    const margin = Number(input.marginPercent);
    const targetNetPriceWithoutTax = roundMonetary(costWithoutTax * (1 + margin / 100));
    unitPriceWithoutTax = discountRate > 0 ? roundMonetary(targetNetPriceWithoutTax / (1 - discountRate)) : targetNetPriceWithoutTax;
    unitPriceWithTax = roundMonetary(unitPriceWithoutTax * (1 + saleTaxPercent / 100));
  } else if (input.profitValue !== undefined && input.profitCalculationMode) {
    const fromProfit = calculatePriceFromProfitTarget({
      costWithoutTax,
      profitValue: input.profitValue,
      mode: input.profitCalculationMode,
    });
    const targetNetPriceWithoutTax = fromProfit.unitPriceWithoutTax;
    unitPriceWithoutTax = discountRate > 0 ? roundMonetary(targetNetPriceWithoutTax / (1 - discountRate)) : targetNetPriceWithoutTax;
    unitPriceWithTax = roundMonetary(unitPriceWithoutTax * (1 + saleTaxPercent / 100));
  } else {
    unitPriceWithoutTax = costWithoutTax;
    unitPriceWithTax = roundMonetary(unitPriceWithoutTax * (1 + saleTaxPercent / 100));
  }
  
  // 3. Descuento Unitario ($)
  let unitDiscount = 0;
  if (input.discount !== undefined && input.discount > 0) {
    unitDiscount = roundMonetary(Number(input.discount));
  } else if (input.discountPercent !== undefined && input.discountPercent > 0) {
    unitDiscount = roundMonetary(unitPriceWithoutTax * (Number(input.discountPercent) / 100));
  }
  unitDiscount = Math.min(unitDiscount, unitPriceWithoutTax); // No exceder PVP
  
  // 4. Base Imponible Unitaria (Net Unit Price) = (Costo + Utilidad) - Descuento
  const netUnitPrice = roundMonetary(Math.max(0, unitPriceWithoutTax - unitDiscount));
  
  // 5. Métricas de Utilidad
  const unitProfitAmount = roundMonetary(netUnitPrice - costWithoutTax);
  const totalProfitAmount = roundMonetary(unitProfitAmount * qty);
  const markupPercent = costWithoutTax > 0 ? roundMonetary(((unitPriceWithoutTax - costWithoutTax) / costWithoutTax) * 100) : 0;
  const marginPercent = unitPriceWithoutTax > 0 ? roundMonetary(((unitPriceWithoutTax - costWithoutTax) / unitPriceWithoutTax) * 100) : 0;
  
  // 6. Totales de Línea
  const lineSubtotal = roundMonetary(netUnitPrice * qty);
  const lineTaxAmount = roundMonetary(lineSubtotal * (saleTaxPercent / 100));
  const lineTotal = roundMonetary(lineSubtotal + lineTaxAmount);
  
  return {
    id: input.id,
    name: input.name,
    sku: input.sku,
    quantity: qty,
    costWithoutTax,
    costWithTax,
    markupPercent,
    marginPercent,
    unitProfitAmount,
    totalProfitAmount,
    unitPriceWithoutTax,
    unitPriceWithTax,
    unitDiscount,
    netUnitPrice,
    lineSubtotal,
    lineTaxPercent: saleTaxPercent,
    lineTaxAmount,
    lineTotal,
  };
}

/**
 * Calcula los Totales Generales de la Factura / Proforma alineados exactamente a la norma del SRI de Ecuador.
 */
export function calculateInvoiceTotals(
  items: Array<EcuadorTaxLineItemInput | EcuadorTaxLineItemResult>,
  params?: {
    globalDiscount?: number;
    shippingFee?: number;
    applySaleTax?: boolean;
    defaultTaxPercent?: number;
  }
): EcuadorInvoiceTotalsResult {
  let subtotalTaxable15 = 0;
  let subtotalTaxable5 = 0;
  let subtotalZero0 = 0;
  let grossSubtotal = 0;
  let totalLineDiscounts = 0;
  let taxAmount15 = 0;
  let taxAmount5 = 0;
  let totalTax = 0;
  let totalAccountingProfit = 0;
  let totalUnits = 0;
  
  items.forEach((it) => {
    // Si ya es un EcuadorTaxLineItemResult, reutilizar datos; si es input, calcular primero
    const calculated: EcuadorTaxLineItemResult = ('lineSubtotal' in it && typeof it.lineSubtotal === 'number')
      ? (it as EcuadorTaxLineItemResult)
      : calculateLineItem(it as EcuadorTaxLineItemInput);
      
    totalUnits += calculated.quantity;
    grossSubtotal += roundMonetary(calculated.unitPriceWithoutTax * calculated.quantity);
    totalLineDiscounts += roundMonetary(calculated.unitDiscount * calculated.quantity);
    
    if (Math.abs(calculated.lineTaxPercent - 5) < 0.01) {
      subtotalTaxable5 += calculated.lineSubtotal;
      taxAmount5 += calculated.lineTaxAmount;
    } else if (calculated.lineTaxPercent > 0) {
      subtotalTaxable15 += calculated.lineSubtotal;
      taxAmount15 += calculated.lineTaxAmount;
    } else {
      subtotalZero0 += calculated.lineSubtotal;
    }
    
    totalTax += calculated.lineTaxAmount;
    totalAccountingProfit += calculated.totalProfitAmount;
  });
  
  subtotalTaxable15 = roundMonetary(subtotalTaxable15);
  subtotalTaxable5 = roundMonetary(subtotalTaxable5);
  subtotalZero0 = roundMonetary(subtotalZero0);
  grossSubtotal = roundMonetary(grossSubtotal);
  totalLineDiscounts = roundMonetary(totalLineDiscounts);
  taxAmount15 = roundMonetary(taxAmount15);
  taxAmount5 = roundMonetary(taxAmount5);
  totalTax = roundMonetary(totalTax);
  totalAccountingProfit = roundMonetary(totalAccountingProfit);
  
  const globalDisc = Math.max(0, roundMonetary(Number(params?.globalDiscount) || 0));
  const totalDiscount = roundMonetary(totalLineDiscounts + globalDisc);
  const subtotalNoTax = roundMonetary(subtotalTaxable15 + subtotalTaxable5 + subtotalZero0);
  const shippingFee = Math.max(0, roundMonetary(Number(params?.shippingFee) || 0));
  const totalInvoiceAmount = roundMonetary(subtotalNoTax + totalTax + shippingFee);
  
  return {
    subtotalTaxable15,
    subtotalTaxable5,
    subtotalZero0,
    subtotalNoTax,
    grossSubtotal,
    totalDiscount,
    taxAmount15,
    taxAmount5,
    totalTax,
    shippingFee,
    totalInvoiceAmount,
    totalAccountingProfit,
    totalUnits,
  };
}

/**
 * Extrae de forma unificada y segura la tarifa de IVA (15, 0, etc.) de un ítem de pedido o producto.
 * Analiza tanto propiedades directas en el ítem como en it.item (subItem) o productos emparejados.
 */
export function extractItemTaxPercent(it: any, defaultTaxPercent: number = 15, matchProduct?: any): number {
  if (!it && !matchProduct) return defaultTaxPercent;

  const subItem = it && it.item && typeof it.item === 'object' ? it.item : {};
  const match = matchProduct && typeof matchProduct === 'object' ? matchProduct : {};

  const parseTaxValue = (val: any): number | null => {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    if (typeof val === 'string') {
      const cleanStr = val.replace('%', '').trim();
      const num = Number(cleanStr);
      return isNaN(num) ? null : num;
    }
    return null;
  };

  // 1. Verificar saleTaxPercent o purchaseTaxPercent explícito
  const taxVal = parseTaxValue(
    it?.saleTaxPercent ?? subItem?.saleTaxPercent ?? match?.saleTaxPercent ??
    it?.purchaseTaxPercent ?? subItem?.purchaseTaxPercent ?? match?.purchaseTaxPercent
  );
  if (taxVal !== null) return taxVal;

  // 2. Verificar taxRate
  const taxRateVal = parseTaxValue(it?.taxRate ?? subItem?.taxRate ?? match?.taxRate);
  if (taxRateVal !== null) return taxRateVal;

  // 3. Verificar taxPercent
  const taxPctVal = parseTaxValue(it?.taxPercent ?? subItem?.taxPercent ?? match?.taxPercent);
  if (taxPctVal !== null) return taxPctVal;

  // 4. Verificar tax (numérico <= 100)
  const taxDirectVal = parseTaxValue(it?.tax ?? subItem?.tax ?? match?.tax);
  if (taxDirectVal !== null && taxDirectVal <= 100) return taxDirectVal;

  // 5. Flags booleanos de IVA 0% (Exento / Sin IVA)
  if (
    it?.applySaleTax === false || subItem?.applySaleTax === false || match?.applySaleTax === false ||
    it?.hasPurchaseTax === false || subItem?.hasPurchaseTax === false || match?.hasPurchaseTax === false ||
    it?.applyTax === false || subItem?.applyTax === false || match?.applyTax === false ||
    it?.hasTax === false || subItem?.hasTax === false || match?.hasTax === false ||
    it?.hasSaleTax === false || subItem?.hasSaleTax === false || match?.hasSaleTax === false
  ) {
    return 0;
  }

  // 6. Flags booleanos de IVA (Aplica IVA)
  if (
    it?.applySaleTax === true || subItem?.applySaleTax === true || match?.applySaleTax === true ||
    it?.hasPurchaseTax === true || subItem?.hasPurchaseTax === true || match?.hasPurchaseTax === true ||
    it?.applyTax === true || subItem?.applyTax === true || match?.applyTax === true ||
    it?.hasTax === true || subItem?.hasTax === true || match?.hasTax === true ||
    it?.hasSaleTax === true || subItem?.hasSaleTax === true || match?.hasSaleTax === true
  ) {
    return 15;
  }

  return defaultTaxPercent;
}


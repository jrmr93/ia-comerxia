import { describe, expect, test } from 'bun:test';
import {
  calculateLineItem,
  calculateInvoiceTotals,
  calculatePriceFromProfitTarget,
  deconstructInclusivePrice,
  roundMonetary,
  extractBaseUnitPriceWithoutTax,
  extractItemTaxPercent,
} from './ecuadorTaxCalculator.ts';

describe('Motor de Cálculo Tributario SRI Ecuador (Pruebas Unitarias)', () => {
  // 1. Producto con IVA 15%
  test('Caso 1: Producto con IVA (15%) y margen sobre costo', () => {
    // Costo sin IVA = $100, Utilidad 30% -> PVP Sin IVA = $130, IVA 15% = $19.50, Total = $149.50
    const result = calculateLineItem({
      costWithoutTax: 100,
      unitSalePrice: 130,
      pricingMode: 'EXCLUDING_TAX',
      quantity: 1,
      applySaleTax: true,
      saleTaxPercent: 15,
    });

    expect(result.costWithoutTax).toBe(100);
    expect(result.unitPriceWithoutTax).toBe(130);
    expect(result.netUnitPrice).toBe(130);
    expect(result.lineSubtotal).toBe(130);
    expect(result.lineTaxPercent).toBe(15);
    expect(result.lineTaxAmount).toBe(19.5);
    expect(result.lineTotal).toBe(149.5);
    expect(result.unitProfitAmount).toBe(30);
  });

  // 2. Producto Tarifa 0%
  test('Caso 2: Producto con Tarifa 0% (Exento)', () => {
    const result = calculateLineItem({
      costWithoutTax: 50,
      unitSalePrice: 65,
      pricingMode: 'EXCLUDING_TAX',
      quantity: 2,
      applySaleTax: false,
    });

    expect(result.netUnitPrice).toBe(65);
    expect(result.lineSubtotal).toBe(130); // 65 * 2
    expect(result.lineTaxAmount).toBe(0);
    expect(result.lineTotal).toBe(130);
    expect(result.unitProfitAmount).toBe(15);
    expect(result.totalProfitAmount).toBe(30);
  });

  // 3. Producto con Descuento (Descuento aplicado antes de IVA)
  test('Caso 3: Producto con descuento de $10 (IVA debe aplicarse sobre la base neta)', () => {
    // Ejemplo obligatorio del usuario:
    // Costo $100, PVP de lista $144.44, Descuento $14.44 -> Base imponible $130, IVA 15% $19.50, Total $149.50
    const result = calculateLineItem({
      costWithoutTax: 100,
      unitSalePrice: 144.44,
      discount: 14.44,
      pricingMode: 'EXCLUDING_TAX',
      quantity: 1,
      applySaleTax: true,
      saleTaxPercent: 15,
    });

    expect(result.unitPriceWithoutTax).toBe(144.44);
    expect(result.unitDiscount).toBe(14.44);
    expect(result.netUnitPrice).toBe(130.0);
    expect(result.lineSubtotal).toBe(130.0);
    expect(result.lineTaxAmount).toBe(19.5);
    expect(result.lineTotal).toBe(149.5);
    expect(result.unitProfitAmount).toBe(30.0);
  });

  // 4. Venta con Precio Ingresado Con IVA Incluido
  test('Caso 4: Precio ingresado con IVA incluido ($115 con 15% IVA)', () => {
    const deconstructed = deconstructInclusivePrice(115, 15);
    expect(deconstructed.priceWithoutTax).toBe(100.0);
    expect(deconstructed.taxAmount).toBe(15.0);

    const result = calculateLineItem({
      costWithoutTax: 80,
      unitSalePrice: 115,
      pricingMode: 'INCLUDING_TAX',
      quantity: 1,
      applySaleTax: true,
      saleTaxPercent: 15,
    });

    expect(result.unitPriceWithTax).toBe(115.0);
    expect(result.unitPriceWithoutTax).toBe(100.0);
    expect(result.lineSubtotal).toBe(100.0);
    expect(result.lineTaxAmount).toBe(15.0);
    expect(result.lineTotal).toBe(115.0);
    expect(result.unitProfitAmount).toBe(20.0);
  });

  // 5. Ganancia Objetivo en Dólares Fijos ($200 sobre costo de $100)
  test('Caso 5: Ganancia fija en dólares ($200 de utilidad sobre costo de $100)', () => {
    const fromProfit = calculatePriceFromProfitTarget({
      costWithoutTax: 100,
      profitValue: 200,
      mode: 'FIXED_DOLLAR',
    });

    expect(fromProfit.unitPriceWithoutTax).toBe(300.0);
    expect(fromProfit.unitProfitAmount).toBe(200.0);
    expect(fromProfit.markupPercent).toBe(200.0); // 200% sobre costo

    const result = calculateLineItem({
      costWithoutTax: 100,
      profitCalculationMode: 'FIXED_DOLLAR',
      profitValue: 200,
      quantity: 1,
      applySaleTax: true,
      saleTaxPercent: 15,
    });

    expect(result.unitPriceWithoutTax).toBe(300.0);
    expect(result.lineSubtotal).toBe(300.0);
    expect(result.lineTaxAmount).toBe(45.0);
    expect(result.lineTotal).toBe(345.0);
    expect(result.unitProfitAmount).toBe(200.0);
  });

  // 6. Factura Completa Multi-producto con Tarifas Mixtas (15% y 0%) y Flete
  test('Caso 6: Factura multi-producto con IVA 15%, Tarifa 0% y Envío', () => {
    const item1 = calculateLineItem({
      id: 1,
      name: 'Item Gravado 15%',
      costWithoutTax: 100,
      unitSalePrice: 130,
      discount: 10, // Base $120
      quantity: 2,  // Subtotal $240, IVA 15% = $36
      applySaleTax: true,
      saleTaxPercent: 15,
    });

    const item2 = calculateLineItem({
      id: 2,
      name: 'Item Tarifa 0%',
      costWithoutTax: 40,
      unitSalePrice: 50,
      quantity: 3,  // Subtotal $150, IVA 0% = $0
      applySaleTax: false,
    });

    const totals = calculateInvoiceTotals([item1, item2], { shippingFee: 5 });

    expect(totals.subtotalTaxable15).toBe(240.0);
    expect(totals.subtotalZero0).toBe(150.0);
    expect(totals.subtotalNoTax).toBe(390.0);
    expect(totals.totalDiscount).toBe(20.0); // 10 * 2
    expect(totals.totalTax).toBe(36.0);
    expect(totals.shippingFee).toBe(5.0);
    expect(totals.totalInvoiceAmount).toBe(431.0); // 390 + 36 + 5
    expect(totals.totalUnits).toBe(5);
  });

  // 7. Alineación de Redondeo al Centavo
  test('Caso 7: Evitar descuadres por redondeo acumulado de centavos', () => {
    const val = roundMonetary(12.3456);
    expect(val).toBe(12.35);

    const line = calculateLineItem({
      costWithoutTax: 10.33,
      unitSalePrice: 15.77,
      quantity: 3,
      applySaleTax: true,
      saleTaxPercent: 15,
    });

    expect(line.lineSubtotal).toBe(47.31); // 15.77 * 3
    expect(line.lineTaxAmount).toBe(7.1);  // 47.31 * 0.15 = 7.0965 -> 7.10
    expect(line.lineTotal).toBe(54.41);     // 47.31 + 7.10
  });

  // 8. Caso de Prueba Obligatorio del Usuario ($10.00 cost -> $12.00 PVP sin IVA -> $1.80 IVA 15% -> $13.80 PVP final con IVA)
  test('Caso Obligatorio: Costo $10.00, Markup 20%, IVA 15% -> Subtotal $12.00 + IVA $1.80 = Total $13.80', () => {
    const result = calculateLineItem({
      costWithoutTax: 10.00,
      profitCalculationMode: 'MARKUP_PERCENT',
      profitValue: 20,
      pricingMode: 'EXCLUDING_TAX',
      quantity: 1,
      applySaleTax: true,
      saleTaxPercent: 15,
    });

    expect(result.costWithoutTax).toBe(10.00);
    expect(result.unitProfitAmount).toBe(2.00);
    expect(result.unitPriceWithoutTax).toBe(12.00);
    expect(result.markupPercent).toBe(20.00);
    expect(result.marginPercent).toBe(16.67);
    expect(result.lineSubtotal).toBe(12.00);
    expect(result.lineTaxAmount).toBe(1.80);
    expect(result.lineTotal).toBe(13.80);

    const invoice = calculateInvoiceTotals([result], { shippingFee: 0, applySaleTax: true });
    expect(invoice.subtotalTaxable15).toBe(12.00);
    expect(invoice.subtotalZero0).toBe(0.00);
    expect(invoice.subtotalNoTax).toBe(12.00);
    expect(invoice.totalTax).toBe(1.80);
    expect(invoice.totalInvoiceAmount).toBe(13.80);
  });

  // 9. Extraer Valor Unitario Sin IVA desde producto (Costo + Utilidad = $12.00 Base Sin IVA)
  test('Caso 9: Extraer Valor Unitario Sin IVA absorbiendo Costo + Utilidad directamente de los productos', () => {
    const extractedDirect = extractBaseUnitPriceWithoutTax({
      rawSalePrice: 12.00,
      costWithoutTax: 10.00,
      applySaleTax: true,
      saleTaxPercent: 15,
    });

    expect(extractedDirect.unitPriceWithoutTax).toBe(12.00);
    expect(extractedDirect.marginPercent).toBe(20.00);

    const extractedInclusive = extractBaseUnitPriceWithoutTax({
      rawSalePrice: 13.80,
      costWithoutTax: 10.00,
      pricingMode: 'INCLUDING_TAX',
      applySaleTax: true,
      saleTaxPercent: 15,
    });

    expect(extractedInclusive.unitPriceWithoutTax).toBe(12.00);
    expect(extractedInclusive.marginPercent).toBe(20.00);
  });

  // 10. Extracción Unificada de Tarifa de IVA de Ítems
  test('Caso 10: Extracción unificada de IVA de ítems con tarifa 0% vs 15% y estructuras anidadas', () => {
    // 1. saleTaxPercent directo = 0
    expect(extractItemTaxPercent({ saleTaxPercent: 0 }, 15)).toBe(0);
    // 2. taxRate = "0.00"
    expect(extractItemTaxPercent({ taxRate: '0.00' }, 15)).toBe(0);
    // 3. SubItem con saleTaxPercent = 0
    expect(extractItemTaxPercent({ item: { saleTaxPercent: 0 } }, 15)).toBe(0);
    // 4. SubItem con taxRate = 0
    expect(extractItemTaxPercent({ item: { taxRate: 0 } }, 15)).toBe(0);
    // 5. Flag applySaleTax = false
    expect(extractItemTaxPercent({ item: { applySaleTax: false } }, 15)).toBe(0);
    // 6. Matched product con taxRate = 0
    expect(extractItemTaxPercent({}, 15, { taxRate: 0 })).toBe(0);
    // 7. Normal item 15%
    expect(extractItemTaxPercent({ saleTaxPercent: 15 }, 15)).toBe(15);
  });

  // 11. Preservación de Utilidad Objetivo ante Descuentos
  test('Caso 11: El descuento aplicado NUNCA reduce ni afecta la utilidad objetivo esperada', () => {
    // Costo sin IVA = $100, Margen = 30% ($30 utilidad esperada), Descuento = 20%
    const item = calculateLineItem({
      costWithoutTax: 100,
      marginPercent: 30,
      discountPercent: 20,
      quantity: 1,
      applySaleTax: true,
      saleTaxPercent: 15,
    });

    // La base neta debe ser $130 (Costo $100 + Utilidad $30)
    expect(item.netUnitPrice).toBe(130.0);
    // La utilidad ganada debe ser exactamente de $30 (NO reducida por el 20% de descuento)
    expect(item.unitProfitAmount).toBe(30.0);
    // El precio de lista sin IVA debió calcularse en $162.50 para permitir un 20% de descuento ($32.50)
    expect(item.unitPriceWithoutTax).toBe(162.5);
    expect(item.unitDiscount).toBe(32.5);
  });
});



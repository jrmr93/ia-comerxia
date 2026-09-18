import { describe, it, expect } from 'vitest';
import {
  calculateCardSalePrice,
  calculateLineItem,
  calculateInvoiceTotals,
} from './ecuadorTaxCalculator.ts';

describe('Cálculos con Tarjeta de Crédito / PayPhone y Comisión', () => {
  it('debe calcular el Subtotal de Venta con Tarjeta usando la fórmula Subtotal / (1 - %Comisión)', () => {
    // Ejemplo: $100 con 5.75% comisión -> $100 / (1 - 0.0575) = $100 / 0.9425 = $106.10
    const result = calculateCardSalePrice(100, 5.75);
    expect(result).toBe(106.10);
  });

  it('debe mantener el precio sin cambios si la comisión es 0 o menor', () => {
    expect(calculateCardSalePrice(100, 0)).toBe(100);
    expect(calculateCardSalePrice(100, -5)).toBe(100);
  });

  it('debe calcular la línea de factura usando el precio con tarjeta cuando se especifica isCardPayment', () => {
    // Producto con subtotal base $100.00, IVA 15%, pago tarjeta comisión 5.75%
    const itemResult = calculateLineItem({
      id: 1,
      name: 'Producto Prueba',
      unitSalePrice: 100,
      quantity: 1,
      applySaleTax: true,
      saleTaxPercent: 15,
      isCardPayment: true,
      cardCommissionPercent: 5.75,
    });

    expect(itemResult.unitPriceWithoutTax).toBe(106.10);
    expect(itemResult.lineSubtotal).toBe(106.10);
    expect(itemResult.lineTaxAmount).toBe(15.92); // $106.10 * 0.15 = $15.915 -> $15.92
    expect(itemResult.lineTotal).toBe(122.02); // $106.10 + $15.92 = $122.02
  });

  it('debe mantener el flujo tradicional cuando NO es pago con tarjeta', () => {
    const itemResult = calculateLineItem({
      id: 1,
      name: 'Producto Prueba',
      unitSalePrice: 100,
      quantity: 1,
      applySaleTax: true,
      saleTaxPercent: 15,
      isCardPayment: false,
    });

    expect(itemResult.unitPriceWithoutTax).toBe(100.00);
    expect(itemResult.lineSubtotal).toBe(100.00);
    expect(itemResult.lineTaxAmount).toBe(15.00);
    expect(itemResult.lineTotal).toBe(115.00);
  });

  it('debe calcular los totales de la factura correctamente para compras con tarjeta', () => {
    const item1 = calculateLineItem({
      id: 1,
      name: 'Producto 1',
      unitSalePrice: 100,
      quantity: 2,
      applySaleTax: true,
      saleTaxPercent: 15,
      isCardPayment: true,
      cardCommissionPercent: 5.75,
    });

    const totals = calculateInvoiceTotals([item1]);
    expect(totals.subtotalTaxable15).toBe(212.20); // 106.10 * 2
    expect(totals.taxAmount15).toBe(31.83); // 212.20 * 0.15 = 31.83
    expect(totals.totalInvoiceAmount).toBe(244.03); // 212.20 + 31.83
  });
});

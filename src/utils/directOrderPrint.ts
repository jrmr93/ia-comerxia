import { CustomerOrder, PurchaseOrder, StoreConfig } from '../types.ts';
import { getCustomerCi, getCleanAddress, isPickupDeliveryOrder } from './orderUtils.ts';
import { calculateLineItem, calculateInvoiceTotals, extractItemTaxPercent, extractBaseUnitPriceWithoutTax, calculateCardSalePrice, EcuadorInvoiceTotalsResult } from './ecuadorTaxCalculator.ts';

export interface DirectOrderPrintParams {
  order?: CustomerOrder | null;
  purchase?: PurchaseOrder | null;
  inventoryItems?: any[];
  storeConfig?: Partial<StoreConfig> | null;
  currency?: string;
  paperFormat?: 'a4' | 'letter' | '80mm' | '58mm' | '48mm' | '44mm';
  showToast?: (msg: string) => void;
}

export interface A4PrintItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface PaperFormatSpec {
  id: 'a4' | 'letter' | '80mm' | '58mm' | '48mm' | '44mm';
  label: string;
  widthCss: string;
  isThermal: boolean;
  padding: string;
  baseFontSize: string;
  titleFontSize: string;
  numFontSize: string;
  pageSize: string;
}

export const getPaperFormatSpec = (fmt: 'a4' | 'letter' | '80mm' | '58mm' | '48mm' | '44mm'): PaperFormatSpec => {
  switch (fmt) {
    case '44mm':
      return {
        id: '44mm',
        label: '44 mm',
        widthCss: '44mm',
        isThermal: true,
        padding: '2mm 1mm',
        baseFontSize: '7px',
        titleFontSize: '8.5px',
        numFontSize: '8.5px',
        pageSize: '44mm auto',
      };
    case '48mm':
      return {
        id: '48mm',
        label: '48 mm',
        widthCss: '48mm',
        isThermal: true,
        padding: '2mm 1.5mm',
        baseFontSize: '7.5px',
        titleFontSize: '9.5px',
        numFontSize: '9.5px',
        pageSize: '48mm auto',
      };
    case '58mm':
      return {
        id: '58mm',
        label: '58 mm',
        widthCss: '58mm',
        isThermal: true,
        padding: '2.5mm 2mm',
        baseFontSize: '8.5px',
        titleFontSize: '10.5px',
        numFontSize: '10.5px',
        pageSize: '58mm auto',
      };
    case '80mm':
      return {
        id: '80mm',
        label: '80 mm',
        widthCss: '80mm',
        isThermal: true,
        padding: '3mm 2.5mm',
        baseFontSize: '9.5px',
        titleFontSize: '12px',
        numFontSize: '11.5px',
        pageSize: '80mm auto',
      };
    case 'letter':
      return {
        id: 'letter',
        label: 'Carta',
        widthCss: '215.9mm',
        isThermal: false,
        padding: '7mm 10mm',
        baseFontSize: '9.5px',
        titleFontSize: '15px',
        numFontSize: '14.5px',
        pageSize: 'letter portrait',
      };
    case 'a4':
    default:
      return {
        id: 'a4',
        label: 'A4',
        widthCss: '210mm',
        isThermal: false,
        padding: '7mm 10mm',
        baseFontSize: '9.5px',
        titleFontSize: '15px',
        numFontSize: '14.5px',
        pageSize: 'a4 portrait',
      };
  }
};

/**
 * Genera el documento HTML completo y auto-contenido adaptado al formato elegido:
 * - Para A4 / Carta: Formato oficial con desglose completo y firmas.
 * - Para Rollos Térmicos (44mm, 48mm, 58mm, 80mm): Formato POS de 2 líneas por producto.
 */
export function generateOrderPrintHtml(params: DirectOrderPrintParams): string {
  const {
    order,
    purchase,
    inventoryItems,
    storeConfig,
    currency = 'USD',
    paperFormat = 'a4',
  } = params;

  const isSale = Boolean(order);
  const isPurchase = Boolean(purchase);
  const spec = getPaperFormatSpec(paperFormat);
  const isThermal = spec.isThermal;

  const curr = currency || storeConfig?.currency || 'USD';
  const currencySymbol = curr === 'USD' ? '$' : curr;

  // Store metadata
  const storeName = storeConfig?.storeName || 'Comerxia Store';
  const storeLogo =
    storeConfig?.logoDesktopUrl ||
    storeConfig?.logoUrl ||
    (storeConfig as any)?.logo_desktop_url ||
    (storeConfig as any)?.logo_url ||
    null;
  const storeAddress = storeConfig?.address || '';
  const storePhone = storeConfig?.whatsappNumber || '';
  const storeDescription = storeConfig?.description || '';

  // Parse items safely with support for arrays, JSON strings and nested objects
  let rawItems: any[] = [];
  if (isSale && order) {
    if (Array.isArray(order.items)) {
      rawItems = order.items;
    } else if (typeof order.items === 'string') {
      try {
        rawItems = JSON.parse(order.items);
      } catch {
        rawItems = [];
      }
    }
  } else if (isPurchase && purchase) {
    if (Array.isArray(purchase.items)) {
      rawItems = purchase.items;
    } else if (typeof purchase.items === 'string') {
      try {
        rawItems = JSON.parse(purchase.items);
      } catch {
        rawItems = [];
      }
    }
  }

  const isCardOrder = isSale && Boolean(
    order && (
      (order as any).isCardPayment ||
      (order.paymentMethod && (order.paymentMethod.toLowerCase().includes('tarjeta') || order.paymentMethod.toLowerCase().includes('payphone') || order.paymentMethod.toLowerCase().includes('card'))) ||
      ((order as any).cardCommissionPercent && Number((order as any).cardCommissionPercent) > 0)
    )
  );
  const cardCommPct = isCardOrder && order ? Number((order as any).cardCommissionPercent || 5.75) : 0;

  const items: A4PrintItem[] = rawItems.map((it: any, index: number) => {
    const qty = Number(it.quantity) || 1;
    let unit = 0;
    let sku = '';
    let name = '';

    const subItem = it.item && typeof it.item === 'object' ? it.item : {};

    let netUnit = 0;
    if (isSale) {
      unit = Number(it.salePrice ?? subItem.salePrice ?? it.unitPrice ?? it.price ?? subItem.price ?? 0);
      if (isCardOrder && cardCommPct > 0) {
        unit = calculateCardSalePrice(unit, cardCommPct);
      }
      const discount = Number(it.discount ?? subItem.discount ?? 0);
      netUnit = Math.max(0, unit - discount);
      sku = it.sku || subItem.sku || (it.inventoryItemId ? `SKU-${it.inventoryItemId}` : it.id ? `SKU-${it.id}` : `PRD-${index + 1}`);
      name = it.name || subItem.name || it.productName || it.title || 'Producto';
    } else {
      unit = Number(it.costPrice ?? subItem.costPrice ?? it.unitCost ?? it.cost ?? it.price ?? 0);
      netUnit = unit;
      sku = it.sku || subItem.sku || (it.inventoryItemId ? `SKU-${it.inventoryItemId}` : it.barcode || `CMP-${index + 1}`);
      name = it.name || subItem.name || it.productName || it.title || 'Producto adq.';
    }

    return {
      sku,
      name,
      quantity: qty,
      unitPrice: unit,
      totalPrice: Number((qty * netUnit).toFixed(2)),
    };
  });

  const totalUnits = items.reduce((acc, it) => acc + it.quantity, 0);
  const itemsSubtotal = items.reduce((acc, it) => acc + it.totalPrice, 0);

  // Financial summary
  let finalTotal = itemsSubtotal;
  let shippingCost = 0;
  let subtotal = itemsSubtotal;
  let orderNumberStr = '';
  let documentTitle = '';
  let orderDateStr = '';
  let orderStatusBadge = '';

  if (isSale && order) {
    const isConfirmedOrder = order.status === 'confirmed' || order.status === 'shipped' || order.status === 'delivered';
    documentTitle = isConfirmedOrder ? 'FACTURA DE VENTA' : 'PRE-FACTURA DE VENTA';
    orderNumberStr = String(order.orderNumber || order.id || '');
    const rawOrderDate = order.createdAt ? new Date(order.createdAt) : (order as any).date ? new Date((order as any).date) : new Date();
    const safeOrderDate = isNaN(rawOrderDate.getTime()) ? new Date() : rawOrderDate;
    orderDateStr = safeOrderDate.toLocaleDateString('es-EC', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    shippingCost = Number((order as any).shippingCost ?? (order as any).deliveryFee ?? 0);
    finalTotal = Number(order.totalAmount ?? (itemsSubtotal + shippingCost));
    subtotal = Math.max(0, finalTotal - shippingCost);

    orderStatusBadge =
      order.status === 'delivered'
        ? 'ENTREGADO'
        : order.status === 'shipped'
        ? 'EN TRÁNSITO'
        : order.status === 'confirmed'
        ? 'CONFIRMADO'
        : order.status === 'cancelled'
        ? 'CANCELADO'
        : 'PENDIENTE DE PAGO';
  } else if (isPurchase && purchase) {
    documentTitle = 'ORDEN DE COMPRA';
    orderNumberStr = String(purchase.purchaseNumber || purchase.id || '');
    const rawPurchaseDate = purchase.purchaseDate ? new Date(purchase.purchaseDate) : purchase.createdAt ? new Date(purchase.createdAt) : new Date();
    const safePurchaseDate = isNaN(rawPurchaseDate.getTime()) ? new Date() : rawPurchaseDate;
    orderDateStr = safePurchaseDate.toLocaleDateString('es-EC', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    finalTotal = Number(purchase.totalCost ?? itemsSubtotal);
    subtotal = finalTotal;

    orderStatusBadge =
      purchase.status === 'received'
        ? 'RECIBIDO EN BODEGA'
        : purchase.status === 'ordered'
        ? 'CONFIRMADO CON PROVEEDOR'
        : purchase.status === 'cancelled'
        ? 'ANULADO'
        : 'PENDIENTE';
  }

  // SRI Fiscal Breakdown calculation for Sales and Orders
  let salesCalculatedItems: any[] = [];
  let invoiceTotals: EcuadorInvoiceTotalsResult | null = null;
  if (isSale && order) {
    const orderTaxPct = Number((order as any).saleTaxPercent || 15);

    const parsedItems = rawItems.map((it: any) => {
      const targetId = it.inventoryItemId || it.id;
      const matchingProduct = (inventoryItems || []).find(
        (p: any) => p.id === targetId || (it.sku && p.sku && p.sku.toLowerCase() === it.sku.toLowerCase())
      );
      const cPrice = Number(it.costPrice ?? matchingProduct?.costWithoutTax ?? matchingProduct?.costPrice ?? 0);
      const hasItemSalePrice = (it.salePrice !== undefined && it.salePrice !== null && !isNaN(Number(it.salePrice))) ||
                               (it.item?.salePrice !== undefined && it.item?.salePrice !== null && !isNaN(Number(it.item.salePrice)));
      const rawSale = Number(it.salePrice || it.item?.salePrice || matchingProduct?.salePrice || 0);
      const itemTaxPct = extractItemTaxPercent(it, orderTaxPct, matchingProduct);
      const itemApplyTax = itemTaxPct > 0;
      const pricingMode = hasItemSalePrice
        ? (it.pricingMode ? it.pricingMode : (itemApplyTax && matchingProduct?.salePrice && Math.abs(rawSale - Number(matchingProduct.salePrice)) < 0.01 ? 'INCLUDING_TAX' : 'EXCLUDING_TAX'))
        : (itemApplyTax ? 'INCLUDING_TAX' : 'EXCLUDING_TAX');

      const basePriceInfo = extractBaseUnitPriceWithoutTax({
        rawSalePrice: rawSale,
        costWithoutTax: cPrice,
        pricingMode,
        applySaleTax: itemApplyTax,
        saleTaxPercent: itemTaxPct,
        marginPercent: it.marginPercent !== undefined ? Number(it.marginPercent) : (matchingProduct as any)?.marginPercent,
      });
      const baseSalePrice = basePriceInfo.unitPriceWithoutTax;
      const marginPct = basePriceInfo.marginPercent;
      let discVal = Number(it.discount ?? 0);
      if (discVal === 0 && (it.discountPercent || matchingProduct?.discountPercent)) {
        const pct = Number(it.discountPercent || matchingProduct?.discountPercent || 0);
        if (pct > 0) {
          discVal = Math.round((baseSalePrice * pct / 100) * 100) / 100;
        }
      }
      return {
        id: targetId,
        inventoryItemId: it.inventoryItemId || it.id,
        name: it.name || it.item?.name || matchingProduct?.name || 'Producto',
        sku: it.sku || it.item?.sku || matchingProduct?.sku || '',
        barcode: it.barcode || matchingProduct?.barcode || undefined,
        costPrice: cPrice,
        marginPercent: marginPct,
        supplierName: it.supplierName || (matchingProduct as any)?.supplier || undefined,
        salePrice: baseSalePrice,
        discount: discVal,
        discountPercent: it.discountPercent ? Number(it.discountPercent) : (matchingProduct?.discountPercent ? Number(matchingProduct.discountPercent) : 0),
        quantity: Number(it.quantity || 1),
        imageUrl: it.imageUrl || it.item?.imageUrl || matchingProduct?.imageUrl || null,
      };
    });

    const calculatedItems = parsedItems.map((it: any) => {
      const match = (inventoryItems || []).find(
        (p: any) => p.id === it.id || (it.sku && p.sku && p.sku.toLowerCase() === it.sku.toLowerCase())
      );
      const unitCost = Number(it.costPrice ?? match?.costWithoutTax ?? match?.costPrice ?? 0);
      const unitSale = Number(it.salePrice || 0);
      const itemTaxPercent = extractItemTaxPercent(it, orderTaxPct, match);

      const lineResult = calculateLineItem({
        id: it.id,
        name: it.name,
        sku: it.sku,
        costWithoutTax: unitCost,
        unitSalePrice: unitSale,
        pricingMode: 'EXCLUDING_TAX',
        discount: Number(it.discount || 0),
        quantity: Number(it.quantity || 1),
        applySaleTax: itemTaxPercent > 0,
        saleTaxPercent: itemTaxPercent,
      });

      return {
        ...lineResult,
        imageUrl: it.imageUrl,
      };
    });

    const itemsTotalWithTax = calculatedItems.reduce((acc: number, it: any) => acc + it.lineTotal, 0);
    const explicitShip = Number((order as any).shippingCost ?? (order as any).deliveryFee);
    let derivedShippingCost = 0;
    if (!isNaN(explicitShip) && explicitShip >= 0 && (order as any).shippingCost !== undefined && (order as any).shippingCost !== null) {
      derivedShippingCost = explicitShip;
    } else {
      const orderTotal = Number(order.totalAmount || 0);
      const derivedShip = Math.max(0, orderTotal - itemsTotalWithTax);
      derivedShippingCost = derivedShip > 0 ? derivedShip : 0;
    }
    const isPickup = isPickupDeliveryOrder(order);
    const fee = isPickup ? 0 : derivedShippingCost;

    salesCalculatedItems = calculatedItems;
    invoiceTotals = calculateInvoiceTotals(calculatedItems, { shippingFee: fee });
  }

  let purchaseSriBreakdown: {
    subtotal0: number;
    subtotal15: number;
    subtotal5: number;
    subtotalSinImpuesto: number;
    totalDiscount: number;
    iva15: number;
    iva5: number;
    grandTotal: number;
  } | null = null;

  if (isPurchase && purchase) {
    let subtotal0 = 0;
    let subtotal15 = 0;
    let subtotal5 = 0;
    let totalDiscount = 0;

    (rawItems || []).forEach((item: any) => {
      const qty = Number(item.quantity) || 1;
      const discount = Number(item.discount || 0);
      totalDiscount += discount;

      const taxPercent =
        item.taxPercent !== undefined
          ? Number(item.taxPercent)
          : (item as any).purchaseTaxPercent !== undefined
          ? Number((item as any).purchaseTaxPercent)
          : (item as any).hasPurchaseTax === false
          ? 0
          : 15;

      const baseUnitCost = Number(item.costPrice || 0);
      const lineSubtotal = Math.max(0, baseUnitCost * qty - discount);

      if (taxPercent === 0) {
        subtotal0 += lineSubtotal;
      } else if (taxPercent === 5) {
        subtotal5 += lineSubtotal;
      } else {
        subtotal15 += lineSubtotal;
      }
    });

    const subtotalSinImpuesto = subtotal0 + subtotal15 + subtotal5;
    const iva15 = subtotal15 * 0.15;
    const iva5 = subtotal5 * 0.05;
    const grandTotal = Number((purchase as any).totalCost ?? (subtotalSinImpuesto + iva15 + iva5));

    purchaseSriBreakdown = {
      subtotal0,
      subtotal15,
      subtotal5,
      subtotalSinImpuesto,
      totalDiscount,
      iva15,
      iva5,
      grandTotal,
    };
  }

  const purchaseFormattedItems = isPurchase && purchase ? (rawItems || []).map((item: any, idx: number) => {
    const ordered = Number(item.quantity) || 1;
    const isReceived = purchase.status === 'received';
    const rec = isReceived ? ordered : Number(item.receivedQuantity) || 0;
    const pending = isReceived ? 0 : Math.max(0, ordered - rec);
    const unitCost = Number(item.costPrice || 0);
    const discount = Number(item.discount || 0);
    const taxPercent =
      item.taxPercent !== undefined
        ? Number(item.taxPercent)
        : (item as any).purchaseTaxPercent !== undefined
        ? Number((item as any).purchaseTaxPercent)
        : (item as any).hasPurchaseTax === false
        ? 0
        : 15;
    const lineSubtotal = Math.max(0, unitCost * ordered - discount);
    const subItem = item.item && typeof item.item === 'object' ? item.item : {};
    const sku = item.sku || subItem.sku || (item.inventoryItemId ? `SKU-${item.inventoryItemId}` : item.barcode || `CMP-${idx + 1}`);
    const name = item.name || subItem.name || item.productName || item.title || 'Producto adq.';

    return {
      index: idx + 1,
      sku,
      name,
      ordered,
      received: rec,
      pending,
      unitCost,
      discount,
      taxPercent,
      lineSubtotal,
    };
  }) : [];

  const purchaseTotalOrdered = purchaseFormattedItems.reduce((sum, it) => sum + it.ordered, 0);

  // Customer / Supplier specifics
  const customerName = order?.customerName || '';
  const customerCi = order ? getCustomerCi(order) : '';
  const customerPhone = order?.customerPhone || '';
  const customerEmail = order ? (order.customerEmail || (order as any).email || '') : '';
  const customerAddress = order
    ? getCleanAddress((order as any).customerFiscalAddress || order.customerAddress || order.clientAddress || order.shippingAddress)
    : '';
  const isPickup = order ? isPickupDeliveryOrder(order) : false;
  const paymentMethod = order?.paymentMethod || '';

  const supplierName = purchase?.supplierName || '';
  const supplierContact = purchase?.supplierContact || '';
  const paymentStatus = purchase?.paymentStatus === 'paid' ? 'PAGADO' : 'POR PAGAR';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${documentTitle} #${orderNumberStr} - Comerxia ERP</title>
  <style>
    @page {
      size: ${spec.pageSize};
      margin: 0mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: ${spec.baseFontSize};
      line-height: 1.3;
      width: ${spec.widthCss};
    }
    .page-wrapper {
      width: ${spec.widthCss};
      max-width: ${spec.widthCss};
      margin: 0 auto;
      background: #ffffff;
      padding: ${spec.padding};
      box-sizing: border-box;
    }

    /* Estilos Hoja Completa A4 / Carta */
    .header-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 8px; border-bottom: 2px solid #0f172a; }
    .header-table td { vertical-align: top; }
    .store-name { font-size: 16px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin-bottom: 2px; }
    .store-sub { font-size: 10px; color: #475569; }
    .doc-badge { display: inline-block; padding: 3px 9px; background: #0f172a; color: #ffffff; font-weight: 900; font-size: 10.5px; border-radius: 4px; text-transform: uppercase; }
    .doc-number { font-size: 16px; font-weight: 900; color: #0284c7; margin-top: 3px; font-family: monospace; }
    .meta-box { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; }
    .meta-box td { padding: 5px 8px; vertical-align: top; border-right: 1px solid #e2e8f0; width: 50%; }
    .meta-box td:last-child { border-right: none; }
    .section-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #334155; margin-bottom: 3px; border-bottom: 1px solid #cbd5e1; }
    .field-row { margin-bottom: 2px; font-size: 10.5px; word-break: break-word; }
    .field-label { font-weight: 700; color: #475569; display: inline-block; min-width: 80px; }
    .field-val { color: #0f172a; font-weight: 500; }
    .items-table { width: 100%; border-collapse: collapse; table-layout: fixed; word-wrap: break-word; margin-top: 4px; margin-bottom: 8px; font-size: 10.5px; }
    .items-table th { background-color: #f1f5f9; color: #0f172a; font-weight: 800; text-transform: uppercase; font-size: 9.5px; border-top: 1px solid #cbd5e1; border-bottom: 1.5px solid #94a3b8; padding: 5px 7px; text-align: left; }
    .items-table td { padding: 5px 7px; border-bottom: 1px solid #e2e8f0; color: #1e293b; vertical-align: middle; font-size: 10px; }
    .sku-code { font-family: monospace; font-weight: 700; color: #0369a1; font-size: 10px; word-break: break-all; }
    .product-title { font-weight: 600; color: #0f172a; word-break: break-word; }
    .qty-cell { text-align: center; font-weight: 800; font-size: 11px; }
    .price-cell { text-align: right; font-family: monospace; font-weight: 600; }
    .total-cell { text-align: right; font-family: monospace; font-weight: 800; color: #0f172a; }
    .summary-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 4px; }
    .totals-box { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    .totals-box td { padding: 3px 5px; }
    .totals-label { text-align: right; color: #475569; font-weight: 700; width: 60%; }
    .totals-val { text-align: right; font-family: monospace; font-weight: 700; color: #0f172a; width: 40%; }
    .grand-total-row { border-top: 2px solid #0f172a; background-color: #f8fafc; }
    .grand-total-row td { padding: 5px 6px; font-size: 12px; font-weight: 900; color: #0f172a; }
    .signatures-section { margin-top: 16px; page-break-inside: avoid; }
    .signatures-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .signatures-table td { width: 50%; padding: 0 16px; text-align: center; vertical-align: bottom; }
    .signature-line { border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 9px; font-weight: 700; color: #475569; text-transform: uppercase; }
    .footer-doc { margin-top: 8px; padding-top: 4px; border-top: 1px dashed #cbd5e1; text-align: center; font-size: 8.5px; color: #64748b; }

    /* Estilos Rollos Térmicos */
    .thermal-divider { border-bottom: 1px dashed #94a3b8; margin: 4px 0; }
    .thermal-header { text-align: center; margin-bottom: 4px; }
    .thermal-title { font-weight: 900; text-transform: uppercase; font-size: ${spec.titleFontSize}; color: #0f172a; }
    .thermal-item-title { font-weight: 700; color: #0f172a; word-break: break-word; }
    .thermal-item-sub { display: flex; justify-content: space-between; font-size: 0.9em; color: #475569; margin-top: 1px; }

    @media print {
      .print-helper-bar { display: none !important; }
      .page-wrapper { width: 100% !important; max-width: 100% !important; padding: ${spec.padding} !important; border: none !important; box-shadow: none !important; }
    }
  </style>
  <script>
    (function() {
      function launchPrint() {
        try { window.focus(); window.print(); } catch(e) {}
      }
      if (document.readyState === 'complete') { setTimeout(launchPrint, 100); }
      else { window.addEventListener('load', function() { setTimeout(launchPrint, 100); }); }
    })();
  </script>
</head>
<body>
  <div class="page-wrapper">
    ${
      isThermal
        ? `
      <!-- TICKET POS TÉRMICO AUTO-AJUSTADO -->
      <div class="thermal-header">
        ${storeLogo ? `<img src="${storeLogo}" alt="${storeName}" style="max-height: 28px; max-width: 120px; object-fit: contain; margin-bottom: 2px;" /><br>` : ''}
        <div class="thermal-title">${storeName}</div>
        ${storeDescription ? `<div style="font-size: 0.9em; color: #475569;">${storeDescription}</div>` : ''}
        ${storeAddress ? `<div style="font-size: 0.9em; color: #475569;">${storeAddress}</div>` : ''}
        ${storePhone ? `<div style="font-size: 0.9em; color: #475569;">Tel: ${storePhone}</div>` : ''}
      </div>

      <div class="thermal-divider"></div>

      <div style="text-align: center; margin-bottom: 4px;">
        <div class="thermal-title">${documentTitle} #${orderNumberStr}</div>
        <div style="font-size: 0.9em; color: #475569; margin-top: 1px;">${orderDateStr}</div>
        <div style="font-weight: 800; font-size: 0.85em; margin-top: 2px; color: #1e293b;">[ESTADO: ${orderStatusBadge}]</div>
      </div>

      <div class="thermal-divider"></div>

      <div style="margin-bottom: 4px; font-size: 0.95em;">
        ${
          isSale
            ? `
          <div><strong>Cliente:</strong> ${customerName || 'Consumidor Final'}</div>
          ${customerCi ? `<div><strong>CI/RUC:</strong> ${customerCi}</div>` : ''}
          ${customerPhone ? `<div><strong>Tel:</strong> ${customerPhone}</div>` : ''}
          ${customerAddress ? `<div><strong>Dir:</strong> ${customerAddress}</div>` : ''}
          ${paymentMethod ? `<div><strong>Pago:</strong> ${paymentMethod}</div>` : ''}
        `
            : `
          <div><strong>Proveedor:</strong> ${supplierName || 'Proveedor Registrado'}</div>
          ${supplierContact ? `<div><strong>Contacto:</strong> ${supplierContact}</div>` : ''}
          <div><strong>Estado Pago:</strong> ${paymentStatus}</div>
        `
        }
      </div>

      <div class="thermal-divider"></div>

      <!-- PRODUCTOS EN 2 LÍNEAS -->
      <div style="margin-bottom: 4px;">
        <div style="font-weight: 800; font-size: 0.85em; display: flex; justify-content: space-between; border-bottom: 1px solid #0f172a; padding-bottom: 2px; margin-bottom: 3px;">
          <span>CANT / PRODUCTO</span>
          <span>TOTAL</span>
        </div>
        ${
          isSale
            ? salesCalculatedItems
                .map(
                  (it) => `
              <div style="margin-bottom: 3px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 2px;">
                <div class="thermal-item-title">${it.name}</div>
                <div class="thermal-item-sub">
                  <span>${it.quantity} u. x ${currencySymbol}${it.unitPriceWithoutTax.toFixed(2)}${it.unitDiscount > 0 ? ` (-${currencySymbol}${(it.unitDiscount * it.quantity).toFixed(2)})` : ''}</span>
                  <span style="font-weight: 800; color: #0f172a; font-family: monospace;">${currencySymbol}${it.lineSubtotal.toFixed(2)}</span>
                </div>
              </div>
            `
                )
                .join('')
            : purchaseFormattedItems
                .map(
                  (it) => `
              <div style="margin-bottom: 3px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 2px;">
                <div class="thermal-item-title">${it.name}</div>
                <div class="thermal-item-sub">
                  <span>${it.ordered} u. x ${currencySymbol}${it.unitCost.toFixed(2)}${it.discount > 0 ? ` (-${currencySymbol}${it.discount.toFixed(2)})` : ''}</span>
                  <span style="font-weight: 800; color: #0f172a; font-family: monospace;">${currencySymbol}${it.lineSubtotal.toFixed(2)}</span>
                </div>
              </div>
            `
                )
                .join('')
        }
      </div>

      <div class="thermal-divider"></div>

      <!-- TOTALES -->
      <div style="font-size: 0.95em;">
        ${
          isSale && invoiceTotals
            ? `
          <div style="display: flex; justify-content: space-between;"><span>Subtotal 0%:</span><span style="font-family: monospace;">${currencySymbol}${invoiceTotals.subtotalZero0.toFixed(2)}</span></div>
          <div style="display: flex; justify-content: space-between;"><span>Subtotal 15%:</span><span style="font-family: monospace;">${currencySymbol}${invoiceTotals.subtotalTaxable15.toFixed(2)}</span></div>
          ${invoiceTotals.totalDiscount > 0 ? `<div style="display: flex; justify-content: space-between; color: #9a3412;"><span>Desc. Total:</span><span style="font-family: monospace;">-${currencySymbol}${invoiceTotals.totalDiscount.toFixed(2)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between;"><span>IVA 15%:</span><span style="font-family: monospace;">${currencySymbol}${invoiceTotals.taxAmount15.toFixed(2)}</span></div>
          ${invoiceTotals.shippingFee > 0 ? `<div style="display: flex; justify-content: space-between;"><span>Envío:</span><span style="font-family: monospace;">+${currencySymbol}${invoiceTotals.shippingFee.toFixed(2)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; font-weight: 900; border-top: 2px solid #0f172a; margin-top: 3px; padding-top: 2px; font-size: ${spec.numFontSize};">
            <span>TOTAL:</span>
            <span style="font-family: monospace;">${currencySymbol}${invoiceTotals.totalInvoiceAmount.toFixed(2)}</span>
          </div>
        `
            : isPurchase && purchaseSriBreakdown
            ? `
          <div style="display: flex; justify-content: space-between;"><span>Subtotal Sin Imp:</span><span style="font-family: monospace;">${currencySymbol}${purchaseSriBreakdown.subtotalSinImpuesto.toFixed(2)}</span></div>
          <div style="display: flex; justify-content: space-between;"><span>IVA 15%:</span><span style="font-family: monospace;">${currencySymbol}${purchaseSriBreakdown.iva15.toFixed(2)}</span></div>
          <div style="display: flex; justify-content: space-between; font-weight: 900; border-top: 2px solid #0f172a; margin-top: 3px; padding-top: 2px; font-size: ${spec.numFontSize};">
            <span>TOTAL:</span>
            <span style="font-family: monospace;">${currencySymbol}${purchaseSriBreakdown.grandTotal.toFixed(2)}</span>
          </div>
        `
            : ''
        }
      </div>

      <div class="thermal-divider"></div>

      <div style="text-align: center; font-size: 0.85em; color: #64748b; margin-top: 4px;">
        <div style="font-weight: 700; color: #0f172a;">¡Gracias por su preferencia!</div>
        <div>Comerxia ERP • ${new Date().toLocaleDateString('es-EC')}</div>
      </div>
    `
        : `
      <!-- COMPROBANTE DE HOJA COMPLETA (A4 / CARTA) -->
      <table class="header-table">
        <tr>
          <td style="width: 60%;">
            ${storeLogo ? `<img src="${storeLogo}" alt="${storeName}" style="max-height: 40px; max-width: 160px; object-fit: contain; margin-bottom: 4px;" /><br>` : ''}
            <div class="store-name">${storeName}</div>
            ${storeDescription ? `<div class="store-sub">${storeDescription}</div>` : ''}
            ${storeAddress ? `<div class="store-sub"><strong>Dirección:</strong> ${storeAddress}</div>` : ''}
            ${storePhone ? `<div class="store-sub"><strong>Teléfono / WhatsApp:</strong> ${storePhone}</div>` : ''}
          </td>
          <td style="width: 40%; text-align: right;">
            <div class="doc-badge">${documentTitle}</div>
            <div class="doc-number">#${orderNumberStr}</div>
            <div style="font-size: 9px; color: #475569; margin-top: 3px;">
              <strong>Fecha de Emisión:</strong><br>${orderDateStr}
            </div>
            <div style="margin-top: 4px;">
              <span style="font-size: 8.5px; font-weight: 800; background: #e2e8f0; color: #1e293b; padding: 2px 6px; border-radius: 3px; display: inline-block;">
                ESTADO: ${orderStatusBadge}
              </span>
            </div>
          </td>
        </tr>
      </table>

      <table class="meta-box">
        <tr>
          <td>
            <div class="section-title">${isSale ? 'Datos del Cliente' : 'Datos del Proveedor'}</div>
            ${
              isSale
                ? `
              <div class="field-row"><span class="field-label">Cliente:</span> <span class="field-val"><strong>${customerName || 'Cliente General'}</strong></span></div>
              <div class="field-row"><span class="field-label">Cédula / RUC:</span> <span class="field-val">${customerCi || 'Consumidor Final'}</span></div>
              <div class="field-row"><span class="field-label">Teléfono:</span> <span class="field-val">${customerPhone || '—'}</span></div>
              ${customerEmail ? `<div class="field-row"><span class="field-label">Correo:</span> <span class="field-val">${customerEmail}</span></div>` : ''}
              <div class="field-row"><span class="field-label">Dirección:</span> <span class="field-val">${customerAddress || (isPickup ? 'Retiro en Local Comercial' : '—')}</span></div>
            `
                : `
              <div class="field-row"><span class="field-label">Proveedor:</span> <span class="field-val"><strong>${supplierName || 'Proveedor Registrado'}</strong></span></div>
              <div class="field-row"><span class="field-label">Contacto:</span> <span class="field-val">${supplierContact || '—'}</span></div>
              <div class="field-row"><span class="field-label">Estado Pago:</span> <span class="field-val">${paymentStatus}</span></div>
            `
            }
          </td>
          <td>
            <div class="section-title">${isSale ? 'Detalles de Despacho y Pago' : 'Condiciones de la Orden'}</div>
            ${
              isSale
                ? `
              <div class="field-row"><span class="field-label">Modalidad:</span> <span class="field-val"><strong>${isPickup ? 'Retiro en Local' : 'Envío a Domicilio'}</strong></span></div>
              <div class="field-row"><span class="field-label">Forma de Pago:</span> <span class="field-val">${paymentMethod || 'Acuerdo Comercial'}</span></div>
            `
                : `
              <div class="field-row"><span class="field-label">Recepción:</span> <span class="field-val">${purchase?.status === 'received' ? 'Recibido en Bodega Central' : 'Pendiente de Entrega'}</span></div>
              <div class="field-row"><span class="field-label">Total Ítems:</span> <span class="field-val">${items.length} productos (${totalUnits} unidades)</span></div>
            `
            }
          </td>
        </tr>
      </table>

      <table class="items-table">
        <thead>
          ${
            isSale
              ? `
            <tr>
              <th style="width: 4%; text-align: center;">#</th>
              <th style="width: 36%;">Producto / Descripción</th>
              <th style="width: 14%;">SKU / Código</th>
              <th style="width: 8%; text-align: center;">Cantidad</th>
              <th style="width: 11%; text-align: right;">Valor Unit. ($)</th>
              <th style="width: 9%; text-align: right;">Desc. ($)</th>
              <th style="width: 7%; text-align: center;">IVA (%)</th>
              <th style="width: 11%; text-align: right;">Subtotal ($)</th>
            </tr>
          `
              : `
            <tr>
              <th style="width: 4%; text-align: center;">#</th>
              <th style="width: 32%;">Producto / Descripción</th>
              <th style="width: 15%;">SKU / Código</th>
              <th style="width: 7%; text-align: center;">Pedida</th>
              <th style="width: 7%; text-align: center;">Bodega</th>
              <th style="width: 7%; text-align: center;">Pendiente</th>
              <th style="width: 10%; text-align: right;">Costo Unit. ($)</th>
              <th style="width: 7%; text-align: right;">Desc. ($)</th>
              <th style="width: 5%; text-align: center;">IVA</th>
              <th style="width: 11%; text-align: right;">Total ($)</th>
            </tr>
          `
          }
        </thead>
        <tbody>
          ${
            isSale
              ? salesCalculatedItems
                  .map(
                    (it, idx) => `
                <tr>
                  <td style="text-align: center; font-weight: bold; color: #64748b;">#${idx + 1}</td>
                  <td class="product-title">${it.name}</td>
                  <td class="sku-code">${it.sku || '-'}</td>
                  <td class="qty-cell">${it.quantity} u.</td>
                  <td class="price-cell">${currencySymbol}${it.unitPriceWithoutTax.toFixed(2)}</td>
                  <td class="price-cell" style="color: ${it.unitDiscount > 0 ? '#b45309' : '#64748b'};">${currencySymbol}${(it.unitDiscount * it.quantity).toFixed(2)}</td>
                  <td style="text-align: center; font-weight: bold;">
                    <span style="display: inline-block; padding: 1px 4px; border-radius: 3px; font-size: 9px; ${it.lineTaxPercent > 0 ? 'background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe;' : 'background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;'}">
                      ${it.lineTaxPercent}%
                    </span>
                  </td>
                  <td class="total-cell">${currencySymbol}${it.lineSubtotal.toFixed(2)}</td>
                </tr>
              `
                  )
                  .join('')
              : purchaseFormattedItems
                  .map(
                    (it) => `
                <tr>
                  <td style="text-align: center; font-weight: bold; color: #64748b;">${it.index}</td>
                  <td class="product-title">${it.name}</td>
                  <td class="sku-code">${it.sku}</td>
                  <td class="qty-cell">${it.ordered} u.</td>
                  <td class="qty-cell" style="color: #15803d;">${it.received} u.</td>
                  <td class="qty-cell" style="color: #b45309;">${it.pending} u.</td>
                  <td class="price-cell">${currencySymbol}${it.unitCost.toFixed(2)}</td>
                  <td class="price-cell" style="color: ${it.discount > 0 ? '#b45309' : '#64748b'};">${currencySymbol}${it.discount.toFixed(2)}</td>
                  <td style="text-align: center; font-weight: bold;">${it.taxPercent}%</td>
                  <td class="total-cell">${currencySymbol}${it.lineSubtotal.toFixed(2)}</td>
                </tr>
              `
                  )
                  .join('')
          }
        </tbody>
      </table>

      <table class="summary-table">
        <tr>
          <td style="width: 52%; vertical-align: top;">
            <div style="font-size: 9px; color: #64748b; font-style: italic;">
              * Comprobante oficial generado por el sistema Comerxia ERP.
            </div>
          </td>
          <td style="width: 48%;">
            <table class="totals-box">
              ${
                isSale && invoiceTotals
                  ? `
                <tr><td class="totals-label">Total Unidades:</td><td class="totals-val">${invoiceTotals.totalUnits} un.</td></tr>
                <tr><td class="totals-label">Subtotal 0%:</td><td class="totals-val">${currencySymbol}${invoiceTotals.subtotalZero0.toFixed(2)}</td></tr>
                <tr><td class="totals-label">Subtotal 15%:</td><td class="totals-val">${currencySymbol}${invoiceTotals.subtotalTaxable15.toFixed(2)}</td></tr>
                <tr style="border-top: 1px solid #cbd5e1;"><td class="totals-label" style="font-weight: 800; color: #0f172a;">Subtotal Sin Impuestos:</td><td class="totals-val" style="font-weight: 800;">${currencySymbol}${invoiceTotals.subtotalNoTax.toFixed(2)}</td></tr>
                ${invoiceTotals.totalDiscount > 0 ? `<tr><td class="totals-label" style="color: #9a3412;">Total Descuento:</td><td class="totals-val" style="color: #9a3412;">-${currencySymbol}${invoiceTotals.totalDiscount.toFixed(2)}</td></tr>` : ''}
                <tr><td class="totals-label">IVA 15%:</td><td class="totals-val">${currencySymbol}${invoiceTotals.taxAmount15.toFixed(2)}</td></tr>
                ${invoiceTotals.shippingFee > 0 ? `<tr><td class="totals-label">Valor Envío:</td><td class="totals-val">+${currencySymbol}${invoiceTotals.shippingFee.toFixed(2)}</td></tr>` : ''}
                <tr class="grand-total-row">
                  <td class="totals-label" style="font-size: 10.5px; color: #0f172a; font-weight: 900;">TOTAL VENTA SRI:</td>
                  <td class="totals-val" style="font-size: 12px; color: #0284c7; font-weight: 900;">${currencySymbol}${invoiceTotals.totalInvoiceAmount.toFixed(2)}</td>
                </tr>
              `
                  : isPurchase && purchaseSriBreakdown
                  ? `
                <tr><td class="totals-label">Subtotal Sin Impuesto:</td><td class="totals-val">${currencySymbol}${purchaseSriBreakdown.subtotalSinImpuesto.toFixed(2)}</td></tr>
                <tr><td class="totals-label">IVA COMPRA (15%):</td><td class="totals-val">${currencySymbol}${purchaseSriBreakdown.iva15.toFixed(2)}</td></tr>
                <tr class="grand-total-row">
                  <td class="totals-label" style="font-size: 10.5px; color: #0f172a; font-weight: 900;">TOTAL COMPRA SRI:</td>
                  <td class="totals-val" style="font-size: 12px; color: #0284c7; font-weight: 900;">${currencySymbol}${purchaseSriBreakdown.grandTotal.toFixed(2)}</td>
                </tr>
              `
                  : ''
              }
            </table>
          </td>
        </tr>
      </table>

      <div class="signatures-section">
        <table class="signatures-table">
          <tr>
            <td>
              <div class="signature-line">
                Emitido / Autorizado por<br>
                <span style="font-weight: normal; font-size: 8.5px; color: #64748b;">${storeName}</span>
              </div>
            </td>
            <td>
              <div class="signature-line">
                Recibido Conforme<br>
                <span style="font-weight: normal; font-size: 8.5px; color: #64748b;">${isSale ? customerName || 'Firma de Cliente' : supplierName || 'Firma de Proveedor'}</span>
              </div>
            </td>
          </tr>
        </table>
        <div class="footer-doc">
          Documento generado el ${new Date().toLocaleString('es-EC')} • Comerxia ERP
        </div>
      </div>
    `
    }
  </div>
</body>
</html>`;
}

/**
 * Limpia cualquier residuo de estilos o contenedores de impresión previa.
 */
export function cleanUpLegacyPrintArtifacts(): void {
  try {
    const legacyStyle = document.getElementById('direct-order-print-styles');
    if (legacyStyle && legacyStyle.parentNode) {
      legacyStyle.parentNode.removeChild(legacyStyle);
    }
    const legacyArea = document.getElementById('direct-order-print-area');
    if (legacyArea && legacyArea.parentNode) {
      legacyArea.parentNode.removeChild(legacyArea);
    }
    const legacyFrames = document.querySelectorAll('iframe[id^="__comerxia_print_frame"]');
    legacyFrames.forEach((frame) => {
      if (frame.parentNode) {
        frame.parentNode.removeChild(frame);
      }
    });
  } catch (e) {
    console.warn('Error al limpiar artefactos previos de impresión:', e);
  }
}

if (typeof document !== 'undefined') {
  cleanUpLegacyPrintArtifacts();
}

/**
 * Realiza la impresión mediante un iframe invisible y completamente aislado.
 */
function printViaIsolatedIframe(htmlContent: string): Promise<boolean> {
  return new Promise((resolve) => {
    cleanUpLegacyPrintArtifacts();

    const iframeId = `__comerxia_print_frame_${Date.now()}__`;
    const iframe = document.createElement('iframe');
    iframe.id = iframeId;
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.style.zIndex = '-99999';

    let isCleaned = false;
    const cleanUp = () => {
      if (isCleaned) return;
      isCleaned = true;
      try {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      } catch {}
    };

    const safetyTimer = setTimeout(() => {
      cleanUp();
      resolve(true);
    }, 60000);

    document.body.appendChild(iframe);

    try {
      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!doc || !iframe.contentWindow) {
        cleanUp();
        clearTimeout(safetyTimer);
        resolve(false);
        return;
      }

      doc.open();
      doc.write(htmlContent);
      doc.close();

      const execPrint = () => {
        try {
          const win = iframe.contentWindow;
          if (!win) {
            cleanUp();
            clearTimeout(safetyTimer);
            resolve(false);
            return;
          }

          try {
            win.addEventListener('afterprint', () => {
              clearTimeout(safetyTimer);
              setTimeout(cleanUp, 500);
              resolve(true);
            });
          } catch {}

          win.focus();
          win.print();
          resolve(true);
        } catch (err) {
          cleanUp();
          clearTimeout(safetyTimer);
          resolve(false);
        }
      };

      if (iframe.contentWindow.document.readyState === 'complete') {
        setTimeout(execPrint, 250);
      } else {
        iframe.onload = () => setTimeout(execPrint, 250);
        setTimeout(execPrint, 700);
      }
    } catch (err) {
      cleanUp();
      clearTimeout(safetyTimer);
      resolve(false);
    }
  });
}

function triggerPrintViaBlobWindow(htmlContent: string, showToast?: (msg: string) => void): void {
  try {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    const printWin = window.open(blobUrl, '_blank', 'width=880,height=1120,menubar=0,toolbar=0,location=0,status=0');

    if (!printWin) {
      setupInDomPrintArea(htmlContent, 'a4');
      window.print();
      return;
    }

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 60000);
  } catch (err) {
    try {
      setupInDomPrintArea(htmlContent, 'a4');
      window.print();
    } catch (e) {
      if (showToast) {
        showToast('⚠️ No se pudo abrir la ventana de impresión.');
      }
    }
  }
}

function setupInDomPrintArea(htmlContent: string, paperFormat: 'a4' | 'letter' | '80mm' | '58mm' | '48mm' | '44mm' = 'a4'): void {
  const spec = getPaperFormatSpec(paperFormat);
  const styleId = 'direct-order-print-styles';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  styleEl.innerHTML = `
    @media screen {
      #direct-order-print-area {
        display: none !important;
        visibility: hidden !important;
        position: absolute !important;
        left: -99999px !important;
        top: -99999px !important;
        width: 0 !important;
        height: 0 !important;
        overflow: hidden !important;
      }
    }
    @media print {
      @page {
        size: ${spec.pageSize} !important;
        margin: 0mm !important;
      }
      body > *:not(#direct-order-print-area) {
        display: none !important;
        visibility: hidden !important;
      }
      body > #direct-order-print-area {
        display: block !important;
        visibility: visible !important;
        position: static !important;
        width: ${spec.widthCss} !important;
        max-width: ${spec.widthCss} !important;
        margin: 0 auto !important;
        padding: ${spec.padding} !important;
        background: #ffffff !important;
        overflow: visible !important;
      }
      #direct-order-print-area * {
        visibility: visible !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  `;

  const containerId = 'direct-order-print-area';
  let containerEl = document.getElementById(containerId);
  if (!containerEl) {
    containerEl = document.createElement('div');
    containerEl.id = containerId;
    document.body.appendChild(containerEl);
  }

  const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyInner = bodyMatch ? bodyMatch[1] : htmlContent;

  containerEl.innerHTML = bodyInner;

  const handleAfterPrint = () => {
    window.removeEventListener('afterprint', handleAfterPrint);
    cleanUpLegacyPrintArtifacts();
  };
  window.addEventListener('afterprint', handleAfterPrint);
  setTimeout(cleanUpLegacyPrintArtifacts, 3000);
}

/**
 * Invoca directamente el gestor de impresión nativo del navegador para Compras y Ventas.
 */
export async function directPrintOrder(params: DirectOrderPrintParams): Promise<void> {
  const { order, purchase, showToast, paperFormat = 'a4' } = params;
  const isSale = Boolean(order);
  const docNum = order ? (order.orderNumber || order.id) : purchase ? (purchase.purchaseNumber || purchase.id) : '';

  cleanUpLegacyPrintArtifacts();

  if (showToast) {
    const isConfirmedOrder = order && (order.status === 'confirmed' || order.status === 'shipped' || order.status === 'delivered');
    showToast(`🖨️ Abriendo gestor de impresión para ${isSale ? (isConfirmedOrder ? 'Factura Comercial' : 'Pre-Factura') : 'Orden de Compra'} #${docNum}...`);
  }

  try {
    const htmlContent = generateOrderPrintHtml(params);
    const printed = await printViaIsolatedIframe(htmlContent);
    if (!printed) {
      triggerPrintViaBlobWindow(htmlContent, showToast);
    }
  } catch (err) {
    console.error('Error al invocar impresión directa:', err);
    try {
      const htmlContent = generateOrderPrintHtml(params);
      setupInDomPrintArea(htmlContent, paperFormat);
      window.print();
    } catch (e) {
      console.error('Error final en fallback de impresión:', e);
    }
  }
}

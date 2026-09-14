import React, { useState, useEffect, useRef } from 'react';
import {
  Printer,
  X,
  User,
  Package,
  Phone,
  MapPin,
  Download,
  ExternalLink,
  Loader2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Building2,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { CustomerOrder, PurchaseOrder, StoreConfig } from '../types.ts';
import { getCustomerCi, getCleanAddress, isPickupDeliveryOrder } from '../utils/orderUtils.ts';
import { calculateLineItem, calculateInvoiceTotals, extractItemTaxPercent, extractBaseUnitPriceWithoutTax, EcuadorInvoiceTotalsResult, EcuadorTaxLineItemResult } from '../utils/ecuadorTaxCalculator.ts';

export interface OrderPrintA4ModalProps {
  order?: CustomerOrder | null;
  purchase?: PurchaseOrder | null;
  inventoryItems?: any[];
  storeConfig?: Partial<StoreConfig> | null;
  currency?: string;
  onClose: () => void;
  showToast?: (msg: string) => void;
}

export interface A4PrintItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export const OrderPrintA4Modal: React.FC<OrderPrintA4ModalProps> = ({
  order,
  purchase,
  inventoryItems = [],
  storeConfig,
  currency = 'USD',
  onClose,
  showToast,
}) => {
  const isSale = Boolean(order);
  const isPurchase = Boolean(purchase);
  const printableRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [scale, setScale] = useState<number>(1.0);
  const [paperFormat, setPaperFormat] = useState<'a4' | 'letter'>('a4');

  // Inyectar estilos unificados para que la vista previa en pantalla sea 100% idéntica a la impresión
  useEffect(() => {
    const styleId = 'order-a4-page-override-style';
    let styleTag = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }

    styleTag.innerHTML = `
      /* Contenedor del documento calibrado exactamente a 1 página tanto en pantalla como al imprimir */
      #order-a4-printable-document.page-wrapper {
        width: ${paperFormat === 'letter' ? '215mm' : '210mm'};
        max-width: calc(100vw - 24px);
        margin: 14px auto 28px auto;
        background: #ffffff;
        padding: 7mm 10mm 7mm 10mm;
        box-shadow: 0 4px 25px rgba(0, 0, 0, 0.25);
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        box-sizing: border-box;
        display: block;
        transform-origin: top center;
        transition: transform 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 9.5px;
        line-height: 1.3;
        color: #0f172a;
      }
      #order-a4-printable-document * {
        box-sizing: border-box;
      }

      /* Estructura del Encabezado */
      #order-a4-printable-document .header-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        margin-bottom: 6px;
        padding-bottom: 5px;
        border-bottom: 2px solid #0f172a;
      }
      #order-a4-printable-document .header-table td {
        vertical-align: top;
      }
      #order-a4-printable-document .store-name {
        font-size: 15px;
        font-weight: 900;
        color: #0f172a;
        text-transform: uppercase;
        letter-spacing: -0.3px;
        margin-bottom: 1px;
        line-height: 1.2;
      }
      #order-a4-printable-document .store-sub {
        font-size: 9px;
        color: #475569;
        line-height: 1.3;
      }
      #order-a4-printable-document .doc-badge {
        display: inline-block;
        padding: 2.5px 8px;
        background: #0f172a;
        color: #ffffff;
        font-weight: 900;
        font-size: 10px;
        letter-spacing: 0.4px;
        border-radius: 3px;
        text-transform: uppercase;
      }
      #order-a4-printable-document .doc-number {
        font-size: 14.5px;
        font-weight: 900;
        color: #0284c7;
        margin-top: 2px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }

      /* Cuadro de Información: Cliente / Proveedor */
      #order-a4-printable-document .meta-box {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        margin-bottom: 6px;
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
      }
      #order-a4-printable-document .meta-box td {
        padding: 4px 7px;
        vertical-align: top;
        border-right: 1px solid #e2e8f0;
        width: 50%;
      }
      #order-a4-printable-document .meta-box td:last-child {
        border-right: none;
      }
      #order-a4-printable-document .section-title {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        color: #475569;
        letter-spacing: 0.4px;
        margin-bottom: 2.5px;
        border-bottom: 1px solid #cbd5e1;
        padding-bottom: 1.5px;
      }
      #order-a4-printable-document .field-row {
        margin-bottom: 1.5px;
        font-size: 9.5px;
        line-height: 1.3;
        word-break: break-word;
      }
      #order-a4-printable-document .field-label {
        font-weight: 700;
        color: #475569;
        display: inline-block;
        min-width: 76px;
      }
      #order-a4-printable-document .field-val {
        color: #0f172a;
        font-weight: 500;
      }

      /* Tabla de Productos con proporciones idénticas a la impresión */
      #order-a4-printable-document .items-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        word-wrap: break-word;
        margin-top: 3px;
        margin-bottom: 6px;
        font-size: 9.5px;
      }
      #order-a4-printable-document .items-table th {
        background-color: #f1f5f9;
        color: #0f172a;
        font-weight: 800;
        text-transform: uppercase;
        font-size: 8.5px;
        letter-spacing: 0.3px;
        border-top: 1px solid #cbd5e1;
        border-bottom: 1.5px solid #94a3b8;
        padding: 4px 6px;
        text-align: left;
      }
      #order-a4-printable-document .items-table th.col-sku { width: 18%; }
      #order-a4-printable-document .items-table th.col-name { width: 44%; }
      #order-a4-printable-document .items-table th.col-qty { width: 12%; text-align: center; }
      #order-a4-printable-document .items-table th.col-unit { width: 13%; text-align: right; }
      #order-a4-printable-document .items-table th.col-total { width: 13%; text-align: right; }

      #order-a4-printable-document .items-table td {
        padding: 3.5px 6px;
        border-bottom: 1px solid #e2e8f0;
        color: #1e293b;
        vertical-align: middle;
        font-size: 9px;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #order-a4-printable-document .items-table tbody tr:nth-child(even) {
        background-color: #fafbfc;
      }
      #order-a4-printable-document .sku-code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-weight: 700;
        color: #0369a1;
        font-size: 9px;
        word-break: break-all;
      }
      #order-a4-printable-document .product-title {
        font-weight: 600;
        color: #0f172a;
        line-height: 1.25;
        word-break: break-word;
      }
      #order-a4-printable-document .qty-cell {
        text-align: center;
        font-weight: 800;
        font-size: 9.5px;
      }
      #order-a4-printable-document .price-cell {
        text-align: right;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-weight: 600;
      }
      #order-a4-printable-document .total-cell {
        text-align: right;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-weight: 800;
        color: #0f172a;
      }

      /* Resumen y Totales */
      #order-a4-printable-document .summary-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        margin-top: 3px;
      }
      #order-a4-printable-document .summary-table td {
        vertical-align: top;
      }
      #order-a4-printable-document .notes-box {
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        padding: 5px 8px;
        font-size: 8.5px;
        color: #334155;
        line-height: 1.35;
      }
      #order-a4-printable-document .totals-box {
        width: 100%;
        border-collapse: collapse;
        font-size: 9.5px;
      }
      #order-a4-printable-document .totals-box td {
        padding: 2px 4px;
      }
      #order-a4-printable-document .totals-label {
        text-align: right;
        color: #475569;
        font-weight: 700;
        width: 60%;
      }
      #order-a4-printable-document .totals-val {
        text-align: right;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-weight: 700;
        color: #0f172a;
        width: 40%;
      }
      #order-a4-printable-document .grand-total-row {
        border-top: 2px solid #0f172a;
        background-color: #f8fafc;
      }
      #order-a4-printable-document .grand-total-row td {
        padding: 4px 5px;
        font-size: 11px;
        font-weight: 900;
        color: #0f172a;
      }

      /* Firmas y Pie de Documento */
      #order-a4-printable-document .signatures-section {
        margin-top: 14px;
        page-break-inside: avoid;
      }
      #order-a4-printable-document .signatures-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      #order-a4-printable-document .signatures-table td {
        width: 50%;
        padding: 0 16px;
        text-align: center;
        vertical-align: bottom;
      }
      #order-a4-printable-document .signature-line {
        border-top: 1px solid #94a3b8;
        padding-top: 3px;
        font-size: 8.5px;
        font-weight: 700;
        color: #475569;
        text-transform: uppercase;
      }
      #order-a4-printable-document .footer-doc {
        margin-top: 6px;
        padding-top: 3px;
        border-top: 1px dashed #cbd5e1;
        text-align: center;
        font-size: 8px;
        color: #64748b;
      }

      /* Reglas de Impresión del Navegador: Estrictamente Formato Vertical (Retrato) */
      @media print {
        @page {
          size: ${paperFormat === 'letter' ? 'letter' : 'a4'} portrait;
          margin: 0mm;
        }
        @page :first {
          size: ${paperFormat === 'letter' ? 'letter' : 'a4'} portrait;
          margin: 0mm;
        }
        html, body {
          width: ${paperFormat === 'letter' ? '215.9mm' : '210mm'} !important;
          max-width: ${paperFormat === 'letter' ? '215.9mm' : '210mm'} !important;
          min-height: ${paperFormat === 'letter' ? '279.4mm' : '297mm'} !important;
          margin: 0 auto !important;
          padding: 0 !important;
          background: #ffffff !important;
          color: #0f172a !important;
          font-size: 9px !important;
          line-height: 1.25 !important;
          overflow: visible !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body * {
          visibility: hidden !important;
        }
        #order-a4-printable-document,
        #order-a4-printable-document * {
          visibility: visible !important;
        }
        #order-a4-printable-document {
          position: absolute !important;
          left: 0 !important;
          right: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: ${paperFormat === 'letter' ? '215.9mm' : '210mm'} !important;
          min-height: auto !important;
          height: auto !important;
          margin: 0 auto !important;
          padding: 6mm 9mm 6mm 9mm !important;
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
          background: #ffffff !important;
          z-index: 99999999 !important;
          box-sizing: border-box !important;
          display: block !important;
          transform: ${scale === 1.0 ? 'none' : `scale(${scale})`} !important;
          transform-origin: top center !important;
        }
        .no-print,
        #order-a4-modal-header,
        #order-a4-modal-overlay,
        #order-a4-notice-banner {
          display: none !important;
        }
        table {
          page-break-inside: auto;
        }
        tr {
          page-break-inside: avoid !important;
          page-break-after: auto;
        }
        thead {
          display: table-header-group;
        }
        .signatures-section, .footer-doc {
          page-break-inside: avoid !important;
        }
      }
    `;

    return () => {
      const el = document.getElementById(styleId);
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    };
  }, [scale, paperFormat]);

  if (!isSale && !isPurchase) {
    return null;
  }

  // Currency symbol
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

  const items: A4PrintItem[] = rawItems.map((it: any, index: number) => {
    const qty = Number(it.quantity) || 1;
    let unit = 0;
    let sku = '';
    let name = '';

    const subItem = it.item && typeof it.item === 'object' ? it.item : {};

    let netUnit = 0;
    if (isSale) {
      unit = Number(it.salePrice ?? subItem.salePrice ?? it.unitPrice ?? it.price ?? subItem.price ?? 0);
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
  let documentSubtitle = '';
  let orderDateStr = '';
  let orderStatusBadge = '';
  let notesStr = '';

  if (isSale && order) {
    documentTitle = 'PEDIDO DE VENTA';
    documentSubtitle = 'Orden de Venta y Despacho a Cliente';
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
    notesStr = order.notes || '';
  } else if (isPurchase && purchase) {
    documentTitle = 'ORDEN DE COMPRA';
    documentSubtitle = 'Adquisición y Reabastecimiento a Proveedor';
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
    notesStr = purchase.notes || '';
  }

  // SRI Fiscal Breakdown calculation for Sales and Orders (100% identical to OrdersTableView "Vista Factura")
  let salesCalculatedItems: EcuadorTaxLineItemResult[] = [];
  let invoiceTotals: EcuadorInvoiceTotalsResult | null = null;
  if (isSale && order) {
    const orderApplyTax = (order as any).applySaleTax !== false;
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
        ? 'EXCLUDING_TAX'
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
      const unitCost = Number(item.costPrice || 0);
      const discount = Number(item.discount || 0);
      const lineSubtotal = Math.max(0, unitCost * qty - discount);
      totalDiscount += discount;

      const taxPercent =
        item.taxPercent !== undefined
          ? Number(item.taxPercent)
          : (item as any).purchaseTaxPercent !== undefined
          ? Number((item as any).purchaseTaxPercent)
          : (item as any).hasPurchaseTax === false
          ? 0
          : 15;

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

  // Exact detailed item structures matching horizontal invoice table views
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
  const purchaseTotalReceived = purchaseFormattedItems.reduce((sum, it) => sum + it.received, 0);
  const purchaseTotalPending = purchaseFormattedItems.reduce((sum, it) => sum + it.pending, 0);

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
  const linkedSaleOrder = purchase?.linkedCustomerOrderNumber
    ? `#${purchase.linkedCustomerOrderNumber}`
    : purchase?.linkedCustomerOrderId
    ? `#${purchase.linkedCustomerOrderId}`
    : null;

  // Generate self-contained HTML for isolated A4 printing or opening in new tab
  const generateA4Html = (includeAutoPrint = false, currentScale = scale, currentPaper = paperFormat) => {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${documentTitle} #${orderNumberStr} - Comerxia ERP</title>
  <style id="base-print-style">
    /* Configuración de página estándar calibrada: Formato Vertical (Retrato) Obligatorio */
    @page {
      size: ${currentPaper === 'letter' ? 'letter' : 'a4'} portrait;
      margin: 0mm;
    }
    @page :first {
      size: ${currentPaper === 'letter' ? 'letter' : 'a4'} portrait;
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
      background: #f1f5f9;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 9.5px;
      line-height: 1.3;
    }

    /* Barra de herramientas superior (visible únicamente en pantalla) */
    .print-toolbar {
      position: sticky;
      top: 0;
      background: #0f172a;
      color: #ffffff;
      padding: 8px 16px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      z-index: 1000;
    }
    .print-toolbar-title {
      font-size: 12.5px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .print-toolbar-badge {
      background: #0284c7;
      color: #ffffff;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .print-toolbar-controls {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .control-group {
      display: inline-flex;
      align-items: center;
      background: #1e293b;
      border-radius: 6px;
      padding: 2px;
      border: 1px solid #334155;
    }
    .control-label {
      font-size: 10px;
      color: #94a3b8;
      font-weight: 700;
      padding: 0 6px;
    }
    .btn-ctrl {
      background: transparent;
      color: #cbd5e1;
      border: none;
      padding: 4px 8px;
      font-size: 10px;
      font-weight: 700;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-ctrl:hover {
      background: #334155;
      color: #ffffff;
    }
    .btn-ctrl.active {
      background: #0284c7;
      color: #ffffff;
    }
    .btn-action {
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: opacity 0.2s;
    }
    .btn-action:hover {
      opacity: 0.9;
    }
    .btn-print-primary {
      background: #0284c7;
      color: #ffffff;
      box-shadow: 0 1px 4px rgba(2, 132, 199, 0.4);
    }
    .btn-close-dark {
      background: #334155;
      color: #ffffff;
    }
    .toolbar-tip {
      width: 100%;
      background: #0369a1;
      color: #e0f2fe;
      font-size: 10px;
      padding: 3px 12px;
      text-align: center;
      border-top: 1px solid #0284c7;
    }

    /* Contenedor del documento A4 calibrado para 1 página */
    .page-wrapper {
      width: 210mm;
      max-width: calc(100vw - 24px);
      margin: 14px auto 28px auto;
      background: #ffffff;
      padding: 7mm 10mm 7mm 10mm;
      box-shadow: 0 4px 20px rgba(0,0,0,0.12);
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      box-sizing: border-box;
      display: block;
      transform-origin: top center;
      transition: transform 0.2s ease;
    }

    /* Reglas estrictas de impresión */
    @media print {
      @page {
        size: ${currentPaper === 'letter' ? 'letter' : 'a4'} portrait;
        margin: 0mm;
      }
      @page :first {
        size: ${currentPaper === 'letter' ? 'letter' : 'a4'} portrait;
        margin: 0mm;
      }
      html, body {
        width: ${currentPaper === 'letter' ? '215.9mm' : '210mm'} !important;
        max-width: ${currentPaper === 'letter' ? '215.9mm' : '210mm'} !important;
        height: auto !important;
        margin: 0 auto !important;
        padding: 0 !important;
        background: #ffffff !important;
        font-size: 9px !important;
        line-height: 1.25 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print, .print-toolbar, .toolbar-tip {
        display: none !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .page-wrapper {
        width: 100% !important;
        max-width: ${currentPaper === 'letter' ? '215.9mm' : '210mm'} !important;
        min-height: auto !important;
        height: auto !important;
        margin: 0 auto !important;
        padding: 6mm 9mm 6mm 9mm !important;
        border: none !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        box-sizing: border-box !important;
        display: block !important;
        transform: none !important;
      }
      table {
        page-break-inside: auto;
      }
      tr {
        page-break-inside: avoid !important;
        page-break-after: auto;
      }
      thead {
        display: table-header-group;
      }
      .signatures-section, .footer-doc {
        page-break-inside: avoid !important;
      }
    }

    /* Estructura del Encabezado */
    .header-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-bottom: 6px;
      padding-bottom: 5px;
      border-bottom: 2px solid #0f172a;
    }
    .header-table td {
      vertical-align: top;
    }
    .store-name {
      font-size: 15px;
      font-weight: 900;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: -0.3px;
      margin-bottom: 1px;
      line-height: 1.2;
    }
    .store-sub {
      font-size: 9px;
      color: #475569;
      line-height: 1.3;
    }
    .doc-badge {
      display: inline-block;
      padding: 2.5px 8px;
      background: #0f172a;
      color: #ffffff;
      font-weight: 900;
      font-size: 10px;
      letter-spacing: 0.4px;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .doc-number {
      font-size: 14.5px;
      font-weight: 900;
      color: #0284c7;
      margin-top: 2px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    /* Cuadro de Información: Cliente / Proveedor */
    .meta-box {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-bottom: 6px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
    }
    .meta-box td {
      padding: 4px 7px;
      vertical-align: top;
      border-right: 1px solid #e2e8f0;
      width: 50%;
    }
    .meta-box td:last-child {
      border-right: none;
    }
    .section-title {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      color: #475569;
      letter-spacing: 0.4px;
      margin-bottom: 2.5px;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 1.5px;
    }
    .field-row {
      margin-bottom: 1.5px;
      font-size: 9.5px;
      line-height: 1.3;
      word-break: break-word;
    }
    .field-label {
      font-weight: 700;
      color: #475569;
      display: inline-block;
      min-width: 76px;
    }
    .field-val {
      color: #0f172a;
      font-weight: 500;
    }

    /* Tabla de Productos con ancho fijo exacto */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      word-wrap: break-word;
      margin-top: 3px;
      margin-bottom: 6px;
      font-size: 9.5px;
    }
    .items-table th {
      background-color: #f1f5f9;
      color: #0f172a;
      font-weight: 800;
      text-transform: uppercase;
      font-size: 8.5px;
      letter-spacing: 0.3px;
      border-top: 1px solid #cbd5e1;
      border-bottom: 1.5px solid #94a3b8;
      padding: 4px 6px;
      text-align: left;
    }
    .items-table th.col-sku { width: 18%; }
    .items-table th.col-name { width: 44%; }
    .items-table th.col-qty { width: 12%; text-align: center; }
    .items-table th.col-unit { width: 13%; text-align: right; }
    .items-table th.col-total { width: 13%; text-align: right; }

    .items-table td {
      padding: 3.5px 6px;
      border-bottom: 1px solid #e2e8f0;
      color: #1e293b;
      vertical-align: middle;
      font-size: 9px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .items-table tbody tr:nth-child(even) {
      background-color: #fafbfc;
    }
    .sku-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 700;
      color: #0369a1;
      font-size: 9px;
      word-break: break-all;
    }
    .product-title {
      font-weight: 600;
      color: #0f172a;
      line-height: 1.25;
      word-break: break-word;
    }
    .qty-cell {
      text-align: center;
      font-weight: 800;
      font-size: 9.5px;
    }
    .price-cell {
      text-align: right;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 600;
    }
    .total-cell {
      text-align: right;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 800;
      color: #0f172a;
    }

    /* Resumen y Totales */
    .summary-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-top: 3px;
    }
    .summary-table td {
      vertical-align: top;
    }
    .notes-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 9px;
      color: #334155;
      line-height: 1.3;
      margin-right: 10px;
      word-break: break-word;
    }
    .totals-box {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .totals-box td {
      padding: 2px 4px;
      font-size: 9.5px;
    }
    .totals-label {
      text-align: right;
      font-weight: 700;
      color: #475569;
      width: 60%;
    }
    .totals-val {
      text-align: right;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 700;
      color: #0f172a;
      width: 40%;
    }
    .grand-total-row {
      border-top: 1.5px solid #0f172a;
      border-bottom: 1.5px solid #0f172a;
      background-color: #f8fafc;
    }
    .grand-total-row td {
      padding: 4px 5px;
      font-size: 11px;
      font-weight: 900;
      color: #0f172a;
    }

    /* Firmas y Pie de Documento */
    .signatures-section {
      margin-top: 14px;
      page-break-inside: avoid;
    }
    .signatures-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .signatures-table td {
      width: 50%;
      padding: 0 16px;
      text-align: center;
      vertical-align: bottom;
    }
    .signature-line {
      border-top: 1px solid #94a3b8;
      padding-top: 3px;
      font-size: 8.5px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
    }
    .footer-doc {
      margin-top: 6px;
      padding-top: 3px;
      border-top: 1px dashed #cbd5e1;
      text-align: center;
      font-size: 8px;
      color: #64748b;
    }
  </style>

  <script>
    function changeScale(factor, btnId) {
      var wrapper = document.getElementById('a4-doc-wrapper');
      if (wrapper) {
        if (factor === 1.0) {
          wrapper.style.transform = 'none';
        } else {
          wrapper.style.transform = 'scale(' + factor + ')';
        }
      }
      var buttons = document.querySelectorAll('.btn-scale');
      buttons.forEach(function(b) { b.classList.remove('active'); });
      var target = document.getElementById(btnId);
      if (target) target.classList.add('active');
    }

    function changePaper(fmt, btnId) {
      var dynamicStyle = document.getElementById('dynamic-paper-rule');
      if (!dynamicStyle) {
        dynamicStyle = document.createElement('style');
        dynamicStyle.id = 'dynamic-paper-rule';
        document.head.appendChild(dynamicStyle);
      }
      if (fmt === 'letter') {
        dynamicStyle.innerHTML = '@page { size: letter portrait; margin: 0mm; } html, body, .page-wrapper { max-width: 215.9mm !important; }';
      } else {
        dynamicStyle.innerHTML = '@page { size: a4 portrait; margin: 0mm; } html, body, .page-wrapper { max-width: 210mm !important; }';
      }
      var buttons = document.querySelectorAll('.btn-paper');
      buttons.forEach(function(b) { b.classList.remove('active'); });
      var target = document.getElementById(btnId);
      if (target) target.classList.add('active');
    }
  </script>

  ${
    includeAutoPrint
      ? `<script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        try {
          window.focus();
          window.print();
        } catch(e) {
          console.warn('Auto print error:', e);
        }
      }, 400);
    });
  </script>`
      : ''
  }
</head>
<body>
  ${
    includeAutoPrint
      ? `
    <div class="no-print print-toolbar">
      <div class="print-toolbar-title">
        <span style="font-size: 14px;">📄</span>
        <span>${storeName}</span>
        <span class="print-toolbar-badge">${documentTitle} #${orderNumberStr}</span>
      </div>

      <div class="print-toolbar-controls">
        <div class="control-group">
          <span class="control-label">Orientación:</span>
          <span class="btn-ctrl active" style="cursor: default; background: #0284c7; color: #ffffff;">↕ Vertical</span>
        </div>

        <div class="control-group">
          <span class="control-label">Ajuste:</span>
          <button type="button" id="btn-scale-100" class="btn-ctrl btn-scale ${currentScale === 1.0 ? 'active' : ''}" onclick="changeScale(1.0, 'btn-scale-100')">100%</button>
          <button type="button" id="btn-scale-95" class="btn-ctrl btn-scale ${currentScale === 0.95 ? 'active' : ''}" onclick="changeScale(0.95, 'btn-scale-95')">95%</button>
          <button type="button" id="btn-scale-90" class="btn-ctrl btn-scale ${currentScale === 0.90 ? 'active' : ''}" onclick="changeScale(0.90, 'btn-scale-90')">90% (1 Hoja)</button>
        </div>

        <div class="control-group">
          <span class="control-label">Papel:</span>
          <button type="button" id="btn-paper-a4" class="btn-ctrl btn-paper ${currentPaper === 'a4' ? 'active' : ''}" onclick="changePaper('a4', 'btn-paper-a4')">A4</button>
          <button type="button" id="btn-paper-letter" class="btn-ctrl btn-paper ${currentPaper === 'letter' ? 'active' : ''}" onclick="changePaper('letter', 'btn-paper-letter')">Carta</button>
        </div>

        <button type="button" onclick="window.print()" class="btn-action btn-print-primary">🖨️ Imprimir / Guardar PDF</button>
        <button type="button" onclick="window.close()" class="btn-action btn-close-dark">✕ Cerrar</button>
      </div>
    </div>
    <div class="no-print toolbar-tip">
      💡 Orientación: <strong>Vertical (Retrato)</strong> • Papel: <strong>${currentPaper === 'letter' ? 'Carta' : 'A4'}</strong> • Márgenes: <strong>Ninguno o Predeterminado</strong> • Escala: <strong>100%</strong>.
    </div>
  `
      : ''
  }

  <div id="a4-doc-wrapper" class="page-wrapper" style="${currentScale !== 1.0 ? `transform: scale(${currentScale}); transform-origin: top center;` : ''} ${currentPaper === 'letter' ? 'max-width: 215.9mm !important;' : ''}">
    <!-- Header Empresa y Documento -->
    <table class="header-table">
      <tr>
        <td style="width: 60%;">
          ${storeLogo ? `<img src="${storeLogo}" alt="${storeName}" crossOrigin="anonymous" referrerPolicy="no-referrer" style="max-height: 40px; max-width: 160px; object-fit: contain; margin-bottom: 4px;" /><br>` : ''}
          <div class="store-name">${storeName}</div>
          ${storeDescription ? `<div class="store-sub">${storeDescription}</div>` : ''}
          ${storeAddress ? `<div class="store-sub"><strong>Dirección:</strong> ${storeAddress}</div>` : ''}
          ${storePhone ? `<div class="store-sub"><strong>Teléfono / WhatsApp:</strong> ${storePhone}</div>` : ''}
        </td>
        <td style="width: 40%; text-align: right;">
          <div class="doc-badge">${documentTitle}</div>
          <div class="doc-number">#${orderNumberStr}</div>
          <div style="font-size: 9px; color: #475569; margin-top: 2px;">
            <strong>Fecha de Emisión:</strong><br>${orderDateStr}
          </div>
          <div style="margin-top: 3px;">
            <span style="font-size: 8.5px; font-weight: 800; background: #e2e8f0; color: #1e293b; padding: 2px 6px; border-radius: 3px; display: inline-block;">
              ESTADO: ${orderStatusBadge}
            </span>
          </div>
        </td>
      </tr>
    </table>

    <!-- Bloque de Información: Cliente o Proveedor -->
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
            ${linkedSaleOrder ? `<div class="field-row"><span class="field-label">Venta Vinculada:</span> <span class="field-val">Pedido ${linkedSaleOrder}</span></div>` : ''}
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
            ${order?.trackingCarrier ? `<div class="field-row"><span class="field-label">Courier:</span> <span class="field-val">${order.trackingCarrier}</span></div>` : ''}
            ${order?.trackingNumber ? `<div class="field-row"><span class="field-label">N° Guía:</span> <span class="field-val">${order.trackingNumber}</span></div>` : ''}
          `
              : `
            <div class="field-row"><span class="field-label">Tipo Compra:</span> <span class="field-val">${linkedSaleOrder ? 'Abastecimiento de Venta (Bajo Pedido)' : 'Reposición de Inventario'}</span></div>
            <div class="field-row"><span class="field-label">Recepción:</span> <span class="field-val">${purchase?.status === 'received' ? 'Recibido en Bodega Central' : 'Pendiente de Entrega'}</span></div>
            <div class="field-row"><span class="field-label">Total Ítems:</span> <span class="field-val">${items.length} productos (${totalUnits} unidades)</span></div>
          `
          }
        </td>
      </tr>
    </table>

    <!-- TABLA PRINCIPAL DE PRODUCTOS TIPO FACTURA HASTA EL DETALLE COMPLETO DE LA VISTA HORIZONTAL -->
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
      <tfoot style="background: #f8fafc; font-weight: bold; border-top: 1.5px solid #cbd5e1; font-size: 8.5px;">
        ${
          isSale
            ? `
          <tr>
            <td colspan="3" style="padding: 4px 6px; color: #334155;">
              Desglose de Venta: <strong>${salesCalculatedItems.length} ítems</strong> (${invoiceTotals?.totalUnits || 0} unidades en total)
            </td>
            <td style="padding: 4px 6px; text-align: center;">${invoiceTotals?.totalUnits || 0} u.</td>
            <td colspan="3" style="padding: 4px 6px; text-align: right; text-transform: uppercase;">Total Venta:</td>
            <td style="padding: 4px 6px; text-align: right; font-weight: 900; color: #0f172a; font-family: ui-monospace, monospace;">${currencySymbol}${invoiceTotals?.totalInvoiceAmount.toFixed(2) || '0.00'}</td>
          </tr>
        `
            : `
          <tr>
            <td colspan="3" style="padding: 4px 6px; color: #334155;">
              Desglose de Factura: <strong>${purchaseFormattedItems.length} ítems</strong> (${purchaseTotalOrdered} un. pedidas)
            </td>
            <td style="padding: 4px 6px; text-align: center;">${purchaseTotalOrdered} u.</td>
            <td style="padding: 4px 6px; text-align: center; color: #15803d;">${purchaseTotalReceived} u.</td>
            <td style="padding: 4px 6px; text-align: center; color: #b45309;">${purchaseTotalPending} u.</td>
            <td colspan="3" style="padding: 4px 6px; text-align: right; text-transform: uppercase;">Total Compra:</td>
            <td style="padding: 4px 6px; text-align: right; font-weight: 900; color: #0f172a; font-family: ui-monospace, monospace;">${currencySymbol}${purchaseSriBreakdown?.grandTotal.toFixed(2) || '0.00'}</td>
          </tr>
        `
        }
      </tfoot>
    </table>

    <!-- TOTALES DEL PEDIDO / COMPRA -->
    <table class="summary-table">
      <tr>
        <td style="width: 52%;">
          ${
            notesStr
              ? `
            <div class="notes-box">
              <strong>Observaciones / Notas del Pedido:</strong><br>
              ${notesStr}
            </div>
          `
              : `
            <div style="font-size: 9px; color: #64748b; font-style: italic;">
              * Este comprobante en formato A4 certifica la orden de ${isSale ? 'venta' : 'compra'} especificada en el sistema ERP.
            </div>
          `
          }
        </td>
        <td style="width: 48%;">
          <table class="totals-box">
            ${
              isSale && invoiceTotals
                ? `
              <tr>
                <td class="totals-label">Total Unidades:</td>
                <td class="totals-val">${invoiceTotals.totalUnits} un.</td>
              </tr>
              <tr>
                <td class="totals-label">Subtotal 0%:</td>
                <td class="totals-val">${currencySymbol}${invoiceTotals.subtotalZero0.toFixed(2)}</td>
              </tr>
              <tr>
                <td class="totals-label">Subtotal 15%:</td>
                <td class="totals-val">${currencySymbol}${invoiceTotals.subtotalTaxable15.toFixed(2)}</td>
              </tr>
              ${
                invoiceTotals.subtotalTaxable5 > 0
                  ? `
                <tr>
                  <td class="totals-label">Subtotal 5%:</td>
                  <td class="totals-val">${currencySymbol}${invoiceTotals.subtotalTaxable5.toFixed(2)}</td>
                </tr>
              `
                  : ''
              }
              <tr style="border-top: 1px solid #cbd5e1;">
                <td class="totals-label" style="font-weight: 800; color: #0f172a;">Subtotal Sin Impuesto:</td>
                <td class="totals-val" style="font-weight: 800;">${currencySymbol}${invoiceTotals.subtotalNoTax.toFixed(2)}</td>
              </tr>
              ${
                invoiceTotals.totalDiscount > 0
                  ? `
                <tr>
                  <td class="totals-label" style="color: #9a3412;">Total Descuento:</td>
                  <td class="totals-val" style="color: #9a3412;">-${currencySymbol}${invoiceTotals.totalDiscount.toFixed(2)}</td>
                </tr>
              `
                  : ''
              }
              <tr>
                <td class="totals-label">IVA 15%:</td>
                <td class="totals-val">${currencySymbol}${invoiceTotals.taxAmount15.toFixed(2)}</td>
              </tr>
              ${
                invoiceTotals.taxAmount5 > 0 || invoiceTotals.subtotalTaxable5 > 0
                  ? `
                <tr>
                  <td class="totals-label">IVA 5%:</td>
                  <td class="totals-val">${currencySymbol}${invoiceTotals.taxAmount5.toFixed(2)}</td>
                </tr>
              `
                  : ''
              }
              ${
                invoiceTotals.shippingFee > 0
                  ? `
                <tr>
                  <td class="totals-label">Valor Envío / Flete:</td>
                  <td class="totals-val">+${currencySymbol}${invoiceTotals.shippingFee.toFixed(2)}</td>
                </tr>
              `
                  : ''
              }
              <tr class="grand-total-row">
                <td class="totals-label" style="font-size: 10.5px; color: #0f172a; font-weight: 900;">
                  ${order?.status === 'confirmed' || order?.status === 'shipped' || order?.status === 'delivered' ? 'TOTAL FACTURA SRI:' : 'TOTAL VENTA SRI:'}
                </td>
                <td class="totals-val" style="font-size: 12px; color: #0284c7; font-weight: 900;">
                  ${currencySymbol}${invoiceTotals.totalInvoiceAmount.toFixed(2)}
                </td>
              </tr>
            `
                : isPurchase && purchaseSriBreakdown
                ? `
              <tr>
                <td class="totals-label">Unidades Pedidas:</td>
                <td class="totals-val">${purchaseTotalOrdered} un.</td>
              </tr>
              <tr>
                <td class="totals-label">Unidades en Bodega:</td>
                <td class="totals-val" style="color: #15803d;">${purchaseTotalReceived} un.</td>
              </tr>
              ${
                purchaseTotalPending > 0
                  ? `
                <tr>
                  <td class="totals-label">Unidades Pendientes:</td>
                  <td class="totals-val" style="color: #b45309;">${purchaseTotalPending} un.</td>
                </tr>
              `
                  : ''
              }
              <tr>
                <td class="totals-label">Subtotal 0%:</td>
                <td class="totals-val">${currencySymbol}${purchaseSriBreakdown.subtotal0.toFixed(2)}</td>
              </tr>
              <tr>
                <td class="totals-label">Subtotal 15%:</td>
                <td class="totals-val">${currencySymbol}${purchaseSriBreakdown.subtotal15.toFixed(2)}</td>
              </tr>
              ${
                purchaseSriBreakdown.subtotal5 > 0
                  ? `
                <tr>
                  <td class="totals-label">Subtotal 5%:</td>
                  <td class="totals-val">${currencySymbol}${purchaseSriBreakdown.subtotal5.toFixed(2)}</td>
                </tr>
              `
                  : ''
              }
              <tr style="border-top: 1px solid #cbd5e1;">
                <td class="totals-label" style="font-weight: 800; color: #0f172a;">Subtotal Sin Impuesto:</td>
                <td class="totals-val" style="font-weight: 800;">${currencySymbol}${purchaseSriBreakdown.subtotalSinImpuesto.toFixed(2)}</td>
              </tr>
              ${
                purchaseSriBreakdown.totalDiscount > 0
                  ? `
                <tr>
                  <td class="totals-label" style="color: #9a3412;">Total Descuento:</td>
                  <td class="totals-val" style="color: #9a3412;">-${currencySymbol}${purchaseSriBreakdown.totalDiscount.toFixed(2)}</td>
                </tr>
              `
                  : ''
              }
              <tr>
                <td class="totals-label">IVA COMPRA (15%):</td>
                <td class="totals-val">${currencySymbol}${purchaseSriBreakdown.iva15.toFixed(2)}</td>
              </tr>
              ${
                purchaseSriBreakdown.iva5 > 0
                  ? `
                <tr>
                  <td class="totals-label">IVA COMPRA (5%):</td>
                  <td class="totals-val">${currencySymbol}${purchaseSriBreakdown.iva5.toFixed(2)}</td>
                </tr>
              `
                  : ''
              }
              <tr class="grand-total-row">
                <td class="totals-label" style="font-size: 10.5px; color: #0f172a; font-weight: 900;">TOTAL COMPRA SRI:</td>
                <td class="totals-val" style="font-size: 12px; color: #0284c7; font-weight: 900;">${currencySymbol}${purchaseSriBreakdown.grandTotal.toFixed(2)}</td>
              </tr>
            `
                : `
              <tr>
                <td class="totals-label">Subtotal:</td>
                <td class="totals-val">${currencySymbol}${subtotal.toFixed(2)}</td>
              </tr>
              <tr class="grand-total-row">
                <td class="totals-label" style="font-size: 11px; color: #0f172a;">TOTAL DEL PEDIDO:</td>
                <td class="totals-val" style="font-size: 12.5px; color: #0284c7;">${currencySymbol}${finalTotal.toFixed(2)}</td>
              </tr>
            `
            }
          </table>
        </td>
      </tr>
    </table>

    <!-- FIRMAS DE RESPONSABILIDAD -->
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

      <!-- Pie de página con timestamp -->
      <div class="footer-doc">
        Documento A4 generado el ${new Date().toLocaleString('es-EC')} • Comerxia ERP • Formato Oficial de Pedido
      </div>
    </div>
  </div>
</body>
</html>`;
  };

  // Método 1: Impresión Directa en Formato Vertical (Retrato) aislado en iframe
  const handlePrint = () => {
    setIsPrinting(true);
    showToast?.(`Iniciando impresión vertical del documento #${orderNumberStr}...`);

    try {
      const htmlContent = generateA4Html(false, scale, paperFormat);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '0';
      iframe.style.width = paperFormat === 'letter' ? '215.9mm' : '210mm';
      iframe.style.height = paperFormat === 'letter' ? '279.4mm' : '297mm';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(htmlContent);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.warn('Iframe print error, falling back to window.print():', e);
            window.print();
          }
          setTimeout(() => {
            if (iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }
            setIsPrinting(false);
          }, 3500);
        }, 350);
      } else {
        window.print();
        setTimeout(() => {
          setIsPrinting(false);
        }, 800);
      }
    } catch (err) {
      console.warn('Error al invocar impresión vertical por iframe, abriendo en nueva pestaña:', err);
      setIsPrinting(false);
      handleOpenInNewTab();
    }
  };

  // Método 2: Abrir en pestaña independiente con dimensiones verticales (Retrato)
  const handleOpenInNewTab = () => {
    try {
      showToast?.('Abriendo formato vertical en pestaña nueva para imprimir...');
      const htmlContent = generateA4Html(true, scale, paperFormat);
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const newWin = window.open(blobUrl, '_blank', 'width=860,height=1120,toolbar=0,menubar=0,location=0');

      if (!newWin) {
        // Si el navegador bloqueó la ventana emergente, creamos un enlace temporal directo
        const link = document.createElement('a');
        link.href = blobUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          if (link.parentNode) link.parentNode.removeChild(link);
        }, 1000);
      }
    } catch (e) {
      console.error('Error opening in new tab:', e);
      window.print();
    }
  };

  // Método 3: Descargar PDF en alta definición usando un documento aislado libre de oklch + jsPDF
  const handleDownloadPdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    showToast?.('Generando archivo PDF oficial en formato vertical...');

    let iframe: HTMLIFrameElement | null = null;

    try {
      const isLetter = paperFormat === 'letter';
      const frameWidth = isLetter ? 816 : 794;
      const frameHeight = isLetter ? 1056 : 1123;

      // Creamos un iframe aislado con dimensiones exactas verticales (794px x 1123px = 210mm x 297mm @ 96 DPI)
      // Esto previene que Tailwind CSS v4 inyecte funciones de color "oklch" incompatibles con html2canvas
      // y garantiza una maquetación vertical perfecta sin importar la resolución o tamaño de la pantalla del usuario.
      iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-99999px';
      iframe.style.top = '0';
      iframe.style.width = `${frameWidth}px`;
      iframe.style.height = `${frameHeight}px`;
      iframe.style.border = 'none';
      iframe.style.margin = '0';
      iframe.style.padding = '0';
      iframe.style.backgroundColor = '#ffffff';
      iframe.style.zIndex = '-9999';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        throw new Error('No se pudo inicializar el entorno aislado de renderizado para PDF.');
      }

      // Inyectamos el HTML estándar con estilos en código hexadecimal puro (#0f172a, #ffffff, etc.)
      const htmlContent = generateA4Html(false, scale, paperFormat);
      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      // Esperamos que carguen imágenes (como el logo de la empresa) y fuentes
      if (iframeDoc.images.length > 0) {
        const imagePromises = Array.from(iframeDoc.images).map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(resolve, 1500); // Límite de seguridad
          });
        });
        await Promise.all(imagePromises);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      // Elemento objetivo a capturar dentro del documento aislado
      const targetElement =
        (iframeDoc.querySelector('.page-wrapper') as HTMLElement) || iframeDoc.body;

      const canvas = await html2canvas(targetElement, {
        scale: 2, // 2x para nitidez cristalina en textos, números y bordes
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: frameWidth,
        windowHeight: frameHeight,
        onclone: (clonedDoc) => {
          // Reemplazo preventivo ante cualquier posible declaración con oklch
          const styleTags = clonedDoc.querySelectorAll('style');
          styleTags.forEach((styleTag) => {
            if (styleTag.textContent && styleTag.textContent.includes('oklch')) {
              styleTag.textContent = styleTag.textContent.replace(/oklch\([^)]+\)/g, '#1e293b');
            }
          });
        },
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.96);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: isLetter ? 'letter' : 'a4',
        compress: true,
      });

      const pageWidth = isLetter ? 215.9 : 210;
      const pageHeight = isLetter ? 279.4 : 297;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pageHeight;

      while (heightLeft > 0.5) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pageHeight;
      }

      const safeDocName = `${isSale ? 'Pedido_Venta' : 'Orden_Compra'}_${orderNumberStr || 'Vertical'}.pdf`.replace(/\s+/g, '_');
      pdf.save(safeDocName);
      showToast?.(`¡PDF descargado exitosamente en formato vertical: ${safeDocName}!`);
    } catch (err) {
      console.error('Error al generar PDF vertical:', err);
      showToast?.('Ocurrió un inconveniente al generar el PDF. Abriendo documento en nueva pestaña...');
      handleOpenInNewTab();
    } finally {
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div id="order-a4-modal-overlay" className="fixed inset-0 z-[9999] flex flex-col bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
      {/* Barra de Acciones Superior Sticky */}
      <header id="order-a4-modal-header" className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800 text-white px-4 py-3 shadow-md flex items-center justify-between gap-3">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 border border-sky-500/30">
            <Printer className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white truncate flex items-center gap-2">
              <span>{isSale ? 'Imprimir Venta' : 'Imprimir Orden de Compra'}</span>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-sky-950 text-sky-300 border border-sky-800">
                #{orderNumberStr}
              </span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                ↕ Formato Vertical
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 truncate">
              Orientación Vertical (Retrato) • Calibrado en 1 página vertical • SKU, descripción, cantidades y totales
            </p>
          </div>
        </div>

        {/* Controles de Escala y Papel + Botones de Acción */}
        <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-y-1">
          {/* Indicador de Orientación Vertical Calibrada */}
          <div className="hidden xl:inline-flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 text-[11px]">
            <span className="text-slate-400 font-bold px-2">Orientación:</span>
            <span className="px-2 py-1 rounded font-bold bg-sky-600 text-white shadow-xs">
              ↕ Vertical (Retrato)
            </span>
          </div>

          {/* Selector de Escala / Ajuste */}
          <div className="hidden sm:inline-flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 text-[11px]">
            <span className="text-slate-400 font-bold px-2">Ajuste:</span>
            <button
              type="button"
              onClick={() => setScale(1.0)}
              className={`px-2 py-1 rounded font-bold transition cursor-pointer ${
                scale === 1.0 ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'
              }`}
            >
              100%
            </button>
            <button
              type="button"
              onClick={() => setScale(0.95)}
              className={`px-2 py-1 rounded font-bold transition cursor-pointer ${
                scale === 0.95 ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'
              }`}
            >
              95%
            </button>
            <button
              type="button"
              onClick={() => setScale(0.90)}
              className={`px-2 py-1 rounded font-bold transition cursor-pointer ${
                scale === 0.90 ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'
              }`}
              title="Ajuste optimizado para garantizar 1 sola página"
            >
              90% (1 Hoja)
            </button>
          </div>

          {/* Selector de Papel */}
          <div className="hidden md:inline-flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 text-[11px]">
            <span className="text-slate-400 font-bold px-2">Papel:</span>
            <button
              type="button"
              onClick={() => setPaperFormat('a4')}
              className={`px-2 py-1 rounded font-bold transition cursor-pointer ${
                paperFormat === 'a4' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'
              }`}
            >
              A4
            </button>
            <button
              type="button"
              onClick={() => setPaperFormat('letter')}
              className={`px-2 py-1 rounded font-bold transition cursor-pointer ${
                paperFormat === 'letter' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'
              }`}
            >
              Carta
            </button>
          </div>

          {/* 1. Botón Imprimir */}
          <button
            type="button"
            onClick={handlePrint}
            disabled={isPrinting}
            className="px-3 sm:px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-95 text-white text-xs font-black shadow-lg shadow-sky-950/50 transition flex items-center space-x-1.5 cursor-pointer border border-sky-400/40"
            title="Imprimir directamente en tu impresora"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>

          {/* 2. Botón Descargar PDF */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="px-3 sm:px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-black shadow-lg shadow-emerald-950/50 transition flex items-center space-x-1.5 cursor-pointer border border-emerald-400/40"
            title="Descargar archivo PDF oficial en tu equipo"
          >
            {isGeneratingPdf ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="hidden sm:inline">Generando PDF...</span>
                <span className="sm:hidden">PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Descargar PDF</span>
              </>
            )}
          </button>

          {/* 3. Botón Abrir en Pestaña Independiente */}
          <button
            type="button"
            onClick={handleOpenInNewTab}
            className="px-2.5 sm:px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer border border-slate-700"
            title="Abrir formato A4 en una nueva pestaña del navegador para imprimir sin restricciones"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="hidden lg:inline">Abrir en Pestaña</span>
          </button>

          {/* Botón Cerrar */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            title="Cerrar vista de impresión"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Banner de ayuda rápida */}
      <div id="order-a4-notice-banner" className="no-print bg-sky-950/70 border-b border-sky-800/60 px-4 py-2 text-[11px] text-sky-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-sky-400 shrink-0" />
          <span>
            <strong>Impresión Vertical Oficial:</strong> El documento está configurado y forzado en orientación vertical (retrato) estándar para que coincida exactamente con la hoja de tu impresora o archivo PDF.
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-slate-300">
          <span className="text-[10px] text-slate-400">💡 Tip: Usa <strong>90% (1 Hoja)</strong> si tienes muchos productos</span>
          <span className="px-2 py-0.5 rounded bg-sky-900/60 font-mono text-[10px] text-sky-300">Ctrl + P</span>
        </div>
      </div>

      {/* Contenedor de Vista Previa con Proporciones Idénticas a la Impresión */}
      <div className="flex-1 p-2 sm:p-6 flex justify-center items-start overflow-x-auto bg-slate-900/50">
        <div
          id="order-a4-printable-document"
          ref={printableRef}
          className="page-wrapper"
          style={{
            transform: scale === 1.0 ? 'none' : `scale(${scale})`,
            maxWidth: paperFormat === 'letter' ? '215mm' : '210mm',
          }}
        >
          {/* Header Empresa y Documento */}
          <table className="header-table">
            <tbody>
              <tr>
                <td style={{ width: '60%', verticalAlign: 'top' }}>
                  {storeLogo ? (
                    <img
                      src={storeLogo}
                      alt={storeName}
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      style={{ maxHeight: '40px', maxWidth: '160px', objectFit: 'contain', marginBottom: '4px' }}
                    />
                  ) : null}
                  <div className="store-name">{storeName}</div>
                  {storeDescription && <div className="store-sub">{storeDescription}</div>}
                  {storeAddress && (
                    <div className="store-sub">
                      <strong>Dirección:</strong> {storeAddress}
                    </div>
                  )}
                  {storePhone && (
                    <div className="store-sub">
                      <strong>Teléfono / WhatsApp:</strong> {storePhone}
                    </div>
                  )}
                </td>
                <td style={{ width: '40%', textAlign: 'right', verticalAlign: 'top' }}>
                  <div className="doc-badge">{documentTitle}</div>
                  <div className="doc-number">#{orderNumberStr}</div>
                  <div style={{ fontSize: '9px', color: '#475569', marginTop: '2px' }}>
                    <strong>Fecha de Emisión:</strong>
                    <br />
                    {orderDateStr}
                  </div>
                  <div style={{ marginTop: '3px' }}>
                    <span
                      style={{
                        fontSize: '8.5px',
                        fontWeight: 800,
                        background: '#e2e8f0',
                        color: '#1e293b',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        display: 'inline-block',
                      }}
                    >
                      ESTADO: {orderStatusBadge}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Bloque de Información: Cliente / Proveedor */}
          <table className="meta-box">
            <tbody>
              <tr>
                <td>
                  <div className="section-title">
                    {isSale ? 'Datos del Cliente' : 'Datos del Proveedor'}
                  </div>
                  {isSale ? (
                    <>
                      <div className="field-row">
                        <span className="field-label">Cliente:</span>{' '}
                        <span className="field-val">
                          <strong>{customerName || 'Cliente General'}</strong>
                        </span>
                      </div>
                      <div className="field-row">
                        <span className="field-label">Cédula / RUC:</span>{' '}
                        <span className="field-val">{customerCi || 'Consumidor Final'}</span>
                      </div>
                      <div className="field-row">
                        <span className="field-label">Teléfono:</span>{' '}
                        <span className="field-val">{customerPhone || '—'}</span>
                      </div>
                      {customerEmail ? (
                        <div className="field-row">
                          <span className="field-label">Correo:</span>{' '}
                          <span className="field-val">{customerEmail}</span>
                        </div>
                      ) : null}
                      <div className="field-row">
                        <span className="field-label">Dirección:</span>{' '}
                        <span className="field-val">
                          {customerAddress || (isPickup ? 'Retiro en Local Comercial' : '—')}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="field-row">
                        <span className="field-label">Proveedor:</span>{' '}
                        <span className="field-val">
                          <strong>{supplierName || 'Proveedor Registrado'}</strong>
                        </span>
                      </div>
                      <div className="field-row">
                        <span className="field-label">Contacto:</span>{' '}
                        <span className="field-val">{supplierContact || '—'}</span>
                      </div>
                      <div className="field-row">
                        <span className="field-label">Estado Pago:</span>{' '}
                        <span className="field-val">{paymentStatus}</span>
                      </div>
                      {linkedSaleOrder && (
                        <div className="field-row">
                          <span className="field-label">Venta Vinculada:</span>{' '}
                          <span className="field-val">Pedido {linkedSaleOrder}</span>
                        </div>
                      )}
                    </>
                  )}
                </td>
                <td>
                  <div className="section-title">
                    {isSale ? 'Detalles de Despacho y Pago' : 'Condiciones de la Orden'}
                  </div>
                  {isSale ? (
                    <>
                      <div className="field-row">
                        <span className="field-label">Modalidad:</span>{' '}
                        <span className="field-val">
                          <strong>{isPickup ? 'Retiro en Local' : 'Envío a Domicilio'}</strong>
                        </span>
                      </div>
                      <div className="field-row">
                        <span className="field-label">Forma de Pago:</span>{' '}
                        <span className="field-val">{paymentMethod || 'Acuerdo Comercial'}</span>
                      </div>
                      {order?.trackingCarrier && (
                        <div className="field-row">
                          <span className="field-label">Courier:</span>{' '}
                          <span className="field-val">{order.trackingCarrier}</span>
                        </div>
                      )}
                      {order?.trackingNumber && (
                        <div className="field-row">
                          <span className="field-label">N° Guía:</span>{' '}
                          <span className="field-val">{order.trackingNumber}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="field-row">
                        <span className="field-label">Tipo Compra:</span>{' '}
                        <span className="field-val">
                          {linkedSaleOrder
                            ? 'Abastecimiento de Venta (Bajo Pedido)'
                            : 'Reposición de Inventario'}
                        </span>
                      </div>
                      <div className="field-row">
                        <span className="field-label">Recepción:</span>{' '}
                        <span className="field-val">
                          {purchase?.status === 'received'
                            ? 'Recibido en Bodega Central'
                            : 'Pendiente de Entrega'}
                        </span>
                      </div>
                      <div className="field-row">
                        <span className="field-label">Total Ítems:</span>{' '}
                        <span className="field-val">
                          {items.length} productos ({totalUnits} unidades)
                        </span>
                      </div>
                    </>
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          {/* TABLA PRINCIPAL DE PRODUCTOS TIPO FACTURA HASTA EL DETALLE COMPLETO DE LA VISTA HORIZONTAL */}
          <table className="items-table">
            <thead>
              {isSale ? (
                <tr>
                  <th style={{ width: '4%', textAlign: 'center' }}>#</th>
                  <th style={{ width: '36%' }}>Producto / Descripción</th>
                  <th style={{ width: '14%' }}>SKU / Código</th>
                  <th style={{ width: '8%', textAlign: 'center' }}>Cantidad</th>
                  <th style={{ width: '11%', textAlign: 'right' }}>Valor Unit. ($)</th>
                  <th style={{ width: '9%', textAlign: 'right' }}>Desc. ($)</th>
                  <th style={{ width: '7%', textAlign: 'center' }}>IVA (%)</th>
                  <th style={{ width: '11%', textAlign: 'right' }}>Subtotal ($)</th>
                </tr>
              ) : (
                <tr>
                  <th style={{ width: '4%', textAlign: 'center' }}>#</th>
                  <th style={{ width: '32%' }}>Producto / Descripción</th>
                  <th style={{ width: '15%' }}>SKU / Código</th>
                  <th style={{ width: '7%', textAlign: 'center' }}>Pedida</th>
                  <th style={{ width: '7%', textAlign: 'center' }}>Bodega</th>
                  <th style={{ width: '7%', textAlign: 'center' }}>Pendiente</th>
                  <th style={{ width: '10%', textAlign: 'right' }}>Costo Unit. ($)</th>
                  <th style={{ width: '7%', textAlign: 'right' }}>Desc. ($)</th>
                  <th style={{ width: '5%', textAlign: 'center' }}>IVA</th>
                  <th style={{ width: '11%', textAlign: 'right' }}>Total ($)</th>
                </tr>
              )}
            </thead>
            <tbody>
              {isSale
                ? (salesCalculatedItems || []).map((it, idx) => (
                    <tr key={idx}>
                      <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#64748b' }}>#{idx + 1}</td>
                      <td className="product-title">{it.name}</td>
                      <td className="sku-code">{it.sku || '-'}</td>
                      <td className="qty-cell">{it.quantity} u.</td>
                      <td className="price-cell">{currencySymbol}{it.unitPriceWithoutTax.toFixed(2)}</td>
                      <td className="price-cell" style={{ color: it.unitDiscount > 0 ? '#b45309' : '#64748b' }}>
                        {currencySymbol}{(it.unitDiscount * it.quantity).toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            fontSize: '9px',
                            fontWeight: 800,
                            backgroundColor: it.lineTaxPercent > 0 ? '#e0e7ff' : '#f1f5f9',
                            color: it.lineTaxPercent > 0 ? '#3730a3' : '#475569',
                            border: it.lineTaxPercent > 0 ? '1px solid #c7d2fe' : '1px solid #e2e8f0',
                          }}
                        >
                          {it.lineTaxPercent}%
                        </span>
                      </td>
                      <td className="total-cell">{currencySymbol}{it.lineSubtotal.toFixed(2)}</td>
                    </tr>
                  ))
                : (purchaseFormattedItems || []).map((it, idx) => (
                    <tr key={idx}>
                      <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#64748b' }}>{it.index}</td>
                      <td className="product-title">{it.name}</td>
                      <td className="sku-code">{it.sku}</td>
                      <td className="qty-cell">{it.ordered} u.</td>
                      <td className="qty-cell" style={{ color: '#15803d' }}>{it.received} u.</td>
                      <td className="qty-cell" style={{ color: '#b45309' }}>{it.pending} u.</td>
                      <td className="price-cell">{currencySymbol}{it.unitCost.toFixed(2)}</td>
                      <td className="price-cell" style={{ color: it.discount > 0 ? '#b45309' : '#64748b' }}>
                        {currencySymbol}{it.discount.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{it.taxPercent}%</td>
                      <td className="total-cell">{currencySymbol}{it.lineSubtotal.toFixed(2)}</td>
                    </tr>
                  ))}
            </tbody>
            <tfoot style={{ background: '#f8fafc', fontWeight: 'bold', borderTop: '1.5px solid #cbd5e1', fontSize: '8.5px' }}>
              {isSale ? (
                <tr>
                  <td colSpan={3} style={{ padding: '4px 6px', color: '#334155' }}>
                    Desglose de Venta: <strong>{salesCalculatedItems.length} ítems</strong> ({invoiceTotals?.totalUnits || 0} unidades en total)
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>{invoiceTotals?.totalUnits || 0} u.</td>
                  <td colSpan={3} style={{ padding: '4px 6px', textAlign: 'right', textTransform: 'uppercase' }}>Total Venta:</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 900, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>
                    {currencySymbol}{invoiceTotals?.totalInvoiceAmount.toFixed(2) || '0.00'}
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={3} style={{ padding: '4px 6px', color: '#334155' }}>
                    Desglose de Factura: <strong>{purchaseFormattedItems.length} ítems</strong> ({purchaseTotalOrdered} un. pedidas)
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>{purchaseTotalOrdered} u.</td>
                  <td style={{ padding: '4px 6px', textAlign: 'center', color: '#15803d' }}>{purchaseTotalReceived} u.</td>
                  <td style={{ padding: '4px 6px', textAlign: 'center', color: '#b45309' }}>{purchaseTotalPending} u.</td>
                  <td colSpan={3} style={{ padding: '4px 6px', textAlign: 'right', textTransform: 'uppercase' }}>Total Compra:</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 900, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>
                    {currencySymbol}{purchaseSriBreakdown?.grandTotal.toFixed(2) || '0.00'}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>

          {/* TOTALES DEL PEDIDO / COMPRA */}
          <table className="summary-table">
            <tbody>
              <tr>
                <td style={{ width: '52%', verticalAlign: 'top' }}>
                  {notesStr ? (
                    <div className="notes-box">
                      <strong>Observaciones / Notas del Pedido:</strong>
                      <br />
                      {notesStr}
                    </div>
                  ) : (
                    <div style={{ fontSize: '9px', color: '#64748b', fontStyle: 'italic' }}>
                      * Este comprobante en formato A4 certifica la orden de{' '}
                      {isSale ? 'venta' : 'compra'} especificada en el sistema ERP.
                    </div>
                  )}
                </td>
                <td style={{ width: '48%', verticalAlign: 'top' }}>
                  <table className="totals-box">
                    <tbody>
                      {isSale && invoiceTotals ? (
                        <>
                          <tr>
                            <td className="totals-label">Total Unidades:</td>
                            <td className="totals-val">{invoiceTotals.totalUnits} un.</td>
                          </tr>
                          <tr>
                            <td className="totals-label">Subtotal 0%:</td>
                            <td className="totals-val">
                              {currencySymbol}
                              {invoiceTotals.subtotalZero0.toFixed(2)}
                            </td>
                          </tr>
                          <tr>
                            <td className="totals-label">Subtotal 15%:</td>
                            <td className="totals-val">
                              {currencySymbol}
                              {invoiceTotals.subtotalTaxable15.toFixed(2)}
                            </td>
                          </tr>
                          {invoiceTotals.subtotalTaxable5 > 0 && (
                            <tr>
                              <td className="totals-label">Subtotal 5%:</td>
                              <td className="totals-val">
                                {currencySymbol}
                                {invoiceTotals.subtotalTaxable5.toFixed(2)}
                              </td>
                            </tr>
                          )}
                          <tr style={{ borderTop: '1px solid #cbd5e1' }}>
                            <td className="totals-label" style={{ fontWeight: 800, color: '#0f172a' }}>
                              Subtotal Sin Impuestos:
                            </td>
                            <td className="totals-val" style={{ fontWeight: 800 }}>
                              {currencySymbol}
                              {invoiceTotals.subtotalNoTax.toFixed(2)}
                            </td>
                          </tr>
                          {invoiceTotals.totalDiscount > 0 && (
                            <tr>
                              <td className="totals-label" style={{ color: '#9a3412' }}>
                                Total Descuento:
                              </td>
                              <td className="totals-val" style={{ color: '#9a3412' }}>
                                -{currencySymbol}
                                {invoiceTotals.totalDiscount.toFixed(2)}
                              </td>
                            </tr>
                          )}
                          <tr>
                            <td className="totals-label">IVA 15%:</td>
                            <td className="totals-val">
                              {currencySymbol}
                              {invoiceTotals.taxAmount15.toFixed(2)}
                            </td>
                          </tr>
                          {(invoiceTotals.taxAmount5 > 0 || invoiceTotals.subtotalTaxable5 > 0) && (
                            <tr>
                              <td className="totals-label">IVA 5%:</td>
                              <td className="totals-val">
                                {currencySymbol}
                                {invoiceTotals.taxAmount5.toFixed(2)}
                              </td>
                            </tr>
                          )}
                          {invoiceTotals.shippingFee > 0 && (
                            <tr>
                              <td className="totals-label">Valor Envío / Flete:</td>
                              <td className="totals-val">
                                +{currencySymbol}
                                {invoiceTotals.shippingFee.toFixed(2)}
                              </td>
                            </tr>
                          )}
                          <tr className="grand-total-row">
                            <td className="totals-label" style={{ fontSize: '10.5px', color: '#0f172a', fontWeight: 900 }}>
                              {order?.status === 'confirmed' || order?.status === 'shipped' || order?.status === 'delivered'
                                ? 'TOTAL FACTURA SRI:'
                                : 'TOTAL VENTA SRI:'}
                            </td>
                            <td className="totals-val" style={{ fontSize: '12px', color: '#0284c7', fontWeight: 900 }}>
                              {currencySymbol}
                              {invoiceTotals.totalInvoiceAmount.toFixed(2)}
                            </td>
                          </tr>
                        </>
                      ) : isPurchase && purchaseSriBreakdown ? (
                        <>
                          <tr>
                            <td className="totals-label">Subtotal 0%:</td>
                            <td className="totals-val">
                              {currencySymbol}
                              {purchaseSriBreakdown.subtotal0.toFixed(2)}
                            </td>
                          </tr>
                          <tr>
                            <td className="totals-label">Subtotal 15%:</td>
                            <td className="totals-val">
                              {currencySymbol}
                              {purchaseSriBreakdown.subtotal15.toFixed(2)}
                            </td>
                          </tr>
                          {purchaseSriBreakdown.subtotal5 > 0 && (
                            <tr>
                              <td className="totals-label">Subtotal 5%:</td>
                              <td className="totals-val">
                                {currencySymbol}
                                {purchaseSriBreakdown.subtotal5.toFixed(2)}
                              </td>
                            </tr>
                          )}
                          <tr style={{ borderTop: '1px solid #cbd5e1' }}>
                            <td className="totals-label" style={{ fontWeight: 800, color: '#0f172a' }}>
                              Subtotal Sin Impuesto:
                            </td>
                            <td className="totals-val" style={{ fontWeight: 800 }}>
                              {currencySymbol}
                              {purchaseSriBreakdown.subtotalSinImpuesto.toFixed(2)}
                            </td>
                          </tr>
                          {purchaseSriBreakdown.totalDiscount > 0 && (
                            <tr>
                              <td className="totals-label" style={{ color: '#9a3412' }}>
                                Total Descuento:
                              </td>
                              <td className="totals-val" style={{ color: '#9a3412' }}>
                                -{currencySymbol}
                                {purchaseSriBreakdown.totalDiscount.toFixed(2)}
                              </td>
                            </tr>
                          )}
                          <tr>
                            <td className="totals-label">IVA COMPRA (15%):</td>
                            <td className="totals-val">
                              {currencySymbol}
                              {purchaseSriBreakdown.iva15.toFixed(2)}
                            </td>
                          </tr>
                          {purchaseSriBreakdown.iva5 > 0 && (
                            <tr>
                              <td className="totals-label">IVA COMPRA (5%):</td>
                              <td className="totals-val">
                                {currencySymbol}
                                {purchaseSriBreakdown.iva5.toFixed(2)}
                              </td>
                            </tr>
                          )}
                          <tr className="grand-total-row">
                            <td className="totals-label" style={{ fontSize: '10.5px', color: '#0f172a', fontWeight: 900 }}>
                              TOTAL COMPRA SRI:
                            </td>
                            <td className="totals-val" style={{ fontSize: '12px', color: '#0284c7', fontWeight: 900 }}>
                              {currencySymbol}
                              {purchaseSriBreakdown.grandTotal.toFixed(2)}
                            </td>
                          </tr>
                        </>
                      ) : (
                        <>
                          <tr>
                            <td className="totals-label">Subtotal:</td>
                            <td className="totals-val">
                              {currencySymbol}
                              {subtotal.toFixed(2)}
                            </td>
                          </tr>
                          {isSale && shippingCost > 0 && (
                            <tr>
                              <td className="totals-label">Costo de Envío:</td>
                              <td className="totals-val">
                                {currencySymbol}
                                {shippingCost.toFixed(2)}
                              </td>
                            </tr>
                          )}
                          <tr className="grand-total-row">
                            <td className="totals-label" style={{ fontSize: '11px', color: '#0f172a' }}>
                              TOTAL DEL PEDIDO:
                            </td>
                            <td className="totals-val" style={{ fontSize: '12.5px', color: '#0284c7' }}>
                              {currencySymbol}
                              {finalTotal.toFixed(2)}
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

          {/* FIRMAS DE RESPONSABILIDAD */}
          <div className="signatures-section">
            <table className="signatures-table">
              <tbody>
                <tr>
                  <td>
                    <div className="signature-line">
                      Emitido / Autorizado por
                      <br />
                      <span style={{ fontWeight: 'normal', fontSize: '8.5px', color: '#64748b' }}>
                        {storeName}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="signature-line">
                      Recibido Conforme
                      <br />
                      <span style={{ fontWeight: 'normal', fontSize: '8.5px', color: '#64748b' }}>
                        {isSale
                          ? customerName || 'Firma de Cliente'
                          : supplierName || 'Firma de Proveedor'}
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Pie de página con timestamp */}
            <div className="footer-doc">
              Documento A4 generado el {new Date().toLocaleString('es-EC')} • Comerxia ERP • Formato Oficial de Pedido
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


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

export type PaperFormat = 'a4' | 'letter' | '80mm' | '58mm' | '48mm' | '44mm';

export interface PaperFormatSpec {
  id: PaperFormat;
  label: string;
  widthCss: string;
  isThermal: boolean;
  padding: string;
  baseFontSize: string;
  titleFontSize: string;
  numFontSize: string;
  pageSize: string;
}

export const getPaperFormatSpec = (fmt: PaperFormat): PaperFormatSpec => {
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
  const [paperFormat, setPaperFormat] = useState<PaperFormat>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('comerxia_prefactura_paper_format');
        if (saved && ['a4', 'letter', '80mm', '58mm', '48mm', '44mm'].includes(saved)) {
          return saved as PaperFormat;
        }
      } catch {}
    }
    return 'a4';
  });

  const spec = getPaperFormatSpec(paperFormat);

  const handleSetPaperFormat = (fmt: PaperFormat) => {
    setPaperFormat(fmt);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('comerxia_prefactura_paper_format', fmt);
      } catch {}
    }
  };

  // Inyectar estilos unificados para la vista previa y la impresión nativa
  useEffect(() => {
    const styleId = 'order-a4-page-override-style';
    let styleTag = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }

    styleTag.innerHTML = `
      #order-a4-printable-document.page-wrapper {
        width: ${spec.widthCss};
        max-width: ${spec.isThermal ? spec.widthCss : 'calc(100vw - 24px)'};
        margin: 14px auto 28px auto;
        background: #ffffff;
        padding: ${spec.padding};
        box-shadow: 0 4px 25px rgba(0, 0, 0, 0.25);
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        box-sizing: border-box;
        display: block;
        transform-origin: top center;
        transition: transform 0.2s ease, width 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: ${spec.baseFontSize};
        line-height: 1.3;
        color: #0f172a;
      }
      #order-a4-printable-document * {
        box-sizing: border-box;
      }

      /* Estilos generales para hoja A4 / Carta */
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
      #order-a4-printable-document .items-table td {
        padding: 3.5px 6px;
        border-bottom: 1px solid #e2e8f0;
        color: #1e293b;
        vertical-align: middle;
        font-size: 9px;
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

      #order-a4-printable-document .summary-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        margin-top: 3px;
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

      /* Reglas de Impresión */
      @media print {
        @page {
          size: ${spec.pageSize};
          margin: 0mm;
        }
        @page :first {
          size: ${spec.pageSize};
          margin: 0mm;
        }
        html, body {
          width: ${spec.widthCss} !important;
          max-width: ${spec.widthCss} !important;
          min-height: ${spec.isThermal ? 'auto' : '279mm'} !important;
          margin: 0 auto !important;
          padding: 0 !important;
          background: #ffffff !important;
          color: #0f172a !important;
          font-size: ${spec.baseFontSize} !important;
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
          width: ${spec.widthCss} !important;
          max-width: ${spec.widthCss} !important;
          min-height: auto !important;
          height: auto !important;
          margin: 0 auto !important;
          padding: ${spec.padding} !important;
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
      }
    `;

    return () => {
      const el = document.getElementById(styleId);
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    };
  }, [scale, paperFormat, spec]);

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

  if (isSale && order) {
    documentTitle = 'PREFACTURA';
    documentSubtitle = 'Pre-Factura con Desglose Fiscal Ecuador (SRI)';
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
  }

  // SRI Fiscal Breakdown calculation for Sales and Orders
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

    const isCardOrder = Boolean(
      (order as any).isCardPayment ||
      (order.paymentMethod && (order.paymentMethod.toLowerCase().includes('tarjeta') || order.paymentMethod.toLowerCase().includes('payphone') || order.paymentMethod.toLowerCase().includes('card'))) ||
      ((order as any).cardCommissionPercent && Number((order as any).cardCommissionPercent) > 0)
    );
    const cardCommissionPct = Number((order as any).cardCommissionPercent || 5.75);

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
        isCardPayment: isCardOrder,
        cardCommissionPercent: isCardOrder ? cardCommissionPct : 0,
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
  const linkedSaleOrder = purchase?.linkedCustomerOrderNumber
    ? `#${purchase.linkedCustomerOrderNumber}`
    : purchase?.linkedCustomerOrderId
    ? `#${purchase.linkedCustomerOrderId}`
    : null;

  // Generador de HTML independiente para iframe de impresión o nueva pestaña
  const generateA4Html = (includeAutoPrint = false, currentScale = scale, currentPaper = paperFormat) => {
    const currentSpec = getPaperFormatSpec(currentPaper);
    const isThermal = currentSpec.isThermal;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${documentTitle} #${orderNumberStr} - Comerxia ERP</title>
  <style>
    @page {
      size: ${currentSpec.pageSize};
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
      font-size: ${currentSpec.baseFontSize};
      line-height: 1.3;
      width: ${currentSpec.widthCss};
    }
    .page-wrapper {
      width: ${currentSpec.widthCss};
      max-width: ${currentSpec.widthCss};
      margin: 0 auto;
      background: #ffffff;
      padding: ${currentSpec.padding};
      box-sizing: border-box;
    }

    /* Estilos Formato Hoja (A4 / Carta) */
    .header-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 6px; border-bottom: 2px solid #0f172a; }
    .header-table td { vertical-align: top; }
    .store-name { font-size: 15px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin-bottom: 1px; }
    .store-sub { font-size: 9px; color: #475569; }
    .doc-badge { display: inline-block; padding: 2.5px 8px; background: #0f172a; color: #ffffff; font-weight: 900; font-size: 10px; border-radius: 3px; text-transform: uppercase; }
    .doc-number { font-size: 14.5px; font-weight: 900; color: #0284c7; margin-top: 2px; font-family: monospace; }
    .meta-box { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 6px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; }
    .meta-box td { padding: 4px 7px; vertical-align: top; border-right: 1px solid #e2e8f0; width: 50%; }
    .meta-box td:last-child { border-right: none; }
    .section-title { font-size: 9px; font-weight: 800; text-transform: uppercase; color: #475569; margin-bottom: 2.5px; border-bottom: 1px solid #cbd5e1; }
    .field-row { margin-bottom: 1.5px; font-size: 9.5px; word-break: break-word; }
    .field-label { font-weight: 700; color: #475569; display: inline-block; min-width: 76px; }
    .field-val { color: #0f172a; font-weight: 500; }
    .items-table { width: 100%; border-collapse: collapse; table-layout: fixed; word-wrap: break-word; margin-top: 3px; margin-bottom: 6px; font-size: 9.5px; }
    .items-table th { background-color: #f1f5f9; color: #0f172a; font-weight: 800; text-transform: uppercase; font-size: 8.5px; border-top: 1px solid #cbd5e1; border-bottom: 1.5px solid #94a3b8; padding: 4px 6px; text-align: left; }
    .items-table td { padding: 3.5px 6px; border-bottom: 1px solid #e2e8f0; color: #1e293b; vertical-align: middle; font-size: 9px; }
    .sku-code { font-family: monospace; font-weight: 700; color: #0369a1; font-size: 9px; word-break: break-all; }
    .product-title { font-weight: 600; color: #0f172a; word-break: break-word; }
    .qty-cell { text-align: center; font-weight: 800; font-size: 9.5px; }
    .price-cell { text-align: right; font-family: monospace; font-weight: 600; }
    .total-cell { text-align: right; font-family: monospace; font-weight: 800; color: #0f172a; }
    .summary-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 3px; }
    .totals-box { width: 100%; border-collapse: collapse; font-size: 9.5px; }
    .totals-box td { padding: 2px 4px; }
    .totals-label { text-align: right; color: #475569; font-weight: 700; width: 60%; }
    .totals-val { text-align: right; font-family: monospace; font-weight: 700; color: #0f172a; width: 40%; }
    .grand-total-row { border-top: 2px solid #0f172a; background-color: #f8fafc; }
    .grand-total-row td { padding: 4px 5px; font-size: 11px; font-weight: 900; color: #0f172a; }
    .signatures-section { margin-top: 14px; page-break-inside: avoid; }
    .signatures-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .signatures-table td { width: 50%; padding: 0 16px; text-align: center; vertical-align: bottom; }
    .signature-line { border-top: 1px solid #94a3b8; padding-top: 3px; font-size: 8.5px; font-weight: 700; color: #475569; text-transform: uppercase; }
    .footer-doc { margin-top: 6px; padding-top: 3px; border-top: 1px dashed #cbd5e1; text-align: center; font-size: 8px; color: #64748b; }

    /* Estilos Formato Térmico POS */
    .thermal-divider { border-bottom: 1px dashed #94a3b8; margin: 4px 0; }
    .thermal-header { text-align: center; margin-bottom: 4px; }
    .thermal-title { font-weight: 900; text-transform: uppercase; font-size: ${currentSpec.titleFontSize}; color: #0f172a; }
    .thermal-item-title { font-weight: 700; color: #0f172a; word-break: break-word; }
    .thermal-item-sub { display: flex; justify-content: space-between; font-size: 0.9em; color: #475569; margin-top: 1px; }

    @media print {
      .no-print { display: none !important; }
      .page-wrapper { width: 100% !important; max-width: 100% !important; padding: ${currentSpec.padding} !important; border: none !important; box-shadow: none !important; }
    }
  </style>
  ${
    includeAutoPrint
      ? `<script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        try { window.focus(); window.print(); } catch(e) {}
      }, 350);
    });
  </script>`
      : ''
  }
</head>
<body>
  <div class="page-wrapper">
    ${
      isThermal
        ? `
      <!-- TICKET TÉRMICO COMPACTO Y ADAPTADO -->
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

      <!-- PRODUCTOS EN 2 LÍNEAS PARA ROLLO TÉRMICO -->
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

      <!-- TOTALES TÉRMICOS STACKED -->
      <div style="font-size: 0.95em;">
        ${
          isSale && invoiceTotals
            ? `
          <div style="display: flex; justify-content: space-between;"><span>Subtotal 0%:</span><span style="font-family: monospace;">${currencySymbol}${invoiceTotals.subtotalZero0.toFixed(2)}</span></div>
          <div style="display: flex; justify-content: space-between;"><span>Subtotal 15%:</span><span style="font-family: monospace;">${currencySymbol}${invoiceTotals.subtotalTaxable15.toFixed(2)}</span></div>
          ${invoiceTotals.totalDiscount > 0 ? `<div style="display: flex; justify-content: space-between; color: #9a3412;"><span>Desc. Total:</span><span style="font-family: monospace;">-${currencySymbol}${invoiceTotals.totalDiscount.toFixed(2)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between;"><span>IVA 15%:</span><span style="font-family: monospace;">${currencySymbol}${invoiceTotals.taxAmount15.toFixed(2)}</span></div>
          ${invoiceTotals.shippingFee > 0 ? `<div style="display: flex; justify-content: space-between;"><span>Envío:</span><span style="font-family: monospace;">+${currencySymbol}${invoiceTotals.shippingFee.toFixed(2)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; font-weight: 900; border-top: 2px solid #0f172a; margin-top: 3px; padding-top: 2px; font-size: ${currentSpec.numFontSize};">
            <span>TOTAL:</span>
            <span style="font-family: monospace;">${currencySymbol}${invoiceTotals.totalInvoiceAmount.toFixed(2)}</span>
          </div>
        `
            : isPurchase && purchaseSriBreakdown
            ? `
          <div style="display: flex; justify-content: space-between;"><span>Subtotal Sin Imp:</span><span style="font-family: monospace;">${currencySymbol}${purchaseSriBreakdown.subtotalSinImpuesto.toFixed(2)}</span></div>
          <div style="display: flex; justify-content: space-between;"><span>IVA 15%:</span><span style="font-family: monospace;">${currencySymbol}${purchaseSriBreakdown.iva15.toFixed(2)}</span></div>
          <div style="display: flex; justify-content: space-between; font-weight: 900; border-top: 2px solid #0f172a; margin-top: 3px; padding-top: 2px; font-size: ${currentSpec.numFontSize};">
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
      <!-- COMPROBANTE OFICIAL HOJA A4 / CARTA -->
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
              * Este comprobante certifica la ${isSale ? 'prefactura' : 'orden de compra'} especificada en el sistema ERP.
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
                <tr style="border-top: 1px solid #cbd5e1;"><td class="totals-label" style="font-weight: 800; color: #0f172a;">Subtotal Sin Impuesto:</td><td class="totals-val" style="font-weight: 800;">${currencySymbol}${invoiceTotals.subtotalNoTax.toFixed(2)}</td></tr>
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
          Documento A4 generado el ${new Date().toLocaleString('es-EC')} • Comerxia ERP
        </div>
      </div>
    `
    }
  </div>
</body>
</html>`;
  };

  // Método 1: Impresión Directa en iframe aislado
  const handlePrint = () => {
    setIsPrinting(true);
    showToast?.(`Iniciando impresión del documento #${orderNumberStr} en formato ${spec.label}...`);

    try {
      const htmlContent = generateA4Html(false, scale, paperFormat);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '0';
      iframe.style.width = spec.widthCss;
      iframe.style.height = '1000px';
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
            window.print();
          }
          setTimeout(() => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            setIsPrinting(false);
          }, 3500);
        }, 350);
      } else {
        window.print();
        setTimeout(() => setIsPrinting(false), 800);
      }
    } catch (err) {
      setIsPrinting(false);
      handleOpenInNewTab();
    }
  };

  // Método 2: Abrir en pestaña independiente
  const handleOpenInNewTab = () => {
    try {
      showToast?.(`Abriendo documento en formato ${spec.label} en nueva pestaña...`);
      const htmlContent = generateA4Html(true, scale, paperFormat);
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const newWin = window.open(blobUrl, '_blank', 'width=860,height=1120,toolbar=0,menubar=0,location=0');

      if (!newWin) {
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
      window.print();
    }
  };

  // Método 3: Descargar PDF adaptado (Termico o Hoja)
  const handleDownloadPdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    showToast?.(`Generando archivo PDF en formato ${spec.label}...`);

    let iframe: HTMLIFrameElement | null = null;

    try {
      let frameWidth = 794;
      let mmWidth = 210;

      if (paperFormat === 'letter') {
        frameWidth = 816;
        mmWidth = 215.9;
      } else if (paperFormat === '80mm') {
        frameWidth = 302;
        mmWidth = 80;
      } else if (paperFormat === '58mm') {
        frameWidth = 219;
        mmWidth = 58;
      } else if (paperFormat === '48mm') {
        frameWidth = 181;
        mmWidth = 48;
      } else if (paperFormat === '44mm') {
        frameWidth = 166;
        mmWidth = 44;
      }

      iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-99999px';
      iframe.style.top = '0';
      iframe.style.width = `${frameWidth}px`;
      iframe.style.height = '1400px';
      iframe.style.border = 'none';
      iframe.style.backgroundColor = '#ffffff';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) throw new Error('No se pudo inicializar entorno de PDF.');

      const htmlContent = generateA4Html(false, 1.0, paperFormat);
      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      await new Promise((resolve) => setTimeout(resolve, 350));

      const targetElement = (iframeDoc.querySelector('.page-wrapper') as HTMLElement) || iframeDoc.body;

      const canvas = await html2canvas(targetElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: frameWidth,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.96);

      if (spec.isThermal) {
        const mmHeight = Math.max(60, Math.round((canvas.height * mmWidth) / canvas.width));
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: [mmWidth, mmHeight],
          compress: true,
        });
        pdf.addImage(imgData, 'JPEG', 0, 0, mmWidth, mmHeight, undefined, 'FAST');
        const safeDocName = `${isSale ? 'Prefactura' : 'Orden_Compra'}_${orderNumberStr || 'Ticket'}_${paperFormat}.pdf`.replace(/\s+/g, '_');
        pdf.save(safeDocName);
        showToast?.(`¡PDF Térmico (${spec.label}) descargado con éxito!`);
      } else {
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: paperFormat === 'letter' ? 'letter' : 'a4',
          compress: true,
        });

        const pageWidth = paperFormat === 'letter' ? 215.9 : 210;
        const pageHeight = paperFormat === 'letter' ? 279.4 : 297;
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

        const safeDocName = `${isSale ? 'Pedido_Venta' : 'Orden_Compra'}_${orderNumberStr || 'Documento'}.pdf`.replace(/\s+/g, '_');
        pdf.save(safeDocName);
        showToast?.(`¡PDF descargado exitosamente: ${safeDocName}!`);
      }
    } catch (err) {
      console.error('Error al generar PDF:', err);
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
            </h2>
            <p className="text-[11px] text-slate-400 truncate">
              Formato seleccionado: <strong>{spec.label}</strong> ({spec.isThermal ? 'Rollo Térmico POS' : 'Hoja Completa'})
            </p>
          </div>
        </div>

        {/* Controles de Escala y Papel + Botones de Acción */}
        <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-y-1">
          {/* Selector de Papel */}
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 text-[11px] gap-0.5 flex-wrap">
            <span className="text-slate-400 font-bold px-1.5 hidden sm:inline">Formato:</span>
            {[
              { id: 'a4', label: 'A4' },
              { id: 'letter', label: 'Carta' },
              { id: '80mm', label: '80mm' },
              { id: '58mm', label: '58mm' },
              { id: '48mm', label: '48mm' },
              { id: '44mm', label: '44mm' },
            ].map((fmt) => (
              <button
                key={fmt.id}
                type="button"
                onClick={() => handleSetPaperFormat(fmt.id as PaperFormat)}
                className={`px-2 py-1 rounded font-bold transition cursor-pointer text-[11px] ${
                  paperFormat === fmt.id
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                {fmt.label}
              </button>
            ))}
          </div>

          {/* Botón Imprimir */}
          <button
            type="button"
            onClick={handlePrint}
            disabled={isPrinting}
            className="px-3 sm:px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-95 text-white text-xs font-black shadow-lg shadow-sky-950/50 transition flex items-center space-x-1.5 cursor-pointer border border-sky-400/40"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>

          {/* Botón Descargar PDF */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="px-3 sm:px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-black shadow-lg shadow-emerald-950/50 transition flex items-center space-x-1.5 cursor-pointer border border-emerald-400/40"
          >
            {isGeneratingPdf ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="hidden sm:inline">PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>PDF</span>
              </>
            )}
          </button>

          {/* Botón Abrir en Pestaña Independiente */}
          <button
            type="button"
            onClick={handleOpenInNewTab}
            className="px-2.5 sm:px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer border border-slate-700"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="hidden lg:inline">Abrir Pestaña</span>
          </button>

          {/* Botón Cerrar */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Contenedor de Vista Previa Dinámico (Térmico o Hoja A4) */}
      <div className="flex-1 p-2 sm:p-6 flex justify-center items-start overflow-x-auto bg-slate-900/50">
        <div
          id="order-a4-printable-document"
          ref={printableRef}
          className="page-wrapper"
          style={{
            transform: scale === 1.0 ? 'none' : `scale(${scale})`,
          }}
        >
          {spec.isThermal ? (
            /* VISTA PREVIA TICKET TÉRMICO POS */
            <div className="thermal-container">
              <div className="text-center mb-2 pb-2 border-b border-dashed border-slate-300">
                {storeLogo && (
                  <img
                    src={storeLogo}
                    alt={storeName}
                    className="mx-auto mb-1 object-contain"
                    style={{ maxHeight: '28px', maxWidth: '120px' }}
                  />
                )}
                <div className="font-black uppercase text-slate-900" style={{ fontSize: spec.titleFontSize }}>
                  {storeName}
                </div>
                {storeDescription && <div className="text-slate-600 text-[0.9em]">{storeDescription}</div>}
                {storeAddress && <div className="text-slate-600 text-[0.9em]">{storeAddress}</div>}
                {storePhone && <div className="text-slate-600 text-[0.9em]">Tel: {storePhone}</div>}
              </div>

              <div className="text-center mb-2 pb-2 border-b border-dashed border-slate-300">
                <div className="font-black text-slate-900 uppercase" style={{ fontSize: spec.titleFontSize }}>
                  {documentTitle} #{orderNumberStr}
                </div>
                <div className="text-slate-600 text-[0.9em] mt-0.5">{orderDateStr}</div>
                <div className="mt-1 font-bold text-slate-800 text-[0.85em] uppercase">
                  [ESTADO: {orderStatusBadge}]
                </div>
              </div>

              <div className="mb-2 pb-2 border-b border-dashed border-slate-300 text-[0.95em] leading-tight">
                {isSale ? (
                  <>
                    <div><strong>Cliente:</strong> {customerName || 'Consumidor Final'}</div>
                    {customerCi && <div><strong>CI/RUC:</strong> {customerCi}</div>}
                    {customerPhone && <div><strong>Tel:</strong> {customerPhone}</div>}
                    {customerAddress && <div><strong>Dir:</strong> {customerAddress}</div>}
                    {paymentMethod && <div><strong>Pago:</strong> {paymentMethod}</div>}
                  </>
                ) : (
                  <>
                    <div><strong>Proveedor:</strong> {supplierName || 'Proveedor Registrado'}</div>
                    {supplierContact && <div><strong>Contacto:</strong> {supplierContact}</div>}
                    <div><strong>Estado Pago:</strong> {paymentStatus}</div>
                  </>
                )}
              </div>

              {/* Ítems en 2 Líneas */}
              <div className="mb-2 pb-2 border-b border-dashed border-slate-300">
                <div className="font-bold text-slate-800 uppercase mb-1 pb-1 border-b border-slate-900 text-[0.85em] flex justify-between">
                  <span>CANT / DESCRIPCIÓN</span>
                  <span>TOTAL</span>
                </div>
                {isSale
                  ? salesCalculatedItems.map((it, idx) => (
                      <div key={idx} className="mb-1.5 pb-1 border-b border-dashed border-slate-200 last:border-0 leading-tight">
                        <div className="font-bold text-slate-900 break-words">{it.name}</div>
                        <div className="flex justify-between text-slate-600 text-[0.9em] mt-0.5">
                          <span>
                            {it.quantity} u. x {currencySymbol}{it.unitPriceWithoutTax.toFixed(2)}
                            {it.unitDiscount > 0 ? ` (-${currencySymbol}${(it.unitDiscount * it.quantity).toFixed(2)})` : ''}
                          </span>
                          <span className="font-bold text-slate-900 font-mono">
                            {currencySymbol}{it.lineSubtotal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))
                  : purchaseFormattedItems.map((it, idx) => (
                      <div key={idx} className="mb-1.5 pb-1 border-b border-dashed border-slate-200 last:border-0 leading-tight">
                        <div className="font-bold text-slate-900 break-words">{it.name}</div>
                        <div className="flex justify-between text-slate-600 text-[0.9em] mt-0.5">
                          <span>
                            {it.ordered} u. x {currencySymbol}{it.unitCost.toFixed(2)}
                            {it.discount > 0 ? ` (-${currencySymbol}${it.discount.toFixed(2)})` : ''}
                          </span>
                          <span className="font-bold text-slate-900 font-mono">
                            {currencySymbol}{it.lineSubtotal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
              </div>

              {/* Totales Térmicos */}
              <div className="mb-2 pb-2 border-b border-dashed border-slate-300 text-[0.95em] leading-snug">
                {isSale && invoiceTotals ? (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal 0%:</span>
                      <span className="font-mono">{currencySymbol}{invoiceTotals.subtotalZero0.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal 15%:</span>
                      <span className="font-mono">{currencySymbol}{invoiceTotals.subtotalTaxable15.toFixed(2)}</span>
                    </div>
                    {invoiceTotals.totalDiscount > 0 && (
                      <div className="flex justify-between text-amber-700">
                        <span>Desc. Total:</span>
                        <span className="font-mono">-{currencySymbol}{invoiceTotals.totalDiscount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-600">
                      <span>IVA 15%:</span>
                      <span className="font-mono">{currencySymbol}{invoiceTotals.taxAmount15.toFixed(2)}</span>
                    </div>
                    {invoiceTotals.shippingFee > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>Envío:</span>
                        <span className="font-mono">+{currencySymbol}{invoiceTotals.shippingFee.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-black text-slate-900 border-t-2 border-slate-900 pt-1 mt-1" style={{ fontSize: spec.numFontSize }}>
                      <span>TOTAL:</span>
                      <span className="font-mono">{currencySymbol}{invoiceTotals.totalInvoiceAmount.toFixed(2)}</span>
                    </div>
                  </>
                ) : isPurchase && purchaseSriBreakdown ? (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal Sin Imp.:</span>
                      <span className="font-mono">{currencySymbol}{purchaseSriBreakdown.subtotalSinImpuesto.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>IVA 15%:</span>
                      <span className="font-mono">{currencySymbol}{purchaseSriBreakdown.iva15.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-black text-slate-900 border-t-2 border-slate-900 pt-1 mt-1" style={{ fontSize: spec.numFontSize }}>
                      <span>TOTAL:</span>
                      <span className="font-mono">{currencySymbol}{purchaseSriBreakdown.grandTotal.toFixed(2)}</span>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="text-center text-slate-500 text-[0.85em] pt-1">
                <div className="font-bold text-slate-700">¡Gracias por su preferencia!</div>
                <div>Comerxia ERP • {new Date().toLocaleDateString('es-EC')}</div>
              </div>
            </div>
          ) : (
            /* VISTA PREVIA HOJA COMPLETA (A4 / CARTA) */
            <div className="sheet-container">
              <table className="header-table">
                <tbody>
                  <tr>
                    <td style={{ width: '60%', verticalAlign: 'top' }}>
                      {storeLogo ? (
                        <img
                          src={storeLogo}
                          alt={storeName}
                          style={{ maxHeight: '40px', maxWidth: '160px', objectFit: 'contain', marginBottom: '4px' }}
                        />
                      ) : null}
                      <div className="store-name">{storeName}</div>
                      {storeDescription && <div className="store-sub">{storeDescription}</div>}
                      {storeAddress && <div className="store-sub"><strong>Dirección:</strong> {storeAddress}</div>}
                      {storePhone && <div className="store-sub"><strong>Teléfono:</strong> {storePhone}</div>}
                    </td>
                    <td style={{ width: '40%', textAlign: 'right', verticalAlign: 'top' }}>
                      <div className="doc-badge">{documentTitle}</div>
                      <div className="doc-number">#{orderNumberStr}</div>
                      <div style={{ fontSize: '9px', color: '#475569', marginTop: '2px' }}>
                        <strong>Fecha de Emisión:</strong><br />{orderDateStr}
                      </div>
                      <div style={{ marginTop: '3px' }}>
                        <span style={{ fontSize: '8.5px', fontWeight: 800, background: '#e2e8f0', color: '#1e293b', padding: '2px 6px', borderRadius: '3px' }}>
                          ESTADO: {orderStatusBadge}
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              <table className="meta-box">
                <tbody>
                  <tr>
                    <td>
                      <div className="section-title">{isSale ? 'Datos del Cliente' : 'Datos del Proveedor'}</div>
                      {isSale ? (
                        <>
                          <div className="field-row"><span className="field-label">Cliente:</span> <span className="field-val"><strong>{customerName || 'Cliente General'}</strong></span></div>
                          <div className="field-row"><span className="field-label">Cédula / RUC:</span> <span className="field-val">{customerCi || 'Consumidor Final'}</span></div>
                          <div className="field-row"><span className="field-label">Teléfono:</span> <span className="field-val">{customerPhone || '—'}</span></div>
                          {customerEmail ? <div className="field-row"><span className="field-label">Correo:</span> <span className="field-val">{customerEmail}</span></div> : null}
                          <div className="field-row"><span className="field-label">Dirección:</span> <span className="field-val">{customerAddress || (isPickup ? 'Retiro en Local' : '—')}</span></div>
                        </>
                      ) : (
                        <>
                          <div className="field-row"><span className="field-label">Proveedor:</span> <span className="field-val"><strong>{supplierName || 'Proveedor Registrado'}</strong></span></div>
                          <div className="field-row"><span className="field-label">Contacto:</span> <span className="field-val">{supplierContact || '—'}</span></div>
                          <div className="field-row"><span className="field-label">Estado Pago:</span> <span className="field-val">{paymentStatus}</span></div>
                        </>
                      )}
                    </td>
                    <td>
                      <div className="section-title">{isSale ? 'Detalles de Despacho' : 'Condiciones'}</div>
                      {isSale ? (
                        <>
                          <div className="field-row"><span className="field-label">Modalidad:</span> <span className="field-val"><strong>{isPickup ? 'Retiro en Local' : 'Envío a Domicilio'}</strong></span></div>
                          <div className="field-row"><span className="field-label">Forma de Pago:</span> <span className="field-val">{paymentMethod || 'Acuerdo Comercial'}</span></div>
                        </>
                      ) : (
                        <>
                          <div className="field-row"><span className="field-label">Recepción:</span> <span className="field-val">{purchase?.status === 'received' ? 'Recibido en Bodega' : 'Pendiente'}</span></div>
                        </>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>

              <table className="items-table">
                <thead>
                  {isSale ? (
                    <tr>
                      <th style={{ width: '4%', textAlign: 'center' }}>#</th>
                      <th style={{ width: '36%' }}>Producto / Descripción</th>
                      <th style={{ width: '14%' }}>SKU</th>
                      <th style={{ width: '8%', textAlign: 'center' }}>Cant.</th>
                      <th style={{ width: '11%', textAlign: 'right' }}>P. Unit</th>
                      <th style={{ width: '9%', textAlign: 'right' }}>Desc.</th>
                      <th style={{ width: '7%', textAlign: 'center' }}>IVA</th>
                      <th style={{ width: '11%', textAlign: 'right' }}>Subtotal</th>
                    </tr>
                  ) : (
                    <tr>
                      <th style={{ width: '4%', textAlign: 'center' }}>#</th>
                      <th style={{ width: '32%' }}>Producto</th>
                      <th style={{ width: '15%' }}>SKU</th>
                      <th style={{ width: '7%', textAlign: 'center' }}>Pedida</th>
                      <th style={{ width: '7%', textAlign: 'center' }}>Bodega</th>
                      <th style={{ width: '7%', textAlign: 'center' }}>Pend.</th>
                      <th style={{ width: '10%', textAlign: 'right' }}>Costo U.</th>
                      <th style={{ width: '7%', textAlign: 'right' }}>Desc.</th>
                      <th style={{ width: '5%', textAlign: 'center' }}>IVA</th>
                      <th style={{ width: '11%', textAlign: 'right' }}>Total</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {isSale
                    ? salesCalculatedItems.map((it, idx) => (
                        <tr key={idx}>
                          <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#64748b' }}>#{idx + 1}</td>
                          <td className="product-title">{it.name}</td>
                          <td className="sku-code">{it.sku || '-'}</td>
                          <td className="qty-cell">{it.quantity} u.</td>
                          <td className="price-cell">{currencySymbol}{it.unitPriceWithoutTax.toFixed(2)}</td>
                          <td className="price-cell" style={{ color: it.unitDiscount > 0 ? '#b45309' : '#64748b' }}>
                            {currencySymbol}${(it.unitDiscount * it.quantity).toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{it.lineTaxPercent}%</td>
                          <td className="total-cell">{currencySymbol}{it.lineSubtotal.toFixed(2)}</td>
                        </tr>
                      ))
                    : purchaseFormattedItems.map((it, idx) => (
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
              </table>

              <table className="summary-table">
                <tbody>
                  <tr>
                    <td style={{ width: '52%', verticalAlign: 'top' }}>
                      <div style={{ fontSize: '9px', color: '#64748b', fontStyle: 'italic' }}>
                        * Este comprobante certifica la {isSale ? 'prefactura' : 'orden de compra'} especificada en el sistema ERP.
                      </div>
                    </td>
                    <td style={{ width: '48%', verticalAlign: 'top' }}>
                      <table className="totals-box">
                        <tbody>
                          {isSale && invoiceTotals ? (
                            <>
                              <tr><td className="totals-label">Total Unidades:</td><td className="totals-val">{invoiceTotals.totalUnits} un.</td></tr>
                              <tr><td className="totals-label">Subtotal 0%:</td><td className="totals-val">{currencySymbol}{invoiceTotals.subtotalZero0.toFixed(2)}</td></tr>
                              <tr><td className="totals-label">Subtotal 15%:</td><td className="totals-val">{currencySymbol}{invoiceTotals.subtotalTaxable15.toFixed(2)}</td></tr>
                              <tr style={{ borderTop: '1px solid #cbd5e1' }}><td className="totals-label" style={{ fontWeight: 800, color: '#0f172a' }}>Subtotal Sin Impuesto:</td><td className="totals-val" style={{ fontWeight: 800 }}>{currencySymbol}{invoiceTotals.subtotalNoTax.toFixed(2)}</td></tr>
                              {invoiceTotals.totalDiscount > 0 && <tr><td className="totals-label" style={{ color: '#9a3412' }}>Total Descuento:</td><td className="totals-val" style={{ color: '#9a3412' }}>-{currencySymbol}{invoiceTotals.totalDiscount.toFixed(2)}</td></tr>}
                              <tr><td className="totals-label">IVA 15%:</td><td className="totals-val">{currencySymbol}{invoiceTotals.taxAmount15.toFixed(2)}</td></tr>
                              {invoiceTotals.shippingFee > 0 && <tr><td className="totals-label">Valor Envío:</td><td className="totals-val">+{currencySymbol}{invoiceTotals.shippingFee.toFixed(2)}</td></tr>}
                              <tr className="grand-total-row">
                                <td className="totals-label" style={{ fontSize: '10.5px', color: '#0f172a', fontWeight: 900 }}>TOTAL VENTA SRI:</td>
                                <td className="totals-val" style={{ fontSize: '12px', color: '#0284c7', fontWeight: 900 }}>{currencySymbol}{invoiceTotals.totalInvoiceAmount.toFixed(2)}</td>
                              </tr>
                            </>
                          ) : isPurchase && purchaseSriBreakdown ? (
                            <>
                              <tr><td className="totals-label">Subtotal Sin Impuesto:</td><td className="totals-val">{currencySymbol}{purchaseSriBreakdown.subtotalSinImpuesto.toFixed(2)}</td></tr>
                              <tr><td className="totals-label">IVA COMPRA (15%):</td><td className="totals-val">{currencySymbol}{purchaseSriBreakdown.iva15.toFixed(2)}</td></tr>
                              <tr className="grand-total-row">
                                <td className="totals-label" style={{ fontSize: '10.5px', color: '#0f172a', fontWeight: 900 }}>TOTAL COMPRA SRI:</td>
                                <td className="totals-val" style={{ fontSize: '12px', color: '#0284c7', fontWeight: 900 }}>{currencySymbol}{purchaseSriBreakdown.grandTotal.toFixed(2)}</td>
                              </tr>
                            </>
                          ) : null}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="signatures-section">
                <table className="signatures-table">
                  <tbody>
                    <tr>
                      <td>
                        <div className="signature-line">
                          Emitido / Autorizado por<br />
                          <span style={{ fontWeight: 'normal', fontSize: '8.5px', color: '#64748b' }}>{storeName}</span>
                        </div>
                      </td>
                      <td>
                        <div className="signature-line">
                          Recibido Conforme<br />
                          <span style={{ fontWeight: 'normal', fontSize: '8.5px', color: '#64748b' }}>{isSale ? customerName || 'Firma de Cliente' : supplierName || 'Firma de Proveedor'}</span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div className="footer-doc">
                  Documento A4 generado el {new Date().toLocaleString('es-EC')} • Comerxia ERP
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

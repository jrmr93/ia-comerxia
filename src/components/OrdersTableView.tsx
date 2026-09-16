import React from 'react';
import {
  Copy,
  Clock,
  Truck,
  Building2,
  CheckCircle2,
  AlertCircle,
  Package,
  ExternalLink,
} from 'lucide-react';
import { OrderActionButtons } from './OrderActionButtons.tsx';
import { normalizeEcuadorPhone } from '../utils/phone.ts';
import { getCustomerCi, getCleanAddress, isPickupDeliveryOrder } from '../utils/orderUtils.ts';
import { calculateLineItem, calculateInvoiceTotals, extractBaseUnitPriceWithoutTax, extractItemTaxPercent } from '../utils/ecuadorTaxCalculator.ts';

interface OrdersTableViewProps {
  orders: any[];
  inventoryItems?: any[];
  storeConfig: {
    storeName?: string;
    currency?: string;
    logoUrl?: string | null;
  };
  paymentPartners: any[];
  currency?: string;
  onOpenEditOrder: (order: any) => void;
  onOpenConfirmVoucher: (order: any) => void;
  onOpenShipOrder: (order: any) => void;
  onOpenShippingCost?: (order: any) => void;
  onOpenPendingShipping?: (order: any) => void;
  onOpenPrintShippingTicket?: (order: any) => void;
  onOpenPrintA4Order?: (order: any) => void;
  onOpenRequestShippingData?: (order: any) => void;
  onGenerateSupplierPurchase?: (order: any) => void | Promise<void>;
  onViewLinkedPurchase?: (purchaseIdOrFilter: number | string, orderNumber?: string) => void;
  onOpenPartialDelivery?: (order: any) => void;
  onCompleteRemainingDelivery?: (order: any) => void | Promise<void>;
  purchases?: any[];
  onOpenCancelOrder?: (order: any) => void;
  onOpenDeliverOrder?: (order: any) => void;
  onUpdateStatus: (
    orderId: any,
    status: string,
    voucher?: string,
    notes?: string,
    trackingNumber?: string,
    trackingCarrier?: string,
    trackingNotes?: string
  ) => Promise<void>;
  onDeleteOrder: (order: any) => void;
  showToast: (msg: string) => void;
  buildWhatsAppLink: (phone: string, text?: string) => string;
  renderPaymentBadge: (method: string, partners: any[], orderStatus?: string) => React.ReactNode;
}

export const getOrderRowStyles = (status?: string) => {
  switch (status) {
    case 'pending':
      return {
        cardBorderClass: 'border-amber-300 border-l-4 border-l-amber-500 bg-amber-50/20',
        orderNumberColor: 'text-amber-950 font-black',
        statusDot: 'bg-amber-500 ring-2 ring-amber-300/60',
        badgeColor: 'bg-amber-100 text-amber-950 border-amber-300 font-black',
        label: 'Pre-Factura (Pendiente)',
      };
    case 'confirmed':
      return {
        cardBorderClass: 'border-purple-200 border-l-4 border-l-purple-500 bg-purple-50/20',
        orderNumberColor: 'text-purple-950 font-black',
        statusDot: 'bg-purple-500 ring-2 ring-purple-300/60',
        badgeColor: 'bg-purple-100 text-purple-950 border-purple-300 font-bold',
        label: 'Factura (Confirmada)',
      };
    case 'shipped':
      return {
        cardBorderClass: 'border-sky-200 border-l-4 border-l-sky-500 bg-sky-50/20',
        orderNumberColor: 'text-sky-950 font-black',
        statusDot: 'bg-sky-500 ring-2 ring-sky-300/60',
        badgeColor: 'bg-sky-100 text-sky-950 border-sky-300 font-bold',
        label: 'Factura (En Tránsito)',
      };
    case 'delivered':
      return {
        cardBorderClass: 'border-emerald-200 border-l-4 border-l-emerald-500 bg-emerald-50/20',
        orderNumberColor: 'text-emerald-950 font-black',
        statusDot: 'bg-emerald-500 ring-2 ring-emerald-300/60',
        badgeColor: 'bg-emerald-100 text-emerald-950 border-emerald-300 font-bold',
        label: 'Factura (Entregada)',
      };
    case 'cancelled':
      return {
        cardBorderClass: 'border-rose-200 border-l-4 border-l-rose-400 bg-rose-50/15 opacity-90',
        orderNumberColor: 'text-rose-950 font-bold',
        statusDot: 'bg-rose-500 ring-2 ring-rose-300/60',
        badgeColor: 'bg-rose-100 text-rose-950 border-rose-200 font-bold',
        label: 'Anulada / Cancelada',
      };
    default:
      return {
        cardBorderClass: 'border-slate-200 border-l-4 border-l-slate-400 bg-white',
        orderNumberColor: 'text-slate-900 font-bold',
        statusDot: 'bg-slate-400',
        badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
        label: status || 'Pre-Factura',
      };
  }
};

export const OrdersTableView: React.FC<OrdersTableViewProps> = ({
  orders = [],
  inventoryItems = [],
  storeConfig,
  paymentPartners = [],
  currency = '$',
  onOpenEditOrder,
  onOpenConfirmVoucher,
  onOpenShipOrder,
  onOpenShippingCost,
  onOpenPendingShipping,
  onOpenPrintShippingTicket,
  onOpenPrintA4Order,
  onOpenRequestShippingData,
  onViewLinkedPurchase,
  onOpenPartialDelivery,
  onCompleteRemainingDelivery,
  purchases = [],
  onOpenCancelOrder,
  onOpenDeliverOrder,
  onUpdateStatus,
  onDeleteOrder,
  showToast,
  buildWhatsAppLink,
  renderPaymentBadge,
}) => {
  return (
    <div id="orders-list-container" className="w-full space-y-3">
      {orders.map((ord, index) => {
        const isPickup = isPickupDeliveryOrder(ord);
        const orderApplyTax = (ord as any).applySaleTax !== false;
        const orderTaxPct = Number((ord as any).saleTaxPercent || 15);

        // 1. Parse items exactly as UnifiedOrderManageModal.tsx does (lines 341-377)
        const rawItems = Array.isArray(ord.items)
          ? ord.items
          : typeof ord.items === 'string'
          ? (() => {
              try {
                return JSON.parse(ord.items);
              } catch {
                return [];
              }
            })()
          : [];

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

        const totalOrderedUnits = parsedItems.reduce((acc: number, it: any) => acc + (Number(it.quantity) || 1), 0);
        const totalDeliveredUnits = parsedItems.reduce((acc: number, it: any) => acc + (Number(it.deliveredQuantity) || 0), 0);
        const totalPendingUnits = Math.max(0, totalOrderedUnits - totalDeliveredUnits);
        const itemsCount = totalOrderedUnits > 0 ? totalOrderedUnits : parsedItems.length;
        const isPending = ord.status === 'pending';
        const rowStyles = getOrderRowStyles(ord.status);
        const customerCi = getCustomerCi(ord);
        const cleanAddress = getCleanAddress(ord.customerAddress);
        const normPhone = normalizeEcuadorPhone(ord.customerPhone);
        const productsSummary = parsedItems.length > 0
          ? parsedItems.map((it: any) => `${it.quantity || 1}x ${it.name || it.item?.name || 'Producto'}`).join(', ')
          : 'Sin productos';

        // Compras vinculadas para mostrar estado de abastecimiento como texto/badge
        const linkedPurchasesForOrder = (purchases || []).filter(
          (p: any) =>
            p.status !== 'cancelled' &&
            ((ord.linkedPurchaseId && p.id === ord.linkedPurchaseId) ||
              p.linkedCustomerOrderId === ord.id ||
              (ord.linkedPurchaseNumber && String(ord.linkedPurchaseNumber).includes(p.purchaseNumber)) ||
              (p.linkedCustomerOrderNumber && String(p.linkedCustomerOrderNumber).trim() === String(ord.orderNumber).trim()) ||
              (Array.isArray(p.items) &&
                p.items.some(
                  (it: any) =>
                    it.customerOrderId === ord.id ||
                    (it.orderNumber && String(it.orderNumber).trim() === String(ord.orderNumber).trim())
                )))
        );

        const firstLinkedPurchase = linkedPurchasesForOrder[0];
        const isLinkedPurchasePending = linkedPurchasesForOrder.some((p: any) => p.status === 'pending');

        // Calculated items & invoice totals
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
        const explicitShip = Number((ord as any).shippingCost ?? (ord as any).deliveryFee);
        let derivedShippingCost = 0;
        if (!isNaN(explicitShip) && explicitShip >= 0 && (ord as any).shippingCost !== undefined && (ord as any).shippingCost !== null) {
          derivedShippingCost = explicitShip;
        } else {
          const orderTotal = Number(ord.totalAmount || 0);
          const derivedShip = Math.max(0, orderTotal - itemsTotalWithTax);
          derivedShippingCost = derivedShip > 0 ? derivedShip : 0;
        }
        const fee = isPickup ? 0 : derivedShippingCost;

        const invoiceTotals = calculateInvoiceTotals(calculatedItems, { shippingFee: fee });

        return (
          <div
            key={ord.id}
            id={index === 0 ? 'orders-first-record' : `order-record-${ord.id}`}
            className="w-full bg-white rounded-2xl border border-slate-300 overflow-hidden shadow-xs space-y-0"
          >
            {/* Encabezado Principal tipo Factura ERP (Estilo Compras) */}
            <div className="bg-slate-900 text-white p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-black text-sm text-sky-300 bg-sky-950/80 px-2.5 py-1 rounded-lg border border-sky-700/60 flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${rowStyles.statusDot}`} />
                  #{ord.orderNumber}
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(ord.orderNumber || '');
                      showToast('✓ Número de orden copiado');
                    }}
                    className="text-sky-400 hover:text-white p-0.5 cursor-pointer ml-1"
                    title="Copiar número de orden"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </span>

                {/* Badge de Estado Comercial */}
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${rowStyles.badgeColor}`}>
                  {rowStyles.label}
                </span>

                {/* Cliente */}
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 ml-1">
                  <span>
                    Cliente: <strong className="text-white font-bold">{ord.customerName || 'Cliente'}</strong>
                  </span>
                  {customerCi && <span className="font-mono text-slate-400 font-normal">({customerCi})</span>}
                </span>

                {/* Modalidad de Entrega */}
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                    isPickup
                      ? 'bg-amber-900/80 text-amber-200 border border-amber-700'
                      : 'bg-sky-900/80 text-sky-200 border border-sky-700'
                  }`}
                >
                  {isPickup ? <Building2 className="w-3 h-3 text-amber-400" /> : <Truck className="w-3 h-3 text-sky-400" />}
                  {isPickup ? 'Retiro en Local' : 'Envío a Domicilio'}
                </span>

                {/* Botón "Ver Compra" vinculado */}
                {linkedPurchasesForOrder.length > 0 && (
                  <button
                    type="button"
                    id={`btn-order-view-purchase-${ord.id}`}
                    onClick={() => {
                      if (onViewLinkedPurchase) {
                        if (firstLinkedPurchase?.purchaseNumber) {
                          onViewLinkedPurchase(firstLinkedPurchase.id || firstLinkedPurchase.purchaseNumber, String(ord.orderNumber));
                        } else if (firstLinkedPurchase?.id) {
                          onViewLinkedPurchase(firstLinkedPurchase.id, String(ord.orderNumber));
                        } else {
                          onViewLinkedPurchase(String(ord.orderNumber), String(ord.orderNumber));
                        }
                      }
                    }}
                    title={`Ir a compras y filtrar compras asociadas al Pedido #${ord.orderNumber}`}
                    className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-lg bg-indigo-950 text-indigo-200 border border-indigo-700 hover:bg-indigo-900 transition cursor-pointer shadow-2xs"
                  >
                    <Truck className="w-3.5 h-3.5 text-indigo-400" />
                    <span>
                      {linkedPurchasesForOrder.length > 1
                        ? `Ver Compras (${linkedPurchasesForOrder.length})`
                        : `Ver Compra #${linkedPurchasesForOrder[0].purchaseNumber || linkedPurchasesForOrder[0].id}`}
                    </span>
                    {isLinkedPurchasePending && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-300 text-amber-950 font-extrabold ml-1">
                        ⏳ Pendiente
                      </span>
                    )}
                    <ExternalLink className="w-2.5 h-2.5 text-indigo-400 ml-0.5" />
                  </button>
                )}
              </div>

              <div className="font-mono font-black text-sm sm:text-base text-emerald-400">
                Total Factura: ${invoiceTotals.totalInvoiceAmount.toFixed(2)}{' '}
                <span className="text-xs font-bold text-emerald-200">{currency}</span>
              </div>
            </div>

            {/* Tabla Horizontal de Productos Tipo Factura ERP (Visualmente Exacta a Compras) */}
            <div className="overflow-x-auto border-t border-b border-slate-200">
              <table className="w-full text-left text-xs text-slate-800 font-sans border-collapse min-w-[750px]">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3 min-w-[220px]">Producto / Descripción</th>
                    <th className="p-3 min-w-[110px]">SKU / Código</th>
                    <th className="p-3 text-center min-w-[90px]">Cantidad</th>
                    <th className="p-3 text-right min-w-[110px]">Valor Unit. ($)</th>
                    <th className="p-3 text-right min-w-[90px]">Desc. ($)</th>
                    <th className="p-3 text-center min-w-[80px]">IVA (%)</th>
                    <th className="p-3 text-right min-w-[110px]">Subtotal ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {calculatedItems.map((item: any, idx: number) => {
                    const rawIt = rawItems[idx] || {};
                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition">
                        <td className="p-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                        <td className="p-3">
                          <div className="flex items-center space-x-2.5">
                            {rawIt.imageUrl || rawIt.item?.imageUrl ? (
                              <img
                                src={rawIt.imageUrl || rawIt.item?.imageUrl}
                                alt={item.name}
                                className="w-9 h-9 object-cover rounded-lg border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 border border-slate-200">
                                <Package className="w-4 h-4" />
                              </div>
                            )}
                            <span className="font-extrabold text-slate-900 text-xs line-clamp-1">
                              {item.name}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 font-mono text-[11px]">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-bold text-sky-800">
                            {item.sku || '-'}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-900">{item.quantity} u.</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-800">${item.unitPriceWithoutTax.toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-amber-700 font-bold">
                          ${item.unitDiscount > 0 ? (item.unitDiscount * item.quantity).toFixed(2) : '0.00'}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                              item.lineTaxPercent > 0
                                ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {item.lineTaxPercent}%
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-black text-emerald-700">
                          ${item.lineSubtotal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 font-bold border-t border-slate-300 text-xs">
                  <tr>
                    <td colSpan={3} className="p-3 text-slate-700">
                      Desglose de Venta: <strong>{calculatedItems.length} ítems</strong> ({invoiceTotals.totalUnits} unidades en total)
                    </td>
                    <td className="p-3 text-center font-mono text-slate-900">{invoiceTotals.totalUnits} u.</td>
                    <td colSpan={3} className="p-3 text-right text-slate-600 uppercase font-sans text-[11px]">
                      Total Venta:
                    </td>
                    <td className="p-3 text-right font-mono font-black text-sm sm:text-base text-emerald-800">
                      ${invoiceTotals.totalInvoiceAmount.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Desglose de Totales Fiscales SRI Ecuador (Estilo efaccilito igual que compras y Pre-Factura) */}
            <div className="bg-slate-50 border-t border-slate-200 p-3 sm:p-4 text-xs flex flex-col md:flex-row justify-between items-start gap-4">
              {/* Información Complementaria de la Venta */}
              <div className="space-y-1.5 text-slate-600 text-[11px] max-w-md w-full">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong className="text-slate-800">Cliente:</strong>
                  <span className="font-semibold text-slate-900">{ord.customerName || 'Cliente'}</span>
                  {customerCi && (
                    <span className="font-mono bg-white px-1.5 py-0.2 rounded border border-slate-200 text-[10px]">
                      CI: {customerCi}
                    </span>
                  )}
                </div>

                {normPhone.formattedLocal && (
                  <div className="flex items-center gap-1.5">
                    <strong className="text-slate-800">Teléfono:</strong>
                    <span className="font-mono text-slate-800">{normPhone.formattedLocal}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(normPhone.formattedLocal || ord.customerPhone);
                        showToast('✓ Teléfono copiado');
                      }}
                      className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                      title="Copiar teléfono"
                    >
                      <Copy className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}

                <div>
                  <strong className="text-slate-800">Dirección / Entrega:</strong>{' '}
                  <span className="text-slate-700">{isPickup ? 'Retiro en Local' : cleanAddress || 'Dirección de envío'}</span>
                </div>

                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <strong className="text-slate-800">Pago:</strong>
                  {renderPaymentBadge(ord.paymentMethod, paymentPartners, ord.status)}
                  {ord.paymentVoucher && (
                    <span className="font-mono text-[10px] bg-purple-50 text-purple-800 px-1.5 py-0.5 rounded border border-purple-200 font-bold">
                      Voucher: {ord.paymentVoucher}
                    </span>
                  )}
                </div>

                {/* Abastecimiento / Stock status badge */}
                <div className="pt-1">
                  {ord.fulfillmentStatus === 'partial_ready' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-900 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                      <span>¡Saldo en Bodega! ({totalPendingUnits} un.)</span>
                    </span>
                  ) : ord.fulfillmentStatus === 'supplier_pending' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-900 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md">
                      <AlertCircle className="w-3 h-3 text-amber-600 flex-shrink-0" />
                      <span>Sin Stock (Bajo Pedido)</span>
                    </span>
                  ) : ord.fulfillmentStatus === 'supplier_ordered' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                      <Truck className="w-3 h-3 text-indigo-600 flex-shrink-0" />
                      <span>
                        {linkedPurchasesForOrder.length > 0
                          ? `Compra #${linkedPurchasesForOrder.map((lp: any) => lp.purchaseNumber).join(', ')} en camino`
                          : `Compra en camino`}
                      </span>
                    </span>
                  ) : ord.fulfillmentStatus === 'supplier_received' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-900 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-md">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                      <span>Recibido de Proveedor</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                      <Package className="w-3 h-3 text-slate-500 flex-shrink-0" />
                      <span>Stock Disponible</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Bloque Totales Fiscales SRI (Idéntico a Modal Gestión de Pre-Factura) */}
              <div className="w-full md:w-72 space-y-1 font-mono text-[11px] shrink-0">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal 0%:</span>
                  <span className="font-bold text-slate-900">${invoiceTotals.subtotalZero0.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal 15%:</span>
                  <span className="font-bold text-slate-900">${invoiceTotals.subtotalTaxable15.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-700 font-bold pt-1 border-t border-slate-200">
                  <span>Subtotal Sin Impuesto:</span>
                  <span className="text-slate-900">${invoiceTotals.subtotalNoTax.toFixed(2)}</span>
                </div>
                {invoiceTotals.totalDiscount > 0 && (
                  <div className="flex justify-between text-amber-700 font-bold">
                    <span>Total Descuento:</span>
                    <span>-${invoiceTotals.totalDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>IVA VENTA (15%):</span>
                  <span className="font-bold text-slate-900">${invoiceTotals.totalTax.toFixed(2)}</span>
                </div>
                {invoiceTotals.shippingFee > 0 && (
                  <div className="flex justify-between text-sky-700 font-bold">
                    <span>Valor Envío / Flete:</span>
                    <span>+${invoiceTotals.shippingFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-emerald-950 font-black text-xs sm:text-sm pt-1.5 border-t-2 border-emerald-600 bg-emerald-50/90 p-2 rounded-lg mt-1 shadow-2xs">
                  <span>TOTAL VENTA SRI:</span>
                  <span>
                    ${invoiceTotals.totalInvoiceAmount.toFixed(2)} {currency}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer Acciones Venta (Misma barra de botones de acción) */}
            <div className="p-3 bg-slate-100/90 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                <Clock className={`w-3 h-3 ${isPending ? 'text-amber-600 animate-pulse' : 'text-slate-400'}`} />
                <span>
                  Fecha de Venta:{' '}
                  <strong>
                    {ord.createdAt
                      ? new Date(ord.createdAt).toLocaleDateString('es-EC', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Reciente'}
                  </strong>
                </span>
              </div>

              {/* Botones de Acción de Venta */}
              <div className="w-full sm:w-auto">
                <OrderActionButtons
                  order={ord}
                  inventoryItems={inventoryItems}
                  purchases={purchases}
                  onViewLinkedPurchase={onViewLinkedPurchase}
                  storeConfig={storeConfig}
                  currency={currency}
                  onOpenEditOrder={onOpenEditOrder}
                  onOpenConfirmVoucher={onOpenConfirmVoucher}
                  onOpenShipOrder={onOpenShipOrder}
                  onOpenShippingCost={onOpenShippingCost}
                  onOpenPendingShipping={onOpenPendingShipping}
                  onOpenPrintShippingTicket={onOpenPrintShippingTicket}
                  onOpenPrintA4Order={onOpenPrintA4Order}
                  onOpenRequestShippingData={onOpenRequestShippingData}
                  onOpenPartialDelivery={onOpenPartialDelivery}
                  onCompleteRemainingDelivery={onCompleteRemainingDelivery}
                  onOpenCancelOrder={onOpenCancelOrder}
                  onOpenDeliverOrder={onOpenDeliverOrder}
                  onUpdateStatus={onUpdateStatus}
                  onDeleteOrder={onDeleteOrder}
                  showToast={showToast}
                  buildWhatsAppLink={buildWhatsAppLink}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

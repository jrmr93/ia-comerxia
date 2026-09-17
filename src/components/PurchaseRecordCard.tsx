import React from 'react';
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageCircle,
  Copy,
  Printer,
  Trash2,
  Edit3,
  ExternalLink,
  Boxes,
  ShoppingBag,
  Loader2,
  Lock,
  History,
  Eye,
  CreditCard,
  Building2,
  Receipt,
  FileText,
  Calendar,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { PurchaseOrder, StoreConfig, CustomerOrder } from '../types.ts';
import { directPrintOrder } from '../utils/directOrderPrint.ts';

interface PurchaseRecordCardProps {
  purchase: PurchaseOrder;
  isInGroup?: boolean;
  viewMode?: 'grid' | 'table';
  currency: string;
  storeConfig?: Partial<StoreConfig> | null;
  customerOrders?: CustomerOrder[];
  showToast?: (msg: string) => void;
  onConfirmPay: (purchase: PurchaseOrder) => void;
  isConfirming?: boolean;
  onReceive: (purchase: PurchaseOrder) => void;
  isReceiving?: boolean;
  onPartialReceive: (purchase: PurchaseOrder) => void;
  onOpenWhatsapp: (purchase: PurchaseOrder, mode: 'whatsapp' | 'copy_photos') => void;
  onQuickCopyPhotos: (purchase: PurchaseOrder) => void;
  isCopyingPhotos?: boolean;
  onEditOrDetail: (purchase: PurchaseOrder) => void;
  onOpenPrintA4?: (purchase: PurchaseOrder) => void;
  onDelete: (purchase: PurchaseOrder) => void;
  onGoToStoreOrders?: (orderNumber?: string) => void;
  statusStyles: {
    label: string;
    badgeClass: string;
    cardClass: string;
    numberPill: string;
    statusDot: string;
  };
}

export const PurchaseRecordCard: React.FC<PurchaseRecordCardProps> = ({
  purchase,
  isInGroup = false,
  viewMode = 'grid',
  currency,
  storeConfig,
  customerOrders,
  showToast,
  onConfirmPay,
  isConfirming = false,
  onReceive,
  isReceiving = false,
  onPartialReceive,
  onOpenWhatsapp,
  onQuickCopyPhotos,
  isCopyingPhotos = false,
  onEditOrDetail,
  onOpenPrintA4,
  onDelete,
  onGoToStoreOrders,
  statusStyles,
}) => {
  const isReceived = purchase.status === 'received';
  const isPartiallyReceived = purchase.status === 'partially_received';
  const isCancelled = purchase.status === 'cancelled';
  const isPending = purchase.status === 'pending';
  const isAutoFromSales = Boolean(purchase.linkedCustomerOrderId || purchase.linkedCustomerOrderNumber);
  const linkedOrderNumber = purchase.linkedCustomerOrderNumber || purchase.linkedCustomerOrderId;

  const linkedCustomerOrder = isAutoFromSales
    ? (customerOrders || []).find(
        (ord) =>
          (purchase.linkedCustomerOrderId &&
            (Number(ord.id) === Number(purchase.linkedCustomerOrderId) ||
              String(ord.id) === String(purchase.linkedCustomerOrderId))) ||
          (purchase.linkedCustomerOrderNumber &&
            ord.orderNumber &&
            ord.orderNumber.trim() === purchase.linkedCustomerOrderNumber.trim())
      )
    : null;

  const isLinkedOrderConfirmed = Boolean(
    linkedCustomerOrder &&
      (linkedCustomerOrder.status === 'confirmed' ||
        linkedCustomerOrder.status === 'shipped' ||
        linkedCustomerOrder.status === 'delivered')
  );

  // La compra al proveedor no puede confirmarse si no se confirma el pedido de venta vinculado
  const isLinkedOrderUnconfirmed = Boolean(isAutoFromSales && !isLinkedOrderConfirmed);

  const totalOrderedCount = Array.isArray(purchase.items)
    ? purchase.items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0)
    : 0;
  const totalReceivedCount = Array.isArray(purchase.items)
    ? purchase.items.reduce(
        (sum, it) => sum + (Number(it.receivedQuantity) || (isReceived ? Number(it.quantity) || 1 : 0)),
        0
      )
    : 0;
  const totalPendingCount = isReceived ? 0 : Math.max(0, totalOrderedCount - totalReceivedCount);

  // Desglose fiscal de impuestos SRI Ecuador (Subtotal 0%, Subtotal 15%, Subtotal 5%, Descuento, IVA 15%/5%, Total)
  const sriBreakdown = React.useMemo(() => {
    let subtotal0 = 0;
    let subtotal15 = 0;
    let subtotal5 = 0;
    let totalDiscount = 0;

    (purchase.items || []).forEach((item) => {
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

      let baseUnitCost = 0;
      const rawCostPrice = item.costPrice !== undefined && item.costPrice !== null ? Number(item.costPrice) : 0;
      const rawCostWithoutTax = (item as any).costWithoutTax !== undefined && (item as any).costWithoutTax !== null ? Number((item as any).costWithoutTax) : 0;
      const rawBaseCost = (item as any).baseCostPrice !== undefined && (item as any).baseCostPrice !== null ? Number((item as any).baseCostPrice) : 0;

      if (rawCostWithoutTax > 0) {
        baseUnitCost = rawCostWithoutTax;
      } else if (rawCostPrice > 0) {
        const totalPoCost = Number(purchase?.totalCost || 0);
        if (taxPercent > 0 && totalPoCost > 0 && Math.abs(rawCostPrice * qty - totalPoCost) < 0.05) {
          baseUnitCost = rawCostPrice / (1 + taxPercent / 100);
        } else {
          baseUnitCost = rawCostPrice;
        }
      } else if (rawBaseCost > 0) {
        baseUnitCost = rawBaseCost;
      }

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
    const grandTotal = Math.round((subtotalSinImpuesto + iva15 + iva5) * 100) / 100;

    return {
      subtotal0: Math.round(subtotal0 * 100) / 100,
      subtotal15: Math.round(subtotal15 * 100) / 100,
      subtotal5: Math.round(subtotal5 * 100) / 100,
      subtotalSinImpuesto: Math.round(subtotalSinImpuesto * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      iva15: Math.round(iva15 * 100) / 100,
      iva5: Math.round(iva5 * 100) / 100,
      grandTotal,
    };
  }, [purchase.items]);

  // Standardized button style matching sales action buttons (same height, font, padding and alignment)
  const btnPurchaseStyle =
    'w-full h-8 px-2 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition active:scale-95 cursor-pointer whitespace-nowrap select-none';

  if (viewMode === 'table') {
    return (
      <div
        id={`purchase-record-${purchase.id}`}
        className="w-full bg-white rounded-2xl border border-slate-300 overflow-hidden shadow-xs space-y-0"
      >
        {/* Encabezado Principal tipo Factura ERP */}
        <div className="bg-slate-900 text-white p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-black text-sm text-indigo-300 bg-indigo-950/80 px-2.5 py-1 rounded-lg border border-indigo-700/60">
              #{purchase.purchaseNumber}
            </span>

            {/* Badge de Estado del Pedido */}
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${statusStyles.badgeClass}`}>
              {statusStyles.label}
            </span>

            {/* Status Indicator Badges */}
            {isAutoFromSales ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                <Lock className="w-3 h-3 text-amber-700" />
                <span>Auto por Venta</span>
              </span>
            ) : isPending ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-700" />
                <span>Borrador / Pendiente</span>
              </span>
            ) : null}

            {/* Proveedor */}
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 ml-1">
              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                Proveedor: <strong className="text-white font-bold">{purchase.supplierName}</strong>
              </span>
            </span>

            {/* Contacto */}
            {purchase.supplierContact && (
              <span className="text-xs text-slate-400 font-mono">({purchase.supplierContact})</span>
            )}

            {/* Fecha de Compra */}
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 bg-slate-800/90 px-2.5 py-0.5 rounded-lg border border-slate-700/80 shadow-2xs ml-1">
              <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                Fecha: <strong className="text-white font-bold">{new Date(purchase.purchaseDate || purchase.createdAt).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="font-mono font-black text-sm sm:text-base text-emerald-400">
              Total Factura: ${sriBreakdown.grandTotal.toFixed(2)}{' '}
              <span className="text-xs font-bold text-emerald-200">{currency}</span>
            </div>
          </div>
        </div>

        {/* Tabla Horizontal de Productos Tipo Factura ERP */}
        <div className="overflow-x-auto border-t border-b border-slate-200">
          <table className="w-full text-left text-xs text-slate-800 font-sans border-collapse min-w-[700px]">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="p-3 w-10 text-center">#</th>
                <th className="p-3">Producto / Descripción</th>
                <th className="p-3">SKU / Código</th>
                <th className="p-3 text-center">Cant. Pedida</th>
                <th className="p-3 text-center">En Bodega</th>
                <th className="p-3 text-center">Pendiente</th>
                <th className="p-3 text-center">IVA (%)</th>
                <th className="p-3 text-right">Costo Unit.</th>
                <th className="p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {Array.isArray(purchase.items) &&
                purchase.items.map((item, idx) => {
                  const ordered = Number(item.quantity) || 1;
                  const rec = isReceived ? ordered : Number(item.receivedQuantity) || 0;
                  const pending = isReceived ? 0 : Math.max(0, ordered - rec);
                  const unitCost = Number(item.costPrice || 0);
                  const discount = Number(item.discount || 0);
                  const lineSubtotal = Math.max(0, unitCost * ordered - discount);
                  const itemTaxPercent =
                    item.taxPercent !== undefined
                      ? Number(item.taxPercent)
                      : (item as any).purchaseTaxPercent !== undefined
                      ? Number((item as any).purchaseTaxPercent)
                      : (item as any).hasPurchaseTax === false
                      ? 0
                      : 15;

                  return (
                    <tr key={idx} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                      <td className="p-3">
                        <div className="flex items-center space-x-2.5">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-9 h-9 object-cover rounded-lg border border-slate-200 shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 border border-slate-200">
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                          <span className="font-extrabold text-slate-900 text-xs line-clamp-1">{item.name}</span>
                        </div>
                      </td>
                      <td className="p-3 font-mono text-[11px]">
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-bold text-sky-800">
                          {item.sku || '-'}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-slate-900">{ordered} u.</td>
                      <td className="p-3 text-center font-mono font-bold text-emerald-700 bg-emerald-50/60">{rec} u.</td>
                      <td className="p-3 text-center font-mono font-bold text-amber-700 bg-amber-50/60">{pending} u.</td>
                      <td className="p-3 text-center font-mono font-bold">
                        <span
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                            itemTaxPercent === 15
                              ? 'bg-purple-100 text-purple-800 border-purple-200'
                              : itemTaxPercent === 5
                              ? 'bg-blue-100 text-blue-800 border-blue-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {itemTaxPercent}%
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-800">${unitCost.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono font-black text-indigo-700">${lineSubtotal.toFixed(2)}</td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot className="bg-slate-50 font-bold border-t border-slate-300 text-xs">
              <tr>
                <td colSpan={3} className="p-3 text-slate-700">
                  Desglose de Factura: <strong>{purchase.items?.length || 0} ítems</strong> ({totalOrderedCount} unidades en total)
                </td>
                <td className="p-3 text-center font-mono text-slate-900">{totalOrderedCount} u.</td>
                <td className="p-3 text-center font-mono text-emerald-800">{totalReceivedCount} u.</td>
                <td className="p-3 text-center font-mono text-amber-800">{totalPendingCount} u.</td>
                <td colSpan={2} className="p-3 text-right text-slate-600 uppercase font-sans text-[11px]">Total Compra:</td>
                <td className="p-3 text-right font-mono font-black text-sm sm:text-base text-indigo-900">${sriBreakdown.grandTotal.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Desglose de Totales Fiscales SRI Ecuador (Estilo efaccilito) */}
        <div className="bg-slate-50 border-t border-slate-200 p-3 sm:p-4 text-xs">
          <div className="max-w-xs ml-auto space-y-1 font-mono text-[11px]">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal 0%:</span>
              <span className="font-bold text-slate-900">${sriBreakdown.subtotal0.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Subtotal 15%:</span>
              <span className="font-bold text-slate-900">${sriBreakdown.subtotal15.toFixed(2)}</span>
            </div>
            {sriBreakdown.subtotal5 > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Subtotal 5%:</span>
                <span className="font-bold text-slate-900">${sriBreakdown.subtotal5.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-700 font-bold pt-1 border-t border-slate-200">
              <span>Subtotal Sin Impuesto:</span>
              <span className="text-slate-900">${sriBreakdown.subtotalSinImpuesto.toFixed(2)}</span>
            </div>
            {sriBreakdown.totalDiscount > 0 && (
              <div className="flex justify-between text-amber-700 font-bold">
                <span>Total Descuento:</span>
                <span>-${sriBreakdown.totalDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>IVA 15%:</span>
              <span className="font-bold text-slate-900">${sriBreakdown.iva15.toFixed(2)}</span>
            </div>
            {sriBreakdown.iva5 > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>IVA 5%:</span>
                <span className="font-bold text-slate-900">${sriBreakdown.iva5.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-indigo-950 font-black text-xs sm:text-sm pt-1.5 border-t-2 border-indigo-600 bg-indigo-50/80 p-2 rounded-lg mt-1 shadow-2xs">
              <span>TOTAL FACTURA SRI:</span>
              <span>${sriBreakdown.grandTotal.toFixed(2)} {currency}</span>
            </div>
          </div>
        </div>

        {/* Footer Acciones Factura */}
        <div className="p-3 bg-slate-100/90 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {isPending ? (
              isLinkedOrderUnconfirmed ? (
                <button
                  type="button"
                  onClick={() => showToast?.(`⚠️ No se puede confirmar la compra al proveedor: El Pedido de Venta #${linkedOrderNumber} aún no ha sido confirmado.`)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 text-amber-800 border border-amber-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Venta Sin Confirmar</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onConfirmPay(purchase)}
                  disabled={isConfirming}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Confirmar Pago</span>
                </button>
              )
            ) : !isReceived && !isCancelled ? (
              <button
                type="button"
                onClick={() => onReceive(purchase)}
                disabled={isReceiving}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isPartiallyReceived ? 'Recibir Restante' : 'Recibir en Bodega'}</span>
              </button>
            ) : isReceived ? (
              <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                <span>Recibido en Bodega</span>
              </span>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-rose-100 text-rose-900 border border-rose-300 text-xs font-bold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>Cancelado</span>
              </span>
            )}

            {!isPending && !isReceived && !isCancelled && (
              <button
                type="button"
                onClick={() => onPartialReceive(purchase)}
                className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Boxes className="w-3.5 h-3.5 text-amber-600" />
                <span>Recepción Parcial</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onOpenWhatsapp(purchase, 'whatsapp')}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5 fill-current" />
              <span>WhatsApp Proveedor</span>
            </button>

            <button
              type="button"
              onClick={() => onQuickCopyPhotos(purchase)}
              disabled={isCopyingPhotos}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
            >
              {isCopyingPhotos ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Copiando...</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Portadas</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (onOpenPrintA4) {
                  onOpenPrintA4(purchase);
                } else {
                  directPrintOrder({ purchase, storeConfig, currency, showToast });
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              onClick={() => onEditOrDetail(purchase)}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              {isPending && !isAutoFromSales ? <Edit3 className="w-3.5 h-3.5 text-slate-600" /> : <Eye className="w-3.5 h-3.5 text-slate-600" />}
              <span>{isPending && !isAutoFromSales ? 'Editar' : 'Detalle'}</span>
            </button>

            {isPending && !isAutoFromSales && (
              <button
                type="button"
                onClick={() => onDelete(purchase)}
                className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Eliminar</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id={`purchase-record-${purchase.id}`}
      className={`w-full rounded-2xl border transition-all p-3 sm:p-4 shadow-xs ${
        isInGroup
          ? isReceived
            ? 'bg-emerald-50/20 border-emerald-300 border-l-4 border-l-emerald-500'
            : isPartiallyReceived
            ? 'bg-amber-50/25 border-amber-400 border-l-4 border-l-amber-500'
            : isCancelled
            ? 'bg-rose-50/15 border-rose-200 border-l-4 border-l-rose-400'
            : 'bg-white border-slate-200 border-l-4 border-l-indigo-500'
          : statusStyles.cardClass
      }`}
    >
      <div className="flex flex-col md:flex-row items-start gap-3.5 w-full">
        {/* COLUMNA IZQUIERDA: BOTONES DE ACCIÓN UNIFORMES (MISMO TAMAÑO, ORGANIZADOS Y ALINEADOS A LA IZQUIERDA, DISEÑO PARECIDO A VENTAS) */}
        <div className="flex flex-col gap-1.5 w-full md:w-[160px] flex-shrink-0">
          {/* 1. Botón de Estado / Flujo Principal */}
          {isPending ? (
            isLinkedOrderUnconfirmed ? (
              <button
                type="button"
                id={`btn-purchase-confirm-pay-${purchase.id}`}
                onClick={() => {
                  showToast?.(
                    `⚠️ No se puede confirmar la compra al proveedor: El Pedido de Venta #${linkedOrderNumber} aún no ha sido confirmado. Confirma primero el pedido de venta.`
                  );
                }}
                className={`${btnPurchaseStyle} bg-slate-100 hover:bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs`}
                title={`Bloqueado: El Pedido de Venta #${linkedOrderNumber} debe ser confirmado antes de pagar o confirmar la compra al proveedor.`}
              >
                <Lock className="w-3.5 h-3.5 flex-shrink-0 text-amber-600" />
                <span>Venta Sin Confirmar</span>
              </button>
            ) : (
              <button
                type="button"
                id={`btn-purchase-confirm-pay-${purchase.id}`}
                onClick={() => onConfirmPay(purchase)}
                disabled={isConfirming}
                className={`${btnPurchaseStyle} bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white border border-amber-800 shadow-xs`}
                title="Confirmar pago a proveedor"
              >
                <CreditCard className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Confirmar Pago</span>
              </button>
            )
          ) : !isReceived && !isCancelled ? (
            <button
              type="button"
              id={`btn-purchase-receive-stock-${purchase.id}`}
              onClick={() => onReceive(purchase)}
              disabled={isReceiving}
              className={`${btnPurchaseStyle} bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-xs`}
              title={
                isPartiallyReceived
                  ? 'Ingresar todo el saldo restante a bodega'
                  : 'Ingresar productos recibidos a la bodega y stock'
              }
            >
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-white" />
              <span>{isPartiallyReceived ? 'Recibir Restante' : 'Recibir en Bodega'}</span>
            </button>
          ) : isReceived ? (
            <div
              className={`${btnPurchaseStyle} bg-emerald-50 text-emerald-800 border border-emerald-300 cursor-default opacity-95`}
              title="Compra recibida e ingresada a bodega exitosamente"
            >
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-600" />
              <span>Recibido en Bodega</span>
            </div>
          ) : (
            <div
              className={`${btnPurchaseStyle} bg-rose-50 text-rose-700 border border-rose-200 cursor-default opacity-95`}
              title="Orden de compra cancelada"
            >
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-rose-500" />
              <span>Cancelado</span>
            </div>
          )}

          {/* 2. Recepción Parcial (disponible cuando no está pendiente ni recibida ni cancelada) */}
          {!isPending && !isReceived && !isCancelled && (
            <button
              type="button"
              id={`btn-purchase-partial-receive-${purchase.id}`}
              onClick={() => onPartialReceive(purchase)}
              className={`${btnPurchaseStyle} bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300`}
              title="Registrar entregas parciales del proveedor por bultos o guías"
            >
              <Boxes className="w-3.5 h-3.5 flex-shrink-0 text-amber-600" />
              <span>Recepción Parcial</span>
            </button>
          )}

          {/* 3. WhatsApp Proveedor */}
          <button
            type="button"
            id={`btn-purchase-whatsapp-${purchase.id}`}
            onClick={() => onOpenWhatsapp(purchase, 'whatsapp')}
            className={`${btnPurchaseStyle} bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-xs`}
            title="Abrir chat de WhatsApp del proveedor con el detalle de la compra"
          >
            <MessageCircle className="w-3.5 h-3.5 fill-current flex-shrink-0" />
            <span>WhatsApp Proveedor</span>
          </button>

          {/* 4. Copiar Portadas */}
          <button
            type="button"
            id={`btn-purchase-copy-photos-${purchase.id}`}
            onClick={() => onQuickCopyPhotos(purchase)}
            disabled={isCopyingPhotos}
            className={`${btnPurchaseStyle} bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-700 shadow-xs disabled:opacity-50`}
            title="Copiar todas las fotos de portada de los artículos al portapapeles a la vez para pegarlas en WhatsApp (Ctrl+V)"
          >
            {isCopyingPhotos ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                <span>Copiando...</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Copiar Portadas</span>
              </>
            )}
          </button>

          {/* 5. Imprimir Compra */}
          <button
            type="button"
            id={`btn-purchase-print-${purchase.id}`}
            onClick={() => {
              if (onOpenPrintA4) {
                onOpenPrintA4(purchase);
              } else {
                directPrintOrder({
                  purchase,
                  storeConfig,
                  currency,
                  showToast,
                });
              }
            }}
            className={`${btnPurchaseStyle} bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300`}
            title="Imprimir Orden de Compra directamente"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
            <span>Imprimir Compra</span>
          </button>

          {/* 6. Ver Detalle / Editar Compra */}
          <button
            type="button"
            id={`btn-purchase-detail-${purchase.id}`}
            onClick={() => onEditOrDetail(purchase)}
            className={`${btnPurchaseStyle} bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300`}
            title={
              isAutoFromSales
                ? `Ver detalle de la compra (Generada por Pedido #${linkedOrderNumber})`
                : isPending
                ? 'Editar orden de compra (Borrador)'
                : 'Ver detalle de la orden confirmada (Sólo lectura)'
            }
          >
            {isPending && !isAutoFromSales ? (
              <Edit3 className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
            ) : (
              <Eye className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
            )}
            <span>{isPending && !isAutoFromSales ? 'Editar Compra' : 'Ver Detalle'}</span>
          </button>

          {/* 7. Eliminar Compra */}
          {isAutoFromSales ? (
            <div
              className={`${btnPurchaseStyle} bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60`}
              title={`Generada a partir del Pedido de Venta #${linkedOrderNumber}. Ineliminable.`}
            >
              <Lock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span>Ineliminable</span>
            </div>
          ) : isPending ? (
            <button
              type="button"
              id={`btn-purchase-delete-${purchase.id}`}
              onClick={() => onDelete(purchase)}
              className={`${btnPurchaseStyle} bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 hover:border-rose-300`}
              title="Eliminar orden en borrador"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
              <span>Eliminar Compra</span>
            </button>
          ) : (
            <div
              className={`${btnPurchaseStyle} bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60`}
              title="Orden confirmada y pagada: Ineliminable según normas de integridad ERP."
            >
              <Lock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span>Ineliminable</span>
            </div>
          )}
        </div>

        {/* ÁREA PRINCIPAL: VISUALIZACIÓN COMPLETA Y ORGANIZADA DEL REGISTRO */}
        <div className="flex-1 min-w-0 w-full space-y-3">
          {/* 1. Barra Superior del Registro */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2 flex-wrap">
              {/* # Compra con Status Dot */}
              <div
                className={`inline-flex items-center space-x-1.5 border px-2.5 py-0.5 rounded-xl font-mono font-black text-xs sm:text-sm ${statusStyles.numberPill}`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusStyles.statusDot}`} />
                <span>#{purchase.purchaseNumber}</span>
              </div>

              {/* Status Badge */}
              <span
                className={`text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wide border flex items-center gap-1 ${statusStyles.badgeClass}`}
              >
                {statusStyles.label}
              </span>

              {/* Inmutable ERP Lock Badge */}
              {isReceived && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200"
                  title="Orden cerrada e inmutable según normas ERP"
                >
                  <Lock className="w-3 h-3 text-slate-500" />
                  Cerrada / Inmutable
                </span>
              )}

              {/* Payment Status */}
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                  purchase.paymentStatus === 'paid'
                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                {purchase.paymentStatus === 'paid' ? '💳 Pagado' : '⚠️ Por Pagar'}
              </span>

              {/* Proveedor */}
              <span className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-md flex items-center gap-1.5 shadow-2xs max-w-xs truncate" title={`Proveedor: ${purchase.supplierName}`}>
                <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">
                  Proveedor: <strong className="text-slate-900">{purchase.supplierName}</strong>
                </span>
              </span>

              {/* Fecha de Compra */}
              <span className="text-[11px] font-bold text-slate-800 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-md flex items-center gap-1.5 shadow-2xs">
                <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>
                  Fecha: <strong className="text-slate-900">{new Date(purchase.purchaseDate || purchase.createdAt).toLocaleDateString('es-EC', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}</strong>
                </span>
              </span>

              {/* Venta vinculada con Botón "Ver Venta" exclusivo (en compras individuales; en grupos el encabezado ya incluye Ver Venta) */}
              {linkedOrderNumber && (
                !isInGroup ? (
                  <button
                    type="button"
                    id={`btn-purchase-view-sale-${purchase.id}`}
                    onClick={() => onGoToStoreOrders && onGoToStoreOrders(String(linkedOrderNumber))}
                    title={`Ir a ventas y filtrar exclusivamente por el Pedido #${linkedOrderNumber}`}
                    className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-lg cursor-pointer shadow-2xs transition ${
                      isLinkedOrderUnconfirmed
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200'
                    }`}
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Ver Venta #{linkedOrderNumber}</span>
                    {isLinkedOrderUnconfirmed && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200/90 text-amber-950 font-extrabold ml-1">
                        ⚠️ Sin Confirmar
                      </span>
                    )}
                    <ExternalLink className="w-2.5 h-2.5 text-indigo-500 ml-0.5" />
                  </button>
                ) : (
                  <div
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                      isLinkedOrderUnconfirmed
                        ? 'bg-amber-50 text-amber-900 border-amber-300'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <ShoppingBag className="w-3 h-3 text-slate-500" />
                    <span>Pedido #{linkedOrderNumber}</span>
                    {isLinkedOrderUnconfirmed && (
                      <span className="text-[10px] px-1 rounded bg-amber-200 text-amber-950 font-bold ml-0.5">
                        ⚠️ Sin Confirmar
                      </span>
                    )}
                  </div>
                )
              )}
            </div>

            {/* Costo Total & Collapse button */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] text-slate-500 font-medium">Costo Total</div>
                <div className="font-mono font-black text-sm sm:text-base text-slate-900">
                  ${sriBreakdown.grandTotal.toFixed(2)}{' '}
                  <span className="text-[11px] font-semibold text-slate-500">{currency}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Resumen de Unidades (Pedidas, En Bodega, Pendientes) */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-600 font-medium">
              {totalOrderedCount} {totalOrderedCount === 1 ? 'unidad solicitada' : 'unidades solicitadas'} (
              {purchase.items?.length || 0} {purchase.items?.length === 1 ? 'producto' : 'productos'}):
            </span>
            <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-[11px] flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              {totalReceivedCount} en bodega
            </span>
            {totalPendingCount > 0 && (
              <span className="font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 text-[11px] flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-600" />
                {totalPendingCount} pendientes de recepción
              </span>
            )}
          </div>

          {/* 3. LISTA DE PRODUCTOS CON TAMAÑO FIJO DE PANEL Y SCROLL INTERNO (Requirement #1) */}
          <div className="max-h-[220px] overflow-y-auto pr-1 select-text border border-slate-200/80 rounded-xl p-2 bg-slate-50/50 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {Array.isArray(purchase.items) &&
                purchase.items.map((item, idx) => {
                  const ordered = Number(item.quantity) || 1;
                  const rec = isReceived ? ordered : Number(item.receivedQuantity) || 0;
                  const pending = isReceived ? 0 : Math.max(0, ordered - rec);
                  const unitCost = Number(item.costPrice || 0);

                  return (
                    <div
                      key={idx}
                      className="bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 shadow-2xs space-y-1.5"
                    >
                      <div className="flex items-start space-x-2.5">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-10 h-10 object-cover rounded-lg border border-slate-200 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-slate-400 flex-shrink-0 border border-slate-200">
                            <Package className="w-4 h-4" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-xs text-slate-900 truncate" title={item.name}>
                            {item.name}
                          </div>
                          <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 mt-0.5">
                            {item.sku && (
                              <span className="font-mono bg-white px-1 rounded border border-slate-200">
                                SKU: {item.sku}
                              </span>
                            )}
                            {item.barcode && (
                              <span className="font-mono bg-white px-1 rounded border border-slate-200">
                                EAN: {item.barcode}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <div className="text-[9px] text-slate-400">Costo Unit.</div>
                          <div className="font-mono font-bold text-[11px] text-slate-800">
                            ${unitCost.toFixed(2)}
                          </div>
                          <div className="font-mono font-black text-xs text-indigo-700">
                            ${(unitCost * ordered).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Breakdown de Unidades Pedidas, En Bodega y Pendiente */}
                      <div className="pt-1 border-t border-slate-200/60">
                        <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                          <div className="bg-white px-1 py-0.5 rounded border border-slate-200">
                            <span className="text-slate-400 block text-[9px]">Pedidas</span>
                            <span className="font-bold text-slate-800">{ordered}</span>
                          </div>
                          <div className="bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">
                            <span className="text-emerald-600 block text-[9px]">En Bodega</span>
                            <span className="font-bold text-emerald-800">{rec}</span>
                          </div>
                          <div className="bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                            <span className="text-amber-600 block text-[9px]">Pendiente</span>
                            <span className="font-bold text-amber-800">{pending}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* 4. Historial de Entregas y Recepciones (si existen) */}
          {Array.isArray(purchase.receptions) && purchase.receptions.length > 0 && (
            <div className="bg-emerald-50/50 border border-emerald-200/70 rounded-xl p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                <History className="w-3.5 h-3.5 text-emerald-700" />
                <span>Historial de Entregas / Recepciones ({purchase.receptions.length})</span>
              </div>
              <div className="space-y-1.5">
                {purchase.receptions.map((rec, rIdx) => (
                  <div
                    key={rec.id || rIdx}
                    className="bg-white rounded-lg p-2 border border-emerald-100 text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 shadow-2xs"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-emerald-950">
                          Entrega {new Date(rec.date).toLocaleDateString('es-EC')}
                        </span>
                        {rec.shippingGuideNumber && (
                          <span className="font-mono text-[10px] bg-emerald-50 text-emerald-800 px-1.5 rounded border border-emerald-200">
                            Guía: {rec.shippingGuideNumber}
                          </span>
                        )}
                        {rec.receiptVoucher && (
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 rounded border border-slate-200">
                            Doc: {rec.receiptVoucher}
                          </span>
                        )}
                      </div>
                      {rec.notes && <p className="text-[11px] text-slate-500 mt-0.5">{rec.notes}</p>}
                    </div>
                    <div className="text-right text-[11px] text-emerald-900 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                      {Array.isArray(rec.items) &&
                        rec.items.map((it, iIdx) => (
                          <div key={iIdx}>
                            +{it.quantity} un. {it.name}
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. Notas / Instrucciones del Proveedor */}
          {purchase.notes && (
            <div className="bg-amber-50/70 border border-amber-200/70 rounded-xl p-2 text-xs text-amber-900">
              <strong>Notas del Proveedor:</strong> {purchase.notes}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

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
} from 'lucide-react';
import { PurchaseOrder, StoreConfig, CustomerOrder } from '../types.ts';
import { directPrintOrder } from '../utils/directOrderPrint.ts';

interface PurchaseRecordCardProps {
  purchase: PurchaseOrder;
  isInGroup?: boolean;
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

  // Standardized button style matching sales action buttons (same height, font, padding and alignment)
  const btnPurchaseStyle =
    'w-full h-8 px-2 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition active:scale-95 cursor-pointer whitespace-nowrap select-none';

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
            onClick={() =>
              directPrintOrder({
                purchase,
                storeConfig,
                currency,
                showToast,
              })
            }
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
              <span className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-md flex items-center gap-1.5 shadow-2xs">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <span>
                  Proveedor: <strong className="text-slate-900">{purchase.supplierName}</strong>
                </span>
              </span>

              {/* Fecha */}
              <span className="text-[11px] text-slate-500">
                {new Date(purchase.purchaseDate || purchase.createdAt).toLocaleDateString('es-EC', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
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

            {/* Costo Total */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] text-slate-500 font-medium">Costo Total</div>
                <div className="font-mono font-black text-sm sm:text-base text-slate-900">
                  ${Number(purchase.totalCost || 0).toFixed(2)}{' '}
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

          {/* 3. LISTA COMPLETA DE PRODUCTOS (Completamente visible, organizada y legible) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
            {Array.isArray(purchase.items) &&
              purchase.items.map((item, idx) => {
                const ordered = Number(item.quantity) || 1;
                const rec = isReceived ? ordered : Number(item.receivedQuantity) || 0;
                const pending = isReceived ? 0 : Math.max(0, ordered - rec);

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
                        <div className="text-[9px] text-slate-400">Unitario</div>
                        <div className="font-mono font-bold text-[11px] text-slate-800">
                          ${Number(item.costPrice || 0).toFixed(2)}
                        </div>
                        <div className="font-mono font-black text-xs text-indigo-700">
                          ${(Number(item.costPrice || 0) * ordered).toFixed(2)}
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

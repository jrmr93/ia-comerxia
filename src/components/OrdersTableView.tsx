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
        label: 'Pendiente de Pago',
      };
    case 'confirmed':
      return {
        cardBorderClass: 'border-purple-200 border-l-4 border-l-purple-500 bg-purple-50/20',
        orderNumberColor: 'text-purple-950 font-black',
        statusDot: 'bg-purple-500 ring-2 ring-purple-300/60',
        badgeColor: 'bg-purple-100 text-purple-950 border-purple-300 font-bold',
        label: 'Confirmado',
      };
    case 'shipped':
      return {
        cardBorderClass: 'border-sky-200 border-l-4 border-l-sky-500 bg-sky-50/20',
        orderNumberColor: 'text-sky-950 font-black',
        statusDot: 'bg-sky-500 ring-2 ring-sky-300/60',
        badgeColor: 'bg-sky-100 text-sky-950 border-sky-300 font-bold',
        label: 'En Tránsito',
      };
    case 'delivered':
      return {
        cardBorderClass: 'border-emerald-200 border-l-4 border-l-emerald-500 bg-emerald-50/20',
        orderNumberColor: 'text-emerald-950 font-black',
        statusDot: 'bg-emerald-500 ring-2 ring-emerald-300/60',
        badgeColor: 'bg-emerald-100 text-emerald-950 border-emerald-300 font-bold',
        label: 'Entregado',
      };
    case 'cancelled':
      return {
        cardBorderClass: 'border-rose-200 border-l-4 border-l-rose-400 bg-rose-50/15 opacity-90',
        orderNumberColor: 'text-rose-950 font-bold',
        statusDot: 'bg-rose-500 ring-2 ring-rose-300/60',
        badgeColor: 'bg-rose-100 text-rose-950 border-rose-200 font-bold',
        label: 'Cancelado',
      };
    default:
      return {
        cardBorderClass: 'border-slate-200 border-l-4 border-l-slate-400 bg-white',
        orderNumberColor: 'text-slate-900 font-bold',
        statusDot: 'bg-slate-400',
        badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
        label: status || 'Pedido',
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
        const parsedItems = Array.isArray(ord.items)
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

        return (
          <div
            key={ord.id}
            id={index === 0 ? 'orders-first-record' : `order-record-${ord.id}`}
            className={`w-full rounded-2xl border bg-white shadow-xs hover:shadow-sm transition-all p-3 sm:p-4 ${rowStyles.cardBorderClass}`}
          >
            <div className="flex flex-col md:flex-row items-start gap-3.5 w-full">
              {/* COLUMNA IZQUIERDA: LOS 4 BOTONES DE ACCIÓN (MISMO TAMAÑO, ALINEADOS A LA IZQUIERDA) */}
              <div className="flex-shrink-0 w-full md:w-[160px]">
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

              {/* ÁREA PRINCIPAL: TODA LA INFORMACIÓN ORGANIZADA SIN SCROLL HORIZONTAL */}
              <div className="flex-1 min-w-0 w-full space-y-2.5">
                {/* 1. Barra Superior del Registro */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* # Pedido */}
                    <div className="flex items-center space-x-1 font-mono text-xs">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${rowStyles.statusDot}`} />
                      <span className={rowStyles.orderNumberColor}>#{ord.orderNumber}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(ord.orderNumber || '');
                          showToast('✓ Número de orden copiado');
                        }}
                        className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                        title="Copiar número de orden"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Fecha y hora */}
                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Clock className={`w-3 h-3 ${isPending ? 'text-amber-600 animate-pulse' : 'text-slate-400'}`} />
                      <span>
                        {ord.createdAt
                          ? new Date(ord.createdAt).toLocaleDateString('es-EC', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Reciente'}
                      </span>
                    </div>

                    {/* Badge de Estado Comercial */}
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border uppercase ${rowStyles.badgeColor}`}>
                      {rowStyles.label}
                    </span>

                    {/* Modalidad de Entrega */}
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        isPickup
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-sky-50 text-sky-800 border border-sky-200'
                      }`}
                    >
                      {isPickup ? <Building2 className="w-3 h-3 text-amber-600" /> : <Truck className="w-3 h-3 text-sky-600" />}
                      {isPickup ? 'Retiro en Local' : 'Envío a Domicilio'}
                    </span>

                    {/* Botón "Ver Compra" exclusivo (con la misma ubicación y estilo que "Ver Venta" en compras) */}
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
                      className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-lg cursor-pointer shadow-2xs transition ${
                        isLinkedPurchasePending
                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200'
                      }`}
                    >
                      <Truck className="w-3.5 h-3.5 text-indigo-600" />
                      <span>
                        {linkedPurchasesForOrder.length > 1
                          ? `Ver Compras (${linkedPurchasesForOrder.length})`
                          : linkedPurchasesForOrder.length === 1
                          ? `Ver Compra #${linkedPurchasesForOrder[0].purchaseNumber || linkedPurchasesForOrder[0].id}`
                          : `Ver Compra`}
                      </span>
                      {isLinkedPurchasePending && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200/90 text-amber-950 font-extrabold ml-1">
                          ⏳ Pendiente
                        </span>
                      )}
                      <ExternalLink className="w-2.5 h-2.5 text-indigo-500 ml-0.5" />
                    </button>
                  </div>

                  {/* Total destacado */}
                  <div className="flex items-baseline gap-1 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
                    <span className="text-[11px] text-emerald-800 font-semibold">Total:</span>
                    <span className="font-mono font-black text-sm text-emerald-800">
                      ${Number(ord.totalAmount || 0).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-emerald-700 font-bold">{currency}</span>
                  </div>
                </div>

                {/* 2. Grilla de Información Completa sin scroll horizontal */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                  {/* Bloque 1: Cliente & Contacto */}
                  <div className="p-2 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Cliente y Contacto
                    </span>
                    <p className="font-bold text-slate-900 truncate" title={ord.customerName}>
                      {ord.customerName || 'Cliente'}
                    </p>
                    {customerCi && (
                      <div className="flex items-center gap-1 text-[11px]">
                        <span className="text-slate-500 font-bold text-[10px]">CI:</span>
                        <span className="font-mono text-slate-700 bg-white px-1.5 py-0.2 rounded border border-slate-200 text-[10px]">
                          {customerCi}
                        </span>
                      </div>
                    )}
                    {normPhone.whatsappDigits && normPhone.isValid ? (
                      <div className="flex items-center gap-1 text-[11px] text-slate-600 font-mono">
                        <span>{normPhone.formattedLocal || ord.customerPhone}</span>
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
                    ) : (
                      <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded inline-block">
                        Sin teléfono
                      </span>
                    )}
                  </div>

                  {/* Bloque 2: Productos & Abastecimiento */}
                  <div className="p-2 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Productos ({itemsCount} un.)
                    </span>
                    <p className="text-[11px] text-slate-700 line-clamp-2" title={productsSummary}>
                      {productsSummary}
                    </p>
                    {/* Indicador informativo de existencias o compra a proveedor */}
                    {ord.fulfillmentStatus === 'partial_ready' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-900 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded-md">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                        <span>¡Saldo en Bodega! ({totalPendingUnits} un.)</span>
                      </span>
                    ) : ord.fulfillmentStatus === 'partial_delivered' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-900 bg-sky-50 border border-sky-300 px-1.5 py-0.5 rounded-md">
                        <Package className="w-3 h-3 text-sky-600 flex-shrink-0" />
                        <span>Despachado: {totalDeliveredUnits}/{totalOrderedUnits} un.</span>
                      </span>
                    ) : ord.fulfillmentStatus === 'supplier_pending' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-900 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded-md">
                        <AlertCircle className="w-3 h-3 text-amber-600 flex-shrink-0" />
                        <span>Sin Stock (Bajo Pedido)</span>
                      </span>
                    ) : ord.fulfillmentStatus === 'supplier_ordered' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-md">
                        <Truck className="w-3 h-3 text-indigo-600 flex-shrink-0" />
                        <span>
                          {linkedPurchasesForOrder.length > 0
                            ? `Compra #${linkedPurchasesForOrder.map((lp: any) => lp.purchaseNumber).join(', ')} en camino`
                            : `Compra #${ord.linkedPurchaseNumber || ord.linkedPurchaseId || ''} en camino`}
                        </span>
                      </span>
                    ) : ord.fulfillmentStatus === 'supplier_received' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-900 bg-emerald-50 border border-emerald-300 px-1.5 py-0.5 rounded-md">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                        <span>Recibido de Proveedor</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                        📦 Stock disponible
                      </span>
                    )}
                  </div>

                  {/* Bloque 3: Entrega & Guía */}
                  <div className="p-2 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Modalidad / Dirección
                    </span>
                    <p className="text-[11px] text-slate-700 line-clamp-2" title={cleanAddress}>
                      {isPickup ? 'Retiro en tienda física' : cleanAddress || 'Dirección de envío'}
                    </p>
                    {(ord.trackingNumber || ord.trackingCarrier) && (
                      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-medium">
                        <Truck className="w-3 h-3 text-blue-600 flex-shrink-0" />
                        <span>{ord.trackingCarrier || 'Guía'}: #{ord.trackingNumber}</span>
                      </div>
                    )}
                  </div>

                  {/* Bloque 4: Método de Pago & Comprobante */}
                  <div className="p-2 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Pago & Comprobante
                    </span>
                    <div>
                      {renderPaymentBadge(ord.paymentMethod, paymentPartners, ord.status)}
                    </div>
                    {ord.paymentVoucher ? (
                      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-mono font-bold">
                        <CheckCircle2 className="w-2.5 h-2.5 text-purple-600" />
                        <span>Voucher: {ord.paymentVoucher}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[10px]">Sin comprobante registrado</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

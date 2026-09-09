import React from 'react';
import {
  CheckCircle2,
  Clock,
  Truck,
  PackageCheck,
  MessageCircle,
  Receipt,
  Printer,
  Trash2,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { normalizeEcuadorPhone } from '../utils/phone.ts';
import {
  isShippingDeliveryOrder,
  isPickupDeliveryOrder,
  isOrderWaitingForWarehouseProducts,
  isOrderConfirmed,
} from '../utils/orderUtils.ts';
import { directPrintOrder } from '../utils/directOrderPrint.ts';

export interface OrderActionButtonsProps {
  order: any;
  inventoryItems?: any[];
  purchases?: any[];
  onViewLinkedPurchase?: (purchaseIdOrFilter: number | string, orderNumber?: string) => void;
  storeConfig?: {
    storeName?: string;
    currency?: string;
    logoUrl?: string | null;
  };
  currency?: string;
  onOpenEditOrder: (order: any) => void;
  onOpenConfirmVoucher: (order: any) => void;
  onOpenShipOrder?: (order: any) => void;
  onOpenShippingCost?: (order: any) => void;
  onOpenPendingShipping?: (order: any) => void;
  onOpenPrintShippingTicket?: (order: any) => void;
  onOpenPrintA4Order?: (order: any) => void;
  onOpenRequestShippingData?: (order: any) => void;
  onOpenPartialDelivery?: (order: any) => void;
  onCompleteRemainingDelivery?: (order: any) => void | Promise<void>;
  onOpenCancelOrder?: (order: any) => void;
  onOpenDeliverOrder?: (order: any) => void;
  onUpdateStatus?: (
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
}

export const OrderActionButtons: React.FC<OrderActionButtonsProps> = ({
  order: ord,
  inventoryItems = [],
  purchases = [],
  onViewLinkedPurchase,
  storeConfig,
  currency = '$',
  onOpenConfirmVoucher,
  onOpenPendingShipping,
  onOpenEditOrder,
  onOpenShipOrder,
  onOpenDeliverOrder,
  onOpenPrintA4Order,
  onUpdateStatus,
  onDeleteOrder,
  showToast,
  buildWhatsAppLink,
}) => {
  const status = String(ord.status || 'pending').toLowerCase().trim();
  const isPending = status === 'pending';
  const isConfirmed = status === 'confirmed';
  const isShipped = status === 'shipped';
  const isDelivered = status === 'delivered';
  const isCancelled = status === 'cancelled';
  const isPastConfirmation = isConfirmed || isShipped || isDelivered;

  const isShipping = isShippingDeliveryOrder(ord);
  const isPickup = isPickupDeliveryOrder(ord);

  // Comprobar si el pedido está esperando que los productos entren a bodega por compra a proveedor
  const warehouseCheck = isOrderWaitingForWarehouseProducts(ord, inventoryItems, purchases);
  const isWaitingForWarehouse = isConfirmed && warehouseCheck.isWaiting;

  // Comprobar si el pedido tiene número de guía ingresado
  const hasTrackingNumber = Boolean(ord.trackingNumber && String(ord.trackingNumber).trim().length > 0);

  // 1. Manejo de la acción dinámica del Botón 1 (Ciclo de Confirmación, Bodega, Guía y Entrega)
  const handlePrimaryAction = () => {
    // 1. Estado Pendiente -> Confirmar Pedido
    if (isPending) {
      if (onOpenPendingShipping) {
        onOpenPendingShipping(ord);
      } else if (onOpenConfirmVoucher) {
        onOpenConfirmVoucher(ord);
      } else if (onOpenEditOrder) {
        onOpenEditOrder(ord);
      }
      return;
    }

    // 2. Si ya está confirmado pero esperando productos en bodega de compra a proveedor
    if (isWaitingForWarehouse) {
      if (warehouseCheck.linkedPurchases.length > 0 && onViewLinkedPurchase) {
        const lp = warehouseCheck.linkedPurchases[0];
        showToast(
          `⏳ Esperando ingreso a bodega: La orden de compra #${lp.purchaseNumber || lp.id} debe recibirse en Compras.`
        );
        onViewLinkedPurchase(lp.id);
      } else {
        showToast(
          warehouseCheck.reason ||
            '⏳ Esperando ingreso a bodega: Los productos de este pedido deben ser recibidos del proveedor en Compras antes de poder despachar o entregar.'
        );
      }
      return;
    }

    // 3. Si es con envío y aún no se ha ingresado el número de guía
    if (isShipping && !hasTrackingNumber && !isShipped && !isDelivered) {
      if (onOpenShipOrder) {
        onOpenShipOrder(ord);
      } else if (onOpenPendingShipping) {
        onOpenPendingShipping(ord);
      } else {
        showToast('🚚 Ingresa los datos del transportista y número de guía de envío.');
      }
      return;
    }

    // 4. Si los productos ya están en bodega (sea retiro en local o envío con guía despachada)
    if (!isDelivered && (isPickup || (isShipping && (hasTrackingNumber || isShipped)))) {
      if (onOpenDeliverOrder) {
        onOpenDeliverOrder(ord);
      } else if (onUpdateStatus) {
        onUpdateStatus(ord.id, 'delivered');
      }
      return;
    }

    // 5. Si ya está entregado
    if (isDelivered) {
      showToast('✓ Este pedido ya fue entregado y completado exitosamente.');
      return;
    }

    // Caso de orden cancelada
    if (isCancelled) {
      showToast('⚠️ Este pedido se encuentra anulado/cancelado.');
      return;
    }
  };

  // 2. Abrir chat con cliente
  const handleOpenDirectWhatsApp = () => {
    const norm = normalizeEcuadorPhone(ord.customerPhone);
    if (!norm.whatsappDigits || !norm.isValid) {
      showToast('⚠️ Este pedido no tiene registrado un número de WhatsApp válido.');
      if (onOpenConfirmVoucher) {
        onOpenConfirmVoucher(ord);
      }
      return;
    }
    const url = buildWhatsAppLink(norm.whatsappDigits);
    window.open(url, '_blank');
  };

  // 3. Facturar (sin acción por ahora, para futura implementación)
  const handleFacturar = () => {
    showToast('ℹ️ Módulo de facturación: Acción reservada para futura implementación.');
  };

  // 4. Imprimir Pedido (Siempre imprime sin importar el estado del pedido)
  const handlePrintOrder = () => {
    if (onOpenPrintA4Order) {
      onOpenPrintA4Order(ord);
    } else {
      directPrintOrder({
        order: ord,
        storeConfig,
        currency,
        showToast,
      });
    }
  };

  // 5. Eliminar pedido
  const handleDeleteOrder = () => {
    if (isPastConfirmation) {
      showToast('🔒 Integridad ERP: Los pedidos confirmados o entregados no se pueden eliminar.');
      return;
    }
    onDeleteOrder(ord);
  };

  // Botones de idéntico tamaño y diseño uniforme
  const btnStyle =
    'w-full h-8 px-2 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition active:scale-95 cursor-pointer whitespace-nowrap select-none';

  // Configuración dinámica del Botón 1 según el ciclo de vida del pedido
  let primaryBtnConfig = {
    label: 'Confirmar Pedido',
    className: 'bg-purple-700 hover:bg-purple-800 text-white border border-purple-800 shadow-xs',
    icon: <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-purple-200" />,
    title: 'Confirmar Pedido: Validar datos, comprobante y confirmar venta',
  };

  if (isPending) {
    primaryBtnConfig = {
      label: 'Confirmar Pedido',
      className: 'bg-purple-700 hover:bg-purple-800 text-white border border-purple-800 shadow-xs',
      icon: <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-purple-200" />,
      title: 'Confirmar Pedido: Validar datos, comprobante y confirmar venta',
    };
  } else if (isWaitingForWarehouse) {
    // Confirmado pero esperando que los productos entren a bodega por pedido a proveedor
    primaryBtnConfig = {
      label: 'Esperando en bodega',
      className: 'bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 shadow-2xs font-extrabold',
      icon: <Clock className="w-3.5 h-3.5 flex-shrink-0 text-amber-700 animate-pulse" />,
      title: 'Esperando que los productos entren a bodega por parte del pedido a proveedor para ser entregados o enviados',
    };
  } else if (isShipping && !hasTrackingNumber && !isShipped && !isDelivered) {
    // Con envío: productos en bodega pero falta ingresar número de guía de envío
    primaryBtnConfig = {
      label: 'Ingresar guía de envío',
      className: 'bg-sky-600 hover:bg-sky-700 text-white border border-sky-700 shadow-xs',
      icon: <Truck className="w-3.5 h-3.5 flex-shrink-0 text-white" />,
      title: 'Ingresar número de guía de envío y despachar pedido',
    };
  } else if (!isDelivered && (isPickup || (isShipping && (hasTrackingNumber || isShipped)))) {
    // Retiro en local o envío ya con guía despachada: listo para registrar entrega
    primaryBtnConfig = {
      label: 'Entregar Pedido',
      className: 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-xs',
      icon: <PackageCheck className="w-3.5 h-3.5 flex-shrink-0 text-white" />,
      title: 'Verificar y registrar entrega final del pedido al cliente',
    };
  } else if (isDelivered) {
    // Entregado y cerrado
    primaryBtnConfig = {
      label: 'Entregado',
      className: 'bg-emerald-50 text-emerald-800 border border-emerald-300 cursor-default opacity-95',
      icon: <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-600" />,
      title: 'Pedido entregado y completado exitosamente',
    };
  } else if (isCancelled) {
    primaryBtnConfig = {
      label: 'Cancelado',
      className: 'bg-rose-50 text-rose-700 border border-rose-200 cursor-default opacity-95',
      icon: <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-rose-500" />,
      title: 'Pedido cancelado',
    };
  }

  return (
    <div className="flex flex-col gap-1.5 w-full md:w-[160px] flex-shrink-0">
      {/* 1. Botón Principal Dinámico (Confirmar Pedido -> Esperando en bodega -> Ingresar guía / Entregar Pedido -> Entregado) */}
      <button
        type="button"
        id={`btn-primary-action-${ord.id}`}
        onClick={handlePrimaryAction}
        className={`${btnStyle} ${primaryBtnConfig.className}`}
        title={primaryBtnConfig.title}
      >
        {primaryBtnConfig.icon}
        <span>{primaryBtnConfig.label}</span>
      </button>

      {/* 2. Abrir chat con cliente */}
      <button
        type="button"
        id={`btn-chat-client-${ord.id}`}
        onClick={handleOpenDirectWhatsApp}
        className={`${btnStyle} bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-xs`}
        title="Abrir chat de WhatsApp con el cliente"
      >
        <MessageCircle className="w-3.5 h-3.5 fill-current flex-shrink-0" />
        <span>Abrir chat con cliente</span>
      </button>

      {/* 3. Facturar */}
      <button
        type="button"
        id={`btn-invoice-order-${ord.id}`}
        onClick={handleFacturar}
        className={`${btnStyle} bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300`}
        title="Facturar pedido (Para futura implementación)"
      >
        <Receipt className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
        <span>Facturar</span>
      </button>

      {/* 4. Imprimir Pedido (SIEMPRE visible sin importar el estado del pedido, ubicado debajo de Facturar) */}
      <button
        type="button"
        id={`btn-print-order-${ord.id}`}
        onClick={handlePrintOrder}
        className={`${btnStyle} bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300`}
        title="Imprimir pedido"
      >
        <Printer className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
        <span>Imprimir Pedido</span>
      </button>

      {/* 5. Eliminar pedido */}
      <button
        type="button"
        id={`btn-delete-order-${ord.id}`}
        disabled={isPastConfirmation}
        onClick={handleDeleteOrder}
        className={`${btnStyle} ${
          isPastConfirmation
            ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
            : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 hover:border-rose-300'
        }`}
        title={isPastConfirmation ? '🔒 No se puede eliminar: Pedido confirmado o entregado' : 'Eliminar pedido'}
      >
        {isPastConfirmation ? (
          <Lock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        ) : (
          <Trash2 className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
        )}
        <span>Eliminar pedido</span>
      </button>
    </div>
  );
};


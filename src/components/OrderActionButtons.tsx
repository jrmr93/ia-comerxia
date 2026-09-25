import React, { useState, useEffect } from 'react';
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
  Loader2,
  BadgeCheck,
  X,
  Download,
} from 'lucide-react';
import { normalizeEcuadorPhone } from '../utils/phone.ts';
import {
  isShippingDeliveryOrder,
  isPickupDeliveryOrder,
  isOrderWaitingForWarehouseProducts,
  isOrderConfirmed,
  getOrderDeletionBlockReason,
  canOrderBeAnnulled,
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
  ) => Promise<any>;
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
  const deletionBlockReason = getOrderDeletionBlockReason(ord);

  const isShipping = isShippingDeliveryOrder(ord);
  const isPickup = isPickupDeliveryOrder(ord);

  // Comprobar si el pedido está esperando que los productos entren a bodega por compra a proveedor
  const warehouseCheck = isOrderWaitingForWarehouseProducts(ord, inventoryItems, purchases);
  const isWaitingForWarehouse = isConfirmed && warehouseCheck.isWaiting;

  // Comprobar si el pedido tiene número de guía ingresado
  const hasTrackingNumber = Boolean(ord.trackingNumber && String(ord.trackingNumber).trim().length > 0);

  // Facturación Electrónica SRI State & Modals
  const [sriEmitting, setSriEmitting] = useState(false);
  const [sriInvoiceRecord, setSriInvoiceRecord] = useState<any | null>(null);
  const [showSriConfirmModal, setShowSriConfirmModal] = useState(false);
  const [showSriResultModal, setShowSriResultModal] = useState(false);
  const [sriEmissionResultData, setSriEmissionResultData] = useState<{
    autorizado: boolean;
    estado: string;
    motivo?: string;
    secuencial?: string;
    claveAcceso?: string;
    invoiceId?: number | string;
    emisorUsado?: any;
  } | null>(null);

  // Annulment Modal State
  const [showAnnulModal, setShowAnnulModal] = useState(false);
  const [annulReason, setAnnulReason] = useState('');
  const [isAnnulling, setIsAnnulling] = useState(false);

  const handleConfirmAnnulOrder = async () => {
    setIsAnnulling(true);
    try {
      const reasonText = annulReason.trim()
        ? `[ANULACIÓN VENTA] Motivo: ${annulReason.trim()}`
        : '[ANULACIÓN VENTA] Anulación explícita del pedido por administración.';
      const updatedNotes = (ord.notes ? ord.notes + '\n' : '') + reasonText;
      if (onUpdateStatus) {
        const ok = await onUpdateStatus(ord.id, 'cancelled', undefined, updatedNotes);
        if (ok === false) {
          throw new Error('No se pudo anular la venta en el servidor.');
        }
      }
      showToast(`✓ Venta #${ord.orderNumber || ord.id} anulada correctamente. Stock devuelto a bodega.`);
      setShowAnnulModal(false);
      setAnnulReason('');
    } catch (err: any) {
      showToast(`❌ Error al anular la venta: ${err?.message || 'Error desconocido'}`);
    } finally {
      setIsAnnulling(false);
    }
  };

  useEffect(() => {
    if (ord && ord.id) {
      fetch('/api/sri/facturas')
        .then((res) => res.json())
        .then((data) => {
          if (data.invoices) {
            const match = data.invoices.find((inv: any) => inv.orderId === ord.id && (inv.estadoAutorizacion === 'AUTORIZADO' || inv.estadoAutorizacion === 'SIMULADO_OK'));
            setSriInvoiceRecord(match || null);
          }
        })
        .catch(() => {});
    }
  }, [ord?.id]);

  const handleStartSriInvoice = () => {
    if (isCancelled) {
      showToast('🔒 Venta anulada: No se permiten acciones de facturación SRI.');
      return;
    }
    if (!isPastConfirmation) {
      showToast('🔒 Facturación SRI disponible solo para ventas confirmadas.');
      return;
    }
    setShowSriConfirmModal(true);
  };

  const handleConfirmAndEmitSriInvoice = async () => {
    if (isCancelled) {
      showToast('🔒 Venta anulada: No se permiten acciones de facturación SRI.');
      return;
    }
    setSriEmitting(true);
    try {
      const res = await fetch(`/api/sri/emitir/${ord.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceSimulated: false }),
      });
      const data = await res.json();
      const isAuth = Boolean(data.success || data.autorizado || data.estado === 'AUTORIZADO');
      if (data.invoice && isAuth) {
        setSriInvoiceRecord(data.invoice);
      }
      const resultObj = {
        autorizado: isAuth,
        estado: data.estado || (isAuth ? 'AUTORIZADO' : 'DEVUELTO'),
        motivo: data.motivo || data.error || '',
        secuencial: data.invoice?.secuencial || data.secuencial || '',
        claveAcceso: data.invoice?.claveAcceso || data.claveAcceso || '',
        invoiceId: data.invoice?.id || sriInvoiceRecord?.id,
        emisorUsado: data.emisorUsado,
      };

      setSriEmissionResultData(resultObj);
      setShowSriConfirmModal(false);
      setShowSriResultModal(true);

      if (isAuth) {
        showToast(`✓ Factura Electrónica SRI #${resultObj.secuencial} AUTORIZADA exitosamente`);
      } else {
        const errorMsg = resultObj.motivo || 'Factura DEVUELTA por el SRI';
        showToast(`❌ Factura SRI DEVUELTA: ${errorMsg}`);
      }
    } catch (err: any) {
      console.error('Error emitting SRI invoice:', err);
      setSriEmissionResultData({
        autorizado: false,
        estado: 'ERROR DE CONEXION',
        motivo: err.message || 'Error al conectar con los servidores del SRI de Ecuador',
      });
      setShowSriConfirmModal(false);
      setShowSriResultModal(true);
      showToast('⚠️ Error de conexión al comunicarse con el SRI');
    } finally {
      setSriEmitting(false);
    }
  };

  // 1. Manejo de la acción dinámica del Botón 1 (Ciclo de Confirmación, Bodega, Guía y Entrega)
  const handlePrimaryAction = () => {
    if (isCancelled) {
      showToast('🔒 Venta anulada: No se permiten acciones sobre pedidos anulados.');
      return;
    }

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
  };

  // 2. Abrir chat con cliente
  const handleOpenDirectWhatsApp = () => {
    if (isCancelled) {
      showToast('🔒 Venta anulada: Chat con cliente inhabilitado para pedidos anulados.');
      return;
    }
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

  // 3. Imprimir Pedido
  const handlePrintOrder = () => {
    if (isCancelled) {
      showToast('🔒 Venta anulada: Impresión inhabilitada para ventas anuladas.');
      return;
    }
    if (onOpenPrintA4Order) {
      onOpenPrintA4Order(ord);
    } else {
      directPrintOrder({
        order: ord,
        inventoryItems,
        storeConfig,
        currency,
        showToast,
      });
    }
  };

  // 4. Eliminar pedido
  const handleDeleteOrder = () => {
    if (deletionBlockReason) {
      showToast(`🔒 ${deletionBlockReason}`);
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

  if (isCancelled) {
    primaryBtnConfig = {
      label: 'Venta Anulada',
      className: 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60 font-bold',
      icon: <Lock className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />,
      title: '🔒 Venta anulada: Sin acciones operativas disponibles',
    };
  } else if (isPending) {
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
  }

  return (
    <div className="flex flex-col gap-1.5 w-full md:w-[160px] flex-shrink-0">
      {/* 1. Botón Principal Dinámico (Confirmar Pedido -> Esperando en bodega -> Ingresar guía / Entregar Pedido -> Entregado / Venta Anulada) */}
      <button
        type="button"
        id={`btn-primary-action-${ord.id}`}
        disabled={isCancelled}
        onClick={handlePrimaryAction}
        className={`${btnStyle} ${primaryBtnConfig.className}`}
        title={primaryBtnConfig.title}
      >
        {primaryBtnConfig.icon}
        <span>{primaryBtnConfig.label}</span>
      </button>

      {/* 2. Facturar en SRI (Ubicado SOBRE Abrir chat con cliente e Imprimir Venta) */}
      {sriInvoiceRecord ? (
        <button
          type="button"
          disabled={isCancelled}
          onClick={() => {
            if (isCancelled) {
              showToast('🔒 Venta anulada: No se permiten acciones SRI.');
              return;
            }
            setSriEmissionResultData({
              autorizado: true,
              estado: 'AUTORIZADO',
              secuencial: sriInvoiceRecord.secuencial,
              claveAcceso: sriInvoiceRecord.claveAcceso,
              invoiceId: sriInvoiceRecord.id,
            });
            setShowSriResultModal(true);
          }}
          className={`${btnStyle} ${
            isCancelled
              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
              : 'bg-sky-700 hover:bg-sky-800 text-white border border-sky-800 shadow-xs'
          }`}
          title={isCancelled ? '🔒 Venta anulada: Facturación SRI inhabilitada' : `Ver e imprimir RIDE oficial de la Factura SRI #${sriInvoiceRecord.secuencial}`}
        >
          {isCancelled ? <Lock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /> : <Receipt className="w-3.5 h-3.5 text-sky-200 flex-shrink-0" />}
          <span>RIDE SRI #{sriInvoiceRecord.secuencial}</span>
        </button>
      ) : (
        <button
          type="button"
          id={`btn-sri-invoice-${ord.id}`}
          disabled={!isPastConfirmation || sriEmitting || isCancelled}
          onClick={handleStartSriInvoice}
          className={`${btnStyle} ${
            !isPastConfirmation || isCancelled
              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
              : 'bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white border border-sky-700 shadow-xs'
          }`}
          title={
            isCancelled
              ? '🔒 Venta anulada: Facturación SRI inhabilitada'
              : !isPastConfirmation
              ? 'Facturación SRI disponible solo para ventas confirmadas'
              : 'Emitir y firmar Factura Electrónica oficialmente en el SRI'
          }
        >
          {isCancelled ? (
            <Lock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          ) : sriEmitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-200 flex-shrink-0" />
              <span>Firmando SRI...</span>
            </>
          ) : (
            <>
              <Receipt className="w-3.5 h-3.5 text-sky-200 flex-shrink-0" />
              <span>Facturar en SRI</span>
            </>
          )}
        </button>
      )}

      {/* 3. Abrir chat con cliente */}
      <button
        type="button"
        id={`btn-chat-client-${ord.id}`}
        disabled={isCancelled}
        onClick={handleOpenDirectWhatsApp}
        className={`${btnStyle} ${
          isCancelled
            ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
            : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-xs'
        }`}
        title={isCancelled ? '🔒 Venta anulada: Chat con cliente inhabilitado' : 'Abrir chat de WhatsApp con el cliente'}
      >
        {isCancelled ? (
          <Lock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        ) : (
          <MessageCircle className="w-3.5 h-3.5 fill-current flex-shrink-0" />
        )}
        <span>Abrir chat con cliente</span>
      </button>

      {/* 4. Imprimir Pedido */}
      <button
        type="button"
        id={`btn-print-order-${ord.id}`}
        disabled={isCancelled}
        onClick={handlePrintOrder}
        className={`${btnStyle} ${
          isCancelled
            ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
        }`}
        title={isCancelled ? '🔒 Venta anulada: Impresión inhabilitada' : 'Imprimir prefactura'}
      >
        {isCancelled ? (
          <Lock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        ) : (
          <Printer className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
        )}
        <span>Imprimir Prefactura</span>
      </button>

      {/* 5. Anular Venta (disponible únicamente cuando la venta está confirmada o entregada) */}
      {canOrderBeAnnulled(ord) && (
        <button
          type="button"
          id={`btn-annul-order-${ord.id}`}
          onClick={() => setShowAnnulModal(true)}
          className={`${btnStyle} bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 hover:border-amber-400`}
          title="Anular venta: restituye el stock a la bodega (+1) y revierte los ingresos en tesorería"
        >
          <X className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
          <span>Anular Venta</span>
        </button>
      )}

      {/* 6. Eliminar pedido */}
      <button
        type="button"
        id={`btn-delete-order-${ord.id}`}
        disabled={Boolean(deletionBlockReason)}
        onClick={handleDeleteOrder}
        className={`${btnStyle} ${
          deletionBlockReason
            ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
            : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 hover:border-rose-300'
        }`}
        title={deletionBlockReason || 'Eliminar pedido'}
      >
        {deletionBlockReason ? (
          <Lock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        ) : (
          <Trash2 className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
        )}
        <span>Eliminar pedido</span>
      </button>

      {/* ================= MODAL UI 1: CONFIRMACIÓN DE EMISIÓN SRI ================= */}
      {showSriConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200 my-auto text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 border border-purple-200 text-purple-700 flex items-center justify-center shrink-0">
                  <BadgeCheck className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 tracking-tight">
                    Confirmar Facturación SRI
                  </h3>
                  <p className="text-[11px] text-slate-500">SRI Ecuador • Emisión Electrónica Directa</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSriConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Datos del Pedido a Facturar */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between items-center text-slate-700">
                <span className="font-bold">N° Pedido:</span>
                <span className="font-mono font-bold text-slate-900">#{ord.orderNumber || ord.id}</span>
              </div>
              <div className="flex justify-between items-center text-slate-700">
                <span className="font-bold">Cliente:</span>
                <span className="font-medium text-slate-900 truncate max-w-[200px]">{ord.customerName || 'Cliente'}</span>
              </div>
              <div className="flex justify-between items-center text-slate-700">
                <span className="font-bold">Cédula / RUC:</span>
                <span className="font-mono font-bold text-slate-900">{ord.customerCi || ord.ci || 'Consumidor Final'}</span>
              </div>
              <div className="flex justify-between items-center text-purple-950 pt-1.5 border-t border-slate-200">
                <span className="font-bold">Total a Facturar:</span>
                <span className="font-mono font-extrabold text-sm text-purple-700">${Number(ord.totalAmount || 0).toFixed(2)} USD</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>¿Estás seguro de emitir esta factura?</span>
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Al confirmar, se generará la firma electrónica legal y se transmitirá oficialmente el comprobante tributario al Servicio de Rentas Internas (SRI).
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={sriEmitting}
                onClick={() => setShowSriConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={sriEmitting}
                onClick={handleConfirmAndEmitSriInvoice}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 disabled:opacity-50 text-white text-xs font-black transition cursor-pointer shadow-md flex items-center gap-2"
              >
                {sriEmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Transmitiendo a SRI...</span>
                  </>
                ) : (
                  <>
                    <Receipt className="w-4 h-4 text-white" />
                    <span>Sí, Emitir Factura en SRI</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL UI 2: RESULTADO DE EMISIÓN SRI ================= */}
      {showSriResultModal && sriEmissionResultData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200 my-auto text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                  sriEmissionResultData.autorizado
                    ? 'bg-emerald-100 border-emerald-200 text-emerald-700'
                    : 'bg-rose-100 border-rose-200 text-rose-700'
                }`}>
                  {sriEmissionResultData.autorizado ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-600" />
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 tracking-tight">
                    Resultado de Emisión SRI
                  </h3>
                  <p className="text-[11px] text-slate-500">Servicio de Rentas Internas de Ecuador</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSriResultModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {sriEmissionResultData.autorizado ? (
              <div className="p-4 rounded-xl bg-emerald-950 text-white border border-emerald-500/50 space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="font-black text-sm text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ✓ AUTORIZADO EN EL SRI
                  </span>
                  {sriEmissionResultData.secuencial && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900 border border-emerald-600 text-emerald-200 font-bold">
                      Secuencial #{sriEmissionResultData.secuencial}
                    </span>
                  )}
                </div>

                {sriEmissionResultData.claveAcceso && (
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-emerald-800 text-[11px] font-mono space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Clave de Acceso SRI:</span>
                    <p className="text-emerald-300 break-all select-all leading-tight">{sriEmissionResultData.claveAcceso}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={`/api/sri/facturas/${sriEmissionResultData.invoiceId || sriInvoiceRecord?.id}/ride`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm"
                  >
                    <Printer className="w-4 h-4 text-emerald-200" />
                    <span>Ver / Imprimir RIDE (PDF)</span>
                  </a>
                  {sriEmissionResultData.invoiceId && (
                    <a
                      href={`/api/sri/facturas/${sriEmissionResultData.invoiceId}/xml`}
                      download={`Factura_${sriEmissionResultData.claveAcceso || 'SRI'}.xml`}
                      className="py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm"
                    >
                      <Download className="w-4 h-4" />
                      <span>XML</span>
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-rose-950 text-white border border-rose-500/50 space-y-2.5 shadow-md">
                <div className="font-black text-sm text-rose-400 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  <span>❌ DEVUELTO / NO AUTORIZADO POR EL SRI</span>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-rose-800 text-xs space-y-1">
                  <span className="font-bold text-slate-300 text-[10px] uppercase tracking-wider block">Respuesta / Motivo del SRI:</span>
                  <p className="font-mono text-rose-200 leading-relaxed text-[11px]">
                    {sriEmissionResultData.motivo || 'El servidor del SRI rechazó el comprobante electrónico.'}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSriResultModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer shadow-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL UI 3: CONFIRMACIÓN DE ANULACIÓN DE VENTA ================= */}
      {showAnnulModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200 my-auto text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 tracking-tight">
                    Anular Venta #{ord.orderNumber || ord.id}
                  </h3>
                  <p className="text-[11px] text-slate-500">{ord.customerName || 'Cliente'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAnnulModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1.5">
              <p className="font-bold flex items-center gap-1.5 text-amber-950">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>¿Deseas anular esta venta?</span>
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Al anular esta venta se devolverá automáticamente el stock de los productos a bodega (+1) y se marcarán como anulados los cobros asociados en Tesorería.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Motivo de la anulación (opcional):
              </label>
              <textarea
                value={annulReason}
                onChange={(e) => setAnnulReason(e.target.value)}
                placeholder="Ej. Devolución por cliente, garantía, error en pedido..."
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none h-20"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isAnnulling}
                onClick={() => setShowAnnulModal(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isAnnulling}
                onClick={handleConfirmAnnulOrder}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-black transition cursor-pointer shadow-md flex items-center gap-2"
              >
                {isAnnulling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Anulando Venta...</span>
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4 text-white" />
                    <span>Sí, Anular Venta</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


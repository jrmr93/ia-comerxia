import React, { useState, useEffect, useRef } from 'react';
import {
  Truck,
  MapPin,
  MessageCircle,
  AlertCircle,
  Lock,
  Barcode,
  CheckCircle2,
} from 'lucide-react';
import { CustomerOrder, CourierPartner } from '../types.ts';
import { normalizeEcuadorPhone, buildWhatsAppLink } from '../utils/phone.ts';
import { getCustomerCi, canGenerateShippingGuide } from '../utils/orderUtils.ts';

interface ManageShippingGuideModalProps {
  order: CustomerOrder | null;
  storeConfig: {
    storeName?: string;
    currency?: string;
    logoUrl?: string | null;
    courierLogos?: string | CourierPartner[];
  };
  courierPartners?: CourierPartner[];
  purchases?: any[];
  inventoryItems?: any[];
  onViewLinkedPurchase?: (purchaseId: number) => void;
  currency?: string;
  onClose: () => void;
  onSaveShippingData: (
    orderId: number | string,
    data: {
      customerAddress: string;
      customerName?: string;
      customerCi?: string;
      trackingCarrier?: string;
      trackingNumber?: string;
      trackingNotes?: string;
      status?: CustomerOrder['status'];
    }
  ) => Promise<boolean | void>;
  onPrintShippingTicket?: (order: CustomerOrder) => void;
  onOpenEditOrder?: (order: CustomerOrder) => void;
  onOpenDeleteOrder?: (order: CustomerOrder) => void;
  showToast: (msg: string) => void;
}

export const ManageShippingGuideModal: React.FC<ManageShippingGuideModalProps> = ({
  order,
  storeConfig,
  courierPartners = [],
  purchases = [],
  inventoryItems = [],
  currency = '$',
  onClose,
  onSaveShippingData,
  showToast,
}) => {
  if (!order) return null;

  const phoneNorm = normalizeEcuadorPhone(order.customerPhone);
  const activeCouriers = courierPartners.filter((c) => c.active !== false);

  // Validación ERP: Comprobar que haya existencias en stock o que la compra al proveedor esté entregada
  const shippingGuideValidation = canGenerateShippingGuide(order, inventoryItems, purchases);
  const canGenerateGuide = shippingGuideValidation.canGenerate;

  // Comprobar que el pedido esté confirmado para poder ser enviado
  const isOrderReadyToShip = order.status === 'confirmed' || order.status === 'shipped';
  const customerCi = getCustomerCi(order);

  // State for shipping guide / carrier
  const establishedCarrier = order.trackingCarrier || activeCouriers[0]?.name || 'Servientrega';
  const [carrierInput, setCarrierInput] = useState<string>(establishedCarrier);
  const [trackingNumberInput, setTrackingNumberInput] = useState<string>(order.trackingNumber || '');
  const [trackingNotesInput, setTrackingNotesInput] = useState<string>(order.trackingNotes || '');

  const trackingInputRef = useRef<HTMLInputElement | null>(null);

  // Sync state if order changes or updates
  useEffect(() => {
    if (order) {
      if (order.trackingCarrier) {
        setCarrierInput(order.trackingCarrier);
      }
      setTrackingNumberInput(order.trackingNumber || '');
      setTrackingNotesInput(order.trackingNotes || '');
    }
  }, [order?.id, order?.trackingCarrier, order?.trackingNumber, order?.trackingNotes]);

  // Autofocus the tracking number input when modal mounts so the user can immediately enter the guide
  useEffect(() => {
    const timer = setTimeout(() => {
      trackingInputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // UI States
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Save handler (save changes or mark as shipped)
  const handleSave = async (markAsShipped: boolean, notifyWhatsApp: boolean) => {
    setError(null);
    const finalAddress = order.customerAddress || 'Envío a Domicilio';
    const finalCarrier = carrierInput.trim();
    const finalTracking = trackingNumberInput.trim();
    const finalNotes = trackingNotesInput.trim();
    const finalCi = customerCi;
    const finalName = order.customerName || 'Cliente';

    if (markAsShipped) {
      if (!canGenerateGuide) {
        setError(`⛔ ${shippingGuideValidation.reason}`);
        showToast(`⛔ ${shippingGuideValidation.reason}`);
        return;
      }
      if (order.status !== 'confirmed' && order.status !== 'shipped') {
        const blockMsg = 'El pedido debe estar confirmado para poder ser marcado como enviado.';
        setError(`⛔ ${blockMsg}`);
        showToast(`⛔ ${blockMsg}`);
        return;
      }
      if (!finalTracking) {
        setError('Debes ingresar el N° de Guía / Código de Tracking para marcar el pedido como Enviado.');
        return;
      }
    } else if (finalTracking && !canGenerateGuide) {
      setError(`⛔ ${shippingGuideValidation.reason}`);
      showToast(`⛔ ${shippingGuideValidation.reason}`);
      return;
    }

    setIsSaving(true);
    try {
      const newStatus = markAsShipped ? 'shipped' : order.status;

      await onSaveShippingData(order.id, {
        customerAddress: finalAddress,
        customerName: finalName,
        customerCi: finalCi,
        trackingCarrier: finalCarrier || undefined,
        trackingNumber: finalTracking || undefined,
        trackingNotes: finalNotes || undefined,
        status: newStatus,
      });

      showToast(
        markAsShipped
          ? `✓ Pedido #${order.orderNumber} marcado como ENVIADO con guía #${finalTracking}`
          : `✓ N° de guía del pedido #${order.orderNumber} actualizado exitosamente`
      );

      // Send tracking update message via WhatsApp if requested
      if (notifyWhatsApp) {
        if (!phoneNorm.whatsappDigits || !phoneNorm.isValid) {
          showToast('⚠️ No se abrió WhatsApp porque el número registrado no es válido.');
        } else {
          let shipMsg = `¡Hola *${finalName}*! 🚚\n\n`;
          shipMsg += `Te informamos que tu pedido *#${order.orderNumber}* en *${storeConfig.storeName || 'nuestra tienda'}* ha sido *ENVIADO / DESPACHADO* con éxito.\n\n`;
          shipMsg += `📦 *Empresa de Transporte / Courier:* ${finalCarrier || 'Courier'}\n`;
          if (finalTracking) {
            shipMsg += `🔍 *N° de Guía / Tracking:* ${finalTracking}\n`;
          }
          if (finalNotes) {
            shipMsg += `📝 *Detalle / Instrucciones:* ${finalNotes}\n`;
          }
          shipMsg += `📍 *Dirección de Destino:* ${finalAddress}\n`;
          if (finalCi) {
            shipMsg += `🪪 *Cédula:* ${finalCi}\n`;
          }
          shipMsg += `💰 *Total:* $${Number(order.totalAmount).toFixed(2)} ${currency}\n\n`;
          shipMsg += `¡Muchas gracias por tu compra! Quedamos atentos para cualquier consulta sobre tu entrega.`;

          const waUrl = buildWhatsAppLink(phoneNorm.whatsappDigits, shipMsg);
          window.open(waUrl, '_blank');
        }
      }

      if (onClose) onClose();
    } catch (err: any) {
      console.error('Error saving shipping guide:', err);
      setError(err.message || 'Error al guardar la información de envío');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-blue-200 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto animate-scaleUp max-h-[94vh] flex flex-col">
        {/* ================= NON-SCROLLABLE HEADER ================= */}
        <div className="border-b border-slate-100 pb-3 flex-shrink-0">
          <div className="flex items-center space-x-3 text-blue-700">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
              <Truck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900">Gestión de Guía de Envío</h3>
                <span className="font-mono font-black text-blue-700 text-xs px-2 py-0.5 bg-blue-50 rounded-md border border-blue-200">
                  #{order.orderNumber}
                </span>
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase ${
                    order.status === 'shipped'
                      ? 'bg-blue-100 text-blue-800'
                      : order.status === 'confirmed'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {order.status === 'shipped'
                    ? 'Enviado'
                    : order.status === 'confirmed'
                    ? 'Confirmado'
                    : 'Pendiente'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Registro de número de guía y despacho con la empresa de transporte establecida
              </p>
            </div>
          </div>
        </div>

        {/* ================= SCROLLABLE BODY ================= */}
        <div className="space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
          {/* Destination & Client Info Card */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-slate-900 text-sm sm:text-base">{order.customerName}</span>
                {customerCi && (
                  <span className="text-[11px] font-mono font-bold bg-slate-200/80 text-slate-800 px-2 py-0.5 rounded-md">
                    C.I.: {customerCi}
                  </span>
                )}
                <span className="text-slate-500 font-mono text-xs">({order.customerPhone || 'Sin teléfono'})</span>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total</span>
                <span className="font-mono font-black text-emerald-700 text-sm">
                  ${Number(order.totalAmount).toFixed(2)} {currency}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-start gap-1.5 text-slate-700">
              <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <div className="text-[11px] leading-relaxed">
                <span className="font-bold text-slate-600">Dirección de Entrega: </span>
                <span className="text-slate-800 font-medium">{order.customerAddress || 'Envío a Domicilio'}</span>
              </div>
            </div>
          </div>

          {/* Bloqueo ERP si no hay existencias en stock o compra al proveedor no entregada */}
          {!canGenerateGuide && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-2 shadow-2xs">
              <div className="flex items-center gap-2 font-bold text-amber-900">
                <Lock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>Bloqueo ERP: Generación de Guía de Envío Restringida</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                {shippingGuideValidation.reason}
              </p>
            </div>
          )}

          {/* Alerta si el pedido no se encuentra confirmado */}
          {!isOrderReadyToShip && order.status !== 'delivered' && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-center space-x-2.5 shadow-2xs">
              <Lock className="w-4 h-4 text-amber-700 flex-shrink-0" />
              <div className="flex-1">
                <span className="font-bold text-amber-900">Pedido en estado '{order.status}': </span>
                <span className="text-amber-800">
                  El pedido debe estar confirmado para poder ser despachado y marcado como enviado.
                </span>
              </div>
            </div>
          )}

          {/* EMPRESA DE TRANSPORTE & N° DE GUÍA (FORMULARIO) */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-blue-50/90 via-sky-50/50 to-indigo-50/70 border-2 border-blue-300 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-2 text-blue-950 font-black text-xs sm:text-sm">
                <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <Truck className="w-3.5 h-3.5" />
                </div>
                <span>Empresa de Transporte & N° de Guía</span>
              </div>

              {carrierInput && (
                <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-blue-600 text-white shadow-2xs">
                  {carrierInput}
                </span>
              )}
            </div>

            {/* Selector de Courier / Empresa de transporte */}
            <div className="space-y-1.5 bg-white p-3 rounded-xl border border-blue-200 shadow-2xs">
              <label className="block text-slate-800 font-bold text-xs">
                Empresa de Transporte / Courier de Entrega:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={
                    activeCouriers.some((c) => c.name.toLowerCase() === carrierInput.toLowerCase())
                      ? carrierInput
                      : '__custom__'
                  }
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setCarrierInput('');
                    } else {
                      setCarrierInput(e.target.value);
                    }
                    if (error) setError(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:bg-white focus:border-blue-500 shadow-2xs cursor-pointer"
                >
                  {activeCouriers.map((c) => (
                    <option key={c.id || c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__custom__">Otro / Manual...</option>
                </select>

                <input
                  type="text"
                  value={carrierInput}
                  onChange={(e) => {
                    setCarrierInput(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Nombre de la empresa o courier..."
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-blue-500 shadow-2xs"
                />
              </div>
            </div>

            {/* Input principal: N° DE GUÍA */}
            <div className="space-y-1.5 bg-white p-3.5 sm:p-4 rounded-xl border-2 border-blue-400/80 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <label className="block text-slate-900 font-black text-xs sm:text-sm flex items-center gap-1.5">
                  <Barcode className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>N° de Guía emitido por {carrierInput || 'la Empresa'}:</span>
                  <span className="text-rose-500">*</span>
                </label>
                {trackingNumberInput.trim() && (
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Guía Asignada
                  </span>
                )}
              </div>

              <input
                ref={trackingInputRef}
                type="text"
                disabled={!canGenerateGuide}
                value={trackingNumberInput}
                onChange={(e) => {
                  setTrackingNumberInput(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={
                  !canGenerateGuide
                    ? 'Guía bloqueada: esperando stock o recepción de compra a proveedor'
                    : `Ingresa el N° de guía de ${carrierInput || 'la empresa'} (ej. 1294810294)`
                }
                className={`w-full px-3.5 py-2.5 rounded-xl border text-blue-950 font-mono font-black text-xs sm:text-sm focus:outline-none transition ${
                  !canGenerateGuide
                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-white border-blue-400 ring-2 ring-blue-100 focus:ring-4 focus:ring-blue-200'
                }`}
              />

              <p className="text-[11px] text-slate-500 pt-0.5">
                Registra el código o número de guía de despacho para realizar el seguimiento del envío.
              </p>
            </div>

            {/* Observaciones de Envío */}
            <div className="space-y-1.5">
              <label className="block text-slate-800 font-bold text-xs">
                Observaciones o Instrucciones de Entrega (Opcional):
              </label>
              <textarea
                rows={2}
                value={trackingNotesInput}
                onChange={(e) => setTrackingNotesInput(e.target.value)}
                placeholder="Ej. Entrega estimada 24-48 horas. Entregar en garita o recepción."
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          </div>

          {/* Mensaje de Error */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* ================= NON-SCROLLABLE BOTTOM ACTIONS ================= */}
        {/* Los únicos botones que tiene este modal son: "Enviar", "Notificar y Enviar", "Cerrar" */}
        <div className="pt-3.5 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5 flex-shrink-0 bg-white">
          {/* Botón: Cerrar */}
          <button
            type="button"
            id="btn-shipping-guide-close"
            disabled={isSaving}
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 transition cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
          >
            Cerrar
          </button>

          {/* Acciones principales alineadas: Enviar y Notificar y Enviar */}
          <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-2">
            {/* Botón: Enviar */}
            <button
              type="button"
              id="btn-shipping-guide-send"
              disabled={
                isSaving ||
                !canGenerateGuide ||
                !carrierInput.trim() ||
                !trackingNumberInput.trim() ||
                !isOrderReadyToShip
              }
              onClick={() => handleSave(true, false)}
              title={
                !canGenerateGuide
                  ? shippingGuideValidation.reason || 'Guía bloqueada'
                  : !isOrderReadyToShip
                  ? 'El pedido debe estar confirmado para poder ser marcado como enviado'
                  : !trackingNumberInput.trim()
                  ? 'Ingresa el N° de guía para marcar como enviado'
                  : 'Marcar como Enviado con la guía de despacho registrada'
              }
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs active:scale-95"
            >
              <Truck className="w-4 h-4 text-white" />
              <span>{isSaving ? 'Enviando...' : 'Enviar'}</span>
            </button>

            {/* Botón: Notificar y Enviar */}
            <button
              type="button"
              id="btn-shipping-guide-notify-send"
              disabled={
                isSaving ||
                !canGenerateGuide ||
                !carrierInput.trim() ||
                !trackingNumberInput.trim() ||
                !isOrderReadyToShip
              }
              onClick={() => handleSave(true, true)}
              title={
                !canGenerateGuide
                  ? shippingGuideValidation.reason || 'Guía bloqueada'
                  : !isOrderReadyToShip
                  ? 'El pedido debe estar confirmado para poder ser marcado como enviado'
                  : !trackingNumberInput.trim()
                  ? 'Ingresa el N° de guía para notificar y enviar'
                  : 'Guardar guía, marcar como enviado y notificar al cliente por WhatsApp'
              }
              className="w-full sm:w-auto px-4.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black transition flex items-center justify-center space-x-2 cursor-pointer shadow-sm active:scale-95 ring-2 ring-emerald-200"
            >
              <MessageCircle className="w-4 h-4 fill-current text-white" />
              <span>{isSaving ? 'Enviando y Notificando...' : 'Notificar y Enviar'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

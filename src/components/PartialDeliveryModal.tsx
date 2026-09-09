import React, { useState, useMemo } from 'react';
import {
  X,
  Package,
  Truck,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  Boxes,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { CustomerOrder, CustomerOrderItem, InventoryItem, StoreConfig } from '../types.ts';
import { normalizeEcuadorPhone } from '../utils/phone.ts';

interface PartialDeliveryModalProps {
  order: CustomerOrder | null;
  isOpen: boolean;
  onClose: () => void;
  inventoryItems?: InventoryItem[];
  storeConfig?: StoreConfig;
  onConfirmPartialDelivery: (
    orderId: number,
    deliveries: Array<{ id?: number; inventoryItemId?: number; sku?: string; deliverQuantity: number }>,
    options: { notes?: string; deductStock?: boolean; sendWhatsApp?: boolean }
  ) => Promise<void>;
  showToast: (msg: string) => void;
}

export const PartialDeliveryModal: React.FC<PartialDeliveryModalProps> = ({
  order,
  isOpen,
  onClose,
  inventoryItems = [],
  storeConfig,
  onConfirmPartialDelivery,
  showToast,
}) => {
  if (!isOpen || !order) return null;

  const rawItems: CustomerOrderItem[] = useMemo(() => {
    if (Array.isArray(order.items)) return order.items;
    if (typeof order.items === 'string') {
      try {
        return JSON.parse(order.items);
      } catch {
        return [];
      }
    }
    return [];
  }, [order.items]);

  // Track the units to deliver in this batch per item
  const [deliverQuantities, setDeliverQuantities] = useState<Record<number | string, number>>(() => {
    const initial: Record<number | string, number> = {};
    rawItems.forEach((it, idx) => {
      const key = it.id || it.sku || idx;
      const totalRequested = Number(it.quantity || 1);
      const alreadyDelivered = Number(it.deliveredQuantity || 0);
      const remainingMissing = Math.max(0, totalRequested - alreadyDelivered);

      // Find current stock in warehouse
      const inv = inventoryItems.find((invItem) => {
        if (it.id && invItem.id === it.id) return true;
        if (it.sku && invItem.sku && invItem.sku.toLowerCase() === it.sku.toLowerCase()) return true;
        return false;
      });
      const stockInWarehouse = inv?.stock !== undefined ? Math.max(0, inv.stock) : (it.stockAvailable || 0);

      // Default: deliver min(pending, warehouseStock) if warehouseStock > 0, else remainingMissing
      const suggest = Math.min(remainingMissing, Math.max(0, stockInWarehouse));
      initial[key] = suggest > 0 ? suggest : (remainingMissing > 0 ? 1 : 0);
    });
    return initial;
  });

  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [deductStock, setDeductStock] = useState<boolean>(true);
  const [sendWhatsApp, setSendWhatsApp] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Calculations
  const summary = useMemo(() => {
    let totalOrder = 0;
    let alreadyDeliveredSum = 0;
    let deliveringNowSum = 0;
    let remainingPendingSum = 0;

    rawItems.forEach((it, idx) => {
      const key = it.id || it.sku || idx;
      const totalRequested = Number(it.quantity || 1);
      const prevDelivered = Number(it.deliveredQuantity || 0);
      const delNow = Math.max(0, Number(deliverQuantities[key] || 0));

      totalOrder += totalRequested;
      alreadyDeliveredSum += prevDelivered;
      deliveringNowSum += delNow;
      remainingPendingSum += Math.max(0, totalRequested - (prevDelivered + delNow));
    });

    return {
      totalOrder,
      alreadyDeliveredSum,
      deliveringNowSum,
      remainingPendingSum,
      isCompleting100: deliveringNowSum > 0 && remainingPendingSum === 0,
    };
  }, [rawItems, deliverQuantities]);

  const handleQuantityChange = (key: number | string, val: number, maxAllowed: number) => {
    const sanitized = Math.max(0, Math.min(val, maxAllowed));
    setDeliverQuantities((prev) => ({
      ...prev,
      [key]: sanitized,
    }));
  };

  const handleSubmit = async () => {
    if (summary.deliveringNowSum <= 0) {
      showToast('⚠️ Ingresa al menos 1 unidad para entregar en este despacho.');
      return;
    }

    setIsSubmitting(true);
    try {
      const deliveriesPayload = rawItems.map((it, idx) => {
        const key = it.id || it.sku || idx;
        return {
          id: it.id,
          sku: it.sku,
          deliverQuantity: Number(deliverQuantities[key] || 0),
        };
      });

      await onConfirmPartialDelivery(order.id, deliveriesPayload, {
        notes: deliveryNotes.trim() || undefined,
        deductStock,
        sendWhatsApp,
      });

      // Send WhatsApp if enabled
      if (sendWhatsApp && order.customerPhone) {
        const norm = normalizeEcuadorPhone(order.customerPhone);
        if (norm.whatsappDigits && norm.isValid) {
          const storeName = storeConfig?.storeName || 'Nuestra Tienda';
          let itemsListText = '';
          rawItems.forEach((it, idx) => {
            const key = it.id || it.sku || idx;
            const requested = Number(it.quantity || 1);
            const prevDel = Number(it.deliveredQuantity || 0);
            const nowDel = Number(deliverQuantities[key] || 0);
            const totalDel = prevDel + nowDel;
            const pend = Math.max(0, requested - totalDel);

            itemsListText += `\n📦 *${it.name || it.sku}*\n   • Entregadas hoy: *${nowDel} un.* (Total acumulado: ${totalDel}/${requested})\n   • Saldo pendiente: *${pend > 0 ? `${pend} un. (Bajo pedido / en camino)` : '✅ Completado'}*`;
          });

          let waMessage = '';
          if (summary.isCompleting100) {
            waMessage = `*¡Hola ${order.customerName}!* 👋\n\nTe confirmamos la entrega final y completa de tu pedido *#${order.orderNumber}* de *${storeName}*.\n\n*Detalle de Entrega:*${itemsListText}\n\n🎉 *¡Tu pedido ha sido completado al 100%!* Muchas gracias por tu confianza.`;
          } else {
            waMessage = `*¡Hola ${order.customerName}!* 👋\n\nTe informamos que realizamos la *entrega parcial* de tu pedido *#${order.orderNumber}* de *${storeName}*:\n${itemsListText}\n\n⏳ *Saldo Pendiente:* Las ${summary.remainingPendingSum} unidades faltantes ya están gestionadas con nuestro proveedor y te avisaremos inmediatamente cuando lleguen a bodega.\n\n¡Gracias por tu preferencia!`;
          }

          const waUrl = `https://wa.me/${norm.whatsappDigits}?text=${encodeURIComponent(waMessage)}`;
          window.open(waUrl, '_blank');
        }
      }

      showToast(
        summary.isCompleting100
          ? '✓ ¡Entrega completada al 100%! Pedido finalizado con éxito.'
          : `✓ Entrega parcial registrada: ${summary.deliveringNowSum} un. despachadas, ${summary.remainingPendingSum} un. pendientes.`
      );
      onClose();
    } catch (err: any) {
      console.error('Error recording partial delivery:', err);
      showToast(err.message || 'Error al registrar entrega parcial');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="partial-delivery-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="partial-delivery-modal-content"
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden my-6 animate-in fade-in zoom-in duration-200"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-600 via-indigo-600 to-blue-700 p-5 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-black tracking-tight">Registrar Entrega Parcial</h3>
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-[11px] font-mono font-bold">
                  #{order.orderNumber}
                </span>
              </div>
              <p className="text-xs text-sky-100 mt-0.5">
                Cliente: <span className="font-bold text-white">{order.customerName}</span> ({order.customerPhone})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informative Guidance Banner */}
        <div className="bg-amber-50/80 border-b border-amber-200 p-3.5 px-6 flex items-start gap-3 text-xs text-amber-900">
          <Boxes className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Control de Despacho Parcial:</span> Entrega al cliente las unidades disponibles hoy en bodega (ej. 3 de 5) y el sistema mantendrá reservado el saldo restante (2 un.) bajo pedido hasta que ingrese del proveedor.
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Products List & Quantities Selection */}
          <div className="space-y-3">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-600">
              Productos del Pedido & Cantidad a Despachar Hoy
            </label>

            {rawItems.map((item, idx) => {
              const key = item.id || item.sku || idx;
              const totalRequested = Number(item.quantity || 1);
              const alreadyDelivered = Number(item.deliveredQuantity || 0);
              const missingPending = Math.max(0, totalRequested - alreadyDelivered);

              // Find warehouse stock
              const inv = inventoryItems.find((invItem) => {
                if (item.id && invItem.id === item.id) return true;
                if (item.sku && invItem.sku && invItem.sku.toLowerCase() === item.sku.toLowerCase()) return true;
                return false;
              });
              const warehouseStock = Math.max(0, inv?.stock !== undefined ? inv.stock : (item.stockAvailable ?? 0));
              // Max units that can physically be delivered right now is capped by available stock in warehouse
              const maxCanDeliverNow = Math.min(missingPending, warehouseStock);
              const currentDelivering = Number(deliverQuantities[key] || 0);
              const pendingAfter = Math.max(0, totalRequested - (alreadyDelivered + currentDelivering));
              const missingFromSupplier = Math.max(0, totalRequested - warehouseStock);

              return (
                <div
                  key={key}
                  className={`p-4 rounded-2xl border transition ${
                    maxCanDeliverNow === 0 && missingPending > 0
                      ? 'bg-amber-50/40 border-amber-200'
                      : currentDelivering > 0
                      ? 'bg-sky-50/50 border-sky-300 ring-1 ring-sky-300/50'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-2 flex-wrap">
                        <span>{item.name}</span>
                        {item.sku && (
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                            {item.sku}
                          </span>
                        )}
                        {item.supplierName && (
                          <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded font-medium">
                            {item.supplierName}
                          </span>
                        )}
                      </div>

                      {/* Stock & Delivery Breakdown Pills */}
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold text-[11px] border border-slate-200">
                          Total: <strong>{totalRequested} un.</strong>
                        </span>

                        <span className={`px-2 py-0.5 rounded-md font-semibold text-[11px] border ${
                          alreadyDelivered > 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>
                          Entregado: <strong>{alreadyDelivered}/{totalRequested} un.</strong>
                        </span>

                        <span className={`px-2 py-0.5 rounded-md font-semibold text-[11px] border ${
                          warehouseStock > 0 ? 'bg-sky-50 text-sky-800 border-sky-200' : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}>
                          En Bodega hoy: <strong>{warehouseStock} un.</strong>
                        </span>

                        {missingFromSupplier > 0 && (
                          <span className="bg-amber-50 text-amber-900 px-2 py-0.5 rounded-md font-semibold text-[11px] border border-amber-200">
                            Faltante a Proveedor: <strong>{missingFromSupplier} un.</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Delivery Stepper Input & Quick Action */}
                    <div className="flex flex-col items-end gap-1.5 self-end sm:self-center">
                      {missingPending === 0 ? (
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1 border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          100% Entregado
                        </span>
                      ) : warehouseStock === 0 ? (
                        <span className="px-3 py-1.5 rounded-xl bg-amber-100 text-amber-900 text-xs font-bold flex items-center gap-1 border border-amber-300" title="Todas las unidades faltantes están bajo encargo de proveedor">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                          Sin Stock en Bodega
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center space-x-1.5 bg-white border-2 border-sky-500/80 rounded-xl p-1 shadow-xs">
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(key, currentDelivering - 1, maxCanDeliverNow)}
                              disabled={currentDelivering <= 0}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold flex items-center justify-center disabled:opacity-30 cursor-pointer text-sm"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0"
                              max={maxCanDeliverNow}
                              value={currentDelivering}
                              onChange={(e) => handleQuantityChange(key, parseInt(e.target.value, 10) || 0, maxCanDeliverNow)}
                              className="w-12 text-center font-bold text-slate-900 text-sm focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(key, currentDelivering + 1, maxCanDeliverNow)}
                              disabled={currentDelivering >= maxCanDeliverNow}
                              className="w-7 h-7 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold flex items-center justify-center disabled:opacity-30 cursor-pointer text-sm"
                            >
                              +
                            </button>
                          </div>

                          {maxCanDeliverNow > 1 && (
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(key, maxCanDeliverNow, maxCanDeliverNow)}
                              className="px-2 py-1 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-800 text-[10px] font-bold transition cursor-pointer border border-sky-200"
                              title="Despachar todo el stock disponible en bodega"
                            >
                              Todo ({maxCanDeliverNow})
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pending Status after this step */}
                  {maxCanDeliverNow > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-600 font-medium">
                        A despachar en este lote: <strong className="text-sky-700 font-bold">{currentDelivering} un.</strong>
                      </span>
                      <span className={`font-bold ${pendingAfter > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                        {pendingAfter > 0
                          ? `⏳ Saldo restante: ${pendingAfter} un. (bajo pedido a proveedor)`
                          : '✓ Quedará 100% completado'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Delivery Note */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nota o Referencia de este despacho (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Entregadas 3 un. en local hoy, 2 restantes llegarán el viernes..."
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>

          {/* Options */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
            <label className="flex items-center space-x-2.5 cursor-pointer text-xs font-bold text-slate-800">
              <input
                type="checkbox"
                checked={deductStock}
                onChange={(e) => setDeductStock(e.target.checked)}
                className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500 cursor-pointer"
              />
              <span>Descontar unidades entregadas del stock físico de bodega automáticamente</span>
            </label>

            <label className="flex items-center space-x-2.5 cursor-pointer text-xs font-bold text-slate-800">
              <input
                type="checkbox"
                checked={sendWhatsApp}
                onChange={(e) => setSendWhatsApp(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
              />
              <span className="flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                Enviar comprobante y detalle de entrega por WhatsApp al cliente ({order.customerPhone || 'Sin teléfono'})
              </span>
            </label>
          </div>

          {/* Summary Box */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-sky-950 text-white space-y-2 text-xs">
            <div className="font-bold text-sky-200 uppercase tracking-wide text-[10px]">
              Resumen del Despacho
            </div>
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="bg-white/10 rounded-xl p-2">
                <div className="text-slate-300 text-[10px]">Total Pedido</div>
                <div className="text-base font-black text-white">{summary.totalOrder} un.</div>
              </div>
              <div className="bg-sky-500/20 border border-sky-400/30 rounded-xl p-2">
                <div className="text-sky-200 text-[10px]">Despachando Hoy</div>
                <div className="text-base font-black text-sky-300">{summary.deliveringNowSum} un.</div>
              </div>
              <div className={`rounded-xl p-2 ${summary.remainingPendingSum > 0 ? 'bg-amber-500/20 border border-amber-400/30' : 'bg-emerald-500/20 border border-emerald-400/30'}`}>
                <div className="text-slate-200 text-[10px]">Saldo Restante</div>
                <div className={`text-base font-black ${summary.remainingPendingSum > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {summary.remainingPendingSum} un.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 px-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-300 transition cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || summary.deliveringNowSum <= 0}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-black text-xs shadow-md transition cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? (
              <span>Procesando...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar Entrega de {summary.deliveringNowSum} un.</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

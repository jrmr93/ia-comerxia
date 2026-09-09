import React, { useState, useMemo } from 'react';
import {
  Package,
  CheckCircle2,
  X,
  Truck,
  AlertCircle,
  FileText,
  DollarSign,
  Loader2,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { PurchaseOrder, PurchaseItem } from '../types.ts';

interface PurchasePartialReceptionModalProps {
  purchase: PurchaseOrder;
  currency?: string;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  showToast: (msg: string) => void;
}

export const PurchasePartialReceptionModal: React.FC<PurchasePartialReceptionModalProps> = ({
  purchase,
  currency = 'USD',
  authFetch,
  onClose,
  onSuccess,
  showToast,
}) => {
  const [shippingGuideNumber, setShippingGuideNumber] = useState('');
  const [receiptVoucher, setReceiptVoucher] = useState('');
  const [notes, setNotes] = useState('');
  const [updateProductCost, setUpdateProductCost] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize delivery quantities per item (defaulting to the remaining pending quantity)
  const [deliveryQuantities, setDeliveryQuantities] = useState<Record<number, number>>(() => {
    const map: Record<number, number> = {};
    if (Array.isArray(purchase.items)) {
      purchase.items.forEach((it, idx) => {
        const ordered = Number(it.quantity) || 1;
        const received = Number(it.receivedQuantity) || 0;
        const pending = Math.max(0, ordered - received);
        map[idx] = pending; // default to full pending amount
      });
    }
    return map;
  });

  const handleQtyChange = (index: number, val: number, maxPending: number) => {
    const cleanVal = Math.max(0, Math.min(maxPending, isNaN(val) ? 0 : val));
    setDeliveryQuantities((prev) => ({
      ...prev,
      [index]: cleanVal,
    }));
  };

  // Calculations
  const { totalUnitsReceivingNow, totalRemainingPending, willBeFullyReceived } = useMemo(() => {
    let receivingNow = 0;
    let remainingPending = 0;

    if (Array.isArray(purchase.items)) {
      purchase.items.forEach((it, idx) => {
        const ordered = Number(it.quantity) || 1;
        const previouslyReceived = Number(it.receivedQuantity) || 0;
        const pending = Math.max(0, ordered - previouslyReceived);
        const thisBatch = Number(deliveryQuantities[idx]) || 0;

        receivingNow += thisBatch;
        remainingPending += Math.max(0, pending - thisBatch);
      });
    }

    return {
      totalUnitsReceivingNow: receivingNow,
      totalRemainingPending: remainingPending,
      willBeFullyReceived: remainingPending === 0 && receivingNow > 0,
    };
  }, [purchase.items, deliveryQuantities]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalUnitsReceivingNow <= 0) {
      showToast('⚠️ Debes ingresar al menos 1 unidad recibida en esta entrega.');
      return;
    }

    setIsSubmitting(true);
    try {
      const receptionsPayload = (purchase.items || []).map((it, idx) => ({
        itemIndex: idx,
        id: (it as any).id,
        inventoryItemId: it.inventoryItemId,
        sku: it.sku,
        name: it.name,
        quantity: Number(deliveryQuantities[idx]) || 0,
        receivedQuantity: Number(deliveryQuantities[idx]) || 0,
        costPrice: it.costPrice,
      })).filter((r) => r.receivedQuantity > 0 || r.quantity > 0);

      const res = await authFetch(`/api/purchases/${purchase.id}/partial-reception`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receptions: receptionsPayload,
          shippingGuideNumber: shippingGuideNumber.trim(),
          receiptVoucher: receiptVoucher.trim(),
          notes: notes.trim(),
          updateProductCost,
        }),
      });

      if (res && res.ok) {
        const data = await res.json();
        showToast(data.message || '✓ Entrega registrada exitosamente');
        await onSuccess();
        onClose();
      } else {
        const err = await res?.json().catch(() => ({}));
        showToast(`❌ Error: ${err?.error || 'No se pudo registrar la recepción parcial'}`);
      }
    } catch (err: any) {
      console.error('Error submitting partial reception:', err);
      showToast('❌ Error de conexión al registrar la recepción');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                Recepción Parcial de Mercancía
                <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold border border-slate-200">
                  #{purchase.purchaseNumber}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Proveedor: <strong className="text-slate-700">{purchase.supplierName}</strong> • Asienta las unidades que ingresan hoy a bodega
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Integrity Note */}
          <div className="bg-blue-50/80 border border-blue-200/80 rounded-xl p-3 text-xs text-blue-950 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Control de Inventario Real ERP:</strong> Solo las unidades ingresadas en este lote sumarán stock físico disponible en bodega. El saldo restante continuará como <em>saldo pendiente por recibir</em> sin generar inventario fantasma.
            </div>
          </div>

          {/* Items Table */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
              Cantidades Entregadas en este Lote
            </label>

            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {Array.isArray(purchase.items) && purchase.items.map((item, idx) => {
                const ordered = Number(item.quantity) || 1;
                const previouslyReceived = Number(item.receivedQuantity) || 0;
                const maxPending = Math.max(0, ordered - previouslyReceived);
                const currentBatch = deliveryQuantities[idx] !== undefined ? deliveryQuantities[idx] : maxPending;

                return (
                  <div key={idx} className="p-3 bg-white hover:bg-slate-50/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 border border-slate-200">
                          <Package className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate">{item.name}</div>
                        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 mt-0.5">
                          {item.sku && <span className="font-mono bg-slate-100 px-1 py-0.2 rounded text-[10px]">SKU: {item.sku}</span>}
                          <span>Pedidas: <strong className="text-slate-800">{ordered}</strong></span>
                          <span>• Ya en bodega: <strong className="text-emerald-700">{previouslyReceived}</strong></span>
                          <span>• Pendiente: <strong className="text-amber-700">{maxPending}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 block">Recibir Ahora</span>
                        <div className="flex items-center space-x-1">
                          <input
                            type="number"
                            min={0}
                            max={maxPending}
                            value={currentBatch}
                            onChange={(e) => handleQtyChange(idx, parseInt(e.target.value, 10), maxPending)}
                            className="w-20 px-2.5 py-1 text-center font-mono font-black text-sm bg-indigo-50/50 border border-indigo-200 rounded-lg text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <span className="text-xs text-slate-500 font-semibold">/ {maxPending}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Guide & Voucher inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                N° Guía de Remisión / Despacho
              </label>
              <input
                type="text"
                value={shippingGuideNumber}
                onChange={(e) => setShippingGuideNumber(e.target.value)}
                placeholder="Ej: GUIA-9842, Servientrega #4481..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                N° Factura / Comprobante de Proveedor
              </label>
              <input
                type="text"
                value={receiptVoucher}
                onChange={(e) => setReceiptVoucher(e.target.value)}
                placeholder="Ej: FAC-001-002-12345..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Update Cost Toggle */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-800 block">
                Actualizar Costo de Compra en el Catálogo
              </span>
              <p className="text-[11px] text-slate-500">
                Sincroniza el costo unitario de esta compra para calcular el margen de ganancia real en ventas futuras.
              </p>
            </div>
            <input
              type="checkbox"
              checked={updateProductCost}
              onChange={(e) => setUpdateProductCost(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Notas de Recepción en Bodega
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones de empaque, productos faltantes o fecha comprometida por el proveedor para el remanente..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Summary Box */}
          <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between shadow-md">
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Resumen del Lote</span>
              <div className="text-xs font-bold text-slate-200">
                +<strong className="text-emerald-400 font-mono text-sm">{totalUnitsReceivingNow}</strong> unidades ingresan hoy
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {totalRemainingPending > 0 ? (
                  <span className="text-amber-400">Saldo pendiente: {totalRemainingPending} unidades</span>
                ) : (
                  <span className="text-emerald-400">✓ ¡Orden completada al 100%!</span>
                )}
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-300 block">
                Nuevo Estado
              </span>
              <span className={`text-xs font-black px-2.5 py-1 rounded-md inline-block mt-1 ${willBeFullyReceived ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
                {willBeFullyReceived ? '✅ RECIBIDA EN BODEGA' : '📦 PARCIALMENTE RECIBIDA'}
              </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || totalUnitsReceivingNow <= 0}
              className="inline-flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer transition shadow-xs disabled:opacity-50 active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Ingresando a Bodega...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Asentar Ingreso (+{totalUnitsReceivingNow} un.)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

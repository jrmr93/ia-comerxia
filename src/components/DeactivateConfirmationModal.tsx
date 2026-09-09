import React from 'react';
import { CheckCircle2, Eye, EyeOff, Loader2, Package, Power, X } from 'lucide-react';
import { InventoryItem } from '../types.ts';

export type StatusChangeMode = 'activate' | 'deactivate';

interface DeactivateConfirmationModalProps {
  isOpen: boolean;
  mode?: StatusChangeMode;
  item?: InventoryItem | null;
  bulkItems?: InventoryItem[];
  currency?: string;
  onClose: () => void;
  onConfirm: () => void;
  isProcessing?: boolean;
  isDeactivating?: boolean; // Backwards compatibility
}

export const DeactivateConfirmationModal: React.FC<DeactivateConfirmationModalProps> = ({
  isOpen,
  mode = 'deactivate',
  item = null,
  bulkItems = [],
  currency = 'USD',
  onClose,
  onConfirm,
  isProcessing = false,
  isDeactivating = false,
}) => {
  if (!isOpen) return null;

  const isBusy = isProcessing || isDeactivating;
  const isBulk = bulkItems.length > 0;
  const count = isBulk ? bulkItems.length : 1;
  const isActivating = mode === 'activate';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3.5">
            <div
              className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 shadow-2xs ${
                isActivating
                  ? 'bg-emerald-100/80 border-emerald-200 text-emerald-700'
                  : 'bg-amber-100/80 border-amber-200 text-amber-700'
              }`}
            >
              {isActivating ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Power className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                {isActivating
                  ? isBulk
                    ? `¿Activar ${count} productos?`
                    : '¿Activar este producto?'
                  : isBulk
                  ? `¿Desactivar ${count} productos?`
                  : '¿Desactivar este producto?'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isActivating
                  ? 'El producto volverá a estar disponible para la venta en tu catálogo y tienda online.'
                  : 'El producto dejará de estar visible en el catálogo y tienda pública.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Product preview card (Single item) */}
        {!isBulk && item && (
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center space-x-3.5">
            <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center shadow-2xs">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="w-6 h-6 text-slate-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-mono font-bold text-sky-800 bg-sky-100/70 px-1.5 py-0.5 rounded border border-sky-200">
                  {item.sku}
                </span>
                {item.category && (
                  <span className="text-[10px] text-slate-500 font-medium truncate">
                    • {item.category}
                  </span>
                )}
              </div>
              <h4 className="text-xs font-bold text-slate-900 truncate leading-snug">
                {item.name}
              </h4>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-600">
                <span>
                  PVP: <strong className="text-slate-900 font-mono">${Number(item.salePrice || 0).toFixed(2)}</strong>
                </span>
                <span>•</span>
                <span>
                  Stock: <strong className="text-slate-900 font-mono">{item.stock ?? 0} u.</strong>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Bulk items list preview */}
        {isBulk && (
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              {isActivating
                ? `Productos a activar (${count})`
                : `Productos a desactivar (${count})`}
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 text-xs">
              {bulkItems.map((bi) => (
                <div
                  key={bi.id}
                  className="p-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-2 truncate min-w-0">
                    <span className="font-mono text-[10px] font-bold text-sky-800 bg-sky-100/70 px-1 rounded border border-sky-200">
                      {bi.sku}
                    </span>
                    <span className="font-medium text-slate-800 truncate">{bi.name}</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-600 ml-2 shrink-0">
                    ${Number(bi.salePrice || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Informative notice */}
        {isActivating ? (
          <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-950 space-y-2">
            <div className="flex items-center gap-2 font-bold text-emerald-900">
              <Eye className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>¿Qué ocurrirá al activar?</span>
            </div>
            <ul className="space-y-1.5 text-[11px] text-emerald-900/90 pl-5 list-disc">
              <li>
                El producto pasará de inmediato al estado <strong>Disponible / Activo</strong>.
              </li>
              <li>
                Se <strong>mostrará nuevamente en tu tienda online</strong> para clientes y estará habilitado en los pedidos automáticos.
              </li>
              <li>
                Tus clientes podrán seleccionarlo, agregarlo al carrito y pedirlo con total normalidad.
              </li>
            </ul>
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <EyeOff className="w-4 h-4 text-amber-700 shrink-0" />
              <span>¿Qué ocurrirá al desactivar?</span>
            </div>
            <ul className="space-y-1.5 text-[11px] text-amber-900/90 pl-5 list-disc">
              <li>
                El producto <strong>no se borrará</strong>; pasará al estado <em>Inactivo / Archivado</em>.
              </li>
              <li>
                Se <strong>ocultará de inmediato</strong> de tu catálogo web para clientes y de los pedidos de WhatsApp.
              </li>
              <li>
                Conservarás intacto todo su <strong>historial de ventas, compras y costos</strong>, y podrás reactivarlo en cualquier momento con un solo clic.
              </li>
            </ul>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-700 transition cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className={`px-4 py-2 rounded-xl text-white text-xs font-bold shadow-xs transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 ${
              isActivating
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-amber-600 hover:bg-amber-500'
            }`}
          >
            {isBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isActivating ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <Power className="w-3.5 h-3.5" />
            )}
            <span>
              {isBusy
                ? isActivating
                  ? 'Activando...'
                  : 'Desactivando...'
                : isActivating
                ? isBulk
                  ? `Sí, Activar (${count})`
                  : 'Sí, Activar Producto'
                : isBulk
                ? `Sí, Desactivar (${count})`
                : 'Sí, Desactivar Producto'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

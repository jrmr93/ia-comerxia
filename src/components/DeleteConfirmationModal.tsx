import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, Lock, Package, ShieldAlert, ShieldCheck, Trash2, X } from 'lucide-react';
import { CustomerOrder, InventoryItem } from '../types.ts';
import { checkProductTransactionLink } from '../utils/productIntegrity.ts';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  item?: InventoryItem | null;
  bulkItems?: InventoryItem[];
  orders?: CustomerOrder[];
  purchases?: any[];
  title?: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  item = null,
  bulkItems = [],
  orders = [],
  purchases = [],
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  onClose,
  onConfirm,
  isDeleting = false,
}) => {
  if (!isOpen) return null;

  const isBulk = bulkItems.length > 0;

  // Verify single item link
  const singleLink = useMemo(() => {
    if (!item) return null;
    return checkProductTransactionLink(item, orders, purchases);
  }, [item, orders, purchases]);

  // Verify bulk items link
  const bulkAnalysis = useMemo(() => {
    if (!isBulk) return null;
    const deletable: InventoryItem[] = [];
    const blocked: Array<{ item: InventoryItem; reason: string; sales: number; purchases: number }> = [];

    for (const bi of bulkItems) {
      const link = checkProductTransactionLink(bi, orders, purchases);
      if (link.isLinked) {
        blocked.push({
          item: bi,
          reason: link.reasonText || 'Vinculado a operaciones',
          sales: link.salesCount,
          purchases: link.purchasesCount,
        });
      } else {
        deletable.push(bi);
      }
    }

    return {
      deletable,
      blocked,
      canDeleteAny: deletable.length > 0,
      allBlocked: blocked.length > 0 && deletable.length === 0,
    };
  }, [isBulk, bulkItems, orders, purchases]);

  const cannotDeleteSingle = Boolean(singleLink?.isLinked);
  const cannotDeleteBulk = Boolean(bulkAnalysis?.allBlocked);
  const isDeleteDisabled = isDeleting || (!isBulk && cannotDeleteSingle) || (isBulk && cannotDeleteBulk);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 text-slate-800 space-y-4">
        {/* Close icon */}
        <button
          onClick={onClose}
          disabled={isDeleting}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon & Title */}
        <div className="flex items-start space-x-3.5">
          <div
            className={`p-3 rounded-2xl flex-shrink-0 shadow-2xs border ${
              cannotDeleteSingle || cannotDeleteBulk
                ? 'bg-amber-50 border-amber-200 text-amber-600'
                : 'bg-rose-50 border-rose-200 text-rose-600'
            }`}
          >
            {cannotDeleteSingle || cannotDeleteBulk ? (
              <Lock className="w-6 h-6" />
            ) : (
              <Trash2 className="w-6 h-6" />
            )}
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              {title ||
                (isBulk
                  ? `Eliminación de ${bulkItems.length} productos`
                  : cannotDeleteSingle
                  ? 'Producto protegido contra eliminación'
                  : '¿Eliminar producto del inventario?')}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {message ||
                (cannotDeleteSingle
                  ? 'Este producto tiene historial comercial registrado en el ERP.'
                  : isBulk
                  ? 'Verificación de integridad de compras y ventas de los productos seleccionados.'
                  : 'Solo se pueden eliminar productos sin compras ni ventas vinculadas.')}
            </p>
          </div>
        </div>

        {/* Single Item Details & Check */}
        {!isBulk && item && singleLink && (
          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0 shadow-2xs">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Package className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-slate-900 truncate">{item.name}</h4>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="font-mono text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                    {item.sku}
                  </span>
                  <span className="text-[11px] text-slate-500">Stock: {item.stock}</span>
                  <span className="text-[11px] font-bold font-mono text-emerald-700">${item.salePrice}</span>
                </div>
              </div>
            </div>

            {/* Validation State Box */}
            {singleLink.isLinked ? (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 space-y-2 text-xs">
                <div className="flex items-center space-x-2 font-bold text-amber-900">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>No se puede eliminar (Producto Vinculado)</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Por integridad contable y financiera, los productos vinculados a órdenes de compra o pedidos de clientes no pueden eliminarse:
                </p>
                <div className="space-y-1.5 pt-1">
                  {singleLink.salesCount > 0 && (
                    <div className="p-2 bg-white/80 rounded-xl border border-amber-200 font-medium text-[11px] flex items-center justify-between">
                      <span className="text-amber-900">Ventas vinculadas:</span>
                      <span className="font-bold text-slate-900">
                        {singleLink.salesCount} pedido(s) ({singleLink.salesDetails.map((o) => '#' + o.orderNumber).slice(0, 3).join(', ')})
                      </span>
                    </div>
                  )}
                  {singleLink.purchasesCount > 0 && (
                    <div className="p-2 bg-white/80 rounded-xl border border-amber-200 font-medium text-[11px] flex items-center justify-between">
                      <span className="text-amber-900">Compras vinculadas:</span>
                      <span className="font-bold text-slate-900">
                        {singleLink.purchasesCount} orden(es) ({singleLink.purchasesDetails.map((p) => '#' + p.purchaseNumber).slice(0, 3).join(', ')})
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 italic pt-1">
                  💡 Tip: Puedes desactivar o archivar el producto para ocultarlo del catálogo sin alterar el historial comercial.
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-1 text-xs">
                <div className="flex items-center space-x-2 font-bold text-emerald-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Verificación contable superada</span>
                </div>
                <p className="text-[11px] text-emerald-700">
                  ✓ Este producto tiene 0 compras y 0 ventas vinculadas. Es seguro eliminarlo definitivamente de la base de datos.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Bulk Items Breakdown & Check */}
        {isBulk && bulkAnalysis && (
          <div className="space-y-3">
            {bulkAnalysis.allBlocked ? (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 space-y-2 text-xs">
                <div className="flex items-center space-x-2 font-bold text-amber-900">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Todos los productos seleccionados están protegidos</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Ninguno de los {bulkItems.length} productos seleccionados se puede eliminar porque todos tienen compras a proveedores o ventas a clientes vinculadas.
                </p>
              </div>
            ) : bulkAnalysis.blocked.length > 0 ? (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 space-y-1.5 text-xs">
                <div className="flex items-center space-x-2 font-bold text-amber-900">
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Protección automática de historial</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Se eliminarán únicamente los <strong>{bulkAnalysis.deletable.length}</strong> productos sin historial comercial. Los <strong>{bulkAnalysis.blocked.length}</strong> productos vinculados se mantendrán protegidos.
                </p>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-1 text-xs">
                <div className="flex items-center space-x-2 font-bold text-emerald-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Todos los productos son aptos para eliminación</span>
                </div>
                <p className="text-[11px] text-emerald-700">
                  Los {bulkItems.length} productos seleccionados no tienen compras ni ventas vinculadas.
                </p>
              </div>
            )}

            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 text-xs">
              {bulkItems.map((bi) => {
                const link = checkProductTransactionLink(bi, orders, purchases);
                return (
                  <div
                    key={bi.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                      link.isLinked
                        ? 'bg-amber-50/60 border-amber-200/80 text-slate-700'
                        : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate min-w-0">
                      <span className="font-mono text-[10px] font-bold text-sky-700 bg-sky-50 px-1 rounded border border-sky-200">
                        {bi.sku}
                      </span>
                      <span className="font-medium truncate">{bi.name}</span>
                    </div>
                    <div className="ml-2 flex-shrink-0 text-right">
                      {link.isLinked ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-md border border-amber-300">
                          <Lock className="w-2.5 h-2.5" />
                          <span>{link.reasonText}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-300">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>Apto</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-700 transition cursor-pointer disabled:opacity-50"
          >
            {cannotDeleteSingle || cannotDeleteBulk ? 'Entendido / Cerrar' : cancelLabel}
          </button>
          {!cannotDeleteSingle && !cannotDeleteBulk && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={isDeleteDisabled}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-xs transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span>
                {isDeleting
                  ? 'Eliminando...'
                  : confirmLabel ||
                    (isBulk
                      ? `Eliminar (${bulkAnalysis?.deletable.length || 0})`
                      : 'Sí, Eliminar')}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};


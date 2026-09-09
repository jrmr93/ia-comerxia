import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Download,
  Copy,
  ExternalLink,
  Star,
  Check,
  Plus,
  Loader2,
  Sparkles,
  Maximize2,
  Trash2,
  Lock,
  Boxes,
  PackageCheck,
  ShoppingBag,
} from 'lucide-react';
import { copyImageToClipboard, downloadImage } from '../utils/image-drag-copy.ts';

export interface LightboxImageItem {
  url: string;
  thumbnailUrl?: string;
  title?: string;
  tag?: string;
  source?: string;
  confidence?: string;
}

interface PendingOrderDetail {
  id: number | string;
  customerName: string;
  quantity: number;
  date?: string;
  orderNumber?: string;
}

interface ImageLightboxModalProps {
  isOpen: boolean;
  images: Array<string | LightboxImageItem>;
  currentIndex: number;
  onClose: () => void;
  onNavigate?: (newIndex: number) => void;
  onSelect?: (url: string) => void;
  onSetAsCover?: (url: string) => void;
  onDeletePhoto?: (url: string, index: number) => void | Promise<void>;
  selectLabel?: string;
  isCover?: boolean;
  productName?: string;
  productSku?: string;
  // Inventory & Reserved Metrics:
  apartadaStock?: number;
  physicalStock?: number;
  availableStock?: number;
  pendingOrdersCount?: number;
  pendingOrdersDetails?: PendingOrderDetail[];
  salePrice?: number;
  currency?: string;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  images,
  currentIndex,
  onClose,
  onNavigate,
  onSelect,
  onSetAsCover,
  onDeletePhoto,
  selectLabel,
  isCover = false,
  productName,
  productSku,
  apartadaStock = 0,
  physicalStock,
  availableStock,
  pendingOrdersCount = 0,
  pendingOrdersDetails = [],
  salePrice,
  currency = 'USD',
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panPosition, setPanPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isCopying, setIsCopying] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showOrdersPopup, setShowOrdersPopup] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize image items to LightboxImageItem structure
  const normalizedImages: LightboxImageItem[] = images.map((item) => {
    if (typeof item === 'string') {
      return { url: item };
    }
    return item;
  });

  const safeIndex = Math.max(0, Math.min(currentIndex, normalizedImages.length - 1));
  const currentItem = normalizedImages[safeIndex];
  const currentUrl = currentItem?.url || '';

  // Reset zoom & pan whenever active photo changes or modal opens
  useEffect(() => {
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  }, [safeIndex, isOpen]);

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onClose) onClose();
      } else if (e.key === 'ArrowLeft') {
        if (normalizedImages.length > 1 && onNavigate) {
          onNavigate(safeIndex > 0 ? safeIndex - 1 : normalizedImages.length - 1);
        }
      } else if (e.key === 'ArrowRight') {
        if (normalizedImages.length > 1 && onNavigate) {
          onNavigate(safeIndex < normalizedImages.length - 1 ? safeIndex + 1 : 0);
        }
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleResetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, safeIndex, normalizedImages.length, onNavigate, onClose]);

  if (!isOpen || !currentItem || !currentUrl) return null;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) setPanPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  };

  const handleToggleZoom = () => {
    if (zoomLevel > 1) {
      handleResetZoom();
    } else {
      setZoomLevel(2.2);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoomLevel > 1) {
      setPanPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    showToast('Iniciando descarga de foto en alta resolución...');
    try {
      const filename = `${productSku || 'producto'}-foto-${safeIndex + 1}.jpg`;
      const ok = await downloadImage(currentUrl, filename);
      if (ok) {
        showToast('Foto descargada correctamente');
      } else {
        showToast('Descarga iniciada');
      }
    } catch {
      showToast('Error al descargar la foto');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopy = async () => {
    if (isCopying) return;
    setIsCopying(true);
    showToast('Copiando foto al portapapeles...');
    try {
      const res = await copyImageToClipboard(currentUrl);
      showToast(res.message);
    } catch {
      showToast('No se pudo copiar. Usa el botón descargar.');
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col justify-between p-2 sm:p-4 select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Top Header Bar */}
      <div
        className="w-full flex flex-col md:flex-row md:items-center justify-between z-20 py-2.5 px-3.5 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 text-white shadow-xl gap-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
            <Maximize2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              {productSku && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                  {productSku}
                </span>
              )}
              {currentItem.tag && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 flex items-center space-x-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>{currentItem.tag}</span>
                </span>
              )}
              {isCover && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 flex items-center space-x-1">
                  <Star className="w-2.5 h-2.5 fill-amber-300" />
                  <span>Foto Principal</span>
                </span>
              )}

              {/* Cantidad apartada para entregar a una compra */}
              <div className="relative inline-block">
                <button
                  type="button"
                  onClick={() => setShowOrdersPopup((v) => !v)}
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border flex items-center space-x-1.5 transition cursor-pointer shadow-xs ${
                    apartadaStock > 0
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30 ring-1 ring-amber-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                  title="Cantidad apartada para entregar a compras"
                >
                  <Lock className={`w-3 h-3 ${apartadaStock > 0 ? 'text-amber-400' : 'text-slate-400'}`} />
                  <span>
                    Apartado para compras: <strong className="font-mono text-white">{apartadaStock} u.</strong>
                  </span>
                  {pendingOrdersCount > 0 && (
                    <span className="bg-amber-400/30 text-amber-200 px-1.5 py-0.2 text-[9px] rounded-full font-mono">
                      {pendingOrdersCount} {pendingOrdersCount === 1 ? 'orden' : 'órdenes'}
                    </span>
                  )}
                </button>

                {/* Popover con detalles de compras pendientes si existen */}
                {showOrdersPopup && pendingOrdersDetails.length > 0 && (
                  <div className="absolute left-0 top-full mt-2 w-72 p-3 bg-slate-900 border border-amber-500/40 rounded-xl shadow-2xl z-50 text-xs text-slate-200 animate-in fade-in zoom-in-95">
                    <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-800">
                      <span className="font-bold text-amber-400 flex items-center gap-1 text-[11px]">
                        <ShoppingBag className="w-3.5 h-3.5" />
                        Compras con unidades apartadas
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowOrdersPopup(false)}
                        className="text-slate-400 hover:text-white p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                      {pendingOrdersDetails.map((po, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-between"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="font-semibold text-white truncate text-[11px]">
                              {po.customerName || 'Cliente'}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              {po.orderNumber || `Pedido #${po.id}`}
                            </p>
                          </div>
                          <span className="bg-amber-500/20 text-amber-300 font-black px-2 py-0.5 rounded border border-amber-500/40 text-[10px] font-mono shrink-0">
                            {po.quantity} u.
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Stock Físico en Bodega */}
              {physicalStock !== undefined && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 flex items-center space-x-1">
                  <Boxes className="w-3 h-3 text-sky-400" />
                  <span>Bodega: <strong className="font-mono text-white">{physicalStock} u.</strong></span>
                </span>
              )}

              {/* Stock Disponible para Venta */}
              {availableStock !== undefined && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Disponible: <strong className="font-mono text-white">{availableStock} u.</strong></span>
                </span>
              )}

              {/* Precio de Venta */}
              {salePrice !== undefined && salePrice > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-mono">
                  ${salePrice.toFixed(2)} {currency}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm font-bold text-slate-100 truncate mt-0.5">
              {currentItem.title || productName || 'Vista previa ampliada de foto'}
            </p>
          </div>
        </div>

        {/* Action controls & Close */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          {/* Zoom Controls */}
          <div className="hidden sm:flex items-center space-x-1 bg-slate-800/80 rounded-xl p-1 border border-slate-700">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 1}
              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-40 transition cursor-pointer"
              title="Alejar (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="px-2 py-0.5 text-[11px] font-mono font-bold text-slate-300 hover:text-white rounded hover:bg-slate-700 transition cursor-pointer"
              title="Restablecer (100%)"
            >
              {Math.round(zoomLevel * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 4}
              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-40 transition cursor-pointer"
              title="Acercar (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            {zoomLevel > 1 && (
              <button
                type="button"
                onClick={handleResetZoom}
                className="p-1.5 rounded-lg hover:bg-slate-700 text-amber-400 transition cursor-pointer"
                title="Restablecer vista"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Copy image button */}
          <button
            type="button"
            disabled={isCopying}
            onClick={handleCopy}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            title="Copiar imagen al portapapeles"
          >
            {isCopying ? <Loader2 className="w-4 h-4 animate-spin text-sky-400" /> : <Copy className="w-4 h-4" />}
          </button>

          {/* Download image button */}
          <button
            type="button"
            disabled={isDownloading}
            onClick={handleDownload}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            title="Descargar foto en tamaño completo"
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </button>

          {/* Open original link */}
          {currentUrl.startsWith('http') && (
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition cursor-pointer hidden sm:flex items-center"
              title="Abrir URL original en nueva pestaña"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/30 transition cursor-pointer ml-1"
            title="Cerrar vista previa (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div
        ref={containerRef}
        className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden my-2"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={(e) => {
          // If clicked backdrop, close; if clicked image, toggle zoom
          if (e.target === containerRef.current) {
            if (onClose) onClose();
          }
        }}
      >
        {/* Navigation arrow left */}
        {normalizedImages.length > 1 && onNavigate && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(safeIndex > 0 ? safeIndex - 1 : normalizedImages.length - 1);
            }}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-slate-900/80 hover:bg-slate-900 text-white border border-slate-700 flex items-center justify-center transition shadow-2xl z-30 cursor-pointer hover:scale-105"
            title="Foto anterior (Flecha Izquierda)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* The Enlarged Image Element */}
        <div
          className={`relative max-w-full max-h-full transition-transform duration-100 flex items-center justify-center ${
            zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
          }`}
          style={{
            transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)`,
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (zoomLevel === 1) {
              handleToggleZoom();
            }
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            handleToggleZoom();
          }}
        >
          <img
            src={currentUrl}
            alt={currentItem.title || productName || 'Foto ampliada'}
            className="max-h-[75vh] max-w-[92vw] object-contain rounded-2xl shadow-2xl border border-slate-800/80 bg-slate-900/50"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.src.includes('/api/proxy-image') && currentUrl.startsWith('http')) {
                target.src = `/api/proxy-image?url=${encodeURIComponent(currentUrl)}`;
              }
            }}
          />

          {/* Botón con solo el icono de basurero dentro de la imagen (sin texto) */}
          {onDeletePhoto && (
            <button
              type="button"
              disabled={isDeleting}
              onClick={async (e) => {
                e.stopPropagation();
                if (window.confirm('¿Deseas eliminar esta foto de este producto?')) {
                  setIsDeleting(true);
                  try {
                    await onDeletePhoto(currentUrl, safeIndex);
                    showToast('Foto eliminada');
                  } catch {
                    showToast('Error al eliminar foto');
                  } finally {
                    setIsDeleting(false);
                  }
                }
              }}
              className="absolute top-3 right-3 w-9 h-9 rounded-xl bg-slate-900/80 hover:bg-rose-600 text-white flex items-center justify-center transition-all shadow-lg cursor-pointer z-30 backdrop-blur-xs border border-white/20 hover:scale-105 disabled:opacity-50"
              title="Eliminar foto"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Trash2 className="w-4 h-4 text-white" />
              )}
            </button>
          )}
        </div>

        {/* Navigation arrow right */}
        {normalizedImages.length > 1 && onNavigate && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(safeIndex < normalizedImages.length - 1 ? safeIndex + 1 : 0);
            }}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-slate-900/80 hover:bg-slate-900 text-white border border-slate-700 flex items-center justify-center transition shadow-2xl z-30 cursor-pointer hover:scale-105"
            title="Siguiente foto (Flecha Derecha)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Floating Counter & Quick Zoom Hint Badge */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center space-x-2 z-20 pointer-events-none">
          {normalizedImages.length > 1 && (
            <span className="bg-slate-900/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-slate-200 border border-slate-700 shadow-lg">
              {safeIndex + 1} de {normalizedImages.length}
            </span>
          )}
          <span className="bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-medium text-slate-400 border border-slate-800 shadow-lg hidden sm:inline">
            {zoomLevel > 1 ? 'Arrastra para mover • Doble clic para alejar' : 'Haz clic o doble clic para hacer zoom'}
          </span>
        </div>

        {/* Toast Alert Inside Lightbox */}
        {toastMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-sky-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-xl border border-sky-400/50 flex items-center space-x-1.5 z-40 animate-in fade-in slide-in-from-top-2">
            <Check className="w-3.5 h-3.5" />
            <span>{toastMsg}</span>
          </div>
        )}
      </div>

      {/* Bottom Actions & Thumbnail Strip Bar */}
      <div
        className="w-full z-20 py-2.5 px-3 sm:px-4 bg-slate-900/85 backdrop-blur-md rounded-2xl border border-slate-800 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Thumbnails strip if multiple photos */}
        {normalizedImages.length > 1 ? (
          <div className="flex items-center space-x-2 overflow-x-auto max-w-full sm:max-w-[55%] py-1 scrollbar-thin">
            {normalizedImages.map((img, idx) => {
              const isSelectedThumb = idx === safeIndex;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onNavigate && onNavigate(idx)}
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden shrink-0 transition border-2 cursor-pointer bg-slate-800 relative ${
                    isSelectedThumb
                      ? 'border-sky-400 ring-2 ring-sky-500/50 scale-105'
                      : 'border-slate-700 opacity-60 hover:opacity-100'
                  }`}
                  title={`Ver foto #${idx + 1}`}
                >
                  <img
                    src={img.thumbnailUrl || img.url}
                    alt={`Miniatura ${idx + 1}`}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  {idx === safeIndex && (
                    <div className="absolute inset-0 bg-sky-500/20 pointer-events-none" />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 font-medium hidden sm:block">
            Usa la rueda del ratón o haz clic para ampliar con zoom HD
          </div>
        )}

        {/* Primary Action Buttons (e.g. Set as Cover, Add Photo, Select) */}
        <div className="flex items-center space-x-2 shrink-0 w-full sm:w-auto justify-end">
          {onSetAsCover && (
            <button
              type="button"
              onClick={() => {
                onSetAsCover(currentUrl);
                showToast('Foto asignada como portada');
              }}
              className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-md"
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>Foto de Portada</span>
            </button>
          )}

          {onSelect && (
            <button
              type="button"
              onClick={() => {
                onSelect(currentUrl);
                showToast('Foto seleccionada');
              }}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-md"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{selectLabel || 'Usar esta Foto'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

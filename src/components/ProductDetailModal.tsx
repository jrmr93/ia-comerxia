import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  BadgePercent,
  Bot,
  Boxes,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  DollarSign,
  Download,
  Edit,
  Edit2,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  Flame,
  ImageOff,
  Images,
  Layers,
  Loader2,
  Lock,
  Package,
  PackageCheck,
  Percent,
  Play,
  Power,
  Scale,
  Sparkles,
  Tag,
  TrendingDown,
  TrendingUp,
  Truck,
  User,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react';
import { CostOption, CustomerOrder, InventoryItem } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { downloadImage, downloadMultipleImages, copyImageToClipboard } from '../utils/image-drag-copy.ts';
import { ImageLightboxModal } from './ImageLightboxModal.tsx';
import { checkProductTransactionLink } from '../utils/productIntegrity.ts';
import { parseVideoUrl } from '../utils/video-helper.ts';
import { DeactivateConfirmationModal } from './DeactivateConfirmationModal.tsx';
import { ProductWebImagePicker } from './ProductWebImagePicker.tsx';

interface ProductDetailModalProps {
  item: InventoryItem | null;
  onClose: () => void;
  onEdit: (item: InventoryItem) => void;
  onDelete?: (id: number) => void;
  onItemUpdated?: (item: InventoryItem) => void;
  currency?: string;
  orders?: CustomerOrder[];
  purchases?: any[];
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  item: initialItem,
  onClose,
  onEdit,
  onDelete,
  onItemUpdated,
  currency = 'USD',
  orders,
  purchases,
}) => {
  const { authFetch } = useAuth();
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);
  const [currentItem, setCurrentItem] = useState<InventoryItem | null>(initialItem);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState<boolean>(false);
  const [isDownloadingPhoto, setIsDownloadingPhoto] = useState<boolean>(false);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState<boolean>(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState<boolean>(false);
  const [descSavedToast, setDescSavedToast] = useState<string | null>(null);
  const [statusConfirmMode, setStatusConfirmMode] = useState<'activate' | 'deactivate' | null>(null);
  const [showWebImagePicker, setShowWebImagePicker] = useState<boolean>(false);
  const [fetchedOrders, setFetchedOrders] = useState<CustomerOrder[]>(orders || []);
  const [showCosts, setShowCosts] = useState<boolean>(false);

  const transactionLink = useMemo(() => {
    if (!currentItem) return null;
    return checkProductTransactionLink(currentItem, fetchedOrders, purchases || []);
  }, [currentItem, fetchedOrders, purchases]);

  useEffect(() => {
    if (orders && orders.length > 0) {
      setFetchedOrders(orders);
    } else {
      authFetch('/api/orders')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setFetchedOrders(data);
        })
        .catch(() => {});
    }
  }, [orders, authFetch]);

  // Compute customer purchases/orders that have this product apartada
  const linkedOrdersWithPending = useMemo(() => {
    if (!currentItem) return [];
    if (!fetchedOrders || fetchedOrders.length === 0) return [];

    const list: {
      id: number;
      orderNumber: string;
      customerName: string;
      pendingUnits: number;
      totalQuantity: number;
      deliveredQuantity: number;
      status: string;
      createdAt?: string;
    }[] = [];

    for (const ord of fetchedOrders) {
      if (ord.status === 'confirmed' || ord.status === 'pending') {
        const items = Array.isArray(ord.items)
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

        for (const oi of items) {
          const isMatch =
            (oi.id && (oi.id === currentItem.id || oi.inventoryItemId === currentItem.id)) ||
            (oi.inventoryItemId && oi.inventoryItemId === currentItem.id) ||
            (oi.sku && currentItem.sku && oi.sku.toLowerCase() === currentItem.sku.toLowerCase()) ||
            (oi.name && currentItem.name && oi.name.trim().toLowerCase() === currentItem.name.trim().toLowerCase());

          if (isMatch) {
            const requested = Number(oi.quantity || 1);
            const delivered = Number(oi.deliveredQuantity || 0);
            const pendingToDeliver = Math.max(0, requested - delivered);
            if (pendingToDeliver > 0) {
              list.push({
                id: ord.id,
                orderNumber: ord.orderNumber || `#${ord.id}`,
                customerName: ord.customerName || 'Cliente',
                pendingUnits: pendingToDeliver,
                totalQuantity: requested,
                deliveredQuantity: delivered,
                status: ord.status,
                createdAt: ord.createdAt,
              });
            }
          }
        }
      }
    }
    return list;
  }, [fetchedOrders, currentItem]);

  const apartadaFromOrders = linkedOrdersWithPending.reduce((sum, o) => sum + o.pendingUnits, 0);
  const totalApartada =
    currentItem?.reservedStock !== undefined && currentItem.reservedStock > 0
      ? Math.max(Number(currentItem.reservedStock), apartadaFromOrders)
      : apartadaFromOrders;

  const physicalStock = currentItem
    ? Number(currentItem.physicalStock !== undefined ? currentItem.physicalStock : currentItem.stock) || 0
    : 0;

  const availableStock = currentItem
    ? currentItem.availableStock !== undefined
      ? Number(currentItem.availableStock) || 0
      : Math.max(0, physicalStock - totalApartada)
    : 0;

  const incomingStock = Number(currentItem?.incomingStock || 0);

  const hasInitialImages = Boolean(
    (initialItem?.imageUrl && initialItem.imageUrl.trim() !== '') ||
    (initialItem?.images && initialItem.images.length > 0)
  );
  // User requirement: Products without photos must show "Producto sin foto" cover first, even if they have a video
  const [mediaMode, setMediaMode] = useState<'photo' | 'video'>('photo');

  // Single button handler to delete image directly from database
  const handleDeleteCurrentImage = async () => {
    if (!currentPhoto || !currentItem || isDeletingPhoto) return;

    setIsDeletingPhoto(true);
    setSaveSuccessMsg('🗑️ Eliminando foto de la base de datos...');
    try {
      const res = await authFetch(`/api/inventory/${currentItem.id}/delete-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: currentPhoto,
          photoIndex: activePhotoIndex,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.item) {
          setCurrentItem(data.item);
          if (onItemUpdated) onItemUpdated(data.item);
          setActivePhotoIndex((prev) => (prev > 0 ? prev - 1 : 0));
          setSaveSuccessMsg('✅ Foto eliminada de la base de datos con éxito');
        }
      } else {
        const err = await res.json();
        setSaveSuccessMsg(`⚠️ Error al eliminar foto: ${err.error || 'Fallo en el servidor'}`);
      }
    } catch (err) {
      console.error('Delete image failed:', err);
      setSaveSuccessMsg('⚠️ Error al eliminar la foto');
    } finally {
      setIsDeletingPhoto(false);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    }
  };

  const handleDownloadSinglePhoto = async (photoUrl: string, photoNum: number) => {
    if (isDownloadingPhoto) return;
    setIsDownloadingPhoto(true);
    setSaveSuccessMsg(`📥 Descargando foto #${photoNum}...`);
    try {
      const ok = await downloadImage(
        photoUrl,
        `${currentItem?.sku || 'producto'}-foto-${photoNum}.jpg`
      );
      if (ok) {
        setSaveSuccessMsg(`✅ Foto #${photoNum} descargada correctamente`);
      } else {
        setSaveSuccessMsg(`ℹ️ Si no inició la descarga automática, usa "Copiar Foto"`);
      }
    } catch {
      setSaveSuccessMsg(`⚠️ Error al descargar foto #${photoNum}`);
    } finally {
      setIsDownloadingPhoto(false);
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    }
  };

  const [isCopyingPhoto, setIsCopyingPhoto] = useState(false);
  const handleCopyPhoto = async (photoUrl: string) => {
    if (isCopyingPhoto) return;
    setIsCopyingPhoto(true);
    setSaveSuccessMsg('📋 Copiando foto al portapapeles...');
    try {
      const res = await copyImageToClipboard(photoUrl);
      setSaveSuccessMsg(res.message);
    } catch {
      setSaveSuccessMsg('⚠️ No se pudo copiar. Usa el botón Descargar.');
    } finally {
      setIsCopyingPhoto(false);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    }
  };

  const handleDownloadAllPhotos = async (photosList: string[]) => {
    if (isDownloadingPhoto || photosList.length === 0) return;
    setIsDownloadingPhoto(true);
    setSaveSuccessMsg(`📥 Descargando ${photosList.length} fotos...`);
    try {
      await downloadMultipleImages(
        photosList,
        currentItem?.sku || 'producto',
        (curr, total) => {
          setSaveSuccessMsg(`📥 Descargando foto ${curr} de ${total}...`);
        }
      );
      setSaveSuccessMsg(`✅ ${photosList.length} fotos descargadas`);
    } catch {
      setSaveSuccessMsg(`⚠️ Descarga finalizada`);
    } finally {
      setIsDownloadingPhoto(false);
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    }
  };

  const handleRegenerateDescription = async () => {
    if (!currentItem) return;
    setIsGeneratingDesc(true);
    try {
      const res = await authFetch(`/api/inventory/${currentItem.id}/generate-description`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saveToDatabase: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al generar la descripción');
      if (data.item) {
        setCurrentItem(data.item);
        onItemUpdated?.(data.item);
        setDescSavedToast('¡Descripción comercial regenerada y guardada exitosamente!');
        setTimeout(() => setDescSavedToast(null), 3500);
      }
    } catch (err: any) {
      console.error('Error regenerating description:', err);
      alert(err.message || 'Error al generar la descripción comercial con IA');
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  React.useEffect(() => {
    if (!initialItem) {
      setCurrentItem(null);
      return;
    }
    // Only reset state if switching to a different product ID
    if (currentItem?.id !== initialItem.id) {
      setCurrentItem(initialItem);
      setSaveSuccessMsg(null);
      const hasImages = Boolean(
        (initialItem.imageUrl && initialItem.imageUrl.trim() !== '') ||
        (initialItem.images && initialItem.images.length > 0)
      );
      setMediaMode(hasImages ? 'photo' : initialItem.videoUrl ? 'video' : 'photo');
    } else {
      // Keep modal open while safely merging product data without losing newly added images
      setCurrentItem((prev) => {
        if (!prev) return initialItem;
        const prevImages = Array.isArray(prev.images) ? prev.images : [];
        const incomingImages = Array.isArray(initialItem.images) ? initialItem.images : [];
        const mergedImages = [...new Set([...incomingImages, ...prevImages])].filter(Boolean);
        return {
          ...initialItem,
          ...prev,
          images: mergedImages.length > 0 ? mergedImages : (incomingImages.length > 0 ? incomingImages : prevImages),
          imageUrl: mergedImages[0] || prev.imageUrl || initialItem.imageUrl,
          extractedAttributes: prev.extractedAttributes || initialItem.extractedAttributes,
        };
      });
    }
  }, [initialItem]);

  if (!currentItem) return null;

  let parsedAttributes: Record<string, any> = {};
  if (currentItem.extractedAttributes) {
    try {
      parsedAttributes =
        typeof currentItem.extractedAttributes === 'string'
          ? JSON.parse(currentItem.extractedAttributes)
          : currentItem.extractedAttributes;
    } catch (e) {
      console.warn('Could not parse attributes json:', e);
    }
  }

  // Extract cost options
  const costOptions: CostOption[] = Array.isArray(parsedAttributes.costOptions)
    ? parsedAttributes.costOptions
    : [];

  // Extract all photos of this product comprehensively
  const photoList: string[] = [];
  if (currentItem.images && Array.isArray(currentItem.images)) {
    photoList.push(...currentItem.images.filter(Boolean));
  }
  if (parsedAttributes.images && Array.isArray(parsedAttributes.images)) {
    photoList.push(...parsedAttributes.images.filter(Boolean));
  }
  if (currentItem.imageUrl) {
    photoList.push(currentItem.imageUrl);
  }
  const productPhotos = Array.from(new Set(photoList));

  const currentPhoto = productPhotos[activePhotoIndex] || currentItem.imageUrl || null;

  const cost = parseFloat(currentItem.costPrice) || 0;
  const sale = parseFloat(currentItem.salePrice) || 0;
  const profitPerUnit = sale - cost;
  const storedMargin = Number(parsedAttributes.profitMarginPercent);
  const currentMarginPercent = !isNaN(storedMargin) && storedMargin > 0
    ? storedMargin
    : cost > 0
    ? Math.round((profitPerUnit / cost) * 100)
    : 30;

  const totalValuation = sale * (currentItem.stock || 0);

  const tagsList = currentItem.tags
    ? currentItem.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-3.5 sm:p-6 shadow-2xl relative max-h-[92vh] flex flex-col text-slate-800">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 shadow-2xs">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">
                  {currentItem.sku}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  {currentItem.category}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-md font-bold bg-amber-50 text-amber-900 border border-amber-300 flex items-center space-x-1" title={`Proveedor: ${currentItem.supplierName || 'Proveedor Telegram'}`}>
                  <span>👤</span>
                  <span className="font-semibold text-slate-600">Proveedor:</span>
                  <span className="font-black text-amber-950">{currentItem.supplierName || 'Proveedor Telegram'}</span>
                </span>
                {productPhotos.length > 1 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-purple-50 text-purple-700 border border-purple-200 flex items-center space-x-1">
                    <Images className="w-3 h-3 text-purple-600" />
                    <span>{productPhotos.length} fotos</span>
                  </span>
                )}
                {currentItem.videoUrl && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center space-x-1">
                    <Film className="w-3 h-3 text-indigo-600" />
                    <span>Video {parseVideoUrl(currentItem.videoUrl).platform.toUpperCase()}</span>
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-1">{currentItem.name}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 py-4 space-y-5">
          {saveSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2 animate-fadeIn font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {/* Main Visual and Financial Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Multi-Photo Image Preview & Gallery or Video */}
            <div className="md:col-span-1 flex flex-col space-y-2">
              {/* Media Switcher Tab (Photos vs Video) */}
              {currentItem.videoUrl && (
                <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setMediaMode('photo')}
                    className={`flex-1 py-1 rounded-lg text-center transition flex items-center justify-center space-x-1.5 cursor-pointer ${
                      mediaMode === 'photo'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Images className="w-3.5 h-3.5" />
                    <span>Fotos ({productPhotos.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaMode('video')}
                    className={`flex-1 py-1 rounded-lg text-center transition flex items-center justify-center space-x-1.5 cursor-pointer ${
                      mediaMode === 'video'
                        ? 'bg-sky-600 text-white shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Ver Video</span>
                  </button>
                </div>
              )}

              {mediaMode === 'video' && currentItem.videoUrl ? (
                /* Video Player Container */
                <div className="aspect-square rounded-2xl overflow-hidden bg-black border border-slate-800 relative flex items-center justify-center shadow-2xs">
                  {parseVideoUrl(currentItem.videoUrl).isDirect ? (
                    <video
                      ref={(el) => {
                        if (el) {
                          el.muted = false;
                          el.volume = 1.0;
                          const p = el.play();
                          if (p !== undefined) {
                            p.catch(() => {
                              const unmute = () => {
                                el.muted = false;
                                el.volume = 1.0;
                                el.play().catch(() => {});
                                window.removeEventListener('click', unmute);
                                window.removeEventListener('touchstart', unmute);
                              };
                              window.addEventListener('click', unmute, { once: true });
                              window.addEventListener('touchstart', unmute, { once: true });
                              el.muted = true;
                              el.play().catch(() => {});
                            });
                          }
                        }
                      }}
                      onClick={(e) => {
                        const v = e.currentTarget;
                        v.muted = false;
                        v.volume = 1.0;
                      }}
                      src={parseVideoUrl(currentItem.videoUrl).embedUrl}
                      controls
                      controlsList="nodownload novolume"
                      autoPlay
                      muted={false}
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  ) : parseVideoUrl(currentItem.videoUrl).embedUrl ? (
                    <iframe
                      src={parseVideoUrl(currentItem.videoUrl).embedUrl}
                      title={currentItem.name}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full border-0"
                    />
                  ) : (
                    <div className="text-center p-4 text-slate-400 text-xs">
                      <Film className="w-8 h-8 mx-auto mb-2 text-sky-400 opacity-80" />
                      <p className="font-bold text-slate-200">Enlace de video</p>
                      <a
                        href={currentItem.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-400 underline text-[11px] mt-1 block truncate max-w-[200px]"
                      >
                        Abrir video en nueva pestaña
                      </a>
                    </div>
                  )}

                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-black/70 backdrop-blur-xs text-sky-300 border border-white/20">
                    {parseVideoUrl(currentItem.videoUrl).platform.toUpperCase()}
                  </div>
                </div>
              ) : (
                /* Photo Container */
                <div
                  onClick={() => {
                    if (currentPhoto) setIsLightboxOpen(true);
                  }}
                  className={`aspect-square rounded-2xl overflow-hidden bg-slate-50 border border-slate-200 flex items-center justify-center relative group shadow-2xs ${
                    currentPhoto ? 'cursor-zoom-in hover:ring-2 hover:ring-sky-500 transition' : ''
                  }`}
                  title={currentPhoto ? 'Haz clic para agrandar la foto con zoom HD' : ''}
                >
                  {currentPhoto ? (
                    <>
                      <img
                        src={currentPhoto}
                        alt={currentItem.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                        referrerPolicy="no-referrer"
                      />

                      {/* Hover Zoom Badge */}
                      <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white pointer-events-none">
                        <div className="bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center space-x-1.5 shadow-lg">
                          <ZoomIn className="w-4 h-4 text-sky-400" />
                          <span className="text-xs font-bold">Clic para agrandar</span>
                        </div>
                      </div>

                      {/* Botón con solo el icono de basurero dentro de la imagen (sin texto) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCurrentImage();
                        }}
                        disabled={isDeletingPhoto}
                        className="absolute top-2.5 right-2.5 w-8 h-8 rounded-xl bg-slate-900/75 hover:bg-rose-600 text-white flex items-center justify-center transition-all shadow-md cursor-pointer z-20 backdrop-blur-xs border border-white/20 hover:scale-105"
                        title="Eliminar foto actual"
                      >
                        {isDeletingPhoto ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5 text-white" />
                        )}
                      </button>

                      {/* Left/Right Controls if multi photo */}
                      {productPhotos.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivePhotoIndex((prev) =>
                                prev > 0 ? prev - 1 : productPhotos.length - 1
                              );
                            }}
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white flex items-center justify-center transition border border-white/20 cursor-pointer shadow-md opacity-90 hover:opacity-100 z-10"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivePhotoIndex((prev) =>
                                prev < productPhotos.length - 1 ? prev + 1 : 0
                              );
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white flex items-center justify-center transition border border-white/20 cursor-pointer shadow-md opacity-90 hover:opacity-100 z-10"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>

                          {/* Photo counter badge */}
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-xs px-2 py-0.5 rounded-full text-[10px] font-bold text-white border border-white/10 shadow-sm z-10">
                            {activePhotoIndex + 1} / {productPhotos.length}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center select-none bg-slate-100/90 relative">
                      <div className="w-12 h-12 rounded-2xl bg-slate-200/90 flex items-center justify-center mb-2 text-slate-400 shadow-2xs">
                        <ImageOff className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-black text-slate-600 uppercase tracking-wider">
                        Producto sin foto
                      </span>
                      {currentItem.videoUrl && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMediaMode('video');
                          }}
                          className="mt-2.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center space-x-1.5 shadow-sm cursor-pointer transition"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Ver Video Disponible</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowWebImagePicker(true);
                        }}
                        className="mt-3 px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition flex items-center space-x-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Buscar Fotos con IA</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Direct Download, Copy Photo & AI Image Search Actions */}
              {currentPhoto && (
                <div className="pt-0.5 space-y-1.5">
                  <div className={`grid ${productPhotos.length > 1 ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5`}>
                    {/* Botón Descargar foto activa */}
                    <button
                      type="button"
                      disabled={isDownloadingPhoto || isCopyingPhoto}
                      onClick={() => handleDownloadSinglePhoto(currentPhoto, activePhotoIndex + 1)}
                      className="w-full py-1.5 px-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-bold transition flex items-center justify-center space-x-1 cursor-pointer shadow-2xs disabled:opacity-60 whitespace-nowrap min-w-0"
                      title={
                        productPhotos.length > 1
                          ? `Descargar foto #${activePhotoIndex + 1} a tu dispositivo`
                          : 'Descargar foto a tu dispositivo'
                      }
                    >
                      {isDownloadingPhoto ? (
                        <Loader2 className="w-3.5 h-3.5 text-sky-600 animate-spin flex-shrink-0" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                      )}
                      <span className="truncate">Descargar</span>
                    </button>

                    {/* Botón Copiar foto */}
                    <button
                      type="button"
                      disabled={isCopyingPhoto || isDownloadingPhoto}
                      onClick={() => handleCopyPhoto(currentPhoto)}
                      className="w-full py-1.5 px-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold transition flex items-center justify-center space-x-1 cursor-pointer shadow-2xs disabled:opacity-60 whitespace-nowrap min-w-0"
                      title="Copiar imagen al portapapeles para pegar con Ctrl+V"
                    >
                      {isCopyingPhoto ? (
                        <Loader2 className="w-3.5 h-3.5 text-slate-600 animate-spin flex-shrink-0" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                      )}
                      <span className="truncate">Copiar foto</span>
                    </button>

                    {/* Botón Descargar Todas las fotos */}
                    {productPhotos.length > 1 && (
                      <button
                        type="button"
                        disabled={isDownloadingPhoto || isCopyingPhoto}
                        onClick={() => handleDownloadAllPhotos(productPhotos)}
                        className="w-full py-1.5 px-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 text-[11px] font-bold transition flex items-center justify-center space-x-1 cursor-pointer shadow-2xs disabled:opacity-60 whitespace-nowrap min-w-0"
                        title={`Descargar todas las ${productPhotos.length} fotos`}
                      >
                        <Images className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                        <span className="truncate">Todas ({productPhotos.length})</span>
                      </button>
                    )}
                  </div>

                  {/* Botón Buscar más fotos con IA */}
                  <button
                    type="button"
                    onClick={() => setShowWebImagePicker(true)}
                    className="w-full py-1.5 px-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[11px] font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-2xs"
                    title="Buscar fotos de alta calidad con IA en Google y Bing"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Buscar Más Fotos con IA</span>
                  </button>
                </div>
              )}

              {/* Thumbnails Row if multiple photos */}
              {productPhotos.length > 1 && (
                <div className="flex items-center space-x-1.5 overflow-x-auto py-1 scrollbar-thin">
                  {productPhotos.map((photo, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActivePhotoIndex(idx)}
                      className={`w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border transition cursor-pointer ${
                        activePhotoIndex === idx
                          ? 'border-sky-500 ring-2 ring-sky-400 scale-105'
                          : 'border-slate-200 opacity-60 hover:opacity-100'
                      }`}
                      title={`Foto #${idx + 1} - Haz clic para ver`}
                    >
                      <img
                        src={photo}
                        alt={`Miniatura ${idx + 1}`}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Panel de Control de Existencias & Apartados para Compras */}
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2.5 text-xs text-slate-700">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-slate-800 font-bold flex items-center gap-1.5">
                    <Boxes className="w-4 h-4 text-sky-600" />
                    <span className="uppercase tracking-wider text-[11px]">Existencias & Entregas</span>
                  </span>
                  {physicalStock > 0 ? (
                    <span className="inline-flex items-center gap-1 font-black text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200 text-xs shadow-2xs">
                      <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{physicalStock} u. en Bodega</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-black text-purple-800 bg-purple-50 px-2.5 py-0.5 rounded-lg border border-purple-200 text-xs shadow-2xs">
                      <Package className="w-3.5 h-3.5 text-purple-600" />
                      <span>0 u. (Bajo Pedido)</span>
                    </span>
                  )}
                </div>

                {/* Métricas detalladas de inventario con foco en cantidad apartada */}
                <div className="space-y-2">
                  {/* Cantidad apartada para compras */}
                  <div
                    className={`p-3 rounded-xl border transition-all ${
                      totalApartada > 0
                        ? 'bg-amber-50/95 border-amber-300 ring-1 ring-amber-300/40 shadow-xs'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                        <Lock className={`w-4 h-4 ${totalApartada > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
                        <span>Apartado para Compras:</span>
                      </span>
                      <span
                        className={`font-mono font-black text-xs px-2.5 py-0.5 rounded-md border ${
                          totalApartada > 0
                            ? 'text-amber-950 bg-amber-200 border-amber-400 shadow-2xs'
                            : 'text-slate-600 bg-white border-slate-200'
                        }`}
                      >
                        {totalApartada} u.
                      </span>
                    </div>
                    <p className={`text-[10px] mt-1 leading-tight ${totalApartada > 0 ? 'text-amber-900 font-medium' : 'text-slate-500'}`}>
                      {totalApartada > 0
                        ? '🔒 Unidades apartadas y reservadas para entregar a compras de clientes confirmadas.'
                        : '✓ Sin compras pendientes (0 u. apartadas). Todo el stock está disponible.'}
                    </p>

                    {/* Desglose de compras con unidades apartadas */}
                    {linkedOrdersWithPending.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-amber-200/90 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-bold text-amber-900 uppercase tracking-wide">
                          <span>📦 Compras que apartan ({linkedOrdersWithPending.length}):</span>
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5 scrollbar-thin">
                          {linkedOrdersWithPending.map((ord, idx) => (
                            <div
                              key={idx}
                              className="p-1.5 rounded-lg bg-white/90 border border-amber-200 flex items-center justify-between text-[11px] shadow-2xs"
                            >
                              <div className="min-w-0 pr-1.5">
                                <p className="font-bold text-slate-900 truncate leading-tight">
                                  {ord.customerName}
                                </p>
                                <p className="text-[9px] text-slate-500 font-mono">
                                  {ord.orderNumber}
                                </p>
                              </div>
                              <span className="font-mono font-black text-amber-950 bg-amber-100 px-1.5 py-0.5 rounded text-[10px] shrink-0 border border-amber-300">
                                {ord.pendingUnits} u.
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Disponible para Venta */}
                  <div className="p-3 rounded-xl bg-emerald-50/90 border border-emerald-300 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-950 flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>Disponible para Venta:</span>
                      </span>
                      <span className="font-mono font-black text-xs text-emerald-900 bg-white px-2.5 py-0.5 rounded-md border border-emerald-300 shadow-2xs">
                        {availableStock} u.
                      </span>
                    </div>
                    <p className="text-[10px] text-emerald-800 mt-1 leading-tight">
                      Stock libre para venta inmediata en tienda o pedidos nuevos.
                    </p>
                  </div>

                  {/* Por Recibir si hay órdenes de compra pendientes */}
                  {incomingStock > 0 && (
                    <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-300 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sky-950 flex items-center gap-1.5 text-xs">
                          <Truck className="w-3.5 h-3.5 text-sky-600" />
                          <span>Por Recibir (Proveedor):</span>
                        </span>
                        <span className="font-mono font-black text-xs text-sky-900 bg-white px-2 py-0.5 rounded-md border border-sky-300">
                          +{incomingStock} u.
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-slate-500 font-medium">Valorización Inventario:</span>
                  <span className="font-black text-emerald-700 font-mono">
                    ${totalValuation.toFixed(2)} {currency}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-100 text-xs space-y-1">
                  <span className="text-slate-500 font-medium block">Proveedor Asignado:</span>
                  <div className="p-2 rounded-xl bg-amber-50/80 border border-amber-200">
                    <span className="font-bold text-amber-950 break-words block leading-snug" title={currentItem.supplierName || 'Telegram'}>
                      👤 {currentItem.supplierName || 'Telegram'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial and Detail Info */}
            <div className="md:col-span-2 space-y-4">
              {/* Sección Destacada: Unidades Apartadas para Entregar a Compras */}
              <div
                className={`p-3.5 rounded-2xl border transition-all ${
                  totalApartada > 0
                    ? 'bg-gradient-to-br from-amber-50 via-amber-50/70 to-orange-50/50 border-amber-300 shadow-sm'
                    : 'bg-slate-50/80 border-slate-200 shadow-2xs'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 border ${
                        totalApartada > 0
                          ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-2xs'
                          : 'bg-slate-100 text-slate-500 border-slate-300'
                      }`}
                    >
                      <Lock className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                          Apartado para Entregar a Compras
                        </h4>
                        {totalApartada > 0 && (
                          <span className="text-[10px] font-black uppercase px-2 py-0.2 rounded-full bg-amber-200 text-amber-900 border border-amber-300">
                            {totalApartada} {totalApartada === 1 ? 'unidad' : 'unidades'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-slate-900 mt-0.5">
                        {totalApartada > 0 ? (
                          <span className="text-amber-950">
                            Hay <strong className="font-mono text-sm text-amber-900">{totalApartada}</strong>{' '}
                            {totalApartada === 1 ? 'unidad apartada' : 'unidades apartadas'} para despachar a pedidos de compra.
                          </span>
                        ) : (
                          <span className="text-slate-600 font-medium text-xs">
                            ✓ No hay unidades apartadas para entrega. Todo el inventario ({physicalStock} u.) está disponible.
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">En Bodega</span>
                    <span className="font-mono font-black text-xs text-slate-800">{physicalStock} u.</span>
                  </div>
                </div>

                {/* Si hay compras activas vinculadas, listarlas de forma clara y moderna */}
                {totalApartada > 0 && linkedOrdersWithPending.length > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t border-amber-200/80 space-y-1.5">
                    <span className="text-[11px] font-bold text-amber-950 block">
                      Compras y pedidos con unidades apartadas pendientes de entrega:
                    </span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {linkedOrdersWithPending.map((ord) => (
                        <div
                          key={ord.id}
                          className="flex items-center justify-between p-2 rounded-xl bg-white/95 border border-amber-200 text-xs shadow-2xs"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="font-mono font-bold text-slate-900 block truncate">
                              Pedido #{ord.orderNumber} • <span className="font-semibold text-slate-700">{ord.customerName}</span>
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Estado: {ord.status === 'confirmed' ? 'Confirmado (En preparación)' : 'Pendiente'}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-mono font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300 text-xs">
                              {ord.pendingUnits} u. apartadas
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Card Destacada: Proveedor Completo */}
              <div className="p-3 rounded-2xl bg-amber-50/60 border border-amber-200 flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-900 font-bold shrink-0">
                    <User className="w-4 h-4 text-amber-800" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] text-amber-800 font-bold uppercase tracking-wider block">
                      Proveedor del Producto
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-slate-900 break-words block leading-tight">
                      {currentItem.supplierName || 'Proveedor Telegram'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pricing & Commercial Info Box (Cost price is private and only visible/editable in Edit Modal) */}
              {(() => {
                const discountPercent = Math.max(0, Math.min(100, Number(currentItem.discountPercent) || 0));
                const hasDiscount = discountPercent > 0;
                const effectiveSale = hasDiscount ? sale * (1 - discountPercent / 100) : sale;

                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <div>
                        <span className="text-[11px] text-slate-500 block font-bold uppercase tracking-wider">
                          {hasDiscount ? 'Precio de Oferta en Tienda' : 'Precio de Venta al Público (PVP)'}
                        </span>
                        {hasDiscount ? (
                          <div className="mt-1">
                            <div className="flex items-baseline space-x-2">
                              <span className="text-2xl font-black text-rose-600 font-mono">
                                ${effectiveSale.toFixed(2)}
                              </span>
                              <span className="text-sm line-through text-slate-400 font-mono">
                                ${sale.toFixed(2)}
                              </span>
                            </div>
                            <span className="inline-block mt-1 text-[11px] font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-200">
                              🔥 Descuento -{discountPercent}% OFF
                            </span>
                          </div>
                        ) : (
                          <div className="mt-1">
                            <span className="text-2xl font-black text-emerald-700 font-mono">
                              ${sale.toFixed(2)}
                            </span>
                            <span className="text-xs text-slate-500 block font-medium mt-0.5">
                              {currency} por unidad
                            </span>
                          </div>
                        )}
                      </div>

                      {(() => {
                        const itemTaxRate = Number(currentItem.taxRate) || 15;
                        const costWithout =
                          currentItem.costWithoutTax !== undefined && currentItem.costWithoutTax !== null
                            ? Number(currentItem.costWithoutTax)
                            : cost / (1 + itemTaxRate / 100);
                        const costWith =
                          currentItem.costWithTax !== undefined && currentItem.costWithTax !== null
                            ? Number(currentItem.costWithTax)
                            : cost;

                        let parsedAttr: Record<string, any> = {};
                        if (currentItem.extractedAttributes) {
                          try {
                            parsedAttr =
                              typeof currentItem.extractedAttributes === 'string'
                                ? JSON.parse(currentItem.extractedAttributes)
                                : currentItem.extractedAttributes;
                          } catch {}
                        }
                        const margin =
                          parsedAttr.profitMarginPercent !== undefined
                            ? Number(parsedAttr.profitMarginPercent)
                            : costWith > 0
                            ? Math.round(((sale - costWith) / costWith) * 100)
                            : 30;

                        const applySaleTax =
                          currentItem.applySaleTax !== undefined
                            ? Boolean(currentItem.applySaleTax)
                            : parsedAttr.applySaleTax !== undefined
                            ? Boolean(parsedAttr.applySaleTax)
                            : false;
                        const saleTaxPercent =
                          currentItem.saleTaxPercent !== undefined && !isNaN(Number(currentItem.saleTaxPercent))
                            ? Number(currentItem.saleTaxPercent)
                            : parsedAttr.saleTaxPercent !== undefined && !isNaN(Number(parsedAttr.saleTaxPercent))
                            ? Number(parsedAttr.saleTaxPercent)
                            : itemTaxRate;
                        const baseSaleBeforeTax = applySaleTax && saleTaxPercent > 0 ? sale / (1 + saleTaxPercent / 100) : sale;
                        const unitProfit = baseSaleBeforeTax - costWith;

                        if (!showCosts) {
                          return (
                            <div className="flex flex-col justify-between p-3 rounded-xl bg-amber-50/80 border border-amber-200/90 text-xs">
                              <div>
                                <div className="flex items-center space-x-1.5 text-amber-900 font-bold">
                                  <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                  <span>Precios de Costo Protegidos</span>
                                </div>
                                <p className="text-[11px] text-amber-800 mt-1 leading-snug">
                                  Costos de proveedor privados. Haz clic para revelar el desglose con y sin IVA.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowCosts(true)}
                                className="mt-2.5 inline-flex items-center justify-center space-x-1 px-2.5 py-1.5 rounded-lg bg-amber-200/90 hover:bg-amber-300 text-amber-950 text-xs font-bold transition cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5 text-amber-800" />
                                <span>Ver Costo (Sin / Con IVA)</span>
                              </button>
                            </div>
                          );
                        }

                        return (
                          <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-amber-950 flex items-center space-x-1">
                                <DollarSign className="w-3.5 h-3.5 text-amber-700" />
                                <span>Desglose de Costo</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setShowCosts(false)}
                                className="p-1 rounded text-amber-800 hover:bg-amber-100 transition cursor-pointer"
                                title="Ocultar costos"
                              >
                                <EyeOff className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div className="bg-white/80 p-2 rounded-lg border border-amber-200">
                                <span className="text-slate-500 block text-[10px] uppercase font-bold">Sin IVA</span>
                                <span className="font-mono font-black text-slate-800 text-sm">
                                  ${costWithout.toFixed(2)}
                                </span>
                              </div>
                              <div className="bg-white/80 p-2 rounded-lg border border-amber-200">
                                <span className="text-amber-800 block text-[10px] uppercase font-bold">
                                  Con IVA ({itemTaxRate}%)
                                </span>
                                <span className="font-mono font-black text-amber-950 text-sm">
                                  ${costWith.toFixed(2)}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-amber-200">
                              <div className="flex items-center gap-1.5 text-slate-700 flex-wrap">
                                <span>Margen: <strong className="text-slate-900 font-mono">+{margin}%</strong></span>
                                <span className="text-slate-400">•</span>
                                <span className="text-emerald-800 font-bold">
                                  Ganancia: <strong className="font-mono text-emerald-900 font-black">{unitProfit >= 0 ? `+$${unitProfit.toFixed(2)}` : `-$${Math.abs(unitProfit).toFixed(2)}`}/u</strong>
                                </span>
                                {applySaleTax && (
                                  <span className="text-[10px] font-mono font-bold bg-amber-200/80 text-amber-950 px-1.5 py-0.2 rounded border border-amber-300">
                                    +IVA Venta {saleTaxPercent}%
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => onEdit(currentItem)}
                                className="text-[11px] font-bold text-amber-900 hover:underline inline-flex items-center space-x-1 cursor-pointer"
                              >
                                <Edit className="w-3 h-3" />
                                <span>Editar</span>
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center space-x-1.5">
                    <span>Descripción Comercial</span>
                  </h4>
                </div>

                {descSavedToast && (
                  <div className="mb-2 p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-1.5 animate-fadeIn font-medium">
                    <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span>{descSavedToast}</span>
                  </div>
                )}

                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed whitespace-pre-line">
                  {currentItem.description || 'Sin descripción detallada.'}
                </div>
              </div>

              {/* AI Extracted Attributes */}
              {Object.keys(parsedAttributes).length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center">
                    <Sparkles className="w-3.5 h-3.5 mr-1 text-sky-600" />
                    Atributos y Especificaciones Extraídas por Gemini
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(parsedAttributes)
                      .filter(([key]) => key !== 'images' && key !== 'totalPhotos' && key !== 'costOptions')
                      .map(([key, value]) => (
                        <div
                          key={key}
                          className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center"
                        >
                          <span className="text-slate-500 capitalize text-[11px] font-medium">
                            {key.replace(/_/g, ' ')}:
                          </span>
                          <span className="font-semibold text-slate-800 truncate ml-2">
                            {Array.isArray(value) ? value.join(', ') : String(value)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              {tagsList.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center">
                    <Tag className="w-3.5 h-3.5 mr-1 text-slate-500" />
                    Etiquetas de búsqueda
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {tagsList.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-full text-xs bg-slate-100 text-slate-700 border border-slate-200 font-medium"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SQL Record Info */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center font-mono">
              <Database className="w-3.5 h-3.5 mr-1 text-emerald-600" />
              PostgreSQL ID: {currentItem.id} | User ID: {currentItem.userId}
            </span>
            <span>Creado: {new Date(currentItem.createdAt).toLocaleDateString('es-ES')}</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 sm:pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
            {currentItem.status === 'archived' ? (
              <button
                type="button"
                disabled={isTogglingStatus}
                onClick={() => setStatusConfirmMode('activate')}
                className="flex-1 sm:flex-initial px-3 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                title="Activar este producto para que esté disponible en inventario y catálogo"
              >
                {isTogglingStatus ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                )}
                <span>Activar Producto</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isTogglingStatus}
                onClick={() => setStatusConfirmMode('deactivate')}
                className="flex-1 sm:flex-initial px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                title="Desactivar este producto sin eliminarlo de la base de datos"
              >
                {isTogglingStatus ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600" />
                ) : (
                  <Power className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span>Desactivar</span>
              </button>
            )}

            {onDelete && currentItem && (
              transactionLink?.isLinked ? (
                <button
                  type="button"
                  onClick={() => onDelete(currentItem.id)}
                  className="flex-1 sm:flex-initial px-3 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  title={`Protegido: ${transactionLink.reasonText}. Haz clic para ver detalles contables.`}
                >
                  <Lock className="w-3.5 h-3.5 text-amber-700" />
                  <span>Protegido ({transactionLink.salesCount + transactionLink.purchasesCount})</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onDelete(currentItem.id)}
                  className="flex-1 sm:flex-initial px-3 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-600 hover:text-white border border-rose-300 text-rose-700 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs group"
                  title="Eliminar producto (apto por no tener compras ni ventas vinculadas)"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600 group-hover:text-white transition" />
                  <span>Eliminar</span>
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer text-center"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => onEdit(currentItem)}
              className="flex-2 sm:flex-initial px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Editar Producto</span>
            </button>
          </div>
        </div>
      </div>

      {/* Full Resolution Photo Lightbox Modal con métricas de Apartado y existencias */}
      {isLightboxOpen && productPhotos.length > 0 && (
        <ImageLightboxModal
          isOpen={isLightboxOpen}
          images={productPhotos}
          currentIndex={activePhotoIndex}
          onClose={() => setIsLightboxOpen(false)}
          onNavigate={(newIdx) => setActivePhotoIndex(newIdx)}
          onSetAsCover={async (coverUrl) => {
            try {
              const res = await authFetch(`/api/inventory/${currentItem.id}/set-cover-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl: coverUrl }),
              });
              if (res.ok) {
                const updated = await res.json();
                setCurrentItem(updated);
                onItemUpdated?.(updated);
              }
            } catch (err) {
              console.error('Failed to set cover photo:', err);
            }
          }}
          onDeletePhoto={async () => {
            await handleDeleteCurrentImage();
          }}
          productName={currentItem.name}
          productSku={currentItem.sku}
          isCover={productPhotos[activePhotoIndex] === currentItem.imageUrl}
          apartadaStock={totalApartada}
          physicalStock={physicalStock}
          availableStock={availableStock}
          pendingOrdersCount={linkedOrdersWithPending.length}
          pendingOrdersDetails={linkedOrdersWithPending.map((o) => ({
            id: o.id,
            customerName: o.customerName,
            quantity: o.pendingUnits,
            date: o.createdAt,
            orderNumber: o.orderNumber,
          }))}
          salePrice={sale}
          currency={currency}
        />
      )}

      {/* Status Change Confirmation Modal (Activate & Deactivate) */}
      <DeactivateConfirmationModal
        isOpen={Boolean(statusConfirmMode)}
        mode={statusConfirmMode || 'deactivate'}
        item={currentItem}
        currency={currency}
        onClose={() => {
          if (!isTogglingStatus) setStatusConfirmMode(null);
        }}
        onConfirm={async () => {
          if (!currentItem || isTogglingStatus || !statusConfirmMode) return;
          setIsTogglingStatus(true);
          const targetStatus = statusConfirmMode === 'activate' ? 'available' : 'archived';
          try {
            const res = await authFetch(`/api/inventory/${currentItem.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: targetStatus }),
            });
            if (res.ok) {
              const updated = await res.json();
              setCurrentItem(updated);
              onItemUpdated?.(updated);
              setSaveSuccessMsg(
                targetStatus === 'available'
                  ? '🟢 Producto activado correctamente (disponible en inventario y tienda online)'
                  : '⏸️ Producto desactivado correctamente (no se mostrará en catálogo activo)'
              );
            }
          } catch (err) {
            console.error('Failed to update product status:', err);
          } finally {
            setIsTogglingStatus(false);
            setStatusConfirmMode(null);
          }
        }}
        isProcessing={isTogglingStatus}
      />

      {/* Web Image Search & Selection Modal */}
      {showWebImagePicker && currentItem && (
        <ProductWebImagePicker
          item={currentItem}
          isOpen={showWebImagePicker}
          onClose={() => setShowWebImagePicker(false)}
          onImagesAdded={(updatedItem, count) => {
            setCurrentItem(updatedItem);
            onItemUpdated?.(updatedItem);
            setShowWebImagePicker(false);
            setActivePhotoIndex(0);
            setSaveSuccessMsg(`✨ ¡${count} foto${count === 1 ? '' : 's'} agregada${count === 1 ? '' : 's'} al producto!`);
          }}
        />
      )}
    </div>
  );
};

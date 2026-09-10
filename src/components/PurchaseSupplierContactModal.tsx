import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  MessageCircle,
  Copy,
  Check,
  Download,
  ExternalLink,
  Sparkles,
  Phone,
  AlertCircle,
  Loader2,
  Package,
  Layers,
  Image as ImageIcon,
  Building2,
  ChevronRight,
  Info,
} from 'lucide-react';
import { PurchaseOrder, InventoryItem, Supplier } from '../types.ts';
import {
  generatePurchasePhotosCollage,
  copyBlobToClipboard,
  copySinglePhotoToClipboard,
  copyMultipleIndividualPhotosToClipboard,
  groupPurchasePhotosBySupplier,
  SupplierPhotoGroup,
  PurchasePhotoItem,
} from '../utils/purchasePhotosClipboard.ts';
import { normalizeEcuadorPhone, buildWhatsAppLink } from '../utils/phone.ts';
import { downloadMultipleImages } from '../utils/image-drag-copy.ts';

interface PurchaseSupplierContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchase: PurchaseOrder | null;
  inventoryItems?: InventoryItem[];
  suppliers?: Supplier[];
  onUpdatePurchaseContact?: (purchaseId: number, phone: string, supplierName?: string) => Promise<boolean | void>;
  showToast?: (msg: string) => void;
  initialAction?: 'whatsapp' | 'copy_photos' | null;
}

export const PurchaseSupplierContactModal: React.FC<PurchaseSupplierContactModalProps> = ({
  isOpen,
  onClose,
  purchase,
  inventoryItems = [],
  suppliers = [],
  onUpdatePurchaseContact,
  showToast,
  initialAction = null,
}) => {
  // Group products and photos by supplier
  const supplierGroups = useMemo<SupplierPhotoGroup[]>(() => {
    if (!purchase) return [];
    return groupPurchasePhotosBySupplier(purchase, inventoryItems, suppliers);
  }, [purchase, inventoryItems, suppliers]);

  // All photo items from the entire purchase order
  const allPhotoItems = useMemo<PurchasePhotoItem[]>(() => {
    if (!purchase || !Array.isArray(purchase.items)) return [];
    const list: PurchasePhotoItem[] = [];
    purchase.items.forEach((item) => {
      let cover = item.imageUrl && item.imageUrl.trim() ? item.imageUrl.trim() : null;
      if (!cover && inventoryItems && inventoryItems.length > 0) {
        const matched = inventoryItems.find(
          (inv) =>
            (item.inventoryItemId && inv.id === item.inventoryItemId) ||
            (item.sku && inv.sku && inv.sku.trim().toLowerCase() === item.sku.trim().toLowerCase()) ||
            (inv.name && item.name && inv.name.trim().toLowerCase() === item.name.trim().toLowerCase())
        );
        if (matched?.imageUrl && matched.imageUrl.trim()) {
          cover = matched.imageUrl.trim();
        }
      }
      list.push({
        name: item.name || 'Producto',
        imageUrl: cover || '',
        quantity: Number(item.quantity) || 1,
        sku: item.sku || '',
        costPrice: item.costPrice,
        inventoryItemId: item.inventoryItemId,
        supplierName: item.supplierName || purchase.supplierName || 'Proveedor',
      });
    });
    return list;
  }, [purchase, inventoryItems]);

  const [activeSupplierIndex, setActiveSupplierIndex] = useState(0);
  const [phoneOverrides, setPhoneOverrides] = useState<Record<string, string>>({});
  const [editingPhoneFor, setEditingPhoneFor] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  // Collage preview for ALL products
  const [allProductsPreviewUrl, setAllProductsPreviewUrl] = useState<string | null>(null);
  const [allProductsBlob, setAllProductsBlob] = useState<Blob | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [copiedAllSuccess, setCopiedAllSuccess] = useState(false);

  // Collage generation states per supplier
  const [generatingForSupplier, setGeneratingForSupplier] = useState<string | null>(null);
  const [copiedSupplierSuccess, setCopiedSupplierSuccess] = useState<string | null>(null);
  const [collagePreviewUrls, setCollagePreviewUrls] = useState<Record<string, string>>({});
  const [copiedSingleIndex, setCopiedSingleIndex] = useState<number | null>(null);

  // Active group
  const activeGroup: SupplierPhotoGroup | null = supplierGroups[activeSupplierIndex] || supplierGroups[0] || null;

  // Active phone calculation (accounting for overrides or edited values)
  const activePhone = activeGroup
    ? (phoneOverrides[activeGroup.supplierName] ?? activeGroup.phone)
    : '';
  const activeNorm = normalizeEcuadorPhone(activePhone);
  const activeHasPhone = activeNorm.isValid || activeNorm.whatsappDigits.length >= 8;

  const [isDownloadingBatch, setIsDownloadingBatch] = useState(false);

  const handleDownloadAllIndividualPhotos = async () => {
    if (!allPhotoItems || allPhotoItems.length === 0) return;
    const validUrls = allPhotoItems.map((it) => it.imageUrl).filter((url): url is string => Boolean(url && url.trim()));
    if (validUrls.length === 0) {
      showToast?.('⚠️ No hay fotos de productos disponibles para descargar.');
      return;
    }

    setIsDownloadingBatch(true);
    try {
      const count = await downloadMultipleImages(
        validUrls,
        `Orden_${purchase?.purchaseNumber || purchase?.id || 'pedido'}`
      );
      showToast?.(`✓ ¡${count} fotos descargadas! Agrégalas juntas en WhatsApp desde el ícono de adjuntar 📎 (Fotos y videos).`);
    } catch (err) {
      console.error('Error descargando paquete de fotos:', err);
      showToast?.('⚠️ Ocurrió un error al descargar las fotos.');
    } finally {
      setIsDownloadingBatch(false);
    }
  };

  const handleGenerateAndCopyAllProducts = async (autoCopy = false) => {
    if (!purchase || allPhotoItems.length === 0) return;
    setIsGeneratingAll(true);
    try {
      const validPhotos = allPhotoItems.filter((it) => Boolean(it.imageUrl));
      const { blob, dataUrl } = await generatePurchasePhotosCollage(
        purchase,
        validPhotos.length > 0 ? validPhotos : allPhotoItems,
        purchase.supplierName || 'Todos'
      );
      setAllProductsPreviewUrl(dataUrl);
      setAllProductsBlob(blob);

      if (autoCopy) {
        const result = await copyMultipleIndividualPhotosToClipboard(validPhotos.length > 0 ? validPhotos : allPhotoItems);
        setCopiedAllSuccess(true);
        showToast?.(`✓ ¡${result.count} fotos copiadas individualmente! Presiona Ctrl+V para pegarlas.`);
        setTimeout(() => setCopiedAllSuccess(false), 3500);
      }
    } catch (err: any) {
      console.error('Error generando o copiando fotos de productos:', err);
      showToast?.(err?.message || 'No se pudieron copiar las fotos al portapapeles.');
    } finally {
      setIsGeneratingAll(false);
    }
  };

  // Reset or initialize on modal open
  useEffect(() => {
    if (!purchase || !isOpen) {
      setActiveSupplierIndex(0);
      setCopiedSupplierSuccess(null);
      setGeneratingForSupplier(null);
      setCollagePreviewUrls({});
      setEditingPhoneFor(null);
      setCopiedAllSuccess(false);
      return;
    }

    setActiveSupplierIndex(0);

    // Auto-generate preview of all products
    handleGenerateAndCopyAllProducts(initialAction === 'copy_photos');

    if (initialAction === 'whatsapp' && supplierGroups.length === 1 && supplierGroups[0].hasPhone) {
      const url = buildWhatsAppLink(supplierGroups[0].phone);
      window.open(url, '_blank');
    }
  }, [purchase, isOpen, initialAction]);

  if (!isOpen || !purchase) return null;

  // Handlers
  const handleOpenDirectChat = (group: SupplierPhotoGroup) => {
    const rawPhone = phoneOverrides[group.supplierName] ?? group.phone;
    const norm = normalizeEcuadorPhone(rawPhone);

    if (!norm.whatsappDigits || norm.whatsappDigits.length < 8) {
      setEditingPhoneFor(group.supplierName);
      setPhoneInput(rawPhone || '');
      showToast?.(`⚠️ Ingresa el número de WhatsApp para ${group.supplierName}`);
      return;
    }

    // Direct chat link without pre-filled text
    const url = buildWhatsAppLink(norm.whatsappDigits);
    window.open(url, '_blank');
  };

  const handleGenerateAndCopy = async (group: SupplierPhotoGroup) => {
    if (!group.photoItems || group.photoItems.length === 0) {
      showToast?.(`⚠️ ${group.supplierName} no tiene artículos con foto de portada disponible.`);
      return;
    }

    setGeneratingForSupplier(group.supplierName);
    setCopiedSupplierSuccess(null);

    try {
      const { blob, dataUrl } = await generatePurchasePhotosCollage(
        purchase,
        group.photoItems,
        group.supplierName
      );

      setCollagePreviewUrls((prev) => ({ ...prev, [group.supplierName]: dataUrl }));
      const result = await copyMultipleIndividualPhotosToClipboard(group.photoItems);
      setCopiedSupplierSuccess(group.supplierName);
      showToast?.(`✓ ¡${result.count} fotos de ${group.supplierName} copiadas individualmente al portapapeles! Ahora presiona Ctrl+V en WhatsApp.`);
    } catch (err: any) {
      console.error('Error generating or copying collage:', err);
      showToast?.(
        err?.message || 'No se pudo copiar directamente al portapapeles. Usa el botón de descarga.'
      );
    } finally {
      setGeneratingForSupplier(null);
    }
  };

  const handleCopySingle = async (item: PurchasePhotoItem, idx: number) => {
    try {
      setCopiedSingleIndex(idx);
      await copySinglePhotoToClipboard(item.imageUrl, item.name);
      showToast?.(`✓ Foto de "${item.name}" copiada al portapapeles`);
      setTimeout(() => setCopiedSingleIndex(null), 2500);
    } catch (err) {
      console.error('Error copying single photo:', err);
      showToast?.('⚠️ No se pudo copiar la foto individual.');
      setCopiedSingleIndex(null);
    }
  };

  const handleStartEditingPhone = (group: SupplierPhotoGroup) => {
    const current = phoneOverrides[group.supplierName] ?? group.phone;
    setEditingPhoneFor(group.supplierName);
    setPhoneInput(current);
  };

  const handleSavePhone = async (supplierName: string) => {
    if (!phoneInput.trim()) return;
    setIsSavingPhone(true);
    try {
      setPhoneOverrides((prev) => ({ ...prev, [supplierName]: phoneInput.trim() }));
      setEditingPhoneFor(null);

      // If this group corresponds to the purchase's primary supplier, persist to purchase
      if (
        onUpdatePurchaseContact &&
        (!purchase.supplierName || purchase.supplierName.trim().toLowerCase() === supplierName.trim().toLowerCase())
      ) {
        await onUpdatePurchaseContact(purchase.id, phoneInput.trim(), supplierName);
      }
      showToast?.(`✓ Teléfono de WhatsApp guardado para ${supplierName}`);
    } catch (err) {
      console.error('Error saving supplier phone:', err);
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleDownloadCollage = (supplierName: string) => {
    const url = collagePreviewUrls[supplierName];
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `portadas_orden_${purchase.purchaseNumber}_${supplierName.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const hasMultipleSuppliers = supplierGroups.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-5 text-white flex items-center justify-between shrink-0 border-b border-white/10">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-black shrink-0">
              <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Orden #{purchase.purchaseNumber}
                </span>
                <span className="text-xs text-slate-300 font-medium">Consulta de Disponibilidad & Fotos</span>
                {hasMultipleSuppliers && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {supplierGroups.length} Proveedores distintos
                  </span>
                )}
              </div>
              <h3 className="text-base sm:text-lg font-black text-white truncate mt-0.5">
                {hasMultipleSuppliers ? 'Productos Agrupados por Proveedor' : (purchase.supplierName || 'Proveedor')}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0 ml-2"
            title="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-slate-800">
          {/* Supplier Selector Tabs (When multiple suppliers exist) */}
          {hasMultipleSuppliers && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  Selecciona el Proveedor a Contactar:
                </label>
                <span className="text-[11px] text-slate-500 font-medium">
                  {supplierGroups.length} grupos detectados
                </span>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {supplierGroups.map((grp, idx) => {
                  const isSelected = idx === activeSupplierIndex;
                  const currentPhone = phoneOverrides[grp.supplierName] ?? grp.phone;
                  const norm = normalizeEcuadorPhone(currentPhone);
                  const hasValidPhone = norm.isValid || norm.whatsappDigits.length >= 8;

                  return (
                    <button
                      key={grp.supplierName}
                      type="button"
                      onClick={() => {
                        setActiveSupplierIndex(idx);
                        setCopiedSupplierSuccess(null);
                      }}
                      className={`px-3.5 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 transition cursor-pointer border shrink-0 text-left ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-200'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-black flex items-center gap-1.5">
                          <span>{grp.supplierName}</span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              hasValidPhone ? (isSelected ? 'bg-emerald-300' : 'bg-emerald-500') : 'bg-slate-300'
                            }`}
                            title={hasValidPhone ? 'Teléfono registrado' : 'Sin teléfono'}
                          />
                        </span>
                        <span
                          className={`text-[10px] font-normal ${
                            isSelected ? 'text-indigo-100' : 'text-slate-500'
                          }`}
                        >
                          {grp.photoItems.length} {grp.photoItems.length === 1 ? 'foto' : 'fotos'} • {grp.totalUnits} un.
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active Supplier Contact & Photo Actions Card */}
          {activeGroup && (
            <div className="bg-slate-50/80 border border-slate-200 rounded-3xl p-4 sm:p-5 space-y-4 shadow-2xs">
              {/* Active Supplier Header Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black shrink-0 shadow-2xs">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                      Proveedor Activo
                    </div>
                    <h4 className="text-base font-black text-slate-900">
                      {activeGroup.supplierName}
                    </h4>
                    <div className="text-[11px] text-slate-500">
                      {activeGroup.allItems.length} {activeGroup.allItems.length === 1 ? 'producto' : 'productos'} ({activeGroup.totalUnits} unidades) • ${activeGroup.totalCost.toFixed(2)} USD
                    </div>
                  </div>
                </div>

                {/* Quick Stats Pill */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 shadow-2xs">
                    📷 {activeGroup.photoItems.length} {activeGroup.photoItems.length === 1 ? 'portada' : 'portadas'}
                  </span>
                </div>
              </div>

              {/* Action Buttons Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 1. WhatsApp Button (NO automated message, ONLY opens chat) */}
                <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                        <MessageCircle className="w-4 h-4 text-emerald-600" />
                        Chat de WhatsApp
                      </span>
                      {activeHasPhone && editingPhoneFor !== activeGroup.supplierName && (
                        <button
                          type="button"
                          onClick={() => handleStartEditingPhone(activeGroup)}
                          className="text-[11px] text-emerald-700 hover:text-emerald-900 underline font-semibold cursor-pointer"
                        >
                          Editar Teléfono
                        </button>
                      )}
                    </div>

                    {/* Phone Editor / Display */}
                    {editingPhoneFor === activeGroup.supplierName || !activeHasPhone ? (
                      <div className="mt-2.5 space-y-2">
                        <label className="text-[11px] font-bold text-slate-700 block">
                          Teléfono WhatsApp de {activeGroup.supplierName}:
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            type="tel"
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value)}
                            placeholder="Ej: 0987654321 o +593..."
                            className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-slate-800"
                          />
                          <button
                            type="button"
                            onClick={() => handleSavePhone(activeGroup.supplierName)}
                            disabled={isSavingPhone || !phoneInput.trim()}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
                          >
                            {isSavingPhone ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <div className="text-sm font-black text-emerald-950 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{activeNorm.formattedLocal || activePhone}</span>
                        </div>
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          Abre el chat directo sin mensajes prellenados.
                        </p>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenDirectChat(activeGroup)}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Abrir Chat de WhatsApp</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                  </button>
                </div>

                {/* Opción 2: Imagen Mosaico Consolidada de Fotos Originales (Sin texto ni cantidades) */}
                <div className="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-200 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        Opción 2: Mosaico de Fotos Originales (1 Ctrl+V en WhatsApp)
                      </span>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                        {allPhotoItems.length} {allPhotoItems.length === 1 ? 'producto' : 'productos'}
                      </span>
                    </div>
                    <p className="text-[11px] text-indigo-700 mt-2 leading-relaxed">
                      Une las <strong>fotos originales de cada producto</strong> en una sola imagen limpia de alta resolución (sin texto ni cantidades). Con 1 solo <strong>Ctrl + V</strong> se envía completa en WhatsApp Web.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleGenerateAndCopyAllProducts(true)}
                      disabled={isGeneratingAll || allPhotoItems.length === 0}
                      className={`w-full py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer active:scale-98 ${
                        copiedAllSuccess
                          ? 'bg-emerald-600 text-white'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50'
                      }`}
                    >
                      {isGeneratingAll ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Generando Mosaico...</span>
                        </>
                      ) : copiedAllSuccess ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-200" />
                          <span>¡Mosaico Copiado al Portapapeles!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copiar Mosaico de Fotos (1 Ctrl+V)</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadAllIndividualPhotos}
                      disabled={isDownloadingBatch || allPhotoItems.length === 0}
                      className="w-full sm:w-auto py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 text-indigo-900 border border-indigo-200 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap shadow-2xs"
                      title="Descarga todas las fotos individuales a tu equipo"
                    >
                      {isDownloadingBatch ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-indigo-600" />
                      )}
                      <span>Descargar Paquete (.jpg)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Vista previa de la imagen copiada de todos los productos */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
                  <span className="flex items-center gap-1.5 font-bold text-slate-800">
                    <ImageIcon className="w-4 h-4 text-indigo-600" />
                    Vista previa del Mosaico de Fotos Originales
                  </span>
                  {allProductsPreviewUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!allProductsPreviewUrl) return;
                        const a = document.createElement('a');
                        a.href = allProductsPreviewUrl;
                        a.download = `Orden_${purchase.purchaseNumber || purchase.id}_Fotos.png`;
                        a.click();
                      }}
                      className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer text-[11px] font-bold"
                    >
                      <Download className="w-3 h-3" />
                      Descargar Mosaico (.png)
                    </button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center p-2">
                  {isGeneratingAll ? (
                    <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                      <span className="text-xs font-medium">Generando vista previa del mosaico de fotos...</span>
                    </div>
                  ) : allProductsPreviewUrl ? (
                    <img
                      src={allProductsPreviewUrl}
                      alt="Vista previa del mosaico de fotos originales"
                      className="w-full h-auto object-contain rounded-lg shadow-2xs"
                    />
                  ) : (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      No hay vista previa disponible
                    </div>
                  )}
                </div>
              </div>

              {/* Opción 3: Fotos Individuales, Arrastrar y Soltar (Drag & Drop) */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-indigo-600" />
                    Opción 3: Fotos Individuales & Arrastrar a WhatsApp
                  </h5>
                  <span className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                    <span>💡 Tip:</span> Arrastra cualquier foto directamente a WhatsApp Web
                  </span>
                </div>

                {activeGroup.photoItems.length === 0 ? (
                  <div className="py-6 px-4 text-center rounded-2xl border border-dashed border-slate-300 text-slate-500 bg-white">
                    <AlertCircle className="w-7 h-7 mx-auto mb-1.5 text-slate-400" />
                    <p className="text-xs font-semibold">
                      Los artículos de este proveedor no tienen fotos de portada cargadas.
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Agrega fotos a los productos en Inventario para incluirlos en la lista.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                    {activeGroup.photoItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2.5 transition shadow-2xs"
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <div
                            className="relative group/thumb cursor-grab active:cursor-grabbing shrink-0"
                            title="Haz clic sostenido y arrastra la foto al chat de WhatsApp Web"
                          >
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              draggable="true"
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/uri-list', item.imageUrl);
                                e.dataTransfer.setData('text/plain', item.imageUrl);
                              }}
                              className="w-11 h-11 object-cover rounded-lg border border-slate-200 bg-slate-50 shadow-2xs group-hover/thumb:scale-105 transition"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">
                              {item.name}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <span className="font-bold text-emerald-700">Cant: {item.quantity}</span>
                              {item.sku && <span>• SKU: {item.sku}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopySingle(item, idx)}
                            className="p-1.5 rounded-lg bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200 transition cursor-pointer"
                            title="Copiar foto individual (pegar con Ctrl+V en WhatsApp)"
                          >
                            {copiedSingleIndex === idx ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (!item.imageUrl) return;
                              const a = document.createElement('a');
                              a.href = item.imageUrl;
                              a.download = `${item.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
                              a.click();
                            }}
                            className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-800 border border-slate-200 transition cursor-pointer"
                            title="Descargar esta foto individual"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick Overview of ALL Suppliers (When multiple suppliers exist) */}
          {hasMultipleSuppliers && (
            <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3">
              <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-slate-500" />
                Resumen Rápido de Todos los Proveedores ({supplierGroups.length})
              </h5>
              <div className="divide-y divide-slate-100">
                {supplierGroups.map((grp, idx) => {
                  const currentPhone = phoneOverrides[grp.supplierName] ?? grp.phone;
                  const norm = normalizeEcuadorPhone(currentPhone);
                  const isCopied = copiedSupplierSuccess === grp.supplierName;
                  const isGenerating = generatingForSupplier === grp.supplierName;

                  return (
                    <div
                      key={grp.supplierName}
                      className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-black text-slate-900 truncate">
                            {grp.supplierName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {grp.photoItems.length} fotos • {grp.totalUnits} un. • Tel: {norm.formattedLocal || 'Sin teléfono'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSupplierIndex(idx);
                            handleGenerateAndCopy(grp);
                          }}
                          disabled={isGenerating || grp.photoItems.length === 0}
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 border ${
                            isCopied
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-200'
                          } disabled:opacity-50`}
                          title={`Copiar portadas de ${grp.supplierName}`}
                        >
                          {isGenerating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isCopied ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>Copiar Portadas ({grp.photoItems.length})</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveSupplierIndex(idx);
                            handleOpenDirectChat(grp);
                          }}
                          className="px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white transition cursor-pointer flex items-center gap-1 shadow-2xs"
                          title={`Abrir chat directo de WhatsApp con ${grp.supplierName}`}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Abrir Chat</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            💡 <strong>WhatsApp directo:</strong> Al pulsar Abrir Chat se abre la conversación limpia sin textos prellenados; pega las fotos con <kbd className="font-mono bg-white px-1 py-0.5 rounded border border-slate-300 font-bold text-slate-800">Ctrl + V</kbd>.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer shrink-0 ml-2"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Search,
  Globe,
  Check,
  CheckCircle2,
  Plus,
  Loader2,
  X,
  ExternalLink,
  ZoomIn,
  Image as ImageIcon,
  Sparkles,
  RefreshCw,
  Star,
  Layers,
  Wand2,
  SlidersHorizontal,
  ChevronDown,
  Tag,
  Eye,
} from 'lucide-react';
import { InventoryItem } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { ImageLightboxModal, LightboxImageItem } from './ImageLightboxModal.tsx';

export interface WebImageResult {
  url: string;
  thumbnailUrl?: string;
  title: string;
  source: string;
  width?: number;
  height?: number;
  tag?: string;
  confidence?: string;
  isAiGenerated?: boolean;
}

export interface AiProductVisualProfile {
  brand?: string;
  model?: string;
  exactProductName: string;
  color?: string;
  category?: string;
  distinctiveFeatures?: string[];
  recommendedQueries: string[];
}

interface ProductWebImagePickerProps {
  item: InventoryItem | (Partial<InventoryItem> & { name: string; id?: number });
  isOpen: boolean;
  onClose: () => void;
  onImagesAdded: (updatedItem: any, addedCount: number, newUrls?: string[]) => void;
}

export const ProductWebImagePicker: React.FC<ProductWebImagePickerProps> = ({
  item,
  isOpen,
  onClose,
  onImagesAdded,
}) => {
  const { authFetch } = useAuth();
  const [searchQuery, setSearchQuery] = useState<string>(item.name || '');
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [results, setResults] = useState<WebImageResult[]>([]);
  const [profile, setProfile] = useState<AiProductVisualProfile | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [setAsCover, setSetAsCover] = useState<boolean>(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchStep, setSearchStep] = useState<number>(0);

  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Helper to ensure clean, full URL
  const sanitizeUrl = (rawUrl: string, fallbackThumb?: string): string => {
    let clean = (rawUrl || '').trim();
    if (!clean && fallbackThumb) clean = fallbackThumb.trim();
    if (clean.startsWith('//')) clean = `https:${clean}`;
    return clean;
  };

  // Helper to find best fallback thumbnail from search results
  const getFallbackThumbnail = (targetUrl: string): string | undefined => {
    const match = results.find((r) => r.url === targetUrl || r.thumbnailUrl === targetUrl);
    return match?.thumbnailUrl && match.thumbnailUrl !== targetUrl ? match.thumbnailUrl : undefined;
  };

  // When opened, auto-trigger AI search for exact product
  useEffect(() => {
    if (isOpen && item) {
      setSearchQuery(item.name || '');
      setSelectedUrls([]);
      setSetAsCover(true);
      setErrorMsg(null);
      setSuccessToast(null);
      setActiveFilter('all');
      handleSearch(item.name || '');
    }
  }, [isOpen, item?.id]);

  const handleSearch = async (queryText: string) => {
    const q = queryText.trim();
    if (!q) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessToast(null);
    setSearchStep(1);

    const stepTimer1 = setTimeout(() => setSearchStep(2), 700);
    const stepTimer2 = setTimeout(() => setSearchStep(3), 1600);

    try {
      const res = await authFetch(`/api/inventory/${item.id}/search-web-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 28 }),
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          setProfile(data.profile);
        }
        if (data.images && Array.isArray(data.images)) {
          const cleaned = data.images.map((im: WebImageResult) => ({
            ...im,
            url: sanitizeUrl(im.url, im.thumbnailUrl),
            thumbnailUrl: sanitizeUrl(im.thumbnailUrl || im.url),
          }));
          setResults(cleaned);
          if (cleaned.length === 0) {
            setErrorMsg('No se encontraron imágenes con ese término. Puedes probar con otra variación.');
          }
        } else {
          setResults([]);
        }
      } else {
        throw new Error('Error al buscar imágenes');
      }
    } catch (err: any) {
      console.error('Error searching web images:', err);
      setErrorMsg('Ocurrió un error al buscar imágenes del producto. Puedes intentar nuevamente.');
    } finally {
      setLoading(false);
      setSearchStep(0);
    }
  };

  const toggleSelectUrl = (url: string) => {
    const clean = sanitizeUrl(url);
    setSelectedUrls((prev) =>
      prev.includes(clean) ? prev.filter((u) => u !== clean) : [...prev, clean]
    );
  };

  const handleSelectAll = (filteredList: WebImageResult[]) => {
    const listUrls = filteredList.map((r) => sanitizeUrl(r.url, r.thumbnailUrl)).filter(Boolean);
    const allSelected = listUrls.every((u) => selectedUrls.includes(u));
    if (allSelected) {
      setSelectedUrls((prev) => prev.filter((u) => !listUrls.includes(u)));
    } else {
      setSelectedUrls((prev) => Array.from(new Set([...prev, ...listUrls])));
    }
  };

  // Direct 1-click photo adder - includes all currently selected photos if any
  const handleAddSingleImage = async (rawUrl: string, makeCover: boolean = true) => {
    const cleanUrl = sanitizeUrl(rawUrl);
    if (!cleanUrl || saving) return;

    setSaving(true);
    setSavingUrl(cleanUrl);
    setErrorMsg(null);
    try {
      // If there are already other selected images, save ALL selected photos together
      let targetUrls: string[];
      if (selectedUrls.length > 0) {
        const combined = Array.from(new Set([cleanUrl, ...selectedUrls])).filter(Boolean);
        if (makeCover) {
          targetUrls = [cleanUrl, ...combined.filter((u) => u !== cleanUrl)];
        } else {
          targetUrls = combined;
        }
      } else {
        targetUrls = [cleanUrl];
      }

      const targetPayload = targetUrls.map((u) => ({
        url: u,
        fallbackUrl: getFallbackThumbnail(u),
      }));

      let updatedItemResult: any = null;
      let totalAdded = targetUrls.length;
      let finalUrls = targetUrls;

      if (item.id) {
        const res = await authFetch(`/api/inventory/${item.id}/add-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: targetPayload,
            imageUrls: targetUrls,
            setAsCover: makeCover,
            setFirstAsCover: makeCover,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Error al agregar imágenes al producto');
        }

        const data = await res.json();
        if (!data.item) {
          throw new Error('No se recibió el producto actualizado del servidor');
        }

        updatedItemResult = data.item;
        totalAdded = data.addedCount || targetUrls.length;
        if (Array.isArray(data.item.images)) {
          finalUrls = data.item.images;
        } else if (data.item.imageUrl) {
          finalUrls = [data.item.imageUrl];
        }
      } else {
        // When item has no ID yet (e.g. creating product in modal form)
        updatedItemResult = {
          ...item,
          imageUrl: makeCover ? targetUrls[0] : item.imageUrl || targetUrls[0],
          images: Array.from(new Set([...(item.images || []), ...targetUrls])),
        };
      }

      setSuccessToast(
        makeCover
          ? `⭐ Foto guardada y establecida como portada (${totalAdded} foto${totalAdded === 1 ? '' : 's'})`
          : `✅ ¡${totalAdded} foto${totalAdded === 1 ? '' : 's'} agregada${totalAdded === 1 ? '' : 's'} al producto con éxito!`
      );

      setTimeout(() => {
        onImagesAdded(updatedItemResult, totalAdded, finalUrls);
        if (onClose) onClose();
      }, 400);
    } catch (err: any) {
      console.error('Error adding images:', err);
      setErrorMsg(err.message || 'No se pudieron agregar las imágenes');
    } finally {
      setSaving(false);
      setSavingUrl(null);
    }
  };

  // Multi / Selected photo adder
  const handleAddSelected = async () => {
    if (saving) return;

    let targetUrls = selectedUrls.map((u) => sanitizeUrl(u)).filter(Boolean);

    // If nothing manually checked yet, pick the first available result
    if (targetUrls.length === 0 && filteredResults.length > 0) {
      targetUrls = [sanitizeUrl(filteredResults[0].url, filteredResults[0].thumbnailUrl)];
    }

    if (targetUrls.length === 0) {
      setErrorMsg('Selecciona al menos una foto para agregar al producto');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const targetPayload = targetUrls.map((u) => ({
        url: u,
        fallbackUrl: getFallbackThumbnail(u),
      }));

      const isCover = setAsCover || !item.imageUrl;
      let updatedItemResult: any = null;
      let totalAdded = targetUrls.length;
      let finalUrls = targetUrls;

      if (item.id) {
        const res = await authFetch(`/api/inventory/${item.id}/add-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: targetPayload,
            imageUrls: targetUrls,
            setAsCover: isCover,
            setFirstAsCover: isCover,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Error al agregar imágenes al producto');
        }

        const data = await res.json();
        if (!data.item) {
          throw new Error('Respuesta inválida del servidor');
        }

        updatedItemResult = data.item;
        totalAdded = data.addedCount || targetUrls.length;
        if (Array.isArray(data.item.images)) {
          finalUrls = data.item.images;
        } else if (data.item.imageUrl) {
          finalUrls = [data.item.imageUrl];
        }
      } else {
        // When item has no ID yet (e.g. creating product in modal form)
        updatedItemResult = {
          ...item,
          imageUrl: isCover ? targetUrls[0] : item.imageUrl || targetUrls[0],
          images: Array.from(new Set([...(item.images || []), ...targetUrls])),
        };
      }

      setSuccessToast(`✅ ¡${totalAdded} foto(s) agregada(s) con éxito al producto!`);
      setTimeout(() => {
        onImagesAdded(updatedItemResult, totalAdded, finalUrls);
        if (onClose) onClose();
      }, 400);
    } catch (err: any) {
      console.error('Error adding images:', err);
      setErrorMsg(err.message || 'No se pudieron agregar las imágenes');
    } finally {
      setSaving(false);
    }
  };

  // Filtered results based on tag chips
  const filteredResults = results.filter((img) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'white') return img.tag?.toLowerCase().includes('fondo blanco') || img.title.toLowerCase().includes('blanco');
    if (activeFilter === 'catalog') return img.tag?.toLowerCase().includes('catálogo') || img.tag?.toLowerCase().includes('oficial');
    if (activeFilter === 'box') return img.tag?.toLowerCase().includes('empaque') || img.tag?.toLowerCase().includes('caja') || img.title.toLowerCase().includes('box');
    if (activeFilter === 'ai') return img.isAiGenerated || img.tag?.toLowerCase().includes('ia');
    return true;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-5xl w-full p-4 sm:p-6 shadow-2xl relative max-h-[94vh] flex flex-col text-slate-800 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-sky-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-gradient-to-r from-sky-50 to-indigo-50 text-indigo-700 border border-indigo-200/80 flex items-center shadow-2xs">
                  <Sparkles className="w-3 h-3 text-indigo-600 mr-1" />
                  Búsqueda Exacta con IA (Gemini)
                </span>
                <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                  SKU: {item.sku}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 line-clamp-1 mt-0.5">
                Fotos idénticas para "{item.name}"
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* AI Product Identity Card (Shows detected brand, model, traits) */}
        {profile && (
          <div className="mt-2.5 px-3 py-2 bg-gradient-to-r from-indigo-50/70 via-sky-50/50 to-purple-50/40 border border-indigo-100/90 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2">
              <div className="w-5 h-5 rounded-md bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shadow-xs">
                IA
              </div>
              <div className="text-[11px] text-slate-700">
                <span className="font-bold text-indigo-950">Producto identificado: </span>
                {profile.brand && <span className="font-semibold text-indigo-700 mr-1">[{profile.brand}]</span>}
                <span className="font-medium text-slate-800">{profile.model || profile.exactProductName}</span>
                {profile.distinctiveFeatures && profile.distinctiveFeatures.length > 0 && (
                  <span className="text-slate-500 hidden md:inline ml-1">
                    • {profile.distinctiveFeatures.slice(0, 2).join(', ')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-1">
              <span className="text-[10px] text-indigo-600 font-bold bg-white/90 px-2 py-0.5 rounded-full border border-indigo-200 shadow-2xs">
                ✓ Filtro de Coincidencia Activo
              </span>
            </div>
          </div>
        )}

        {/* Search Bar & AI Query Suggestions */}
        <div className="py-2.5 border-b border-slate-100 space-y-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(searchQuery);
            }}
            className="flex items-center space-x-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-indigo-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nombre, modelo exacto o referencia del producto..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:bg-white focus:outline-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !searchQuery.trim()}
              className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs sm:text-sm font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span>Buscar con IA</span>
            </button>
          </form>

          {/* AI Recommended query tags */}
          <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5 text-[11px] scrollbar-thin">
            <span className="font-semibold text-slate-400 shrink-0 flex items-center space-x-1">
              <Wand2 className="w-3 h-3 text-indigo-500" />
              <span>Términos optimizados por IA:</span>
            </span>
            {(profile?.recommendedQueries && profile.recommendedQueries.length > 0
              ? profile.recommendedQueries
              : [
                  item.name,
                  `${item.name} fondo blanco producto`,
                  `${item.name} catalogo oficial`,
                  `${item.name} white background packshot`,
                ]
            )
              .filter(Boolean)
              .map((sug, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSearchQuery(sug);
                    handleSearch(sug);
                  }}
                  className="px-2.5 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-slate-200 text-slate-600 transition shrink-0 cursor-pointer text-[11px] font-medium"
                >
                  {sug}
                </button>
              ))}
          </div>
        </div>

        {/* View Category Filter Chips & Selection Summary Bar */}
        <div className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Filter Chips */}
          <div className="flex items-center space-x-1 overflow-x-auto py-0.5">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Todas ({results.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('white')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                activeFilter === 'white'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Fondo Blanco / Estudio
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('catalog')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                activeFilter === 'catalog'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Catálogo Oficial
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('box')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                activeFilter === 'box'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Empaque / Caja
            </button>
          </div>

          <div className="flex items-center space-x-3">
            {filteredResults.length > 0 && (
              <button
                type="button"
                onClick={() => handleSelectAll(filteredResults)}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
              >
                {filteredResults.every((r) => selectedUrls.includes(r.url))
                  ? 'Deseleccionar vista'
                  : 'Seleccionar visibles'}
              </button>
            )}

            <label className="inline-flex items-center space-x-1.5 cursor-pointer select-none text-[11px] text-slate-700">
              <input
                type="checkbox"
                checked={setAsCover}
                onChange={(e) => setSetAsCover(e.target.checked)}
                className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
              />
              <Star className="w-3 h-3 text-amber-500" />
              <span>Establecer como foto principal</span>
            </label>

            <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-bold text-[11px]">
              {selectedUrls.length} seleccionada{selectedUrls.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* Feedback / Toast / Error Bar inside modal */}
        {successToast && (
          <div className="mt-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center space-x-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
        )}
        {errorMsg && (
          <div className="mt-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center space-x-2 animate-in fade-in">
            <X className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Results Gallery Grid */}
        <div className="flex-1 overflow-y-auto py-3 pr-1 min-h-[260px]">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3.5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 animate-pulse">
                <Sparkles className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-md">
                <p className="text-sm font-bold text-slate-800">
                  {searchStep === 1
                    ? '1. Analizando especificaciones y modelo exacto con Gemini...'
                    : searchStep === 2
                    ? '2. Rastreando catálogos oficiales y fotos de alta resolución...'
                    : '3. Clasificando vistas de producto (Fondo blanco, Empaque, Detalles)...'}
                </p>
                <p className="text-xs text-slate-400">
                  Filtrando resultados para garantizar que correspondan al mismo producto comercial.
                </p>
              </div>
            </div>
          ) : errorMsg && results.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <ImageIcon className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700">{errorMsg}</p>
              <div className="flex items-center space-x-2 mt-2">
                <button
                  type="button"
                  onClick={() => handleSearch(item.name || searchQuery)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reintentar búsqueda</span>
                </button>
              </div>
            </div>
          ) : filteredResults.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredResults.map((img, idx) => {
                const isSelected = selectedUrls.includes(img.url);
                const isThisSaving = savingUrl === img.url;

                return (
                  <div
                    key={idx}
                    onClick={() => toggleSelectUrl(img.url)}
                    className={`group relative rounded-2xl border transition overflow-hidden cursor-pointer bg-slate-50 flex flex-col select-none ${
                      isSelected
                        ? 'border-indigo-600 ring-2 ring-indigo-600 shadow-md bg-indigo-50/40'
                        : 'border-slate-200 hover:border-indigo-300 hover:shadow-sm'
                    }`}
                  >
                    {/* Image Box */}
                    <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
                      <img
                        src={img.thumbnailUrl || img.url}
                        alt={img.title || 'Foto de producto'}
                        className={`w-full h-full object-cover transition duration-200 group-hover:scale-105 ${
                          isSelected ? 'brightness-95' : ''
                        }`}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.currentTarget;
                          const currentSrc = target.src;
                          if (!currentSrc.includes('/api/proxy-image') && img.url) {
                            target.src = `/api/proxy-image?url=${encodeURIComponent(img.url)}`;
                          }
                        }}
                      />

                      {/* Selection Check Badge */}
                      <div
                        className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center shadow-md transition ${
                          isSelected
                            ? 'bg-indigo-600 text-white scale-110'
                            : 'bg-white/80 backdrop-blur-xs text-transparent border border-slate-300 group-hover:border-indigo-400'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>

                      {/* Zoom Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxIndex(idx);
                        }}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-slate-900/80 text-white hover:bg-sky-600 flex items-center justify-center opacity-90 group-hover:opacity-100 transition shadow-md cursor-zoom-in z-10"
                        title="Clic para agrandar y ver con zoom HD"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>

                      {/* Tag / Category Badge */}
                      {img.tag && (
                        <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-md bg-slate-900/80 text-[10px] font-bold text-white backdrop-blur-xs flex items-center space-x-1">
                          {img.isAiGenerated && <Sparkles className="w-2.5 h-2.5 text-purple-300" />}
                          <span>{img.tag}</span>
                        </div>
                      )}

                      {/* Source tag */}
                      {img.source && (
                        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-slate-900/70 text-[9px] text-slate-300 font-medium backdrop-blur-xs">
                          {img.source}
                        </div>
                      )}

                      {/* Overlay Quick-Add buttons on Hover / Touch */}
                      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 gap-1.5 backdrop-blur-[1px]">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddSingleImage(img.url, false);
                          }}
                          className="w-full py-1.5 px-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shadow-md transition flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50"
                        >
                          {isThisSaving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {isThisSaving
                              ? 'Guardando...'
                              : selectedUrls.length > 1
                              ? `➕ Guardar ${selectedUrls.length} Fotos`
                              : '➕ Agregar Foto'}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={saving}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddSingleImage(img.url, true);
                          }}
                          className="w-full py-1.5 px-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 text-[11px] font-bold shadow-md transition flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50"
                        >
                          <Star className="w-3.5 h-3.5 fill-slate-900" />
                          <span>⭐ Foto Principal</span>
                        </button>
                      </div>
                    </div>

                    {/* Title & Metadata */}
                    <div className="p-2 flex-1 flex flex-col justify-between">
                      <p className="text-[11px] text-slate-700 font-medium line-clamp-2 leading-snug">
                        {img.title || 'Foto de producto web'}
                      </p>
                      <div className="mt-1 flex items-center justify-between text-[10px]">
                        <span className={isSelected ? 'text-indigo-700 font-bold' : 'text-slate-400'}>
                          {isSelected ? '✓ Seleccionada' : 'Clic para seleccionar'}
                        </span>
                        {img.confidence && (
                          <span className="text-emerald-700 font-bold bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">
                            {img.confidence}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
              <p className="text-xs text-slate-400">No hay fotos en esta categoría de filtro.</p>
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className="text-xs font-bold text-indigo-600 hover:underline"
              >
                Ver todas las imágenes
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            Cancelar
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleAddSelected}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando en el producto...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>
                    {selectedUrls.length > 0
                      ? `Agregar ${selectedUrls.length} Foto${selectedUrls.length === 1 ? '' : 's'} al Producto`
                      : 'Agregar Foto al Producto'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Full Image Zoom Lightbox Modal */}
        {lightboxIndex !== null && filteredResults.length > 0 && (
          <ImageLightboxModal
            isOpen={lightboxIndex !== null}
            images={filteredResults.map((r) => ({
              url: r.url,
              thumbnailUrl: r.thumbnailUrl,
              title: r.title,
              tag: r.tag,
              source: r.source,
              confidence: r.confidence,
            }))}
            currentIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onNavigate={(newIdx) => setLightboxIndex(newIdx)}
            onSelect={(selectedUrl) => {
              handleAddSingleImage(selectedUrl, false);
            }}
            onSetAsCover={(coverUrl) => {
              handleAddSingleImage(coverUrl, true);
            }}
            selectLabel="➕ Agregar a Galería"
            productName={item?.name || 'Producto'}
            productSku={item?.sku || ''}
            isCover={filteredResults[lightboxIndex]?.url === item?.imageUrl}
          />
        )}
      </div>
    </div>
  );
};

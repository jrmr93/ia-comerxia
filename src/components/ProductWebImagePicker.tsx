import React, { useState, useEffect, useRef } from 'react';
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
  Link as LinkIcon,
  Upload,
  ShoppingBag,
  Clipboard,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Compass,
  Monitor,
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

  // Manual image URL search / paste state
  const [manualUrl, setManualUrl] = useState<string>('');
  const [showManualUrlPanel, setShowManualUrlPanel] = useState<boolean>(false);
  const [manualUrlNotice, setManualUrlNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Embedded Web Browser Component State
  const [activeMode, setActiveMode] = useState<'search' | 'browser'>('search');
  const [browserInputUrl, setBrowserInputUrl] = useState<string>(
    `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(item.name || '')}`
  );
  const [browserCurrentUrl, setBrowserCurrentUrl] = useState<string>(
    `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(item.name || '')}`
  );
  const [browserLoading, setBrowserLoading] = useState<boolean>(false);
  const [browserImages, setBrowserImages] = useState<WebImageResult[]>([]);
  const [browserTitle, setBrowserTitle] = useState<string>('Navegador Web Integrado (Google Imágenes)');

  // Listen for image selection messages from embedded browser iframe
  useEffect(() => {
    if (!isOpen) return;

    const handleIframeMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'COMERXIA_IMAGE_TOGGLE' && e.data.url) {
        const cleanUrl = sanitizeUrl(e.data.url);
        if (cleanUrl) {
          toggleSelectUrl(cleanUrl);
          setSuccessToast('✅ ¡Foto seleccionada directamente desde la página web del navegador!');
        }
      }
    };

    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, [isOpen]);

  const handleBrowseWebPage = async (inputStr: string) => {
    const raw = inputStr.trim();
    if (!raw) return;
    setBrowserLoading(true);
    setErrorMsg(null);

    let target = raw;
    if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
      target = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(raw)}`;
    }
    setBrowserCurrentUrl(target);
    setBrowserInputUrl(target);

    try {
      const res = await authFetch('/api/web-browser/extract-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: target,
          query: !raw.startsWith('http://') && !raw.startsWith('https://') ? raw : undefined,
        }),
      });

      if (!res.ok) {
        throw new Error('Error al navegar en el sitio web');
      }

      const data = await res.json();
      if (data.images && Array.isArray(data.images)) {
        const cleaned = data.images.map((im: WebImageResult) => ({
          ...im,
          url: sanitizeUrl(im.url, im.thumbnailUrl),
          thumbnailUrl: sanitizeUrl(im.thumbnailUrl || im.url),
        }));
        setBrowserImages(cleaned);
        setBrowserTitle(data.title || data.hostname || 'Página Web');
      } else {
        setBrowserImages([]);
      }
    } catch (err: any) {
      console.error('Error browsing web page:', err);
      setErrorMsg(err.message || 'No se pudieron extraer las imágenes de la página web');
    } finally {
      setBrowserLoading(false);
    }
  };

  // Clipboard paste detection for quick manual image additions
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      // Allow normal typing inside input boxes unless it looks like a direct image URL or base64
      const isInputActive = activeEl && activeEl.tagName === 'INPUT';

      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const file = items[i].getAsFile();
            if (file) {
              e.preventDefault();
              const reader = new FileReader();
              reader.onload = (event) => {
                const base64 = event.target?.result as string;
                if (base64) {
                  setManualUrl(base64);
                  setShowManualUrlPanel(true);
                  setSuccessToast('📋 ¡Imagen capturada del portapapeles! Clic en Guardar Foto para agregar.');
                }
              };
              reader.readAsDataURL(file);
              return;
            }
          }
        }
      }

      const pastedText = e.clipboardData?.getData('text')?.trim();
      if (pastedText && (pastedText.startsWith('http://') || pastedText.startsWith('https://') || pastedText.startsWith('data:image/'))) {
        if (!isInputActive) {
          e.preventDefault();
        }
        setManualUrl(pastedText);
        setShowManualUrlPanel(true);
        setSuccessToast('📋 ¡Enlace de imagen pegado! Clic en Agregar Foto o Guardar Portada.');
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  // Launchers for manual web search engines
  const handleOpenGoogleImages = () => {
    const q = (searchQuery || item.name || '').trim();
    if (!q) return;
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`, '_blank');
    setManualUrlNotice(
      '🌐 Se abrió Google Imágenes en una nueva pestaña. Copia la dirección de cualquier foto (Clic derecho ➔ "Copiar dirección de imagen") y pégala aquí abajo o presiona Ctrl+V.'
    );
    setShowManualUrlPanel(true);
  };

  const handleOpenBingImages = () => {
    const q = (searchQuery || item.name || '').trim();
    if (!q) return;
    window.open(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}`, '_blank');
    setManualUrlNotice(
      '🔍 Se abrió Bing Imágenes en una pestaña nueva. Copia el enlace directo de la imagen deseada y pégalo abajo.'
    );
    setShowManualUrlPanel(true);
  };

  const handleOpenMercadoLibre = () => {
    const q = (searchQuery || item.name || '').trim();
    if (!q) return;
    window.open(`https://listado.mercadolibre.com.ec/${encodeURIComponent(q)}`, '_blank');
    setShowManualUrlPanel(true);
  };

  // Local files upload handler inside modal
  const handleLocalFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    fileArray.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          const newResult: WebImageResult = {
            url: base64,
            thumbnailUrl: base64,
            title: file.name || 'Foto subida desde equipo',
            source: 'Archivo Local',
            tag: 'Subida Local',
            confidence: 'Local',
          };
          setResults((prev) => [newResult, ...prev]);
          setSelectedUrls((prev) => [base64, ...prev]);
          setSuccessToast(`📁 Foto "${file.name}" cargada correctamente.`);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Manual URL submit helper
  const handleAddManualUrlSubmit = async (makeCover: boolean = true) => {
    const clean = sanitizeUrl(manualUrl);
    if (!clean) {
      setErrorMsg('Por favor ingresa o pega un enlace de imagen válido (http:// o https://)');
      return;
    }

    const existing = results.find((r) => r.url === clean);
    if (!existing) {
      const customRes: WebImageResult = {
        url: clean,
        thumbnailUrl: clean,
        title: 'Imagen de URL manual',
        source: 'Enlace Directo Web',
        tag: 'Manual Web',
        confidence: 'Exacto',
      };
      setResults((prev) => [customRes, ...prev]);
    }

    await handleAddSingleImage(clean, makeCover, false);
    setManualUrl('');
  };

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
      setManualUrl('');
      setManualUrlNotice(null);
      setShowManualUrlPanel(false);
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
      const endpoint = item?.id ? `/api/inventory/${item.id}/search-web-images` : '/api/ai/search-images';
      const res = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 32 }),
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
  const handleAddSingleImage = async (
    rawUrl: string,
    makeCover: boolean = true,
    closeModalOnFinish: boolean = false
  ) => {
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

      // Update selected URLs list to include the newly added cleanUrl
      setSelectedUrls((prev) => Array.from(new Set([...prev, cleanUrl])));

      setSuccessToast(
        makeCover
          ? `⭐ Foto guardada y establecida como portada (${totalAdded} foto${totalAdded === 1 ? '' : 's'}). ¡Puedes seguir pegando más URLs!`
          : `✅ ¡Foto agregada con éxito! Puedes seguir pegando más URLs sin necesidad de cerrar la ventana.`
      );

      onImagesAdded(updatedItemResult, totalAdded, finalUrls);

      if (closeModalOnFinish && onClose) {
        setTimeout(() => {
          onClose();
        }, 400);
      }
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
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border border-blue-200/80 flex items-center shadow-2xs">
                  <span className="font-extrabold mr-1">
                    <span className="text-blue-600">G</span>
                    <span className="text-red-500">o</span>
                    <span className="text-yellow-500">o</span>
                    <span className="text-blue-600">g</span>
                    <span className="text-green-600">l</span>
                    <span className="text-red-500">e</span>
                  </span>
                  Imágenes
                </span>
                <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                  SKU: {item.sku}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 line-clamp-1 mt-0.5">
                Fotos de Internet para "{item.name}"
              </h3>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition flex items-center space-x-1 cursor-pointer"
              title="Finalizar y cerrar la ventana"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Listo</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* AI Product Identity Card (Shows detected brand, model, traits) */}
        {activeMode === 'search' && profile && (
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

          {/* Manual Web Search & Manual Image Options Toolbar */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5 scrollbar-thin">
              <span className="font-bold text-slate-600 shrink-0 flex items-center space-x-1">
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                <span>Buscar manualmente en:</span>
              </span>
              
              <button
                type="button"
                onClick={handleOpenGoogleImages}
                className="px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200/80 font-bold transition flex items-center space-x-1 cursor-pointer shadow-2xs shrink-0"
                title="Abrir Google Imágenes en una pestaña nueva con el término actual"
              >
                <Globe className="w-3 h-3 text-blue-600" />
                <span>Google Imágenes ↗</span>
              </button>

              <button
                type="button"
                onClick={handleOpenBingImages}
                className="px-2.5 py-1 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200/80 font-bold transition flex items-center space-x-1 cursor-pointer shadow-2xs shrink-0"
                title="Abrir Bing Imágenes en una pestaña nueva"
              >
                <Search className="w-3 h-3 text-teal-600" />
                <span>Bing Imágenes ↗</span>
              </button>

              <button
                type="button"
                onClick={handleOpenMercadoLibre}
                className="px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 font-bold transition flex items-center space-x-1 cursor-pointer shadow-2xs shrink-0"
                title="Buscar producto en Mercado Libre Ecuador"
              >
                <ShoppingBag className="w-3 h-3 text-amber-600" />
                <span>Mercado Libre ↗</span>
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setShowManualUrlPanel(!showManualUrlPanel)}
                className={`px-2.5 py-1 rounded-xl font-bold border transition flex items-center space-x-1 cursor-pointer text-[11px] ${
                  showManualUrlPanel || manualUrl
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                title="Pegar enlace directo de imagen o presionar Ctrl+V"
              >
                <LinkIcon className="w-3 h-3" />
                <span>{showManualUrlPanel ? 'Ocultar URL Directo' : '🔗 Pegar URL Directo / Ctrl+V'}</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold transition flex items-center space-x-1 cursor-pointer text-[11px]"
                title="Cargar archivos de imagen desde tu equipo"
              >
                <Upload className="w-3 h-3 text-slate-600" />
                <span>📁 Subir local</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => handleLocalFilesSelected(e.target.files)}
                className="hidden"
              />
            </div>
          </div>

          {/* Manual URL / Clipboard Image Input Panel */}
          {showManualUrlPanel && (
            <div className="p-3 bg-gradient-to-r from-sky-50/80 via-indigo-50/50 to-purple-50/30 border border-indigo-200/90 rounded-2xl space-y-2 shadow-xs animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                  <LinkIcon className="w-4 h-4 text-indigo-600" />
                  <span>Pegar enlace o URL directo de la imagen encontrada en internet:</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowManualUrlPanel(false)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {manualUrlNotice && (
                <div className="p-2 bg-indigo-100/70 border border-indigo-200 rounded-xl text-[11px] text-indigo-900 font-medium flex items-start space-x-1.5">
                  <Globe className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span>{manualUrlNotice}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative flex-1 w-full">
                  <input
                    type="text"
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    placeholder="Ej: https://ejemplo.com/foto-producto.jpg (o presiona Ctrl+V)"
                    className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                  />
                  {manualUrl && (
                    <button
                      type="button"
                      onClick={() => setManualUrl('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <button
                    type="button"
                    disabled={!manualUrl.trim() || saving}
                    onClick={() => handleAddManualUrlSubmit(false)}
                    className="flex-1 sm:flex-none px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar Foto</span>
                  </button>
                  <button
                    type="button"
                    disabled={!manualUrl.trim() || saving}
                    onClick={() => handleAddManualUrlSubmit(true)}
                    className="flex-1 sm:flex-none px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                  >
                    <Star className="w-3.5 h-3.5 fill-slate-900" />
                    <span>Guardar Portada</span>
                  </button>
                </div>
              </div>

              {manualUrl && (
                <div className="flex items-center space-x-3 pt-1 border-t border-indigo-100">
                  <div className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden bg-white shrink-0 flex items-center justify-center">
                    <img
                      src={manualUrl}
                      alt="Vista previa manual"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-600 flex-1 truncate">
                    <span className="font-bold text-slate-800 block">Vista previa detectada</span>
                    <span className="truncate block font-mono text-[10px] text-slate-400">{manualUrl}</span>
                  </div>
                </div>
              )}
            </div>
          )}
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

        {/* Results Gallery Grid (Google Images Search) */}
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

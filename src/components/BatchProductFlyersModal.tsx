import React, { useState } from 'react';
import JSZip from 'jszip';
import {
  X,
  Sparkles,
  Download,
  FileArchive,
  Layers,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Package,
  Palette,
  Sliders,
  Check,
  Tag,
  Grid,
  Phone,
  Store,
  Info,
} from 'lucide-react';
import { InventoryItem, StoreConfig } from '../types.ts';
import { generateSocialFlyer, FlyerTemplateStyle } from '../utils/socialFlyerGenerator.ts';
import { safeLocalStorage } from '../utils/safeStorage.ts';

interface BatchProductFlyersModalProps {
  items: InventoryItem[];
  onClose: () => void;
  currency?: string;
  storeConfig?: StoreConfig;
}

const FLYER_TEMPLATES: { id: FlyerTemplateStyle; name: string; color: string; bg: string; badge: string; desc: string }[] = [
  {
    id: 'studio',
    name: 'Azul Studio (Clásico)',
    color: '#312e81',
    bg: 'from-slate-900 to-indigo-950',
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    desc: 'Estilo moderno corporativo con degradado profundo y acentos celestes.',
  },
  {
    id: 'dark',
    name: 'Dark Minimalista',
    color: '#0f172a',
    bg: 'from-slate-950 to-slate-800',
    badge: 'bg-slate-800 text-amber-300 border-slate-700',
    desc: 'Fondo oscuro elegante con detalles dorados, ideal para tecnología.',
  },
  {
    id: 'clean',
    name: 'Blanco Limpio / WhatsApp',
    color: '#16a34a',
    bg: 'from-emerald-500 to-teal-600',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    desc: 'Diseño claro y luminoso optimizado para estados de WhatsApp y catálogo.',
  },
  {
    id: 'neon',
    name: 'Neón Vibrante',
    color: '#312e81',
    bg: 'from-purple-900 via-indigo-900 to-emerald-900',
    badge: 'bg-purple-100 text-purple-800 border-purple-300',
    desc: 'Colores llamativos y enérgicos para redes sociales e imperdibles.',
  },
  {
    id: 'rose_gold',
    name: 'Rosa Gold Chic',
    color: '#881337',
    bg: 'from-rose-950 to-pink-900',
    badge: 'bg-rose-100 text-rose-800 border-rose-300',
    desc: 'Elegante y sofisticado con tonos rosa dorados, ideal para accesorios.',
  },
  {
    id: 'pastel_pink',
    name: 'Pastel Blush / Boutique',
    color: '#be185d',
    bg: 'from-pink-100 to-rose-200',
    badge: 'bg-pink-100 text-pink-800 border-pink-300',
    desc: 'Tono pastel suave y femenino, perfecto para boutiques y belleza.',
  },
  {
    id: 'lavender_glam',
    name: 'Lavanda Glam',
    color: '#701a75',
    bg: 'from-indigo-950 via-purple-900 to-fuchsia-950',
    badge: 'bg-violet-100 text-violet-800 border-violet-300',
    desc: 'Estilo glamuroso violeta y fucsia para productos premium.',
  },
  {
    id: 'coral_sunset',
    name: 'Coral Soft',
    color: '#ea580c',
    bg: 'from-orange-100 to-amber-200',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    desc: 'Cálido y acogedor con degradados naranja suave y coral.',
  },
];

/**
 * Sanitizes filename strings for clean saving inside ZIP archives.
 */
function sanitizeFileName(name: string): string {
  if (!name) return 'producto';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-zA-Z0-9_-]/g, '_') // replace invalid chars with _
    .replace(/_+/g, '_') // collapse double underscores
    .replace(/^_|_$/g, ''); // trim underscores
}

export const BatchProductFlyersModal: React.FC<BatchProductFlyersModalProps> = ({
  items,
  onClose,
  currency = 'USD',
  storeConfig,
}) => {
  // Extract unique categories from items
  const categoriesList = React.useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => set.add(it.category || 'General'));
    return Array.from(set);
  }, [items]);

  // State: Template selection per category
  const [categoryStyles, setCategoryStyles] = useState<Record<string, FlyerTemplateStyle>>(() => {
    const initial: Record<string, FlyerTemplateStyle> = {};
    categoriesList.forEach((cat, index) => {
      // Cycle initial templates or default to studio
      const template = FLYER_TEMPLATES[index % FLYER_TEMPLATES.length]?.id || 'studio';
      initial[cat] = template;
    });
    return initial;
  });

  // Master template selector state
  const [masterStyle, setMasterStyle] = useState<FlyerTemplateStyle>('studio');

  // Custom options
  const [tagline, setTagline] = useState<string>('Envíos a todo el país 🚚');
  const [organizeByFolders, setOrganizeByFolders] = useState<boolean>(true);
  const [maxPhotosPerFlyer, setMaxPhotosPerFlyer] = useState<number>(4);

  // Store information overrides/pre-fills
  const storeName = storeConfig?.storeName || safeLocalStorage.getItem('store_name') || 'COMERXIA STORE';
  const storeLogoUrl = storeConfig?.logoUrl || safeLocalStorage.getItem('store_logo_url') || null;
  const whatsappNumber =
    storeConfig?.whatsappNumber ||
    safeLocalStorage.getItem('store_whatsapp_number') ||
    safeLocalStorage.getItem('advisor_whatsapp_number') ||
    '';

  // Generation progress states
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [progressIndex, setProgressIndex] = useState<number>(0);
  const [currentProcessingName, setCurrentProcessingName] = useState<string>('');
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);
  const [completedZipBlob, setCompletedZipBlob] = useState<{ blob: Blob; fileName: string } | null>(null);

  const handleApplyMasterStyle = (style: FlyerTemplateStyle) => {
    setMasterStyle(style);
    const updated: Record<string, FlyerTemplateStyle> = {};
    categoriesList.forEach((cat) => {
      updated[cat] = style;
    });
    setCategoryStyles(updated);
  };

  const handleCategoryStyleChange = (category: string, style: FlyerTemplateStyle) => {
    setCategoryStyles((prev) => ({
      ...prev,
      [category]: style,
    }));
  };

  const handleGenerateZip = async () => {
    if (items.length === 0 || isGenerating) return;

    setIsGenerating(true);
    setProgressIndex(0);
    setGenerationLogs([]);
    setCompletedZipBlob(null);

    const zip = new JSZip();
    const todayStr = new Date().toISOString().slice(0, 10);
    const zipName = `Flyers_Promocionales_Comerxia_${todayStr}.zip`;

    const logs: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setProgressIndex(i + 1);
      setCurrentProcessingName(item.name);

      const category = item.category || 'General';
      const style = categoryStyles[category] || 'studio';

      // Determine product image list
      let photoUrls: string[] = [];
      if (Array.isArray(item.images) && item.images.length > 0) {
        photoUrls = item.images.filter(Boolean);
      } else if (item.imageUrl) {
        photoUrls = [item.imageUrl];
      }

      // Limit photos per flyer according to user selection
      photoUrls = photoUrls.slice(0, maxPhotosPerFlyer);

      // Financials calculations for discount/price
      const salePriceNum = parseFloat(String(item.salePrice || '0')) || 0;
      const discountPercent = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));

      let originalPrice: number | null = null;
      if (discountPercent > 0 && salePriceNum > 0) {
        originalPrice = Math.round((salePriceNum / (1 - discountPercent / 100)) * 100) / 100;
      }

      try {
        const dataUrl = await generateSocialFlyer({
          productImageUrl: photoUrls[0] || undefined,
          productImageUrls: photoUrls.length > 0 ? photoUrls : undefined,
          productName: item.name,
          salePrice: salePriceNum,
          originalPrice: originalPrice,
          discountPercent: discountPercent > 0 ? discountPercent : null,
          currency,
          storeName,
          storeLogoUrl,
          whatsappNumber,
          templateStyle: style,
          tagline,
        });

        // Convert base64 data URL to binary data for JSZip
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');

        const safeCatName = sanitizeFileName(category);
        const safeItemName = sanitizeFileName(item.name);
        const skuTag = item.sku ? `_${sanitizeFileName(item.sku)}` : '';
        const fileName = `Flyer_${safeItemName}${skuTag}.png`;

        if (organizeByFolders) {
          const folder = zip.folder(safeCatName);
          if (folder) {
            folder.file(fileName, base64Data, { base64: true });
          } else {
            zip.file(`${safeCatName}/${fileName}`, base64Data, { base64: true });
          }
        } else {
          zip.file(`${safeCatName}_${fileName}`, base64Data, { base64: true });
        }

        logs.push(`✓ [${category}] ${item.name} (${style})`);
      } catch (err: any) {
        console.error(`Error generando flyer para ${item.name}:`, err);
        logs.push(`⚠️ Error en ${item.name}: ${err.message || 'Fallo de imagen'}`);
      }

      setGenerationLogs([...logs]);
    }

    try {
      // Generate final ZIP blob
      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      setCompletedZipBlob({ blob, fileName: zipName });

      // Automatically trigger browser download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = zipName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err: any) {
      alert(`Error al empaquetar archivo ZIP: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadCompletedAgain = () => {
    if (!completedZipBlob) return;
    const url = URL.createObjectURL(completedZipBlob.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = completedZipBlob.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] my-auto">
        {/* Header Modal */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-5 py-4 sm:px-6 sm:py-5 text-white flex items-center justify-between relative overflow-hidden shrink-0">
          <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-10 pointer-events-none">
            <Sparkles className="w-48 h-48" />
          </div>

          <div className="flex items-center space-x-3.5 relative z-10">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-indigo-500/25 border border-indigo-400/40 backdrop-blur-md flex items-center justify-center text-indigo-300 shadow-inner">
              <FileArchive className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight">
                  Generador Masivo de Imágenes Promocionales
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  {items.length} productos
                </span>
              </div>
              <p className="text-xs text-indigo-200/90 mt-0.5">
                Selecciona el estilo de plantilla por cada categoría y descarga todas las imágenes listas en un archivo .ZIP
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isGenerating}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer disabled:opacity-50"
            title="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body with scrollable content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
          {/* Section 1: General Settings & Master Style */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide">
                  Configuración General del Lote
                </h4>
              </div>

              {/* Master style selector */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-600 hidden sm:inline">Estilo global:</span>
                <select
                  value={masterStyle}
                  onChange={(e) => handleApplyMasterStyle(e.target.value as FlyerTemplateStyle)}
                  disabled={isGenerating}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-800 border border-indigo-300 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="" disabled>
                    Aplicar estilo a todo...
                  </option>
                  {FLYER_TEMPLATES.map((tmpl) => (
                    <option key={tmpl.id} value={tmpl.id}>
                      {tmpl.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {/* Tagline */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Subtítulo / Tagline en Flyer:</label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  disabled={isGenerating}
                  placeholder="Ej: Envíos a todo el país 🚚"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Photos count */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Fotos por Producto:</label>
                <select
                  value={maxPhotosPerFlyer}
                  onChange={(e) => setMaxPhotosPerFlyer(Number(e.target.value))}
                  disabled={isGenerating}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value={1}>1 Foto principal</option>
                  <option value={2}>Hasta 2 fotos (Lado a lado)</option>
                  <option value={3}>Hasta 3 fotos (1 Grande + 2 pequeñas)</option>
                  <option value={4}>Hasta 4 fotos (Mosaico 2x2)</option>
                </select>
              </div>

              {/* Folder organization check */}
              <div className="flex items-center pt-5">
                <label className="flex items-center space-x-2 cursor-pointer font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={organizeByFolders}
                    onChange={(e) => setOrganizeByFolders(e.target.checked)}
                    disabled={isGenerating}
                    className="w-4 h-4 text-indigo-600 rounded-md focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>Organizar carpetas por Categoría dentro del .ZIP</span>
                </label>
              </div>
            </div>
          </div>

          {/* Section 2: Category Style Mapping */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Palette className="w-4 h-4 text-indigo-600" />
                <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide">
                  Asignación de Estilo Visual por Categoría
                </h4>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {categoriesList.length} {categoriesList.length === 1 ? 'categoría' : 'categorías'} en la selección
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {categoriesList.map((catName) => {
                const countInCat = items.filter((it) => (it.category || 'General') === catName).length;
                const activeStyleId = categoryStyles[catName] || 'studio';
                const activeTmpl = FLYER_TEMPLATES.find((t) => t.id === activeStyleId) || FLYER_TEMPLATES[0];

                return (
                  <div
                    key={catName}
                    className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs hover:border-indigo-300 transition flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center space-x-2 min-w-0">
                        <Tag className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span className="font-extrabold text-sm text-slate-900 truncate">{catName}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                          {countInCat} {countInCat === 1 ? 'prod.' : 'prods.'}
                        </span>
                      </div>

                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border shrink-0 ${activeTmpl.badge}`}>
                        {activeTmpl.name}
                      </span>
                    </div>

                    <div className="space-y-1.5 mt-1">
                      <label className="block text-[11px] font-bold text-slate-500">Seleccionar Plantilla:</label>
                      <select
                        value={activeStyleId}
                        onChange={(e) => handleCategoryStyleChange(catName, e.target.value as FlyerTemplateStyle)}
                        disabled={isGenerating}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      >
                        {FLYER_TEMPLATES.map((tmpl) => (
                          <option key={tmpl.id} value={tmpl.id}>
                            {tmpl.name} — {tmpl.desc.slice(0, 45)}...
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Selected Products Preview Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Grid className="w-4 h-4 text-indigo-600" />
                <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide">
                  Vista Previa de Productos a Procesar ({items.length})
                </h4>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {items.map((it) => {
                const cat = it.category || 'General';
                const styleId = categoryStyles[cat] || 'studio';
                const tmpl = FLYER_TEMPLATES.find((t) => t.id === styleId) || FLYER_TEMPLATES[0];

                return (
                  <div
                    key={it.id}
                    className="bg-white border border-slate-200 rounded-xl p-2 flex items-center space-x-2 shadow-2xs"
                  >
                    <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                      {it.imageUrl || (Array.isArray(it.images) && it.images[0]) ? (
                        <img
                          src={it.imageUrl || it.images[0]}
                          alt={it.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <Package className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate" title={it.name}>
                        {it.name}
                      </p>
                      <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 truncate">
                        <span className="truncate">{cat}</span>
                        <span>•</span>
                        <span className="font-semibold text-indigo-600">{tmpl.name.split(' ')[0]}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 4: Progress Bar & Execution Status */}
          {isGenerating && (
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-4 space-y-3 animate-pulse">
              <div className="flex items-center justify-between text-xs font-black text-indigo-950">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Procesando Canvas HD para: "{currentProcessingName}"</span>
                </div>
                <span>
                  {progressIndex} de {items.length} ({Math.round((progressIndex / items.length) * 100)}%)
                </span>
              </div>

              {/* Progress bar line */}
              <div className="w-full bg-indigo-200 h-3 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-600 via-sky-500 to-emerald-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${(progressIndex / items.length) * 100}%` }}
                />
              </div>

              {generationLogs.length > 0 && (
                <div className="bg-slate-900 text-slate-200 rounded-xl p-2.5 font-mono text-[10px] max-h-24 overflow-y-auto space-y-1">
                  {generationLogs.slice(-5).map((log, idx) => (
                    <div key={idx} className="truncate">
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section 5: Success Banner */}
          {completedZipBlob && !isGenerating && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center space-x-3 text-emerald-950">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="text-xs font-black sm:text-sm">¡Archivo .ZIP generado exitosamente!</h4>
                  <p className="text-[11px] text-emerald-800">
                    Se han procesado {items.length} imágenes promocionales. Si la descarga no comenzó automáticamente, haz clic en el botón a continuación.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadCompletedAgain}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Volver a Descargar .ZIP</span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 border-t border-slate-200 px-5 py-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2 text-xs text-slate-500 font-medium">
            <Info className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Resolución de imagen: 1080x1080px HD (Formato PNG optimizado).</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-300 shadow-2xs transition cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleGenerateZip}
              disabled={isGenerating || items.length === 0}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-sky-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black text-xs shadow-sm transition flex items-center space-x-2 cursor-pointer disabled:opacity-50 active:scale-98"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Procesando imágenes... ({progressIndex}/{items.length})</span>
                </>
              ) : (
                <>
                  <FileArchive className="w-4.5 h-4.5 text-indigo-200" />
                  <span>Generar y Descargar .ZIP ({items.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

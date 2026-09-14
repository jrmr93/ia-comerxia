import React, { useState, useEffect, useMemo } from 'react';
import {
  Share2,
  X,
  Copy,
  Check,
  MessageCircle,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Tag,
  Filter,
} from 'lucide-react';
import { StoreConfig } from '../types.ts';
import { getPublicStoreUrl } from '../utils/storeUrls.ts';

interface ShareStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeConfig?: StoreConfig;
  categories?: string[];
  initialCategory?: string;
  onShowToast?: (msg: string) => void;
}

export const ShareStoreModal: React.FC<ShareStoreModalProps> = ({
  isOpen,
  onClose,
  storeConfig,
  categories = [],
  initialCategory = '',
  onShowToast,
}) => {
  const [copied, setCopied] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Filter out 'all' from categories list for cleanest dropdown options
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    categories.forEach((cat) => {
      if (cat && cat !== 'all') {
        set.add(cat.trim());
      }
    });
    return Array.from(set).sort();
  }, [categories]);

  // Sync selectedCategory when modal opens or initialCategory changes
  useEffect(() => {
    if (isOpen) {
      if (initialCategory && initialCategory !== 'all') {
        setSelectedCategory(initialCategory);
      } else {
        setSelectedCategory('all');
      }
    }
  }, [isOpen, initialCategory]);

  // Derive public customer store URL with optional category filter
  const baseStoreUrl = useMemo(() => {
    return getPublicStoreUrl(storeConfig?.domain);
  }, [storeConfig?.domain]);

  const customerStoreUrl = useMemo(() => {
    if (!baseStoreUrl) return '';
    if (selectedCategory && selectedCategory !== 'all') {
      const url = new URL(baseStoreUrl);
      url.searchParams.set('categoria', selectedCategory);
      return url.toString();
    }
    return baseStoreUrl;
  }, [baseStoreUrl, selectedCategory]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    if (!customerStoreUrl) return;

    let success = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(customerStoreUrl);
        success = true;
      } catch (err) {
        console.warn('Clipboard write failed, attempting fallback', err);
      }
    }

    if (!success) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = customerStoreUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (err) {
        console.error('execCommand copy failed', err);
      }
    }

    setCopied(true);
    if (onShowToast) {
      onShowToast(
        selectedCategory !== 'all'
          ? `✓ Enlace de la categoría "${selectedCategory}" copiado al portapapeles`
          : '✓ Enlace de la tienda copiado al portapapeles'
      );
    }
    setTimeout(() => setCopied(false), 2500);
  };

  const storeName = storeConfig?.storeName || 'Nuestra Tienda Online';
  const whatsappInvitationText =
    selectedCategory !== 'all'
      ? `¡Hola! 👋 Te invito a explorar nuestra categoría *${selectedCategory}* en nuestra tienda online *${storeName}*:\n\n👉 ${customerStoreUrl}`
      : `¡Hola! 👋 Te invito a ver nuestro catálogo digital y hacer tu pedido en nuestra tienda online *${storeName}*:\n\n👉 ${customerStoreUrl}`;

  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappInvitationText)}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-scaleUp">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-xs">
              <Share2 className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 leading-tight">
                Compartir Tienda
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Enlace directo y público para catálogo con filtro por categoría
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security / Safe Public Link Notice */}
        <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 text-xs flex items-start space-x-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold">Acceso Directo Filtrado: </span>
            {selectedCategory !== 'all' ? (
              <>
                El cliente al hacer clic en este enlace abrirá la tienda en vista cliente pre-filtrada por la categoría{' '}
                <strong className="text-emerald-800 font-black">{selectedCategory}</strong>.
              </>
            ) : (
              <>
                Comparte este enlace para que cualquier persona pueda explorar el catálogo completo de productos o selecciona una categoría a continuación.
              </>
            )}
          </div>
        </div>

        {/* Category Selector Dropdown */}
        <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50 border border-slate-200">
          <label className="block text-xs font-extrabold text-slate-800 flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <Tag className="w-3.5 h-3.5 text-sky-600" />
              <span>Filtrar por Categoría a Compartir:</span>
            </span>
            {selectedCategory !== 'all' && (
              <span className="text-[10px] bg-sky-100 text-sky-800 font-black px-2 py-0.5 rounded-full border border-sky-200">
                Filtro Activo
              </span>
            )}
          </label>
          <select
            id="share-modal-category-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer shadow-2xs"
          >
            <option value="all">📦 Todas las Categorías (Catálogo Completo)</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                🏷️ {cat}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 font-medium pt-0.5">
            {selectedCategory !== 'all'
              ? `El enlace incluirá la categoría "${selectedCategory}" para que el cliente la vea seleccionada automáticamente.`
              : 'Selecciona una categoría específica para generar un link enfocado en ese grupo de productos.'}
          </p>
        </div>

        {/* URL Box & Copy */}
        <div className="space-y-1.5 pt-0.5">
          <label className="block text-xs font-bold text-slate-700">
            Enlace para Cliente {selectedCategory !== 'all' ? `(${selectedCategory})` : ''}:
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              readOnly
              value={customerStoreUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs text-sky-800 font-mono focus:outline-none focus:ring-2 focus:ring-sky-200 select-all font-semibold"
            />
            <button
              type="button"
              id="btn-modal-copy-store-url"
              onClick={handleCopy}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition flex items-center space-x-1.5 cursor-pointer shadow-xs active:scale-95 whitespace-nowrap ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-sky-600 hover:bg-sky-700 text-white'
              }`}
              title="Copiar enlace al portapapeles"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>¡Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Share Actions (WhatsApp & Open Store) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            id="btn-modal-whatsapp-store"
            className="py-2.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition flex items-center justify-center space-x-2 cursor-pointer shadow-xs active:scale-95 text-center"
          >
            <MessageCircle className="w-4 h-4 fill-emerald-100 text-emerald-600" />
            <span>Enviar por WhatsApp</span>
          </a>

          <a
            href={customerStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            id="btn-modal-open-store"
            className="py-2.5 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition flex items-center justify-center space-x-2 cursor-pointer shadow-xs active:scale-95 text-center"
          >
            <ExternalLink className="w-4 h-4 text-slate-300" />
            <span>Abrir Vista Cliente</span>
          </a>
        </div>

        {/* Helpful Tip & Close */}
        <div className="pt-2.5 flex items-center justify-between border-t border-slate-100 flex-wrap gap-2">
          <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>Ideal para enviar campañas por categoría en WhatsApp o Redes</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

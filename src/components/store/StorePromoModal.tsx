import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  X,
  Copy,
  Check,
  MessageCircle,
  ShoppingBag,
  ExternalLink,
  Gift,
  Tag,
  Flame,
  ArrowRight,
} from 'lucide-react';
import { StorePromoPopupConfig } from '../../types.ts';
import { buildWhatsAppLink } from '../../utils/phone.ts';
import { safeSessionStorage } from '../../utils/safeStorage.ts';

interface StorePromoModalProps {
  config?: StorePromoPopupConfig | string | null;
  storeName: string;
  whatsappNumber: string;
  currency?: string;
  onFilterOffers?: () => void;
  onSelectProduct?: (productId: string | number) => void;
  forceOpen?: boolean;
  onClose?: () => void;
}

const DEFAULT_PROMO_DATA: StorePromoPopupConfig = {
  active: true,
  theme: 'christmas',
  badge: '🎄 OFERTA ESPECIAL',
  title: '¡Gran Venta Especial y Descuentos!',
  description: 'Aprovecha promociones exclusivas, envíos rápidos a todo el país y atención personalizada vía WhatsApp.',
  imageUrl: 'https://images.unsplash.com/photo-1543258103-a62bd96b300b?auto=format&fit=crop&w=900&q=85',
  couponCode: 'OFERTA2026',
  buttonText: '¡Pedir con Descuento por WhatsApp!',
  actionType: 'whatsapp',
  actionUrl: '',
};

export const StorePromoModal: React.FC<StorePromoModalProps> = ({
  config,
  storeName,
  whatsappNumber,
  currency = 'USD',
  onFilterOffers,
  onSelectProduct,
  forceOpen = false,
  onClose,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Parse config if it is string or undefined
  const parsedConfig: StorePromoPopupConfig | null = useMemo(() => {
    if (!config) {
      return DEFAULT_PROMO_DATA;
    }
    if (typeof config === 'string') {
      try {
        const parsed = JSON.parse(config);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_PROMO_DATA, ...parsed };
        }
      } catch {
        return DEFAULT_PROMO_DATA;
      }
    }
    if (typeof config === 'object') {
      return { ...DEFAULT_PROMO_DATA, ...config };
    }
    return DEFAULT_PROMO_DATA;
  }, [config]);

  const active = forceOpen || (parsedConfig ? parsedConfig.active !== false : true);
  const theme = parsedConfig?.theme || 'christmas';

  // Compute a unique key for the promo so if the title or image changes, it can show again once
  const promoHash = useMemo(() => {
    if (!parsedConfig) return 'default_promo';
    return `${parsedConfig.title || ''}_${parsedConfig.imageUrl || ''}_${parsedConfig.couponCode || ''}`.slice(0, 40);
  }, [parsedConfig]);

  useEffect(() => {
    if (forceOpen) {
      setIsOpen(true);
      return;
    }

    if (!active) {
      setIsOpen(false);
      return;
    }

    // Check if user already dismissed this exact promo in current session
    try {
      const storageKey = `comerxia_promo_dismissed_${promoHash}`;
      const hasDismissed = safeSessionStorage.getItem(storageKey);
      if (!hasDismissed) {
        // Show after a subtle delay for smooth entry
        const timer = setTimeout(() => {
          setIsOpen(true);
        }, 400);
        return () => clearTimeout(timer);
      }
    } catch {
      setIsOpen(true);
    }
  }, [forceOpen, active, promoHash]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    try {
      const storageKey = `comerxia_promo_dismissed_${promoHash}`;
      safeSessionStorage.setItem(storageKey, 'true');
    } catch {}
    if (onClose) onClose();
  };

  const handleCopyCoupon = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!parsedConfig?.couponCode) return;
    navigator.clipboard.writeText(parsedConfig.couponCode.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleActionClick = () => {
    const actionType = parsedConfig?.actionType || 'whatsapp';

    if (actionType === 'whatsapp') {
      const couponText = parsedConfig?.couponCode ? ` con el cupón *${parsedConfig.couponCode}*` : '';
      const promoName = parsedConfig?.title || 'la promoción especial';
      const productMention = parsedConfig?.featuredProductName ? ` de *${parsedConfig.featuredProductName}*` : '';
      const msg = `¡Hola *${storeName}*! 👋 Vi la promoción${productMention} (${promoName})${couponText} en la tienda online y deseo consultar disponibilidad y realizar mi pedido.`;
      
      const cleanPhone = (whatsappNumber || '').replace(/\D/g, '');
      const link = buildWhatsAppLink(cleanPhone, msg);
      window.open(link, '_blank');
      handleClose();
    } else if (actionType === 'product' && parsedConfig?.featuredProductId && onSelectProduct) {
      onSelectProduct(parsedConfig.featuredProductId);
      handleClose();
    } else if (actionType === 'catalog') {
      if (onFilterOffers) {
        onFilterOffers();
      }
      handleClose();
    } else if (actionType === 'url' && parsedConfig?.actionUrl) {
      window.open(parsedConfig.actionUrl, '_blank');
      handleClose();
    } else {
      handleClose();
    }
  };

  if (!active || !parsedConfig) return null;

  // Visual Theme Styling Accents
  const getThemeStyles = () => {
    switch (theme) {
      case 'christmas':
        return {
          gradientHeader: 'from-red-600 via-rose-700 to-emerald-800',
          badgeBg: 'bg-emerald-600/90 text-emerald-50 border-emerald-400/40',
          ctaButton: 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-rose-600/30',
          couponBadge: 'bg-red-50 text-red-700 border-red-200',
          sparkleColor: 'text-amber-300',
          fabBg: 'from-red-600 to-emerald-700 text-white shadow-rose-600/40',
          fallbackImage: 'https://images.unsplash.com/photo-1543258103-a62bd96b300b?auto=format&fit=crop&w=900&q=85',
        };
      case 'black_friday':
        return {
          gradientHeader: 'from-zinc-900 via-black to-red-950',
          badgeBg: 'bg-red-600 text-white border-red-500/50',
          ctaButton: 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-amber-500/30 font-black',
          couponBadge: 'bg-zinc-100 text-zinc-900 border-zinc-300',
          sparkleColor: 'text-amber-400',
          fabBg: 'from-zinc-900 to-red-900 text-amber-300 shadow-black/50',
          fallbackImage: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=900&q=85',
        };
      case 'super_deals':
        return {
          gradientHeader: 'from-amber-500 via-orange-600 to-rose-600',
          badgeBg: 'bg-amber-400 text-amber-950 border-amber-300',
          ctaButton: 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white shadow-orange-600/30',
          couponBadge: 'bg-orange-50 text-orange-800 border-orange-200',
          sparkleColor: 'text-yellow-200',
          fabBg: 'from-amber-500 to-red-600 text-white shadow-orange-500/40',
          fallbackImage: 'https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=900&q=85',
        };
      case 'new_year':
        return {
          gradientHeader: 'from-slate-900 via-indigo-950 to-amber-900',
          badgeBg: 'bg-amber-500/90 text-slate-950 border-amber-300',
          ctaButton: 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-amber-500/30 font-black',
          couponBadge: 'bg-amber-50 text-amber-900 border-amber-200',
          sparkleColor: 'text-amber-300',
          fabBg: 'from-indigo-900 to-amber-600 text-amber-200 shadow-indigo-950/50',
          fallbackImage: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?auto=format&fit=crop&w=900&q=85',
        };
      case 'clearance':
        return {
          gradientHeader: 'from-yellow-500 via-amber-600 to-rose-600',
          badgeBg: 'bg-rose-600 text-white border-rose-400',
          ctaButton: 'bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white shadow-rose-600/30',
          couponBadge: 'bg-rose-50 text-rose-800 border-rose-200',
          sparkleColor: 'text-yellow-300',
          fabBg: 'from-rose-600 to-red-700 text-white shadow-rose-600/40',
          fallbackImage: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=900&q=85',
        };
      default:
        return {
          gradientHeader: 'from-sky-600 via-blue-700 to-indigo-800',
          badgeBg: 'bg-sky-500 text-white border-sky-300',
          ctaButton: 'bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white shadow-sky-600/30',
          couponBadge: 'bg-sky-50 text-sky-800 border-sky-200',
          sparkleColor: 'text-sky-300',
          fabBg: 'from-sky-600 to-blue-700 text-white shadow-sky-600/40',
          fallbackImage: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=900&q=85',
        };
    }
  };

  const themeStyle = getThemeStyles();
  const displayImage = parsedConfig.imageUrl || themeStyle.fallbackImage;
  const badgeText = parsedConfig.badge || '✨ OFERTA ESPECIAL';
  const buttonText = parsedConfig.buttonText || (
    parsedConfig.actionType === 'catalog'
      ? 'Explorar Catálogo con Descuento'
      : parsedConfig.actionType === 'url'
      ? 'Aprovechar Oferta'
      : 'Comprar por WhatsApp'
  );

  return (
    <>
      {/* If closed, show a Floating Offer Badge to let customer reopen anytime */}
      {!isOpen && !forceOpen && (
        <button
          type="button"
          id="btn-reopen-store-promo"
          onClick={() => setIsOpen(true)}
          className={`fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 px-3.5 py-2.5 rounded-full shadow-xl bg-gradient-to-r ${themeStyle.fabBg} font-black text-xs flex items-center gap-2 cursor-pointer transition-transform hover:scale-105 active:scale-95 ring-2 ring-white/50 animate-pulse`}
          title="Ver cartel de promociones y cupón de descuento"
        >
          <Gift className="w-4 h-4 animate-bounce" />
          <span className="truncate max-w-[130px] sm:max-w-none">{badgeText}</span>
        </button>
      )}

      {/* Main Promo Popup Modal Backdrop */}
      {isOpen && (
        <div
          id="promo-popup-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-all duration-300 animate-in fade-in"
          onClick={handleClose}
        >
          <div
            id="promo-popup-card"
            className="relative w-full max-w-lg overflow-hidden bg-white rounded-3xl shadow-2xl border border-slate-200/80 transition-all transform animate-in zoom-in-95 duration-200 text-slate-900 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              id="btn-close-promo-popup"
              onClick={handleClose}
              className="absolute top-3 right-3 z-30 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm flex items-center justify-center transition-transform active:scale-95 shadow-md cursor-pointer group"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" />
            </button>

            {/* Scrollable Content Container */}
            <div className="overflow-y-auto custom-scrollbar flex-1">
              {/* Top Visual Poster Section */}
              <div className="relative w-full h-56 sm:h-64 overflow-hidden bg-slate-900">
                <img
                  src={displayImage}
                  alt={parsedConfig.title}
                  className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />

                {/* Badge pill */}
                <div className="absolute top-4 left-4 z-20 flex items-center space-x-1.5">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wide border shadow-md ${themeStyle.badgeBg}`}>
                    <Sparkles className={`w-3.5 h-3.5 ${themeStyle.sparkleColor} animate-pulse`} />
                    <span>{badgeText}</span>
                  </span>
                </div>

                {/* Bottom Title on Image */}
                <div className="absolute bottom-3 left-4 right-4 z-20">
                  <span className="text-xs font-bold text-amber-300 drop-shadow-sm uppercase tracking-wider">
                    {storeName}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-white leading-tight drop-shadow-md">
                    {parsedConfig.title}
                  </h2>
                </div>
              </div>

              {/* Body Information Section */}
              <div className="p-5 sm:p-6 space-y-4">
                {/* Description Text */}
                <p className="text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
                  {parsedConfig.description}
                </p>

                {/* Featured Product Pill/Card (if selected) */}
                {parsedConfig.featuredProductName && (
                  <div
                    onClick={() => {
                      if (onSelectProduct && parsedConfig.featuredProductId) {
                        onSelectProduct(parsedConfig.featuredProductId);
                        handleClose();
                      }
                    }}
                    className={`p-3 bg-gradient-to-r from-amber-50 to-orange-50/80 border border-amber-200/90 rounded-2xl flex items-center gap-3 shadow-2xs ${
                      onSelectProduct && parsedConfig.featuredProductId
                        ? 'cursor-pointer hover:border-amber-400 hover:shadow-md transition group'
                        : ''
                    }`}
                    title={
                      onSelectProduct && parsedConfig.featuredProductId
                        ? 'Toca para ver este producto en la tienda'
                        : undefined
                    }
                  >
                    {parsedConfig.featuredProductImage ? (
                      <img
                        src={parsedConfig.featuredProductImage}
                        alt={parsedConfig.featuredProductName}
                        className="w-14 h-14 rounded-xl object-cover border border-amber-300 shadow-xs flex-shrink-0 group-hover:scale-105 transition"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-amber-200/70 text-amber-900 flex items-center justify-center font-black text-xl flex-shrink-0 group-hover:scale-105 transition">
                        ⭐
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider block">
                          ⭐ Producto Estrella de la Promoción
                        </span>
                        {onSelectProduct && parsedConfig.featuredProductId && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full group-hover:bg-amber-500 group-hover:text-slate-950 transition">
                            Ver Producto →
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                        {parsedConfig.featuredProductName}
                      </h4>
                      {parsedConfig.featuredProductPrice && (
                        <span className="text-xs font-black text-amber-700 block mt-0.5">
                          {typeof parsedConfig.featuredProductPrice === 'number'
                            ? `${currency} ${parsedConfig.featuredProductPrice.toFixed(2)}`
                            : String(parsedConfig.featuredProductPrice)}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Coupon Code Banner (if provided) */}
                {parsedConfig.couponCode && (
                  <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${themeStyle.couponBadge}`}>
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-white/80 flex items-center justify-center flex-shrink-0 shadow-2xs">
                        <Tag className="w-4 h-4 text-slate-700" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Cupón de Descuento
                        </span>
                        <span className="text-base font-black font-mono tracking-widest text-slate-900 truncate block">
                          {parsedConfig.couponCode}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      id="btn-copy-promo-coupon"
                      onClick={handleCopyCoupon}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 font-bold text-xs shadow-2xs transition flex items-center space-x-1.5 cursor-pointer active:scale-95 flex-shrink-0"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">¡Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    id="btn-promo-primary-action"
                    onClick={handleActionClick}
                    className={`w-full py-3.5 px-5 rounded-2xl font-black text-sm tracking-wide shadow-lg transition-all transform active:scale-[0.98] cursor-pointer flex items-center justify-center space-x-2.5 ${themeStyle.ctaButton}`}
                  >
                    {parsedConfig.actionType === 'catalog' ? (
                      <ShoppingBag className="w-4 h-4" />
                    ) : parsedConfig.actionType === 'url' ? (
                      <ExternalLink className="w-4 h-4" />
                    ) : (
                      <MessageCircle className="w-4 h-4" />
                    )}
                    <span>{buttonText}</span>
                    <ArrowRight className="w-4 h-4 opacity-80" />
                  </button>

                  <button
                    type="button"
                    id="btn-promo-dismiss"
                    onClick={handleClose}
                    className="w-full py-2.5 px-4 text-xs font-bold text-slate-400 hover:text-slate-700 transition cursor-pointer text-center"
                  >
                    Continuar a la tienda
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};


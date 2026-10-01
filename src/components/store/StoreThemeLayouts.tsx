import React from 'react';
import {
  BadgeCheck,
  Check,
  Copy,
  CreditCard,
  Eye,
  Film,
  Image as ImageIcon,
  Info,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Play,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
  X,
  Zap,
  PackageCheck,
  Bell,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Terminal,
  Activity,
  Layers,
  Palette,
  Send,
  Share2,
  Settings,
  Star,
  Flame,
  ChevronDown,
  RotateCcw,
  Tag,
  Filter,
  ArrowRight,
  Gift,
  ShoppingBag,
  ExternalLink,
} from 'lucide-react';
import { CartItem, CustomerOrder, InventoryItem, StoreConfig, StoreTheme, CourierPartner, PaymentMethodPartner } from '../../types.ts';
import { buildWhatsAppLink, toEcuadorInternationalPhone } from '../../utils/phone.ts';
import { StoreSmartSearchBar } from './StoreSmartSearchBar.tsx';
import { CategoryTransitionBanner } from './CategoryTransitionBanner.tsx';
import { DEFAULT_FALLBACK_PAYMENTS } from './StoreLogisticsAndPaymentsSlider.tsx';
import { searchProductsFuzzy } from '../../utils/fuzzySearch.ts';
import { getThemeColors, ThemeColorPalette } from '../../utils/themeColors.ts';
import { ProductMediaDisplay } from '../ProductMediaDisplay.tsx';
import { getProductPhotosWithFallback, normalizeMediaUrl } from '../../utils/media-helper.ts';

export interface StoreLayoutProps {
  products: InventoryItem[];
  filteredProducts: InventoryItem[];
  categories: string[];
  categoryCounts: Record<string, number>;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  inStockOnly: boolean;
  setInStockOnly: (v: boolean) => void;
  showOffersOnly: boolean;
  setShowOffersOnly: (v: boolean) => void;
  sortBy: 'featured' | 'price_asc' | 'price_desc' | 'name' | 'category' | 'date_desc' | 'random' | string;
  setSortBy: (s: any) => void;
  cart: CartItem[];
  cartTotalItems: number;
  onAddToCart: (item: InventoryItem, qty: number) => void;
  onUpdateCartQty: (itemId: number, newQty: number) => void;
  onDirectBuyProduct: (item: InventoryItem, e: React.MouseEvent) => void;
  onShareProductWhatsApp: (item: InventoryItem, e: React.MouseEvent) => void;
  onCopyProductLink: (item: InventoryItem, e: React.MouseEvent) => void;
  onQuickViewProduct: (item: InventoryItem) => void;
  storeConfig: StoreConfig;
  courierPartners: CourierPartner[];
  paymentPartners: PaymentMethodPartner[];
  activeTheme: StoreTheme;
  activePalette?: string[];
  themeColors?: Record<string, string[]>;
  themeStyles: any;
  currency: string;
  isCustomerView: boolean;
  isCustomerOnly: boolean;
  isCustomerMode: boolean;
  storeTab: 'catalog' | 'orders' | 'settings';
  setStoreTab: (tab: 'catalog' | 'orders' | 'settings') => void;
  orders: CustomerOrder[];
  isLogoAnimating: boolean;
  onLogoClick: () => void;
  onOpenCart: () => void;
  onOpenShareModal?: () => void;
  isFilterSheetOpen?: boolean;
  onToggleFilterSheet?: (open: boolean) => void;
}

// Helper to extract photos
const getProductPhotos = (item: InventoryItem): string[] => {
  return getProductPhotosWithFallback(item);
};

// ----------------------------------------------------
// 1. REUSABLE SUB-COMPONENTS
// ----------------------------------------------------

const DEFAULT_PROMO_DATA = {
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

export const InlineCommercialPoster: React.FC<{
  storeConfig: StoreConfig;
  categories: string[];
  setSelectedCategory: (cat: string) => void;
  setShowOffersOnly: (v: boolean) => void;
  products?: InventoryItem[];
  currency?: string;
  onQuickViewProduct?: (item: InventoryItem) => void;
}> = ({
  storeConfig,
  categories,
  setSelectedCategory,
  setShowOffersOnly,
  products = [],
  currency = 'USD',
  onQuickViewProduct,
}) => {
  const [copiedCoupon, setCopiedCoupon] = React.useState(false);

  const parsedPromo = React.useMemo(() => {
    const raw = storeConfig?.promoPopup;
    if (!raw) return DEFAULT_PROMO_DATA;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return { ...DEFAULT_PROMO_DATA, ...parsed };
      } catch {
        return DEFAULT_PROMO_DATA;
      }
    }
    if (typeof raw === 'object') return { ...DEFAULT_PROMO_DATA, ...raw };
    return DEFAULT_PROMO_DATA;
  }, [storeConfig?.promoPopup]);

  if (!parsedPromo || parsedPromo.active === false) {
    return null;
  }

  const theme = parsedPromo.theme || 'christmas';

  const getThemeStyles = (t: string) => {
    switch (t) {
      case 'christmas':
        return {
          badgeBg: 'bg-emerald-600/90 text-emerald-50 border-emerald-400/40',
          ctaButton: 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-rose-600/30 border-rose-500',
          fallbackImage: 'https://images.unsplash.com/photo-1543258103-a62bd96b300b?auto=format&fit=crop&w=900&q=85',
        };
      case 'black_friday':
        return {
          badgeBg: 'bg-red-600 text-white border-red-500/50',
          ctaButton: 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-amber-500/30 font-black border-amber-400',
          fallbackImage: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=900&q=85',
        };
      case 'super_deals':
        return {
          badgeBg: 'bg-amber-400 text-amber-950 border-amber-300',
          ctaButton: 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white shadow-orange-600/30 border-orange-500',
          fallbackImage: 'https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=900&q=85',
        };
      case 'new_year':
        return {
          badgeBg: 'bg-amber-500/90 text-slate-950 border-amber-300',
          ctaButton: 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-amber-500/30 font-black border-amber-400',
          fallbackImage: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?auto=format&fit=crop&w=900&q=85',
        };
      case 'clearance':
        return {
          badgeBg: 'bg-rose-600 text-white border-rose-400',
          ctaButton: 'bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white shadow-rose-600/30 border-rose-500',
          fallbackImage: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=900&q=85',
        };
      default:
        return {
          badgeBg: 'bg-[#FFD100] text-slate-950 border-amber-400',
          ctaButton: 'bg-[#FFD100] hover:bg-[#E6B800] text-slate-950 font-black border-amber-400 shadow-xl',
          fallbackImage: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=900&q=85',
        };
    }
  };

  const themeStyle = getThemeStyles(theme);
  const title = parsedPromo.title || '';
  const description = parsedPromo.description || '';
  const badge = parsedPromo.badge || '✨ OFERTA ESPECIAL';
  const imageUrl = parsedPromo.imageUrl || parsedPromo.featuredProductImage || themeStyle.fallbackImage;
  const couponCode = parsedPromo.couponCode || '';
  const actionType = parsedPromo.actionType || 'whatsapp';
  const actionUrl = parsedPromo.actionUrl || '';
  const buttonText = parsedPromo.buttonText || (
    actionType === 'catalog'
      ? 'Explorar Catálogo con Descuento'
      : actionType === 'url'
      ? 'Aprovechar Oferta'
      : actionType === 'product'
      ? 'Ver Producto Estrella'
      : 'Comprar por WhatsApp'
  );

  const handleCopyCoupon = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (couponCode) {
      try {
        navigator.clipboard.writeText(couponCode.trim());
      } catch {}
      setCopiedCoupon(true);
      setTimeout(() => setCopiedCoupon(false), 2000);
    }
  };

  const handleCtaClick = () => {
    if (actionType === 'whatsapp') {
      const couponText = couponCode ? ` con el cupón *${couponCode}*` : '';
      const promoName = title || 'la promoción especial';
      const productMention = parsedPromo.featuredProductName ? ` de *${parsedPromo.featuredProductName}*` : '';
      const msg = `¡Hola *${storeConfig.storeName || ''}*! 👋 Vi la promoción${productMention} (${promoName})${couponText} en la tienda online y deseo consultar disponibilidad y realizar mi pedido.`;
      
      const cleanPhone = (storeConfig.whatsappNumber || '').replace(/\D/g, '');
      window.open(buildWhatsAppLink(cleanPhone, msg), '_blank');
    } else if (actionType === 'product' && parsedPromo.featuredProductId && onQuickViewProduct && products.length > 0) {
      const item = products.find(p => String(p.id) === String(parsedPromo.featuredProductId));
      if (item) {
        onQuickViewProduct(item);
      } else {
        setShowOffersOnly(true);
        setSelectedCategory('all');
      }
    } else if (actionType === 'catalog') {
      setShowOffersOnly(true);
      setSelectedCategory('all');
    } else if (actionType === 'url' && actionUrl) {
      window.open(actionUrl, '_blank');
    } else {
      const cleanPhone = (storeConfig.whatsappNumber || '').replace(/\D/g, '');
      const msg = `¡Hola ${storeConfig.storeName || ''}! Me interesa la oferta: ${title || 'Afiche Comercial'}.`;
      window.open(buildWhatsAppLink(cleanPhone, msg), '_blank');
    }
  };

  const handleProductCardClick = () => {
    if (onQuickViewProduct && parsedPromo.featuredProductId && products.length > 0) {
      const item = products.find(p => String(p.id) === String(parsedPromo.featuredProductId));
      if (item) onQuickViewProduct(item);
    }
  };

  return (
    <div className="mb-8 rounded-3xl overflow-hidden shadow-2xl border border-amber-400/30 relative min-h-[340px] sm:min-h-[400px] lg:min-h-[450px] flex flex-col justify-between p-6 sm:p-8 lg:p-10 transition-all duration-300 bg-slate-950 group">
      {/* 1. Full Panel Background Image */}
      {imageUrl && (
        <img
          src={imageUrl}
          alt={title || 'Afiche comercial'}
          className="absolute inset-0 w-full h-full object-cover object-center rounded-3xl z-0 transition-transform duration-700 ease-out group-hover:scale-[1.02]"
        />
      )}

      {/* 2. Soft Vignette Gradient Overlay for maximum readability without covering the image */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/45 to-slate-950/25 z-0 pointer-events-none" />

      {/* 3. Top Elements (Badge & Coupon) floating directly on top of background image */}
      <div className="relative z-10 flex items-center justify-between space-x-2 flex-wrap gap-y-2">
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          {badge && (
            <span className={`px-4 py-1.5 rounded-full font-black text-xs uppercase tracking-wider shadow-lg border ${themeStyle.badgeBg}`}>
              {badge}
            </span>
          )}
          {couponCode && (
            <button
              type="button"
              onClick={handleCopyCoupon}
              className="px-4 py-1.5 rounded-full bg-slate-950/85 hover:bg-slate-950 text-amber-300 border border-amber-400/50 text-xs font-mono font-bold flex items-center space-x-1.5 cursor-pointer transition active:scale-95 shadow-lg backdrop-blur-md"
              title="Copiar código de cupón"
            >
              <Tag className="w-3.5 h-3.5 text-amber-400" />
              <span>CUPÓN: <strong className="text-white">{couponCode}</strong></span>
              {copiedCoupon ? (
                <span className="text-emerald-400 font-sans text-[10px] ml-1 font-bold">¡Copiado!</span>
              ) : (
                <Copy className="w-3.5 h-3.5 ml-1 text-amber-400/80" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* 4. Bottom Elements (Title, Description, Featured Product Card, CTA) floating directly on top of background image */}
      <div className="relative z-10 mt-8 space-y-4 max-w-2xl">
        {/* Title & Store name */}
        {title && (
          <div>
            <span className="text-xs font-bold text-amber-300 drop-shadow-md uppercase tracking-wider block mb-1">
              ⭐ {storeConfig.storeName || 'TIENDA ONLINE'}
            </span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight leading-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
              {title}
            </h2>
          </div>
        )}

        {/* Description */}
        {description && (
          <p className="text-xs sm:text-sm text-zinc-100 font-medium leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] max-w-xl">
            {description}
          </p>
        )}

        {/* Featured Product Card (if configured) */}
        {parsedPromo.featuredProductName && (
          <div
            onClick={handleProductCardClick}
            className={`p-3 bg-slate-950/85 hover:bg-slate-950 backdrop-blur-md border border-amber-400/50 rounded-2xl flex items-center gap-3 shadow-2xl max-w-lg transition group ${
              onQuickViewProduct && parsedPromo.featuredProductId ? 'cursor-pointer hover:border-amber-300' : ''
            }`}
            title={onQuickViewProduct && parsedPromo.featuredProductId ? 'Toca para ver este producto en la tienda' : undefined}
          >
            {parsedPromo.featuredProductImage ? (
              <img
                src={parsedPromo.featuredProductImage}
                alt={parsedPromo.featuredProductName}
                className="w-14 h-14 rounded-xl object-cover border border-amber-300/60 shadow-xs flex-shrink-0 group-hover:scale-105 transition"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center font-black text-xl flex-shrink-0 border border-amber-400/40 group-hover:scale-105 transition">
                ⭐
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider block truncate">
                  ⭐ Producto Estrella de la Promoción
                </span>
                {onQuickViewProduct && parsedPromo.featuredProductId && (
                  <span className="text-[10px] font-bold text-slate-950 bg-amber-400 px-2 py-0.5 rounded-full flex-shrink-0 group-hover:bg-amber-300 transition">
                    Ver Producto →
                  </span>
                )}
              </div>
              <h4 className="text-xs sm:text-sm font-black text-white truncate mt-0.5">
                {parsedPromo.featuredProductName}
              </h4>
              {parsedPromo.featuredProductPrice !== undefined && parsedPromo.featuredProductPrice !== null && (
                <span className="text-xs font-black text-amber-300 block mt-0.5">
                  {currency} {typeof parsedPromo.featuredProductPrice === 'number'
                    ? parsedPromo.featuredProductPrice.toFixed(2)
                    : String(parsedPromo.featuredProductPrice)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* CTA Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleCtaClick}
            className={`w-full sm:w-auto px-8 py-3.5 rounded-full font-black text-xs sm:text-sm transition shadow-2xl hover:scale-105 active:scale-95 flex items-center justify-center space-x-2 cursor-pointer border ${themeStyle.ctaButton}`}
          >
            {actionType === 'catalog' ? (
              <ShoppingBag className="w-4 h-4" />
            ) : actionType === 'url' ? (
              <ExternalLink className="w-4 h-4" />
            ) : (
              <MessageCircle className="w-4 h-4 fill-current" />
            )}
            <span>{buttonText}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const StoreHeader: React.FC<{
  props: StoreLayoutProps;
  variant?: 'standard' | 'boutique' | 'fresh' | 'brutalist' | 'cyber' | 'minimal';
}> = ({ props, variant = 'standard' }) => {
  const {
    storeConfig,
    activeTheme,
    themeStyles,
    isCustomerView,
    isCustomerMode,
    isCustomerOnly,
    storeTab,
    setStoreTab,
    orders,
    cartTotalItems,
    isLogoAnimating,
    onLogoClick,
    onOpenCart,
    products,
  } = props;

  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  if (variant === 'boutique') {
    return (
      <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-7 transition-all duration-300 ${themeStyles.headerBg} relative overflow-hidden`}>
        {/* Subtle gold luxury ambient glow */}
        <div className="absolute top-0 right-1/4 w-96 h-32 bg-amber-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-5 relative z-10">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div
              id="store-logo-boutique"
              onClick={onLogoClick}
              className={`cursor-pointer select-none transition-all duration-300 ${isLogoAnimating ? 'animate-store-logo-bounce' : 'hover:scale-105 active:scale-95'
                }`}
            >
              {/* Celular / Mobile (Cuadrado 1:1) */}
              <div className="md:hidden">
                {storeConfig.logoUrl ? (
                  <div className="w-12 h-12 rounded-xl overflow-hidden shadow-lg flex items-center justify-center flex-shrink-0 border border-amber-500/40 bg-zinc-900">
                    <img src={storeConfig.logoUrl} alt={storeConfig.storeName} className="w-full h-full object-contain p-1" />
                  </div>
                ) : storeConfig.logoDesktopUrl ? (
                  <div className="w-12 h-12 rounded-xl overflow-hidden shadow-lg flex items-center justify-center flex-shrink-0 border border-amber-500/40 bg-zinc-900">
                    <img src={storeConfig.logoDesktopUrl} alt={storeConfig.storeName} className="w-full h-full object-contain p-1" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-amber-300 shadow-lg flex-shrink-0 bg-gradient-to-tr from-zinc-950 via-zinc-900 to-zinc-800 border border-amber-500/50">
                    <Store className="w-5 h-5 text-amber-400" />
                  </div>
                )}
              </div>

              {/* PC / Desktop (Rectangular u horizontal) */}
              <div className="hidden md:block">
                {storeConfig.logoDesktopUrl ? (
                  <div className="h-14 lg:h-16 max-w-[240px] lg:max-w-[280px] rounded-2xl overflow-hidden shadow-lg flex items-center justify-center flex-shrink-0 border border-amber-500/40 bg-zinc-900 px-3">
                    <img src={storeConfig.logoDesktopUrl} alt={storeConfig.storeName} className="h-full w-auto max-w-full object-contain py-1" />
                  </div>
                ) : storeConfig.logoUrl ? (
                  <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg flex items-center justify-center flex-shrink-0 border border-amber-500/40 bg-zinc-900">
                    <img src={storeConfig.logoUrl} alt={storeConfig.storeName} className="w-full h-full object-contain p-1" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-amber-300 shadow-lg flex-shrink-0 bg-gradient-to-tr from-zinc-950 via-zinc-900 to-zinc-800 border border-amber-500/50">
                    <Store className="w-7 h-7 text-amber-400" />
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2 flex-wrap gap-y-0.5">
                <span className="text-[9px] sm:text-[10px] font-mono tracking-widest text-amber-400/90 uppercase font-bold">
                  HAUTE SÉLECTION • ATELIER
                </span>
              </div>
              <h1 className={`text-base sm:text-2xl lg:text-3xl font-black tracking-tight truncate ${themeStyles.headerText}`}>
                {storeConfig.storeName || 'Comerxia Boutique'}
              </h1>
              <div className="flex items-center space-x-2 mt-0.5 flex-wrap gap-y-1">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold ${themeStyles.officialBadgeBg}`}>
                  <BadgeCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 text-amber-400" />
                  Boutique Certificada
                </span>
                <p className={`text-[11px] sm:text-xs ${themeStyles.headerSubtext} line-clamp-1`}>
                  {storeConfig.description || 'Colección exclusiva y atención de alta gama.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2 self-start md:self-auto w-full md:w-auto justify-between md:justify-end pt-1 md:pt-0">
            {isCustomerView && storeConfig.whatsappNumber && (
              <a
                href={buildWhatsAppLink(storeConfig.whatsappNumber, `¡Hola! Quisiera atención exclusiva de su Boutique Concierge.`)}
                target="_blank"
                rel="noreferrer"
                className="px-3 sm:px-4 py-2 rounded-xl sm:rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-600 text-zinc-950 font-black text-xs transition shadow-md shadow-amber-500/20 flex items-center space-x-1.5 cursor-pointer active:scale-95 flex-1 sm:flex-initial justify-center"
              >
                <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Concierge VIP</span>
              </a>
            )}

            {isCustomerView && props.onOpenShareModal && (
              <button
                type="button"
                id="btn-share-store-boutique-header"
                onClick={props.onOpenShareModal}
                className="px-3 sm:px-3.5 py-2 rounded-xl sm:rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-500/40 font-bold text-xs transition shadow flex items-center space-x-1.5 cursor-pointer active:scale-95 flex-1 sm:flex-initial justify-center"
                title="Compartir boutique"
              >
                <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                <span>Compartir</span>
              </button>
            )}

            {!isCustomerMode && !isCustomerOnly && (
              <div className="flex items-center bg-zinc-900/90 p-1 rounded-xl sm:rounded-2xl border border-amber-500/30 text-xs gap-1">
                <button
                  onClick={() => setStoreTab('catalog')}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl font-bold transition cursor-pointer flex items-center space-x-1.5 ${storeTab === 'catalog' ? 'bg-amber-500 text-zinc-950 font-black shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Catálogo ({products.length})</span>
                </button>
                <button
                  onClick={() => setStoreTab('orders')}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl font-bold transition cursor-pointer flex items-center space-x-1.5 ${storeTab === 'orders' ? 'bg-amber-500 text-zinc-950 font-black shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  <PackageCheck className="w-3.5 h-3.5" />
                  <span>Pedidos ({orders.length})</span>
                  {pendingCount > 0 && (
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  )}
                </button>
              </div>
            )}

            {isCustomerView && (
              <button
                onClick={onOpenCart}
                className={`px-3.5 sm:px-4 py-2 rounded-xl sm:rounded-2xl ${themeStyles.cartCheckoutBtn} transition active:scale-95 flex items-center space-x-2 cursor-pointer font-bold text-xs flex-1 sm:flex-initial justify-center`}
              >
                <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Mi Carrito</span>
                {cartTotalItems > 0 && (
                  <span className="w-5 h-5 rounded-full bg-amber-400 text-zinc-950 text-[11px] font-black flex items-center justify-center">
                    {cartTotalItems}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'brutalist') {
    return (
      <div className={`p-4 sm:p-6 border-3 border-black shadow-[4px_4px_0px_#000] sm:shadow-[6px_6px_0px_#000] ${themeStyles.headerBg} relative`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div
              id="store-logo-brutalist"
              onClick={onLogoClick}
              className={`cursor-pointer select-none transition-all ${isLogoAnimating ? 'animate-store-logo-bounce' : 'hover:rotate-2 active:scale-95'
                }`}
            >
              {/* Celular / Mobile (Cuadrado 1:1) */}
              <div className="md:hidden">
                {storeConfig.logoUrl ? (
                  <div className="w-12 h-12 border-2 border-black bg-yellow-300 p-0.5 flex items-center justify-center shadow-[2px_2px_0px_#000]">
                    <img src={storeConfig.logoUrl} alt={storeConfig.storeName} className="w-full h-full object-contain" />
                  </div>
                ) : storeConfig.logoDesktopUrl ? (
                  <div className="w-12 h-12 border-2 border-black bg-yellow-300 p-0.5 flex items-center justify-center shadow-[2px_2px_0px_#000]">
                    <img src={storeConfig.logoDesktopUrl} alt={storeConfig.storeName} className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-12 h-12 border-2 border-black bg-yellow-300 text-black flex items-center justify-center font-black shadow-[2px_2px_0px_#000]">
                    <Store className="w-6 h-6 text-black stroke-[2.5]" />
                  </div>
                )}
              </div>

              {/* PC / Desktop (Rectangular) */}
              <div className="hidden md:block">
                {storeConfig.logoDesktopUrl ? (
                  <div className="h-14 lg:h-16 max-w-[240px] lg:max-w-[280px] border-3 border-black bg-yellow-300 px-3 flex items-center justify-center shadow-[3px_3px_0px_#000]">
                    <img src={storeConfig.logoDesktopUrl} alt={storeConfig.storeName} className="h-full w-auto max-w-full object-contain py-1" />
                  </div>
                ) : storeConfig.logoUrl ? (
                  <div className="w-16 h-16 border-3 border-black bg-yellow-300 p-1 flex items-center justify-center shadow-[3px_3px_0px_#000]">
                    <img src={storeConfig.logoUrl} alt={storeConfig.storeName} className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-16 h-16 border-3 border-black bg-yellow-300 text-black flex items-center justify-center font-black shadow-[3px_3px_0px_#000]">
                    <Store className="w-8 h-8 text-black stroke-[2.5]" />
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-1.5 sm:space-x-2 flex-wrap gap-1">
                <h1 className="text-base sm:text-2xl lg:text-3xl font-black uppercase tracking-tight text-black truncate">
                  {storeConfig.storeName || 'TIENDA POP'}
                </h1>
                <span className="px-1.5 sm:px-2 py-0.5 border border-black sm:border-2 bg-emerald-300 text-black text-[9px] sm:text-[10px] font-black uppercase shadow-[1px_1px_0px_#000] sm:shadow-[2px_2px_0px_#000]">
                  ★ 100% OFICIAL
                </span>
              </div>
              <p className="text-[11px] sm:text-xs font-bold text-slate-800 mt-0.5 line-clamp-1">
                {storeConfig.description || 'Catálogo directo con entregas rápidas.'}
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2 w-full md:w-auto justify-between md:justify-end pt-1 md:pt-0">
            {isCustomerView && storeConfig.whatsappNumber && (
              <a
                href={buildWhatsAppLink(storeConfig.whatsappNumber)}
                target="_blank"
                rel="noreferrer"
                className="px-3 sm:px-4 py-2 border-2 border-black bg-emerald-400 hover:bg-emerald-300 text-black font-black text-xs shadow-[2px_2px_0px_#000] sm:shadow-[3px_3px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center space-x-1.5 cursor-pointer flex-1 sm:flex-initial justify-center"
              >
                <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black" />
                <span>WHATSAPP DIRECTO</span>
              </a>
            )}

            {isCustomerView && props.onOpenShareModal && (
              <button
                type="button"
                id="btn-share-store-brutalist-header"
                onClick={props.onOpenShareModal}
                className="px-3 sm:px-4 py-2 border-2 border-black bg-cyan-300 hover:bg-cyan-200 text-black font-black text-xs shadow-[2px_2px_0px_#000] sm:shadow-[3px_3px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center space-x-1.5 cursor-pointer flex-1 sm:flex-initial justify-center"
                title="COMPARTIR TIENDA"
              >
                <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black" />
                <span>COMPARTIR</span>
              </button>
            )}

            {!isCustomerMode && !isCustomerOnly && (
              <div className="flex items-center bg-white p-1 border-2 border-black shadow-[2px_2px_0px_#000] text-xs gap-1">
                <button
                  onClick={() => setStoreTab('catalog')}
                  className={`px-2.5 sm:px-3 py-1.5 font-black uppercase transition cursor-pointer ${storeTab === 'catalog' ? 'bg-black text-yellow-300' : 'text-black hover:bg-slate-100'
                    }`}
                >
                  Catálogo ({products.length})
                </button>
                <button
                  onClick={() => setStoreTab('orders')}
                  className={`px-2.5 sm:px-3 py-1.5 font-black uppercase transition cursor-pointer flex items-center space-x-1 ${storeTab === 'orders' ? 'bg-black text-yellow-300' : 'text-black hover:bg-slate-100'
                    }`}
                >
                  <span>Pedidos ({orders.length})</span>
                  {pendingCount > 0 && <span className="w-2 h-2 rounded-full bg-rose-500" />}
                </button>
              </div>
            )}

            {isCustomerView && (
              <button
                onClick={onOpenCart}
                className="px-3.5 sm:px-4 py-2 border-2 border-black bg-yellow-400 hover:bg-yellow-300 text-black font-black text-xs shadow-[2px_2px_0px_#000] sm:shadow-[3px_3px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center space-x-2 cursor-pointer flex-1 sm:flex-initial justify-center"
              >
                <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>CARRITO ({cartTotalItems})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'cyber') {
    return (
      <div className={`p-4 sm:p-6 border border-cyan-500/70 shadow-[0_0_15px_rgba(6,182,212,0.2)] ${themeStyles.headerBg} relative overflow-hidden`}>
        {/* Futuristic Cyber grid line overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(#06b6d4_1px,transparent_1px)] [background-size:16px_16px] opacity-15 pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4 relative z-10">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div
              id="store-logo-cyber"
              onClick={onLogoClick}
              className={`cursor-pointer select-none transition-all duration-300 ${isLogoAnimating ? 'animate-store-logo-bounce' : 'hover:scale-105 active:scale-95'
                }`}
            >
              {/* Celular / Mobile (Cuadrado 1:1) */}
              <div className="md:hidden">
                {storeConfig.logoUrl ? (
                  <div className="w-12 h-12 border border-cyan-400 bg-[#070d18] p-0.5 flex items-center justify-center shadow-[0_0_10px_rgba(6,182,212,0.4)]">
                    <img src={storeConfig.logoUrl} alt={storeConfig.storeName} className="w-full h-full object-contain" />
                  </div>
                ) : storeConfig.logoDesktopUrl ? (
                  <div className="w-12 h-12 border border-cyan-400 bg-[#070d18] p-0.5 flex items-center justify-center shadow-[0_0_10px_rgba(6,182,212,0.4)]">
                    <img src={storeConfig.logoDesktopUrl} alt={storeConfig.storeName} className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-12 h-12 border border-cyan-400 bg-[#0b1528] text-cyan-300 flex items-center justify-center font-mono shadow-[0_0_10px_rgba(6,182,212,0.4)]">
                    <Terminal className="w-5 h-5 text-cyan-400" />
                  </div>
                )}
              </div>

              {/* PC / Desktop (Rectangular) */}
              <div className="hidden md:block">
                {storeConfig.logoDesktopUrl ? (
                  <div className="h-14 lg:h-15 max-w-[240px] lg:max-w-[280px] border border-cyan-400 bg-[#070d18] px-3 flex items-center justify-center shadow-[0_0_10px_rgba(6,182,212,0.4)]">
                    <img src={storeConfig.logoDesktopUrl} alt={storeConfig.storeName} className="h-full w-auto max-w-full object-contain py-1" />
                  </div>
                ) : storeConfig.logoUrl ? (
                  <div className="w-15 h-15 border border-cyan-400 bg-[#070d18] p-1 flex items-center justify-center shadow-[0_0_10px_rgba(6,182,212,0.4)]">
                    <img src={storeConfig.logoUrl} alt={storeConfig.storeName} className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-15 h-15 border border-cyan-400 bg-[#0b1528] text-cyan-300 flex items-center justify-center font-mono shadow-[0_0_10px_rgba(6,182,212,0.4)]">
                    <Terminal className="w-7 h-7 text-cyan-400" />
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2 flex-wrap gap-y-0.5">
                <span className="text-[9px] sm:text-[10px] font-mono text-cyan-400 tracking-wider">
                  [NODE: LIVE_STORE]
                </span>
                <span className="text-[9px] sm:text-[10px] font-mono px-1.5 py-0.2 border border-emerald-400/80 text-emerald-300 bg-emerald-950/40">
                  ONLINE
                </span>
              </div>
              <h1 className="text-base sm:text-xl lg:text-2xl font-black font-mono tracking-wider text-cyan-200 uppercase truncate">
                {storeConfig.storeName || 'CYBER_CORE'}
              </h1>
              <p className="text-[11px] sm:text-xs font-mono text-cyan-400/70 mt-0.5 line-clamp-1">
                {storeConfig.description || 'Holographic Catalog Node v4.2'}
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2 w-full md:w-auto justify-between md:justify-end pt-1 md:pt-0">
            {isCustomerView && storeConfig.whatsappNumber && (
              <a
                href={buildWhatsAppLink(storeConfig.whatsappNumber)}
                target="_blank"
                rel="noreferrer"
                className="px-3 sm:px-3.5 py-2 border border-emerald-400 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 font-mono text-xs shadow-[0_0_10px_rgba(16,185,129,0.3)] transition flex items-center space-x-1.5 cursor-pointer flex-1 sm:flex-initial justify-center"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>COMMS_LINK</span>
              </a>
            )}

            {isCustomerView && props.onOpenShareModal && (
              <button
                type="button"
                id="btn-share-store-cyber-header"
                onClick={props.onOpenShareModal}
                className="px-3 sm:px-3.5 py-2 border border-cyan-400 bg-[#0b1528] hover:bg-[#122340] text-cyan-300 font-mono text-xs shadow-[0_0_10px_rgba(6,182,212,0.3)] transition flex items-center space-x-1.5 cursor-pointer flex-1 sm:flex-initial justify-center"
                title="SHARE_STORE"
              >
                <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>[SHARE]</span>
              </button>
            )}

            {!isCustomerMode && !isCustomerOnly && (
              <div className="flex items-center bg-[#070d18] p-1 border border-cyan-500/50 font-mono text-xs gap-1">
                <button
                  onClick={() => setStoreTab('catalog')}
                  className={`px-2.5 sm:px-3 py-1.5 transition cursor-pointer ${storeTab === 'catalog' ? 'bg-cyan-500 text-black font-bold' : 'text-cyan-400 hover:text-cyan-200'
                    }`}
                >
                  CATALOG ({products.length})
                </button>
                <button
                  onClick={() => setStoreTab('orders')}
                  className={`px-2.5 sm:px-3 py-1.5 transition cursor-pointer flex items-center space-x-1 ${storeTab === 'orders' ? 'bg-cyan-500 text-black font-bold' : 'text-cyan-400 hover:text-cyan-200'
                    }`}
                >
                  <span>ORDERS ({orders.length})</span>
                  {pendingCount > 0 && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />}
                </button>
              </div>
            )}

            {isCustomerView && (
              <button
                onClick={onOpenCart}
                className="px-3.5 sm:px-4 py-2 border border-cyan-400 bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-200 font-mono text-xs shadow-[0_0_12px_rgba(6,182,212,0.4)] transition flex items-center space-x-2 cursor-pointer font-bold flex-1 sm:flex-initial justify-center"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>CART [{cartTotalItems}]</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'minimal') {
    return (
      <div className={`p-4 sm:p-7 rounded-2xl sm:rounded-3xl ${themeStyles.headerBg} border-0 shadow-xs transition-all`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-5">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div
              id="store-logo-minimal"
              onClick={onLogoClick}
              className={`cursor-pointer select-none transition-all duration-300 ${isLogoAnimating ? 'animate-store-logo-bounce' : 'hover:scale-105 active:scale-95'
                }`}
            >
              {/* Celular / Mobile (Cuadrado 1:1) */}
              <div className="md:hidden">
                {storeConfig.logoUrl ? (
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-stone-100 flex items-center justify-center shadow-xs">
                    <img src={storeConfig.logoUrl} alt={storeConfig.storeName} className="w-full h-full object-contain p-1 rounded-full" />
                  </div>
                ) : storeConfig.logoDesktopUrl ? (
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-stone-100 flex items-center justify-center shadow-xs">
                    <img src={storeConfig.logoDesktopUrl} alt={storeConfig.storeName} className="w-full h-full object-contain p-1" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-stone-900 text-stone-100 flex items-center justify-center shadow-xs">
                    <Store className="w-5 h-5" />
                  </div>
                )}
              </div>

              {/* PC / Desktop (Rectangular) */}
              <div className="hidden md:block">
                {storeConfig.logoDesktopUrl ? (
                  <div className="h-12 lg:h-14 max-w-[220px] lg:max-w-[260px] rounded-2xl overflow-hidden bg-stone-100 px-3 flex items-center justify-center shadow-xs">
                    <img src={storeConfig.logoDesktopUrl} alt={storeConfig.storeName} className="h-full w-auto max-w-full object-contain p-1" />
                  </div>
                ) : storeConfig.logoUrl ? (
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-stone-100 flex items-center justify-center shadow-xs">
                    <img src={storeConfig.logoUrl} alt={storeConfig.storeName} className="w-full h-full object-contain p-1 rounded-full" />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-stone-900 text-stone-100 flex items-center justify-center shadow-xs">
                    <Store className="w-6 h-6" />
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2 flex-wrap gap-y-0.5">
                <h1 className="text-base sm:text-xl lg:text-2xl font-medium tracking-tight text-stone-900 font-serif truncate">
                  {storeConfig.storeName || 'Nordic Store'}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium bg-stone-100 text-stone-700">
                  Verificado
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-stone-500 mt-0.5 line-clamp-1">
                {storeConfig.description || 'Diseño y simplicidad para tus compras cotidianas.'}
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2 w-full md:w-auto justify-between md:justify-end pt-1 md:pt-0">
            {isCustomerView && storeConfig.whatsappNumber && (
              <a
                href={buildWhatsAppLink(storeConfig.whatsappNumber)}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 sm:px-4 py-2 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-medium transition flex items-center space-x-1.5 cursor-pointer flex-1 sm:flex-initial justify-center"
              >
                <MessageCircle className="w-3.5 h-3.5 text-stone-600" />
                <span>WhatsApp</span>
              </a>
            )}

            {isCustomerView && props.onOpenShareModal && (
              <button
                type="button"
                id="btn-share-store-minimal-header"
                onClick={props.onOpenShareModal}
                className="px-3.5 sm:px-4 py-2 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-medium transition flex items-center space-x-1.5 cursor-pointer flex-1 sm:flex-initial justify-center shadow-2xs"
                title="Compartir tienda"
              >
                <Share2 className="w-3.5 h-3.5 text-stone-600" />
                <span>Compartir</span>
              </button>
            )}

            {!isCustomerMode && !isCustomerOnly && (
              <div className="flex items-center bg-stone-100/80 p-1 rounded-full text-xs gap-1">
                <button
                  onClick={() => setStoreTab('catalog')}
                  className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer ${storeTab === 'catalog' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
                    }`}
                >
                  Catálogo ({products.length})
                </button>
                <button
                  onClick={() => setStoreTab('orders')}
                  className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer flex items-center space-x-1 ${storeTab === 'orders' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
                    }`}
                >
                  <span>Pedidos ({orders.length})</span>
                  {pendingCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
                </button>
              </div>
            )}

            {isCustomerView && (
              <button
                onClick={onOpenCart}
                className="px-3.5 sm:px-4 py-2 rounded-full bg-stone-900 hover:bg-stone-800 text-white font-medium text-xs transition flex items-center space-x-2 cursor-pointer shadow-xs active:scale-95 flex-1 sm:flex-initial justify-center"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Carrito ({cartTotalItems})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Standard & Fresh Header
  return (
    <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-6 transition-all duration-300 ${themeStyles.headerBg}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4">
        <div className="flex items-center space-x-3 sm:space-x-3.5">
          <div
            id="store-logo-interactive"
            onClick={onLogoClick}
            className={`relative cursor-pointer select-none transition-all duration-300 transform-gpu ${isLogoAnimating ? 'animate-store-logo-bounce' : 'hover:scale-105 active:scale-95'
              }`}
            title="Haz clic para ver el logo animado"
          >
            {/* Celular / Mobile (Cuadrado 1:1) */}
            <div className="md:hidden">
              {storeConfig.logoUrl ? (
                <div className="w-12 h-12 rounded-xl overflow-hidden shadow-xs flex items-center justify-center flex-shrink-0 border bg-white border-slate-300">
                  <img src={storeConfig.logoUrl} alt={storeConfig.storeName} className="w-full h-full object-contain p-1 rounded-xl" />
                </div>
              ) : storeConfig.logoDesktopUrl ? (
                <div className="w-12 h-12 rounded-xl overflow-hidden shadow-xs flex items-center justify-center flex-shrink-0 border bg-white border-slate-300">
                  <img src={storeConfig.logoDesktopUrl} alt={storeConfig.storeName} className="w-full h-full object-contain p-1 rounded-xl" />
                </div>
              ) : (
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-md flex-shrink-0 bg-gradient-to-tr ${variant === 'fresh' ? 'from-emerald-500 via-teal-500 to-cyan-500 shadow-teal-500/20' : 'from-sky-500 via-indigo-500 to-emerald-500 shadow-sky-500/20'
                  }`}>
                  <Store className="w-5 h-5" />
                </div>
              )}
            </div>

            {/* PC / Desktop (Rectangular o Cuadrado) */}
            <div className="hidden md:block">
              {storeConfig.logoDesktopUrl ? (
                <div className="h-12 lg:h-14 max-w-[220px] lg:max-w-[260px] rounded-2xl overflow-hidden shadow-xs flex items-center justify-center flex-shrink-0 border bg-white border-slate-300 px-3">
                  <img src={storeConfig.logoDesktopUrl} alt={storeConfig.storeName} className="h-full w-auto max-w-full object-contain p-1" />
                </div>
              ) : storeConfig.logoUrl ? (
                <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-xs flex items-center justify-center flex-shrink-0 border bg-white border-slate-300">
                  <img src={storeConfig.logoUrl} alt={storeConfig.storeName} className="w-full h-full object-contain p-1 rounded-xl" />
                </div>
              ) : (
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-md flex-shrink-0 bg-gradient-to-tr ${variant === 'fresh' ? 'from-emerald-500 via-teal-500 to-cyan-500 shadow-teal-500/20' : 'from-sky-500 via-indigo-500 to-emerald-500 shadow-sky-500/20'
                  }`}>
                  <Store className="w-6 h-6" />
                </div>
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-1.5 sm:space-x-2 flex-wrap gap-y-0.5">
              <h1 className={`text-base sm:text-xl lg:text-2xl font-black tracking-tight truncate ${themeStyles.headerText}`}>
                {storeConfig.storeName || 'Comerxia Store'}
              </h1>
              <span className={`inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black ${themeStyles.officialBadgeBg}`}>
                <BadgeCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
                Oficial
              </span>
              {!isCustomerOnly && isCustomerMode && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-950 border border-amber-300">
                  <Eye className="w-3 h-3 mr-1 text-amber-700" />
                  Comprador
                </span>
              )}
            </div>
            <p className={`text-[11px] sm:text-xs mt-0.5 line-clamp-1 font-medium ${themeStyles.headerSubtext}`}>
              {storeConfig.description || 'Catálogo digital con envíos y pedidos directos'}
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 w-full md:w-auto justify-between md:justify-end pt-1 md:pt-0">
          {isCustomerView && storeConfig.whatsappNumber && (
            <a
              href={buildWhatsAppLink(storeConfig.whatsappNumber)}
              target="_blank"
              rel="noreferrer"
              className="px-3 sm:px-3.5 py-2 rounded-xl sm:rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs active:scale-95 flex-1 sm:flex-initial justify-center"
            >
              <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
              <span>WhatsApp</span>
            </a>
          )}

          {isCustomerView && props.onOpenShareModal && (
            <button
              type="button"
              id="btn-share-store-standard-header"
              onClick={props.onOpenShareModal}
              className="px-3 sm:px-3.5 py-2 rounded-xl sm:rounded-2xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs active:scale-95 flex-1 sm:flex-initial justify-center"
              title="Compartir tienda"
            >
              <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-600" />
              <span>Compartir</span>
            </button>
          )}

          {!isCustomerMode && !isCustomerOnly && (
            <div className="flex items-center bg-slate-100 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-300 text-xs gap-1 sm:gap-1.5">
              <button
                onClick={() => setStoreTab('catalog')}
                className={`px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-bold transition cursor-pointer flex items-center space-x-1.5 ${storeTab === 'catalog' ? 'bg-white text-sky-800 shadow-xs border border-slate-300 font-extrabold' : 'text-slate-700 hover:text-slate-950 hover:bg-slate-200/80'
                  }`}
              >
                <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Catálogo ({products.length})</span>
              </button>
              <button
                onClick={() => setStoreTab('orders')}
                className={`px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-bold transition cursor-pointer flex items-center space-x-1.5 relative ${storeTab === 'orders'
                  ? 'bg-sky-600 text-white shadow-xs font-extrabold'
                  : pendingCount > 0
                    ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 ring-2 ring-amber-400 shadow-xs font-extrabold'
                    : 'text-slate-700 hover:text-slate-950 hover:bg-slate-200/80'
                  }`}
              >
                <div className="relative">
                  <PackageCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  {pendingCount > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-600 rounded-full animate-ping" />}
                </div>
                <span>Pedidos ({orders.length})</span>
                {pendingCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-rose-600 text-white shadow-xs">
                    {pendingCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {isCustomerView && (
            <button
              onClick={onOpenCart}
              className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl ${themeStyles.cartCheckoutBtn} transition active:scale-95 flex items-center space-x-2 cursor-pointer relative flex-1 sm:flex-initial justify-center`}
            >
              <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Mi Carrito</span>
              {cartTotalItems > 0 && (
                <span className={`w-5 h-5 rounded-full ${themeStyles.cartBadge} text-[11px] font-black flex items-center justify-center shadow-xs`}>
                  {cartTotalItems}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const BannerTicker: React.FC<{
  props: StoreLayoutProps;
  variant?: 'standard' | 'top-pill' | 'marquee' | 'hud' | 'minimal';
}> = ({ props, variant = 'standard' }) => {
  const { storeConfig, themeStyles, isCustomerView } = props;
  if (!storeConfig.bannerText) return null;

  if (variant === 'marquee') {
    return (
      <div className="p-2.5 bg-yellow-300 border-3 border-black text-black font-black text-xs uppercase shadow-[4px_4px_0px_#000] flex items-center justify-between overflow-hidden">
        <div className="flex items-center space-x-2">
          <span className="px-2 py-0.5 bg-black text-yellow-300 text-[10px] font-black">⭐ {storeConfig.storeName ? storeConfig.storeName.toUpperCase() : 'NOVEDAD'}:</span>
          <span>{storeConfig.bannerText}</span>
        </div>
        {storeConfig.whatsappNumber && (
          <a
            href={buildWhatsAppLink(storeConfig.whatsappNumber)}
            target="_blank"
            rel="noreferrer"
            className="hover:underline flex items-center space-x-1 flex-shrink-0 ml-2 font-black text-xs"
          >
            <span>PEDIR POR WHATSAPP →</span>
          </a>
        )}
      </div>
    );
  }

  if (variant === 'hud') {
    return (
      <div className="p-2.5 bg-[#070d18] border border-cyan-500/70 text-cyan-300 font-mono text-xs flex items-center justify-between shadow-[0_0_10px_rgba(6,182,212,0.2)]">
        <div className="flex items-center space-x-2">
          <span className="text-cyan-400 font-bold">&gt;_ BROADCAST:</span>
          <span>{storeConfig.bannerText}</span>
        </div>
        {storeConfig.whatsappNumber && (
          <a
            href={buildWhatsAppLink(storeConfig.whatsappNumber)}
            target="_blank"
            rel="noreferrer"
            className="text-emerald-400 hover:underline flex items-center space-x-1 flex-shrink-0 ml-2"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>[COMMS_DIRECT]</span>
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between text-xs font-semibold rounded-2xl p-3 border ${themeStyles.bannerTickerBg}`}>
      <span className="flex items-center space-x-2">
        <Sparkles className={`w-4 h-4 flex-shrink-0 ${themeStyles.bannerIconColor}`} />
        <span>{storeConfig.bannerText}</span>
      </span>

      {storeConfig.whatsappNumber && (
        <a
          href={buildWhatsAppLink(storeConfig.whatsappNumber)}
          target="_blank"
          rel="noreferrer"
          className={`hover:underline flex items-center space-x-1 flex-shrink-0 ml-2 ${isCustomerView ? 'text-emerald-700 font-bold' : 'text-emerald-400'
            }`}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            WhatsApp: {toEcuadorInternationalPhone(storeConfig.whatsappNumber)}
          </span>
        </a>
      )}
    </div>
  );
};

export const TrustBadges: React.FC<{
  props: StoreLayoutProps;
  variant?: 'horizontal' | 'vertical-luxury' | 'bento' | 'brutalist-stickers' | 'cyber-nodes' | 'minimal-clean';
}> = ({ props, variant = 'horizontal' }) => {
  const { themeStyles } = props;

  const badges = [
    { icon: Truck, title: 'Envíos Seguros', sub: 'Entrega rápida a domicilio' },
    { icon: MessageCircle, title: 'WhatsApp Directo', sub: 'Atención y pedidos 1 a 1' },
    { icon: ShieldCheck, title: 'Garantía Total', sub: 'Productos 100% verificados' },
    { icon: CreditCard, title: 'Pagos Fáciles', sub: 'Efectivo o transferencia' },
  ];

  if (variant === 'vertical-luxury') {
    return (
      <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-4 space-y-3.5 shadow-sm">
        <div className="flex items-center space-x-2 border-b border-zinc-800 pb-2.5">
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <h4 className="text-xs font-black text-zinc-100 tracking-wide uppercase">Garantías de Atelier</h4>
        </div>
        <div className="space-y-2.5">
          {badges.map((b, idx) => {
            const Icon = b.icon;
            return (
              <div key={idx} className="flex items-center space-x-3 p-2 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-amber-500/30 text-amber-400 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h5 className="text-[11px] font-bold text-zinc-100">{b.title}</h5>
                  <p className="text-[10px] text-zinc-400">{b.sub}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (variant === 'brutalist-stickers') {
    return (
      <div className="p-4 border-3 border-black bg-white shadow-[4px_4px_0px_#000] space-y-3">
        <div className="flex items-center space-x-2 border-b-2 border-black pb-2">
          <ShieldCheck className="w-4 h-4 text-black" />
          <h4 className="text-xs font-black text-black uppercase">★ GARANTÍAS Y BENEFICIOS</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {badges.map((b, idx) => {
            const Icon = b.icon;
            return (
              <div key={idx} className="p-2.5 border-2 border-black bg-amber-100 shadow-[2px_2px_0px_#000] flex items-center space-x-2.5">
                <div className="w-7 h-7 border-2 border-black bg-yellow-300 text-black flex items-center justify-center flex-shrink-0 font-bold">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h5 className="text-[11px] font-black text-black leading-tight">{b.title}</h5>
                  <p className="text-[10px] font-semibold text-slate-800">{b.sub}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (variant === 'cyber-nodes') {
    return (
      <div className="p-4 border border-cyan-500/60 bg-[#0b1528] shadow-[0_0_12px_rgba(6,182,212,0.2)] space-y-3 font-mono">
        <div className="flex items-center space-x-2 border-b border-cyan-900 pb-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-bold text-cyan-300 uppercase">[SECURITY_NODES]</h4>
        </div>
        <div className="space-y-2">
          {badges.map((b, idx) => {
            const Icon = b.icon;
            return (
              <div key={idx} className="p-2 border border-cyan-900 bg-[#070d18] flex items-center space-x-2.5">
                <div className="w-6 h-6 border border-cyan-400 text-cyan-300 flex items-center justify-center flex-shrink-0 text-xs">
                  <Icon className="w-3 h-3" />
                </div>
                <div>
                  <h5 className="text-[11px] font-bold text-cyan-200">{b.title}</h5>
                  <p className="text-[10px] text-cyan-500">{b.sub}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Standard horizontal
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {badges.map((b, idx) => {
        const Icon = b.icon;
        return (
          <div key={idx} className={`rounded-2xl p-3.5 flex items-center space-x-3 transition-all ${themeStyles.trustCardBg}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${themeStyles.trustIconBg}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h4 className={`text-xs font-bold leading-tight ${themeStyles.trustTitle}`}>{b.title}</h4>
              <p className={`text-[11px] ${themeStyles.trustSubtitle}`}>{b.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const CategorySelector: React.FC<{
  props: StoreLayoutProps;
  variant?: 'pills' | 'vertical-atelier' | 'story-chips' | 'brutalist-stickers' | 'cyber-protocols' | 'minimal-centered';
}> = ({ props, variant = 'pills' }) => {
  const { categories, categoryCounts, selectedCategory, setSelectedCategory, products, themeStyles } = props;

  if (variant === 'vertical-atelier') {
    return (
      <>
        {/* Mobile Horizontal Selector (Touch Pills) */}
        <div className="lg:hidden flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none w-full -mx-1 px-1">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex-shrink-0 ${selectedCategory === 'all'
              ? 'bg-amber-500 text-zinc-950 font-black shadow-xs'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-amber-300'
              }`}
          >
            Todas ({products.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex-shrink-0 flex items-center space-x-1 ${selectedCategory === cat
                ? 'bg-amber-500 text-zinc-950 font-black shadow-xs'
                : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-amber-300'
                }`}
            >
              <span>{cat}</span>
              <span className="text-[10px] opacity-70">({categoryCounts[cat] || 0})</span>
            </button>
          ))}
        </div>

        {/* Desktop PC Modern Dropdown List */}
        <div className="hidden lg:block bg-zinc-900 border border-amber-500/30 rounded-2xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-black text-zinc-100 tracking-wider uppercase">Colecciones</h3>
            </div>
            <span className="text-[10px] text-amber-400 font-mono font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              {categories.length} categorías
            </span>
          </div>
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full appearance-none bg-zinc-950 border border-zinc-800 hover:border-amber-500/50 text-zinc-100 text-xs font-bold rounded-xl pl-9 pr-8 py-2.5 focus:outline-none focus:border-amber-500 transition cursor-pointer shadow-xs"
              title="Seleccionar categoría"
            >
              <option value="all">Todas las Piezas ({products.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat} ({categoryCounts[cat] || 0})
                </option>
              ))}
            </select>
            <Filter className="w-4 h-4 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </>
    );
  }

  if (variant === 'brutalist-stickers') {
    return (
      <>
        {/* Mobile Horizontal Stickers */}
        <div className="lg:hidden flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none w-full -mx-1 px-1">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 border-2 border-black text-xs font-black uppercase whitespace-nowrap transition cursor-pointer flex-shrink-0 ${selectedCategory === 'all'
              ? 'bg-black text-yellow-300 shadow-[2px_2px_0px_#000]'
              : 'bg-white text-black hover:bg-emerald-200'
              }`}
          >
            TODO ({products.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 border-2 border-black text-xs font-black uppercase whitespace-nowrap transition cursor-pointer flex-shrink-0 flex items-center space-x-1 ${selectedCategory === cat
                ? 'bg-black text-yellow-300 shadow-[2px_2px_0px_#000]'
                : 'bg-white text-black hover:bg-emerald-200'
                }`}
            >
              <span>{cat}</span>
              <span className="text-[10px] bg-amber-100 px-1 text-black border border-black font-bold">
                {categoryCounts[cat] || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Desktop PC Modern Dropdown List */}
        <div className="hidden lg:block p-4 border-3 border-black bg-yellow-300 shadow-[4px_4px_0px_#000] space-y-3">
          <div className="flex items-center justify-between border-b-2 border-black pb-2">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-black" />
              <h3 className="text-xs font-black text-black uppercase">🏷️ CATEGORÍAS POP</h3>
            </div>
            <span className="text-[10px] font-black bg-white text-black px-1.5 py-0.5 border border-black">
              {categories.length} CATS
            </span>
          </div>
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full appearance-none bg-white text-black font-black uppercase text-xs border-2 border-black rounded-none pl-9 pr-8 py-2.5 shadow-[2px_2px_0px_#000] focus:bg-yellow-100 focus:outline-none cursor-pointer transition"
              title="Seleccionar categoría"
            >
              <option value="all">TODAS LAS CATEGORÍAS ({products.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.toUpperCase()} ({categoryCounts[cat] || 0})
                </option>
              ))}
            </select>
            <Tag className="w-4 h-4 text-black absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <ChevronDown className="w-4 h-4 text-black absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </>
    );
  }

  if (variant === 'cyber-protocols') {
    return (
      <>
        {/* Mobile Horizontal Matrix */}
        <div className="lg:hidden flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none w-full font-mono -mx-1 px-1">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1.5 text-xs whitespace-nowrap border transition cursor-pointer flex-shrink-0 ${selectedCategory === 'all'
              ? 'bg-cyan-500 text-black font-black border-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.6)]'
              : 'border-cyan-900 bg-[#0b1528] text-cyan-400'
              }`}
          >
            &gt; ALL ({products.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1.5 text-xs whitespace-nowrap border transition cursor-pointer flex-shrink-0 flex items-center space-x-1 ${selectedCategory === cat
                ? 'bg-cyan-500 text-black font-black border-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.6)]'
                : 'border-cyan-900 bg-[#0b1528] text-cyan-400'
                }`}
            >
              <span>&gt; {cat}</span>
              <span className="text-[10px] opacity-70">[{categoryCounts[cat] || 0}]</span>
            </button>
          ))}
        </div>

        {/* Desktop PC Modern Dropdown List */}
        <div className="hidden lg:block p-4 border border-cyan-500/60 bg-[#0b1528] shadow-[0_0_12px_rgba(6,182,212,0.2)] space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-cyan-900 pb-2">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold text-cyan-300 uppercase">[PROTOCOLS_MATRIX]</h3>
            </div>
            <span className="text-[10px] text-cyan-400 bg-cyan-950 px-1.5 py-0.5 border border-cyan-800">
              {categories.length} CATS
            </span>
          </div>
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full appearance-none bg-[#070d18] text-cyan-300 font-mono text-xs border border-cyan-500 rounded-none pl-9 pr-8 py-2.5 focus:outline-none focus:border-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.4)] cursor-pointer"
              title="Seleccionar protocolo / categoría"
            >
              <option value="all">&gt; ALL_ITEMS ({products.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  &gt; {cat.toUpperCase()} [{categoryCounts[cat] || 0}]
                </option>
              ))}
            </select>
            <Tag className="w-4 h-4 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <ChevronDown className="w-4 h-4 text-cyan-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </>
    );
  }

  if (variant === 'story-chips') {
    return (
      <>
        {/* Mobile Horizontal Story Chips */}
        <div className="md:hidden flex items-center space-x-1.5 sm:space-x-2 overflow-x-auto pb-1 sm:pb-2 scrollbar-none w-full -mx-1 px-1">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center space-x-1.5 flex-shrink-0 ${selectedCategory === 'all'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25'
              : 'bg-white border border-teal-200 text-slate-700 hover:bg-teal-50'
              }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Todos ({products.length})</span>
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center space-x-1.5 flex-shrink-0 ${selectedCategory === cat
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25'
                : 'bg-white border border-teal-200 text-slate-700 hover:bg-teal-50'
                }`}
            >
              <span>{cat}</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/10">
                {categoryCounts[cat] || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Desktop PC Modern Dropdown List */}
        <div className="hidden md:flex bg-white border border-teal-200/90 rounded-2xl p-3 sm:p-4 shadow-xs flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-teal-800 flex-shrink-0">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-black uppercase tracking-wide">Categoría Destacada:</span>
          </div>
          <div className="relative flex-1 max-w-md">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full appearance-none bg-teal-50/60 hover:bg-teal-50 border border-teal-300 text-slate-900 text-xs font-bold rounded-xl pl-9 pr-8 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-2xs transition"
              title="Filtrar por categoría"
            >
              <option value="all">Todas las Categorías ({products.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat} ({categoryCounts[cat] || 0})
                </option>
              ))}
            </select>
            <Filter className="w-4 h-4 text-teal-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </>
    );
  }

  if (variant === 'minimal-centered') {
    return (
      <>
        {/* Mobile Centered Pills */}
        <div className="sm:hidden flex items-center justify-start space-x-1.5 overflow-x-auto pb-1 scrollbar-none flex-nowrap w-full -mx-1 px-1">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer whitespace-nowrap flex-shrink-0 ${selectedCategory === 'all'
              ? 'bg-stone-900 text-stone-50 shadow-xs'
              : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
          >
            Todos ({products.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer whitespace-nowrap flex-shrink-0 ${selectedCategory === cat
                ? 'bg-stone-900 text-stone-50 shadow-xs'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
            >
              {cat} ({categoryCounts[cat] || 0})
            </button>
          ))}
        </div>

        {/* Desktop PC Modern Dropdown List */}
        <div className="hidden sm:block max-w-md mx-auto w-full relative">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full appearance-none bg-white border border-stone-300 hover:border-stone-400 text-stone-900 text-xs font-medium rounded-full pl-9 pr-8 py-2 shadow-2xs focus:outline-none focus:ring-1 focus:ring-stone-400 cursor-pointer transition text-center"
            title="Filtrar por categoría"
          >
            <option value="all">Todas las Categorías ({products.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat} ({categoryCounts[cat] || 0})
              </option>
            ))}
          </select>
          <Filter className="w-3.5 h-3.5 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <ChevronDown className="w-3.5 h-3.5 text-stone-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </>
    );
  }

  // Standard Pills (Mobile pills + Desktop PC Modern Dropdown List)
  return (
    <>
      {/* Mobile Touch Pills */}
      <div className="md:hidden flex items-center space-x-1.5 overflow-x-auto w-full pb-1 scrollbar-none -mx-1 px-1">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs whitespace-nowrap transition cursor-pointer flex-shrink-0 ${selectedCategory === 'all' ? themeStyles.pillActive : themeStyles.pillInactive
            }`}
        >
          Todos ({products.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs whitespace-nowrap transition cursor-pointer flex-shrink-0 ${selectedCategory === cat ? themeStyles.pillActive : themeStyles.pillInactive
              }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Desktop PC Modern Dropdown List */}
      <div className="hidden md:block relative w-full max-w-xs sm:max-w-sm">
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full appearance-none bg-white border border-slate-300 hover:border-amber-500 text-slate-900 text-xs font-bold rounded-xl pl-9 pr-8 py-2 transition cursor-pointer shadow-2xs focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/20"
          title="Filtrar por categoría"
        >
          <option value="all">Todas las Categorías ({products.length})</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat} ({categoryCounts[cat] || 0})
            </option>
          ))}
        </select>
        <Tag className="w-3.5 h-3.5 text-amber-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </>
  );
};

export const ProductCardItem: React.FC<{
  item: InventoryItem;
  props: StoreLayoutProps;
}> = ({ item, props }) => {
  const {
    activeTheme,
    themeStyles,
    currency,
    isCustomerView,
    cart,
    onAddToCart,
    onUpdateCartQty,
    onDirectBuyProduct,
    onShareProductWhatsApp,
    onCopyProductLink,
    onQuickViewProduct,
    storeConfig,
  } = props;

  const photos = getProductPhotos(item);
  const inCart = cart.find((ci) => ci.item.id === item.id);

  const discountPercent = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
  const hasDiscount = discountPercent > 0;
  const regularPrice = Number(item.salePrice) || 0;
  const effectivePrice = hasDiscount ? regularPrice * (1 - discountPercent / 100) : regularPrice;

  return (
    <div
      id={`product-card-${item.id}`}
      className={`rounded-2xl overflow-hidden flex flex-col transition-all duration-300 group relative border bg-white border-slate-200/90 hover:border-amber-400 hover:shadow-xl hover:-translate-y-1 ${hasDiscount ? 'ring-1 ring-rose-500/30 shadow-md shadow-rose-500/5' : 'shadow-xs'
        }`}
    >
      {/* Top Image Preview */}
      <div
        onClick={() => onQuickViewProduct(item)}
        className={`aspect-square relative overflow-hidden cursor-pointer transition glossy-sheen-effect ${themeStyles.productImageBg}`}
      >
        <ProductMediaDisplay
          imageUrl={photos[0] || item.imageUrl}
          candidateImages={photos}
          videoUrl={item.videoUrl}
          name={item.name}
          className="w-full h-full relative glossy-sheen-effect"
          imageClassName="w-full h-full object-cover group-hover:scale-105 mobile-auto-zoom transition-transform duration-300"
          videoClassName="w-full h-full object-cover group-hover:scale-105 mobile-auto-zoom transition-transform duration-300"
          autoPlayVideo={true}
          showPlayBadge={false}
          placeholderText="Sin imagen"
          fallbackIcon="image"
        />

        {/* Offer & Category overlay pill */}
        <div className="absolute top-1.5 sm:top-2.5 left-1.5 sm:left-2.5 flex flex-col gap-1 z-10 max-w-[70%]">
          {hasDiscount && (
            <span className="px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-[#FFD000] text-slate-950 shadow-md border border-amber-300 flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-slate-950 fill-slate-950" />
              <span>-{discountPercent}% OFF</span>
            </span>
          )}
          <span className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold backdrop-blur-sm shadow-xs border truncate max-w-[120px] ${themeStyles.productCategoryBadge}`}>
            {item.category || 'General'}
          </span>
        </div>

        {item.videoUrl && (
          <div className="absolute bottom-1.5 sm:bottom-2.5 left-1.5 sm:left-2.5 px-2 py-0.5 rounded-lg text-[9px] sm:text-[10px] font-black flex items-center space-x-1 shadow-md bg-slate-950/90 text-sky-300 border border-sky-400/40 backdrop-blur-xs z-10 animate-pulse">
            <Play className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-sky-400 fill-current" />
            <span>Video HD</span>
          </div>
        )}

        {photos.length > 1 && (
          <div className="absolute bottom-1.5 sm:bottom-2.5 right-1.5 sm:right-2.5 px-1.5 sm:px-2 py-0.5 rounded-lg text-[9px] sm:text-[10px] font-bold flex items-center space-x-1 shadow-xs bg-slate-900/80 text-white backdrop-blur-xs">
            <ImageIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            <span>+{photos.length} fotos</span>
          </div>
        )}

        {/* Quick WhatsApp Share action */}
        <div className="absolute top-1.5 sm:top-2.5 right-1.5 sm:right-2.5 flex items-center gap-1 z-20">
          <button
            type="button"
            onClick={(e) => onShareProductWhatsApp(item, e)}
            className="p-1 sm:p-1.5 rounded-xl bg-white/95 hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 border border-slate-200/90 shadow-xs backdrop-blur-xs transition cursor-pointer active:scale-95"
            title="Compartir por WhatsApp"
          >
            <MessageCircle className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-white text-slate-900 font-bold text-[11px] sm:text-xs shadow-lg flex items-center space-x-1.5">
            {item.videoUrl ? (
              <>
                <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-sky-600 fill-current" />
                <span>Ver Video y Ficha</span>
              </>
            ) : (
              <>
                <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-sky-600" />
                <span>Ver Detalles</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-2.5 sm:p-4 flex-1 flex flex-col justify-between space-y-2 sm:space-y-3">
        <div>
          <div className={`flex items-center justify-between text-[10px] sm:text-[11px] mb-1 font-mono ${themeStyles.productCategory}`}>
            <span>SKU: {item.sku}</span>
            <span className="truncate max-w-[90px] sm:max-w-[120px] font-sans font-medium">{item.category || 'Producto'}</span>
          </div>

          <h3
            onClick={() => onQuickViewProduct(item)}
            className={`text-xs sm:text-sm font-bold line-clamp-2 transition cursor-pointer leading-snug hover:text-amber-600 ${themeStyles.productTitle}`}
          >
            {item.name}
          </h3>

          {/* Amazon / AliExpress Social Proof & Ratings */}
          <div className="flex items-center space-x-1.5 mt-1 flex-wrap gap-y-0.5">
            <div className="flex items-center text-amber-400">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span className="text-[10px] font-black text-slate-800 ml-0.5">
                {(4.7 + (item.id % 4) * 0.1).toFixed(1)}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">
              (+{((item.id * 13) % 150) + 30} vendidos)
            </span>
          </div>

          {item.description && (
            <p className={`text-[11px] sm:text-xs line-clamp-2 mt-1 leading-relaxed ${themeStyles.productDescription}`}>
              {item.description}
            </p>
          )}

        </div>

        <div className={`pt-2 sm:pt-3 border-t space-y-2 sm:space-y-2.5 ${activeTheme === 'boutique' ? 'border-zinc-800' : 'border-slate-100'}`}>
          <div className="flex items-baseline justify-between">
            <span className={`text-[10px] sm:text-xs font-semibold ${themeStyles.productDescription}`}>
              {hasDiscount ? 'Oferta Especial:' : 'Precio:'}
            </span>
            {hasDiscount ? (
              <div className="text-right">
                <div className="flex items-center justify-end space-x-1 sm:space-x-1.5">
                  <span className="text-[10px] sm:text-xs line-through text-slate-400 font-semibold">
                    ${regularPrice.toFixed(2)}
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-black px-1 sm:px-1.5 py-0.2 rounded bg-rose-600 text-white shadow-2xs">
                    -{discountPercent}%
                  </span>
                </div>
                <div className="flex items-baseline justify-end">
                  <span className="text-base sm:text-lg font-black text-rose-600">
                    ${effectivePrice.toFixed(2)}
                  </span>
                  <span className={`text-[9px] sm:text-[10px] ml-1 font-bold ${themeStyles.productDescription}`}>
                    {currency}
                  </span>
                </div>
                <span className="text-[9px] font-bold text-emerald-600 block">
                  Ahorras ${(regularPrice - effectivePrice).toFixed(2)}
                </span>
              </div>
            ) : (
              <div className="text-right">
                <span className={`text-base sm:text-lg font-black text-slate-900 ${themeStyles.productPrice}`}>
                  ${regularPrice.toFixed(2)}
                </span>
                <span className={`text-[9px] sm:text-[10px] ml-1 font-bold ${themeStyles.productDescription}`}>
                  {currency}
                </span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div>
            {isCustomerView ? (
              <div className="space-y-1 sm:space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  {inCart ? (
                    <div className={`flex items-center justify-between rounded-xl px-1.5 py-1 border ${activeTheme === 'boutique' ? 'bg-zinc-800 border-amber-500/50 text-zinc-100' : 'bg-amber-50 border-amber-400 text-slate-900'
                      }`}>
                      <button
                        type="button"
                        onClick={() => onUpdateCartQty(item.id, inCart.quantity - 1)}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition cursor-pointer shadow-xs active:scale-95 ${activeTheme === 'boutique' ? 'bg-zinc-900 text-amber-300 hover:bg-zinc-700' : 'bg-white hover:bg-amber-100 text-slate-900'
                          }`}
                        title="Reducir una unidad"
                      >
                        <Minus className="w-3 h-3 stroke-[2.5]" />
                      </button>
                      <span className="text-xs font-black font-mono px-1 text-slate-900">
                        {inCart.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateCartQty(item.id, inCart.quantity + 1)}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition cursor-pointer shadow-xs active:scale-95 ${activeTheme === 'boutique' ? 'bg-zinc-900 text-amber-300 hover:bg-zinc-700' : 'bg-white hover:bg-amber-100 text-slate-900'
                          }`}
                        title="Aumentar una unidad"
                      >
                        <Plus className="w-3 h-3 stroke-[2.5]" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAddToCart(item, 1)}
                      className="min-h-[38px] py-2 px-2.5 rounded-xl bg-[#FFD000] hover:bg-[#E6B800] text-slate-950 font-black text-xs shadow-xs transition flex items-center justify-center space-x-1 cursor-pointer active:scale-95 border border-amber-300/80"
                      title="Agregar al carrito"
                    >
                      <ShoppingCart className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="font-black">Agregar</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => onDirectBuyProduct(item, e)}
                    className="min-h-[38px] py-2 px-2.5 rounded-xl transition flex items-center justify-center space-x-1 font-black text-xs cursor-pointer shadow-xs active:scale-95 bg-emerald-600 hover:bg-emerald-700 text-white"
                    title="Comprar directo por WhatsApp"
                  >
                    <MessageCircle className="w-3.5 h-3.5 flex-shrink-0 fill-current" />
                    <span className="font-black">Comprar</span>
                  </button>
                </div>

                {/* Secondary Action: Compartir por WhatsApp (Clean neutral style) */}
                <button
                  type="button"
                  onClick={(e) => onShareProductWhatsApp(item, e)}
                  className={`w-full min-h-[34px] py-1.5 px-3 rounded-xl border font-bold text-xs transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-2xs active:scale-95 ${activeTheme === 'boutique' ? 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 border-zinc-700/80' : 'bg-slate-100 hover:bg-slate-200/90 text-slate-800 border-slate-200/90'
                    }`}
                  title="Compartir por WhatsApp"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  <span className="font-bold text-xs">Compartir Producto</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  onClick={() => onQuickViewProduct(item)}
                  className={`min-h-[36px] py-1.5 sm:py-2 px-2 rounded-xl border font-semibold text-xs transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs ${activeTheme === 'boutique' ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                >
                  <Eye className="w-3.5 h-3.5 text-sky-500" />
                  <span className="truncate">Ver Detalle</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => onShareProductWhatsApp(item, e)}
                  className={`min-h-[36px] py-1.5 sm:py-2 px-2 rounded-xl border font-semibold text-xs transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs ${activeTheme === 'boutique' ? 'bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border-zinc-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                    }`}
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="truncate">WhatsApp</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const CouriersShowcase: React.FC<{
  props: StoreLayoutProps;
  variant?: 'standard' | 'compact-sidebar' | 'bento-box' | 'brutalist-block' | 'cyber-node' | 'minimal-pill';
}> = ({ props, variant = 'standard' }) => {
  const { courierPartners, activeTheme, themeStyles } = props;
  const activeCouriers = courierPartners.filter((c) => c.active);
  if (activeCouriers.length === 0) return null;

  if (variant === 'compact-sidebar') {
    return (
      <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-4 space-y-3 shadow-sm">
        <div className="flex items-center space-x-2 border-b border-zinc-800 pb-2">
          <Truck className="w-4 h-4 text-amber-400" />
          <h4 className="text-xs font-black text-zinc-100 uppercase tracking-wide">Logística Exclusiva</h4>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {activeCouriers.map((c, i) => (
            <div key={c.id || i} className="p-2 rounded-xl bg-zinc-950/70 border border-zinc-800 flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-700 p-0.5 flex items-center justify-center flex-shrink-0">
                {c.logoUrl ? <img src={c.logoUrl} alt={c.name} className="w-full h-full object-contain" /> : <Truck className="w-3 h-3 text-zinc-400" />}
              </div>
              <span className="text-[10px] font-bold text-zinc-200 truncate">{c.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'brutalist-block') {
    return (
      <div className="p-4 border-3 border-black bg-white shadow-[4px_4px_0px_#000] space-y-3">
        <div className="flex items-center space-x-2 border-b-2 border-black pb-2">
          <Truck className="w-4 h-4 text-black" />
          <h4 className="text-xs font-black text-black uppercase">🚚 ENVIADORES OFICIALES</h4>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {activeCouriers.map((c, i) => (
            <div key={c.id || i} className="p-2 border-2 border-black bg-emerald-100 shadow-[2px_2px_0px_#000] flex items-center space-x-2">
              <div className="w-7 h-7 border border-black bg-white p-0.5 flex items-center justify-center flex-shrink-0">
                {c.logoUrl ? <img src={c.logoUrl} alt={c.name} className="w-full h-full object-contain" /> : <Truck className="w-3 h-3" />}
              </div>
              <span className="text-[10px] font-black text-black truncate">{c.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'cyber-node') {
    return (
      <div className="p-4 border border-cyan-500/60 bg-[#0b1528] shadow-[0_0_12px_rgba(6,182,212,0.2)] space-y-3 font-mono">
        <div className="flex items-center space-x-2 border-b border-cyan-900 pb-2">
          <Truck className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-bold text-cyan-300 uppercase">[LOGISTICS_RELAY]</h4>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {activeCouriers.map((c, i) => (
            <div key={c.id || i} className="p-1.5 border border-cyan-900 bg-[#070d18] flex items-center space-x-2">
              <div className="w-6 h-6 border border-cyan-700 bg-[#0b1528] p-0.5 flex items-center justify-center flex-shrink-0">
                {c.logoUrl ? <img src={c.logoUrl} alt={c.name} className="w-full h-full object-contain" /> : <Truck className="w-3 h-3 text-cyan-400" />}
              </div>
              <span className="text-[10px] text-cyan-300 truncate">{c.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-3xl p-6 sm:p-7 border shadow-sm space-y-4 ${themeStyles.cardBg}`}>
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 ${activeTheme === 'boutique' ? 'border-zinc-800' : 'border-slate-100'}`}>
        <div className="flex items-center space-x-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-xs ${activeTheme === 'boutique' ? 'bg-zinc-800 text-amber-400 border-zinc-700' : 'bg-sky-50 text-sky-700 border-sky-100'
            }`}>
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <h3 className={`text-sm font-black tracking-tight ${themeStyles.productTitle}`}>
              Empresas de Entrega y Envíos Seguros
            </h3>
            <p className={`text-xs ${themeStyles.productDescription}`}>
              Despachos a domicilio y agencias a nivel nacional con seguimiento
            </p>
          </div>
        </div>

        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 self-start sm:self-auto">
          <BadgeCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
          Envíos 100% Garantizados
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
        {activeCouriers.map((courier, i) => (
          <div
            key={courier.id || i}
            className={`rounded-2xl p-3.5 flex flex-col items-center justify-center text-center transition group shadow-xs border ${activeTheme === 'boutique' ? 'bg-zinc-800/80 hover:bg-zinc-800 border-zinc-700' : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200/80'
              }`}
          >
            <div className={`w-16 h-12 rounded-xl border p-1 flex items-center justify-center mb-2 overflow-hidden shadow-2xs group-hover:scale-105 transition-transform ${activeTheme === 'boutique' ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-slate-200/80'
              }`}>
              {courier.logoUrl ? (
                <img src={courier.logoUrl} alt={courier.name} className="w-full h-full object-contain" />
              ) : (
                <Truck className="w-6 h-6 opacity-40" />
              )}
            </div>
            <span className={`text-xs font-bold line-clamp-1 ${themeStyles.productTitle}`}>
              {courier.name}
            </span>
            <span className={`text-[10px] mt-0.5 font-medium ${themeStyles.productDescription}`}>
              Entrega Confiable
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const PaymentShowcase: React.FC<{
  props: StoreLayoutProps;
  variant?: 'standard' | 'compact-sidebar' | 'bento-box' | 'brutalist-block' | 'cyber-node' | 'minimal-pill';
}> = ({ props, variant = 'standard' }) => {
  const { paymentPartners, activeTheme, themeStyles } = props;
  const activePayments = paymentPartners.filter((p) => p.active);
  if (activePayments.length === 0) return null;

  if (variant === 'compact-sidebar') {
    return (
      <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-4 space-y-3 shadow-sm">
        <div className="flex items-center space-x-2 border-b border-zinc-800 pb-2">
          <CreditCard className="w-4 h-4 text-amber-400" />
          <h4 className="text-xs font-black text-zinc-100 uppercase tracking-wide">Métodos Certificados</h4>
        </div>
        <div className="space-y-2">
          {activePayments.map((p, i) => (
            <div key={p.id || i} className="p-2 rounded-xl bg-zinc-950/70 border border-zinc-800 flex items-center space-x-2.5">
              <div className="w-8 h-7 rounded-lg bg-zinc-900 border border-zinc-700 p-0.5 flex items-center justify-center flex-shrink-0">
                {p.logoUrl ? <img src={p.logoUrl} alt={p.name} className="w-full h-full object-contain" /> : <CreditCard className="w-3.5 h-3.5 text-zinc-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-bold text-zinc-200 block truncate">{p.name}</span>
                <span className="text-[9px] text-zinc-400 block truncate">{p.details || 'Pago directo'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'brutalist-block') {
    return (
      <div className="p-4 border-3 border-black bg-white shadow-[4px_4px_0px_#000] space-y-3">
        <div className="flex items-center space-x-2 border-b-2 border-black pb-2">
          <CreditCard className="w-4 h-4 text-black" />
          <h4 className="text-xs font-black text-black uppercase">💳 FORMAS DE PAGO</h4>
        </div>
        <div className="space-y-2">
          {activePayments.map((p, i) => (
            <div key={p.id || i} className="p-2 border-2 border-black bg-pink-100 shadow-[2px_2px_0px_#000] flex items-center space-x-2.5">
              <div className="w-8 h-7 border border-black bg-white p-0.5 flex items-center justify-center flex-shrink-0">
                {p.logoUrl ? <img src={p.logoUrl} alt={p.name} className="w-full h-full object-contain" /> : <CreditCard className="w-3.5 h-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-black text-black block truncate">{p.name}</span>
                <span className="text-[9px] font-bold text-slate-800 block truncate">{p.details || 'Transferencia o Efectivo'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'cyber-node') {
    return (
      <div className="p-4 border border-cyan-500/60 bg-[#0b1528] shadow-[0_0_12px_rgba(6,182,212,0.2)] space-y-3 font-mono">
        <div className="flex items-center space-x-2 border-b border-cyan-900 pb-2">
          <CreditCard className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-bold text-cyan-300 uppercase">[PAYMENT_GATEWAYS]</h4>
        </div>
        <div className="space-y-2">
          {activePayments.map((p, i) => (
            <div key={p.id || i} className="p-1.5 border border-cyan-900 bg-[#070d18] flex items-center space-x-2">
              <div className="w-7 h-6 border border-cyan-700 bg-[#0b1528] p-0.5 flex items-center justify-center flex-shrink-0">
                {p.logoUrl ? <img src={p.logoUrl} alt={p.name} className="w-full h-full object-contain" /> : <CreditCard className="w-3 h-3 text-cyan-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] text-cyan-300 block truncate">{p.name}</span>
                <span className="text-[8px] text-cyan-600 block truncate">{p.details || 'DIRECT_PAY'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-3xl p-6 sm:p-7 border shadow-sm space-y-4 ${themeStyles.cardBg}`}>
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 ${activeTheme === 'boutique' ? 'border-zinc-800' : 'border-slate-100'}`}>
        <div className="flex items-center space-x-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-xs ${activeTheme === 'boutique' ? 'bg-zinc-800 text-emerald-400 border-zinc-700' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
            }`}>
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <h3 className={`text-sm font-black tracking-tight ${themeStyles.productTitle}`}>
              Formas de Pago y Cuentas Oficiales
            </h3>
            <p className={`text-xs ${themeStyles.productDescription}`}>
              Transferencias directas, pagos móviles QR, tarjetas o efectivo contraentrega
            </p>
          </div>
        </div>

        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200 self-start sm:self-auto">
          <ShieldCheck className="w-3.5 h-3.5 mr-1 text-sky-600" />
          Compra 100% Segura
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {activePayments.map((payment, i) => (
          <div
            key={payment.id || i}
            className={`rounded-2xl p-3.5 flex items-center space-x-3.5 transition shadow-xs border ${activeTheme === 'boutique' ? 'bg-zinc-800/80 hover:bg-zinc-800 border-zinc-700' : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200/80'
              }`}
          >
            <div className={`w-14 h-12 rounded-xl border p-1 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-2xs ${activeTheme === 'boutique' ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-slate-200/80'
              }`}>
              {payment.logoUrl ? (
                <img src={payment.logoUrl} alt={payment.name} className="w-full h-full object-contain" />
              ) : (
                <CreditCard className="w-6 h-6 opacity-40" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h4 className={`text-xs font-bold truncate ${themeStyles.productTitle}`}>
                {payment.name}
              </h4>
              <p className={`text-[11px] line-clamp-1 mt-0.5 ${themeStyles.productDescription}`}>
                {payment.details || 'Aceptado para compras online y directas'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const StoreFooter: React.FC<{
  props: StoreLayoutProps;
  variant?: 'standard' | 'boutique' | 'fresh' | 'brutalist' | 'cyber' | 'minimal';
}> = ({ props }) => {
  const { storeConfig, paymentPartners, isLogoAnimating, onLogoClick } = props;

  const rawPayments = paymentPartners && paymentPartners.length > 0 ? paymentPartners : DEFAULT_FALLBACK_PAYMENTS;
  const activePayments = rawPayments.filter((p) => p.active !== false);

  return (
    <footer className="bg-[#1C1C1C] text-zinc-300 rounded-3xl p-6 sm:p-10 border border-zinc-800 shadow-2xl space-y-8 my-8">
      {/* Top 3 Store Information Sections (Without Links) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 border-b border-zinc-800 pb-8">
        {/* Col 1: Store Brand & Identity */}
        <div className="space-y-3.5">
          <div className="flex items-center space-x-3">
            <div
              id="store-footer-logo"
              onClick={onLogoClick}
              className={`cursor-pointer select-none transition-all duration-300 ${isLogoAnimating ? 'animate-store-logo-bounce' : 'hover:scale-105 active:scale-95'}`}
            >
              {storeConfig.logoUrl ? (
                <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-amber-500/40 p-1 flex items-center justify-center overflow-hidden shadow-xs">
                  <img src={storeConfig.logoUrl} alt={storeConfig.storeName} className="w-full h-full object-contain" />
                </div>
              ) : storeConfig.logoDesktopUrl ? (
                <div className="h-12 max-w-[180px] rounded-xl bg-zinc-900 border border-amber-500/40 px-2 py-1 flex items-center justify-center overflow-hidden shadow-xs">
                  <img src={storeConfig.logoDesktopUrl} alt={storeConfig.storeName} className="h-full w-auto object-contain" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-xl bg-[#FFD000] text-slate-950 flex items-center justify-center font-black shadow-md border border-amber-300">
                  <Store className="w-6 h-6" />
                </div>
              )}
            </div>
            <div>
              <h3 className="text-lg font-black text-white tracking-tight">
                {storeConfig.storeName || 'Tienda Oficial'}
              </h3>
              <p className="text-[11px] text-[#FFD000] font-mono font-bold uppercase tracking-widest">
                Tienda Online Oficial
              </p>
            </div>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
            {storeConfig.description ||
              'Catálogo digital con envíos y pedidos directos por WhatsApp. Compras fáciles, rápidas y 100% seguras.'}
          </p>

          <div className="flex items-center space-x-2 pt-1">
            {storeConfig.whatsappNumber && (
              <a
                href={buildWhatsAppLink(storeConfig.whatsappNumber)}
                target="_blank"
                rel="noreferrer"
                className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition cursor-pointer"
                title="WhatsApp Directo"
              >
                <MessageCircle className="w-4 h-4" />
              </a>
            )}
            {props.onOpenShareModal && (
              <button
                type="button"
                onClick={props.onOpenShareModal}
                className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center justify-center hover:bg-[#FFD000] hover:text-slate-950 transition cursor-pointer"
                title="Compartir tienda"
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Col 2: Información de Envíos y Cobertura */}
        <div className="space-y-3">
          <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Truck className="w-4 h-4 text-[#FFD000]" />
            <span>Información de Envíos</span>
          </h4>
          <ul className="space-y-2 text-xs text-zinc-400 leading-relaxed">
            <li>• Envíos rápidos y seguros a nivel nacional.</li>
            <li>• Despacho inmediato y número de guía para seguimiento.</li>
            <li>• Embalaje de alta protección garantizado en cada producto.</li>
            <li>• Entregas a domicilio y retiro en punto de atención.</li>
          </ul>
        </div>

        {/* Col 3: Compra Segura y Garantía */}
        <div className="space-y-3">
          <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#FFD000]" />
            <span>Garantía y Atención</span>
          </h4>
          <ul className="space-y-2 text-xs text-zinc-400 leading-relaxed">
            <li>• Productos 100% verificados y calidad comprobada.</li>
            <li>• Atención al cliente y asesoría personalizada directa.</li>
            <li>• Múltiples medios de pago: transferencias, depósitos y tarjetas.</li>
            <li>• Confirmación inmediata de pedido vía WhatsApp.</li>
          </ul>
        </div>
      </div>

      {/* Bottom Payment Badges with Icons & Copyright */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs text-zinc-500">
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          <span className="font-bold text-zinc-400 mr-1 text-[11px]">Métodos de pago aceptados:</span>
          {activePayments.map((pm, idx) => (
            <div
              key={pm.id || idx}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700/80 text-[10px] font-bold text-zinc-200 flex items-center space-x-2 shadow-2xs hover:border-amber-400/50 transition"
              title={pm.details || pm.name}
            >
              {pm.logoUrl ? (
                <div className="w-5 h-5 rounded bg-white/10 p-0.5 flex items-center justify-center overflow-hidden flex-shrink-0">
                  <img src={pm.logoUrl} alt={pm.name} className="w-full h-full object-contain" />
                </div>
              ) : (
                <CreditCard className="w-4 h-4 text-[#FFD000] flex-shrink-0" />
              )}
              <span className="truncate max-w-[130px]">{pm.name}</span>
            </div>
          ))}
        </div>

        <p className="text-[11px] font-medium text-zinc-400">
          © 2026 {storeConfig.storeName || 'Lotengoo.com'} - Tu tienda online. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
};

// ----------------------------------------------------
// 2. THE 6 THEME-SPECIFIC STORE LAYOUTS
// ----------------------------------------------------

/**
 * 1. AMAZON & ALIEXPRESS MARKETPLACE THEME LAYOUT:
 * Modern e-commerce layout inspired by Amazon & AliExpress:
 * - Persistent sticky top navigation bar with integrated category selector and prominent search console that stays pinned during scroll.
 * - Department / Category sub-nav ribbon with quick filters (Flash offers, In-Stock, Sorters).
 * - Amazon Prime / AliExpress Choice buyer protection and fast shipping trust pillars.
 * - Social proof product cards with star ratings, stock urgency badges, and high-conversion amber cart buttons.
 */
export const ClassicStoreLayout: React.FC<{ props: StoreLayoutProps }> = ({ props }) => {
  const {
    products,
    filteredProducts,
    categories,
    categoryCounts,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    inStockOnly,
    setInStockOnly,
    showOffersOnly,
    setShowOffersOnly,
    sortBy,
    setSortBy,
    cart,
    cartTotalItems,
    onOpenCart,
    onOpenShareModal,
    storeConfig,
    isCustomerView,
    isCustomerOnly,
    isCustomerMode,
    storeTab,
    setStoreTab,
    orders,
    isLogoAnimating,
    onLogoClick,
    themeStyles,
    currency = 'USD',
  } = props;

  // Calculate real-time cart subtotal
  const cartSubtotal = cart.reduce((sum, ci) => {
    const discount = Math.max(0, Math.min(100, Number(ci.item.discountPercent) || 0));
    const price = discount > 0 ? (Number(ci.item.salePrice) || 0) * (1 - discount / 100) : (Number(ci.item.salePrice) || 0);
    return sum + price * ci.quantity;
  }, 0);

  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const [isMobileFilterOpenState, setIsMobileFilterOpenState] = React.useState(false);
  const isMobileFilterOpen = props.isFilterSheetOpen !== undefined ? props.isFilterSheetOpen : isMobileFilterOpenState;
  const setIsMobileFilterOpen = (open: boolean) => {
    setIsMobileFilterOpenState(open);
    if (props.onToggleFilterSheet) {
      props.onToggleFilterSheet(open);
    }
  };

  const [isScrolled, setIsScrolled] = React.useState(false);

  // Pagination: Configured per storeConfig setting
  const isPaginationEnabled = storeConfig?.enablePagination === true;
  const ITEMS_PER_PAGE = isPaginationEnabled ? (Number(storeConfig?.itemsPerPage) || 12) : Math.max(1, filteredProducts.length);
  const [currentPage, setCurrentPage] = React.useState(1);

  const categoryImagesMap: Record<string, string> = React.useMemo(() => {
    if (!storeConfig?.categoryImages) return {};
    if (typeof storeConfig.categoryImages === 'object') return storeConfig.categoryImages as Record<string, string>;
    try {
      return JSON.parse(storeConfig.categoryImages);
    } catch (e) {
      return {};
    }
  }, [storeConfig?.categoryImages]);

  const getCustomCategoryHeaderConfig = React.useCallback(
    (catName: string): { imageUrl?: string; overlayColor?: string; overlayOpacity?: number } | undefined => {
      if (!catName || !categoryImagesMap) return undefined;
      let raw: any = categoryImagesMap[catName];
      if (!raw) {
        const trimmed = catName.trim();
        raw = categoryImagesMap[trimmed];
        if (!raw) {
          const lower = trimmed.toLowerCase();
          const entry = Object.entries(categoryImagesMap).find(([k]) => k.trim().toLowerCase() === lower);
          if (entry) raw = entry[1];
        }
      }
      if (!raw) return undefined;
      if (typeof raw === 'string') {
        return { imageUrl: raw, overlayColor: '#0f172a', overlayOpacity: 85 };
      }
      if (typeof raw === 'object' && raw !== null) {
        return {
          imageUrl: raw.imageUrl || raw.url || '',
          overlayColor: raw.overlayColor || '#0f172a',
          overlayOpacity: raw.overlayOpacity !== undefined ? Number(raw.overlayOpacity) : 85,
        };
      }
      return undefined;
    },
    [categoryImagesMap]
  );

  // Reset to page 1 and scroll to top whenever filters or search change
  React.useEffect(() => {
    setCurrentPage(1);
    if (searchQuery.trim().length > 0 || selectedCategory !== 'all') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (typeof document !== 'undefined') {
        document.documentElement?.scrollTo({ top: 0, behavior: 'smooth' });
        document.body?.scrollTo({ top: 0, behavior: 'smooth' });
        const anchorEl = document.getElementById('store-products-anchor') || document.getElementById('marketplace-sticky-header');
        if (anchorEl) {
          anchorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }
  }, [searchQuery, selectedCategory, showOffersOnly, inStockOnly, sortBy]);

  const totalPages = isPaginationEnabled ? Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE)) : 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedProducts = isPaginationEnabled ? filteredProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE) : filteredProducts;

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      const anchorEl = document.getElementById('store-products-anchor') || document.getElementById('marketplace-sticky-header');
      if (anchorEl) {
        anchorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const [scrollDirection, setScrollDirection] = React.useState<'top' | 'up' | 'down'>('top');
  const lastScrollYRef = React.useRef(0);

  React.useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      const scrollY =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;

      if (!ticking) {
        window.requestAnimationFrame(() => {
          const lastY = lastScrollYRef.current;
          if (scrollY <= 50) {
            setScrollDirection('top');
            setIsScrolled(false);
          } else if (scrollY > lastY + 6 && scrollY > 75) {
            setScrollDirection('down');
            setIsScrolled(true);
          } else if (scrollY < lastY - 6) {
            setScrollDirection('up');
            setIsScrolled(true);
          }
          lastScrollYRef.current = scrollY;

          setIsScrolled((prev) => {
            if (!prev && scrollY > 90) {
              return true;
            } else if (prev && scrollY < 25) {
              return false;
            }
            return prev;
          });
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const activeFilterCount =
    (selectedCategory !== 'all' ? 1 : 0) +
    (showOffersOnly ? 1 : 0) +
    (inStockOnly ? 1 : 0) +
    (sortBy !== 'featured' ? 1 : 0) +
    (searchQuery.trim().length > 0 ? 1 : 0);

  return (
    <div className="space-y-4 pb-12">
      {/* ========================================================================= */}
      {/* 1. LOTENGOO PURE WHITE STICKY SEARCH & NAVIGATION BAR                    */}
      {/* ========================================================================= */}
      <div
        id="marketplace-sticky-header"
        className={`sticky ${scrollDirection === 'down'
            ? '-translate-y-full opacity-0 pointer-events-none'
            : scrollDirection === 'up'
              ? 'top-0 z-30 translate-y-0 opacity-100 shadow-xl ring-1 ring-slate-200/80'
              : `${isCustomerOnly || isCustomerView || isCustomerMode ? 'top-0' : 'top-16'} z-30 translate-y-0 opacity-100`
          } bg-white/95 backdrop-blur-xl text-slate-900 shadow-[0_8px_30px_rgba(0,0,0,0.06)] -mx-4 sm:-mx-6 lg:-mx-8 px-3 sm:px-6 lg:px-8 border-b border-slate-200/90 transition-all duration-300 transform relative overflow-hidden group`}
      >
        {/* Permanent Subtle Animated Ambient Glow Layer */}
        <div className="absolute inset-0 animate-store-header-glow pointer-events-none opacity-90" />

        {/* Permanent Animated Gradient Shimmer Sweep Line at the Bottom Edge */}
        <div className="store-header-shimmer-bar" />

        {/* Upper Row: Store Brand + Desktop Mega Search Box + Cart */}
        <div
          className={`${isScrolled ? 'hidden md:flex' : 'flex'
            } py-3 items-center justify-between gap-3 sm:gap-6 border-b border-slate-200/60 transition-all duration-300 relative z-10`}
        >
          {/* Brand & Store Identity */}
          <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
            <div
              id="store-marketplace-logo"
              onClick={onLogoClick}
              className={`cursor-pointer select-none transition-all duration-300 relative group/logo ${isLogoAnimating ? 'animate-store-logo-bounce' : 'hover:scale-[1.03] active:scale-95'
                }`}
              title="Logo de la tienda"
            >
              {/* Permanent Ambient Glow Aura behind logo */}
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-amber-400/40 via-yellow-300/30 to-amber-500/40 blur-md opacity-60 group-hover/logo:opacity-100 transition-opacity duration-500 animate-pulse pointer-events-none" />

              <div className="flex items-center space-x-2 relative z-10">
                {storeConfig.logoDesktopUrl ? (
                  <div className="h-10 sm:h-11 max-w-[180px] lg:max-w-[220px] rounded-xl bg-white border border-amber-300/60 overflow-hidden shadow-xs flex items-center justify-center px-2 py-0.5">
                    <img src={storeConfig.logoDesktopUrl} alt={storeConfig.storeName} className="h-full w-auto max-w-full object-contain" />
                  </div>
                ) : storeConfig.logoUrl ? (
                  <div className="w-10 sm:w-11 h-10 sm:h-11 rounded-xl bg-white border border-amber-300/60 overflow-hidden shadow-xs flex items-center justify-center p-1">
                    <img src={storeConfig.logoUrl} alt={storeConfig.storeName} className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-10 sm:w-11 h-10 sm:h-11 rounded-xl bg-[#FFD000] text-slate-950 flex items-center justify-center shadow-md font-black border border-amber-400">
                    <Store className="w-6 h-6" />
                  </div>
                )}
                <div className="min-w-0 flex flex-col justify-center">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-black text-sm sm:text-base md:text-lg text-slate-950 tracking-tight truncate max-w-[140px] xs:max-w-[180px] sm:max-w-[240px]">
                      {storeConfig.storeName || 'Lotengoo'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">Todo en un solo lugar</span>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Mega Search Bar (Clean Pure White Input with Permanent Subtle Aura & Lotengoo Yellow Search Button) */}
          <div className="hidden md:block flex-1 max-w-2xl min-w-0 relative">
            <div className="flex items-center bg-white rounded-xl search-bar-premium-aura border border-amber-400/80 focus-within:border-amber-500 focus-within:ring-4 focus-within:ring-amber-400/25 overflow-hidden transition-all duration-300">
              {/* Category Dropdown integrated on the left */}
              <div className="relative flex-shrink-0 bg-slate-100 border-r border-slate-300">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="appearance-none bg-transparent hover:bg-slate-200 text-slate-800 text-xs font-bold pl-3 pr-7 py-2.5 focus:outline-none cursor-pointer max-w-[140px] truncate"
                  title="Todas las categorías"
                >
                  <option value="all">Todas las categorías</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c} ({categoryCounts[c] || 0})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-600 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Main Smart Search Input */}
              <StoreSmartSearchBar
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                products={products}
                categories={categories}
                onSelectCategory={(cat) => setSelectedCategory(cat)}
                onSelectProduct={(item) => props.onQuickViewProduct(item)}
                storeConfig={storeConfig}
              />

              {/* Signature Lotengoo Yellow Search Button */}
              <button
                type="button"
                className="bg-[#FFD000] hover:bg-[#E6B800] text-slate-950 font-black px-4 py-2.5 flex items-center justify-center transition cursor-pointer flex-shrink-0 shadow-xs active:scale-95"
                title="Buscar productos"
              >
                <Search className="w-4 h-4 text-slate-950 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Right Action Controls: Carrito Pill */}
          <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">

            {/* Merchant Tab Switcher in Admin preview */}
            {!isCustomerMode && !isCustomerOnly && (
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs gap-1">
                <button
                  onClick={() => setStoreTab('catalog')}
                  className={`px-2 py-1 sm:px-2.5 rounded-lg font-bold transition cursor-pointer ${storeTab === 'catalog' ? 'bg-[#FFD000] text-slate-950 font-black shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  Catálogo
                </button>
                <button
                  onClick={() => setStoreTab('orders')}
                  className={`px-2 py-1 sm:px-2.5 rounded-lg font-bold transition cursor-pointer flex items-center space-x-1 ${storeTab === 'orders' ? 'bg-[#FFD000] text-slate-950 font-black shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  <span>Pedidos</span>
                  {pendingCount > 0 && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />}
                </button>
              </div>
            )}

            {/* Lotengoo Yellow Shopping Cart Button */}
            {isCustomerView && (
              <button
                type="button"
                onClick={onOpenCart}
                className="flex items-center space-x-2 px-3.5 sm:px-4 py-2 rounded-full bg-[#FFD000] hover:bg-[#E6B800] text-slate-950 text-xs font-black transition cursor-pointer shadow-sm active:scale-95 flex-shrink-0 border border-amber-400"
                title="Ver carrito de compras"
              >
                <div className="relative">
                  <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 text-slate-950" />
                  {cartTotalItems > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center shadow-xs border border-white animate-bounce">
                      {cartTotalItems}
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-1">
                  <span className="text-xs font-black text-slate-950">Carrito</span>
                  <span className="text-xs font-mono font-bold text-slate-800">({cartTotalItems})</span>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Search & Filter Console (Clean, Modern, Stays Sticky on Cellular Scroll) */}
        <div
          className={`block md:hidden ${isScrolled ? 'py-2 px-0.5' : 'py-2 border-b border-amber-400/20'
            } transition-all duration-300`}
        >
          <div
            className={`flex items-center gap-2 ${isScrolled ? 'bg-white/80 backdrop-blur-xs p-1 rounded-2xl shadow-xs border border-amber-400/50 ring-2 ring-amber-400/15' : ''
              }`}
          >
            {/* Search Input Box (Clean Solid White Input contrasting on the Gradient Header Panel) */}
            <div className="flex-1 flex items-center bg-white rounded-xl shadow-xs border border-amber-400 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-400/30 overflow-hidden transition-all">
              <div className="relative flex-1 flex items-center bg-white">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar productos..."
                  className="w-full pl-8 pr-7 py-2 text-xs text-slate-900 placeholder:text-slate-400 bg-white focus:outline-none font-medium"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
                    title="Limpiar búsqueda"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                className="bg-amber-400 hover:bg-amber-500 text-slate-950 px-3 py-2 flex items-center justify-center flex-shrink-0 transition active:scale-95 cursor-pointer"
                title="Buscar"
              >
                <Search className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>

            {/* When scrolled on mobile in customer mode, maintain direct access to cart */}
            {isScrolled && isCustomerView && (
              <button
                type="button"
                onClick={onOpenCart}
                className="relative p-2 rounded-xl bg-slate-950 hover:bg-slate-900 text-amber-400 transition cursor-pointer shadow-xs active:scale-95 flex-shrink-0 border border-slate-800"
                title="Ver carrito de compras"
              >
                <ShoppingCart className="w-4 h-4 text-amber-400" />
                {cartTotalItems > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-0.5 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center shadow-xs border border-white">
                    {cartTotalItems}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Quick Filters & Controls Bar: SINGLE SCROLLABLE ROW ONLY (Phone Mode) */}
        <div className="block md:hidden border-t border-amber-300/30 py-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
          <div className="flex items-center space-x-1.5 flex-nowrap w-max">
            {/* Dedicated Filter & Categories Sheet Button */}
            <button
              type="button"
              onClick={() => setIsMobileFilterOpen(true)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center space-x-1.5 border shadow-2xs active:scale-95 flex-shrink-0 ${activeFilterCount > 0
                ? 'bg-amber-400 text-slate-950 font-black border-amber-400 shadow-xs'
                : 'bg-white/90 hover:bg-white text-slate-800 border-amber-300/60'
                }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filtros y Categorías</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-slate-950 text-amber-300 text-[10px] font-black flex items-center justify-center ml-0.5">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Ofertas Flash Toggle */}
            <button
              type="button"
              onClick={() => setShowOffersOnly(!showOffersOnly)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1 border flex-shrink-0 active:scale-95 ${showOffersOnly
                ? 'bg-rose-50 text-rose-700 border-rose-300 shadow-xs font-black'
                : 'bg-white/90 text-slate-700 hover:bg-white border-amber-300/60'
                }`}
              title="Filtrar productos con descuento"
            >
              <Flame className={`w-3.5 h-3.5 ${showOffersOnly ? 'text-rose-600 fill-rose-600' : 'text-rose-500'}`} />
              <span className="whitespace-nowrap">Ofertas</span>
            </button>

            {/* Quick Sorter */}
            <div className="relative flex-shrink-0">
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="appearance-none bg-white/90 hover:bg-white text-slate-800 border border-amber-300/60 rounded-xl pl-2.5 pr-6 py-1.5 text-xs font-bold focus:outline-none cursor-pointer"
              >
                <option value="featured">Destacados</option>
                <option value="price_asc">Menor Precio</option>
                <option value="price_desc">Mayor Precio</option>
                <option value="name">A - Z</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* En Stock (Solo en vista admin) */}
            {!isCustomerView && (
              <button
                type="button"
                onClick={() => setInStockOnly(!inStockOnly)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1 border flex-shrink-0 active:scale-95 ${inStockOnly
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-xs font-black'
                  : 'bg-white/90 text-slate-700 hover:bg-white border-amber-300/60'
                  }`}
                title="Mostrar solo productos con stock disponible"
              >
                <Check className={`w-3.5 h-3.5 ${inStockOnly ? 'text-emerald-700' : 'text-slate-500'}`} />
                <span className="whitespace-nowrap">En Stock</span>
              </button>
            )}

            {/* Subtle Divider */}
            <div className="h-4 w-px bg-amber-300/70 flex-shrink-0" />

            {/* Category Chips in the exact same single scrollable row */}
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center space-x-1.5 flex-shrink-0 ${selectedCategory === 'all'
                ? 'bg-amber-400 text-slate-950 font-black shadow-xs border border-amber-400'
                : 'bg-white/90 text-slate-700 hover:bg-white hover:text-slate-900 border border-amber-300/60'
                }`}
            >
              <span>☰ Todos</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedCategory === 'all' ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-slate-200 text-slate-600'}`}>
                {products.length}
              </span>
            </button>

            {categories.map((cat) => {
              const count = categoryCounts[cat] || 0;
              const isSel = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center space-x-1.5 flex-shrink-0 ${isSel
                    ? 'bg-amber-400 text-slate-950 font-black shadow-xs border border-amber-400'
                    : 'bg-white/90 text-slate-700 hover:bg-white hover:text-slate-900 border border-amber-300/60'
                    }`}
                >
                  <span>{cat}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSel ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-slate-200 text-slate-600'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop Lower Row: Lotengoo Department Ribbon & Fast Filter Toggles (Spacious MD+ screens) */}
        <div className="hidden md:flex py-2.5 items-center justify-between gap-4 text-xs font-bold text-slate-800 border-t border-slate-100 overflow-x-auto scrollbar-none">
          {/* Department Links & Categories Dropdown */}
          <div className="flex items-center space-x-5 flex-shrink-0">
            <div className="relative flex-shrink-0">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="appearance-none bg-slate-100 hover:bg-slate-200 text-slate-950 font-black rounded-full pl-8 pr-7 py-1.5 text-xs focus:outline-none cursor-pointer border border-slate-300 transition"
                title="Seleccionar Categoría"
              >
                <option value="all">≡ Categorías ({products.length})</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat} ({categoryCounts[cat] || 0})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-700 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              onClick={() => setShowOffersOnly(!showOffersOnly)}
              className={`hover:text-amber-600 transition cursor-pointer flex items-center gap-1.5 ${
                showOffersOnly ? 'text-amber-600 font-black' : 'text-slate-700'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span>Ofertas Flash</span>
            </button>

            {categories.slice(0, 4).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`hover:text-amber-600 transition cursor-pointer ${
                  selectedCategory === cat ? 'text-amber-600 font-black underline' : 'text-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Right Side: Vender en Lotengoo & Sort Selector */}
          <div className="flex items-center space-x-3 flex-shrink-0">
            <span className="text-slate-600 hover:text-slate-900 cursor-pointer font-bold flex items-center gap-1">
              <span>🤝 Vender en Lotengoo</span>
            </span>

            {/* Sort Selector */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="appearance-none bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-full pl-3 pr-7 py-1 text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value="featured">Destacados</option>
                <option value="price_asc">Menor Precio</option>
                <option value="price_desc">Mayor Precio</option>
                <option value="name">Nombre: A-Z</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. DEDICATED MOBILE FILTER MODAL / BOTTOM SHEET (LIGHT & CLEAR THEME)    */}
      {/* ========================================================================= */}
      {isMobileFilterOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setIsMobileFilterOpen(false)}
        >
          <div
            className="w-full sm:max-w-lg bg-white text-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl flex flex-col h-[85vh] max-h-[85dvh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header (Fixed at top) */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 flex-shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold shadow-xs">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 tracking-tight">Filtros y Categorías</h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {filteredProducts.length} {filteredProducts.length === 1 ? 'producto encontrado' : 'productos encontrados'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsMobileFilterOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-700 flex items-center justify-center cursor-pointer transition active:scale-95"
                title="Cerrar filtros"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Filter Options (flex-1 min-h-0 ensures entire content can be smoothly scrolled without cutting off) */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-5 text-xs">
              {/* Category Filter */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] uppercase tracking-wider font-bold text-amber-700 block">
                    Categorías ({categories.length})
                  </label>
                  {selectedCategory !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('all')}
                      className="text-[11px] text-amber-600 hover:text-amber-800 font-bold underline cursor-pointer"
                    >
                      Ver todas
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className={`p-2.5 rounded-xl border font-bold transition cursor-pointer flex items-center justify-between text-left active:scale-95 ${selectedCategory === 'all'
                      ? 'bg-amber-400 text-slate-950 font-black shadow-xs border-amber-400'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                      }`}
                  >
                    <span className="truncate">Todas las Categorías</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1 ${selectedCategory === 'all' ? 'bg-slate-950 text-amber-300' : 'bg-slate-200 text-slate-700'}`}>
                      {products.length}
                    </span>
                  </button>
                  {categories.map((cat) => {
                    const count = categoryCounts[cat] || 0;
                    const isSel = selectedCategory === cat;
                    return (
                      <button
                        type="button"
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`p-2.5 rounded-xl border font-bold transition cursor-pointer flex items-center justify-between text-left active:scale-95 ${isSel
                          ? 'bg-amber-400 text-slate-950 font-black shadow-xs border-amber-400'
                          : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                          }`}
                      >
                        <span className="truncate">{cat}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1 flex-shrink-0 ${isSel ? 'bg-slate-950 text-amber-300' : 'bg-slate-200 text-slate-700'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Fast Status Toggles */}
              <div>
                <label className="text-[11px] uppercase tracking-wider font-bold text-amber-700 block mb-2">
                  Disponibilidad y Promociones
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowOffersOnly(!showOffersOnly)}
                    className={`p-2.5 rounded-xl border flex items-center space-x-2.5 transition cursor-pointer text-left active:scale-95 ${showOffersOnly
                      ? 'bg-rose-50 border-rose-300 text-rose-800 shadow-xs ring-1 ring-rose-300 font-black'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${showOffersOnly ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      <Flame className="w-4 h-4 fill-current" />
                    </div>
                    <div className="leading-tight truncate">
                      <span className="font-bold block text-[11px]">Solo Ofertas</span>
                      <span className="text-[10px] text-slate-500">{showOffersOnly ? 'Activado' : 'Todo'}</span>
                    </div>
                  </button>

                  {!isCustomerView && (
                    <button
                      type="button"
                      onClick={() => setInStockOnly(!inStockOnly)}
                      className={`p-2.5 rounded-xl border flex items-center space-x-2.5 transition cursor-pointer text-left active:scale-95 ${inStockOnly
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs ring-1 ring-emerald-300 font-black'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${inStockOnly ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      </div>
                      <div className="leading-tight truncate">
                        <span className="font-bold block text-[11px]">En Stock</span>
                        <span className="text-[10px] text-slate-500">{inStockOnly ? 'Disponible' : 'Todo'}</span>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* Sorting Options */}
              <div>
                <label className="text-[11px] uppercase tracking-wider font-bold text-amber-700 block mb-2">
                  Ordenar Catálogo
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'featured', label: 'Destacados' },
                    { id: 'price_asc', label: 'Menor Precio' },
                    { id: 'price_desc', label: 'Mayor Precio' },
                    { id: 'category', label: 'Por Categoría' },
                    { id: 'date_desc', label: 'Más Recientes' },
                    { id: 'random', label: 'Aleatorio' },
                    { id: 'name', label: 'Nombre: A - Z' },
                  ].map((option) => {
                    const isSelected = sortBy === option.id;
                    return (
                      <button
                        type="button"
                        key={option.id}
                        onClick={() => setSortBy(option.id as any)}
                        className={`py-2 px-3 rounded-xl border text-left font-bold transition cursor-pointer flex items-center justify-between active:scale-95 ${isSelected
                          ? 'bg-amber-400 text-slate-950 border-amber-400 font-black shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                          }`}
                      >
                        <span className="truncate">{option.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3] flex-shrink-0 ml-1" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Bottom Actions (Always visible & pinned to bottom of modal, never cut off) */}
            <div className="p-3.5 sm:p-4 border-t border-slate-200 bg-white flex items-center gap-2.5 flex-shrink-0 shadow-lg pb-safe">
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setShowOffersOnly(false);
                  setInStockOnly(false);
                  setSortBy('featured');
                  setSearchQuery('');
                }}
                className="py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold transition cursor-pointer text-xs active:scale-95"
              >
                Limpiar Todo
              </button>
              <button
                type="button"
                onClick={() => setIsMobileFilterOpen(false)}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 font-black shadow-md shadow-amber-500/20 transition cursor-pointer text-xs flex items-center justify-center space-x-1.5 active:scale-95"
              >
                <span>Ver {filteredProducts.length} productos</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Feedback Pill */}
      {(searchQuery || selectedCategory !== 'all' || showOffersOnly || inStockOnly || sortBy !== 'featured') && (
        <div className="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 sm:px-4 py-2 text-xs text-slate-700 shadow-2xs">
          <div className="flex items-center space-x-1.5 sm:space-x-2 flex-wrap gap-y-1">
            <span className="font-bold text-slate-900">
              {filteredProducts.length} {filteredProducts.length === 1 ? 'producto encontrado' : 'productos encontrados'}
            </span>
            {searchQuery && (
              <span className="bg-white border border-slate-300 rounded-md px-1.5 py-0.5 text-slate-800 font-mono text-[11px]">
                "{searchQuery}"
              </span>
            )}
            {selectedCategory !== 'all' && (
              <span className="bg-amber-100 text-amber-950 border border-amber-300 rounded-md px-1.5 py-0.5 font-bold text-[11px]">
                {selectedCategory}
              </span>
            )}
            {showOffersOnly && (
              <span className="bg-red-100 text-red-950 border border-red-300 rounded-md px-1.5 py-0.5 font-bold flex items-center gap-1 text-[11px]">
                <Flame className="w-2.5 h-2.5 text-red-600 fill-current" /> Ofertas
              </span>
            )}
            {!isCustomerView && inStockOnly && (
              <span className="bg-emerald-100 text-emerald-950 border border-emerald-300 rounded-md px-1.5 py-0.5 font-bold flex items-center gap-1 text-[11px]">
                <Check className="w-2.5 h-2.5 text-emerald-600" /> En Stock
              </span>
            )}
            {sortBy !== 'featured' && (
              <span className="bg-slate-200 text-slate-800 border border-slate-300 rounded-md px-1.5 py-0.5 font-semibold text-[11px]">
                Orden: {sortBy === 'price_asc' ? 'Menor $' : sortBy === 'price_desc' ? 'Mayor $' : 'A-Z'}
              </span>
            )}
          </div>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
              setShowOffersOnly(false);
              setInStockOnly(false);
              setSortBy('featured');
            }}
            className="text-amber-700 hover:text-amber-800 font-bold underline cursor-pointer ml-2 whitespace-nowrap text-[11px]"
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* Did You Mean Typo Suggestion Banner */}
      {searchQuery && (
        (() => {
          const fuzzyInfo = searchProductsFuzzy(products, searchQuery);
          if (fuzzyInfo.didYouMean && fuzzyInfo.didYouMean.toLowerCase() !== searchQuery.toLowerCase()) {
            return (
              <div className="bg-amber-500/10 border border-amber-300/80 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs text-amber-950 my-3 shadow-xs">
                <div className="flex items-center space-x-2 min-w-0">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0 animate-pulse" />
                  <span className="truncate">
                    Mostrando resultados interpretados para "<strong className="font-extrabold">{searchQuery}</strong>". ¿Quisiste decir <strong className="font-black text-amber-700 underline cursor-pointer" onClick={() => setSearchQuery(fuzzyInfo.didYouMean!)}>{fuzzyInfo.didYouMean}</strong>?
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSearchQuery(fuzzyInfo.didYouMean!)}
                  className="px-3 py-1 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold rounded-lg text-xs transition cursor-pointer shrink-0 shadow-xs"
                >
                  Buscar "{fuzzyInfo.didYouMean}"
                </button>
              </div>
            );
          }
          return null;
        })()
      )}

      {/* Inline Commercial Poster (Replaces Hero Grid & Trust Badges when active, renders NOTHING when inactive) */}
      {selectedCategory === 'all' && !searchQuery && (
        <div className="space-y-6 mb-6">
          <InlineCommercialPoster
            storeConfig={storeConfig}
            categories={categories}
            setSelectedCategory={setSelectedCategory}
            setShowOffersOnly={setShowOffersOnly}
            products={products}
            currency={currency}
            onQuickViewProduct={props.onQuickViewProduct}
          />

          {/* Popular Categories Carousel/Grid */}
          <div id="store-popular-categories" className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest block">
                  EXPLORA POR DEPARTAMENTO
                </span>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Categorías Populares</h3>
              </div>
              <button
                onClick={() => setSelectedCategory('all')}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
              >
                <span>Ver todo el catálogo</span>
                <ChevronRight className="w-3.5 h-3.5 text-amber-500" />
              </button>
            </div>

            <div className="flex sm:grid sm:grid-cols-6 gap-2.5 sm:gap-3 overflow-x-auto scrollbar-none pb-2 sm:pb-0 -mx-1 px-1 sm:mx-0 sm:px-0 snap-x snap-mandatory">
              {categories.slice(0, 6).map((cat, idx) => {
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`flex-shrink-0 w-[115px] sm:w-auto p-2.5 sm:p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center gap-1.5 sm:gap-2 cursor-pointer active:scale-95 snap-start ${
                      isSelected
                        ? 'bg-[#FFD000] border-amber-400 text-slate-950 font-black shadow-sm'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-800 shadow-inner shrink-0">
                      {idx === 0 ? <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" /> : idx === 1 ? <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5 text-sky-500" /> : idx === 2 ? <Tag className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" /> : idx === 3 ? <Store className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" /> : idx === 4 ? <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" /> : <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />}
                    </div>
                    <span className="text-[11px] sm:text-xs font-bold leading-tight line-clamp-2 text-center h-7 sm:h-8 flex items-center justify-center max-w-full break-words">
                      {cat}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. PRODUCTS GRID                                                         */}
      {/* ========================================================================= */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center my-6 space-y-3 shadow-xs">
          <Package className="w-14 h-14 mx-auto text-slate-300" />
          <h3 className="text-base font-bold text-slate-900">No encontramos productos que coincidan</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Revisa la ortografía o intenta buscar con palabras clave más generales.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
              setShowOffersOnly(false);
              setInStockOnly(false);
            }}
            className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center space-x-1.5 mt-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restablecer Filtros y Ver Todo</span>
          </button>
        </div>
      ) : (
        <>
          <div id="store-products-anchor" className="scroll-mt-32" />

          {selectedCategory !== 'all' ? (
            <div className="space-y-6">
              {(() => {
                const catCfg = getCustomCategoryHeaderConfig(selectedCategory);
                const shouldShowBanner = storeConfig?.showCategoryHeader !== false;
                return shouldShowBanner ? (
                  <CategoryTransitionBanner
                    categoryName={selectedCategory}
                    itemCount={filteredProducts.length}
                    sampleProducts={filteredProducts}
                    customImageUrl={catCfg?.imageUrl}
                    overlayColor={catCfg?.overlayColor}
                    overlayOpacity={catCfg?.overlayOpacity}
                  />
                ) : null;
              })()}
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 md:gap-5">
                {paginatedProducts.map((item) => (
                  <ProductCardItem key={item.id} item={item} props={props} />
                ))}
              </div>
            </div>
          ) : searchQuery || storeConfig?.showCategoryHeader === false ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 md:gap-5">
              {paginatedProducts.map((item) => (
                <ProductCardItem key={item.id} item={item} props={props} />
              ))}
            </div>
          ) : (
            <div className="space-y-10">
              {(() => {
                const presentCategories = Array.from(
                  new Set(paginatedProducts.map((p) => p.category || 'General'))
                );
                const shouldShowBanner = storeConfig?.showCategoryHeader !== undefined ? Boolean(storeConfig.showCategoryHeader) : true;

                return presentCategories.map((catName) => {
                  const catProducts = paginatedProducts.filter(
                    (p) => (p.category || 'General') === catName
                  );
                  const totalInCat = products.filter(
                    (p) => (p.category || 'General') === catName && p.status !== 'archived'
                  ).length;
                  const catCfg = getCustomCategoryHeaderConfig(catName);

                  return (
                    <div key={catName} className="space-y-4">
                      {/* Category Header Panel with Full Background Image FIRST */}
                      {shouldShowBanner && (
                        <CategoryTransitionBanner
                          categoryName={catName}
                          itemCount={totalInCat}
                          sampleProducts={catProducts}
                          customImageUrl={catCfg?.imageUrl}
                          overlayColor={catCfg?.overlayColor}
                          overlayOpacity={catCfg?.overlayOpacity}
                          onSelectCategory={(cat) => setSelectedCategory(cat)}
                        />
                      )}

                      {/* Category Products Grid NEXT */}
                      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 md:gap-5">
                        {catProducts.map((item) => (
                          <ProductCardItem key={item.id} item={item} props={props} />
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* Pagination Controls */}
          {isPaginationEnabled && totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 pb-2 border-t border-slate-200">
              <div className="text-xs text-slate-500 font-medium order-2 sm:order-1 text-center sm:text-left">
                Mostrando <span className="font-bold text-slate-800">{startIndex + 1}</span> - <span className="font-bold text-slate-800">{Math.min(startIndex + ITEMS_PER_PAGE, filteredProducts.length)}</span> de <span className="font-bold text-slate-800">{filteredProducts.length}</span> productos
              </div>

              <div className="flex items-center space-x-1.5 order-1 sm:order-2">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center space-x-1 ${currentPage === 1
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 border-slate-300 shadow-2xs cursor-pointer active:scale-95'
                    }`}
                  title="Página anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>

                <div className="flex items-center space-x-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                    // Display compact ellipsis if there are many pages
                    if (
                      totalPages > 6 &&
                      pageNum !== 1 &&
                      pageNum !== totalPages &&
                      Math.abs(pageNum - currentPage) > 1
                    ) {
                      if (pageNum === 2 || pageNum === totalPages - 1) {
                        return (
                          <span key={pageNum} className="px-1 text-slate-400 text-xs font-bold">
                            ...
                          </span>
                        );
                      }
                      return null;
                    }

                    const isCurrent = pageNum === currentPage;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => handlePageChange(pageNum)}
                        className={`min-w-8 h-8 px-2 rounded-xl text-xs font-black transition flex items-center justify-center border cursor-pointer active:scale-95 ${isCurrent
                          ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-xs font-black'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300'
                          }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center space-x-1 ${currentPage === totalPages
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 border-slate-300 shadow-2xs cursor-pointer active:scale-95'
                    }`}
                  title="Página siguiente"
                >
                  <span>Siguiente</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* 4. ALL OTHER PANELS DISPLAYED AFTER THE PRODUCTS                         */}
      {/* ========================================================================= */}
      <div className="space-y-6 pt-4 border-t border-slate-200">
        {/* Promotional Announcement Ticker */}
        <BannerTicker props={props} variant="standard" />

        {/* Amazon / AliExpress Buyer Protection & Trust Pillars */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-xs grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0 border border-amber-200">
              <Truck className="w-4 h-4" />
            </div>
            <div className="leading-tight">
              <span className="font-bold text-slate-900 block">Envíos Nacionales</span>
              <span className="text-[11px] text-slate-500">Entrega rápida a domicilio</span>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0 border border-emerald-200">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="leading-tight">
              <span className="font-bold text-slate-900 block">Compra Protegida</span>
              <span className="text-[11px] text-slate-500">Garantía y productos 100% reales</span>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center flex-shrink-0 border border-sky-200">
              <CreditCard className="w-4 h-4" />
            </div>
            <div className="leading-tight">
              <span className="font-bold text-slate-900 block">Pagos Flexibles</span>
              <span className="text-[11px] text-slate-500">Efectivo, transferencias y depósitos</span>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0 border border-purple-200">
              <MessageCircle className="w-4 h-4" />
            </div>
            <div className="leading-tight">
              <span className="font-bold text-slate-900 block">Atención WhatsApp</span>
              <span className="text-[11px] text-slate-500">Confirmación y asesoría inmediata</span>
            </div>
          </div>
        </div>


      </div>
    </div>
  );
};

/**
 * 2. BOUTIQUE THEME LAYOUT:
 * 2-Column Editorial / Atelier layout:
 * Left sticky sidebar with Collections Navigator, Concierge card, and VIP Trust badges.
 * Right stream with luxury search/sort toolbar and spacious 3-column product cards.
 */
export const BoutiqueStoreLayout: React.FC<{ props: StoreLayoutProps }> = ({ props }) => {
  const {
    filteredProducts,
    searchQuery,
    setSearchQuery,
    inStockOnly,
    setInStockOnly,
    showOffersOnly,
    setShowOffersOnly,
    sortBy,
    setSortBy,
    themeStyles,
    isCustomerView,
    storeConfig,
  } = props;

  return (
    <div className="space-y-6">
      <BannerTicker props={props} variant="top-pill" />
      <StoreHeader props={props} variant="boutique" />

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Atelier Sidebar */}
        <div className="lg:col-span-3 space-y-6 lg:sticky lg:top-4">
          <CategorySelector props={props} variant="vertical-atelier" />

          {/* VIP Concierge Card */}
          {storeConfig.whatsappNumber && (
            <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-amber-500/40 rounded-2xl p-4 shadow-lg space-y-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-black text-amber-300 uppercase tracking-wider">Atelier Concierge</h4>
              </div>
              <p className="text-[11px] text-zinc-300 leading-relaxed">
                Asesoría personalizada en tallas, disponibilidad y pedidos especiales.
              </p>
              <a
                href={buildWhatsAppLink(storeConfig.whatsappNumber, `¡Hola! Me gustaría asistencia exclusiva para comprar en la boutique.`)}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 text-zinc-950 font-black text-xs flex items-center justify-center space-x-1.5 shadow-md hover:brightness-110 transition cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Contactar Asesor</span>
              </a>
            </div>
          )}

          {isCustomerView && (
            <>
              <TrustBadges props={props} variant="vertical-luxury" />
              <PaymentShowcase props={props} variant="compact-sidebar" />
              <CouriersShowcase props={props} variant="compact-sidebar" />
            </>
          )}
        </div>

        {/* Right Gallery Stream */}
        <div className="lg:col-span-9 space-y-6">
          {/* Top Gallery Toolbar */}
          <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3.5">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-amber-400/60" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar en la colección exclusiva..."
                className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-100 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto justify-between sm:justify-end flex-wrap gap-y-1.5">
              <button
                onClick={() => setShowOffersOnly(!showOffersOnly)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 border transition cursor-pointer ${showOffersOnly
                  ? 'bg-gradient-to-r from-amber-500 to-rose-500 border-amber-400 text-black shadow-xs font-black'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                title="Filtrar piezas con descuento exclusivo"
              >
                <Sparkles className={`w-3.5 h-3.5 ${showOffersOnly ? 'text-black fill-black' : 'text-amber-400'}`} />
                <span>Ofertas</span>
              </button>



              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-amber-500 focus:outline-none cursor-pointer font-bold"
              >
                <option value="featured">Colección Destacada</option>
                <option value="price_asc">Precio: Menor a Mayor</option>
                <option value="price_desc">Precio: Mayor a Menor</option>
                <option value="name">Nombre: A-Z</option>
              </select>

              {/* Botón Compartir Tienda */}
              {props.onOpenShareModal && (
                <button
                  type="button"
                  id="btn-share-store-customer-boutique"
                  onClick={props.onOpenShareModal}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-black transition cursor-pointer flex items-center space-x-1.5 shadow-2xs active:scale-95 whitespace-nowrap"
                  title="Compartir boutique"
                >
                  <Share2 className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                  <span>Compartir Tienda</span>
                </button>
              )}
            </div>
          </div>

          {/* Luxury Products Grid */}
          {filteredProducts.length === 0 ? (
            <div className="rounded-3xl p-12 text-center bg-zinc-900 border border-amber-500/20">
              <Package className="w-12 h-12 mx-auto mb-3 text-amber-400/40" />
              <h3 className="text-base font-bold text-zinc-100">Sin piezas encontradas</h3>
              <p className="text-xs mt-1 max-w-sm mx-auto text-zinc-400">
                No hay productos en esta selección de la boutique.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((item) => (
                <ProductCardItem key={item.id} item={item} props={props} />
              ))}
            </div>
          )}
        </div>
      </div>

      {isCustomerView && <StoreFooter props={props} variant="boutique" />}
    </div>
  );
};

/**
 * 3. FRESH & DYNAMIC THEME LAYOUT:
 * Bento E-Commerce layout:
 * Top announcement ribbon, category story chips, hero bento action banner,
 * 4-column product grid, and dual side-by-side Bento logistics panels.
 */
export const FreshStoreLayout: React.FC<{ props: StoreLayoutProps }> = ({ props }) => {
  const {
    filteredProducts,
    searchQuery,
    setSearchQuery,
    inStockOnly,
    setInStockOnly,
    showOffersOnly,
    setShowOffersOnly,
    sortBy,
    setSortBy,
    themeStyles,
    isCustomerView,
    storeConfig,
    courierPartners,
  } = props;

  return (
    <div className="space-y-6">
      <BannerTicker props={props} variant="top-pill" />
      <StoreHeader props={props} variant="fresh" />

      {/* Story Category Bubbles Strip */}
      <CategorySelector props={props} variant="story-chips" />

      {/* Dynamic Bento Hero Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Bento Box Left: Search & Filter Console */}
        <div className="lg:col-span-7 bg-white border border-teal-200/90 rounded-3xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div className="flex items-center space-x-2 text-teal-800">
            <Search className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-black uppercase tracking-wide">Búsqueda Rápida & Filtros</h3>
          </div>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="¿Qué estás buscando hoy? Escribe aquí..."
              className="w-full pl-4 pr-9 py-2.5 rounded-2xl bg-teal-50/40 border border-teal-200 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 font-medium"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
            <button
              onClick={() => setShowOffersOnly(!showOffersOnly)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${showOffersOnly ? 'bg-rose-500 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${showOffersOnly ? 'text-amber-200 fill-amber-200' : 'text-rose-500'}`} />
              <span>Ofertas</span>
            </button>

            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="px-3 py-1.5 rounded-xl text-xs bg-slate-100 border-0 text-slate-800 font-bold focus:outline-none cursor-pointer"
            >
              <option value="featured">✨ Destacados</option>
              <option value="price_asc">💵 Menor Precio</option>
              <option value="price_desc">💎 Mayor Precio</option>
              <option value="name">🔤 Nombre A-Z</option>
            </select>
            {props.onOpenShareModal && (
              <button
                type="button"
                id="btn-share-store-customer-fresh"
                onClick={props.onOpenShareModal}
                className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 text-xs font-black transition cursor-pointer flex items-center space-x-1.5 shadow-2xs active:scale-95 whitespace-nowrap"
                title="Compartir tienda"
              >
                <Share2 className="w-3.5 h-3.5 text-teal-600 stroke-[2.5]" />
                <span>Compartir Tienda</span>
              </button>
            )}
          </div>
        </div>

        {/* Bento Box Right: Dispatch & Instant WhatsApp */}
        <div className="lg:col-span-5 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 text-white rounded-3xl p-5 shadow-md flex flex-col justify-between space-y-3">
          <div>
            <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-[10px] font-black uppercase tracking-wider backdrop-blur-xs">
              ⚡ DESPACHOS EXPRESS
            </span>
            <h4 className="text-sm font-black mt-2">Envíos directos y garantizados</h4>
            <p className="text-[11px] text-teal-100 mt-0.5">
              Empacamos y despachamos tu pedido en el día con seguimiento en tiempo real.
            </p>
          </div>
          {storeConfig.whatsappNumber && (
            <a
              href={buildWhatsAppLink(storeConfig.whatsappNumber, `¡Hola! Quisiera realizar un pedido rápido del catálogo.`)}
              target="_blank"
              rel="noreferrer"
              className="py-2.5 px-4 rounded-2xl bg-white hover:bg-teal-50 text-emerald-900 font-black text-xs flex items-center justify-center space-x-2 shadow-sm transition active:scale-95 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              <span>Pedir al Instante por WhatsApp</span>
            </a>
          )}
        </div>
      </div>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <div className={`rounded-3xl p-12 text-center ${themeStyles.cardBg}`}>
          <Package className="w-12 h-12 mx-auto mb-3 text-teal-600/40" />
          <h3 className="text-base font-bold text-slate-900">No encontramos productos</h3>
          <p className="text-xs mt-1 text-slate-500">Prueba con otra búsqueda o categoría.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 md:gap-5">
          {filteredProducts.map((item) => (
            <ProductCardItem key={item.id} item={item} props={props} />
          ))}
        </div>
      )}

      {isCustomerView && (
        <div className="space-y-6 pt-4">
          <TrustBadges props={props} variant="horizontal" />
          <StoreFooter props={props} variant="fresh" />
        </div>
      )}
    </div>
  );
};

/**
 * 4. BRUTALIST THEME LAYOUT:
 * Split Zine / Poster Block layout:
 * Heavy black-bordered ticker, chunky poster header with 3px black borders,
 * Left control column with sticker filters, sticker categories & guarantees,
 * and high-impact right products stream.
 */
export const BrutalistStoreLayout: React.FC<{ props: StoreLayoutProps }> = ({ props }) => {
  const {
    filteredProducts,
    searchQuery,
    setSearchQuery,
    inStockOnly,
    setInStockOnly,
    showOffersOnly,
    setShowOffersOnly,
    sortBy,
    setSortBy,
    isCustomerView,
  } = props;

  return (
    <div className="space-y-6 font-sans">
      <BannerTicker props={props} variant="marquee" />
      <StoreHeader props={props} variant="brutalist" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Chunky Control Column */}
        <div className="lg:col-span-4 space-y-5 lg:sticky lg:top-4">
          {/* Block 1: Search & Filter */}
          <div className="p-4 border-3 border-black bg-white shadow-[4px_4px_0px_#000] space-y-3">
            <div className="flex items-center space-x-2 border-b-2 border-black pb-2">
              <Search className="w-4 h-4 text-black" />
              <h3 className="text-xs font-black text-black uppercase">🔍 BÚSQUEDA Y FILTROS</h3>
            </div>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="BUSCAR PRODUCTO O SKU..."
                className="w-full px-3 py-2 border-2 border-black bg-yellow-100 text-xs font-black uppercase text-black placeholder:text-slate-600 focus:outline-none focus:bg-white"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 font-black text-xs">
                  ✕
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                onClick={() => setShowOffersOnly(!showOffersOnly)}
                className={`px-3 py-1.5 border-2 border-black text-xs font-black uppercase transition cursor-pointer ${showOffersOnly ? 'bg-rose-500 text-white shadow-[2px_2px_0px_#000]' : 'bg-white text-black hover:bg-slate-100'
                  }`}
              >
                {showOffersOnly ? '★ OFERTAS' : 'OFERTAS'}
              </button>

              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="px-2 py-1.5 border-2 border-black bg-white text-xs font-black uppercase cursor-pointer"
              >
                <option value="featured">DESTACADOS</option>
                <option value="price_asc">MENOR PRECIO</option>
                <option value="price_desc">MAYOR PRECIO</option>
                <option value="name">NOMBRE A-Z</option>
              </select>
              {props.onOpenShareModal && (
                <button
                  type="button"
                  id="btn-share-store-customer-brutalist"
                  onClick={props.onOpenShareModal}
                  className="px-2.5 py-1.5 border-2 border-black bg-yellow-300 hover:bg-yellow-200 text-black text-xs font-black uppercase transition cursor-pointer flex items-center space-x-1 shadow-[2px_2px_0px_#000] active:translate-x-[2px] active:translate-y-[2px]"
                  title="COMPARTIR TIENDA"
                >
                  <Share2 className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>COMPARTIR</span>
                </button>
              )}
            </div>
          </div>

          {/* Block 2: Categories */}
          <CategorySelector props={props} variant="brutalist-stickers" />

          {isCustomerView && (
            <>
              <TrustBadges props={props} variant="brutalist-stickers" />
              <PaymentShowcase props={props} variant="brutalist-block" />
              <CouriersShowcase props={props} variant="brutalist-block" />
            </>
          )}
        </div>

        {/* Right High-Impact Products Stream */}
        <div className="lg:col-span-8 space-y-6">
          {filteredProducts.length === 0 ? (
            <div className="p-12 border-3 border-black bg-yellow-200 text-center shadow-[6px_6px_0px_#000]">
              <Package className="w-12 h-12 mx-auto mb-3 text-black" />
              <h3 className="text-base font-black text-black uppercase">¡NO HAY PRODUCTOS!</h3>
              <p className="text-xs font-bold text-slate-800 mt-1">Prueba con otra búsqueda o categoría.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredProducts.map((item) => (
                <ProductCardItem key={item.id} item={item} props={props} />
              ))}
            </div>
          )}
        </div>
      </div>

      {isCustomerView && <StoreFooter props={props} variant="brutalist" />}
    </div>
  );
};

/**
 * 5. CYBERPUNK HUD THEME LAYOUT:
 * Command Center Dual HUD layout:
 * Monospace telemetry bar, Cyber cockpit header with glowing cyan frame,
 * Left HUD terminal console with query matrix & protocols,
 * and Right live hologram product grid.
 */
export const CyberStoreLayout: React.FC<{ props: StoreLayoutProps }> = ({ props }) => {
  const {
    filteredProducts,
    searchQuery,
    setSearchQuery,
    inStockOnly,
    setInStockOnly,
    showOffersOnly,
    setShowOffersOnly,
    sortBy,
    setSortBy,
    isCustomerView,
  } = props;

  return (
    <div className="space-y-6 font-mono text-cyan-200">
      {/* Top HUD Telemetry Bar */}
      <div className="px-4 py-2 border border-cyan-500/50 bg-[#070d18] text-[11px] flex items-center justify-between text-cyan-400 flex-wrap gap-2">
        <div className="flex items-center space-x-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>[STATUS: ONLINE]</span>
          </span>
          <span>[SECURITY: 256-BIT]</span>
        </div>
        <div>
          <span>[PROTOCOL: COMERXIA_HUD_v4.2]</span>
        </div>
      </div>

      <StoreHeader props={props} variant="cyber" />
      <BannerTicker props={props} variant="hud" />

      {/* Command Center Dual Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left HUD Terminal Column */}
        <div className="lg:col-span-3 space-y-5 lg:sticky lg:top-4">
          {/* Search Matrix */}
          <div className="p-4 border border-cyan-500/60 bg-[#0b1528] shadow-[0_0_12px_rgba(6,182,212,0.2)] space-y-3">
            <div className="flex items-center space-x-2 border-b border-cyan-900 pb-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold text-cyan-300 uppercase">[QUERY_MATRIX]</h3>
            </div>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="&gt; SEARCH_SKU..."
                className="w-full px-3 py-2 border border-cyan-800 bg-[#070d18] text-xs text-cyan-300 placeholder:text-cyan-700 focus:outline-none focus:border-cyan-400"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-cyan-400">
                  ✕
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                onClick={() => setShowOffersOnly(!showOffersOnly)}
                className={`px-2.5 py-1 text-xs border transition cursor-pointer ${showOffersOnly
                  ? 'bg-rose-500 text-white font-bold border-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.5)]'
                  : 'border-cyan-900 text-cyan-400'
                  }`}
              >
                {showOffersOnly ? '[*] OFFERS' : '[ ] OFFERS'}
              </button>

              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="px-2 py-1 text-xs bg-[#070d18] border border-cyan-800 text-cyan-300 focus:outline-none cursor-pointer"
              >
                <option value="featured">FEATURED</option>
                <option value="price_asc">PRICE ASC</option>
                <option value="price_desc">PRICE DESC</option>
                <option value="name">NAME A-Z</option>
              </select>
              {props.onOpenShareModal && (
                <button
                  type="button"
                  id="btn-share-store-customer-cyber"
                  onClick={props.onOpenShareModal}
                  className="px-2 py-1 text-xs border border-emerald-500 bg-emerald-950/80 text-emerald-300 hover:bg-emerald-900 transition cursor-pointer flex items-center space-x-1"
                  title="SHARE STORE"
                >
                  <Share2 className="w-3 h-3 text-emerald-400" />
                  <span>[SHARE]</span>
                </button>
              )}
            </div>
          </div>

          <CategorySelector props={props} variant="cyber-protocols" />

          {isCustomerView && (
            <>
              <TrustBadges props={props} variant="cyber-nodes" />
              <PaymentShowcase props={props} variant="cyber-node" />
              <CouriersShowcase props={props} variant="cyber-node" />
            </>
          )}
        </div>

        {/* Right Hologram Product Grid */}
        <div className="lg:col-span-9 space-y-6">
          {filteredProducts.length === 0 ? (
            <div className="p-12 border border-cyan-500/40 bg-[#0b1528] text-center shadow-[0_0_20px_rgba(6,182,212,0.2)]">
              <Package className="w-12 h-12 mx-auto mb-3 text-cyan-400/40" />
              <h3 className="text-base font-bold text-cyan-200">[NO_DATA_RECORDS_FOUND]</h3>
              <p className="text-xs text-cyan-500 mt-1">Adjust query parameters or protocol filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredProducts.map((item) => (
                <ProductCardItem key={item.id} item={item} props={props} />
              ))}
            </div>
          )}
        </div>
      </div>

      {isCustomerView && <StoreFooter props={props} variant="cyber" />}
    </div>
  );
};

/**
 * 6. MINIMALIST THEME LAYOUT:
 * Centered Zen layout:
 * Floating airy header, warm-sand ticker, centered pill navigation,
 * airy 4-column product gallery, and soft rounded logistics panels.
 */
export const MinimalStoreLayout: React.FC<{ props: StoreLayoutProps }> = ({ props }) => {
  const {
    filteredProducts,
    searchQuery,
    setSearchQuery,
    inStockOnly,
    setInStockOnly,
    showOffersOnly,
    setShowOffersOnly,
    sortBy,
    setSortBy,
    isCustomerView,
  } = props;

  return (
    <div className="space-y-7">
      <StoreHeader props={props} variant="minimal" />
      <BannerTicker props={props} variant="minimal" />

      {/* Centered Filter Bar */}
      <div className="space-y-4 max-w-3xl mx-auto text-center">
        <div className="relative max-w-md mx-auto">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar artículos..."
            className="w-full pl-9 pr-8 py-2 rounded-full bg-white border-0 shadow-xs text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 font-medium"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <CategorySelector props={props} variant="minimal-centered" />

        <div className="flex items-center justify-center space-x-3 text-xs pt-1 flex-wrap gap-y-2">
          <button
            onClick={() => setShowOffersOnly(!showOffersOnly)}
            className={`px-3.5 py-1 rounded-full font-medium transition cursor-pointer ${showOffersOnly ? 'bg-rose-700 text-white shadow-xs' : 'bg-white text-stone-600 shadow-2xs hover:bg-stone-100'
              }`}
          >
            Ofertas
          </button>

          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="px-3.5 py-1 rounded-full bg-white text-stone-700 shadow-2xs font-medium focus:outline-none cursor-pointer"
          >
            <option value="featured">Destacados</option>
            <option value="price_asc">Menor Precio</option>
            <option value="price_desc">Mayor Precio</option>
            <option value="name">Nombre A-Z</option>
          </select>
          {props.onOpenShareModal && (
            <button
              type="button"
              id="btn-share-store-customer-minimal"
              onClick={props.onOpenShareModal}
              className="px-3.5 py-1 rounded-full font-medium transition cursor-pointer bg-stone-100 hover:bg-stone-200 text-stone-800 shadow-2xs flex items-center space-x-1.5"
              title="Compartir tienda"
            >
              <Share2 className="w-3.5 h-3.5 text-stone-600" />
              <span>Compartir</span>
            </button>
          )}
        </div>
      </div>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <div className="rounded-3xl p-12 text-center bg-white shadow-xs">
          <Package className="w-12 h-12 mx-auto mb-3 text-stone-300" />
          <h3 className="text-base font-medium text-stone-900 font-serif">Sin resultados</h3>
          <p className="text-xs mt-1 text-stone-500">No encontramos productos en esta búsqueda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 md:gap-6">
          {filteredProducts.map((item) => (
            <ProductCardItem key={item.id} item={item} props={props} />
          ))}
        </div>
      )}

      {isCustomerView && (
        <div className="space-y-6 pt-6">
          <TrustBadges props={props} variant="horizontal" />
          <StoreFooter props={props} variant="minimal" />
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------
// 2.7 ADMIN CATALOG LAYOUT (Clean, Standard Merchant Management View)
// ----------------------------------------------------
export const AdminStoreCatalog: React.FC<{ props: StoreLayoutProps }> = ({ props }) => {
  const themeNameMap: Record<StoreTheme, string> = {
    classic: 'Clásico Moderno',
    boutique: 'Boutique Elegante',
    fresh: 'Fresco & Dinámico',
    brutalist: 'Neo-Brutalismo Pop',
    cyber: 'Cyberpunk HUD',
    minimal: 'Minimalista Nórdico',
  };

  // Pagination: 20 products per page
  const ITEMS_PER_PAGE = 20;
  const [currentPage, setCurrentPage] = React.useState(1);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [props.searchQuery, props.selectedCategory, props.showOffersOnly, props.inStockOnly, props.sortBy]);

  const totalPages = Math.max(1, Math.ceil(props.filteredProducts.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedProducts = props.filteredProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Admin Notice & Context Banner */}
      <div className="bg-white border border-slate-300 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center flex-shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-black text-slate-900">Catálogo de Productos (Modo Administrador)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                Vista de Gestión
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Administración de existencias, precios y visualización de productos en la tienda.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => props.setStoreTab('settings')}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 shadow-2xs"
          >
            <Settings className="w-3.5 h-3.5 text-slate-600" />
            <span>Ajustes de Tienda</span>
          </button>
        </div>
      </div>

      {/* Search, Filter and Sorter Bar (Sticky top bar with 2-Tone Yellow to 2-Tone Black Vertical Gradient) */}
      <div
        className={`sticky ${props.isCustomerOnly ? 'top-0' : 'top-16'
          } z-20 border border-amber-400/80 rounded-2xl p-4 shadow-md flex flex-col md:flex-row items-center justify-between gap-3.5 transition-all`}
        style={{
          background: 'linear-gradient(180deg, #f59e0b 0%, #fbbf24 35%, #27272a 70%, #09090b 100%)',
        }}
      >
        {/* Search Box (Clean Solid White Input) */}
        <div className="relative w-full md:w-80 rounded-xl overflow-hidden border border-slate-300 bg-white shadow-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={props.searchQuery}
            onChange={(e) => props.setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, SKU o categoría..."
            className="w-full pl-9 pr-8 py-2 text-xs font-medium bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          {props.searchQuery && (
            <button
              onClick={() => props.setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Categories Bar */}
        <div className="flex items-center space-x-1.5 overflow-x-auto max-w-full pb-1 md:pb-0 scrollbar-none w-full md:w-auto">
          {props.categories.map((cat) => {
            const count = props.categoryCounts[cat] || 0;
            const isSelected = props.selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => props.setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center space-x-1.5 flex-shrink-0 ${isSelected
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                  }`}
              >
                <span>{cat}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${isSelected ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Stock & Offers Filter and Sort */}
        <div className="flex items-center space-x-2.5 w-full md:w-auto justify-between md:justify-end flex-wrap gap-y-1.5">
          <label className="flex items-center space-x-1.5 text-xs text-slate-700 font-bold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={props.showOffersOnly}
              onChange={(e) => props.setShowOffersOnly(e.target.checked)}
              className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5 cursor-pointer"
            />
            <span className={props.showOffersOnly ? 'text-rose-700 font-black flex items-center gap-1' : 'flex items-center gap-1'}>
              <Sparkles className="w-3 h-3 text-rose-500" />
              <span>En Oferta</span>
            </span>
          </label>



          <select
            value={props.sortBy}
            onChange={(e) => props.setSortBy(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 text-slate-800 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            <option value="featured">Destacados</option>
            <option value="price_asc">Menor Precio</option>
            <option value="price_desc">Mayor Precio</option>
            <option value="name">Nombre (A-Z)</option>
          </select>

          {/* Botón Compartir Tienda */}
          {props.onOpenShareModal && (
            <button
              type="button"
              id="btn-share-store-catalog"
              onClick={props.onOpenShareModal}
              className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black transition cursor-pointer flex items-center space-x-1.5 shadow-2xs active:scale-95 whitespace-nowrap"
              title="Compartir enlace público de la tienda con clientes"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
              <span>Compartir Tienda</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {props.filteredProducts.length === 0 ? (
        <div className="bg-white border border-slate-300 rounded-2xl p-12 text-center shadow-sm space-y-3">
          <Package className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-900">No se encontraron productos</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Intenta cambiar el término de búsqueda o selecciona otra categoría.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {paginatedProducts.map((item) => {
              const hasStock = item.stock > 0;
              const photos = getProductPhotos(item);
              const mainImg = photos[0] || '';

              return (
                <div
                  key={item.id}
                  id={`product-card-${item.id}`}
                  className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs hover:shadow-md hover:border-sky-300 transition-all flex flex-col justify-between group"
                >
                  <div>
                    {/* Image container */}
                    <div
                      onClick={() => props.onQuickViewProduct(item)}
                      className="relative aspect-square bg-slate-100 overflow-hidden cursor-pointer flex items-center justify-center border-b border-slate-100"
                    >
                      <ProductMediaDisplay
                        imageUrl={photos[0] || item.imageUrl}
                        candidateImages={photos}
                        videoUrl={item.videoUrl}
                        name={item.name}
                        className="w-full h-full relative"
                        imageClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        videoClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        autoPlayVideo={true}
                        showPlayBadge={false}
                        placeholderText="Sin imagen"
                        fallbackIcon="package"
                      />

                      {/* Stock badge */}
                      <div className="absolute top-2 left-2">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold shadow-2xs ${hasStock
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                            }`}
                        >
                          {hasStock ? `${item.stock} en stock` : 'Bajo pedido'}
                        </span>
                      </div>

                      {item.videoUrl && (
                        <div className="absolute top-2 right-2">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold shadow-2xs bg-slate-950/90 text-sky-300 border border-sky-400/40 flex items-center space-x-1 backdrop-blur-xs">
                            <Play className="w-2.5 h-2.5 text-sky-400 fill-current" />
                            <span>Video</span>
                          </span>
                        </div>
                      )}

                      {/* Category badge */}
                      {item.category && (
                        <div className="absolute bottom-2 left-2">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white/90 text-slate-800 border border-slate-200 backdrop-blur-xs">
                            {item.category}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3.5 space-y-1.5">
                      <h4
                        onClick={() => props.onQuickViewProduct(item)}
                        className="text-xs font-bold text-slate-900 hover:text-sky-600 line-clamp-2 cursor-pointer"
                        title={item.name}
                      >
                        {item.name}
                      </h4>
                      {item.sku && (
                        <span className="text-[10px] font-mono text-slate-400 block">
                          SKU: {item.sku}
                        </span>
                      )}
                      <div className="pt-1 flex items-baseline justify-between">
                        <span className="text-base font-black text-slate-900">
                          ${Number(item.salePrice).toFixed(2)}
                          <span className="text-[10px] font-normal text-slate-500 ml-1">
                            {props.currency}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="p-3.5 pt-0 flex items-center space-x-1.5">
                    {props.isCustomerView ? (
                      <button
                        type="button"
                        onClick={(e) => props.onDirectBuyProduct(item, e)}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm transition cursor-pointer flex items-center justify-center space-x-1.5 shadow-xs active:scale-95"
                        title="Comprar directo por WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5 fill-current" />
                        <span>Comprar</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => props.onQuickViewProduct(item)}
                        className="flex-1 py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300 transition cursor-pointer flex items-center justify-center space-x-1.5 shadow-2xs"
                        title="Ver detalle del producto"
                      >
                        <Eye className="w-3.5 h-3.5 text-sky-600" />
                        <span>Ver Ficha</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => props.onShareProductWhatsApp(item, e)}
                      className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition cursor-pointer"
                      title="Compartir por WhatsApp"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>

                    {props.isCustomerView && (
                      <button
                        type="button"
                        onClick={() => props.onQuickViewProduct(item)}
                        className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition cursor-pointer"
                        title="Ver detalle"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 pb-2 border-t border-slate-200">
              <div className="text-xs text-slate-500 font-medium order-2 sm:order-1 text-center sm:text-left">
                Mostrando <span className="font-bold text-slate-800">{startIndex + 1}</span> - <span className="font-bold text-slate-800">{Math.min(startIndex + ITEMS_PER_PAGE, props.filteredProducts.length)}</span> de <span className="font-bold text-slate-800">{props.filteredProducts.length}</span> productos
              </div>

              <div className="flex items-center space-x-1.5 order-1 sm:order-2">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center space-x-1 ${currentPage === 1
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 border-slate-300 shadow-2xs cursor-pointer active:scale-95'
                    }`}
                  title="Página anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>

                <div className="flex items-center space-x-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                    if (
                      totalPages > 6 &&
                      pageNum !== 1 &&
                      pageNum !== totalPages &&
                      Math.abs(pageNum - currentPage) > 1
                    ) {
                      if (pageNum === 2 || pageNum === totalPages - 1) {
                        return (
                          <span key={pageNum} className="px-1 text-slate-400 text-xs font-bold">
                            ...
                          </span>
                        );
                      }
                      return null;
                    }

                    const isCurrent = pageNum === currentPage;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => handlePageChange(pageNum)}
                        className={`min-w-8 h-8 px-2 rounded-xl text-xs font-black transition flex items-center justify-center border cursor-pointer active:scale-95 ${isCurrent
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300'
                          }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center space-x-1 ${currentPage === totalPages
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 border-slate-300 shadow-2xs cursor-pointer active:scale-95'
                    }`}
                  title="Página siguiente"
                >
                  <span>Siguiente</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <StoreFooter props={props} variant="standard" />
    </div>
  );
};

// ----------------------------------------------------
// 3. MAIN STOREFRONT THEMED CATALOG SWITCHER
// ----------------------------------------------------
export const StoreThemedCatalog: React.FC<{ props: StoreLayoutProps }> = ({ props }) => {
  // If not customer view (i.e. merchant is in administrative management view), display clean admin catalog
  if (!props.isCustomerView) {
    return <AdminStoreCatalog props={props} />;
  }

  // When in customer view (buyers or customer preview mode), render the modern Amazon & AliExpress Marketplace storefront
  return <ClassicStoreLayout props={props} />;
};

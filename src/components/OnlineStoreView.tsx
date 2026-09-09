import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { safeLocalStorage } from '../utils/safeStorage.ts';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Barcode,
  Bell,
  Building2,
  Calendar,
  CalendarRange,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Database,
  DollarSign,
  Edit3,
  ExternalLink,
  Eye,
  FileUp,
  Film,
  Filter,
  Globe,
  Headphones,
  Home,
  Image as ImageIcon,
  ImagePlus,
  Info,
  Landmark,
  Layers,
  LayoutGrid,
  List,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  PackageCheck,
  Palette,
  PauseCircle,
  Phone,
  Play,
  Plus,
  Power,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Store,
  Table,
  Tag,
  Trash,
  Trash2,
  TrendingUp,
  Truck,
  UploadCloud,
  User,
  Wallet,
  X,
  Zap,
  Loader2,
  Lock,
  XCircle,
  HelpCircle,
  Mail,
} from 'lucide-react';
import { CartItem, CustomerOrder, InventoryItem, StoreConfig, StoreTheme, CourierPartner, PaymentMethodPartner } from '../types.ts';
import { OrdersTableView } from './OrdersTableView.tsx';
import { OrdersCardsView } from './OrdersCardsView.tsx';
import { PartialDeliveryModal } from './PartialDeliveryModal.tsx';
import { ShippingTicketModal, directPrintShippingTicket } from './ShippingTicketModal.tsx';
import { directPrintOrder } from '../utils/directOrderPrint.ts';
import { RequestShippingDataModal } from './RequestShippingDataModal.tsx';
import { ManageShippingGuideModal } from './ManageShippingGuideModal.tsx';
import { ManagePendingShippingModal } from './ManagePendingShippingModal.tsx';
import { UnifiedOrderManageModal } from './UnifiedOrderManageModal.tsx';
import { StorePromoModal } from './store/StorePromoModal.tsx';
import { StoreSettingsTab } from './StoreSettingsTab.tsx';
import { StoreMaintenanceScreen } from './store/StoreMaintenanceScreen.tsx';
import { StoreThemedCatalog, StoreLayoutProps } from './store/StoreThemeLayouts.tsx';
import { StoreProductDetailPage } from './store/StoreProductDetailPage.tsx';
import { StoreBottomBar } from './store/StoreBottomBar.tsx';
import { StorePaymentMethodsModal } from './store/StorePaymentMethodsModal.tsx';
import { StoreShippingCouriersModal } from './store/StoreShippingCouriersModal.tsx';
import { ProductMediaDisplay } from './ProductMediaDisplay.tsx';
import { ShareStoreModal } from './ShareStoreModal.tsx';
import { parseVideoUrl } from '../utils/video-helper.ts';
import { getProductPhotosWithFallback, normalizeMediaUrl } from '../utils/media-helper.ts';
import { getPublicStoreUrl, getPublicProductUrl } from '../utils/storeUrls.ts';
import {
  formatExactCurrency,
  formatSmartCurrency,
  getMetricFontSizeClass,
} from '../utils/metricFormatters.ts';
import {
  normalizeEcuadorPhone,
  formatEcuadorLocalDisplay,
  buildWhatsAppLink,
  toEcuadorLocalPhone,
  toEcuadorInternationalPhone,
  isCashPayment,
} from '../utils/phone.ts';
import {
  trackStoreVisit,
  trackProductView,
  trackAddToCart,
  trackWhatsAppClick,
} from '../services/analytics.ts';
import { getThemeColors, ThemeColorPalette } from '../utils/themeColors.ts';
import {
  getCustomerCi,
  stripCiFromAddress,
  getCleanAddress,
  isOrderPartiallyDelivered,
  isOrderConfirmed,
  isOrderLockedFromCancellationOrDeletion,
  isOrderLockedFromEditing,
  getOrderEditBlockReason,
  canOrderBeMarkedAsShipped,
  canGenerateShippingGuide,
  isPickupDeliveryOrder,
  isShippingDeliveryOrder,
  isConcatenatedShippingAddress,
  parseCustomerShippingData,
  deriveBankOrAccountFromMethod,
  isOnlineStoreOrder,
} from '../utils/orderUtils.ts';
import { validateEcuadorId } from '../utils/ecuadorIdValidator.ts';

// Visual Style / Theme Presets and Default Color Palettes
export const DEFAULT_THEME_COLORS: Record<StoreTheme, string[]> = {
  classic: ['#0284c7', '#2563eb', '#10b981', '#f8fafc'],
  boutique: ['#f59e0b', '#eab308', '#27272a', '#09090b'],
  fresh: ['#059669', '#0d9488', '#06b6d4', '#ecfdf5'],
  brutalist: ['#fde047', '#fb7185', '#34d399', '#000000'],
  cyber: ['#06b6d4', '#d946ef', '#0b1528', '#070d18'],
  minimal: ['#1c1917', '#78716c', '#e7e5e4', '#faf8f5'],
};

export const COLOR_ROLE_NAMES = [
  'Color Primario / Botones',
  'Color Secundario / Acentos',
  'Superficie / Contrastes',
  'Fondo Base / Tienda',
];

export const parseThemePalettes = (raw: any): Record<string, string[]> => {
  const result: Record<string, string[]> = {
    classic: [...DEFAULT_THEME_COLORS.classic],
    boutique: [...DEFAULT_THEME_COLORS.boutique],
    fresh: [...DEFAULT_THEME_COLORS.fresh],
    brutalist: [...DEFAULT_THEME_COLORS.brutalist],
    cyber: [...DEFAULT_THEME_COLORS.cyber],
    minimal: [...DEFAULT_THEME_COLORS.minimal],
  };

  if (!raw) return result;
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return result;
    }
  }

  if (typeof parsed === 'object' && parsed !== null) {
    Object.keys(result).forEach((key) => {
      if (Array.isArray(parsed[key]) && parsed[key].length >= 4) {
        result[key] = [...parsed[key]];
      }
    });
  }

  return result;
};

export const THEME_PRESETS: Array<{
  id: StoreTheme;
  name: string;
  subtitle: string;
  tag: string;
  description: string;
  layoutDescription: string;
  colors: string[];
  previewBg: string;
  previewCard: string;
  previewAccent: string;
}> = [
  {
    id: 'classic',
    name: 'Clásico Moderno',
    subtitle: 'Azul & Esmeralda Profesional',
    tag: 'Recomendado General',
    description: 'Estilo limpio, profesional y altamente confiable con esquinas suaves y sombras equilibradas. Ideal para comercio general.',
    layoutDescription: 'Distribución vertical fluida: Barra de filtros y búsqueda horizontal superior, galería de 4 columnas y paneles de logística apilados.',
    colors: ['#0284c7', '#2563eb', '#10b981', '#f8fafc'],
    previewBg: 'bg-slate-100',
    previewCard: 'bg-white border-slate-300 text-slate-900',
    previewAccent: 'from-sky-500 to-blue-600',
  },
  {
    id: 'boutique',
    name: 'Boutique Elegante',
    subtitle: 'Negro Obsidiana & Oro Luxury',
    tag: 'Alta Gama & Lujo',
    description: 'Atmósfera sofisticada con contrastes oscuros profundos, líneas nítidas y detalles dorados para marcas exclusivas.',
    layoutDescription: 'Estructura editorial de 2 columnas: Barra lateral izquierda con navegación Atelier, concierge VIP y certificados; galería espaciosa a la derecha.',
    colors: ['#f59e0b', '#eab308', '#27272a', '#09090b'],
    previewBg: 'bg-zinc-950',
    previewCard: 'bg-zinc-900 border-amber-500/30 text-zinc-100',
    previewAccent: 'from-amber-500 via-amber-600 to-yellow-600',
  },
  {
    id: 'fresh',
    name: 'Fresco & Dinámico',
    subtitle: 'Menta, Teal & Verde Esmeralda',
    tag: 'Vitalidad & Tendencia',
    description: 'Estilo revitalizante, moderno y enérgico con tonos menta y teal para belleza, salud y vida activa.',
    layoutDescription: 'Diseño Bento interactivo: Cinta superior de avisos, cinturón de categorías vivas, banner Bento con búsqueda rápida y paneles dobles de logística.',
    colors: ['#059669', '#0d9488', '#06b6d4', '#ecfdf5'],
    previewBg: 'bg-teal-50/50',
    previewCard: 'bg-white border-teal-300 text-slate-900',
    previewAccent: 'from-emerald-500 via-teal-500 to-cyan-600',
  },
  {
    id: 'brutalist',
    name: 'Neo-Brutalismo Pop',
    subtitle: 'Bordes Negros & Sombras Duras',
    tag: 'Impacto Visual & Retro',
    description: 'Estilo gráfico de alto impacto con bordes negros gruesos, sombras de bloque duras y botones con pulsación táctil.',
    layoutDescription: 'Estructura Zine en bloques divididos: Columna izquierda de control con stickers de búsqueda, categorías y garantías; galería de impacto a la derecha.',
    colors: ['#fde047', '#fb7185', '#34d399', '#000000'],
    previewBg: 'bg-amber-100',
    previewCard: 'bg-white border-3 border-black text-black shadow-[3px_3px_0px_#000]',
    previewAccent: 'from-yellow-400 to-amber-500 text-black',
  },
  {
    id: 'cyber',
    name: 'Cyberpunk HUD',
    subtitle: 'Neón Cyan & Terminal Sci-Fi',
    tag: 'Tecnología & Gamer',
    description: 'Cabina futurista de control con fondos espaciales oscuros, resplandor neón cyan y magenta y tipografía monospace HUD.',
    layoutDescription: 'Centro de comando Sci-Fi: Barra de telemetría superior, terminal lateral de protocolos y seguridad, y matriz holográfica de productos.',
    colors: ['#06b6d4', '#d946ef', '#0b1528', '#070d18'],
    previewBg: 'bg-[#070d18]',
    previewCard: 'bg-[#0b1528] border border-cyan-500/70 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.3)]',
    previewAccent: 'from-cyan-500 to-fuchsia-600',
  },
  {
    id: 'minimal',
    name: 'Minimalista Nórdico',
    subtitle: 'Zen & Arena Cálida',
    tag: 'Elegancia Silenciosa',
    description: 'Estética escandinava pura con lienzo arena cálida, tarjetas flotantes sin bordes rígidos y formas de píldora redondeadas.',
    layoutDescription: 'Distribución Zen centrada: Navegación de categorías en píldoras centradas, galería limpia de 4 columnas y paneles de logística en tarjetas suaves.',
    colors: ['#1c1917', '#78716c', '#e7e5e4', '#faf8f5'],
    previewBg: 'bg-[#FAF8F5]',
    previewCard: 'bg-white border-0 shadow-sm text-stone-900',
    previewAccent: 'from-stone-800 to-stone-950',
  },
];

export const getThemeStyles = (theme: StoreTheme = 'classic', customPalette?: string[], isCustomerView: boolean = true) => {
  const colors = getThemeColors(customPalette, theme);

  if (!isCustomerView) {
    return {
      colors,
      pageBg: 'text-slate-900',
      panelBg: 'bg-white border-slate-300 text-slate-900 shadow-sm',
      cardBg: 'bg-white border-slate-300 text-slate-900 shadow-sm',
      cardHover: 'hover:border-sky-400 hover:shadow-md',
      headerBg: 'bg-white border-slate-300 text-slate-900 shadow-sm',
      headerText: 'text-slate-900',
      headerSubtext: 'text-slate-500',
      bannerTickerBg: 'bg-amber-50 text-amber-900 border-amber-200',
      bannerIconColor: 'text-amber-500',
      trustCardBg: 'bg-white border-slate-200 text-slate-800 shadow-xs',
      trustIconBg: 'bg-sky-50 text-sky-600 border border-sky-200',
      trustTitle: 'text-slate-800',
      trustSubtitle: 'text-slate-500',
      filterBarBg: 'bg-white border-slate-300 shadow-sm',
      searchInputBg: 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-sky-500',
      pillActive: 'bg-slate-900 text-white font-bold shadow-xs',
      pillInactive: 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200',
      productCardBg: 'bg-white border-slate-200 hover:border-sky-400 hover:shadow-md text-slate-900',
      productImageBg: 'bg-slate-50 border-b border-slate-100',
      productTitle: 'text-slate-900 hover:text-sky-600',
      productCategory: 'text-slate-400',
      productDescription: 'text-slate-500',
      productPrice: 'text-slate-900 font-bold',
      productCategoryBadge: 'bg-white text-slate-800 border-slate-200',
      primaryBtn: 'bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-xs',
      secondaryBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs font-bold',
      cartBadge: 'bg-sky-600 text-white',
      cartHeaderBg: 'bg-white border-b border-slate-200 text-slate-900',
      cartDrawerBg: 'bg-white border-l border-slate-200 text-slate-900',
      cartItemBg: 'bg-slate-50 border-slate-200 text-slate-900',
      cartCheckoutBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md',
      officialBadgeBg: 'bg-sky-100 text-sky-900 border-sky-300',
      themeAccentName: 'Panel Administrativo Comerxia',
    };
  }

  switch (theme) {
    case 'boutique':
      return {
        colors,
        // Container & Backgrounds
        pageBg: 'text-zinc-100',
        panelBg: 'bg-zinc-900/90 border-zinc-800 text-zinc-100 shadow-md',
        cardBg: 'bg-zinc-900 border-zinc-800/90 text-zinc-100 shadow-lg shadow-black/40',
        cardHover: 'hover:border-amber-500/60 hover:shadow-2xl hover:shadow-black/70',
        headerBg: 'bg-gradient-to-br from-zinc-900 via-neutral-900 to-zinc-950 border-amber-500/30 text-white shadow-xl ring-1 ring-amber-500/20',
        headerText: 'text-amber-100',
        headerSubtext: 'text-zinc-400',
        bannerTickerBg: 'bg-zinc-900/90 text-amber-200 border-amber-500/40 shadow-inner',
        bannerIconColor: 'text-amber-400',
        // Trust badges
        trustCardBg: 'bg-zinc-900/90 border-zinc-800/90 text-zinc-100 shadow-md hover:border-amber-500/30',
        trustIconBg: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
        trustTitle: 'text-zinc-100',
        trustSubtitle: 'text-zinc-400',
        // Search & Filters
        filterBarBg: 'bg-zinc-900 border-zinc-800 shadow-lg',
        searchInputBg: 'bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:bg-zinc-950',
        pillActive: 'bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 text-zinc-950 font-black shadow-md shadow-amber-500/20',
        pillInactive: 'bg-zinc-800/90 text-zinc-300 hover:bg-zinc-700 hover:text-white border-zinc-700/80',
        // Product cards
        productCardBg: 'bg-zinc-900/95 border-zinc-800 text-zinc-100 hover:border-amber-500/60 hover:shadow-2xl hover:shadow-black/70',
        productImageBg: 'bg-zinc-950 border-b border-zinc-800',
        productTitle: 'text-zinc-100 hover:text-amber-400',
        productCategory: 'text-zinc-400',
        productDescription: 'text-zinc-400',
        productPrice: 'text-amber-400 font-black',
        productCategoryBadge: 'bg-zinc-950/90 text-amber-300 border-zinc-800',
        primaryBtn: 'bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-zinc-950 font-black shadow-md shadow-amber-500/20',
        secondaryBtn: 'bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/30 font-bold',
        cartBadge: 'bg-amber-500 text-zinc-950 font-black',
        // Cart drawer
        cartHeaderBg: 'bg-zinc-900/95 border-b border-zinc-800 text-zinc-100',
        cartDrawerBg: 'bg-zinc-950 border-l border-zinc-800 text-zinc-100',
        cartItemBg: 'bg-zinc-900/90 border-zinc-800 text-zinc-100',
        cartCheckoutBtn: 'bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-zinc-950 font-black shadow-lg shadow-amber-500/25',
        // Badges
        officialBadgeBg: 'bg-amber-950/90 text-amber-300 border-amber-500/40 shadow-xs',
        themeAccentName: 'Boutique Elegante (Oro & Carbón)',
      };
    case 'fresh':
      return {
        colors,
        // Container & Backgrounds
        pageBg: 'text-slate-900',
        panelBg: 'bg-white border-teal-200 text-slate-900 shadow-sm',
        cardBg: 'bg-white border-teal-200/80 text-slate-900 shadow-sm',
        cardHover: 'hover:border-teal-400 hover:shadow-lg hover:shadow-teal-500/10',
        headerBg: 'bg-gradient-to-br from-white via-teal-50/30 to-emerald-50/40 border-teal-300 text-slate-900 shadow-md ring-1 ring-teal-400/20',
        headerText: 'text-slate-900',
        headerSubtext: 'text-teal-800/80',
        bannerTickerBg: 'bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 text-emerald-950 border-emerald-200/90 shadow-xs',
        bannerIconColor: 'text-emerald-600',
        // Trust badges
        trustCardBg: 'bg-white border-teal-200/80 text-slate-800 shadow-xs hover:border-teal-300',
        trustIconBg: 'bg-teal-50 text-teal-700 border border-teal-200',
        trustTitle: 'text-slate-800',
        trustSubtitle: 'text-slate-500',
        // Search & Filters
        filterBarBg: 'bg-white border-teal-300/90 shadow-sm',
        searchInputBg: 'bg-teal-50/30 border-teal-200 text-slate-900 placeholder:text-teal-700/60 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100',
        pillActive: 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold shadow-xs',
        pillInactive: 'bg-teal-50 text-teal-800 hover:bg-teal-100 border-teal-200',
        // Product cards
        productCardBg: 'bg-white border-teal-100 hover:border-emerald-400 hover:shadow-xl hover:shadow-teal-500/10 text-slate-900',
        productImageBg: 'bg-teal-50/20 border-b border-teal-100',
        productTitle: 'text-slate-900 hover:text-teal-700',
        productCategory: 'text-slate-400',
        productDescription: 'text-slate-500',
        productPrice: 'text-emerald-700 font-black',
        productCategoryBadge: 'bg-white/95 text-teal-900 border-teal-200',
        primaryBtn: 'bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold shadow-md shadow-teal-500/20',
        secondaryBtn: 'bg-teal-600 hover:bg-teal-700 text-white shadow-xs font-bold',
        cartBadge: 'bg-teal-600 text-white',
        // Cart drawer
        cartHeaderBg: 'bg-teal-50/80 border-b border-teal-200 text-slate-900',
        cartDrawerBg: 'bg-white border-l border-teal-200 text-slate-900',
        cartItemBg: 'bg-teal-50/30 border-teal-200 text-slate-900',
        cartCheckoutBtn: 'bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black shadow-lg shadow-teal-500/25',
        // Badges
        officialBadgeBg: 'bg-teal-100 text-teal-950 border-teal-300 shadow-2xs',
        themeAccentName: 'Fresco & Dinámico (Menta & Teal)',
      };
    case 'brutalist':
      return {
        colors,
        // Container & Backgrounds
        pageBg: 'text-black',
        panelBg: 'bg-white border-3 border-black shadow-[5px_5px_0px_0px_#000] text-black',
        cardBg: 'bg-white border-3 border-black shadow-[5px_5px_0px_0px_#000] text-black',
        cardHover: 'hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[7px_7px_0px_0px_#000]',
        headerBg: 'bg-yellow-300 border-3 border-black text-black shadow-[6px_6px_0px_0px_#000]',
        headerText: 'text-black font-black uppercase tracking-tight',
        headerSubtext: 'text-black font-bold',
        bannerTickerBg: 'bg-rose-400 text-black border-2 border-black font-black shadow-[3px_3px_0px_0px_#000]',
        bannerIconColor: 'text-black',
        // Trust badges
        trustCardBg: 'bg-white border-2 border-black text-black shadow-[3px_3px_0px_0px_#000] hover:bg-yellow-100',
        trustIconBg: 'bg-yellow-300 text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]',
        trustTitle: 'text-black font-black uppercase text-[11px]',
        trustSubtitle: 'text-black/80 font-bold',
        // Search & Filters
        filterBarBg: 'bg-white border-3 border-black shadow-[4px_4px_0px_0px_#000]',
        searchInputBg: 'bg-yellow-50/60 border-2 border-black text-black placeholder:text-black/60 focus:bg-white focus:shadow-[3px_3px_0px_0px_#000]',
        pillActive: 'bg-black text-yellow-300 font-black border-2 border-black shadow-[2px_2px_0px_0px_#000]',
        pillInactive: 'bg-white text-black font-bold hover:bg-yellow-200 border-2 border-black shadow-[2px_2px_0px_0px_#000]',
        // Product cards
        productCardBg: 'bg-white border-3 border-black shadow-[5px_5px_0px_0px_#000] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[8px_8px_0px_0px_#000] text-black',
        productImageBg: 'bg-yellow-100/60 border-b-3 border-black',
        productTitle: 'text-black font-black hover:text-rose-600 uppercase tracking-tight',
        productCategory: 'text-black/70 font-mono font-bold',
        productDescription: 'text-black/80 font-semibold',
        productPrice: 'text-black font-black bg-yellow-300 px-2 py-0.5 border-2 border-black shadow-[2px_2px_0px_0px_#000] inline-block',
        productCategoryBadge: 'bg-rose-400 text-black border-2 border-black font-black shadow-[2px_2px_0px_0px_#000]',
        primaryBtn: 'bg-yellow-400 hover:bg-yellow-300 text-black font-black uppercase border-2 border-black shadow-[3px_3px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
        secondaryBtn: 'bg-emerald-400 hover:bg-emerald-300 text-black font-black uppercase border-2 border-black shadow-[3px_3px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
        cartBadge: 'bg-rose-500 text-white font-black border-2 border-black shadow-[1px_1px_0px_0px_#000]',
        // Cart drawer
        cartHeaderBg: 'bg-yellow-300 border-b-3 border-black text-black font-black',
        cartDrawerBg: 'bg-white border-l-3 border-black text-black',
        cartItemBg: 'bg-yellow-50/60 border-2 border-black shadow-[2px_2px_0px_0px_#000] text-black',
        cartCheckoutBtn: 'bg-emerald-400 hover:bg-emerald-300 text-black font-black uppercase border-3 border-black shadow-[4px_4px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
        // Badges
        officialBadgeBg: 'bg-white text-black border-2 border-black font-black shadow-[2px_2px_0px_0px_#000]',
        themeAccentName: 'Neo-Brutalismo Pop (Stickers & Sombras Duras)',
      };
    case 'cyber':
      return {
        colors,
        // Container & Backgrounds
        pageBg: 'text-cyan-100',
        panelBg: 'bg-[#0b1528]/90 border border-cyan-500/40 text-cyan-100 shadow-[0_0_20px_rgba(6,182,212,0.15)] backdrop-blur-md',
        cardBg: 'bg-[#091322] border border-cyan-500/50 text-cyan-100 shadow-[0_0_15px_rgba(6,182,212,0.15)]',
        cardHover: 'hover:border-cyan-400 hover:shadow-[0_0_25px_rgba(6,182,212,0.4)]',
        headerBg: 'bg-gradient-to-r from-[#070e1c] via-[#0d1c38] to-[#120f2e] border-b-2 border-cyan-500 text-white shadow-[0_4px_25px_rgba(6,182,212,0.25)] ring-1 ring-cyan-400/30',
        headerText: 'text-cyan-300 font-mono tracking-wider drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]',
        headerSubtext: 'text-cyan-200/70 font-mono',
        bannerTickerBg: 'bg-[#081224] text-cyan-300 border border-cyan-500/60 shadow-[inset_0_0_15px_rgba(6,182,212,0.2)]',
        bannerIconColor: 'text-cyan-400',
        // Trust badges
        trustCardBg: 'bg-[#091322] border border-cyan-500/40 text-cyan-200 hover:border-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.1)]',
        trustIconBg: 'bg-cyan-950 text-cyan-300 border border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]',
        trustTitle: 'text-cyan-100 font-mono',
        trustSubtitle: 'text-cyan-400/70 font-mono text-[10px]',
        // Search & Filters
        filterBarBg: 'bg-[#0a1529] border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)]',
        searchInputBg: 'bg-[#060e1c] border border-cyan-500/60 text-cyan-200 placeholder:text-cyan-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-500/40 focus:bg-[#060e1c] font-mono',
        pillActive: 'bg-gradient-to-r from-cyan-500 to-fuchsia-600 text-white font-mono font-black shadow-[0_0_12px_rgba(6,182,212,0.6)] border border-cyan-300',
        pillInactive: 'bg-[#0b1930] text-cyan-300 hover:bg-[#122648] hover:text-white border border-cyan-800/80 font-mono',
        // Product cards
        productCardBg: 'bg-[#081220] border border-cyan-500/40 hover:border-cyan-400 hover:shadow-[0_0_20px_rgba(6,182,212,0.35)] text-cyan-100',
        productImageBg: 'bg-[#040810] border-b border-cyan-500/30',
        productTitle: 'text-cyan-100 hover:text-cyan-300 font-mono tracking-tight',
        productCategory: 'text-cyan-400/60 font-mono',
        productDescription: 'text-cyan-300/70 font-mono text-xs',
        productPrice: 'text-cyan-300 font-mono font-black drop-shadow-[0_0_6px_rgba(6,182,212,0.7)]',
        productCategoryBadge: 'bg-[#040914]/90 text-cyan-300 border border-cyan-500/50 font-mono',
        primaryBtn: 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-mono font-black shadow-[0_0_15px_rgba(6,182,212,0.4)] border border-cyan-300',
        secondaryBtn: 'bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white font-mono font-black shadow-[0_0_15px_rgba(217,70,239,0.4)] border border-fuchsia-400',
        cartBadge: 'bg-cyan-400 text-slate-950 font-mono font-black shadow-[0_0_10px_rgba(6,182,212,0.8)]',
        // Cart drawer
        cartHeaderBg: 'bg-[#081224] border-b border-cyan-500/50 text-cyan-100 font-mono',
        cartDrawerBg: 'bg-[#050b14] border-l-2 border-cyan-500 text-cyan-100',
        cartItemBg: 'bg-[#09152a] border border-cyan-500/30 text-cyan-100',
        cartCheckoutBtn: 'bg-gradient-to-r from-cyan-400 via-teal-400 to-fuchsia-500 hover:from-cyan-300 hover:to-fuchsia-400 text-slate-950 font-mono font-black shadow-[0_0_20px_rgba(6,182,212,0.5)] border border-cyan-200',
        // Badges
        officialBadgeBg: 'bg-cyan-950/90 text-cyan-300 border border-cyan-400/60 font-mono shadow-[0_0_8px_rgba(6,182,212,0.3)]',
        themeAccentName: 'Cyberpunk HUD (Neón Cyan & Violeta)',
      };
    case 'minimal':
      return {
        colors,
        // Container & Backgrounds
        pageBg: 'text-stone-900',
        panelBg: 'bg-white border-0 text-stone-900 shadow-sm rounded-3xl',
        cardBg: 'bg-white border-0 text-stone-900 shadow-sm hover:shadow-md transition-shadow',
        cardHover: 'hover:shadow-xl hover:shadow-stone-200/60',
        headerBg: 'bg-white/90 backdrop-blur-md border border-stone-200/80 text-stone-900 shadow-xs rounded-3xl',
        headerText: 'text-stone-900 font-medium tracking-tight',
        headerSubtext: 'text-stone-500 font-normal',
        bannerTickerBg: 'bg-stone-100 text-stone-700 border-0 rounded-full shadow-none',
        bannerIconColor: 'text-stone-600',
        // Trust badges
        trustCardBg: 'bg-white border border-stone-200/70 text-stone-800 shadow-2xs hover:shadow-sm rounded-2xl',
        trustIconBg: 'bg-stone-100 text-stone-800 border-0 rounded-full',
        trustTitle: 'text-stone-800 font-semibold',
        trustSubtitle: 'text-stone-500 font-normal',
        // Search & Filters
        filterBarBg: 'bg-white border border-stone-200/80 shadow-xs rounded-2xl',
        searchInputBg: 'bg-stone-50 border-0 text-stone-900 placeholder:text-stone-400 focus:bg-white focus:ring-1 focus:ring-stone-400 rounded-full',
        pillActive: 'bg-stone-900 text-white font-medium shadow-none rounded-full',
        pillInactive: 'bg-stone-100 text-stone-700 hover:bg-stone-200 border-0 rounded-full',
        // Product cards
        productCardBg: 'bg-white border-0 hover:shadow-xl hover:shadow-stone-200/70 text-stone-900 rounded-3xl',
        productImageBg: 'bg-[#f4f2ee] rounded-t-3xl',
        productTitle: 'text-stone-900 hover:text-stone-600 font-semibold tracking-tight',
        productCategory: 'text-stone-400 font-normal',
        productDescription: 'text-stone-500 font-normal',
        productPrice: 'text-stone-900 font-bold',
        productCategoryBadge: 'bg-white/95 text-stone-700 border border-stone-200/70 rounded-full',
        primaryBtn: 'bg-stone-900 hover:bg-stone-800 text-white font-medium rounded-full shadow-none',
        secondaryBtn: 'bg-stone-200 hover:bg-stone-300 text-stone-900 font-medium rounded-full shadow-none',
        cartBadge: 'bg-stone-900 text-white font-semibold rounded-full',
        // Cart drawer
        cartHeaderBg: 'bg-white border-b border-stone-100 text-stone-900',
        cartDrawerBg: 'bg-[#FAF8F5] border-l border-stone-200 text-stone-900',
        cartItemBg: 'bg-white border border-stone-100 text-stone-900 rounded-2xl',
        cartCheckoutBtn: 'bg-stone-900 hover:bg-black text-white font-semibold rounded-full shadow-md',
        // Badges
        officialBadgeBg: 'bg-stone-100 text-stone-800 border border-stone-200 rounded-full',
        themeAccentName: 'Minimalista Nórdico (Zen & Arena Cálida)',
      };
    case 'classic':
    default:
      return {
        colors,
        // Container & Backgrounds
        pageBg: 'text-slate-900',
        panelBg: 'bg-white border-slate-300 text-slate-900 shadow-sm',
        cardBg: 'bg-white border-slate-300 text-slate-900 shadow-sm',
        cardHover: 'hover:border-sky-400/80 hover:shadow-lg hover:shadow-slate-200/60',
        headerBg: 'bg-white border border-slate-300 shadow-sm text-slate-900',
        headerText: 'text-slate-900',
        headerSubtext: 'text-slate-600',
        bannerTickerBg: 'bg-amber-50/70 text-amber-800 border-amber-200/80',
        bannerIconColor: 'text-amber-500',
        // Trust badges
        trustCardBg: 'bg-white border-slate-200/80 text-slate-800 shadow-xs',
        trustIconBg: 'bg-sky-50 text-sky-600 border border-sky-200',
        trustTitle: 'text-slate-800',
        trustSubtitle: 'text-slate-500',
        // Search & Filters
        filterBarBg: 'bg-white border-slate-300 shadow-sm',
        searchInputBg: 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100',
        pillActive: 'bg-slate-900 text-white shadow-xs',
        pillInactive: 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300',
        // Product cards
        productCardBg: 'bg-white border-slate-200/90 hover:border-sky-400/80 hover:shadow-lg hover:shadow-slate-200/60 text-slate-900',
        productImageBg: 'bg-slate-50 border-b border-slate-100',
        productTitle: 'text-slate-900 hover:text-sky-600',
        productCategory: 'text-slate-400',
        productDescription: 'text-slate-500',
        productPrice: 'text-emerald-600 font-black',
        productCategoryBadge: 'bg-white/95 text-slate-800 border-slate-200/80',
        primaryBtn: 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold shadow-xs',
        secondaryBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 font-bold',
        cartBadge: 'bg-emerald-900 text-white',
        // Cart drawer
        cartHeaderBg: 'bg-slate-50/80 border-b border-slate-200 text-slate-900',
        cartDrawerBg: 'bg-white border-l border-slate-200 text-slate-900',
        cartItemBg: 'bg-slate-50 border-slate-200/90 text-slate-900',
        cartCheckoutBtn: 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold shadow-lg shadow-emerald-500/25',
        // Badges
        officialBadgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300 shadow-2xs',
        themeAccentName: 'Clásico Moderno (Azul & Esmeralda)',
      };
  }
};

// Default delivery partners for Ecuador / Latin America
const DEFAULT_COURIERS: CourierPartner[] = [
  {
    id: 'servientrega',
    name: 'Servientrega',
    logoUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=160&auto=format&fit=crop&q=80',
    quoteUrl: 'https://www.servientrega.com.ec/',
    active: true,
  },
  {
    id: 'laarcourier',
    name: 'LaarCourier',
    logoUrl: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=160&auto=format&fit=crop&q=80',
    quoteUrl: 'https://laarcourier.com/',
    active: true,
  },
  {
    id: 'urbano',
    name: 'Urbano Express',
    logoUrl: 'https://images.unsplash.com/photo-1616401784845-180882ba9ba8?w=160&auto=format&fit=crop&q=80',
    quoteUrl: 'https://www.urbano.com.ec/',
    active: true,
  },
  {
    id: 'tramaco',
    name: 'Tramaco Express',
    logoUrl: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=160&auto=format&fit=crop&q=80',
    quoteUrl: 'https://www.tramaco.com.ec/',
    active: true,
  },
  {
    id: 'motorizado',
    name: 'Delivery Motorizado / Express',
    logoUrl: 'https://images.unsplash.com/photo-1526367790999-0150786686a2?w=160&auto=format&fit=crop&q=80',
    active: true,
  },
];

// Default payment methods for Ecuador
const DEFAULT_PAYMENTS: PaymentMethodPartner[] = [
  {
    id: 'banco-pichincha',
    name: 'Banco Pichincha / Mi Vecino',
    details: 'Transferencia directa o depósito a Cta. de Ahorros',
    logoUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=160&auto=format&fit=crop&q=80',
    active: true,
  },
  {
    id: 'banco-guayaquil',
    name: 'Banco Guayaquil / Banco del Barrio',
    details: 'Transferencia nacional o depósito',
    logoUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=160&auto=format&fit=crop&q=80',
    active: true,
  },
  {
    id: 'deuna',
    name: 'Deuna / Pago Móvil QR',
    details: 'Cobro rápido e inmediato escaneando QR o con celular',
    logoUrl: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=160&auto=format&fit=crop&q=80',
    active: true,
  },
  {
    id: 'zelle',
    name: 'Zelle (USD)',
    details: 'Pagos directos en dólares',
    logoUrl: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=160&auto=format&fit=crop&q=80',
    active: true,
  },
  {
    id: 'tarjeta',
    name: 'Tarjetas Visa & Mastercard',
    details: 'Débito o crédito con link de pago seguro',
    logoUrl: 'https://images.unsplash.com/photo-1556742049-0a67c557689c?w=160&auto=format&fit=crop&q=80',
    active: true,
  },
  {
    id: 'efectivo',
    name: 'Efectivo / Contraentrega',
    details: 'Paga al momento de recibir tu paquete en tu domicilio',
    logoUrl: 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=160&auto=format&fit=crop&q=80',
    active: true,
  },
];

const parseCouriers = (raw: any): CourierPartner[] => {
  if (!raw) return DEFAULT_COURIERS;
  if (Array.isArray(raw) && raw.length > 0) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }
  return DEFAULT_COURIERS;
};

const parsePayments = (raw: any): PaymentMethodPartner[] => {
  if (!raw) return DEFAULT_PAYMENTS;
  if (Array.isArray(raw) && raw.length > 0) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }
  return DEFAULT_PAYMENTS;
};

// Process and optimize uploaded image files for crispness and speed
const processLogoImageFile = (file: File, maxDim = 400): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('El archivo seleccionado no es una imagen válida'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png', 0.92);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

interface OnlineStoreViewProps {
  products: InventoryItem[];
  orders: CustomerOrder[];
  storeConfig: StoreConfig;
  currentSubTab?: 'catalog' | 'orders' | 'settings';
  onSubTabChange?: (subTab: 'catalog' | 'orders' | 'settings') => void;
  onRefreshProducts: () => void;
  onUpdateStoreConfig: (config: Partial<StoreConfig>) => Promise<boolean>;
  onCreateOrder: (orderData: any) => Promise<{ success: boolean; order?: CustomerOrder; orderNumber?: string }>;
  onUpdateOrder?: (orderId: number, orderData: Partial<CustomerOrder> & { purchaseAction?: 'cancel' | 'keep' }) => Promise<boolean>;
  onUpdateOrderStatus: (
    orderId: number,
    status: string,
    paymentVoucher?: string,
    notes?: string,
    trackingNumber?: string,
    trackingCarrier?: string,
    trackingNotes?: string,
    purchaseAction?: 'cancel' | 'keep',
    paymentMethod?: string,
    bankOrAccount?: string,
    customerCi?: string
  ) => Promise<boolean>;
  onDeleteOrder: (orderId: number, purchaseAction?: 'cancel' | 'keep') => Promise<boolean>;
  purchases?: any[];
  onOpenConfig?: () => void;
  isSyncing?: boolean;
  currency?: string;
  isCustomerOnly?: boolean;
  onExitCustomerMode?: () => void;
  onGenerateSupplierPurchase?: (order: CustomerOrder) => Promise<void> | void;
  onViewLinkedPurchase?: (purchaseIdOrFilter: number | string, orderNumber?: string) => void;
  filterOrderNumber?: string | null;
  onClearFilterOrderNumber?: () => void;
}

export const OnlineStoreView: React.FC<OnlineStoreViewProps> = ({
  products,
  orders,
  storeConfig,
  currentSubTab,
  onSubTabChange,
  onRefreshProducts,
  onUpdateStoreConfig,
  onCreateOrder,
  onUpdateOrder,
  onUpdateOrderStatus,
  onDeleteOrder,
  purchases = [],
  onOpenConfig,
  isSyncing = false,
  currency = 'USD',
  isCustomerOnly = false,
  onExitCustomerMode,
  onGenerateSupplierPurchase,
  onViewLinkedPurchase,
  filterOrderNumber,
  onClearFilterOrderNumber,
}) => {
  const { isAdmin, authFetch } = useAuth();

  // Store navigation sub-views (persisted across sessions)
  const [storeTab, setStoreTab] = useState<'catalog' | 'orders' | 'settings'>(() => {
    if (isCustomerOnly) return 'catalog';
    if (currentSubTab) return currentSubTab;
    if (typeof window !== 'undefined') {
      try {
        const saved = safeLocalStorage.getItem('comerxia_store_subtab');
        if (saved === 'catalog' || saved === 'orders' || (saved === 'settings' && isAdmin)) {
          return saved;
        }
      } catch {}
    }
    return 'catalog';
  });

  // Force catalog in customer view
  useEffect(() => {
    if (isCustomerOnly && storeTab !== 'catalog') {
      setStoreTab('catalog');
    }
  }, [isCustomerOnly, storeTab]);

  // Sync with currentSubTab prop if provided
  useEffect(() => {
    if (currentSubTab && currentSubTab !== storeTab && !isCustomerOnly) {
      setStoreTab(currentSubTab);
    }
  }, [currentSubTab, isCustomerOnly]);

  // Handler to switch subtab and notify parent
  const handleSwitchTab = (tab: 'catalog' | 'orders' | 'settings') => {
    setStoreTab(tab);
    if (onSubTabChange) {
      onSubTabChange(tab);
    }
    if (typeof window !== 'undefined' && !isCustomerOnly) {
      try {
        safeLocalStorage.setItem('comerxia_store_subtab', tab);
      } catch {}
    }
  };

  // If user is not admin and tries to view settings, force catalog
  useEffect(() => {
    if (!isAdmin && storeTab === 'settings') {
      handleSwitchTab('catalog');
    }
  }, [isAdmin, storeTab]);

  // Persist storeTab changes in localStorage (unless in forced customer-only mode)
  useEffect(() => {
    if (typeof window !== 'undefined' && !isCustomerOnly) {
      try {
        safeLocalStorage.setItem('comerxia_store_subtab', storeTab);
      } catch {}
    }
  }, [storeTab, isCustomerOnly]);
  const [isCustomerMode, setIsCustomerMode] = useState<boolean>(isCustomerOnly);

  // Sync if isCustomerOnly changes
  React.useEffect(() => {
    if (isCustomerOnly) {
      setIsCustomerMode(true);
      setStoreTab('catalog');
    }
  }, [isCustomerOnly]);

  const isCustomerView = isCustomerOnly || isCustomerMode;

  // Dynamic browser window title:
  // - Customer view (public or preview) -> storeConfig.storeName (from settings)
  // - Administration area -> "Comerxia System"
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (isCustomerView) {
        document.title = storeConfig?.storeName?.trim() || 'Comerxia Store';
      } else {
        document.title = 'Comerxia System';
      }
    }
  }, [isCustomerView, storeConfig?.storeName]);

  // Track store visit when customer opens the store
  useEffect(() => {
    if (isCustomerView) {
      trackStoreVisit();
    }
  }, [isCustomerView]);

  // Search & Filter state for catalog
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [showOffersOnly, setShowOffersOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'featured' | 'price_asc' | 'price_desc' | 'name'>('featured');

  // Search & Filter state for orders
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');
  const [orderViewMode, setOrderViewMode] = useState<'cards' | 'table'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = safeLocalStorage.getItem('comerxia_orders_view_mode');
        if (saved === 'cards' || saved === 'table') {
          return saved;
        }
      } catch {}
    }
    return 'table';
  });

  // Keep orderViewMode persisted whenever it changes
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        safeLocalStorage.setItem('comerxia_orders_view_mode', orderViewMode);
      } catch {}
    }
  }, [orderViewMode]);

  // Sincronizar filtro exclusivo cuando se presiona "Ver Venta" desde el módulo de Compras
  React.useEffect(() => {
    if (filterOrderNumber) {
      setOrderSearchQuery(String(filterOrderNumber));
      setOrderStatusFilter('all');
      setOrderDateRangeFilter('all');
      setStoreTab('orders');
      if (onSubTabChange) onSubTabChange('orders');
    }
  }, [filterOrderNumber, onSubTabChange]);

  const [orderDateRangeFilter, setOrderDateRangeFilter] = useState<'all' | 'today' | 'month' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Delete Order Confirmation Modal state
  const [orderToDelete, setOrderToDelete] = useState<CustomerOrder | null>(null);
  const [isDeletingOrder, setIsDeletingOrder] = useState<boolean>(false);

  // Delivery Verification & Confirmation Modal state
  const [orderToDeliver, setOrderToDeliver] = useState<CustomerOrder | null>(null);
  const [deliveryNoteInput, setDeliveryNoteInput] = useState<string>('');
  const [isConfirmingDelivery, setIsConfirmingDelivery] = useState<boolean>(false);

  // Cancel Order with Linked Purchase Modal state
  const [orderToCancel, setOrderToCancel] = useState<CustomerOrder | null>(null);
  const [isCancellingOrder, setIsCancellingOrder] = useState<boolean>(false);

  // Order Confirmation with Payment Voucher Modal state
  const [orderToConfirm, setOrderToConfirm] = useState<CustomerOrder | null>(null);
  const [confirmCustomerCi, setConfirmCustomerCi] = useState<string>('');
  const [confirmCustomerName, setConfirmCustomerName] = useState<string>('');
  const [confirmCustomerPhone, setConfirmCustomerPhone] = useState<string>('');
  const [confirmCustomerEmail, setConfirmCustomerEmail] = useState<string>('');
  const [confirmCustomerGeneralAddress, setConfirmCustomerGeneralAddress] = useState<string>('');
  const [confirmDeliveryType, setConfirmDeliveryType] = useState<'pickup' | 'shipping'>('shipping');
  const [confirmShippingAddress, setConfirmShippingAddress] = useState<string>('');
  const [confirmTrackingCarrier, setConfirmTrackingCarrier] = useState<string>('');
  const [confirmShippingCost, setConfirmShippingCost] = useState<string>('0');
  const [confirmPaymentMethod, setConfirmPaymentMethod] = useState<string>('Banco Pichincha');
  const [confirmBankOrAccount, setConfirmBankOrAccount] = useState<string>('Banco Pichincha');
  const [voucherInput, setVoucherInput] = useState<string>('');
  const [voucherNotesInput, setVoucherNotesInput] = useState<string>('');
  const [isConfirmingOrder, setIsConfirmingOrder] = useState<boolean>(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [manageOrderTab, setManageOrderTab] = useState<'all' | 'items_delivery' | 'payment_confirm'>('all');

  // ORDER SHIPPING & TRACKING MODAL STATE (Unified with ManageShippingGuideModal)
  const [orderToShip, setOrderToShip] = useState<CustomerOrder | null>(null);
  const [shipTrackingCarrier, setShipTrackingCarrier] = useState<string>('Servientrega');
  const [shipTrackingNumber, setShipTrackingNumber] = useState<string>('');
  const [shipTrackingNotes, setShipTrackingNotes] = useState<string>('');
  const [shipNotifyWhatsApp, setShipNotifyWhatsApp] = useState<boolean>(true);
  const [isShippingOrder, setIsShippingOrder] = useState<boolean>(false);
  const [shipError, setShipError] = useState<string | null>(null);

  // Partial Delivery modal state & handlers
  const [orderForPartialDelivery, setOrderForPartialDelivery] = useState<CustomerOrder | null>(null);

  const handleCompleteRemainingDelivery = async (order: CustomerOrder) => {
    const isPickup = isPickupDeliveryOrder(order);
    if (!isPickup && order.status !== 'shipped') {
      showToast('⛔ Bloqueo ERP: Un pedido con envío debe estar en estado ENVIADO antes de registrar la entrega final.');
      return;
    }
    try {
      const res = await (authFetch ? authFetch(`/api/orders/${order.id}/complete-delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }) : fetch(`/api/orders/${order.id}/complete-delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }));

      if (res.ok) {
        const data = await res.json();
        showToast(`✓ Saldo restante entregado con éxito (${data.remainingDeliveredCount || 'todas las'} un.). ¡Pedido 100% completado!`);
        onRefreshProducts();
      } else {
        const err = await res.json().catch(() => null);
        showToast(err?.error || 'Error al completar la entrega');
      }
    } catch (e) {
      showToast('Error de conexión al completar la entrega');
    }
  };

  const handleConfirmPartialDelivery = async (
    orderId: number,
    deliveries: Array<{ id?: number; inventoryItemId?: number; sku?: string; deliverQuantity: number }>,
    options: { notes?: string; deductStock?: boolean; sendWhatsApp?: boolean }
  ) => {
    const res = await (authFetch ? authFetch(`/api/orders/${orderId}/partial-delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deliveries,
        notes: options.notes,
        deductStock: options.deductStock,
      }),
    }) : fetch(`/api/orders/${orderId}/partial-delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deliveries,
        notes: options.notes,
        deductStock: options.deductStock,
      }),
    }));

    if (res.ok) {
      const data = await res.json();
      showToast(`✓ Despacho parcial registrado (${data.newlyDeliveredCount} un. entregadas). Total: ${data.totalDeliveredUnits}/${data.totalOrderUnits} un.`);
      setOrderForPartialDelivery(null);
      onRefreshProducts();
    } else {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || 'Error al registrar la entrega parcial');
    }
  };

  // Unified save handler for Shipping Guide, Tracking, CI & Address data
  const handleSaveShippingGuideData = async (
    orderId: number | string,
    data: {
      customerAddress: string;
      customerName?: string;
      customerCi?: string;
      trackingCarrier?: string;
      trackingNumber?: string;
      trackingNotes?: string;
      status?: CustomerOrder['status'];
    }
  ) => {
    const target = orders.find((o) => String(o.id) === String(orderId));
    if (target && (data.status === 'shipped' || data.trackingNumber)) {
      const guideVal = canGenerateShippingGuide(target, products, purchases);
      if (!guideVal.canGenerate) {
        showToast(`⛔ ${guideVal.reason}`);
        throw new Error(guideVal.reason || 'No se puede generar la guía de envío');
      }
    }

    // Strictly preserve existing client/fiscal address so it is NEVER overwritten by shipping guide generation
    const preservedClientAddress = (target as any)?.clientAddress || undefined;

    if (onUpdateOrder) {
      return await onUpdateOrder(Number(orderId), {
        ...data,
        clientAddress: preservedClientAddress,
        shippingAddress: data.customerAddress,
      });
    } else {
      if (!target) return;
      return await onUpdateOrderStatus(
        Number(orderId),
        data.status || target.status,
        target.paymentVoucher || undefined,
        target.notes || undefined,
        data.trackingNumber || undefined,
        data.trackingCarrier || undefined,
        data.trackingNotes || undefined
      );
    }
  };

  // EDIT ORDER MODAL STATE
  const [orderToEdit, setOrderToEdit] = useState<CustomerOrder | null>(null);
  const [editCustomerName, setEditCustomerName] = useState<string>('');
  const [editCustomerCi, setEditCustomerCi] = useState<string>('');
  const [editCustomerPhone, setEditCustomerPhone] = useState<string>('');
  const [editCustomerEmail, setEditCustomerEmail] = useState<string>('');
  const [editCustomerGeneralAddress, setEditCustomerGeneralAddress] = useState<string>('');
  const [editShippingAddress, setEditShippingAddress] = useState<string>('');
  const [editDeliveryType, setEditDeliveryType] = useState<'shipping' | 'pickup'>('shipping');
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>('whatsapp');
  const [editStatus, setEditStatus] = useState<CustomerOrder['status']>('pending');
  const [editPaymentVoucher, setEditPaymentVoucher] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editShippingCost, setEditShippingCost] = useState<string>('0');
  const [editTrackingCarrier, setEditTrackingCarrier] = useState<string>('');
  const [editTrackingNumber, setEditTrackingNumber] = useState<string>('');
  const [editTrackingNotes, setEditTrackingNotes] = useState<string>('');
  const [editItems, setEditItems] = useState<Array<{
    id?: number;
    inventoryItemId?: number;
    name: string;
    sku?: string;
    barcode?: string | null;
    costPrice?: string | number;
    supplierName?: string;
    salePrice: number;
    quantity: number;
    imageUrl?: string | null;
  }>>([]);
  const [editProductSearch, setEditProductSearch] = useState<string>('');
  const [isSavingEditOrder, setIsSavingEditOrder] = useState<boolean>(false);
  const [editCustomItemName, setEditCustomItemName] = useState<string>('');
  const [editCustomItemPrice, setEditCustomItemPrice] = useState<string>('');
  const [isAddingCustomEditItem, setIsAddingCustomEditItem] = useState<boolean>(false);

  // QUICK SHIPPING COST & PAYMENT DETAILS MODAL STATE
  const [orderToSetShipping, setOrderToSetShipping] = useState<CustomerOrder | null>(null);
  const [orderForPendingShipping, setOrderForPendingShipping] = useState<CustomerOrder | null>(null);
  const [quickShippingCostInput, setQuickShippingCostInput] = useState<string>('0');
  const [quickShippingCarrierInput, setQuickShippingCarrierInput] = useState<string>('');
  const [selectedQuickPaymentPartnerId, setSelectedQuickPaymentPartnerId] = useState<string>('');
  const [quickShippingPaymentNote, setQuickShippingPaymentNote] = useState<string>('');
  const [isSavingQuickShipping, setIsSavingQuickShipping] = useState<boolean>(false);

  // SHIPPING TICKET PRINT MODAL STATE
  const [orderToPrintShipping, setOrderToPrintShipping] = useState<CustomerOrder | null>(null);

  // REQUEST EXACT SHIPPING DATA VIA WHATSAPP & UPDATE ADDRESS MODAL STATE
  const [orderToRequestShippingData, setOrderToRequestShippingData] = useState<CustomerOrder | null>(null);

  const handleSaveUpdatedShippingAddress = async (
    orderId: number | string,
    updatedData: { customerAddress: string; customerName?: string }
  ) => {
    if (onUpdateOrder) {
      return await onUpdateOrder(Number(orderId), updatedData);
    } else {
      const target = orders.find((o) => String(o.id) === String(orderId));
      if (!target) return false;
      return await onUpdateOrderStatus(
        Number(orderId),
        target.status,
        target.paymentVoucher || undefined,
        target.notes || undefined,
        target.trackingNumber || undefined,
        target.trackingCarrier || undefined,
        target.trackingNotes || undefined
      );
    }
  };

  // MANUAL ORDER CREATION MODAL STATE
  const [isManualOrderModalOpen, setIsManualOrderModalOpen] = useState<boolean>(false);
  const [manualCustomerCi, setManualCustomerCi] = useState<string>('');
  const [manualCustomerName, setManualCustomerName] = useState<string>('');
  const [manualCustomerGeneralAddress, setManualCustomerGeneralAddress] = useState<string>('');
  const [manualCustomerPhone, setManualCustomerPhone] = useState<string>('');
  const [manualCustomerEmail, setManualCustomerEmail] = useState<string>('');
  const [manualDeliveryType, setManualDeliveryType] = useState<'shipping' | 'pickup'>('pickup');
  const [manualShippingAddress, setManualShippingAddress] = useState<string>('');
  const [manualTrackingCarrier, setManualTrackingCarrier] = useState<string>('Servientrega');
  const [manualShippingCost, setManualShippingCost] = useState<string>('0');
  const [manualAddressMode, setManualAddressMode] = useState<'structured' | 'direct'>('structured');
  const [manualProvince, setManualProvince] = useState<string>('');
  const [manualCanton, setManualCanton] = useState<string>('');
  const [manualParish, setManualParish] = useState<string>('');
  const [manualExactAddress, setManualExactAddress] = useState<string>('');
  const [manualReference, setManualReference] = useState<string>('');
  const [manualPaymentMethod, setManualPaymentMethod] = useState<string>('whatsapp');
  const [manualPaymentVoucher, setManualPaymentVoucher] = useState<string>('');
  const [manualNotes, setManualNotes] = useState<string>('');
  const [manualStatus, setManualStatus] = useState<CustomerOrder['status']>('pending');
  const [manualItems, setManualItems] = useState<Array<{
    id?: number;
    name: string;
    sku?: string;
    barcode?: string | null;
    salePrice: number;
    quantity: number;
    imageUrl?: string | null;
  }>>([]);
  const [manualProductSearch, setManualProductSearch] = useState<string>('');
  const [isSubmittingManualOrder, setIsSubmittingManualOrder] = useState<boolean>(false);
  const [manualCustomItemName, setManualCustomItemName] = useState<string>('');
  const [manualCustomItemPrice, setManualCustomItemPrice] = useState<string>('');
  const [isAddingCustomManualItem, setIsAddingCustomManualItem] = useState<boolean>(false);
  const [manualAutoCreatePurchase, setManualAutoCreatePurchase] = useState<boolean>(true);

  // CRM Customers list for real-time autocomplete & fast auto-fill
  const [dbCustomers, setDbCustomers] = useState<any[]>([]);
  const [matchedCustomerInfo, setMatchedCustomerInfo] = useState<{
    ci: string;
    name: string;
    phone: string;
    address: string;
    source?: string;
  } | null>(null);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState<boolean>(false);

  // Fetch CRM customers whenever manual order modal or edit modal is active
  useEffect(() => {
    if (isManualOrderModalOpen || orderToEdit) {
      let isMounted = true;
      const loadCustomers = async () => {
        try {
          const res = await authFetch('/api/customers');
          if (res.ok) {
            const data = await res.json();
            if (isMounted && Array.isArray(data)) {
              setDbCustomers(data);
            }
          }
        } catch (err) {
          console.warn('Error loading customers for autocomplete:', err);
        }
      };
      loadCustomers();
      return () => {
        isMounted = false;
      };
    }
  }, [isManualOrderModalOpen, orderToEdit, authFetch]);

  // Combined customer database from CRM and historical orders
  const allKnownCustomers = useMemo(() => {
    const map = new Map<string, { ci: string; name: string; phone: string; email?: string; address: string; shippingAddress?: string; source?: string }>();

    // 1. From database customers table
    if (Array.isArray(dbCustomers)) {
      dbCustomers.forEach((c) => {
        const ciClean = (c.ci || '').trim();
        if (ciClean) {
          const rawAddress = (c.address || '').trim();
          const cleanFiscal = !isConcatenatedShippingAddress(rawAddress)
            ? rawAddress
            : (parseCustomerShippingData(rawAddress).exactAddress || '');

          map.set(ciClean.toLowerCase(), {
            ci: ciClean,
            name: c.fullName || c.name || '',
            phone: c.phone || '',
            email: c.email || undefined,
            address: cleanFiscal,
            shippingAddress: c.fullAddress || c.exactAddress || '',
            source: 'CRM de Clientes',
          });
        }
      });
    }

    // 2. From historical orders in memory
    if (Array.isArray(orders)) {
      orders.forEach((o) => {
        const ci = getCustomerCi(o);
        if (ci && ci.trim()) {
          const ciKey = ci.trim().toLowerCase();
          const existing = map.get(ciKey);
          const orderEmail = (o as any).customerEmail || (o as any).email || undefined;
          const orderClientAddress = ((o as any).clientAddress || '').trim();
          const cleanOrderFiscal = !isConcatenatedShippingAddress(orderClientAddress) ? orderClientAddress : '';
          const orderShippingAddress = (o as any).shippingAddress || stripCiFromAddress(o.customerAddress) || '';

          if (!existing) {
            map.set(ciKey, {
              ci: ci.trim(),
              name: o.customerName || '',
              phone: o.customerPhone || '',
              email: orderEmail,
              address: cleanOrderFiscal,
              shippingAddress: orderShippingAddress,
              source: `Pedido previo #${o.orderNumber || ''}`,
            });
          } else {
            if (!existing.name && o.customerName) existing.name = o.customerName;
            if (!existing.phone && o.customerPhone) existing.phone = o.customerPhone;
            if (!existing.email && orderEmail) existing.email = orderEmail;
            if (!existing.address && cleanOrderFiscal) existing.address = cleanOrderFiscal;
            if (!existing.shippingAddress && orderShippingAddress) existing.shippingAddress = orderShippingAddress;
          }
        }
      });
    }

    return Array.from(map.values());
  }, [dbCustomers, orders]);

  // Matching customer suggestions as user types in CI field
  const matchingCustomerSuggestions = useMemo(() => {
    const clean = manualCustomerCi.trim().toLowerCase();
    const cleanDigits = clean.replace(/\D/g, '');
    if (!clean || clean.length < 2) return [];

    return allKnownCustomers.filter((c) => {
      const cCi = (c.ci || '').toLowerCase();
      const cDigits = cCi.replace(/\D/g, '');
      const cName = (c.name || '').toLowerCase();
      return (
        cCi.includes(clean) ||
        (cleanDigits.length >= 2 && cDigits.includes(cleanDigits)) ||
        cName.includes(clean)
      );
    }).slice(0, 5);
  }, [allKnownCustomers, manualCustomerCi]);

  // Handler for typing Cédula / CI in manual order creation modal
  const handleManualCustomerCiChange = (inputVal: string) => {
    setManualCustomerCi(inputVal);
    const cleanVal = inputVal.trim().toLowerCase();
    const cleanDigits = cleanVal.replace(/\D/g, '');

    if (!cleanVal) {
      setMatchedCustomerInfo(null);
      setShowCustomerSuggestions(false);
      return;
    }

    // Check exact or high-confidence match
    const exactMatch = allKnownCustomers.find((c) => {
      const cCi = (c.ci || '').toLowerCase();
      const cDigits = cCi.replace(/\D/g, '');
      return (
        cCi === cleanVal ||
        (cleanDigits.length >= 8 && cDigits === cleanDigits)
      );
    });

    if (exactMatch && (cleanVal.length >= 8 || cleanDigits.length >= 8)) {
      if (exactMatch.name) setManualCustomerName(exactMatch.name);
      if (exactMatch.phone) setManualCustomerPhone(exactMatch.phone);
      if (exactMatch.email) setManualCustomerEmail(exactMatch.email);
      if (exactMatch.address) {
        setManualCustomerGeneralAddress(exactMatch.address);
      }
      const shipDest = exactMatch.shippingAddress || exactMatch.address;
      if (shipDest) {
        setManualShippingAddress(shipDest);
        const provMatch = shipDest.match(/Prov(?:incia)?[:\s]+([^|,;]+)/i);
        if (provMatch) setManualProvince(provMatch[1].trim());
        const cantonMatch = shipDest.match(/Cant[oó]n[:\s]+([^|,;]+)/i);
        if (cantonMatch) setManualCanton(cantonMatch[1].trim());
        const parishMatch = shipDest.match(/Parr(?:oquia)?[:\s]+([^|,;]+)/i);
        if (parishMatch) setManualParish(parishMatch[1].trim());
        const dirMatch = shipDest.match(/Dir(?:ecci[oó]n)?[:\s]+([^|,;]+)/i);
        if (dirMatch) setManualExactAddress(dirMatch[1].trim());
        const refMatch = shipDest.match(/Ref(?:erencia)?[:\s]+([^|,;]+)/i);
        if (refMatch) setManualReference(refMatch[1].trim());
      }
      setMatchedCustomerInfo(exactMatch);
      setShowCustomerSuggestions(false);
    } else {
      setMatchedCustomerInfo(null);
      if (cleanVal.length >= 2) {
        setShowCustomerSuggestions(true);
      } else {
        setShowCustomerSuggestions(false);
      }
    }
  };

  // Helper when clicking a customer from autocomplete suggestions
  const handleSelectCustomerForManualOrder = (cust: { ci: string; name: string; phone: string; email?: string; address: string; shippingAddress?: string; source?: string }) => {
    setManualCustomerCi(cust.ci);
    if (cust.name) setManualCustomerName(cust.name);
    if (cust.phone) setManualCustomerPhone(cust.phone);
    if (cust.email) setManualCustomerEmail(cust.email);
    if (cust.address) {
      setManualCustomerGeneralAddress(cust.address);
    }
    const shipDest = cust.shippingAddress || cust.address;
    if (shipDest) {
      setManualShippingAddress(shipDest);
      const provMatch = shipDest.match(/Prov(?:incia)?[:\s]+([^|,;]+)/i);
      if (provMatch) setManualProvince(provMatch[1].trim());
      const cantonMatch = shipDest.match(/Cant[oó]n[:\s]+([^|,;]+)/i);
      if (cantonMatch) setManualCanton(cantonMatch[1].trim());
      const parishMatch = shipDest.match(/Parr(?:oquia)?[:\s]+([^|,;]+)/i);
      if (parishMatch) setManualParish(parishMatch[1].trim());
      const dirMatch = shipDest.match(/Dir(?:ecci[oó]n)?[:\s]+([^|,;]+)/i);
      if (dirMatch) setManualExactAddress(dirMatch[1].trim());
      const refMatch = shipDest.match(/Ref(?:erencia)?[:\s]+([^|,;]+)/i);
      if (refMatch) setManualReference(refMatch[1].trim());
    }
    setMatchedCustomerInfo(cust);
    setShowCustomerSuggestions(false);
    showToast(`✓ Datos del cliente ${cust.name || cust.ci} colocados automáticamente`);
  };

  // Share Store Modal
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);

  // Shopping Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [cartStep, setCartStep] = useState<'cart' | 'checkout' | 'success'>('cart');
  const [showOptionalDetails, setShowOptionalDetails] = useState<boolean>(false);
  const [lastPlacedOrder, setLastPlacedOrder] = useState<any | null>(null);
  const [buyerVoucherInput, setBuyerVoucherInput] = useState('');
  const [isBuyerVoucherSubmitting, setIsBuyerVoucherSubmitting] = useState(false);
  const [isBuyerOrderConfirmed, setIsBuyerOrderConfirmed] = useState(false);

  // Customer Checkout Form fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [deliveryType, setDeliveryType] = useState<'shipping' | 'pickup'>('shipping');
  const [paymentMethod, setPaymentMethod] = useState<string>('whatsapp');
  const [orderNotes, setOrderNotes] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Helper to open direct WhatsApp chat with customer without pre-filled message
  const handleOpenDirectCustomerWhatsApp = (ord: any) => {
    const norm = normalizeEcuadorPhone(ord.customerPhone);
    if (!norm.whatsappDigits || !norm.isValid) {
      showToast('⚠️ Este pedido no tiene registrado un número de WhatsApp válido del cliente. Puedes ingresarlo editando el pedido.');
      handleOpenEditOrder(ord);
      return;
    }
    const url = buildWhatsAppLink(norm.whatsappDigits);
    window.open(url, '_blank');
  };

  // Helper to open direct WhatsApp with customer with validation & full payment details
  const handleOpenCustomerWhatsApp = (ord: any) => {
    const norm = normalizeEcuadorPhone(ord.customerPhone);
    if (!norm.whatsappDigits || !norm.isValid) {
      showToast('⚠️ Este pedido no tiene registrado un número de WhatsApp válido del cliente. Puedes ingresarlo editando el pedido.');
      handleOpenEditOrder(ord);
      return;
    }
    const activePartners = paymentPartners.filter((p) => p.active !== false);
    const matchedPartner = activePartners.find(
      (p) =>
        p.id === ord.paymentMethod ||
        p.name.toLowerCase() === (ord.paymentMethod || '').toLowerCase() ||
        (ord.paymentMethod && p.name.toLowerCase().includes(ord.paymentMethod.toLowerCase())) ||
        (ord.paymentMethod && ord.paymentMethod.toLowerCase().includes(p.name.toLowerCase()))
    );
    const partnerName = matchedPartner ? matchedPartner.name : (ord.paymentMethod || 'Coordinar con la tienda');
    const isPickup = (ord.customerAddress || '').toLowerCase().includes('retiro');

    let msg = `¡Hola *${ord.customerName || 'estimado cliente'}*! 👋 Me contacto de *${storeConfig.storeName || 'la tienda'}* con respecto a tu *Pedido #${ord.orderNumber}*:\n\n`;
    msg += `💰 *Total del Pedido:* $${Number(ord.totalAmount || 0).toFixed(2)} ${currency}\n`;
    msg += `📍 *Modalidad:* ${isPickup ? 'Retiro en Local' : `Envío: ${ord.customerAddress || 'A convenir'}`}\n`;
    msg += `💳 *Método de Pago:* ${partnerName}\n`;
    if (matchedPartner?.details) {
      msg += `📝 *Datos de la Cuenta / Pago:*\n${matchedPartner.details}\n`;
    }
    if (ord.paymentVoucher) {
      msg += `🧾 *Comprobante Registrado:* ${ord.paymentVoucher}\n`;
    }
    if (ord.trackingNumber || ord.trackingCarrier) {
      msg += `🚚 *Guía de Envío (${ord.trackingCarrier || 'Courier'}):* #${ord.trackingNumber || 'N/A'}\n`;
    }
    msg += `\n¿En qué podemos ayudarte o coordinar el despacho de tu orden? Quedamos atentos. ¡Muchas gracias!`;

    const url = buildWhatsAppLink(norm.whatsappDigits, msg);
    window.open(url, '_blank');
  };

  // Product Quick Detail Modal & Full Product Page
  const [quickViewProduct, setQuickViewProduct] = useState<InventoryItem | null>(null);
  const [activeImageIdx, setActiveImageIdx] = useState<number>(0);
  const [activeMediaMode, setActiveMediaMode] = useState<'photo' | 'video'>('photo');
  const savedCatalogScrollYRef = useRef<number>(0);
  const lastOpenedProductIdRef = useRef<number | string | null>(null);
  const adminDismissedProductModalRef = useRef<boolean>(false);
  const hasInitializedUrlProductRef = useRef<boolean>(false);

  // Share Notification Feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filter & Category Sheet Open State (Hides static bottom navigation bar when active)
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  // Store Settings Form State
  const [storeNameInput, setStoreNameInput] = useState(storeConfig.storeName || 'Comerxia Store');
  const [whatsappInput, setWhatsappInput] = useState(storeConfig.whatsappNumber || '');
  const [addressInput, setAddressInput] = useState(storeConfig.address || '');
  const [descriptionInput, setDescriptionInput] = useState(storeConfig.description || '');
  const [bannerTextInput, setBannerTextInput] = useState(storeConfig.bannerText || '');
  const [deliveryFeeInput, setDeliveryFeeInput] = useState(String(storeConfig.deliveryFee ?? '0'));
  const [showStockInput, setShowStockInput] = useState<boolean>(storeConfig.showStock !== false);
  
  // Store Logo, Delivery Partners, and Payment Logos State
  const [storeLogoInput, setStoreLogoInput] = useState<string | null>(storeConfig.logoUrl || null);
  const [storeLogoDesktopInput, setStoreLogoDesktopInput] = useState<string | null>(storeConfig.logoDesktopUrl || null);
  const [courierPartners, setCourierPartners] = useState<CourierPartner[]>(() => parseCouriers(storeConfig.courierLogos));
  const [paymentPartners, setPaymentPartners] = useState<PaymentMethodPartner[]>(() => parsePayments(storeConfig.paymentLogos));
  const [themeInput, setThemeInput] = useState<StoreTheme>(() => (storeConfig.theme as StoreTheme) || 'classic');
  const [themePalettes, setThemePalettes] = useState<Record<string, string[]>>(() => parseThemePalettes(storeConfig.themeColors));

  // Update a specific color in a theme's palette
  const handleUpdateThemeColor = (themeId: StoreTheme, colorIdx: number, newColor: string) => {
    setThemePalettes((prev) => {
      const current = prev[themeId] ? [...prev[themeId]] : [...(DEFAULT_THEME_COLORS[themeId] || DEFAULT_THEME_COLORS.classic)];
      current[colorIdx] = newColor;
      return {
        ...prev,
        [themeId]: current,
      };
    });
    setIsFormDirty(true);
  };

  // Reset a theme's colors to factory defaults
  const handleResetThemeColors = (themeId: StoreTheme) => {
    setThemePalettes((prev) => ({
      ...prev,
      [themeId]: [...(DEFAULT_THEME_COLORS[themeId] || DEFAULT_THEME_COLORS.classic)],
    }));
    setIsFormDirty(true);
    showToast(`✓ Colores de "${THEME_PRESETS.find((p) => p.id === themeId)?.name || themeId}" restaurados por defecto`);
  };

  // Logo Click Animation State (2 seconds duration)
  const [isLogoAnimating, setIsLogoAnimating] = useState<boolean>(false);
  const logoTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleLogoClick = () => {
    if (logoTimeoutRef.current) {
      clearTimeout(logoTimeoutRef.current);
    }
    setIsLogoAnimating(false);
    // Restart animation cycle
    requestAnimationFrame(() => {
      setIsLogoAnimating(true);
      logoTimeoutRef.current = setTimeout(() => {
        setIsLogoAnimating(false);
      }, 2000);
    });
  };

  // Cleanup logo timeout on unmount
  React.useEffect(() => {
    return () => {
      if (logoTimeoutRef.current) clearTimeout(logoTimeoutRef.current);
    };
  }, []);

  // State for creating new courier partner
  const [newCourierName, setNewCourierName] = useState('');
  const [newCourierLogo, setNewCourierLogo] = useState<string | null>(null);
  const [isAddingCourier, setIsAddingCourier] = useState(false);

  // State for creating new payment partner
  const [newPaymentName, setNewPaymentName] = useState('');
  const [newPaymentDetails, setNewPaymentDetails] = useState('');
  const [newPaymentLogo, setNewPaymentLogo] = useState<string | null>(null);
  const [isAddingPayment, setIsAddingPayment] = useState(false);

  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);

  // Customer View: Static bottom bar modals state
  const [isStorePaymentsModalOpen, setIsStorePaymentsModalOpen] = useState(false);
  const [isStoreShippingModalOpen, setIsStoreShippingModalOpen] = useState(false);

  // Sync inputs when storeConfig updates from backend ONLY IF the user hasn't edited the form locally
  React.useEffect(() => {
    if (storeConfig && !isFormDirty) {
      if (storeConfig.storeName !== undefined) setStoreNameInput(storeConfig.storeName || 'Comerxia Store');
      if (storeConfig.whatsappNumber !== undefined) setWhatsappInput(storeConfig.whatsappNumber || '');
      if (storeConfig.address !== undefined) setAddressInput(storeConfig.address || '');
      if (storeConfig.description !== undefined) setDescriptionInput(storeConfig.description || '');
      if (storeConfig.bannerText !== undefined) setBannerTextInput(storeConfig.bannerText || '');
      if (storeConfig.deliveryFee !== undefined) setDeliveryFeeInput(String(storeConfig.deliveryFee ?? '0'));
      if (storeConfig.showStock !== undefined) setShowStockInput(storeConfig.showStock !== false);
      if (storeConfig.logoUrl !== undefined) setStoreLogoInput(storeConfig.logoUrl || null);
      if (storeConfig.logoDesktopUrl !== undefined) setStoreLogoDesktopInput(storeConfig.logoDesktopUrl || null);
      if (storeConfig.courierLogos !== undefined) setCourierPartners(parseCouriers(storeConfig.courierLogos));
      if (storeConfig.paymentLogos !== undefined) setPaymentPartners(parsePayments(storeConfig.paymentLogos));
      if (storeConfig.theme !== undefined) setThemeInput((storeConfig.theme as StoreTheme) || 'classic');
      if (storeConfig.themeColors !== undefined) setThemePalettes(parseThemePalettes(storeConfig.themeColors));
    }
  }, [storeConfig, isFormDirty]);

  // Derived effective theme & active customized color palette
  const activeTheme: StoreTheme = (isFormDirty ? themeInput : (storeConfig.theme as StoreTheme)) || 'classic';
  const activePalette = themePalettes[activeTheme] || DEFAULT_THEME_COLORS[activeTheme] || DEFAULT_THEME_COLORS.classic;
  const themeStyles = useMemo(() => getThemeStyles(activeTheme, activePalette, isCustomerView), [activeTheme, activePalette, isCustomerView]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Safe Clipboard Copy Helper with Fallback for iframes
  const copyTextToClipboard = async (text: string, successMessage = '✓ Enlace copiado al portapapeles') => {
    let copied = false;
    if (typeof window !== 'undefined' && navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch (err) {
        console.warn('navigator.clipboard.writeText blocked or failed, using fallback', err);
      }
    }
    if (!copied && typeof document !== 'undefined') {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        textArea.setAttribute('readonly', '');
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (e) {
        console.error('execCommand copy failed', e);
      }
    }
    showToast(copied ? successMessage : '✓ Enlace listo para compartir');
  };

  // Build clean customer shareable URL (resolves public ais-pre- domain and custom domains)
  const customerStoreUrl = useMemo(() => {
    return getPublicStoreUrl(storeConfig.domain);
  }, [storeConfig.domain]);

  // Helper to build direct customer product URL
  const getProductShareUrl = (item: InventoryItem) => {
    return getPublicProductUrl(item.id, storeConfig.domain);
  };

  // Helper to share product directly via WhatsApp
  const handleShareProductWhatsApp = (item: InventoryItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const url = getProductShareUrl(item);
    const storeName = storeConfig.storeName || 'Nuestra Tienda Online';
    const text = `🛍️ ¡Hola! Te comparto este producto de *${storeName}*:\n\n✨ *${item.name}*\n🏷️ SKU: ${item.sku}\n💰 Precio: $${Number(item.salePrice).toFixed(2)} ${currency}\n${item.description ? `📝 ${item.description.slice(0, 90)}${item.description.length > 90 ? '...' : ''}\n` : ''}\n👉 Ver detalles y comprar aquí:\n${url}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  // Helper to copy direct product link
  const handleCopyProductLink = (item: InventoryItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const url = getProductShareUrl(item);
    copyTextToClipboard(url, `✓ Enlace de "${item.name}" copiado`);
  };

  // Open product detail page with URL synchronization, history pushState & saved catalog scroll
  const handleOpenProductDetail = useCallback((item: InventoryItem) => {
    const currentScrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    savedCatalogScrollYRef.current = currentScrollY;
    lastOpenedProductIdRef.current = item.id;
    adminDismissedProductModalRef.current = false;

    setQuickViewProduct(item);
    setActiveImageIdx(0);
    const photos = getProductPhotos(item);
    if (photos.length === 0 && item.videoUrl) {
      setActiveMediaMode('video');
    } else {
      setActiveMediaMode('photo');
    }

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
      const detailContainer = document.getElementById('store-product-detail-container');
      if (detailContainer) detailContainer.scrollTop = 0;
    }

    // Only push URL state for customer view!
    // In admin mode, opening the product preview modal must not pollute or change the admin browser URL.
    if (isCustomerView && typeof window !== 'undefined') {
      try {
        const currentDepth = (window.history.state?.isProductView && typeof window.history.state?.productViewDepth === 'number')
          ? window.history.state.productViewDepth
          : 0;
        const nextDepth = currentDepth + 1;

        const url = new URL(window.location.href);
        url.searchParams.set('p', String(item.id));
        window.history.pushState(
          { isProductView: true, productViewDepth: nextDepth, productId: item.id, scrollY: currentScrollY },
          '',
          url.toString()
        );
      } catch {
        // ignore
      }
    }
  }, [isCustomerView]);

  // Dedicated close handler for the admin product preview modal
  const handleCloseAdminProductModal = useCallback(() => {
    adminDismissedProductModalRef.current = true;
    setQuickViewProduct(null);
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        let changed = false;
        if (url.searchParams.has('p')) { url.searchParams.delete('p'); changed = true; }
        if (url.searchParams.has('producto')) { url.searchParams.delete('producto'); changed = true; }
        if (url.searchParams.has('product')) { url.searchParams.delete('product'); changed = true; }
        if (url.searchParams.has('sku')) { url.searchParams.delete('sku'); changed = true; }
        if (changed) {
          window.history.replaceState(window.history.state || {}, '', url.toString());
        }
      } catch {
        // ignore
      }
    }
  }, []);

  // Back to catalog with popstate or history.go & scroll restoration (Used in Customer View)
  const handleBackToCatalog = useCallback(() => {
    if (typeof window !== 'undefined' && isCustomerView) {
      const isProductState = Boolean(window.history.state?.isProductView);
      const depth = (isProductState && typeof window.history.state?.productViewDepth === 'number')
        ? window.history.state.productViewDepth
        : (isProductState ? 1 : 0);

      if (depth > 0) {
        setQuickViewProduct(null);
        try {
          const url = new URL(window.location.href);
          let changed = false;
          if (url.searchParams.has('p')) { url.searchParams.delete('p'); changed = true; }
          if (url.searchParams.has('producto')) { url.searchParams.delete('producto'); changed = true; }
          if (url.searchParams.has('product')) { url.searchParams.delete('product'); changed = true; }
          if (url.searchParams.has('sku')) { url.searchParams.delete('sku'); changed = true; }
          if (changed) {
            window.history.replaceState({}, '', url.toString());
          }
        } catch {
          // ignore
        }

        window.history.go(-depth);

        const restoreY = savedCatalogScrollYRef.current || 0;
        setTimeout(() => {
          window.scrollTo({ top: restoreY, behavior: 'instant' });
          if (lastOpenedProductIdRef.current) {
            const el = document.getElementById(`product-card-${lastOpenedProductIdRef.current}`);
            if (el) {
              const rect = el.getBoundingClientRect();
              if (rect.top < 0 || rect.bottom > window.innerHeight) {
                el.scrollIntoView({ block: 'center', behavior: 'instant' });
              }
            }
          }
        }, 40);
        return;
      }

      try {
        const url = new URL(window.location.href);
        let changed = false;
        if (url.searchParams.has('p')) { url.searchParams.delete('p'); changed = true; }
        if (url.searchParams.has('producto')) { url.searchParams.delete('producto'); changed = true; }
        if (url.searchParams.has('product')) { url.searchParams.delete('product'); changed = true; }
        if (url.searchParams.has('sku')) { url.searchParams.delete('sku'); changed = true; }
        if (changed) {
          window.history.replaceState({}, '', url.toString());
        }
      } catch {
        // ignore
      }
    }

    setQuickViewProduct(null);
    const restoreY = savedCatalogScrollYRef.current || 0;
    setTimeout(() => {
      window.scrollTo({ top: restoreY, behavior: 'instant' });
      if (lastOpenedProductIdRef.current) {
        const el = document.getElementById(`product-card-${lastOpenedProductIdRef.current}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top < 0 || rect.bottom > window.innerHeight) {
            el.scrollIntoView({ block: 'center', behavior: 'instant' });
          }
        }
      }
    }, 40);
  }, [isCustomerView]);

  // Static Bottom Bar: Home icon handler (Return to catalog or scroll to top)
  const handleBottomBarHome = useCallback(() => {
    setIsStorePaymentsModalOpen(false);
    setIsStoreShippingModalOpen(false);
    if (quickViewProduct) {
      handleBackToCatalog();
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [quickViewProduct, handleBackToCatalog]);

  // Listen to browser / mobile native Back and Forward buttons (popstate)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = (event: PopStateEvent) => {
      // In admin mode, do not reopen quickViewProduct if dismissed
      if (!isCustomerView && adminDismissedProductModalRef.current) {
        setQuickViewProduct(null);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const targetId = params.get('producto') || params.get('product') || params.get('p');
      const targetSku = params.get('sku');

      if (targetId) {
        const found = products.find((p) => String(p.id) === String(targetId));
        if (found) {
          setQuickViewProduct((prev) => (prev && String(prev.id) === String(found.id) ? prev : found));
          return;
        }
      } else if (targetSku) {
        const found = products.find((p) => String(p.sku).toLowerCase() === String(targetSku).toLowerCase());
        if (found) {
          setQuickViewProduct((prev) => (prev && String(prev.id) === String(found.id) ? prev : found));
          return;
        }
      }

      // No product in URL: user hit back button to return to catalog!
      setQuickViewProduct(null);

      const restoreY = event.state?.scrollY ?? savedCatalogScrollYRef.current ?? 0;
      setTimeout(() => {
        window.scrollTo({ top: restoreY, behavior: 'instant' });
        if (lastOpenedProductIdRef.current) {
          const el = document.getElementById(`product-card-${lastOpenedProductIdRef.current}`);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.top < 0 || rect.bottom > window.innerHeight) {
              el.scrollIntoView({ block: 'center', behavior: 'instant' });
            }
          }
        }
      }, 40);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [products, isCustomerView]);

  // Auto-detect and open product from URL param (?producto=... or ?product=... or ?sku=...)
  React.useEffect(() => {
    if (typeof window === 'undefined' || !products || products.length === 0) return;
    
    // In admin mode, if the admin previously closed the preview modal, never reopen it automatically
    if (!isCustomerView && adminDismissedProductModalRef.current) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const targetId = params.get('producto') || params.get('product') || params.get('p');
    const targetSku = params.get('sku');

    let found: InventoryItem | undefined;
    if (targetId) {
      found = products.find((p) => String(p.id) === String(targetId));
    } else if (targetSku) {
      found = products.find((p) => String(p.sku).toLowerCase() === String(targetSku).toLowerCase());
    }

    if (found) {
      setQuickViewProduct((prev) => {
        if (prev && String(prev.id) === String(found!.id)) {
          return prev;
        }
        setActiveImageIdx(0);
        return found!;
      });

      if (isCustomerView && !hasInitializedUrlProductRef.current) {
        hasInitializedUrlProductRef.current = true;
        try {
          const currentUrl = window.location.href;
          const cleanUrl = new URL(currentUrl);
          cleanUrl.searchParams.delete('p');
          cleanUrl.searchParams.delete('producto');
          cleanUrl.searchParams.delete('product');
          cleanUrl.searchParams.delete('sku');

          // Establish base catalog history entry without product params
          window.history.replaceState({}, '', cleanUrl.toString());

          // Push product detail entry with depth: 1
          window.history.pushState(
            { isProductView: true, productViewDepth: 1, productId: found.id, scrollY: 0 },
            '',
            currentUrl
          );
        } catch {
          // ignore
        }
      }
    }
  }, [products, isCustomerView]);

  // Escape key handler to close product preview modal in admin mode
  useEffect(() => {
    if (isCustomerView || !quickViewProduct) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseAdminProductModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCustomerView, quickViewProduct, handleCloseAdminProductModal]);

  // Track product view when quick view modal or detail opens
  useEffect(() => {
    if (quickViewProduct) {
      trackProductView(quickViewProduct.id, quickViewProduct.name, {
        sku: quickViewProduct.sku,
        category: quickViewProduct.category,
        price: getItemEffectivePrice(quickViewProduct),
      });
    }
  }, [quickViewProduct]);

  // Categories list derived from products
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  // Product counts per category for rich sidebar panels
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: products.filter((p) => p.status !== 'archived').length };
    products.forEach((p) => {
      if (p.status !== 'archived' && p.category) {
        counts[p.category] = (counts[p.category] || 0) + 1;
      }
    });
    return counts;
  }, [products]);

  // Filtered and sorted products (Ofertas / Descuentos first)
  const filteredProducts = useMemo(() => {
    const getEffectivePrice = (p: InventoryItem) => {
      const regular = Number(p.salePrice) || 0;
      const disc = Math.max(0, Math.min(100, Number(p.discountPercent) || 0));
      return disc > 0 ? regular * (1 - disc / 100) : regular;
    };

    const hideOutOfStock = storeConfig && storeConfig.showOutOfStock === false;

    return products
      .filter((p) => {
        // Exclude archived products - buyer only sees products marked as Active
        if (p.status === 'archived') return false;

        // In customer view, the buyer does not know about stock or backorder; all active products are visible.
        // In admin view, respect the stock filter if configured.
        if (!isCustomerView && (inStockOnly || hideOutOfStock) && (p.stock <= 0 || p.status === 'sold_out')) return false;

        // Offers-only filter (active discount > 0)
        if (showOffersOnly) {
          const disc = Math.max(0, Math.min(100, Number(p.discountPercent) || 0));
          if (disc <= 0) return false;
        }

        // Category filter
        if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;

        // Search query
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchSku = p.sku.toLowerCase().includes(q);
        const matchBarcode = p.barcode?.toLowerCase().includes(q) || false;
        const matchDesc = p.description?.toLowerCase().includes(q) || false;
        const matchTags = p.tags?.toLowerCase().includes(q) || false;
        return matchName || matchSku || matchBarcode || matchDesc || matchTags;
      })
      .sort((a, b) => {
        const discA = Math.max(0, Math.min(100, Number(a.discountPercent) || 0));
        const discB = Math.max(0, Math.min(100, Number(b.discountPercent) || 0));
        const hasDiscA = discA > 0;
        const hasDiscB = discB > 0;

        // Prioritize products with active discount percentage
        if (hasDiscA !== hasDiscB) {
          return hasDiscB ? 1 : -1;
        }

        // If both have discounts and sorting is default/featured, sort by highest discount first
        if (hasDiscA && hasDiscB && (!sortBy || sortBy === 'featured')) {
          if (discB !== discA) return discB - discA;
        }

        const priceA = getEffectivePrice(a);
        const priceB = getEffectivePrice(b);

        if (sortBy === 'price_asc') return priceA - priceB;
        if (sortBy === 'price_desc') return priceB - priceA;
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        return 0; // featured default
      });
  }, [products, searchQuery, selectedCategory, inStockOnly, showOffersOnly, sortBy, storeConfig?.showOutOfStock]);

  // Active payment methods configured in store settings
  const activeConfiguredPayments = useMemo(() => {
    const active = paymentPartners.filter((p) => p.active);
    return active.length > 0 ? active : paymentPartners;
  }, [paymentPartners]);

  // Check if an order belongs to the selected date range
  const isOrderInDateRange = (
    orderDateStr: string,
    range: 'all' | 'today' | 'month' | 'custom',
    startStr: string,
    endStr: string
  ) => {
    if (range === 'all') return true;
    if (!orderDateStr) return true;
    const d = new Date(orderDateStr);
    if (isNaN(d.getTime())) return true;

    const now = new Date();

    if (range === 'today') {
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }

    if (range === 'month') {
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth()
      );
    }

    if (range === 'custom') {
      if (startStr) {
        const s = new Date(startStr + 'T00:00:00');
        if (!isNaN(s.getTime()) && d < s) return false;
      }
      if (endStr) {
        const e = new Date(endStr + 'T23:59:59.999');
        if (!isNaN(e.getTime()) && d > e) return false;
      }
      return true;
    }

    return true;
  };

  // Orders filtered by the selected date period
  const periodOrders = useMemo(() => {
    return orders.filter((ord) =>
      isOrderInDateRange(ord.createdAt, orderDateRangeFilter, customStartDate, customEndDate)
    );
  }, [orders, orderDateRangeFilter, customStartDate, customEndDate]);

  // Filtered Orders (Period + Status Filter + Search Filter)
  const filteredOrders = useMemo(() => {
    return periodOrders.filter((ord) => {
      // Filtrado exclusivo cuando se navega con "Ver Venta" desde Compras
      if (filterOrderNumber && String(filterOrderNumber).trim() !== '') {
        const target = String(filterOrderNumber).trim().toLowerCase();
        const ordNumber = (ord.orderNumber || '').trim().toLowerCase();
        const ordId = String(ord.id || '').trim().toLowerCase();
        return ordNumber === target || ordId === target;
      }

      // Status Filter
      if (orderStatusFilter !== 'all' && ord.status !== orderStatusFilter) {
        return false;
      }
      // Search Filter
      if (orderSearchQuery.trim()) {
        const q = orderSearchQuery.toLowerCase().trim();
        const matchNum = (ord.orderNumber || '').toLowerCase().includes(q);
        const matchName = (ord.customerName || '').toLowerCase().includes(q);
        const matchPhone = (ord.customerPhone || '').toLowerCase().includes(q);
        const matchAddress = (ord.customerAddress || '').toLowerCase().includes(q);
        const matchCi = getCustomerCi(ord).toLowerCase().includes(q);
        let matchItem = false;
        if (Array.isArray(ord.items)) {
          matchItem = ord.items.some(
            (it: any) =>
              (it.name || it.item?.name || '').toLowerCase().includes(q) ||
              (it.sku || it.item?.sku || '').toLowerCase().includes(q)
          );
        }
        return matchNum || matchName || matchPhone || matchAddress || matchCi || matchItem;
      }
      return true;
    });
  }, [periodOrders, orderStatusFilter, orderSearchQuery, filterOrderNumber]);

  // Order Counts within selected period
  const orderCounts = useMemo(() => {
    const counts = {
      all: periodOrders.length,
      pending: 0,
      confirmed: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    };
    periodOrders.forEach((o) => {
      if (o.status in counts) {
        counts[o.status as keyof typeof counts]++;
      }
    });
    return counts;
  }, [periodOrders]);

  // Comprehensive Sales & Financial Metrics for selected period
  const orderMetrics = useMemo(() => {
    let totalSalesVolume = 0;
    let pendingSalesVolume = 0;
    let confirmedSalesVolume = 0;
    let shippedSalesVolume = 0;
    let deliveredSalesVolume = 0;
    let cancelledSalesVolume = 0;
    let nonCancelledCount = 0;

    const paymentMap: Record<string, { name: string; count: number; total: number }> = {};

    periodOrders.forEach((o) => {
      const amt = Number(o.totalAmount) || 0;
      if (o.status !== 'cancelled') {
        totalSalesVolume += amt;
        nonCancelledCount++;

        const rawMethod = (o.paymentMethod || 'Otros').trim();
        if (!paymentMap[rawMethod]) {
          paymentMap[rawMethod] = { name: rawMethod, count: 0, total: 0 };
        }
        paymentMap[rawMethod].count += 1;
        paymentMap[rawMethod].total += amt;
      }

      if (o.status === 'pending') pendingSalesVolume += amt;
      if (o.status === 'confirmed') confirmedSalesVolume += amt;
      if (o.status === 'shipped') shippedSalesVolume += amt;
      if (o.status === 'delivered') deliveredSalesVolume += amt;
      if (o.status === 'cancelled') cancelledSalesVolume += amt;
    });

    const averageTicket = nonCancelledCount > 0 ? totalSalesVolume / nonCancelledCount : 0;
    const paymentBreakdown = Object.values(paymentMap).sort((a, b) => b.total - a.total);

    return {
      totalSalesVolume,
      pendingSalesVolume,
      confirmedSalesVolume,
      shippedSalesVolume,
      deliveredSalesVolume,
      cancelledSalesVolume,
      totalOrdersCount: periodOrders.length,
      nonCancelledCount,
      averageTicket,
      paymentBreakdown,
    };
  }, [periodOrders]);

  // Visual Payment Method Badge with dedicated Icons & Logos
  const renderPaymentBadge = (methodStr: string, partners: PaymentMethodPartner[] = [], orderStatus?: string) => {
    const rawMethod = (methodStr || '').trim();
    const norm = rawMethod.toLowerCase();

    // If order status is pending or method is explicitly pending/sin establecer/empty, show "Sin establecer"
    if (
      orderStatus === 'pending' ||
      !rawMethod ||
      norm === 'sin_establecer' ||
      norm === 'sin establecer' ||
      norm === 'pending' ||
      norm === 'no especificado' ||
      norm === 'por definir'
    ) {
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-semibold shadow-2xs bg-slate-100/90 text-slate-600 border-slate-300/80">
          <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate max-w-[190px] font-medium">Sin establecer</span>
        </div>
      );
    }

    // Look for matching partner in paymentPartners
    const matchedPartner = partners.find(
      (p) =>
        p.name.toLowerCase() === norm ||
        p.id.toLowerCase() === norm ||
        norm.includes(p.name.toLowerCase()) ||
        p.name.toLowerCase().includes(norm)
    );

    let iconElement = <CreditCard className="w-3.5 h-3.5" />;
    let badgeClasses = 'bg-sky-950/70 text-sky-300 border-sky-800/60';
    let label = rawMethod;
    let logoImg = matchedPartner?.logoUrl;

    if (norm.includes('whatsapp') || norm.includes('wsp') || norm === 'whatsapp') {
      iconElement = <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />;
      badgeClasses = 'bg-emerald-950/80 text-emerald-300 border-emerald-700/70';
      label = 'WhatsApp / Acuerdo';
    } else if (norm.includes('contraentrega') || norm.includes('efectivo') || norm.includes('cash') || norm === 'contraentrega') {
      iconElement = <Banknote className="w-3.5 h-3.5 text-amber-400" />;
      badgeClasses = 'bg-amber-950/80 text-amber-300 border-amber-700/70';
      label = 'Efectivo / Contraentrega';
    } else if (norm.includes('pichincha') || norm.includes('vecino')) {
      iconElement = <Building2 className="w-3.5 h-3.5 text-yellow-400" />;
      badgeClasses = 'bg-yellow-950/80 text-yellow-300 border-yellow-700/70';
      label = 'Banco Pichincha';
    } else if (norm.includes('guayaquil') || norm.includes('barrio')) {
      iconElement = <Landmark className="w-3.5 h-3.5 text-pink-400" />;
      badgeClasses = 'bg-pink-950/80 text-pink-300 border-pink-700/70';
      label = 'Banco Guayaquil';
    } else if (norm.includes('deuna') || norm.includes('qr')) {
      iconElement = <QrCode className="w-3.5 h-3.5 text-teal-300" />;
      badgeClasses = 'bg-teal-950/80 text-teal-200 border-teal-700/70';
      label = 'Deuna / Pago QR';
    } else if (norm.includes('zelle')) {
      iconElement = <Wallet className="w-3.5 h-3.5 text-purple-300" />;
      badgeClasses = 'bg-purple-950/80 text-purple-200 border-purple-700/70';
      label = 'Zelle USD';
    } else if (norm.includes('tarjeta') || norm.includes('visa') || norm.includes('mastercard') || norm.includes('credito') || norm.includes('debito')) {
      iconElement = <CreditCard className="w-3.5 h-3.5 text-indigo-300" />;
      badgeClasses = 'bg-indigo-950/80 text-indigo-200 border-indigo-700/70';
      label = 'Tarjeta Débito/Crédito';
    } else if (norm.includes('transferencia') || norm.includes('deposito') || norm.includes('banco') || norm.includes('produbanco') || norm.includes('pacifico')) {
      iconElement = <Landmark className="w-3.5 h-3.5 text-sky-400" />;
      badgeClasses = 'bg-sky-950/80 text-sky-300 border-sky-700/70';
      label = rawMethod;
    }

    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-semibold shadow-xs ${badgeClasses}`}>
        {logoImg ? (
          <div className="w-5 h-5 rounded-md bg-white border border-slate-300 p-0.5 flex items-center justify-center overflow-hidden flex-shrink-0">
            <img src={logoImg} alt={label} className="w-full h-full object-contain" />
          </div>
        ) : (
          <span className="flex-shrink-0">{iconElement}</span>
        )}
        <span className="truncate max-w-[190px] font-medium">{label}</span>
      </div>
    );
  };

  // Confirm delete order handler
  const handleConfirmDeleteOrder = async (purchaseAction?: 'cancel' | 'keep') => {
    if (!orderToDelete) return;
    if (orderToDelete.status === 'delivered') {
      showToast('🔒 Integridad ERP: Los pedidos entregados y cerrados no se pueden eliminar.');
      setOrderToDelete(null);
      return;
    }
    if (orderToDelete.status === 'confirmed' || orderToDelete.status === 'shipped') {
      showToast('🔒 Integridad ERP: Una venta no puede borrarse cuando está confirmada.');
      setOrderToDelete(null);
      return;
    }
    if (isOrderPartiallyDelivered(orderToDelete)) {
      showToast('🔒 Integridad ERP: Una venta no puede borrarse cuando se encuentra entregada parcialmente.');
      setOrderToDelete(null);
      return;
    }
    setIsDeletingOrder(true);
    try {
      const linkedPurchases = (purchases || []).filter(
        (p: any) =>
          ((orderToDelete.linkedPurchaseId && p.id === orderToDelete.linkedPurchaseId) ||
            p.linkedCustomerOrderId === orderToDelete.id ||
            (orderToDelete.linkedPurchaseNumber && String(orderToDelete.linkedPurchaseNumber).includes(p.purchaseNumber)) ||
            (p.linkedCustomerOrderNumber && String(p.linkedCustomerOrderNumber).trim() === String(orderToDelete.orderNumber).trim()) ||
            (Array.isArray(p.items) &&
              p.items.some(
                (it: any) =>
                  it.customerOrderId === orderToDelete.id ||
                  (it.orderNumber && String(it.orderNumber).trim() === String(orderToDelete.orderNumber).trim())
              ))) &&
          p.status !== 'cancelled'
      );
      const linkedCount = linkedPurchases.length;

      const ok = await onDeleteOrder(orderToDelete.id, purchaseAction);
      if (ok) {
        if (purchaseAction === 'cancel') {
          if (linkedCount > 1) {
            showToast(`✓ Pedido #${orderToDelete.orderNumber} eliminado y todas las ${linkedCount} órdenes de compra a proveedores fueron eliminadas`);
          } else if (linkedCount === 1) {
            showToast(`✓ Pedido #${orderToDelete.orderNumber} eliminado y su orden de compra con el proveedor fue cancelada`);
          } else {
            showToast(`✓ Pedido #${orderToDelete.orderNumber} eliminado y órdenes asociadas eliminadas`);
          }
        } else if (purchaseAction === 'keep') {
          showToast(`✓ Pedido #${orderToDelete.orderNumber} eliminado. ${linkedCount > 1 ? `Las ${linkedCount} órdenes con proveedores se conservaron` : 'La orden con el proveedor se conservó'} para stock`);
        } else {
          showToast(`✓ Pedido #${orderToDelete.orderNumber} eliminado correctamente`);
        }
        setOrderToDelete(null);
      } else {
        showToast('No se pudo eliminar el pedido');
      }
    } catch (err: any) {
      showToast(`Error al eliminar el pedido: ${err?.message || ''}`);
    } finally {
      setIsDeletingOrder(false);
    }
  };

  // Confirm cancel order handler (with linked supplier purchase choice)
  const handleConfirmCancelOrder = async (purchaseAction?: 'cancel' | 'keep') => {
    if (!orderToCancel) return;
    if (orderToCancel.status === 'delivered') {
      showToast('🔒 Integridad ERP: Un pedido entregado y cerrado no puede cancelarse.');
      setOrderToCancel(null);
      return;
    }
    if (orderToCancel.status === 'confirmed' || orderToCancel.status === 'shipped') {
      showToast('🔒 Integridad ERP: Una venta no puede cancelarse cuando está confirmada.');
      setOrderToCancel(null);
      return;
    }
    if (isOrderPartiallyDelivered(orderToCancel)) {
      showToast('🔒 Integridad ERP: Una venta no puede cancelarse cuando se encuentra entregada parcialmente.');
      setOrderToCancel(null);
      return;
    }
    setIsCancellingOrder(true);
    try {
      const ok = await onUpdateOrderStatus(
        orderToCancel.id,
        'cancelled',
        orderToCancel.paymentVoucher || undefined,
        orderToCancel.notes || undefined,
        orderToCancel.trackingNumber || undefined,
        orderToCancel.trackingCarrier || undefined,
        orderToCancel.trackingNotes || undefined,
        purchaseAction
      );
      if (ok) {
        if (purchaseAction === 'cancel') {
          showToast(`✓ Pedido #${orderToCancel.orderNumber} cancelado y orden de compra al proveedor cancelada`);
        } else if (purchaseAction === 'keep') {
          showToast(`✓ Pedido #${orderToCancel.orderNumber} cancelado. Orden al proveedor conservada para reponer stock general`);
        } else {
          showToast(`✓ Pedido #${orderToCancel.orderNumber} cancelado y stock restablecido`);
        }
        setOrderToCancel(null);
      } else {
        showToast('No se pudo cancelar el pedido');
      }
    } catch (err: any) {
      showToast(`Error al cancelar el pedido: ${err?.message || ''}`);
    } finally {
      setIsCancellingOrder(false);
    }
  };

  // Unified Open Order Modal (combines Editing, Items, Delivery & Payment Confirmation)
  const handleOpenUnifiedOrder = (ord: CustomerOrder, tab: 'all' | 'items_delivery' | 'payment_confirm' = 'all') => {
    setOrderToEdit(ord);
    setOrderToConfirm(ord); // keep synced so any legacy check remains true
    setManageOrderTab(tab);

    // 1. Client data
    const existingCi = isOnlineStoreOrder(ord)
      ? ((ord as any).customerCi || (ord as any).ci || '').trim()
      : (getCustomerCi(ord) || '');
    setEditCustomerCi(existingCi);
    setConfirmCustomerCi(existingCi);

    setEditCustomerName(ord.customerName || '');
    setConfirmCustomerName(ord.customerName || '');

    setEditCustomerPhone(ord.customerPhone || '');
    setConfirmCustomerPhone(ord.customerPhone || '');

    setEditCustomerEmail(ord.customerEmail || (ord as any).email || '');
    setConfirmCustomerEmail(ord.customerEmail || (ord as any).email || '');

    // Look for customer in CRM customers list to find their registered general address
    const cleanPhoneDigits = (ord.customerPhone || '').replace(/\D/g, '');
    const foundCustomer = (dbCustomers || []).find(
      (c: any) =>
        (c.ci && existingCi && c.ci.trim().toLowerCase() === existingCi.trim().toLowerCase()) ||
        (c.phone && cleanPhoneDigits && c.phone.replace(/\D/g, '') === cleanPhoneDigits)
    );

    let initialGeneralAddress = (ord as any).clientAddress || foundCustomer?.address || '';
    if (isConcatenatedShippingAddress(initialGeneralAddress)) {
      if (foundCustomer?.address && !isConcatenatedShippingAddress(foundCustomer.address)) {
        initialGeneralAddress = foundCustomer.address;
      } else {
        const parsedShipping = parseCustomerShippingData(initialGeneralAddress);
        initialGeneralAddress = parsedShipping.exactAddress || '';
      }
    }
    setEditCustomerGeneralAddress(initialGeneralAddress);
    setConfirmCustomerGeneralAddress(initialGeneralAddress);

    // 2. Delivery modality & addresses
    const isPickup =
      ord.deliveryType === 'pickup' ||
      (ord.customerAddress || '').toLowerCase().includes('retiro') ||
      (ord.customerAddress || '').toLowerCase().includes('local');
    setEditDeliveryType(isPickup ? 'pickup' : 'shipping');
    setConfirmDeliveryType(isPickup ? 'pickup' : 'shipping');

    const rawDeliveryAddress = (ord as any).shippingAddress || ord.customerAddress || foundCustomer?.fullAddress || '';
    const cleanShipping = isPickup
      ? ''
      : rawDeliveryAddress === 'Envío a Domicilio' || rawDeliveryAddress.toLowerCase().includes('retiro')
      ? ''
      : stripCiFromAddress(rawDeliveryAddress);
    setEditShippingAddress(cleanShipping);
    setConfirmShippingAddress(cleanShipping);

    const firstActiveCourier = courierPartners.find((c) => c.active !== false)?.name || 'Servientrega';
    const matchedExistingCourier = courierPartners.find(
      (c) => c.active !== false && ord.trackingCarrier && c.name.toLowerCase() === ord.trackingCarrier.trim().toLowerCase()
    );
    const chosenCourier = isPickup ? '' : (matchedExistingCourier?.name || ord.trackingCarrier || firstActiveCourier);
    setEditTrackingCarrier(chosenCourier);
    setConfirmTrackingCarrier(chosenCourier);

    setEditTrackingNumber(isPickup ? '' : ord.trackingNumber || '');
    setEditTrackingNotes(isPickup ? '' : ord.trackingNotes || '');

    // 3. Items parsing
    const parsed = Array.isArray(ord.items)
      ? ord.items.map((it: any) => ({
          id: it.id || it.item?.id || it.inventoryItemId,
          inventoryItemId: it.inventoryItemId || it.id || it.item?.id,
          name: it.name || it.item?.name || 'Producto',
          sku: it.sku || it.item?.sku || '',
          barcode: it.barcode || it.item?.barcode || undefined,
          costPrice: it.costPrice || it.item?.costPrice || undefined,
          supplierName: it.supplierName || it.item?.supplierName || (it as any).supplier || (it.item as any)?.supplier || undefined,
          salePrice: Number(it.salePrice || it.item?.salePrice || 0),
          quantity: Number(it.quantity || 1),
          imageUrl: it.imageUrl || it.item?.imageUrl || null,
        }))
      : [];
    setEditItems(parsed);

    // 4. Shipping cost calculation
    const sub = parsed.reduce((acc, it) => acc + (Number(it.salePrice) * Number(it.quantity)), 0);
    const tot = Number(ord.totalAmount) || 0;
    const diff = tot - sub;
    const initialShipCost = isPickup ? '0' : (diff > 0.01 ? diff.toFixed(2) : String(storeConfig.deliveryFee || '0'));
    setEditShippingCost(initialShipCost);
    setConfirmShippingCost(initialShipCost);

    // 5. Payment method, bank & voucher
    const rawMethod = (ord.paymentMethod || '').trim();
    const norm = rawMethod.toLowerCase();
    const activePartners = paymentPartners.filter((p) => p.active !== false);
    const matched = activePartners.find(
      (p) =>
        p.id.toLowerCase() === norm ||
        p.name.toLowerCase() === norm ||
        norm.includes(p.name.toLowerCase()) ||
        p.name.toLowerCase().includes(norm)
    );
    const chosenMethod = matched ? matched.name : (rawMethod || activePartners[0]?.name || 'Banco Pichincha');
    setConfirmPaymentMethod(chosenMethod);
    setEditPaymentMethod(chosenMethod);
    setConfirmBankOrAccount(deriveBankOrAccountFromMethod(chosenMethod, ord.notes));

    setVoucherInput(ord.paymentVoucher || '');
    setEditPaymentVoucher(ord.paymentVoucher || '');
    setVoucherNotesInput(ord.notes || '');
    setEditNotes(ord.notes || '');
    setEditStatus(ord.status || 'pending');
    setVoucherError(null);

    setEditProductSearch('');
    setIsAddingCustomEditItem(false);
  };

  // Open Confirm Order Flow (Unificado)
  const handleOpenConfirmOrder = (ord: CustomerOrder) => {
    handleOpenUnifiedOrder(ord, ord.status === 'pending' ? 'all' : 'all');
  };

  // Confirm order with payment voucher and updated items/details
  const handleConfirmOrderWithVoucher = async (sendWhatsApp: boolean = false) => {
    const activeOrder = orderToEdit || orderToConfirm;
    if (!activeOrder) return;

    // Validate Ecuador Cédula/RUC if provided
    const ciToValidate = editCustomerCi.trim() || confirmCustomerCi.trim();
    if (ciToValidate) {
      const val = validateEcuadorId(ciToValidate, true);
      if (!val.isValid) {
        setVoucherError(`Cédula o RUC ecuatoriano inválido: ${val.error}`);
        showToast(`⚠️ Cédula o RUC ecuatoriano inválido: ${val.error}`);
        return;
      }
    }

    if (isOnlineStoreOrder(activeOrder) && !ciToValidate) {
      const err = 'Para confirmar un pedido de la tienda online es obligatorio ingresar la cédula del cliente.';
      setVoucherError(err);
      showToast(`⚠️ ${err}`);
      return;
    }

    if (editItems.length === 0) {
      const err = 'El pedido debe incluir al menos 1 producto';
      setVoucherError(err);
      showToast(`⚠️ ${err}`);
      return;
    }

    const selectedMethod = confirmPaymentMethod || editPaymentMethod || activeOrder.paymentMethod || 'Banco Pichincha';
    const isCash = isCashPayment(selectedMethod);
    if (!isCash && !voucherInput.trim()) {
      const err = 'Debes ingresar el número de comprobante de pago o transferencia antes de confirmar el pedido.';
      setVoucherError(err);
      showToast(`⚠️ ${err}`);
      return;
    }

    setIsConfirmingOrder(true);
    setVoucherError(null);
    try {
      const voucherToSave = voucherInput.trim() || (isCash ? 'EFECTIVO - PAGO CONTRAENTREGA' : 'CONFIRMADO');
      const selectedBank = confirmBankOrAccount || deriveBankOrAccountFromMethod(selectedMethod, voucherNotesInput || editNotes);
      const isPickup = editDeliveryType === 'pickup';
      const cleanGeneral = editCustomerGeneralAddress.trim();
      const cleanShipping = isPickup
        ? 'Retiro en Local'
        : (stripCiFromAddress(editShippingAddress).trim() || 'Envío a Domicilio');
      const finalAddress = isPickup
        ? (storeConfig.address || 'Local Principal de la Tienda')
        : cleanShipping;
      const finalCarrier = isPickup ? null : (editTrackingCarrier.trim() || courierPartners.find((c) => c.active !== false)?.name || 'Envío por Courier');

      const normPhone = normalizeEcuadorPhone(editCustomerPhone);
      const cleanPhone = normPhone.formattedLocal || normPhone.local || editCustomerPhone.trim() || activeOrder.customerPhone;
      const finalName = editCustomerName.trim() || activeOrder.customerName || 'Cliente';
      const finalEmail = editCustomerEmail.trim() || undefined;
      const finalTotal = editTotal;

      // Update customer details, modality, items, and total in database
      if (onUpdateOrder) {
        await onUpdateOrder(activeOrder.id, {
          customerName: finalName,
          customerPhone: cleanPhone,
          customerEmail: finalEmail || null,
          customerCi: ciToValidate || null,
          ci: ciToValidate || null,
          customerAddress: finalAddress,
          clientAddress: cleanGeneral || null,
          shippingAddress: finalAddress,
          deliveryType: editDeliveryType,
          trackingCarrier: finalCarrier,
          trackingNumber: isPickup ? null : (editTrackingNumber.trim() || null),
          trackingNotes: isPickup ? null : (editTrackingNotes.trim() || null),
          paymentMethod: selectedMethod,
          paymentVoucher: voucherToSave,
          notes: (editNotes.trim() || voucherNotesInput.trim()) || null,
          items: editItems as any,
          totalAmount: finalTotal.toFixed(2),
        });
      }

      const ok = await onUpdateOrderStatus(
        activeOrder.id,
        'confirmed',
        voucherToSave,
        (voucherNotesInput.trim() || editNotes.trim()) || (isCash ? 'Pago en efectivo verificado/acordado' : undefined),
        isPickup ? undefined : (editTrackingNumber.trim() || undefined),
        finalCarrier || undefined,
        isPickup ? undefined : (editTrackingNotes.trim() || undefined),
        undefined,
        selectedMethod,
        selectedBank,
        ciToValidate || undefined
      );

      if (ok) {
        showToast(`✓ Pedido #${activeOrder.orderNumber} confirmado ${isCash ? 'con pago en efectivo' : `con comprobante: ${voucherInput.trim()}`}`);

        if (sendWhatsApp) {
          const norm = normalizeEcuadorPhone(cleanPhone);
          if (norm.whatsappDigits && norm.isValid) {
            const activePartners = paymentPartners.filter((p) => p.active !== false);
            const matchedPartner = activePartners.find(
              (p) =>
                p.id === selectedMethod ||
                p.name.toLowerCase() === selectedMethod.toLowerCase() ||
                (selectedMethod && p.name.toLowerCase().includes(selectedMethod.toLowerCase())) ||
                (selectedMethod && selectedMethod.toLowerCase().includes(p.name.toLowerCase()))
            );
            const partnerName = matchedPartner ? matchedPartner.name : (selectedMethod || 'Coordinar con la tienda');
            const partnerDetails = matchedPartner?.details?.trim();

            let msg = `¡Hola *${finalName}*! 👋\n\n`;
            msg += `¡Excelente noticia! Tu *Pedido #${activeOrder.orderNumber}* en *${storeConfig.storeName || 'nuestra tienda'}* ha sido *CONFIRMADO* con éxito.\n\n`;
            msg += `📦 *Detalle del Pedido:*\n`;
            editItems.forEach((it) => {
              msg += `• ${it.quantity}x ${it.name} ($${(Number(it.salePrice) * Number(it.quantity)).toFixed(2)})\n`;
            });
            msg += `\n`;
            msg += `💰 *Total del Pedido:* $${finalTotal.toFixed(2)} ${currency}\n`;
            if (ciToValidate) {
              msg += `🪪 *Cédula/RUC:* ${ciToValidate}\n`;
            }
            msg += `📍 *Modalidad:* ${isPickup ? 'Retiro en Local' : 'Envío a Domicilio'}\n`;
            if (isPickup) {
              msg += `🏢 *Lugar de Retiro:* ${storeConfig.address || 'Local Principal'}\n`;
            } else {
              msg += `🏠 *Dirección de Entrega:* ${finalAddress}\n`;
              if (finalCarrier) {
                msg += `🚚 *Transportista:* ${finalCarrier}\n`;
              }
              if (editTrackingNumber.trim()) {
                msg += `🔖 *N° Guía:* ${editTrackingNumber.trim()}\n`;
              }
            }
            msg += `💳 *Método de Pago:* ${partnerName}\n`;
            if (partnerDetails) {
              msg += `📝 *Datos de la Cuenta:* \n${partnerDetails}\n`;
            }
            if (voucherToSave) {
              msg += `🧾 *Comprobante Registrado:* ${voucherToSave}\n`;
            }
            if (editNotes.trim() || voucherNotesInput.trim()) {
              msg += `📌 *Nota:* ${editNotes.trim() || voucherNotesInput.trim()}\n`;
            }
            msg += `\nEstamos preparando tu pedido para despacharlo. ¡Muchas gracias por tu compra!`;

            const link = buildWhatsAppLink(norm.whatsappDigits, msg);
            window.open(link, '_blank');
          }
        }

        setOrderToConfirm(null);
        setOrderToEdit(null);
      } else {
        setVoucherError('No se pudo confirmar el pedido. Verifique los datos e intente nuevamente.');
      }
    } catch (err: any) {
      setVoucherError(err.message || 'Error al confirmar el pedido');
    } finally {
      setIsConfirmingOrder(false);
    }
  };

  // Impresión directa del ticket para etiquetar el paquete de envío desde el modal unificado
  const handleDirectPrintTicketForConfirm = () => {
    const activeOrder = orderToEdit || orderToConfirm;
    if (!activeOrder) return;
    const isPickup = editDeliveryType === 'pickup';
    const liveOrderForTicket: CustomerOrder = {
      ...activeOrder,
      customerName: editCustomerName.trim() || activeOrder.customerName,
      customerPhone: editCustomerPhone.trim() || activeOrder.customerPhone,
      customerCi: editCustomerCi.trim() || (activeOrder as any).customerCi,
      ci: editCustomerCi.trim() || (activeOrder as any).ci,
      customerAddress: isPickup
        ? (storeConfig.address || 'Retiro en Local')
        : (stripCiFromAddress(editShippingAddress).trim() || editCustomerGeneralAddress.trim() || activeOrder.customerAddress || ''),
      shippingAddress: isPickup
        ? (storeConfig.address || 'Retiro en Local')
        : (stripCiFromAddress(editShippingAddress).trim() || editCustomerGeneralAddress.trim() || (activeOrder as any).shippingAddress || ''),
      trackingCarrier: isPickup ? 'Retiro en Local' : (editTrackingCarrier.trim() || activeOrder.trackingCarrier || undefined),
      items: editItems as any,
      totalAmount: editTotal.toFixed(2),
    };

    directPrintShippingTicket({
      order: liveOrderForTicket,
      storeConfig,
      currency,
      showToast,
    });
  };

  // Abrir modal de vista previa de ticket y selección de formato (58mm, 80mm, 70x120mm adhesivo)
  const handleOpenShippingTicketForConfirm = () => {
    const activeOrder = orderToEdit || orderToConfirm;
    if (!activeOrder) return;
    const isPickup = editDeliveryType === 'pickup';
    const liveOrderForTicket: CustomerOrder = {
      ...activeOrder,
      customerName: editCustomerName.trim() || activeOrder.customerName,
      customerPhone: editCustomerPhone.trim() || activeOrder.customerPhone,
      customerCi: editCustomerCi.trim() || (activeOrder as any).customerCi,
      ci: editCustomerCi.trim() || (activeOrder as any).ci,
      customerAddress: isPickup
        ? (storeConfig.address || 'Retiro en Local')
        : (stripCiFromAddress(editShippingAddress).trim() || editCustomerGeneralAddress.trim() || activeOrder.customerAddress || ''),
      shippingAddress: isPickup
        ? (storeConfig.address || 'Retiro en Local')
        : (stripCiFromAddress(editShippingAddress).trim() || editCustomerGeneralAddress.trim() || (activeOrder as any).shippingAddress || ''),
      trackingCarrier: isPickup ? 'Retiro en Local' : (editTrackingCarrier.trim() || activeOrder.trackingCarrier || undefined),
      items: editItems as any,
      totalAmount: editTotal.toFixed(2),
    };

    setOrderToPrintShipping(liveOrderForTicket);
  };

  // Open Order Shipping Modal
  const handleOpenShipOrder = (ord: CustomerOrder) => {
    const currentOrder = orders.find((o) => String(o.id) === String(ord.id)) || ord;
    setOrderToShip(currentOrder);
    const activeCarrier = courierPartners.find((c) => c.active !== false);
    setShipTrackingCarrier(currentOrder.trackingCarrier || activeCarrier?.name || '');
    setShipTrackingNumber(currentOrder.trackingNumber || '');
    setShipTrackingNotes(currentOrder.trackingNotes || '');
    setShipNotifyWhatsApp(true);
    setShipError(null);
  };

  // Confirm shipping transition with tracking info
  const handleConfirmOrderToShip = async (sendWhatsApp = true) => {
    if (!orderToShip) return;
    const guideVal = canGenerateShippingGuide(orderToShip, products, purchases);
    if (!guideVal.canGenerate) {
      setShipError(guideVal.reason || 'No se puede generar la guía de envío.');
      showToast(`⛔ ${guideVal.reason}`);
      return;
    }
    const shipVal = canOrderBeMarkedAsShipped(orderToShip);
    if (!shipVal.canShip) {
      setShipError(shipVal.reason || 'El pedido debe estar confirmado para poder ser marcado como enviado.');
      showToast(`⛔ ${shipVal.reason}`);
      return;
    }
    if (!shipTrackingCarrier.trim()) {
      setShipError('Debes seleccionar o ingresar la empresa de transporte / courier.');
      return;
    }
    if (!shipTrackingNumber.trim()) {
      setShipError('Debes ingresar el número de seguimiento / guía de la empresa seleccionada para marcar como enviado.');
      return;
    }

    setIsShippingOrder(true);
    setShipError(null);
    try {
      const ok = await onUpdateOrderStatus(
        orderToShip.id,
        'shipped',
        orderToShip.paymentVoucher || undefined,
        orderToShip.notes || undefined,
        shipTrackingNumber.trim(),
        shipTrackingCarrier.trim(),
        shipTrackingNotes.trim() || undefined
      );

      if (ok) {
        showToast(`✓ Pedido #${orderToShip.orderNumber} marcado como ENVIADO por ${shipTrackingCarrier.trim()}`);

        // Send tracking info via WhatsApp if requested
        if (sendWhatsApp) {
          const norm = normalizeEcuadorPhone(orderToShip.customerPhone);
          if (norm.whatsappDigits && norm.isValid) {
            const isPickup = (orderToShip.customerAddress || '').toLowerCase().includes('retiro');
            const activePartners = paymentPartners.filter((p) => p.active !== false);
            const matchedPartner = activePartners.find(
              (p) =>
                p.id === orderToShip.paymentMethod ||
                p.name.toLowerCase() === (orderToShip.paymentMethod || '').toLowerCase() ||
                (orderToShip.paymentMethod && p.name.toLowerCase().includes(orderToShip.paymentMethod.toLowerCase())) ||
                (orderToShip.paymentMethod && orderToShip.paymentMethod.toLowerCase().includes(p.name.toLowerCase()))
            );
            const partnerName = matchedPartner ? matchedPartner.name : (orderToShip.paymentMethod || 'Coordinar con la tienda');

            let shipMsg = `¡Hola *${orderToShip.customerName || 'Cliente'}*! 🚚\n\n`;
            shipMsg += `Te informamos que tu pedido *#${orderToShip.orderNumber}* en *${storeConfig.storeName || 'nuestra tienda'}* ha sido *ENVIADO / DESPACHADO* con éxito.\n\n`;
            shipMsg += `📦 *Empresa de Transporte / Courier:* ${shipTrackingCarrier.trim()}\n`;
            shipMsg += `🔍 *N° de Guía / Tracking:* ${shipTrackingNumber.trim()}\n`;
            if (shipTrackingNotes.trim()) {
              shipMsg += `📝 *Detalle de Entrega / Seguimiento:* ${shipTrackingNotes.trim()}\n`;
            }
            if (orderToShip.customerAddress && !isPickup) {
              shipMsg += `📍 *Dirección de Destino:* ${orderToShip.customerAddress}\n`;
            }
            shipMsg += `💰 *Total del Pedido:* $${Number(orderToShip.totalAmount).toFixed(2)} ${currency}\n`;
            shipMsg += `💳 *Método de Pago:* ${partnerName}\n`;
            if (orderToShip.paymentVoucher) {
              shipMsg += `🧾 *Comprobante Registrado:* ${orderToShip.paymentVoucher}\n`;
            }
            shipMsg += `\n¡Muchas gracias por tu compra! Quedamos a tu disposición para cualquier consulta.`;

            const link = buildWhatsAppLink(norm.whatsappDigits, shipMsg);
            window.open(link, '_blank');
          }
        }

        setOrderToShip(null);
      } else {
        setShipError('No se pudo actualizar el estado a enviado. Intenta nuevamente.');
      }
    } catch (err: any) {
      setShipError(err.message || 'Error al actualizar el estado de envío');
    } finally {
      setIsShippingOrder(false);
    }
  };

  // Open Edit Order Modal (delegates to unified handler)
  const handleOpenEditOrder = (ord: CustomerOrder) => {
    handleOpenUnifiedOrder(ord, 'all');
  };

  // Open Quick Shipping Cost Modal
  const handleOpenShippingCost = (ord: CustomerOrder) => {
    setOrderToSetShipping(ord);
    const items = Array.isArray(ord.items) ? ord.items : [];
    const itemsSub = items.reduce((acc: number, it: any) => acc + (Number(it.salePrice || it.item?.salePrice || 0) * (Number(it.quantity) || 1)), 0);
    const currentTot = Number(ord.totalAmount) || 0;
    const currentShip = currentTot - itemsSub;
    setQuickShippingCostInput(currentShip > 0.01 ? currentShip.toFixed(2) : String(storeConfig.deliveryFee || '0'));
    setQuickShippingCarrierInput(ord.trackingCarrier || courierPartners.find((c) => c.active !== false)?.name || 'Servientrega');

    // Automatically match the order's payment method with configured payment partners
    const activePartners = paymentPartners.filter((p) => p.active !== false);
    const matched = activePartners.find(
      (p) =>
        p.name.toLowerCase() === (ord.paymentMethod || '').toLowerCase() ||
        p.id.toLowerCase() === (ord.paymentMethod || '').toLowerCase() ||
        (ord.paymentMethod || '').toLowerCase().includes(p.name.toLowerCase()) ||
        p.name.toLowerCase().includes((ord.paymentMethod || '').toLowerCase())
    );
    setSelectedQuickPaymentPartnerId(matched ? matched.id : (activePartners[0]?.id || ''));
    setQuickShippingPaymentNote('');
  };

  // Save Quick Shipping Cost and Send to WhatsApp with complete Payment Method details
  const handleSaveQuickShipping = async (sendWhatsApp = true) => {
    if (!orderToSetShipping) return;
    setIsSavingQuickShipping(true);
    try {
      const items = Array.isArray(orderToSetShipping.items) ? orderToSetShipping.items : [];
      const itemsSub = items.reduce((acc: number, it: any) => acc + (Number(it.salePrice || it.item?.salePrice || 0) * (Number(it.quantity) || 1)), 0);
      const shipCost = Math.max(0, Number(quickShippingCostInput) || 0);
      const newTotal = itemsSub + shipCost;
      const carrierName = quickShippingCarrierInput.trim() || orderToSetShipping.trackingCarrier || 'Courier';

      const payload: Partial<CustomerOrder> = {
        totalAmount: String(newTotal.toFixed(2)),
        trackingCarrier: carrierName,
      };

      if (onUpdateOrder) {
        await onUpdateOrder(orderToSetShipping.id, payload);
      } else {
        await onUpdateOrderStatus(
          orderToSetShipping.id,
          orderToSetShipping.status,
          orderToSetShipping.paymentVoucher || undefined,
          orderToSetShipping.notes || undefined,
          orderToSetShipping.trackingNumber || undefined,
          carrierName
        );
      }

      showToast(`✓ Valor de envío ($${shipCost.toFixed(2)}) asignado al pedido #${orderToSetShipping.orderNumber}`);

      if (sendWhatsApp) {
        const norm = normalizeEcuadorPhone(orderToSetShipping.customerPhone);
        if (norm.whatsappDigits && norm.isValid) {
          const activePartners = paymentPartners.filter((p) => p.active !== false);
          const currentPartner = activePartners.find((p) => p.id === selectedQuickPaymentPartnerId) || activePartners[0];
          const isCash = isCashPayment(orderToSetShipping.paymentMethod) || (currentPartner && isCashPayment(currentPartner.name));

          const itemsBreakdown = items.map((it: any) => `• ${it.quantity || 1}x ${it.name || it.item?.name} ($${it.salePrice || it.item?.salePrice})`).join('\n');

          let msg = `¡Hola *${orderToSetShipping.customerName || 'estimado cliente'}*! 👋\n\n`;
          msg += `Te compartimos el valor de envío y los datos para tu *Pedido #${orderToSetShipping.orderNumber}* en *${storeConfig.storeName || 'nuestra tienda'}*:\n\n`;
          msg += `📦 *Detalle de Productos:*\n${itemsBreakdown || '• Productos varios'}\n`;
          msg += `💵 *Subtotal:* $${itemsSub.toFixed(2)} ${currency}\n`;
          msg += `🚚 *Valor de Envío (${carrierName}):* $${shipCost.toFixed(2)} ${currency}\n`;
          msg += `💰 *TOTAL A PAGAR:* $${newTotal.toFixed(2)} ${currency}\n\n`;
          if (orderToSetShipping.customerAddress) {
            msg += `📍 *Dirección de Entrega:* ${orderToSetShipping.customerAddress}\n\n`;
          }

          msg += `💳 *Método de Pago Seleccionado:* ${currentPartner ? currentPartner.name : orderToSetShipping.paymentMethod}\n`;
          if (currentPartner?.details) {
            msg += `📝 *Datos de la Cuenta / Pago:* \n${currentPartner.details}\n\n`;
          }
          if (quickShippingPaymentNote.trim()) {
            msg += `📌 *Nota adicional:* ${quickShippingPaymentNote.trim()}\n\n`;
          }

          if (isCash) {
            msg += `💵 *Modalidad:* Pago en efectivo / contraentrega acordado al recibir tu paquete.`;
          } else {
            msg += `📲 *Importante:* Una vez realizada la transferencia o depósito, por favor envíanos la foto o captura del comprobante por aquí para confirmar tu pedido y procesar el despacho de inmediato. ¡Muchas gracias!`;
          }

          const link = buildWhatsAppLink(norm.whatsappDigits, msg);
          window.open(link, '_blank');
        }
      }

      setOrderToSetShipping(null);
    } catch (err: any) {
      showToast('❌ Error al guardar valor de envío: ' + (err.message || 'Error'));
    } finally {
      setIsSavingQuickShipping(false);
    }
  };

  // Filter products for adding in Edit Modal
  const filteredProductsForEdit = useMemo(() => {
    if (!editProductSearch.trim()) return products.slice(0, 8);
    const q = editProductSearch.toLowerCase().trim();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [products, editProductSearch]);

  // Filter products for adding in Manual Order Modal (supports Name, SKU, Barcode, Category)
  const filteredProductsForManual = useMemo(() => {
    if (!manualProductSearch.trim()) return products.slice(0, 8);
    const q = manualProductSearch.toLowerCase().trim();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [products, manualProductSearch]);

  // Edit subtotal
  const editSubtotal = useMemo(() => {
    return editItems.reduce((acc, it) => acc + (Number(it.salePrice) * Number(it.quantity)), 0);
  }, [editItems]);

  // Edit total including shipping cost
  const editTotal = useMemo(() => {
    const ship = editDeliveryType === 'shipping' ? Math.max(0, Number(editShippingCost) || 0) : 0;
    return editSubtotal + ship;
  }, [editSubtotal, editShippingCost, editDeliveryType]);

  // Manual order subtotal
  const manualSubtotal = useMemo(() => {
    return manualItems.reduce((acc, it) => acc + (Number(it.salePrice) * Number(it.quantity)), 0);
  }, [manualItems]);

  // Manual order shipping fee
  const manualShippingFee = useMemo(() => {
    return manualDeliveryType === 'shipping' ? Math.max(0, Number(manualShippingCost) || 0) : 0;
  }, [manualDeliveryType, manualShippingCost]);

  // Manual order total including shipping
  const manualTotalAmount = useMemo(() => {
    return manualSubtotal + manualShippingFee;
  }, [manualSubtotal, manualShippingFee]);

  // Manual order stock availability & deficit analysis
  const manualStockAnalysis = useMemo(() => {
    let hasDeficit = false;
    let totalDeficitUnits = 0;
    const itemsWithDeficit: Array<{
      id?: number;
      name: string;
      sku?: string;
      barcode?: string | null;
      requested: number;
      available: number;
      missing: number;
      isCustom?: boolean;
    }> = [];

    manualItems.forEach((item) => {
      if (item.sku === 'CUSTOM') {
        hasDeficit = true;
        totalDeficitUnits += item.quantity;
        itemsWithDeficit.push({
          name: item.name,
          sku: 'CUSTOM',
          barcode: null,
          requested: item.quantity,
          available: 0,
          missing: item.quantity,
          isCustom: true,
        });
        return;
      }
      const prod = products.find(
        (p) => p.id === item.id || (item.sku && p.sku && p.sku.toLowerCase() === item.sku.toLowerCase())
      );
      const available = prod ? Math.max(0, Number(prod.stock || 0)) : 0;
      const requested = Number(item.quantity || 1);
      if (available < requested) {
        hasDeficit = true;
        const missing = requested - available;
        totalDeficitUnits += missing;
        itemsWithDeficit.push({
          id: item.id || prod?.id,
          name: item.name,
          sku: item.sku || prod?.sku,
          barcode: item.barcode || prod?.barcode,
          requested,
          available,
          missing,
        });
      }
    });

    return {
      hasDeficit,
      totalDeficitUnits,
      itemsWithDeficit,
    };
  }, [manualItems, products]);

  // Save Edit Order
  const handleSaveEditOrder = async (notifyViaWhatsApp = false) => {
    if (!orderToEdit) return;

    if (isOrderLockedFromEditing(orderToEdit)) {
      const reason = getOrderEditBlockReason(orderToEdit) || 'No se puede editar el pedido porque ya fue confirmado.';
      showToast(`🔒 Integridad ERP: ${reason}`);
      return;
    }

    if (!editCustomerPhone.trim()) {
      showToast('⚠️ Ingresa el número de WhatsApp o teléfono del cliente');
      return;
    }
    if (editItems.length === 0) {
      showToast('⚠️ El pedido debe incluir al menos 1 producto');
      return;
    }

    setIsSavingEditOrder(true);
    try {
      const isPickup = editDeliveryType === 'pickup';
      const cleanGeneral = editCustomerGeneralAddress.trim();
      const cleanShipping = isPickup
        ? 'Retiro en Local'
        : (stripCiFromAddress(editShippingAddress).trim() || 'Envío a Domicilio');
      const finalAddress = isPickup
        ? (storeConfig.address || 'Local Principal de la Tienda')
        : cleanShipping;
      const totalAmount = editTotal;
      const normPhone = normalizeEcuadorPhone(editCustomerPhone);
      const cleanPhone = normPhone.formattedLocal || normPhone.local || editCustomerPhone.trim();

      const updatePayload: Partial<CustomerOrder> & { clientAddress?: string | null; shippingAddress?: string | null } = {
        customerName: editCustomerName.trim() || 'Cliente WhatsApp',
        customerPhone: cleanPhone,
        customerEmail: editCustomerEmail.trim() || null,
        customerCi: editCustomerCi.trim() || null,
        ci: editCustomerCi.trim() || null,
        customerAddress: cleanShipping,
        clientAddress: cleanGeneral || null,
        shippingAddress: cleanShipping,
        deliveryType: editDeliveryType,
        paymentMethod: editPaymentMethod || 'whatsapp',
        status: editStatus,
        paymentVoucher: editPaymentVoucher.trim() || null,
        notes: editNotes.trim() || null,
        trackingCarrier: isPickup ? null : (editTrackingCarrier.trim() || null),
        trackingNumber: isPickup ? null : (editTrackingNumber.trim() || null),
        trackingNotes: isPickup ? null : (editTrackingNotes.trim() || null),
        items: editItems as any,
        totalAmount: String(totalAmount.toFixed(2)),
      };

      if (editCustomerCi.trim()) {
        const ciVal = validateEcuadorId(editCustomerCi.trim(), true);
        if (!ciVal.isValid) {
          showToast(`⚠️ Cédula o RUC ecuatoriano inválido: ${ciVal.error}`);
          setIsSavingEditOrder(false);
          return;
        }
      }

      if (editStatus === 'confirmed' && isOnlineStoreOrder(orderToEdit) && !editCustomerCi.trim()) {
        showToast('⚠️ Para confirmar un pedido de la tienda online es obligatorio ingresar la cédula del cliente.');
        setIsSavingEditOrder(false);
        return;
      }

      if (editStatus === 'cancelled' && orderToEdit.status !== 'cancelled') {
        if (
          orderToEdit.status === 'confirmed' ||
          orderToEdit.status === 'shipped' ||
          orderToEdit.status === 'delivered' ||
          isOrderPartiallyDelivered(orderToEdit)
        ) {
          showToast(
            '🔒 Integridad ERP: Una venta no puede cancelarse cuando está confirmada y/o se encuentra entregada parcialmente.'
          );
          setIsSavingEditOrder(false);
          return;
        }

        const linkedP = purchases?.find(
          (p: any) =>
            ((orderToEdit.linkedPurchaseId && p.id === orderToEdit.linkedPurchaseId) ||
              p.linkedCustomerOrderId === orderToEdit.id) &&
            p.status !== 'received' &&
            p.status !== 'cancelled'
        );
        if (linkedP) {
          setOrderToCancel(orderToEdit);
          setOrderToEdit(null);
          setIsSavingEditOrder(false);
          return;
        }
      }

      if (onUpdateOrder) {
        const ok = await onUpdateOrder(orderToEdit.id, updatePayload);
        if (!ok) throw new Error('No se pudo actualizar en el servidor');
      } else {
        await onUpdateOrderStatus(
          orderToEdit.id,
          editStatus,
          editPaymentVoucher || undefined,
          editNotes || undefined,
          isPickup ? undefined : (editTrackingNumber.trim() || undefined),
          isPickup ? undefined : (editTrackingCarrier.trim() || undefined),
          isPickup ? undefined : (editTrackingNotes.trim() || undefined)
        );
      }

      showToast(`✓ Pedido #${orderToEdit.orderNumber} actualizado exitosamente`);

      if (notifyViaWhatsApp) {
        if (!normPhone.whatsappDigits || !normPhone.isValid) {
          showToast('⚠️ No se abrió WhatsApp porque el número registrado no es válido.');
        } else {
          const activePartners = paymentPartners.filter((p) => p.active !== false);
          const matchedPartner = activePartners.find(
            (p) =>
              p.id === editPaymentMethod ||
              p.name.toLowerCase() === (editPaymentMethod || '').toLowerCase() ||
              (editPaymentMethod && p.name.toLowerCase().includes(editPaymentMethod.toLowerCase())) ||
              (editPaymentMethod && editPaymentMethod.toLowerCase().includes(p.name.toLowerCase()))
          );
          const partnerName = matchedPartner ? matchedPartner.name : (editPaymentMethod || 'Coordinar con la tienda');
          const partnerDetails = matchedPartner?.details?.trim();
          const isCash = isCashPayment(editPaymentMethod) || (matchedPartner && isCashPayment(matchedPartner.name));

          let msg = `¡Hola *${editCustomerName.trim() || 'estimado cliente'}*! 👋\n\n`;
          msg += `Te compartimos la actualización de tu *Pedido #${orderToEdit.orderNumber}* en *${storeConfig.storeName || 'nuestra tienda'}*:\n\n`;
          msg += `📦 *Detalle Actualizado de Productos:*\n`;
          editItems.forEach((it) => {
            msg += `• ${it.quantity}x ${it.name} ($${(Number(it.salePrice) * Number(it.quantity)).toFixed(2)})\n`;
          });
          msg += `\n`;

          if (isPickup) {
            msg += `🏢 *Modalidad de Entrega:* Retiro en Local / Tienda (${finalAddress})\n`;
            msg += `💰 *TOTAL A PAGAR:* $${totalAmount.toFixed(2)} ${currency}\n`;
          } else {
            msg += `💵 *Subtotal:* $${editSubtotal.toFixed(2)} ${currency}\n`;
            if (Number(editShippingCost) > 0) {
              msg += `🚚 *Valor de Envío:* $${Number(editShippingCost).toFixed(2)} ${currency}\n`;
            }
            msg += `💰 *TOTAL A PAGAR:* $${totalAmount.toFixed(2)} ${currency}\n`;
            msg += `📍 *Dirección de Entrega:* ${finalAddress}\n`;
            if (editTrackingCarrier.trim() || editTrackingNumber.trim()) {
              msg += `🚚 *Seguimiento Envío:* ${editTrackingCarrier.trim() || 'Courier'} - Guía #${editTrackingNumber.trim() || 'N/A'}\n`;
            }
          }

          msg += `\n💳 *Método de Pago:* ${partnerName}\n`;
          if (partnerDetails) {
            msg += `📝 *Datos para el Pago / Transferencia:*\n${partnerDetails}\n\n`;
          }
          if (editPaymentVoucher.trim()) {
            msg += `🧾 *N° Comprobante Registrado:* ${editPaymentVoucher.trim()}\n`;
          }
          if (editNotes.trim()) {
            msg += `📌 *Observaciones:* ${editNotes.trim()}\n`;
          }

          if (isCash) {
            msg += `\n💵 *Modalidad:* Pago en efectivo acordado al recibir o retirar tu pedido.`;
          } else if (editStatus === 'confirmed' && editPaymentVoucher.trim()) {
            msg += `\n✅ *Estado del Pago:* Comprobante verificado y registrado. Procederemos con la preparación y despacho.`;
          } else {
            msg += `\n📲 *Instrucción de Pago:* Por favor realiza el pago o transferencia con los datos indicados y envíanos la foto o captura del comprobante por aquí para despachar tu pedido. ¡Muchas gracias!`;
          }

          const waLink = buildWhatsAppLink(normPhone.whatsappDigits, msg);
          window.open(waLink, '_blank');
        }
      }

      setOrderToEdit(null);
      setOrderToConfirm(null);
    } catch (err: any) {
      console.error('Error saving edited order:', err);
      showToast('❌ Error al actualizar el pedido: ' + (err.message || 'Error'));
    } finally {
      setIsSavingEditOrder(false);
    }
  };

  // Save Manual Order
  const handleSaveManualOrder = async (
    notifyViaWhatsApp = false,
    goToSupplierPurchase = false,
    openShippingManagement = false
  ) => {
    if (!manualCustomerPhone.trim()) {
      showToast('⚠️ Ingresa el número de WhatsApp o teléfono del cliente');
      return;
    }
    if (manualCustomerCi.trim()) {
      const ciVal = validateEcuadorId(manualCustomerCi.trim(), true);
      if (!ciVal.isValid) {
        showToast(`⚠️ Cédula o RUC ecuatoriano inválido: ${ciVal.error}`);
        return;
      }
    }
    if (manualItems.length === 0) {
      showToast('⚠️ Agrega al menos 1 producto al detalle del pedido');
      return;
    }

    setIsSubmittingManualOrder(true);
    try {
      let shippingDestination = '';
      if (manualDeliveryType === 'shipping') {
        if (manualAddressMode === 'structured') {
          const parts: string[] = [];
          if (manualProvince.trim()) parts.push(`Prov: ${manualProvince.trim()}`);
          if (manualCanton.trim()) parts.push(`Cantón: ${manualCanton.trim()}`);
          if (manualParish.trim()) parts.push(`Parr: ${manualParish.trim()}`);
          if (manualExactAddress.trim()) parts.push(`Dir: ${manualExactAddress.trim()}`);
          if (manualReference.trim()) parts.push(`Ref: ${manualReference.trim()}`);
          shippingDestination = parts.join(' | ');
        }
        if (!shippingDestination.trim()) {
          shippingDestination = manualShippingAddress.trim();
        }
        if (!shippingDestination.trim()) {
          shippingDestination = manualCustomerGeneralAddress.trim() || 'Envío a Domicilio';
        }
      }

      const storePickupLoc = storeConfig.address || 'Local Principal de la Tienda';
      const finalAddress = manualDeliveryType === 'pickup'
        ? `Retiro en Local (${storePickupLoc})${manualCustomerGeneralAddress.trim() ? ` - Dir. Cliente: ${manualCustomerGeneralAddress.trim()}` : ''}`
        : shippingDestination;

      const shippingFee = manualDeliveryType === 'shipping' ? Math.max(0, Number(manualShippingCost) || 0) : 0;
      const totalAmount = manualSubtotal + shippingFee;
      const normPhone = normalizeEcuadorPhone(manualCustomerPhone);
      const cleanPhone = normPhone.formattedLocal || normPhone.local || manualCustomerPhone.trim();

      // If there are deficit items, append informative notes if not already noted
      let finalNotes = manualNotes.trim();
      if (manualStockAnalysis.hasDeficit && !finalNotes.includes('[Bajo Pedido]')) {
        const deficitSummary = manualStockAnalysis.itemsWithDeficit.map(i => `${i.name} (Faltan ${i.missing})`).join(', ');
        finalNotes = (finalNotes ? `${finalNotes}\n` : '') + `🔍 [Bajo Pedido] Faltan ${manualStockAnalysis.totalDeficitUnits} un. (${deficitSummary})`;
      }

      const orderPayload = {
        customerName: manualCustomerName.trim() || 'Cliente WhatsApp',
        customerPhone: cleanPhone,
        customerEmail: manualCustomerEmail.trim() || undefined,
        customerCi: manualCustomerCi.trim() || undefined,
        ci: manualCustomerCi.trim() || undefined,
        customerAddress: finalAddress,
        clientAddress: manualCustomerGeneralAddress.trim() || undefined,
        shippingAddress: manualDeliveryType === 'shipping' ? (shippingDestination || undefined) : undefined,
        deliveryType: manualDeliveryType,
        trackingCarrier: manualDeliveryType === 'shipping' ? (manualTrackingCarrier.trim() || undefined) : undefined,
        paymentMethod: manualPaymentMethod || 'whatsapp',
        status: manualStatus,
        paymentVoucher: manualPaymentVoucher.trim() || undefined,
        notes: finalNotes || undefined,
        items: manualItems,
        totalAmount,
        decrementStock: true,
      };

      const result = await onCreateOrder(orderPayload);

      if (result.success) {
        const orderNum = result.orderNumber || result.order?.orderNumber || 'PED-REC';
        
        // If status or voucher were not handled in createOrder, update it as fallback
        if (result.order?.id && (manualStatus !== 'pending' || manualPaymentVoucher.trim()) && result.order?.status !== manualStatus) {
          await onUpdateOrderStatus(
            result.order.id,
            manualStatus,
            manualPaymentVoucher.trim() || undefined,
            finalNotes || undefined
          );
        }

        if (manualStockAnalysis.hasDeficit) {
          showToast(`✓ Pedido #${orderNum} creado (${manualStockAnalysis.totalDeficitUnits} un. bajo encargo registradas)`);
        } else {
          showToast(`✓ Pedido manual #${orderNum} creado exitosamente`);
        }

        // If user wants to go directly to generate / manage the supplier purchase order
        if ((goToSupplierPurchase || manualAutoCreatePurchase) && result.order && onGenerateSupplierPurchase) {
          try {
            await onGenerateSupplierPurchase(result.order);
          } catch (pErr) {
            console.warn('Auto-generate supplier purchase warning:', pErr);
          }
        }

        // If user wants to immediately manage the shipping workflow (same 3-step modal)
        if (openShippingManagement && manualDeliveryType === 'shipping' && result.order) {
          setOrderForPendingShipping(result.order);
        }

        if (notifyViaWhatsApp) {
          if (!normPhone.whatsappDigits || !normPhone.isValid) {
            showToast('⚠️ No se abrió WhatsApp porque el número registrado no es válido.');
          } else {
            const activePartners = paymentPartners.filter((p) => p.active !== false);
            const matchedPartner = activePartners.find(
              (p) =>
                p.id === manualPaymentMethod ||
                p.name.toLowerCase() === (manualPaymentMethod || '').toLowerCase() ||
                (manualPaymentMethod && p.name.toLowerCase().includes(manualPaymentMethod.toLowerCase())) ||
                (manualPaymentMethod && manualPaymentMethod.toLowerCase().includes(p.name.toLowerCase()))
            );
            const partnerName = matchedPartner ? matchedPartner.name : (manualPaymentMethod || 'Coordinar con la tienda');
            const partnerDetails = matchedPartner?.details?.trim();
            const isPickup = manualDeliveryType === 'pickup';
            const isCash = isCashPayment(manualPaymentMethod) || (matchedPartner && isCashPayment(matchedPartner.name));

            let msg = `¡Hola *${manualCustomerName.trim() || 'estimado cliente'}*! 👋 Tu pedido ha sido registrado con éxito en *${storeConfig.storeName}*:\n\n`;
            msg += `📋 *N° Pedido:* #${orderNum}\n`;
            msg += `📦 *Detalle de Productos:*\n`;
            manualItems.forEach((it) => {
              msg += `• ${it.quantity}x ${it.name} - $${(it.salePrice * it.quantity).toFixed(2)}\n`;
            });
            if (manualDeliveryType === 'shipping' && shippingFee > 0) {
              msg += `\n📦 *Subtotal Productos:* $${manualSubtotal.toFixed(2)} ${currency}\n`;
              msg += `🚚 *Costo de Envío (${manualTrackingCarrier}):* $${shippingFee.toFixed(2)} ${currency}\n`;
            }
            msg += `\n💰 *Total a Cobrar:* $${totalAmount.toFixed(2)} ${currency}\n`;
            msg += `📍 *Modalidad:* ${isPickup ? 'Retiro en Local' : `Envío: ${finalAddress}`}\n`;
            if (manualDeliveryType === 'shipping' && manualTrackingCarrier) {
              msg += `🚚 *Courier / Transporte:* ${manualTrackingCarrier}\n`;
            }
            msg += `💳 *Método de Pago:* ${partnerName}\n`;
            if (partnerDetails) {
              msg += `📝 *Datos para el Pago / Transferencia:*\n${partnerDetails}\n\n`;
            }
            if (manualPaymentVoucher.trim()) {
              msg += `🧾 *Comprobante:* ${manualPaymentVoucher.trim()}\n`;
            }
            if (manualNotes.trim()) {
              msg += `📌 *Nota:* ${manualNotes.trim()}\n`;
            }

            if (isCash) {
              msg += `\n💵 *Modalidad:* Pago en efectivo acordado al recibir o retirar tu pedido.`;
            } else if (manualStatus === 'confirmed' && manualPaymentVoucher.trim()) {
              msg += `\n✅ *Estado del Pago:* Comprobante verificado y registrado.`;
            } else {
              msg += `\n📲 *Instrucción de Pago:* Por favor realiza el pago o transferencia con los datos indicados y envíanos la foto o captura del comprobante por aquí para despachar tu pedido. ¡Muchas gracias!`;
            }

            const waLink = buildWhatsAppLink(normPhone.whatsappDigits, msg);
            window.open(waLink, '_blank');
          }
        }

        // Reset manual order form
        setManualCustomerPhone('');
        setManualCustomerName('');
        setManualCustomerCi('');
        setManualCustomerEmail('');
        setManualCustomerGeneralAddress('');
        setManualShippingAddress('');
        setManualProvince('');
        setManualCanton('');
        setManualParish('');
        setManualExactAddress('');
        setManualReference('');
        setManualAddressMode('structured');
        setManualShippingCost('0');
        setMatchedCustomerInfo(null);
        setShowCustomerSuggestions(false);
        setManualDeliveryType('pickup');
        setManualPaymentMethod(activeConfiguredPayments[0]?.name || 'whatsapp');
        setManualPaymentVoucher('');
        setManualNotes('');
        setManualStatus('pending');
        setManualItems([]);
        setManualProductSearch('');
        setIsManualOrderModalOpen(false);
      } else {
        showToast('❌ No se pudo crear el pedido');
      }
    } catch (err: any) {
      console.error('Error creating manual order:', err);
      showToast('❌ Error al crear el pedido manual: ' + (err.message || 'Error'));
    } finally {
      setIsSubmittingManualOrder(false);
    }
  };

  // Helper to compute effective item sale price factoring discountPercent
  const getItemEffectivePrice = (item: InventoryItem): number => {
    const regular = Number(item.salePrice) || 0;
    const disc = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
    return disc > 0 ? regular * (1 - disc / 100) : regular;
  };

    // Cart operations
  const cartTotalItems = useMemo(() => {
    return cart.reduce((acc, it) => acc + it.quantity, 0);
  }, [cart]);

  const cartSubtotal = useMemo(() => {
    return cart.reduce((acc, it) => acc + getItemEffectivePrice(it.item) * it.quantity, 0);
  }, [cart]);

  const deliveryFee = deliveryType === 'shipping' ? Number(storeConfig.deliveryFee || 0) : 0;
  const cartTotal = cartSubtotal + deliveryFee;

  const handleAddToCart = (item: InventoryItem, qty: number = 1) => {
    if (isCustomerView && storeConfig.isActive === false) {
      showToast('⚠️ La tienda está en modo pausa/mantenimiento. No se pueden agregar productos para pedidos en este momento.');
      return;
    }
    setCart((prev) => {
      const existing = prev.find((ci) => ci.item.id === item.id);
      if (existing) {
        const newQty = existing.quantity + qty;
        return prev.map((ci) => (ci.item.id === item.id ? { ...ci, quantity: newQty } : ci));
      } else {
        return [...prev, { item, quantity: Math.max(1, qty) }];
      }
    });
    trackAddToCart(item.id, item.name, qty, getItemEffectivePrice(item));
    showToast(`✓ Agregado al carrito: ${item.name}`);
  };

  const handleUpdateCartQty = (itemId: number, newQty: number) => {
    if (newQty <= 0) {
      setCart((prev) => prev.filter((ci) => ci.item.id !== itemId));
    } else {
      setCart((prev) =>
        prev.map((ci) => {
          if (ci.item.id === itemId) {
            return { ...ci, quantity: newQty };
          }
          return ci;
        })
      );
    }
  };

  const handleRemoveFromCart = (itemId: number) => {
    setCart((prev) => prev.filter((ci) => ci.item.id !== itemId));
  };

  // WhatsApp Order Text Formatter (using 100% compatible WhatsApp characters)
  const generateWhatsAppOrderText = (orderNum?: string) => {
    const store = storeConfig.storeName || 'Comerxia Store';
    const num = orderNum || `PED-${Date.now().toString().slice(-6)}`;
    
    let displayPhone = 'Coordinar por este chat';
    if (customerPhone && customerPhone.trim()) {
      const phoneNorm = normalizeEcuadorPhone(customerPhone.trim());
      displayPhone = phoneNorm.local
        ? `${phoneNorm.local} (${phoneNorm.international})`
        : customerPhone.trim();
    }

    const activePartners = paymentPartners.filter((p) => p.active !== false);
    const matchedPartner = activePartners.find(
      (p) =>
        p.id === paymentMethod ||
        p.name.toLowerCase() === paymentMethod.toLowerCase() ||
        (paymentMethod && p.name.toLowerCase().includes(paymentMethod.toLowerCase())) ||
        (paymentMethod && paymentMethod.toLowerCase().includes(p.name.toLowerCase()))
    );
    const partnerName = matchedPartner ? matchedPartner.name : (paymentMethod ? paymentMethod.toUpperCase() : 'COORDINAR POR WHATSAPP');

    const clientDisplay = customerName.trim() || 'Cliente WhatsApp (por este chat)';
    const deliveryDisplay = deliveryType === 'shipping'
      ? (customerAddress.trim() ? `Envío a domicilio (${customerAddress.trim()})` : 'Envío a domicilio (Coordinar por este chat)')
      : 'Retiro en local';

    let text = `🛒 *NUEVO PEDIDO - ${store.toUpperCase()}*\n`;
    text += `*Pedido:* #${num}\n`;
    text += `--------------------------------\n`;
    text += `👤 *Cliente:* ${clientDisplay}\n`;
    text += `📱 *Teléfono:* ${displayPhone}\n`;
    text += `📍 *Entrega:* ${deliveryDisplay}\n`;
    text += `💳 *Método de Pago:* ${partnerName}\n`;
    if (matchedPartner?.details) {
      text += `📝 *Datos de Pago:* ${matchedPartner.details}\n`;
    }
    text += `--------------------------------\n`;
    text += `📦 *PRODUCTOS:*\n`;

    cart.forEach((ci) => {
      const regular = Number(ci.item.salePrice) || 0;
      const disc = Math.max(0, Math.min(100, Number(ci.item.discountPercent) || 0));
      const effective = disc > 0 ? regular * (1 - disc / 100) : regular;
      const itemSub = (effective * ci.quantity).toFixed(2);

      if (disc > 0) {
        text += `- *${ci.quantity}x* ${ci.item.name} (SKU: ${ci.item.sku})\n  🔥 *OFERTA -${disc}%*: $${effective.toFixed(2)} ${currency} (Antes ~$${regular.toFixed(2)}~) | Subtotal: $${itemSub}\n`;
      } else {
        text += `- *${ci.quantity}x* ${ci.item.name} (SKU: ${ci.item.sku})\n  Precio: $${effective.toFixed(2)} ${currency} | Subtotal: $${itemSub}\n`;
      }
    });

    text += `--------------------------------\n`;
    text += `Subtotal: $${cartSubtotal.toFixed(2)} ${currency}\n`;
    if (deliveryFee > 0) {
      text += `Costo de Envio: $${deliveryFee.toFixed(2)} ${currency}\n`;
    }
    text += `💰 *TOTAL A PAGAR: $${cartTotal.toFixed(2)} ${currency}*\n`;

    if (orderNotes.trim()) {
      text += `--------------------------------\n`;
      text += `📝 *Notas:* ${orderNotes.trim()}\n`;
    }
    text += `--------------------------------\n`;
    text += `¡Hola! Acabo de hacer este pedido en su tienda online (#${num}). Adjunto los detalles para coordinar la entrega y el pago. ¡Muchas gracias!`;

    return text;
  };

  // Send Order via WhatsApp Direct - Simplified one-click flow
  const handleSendViaWhatsApp = async () => {
    setCheckoutError(null);

    // Guard: Prevent order submission if store is paused / inactive
    if (isCustomerView && storeConfig.isActive === false) {
      setCheckoutError('La tienda se encuentra temporalmente en mantenimiento y no está aceptando pedidos. Por favor comunícate directamente con la tienda por WhatsApp.');
      showToast('⚠️ La tienda está pausada y no recibe pedidos');
      return;
    }

    if (cart.length === 0) {
      setCheckoutError('El carrito de compras está vacío.');
      showToast('⚠️ Agrega productos al carrito');
      return;
    }

    // Buyer info is completely optional!
    const resolvedName = customerName.trim() || 'Cliente WhatsApp';
    let resolvedPhone = 'Coordinar por WhatsApp';
    if (customerPhone.trim()) {
      const phoneNorm = normalizeEcuadorPhone(customerPhone.trim());
      resolvedPhone = phoneNorm.formattedLocal || phoneNorm.local || customerPhone.trim();
    }
    const resolvedAddress = deliveryType === 'shipping'
      ? (customerAddress.trim() || 'A coordinar por WhatsApp')
      : 'Retiro en Local';

    setIsSubmittingOrder(true);
    try {
      // 1. Register order in database automatically
      const result = await onCreateOrder({
        customerName: resolvedName,
        customerPhone: resolvedPhone,
        customerAddress: resolvedAddress,
        deliveryType: deliveryType,
        items: cart.map((ci) => {
          const effectivePrice = getItemEffectivePrice(ci.item);
          return {
            id: ci.item.id,
            name: ci.item.name,
            sku: ci.item.sku,
            salePrice: effectivePrice,
            quantity: ci.quantity,
            imageUrl: ci.item.imageUrl,
          };
        }),
        totalAmount: cartTotal,
        paymentMethod: paymentMethod || 'whatsapp',
        notes: orderNotes.trim() || 'Compra directa vía Tienda Online WhatsApp',
        isOnlineStore: true,
        source: 'online_store',
        customerCi: '',
        ci: '',
      });

      const orderNumber = result.orderNumber || result.order?.orderNumber || `PED-${Date.now().toString().slice(-6)}`;
      setLastPlacedOrder({
        orderNumber,
        customerName: resolvedName,
        customerPhone: resolvedPhone,
        customerAddress: resolvedAddress,
        items: cart,
        totalAmount: cartTotal,
        date: new Date().toLocaleString('es-ES'),
      });

      // 2. Format message and open direct WhatsApp to store
      const rawText = generateWhatsAppOrderText(orderNumber);
      const waUrl = buildWhatsAppLink(storeConfig.whatsappNumber, rawText);

      trackWhatsAppClick(cartTotal, cartTotalItems, orderNumber);

      window.open(waUrl, '_blank');

      // 3. Clear cart and show confirmation screen
      setCart([]);
      setCheckoutError(null);
      setBuyerVoucherInput('');
      setIsBuyerOrderConfirmed(false);
      setCartStep('success');
      onRefreshProducts();
      showToast(`✅ Pedido #${orderNumber} creado en el sistema`);
    } catch (err: any) {
      console.error('Error sending order:', err);
      setCheckoutError('Hubo un error al procesar el pedido. Intenta nuevamente.');
      showToast('❌ Error al procesar pedido: ' + (err.message || 'Error'));
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Buyer direct confirmation with payment voucher
  const handleBuyerConfirmOrder = async () => {
    if (!lastPlacedOrder || !lastPlacedOrder.orderNumber) return;
    if (!buyerVoucherInput.trim()) {
      showToast('⚠️ Ingresa el número o código de comprobante de transferencia');
      return;
    }

    setIsBuyerVoucherSubmitting(true);
    try {
      const res = await fetch('/api/orders/buyer-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: lastPlacedOrder.orderNumber,
          paymentVoucher: buyerVoucherInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Error al confirmar comprobante');
      }

      setIsBuyerOrderConfirmed(true);
      showToast('✅ ¡Venta confirmada exitosamente! Tu stock ha quedado reservado.');
      onRefreshProducts();
    } catch (err: any) {
      showToast('❌ ' + (err.message || 'Error al confirmar comprobante'));
    } finally {
      setIsBuyerVoucherSubmitting(false);
    }
  };

  // Direct buy product (adds to cart & opens cart drawer directly to purchase like the cart buy button)
  const handleDirectBuyProduct = (item: InventoryItem, e?: React.MouseEvent, qty: number = 1) => {
    if (e) e.stopPropagation();
    if (isCustomerView && storeConfig.isActive === false) {
      showToast('⚠️ La tienda está en modo pausa/mantenimiento. No se pueden realizar pedidos en este momento.');
      return;
    }
    const addQuantity = Math.max(1, qty);
    // Add item to cart if not already present, or increment by selected quantity (allowed even with 0 stock / bajo pedido)
    setCart((prev) => {
      const existing = prev.find((ci) => ci.item.id === item.id);
      if (!existing) {
        return [...prev, { item, quantity: addQuantity }];
      }
      return prev.map((ci) => (ci.item.id === item.id ? { ...ci, quantity: ci.quantity + addQuantity } : ci));
    });
    trackAddToCart(item.id, item.name, addQuantity, getItemEffectivePrice(item));
    setCartStep('cart');
    setIsCartOpen(true);
    if (!isCustomerView && quickViewProduct) {
      handleCloseAdminProductModal();
    }
    showToast(`✓ ${item.name} (${addQuantity}) agregado al carrito`);
  };

  // Save Store Settings
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingConfig(true);
    try {
      const normStore = normalizeEcuadorPhone(whatsappInput);
      const formattedStorePhone = normStore.international || whatsappInput.trim();

      const ok = await onUpdateStoreConfig({
        storeName: storeNameInput.trim() || 'Comerxia Store',
        whatsappNumber: formattedStorePhone,
        address: addressInput.trim(),
        description: descriptionInput.trim(),
        bannerText: bannerTextInput.trim(),
        deliveryFee: Number(deliveryFeeInput) || 0,
        showStock: showStockInput,
        logoUrl: storeLogoInput,
        logoDesktopUrl: storeLogoDesktopInput,
        courierLogos: courierPartners,
        paymentLogos: paymentPartners,
        theme: themeInput,
        themeColors: themePalettes,
      });
      if (ok) {
        setIsFormDirty(false);
        showToast('✓ Configuración de la tienda, logos, envíos y pagos guardados correctamente');
      }
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Parse photos for product
  const getProductPhotos = (item: InventoryItem): string[] => {
    return getProductPhotosWithFallback(item);
  };

  return (
    <div className={`space-y-6 animate-fadeIn ${isCustomerView ? 'pb-28 sm:pb-32' : 'pb-16'} ${isCustomerView && activeTheme === 'boutique' ? 'text-zinc-100' : ''}`}>
      {/* Toast alert */}
      {toastMessage && (
        <div className={`fixed ${isCustomerView ? 'bottom-20 sm:bottom-22' : 'bottom-6'} right-6 z-[65] bg-emerald-950/95 border border-emerald-500 text-emerald-200 px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-2 text-xs font-semibold animate-bounce`}>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Admin Warning: Store is Deactivated / in Maintenance Mode */}
      {storeConfig.isActive === false && !isCustomerView && (
        <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-400 rounded-2xl p-4 sm:p-5 text-amber-950 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md animate-fadeIn">
          <div className="flex items-start space-x-3 text-xs">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold flex-shrink-0 shadow-xs">
              <PauseCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-black text-sm text-slate-900 flex items-center gap-2 flex-wrap">
                <span>Tu Tienda Online está en Modo Mantenimiento (Pausada)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-950 font-black border border-amber-400">
                  PAUSADA
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Los clientes que ingresen a la tienda online verán la pantalla de mantenimiento o catálogo informativo.{' '}
                Como administrador puedes seguir gestionando pedidos e inventario normalmente.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <button
              onClick={async () => {
                await onUpdateStoreConfig({ isActive: true });
                showToast('✓ ¡Tienda online reactivada y publicada exitosamente!');
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-md shadow-emerald-600/20 active:scale-95"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Reactivar Tienda Ahora</span>
            </button>
            <button
              onClick={() => handleSwitchTab('settings')}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-bold transition cursor-pointer shadow-2xs"
            >
              Configurar Aviso
            </button>
          </div>
        </div>
      )}

      {/* Customer Preview Notification (Only shown when merchant toggles preview inside admin) */}
      {!isCustomerOnly && isCustomerMode && (
        <div className="bg-amber-950/80 border border-amber-500/50 rounded-2xl p-3 sm:p-4 text-amber-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center space-x-2 text-xs">
            <Eye className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              <strong>Modo Vista Previa de Cliente:</strong> Así es como tus compradores experimentan la tienda. Los clientes <strong>no ven</strong> opciones ni datos de administración.
            </span>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <button
              onClick={() => {
                copyTextToClipboard(customerStoreUrl, '✓ Enlace de clientes copiado');
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition flex items-center space-x-1 cursor-pointer shadow"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar Enlace Clientes</span>
            </button>
            <button
              onClick={() => {
                if (onExitCustomerMode) onExitCustomerMode();
                setIsCustomerMode(false);
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-semibold transition cursor-pointer active:scale-95 shadow-2xs"
            >
              Salir de Vista Previa
            </button>
          </div>
        </div>
      )}

      {/* Customer Inactive Store: When store is paused and allowCatalogBrowsing is false, show Maintenance Screen */}
      {isCustomerView && storeConfig.isActive === false && !storeConfig.allowCatalogBrowsing ? (
        <StoreMaintenanceScreen
          storeConfig={storeConfig}
          isCustomerMode={isCustomerMode}
          isCustomerOnly={isCustomerOnly}
          onExitCustomerMode={() => {
            if (onExitCustomerMode) onExitCustomerMode();
            setIsCustomerMode(false);
          }}
        />
      ) : (
        <>
          {/* If store is paused but allowCatalogBrowsing is true, show a friendly top banner to customers */}
          {isCustomerView && storeConfig.isActive === false && storeConfig.allowCatalogBrowsing && (
            <div className="bg-amber-500/10 border border-amber-400/80 rounded-2xl p-4 text-amber-950 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs animate-fadeIn">
              <div className="flex items-center space-x-3 text-xs">
                <PauseCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <div>
                  <strong className="text-amber-900">{storeConfig.maintenanceTitle || 'Catálogo en Modo Mantenimiento'}:</strong>{' '}
                  <span className="text-amber-800">
                    {storeConfig.maintenanceMessage || 'Puedes explorar nuestros productos, pero la toma de pedidos automáticos está pausada temporalmente. ¡Contáctanos por WhatsApp!'}
                  </span>
                </div>
              </div>
              {storeConfig.whatsappNumber && (
                <a
                  href={`https://wa.me/${normalizeEcuadorPhone(storeConfig.whatsappNumber).whatsappDigits}?text=${encodeURIComponent(
                    `¡Hola ${storeConfig.storeName || ''}! Quisiera consultar sobre la disponibilidad de sus productos.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center space-x-1.5 flex-shrink-0 shadow-xs"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Consultar por WhatsApp</span>
                </a>
              )}
            </div>
          )}

          {/* VIEW: 1. CATALOG OF PRODUCTS (Dynamic Themed Layouts per Theme) */}
          {storeTab === 'catalog' && (
            <StoreThemedCatalog
              props={{
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
                onAddToCart: handleAddToCart,
                onUpdateCartQty: handleUpdateCartQty,
                onDirectBuyProduct: handleDirectBuyProduct,
                onShareProductWhatsApp: handleShareProductWhatsApp,
                onCopyProductLink: handleCopyProductLink,
                onQuickViewProduct: (item) => {
                  handleOpenProductDetail(item);
                },
                storeConfig: {
                  ...storeConfig,
                  theme: activeTheme,
                  themeColors: themePalettes,
                },
                courierPartners,
                paymentPartners,
                activeTheme,
                activePalette,
                themeColors: themePalettes,
                themeStyles,
                currency,
                isCustomerView,
                isCustomerOnly,
                isCustomerMode,
                storeTab,
                setStoreTab,
                orders,
                isLogoAnimating,
                onLogoClick: handleLogoClick,
                onOpenCart: () => {
                  setCartStep('cart');
                  setIsCartOpen(true);
                },
                onOpenShareModal: () => setIsShareModalOpen(true),
                isFilterSheetOpen,
                onToggleFilterSheet: setIsFilterSheetOpen,
              }}
            />
          )}
        </>
      )}

      {/* VIEW: 2. ORDERS MANAGEMENT (Orders Dashboard) */}
      {storeTab === 'orders' && !isCustomerOnly && !isCustomerMode && (
        <div className="space-y-5">
          {/* DATE RANGE FILTER & FINANCIAL SALES SUMMARY BAR */}
          <div className="bg-white border border-slate-300 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2 text-xs font-black text-slate-900">
                  <Calendar className="w-4 h-4 text-sky-600" />
                  <span>Filtrar Ventas por Fecha / Período:</span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium">
                  Consulta las métricas y balance de ingresos según el día, mes o rango personalizado.
                </p>
              </div>

              {/* Date Filter Buttons */}
              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5 text-xs">
                <button
                  onClick={() => setOrderDateRangeFilter('all')}
                  className={`px-3 py-1.5 rounded-xl font-extrabold transition cursor-pointer ${
                    orderDateRangeFilter === 'all'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-800 hover:text-slate-950 hover:bg-slate-200 border border-slate-300'
                  }`}
                >
                  Todo el Historial
                </button>

                <button
                  onClick={() => setOrderDateRangeFilter('today')}
                  className={`px-3 py-1.5 rounded-xl font-extrabold transition cursor-pointer flex items-center space-x-1 ${
                    orderDateRangeFilter === 'today'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-800 hover:text-slate-950 hover:bg-slate-200 border border-slate-300'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Hoy (Día)</span>
                </button>

                <button
                  onClick={() => setOrderDateRangeFilter('month')}
                  className={`px-3 py-1.5 rounded-xl font-extrabold transition cursor-pointer flex items-center space-x-1 ${
                    orderDateRangeFilter === 'month'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-800 hover:text-slate-950 hover:bg-slate-200 border border-slate-300'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Este Mes</span>
                </button>

                <button
                  onClick={() => setOrderDateRangeFilter('custom')}
                  className={`px-3 py-1.5 rounded-xl font-extrabold transition cursor-pointer flex items-center space-x-1 ${
                    orderDateRangeFilter === 'custom'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-800 hover:text-slate-950 hover:bg-slate-200 border border-slate-300'
                  }`}
                >
                  <CalendarRange className="w-3.5 h-3.5" />
                  <span>Personalizada</span>
                </button>
              </div>
            </div>

            {/* Custom Date Inputs if Custom is selected */}
            {orderDateRangeFilter === 'custom' && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-300 flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="text-slate-700 font-bold">Desde:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 font-mono focus:outline-none focus:border-sky-500 shadow-xs font-bold"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-slate-700 font-bold">Hasta:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 font-mono focus:outline-none focus:border-sky-500 shadow-xs font-bold"
                  />
                </div>

                {(customStartDate || customEndDate) && (
                  <button
                    onClick={() => {
                      setCustomStartDate('');
                      setCustomEndDate('');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-[11px] font-bold transition cursor-pointer"
                  >
                    Limpiar Rango
                  </button>
                )}
              </div>
            )}

            {/* Financial Summary Highlight Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Card 1: Total Sales */}
              <div className="bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between min-h-[116px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate" title={`Ventas Totales (${orderDateRangeFilter === 'today' ? 'Hoy' : orderDateRangeFilter === 'month' ? 'Este Mes' : orderDateRangeFilter === 'custom' ? 'Rango' : 'Historial'})`}>
                    Ventas ({orderDateRangeFilter === 'today' ? 'Hoy' : orderDateRangeFilter === 'month' ? 'Este Mes' : orderDateRangeFilter === 'custom' ? 'Rango' : 'Total'})
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <div
                    className={`font-mono text-slate-900 leading-tight whitespace-nowrap ${getMetricFontSizeClass(formatSmartCurrency(orderMetrics.totalSalesVolume, currency))}`}
                    title={`Valor exacto: ${formatExactCurrency(orderMetrics.totalSalesVolume, currency)}`}
                  >
                    {formatSmartCurrency(orderMetrics.totalSalesVolume, currency)}
                  </div>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
                    {orderMetrics.nonCancelledCount} pedido(s) activos
                  </p>
                </div>
              </div>

              {/* Card 2: Confirmed Orders Metric & Value */}
              <div className="bg-white border border-slate-200 hover:border-purple-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between min-h-[116px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate" title="Pedidos Confirmados">
                    Confirmados
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shrink-0">
                    <Receipt className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <div
                    className={`font-mono text-purple-900 leading-tight whitespace-nowrap ${getMetricFontSizeClass(formatSmartCurrency(orderMetrics.confirmedSalesVolume, currency))}`}
                    title={`Valor exacto: ${formatExactCurrency(orderMetrics.confirmedSalesVolume, currency)}`}
                  >
                    {formatSmartCurrency(orderMetrics.confirmedSalesVolume, currency)}
                    <span className="text-xs font-semibold text-purple-700 ml-1">({orderCounts.confirmed})</span>
                  </div>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
                    Comprobante verificado
                  </p>
                </div>
              </div>

              {/* Card 3: Delivered Orders Metric & Value */}
              <div className="bg-white border border-slate-200 hover:border-teal-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between min-h-[116px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate" title="Pedidos Entregados">
                    Entregados
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center shrink-0">
                    <BadgeCheck className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <div
                    className={`font-mono text-teal-900 leading-tight whitespace-nowrap ${getMetricFontSizeClass(formatSmartCurrency(orderMetrics.deliveredSalesVolume, currency))}`}
                    title={`Valor exacto: ${formatExactCurrency(orderMetrics.deliveredSalesVolume, currency)}`}
                  >
                    {formatSmartCurrency(orderMetrics.deliveredSalesVolume, currency)}
                    <span className="text-xs font-semibold text-teal-700 ml-1">({orderCounts.delivered})</span>
                  </div>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
                    Cobrados y completados
                  </p>
                </div>
              </div>

              {/* Card 4: Ticket Promedio & Envíos */}
              <div className="bg-white border border-slate-200 hover:border-sky-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between min-h-[116px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate" title="Ticket Promedio">
                    Ticket Promedio
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <div
                    className={`font-mono text-slate-900 leading-tight whitespace-nowrap ${getMetricFontSizeClass(formatSmartCurrency(orderMetrics.averageTicket, currency))}`}
                    title={`Valor exacto: ${formatExactCurrency(orderMetrics.averageTicket, currency)}`}
                  >
                    {formatSmartCurrency(orderMetrics.averageTicket, currency)}
                  </div>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
                    {orderCounts.shipped > 0 ? `${orderCounts.shipped} en tránsito/despacho` : 'Promedio general por orden'}
                  </p>
                </div>
              </div>
            </div>

            {/* Breakdown of Sales by Payment Method in selected period */}
            {orderMetrics.paymentBreakdown.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-2">
                  Desglose de Ingresos por Método de Pago en el Período:
                </span>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-wrap">
                  {orderMetrics.paymentBreakdown.map((pm, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center space-x-2 text-xs"
                    >
                      <CreditCard className="w-3.5 h-3.5 text-sky-600" />
                      <span className="font-semibold text-slate-700">{pm.name}:</span>
                      <span className="font-mono font-bold text-emerald-600">
                        ${pm.total.toFixed(2)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-medium">
                        {pm.count} {pm.count === 1 ? 'pedido' : 'pedidos'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quick Metrics KPI Cards (5-Status Grid) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Total Orders Card */}
            <div
              onClick={() => setOrderStatusFilter('all')}
              className={`p-3.5 rounded-2xl border space-y-1 cursor-pointer transition relative overflow-hidden ${
                orderStatusFilter === 'all'
                  ? 'bg-sky-50 border-sky-500 ring-1 ring-sky-400'
                  : 'bg-white border-slate-200 hover:border-sky-300 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Total Período</span>
                <div className="w-6 h-6 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                  <Package className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-xl font-black text-slate-900 font-mono">{orderCounts.all}</span>
                <span className="text-xs text-slate-500 font-mono">
                  ${orderMetrics.totalSalesVolume.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Pending Orders Card */}
            <div
              onClick={() => setOrderStatusFilter('pending')}
              className={`p-3.5 rounded-2xl border space-y-1 cursor-pointer transition relative overflow-hidden ${
                orderStatusFilter === 'pending'
                  ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-400'
                  : 'bg-white border-slate-200 hover:border-amber-300 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                  {orderCounts.pending > 0 && (
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  )}
                  Pendientes
                </span>
                <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-xl font-black text-amber-700 font-mono">{orderCounts.pending}</span>
                <span className="text-xs text-amber-600 font-mono">
                  ${orderMetrics.pendingSalesVolume.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Confirmed Orders Card */}
            <div
              onClick={() => setOrderStatusFilter('confirmed')}
              className={`p-3.5 rounded-2xl border space-y-1 cursor-pointer transition relative overflow-hidden ${
                orderStatusFilter === 'confirmed'
                  ? 'bg-purple-50 border-purple-500 ring-1 ring-purple-400'
                  : 'bg-white border-slate-200 hover:border-purple-300 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-purple-800 uppercase tracking-wider">Confirmados</span>
                <div className="w-6 h-6 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Receipt className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-xl font-black text-purple-700 font-mono">{orderCounts.confirmed}</span>
                <span className="text-xs text-purple-600 font-mono">
                  ${orderMetrics.confirmedSalesVolume.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Shipped Orders Card */}
            <div
              onClick={() => setOrderStatusFilter('shipped')}
              className={`p-3.5 rounded-2xl border space-y-1 cursor-pointer transition relative overflow-hidden ${
                orderStatusFilter === 'shipped'
                  ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-400'
                  : 'bg-white border-slate-200 hover:border-blue-300 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider">Enviados</span>
                <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Truck className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-xl font-black text-blue-700 font-mono">{orderCounts.shipped}</span>
                <span className="text-xs text-blue-600 font-mono">
                  ${orderMetrics.shippedSalesVolume.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Delivered Orders Card */}
            <div
              onClick={() => setOrderStatusFilter('delivered')}
              className={`p-3.5 rounded-2xl border space-y-1 cursor-pointer transition relative overflow-hidden ${
                orderStatusFilter === 'delivered'
                  ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-400'
                  : 'bg-white border-slate-200 hover:border-emerald-300 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">Entregados</span>
                <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <BadgeCheck className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-xl font-black text-emerald-700 font-mono">{orderCounts.delivered}</span>
                <span className="text-xs text-emerald-600 font-mono">
                  ${orderMetrics.deliveredSalesVolume.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Header & Quick Action Buttons (Repositioned above search & filter panel) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center">
                  <PackageCheck className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  Gestión de Pedidos Recibidos
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                    {orders.length} pedidos
                  </span>
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Monitorea tus ventas por fecha, confirma comprobantes de pago y coordina el despacho de compras.
              </p>
            </div>

            <div className="flex items-center space-x-2 flex-wrap">
              <button
                onClick={() => {
                  setManualCustomerCi('');
                  setManualCustomerName('');
                  setManualCustomerGeneralAddress('');
                  setManualCustomerPhone('');
                  setManualCustomerEmail('');
                  setMatchedCustomerInfo(null);
                  setShowCustomerSuggestions(false);
                  setManualDeliveryType('pickup');
                  setManualShippingAddress('');
                  setManualPaymentMethod(activeConfiguredPayments[0]?.name || 'whatsapp');
                  setManualPaymentVoucher('');
                  setManualNotes('');
                  setManualStatus('pending');
                  setManualItems([]);
                  setManualProductSearch('');
                  setOrderToEdit(null);
                  setOrderToConfirm(null);
                  setIsManualOrderModalOpen(true);
                }}
                className="inline-flex items-center px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                <span>+ Crear Pedido Manual</span>
              </button>

              <button
                onClick={() => onRefreshProducts()}
                className="inline-flex items-center px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs text-slate-700 hover:text-slate-900 transition cursor-pointer shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-sky-600" />
                <span>Actualizar</span>
              </button>
            </div>
          </div>

          {/* Orders Filter, Search Bar & View Mode Switcher (Dos Barras Horizontales Estáticas) */}
          <div
            id="orders-search-container"
            className="sticky top-16 z-20 bg-white/95 backdrop-blur-md border border-slate-300 rounded-2xl p-2.5 sm:p-3 space-y-2 shadow-sm transition-all max-w-full"
          >
            {/* Barra 1: Búsqueda y Selector de Vista */}
            <div className="flex items-center gap-1.5 sm:gap-2 w-full">
              {/* Search Input for Orders */}
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  placeholder="Buscar por # orden, cliente, teléfono, producto..."
                  className="w-full pl-8.5 sm:pl-9 pr-8 sm:pr-14 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:bg-white transition font-medium"
                />
                {orderSearchQuery && (
                  <button
                    onClick={() => {
                      setOrderSearchQuery('');
                      if (onClearFilterOrderNumber) onClearFilterOrderNumber();
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer"
                    title="Limpiar búsqueda"
                  >
                    <X className="w-3.5 h-3.5 sm:hidden" />
                    <span className="hidden sm:inline">Limpiar</span>
                  </button>
                )}
              </div>

              {/* View Mode Switcher */}
              <div className="flex items-center space-x-1 bg-slate-100 border border-slate-300 p-1 rounded-xl flex-shrink-0">
                <button
                  onClick={() => setOrderViewMode('cards')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer ${
                    orderViewMode === 'cards'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Vista en Tarjetas"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">Tarjetas</span>
                </button>

                <button
                  onClick={() => setOrderViewMode('table')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer ${
                    orderViewMode === 'table'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Vista en Lista / Tabla"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">Lista</span>
                </button>
              </div>
            </div>

            {/* Barra 2: Filtro horizontal continuo (deslizable con el dedo en móvil) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x py-1 w-full scroll-smooth pt-2 border-t border-slate-200/80 select-none">
              <span className="text-[11px] text-slate-500 font-bold shrink-0 mr-0.5">Estado:</span>

              <button
                onClick={() => setOrderStatusFilter('all')}
                className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer flex items-center space-x-1 flex-shrink-0 text-xs whitespace-nowrap ${
                  orderStatusFilter === 'all'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:text-slate-900 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <span>Todos</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${orderStatusFilter === 'all' ? 'bg-sky-900 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {orderCounts.all}
                </span>
              </button>

              <button
                onClick={() => setOrderStatusFilter('pending')}
                className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer flex items-center space-x-1 flex-shrink-0 text-xs whitespace-nowrap ${
                  orderStatusFilter === 'pending'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : orderCounts.pending > 0
                    ? 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-300 ring-2 ring-amber-400/40 shadow-2xs'
                    : 'bg-slate-100 text-amber-700 hover:text-amber-900 hover:bg-amber-50 border border-slate-200'
                }`}
              >
                <Clock className={`w-3 h-3 ${orderCounts.pending > 0 ? 'text-amber-600 animate-pulse' : ''}`} />
                <span>Pendientes</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${orderStatusFilter === 'pending' ? 'bg-amber-900 text-white' : 'bg-amber-200/90 text-amber-950'}`}>
                  {orderCounts.pending}
                </span>
              </button>

              <button
                onClick={() => setOrderStatusFilter('confirmed')}
                className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer flex items-center space-x-1 flex-shrink-0 text-xs whitespace-nowrap ${
                  orderStatusFilter === 'confirmed'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-slate-100 text-purple-700 hover:text-purple-900 hover:bg-purple-50 border border-slate-200'
                }`}
              >
                <Receipt className="w-3 h-3" />
                <span>Confirmados</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${orderStatusFilter === 'confirmed' ? 'bg-purple-950 text-white' : 'bg-purple-100 text-purple-800'}`}>
                  {orderCounts.confirmed}
                </span>
              </button>

              <button
                onClick={() => setOrderStatusFilter('shipped')}
                className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer flex items-center space-x-1 flex-shrink-0 text-xs whitespace-nowrap ${
                  orderStatusFilter === 'shipped'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-blue-700 hover:text-blue-900 hover:bg-blue-50 border border-slate-200'
                }`}
              >
                <Truck className="w-3 h-3" />
                <span>Enviados</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${orderStatusFilter === 'shipped' ? 'bg-blue-950 text-white' : 'bg-blue-100 text-blue-800'}`}>
                  {orderCounts.shipped}
                </span>
              </button>

              <button
                onClick={() => setOrderStatusFilter('delivered')}
                className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer flex items-center space-x-1 flex-shrink-0 text-xs whitespace-nowrap ${
                  orderStatusFilter === 'delivered'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 border border-slate-200'
                }`}
              >
                <BadgeCheck className="w-3 h-3" />
                <span>Entregados</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${orderStatusFilter === 'delivered' ? 'bg-emerald-950 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                  {orderCounts.delivered}
                </span>
              </button>

              <button
                onClick={() => setOrderStatusFilter('cancelled')}
                className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer flex items-center space-x-1 flex-shrink-0 text-xs whitespace-nowrap ${
                  orderStatusFilter === 'cancelled'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-slate-100 text-rose-700 hover:text-rose-900 hover:bg-rose-50 border border-slate-200'
                }`}
              >
                <X className="w-3 h-3" />
                <span>Cancelados</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${orderStatusFilter === 'cancelled' ? 'bg-rose-950 text-white' : 'bg-rose-100 text-rose-800'}`}>
                  {orderCounts.cancelled}
                </span>
              </button>

              {/* Indicador de filtro exclusivo cuando se consulta desde Compras */}
              {filterOrderNumber && (
                <>
                  <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setOrderSearchQuery('');
                      if (onClearFilterOrderNumber) onClearFilterOrderNumber();
                    }}
                    className="px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 text-indigo-950 font-bold transition flex items-center gap-1.5 cursor-pointer text-[11px] flex-shrink-0 whitespace-nowrap shadow-2xs"
                    title="Quitar filtro exclusivo del pedido"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse shrink-0" />
                    <span>Pedido #{String(filterOrderNumber).replace(/^#/, '')}</span>
                    <X className="w-3 h-3 text-indigo-700 shrink-0" />
                  </button>
                </>
              )}

              {/* Botón Restablecer si hay búsqueda o filtros aplicados */}
              {(orderSearchQuery || orderStatusFilter !== 'all' || filterOrderNumber) && (
                <>
                  <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setOrderSearchQuery('');
                      setOrderStatusFilter('all');
                      if (onClearFilterOrderNumber) onClearFilterOrderNumber();
                    }}
                    className="text-[11px] text-rose-800 hover:text-rose-950 font-bold px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-300 transition cursor-pointer flex items-center space-x-1 shadow-2xs shrink-0 whitespace-nowrap"
                    title="Restablecer filtros de pedidos"
                  >
                    <X className="w-3 h-3 shrink-0" />
                    <span>Restablecer</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Orders List / Table Container */}
          {periodOrders.length === 0 ? (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center space-y-3 shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center mx-auto">
                <Calendar className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No hay pedidos en el período seleccionado</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No se encontraron ventas para este filtro de fecha. Puedes seleccionar "Todo el Historial" para consultar todos los pedidos recibidos.
              </p>
              <button
                onClick={() => {
                  setOrderDateRangeFilter('all');
                  setCustomStartDate('');
                  setCustomEndDate('');
                }}
                className="mt-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sky-700 text-xs font-bold border border-slate-200 transition cursor-pointer"
              >
                Ver Todo el Historial
              </button>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center space-y-2 shadow-xs">
              <Filter className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">No hay pedidos que coincidan con los filtros</h3>
              <p className="text-xs text-slate-500">
                Prueba cambiando el estado seleccionado o borrando el término de búsqueda.
              </p>
              <button
                onClick={() => {
                  setOrderStatusFilter('all');
                  setOrderSearchQuery('');
                }}
                className="mt-2 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-sky-700 text-xs font-semibold border border-slate-200 transition cursor-pointer"
              >
                Restablecer filtros
              </button>
            </div>
          ) : orderViewMode === 'table' ? (
            <OrdersTableView
              orders={filteredOrders}
              inventoryItems={products}
              storeConfig={storeConfig}
              paymentPartners={paymentPartners}
              currency={currency}
              onOpenEditOrder={handleOpenEditOrder}
              onOpenConfirmVoucher={handleOpenConfirmOrder}
              onOpenShipOrder={handleOpenShipOrder}
              onOpenShippingCost={handleOpenShippingCost}
              onOpenPendingShipping={handleOpenConfirmOrder}
              onOpenPrintShippingTicket={(ord) => setOrderToPrintShipping(ord)}
              onOpenPrintA4Order={(ord) =>
                directPrintOrder({
                  order: ord,
                  storeConfig,
                  currency: storeConfig?.currency || currency || 'USD',
                  showToast,
                })
              }
              onOpenRequestShippingData={(ord) => setOrderToRequestShippingData(ord)}
              onUpdateStatus={async (orderId, status, voucher, notes, trackingNumber, trackingCarrier, trackingNotes) => {
                await onUpdateOrderStatus(orderId, status, voucher, notes, trackingNumber, trackingCarrier, trackingNotes);
              }}
              onDeleteOrder={(ord) => setOrderToDelete(ord)}
              purchases={purchases}
              onOpenCancelOrder={(ord) => setOrderToCancel(ord)}
              onOpenDeliverOrder={(ord) => setOrderToDeliver(ord)}
              showToast={showToast}
              buildWhatsAppLink={buildWhatsAppLink}
              renderPaymentBadge={renderPaymentBadge}
              onGenerateSupplierPurchase={onGenerateSupplierPurchase}
              onViewLinkedPurchase={onViewLinkedPurchase}
              onOpenPartialDelivery={(ord) => setOrderForPartialDelivery(ord)}
              onCompleteRemainingDelivery={handleCompleteRemainingDelivery}
            />
          ) : (
            <OrdersCardsView
              orders={filteredOrders}
              inventoryItems={products}
              storeConfig={storeConfig}
              paymentPartners={paymentPartners}
              currency={currency}
              onOpenEditOrder={handleOpenEditOrder}
              onOpenConfirmVoucher={handleOpenConfirmOrder}
              onOpenShipOrder={handleOpenShipOrder}
              onOpenShippingCost={handleOpenShippingCost}
              onOpenPendingShipping={handleOpenConfirmOrder}
              onOpenPrintShippingTicket={(ord) => setOrderToPrintShipping(ord)}
              onOpenPrintA4Order={(ord) =>
                directPrintOrder({
                  order: ord,
                  storeConfig,
                  currency: storeConfig?.currency || currency || 'USD',
                  showToast,
                })
              }
              onOpenRequestShippingData={(ord) => setOrderToRequestShippingData(ord)}
              onUpdateStatus={async (orderId, status, voucher, notes, trackingNumber, trackingCarrier, trackingNotes) => {
                await onUpdateOrderStatus(orderId, status, voucher, notes, trackingNumber, trackingCarrier, trackingNotes);
              }}
              onDeleteOrder={(ord) => setOrderToDelete(ord)}
              purchases={purchases}
              onOpenCancelOrder={(ord) => setOrderToCancel(ord)}
              onOpenDeliverOrder={(ord) => setOrderToDeliver(ord)}
              showToast={showToast}
              buildWhatsAppLink={buildWhatsAppLink}
              renderPaymentBadge={renderPaymentBadge}
              onGenerateSupplierPurchase={onGenerateSupplierPurchase}
              onViewLinkedPurchase={onViewLinkedPurchase}
              onOpenPartialDelivery={(ord) => setOrderForPartialDelivery(ord)}
              onCompleteRemainingDelivery={handleCompleteRemainingDelivery}
            />
          )}
        </div>
      )}

      {/* VIEW: 3. STORE SETTINGS & SHARE (Admin Only) */}
      {isAdmin && storeTab === 'settings' && (
        <StoreSettingsTab
          initialConfig={storeConfig}
          onSaved={async () => {
            await onUpdateStoreConfig({});
            showToast('✓ Ajustes y campañas de la tienda guardados correctamente');
          }}
          customerStoreUrl={customerStoreUrl}
          onDeployLocal={onOpenConfig}
        />
      )}

      {/* FULL-PAGE PRODUCT DETAIL VIEW (Customer Mode) */}
      {isCustomerView && quickViewProduct && (
        <div id="store-product-detail-container" className="fixed inset-0 z-50 overflow-y-auto bg-slate-50 animate-fadeIn">
          <StoreProductDetailPage
            product={quickViewProduct}
            allProducts={products}
            storeConfig={{
              ...storeConfig,
              theme: activeTheme,
              themeColors: themePalettes,
            }}
            currency={currency}
            isCustomerView={isCustomerView}
            cart={cart}
            cartTotalItems={cartTotalItems}
            onAddToCart={handleAddToCart}
            onUpdateCartQty={handleUpdateCartQty}
            onDirectBuyProduct={handleDirectBuyProduct}
            onShareProductWhatsApp={handleShareProductWhatsApp}
            onCopyProductLink={handleCopyProductLink}
            onBack={handleBackToCatalog}
            onSelectProduct={(item) => {
              handleOpenProductDetail(item);
            }}
            onOpenCart={() => {
              setIsCartOpen(true);
              setCartStep('cart');
            }}
            courierPartners={courierPartners}
            paymentPartners={paymentPartners}
          />
        </div>
      )}

      {/* MODAL: QUICK PRODUCT DETAIL FOR ADMIN PREVIEW */}
      {!isCustomerView && quickViewProduct && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseAdminProductModal();
            }
          }}
        >
          <div className="rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl space-y-0 animate-fadeIn relative bg-white border border-slate-200/90 text-slate-900">
            <button
              onClick={handleCloseAdminProductModal}
              className="absolute top-4 right-4 z-20 p-2 rounded-full transition cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
              title="Cerrar vista rápida"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2">
              {/* Media Showcase (Photo Gallery or Video Player) */}
              <div className="p-4 flex flex-col items-center justify-center relative border-b sm:border-b-0 sm:border-r bg-slate-50 border-slate-100">
                {(() => {
                  const photos = getProductPhotos(quickViewProduct);
                  const currentPhoto = normalizeMediaUrl(photos[activeImageIdx] || quickViewProduct.imageUrl);
                  const parsedVideo = quickViewProduct.videoUrl ? parseVideoUrl(quickViewProduct.videoUrl) : null;
                  const effectiveMediaMode = (photos.length === 0 && quickViewProduct.videoUrl) ? 'video' : activeMediaMode;

                  return (
                    <div className="w-full space-y-2.5">
                      {/* Media switcher if video exists */}
                      {quickViewProduct.videoUrl && (
                        <div className="flex rounded-xl bg-slate-200/80 p-1 border border-slate-200 text-xs font-bold shadow-inner">
                          <button
                            type="button"
                            onClick={() => setActiveMediaMode('photo')}
                            className={`flex-1 py-1.5 rounded-lg text-center transition flex items-center justify-center space-x-1.5 cursor-pointer ${
                              effectiveMediaMode === 'photo'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>Fotos ({photos.length})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveMediaMode('video')}
                            className={`flex-1 py-1.5 rounded-lg text-center transition flex items-center justify-center space-x-1.5 cursor-pointer ${
                              effectiveMediaMode === 'video'
                                ? 'bg-sky-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Ver Video</span>
                          </button>
                        </div>
                      )}

                      {/* Video Player */}
                      {effectiveMediaMode === 'video' && parsedVideo ? (
                        <div className="aspect-square rounded-2xl overflow-hidden bg-black border border-slate-800 relative flex items-center justify-center shadow-xs">
                          {parsedVideo.isDirect ? (
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
                              src={parsedVideo.embedUrl}
                              controls
                              controlsList="nodownload novolume"
                              autoPlay
                              muted={false}
                              playsInline
                              className="w-full h-full object-contain"
                            />
                          ) : parsedVideo.embedUrl ? (
                            <iframe
                              src={parsedVideo.embedUrl}
                              title={quickViewProduct.name}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              className="w-full h-full border-0"
                            />
                          ) : (
                            <div className="text-center p-4 text-slate-400 text-xs">
                              <Film className="w-10 h-10 mx-auto mb-2 text-sky-400 opacity-80" />
                              <p className="font-bold text-slate-200">Video del Producto</p>
                              <a
                                href={quickViewProduct.videoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sky-400 underline text-xs mt-2 inline-flex items-center space-x-1"
                              >
                                <span>Abrir video en reproductor</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}

                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-black/80 text-sky-300 border border-white/20 backdrop-blur-xs">
                            {parsedVideo.platform.toUpperCase()}
                          </div>
                        </div>
                      ) : (
                        /* Photo Container */
                        <div className="aspect-square rounded-2xl overflow-hidden relative flex items-center justify-center bg-white border border-slate-200/80 shadow-xs">
                          {currentPhoto ? (
                            <img
                              src={currentPhoto}
                              alt={quickViewProduct.name}
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <ProductMediaDisplay
                              imageUrl={null}
                              candidateImages={photos}
                              videoUrl={quickViewProduct.videoUrl}
                              name={quickViewProduct.name}
                              className="w-full h-full relative"
                              imageClassName="w-full h-full object-contain"
                              videoClassName="w-full h-full object-contain"
                              autoPlayVideo={true}
                              showPlayBadge={true}
                              placeholderText="Producto sin foto"
                            />
                          )}

                          {photos.length > 1 && (
                            <>
                              <button
                                onClick={() =>
                                  setActiveImageIdx((prev) => (prev > 0 ? prev - 1 : photos.length - 1))
                                }
                                className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/70 text-white border border-white/20 hover:bg-black transition cursor-pointer"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() =>
                                  setActiveImageIdx((prev) => (prev < photos.length - 1 ? prev + 1 : 0))
                                }
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/70 text-white border border-white/20 hover:bg-black transition cursor-pointer"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          {quickViewProduct.videoUrl && (
                            <button
                              type="button"
                              onClick={() => setActiveMediaMode('video')}
                              className="absolute bottom-2 right-2 px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-900/90 hover:bg-black text-sky-300 border border-sky-400/40 shadow-xs flex items-center space-x-1 cursor-pointer transition active:scale-95 backdrop-blur-xs"
                            >
                              <Play className="w-3 h-3 text-sky-400 fill-current" />
                              <span>Ver Video</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Thumbnail dots / row */}
                      {activeMediaMode === 'photo' && photos.length > 1 && (
                        <div className="flex items-center justify-center space-x-2 overflow-x-auto py-1">
                          {photos.map((ph, idx) => (
                            <button
                              key={idx}
                              onClick={() => setActiveImageIdx(idx)}
                              className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition cursor-pointer ${
                                activeImageIdx === idx
                                  ? 'border-sky-500 scale-105 shadow-xs'
                                  : 'border-transparent opacity-60 hover:opacity-100'
                              }`}
                            >
                              <img src={ph} alt="" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Product Info & Fast Add to Cart */}
              <div className="p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-2.5">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                      {quickViewProduct.category}
                    </span>
                    <span className="font-mono text-xs text-slate-500">
                      SKU: {quickViewProduct.sku}
                    </span>
                    {quickViewProduct.videoUrl && (
                      <button
                        type="button"
                        onClick={() => setActiveMediaMode('video')}
                        className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center space-x-1 cursor-pointer transition"
                      >
                        <Film className="w-3 h-3 text-indigo-600" />
                        <span>Video Incluido</span>
                      </button>
                    )}
                    {Math.max(0, Math.min(100, Number(quickViewProduct.discountPercent) || 0)) > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-xs animate-pulse">
                        🔥 OFERTA -{Math.max(0, Math.min(100, Number(quickViewProduct.discountPercent) || 0))}%
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-black leading-snug text-slate-900">
                    {quickViewProduct.name}
                  </h3>

                  {(() => {
                    const disc = Math.max(0, Math.min(100, Number(quickViewProduct.discountPercent) || 0));
                    const regular = Number(quickViewProduct.salePrice) || 0;
                    const effective = disc > 0 ? regular * (1 - disc / 100) : regular;

                    if (disc > 0) {
                      return (
                        <div className="pt-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs line-through text-slate-400 font-semibold">
                              ${regular.toFixed(2)}
                            </span>
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200">
                              -{disc}% OFF
                            </span>
                          </div>
                          <div className="flex items-baseline space-x-2 mt-0.5">
                            <span className="text-2xl font-black text-rose-600">
                              ${effective.toFixed(2)}
                            </span>
                            <span className="text-xs font-bold text-slate-500">
                              {currency}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="flex items-baseline space-x-2 pt-1">
                        <span className="text-2xl font-black text-emerald-600">
                          ${regular.toFixed(2)}
                        </span>
                        <span className="text-xs font-bold text-slate-500">
                          {currency}
                        </span>
                      </div>
                    );
                  })()}

                  {quickViewProduct.description && (
                    <p className="text-xs leading-relaxed p-3 rounded-xl border bg-slate-50 text-slate-600 border-slate-200">
                      {quickViewProduct.description}
                    </p>
                  )}

                  <div className="text-xs space-y-1 pt-1 text-slate-500">
                    <p className="flex items-center">
                      <Tag className="w-3.5 h-3.5 mr-1 text-slate-400" />
                      Categoría:{' '}
                      <span className="ml-1 font-semibold text-slate-700">
                        {quickViewProduct.category || 'General'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-slate-100">
                  {isCustomerView && (
                    <>
                      <button
                        onClick={() => {
                          handleAddToCart(quickViewProduct, 1);
                          setQuickViewProduct(null);
                        }}
                        className="w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm shadow-md transition flex items-center justify-center space-x-2 cursor-pointer active:scale-95 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        <span>Agregar al Carrito</span>
                      </button>

                      <button
                        onClick={() => handleDirectBuyProduct(quickViewProduct)}
                        className="w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center space-x-2 cursor-pointer active:scale-95 shadow-md bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <MessageCircle className="w-4 h-4 fill-current" />
                        <span>Comprar por WhatsApp</span>
                      </button>
                    </>
                  )}

                  {/* Share product options */}
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-500 block">
                      Compartir este producto con amigos o clientes:
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleShareProductWhatsApp(quickViewProduct)}
                        className="py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-2xs active:scale-95"
                      >
                        <MessageCircle className="w-4 h-4 text-emerald-600" />
                        <span>Enviar por WhatsApp</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyProductLink(quickViewProduct)}
                        className="py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 text-xs font-semibold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-2xs active:scale-95"
                      >
                        <Copy className="w-4 h-4 text-sky-600" />
                        <span>Copiar Enlace</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SLIDING SHOPPING CART & CHECKOUT DRAWER */}
      {isCartOpen && (
        <div className="fixed inset-0 z-[70] overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="max-w-md w-full h-full flex flex-col justify-between shadow-2xl animate-fadeIn bg-white border-l border-slate-200 text-slate-900">
            {/* Cart Header */}
            <div className="p-4 border-b flex items-center justify-between bg-slate-50/80 border-slate-200">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {cartStep === 'cart'
                      ? 'Carrito de Compras'
                      : cartStep === 'checkout'
                      ? 'Completar y Enviar Pedido'
                      : '¡Pedido Confirmado!'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {cartTotalItems} {cartTotalItems === 1 ? 'artículo' : 'artículos'} seleccionados
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 rounded-xl border transition cursor-pointer bg-white hover:bg-slate-100 text-slate-600 border-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* STEP 1: CART ITEMS LIST */}
            {cartStep === 'cart' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <ShoppingBag
                      className={`w-16 h-16 mb-3 opacity-30 ${
                        isCustomerView ? 'text-slate-400' : 'text-sky-400'
                      }`}
                    />
                    <h4
                      className={`text-sm font-bold ${
                        isCustomerView ? 'text-slate-800' : 'text-slate-300'
                      }`}
                    >
                      Tu carrito está vacío
                    </h4>
                    <p
                      className={`text-xs mt-1 max-w-xs ${
                        isCustomerView ? 'text-slate-500' : 'text-slate-500'
                      }`}
                    >
                      Explora el catálogo y agrega los productos que deseas adquirir.
                    </p>
                  </div>
                ) : (
                  cart.map((ci) => {
                    const isOutOfStock = ci.item.stock <= 0 || ci.item.status === 'sold_out';
                    return (
                      <div
                        key={ci.item.id}
                        className="rounded-2xl p-3 flex items-center space-x-3 transition bg-slate-50 border border-slate-200/90 shadow-xs"
                      >
                        <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border bg-white border-slate-200">
                          <ProductMediaDisplay
                            imageUrl={ci.item.imageUrl}
                            videoUrl={ci.item.videoUrl}
                            name={ci.item.name}
                            className="w-full h-full relative"
                            imageClassName="w-full h-full object-cover"
                            videoClassName="w-full h-full object-cover"
                            autoPlayVideo={true}
                            showPlayBadge={false}
                            placeholderText=""
                            fallbackIcon="image"
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-1.5 mb-0.5">
                            <h4 className="text-xs font-bold truncate text-slate-900">
                              {ci.item.name}
                            </h4>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-mono text-slate-500">
                              SKU: {ci.item.sku}
                            </span>
                          </div>

                          {(() => {
                            const disc = Math.max(0, Math.min(100, Number(ci.item.discountPercent) || 0));
                            const regular = Number(ci.item.salePrice) || 0;
                            const effective = disc > 0 ? regular * (1 - disc / 100) : regular;

                            if (disc > 0) {
                              return (
                                <div className="flex items-center space-x-1.5 mt-0.5">
                                  <span className="text-xs font-black text-rose-600">
                                    ${effective.toFixed(2)} {currency}
                                  </span>
                                  <span className="text-[10px] line-through text-slate-400 font-semibold">
                                    ${regular.toFixed(2)}
                                  </span>
                                  <span className="text-[9px] font-black px-1 rounded bg-rose-50 text-rose-600 border border-rose-200">
                                    -{disc}%
                                  </span>
                                </div>
                              );
                            }

                            return (
                              <div className="text-xs font-black mt-0.5 text-emerald-600">
                                ${regular.toFixed(2)} {currency}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Quantity buttons */}
                        <div className="flex items-center space-x-1.5 p-1 rounded-xl border bg-white border-slate-200">
                          <button
                            onClick={() => handleUpdateCartQty(ci.item.id, ci.quantity - 1)}
                            className="w-6 h-6 rounded-lg flex items-center justify-center transition cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-800"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-black px-1 font-mono text-slate-900">
                            {ci.quantity}
                          </span>
                          <button
                            onClick={() => handleUpdateCartQty(ci.item.id, ci.quantity + 1)}
                            className="w-6 h-6 rounded-lg flex items-center justify-center transition cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-800"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Delete */}
                        <button
                          onClick={() => handleRemoveFromCart(ci.item.id)}
                          className="text-slate-400 hover:text-rose-500 p-1.5 transition cursor-pointer"
                          title="Eliminar del carrito"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* STEP 2: CHECKOUT & SHIPPING FORM */}
            {cartStep === 'checkout' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <button
                  onClick={() => setCartStep('cart')}
                  className={`text-xs hover:underline flex items-center space-x-1 cursor-pointer mb-2 font-bold ${
                    isCustomerView ? 'text-sky-600' : 'text-sky-400'
                  }`}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Volver al carrito</span>
                </button>

                <div className="space-y-3 p-4 rounded-2xl border bg-slate-50 border-slate-200/90">
                  <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-slate-800">
                    <User className="w-3.5 h-3.5 text-sky-500" />
                    Datos del Comprador
                  </h4>

                  {checkoutError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-600 dark:text-rose-300 text-xs font-semibold flex items-start gap-2 animate-shake">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{checkoutError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-semibold mb-1 text-slate-700">
                      Nombre y Apellido: (Opcional)
                    </label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        if (checkoutError) setCheckoutError(null);
                      }}
                      placeholder="Ej. Juan Pérez"
                      className="w-full px-3 py-2 rounded-xl text-xs transition focus:outline-none bg-white border border-slate-200 text-slate-900 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Teléfono / WhatsApp: (Opcional)
                      </label>
                      <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                        <span>🇪🇨</span> Ecuador (+593 / 09)
                      </span>
                    </div>
                    <input
                      type="text"
                      required
                      value={customerPhone}
                      onChange={(e) => {
                        setCustomerPhone(e.target.value);
                        if (checkoutError) setCheckoutError(null);
                      }}
                      placeholder="Ej. 0983302390 o +593983302390"
                      className="w-full px-3 py-2 rounded-xl text-xs font-mono transition focus:outline-none bg-white border border-slate-200 text-slate-900 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                    {customerPhone.trim() ? (
                      (() => {
                        const norm = normalizeEcuadorPhone(customerPhone);
                        if (norm.isValid) {
                          return (
                            <div className="mt-1.5 px-2.5 py-1 rounded-lg text-[11px] flex items-center justify-between border bg-emerald-50 border-emerald-200 text-emerald-800">
                              <span className="font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>WhatsApp Válido:</span>
                              </span>
                              <div className="flex items-center space-x-2 font-mono font-bold">
                                <span>{norm.formattedLocal}</span>
                                <span className="opacity-50">|</span>
                                <span className="text-[10px]">{norm.international}</span>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div className="mt-1.5 px-2.5 py-1 rounded-lg text-[11px] flex items-center justify-between border bg-amber-50 border-amber-200 text-amber-800">
                            <span className="flex items-center gap-1 font-semibold">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                              <span>Completa tu número (10 dígitos):</span>
                            </span>
                            <span className="font-mono text-[10px] opacity-80">{norm.local || customerPhone}</span>
                          </div>
                        );
                      })()
                    ) : (
                      <p className="text-[10px] mt-1 text-slate-500">
                        Ingresa tu celular con <span className="font-mono font-bold">09...</span> o <span className="font-mono font-bold">+593...</span> para enviarte el estado de tu pedido.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3 p-4 rounded-2xl border bg-slate-50 border-slate-200/90">
                  <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-slate-800">
                    <Truck className="w-3.5 h-3.5 text-emerald-500" />
                    Modalidad de Entrega
                  </h4>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDeliveryType('shipping')}
                      className={`p-2.5 rounded-xl border text-xs font-medium transition cursor-pointer flex flex-col items-center justify-center ${
                        deliveryType === 'shipping'
                          ? 'bg-sky-50 border-sky-400 text-sky-900 font-bold shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <Truck className="w-4 h-4 mb-1" />
                      <span>Envío a Domicilio</span>
                      {Number(storeConfig.deliveryFee) > 0 && (
                        <span className="text-[10px] text-slate-500">
                          +${storeConfig.deliveryFee}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeliveryType('pickup')}
                      className={`p-2.5 rounded-xl border text-xs font-medium transition cursor-pointer flex flex-col items-center justify-center ${
                        deliveryType === 'pickup'
                          ? 'bg-sky-50 border-sky-400 text-sky-900 font-bold shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <Store className="w-4 h-4 mb-1" />
                      <span>Retiro en Local</span>
                      <span className="text-[10px] text-emerald-600 font-bold">Gratis</span>
                    </button>
                  </div>

                  {deliveryType === 'shipping' && (
                    <div>
                      <label className="block text-[11px] font-semibold mb-1 text-slate-700">
                        Dirección de Envío Completa:
                      </label>
                      <input
                        type="text"
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        placeholder="Calle, número, depto, ciudad"
                        className="w-full px-3 py-2 rounded-xl text-xs transition focus:outline-none bg-white border border-slate-200 text-slate-900 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-3 p-4 rounded-2xl border bg-slate-50 border-slate-200/90">
                  <h4 className="text-xs font-bold uppercase tracking-wider flex items-center justify-between text-slate-800">
                    <span>Método de Pago</span>
                    <span className="text-[10px] font-normal text-emerald-600 font-sans">
                      100% Seguro
                    </span>
                  </h4>

                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs cursor-pointer transition focus:outline-none bg-white border border-slate-200 text-slate-900 focus:border-sky-500 font-medium"
                  >
                    <option value="whatsapp">💬 Coordinar por WhatsApp (Recomendado)</option>
                    {paymentPartners
                      .filter((p) => p.active)
                      .map((p) => (
                        <option key={p.id} value={p.name}>
                          💳 {p.name} {p.details ? `(${p.details})` : ''}
                        </option>
                      ))}
                    <option value="contraentrega">💵 Pago Contra Entrega / Efectivo</option>
                  </select>

                  {/* Selected Payment details preview */}
                  {(() => {
                    const selected = paymentPartners.find(
                      (p) => p.name === paymentMethod && p.active
                    );
                    if (selected && (selected.details || selected.logoUrl)) {
                      return (
                        <div className="p-2.5 rounded-xl border text-xs flex items-center space-x-2.5 bg-white border-slate-200 text-slate-700">
                          {selected.logoUrl && (
                            <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 p-0.5 flex items-center justify-center flex-shrink-0 overflow-hidden">
                              <img
                                src={selected.logoUrl}
                                alt={selected.name}
                                className="w-full h-full object-contain"
                              />
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="font-bold text-[11px] block">{selected.name}</span>
                            {selected.details && (
                              <span className="text-[10px] text-slate-500 block">
                                {selected.details}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div>
                    <label className="block text-[11px] font-semibold mb-1 text-slate-700">
                      Instrucciones o Notas adicionales:
                    </label>
                    <textarea
                      rows={2}
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      placeholder="Ej. Entregar después de las 15hs..."
                      className="w-full px-3 py-2 rounded-xl text-xs resize-none transition focus:outline-none bg-white border border-slate-200 text-slate-900 focus:border-sky-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: ORDER CONFIRMED / SUCCESS RECEIPT */}
            {cartStep === 'success' && lastPlacedOrder && (
              <div className="flex-1 overflow-y-auto p-6 space-y-4 text-center flex flex-col items-center justify-start">
                <div className="w-16 h-16 rounded-full flex items-center justify-center animate-bounce shadow-sm bg-emerald-100 text-emerald-700 border border-emerald-300">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-lg font-black text-slate-900">
                    ¡Pedido Registrado con Éxito!
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tu orden ha sido registrada en el sistema con el número:
                  </p>
                  <span className="inline-block px-3 py-1 rounded-lg font-mono font-bold text-sm border shadow-xs bg-sky-50 text-sky-800 border-sky-200">
                    #{lastPlacedOrder.orderNumber}
                  </span>
                </div>

                {/* Information notice */}
                <div className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-left text-xs text-slate-600 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-slate-800">Orden recibida por la tienda</p>
                    <p className="text-[11px] text-slate-500">
                      Un asesor revisará tu pedido para coordinar el pago y la entrega. Puedes presionar el botón de abajo para enviar los detalles directamente por WhatsApp.
                    </p>
                  </div>
                </div>

                {/* WhatsApp Re-send button */}
                {storeConfig.whatsappNumber && (
                  <a
                    href={buildWhatsAppLink(
                      storeConfig.whatsappNumber,
                      generateWhatsAppOrderText(lastPlacedOrder.orderNumber)
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center space-x-2 shadow-xs"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Confirmar / Enviar por WhatsApp</span>
                  </a>
                )}

                <div className="w-full p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-left text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>Tu orden ha sido generada con éxito y está lista para coordinar.</span>
                </div>

                <div className="w-full p-4 rounded-2xl border text-left text-xs space-y-2 font-mono bg-slate-50 border-slate-200 text-slate-700">
                  <div className="flex justify-between border-b pb-2 border-slate-200">
                    <span className="text-slate-500">Cliente:</span>
                    <span className="font-bold text-slate-900">
                      {lastPlacedOrder.customerName}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-2 border-slate-200">
                    <span className="text-slate-500">Teléfono:</span>
                    <span>{lastPlacedOrder.customerPhone}</span>
                  </div>
                  <div className="flex justify-between font-bold pt-1 text-emerald-700">
                    <span>Total:</span>
                    <span>${Number(lastPlacedOrder.totalAmount).toFixed(2)} {currency}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setCartStep('cart');
                    setIsCartOpen(false);
                  }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs transition cursor-pointer shadow-md active:scale-95"
                >
                  Continuar en la Tienda
                </button>
              </div>
            )}

            {/* Cart Footer Summary & Action */}
            {cart.length > 0 && cartStep !== 'success' && (
              <div className="p-4 border-t space-y-3 bg-slate-50/90 border-slate-200">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      ${cartSubtotal.toFixed(2)} {currency}
                    </span>
                  </div>
                  {deliveryFee > 0 && (
                    <div className="flex justify-between text-slate-500">
                      <span>Envío:</span>
                      <span className="font-mono font-semibold text-slate-800">
                        ${deliveryFee.toFixed(2)} {currency}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black pt-1 border-t border-slate-200 text-slate-900">
                    <span>Total:</span>
                    <span className="font-mono text-emerald-700">
                      ${cartTotal.toFixed(2)} {currency}
                    </span>
                  </div>
                </div>

                {isCustomerView && storeConfig.isActive === false ? (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-center space-y-1.5">
                    <p className="text-xs font-bold text-amber-900">Tienda en Modo Pausa / Mantenimiento</p>
                    <p className="text-[11px] text-amber-800">
                      La toma de pedidos automáticos está desactivada temporalmente.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      disabled={isSubmittingOrder}
                      onClick={handleSendViaWhatsApp}
                      className="w-full py-3.5 sm:py-4 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-green-600 hover:from-emerald-600 hover:to-green-700 disabled:opacity-50 text-white font-black text-sm sm:text-base shadow-lg shadow-emerald-500/25 transition flex items-center justify-center space-x-2.5 cursor-pointer active:scale-95 tracking-wide"
                    >
                      {isSubmittingOrder ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Creando pedido en el sistema...</span>
                        </>
                      ) : (
                        <>
                          <MessageCircle className="w-5 h-5 fill-current shrink-0" />
                          <span>Comprar por WhatsApp</span>
                        </>
                      )}
                    </button>
                    <p className="text-[11px] text-center text-slate-500 font-medium">
                      ⚡ Crea el pedido en el sistema y abre WhatsApp automáticamente
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: SHARE STORE FOR CLIENTS ONLY */}
      <ShareStoreModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        storeConfig={storeConfig}
        onShowToast={showToast}
      />

      {/* MODAL: DELETE ORDER CONFIRMATION */}
      {orderToDelete && (() => {
        const isLockedDelete =
          orderToDelete.status === 'confirmed' ||
          orderToDelete.status === 'shipped' ||
          orderToDelete.status === 'delivered' ||
          isOrderPartiallyDelivered(orderToDelete);

        if (isLockedDelete) {
          return (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 shadow-xl space-y-4 animate-scaleUp">
                <div className="flex items-center space-x-3 text-slate-800 border-b border-slate-100 pb-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Venta Protegida</h3>
                    <p className="text-xs text-slate-500 font-medium">Reglas de integridad contable y ERP</p>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5 leading-relaxed">
                  <p className="font-bold flex items-center space-x-1.5">
                    <span>🔒 No es posible eliminar esta venta</span>
                  </p>
                  <p>
                    Una venta no puede cancelarse ni borrarse cuando está confirmada y/o se encuentra entregada parcialmente, para salvaguardar el balance contable, los registros de kardex y el inventario de bodega.
                  </p>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setOrderToDelete(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 transition cursor-pointer"
                  >
                    Entendido / Volver
                  </button>
                </div>
              </div>
            </div>
          );
        }

        const linkedPurchases = (purchases || []).filter(
          (p: any) =>
            ((orderToDelete.linkedPurchaseId && p.id === orderToDelete.linkedPurchaseId) ||
              p.linkedCustomerOrderId === orderToDelete.id ||
              (orderToDelete.linkedPurchaseNumber && String(orderToDelete.linkedPurchaseNumber).includes(p.purchaseNumber)) ||
              (p.linkedCustomerOrderNumber && String(p.linkedCustomerOrderNumber).trim() === String(orderToDelete.orderNumber).trim()) ||
              (Array.isArray(p.items) &&
                p.items.some(
                  (it: any) =>
                    it.customerOrderId === orderToDelete.id ||
                    (it.orderNumber && String(it.orderNumber).trim() === String(orderToDelete.orderNumber).trim())
                ))) &&
            p.status !== 'cancelled'
        );
        const hasLinkedPurchases = linkedPurchases.length > 0;
        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className={`bg-white border ${hasLinkedPurchases ? 'border-amber-300 max-w-lg' : 'border-rose-200 max-w-md'} rounded-2xl w-full p-5 shadow-xl space-y-4 animate-scaleUp`}>
              <div className="flex items-center space-x-3 text-rose-600 border-b border-slate-100 pb-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">¿Eliminar este pedido?</h3>
                  <p className="text-xs text-rose-600 font-medium">Esta acción no se puede deshacer</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs text-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-500">Orden:</span>
                  <span className="font-mono font-bold text-sky-700">#{orderToDelete.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cliente:</span>
                  <span className="font-bold text-slate-900">{orderToDelete.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Teléfono:</span>
                  <span className="font-mono text-slate-800">{orderToDelete.customerPhone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Monto Total:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    ${Number(orderToDelete.totalAmount).toFixed(2)} {currency}
                  </span>
                </div>
              </div>

              {hasLinkedPurchases ? (
                <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-300 space-y-2.5">
                  <div className="flex items-center space-x-2 text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="text-xs font-bold">
                      {linkedPurchases.length === 1
                        ? '1 Orden de Compra al Proveedor Asociada'
                        : `${linkedPurchases.length} Órdenes de Compra a Proveedores Asociadas`}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-900 leading-relaxed">
                    Este pedido de venta generó {linkedPurchases.length === 1 ? 'la orden de compra:' : 'las siguientes órdenes de compra separadas por proveedor:'}
                  </p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {linkedPurchases.map((lp: any, lpIdx: number) => (
                      <div key={`lp-order-${lp.id ?? lpIdx}-${lpIdx}`} className="flex items-center justify-between p-2 rounded-lg bg-white/90 border border-amber-200 text-xs">
                        <div>
                          <span className="font-mono font-bold text-amber-950">#{lp.purchaseNumber || lp.id}</span>
                          <span className="text-slate-700 ml-1.5 font-medium">({lp.supplierName || 'Proveedor'})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold border border-amber-300">
                            {lp.status === 'received' ? '✅ Recibido' : lp.status === 'ordered' ? '🔵 Ordenado' : '⏳ Pendiente'}
                          </span>
                          <span className="font-mono font-bold text-slate-800">
                            ${Number(lp.totalCost || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-amber-950 font-bold bg-amber-100/90 p-2 rounded-lg border border-amber-300">
                    ℹ️ Al eliminar este pedido de cliente, <strong>todas las órdenes de compra asociadas a proveedores se eliminarán automáticamente</strong>.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isDeletingOrder}
                      onClick={() => handleConfirmDeleteOrder('cancel')}
                      className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold text-left flex flex-col justify-between shadow-xs cursor-pointer transition"
                    >
                      <div className="flex items-center space-x-1.5 mb-1">
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Eliminar Pedido y {linkedPurchases.length === 1 ? 'Compra' : `${linkedPurchases.length} Compras`}</span>
                      </div>
                      <span className="text-[10px] text-rose-100 font-normal">
                        Elimina el pedido y todas sus {linkedPurchases.length} órdenes a proveedores automáticamente.
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={isDeletingOrder}
                      onClick={() => handleConfirmDeleteOrder('keep')}
                      className="p-2.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold text-left flex flex-col justify-between shadow-xs cursor-pointer transition"
                    >
                      <div className="flex items-center space-x-1.5 mb-1">
                        <Package className="w-3.5 h-3.5" />
                        <span>Conservar {linkedPurchases.length === 1 ? 'Compra' : 'Compras'} para Stock</span>
                      </div>
                      <span className="text-[10px] text-sky-100 font-normal">
                        Elimina el pedido pero conserva las compras para stock general en bodega.
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  disabled={isDeletingOrder}
                  onClick={() => setOrderToDelete(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 transition cursor-pointer"
                >
                  Volver (No Eliminar)
                </button>
                {!hasLinkedPurchases && (
                  <button
                    disabled={isDeletingOrder}
                    onClick={() => handleConfirmDeleteOrder()}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isDeletingOrder ? 'Eliminando...' : 'Sí, Eliminar Pedido'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: CANCEL ORDER WITH LINKED SUPPLIER PURCHASE */}
      {orderToCancel && (() => {
        const isLockedCancel =
          orderToCancel.status === 'confirmed' ||
          orderToCancel.status === 'shipped' ||
          orderToCancel.status === 'delivered' ||
          isOrderPartiallyDelivered(orderToCancel);

        if (isLockedCancel) {
          return (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 shadow-xl space-y-4 animate-scaleUp">
                <div className="flex items-center space-x-3 text-slate-800 border-b border-slate-100 pb-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Venta Protegida</h3>
                    <p className="text-xs text-slate-500 font-medium">Reglas de integridad contable y ERP</p>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5 leading-relaxed">
                  <p className="font-bold flex items-center space-x-1.5">
                    <span>🔒 No es posible cancelar esta venta</span>
                  </p>
                  <p>
                    Una venta no puede cancelarse ni borrarse cuando está confirmada y/o se encuentra entregada parcialmente, para salvaguardar el balance contable, los registros de kardex y el inventario de bodega.
                  </p>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setOrderToCancel(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 transition cursor-pointer"
                  >
                    Entendido / Volver
                  </button>
                </div>
              </div>
            </div>
          );
        }

        const linkedPurchases = (purchases || []).filter(
          (p: any) =>
            ((orderToCancel.linkedPurchaseId && p.id === orderToCancel.linkedPurchaseId) ||
              p.linkedCustomerOrderId === orderToCancel.id ||
              (orderToCancel.linkedPurchaseNumber && String(orderToCancel.linkedPurchaseNumber).includes(p.purchaseNumber)) ||
              (p.linkedCustomerOrderNumber && String(p.linkedCustomerOrderNumber).trim() === String(orderToCancel.orderNumber).trim()) ||
              (Array.isArray(p.items) &&
                p.items.some(
                  (it: any) =>
                    it.customerOrderId === orderToCancel.id ||
                    (it.orderNumber && String(it.orderNumber).trim() === String(orderToCancel.orderNumber).trim())
                ))) &&
            p.status !== 'received' &&
            p.status !== 'cancelled'
        );
        const hasLinkedPurchases = linkedPurchases.length > 0;
        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className={`bg-white border ${hasLinkedPurchases ? 'border-amber-300 max-w-lg' : 'border-slate-200 max-w-md'} rounded-2xl w-full p-5 shadow-xl space-y-4 animate-scaleUp`}>
              <div className="flex items-center space-x-3 text-amber-700 border-b border-slate-100 pb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">¿Cancelar este pedido?</h3>
                  <p className="text-xs text-amber-700 font-medium">El pedido pasará a estado Cancelado y se restablecerá su stock</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs text-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-500">Orden de Venta:</span>
                  <span className="font-mono font-bold text-sky-700">#{orderToCancel.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cliente:</span>
                  <span className="font-bold text-slate-900">{orderToCancel.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Monto Total:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    ${Number(orderToCancel.totalAmount).toFixed(2)} {currency}
                  </span>
                </div>
              </div>

              {hasLinkedPurchases ? (
                <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-300 space-y-2.5">
                  <div className="flex items-center space-x-2 text-amber-900">
                    <Package className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="text-xs font-bold">
                      {linkedPurchases.length === 1
                        ? '1 Orden de Compra al Proveedor Asociada'
                        : `${linkedPurchases.length} Órdenes de Compra a Proveedores Asociadas`}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Este pedido tiene {linkedPurchases.length === 1 ? 'una orden de compra vinculada con el proveedor:' : 'las siguientes órdenes de compra vinculadas por proveedor:'}
                  </p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {linkedPurchases.map((lp: any, lpIdx: number) => (
                      <div key={`lp-cancel-${lp.id ?? lpIdx}-${lpIdx}`} className="flex items-center justify-between p-2 rounded-lg bg-white/90 border border-amber-200 text-xs">
                        <div>
                          <span className="font-mono font-bold text-amber-950">#{lp.purchaseNumber || lp.id}</span>
                          <span className="text-slate-700 ml-1.5 font-medium">({lp.supplierName || 'Proveedor'})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold border border-amber-300">
                            {lp.status === 'ordered' ? '🔵 Ordenado' : '⏳ Pendiente'}
                          </span>
                          <span className="font-mono font-bold text-slate-800">
                            ${Number(lp.totalCost || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-amber-900 font-semibold">
                    ¿Qué deseas hacer con {linkedPurchases.length === 1 ? 'la orden de compra al proveedor' : 'las órdenes de compra a proveedores'}?
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isCancellingOrder}
                      onClick={() => handleConfirmCancelOrder('cancel')}
                      className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold text-left flex flex-col justify-between shadow-xs cursor-pointer transition"
                    >
                      <div className="flex items-center space-x-1.5 mb-1">
                        <X className="w-3.5 h-3.5" />
                        <span>Cancelar {linkedPurchases.length === 1 ? 'Orden Prov.' : `${linkedPurchases.length} Órdenes Prov.`}</span>
                      </div>
                      <span className="text-[10px] text-rose-100 font-normal">
                        Cancela las órdenes al proveedor ya que el cliente desistió de la compra.
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={isCancellingOrder}
                      onClick={() => handleConfirmCancelOrder('keep')}
                      className="p-2.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold text-left flex flex-col justify-between shadow-xs cursor-pointer transition"
                    >
                      <div className="flex items-center space-x-1.5 mb-1">
                        <Package className="w-3.5 h-3.5" />
                        <span>Conservar para Stock</span>
                      </div>
                      <span className="text-[10px] text-sky-100 font-normal">
                        Mantiene las compras activas para reponer o aumentar el stock general en bodega.
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  disabled={isCancellingOrder}
                  onClick={() => setOrderToCancel(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 transition cursor-pointer"
                >
                  Volver (No Cancelar)
                </button>
                {!hasLinkedPurchases && (
                  <button
                    disabled={isCancellingOrder}
                    onClick={() => handleConfirmCancelOrder()}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isCancellingOrder ? 'Cancelando...' : 'Confirmar Cancelación'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}


      {/* MODAL: VERIFY ORDER EXISTENCE & CONFIRM FINAL DELIVERY */}
      {orderToDeliver && (() => {
        const isPickup = isPickupDeliveryOrder(orderToDeliver);
        let rawItems = Array.isArray(orderToDeliver.items)
          ? orderToDeliver.items
          : typeof orderToDeliver.items === 'string'
          ? (() => {
              try {
                let p = JSON.parse(orderToDeliver.items);
                if (typeof p === 'string') {
                  try { p = JSON.parse(p); } catch {}
                }
                return Array.isArray(p) ? p : [];
              } catch {
                return [];
              }
            })()
          : [];

        // Fallback to linked purchase items if order items were empty
        if (rawItems.length === 0 && purchases) {
          const lp = purchases.find((p: any) =>
            ((orderToDeliver.linkedPurchaseId && p.id === orderToDeliver.linkedPurchaseId) || p.linkedCustomerOrderId === orderToDeliver.id) &&
            p.status !== 'cancelled'
          );
          if (lp && lp.items) {
            if (Array.isArray(lp.items)) rawItems = lp.items;
            else if (typeof lp.items === 'string') {
              try {
                let p = JSON.parse(lp.items);
                if (typeof p === 'string') {
                  try { p = JSON.parse(p); } catch {}
                }
                if (Array.isArray(p)) rawItems = p;
              } catch {}
            }
          }
        }
        const cleanCi = (orderToDeliver as any).customerCi || (orderToDeliver as any).customerIdentification || (orderToDeliver as any).ci || '';

        // Check if this order is awaiting supplier stock / purchase order reception
        const linkedPurchases = purchases?.filter((p: any) =>
          ((orderToDeliver.linkedPurchaseId && p.id === orderToDeliver.linkedPurchaseId) ||
            p.linkedCustomerOrderId === orderToDeliver.id ||
            (orderToDeliver.linkedPurchaseNumber && String(orderToDeliver.linkedPurchaseNumber).includes(p.purchaseNumber))) &&
          p.status !== 'cancelled'
        ) || [];
        const pendingPurchases = linkedPurchases.filter((p: any) => p.status !== 'received');
        const linkedPurchase = pendingPurchases[0] || linkedPurchases[0];
        const isWaitingSupplierReception = Boolean(
          pendingPurchases.length > 0 ||
          orderToDeliver.fulfillmentStatus === 'supplier_pending' ||
          orderToDeliver.fulfillmentStatus === 'supplier_ordered' ||
          orderToDeliver.fulfillmentStatus === 'awaiting_procurement'
        );

        // Regla ERP: Para pedidos con envío, la entrega final solo puede realizarse cuando el pedido esté en estado 'shipped' (Enviado)
        const isShippingDeliveryBlocked = !isPickup && orderToDeliver.status !== 'shipped';

        const handleConfirmDelivery = async () => {
          if (isShippingDeliveryBlocked) {
            showToast('⛔ Bloqueo ERP: Para pedidos con envío, el pedido debe estar en estado ENVIADO antes de registrar la entrega.');
            return;
          }
          if (isWaitingSupplierReception) {
            showToast('⛔ Bloqueo ERP: Debes confirmar y recibir la compra del proveedor antes de entregar este pedido.');
            return;
          }
          setIsConfirmingDelivery(true);
          try {
            const combinedNotes = (orderToDeliver.notes ? `${orderToDeliver.notes}\n` : '') +
              (deliveryNoteInput.trim() ? `[Entrega Verificada] ${deliveryNoteInput.trim()}` : '[Entrega Verificada en Sistema]');
            
            await onUpdateOrderStatus(
              orderToDeliver.id,
              'delivered',
              orderToDeliver.paymentVoucher || undefined,
              combinedNotes || undefined,
              orderToDeliver.trackingNumber || undefined,
              orderToDeliver.trackingCarrier || undefined,
              orderToDeliver.trackingNotes || undefined
            );
            showToast(`✓ Pedido #${orderToDeliver.orderNumber} verificado y registrado como ENTREGADO`);
            setOrderToDeliver(null);
            setDeliveryNoteInput('');
          } catch (err: any) {
            showToast(`❌ Error al confirmar entrega: ${err.message || 'Error desconocido'}`);
          } finally {
            setIsConfirmingDelivery(false);
          }
        };

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white border border-emerald-300 rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto animate-scaleUp max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-shrink-0">
                <div className="flex items-center space-x-3 text-emerald-700">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Comprobar y Registrar Entrega Final</h3>
                    <p className="text-xs text-emerald-700 font-medium">
                      Pedido #{orderToDeliver.orderNumber} • Verificación de Existencia ERP
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setOrderToDeliver(null);
                    setDeliveryNoteInput('');
                  }}
                  className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 pr-1 space-y-3.5 text-xs text-slate-700">
                {/* Bloqueo ERP si falta recibir al proveedor */}
                {isWaitingSupplierReception && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 space-y-2.5">
                    <div className="flex items-center gap-2 font-bold text-xs text-amber-900">
                      <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Bloqueo ERP: Mercadería Pendiente de Recepción del Proveedor</span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Este pedido se generó bajo demanda por falta de stock inicial y tiene asociada(s) orden(es) de compra a proveedor <strong>#{orderToDeliver.linkedPurchaseNumber || linkedPurchase?.purchaseNumber || linkedPurchase?.id || 'N/A'}</strong>.
                      <br />
                      <strong>Regla de Negocio:</strong> No puede pasar a estado <em>ENTREGADO</em> mientras no se confirme la recepción de mercadería de todos los proveedores en el módulo de Compras.
                    </p>
                    {pendingPurchases.length > 0 && onViewLinkedPurchase && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {pendingPurchases.map((p: any) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setOrderToDeliver(null);
                              onViewLinkedPurchase(p.id);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition shadow-xs cursor-pointer"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Ver y Recibir Orden #{p.purchaseNumber || p.id} ({p.supplierName})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Bloqueo ERP si el pedido es con envío y aún no está en estado 'shipped' */}
                {isShippingDeliveryBlocked && (
                  <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-300 text-blue-950 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-xs text-blue-900">
                      <Truck className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>Ciclo de Vida ERP: Pedido con Envío no Despachado</span>
                    </div>
                    <p className="text-[11px] text-blue-800 leading-relaxed">
                      Este pedido cuenta con modalidad de <strong>Envío a Domicilio</strong>. Según el ciclo de vida del sistema, el botón y registro de entrega solo se habilitan cuando el pedido se encuentra en estado <strong>ENVIADO</strong> (con su guía de despacho generada).
                    </p>
                  </div>
                )}

                {/* 1. Verificación de existencia del pedido */}
                <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Existencia del Pedido Comprobada en Base de Datos</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700 pt-1 border-t border-emerald-200/60">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Cliente Titular:</span>
                      <span className="font-bold text-slate-900">{orderToDeliver.customerName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">WhatsApp / Teléfono:</span>
                      <span className="font-bold text-slate-900">{orderToDeliver.customerPhone}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Cédula / RUC:</span>
                      <span className="font-mono font-bold text-slate-900">{cleanCi || 'Consumidor Final'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Modalidad de Entrega:</span>
                      <span className="font-bold text-slate-900">
                        {isPickup ? '🏪 Retiro en Local' : `🚚 Envío (${orderToDeliver.trackingCarrier || 'Courier'} - #${orderToDeliver.trackingNumber || 'S/N'})`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Productos a entregar */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-slate-700 font-bold border-b border-slate-200 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-sky-600" />
                      Productos Comprobados para Entrega ({rawItems.length} ítems):
                    </span>
                    <span className="font-mono text-emerald-700 text-sm">
                      Total: ${Number(orderToDeliver.totalAmount || 0).toFixed(2)} {currency}
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {rawItems.length === 0 ? (
                      <div className="p-3 text-center text-slate-500 italic text-xs bg-white rounded-lg border border-slate-200">
                        Pedido registrado en el sistema. Se procesará la entrega y verificación por el importe total del pedido.
                      </div>
                    ) : (
                      rawItems.map((it: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-slate-800">
                          <div className="flex items-center space-x-2">
                            <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-mono font-bold text-[10px]">
                              {it.quantity || 1}x
                            </span>
                            <span className="font-medium text-xs">{it.name || it.item?.name || 'Producto'}</span>
                          </div>
                          <span className="font-mono font-bold text-slate-900 text-xs">
                            ${(Number(it.salePrice || it.item?.salePrice || 0) * (it.quantity || 1)).toFixed(2)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 3. Nota o constancia de entrega */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Constancia o Nota de Entrega (Opcional):
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Recibió conforme cliente / Firmó guía de remisión"
                    value={deliveryNoteInput}
                    onChange={(e) => setDeliveryNoteInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 border-t border-slate-100 pt-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setOrderToDeliver(null);
                    setDeliveryNoteInput('');
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isConfirmingDelivery || isWaitingSupplierReception || isShippingDeliveryBlocked}
                  onClick={handleConfirmDelivery}
                  className={`px-5 py-2.5 rounded-xl text-white text-xs font-black transition flex items-center space-x-1.5 shadow-sm active:scale-95 ${
                    isWaitingSupplierReception || isShippingDeliveryBlocked
                      ? 'bg-slate-400 opacity-60 cursor-not-allowed'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 cursor-pointer'
                  }`}
                >
                  {isWaitingSupplierReception ? (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Bloqueado (Esperando Proveedor)</span>
                    </>
                  ) : isShippingDeliveryBlocked ? (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Bloqueado (Debe Enviarse Primero)</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isConfirmingDelivery ? 'Registrando Entrega...' : 'Confirmar y Registrar Entrega Final'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: MANAGE SHIPPING GUIDE, TRACKING & CI / ADDRESS DATA (INTEGRATED) */}
      {orderToShip && (
        <ManageShippingGuideModal
          key={orderToShip.id}
          order={orders.find((o) => String(o.id) === String(orderToShip.id)) || orderToShip}
          storeConfig={storeConfig}
          courierPartners={courierPartners}
          purchases={purchases}
          inventoryItems={products}
          onViewLinkedPurchase={onViewLinkedPurchase}
          currency={currency}
          onClose={() => setOrderToShip(null)}
          onSaveShippingData={handleSaveShippingGuideData}
          onPrintShippingTicket={(ord) => setOrderToPrintShipping(ord)}
          onOpenEditOrder={handleOpenEditOrder}
          onOpenDeleteOrder={(ord) => setOrderToDelete(ord)}
          showToast={showToast}
        />
      )}

      {/* MODAL: GESTIONAR SERVICIO DE ENVÍO PARA PEDIDOS PENDIENTES (3 PASOS EN ORDEN + MODIFICAR/ELIMINAR) */}
      {orderForPendingShipping && (
        <ManagePendingShippingModal
          order={orderForPendingShipping}
          storeConfig={storeConfig}
          courierPartners={courierPartners}
          paymentPartners={paymentPartners}
          currency={currency}
          onClose={() => setOrderForPendingShipping(null)}
          onUpdateOrder={onUpdateOrder}
          onUpdateOrderStatus={onUpdateOrderStatus}
          onOpenEditOrder={handleOpenEditOrder}
          onOpenDeleteOrder={(ord) => setOrderToDelete(ord)}
          onPrintShippingTicket={(ord) => setOrderToPrintShipping(ord)}
          showToast={showToast}
        />
      )}

      {/* UNIFIED ORDER MANAGEMENT MODAL (EDIT, CONFIRM & MANUAL CREATION) */}
      {(isManualOrderModalOpen || orderToEdit || orderToConfirm) && (
        <UnifiedOrderManageModal
          order={orderToEdit || orderToConfirm || null}
          isOpen={isManualOrderModalOpen || !!orderToEdit || !!orderToConfirm}
          isManualCreate={isManualOrderModalOpen && !orderToEdit && !orderToConfirm}
          onClose={() => {
            setIsManualOrderModalOpen(false);
            setOrderToEdit(null);
            setOrderToConfirm(null);
            setVoucherError(null);
          }}
          storeConfig={storeConfig}
          currency={currency}
          products={products}
          purchases={purchases}
          dbCustomers={dbCustomers}
          paymentPartners={paymentPartners}
          courierPartners={courierPartners}
          onCreateOrder={onCreateOrder}
          onUpdateOrder={onUpdateOrder}
          onUpdateOrderStatus={onUpdateOrderStatus}
          showToast={showToast}
          onOpenShippingTicket={(ord) => setOrderToPrintShipping(ord)}
          onCancelOrderClick={(ord) => {
            setOrderToCancel(ord);
            setIsManualOrderModalOpen(false);
            setOrderToEdit(null);
            setOrderToConfirm(null);
          }}
          onGenerateSupplierPurchase={onGenerateSupplierPurchase}
          onOpenPendingShipping={(ord) => setOrderForPendingShipping(ord)}
        />
      )}

      {/* MODAL: QUICK SET / EDIT SHIPPING COST & SEND PAYMENT DETAILS */}
      {orderToSetShipping && (() => {
        const items = Array.isArray(orderToSetShipping.items) ? orderToSetShipping.items : [];
        const itemsSub = items.reduce((acc: number, it: any) => acc + (Number(it.salePrice || it.item?.salePrice || 0) * (Number(it.quantity) || 1)), 0);
        const shipCost = Math.max(0, Number(quickShippingCostInput) || 0);
        const newTotal = itemsSub + shipCost;
        const activePartners = paymentPartners.filter((p) => p.active !== false);
        const currentPartner = activePartners.find((p) => p.id === selectedQuickPaymentPartnerId) || activePartners[0];
        const isCash = isCashPayment(orderToSetShipping.paymentMethod) || (currentPartner && isCashPayment(currentPartner.name));

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white border border-sky-200 rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-xl space-y-4 my-auto animate-scaleUp max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-shrink-0">
                <div className="flex items-center space-x-3 text-sky-700">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-sky-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Asignar Envío y Enviar Datos de Pago</h3>
                    <p className="text-xs text-slate-500">Pedido #{orderToSetShipping.orderNumber} • {orderToSetShipping.customerName}</p>
                  </div>
                </div>
                <button
                  onClick={() => setOrderToSetShipping(null)}
                  className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3.5 text-xs overflow-y-auto pr-1 flex-1">
                {/* Order items recap */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex justify-between text-slate-700">
                    <span>Subtotal de Productos:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      ${itemsSub.toFixed(2)} {currency}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Destino / Dirección:</span>
                    <span className="text-slate-800 text-right truncate max-w-[260px] font-medium">{orderToSetShipping.customerAddress || 'Envío a Domicilio'}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Teléfono WhatsApp:</span>
                    <span className="font-mono text-emerald-700 font-bold">{orderToSetShipping.customerPhone || 'Sin teléfono'}</span>
                  </div>
                </div>

                {/* Carrier Selection */}
                <div>
                  <label className="block text-slate-800 font-bold mb-1">1. Empresa de Transporte / Courier:</label>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {courierPartners
                      .filter((c) => c.active !== false)
                      .map((c) => (
                        <button
                          key={c.id || c.name}
                          type="button"
                          onClick={() => setQuickShippingCarrierInput(c.name)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                            quickShippingCarrierInput.toLowerCase() === c.name.toLowerCase()
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:text-slate-900'
                          }`}
                        >
                          {c.logoUrl ? (
                            <img src={c.logoUrl} alt={c.name} className="w-3.5 h-3.5 object-contain rounded-xs bg-white p-0.5" />
                          ) : (
                            <Truck className="w-3.5 h-3.5 text-blue-600" />
                          )}
                          <span>{c.name}</span>
                        </button>
                      ))}
                  </div>
                  <input
                    type="text"
                    value={quickShippingCarrierInput}
                    onChange={(e) => setQuickShippingCarrierInput(e.target.value)}
                    placeholder="Ej. Servientrega, LaarCourier, Urbano..."
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-sky-500 font-semibold"
                  />

                  {/* Enlace para abrir cotizador web si existe */}
                  {(() => {
                    const matched = courierPartners.find(
                      (c) =>
                        c.name.toLowerCase() === (quickShippingCarrierInput || '').trim().toLowerCase() ||
                        (quickShippingCarrierInput && c.name.toLowerCase().includes(quickShippingCarrierInput.trim().toLowerCase()))
                    );
                    if (matched?.quoteUrl?.trim()) {
                      return (
                        <div className="mt-1.5 p-2 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-between gap-2">
                          <div className="flex items-center space-x-1.5 min-w-0">
                            <ExternalLink className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                            <span className="text-[11px] font-bold text-sky-900 truncate">
                              Cotizador Web de {matched.name}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const url = matched.quoteUrl!.trim();
                              const target = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
                              window.open(target, '_blank', 'noopener,noreferrer');
                            }}
                            className="px-2 py-1 rounded-md bg-sky-600 hover:bg-sky-700 active:scale-95 text-white text-[10px] font-bold transition flex items-center space-x-1 cursor-pointer shrink-0"
                            title={`Abrir portal de cotizaciones de ${matched.name} en una ventana nueva`}
                          >
                            <span>Abrir Cotizador</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* Shipping cost input & quick chips */}
                <div>
                  <label className="block text-slate-800 font-bold mb-1">2. Valor del Envío / Flete ($):</label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono font-bold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={quickShippingCostInput}
                        onChange={(e) => setQuickShippingCostInput(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2 rounded-xl bg-white border border-sky-300 text-emerald-700 font-mono font-bold text-sm focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {['0.00', '3.50', '5.00', '7.00'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setQuickShippingCostInput(val)}
                          className={`px-2.5 py-2 rounded-xl text-[11px] font-mono font-bold border transition cursor-pointer ${
                            Number(quickShippingCostInput) === Number(val)
                              ? 'bg-sky-600 text-white border-sky-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-sky-400'
                          }`}
                        >
                          {val === '0.00' ? 'Gratis' : `$${val}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Payment Method Details to Send */}
                <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-slate-800 font-bold">
                      3. Método de Pago a Enviar por WhatsApp:
                    </label>
                    <span className="text-[10px] text-purple-700 font-medium">
                      Pedido original: {orderToSetShipping.paymentMethod || 'No especificado'}
                    </span>
                  </div>

                  {activePartners.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {activePartners.map((partner) => (
                        <button
                          key={partner.id}
                          type="button"
                          onClick={() => setSelectedQuickPaymentPartnerId(partner.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                            (selectedQuickPaymentPartnerId === partner.id || (!selectedQuickPaymentPartnerId && activePartners[0]?.id === partner.id))
                              ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:text-slate-900'
                          }`}
                        >
                          {partner.logoUrl ? (
                            <img src={partner.logoUrl} alt={partner.name} className="w-3.5 h-3.5 object-contain rounded-xs bg-white p-0.5" />
                          ) : (
                            <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                          )}
                          <span>{partner.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {currentPartner?.details && (
                    <div className="p-2.5 rounded-lg bg-white border border-purple-200 text-slate-800 font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                      {currentPartner.details}
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-0.5">Nota o instrucción adicional (opcional):</label>
                    <input
                      type="text"
                      value={quickShippingPaymentNote}
                      onChange={(e) => setQuickShippingPaymentNote(e.target.value)}
                      placeholder="Ej. Enviar comprobante indicando tu nombre..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* Total Calculation Preview */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-slate-800 font-bold block">Total Final (Productos + Envío):</span>
                    <span className="text-[10px] text-slate-500">
                      ${itemsSub.toFixed(2)} + ${shipCost.toFixed(2)} envío
                    </span>
                  </div>
                  <span className="text-base font-black text-emerald-700 font-mono">
                    ${newTotal.toFixed(2)} {currency}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-100 flex-shrink-0">
                <button
                  type="button"
                  disabled={isSavingQuickShipping}
                  onClick={() => setOrderToSetShipping(null)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    disabled={isSavingQuickShipping}
                    onClick={() => handleSaveQuickShipping(false)}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isSavingQuickShipping ? 'Guardando...' : 'Solo Guardar'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSavingQuickShipping}
                    onClick={() => handleSaveQuickShipping(true)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white text-xs font-black transition flex items-center space-x-1.5 cursor-pointer shadow-xs"
                  >
                    <MessageCircle className="w-3.5 h-3.5 fill-current" />
                    <span>Guardar y Enviar a WhatsApp con Datos de Pago</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: PRINT SHIPPING TICKET & LABEL */}
      {orderToPrintShipping && (
        <ShippingTicketModal
          order={orderToPrintShipping}
          storeConfig={storeConfig}
          currency={currency}
          onClose={() => setOrderToPrintShipping(null)}
          showToast={showToast}
        />
      )}

      {/* MODAL: REQUEST EXACT SHIPPING DATA VIA WHATSAPP & UPDATE ADDRESS */}
      {orderToRequestShippingData && (
        <RequestShippingDataModal
          order={orderToRequestShippingData}
          storeConfig={storeConfig}
          onClose={() => setOrderToRequestShippingData(null)}
          onSaveAddress={handleSaveUpdatedShippingAddress}
          showToast={showToast}
          buildWhatsAppLink={buildWhatsAppLink}
        />
      )}

      {/* MODAL: PARTIAL DELIVERY & FULFILLMENT MANAGEMENT */}
      {orderForPartialDelivery && (
        <PartialDeliveryModal
          order={orderForPartialDelivery}
          isOpen={Boolean(orderForPartialDelivery)}
          onClose={() => setOrderForPartialDelivery(null)}
          inventoryItems={products}
          storeConfig={storeConfig}
          onConfirmPartialDelivery={handleConfirmPartialDelivery}
          showToast={showToast}
        />
      )}

      {/* MODAL: PUBLIC PROMOTIONAL CAMPAIGN POPUP / BANNER */}
      {(isCustomerOnly || storeTab === 'catalog') && (
        <StorePromoModal
          config={storeConfig?.promoPopup}
          storeName={storeConfig?.storeName || 'Comerxia Store'}
          whatsappNumber={storeConfig?.whatsappNumber || ''}
          currency={currency}
          onFilterOffers={() => {
            setShowOffersOnly(true);
            setSelectedCategory('all');
          }}
          onSelectProduct={(productId) => {
            const found = products.find((p) => String(p.id) === String(productId));
            if (found) {
              setQuickViewProduct(found);
            }
          }}
        />
      )}

      {/* STATIC FIXED BOTTOM NAVIGATION BAR (Customer View) - Hidden when Filter & Categories Sheet is Open */}
      {isCustomerView && !isFilterSheetOpen && (
        <StoreBottomBar
          onGoHome={handleBottomBarHome}
          onOpenPayments={() => {
            setIsStoreShippingModalOpen(false);
            setIsStorePaymentsModalOpen(true);
          }}
          onOpenShipping={() => {
            setIsStorePaymentsModalOpen(false);
            setIsStoreShippingModalOpen(true);
          }}
          whatsappNumber={storeConfig?.whatsappNumber}
          storeName={storeConfig?.storeName}
          activeTheme={activeTheme}
          isProductDetailOpen={Boolean(quickViewProduct)}
          activeModal={
            isStorePaymentsModalOpen
              ? 'payments'
              : isStoreShippingModalOpen
              ? 'shipping'
              : 'none'
          }
        />
      )}

      {/* MODAL: PAYMENT METHODS VIEWER */}
      {isCustomerView && (
        <StorePaymentMethodsModal
          isOpen={isStorePaymentsModalOpen}
          onClose={() => setIsStorePaymentsModalOpen(false)}
          paymentPartners={paymentPartners}
          whatsappNumber={storeConfig?.whatsappNumber}
          storeName={storeConfig?.storeName}
          currency={currency}
          activeTheme={activeTheme}
        />
      )}

      {/* MODAL: SHIPPING COURIERS VIEWER */}
      {isCustomerView && (
        <StoreShippingCouriersModal
          isOpen={isStoreShippingModalOpen}
          onClose={() => setIsStoreShippingModalOpen(false)}
          courierPartners={courierPartners}
          whatsappNumber={storeConfig?.whatsappNumber}
          storeName={storeConfig?.storeName}
          activeTheme={activeTheme}
        />
      )}
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  DollarSign,
  Globe,
  HelpCircle,
  Image as ImageIcon,
  Landmark,
  Layers,
  MapPin,
  MessageCircle,
  Package,
  Palette,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Store,
  Trash2,
  Truck,
  UploadCloud,
  X,
  Zap,
  Sparkles,
  Gift,
  Tag,
  Flame,
  Eye,
  EyeOff,
  Wand2,
  ExternalLink,
  Power,
  PauseCircle,
  AlertTriangle,
  AlertOctagon,
  Lock,
  Unlock,
  MessageSquare,
  Search,
  Sliders,
  Grid,
  CheckSquare,
  Share2,
  Smartphone,
  Laptop,
} from 'lucide-react';
import { StoreConfig, StoreTheme, CourierPartner, PaymentMethodPartner, StorePromoPopupConfig, InventoryItem } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  DEFAULT_THEME_COLORS,
  COLOR_ROLE_NAMES,
  THEME_PRESETS,
  parseThemePalettes,
} from './OnlineStoreView.tsx';
import { StorePromoModal } from './store/StorePromoModal.tsx';

interface StoreSettingsTabProps {
  initialConfig?: StoreConfig | null;
  onSaved?: () => void;
  customerStoreUrl?: string;
  onDeployLocal?: () => void;
}

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
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/png', 0.9));
        } else {
          resolve(e.target?.result as string);
        }
      };
      img.onerror = () => reject(new Error('Error al decodificar la imagen'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsDataURL(file);
  });
};

export const StoreSettingsTab: React.FC<StoreSettingsTabProps> = ({
  initialConfig,
  onSaved,
}) => {
  const { authFetch } = useAuth();

  const [isActive, setIsActive] = useState(true);
  const [maintenanceTitle, setMaintenanceTitle] = useState('Tienda Temporalmente Pausada');
  const [maintenanceMessage, setMaintenanceMessage] = useState('Estamos actualizando nuestro catálogo e inventario para ofrecerte la mejor experiencia. ¡Volveremos muy pronto!');
  const [allowCatalogBrowsing, setAllowCatalogBrowsing] = useState(false);
  const [showMaintenancePreview, setShowMaintenancePreview] = useState(false);

  const [storeName, setStoreName] = useState('Comerxia Store');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [description, setDescription] = useState('Catálogo digital con envíos y pedidos directos');
  const [bannerText, setBannerText] = useState('🔥 ¡Catálogo actualizado con las últimas novedades en stock!');
  const [deliveryFee, setDeliveryFee] = useState('0.00');
  const [minOrderAmount, setMinOrderAmount] = useState('0.00');
  const [currency, setCurrency] = useState('USD');
  const [showStock, setShowStock] = useState(true);
  const [showOutOfStock, setShowOutOfStock] = useState(true);
  const [enablePagination, setEnablePagination] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState<number>(12);
  const [instagramUrl, setInstagramUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [address, setAddress] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null); // Logo cuadrado para celular (1:1)
  const [logoDesktopUrl, setLogoDesktopUrl] = useState<string | null>(null); // Logo rectangular para PC/Escritorio

  const [theme, setTheme] = useState<StoreTheme>('classic');
  const [themePalettes, setThemePalettes] = useState<Record<string, string[]>>({
    classic: [...DEFAULT_THEME_COLORS.classic],
    boutique: [...DEFAULT_THEME_COLORS.boutique],
    fresh: [...DEFAULT_THEME_COLORS.fresh],
    brutalist: [...DEFAULT_THEME_COLORS.brutalist],
    cyber: [...DEFAULT_THEME_COLORS.cyber],
    minimal: [...DEFAULT_THEME_COLORS.minimal],
  });

  const [couriers, setCouriers] = useState<CourierPartner[]>(DEFAULT_COURIERS);
  const [payments, setPayments] = useState<PaymentMethodPartner[]>(DEFAULT_PAYMENTS);

  // Promotional Popup / Billboard AI Configuration
  const [promoActive, setPromoActive] = useState(true);
  const [promoTheme, setPromoTheme] = useState<'christmas' | 'black_friday' | 'super_deals' | 'new_year' | 'clearance' | 'custom' | string>('christmas');
  const [promoBadge, setPromoBadge] = useState('🎄 OFERTA NAVIDEÑA');
  const [promoTitle, setPromoTitle] = useState('¡Gran Venta Especial de Navidad!');
  const [promoDescription, setPromoDescription] = useState('Aprovecha hasta un 30% de descuento en regalos seleccionados, stock limitado y envíos rápidos a todo el país.');
  const [promoImageUrl, setPromoImageUrl] = useState<string | null>('https://images.unsplash.com/photo-1543258103-a62bd96b300b?auto=format&fit=crop&w=900&q=85');
  const [promoCouponCode, setPromoCouponCode] = useState('NAVIDAD2026');
  const [promoButtonText, setPromoButtonText] = useState('¡Pedir con Descuento por WhatsApp!');
  const [promoActionType, setPromoActionType] = useState<'whatsapp' | 'catalog' | 'url' | 'product'>('whatsapp');
  const [promoActionUrl, setPromoActionUrl] = useState('');

  // Focal promo product/category selection
  const [storeProducts, setStoreProducts] = useState<InventoryItem[]>([]);
  const [promoFocalType, setPromoFocalType] = useState<'store' | 'category' | 'product'>('store');
  const [promoCategory, setPromoCategory] = useState<string>('');
  const [promoSelectedProductId, setPromoSelectedProductId] = useState<string | number>('');
  const [promoFeaturedProductName, setPromoFeaturedProductName] = useState<string>('');
  const [promoFeaturedProductPrice, setPromoFeaturedProductPrice] = useState<string | number>('');
  const [promoFeaturedProductImage, setPromoFeaturedProductImage] = useState<string>('');
  const [promoIncludeProductCard, setPromoIncludeProductCard] = useState<boolean>(true);

  // Poster style & candidate choices
  const [promoPosterStyle, setPromoPosterStyle] = useState<string>('commercial_studio');
  const [promoCandidateImages, setPromoCandidateImages] = useState<Array<{ url: string; title: string; source: string; tag: string }>>([]);

  const productCategories = useMemo(() => {
    const set = new Set<string>();
    storeProducts.forEach((p) => {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    });
    return Array.from(set);
  }, [storeProducts]);

  const selectedProduct = useMemo(() => {
    if (!promoSelectedProductId) return null;
    return storeProducts.find((p) => String(p.id) === String(promoSelectedProductId)) || null;
  }, [storeProducts, promoSelectedProductId]);

  // Web search modal for real commercial banners
  const [showWebSearchModal, setShowWebSearchModal] = useState(false);
  const [webSearchQuery, setWebSearchQuery] = useState('');
  const [webSearchResults, setWebSearchResults] = useState<Array<{ url: string; title: string; source: string; tag: string }>>([]);
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);

  // Curated presets modal
  const [showCuratedModal, setShowCuratedModal] = useState(false);
  const [curatedPresets, setCuratedPresets] = useState<Record<string, Array<{ url: string; title: string; source: string; tag: string }>>>({});
  const [selectedCuratedCategory, setSelectedCuratedCategory] = useState<string>('tecnologia');
  const [isLoadingCurated, setIsLoadingCurated] = useState(false);

  // AI Generation controls
  const [isGeneratingPromoAi, setIsGeneratingPromoAi] = useState(false);
  const [promoDiscountInput, setPromoDiscountInput] = useState('30% OFF');
  const [promoCustomPromptInput, setPromoCustomPromptInput] = useState('');
  const [showPromoTestModal, setShowPromoTestModal] = useState(false);

  const [newCourierName, setNewCourierName] = useState('');
  const [newCourierQuoteUrl, setNewCourierQuoteUrl] = useState('');
  const [newCourierLogo, setNewCourierLogo] = useState<string | null>(null);
  const [newPaymentName, setNewPaymentName] = useState('');
  const [newPaymentDetails, setNewPaymentDetails] = useState('');
  const [newPaymentLogo, setNewPaymentLogo] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetchStoreConfig();
    fetchStoreProducts();
  }, []);

  const fetchStoreProducts = async () => {
    try {
      const res = await authFetch('/api/inventory?limit=200');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) {
          setStoreProducts(data.items);
        } else if (Array.isArray(data)) {
          setStoreProducts(data);
        }
      }
    } catch (err) {
      console.warn('Could not fetch products for promo selector:', err);
    }
  };

  const handleSelectProduct = (productId: string | number) => {
    setPromoSelectedProductId(productId);
    const prod = storeProducts.find((p) => String(p.id) === String(productId));
    if (prod) {
      setPromoFeaturedProductName(prod.name);
      setPromoFeaturedProductPrice(prod.salePrice || '');
      setPromoFeaturedProductImage(prod.imageUrl || '');
      if (prod.category) {
        setPromoCategory(prod.category);
      }
      setPromoBadge('⭐ PRODUCTO DESTACADO');
      setPromoTitle(`¡Oferta Especial en ${prod.name}!`);
      if (prod.description) {
        setPromoDescription(prod.description.slice(0, 140) + (prod.description.length > 140 ? '...' : ''));
      }
      if (!promoDiscountInput || promoDiscountInput === '30% OFF') {
        setPromoDiscountInput('20% OFF');
      }
    } else {
      setPromoFeaturedProductName('');
      setPromoFeaturedProductPrice('');
      setPromoFeaturedProductImage('');
    }
  };

  const fetchStoreConfig = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/store/config');
      if (res.ok) {
        const data = await res.json();
        if (data) {
          if (data.isActive !== undefined) setIsActive(Boolean(data.isActive));
          if (data.maintenanceTitle !== undefined && data.maintenanceTitle !== null) setMaintenanceTitle(data.maintenanceTitle);
          if (data.maintenanceMessage !== undefined && data.maintenanceMessage !== null) setMaintenanceMessage(data.maintenanceMessage);
          if (data.allowCatalogBrowsing !== undefined) setAllowCatalogBrowsing(Boolean(data.allowCatalogBrowsing));

          if (data.storeName) setStoreName(data.storeName);
          if (data.whatsappNumber) setWhatsappNumber(data.whatsappNumber);
          if (data.description) setDescription(data.description);
          if (data.bannerText) setBannerText(data.bannerText);
          if (data.deliveryFee !== undefined) setDeliveryFee(String(data.deliveryFee));
          if (data.minOrderAmount !== undefined) setMinOrderAmount(String(data.minOrderAmount));
          if (data.currency) setCurrency(data.currency);
          if (data.showStock !== undefined) setShowStock(Boolean(data.showStock));
          if (data.showOutOfStock !== undefined) setShowOutOfStock(Boolean(data.showOutOfStock));
          if (data.enablePagination !== undefined) setEnablePagination(Boolean(data.enablePagination));
          if (data.itemsPerPage !== undefined) setItemsPerPage(Number(data.itemsPerPage) || 12);
          if (data.instagramUrl) setInstagramUrl(data.instagramUrl);
          if (data.websiteUrl) setWebsiteUrl(data.websiteUrl);
          if (data.address) setAddress(data.address);
          if (data.logoUrl) setLogoUrl(data.logoUrl);
          if (data.logoDesktopUrl || data.logo_desktop_url) setLogoDesktopUrl(data.logoDesktopUrl || data.logo_desktop_url);
          if (data.theme) setTheme(data.theme);
          if (data.themeColors) setThemePalettes(parseThemePalettes(data.themeColors));

          if (data.promoPopup) {
            try {
              const parsedPromo = typeof data.promoPopup === 'string' ? JSON.parse(data.promoPopup) : data.promoPopup;
              if (parsedPromo && typeof parsedPromo === 'object') {
                if (parsedPromo.active !== undefined) setPromoActive(Boolean(parsedPromo.active));
                if (parsedPromo.theme) setPromoTheme(parsedPromo.theme);
                if (parsedPromo.badge) setPromoBadge(parsedPromo.badge);
                if (parsedPromo.title) setPromoTitle(parsedPromo.title);
                if (parsedPromo.description) setPromoDescription(parsedPromo.description);
                if (parsedPromo.imageUrl !== undefined) setPromoImageUrl(parsedPromo.imageUrl);
                if (parsedPromo.couponCode !== undefined) setPromoCouponCode(parsedPromo.couponCode);
                if (parsedPromo.buttonText) setPromoButtonText(parsedPromo.buttonText);
                if (parsedPromo.actionType) setPromoActionType(parsedPromo.actionType);
                if (parsedPromo.actionUrl !== undefined) setPromoActionUrl(parsedPromo.actionUrl);
                if (parsedPromo.featuredProductId !== undefined) setPromoSelectedProductId(parsedPromo.featuredProductId);
                if (parsedPromo.featuredProductName !== undefined) setPromoFeaturedProductName(parsedPromo.featuredProductName);
                if (parsedPromo.featuredProductPrice !== undefined) setPromoFeaturedProductPrice(parsedPromo.featuredProductPrice);
                if (parsedPromo.featuredProductImage !== undefined) setPromoFeaturedProductImage(parsedPromo.featuredProductImage);
                if (parsedPromo.featuredCategory !== undefined) setPromoCategory(parsedPromo.featuredCategory);
                if (parsedPromo.featuredProductId) {
                  setPromoFocalType('product');
                } else if (parsedPromo.featuredCategory) {
                  setPromoFocalType('category');
                }
              }
            } catch {}
          }

          if (data.courierLogos) {
            try {
              const parsedCouriers = typeof data.courierLogos === 'string' ? JSON.parse(data.courierLogos) : data.courierLogos;
              if (Array.isArray(parsedCouriers) && parsedCouriers.length > 0) {
                setCouriers(parsedCouriers);
              }
            } catch {}
          }

          if (data.paymentLogos) {
            try {
              const parsedPayments = typeof data.paymentLogos === 'string' ? JSON.parse(data.paymentLogos) : data.paymentLogos;
              if (Array.isArray(parsedPayments) && parsedPayments.length > 0) {
                setPayments(parsedPayments);
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      console.error('Error fetching store config:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPromoPreset = (presetKey: string) => {
    setPromoTheme(presetKey);
    if (presetKey === 'christmas') {
      setPromoBadge('🎄 OFERTA NAVIDEÑA');
      setPromoTitle(promoDiscountInput ? `¡Especial Navideño: ${promoDiscountInput}!` : '¡Gran Venta Especial de Navidad!');
      setPromoDescription('Celebra las fiestas con los mejores regalos, descuentos especiales y envíos directos a todo el país.');
      setPromoCouponCode('NAVIDAD2026');
      setPromoImageUrl('https://images.unsplash.com/photo-1543258103-a62bd96b300b?auto=format&fit=crop&w=900&q=85');
      setPromoButtonText('¡Comprar por WhatsApp con Descuento!');
    } else if (presetKey === 'black_friday') {
      setPromoBadge('🖤 BLACK FRIDAY');
      setPromoTitle(promoDiscountInput ? `¡Black Friday: ${promoDiscountInput}!` : '¡Mega Ofertas Black Friday!');
      setPromoDescription('Los precios más bajos del año por tiempo limitado. Aprovecha antes de que se agoten las unidades en stock.');
      setPromoCouponCode('BLACKFRIDAY');
      setPromoImageUrl('https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=900&q=85');
      setPromoButtonText('¡Aprovechar Black Friday por WhatsApp!');
    } else if (presetKey === 'super_deals') {
      setPromoBadge('🔥 SÚPER OFERTAS');
      setPromoTitle(promoDiscountInput ? `¡Super Descuentos: ${promoDiscountInput}!` : '¡Semana de Super Descuentos!');
      setPromoDescription('Precios rebajados en productos seleccionados. Haz tu pedido hoy mismo con atención personalizada.');
      setPromoCouponCode('OFERTAS2026');
      setPromoImageUrl('https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=900&q=85');
      setPromoButtonText('¡Ver Ofertas y Comprar!');
    } else if (presetKey === 'new_year') {
      setPromoBadge('🎆 AÑO NUEVO 2026');
      setPromoTitle('¡Celebra el Nuevo Año con Grandes Ofertas!');
      setPromoDescription('Inicia este nuevo ciclo estrenando lo mejor. Promociones exclusivas para nuestros clientes.');
      setPromoCouponCode('ANONUEVO2026');
      setPromoImageUrl('https://images.unsplash.com/photo-1467810563316-b5476525c0f9?auto=format&fit=crop&w=900&q=85');
      setPromoButtonText('¡Aprovechar Promo de Año Nuevo!');
    } else if (presetKey === 'clearance') {
      setPromoBadge('⚡ LIQUIDACIÓN TOTAL');
      setPromoTitle('¡Liquidación de Stock por Temporada!');
      setPromoDescription('¡Últimas unidades disponibles a precio de liquidación! No dejes pasar esta oportunidad.');
      setPromoCouponCode('LIQUIDA2026');
      setPromoImageUrl('https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=900&q=85');
      setPromoButtonText('¡Comprar Liquidación por WhatsApp!');
    }
  };

  const handleGeneratePromoWithAI = async () => {
    setIsGeneratingPromoAi(true);
    try {
      const activeCategory = promoFocalType === 'category' ? promoCategory : (promoFocalType === 'product' ? promoCategory : '');
      const activeProductName = promoFocalType === 'product' ? promoFeaturedProductName : '';
      const activeProductImg = promoFocalType === 'product' ? promoFeaturedProductImage : '';
      const activeProductPrice = promoFocalType === 'product' ? String(promoFeaturedProductPrice) : '';

      const res = await authFetch('/api/store/promo-image/generate-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: promoTheme,
          storeName: storeName.trim(),
          discountText: promoDiscountInput.trim(),
          customPrompt: promoCustomPromptInput.trim(),
          badge: promoBadge.trim(),
          category: activeCategory,
          productName: activeProductName,
          productImageUrl: activeProductImg,
          productPrice: activeProductPrice,
          posterStyle: promoPosterStyle,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.image) {
          if (data.image.imageUrl) setPromoImageUrl(data.image.imageUrl);
          if (data.image.suggestedBadge) setPromoBadge(data.image.suggestedBadge);
          if (data.image.suggestedTitle) setPromoTitle(data.image.suggestedTitle);
          if (data.image.suggestedDescription) setPromoDescription(data.image.suggestedDescription);
          if (data.image.suggestedCoupon) setPromoCouponCode(data.image.suggestedCoupon);
          if (Array.isArray(data.image.candidateImages) && data.image.candidateImages.length > 0) {
            setPromoCandidateImages(data.image.candidateImages);
          }
          
          setFeedback({
            type: 'success',
            message: `✨ ¡Afiche publicitario contextual y textos generados (${data.image.tag})! Explora los candidatos abajo.`,
          });
        }
      } else {
        const err = await res.json();
        setFeedback({
          type: 'error',
          message: err.error || 'No se pudo generar el afiche con IA',
        });
      }
    } catch (e: any) {
      setFeedback({
        type: 'error',
        message: e.message || 'Error de conexión al generar con IA',
      });
    } finally {
      setIsGeneratingPromoAi(false);
      setTimeout(() => setFeedback(null), 6000);
    }
  };

  const handleSearchWebPromos = async (searchQuery?: string) => {
    const q = searchQuery !== undefined ? searchQuery : webSearchQuery;
    if (!q.trim()) return;
    setIsSearchingWeb(true);
    try {
      const res = await authFetch('/api/store/promo-image/search-web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q.trim(), limit: 16 }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.images)) {
          setWebSearchResults(data.images);
        }
      }
    } catch (err) {
      console.warn('Error searching web promo images:', err);
    } finally {
      setIsSearchingWeb(false);
    }
  };

  const handleFetchCuratedPresets = async () => {
    setShowCuratedModal(true);
    if (Object.keys(curatedPresets).length > 0) return;
    setIsLoadingCurated(true);
    try {
      const res = await authFetch('/api/store/promo-image/curated-presets');
      if (res.ok) {
        const data = await res.json();
        if (data.presets) {
          setCuratedPresets(data.presets);
        }
      }
    } catch (err) {
      console.warn('Error fetching curated presets:', err);
    } finally {
      setIsLoadingCurated(false);
    }
  };

  const handleUpdateThemeColor = (presetId: string, colorIndex: number, newHex: string) => {
    setThemePalettes((prev) => {
      const currentList = prev[presetId] || DEFAULT_THEME_COLORS[presetId as StoreTheme] || DEFAULT_THEME_COLORS.classic;
      const nextList = [...currentList];
      nextList[colorIndex] = newHex;
      return {
        ...prev,
        [presetId]: nextList,
      };
    });
  };

  const handleToggleCourier = (id: string) => {
    setCouriers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c))
    );
  };

  const handleAddCustomCourier = () => {
    if (!newCourierName.trim()) return;
    const newId = `custom-courier-${Date.now()}`;
    setCouriers((prev) => [
      ...prev,
      {
        id: newId,
        name: newCourierName.trim(),
        quoteUrl: newCourierQuoteUrl.trim() || undefined,
        logoUrl: newCourierLogo || undefined,
        active: true,
      },
    ]);
    setNewCourierName('');
    setNewCourierQuoteUrl('');
    setNewCourierLogo(null);
  };

  const handleRemoveCourier = (id: string) => {
    setCouriers((prev) => prev.filter((c) => c.id !== id));
  };

  const handleTogglePayment = (id: string) => {
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p))
    );
  };

  const handleAddCustomPayment = () => {
    if (!newPaymentName.trim()) return;
    const newId = `custom-payment-${Date.now()}`;
    setPayments((prev) => [
      ...prev,
      {
        id: newId,
        name: newPaymentName.trim(),
        details: newPaymentDetails.trim() || undefined,
        logoUrl: newPaymentLogo || undefined,
        active: true,
      },
    ]);
    setNewPaymentName('');
    setNewPaymentDetails('');
    setNewPaymentLogo(null);
  };

  const handleRemovePayment = (id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        isActive,
        maintenanceTitle: maintenanceTitle.trim(),
        maintenanceMessage: maintenanceMessage.trim(),
        allowCatalogBrowsing,
        storeName: storeName.trim(),
        whatsappNumber: whatsappNumber.trim(),
        description: description.trim(),
        bannerText: bannerText.trim(),
        deliveryFee: Number(deliveryFee) || 0,
        minOrderAmount: Number(minOrderAmount) || 0,
        currency: currency.trim() || 'USD',
        showStock,
        showOutOfStock,
        enablePagination,
        itemsPerPage: Number(itemsPerPage) || 12,
        instagramUrl: instagramUrl.trim(),
        websiteUrl: websiteUrl.trim(),
        address: address.trim(),
        logoUrl: logoUrl || null,
        logoDesktopUrl: logoDesktopUrl || null,
        theme,
        themeColors: JSON.stringify(themePalettes),
        courierLogos: JSON.stringify(couriers),
        paymentLogos: JSON.stringify(payments),
        promoPopup: JSON.stringify({
          active: promoActive,
          theme: promoTheme,
          badge: promoBadge.trim(),
          title: promoTitle.trim(),
          description: promoDescription.trim(),
          imageUrl: promoImageUrl || null,
          couponCode: promoCouponCode.trim(),
          buttonText: promoButtonText.trim(),
          actionType: promoActionType,
          actionUrl: promoActionUrl.trim(),
          featuredProductId: (promoFocalType === 'product' && promoIncludeProductCard) ? promoSelectedProductId : undefined,
          featuredProductName: (promoFocalType === 'product' && promoIncludeProductCard) ? promoFeaturedProductName : undefined,
          featuredProductPrice: (promoFocalType === 'product' && promoIncludeProductCard) ? promoFeaturedProductPrice : undefined,
          featuredProductImage: (promoFocalType === 'product' && promoIncludeProductCard) ? promoFeaturedProductImage : undefined,
          featuredCategory: promoFocalType === 'category' ? promoCategory : undefined,
        }),
      };

      const res = await authFetch('/api/store/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setFeedback({
          type: 'success',
          message: '¡Ajustes de tienda guardados con éxito en la base de datos!',
        });
        if (onSaved) onSaved();
      } else {
        const data = await res.json();
        setFeedback({
          type: 'error',
          message: data.error || 'Error al guardar la configuración de la tienda',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error de conexión con el servidor',
      });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar with Save Button & Status */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
              <Store className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Ajustes Generales de la Tienda Online</h3>
          </div>
          <p className="text-xs text-slate-500">
            Personaliza el catálogo, marca, medios de pago de Ecuador, logística de envío y temas visuales.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs shadow-md shadow-sky-500/20 transition cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50 flex-shrink-0 active:scale-95"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{saving ? 'Guardando...' : 'Guardar Ajustes de Tienda'}</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-bold flex items-center space-x-2 animate-fadeIn ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-rose-50 text-rose-900 border-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <X className="w-4 h-4 text-rose-600 flex-shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* 0. ESTADO DE LA TIENDA Y MODO MANTENIMIENTO */}
      <div className={`border rounded-2xl p-5 shadow-xs transition-all ${
        isActive
          ? 'bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-sky-50/50 border-emerald-200/90'
          : 'bg-gradient-to-r from-amber-50/80 via-rose-50/40 to-orange-50/60 border-amber-300 shadow-amber-500/5'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 mb-4 border-slate-200/80">
          <div className="flex items-start space-x-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold flex-shrink-0 ${
              isActive
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
            }`}>
              {isActive ? <Power className="w-5 h-5" /> : <PauseCircle className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-bold text-slate-900">Estado de la Tienda Online</h4>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold flex items-center space-x-1 ${
                  isActive
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse'
                }`}>
                  <span className={`w-2 h-2 rounded-full mr-1 ${isActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  {isActive ? 'TIENDA ACTIVA (PÚBLICA)' : 'TIENDA PAUSADA (MANTENIMIENTO)'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {isActive
                  ? 'Tu catálogo está abierto y los clientes pueden navegar productos y realizar pedidos directos por WhatsApp.'
                  : 'Tu tienda pública está pausada. Como administrador puedes seguir trabajando y gestionando inventario normalmente.'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 transition cursor-pointer active:scale-95 shadow-xs ${
                isActive
                  ? 'bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
              }`}
            >
              {isActive ? (
                <>
                  <PauseCircle className="w-4 h-4 text-rose-700" />
                  <span>Pausar Tienda / Modo Mantenimiento</span>
                </>
              ) : (
                <>
                  <Power className="w-4 h-4" />
                  <span>Reactivar y Publicar Tienda</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Maintenance Mode Options (visible when store is paused) */}
        {!isActive && (
          <div className="space-y-4 pt-1 animate-fadeIn">
            <div className="bg-amber-500/10 border border-amber-300/80 rounded-xl p-3.5 flex items-start space-x-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Modo Mantenimiento Activado:</strong> Configura cómo verán la tienda tus clientes mientras esté pausada. Puedes personalizar el mensaje de aviso o permitir que sigan explorando en modo catálogo sin comprar.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Título de la Pantalla de Mantenimiento
                </label>
                <input
                  type="text"
                  value={maintenanceTitle}
                  onChange={(e) => setMaintenanceTitle(e.target.value)}
                  placeholder="Ej. Tienda Temporalmente Pausada"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Modo de Visualización de Productos
                </label>
                <div className="flex items-center space-x-3 mt-1.5">
                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowCatalogBrowsing}
                      onChange={(e) => setAllowCatalogBrowsing(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4"
                    />
                    <span>Permitir navegación de catálogo (Solo Lectura, sin carrito/compras)</span>
                  </label>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {allowCatalogBrowsing
                    ? 'Los clientes podrán ver tus fotos y precios, pero los botones de compra indicarán que los pedidos están pausados.'
                    : 'Los clientes verán una pantalla elegante de mantenimiento con los datos de contacto y botón de WhatsApp.'}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mensaje Descriptivo para los Clientes
              </label>
              <textarea
                rows={2}
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                placeholder="Estamos actualizando nuestro catálogo e inventario. ¡Volveremos muy pronto!"
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setShowMaintenancePreview(!showMaintenancePreview)}
                className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-2xs"
              >
                <Eye className="w-3.5 h-3.5 text-amber-600" />
                <span>{showMaintenancePreview ? 'Ocultar Vista Previa' : 'Previsualizar Pantalla de Pausa'}</span>
              </button>

              <span className="text-[11px] text-slate-500 italic">
                Recuerda pulsar "Guardar Ajustes de Tienda" para aplicar los cambios.
              </span>
            </div>

            {/* In-place preview box */}
            {showMaintenancePreview && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-xl max-w-lg mx-auto text-white animate-fadeIn">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto">
                  <PauseCircle className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                    MODO MANTENIMIENTO
                  </span>
                  <h3 className="text-lg font-black text-white pt-2">{storeName}</h3>
                  <h4 className="text-sm font-bold text-amber-300">{maintenanceTitle || 'Tienda Temporalmente Pausada'}</h4>
                  <p className="text-xs text-slate-300 max-w-md mx-auto pt-1 leading-relaxed">
                    {maintenanceMessage || 'Estamos actualizando nuestro catálogo e inventario. ¡Volvemos muy pronto!'}
                  </p>
                </div>
                {whatsappNumber && (
                  <div className="pt-2">
                    <span className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs">
                      <MessageCircle className="w-4 h-4" />
                      <span>Contactar por WhatsApp ({whatsappNumber})</span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 1. INFORMACIÓN PRINCIPAL & LOGO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols: Form Fields */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
            <Store className="w-4 h-4 text-sky-600" />
            Datos Básicos del Comercio
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nombre de la Tienda *</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Ej. Mi Tienda Express"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp de Pedidos *</label>
              <input
                type="text"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="Ej. 0991234567 o +593991234567"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
              <p className="text-[10px] text-slate-500 mt-1">Recibirá los pedidos automáticos del carrito.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Slogan / Descripción del Catálogo</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Catálogo digital con envíos y pedidos directos"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Cinta de Anuncios / Promociones</label>
            <input
              type="text"
              value={bannerText}
              onChange={(e) => setBannerText(e.target.value)}
              placeholder="🔥 ¡Envíos gratis en compras mayores a $50!"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Costo de Envío Base ($)</label>
              <input
                type="number"
                step="0.50"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Pedido Mínimo ($)</label>
              <input
                type="number"
                step="1.00"
                value={minOrderAmount}
                onChange={(e) => setMinOrderAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Moneda</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Instagram (@usuario o URL)</label>
              <input
                type="text"
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                placeholder="https://instagram.com/tutienda"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Dirección / Ubicación Física</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Av. Principal y Secundaria, Local #4"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* Right 1 Col: Dual Logo Uploader (Móvil & PC) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Camera className="w-4 h-4 text-sky-600" />
                Logos de la Tienda (2 Formatos)
              </h4>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200/80">
                Móvil & PC
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Sube ambos formatos para que tu marca luzca profesional tanto en celulares como en computadoras.
            </p>

            {/* 1. Logo Cuadrado - Vista Celular */}
            <div className="mt-3.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-sky-600" />
                  <span className="text-xs font-bold text-slate-800">1. Logo Cuadrado (Móvil)</span>
                </div>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                  1:1 Celular
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Se muestra en la cabecera en celulares, tickets de envío y pedidos de WhatsApp.
              </p>

              <div className="flex items-center space-x-3 pt-1">
                <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center overflow-hidden p-1 flex-shrink-0">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo Móvil" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-center text-slate-300">
                      <Store className="w-6 h-6 mx-auto mb-0.5" />
                      <span className="text-[8px] font-bold block">1:1</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-1.5">
                  <label className="w-full py-1.5 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs active:scale-95">
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>{logoUrl ? 'Cambiar Cuadrado' : 'Subir Cuadrado'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            const b64 = await processLogoImageFile(file, 500);
                            setLogoUrl(b64);
                          } catch (err: any) {
                            alert(err.message || 'Error al procesar imagen');
                          }
                        }
                      }}
                    />
                  </label>

                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl(null)}
                      className="w-full py-1 px-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-semibold transition cursor-pointer flex items-center justify-center space-x-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Quitar</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Logo Rectangular - Vista PC */}
            <div className="mt-3.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Laptop className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-800">2. Logo Rectangular (PC)</span>
                </div>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
                  Horizontal PC
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Formato panorámico horizontal para monitores de computadora y laptops.
              </p>

              <div className="space-y-2 pt-1">
                <div className="w-full h-14 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center overflow-hidden p-1.5">
                  {logoDesktopUrl ? (
                    <img src={logoDesktopUrl} alt="Logo PC" className="w-full h-full object-contain" />
                  ) : (
                    <div className="flex items-center justify-center space-x-2 text-slate-300">
                      <Laptop className="w-4 h-4 text-slate-300" />
                      <span className="text-[10px] font-medium">Sin logo PC (Usa el móvil de respaldo)</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <label className="flex-1 py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs active:scale-95">
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>{logoDesktopUrl ? 'Cambiar Rectangular' : 'Subir Rectangular (PC)'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            const b64 = await processLogoImageFile(file, 800);
                            setLogoDesktopUrl(b64);
                          } catch (err: any) {
                            alert(err.message || 'Error al procesar imagen');
                          }
                        }
                      }}
                    />
                  </label>

                  {logoDesktopUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoDesktopUrl(null)}
                      className="py-1.5 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition cursor-pointer flex items-center justify-center space-x-1"
                      title="Quitar logo rectangular"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Quitar</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="hidden">
              <label className="flex items-start space-x-2.5 cursor-pointer text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={showStock}
                  onChange={(e) => setShowStock(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-sky-600 focus:ring-sky-500"
                />
                <div className="space-y-0.5">
                  <span>Mostrar cantidad de existencias / stock disponible</span>
                  <p className="text-[11px] font-normal text-slate-500">Muestra la etiqueta con el número exacto de unidades disponibles a los clientes.</p>
                </div>
              </label>
            </div>

            <div className="p-3 bg-amber-50/60 border border-amber-100/80 rounded-xl">
              <label className="flex items-start space-x-2.5 cursor-pointer text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  id="switch-show-out-of-stock"
                  checked={showOutOfStock}
                  onChange={(e) => setShowOutOfStock(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-amber-600 focus:ring-amber-500"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-1.5">
                    <span>Mostrar productos agotados en la tienda</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${showOutOfStock ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {showOutOfStock ? 'Visibles' : 'Ocultos'}
                    </span>
                  </div>
                  <p className="text-[11px] font-normal text-slate-500">
                    {showOutOfStock
                      ? 'Los productos con stock en 0 se mostrarán marcados con la etiqueta "Agotado".'
                      : 'Los productos con stock en 0 se ocultarán automáticamente del catálogo para los clientes.'}
                  </p>
                </div>
              </label>
            </div>

            {/* Paginación de Productos en el Catálogo */}
            <div className="p-3 bg-sky-50/60 border border-sky-100/80 rounded-xl space-y-2.5">
              <label className="flex items-start space-x-2.5 cursor-pointer text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  id="switch-enable-pagination"
                  checked={enablePagination}
                  onChange={(e) => setEnablePagination(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-sky-600 focus:ring-sky-500"
                />
                <div className="space-y-0.5 flex-1">
                  <div className="flex items-center space-x-1.5 justify-between">
                    <span>Activar paginación de productos en el catálogo</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${enablePagination ? 'bg-sky-100 text-sky-800 border border-sky-200' : 'bg-slate-200 text-slate-600'}`}>
                      {enablePagination ? 'Paginación Activada' : 'Lista Continua'}
                    </span>
                  </div>
                  <p className="text-[11px] font-normal text-slate-500">
                    {enablePagination
                      ? 'El catálogo se dividirá en páginas ordenadas con navegación ("Anterior" / "Siguiente").'
                      : 'Todos los productos se mostrarán en una sola lista continua.'}
                  </p>
                </div>
              </label>

              {enablePagination && (
                <div className="pt-2 border-t border-sky-100/80 flex items-center justify-between">
                  <label htmlFor="items-per-page-select" className="text-[11px] font-bold text-slate-700">
                    Productos a mostrar por página:
                  </label>
                  <select
                    id="items-per-page-select"
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1 font-bold text-slate-800 focus:outline-none focus:border-sky-500 cursor-pointer"
                  >
                    <option value={6}>6 productos por página</option>
                    <option value={12}>12 productos por página</option>
                    <option value={20}>20 productos por página</option>
                    <option value={24}>24 productos por página</option>
                    <option value={36}>36 productos por página</option>
                    <option value={48}>48 productos por página</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. MÉTODOS DE PAGO Y LOGÍSTICA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Métodos de Pago */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Landmark className="w-4 h-4 text-emerald-600" />
              Formas y Métodos de Pago Aceptados
            </h4>
            <span className="text-[10px] text-slate-500 font-bold">
              {payments.filter((p) => p.active !== false).length} Activos
            </span>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {payments.map((pm, idx) => (
              <div
                key={pm.id || idx}
                className={`p-3.5 rounded-xl border flex flex-col gap-2.5 transition ${
                  pm.active !== false
                    ? 'bg-slate-50/80 border-slate-200 shadow-2xs'
                    : 'bg-slate-100/60 border-slate-200/60 opacity-65'
                }`}
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                    {/* Logo con botón para cambiar imagen */}
                    <div className="relative group shrink-0">
                      <div className="w-11 h-11 rounded-xl bg-white border border-slate-300 shadow-2xs flex items-center justify-center overflow-hidden p-1">
                        {pm.logoUrl ? (
                          <img src={pm.logoUrl} alt={pm.name} className="w-full h-full object-contain" />
                        ) : (
                          <Landmark className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <label
                        className="absolute inset-0 bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer text-white"
                        title="Cambiar logo del método de pago"
                      >
                        <Camera className="w-4 h-4" />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              try {
                                const b64 = await processLogoImageFile(f, 300);
                                setPayments((prev) =>
                                  prev.map((p, i) => (i === idx ? { ...p, logoUrl: b64 } : p))
                                );
                              } catch (err: any) {
                                alert(err.message || 'Error al procesar imagen');
                              }
                            }
                          }}
                        />
                      </label>
                    </div>

                    {/* Nombre del método editable */}
                    <div className="flex-1 min-w-0">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                        Nombre del Método / Banco:
                      </label>
                      <input
                        type="text"
                        value={pm.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPayments((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, name: val } : p))
                          );
                        }}
                        placeholder="Ej. Banco Pichincha, Zelle, Deuna..."
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <label className="flex items-center space-x-1.5 text-[11px] cursor-pointer select-none bg-white px-2 py-1 rounded-lg border border-slate-200">
                      <input
                        type="checkbox"
                        checked={pm.active !== false}
                        onChange={() => handleTogglePayment(pm.id)}
                        className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span className={`text-[11px] font-bold ${pm.active !== false ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {pm.active !== false ? 'Activo' : 'Oculto'}
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={() => handleRemovePayment(pm.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      title="Eliminar método"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Detalles / Datos de cuenta editables */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                    Datos de Cuenta / Instrucciones para el Cliente:
                  </label>
                  <input
                    type="text"
                    value={pm.details || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPayments((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, details: val } : p))
                      );
                    }}
                    placeholder="Ej. Cta. Ahorros #2200123456 | Titular: Mi Comercio | CI: 1712345678"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Add custom payment method */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-emerald-200/80 space-y-2.5">
            <span className="text-[11px] font-bold text-emerald-900 block flex items-center gap-1">
              <Plus className="w-3 h-3 text-emerald-600" />
              Agregar Nuevo Método de Pago:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={newPaymentName}
                onChange={(e) => setNewPaymentName(e.target.value)}
                placeholder="Nombre (ej. Banco Bolivariano)"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                value={newPaymentDetails}
                onChange={(e) => setNewPaymentDetails(e.target.value)}
                placeholder="Datos de cuenta o instrucción"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center space-x-2">
                {newPaymentLogo && (
                  <div className="w-7 h-7 rounded-lg bg-white border border-slate-300 overflow-hidden p-0.5 flex items-center justify-center">
                    <img src={newPaymentLogo} alt="Logo" className="w-full h-full object-contain" />
                  </div>
                )}
                <label className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs">
                  <UploadCloud className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{newPaymentLogo ? 'Cambiar Logo' : 'Subir Logo PNG/JPG'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        try {
                          const b64 = await processLogoImageFile(f, 300);
                          setNewPaymentLogo(b64);
                        } catch (err: any) {
                          alert(err.message || 'Error al procesar imagen');
                        }
                      }
                    }}
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={handleAddCustomPayment}
                disabled={!newPaymentName.trim()}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1 cursor-pointer transition shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar</span>
              </button>
            </div>
          </div>
        </div>

        {/* Empresas de Transporte / Courier */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Truck className="w-4 h-4 text-sky-600" />
              Empresas de Envíos y Logística
            </h4>
            <span className="text-[10px] text-slate-500 font-bold">
              {couriers.filter((c) => c.active !== false).length} Activos
            </span>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {couriers.map((courier, idx) => (
              <div
                key={courier.id || idx}
                className={`p-3.5 rounded-xl border flex flex-col gap-2.5 transition ${
                  courier.active !== false
                    ? 'bg-slate-50/80 border-slate-200 shadow-2xs'
                    : 'bg-slate-100/60 border-slate-200/60 opacity-65'
                }`}
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                    {/* Logo con botón para cambiar imagen */}
                    <div className="relative group shrink-0">
                      <div className="w-11 h-11 rounded-xl bg-white border border-slate-300 shadow-2xs flex items-center justify-center overflow-hidden p-1">
                        {courier.logoUrl ? (
                          <img src={courier.logoUrl} alt={courier.name} className="w-full h-full object-contain" />
                        ) : (
                          <Truck className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <label
                        className="absolute inset-0 bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer text-white"
                        title="Cambiar logo del courier"
                      >
                        <Camera className="w-4 h-4" />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              try {
                                const b64 = await processLogoImageFile(f, 300);
                                setCouriers((prev) =>
                                  prev.map((c, i) => (i === idx ? { ...c, logoUrl: b64 } : c))
                                );
                              } catch (err: any) {
                                alert(err.message || 'Error al procesar imagen');
                              }
                            }
                          }}
                        />
                      </label>
                    </div>

                    {/* Nombre editable del courier */}
                    <div className="flex-1 min-w-0">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                        Nombre de la Empresa de Envío:
                      </label>
                      <input
                        type="text"
                        value={courier.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCouriers((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, name: val } : c))
                          );
                        }}
                        placeholder="Ej. Servientrega, LaarCourier, Motorizado..."
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <label className="flex items-center space-x-1.5 text-[11px] cursor-pointer select-none bg-white px-2 py-1 rounded-lg border border-slate-200">
                      <input
                        type="checkbox"
                        checked={courier.active !== false}
                        onChange={() => handleToggleCourier(courier.id)}
                        className="w-3.5 h-3.5 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                      />
                      <span className={`text-[11px] font-bold ${courier.active !== false ? 'text-sky-700' : 'text-slate-400'}`}>
                        {courier.active !== false ? 'Activo' : 'Oculto'}
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={() => handleRemoveCourier(courier.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      title="Eliminar courier"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* URL de Cotizador Online Editable */}
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="block text-[10px] font-bold text-slate-600">
                      🔗 URL / Enlace del Cotizador o Tarifario Web (Para calcular envíos):
                    </label>
                    {courier.quoteUrl?.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          const url = courier.quoteUrl?.trim() || '';
                          const target = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
                          window.open(target, '_blank');
                        }}
                        className="text-[10px] font-bold text-sky-600 hover:text-sky-800 flex items-center gap-1 hover:underline cursor-pointer"
                        title="Probar abrir cotizador en nueva pestaña"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Probar enlace</span>
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="url"
                      value={courier.quoteUrl || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCouriers((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, quoteUrl: val } : c))
                        );
                      }}
                      placeholder="Ej. https://www.servientrega.com.ec/ o portal de cotizaciones"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add custom courier */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-sky-200/80 space-y-2.5">
            <span className="text-[11px] font-bold text-sky-900 block flex items-center gap-1">
              <Plus className="w-3 h-3 text-sky-600" />
              Agregar Empresa de Envío / Courier:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={newCourierName}
                onChange={(e) => setNewCourierName(e.target.value)}
                placeholder="Nombre (ej. Envíos Panamericana)"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-sky-500"
              />
              <input
                type="url"
                value={newCourierQuoteUrl}
                onChange={(e) => setNewCourierQuoteUrl(e.target.value)}
                placeholder="URL de cotizador web (Opcional)"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center space-x-2">
                {newCourierLogo && (
                  <div className="w-7 h-7 rounded-lg bg-white border border-slate-300 overflow-hidden p-0.5 flex items-center justify-center">
                    <img src={newCourierLogo} alt="Logo" className="w-full h-full object-contain" />
                  </div>
                )}
                <label className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs">
                  <UploadCloud className="w-3.5 h-3.5 text-sky-600" />
                  <span>{newCourierLogo ? 'Cambiar Logo' : 'Subir Logo PNG/JPG'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        try {
                          const b64 = await processLogoImageFile(f, 300);
                          setNewCourierLogo(b64);
                        } catch (err: any) {
                          alert(err.message || 'Error al procesar imagen');
                        }
                      }
                    }}
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={handleAddCustomCourier}
                disabled={!newCourierName.trim()}
                className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1 cursor-pointer transition shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. CARTEL PUBLICITARIO Y VENTANA EMERGENTE DE OFERTAS (POPUP IA) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-6 shadow-xs">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-start space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 via-rose-500 to-indigo-600 text-white flex items-center justify-center shadow-xs flex-shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Estudio de Campañas y Afiches Publicitarios con IA
                </h4>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                  Gemini & Web HD
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Genera afiches comerciales relevantes para tus productos, campañas de temporada y ventanas emergentes que aumentan conversiones por WhatsApp.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <label className="flex items-center space-x-2.5 cursor-pointer select-none bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-300 transition">
              <input
                type="checkbox"
                checked={promoActive}
                onChange={(e) => setPromoActive(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <span className={`text-xs font-bold ${promoActive ? 'text-amber-800' : 'text-slate-500'}`}>
                {promoActive ? 'Cartel Activo en Tienda' : 'Cartel Desactivado'}
              </span>
            </label>

            <button
              type="button"
              onClick={() => setShowPromoTestModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 shadow-2xs active:scale-95"
              title="Probar cómo ve el cliente la ventana emergente"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Probar Popup en Vivo</span>
            </button>
          </div>
        </div>

        {/* Panel Principal del Generador Inteligente */}
        <div className="p-5 bg-gradient-to-br from-amber-50/80 via-rose-50/50 to-indigo-50/60 rounded-2xl border border-amber-200/90 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/60 pb-3">
            <div className="flex items-center space-x-2">
              <Wand2 className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-black text-slate-900 uppercase tracking-wide">
                Configuración Contextual del Afiche Comercial
              </span>
            </div>
            <span className="text-[11px] font-semibold text-slate-600">
              Imágenes nítidas de estudio sin textos deformes ni fondos incoherentes
            </span>
          </div>

          {/* PASO 1: FOCO DE LA CAMPAÑA */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              1. ¿Qué deseas promocionar hoy? (Foco de la Campaña):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setPromoFocalType('store');
                  setPromoSelectedProductId('');
                  setPromoCategory('');
                }}
                className={`p-3 rounded-xl text-left border transition flex items-center space-x-3 cursor-pointer ${
                  promoFocalType === 'store'
                    ? 'bg-amber-100/90 border-amber-400 text-amber-950 ring-2 ring-amber-400/40 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-800 flex items-center justify-center flex-shrink-0">
                  <Store className="w-4 h-4" />
                </div>
                <div className="overflow-hidden">
                  <span className="text-xs font-bold block">Toda la Tienda</span>
                  <span className="text-[10px] text-slate-500 block truncate">Catálogo general, ofertas del mes</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPromoFocalType('category')}
                className={`p-3 rounded-xl text-left border transition flex items-center space-x-3 cursor-pointer ${
                  promoFocalType === 'category'
                    ? 'bg-amber-100/90 border-amber-400 text-amber-950 ring-2 ring-amber-400/40 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-800 flex items-center justify-center flex-shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="overflow-hidden">
                  <span className="text-xs font-bold block">Por Categoría</span>
                  <span className="text-[10px] text-slate-500 block truncate">Tecnología, Calzado, Moda, etc.</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPromoFocalType('product')}
                className={`p-3 rounded-xl text-left border transition flex items-center space-x-3 cursor-pointer ${
                  promoFocalType === 'product'
                    ? 'bg-amber-100/90 border-amber-400 text-amber-950 ring-2 ring-amber-400/40 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-800 flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4" />
                </div>
                <div className="overflow-hidden">
                  <span className="text-xs font-bold block">Producto Estrella</span>
                  <span className="text-[10px] text-slate-500 block truncate">Con foto, precio y venta directa</span>
                </div>
              </button>
            </div>

            {/* Sub-selector si es Categoría */}
            {promoFocalType === 'category' && (
              <div className="p-3 bg-white/90 rounded-xl border border-indigo-200 space-y-2 mt-2">
                <label className="block text-[11px] font-bold text-indigo-900">
                  Selecciona o escribe la categoría comercial a promocionar:
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {['Tecnología & Gadgets', 'Calzado Deportivo', 'Moda & Ropa', 'Belleza & Cuidado Personal', 'Hogar & Confort'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setPromoCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                        promoCategory === cat
                          ? 'bg-indigo-600 text-white border-indigo-700'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={promoCategory}
                  onChange={(e) => setPromoCategory(e.target.value)}
                  placeholder="O escribe una categoría personalizada..."
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {/* Sub-selector si es Producto Estrella */}
            {promoFocalType === 'product' && (
              <div className="p-3.5 bg-white/95 rounded-xl border border-rose-200 space-y-3 mt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="block text-[11px] font-bold text-rose-950">
                    Elige el producto estrella de tu inventario:
                  </label>
                  <span className="text-[10px] text-slate-500">
                    {storeProducts.length} productos en catálogo
                  </span>
                </div>

                <select
                  value={promoSelectedProductId}
                  onChange={(e) => handleSelectProduct(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold focus:outline-none focus:border-rose-500 cursor-pointer"
                >
                  <option value="">-- Seleccionar un producto de la tienda --</option>
                  {storeProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.category ? `(${p.category})` : ''} - {currency} {p.salePrice || '0.00'}
                    </option>
                  ))}
                </select>

                {/* Tarjeta de Resumen del Producto Seleccionado */}
                {selectedProduct && (
                  <div className="p-3 bg-gradient-to-r from-rose-50 to-amber-50 rounded-xl border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {promoFeaturedProductImage ? (
                          <img
                            src={promoFeaturedProductImage}
                            alt={promoFeaturedProductName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="w-6 h-6 text-slate-400" />
                        )}
                      </div>
                      <div>
                        <span className="text-xs font-black text-slate-900 block line-clamp-1">
                          {promoFeaturedProductName}
                        </span>
                        <div className="flex items-center space-x-2 text-[11px] mt-0.5">
                          <span className="font-bold text-rose-600">
                            {currency} {promoFeaturedProductPrice}
                          </span>
                          {promoCategory && (
                            <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded-md font-semibold text-[10px]">
                              {promoCategory}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <label className="flex items-center space-x-2 cursor-pointer select-none bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                      <input
                        type="checkbox"
                        checked={promoIncludeProductCard}
                        onChange={(e) => setPromoIncludeProductCard(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                      <span className="text-[11px] font-bold text-slate-700">
                        Mostrar tarjeta de compra en el popup
                      </span>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PASO 2: ESTILO VISUAL DE LA ESCENA */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">
              2. Estilo Visual de la Escena Comercial:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {[
                { id: 'commercial_studio', icon: '🏛️', name: 'Estudio Packshot 3D', desc: 'Podio flotante y focos nítidos' },
                { id: 'luxury_gold', icon: '💎', name: 'Lujo & Obsidiana', desc: 'Fondo oscuro con destellos oro' },
                { id: 'high_impact', icon: '⚡', name: 'Retail & Súper Oferta', desc: 'Contrastes dinámicos de impacto' },
                { id: 'minimal_clean', icon: '🍃', name: 'Minimalista Nórdico', desc: 'Luz natural y ambiente zen' },
                { id: 'lifestyle_urban', icon: '🏙️', name: 'Urbano & Moderno', desc: 'Cosmopolita y contemporáneo' },
              ].map((st) => {
                const isSelected = promoPosterStyle === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setPromoPosterStyle(st.id)}
                    className={`p-2.5 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-amber-100 border-amber-500 text-amber-950 ring-2 ring-amber-400/40 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <span className="text-base">{st.icon}</span>
                      <span className="text-[11px] font-bold block mt-1 leading-tight">{st.name}</span>
                    </div>
                    <span className="text-[9px] text-slate-500 mt-1 block">{st.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PASO 3: TEMPORADA U OCASIÓN */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">
              3. Temporada o Campaña Comercial:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {[
                { id: 'christmas', label: 'Navidad / Reyes', icon: '🎄', color: 'border-red-300 bg-red-50 text-red-900' },
                { id: 'black_friday', label: 'Black Friday', icon: '🖤', color: 'border-zinc-400 bg-zinc-100 text-zinc-900' },
                { id: 'super_deals', label: 'Súper Ofertas', icon: '🔥', color: 'border-amber-300 bg-amber-50 text-amber-900' },
                { id: 'new_year', label: 'Año Nuevo', icon: '🎆', color: 'border-indigo-300 bg-indigo-50 text-indigo-900' },
                { id: 'clearance', label: 'Liquidación Total', icon: '⚡', color: 'border-rose-300 bg-rose-50 text-rose-900' },
                { id: 'custom', label: 'Personalizado', icon: '⭐', color: 'border-sky-300 bg-sky-50 text-sky-900' },
              ].map((p) => {
                const isSelected = promoTheme === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleApplyPromoPreset(p.id)}
                    className={`px-2.5 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer border ${
                      isSelected
                        ? 'ring-2 ring-amber-500 shadow-xs ' + p.color
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{p.icon}</span>
                    <span className="truncate">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PASO 4: GANCHO COMERCIAL & DETALLES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                4. Descuento o Gancho Comercial:
              </label>
              <input
                type="text"
                value={promoDiscountInput}
                onChange={(e) => setPromoDiscountInput(e.target.value)}
                placeholder="Ej. 30% OFF, Envío Gratis en todo el país, 2x1..."
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:outline-none focus:border-amber-500 shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                5. Instrucción visual adicional (Opcional):
              </label>
              <input
                type="text"
                value={promoCustomPromptInput}
                onChange={(e) => setPromoCustomPromptInput(e.target.value)}
                placeholder="Ej. podio de piedra blanca, luces doradas sutiles..."
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500 shadow-2xs"
              />
            </div>
          </div>

          {/* BARRA DE ACCIÓN: GENERAR CON IA + BUSCAR EN WEB + CURADOS */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-amber-200/60">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const q = promoFeaturedProductName || promoCategory || `${storeName} comercial banner`;
                  setWebSearchQuery(q);
                  setShowWebSearchModal(true);
                  handleSearchWebPromos(q);
                }}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-2xs active:scale-95"
              >
                <Search className="w-3.5 h-3.5 text-sky-600" />
                <span>Buscar Afiches en la Web</span>
              </button>

              <button
                type="button"
                onClick={handleFetchCuratedPresets}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-2xs active:scale-95"
              >
                <Grid className="w-3.5 h-3.5 text-amber-600" />
                <span>Galería de Estudio Curada</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleGeneratePromoWithAI}
              disabled={isGeneratingPromoAi}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 hover:from-amber-400 hover:via-rose-400 hover:to-indigo-500 text-white text-xs font-black transition cursor-pointer shadow-md shadow-rose-500/20 flex items-center space-x-2 disabled:opacity-50 active:scale-95"
            >
              {isGeneratingPromoAi ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generando Afiche & Textos con IA...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>✨ Generar Afiche Completo e Imagen con IA</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* GALERÍA DE OPCIONES / CANDIDATOS GENERADOS */}
        {promoCandidateImages.length > 0 && (
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ImageIcon className="w-4 h-4 text-sky-600" />
                <span className="text-xs font-bold text-slate-900">
                  Opciones y Candidatos Encontrados (Haz clic en cualquiera para aplicarlo de inmediato):
                </span>
              </div>
              <span className="text-[10px] text-slate-500">
                {promoCandidateImages.length} alternativas
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {promoCandidateImages.map((c, idx) => {
                const isCurrent = promoImageUrl === c.url;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPromoImageUrl(c.url)}
                    className={`relative rounded-xl overflow-hidden border aspect-[16/10] group text-left cursor-pointer transition ${
                      isCurrent
                        ? 'ring-3 ring-amber-500 border-amber-500 shadow-md'
                        : 'border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <img
                      src={c.url}
                      alt={c.title}
                      className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                      <span className="text-[9px] text-white font-medium block truncate">
                        {c.title}
                      </span>
                    </div>
                    <div className="absolute top-1 left-1">
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-black/70 text-amber-300">
                        {c.source}
                      </span>
                    </div>
                    {isCurrent && (
                      <div className="absolute top-1 right-1 bg-amber-500 text-slate-950 p-0.5 rounded-full shadow-xs">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Vista Previa Visual del Cartel y Campos Editables */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
          {/* Left Column: Visual Poster Card & Image Uploader */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">
                Afiche / Imagen Seleccionada:
              </label>
              {promoFeaturedProductName && (
                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 truncate max-w-[200px]">
                  ⭐ {promoFeaturedProductName}
                </span>
              )}
            </div>

            <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 shadow-sm aspect-video sm:aspect-[16/10] flex items-center justify-center group">
              {promoImageUrl ? (
                <img
                  src={promoImageUrl}
                  alt="Afiche Promocional"
                  className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="text-center p-4 text-slate-400">
                  <ImageIcon className="w-10 h-10 mx-auto text-slate-500 mb-2" />
                  <span className="text-xs font-bold">Sin imagen asignada</span>
                </div>
              )}

              {/* Badges preview overlay */}
              <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1.5">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 shadow-md">
                  {promoBadge || 'OFERTA'}
                </span>
                {promoCouponCode && (
                  <span className="px-2 py-1 rounded-full text-[10px] font-mono font-black bg-black/80 text-amber-300 border border-amber-400/40 shadow-md">
                    {promoCouponCode}
                  </span>
                )}
              </div>

              {/* Title preview overlay */}
              <div className="absolute inset-x-0 bottom-0 p-3.5 bg-gradient-to-t from-black/95 via-black/60 to-transparent">
                <span className="text-[10px] font-bold text-amber-300 block uppercase tracking-wider">
                  {storeName}
                </span>
                <h5 className="text-xs sm:text-sm font-black text-white line-clamp-1">
                  {promoTitle}
                </h5>
                <p className="text-[10px] text-slate-300 line-clamp-1 mt-0.5">
                  {promoDescription}
                </p>
              </div>
            </div>

            {/* Image Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <label className="py-2 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-2xs active:scale-95 text-center">
                <UploadCloud className="w-3.5 h-3.5 text-sky-600" />
                <span className="truncate">Subir Foto (PNG/JPG)</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      try {
                        const b64 = await processLogoImageFile(f, 1000);
                        setPromoImageUrl(b64);
                      } catch (err: any) {
                        alert(err.message || 'Error al procesar imagen');
                      }
                    }
                  }}
                />
              </label>

              <button
                type="button"
                onClick={handleGeneratePromoWithAI}
                disabled={isGeneratingPromoAi}
                className="py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-2xs active:scale-95 text-center"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span className="truncate">Re-generar con IA</span>
              </button>
            </div>
          </div>

          {/* Right Column: Detailed Editable Form Fields */}
          <div className="lg:col-span-7 space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Etiqueta / Insignia Superior:
                </label>
                <input
                  type="text"
                  value={promoBadge}
                  onChange={(e) => setPromoBadge(e.target.value)}
                  placeholder="Ej. 🎄 OFERTA NAVIDEÑA"
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold focus:outline-none focus:border-sky-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Código de Cupón (Opcional):
                </label>
                <input
                  type="text"
                  value={promoCouponCode}
                  onChange={(e) => setPromoCouponCode(e.target.value.toUpperCase())}
                  placeholder="Ej. NAVIDAD2026"
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold focus:outline-none focus:border-sky-500 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Título Principal del Cartel:
              </label>
              <input
                type="text"
                value={promoTitle}
                onChange={(e) => setPromoTitle(e.target.value)}
                placeholder="Ej. ¡Gran Venta Especial de Navidad!"
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Descripción / Texto Persuasivo:
              </label>
              <textarea
                rows={2}
                value={promoDescription}
                onChange={(e) => setPromoDescription(e.target.value)}
                placeholder="Aprovecha hasta un 30% de descuento en regalos seleccionados..."
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Acción al Hacer Clic en el Botón:
                </label>
                <select
                  value={promoActionType}
                  onChange={(e) => setPromoActionType(e.target.value as any)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold focus:outline-none focus:border-sky-500 focus:bg-white cursor-pointer"
                >
                  <option value="whatsapp">Enviar Mensaje Directo a WhatsApp</option>
                  <option value="catalog">Filtrar Productos con Descuento en Catálogo</option>
                  <option value="url">Abrir Enlace Externo Personalizado</option>
                  {promoFocalType === 'product' && promoSelectedProductId && (
                    <option value="product">Abrir Detalle del Producto en Tienda</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Texto del Botón Principal:
                </label>
                <input
                  type="text"
                  value={promoButtonText}
                  onChange={(e) => setPromoButtonText(e.target.value)}
                  placeholder="Ej. ¡Pedir con Descuento por WhatsApp!"
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold focus:outline-none focus:border-sky-500 focus:bg-white"
                />
              </div>
            </div>

            {promoActionType === 'url' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Enlace URL de Destino:
                </label>
                <input
                  type="url"
                  value={promoActionUrl}
                  onChange={(e) => setPromoActionUrl(e.target.value)}
                  placeholder="https://tutienda.com/ofertas"
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: BÚSQUEDA DE AFICHES EN LA WEB */}
      {showWebSearchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <Search className="w-5 h-5 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Buscador de Afiches y Banners Comerciales HD en la Web
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWebSearchModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input Bar */}
            <div className="p-4 border-b border-slate-100 space-y-2.5">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={webSearchQuery}
                  onChange={(e) => setWebSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchWebPromos()}
                  placeholder="Ej. smartwatch amoled banner, zapatillas running commercial, tecnologia oferta..."
                  className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => handleSearchWebPromos()}
                  disabled={isSearchingWeb}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  {isSearchingWeb ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span>Buscar</span>
                </button>
              </div>

              {/* Quick Suggestion Chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500">Sugerencias:</span>
                {[
                  'Smartwatch y Accesorios',
                  'Zapatillas y Deportes',
                  'Moda & Ropa Urbana',
                  'Perfumes y Belleza',
                  'Black Friday Ofertas',
                  'Navidad Promociones',
                  'Liquidación Mega Descuentos',
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setWebSearchQuery(chip);
                      handleSearchWebPromos(chip);
                    }}
                    className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold transition cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Results Grid */}
            <div className="p-4 overflow-y-auto flex-1">
              {isSearchingWeb ? (
                <div className="py-12 text-center text-slate-500 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-600" />
                  <p className="text-xs font-semibold">Buscando afiches comerciales en alta definición...</p>
                </div>
              ) : webSearchResults.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {webSearchResults.map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setPromoImageUrl(img.url);
                        setShowWebSearchModal(false);
                      }}
                      className="group relative rounded-xl overflow-hidden border border-slate-200 aspect-[16/10] text-left cursor-pointer hover:border-sky-500 hover:shadow-md transition"
                    >
                      <img
                        src={img.url}
                        alt={img.title}
                        className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                        <span className="text-[10px] text-white font-medium block truncate">
                          {img.title}
                        </span>
                      </div>
                      <div className="absolute top-1 left-1">
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-black/70 text-sky-300">
                          {img.tag}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 space-y-1">
                  <ImageIcon className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs">Ingresa un término o pulsa una sugerencia para buscar afiches comerciales</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowWebSearchModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GALERÍA DE ESTUDIO CURADA */}
      {showCuratedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <Grid className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Galería Curada de Afiches Comerciales de Estudio
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCuratedModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category Filter Tabs */}
            <div className="p-3 border-b border-slate-100 flex flex-wrap gap-1.5 bg-slate-50/50">
              {[
                { id: 'tecnologia', label: 'Tecnología' },
                { id: 'calzado', label: 'Calzado' },
                { id: 'moda', label: 'Moda' },
                { id: 'belleza', label: 'Belleza' },
                { id: 'ofertas', label: 'Mega Ofertas' },
                { id: 'black_friday', label: 'Black Friday' },
                { id: 'navidad', label: 'Navidad' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedCuratedCategory(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    selectedCuratedCategory === tab.id
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Presets Grid */}
            <div className="p-4 overflow-y-auto flex-1">
              {isLoadingCurated ? (
                <div className="py-12 text-center text-slate-500 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-600" />
                  <p className="text-xs font-semibold">Cargando catálogo curado...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {(curatedPresets[selectedCuratedCategory] || []).map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setPromoImageUrl(p.url);
                        setShowCuratedModal(false);
                      }}
                      className="group relative rounded-xl overflow-hidden border border-slate-200 aspect-[16/10] text-left cursor-pointer hover:border-amber-500 hover:shadow-md transition"
                    >
                      <img
                        src={p.url}
                        alt={p.title}
                        className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                        <span className="text-[10px] text-white font-medium block truncate">
                          {p.title}
                        </span>
                      </div>
                      <div className="absolute top-1 left-1">
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-black/70 text-amber-300">
                          {p.tag}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowCuratedModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de prueba del Popup Promocional */}
      {showPromoTestModal && (
        <StorePromoModal
          forceOpen={true}
          storeName={storeName}
          whatsappNumber={whatsappNumber}
          currency={currency}
          config={{
            active: true,
            theme: promoTheme as any,
            badge: promoBadge,
            title: promoTitle,
            description: promoDescription,
            imageUrl: promoImageUrl,
            couponCode: promoCouponCode,
            buttonText: promoButtonText,
            actionType: promoActionType,
            actionUrl: promoActionUrl,
            featuredProductId: (promoFocalType === 'product' && promoIncludeProductCard) ? promoSelectedProductId : undefined,
            featuredProductName: (promoFocalType === 'product' && promoIncludeProductCard) ? promoFeaturedProductName : undefined,
            featuredProductPrice: (promoFocalType === 'product' && promoIncludeProductCard) ? promoFeaturedProductPrice : undefined,
            featuredProductImage: (promoFocalType === 'product' && promoIncludeProductCard) ? promoFeaturedProductImage : undefined,
            featuredCategory: promoFocalType === 'category' ? promoCategory : undefined,
          }}
          onClose={() => setShowPromoTestModal(false)}
        />
      )}
    </div>
  );
};

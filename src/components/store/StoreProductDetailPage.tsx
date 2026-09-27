import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Share2,
  MessageCircle,
  Copy,
  ShoppingCart,
  Check,
  Flame,
  Tag,
  Package,
  Play,
  Image as ImageIcon,
  ImageOff,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Truck,
  CreditCard,
  Store,
  Plus,
  Minus,
  Sparkles,
  MapPin,
} from 'lucide-react';
import { InventoryItem, StoreConfig, CartItem, CourierPartner, PaymentMethodPartner } from '../../types.ts';
import { parseVideoUrl } from '../../utils/video-helper.ts';
import { normalizeEcuadorPhone, buildWhatsAppLink } from '../../utils/phone.ts';
import { getProductPhotosWithFallback, normalizeMediaUrl } from '../../utils/media-helper.ts';

interface StoreProductDetailPageProps {
  product: InventoryItem;
  allProducts: InventoryItem[];
  storeConfig: StoreConfig;
  currency: string;
  isCustomerView: boolean;
  cart: CartItem[];
  cartTotalItems: number;
  onAddToCart: (item: InventoryItem, qty?: number) => void;
  onUpdateCartQty?: (itemId: number, newQty: number) => void;
  onDirectBuyProduct: (item: InventoryItem, e?: React.MouseEvent, qty?: number) => void;
  onShareProductWhatsApp: (item: InventoryItem, e?: React.MouseEvent) => void;
  onCopyProductLink: (item: InventoryItem, e?: React.MouseEvent) => void;
  onBack: () => void;
  onSelectProduct: (item: InventoryItem) => void;
  onOpenCart?: () => void;
  courierPartners?: CourierPartner[];
  paymentPartners?: PaymentMethodPartner[];
}

export const StoreProductDetailPage: React.FC<StoreProductDetailPageProps> = ({
  product,
  allProducts,
  storeConfig,
  currency,
  isCustomerView,
  cart,
  cartTotalItems,
  onAddToCart,
  onUpdateCartQty,
  onDirectBuyProduct,
  onShareProductWhatsApp,
  onCopyProductLink,
  onBack,
  onSelectProduct,
  onOpenCart,
  courierPartners,
  paymentPartners,
}) => {
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [activeMediaMode, setActiveMediaMode] = useState<'photo' | 'video'>('photo');
  const [quantity, setQuantity] = useState(1);
  const [addedAnimation, setAddedAnimation] = useState(false);

  // Container ref to force scroll to top on product change
  const containerRef = React.useRef<HTMLDivElement>(null);
  const prevProductIdRef = React.useRef<number | string>(product.id);

  // Extract all photos
  const photos: string[] = React.useMemo(() => {
    return getProductPhotosWithFallback(product);
  }, [product.imageUrl, product.images, product.extractedAttributes]);

  // Payment logos extraction for VIP price card (Render ONLY logos, very small)
  const activePaymentLogos = React.useMemo(() => {
    let list: PaymentMethodPartner[] = [];
    if (Array.isArray(paymentPartners) && paymentPartners.length > 0) {
      list = paymentPartners;
    } else if (storeConfig.paymentLogos) {
      try {
        const parsed = typeof storeConfig.paymentLogos === 'string' ? JSON.parse(storeConfig.paymentLogos) : storeConfig.paymentLogos;
        if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
      } catch {}
    }
    const filtered = list.filter((p) => p.active !== false && p.logoUrl);
    if (filtered.length > 0) return filtered;

    // Fallback default payment partners with logos
    return [
      { id: 'pichincha', name: 'Banco Pichincha / Mi Vecino', logoUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=160&auto=format&fit=crop&q=80', active: true },
      { id: 'guayaquil', name: 'Banco Guayaquil / Banco del Barrio', logoUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=160&auto=format&fit=crop&q=80', active: true },
      { id: 'deuna', name: 'Deuna / QR', logoUrl: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=160&auto=format&fit=crop&q=80', active: true },
      { id: 'tarjetas', name: 'Tarjetas Débito / Crédito', logoUrl: 'https://images.unsplash.com/photo-1556742049-0a67c557689c?w=160&auto=format&fit=crop&q=80', active: true },
      { id: 'efectivo', name: 'Efectivo / Contraentrega', logoUrl: 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=160&auto=format&fit=crop&q=80', active: true },
    ];
  }, [paymentPartners, storeConfig.paymentLogos]);

  // Reset indices and scroll to top ONLY when the product ID changes (navigating to another product)
  useEffect(() => {
    if (prevProductIdRef.current !== product.id) {
      prevProductIdRef.current = product.id;
      setActiveImageIdx(0);
      setQuantity(1);
      // Requirement: Products without photos must show "Producto sin foto" cover first, even if they have a video
      setActiveMediaMode('photo');
    }

    // Always reset scroll position to top when product changes or page mounts
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
        if (containerRef.current.parentElement) {
          containerRef.current.parentElement.scrollTop = 0;
        }
      }
    }
  }, [product.id, product.imageUrl, product.images, product.extractedAttributes, product.videoUrl]);

  const parsedVideo = product.videoUrl ? parseVideoUrl(product.videoUrl) : null;
  const hasVideo = Boolean(product.videoUrl && parsedVideo);
  const effectiveMediaMode = activeMediaMode;

  // Unified Next / Prev navigation: advances through all photos, then shows the video
  const goToNextMedia = () => {
    if (effectiveMediaMode === 'photo') {
      if (activeImageIdx < photos.length - 1) {
        setActiveImageIdx((prev) => prev + 1);
      } else if (hasVideo) {
        // User reaches last photo and swipes/advances -> SHOW VIDEO!
        setActiveMediaMode('video');
      } else if (photos.length > 1) {
        // Loop back to first photo if no video
        setActiveImageIdx(0);
      }
    } else if (effectiveMediaMode === 'video') {
      // Swiping next from video loops back to first photo
      if (photos.length > 0) {
        setActiveMediaMode('photo');
        setActiveImageIdx(0);
      }
    }
  };

  const goToPrevMedia = () => {
    if (effectiveMediaMode === 'video') {
      // Swiping back from video goes to the LAST photo!
      if (photos.length > 0) {
        setActiveMediaMode('photo');
        setActiveImageIdx(photos.length - 1);
      }
    } else if (effectiveMediaMode === 'photo') {
      if (activeImageIdx > 0) {
        setActiveImageIdx((prev) => prev - 1);
      } else if (hasVideo) {
        // Swiping back on first photo wraps to video
        setActiveMediaMode('video');
      } else if (photos.length > 1) {
        setActiveImageIdx(photos.length - 1);
      }
    }
  };

  // Touch and drag gesture state for mobile swipe
  const touchStartRef = React.useRef<{ x: number; y: number; time: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState<boolean>(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;

    // Only apply horizontal offset if horizontal movement is dominant
    if (Math.abs(dx) > Math.abs(dy)) {
      setSwipeOffset(Math.max(-80, Math.min(80, dx * 0.35)));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;

    touchStartRef.current = null;
    setIsSwiping(false);
    setSwipeOffset(0);

    const isHorizontal = Math.abs(dx) > Math.abs(dy);
    const threshold = dt < 350 ? 25 : 40;

    if (isHorizontal && Math.abs(dx) >= threshold) {
      if (dx < 0) {
        // Swiped Left -> NEXT (will open video if on last photo)
        goToNextMedia();
      } else {
        // Swiped Right -> PREV
        goToPrevMedia();
      }
    }
  };

  // Desktop mouse drag support for preview testing
  const mouseStartRef = React.useRef<{ x: number; y: number; time: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, video, iframe')) return;
    mouseStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
    };
    setIsSwiping(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!mouseStartRef.current) return;
    const dx = e.clientX - mouseStartRef.current.x;
    const dy = e.clientY - mouseStartRef.current.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      setSwipeOffset(Math.max(-70, Math.min(70, dx * 0.3)));
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!mouseStartRef.current) return;
    const dx = e.clientX - mouseStartRef.current.x;
    const dy = e.clientY - mouseStartRef.current.y;
    const dt = Date.now() - mouseStartRef.current.time;
    mouseStartRef.current = null;
    setIsSwiping(false);
    setSwipeOffset(0);

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) >= (dt < 350 ? 25 : 40)) {
      if (dx < 0) goToNextMedia();
      else goToPrevMedia();
    }
  };

  const handleMouseLeave = () => {
    if (mouseStartRef.current) {
      mouseStartRef.current = null;
      setIsSwiping(false);
      setSwipeOffset(0);
    }
  };
  
  // Media retry & fallback states
  const [activePhotoUrl, setActivePhotoUrl] = useState<string>(() =>
    normalizeMediaUrl(photos[activeImageIdx] || product.imageUrl)
  );
  const [activePhotoHasFallbackTried, setActivePhotoHasFallbackTried] = useState(false);
  const [photoError, setPhotoError] = useState(false);

  useEffect(() => {
    const raw = normalizeMediaUrl(photos[activeImageIdx] || product.imageUrl);
    setActivePhotoUrl(raw);
    setActivePhotoHasFallbackTried(false);
    setPhotoError(!raw);
  }, [photos, activeImageIdx, product.imageUrl]);

  const handleDetailImageError = () => {
    if (activePhotoUrl.startsWith('/uploads/') && !activePhotoHasFallbackTried) {
      setActivePhotoHasFallbackTried(true);
      setActivePhotoUrl(activePhotoUrl.replace('/uploads/', '/api/media/'));
      return;
    }
    // If that fails, try next photo index if available
    if (activeImageIdx + 1 < photos.length) {
      setActiveImageIdx(activeImageIdx + 1);
      return;
    }
    setPhotoError(true);
  };

  const [directVideoUrl, setDirectVideoUrl] = useState<string>(() =>
    parsedVideo?.embedUrl ? normalizeMediaUrl(parsedVideo.embedUrl) : ''
  );
  const [videoFallbackTried, setVideoFallbackTried] = useState(false);

  useEffect(() => {
    if (parsedVideo?.embedUrl) {
      setDirectVideoUrl(normalizeMediaUrl(parsedVideo.embedUrl));
      setVideoFallbackTried(false);
    }
  }, [parsedVideo?.embedUrl]);

  const handleDetailVideoError = () => {
    if (directVideoUrl.startsWith('/uploads/') && !videoFallbackTried) {
      setVideoFallbackTried(true);
      setDirectVideoUrl(directVideoUrl.replace('/uploads/', '/api/media/'));
    }
  };

  // Price calculations
  const discountPercent = Math.max(0, Math.min(100, Number(product.discountPercent) || 0));
  const hasDiscount = discountPercent > 0;
  const regularPrice = Number(product.salePrice) || 0;
  const effectivePrice = hasDiscount ? regularPrice * (1 - discountPercent / 100) : regularPrice;
  const savings = hasDiscount ? regularPrice - effectivePrice : 0;

  // Related products from same category or popular
  const relatedProducts = React.useMemo(() => {
    const others = allProducts.filter(
      (p) => p.id !== product.id && p.status !== 'archived'
    );
    const sameCategory = others.filter(
      (p) => p.category && p.category.toLowerCase() === (product.category || '').toLowerCase()
    );
    if (sameCategory.length >= 4) return sameCategory.slice(0, 4);
    return [...sameCategory, ...others.filter((p) => !sameCategory.includes(p))].slice(0, 4);
  }, [allProducts, product]);

  const handleAdd = () => {
    onAddToCart(product, quantity);
    setAddedAnimation(true);
    setTimeout(() => setAddedAnimation(false), 2000);
  };

  const handleDirectBuy = () => {
    onDirectBuyProduct(product, undefined, quantity);
  };

  const inCartItem = cart?.find((ci) => ci.item.id === product.id);
  const inCartQty = inCartItem ? inCartItem.quantity : 0;

  const handleDirectWhatsAppOrder = () => {
    const norm = normalizeEcuadorPhone(storeConfig.whatsappNumber);
    const storeName = storeConfig.storeName || 'Tienda Oficial';
    const totalOrder = (effectivePrice * quantity).toFixed(2);

    let msg = `¡Hola *${storeName}*! 👋 Me interesa comprar este producto:\n\n`;
    msg += `✨ *${product.name}*\n`;
    msg += `🏷️ SKU: ${product.sku || 'N/A'}\n`;
    if (product.category) msg += `📂 Categoría: ${product.category}\n`;
    msg += `🔢 Cantidad: *${quantity}*\n`;
    msg += `💰 Precio unitario: $${effectivePrice.toFixed(2)} ${currency}\n`;
    msg += `💵 Total estimado: *$${totalOrder} ${currency}*\n\n`;
    msg += `¿Tienen disponibilidad para coordinar el pago y envío? ¡Muchas gracias!`;

    const url = buildWhatsAppLink(norm.whatsappDigits, msg);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50/60 pb-32 animate-in fade-in duration-200 relative overflow-hidden">
      {/* POINT 1: AMBIENT GLOW BACKGROUND CIRCLES */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[350px] bg-amber-400/10 blur-[110px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 left-10 w-[400px] h-[300px] bg-emerald-400/10 blur-[110px] pointer-events-none -z-10" />

      {/* 1. TOP STICKY NAVIGATION BAR WITH GLASSMORPHISM */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-slate-200/80 shadow-xs px-3 sm:px-6 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          {/* Back Button */}
          <button
            type="button"
            onClick={onBack}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 hover:bg-slate-200 text-slate-800 border border-slate-200/80 text-xs font-bold transition cursor-pointer active:scale-95 shadow-2xs"
            title="Volver al catálogo"
          >
            <ArrowLeft className="w-4 h-4 text-slate-700" />
            <span className="hidden sm:inline">Volver al catálogo</span>
            <span className="sm:hidden">Atrás</span>
          </button>

          {/* Store Brand / Identity */}
          <div className="flex items-center space-x-2 truncate">
            {/* Mobile (Square) */}
            <div className="md:hidden flex-shrink-0">
              {storeConfig.logoUrl ? (
                <div className="w-7 h-7 rounded-lg bg-white border border-amber-400 overflow-hidden shadow-2xs flex items-center justify-center p-0.5">
                  <img src={storeConfig.logoUrl} alt={storeConfig.storeName} className="w-full h-full object-contain" />
                </div>
              ) : storeConfig.logoDesktopUrl ? (
                <div className="w-7 h-7 rounded-lg bg-white border border-amber-400 overflow-hidden shadow-2xs flex items-center justify-center p-0.5">
                  <img src={storeConfig.logoDesktopUrl} alt={storeConfig.storeName} className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-400 to-orange-500 text-slate-950 flex items-center justify-center shadow-2xs font-black">
                  <Store className="w-4 h-4" />
                </div>
              )}
            </div>

            {/* Desktop (Rectangular or Square) */}
            <div className="hidden md:flex flex-shrink-0 items-center">
              {storeConfig.logoDesktopUrl ? (
                <div className="h-8 max-w-[140px] lg:max-w-[170px] rounded-lg bg-white border border-amber-400 overflow-hidden shadow-2xs flex items-center justify-center px-1.5 py-0.5">
                  <img src={storeConfig.logoDesktopUrl} alt={storeConfig.storeName} className="h-full w-auto max-w-full object-contain" />
                </div>
              ) : storeConfig.logoUrl ? (
                <div className="w-8 h-8 rounded-lg bg-white border border-amber-400 overflow-hidden shadow-2xs flex items-center justify-center p-0.5">
                  <img src={storeConfig.logoUrl} alt={storeConfig.storeName} className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-400 to-orange-500 text-slate-950 flex items-center justify-center shadow-2xs font-black">
                  <Store className="w-4 h-4" />
                </div>
              )}
            </div>

            <div className="truncate">
              <div className="flex items-center space-x-1">
                <span className="font-black text-xs sm:text-sm text-slate-900 truncate max-w-[140px] xs:max-w-[200px] sm:max-w-none">
                  {storeConfig.storeName || 'Tienda Oficial'}
                </span>
                <span className="px-1.5 py-0.2 rounded-full text-[8px] font-black bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-2xs">
                  OFICIAL
                </span>
              </div>
            </div>
          </div>

          {/* Right Header Actions: WhatsApp & Cart */}
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            {storeConfig.whatsappNumber && (
              <button
                type="button"
                onClick={() => {
                  const norm = normalizeEcuadorPhone(storeConfig.whatsappNumber);
                  const msg = `¡Hola! Quisiera consultar sobre el producto: *${product.name}* (SKU: ${product.sku || 'N/A'})`;
                  window.open(buildWhatsAppLink(norm.whatsappDigits, msg), '_blank');
                }}
                className="hidden md:flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition cursor-pointer"
                title="Consultar por WhatsApp"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>Consultar</span>
              </button>
            )}

            {isCustomerView && onOpenCart && (
              <button
                type="button"
                onClick={onOpenCart}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 text-xs font-black transition cursor-pointer shadow-xs active:scale-95"
                title="Ver carrito de compras"
              >
                <div className="relative">
                  <ShoppingCart className="w-4 h-4 text-slate-950" />
                  {cartTotalItems > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-slate-950 text-amber-300 text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-amber-300">
                      {cartTotalItems}
                    </span>
                  )}
                </div>
                <span className="hidden sm:inline">Carrito</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. BREADCRUMBS */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
        <nav className="flex items-center space-x-1.5 text-xs text-slate-500 overflow-x-auto whitespace-nowrap">
          <button
            onClick={onBack}
            className="hover:text-slate-900 transition font-medium cursor-pointer"
          >
            Inicio
          </button>
          <span>/</span>
          {product.category && (
            <>
              <span className="text-slate-600 font-semibold">{product.category}</span>
              <span>/</span>
            </>
          )}
          <span className="text-slate-900 font-bold truncate max-w-[200px] sm:max-w-md">
            {product.name}
          </span>
        </nav>
      </div>

      {/* 3. MAIN PRODUCT SHOWCASE CONTAINER */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-slate-200/90 shadow-md overflow-hidden p-4 sm:p-6 lg:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* LEFT COLUMN: MEDIA GALLERY WITH POINT 2 SPOTLIGHT ZOOM */}
            <div className="lg:col-span-6 flex flex-col space-y-4">
              {/* Media Mode Switcher (if video exists) */}
              {product.videoUrl && (
                <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-bold shadow-inner">
                  <button
                    type="button"
                    onClick={() => setActiveMediaMode('photo')}
                    className={`flex-1 py-1.5 rounded-lg text-center transition flex items-center justify-center space-x-1.5 cursor-pointer ${
                      effectiveMediaMode === 'photo'
                        ? 'bg-white text-slate-900 shadow-xs font-black'
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
                        ? 'bg-sky-600 text-white shadow-xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Ver Video</span>
                  </button>
                </div>
              )}

              {/* POINT 2: Main Media Showcase Box with Spotlight Zoom & Touch Swipe */}
              <div
                className="group/media relative aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200/90 border border-slate-200/90 flex items-center justify-center shadow-sm hover:shadow-xl transition-all duration-300 select-none touch-pan-y"
                onTouchStart={effectiveMediaMode === 'photo' ? handleTouchStart : undefined}
                onTouchMove={effectiveMediaMode === 'photo' ? handleTouchMove : undefined}
                onTouchEnd={effectiveMediaMode === 'photo' ? handleTouchEnd : undefined}
                onMouseDown={effectiveMediaMode === 'photo' ? handleMouseDown : undefined}
                onMouseMove={effectiveMediaMode === 'photo' ? handleMouseMove : undefined}
                onMouseUp={effectiveMediaMode === 'photo' ? handleMouseUp : undefined}
                onMouseLeave={effectiveMediaMode === 'photo' ? handleMouseLeave : undefined}
              >
                <div
                  className="w-full h-full flex items-center justify-center transition-transform duration-200"
                  style={{
                    transform: `translateX(${swipeOffset}px)`,
                    transition: isSwiping ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)',
                  }}
                >
                  {effectiveMediaMode === 'video' && parsedVideo ? (
                    <div className="w-full h-full bg-black relative flex items-center justify-center z-0">
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
                          key={directVideoUrl || parsedVideo.embedUrl}
                          src={directVideoUrl || parsedVideo.embedUrl}
                          controls
                          controlsList="nodownload"
                          autoPlay
                          muted={false}
                          playsInline
                          className="w-full h-full object-contain"
                          onError={handleDetailVideoError}
                        />
                      ) : parsedVideo.embedUrl ? (
                        <iframe
                          key={parsedVideo.embedUrl}
                          src={parsedVideo.embedUrl}
                          title={product.name}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                          className="w-full h-full border-0 pointer-events-auto z-0"
                        />
                      ) : (
                        <div className="text-center p-4 text-slate-400 text-xs">
                          <Play className="w-10 h-10 mx-auto mb-2 text-sky-400 opacity-80" />
                          <p className="font-bold text-slate-200">Video del Producto</p>
                          <a
                            href={product.videoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-400 underline text-xs mt-2 inline-flex items-center space-x-1"
                          >
                            <span>Abrir video en reproductor externo</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {activePhotoUrl && !photoError ? (
                        <img
                          src={activePhotoUrl}
                          alt={product.name}
                          className="w-full h-full object-contain p-3 group-hover/media:scale-108 transition-transform duration-500 ease-out"
                          referrerPolicy="no-referrer"
                          onError={handleDetailImageError}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-6 text-center select-none w-full h-full">
                          <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-400 mb-3">
                            <ImageOff className="w-8 h-8 text-slate-400 stroke-[1.5]" />
                          </div>
                          <span className="text-sm sm:text-base font-extrabold text-slate-700 tracking-tight uppercase">
                            Producto sin foto
                          </span>
                          <span className="text-xs text-slate-400 mt-1">
                            Este producto no incluye fotografías
                          </span>
                          {hasVideo && (
                            <button
                              type="button"
                              onClick={() => setActiveMediaMode('video')}
                              className="mt-4 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer active:scale-95 z-10"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Ver Video Disponible</span>
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Media Counter Badge in Photo mode (Top Right) */}
                {effectiveMediaMode === 'photo' && (
                  <div className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full text-[11px] font-bold bg-black/75 text-white border border-white/20 backdrop-blur-md flex items-center space-x-1 shadow-md pointer-events-none">
                    <ImageIcon className="w-3 h-3 text-amber-300" />
                    <span>
                      {photos.length > 0 ? `${activeImageIdx + 1}/${photos.length}` : '1/1'}
                    </span>
                    {hasVideo && <span className="text-sky-300 text-[10px] ml-1 font-semibold">+ Video ▶</span>}
                  </div>
                )}

                {/* Video Badges & Return to Photos Button (when video is playing) */}
                {effectiveMediaMode === 'video' && parsedVideo && (
                  <>
                    {/* Platform Badge (Top Left with pointer-events-none) */}
                    <div className="absolute top-3 left-3 z-20 pointer-events-none">
                      <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-black/80 text-sky-300 border border-white/20 backdrop-blur-xs shadow-md">
                        {parsedVideo.platform.toUpperCase()}
                      </span>
                    </div>

                    {/* Volver a Fotos Button (Top Right) */}
                    {photos.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMediaMode('photo');
                          setActiveImageIdx(photos.length - 1);
                        }}
                        className="absolute top-3 right-3 z-30 px-3 py-1.5 rounded-xl text-xs font-black bg-slate-900/90 hover:bg-black text-amber-300 border border-amber-400/50 shadow-lg flex items-center space-x-1.5 cursor-pointer transition active:scale-95 backdrop-blur-md"
                        title="Regresar a las fotos del producto"
                      >
                        <ChevronLeft className="w-4 h-4 text-amber-400" />
                        <span>Volver a Fotos</span>
                      </button>
                    )}
                  </>
                )}

                {/* Discount Badge */}
                {hasDiscount && (
                  <div className="absolute top-3 left-3 z-10">
                    <span className="px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-rose-600 via-red-500 to-amber-500 text-white shadow-lg shadow-rose-600/30 border border-white/30 flex items-center space-x-1.5 badge-pulse-glow">
                      <Flame className="w-3.5 h-3.5 fill-current text-yellow-200" />
                      <span>OFERTA -{discountPercent}%</span>
                    </span>
                  </div>
                )}

                {/* Prev / Next Navigation Arrows */}
                {(photos.length > 1 || (photos.length > 0 && hasVideo)) && (
                  <>
                    <button
                      type="button"
                      onClick={goToPrevMedia}
                      className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-white/90 text-slate-800 border border-slate-200 hover:bg-white shadow-lg backdrop-blur-xs transition cursor-pointer active:scale-95"
                      title="Anterior"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={goToNextMedia}
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-white/90 text-slate-800 border border-slate-200 hover:bg-white shadow-lg backdrop-blur-xs transition cursor-pointer active:scale-95"
                      title="Siguiente"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}

                {/* Last Photo Swipe-to-Video Cue Badge */}
                {effectiveMediaMode === 'photo' && hasVideo && activeImageIdx === photos.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setActiveMediaMode('video')}
                    className="absolute bottom-3 right-3 z-10 px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white border border-sky-300/40 shadow-lg flex items-center space-x-1.5 cursor-pointer transition active:scale-95 animate-pulse backdrop-blur-xs"
                    title="Desliza o toca para ver el video"
                  >
                    <Play className="w-3.5 h-3.5 fill-current text-sky-200" />
                    <span>Desliza para ver Video ▶</span>
                  </button>
                )}
                {effectiveMediaMode === 'photo' && hasVideo && activeImageIdx < photos.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setActiveMediaMode('video')}
                    className="absolute bottom-3 right-3 z-10 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-950/90 hover:bg-black text-sky-300 border border-sky-400/40 shadow-md flex items-center space-x-1.5 cursor-pointer transition active:scale-95 backdrop-blur-xs"
                  >
                    <Play className="w-3.5 h-3.5 text-sky-400 fill-current" />
                    <span>Ver Video</span>
                  </button>
                )}
              </div>

              {/* Thumbnails Carousel (Photos + Video) */}
              {(photos.length > 1 || hasVideo) && (
                <div className="flex items-center space-x-2 overflow-x-auto py-1">
                  {photos.map((ph, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setActiveMediaMode('photo');
                        setActiveImageIdx(idx);
                      }}
                      className={`w-16 h-16 rounded-2xl overflow-hidden border-2 transition cursor-pointer flex-shrink-0 bg-white p-1 ${
                        effectiveMediaMode === 'photo' && activeImageIdx === idx
                          ? 'border-amber-400 ring-4 ring-amber-400/20 scale-105 shadow-md'
                          : 'border-slate-200 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={ph} alt="" className="w-full h-full object-contain" />
                    </button>
                  ))}
                  {hasVideo && (
                    <button
                      type="button"
                      onClick={() => setActiveMediaMode('video')}
                      className={`w-16 h-16 rounded-2xl overflow-hidden border-2 transition cursor-pointer flex-shrink-0 bg-slate-950 flex flex-col items-center justify-center p-1 ${
                        effectiveMediaMode === 'video'
                          ? 'border-sky-500 ring-4 ring-sky-500/30 scale-105 shadow-md'
                          : 'border-slate-200 opacity-70 hover:opacity-100'
                      }`}
                      title="Ver video del producto"
                    >
                      <Play className="w-5 h-5 fill-current mb-0.5 text-sky-400" />
                      <span className="text-[9px] font-black uppercase text-slate-200 tracking-wider">
                        Video
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: PRODUCT INFORMATION & ACTIONS */}
            <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                {/* Badges row: Category, SKU */}
                <div className="flex items-center flex-wrap gap-2">
                  {product.category && (
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {product.category}
                    </span>
                  )}
                  {product.sku && (
                    <span className="font-mono text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                      SKU: {product.sku}
                    </span>
                  )}
                </div>

                {/* Product Title */}
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 leading-tight">
                  {product.name}
                </h1>

                {/* POINT 3: VIP PRICING CARD WITH RICH LUXURY COLORS & SUBTLE ANIMATION */}
                <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-950 text-white shadow-2xl border border-amber-500/30 space-y-3.5 relative overflow-hidden animate-vip-card-glow vip-card-light-sweep">
                  {/* Ambient Light Orbs */}
                  <div className="absolute -top-12 -right-12 w-44 h-44 bg-amber-500/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
                  <div className="absolute -bottom-12 -left-12 w-44 h-44 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

                  {hasDiscount ? (
                    <div className="relative z-10 space-y-1.5">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="text-sm line-through text-slate-400 font-bold">
                          ${regularPrice.toFixed(2)} {currency}
                        </span>
                        <span className="px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-rose-500 via-amber-500 to-yellow-400 text-slate-950 shadow-lg shadow-amber-500/20 border border-yellow-200/40 flex items-center space-x-1.5 badge-pulse-glow glossy-sheen-effect">
                          <Sparkles className="w-3.5 h-3.5 text-slate-950 fill-slate-950" />
                          <span>AHORRAS ${savings.toFixed(2)} (-{discountPercent}%)</span>
                        </span>
                      </div>
                      <div className="flex items-baseline space-x-2 pt-0.5">
                        <span className="text-4xl sm:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-emerald-400 drop-shadow-sm">
                          ${effectivePrice.toFixed(2)}
                        </span>
                        <span className="text-sm font-bold text-amber-300/90">{currency}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-baseline space-x-2 relative z-10">
                      <span className="text-4xl sm:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-emerald-400 drop-shadow-sm">
                        ${regularPrice.toFixed(2)}
                      </span>
                      <span className="text-sm font-bold text-amber-300/90">{currency}</span>
                    </div>
                  )}

                  {/* Delivery Note & Very Small Payment Method Logos (Only Logos) */}
                  <div className="pt-2.5 border-t border-slate-800/90 relative z-10 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] sm:text-xs text-slate-300/90 flex items-center">
                      <Truck className="w-3.5 h-3.5 mr-1.5 text-amber-400 shrink-0" />
                      <span>Envío directo o retiro coordinado</span>
                    </p>

                    {/* ONLY Payment Logos (Very Small) */}
                    {activePaymentLogos.length > 0 && (
                      <div className="flex items-center space-x-1 sm:space-x-1.5 overflow-x-auto py-0.5 no-scrollbar shrink-0">
                        {activePaymentLogos.map((p, idx) => (
                          <div
                            key={p.id || idx}
                            className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-white/95 border border-white/40 p-0.5 shadow-2xs flex items-center justify-center flex-shrink-0 hover:scale-110 transition-transform cursor-pointer"
                            title={p.name}
                          >
                            <img src={p.logoUrl} alt={p.name} className="w-full h-full object-contain rounded-2xs" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Quantity Selector - Always available for customer orders */}
                <div className="flex items-center space-x-3 pt-2">
                  <label className="text-xs font-bold text-slate-700">Cantidad:</label>
                  <div className="flex items-center border border-slate-300 rounded-xl bg-slate-50 overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                      disabled={quantity <= 1}
                      className="p-2 hover:bg-slate-200 text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                      title="Disminuir"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-12 text-center text-xs font-black text-slate-900 select-none">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((prev) => Math.min(999, prev + 1))}
                      className="p-2 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                      title="Aumentar"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* POINT 4: PRIMARY ACTION BUTTONS WITH GLOW PULSE */}
                <div className="space-y-3 pt-2">
                  {isCustomerView && (
                    <>
                      {/* In-Cart Quick Status Bar & Quantity Adjuster */}
                      {inCartQty > 0 && (
                        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200/90 flex flex-wrap items-center justify-between gap-2 shadow-2xs animate-fadeIn">
                          <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-xs shadow-2xs">
                              <ShoppingCart className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-xs font-black text-slate-900 block">
                                {inCartQty} {inCartQty === 1 ? 'unidad' : 'unidades'} en tu carrito
                              </span>
                              <span className="text-[10px] text-slate-600 font-medium">
                                Subtotal: ${(effectivePrice * inCartQty).toFixed(2)} {currency}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-1.5 ml-auto">
                            {onUpdateCartQty && (
                              <button
                                type="button"
                                onClick={() => onUpdateCartQty(product.id, inCartQty - 1)}
                                className="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 flex items-center justify-center font-black text-xs cursor-pointer shadow-2xs active:scale-95 transition"
                                title="Reducir una unidad"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onAddToCart(product, 1)}
                              className="w-7 h-7 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-950 flex items-center justify-center font-black text-xs cursor-pointer shadow-2xs active:scale-95 transition"
                              title="Agregar una unidad más"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            {onOpenCart && (
                              <button
                                type="button"
                                onClick={onOpenCart}
                                className="ml-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] flex items-center space-x-1 cursor-pointer shadow-2xs active:scale-95 transition"
                              >
                                <span>Pagar</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 1. AGREGAR AL CARRITO (Primary) - Vibrant Golden Glow Button */}
                      <button
                        type="button"
                        onClick={handleAdd}
                        className={`w-full py-4 px-5 rounded-2xl font-black text-sm sm:text-base shadow-xl transition-all duration-200 flex items-center justify-center space-x-2.5 cursor-pointer active:scale-95 hover:-translate-y-0.5 ${
                          addedAnimation
                            ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                            : 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 shadow-amber-400/30 border border-amber-300/60'
                        }`}
                      >
                        {addedAnimation ? (
                          <>
                            <Check className="w-5 h-5 stroke-[3]" />
                            <span>¡Agregado al Carrito ({quantity})!</span>
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="w-5 h-5 stroke-[2.5]" />
                            <span>
                              Agregar al Carrito • ${(effectivePrice * quantity).toFixed(2)} {currency}
                            </span>
                          </>
                        )}
                      </button>

                      {/* 2. COMPRAR POR WHATSAPP (Direct simplified flow) - Emerald Neon Glow Button */}
                      <button
                        type="button"
                        onClick={handleDirectBuy}
                        className="w-full py-4 px-5 rounded-2xl text-sm sm:text-base font-black transition-all duration-200 flex items-center justify-center space-x-2.5 cursor-pointer active:scale-95 hover:-translate-y-0.5 shadow-xl bg-gradient-to-r from-emerald-500 via-green-600 to-emerald-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-emerald-500/25 border border-emerald-400/40"
                      >
                        <MessageCircle className="w-5 h-5 fill-current" />
                        <span>Comprar por WhatsApp</span>
                      </button>

                      {/* 3. CONSULTAR DIRECTAMENTE POR WHATSAPP */}
                      {storeConfig.whatsappNumber && (
                        <button
                          type="button"
                          onClick={handleDirectWhatsAppOrder}
                          className="w-full py-2.5 sm:py-3 px-4 rounded-2xl text-xs sm:text-sm font-bold transition flex items-center justify-center space-x-2 cursor-pointer active:scale-95 border border-emerald-300/80 bg-emerald-50/70 hover:bg-emerald-100/80 text-emerald-800"
                        >
                          <MessageCircle className="w-4 h-4 text-emerald-600" />
                          <span>Consultar asesor por WhatsApp</span>
                        </button>
                      )}
                    </>
                  )}

                  {/* Share product options */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={(e) => onShareProductWhatsApp(product, e)}
                      className="w-full py-2.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95 shadow-2xs"
                    >
                      <MessageCircle className="w-4 h-4 text-emerald-600" />
                      <span>Compartir por WhatsApp</span>
                    </button>
                  </div>
                </div>

                {/* Description Box */}
                {product.description && (
                  <div className="pt-4 border-t border-slate-100 space-y-2">
                    <h3 className="text-xs uppercase tracking-wider font-bold text-slate-700">
                      Descripción del Producto
                    </h3>
                    <p className="text-xs sm:text-sm leading-relaxed text-slate-600 whitespace-pre-line bg-slate-50/70 p-4 rounded-2xl border border-slate-200/60">
                      {product.description}
                    </p>
                  </div>
                )}

                {/* Store Guarantee Badges */}
                <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-slate-600 text-xs">
                  <div className="flex items-center space-x-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                    <Truck className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <span className="font-semibold text-[11px]">Envíos seguros</span>
                  </div>
                  <div className="flex items-center space-x-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="font-semibold text-[11px]">Garantía oficial</span>
                  </div>
                  <div className="flex items-center space-x-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                    <MessageCircle className="w-4 h-4 text-sky-500 flex-shrink-0" />
                    <span className="font-semibold text-[11px]">Soporte WhatsApp</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. RELATED PRODUCTS SECTION */}
        {relatedProducts.length > 0 && (
          <div className="mt-12 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  Otros productos que te pueden interesar
                </h2>
                <p className="text-xs text-slate-500">
                  Explora más artículos recomendados de nuestra tienda
                </p>
              </div>
              <button
                onClick={onBack}
                className="text-xs font-bold text-amber-600 hover:text-amber-700 cursor-pointer flex items-center space-x-1"
              >
                <span>Ver todo el catálogo</span>
                <ArrowLeft className="w-3 h-3 rotate-180" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {relatedProducts.map((item) => {
                const itemPhotos = item.imageUrl ? [item.imageUrl] : [];
                const itemDisc = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
                const itemReg = Number(item.salePrice) || 0;
                const itemEff = itemDisc > 0 ? itemReg * (1 - itemDisc / 100) : itemReg;

                return (
                  <div
                    key={item.id}
                    onClick={() => onSelectProduct(item)}
                    className="bg-white border border-slate-200/90 hover:border-amber-400 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all duration-300 cursor-pointer flex flex-col justify-between group p-3 space-y-2"
                  >
                    <div className="aspect-square rounded-xl bg-slate-50 overflow-hidden relative flex items-center justify-center border border-slate-100">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <Package className="w-8 h-8 text-slate-300" />
                      )}
                      {itemDisc > 0 && (
                        <div className="absolute top-1.5 left-1.5">
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-rose-600 text-white shadow-2xs">
                            -{itemDisc}%
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        {item.category || 'General'}
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 line-clamp-2 group-hover:text-amber-600 transition">
                        {item.name}
                      </h4>
                      <div className="flex items-baseline space-x-1">
                        <span className="text-sm font-black text-slate-900">
                          ${itemEff.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-500 font-normal">{currency}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

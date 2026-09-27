import React from 'react';
import { ArrowRight, Sparkles, Layers, Tag } from 'lucide-react';
import { InventoryItem } from '../../types.ts';

interface CategoryTransitionBannerProps {
  categoryName: string;
  itemCount: number;
  sampleProducts?: InventoryItem[];
  customImageUrl?: string | null;
  overlayColor?: string | null;
  overlayOpacity?: number | null;
  onSelectCategory?: (category: string) => void;
  className?: string;
}

const hexToRgba = (hex: string, alpha: number = 1): string => {
  if (!hex) return `rgba(15, 23, 42, ${alpha})`;
  let c = hex.replace('#', '').trim();
  if (c.length === 3) c = c.split('').map((char) => char + char).join('');
  if (c.length !== 6) return `rgba(15, 23, 42, ${alpha})`;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const CATEGORY_BACKGROUND_IMAGES: Record<string, string> = {
  belleza: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1600&q=80',
  cosmeticos: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1600&q=80',
  maquillaje: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=1600&q=80',
  tecnologia: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1600&q=80',
  electronica: 'https://images.unsplash.com/photo-1498049860654-af1a5c566876?auto=format&fit=crop&w=1600&q=80',
  celulares: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=1600&q=80',
  gadgets: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=1600&q=80',
  ropa: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&q=80',
  moda: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1600&q=80',
  vestimenta: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=1600&q=80',
  calzado: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=1600&q=80',
  zapatos: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=1600&q=80',
  hogar: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1600&q=80',
  cocina: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1600&q=80',
  deportes: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1600&q=80',
  fitness: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1600&q=80',
  accesorios: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1600&q=80',
  joyeria: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1600&q=80',
  salud: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=1600&q=80',
  juguetes: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=1600&q=80',
  mascotas: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=1600&q=80',
  ofertas: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1600&q=80',
  default: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1600&q=80',
};

export const CategoryTransitionBanner: React.FC<CategoryTransitionBannerProps> = ({
  categoryName,
  itemCount,
  sampleProducts = [],
  customImageUrl,
  overlayColor,
  overlayOpacity,
  onSelectCategory,
  className = '',
}) => {
  // Determine background image (Custom storeConfig image -> Predefined mapping -> Product image fallback)
  let bgImage = customImageUrl;

  if (!bgImage) {
    const normCat = (categoryName || '').toLowerCase().trim();
    for (const key of Object.keys(CATEGORY_BACKGROUND_IMAGES)) {
      if (normCat.includes(key)) {
        bgImage = CATEGORY_BACKGROUND_IMAGES[key];
        break;
      }
    }
  }

  if (!bgImage && sampleProducts.length > 0) {
    const withImg = sampleProducts.find((p) => p.imageUrl);
    if (withImg?.imageUrl) bgImage = withImg.imageUrl;
  }

  if (!bgImage) bgImage = CATEGORY_BACKGROUND_IMAGES.default;

  const thumbs = sampleProducts.filter((p) => p.imageUrl).slice(0, 3);

  // Compute dynamic overlay transparency and color gradient
  const baseColor = overlayColor || '#0f172a';
  const opVal = overlayOpacity !== undefined && overlayOpacity !== null ? Math.max(0, Math.min(100, Number(overlayOpacity))) / 100 : 0.85;

  const overlayBgStyle = {
    background: `linear-gradient(to right, ${hexToRgba(baseColor, Math.min(1, opVal * 1.15))}, ${hexToRgba(baseColor, opVal)}, ${hexToRgba(baseColor, opVal * 0.45)})`,
  };

  return (
    <div className={`col-span-full my-3 sm:my-4 ${className}`}>
      {/* Compact Height Container with Continuous Panel Float Wave & Mobile Gold Border */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-amber-400/50 shadow-xl group transition-all duration-500 hover:border-amber-400 hover:shadow-[0_12px_35px_rgba(245,158,11,0.35)] animate-banner-panel-float animate-mobile-gold-border glossy-sheen-effect min-h-[115px] sm:min-h-[130px]">
        {/* Full Cover Background Image with Continuous Camera Panning Motion */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-115 animate-category-bg-pan"
          style={{ backgroundImage: `url('${bgImage}')` }}
        />

        {/* High-Contrast Dynamic Multi-layered Overlay */}
        <div className="absolute inset-0 backdrop-blur-[2px] transition-all duration-500 group-hover:backdrop-blur-[1px]" style={overlayBgStyle} />

        {/* Light Sweep Sheen Effect - Runs CONTINUOUSLY on Mobile and on Hover on Desktop */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-mobile-sheen-sweep group-hover:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none z-10" />

        {/* Dynamic Glass Sparkle Overlay Mesh */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-400/15 via-transparent to-purple-600/20 pointer-events-none" />

        {/* Radiant Ambient Glow Orbs */}
        <div className="absolute -right-8 -top-8 w-44 h-44 sm:w-52 sm:h-52 rounded-full bg-amber-400/25 blur-2xl pointer-events-none animate-pulse" />
        <div className="absolute -left-8 -bottom-8 w-44 h-44 sm:w-52 sm:h-52 rounded-full bg-indigo-500/25 blur-2xl pointer-events-none animate-pulse" />
        <div className="absolute left-1/3 top-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-amber-300/15 blur-xl pointer-events-none animate-float-particle" />

        {/* Content Box */}
        <div className="relative z-10 p-3.5 sm:p-5 md:py-4 md:px-6 flex flex-row items-center justify-between gap-2.5 sm:gap-4">
          {/* Left Metadata & Title */}
          <div className="space-y-1 sm:space-y-1.5 max-w-xl min-w-0 flex-1">
            <div className="flex items-center space-x-1.5 sm:space-x-2 flex-wrap gap-y-1">
              <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider bg-slate-900/90 backdrop-blur-md border border-amber-400/60 text-amber-300 flex items-center gap-1 shadow-md animate-parallax-counter">
                <Layers className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400 animate-float-particle" />
                Categoría
              </span>
              <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-slate-950/90 backdrop-blur-md border border-slate-700 text-slate-200">
                {itemCount} {itemCount === 1 ? 'producto' : 'productos'}
              </span>
            </div>

            <h2 className="text-sm xs:text-base sm:text-xl md:text-2xl font-black tracking-tight flex items-center gap-1.5 sm:gap-2 drop-shadow-md leading-tight whitespace-normal break-words">
              <span className="animate-category-title-shimmer">{categoryName}</span>
              <Sparkles className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-amber-400 animate-pulse flex-shrink-0" />
            </h2>

            <p className="text-[10px] sm:text-xs text-slate-200/95 font-medium line-clamp-1 max-w-md">
              Colección exclusiva de <strong className="text-amber-300 font-bold">{categoryName}</strong>
            </p>
          </div>

          {/* Right Action & Thumbs (Optimized for Mobile Phone display) */}
          <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
            {/* Product Thumbnail Stack - Visible with counter float motion */}
            {thumbs.length > 0 && (
              <div className="flex items-center -space-x-2.5 sm:-space-x-2 overflow-visible p-0.5 animate-parallax-counter">
                {thumbs.slice(0, 2).map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-slate-900/90 border-2 border-amber-400/70 overflow-hidden shadow-md transform group-hover:rotate-3 group-hover:scale-110 active:scale-125 transition-all duration-300"
                    title={item.name}
                  >
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            {/* Compact CTA Button with Mobile Pulse Accent */}
            {onSelectCategory && (
              <button
                type="button"
                onClick={() => onSelectCategory(categoryName)}
                className="px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl font-black text-[11px] sm:text-xs bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 text-slate-950 transition-all duration-300 cursor-pointer flex items-center space-x-1 sm:space-x-1.5 shadow-md shadow-amber-500/30 active:scale-95 group/btn whitespace-nowrap border border-amber-300/80 animate-destello-pulse"
              >
                <span>Ver</span>
                <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 group-hover/btn:translate-x-1 transition-transform duration-300 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};



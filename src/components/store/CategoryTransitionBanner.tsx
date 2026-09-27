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
      {/* Compact Height Container (User Request: "no sean muy altos, sean un poco más cortos de altura") */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-700/60 shadow-xl group transition-all duration-300 hover:shadow-amber-500/10 min-h-[110px] sm:min-h-[125px] glossy-sheen-effect">
        {/* Full Cover Background Image with Zoom Effect */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-105"
          style={{ backgroundImage: `url('${bgImage}')` }}
        />

        {/* High-Contrast Dynamic Multi-layered Overlay with Custom Color & Transparency */}
        <div className="absolute inset-0 backdrop-blur-[1px] transition-all duration-300" style={overlayBgStyle} />

        {/* Light Sweep Sheen Effect on Hover */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none" />

        {/* Ambient Glows */}
        <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-amber-400/15 blur-2xl pointer-events-none group-hover:bg-amber-400/25 transition duration-500" />
        <div className="absolute -left-10 -bottom-10 w-44 h-44 rounded-full bg-indigo-500/15 blur-2xl pointer-events-none" />

        {/* Content Box (Compact Padding: p-4 sm:p-5 md:py-4.5 md:px-6) */}
        <div className="relative z-10 p-4 sm:p-5 md:py-4 md:px-6 flex flex-row items-center justify-between gap-4">
          {/* Left Metadata & Title */}
          <div className="space-y-1 sm:space-y-1.5 max-w-xl min-w-0">
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/15 backdrop-blur-md border border-white/20 text-amber-300 flex items-center gap-1 shadow-sm">
                <Layers className="w-3 h-3 text-amber-400" />
                Categoría
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-900/80 backdrop-blur-md border border-slate-700 text-slate-200">
                {itemCount} {itemCount === 1 ? 'producto' : 'productos'}
              </span>
            </div>

            <h2 className="text-sm xs:text-base sm:text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-1.5 sm:gap-2 drop-shadow-md leading-tight whitespace-normal break-words">
              <span>{categoryName}</span>
              <Sparkles className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-amber-400 animate-pulse flex-shrink-0" />
            </h2>

            <p className="text-[11px] sm:text-xs text-slate-300/90 font-medium truncate max-w-md hidden sm:block">
              Colección exclusiva de <strong className="text-white font-bold">{categoryName}</strong> con envío garantizado.
            </p>
          </div>

          {/* Right Action & Thumbs */}
          <div className="flex items-center space-x-3 flex-shrink-0">
            {/* Product Thumbnail Stack */}
            {thumbs.length > 0 && (
              <div className="hidden md:flex items-center -space-x-2 overflow-hidden p-0.5">
                {thumbs.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="w-9 h-9 rounded-xl bg-slate-900/90 border-2 border-slate-700 overflow-hidden shadow-md transform group-hover:rotate-1 transition duration-200"
                    title={item.name}
                  >
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            {/* Compact CTA Button */}
            {onSelectCategory && (
              <button
                type="button"
                onClick={() => onSelectCategory(categoryName)}
                className="px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl font-black text-xs bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 text-slate-950 hover:from-amber-300 hover:to-amber-400 transition-all duration-200 cursor-pointer flex items-center space-x-1.5 shadow-lg shadow-amber-500/20 active:scale-95 group/btn whitespace-nowrap"
              >
                <span>Ver Colección</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform duration-200 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

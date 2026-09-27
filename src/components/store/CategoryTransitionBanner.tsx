import React from 'react';
import { ArrowRight, Sparkles, Layers, Tag, ChevronRight } from 'lucide-react';
import { InventoryItem } from '../../types.ts';

interface CategoryTransitionBannerProps {
  categoryName: string;
  itemCount: number;
  sampleProducts?: InventoryItem[];
  onSelectCategory?: (category: string) => void;
  className?: string;
}

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
  onSelectCategory,
  className = '',
}) => {
  // Determine background image based on category name lookup or sample product
  const normCat = (categoryName || '').toLowerCase().trim();
  let bgImage = CATEGORY_BACKGROUND_IMAGES.default;

  for (const key of Object.keys(CATEGORY_BACKGROUND_IMAGES)) {
    if (normCat.includes(key)) {
      bgImage = CATEGORY_BACKGROUND_IMAGES[key];
      break;
    }
  }

  // Fallback to sample product image if category is not found in predefined map
  if (bgImage === CATEGORY_BACKGROUND_IMAGES.default && sampleProducts.length > 0) {
    const withImg = sampleProducts.find((p) => p.imageUrl);
    if (withImg?.imageUrl) {
      bgImage = withImg.imageUrl;
    }
  }

  const thumbs = sampleProducts.filter((p) => p.imageUrl).slice(0, 4);

  return (
    <div className={`col-span-full my-5 sm:my-7 ${className}`}>
      <div className="relative overflow-hidden rounded-3xl border border-slate-700/60 shadow-2xl group transition-all duration-500 hover:shadow-amber-500/10">
        {/* Full Image Background with Smooth Hover Zoom Effect */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-105"
          style={{ backgroundImage: `url('${bgImage}')` }}
        />

        {/* Multi-layered Dark Gradient & Glassmorphic Overlay for High Contrast Text */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-900/85 to-slate-950/60 backdrop-blur-[2px]" />

        {/* Ambient Glow & Glossy Sheen Lights */}
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-amber-400/10 blur-3xl pointer-events-none group-hover:bg-amber-400/20 transition duration-700" />
        <div className="absolute -left-16 -bottom-16 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

        {/* Content Container */}
        <div className="relative z-10 p-6 sm:p-8 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Left Side: Category Title & Metadata */}
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
              <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-white/10 backdrop-blur-md border border-white/20 text-amber-300 flex items-center gap-1.5 shadow-lg">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                Categoría
              </span>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-slate-900/80 backdrop-blur-md border border-slate-700 text-slate-200">
                {itemCount} {itemCount === 1 ? 'producto disponible' : 'productos disponibles'}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight flex items-center gap-3 drop-shadow-md">
              <span>{categoryName}</span>
              <Sparkles className="w-6 h-6 text-amber-400 animate-pulse flex-shrink-0" />
            </h2>

            <p className="text-xs sm:text-sm text-slate-200/90 font-medium leading-relaxed max-w-xl drop-shadow-xs">
              Explora nuestra cuidada selección en <strong className="text-white font-bold">{categoryName}</strong>. Productos de alta calidad con garantía y despacho rápido.
            </p>
          </div>

          {/* Right Side: Product Thumbnails & Action Button */}
          <div className="flex items-center space-x-4 flex-shrink-0">
            {/* Product Thumbnail Teaser Stack */}
            {thumbs.length > 0 && (
              <div className="hidden lg:flex items-center -space-x-3 overflow-hidden p-1">
                {thumbs.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="w-12 h-12 rounded-2xl bg-slate-900/90 border-2 border-slate-700 overflow-hidden shadow-xl transform group-hover:rotate-2 transition duration-300"
                    title={item.name}
                  >
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            {/* Interactive CTA Button */}
            {onSelectCategory && (
              <button
                type="button"
                onClick={() => onSelectCategory(categoryName)}
                className="px-5 sm:px-6 py-3.5 rounded-2xl font-black text-xs sm:text-sm bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 text-slate-950 hover:from-amber-300 hover:to-amber-400 transition-all duration-300 cursor-pointer flex items-center space-x-2.5 shadow-xl shadow-amber-500/20 active:scale-95 group/btn whitespace-nowrap"
              >
                <span>Ver Colección ({itemCount})</span>
                <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1.5 transition-transform duration-200 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

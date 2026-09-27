import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Sparkles, Tag, ChevronRight, CornerDownLeft } from 'lucide-react';
import { InventoryItem, StoreConfig } from '../../types.ts';
import { searchProductsFuzzy } from '../../utils/fuzzySearch.ts';

interface StoreSmartSearchBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  products: InventoryItem[];
  categories: string[];
  onSelectCategory?: (category: string) => void;
  onSelectProduct?: (product: InventoryItem) => void;
  placeholder?: string;
  className?: string;
  storeConfig?: StoreConfig;
}

export const StoreSmartSearchBar: React.FC<StoreSmartSearchBarProps> = ({
  searchQuery,
  setSearchQuery,
  products,
  categories,
  onSelectCategory,
  onSelectProduct,
  placeholder = 'Buscar en la tienda... (ej. audífonos, camisetas, SKU)',
  className = '',
  storeConfig,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currencySymbol = storeConfig?.currencySymbol || '$';

  // Compute live fuzzy search suggestions
  const fuzzyResult = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return { matches: [], didYouMean: null, suggestedCategories: [] };
    }
    return searchProductsFuzzy(products, searchQuery);
  }, [products, searchQuery]);

  const liveMatches = fuzzyResult.matches.slice(0, 5);
  const didYouMean = fuzzyResult.didYouMean;
  const suggestedCategories = fuzzyResult.suggestedCategories;

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatPrice = (price: number | string) => {
    const num = Number(price) || 0;
    return `${currencySymbol}${num.toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;
  };

  return (
    <div ref={containerRef} className={`relative flex-1 ${className}`}>
      {/* Input container */}
      <div className="relative flex items-center bg-white rounded-lg">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
            } else if (e.key === 'Enter') {
              setIsOpen(false);
            }
          }}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 bg-white focus:outline-none font-medium"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setIsOpen(false);
            }}
            className="absolute right-2 text-slate-400 hover:text-slate-700 cursor-pointer p-0.5 rounded-full hover:bg-slate-100 transition"
            title="Limpiar búsqueda"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && searchQuery.trim().length >= 1 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Typo Tolerance Suggestion Banner ("¿Quisiste decir...?") */}
          {didYouMean && (
            <div className="px-3.5 py-2.5 bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-transparent border-b border-amber-200/60 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs text-amber-900 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 animate-pulse" />
                <span>¿Quisiste decir <strong className="font-extrabold text-amber-700 underline underline-offset-2 cursor-pointer" onClick={() => setSearchQuery(didYouMean)}>{didYouMean}</strong>?</span>
              </div>
              <button
                type="button"
                onClick={() => setSearchQuery(didYouMean)}
                className="text-[11px] font-bold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200/80 px-2 py-0.5 rounded-md transition cursor-pointer"
              >
                Aplicar
              </button>
            </div>
          )}

          {/* Suggested Category Chips */}
          {suggestedCategories.length > 0 && (
            <div className="px-3.5 py-2 border-b border-slate-100 flex items-center space-x-1.5 overflow-x-auto scrollbar-none">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1 mr-1">
                <Tag className="w-2.5 h-2.5" /> Categorías:
              </span>
              {suggestedCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    if (onSelectCategory) onSelectCategory(cat);
                    setIsOpen(false);
                  }}
                  className="text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-amber-100 hover:text-amber-900 px-2.5 py-0.5 rounded-full transition cursor-pointer whitespace-nowrap"
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Product Match List */}
          {liveMatches.length > 0 ? (
            <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
              {liveMatches.map((item) => {
                const disc = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
                const origPrice = Number(item.salePrice) || 0;
                const finalPrice = disc > 0 ? origPrice * (1 - disc / 100) : origPrice;

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (onSelectProduct) onSelectProduct(item);
                      setIsOpen(false);
                    }}
                    className="p-2.5 hover:bg-slate-50 transition cursor-pointer flex items-center space-x-3 group"
                  >
                    {/* Thumbnail */}
                    <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 relative">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-200" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-[10px] font-bold">
                          {item.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      {disc > 0 && (
                        <span className="absolute top-0 right-0 bg-red-600 text-white text-[8px] font-black px-1 rounded-bl">
                          -{disc}%
                        </span>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate group-hover:text-amber-600 transition">
                        {item.name}
                      </h4>
                      <div className="flex items-center space-x-2 text-[11px] mt-0.5">
                        {item.category && (
                          <span className="text-slate-400 font-medium truncate max-w-[120px]">
                            {item.category}
                          </span>
                        )}
                        <span className="text-slate-300">•</span>
                        <span className="font-extrabold text-slate-900">
                          {formatPrice(finalPrice)}
                        </span>
                        {disc > 0 && (
                          <span className="text-slate-400 line-through text-[10px]">
                            {formatPrice(origPrice)}
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-amber-500 group-hover:translate-x-0.5 transition flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-slate-500">
              No se encontraron coincidencias directas para "{searchQuery}".
            </div>
          )}

          {/* Footer bar */}
          <div className="p-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>{fuzzyResult.matches.length} productos en total</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex items-center space-x-1 text-slate-600 hover:text-slate-900 font-bold cursor-pointer"
            >
              <span>Ver catálogo completo</span>
              <CornerDownLeft className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

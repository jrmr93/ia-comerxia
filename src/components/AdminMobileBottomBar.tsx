import React, { useRef } from 'react';
import {
  Layers,
  PackageCheck,
  Boxes,
  Store,
  Menu,
} from 'lucide-react';

export interface AdminMobileBottomBarProps {
  activeTab: string;
  storeSubTab?: 'catalog' | 'orders' | 'settings';
  setActiveTab: (tab: any) => void;
  onSelectStoreSubTab?: (subTab: 'catalog' | 'orders') => void;
  onOpenMobileMenu: () => void;
  onOpenAddProduct?: () => void;
  unseenCount?: number;
  pendingOrdersCount?: number;
  pendingPurchasesCount?: number;
}

const scrollToFirstRecord = (targetKey: 'inventory' | 'orders' | 'purchases' | 'store') => {
  const targetIdMap: Record<string, string[]> = {
    inventory: ['inventory-first-record', 'inventory-records-container', 'inventory-controls-container', 'inventory-search-bar'],
    orders: ['orders-first-record', 'orders-list-container', 'orders-search-container'],
    purchases: ['purchases-first-record', 'purchases-list-container', 'purchases-search-container'],
    store: ['store-first-record', 'store-catalog-container', 'store-products-anchor', 'marketplace-sticky-header'],
  };

  const candidateIds = targetIdMap[targetKey] || [];
  for (const id of candidateIds) {
    const el = document.getElementById(id);
    if (el) {
      const topOffset = 70;
      const elementPosition = el.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - topOffset;
      window.scrollTo({
        top: Math.max(0, offsetPosition),
        behavior: 'smooth',
      });
      return;
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

export const AdminMobileBottomBar: React.FC<AdminMobileBottomBarProps> = ({
  activeTab,
  storeSubTab,
  setActiveTab,
  onSelectStoreSubTab,
  onOpenMobileMenu,
  onOpenAddProduct,
  unseenCount = 0,
  pendingOrdersCount = 0,
  pendingPurchasesCount = 0,
}) => {
  const lastTapRef = useRef<{ tab: string; time: number }>({ tab: '', time: 0 });

  const isInventoryActive = activeTab === 'inventory' || activeTab === 'messages';
  const isOrdersActive = activeTab === 'orders' || (activeTab === 'store' && storeSubTab === 'orders');
  const isPurchasesActive = activeTab === 'purchases';
  const isStoreActive = activeTab === 'store' && storeSubTab !== 'orders';

  const handleTabPress = (
    tabKey: 'inventory' | 'orders' | 'purchases' | 'store',
    onSelect: () => void,
    isCurrentlyActive: boolean
  ) => {
    const now = Date.now();
    const isDoubleTap =
      (lastTapRef.current.tab === tabKey && now - lastTapRef.current.time < 500) ||
      isCurrentlyActive;

    lastTapRef.current = { tab: tabKey, time: now };
    onSelect();

    if (isDoubleTap) {
      // User requirement: Return automatically to the first record on double-tap
      setTimeout(() => {
        scrollToFirstRecord(tabKey);
      }, 50);
    }
  };

  return (
    <nav
      id="admin-mobile-bottom-navigation"
      aria-label="Navegación Móvil de Administración"
      className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] select-none"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 6px)' }}
    >
      <div className="grid grid-cols-5 h-14 items-center max-w-lg mx-auto px-1">
        {/* Tab 1: Inventario */}
        <button
          type="button"
          id="admin-nav-mobile-inventory"
          onClick={() => handleTabPress('inventory', () => setActiveTab('inventory'), isInventoryActive)}
          className={`flex flex-col items-center justify-center h-full min-h-[44px] transition cursor-pointer relative ${
            isInventoryActive ? 'text-sky-600 font-extrabold' : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div className="relative">
            <Layers className={`w-5 h-5 transition-transform ${isInventoryActive ? 'scale-110' : ''}`} />
            {unseenCount > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] rounded-full bg-rose-500 text-white text-[9px] font-mono font-bold flex items-center justify-center px-0.5 animate-pulse">
                {unseenCount > 9 ? '9+' : unseenCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-1 tracking-tight leading-none">Inventario</span>
          {isInventoryActive && (
            <span className="absolute top-0 w-8 h-0.5 bg-sky-500 rounded-full" />
          )}
        </button>

        {/* Tab 2: Ventas */}
        <button
          type="button"
          id="admin-nav-mobile-orders"
          onClick={() =>
            handleTabPress(
              'orders',
              () => {
                if (onSelectStoreSubTab) onSelectStoreSubTab('orders');
                else setActiveTab('orders');
              },
              isOrdersActive
            )
          }
          className={`flex flex-col items-center justify-center h-full min-h-[44px] transition cursor-pointer relative ${
            isOrdersActive ? 'text-indigo-600 font-extrabold' : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div className="relative">
            <PackageCheck className={`w-5 h-5 transition-transform ${isOrdersActive ? 'scale-110' : ''}`} />
            {pendingOrdersCount > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] rounded-full bg-amber-500 text-white text-[9px] font-mono font-bold flex items-center justify-center px-0.5">
                {pendingOrdersCount > 9 ? '9+' : pendingOrdersCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-1 tracking-tight leading-none">Ventas</span>
          {isOrdersActive && (
            <span className="absolute top-0 w-8 h-0.5 bg-indigo-500 rounded-full" />
          )}
        </button>

        {/* Tab 3: Compras */}
        <button
          type="button"
          id="admin-nav-mobile-purchases"
          onClick={() => handleTabPress('purchases', () => setActiveTab('purchases'), isPurchasesActive)}
          className={`flex flex-col items-center justify-center h-full min-h-[44px] transition cursor-pointer relative ${
            isPurchasesActive ? 'text-amber-600 font-extrabold' : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div className="relative">
            <Boxes className={`w-5 h-5 transition-transform ${isPurchasesActive ? 'scale-110' : ''}`} />
            {pendingPurchasesCount > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] rounded-full bg-amber-500 text-white text-[9px] font-mono font-bold flex items-center justify-center px-0.5">
                {pendingPurchasesCount > 9 ? '9+' : pendingPurchasesCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-1 tracking-tight leading-none">Compras</span>
          {isPurchasesActive && (
            <span className="absolute top-0 w-8 h-0.5 bg-amber-500 rounded-full" />
          )}
        </button>

        {/* Tab 4: Tienda */}
        <button
          type="button"
          id="admin-nav-mobile-store"
          onClick={() =>
            handleTabPress(
              'store',
              () => {
                if (onSelectStoreSubTab) onSelectStoreSubTab('catalog');
                else setActiveTab('store');
              },
              isStoreActive
            )
          }
          className={`flex flex-col items-center justify-center h-full min-h-[44px] transition cursor-pointer relative ${
            isStoreActive ? 'text-emerald-600 font-extrabold' : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <Store className={`w-5 h-5 transition-transform ${isStoreActive ? 'scale-110' : ''}`} />
          <span className="text-[10px] mt-1 tracking-tight leading-none">Tienda</span>
          {isStoreActive && (
            <span className="absolute top-0 w-8 h-0.5 bg-emerald-500 rounded-full" />
          )}
        </button>

        {/* Tab 5: Menú Completo ERP */}
        <button
          type="button"
          id="admin-nav-mobile-menu"
          onClick={onOpenMobileMenu}
          className="flex flex-col items-center justify-center h-full min-h-[44px] text-slate-600 hover:text-indigo-600 transition cursor-pointer relative"
        >
          <div className="p-1 rounded-lg bg-slate-100 group-hover:bg-indigo-50">
            <Menu className="w-4 h-4" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight font-bold leading-none">Menú ERP</span>
        </button>
      </div>
    </nav>
  );
};

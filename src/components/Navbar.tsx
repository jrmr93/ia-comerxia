import React from 'react';
import {
  Bot,
  Database,
  Download,
  Plus,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  Users,
  Building2,
  LogOut,
  Layers,
  Store,
  ShoppingCart,
  Bell,
  PackageCheck,
  BarChart3,
  TrendingUp,
  Boxes,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { StoreConfig } from '../types.ts';

interface NavbarProps {
  onOpenSimulator: () => void;
  onOpenConfig: () => void;
  onOpenDeployment?: () => void;
  onOpenAddProduct: () => void;
  onOpenProfile?: () => void;
  activeTab: 'customers' | 'suppliers' | 'store' | 'inventory' | 'purchases' | 'orders' | 'messages' | 'categories' | 'analytics' | 'payments';
  setActiveTab: (tab: 'customers' | 'suppliers' | 'store' | 'inventory' | 'purchases' | 'orders' | 'analytics' | 'payments') => void;
  storeSubTab?: 'catalog' | 'orders' | 'settings';
  onSelectStoreSubTab?: (subTab: 'catalog' | 'orders') => void;
  storeConfig?: StoreConfig;
  inventoryCount?: number;
  customersCount?: number;
  suppliersCount?: number;
  purchasesCount?: number;
  pendingPurchasesCount?: number;
  messagesCount?: number;
  unseenProductsCount?: number;
  unseenMessagesCount?: number;
  unseenCount?: number;
  ordersCount?: number;
  pendingOrdersCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenSimulator,
  onOpenConfig,
  onOpenDeployment,
  onOpenAddProduct,
  onOpenProfile,
  activeTab,
  setActiveTab,
  storeSubTab = 'catalog',
  onSelectStoreSubTab,
  storeConfig,
  inventoryCount = 0,
  customersCount = 0,
  suppliersCount = 0,
  purchasesCount = 0,
  pendingPurchasesCount = 0,
  messagesCount = 0,
  unseenProductsCount = 0,
  unseenMessagesCount = 0,
  unseenCount = 0,
  ordersCount = 0,
  pendingOrdersCount = 0,
}) => {
  const { user, isAdmin, isOperator, logout } = useAuth();
  const totalUnseen = unseenCount > 0 ? unseenCount : unseenProductsCount;

  const handleGoToCatalog = () => {
    if (onSelectStoreSubTab) {
      onSelectStoreSubTab('catalog');
    } else {
      setActiveTab('store');
    }
  };

  const [imgError, setImgError] = React.useState(false);

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 text-slate-900 shadow-xs">
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2 sm:gap-3">
          {/* Brand & Logo Area */}
          <div className="flex items-center space-x-2 sm:space-x-2.5 shrink-0 min-w-0">
            <div 
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-indigo-600 p-0.5 shadow-sm shadow-indigo-500/15 flex items-center justify-center shrink-0 cursor-pointer hover:scale-105 transition-all overflow-hidden" 
              onClick={handleGoToCatalog}
              title="Ir al Catálogo de la Tienda"
            >
              {storeConfig?.logoUrl && !imgError ? (
                <img
                  src={storeConfig.logoUrl}
                  alt={storeConfig.storeName || 'Comerxia Logo'}
                  className="w-full h-full object-cover rounded-[10px]"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-tr from-sky-600 to-indigo-700 rounded-[10px] flex items-center justify-center text-white">
                  <Bot className="w-5 h-5" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5">
                <span 
                  className="font-black text-sm sm:text-base text-slate-900 tracking-tight cursor-pointer truncate max-w-[100px] sm:max-w-[130px] xl:max-w-[160px]" 
                  onClick={handleGoToCatalog}
                  title={storeConfig?.storeName || 'Comerxia App'}
                >
                  {storeConfig?.storeName || 'Comerxia App'}
                </span>
                <span className="hidden 2xl:inline-flex items-center px-1.5 py-0.2 rounded-md text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  Admin
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block font-medium truncate max-w-[110px] xl:max-w-[140px]">
                Gestión comercial
              </p>
            </div>
          </div>

          {/* Center Tabs - Clientes, Proveedores, Inventario, Compras, Ventas, Pagos, Tienda & Estadísticas */}
          <nav className="hidden md:flex items-center gap-1 xl:gap-1.5 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80 shadow-2xs min-w-0 max-w-full overflow-x-auto">
            {/* Tab 0: Clientes */}
            <button
              id="tab-customers"
              onClick={() => setActiveTab('customers')}
              title="Directorio y Gestión de Clientes"
              className={`px-2.5 xl:px-3.5 py-1.5 rounded-xl text-xs xl:text-[13px] font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'customers'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Clientes</span>
              <span className={`px-1.5 py-0.2 rounded-md text-[10px] xl:text-[11px] font-mono font-bold ${
                activeTab === 'customers' ? 'bg-indigo-700 text-white' : 'bg-slate-200/90 text-slate-700'
              }`}>
                {customersCount ?? 0}
              </span>
            </button>

            {/* Tab 0.5: Proveedores */}
            <button
              id="tab-suppliers"
              onClick={() => setActiveTab('suppliers')}
              title="Directorio y Gestión de Proveedores ERP"
              className={`px-2.5 xl:px-3.5 py-1.5 rounded-xl text-xs xl:text-[13px] font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'suppliers'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
              }`}
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span>Proveedores</span>
              {suppliersCount !== undefined && suppliersCount > 0 && (
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] xl:text-[11px] font-mono font-bold ${
                  activeTab === 'suppliers' ? 'bg-amber-700 text-white' : 'bg-slate-200/90 text-slate-700'
                }`}>
                  {suppliersCount}
                </span>
              )}
            </button>

            {/* Tab 1: Inventario */}
            <button
              id="tab-inventory"
              onClick={() => setActiveTab('inventory')}
              title={
                totalUnseen > 0
                  ? `¡${totalUnseen} producto(s) recién añadido(s)! Haz clic para ver el inventario`
                  : 'Inventario (0 productos recién añadidos)'
              }
              className={`px-2.5 xl:px-3.5 py-1.5 rounded-xl text-xs xl:text-[13px] font-bold transition-all flex items-center gap-1.5 cursor-pointer relative whitespace-nowrap ${
                activeTab === 'inventory' || activeTab === 'messages'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
              }`}
            >
              <Layers className="w-4 h-4 shrink-0" />
              <span>Inventario</span>
              {totalUnseen > 0 ? (
                <span
                  title={`${totalUnseen} nuevo(s) producto(s) registrado(s)`}
                  className="inline-flex items-center gap-0.5 text-[10px] xl:text-[11px] px-2 py-0.2 rounded-full bg-rose-600 text-white font-mono font-black shadow-xs ring-1 ring-rose-300 animate-pulse"
                >
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  +{totalUnseen}
                </span>
              ) : (
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] xl:text-[11px] font-mono font-bold ${
                  activeTab === 'inventory' || activeTab === 'messages' ? 'bg-sky-700 text-white' : 'bg-slate-200/90 text-slate-700'
                }`}>
                  0
                </span>
              )}
            </button>

            {/* Tab 2: Compras a Proveedores */}
            <button
              id="tab-purchases"
              onClick={() => setActiveTab('purchases')}
              title={
                pendingPurchasesCount > 0
                  ? `¡${pendingPurchasesCount} compras pendientes de pagar!`
                  : 'Compras (0 compras pendientes de pagar)'
              }
              className={`px-2.5 xl:px-3.5 py-1.5 rounded-xl text-xs xl:text-[13px] font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'purchases'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
              }`}
            >
              <Boxes className="w-4 h-4 shrink-0" />
              <span>Compras</span>
              {pendingPurchasesCount > 0 ? (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-mono font-black text-[10px] xl:text-[11px] ring-1 ring-amber-300 animate-pulse">
                  {pendingPurchasesCount}
                </span>
              ) : (
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] xl:text-[11px] font-mono font-bold ${
                  activeTab === 'purchases' ? 'bg-amber-700 text-white' : 'bg-slate-200/90 text-slate-700'
                }`}>
                  0
                </span>
              )}
            </button>

            {/* Tab 3: Ventas (Pedidos de Clientes) */}
            <button
              id="tab-sales"
              onClick={() => {
                if (onSelectStoreSubTab) {
                  onSelectStoreSubTab('orders');
                } else {
                  setActiveTab('orders');
                }
              }}
              title={
                pendingOrdersCount > 0
                  ? `¡Atención! ${pendingOrdersCount} venta(s) pendiente(s)`
                  : 'Ventas (0 ventas pendientes)'
              }
              className={`px-2.5 xl:px-3.5 py-1.5 rounded-xl text-xs xl:text-[13px] font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'orders' || (activeTab === 'store' && storeSubTab === 'orders')
                  ? 'bg-sky-600 text-white shadow-xs'
                  : pendingOrdersCount > 0
                  ? 'bg-amber-100 text-amber-950 font-extrabold border border-amber-300 hover:bg-amber-200 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
              }`}
            >
              <PackageCheck className="w-4 h-4 shrink-0" />
              <span>Ventas</span>
              {pendingOrdersCount > 0 ? (
                <span
                  className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white font-mono font-black text-[10px] xl:text-[11px] shadow-xs flex items-center gap-0.5 ring-1 ring-rose-300 animate-pulse"
                  title={`${pendingOrdersCount} venta(s) pendiente(s)`}
                >
                  <Bell className="w-3 h-3 text-amber-300" />
                  {pendingOrdersCount}
                </span>
              ) : (
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] xl:text-[11px] font-mono font-bold ${
                  activeTab === 'orders' || (activeTab === 'store' && storeSubTab === 'orders')
                    ? 'bg-sky-700 text-white'
                    : 'bg-slate-200/90 text-slate-700'
                }`}>
                  0
                </span>
              )}
            </button>

            {/* Tab 4: Pagos y Tesorería */}
            <button
              id="tab-payments"
              onClick={() => setActiveTab('payments')}
              title="Gestión de Pagos, Cobros CxC, Pagos CxP y Tesorería ERP"
              className={`px-2.5 xl:px-3.5 py-1.5 rounded-xl text-xs xl:text-[13px] font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'payments'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
              }`}
            >
              <Wallet className="w-4 h-4 shrink-0" />
              <span>Pagos</span>
            </button>

            {/* Tab 5: Tienda (Catálogo) */}
            <button
              id="tab-store"
              onClick={() => {
                if (onSelectStoreSubTab) {
                  onSelectStoreSubTab('catalog');
                } else {
                  setActiveTab('store');
                }
              }}
              title="Catálogo de la Tienda Online"
              className={`px-2.5 xl:px-3.5 py-1.5 rounded-xl text-xs xl:text-[13px] font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'store' && storeSubTab !== 'orders'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
              }`}
            >
              <Store className="w-4 h-4 shrink-0" />
              <span>Tienda</span>
              <span className={`px-1.5 py-0.2 rounded-md text-[10px] xl:text-[11px] font-mono font-bold ${
                activeTab === 'store' && storeSubTab !== 'orders'
                  ? 'bg-emerald-800 text-white'
                  : 'bg-slate-200/90 text-slate-700'
              }`}>
                {inventoryCount}
              </span>
            </button>

            {/* Tab 6: Estadísticas */}
            <button
              id="tab-analytics"
              onClick={() => setActiveTab('analytics')}
              title="Estadísticas de ventas, visitas y métricas"
              className={`px-2.5 xl:px-3.5 py-1.5 rounded-xl text-xs xl:text-[13px] font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'analytics'
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>Estadísticas</span>
            </button>
          </nav>

          {/* Action buttons - Server Config (Admin Only), User Profile & Logout */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {isAdmin && onOpenDeployment && (
              <button
                id="btn-server-deployment"
                onClick={onOpenDeployment}
                title="Configuración de Servidor (Docker, PostgreSQL, Dominios y Despliegue)"
                className="flex items-center space-x-1.5 py-1.5 px-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-xs text-sky-800 font-bold transition cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
              >
                <Server className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span className="hidden xl:inline">Servidor</span>
              </button>
            )}

            {user ? (
              <div className="flex items-center space-x-1 sm:space-x-1.5">
                <button
                  id="btn-admin-profile"
                  onClick={onOpenProfile}
                  title={isAdmin ? 'Gestionar perfil y operadores' : 'Mi perfil y contraseña'}
                  className="flex items-center space-x-1.5 py-1 px-2 sm:px-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs text-slate-800 transition cursor-pointer shadow-2xs"
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold border shrink-0 ${
                      isAdmin
                        ? 'bg-emerald-100 border-emerald-200 text-emerald-700'
                        : 'bg-sky-100 border-sky-200 text-sky-700'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <div className="hidden lg:block text-left">
                    <p className="text-[11px] font-bold text-slate-900 leading-tight truncate max-w-[80px]">
                      {user.name || (isAdmin ? 'Admin' : 'Operador')}
                    </p>
                  </div>
                </button>
                <button
                  id="btn-logout"
                  onClick={logout}
                  title="Cerrar sesión"
                  className="p-1.5 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Mobile Navigation Bar (Clean Responsive Segmented Control) */}
        <div className="flex items-center md:hidden py-2 gap-1.5 border-t border-slate-100 overflow-x-auto">
          <button
            onClick={() => setActiveTab('customers')}
            className={`py-2 px-3 shrink-0 text-center rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer relative whitespace-nowrap ${
              activeTab === 'customers'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-700 bg-white hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>Clientes</span>
            {customersCount !== undefined && (
              <span className={`px-1.5 py-0.2 rounded-md font-mono font-bold text-[10px] ${
                activeTab === 'customers' ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {customersCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`py-2 px-3 shrink-0 text-center rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer relative whitespace-nowrap ${
              activeTab === 'suppliers'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-700 bg-white hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span>Proveedores</span>
            {suppliersCount !== undefined && suppliersCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-md font-mono font-bold text-[10px] ${
                activeTab === 'suppliers' ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {suppliersCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`py-2 px-3 shrink-0 text-center rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer relative whitespace-nowrap ${
              activeTab === 'inventory' || activeTab === 'messages'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-700 bg-white hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>Inventario</span>
            {totalUnseen > 0 ? (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-600 text-white font-mono font-black animate-pulse">
                +{totalUnseen}
              </span>
            ) : (
              <span className={`px-1.5 py-0.2 rounded-md font-mono font-bold text-[10px] ${
                activeTab === 'inventory' || activeTab === 'messages' ? 'bg-sky-700 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {inventoryCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('purchases')}
            className={`py-2 px-3 shrink-0 text-center rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer relative whitespace-nowrap ${
              activeTab === 'purchases'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-700 bg-white hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <Boxes className="w-4 h-4 shrink-0" />
            <span>Compras</span>
            {pendingPurchasesCount > 0 ? (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-mono font-black">
                {pendingPurchasesCount}
              </span>
            ) : (
              <span className={`px-1.5 py-0.2 rounded-md font-mono font-bold text-[10px] ${
                activeTab === 'purchases' ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {purchasesCount}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              if (onSelectStoreSubTab) {
                onSelectStoreSubTab('orders');
              } else {
                setActiveTab('orders');
              }
            }}
            className={`py-2 px-3 shrink-0 text-center rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer relative whitespace-nowrap ${
              activeTab === 'orders' || (activeTab === 'store' && storeSubTab === 'orders')
                ? 'bg-sky-600 text-white shadow-xs'
                : pendingOrdersCount > 0
                ? 'bg-amber-100 text-amber-950 font-bold border border-amber-300'
                : 'text-slate-700 bg-white hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <PackageCheck className="w-4 h-4 shrink-0" />
            <span>Ventas</span>
            {pendingOrdersCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white font-black text-[10px] shadow-xs">
                {pendingOrdersCount}
              </span>
            ) : (
              <span className={`px-1.5 py-0.2 rounded-md font-mono font-bold text-[10px] ${
                activeTab === 'orders' || (activeTab === 'store' && storeSubTab === 'orders')
                  ? 'bg-sky-700 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}>
                {ordersCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`py-2 px-3 shrink-0 text-center rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'payments'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-700 bg-white hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <Wallet className="w-4 h-4 shrink-0" />
            <span>Pagos</span>
          </button>
          <button
            onClick={() => {
              if (onSelectStoreSubTab) {
                onSelectStoreSubTab('catalog');
              } else {
                setActiveTab('store');
              }
            }}
            className={`py-2 px-3 shrink-0 text-center rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'store' && storeSubTab !== 'orders'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-700 bg-white hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <Store className="w-4 h-4 shrink-0" />
            <span>Tienda</span>
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`py-2 px-3 shrink-0 text-center rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'analytics'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-700 bg-white hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span>Métricas</span>
          </button>
        </div>
      </div>
    </header>
  );
};


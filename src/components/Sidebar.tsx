import React, { useState, useEffect } from 'react';
import {
  Bot,
  Box,
  Boxes,
  Building2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Layers,
  LogOut,
  Package,
  PackageCheck,
  Plus,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  User as UserIcon,
  Users,
  Wallet,
  X,
  Bell,
  BarChart3,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { StoreConfig } from '../types.ts';
import { safeLocalStorage } from '../utils/safeStorage.ts';

export interface SidebarProps {
  activeTab: 'customers' | 'suppliers' | 'store' | 'inventory' | 'purchases' | 'orders' | 'analytics' | 'payments' | 'messages' | 'categories';
  setActiveTab: (tab: 'customers' | 'suppliers' | 'store' | 'inventory' | 'purchases' | 'orders' | 'analytics' | 'payments') => void;
  storeSubTab?: 'catalog' | 'orders' | 'settings';
  onSelectStoreSubTab?: (subTab: 'catalog' | 'orders') => void;
  storeConfig?: StoreConfig;
  inventoryCount?: number;
  customersCount?: number;
  suppliersCount?: number;
  purchasesCount?: number;
  pendingPurchasesCount?: number;
  unpaidPurchasesCount?: number;
  ordersCount?: number;
  pendingOrdersCount?: number;
  unseenProductsCount?: number;
  unseenCount?: number;
  onOpenAddProduct?: () => void;
  onOpenSimulator?: () => void;
  onOpenDeployment?: () => void;
  onOpenProfile?: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
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
  unpaidPurchasesCount,
  ordersCount = 0,
  pendingOrdersCount = 0,
  unseenProductsCount = 0,
  unseenCount = 0,
  onOpenAddProduct,
  onOpenSimulator,
  onOpenDeployment,
  onOpenProfile,
  isOpenMobile = false,
  onCloseMobile,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const { user, isAdmin, logout } = useAuth();
  const [imgError, setImgError] = useState(false);
  const totalUnseen = unseenCount > 0 ? unseenCount : unseenProductsCount;
  const unpaidPurchases = unpaidPurchasesCount !== undefined ? unpaidPurchasesCount : pendingPurchasesCount;

  const handleNavClick = (action: () => void) => {
    action();
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const navItems = [
    {
      group: 'OPERACIONES',
      items: [
        {
          id: 'tab-inventory',
          label: 'Inventario',
          shortLabel: 'Inventario',
          icon: Layers,
          isActive: activeTab === 'inventory' || activeTab === 'messages',
          onClick: () => setActiveTab('inventory'),
          title: totalUnseen > 0 ? `¡${totalUnseen} producto(s) recién añadido(s)!` : 'Inventario (0 productos nuevos)',
          badge: totalUnseen > 0 ? `+${totalUnseen}` : 0,
          isHighlight: totalUnseen > 0,
          highlightIcon: totalUnseen > 0 ? Sparkles : undefined,
          badgeColor: totalUnseen > 0 ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-100 text-slate-600',
          activeColor: 'bg-sky-600 text-white shadow-sm shadow-sky-600/20',
          activeIconColor: 'text-white',
          hoverColor: 'hover:bg-sky-50 text-slate-700 hover:text-sky-700',
        },
        {
          id: 'tab-sales',
          label: 'Ventas (Pedidos)',
          shortLabel: 'Ventas',
          icon: PackageCheck,
          isActive: activeTab === 'orders' || (activeTab === 'store' && storeSubTab === 'orders'),
          onClick: () => {
            if (onSelectStoreSubTab) {
              onSelectStoreSubTab('orders');
            } else {
              setActiveTab('orders');
            }
          },
          title: pendingOrdersCount > 0 ? `¡${pendingOrdersCount} venta(s) pendiente(s)!` : 'Ventas (0 ventas pendientes)',
          badge: pendingOrdersCount,
          isHighlight: pendingOrdersCount > 0,
          highlightIcon: Bell,
          badgeColor: pendingOrdersCount > 0 ? 'bg-amber-500 text-white animate-pulse' : 'bg-slate-100 text-slate-600',
          activeColor: 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20',
          activeIconColor: 'text-white',
          hoverColor: pendingOrdersCount > 0 ? 'bg-amber-50 text-amber-900 font-bold' : 'hover:bg-indigo-50 text-slate-700 hover:text-indigo-700',
        },
        {
          id: 'tab-purchases',
          label: 'Compras Proveedor',
          shortLabel: 'Compras',
          icon: Boxes,
          isActive: activeTab === 'purchases',
          onClick: () => setActiveTab('purchases'),
          title: unpaidPurchases > 0 ? `¡${unpaidPurchases} compra(s) pendiente(s) de pagar!` : 'Compras (0 compras pendientes de pagar)',
          badge: unpaidPurchases,
          isHighlight: unpaidPurchases > 0,
          badgeColor: unpaidPurchases > 0 ? 'bg-amber-500 text-white animate-pulse' : 'bg-slate-100 text-slate-600',
          activeColor: 'bg-amber-600 text-white shadow-sm shadow-amber-600/20',
          activeIconColor: 'text-white',
          hoverColor: 'hover:bg-amber-50 text-slate-700 hover:text-amber-800',
        },
        {
          id: 'tab-payments',
          label: 'Pagos y Tesorería',
          shortLabel: 'Pagos',
          icon: Wallet,
          isActive: activeTab === 'payments',
          onClick: () => setActiveTab('payments'),
          badge: null,
          isHighlight: false,
          badgeColor: '',
          activeColor: 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20',
          activeIconColor: 'text-white',
          hoverColor: 'hover:bg-emerald-50 text-slate-700 hover:text-emerald-800',
        },
      ],
    },
    {
      group: 'DIRECTORIO & CRM',
      items: [
        {
          id: 'tab-customers',
          label: 'Clientes',
          shortLabel: 'Clientes',
          icon: Users,
          isActive: activeTab === 'customers',
          onClick: () => setActiveTab('customers'),
          badge: customersCount ?? 0,
          isHighlight: false,
          badgeColor: 'bg-slate-200 text-slate-700',
          activeColor: 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20',
          activeIconColor: 'text-white',
          hoverColor: 'hover:bg-indigo-50 text-slate-700 hover:text-indigo-800',
        },
        {
          id: 'tab-suppliers',
          label: 'Proveedores',
          shortLabel: 'Proveedores',
          icon: Building2,
          isActive: activeTab === 'suppliers',
          onClick: () => setActiveTab('suppliers'),
          badge: suppliersCount ?? 0,
          isHighlight: false,
          badgeColor: 'bg-slate-200 text-slate-700',
          activeColor: 'bg-amber-600 text-white shadow-sm shadow-amber-600/20',
          activeIconColor: 'text-white',
          hoverColor: 'hover:bg-amber-50 text-slate-700 hover:text-amber-800',
        },
      ],
    },
    {
      group: 'CANALES Y ANÁLISIS',
      items: [
        {
          id: 'tab-store',
          label: 'Tienda Online',
          shortLabel: 'Tienda',
          icon: Store,
          isActive: activeTab === 'store' && storeSubTab !== 'orders',
          onClick: () => {
            if (onSelectStoreSubTab) {
              onSelectStoreSubTab('catalog');
            } else {
              setActiveTab('store');
            }
          },
          badge: inventoryCount,
          isHighlight: false,
          badgeColor: 'bg-slate-200 text-slate-700',
          activeColor: 'bg-emerald-700 text-white shadow-sm shadow-emerald-700/20',
          activeIconColor: 'text-white',
          hoverColor: 'hover:bg-emerald-50 text-slate-700 hover:text-emerald-800',
        },
        {
          id: 'tab-analytics',
          label: 'Métricas y Reportes',
          shortLabel: 'Métricas',
          icon: BarChart3,
          isActive: activeTab === 'analytics',
          onClick: () => setActiveTab('analytics'),
          badge: null,
          isHighlight: false,
          badgeColor: '',
          activeColor: 'bg-violet-600 text-white shadow-sm shadow-violet-600/20',
          activeIconColor: 'text-white',
          hoverColor: 'hover:bg-violet-50 text-slate-700 hover:text-violet-800',
        },
      ],
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white text-slate-900 border-r border-slate-200 select-none">
      {/* Brand Header */}
      <div className={`flex items-center ${isCollapsed ? 'justify-center px-2 py-4' : 'justify-between px-4 py-4'} border-b border-slate-100 shrink-0`}>
        <div 
          className="flex items-center gap-3 cursor-pointer group min-w-0"
          onClick={() => handleNavClick(() => {
            if (onSelectStoreSubTab) onSelectStoreSubTab('catalog');
            else setActiveTab('store');
          })}
          title="Ver Catálogo de Tienda"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-indigo-600 p-0.5 shadow-xs shadow-indigo-500/15 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform overflow-hidden">
            {storeConfig?.logoUrl && !imgError ? (
              <img
                src={storeConfig.logoUrl}
                alt={storeConfig.storeName || 'Logo'}
                className="w-full h-full object-cover rounded-[10px]"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-tr from-sky-600 to-indigo-700 rounded-[10px] flex items-center justify-center text-white">
                <Bot className="w-5 h-5" />
              </div>
            )}
          </div>

          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="font-extrabold text-sm text-slate-900 tracking-tight truncate leading-tight">
                  {storeConfig?.storeName || 'Comerxia ERP'}
                </h1>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100 shrink-0" />
                <span className="text-[11px] font-semibold text-slate-500 truncate">
                  Gestión Comercial
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Close Button / Desktop Toggle Collapse Button */}
        {isOpenMobile ? (
          <button
            onClick={onCloseMobile}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer md:hidden active:scale-95"
            title="Cerrar Menú"
            aria-label="Cerrar Menú"
          >
            <X className="w-5 h-5" />
          </button>
        ) : onToggleCollapse ? (
          <button
            onClick={onToggleCollapse}
            className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            title={isCollapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        ) : null}
      </div>

      {/* Mobile Quick Action Banner */}
      {isOpenMobile && onOpenAddProduct && (
        <div className="px-3 pt-3 pb-1 md:hidden">
          <button
            type="button"
            onClick={() => handleNavClick(onOpenAddProduct)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-98 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Crear Nuevo Producto</span>
          </button>
        </div>
      )}

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {navItems.map((section, idx) => (
          <div key={idx} className="space-y-1">
            {!isCollapsed && (
              <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                {section.group}
              </div>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const IconComponent = item.icon;
                const HighlightIcon = item.highlightIcon;

                return (
                  <button
                    key={item.id}
                    id={item.id}
                    onClick={() => handleNavClick(item.onClick)}
                    title={item.title || item.label}
                    className={`w-full flex items-center ${
                      isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2.5'
                    } rounded-xl text-xs font-bold transition-all cursor-pointer relative group ${
                      item.isActive ? item.activeColor : item.hoverColor
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`shrink-0 ${item.isActive ? item.activeIconColor : 'text-slate-500 group-hover:text-slate-800'}`}>
                        <IconComponent className="w-4 h-4" />
                      </div>
                      {!isCollapsed && (
                        <span className="truncate leading-none">
                          {item.label}
                        </span>
                      )}
                    </div>

                    {/* Badge */}
                    {item.badge !== null && item.badge !== undefined && (
                      <div className={isCollapsed ? 'absolute -top-1 -right-1' : ''}>
                        {isCollapsed ? (
                          typeof item.badge === 'number' && item.badge > 0 ? (
                            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-mono font-black ${
                              item.isHighlight ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-200 text-slate-800'
                            }`}>
                              {item.badge > 99 ? '99+' : item.badge}
                            </span>
                          ) : typeof item.badge === 'string' ? (
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse ring-2 ring-white" />
                          ) : null
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1 leading-tight ${
                              item.isActive
                                ? 'bg-white/20 text-white'
                                : item.isHighlight
                                ? item.badgeColor
                                : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200/80'
                            }`}
                          >
                            {HighlightIcon && <HighlightIcon className="w-2.5 h-2.5 shrink-0" />}
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Quick Tools & Utilities */}
        <div className="pt-2 border-t border-slate-100 space-y-1">
          {!isCollapsed && (
            <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              HERRAMIENTAS ERP
            </div>
          )}

          {isAdmin && onOpenDeployment && (
            <button
              id="sidebar-btn-deployment"
              onClick={() => handleNavClick(onOpenDeployment)}
              title="Configuración de Servidor, Base de Datos y Dominios"
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center p-2.5' : 'justify-start gap-3 px-3 py-2.5'
              } rounded-xl text-xs font-bold text-slate-700 hover:text-indigo-700 hover:bg-indigo-50 transition cursor-pointer`}
            >
              <Server className="w-4 h-4 text-indigo-600 shrink-0" />
              {!isCollapsed && <span>Servidor & BD</span>}
            </button>
          )}
        </div>
      </div>

      {/* User Footer Profile */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/70 shrink-0">
        {user ? (
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between gap-2'}`}>
            <div
              className={`flex items-center gap-2.5 min-w-0 cursor-pointer hover:opacity-80 transition ${isCollapsed ? '' : 'flex-1'}`}
              onClick={onOpenProfile}
              title={isAdmin ? 'Gestionar perfil de Administrador' : 'Mi perfil de Operador'}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                  isAdmin
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    : 'bg-sky-100 text-sky-700 border border-sky-200'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
              </div>

              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 truncate leading-tight">
                    {user.name || (isAdmin ? 'Administrador' : 'Operador')}
                  </p>
                  <p className="text-[10px] font-semibold text-slate-500 truncate mt-0.5">
                    {isAdmin ? 'Super Admin' : 'Operador ERP'}
                  </p>
                </div>
              )}
            </div>

            {!isCollapsed && (
              <div className="flex items-center gap-1 shrink-0">
                {onOpenProfile && (
                  <button
                    onClick={onOpenProfile}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition cursor-pointer"
                    title="Configuración de Perfil"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  id="sidebar-btn-logout"
                  onClick={logout}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                  title="Cerrar Sesión"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ) : (
          !isCollapsed && (
            <div className="text-center text-[11px] text-slate-500 font-medium">
              Comerxia ERP v2.0
            </div>
          )
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Left Vertical Sidebar */}
      <aside
        className={`hidden md:block fixed inset-y-0 left-0 z-30 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Slide-out Drawer with Backdrop */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative w-4/5 max-w-xs h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};

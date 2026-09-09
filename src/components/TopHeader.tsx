import React, { useState, useEffect } from 'react';
import {
  Menu,
  Plus,
  Send,
  Server,
  Store,
  ExternalLink,
  ShieldCheck,
  LogOut,
  Layers,
  PackageCheck,
  Boxes,
  Wallet,
  Users,
  Building2,
  BarChart3,
  Sparkles,
  Bell,
  RefreshCw,
  Search,
  Bot,
  Calendar,
  Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { StoreConfig } from '../types.ts';

export interface TopHeaderProps {
  activeTab: 'customers' | 'suppliers' | 'store' | 'inventory' | 'purchases' | 'orders' | 'analytics' | 'payments' | 'messages' | 'categories';
  storeSubTab?: 'catalog' | 'orders' | 'settings';
  onOpenMobileSidebar: () => void;
  onOpenAddProduct?: () => void;
  onOpenSimulator?: () => void;
  onOpenDeployment?: () => void;
  onOpenProfile?: () => void;
  onRefreshData?: () => void;
  onGoToStore?: () => void;
  onOpenBotConfig?: () => void;
  onOpenAiConfig?: () => void;
  storeConfig?: StoreConfig;
  pendingOrdersCount?: number;
  pendingPurchasesCount?: number;
  unseenProductsCount?: number;
  botActive?: boolean;
  botHasToken?: boolean;
  botUsername?: string | null;
  botFirstName?: string | null;
  botSupplierName?: string | null;
  aiActive?: boolean;
  aiHasKey?: boolean;
  aiAccountEmail?: string | null;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  storeSubTab = 'catalog',
  onOpenMobileSidebar,
  onOpenAddProduct,
  onOpenSimulator,
  onOpenDeployment,
  onOpenProfile,
  onRefreshData,
  onGoToStore,
  onOpenBotConfig,
  onOpenAiConfig,
  storeConfig,
  pendingOrdersCount = 0,
  pendingPurchasesCount = 0,
  unseenProductsCount = 0,
  botActive = false,
  botHasToken = false,
  botUsername = null,
  botFirstName = null,
  botSupplierName = null,
  aiActive = false,
  aiHasKey = false,
  aiAccountEmail = null,
}) => {
  const { user, isAdmin, logout } = useAuth();

  // Reloj en tiempo real (Fecha y Hora actual solo lectura)
  const [currentDateTime, setCurrentDateTime] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = currentDateTime.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const formattedTime = currentDateTime.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const botDisplayHandle = botUsername
    ? `@${botUsername.replace(/^@/, '')}`
    : botFirstName || botSupplierName || 'Bot Telegram';

  const aiAccountDisplay = aiAccountEmail || 'Cuenta Principal';

  // Soporte de deslizamiento horizontal táctil y con puntero (Swipe con el dedo fluido sin barras de scroll visibles)
  const infoBarRef = React.useRef<HTMLDivElement>(null);
  const [isPointerDragging, setIsPointerDragging] = useState(false);
  const pointerStartXRef = React.useRef(0);
  const pointerScrollLeftRef = React.useRef(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!infoBarRef.current) return;
    setIsPointerDragging(true);
    pointerStartXRef.current = e.pageX - infoBarRef.current.offsetLeft;
    pointerScrollLeftRef.current = infoBarRef.current.scrollLeft;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDragging || !infoBarRef.current) return;
    e.preventDefault();
    const x = e.pageX - infoBarRef.current.offsetLeft;
    const walk = (x - pointerStartXRef.current) * 1.4; // Multiplicador de fluidez táctil
    infoBarRef.current.scrollLeft = pointerScrollLeftRef.current - walk;
  };

  const handlePointerUpOrLeave = () => {
    setIsPointerDragging(false);
  };

  // Determine section details based on activeTab
  const getSectionInfo = () => {
    switch (activeTab) {
      case 'inventory':
      case 'messages':
        return {
          title: 'Inventario de Productos',
          subtitle: 'Catálogo de existencias, control de stock y recepción por Telegram',
          icon: Layers,
          color: 'text-sky-600',
          bg: 'bg-sky-50 border-sky-200',
        };
      case 'orders':
        return {
          title: 'Ventas y Pedidos',
          subtitle: 'Gestión de órdenes de compra de clientes, estados de envío y facturación',
          icon: PackageCheck,
          color: 'text-indigo-600',
          bg: 'bg-indigo-50 border-indigo-200',
        };
      case 'purchases':
        return {
          title: 'Compras a Proveedores',
          subtitle: 'Órdenes de abastecimiento, recepción parcial y costos de inventario',
          icon: Boxes,
          color: 'text-amber-600',
          bg: 'bg-amber-50 border-amber-200',
        };
      case 'payments':
        return {
          title: 'Pagos y Tesorería',
          subtitle: 'Cuentas por cobrar (CxC), cuentas por pagar (CxP) y balance de caja',
          icon: Wallet,
          color: 'text-emerald-600',
          bg: 'bg-emerald-50 border-emerald-200',
        };
      case 'customers':
        return {
          title: 'Directorio de Clientes',
          subtitle: 'CRM de clientes, historial de compras, saldos y contacto directo',
          icon: Users,
          color: 'text-indigo-600',
          bg: 'bg-indigo-50 border-indigo-200',
        };
      case 'suppliers':
        return {
          title: 'Directorio de Proveedores',
          subtitle: 'Gestión de proveedores, condiciones comerciales y catálogo de compras',
          icon: Building2,
          color: 'text-amber-600',
          bg: 'bg-amber-50 border-amber-200',
        };
      case 'store':
        return {
          title: storeSubTab === 'orders' ? 'Ventas y Pedidos' : 'Tienda Online',
          subtitle: storeSubTab === 'orders' ? 'Gestión de órdenes de la tienda' : 'Vista previa y catálogo digital de productos para clientes',
          icon: storeSubTab === 'orders' ? PackageCheck : Store,
          color: 'text-emerald-700',
          bg: 'bg-emerald-50 border-emerald-200',
        };
      case 'analytics':
        return {
          title: 'Estadísticas y Métricas',
          subtitle: 'Reportes de ventas, rotación de inventario, ganancias y proyecciones',
          icon: BarChart3,
          color: 'text-violet-600',
          bg: 'bg-violet-50 border-violet-200',
        };
      default:
        return {
          title: 'Comerxia ERP',
          subtitle: 'Sistema integral de gestión comercial y control de inventario',
          icon: Layers,
          color: 'text-slate-700',
          bg: 'bg-slate-50 border-slate-200',
        };
    }
  };

  const section = getSectionInfo();
  const IconComponent = section.icon;

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs w-full">
      <div className="w-full px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2 sm:gap-3">
          {/* Left: Mobile Toggle & Page Title */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 min-w-0">
            <button
              id="top-header-mobile-toggle"
              onClick={onOpenMobileSidebar}
              className="p-2 -ml-1 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer md:hidden shrink-0"
              title="Abrir Menú de Navegación"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className={`hidden sm:flex w-9 h-9 rounded-xl ${section.bg} border items-center justify-center shrink-0`}>
                <IconComponent className={`w-5 h-5 ${section.color}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h1 className="font-extrabold text-slate-900 text-xs sm:text-base tracking-tight truncate leading-tight">
                    {section.title}
                  </h1>
                  {activeTab === 'orders' && pendingOrdersCount > 0 && (
                    <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                      <Bell className="w-2.5 h-2.5" />
                      {pendingOrdersCount} pendiente(s)
                    </span>
                  )}
                  {activeTab === 'inventory' && unseenProductsCount > 0 && (
                    <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                      <Sparkles className="w-2.5 h-2.5 text-rose-500" />
                      {unseenProductsCount} nuevo(s)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 hidden md:block font-medium truncate mt-0.5">
                  {section.subtitle}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Fecha y Hora (Solo Lectura) + Bot & AI Passive Status Indicators */}
          {/* En modo celular: barra deslizable con el dedo de forma horizontal suave y sin barra de scroll visible */}
          <div
            ref={infoBarRef}
            id="top-header-info-bar"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUpOrLeave}
            onPointerLeave={handlePointerUpOrLeave}
            className={`flex items-center gap-2 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] py-1 shrink min-w-0 max-w-[calc(100vw-100px)] sm:max-w-none touch-pan-x select-none ${
              isPointerDragging ? 'cursor-grabbing' : 'cursor-grab sm:cursor-default'
            }`}
            style={{
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorX: 'contain',
              touchAction: 'pan-y pan-x',
            }}
          >
            {/* Fecha y Hora Actual (Solo Lectura) */}
            <div
              id="top-header-datetime-badge"
              title="Fecha y hora actual del sistema (Solo lectura)"
              className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl border border-slate-200/90 bg-slate-50/90 text-slate-700 text-xs font-semibold select-none cursor-default shadow-2xs shrink-0 whitespace-nowrap"
            >
              <div className="flex items-center gap-1 text-slate-700">
                <Calendar className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span className="capitalize text-slate-800 hidden lg:inline">{formattedDate}</span>
                <span className="capitalize text-slate-800 lg:hidden inline">
                  {currentDateTime.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
              </div>
              <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="font-mono font-bold text-slate-900 text-xs tracking-tight">
                  {formattedTime}
                </span>
              </div>
            </div>

            {/* Telegram Bot Status Indicator (Clickable to open configuration) */}
            <div
              id="top-header-bot-indicator"
              onClick={onOpenBotConfig}
              title={
                botHasToken
                  ? botActive
                    ? `Bot de Telegram: Activo • Nombre: ${botDisplayHandle} (Clic para configurar)`
                    : `Bot de Telegram: En pausa • Nombre: ${botDisplayHandle} (Clic para configurar)`
                  : 'Bot de Telegram: Inactivo (Clic para configurar Token)'
              }
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs select-none cursor-pointer hover:scale-[1.02] active:scale-95 shadow-2xs transition shrink-0 whitespace-nowrap ${
                botHasToken
                  ? botActive
                    ? 'bg-emerald-50/90 hover:bg-emerald-100 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50/90 hover:bg-amber-100 border-amber-200 text-amber-900'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
              }`}
            >
              <Bot
                className={`w-3.5 h-3.5 shrink-0 ${
                  botHasToken
                    ? botActive
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                    : 'text-slate-400'
                }`}
              />
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  botHasToken
                    ? botActive
                      ? 'bg-emerald-500 animate-pulse'
                      : 'bg-amber-500'
                    : 'bg-slate-400'
                }`}
              />
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-bold text-[11px] uppercase tracking-wide opacity-75 hidden sm:inline">
                  Bot:
                </span>
                <span className="font-semibold text-xs whitespace-nowrap">
                  {botHasToken ? (botActive ? 'Activo' : 'Pausado') : 'Inactivo'}
                </span>
                {botHasToken && (
                  <>
                    <span className="opacity-40 text-xs hidden sm:inline">•</span>
                    <span
                      className="font-bold text-xs max-w-[90px] sm:max-w-[130px] truncate"
                      title={botDisplayHandle}
                    >
                      {botDisplayHandle}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Google Gemini AI Status Indicator (Clickable to open configuration) */}
            <div
              id="top-header-ai-indicator"
              onClick={onOpenAiConfig}
              title={
                aiHasKey
                  ? aiActive
                    ? `Google Gemini IA: Activa • Cuenta: ${aiAccountDisplay} (Clic para configurar)`
                    : `Google Gemini IA: En pausa • Cuenta: ${aiAccountDisplay} (Clic para configurar)`
                  : 'Google Gemini IA: Inactiva (Clic para configurar API Key)'
              }
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs select-none cursor-pointer hover:scale-[1.02] active:scale-95 shadow-2xs transition shrink-0 whitespace-nowrap ${
                aiHasKey
                  ? aiActive
                    ? 'bg-purple-50/90 hover:bg-purple-100 border-purple-200 text-purple-900'
                    : 'bg-amber-50/90 hover:bg-amber-100 border-amber-200 text-amber-900'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
              }`}
            >
              <Sparkles
                className={`w-3.5 h-3.5 shrink-0 ${
                  aiHasKey
                    ? aiActive
                      ? 'text-purple-600'
                      : 'text-amber-600'
                    : 'text-slate-400'
                }`}
              />
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  aiHasKey
                    ? aiActive
                      ? 'bg-purple-500 animate-pulse'
                      : 'bg-amber-500'
                    : 'bg-slate-400'
                }`}
              />
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-bold text-[11px] uppercase tracking-wide opacity-75 hidden sm:inline">
                  IA:
                </span>
                <span className="font-semibold text-xs whitespace-nowrap">
                  {aiHasKey ? (aiActive ? 'Activa' : 'Pausada') : 'Inactiva'}
                </span>
                {aiHasKey && (
                  <>
                    <span className="opacity-40 text-xs hidden sm:inline">•</span>
                    <span
                      className="font-bold text-xs max-w-[100px] sm:max-w-[150px] md:max-w-[190px] truncate"
                      title={aiAccountDisplay}
                    >
                      {aiAccountDisplay}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

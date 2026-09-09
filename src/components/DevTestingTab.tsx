import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle2,
  Database,
  Flame,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Terminal,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  Building2,
  Send,
  Sliders,
  CheckCheck,
  Server,
  FileSpreadsheet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

export type CleanActionType =
  | 'orders'
  | 'purchases'
  | 'payments'
  | 'products'
  | 'customers'
  | 'suppliers'
  | 'reset_customer_balances'
  | 'reset_supplier_balances'
  | 'telegram'
  | 'analytics'
  | 'reset_stock'
  | 'all_transactions'
  | 'reset_all'
  | 'reset_all_with_products';

interface DevTestingTabProps {
  onSuccess?: () => void;
}

interface DevStats {
  ordersCount: number;
  purchasesCount: number;
  customersCount: number;
  suppliersCount: number;
  paymentsCount: number;
  messagesCount: number;
  analyticsCount: number;
  productsCount: number;
  totalStockUnits: number;
  pendingOrdersCount?: number;
  pendingPurchasesCount?: number;
}

export const DevTestingTab: React.FC<DevTestingTabProps> = ({ onSuccess }) => {
  const { authFetch } = useAuth();

  const [activeDevSection, setActiveDevSection] = useState<'cleaner' | 'seeder' | 'diagnostics'>('cleaner');

  const [stats, setStats] = useState<DevStats | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(false);

  const [selectedAction, setSelectedAction] = useState<CleanActionType>('all_transactions');
  const [targetStockQuantity, setTargetStockQuantity] = useState<number>(10);
  const [confirmed, setConfirmed] = useState<boolean>(false);

  const [isCleaning, setIsCleaning] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch real-time dev stats
  const fetchStats = async () => {
    try {
      setLoadingStats(true);
      const res = await authFetch('/api/admin/dev-stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Failed to load dev stats:', e);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleExecuteClean = async () => {
    if (!confirmed) return;
    setIsCleaning(true);
    setResultMessage(null);
    setErrorMessage(null);

    try {
      const res = await authFetch('/api/admin/clean-test-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: selectedAction,
          targetStockQuantity: Number(targetStockQuantity) || 0,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setResultMessage(data.message || 'Limpieza de datos de prueba completada con éxito.');
        setConfirmed(false);
        await fetchStats();
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setErrorMessage(data.error || 'No se pudo realizar la limpieza de datos.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error de conexión con el servidor al limpiar registros.');
    } finally {
      setIsCleaning(false);
    }
  };

  const handleExecuteSeed = async (seedType: 'all' | 'orders' | 'purchases' | 'contacts') => {
    setIsSeeding(true);
    setResultMessage(null);
    setErrorMessage(null);

    try {
      const body: any = {};
      if (seedType === 'all') {
        body.seedOrders = true;
        body.seedPurchases = true;
        body.seedCustomers = true;
        body.seedSuppliers = true;
        body.seedPayments = true;
      } else if (seedType === 'orders') {
        body.seedOrders = true;
        body.seedPurchases = false;
        body.seedCustomers = true;
        body.seedSuppliers = false;
      } else if (seedType === 'purchases') {
        body.seedOrders = false;
        body.seedPurchases = true;
        body.seedCustomers = false;
        body.seedSuppliers = true;
      } else if (seedType === 'contacts') {
        body.seedOrders = false;
        body.seedPurchases = false;
        body.seedCustomers = true;
        body.seedSuppliers = true;
      }

      const res = await authFetch('/api/admin/seed-test-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setResultMessage(data.message || 'Datos de prueba simulados con éxito.');
        await fetchStats();
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setErrorMessage(data.error || 'No se pudo generar los datos de prueba.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al comunicarse con el generador de pruebas.');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSyncTreasury = async () => {
    setIsSyncing(true);
    setResultMessage(null);
    setErrorMessage(null);

    try {
      const res = await authFetch('/api/payments/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResultMessage(`✓ Tesorería sincronizada: ${data.syncedInflows} cobros de pedidos y ${data.syncedOutflows} pagos a proveedores conciliados en el libro mayor.`);
        await fetchStats();
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setErrorMessage(data.error || 'Error al sincronizar tesorería.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error de conexión.');
    } finally {
      setIsSyncing(false);
    }
  };

  const actionOptions: {
    id: CleanActionType;
    title: string;
    icon: any;
    color: string;
    badge: string;
    description: string;
    preserves: string;
    countLabel?: string;
  }[] = [
    {
      id: 'all_transactions',
      title: 'Limpieza Integral de Ciclo de Pruebas (Recomendado)',
      icon: Sparkles,
      color: 'emerald',
      badge: 'Modo Sandbox',
      description:
        'Vacía todas las Órdenes de Clientes + Compras a Proveedores + Tesorería/Pagos + Métricas de Visitas y resetea a cero los balances acumulados de clientes y proveedores. Consecutivos regresan a #PED-001 y #COM-001.',
      preserves: 'Conserva el 100% de los productos de tu catálogo, imágenes, configuraciones y usuarios.',
      countLabel: stats
        ? `${stats.ordersCount} pedidos, ${stats.purchasesCount} compras y ${stats.paymentsCount} pagos`
        : undefined,
    },
    {
      id: 'orders',
      title: 'Vaciar solo Pedidos de Clientes (Ventas Tienda)',
      icon: ShoppingBag,
      color: 'sky',
      badge: 'Consecutivo #PED-001',
      description:
        'Elimina todos los pedidos recibidos en la tienda digital y desvincula las compras asociadas. Reinicia el contador a #PED-001 y resetea balances de clientes.',
      preserves: 'Conserva el catálogo de productos y tus clientes registrados.',
      countLabel: stats ? `${stats.ordersCount} pedidos registrados` : undefined,
    },
    {
      id: 'purchases',
      title: 'Vaciar solo Compras y Abastecimiento a Proveedores',
      icon: Boxes,
      color: 'indigo',
      badge: 'Consecutivo #COM-001',
      description:
        'Elimina todas las órdenes de compra emitidas a proveedores y recepciones parciales. Reinicia el contador a #COM-001 y resetea compras de proveedores.',
      preserves: 'Conserva tus productos y cantidades de stock actuales.',
      countLabel: stats ? `${stats.purchasesCount} compras registradas` : undefined,
    },
    {
      id: 'payments',
      title: 'Vaciar solo Tesorería, Cobros y Pagos (Libro Mayor)',
      icon: Wallet,
      color: 'teal',
      badge: 'Flujo de Caja',
      description:
        'Elimina el registro de movimientos de cobros CxC, pagos a proveedores CxP, gastos operativos y notas de crédito. Reinicia balances a $0.00.',
      preserves: 'Conserva tus pedidos, compras y catálogo.',
      countLabel: stats ? `${stats.paymentsCount} movimientos contables` : undefined,
    },
    {
      id: 'products',
      title: 'Vaciar solo Catálogo de Productos (Eliminar todos los artículos)',
      icon: Trash2,
      color: 'rose',
      badge: 'Borrar Productos',
      description:
        'Elimina el 100% de los productos, variantes, fotos y códigos SKU del catálogo de inventario. Deja el catálogo completamente vacío para cargar inventario nuevo desde cero.',
      preserves: 'Conserva tus clientes del CRM, proveedores y usuarios administradores.',
      countLabel: stats ? `${stats.productsCount} productos registrados` : undefined,
    },
    {
      id: 'reset_stock',
      title: 'Ajustar / Reiniciar Stock en Todo el Catálogo',
      icon: Layers,
      color: 'amber',
      badge: 'Inventario Físico',
      description:
        'Establece una cantidad fija de stock físico (ej. 0 unidades para agotar o 10/20 unidades para pruebas) en todos los productos sin borrar los artículos.',
      preserves: 'Conserva todos los productos, fotos, precios y descripciones.',
      countLabel: stats ? `${stats.totalStockUnits} unidades en ${stats.productsCount} productos` : undefined,
    },
    {
      id: 'customers',
      title: 'Vaciar Directorio de Clientes (CRM)',
      icon: Users,
      color: 'purple',
      badge: 'Directorio CRM',
      description:
        'Elimina todos los contactos de clientes registrados en el CRM para comenzar un directorio en blanco.',
      preserves: 'Conserva tu catálogo y configuraciones de tienda.',
      countLabel: stats ? `${stats.customersCount} clientes registrados` : undefined,
    },
    {
      id: 'suppliers',
      title: 'Vaciar Directorio de Proveedores',
      icon: Building2,
      color: 'blue',
      badge: 'Proveedores',
      description:
        'Elimina todos los proveedores registrados en el directorio de compras y abastecimiento.',
      preserves: 'Conserva los productos de inventario existentes.',
      countLabel: stats ? `${stats.suppliersCount} proveedores registrados` : undefined,
    },
    {
      id: 'reset_customer_balances',
      title: 'Resetear Balances de Clientes (Sin borrar contactos)',
      icon: RotateCcw,
      color: 'purple',
      badge: 'Historial CRM',
      description:
        'Pone en 0 los contadores de pedidos y gasto acumulado de todos los clientes sin borrar sus números de teléfono ni datos de contacto.',
      preserves: 'Conserva la libreta de direcciones y contactos de clientes.',
      countLabel: stats ? `${stats.customersCount} clientes registrados` : undefined,
    },
    {
      id: 'reset_supplier_balances',
      title: 'Resetear Balances de Proveedores (Sin borrar contactos)',
      icon: RotateCcw,
      color: 'blue',
      badge: 'Historial Proveedores',
      description:
        'Pone en 0 los contadores de órdenes de compra y monto gastado acumulado con cada proveedor sin borrar sus datos.',
      preserves: 'Conserva los datos fiscales y contactos de proveedores.',
      countLabel: stats ? `${stats.suppliersCount} proveedores registrados` : undefined,
    },
    {
      id: 'telegram',
      title: 'Vaciar Historial de Mensajes de Telegram Crudos',
      icon: Terminal,
      color: 'teal',
      badge: 'Registro Raw',
      description:
        'Limpia el log de mensajes recibidos por el bot de Telegram en la cola de procesamiento.',
      preserves: 'Los productos creados a partir de estos mensajes se mantienen en tu catálogo.',
      countLabel: stats ? `${stats.messagesCount} mensajes registrados` : undefined,
    },
    {
      id: 'analytics',
      title: 'Vaciar Métricas y Eventos de Visitas a la Tienda',
      icon: TrendingUp,
      color: 'blue',
      badge: 'Analítica',
      description:
        'Limpia el registro de visitas, vistas de productos y carritos de la tienda para comenzar a medir desde cero.',
      preserves: 'Conserva la tienda y los pedidos.',
      countLabel: stats ? `${stats.analyticsCount} eventos registrados` : undefined,
    },
    {
      id: 'reset_all',
      title: 'Limpieza Total de Operaciones (Conserva Productos)',
      icon: Trash2,
      color: 'rose',
      badge: 'Reset Avanzado',
      description:
        'Elimina todos los pedidos, compras, tesorería, clientes, proveedores, mensajes crudos y analítica. Deja la plataforma totalmente en blanco de operaciones.',
      preserves: 'Conserva tus usuarios administradores, catálogo de productos y llaves de configuración.',
      countLabel: 'Vacía todas las tablas operativas',
    },
    {
      id: 'reset_all_with_products',
      title: 'Limpieza Absoluta: ERP + Catálogo de Productos (Reset de Fábrica)',
      icon: Flame,
      color: 'rose',
      badge: 'Reset Total + Productos',
      description:
        'Elimina absolutamente TODO: Todos los productos del catálogo, pedidos de clientes, compras, movimientos de tesorería, clientes CRM, proveedores, mensajes y analítica.',
      preserves: 'Conserva únicamente tus usuarios administradores y llaves de configuración.',
      countLabel: stats ? `${stats.productsCount} productos + tablas operativas` : 'Reset de fábrica completo',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Banner / Developer Mode Info */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 shadow-sm border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center border border-indigo-400/30 shrink-0">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-black tracking-tight text-white">
                  Centro de Control para Desarrolladores & Sandbox
                </h3>
                <span className="bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-amber-400/30">
                  Dev Testing Suite
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed max-w-2xl">
                Control completo de pruebas para reiniciar el ciclo comercial, simular órdenes y compras, conciliar tesorería y depurar el ERP manteniendo tu catálogo de productos y administradores 100% seguros.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchStats}
            disabled={loadingStats}
            className="px-3.5 py-2 bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 border border-slate-700 shadow-xs cursor-pointer self-start sm:self-auto shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStats ? 'animate-spin text-indigo-400' : ''}`} />
            <span>Refrescar Contadores</span>
          </button>
        </div>

        {/* Live Stats Badges Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mt-5 pt-4 border-t border-slate-800/80">
          <div className="bg-slate-800/60 rounded-xl p-2 border border-slate-700/50">
            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Pedidos</div>
            <div className="text-sm font-black text-sky-400 mt-0.5">
              {stats ? stats.ordersCount : '—'}
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-2 border border-slate-700/50">
            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Compras</div>
            <div className="text-sm font-black text-indigo-400 mt-0.5">
              {stats ? stats.purchasesCount : '—'}
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-2 border border-slate-700/50">
            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Tesorería</div>
            <div className="text-sm font-black text-teal-400 mt-0.5">
              {stats ? stats.paymentsCount : '—'}
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-2 border border-slate-700/50">
            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Clientes</div>
            <div className="text-sm font-black text-purple-400 mt-0.5">
              {stats ? stats.customersCount : '—'}
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-2 border border-slate-700/50">
            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Proveedores</div>
            <div className="text-sm font-black text-blue-400 mt-0.5">
              {stats ? stats.suppliersCount : '—'}
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-2 border border-slate-700/50">
            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Mensajes TG</div>
            <div className="text-sm font-black text-emerald-400 mt-0.5">
              {stats ? stats.messagesCount : '—'}
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-2 border border-slate-700/50">
            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Catálogo</div>
            <div className="text-sm font-black text-emerald-300 mt-0.5">
              {stats ? `${stats.productsCount} items` : '—'}
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-2 border border-slate-700/50">
            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Stock Total</div>
            <div className="text-sm font-black text-amber-400 mt-0.5">
              {stats ? `${stats.totalStockUnits} un.` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Mode Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveDevSection('cleaner')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
            activeDevSection === 'cleaner'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>1. Limpieza y Depuración de Pruebas</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDevSection('seeder')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
            activeDevSection === 'seeder'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <span>2. Generador de Datos Demo (1-Click Seeder)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDevSection('diagnostics')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
            activeDevSection === 'diagnostics'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>3. Diagnóstico y Conciliación ERP</span>
        </button>
      </div>

      {/* Result Message Success */}
      {resultMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2 animate-in fade-in duration-150">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <h4 className="font-black text-sm">¡Operación Ejecutada con Éxito!</h4>
          </div>
          <p className="text-xs text-emerald-800 leading-relaxed font-medium">
            {resultMessage}
          </p>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-1.5 animate-in fade-in duration-150">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <h4 className="font-bold text-xs">Ocurrió un inconveniente:</h4>
          </div>
          <p className="text-xs text-rose-700">{errorMessage}</p>
        </div>
      )}

      {/* SECTION 1: CLEANER */}
      {activeDevSection === 'cleaner' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Selecciona la entidad a limpiar o reiniciar:
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Elige qué entidades deseas vaciar para comenzar un nuevo ciclo de pruebas
              </p>
            </div>
          </div>

          {/* Options Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {actionOptions.map((opt) => {
              const Icon = opt.icon;
              const isSelected = selectedAction === opt.id;

              return (
                <div
                  key={opt.id}
                  onClick={() => {
                    setSelectedAction(opt.id);
                    setConfirmed(false);
                  }}
                  className={`p-4 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/40 shadow-xs ring-2 ring-indigo-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2.5">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <h5 className="text-xs font-black text-slate-900 leading-tight">
                          {opt.title}
                        </h5>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                          isSelected
                            ? 'bg-indigo-100 text-indigo-900 border-indigo-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {opt.badge}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                      {opt.description}
                    </p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100/90 space-y-1">
                    {opt.countLabel && (
                      <div className="text-[11px] font-bold text-slate-700 flex items-center space-x-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                        <span>Registros actuales: {opt.countLabel}</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-1.5 text-[11px] text-emerald-700 font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{opt.preserves}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Special parameter: Target Stock Quantity when reset_stock is chosen */}
          {selectedAction === 'reset_stock' && (
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center space-x-2 text-xs font-bold text-amber-900">
                <Layers className="w-4 h-4 text-amber-600" />
                <span>Configuración de Stock Objetivo para Pruebas:</span>
              </div>
              <p className="text-xs text-amber-800">
                Indica qué cantidad de unidades deseas asignarle a todos los artículos de tu catálogo:
              </p>
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    value={targetStockQuantity}
                    onChange={(e) => setTargetStockQuantity(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-24 px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="text-xs font-semibold text-amber-900">unidades por producto</span>
                </div>

                <div className="flex items-center space-x-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setTargetStockQuantity(0)}
                    className={`px-2.5 py-1 rounded-md font-bold text-[11px] border cursor-pointer ${
                      targetStockQuantity === 0
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100/50'
                    }`}
                  >
                    0 un (Agotado)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetStockQuantity(5)}
                    className={`px-2.5 py-1 rounded-md font-bold text-[11px] border cursor-pointer ${
                      targetStockQuantity === 5
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100/50'
                    }`}
                  >
                    5 un
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetStockQuantity(10)}
                    className={`px-2.5 py-1 rounded-md font-bold text-[11px] border cursor-pointer ${
                      targetStockQuantity === 10
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100/50'
                    }`}
                  >
                    10 un
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetStockQuantity(50)}
                    className={`px-2.5 py-1 rounded-md font-bold text-[11px] border cursor-pointer ${
                      targetStockQuantity === 50
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100/50'
                    }`}
                  >
                    50 un
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Safety & Execution Area */}
          <div className="pt-4 border-t border-slate-200/80 space-y-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start space-x-2.5">
                <input
                  id="confirm-clean-checkbox"
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-rose-600 focus:ring-rose-500 border-slate-300 cursor-pointer"
                />
                <label htmlFor="confirm-clean-checkbox" className="text-xs text-slate-800 font-semibold leading-relaxed cursor-pointer select-none">
                  {selectedAction === 'products'
                    ? 'Confirmo que deseo ELIMINAR TODOS LOS PRODUCTOS del catálogo e inventario para empezar un catálogo nuevo desde cero.'
                    : selectedAction === 'reset_all_with_products'
                    ? 'Confirmo que deseo EJECUTAR UN RESET DE FÁBRICA ABSOLUTO (se borrarán todos los productos, ventas, compras, pagos y contactos).'
                    : 'Confirmo que he concluido mi ciclo de pruebas y deseo ejecutar esta limpieza en la base de datos para reiniciar las órdenes y movimientos.'}
                </label>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <div className="text-[11px] text-slate-500 flex items-center space-x-1.5 font-medium">
                  {selectedAction === 'products' || selectedAction === 'reset_all_with_products' ? (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span className="text-rose-700 font-bold">
                        {selectedAction === 'products'
                          ? 'Aviso: Los productos del catálogo serán eliminados permanentemente.'
                          : 'Aviso: Se vaciará todo el ERP incluyendo productos y transacciones.'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Database className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Acción segura: Tus productos, categorías y usuarios administradores nunca son eliminados.</span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!confirmed || isCleaning}
                  onClick={handleExecuteClean}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs transition shadow-xs flex items-center justify-center space-x-2 cursor-pointer ${
                    selectedAction === 'all_transactions'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : selectedAction === 'products' || selectedAction === 'reset_all_with_products' || selectedAction === 'reset_all'
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : selectedAction === 'reset_stock'
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {isCleaning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>
                        {selectedAction === 'products'
                          ? 'Eliminando Catálogo...'
                          : selectedAction === 'reset_all_with_products'
                          ? 'Ejecutando Reset de Fábrica...'
                          : 'Ejecutando Limpieza de Pruebas...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>
                        {selectedAction === 'all_transactions'
                          ? 'Ejecutar Limpieza Integral de Pruebas'
                          : selectedAction === 'products'
                          ? 'Eliminar Todo el Catálogo de Productos'
                          : selectedAction === 'reset_all_with_products'
                          ? 'Ejecutar Reset Absoluto (Catálogo + ERP)'
                          : selectedAction === 'reset_all'
                          ? 'Ejecutar Limpieza Total de Operaciones'
                          : selectedAction === 'reset_stock'
                          ? 'Aplicar Nuevo Stock a Catálogo'
                          : 'Ejecutar Limpieza Seleccionada'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: SEEDER / DEMO SIMULATOR */}
      {activeDevSection === 'seeder' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div>
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Generador de Datos de Prueba (Simulador Rápido)
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Inyecta registros de prueba realistas (pedidos, compras, clientes ecuatorianos, proveedores y comprobantes) para probar flujos comerciales sin ingresar datos a mano.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2">
            {/* 1-Click Complete Cycle */}
            <div className="p-4 rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-900">Simular Ciclo Comercial Completo</h5>
                    <span className="text-[10px] text-indigo-700 font-bold">Ventas + Compras + Tesorería + Contactos</span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed pt-1">
                  Crea automáticamente 3 pedidos de clientes con estados variados, 3 compras a proveedores con recepciones y comprobantes, clientes en el CRM y proveedores en el directorio, conciliando los saldos en tesorería.
                </p>
              </div>

              <button
                type="button"
                disabled={isSeeding}
                onClick={() => handleExecuteSeed('all')}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>Generar Ciclo Completo (1-Click)</span>
              </button>
            </div>

            {/* Seed Orders Only */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50/50 flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-900">Simular 3 Pedidos de Clientes</h5>
                    <span className="text-[10px] text-sky-700 font-bold">Vouchers Pichincha, Deuna y Efectivo</span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed pt-1">
                  Genera pedidos con direcciones en Quito, Guayaquil y Cuenca, comprobantes de pago y estados pendientes, confirmados y entregados.
                </p>
              </div>

              <button
                type="button"
                disabled={isSeeding}
                onClick={() => handleExecuteSeed('orders')}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingBag className="w-4 h-4" />}
                <span>Generar Solo Pedidos de Venta</span>
              </button>
            </div>

            {/* Seed Purchases Only */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50/50 flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                    <Boxes className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-900">Simular 3 Compras a Proveedores</h5>
                    <span className="text-[10px] text-indigo-700 font-bold">Facturas y Guías de Remisión</span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed pt-1">
                  Genera órdenes de compra con proveedores tecnológicos y textiles, guías de despacho y recepciones en bodega.
                </p>
              </div>

              <button
                type="button"
                disabled={isSeeding}
                onClick={() => handleExecuteSeed('purchases')}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Boxes className="w-4 h-4" />}
                <span>Generar Solo Compras a Proveedores</span>
              </button>
            </div>

            {/* Seed Contacts Only */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50/50 flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-900">Simular Directorio de Contactos</h5>
                    <span className="text-[10px] text-purple-700 font-bold">4 Clientes CRM + 3 Proveedores con RUC</span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed pt-1">
                  Agrega clientes con cédula/teléfono y proveedores mayoristas con RUC ecuatoriano y plazos de crédito para probar consultas y búsquedas.
                </p>
              </div>

              <button
                type="button"
                disabled={isSeeding}
                onClick={() => handleExecuteSeed('contacts')}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                <span>Generar Directorio de Contactos</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: DIAGNOSTICS & AUDIT */}
      {activeDevSection === 'diagnostics' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div>
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Diagnóstico de Integridad & Sincronización ERP
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Herramientas de mantenimiento para auditar y recalcular la contabilidad y los enlaces entre ventas y compras.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
              <div className="flex items-center space-x-2">
                <Wallet className="w-5 h-5 text-teal-600" />
                <h5 className="text-xs font-bold text-slate-900">Recalcular Libro Mayor de Tesorería</h5>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Escanea todas las ventas confirmadas y compras pagadas para garantizar que cada transacción tenga su comprobante de cobro o pago en el flujo de caja.
              </p>
              <button
                type="button"
                disabled={isSyncing}
                onClick={handleSyncTreasury}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl flex items-center space-x-2 transition cursor-pointer disabled:opacity-50"
              >
                {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>Sincronizar y Conciliar Tesorería</span>
              </button>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
              <div className="flex items-center space-x-2">
                <Database className="w-5 h-5 text-indigo-600" />
                <h5 className="text-xs font-bold text-slate-900">Auditoría de Base de Datos</h5>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Verifica que no existan huérfanos entre ítems de catálogo, órdenes de compra y números de guía de despacho.
              </p>
              <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700 bg-emerald-100/60 px-3 py-1.5 rounded-lg w-fit border border-emerald-200">
                <CheckCheck className="w-4 h-4 text-emerald-600" />
                <span>Estructura de Base de Datos Íntegra</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

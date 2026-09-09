import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Download,
  Eye,
  Filter,
  Flame,
  Globe,
  HelpCircle,
  Layers,
  Laptop,
  Loader2,
  MessageCircle,
  Package,
  PieChart as PieChartIcon,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Store,
  Tablet,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  InventoryItem,
  StoreAnalyticsDashboardData,
  StoreAnalyticsProductPerformance,
} from '../types.ts';
import {
  formatExactCurrency,
  formatSmartCurrency,
  getMetricFontSizeClass,
} from '../utils/metricFormatters.ts';

interface AnalyticsDashboardProps {
  products: InventoryItem[];
  currency?: string;
  authFetch?: (url: string, options?: RequestInit) => Promise<Response>;
  onSelectProductDetail?: (item: InventoryItem) => void;
  onGoToStore?: () => void;
  onGoToInventory?: () => void;
}

const PERIOD_LABELS: Record<string, string> = {
  today: 'Hoy',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  '90d': 'Últimos 90 días',
  year: 'Este año',
  all: 'Histórico completo',
};

const PIE_COLORS = ['#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#f87171'];

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  products = [],
  currency = 'USD',
  authFetch,
  onSelectProductDetail,
  onGoToStore,
  onGoToInventory,
}) => {
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | '90d' | 'year' | 'all'>('7d');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [data, setData] = useState<StoreAnalyticsDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState<string>('');
  const [productSortBy, setProductSortBy] = useState<'views' | 'sold' | 'revenue' | 'cart' | 'conversion'>('views');
  const [activeChartMetric, setActiveChartMetric] = useState<'all' | 'visits' | 'views' | 'orders' | 'revenue'>('all');

  // Reset Analytics State
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [resetFeedback, setResetFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const fetchAnalytics = useCallback(async (silent = false) => {
    if (!silent && isMountedRef.current) {
      setLoading(true);
      setError(null);
    }

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const url = `/api/analytics/dashboard?period=${period}${selectedProductId ? `&productId=${selectedProductId}` : ''}`;
    const maxRetries = silent ? 0 : 2;
    let attempt = 0;
    let success = false;
    let lastErr: any = null;

    while (attempt <= maxRetries && isMountedRef.current) {
      try {
        let res: Response | null = null;
        try {
          res = authFetch
            ? await authFetch(url, { signal: abortController.signal })
            : await fetch(url, { signal: abortController.signal });
        } catch (fetchErr: any) {
          if (fetchErr.name === 'AbortError') return;
          // Fallback to standard fetch if authFetch had an issue
          if (authFetch) {
            try {
              res = await fetch(url, { signal: abortController.signal });
            } catch (fallbackErr: any) {
              if (fallbackErr.name === 'AbortError') return;
              throw fetchErr;
            }
          } else {
            throw fetchErr;
          }
        }

        if (!res || !res.ok) {
          throw new Error(`Error de servidor (${res?.status || 500})`);
        }

        const json = await res.json();
        if (isMountedRef.current) {
          setData(json);
          setError(null);
        }
        success = true;
        break;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        lastErr = err;
        attempt++;
        if (attempt <= maxRetries && isMountedRef.current) {
          await new Promise((r) => setTimeout(r, attempt * 600));
        }
      }
    }

    if (!success && isMountedRef.current) {
      if (!silent) {
        console.warn('Analytics endpoint unavailable momentarily, retrying automatically on next cycle:', lastErr?.message || lastErr);
        setError('No se pudieron sincronizar las estadísticas en este momento. Verifique su conexión y pulse refrescar.');
      }
    }

    if (isMountedRef.current && !silent) {
      setLoading(false);
    }
  }, [period, selectedProductId, authFetch]);

  const handleResetAnalytics = async () => {
    setIsResetting(true);
    setPasswordError(null);
    setResetFeedback(null);
    try {
      const url = '/api/analytics/reset';
      const options: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      };
      let res: Response;
      try {
        res = authFetch ? await authFetch(url, options) : await fetch(url, options);
      } catch (err: any) {
        if (authFetch) {
          res = await fetch(url, options);
        } else {
          throw err;
        }
      }
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'No se pudieron reiniciar las estadísticas');
      }
      const result = await res.json();
      setShowResetModal(false);
      setPasswordError(null);
      setResetFeedback({
        type: 'success',
        message: result.message || 'Las estadísticas de tráfico y visualizaciones se han reiniciado a cero con éxito.',
      });
      // Refresh analytics data
      await fetchAnalytics(false);
      // Auto-clear feedback after 5 seconds
      setTimeout(() => {
        if (isMountedRef.current) {
          setResetFeedback(null);
        }
      }, 5000);
    } catch (err: any) {
      console.warn('Failed to reset analytics:', err);
      setPasswordError(err.message || 'Error al reiniciar las estadísticas.');
    } finally {
      if (isMountedRef.current) {
        setIsResetting(false);
      }
    }
  };

  useEffect(() => {
    fetchAnalytics(false);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchAnalytics(true);
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  // Filtered and sorted product performance list
  const filteredProducts = useMemo(() => {
    if (!data?.productPerformance) return [];
    let list = [...data.productPerformance];

    if (productSearch.trim()) {
      const q = productSearch.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (productSortBy === 'views') return b.views - a.views;
      if (productSortBy === 'sold') return b.unitsSold - a.unitsSold;
      if (productSortBy === 'revenue') return b.revenue - a.revenue;
      if (productSortBy === 'cart') return b.cartAdds - a.cartAdds;
      if (productSortBy === 'conversion') return b.conversionRate - a.conversionRate;
      return 0;
    });

    return list;
  }, [data?.productPerformance, productSearch, productSortBy]);

  // Find matching inventory product object for details modal
  const handleProductClick = (itemPerf: StoreAnalyticsProductPerformance) => {
    const found = products.find((p) => p.id === itemPerf.id);
    if (found && onSelectProductDetail) {
      onSelectProductDetail(found);
    }
  };

  // Export Analytics Table to CSV
  const handleExportCSV = () => {
    if (!data?.productPerformance || data.productPerformance.length === 0) return;
    const headers = ['ID', 'Producto', 'SKU', 'Categoría', 'Precio Venta', 'Stock', 'Visualizaciones', 'Agregados Carrito', 'Unidades Vendidas', 'Ingresos USD', 'Tasa Conversion %'];
    const rows = data.productPerformance.map((p) => [
      p.id,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.sku}"`,
      `"${p.category}"`,
      p.salePrice,
      p.stock,
      p.views,
      p.cartAdds,
      p.unitsSold,
      p.revenue.toFixed(2),
      `${p.conversionRate.toFixed(2)}%`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `estadisticas_comerxia_${period}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const summary = data?.summary;
  const targetProduct = useMemo(() => {
    if (!selectedProductId) return null;
    return products.find((p) => p.id === selectedProductId) || null;
  }, [selectedProductId, products]);

  return (
    <div className="space-y-6 pb-20 animate-fadeIn text-slate-800">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-sm">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Estadísticas y Analíticas de la Tienda
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Visualización de tráfico de clientes, productos más vistos, conversión de compras y fechas de mayor venta.
          </p>
        </div>
      </div>

      {/* Filter & Search Bar (Dos Barras Horizontales Estáticas) */}
      <div
        id="metrics-search-container"
        className="sticky top-16 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-300 p-2.5 sm:p-3 shadow-sm space-y-2 transition-all max-w-full"
      >
        {/* Barra 1: Búsqueda de Productos/Métricas y Acciones Globales */}
        <div className="flex items-center gap-2 w-full">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar métricas por producto, SKU o categoría..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="w-full pl-8.5 sm:pl-9 pr-8 sm:pr-14 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:bg-white transition font-medium"
            />
            {productSearch && (
              <button
                onClick={() => setProductSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer"
                title="Limpiar búsqueda"
              >
                <span className="sm:hidden">✕</span>
                <span className="hidden sm:inline">Limpiar</span>
              </button>
            )}
          </div>

          {/* Target Product Badge if filtered */}
          {targetProduct && (
            <div className="flex items-center gap-1 bg-sky-100 text-sky-800 border border-sky-300 px-2.5 py-1.5 rounded-xl text-xs font-bold shrink-0 max-w-[160px] truncate">
              <span className="truncate">{targetProduct.name}</span>
              <button
                onClick={() => setSelectedProductId(null)}
                className="text-sky-600 hover:text-rose-600 ml-1 font-black cursor-pointer"
                title="Quitar filtro de producto"
              >
                ✕
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Refresh Button */}
            <button
              onClick={() => fetchAnalytics(false)}
              disabled={loading}
              title="Refrescar estadísticas"
              className="p-2 h-9 w-9 flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition shadow-2xs cursor-pointer disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-600' : ''}`} />
            </button>

            {/* Reset Statistics Button */}
            <button
              type="button"
              id="btn-reset-store-analytics"
              onClick={() => {
                setPasswordError(null);
                setShowResetModal(true);
              }}
              disabled={loading || isResetting}
              title="Reiniciar contadores de estadísticas y tráfico a cero"
              className="h-9 px-2.5 sm:px-3 inline-flex items-center space-x-1 rounded-xl border border-rose-200 bg-rose-50/90 hover:bg-rose-100 text-rose-700 text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50 shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reiniciar</span>
            </button>

            {/* CSV Export Button */}
            <button
              onClick={handleExportCSV}
              title="Exportar reporte a Excel/CSV"
              className="h-9 px-2.5 sm:px-3.5 inline-flex items-center space-x-1 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold transition shadow-2xs cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        </div>

        {/* Barra 2: Filtros Horizontales Continuos (Deslizables en móvil) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x py-1 w-full scroll-smooth pt-2 border-t border-slate-200/80 select-none">
          <span className="text-[11px] text-slate-500 font-bold shrink-0 mr-0.5 flex items-center gap-1">
            <Calendar className="w-3 h-3 text-sky-600" />
            <span>Período:</span>
          </span>

          {/* Period Selector Buttons */}
          {(['today', '7d', '30d', '90d', 'year', 'all'] as const).map((pKey) => (
            <button
              key={pKey}
              onClick={() => setPeriod(pKey)}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                period === pKey
                  ? 'bg-sky-600 text-white shadow-2xs'
                  : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              {PERIOD_LABELS[pKey]}
            </button>
          ))}

          <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />

          {/* Chart Metric Filter Chips */}
          <span className="text-[11px] text-slate-500 font-bold shrink-0">Métrica:</span>
          {[
            { id: 'all', label: 'Todas' },
            { id: 'visits', label: '👥 Visitas' },
            { id: 'views', label: '👁️ Vistas' },
            { id: 'orders', label: '🛒 Pedidos' },
            { id: 'revenue', label: '💰 Facturación' },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveChartMetric(m.id as any)}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition cursor-pointer shrink-0 whitespace-nowrap ${
                activeChartMetric === m.id
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              {m.label}
            </button>
          ))}

          <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />

          {/* Product Sorting Dropdown */}
          <div className="flex items-center shrink-0 gap-1">
            <span className="text-[11px] text-slate-500 font-medium shrink-0">Ordenar:</span>
            <select
              value={productSortBy}
              onChange={(e) => setProductSortBy(e.target.value as any)}
              className="px-2.5 py-1 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer shrink-0"
            >
              <option value="views">Más Vistos</option>
              <option value="sold">Más Vendidos</option>
              <option value="revenue">Mayor Facturación</option>
              <option value="cart">Más Carritos</option>
              <option value="conversion">Mejor Conversión %</option>
            </select>
          </div>

          {/* Reset Filters Button */}
          {(productSearch || selectedProductId || period !== '7d' || activeChartMetric !== 'all' || productSortBy !== 'views') && (
            <>
              <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />
              <button
                type="button"
                onClick={() => {
                  setProductSearch('');
                  setSelectedProductId(null);
                  setPeriod('7d');
                  setActiveChartMetric('all');
                  setProductSortBy('views');
                }}
                className="text-[11px] text-rose-800 hover:text-rose-950 font-bold px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-300 transition cursor-pointer flex items-center space-x-1 shadow-2xs shrink-0 whitespace-nowrap"
                title="Restablecer filtros de métricas"
              >
                <span>✕</span>
                <span>Restablecer</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Reset Feedback Notification Banner */}
      {resetFeedback && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 shadow-xs animate-fadeIn ${
            resetFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            {resetFeedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <p className="text-xs sm:text-sm font-bold">{resetFeedback.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setResetFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Analytics Connection Warning / Retry Banner */}
      {error && !loading && (
        <div className="p-3.5 rounded-2xl border border-amber-200 bg-amber-50 text-amber-900 flex items-center justify-between gap-3 shadow-xs animate-fadeIn">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-xs sm:text-sm font-medium">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => fetchAnalytics(false)}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition cursor-pointer shrink-0 shadow-2xs"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Specific Product Filter Header (if selected) */}
      {selectedProductId && (
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-sky-200 overflow-hidden flex items-center justify-center flex-shrink-0">
              {targetProduct?.imageUrl ? (
                <img src={targetProduct.imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <Package className="w-5 h-5 text-sky-600" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-700">Filtrando por Producto:</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-sky-200/80 text-sky-900 font-bold">
                  SKU: {targetProduct?.sku || selectedProductId}
                </span>
              </div>
              <p className="text-sm font-extrabold text-slate-900 truncate max-w-md">
                {targetProduct?.name || `Producto #${selectedProductId}`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSelectedProductId(null)}
            className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white border border-sky-300 text-sky-800 hover:bg-sky-100 transition cursor-pointer shadow-2xs"
          >
            Ver Toda la Tienda
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Card 1: Visitas a la Tienda */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 hover:border-sky-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between min-h-[124px]">
          <div className="flex items-start justify-between gap-2 min-h-[34px]">
            <span className="text-xs font-bold text-slate-700 leading-snug" title="Visitas a Tienda">
              Visitas a la Tienda
            </span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-tight truncate">
              {summary?.totalVisits ?? 0}
              <span className="text-xs font-semibold text-slate-400 ml-1">sesiones</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 leading-tight">
              <Globe className="w-3 h-3 text-sky-500 shrink-0" />
              <span>{summary?.uniqueVisitors ?? 0} visitantes únicos</span>
            </p>
          </div>
        </div>

        {/* Card 2: Visualizaciones de Productos */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 hover:border-indigo-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between min-h-[124px]">
          <div className="flex items-start justify-between gap-2 min-h-[34px]">
            <span className="text-xs font-bold text-slate-700 leading-snug" title="Vistas de Producto">
              Vistas de Productos
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-tight truncate">
              {summary?.totalProductViews ?? 0}
              <span className="text-xs font-semibold text-slate-400 ml-1">aperturas</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 leading-tight">
              <Activity className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>Interés directo en catálogo</span>
            </p>
          </div>
        </div>

        {/* Card 3: Carrito & WhatsApp */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 hover:border-emerald-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between min-h-[124px]">
          <div className="flex items-start justify-between gap-2 min-h-[34px]">
            <span className="text-xs font-bold text-slate-700 leading-snug" title="Agregados & WhatsApp">
              Agregados y WhatsApp
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-tight truncate">
              {summary?.totalCartAdditions ?? 0}
              <span className="text-xs font-semibold text-slate-400 ml-1">carritos</span>
            </div>
            <p className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1 leading-tight">
              <MessageCircle className="w-3 h-3 text-emerald-500 shrink-0" />
              <span>{summary?.totalWhatsappClicks ?? 0} clics a WhatsApp</span>
            </p>
          </div>
        </div>

        {/* Card 4: Facturación & Pedidos */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 hover:border-amber-300 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between min-h-[124px]">
          <div className="flex items-start justify-between gap-2 min-h-[34px]">
            <span className="text-xs font-bold text-slate-700 leading-snug" title="Ventas & Conversión">
              Ventas y Facturación
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div
              className={`font-mono text-slate-900 leading-tight whitespace-nowrap ${getMetricFontSizeClass(formatSmartCurrency(Number(summary?.totalRevenue || 0), currency))}`}
              title={`Valor exacto: ${formatExactCurrency(Number(summary?.totalRevenue || 0), currency)}`}
            >
              {formatSmartCurrency(Number(summary?.totalRevenue || 0), currency)}
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] gap-1 leading-tight">
              <span className="font-medium text-slate-500">{summary?.totalOrdersCount ?? 0} pedidos</span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px] shrink-0">
                {summary?.conversionRate ?? 0}% conv.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Featured Star Products & Peak Times Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Star Product Card */}
        <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-white border border-amber-200 rounded-2xl p-4 sm:p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-1.5 text-amber-800 font-bold text-xs uppercase tracking-wider">
              <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span>Producto Más Vendido</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-black">
              Top #1 Ventas
            </span>
          </div>

          {summary?.starProduct ? (
            <div className="flex items-center space-x-3 mt-3">
              <div className="w-14 h-14 rounded-xl bg-white border border-amber-200 overflow-hidden flex-shrink-0 shadow-2xs">
                {summary.starProduct.imageUrl ? (
                  <img src={summary.starProduct.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-6 h-6 text-amber-500 m-auto mt-3" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-extrabold text-slate-900 text-sm truncate" title={summary.starProduct.name}>
                  {summary.starProduct.name}
                </h4>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  ${Number(summary.starProduct.salePrice).toFixed(2)} {currency}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 rounded-md bg-amber-200/70 text-amber-950 text-xs font-black font-mono">
                    {summary.starProduct.unitsSold} unid. vendidas
                  </span>
                  <span className="text-xs font-bold text-emerald-700">
                    ${summary.starProduct.revenue.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 mt-4 italic">Aún no se registran compras en este periodo.</p>
          )}
        </div>

        {/* Most Viewed Product Card */}
        <div className="bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-white border border-indigo-200 rounded-2xl p-4 sm:p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-1.5 text-indigo-800 font-bold text-xs uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <span>Producto Más Mirado / Clics</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 text-[10px] font-black">
              Top #1 Interés
            </span>
          </div>

          {summary?.mostViewedProduct ? (
            <div className="flex items-center space-x-3 mt-3">
              <div className="w-14 h-14 rounded-xl bg-white border border-indigo-200 overflow-hidden flex-shrink-0 shadow-2xs">
                {summary.mostViewedProduct.imageUrl ? (
                  <img src={summary.mostViewedProduct.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Eye className="w-6 h-6 text-indigo-500 m-auto mt-3" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-extrabold text-slate-900 text-sm truncate" title={summary.mostViewedProduct.name}>
                  {summary.mostViewedProduct.name}
                </h4>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  ${Number(summary.mostViewedProduct.salePrice).toFixed(2)} {currency}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-200/70 text-indigo-950 text-xs font-black font-mono">
                    {summary.mostViewedProduct.views} visualizaciones
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 mt-4 italic">No hay visualizaciones registradas en este periodo.</p>
          )}
        </div>

        {/* Peak Sales Period Card */}
        <div className="bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-white border border-sky-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-1.5 text-sky-900 font-bold text-xs uppercase tracking-wider mb-2">
              <Clock className="w-4 h-4 text-sky-600" />
              <span>¿En qué fechas y horas se vende más?</span>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-sky-100">
                <span className="text-xs text-slate-600 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-sky-500" />
                  Día de Mayor Venta:
                </span>
                <span className="text-xs font-extrabold text-sky-900 bg-sky-100 px-2.5 py-0.5 rounded-lg">
                  {summary?.peakDayName || 'Datos insuficientes'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-sky-100">
                <span className="text-xs text-slate-600 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-500" />
                  Hora Pico de Clientes:
                </span>
                <span className="text-xs font-extrabold text-sky-900 bg-sky-100 px-2.5 py-0.5 rounded-lg">
                  {summary?.peakHourTime || 'Horario regular'}
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 italic">
            * Basado en el registro histórico de pedidos y visitas de clientes.
          </p>
        </div>
      </div>

      {/* Main Charts & Funnel Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline Chart (Left 2 Columns) */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-sky-600" />
                Evolución de Tráfico y Ventas a lo Largo del Tiempo
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Comportamiento diario de visitas a la tienda, vistas de productos y pedidos
              </p>
            </div>

            {/* Metric toggles for timeline */}
            <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setActiveChartMetric('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeChartMetric === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setActiveChartMetric('visits')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeChartMetric === 'visits' ? 'bg-sky-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Visitas
              </button>
              <button
                onClick={() => setActiveChartMetric('views')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeChartMetric === 'views' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Vistas
              </button>
              <button
                onClick={() => setActiveChartMetric('revenue')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeChartMetric === 'revenue' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ingresos
              </button>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            {data?.timeline && data.timeline.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      color: '#f8fafc',
                      borderRadius: '0.75rem',
                      border: '1px solid #334155',
                      fontSize: '12px',
                    }}
                  />
                  {(activeChartMetric === 'all' || activeChartMetric === 'visits') && (
                    <Area type="monotone" dataKey="visits" name="Visitas Tienda" stroke="#0ea5e9" strokeWidth={2} fillOpacity={1} fill="url(#colorVisits)" />
                  )}
                  {(activeChartMetric === 'all' || activeChartMetric === 'views') && (
                    <Area type="monotone" dataKey="productViews" name="Vistas Producto" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorViews)" />
                  )}
                  {(activeChartMetric === 'all' || activeChartMetric === 'orders') && (
                    <Area type="monotone" dataKey="orders" name="Pedidos" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorOrders)" />
                  )}
                  {activeChartMetric === 'revenue' && (
                    <Area type="monotone" dataKey="revenue" name={`Ingresos (${currency})`} stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorOrders)" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Cargando datos de evolución temporal...
              </div>
            )}
          </div>
        </div>

        {/* Funnel de Conversión (Right Column) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-600" />
                Embudo de Conversión
              </h3>
              <span className="text-xs font-mono font-bold text-slate-400">{summary?.conversionRate ?? 0}% global</span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Paso a paso de tus clientes desde la entrada hasta la compra
            </p>

            <div className="space-y-3">
              {data?.funnel.map((step, idx) => {
                const colors = [
                  'from-sky-500 to-sky-600',
                  'from-indigo-500 to-indigo-600',
                  'from-emerald-500 to-emerald-600',
                  'from-amber-500 to-amber-600',
                  'from-teal-500 to-teal-600',
                ];
                const bgLight = [
                  'bg-sky-50 text-sky-900 border-sky-200',
                  'bg-indigo-50 text-indigo-900 border-indigo-200',
                  'bg-emerald-50 text-emerald-900 border-emerald-200',
                  'bg-amber-50 text-amber-900 border-amber-200',
                  'bg-teal-50 text-teal-900 border-teal-200',
                ];

                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black flex items-center justify-center">
                          {idx + 1}
                        </span>
                        {step.step}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">{step.count}</span>
                        <span className="text-[11px] font-mono text-slate-500">({step.percent}%)</span>
                      </div>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${colors[idx % colors.length]} rounded-full transition-all duration-500`}
                        style={{ width: `${Math.max(4, Math.min(100, step.percent))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Tasa Vista → Carrito:</span>
            <span className="font-bold text-indigo-700 font-mono">{summary?.viewToCartRate ?? 0}%</span>
          </div>
        </div>
      </div>

      {/* Date & Time Distribution (Días de la semana & Horarios) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Day of week distribution */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-sky-600" />
                Ventas por Día de la Semana
              </h3>
              <p className="text-xs text-slate-500">¿Qué días compran más tus clientes?</p>
            </div>
            <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-lg">
              Pico: {summary?.peakDayName || 'N/A'}
            </span>
          </div>

          <div className="h-56 w-full pt-2">
            {data?.dayOfWeekDistribution && data.dayOfWeekDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dayOfWeekDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="dayName" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip
                    formatter={(value: any, name: string) => [
                      name === 'orders' ? `${value} pedidos` : `$${Number(value).toFixed(2)} ${currency}`,
                      name === 'orders' ? 'Pedidos' : 'Facturación',
                    ]}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      color: '#f8fafc',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="orders" name="orders" fill="#0284c7" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Sin datos de días registrados
              </div>
            )}
          </div>
        </div>

        {/* Hourly distribution */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                Ventas por Horarios del Día
              </h3>
              <p className="text-xs text-slate-500">¿A qué horas se generan los pedidos?</p>
            </div>
            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg">
              Hora Pico: {summary?.peakHourTime || 'N/A'}
            </span>
          </div>

          <div className="h-56 w-full pt-2">
            {data?.hourlyDistribution && data.hourlyDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.hourlyDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10} tickLine={false} interval={2} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip
                    formatter={(value: any) => [`${value} pedidos`, 'Pedidos']}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      color: '#f8fafc',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="orders" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Sin datos de horarios registrados
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Product-by-Product Performance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Header Controls */}
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="font-extrabold text-base sm:text-lg text-slate-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-sky-600" />
              Rendimiento Detallado por Producto
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Consulta exactamente cuántas personas miran cada producto, cuántos lo agregan al carrito y cuántos lo compran
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[200px] sm:min-w-[260px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por producto, SKU..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full pl-9 pr-3.5 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition"
              />
              {productSearch && (
                <button
                  onClick={() => setProductSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="inline-flex items-center space-x-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500 font-medium">Ordenar:</span>
              <select
                value={productSortBy}
                onChange={(e) => setProductSortBy(e.target.value as any)}
                className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer"
              >
                <option value="views">Más Vistos (Visualizaciones)</option>
                <option value="sold">Más Comprados (Unidades)</option>
                <option value="revenue">Mayor Facturación ($)</option>
                <option value="cart">Más Agregados al Carrito</option>
                <option value="conversion">Mejor Tasa de Conversión %</option>
              </select>
            </div>
          </div>
        </div>

        {/* Products Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Producto</th>
                <th className="py-3 px-4">SKU / Categoría</th>
                <th className="py-3 px-4 text-right">Precio</th>
                <th className="py-3 px-4 text-center">
                  <span className="inline-flex items-center gap-1 text-indigo-700">
                    <Eye className="w-3 h-3" />
                    Vistas
                  </span>
                </th>
                <th className="py-3 px-4 text-center">
                  <span className="inline-flex items-center gap-1 text-sky-700">
                    <ShoppingCart className="w-3 h-3" />
                    Carritos
                  </span>
                </th>
                <th className="py-3 px-4 text-center">
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <Package className="w-3 h-3" />
                    Vendidos
                  </span>
                </th>
                <th className="py-3 px-4 text-right">Facturación</th>
                <th className="py-3 px-4 text-center">Tasa Conversión</th>
                <th className="py-3 px-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredProducts.length > 0 ? (
                filteredProducts.map((p, idx) => {
                  const isSelected = selectedProductId === p.id;
                  const isTopSeller = idx === 0 && productSortBy === 'sold' && p.unitsSold > 0;
                  const isTopViewed = idx === 0 && productSortBy === 'views' && p.views > 0;

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-sky-50/70 border-l-4 border-l-sky-500 font-semibold' : ''
                      }`}
                    >
                      {/* Product Name & Photo */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 relative">
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-5 h-5 text-slate-400 m-auto mt-2.5" />
                            )}
                            {isTopSeller && (
                              <span className="absolute bottom-0 right-0 bg-amber-500 text-white rounded-tl-md p-0.5 text-[8px]" title="Más Vendido">
                                ★
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 max-w-xs">
                            <p
                              onClick={() => handleProductClick(p)}
                              className="font-extrabold text-slate-900 truncate hover:text-sky-600 transition cursor-pointer"
                              title={p.name}
                            >
                              {p.name}
                            </p>
                            <span className="text-[10px] text-slate-400">Stock: {p.stock} unidades</span>
                          </div>
                        </div>
                      </td>

                      {/* SKU & Category */}
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                          {p.sku || 'N/A'}
                        </span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{p.category || 'General'}</p>
                      </td>

                      {/* Price */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        ${Number(p.salePrice).toFixed(2)}
                      </td>

                      {/* Views */}
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-800 font-mono font-extrabold text-xs">
                          {p.views}
                        </span>
                      </td>

                      {/* Cart Additions */}
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-xl bg-sky-50 text-sky-800 font-mono font-bold text-xs">
                          {p.cartAdds}
                        </span>
                      </td>

                      {/* Sold Units */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-xl font-mono font-black text-xs ${
                            p.unitsSold > 0 ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {p.unitsSold}
                        </span>
                      </td>

                      {/* Revenue */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        ${Number(p.revenue).toFixed(2)}
                      </td>

                      {/* Conversion Rate */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold ${
                            p.conversionRate >= 10
                              ? 'bg-emerald-100 text-emerald-900'
                              : p.conversionRate > 0
                              ? 'bg-sky-100 text-sky-900'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {p.conversionRate}%
                        </span>
                      </td>

                      {/* Filter / Drilldown Button */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedProductId(isSelected ? null : p.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                            isSelected
                              ? 'bg-sky-600 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {isSelected ? 'Quitar Filtro' : 'Filtrar'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-semibold">No se encontraron productos coincidentes</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer Summary */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <span>Mostrando {filteredProducts.length} producto(s)</span>
          <span className="italic">
            * Los datos de visualización se actualizan automáticamente en tiempo real cuando los clientes navegan en la tienda online.
          </span>
        </div>
      </div>

      {/* Modal de Confirmación para Reiniciar Estadísticas */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative overflow-hidden animate-scaleIn">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shadow-xs">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Reiniciar Estadísticas</h3>
                  <p className="text-xs text-slate-500">Restablecer contadores analíticos a cero</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isResetting && setShowResetModal(false)}
                disabled={isResetting}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 my-4">
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start space-x-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">¿Deseas reiniciar todas las analíticas?</p>
                  <p className="text-amber-800 text-[11px] leading-relaxed">
                    Esta acción borrará el registro de visitas a la tienda, aperturas de catálogo, visualizaciones de productos, artículos añadidos al carrito y clics de contacto a WhatsApp.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
                <p className="leading-relaxed">
                  Los productos del inventario y los pedidos registrados <span className="font-bold text-slate-900">no se eliminarán</span>.
                </p>
                <p className="leading-relaxed text-slate-500">
                  Únicamente se restablecerán a cero los contadores de tráfico y navegación para iniciar un nuevo periodo de medición limpio.
                </p>
              </div>

              {passwordError && (
                <p className="mt-1.5 text-xs text-rose-600 font-medium flex items-center space-x-1 animate-fadeIn">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{passwordError}</span>
                </p>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2.5 mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(false);
                  setPasswordError(null);
                }}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleResetAnalytics}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-black transition flex items-center space-x-2 shadow-xs cursor-pointer disabled:opacity-50"
                id="btn-confirm-reset-analytics"
              >
                {isResetting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Reiniciando Estadísticas...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Confirmar y Reiniciar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

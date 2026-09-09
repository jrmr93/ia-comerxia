import React from 'react';
import {
  Package,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Tag,
  Scale,
  Bot,
  AlertTriangle,
  BadgeDollarSign,
} from 'lucide-react';
import { InventoryStats } from '../types.ts';
import {
  formatExactCurrency,
  formatSmartCurrency,
  getMetricFontSizeClass,
} from '../utils/metricFormatters.ts';

interface StatsBannerProps {
  stats: InventoryStats | null;
  currency?: string;
  totalMessagesCount?: number;
}

export const StatsBanner: React.FC<StatsBannerProps> = ({
  stats,
  currency = 'USD',
  totalMessagesCount = 0,
}) => {
  const totalCost = stats?.totalCostValue || 0;
  const regularProfit = stats?.estimatedProfit || 0;
  const totalDiscount = stats?.totalDiscountValue || 0;
  const discountedCount = stats?.discountedProductsCount || 0;
  const totalExpectedWithDiscounts =
    stats?.totalDiscountedSaleValue !== undefined
      ? stats.totalDiscountedSaleValue
      : (stats?.totalSaleValue || 0) - totalDiscount;
  const profitWithDiscounts =
    stats?.profitWithDiscounts !== undefined ? stats.profitWithDiscounts : regularProfit - totalDiscount;

  const regularMarginPercent =
    totalCost > 0 ? Math.round((regularProfit / totalCost) * 100) : 0;
  const realMarginPercent =
    totalCost > 0 ? Math.round((profitWithDiscounts / totalCost) * 100) : 0;
  const isLoss = profitWithDiscounts < -0.001;

  // Formatted display values
  const totalCostDisplay = formatSmartCurrency(totalCost, currency);
  const totalCostExact = formatExactCurrency(totalCost, currency);

  const totalSaleDisplay = formatSmartCurrency(stats?.totalSaleValue || 0, currency);
  const totalSaleExact = formatExactCurrency(stats?.totalSaleValue || 0, currency);

  const totalExpectedDisplay = formatSmartCurrency(totalExpectedWithDiscounts, currency);
  const totalExpectedExact = formatExactCurrency(totalExpectedWithDiscounts, currency);

  const regularProfitDisplay = `+${formatSmartCurrency(regularProfit, currency)}`;
  const regularProfitExact = formatExactCurrency(regularProfit, currency);

  const totalDiscountDisplay = totalDiscount > 0 ? `-${formatSmartCurrency(totalDiscount, currency)}` : formatSmartCurrency(0, currency);
  const totalDiscountExact = formatExactCurrency(totalDiscount, currency);

  const profitWithDiscountsDisplay = profitWithDiscounts >= 0
    ? `+${formatSmartCurrency(profitWithDiscounts, currency)}`
    : `-${formatSmartCurrency(Math.abs(profitWithDiscounts), currency)}`;
  const profitWithDiscountsExact = formatExactCurrency(profitWithDiscounts, currency);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3.5 sm:gap-4 my-6">
      {/* 1. Total Artículos */}
      <div className="bg-white border border-slate-200 hover:border-sky-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative overflow-hidden group min-h-[130px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-sky-500" />
        <div className="flex items-start justify-between gap-2 min-h-[36px]">
          <span className="text-xs font-bold text-slate-700 leading-snug" title="Total Artículos">
            Total Artículos
          </span>
          <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <div
            className={`font-mono text-slate-900 leading-tight whitespace-nowrap ${getMetricFontSizeClass(String(stats?.totalProducts || 0))}`}
            title={`${stats?.totalProducts || 0} productos registrados`}
          >
            {stats?.totalProducts || 0}
          </div>
          <p className="text-[11px] font-medium text-slate-500 mt-1 leading-tight">
            {stats?.totalUnits || 0} unidades en stock
          </p>
        </div>
      </div>

      {/* 2. Inversión Costo */}
      <div className="bg-white border border-slate-200 hover:border-amber-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative overflow-hidden group min-h-[130px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
        <div className="flex items-start justify-between gap-2 min-h-[36px]">
          <span className="text-xs font-bold text-slate-700 leading-snug" title="Inversión en Costo">
            Inversión en Costo
          </span>
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <div
            className={`font-mono text-slate-900 leading-tight whitespace-nowrap ${getMetricFontSizeClass(totalCostDisplay)}`}
            title={`Valor exacto: ${totalCostExact}`}
          >
            {totalCostDisplay}
          </div>
          <p className="text-[11px] font-medium text-slate-500 mt-1 leading-tight">
            Costo total del inventario
          </p>
        </div>
      </div>

      {/* 3. Valor Esperado (PVP Catálogo) */}
      <div className="bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative overflow-hidden group min-h-[130px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
        <div className="flex items-start justify-between gap-2 min-h-[36px]">
          <span className="text-xs font-bold text-slate-700 leading-snug" title="Valor Catálogo (PVP)">
            Valor Catálogo (PVP)
          </span>
          <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <div
            className={`font-mono text-indigo-900 leading-tight whitespace-nowrap ${getMetricFontSizeClass(totalSaleDisplay)}`}
            title={`Valor exacto: ${totalSaleExact}`}
          >
            {totalSaleDisplay}
          </div>
          <p className="text-[11px] font-medium text-slate-500 mt-1 leading-tight">
            Precio regular de venta
          </p>
        </div>
      </div>

      {/* 4. Valor Esperado menos Descuentos */}
      <div className="bg-white border border-slate-200 hover:border-cyan-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative overflow-hidden group min-h-[130px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-cyan-500" />
        <div className="flex items-start justify-between gap-2 min-h-[36px]">
          <span className="text-xs font-bold text-slate-700 leading-snug" title="Valor con Ofertas">
            Valor con Ofertas
          </span>
          <div className="w-8 h-8 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-100 flex items-center justify-center shrink-0">
            <BadgeDollarSign className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <div
            className={`font-mono text-cyan-900 leading-tight whitespace-nowrap ${getMetricFontSizeClass(totalExpectedDisplay)}`}
            title={`Valor exacto: ${totalExpectedExact}`}
          >
            {totalExpectedDisplay}
          </div>
          <p className="text-[11px] font-medium text-slate-500 mt-1 leading-tight">
            {totalDiscount > 0 ? (
              <span className="text-cyan-700 font-semibold">PVP neto con promociones</span>
            ) : (
              'Sin descuentos activos'
            )}
          </p>
        </div>
      </div>

      {/* 5. Ganancia Estimada (Regular sin descuentos) */}
      <div className="bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative overflow-hidden group min-h-[130px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
        <div className="flex items-start justify-between gap-2 min-h-[36px]">
          <span className="text-xs font-bold text-slate-700 leading-snug" title="Ganancia Estimada">
            Ganancia Estimada
          </span>
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <div
            className={`font-mono text-emerald-900 leading-tight whitespace-nowrap ${getMetricFontSizeClass(regularProfitDisplay)}`}
            title={`Valor exacto: ${regularProfitExact}`}
          >
            {regularProfitDisplay}
          </div>
          <p className="text-[11px] font-medium text-slate-500 mt-1 leading-tight">
            {totalCost > 0 ? `${regularMarginPercent}% margen regular` : 'PVP catálogo'}
          </p>
        </div>
      </div>

      {/* 6. Total en Descuentos */}
      <div className="bg-white border border-slate-200 hover:border-rose-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative overflow-hidden group min-h-[130px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500" />
        <div className="flex items-start justify-between gap-2 min-h-[36px]">
          <span className="text-xs font-bold text-slate-700 leading-snug" title="Total Descuentos">
            Total Descuentos
          </span>
          <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0">
            <Tag className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <div
            className={`font-mono leading-tight whitespace-nowrap ${
              totalDiscount > 0 ? 'text-rose-600' : 'text-slate-900'
            } ${getMetricFontSizeClass(totalDiscountDisplay)}`}
            title={`Valor exacto: ${totalDiscountExact}`}
          >
            {totalDiscountDisplay}
          </div>
          <p className="text-[11px] font-medium text-slate-500 mt-1 leading-tight">
            {discountedCount > 0 ? (
              <span className="text-rose-700 font-semibold">{discountedCount} producto(s) en oferta</span>
            ) : (
              'Sin descuentos activos'
            )}
          </p>
        </div>
      </div>

      {/* 7. Ganancia Total con Descuentos */}
      <div className="bg-white border border-slate-200 hover:border-teal-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative overflow-hidden group min-h-[130px]">
        <div className={`absolute top-0 left-0 right-0 h-1 ${isLoss ? 'bg-rose-600 animate-pulse' : 'bg-teal-500'}`} />
        <div className="flex items-start justify-between gap-2 min-h-[36px]">
          <span className="text-xs font-bold text-slate-700 leading-snug" title="Margen con Ofertas">
            Margen con Ofertas
          </span>
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
              isLoss
                ? 'bg-rose-50 text-rose-600 border-rose-100'
                : 'bg-teal-50 text-teal-600 border-teal-100'
            }`}
          >
            {isLoss ? <AlertTriangle className="w-4 h-4" /> : <Scale className="w-4 h-4" />}
          </div>
        </div>
        <div className="mt-2">
          <div
            className={`font-mono leading-tight whitespace-nowrap ${
              isLoss
                ? 'text-rose-600 animate-pulse'
                : profitWithDiscounts > 0
                ? 'text-teal-900'
                : 'text-slate-900'
            } ${getMetricFontSizeClass(profitWithDiscountsDisplay)}`}
            title={`Valor exacto: ${profitWithDiscountsExact}`}
          >
            {profitWithDiscountsDisplay}
          </div>
          <p className="text-[11px] font-medium mt-1 leading-tight">
            {isLoss ? (
              <span className="text-rose-700 font-bold">⚠️ En pérdida ({realMarginPercent}%)</span>
            ) : totalDiscount > 0 ? (
              <span className="text-teal-700 font-semibold">{realMarginPercent}% margen neto real</span>
            ) : (
              <span className="text-slate-500">Igual a ganancia regular</span>
            )}
          </p>
        </div>
      </div>

      {/* 8. Mensajes Proveedor */}
      <div className="bg-white border border-slate-200 hover:border-purple-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative overflow-hidden group min-h-[130px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-purple-500" />
        <div className="flex items-start justify-between gap-2 min-h-[36px]">
          <span className="text-xs font-bold text-slate-700 leading-snug" title="Mensajes Proveedor">
            Mensajes Proveedor
          </span>
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <div
            className={`font-mono text-slate-900 leading-tight whitespace-nowrap ${getMetricFontSizeClass(String(totalMessagesCount))}`}
            title={`${totalMessagesCount} mensajes procesados`}
          >
            {totalMessagesCount}
          </div>
          <p className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center leading-tight">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 shrink-0 animate-pulse" />
            Gemini AI Activo
          </p>
        </div>
      </div>
    </div>
  );
};

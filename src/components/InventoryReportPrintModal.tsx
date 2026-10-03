import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, FileText, DollarSign, Package, Layers, TrendingUp, ArrowUpDown, Tag, Type } from 'lucide-react';
import { InventoryItem, StoreConfig } from '../types.ts';
import { calculateItemFinancials } from './InventoryView.tsx';

export interface InventoryReportPrintModalProps {
  items: InventoryItem[];
  storeConfig?: Partial<StoreConfig> | null;
  currency?: string;
  onClose: () => void;
}

export type InventoryReportSortOption = 'original' | 'name' | 'category';

export function printInventoryReportDocument(options: {
  sortedItems: any[];
  grandTotals: any;
  avgMargin: string;
  storeConfig?: Partial<StoreConfig> | null;
  currency: string;
  orientation: 'landscape' | 'portrait';
  sortBy: InventoryReportSortOption;
}) {
  const { sortedItems, grandTotals, avgMargin, storeConfig, currency, orientation, sortBy } = options;

  const fmtMoney = (val: number) =>
    `${currency}${val.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const storeName = storeConfig?.storeName || 'MI TIENDA';
  const storePhone = storeConfig?.whatsappNumber || '';
  const storeAddress = storeConfig?.address || '';
  const storeLogo = storeConfig?.logoDesktopUrl || storeConfig?.logoUrl || null;
  const currentDateStr = new Date().toLocaleString('es-EC', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  // Single continuous table HTML that fills 100% of every A4 page naturally without artificial page breaks
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reporte de Inventario - ${storeName}</title>
  <style>
    @page {
      size: A4 ${orientation};
      margin: 4mm 6mm;
    }
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: ${orientation === 'portrait' ? '7.5px' : '8.5px'};
      line-height: 1.15;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .report-container {
      width: 100%;
      background: #ffffff;
    }
    
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 1.5px solid #0f172a;
      padding-bottom: 3px;
      margin-bottom: 4px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .store-info {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .store-logo {
      height: 28px;
      max-width: 110px;
      object-fit: contain;
    }
    .store-title {
      font-size: 11.5px;
      font-weight: 800;
      text-transform: uppercase;
      color: #0f172a;
      margin: 0;
      line-height: 1.1;
    }
    .store-sub {
      font-size: 8px;
      color: #475569;
      margin: 0;
      line-height: 1.1;
    }
    .doc-meta {
      text-align: right;
    }
    .doc-badge {
      display: inline-block;
      padding: 1.5px 6px;
      background: #0f172a;
      color: #ffffff;
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      border-radius: 3px;
      margin-bottom: 2px;
    }
    .meta-text {
      font-size: 8px;
      color: #64748b;
      margin: 0;
      line-height: 1.1;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 5px;
      margin-bottom: 5px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .card {
      padding: 3px 6px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
    }
    .card-label {
      font-size: 7.5px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      line-height: 1;
    }
    .card-val {
      font-size: 10.5px;
      font-weight: 900;
      color: #0f172a;
      margin-top: 1px;
      line-height: 1.1;
    }
    .card-sub {
      font-size: 7.5px;
      color: #64748b;
      line-height: 1;
    }

    table.report-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: ${orientation === 'portrait' ? '7.5px' : '8.5px'};
    }

    thead {
      display: table-header-group;
    }
    tfoot {
      display: table-row-group;
    }
    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    table.report-table th {
      background: #0f172a;
      color: #ffffff;
      font-size: ${orientation === 'portrait' ? '7px' : '8px'};
      font-weight: 800;
      text-transform: uppercase;
      padding: 3px 2px;
      border: 1px solid #0f172a;
      text-align: left;
      line-height: 1.1;
    }
    table.report-table th.center { text-align: center; }
    table.report-table th.right { text-align: right; }
    
    table.report-table th.pvp-header {
      background: #0369a1 !important;
      color: #fef08a !important;
      font-weight: 900 !important;
    }

    table.report-table td {
      padding: 2px 2px;
      border-bottom: 1px solid #cbd5e1;
      border-right: 1px solid #e2e8f0;
      color: #1e293b;
      vertical-align: middle;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      line-height: 1.15;
    }
    table.report-table td.center { text-align: center; }
    table.report-table td.right { text-align: right; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    table.report-table td.mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    
    table.report-table td.pvp-cell {
      background-color: #fef3c7 !important;
      color: #000000 !important;
      font-weight: 900 !important;
      border-left: 1px solid #d97706 !important;
      border-right: 1px solid #d97706 !important;
    }

    table.report-table tr:nth-child(even) {
      background-color: #f1f5f9 !important;
    }

    table.report-table tfoot tr {
      background: #0f172a !important;
      color: #ffffff !important;
      font-weight: 800;
    }
    table.report-table tfoot td {
      border: 1px solid #0f172a !important;
      padding: 3px 2px !important;
      color: #ffffff !important;
    }
    table.report-table tfoot td.pvp-foot {
      background-color: #f59e0b !important;
      color: #000000 !important;
      font-weight: 900 !important;
    }

    .footer-note {
      margin-top: 4px;
      padding-top: 2px;
      border-top: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7.5px;
      color: #64748b;
      page-break-inside: avoid;
      break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="header">
      <div class="store-info">
        ${storeLogo ? `<img src="${storeLogo}" class="store-logo" />` : `<div style="width:26px;height:26px;background:#0f172a;color:#fff;font-weight:900;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:12px">${storeName.charAt(0)}</div>`}
        <div>
          <div class="store-title">${storeName}</div>
          ${storeAddress ? `<div class="store-sub">${storeAddress}</div>` : ''}
          ${storePhone ? `<div class="store-sub">Telf/WhatsApp: ${storePhone}</div>` : ''}
        </div>
      </div>
      <div class="doc-meta">
        <div class="doc-badge">REPORTE DE INVENTARIO VALORADO</div>
        <div class="meta-text">Emisión: ${currentDateStr}</div>
        <div class="meta-text">Orden: ${sortBy === 'name' ? 'Nombre A-Z' : sortBy === 'category' ? 'Categoría' : 'Selección'} | Total: ${sortedItems.length} items</div>
      </div>
    </div>

    <div class="cards-grid">
      <div class="card">
        <div class="card-label">Stock Total</div>
        <div class="card-val">${grandTotals.totalStock.toLocaleString('es-EC')} <span style="font-size:8px;font-weight:normal">uds</span></div>
      </div>
      <div class="card">
        <div class="card-label">Costo Total + IVA</div>
        <div class="card-val" style="color:#78350f">${fmtMoney(grandTotals.totalCostConIva)}</div>
        <div class="card-sub">Sin IVA: ${fmtMoney(grandTotals.totalCostSinIva)}</div>
      </div>
      <div class="card" style="background:#fef3c7;border-color:#f59e0b">
        <div class="card-label" style="color:#92400e">PVP Total + IVA ⭐</div>
        <div class="card-val" style="color:#78350f">${fmtMoney(grandTotals.totalPvpConIva)}</div>
        <div class="card-sub" style="color:#92400e">Sin IVA: ${fmtMoney(grandTotals.totalPvpSinIva)}</div>
      </div>
      <div class="card" style="background:#ecfdf5;border-color:#a7f3d0">
        <div class="card-label" style="color:#065f46">Ganancia Proyectada</div>
        <div class="card-val" style="color:#064e3b">${fmtMoney(grandTotals.totalProfit)}</div>
        <div class="card-sub" style="color:#047857">Margen prom: ${avgMargin}%</div>
      </div>
    </div>

    <table class="report-table">
      <thead>
        <tr>
          <th style="width:3%" class="center">#</th>
          <th style="width:9%">SKU / Código</th>
          <th style="width:18%">Producto</th>
          <th style="width:9%">Categoría</th>
          <th style="width:9%">Proveedor</th>
          <th style="width:4%" class="center">Stk</th>
          <th style="width:6.5%" class="right">Cost s/IVA</th>
          <th style="width:6.5%" class="right">Cost c/IVA</th>
          <th style="width:3.5%" class="center">IVA%</th>
          <th style="width:6.5%" class="right">PVP s/IVA</th>
          <th style="width:9.5%" class="right pvp-header">PVP c/IVA ⭐</th>
          <th style="width:3.5%" class="center">Desc%</th>
          <th style="width:7.5%" class="right">Gan. U.</th>
          <th style="width:4%" class="right">Marg%</th>
        </tr>
      </thead>
      <tbody>`;

  sortedItems.forEach((pi: any, itemIdx: number) => {
    const { item, fin } = pi;

    html += `
        <tr>
          <td class="center" style="font-weight:bold">${itemIdx + 1}</td>
          <td class="mono" style="font-weight:bold">${item.sku || `ID-${item.id}`}</td>
          <td style="font-weight:bold">${item.name}</td>
          <td>${item.category || 'Sin cat.'}</td>
          <td>${item.supplierName || '-'}</td>
          <td class="center" style="font-weight:bold">${item.stock}</td>
          <td class="right">${fmtMoney(fin.costWithoutTax)}</td>
          <td class="right">${fmtMoney(fin.costWithTax)}</td>
          <td class="center">${fin.taxRate > 0 ? fin.taxRate + '%' : '0%'}</td>
          <td class="right">${fmtMoney(fin.salePriceWithoutTax)}</td>
          <td class="right pvp-cell">${fmtMoney(fin.salePriceWithTax)}</td>
          <td class="center">${fin.discountPercent > 0 ? fin.discountPercent + '%' : '0%'}</td>
          <td class="right" style="font-weight:bold;color:${fin.isLoss ? '#dc2626' : '#047857'}">${fmtMoney(fin.unitProfit)}</td>
          <td class="right" style="font-weight:bold;color:${fin.isLoss ? '#dc2626' : '#047857'}">${fin.marginPercent.toFixed(1)}%</td>
        </tr>`;
  });

  html += `
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" style="text-align:right;text-transform:uppercase">TOTALES GENERALES (${sortedItems.length} ITEMS):</td>
          <td class="center" style="color:#fde047">${grandTotals.totalStock}</td>
          <td class="right">${fmtMoney(grandTotals.totalCostSinIva)}</td>
          <td class="right" style="color:#fde047">${fmtMoney(grandTotals.totalCostConIva)}</td>
          <td class="center">-</td>
          <td class="right">${fmtMoney(grandTotals.totalPvpSinIva)}</td>
          <td class="right pvp-foot">${fmtMoney(grandTotals.totalPvpConIva)}</td>
          <td class="center">-</td>
          <td class="right" style="color:#6ee7b7">${fmtMoney(grandTotals.totalProfit)}</td>
          <td class="right" style="color:#6ee7b7">${avgMargin}%</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer-note">
      <div>Comerxia ERP — Sistema de Gestión Comercial</div>
      <div>Documento Valoratorio (${orientation === 'landscape' ? 'Horizontal A4' : 'Vertical A4'})</div>
    </div>
  </div>
</body>
</html>`;

  // Trigger print via isolated hidden iframe
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const frameDoc = iframe.contentWindow?.document;
  if (frameDoc) {
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }, 250);
  }
}

export const InventoryReportPrintModal: React.FC<InventoryReportPrintModalProps> = ({
  items,
  storeConfig,
  currency = '$',
  onClose,
}) => {
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [sortBy, setSortBy] = useState<InventoryReportSortOption>('original');

  // Format money helper
  const fmtMoney = (val: number) => {
    return `${currency}${val.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Precompute metrics & totals for each item
  const rawProcessedItems = items.map((item, idx) => {
    const fin = calculateItemFinancials(item);
    const qty = Math.max(0, Number(item.stock) || 0);

    const totalCostSinIva = fin.costWithoutTax * qty;
    const totalCostConIva = fin.costWithTax * qty;
    const totalPvpSinIva = fin.salePriceWithoutTax * qty;
    const totalPvpConIva = fin.salePriceWithTax * qty;
    const totalProfit = fin.unitProfit * qty;

    return {
      originalIdx: idx + 1,
      item,
      fin,
      qty,
      totalCostSinIva,
      totalCostConIva,
      totalPvpSinIva,
      totalPvpConIva,
      totalProfit,
    };
  });

  // Sort items based on selected criteria
  const sortedItems = useMemo(() => {
    return [...rawProcessedItems].sort((a, b) => {
      if (sortBy === 'name') {
        return (a.item.name || '').localeCompare(b.item.name || '', 'es', { sensitivity: 'base' });
      }
      if (sortBy === 'category') {
        const catA = (a.item.category || 'Sin categoría').trim();
        const catB = (b.item.category || 'Sin categoría').trim();
        const catComp = catA.localeCompare(catB, 'es', { sensitivity: 'base' });
        if (catComp !== 0) return catComp;
        return (a.item.name || '').localeCompare(b.item.name || '', 'es', { sensitivity: 'base' });
      }
      return 0; // Keep original selection order
    });
  }, [rawProcessedItems, sortBy]);

  // Calculate grand totals across all selected products
  const grandTotals = rawProcessedItems.reduce(
    (acc, curr) => {
      acc.totalStock += curr.qty;
      acc.totalCostSinIva += curr.totalCostSinIva;
      acc.totalCostConIva += curr.totalCostConIva;
      acc.totalPvpSinIva += curr.totalPvpSinIva;
      acc.totalPvpConIva += curr.totalPvpConIva;
      acc.totalProfit += curr.totalProfit;
      return acc;
    },
    {
      totalStock: 0,
      totalCostSinIva: 0,
      totalCostConIva: 0,
      totalPvpSinIva: 0,
      totalPvpConIva: 0,
      totalProfit: 0,
    }
  );

  const avgMargin =
    grandTotals.totalCostSinIva > 0
      ? ((grandTotals.totalProfit / grandTotals.totalCostSinIva) * 100).toFixed(1)
      : '0.0';

  const storeName = storeConfig?.storeName || 'MI TIENDA';
  const storePhone = storeConfig?.whatsappNumber || '';
  const storeAddress = storeConfig?.address || '';
  const storeLogo = storeConfig?.logoDesktopUrl || storeConfig?.logoUrl || null;
  const currentDateStr = new Date().toLocaleString('es-EC', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const handlePrint = () => {
    printInventoryReportDocument({
      sortedItems,
      grandTotals,
      avgMargin,
      storeConfig,
      currency,
      orientation,
      sortBy,
    });
  };

  if (typeof document === 'undefined') return null;

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-fadeIn">
      {/* Modal Container */}
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-4 sm:px-5 py-3 bg-slate-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-sky-600 rounded-xl text-white shadow-xs shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                Reporte de Inventario A4
                <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30 text-xs font-semibold">
                  {items.length} {items.length === 1 ? 'producto' : 'productos'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-300 hidden sm:block">
                Aprovechamiento al 100% de cada hoja A4 antes de pasar a la siguiente hoja.
              </p>
            </div>
          </div>

          {/* Controls Bar: Sort + Orientation + Print */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            {/* Sort Order Selector */}
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs text-slate-300 font-medium">
              <span className="text-[10px] uppercase font-bold text-slate-400 px-2 flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3 text-sky-400" />
                Orden:
              </span>
              <button
                type="button"
                onClick={() => setSortBy('original')}
                className={`px-2 py-0.5 rounded-lg transition text-[11px] ${
                  sortBy === 'original'
                    ? 'bg-sky-600 text-white font-bold shadow-xs'
                    : 'hover:text-white hover:bg-slate-700'
                }`}
                title="Mantener orden de selección original"
              >
                Selección
              </button>
              <button
                type="button"
                onClick={() => setSortBy('name')}
                className={`px-2 py-0.5 rounded-lg transition text-[11px] flex items-center gap-1 ${
                  sortBy === 'name'
                    ? 'bg-sky-600 text-white font-bold shadow-xs'
                    : 'hover:text-white hover:bg-slate-700'
                }`}
                title="Ordenar alfabéticamente por nombre del producto (A-Z)"
              >
                <Type className="w-3 h-3" />
                Nombre A-Z
              </button>
              <button
                type="button"
                onClick={() => setSortBy('category')}
                className={`px-2 py-0.5 rounded-lg transition text-[11px] flex items-center gap-1 ${
                  sortBy === 'category'
                    ? 'bg-sky-600 text-white font-bold shadow-xs'
                    : 'hover:text-white hover:bg-slate-700'
                }`}
                title="Ordenar alfabéticamente por categoría (A-Z)"
              >
                <Tag className="w-3 h-3" />
                Categoría
              </button>
            </div>

            {/* Orientation selector */}
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs text-slate-300 font-medium">
              <button
                type="button"
                onClick={() => setOrientation('portrait')}
                className={`px-2.5 py-1 rounded-lg transition text-[11px] ${
                  orientation === 'portrait'
                    ? 'bg-sky-600 text-white font-bold shadow-xs'
                    : 'hover:text-white hover:bg-slate-700'
                }`}
              >
                Vertical (A4)
              </button>
              <button
                type="button"
                onClick={() => setOrientation('landscape')}
                className={`px-2.5 py-1 rounded-lg transition text-[11px] ${
                  orientation === 'landscape'
                    ? 'bg-sky-600 text-white font-bold shadow-xs'
                    : 'hover:text-white hover:bg-slate-700'
                }`}
              >
                Horizontal (A4)
              </button>
            </div>

            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center space-x-1.5 cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
              title="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Screen Preview Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-100">
          <div
            className="bg-white text-slate-900 mx-auto shadow-xl border border-slate-300 rounded-lg p-4 sm:p-6 font-sans text-xs transition-all duration-200"
            style={{
              width: orientation === 'landscape' ? '287mm' : '190mm',
              maxWidth: '100%',
            }}
          >
            {/* Header Document Section */}
            <div className="flex items-start justify-between pb-2.5 mb-2.5 border-b-2 border-slate-900 gap-3">
              <div className="flex items-center space-x-3">
                {storeLogo ? (
                  <img
                    src={storeLogo}
                    alt={storeName}
                    className="h-9 w-auto max-w-[130px] object-contain"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-xl bg-slate-900 text-white font-black text-sm flex items-center justify-center shadow-xs">
                    {storeName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h1 className="font-extrabold text-sm sm:text-base text-slate-900 uppercase tracking-tight">
                    {storeName}
                  </h1>
                  {storeAddress && (
                    <p className="text-[10px] text-slate-600 font-medium">{storeAddress}</p>
                  )}
                  {storePhone && (
                    <p className="text-[10px] text-slate-600 font-medium">Telf / WhatsApp: {storePhone}</p>
                  )}
                </div>
              </div>

              <div className="text-right">
                <div className="inline-block px-2 py-0.5 bg-slate-900 text-white rounded font-bold text-[10px] uppercase tracking-wider mb-0.5">
                  REPORTE DE INVENTARIO VALORADO
                </div>
                <p className="text-[10px] text-slate-500 font-semibold">
                  Emisión: <span className="text-slate-800">{currentDateStr}</span>
                </p>
                <p className="text-[10px] text-slate-500 font-semibold">
                  Orden: <span className="text-slate-900 font-bold uppercase">{sortBy === 'name' ? 'Alfabético' : sortBy === 'category' ? 'Categoría' : 'Selección'}</span> | Total: <span className="text-slate-900 font-bold">{items.length} productos</span>
                </p>
              </div>
            </div>

            {/* Financial Summary Top Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase mb-0.5">
                  <span>Stock Total</span>
                  <Package className="w-3.5 h-3.5 text-sky-600" />
                </div>
                <div className="text-sm font-extrabold text-slate-900">
                  {grandTotals.totalStock.toLocaleString('es-EC')} <span className="text-[11px] font-normal text-slate-500">uds</span>
                </div>
              </div>

              <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase mb-0.5">
                  <span>Costo Total + IVA</span>
                  <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="text-sm font-extrabold text-amber-900">
                  {fmtMoney(grandTotals.totalCostConIva)}
                </div>
                <div className="text-[9px] text-slate-500">
                  Sin IVA: {fmtMoney(grandTotals.totalCostSinIva)}
                </div>
              </div>

              <div className="p-2 bg-amber-50 border border-amber-300 rounded-xl shadow-2xs">
                <div className="flex items-center justify-between text-amber-900 text-[10px] font-extrabold uppercase mb-0.5">
                  <span>PVP Total + IVA ⭐</span>
                  <Layers className="w-3.5 h-3.5 text-amber-700" />
                </div>
                <div className="text-sm font-black text-amber-950">
                  {fmtMoney(grandTotals.totalPvpConIva)}
                </div>
                <div className="text-[9px] font-bold text-amber-800">
                  Sin IVA: {fmtMoney(grandTotals.totalPvpSinIva)}
                </div>
              </div>

              <div className="p-2 bg-emerald-50/80 border border-emerald-200 rounded-xl">
                <div className="flex items-center justify-between text-emerald-800 text-[10px] font-bold uppercase mb-0.5">
                  <span>Ganancia Proyectada</span>
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="text-sm font-extrabold text-emerald-950">
                  {fmtMoney(grandTotals.totalProfit)}
                </div>
                <div className="text-[9px] font-bold text-emerald-700">
                  Margen prom: {avgMargin}%
                </div>
              </div>
            </div>

            {/* Products Table */}
            <div className="w-full overflow-hidden">
              <table
                className="w-full border-collapse text-slate-900 font-sans leading-tight table-fixed"
                style={{
                  fontSize: orientation === 'portrait' ? '8px' : '9px',
                }}
              >
                <thead>
                  <tr className="bg-slate-900 text-white text-[8px] sm:text-[9px] uppercase tracking-tighter font-extrabold border border-slate-900">
                    <th style={{ width: '3.5%' }} className="py-1.5 px-0.5 text-center border-r border-slate-700">#</th>
                    <th style={{ width: '8.5%' }} className="py-1.5 px-1 text-left border-r border-slate-700 truncate">SKU / Código</th>
                    <th style={{ width: '16%' }} className="py-1.5 px-1 text-left border-r border-slate-700 truncate">Producto</th>
                    <th style={{ width: '8.5%' }} className="py-1.5 px-1 text-left border-r border-slate-700 truncate">Categoría</th>
                    <th style={{ width: '8.5%' }} className="py-1.5 px-1 text-left border-r border-slate-700 truncate">Proveedor</th>
                    <th style={{ width: '4%' }} className="py-1.5 px-0.5 text-center border-r border-slate-700">Stk</th>
                    <th style={{ width: '7%' }} className="py-1.5 px-0.5 text-right border-r border-slate-700 truncate">Cost. s/IVA</th>
                    <th style={{ width: '7%' }} className="py-1.5 px-0.5 text-right border-r border-slate-700 truncate">Cost. c/IVA</th>
                    <th style={{ width: '4%' }} className="py-1.5 px-0.5 text-center border-r border-slate-700">IVA%</th>
                    <th style={{ width: '7%' }} className="py-1.5 px-0.5 text-right border-r border-slate-700 truncate">PVP s/IVA</th>
                    
                    {/* HIGHLIGHTED PVP c/IVA COLUMN HEADER */}
                    <th style={{ width: '9.5%' }} className="py-1.5 px-0.5 text-right border-r border-slate-700 bg-sky-800 text-amber-300 font-black truncate">
                      PVP c/IVA ⭐
                    </th>
                    
                    <th style={{ width: '4%' }} className="py-1.5 px-0.5 text-center border-r border-slate-700">Desc%</th>
                    <th style={{ width: '8%' }} className="py-1.5 px-0.5 text-right border-r border-slate-700 truncate">Gan. U.</th>
                    <th style={{ width: '4.5%' }} className="py-1.5 px-0.5 text-right">Marg%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 border-x border-b border-slate-300">
                  {sortedItems.map((pi, index) => {
                    const { item, fin } = pi;
                    const isEven = index % 2 === 0;

                    return (
                      <tr
                        key={item.id}
                        className={`${isEven ? 'bg-white' : 'bg-slate-100/90'} hover:bg-sky-100/80 transition-colors`}
                      >
                        <td className="py-1 px-0.5 text-center font-bold text-slate-500 border-r border-slate-200 truncate">
                          {index + 1}
                        </td>
                        <td className="py-1 px-1 font-mono font-bold text-slate-800 border-r border-slate-200 truncate">
                          {item.sku || `ID-${item.id}`}
                        </td>
                        <td className="py-1 px-1 font-bold text-slate-900 border-r border-slate-200 truncate" title={item.name}>
                          {item.name}
                        </td>
                        <td className="py-1 px-1 text-slate-600 border-r border-slate-200 truncate" title={item.category || 'Sin categoría'}>
                          {item.category || 'Sin cat.'}
                        </td>
                        <td className="py-1 px-1 text-slate-600 border-r border-slate-200 truncate" title={`${item.supplierName || ''} ${item.supplierCode ? `(${item.supplierCode})` : ''}`}>
                          {item.supplierName || '-'}
                        </td>
                        <td className="py-1 px-0.5 text-center font-bold border-r border-slate-200">
                          <span
                            className={`px-1 rounded text-[9px] ${
                              item.stock <= 0
                                ? 'bg-red-100 text-red-800 font-extrabold'
                                : item.stock <= 5
                                ? 'bg-amber-100 text-amber-800 font-extrabold'
                                : 'bg-slate-100 text-slate-800 font-bold'
                            }`}
                          >
                            {item.stock}
                          </span>
                        </td>
                        <td className="py-1 px-0.5 text-right font-mono text-slate-700 border-r border-slate-200 truncate">
                          {fmtMoney(fin.costWithoutTax)}
                        </td>
                        <td className="py-1 px-0.5 text-right font-mono font-medium text-slate-900 border-r border-slate-200 truncate">
                          {fmtMoney(fin.costWithTax)}
                        </td>
                        <td className="py-1 px-0.5 text-center font-mono text-slate-600 border-r border-slate-200">
                          {fin.taxRate > 0 ? `${fin.taxRate}%` : '0%'}
                        </td>
                        <td className="py-1 px-0.5 text-right font-mono text-slate-700 border-r border-slate-200 truncate">
                          {fmtMoney(fin.salePriceWithoutTax)}
                        </td>
                        
                        {/* HIGHLIGHTED FINAL PVP CELL */}
                        <td className="py-1 px-0.5 text-right font-mono font-black text-slate-950 bg-amber-100/90 border-r border-amber-300 truncate">
                          {fmtMoney(fin.salePriceWithTax)}
                        </td>

                        <td className="py-1 px-0.5 text-center font-mono border-r border-slate-200">
                          {fin.discountPercent > 0 ? (
                            <span className="font-bold text-amber-700">{fin.discountPercent}%</span>
                          ) : (
                            <span className="text-slate-400">0%</span>
                          )}
                        </td>
                        <td className="py-1 px-0.5 text-right font-mono font-bold border-r border-slate-200 truncate">
                          <span className={fin.isLoss ? 'text-red-600' : 'text-emerald-700'}>
                            {fmtMoney(fin.unitProfit)}
                          </span>
                        </td>
                        <td className="py-1 px-0.5 text-right font-mono font-bold truncate">
                          <span className={fin.isLoss ? 'text-red-600' : 'text-emerald-700'}>
                            {fin.marginPercent.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Footer Totals Row */}
                <tfoot>
                  <tr className="bg-slate-900 text-white font-bold text-[8px] sm:text-[9.5px] border-t-2 border-slate-900">
                    <td colSpan={5} className="py-2 px-2 text-right uppercase tracking-wider">
                      TOTALES GENERALES ({items.length} ITEMS):
                    </td>
                    <td className="py-2 px-0.5 text-center font-extrabold text-amber-300">
                      {grandTotals.totalStock}
                    </td>
                    <td className="py-2 px-0.5 text-right font-mono truncate">
                      {fmtMoney(grandTotals.totalCostSinIva)}
                    </td>
                    <td className="py-2 px-0.5 text-right font-mono font-extrabold text-amber-200 truncate">
                      {fmtMoney(grandTotals.totalCostConIva)}
                    </td>
                    <td className="py-2 px-0.5 text-center font-mono">-</td>
                    <td className="py-2 px-0.5 text-right font-mono truncate">
                      {fmtMoney(grandTotals.totalPvpSinIva)}
                    </td>
                    
                    {/* HIGHLIGHTED TOTAL PVP c/IVA FOOTER CELL */}
                    <td className="py-2 px-0.5 text-right font-mono font-black text-amber-950 bg-amber-400 truncate">
                      {fmtMoney(grandTotals.totalPvpConIva)}
                    </td>

                    <td className="py-2 px-0.5 text-center font-mono">-</td>
                    <td className="py-2 px-0.5 text-right font-mono font-extrabold text-emerald-300 truncate">
                      {fmtMoney(grandTotals.totalProfit)}
                    </td>
                    <td className="py-2 px-0.5 text-right font-mono font-extrabold text-emerald-300 truncate">
                      {avgMargin}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Document Footer */}
            <div className="mt-4 pt-2 border-t border-slate-300 flex items-center justify-between text-[9px] text-slate-500">
              <div>
                <p className="font-semibold text-slate-700">Comerxia ERP — Sistema de Gestión Comercial</p>
                <p>Reporte oficial de inventario valorado para control físico y financiero.</p>
              </div>
              <div className="text-right font-mono">
                Documento A4 ({orientation === 'landscape' ? 'Horizontal' : 'Vertical'})
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Bar */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-600 font-medium hidden sm:block">
            💡 Consejo: Selecciona <span className="font-bold text-slate-800">"Guardar como PDF"</span> en la ventana de impresión para guardar el informe digitalmente.
          </div>
          <div className="flex items-center space-x-2 ml-auto sm:ml-0">
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Cerrar
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Reporte (A4)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

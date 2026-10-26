import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, FileText, DollarSign, Package, Layers, TrendingUp, ArrowUpDown, Tag, Type, List, ArrowUp, ArrowDown } from 'lucide-react';
import { InventoryItem, StoreConfig } from '../types.ts';
import { calculateItemFinancials } from './InventoryView.tsx';
import { normalizeMediaUrl } from '../utils/media-helper.ts';

function getProductCoverPhoto(item: InventoryItem | any): string {
  if (!item) return '';
  let url = '';
  if (item.imageUrl && typeof item.imageUrl === 'string' && item.imageUrl.trim()) {
    url = item.imageUrl.trim();
  } else if (Array.isArray(item.images) && item.images.length > 0) {
    const first = item.images.find((img: any) => typeof img === 'string' && img.trim());
    if (first) url = first.trim();
  } else if (typeof item.images === 'string' && item.images.trim()) {
    try {
      const parsed = JSON.parse(item.images);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed.find((img: any) => typeof img === 'string' && img.trim());
        if (first) url = first.trim();
      }
    } catch {
      // not JSON
    }
  }
  return normalizeMediaUrl(url);
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface InventoryReportPrintModalProps {
  items: InventoryItem[];
  storeConfig?: Partial<StoreConfig> | null;
  currency?: string;
  initialSortBy?: InventoryReportSortOption;
  onClose: () => void;
}

export type InventoryReportSortOption = 'original' | 'name' | 'category' | 'price_asc' | 'price_desc';

export function getInventoryReportSortLabel(sort: InventoryReportSortOption): string {
  switch (sort) {
    case 'name':
      return 'Nombre A-Z';
    case 'category':
      return 'Categoría';
    case 'price_asc':
      return 'Precio (Menor a Mayor)';
    case 'price_desc':
      return 'Precio (Mayor a Menor)';
    case 'original':
    default:
      return 'Selección';
  }
}

export function printInventoryReportDocument(options: {
  sortedItems: any[];
  grandTotals: any;
  avgMargin: string;
  avgValuationMargin?: string;
  storeConfig?: Partial<StoreConfig> | null;
  currency: string;
  orientation: 'landscape' | 'portrait';
  sortBy: InventoryReportSortOption;
}) {
  const { sortedItems, grandTotals, avgMargin, avgValuationMargin, storeConfig, currency, orientation, sortBy } = options;

  const fmtMoney = (val: number) =>
    `${currency}${(Number(val) || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
        <div class="meta-text">Orden: ${getInventoryReportSortLabel(sortBy)} | Total: ${sortedItems.length} items</div>
      </div>
    </div>

    <div class="cards-grid">
      <div class="card">
        <div class="card-label">Stock Total</div>
        <div class="card-val">${grandTotals.totalStock.toLocaleString('es-EC')} <span style="font-size:8px;font-weight:normal">uds</span></div>
      </div>
      <div class="card">
        <div class="card-label">${grandTotals.totalStock > 0 ? 'Costo Total Valorado' : 'Sumatoria Costo + IVA'}</div>
        <div class="card-val" style="color:#78350f">${fmtMoney(grandTotals.totalStock > 0 ? grandTotals.totalCostConIva : grandTotals.sumCostConIva)}</div>
        <div class="card-sub">Sin IVA: ${fmtMoney(grandTotals.totalStock > 0 ? grandTotals.totalCostSinIva : grandTotals.sumCostSinIva)}</div>
      </div>
      <div class="card" style="background:#fef3c7;border-color:#f59e0b">
        <div class="card-label" style="color:#92400e">${grandTotals.totalStock > 0 ? 'PVP Total Valorado ⭐' : 'Sumatoria PVP + IVA ⭐'}</div>
        <div class="card-val" style="color:#78350f">${fmtMoney(grandTotals.totalStock > 0 ? grandTotals.totalPvpConIva : grandTotals.sumPvpConIva)}</div>
        <div class="card-sub" style="color:#92400e">Sin IVA: ${fmtMoney(grandTotals.totalStock > 0 ? grandTotals.totalPvpSinIva : grandTotals.sumPvpSinIva)}</div>
      </div>
      <div class="card" style="background:#ecfdf5;border-color:#a7f3d0">
        <div class="card-label" style="color:#065f46">Ganancia Proyectada</div>
        <div class="card-val" style="color:#064e3b">${fmtMoney(grandTotals.totalStock > 0 ? grandTotals.totalProfit : grandTotals.sumProfit)}</div>
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
          <td class="right">${fmtMoney(grandTotals.sumCostSinIva)}</td>
          <td class="right" style="color:#fde047">${fmtMoney(grandTotals.sumCostConIva)}</td>
          <td class="center">-</td>
          <td class="right">${fmtMoney(grandTotals.sumPvpSinIva)}</td>
          <td class="right pvp-foot">${fmtMoney(grandTotals.sumPvpConIva)}</td>
          <td class="center">-</td>
          <td class="right" style="color:#6ee7b7">${fmtMoney(grandTotals.sumProfit)}</td>
          <td class="right" style="color:#6ee7b7">${avgMargin}%</td>
        </tr>
        ${grandTotals.totalStock > 0 ? `
        <tr style="background:#1e293b !important;border-top:1px dashed #64748b;">
          <td colspan="5" style="text-align:right;text-transform:uppercase;font-size:7px;color:#94a3b8">VALORIZACIÓN EN INVENTARIO (TOTAL × STOCK):</td>
          <td class="center" style="color:#fde047;font-size:7.5px">${grandTotals.totalStock} uds</td>
          <td class="right" style="font-size:7.5px;color:#cbd5e1">${fmtMoney(grandTotals.totalCostSinIva)}</td>
          <td class="right" style="color:#fde047;font-size:7.5px">${fmtMoney(grandTotals.totalCostConIva)}</td>
          <td class="center" style="font-size:7.5px">-</td>
          <td class="right" style="font-size:7.5px;color:#cbd5e1">${fmtMoney(grandTotals.totalPvpSinIva)}</td>
          <td class="right pvp-foot" style="font-size:7.5px">${fmtMoney(grandTotals.totalPvpConIva)}</td>
          <td class="center" style="font-size:7.5px">-</td>
          <td class="right" style="color:#6ee7b7;font-size:7.5px">${fmtMoney(grandTotals.totalProfit)}</td>
          <td class="right" style="color:#6ee7b7;font-size:7.5px">${avgValuationMargin || avgMargin}%</td>
        </tr>` : ''}
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

// ─────────────────────────────────────────────────────────────────────────────
// Price List print: Single continuous table row per product with cover thumbnail
// ─────────────────────────────────────────────────────────────────────────────
export function printPriceListDocument(options: {
  sortedItems: any[];
  grandTotals?: any;
  storeConfig?: Partial<StoreConfig> | null;
  currency: string;
  orientation: 'landscape' | 'portrait';
  sortBy: InventoryReportSortOption;
}) {
  const { sortedItems, grandTotals, storeConfig, currency, orientation, sortBy } = options;

  const fmtMoney = (val: number) =>
    `${currency}${val.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const storeName = storeConfig?.storeName || 'MI TIENDA';
  const storePhone = storeConfig?.whatsappNumber || '';
  const storeAddress = storeConfig?.address || '';
  const storeLogo = storeConfig?.logoDesktopUrl || storeConfig?.logoUrl || null;
  const currentDateStr = new Date().toLocaleString('es-EC', { dateStyle: 'long', timeStyle: 'short' });
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const fontSize = orientation === 'portrait' ? '8px' : '9px';
  const thFontSize = orientation === 'portrait' ? '7.5px' : '8.5px';
  const pvpFontSize = orientation === 'portrait' ? '10px' : '11.5px';

  const rowsHtml = sortedItems
    .map((pi: any, idx: number) => {
      const { item, fin } = pi;
      const code = item.sku || item.barcode || item.supplierCode || `ID-${item.id}`;
      const cleanCover = getProductCoverPhoto(item);
      const coverUrl = cleanCover ? (cleanCover.startsWith('/') ? `${origin}${cleanCover}` : cleanCover) : '';
      const escapedName = escapeHtml(item.name || '');
      const category = escapeHtml(item.category || 'Sin cat.');

      return `
        <tr>
          <td class="center row-idx">${idx + 1}</td>
          <td class="center photo-col">
            ${
              coverUrl
                ? `
              <div class="thumb-box">
                <img src="${coverUrl}" class="thumb-img" alt="${escapedName}" loading="eager" decoding="sync" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';" />
                <div class="thumb-placeholder" style="display:none;"><span>Sin foto</span></div>
              </div>`
                : `
              <div class="thumb-box">
                <div class="thumb-placeholder"><span>Sin foto</span></div>
              </div>`
            }
          </td>
          <td class="mono code-cell">
            <div class="code-primary">${escapeHtml(code)}</div>
            ${item.barcode && item.barcode !== code ? `<div class="code-sub">${escapeHtml(item.barcode)}</div>` : ''}
          </td>
          <td class="name-cell">
            <div class="name-text" title="${escapedName}">${escapedName}</div>
          </td>
          <td class="cat-cell">${category}</td>
          <td class="right pvp-cell">${fmtMoney(fin.salePriceWithTax)}</td>
        </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <base href="${origin}/">
  <title>Lista de Precios - ${storeName}</title>
  <style>
    @page {
      size: A4 ${orientation};
      margin: 5mm 6mm;
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
      font-size: ${fontSize};
      line-height: 1.2;
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
      border-bottom: 2px solid #0f172a;
      padding-bottom: 4px;
      margin-bottom: 5px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .store-info { display: flex; align-items: center; gap: 8px; }
    .store-logo { height: 28px; max-width: 110px; object-fit: contain; }
    .store-title { font-size: 11.5px; font-weight: 800; text-transform: uppercase; color: #0f172a; margin: 0; line-height: 1.1; }
    .store-sub { font-size: 7.5px; color: #475569; margin: 0; line-height: 1.1; }
    .doc-meta { text-align: right; }
    .doc-badge {
      display: inline-block;
      padding: 2px 7px;
      background: #0369a1;
      color: #fef08a;
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      border-radius: 3px;
      margin-bottom: 2px;
    }
    .meta-text { font-size: 7.5px; color: #64748b; margin: 0; line-height: 1.1; }

    table.pricelist-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: ${fontSize};
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
    th {
      background: #0f172a;
      color: #ffffff;
      font-size: ${thFontSize};
      font-weight: 800;
      text-transform: uppercase;
      padding: 3.5px 3px;
      border: 1px solid #0f172a;
      text-align: left;
      line-height: 1.1;
    }
    th.center { text-align: center; }
    th.right { text-align: right; }
    th.pvp-th {
      background: #0369a1 !important;
      color: #fef08a !important;
      font-weight: 900 !important;
    }

    td {
      padding: 2.5px 3px;
      border-bottom: 1px solid #cbd5e1;
      border-right: 1px solid #e2e8f0;
      color: #1e293b;
      vertical-align: middle;
      line-height: 1.15;
    }
    td.center { text-align: center; }
    td.right { text-align: right; }
    td.mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }

    tr:nth-child(even) {
      background-color: #f8fafc !important;
    }

    .row-idx {
      font-weight: 800;
      color: #64748b;
      font-size: 7.5px;
    }
    .photo-col {
      padding: 3px 2px;
      width: ${orientation === 'landscape' ? '76px' : '72px'};
    }
    .thumb-box {
      width: ${orientation === 'landscape' ? '68px' : '64px'};
      height: ${orientation === 'landscape' ? '68px' : '64px'};
      margin: 0 auto;
      border-radius: 6px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
    }
    .thumb-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .thumb-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      text-align: center;
      line-height: 1;
      padding: 2px;
    }
    .code-cell {
      font-weight: 800;
      color: #1e293b;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .code-primary {
      font-size: ${orientation === 'portrait' ? '7.5px' : '8.5px'};
    }
    .code-sub {
      font-size: 6.5px;
      color: #64748b;
      font-weight: normal;
    }
    .name-cell {
      font-weight: 700;
      color: #0f172a;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .name-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: ${orientation === 'portrait' ? '8px' : '9px'};
    }
    .cat-cell {
      color: #475569;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: ${orientation === 'portrait' ? '7.5px' : '8.5px'};
    }
    td.pvp-cell {
      background-color: #f0f9ff !important;
      color: #0369a1 !important;
      font-weight: 900 !important;
      font-size: ${pvpFontSize};
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      border-left: 1px solid #93c5fd !important;
      border-right: 1px solid #93c5fd !important;
      white-space: nowrap;
    }

    tfoot tr {
      background: #0f172a !important;
      color: #ffffff !important;
      font-weight: 800;
    }
    tfoot td {
      border: 1px solid #0f172a !important;
      padding: 3px 4px !important;
      color: #ffffff !important;
    }
    tfoot td.pvp-foot {
      background-color: #0369a1 !important;
      color: #fef08a !important;
      font-weight: 900 !important;
      text-align: right;
    }

    .footer {
      margin-top: 5px;
      padding-top: 2px;
      border-top: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      font-size: 7px;
      color: #94a3b8;
      page-break-inside: avoid;
      break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="header">
      <div class="store-info">
        ${
          storeLogo
            ? `<img src="${storeLogo}" class="store-logo" />`
            : `<div style="width:24px;height:24px;background:#0f172a;color:#fff;font-weight:900;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px">${storeName.charAt(0)}</div>`
        }
        <div>
          <div class="store-title">${storeName}</div>
          ${storeAddress ? `<div class="store-sub">${storeAddress}</div>` : ''}
          ${storePhone ? `<div class="store-sub">Telf/WhatsApp: ${storePhone}</div>` : ''}
        </div>
      </div>
      <div class="doc-meta">
        <div class="doc-badge">LISTA DE PRECIOS c/IVA</div>
        <div class="meta-text">Emisión: ${currentDateStr}</div>
        <div class="meta-text">Orden: ${getInventoryReportSortLabel(sortBy)} | ${sortedItems.length} productos</div>
      </div>
    </div>

    <table class="pricelist-table">
      <thead>
        <tr>
          <th style="width:${orientation === 'landscape' ? '3%' : '3%'};" class="center">#</th>
          <th style="width:${orientation === 'landscape' ? '9.5%' : '14%'};" class="center">Foto</th>
          <th style="width:${orientation === 'landscape' ? '14%' : '15%'};">Código / SKU</th>
          <th style="width:${orientation === 'landscape' ? '48.5%' : '41%'};">Producto</th>
          <th style="width:${orientation === 'landscape' ? '12%' : '13%'};">Categoría</th>
          <th style="width:${orientation === 'landscape' ? '13%' : '14%'};" class="right pvp-th">PVP c/IVA ⭐</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" style="text-align:right;text-transform:uppercase;font-size:${orientation === 'portrait' ? '7.5px' : '8.5px'}">
            TOTAL DE PRODUCTOS EN LISTA (${sortedItems.length} ITEMS${grandTotals?.totalStock > 0 ? ` · ${grandTotals.totalStock} UDS EN STOCK` : ''}):
          </td>
          <td class="right pvp-foot">
            ${fmtMoney(grandTotals?.sumPvpConIva ?? grandTotals?.totalPvpConIva ?? 0)}
          </td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <div>Comerxia ERP — Lista de Precios con IVA incluido</div>
      <div>${orientation === 'landscape' ? 'A4 Horizontal' : 'A4 Vertical'} · ${sortedItems.length} ítems</div>
    </div>
  </div>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  const frameDoc = iframe.contentWindow?.document;
  if (frameDoc) {
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    const doPrint = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    };

    // Ensure all images are loaded before triggering print dialog
    const imgs = Array.from(frameDoc.images);
    if (imgs.length === 0) {
      setTimeout(doPrint, 250);
    } else {
      let loaded = 0;
      let finished = false;
      const total = imgs.length;
      const finish = () => {
        if (finished) return;
        finished = true;
        setTimeout(doPrint, 100);
      };

      const timer = setTimeout(finish, 1500); // 1.5s fallback limit

      imgs.forEach((img) => {
        if (img.complete) {
          loaded++;
          if (loaded >= total) {
            clearTimeout(timer);
            finish();
          }
        } else {
          img.onload = img.onerror = () => {
            loaded++;
            if (loaded >= total) {
              clearTimeout(timer);
              finish();
            }
          };
        }
      });
    }
  }
}

export const InventoryReportPrintModal: React.FC<InventoryReportPrintModalProps> = ({
  items,
  storeConfig,
  currency = '$',
  initialSortBy,
  onClose,
}) => {
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [sortBy, setSortBy] = useState<InventoryReportSortOption>(initialSortBy || 'original');
  const [printMode, setPrintMode] = useState<'full' | 'pricelist'>('full');

  // Format money helper
  const fmtMoney = (val: number) => {
    return `${currency}${(Number(val) || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Precompute metrics & totals for each item
  const rawProcessedItems = items.map((item, idx) => {
    const fin = calculateItemFinancials(item);
    const qty = Math.max(0, Number(item.stock) || 0);

    const costSinIva = Number(fin.costWithoutTax) || 0;
    const costConIva = Number(fin.costWithTax) || 0;
    const pvpSinIva = Number(fin.salePriceWithoutTax) || 0;
    const pvpConIva = Number(fin.salePriceWithTax) || 0;
    const unitProfit = Number(fin.unitProfit) || 0;

    const totalCostSinIva = costSinIva * qty;
    const totalCostConIva = costConIva * qty;
    const totalPvpSinIva = pvpSinIva * qty;
    const totalPvpConIva = pvpConIva * qty;
    const totalProfit = unitProfit * qty;

    return {
      originalIdx: idx + 1,
      item,
      fin,
      qty,
      costSinIva,
      costConIva,
      pvpSinIva,
      pvpConIva,
      unitProfit,
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
      if (sortBy === 'price_asc') {
        const diff = (a.fin.salePriceWithTax ?? 0) - (b.fin.salePriceWithTax ?? 0);
        if (Math.abs(diff) > 0.0001) return diff;
        return (a.item.name || '').localeCompare(b.item.name || '', 'es', { sensitivity: 'base' });
      }
      if (sortBy === 'price_desc') {
        const diff = (b.fin.salePriceWithTax ?? 0) - (a.fin.salePriceWithTax ?? 0);
        if (Math.abs(diff) > 0.0001) return diff;
        return (a.item.name || '').localeCompare(b.item.name || '', 'es', { sensitivity: 'base' });
      }
      return 0; // Keep original selection order
    });
  }, [rawProcessedItems, sortBy]);

  // Calculate grand totals across all selected products
  const grandTotals = rawProcessedItems.reduce(
    (acc, curr) => {
      // 1. Sumatoria directa según cada columna de la tabla
      acc.totalStock += curr.qty;
      acc.sumCostSinIva += curr.costSinIva;
      acc.sumCostConIva += curr.costConIva;
      acc.sumPvpSinIva += curr.pvpSinIva;
      acc.sumPvpConIva += curr.pvpConIva;
      acc.sumProfit += curr.unitProfit;

      // 2. Valuación de inventario multiplicada por stock físico
      acc.totalCostSinIva += curr.totalCostSinIva;
      acc.totalCostConIva += curr.totalCostConIva;
      acc.totalPvpSinIva += curr.totalPvpSinIva;
      acc.totalPvpConIva += curr.totalPvpConIva;
      acc.totalProfit += curr.totalProfit;

      return acc;
    },
    {
      totalStock: 0,
      sumCostSinIva: 0,
      sumCostConIva: 0,
      sumPvpSinIva: 0,
      sumPvpConIva: 0,
      sumProfit: 0,
      totalCostSinIva: 0,
      totalCostConIva: 0,
      totalPvpSinIva: 0,
      totalPvpConIva: 0,
      totalProfit: 0,
    }
  );

  const avgMargin =
    grandTotals.sumCostSinIva > 0
      ? ((grandTotals.sumProfit / grandTotals.sumCostSinIva) * 100).toFixed(1)
      : '0.0';

  const avgValuationMargin =
    grandTotals.totalCostSinIva > 0
      ? ((grandTotals.totalProfit / grandTotals.totalCostSinIva) * 100).toFixed(1)
      : avgMargin;

  const storeName = storeConfig?.storeName || 'MI TIENDA';
  const storePhone = storeConfig?.whatsappNumber || '';
  const storeAddress = storeConfig?.address || '';
  const storeLogo = storeConfig?.logoDesktopUrl || storeConfig?.logoUrl || null;
  const currentDateStr = new Date().toLocaleString('es-EC', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const handlePrint = () => {
    if (printMode === 'pricelist') {
      printPriceListDocument({ sortedItems, grandTotals, storeConfig, currency, orientation, sortBy });
    } else {
      printInventoryReportDocument({ sortedItems, grandTotals, avgMargin, avgValuationMargin, storeConfig, currency, orientation, sortBy });
    }
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

          {/* Controls Bar: Mode + Sort + Orientation + Print */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            {/* Print Mode Selector */}
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs text-slate-300 font-medium">
              <span className="text-[10px] uppercase font-bold text-slate-400 px-2 flex items-center gap-1">
                <Printer className="w-3 h-3 text-sky-400" />
                Modo:
              </span>
              <button
                type="button"
                onClick={() => setPrintMode('full')}
                className={`px-2 py-0.5 rounded-lg transition text-[11px] flex items-center gap-1 ${
                  printMode === 'full' ? 'bg-sky-600 text-white font-bold shadow-xs' : 'hover:text-white hover:bg-slate-700'
                }`}
                title="Reporte completo con costos, márgenes y totales"
              >
                <FileText className="w-3 h-3" />
                Reporte Completo
              </button>
              <button
                type="button"
                onClick={() => setPrintMode('pricelist')}
                className={`px-2 py-0.5 rounded-lg transition text-[11px] flex items-center gap-1 ${
                  printMode === 'pricelist' ? 'bg-blue-600 text-white font-bold shadow-xs' : 'hover:text-white hover:bg-slate-700'
                }`}
                title="Lista simple: código, producto y PVP c/IVA"
              >
                <List className="w-3 h-3" />
                Lista de Precios
              </button>
            </div>
            {/* Sort Order Selector */}
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs text-slate-300 font-medium flex-wrap gap-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 px-1.5 flex items-center gap-1">
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
                <span>Nombre A-Z</span>
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
                <span>Categoría</span>
              </button>
              <button
                type="button"
                onClick={() => setSortBy('price_asc')}
                className={`px-2 py-0.5 rounded-lg transition text-[11px] flex items-center gap-1 ${
                  sortBy === 'price_asc'
                    ? 'bg-sky-600 text-white font-bold shadow-xs'
                    : 'hover:text-white hover:bg-slate-700'
                }`}
                title="Ordenar por precio de menor a mayor (PVP c/IVA)"
              >
                <ArrowUp className="w-3 h-3 text-emerald-400 stroke-[2.5]" />
                <span>Precio: Menor a Mayor</span>
              </button>
              <button
                type="button"
                onClick={() => setSortBy('price_desc')}
                className={`px-2 py-0.5 rounded-lg transition text-[11px] flex items-center gap-1 ${
                  sortBy === 'price_desc'
                    ? 'bg-sky-600 text-white font-bold shadow-xs'
                    : 'hover:text-white hover:bg-slate-700'
                }`}
                title="Ordenar por precio de mayor a menor (PVP c/IVA)"
              >
                <ArrowDown className="w-3 h-3 text-amber-400 stroke-[2.5]" />
                <span>Precio: Mayor a Menor</span>
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
              className={`px-3.5 py-1.5 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center space-x-1.5 cursor-pointer active:scale-95 bg-gradient-to-r ${
                printMode === 'pricelist'
                  ? 'from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
                  : 'from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>{printMode === 'pricelist' ? 'Imprimir Lista' : 'Imprimir Reporte'}</span>
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
                <div
                  className={`inline-block px-2 py-0.5 text-white rounded font-bold text-[10px] uppercase tracking-wider mb-0.5 ${
                    printMode === 'pricelist' ? 'bg-blue-700' : 'bg-slate-900'
                  }`}
                >
                  {printMode === 'pricelist' ? 'LISTA DE PRECIOS c/IVA' : 'REPORTE DE INVENTARIO VALORADO'}
                </div>
                <p className="text-[10px] text-slate-500 font-semibold">
                  Emisión: <span className="text-slate-800">{currentDateStr}</span>
                </p>
                <p className="text-[10px] text-slate-500 font-semibold">
                  Orden: <span className="text-slate-900 font-bold uppercase">{getInventoryReportSortLabel(sortBy)}</span> | Total: <span className="text-slate-900 font-bold">{items.length} productos</span>
                </p>
              </div>
            </div>

            {/* Financial / Metric Summary Top Cards */}
            {printMode === 'pricelist' ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase mb-0.5">
                    <span>Total Productos</span>
                    <Package className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className="text-sm font-extrabold text-slate-900">
                    {sortedItems.length} <span className="text-[11px] font-normal text-slate-500">ítems</span>
                  </div>
                </div>

                <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase mb-0.5">
                    <span>Stock Total</span>
                    <Layers className="w-3.5 h-3.5 text-sky-600" />
                  </div>
                  <div className="text-sm font-extrabold text-slate-900">
                    {grandTotals.totalStock.toLocaleString('es-EC')} <span className="text-[11px] font-normal text-slate-500">uds</span>
                  </div>
                </div>

                <div className="p-2 bg-blue-50/70 border border-blue-200 rounded-xl">
                  <div className="flex items-center justify-between text-blue-800 text-[10px] font-bold uppercase mb-0.5">
                    <span>PVP Promedio c/IVA</span>
                    <DollarSign className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className="text-sm font-extrabold text-blue-950 font-mono">
                    {fmtMoney(sortedItems.length > 0 ? grandTotals.sumPvpConIva / sortedItems.length : 0)}
                  </div>
                  <div className="text-[9px] text-blue-700">Sin IVA: {fmtMoney(sortedItems.length > 0 ? grandTotals.sumPvpSinIva / sortedItems.length : 0)}</div>
                </div>

                <div className="p-2 bg-amber-50/80 border border-amber-300 rounded-xl shadow-2xs">
                  <div className="flex items-center justify-between text-amber-900 text-[10px] font-extrabold uppercase mb-0.5">
                    <span>PVP Total Catálogo ⭐</span>
                    <DollarSign className="w-3.5 h-3.5 text-amber-700" />
                  </div>
                  <div className="text-sm font-black text-amber-950 font-mono">
                    {fmtMoney(grandTotals.sumPvpConIva)}
                  </div>
                  <div className="text-[9px] font-bold text-amber-800">
                    Sin IVA: {fmtMoney(grandTotals.sumPvpSinIva)}
                  </div>
                </div>
              </div>
            ) : (
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
                    <span>{grandTotals.totalStock > 0 ? 'Costo Total Valorado' : 'Sumatoria Costo + IVA'}</span>
                    <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div className="text-sm font-extrabold text-amber-900">
                    {fmtMoney(grandTotals.totalStock > 0 ? grandTotals.totalCostConIva : grandTotals.sumCostConIva)}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    Sin IVA: {fmtMoney(grandTotals.totalStock > 0 ? grandTotals.totalCostSinIva : grandTotals.sumCostSinIva)}
                  </div>
                </div>

                <div className="p-2 bg-amber-50 border border-amber-300 rounded-xl shadow-2xs">
                  <div className="flex items-center justify-between text-amber-900 text-[10px] font-extrabold uppercase mb-0.5">
                    <span>{grandTotals.totalStock > 0 ? 'PVP Total Valorado ⭐' : 'Sumatoria PVP + IVA ⭐'}</span>
                    <Layers className="w-3.5 h-3.5 text-amber-700" />
                  </div>
                  <div className="text-sm font-black text-amber-950">
                    {fmtMoney(grandTotals.totalStock > 0 ? grandTotals.totalPvpConIva : grandTotals.sumPvpConIva)}
                  </div>
                  <div className="text-[9px] font-bold text-amber-800">
                    Sin IVA: {fmtMoney(grandTotals.totalStock > 0 ? grandTotals.totalPvpSinIva : grandTotals.sumPvpSinIva)}
                  </div>
                </div>

                <div className="p-2 bg-emerald-50/80 border border-emerald-200 rounded-xl">
                  <div className="flex items-center justify-between text-emerald-800 text-[10px] font-bold uppercase mb-0.5">
                    <span>Ganancia Proyectada</span>
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-sm font-extrabold text-emerald-950">
                    {fmtMoney(grandTotals.totalStock > 0 ? grandTotals.totalProfit : grandTotals.sumProfit)}
                  </div>
                  <div className="text-[9px] font-bold text-emerald-700">
                    Margen prom: {avgMargin}%
                  </div>
                </div>
              </div>
            )}

            {/* Products Section — switchable between full report table and price list single-row table */}
            {printMode === 'pricelist' ? (
              /* ── PRICE LIST PREVIEW (Single row per product with thumbnail cover) ── */
              <div className="w-full overflow-hidden">
                <div className="mb-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl text-[10px] text-blue-800 font-semibold flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <List className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Vista previa: <strong>Lista de Precios</strong> — Una sola fila por producto con miniatura de portada</span>
                  </div>
                  <span className="text-blue-600 font-bold">{sortedItems.length} {sortedItems.length === 1 ? 'producto' : 'productos'}</span>
                </div>
                <table
                  className="w-full border-collapse text-slate-900 font-sans leading-tight table-fixed border border-slate-300 rounded-lg overflow-hidden"
                  style={{
                    fontSize: orientation === 'portrait' ? '8.5px' : '9.5px',
                  }}
                >
                  <thead>
                    <tr className="bg-slate-900 text-white text-[8px] sm:text-[9px] uppercase tracking-tighter font-extrabold border border-slate-900">
                      <th style={{ width: orientation === 'landscape' ? '3%' : '3%' }} className="py-2 px-1 text-center border-r border-slate-700">#</th>
                      <th style={{ width: orientation === 'landscape' ? '9.5%' : '14%' }} className="py-2 px-1 text-center border-r border-slate-700">Foto</th>
                      <th style={{ width: orientation === 'landscape' ? '14%' : '15%' }} className="py-2 px-2 text-left border-r border-slate-700 truncate">Código / SKU</th>
                      <th style={{ width: orientation === 'landscape' ? '48.5%' : '41%' }} className="py-2 px-2 text-left border-r border-slate-700 truncate">Producto</th>
                      <th style={{ width: orientation === 'landscape' ? '12%' : '13%' }} className="py-2 px-2 text-left border-r border-slate-700 truncate">Categoría</th>
                      <th style={{ width: orientation === 'landscape' ? '13%' : '14%' }} className="py-2 px-2 text-right bg-blue-700 text-yellow-300 font-black truncate">PVP c/IVA ⭐</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 border-x border-b border-slate-300">
                    {sortedItems.map((pi, index) => {
                      const { item, fin } = pi;
                      const code = item.sku || item.barcode || item.supplierCode || `ID-${item.id}`;
                      const coverPhoto = getProductCoverPhoto(item);
                      const isEven = index % 2 === 0;

                      return (
                        <tr
                          key={item.id}
                          className={`${isEven ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50/70 transition-colors`}
                        >
                          <td className="py-1 px-1 text-center font-bold text-slate-500 border-r border-slate-200">
                            {index + 1}
                          </td>
                          <td className="py-2 px-1 text-center border-r border-slate-200">
                            <div className="w-16 h-16 sm:w-[66px] sm:h-[66px] mx-auto rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0 shadow-2xs">
                              {coverPhoto ? (
                                <img
                                  src={coverPhoto}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <span className="text-[9px] font-bold text-slate-400 uppercase text-center leading-none px-1">Sin foto</span>
                              )}
                            </div>
                          </td>
                          <td className="py-1 px-2 font-mono font-bold text-slate-800 border-r border-slate-200 truncate" title={code}>
                            <div className="truncate">{code}</div>
                            {item.barcode && item.barcode !== code && (
                              <div className="text-[7.5px] font-mono text-slate-500 truncate">{item.barcode}</div>
                            )}
                          </td>
                          <td className="py-1 px-2 font-bold text-slate-900 border-r border-slate-200 truncate" title={item.name}>
                            {item.name}
                          </td>
                          <td className="py-1 px-2 text-slate-600 border-r border-slate-200 truncate" title={item.category || 'Sin categoría'}>
                            {item.category || 'Sin cat.'}
                          </td>
                          <td className="py-1 px-2 text-right font-mono font-black text-blue-700 bg-blue-50/70 border-r border-blue-200 whitespace-nowrap">
                            {fmtMoney(fin.salePriceWithTax)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900 text-white font-bold text-[8px] sm:text-[9.5px] border-t-2 border-slate-900">
                      <td colSpan={5} className="py-2 px-2 text-right uppercase tracking-wider">
                        TOTAL DE PRODUCTOS EN LISTA ({sortedItems.length} ITEMS{grandTotals.totalStock > 0 ? ` · ${grandTotals.totalStock} UDS EN STOCK` : ''}):
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-black text-yellow-300 bg-blue-900 truncate">
                        {fmtMoney(grandTotals.sumPvpConIva)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
            /* ── FULL REPORT TABLE ── */
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
                      {fmtMoney(grandTotals.sumCostSinIva)}
                    </td>
                    <td className="py-2 px-0.5 text-right font-mono font-extrabold text-amber-200 truncate">
                      {fmtMoney(grandTotals.sumCostConIva)}
                    </td>
                    <td className="py-2 px-0.5 text-center font-mono">-</td>
                    <td className="py-2 px-0.5 text-right font-mono truncate">
                      {fmtMoney(grandTotals.sumPvpSinIva)}
                    </td>
                    
                    {/* HIGHLIGHTED TOTAL PVP c/IVA FOOTER CELL */}
                    <td className="py-2 px-0.5 text-right font-mono font-black text-amber-950 bg-amber-400 truncate">
                      {fmtMoney(grandTotals.sumPvpConIva)}
                    </td>

                    <td className="py-2 px-0.5 text-center font-mono">-</td>
                    <td className="py-2 px-0.5 text-right font-mono font-extrabold text-emerald-300 truncate">
                      {fmtMoney(grandTotals.sumProfit)}
                    </td>
                    <td className="py-2 px-0.5 text-right font-mono font-extrabold text-emerald-300 truncate">
                      {avgMargin}%
                    </td>
                  </tr>
                  {grandTotals.totalStock > 0 && (
                    <tr className="bg-slate-950 text-slate-300 font-bold text-[7.5px] sm:text-[8.5px] border-t border-slate-700">
                      <td colSpan={5} className="py-1.5 px-2 text-right uppercase tracking-wider text-slate-400">
                        VALORIZACIÓN EN INVENTARIO (TOTAL × STOCK):
                      </td>
                      <td className="py-1.5 px-0.5 text-center font-extrabold text-amber-300">
                        {grandTotals.totalStock} uds
                      </td>
                      <td className="py-1.5 px-0.5 text-right font-mono truncate text-slate-300">
                        {fmtMoney(grandTotals.totalCostSinIva)}
                      </td>
                      <td className="py-1.5 px-0.5 text-right font-mono font-extrabold text-amber-300 truncate">
                        {fmtMoney(grandTotals.totalCostConIva)}
                      </td>
                      <td className="py-1.5 px-0.5 text-center font-mono">-</td>
                      <td className="py-1.5 px-0.5 text-right font-mono truncate text-slate-300">
                        {fmtMoney(grandTotals.totalPvpSinIva)}
                      </td>
                      <td className="py-1.5 px-0.5 text-right font-mono font-black text-amber-950 bg-amber-300 truncate">
                        {fmtMoney(grandTotals.totalPvpConIva)}
                      </td>
                      <td className="py-1.5 px-0.5 text-center font-mono">-</td>
                      <td className="py-1.5 px-0.5 text-right font-mono font-extrabold text-emerald-400 truncate">
                        {fmtMoney(grandTotals.totalProfit)}
                      </td>
                      <td className="py-1.5 px-0.5 text-right font-mono font-extrabold text-emerald-400 truncate">
                        {avgValuationMargin}%
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
            )}{/* end full report */}

            {/* Document Footer */}
            <div className="mt-4 pt-2 border-t border-slate-300 flex items-center justify-between text-[9px] text-slate-500">
              <div>
                <p className="font-semibold text-slate-700">
                  Comerxia ERP — {printMode === 'pricelist' ? 'Lista de Precios c/IVA' : 'Sistema de Gestión Comercial'}
                </p>
                <p>{printMode === 'pricelist' ? 'Precios vigentes con IVA incluido.' : 'Reporte oficial de inventario valorado para control físico y financiero.'}</p>
              </div>
              <div className="text-right font-mono">
                {printMode === 'pricelist' ? 'Lista de Precios' : 'Reporte'} A4 ({orientation === 'landscape' ? 'Horizontal' : 'Vertical'})
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
              className={`px-4 py-1.5 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer ${
                printMode === 'pricelist' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-sky-600 hover:bg-sky-500'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>{printMode === 'pricelist' ? 'Imprimir Lista de Precios (A4)' : 'Imprimir Reporte (A4)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

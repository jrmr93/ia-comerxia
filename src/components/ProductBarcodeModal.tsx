import React, { useState, useEffect, useRef } from 'react';
import {
  Barcode,
  Printer,
  X,
  Download,
  Copy,
  Check,
  Package,
  Layers,
  Settings2,
  ExternalLink,
  Plus,
  Minus,
  Sparkles,
  Info,
  Maximize2,
  Tag,
  DollarSign,
  Store,
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { InventoryItem, StoreConfig } from '../types.ts';

export interface LabelSizeOption {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  description: string;
  recommendedFor: string;
}

export const LABEL_SIZES: LabelSizeOption[] = [
  {
    id: '50x30',
    name: '50 × 30 mm (Estándar)',
    widthMm: 50,
    heightMm: 30,
    description: 'Tamaño ideal y más usado en tiendas para pegar en productos y empaques.',
    recommendedFor: 'Recomendado para casi todo tipo de producto, cajas, bolsas y prendas',
  },
  {
    id: '40x25',
    name: '40 × 25 mm (Compacto)',
    widthMm: 40,
    heightMm: 25,
    description: 'Formato pequeño para artículos con poco espacio de etiquetado.',
    recommendedFor: 'Accesorios, cosméticos, joyería, fundas de celular',
  },
  {
    id: '60x40',
    name: '60 × 40 mm (Mediano)',
    widthMm: 60,
    heightMm: 40,
    description: 'Espacio amplio para nombre largo, precio destacado y referencia.',
    recommendedFor: 'Cajas medianas, calzado, electrodomésticos pequeños',
  },
  {
    id: '70x50',
    name: '70 × 50 mm (Grande / Despacho)',
    widthMm: 70,
    heightMm: 50,
    description: 'Etiqueta grande de alta visibilidad para almacén o góndola.',
    recommendedFor: 'Cajas de embalaje, bultos y estanterías de bodega',
  },
];

interface ProductBarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: InventoryItem[]; // Can be single item or multiple selected items
  storeConfig?: StoreConfig;
  currency?: string;
  showToast?: (msg: string) => void;
}

export const ProductBarcodeModal: React.FC<ProductBarcodeModalProps> = ({
  isOpen,
  onClose,
  items,
  storeConfig,
  currency = 'USD',
  showToast,
}) => {
  // Active product when multiple are passed
  const [selectedProductIndex, setSelectedProductIndex] = useState<number>(0);
  
  // Selected label size preset (default: 50x30mm)
  const [selectedSizeId, setSelectedSizeId] = useState<string>('50x30');
  
  // Print Mode: 'roll' (direct thermal individual stickers) or 'sheet' (A4/Letter grid of stickers)
  const [printLayout, setPrintLayout] = useState<'roll' | 'sheet'>('roll');
  
  // Copies to print
  const [copies, setCopies] = useState<number>(1);
  
  // Display Options toggles
  const [showStoreName, setShowStoreName] = useState<boolean>(true);
  const [showProductName, setShowProductName] = useState<boolean>(true);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showSkuText, setShowSkuText] = useState<boolean>(true);
  const [showCategory, setShowCategory] = useState<boolean>(false);
  const [barcodeFormat, setBarcodeFormat] = useState<'CODE128' | 'EAN13' | 'CODE39'>('CODE128');

  // Custom text adjustments
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [isGeneratingPng, setIsGeneratingPng] = useState<boolean>(false);

  const previewSvgRef = useRef<SVGSVGElement | null>(null);

  const activeItem: InventoryItem | undefined = items[selectedProductIndex] || items[0];

  const currentSize = LABEL_SIZES.find((s) => s.id === selectedSizeId) || LABEL_SIZES[0];
  const storeName = storeConfig?.storeName || 'Comerxia Store';

  // Format Barcode / SKU: Prioritize actual manufacturer product barcode if present, otherwise fallback to SKU
  const hasProductBarcode = Boolean(activeItem?.barcode && activeItem.barcode.trim().length > 0);
  const rawProductBarcode = (activeItem?.barcode || '').trim();
  const rawSku = (activeItem?.sku || `PRD-${activeItem?.id || '1001'}`).trim();
  
  // Barcode value for laser scanner and printing
  const barcodeValue = (hasProductBarcode ? rawProductBarcode : rawSku).replace(/[\n\r\t]/g, '').trim() || `PRD-${activeItem?.id || '1001'}`;

  // Automatically adapt optimal barcode format if EAN-13 (13 digits), UPC (12 digits) or alphanumeric (CODE128)
  useEffect(() => {
    if (barcodeValue && /^\d{13}$/.test(barcodeValue)) {
      setBarcodeFormat('EAN13');
    } else {
      setBarcodeFormat('CODE128');
    }
  }, [barcodeValue]);

  // Calculate pricing
  const regularPrice = parseFloat(activeItem?.salePrice || '0') || 0;
  const discountPercent = Math.max(0, Math.min(100, Number(activeItem?.discountPercent) || 0));
  const effectivePrice = discountPercent > 0 ? regularPrice * (1 - discountPercent / 100) : regularPrice;

  // Initialize copies to item's stock if single item or 1
  useEffect(() => {
    if (activeItem && activeItem.stock > 0) {
      // Keep copies default reasonable (max 10 or current stock)
      setCopies(Math.min(activeItem.stock, 50) || 1);
    } else {
      setCopies(1);
    }
  }, [activeItem?.id]);

  // Render Barcode SVG in preview whenever relevant state changes
  useEffect(() => {
    if (!previewSvgRef.current || !activeItem) return;

    try {
      // Clear previous SVG content
      while (previewSvgRef.current.firstChild) {
        previewSvgRef.current.removeChild(previewSvgRef.current.firstChild);
      }

      // Height and width scaling based on label size
      const barHeight = currentSize.heightMm <= 25 ? 24 : currentSize.heightMm <= 30 ? 30 : 38;
      const barWidth = currentSize.widthMm <= 40 ? 1.2 : 1.4;

      JsBarcode(previewSvgRef.current, barcodeValue, {
        format: barcodeFormat,
        width: barWidth,
        height: barHeight,
        displayValue: false, // We render the text cleanly using HTML/SVG for crisp typography
        margin: 0,
        background: 'transparent',
        lineColor: '#0f172a',
      });

      // Ensure SVG scales fluently within sticker bounds without horizontal overflow
      if (previewSvgRef.current) {
        previewSvgRef.current.style.width = '100%';
        previewSvgRef.current.style.maxWidth = '100%';
        previewSvgRef.current.style.height = 'auto';
        previewSvgRef.current.style.maxHeight = `${barHeight * 1.3}px`;
      }
    } catch (err) {
      console.warn('Barcode rendering fallback to CODE128:', err);
      try {
        if (previewSvgRef.current) {
          JsBarcode(previewSvgRef.current, barcodeValue, {
            format: 'CODE128',
            width: 1.3,
            height: 28,
            displayValue: false,
            margin: 0,
            background: 'transparent',
            lineColor: '#0f172a',
          });
          previewSvgRef.current.style.width = '100%';
          previewSvgRef.current.style.maxWidth = '100%';
          previewSvgRef.current.style.height = 'auto';
        }
      } catch (e) {
        console.error('Failed to generate barcode SVG:', e);
      }
    }
  }, [barcodeValue, barcodeFormat, currentSize, activeItem]);

  if (!isOpen || !activeItem) return null;

  // Generate SVG string for an item
  const generateBarcodeSvgString = (value: string, format = barcodeFormat) => {
    try {
      const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const barHeight = currentSize.heightMm <= 25 ? 24 : currentSize.heightMm <= 30 ? 30 : 38;
      const barWidth = currentSize.widthMm <= 40 ? 1.2 : 1.5;

      JsBarcode(tempSvg, value, {
        format,
        width: barWidth,
        height: barHeight,
        displayValue: false,
        margin: 0,
        background: 'transparent',
        lineColor: '#000000',
      });
      return tempSvg.outerHTML;
    } catch {
      return '';
    }
  };

  // Build complete printable HTML for printer dialog
  const generatePrintableHtml = () => {
    const isSheet = printLayout === 'sheet';
    const widthMm = currentSize.widthMm;
    const heightMm = currentSize.heightMm;

    // List of items to print: if single product, repeat it `copies` times.
    // If multiple products selected, create labels according to each item's requested copies.
    const labelsList: { item: InventoryItem; code: string; price: number; originalPrice: number; hasDiscount: boolean }[] = [];

    if (items.length === 1) {
      const it = items[0];
      const code = ((it.barcode && it.barcode.trim()) || it.sku || `PRD-${it.id}`).trim();
      const reg = parseFloat(it.salePrice || '0') || 0;
      const disc = Math.max(0, Math.min(100, Number(it.discountPercent) || 0));
      const eff = disc > 0 ? reg * (1 - disc / 100) : reg;

      for (let i = 0; i < copies; i++) {
        labelsList.push({
          item: it,
          code,
          price: eff,
          originalPrice: reg,
          hasDiscount: disc > 0,
        });
      }
    } else {
      // Multiple items selected: print `copies` of each
      items.forEach((it) => {
        const code = ((it.barcode && it.barcode.trim()) || it.sku || `PRD-${it.id}`).trim();
        const reg = parseFloat(it.salePrice || '0') || 0;
        const disc = Math.max(0, Math.min(100, Number(it.discountPercent) || 0));
        const eff = disc > 0 ? reg * (1 - disc / 100) : reg;

        for (let i = 0; i < copies; i++) {
          labelsList.push({
            item: it,
            code,
            price: eff,
            originalPrice: reg,
            hasDiscount: disc > 0,
          });
        }
      });
    }

    const renderedLabelCards = labelsList
      .map((lbl) => {
        const barcodeSvg = generateBarcodeSvgString(lbl.code);

        return `
        <div class="label-card" style="width: ${widthMm}mm; height: ${heightMm}mm;">
          ${showStoreName ? `<div class="store-name">${storeName}</div>` : ''}
          ${showProductName ? `<div class="product-name">${lbl.item.name}</div>` : ''}
          
          <div class="barcode-container">
            ${barcodeSvg}
          </div>

          <div class="label-bottom-row">
            ${showSkuText ? `<div class="sku-code">${lbl.code}</div>` : '<div></div>'}
            ${
              showPrice
                ? `<div class="price-container">
                    ${lbl.hasDiscount ? `<span class="old-price">$${lbl.originalPrice.toFixed(2)}</span>` : ''}
                    <span class="price-tag">$${lbl.price.toFixed(2)}</span>
                  </div>`
                : ''
            }
          </div>

          ${showCategory && lbl.item.category ? `<div class="category-tag">${lbl.item.category}</div>` : ''}
        </div>
      `;
      })
      .join('\n');

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Etiquetas de Código de Barras - ${activeItem.name}</title>
        <style>
          @page {
            ${
              isSheet
                ? 'size: A4 portrait; margin: 10mm 8mm;'
                : `size: ${widthMm}mm ${heightMm}mm; margin: 0;`
            }
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            margin: 0;
            padding: ${isSheet ? '0' : '0'};
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #fff;
            color: #000;
            display: ${isSheet ? 'block' : 'flex'};
            flex-direction: column;
            align-items: center;
          }

          /* Roll Mode: Each label is its own page */
          ${
            !isSheet
              ? `
              .labels-wrapper {
                display: block;
                width: ${widthMm}mm;
              }
              .label-card {
                width: ${widthMm}mm;
                height: ${heightMm}mm;
                page-break-after: always;
                page-break-inside: avoid;
                padding: 1.8mm 2.2mm;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                align-items: center;
                text-align: center;
                overflow: hidden;
                background: #fff;
              }
            `
              : `
              /* Sheet Mode: Grid of stickers */
              .labels-wrapper {
                display: flex;
                flex-wrap: wrap;
                gap: 3mm 3mm;
                justify-content: flex-start;
              }
              .label-card {
                width: ${widthMm}mm;
                height: ${heightMm}mm;
                padding: 1.8mm 2.2mm;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                align-items: center;
                text-align: center;
                overflow: hidden;
                border: 0.5px dashed #ccc;
                border-radius: 1.5mm;
                background: #fff;
                page-break-inside: avoid;
              }
            `
          }

          .store-name {
            font-size: 6.5pt;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.2px;
            color: #333;
            line-height: 1;
            margin-bottom: 0.5mm;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
          }

          .product-name {
            font-size: ${heightMm <= 25 ? '7pt' : '8pt'};
            font-weight: 900;
            line-height: 1.1;
            color: #000;
            max-height: ${heightMm <= 25 ? '5mm' : '7.5mm'};
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            text-overflow: ellipsis;
            width: 100%;
            margin-bottom: 0.5mm;
          }

          .barcode-container {
            width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 0.5mm 0;
            flex-grow: 1;
            max-height: ${heightMm <= 25 ? '10mm' : heightMm <= 30 ? '13mm' : '18mm'};
          }
          .barcode-container svg {
            width: 96%;
            height: 100%;
            max-height: 100%;
            display: block;
          }

          .label-bottom-row {
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 0.5mm;
            padding: 0 0.5mm;
          }

          .sku-code {
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
            font-size: 7.5pt;
            font-weight: 800;
            letter-spacing: 0.5px;
            color: #000;
            line-height: 1;
          }

          .price-container {
            display: flex;
            align-items: baseline;
            gap: 1mm;
            line-height: 1;
          }

          .old-price {
            font-size: 6pt;
            text-decoration: line-through;
            color: #666;
            font-weight: 600;
          }

          .price-tag {
            font-family: "SFMono-Regular", Consolas, Menlo, monospace;
            font-size: ${heightMm <= 25 ? '8pt' : '9.5pt'};
            font-weight: 900;
            color: #000;
          }

          .category-tag {
            font-size: 5.5pt;
            font-weight: 700;
            color: #666;
            text-transform: uppercase;
            margin-top: 0.3mm;
          }
        </style>
      </head>
      <body>
        <div class="labels-wrapper">
          ${renderedLabelCards}
        </div>
      </body>
      </html>
    `;
  };

  // Direct Print via hidden iframe (safest in sandboxed frames)
  const handleDirectPrint = () => {
    try {
      if (showToast) showToast('Preparando envío a impresora...');
      const htmlContent = generatePrintableHtml();

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(htmlContent);
        doc.close();

        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            if (iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }
          }, 3000);
        }, 350);
      } else {
        window.print();
      }
    } catch (err) {
      console.warn('Iframe print failed, opening popup fallback:', err);
      handleOpenPopupPrint();
    }
  };

  // Dedicated Print Popup Window (supports Chrome, Safari, Firefox label printers)
  const handleOpenPopupPrint = () => {
    const printWindow = window.open('', '_blank', 'width=650,height=750,toolbar=0,menubar=0,location=0');
    if (!printWindow) {
      window.print();
      return;
    }

    const htmlContent = generatePrintableHtml();
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 300);
    };
  };

  // Download High-Resolution PNG sticker
  const handleDownloadPng = async () => {
    try {
      setIsGeneratingPng(true);
      const canvas = document.createElement('canvas');
      const scale = 4; // 4x for 300+ DPI crispness
      const widthPx = (currentSize.widthMm * 3.7795) * scale;
      const heightPx = (currentSize.heightMm * 3.7795) * scale;

      canvas.width = widthPx;
      canvas.height = heightPx;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, widthPx, heightPx);

      // Border outline (subtle)
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1 * scale;
      ctx.strokeRect(4 * scale, 4 * scale, widthPx - 8 * scale, heightPx - 8 * scale);

      let currentY = 12 * scale;

      // Store Name
      if (showStoreName) {
        ctx.fillStyle = '#475569';
        ctx.font = `bold ${5 * scale}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(storeName.toUpperCase(), widthPx / 2, currentY);
        currentY += 8 * scale;
      }

      // Product Name
      if (showProductName) {
        ctx.fillStyle = '#0f172a';
        ctx.font = `bold ${6 * scale}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        const truncatedName = activeItem.name.length > 35 ? activeItem.name.substring(0, 32) + '...' : activeItem.name;
        ctx.fillText(truncatedName, widthPx / 2, currentY);
        currentY += 6 * scale;
      }

      // Draw Barcode onto temp canvas
      const barcodeCanvas = document.createElement('canvas');
      JsBarcode(barcodeCanvas, barcodeValue, {
        format: barcodeFormat,
        width: 1.5 * scale,
        height: (currentSize.heightMm <= 25 ? 16 : 22) * scale,
        displayValue: false,
        margin: 0,
        background: '#ffffff',
        lineColor: '#0f172a',
      });

      const barcodeW = barcodeCanvas.width;
      const barcodeH = barcodeCanvas.height;
      const destBarcodeW = Math.min(barcodeW, widthPx * 0.88);
      const destBarcodeX = (widthPx - destBarcodeW) / 2;

      ctx.drawImage(barcodeCanvas, 0, 0, barcodeW, barcodeH, destBarcodeX, currentY, destBarcodeW, barcodeH);
      currentY += barcodeH + (5 * scale);

      // Bottom Row: SKU and Price
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${6.5 * scale}px monospace`;
      if (showSkuText) {
        ctx.fillText(barcodeValue, 8 * scale, currentY);
      }

      if (showPrice) {
        ctx.textAlign = 'right';
        ctx.font = `900 ${7.5 * scale}px monospace`;
        ctx.fillStyle = '#0f172a';
        ctx.fillText(`$${effectivePrice.toFixed(2)}`, widthPx - (8 * scale), currentY);
      }

      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `etiqueta_${activeItem.sku || activeItem.id}_${currentSize.id}.png`;
        a.click();
        URL.revokeObjectURL(url);
        if (showToast) showToast('Etiqueta PNG descargada con éxito');
      }, 'image/png');
    } catch (err) {
      console.error('Error exporting PNG sticker:', err);
    } finally {
      setIsGeneratingPng(false);
    }
  };

  const handleCopyBarcode = () => {
    navigator.clipboard.writeText(barcodeValue);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    if (showToast) showToast(`Código ${barcodeValue} copiado al portapapeles`);
  };

  return (
    <div
      id="product-barcode-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="product-barcode-modal-content"
        className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-900 animate-scaleUp"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Barcode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h3 className="text-base font-extrabold text-slate-900 truncate">
                  Imprimir Etiqueta de Código de Barras
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-mono font-bold text-[11px] border border-sky-200 shrink-0">
                  {currentSize.widthMm} × {currentSize.heightMm} mm
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium truncate">
                Generador de etiquetas adhesivas optimizado para productos físicos y empaques
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer shrink-0"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Multi-product selector tab if more than 1 item provided */}
        {items.length > 1 && (
          <div className="px-5 py-2.5 bg-sky-50/60 border-b border-sky-100 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5 shrink-0">
              <Layers className="w-4 h-4 text-sky-600" />
              <span>Impresión por Lotes ({items.length} productos):</span>
            </span>
            <div className="flex items-center space-x-1.5 overflow-x-auto max-w-[60%] py-0.5 scrollbar-thin">
              {items.map((it, idx) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setSelectedProductIndex(idx)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer shrink-0 ${
                    selectedProductIndex === idx
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {it.name.length > 20 ? `${it.name.substring(0, 18)}...` : it.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column: Realistic Interactive Sticker Preview (5 cols) */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center p-4 sm:p-5 bg-slate-100/80 rounded-2xl border border-slate-200 relative overflow-hidden">
              <div className="w-full flex items-center justify-between mb-3 text-[11px] font-bold text-slate-500 gap-2">
                <span className="flex items-center gap-1 truncate">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">Vista Previa Real</span>
                </span>
                <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-700 font-mono text-[10px] shrink-0">
                  {currentSize.widthMm}×{currentSize.heightMm}mm
                </span>
              </div>

              {/* Physical Sticker Card Mockup */}
              <div className="p-4 bg-slate-200/70 rounded-2xl border border-slate-300/80 shadow-inner flex items-center justify-center w-full min-h-[220px] max-w-full overflow-hidden">
                <div
                  id="sticker-mockup-preview"
                  style={{
                    width: `${Math.min(currentSize.widthMm * 4.2, 280)}px`,
                    minHeight: `${currentSize.heightMm * 4.0}px`,
                    maxWidth: '100%',
                  }}
                  className="bg-white rounded-lg p-3 shadow-md border border-slate-300 text-slate-950 flex flex-col justify-between items-center text-center transition-all duration-200 select-none relative overflow-hidden box-border"
                >
                  {/* Adhesive Corner Peel Effect */}
                  <div className="absolute top-0 right-0 w-3 h-3 bg-gradient-to-bl from-slate-200 to-transparent pointer-events-none" />

                  {/* 1. Store Header */}
                  {showStoreName && (
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 truncate w-full leading-none mb-1">
                      {storeName}
                    </div>
                  )}

                  {/* 2. Product Name */}
                  {showProductName && (
                    <div className="text-xs font-black text-slate-900 leading-tight line-clamp-2 w-full break-words mb-1">
                      {activeItem.name}
                    </div>
                  )}

                  {/* 3. Barcode Vector SVG Container */}
                  <div className="w-full py-1 flex items-center justify-center my-auto min-h-[42px] max-w-full overflow-hidden">
                    <svg
                      ref={previewSvgRef}
                      className="w-full max-h-[52px] object-contain text-slate-900"
                    />
                  </div>

                  {/* 4. Bottom Information: SKU & Price */}
                  <div className="w-full flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs mt-1">
                    {showSkuText ? (
                      <span className="font-mono font-bold text-[10px] text-slate-800 tracking-wide truncate max-w-[55%]" title={barcodeValue}>
                        {barcodeValue}
                      </span>
                    ) : (
                      <span />
                    )}

                    {showPrice && (
                      <div className="flex items-baseline space-x-1 shrink-0 ml-auto">
                        {discountPercent > 0 && (
                          <span className="text-[9px] line-through text-slate-400 font-mono">
                            ${regularPrice.toFixed(2)}
                          </span>
                        )}
                        <span className="font-mono font-black text-xs text-slate-950">
                          ${effectivePrice.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 5. Category tag if enabled */}
                  {showCategory && activeItem.category && (
                    <div className="text-[8.5px] font-bold text-slate-500 uppercase tracking-widest mt-0.5 leading-none truncate max-w-full">
                      {activeItem.category}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Barcode Copy & Info */}
              <div className="mt-3.5 flex items-center space-x-2 w-full">
                <button
                  type="button"
                  onClick={handleCopyBarcode}
                  className="flex-1 min-w-0 py-1.5 px-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-2xs"
                  title="Copiar código al portapapeles"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-emerald-700 truncate">¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">
                        Copiar {hasProductBarcode ? 'Barras' : 'SKU'}: {barcodeValue}
                      </span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPng}
                  disabled={isGeneratingPng}
                  className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
                  title="Descargar imagen PNG en alta resolución"
                >
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  <span>PNG HD</span>
                </button>
              </div>

              {/* Recommended Size Note */}
              <div className="mt-3 w-full p-2.5 rounded-xl bg-amber-50 border border-amber-200/80 text-[11px] text-amber-900 flex items-start space-x-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-tight text-[11px]">
                  <span className="font-bold">Tamaño Recomendado:</span> La medida de <strong className="font-black text-amber-950">50 × 30 mm</strong> es el estándar para rollos térmicos o planchas de stickers.
                </p>
              </div>
            </div>

            {/* Right Column: Settings & Customization Controls (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              {/* 1. Size Preset Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Dimensiones de la Etiqueta:</span>
                  <span className="text-[10px] text-sky-700 font-bold bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200">
                    Estándar para Rollos y Hojas
                  </span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {LABEL_SIZES.map((sz) => {
                    const isSelected = selectedSizeId === sz.id;
                    return (
                      <button
                        key={sz.id}
                        type="button"
                        onClick={() => setSelectedSizeId(sz.id)}
                        className={`p-2.5 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between min-h-[64px] ${
                          isSelected
                            ? 'border-sky-600 bg-sky-50/80 ring-2 ring-sky-500/20 shadow-xs'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full gap-1">
                          <span className={`text-xs font-extrabold truncate ${isSelected ? 'text-sky-900' : 'text-slate-900'}`}>
                            {sz.name}
                          </span>
                          {sz.id === '50x30' && (
                            <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 shrink-0">
                              Top
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 leading-tight line-clamp-2">
                          {sz.recommendedFor}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Print Layout & Quantity Options */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Print Layout */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Tipo de Impresora:
                    </label>
                    <select
                      value={printLayout}
                      onChange={(e) => setPrintLayout(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    >
                      <option value="roll">🖨️ Rollo Térmico (Zebra, Xprinter, etc.)</option>
                      <option value="sheet">📄 Hoja A4 / Carta (Impresora Normal)</option>
                    </select>
                  </div>

                  {/* Copies count */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Copias a Imprimir:
                    </label>
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setCopies((prev) => Math.max(1, prev - 1))}
                        disabled={copies <= 1}
                        className="w-8 h-8 rounded-lg bg-white border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer shadow-2xs font-bold text-sm shrink-0"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={copies}
                        onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 text-center py-1 rounded-lg border border-slate-300 bg-white text-xs font-black text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setCopies((prev) => prev + 1)}
                        className="w-8 h-8 rounded-lg bg-white border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer shadow-2xs font-bold text-sm shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Stock shortcut if product has stock */}
                {activeItem.stock > 0 && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/80 text-[11px] flex-wrap gap-1">
                    <span className="text-slate-500">
                      Stock actual: <strong className="text-slate-800">{activeItem.stock} uds.</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setCopies(activeItem.stock)}
                      className="text-[11px] font-bold text-sky-700 hover:text-sky-900 hover:underline cursor-pointer"
                    >
                      Imprimir todo ({activeItem.stock})
                    </button>
                  </div>
                )}
              </div>

              {/* 3. Element Visibility Toggles */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center space-x-1.5">
                  <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Elementos a Incluir en la Etiqueta:</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center space-x-2 p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showStoreName}
                      onChange={(e) => setShowStoreName(e.target.checked)}
                      className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500"
                    />
                    <span className="font-semibold text-slate-800 truncate">Nombre de Tienda</span>
                  </label>

                  <label className="flex items-center space-x-2 p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showProductName}
                      onChange={(e) => setShowProductName(e.target.checked)}
                      className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500"
                    />
                    <span className="font-semibold text-slate-800 truncate">Nombre de Producto</span>
                  </label>

                  <label className="flex items-center space-x-2 p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showPrice}
                      onChange={(e) => setShowPrice(e.target.checked)}
                      className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500"
                    />
                    <span className="font-semibold text-slate-800 truncate">Precio de Venta</span>
                  </label>

                  <label className="flex items-center space-x-2 p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showSkuText}
                      onChange={(e) => setShowSkuText(e.target.checked)}
                      className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500"
                    />
                    <span className="font-semibold text-slate-800 truncate">Texto de SKU / Código</span>
                  </label>

                  <label className="flex items-center space-x-2 p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showCategory}
                      onChange={(e) => setShowCategory(e.target.checked)}
                      className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500"
                    />
                    <span className="font-semibold text-slate-800 truncate">Categoría</span>
                  </label>

                  {/* Format Selector */}
                  <div className="flex items-center justify-between gap-1 p-2 rounded-xl border border-slate-200 bg-white">
                    <span className="text-[11px] font-bold text-slate-600 shrink-0">Formato:</span>
                    <select
                      value={barcodeFormat}
                      onChange={(e) => setBarcodeFormat(e.target.value as any)}
                      className="bg-transparent font-bold text-xs text-sky-800 focus:outline-none cursor-pointer truncate"
                    >
                      <option value="CODE128">Code 128 (Universal)</option>
                      <option value="EAN13">EAN-13</option>
                      <option value="CODE39">Code 39</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50/90 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-600 font-medium text-center sm:text-left">
            Total a imprimir:{' '}
            <strong className="text-slate-900 font-extrabold">
              {copies} etiqueta{copies > 1 ? 's' : ''} ({currentSize.widthMm} × {currentSize.heightMm} mm)
            </strong>
          </div>

          <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-end flex-wrap gap-y-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              Cerrar
            </button>

            <button
              type="button"
              onClick={handleOpenPopupPrint}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
              title="Abrir en ventana dedicada para ajustar márgenes e impresora"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
              <span>Pestaña Aislada</span>
            </button>

            <button
              type="button"
              onClick={handleDirectPrint}
              className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-95 text-white text-xs font-black transition flex items-center space-x-2 shadow-md shadow-sky-600/20 cursor-pointer"
              id="btn-print-barcode-labels"
            >
              <Printer className="w-4 h-4 text-sky-100" />
              <span>Imprimir Etiqueta ({copies})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

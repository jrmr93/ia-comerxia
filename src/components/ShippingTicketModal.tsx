import React, { useRef, useState, useEffect } from 'react';
import {
  Printer,
  X,
  User,
  Phone,
  Calendar,
  Store,
  ExternalLink,
  Package,
  Sliders,
  Copy,
  Check,
} from 'lucide-react';
import { CustomerOrder, StoreConfig } from '../types.ts';
import { normalizeEcuadorPhone } from '../utils/phone.ts';
import { getCustomerCi } from '../utils/orderUtils.ts';
import { safeLocalStorage } from '../utils/safeStorage.ts';

export type ThermalWidth = '44mm' | '48mm' | '58mm' | '80mm' | '70mm';

export interface ThermalFormatConfig {
  id: ThermalWidth;
  label: string;
  subtitle: string;
  widthMm: number;
  defaultHeightMm: number;
  previewWidthPx: number;
  isContinuousRoll: boolean;
  baseFontSize: string;
  titleFontSize: string;
  badgeFontSize: string;
  orderNumberFontSize: string;
  fieldLabelFontSize: string;
  fieldValueFontSize: string;
  itemRowFontSize: string;
  logoMaxHeight: string;
  paddingMm: string;
}

export const THERMAL_FORMATS: ThermalFormatConfig[] = [
  {
    id: '44mm',
    label: '44 mm',
    subtitle: 'Ultra compacta',
    widthMm: 44,
    defaultHeightMm: 145,
    previewWidthPx: 210,
    isContinuousRoll: true,
    baseFontSize: '7.5px',
    titleFontSize: '9px',
    badgeFontSize: '7.5px',
    orderNumberFontSize: '9.5px',
    fieldLabelFontSize: '6.5px',
    fieldValueFontSize: '8px',
    itemRowFontSize: '7.5px',
    logoMaxHeight: '18px',
    paddingMm: '1.5mm 2mm',
  },
  {
    id: '48mm',
    label: '48 mm',
    subtitle: 'Mini térmica',
    widthMm: 48,
    defaultHeightMm: 140,
    previewWidthPx: 230,
    isContinuousRoll: true,
    baseFontSize: '8px',
    titleFontSize: '10px',
    badgeFontSize: '8px',
    orderNumberFontSize: '10px',
    fieldLabelFontSize: '7px',
    fieldValueFontSize: '8.5px',
    itemRowFontSize: '8px',
    logoMaxHeight: '20px',
    paddingMm: '2mm 2.5mm',
  },
  {
    id: '58mm',
    label: '58 mm',
    subtitle: 'POS 2" estándar',
    widthMm: 58,
    defaultHeightMm: 130,
    previewWidthPx: 270,
    isContinuousRoll: true,
    baseFontSize: '8.5px',
    titleFontSize: '11px',
    badgeFontSize: '9px',
    orderNumberFontSize: '11px',
    fieldLabelFontSize: '7.5px',
    fieldValueFontSize: '9.5px',
    itemRowFontSize: '8.5px',
    logoMaxHeight: '22px',
    paddingMm: '2.5mm 3mm',
  },
  {
    id: '80mm',
    label: '80 mm',
    subtitle: 'POS 3" estándar',
    widthMm: 80,
    defaultHeightMm: 125,
    previewWidthPx: 350,
    isContinuousRoll: true,
    baseFontSize: '10px',
    titleFontSize: '13px',
    badgeFontSize: '10.5px',
    orderNumberFontSize: '13px',
    fieldLabelFontSize: '8.5px',
    fieldValueFontSize: '11.5px',
    itemRowFontSize: '10px',
    logoMaxHeight: '28px',
    paddingMm: '3.5mm 4.5mm',
  },
  {
    id: '70mm',
    label: '70×120 mm',
    subtitle: 'Etiqueta adhesiva',
    widthMm: 70,
    defaultHeightMm: 120,
    previewWidthPx: 320,
    isContinuousRoll: false,
    baseFontSize: '9px',
    titleFontSize: '11px',
    badgeFontSize: '9px',
    orderNumberFontSize: '11px',
    fieldLabelFontSize: '7.5px',
    fieldValueFontSize: '10px',
    itemRowFontSize: '8.5px',
    logoMaxHeight: '22px',
    paddingMm: '2.5mm 3mm',
  },
];

// Parser to extract CI and structured delivery address sections without losing street address
export function extractRecipientShippingData(order: CustomerOrder): {
  ci: string;
  destinationCity: string;
  fields: { title: string; value: string }[];
} {
  const rawAddress: string = (order as any).shippingAddress || order.customerAddress || '';
  const ci: string = getCustomerCi(order) || (order as any).customerCi || (order as any).ci || '';

  let text = rawAddress.trim();
  if (ci) {
    text = text
      .replace(new RegExp(`(?:C\\.?I\\.?|C[eé]dula|RUC)[\\s:]*${ci}`, 'gi'), '')
      .replace(/^[|\s,;-]+|[|\s,;-]+$/g, '')
      .trim();
  }

  let province = '';
  let canton = '';
  let parish = '';
  let exactAddress = '';

  const provMatch = text.match(/(?:Provincia|Prov\.?)[\s:]*([^\n|,]+)/i);
  if (provMatch) {
    province = provMatch[1].trim();
    text = text.replace(provMatch[0], '');
  }

  const canMatch = text.match(/(?:Cant[oó]n|Ciudad|Cant\.?)[\s:]*([^\n|,]+)/i);
  if (canMatch) {
    canton = canMatch[1].trim();
    text = text.replace(canMatch[0], '');
  }

  const parMatch = text.match(/(?:Parroquia|Parr\.?)[\s:]*([^\n|,]+)/i);
  if (parMatch) {
    parish = parMatch[1].trim();
    text = text.replace(parMatch[0], '');
  }

  const dirMatch = text.match(/(?:Direcci[oó]n|Direccion)[\s:]*([\s\S]+)/i);
  if (dirMatch) {
    exactAddress = dirMatch[1].trim();
  } else {
    const cleanRemainder = text.replace(/^[|\s,;-]+|[|\s,;-]+$/g, '').trim();
    if (cleanRemainder) {
      exactAddress = cleanRemainder;
    }
  }

  const fields: { title: string; value: string }[] = [];

  if (province) {
    fields.push({ title: 'Provincia:', value: province });
  }
  if (canton) {
    fields.push({ title: 'Ciudad / Cantón:', value: canton });
  }
  if (parish) {
    fields.push({ title: 'Parroquia:', value: parish });
  }
  if (exactAddress) {
    fields.push({ title: 'Dirección:', value: exactAddress });
  } else if (fields.length === 0) {
    fields.push({ title: 'Dirección:', value: rawAddress.trim() || 'Retiro en Local' });
  }

  const destinationCity = canton || province || '';

  return {
    ci,
    destinationCity,
    fields,
  };
}

export function generateShippingTicketHtml(params: {
  order: CustomerOrder;
  storeConfig: StoreConfig;
  currency?: string;
  format: ThermalFormatConfig;
  targetHeightMm?: number;
}): string {
  const { order, storeConfig, currency = '$', format: fmt, targetHeightMm } = params;
  const isLabel70 = fmt.id === '70mm';
  const heightMm = targetHeightMm || (isLabel70 ? 120 : (fmt.defaultHeightMm || 130));

  const phoneNorm = normalizeEcuadorPhone(order.customerPhone);
  const formattedPhone = phoneNorm.formattedLocal || order.customerPhone || 'No registrado';
  const storeName = storeConfig.storeName || 'Comerxia Store';
  const logoUrl = storeConfig.logoUrl;
  const storePhone = storeConfig.whatsappNumber || '';
  const storeAddress = storeConfig.address || '';

  const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleString('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) : new Date().toLocaleString('es-EC');

  const recipientData = extractRecipientShippingData(order);
  const items = Array.isArray(order.items) ? order.items : [];
  const carrierName = order.trackingCarrier || 'Courier / Transporte';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Etiqueta_Envio_${order.orderNumber}_${fmt.id}</title>
  <style>
    @page {
      size: ${fmt.widthMm}mm ${isLabel70 ? `${heightMm}mm` : 'auto'};
      margin: 0mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-size: ${fmt.baseFontSize};
      line-height: 1.25;
    }
    .ticket-wrapper {
      width: ${fmt.widthMm}mm;
      max-width: ${fmt.widthMm}mm;
      margin: 0 auto;
      padding: ${fmt.paddingMm};
      background: #ffffff;
      color: #000000;
      overflow: visible;
    }
    .ticket-box {
      border: 2px solid #000000;
      border-radius: 3px;
      padding: 2mm;
      background: #ffffff;
    }
    .store-header {
      text-align: center;
      border-bottom: 1.5px dashed #000000;
      padding-bottom: 2mm;
      margin-bottom: 2mm;
    }
    .store-logo {
      max-height: ${fmt.logoMaxHeight};
      max-width: 80%;
      object-fit: contain;
      margin: 0 auto 1mm auto;
      display: block;
    }
    .store-title {
      font-size: ${fmt.titleFontSize};
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      line-height: 1.1;
    }
    .store-sub {
      font-size: calc(${fmt.baseFontSize} - 1px);
      font-weight: 600;
      margin-top: 0.5mm;
    }
    .badge-bar {
      background: #000000;
      color: #ffffff;
      font-weight: 900;
      font-size: ${fmt.badgeFontSize};
      text-align: center;
      padding: 1mm 2mm;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 2mm;
      border-radius: 2px;
    }
    .section-banner {
      background: #000000;
      color: #ffffff;
      font-weight: 900;
      font-size: ${fmt.fieldLabelFontSize};
      padding: 0.8mm 2mm;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 2mm 0 1mm 0;
      border-radius: 2px;
    }
    .grid-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1mm;
    }
    .order-tag {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: ${fmt.orderNumberFontSize};
      font-weight: 900;
    }
    .carrier-box {
      border: 1.5px solid #000000;
      padding: 1mm 2mm;
      font-weight: 900;
      font-size: ${fmt.fieldValueFontSize};
      text-transform: uppercase;
      display: inline-block;
      border-radius: 2px;
    }
    .field-row {
      margin-bottom: 1.5mm;
    }
    .field-lbl {
      font-size: ${fmt.fieldLabelFontSize};
      font-weight: 800;
      text-transform: uppercase;
      line-height: 1;
      margin-bottom: 0.5mm;
    }
    .field-val-big {
      font-size: calc(${fmt.titleFontSize} + 0.5px);
      font-weight: 900;
      text-transform: uppercase;
      line-height: 1.15;
    }
    .field-val-mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: ${fmt.fieldValueFontSize};
      font-weight: 900;
      line-height: 1.2;
    }
    .address-card {
      border: 1.5px solid #000000;
      border-radius: 2px;
      padding: 1.5mm 2mm;
      background: #ffffff;
      margin-top: 1mm;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1mm;
      font-size: ${fmt.itemRowFontSize};
    }
    .items-table td {
      padding: 0.8mm 0;
      border-bottom: 1px dashed #000000;
      vertical-align: top;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 900;
      font-size: ${fmt.fieldValueFontSize};
      padding-top: 1.5mm;
      margin-top: 1mm;
      border-top: 1.5px solid #000000;
    }
    .warning-footer {
      border-top: 1.5px solid #000000;
      margin-top: 2mm;
      padding-top: 1.5mm;
      text-align: center;
      font-weight: 900;
      font-size: ${fmt.fieldLabelFontSize};
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
  </style>
  <script>
    function triggerAutoPrint() {
      try {
        window.focus();
        window.print();
      } catch (err) {
        console.warn('Auto print failed:', err);
      }
    }
    if (document.readyState === 'complete') {
      setTimeout(triggerAutoPrint, 250);
    } else {
      window.addEventListener('load', function() {
        setTimeout(triggerAutoPrint, 250);
      });
    }
  </script>
</head>
<body>
  <div class="ticket-wrapper">
    <div class="ticket-box">
      <!-- REMITENTE / TIENDA -->
      <div class="store-header">
        ${logoUrl ? `<img src="${logoUrl}" alt="${storeName}" class="store-logo" />` : ''}
        <div class="store-title">${storeName}</div>
        ${storeAddress ? `<div class="store-sub">📍 ${storeAddress}</div>` : ''}
        ${storePhone ? `<div class="store-sub">📞 WhatsApp/Tel: ${storePhone}</div>` : ''}
      </div>

      <!-- BADGE -->
      <div class="badge-bar">ETIQUETA DE ENVÍO • PAQUETE</div>

      <!-- LOGÍSTICA / IDENTIFICADOR -->
      <div class="grid-row">
        <div>
          <div class="field-lbl">N° DE PEDIDO:</div>
          <div class="order-tag">#${order.orderNumber}</div>
        </div>
        <div style="text-align: right;">
          <div class="field-lbl">FECHA:</div>
          <div style="font-size: ${fmt.fieldLabelFontSize}; font-weight: 700;">${orderDate}</div>
        </div>
      </div>

      <div style="margin: 1.5mm 0;">
        <div class="field-lbl">TRANSPORTE / COURIER:</div>
        <div class="carrier-box">🚚 ${carrierName}</div>
      </div>

      <!-- DESTINATARIO -->
      <div class="section-banner">👤 DESTINATARIO (DATOS DE ENTREGA)</div>

      <div class="field-row">
        <div class="field-lbl">CÉDULA / RUC:</div>
        <div class="field-val-mono">${recipientData.ci || 'No registrada'}</div>
      </div>

      <div class="field-row">
        <div class="field-lbl">NOMBRE DEL CLIENTE:</div>
        <div class="field-val-big">${order.customerName || 'Cliente'}</div>
      </div>

      <div class="field-row">
        <div class="field-lbl">TELÉFONO / CELULAR:</div>
        <div class="field-val-mono">📞 ${formattedPhone}</div>
      </div>

      <div class="field-row">
        <div class="field-lbl">📍 DIRECCIÓN DE ENTREGA:</div>
        <div class="address-card">
          ${recipientData.fields.map((f) => `
            <div style="margin-bottom: 1mm;">
              <span style="font-size: ${fmt.fieldLabelFontSize}; font-weight: 900; text-transform: uppercase;">${f.title} </span>
              <span style="font-size: ${fmt.fieldValueFontSize}; font-weight: 800; line-height: 1.25;">${f.value}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- CONTENIDO -->
      ${items.length > 0 ? `
        <div class="section-banner">📦 CONTENIDO DEL PAQUETE (${items.length} ÍTEMS)</div>
        <table class="items-table">
          <tbody>
            ${items.map((it: any) => `
              <tr>
                <td style="font-weight: 900; width: 22px;">${it.quantity || 1}x</td>
                <td style="font-weight: 700;">${it.name || it.item?.name || 'Producto'}</td>
                <td style="text-align: right; font-family: monospace; font-weight: 800; white-space: nowrap;">
                  $${(Number(it.salePrice || it.item?.salePrice || 0) * (it.quantity || 1)).toFixed(2)}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}

      <div class="total-row">
        <span>TOTAL DECLARADO:</span>
        <span>$${Number(order.totalAmount || 0).toFixed(2)} ${currency}</span>
      </div>

      <!-- SEGURIDAD -->
      <div class="warning-footer">
        ⚠️ MANIPULAR CON CUIDADO • PAQUETE FRÁGIL
      </div>
    </div>
  </div>
</body>
</html>`;
}

export interface DirectPrintShippingTicketParams {
  order: CustomerOrder;
  storeConfig: StoreConfig;
  currency?: string;
  format?: ThermalWidth;
  showToast?: (msg: string) => void;
}

export function directPrintShippingTicket(params: DirectPrintShippingTicketParams): void {
  const { order, storeConfig, currency = '$', format, showToast } = params;
  let selectedFormatId: ThermalWidth = format || '58mm';
  try {
    const saved = safeLocalStorage.getItem('thermal_ticket_format') as ThermalWidth;
    if (!format && saved && THERMAL_FORMATS.some((f) => f.id === saved)) {
      selectedFormatId = saved;
    }
  } catch {
    // Ignore
  }

  const fmt = THERMAL_FORMATS.find((f) => f.id === selectedFormatId) || THERMAL_FORMATS[2];
  const estHeightMm = fmt.id === '70mm' ? 120 : (fmt.defaultHeightMm || 130);

  if (showToast) {
    showToast(`🖨️ Abriendo gestor de impresión (${fmt.label}) para Pedido #${order.orderNumber}...`);
  }

  const htmlContent = generateShippingTicketHtml({
    order,
    storeConfig,
    currency,
    format: fmt,
    targetHeightMm: estHeightMm,
  });

  // Detect if application is embedded in an iframe (e.g. AI Studio preview)
  let isInsideIframe = false;
  try {
    isInsideIframe = window.self !== window.top;
  } catch {
    isInsideIframe = true;
  }

  // Inside iframe: Blob window is 100% reliable for browser print manager without destroying host DOM
  if (isInsideIframe) {
    try {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const printWin = window.open(blobUrl, '_blank', 'width=450,height=750,menubar=0,toolbar=0,location=0,status=0');
      if (!printWin) {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 2000);
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      return;
    } catch (blobErr) {
      console.warn('Error opening ticket blob window, trying iframe print:', blobErr);
    }
  }

  // Direct tab window: Print via isolated iframe to preserve the active modal and UI state
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    iframe.style.zIndex = '-1';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();

      const doIframePrint = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn('Iframe print failed, falling back to blob window:', e);
          const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
          const blobUrl = URL.createObjectURL(blob);
          window.open(blobUrl, '_blank');
        } finally {
          setTimeout(() => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          }, 5000);
        }
      };

      if (iframe.contentWindow?.document.readyState === 'complete') {
        setTimeout(doIframePrint, 250);
      } else {
        iframe.onload = () => setTimeout(doIframePrint, 250);
        setTimeout(doIframePrint, 800);
      }
    } else {
      window.print();
    }
  } catch (err) {
    console.warn('Direct ticket print error:', err);
    window.print();
  }
}

interface ShippingTicketModalProps {
  order: CustomerOrder | null;
  storeConfig: StoreConfig;
  currency?: string;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export const ShippingTicketModal: React.FC<ShippingTicketModalProps> = ({
  order,
  storeConfig,
  currency = '$',
  onClose,
  showToast,
}) => {
  const ticketRef = useRef<HTMLDivElement>(null);
  const [selectedFormat, setSelectedFormat] = useState<ThermalWidth>(() => {
    try {
      const saved = safeLocalStorage.getItem('thermal_ticket_format') as ThermalWidth;
      if (saved && THERMAL_FORMATS.some((f) => f.id === saved)) {
        return saved;
      }
    } catch {
      // Ignore localStorage errors
    }
    return '58mm';
  });
  const [copied, setCopied] = useState(false);

  if (!order) return null;

  const currentFormat = THERMAL_FORMATS.find((f) => f.id === selectedFormat) || THERMAL_FORMATS[2];

  const handleSelectFormat = (fmt: ThermalWidth) => {
    setSelectedFormat(fmt);
    try {
      safeLocalStorage.setItem('thermal_ticket_format', fmt);
    } catch {
      // Ignore localStorage errors
    }
  };

  const phoneNorm = normalizeEcuadorPhone(order.customerPhone);
  const formattedPhone = phoneNorm.formattedLocal || order.customerPhone || 'No registrado';
  const storeName = storeConfig.storeName || 'Comerxia Store';
  const logoUrl = storeConfig.logoUrl;
  const storePhone = storeConfig.whatsappNumber || '';
  const storeAddress = storeConfig.address || '';

  const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleString('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) : new Date().toLocaleString('es-EC');

  // Parser to extract CI and structured delivery address sections
  const recipientData = extractRecipientShippingData(order);

  // Calculate or estimate exact ticket height in mm to define the precise @page size without overflowing into A4 or page 2
  const getEstimatedHeightMm = (): number => {
    if (selectedFormat === '70mm') {
      return 120; // Exact standard sticker size 70x120mm
    }
    if (ticketRef.current) {
      const scrollH = ticketRef.current.scrollHeight;
      // 96 DPI: 1 inch = 25.4mm = 96px => mm = px * 25.4 / 96
      const calculatedMm = Math.ceil((scrollH * 25.4) / 96);
      if (calculatedMm > 60) {
        return calculatedMm + 6; // 6mm safety buffer for tear/cutter
      }
    }
    return currentFormat.defaultHeightMm || 130;
  };

  // Inject dynamic @media print styles into the main document so that even if window.print() or Ctrl+P is used, the paper size matches the selected thermal width and never A4
  useEffect(() => {
    const heightMm = getEstimatedHeightMm();
    const styleId = 'shipping-ticket-page-override-style';
    let styleTag = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }

    styleTag.innerHTML = `
      @media print {
        @page {
          size: ${currentFormat.widthMm}mm ${heightMm}mm !important;
          margin: 0mm !important;
        }
        html, body {
          width: ${currentFormat.widthMm}mm !important;
          height: ${heightMm}mm !important;
          max-width: ${currentFormat.widthMm}mm !important;
          max-height: ${heightMm}mm !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background: #ffffff !important;
        }
        body * {
          visibility: hidden !important;
        }
        #shipping-ticket-printable-root,
        #shipping-ticket-printable-root * {
          visibility: visible !important;
        }
        #shipping-ticket-printable-root {
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          width: ${currentFormat.widthMm}mm !important;
          max-width: ${currentFormat.widthMm}mm !important;
          height: ${heightMm}mm !important;
          max-height: ${heightMm}mm !important;
          margin: 0 !important;
          padding: ${currentFormat.paddingMm} !important;
          border: 1.5px solid #000000 !important;
          box-shadow: none !important;
          background: #ffffff !important;
          z-index: 9999999 !important;
        }
        .no-print,
        #shipping-ticket-modal-header,
        #shipping-ticket-modal-footer,
        #shipping-ticket-modal-overlay {
          display: none !important;
        }
      }
    `;

    return () => {
      const el = document.getElementById(styleId);
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    };
  });

  const generateTicketHtml = (targetHeightMm?: number) => {
    return generateShippingTicketHtml({
      order,
      storeConfig,
      currency,
      format: currentFormat,
      targetHeightMm: targetHeightMm || getEstimatedHeightMm(),
    });
  };

  // Primary Print Action: delegates to directPrintShippingTicket for unified native print manager experience
  const handlePrint = () => {
    directPrintShippingTicket({
      order,
      storeConfig,
      currency,
      format: selectedFormat,
      showToast,
    });
  };

  // Dedicated Popup Window Print Handler (100% reliable across browsers and iframe embeds)
  const handleOpenPrintPopup = () => {
    directPrintShippingTicket({
      order,
      storeConfig,
      currency,
      format: selectedFormat,
      showToast,
    });
  };

  // Quick Copy Shipping Text format
  const handleCopyShippingText = () => {
    let text = `📦 *ETIQUETA DE ENVÍO - ${storeName.toUpperCase()}*\n\n`;
    text += `🏷️ *N° de Pedido:* #${order.orderNumber}\n`;
    if (recipientData.ci) {
      text += `🪪 *CI (Cédula):* ${recipientData.ci}\n`;
    }
    text += `👤 *Destinatario:* ${order.customerName}\n`;
    text += `📞 *Teléfono:* ${formattedPhone}\n\n`;
    text += `📍 *DIRECCIÓN DE ENTREGA:*\n`;
    recipientData.fields.forEach((f) => {
      text += `${f.title}\n${f.value}\n\n`;
    });
    text += `💰 *Total:* $${Number(order.totalAmount || 0).toFixed(2)} ${currency}\n`;
    if (Array.isArray(order.items) && order.items.length > 0) {
      text += `\n*Contenido del paquete:*\n`;
      order.items.forEach((it: any) => {
        text += `• ${it.quantity || 1}x ${it.name || it.item?.name || 'Producto'}\n`;
      });
    }

    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast('✓ Datos de envío copiados al portapapeles');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      id="shipping-ticket-modal-overlay"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div
        id="shipping-ticket-modal-card"
        className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-3.5 my-auto animate-scaleUp max-h-[96vh] flex flex-col"
      >
        {/* Modal Header (Hidden on Print) */}
        <div
          id="shipping-ticket-modal-header"
          className="flex items-center justify-between border-b border-slate-100 pb-3 flex-shrink-0 no-print"
        >
          <div className="flex items-center space-x-3 text-sky-700">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center shadow-2xs">
              <Printer className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Etiqueta de Envío Térmica</h3>
                <span className="font-mono font-black text-sky-700 text-xs px-2 py-0.5 bg-sky-50 rounded-md border border-sky-200">
                  #{order.orderNumber}
                </span>
              </div>
              <p className="text-xs text-slate-500">Impresión en formato para impresora térmica de ticket</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thermal Width Selector */}
        <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-2.5 space-y-2 flex-shrink-0 no-print">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-sky-600" />
              <span>Ancho de Impresora Térmica:</span>
            </span>
            <span className="text-[10px] font-bold text-sky-800 bg-sky-100 px-2 py-0.5 rounded-md border border-sky-200">
              {currentFormat.label} • {currentFormat.subtitle}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {THERMAL_FORMATS.map((fmt) => {
              const isSelected = selectedFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => handleSelectFormat(fmt.id)}
                  className={`px-1.5 py-1.5 rounded-lg text-center transition cursor-pointer border flex flex-col items-center justify-center ${
                    isSelected
                      ? 'bg-sky-600 text-white border-sky-600 shadow-xs ring-2 ring-sky-200 font-extrabold'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300 font-bold'
                  }`}
                  title={`Formato ${fmt.label} (${fmt.subtitle})`}
                >
                  <span className="text-xs tracking-tight">{fmt.label}</span>
                  <span className={`text-[9px] leading-tight truncate w-full ${isSelected ? 'text-sky-100' : 'text-slate-400'}`}>
                    {fmt.subtitle.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[10.5px] bg-sky-50/80 border border-sky-200/80 rounded-lg px-2.5 py-1 text-sky-950">
            <span className="font-semibold flex items-center gap-1">
              <span className="text-sky-600 font-bold">✓ Hoja configurada:</span>
              <strong>{currentFormat.widthMm} mm × {getEstimatedHeightMm()} mm</strong>
            </span>
            <span className="text-[9.5px] font-bold text-sky-700 bg-white px-1.5 py-0.5 rounded border border-sky-200">
              {currentFormat.isContinuousRoll ? 'Rollo térmico (Sin A4)' : 'Etiqueta fija (Sin A4)'}
            </span>
          </div>
        </div>

        {/* Modal Scrollable Body: Printable Ticket Preview */}
        <div className="overflow-y-auto pr-1 flex-1 py-3 flex flex-col items-center bg-slate-100/80 rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-1.5 mb-2 px-2.5 py-0.5 rounded-full bg-white text-slate-700 text-[10px] font-bold border border-slate-200 shadow-2xs">
            <span>🖨️ Vista previa a escala: ancho de papel <strong>{currentFormat.label}</strong></span>
          </div>

          <div
            id="shipping-ticket-printable-root"
            ref={ticketRef}
            style={{
              width: '100%',
              maxWidth: `${currentFormat.previewWidthPx}px`,
              minHeight: currentFormat.isContinuousRoll ? 'auto' : '440px',
            }}
            className="bg-white border-2 border-slate-900 rounded-md p-3 shadow-md text-slate-900 flex flex-col justify-between relative space-y-2 transition-all duration-200"
          >
            {/* Store Header with Logo & Name */}
            <div className="text-center border-b border-dashed border-slate-300 pb-1.5">
              {logoUrl ? (
                <div className="flex justify-center mb-1">
                  <img
                    src={logoUrl}
                    alt={storeName}
                    style={{ maxHeight: currentFormat.logoMaxHeight }}
                    className="max-w-[140px] object-contain rounded-xs"
                  />
                </div>
              ) : (
                <div className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-900 text-white mb-1">
                  <Store className="w-3.5 h-3.5" />
                </div>
              )}
              <h4
                style={{ fontSize: currentFormat.titleFontSize }}
                className="font-black uppercase tracking-wide text-slate-950 leading-tight"
              >
                {storeName}
              </h4>
              {storeAddress && <p className="text-[9px] text-slate-500 font-medium leading-tight">{storeAddress}</p>}
              {storePhone && (
                <p className="text-[9px] text-slate-500 font-medium leading-tight">WhatsApp / Tel: {storePhone}</p>
              )}
            </div>

            {/* Badge: Exact title requested "ETIQUETA DE ENVÍO" */}
            <div
              style={{ fontSize: currentFormat.badgeFontSize }}
              className="bg-slate-900 text-white font-black text-center py-1 px-2 rounded-xs uppercase tracking-wider"
            >
              ETIQUETA DE ENVÍO ({currentFormat.label})
            </div>

            {/* Order Number & Date Box */}
            <div className="flex items-center justify-between p-1.5 rounded bg-slate-50 border border-slate-200 text-xs">
              <div>
                <span className="text-[8.5px] font-bold text-slate-500 uppercase block leading-none">N° Pedido:</span>
                <span
                  style={{ fontSize: currentFormat.orderNumberFontSize }}
                  className="font-mono font-black text-sky-700"
                >
                  #{order.orderNumber}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[8.5px] font-bold text-slate-500 uppercase block leading-none">Fecha:</span>
                <span className="text-[9.5px] font-semibold text-slate-700 flex items-center gap-1 justify-end">
                  <Calendar className="w-2.5 h-2.5 text-slate-400" />
                  {orderDate}
                </span>
              </div>
            </div>

            {/* Customer Information Card (CI, Nombre, Teléfono, Dirección) */}
            <div className="p-2 rounded-md bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
              <div className="flex items-center gap-1 border-b border-slate-200 pb-0.5 text-slate-800">
                <User className="w-3 h-3 text-sky-600 shrink-0" />
                <span
                  style={{ fontSize: currentFormat.fieldLabelFontSize }}
                  className="font-black uppercase tracking-wider"
                >
                  Datos del Destinatario (Cliente)
                </span>
              </div>

              {/* 1. CI antes del nombre */}
              <div>
                <span
                  style={{ fontSize: currentFormat.fieldLabelFontSize }}
                  className="font-bold text-slate-500 uppercase block leading-none"
                >
                  CI (Cédula de Identidad):
                </span>
                <p
                  style={{ fontSize: currentFormat.fieldValueFontSize }}
                  className="font-mono font-bold text-sky-800 leading-tight mt-0.5"
                >
                  {recipientData.ci || <span className="text-slate-400 font-normal italic">No registrada</span>}
                </p>
              </div>

              {/* 2. Nombre del Cliente */}
              <div>
                <span
                  style={{ fontSize: currentFormat.fieldLabelFontSize }}
                  className="font-bold text-slate-500 uppercase block leading-none"
                >
                  Nombre del Cliente:
                </span>
                <p
                  style={{ fontSize: currentFormat.fieldValueFontSize }}
                  className="font-bold text-slate-950 leading-tight mt-0.5"
                >
                  {order.customerName}
                </p>
              </div>

              {/* 3. Teléfono */}
              <div>
                <span
                  style={{ fontSize: currentFormat.fieldLabelFontSize }}
                  className="font-bold text-slate-500 uppercase block leading-none"
                >
                  Teléfono / Celular:
                </span>
                <div className="flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span
                    style={{ fontSize: currentFormat.fieldValueFontSize }}
                    className="font-mono font-bold text-emerald-800"
                  >
                    {formattedPhone}
                  </span>
                </div>
              </div>

              {/* 4. Dirección de Entrega con títulos seguidos de dos puntos y salto de línea */}
              <div>
                <span
                  style={{ fontSize: currentFormat.fieldLabelFontSize }}
                  className="font-bold text-slate-500 uppercase block leading-none mb-0.5"
                >
                  📍 Dirección de Entrega:
                </span>
                <div className="p-2 rounded bg-white border border-slate-300 text-slate-950 text-xs space-y-1.5">
                  {recipientData.fields.map((f, idx) => (
                    <div key={idx} className="space-y-0.5">
                      <span
                        style={{ fontSize: currentFormat.fieldLabelFontSize }}
                        className="block font-black text-slate-600 uppercase tracking-wide leading-none"
                      >
                        {f.title}
                      </span>
                      <p
                        style={{ fontSize: currentFormat.fieldValueFontSize }}
                        className="font-bold text-slate-950 whitespace-pre-wrap pl-0.5 leading-tight"
                      >
                        {f.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Items Summary */}
            {Array.isArray(order.items) && order.items.length > 0 && (
              <div className="p-2 rounded-md bg-slate-50 border border-slate-200 space-y-1">
                <div className="flex items-center justify-between border-b border-slate-200 pb-0.5">
                  <span
                    style={{ fontSize: currentFormat.fieldLabelFontSize }}
                    className="font-black uppercase tracking-wider text-slate-700 flex items-center gap-1"
                  >
                    <Package className="w-2.5 h-2.5 text-sky-600" />
                    Contenido ({order.items.length} ítems)
                  </span>
                  <span
                    style={{ fontSize: currentFormat.fieldLabelFontSize }}
                    className="font-bold text-emerald-700 uppercase"
                  >
                    Total: ${Number(order.totalAmount || 0).toFixed(2)} {currency}
                  </span>
                </div>

                <div className="space-y-0.5">
                  {order.items.slice(0, 3).map((it: any, idx: number) => (
                    <div
                      key={idx}
                      style={{ fontSize: currentFormat.itemRowFontSize }}
                      className="flex items-center justify-between py-0.5 text-slate-800"
                    >
                      <span className="truncate pr-1">
                        <strong className="font-mono text-sky-800">{it.quantity || 1}x</strong> {it.name || it.item?.name}
                      </span>
                      <span className="font-mono text-slate-600 flex-shrink-0">
                        ${(Number(it.salePrice || it.item?.salePrice || 0) * (it.quantity || 1)).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {order.items.length > 3 && (
                    <p className="text-[8px] text-slate-400 italic text-center">
                      +{order.items.length - 3} productos adicionales
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="pt-1 border-t border-dashed border-slate-300 text-center text-[8.5px] text-slate-500">
              {storeName} • Manipular paquete con cuidado
            </div>
          </div>
        </div>

        {/* Modal Actions Footer (Hidden on Print) */}
        <div
          id="shipping-ticket-modal-footer"
          className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 flex-shrink-0 no-print flex-wrap"
        >
          <button
            type="button"
            onClick={handleCopyShippingText}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
            title="Copiar datos formateados para WhatsApp o guía de despacho"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
            <span>{copied ? 'Copiado' : 'Copiar Texto'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs active:scale-95"
              title={`Imprimir directo en formato térmico ${currentFormat.label}`}
            >
              <Printer className="w-3.5 h-3.5 text-white" />
              <span>Imprimir ({currentFormat.label})</span>
            </button>

            <button
              type="button"
              onClick={handleOpenPrintPopup}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer border border-slate-200"
              title="Abrir en pestaña dedicada para imprimir"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden sm:inline">Pestaña de Impresión</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 transition cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


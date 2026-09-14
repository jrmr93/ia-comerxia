import { SriInvoiceRecord, SriConfig, StoreConfig } from '../types.ts';

export interface SriRideParams {
  invoice: SriInvoiceRecord;
  sriConfig?: SriConfig | null;
  storeConfig?: StoreConfig | null;
}

export function generateSriRideHtml(params: SriRideParams): string {
  const { invoice, sriConfig, storeConfig } = params;

  const xmlContent = invoice.xmlFirmado || invoice.xmlGenerado || '';

  // Parse XML elements if available
  const matchTag = (tag: string) => {
    const regex = new RegExp(`<${tag}>([^<]+)<\/${tag}>`);
    return xmlContent.match(regex)?.[1] || '';
  };

  const razonSocial = matchTag('razonSocial') || sriConfig?.razonSocial || 'COMERXIA E-COMMERCE S.A.';
  const nombreComercial = matchTag('nombreComercial') || sriConfig?.nombreComercial || 'COMERXIA ECUADOR';
  const ruc = matchTag('ruc') || sriConfig?.ruc || '1700000000001';
  const dirMatriz = matchTag('dirMatriz') || sriConfig?.dirMatriz || 'Quito, Ecuador';
  const obligadoContabilidad = matchTag('obligadoContabilidad') || sriConfig?.obligadoContabilidad || 'NO';
  const contribuyenteEspecial = matchTag('contribuyenteEspecial') || sriConfig?.contribuyenteEspecial || '';
  const contribuyenteRimpe = matchTag('contribuyenteRimpe') || '';

  const fechaEmision = matchTag('fechaEmision') || (invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString('es-EC') : '');
  const razonSocialComprador = matchTag('razonSocialComprador') || invoice.customerName || 'CONSUMIDOR FINAL';
  const identificacionComprador = matchTag('identificacionComprador') || invoice.customerCiRuc || '9999999999999';

  // Parse items from XML
  const detallesList: Array<{
    codigo: string;
    descripcion: string;
    cantidad: string;
    precioUnitario: string;
    descuento: string;
    precioTotalSinImpuesto: string;
  }> = [];

  const detalleRegex = /<detalle>([\s\S]*?)<\/detalle>/g;
  let match;
  while ((match = detalleRegex.exec(xmlContent)) !== null) {
    const block = match[1];
    const getSub = (subTag: string) => block.match(new RegExp(`<${subTag}>([^<]+)<\/${subTag}>`))?.[1] || '';
    detallesList.push({
      codigo: getSub('codigoPrincipal') || 'PROD',
      descripcion: getSub('descripcion') || 'Producto',
      cantidad: getSub('cantidad') || '1',
      precioUnitario: getSub('precioUnitario') || '0.00',
      descuento: getSub('descuento') || '0.00',
      precioTotalSinImpuesto: getSub('precioTotalSinImpuesto') || '0.00',
    });
  }

  // Parse totals from XML
  const subtotal15 = matchTag('baseImponible') || '0.00';
  const totalSinImpuestos = matchTag('totalSinImpuestos') || invoice.totalAmount || '0.00';
  const totalDescuento = matchTag('totalDescuento') || '0.00';
  const valorIva = matchTag('valor') || '0.00';
  const importeTotal = matchTag('importeTotal') || invoice.totalAmount || '0.00';

  const ambienteText = invoice.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS';
  const estadoText = invoice.estadoAutorizacion || 'AUTORIZADO';

  const storeName = storeConfig?.storeName || 'Comerxia Store';
  const logoUrl = storeConfig?.logoDesktopUrl || storeConfig?.logoUrl || null;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>RIDE Factura Electrónica SRI #${invoice.secuencial}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
    }
    body {
      background: #f8fafc;
      color: #0f172a;
      padding: 15px;
      font-size: 11px;
      line-height: 1.3;
    }
    .ride-container {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      padding: 20px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 15px;
    }
    .box {
      border: 1px solid #94a3b8;
      border-radius: 6px;
      padding: 10px;
      background: #ffffff;
    }
    .logo-container {
      margin-bottom: 10px;
      text-align: center;
    }
    .logo-container img {
      max-height: 55px;
      max-width: 100%;
      object-fit: contain;
    }
    .title-emisor {
      font-size: 13px;
      font-weight: bold;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .label-bold {
      font-weight: bold;
      color: #334155;
    }
    .header-sri-title {
      font-size: 14px;
      font-weight: 900;
      color: #0284c7;
      text-transform: uppercase;
      margin-bottom: 6px;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 4px;
    }
    .clave-box {
      margin-top: 8px;
      background: #f1f5f9;
      padding: 6px;
      border-radius: 4px;
      text-align: center;
    }
    .barcode-svg {
      width: 100%;
      max-height: 45px;
      margin: 4px 0;
    }
    .clave-text {
      font-family: monospace;
      font-size: 10px;
      font-weight: bold;
      letter-spacing: 0.5px;
      word-break: break-all;
    }
    .table-info {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    .table-info th, .table-info td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      text-align: left;
    }
    .table-info th {
      background: #f1f5f9;
      font-size: 10px;
      font-weight: bold;
      color: #334155;
      text-transform: uppercase;
    }
    .table-items {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    .table-items th {
      background: #0f172a;
      color: #ffffff;
      padding: 7px 8px;
      font-size: 10px;
      text-transform: uppercase;
    }
    .table-items td {
      border: 1px solid #e2e8f0;
      padding: 6px 8px;
    }
    .table-items tr:nth-child(even) {
      background: #f8fafc;
    }
    .totals-grid {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 15px;
    }
    .totals-table {
      width: 100%;
      border-collapse: collapse;
    }
    .totals-table td {
      border: 1px solid #cbd5e1;
      padding: 5px 8px;
    }
    .totals-table td.val {
      text-align: right;
      font-family: monospace;
      font-weight: bold;
    }
    .grand-total {
      background: #e0f2fe;
      color: #0369a1;
      font-size: 12px;
      font-weight: 900;
    }
    .badge-status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: bold;
      font-size: 10px;
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #86efac;
    }
    .actions-bar {
      margin-bottom: 15px;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .btn-print {
      background: #0284c7;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: bold;
      cursor: pointer;
      font-size: 12px;
    }
    @media print {
      body { background: white; padding: 0; }
      .ride-container { border: none; box-shadow: none; padding: 0; }
      .actions-bar { display: none; }
    }
  </style>
</head>
<body>

  <div className="actions-bar" style="max-width:800px; margin:0 auto 15px auto; display:flex; justify-content:flex-end;">
    <button onclick="window.print()" class="btn-print">🖨️ Imprimir RIDE / PDF</button>
  </div>

  <div class="ride-container">
    {/* Grid Header 2 columnas SRI */}
    <div class="grid-2">
      {/* Columna Izquierda: Emisor */}
      <div class="box">
        ${logoUrl ? `<div class="logo-container"><img src="${logoUrl}" alt="${storeName}"></div>` : ''}
        <div class="title-emisor">${razonSocial}</div>
        <div style="font-size:11px; color:#475569; margin-bottom:8px;"><strong>${nombreComercial}</strong></div>
        <p><span class="label-bold">Dirección Matriz:</span> ${dirMatriz}</p>
        <p><span class="label-bold">Obligado a Llevar Contabilidad:</span> ${obligadoContabilidad}</p>
        ${contribuyenteEspecial ? `<p><span class="label-bold">Contribuyente Especial N°:</span> ${contribuyenteEspecial}</p>` : ''}
        ${contribuyenteRimpe ? `<p><span class="label-bold">Régimen Tributario:</span> ${contribuyenteRimpe}</p>` : ''}
      </div>

      {/* Columna Derecha: Datos Tributarios Factura */}
      <div class="box">
        <div class="header-sri-title">R.U.C.: ${ruc}</div>
        <div style="font-size:14px; font-weight:900; color:#0f172a; margin-bottom:6px;">FACTURA</div>
        <p><span class="label-bold">No.:</span> ${(invoice as any).estab || '001'}-${(invoice as any).ptoEmi || '001'}-${invoice.secuencial}</p>
        <p><span class="label-bold">Número de Autorización:</span></p>
        <p style="font-family:monospace; font-size:10px; word-break:break-all; font-weight:bold;">${invoice.numeroAutorizacion || invoice.claveAcceso}</p>
        <p style="margin-top:4px;"><span class="label-bold">Fecha y Hora de Autorización:</span> ${invoice.fechaAutorizacion ? new Date(invoice.fechaAutorizacion).toLocaleString('es-EC') : fechaEmision}</p>
        <p><span class="label-bold">Ambiente:</span> ${ambienteText}</p>
        <p><span class="label-bold">Emisión:</span> NORMAL</p>
        <p><span class="label-bold">Estado:</span> <span class="badge-status">${estadoText}</span></p>

        <div class="clave-box">
          <div style="font-size:9px; font-weight:bold; color:#475569; uppercase">CLAVE DE ACCESO</div>
          <svg id="barcode-svg" class="barcode-svg"></svg>
          <div class="clave-text">${invoice.claveAcceso}</div>
        </div>
      </div>
    </div>

    {/* Datos del Comprador */}
    <table class="table-info">
      <tr>
        <td style="width:65%;"><span class="label-bold">Razón Social / Nombres y Apellidos:</span> ${razonSocialComprador}</td>
        <td><span class="label-bold">Identificación:</span> ${identificacionComprador}</td>
      </tr>
      <tr>
        <td><span class="label-bold">Fecha de Emisión:</span> ${fechaEmision}</td>
        <td><span class="label-bold">Guía de Remisión:</span> N/A</td>
      </tr>
    </table>

    {/* Tabla Detalle de Productos */}
    <table class="table-items">
      <thead>
        <tr>
          <th style="width:12%;">Cod. Principal</th>
          <th>Descripción</th>
          <th style="width:10%; text-align:center;">Cantidad</th>
          <th style="width:14%; text-align:right;">Precio Unitario</th>
          <th style="width:12%; text-align:right;">Descuento</th>
          <th style="width:14%; text-align:right;">Precio Total</th>
        </tr>
      </thead>
      <tbody>
        ${detallesList.length > 0 ? detallesList.map(item => `
          <tr>
            <td style="font-family:monospace; font-weight:bold;">${item.codigo}</td>
            <td>${item.descripcion}</td>
            <td style="text-align:center;">${item.cantidad}</td>
            <td style="text-align:right; font-family:monospace;">$${Number(item.precioUnitario).toFixed(2)}</td>
            <td style="text-align:right; font-family:monospace;">$${Number(item.descuento).toFixed(2)}</td>
            <td style="text-align:right; font-family:monospace; font-weight:bold;">$${Number(item.precioTotalSinImpuesto).toFixed(2)}</td>
          </tr>
        `).join('') : `
          <tr>
            <td style="font-family:monospace;">PROD-001</td>
            <td>Venta de Mercadería / Servicio Comercial</td>
            <td style="text-align:center;">1</td>
            <td style="text-align:right;">$${Number(invoice.totalAmount || 0).toFixed(2)}</td>
            <td style="text-align:right;">$0.00</td>
            <td style="text-align:right; font-weight:bold;">$${Number(invoice.totalAmount || 0).toFixed(2)}</td>
          </tr>
        `}
      </tbody>
    </table>

    {/* Grid Totales e Info Adicional */}
    <div class="totals-grid">
      <div class="box">
        <div style="font-weight:bold; text-transform:uppercase; color:#0284c7; margin-bottom:6px; border-bottom:1px solid #e2e8f0; padding-bottom:3px;">Información Adicional & Pagos</div>
        <p style="margin-bottom:4px;"><span class="label-bold">Sistema:</span> IA-Comerxia ERP Ecuador</p>
        <p style="margin-bottom:4px;"><span class="label-bold">Forma de Pago:</span> Sin utilización del sistema financiero</p>
        <p style="margin-bottom:4px;"><span class="label-bold">Total Pago:</span> $${Number(importeTotal).toFixed(2)}</p>
      </div>

      <table class="totals-table">
        <tr>
          <td>SUBTOTAL 15%</td>
          <td class="val">$${Number(subtotal15).toFixed(2)}</td>
        </tr>
        <tr>
          <td>SUBTOTAL 0%</td>
          <td class="val">$0.00</td>
        </tr>
        <tr>
          <td>SUBTOTAL SIN IMPUESTOS</td>
          <td class="val">$${Number(totalSinImpuestos).toFixed(2)}</td>
        </tr>
        <tr>
          <td>TOTAL DESCUENTO</td>
          <td class="val">$${Number(totalDescuento).toFixed(2)}</td>
        </tr>
        <tr>
          <td>IVA 15%</td>
          <td class="val">$${Number(valorIva).toFixed(2)}</td>
        </tr>
        <tr class="grand-total">
          <td>VALOR TOTAL</td>
          <td class="val">$${Number(importeTotal).toFixed(2)}</td>
        </tr>
      </table>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <script>
    try {
      JsBarcode("#barcode-svg", "${invoice.claveAcceso}", {
        format: "CODE128",
        width: 1.2,
        height: 40,
        displayValue: false,
        margin: 2
      });
    } catch(e) {}
  </script>
</body>
</html>`;
}

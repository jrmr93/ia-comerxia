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
  const nombreComercial = matchTag('nombreComercial') || sriConfig?.nombreComercial || storeConfig?.storeName || 'COMERXIA ECUADOR';
  const ruc = matchTag('ruc') || sriConfig?.ruc || '1700000000001';
  const dirMatriz = matchTag('dirMatriz') || sriConfig?.dirMatriz || 'Quito, Ecuador';
  const dirSucursal = matchTag('dirEstablecimiento') || dirMatriz;
  const obligadoContabilidad = matchTag('obligadoContabilidad') || sriConfig?.obligadoContabilidad || 'NO';
  const contribuyenteEspecial = matchTag('contribuyenteEspecial') || sriConfig?.contribuyenteEspecial || '';
  const contribuyenteRimpe = matchTag('contribuyenteRimpe') || '';

  const fechaEmision = matchTag('fechaEmision') || (invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString('es-EC') : '');
  const razonSocialComprador = matchTag('razonSocialComprador') || invoice.customerName || 'CONSUMIDOR FINAL';
  const identificacionComprador = matchTag('identificacionComprador') || invoice.customerCiRuc || '9999999999999';
  const direccionComprador = matchTag('direccionComprador') || 
    (xmlContent.match(/<campoAdicional nombre="Direccion">([^<]+)<\/campoAdicional>/)?.[1]) || 
    (invoice as any).customerAddress || 'N/A';
  const correoComprador = matchTag('correoComprador') || 
    (xmlContent.match(/<campoAdicional nombre="Email">([^<]+)<\/campoAdicional>/)?.[1]) || 
    (invoice as any).customerEmail || 'N/A';

  // Parse items from XML
  const detallesList: Array<{
    codigoPrincipal: string;
    codigoAuxiliar: string;
    cantidad: string;
    descripcion: string;
    detalleAdicional: string;
    precioUnitario: string;
    subsidio: string;
    precioSinSubsidio: string;
    descuento: string;
    precioTotalSinImpuesto: string;
  }> = [];

  const detalleRegex = /<detalle>([\s\S]*?)<\/detalle>/g;
  let match;
  while ((match = detalleRegex.exec(xmlContent)) !== null) {
    const block = match[1];
    const getSub = (subTag: string) => block.match(new RegExp(`<${subTag}>([^<]+)<\/${subTag}>`))?.[1] || '';
    const codP = getSub('codigoPrincipal') || 'PROD';
    const codA = getSub('codigoAuxiliar') || '';
    const desc = getSub('descripcion') || 'Producto';
    const cant = getSub('cantidad') || '1.00';
    const pUnit = getSub('precioUnitario') || '0.00';
    const descVal = getSub('descuento') || '0.00';
    const pTot = getSub('precioTotalSinImpuesto') || '0.00';

    detallesList.push({
      codigoPrincipal: codP,
      codigoAuxiliar: codA,
      descripcion: desc,
      cantidad: cant,
      precioUnitario: pUnit,
      subsidio: '0.00',
      precioSinSubsidio: '0.00',
      descuento: descVal,
      precioTotalSinImpuesto: pTot,
      detalleAdicional: '',
    });
  }

  // Parse totals from XML
  const totalImpuestosList: Array<{ codigoPorcentaje: string; baseImponible: number; valor: number }> = [];
  const totalImpuestoRegex = /<totalImpuesto>([\s\S]*?)<\/totalImpuesto>/g;
  let impMatch;
  while ((impMatch = totalImpuestoRegex.exec(xmlContent)) !== null) {
    const block = impMatch[1];
    const getSub = (subTag: string) => block.match(new RegExp(`<${subTag}>([^<]+)<\/${subTag}>`))?.[1] || '0.00';
    totalImpuestosList.push({
      codigoPorcentaje: getSub('codigoPorcentaje'),
      baseImponible: Number(getSub('baseImponible') || 0),
      valor: Number(getSub('valor') || 0),
    });
  }

  const totalSinImpuestosVal = Number(matchTag('totalSinImpuestos') || invoice.totalAmount || 0);
  const totalDescuentoVal = Number(matchTag('totalDescuento') || 0);
  const importeTotalVal = Number(matchTag('importeTotal') || invoice.totalAmount || 0);

  // Compute subtotal breakdown
  let subtotal15 = 0;
  let subtotal12 = 0;
  let subtotal0 = 0;
  let subtotalNoObjeto = 0;
  let subtotalExento = 0;
  let iva15 = 0;
  let iva12 = 0;

  if (totalImpuestosList.length > 0) {
    totalImpuestosList.forEach(imp => {
      if (imp.codigoPorcentaje === '4') {
        subtotal15 += imp.baseImponible;
        iva15 += imp.valor;
      } else if (imp.codigoPorcentaje === '2') {
        subtotal12 += imp.baseImponible;
        iva12 += imp.valor;
      } else if (imp.codigoPorcentaje === '0') {
        subtotal0 += imp.baseImponible;
      } else if (imp.codigoPorcentaje === '6') {
        subtotalNoObjeto += imp.baseImponible;
      } else if (imp.codigoPorcentaje === '7') {
        subtotalExento += imp.baseImponible;
      }
    });
  } else {
    const taxAmt = Number(invoice.taxAmount || 0);
    if (taxAmt > 0) {
      subtotal15 = totalSinImpuestosVal;
      iva15 = taxAmt;
    } else {
      subtotal0 = totalSinImpuestosVal;
    }
  }

  const storeName = storeConfig?.storeName || 'Comerxia Store';
  const logoUrl = storeConfig?.logoDesktopUrl || storeConfig?.logoUrl || null;
  const numSecuencial = invoice.secuencial ? String(invoice.secuencial).padStart(9, '0') : '000000001';
  const estabStr = (invoice as any).estab || '001';
  const ptoEmiStr = (invoice as any).ptoEmi || '001';
  const ambienteText = invoice.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>RIDE Factura Electrónica SRI #${numSecuencial}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
    }
    body {
      background: #ffffff;
      color: #000000;
      padding: 10px;
      font-size: 9.5px;
      line-height: 1.25;
    }
    .ride-container {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      padding: 10px;
    }
    .header-flex {
      display: flex;
      gap: 14px;
      margin-bottom: 12px;
      align-items: stretch;
    }
    .header-left-col {
      width: 48%;
      display: flex;
      flex-direction: column;
    }
    .logo-container {
      min-height: 100px;
      max-height: 120px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      margin-bottom: 10px;
    }
    .logo-container img {
      max-height: 110px;
      max-width: 100%;
      object-fit: contain;
    }
    .box-emisor {
      border: 1px solid #000000;
      border-radius: 8px;
      padding: 10px 12px;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: #ffffff;
    }
    .emisor-title {
      font-size: 10.5px;
      font-weight: bold;
      color: #000000;
      text-transform: uppercase;
      margin-bottom: 10px;
      word-break: break-word;
    }
    .emisor-row {
      margin-bottom: 6px;
      font-size: 9px;
    }
    .box-sri {
      width: 52%;
      border: 1px solid #000000;
      border-radius: 8px;
      padding: 12px 14px;
      background: #ffffff;
    }
    .sri-ruc-title {
      font-size: 13px;
      font-weight: bold;
      color: #000000;
      margin-bottom: 6px;
    }
    .sri-doc-type {
      font-size: 14px;
      font-weight: bold;
      color: #000000;
      margin-bottom: 10px;
    }
    .sri-row {
      margin-bottom: 4px;
      font-size: 9px;
    }
    .sri-bold {
      font-weight: bold;
      color: #000000;
    }
    .barcode-section {
      margin-top: 8px;
      text-align: center;
    }
    .barcode-svg {
      width: 100%;
      max-height: 42px;
      margin: 4px 0;
    }
    .clave-text {
      font-family: monospace;
      font-size: 9px;
      font-weight: bold;
      letter-spacing: 0.2px;
      word-break: break-all;
    }
    .box-customer {
      border: 1px solid #000000;
      border-radius: 8px;
      padding: 8px 12px;
      margin-bottom: 12px;
      background: #ffffff;
    }
    .customer-table {
      width: 100%;
      border-collapse: collapse;
    }
    .customer-table td {
      padding: 3px 0;
      font-size: 9.5px;
      vertical-align: top;
    }
    .table-items {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    .table-items th {
      border: 1px solid #000000;
      background: #ffffff;
      color: #000000;
      padding: 5px 4px;
      font-size: 8.5px;
      font-weight: bold;
      text-align: center;
    }
    .table-items td {
      border: 1px solid #000000;
      padding: 4px 5px;
      font-size: 9px;
      vertical-align: middle;
    }
    .footer-flex {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }
    .footer-left-col {
      width: 58%;
      flex-shrink: 0;
    }
    .footer-right-col {
      width: 42%;
      flex-grow: 1;
    }
    .box-info-adicional {
      border: 1px solid #000000;
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 10px;
      background: #ffffff;
    }
    .info-header {
      font-weight: bold;
      text-align: center;
      margin-bottom: 6px;
      font-size: 9.5px;
    }
    .table-pagos {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000000;
    }
    .table-pagos th {
      border: 1px solid #000000;
      background: #ffffff;
      padding: 4px;
      font-size: 9px;
      font-weight: bold;
      text-align: center;
    }
    .table-pagos td {
      border: 1px solid #000000;
      padding: 4px;
      font-size: 9px;
    }
    .totals-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000000;
    }
    .totals-table td {
      border: 1px solid #000000;
      padding: 3.5px 6px;
      font-size: 9px;
    }
    .totals-table td.lbl {
      font-weight: bold;
      color: #000000;
    }
    .totals-table td.val {
      text-align: right;
      font-family: monospace;
      font-weight: bold;
    }
    .actions-bar {
      margin-bottom: 12px;
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

  <div class="actions-bar" style="max-width:800px; margin:0 auto 12px auto; display:flex; justify-content:flex-end;">
    <button onclick="window.print()" class="btn-print">🖨️ Imprimir RIDE / PDF</button>
  </div>

  <div class="ride-container">
    <div class="header-flex">
      <div class="header-left-col">
        <div class="logo-container">
          ${logoUrl ? `<img src="${logoUrl}" alt="${storeName}">` : `<div style="font-size:18px; font-weight:bold; color:#000;">${storeName}</div>`}
        </div>

        <div class="box-emisor">
          <div class="emisor-title">${razonSocial}</div>
          <div class="emisor-row"><span class="sri-bold">Dirección Matriz:</span> ${dirMatriz}</div>
          <div class="emisor-row"><span class="sri-bold">Dirección Sucursal:</span> ${dirSucursal}</div>
          <div class="emisor-row" style="margin-top:8px; display:flex; justify-content:space-between;"><span class="sri-bold">OBLIGADO A LLEVAR CONTABILIDAD</span> <span>${obligadoContabilidad}</span></div>
          ${contribuyenteEspecial ? `<div class="emisor-row"><span class="sri-bold">Contribuyente Especial Nro:</span> ${contribuyenteEspecial}</div>` : ''}
          ${contribuyenteRimpe ? `<div class="emisor-row"><span class="sri-bold">Régimen Tributario:</span> ${contribuyenteRimpe}</div>` : ''}
        </div>
      </div>

      <div class="box-sri">
        <div class="sri-ruc-title">R.U.C.: &nbsp;&nbsp;&nbsp;&nbsp; ${ruc}</div>
        <div class="sri-doc-type">FACTURA</div>
        <div class="sri-row"><span class="sri-bold">No.</span> &nbsp;&nbsp;&nbsp;&nbsp; ${estabStr}-${ptoEmiStr}-${numSecuencial}</div>
        <div class="sri-row" style="margin-top:6px;"><span class="sri-bold">NÚMERO DE AUTORIZACIÓN</span></div>
        <div class="clave-text" style="font-size:9.5px; margin-bottom:6px;">${invoice.numeroAutorizacion || invoice.claveAcceso}</div>
        <div class="sri-row"><span class="sri-bold">FECHA Y HORA DE AUTORIZACIÓN:</span> &nbsp;&nbsp; ${invoice.fechaAutorizacion ? new Date(invoice.fechaAutorizacion).toLocaleString('es-EC') : fechaEmision}</div>
        <div class="sri-row"><span class="sri-bold">AMBIENTE:</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${ambienteText}</div>
        <div class="sri-row"><span class="sri-bold">EMISIÓN:</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; NORMAL</div>
        
        <div class="barcode-section">
          <div class="sri-bold" style="font-size:9px; text-transform:uppercase; text-align:left; margin-bottom:2px;">CLAVE DE ACCESO</div>
          <svg id="barcode-svg" class="barcode-svg"></svg>
          <div class="clave-text">${invoice.claveAcceso}</div>
        </div>
      </div>
    </div>

    <div class="box-customer">
      <table class="customer-table">
        <tr>
          <td colspan="2"><span class="sri-bold">Razón Social / Nombres y Apellidos:</span> &nbsp;&nbsp;&nbsp;&nbsp; ${razonSocialComprador}</td>
        </tr>
        <tr>
          <td style="width:40%;"><span class="sri-bold">Identificación</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${identificacionComprador}</td>
          <td>
            <span style="margin-right:50px;"><span class="sri-bold">Placa / Matrícula:</span></span>
            <span><span class="sri-bold">Guía</span></span>
          </td>
        </tr>
        <tr>
          <td colspan="2"><span class="sri-bold">Fecha</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${fechaEmision}</td>
        </tr>
        <tr>
          <td colspan="2"><span class="sri-bold">Direccion:</span></td>
        </tr>
        <tr>
          <td colspan="2" style="padding-left:12px;">${direccionComprador}</td>
        </tr>
      </table>
    </div>

    <table class="table-items">
      <thead>
        <tr>
          <th style="width:9%;">Cod. Principal</th>
          <th style="width:8%;">Cod. Auxiliar</th>
          <th style="width:7%;">Cantidad</th>
          <th>Descripción</th>
          <th style="width:12%;">Detalle Adicional</th>
          <th style="width:10%;">Precio Unitario</th>
          <th style="width:7%;">Subsidio</th>
          <th style="width:9%;">Precio sin Subsidio</th>
          <th style="width:8%;">Descuento</th>
          <th style="width:10%;">Precio Total</th>
        </tr>
      </thead>
      <tbody>
        ${detallesList.length > 0 ? detallesList.map(item => `
          <tr>
            <td style="font-family:monospace; text-align:center;">${item.codigoPrincipal}</td>
            <td style="font-family:monospace; text-align:center;">${item.codigoAuxiliar}</td>
            <td style="text-align:right;">${item.cantidad}</td>
            <td>${item.descripcion}</td>
            <td></td>
            <td style="text-align:right; font-family:monospace;">${Number(item.precioUnitario).toFixed(2)}</td>
            <td style="text-align:right; font-family:monospace;">0.00</td>
            <td style="text-align:right; font-family:monospace;">0.00</td>
            <td style="text-align:right; font-family:monospace;">${Number(item.descuento).toFixed(2)}</td>
            <td style="text-align:right; font-family:monospace; font-weight:bold;">${Number(item.precioTotalSinImpuesto).toFixed(2)}</td>
          </tr>
        `).join('') : `
          <tr>
            <td style="font-family:monospace; text-align:center;">001049</td>
            <td></td>
            <td style="text-align:right;">1.00</td>
            <td>Venta de Mercadería / Servicio Comercial</td>
            <td></td>
            <td style="text-align:right; font-family:monospace;">${Number(totalSinImpuestosVal).toFixed(2)}</td>
            <td style="text-align:right;">0.00</td>
            <td style="text-align:right;">0.00</td>
            <td style="text-align:right;">0.00</td>
            <td style="text-align:right; font-weight:bold; font-family:monospace;">${Number(totalSinImpuestosVal).toFixed(2)}</td>
          </tr>
        `}
      </tbody>
    </table>

    <div class="footer-flex">
      <div class="footer-left-col">
        <div class="box-info-adicional">
          <div class="info-header">Información Adicional</div>
          <div style="font-size:9px;"><span class="sri-bold">Email:</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${correoComprador}</div>
        </div>

        <table class="table-pagos">
          <thead>
            <tr>
              <th style="width:70%;">Forma de pago</th>
              <th style="width:30%;">Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>01 - SIN UTILIZACION DEL SISTEMA FINANCIERO</td>
              <td style="text-align:right; font-family:monospace; font-weight:bold;">${importeTotalVal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="footer-right-col">
        <table class="totals-table">
          <tr>
            <td class="lbl">SUBTOTAL ${subtotal12 > 0 ? '12%' : '15%'}</td>
            <td class="val">${(subtotal15 || subtotal12).toFixed(2)}</td>
          </tr>
          <tr>
            <td class="lbl">SUBTOTAL NO OBJETO DE IVA</td>
            <td class="val">${subtotalNoObjeto.toFixed(2)}</td>
          </tr>
          <tr>
            <td class="lbl">SUBTOTAL EXENTO DE IVA</td>
            <td class="val">${subtotalExento.toFixed(2)}</td>
          </tr>
          <tr>
            <td class="lbl">SUBTOTAL SIN IMPUESTOS</td>
            <td class="val">${totalSinImpuestosVal.toFixed(2)}</td>
          </tr>
          <tr>
            <td class="lbl">TOTAL DESCUENTO</td>
            <td class="val">${totalDescuentoVal.toFixed(2)}</td>
          </tr>
          <tr>
            <td class="lbl">ICE</td>
            <td class="val">0.00</td>
          </tr>
          <tr>
            <td class="lbl">IVA ${subtotal12 > 0 ? '12%' : '15%'}</td>
            <td class="val">${(iva15 || iva12).toFixed(2)}</td>
          </tr>
          <tr>
            <td class="lbl">IRBPNR</td>
            <td class="val">0.00</td>
          </tr>
          <tr>
            <td class="lbl">PROPINA</td>
            <td class="val">0.00</td>
          </tr>
          <tr style="font-weight:bold; background:#ffffff;">
            <td class="lbl">VALOR TOTAL</td>
            <td class="val">${importeTotalVal.toFixed(2)}</td>
          </tr>
          <tr>
            <td class="lbl">VALOR TOTAL SIN SUBSIDIO</td>
            <td class="val">0.00</td>
          </tr>
          <tr>
            <td class="lbl" style="font-size:8px;">AHORRO POR SUBSIDIO:<br><span style="font-weight:normal;">(Incluye IVA cuando corresponda)</span></td>
            <td class="val" style="vertical-align:bottom;">0.00</td>
          </tr>
        </table>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <script>
    try {
      JsBarcode("#barcode-svg", "${invoice.claveAcceso}", {
        format: "CODE128",
        width: 1.1,
        height: 38,
        displayValue: false,
        margin: 1
      });
    } catch(e) {}
  </script>
</body>
</html>`;
}

import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';
import { SriInvoiceRecord, SriConfig, StoreConfig } from '../types.ts';

export interface SriRidePdfParams {
  invoice: SriInvoiceRecord;
  sriConfig?: SriConfig | null;
  storeConfig?: StoreConfig | null;
}

/**
 * Tabla de patrones de código de barras Code128 (Sets A/B/C)
 * Cada caracter contiene [b1, s1, b2, s2, b3, s3] (ancho en módulos, total = 11)
 */
const CODE128_PATTERNS: number[][] = [
  [2,1,2,2,2,2], [2,2,2,1,2,2], [2,2,2,2,2,1], [1,2,1,2,2,3], [1,2,1,3,2,2], // 0-4
  [1,3,1,2,2,2], [1,2,2,2,1,3], [1,2,2,3,1,2], [1,3,2,2,1,2], [2,2,1,2,1,3], // 5-9
  [2,2,1,3,1,2], [2,3,1,2,1,2], [1,1,2,2,3,2], [1,2,2,1,3,2], [1,2,2,2,3,1], // 10-14
  [1,1,3,2,2,2], [1,2,3,1,2,2], [1,2,3,2,2,1], [2,2,3,2,1,1], [2,2,1,1,3,2], // 15-19
  [2,2,1,2,3,1], [2,1,3,2,1,2], [2,2,3,1,1,2], [3,1,2,1,3,1], [3,1,1,2,2,2], // 20-24
  [3,2,1,1,2,2], [3,2,1,2,2,1], [3,1,2,2,1,2], [3,2,2,1,1,2], [3,2,2,2,1,1], // 25-29
  [2,1,2,1,2,3], [2,1,2,3,2,1], [2,3,2,1,2,1], [1,1,1,3,2,3], [1,3,1,1,2,3], // 30-34
  [1,3,1,3,2,1], [1,1,2,3,1,3], [1,3,2,1,1,3], [1,3,2,3,1,1], [2,1,1,3,1,3], // 35-39
  [2,3,1,1,1,3], [2,3,1,3,1,1], [1,1,2,1,3,3], [1,1,2,3,3,1], [1,3,2,1,3,1], // 40-44
  [1,1,3,1,2,3], [1,1,3,3,2,1], [1,3,3,1,2,1], [3,1,3,1,2,1], [2,1,1,3,3,1], // 45-49
  [2,3,1,1,3,1], [2,1,3,1,1,3], [2,1,3,3,1,1], [2,1,3,1,3,1], [3,1,1,1,2,3], // 50-54
  [3,1,1,3,2,1], [3,3,1,1,2,1], [3,1,2,1,1,3], [3,1,2,3,1,1], [3,3,2,1,1,1], // 55-59
  [3,1,4,1,1,1], [2,2,1,4,1,1], [4,3,1,1,1,1], [1,1,1,2,2,4], [1,1,1,4,2,2], // 60-64
  [1,2,1,1,2,4], [1,2,1,4,2,1], [1,4,1,1,2,2], [1,4,1,2,2,1], [1,1,2,2,1,4], // 65-69
  [1,1,2,4,1,2], [1,2,2,1,1,4], [1,2,2,4,1,1], [1,4,2,1,1,2], [1,4,2,2,1,1], // 70-74
  [2,4,1,2,1,1], [2,2,1,1,1,4], [4,1,1,1,1,2], [1,9,4,1,1,1], [1,1,1,3,1,4], // 75-79
  [1,1,1,4,1,3], [1,2,1,1,1,4], [1,2,1,4,1,1], [1,4,1,1,1,2], [1,4,1,2,1,1], // 80-84
  [4,1,1,1,1,2], [4,1,1,2,1,1], [4,2,1,1,1,1], [2,4,1,1,1,1], [2,1,2,1,4,1], // 85-89
  [2,1,4,1,2,1], [4,1,2,1,2,1], [1,1,1,1,4,3], [1,1,1,3,4,1], [1,3,1,1,4,1], // 90-94
  [1,1,4,1,1,3], [1,1,4,3,1,1], [4,1,1,1,3,1], [4,1,1,3,1,1], [1,1,3,1,4,1], // 95-99
  [1,1,4,1,3,1], [3,1,1,1,4,1], [4,1,1,1,2,1], [2,1,1,4,1,2], [2,1,1,2,1,4], // 100-104 (100: Code B)
  [2,1,1,2,3,2] // 105: Start C
];
const CODE128_STOP = [2,3,3,1,1,1,2]; // 106: Stop (13 módulos)

/**
 * Dibuja un código de barras vectorial Code128 exacto y legible para el SRI
 */
function drawCode128Barcode(doc: jsPDF, text: string, x: number, y: number, width: number, height: number) {
  const digits = text.replace(/\D/g, '');
  if (!digits) return;

  const symbolCodes: number[] = [105]; // Start C

  let i = 0;
  while (i < digits.length) {
    if (i + 1 < digits.length) {
      const pair = parseInt(digits.substring(i, i + 2), 10);
      symbolCodes.push(pair);
      i += 2;
    } else {
      symbolCodes.push(100); // Switch to Code B
      const singleDigitChar = digits.charCodeAt(i) - 32;
      symbolCodes.push(singleDigitChar);
      i += 1;
    }
  }

  // Calculate checksum modulo 103
  let checksum = symbolCodes[0];
  for (let idx = 1; idx < symbolCodes.length; idx++) {
    checksum += symbolCodes[idx] * idx;
  }
  checksum = checksum % 103;
  symbolCodes.push(checksum);

  const totalModules = symbolCodes.length * 11 + 13;
  const moduleWidth = width / totalModules;

  doc.setFillColor(0, 0, 0);

  let curX = x;

  symbolCodes.forEach((code) => {
    const pattern = CODE128_PATTERNS[code] || CODE128_PATTERNS[0];
    pattern.forEach((w, pIdx) => {
      const wMm = w * moduleWidth;
      if (pIdx % 2 === 0) {
        doc.rect(curX, y, wMm, height, 'F');
      }
      curX += wMm;
    });
  });

  // Stop character
  CODE128_STOP.forEach((w, pIdx) => {
    const wMm = w * moduleWidth;
    if (pIdx % 2 === 0) {
      doc.rect(curX, y, wMm, height, 'F');
    }
    curX += wMm;
  });
}

/**
 * Resuelve la imagen del logo de la tienda desde storeConfig (archivos en disco, data URIs o URLs HTTP)
 */
async function resolveLogoDataUri(rawLogo?: string | null): Promise<string | null> {
  if (!rawLogo || typeof rawLogo !== 'string') return null;
  const clean = rawLogo.trim();
  if (clean.startsWith('data:image/')) return clean;

  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    try {
      const response = await fetch(clean);
      if (response.ok) {
        const arrayBuf = await response.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        const contentType = response.headers.get('content-type') || 'image/png';
        return `data:${contentType};base64,${buf.toString('base64')}`;
      }
    } catch (e) {
      console.warn('⚠️ No se pudo descargar el logo de la tienda desde URL:', e);
    }
  }

  let relPath = clean;
  if (relPath.includes('/uploads/')) {
    relPath = relPath.substring(relPath.indexOf('/uploads/'));
  }
  if (relPath.startsWith('/uploads/') || relPath.startsWith('uploads/')) {
    relPath = relPath.replace(/^\/?uploads\//, 'uploads/');
    try {
      const localPath = path.join(process.cwd(), relPath);
      if (fs.existsSync(localPath)) {
        const fileBuf = fs.readFileSync(localPath);
        const ext = path.extname(localPath).substring(1).toLowerCase() || 'png';
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext === 'webp' ? 'webp' : 'png';
        return `data:image/${mime};base64,${fileBuf.toString('base64')}`;
      }
    } catch (e) {
      console.warn('⚠️ No se pudo leer el archivo de logo desde disco:', e);
    }
  }
  return null;
}

/**
 * Dibuja el logo oficial predeterminado de la tienda Comerxia si no hay una imagen externa configurada
 */
function drawDefaultComerxiaLogo(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(x, y, w, h, 3.5, 3.5, 'F');

  doc.setFillColor(234, 179, 8);
  doc.roundedRect(x + 5.5, y + 8, 15, 10, 2, 2, 'F');

  doc.setDrawColor(234, 179, 8);
  doc.setLineWidth(1.2);
  doc.circle(x + 13, y + 7, 3, 'S');

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
}

/**
 * Genera el documento RIDE de Factura Electrónica SRI en PDF A4 de forma 100% idéntica
 * a la plantilla oficial del SRI Ecuador, usando la configuración de tienda obtenida del usuario.
 */
export async function generateSriRidePdfBuffer(params: SriRidePdfParams): Promise<Buffer> {
  const { invoice, sriConfig, storeConfig } = params;
  const xmlContent = invoice.xmlFirmado || invoice.xmlGenerado || '';

  const matchTag = (tag: string) => {
    const regex = new RegExp(`<${tag}>([^<]+)<\/${tag}>`);
    return xmlContent.match(regex)?.[1] || '';
  };

  const razonSocial = matchTag('razonSocial') || sriConfig?.razonSocial || storeConfig?.storeName || 'COMERXIA E-COMMERCE S.A.';
  const nombreComercial = matchTag('nombreComercial') || sriConfig?.nombreComercial || storeConfig?.storeName || 'COMERXIA ECUADOR';
  const ruc = matchTag('ruc') || sriConfig?.ruc || '1700000000001';
  const dirMatriz = matchTag('dirMatriz') || sriConfig?.dirMatriz || 'Quito, Ecuador';
  const dirSucursal = matchTag('dirEstablecimiento') || dirMatriz;
  const obligadoContabilidad = matchTag('obligadoContabilidad') || sriConfig?.obligadoContabilidad || 'NO';
  const contribuyenteEspecial = matchTag('contribuyenteEspecial') || sriConfig?.contribuyenteEspecial || '';
  const contribuyenteRimpe = matchTag('contribuyenteRimpe') || '';

  const fechaEmision = matchTag('fechaEmision') || (invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString('es-EC') : new Date().toLocaleDateString('es-EC'));
  const razonSocialComprador = matchTag('razonSocialComprador') || invoice.customerName || 'CONSUMIDOR FINAL';
  const identificacionComprador = matchTag('identificacionComprador') || invoice.customerCiRuc || '9999999999999';
  const direccionComprador = matchTag('direccionComprador') || 
    (xmlContent.match(/<campoAdicional nombre="Direccion">([^<]+)<\/campoAdicional>/)?.[1]) || 
    (invoice as any).customerAddress || 'N/A';
  const correoComprador = matchTag('correoComprador') || 
    (xmlContent.match(/<campoAdicional nombre="Email">([^<]+)<\/campoAdicional>/)?.[1]) || 
    (invoice as any).customerEmail || 'N/A';

  const numSecuencial = invoice.secuencial ? String(invoice.secuencial).padStart(9, '0') : '000000001';
  const estabStr = (matchTag('estab') || (invoice as any).estab || sriConfig?.estab || '001').padStart(3, '0');
  const ptoEmiStr = (matchTag('ptoEmi') || (invoice as any).ptoEmi || sriConfig?.ptoEmi || '001').padStart(3, '0');
  const numeroAutorizacion = invoice.numeroAutorizacion || invoice.claveAcceso || matchTag('claveAcceso') || '0000000000000000000000000000000000000000000000000';
  const claveAcceso = invoice.claveAcceso || matchTag('claveAcceso') || numeroAutorizacion;
  const fechaAutorizacion = invoice.fechaAutorizacion ? new Date(invoice.fechaAutorizacion).toLocaleString('es-EC') : (invoice.createdAt ? new Date(invoice.createdAt).toLocaleString('es-EC') : new Date().toLocaleString('es-EC'));
  const ambienteText = invoice.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS';

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
    detallesList.push({
      codigoPrincipal: getSub('codigoPrincipal') || 'PROD',
      codigoAuxiliar: getSub('codigoAuxiliar') || '',
      cantidad: getSub('cantidad') || '1.00',
      descripcion: getSub('descripcion') || 'Producto',
      detalleAdicional: '',
      precioUnitario: getSub('precioUnitario') || '0.00',
      subsidio: '0.00',
      precioSinSubsidio: '0.00',
      descuento: getSub('descuento') || '0.00',
      precioTotalSinImpuesto: getSub('precioTotalSinImpuesto') || '0.00',
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

  let subtotal15 = 0;
  let subtotal12 = 0;
  let subtotal0 = 0;
  let subtotalNoObjeto = 0;
  let subtotalExento = 0;
  let iva15 = 0;
  let iva12 = 0;

  if (totalImpuestosList.length > 0) {
    totalImpuestosList.forEach((imp) => {
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

  if (detallesList.length === 0) {
    detallesList.push({
      codigoPrincipal: '001001',
      codigoAuxiliar: '',
      cantidad: '1.00',
      descripcion: 'Venta de Mercadería / Servicio Comercial',
      detalleAdicional: '',
      precioUnitario: totalSinImpuestosVal.toFixed(2),
      subsidio: '0.00',
      precioSinSubsidio: '0.00',
      descuento: '0.00',
      precioTotalSinImpuesto: totalSinImpuestosVal.toFixed(2),
    });
  }

  // Initialize jsPDF document (A4 portrait)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);

  // Margins & Dimensions
  const startX = 6;
  const contentWidth = 198; // 210mm - 12mm margins

  // 1. TOP LEFT: LOGO DE LA TIENDA DESDE CONFIGURACIÓN Y CUADRO EMISOR
  const leftW = 96;
  const rightX = 106;
  const rightW = 98;

  const rawLogo = storeConfig?.logoDesktopUrl || storeConfig?.logoUrl || (storeConfig as any)?.logo_desktop_url || (storeConfig as any)?.logo_url;
  const logoDataUri = await resolveLogoDataUri(rawLogo);

  if (logoDataUri) {
    try {
      const isJpeg = logoDataUri.includes('data:image/jpeg') || logoDataUri.includes('data:image/jpg');
      doc.addImage(logoDataUri, isJpeg ? 'JPEG' : 'PNG', startX, 6, 26, 22, undefined, 'FAST');
    } catch {
      drawDefaultComerxiaLogo(doc, startX, 6, 26, 22);
    }
  } else {
    drawDefaultComerxiaLogo(doc, startX, 6, 26, 22);
  }

  // Emisor Box
  const emisorY = 31;
  const emisorH = 49;
  doc.roundedRect(startX, emisorY, leftW, emisorH, 2.5, 2.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(razonSocial.toUpperCase(), startX + 3, emisorY + 6, { maxWidth: leftW - 6 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('Dirección Matriz:', startX + 3, emisorY + 14);
  doc.setFont('helvetica', 'normal');
  const matLines = doc.splitTextToSize(dirMatriz, leftW - 28);
  doc.text(matLines, startX + 27, emisorY + 14);

  const matHeight = Math.max(4.5, matLines.length * 3.2);
  const sucY = emisorY + 14 + matHeight + 1;

  doc.setFont('helvetica', 'bold');
  doc.text('Dirección Sucursal:', startX + 3, sucY);
  doc.setFont('helvetica', 'normal');
  const sucLines = doc.splitTextToSize(dirSucursal, leftW - 29);
  doc.text(sucLines, startX + 28, sucY);

  const sucHeight = Math.max(4.5, sucLines.length * 3.2);
  let curEmY = sucY + sucHeight + 2;

  if (contribuyenteRimpe) {
    doc.setFont('helvetica', 'bold');
    doc.text('Régimen Tributario:', startX + 3, curEmY);
    doc.setFont('helvetica', 'normal');
    doc.text(contribuyenteRimpe, startX + 32, curEmY);
    curEmY += 4.5;
  }
  if (contribuyenteEspecial) {
    doc.setFont('helvetica', 'bold');
    doc.text('Contribuyente Especial Nro:', startX + 3, curEmY);
    doc.setFont('helvetica', 'normal');
    doc.text(contribuyenteEspecial, startX + 42, curEmY);
    curEmY += 4.5;
  }

  doc.setFont('helvetica', 'bold');
  doc.text('OBLIGADO A LLEVAR CONTABILIDAD', startX + 3, emisorY + emisorH - 4);
  doc.setFont('helvetica', 'normal');
  doc.text(obligadoContabilidad, startX + leftW - 4, emisorY + emisorH - 4, { align: 'right' });

  // 2. TOP RIGHT: SRI COMPROBANTE BOX
  const sriBoxY = 6;
  const sriBoxH = 74;
  doc.roundedRect(rightX, sriBoxY, rightW, sriBoxH, 2.5, 2.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(`R.U.C.:     ${ruc}`, rightX + 4, sriBoxY + 7);

  doc.setFontSize(12);
  doc.text('FACTURA', rightX + 4, sriBoxY + 14);

  doc.setFontSize(8.5);
  doc.text(`No.    ${estabStr}-${ptoEmiStr}-${numSecuencial}`, rightX + 4, sriBoxY + 21);

  doc.setFontSize(7.5);
  doc.text('NÚMERO DE AUTORIZACIÓN', rightX + 4, sriBoxY + 27);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(numeroAutorizacion, rightX + 4, sriBoxY + 31.5, { maxWidth: rightW - 8 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('FECHA Y HORA DE AUTORIZACIÓN:', rightX + 4, sriBoxY + 38);
  doc.setFont('helvetica', 'normal');
  doc.text(fechaAutorizacion, rightX + 54, sriBoxY + 38);

  doc.setFont('helvetica', 'bold');
  doc.text('AMBIENTE:', rightX + 4, sriBoxY + 44);
  doc.setFont('helvetica', 'normal');
  doc.text(ambienteText, rightX + 30, sriBoxY + 44);

  doc.setFont('helvetica', 'bold');
  doc.text('EMISIÓN:', rightX + 4, sriBoxY + 50);
  doc.setFont('helvetica', 'normal');
  doc.text('NORMAL', rightX + 30, sriBoxY + 50);

  doc.setFont('helvetica', 'bold');
  doc.text('CLAVE DE ACCESO', rightX + 4, sriBoxY + 55);

  // Barcode Code128 Vector Graphics
  drawCode128Barcode(doc, claveAcceso, rightX + 4, sriBoxY + 57, rightW - 8, 9);

  doc.setFont('courier', 'bold');
  doc.setFontSize(6.5);
  doc.text(claveAcceso, rightX + rightW / 2, sriBoxY + 71, { align: 'center' });

  // 3. BUYER INFORMATION BOX (SIN DESBORDAMIENTO)
  const buyerY = 83;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  const nameLines = doc.splitTextToSize(razonSocialComprador, 140);
  const dirLinesComprador = doc.splitTextToSize(direccionComprador, 175);

  const nameHeight = nameLines.length * 3.5;
  const dirHeight = dirLinesComprador.length * 3.5;
  const buyerH = Math.max(26, 18 + nameHeight + dirHeight);

  doc.roundedRect(startX, buyerY, contentWidth, buyerH, 2.5, 2.5, 'S');

  let curBuyerY = buyerY + 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Razón Social / Nombres y Apellidos:', startX + 3, curBuyerY);
  doc.setFont('helvetica', 'normal');
  doc.text(nameLines, startX + 52, curBuyerY);

  curBuyerY += nameHeight + 2;

  doc.setFont('helvetica', 'bold');
  doc.text('Identificación', startX + 3, curBuyerY);
  doc.setFont('helvetica', 'normal');
  doc.text(identificacionComprador, startX + 28, curBuyerY);

  doc.setFont('helvetica', 'bold');
  doc.text('Placa / Matrícula:', startX + 90, curBuyerY);
  doc.text('Guía', startX + 135, curBuyerY);

  curBuyerY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Fecha', startX + 3, curBuyerY);
  doc.setFont('helvetica', 'normal');
  doc.text(fechaEmision, startX + 28, curBuyerY);

  curBuyerY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Direccion:', startX + 3, curBuyerY);
  doc.setFont('helvetica', 'normal');
  doc.text(dirLinesComprador, startX + 18, curBuyerY);

  // 4. ITEMS TABLE (AJUSTE DINÁMICO DE ALTURA Y MULTILÍNEA EN ENCABEZADOS Y FILAS)
  let yPos = buyerY + buyerH + 4;
  const colWidths = [18, 16, 13, 51, 18, 17, 14, 21, 14, 16];
  const colX = [startX];
  for (let i = 0; i < colWidths.length - 1; i++) {
    colX.push(colX[i] + colWidths[i]);
  }

  const renderTableHeader = (currentY: number) => {
    const headers = [
      'Cod. Principal',
      'Cod. Auxiliar',
      'Cantidad',
      'Descripción',
      'Detalle Adicional',
      'Precio Unitario',
      'Subsidio',
      'Precio sin Subsidio',
      'Descuento',
      'Precio Total',
    ];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);

    // Dividir títulos largos en múltiples líneas para evitar desbordamiento lateral
    const headerLinesList = headers.map((h, idx) => 
      doc.splitTextToSize(h, colWidths[idx] - 1)
    );

    const maxHeaderLines = Math.max(...headerLinesList.map(lines => lines.length), 1);
    const headerH = Math.max(6, maxHeaderLines * 2.8 + 1.8);

    doc.rect(startX, currentY, contentWidth, headerH, 'S');

    headers.forEach((_, idx) => {
      if (idx > 0) {
        doc.line(colX[idx], currentY, colX[idx], currentY + headerH);
      }
      const lines = headerLinesList[idx];
      const startTextY = currentY + (headerH - (lines.length * 2.5)) / 2 + 2.0;
      doc.text(lines, colX[idx] + colWidths[idx] / 2, startTextY, { align: 'center' });
    });

    return currentY + headerH;
  };

  yPos = renderTableHeader(yPos);

  detallesList.forEach((it) => {
    doc.setFontSize(6.5);

    doc.setFont('courier', 'normal');
    const codPLines = doc.splitTextToSize(it.codigoPrincipal, colWidths[0] - 2);
    const codALines = doc.splitTextToSize(it.codigoAuxiliar, colWidths[1] - 2);

    doc.setFont('helvetica', 'normal');
    const descLinesItem = doc.splitTextToSize(it.descripcion, colWidths[3] - 3);
    const detLinesItem = doc.splitTextToSize(it.detalleAdicional || '', colWidths[4] - 2);

    const maxLineCount = Math.max(codPLines.length, codALines.length, descLinesItem.length, detLinesItem.length, 1);
    const rowH = Math.max(5.5, maxLineCount * 3.2 + 2);

    if (yPos + rowH > 275) {
      doc.addPage();
      yPos = renderTableHeader(10);
    }

    doc.rect(startX, yPos, contentWidth, rowH, 'S');
    for (let i = 1; i < colX.length; i++) {
      doc.line(colX[i], yPos, colX[i], yPos + rowH);
    }

    doc.setFont('courier', 'normal');
    doc.text(codPLines, colX[0] + colWidths[0] / 2, yPos + 3.8, { align: 'center' });
    doc.text(codALines, colX[1] + colWidths[1] / 2, yPos + 3.8, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.text(Number(it.cantidad || 1).toString(), colX[2] + colWidths[2] - 1.5, yPos + 3.8, { align: 'right' });
    doc.text(descLinesItem, colX[3] + 1.5, yPos + 3.8);
    if (detLinesItem.length > 0) {
      doc.text(detLinesItem, colX[4] + 1, yPos + 3.8);
    }

    doc.setFont('courier', 'normal');
    doc.text(Number(it.precioUnitario || 0).toFixed(2), colX[5] + colWidths[5] - 1.5, yPos + 3.8, { align: 'right' });
    doc.text(Number(it.subsidio || 0).toFixed(2), colX[6] + colWidths[6] - 1.5, yPos + 3.8, { align: 'right' });
    doc.text(Number(it.precioSinSubsidio || 0).toFixed(2), colX[7] + colWidths[7] - 1.5, yPos + 3.8, { align: 'right' });
    doc.text(Number(it.descuento || 0).toFixed(2), colX[8] + colWidths[8] - 1.5, yPos + 3.8, { align: 'right' });

    doc.setFont('courier', 'bold');
    doc.text(Number(it.precioTotalSinImpuesto || 0).toFixed(2), colX[9] + colWidths[9] - 1.5, yPos + 3.8, { align: 'right' });

    yPos += rowH;
  });

  yPos += 4;
  const bottomY = Math.max(yPos, 160);

  let footerBaseY = bottomY;
  if (footerBaseY + 50 > 280) {
    doc.addPage();
    footerBaseY = 10;
  }

  // 5. BOTTOM LEFT SECTION: INFO ADICIONAL & FORMA DE PAGO
  const infoW = 112;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const emailLines = doc.splitTextToSize(correoComprador, infoW - 20);
  const infoH = Math.max(18, 12 + emailLines.length * 3.5);

  doc.roundedRect(startX, footerBaseY, infoW, infoH, 2, 2, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Información Adicional', startX + infoW / 2, footerBaseY + 5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('Email:', startX + 3, footerBaseY + 11);
  doc.setFont('helvetica', 'normal');
  doc.text(emailLines, startX + 18, footerBaseY + 11);

  // Tabla Forma de pago
  const pagoY = footerBaseY + infoH + 4;
  const pagoColW = 82;

  doc.rect(startX, pagoY, infoW, 5, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('Forma de pago', startX + pagoColW / 2, pagoY + 3.8, { align: 'center' });
  doc.line(startX + pagoColW, pagoY, startX + pagoColW, pagoY + 5);
  doc.text('Valor', startX + pagoColW + (infoW - pagoColW) / 2, pagoY + 3.8, { align: 'center' });

  doc.rect(startX, pagoY + 5, infoW, 6, 'S');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('01 - SIN UTILIZACION DEL SISTEMA FINANCIERO', startX + 2, pagoY + 9, { maxWidth: pagoColW - 3 });
  doc.line(startX + pagoColW, pagoY + 5, startX + pagoColW, pagoY + 11);
  doc.setFont('courier', 'bold');
  doc.setFontSize(7.5);
  doc.text(importeTotalVal.toFixed(2), startX + infoW - 2, pagoY + 9, { align: 'right' });

  // 6. BOTTOM RIGHT SECTION: TOTALS TABLE (12 ROWS GRID)
  const totalsY = footerBaseY;
  const totalsWidth = 82;
  const totalsX = startX + contentWidth - totalsWidth;
  const labelColW = 54;
  const rowH = 4.2;

  const totalsRows = [
    { label: subtotal12 > 0 ? 'SUBTOTAL 12%' : 'SUBTOTAL 15%', value: (subtotal15 || subtotal12).toFixed(2) },
    { label: 'SUBTOTAL NO OBJETO DE IVA', value: subtotalNoObjeto.toFixed(2) },
    { label: 'SUBTOTAL EXENTO DE IVA', value: subtotalExento.toFixed(2) },
    { label: 'SUBTOTAL SIN IMPUESTOS', value: totalSinImpuestosVal.toFixed(2) },
    { label: 'TOTAL DESCUENTO', value: totalDescuentoVal.toFixed(2) },
    { label: 'ICE', value: '0.00' },
    { label: subtotal12 > 0 ? 'IVA 12%' : 'IVA 15%', value: (iva15 || iva12).toFixed(2) },
    { label: 'IRBPNR', value: '0.00' },
    { label: 'PROPINA', value: '0.00' },
    { label: 'VALOR TOTAL', value: importeTotalVal.toFixed(2), isBold: true },
    { label: 'VALOR TOTAL SIN SUBSIDIO', value: '0.00' },
    { label: 'AHORRO POR SUBSIDIO:\n(Incluye IVA cuando corresponda)', value: '0.00', isSubsidio: true },
  ];

  let curY = totalsY;

  totalsRows.forEach((row) => {
    const h = row.isSubsidio ? 6.5 : rowH;

    doc.rect(totalsX, curY, totalsWidth, h, 'S');
    doc.line(totalsX + labelColW, curY, totalsX + labelColW, curY + h);

    if (row.isBold) {
      doc.setFont('helvetica', 'bold');
    } else {
      doc.setFont('helvetica', 'bold');
    }

    if (row.isSubsidio) {
      doc.setFontSize(6);
      doc.text('AHORRO POR SUBSIDIO:', totalsX + 2, curY + 2.5);
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'normal');
      doc.text('(Incluye IVA cuando corresponda)', totalsX + 2, curY + 5.2);
    } else {
      doc.setFontSize(6.5);
      doc.text(row.label, totalsX + 2, curY + 3.1);
    }

    doc.setFont('courier', 'bold');
    doc.setFontSize(7.5);
    doc.text(row.value, totalsX + totalsWidth - 2, curY + (row.isSubsidio ? 4.2 : 3.1), { align: 'right' });

    curY += h;
  });

  // Output as PDF Buffer
  const pdfArrayBuffer = doc.output('arraybuffer');
  return Buffer.from(pdfArrayBuffer);
}

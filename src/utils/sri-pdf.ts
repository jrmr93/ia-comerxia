import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';
import { SriInvoiceRecord, SriConfig, StoreConfig } from '../types.ts';

export interface SriPdfParams {
  invoice: SriInvoiceRecord;
  sriConfig?: SriConfig | null;
  storeConfig?: StoreConfig | null;
}

/**
 * Generates an A4 PDF document (Buffer) for an SRI Electronic Invoice RIDE
 * matching the exact visual structure of media__1789434069573.png
 */
export async function generateSriRidePdfBuffer(params: SriPdfParams): Promise<Buffer> {
  const { invoice, sriConfig, storeConfig } = params;
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
  });

  const xmlContent = invoice.xmlFirmado || invoice.xmlGenerado || '';

  const matchTag = (tag: string) => {
    const regex = new RegExp(`<${tag}>([^<]+)<\/${tag}>`);
    return xmlContent.match(regex)?.[1] || '';
  };

  // Metadata extraction
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

  function cleanCustomerAddress(addr?: string | null): string {
    if (!addr) return '';
    const trimmed = addr.trim();
    if (
      !trimmed ||
      trimmed.toLowerCase().includes('retiro en local') ||
      trimmed.toLowerCase().includes('retiro local') ||
      trimmed.toLowerCase().includes('pickup')
    ) {
      return '';
    }
    return trimmed;
  }

  const rawXmlAddress = matchTag('direccionComprador') || (xmlContent.match(/<campoAdicional nombre="Direccion">([^<]+)<\/campoAdicional>/)?.[1]);
  let direccionComprador = cleanCustomerAddress(rawXmlAddress);

  if (!direccionComprador) {
    direccionComprador = cleanCustomerAddress((invoice as any).clientAddress) ||
                         cleanCustomerAddress((invoice as any).customerFiscalAddress) ||
                         cleanCustomerAddress((invoice as any).customerAddress) ||
                         'Quito, Ecuador';
  }

  const correoComprador = matchTag('correoComprador') ||
    (xmlContent.match(/<campoAdicional nombre="Email">([^<]+)<\/campoAdicional>/)?.[1]) ||
    (invoice as any).customerEmail || 'N/A';

  // Items extraction
  const detallesList: Array<{
    codigo: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    descuento: number;
    precioTotalSinImpuesto: number;
  }> = [];

  const detalleRegex = /<detalle>([\s\S]*?)<\/detalle>/g;
  let match;
  while ((match = detalleRegex.exec(xmlContent)) !== null) {
    const block = match[1];
    const getSub = (subTag: string) => block.match(new RegExp(`<${subTag}>([^<]+)<\/${subTag}>`))?.[1] || '';
    detallesList.push({
      codigo: getSub('codigoPrincipal') || 'PROD',
      descripcion: getSub('descripcion') || 'Producto',
      cantidad: Number(getSub('cantidad') || 1),
      precioUnitario: Number(getSub('precioUnitario') || 0),
      descuento: Number(getSub('descuento') || 0),
      precioTotalSinImpuesto: Number(getSub('precioTotalSinImpuesto') || 0),
    });
  }

  // Totals extraction
  const totalSinImpuestos = Number(matchTag('totalSinImpuestos') || invoice.totalAmount || 0);
  const totalDescuento = Number(matchTag('totalDescuento') || 0);
  const importeTotal = Number(matchTag('importeTotal') || invoice.totalAmount || 0);

  // Impuestos
  let subtotal15 = 0;
  let iva15 = 0;
  let subtotal0 = 0;

  const totalImpuestoRegex = /<totalImpuesto>([\s\S]*?)<\/totalImpuesto>/g;
  let impMatch;
  while ((impMatch = totalImpuestoRegex.exec(xmlContent)) !== null) {
    const block = impMatch[1];
    const getSub = (subTag: string) => block.match(new RegExp(`<${subTag}>([^<]+)<\/${subTag}>`))?.[1] || '0';
    const codigoPorcentaje = getSub('codigoPorcentaje');
    const base = Number(getSub('baseImponible') || 0);
    const val = Number(getSub('valor') || 0);

    if (codigoPorcentaje === '4' || codigoPorcentaje === '2') {
      subtotal15 += base;
      iva15 += val;
    } else if (codigoPorcentaje === '0') {
      subtotal0 += base;
    }
  }

  if (detallesList.length === 0) {
    detallesList.push({
      codigo: '001001',
      descripcion: 'Venta de Mercadería / Servicio Comercial',
      cantidad: 1,
      precioUnitario: totalSinImpuestos || importeTotal,
      descuento: 0,
      precioTotalSinImpuesto: totalSinImpuestos || importeTotal,
    });
    subtotal15 = totalSinImpuestos || importeTotal;
    iva15 = importeTotal - subtotal15;
  }

  // --- PDF PAGE LAYOUT (A4: 210 x 297 mm) ---
  const margin = 10;
  let y = 10;

  // 1. Store Logo
  let logoDataUri: string | null = null;
  const rawLogo = storeConfig?.logoDesktopUrl || storeConfig?.logoUrl;
  if (rawLogo) {
    let cleanRel = rawLogo.trim();
    if (cleanRel.startsWith('data:image/')) {
      logoDataUri = cleanRel;
    } else {
      if (cleanRel.includes('/uploads/')) {
        cleanRel = cleanRel.substring(cleanRel.indexOf('/uploads/'));
      }
      if (cleanRel.startsWith('/uploads/') || cleanRel.startsWith('uploads/')) {
        cleanRel = cleanRel.replace(/^\/?uploads\//, 'uploads/');
        try {
          const localPath = path.join(process.cwd(), cleanRel);
          if (fs.existsSync(localPath)) {
            const fileBuf = fs.readFileSync(localPath);
            const ext = path.extname(localPath).substring(1) || 'png';
            const mime = ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext;
            logoDataUri = `data:image/${mime};base64,${fileBuf.toString('base64')}`;
          }
        } catch (err) {
          console.warn('Could not load logo file for PDF:', err);
        }
      }
    }
  }

  // Header Left Box (Emisor)
  const leftBoxX = margin;
  const leftBoxW = 92;
  const leftBoxY = y;

  doc.setLineWidth(0.3);
  doc.rect(leftBoxX, leftBoxY, leftBoxW, 58, 'S');

  if (logoDataUri) {
    try {
      const imgFmt = logoDataUri.includes('data:image/jpeg') || logoDataUri.includes('data:image/jpg') ? 'JPEG' : 'PNG';
      doc.addImage(logoDataUri, imgFmt, leftBoxX + 3, leftBoxY + 3, 45, 14, undefined, 'FAST');
    } catch (e) {
      console.warn('Could not render image on jsPDF:', e);
    }
  }
  let curY = leftBoxY + (logoDataUri ? 22 : 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(razonSocial.substring(0, 42), leftBoxX + 3, curY);

  curY += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Dirección Matriz:', leftBoxX + 3, curY);
  doc.setFont('helvetica', 'normal');
  const dirLines = doc.splitTextToSize(dirMatriz, leftBoxW - 32);
  doc.text(dirLines, leftBoxX + 28, curY);

  curY += Math.max(5, dirLines.length * 3.5 + 1);
  doc.setFont('helvetica', 'bold');
  doc.text('Dirección Sucursal:', leftBoxX + 3, curY);
  doc.setFont('helvetica', 'normal');
  const dirSucLines = doc.splitTextToSize(dirMatriz, leftBoxW - 32);
  doc.text(dirSucLines, leftBoxX + 30, curY);

  curY += Math.max(5, dirSucLines.length * 3.5 + 1);
  if (contribuyenteRimpe) {
    doc.setFont('helvetica', 'bold');
    doc.text('Régimen:', leftBoxX + 3, curY);
    doc.setFont('helvetica', 'normal');
    doc.text(contribuyenteRimpe.substring(0, 30), leftBoxX + 20, curY);
    curY += 5;
  }

  doc.setFont('helvetica', 'bold');
  doc.text('OBLIGADO A LLEVAR CONTABILIDAD:', leftBoxX + 3, curY);
  doc.setFont('helvetica', 'normal');
  doc.text(obligadoContabilidad, leftBoxX + 78, curY);

  // Header Right Box (Comprobante SRI)
  const rightBoxX = 108;
  const rightBoxW = 92;
  const rightBoxY = leftBoxY;

  doc.rect(rightBoxX, rightBoxY, rightBoxW, 58, 'S');
  let rY = rightBoxY + 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`R.U.C.:   ${ruc}`, rightBoxX + 4, rY);

  rY += 6;
  doc.setFontSize(11);
  doc.text('FACTURA', rightBoxX + 4, rY);

  rY += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`No.    001-001-${invoice.secuencial.padStart(9, '0')}`, rightBoxX + 4, rY);

  rY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('NÚMERO DE AUTORIZACIÓN', rightBoxX + 4, rY);

  rY += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(invoice.numeroAutorizacion || invoice.claveAcceso, rightBoxX + 4, rY);

  rY += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('FECHA Y HORA DE AUTORIZACIÓN:', rightBoxX + 4, rY);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.fechaAutorizacion ? new Date(invoice.fechaAutorizacion).toLocaleString('es-EC') : fechaEmision, rightBoxX + 55, rY);

  rY += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.text('AMBIENTE:', rightBoxX + 4, rY);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS', rightBoxX + 35, rY);

  rY += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.text('EMISIÓN:', rightBoxX + 4, rY);
  doc.setFont('helvetica', 'normal');
  doc.text('NORMAL', rightBoxX + 35, rY);

  rY += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.text('CLAVE DE ACCESO', rightBoxX + 4, rY);

  rY += 3;
  // Simulated visual barcode lines
  doc.setFillColor(0, 0, 0);
  for (let i = 0; i < 75; i++) {
    const lineW = (i % 3 === 0) ? 0.6 : 0.3;
    doc.rect(rightBoxX + 5 + i * 1.1, rY, lineW, 6, 'F');
  }
  rY += 8;
  doc.setFont('courier', 'bold');
  doc.setFontSize(6.5);
  doc.text(invoice.claveAcceso, rightBoxX + 4, rY);

  y = leftBoxY + 62;

  // 2. Comprador Box
  const compW = 190;
  doc.rect(margin, y, compW, 18, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Razón Social / Nombres y Apellidos:', margin + 3, y + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.text(razonSocialComprador.substring(0, 48), margin + 50, y + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Identificación:', margin + 120, y + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.text(identificacionComprador, margin + 140, y + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Fecha:', margin + 3, y + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(fechaEmision, margin + 20, y + 9.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Placa / Matrícula:', margin + 65, y + 9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Guía:', margin + 120, y + 9.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Direccion:', margin + 3, y + 14.5);
  doc.setFont('helvetica', 'normal');
  doc.text(direccionComprador.substring(0, 85), margin + 20, y + 14.5);

  y += 21;

  // 3. 10-Column Items Table Header
  const colW = [18, 16, 14, 45, 20, 18, 14, 17, 14, 14];
  const colX = [margin];
  for (let i = 0; i < colW.length - 1; i++) {
    colX.push(colX[i] + colW[i]);
  }
  const tableW = 190;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.rect(margin, y, tableW, 6, 'S');

  const headers = ['Cod. Principal', 'Cod. Auxiliar', 'Cantidad', 'Descripción', 'Detalle Adic.', 'P. Unitario', 'Subsidio', 'P. sin Subsidio', 'Descuento', 'Precio Total'];
  headers.forEach((h, i) => {
    doc.rect(colX[i], y, colW[i], 6, 'S');
    doc.text(h, colX[i] + 1, y + 4);
  });

  y += 6;

  // Items Rows
  detallesList.forEach((item) => {
    doc.setFontSize(6.5);

    doc.rect(colX[0], y, colW[0], 5, 'S');
    doc.setFont('courier', 'normal');
    doc.text(item.codigo.substring(0, 10), colX[0] + 1, y + 3.5);

    doc.rect(colX[1], y, colW[1], 5, 'S'); // Aux
    doc.rect(colX[2], y, colW[2], 5, 'S');
    doc.setFont('helvetica', 'normal');
    doc.text(item.cantidad.toFixed(2), colX[2] + 1, y + 3.5);

    doc.rect(colX[3], y, colW[3], 5, 'S');
    doc.text(item.descripcion.substring(0, 32), colX[3] + 1, y + 3.5);

    doc.rect(colX[4], y, colW[4], 5, 'S'); // Detalle Adic
    doc.rect(colX[5], y, colW[5], 5, 'S');
    doc.text(item.precioUnitario.toFixed(2), colX[5] + colW[5] - 1, y + 3.5, { align: 'right' });

    doc.rect(colX[6], y, colW[6], 5, 'S');
    doc.text('0.00', colX[6] + colW[6] - 1, y + 3.5, { align: 'right' });

    doc.rect(colX[7], y, colW[7], 5, 'S');
    doc.text('0.00', colX[7] + colW[7] - 1, y + 3.5, { align: 'right' });

    doc.rect(colX[8], y, colW[8], 5, 'S');
    doc.text(item.descuento.toFixed(2), colX[8] + colW[8] - 1, y + 3.5, { align: 'right' });

    doc.rect(colX[9], y, colW[9], 5, 'S');
    doc.setFont('helvetica', 'bold');
    doc.text(item.precioTotalSinImpuesto.toFixed(2), colX[9] + colW[9] - 1, y + 3.5, { align: 'right' });

    y += 5;
  });

  y += 3;

  // 4. Totals and Info Adicional (2 Columns)
  const infoW = 105;
  const totX = margin + infoW + 5;
  const totW = 80;

  // Info Adicional Subtable
  doc.rect(margin, y, infoW, 5, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('Información Adicional', margin + 35, y + 3.5);

  doc.rect(margin, y + 5, infoW, 7, 'S');
  doc.setFontSize(7);
  doc.text('Email:', margin + 2, y + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(correoComprador.substring(0, 50), margin + 18, y + 9.5);

  // Forma de Pago Subtable
  const fpY = y + 16;
  doc.rect(margin, fpY, infoW, 5, 'S');
  doc.setFont('helvetica', 'bold');
  doc.text('Forma de pago', margin + 25, fpY + 3.5);
  doc.text('Valor', margin + 85, fpY + 3.5);

  doc.rect(margin, fpY + 5, infoW, 6, 'S');
  doc.setFont('helvetica', 'normal');
  doc.text('01 - SIN UTILIZACION DEL SISTEMA FINANCIERO', margin + 2, fpY + 9);
  doc.setFont('courier', 'bold');
  doc.text(importeTotal.toFixed(2), margin + infoW - 2, fpY + 9, { align: 'right' });

  // Right Totals Table (12 Rows)
  let totY = y;
  const totRowH = 4.2;

  const totalsData = [
    { label: 'SUBTOTAL 15%', value: subtotal15.toFixed(2) },
    { label: 'SUBTOTAL NO OBJETO DE IVA', value: '0.00' },
    { label: 'SUBTOTAL EXENTO DE IVA', value: '0.00' },
    { label: 'SUBTOTAL SIN IMPUESTOS', value: totalSinImpuestos.toFixed(2) },
    { label: 'TOTAL DESCUENTO', value: totalDescuento.toFixed(2) },
    { label: 'ICE', value: '0.00' },
    { label: 'IVA 15%', value: iva15.toFixed(2) },
    { label: 'IRBPNR', value: '0.00' },
    { label: 'PROPINA', value: '0.00' },
    { label: 'VALOR TOTAL', value: importeTotal.toFixed(2), bold: true },
    { label: 'VALOR TOTAL SIN SUBSIDIO', value: '0.00' },
    { label: 'AHORRO POR SUBSIDIO: (Incluye IVA cuando corresponda)', value: '0.00' },
  ];

  totalsData.forEach((row) => {
    doc.rect(totX, totY, totW, totRowH, 'S');
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(6.5);
    doc.text(row.label, totX + 2, totY + 3);
    doc.setFont('courier', row.bold ? 'bold' : 'normal');
    doc.text(row.value, totX + totW - 2, totY + 3, { align: 'right' });
    totY += totRowH;
  });

  // Output Buffer
  const arrayBuf = doc.output('arraybuffer');
  return Buffer.from(arrayBuf);
}

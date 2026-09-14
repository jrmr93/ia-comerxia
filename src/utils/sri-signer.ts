import forge from 'node-forge';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { SriFactura, SriDetalleFactura, SriPago } from '../types';

// Modulo 11 check digit calculation for SRI Ecuador
export function calcularDigitoVerificador(clave48: string): string {
  let suma = 0;
  let factor = 2;
  for (let i = clave48.length - 1; i >= 0; i--) {
    suma += parseInt(clave48[i], 10) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const residuo = suma % 11;
  let verificador = 11 - residuo;
  if (verificador === 11) {
    verificador = 0;
  } else if (verificador === 10) {
    verificador = 1;
  }
  return verificador.toString();
}

// Generates the 49-digit SRI access key
export function generarClaveAcceso(params: {
  fechaEmision: string; // YYYY-MM-DD
  tipoComprobante: string; // '01' = Factura
  ruc: string;
  ambiente: '1' | '2'; // '1' = Pruebas, '2' = Producción
  estab: string; // '001'
  ptoEmi: string; // '001'
  secuencial: string; // '000000001'
  codigoNumerico: string; // '12345678'
  tipoEmision: string; // '1' = Normal
}): string {
  // Convert date YYYY-MM-DD to DDMMYYYY
  const parts = params.fechaEmision.split('-');
  const fechaFormatted = `${parts[2]}${parts[1]}${parts[0]}`;

  const ruc13 = params.ruc.padEnd(13, '0').substring(0, 13);
  const estab3 = params.estab.padStart(3, '0').substring(0, 3);
  const ptoEmi3 = params.ptoEmi.padStart(3, '0').substring(0, 3);
  const sec9 = params.secuencial.padStart(9, '0').substring(0, 9);
  const codNum8 = params.codigoNumerico.padStart(8, '0').substring(0, 8);

  const base = `${fechaFormatted}${params.tipoComprobante}${ruc13}${params.ambiente}${estab3}${ptoEmi3}${sec9}${codNum8}${params.tipoEmision}`;
  const verificador = calcularDigitoVerificador(base);
  return `${base}${verificador}`;
}

function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// Generates raw SRI XML for Factura (v1.1.0)
export function generarFacturaXml(factura: SriFactura, claveAcceso: string, ambiente: '1' | '2'): string {
  const emisor = factura.emisor;
  const comprador = factura.comprador;

  // Formatting date for XML (DD/MM/YYYY)
  const parts = factura.fechaEmision.split('-');
  const fechaEmisionFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;

  // Calculate totals
  let totalSinImpuestos = 0;
  let totalDescuento = 0;
  let subtotal15 = 0; // Tarifa 15%
  let subtotal5 = 0;  // Tarifa 5%
  let subtotal0 = 0;  // Tarifa 0%
  let subtotalNoObjeto = 0;
  let subtotalExento = 0;

  factura.detalles.forEach((det) => {
    const subtotalItem = Number((det.cantidad * det.precioUnitario).toFixed(2));
    const descItem = Number(det.descuento.toFixed(2));
    const finalSubtotal = Number((subtotalItem - descItem).toFixed(2));

    totalSinImpuestos += finalSubtotal;
    totalDescuento += descItem;

    if (det.tarifaIva === '15') {
      subtotal15 += finalSubtotal;
    } else if (det.tarifaIva === '5') {
      subtotal5 += finalSubtotal;
    } else if (det.tarifaIva === '0') {
      subtotal0 += finalSubtotal;
    } else if (det.tarifaIva === 'NoObjeto') {
      subtotalNoObjeto += finalSubtotal;
    } else if (det.tarifaIva === 'Exento') {
      subtotalExento += finalSubtotal;
    }
  });

  const valorIva15 = Number((subtotal15 * 0.15).toFixed(2));
  const valorIva5 = Number((subtotal5 * 0.05).toFixed(2));
  const importeTotal = Number((totalSinImpuestos + valorIva15 + valorIva5).toFixed(2));

  // Build XML blocks
  let totalImpuestosXml = '';
  if (subtotal15 > 0) {
    totalImpuestosXml += `
            <totalImpuesto>
                <codigo>2</codigo>
                <codigoPorcentaje>4</codigoPorcentaje>
                <baseImponible>${subtotal15.toFixed(2)}</baseImponible>
                <valor>${valorIva15.toFixed(2)}</valor>
            </totalImpuesto>`;
  }
  if (subtotal5 > 0) {
    totalImpuestosXml += `
            <totalImpuesto>
                <codigo>2</codigo>
                <codigoPorcentaje>5</codigoPorcentaje>
                <baseImponible>${subtotal5.toFixed(2)}</baseImponible>
                <valor>${valorIva5.toFixed(2)}</valor>
            </totalImpuesto>`;
  }
  if (subtotal0 > 0) {
    totalImpuestosXml += `
            <totalImpuesto>
                <codigo>2</codigo>
                <codigoPorcentaje>0</codigoPorcentaje>
                <baseImponible>${subtotal0.toFixed(2)}</baseImponible>
                <valor>0.00</valor>
            </totalImpuesto>`;
  }
  if (subtotalNoObjeto > 0) {
    totalImpuestosXml += `
            <totalImpuesto>
                <codigo>2</codigo>
                <codigoPorcentaje>6</codigoPorcentaje>
                <baseImponible>${subtotalNoObjeto.toFixed(2)}</baseImponible>
                <valor>0.00</valor>
            </totalImpuesto>`;
  }
  if (subtotalExento > 0) {
    totalImpuestosXml += `
            <totalImpuesto>
                <codigo>2</codigo>
                <codigoPorcentaje>7</codigoPorcentaje>
                <baseImponible>${subtotalExento.toFixed(2)}</baseImponible>
                <valor>0.00</valor>
            </totalImpuesto>`;
  }

  // Payments block
  let pagosXml = '';
  factura.pagos.forEach((pago) => {
    pagosXml += `
            <pago>
                <formaPago>${pago.formaPago}</formaPago>
                <total>${pago.total.toFixed(2)}</total>
                ${pago.plazo !== undefined ? `<plazo>${pago.plazo}</plazo>` : ''}
                ${pago.unidadTiempo !== undefined ? `<unidadTiempo>${pago.unidadTiempo}</unidadTiempo>` : ''}
            </pago>`;
  });

  // Details block
  let detallesXml = '';
  factura.detalles.forEach((det) => {
    const subtotalItem = Number((det.cantidad * det.precioUnitario).toFixed(2));
    const finalSubtotal = Number((subtotalItem - det.descuento).toFixed(2));
    
    let codigoPorcentaje = '0';
    let tarifaIvaValor = 0;
    if (det.tarifaIva === '15') {
      codigoPorcentaje = '4';
      tarifaIvaValor = 15;
    } else if (det.tarifaIva === '5') {
      codigoPorcentaje = '5';
      tarifaIvaValor = 5;
    } else if (det.tarifaIva === '0') {
      codigoPorcentaje = '0';
      tarifaIvaValor = 0;
    } else if (det.tarifaIva === 'NoObjeto') {
      codigoPorcentaje = '6';
      tarifaIvaValor = 0;
    } else if (det.tarifaIva === 'Exento') {
      codigoPorcentaje = '7';
      tarifaIvaValor = 0;
    }

    const valorIvaItem = Number((finalSubtotal * (tarifaIvaValor / 100)).toFixed(2));

    const cantidadStr = det.cantidad % 1 === 0 ? det.cantidad.toString() : det.cantidad.toFixed(2);
    const precioUnitarioStr = det.precioUnitario % 1 === 0 || (det.precioUnitario * 100) % 1 === 0 ? det.precioUnitario.toFixed(2) : det.precioUnitario.toFixed(6);
    const descuentoStr = det.descuento === 0 ? '0' : det.descuento.toFixed(2);

    detallesXml += `
        <detalle>
            <codigoPrincipal>${escapeXml(det.codigoPrincipal)}</codigoPrincipal>
            <descripcion>${escapeXml(det.descripcion)}</descripcion>
            <cantidad>${cantidadStr}</cantidad>
            <precioUnitario>${precioUnitarioStr}</precioUnitario>
            <descuento>${descuentoStr}</descuento>
            <precioTotalSinImpuesto>${finalSubtotal.toFixed(2)}</precioTotalSinImpuesto>
            <impuestos>
                <impuesto>
                    <codigo>2</codigo>
                    <codigoPorcentaje>${codigoPorcentaje}</codigoPorcentaje>
                    <tarifa>${tarifaIvaValor.toFixed(1)}</tarifa>
                    <baseImponible>${finalSubtotal.toFixed(2)}</baseImponible>
                    <valor>${valorIvaItem.toFixed(2)}</valor>
                </impuesto>
            </impuestos>
        </detalle>`;
  });

  // Special regimes
  let especialesXml = '';
  if (emisor.regimenRimpe && emisor.regimenRimpe !== 'NO') {
    let regimenTexto = '';
    if (emisor.regimenRimpe === 'CONTRIBUYENTE_RIMPE') {
      regimenTexto = 'CONTRIBUYENTE RÉGIMEN RIMPE';
    } else if (emisor.regimenRimpe === 'EMPRENDEDOR_RIMPE') {
      regimenTexto = 'CONTRIBUYENTE RÉGIMEN RIMPE EMPRENDEDOR';
    } else if (emisor.regimenRimpe === 'NEGOCIO_POPULAR_RIMPE') {
      regimenTexto = 'CONTRIBUYENTE RÉGIMEN RIMPE NEGOCIO POPULAR';
    }
    especialesXml += `\n        <contribuyenteRimpe>${regimenTexto}</contribuyenteRimpe>`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="1.1.0">
    <infoTributaria>
        <ambiente>${ambiente}</ambiente>
        <tipoEmision>1</tipoEmision>
        <razonSocial>${escapeXml(emisor.razonSocial)}</razonSocial>
        <ruc>${emisor.ruc}</ruc>
        <claveAcceso>${claveAcceso}</claveAcceso>
        <codDoc>01</codDoc>
        <estab>${emisor.estab}</estab>
        <ptoEmi>${emisor.ptoEmi}</ptoEmi>
        <secuencial>${emisor.secuencial}</secuencial>
        <dirMatriz>${escapeXml(emisor.dirMatriz)}</dirMatriz>${especialesXml}
    </infoTributaria>
    <infoFactura>
        <fechaEmision>${fechaEmisionFormatted}</fechaEmision>
        <dirEstablecimiento>${escapeXml(emisor.dirMatriz)}</dirEstablecimiento>
        ${emisor.contribuyenteEspecial ? `<contribuyenteEspecial>${escapeXml(emisor.contribuyenteEspecial)}</contribuyenteEspecial>` : ''}
        <obligadoContabilidad>${emisor.obligadoContabilidad}</obligadoContabilidad>
        <tipoIdentificacionComprador>${comprador.tipoIdentificacionComprador}</tipoIdentificacionComprador>
        <razonSocialComprador>${escapeXml(comprador.razonSocialComprador)}</razonSocialComprador>
        <identificacionComprador>${comprador.identificacionComprador}</identificacionComprador>
        <totalSinImpuestos>${totalSinImpuestos.toFixed(2)}</totalSinImpuestos>
        <totalDescuento>${totalDescuento.toFixed(2)}</totalDescuento>
        <totalConImpuestos>${totalImpuestosXml}
        </totalConImpuestos>
        <propina>0</propina>
        <importeTotal>${importeTotal.toFixed(2)}</importeTotal>
        <moneda>DOLAR</moneda>
        <pagos>${pagosXml}
        </pagos>
    </infoFactura>
    <detalles>${detallesXml}
    </detalles>
    <infoAdicional>
        <campoAdicional nombre="Email">${escapeXml(comprador.correoComprador || 'ventas@comerxia.com')}</campoAdicional>
        ${comprador.direccionComprador ? `<campoAdicional nombre="Direccion">${escapeXml(comprador.direccionComprador)}</campoAdicional>` : ''}
    </infoAdicional>
</factura>`;

  return xml.replace(/\n\s*\n/g, '\n').trim();
}

// Signs XML with XAdES-BES using digital certificate .p12
export function firmarFacturaXml(
  xmlRaw: string,
  p12Buffer: Buffer,
  password: string
): string {
  try {
    let cert: any = null;
    let privateKey: any = null;

    // 1. Try OpenSSL CLI first if available on host
    try {
      const rand = crypto.randomBytes(8).toString('hex');
      const p12Path = path.join(process.cwd(), `cert-${rand}.p12`);
      const keyPath = path.join(process.cwd(), `key-${rand}.pem`);
      const certPath = path.join(process.cwd(), `cert-${rand}.pem`);

      fs.writeFileSync(p12Path, p12Buffer);

      try {
        const env = { ...process.env, PASS: password };
        try {
          execSync(`openssl pkcs12 -in "${p12Path}" -nocerts -out "${keyPath}" -nodes -passin env:PASS`, { env, stdio: 'ignore' });
          execSync(`openssl pkcs12 -in "${p12Path}" -clcerts -nokeys -out "${certPath}" -passin env:PASS`, { env, stdio: 'ignore' });
        } catch (stdError) {
          execSync(`openssl pkcs12 -in "${p12Path}" -nocerts -out "${keyPath}" -nodes -passin env:PASS -legacy -provider default`, { env, stdio: 'ignore' });
          execSync(`openssl pkcs12 -in "${p12Path}" -clcerts -nokeys -out "${certPath}" -passin env:PASS -legacy -provider default`, { env, stdio: 'ignore' });
        }

        const privateKeyPem = fs.readFileSync(keyPath, 'utf8');
        const certPem = fs.readFileSync(certPath, 'utf8');

        privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
        cert = forge.pki.certificateFromPem(certPem);
      } finally {
        if (fs.existsSync(p12Path)) fs.unlinkSync(p12Path);
        if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
        if (fs.existsSync(certPath)) fs.unlinkSync(certPath);
      }
    } catch (opensslError) {
      // Fallback to pure node-forge parsing
      const p12Der = p12Buffer.toString('binary');
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

      let certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      let keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      if (!keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]) {
        keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
      }

      const certBag = certBags[forge.pki.oids.certBag]?.[0];
      cert = certBag?.cert;

      const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] || keyBags[forge.pki.oids.keyBag]?.[0];
      privateKey = keyBag?.key;
    }

    if (!cert || !privateKey) {
      throw new Error('No se pudo extraer el certificado o la clave privada del archivo .p12');
    }

    // 2. Base64 certificate
    const certDerBin = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const certBase64 = forge.util.encode64(certDerBin);

    let certSerial = '';
    try {
      const hexSerial = cert.serialNumber.replace(/:/g, '');
      certSerial = BigInt('0x' + hexSerial).toString(10);
    } catch (e) {
      certSerial = cert.serialNumber;
    }

    const issuerAttributes = cert.issuer.attributes.map((attr: any) => {
      const name = (attr.shortName || attr.name || '').toUpperCase();
      return `${name}=${attr.value}`;
    }).reverse().join(',');

    const sha256 = (data: string): string => {
      const shasum = crypto.createHash('sha256');
      shasum.update(data, 'utf8');
      return shasum.digest('base64');
    };

    const sha256Bytes = (bytes: string): string => {
      const shasum = crypto.createHash('sha256');
      shasum.update(Buffer.from(bytes, 'binary'));
      return shasum.digest('base64');
    };

    const xmlMinified = xmlRaw.replace(/>\s+</g, '><').trim();
    const documentXmlClean = xmlMinified.replace(/<\?xml.*\?>/g, '').trim();
    const documentDigest = sha256(documentXmlClean);

    const guid = crypto.randomUUID ? crypto.randomUUID() : `b699718a-c162-4bec-8c52-${Math.floor(Math.random() * 1000000000)}`;
    const sigId = `xmldsig-${guid}`;
    const ref0Id = `${sigId}-ref0`;
    const signedPropertiesId = `${sigId}-signedprops`;
    const signatureValueId = `${sigId}-sigvalue`;

    let signingTime = new Date().toISOString();
    const fechaEmisionMatch = xmlMinified.match(/<fechaEmision>(\d{2})\/(\d{2})\/(\d{4})<\/fechaEmision>/);
    if (fechaEmisionMatch) {
      const day = fechaEmisionMatch[1];
      const month = fechaEmisionMatch[2];
      const year = fechaEmisionMatch[3];
      
      const now = new Date();
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const ecDate = new Date(utc + (3600000 * -5)); // Ecuador UTC-5
      
      const pad = (n: number) => n.toString().padStart(2, '0');
      const padMs = (n: number) => n.toString().padStart(3, '0');
      const timePart = `${pad(ecDate.getHours())}:${pad(ecDate.getMinutes())}:${pad(ecDate.getSeconds())}.${padMs(ecDate.getMilliseconds())}`;
      
      signingTime = `${year}-${month}-${day}T${timePart}-05:00`;
    }

    const certDigestValue = sha256Bytes(certDerBin);

    const signedPropertiesCanonical = `<xades:SignedProperties xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" xmlns:xades141="http://uri.etsi.org/01903/v1.4.1#" Id="${signedPropertiesId}"><xades:SignedSignatureProperties><xades:SigningTime>${signingTime}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod><ds:DigestValue>${certDigestValue}</ds:DigestValue></xades:CertDigest><xades:IssuerSerial><ds:X509IssuerName>${escapeXml(issuerAttributes)}</ds:X509IssuerName><ds:X509SerialNumber>${certSerial}</ds:X509SerialNumber></xades:IssuerSerial></xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties><xades:SignedDataObjectProperties><xades:DataObjectFormat ObjectReference="#${ref0Id}"><xades:Description>FIRMA DIGITAL SRI</xades:Description><xades:MimeType>text/xml</xades:MimeType><xades:Encoding>UTF-8</xades:Encoding></xades:DataObjectFormat></xades:SignedDataObjectProperties></xades:SignedProperties>`;
    const signedPropertiesDigest = sha256(signedPropertiesCanonical);

    const signedInfoCanonical = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></ds:SignatureMethod><ds:Reference Id="${ref0Id}" URI="#comprobante"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod><ds:DigestValue>${documentDigest}</ds:DigestValue></ds:Reference><ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${signedPropertiesId}"><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod><ds:DigestValue>${signedPropertiesDigest}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;

    const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signedInfoCanonical, 'utf8');
    const signatureValue = sign.sign(privateKeyPem, 'base64');

    const signedInfoXml = `<ds:SignedInfo><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><ds:Reference Id="${ref0Id}" URI="#comprobante"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${documentDigest}</ds:DigestValue></ds:Reference><ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${signedPropertiesId}"><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${signedPropertiesDigest}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;
    const keyInfoXml = `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certBase64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>`;
    
    const signedPropertiesXml = `<xades:SignedProperties Id="${signedPropertiesId}"><xades:SignedSignatureProperties><xades:SigningTime>${signingTime}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${certDigestValue}</ds:DigestValue></xades:CertDigest><xades:IssuerSerial><ds:X509IssuerName>${escapeXml(issuerAttributes)}</ds:X509IssuerName><ds:X509SerialNumber>${certSerial}</ds:X509SerialNumber></xades:IssuerSerial></xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties><xades:SignedDataObjectProperties><xades:DataObjectFormat ObjectReference="#${ref0Id}"><xades:Description>FIRMA DIGITAL SRI</xades:Description><xades:MimeType>text/xml</xades:MimeType><xades:Encoding>UTF-8</xades:Encoding></xades:DataObjectFormat></xades:SignedDataObjectProperties></xades:SignedProperties>`;
    const qualifyingPropertiesXml = `<xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" xmlns:xades141="http://uri.etsi.org/01903/v1.4.1#" Target="#${sigId}">${signedPropertiesXml}</xades:QualifyingProperties>`;

    const signatureXml = `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${sigId}">${signedInfoXml}<ds:SignatureValue Id="${signatureValueId}">${signatureValue}</ds:SignatureValue>${keyInfoXml}<ds:Object>${qualifyingPropertiesXml}</ds:Object></ds:Signature>`;

    const lastClosingIndex = xmlMinified.lastIndexOf('</factura>');
    if (lastClosingIndex === -1) {
      throw new Error('Formato XML de factura inválido (falta etiqueta </factura>)');
    }

    return xmlMinified.substring(0, lastClosingIndex) + signatureXml + xmlMinified.substring(lastClosingIndex);
  } catch (error: any) {
    console.error('Error durante la firma digital XAdES-BES:', error);
    throw new Error(`Firma fallida: ${error.message || error}`);
  }
}

// Generates simulated electronic signature for sandbox mode
export function generarFirmaSimuladaXml(xmlRaw: string): string {
  let signingTime = new Date().toISOString();
  const xmlMinified = xmlRaw.replace(/>\s+</g, '><').trim();
  const fechaEmisionMatch = xmlMinified.match(/<fechaEmision>(\d{2})\/(\d{2})\/(\d{4})<\/fechaEmision>/);
  if (fechaEmisionMatch) {
    const day = fechaEmisionMatch[1];
    const month = fechaEmisionMatch[2];
    const year = fechaEmisionMatch[3];
    
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const padMs = (n: number) => n.toString().padStart(3, '0');
    const timePart = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${padMs(now.getMilliseconds())}`;
    
    signingTime = `${year}-${month}-${day}T${timePart}-05:00`;
  }

  const guid = `b699718a-c162-4bec-8c52-simulated999`;
  const sigId = `xmldsig-${guid}`;
  const ref0Id = `${sigId}-ref0`;
  const signedPropertiesId = `${sigId}-signedprops`;
  const signatureValueId = `${sigId}-sigvalue`;

  const dummySignatureXml = `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${sigId}"><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><ds:Reference Id="${ref0Id}" URI="#comprobante"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>SIMULADO_DOCUMENT_DIGEST_HASH_256=</ds:DigestValue></ds:Reference><ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${signedPropertiesId}"><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>SIMULADO_SIGNEDPROP_DIGEST_HASH_256=</ds:DigestValue></ds:Reference></ds:SignedInfo><ds:SignatureValue Id="${signatureValueId}">SIMULADO_RSA_SIGNATURE_VALUE_BASE64_256==</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509Certificate>MOCK_BASE64_X509_CERTIFICATE_DATA_FOR_SRI_TESTING_PURPOSES_ONLY_9999999999999999999999999999999999999999999999999999999999999999999999==</ds:X509Certificate></ds:X509Data></ds:KeyInfo><ds:Object><xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" xmlns:xades141="http://uri.etsi.org/01903/v1.4.1#" Target="#${sigId}"><xades:SignedProperties Id="${signedPropertiesId}"><xades:SignedSignatureProperties><xades:SigningTime>${signingTime}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>SIMULADO_CERT_DIGEST_HASH_256=</ds:DigestValue></xades:CertDigest><xades:IssuerSerial><ds:X509IssuerName>CN=ENTIDAD SIMULADA DE PRUEBAS ECUADOR,OU=ENTIDAD DE CERTIFICACION DE INFORMACION,O=SRI SANDBOX S.A.,C=EC</ds:X509IssuerName><ds:X509SerialNumber>1234567890</ds:X509SerialNumber></xades:IssuerSerial></xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties><xades:SignedDataObjectProperties><xades:DataObjectFormat ObjectReference="#${ref0Id}"><xades:Description>FIRMA DIGITAL SRI</xades:Description><xades:MimeType>text/xml</xades:MimeType><xades:Encoding>UTF-8</xades:Encoding></xades:DataObjectFormat></xades:SignedDataObjectProperties></xades:SignedProperties></xades:QualifyingProperties></ds:Object></ds:Signature>`;

  const lastClosingIndex = xmlMinified.lastIndexOf('</factura>');
  if (lastClosingIndex === -1) {
    return xmlMinified;
  }
  return xmlMinified.substring(0, lastClosingIndex) + dummySignatureXml + xmlMinified.substring(lastClosingIndex);
}

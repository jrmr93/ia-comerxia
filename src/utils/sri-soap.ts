import https from 'https';

export interface SriMensaje {
  identificador: string;
  mensaje: string;
  informacionAdicional?: string;
  tipo: string;
}

export function postSoapRequest(urlStr: string, soapEnvelope: string): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const postData = Buffer.from(soapEnvelope, 'utf8');
      
      const options: https.RequestOptions = {
        method: 'POST',
        hostname: url.hostname,
        path: url.pathname + url.search,
        port: url.port || 443,
        servername: url.hostname,
        headers: {
          'Content-Type': 'text/xml;charset=UTF-8',
          'SOAPAction': '',
          'Connection': 'close',
          'Content-Length': String(postData.length),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        rejectUnauthorized: false, // Bypass self-signed/expired test certs from SRI
        minVersion: 'TLSv1.2',
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            ok: (res.statusCode || 200) >= 200 && (res.statusCode || 200) < 300,
            status: res.statusCode || 200,
            text: data
          });
        });
      });

      req.on('error', (err) => {
        console.error(`[HTTPS SOAP ERROR to ${url.hostname}]:`, err);
        reject(err);
      });

      req.write(postData);
      req.end();
    } catch (e) {
      console.error('[SOAP REQUEST INITIALIZATION ERROR]:', e);
      reject(e);
    }
  });
}

export function parseSriMensajes(xmlText: string): SriMensaje[] {
  const list: SriMensaje[] = [];
  if (!xmlText) return list;

  // Global scan for <mensaje> blocks
  const mensajeBlocks = xmlText.match(/<mensaje>([\s\S]*?)<\/mensaje>/g) || [];

  for (const block of mensajeBlocks) {
    const id = block.match(/<identificador>([^<]+)<\/identificador>/)?.[1] || '';
    const msg = block.match(/<mensaje>([^<]+)<\/mensaje>/)?.[1] || '';
    const info = block.match(/<informacionAdicional>([^<]+)<\/informacionAdicional>/)?.[1] || '';
    const tipo = block.match(/<tipo>([^<]+)<\/tipo>/)?.[1] || '';

    if (id || msg || info || tipo) {
      list.push({
        identificador: id,
        mensaje: msg.trim(),
        informacionAdicional: info.trim() || undefined,
        tipo: tipo || 'INFORMACION',
      });
    }
  }

  // Fallback: If no structured <mensaje> tags found but xml contains error/motivo/fault
  if (list.length === 0) {
    const faultMatch = xmlText.match(/<faultstring>([^<]+)<\/faultstring>/) || xmlText.match(/<message>([^<]+)<\/message>/);
    if (faultMatch) {
      list.push({
        identificador: 'ERROR_SOAP',
        mensaje: faultMatch[1].trim(),
        tipo: 'ERROR',
      });
    }
  }

  return list;
}

export const SRI_ENDPOINTS = {
  RECEPCION: {
    PRUEBAS: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline',
    PRODUCCION: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline',
  },
  AUTORIZACION: {
    PRUEBAS: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline',
    PRODUCCION: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline',
  },
};

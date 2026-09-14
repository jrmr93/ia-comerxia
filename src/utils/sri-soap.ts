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
  const mensajesMatch = xmlText.match(/<mensajes>([\s\S]*?)<\/mensajes>/);
  const content = mensajesMatch ? mensajesMatch[1] : xmlText;
  
  let pos = 0;
  while (true) {
    const startIdx = content.indexOf('<mensaje>', pos);
    if (startIdx === -1) break;
    
    const nextTag = content.substring(startIdx + 9, startIdx + 40).trim();
    if (nextTag.startsWith('<identificador>')) {
      const tipoEndIdx = content.indexOf('</tipo>', startIdx);
      if (tipoEndIdx === -1) {
        const endIdx = content.indexOf('</mensaje>', startIdx + 9);
        if (endIdx === -1) break;
        pos = endIdx + 10;
        continue;
      }
      const parentEndIdx = content.indexOf('</mensaje>', tipoEndIdx);
      if (parentEndIdx === -1) break;
      
      const block = content.substring(startIdx, parentEndIdx + 10);
      const id = block.match(/<identificador>([^<]+)<\/identificador>/)?.[1] || '';
      
      const innerMessageMatch = block.match(/<identificador>[\s\S]*?<mensaje>([\s\S]*?)<\/mensaje>/);
      const msg = innerMessageMatch ? innerMessageMatch[1] : '';
      
      const info = block.match(/<informacionAdicional>([^<]+)<\/informacionAdicional>/)?.[1] || '';
      const tipo = block.match(/<tipo>([^<]+)<\/tipo>/)?.[1] || 'ERROR';
      
      list.push({ identificador: id, mensaje: msg, informacionAdicional: info, tipo });
      pos = parentEndIdx + 10;
    } else {
      pos = startIdx + 9;
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

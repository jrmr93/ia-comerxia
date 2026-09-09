/**
 * High-reliability Image helper utilities for downloading, copying, and handling
 * product photos across desktop, mobile, and iframe sandboxes.
 */

export function getAbsoluteImageUrl(imageUrl: string): string {
  if (!imageUrl) return '';
  if (
    imageUrl.startsWith('http://') ||
    imageUrl.startsWith('https://') ||
    imageUrl.startsWith('data:') ||
    imageUrl.startsWith('blob:')
  ) {
    return imageUrl;
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const path = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  return `${origin}${path}`;
}

/**
 * Robust base64 dataURI to binary Blob converter.
 * Handles whitespace, newlines, raw base64, and variable MIME headers gracefully.
 */
export function dataURItoBlob(dataURI: string): Blob {
  try {
    if (!dataURI.includes(',')) {
      // Raw base64 string
      const byteCharacters = atob(dataURI.replace(/[\r\n\s]/g, ''));
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      return new Blob([byteArray], { type: 'image/jpeg' });
    }

    const [header, base64Data] = dataURI.split(',', 2);
    const mimeMatch = header.match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const cleanBase64 = base64Data.replace(/[\r\n\s]/g, '');
    const byteCharacters = atob(cleanBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  } catch (err) {
    console.warn('dataURItoBlob manual decode fallback:', err);
    // Fallback: create placeholder blob
    return new Blob([], { type: 'image/jpeg' });
  }
}

/**
 * Triggers native download of a Blob via synthetic anchor click.
 */
function triggerBlobDownload(blob: Blob, cleanFileName: string): boolean {
  try {
    if (blob.size === 0) return false;
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = blobUrl;
    link.download = cleanFileName;
    link.setAttribute('download', cleanFileName);
    
    document.body.appendChild(link);
    
    // Dispatch real click event
    const clickEvt = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(clickEvt);

    setTimeout(() => {
      try {
        if (link.parentNode) {
          document.body.removeChild(link);
        }
        URL.revokeObjectURL(blobUrl);
      } catch {}
    }, 1500);

    return true;
  } catch (err) {
    console.warn('triggerBlobDownload error:', err);
    return false;
  }
}

/**
 * Downloads image directly using the backend attachment streaming endpoint
 * which reliably bypasses browser iframe sandbox download restrictions.
 */
async function downloadViaServerEndpoint(
  imageSource: string,
  fileName: string
): Promise<boolean> {
  try {
    const res = await fetch('/api/download-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageSource, filename: fileName }),
    });

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }

    const blob = await res.blob();
    return triggerBlobDownload(blob, fileName);
  } catch (err) {
    console.warn('downloadViaServerEndpoint failed:', err);
    return false;
  }
}

/**
 * Downloads an image directly to the user's device.
 */
export async function downloadImage(
  imageUrl: string,
  fileName: string = 'producto.jpg'
): Promise<boolean> {
  if (!imageUrl || typeof imageUrl !== 'string') return false;

  const rawFileName = fileName.trim() || 'producto.jpg';
  const cleanFileName = rawFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const finalFileName = /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(cleanFileName)
    ? cleanFileName
    : `${cleanFileName}.jpg`;

  try {
    // 1. Data URLs (base64)
    if (imageUrl.startsWith('data:')) {
      const blob = dataURItoBlob(imageUrl);
      if (blob.size > 0) {
        const success = triggerBlobDownload(blob, finalFileName);
        if (success) return true;
      }
      // If direct blob download was blocked by iframe, use server streaming endpoint
      return await downloadViaServerEndpoint(imageUrl, finalFileName);
    }

    // 2. Blob URLs
    if (imageUrl.startsWith('blob:')) {
      try {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        const success = triggerBlobDownload(blob, finalFileName);
        if (success) return true;
      } catch {}
    }

    // 3. Remote HTTP/HTTPS URLs
    const fullUrl = getAbsoluteImageUrl(imageUrl);

    // Try server download endpoint first for remote URLs to avoid CORS restrictions
    const serverSuccess = await downloadViaServerEndpoint(fullUrl, finalFileName);
    if (serverSuccess) return true;

    // Fallback: direct browser fetch
    try {
      const res = await fetch(fullUrl, { mode: 'cors' });
      if (res.ok) {
        const blob = await res.blob();
        return triggerBlobDownload(blob, finalFileName);
      }
    } catch {}

    // Fallback: open in new tab if programmatic download is restricted
    try {
      const w = window.open(fullUrl, '_blank');
      return !!w;
    } catch {
      return false;
    }
  } catch (err) {
    console.error('Error downloading image:', err);
    return false;
  }
}

/**
 * Copies the image directly to the system clipboard (PNG format).
 * Allows users to press Ctrl+V in WhatsApp Web, Facebook Marketplace, Telegram, etc.
 */
export async function copyImageToClipboard(imageUrl: string): Promise<{ success: boolean; message: string }> {
  if (!imageUrl) return { success: false, message: 'URL de imagen vacía' };

  try {
    if (!navigator.clipboard || !window.ClipboardItem) {
      return { success: false, message: 'Tu navegador no soporta copia directa de imágenes al portapapeles' };
    }

    let imageBlob: Blob | null = null;

    if (imageUrl.startsWith('data:')) {
      imageBlob = dataURItoBlob(imageUrl);
    } else {
      const fullUrl = getAbsoluteImageUrl(imageUrl);
      try {
        const res = await fetch(fullUrl, { mode: 'cors' });
        if (res.ok) {
          imageBlob = await res.blob();
        }
      } catch {
        // Fallback: fetch via proxy
        const res = await fetch(`/api/download-image-proxy?url=${encodeURIComponent(fullUrl)}`);
        if (res.ok) {
          imageBlob = await res.blob();
        }
      }
    }

    if (!imageBlob || imageBlob.size === 0) {
      return { success: false, message: 'No se pudo obtener la imagen' };
    }

    // Clipboard API requires PNG format on most browsers (Chrome, Edge, Safari)
    const pngBlob = await convertBlobToPng(imageBlob);

    const item = new ClipboardItem({ 'image/png': pngBlob });
    await navigator.clipboard.write([item]);
    return { success: true, message: '¡Foto copiada! Ya puedes pegarla con Ctrl+V en WhatsApp o Facebook' };
  } catch (err: any) {
    console.warn('Clipboard copy error:', err);
    return { success: false, message: 'No se pudo copiar al portapapeles. Prueba a descargarla.' };
  }
}

/**
 * Helper to convert any image Blob to PNG Blob using Canvas for maximum Clipboard compatibility.
 */
function convertBlobToPng(sourceBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const url = URL.createObjectURL(sourceBlob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width || 500;
          canvas.height = img.naturalHeight || img.height || 500;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            return resolve(sourceBlob);
          }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            if (blob) resolve(blob);
            else resolve(sourceBlob);
          }, 'image/png');
        } catch (e) {
          URL.revokeObjectURL(url);
          resolve(sourceBlob);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(sourceBlob);
      };
      img.src = url;
    } catch (e) {
      resolve(sourceBlob);
    }
  });
}

/**
 * Downloads multiple images sequentially with a small non-blocking delay.
 */
export async function downloadMultipleImages(
  imageUrls: string[],
  baseFileName: string = 'producto',
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return 0;

  let downloadedCount = 0;
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    if (!url) continue;

    const fileNum = i + 1;
    const name = `${baseFileName}-foto-${fileNum}.jpg`;

    if (onProgress) {
      onProgress(fileNum, imageUrls.length);
    }

    await downloadImage(url, name);
    downloadedCount++;

    if (i < imageUrls.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return downloadedCount;
}

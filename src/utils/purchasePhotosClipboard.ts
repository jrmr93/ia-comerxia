import { PurchaseOrder, InventoryItem, Supplier } from '../types.ts';
import { normalizeEcuadorPhone } from './phone.ts';

export interface PurchasePhotoItem {
  name: string;
  imageUrl: string;
  quantity: number;
  sku?: string;
  costPrice?: string | number;
  inventoryItemId?: number;
  supplierName?: string;
}

export interface SupplierPhotoGroup {
  supplierName: string;
  phone: string;
  hasPhone: boolean;
  waUrl: string | null;
  photoItems: PurchasePhotoItem[];
  allItems: any[];
  totalUnits: number;
  totalCost: number;
}

/**
 * Groups items in a purchase order by their specific supplier.
 * Supports orders with items originating from different suppliers.
 */
export function groupPurchasePhotosBySupplier(
  purchase: PurchaseOrder,
  inventoryItems: InventoryItem[] = [],
  suppliers: Supplier[] = []
): SupplierPhotoGroup[] {
  if (!purchase || !Array.isArray(purchase.items) || purchase.items.length === 0) {
    return [];
  }

  const groupsMap = new Map<
    string,
    {
      supplierName: string;
      items: any[];
      photoItems: PurchasePhotoItem[];
    }
  >();

  purchase.items.forEach((item) => {
    // 1. Determine supplier for this item
    let sName = '';
    if (item.supplierName && item.supplierName.trim()) {
      sName = item.supplierName.trim();
    } else {
      const matched = inventoryItems.find(
        (inv) =>
          (item.inventoryItemId && inv.id === item.inventoryItemId) ||
          (item.sku && inv.sku && inv.sku.trim().toLowerCase() === item.sku.trim().toLowerCase()) ||
          (inv.name && item.name && inv.name.trim().toLowerCase() === item.name.trim().toLowerCase())
      );
      if (matched?.supplierName && matched.supplierName.trim()) {
        sName = matched.supplierName.trim();
      }
    }

    if (!sName) {
      sName = purchase.supplierName && purchase.supplierName.trim()
        ? purchase.supplierName.trim()
        : 'Proveedor General';
    }

    if (!groupsMap.has(sName)) {
      groupsMap.set(sName, {
        supplierName: sName,
        items: [],
        photoItems: [],
      });
    }

    const grp = groupsMap.get(sName)!;
    grp.items.push(item);

    // 2. Resolve image
    let cover = item.imageUrl && item.imageUrl.trim() ? item.imageUrl.trim() : null;
    if (!cover && inventoryItems && inventoryItems.length > 0) {
      const matched = inventoryItems.find(
        (inv) =>
          (item.inventoryItemId && inv.id === item.inventoryItemId) ||
          (item.sku && inv.sku && inv.sku.trim().toLowerCase() === item.sku.trim().toLowerCase()) ||
          (inv.name && item.name && inv.name.trim().toLowerCase() === item.name.trim().toLowerCase())
      );
      if (matched?.imageUrl && matched.imageUrl.trim()) {
        cover = matched.imageUrl.trim();
      }
    }

    if (cover && cover.length > 0) {
      grp.photoItems.push({
        name: item.name || 'Producto sin nombre',
        imageUrl: cover,
        quantity: Number(item.quantity) || 1,
        sku: item.sku || '',
        costPrice: item.costPrice,
        inventoryItemId: item.inventoryItemId,
        supplierName: sName,
      });
    }
  });

  const result: SupplierPhotoGroup[] = [];

  for (const [name, data] of groupsMap.entries()) {
    let rawPhone = '';
    // Check if matching main purchase supplier
    if (
      purchase.supplierName &&
      purchase.supplierName.trim().toLowerCase() === name.toLowerCase() &&
      purchase.supplierContact
    ) {
      rawPhone = purchase.supplierContact;
    }

    // Lookup in suppliers directory
    if (!rawPhone && suppliers && suppliers.length > 0) {
      const sLower = name.toLowerCase();
      const found = suppliers.find(
        (s) =>
          s.name.trim().toLowerCase() === sLower ||
          (s.tradeName && s.tradeName.trim().toLowerCase() === sLower)
      );
      if (found) {
        rawPhone = found.phone || found.contactPersonPhone || (found as any).whatsapp || '';
      }
    }

    if (!rawPhone && purchase.supplierContact && groupsMap.size === 1) {
      rawPhone = purchase.supplierContact;
    }

    const norm = normalizeEcuadorPhone(rawPhone);
    const hasPhone = norm.isValid || norm.whatsappDigits.length >= 8;
    // URL opens WhatsApp chat directly WITHOUT any automatic pre-filled text
    const waUrl = hasPhone ? `https://wa.me/${norm.whatsappDigits}` : null;

    const totalUnits = data.items.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0);
    const totalCost = data.items.reduce(
      (acc, it) => acc + (Number(it.costPrice || 0) * (Number(it.quantity) || 1)),
      0
    );

    result.push({
      supplierName: name,
      phone: norm.formattedLocal || rawPhone,
      hasPhone,
      waUrl,
      photoItems: data.photoItems,
      allItems: data.items,
      totalUnits,
      totalCost: Math.round(totalCost * 100) / 100,
    });
  }

  // Sort groups: if one matches purchase.supplierName, put it first
  if (purchase.supplierName) {
    const mainLower = purchase.supplierName.trim().toLowerCase();
    result.sort((a, b) => {
      if (a.supplierName.toLowerCase() === mainLower) return -1;
      if (b.supplierName.toLowerCase() === mainLower) return 1;
      return a.supplierName.localeCompare(b.supplierName);
    });
  }

  return result;
}

/**
 * Extracts all valid items with cover images from a purchase order
 */
export function extractPurchasePhotos(
  purchase: PurchaseOrder,
  inventoryItems?: InventoryItem[]
): PurchasePhotoItem[] {
  if (!purchase || !Array.isArray(purchase.items)) return [];

  return purchase.items
    .map((item) => {
      let cover = item.imageUrl && item.imageUrl.trim() ? item.imageUrl.trim() : null;

      if (!cover && inventoryItems && inventoryItems.length > 0) {
        const matchingInv = inventoryItems.find(
          (inv) =>
            (item.inventoryItemId && inv.id === item.inventoryItemId) ||
            (item.sku && inv.sku && inv.sku.trim().toLowerCase() === item.sku.trim().toLowerCase()) ||
            (inv.name && item.name && inv.name.trim().toLowerCase() === item.name.trim().toLowerCase())
        );
        if (matchingInv?.imageUrl && matchingInv.imageUrl.trim()) {
          cover = matchingInv.imageUrl.trim();
        }
      }

      return {
        name: item.name || 'Producto sin nombre',
        imageUrl: cover || '',
        quantity: Number(item.quantity) || 1,
        sku: item.sku || '',
        costPrice: item.costPrice,
        inventoryItemId: item.inventoryItemId,
      };
    })
    .filter((item) => item.imageUrl.length > 0);
}

function encodeXml(str: string): string {
  return (str || '').replace(/[<>&'"]/g, (c) => {
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

/**
 * Creates an SVG data URI image placeholder for missing or unreadable images
 */
function createFallbackImageSvg(textLabel: string = 'Foto no disponible'): string {
  const safeText = encodeXml(textLabel.length > 30 ? textLabel.slice(0, 27) + '...' : textLabel);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
    <rect width="500" height="500" fill="#f8fafc"/>
    <rect x="20" y="20" width="460" height="460" rx="20" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="8 8"/>
    <circle cx="250" cy="205" r="55" fill="#e2e8f0"/>
    <rect x="210" y="200" width="80" height="60" rx="10" fill="#64748b"/>
    <circle cx="250" cy="230" r="14" fill="#f8fafc"/>
    <text x="250" y="320" text-anchor="middle" fill="#334155" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="bold">${safeText}</text>
    <text x="250" y="350" text-anchor="middle" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14">Foto en catálogo</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Helper to safely load an image into an HTMLImageElement with multi-tier fallback
 */
function loadImageSafely(src: string, fallbackLabel?: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    if (!src || !src.trim()) {
      const fallbackImg = new Image();
      fallbackImg.onload = () => resolve(fallbackImg);
      fallbackImg.src = createFallbackImageSvg(fallbackLabel || 'Foto no disponible');
      return;
    }

    const cleanSrc = src.trim();
    const isDataOrBlob = cleanSrc.startsWith('data:') || cleanSrc.startsWith('blob:');
    const isRelative = cleanSrc.startsWith('/');
    const isSameHost = cleanSrc.includes(window.location.host);

    const img = new Image();
    // Only set crossOrigin for external http/https to prevent unnecessary CORS preflight on same-origin
    if (!isDataOrBlob && !isRelative && !isSameHost) {
      img.crossOrigin = 'anonymous';
    }

    let resolvedSrc = cleanSrc;
    if ((cleanSrc.startsWith('http://') || cleanSrc.startsWith('https://')) && !isSameHost) {
      resolvedSrc = `/api/proxy-image?url=${encodeURIComponent(cleanSrc)}`;
    }

    img.onload = () => resolve(img);
    img.onerror = () => {
      // Tier 1 fallback: if proxy was used, try direct url
      if (resolvedSrc !== cleanSrc) {
        const directImg = new Image();
        directImg.crossOrigin = 'anonymous';
        directImg.onload = () => resolve(directImg);
        directImg.onerror = () => {
          // Tier 2: use SVG placeholder
          const fallback = new Image();
          fallback.onload = () => resolve(fallback);
          fallback.src = createFallbackImageSvg(fallbackLabel || 'Foto no disponible');
        };
        directImg.src = cleanSrc;
        return;
      }

      // Tier 2 fallback: if crossOrigin caused a failure on same-origin or local path
      if (img.crossOrigin) {
        const noCorsImg = new Image();
        noCorsImg.onload = () => resolve(noCorsImg);
        noCorsImg.onerror = () => {
          const fallback = new Image();
          fallback.onload = () => resolve(fallback);
          fallback.src = createFallbackImageSvg(fallbackLabel || 'Foto no disponible');
        };
        noCorsImg.src = cleanSrc;
        return;
      }

      // Tier 3: safe SVG image fallback
      const fallback = new Image();
      fallback.onload = () => resolve(fallback);
      fallback.src = createFallbackImageSvg(fallbackLabel || 'Foto no disponible');
    };

    img.src = resolvedSrc;
  });
}

/**
 * Helper to draw a rounded rectangle on Canvas 2D
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Generates a high-resolution consolidated image collage of all cover photos
 */
export async function generatePurchasePhotosCollage(
  purchase: PurchaseOrder,
  photos: PurchasePhotoItem[],
  customSupplierName?: string
): Promise<{ blob: Blob; dataUrl: string }> {
  if (!photos || photos.length === 0) {
    throw new Error('No hay fotos de productos para generar la imagen.');
  }

  // Pre-load all images in parallel
  const loadedImages: { item: PurchasePhotoItem; img: HTMLImageElement | null }[] = await Promise.all(
    photos.map(async (item) => {
      try {
        const img = await loadImageSafely(item.imageUrl, item.name);
        return { item, img };
      } catch {
        return { item, img: null };
      }
    })
  );

  // Setup layout math
  const count = photos.length;
  let cols = 1;
  if (count === 2) cols = 2;
  else if (count >= 3 && count <= 4) cols = 2;
  else if (count >= 5 && count <= 9) cols = 3;
  else if (count >= 10) cols = 4;

  const rows = Math.ceil(count / cols);

  const canvasWidth = cols === 1 ? 680 : cols === 2 ? 920 : cols === 3 ? 1100 : 1260;
  const padding = 20;
  const gap = 16;

  const cardWidth = Math.floor((canvasWidth - padding * 2 - gap * (cols - 1)) / cols);
  const cardHeight = cols === 1 ? 450 : cols === 2 ? 380 : cols === 3 ? 320 : 280;

  // Pure clean product photos grid (no text, no quantities)
  const canvasHeight = padding * 2 + rows * cardHeight + (rows - 1) * gap;

  // Render on retina 2x canvas for super crisp rendering in WhatsApp
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth * scale;
  canvas.height = canvasHeight * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo inicializar el lienzo gráfico.');

  ctx.scale(scale, scale);

  // 1. Overall Background: Clean White
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. Render Product Original Photos Grid
  loadedImages.forEach((entry, idx) => {
    const colIdx = idx % cols;
    const rowIdx = Math.floor(idx / cols);

    const cardX = padding + colIdx * (cardWidth + gap);
    const cardY = padding + rowIdx * (cardHeight + gap);

    // Card background
    ctx.save();
    roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 14);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Image container clip (rounded corners)
    ctx.save();
    roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 14);
    ctx.clip();

    if (entry.img) {
      const img = entry.img;
      const hRatio = cardWidth / img.width;
      const vRatio = cardHeight / img.height;
      const ratio = Math.min(hRatio, vRatio);

      const centerShiftX = cardX + (cardWidth - img.width * ratio) / 2;
      const centerShiftY = cardY + (cardHeight - img.height * ratio) / 2;

      ctx.drawImage(img, 0, 0, img.width, img.height, centerShiftX, centerShiftY, img.width * ratio, img.height * ratio);
    } else {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('📷 Foto no disponible', cardX + cardWidth / 2, cardY + cardHeight / 2);
    }
    ctx.restore();
  });

  // Export to Blob and DataURL
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No se pudo convertir el lienzo a imagen'));
          return;
        }
        const dataUrl = canvas.toDataURL('image/png');
        resolve({ blob, dataUrl });
      },
      'image/png',
      1.0
    );
  });
}

function getAbsoluteUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${origin}${path}`;
}

/**
 * Copies an image Blob directly into the operating system clipboard with Chrome & HTTP fallbacks
 */
export async function copyBlobToClipboard(blob: Blob): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof window.ClipboardItem !== 'undefined') {
    try {
      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
      return true;
    } catch (err) {
      console.warn('[Clipboard] Native write failed, trying execCommand fallback:', err);
    }
  }

  // Fallback for non-secure HTTP (IP address) in Chrome: execCommand HTML rich text copy
  try {
    const blobUrl = URL.createObjectURL(blob);
    const img = document.createElement('img');
    img.src = blobUrl;

    const container = document.createElement('div');
    container.contentEditable = 'true';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.opacity = '0';
    container.appendChild(img);
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNodeContents(container);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const ok = document.execCommand('copy');
    if (sel) sel.removeAllRanges();
    document.body.removeChild(container);
    URL.revokeObjectURL(blobUrl);
    if (ok) return true;
  } catch (err) {
    console.warn('[Clipboard] execCommand fallback failed:', err);
  }

  throw new Error('Tu navegador o conexión HTTP restringe el copiado directo al portapapeles. Accede por http://localhost o activa HTTPS.');
}

/**
 * Copies a single photo to clipboard with robust fallback
 */
export async function copySinglePhotoToClipboard(
  imageUrl: string,
  itemName?: string
): Promise<boolean> {
  const img = await loadImageSafely(imageUrl, itemName);
  const canvas = document.createElement('canvas');
  const width = Math.max(img.naturalWidth || img.width || 400, 200);
  const height = Math.max(img.naturalHeight || img.height || 400, 200);
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Error al inicializar lienzo para copiar foto');

  // Fill canvas with white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error('Error al procesar foto para portapapeles'));
      try {
        await copyBlobToClipboard(blob);
        resolve(true);
      } catch (err) {
        reject(err);
      }
    }, 'image/png');
  });
}

/**
 * Helper to construct a Promise<Blob> for Chrome ClipboardItem
 */
function convertItemToPngBlobPromise(item: PurchasePhotoItem): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    try {
      const img = await loadImageSafely(item.imageUrl, item.name);
      const width = Math.max(img.naturalWidth || img.width || 400, 200);
      const height = Math.max(img.naturalHeight || img.height || 400, 200);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context failure'));
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (blob && blob.size > 0) resolve(blob);
        else reject(new Error('Canvas toBlob null'));
      }, 'image/png');
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Rich HTML selection copy fallback for non-secure HTTP contexts in Chrome
 */
function copyPhotoItemsAsHtml(items: PurchasePhotoItem[]): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const container = document.createElement('div');
    container.contentEditable = 'true';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.opacity = '0';

    items.forEach((it) => {
      const p = document.createElement('p');
      p.style.margin = '4px 0';
      p.style.fontSize = '12px';
      p.style.fontWeight = 'bold';
      p.innerText = `${it.name} (Cant: ${it.quantity})`;

      const img = document.createElement('img');
      img.src = getAbsoluteUrl(it.imageUrl);
      img.alt = it.name;
      img.style.maxWidth = '400px';
      img.style.display = 'block';

      container.appendChild(p);
      container.appendChild(img);
      container.appendChild(document.createElement('br'));
    });

    document.body.appendChild(container);
    const range = document.createRange();
    range.selectNodeContents(container);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const ok = document.execCommand('copy');
    if (sel) sel.removeAllRanges();
    document.body.removeChild(container);
    return ok;
  } catch (err) {
    console.warn('[Clipboard] copyPhotoItemsAsHtml error:', err);
    return false;
  }
}

/**
 * Copies multiple product photo items individually to the clipboard queue,
 * allowing single Ctrl+V paste of separate images in messaging apps like WhatsApp/Telegram.
 * Supports Chrome user gesture promise requirements and HTTP execCommand fallbacks.
 */
export async function copyMultipleIndividualPhotosToClipboard(
  photoItems: PurchasePhotoItem[]
): Promise<{ count: number; success: boolean }> {
  const validItems = (photoItems || []).filter((it) => Boolean(it.imageUrl && it.imageUrl.trim()));

  if (validItems.length === 0) {
    throw new Error('No hay productos con fotos disponibles para copiar.');
  }

  // 1. Prepare PNG Blob promises for each valid photo item
  const blobPromises = validItems.map((item) =>
    convertItemToPngBlobPromise(item)
  );

  // 2. Try modern navigator.clipboard.write with Promises (Chrome / Edge in Secure Context)
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof window.ClipboardItem !== 'undefined') {
    try {
      const clipboardItems = blobPromises.map(
        (promise) => new ClipboardItem({ 'image/png': promise })
      );
      await navigator.clipboard.write(clipboardItems);
      return { count: validItems.length, success: true };
    } catch (writeErr: any) {
      console.warn('[Clipboard] Direct Promise write failed, testing resolved blobs fallback:', writeErr);

      // Secondary attempt: resolve blobs first then write
      try {
        const resolvedBlobs: Blob[] = [];
        for (const p of blobPromises) {
          try {
            const b = await p;
            if (b && b.size > 0) resolvedBlobs.push(b);
          } catch {}
        }

        if (resolvedBlobs.length > 0) {
          const items = resolvedBlobs.map((b) => new ClipboardItem({ 'image/png': b }));
          await navigator.clipboard.write(items);
          return { count: resolvedBlobs.length, success: true };
        }
      } catch (resolvedErr) {
        console.warn('[Clipboard] Resolved blobs write failed:', resolvedErr);
      }
    }
  }

  // 3. Fallback for non-secure HTTP contexts (IP addresses or HTTP URLs in Chrome):
  // Use HTML rich selection execCommand ('copy') which Chrome allows on HTTP
  try {
    const htmlSuccess = copyPhotoItemsAsHtml(validItems);
    if (htmlSuccess) {
      return { count: validItems.length, success: true };
    }
  } catch (htmlErr) {
    console.warn('[Clipboard] HTML execCommand fallback failed:', htmlErr);
  }

  // 4. Detailed error depending on environment
  const isSecureContext = typeof window !== 'undefined' && (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  if (!isSecureContext) {
    throw new Error(
      'Para copiar imágenes directamente en Chrome desde una IP local, accede mediante http://localhost:5173 o configura HTTPS.'
    );
  }

  throw new Error('No se pudieron copiar las fotos automáticamente al portapapeles.');
}

/**
 * Resolves supplier phone and generates the WhatsApp direct link and message.
 * User requirement: The WhatsApp link opens the direct chat WITHOUT any automated prefilled text.
 */
export function getSupplierWhatsappInfo(
  purchase: PurchaseOrder,
  suppliers?: Supplier[],
  overrideSupplierName?: string,
  overrideSupplierContact?: string
): {
  url: string | null;
  phone: string;
  hasPhone: boolean;
  prefilledText: string;
} {
  const targetSupplierName = overrideSupplierName || purchase.supplierName || '';
  let rawPhone = overrideSupplierContact || '';

  if (!rawPhone && purchase.supplierContact && (!overrideSupplierName || purchase.supplierName === overrideSupplierName)) {
    rawPhone = purchase.supplierContact;
  }

  if (!rawPhone && suppliers && suppliers.length > 0 && targetSupplierName) {
    const sName = targetSupplierName.trim().toLowerCase();
    const found = suppliers.find(
      (s) =>
        s.name.trim().toLowerCase() === sName ||
        (s.tradeName && s.tradeName.trim().toLowerCase() === sName)
    );
    if (found?.phone) {
      rawPhone = found.phone;
    } else if (found?.contactPersonPhone) {
      rawPhone = found.contactPersonPhone;
    } else if ((found as any)?.whatsapp) {
      rawPhone = (found as any).whatsapp;
    }
  }

  if (!rawPhone && purchase.supplierContact) {
    rawPhone = purchase.supplierContact;
  }

  const normalized = normalizeEcuadorPhone(rawPhone);
  const hasPhone = normalized.isValid || normalized.whatsappDigits.length >= 8;

  // Build message (kept for manual clipboard copy if needed)
  let text = `📦 *ORDEN DE COMPRA / CONSULTA DE DISPONIBILIDAD*\n`;
  text += `*N° Compra:* #${purchase.purchaseNumber}\n`;
  text += `*Proveedor:* ${targetSupplierName || 'Estimado Proveedor'}\n`;
  text += `*Fecha:* ${new Date(purchase.purchaseDate || purchase.createdAt).toLocaleDateString('es-EC')}\n\n`;
  text += `*PRODUCTOS SOLICITADOS:*\n`;

  if (Array.isArray(purchase.items)) {
    purchase.items.forEach((it, idx) => {
      text += `${idx + 1}. *${it.name}* (Cant: *${it.quantity} un.*)${it.sku ? ` - SKU: ${it.sku}` : ''}${it.costPrice ? ` - Costo: $${Number(it.costPrice).toFixed(2)}` : ''}\n`;
    });
  }

  text += `\n💰 *Total Estimado:* $${Number(purchase.totalCost || 0).toFixed(2)} USD\n`;
  if (purchase.notes) {
    text += `📝 *Observaciones:* ${purchase.notes}\n`;
  }
  text += `\nHola, te adjunto la imagen con las fotos de portada de los artículos para verificar disponibilidad inmediata en bodega y tiempo de entrega. ¡Muchas gracias!`;

  // Explicit user requirement: Direct chat only, without automatic pre-filled text!
  const url = hasPhone
    ? `https://wa.me/${normalized.whatsappDigits}`
    : null;

  return {
    url,
    phone: normalized.formattedLocal || rawPhone,
    hasPhone,
    prefilledText: text,
  };
}

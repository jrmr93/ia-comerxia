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
  const padding = 24;
  const gap = 20;

  const cardWidth = Math.floor((canvasWidth - padding * 2 - gap * (cols - 1)) / cols);
  const cardImageHeight = cols === 1 ? 380 : cols === 2 ? 280 : cols === 3 ? 230 : 190;
  const cardMetaHeight = 84;
  const cardHeight = cardImageHeight + cardMetaHeight;

  // No header and no footer: only clean product grid
  const canvasHeight = padding * 2 + rows * cardHeight + (rows - 1) * gap;

  // Render on retina 2x canvas for super crisp rendering in WhatsApp
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth * scale;
  canvas.height = canvasHeight * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo inicializar el lienzo gráfico.');

  ctx.scale(scale, scale);

  // 1. Overall Background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. Render Product Cards Grid (Starts directly at padding)
  const curY = padding;

  loadedImages.forEach((entry, idx) => {
    const colIdx = idx % cols;
    const rowIdx = Math.floor(idx / cols);

    const cardX = padding + colIdx * (cardWidth + gap);
    const cardY = curY + rowIdx * (cardHeight + gap);

    // Card background & shadow
    ctx.save();
    roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 16);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(15, 23, 42, 0.06)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fill();
    ctx.restore();

    // Card border
    ctx.save();
    roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 16);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Image container clip (rounded top corners)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cardX + 16, cardY);
    ctx.arcTo(cardX + cardWidth, cardY, cardX + cardWidth, cardY + cardImageHeight, 16);
    ctx.lineTo(cardX + cardWidth, cardY + cardImageHeight);
    ctx.lineTo(cardX, cardY + cardImageHeight);
    ctx.arcTo(cardX, cardY, cardX + 16, cardY, 16);
    ctx.closePath();
    ctx.clip();

    if (entry.img) {
      // Draw image object-fit: contain on subtle grey background
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(cardX, cardY, cardWidth, cardImageHeight);

      const img = entry.img;
      const hRatio = cardWidth / img.width;
      const vRatio = cardImageHeight / img.height;
      const ratio = Math.min(hRatio, vRatio);

      const centerShiftX = cardX + (cardWidth - img.width * ratio) / 2;
      const centerShiftY = cardY + (cardImageHeight - img.height * ratio) / 2;

      ctx.drawImage(img, 0, 0, img.width, img.height, centerShiftX, centerShiftY, img.width * ratio, img.height * ratio);
    } else {
      // Placeholder
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(cardX, cardY, cardWidth, cardImageHeight);
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('📷 Foto no disponible', cardX + cardWidth / 2, cardY + cardImageHeight / 2);
      ctx.textAlign = 'left';
    }
    ctx.restore();

    // Quantity Badge (Top Left of image)
    const pillX = cardX + 12;
    const pillY = cardY + 12;
    const pillH = 26;
    const qtyPillText = `Cant: ${entry.item.quantity} un.`;
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    const textWidth = ctx.measureText(qtyPillText).width;
    const pillW = textWidth + 18;

    ctx.save();
    roundRect(ctx, pillX, pillY, pillW, pillH, 8);
    ctx.fillStyle = '#059669'; // Emerald-600
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(qtyPillText, pillX + 9, pillY + 18);
    ctx.restore();

    // Meta Section (Below Image) - Strictly Product Name and Quantity, organized & aligned
    const metaX = cardX + 16;
    const metaY = cardY + cardImageHeight + 26;

    // Product Title (truncate if needed)
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';

    const maxTitleW = cardWidth - 32;
    let title = entry.item.name || 'Producto';
    if (ctx.measureText(title).width > maxTitleW) {
      while (title.length > 3 && ctx.measureText(title + '...').width > maxTitleW) {
        title = title.slice(0, -1);
      }
      title += '...';
    }
    ctx.fillText(title, metaX, metaY);

    // Product Quantity
    const subY = metaY + 24;
    const qtyText = `Cantidad: ${entry.item.quantity} ${entry.item.quantity === 1 ? 'unidad' : 'unidades'}`;
    ctx.fillStyle = '#059669'; // Emerald-600
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.fillText(qtyText, metaX, subY);
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

/**
 * Copies an image Blob directly into the operating system clipboard
 */
export async function copyBlobToClipboard(blob: Blob): Promise<boolean> {
  if (!navigator.clipboard || !navigator.clipboard.write) {
    throw new Error('Tu navegador no soporta el copiado directo de imágenes al portapapeles.');
  }

  const item = new ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([item]);
  return true;
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

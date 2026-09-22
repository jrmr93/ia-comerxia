import { safeLocalStorage } from './safeStorage.ts';

export type FlyerTemplateStyle =
  | 'studio'
  | 'dark'
  | 'clean'
  | 'neon'
  | 'rose_gold'
  | 'pastel_pink'
  | 'lavender_glam'
  | 'coral_sunset';

export interface SocialFlyerOptions {
  productImageUrl?: string;
  productImageUrls?: string[];
  productName: string;
  salePrice: string | number;
  originalPrice?: string | number | null;
  discountPercent?: number | null;
  currency?: string;
  storeName?: string;
  storeLogoUrl?: string | null;
  whatsappNumber?: string | null;
  templateStyle?: FlyerTemplateStyle;
  tagline?: string;
}

/**
 * Formats phone numbers cleanly for promotional flyer display (e.g. 098 330 2390).
 */
function formatFlyerPhone(phone: string): string {
  if (!phone) return '';
  let raw = phone.trim();
  if (raw.startsWith('+593')) {
    raw = '0' + raw.slice(4);
  }
  const digits = raw.replace(/\D/g, '');
  let cleanDigits = digits;
  if (cleanDigits.startsWith('593') && cleanDigits.length === 12) {
    cleanDigits = '0' + cleanDigits.slice(3);
  }
  if (cleanDigits.length === 10 && cleanDigits.startsWith('0')) {
    return `${cleanDigits.slice(0, 3)} ${cleanDigits.slice(3, 6)} ${cleanDigits.slice(6)}`;
  }
  if (cleanDigits.length > 0) {
    return cleanDigits;
  }
  return raw;
}

/**
 * Draws a crisp vector WhatsApp icon badge on Canvas context.
 */
function drawWhatsAppVectorIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number = 36
) {
  ctx.save();
  const r = size / 2;

  // Outer white circular background badge
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Green inner circle
  const greenR = r * 0.84;
  ctx.beginPath();
  ctx.arc(cx, cy, greenR, 0, Math.PI * 2);
  ctx.fillStyle = '#25D366';
  ctx.fill();

  // Speech bubble pointer tail on bottom left
  ctx.beginPath();
  ctx.moveTo(cx - greenR * 0.45, cy + greenR * 0.45);
  ctx.lineTo(cx - greenR * 0.95, cy + greenR * 0.95);
  ctx.lineTo(cx - greenR * 0.05, cy + greenR * 0.85);
  ctx.closePath();
  ctx.fillStyle = '#25D366';
  ctx.fill();

  // White phone handset receiver
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 10);
  ctx.fillStyle = '#ffffff';

  // Curved handset body
  ctx.beginPath();
  ctx.arc(0, 0, greenR * 0.48, 0.15, Math.PI * 1.35, false);
  ctx.lineWidth = greenR * 0.32;
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Earpiece and mouthpiece caps
  ctx.beginPath();
  ctx.arc(greenR * 0.35, greenR * 0.28, greenR * 0.16, 0, Math.PI * 2);
  ctx.arc(-greenR * 0.32, -greenR * 0.32, greenR * 0.16, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.restore();
}

/**
 * Loads an image URL into an HTMLImageElement safely handling CORS.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      // Retry without crossOrigin if CORS blocks direct canvas drawing
      const fallbackImg = new Image();
      fallbackImg.onload = () => resolve(fallbackImg);
      fallbackImg.onerror = (err) => reject(err);
      fallbackImg.src = url;
    };
    img.src = url;
  });
}

/**
 * Draws rounded rectangle path on Canvas context.
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Draws an image centered and aspect-fitted within a clipped rounded cell box.
 */
function drawImageInCell(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  radius: number = 20
) {
  ctx.save();
  drawRoundedRect(ctx, cellX, cellY, cellW, cellH, radius);
  ctx.clip();

  // White inner background for card cell
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cellX, cellY, cellW, cellH);

  const pad = 12;
  const availW = cellW - pad * 2;
  const availH = cellH - pad * 2;
  const imgRatio = img.width / img.height;
  const availRatio = availW / availH;

  let drawW = availW;
  let drawH = availH;
  let drawX = cellX + pad;
  let drawY = cellY + pad;

  if (imgRatio > availRatio) {
    drawH = availW / imgRatio;
    drawY = cellY + pad + (availH - drawH) / 2;
  } else {
    drawW = availH * imgRatio;
    drawX = cellX + pad + (availW - drawW) / 2;
  }

  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();
}

/**
 * Generates a high-definition 1080x1080px promotional flyer PNG Data URL.
 */
export async function generateSocialFlyer(options: SocialFlyerOptions): Promise<string> {
  const {
    productImageUrl,
    productImageUrls,
    productName,
    salePrice,
    originalPrice,
    discountPercent,
    currency = 'USD',
    storeName = 'COMERXIA STORE',
    storeLogoUrl,
    whatsappNumber,
    templateStyle = 'studio',
    tagline = 'Envíos a todo el país 🚚',
  } = options;

  const canvas = document.createElement('canvas');
  const size = 1080;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo inicializar el contexto Canvas 2D');

  // Determine list of image URLs (up to 4)
  const rawUrls = (productImageUrls && productImageUrls.length > 0)
    ? productImageUrls
    : (productImageUrl ? [productImageUrl] : []);
  const targetUrls = rawUrls.slice(0, 4);

  // Load product images safely
  const loadedImages: HTMLImageElement[] = [];
  for (const u of targetUrls) {
    if (u) {
      try {
        const img = await loadImage(u);
        if (img) loadedImages.push(img);
      } catch (err) {
        console.warn('No se pudo cargar foto de producto para flyer:', err);
      }
    }
  }

  // Load store logo if present
  let logoImg: HTMLImageElement | null = null;
  if (storeLogoUrl) {
    try {
      logoImg = await loadImage(storeLogoUrl);
    } catch {
      logoImg = null;
    }
  }

  const priceNum = parseFloat(String(salePrice)) || 0;
  const origPriceNum = originalPrice ? parseFloat(String(originalPrice)) : 0;
  const calcDiscount = (discountPercent && discountPercent > 0)
    ? Math.round(discountPercent)
    : (origPriceNum > priceNum && origPriceNum > 0)
    ? Math.round(((origPriceNum - priceNum) / origPriceNum) * 100)
    : 0;

  const priceFormatted = `${currency === 'USD' ? '$' : currency + ' '}${priceNum.toFixed(2)}`;
  const origFormatted = origPriceNum > 0 ? `${currency === 'USD' ? '$' : currency + ' '}${origPriceNum.toFixed(2)}` : '';

  const isLightTemplate = templateStyle === 'clean' || templateStyle === 'pastel_pink' || templateStyle === 'coral_sunset';

  // 1. BACKGROUND RENDER BY TEMPLATE (8 STYLES)
  if (templateStyle === 'dark') {
    // Dark Minimalist Studio
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#1e293b');
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  } else if (templateStyle === 'clean') {
    // Clean White / WhatsApp
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.arc(size * 0.9, size * 0.1, 320, 0, Math.PI * 2);
    ctx.fill();
  } else if (templateStyle === 'neon') {
    // Social Vibrant Neon
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#111827');
    grad.addColorStop(0.5, '#312e81');
    grad.addColorStop(1, '#065f46');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  } else if (templateStyle === 'rose_gold') {
    // 🌸 Rosa Gold Chic
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#2a081a');
    grad.addColorStop(0.45, '#5c1d38');
    grad.addColorStop(1, '#881337');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  } else if (templateStyle === 'pastel_pink') {
    // 💖 Pastel Blush / Boutique
    ctx.fillStyle = '#fff1f2';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#ffe4e6';
    ctx.beginPath();
    ctx.arc(size * 0.85, size * 0.15, 340, 0, Math.PI * 2);
    ctx.fill();
  } else if (templateStyle === 'lavender_glam') {
    // 💜 Lavanda Glam / Beauty
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#1e1b4b');
    grad.addColorStop(0.5, '#4c1d95');
    grad.addColorStop(1, '#701a75');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  } else if (templateStyle === 'coral_sunset') {
    // 🌺 Coral Soft / Glamour
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#fff7ed');
    grad.addColorStop(0.6, '#ffedd5');
    grad.addColorStop(1, '#fecdd3');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  } else {
    // Studio Gradient (Default Modern Indigo/Sky)
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.4, '#1e1b4b');
    grad.addColorStop(1, '#312e81');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  // 2. STORE HEADER / BRANDING (Top Left/Right Watermark) - LOGO SIZE DOUBLED (2X)
  ctx.save();
  const headerY = 75;
  if (logoImg) {
    // Draw Store Logo image at 2X SIZE (height 88px)
    const logoHeight = 88;
    const logoWidth = (logoImg.width / logoImg.height) * logoHeight;
    ctx.drawImage(logoImg, 60, headerY - 35, Math.min(logoWidth, 380), logoHeight);
  } else {
    // Draw Store Name Pill Badge at 2X SIZE
    const badgeBg = isLightTemplate ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.16)';
    ctx.fillStyle = badgeBg;
    drawRoundedRect(ctx, 60, headerY - 35, 340, 75, 24);
    ctx.fill();

    ctx.fillStyle = isLightTemplate ? '#0f172a' : '#ffffff';
    ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(storeName.toUpperCase(), 85, headerY + 12);
  }

  // Top Right Tagline / Badge
  const taglineBg = isLightTemplate ? 'rgba(14, 165, 233, 0.12)' : 'rgba(56, 189, 248, 0.2)';
  ctx.fillStyle = taglineBg;
  drawRoundedRect(ctx, size - 310, headerY - 24, 250, 48, 24);
  ctx.fill();

  ctx.fillStyle = isLightTemplate ? '#0284c7' : '#38bdf8';
  ctx.font = '600 16px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(tagline, size - 185, headerY + 7);
  ctx.restore();

  // 3. PRODUCT IMAGE CARD CONTAINER & MULTI-PHOTO GRID (1 to 4 Photos)
  const cardX = 90;
  const cardY = 160;
  const cardWidth = size - 180; // 900px
  const cardHeight = 620;

  ctx.save();
  // Card Drop Shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 20;

  // Card Outer Frame Background
  ctx.fillStyle = '#ffffff';
  drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 32);
  ctx.fill();
  ctx.restore();

  // Inner Clipping Area for Grid
  const innerX = cardX + 16;
  const innerY = cardY + 16;
  const innerW = cardWidth - 32;
  const innerH = cardHeight - 32;

  ctx.save();
  drawRoundedRect(ctx, innerX, innerY, innerW, innerH, 24);
  ctx.clip();
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(innerX, innerY, innerW, innerH);
  ctx.restore();

  const numImgs = loadedImages.length;

  if (numImgs === 1) {
    // LAYOUT 1 PHOTO: Full Card Centered
    drawImageInCell(ctx, loadedImages[0], innerX, innerY, innerW, innerH, 24);
  } else if (numImgs === 2) {
    // LAYOUT 2 PHOTOS: Split 50/50 Side-by-Side
    const gap = 12;
    const colW = (innerW - gap) / 2;
    drawImageInCell(ctx, loadedImages[0], innerX, innerY, colW, innerH, 20);
    drawImageInCell(ctx, loadedImages[1], innerX + colW + gap, innerY, colW, innerH, 20);
  } else if (numImgs === 3) {
    // LAYOUT 3 PHOTOS: 1 Main Left + 2 Stacked Right
    const gap = 12;
    const colW = (innerW - gap) / 2;
    const rowH = (innerH - gap) / 2;
    drawImageInCell(ctx, loadedImages[0], innerX, innerY, colW, innerH, 20);
    drawImageInCell(ctx, loadedImages[1], innerX + colW + gap, innerY, colW, rowH, 20);
    drawImageInCell(ctx, loadedImages[2], innerX + colW + gap, innerY + rowH + gap, colW, rowH, 20);
  } else if (numImgs >= 4) {
    // LAYOUT 4 PHOTOS: 2x2 Grid Mosaico
    const gap = 12;
    const colW = (innerW - gap) / 2;
    const rowH = (innerH - gap) / 2;
    drawImageInCell(ctx, loadedImages[0], innerX, innerY, colW, rowH, 20);
    drawImageInCell(ctx, loadedImages[1], innerX + colW + gap, innerY, colW, rowH, 20);
    drawImageInCell(ctx, loadedImages[2], innerX, innerY + rowH + gap, colW, rowH, 20);
    drawImageInCell(ctx, loadedImages[3], innerX + colW + gap, innerY + rowH + gap, colW, rowH, 20);
  }

  // 4. PRICE & OFFER BADGE OVERLAY (With Crossed-Out Original Price & Discount Badge if present)
  ctx.save();
  const hasOffer = calcDiscount > 0 || (origPriceNum > priceNum && origPriceNum > 0);
  const badgeWidth = hasOffer ? 350 : 310;
  const badgeHeight = hasOffer ? 130 : 105;
  const badgeX = cardX + cardWidth - badgeWidth - 25;
  const badgeY = cardY + 25;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 12;

  // Price Gradient Fill
  const priceGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeWidth, badgeY + badgeHeight);
  if (templateStyle === 'clean') {
    priceGrad.addColorStop(0, '#16a34a');
    priceGrad.addColorStop(1, '#15803d');
  } else if (templateStyle === 'dark') {
    priceGrad.addColorStop(0, '#eab308');
    priceGrad.addColorStop(1, '#ca8a04');
  } else if (templateStyle === 'rose_gold' || templateStyle === 'pastel_pink') {
    priceGrad.addColorStop(0, '#be185d');
    priceGrad.addColorStop(1, '#9d174d');
  } else if (templateStyle === 'lavender_glam') {
    priceGrad.addColorStop(0, '#7c3aed');
    priceGrad.addColorStop(1, '#6d28d9');
  } else if (templateStyle === 'coral_sunset') {
    priceGrad.addColorStop(0, '#ea580c');
    priceGrad.addColorStop(1, '#c2410c');
  } else {
    priceGrad.addColorStop(0, '#2563eb');
    priceGrad.addColorStop(1, '#4f46e5');
  }
  ctx.fillStyle = priceGrad;
  drawRoundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 28);
  ctx.fill();

  // Glossy highlight border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 28);
  ctx.stroke();

  ctx.shadowColor = 'transparent';

  if (hasOffer) {
    // Top Offer Header + Discount Pill
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    drawRoundedRect(ctx, badgeX + 16, badgeY + 12, 125, 28, 14);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`-${calcDiscount}% OFF`, badgeX + 78, badgeY + 31);

    // Crossed out original price
    if (origFormatted) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = 'bold 19px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(origFormatted, badgeX + badgeWidth - 20, badgeY + 31);

      // Strike-through line on original price
      const origTextW = ctx.measureText(origFormatted).width;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(badgeX + badgeWidth - 20 - origTextW, badgeY + 25);
      ctx.lineTo(badgeX + badgeWidth - 15, badgeY + 25);
      ctx.stroke();
    }

    // Main Final Offer Price (Extra Large 48px font with text shadow)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 48px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(priceFormatted, badgeX + badgeWidth / 2, badgeY + 95);
    ctx.restore();
  } else {
    // Standard Non-Offer Price (Extra Large 48px font)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚡ PRECIO ESPECIAL', badgeX + badgeWidth / 2, badgeY + 30);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 48px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(priceFormatted, badgeX + badgeWidth / 2, badgeY + 82);
    ctx.restore();
  }
  ctx.restore();

  // 5. FOOTER PRODUCT NAME & DETAILS
  ctx.save();
  const footerY = 815;

  // Truncate product name if too long
  let displayTitle = productName.trim();
  if (displayTitle.length > 55) {
    displayTitle = displayTitle.slice(0, 52) + '...';
  }

  ctx.fillStyle = isLightTemplate ? '#0f172a' : '#ffffff';
  ctx.font = '800 34px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(displayTitle, size / 2, footerY + 40);

  // Subtitle / Buy Banner
  ctx.fillStyle = isLightTemplate ? '#475569' : '#94a3b8';
  ctx.font = '600 22px system-ui, -apple-system, sans-serif';
  ctx.fillText('¡Pídelo hoy con entrega rápida y garantía garantizada!', size / 2, footerY + 85);

  // Footer bar with Store Brand & WhatsApp Number
  const rawPhone =
    whatsappNumber ||
    safeLocalStorage.getItem('store_whatsapp_number') ||
    safeLocalStorage.getItem('advisor_whatsapp_number') ||
    '';
  const displayPhone = rawPhone ? formatFlyerPhone(rawPhone) : '';
  const pillY = size - 90;
  const pillH = 54;

  if (displayPhone) {
    const storeText = `🛒 ${storeName}`;
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    const storeTextW = ctx.measureText(storeText).width;
    const storePillW = Math.max(320, storeTextW + 50);

    const waLabel = `WhatsApp: ${displayPhone}`;
    ctx.font = '900 22px system-ui, -apple-system, sans-serif';
    const waTextW = ctx.measureText(waLabel).width;
    const iconSize = 36;
    const paddingLR = 22;
    const iconGap = 12;
    const waPillW = iconSize + iconGap + waTextW + paddingLR * 2;

    const totalW = storePillW + waPillW + 20;
    const startX = (size - totalW) / 2;

    // Left Pill: Store Name
    const storePillBg = isLightTemplate ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.12)';
    ctx.fillStyle = storePillBg;
    drawRoundedRect(ctx, startX, pillY, storePillW, pillH, 27);
    ctx.fill();

    ctx.fillStyle = isLightTemplate ? '#0f172a' : '#ffffff';
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(storeText, startX + storePillW / 2, pillY + 34);

    // Right Pill: Green WhatsApp Badge
    const waX = startX + storePillW + 20;
    const waGrad = ctx.createLinearGradient(waX, pillY, waX + waPillW, pillY + pillH);
    waGrad.addColorStop(0, '#25D366');
    waGrad.addColorStop(1, '#128C7E');
    ctx.fillStyle = waGrad;

    ctx.shadowColor = 'rgba(37, 211, 102, 0.4)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    drawRoundedRect(ctx, waX, pillY, waPillW, pillH, 27);
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // Draw Vector WhatsApp Icon
    const logoCx = waX + paddingLR + iconSize / 2;
    const logoCy = pillY + pillH / 2;
    drawWhatsAppVectorIcon(ctx, logoCx, logoCy, iconSize);

    // Draw WhatsApp Phone Text
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(waLabel, waX + paddingLR + iconSize + iconGap, pillY + 35);
  } else {
    // Single Center Pill for Store Name
    const footerBarBg = isLightTemplate ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.1)';
    ctx.fillStyle = footerBarBg;
    drawRoundedRect(ctx, 100, pillY, size - 200, pillH, 27);
    ctx.fill();

    ctx.fillStyle = isLightTemplate ? '#0f172a' : '#38bdf8';
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🛒 Disponible en ${storeName}`, size / 2, pillY + 34);
  }
  ctx.restore();

  return canvas.toDataURL('image/png', 0.95);
}

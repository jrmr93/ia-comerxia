import * as cheerio from 'cheerio';
import { getAiClient, hasValidAiApiKey } from './gemini-parser.ts';
import { persistImageListLocally, persistImageLocally } from './media-storage.ts';
import { CostOption, ParsedProductResult } from '../types.ts';
import { Type, ThinkingLevel } from '@google/genai';
import { searchProductImages } from './image-search.ts';
import {
  detectTaxStatus,
  calculateTaxAdjustment,
  adjustCostOptionsForTax,
  TaxStatus,
} from '../utils/tax-calculator.ts';

export interface WebProductScrapeResult {
  url: string;
  domain: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  costPrice: number;
  costWithoutTax?: number;
  costWithTax?: number;
  baseCostPrice?: number;
  taxStatus?: 'INCLUDED' | 'PLUS_TAX' | 'NOT_SPECIFIED';
  taxPercent?: number;
  costOptions: CostOption[];
  profitMarginPercent: number;
  salePrice: number;
  stock: number;
  description: string;
  tags: string[];
  attributes: Record<string, any>;
  images: string[];
  primaryImage: string | null;
  supplierNotes?: string;
  confidenceScore: number;
}

/**
 * Cleans tracking, analytics and affiliate parameters from an e-commerce URL.
 */
export function cleanProductUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'ref', 'ref_', 'spm', 'scm', 'pdp_npi',
      'aff_fcid', 'aff_fsk', 'aff_platform', 'sk', 'ws_ab_test',
      'algo_pvid', 'algo_exp_id', 'btsid', 'source', 'tag', 'linkCode',
      'pf_rd_r', 'pf_rd_p', 'pd_rd_r', 'pd_rd_w', 'pd_rd_wg', 'qid', 'sr'
    ];
    for (const p of trackingParams) {
      u.searchParams.delete(p);
    }
    // Also strip any param starting with utm_ or tracking prefixes
    for (const key of Array.from(u.searchParams.keys())) {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || lower.startsWith('fb_') || lower.startsWith('_ga')) {
        u.searchParams.delete(key);
      }
    }
    return u.href;
  } catch {
    return urlStr;
  }
}

/**
 * Strips common marketplace suffixes and store branding from product titles.
 */
export function cleanProductTitle(rawTitle: string): string {
  if (!rawTitle || typeof rawTitle !== 'string') return '';
  return rawTitle
    .replace(/\s*[-–|•:]\s*(Amazon(?:\.com)?|Mercado\s*Libre|eBay|Alibaba|AliExpress|Shein|Walmart|Falabella|Éxito|Ripley|Linio|Tienda\s*Online|Envío\s*Gratis|Comprar|Precio).*$/i, '')
    .replace(/^Comprar\s+/i, '')
    .trim();
}

/**
 * Infers category from product title and text keywords with high accuracy.
 */
export function inferCategoryFromText(text: string, defaultCategory: string = 'General'): string {
  const lower = (text || '').toLowerCase();
  if (/\b(zapato|zapatos|tenis|zapatilla|zapatillas|bota|botas|sandalia|sandalias|tacon|tacones|mocasines|sneakers?|calzado)\b/i.test(lower)) {
    return 'Calzado';
  }
  if (/\b(camisa|camisetas?|polo|pantalon|pantalones|jeans?|short|shorts?|vestido|vestidos?|falda|faldas?|chaqueta|chaquetas?|abrigo|buzo|chompa|ropa|moda|traje|ropa interior|leggings?)\b/i.test(lower)) {
    return 'Ropa y Moda';
  }
  if (/\b(celular|celulares|smartphone|smartphones|iphone|xiaomi|samsung galaxy|audifono|audifonos|auricular|auriculares|airpods|smartwatch|reloj inteligente|reloj|cargador|cable usb|power bank|bluetooth|parlante|altavoz)\b/i.test(lower)) {
    return 'Electrónica y Celulares';
  }
  if (/\b(laptop|portatil|computadora|computador|pc|teclado|mouse|monitor|disco duro|ssd|memoria ram|router|impresora|procesador|tarjeta de video|gamer)\b/i.test(lower)) {
    return 'Computación y Accesorios';
  }
  if (/\b(cocina|sarten|olla|licuadora|cafetera|cuchillo|vajilla|vaso|taza|mesa|silla|cama|colchon|sabana|almohada|toalla|lampara|organizador|freidora|aspiradora|hogar)\b/i.test(lower)) {
    return 'Hogar y Cocina';
  }
  if (/\b(perfume|colonia|crema|serum|facial|maquillaje|labial|shampoo|acondicionador|jabon|afeitadora|skincare|bloqueador|cosmeticos?|belleza)\b/i.test(lower)) {
    return 'Belleza y Cuidado Personal';
  }
  if (/\b(gym|fitness|mancuerna|pesas?|yoga|bicicleta|termo|shaker|balon|pelota|deporte|entrenamiento|proteina|faja)\b/i.test(lower)) {
    return 'Deportes y Fitness';
  }
  if (/\b(juguete|juguetes|muñeca|muñeco|carro a control|lego|peluche|bebe|infantil|niño|niña)\b/i.test(lower)) {
    return 'Juguetes y Niños';
  }
  if (/\b(taladro|destornillador|llave inglesa|martillo|tornillos?|cinta metrica|herramienta|herramientas|ferreteria|candado)\b/i.test(lower)) {
    return 'Ferretería y Herramientas';
  }
  return defaultCategory;
}

/**
 * Detects and extracts the first valid HTTP/HTTPS URL from a string and cleans tracking params.
 */
export function extractProductUrlFromText(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  const urlRegex = /(https?:\/\/[^\s<>"'{}|\\^`]+)/i;
  const match = trimmed.match(urlRegex);
  if (!match) return null;

  try {
    const parsed = new URL(match[1]);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      // Filter out obvious non-product domains (like telegram API internal links)
      if (parsed.hostname.includes('api.telegram.org')) return null;
      return cleanProductUrl(parsed.href);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Fetches HTML from a webpage with standard browser headers and timeout handling.
 */
export async function fetchWebpageHtml(url: string, timeoutMs: number = 8500): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'max-age=0',
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`[WebScraper] HTTP ${response.status} fetching URL: ${url}`);
      return null;
    }

    const html = await response.text();
    return { html, finalUrl: response.url || url };
  } catch (err: any) {
    console.error(`[WebScraper] Error fetching webpage ${url}:`, err.message || err);
    return null;
  }
}

/**
 * Extracts raw metadata and candidate product images using Cheerio.
 */
export function extractRawMetadata(html: string, baseUrl: string) {
  const $ = cheerio.load(html);

  // 1. Open Graph metadata
  const ogTitle = $('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content') || '';
  const ogDescription =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    $('meta[name="twitter:description"]').attr('content') ||
    '';
  const ogImage =
    $('meta[property="og:image:secure_url"]').attr('content') ||
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    '';
  const ogPrice =
    $('meta[property="product:price:amount"]').attr('content') ||
    $('meta[property="og:price:amount"]').attr('content') ||
    '';
  const ogCurrency =
    $('meta[property="product:price:currency"]').attr('content') ||
    $('meta[property="og:price:currency"]').attr('content') ||
    '';
  const ogBrand =
    $('meta[property="product:brand"]').attr('content') ||
    $('meta[property="og:brand"]').attr('content') ||
    '';

  // 2. Schema.org JSON-LD
  let jsonLdProduct: any = null;
  $('script[type="application/ld+json"]').each((_, elem) => {
    try {
      const content = $(elem).html();
      if (!content) return;
      const parsed = JSON.parse(content);

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item?.['@type'] === 'Product' || item?.type === 'Product') {
            jsonLdProduct = item;
            break;
          }
        }
      } else if (parsed?.['@graph'] && Array.isArray(parsed['@graph'])) {
        for (const item of parsed['@graph']) {
          if (item?.['@type'] === 'Product' || item?.type === 'Product') {
            jsonLdProduct = item;
            break;
          }
        }
      } else if (parsed?.['@type'] === 'Product' || parsed?.type === 'Product') {
        jsonLdProduct = parsed;
      }
    } catch {
      // Ignore JSON parse errors in invalid scripts
    }
  });

  // 3. Fallback title & headings
  const pageTitle = $('title').text().trim() || '';
  const h1 = $('h1').first().text().trim() || '';

  // 4. Candidate Product Images (Comprehensive extraction for all modern e-commerce sites)
  const rawImageUrls = new Set<string>();

  const addValidUrl = (urlStr: string | null | undefined) => {
    if (!urlStr || typeof urlStr !== 'string') return;
    let trimmed = urlStr.trim().replace(/^["']|["']$/g, '');
    if (!trimmed || trimmed.startsWith('data:image/svg') || trimmed.length < 10) return;

    // Skip tiny icons, badges, trackers, logos, payment methods
    const lower = trimmed.toLowerCase();
    if (
      lower.includes('1x1') ||
      lower.includes('pixel') ||
      lower.includes('tracking') ||
      lower.includes('favicon') ||
      lower.includes('sprite') ||
      lower.includes('avatar') ||
      lower.includes('spinner') ||
      lower.includes('loading') ||
      lower.includes('payment') ||
      lower.includes('visa') ||
      lower.includes('mastercard') ||
      lower.includes('paypal') ||
      lower.includes('badge') ||
      lower.includes('star-') ||
      lower.includes('rating') ||
      lower.includes('placeholder')
    ) {
      return;
    }

    try {
      if (trimmed.startsWith('//')) {
        trimmed = `https:${trimmed}`;
      }
      const absoluteUrl = new URL(trimmed, baseUrl).href;
      rawImageUrls.add(absoluteUrl);
    } catch {}
  };

  // Open Graph & Twitter & Meta tags
  addValidUrl(ogImage);
  addValidUrl($('meta[property="og:image:url"]').attr('content'));
  addValidUrl($('meta[name="twitter:image:src"]').attr('content'));
  addValidUrl($('meta[itemprop="image"]').attr('content'));
  addValidUrl($('link[rel="image_src"]').attr('href'));

  // Schema.org JSON-LD images (deep search in all types)
  const extractImagesFromJson = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(extractImagesFromJson);
      return;
    }
    if (obj.image) {
      if (typeof obj.image === 'string') addValidUrl(obj.image);
      else if (Array.isArray(obj.image)) {
        obj.image.forEach((img: any) => {
          if (typeof img === 'string') addValidUrl(img);
          else if (img?.url) addValidUrl(img.url);
          else if (img?.contentUrl) addValidUrl(img.contentUrl);
        });
      } else if (obj.image.url) addValidUrl(obj.image.url);
      else if (obj.image.contentUrl) addValidUrl(obj.image.contentUrl);
    }
    if (obj.photos) {
      if (Array.isArray(obj.photos)) obj.photos.forEach(extractImagesFromJson);
      else extractImagesFromJson(obj.photos);
    }
    if (obj.offers) {
      if (Array.isArray(obj.offers)) obj.offers.forEach(extractImagesFromJson);
      else extractImagesFromJson(obj.offers);
    }
  };

  if (jsonLdProduct) {
    extractImagesFromJson(jsonLdProduct);
  }

  // Look for Amazon dynamic images (data-a-dynamic-image)
  $('img[data-a-dynamic-image], [data-a-dynamic-image]').each((_, el) => {
    const attr = $(el).attr('data-a-dynamic-image');
    if (attr) {
      try {
        const obj = JSON.parse(attr);
        Object.keys(obj).forEach((imgUrl) => addValidUrl(imgUrl));
      } catch {}
    }
  });

  // Look for data-old-hires attribute
  $('[data-old-hires]').each((_, el) => {
    addValidUrl($(el).attr('data-old-hires'));
  });

  // Look for srcset and data-srcset attributes (parse highest resolution candidate)
  $('img[srcset], img[data-srcset], source[srcset]').each((_, el) => {
    const srcset = $(el).attr('data-srcset') || $(el).attr('srcset');
    if (srcset) {
      const parts = srcset.split(',');
      // Sort parts by pixel density or width if available
      for (let i = parts.length - 1; i >= 0; i--) {
        const candidate = parts[i]?.trim().split(/\s+/)[0];
        if (candidate && !candidate.startsWith('data:')) {
          addValidUrl(candidate);
          break;
        }
      }
    }
  });

  // Look for gallery and high-resolution product images in HTML elements & zoom containers
  $('img, a.woocommerce-product-gallery__image, a[data-fancybox], a[data-lightbox], div[data-image]').each((_, el) => {
    const $el = $(el);
    const candidateAttrs = [
      $el.attr('data-zoom-image'),
      $el.attr('data-large-image'),
      $el.attr('data-large_image'),
      $el.attr('data-high-res-src'),
      $el.attr('data-high-res-image'),
      $el.attr('data-hires'),
      $el.attr('data-full-image'),
      $el.attr('data-full-size'),
      $el.attr('data-zoom'),
      $el.attr('data-src'),
      $el.attr('data-lazy-src'),
      $el.attr('data-lazy'),
      $el.attr('data-original'),
      $el.attr('data-carousel-src'),
      $el.attr('data-splide-lazy'),
      $el.attr('data-swiper-src'),
      $el.attr('data-image'),
      $el.attr('href'),
      $el.attr('src'),
    ];

    for (const src of candidateAttrs) {
      if (src && typeof src === 'string') {
        const clean = src.trim();
        if (/\.(jpg|jpeg|png|webp|avif)(?:\?.*)?$/i.test(clean) || clean.includes('/images/') || clean.includes('/products/')) {
          addValidUrl(clean);
        }
      }
    }
  });

  // Regex scan for Amazon high-resolution product images in scripts/page text
  const amazonImgMatches = html.match(/https:\/\/m\.media-amazon\.com\/images\/I\/[a-zA-Z0-9_\-\.\%]+\.(?:jpg|jpeg|png|webp)/gi);
  if (amazonImgMatches) {
    for (const m of amazonImgMatches) {
      addValidUrl(m);
    }
  }

  // Regex scan for Amazon hiRes/large JSON properties in inline scripts
  const amazonScriptMatches = html.match(/"(?:hiRes|large|mainUrl)"\s*:\s*"(https:\/\/[^"]+)"/gi);
  if (amazonScriptMatches) {
    for (const m of amazonScriptMatches) {
      const uMatch = m.match(/"(https:\/\/[^"]+)"/);
      if (uMatch && uMatch[1]) addValidUrl(uMatch[1]);
    }
  }

  // Regex scan for MercadoLibre product images (both webp and jpg)
  const mlImgMatches = html.match(/https:\/\/http2\.mlstatic\.com\/D_NQ_NP_[a-zA-Z0-9_\-\.]+\.(?:webp|jpg|jpeg|png)/gi);
  if (mlImgMatches) {
    for (const m of mlImgMatches) {
      addValidUrl(m);
    }
  }

  // Regex scan for Shopify CDN images
  const shopifyMatches = html.match(/https?:\/\/[^\s"'<>]+\/cdn\/shop\/(?:files|products)\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|avif)/gi);
  if (shopifyMatches) {
    for (const m of shopifyMatches) {
      addValidUrl(m);
    }
  }

  // Regex scan for other major retailer CDNs (AliExpress, Shein, Walmart, Falabella, VTEX)
  const cdnMatches = html.match(/https?:\/\/[^\s"'<>]+\.(?:alicdn|shein|walmartimages|falabella|vtexassets|myvtex)\.com\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|avif)/gi);
  if (cdnMatches) {
    for (const m of cdnMatches) {
      addValidUrl(m);
    }
  }

  // Deep scan of inline scripts for escaped image URLs (e.g. Next.js, Nuxt, React state)
  const scriptTags = $('script:not([src])').text();
  if (scriptTags) {
    const unescapedScript = scriptTags.replace(/\\\//g, '/');
    const genericMatches = unescapedScript.match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^\s"'<>]*)?/gi);
    if (genericMatches) {
      for (const m of genericMatches.slice(0, 50)) {
        if (!m.includes('logo') && !m.includes('icon') && !m.includes('avatar') && !m.includes('banner')) {
          addValidUrl(m);
        }
      }
    }
  }

  // 5. Clean page text (removing non-content elements)
  $('script, style, noscript, svg, iframe, nav, header, footer, [role="navigation"]').remove();
  const bodyText = $('body')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);

  return {
    ogTitle,
    ogDescription,
    ogImage,
    ogPrice,
    ogCurrency,
    ogBrand,
    pageTitle,
    h1,
    jsonLdProduct,
    candidateImages: Array.from(rawImageUrls).slice(0, 5),
    bodyText,
  };
}

/**
 * Fast-path extraction using high-fidelity Schema.org JSON-LD and OpenGraph metadata.
 * Returns product immediately in <100ms when page structure provides clean product data.
 */
export function tryExtractFastPathProduct(
  url: string,
  rawMeta: ReturnType<typeof extractRawMetadata>,
  defaultMarginPercent: number = 30,
  currency: string = 'USD'
): WebProductScrapeResult | null {
  const parsedUrl = new URL(url);
  const domain = parsedUrl.hostname.replace(/^www\./, '');

  let name = '';
  let costPrice = 0;
  let description = '';
  let sku = 'AUTO';
  let barcode: string | undefined = undefined;
  let category = 'General';
  let extractedBrand = rawMeta.ogBrand || '';

  // 1. Check Schema.org JSON-LD
  if (rawMeta.jsonLdProduct) {
    const p = rawMeta.jsonLdProduct;
    if (typeof p.name === 'string' && p.name.trim().length > 3) {
      name = cleanProductTitle(p.name);
    }
    if (typeof p.description === 'string' && p.description.trim().length > 5) {
      description = p.description.trim();
    }
    if (p.sku && typeof p.sku === 'string' && p.sku.length > 2) {
      sku = p.sku.trim();
    } else if (p.mpn && typeof p.mpn === 'string' && p.mpn.length > 2) {
      sku = p.mpn.trim();
    }
    if (p.gtin13 || p.gtin || p.isbn) {
      barcode = String(p.gtin13 || p.gtin || p.isbn).trim();
    }
    if (p.brand) {
      extractedBrand = typeof p.brand === 'string' ? p.brand : p.brand?.name || extractedBrand;
    }

    // Offers price extraction
    if (p.offers) {
      const offersArr = Array.isArray(p.offers) ? p.offers : [p.offers];
      for (const off of offersArr) {
        const rawVal = off.price ?? off.lowPrice;
        if (rawVal !== undefined && rawVal !== null) {
          const num = parseFloat(String(rawVal).replace(',', '.'));
          if (!isNaN(num) && num > 0) {
            costPrice = num;
            break;
          }
        }
      }
    }
    if (p.category && typeof p.category === 'string') {
      category = inferCategoryFromText(p.category, p.category);
    }
  }

  // 2. OpenGraph / Meta tag fallback if name or price were missing in JSON-LD
  if (!name) {
    name = cleanProductTitle(rawMeta.ogTitle || rawMeta.h1 || rawMeta.pageTitle);
  }
  if (!description) {
    description = rawMeta.ogDescription || `Producto obtenido desde ${url}`;
  }
  if (costPrice <= 0 && rawMeta.ogPrice) {
    const num = parseFloat(String(rawMeta.ogPrice).replace(',', '.'));
    if (!isNaN(num) && num > 0) {
      costPrice = num;
    }
  }

  // Ensure candidate images list has at least ogImage if empty
  const candidateImages = rawMeta.candidateImages.slice(0, 5);
  if (candidateImages.length === 0 && rawMeta.ogImage) {
    candidateImages.push(rawMeta.ogImage);
  }

  // Fast-Path is accepted if we have a valid title (> 3 chars), valid cost (> 0) and at least 1 image
  if (name && name.length >= 3 && costPrice > 0 && candidateImages.length > 0) {
    category = inferCategoryFromText(`${name} ${description} ${category}`, category);
    const salePrice = Math.round(costPrice * (1 + defaultMarginPercent / 100) * 100) / 100;
    const costOptions: CostOption[] = [
      { label: `Costo Web (${currency} ${costPrice.toFixed(2)})`, price: costPrice },
    ];

    return {
      url,
      domain,
      name,
      sku,
      barcode,
      category,
      costPrice,
      costOptions,
      profitMarginPercent: defaultMarginPercent,
      salePrice,
      stock: 10,
      description,
      tags: ['web', domain.split('.')[0], category.toLowerCase()],
      attributes: {
        sourceUrl: url,
        sourceDomain: domain,
        brand: extractedBrand || undefined,
        fastPathExtracted: true,
      },
      images: candidateImages,
      primaryImage: candidateImages[0] || null,
      supplierNotes: `Importado de ${domain} (Extracción Rápida)`,
      confidenceScore: 95,
    };
  }

  return null;
}

/**
 * Uses Google Gemini AI to analyze extracted webpage text, OpenGraph, JSON-LD,
 * and select the best product title, price, description, attributes and images.
 */
export async function parseWebProductWithGemini(
  url: string,
  rawMeta: ReturnType<typeof extractRawMetadata>,
  defaultMarginPercent: number = 30,
  currency: string = 'USD'
): Promise<WebProductScrapeResult> {
  const parsedUrl = new URL(url);
  const domain = parsedUrl.hostname.replace(/^www\./, '');

  // Prepare prompt with metadata
  const prompt = `Eres un asistente experto en comercio electrónico y extracción de inventario.
He recibido una URL de un producto en una tienda online:
URL: ${url}
Dominio: ${domain}

Metadatos extraídos de la página web:
- Título OpenGraph / Twitter: ${rawMeta.ogTitle || '(No encontrado)'}
- Título <title> HTML: ${rawMeta.pageTitle || '(No encontrado)'}
- Título <h1>: ${rawMeta.h1 || '(No encontrado)'}
- Descripción OpenGraph: ${rawMeta.ogDescription || '(No encontrada)'}
- Precio OpenGraph: ${rawMeta.ogPrice || '(No encontrado)'} ${rawMeta.ogCurrency || ''}
- Marca detectada: ${rawMeta.ogBrand || '(No encontrada)'}
${
  rawMeta.jsonLdProduct
    ? `- Datos estructurados Schema.org JSON-LD del Producto:\n${JSON.stringify(rawMeta.jsonLdProduct, null, 2).slice(0, 2000)}`
    : ''
}

Candidatos de imágenes encontrados en la página:
${JSON.stringify(rawMeta.candidateImages, null, 2)}

Texto principal del contenido de la página:
"""
${rawMeta.bodyText.slice(0, 3000)}
"""

INSTRUCCIONES CRÍTICAS:
1. "name": Genera un título limpio, claro, comercial y profesional del producto (elimina sufijos como " | Amazon", " - Mercado Libre", " - Envío Gratis", etc.).
2. "sku": Código de modelo o SKU del producto si está visible en la página (o el código de fabricante/ASIN). Si no existe, pon "AUTO".
3. "barcode": Código de barras (EAN-13, UPC, GTIN) si viene en el JSON-LD o texto. Si no, "".
4. "category": Clasifica en una de estas categorías: "Calzado", "Ropa y Moda", "Electrónica y Celulares", "Computación y Accesorios", "Hogar y Cocina", "Belleza y Cuidado Personal", "Deportes y Fitness", "Juguetes y Niños", "Ferretería y Herramientas", o "General".
5. "costPrice": El precio numérico del producto encontrado en la página web (en ${currency}). Si hay precio de oferta y precio regular tachado, usa el precio de oferta actual. Si no se puede determinar ningún precio con certeza, pon 15.00.
6. "costOptions": Si la página muestra opciones de precios por volumen, por mayor, afiliado o variantes con precio, extráelas en [{ "label": string, "price": number }]. Si solo hay un precio, incluye esa única opción.
7. "profitMarginPercent": Margen de ganancia comercial. Usa ${defaultMarginPercent}% por defecto.
8. "salePrice": Precio de venta al público en tu tienda. Calcúlalo como costPrice * (1 + profitMarginPercent / 100).
9. "stock": Cantidad de stock indicada (si no se menciona o está en stock, pon 10).
10. "description": Redacta una descripción atractiva, estructurada con viñetas destacando características principales, beneficios, especificaciones técnicas y materiales.
11. "tags": 3 a 7 etiquetas de búsqueda (ej. ["reloj", "smartwatch", "tecnologia"]).
12. "attributes": Objeto JSON con detalles específicos extraídos (ej. marca, modelo, colores, material, conectividad, dimensiones).
13. "selectedImages": Selecciona de la lista de candidatos de imágenes las MEJORES fotos reales y de alta resolución del producto (máximo 6 fotos). EXCLUYE logos, iconos de tarjeta de crédito, imágenes de testimonios o banners genéricos. Si la lista contiene la foto principal de OpenGraph o JSON-LD de buena calidad, colócala de primera.`;

  // If no valid Gemini API key is configured, use high-speed heuristic extraction directly
  if (!hasValidAiApiKey()) {
    return await extractHeuristicWebProduct(url, rawMeta, defaultMarginPercent, currency);
  }

  try {
    const ai = getAiClient();
    const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-flash-latest'];

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [prompt],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                sku: { type: Type.STRING },
                barcode: { type: Type.STRING },
                category: { type: Type.STRING },
                costPrice: { type: Type.NUMBER },
                costOptions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      price: { type: Type.NUMBER },
                    },
                    required: ['label', 'price'],
                  },
                },
                profitMarginPercent: { type: Type.NUMBER },
                salePrice: { type: Type.NUMBER },
                stock: { type: Type.INTEGER },
                description: { type: Type.STRING },
                tags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                attributes: { type: Type.OBJECT },
                selectedImages: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                supplierNotes: { type: Type.STRING },
                confidenceScore: { type: Type.INTEGER },
              },
              required: [
                'name',
                'sku',
                'category',
                'costPrice',
                'salePrice',
                'stock',
                'description',
                'tags',
                'selectedImages',
              ],
            },
            temperature: 0.1,
          },
        });

        const text = response.text;
        if (!text) continue;

        const parsed = JSON.parse(text);

        // Fallback images if Gemini returned none
        let imagesToUse = Array.isArray(parsed.selectedImages) && parsed.selectedImages.length > 0
          ? parsed.selectedImages
          : rawMeta.candidateImages.slice(0, 4);

        if (imagesToUse.length === 0 && rawMeta.ogImage) {
          imagesToUse = [rawMeta.ogImage];
        }

        const cost = Math.max(0.01, Number(parsed.costPrice) || 15.0);
        const margin = Math.max(1, Number(parsed.profitMarginPercent) || defaultMarginPercent || 30);
        const sale = Math.max(
          cost,
          Number(parsed.salePrice) || Math.round(cost * (1 + margin / 100) * 100) / 100
        );

        let costOptions: CostOption[] = [];
        if (Array.isArray(parsed.costOptions) && parsed.costOptions.length > 0) {
          costOptions = parsed.costOptions.map((o: any) => ({
            label: String(o.label || 'Opción'),
            price: Number(o.price) || cost,
          }));
        } else {
          costOptions = [{ label: `Costo Web (${currency} ${cost.toFixed(2)})`, price: cost }];
        }

        return {
          url,
          domain,
          name: parsed.name || rawMeta.ogTitle || rawMeta.pageTitle || 'Producto Importado de Web',
          sku: parsed.sku && parsed.sku !== 'AUTO' ? parsed.sku : 'AUTO',
          barcode: parsed.barcode || undefined,
          category: parsed.category || 'General',
          costPrice: cost,
          costOptions,
          profitMarginPercent: margin,
          salePrice: sale,
          stock: Math.max(1, Number(parsed.stock) || 10),
          description: parsed.description || rawMeta.ogDescription || 'Producto importado desde enlace web.',
          tags: Array.isArray(parsed.tags) ? parsed.tags : ['web', 'importado'],
          attributes: {
            ...(parsed.attributes || {}),
            sourceUrl: url,
            sourceDomain: domain,
          },
          images: imagesToUse,
          primaryImage: imagesToUse[0] || null,
          supplierNotes: parsed.supplierNotes || `Importado desde ${domain} (${url})`,
          confidenceScore: Number(parsed.confidenceScore) || 90,
        };
      } catch (genErr: any) {
        const errMsg = String(genErr?.message || genErr);
        if (
          errMsg.includes('401') ||
          errMsg.includes('UNAUTHENTICATED') ||
          errMsg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') ||
          errMsg.includes('API_KEY_INVALID')
        ) {
          break;
        }
        continue;
      }
    }
  } catch {
    // Fallback directly to heuristic extraction without noisy error logs
  }

  // Heuristic Fallback if Gemini failed or key missing
  return await extractHeuristicWebProduct(url, rawMeta, defaultMarginPercent, currency);
}

/**
 * Extracts candidate product name from URL slug if site blocks robot fetching.
 */
function extractProductNameFromUrlSlug(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split('/').filter(Boolean);
    for (const part of parts) {
      if (part.length > 4 && !['dp', 'product', 'p', 'item', 'itm', 'gp', 'buy', 'es', 'en', 'art'].includes(part.toLowerCase())) {
        const decoded = decodeURIComponent(part)
          .replace(/[-_.]+/g, ' ')
          .replace(/\b(html|htm|php)\b/gi, '')
          .trim();
        if (decoded.length > 4 && !/^[0-9a-f]{8,}$/i.test(decoded)) {
          return decoded;
        }
      }
    }
  } catch {}
  return 'Producto Web';
}

/**
 * Heuristic extraction without AI if AI is unavailable or offline.
 */
async function extractHeuristicWebProduct(
  url: string,
  rawMeta: ReturnType<typeof extractRawMetadata>,
  defaultMarginPercent: number = 30,
  currency: string = 'USD'
): Promise<WebProductScrapeResult> {
  const parsedUrl = new URL(url);
  const domain = parsedUrl.hostname.replace(/^www\./, '');

  let name = rawMeta.ogTitle || rawMeta.h1 || rawMeta.pageTitle || extractProductNameFromUrlSlug(url);
  // Remove domain suffixes
  name = name.replace(/\s*[-–|•]\s*(Amazon|Mercado\s*Libre|eBay|Alibaba|AliExpress|Shein|Walmart|Falabella|Éxito|Tienda).*$/i, '').trim();

  let costPrice = 15.0;
  if (rawMeta.ogPrice) {
    const p = parseFloat(rawMeta.ogPrice.replace(',', '.'));
    if (!isNaN(p) && p > 0) costPrice = p;
  } else if (rawMeta.jsonLdProduct?.offers) {
    const offer = Array.isArray(rawMeta.jsonLdProduct.offers)
      ? rawMeta.jsonLdProduct.offers[0]
      : rawMeta.jsonLdProduct.offers;
    const p = parseFloat(String(offer?.price || '').replace(',', '.'));
    if (!isNaN(p) && p > 0) costPrice = p;
  }

  const salePrice = Math.round(costPrice * (1 + defaultMarginPercent / 100) * 100) / 100;
  let images = rawMeta.candidateImages.slice(0, 6);
  if (images.length === 0 && rawMeta.ogImage) images.push(rawMeta.ogImage);

  // If no images found on page, use real product image search
  if (images.length === 0) {
    try {
      console.log(`[WebScraper] No candidate images on page, searching images for "${name}"...`);
      const searchedImages = await searchProductImages(name, 6);
      if (searchedImages && searchedImages.length > 0) {
        images = searchedImages.map((img) => img.url).filter(Boolean);
      }
    } catch (err) {
      console.warn('[WebScraper] searchProductImages error in heuristic:', err);
    }
  }

  return {
    url,
    domain,
    name,
    sku: 'AUTO',
    barcode: rawMeta.jsonLdProduct?.gtin13 || rawMeta.jsonLdProduct?.gtin || undefined,
    category: 'General',
    costPrice,
    costOptions: [{ label: `Costo Web (${currency} ${costPrice.toFixed(2)})`, price: costPrice }],
    profitMarginPercent: defaultMarginPercent,
    salePrice,
    stock: 10,
    description: rawMeta.ogDescription || `Producto obtenido desde ${url}`,
    tags: ['web', domain.split('.')[0]],
    attributes: {
      sourceUrl: url,
      sourceDomain: domain,
    },
    images,
    primaryImage: images[0] || null,
    supplierNotes: `Importado de ${domain}`,
    confidenceScore: 75,
  };
}

/**
 * Complete high-level pipeline:
 * 1. Fetches webpage HTML (with modern browser emulation headers)
 * 2. Extracts OpenGraph, JSON-LD, microdata and dynamic image galleries
 * 3. Falls back to searchProductImages if images cannot be extracted directly
 * 4. Applies IVA interpretation ("incluye IVA" vs "más IVA" / "+ IVA") based on system taxPercent
 * 5. Downloads & persists images into local /uploads/
 * 6. Returns ready-to-save product object with local URLs
 */
export async function scrapeAndProcessWebProduct(
  url: string,
  defaultMarginPercent: number = 30,
  currency: string = 'USD',
  taxPercent: number = 15,
  accompanyingText: string = ''
): Promise<WebProductScrapeResult | null> {
  const fetchResult = await fetchWebpageHtml(url);

  let rawMeta: ReturnType<typeof extractRawMetadata> | null = null;
  let parsedProduct: WebProductScrapeResult;

  if (fetchResult) {
    rawMeta = extractRawMetadata(fetchResult.html, fetchResult.finalUrl);
    
    // 1. Fast-Path: Try instant JSON-LD / OpenGraph structured extraction (<100ms)
    const fastPath = tryExtractFastPathProduct(
      fetchResult.finalUrl,
      rawMeta,
      defaultMarginPercent,
      currency
    );

    if (fastPath) {
      console.log(`[WebScraper] Fast-Path successful for "${fastPath.name}" (Cost: ${currency} ${fastPath.costPrice.toFixed(2)}) without AI latency.`);
      parsedProduct = fastPath;
    } else {
      console.log(`[WebScraper] Structured data incomplete, calling Gemini AI for intelligent extraction...`);
      parsedProduct = await parseWebProductWithGemini(
        fetchResult.finalUrl,
        rawMeta,
        defaultMarginPercent,
        currency
      );
    }
  } else {
    // If the server blocked request (e.g. anti-scraping 503/403), fallback gracefully
    console.warn(`[WebScraper] Could not fetch webpage ${url} directly, creating fallback from URL slug.`);
    const fallbackName = extractProductNameFromUrlSlug(url);
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname.replace(/^www\./, '');
    const cost = 15.0;
    const sale = Math.round(cost * (1 + defaultMarginPercent / 100) * 100) / 100;

    parsedProduct = {
      url,
      domain,
      name: fallbackName,
      sku: 'AUTO',
      category: 'General',
      costPrice: cost,
      costOptions: [{ label: `Costo Web (${currency} ${cost.toFixed(2)})`, price: cost }],
      profitMarginPercent: defaultMarginPercent,
      salePrice: sale,
      stock: 10,
      description: `Producto obtenido desde ${url}`,
      tags: ['web', domain.split('.')[0]],
      attributes: { sourceUrl: url, sourceDomain: domain },
      images: [],
      primaryImage: null,
      supplierNotes: `Importado de ${domain}`,
      confidenceScore: 60,
    };
  }

  // Ensure images are found even if page hid them behind complex scripts
  if (!parsedProduct.images || parsedProduct.images.length === 0) {
    try {
      console.log(`[WebScraper] Product "${parsedProduct.name}" has 0 images. Searching images online...`);
      const searchImgs = await searchProductImages(parsedProduct.name, 6);
      if (searchImgs && searchImgs.length > 0) {
        const mappedUrls = searchImgs.map((img) => img.url).filter(Boolean);
        parsedProduct.images = mappedUrls;
        parsedProduct.primaryImage = mappedUrls[0] || null;
      }
    } catch (imgSearchErr) {
      console.warn('[WebScraper] Image search fallback error:', imgSearchErr);
    }
  }

  // Check if accompanying text specifies an explicit supplier cost price
  if (accompanyingText) {
    const explicitPriceMatch = accompanyingText.match(/(?:costo|precio|valor|c\/u)?\s*[:$]?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:usd|\$|€|pesos)?/i);
    if (explicitPriceMatch && explicitPriceMatch[1]) {
      const explicitVal = parseFloat(explicitPriceMatch[1].replace(',', '.'));
      if (!isNaN(explicitVal) && explicitVal > 0) {
        parsedProduct.costPrice = explicitVal;
        parsedProduct.costOptions = [{ label: `Costo Mensaje (${currency} ${explicitVal.toFixed(2)})`, price: explicitVal }];
      }
    }
  }

  // -------------------------------------------------------------
  // IVA / TAX INTERPRETATION:
  // "incluye iva" -> Already final cost
  // "más iva" / "+ iva" / "sin iva" / "no incluye iva" -> Increment cost by system taxPercent
  // -------------------------------------------------------------
  const combinedContextText = `${accompanyingText || ''} ${rawMeta?.bodyText || ''} ${rawMeta?.ogDescription || ''} ${parsedProduct.description || ''}`;
  const detectedTaxStatus = detectTaxStatus(combinedContextText);

  const effectiveTaxPercent = typeof taxPercent === 'number' && taxPercent >= 0 ? taxPercent : 15;
  const taxAdjustment = calculateTaxAdjustment({
    costPrice: parsedProduct.costPrice,
    taxStatus: detectedTaxStatus,
    taxPercent: effectiveTaxPercent,
    profitMarginPercent: parsedProduct.profitMarginPercent || defaultMarginPercent,
  });

  parsedProduct.taxStatus = taxAdjustment.taxStatus;
  parsedProduct.taxPercent = taxAdjustment.taxPercent;
  parsedProduct.baseCostPrice = taxAdjustment.baseCostPrice;
  parsedProduct.costWithoutTax = taxAdjustment.baseCostPrice;
  parsedProduct.costWithTax = taxAdjustment.costPrice;
  parsedProduct.costPrice = taxAdjustment.costPrice;
  parsedProduct.salePrice = taxAdjustment.salePrice;
  parsedProduct.costOptions = adjustCostOptionsForTax(
    parsedProduct.costOptions,
    taxAdjustment.taxStatus,
    taxAdjustment.taxPercent
  );

  parsedProduct.attributes = {
    ...parsedProduct.attributes,
    taxStatus: taxAdjustment.taxStatus,
    taxPercent: taxAdjustment.taxPercent,
    baseCostPrice: taxAdjustment.baseCostPrice,
    costPriceWithTax: taxAdjustment.costPrice,
    taxAmount: taxAdjustment.taxAmount,
    iva:
      taxAdjustment.taxStatus === 'PLUS_TAX'
        ? `+${taxAdjustment.taxPercent}% aplicado (Base: $${taxAdjustment.baseCostPrice.toFixed(2)} ➔ Con IVA: $${taxAdjustment.costPrice.toFixed(2)})`
        : taxAdjustment.taxStatus === 'INCLUDED'
        ? `Incluido en el costo ($${taxAdjustment.baseCostPrice.toFixed(2)} sin IVA)`
        : `Asumido con IVA ($${taxAdjustment.baseCostPrice.toFixed(2)} sin IVA)`,
  };

  // Download and persist all found images locally into /uploads/ (capped at 4 best images for speed and disk space)
  const imagesToPersist = parsedProduct.images.slice(0, 4);
  if (imagesToPersist.length > 0) {
    try {
      console.log(`[WebScraper] Downloading ${imagesToPersist.length} high-resolution images from web page...`);
      const localImageUrls = await persistImageListLocally(imagesToPersist);
      const validLocalUrls = localImageUrls.filter(Boolean);

      // Check if at least one image was successfully saved locally into /uploads/
      const hasLocallySaved = validLocalUrls.some((u) => u.startsWith('/uploads/'));

      if (validLocalUrls.length > 0 && hasLocallySaved) {
        parsedProduct.images = validLocalUrls;
        parsedProduct.primaryImage = validLocalUrls[0];
      } else {
        // If all candidate URLs failed to download due to hotlinking/anti-bot protection, fallback to image search
        console.log(`[WebScraper] External images protected or failed, searching product images for "${parsedProduct.name}"...`);
        const searchImgs = await searchProductImages(parsedProduct.name, 6);
        if (searchImgs && searchImgs.length > 0) {
          const mappedUrls = searchImgs.map((img) => img.url).filter(Boolean);
          const localSearched = await persistImageListLocally(mappedUrls);
          const validSearched = localSearched.filter(Boolean);
          if (validSearched.length > 0) {
            parsedProduct.images = validSearched;
            parsedProduct.primaryImage = validSearched[0];
          }
        }
      }
    } catch (imgErr) {
      console.error('[WebScraper] Error persisting scraped images locally:', imgErr);
    }
  }

  return parsedProduct;
}

import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { getAiClient, hasValidAiApiKey } from './gemini-parser.ts';

export interface MarketQuoteSource {
  title: string;
  url?: string;
}

export interface EcuadorMarketQuoteResult {
  success: boolean;
  productName: string;
  costPrice: number;
  currency: string;
  minMarketPrice: number;
  maxMarketPrice: number;
  avgMarketPrice: number;
  suggestedSalePrice: number;
  estimatedProfit: number;
  profitMarginPercent: number;
  competitiveness: 'alta' | 'media' | 'exclusiva';
  marketSummary: string;
  sources: MarketQuoteSource[];
  keyTips: string[];
  searchQueries?: string[];
  isEstimatedFallback?: boolean;
  error?: string;
}

export interface QuoteMarketParams {
  productName: string;
  category?: string;
  description?: string;
  costPrice?: number;
  marginPercent?: number;
  customApiKey?: string;
}

// In-memory cache for market quotes (15 minutes TTL)
const quoteCache = new Map<string, { data: EcuadorMarketQuoteResult; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function cleanNumber(val: any, fallback: number = 0): number {
  if (typeof val === 'number' && !isNaN(val)) return Math.round(val * 100) / 100;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    if (!isNaN(num)) return Math.round(num * 100) / 100;
  }
  return fallback;
}

function extractJsonFromResponse(rawText: string): any {
  if (!rawText) return null;
  // 1. Try markdown code block
  const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const targetText = codeBlockMatch ? codeBlockMatch[1] : rawText;

  try {
    return JSON.parse(targetText.trim());
  } catch {
    // 2. Try substring from first { to last }
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
      } catch {}
    }
  }
  return null;
}

function isQuotaOrRateLimitError(err: any): boolean {
  if (!err) return false;
  const msg = typeof err === 'string' ? err : (err?.message || err?.toString?.() || '');
  const status = err?.status || err?.code || '';
  return (
    status === 429 ||
    status === 'RESOURCE_EXHAUSTED' ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('exceeded your current quota') ||
    msg.includes('rate-limits') ||
    msg.includes('rate limit') ||
    msg.includes('quota')
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string = 'Timeout'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} after ${ms}ms`)), ms)),
  ]);
}

/**
 * Calculates a standard local retail estimate in USD for Ecuador when AI or web search is unavailable.
 */
function createCalculatedFallbackQuote(
  productName: string,
  costPrice: number,
  targetMargin: number,
  isQuotaLimited: boolean = false
): EcuadorMarketQuoteResult {
  const safeCost = costPrice > 0 ? costPrice : 10;
  const marginFrac = Math.max(15, Math.min(100, targetMargin || 35)) / 100;

  // Typical retail markup in Ecuador: 30% - 50% on cost
  const rawSuggested = safeCost * (1 + marginFrac);
  // Psychological pricing (.99 or .00)
  const suggestedSalePrice = Math.ceil(rawSuggested) - 0.01 > safeCost
    ? Math.round((Math.ceil(rawSuggested) - 0.01) * 100) / 100
    : Math.round(rawSuggested * 100) / 100;

  const minMarket = Math.round(safeCost * 1.20 * 100) / 100;
  const maxMarket = Math.round(safeCost * 1.65 * 100) / 100;
  const avgMarket = Math.round(((minMarket + maxMarket) / 2) * 100) / 100;
  const profit = Math.round((suggestedSalePrice - safeCost) * 100) / 100;
  const profitMarginPercent = safeCost > 0 ? Math.round((profit / safeCost) * 100) : targetMargin;

  const summarySuffix = isQuotaLimited
    ? ' (Cálculo sugerido con margen de ganancia real para Ecuador mientras se renueva la cuota de consultas en vivo).'
    : '';

  return {
    success: true,
    productName,
    costPrice: safeCost,
    currency: 'USD',
    minMarketPrice: minMarket,
    maxMarketPrice: maxMarket,
    avgMarketPrice: avgMarket,
    suggestedSalePrice,
    estimatedProfit: profit,
    profitMarginPercent,
    competitiveness: 'media',
    marketSummary: `Estimación basada en márgenes estándar de comercio electrónico para Ecuador (+${targetMargin}% sobre costo de compra en USD). Precio promedio de referencia: $${avgMarket.toFixed(2)} USD.${summarySuffix}`,
    sources: [
      { title: 'Mercado Libre Ecuador (Ver precios en vivo)', url: `https://listado.mercadolibre.com.ec/${encodeURIComponent(productName)}` },
      { title: 'Google Shopping Ecuador', url: `https://www.google.com/search?q=${encodeURIComponent(productName)}+precio+ecuador&tbm=shop` },
      { title: 'Distribuidores Mayoristas Quito/Guayaquil', url: `https://www.google.com/search?q=${encodeURIComponent(productName)}+distribuidor+mayorista+ecuador` },
    ],
    keyTips: [
      'Asegúrate de incluir costo de envío local (aprox. $3.50 a $5.50 por Servientrega/LaarCourier) si ofreces envío gratis.',
      'Usa precios terminados en .99 o .00 para mayor atractivo psicológico en dólares.',
      'Puedes configurar tu propia clave gratuita de Gemini en Configuración > Inteligencia Artificial para consultas ilimitadas.'
    ],
    isEstimatedFallback: true,
  };
}

/**
 * Quotes a product in the current Ecuadorian market (USD) using Google Gemini
 * with live Google Search Grounding to check local retail and e-commerce prices.
 */
export async function quoteProductInEcuadorMarket(params: QuoteMarketParams): Promise<EcuadorMarketQuoteResult> {
  const {
    productName,
    category = 'General',
    description = '',
    costPrice = 0,
    marginPercent = 35,
    customApiKey,
  } = params;

  if (!productName || !productName.trim()) {
    throw new Error('El nombre del producto es obligatorio para cotizar en el mercado.');
  }

  const cleanName = productName.trim();
  const safeCost = Math.max(0, Number(costPrice) || 0);
  const safeMargin = Math.max(5, Math.min(150, Number(marginPercent) || 35));

  // Check cache
  const cacheKey = `${cleanName.toLowerCase()}_${safeCost}_${safeMargin}`;
  const cached = quoteCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // If no Gemini API key is configured, return the high-fidelity structured calculation
  if (!hasValidAiApiKey(customApiKey)) {
    const fallback = createCalculatedFallbackQuote(cleanName, safeCost, safeMargin);
    fallback.marketSummary += ' (Nota: Agrega tu clave de Google Gemini para habilitar la búsqueda web en tiempo real).';
    quoteCache.set(cacheKey, { data: fallback, timestamp: Date.now() });
    return fallback;
  }

  const candidateModels = [
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
  ];

  const prompt = `Eres un experto cotizador de precios de mercado para comercio electrónico y retail en ECUADOR (moneda: Dólares Americanos USD).
Tu tarea es buscar y analizar el precio real actual de este producto en el mercado ecuatoriano (ej. Mercado Libre Ecuador, marketplaces locales, importadoras de Guayaquil/Quito, tiendas online de tecnología/hogar).

DATOS DEL PRODUCTO A COTIZAR:
- Nombre: "${cleanName}"
- Categoría: "${category}"
- Detalles o atributos: "${description.slice(0, 300)}"
- Costo de compra al por mayor / proveedor del comerciante: $${safeCost.toFixed(2)} USD
- Margen de ganancia objetivo deseado: ${safeMargin}%

INSTRUCCIONES:
1. Realiza una búsqueda web en Ecuador para saber a qué precios se vende este artículo o productos idénticos/muy similares.
2. Encuentra:
   - minMarketPrice: el precio minorista más bajo encontrado en Ecuador (en USD).
   - maxMarketPrice: el precio minorista más alto encontrado en tiendas establecidas (en USD).
   - avgMarketPrice: el precio promedio representativo del mercado ecuatoriano (en USD).
   - suggestedSalePrice: precio de venta al público recomendado para este comerciante. Debe asegurar rentabilidad (cubrir el costo de $${safeCost.toFixed(2)} USD con una ganancia justa) y a la vez ser competitivo frente a la oferta ecuatoriana.
   - estimatedProfit: ganancia neta en USD (suggestedSalePrice - costPrice).
   - profitMarginPercent: margen en % resultante ((suggestedSalePrice - costPrice) / costPrice * 100).
   - competitiveness: "alta" si el precio sugerido es muy atractivo y competitivo, "media" si está en el promedio, o "exclusiva" si es un artículo de alta gama o con poca competencia.
   - marketSummary: resumen claro y conciso de 2 o 3 oraciones sobre la oferta en Ecuador (menciona nombres de tiendas o portales donde se vende, nivel de demanda y sugerencia de venta).
   - sources: lista de 2 a 4 tiendas o fuentes ecuatorianas consultadas (con nombre y URL si la tienes).
   - keyTips: lista de 2 consejos rápidos de pricing o venta para Ecuador.

IMPORTANTE: Responde ÚNICAMENTE con un objeto JSON válido con los campos exactos, sin texto adicional antes ni después:
{
  "currency": "USD",
  "minMarketPrice": 0.00,
  "maxMarketPrice": 0.00,
  "avgMarketPrice": 0.00,
  "suggestedSalePrice": 0.00,
  "estimatedProfit": 0.00,
  "profitMarginPercent": 0,
  "competitiveness": "alta",
  "marketSummary": "...",
  "sources": [
    { "title": "...", "url": "..." }
  ],
  "keyTips": ["...", "..."]
}`;

  let searchGroundingSucceeded = false;
  let parsedQuote: any = null;
  let rawGroundingSources: MarketQuoteSource[] = [];
  let webSearchQueries: string[] = [];
  let isQuotaExceeded = false;

  const ai = getAiClient(customApiKey);

  // 1. First attempt: Gemini with Google Search Grounding
  try {
    const searchResponse = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 0.2,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      6000,
      'GoogleSearchGrounding'
    );

    const responseText = searchResponse.text || '';
    const parsed = extractJsonFromResponse(responseText);
    if (parsed && typeof parsed === 'object') {
      parsedQuote = parsed;
      searchGroundingSucceeded = true;

      const chunks = searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (Array.isArray(chunks)) {
        for (const chunk of chunks) {
          if (chunk.web?.title && chunk.web?.uri) {
            rawGroundingSources.push({
              title: chunk.web.title,
              url: chunk.web.uri,
            });
          }
        }
      }
      webSearchQueries = searchResponse.candidates?.[0]?.groundingMetadata?.webSearchQueries || [];
    }
  } catch (err: any) {
    if (isQuotaOrRateLimitError(err)) {
      isQuotaExceeded = true;
      // Search Grounding quota exceeded (429). Do not spam search tool.
      console.info('[Market Quote] Herramienta de búsqueda en cuota temporal (429). Procediendo con análisis directo de mercado de Gemini.');
    } else {
      console.info('[Market Quote] Búsqueda web asistida no disponible en este momento. Evaluando con modelo analítico de comercio local.');
    }
  }

  // 2. Second attempt: If search grounding did not produce a parsed quote (e.g. 429 search quota),
  // consult Gemini without search grounding using models with high rate availability
  if (!parsedQuote) {
    const directModels = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-flash-latest'];
    for (const model of directModels) {
      try {
        const directResponse = await withTimeout(
          ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              temperature: 0.2,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
          6000,
          `DirectModel-${model}`
        );

        const responseText = directResponse.text || '';
        const parsed = extractJsonFromResponse(responseText);
        if (parsed && typeof parsed === 'object') {
          parsedQuote = parsed;
          break;
        }
      } catch (err: any) {
        if (isQuotaOrRateLimitError(err)) {
          isQuotaExceeded = true;
          console.info(`[Market Quote] Límite de cuota general (429) alcanzado. Activando cotizador de retail para Ecuador.`);
          break; // Don't retry other models on 429
        }
      }
    }
  }

  // 3. If a quote was obtained from AI (with or without search grounding)
  if (parsedQuote && typeof parsedQuote === 'object') {
    const minP = cleanNumber(parsedQuote.minMarketPrice, Math.max(1, safeCost * 1.15));
    const maxP = cleanNumber(parsedQuote.maxMarketPrice, Math.max(minP * 1.2, safeCost * 1.7));
    const avgP = cleanNumber(parsedQuote.avgMarketPrice, Math.round(((minP + maxP) / 2) * 100) / 100);

    let suggestedP = cleanNumber(parsedQuote.suggestedSalePrice, 0);
    if (suggestedP <= 0 || (safeCost > 0 && suggestedP < safeCost)) {
      suggestedP = Math.round(safeCost * (1 + safeMargin / 100) * 100) / 100;
    }

    const profit = safeCost > 0 ? Math.round((suggestedP - safeCost) * 100) / 100 : suggestedP;
    const profitMargin = safeCost > 0 ? Math.round((profit / safeCost) * 100) : safeMargin;

    // Combine sources
    const finalSources: MarketQuoteSource[] = [...rawGroundingSources];
    if (Array.isArray(parsedQuote.sources)) {
      for (const s of parsedQuote.sources) {
        if (s && s.title && !finalSources.some((item) => item.title === s.title)) {
          finalSources.push({
            title: s.title,
            url: s.url,
          });
        }
      }
    }

    // Always include direct verified links for Ecuador
    if (!finalSources.some((s) => s.title.includes('Mercado Libre'))) {
      finalSources.push({
        title: 'Mercado Libre Ecuador (Ver precios en vivo)',
        url: `https://listado.mercadolibre.com.ec/${encodeURIComponent(cleanName)}`,
      });
    }
    if (!finalSources.some((s) => s.title.includes('Google Shopping'))) {
      finalSources.push({
        title: 'Google Shopping Ecuador',
        url: `https://www.google.com/search?q=${encodeURIComponent(cleanName)}+precio+ecuador&tbm=shop`,
      });
    }

    const result: EcuadorMarketQuoteResult = {
      success: true,
      productName: cleanName,
      costPrice: safeCost,
      currency: 'USD',
      minMarketPrice: minP,
      maxMarketPrice: maxP,
      avgMarketPrice: avgP,
      suggestedSalePrice: suggestedP,
      estimatedProfit: profit,
      profitMarginPercent: profitMargin,
      competitiveness:
        parsedQuote.competitiveness === 'alta' || parsedQuote.competitiveness === 'exclusiva'
          ? parsedQuote.competitiveness
          : 'media',
      marketSummary:
        parsedQuote.marketSummary ||
        `Precio promedio en Ecuador: $${avgP.toFixed(2)} USD. Rango de mercado detectado entre $${minP.toFixed(2)} y $${maxP.toFixed(2)} USD.`,
      sources: finalSources.slice(0, 6),
      keyTips:
        Array.isArray(parsedQuote.keyTips) && parsedQuote.keyTips.length > 0
          ? parsedQuote.keyTips.slice(0, 3)
          : [
              'Para tiendas de ecommerce en Ecuador se sugiere mantener un margen neto no menor al 30% para amortizar logística.',
              'Puedes ofrecer envío gratuito absorbiendo $3.50 a $4.50 en el PVP si el producto supera los $25.',
            ],
      searchQueries: webSearchQueries.length > 0 ? webSearchQueries : [`${cleanName} precio ecuador`, `${cleanName} mercadolibre`],
      isEstimatedFallback: !searchGroundingSucceeded,
    };

    quoteCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  // 4. Fallback: Local retail calculation for Ecuador
  const fallback = createCalculatedFallbackQuote(cleanName, safeCost, safeMargin, isQuotaExceeded);
  quoteCache.set(cacheKey, { data: fallback, timestamp: Date.now() });
  return fallback;
}

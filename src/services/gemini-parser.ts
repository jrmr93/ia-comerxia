import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { getAiConfig } from '../db/inventory.ts';
import {
  detectTaxStatus,
  calculateTaxAdjustment,
  adjustCostOptionsForTax,
} from '../utils/tax-calculator.ts';

let activeCustomApiKey: string | null = null;
let aiInstance: GoogleGenAI | null = null;

// In-memory cache for fast repeated marketing copies and descriptions
const copyCache = new Map<string, { data: any; timestamp: number }>();
const descCache = new Map<string, { text: string; timestamp: number }>();
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

export function setCustomAiApiKey(key: string | null) {
  activeCustomApiKey = key && key.trim().length > 0 ? key.trim() : null;
  aiInstance = null;
}

export function resetAiClient() {
  aiInstance = null;
}

export function isValidGeminiApiKey(key?: string | null): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  // Support both modern Google AI Studio keys (AQ...) and legacy keys (AIzaSy...)
  return trimmed.length >= 15;
}

export function hasValidAiApiKey(customKey?: string): boolean {
  const candidateKey = customKey?.trim() || activeCustomApiKey || process.env.GEMINI_API_KEY;
  return isValidGeminiApiKey(candidateKey);
}

export function getAiClient(customKey?: string): GoogleGenAI {
  const candidateKey = customKey?.trim() || activeCustomApiKey || process.env.GEMINI_API_KEY;
  if (!candidateKey || !isValidGeminiApiKey(candidateKey)) {
    throw new Error('No se ha configurado una clave API de Google Gemini válida.');
  }

  const keyToUse = candidateKey.trim();

  if (customKey && customKey.trim()) {
    return new GoogleGenAI({
      apiKey: keyToUse,
    });
  }

  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey: keyToUse,
    });
  }
  return aiInstance;
}

/**
 * Tests connection to Google Gemini API with a specific key and model.
 */
export async function testGeminiApiKey(
  apiKey?: string,
  modelName: string = 'gemini-3.6-flash'
): Promise<{
  success: boolean;
  model: string;
  message: string;
  latencyMs: number;
  sampleResponse?: string;
}> {
  const startTime = Date.now();
  const keyToTest = apiKey?.trim() || activeCustomApiKey || process.env.GEMINI_API_KEY;

  if (!keyToTest) {
    return {
      success: false,
      model: modelName || 'gemini-3.6-flash',
      message: 'No se ingresó ninguna API Key para validar.',
      latencyMs: 0,
    };
  }

  const activeModel = modelName?.trim() || 'gemini-3.6-flash';

  const modelsToTry = Array.from(
    new Set([
      activeModel,
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      'gemini-flash-latest',
    ].filter(Boolean))
  );

  let lastError: any = null;

  for (const currentModel of modelsToTry) {
    try {
      const testAi = new GoogleGenAI({ apiKey: keyToTest });

      const response = await testAi.models.generateContent({
        model: currentModel,
        contents: 'Responde strictly en una sola palabra: "CONECTADO"',
        config: {
          temperature: 0.1,
        },
      });

      const latencyMs = Date.now() - startTime;
      const responseText = response.text?.trim() || 'OK';

      return {
        success: true,
        model: currentModel,
        message: `Conexión exitosa con Google Gemini (${currentModel}). Tiempo de respuesta: ${latencyMs}ms.`,
        latencyMs,
        sampleResponse: responseText,
      };
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || err?.toString() || '';
      // If error is authentication error, stop trying other models
      if (
        errMsg.includes('401') ||
        errMsg.includes('UNAUTHENTICATED') ||
        errMsg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') ||
        errMsg.includes('API_KEY_INVALID') ||
        errMsg.includes('API key not valid')
      ) {
        break;
      }
      // If error is model not found or temporary error, try next candidate model
      continue;
    }
  }

  const latencyMs = Date.now() - startTime;
  const errMsg = lastError?.message || lastError?.toString() || 'Error desconocido al validar API Key';

  let friendlyMsg = errMsg;
  if (
    errMsg.includes('API_KEY_INVALID') ||
    errMsg.includes('UNAUTHENTICATED') ||
    errMsg.includes('401') ||
    errMsg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') ||
    errMsg.includes('API key not valid')
  ) {
    friendlyMsg =
      'Clave de API no autorizada o inválida. Asegúrate de ingresar una clave API válida creada en Google AI Studio (aistudio.google.com).';
  } else if (errMsg.includes('403') || errMsg.includes('PERMISSION_DENIED')) {
    friendlyMsg = 'Permiso denegado. Asegúrate de que la API de Gemini esté habilitada para esta clave.';
  } else if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429')) {
    friendlyMsg = 'Límite de cuota excedido (Rate Limit / Quota Exceeded). Intenta nuevamente en unos momentos.';
  }

  return {
    success: false,
    model: activeModel,
    message: friendlyMsg,
    latencyMs,
  };
}

/**
 * Executes a completion request against a local OpenAI-compatible server (LM Studio).
 */
export function parseJsonFromModelResponse(text: string): any {
  if (!text || typeof text !== 'string') return null;
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx > startIdx) {
    const jsonSubstring = cleaned.slice(startIdx, endIdx + 1);
    try {
      return JSON.parse(jsonSubstring);
    } catch {}
  }

  return null;
}

export function normalizeLmStudioEndpoint(inputEndpoint?: string | null): {
  openAiBase: string;
  lmStudioApiBase: string;
  raw: string;
} {
  let raw = (inputEndpoint || 'http://localhost:1234/v1').trim().replace(/\/+$/, '');

  if (raw.endsWith('/v1')) {
    const root = raw.slice(0, -3).replace(/\/+$/, '');
    return {
      openAiBase: raw,
      lmStudioApiBase: `${root}/api/v1`,
      raw: root,
    };
  }

  if (raw.endsWith('/api/v1')) {
    const root = raw.slice(0, -7).replace(/\/+$/, '');
    return {
      openAiBase: `${root}/v1`,
      lmStudioApiBase: raw,
      raw: root,
    };
  }

  return {
    openAiBase: `${raw}/v1`,
    lmStudioApiBase: `${raw}/api/v1`,
    raw,
  };
}

/**
 * Executes a completion request against a local OpenAI-compatible server (LM Studio).
 */
export async function callLocalLmStudioAi(
  prompt: string,
  imagesBase64?: string[],
  endpoint: string = 'http://localhost:1234/v1',
  modelName: string = 'google/gemma-4-12b-qat'
): Promise<string> {
  const { openAiBase, lmStudioApiBase } = normalizeLmStudioEndpoint(endpoint);
  const targetModel = modelName || 'google/gemma-4-12b-qat';

  let userContent: any = prompt;
  if (Array.isArray(imagesBase64) && imagesBase64.length > 0) {
    const parts: any[] = [];
    for (const imgBase64 of imagesBase64) {
      if (!imgBase64 || typeof imgBase64 !== 'string') continue;
      const mime = imgBase64.startsWith('data:image/')
        ? imgBase64.split(';')[0].replace('data:', '')
        : 'image/jpeg';
      const cleanData = imgBase64.includes(',') ? imgBase64.split(',')[1] : imgBase64;
      parts.push({
        type: 'image_url',
        image_url: {
          url: `data:${mime};base64,${cleanData}`,
        },
      });
    }
    parts.push({ type: 'text', text: prompt });
    userContent = parts;
  }

  const messages = [
    {
      role: 'system',
      content: 'Eres un asistente experto en contabilidad y comercio electrónico. Responde ÚNICAMENTE en formato JSON válido estructurado sin explicaciones extra.',
    },
    { role: 'user', content: userContent },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  const candidateUrls = [
    `${openAiBase}/chat/completions`,
    `${lmStudioApiBase}/chat`,
  ];

  let lastError: any = null;

  for (const targetUrl of candidateUrls) {
    try {
      let res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: targetModel,
          messages,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (res.status === 400 || res.status === 422 || res.status === 404) {
        // Retry without strict response_format for models that don't support it
        res = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: targetModel,
            messages,
            temperature: 0.1,
          }),
        });
      }

      if (res.ok) {
        clearTimeout(timeoutId);
        const json = await res.json();
        const msg = json.choices?.[0]?.message;
        let contentStr = msg?.content || '';
        if ((!contentStr || !contentStr.trim()) && msg?.reasoning_content) {
          contentStr = msg.reasoning_content;
        }
        if (!contentStr && json.output?.content) {
          contentStr = typeof json.output.content === 'string' ? json.output.content : JSON.stringify(json.output.content);
        }
        return contentStr || '';
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  clearTimeout(timeoutId);
  throw lastError || new Error(`No se pudo obtener respuesta de LM Studio en ${endpoint}`);
}

/**
 * Tests connection to local LM Studio AI Server (http://localhost:1234/v1).
 */
export async function testLmStudioConnection(
  endpoint: string = 'http://localhost:1234/v1',
  modelName: string = 'google/gemma-4-12b-qat'
): Promise<{
  success: boolean;
  model: string;
  message: string;
  latencyMs: number;
  availableModels?: string[];
}> {
  const startTime = Date.now();
  const { openAiBase, lmStudioApiBase } = normalizeLmStudioEndpoint(endpoint);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    let availableModels: string[] = [];
    const modelsUrls = [`${openAiBase}/models`, `${lmStudioApiBase}/models`];
    for (const mUrl of modelsUrls) {
      try {
        const modelsRes = await fetch(mUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });
        if (modelsRes.ok) {
          const data = await modelsRes.json();
          const list = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
          if (list.length > 0) {
            availableModels = list.map((m: any) => m.id || m.name || m.key).filter(Boolean);
            break;
          }
        }
      } catch {}
    }

    const targetModel = modelName?.trim() || availableModels[0] || 'google/gemma-4-12b-qat';

    const chatUrls = [
      `${openAiBase}/chat/completions`,
      `${lmStudioApiBase}/chat`,
    ];

    for (const cUrl of chatUrls) {
      try {
        const testRes = await fetch(cUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: targetModel,
            messages: [{ role: 'user', content: 'Responde únicamente la palabra CONECTADO sin explicaciones.' }],
            temperature: 0.1,
            max_tokens: 60,
          }),
        });

        if (testRes.ok) {
          clearTimeout(timeoutId);
          const latencyMs = Date.now() - startTime;
          const testJson = await testRes.json();
          const msg = testJson.choices?.[0]?.message;
          const reply = msg?.content || msg?.reasoning_content || testJson.output?.content || 'OK';

          return {
            success: true,
            model: targetModel,
            message: `Conexión exitosa con LM Studio (${targetModel}). Tiempo de respuesta: ${latencyMs}ms.`,
            latencyMs,
            availableModels,
          };
        }
      } catch (err: any) {}
    }

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      model: targetModel,
      message: `Servidor LM Studio no respondió en ${endpoint}. Verifica la URL y puerto (ej. http://192.168.0.24:1234 o http://localhost:1234).`,
      latencyMs,
      availableModels,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      model: modelName || 'local-model',
      message: `No se pudo conectar con LM Studio en ${endpoint}. Inicia el servidor local en LM Studio.`,
      latencyMs,
    };
  }
}

export interface CostOption {
  label: string;
  price: number;
  costWithoutTax?: number;
  costWithTax?: number;
  taxRate?: number;
  unitCost?: number;
  isAffiliate?: boolean;
}

export interface ParsedProductResult {
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  costPrice: number;
  costWithoutTax: number;
  costWithTax: number;
  baseCostPrice?: number;
  taxStatus?: 'INCLUDED' | 'PLUS_TAX' | 'NOT_SPECIFIED';
  taxPercent?: number;
  costOptions: CostOption[];
  profitMarginPercent: number;
  salePrice: number;
  stock: number;
  description: string;
  tags: string[];
  attributes: Record<string, string | number | string[] | any>;
  supplierNotes?: string;
  confidenceScore: number;
}

/**
 * Resolves an image input (Data URI, HTTP/HTTPS URL, or raw base64) into
 * clean base64 data and a valid MIME type for Gemini inlineData with strict timeout.
 */
async function resolveImageToPart(
  photoInput?: string,
  fallbackMime: string = 'image/jpeg',
  timeoutMs: number = 3500
): Promise<{ data: string; mimeType: string } | null> {
  if (!photoInput || typeof photoInput !== 'string') return null;

  try {
    const trimmed = photoInput.trim();

    // 0. Local /uploads/ or relative file path on disk (fastest, direct disk read)
    if (trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/')) {
      try {
        const cleanRelPath = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
        const localPath = path.join(process.cwd(), cleanRelPath);
        if (fs.existsSync(localPath)) {
          const buffer = await fs.promises.readFile(localPath);
          const ext = path.extname(localPath).toLowerCase().replace('.', '');
          const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          return {
            data: buffer.toString('base64'),
            mimeType,
          };
        }
      } catch (err) {
        console.warn('Error reading local image for Gemini:', err);
      }
    }

    // 1. Data URL format (data:image/...;base64,...)
    if (trimmed.startsWith('data:')) {
      const match = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
      if (match) {
        return {
          mimeType: match[1] || fallbackMime,
          data: match[2].trim(),
        };
      }
      const commaIdx = trimmed.indexOf(',');
      if (commaIdx !== -1) {
        return {
          mimeType: fallbackMime,
          data: trimmed.slice(commaIdx + 1).trim(),
        };
      }
    }

    // 2. HTTP / HTTPS URL with fast timeout controller
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(trimmed, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          return null;
        }
        const contentType = response.headers.get('content-type') || fallbackMime;
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = contentType.split(';')[0].trim() || fallbackMime;

        return {
          data: buffer.toString('base64'),
          mimeType: mimeType.startsWith('image/') ? mimeType : fallbackMime,
        };
      } catch (fetchErr) {
        return null;
      }
    }

    // 3. Raw base64 string
    const cleanStr = trimmed.replace(/[\r\n\s]/g, '');
    if (/^[A-Za-z0-9+/=]+$/.test(cleanStr) && cleanStr.length > 50) {
      return {
        data: cleanStr,
        mimeType: fallbackMime,
      };
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Helper to sleep for exponential backoff
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Selects the default cost price prioritizing the "precio afiliado por 1 unidad" (affiliate 1 unit price).
 * If an option specifically mentions 1 unit (e.g. "x 1", "1 unidad", "1 u", "unidad"), it is selected.
 * Otherwise, selects the highest affiliate price (which represents the 1-unit single item cost).
 * If no affiliate prices are present, defaults to the highest general cost price detected.
 */
export function selectDefaultAffiliateCostPrice(
  costOptions: CostOption[],
  fallbackParsedCost: number
): { selectedCost: number; isAffiliate: boolean; isSingleUnitAffiliate: boolean; optionLabel?: string } {
  if (!Array.isArray(costOptions) || costOptions.length === 0) {
    const cost = Math.max(0, fallbackParsedCost) || 10.0;
    return { selectedCost: cost, isAffiliate: false, isSingleUnitAffiliate: false };
  }

  // Look for options whose label mentions 'afiliad' (afiliado, afiliados, precio afiliado, costo afiliado, etc.)
  const affiliateOptions = costOptions.filter(
    (opt) =>
      opt &&
      typeof opt.label === 'string' &&
      /afiliad/i.test(opt.label) &&
      Number(opt.price) > 0
  );

  if (affiliateOptions.length > 0) {
    // 1. Look for explicit 1-unit affiliate indicator (e.g. "x 1 unidad", "1 unidad", "1 u", "1 und", "por unidad", "1 pza", "unidad")
    const oneUnitOption = affiliateOptions.find((opt) =>
      /(?:x\s*1\b|1\s*(?:u\b|und|unidad|pieza|pza)|unidad\b|unitario|detal|menor)/i.test(opt.label)
    );

    if (oneUnitOption && Number(oneUnitOption.price) > 0) {
      return {
        selectedCost: Number(oneUnitOption.price),
        isAffiliate: true,
        isSingleUnitAffiliate: true,
        optionLabel: oneUnitOption.label,
      };
    }

    // 2. If multiple affiliate options exist without explicit '1 unidad', the single-unit price is typically the highest affiliate price
    const maxAffiliatePrice = Math.max(...affiliateOptions.map((o) => Number(o.price)));
    const matchedOpt = affiliateOptions.find((o) => Number(o.price) === maxAffiliatePrice);
    return {
      selectedCost: maxAffiliatePrice > 0 ? maxAffiliatePrice : fallbackParsedCost || 10.0,
      isAffiliate: true,
      isSingleUnitAffiliate: true,
      optionLabel: matchedOpt?.label,
    };
  }

  // If no affiliate options, take the highest cost among all options or fallback
  const optionPrices = costOptions.map((o) => Number(o.price)).filter((p) => p > 0);
  const maxGeneralCost =
    optionPrices.length > 0
      ? Math.max(...optionPrices, fallbackParsedCost || 0)
      : fallbackParsedCost || 10.0;

  return { selectedCost: maxGeneralCost, isAffiliate: false, isSingleUnitAffiliate: false };
}

/**
 * Intelligent regex & heuristic extractor as a failsafe when AI APIs are overloaded
 */
function extractFallbackFromText(
  caption: string,
  defaultMarginPercent: number,
  currency: string,
  taxPercent: number = 15
): ParsedProductResult {
  const text = caption.trim();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // 1. Detect title
  let name = lines[0] || 'Producto de Proveedor';
  // If first line starts with emoji or looks like "Llegaron ...", clean it up
  name = name.replace(/^(📦|⚡|🔥|✨|✅|🚨|NUEVO|LOTE:?)\s*/i, '').slice(0, 60);

  // Clean text from phone numbers, shoe sizes, and lot counts to avoid false price matches
  // E.g. 0991234567, +593991234567, Tallas 38 a 44, Lote de 50
  const textWithoutPhones = text
    .replace(/(?:\+?593|09)\d{7,8}/g, ' ')
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, ' ')
    .replace(/tallas?\s*(?:del?\s*)?\d{2}\s*(?:al?|-|a)\s*\d{2}/gi, ' ')
    .replace(/tallas?\s*[:=-]?\s*[\d\s,/-]+/gi, ' ')
    .replace(/(?:lote|stock|cant|cantidad|unidades|pares|piezas)\s*(?:de\s*)?\d+/gi, ' ');

  // 2. Detect explicit Sale Price (PVP) if present, so we don't confuse it with cost
  let detectedSalePrice: number | undefined = undefined;
  const pvpMatch = textWithoutPhones.match(/(?:pvp|p\.v\.p|precio\s*(?:de\s*)?venta|venta\s*(?:sugerida|al\s*p[uú]blico)?|sugerido|para\s*vender)\s*[:=-]?\s*\$?\s*(\d+(?:[.,]\d{1,2})?)/i);
  if (pvpMatch) {
    const pvpVal = parseFloat(pvpMatch[1].replace(',', '.'));
    if (pvpVal > 0 && pvpVal < 50000) detectedSalePrice = pvpVal;
  }

  // 3. Detect prices and affiliate prices specifically
  const affiliateOptionsFound: { label: string; price: number; isOneUnit: boolean }[] = [];
  
  for (const line of lines) {
    if (/afiliad/i.test(line)) {
      const numMatch = line.match(/\$?\s*(\d+(?:[.,]\d{1,2})?)/i);
      if (numMatch) {
        const priceVal = parseFloat(numMatch[1].replace(',', '.'));
        if (priceVal > 0 && priceVal < 50000) {
          const isOneUnit = /(?:x\s*1\b|1\s*(?:u\b|und|unidad|pieza|pza)|unidad\b|unitario|detal|menor)/i.test(line);
          let cleanLabel = line.replace(/^[•\-*👉*#]+\s*/, '').replace(/\s*c\/u\s*/i, '').trim();
          if (cleanLabel.length > 55) cleanLabel = cleanLabel.slice(0, 55);
          affiliateOptionsFound.push({
            label: cleanLabel || `Precio Afiliado (${currency} ${priceVal.toFixed(2)})`,
            price: priceVal,
            isOneUnit,
          });
        }
      }
    }
  }

  // Also extract explicit cost matches (costo $X, precio $X, mayorista $X)
  const explicitCostMatches = textWithoutPhones.match(/(?:costo|por\s*mayor|mayorista|unitario|c\/u)\s*[:=-]?\s*\$?\s*(\d+(?:[.,]\d{1,2})?)/gi);
  const rawCostNumbers: number[] = [];
  if (explicitCostMatches) {
    for (const m of explicitCostMatches) {
      const numMatch = m.match(/\d+(?:[.,]\d{1,2})?/);
      if (numMatch) {
        const val = parseFloat(numMatch[0].replace(',', '.'));
        if (val > 0 && val < 50000 && !rawCostNumbers.includes(val)) rawCostNumbers.push(val);
      }
    }
  }

  // Fallback to dollar signs if no explicit cost matched
  if (rawCostNumbers.length === 0 && affiliateOptionsFound.length === 0) {
    const dollarMatches = textWithoutPhones.match(/\$\s*(\d+(?:[.,]\d{1,2})?)/g);
    if (dollarMatches) {
      for (const m of dollarMatches) {
        const numMatch = m.match(/\d+(?:[.,]\d{1,2})?/);
        if (numMatch) {
          const val = parseFloat(numMatch[0].replace(',', '.'));
          if (val > 0 && val < 50000 && val !== detectedSalePrice && !rawCostNumbers.includes(val)) {
            rawCostNumbers.push(val);
          }
        }
      }
    }
  }

  let costPrice = 15.0;
  let costOptions: CostOption[] = [];

  if (affiliateOptionsFound.length > 0) {
    const oneUnit = affiliateOptionsFound.find((o) => o.isOneUnit);
    costPrice = oneUnit ? oneUnit.price : Math.max(...affiliateOptionsFound.map((o) => o.price));
    costOptions = affiliateOptionsFound.map((o) => ({
      label: o.label,
      price: o.price,
    }));
  } else if (rawCostNumbers.length > 0) {
    // If multiple cost numbers exist, lowest or middle is often cost, highest might be PVP if not tagged
    costPrice = rawCostNumbers[0];
    costOptions = rawCostNumbers.map((p, idx) => ({
      label: idx === 0 ? `Costo Principal (${currency} ${p.toFixed(2)})` : `Opción ${idx + 1} (${currency} ${p.toFixed(2)})`,
      price: p,
    }));
  } else {
    costPrice = 15.0;
    costOptions = [{ label: `Costo Principal (${currency} ${costPrice.toFixed(2)})`, price: costPrice }];
  }

  // 4. Detect Stock
  let stock = 1;
  const stockMatch = text.match(/(?:stock|cant|cantidad|unidades|disponibles|lote(?:\s+de)?)\s*[:=-]?\s*(\d+)/i) ||
                     text.match(/(\d+)\s*(?:unidades|pares|piezas|pcs|unds)/i);
  if (stockMatch && stockMatch[1]) {
    stock = Math.max(1, parseInt(stockMatch[1], 10));
  }

  // 5. Detect Category
  let category = 'General';
  const lower = text.toLowerCase();
  if (/zapat|sneaker|calzado|botas|sandalia|tenis|nike|adidas|puma|crocs/.test(lower)) category = 'Calzado';
  else if (/polo|camisa|vestido|pantalon|casaca|buzo|ropa|algodon|poleron/.test(lower)) category = 'Ropa y Moda';
  else if (/celular|iphone|samsung|xiaomi|cargador|funda|auricular|smartwatch|airpods/.test(lower)) category = 'Electrónica y Celulares';
  else if (/laptop|mouse|teclado|monitor|disco|computador|ram/.test(lower)) category = 'Computación y Accesorios';
  else if (/cocina|olla|termo|sarten|sabana|lampara|almohada|hogar/.test(lower)) category = 'Hogar y Cocina';
  else if (/perfume|crema|maquillaje|labial|shampoo|skincare/.test(lower)) category = 'Belleza y Cuidado Personal';
  else if (/pesa|mancuerna|balon|guante|proteina|fitness|gym/.test(lower)) category = 'Deportes y Fitness';
  else if (/taladro|herramienta|tornillo|foco|cable|pintura/.test(lower)) category = 'Ferretería y Herramientas';

  // 6. SKU & Barcode generation
  const sku = 'AUTO';
  let barcode: string | undefined = undefined;
  const barcodeMatch = text.match(/(?:c[oó]digo\s+de\s+barras|barcode|ean|upc|gtin)\s*[:=-]?\s*([0-9]{8,14})/i) ||
                       text.match(/\b([0-9]{12,13})\b/);
  if (barcodeMatch && barcodeMatch[1]) {
    barcode = barcodeMatch[1].trim();
  }

  // 7. IVA / Tax detection & calculation
  const detectedTaxStatus = detectTaxStatus(text);
  const taxRate = detectedTaxStatus === 'NOT_SPECIFIED' ? 0 : (typeof taxPercent === 'number' && taxPercent >= 0 ? taxPercent : 15);
  const profitMarginPercent = defaultMarginPercent || 30;

  const taxAdjustment = calculateTaxAdjustment({
    costPrice,
    taxStatus: detectedTaxStatus,
    taxPercent: taxRate,
    profitMarginPercent,
  });

  const costWithoutTax = taxAdjustment.baseCostPrice;
  const costWithTax = taxAdjustment.costPrice;

  const adjustedCostOptions = costOptions.map((opt) => {
    let optWithout = opt.price;
    let optWith = opt.price;
    if (detectedTaxStatus === 'PLUS_TAX') {
      optWithout = opt.price;
      optWith = Math.round(opt.price * (1 + taxRate / 100) * 100) / 100;
    } else if (detectedTaxStatus === 'INCLUDED') {
      optWith = opt.price;
      optWithout = Math.round((opt.price / (1 + taxRate / 100)) * 100) / 100;
    } else {
      // NOT_SPECIFIED: 0% IVA, cost is exactly what was read
      optWith = opt.price;
      optWithout = opt.price;
    }
    return {
      label: opt.label,
      price: optWith,
      costWithoutTax: optWithout,
      costWithTax: optWith,
    };
  });

  // 8. Tags
  const tags = [category.toLowerCase(), 'telegram', 'proveedor'];
  if (lower.includes('nike')) tags.push('nike');
  if (lower.includes('adidas')) tags.push('adidas');
  if (lower.includes('original')) tags.push('original');

  const finalSale = detectedSalePrice && detectedSalePrice > costWithTax
    ? detectedSalePrice
    : taxAdjustment.salePrice;

  return {
    name: name || 'Producto Nuevo Telegram',
    sku,
    barcode,
    category,
    costPrice: costWithTax,
    costWithoutTax,
    costWithTax,
    baseCostPrice: costWithoutTax,
    taxStatus: detectedTaxStatus,
    taxPercent: taxRate,
    costOptions: adjustedCostOptions,
    profitMarginPercent,
    salePrice: finalSale,
    stock,
    description: text || 'Producto importado automáticamente desde mensaje de proveedor en Telegram.',
    tags,
    attributes: {
      origen: 'Telegram Bot',
      moneda: currency,
      procesamiento: 'Extracción Heurística Automática',
      taxStatus: detectedTaxStatus,
      taxPercent: taxRate,
      baseCostPrice: costWithoutTax,
      costPriceWithTax: costWithTax,
      costWithoutTax,
      costWithTax,
      taxAmount: taxAdjustment.taxAmount,
      iva:
        detectedTaxStatus === 'PLUS_TAX'
          ? `+${taxRate}% aplicado (Base: $${costWithoutTax.toFixed(2)} ➔ Con IVA: $${costWithTax.toFixed(2)})`
          : detectedTaxStatus === 'INCLUDED'
          ? `Incluido en el costo ($${costWithoutTax.toFixed(2)} sin IVA)`
          : `Asumido con IVA ($${costWithoutTax.toFixed(2)} sin IVA)`,
    },
    supplierNotes: lines.slice(1).join(' ').slice(0, 120),
    confidenceScore: 75,
  };
}

export async function parseSupplierTelegramMessage(
  caption: string,
  photoInput?: string | string[],
  photoMimeType?: string,
  defaultMarginPercent: number = 30,
  currency: string = 'USD',
  taxPercent: number = 15,
  useAi: boolean = true,
  customApiKey?: string
): Promise<ParsedProductResult> {
  const aiConfig = await getAiConfig(1).catch(() => null);
  const isLmStudio = aiConfig?.provider === 'lmstudio';

  if (!useAi || (!isLmStudio && !hasValidAiApiKey(customApiKey))) {
    return extractFallbackFromText(caption, defaultMarginPercent, currency, taxPercent);
  }

  try {
    const photoList = Array.isArray(photoInput)
      ? photoInput.filter(Boolean)
      : photoInput
      ? [photoInput]
      : [];

    const prompt = `Eres un asistente experto en contabilidad, gestión de inventario y comercio electrónico para una empresa.
Tu tarea es analizar un mensaje enviado por un proveedor en Telegram (que incluye texto/descripción y ${
      photoList.length > 1
        ? `${photoList.length} fotografías adjuntas del mismo producto en diferentes ángulos/detalles`
        : 'opcionalmente la foto del producto'
    }) y extraer de forma exacta todos los datos necesarios para registrar el producto en la base de datos de inventario SQL.

REGLAS CRÍTICAS DE RECONOCIMIENTO Y PREVENCIÓN DE ERRORES DE PRECIOS:
1. PREVENCIÓN DE CONFUSIONES:
   - NUNCA confundas números de teléfono o WhatsApp (ej. 09..., +593..., etc.) con precios.
   - NUNCA confundas cantidades de lote o stock (ej. "lote de 50", "30 pares", "caja de 24 piezas") con precios.
   - NUNCA confundas tallas de calzado o ropa (ej. "tallas 38 al 44", "talla 36, 38, 40") con precios.
   - NUNCA confundas códigos de modelo, referencia o SKU (ej. "Ref: 120", "Mod 500") con precios.
   - NUNCA uses el precio de venta sugerido (PVP) como costo. El precio de venta al público (PVP) va en "salePrice", NO en el costo.
   - Ten en cuenta comas como decimales si aplica (ej. "12,50" es 12.50).

2. "costOptions": Si el mensaje o imagen contiene varios precios de costo (por ejemplo: precios de afiliado por unidad/volumen, escalas de cantidad, precios por mayor vs por menor, por docena, o variantes), extrae TODOS los precios disponibles en una lista de objetos { "label": string, "price": number, "costWithoutTax"?: number, "costWithTax"?: number }. Si solo hay un único precio de costo, incluye ese único precio.

3. "costPrice", "costWithoutTax", "costWithTax":
   - "costWithoutTax": Costo unitario de adquisición SIN IVA (base imponible / costo neto antes de impuestos).
     * Si el proveedor especifica "+ IVA", "más IVA" o "sin IVA", costWithoutTax es ese valor base exacto (ej. $10 sin IVA -> costWithoutTax = 10.00).
     * Si el proveedor especifica "con IVA" o "IVA incluido", calcula costWithoutTax dividiendo para (1 + IVA/100) (ej. $11.50 con IVA al ${taxPercent}% -> costWithoutTax = 11.50 / 1.15 = 10.00).
     * REGLA OBLIGATORIA: Si el contenido NO especifica si tiene o no tiene IVA, se asume que el porcentaje de IVA en compra es 0% y el costo del producto es exactamente el que se lee: costWithoutTax = costo leído, costWithTax = costo leído, costPrice = costo leído, taxPercent = 0.
   - "costWithTax": Costo unitario de adquisición CON IVA (total final a pagar al proveedor por unidad).
     * Si el proveedor especifica "+ IVA", "más IVA" o "sin IVA", calcula costWithTax multiplicando por (1 + IVA/100) (ej. $10 sin IVA -> costWithTax = 10.00 * 1.15 = 11.50 con IVA al ${taxPercent}%).
     * Si el proveedor especifica "con IVA" o "IVA incluido", costWithTax es ese valor (ej. 11.50).
     * Si el contenido NO especifica si tiene o no tiene IVA, el costo con IVA es exactamente el mismo costo leído (ej. si dice $10, costWithTax = 10.00 y costWithoutTax = 10.00).
   - "costPrice": Costo unitario total de adquisición (debe coincidir exactamente con costWithTax).
   - REGLA GENERAL: Si no se especifica IVA, costWithoutTax y costWithTax son idénticos al costo leído.
   - REGLA DE AFILIADO: Si en el mensaje existen precios de AFILIADO (ej. "Precio Afiliado x 1 unidad", "Afiliado 1 u", "Afiliados", "Costo Afiliado", etc.), prioriza OBLIGATORIAMENTE el PRECIO AFILIADO POR 1 UNIDAD (unitaria) como el costo principal de referencia.

4. "taxStatus": Clasifica la situación tributaria del costo indicado en el texto:
   - "PLUS_TAX": Si indica "+ iva", "mas iva", "más iva", "no incluye iva", "sin iva", "+ impuesto".
   - "INCLUDED": Si indica "incluye iva", "iva incluido", "con iva", "iva inc", "ya con iva".
   - "NOT_SPECIFIED": Si no menciona explícitamente impuestos o IVA. En este caso se asume 0% de IVA en compra y el costo leído es directo.

5. "name": Genera un título claro, profesional y comercial para el producto (ej. "Zapatillas Deportivas Nike Air Zoom", "Smartwatch Reloj Inteligente T500").
6. "sku": Código SKU alfanumérico secuencial sencillo o el código del fabricante si se menciona explícitamente. Si no hay código explícito, coloca "AUTO".
7. "barcode": Código de barras físico del producto (EAN-13, UPC, EAN-8 o numérico detectado en fotos/etiquetas o texto). Cadena vacía si no existe.
8. "category": Clasifica en: "Calzado", "Ropa y Moda", "Electrónica y Celulares", "Computación y Accesorios", "Hogar y Cocina", "Belleza y Cuidado Personal", "Deportes y Fitness", "Juguetes y Niños", "Ferretería y Herramientas", o "General".
9. "profitMarginPercent": Porcentaje de margen de ganancia comercial. Usa ${defaultMarginPercent} por defecto.
10. "salePrice": Precio de venta al público (PVP):
    - Si el mensaje menciona precio de venta sugerido (PVP / MSRP / "vender a"), úsalo como salePrice.
    - Si no se menciona PVP, calcúlalo aplicando profitMarginPercent sobre costWithTax (salePrice = costWithTax * (1 + profitMarginPercent/100)).
    - NUNCA pongas un salePrice menor que el costWithTax.
11. "stock": Cantidad de unidades disponibles mencionadas (ej. "llegaron 30 unidades", "lote de 15"). Si no especifica, pon 1.
12. "description": Redacta una descripción atractiva, estructurada con viñetas sobre características, materiales, usos y ventajas.
13. "tags": Lista de 3 a 7 etiquetas de búsqueda (ej. ["zapatillas", "running", "deportes", "nike", "calzado"]).
14. "attributes": Objeto JSON con detalles específicos (colores disponibles, tallas, modelo, marca, conectividad, etc.).
15. "supplierNotes": Notas adicionales del proveedor.
16. "confidenceScore": Puntuación de 0 a 100 de qué tan confiable fue la extracción.

Texto del mensaje recibido del proveedor:
"""
${caption || '(Sin texto en el mensaje, analizar las fotos adjuntas del producto)'}
"""`;

    // Safely resolve primary images in parallel (up to 2 primary images)
    const imagesToResolve = photoList.slice(0, 2);
    const resolvedImages = await Promise.all(
      imagesToResolve.map((photo) => resolveImageToPart(photo, photoMimeType || 'image/jpeg', 3000))
    );

    // 1. If provider is LM Studio Local, try local completion first
    if (isLmStudio && aiConfig) {
      try {
        const localBase64s = resolvedImages.map((r) => r?.data).filter(Boolean) as string[];
        const localText = await callLocalLmStudioAi(
          prompt,
          localBase64s,
          aiConfig.localEndpoint || 'http://localhost:1234/v1',
          aiConfig.localModelName || 'qwen2.5-coder-7b-instruct'
        );
        if (localText && localText.trim().length > 10) {
          const parsed = parseJsonFromModelResponse(localText);
          if (parsed && typeof parsed === 'object' && (parsed.name || parsed.costPrice || parsed.category)) {
            // Process cost and tax math for local AI response
            let finalTaxStatus: 'INCLUDED' | 'PLUS_TAX' | 'NOT_SPECIFIED' = 'NOT_SPECIFIED';
            if (parsed.taxStatus === 'PLUS_TAX' || parsed.taxStatus === 'INCLUDED' || parsed.taxStatus === 'NOT_SPECIFIED') {
              finalTaxStatus = parsed.taxStatus;
            } else {
              finalTaxStatus = detectTaxStatus(caption);
            }

            const taxRate = finalTaxStatus === 'NOT_SPECIFIED' ? 0 : (typeof taxPercent === 'number' && taxPercent >= 0 ? taxPercent : 15);
            const margin = Math.max(1, Number(parsed.profitMarginPercent) || defaultMarginPercent || 30);
            const rawCostVal = Math.max(0.01, Number(parsed.costPrice || parsed.costWithTax || parsed.costWithoutTax) || 15.0);

            const costAdj = calculateTaxAdjustment({
              costPrice: rawCostVal,
              taxStatus: finalTaxStatus,
              taxPercent: taxRate,
              profitMarginPercent: margin,
            });

            return {
              name: parsed.name || 'Producto Nuevo (LM Studio Local)',
              sku: parsed.sku || `PROD-${Date.now().toString().slice(-6)}`,
              barcode: typeof parsed.barcode === 'string' && parsed.barcode.trim() ? parsed.barcode.trim() : undefined,
              category: parsed.category || 'General',
              costPrice: costAdj.costPrice,
              costWithoutTax: costAdj.baseCostPrice,
              costWithTax: costAdj.costPrice,
              baseCostPrice: costAdj.baseCostPrice,
              taxStatus: finalTaxStatus,
              taxPercent: taxRate,
              costOptions: Array.isArray(parsed.costOptions) && parsed.costOptions.length > 0 ? parsed.costOptions : [{ label: `Costo Principal ($${costAdj.costPrice.toFixed(2)})`, price: costAdj.costPrice }],
              profitMarginPercent: margin,
              salePrice: Number(parsed.salePrice) || costAdj.salePrice,
              stock: Math.max(1, Number(parsed.stock) || 1),
              description: parsed.description || caption || 'Sin descripción',
              tags: Array.isArray(parsed.tags) ? parsed.tags : ['local-ia'],
              attributes: { ...(parsed.attributes || {}), proveedorIA: 'LM Studio Local' },
              supplierNotes: parsed.supplierNotes || 'Procesado con IA Local (LM Studio)',
              confidenceScore: Number(parsed.confidenceScore) || 95,
            };
          }
        }
      } catch (localErr) {
        console.warn('[LMStudio] Servidor local no respondió, intentando fallback de Google Gemini / Heurístico:', localErr);
      }
    }

    // 2. Google Gemini Cloud execution
    const ai = getAiClient(customApiKey);
    const contents: any[] = [];

    for (const resolved of resolvedImages) {
      if (resolved && resolved.data) {
        contents.push({
          inlineData: {
            data: resolved.data,
            mimeType: resolved.mimeType,
          },
        });
      }
    }

    contents.push(prompt);

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.6-flash',
      'gemini-flash-latest',
    ];

  for (const modelName of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              sku: { type: Type.STRING },
              barcode: {
                type: Type.STRING,
                description: 'Código de barras físico del producto (EAN-13, UPC, EAN-8 o numérico detectado en fotos/etiquetas o texto). Cadena vacía si no existe.',
              },
              category: { type: Type.STRING },
              costWithoutTax: {
                type: Type.NUMBER,
                description: 'Costo unitario sin IVA (base imponible/neto)',
              },
              costWithTax: {
                type: Type.NUMBER,
                description: 'Costo unitario con IVA incluido (total adquisición)',
              },
              costPrice: {
                type: Type.NUMBER,
                description: 'El mayor precio de entre todos los precios que dicen AFILIADO (o el costo mas alto general si no hay precios de afiliado)',
              },
              taxStatus: {
                type: Type.STRING,
                description: 'INCLUDED si incluye iva, PLUS_TAX si es mas iva / no incluye iva, NOT_SPECIFIED si no menciona',
              },
              costOptions: {
                type: Type.ARRAY,
                description: 'Lista de todos los precios de costo disponibles con su etiqueta explicativa (ej. "Precio Afiliado x 1", "Precio Afiliado x 3", "Mayorista")',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    price: { type: Type.NUMBER },
                    costWithoutTax: { type: Type.NUMBER },
                    costWithTax: { type: Type.NUMBER },
                  },
                  required: ['label', 'price'],
                },
              },
              profitMarginPercent: { type: Type.NUMBER, description: 'Porcentaje de margen de ganancia' },
              salePrice: { type: Type.NUMBER, description: 'Precio de venta al publico' },
              stock: { type: Type.INTEGER },
              description: { type: Type.STRING },
              tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              attributes: {
                type: Type.OBJECT,
                description: 'Atributos clave como colores, tallas, especificaciones tecnicas',
                properties: {
                  marca: { type: Type.STRING },
                  color: { type: Type.STRING },
                  talla_o_tamano: { type: Type.STRING },
                  material: { type: Type.STRING },
                  modelo: { type: Type.STRING },
                  detalles_extra: { type: Type.STRING },
                },
              },
              supplierNotes: { type: Type.STRING },
              confidenceScore: { type: Type.INTEGER },
            },
            required: [
              'name',
              'sku',
              'category',
              'costPrice',
              'costWithoutTax',
              'costWithTax',
              'salePrice',
              'stock',
              'description',
              'tags',
            ],
          },
          temperature: 0.1,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error('Empty response from model');
      }

      const parsed = JSON.parse(text) as any;

      // Extract & normalize cost options
      let costOptions: CostOption[] = [];
      if (Array.isArray(parsed.costOptions) && parsed.costOptions.length > 0) {
        costOptions = parsed.costOptions
          .map((opt: any) => ({
            label: String(opt.label || 'Opción de Costo'),
            price: Math.max(0, Number(opt.price) || 0),
            costWithoutTax: typeof opt.costWithoutTax === 'number' && opt.costWithoutTax > 0 ? Number(opt.costWithoutTax) : undefined,
            costWithTax: typeof opt.costWithTax === 'number' && opt.costWithTax > 0 ? Number(opt.costWithTax) : undefined,
          }))
          .filter((opt: CostOption) => opt.price > 0);
      }

      // Determine default cost price: prioritizes the HIGHEST price among options labeled as 'afiliad'
      const parsedCost = Math.max(0, Number(parsed.costPrice) || 0);
      const { selectedCost: finalHighestCost } = selectDefaultAffiliateCostPrice(
        costOptions,
        parsedCost
      );

      if (costOptions.length === 0) {
        costOptions = [{ label: `Costo Principal (${currency} ${finalHighestCost.toFixed(2)})`, price: finalHighestCost }];
      }

      // Calculate IVA adjustments using unified tax calculator
      const contextTax = detectTaxStatus(`${caption || ''} ${parsed.description || ''}`);
      const modelTaxStatus = parsed.taxStatus === 'PLUS_TAX' || parsed.taxStatus === 'INCLUDED' ? parsed.taxStatus : 'NOT_SPECIFIED';
      const finalTaxStatus = contextTax !== 'NOT_SPECIFIED' ? contextTax : modelTaxStatus;

      // When NOT_SPECIFIED: user rule: assume tax percentage is 0% and cost is what was read
      const taxRate = finalTaxStatus === 'NOT_SPECIFIED'
        ? 0
        : (typeof taxPercent === 'number' && taxPercent >= 0 ? taxPercent : 15);
      const margin = Math.max(1, Number(parsed.profitMarginPercent) || defaultMarginPercent || 30);

      const taxAdjustment = calculateTaxAdjustment({
        costPrice: finalHighestCost,
        taxStatus: finalTaxStatus,
        taxPercent: taxRate,
        profitMarginPercent: margin,
      });

      // Synchronize costWithoutTax and costWithTax with mathematical precision
      let finalCostWithoutTax = typeof parsed.costWithoutTax === 'number' && parsed.costWithoutTax > 0
        ? parsed.costWithoutTax
        : taxAdjustment.baseCostPrice;
      let finalCostWithTax = typeof parsed.costWithTax === 'number' && parsed.costWithTax > 0
        ? parsed.costWithTax
        : taxAdjustment.costPrice;

      if (finalTaxStatus === 'PLUS_TAX') {
        // Explicitly without IVA: base is raw cost, final cost adds IVA
        finalCostWithoutTax = Math.round((finalCostWithoutTax || finalHighestCost) * 100) / 100;
        finalCostWithTax = Math.round(finalCostWithoutTax * (1 + taxRate / 100) * 100) / 100;
      } else if (finalTaxStatus === 'INCLUDED') {
        // Explicitly with IVA: final cost is raw cost, cost without tax removes IVA
        finalCostWithTax = Math.round((finalCostWithTax || finalHighestCost) * 100) / 100;
        finalCostWithoutTax = Math.round((finalCostWithTax / (1 + taxRate / 100)) * 100) / 100;
      } else {
        // NOT_SPECIFIED: User rule: If the content does NOT specify if it has or not IVA,
        // assume tax percentage is 0% and the cost of the product is the one read.
        finalCostWithTax = Math.round((finalHighestCost || finalCostWithTax) * 100) / 100;
        finalCostWithoutTax = finalCostWithTax;
      }

      // Populate costWithoutTax and costWithTax on each option
      const adjustedCostOptions: CostOption[] = costOptions.map((opt) => {
        let optWithout = opt.costWithoutTax;
        let optWith = opt.costWithTax;
        if (!optWithout && !optWith) {
          if (finalTaxStatus === 'PLUS_TAX') {
            optWithout = opt.price;
            optWith = Math.round(opt.price * (1 + taxRate / 100) * 100) / 100;
          } else if (finalTaxStatus === 'INCLUDED') {
            optWith = opt.price;
            optWithout = Math.round((opt.price / (1 + taxRate / 100)) * 100) / 100;
          } else {
            // NOT_SPECIFIED: 0% IVA, cost is as read
            optWith = opt.price;
            optWithout = opt.price;
          }
        } else if (finalTaxStatus === 'NOT_SPECIFIED') {
          optWith = opt.price;
          optWithout = opt.price;
        }
        return {
          label: opt.label,
          price: optWith || opt.price,
          costWithoutTax: optWithout ?? opt.price,
          costWithTax: optWith || opt.price,
        };
      });

      let finalSalePrice = Math.round(finalCostWithTax * (1 + margin / 100) * 100) / 100;
      if (parsed.salePrice) {
        const parsedSale = Number(parsed.salePrice);
        if (!isNaN(parsedSale) && parsedSale > finalCostWithTax) {
          finalSalePrice = parsedSale;
        }
      }

      return {
        name: parsed.name || 'Producto Nuevo Telegram',
        sku: parsed.sku || `PROD-${Date.now().toString().slice(-6)}`,
        barcode: typeof parsed.barcode === 'string' && parsed.barcode.trim() ? parsed.barcode.trim() : undefined,
        category: parsed.category || 'General',
        costPrice: finalCostWithTax,
        costWithoutTax: finalCostWithoutTax,
        costWithTax: finalCostWithTax,
        baseCostPrice: finalCostWithoutTax,
        taxStatus: finalTaxStatus,
        taxPercent: taxRate,
        costOptions: adjustedCostOptions,
        profitMarginPercent: margin,
        salePrice: finalSalePrice,
        stock: Math.max(1, Number(parsed.stock) || 1),
        description: parsed.description || caption || 'Sin descripción',
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        attributes: {
          ...(parsed.attributes || {}),
          taxStatus: finalTaxStatus,
          taxPercent: taxRate,
          hasPurchaseTax: finalTaxStatus !== 'NOT_SPECIFIED' && taxRate > 0,
          purchaseTaxPercent: taxRate,
          baseCostPrice: finalCostWithoutTax,
          costPriceWithTax: finalCostWithTax,
          costWithoutTax: finalCostWithoutTax,
          costWithTax: finalCostWithTax,
          taxAmount: Math.round((finalCostWithTax - finalCostWithoutTax) * 100) / 100,
          iva:
            finalTaxStatus === 'PLUS_TAX'
              ? `+${taxRate}% aplicado (Base: $${finalCostWithoutTax.toFixed(2)} ➔ Con IVA: $${finalCostWithTax.toFixed(2)})`
              : finalTaxStatus === 'INCLUDED'
              ? `Incluido en el costo ($${finalCostWithoutTax.toFixed(2)} sin IVA)`
              : `0% IVA (No especificado - costo leído directo: $${finalCostWithTax.toFixed(2)})`,
        },
        supplierNotes: parsed.supplierNotes || '',
        confidenceScore: Number(parsed.confidenceScore) || 92,
      };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (
        errMsg.includes('401') ||
        errMsg.includes('UNAUTHENTICATED') ||
        errMsg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') ||
        errMsg.includes('API_KEY_INVALID')
      ) {
        console.warn('[GeminiParser] Clave Gemini no válida (401), aplicando fallback heurístico.');
        break;
      }
      if (
        errMsg.includes('503') ||
        errMsg.includes('high demand') ||
        errMsg.includes('UNAVAILABLE') ||
        errMsg.includes('429') ||
        errMsg.includes('RESOURCE_EXHAUSTED')
      ) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      // If candidate model is busy or throttled, smoothly try next model in candidate list
      continue;
    }
  }

  // If all Gemini models are experiencing temporary high demand/overload, use smart regex heuristic fallback
  return extractFallbackFromText(caption, defaultMarginPercent, currency, taxPercent);
} catch {
  return extractFallbackFromText(caption, defaultMarginPercent, currency, taxPercent);
}
}

export interface MarketingCopyOptions {
  tone?: 'persuasive' | 'direct' | 'urgency' | 'exclusive';
  storeName?: string;
  storeAddress?: string;
  websiteUrl?: string;
  whatsappNumber?: string;
  cityOrRegion?: string;
  currency?: string;
  includeDeliveryNote?: boolean;
  warrantyInfo?: string;
  paymentTitles?: string[];
  shippingCompanies?: string[];
  showStock?: boolean;
  showPhone?: boolean;
  showSku?: boolean;
  showWebsite?: boolean;
}

export interface MarketingCopyOutput {
  title?: string;
  price?: string;
  sku?: string;
  tags?: string[];
  universalDescription: string;
  paymentTitles?: string[];
  shippingCompanies?: string[];
  showStock?: boolean;
  showPhone?: boolean;
  showSku?: boolean;
  showWebsite?: boolean;
  websiteUrl?: string;
  options?: {
    showStock?: boolean;
    showPhone?: boolean;
    showSku?: boolean;
    showWebsite?: boolean;
    websiteUrl?: string;
    tone?: string;
    customPrice?: string;
    cityOrRegion?: string;
    whatsappContact?: string;
    storeAddress?: string;
    paymentTitlesInput?: string;
    shippingCompaniesInput?: string;
    [key: string]: any;
  };
  allInOne?: string;
  savedAt?: string;
  marketplace?: {
    title: string;
    price: string;
    condition: string;
    description: string;
    fullText: string;
  };
  instagram?: {
    hook: string;
    body: string;
    callToAction: string;
    hashtags: string[];
    fullText: string;
  };
  whatsapp?: {
    shortMessage: string;
    fullCatalogText: string;
  };
  ecommerce?: {
    seoTitle: string;
    bulletPoints: string[];
    technicalDescription: string;
    fullText: string;
  };
}

export function stripTrailingTags(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();
  // Strip trailing lines of hashtags (#word #another) or labels (Tags: ..., Etiquetas: ..., Hashtags: ...)
  cleaned = cleaned.replace(/(\r?\n)+\s*(?:Tags|Etiquetas|Hashtags)\s*:[^\n]*$/gi, '');
  cleaned = cleaned.replace(/(\r?\n)+\s*(?:#[\w\u00C0-\u017F\d_-]+(?:\s+|$))+$/gi, '');
  cleaned = cleaned.replace(/(\r?\n)+\s*(?:Tags|Etiquetas|Hashtags)\s*:[^\n]*$/gi, '');
  cleaned = cleaned.replace(/(\r?\n)+\s*(?:#[\w\u00C0-\u017F\d_-]+(?:\s+|$))+$/gi, '');
  return cleaned.trim();
}

/**
 * Generates a single universal marketing sales publication with high converting order,
 * clean line breaks, emojis/icons, payment method titles and couriers, using Google Gemini AI.
 */
export async function generateProductMarketingCopy(
  product: {
    name: string;
    sku?: string;
    description?: string | null;
    category?: string;
    salePrice?: number | string;
    stock?: number;
    tags?: string | string[] | null;
    extractedAttributes?: string | Record<string, any> | null;
    imageUrl?: string | null;
    images?: string[];
  },
  options: MarketingCopyOptions = {}
): Promise<MarketingCopyOutput> {
  const currency = options.currency || 'USD';
  const priceVal = parseFloat(String(product.salePrice || '0')) || 0;
  const priceStr = `$${priceVal.toFixed(2)} ${currency}`;
  const storeName = options.storeName || 'Comerxia Store';
  const storeAddress = (options.storeAddress || '').trim();
  const websiteUrl = (options.websiteUrl || '').trim();
  const whatsappNumber = options.whatsappNumber || '';
  const tone = options.tone || 'persuasive';
  const cityOrRegion = options.cityOrRegion || 'Envíos a todo el país';
  const warranty = options.warrantyInfo || 'Producto 100% nuevo y garantizado contra defectos de fábrica';

  const defaultPayments = [
    'Transferencia Bancaria',
    'Banco Pichincha',
    'Banco Guayaquil',
    'Deuna',
    'Efectivo',
  ];
  const paymentTitles = (options.paymentTitles && options.paymentTitles.length > 0)
    ? options.paymentTitles.map((p) => p.trim()).filter(Boolean)
    : defaultPayments;

  const defaultShippings = [
    'Servientrega',
    'LaarCourier',
    'Cooperativas de Transporte',
    'Entregas a Domicilio',
  ];
  const shippingCompanies = (options.shippingCompanies && options.shippingCompanies.length > 0)
    ? options.shippingCompanies.map((s) => s.trim()).filter(Boolean)
    : defaultShippings;

  const paymentBulletPoints = paymentTitles.map((t) => `• ${t}`).join('\n');
  const shippingBulletPoints = shippingCompanies.map((c) => `• ${c}`).join('\n');
  const addressSectionFallback = storeAddress ? `\n\n📍 UBICACIÓN / DIRECCIÓN DE LA TIENDA:\n• ${storeAddress}` : '';
  const websiteSectionFallback = (options.showWebsite !== false && websiteUrl) ? `\n\n🌐 TIENDA ONLINE / CATÁLOGO:\n• ${websiteUrl}` : '';

  let parsedAttributes: Record<string, any> = {};
  if (product.extractedAttributes) {
    try {
      parsedAttributes =
        typeof product.extractedAttributes === 'string'
          ? JSON.parse(product.extractedAttributes)
          : product.extractedAttributes;
    } catch {}
  }

  const attributesSummary = Object.entries(parsedAttributes)
    .filter(([k]) => k !== 'images' && k !== 'totalPhotos' && k !== 'costOptions' && k !== 'selectedCostPrice' && k !== 'profitMarginPercent')
    .map(([k, v]) => `• ${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join('\n');

  const showStock = options.showStock !== false;
  const showPhone = options.showPhone !== false;
  const showSku = options.showSku !== false;
  const showWebsite = options.showWebsite !== false && Boolean(websiteUrl);

  // Fallback builder with strict order, icons and double line breaks (without trailing tags)
  const buildFallbackCopies = (): MarketingCopyOutput => {
    const rawTags = Array.isArray(product.tags)
      ? product.tags
      : typeof product.tags === 'string'
      ? product.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    const defaultTagsList = [
      (product.category || 'tienda').replace(/\s+/g, '').toLowerCase(),
      product.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15).toLowerCase(),
      'ventasonline',
      'marketplace',
      'oferta',
      'comprasegura',
      'enviosnacionales',
    ].filter(Boolean);

    const cleanDesc = (product.description || '').replace(/[\r\n]+/g, ' ').slice(0, 300);

    const skuLine = showSku && product.sku ? `🏷️ CÓDIGO / SKU: ${product.sku}\n` : '';
    const stockLine = showStock ? `📊 DISPONIBILIDAD: ${product.stock ?? 1} unidades listas para entrega\n` : '';
    const contactLine = showPhone && whatsappNumber
      ? `• Escríbenos por mensaje privado o al WhatsApp ${whatsappNumber} para coordinar tu entrega hoy mismo.`
      : `• Escríbenos por mensaje privado para coordinar tu entrega hoy mismo.`;

    const universalText = `🔥 ${product.name.toUpperCase()} 🔥

💰 PRECIO: ${priceStr}
📦 ESTADO: 100% Nuevo en caja sellada
${skuLine}${stockLine}
✨ CARACTERÍSTICAS DESTACADAS:
${cleanDesc ? `• ${cleanDesc}` : '• Alta calidad, durabilidad y excelente rendimiento garantizado.'}
${attributesSummary ? attributesSummary : '• Diseño moderno, ergonómico y materiales de primera.'}
• ${warranty}

📲 PEDIDOS Y CONTACTO DIRECTO:
${contactLine}

💳 MÉTODOS DE PAGO:
${paymentBulletPoints}

🚚 EMPRESAS DE ENVÍO / ENTREGAS:
${shippingBulletPoints}${addressSectionFallback}${websiteSectionFallback}`.trim();

    return {
      title: product.name.trim(),
      price: `$${priceVal.toFixed(2)}`,
      sku: product.sku || '',
      universalDescription: universalText,
      allInOne: universalText,
      tags: rawTags.length > 0 ? rawTags : defaultTagsList,
      paymentTitles,
      shippingCompanies,
      showStock,
      showPhone,
      showSku,
      showWebsite,
      websiteUrl: websiteUrl || undefined,
      savedAt: new Date().toISOString(),
    };
  };

  const aiConfig = await getAiConfig(1).catch(() => null);
  const isLmStudio = aiConfig?.provider === 'lmstudio';

  if (!isLmStudio && !hasValidAiApiKey()) {
    return buildFallbackCopies();
  }

  try {
    const toneInstructions = {
      persuasive: 'Tono persuasivo, vendedor, enfocado en beneficios, valor y solución al cliente.',
      direct: 'Tono directo, claro, conciso, enfocado en especificaciones, precio y llamada a la acción sin rodeos.',
      urgency: 'Tono de urgencia y oferta flash (¡Últimas unidades disponibles, precio especial por tiempo limitado!).',
      exclusive: 'Tono premium, elegante, destacando exclusividad, sofisticación y calidad superior.',
    }[tone];

    const prompt = `Eres un redactor publicitario profesional de comercio electrónico.
Tu tarea es generar la información de venta del producto para que el usuario pueda copiarla fácilmente en plataformas como Facebook Marketplace, Mercado Libre, Shopify, Instagram, TikTok y WhatsApp.

Genera:
1. "title": Un título de venta optimizado, atractivo y claro (ideal para el campo de título de Marketplace y tiendas online).
2. "price": El precio formateado con el símbolo de moneda (ej: "$${priceVal.toFixed(2)}").
3. "sku": El código / SKU del producto ("${product.sku || ''}").
4. "tags": Lista de 6 a 12 etiquetas o palabras clave relevantes de búsqueda (sin el símbolo #, en minúsculas) para el panel separado de tags.
5. "universalDescription": La publicación universal completa, llamativa, ordenada y lista para copiar y pegar. IMPORTANTE: NO incluyas hashtags (#), tags ni etiquetas al final de esta publicación universal; los tags van únicamente en el campo "tags".

DATOS DEL PRODUCTO:
- Nombre: ${product.name}
${showSku ? `- SKU / Código: ${product.sku || 'N/A'}` : '- (NO INCLUIR CÓDIGO / SKU EN EL TEXTO)'}
- Categoría: ${product.category || 'General'}
- Precio de Venta: ${priceStr}
${showStock ? `- Stock disponible: ${product.stock ?? 1} unidades` : '- (NO INCLUIR CANTIDAD DE STOCK / UNIDADES EN EL TEXTO)'}
- Descripción base: ${product.description || 'Producto de alta demanda y calidad.'}
- Atributos/Especificaciones:
${attributesSummary || 'Producto nuevo y garantizado'}
- Nombre de la Tienda: ${storeName}
${storeAddress ? `- Dirección / Ubicación Física de la Tienda: ${storeAddress}` : ''}
${showWebsite && websiteUrl ? `- Enlace del Catálogo / Tienda Online: ${websiteUrl}` : ''}
${showPhone ? `- WhatsApp / Teléfono de Contacto: ${whatsappNumber || 'Disponible por mensaje privado'}` : '- (NO INCLUIR NÚMEROS TELEFÓNICOS NI WHATSAPP ESPECÍFICO, solo indicar mensaje privado)'}
- Ciudad / Envíos: ${cityOrRegion}
- Garantía: ${warranty}
- Estilo/Tono: ${toneInstructions}

MÉTODOS DE PAGO DISPONIBLES:
${paymentBulletPoints}

EMPRESAS DE ENVÍO DISPONIBLES:
${shippingBulletPoints}

REGLAS ESTRICTAS DE FORMATO Y ESTRUCTURA:
1. ORDEN Y SALTOS DE LÍNEA:
   - Debe usar saltos de línea claros (doble salto de línea entre secciones) para que sea súper legible, visual y organized.
   - Debe incluir iconos/emojis llamativos y adecuados al inicio de cada sección y viñeta.
2. ESTRUCTURA EXACTA DE LA PUBLICACIÓN UNIVERSAL:
   - Encabezado con el nombre en mayúsculas y emojis (ej: 🔥 NOMBRE 🔥)
   - 💰 PRECIO: ${priceStr}
   - 📦 ESTADO: 100% Nuevo / Garantizado
   ${showSku ? `- 🏷️ CÓDIGO / SKU: ${product.sku || 'N/A'}` : ''}
   ${showStock ? `- 📊 DISPONIBILIDAD: ${product.stock ?? 1} unidades listas para entrega` : ''}
   - ✨ CARACTERÍSTICAS Y BENEFICIOS: (viñetas con viñeta • e iconos de beneficios clave)
   - 📲 PEDIDOS Y CONTACTO DIRECTO: (${showPhone && whatsappNumber ? `llamado a la acción con WhatsApp ${whatsappNumber}` : 'llamado a la acción por mensaje privado / DM sin números telefónicos'})
   - 💳 MÉTODOS DE PAGO: (OBLIGATORIO: listar ÚNICAMENTE los títulos de los métodos de pago con viñetas •, sin descripciones, sin datos bancarios ni explicaciones)
   - 🚚 EMPRESAS DE ENVÍO / ENTREGAS: (OBLIGATORIO: listar las empresas de envío con viñetas •)
   ${storeAddress ? `- 📍 UBICACIÓN / DIRECCIÓN DE LA TIENDA:\n• ${storeAddress}` : ''}
   ${showWebsite && websiteUrl ? `- 🌐 TIENDA ONLINE / CATÁLOGO:\n• ${websiteUrl}` : ''}
   (REGLA ABSOLUTA: Termina al final tras la última sección indicada. NO añadas hashtags (#), tags ni líneas de etiquetas al final).

${!showSku ? '⚠️ REGLA CRÍTICA: NO incluyas ninguna mención de SKU ni código de producto en la publicación universal.\n' : ''}${!showStock ? '⚠️ REGLA CRÍTICA: NO incluyas stock, ni cantidad de unidades disponibles en la publicación.\n' : ''}${!showPhone ? '⚠️ REGLA CRÍTICA: NO incluyas ningún número de WhatsApp ni número de teléfono en la publicación.\n' : ''}${!showWebsite ? '⚠️ REGLA: NO incluyas enlace web ni URL de sitio web en la publicación.\n' : ''}⚠️ REGLA CRÍTICA DE TAGS: NO incluyas ningún hashtag ni lista de tags dentro ni al final de "universalDescription". Los tags se devuelven exclusivamente en el campo de array JSON "tags".

Responde ÚNICAMENTE en formato JSON con la siguiente estructura.`;

    const cacheKey = `${product.name}_${product.sku || ''}_${priceVal}_${tone}_${showStock}_${showPhone}_${showSku}_${showWebsite}`;
    const cachedEntry = copyCache.get(cacheKey);
    if (cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_TTL_MS) {
      return cachedEntry.data;
    }

    if (isLmStudio && aiConfig) {
      try {
        const localText = await callLocalLmStudioAi(
          prompt,
          undefined,
          aiConfig.localEndpoint || 'http://localhost:1234/v1',
          aiConfig.localModelName || 'qwen2.5-coder-7b-instruct'
        );
        if (localText && localText.trim().length > 10) {
          const cleanLocal = localText.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '').trim();
          const parsed = JSON.parse(cleanLocal) as MarketingCopyOutput;
          if (parsed && (parsed.universalDescription || parsed.title)) {
            let cleanedUniversal = stripTrailingTags(parsed.universalDescription || '');
            if (showWebsite && websiteUrl && !cleanedUniversal.toLowerCase().includes(websiteUrl.toLowerCase())) {
              cleanedUniversal = `${cleanedUniversal}\n\n🌐 TIENDA ONLINE / CATÁLOGO:\n• ${websiteUrl}`.trim();
            }
            parsed.title = parsed.title?.trim() || product.name.trim();
            parsed.price = parsed.price?.trim() || `$${priceVal.toFixed(2)}`;
            parsed.sku = parsed.sku?.trim() || product.sku || '';
            parsed.tags = Array.isArray(parsed.tags) && parsed.tags.length > 0 ? parsed.tags : [product.category || 'tienda', 'oferta'];
            parsed.universalDescription = cleanedUniversal;
            parsed.allInOne = cleanedUniversal;
            parsed.paymentTitles = paymentTitles;
            parsed.shippingCompanies = shippingCompanies;
            parsed.showStock = showStock;
            parsed.showPhone = showPhone;
            parsed.showSku = showSku;
            parsed.showWebsite = showWebsite;
            parsed.websiteUrl = websiteUrl || undefined;
            parsed.savedAt = new Date().toISOString();

            copyCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
            return parsed;
          }
        }
      } catch (localErr) {
        console.warn('[LMStudio] Fallo al generar marketing copy local, fallback:', localErr);
      }
    }

    const ai = getAiClient();

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.6-flash',
      'gemini-flash-latest',
    ];

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: 'Título optimizado de venta para Marketplace y tiendas online',
                },
                price: {
                  type: Type.STRING,
                  description: 'Precio formateado del producto',
                },
                sku: {
                  type: Type.STRING,
                  description: 'Código SKU del producto',
                },
                tags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Lista de palabras clave y tags de búsqueda sin el símbolo #',
                },
                universalDescription: {
                  type: Type.STRING,
                  description: 'La única publicación universal completa, ordenada con iconos, saltos de línea, métodos de pago (solo títulos) y empresas de envío al final (sin hashtags ni tags al final del texto)',
                },
              },
              required: ['universalDescription', 'title'],
            },
            temperature: 0.2,
          },
        });

        const text = response.text;
        if (text) {
          const parsed = JSON.parse(text) as MarketingCopyOutput;
          if (parsed.universalDescription && parsed.universalDescription.trim().length > 30) {
            let cleanedUniversal = stripTrailingTags(parsed.universalDescription);
            if (showWebsite && websiteUrl && !cleanedUniversal.toLowerCase().includes(websiteUrl.toLowerCase())) {
              cleanedUniversal = `${cleanedUniversal}\n\n🌐 TIENDA ONLINE / CATÁLOGO:\n• ${websiteUrl}`.trim();
            }
            parsed.title = parsed.title?.trim() || product.name.trim();
            parsed.price = parsed.price?.trim() || `$${priceVal.toFixed(2)}`;
            parsed.sku = parsed.sku?.trim() || product.sku || '';
            parsed.tags = Array.isArray(parsed.tags) && parsed.tags.length > 0
              ? parsed.tags.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean)
              : [product.category || 'tienda', 'oferta', 'ventas'];
            parsed.universalDescription = cleanedUniversal;
            parsed.allInOne = cleanedUniversal;
            parsed.paymentTitles = paymentTitles;
            parsed.shippingCompanies = shippingCompanies;
            parsed.showStock = showStock;
            parsed.showPhone = showPhone;
            parsed.showSku = showSku;
            parsed.showWebsite = showWebsite;
            parsed.websiteUrl = websiteUrl || undefined;
            parsed.savedAt = new Date().toISOString();

            copyCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
            return parsed;
          }
        }
      } catch (innerErr: any) {
        const msg = innerErr?.message || String(innerErr);
        if (msg.includes('503') || msg.includes('high demand') || msg.includes('429') || msg.includes('UNAVAILABLE')) {
          await new Promise((resolve) => setTimeout(resolve, 350));
          continue;
        }
        continue;
      }
    }

    return buildFallbackCopies();
  } catch (error) {
    return buildFallbackCopies();
  }
}

export interface CommercialDescriptionInput {
  name: string;
  category?: string;
  description?: string;
  rawTelegramMessage?: string;
  tags?: string[] | string;
  attributes?: Record<string, any> | string;
  imageUrl?: string;
  images?: string[];
  costPrice?: string | number;
  salePrice?: string | number;
}

/**
 * Generates or regenerates an attractive, structured and complete commercial product description
 * using Gemini AI, mirroring the exact quality and format generated when products arrive via Telegram.
 */
export async function generateProductCommercialDescription(
  input: CommercialDescriptionInput
): Promise<string> {
  const {
    name,
    category = 'General',
    description = '',
    rawTelegramMessage = '',
    tags,
    attributes,
    imageUrl,
    images,
  } = input;

  const descCacheKey = `v_150_200_8b_${name}_${category}_${(rawTelegramMessage || description || '').slice(0, 50)}`;
  const cachedDesc = descCache.get(descCacheKey);
  if (cachedDesc && Date.now() - cachedDesc.timestamp < CACHE_TTL_MS) {
    return cachedDesc.text;
  }

  const photoList: string[] = [];
  if (imageUrl && imageUrl.trim()) photoList.push(imageUrl.trim());
  if (Array.isArray(images)) {
    images.forEach((img) => {
      if (img && typeof img === 'string' && img.trim() && !photoList.includes(img.trim())) {
        photoList.push(img.trim());
      }
    });
  }

  // Format tags and attributes for prompt context
  const cleanTags = Array.isArray(tags) ? tags.join(', ') : tags || '';
  let cleanAttributes = '';
  if (attributes) {
    if (typeof attributes === 'object') {
      try {
        cleanAttributes = Object.entries(attributes)
          .filter(([k]) => !['images', 'totalPhotos', 'costOptions'].includes(k))
          .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
          .join('\n');
      } catch {}
    } else if (typeof attributes === 'string') {
      cleanAttributes = attributes;
    }
  }

  const prompt = `Eres un redactor experto en comercio electrónico y gestión de inventario para una empresa comercial.
Tu tarea es redactar una DESCRIPCIÓN COMERCIAL atractiva, persuasiva y técnica para la ficha del producto, similar al formato estructurado y profesional que se genera cuando un producto ingresa por mensaje de Telegram, cumpliendo rigurosamente con la extensión y viñetas solicitadas.

INFORMACIÓN DEL PRODUCTO:
- Nombre: ${name || 'Producto'}
- Categoría: ${category || 'General'}
${cleanTags ? `- Etiquetas / Tags: ${cleanTags}` : ''}
${cleanAttributes ? `- Especificaciones y Atributos:\n${cleanAttributes}` : ''}
${rawTelegramMessage ? `- Mensaje original recibido del proveedor en Telegram:\n"""${rawTelegramMessage}"""` : ''}
${description && description !== rawTelegramMessage ? `- Información / Descripción previa:\n"""${description}"""` : ''}
${photoList.length > 0 ? `- Fotografías adjuntas: ${photoList.length} imagen(es) analizadas` : ''}

REGLAS OBLIGATORIAS DE FORMATO Y EXTENSIÓN:
1. LONGITUD ESTRICTA: Entre 150 y 200 palabras en total. Es mandatorio que el conteo de palabras del texto completo esté obligatoriamente entre 150 y 200 palabras.
2. ESTRUCTURA:
   - Párrafo de apertura (2 a 3 líneas) presentando el producto, su concepto y propuesta de valor de forma atractiva.
   - Hasta 8 viñetas (•) puntuales de características técnicas y comerciales (redacta entre 5 y 8 viñetas según la información y fotos disponibles):
     • Materiales principales, acabados y durabilidad
     • Diseño ergonómico, ajuste o dimensiones clave
     • Tecnología, funcionalidad destacada o rendimiento
     • Resistencia, practicidad o facilidad de mantenimiento
     • Versatilidad de uso (deportes, casual, oficina, hogar, etc.)
     • Beneficio directo o experiencia para el comprador
     • Detalles técnicos o especificaciones adicionales relevantes
   - Párrafo de cierre breve (1 a 2 líneas) resumiendo la recomendación del producto y su estándar de calidad.
3. PROHIBICIONES ESTRICTAS:
   - NO inventes precios, costos ni descuentos.
   - NO incluyas códigos internos, SKUs ni códigos de barras.
   - NO uses hashtags (#).
   - NO uses encabezados markdown llamativos tipo "### Descripción" ni "¡Descubre...!".
4. Devuelve ÚNICAMENTE el texto final redactado en español listo para colocarse en la ficha del producto.`;

  const aiConfig = await getAiConfig(1).catch(() => null);
  const isLmStudio = aiConfig?.provider === 'lmstudio';

  if (!isLmStudio && !hasValidAiApiKey()) {
    return buildFallbackCommercialDescription(name, category, cleanTags, rawTelegramMessage || description);
  }

  try {
    const imagesToResolve = photoList.slice(0, 2);
    const resolvedImages = await Promise.all(
      imagesToResolve.map((photo) => resolveImageToPart(photo, 'image/jpeg', 2500))
    );

    if (isLmStudio && aiConfig) {
      try {
        const localBase64s = resolvedImages.map((r) => r?.data).filter(Boolean) as string[];
        const localText = await callLocalLmStudioAi(
          prompt,
          localBase64s,
          aiConfig.localEndpoint || 'http://localhost:1234/v1',
          aiConfig.localModelName || 'qwen2.5-coder-7b-instruct'
        );
        if (localText && localText.trim().length > 20) {
          const cleanText = localText
            .replace(/^```[a-z]*\s*/i, '')
            .replace(/\s*```$/, '')
            .replace(/^#+\s+/gm, '')
            .replace(/#\w+/g, '')
            .trim();
          descCache.set(descCacheKey, { text: cleanText, timestamp: Date.now() });
          return cleanText;
        }
      } catch (localErr) {
        console.warn('[LMStudio] Fallo al generar descripción comercial local, fallback:', localErr);
      }
    }

    const ai = getAiClient();
    const contents: any[] = [];

    for (const resolved of resolvedImages) {
      if (resolved && resolved.data) {
        contents.push({
          inlineData: {
            data: resolved.data,
            mimeType: resolved.mimeType,
          },
        });
      }
    }

    contents.push(prompt);

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.6-flash',
      'gemini-flash-latest',
    ];

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            temperature: 0.15,
          },
        });

        let text = response.text?.trim();
        if (text && text.length > 20) {
          // Remove any accidental hashtags, titles or code blocks
          text = text
            .replace(/^```[a-z]*\s*/i, '')
            .replace(/\s*```$/, '')
            .replace(/^#+\s+/gm, '')
            .replace(/#\w+/g, '')
            .trim();

          descCache.set(descCacheKey, { text, timestamp: Date.now() });
          return text;
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes('503') || msg.includes('high demand') || msg.includes('429') || msg.includes('UNAVAILABLE')) {
          await new Promise((resolve) => setTimeout(resolve, 350));
          continue;
        }
        continue;
      }
    }
  } catch (error) {
    // Fallback description below
  }

  // Fallback description
  return buildFallbackCommercialDescription(name, category, cleanTags, rawTelegramMessage || description);
}

function buildFallbackCommercialDescription(
  name: string,
  category: string,
  tags: string,
  notes: string
): string {
  const parts: string[] = [];
  parts.push(`${name} ha sido diseñado pensando en ofrecer un rendimiento excepcional, máxima durabilidad y un diseño versátil que se adapta a las exigencias del uso diario tanto profesional como recreativo.`);
  parts.push('');
  parts.push(`• Confección y estructura con materiales de primera calidad que aseguran una prolongada vida útil.`);
  parts.push(`• Diseño ergonómico optimizado para brindar máxima comodidad y practicidad en cada momento.`);
  parts.push(`• Acabados finos y resistentes al desgaste continuo en diversas condiciones de uso.`);
  if (category && category !== 'General') {
    parts.push(`• Categoría y estilo comercial especializado: ${category}.`);
  }
  if (tags && tags.trim().length > 0) {
    parts.push(`• Características destacadas: ${tags}.`);
  }
  if (notes && notes.trim().length > 10 && notes.trim() !== name) {
    const cleanNote = notes.trim().replace(/[\r\n]+/g, ' ').slice(0, 140);
    parts.push(`• Especificaciones clave provistas: ${cleanNote}.`);
  }
  parts.push(`• Excelente versatilidad para satisfacer a los clientes más exigentes.`);
  parts.push(`• Garantía de calidad y óptima relación costo-beneficio para el comprador final.`);
  parts.push('');
  parts.push(`Un producto altamente recomendado que garantiza satisfacción y confianza en cada uso.`);
  return parts.join('\n');
}


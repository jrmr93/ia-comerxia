/**
 * gemini-models.ts
 *
 * Módulo centralizado para la gestión dinámica de modelos de Google Gemini.
 *
 * Problema que resuelve:
 *   Google depreca y renombra modelos periódicamente. Tener nombres hardcodeados
 *   en múltiples archivos hace que el sistema se rompa cada vez que Google hace
 *   un cambio. Este módulo provee:
 *
 *   1. Una lista de modelos reales ordenada por preferencia (actualizar aquí cuando
 *      Google anuncie cambios — un solo lugar).
 *   2. Auto-descubrimiento vía API: detecta qué modelos están disponibles para tu
 *      API key y cachea el resultado por 1 hora.
 *   3. Fallback inteligente: si un modelo da 404/not-found salta al siguiente
 *      sin esperar el timeout completo de red.
 *   4. Timeout corto configurable para el ping de conexión (evita 10s de espera).
 */

import { GoogleGenAI } from '@google/genai';

// ─── LISTA MAESTRA DE MODELOS ────────────────────────────────────────────────
// Ordenados de más preferido (rápido + barato) a más pesado.
// Cuando Google añada o retire modelos, SOLO actualiza esta lista.
// Usa los alias estables (sin número de versión fijo) para máxima compatibilidad.
export const GEMINI_CANDIDATE_MODELS: readonly string[] = [
  // ── Familia Flash (rápido, económico, multimodal) — confirmados disponibles ──
  'gemini-3.5-flash-lite',     // Rápido y liviano — GA actual recomendado
  'gemini-3.5-flash',          // Flash estándar actual
  'gemini-3.6-flash',          // Flash siguiente generación
  'gemini-2.5-flash-lite',     // 2.5 lite
  'gemini-2.5-flash',          // 2.5 estándar
  // ── Familia más nueva ──
  'gemini-3.7-flash',          // Más reciente
  'gemini-3.8-flash',          // Más reciente
  'gemini-3.1-flash-lite',     // 3.1 lite
  // ── Alias estables ──
  'gemini-flash-latest',       // Alias al último flash disponible
  'gemini-flash-lite-latest',  // Alias al último flash-lite
] as const;

// Modelo por defecto: el primero de la lista
export const DEFAULT_GEMINI_MODEL = GEMINI_CANDIDATE_MODELS[0];

// ─── CACHÉ DE MODELOS DISPONIBLES POR API KEY ────────────────────────────────
interface AvailableModelsCache {
  models: string[];
  fetchedAt: number;
}

const AVAILABLE_MODELS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
const availableModelsCache = new Map<string, AvailableModelsCache>();

/**
 * Determina una clave de caché corta a partir de los primeros 8 chars de la API key.
 */
function cacheKey(apiKey: string): string {
  return apiKey.slice(0, 8);
}

/**
 * Llama a la API de Gemini para listar los modelos disponibles para esta API key
 * y los cachea durante 1 hora.
 *
 * Si la llamada falla (sin conexión, permisos, etc.) devuelve la lista maestra
 * estática como fallback.
 */
export async function fetchAvailableGeminiModels(apiKey: string): Promise<string[]> {
  const key = cacheKey(apiKey);
  const cached = availableModelsCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < AVAILABLE_MODELS_CACHE_TTL_MS) {
    return cached.models;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const listResponse = await ai.models.list();
    const apiModels: string[] = [];
    for await (const m of listResponse) {
      // El nombre viene como "models/gemini-2.0-flash" — normalizamos
      const name = (m.name || '').replace(/^models\//, '');
      if (name.startsWith('gemini')) {
        apiModels.push(name);
      }
    }

    if (apiModels.length > 0) {
      // Ordenamos según la lista maestra para mantener la preferencia
      const ordered = GEMINI_CANDIDATE_MODELS.filter(m => apiModels.includes(m));
      // Añadimos al final los que la API devolvió pero no están en la lista maestra
      const extra = apiModels.filter(m => !GEMINI_CANDIDATE_MODELS.includes(m as any));
      const result = [...ordered, ...extra];
      availableModelsCache.set(key, { models: result, fetchedAt: Date.now() });
      return result;
    }
  } catch {
    // Silenciamos el error — usamos fallback estático
  }

  // Fallback: lista maestra completa
  return [...GEMINI_CANDIDATE_MODELS];
}

/**
 * Invalida el caché de modelos disponibles para forzar re-descubrimiento.
 * Útil cuando el usuario cambia su API key.
 */
export function invalidateModelsCache(apiKey?: string): void {
  if (apiKey) {
    availableModelsCache.delete(cacheKey(apiKey));
  } else {
    availableModelsCache.clear();
  }
}

/**
 * Construye la lista de modelos a intentar para una operación dada.
 *
 * @param preferredModel   Modelo configurado por el usuario (puede ser un nombre
 *                         antiguo/deprecado — se normaliza automáticamente).
 * @param availableModels  Lista de modelos disponibles (del auto-discovery).
 *                         Si no se provee, usa la lista maestra estática.
 * @returns                Array de modelos ordenado por preferencia, sin duplicados.
 */
export function buildCandidateModelList(
  preferredModel?: string | null,
  availableModels?: string[]
): string[] {
  const base = availableModels ?? [...GEMINI_CANDIDATE_MODELS];
  const normalized = normalizeModelName(preferredModel);

  if (normalized && base.includes(normalized)) {
    // Moverlo al frente
    return [normalized, ...base.filter(m => m !== normalized)];
  }
  if (normalized && !base.includes(normalized)) {
    // No está disponible — igual lo intentamos primero
    return [normalized, ...base];
  }

  return base;
}

/**
 * Normaliza nombres de modelos deprecados/inventados a sus equivalentes reales.
 * Permite migración automática de configuraciones guardadas en BD con nombres viejos.
 */
export function normalizeModelName(modelName?: string | null): string | null {
  if (!modelName || typeof modelName !== 'string') return null;
  const m = modelName.trim();

  // Mapa de nombres realmente deprecados / eliminados → sustitutos actuales
  const ALIASES: Record<string, string> = {
    // Nombres que la API dice que ya no están disponibles
    'gemini-2.0-flash':        'gemini-3.5-flash-lite',
    'gemini-2.0-flash-lite':   'gemini-3.5-flash-lite',
    'gemini-2.0-pro':          'gemini-3.5-flash',
    'gemini-1.5-flash':        'gemini-3.5-flash-lite',
    'gemini-1.5-flash-8b':     'gemini-3.5-flash-lite',
    'gemini-1.5-pro':          'gemini-2.5-flash',
    // Nombres legacy de Gemini 1
    'gemini-pro':              'gemini-3.5-flash',
    'gemini-ultra':            'gemini-2.5-flash',
    // Con prefijo "models/" (lo elimina la API a veces)
    'models/gemini-2.0-flash':      'gemini-3.5-flash-lite',
    'models/gemini-1.5-flash':      'gemini-3.5-flash-lite',
    'models/gemini-1.5-pro':        'gemini-2.5-flash',
    'models/gemini-3.5-flash-lite': 'gemini-3.5-flash-lite',
    'models/gemini-3.5-flash':      'gemini-3.5-flash',
    'models/gemini-2.5-flash':      'gemini-2.5-flash',
  };

  if (ALIASES[m]) return ALIASES[m];

  // Si ya es un nombre válido conocido, devuélvelo tal cual
  if ((GEMINI_CANDIDATE_MODELS as readonly string[]).includes(m)) {
    return m;
  }

  // Si empieza por "gemini-" devuélvelo igualmente (puede ser un modelo nuevo)
  if (m.toLowerCase().startsWith('gemini-')) return m;

  return null;
}

/**
 * Ejecuta una función de Gemini probando modelos en orden hasta que uno funcione.
 *
 * @param models      Lista de modelos a intentar (en orden de preferencia).
 * @param fn          Función async que recibe el nombre del modelo y hace la llamada.
 * @param onModelFail Callback opcional cuando un modelo falla (para logging).
 * @returns           El resultado del primer modelo exitoso.
 * @throws            Si todos los modelos fallan, lanza el último error.
 */
export async function withModelFallback<T>(
  models: string[],
  fn: (model: string) => Promise<T>,
  onModelFail?: (model: string, err: unknown) => void
): Promise<T> {
  let lastError: unknown;

  for (const model of models) {
    try {
      return await fn(model);
    } catch (err: unknown) {
      lastError = err;
      const msg = (err as any)?.message || String(err);

      // Errores de auth o quota — no tiene sentido seguir intentando
      if (isAuthError(msg) || isQuotaError(msg)) {
        throw err;
      }

      // Modelo no disponible — continuamos con el siguiente
      onModelFail?.(model, err);
    }
  }

  throw lastError;
}

// ─── HELPERS DE CLASIFICACIÓN DE ERRORES ─────────────────────────────────────

export function isAuthError(msg: string): boolean {
  return (
    msg.includes('401') ||
    msg.includes('UNAUTHENTICATED') ||
    msg.includes('API_KEY_INVALID') ||
    msg.includes('API key not valid') ||
    msg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED')
  );
}

export function isQuotaError(msg: string): boolean {
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
}

export function isModelNotFoundError(msg: string): boolean {
  return (
    msg.includes('404') ||
    msg.includes('NOT_FOUND') ||
    msg.includes('not found') ||
    msg.includes('Model not found') ||
    msg.includes('is not found') ||
    msg.includes('does not exist') ||
    msg.includes('unsupported model') ||
    msg.includes('model_not_found')
  );
}

/**
 * Wrapper con timeout para operaciones de Gemini.
 * Evita esperas largas cuando el modelo tarda en responder o está caído.
 *
 * @param promise  La promesa a ejecutar
 * @param ms       Milliseconds de timeout (default: 8000ms)
 * @param label    Etiqueta para el mensaje de error
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = 8000,
  label: string = 'Gemini'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[${label}] Timeout después de ${ms}ms`)),
      ms
    );
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); }
    );
  });
}

import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { getAiClient, hasValidAiApiKey } from './gemini-parser.ts';
import { parseVideoUrl, ParsedVideoInfo } from '../utils/video-helper.ts';

export interface VideoSearchResult {
  title: string;
  videoUrl: string;
  embedUrl: string;
  platform: 'youtube' | 'youtube_shorts' | 'tiktok' | 'vimeo' | 'instagram' | 'direct' | 'unknown';
  thumbnailUrl?: string;
  authorOrChannel?: string;
  description?: string;
  isRecommended?: boolean;
}

export interface AiVideoSearchResponse {
  query: string;
  brand?: string;
  model?: string;
  videos: VideoSearchResult[];
  searchTips?: string[];
}

/**
 * Cleans marketing terms, emojis and unwanted characters from product name to get a clean search term.
 */
function cleanProductSearchName(rawName: string): string {
  if (!rawName) return '';
  return rawName
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // remove emojis
    .replace(/\b(OFERTA|PROMO|PROMOCION|DESCUENTO|LIQUIDACION|NUEVO|ORIGINAL|COMBO|PACK|ENVIO GRATIS|BARATO)\b/gi, '')
    .replace(/-\d+%/g, '') // remove -20% etc
    .replace(/[\[\]\(\)\{\}\*\#\$\@\!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Searches YouTube in real time to fetch actual existing videos, reviews, and unboxings.
 */
async function scrapeYouTubeRealVideos(query: string, maxResults: number = 10): Promise<VideoSearchResult[]> {
  const cleanQ = query.trim();
  if (!cleanQ) return [];

  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQ)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
    });

    if (!res.ok) return [];
    const html = await res.text();

    const match =
      html.match(/var ytInitialData = ({.*?});<\/script>/s) ||
      html.match(/ytInitialData\s*=\s*({.+?});/);

    if (!match) {
      // Fallback regex extraction of video IDs and titles
      const vidMatches = [...html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)].map((m) => m[1]);
      const uniqueIds = [...new Set(vidMatches)].slice(0, maxResults);
      return uniqueIds.map((id, index) => ({
        title: `${cleanQ} - Video ${index + 1}`,
        videoUrl: `https://www.youtube.com/watch?v=${id}`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
        platform: 'youtube',
        thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        authorOrChannel: 'YouTube Creator',
        description: 'Demostración y reseña real de producto en YouTube',
        isRecommended: index === 0,
      }));
    }

    const data = JSON.parse(match[1]);
    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;

    if (!Array.isArray(contents)) return [];

    const results: VideoSearchResult[] = [];
    const seen = new Set<string>();

    for (const section of contents) {
      const itemSection = section?.itemSectionRenderer?.contents;
      if (!Array.isArray(itemSection)) continue;

      for (const item of itemSection) {
        if (item.videoRenderer) {
          const vr = item.videoRenderer;
          const vidId = vr.videoId;
          if (vidId && !seen.has(vidId)) {
            seen.add(vidId);
            const title =
              vr.title?.runs?.map((r: any) => r.text).join('') ||
              vr.title?.simpleText ||
              `${cleanQ} - Reseña`;
            const channel =
              vr.ownerText?.runs?.[0]?.text ||
              vr.shortBylineText?.runs?.[0]?.text ||
              'YouTube';
            const views =
              vr.viewCountText?.simpleText ||
              vr.shortViewCountText?.simpleText ||
              '';
            const desc =
              vr.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r: any) => r.text).join('') ||
              views ||
              'Reseña y prueba en vivo';

            const thumb =
              vr.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
              `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`;

            results.push({
              title,
              videoUrl: `https://www.youtube.com/watch?v=${vidId}`,
              embedUrl: `https://www.youtube-nocookie.com/embed/${vidId}`,
              platform: 'youtube',
              thumbnailUrl: thumb,
              authorOrChannel: channel,
              description: desc,
              isRecommended: results.length === 0,
            });
          }
        } else if (item.reelShelfRenderer) {
          const reels = item.reelShelfRenderer.items;
          for (const r of reels || []) {
            const lockup = r.reelItemRenderer;
            const vidId = lockup?.videoId;
            if (vidId && !seen.has(vidId)) {
              seen.add(vidId);
              const title = lockup.headline?.simpleText || `${cleanQ} (Shorts)`;
              results.push({
                title,
                videoUrl: `https://www.youtube.com/shorts/${vidId}`,
                embedUrl: `https://www.youtube-nocookie.com/embed/${vidId}`,
                platform: 'youtube_shorts',
                thumbnailUrl: `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
                authorOrChannel: 'YouTube Shorts',
                description: 'Demostración vertical rápida de producto',
                isRecommended: false,
              });
            }
          }
        }

        if (results.length >= maxResults) break;
      }

      if (results.length >= maxResults) break;
    }

    return results;
  } catch (err) {
    console.error('Error scraping real YouTube videos:', err);
    return [];
  }
}

/**
 * Searches product videos using Real YouTube Search combined with Gemini AI query intelligence.
 */
export async function searchProductVideos(params: {
  productName: string;
  brand?: string;
  category?: string;
  description?: string;
  sku?: string;
  customQuery?: string;
}): Promise<AiVideoSearchResponse> {
  const cleanName = cleanProductSearchName(params.productName || '');
  const searchBase = cleanProductSearchName(params.customQuery || cleanName);
  const cat = params.category || 'General';

  const defaultTips = [
    'Búsqueda en tiempo real conectada a YouTube para obtener videos, reviews y unboxings 100% reales.',
    'Puedes afinar la búsqueda agregando la marca o modelo (ej. "Stanley Quencher 40oz review").',
    'Acepta enlaces directos de YouTube, Shorts, TikTok, Instagram Reels, Vimeo o videos subidos en MP4.',
  ];

  // Formulate high-relevance search queries
  const queriesToTry: string[] = [];

  if (searchBase) {
    queriesToTry.push(`${searchBase} review espanol`);
    queriesToTry.push(`${searchBase} unboxing review`);
    queriesToTry.push(`${searchBase} prueba`);
    queriesToTry.push(searchBase);
  } else if (cleanName) {
    queriesToTry.push(`${cleanName} review espanol`);
    queriesToTry.push(`${cleanName} unboxing`);
  }

  // 1. First, search YouTube live to fetch real, existing videos
  let realVideos: VideoSearchResult[] = [];
  const seenUrls = new Set<string>();

  for (const q of queriesToTry) {
    try {
      const found = await scrapeYouTubeRealVideos(q, 8);
      for (const v of found) {
        if (!seenUrls.has(v.videoUrl)) {
          seenUrls.add(v.videoUrl);
          realVideos.push(v);
        }
      }
      if (realVideos.length >= 6) {
        break;
      }
    } catch {
      // Continue to next query
    }
  }

  // 2. If AI is available, use Gemini to refine detected brand and model
  let detectedBrand = params.brand;
  let detectedModel = '';

  if (hasValidAiApiKey()) {
    try {
      const ai = getAiClient();
      const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-flash-latest'];
      const prompt = `Analiza este producto y extrae la Marca exacta y el Modelo exacto para búsqueda de videos:
Producto: ${cleanName}
Categoría: ${cat}
SKU: ${params.sku || 'N/A'}
Descripción: ${params.description || 'N/A'}

Devuelve únicamente JSON:
{
  "brand": "marca",
  "model": "modelo"
}`;

      for (const model of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW,
              },
            },
          });
          const text = response.text?.trim();
          if (text) {
            const parsed = JSON.parse(text);
            if (parsed.brand) detectedBrand = parsed.brand;
            if (parsed.model) detectedModel = parsed.model;
            break;
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Ignore AI errors, we already have real videos from YouTube search
    }
  }

  // 3. Fallback: If no direct videos could be fetched, provide curated search links
  if (realVideos.length === 0) {
    const cleanSearchEncoded = encodeURIComponent(searchBase || cleanName);
    realVideos = [
      {
        title: `Ver Reseñas y Pruebas en YouTube: ${searchBase}`,
        videoUrl: `https://www.youtube.com/results?search_query=${cleanSearchEncoded}+review+espanol`,
        embedUrl: `https://www.youtube-nocookie.com/embed?listType=search&list=${cleanSearchEncoded}+review`,
        platform: 'youtube',
        authorOrChannel: 'YouTube Search',
        description: `Búsqueda directa de videos reales de ${cleanName}`,
        isRecommended: true,
      },
      {
        title: `Ver Videos Cortos (Shorts): ${searchBase}`,
        videoUrl: `https://www.youtube.com/results?search_query=${cleanSearchEncoded}+shorts`,
        embedUrl: `https://www.youtube-nocookie.com/embed?listType=search&list=${cleanSearchEncoded}+shorts`,
        platform: 'youtube_shorts',
        authorOrChannel: 'YouTube Shorts',
        description: 'Videos en formato vertical para smartphones',
      },
      {
        title: `Videos Virales en TikTok: ${searchBase}`,
        videoUrl: `https://www.tiktok.com/search?q=${cleanSearchEncoded}`,
        embedUrl: `https://www.tiktok.com/search?q=${cleanSearchEncoded}`,
        platform: 'tiktok',
        authorOrChannel: 'TikTok',
        description: 'Tendencias y demostraciones de creadores',
      },
    ];
  }

  // Mark the first one as recommended if none is marked
  if (!realVideos.some((v) => v.isRecommended) && realVideos.length > 0) {
    realVideos[0].isRecommended = true;
  }

  return {
    query: searchBase || cleanName,
    brand: detectedBrand,
    model: detectedModel,
    videos: realVideos,
    searchTips: defaultTips,
  };
}

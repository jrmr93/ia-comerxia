import { normalizeMediaUrl } from './media-helper.ts';

/**
 * Video Helper Utility
 * Parses and formats video URLs from YouTube, YouTube Shorts, TikTok, Vimeo, Direct MP4/WebM, and Reels.
 */

export interface ParsedVideoInfo {
  originalUrl: string;
  platform: 'youtube' | 'youtube_shorts' | 'tiktok' | 'vimeo' | 'instagram' | 'direct' | 'unknown';
  id?: string;
  embedUrl: string;
  isDirect: boolean;
  thumbnailUrl?: string;
}

export function parseVideoUrl(
  rawUrl: string | null | undefined,
  options?: { autoplay?: boolean }
): ParsedVideoInfo | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const url = rawUrl.trim();
  if (!url) return null;

  const autoPlayParam = options?.autoplay === false ? '0' : '1';
  const normalized = normalizeMediaUrl(url);

  // Direct video file or local upload (MP4, WebM, OGG, /uploads/...)
  if (
    normalized.startsWith('/uploads/') ||
    normalized.startsWith('/api/media/') ||
    url.startsWith('data:video/') ||
    /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(normalized)
  ) {
    return {
      originalUrl: url,
      platform: 'direct',
      embedUrl: normalized,
      isDirect: true,
    };
  }

  // YouTube Shorts: https://www.youtube.com/shorts/VIDEO_ID or youtube.com/shorts/VIDEO_ID?feature=share
  const ytShortsMatch = url.match(/(?:youtube\.com\/shorts\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/i);
  if (ytShortsMatch && ytShortsMatch[1]) {
    const id = ytShortsMatch[1];
    return {
      originalUrl: url,
      platform: 'youtube_shorts',
      id,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=${autoPlayParam}&rel=0&modestbranding=1&enablejsapi=1`,
      isDirect: false,
      thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    };
  }

  // Standard YouTube: https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([a-zA-Z0-9_-]{11})/i);
  if (ytMatch && ytMatch[1]) {
    const id = ytMatch[1];
    return {
      originalUrl: url,
      platform: 'youtube',
      id,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=${autoPlayParam}&rel=0&modestbranding=1&enablejsapi=1`,
      isDirect: false,
      thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    };
  }

  // Vimeo: https://vimeo.com/VIDEO_ID or https://player.vimeo.com/video/VIDEO_ID
  const vimeoMatch = url.match(/(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)([0-9]+)/i);
  if (vimeoMatch && vimeoMatch[1]) {
    const id = vimeoMatch[1];
    return {
      originalUrl: url,
      platform: 'vimeo',
      id,
      embedUrl: `https://player.vimeo.com/video/${id}?autoplay=${autoPlayParam}&badge=0&autopause=0&player_id=0&app_id=58479`,
      isDirect: false,
    };
  }

  // TikTok: https://www.tiktok.com/@user/video/VIDEO_ID or tiktok.com/embed/v2/VIDEO_ID
  const tiktokMatch = url.match(/tiktok\.com\/@[^/]+\/video\/([0-9]+)/i) || url.match(/tiktok\.com\/embed\/v2\/([0-9]+)/i);
  if (tiktokMatch && tiktokMatch[1]) {
    const id = tiktokMatch[1];
    return {
      originalUrl: url,
      platform: 'tiktok',
      id,
      embedUrl: `https://www.tiktok.com/embed/v2/${id}`,
      isDirect: false,
    };
  }

  // Instagram Reel: https://www.instagram.com/reel/CODE/ or /p/CODE/
  const igMatch = url.match(/instagram\.com\/(?:reel|p)\/([a-zA-Z0-9_-]+)/i);
  if (igMatch && igMatch[1]) {
    const id = igMatch[1];
    return {
      originalUrl: url,
      platform: 'instagram',
      id,
      embedUrl: `https://www.instagram.com/reel/${id}/embed`,
      isDirect: false,
    };
  }

  // Generic fallback if URL has http/https
  return {
    originalUrl: url,
    platform: 'unknown',
    embedUrl: url,
    isDirect: false,
  };
}

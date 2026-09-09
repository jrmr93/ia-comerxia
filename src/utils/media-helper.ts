/**
 * Media Helper Utility for Comerxia
 * Normalizes image and video URLs so that media references are portable across
 * different hosts, IP addresses, domains, and environments (e.g. migrating
 * from local development to production or another server).
 */

export function normalizeMediaUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';
  let clean = url.trim();
  if (!clean || clean === 'null' || clean === 'undefined') return '';

  // Data URLs (base64) are self-contained
  if (clean.startsWith('data:')) return clean;

  // Blob URLs
  if (clean.startsWith('blob:')) return clean;

  // Normalize Windows backslashes (e.g., uploads\img.jpg or C:\...\uploads\img.jpg)
  clean = clean.replace(/\\/g, '/');

  // If the URL contains an absolute reference to /uploads/ (e.g., http://localhost:3000/uploads/img.jpg
  // or http://192.168.1.50:3000/uploads/img.jpg or https://oldserver.com/uploads/img.jpg)
  const uploadsIdx = clean.indexOf('/uploads/');
  if (uploadsIdx !== -1) {
    return clean.slice(uploadsIdx); // Returns "/uploads/filename.ext"
  }

  // Same for /api/media/
  const apiMediaIdx = clean.indexOf('/api/media/');
  if (apiMediaIdx !== -1) {
    return clean.slice(apiMediaIdx); // Returns "/api/media/filename.ext"
  }

  // If the path starts with "uploads/" without leading slash
  if (clean.startsWith('uploads/')) {
    return '/' + clean;
  }

  // If the path starts with "api/media/" without leading slash
  if (clean.startsWith('api/media/')) {
    return '/' + clean;
  }

  // Handle bare filename e.g. "img_xxx.jpg" or "vid_xxx.mp4"
  if (
    !clean.startsWith('/') &&
    !clean.startsWith('http://') &&
    !clean.startsWith('https://') &&
    /\.(jpg|jpeg|png|webp|gif|svg|avif|mp4|webm|mov|ogg|m4v)$/i.test(clean)
  ) {
    return '/uploads/' + clean;
  }

  // Handle protocol-relative URLs
  if (clean.startsWith('//')) {
    return 'https:' + clean;
  }

  return clean;
}

/**
 * Provides an alternate local media URL (switching between /uploads/ and /api/media/)
 * as an automatic fallback when migrating across servers.
 */
export function getFallbackMediaUrl(url: string | null | undefined): string {
  const norm = normalizeMediaUrl(url);
  if (!norm) return '';
  if (norm.startsWith('/uploads/')) {
    return norm.replace('/uploads/', '/api/media/');
  }
  if (norm.startsWith('/api/media/')) {
    return norm.replace('/api/media/', '/uploads/');
  }
  return norm;
}

/**
 * Extracts and normalizes all available photos for an inventory product
 */
export function getProductPhotosWithFallback(item: {
  imageUrl?: string | null;
  images?: string[];
  extractedAttributes?: string | null;
}): string[] {
  const list: string[] = [];

  const addNormalized = (raw: string | null | undefined) => {
    const normalized = normalizeMediaUrl(raw);
    if (normalized && !list.includes(normalized)) {
      list.push(normalized);
    }
  };

  // 1. Primary imageUrl
  if (item.imageUrl) {
    addNormalized(item.imageUrl);
  }

  // 2. Parsed images array on item object
  if (Array.isArray(item.images)) {
    item.images.forEach((img) => addNormalized(img));
  }

  // 3. Extracted attributes JSON string
  if (item.extractedAttributes) {
    try {
      const parsed = typeof item.extractedAttributes === 'string' 
        ? JSON.parse(item.extractedAttributes) 
        : item.extractedAttributes;

      if (parsed && Array.isArray(parsed.images)) {
        parsed.images.forEach((img: string) => addNormalized(img));
      }
    } catch {}
  }

  return list;
}

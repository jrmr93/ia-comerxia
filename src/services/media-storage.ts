import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Setup uploads directory
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export function ensureUploadsDirExists(): string {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('Error creating uploads directory:', err);
  }
  return UPLOADS_DIR;
}

// Map content-types to extensions
function getExtensionFromMime(mimeType: string): string {
  const cleanMime = (mimeType || '').toLowerCase().trim();
  if (cleanMime.includes('jpeg') || cleanMime.includes('jpg')) return 'jpg';
  if (cleanMime.includes('png')) return 'png';
  if (cleanMime.includes('webp')) return 'webp';
  if (cleanMime.includes('gif')) return 'gif';
  if (cleanMime.includes('svg')) return 'svg';
  if (cleanMime.includes('avif')) return 'avif';
  if (cleanMime.includes('mp4')) return 'mp4';
  if (cleanMime.includes('webm')) return 'webm';
  if (cleanMime.includes('quicktime') || cleanMime.includes('mov')) return 'mov';
  if (cleanMime.includes('ogg')) return 'ogg';
  return 'jpg';
}

/**
 * Saves a binary buffer as an image file in /uploads (asynchronous, non-blocking)
 */
export async function saveImageBufferLocally(
  buffer: Buffer,
  mimeType: string = 'image/jpeg',
  fileHint?: string
): Promise<string> {
  ensureUploadsDirExists();
  const ext = getExtensionFromMime(mimeType) || 'jpg';
  const hash = crypto.createHash('md5').update(buffer.slice(0, 10000)).digest('hex');
  const filename = `img_${hash}${fileHint ? `_${fileHint.slice(0, 20)}` : ''}.${ext}`.replace(/[^a-zA-Z0-9_.-]/g, '');
  const filePath = path.join(UPLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    await fs.promises.writeFile(filePath, buffer);
  }

  return `/uploads/${filename}`;
}

/**
 * Saves a binary buffer as a video file in /uploads
 */
export async function saveVideoBufferLocally(
  buffer: Buffer,
  mimeType: string = 'video/mp4',
  fileHint?: string
): Promise<string> {
  ensureUploadsDirExists();
  const ext = getExtensionFromMime(mimeType) || 'mp4';
  const hash = crypto.createHash('md5').update(buffer.slice(0, 10000)).digest('hex');
  const filename = `vid_${hash}${fileHint ? `_${fileHint.slice(0, 20)}` : ''}.${ext}`.replace(/[^a-zA-Z0-9_.-]/g, '');
  const filePath = path.join(UPLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    await fs.promises.writeFile(filePath, buffer);
  }

  return `/uploads/${filename}`;
}

/**
 * Persists a video from Base64 or returns clean video URL.
 */
export async function persistVideoLocally(urlOrBase64: string | null | undefined): Promise<string | null> {
  if (!urlOrBase64 || typeof urlOrBase64 !== 'string') return null;
  const input = urlOrBase64.trim();
  if (!input) return null;

  ensureUploadsDirExists();

  // If already a self-hosted local upload or contains /uploads/, extract and return clean path
  const uploadsIdx = input.indexOf('/uploads/');
  if (uploadsIdx !== -1) {
    return input.slice(uploadsIdx);
  }
  const apiMediaIdx = input.indexOf('/api/media/');
  if (apiMediaIdx !== -1) {
    return input.slice(apiMediaIdx);
  }
  if (input.startsWith('uploads/')) {
    return '/' + input;
  }
  if (input.startsWith('api/media/')) {
    return '/' + input;
  }

  // Handle Base64 Video Data URLs
  if (input.startsWith('data:video/') || input.startsWith('data:application/octet-stream')) {
    try {
      const matches = input.match(/^data:([A-Za-z0-9-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        const ext = getExtensionFromMime(mimeType) || 'mp4';

        const hash = crypto.createHash('md5').update(base64Data.slice(0, 5000) + base64Data.length).digest('hex');
        const filename = `vid_${hash}.${ext}`;
        const filePath = path.join(UPLOADS_DIR, filename);

        if (!fs.existsSync(filePath)) {
          const buffer = Buffer.from(base64Data, 'base64');
          fs.writeFileSync(filePath, buffer);
        }

        return `/uploads/${filename}`;
      }
    } catch (b64Err) {
      console.warn('Error saving base64 video to local uploads:', b64Err);
      return input;
    }
  }

  return input;
}

/**
 * Persists an image from an external URL or Base64 string into the local /uploads directory.
 * Returns the permanent self-hosted relative URL (e.g. /uploads/img_123456.jpg).
 */
export async function persistImageLocally(
  urlOrBase64: string | null | undefined,
  fallbackUrl?: string
): Promise<string | null> {
  if (!urlOrBase64 || typeof urlOrBase64 !== 'string') return null;
  const input = urlOrBase64.trim();
  if (!input) return null;

  ensureUploadsDirExists();

  // If already a self-hosted local upload, return clean path
  const uploadsIdx = input.indexOf('/uploads/');
  if (uploadsIdx !== -1) {
    return input.slice(uploadsIdx);
  }
  const apiMediaIdx = input.indexOf('/api/media/');
  if (apiMediaIdx !== -1) {
    return input.slice(apiMediaIdx);
  }
  if (input.startsWith('uploads/')) {
    return '/' + input;
  }
  if (input.startsWith('api/media/')) {
    return '/' + input;
  }

  // Handle Base64 Data URLs
  if (input.startsWith('data:image/')) {
    try {
      const matches = input.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        const ext = getExtensionFromMime(mimeType);
        
        // Hash content for deduplication
        const hash = crypto.createHash('md5').update(base64Data.slice(0, 5000) + base64Data.length).digest('hex');
        const filename = `b64_${hash}.${ext}`;
        const filePath = path.join(UPLOADS_DIR, filename);

        if (!fs.existsSync(filePath)) {
          const buffer = Buffer.from(base64Data, 'base64');
          fs.writeFileSync(filePath, buffer);
        }

        return `/uploads/${filename}`;
      }
    } catch (b64Err) {
      console.warn('Error saving base64 image to local uploads:', b64Err);
      return input;
    }
  }

  // Helper to attempt downloading a specific URL
  const tryDownload = async (targetUrl: string): Promise<string | null> => {
    let clean = targetUrl.trim();
    if (clean.startsWith('//')) clean = `https:${clean}`;
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) return null;

    try {
      const urlHash = crypto.createHash('md5').update(clean).digest('hex');
      const existingFiles = fs.readdirSync(UPLOADS_DIR);
      const matched = existingFiles.find((f) => f.startsWith(`img_${urlHash}.`));
      if (matched) {
        return `/uploads/${matched}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

      let originHeader = '';
      try {
        const u = new URL(clean);
        originHeader = `${u.protocol}//${u.hostname}`;
      } catch {}

      const response = await fetch(clean, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
          ...(originHeader ? { Referer: originHeader } : {}),
        },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const contentType = response.headers.get('content-type') || '';
      // If anti-bot challenge returned HTML instead of an image, fail download
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Discard empty or tiny tracking pixels (< 300 bytes)
      if (buffer.length <= 300) {
        return null;
      }

      const ext = getExtensionFromMime(contentType || 'image/jpeg');
      const filename = `img_${urlHash}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, filename);

      fs.writeFileSync(filePath, buffer);
      return `/uploads/${filename}`;
    } catch {
      return null;
    }
  };

  // Handle External HTTP / HTTPS URLs (e.g. Unsplash, CDNs, Telegram, Supplier links)
  let cleanUrl = input;
  if (cleanUrl.startsWith('//')) cleanUrl = `https:${cleanUrl}`;

  if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
    const downloaded = await tryDownload(cleanUrl);
    if (downloaded) {
      return downloaded;
    }

    // If primary failed and fallback (e.g. CDN thumbnail) is provided, try downloading fallback!
    if (fallbackUrl && fallbackUrl !== cleanUrl) {
      const fallbackDownloaded = await tryDownload(fallbackUrl);
      if (fallbackDownloaded) {
        return fallbackDownloaded;
      }
    }

    // If direct downloads failed due to CORS/hotlinking, route through self-hosted proxy
    return `/api/proxy-image?url=${encodeURIComponent(cleanUrl)}`;
  }

  return input;
}

export type ImageCandidateInput = string | { url: string; fallbackUrl?: string; thumbnailUrl?: string };

/**
 * Persists a list of image URLs locally in parallel/batch.
 */
export async function persistImageListLocally(urls: ImageCandidateInput[]): Promise<string[]> {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  
  const results = await Promise.all(
    urls.map(async (u) => {
      const mainUrl = typeof u === 'string' ? u : u?.url;
      const fallback = typeof u === 'object' && u ? u.fallbackUrl || u.thumbnailUrl : undefined;
      if (!mainUrl) return null;
      const persisted = await persistImageLocally(mainUrl, fallback);
      return persisted || mainUrl;
    })
  );

  return results.filter(Boolean) as string[];
}

/**
 * Inspects all inventory items in the database and ensures any external URLs (http/https)
 * or heavy Base64 strings are downloaded and converted to self-hosted local /uploads/ URLs.
 */
export async function syncAllInventoryImagesLocally(
  getAllItemsFn: () => Promise<any[]>,
  updateItemFn: (id: number, data: any) => Promise<any>
): Promise<{ totalScanned: number; imagesPersisted: number; itemsUpdated: number }> {
  try {
    const items = await getAllItemsFn();
    let imagesPersisted = 0;
    let itemsUpdated = 0;

    for (const item of items) {
      let needsUpdate = false;
      let newPrimaryImage = item.imageUrl;
      let parsedAttr: Record<string, any> = {};

      if (item.extractedAttributes) {
        try {
          parsedAttr = JSON.parse(item.extractedAttributes);
        } catch {}
      }

      let currentImages: string[] = Array.isArray(parsedAttr.images) ? [...parsedAttr.images] : [];
      if (currentImages.length === 0 && item.imageUrl) {
        currentImages = [item.imageUrl];
      }

      // Check primary image
      if (item.imageUrl && (item.imageUrl.startsWith('http://') || item.imageUrl.startsWith('https://') || item.imageUrl.startsWith('data:image/'))) {
        const persisted = await persistImageLocally(item.imageUrl);
        if (persisted && persisted !== item.imageUrl) {
          newPrimaryImage = persisted;
          needsUpdate = true;
          imagesPersisted++;
        }
      }

      // Check gallery images
      const newImagesList: string[] = [];
      for (const imgUrl of currentImages) {
        if (imgUrl && (imgUrl.startsWith('http://') || imgUrl.startsWith('https://') || imgUrl.startsWith('data:image/'))) {
          const persisted = await persistImageLocally(imgUrl);
          if (persisted && persisted !== imgUrl) {
            newImagesList.push(persisted);
            needsUpdate = true;
            imagesPersisted++;
          } else {
            newImagesList.push(imgUrl);
          }
        } else if (imgUrl) {
          newImagesList.push(imgUrl);
        }
      }

      // Check video URL
      let newVideoUrl = item.videoUrl;
      if (item.videoUrl) {
        if (item.videoUrl.startsWith('data:video/') || item.videoUrl.includes('/uploads/')) {
          const persistedVid = await persistVideoLocally(item.videoUrl);
          if (persistedVid && persistedVid !== item.videoUrl) {
            newVideoUrl = persistedVid;
            needsUpdate = true;
          }
        }
      }

      if (needsUpdate) {
        parsedAttr.images = newImagesList;
        parsedAttr.totalPhotos = newImagesList.length;
        if (!newPrimaryImage && newImagesList.length > 0) {
          newPrimaryImage = newImagesList[0];
        }

        await updateItemFn(item.id, {
          imageUrl: newPrimaryImage,
          videoUrl: newVideoUrl,
          extractedAttributes: JSON.stringify(parsedAttr),
        });
        itemsUpdated++;
      }
    }

    return {
      totalScanned: items.length,
      imagesPersisted,
      itemsUpdated,
    };
  } catch (err) {
    console.error('Error during bulk image synchronization:', err);
    return { totalScanned: 0, imagesPersisted: 0, itemsUpdated: 0 };
  }
}

/**
 * Returns statistics about the local uploads directory.
 */
export function getUploadsStats(): { count: number; totalSizeBytes: number; totalSizeMb: string } {
  ensureUploadsDirExists();
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    let totalSizeBytes = 0;
    let validCount = 0;

    for (const file of files) {
      if (file.startsWith('.')) continue;
      const filePath = path.join(UPLOADS_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          totalSizeBytes += stat.size;
          validCount++;
        }
      } catch {}
    }

    const totalSizeMb = (totalSizeBytes / (1024 * 1024)).toFixed(2);
    return { count: validCount, totalSizeBytes, totalSizeMb };
  } catch (err) {
    console.error('Error calculating uploads stats:', err);
    return { count: 0, totalSizeBytes: 0, totalSizeMb: '0.00' };
  }
}

/**
 * Generates a ZIP Buffer containing all images inside the /uploads folder.
 */
export async function createUploadsZipBuffer(): Promise<Buffer> {
  const AdmZip = (await import('adm-zip')).default;
  ensureUploadsDirExists();

  const zip = new AdmZip();
  const files = fs.readdirSync(UPLOADS_DIR);

  for (const file of files) {
    if (file.startsWith('.')) continue;
    const filePath = path.join(UPLOADS_DIR, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        const fileContent = fs.readFileSync(filePath);
        zip.addFile(file, fileContent);
      }
    } catch (e) {
      console.warn(`Could not add file ${file} to zip:`, e);
    }
  }

  // Also include a README inside the zip with restore instructions
  const readmeContent = `# Respaldos de Imágenes Comerxia
Para restaurar este respaldo en tu servidor:
1. Descomprime este archivo ZIP.
2. Copia todos los archivos directamente dentro de la carpeta 'uploads/' en la raíz de tu proyecto Comerxia.
3. Asegúrate de que el usuario de Node.js tenga permisos de lectura y escritura sobre la carpeta.
`;
  zip.addFile('LEEME_RESTAURACION.txt', Buffer.from(readmeContent, 'utf-8'));

  return zip.toBuffer();
}

/**
 * Restores / extracts images from a ZIP buffer into the /uploads folder.
 */
export async function restoreUploadsFromZipBuffer(zipBuffer: Buffer): Promise<{ restoredCount: number; errors: string[] }> {
  const AdmZip = (await import('adm-zip')).default;
  ensureUploadsDirExists();

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  let restoredCount = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory || entry.entryName.startsWith('.') || entry.entryName === 'LEEME_RESTAURACION.txt') {
      continue;
    }

    const cleanFilename = path.basename(entry.entryName);
    if (!cleanFilename || cleanFilename.startsWith('.')) continue;

    // Security check: Only allow safe image and video file names
    if (!/\.(jpg|jpeg|png|webp|gif|svg|avif|mp4|webm|mov|ogg|m4v)$/i.test(cleanFilename)) {
      continue;
    }

    try {
      const destPath = path.join(UPLOADS_DIR, cleanFilename);
      const data = entry.getData();
      fs.writeFileSync(destPath, data);
      restoredCount++;
    } catch (err: any) {
      errors.push(`Error al restaurar ${cleanFilename}: ${err?.message}`);
    }
  }

  return { restoredCount, errors };
}

/**
 * Extracts all unique media paths (/uploads/filename) from a product record or attributes.
 */
export function extractMediaUrlsFromProduct(item: any): string[] {
  if (!item) return [];
  const urls = new Set<string>();

  const checkAndAdd = (val: any) => {
    if (!val || typeof val !== 'string') return;
    const str = val.trim();
    if (!str) return;
    // Normalize /uploads/ or /api/media/
    const uploadsIdx = str.indexOf('/uploads/');
    if (uploadsIdx !== -1) {
      urls.add(str.slice(uploadsIdx));
      return;
    }
    const apiMediaIdx = str.indexOf('/api/media/');
    if (apiMediaIdx !== -1) {
      const filename = path.basename(str);
      urls.add(`/uploads/${filename}`);
      return;
    }
    if (str.startsWith('uploads/')) {
      urls.add('/' + str);
      return;
    }
  };

  checkAndAdd(item.imageUrl);
  checkAndAdd(item.videoUrl);

  if (Array.isArray(item.images)) {
    item.images.forEach(checkAndAdd);
  }

  if (item.extractedAttributes) {
    try {
      const parsed = typeof item.extractedAttributes === 'string'
        ? JSON.parse(item.extractedAttributes)
        : item.extractedAttributes;
      if (parsed) {
        checkAndAdd(parsed.imageUrl);
        checkAndAdd(parsed.videoUrl);
        checkAndAdd(parsed.video);
        if (Array.isArray(parsed.images)) {
          parsed.images.forEach(checkAndAdd);
        }
      }
    } catch {}
  }

  return Array.from(urls);
}

/**
 * Checks if a specific media file (/uploads/... or filename) is still referenced anywhere in the inventory.
 * If exceptProductId is provided, references belonging to that product ID are ignored.
 */
export async function isMediaReferencedInInventory(
  mediaPathOrUrl: string,
  exceptProductId?: number
): Promise<boolean> {
  if (!mediaPathOrUrl || typeof mediaPathOrUrl !== 'string') return false;
  const filename = path.basename(mediaPathOrUrl.trim());
  if (!filename || filename.startsWith('.')) return false;

  try {
    // Dynamic import to avoid circular dependency
    const { getInventoryItems } = await import('../db/inventory.ts');
    const allItems = await getInventoryItems();

    for (const item of allItems) {
      if (exceptProductId !== undefined && item.id === exceptProductId) {
        continue;
      }
      const itemUrls = extractMediaUrlsFromProduct(item);
      for (const u of itemUrls) {
        if (path.basename(u) === filename) {
          return true; // Still referenced by this other product!
        }
      }
    }
  } catch (err) {
    console.error('Error checking if media is referenced in inventory:', err);
    // Be conservative: if check fails, assume it is referenced to prevent accidental deletion
    return true;
  }

  return false;
}

/**
 * Safely deletes a file from /uploads if it is not referenced by any other product in inventory.
 * Returns true if deleted, false if skipped or failed.
 */
export async function deleteMediaFileIfUnreferenced(
  mediaPathOrUrl: string,
  exceptProductId?: number
): Promise<boolean> {
  if (!mediaPathOrUrl || typeof mediaPathOrUrl !== 'string') return false;
  const filename = path.basename(mediaPathOrUrl.trim());
  if (!filename || filename.startsWith('.')) return false;

  // Security guard: ensure file stays inside UPLOADS_DIR and has a media extension
  if (!/\.(jpg|jpeg|png|webp|gif|svg|avif|mp4|webm|mov|ogg|m4v)$/i.test(filename)) {
    return false;
  }

  ensureUploadsDirExists();
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const isReferenced = await isMediaReferencedInInventory(filename, exceptProductId);
  if (isReferenced) {
    console.log(`[Media Storage] Archivo ${filename} no se elimina porque sigue referenciado en otros productos.`);
    return false;
  }

  try {
    fs.unlinkSync(filePath);
    console.log(`[Media Storage] Archivo ${filename} eliminado físicamente del servidor (sin referencias).`);
    return true;
  } catch (err) {
    console.error(`[Media Storage] Error al eliminar archivo físico ${filePath}:`, err);
    return false;
  }
}

/**
 * Deletes all unreferenced media files belonging to a list of media URLs or a deleted product.
 */
export async function cleanupUnreferencedMediaList(
  mediaUrls: string[],
  exceptProductId?: number
): Promise<{ deleted: string[]; retained: string[] }> {
  const deleted: string[] = [];
  const retained: string[] = [];

  const uniqueFiles = new Set<string>();
  for (const u of mediaUrls) {
    if (u && typeof u === 'string') {
      uniqueFiles.add(u);
    }
  }

  for (const url of uniqueFiles) {
    const wasDeleted = await deleteMediaFileIfUnreferenced(url, exceptProductId);
    if (wasDeleted) {
      deleted.push(url);
    } else {
      retained.push(url);
    }
  }

  return { deleted, retained };
}


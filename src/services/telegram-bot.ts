import {
  getTelegramConfig,
  updateTelegramConfig,
  getAiConfig,
  createInventoryItem,
  createTelegramMessageRecord,
  appendImageToInventoryItem,
  setInventoryItemVideo,
  findExistingInventoryItem,
  generateNextSku,
  getSupplierSkuPrefix,
} from '../db/inventory.ts';
import { parseSupplierTelegramMessage } from './gemini-parser.ts';
import { saveVideoBufferLocally, saveImageBufferLocally } from './media-storage.ts';
import {
  extractProductUrlFromText,
  scrapeAndProcessWebProduct,
  WebProductScrapeResult,
} from './web-product-scraper.ts';

let pollingActive = false;
let pollingAbortController: AbortController | null = null;
let lastUpdateId = 0;
let currentBotToken: string | null = null;
let currentBotInfo: { id: number; username: string; first_name: string } | null = null;
let pollingError: string | null = null;
let watchdogInterval: NodeJS.Timeout | null = null;
let isPollingLoopRunning = false;
let pollingCycleCounter = 0;

// 3-second buffer to combine multiple consecutive messages (photos, videos, captions) for the same product
const BATCH_DEBOUNCE_MS = 3000;

interface ProductBatchBuffer {
  batchKey: string;
  token: string;
  userId: number;
  chatId?: number;
  senderName: string;
  senderUsername?: string;
  captionParts: string[];
  photos: Array<{ photoBase64: string; photoMimeType: string; localUrl?: string }>;
  videoUrl?: string | null;
  messageIds: string[];
  timer: NodeJS.Timeout;
}

const productBatchBuffers = new Map<string, ProductBatchBuffer>();

// Sequential AI processing queue: executes AI batches one by one to prevent server freezing and CPU/event-loop spikes
interface QueuedAiTask {
  batchKey: string;
  run: () => Promise<any>;
}

const aiTaskQueue: QueuedAiTask[] = [];
let isProcessingAiQueue = false;

export function enqueueBatchExecution(batchKey: string, taskFn: () => Promise<any>): Promise<any> {
  return new Promise((resolve, reject) => {
    aiTaskQueue.push({
      batchKey,
      run: async () => {
        try {
          const result = await taskFn();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      },
    });
    triggerAiQueue();
  });
}

async function triggerAiQueue() {
  if (isProcessingAiQueue || aiTaskQueue.length === 0) return;
  isProcessingAiQueue = true;
  while (aiTaskQueue.length > 0) {
    const task = aiTaskQueue.shift();
    if (task) {
      try {
        await task.run();
      } catch (err) {
        console.error('[Telegram Bot] Error running queued product AI task:', err);
      }
      // Give event loop a 150ms breath so store & admin panel requests are handled instantly
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  isProcessingAiQueue = false;
}

// Helper to merge multiple caption parts from consecutive messages without redundant duplication
function mergeCaptionParts(parts: string[]): string {
  if (!parts || parts.length === 0) return '';
  const uniqueParts: string[] = [];

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    // Check if already covered by an existing part
    const isAlreadyCovered = uniqueParts.some(
      (existing) => existing === part || existing.includes(part)
    );
    if (isAlreadyCovered) continue;

    // Check if this part contains and supersedes an existing part
    const existingIndex = uniqueParts.findIndex((existing) => part.includes(existing));
    if (existingIndex !== -1) {
      uniqueParts[existingIndex] = part;
    } else {
      uniqueParts.push(part);
    }
  }

  return uniqueParts.join('\n\n');
}

export function getBotRuntimeStatus() {
  return {
    pollingActive,
    hasToken: Boolean(currentBotToken || process.env.TELEGRAM_BOT_TOKEN),
    botInfo: currentBotInfo,
    lastUpdateId,
    pollingError,
  };
}

/**
 * Escapes characters that break Telegram Legacy Markdown in dynamic user strings
 */
export function escapeTelegramMarkdown(str: string): string {
  if (!str) return '';
  return str.replace(/([_*`\[\]])/g, '\\$1');
}

/**
 * Validates and repairs unbalanced Telegram Markdown tags to prevent "can't find end of entity"
 */
function sanitizeTelegramMarkdownText(text: string): string {
  if (!text) return '';

  // 1. Remove isolated single backticks or fix uneven backticks
  const backtickMatches = text.match(/`/g);
  if (backtickMatches && backtickMatches.length % 2 !== 0) {
    text += '`';
  }

  // 2. Fix uneven asterisks for bold (*...*)
  // Note: in Telegram legacy markdown, asterisks must be paired
  const asteriskMatches = text.match(/\*/g);
  if (asteriskMatches && asteriskMatches.length % 2 !== 0) {
    text += '*';
  }

  // 3. Fix uneven underscores for italic (_..._)
  // Underscores inside words (like my_variable_name) can confuse legacy Markdown parser
  // Repair uneven underscores at the end of the text
  const underscoreMatches = text.match(/_/g);
  if (underscoreMatches && underscoreMatches.length % 2 !== 0) {
    text += '_';
  }

  return text;
}

/**
 * Strips formatting characters from text for plain text sending
 */
function stripMarkdownFormatting(text: string): string {
  if (!text) return '';
  return text.replace(/[*_`[\]\\]/g, '');
}

/**
 * Sends a message back to the Telegram chat
 */
export async function sendTelegramChatMessage(
  botToken: string,
  chatId: number | string,
  text: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown'
) {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payloadText = parseMode === 'Markdown' ? sanitizeTelegramMarkdownText(text) : text;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: payloadText,
        parse_mode: parseMode,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.warn('[Telegram Bot] Send message with parse_mode failed, retrying plain text:', data.description);
      // Fallback without parse_mode and stripping formatting symbols so user always gets the response
      const fallbackRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: stripMarkdownFormatting(text),
        }),
      });
      return await fallbackRes.json();
    }
    return data;
  } catch (err) {
    console.error('Error sending Telegram response message:', err);
    return null;
  }
}

/**
 * Sends a chat action status to Telegram (e.g. typing, upload_photo)
 */
export async function sendTelegramChatAction(
  botToken: string,
  chatId: number | string,
  action: 'typing' | 'upload_photo' | 'record_video' | 'upload_document' = 'typing'
) {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendChatAction`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        action,
      }),
    });
  } catch {
    // Non-blocking fire-and-forget
  }
}

/**
 * Edits an existing message text in Telegram
 */
export async function editTelegramMessageText(
  botToken: string,
  chatId: number | string,
  messageId: number | string,
  text: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown'
) {
  try {
    const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
    const payloadText = parseMode === 'Markdown' ? sanitizeTelegramMarkdownText(text) : text;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: payloadText,
        parse_mode: parseMode,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      // Fallback without parse_mode
      const fallbackRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: stripMarkdownFormatting(text),
        }),
      });
      return await fallbackRes.json();
    }
    return data;
  } catch (err) {
    console.warn('[Telegram Bot] Edit message failed, falling back to send new message:', err);
    return null;
  }
}

/**
 * Downloads a video file sent to the bot from Telegram's servers and saves it to local /uploads
 */
export async function downloadTelegramVideo(
  botToken: string,
  fileId: string,
  fileNameHint?: string
): Promise<{ videoUrl: string; mimeType: string } | null> {
  try {
    const fileInfoRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
    );
    const fileInfo = await fileInfoRes.json();

    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      console.warn('[Telegram Bot] Could not get video file path from Telegram API:', fileInfo);
      return null;
    }

    const filePath = fileInfo.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const vidRes = await fetch(downloadUrl);

    if (!vidRes.ok) {
      console.warn(`[Telegram Bot] Failed to download video stream (${vidRes.status})`);
      return null;
    }

    const arrayBuf = await vidRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const mimeType = filePath.endsWith('.webm')
      ? 'video/webm'
      : filePath.endsWith('.mov')
      ? 'video/quicktime'
      : 'video/mp4';

    const savedLocalUrl = await saveVideoBufferLocally(buffer, mimeType, fileNameHint || 'tg_video');

    return {
      videoUrl: savedLocalUrl,
      mimeType,
    };
  } catch (err) {
    console.error('Failed to download video from Telegram:', err);
    return null;
  }
}

/**
 * Downloads a photo sent to the bot from Telegram's servers and saves it to local disk
 */
export async function downloadTelegramPhoto(
  botToken: string,
  fileId: string
): Promise<{ photoBase64: string; photoMimeType: string; localUrl: string } | null> {
  try {
    const fileInfoRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
    );
    const fileInfo = await fileInfoRes.json();

    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      return null;
    }

    const filePath = fileInfo.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const imgRes = await fetch(downloadUrl);

    if (!imgRes.ok) return null;

    const arrayBuf = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    // Persist immediately to /uploads/ asynchronously so it is stored safely on disk
    const localUrl = await saveImageBufferLocally(buffer, mimeType, 'tg_photo');
    const base64 = `data:${mimeType};base64,${buffer.toString('base64')}`;

    return {
      photoBase64: base64,
      photoMimeType: mimeType,
      localUrl,
    };
  } catch (err) {
    console.error('Failed to download photo from Telegram:', err);
    return null;
  }
}

/**
 * Helper to extract supplier info prioritizing forwarded original remitente
 */
export function extractSupplierFromMessage(message: any): {
  senderName: string;
  senderUsername?: string;
} {
  let supplierName = 'Proveedor Telegram';
  let supplierUsername: string | undefined = undefined;

  // Case A: Modern Telegram forward_origin
  if (message.forward_origin) {
    if (message.forward_origin.type === 'user' && message.forward_origin.sender_user) {
      const u = message.forward_origin.sender_user;
      supplierName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || 'Proveedor';
      supplierUsername = u.username ? `@${u.username}` : undefined;
    } else if (message.forward_origin.type === 'channel' && message.forward_origin.chat) {
      supplierName = message.forward_origin.chat.title || 'Canal Proveedor';
      supplierUsername = message.forward_origin.chat.username ? `@${message.forward_origin.chat.username}` : undefined;
    } else if (message.forward_origin.type === 'chat' && message.forward_origin.sender_chat) {
      supplierName = message.forward_origin.sender_chat.title || 'Grupo Proveedor';
      supplierUsername = message.forward_origin.sender_chat.username ? `@${message.forward_origin.sender_chat.username}` : undefined;
    } else if (message.forward_origin.type === 'hidden_user') {
      supplierName = message.forward_origin.sender_user_name || 'Proveedor Oculto';
    }
  }
  // Case B: Legacy forward_from
  else if (message.forward_from) {
    const f = message.forward_from;
    supplierName = `${f.first_name || ''} ${f.last_name || ''}`.trim() || f.username || 'Proveedor';
    supplierUsername = f.username ? `@${f.username}` : undefined;
  } else if (message.forward_from_chat) {
    supplierName = message.forward_from_chat.title || 'Canal Proveedor';
    supplierUsername = message.forward_from_chat.username ? `@${message.forward_from_chat.username}` : undefined;
  } else if (message.forward_sender_name) {
    supplierName = message.forward_sender_name;
  }
  // Case C: Direct sender
  else {
    supplierName = message.from?.first_name
      ? `${message.from.first_name} ${message.from.last_name || ''}`.trim()
      : message.chat?.title || 'Proveedor Telegram';
    supplierUsername = message.from?.username ? `@${message.from.username}` : undefined;
  }

  return { senderName: supplierName, senderUsername: supplierUsername };
}

/**
 * Extracts photo from either photo array or document image
 */
export async function extractPhotoFromMessage(
  token: string,
  message: any
): Promise<{ photoBase64: string; photoMimeType: string; localUrl?: string } | null> {
  if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
    const highestResPhoto = message.photo[message.photo.length - 1];
    return await downloadTelegramPhoto(token, highestResPhoto.file_id);
  } else if (
    message.document &&
    (message.document.mime_type?.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp)$/i.test(message.document.file_name || ''))
  ) {
    return await downloadTelegramPhoto(token, message.document.file_id);
  }
  return null;
}

/**
 * Extracts video from message.video, message.animation, message.video_note or document video
 */
export async function extractVideoFromMessage(
  token: string,
  message: any
): Promise<{ videoUrl: string; mimeType: string } | null> {
  if (message.video && message.video.file_id) {
    return await downloadTelegramVideo(token, message.video.file_id, message.video.file_name || 'tg_video');
  } else if (message.animation && message.animation.file_id) {
    return await downloadTelegramVideo(token, message.animation.file_id, message.animation.file_name || 'tg_animation');
  } else if (message.video_note && message.video_note.file_id) {
    return await downloadTelegramVideo(token, message.video_note.file_id, 'tg_video_note');
  } else if (
    message.document &&
    (message.document.mime_type?.startsWith('video/') ||
      /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(message.document.file_name || ''))
  ) {
    return await downloadTelegramVideo(token, message.document.file_id, message.document.file_name);
  }
  return null;
}

/**
 * Creates or updates a product with multiple photos and optional video
 */
async function processCompleteProduct(
  token: string,
  data: {
    userId: number;
    chatId?: number;
    messageIds: string[];
    senderName: string;
    senderUsername?: string;
    caption: string;
    photos: Array<{ photoBase64: string; photoMimeType: string; localUrl?: string }>;
    videoUrl?: string | null;
  }
) {
  const { userId, chatId, messageIds, senderName, senderUsername, caption, photos, videoUrl } = data;

  // 1. Get User config for pricing and currency, and verify bot is active
  const config = await getTelegramConfig(userId);
  if (config && config.isActive === false) {
    console.log(`[Telegram Bot] Message ignored in processCompleteProduct: Bot is PAUSED for user ${userId}.`);
    return null;
  }

  // 2. Extract photos clean local URLs (never store raw base64 into database)
  const photosLocalUrls = photos.map((p) => p.localUrl || p.photoBase64);
  const primaryPhoto = photosLocalUrls[0] || null;
  const currencySym = config.currency === 'EUR' ? '€' : '$';

  // 3. Fast Duplicate Check (before AI): If the same product text was already saved, prevent duplicate creation
  if (caption && caption.trim().length >= 10) {
    const duplicateByText = await findExistingInventoryItem({
      rawTelegramMessage: caption,
      supplierName: senderName,
    });

    if (duplicateByText) {
      console.log(
        `[Telegram Bot] Duplicate text detected early: already exists with SKU "${duplicateByText.sku}" (ID: ${duplicateByText.id}). Bypassing duplicate creation.`
      );

      if (videoUrl && !duplicateByText.videoUrl) {
        await setInventoryItemVideo(duplicateByText.id, videoUrl);
        console.log(`[Telegram Bot] Attached video to existing product "${duplicateByText.name}" (ID: ${duplicateByText.id})`);
      }

      await createTelegramMessageRecord({
        userId,
        telegramMessageId: messageIds.join(','),
        senderName,
        senderUsername,
        caption: caption || `(Intento duplicado por texto repetido - ${photos.length} fotos)`,
        photoUrl: primaryPhoto,
        processedStatus: 'duplicate',
        extractedData: JSON.stringify({
          duplicateOfSku: duplicateByText.sku,
          duplicateOfName: duplicateByText.name,
          imagesCount: photos.length,
          hasVideo: Boolean(videoUrl),
          reason: 'identical_or_matching_text',
        }),
        inventoryItemId: duplicateByText.id,
      });

      if (chatId) {
        const videoUpdatedNote =
          videoUrl && !duplicateByText.videoUrl
            ? `🎬 *Video del producto guardado y vinculado correctamente.*\n\n`
            : '';

        const safeDupName = escapeTelegramMarkdown(duplicateByText.name);
        const safeDupCategory = escapeTelegramMarkdown(duplicateByText.category);
        const safeDupSupplier = escapeTelegramMarkdown(duplicateByText.supplierName || senderName);

        const duplicateMsg =
          `⚠️ *Producto ya ingresado*\n\n` +
          `El producto "*${safeDupName}*" ya se encuentra registrado en el inventario de Comerxia App.\n\n` +
          videoUpdatedNote +
          `🏷️ *Código SKU:* \`${duplicateByText.sku}\`\n` +
          `📂 *Categoría:* ${safeDupCategory}\n` +
          `💰 *Costo Registrado:* ${currencySym}${Number(duplicateByText.costPrice).toFixed(2)}\n` +
          `🏷️ *PVP Actual:* ${currencySym}${Number(duplicateByText.salePrice).toFixed(2)}\n` +
          `📊 *Stock en Inventario:* ${duplicateByText.stock} unidades\n` +
          `👤 *Proveedor:* ${safeDupSupplier}\n\n` +
          `ℹ️ _No se ha creado otro producto porque el texto ya fue registrado previamente._`;

        await sendTelegramChatMessage(token, chatId, duplicateMsg);
      }

      return {
        isDuplicate: true,
        existingItem: duplicateByText,
        message: 'Product already registered (identical text detected)',
      };
    }
  }

  // 4. Parse with Gemini AI Multimodal or heuristic mode according to Google AI switch
  const aiConfig = await getAiConfig(userId).catch(() => null);
  const useAiRecognition = Boolean(aiConfig ? aiConfig.isActive !== false : true);
  const parsed = await parseSupplierTelegramMessage(
    caption || 'Producto recibido con fotos por Telegram',
    photosLocalUrls,
    photos[0]?.photoMimeType || 'image/jpeg',
    config.defaultMarginPercent || 30,
    config.currency || 'USD',
    config.taxPercent ?? 15,
    useAiRecognition
  );

  // Include photos array, video, cost options and profit margin inside extractedAttributes (all using disk /uploads/ URLs)
  const attributesWithGallery = {
    ...parsed.attributes,
    images: photosLocalUrls,
    totalPhotos: photosLocalUrls.length,
    videoUrl: videoUrl || null,
    costOptions: parsed.costOptions || [],
    profitMarginPercent: parsed.profitMarginPercent || config.defaultMarginPercent || 30,
    selectedCostPrice: parsed.costPrice,
  };

  // 5. Duplicate Check after AI extraction: verify if product already exists by name or SKU
  const existingItem = await findExistingInventoryItem({
    name: parsed.name,
    sku: parsed.sku !== 'AUTO' ? parsed.sku : undefined,
    rawTelegramMessage: caption,
    supplierName: senderName,
  });

  if (existingItem) {
    console.log(
      `[Telegram Bot] Duplicate detected: "${parsed.name}" already exists with SKU "${existingItem.sku}" (ID: ${existingItem.id}).`
    );

    // If new video arrived for existing product and it doesn't have one, attach it
    if (videoUrl && !existingItem.videoUrl) {
      await setInventoryItemVideo(existingItem.id, videoUrl);
      console.log(`[Telegram Bot] Attached video to existing product "${existingItem.name}" (ID: ${existingItem.id})`);
    }

    // Save message log linked to existing product
    const messageLog = await createTelegramMessageRecord({
      userId,
      telegramMessageId: messageIds.join(','),
      senderName,
      senderUsername,
      caption: caption || `(Intento duplicado - Lote de ${photos.length} fotos${videoUrl ? ' + video' : ''})`,
      photoUrl: primaryPhoto,
      processedStatus: 'duplicate',
      extractedData: JSON.stringify({
        ...parsed,
        duplicateOfSku: existingItem.sku,
        imagesCount: photos.length,
        hasVideo: Boolean(videoUrl),
      }),
      inventoryItemId: existingItem.id,
    });

    // Send duplicate notification to Telegram chat
    if (chatId) {
      const videoUpdatedNote =
        videoUrl && !existingItem.videoUrl
          ? `🎬 *Video del producto guardado y vinculado correctamente.*\n\n`
          : '';

      const safeExistName = escapeTelegramMarkdown(existingItem.name);
      const safeExistCategory = escapeTelegramMarkdown(existingItem.category);
      const safeExistSupplier = escapeTelegramMarkdown(existingItem.supplierName || senderName);

      const duplicateMsg =
        `⚠️ *Producto ya ingresado*\n\n` +
        `El producto "*${safeExistName}*" ya se encuentra registrado en el inventario de Comerxia App.\n\n` +
        videoUpdatedNote +
        `🏷️ *Código SKU:* \`${existingItem.sku}\`\n` +
        `📂 *Categoría:* ${safeExistCategory}\n` +
        `💰 *Costo Registrado:* ${currencySym}${Number(existingItem.costPrice).toFixed(2)}\n` +
        `🏷️ *PVP Actual:* ${currencySym}${Number(existingItem.salePrice).toFixed(2)}\n` +
        `📊 *Stock en Inventario:* ${existingItem.stock} unidades\n` +
        `👤 *Proveedor:* ${safeExistSupplier}\n\n` +
        `ℹ️ _No se ha duplicado el registro para evitar inconsistencias de inventario._`;

      await sendTelegramChatMessage(token, chatId, duplicateMsg);
    }

    return {
      isDuplicate: true,
      existingItem,
      parsed,
      messageLog,
    };
  }

  // 6. Generate sequential SKU representing up to 3 letters of supplier (e.g. JUA00001)
  let finalSku = parsed.sku;
  const supplierPrefix = getSupplierSkuPrefix(senderName);
  if (!finalSku || finalSku === 'AUTO' || !finalSku.toUpperCase().startsWith(supplierPrefix)) {
    finalSku = await generateNextSku(senderName);
    parsed.sku = finalSku;
  }

  // Stock is always 0 and always auto-approves into inventory as requested
  const effectiveStock = 0;
  parsed.stock = 0;

  const effectiveTaxRate = typeof parsed.taxPercent === 'number' ? parsed.taxPercent : (config.taxPercent ?? 15);
  const effectiveCostWith = parsed.costWithTax ?? parsed.costPrice;
  const effectiveCostWithout =
    parsed.costWithoutTax !== undefined && parsed.costWithoutTax !== null
      ? parsed.costWithoutTax
      : effectiveTaxRate > 0
      ? effectiveCostWith / (1 + effectiveTaxRate / 100)
      : effectiveCostWith;

  // 7. Create product in PostgreSQL
  const inventoryItem = await createInventoryItem({
    userId,
    name: parsed.name,
    sku: finalSku,
    description: parsed.description,
    category: parsed.category,
    costPrice: String(effectiveCostWith.toFixed(2)),
    costWithoutTax: String(Number(effectiveCostWithout).toFixed(2)),
    costWithTax: String(effectiveCostWith.toFixed(2)),
    taxRate: String(effectiveTaxRate),
    salePrice: String(parsed.salePrice.toFixed(2)),
    stock: effectiveStock,
    imageUrl: primaryPhoto,
    videoUrl: videoUrl || null,
    supplierName: senderName,
    tags: parsed.tags.join(', '),
    extractedAttributes: JSON.stringify({
      ...attributesWithGallery,
      hasPurchaseTax: effectiveTaxRate > 0,
      purchaseTaxPercent: effectiveTaxRate,
    }),
    status: 'available',
    rawTelegramMessage: caption,
  });

  // 7. Record message log
  const messageLog = await createTelegramMessageRecord({
    userId,
    telegramMessageId: messageIds.join(','),
    senderName,
    senderUsername,
    caption: caption || `(Lote de ${photos.length} fotos${videoUrl ? ' + video' : ''})`,
    photoUrl: primaryPhoto,
    processedStatus: 'processed',
    extractedData: JSON.stringify({
      ...parsed,
      sku: finalSku,
      stock: effectiveStock,
      imagesCount: photos.length,
      videoUrl: videoUrl || null,
    }),
    inventoryItemId: inventoryItem.id,
  });

  // 8. Send rich confirmation to Telegram
  if (chatId) {
    const profit = (parsed.salePrice - parsed.costPrice).toFixed(2);
    const photoCountNote =
      photos.length > 1 ? `📸 *Galería:* ${photos.length} fotografías vinculadas al producto\n` : '';
    const videoNote = videoUrl ? `🎬 *Video del producto:* Guardado y listo para la tienda / catálogo\n` : '';

    const effectiveTaxRate = typeof parsed.taxPercent === 'number' ? parsed.taxPercent : (config.taxPercent ?? 15);
    const effectiveWithout = (
      parsed.costWithoutTax ??
      (effectiveTaxRate > 0 ? parsed.costPrice / (1 + effectiveTaxRate / 100) : parsed.costPrice)
    ).toFixed(2);
    const effectiveWith = (parsed.costWithTax ?? parsed.costPrice).toFixed(2);

    let costSection =
      effectiveTaxRate > 0
        ? `💵 *Costo sin IVA:* ${currencySym}${effectiveWithout}\n` +
          `🧾 *Costo con IVA:* ${currencySym}${effectiveWith} _(IVA ${effectiveTaxRate}%)_`
        : `💵 *Costo de Compra:* ${currencySym}${effectiveWith} _(0% IVA / Sin IVA)_`;

    if (parsed.costOptions && parsed.costOptions.length > 1) {
      const hasAffiliate = parsed.costOptions.some((o) => /afiliad/i.test(o.label));
      const modeNote = hasAffiliate ? 'Precio afiliado por 1 unidad por defecto' : 'Mayor por defecto';
      costSection =
        `💵 *Costo Seleccionado sin IVA:* ${currencySym}${effectiveWithout}\n` +
        `🧾 *Costo Seleccionado con IVA:* ${currencySym}${effectiveWith} _(${modeNote})_\n` +
        `📋 *Opciones de Costo Detectadas:*\n` +
        parsed.costOptions
          .map((o) => {
            const optWithout =
              typeof o.costWithoutTax === 'number'
                ? ` _(sin IVA: ${currencySym}${o.costWithoutTax.toFixed(2)})_`
                : '';
            return `   • ${o.label}: ${currencySym}${Number(o.price).toFixed(2)}${optWithout}`;
          })
          .join('\n');
    }

    const stockMsg = `📊 *Stock Ingresado:* 0 unidades\n\n`;

    const safeName = escapeTelegramMarkdown(parsed.name);
    const safeSender = escapeTelegramMarkdown(senderName);
    const safeUsername = senderUsername ? escapeTelegramMarkdown(senderUsername) : '';
    const safeCategory = escapeTelegramMarkdown(parsed.category);

    const responseText =
      `✅ *¡Producto Registrado con Éxito en PostgreSQL!*\n\n` +
      `📦 *${safeName}*\n` +
      `👤 *Proveedor:* ${safeSender}${safeUsername ? ` (${safeUsername})` : ''}\n` +
      photoCountNote +
      videoNote +
      `🏷️ *SKU:* \`${finalSku}\`\n` +
      `📂 *Categoría:* ${safeCategory}\n` +
      `${costSection}\n` +
      `🏷️ *PVP Sugerido (${parsed.profitMarginPercent || config.defaultMarginPercent || 30}%):* ${currencySym}${parsed.salePrice.toFixed(2)}\n` +
      `📈 *Margen Estimado:* +${currencySym}${profit}\n` +
      stockMsg +
      `⚡ _Ya puedes verlo con todas sus opciones de costo, video y fotos en tu panel de inventario._`;

    await sendTelegramChatMessage(token, chatId, responseText);
  }

  console.log(
    `[Telegram Bot] Product "${parsed.name}" (SKU: ${finalSku}, ID: ${inventoryItem.id}) created with ${photos.length} photo(s)${videoUrl ? ' and 1 video' : ''}.`
  );

  return {
    parsed,
    inventoryItem,
    messageLog,
  };
}

/**
 * Processes a web product URL sent via Telegram:
 * Scrapes the page, extracts product name, price, description, attributes with Gemini,
 * downloads all product photos into local /uploads/, and registers the product into PostgreSQL.
 */
async function processWebProductUrlMessage(
  token: string,
  data: {
    userId: number;
    chatId?: number;
    messageId: string;
    senderName: string;
    senderUsername?: string;
    text: string;
    productUrl: string;
  }
) {
  const { userId, chatId, messageId, senderName, senderUsername, text, productUrl } = data;

  // 1. Get Telegram config for profit margin, currency and default stock, and verify bot is active
  const config = await getTelegramConfig(userId);
  if (config && config.isActive === false) {
    console.log(`[Telegram Bot] Web URL product processing aborted: Bot is PAUSED for user ${userId}.`);
    return null;
  }
  const currencySym = config.currency === 'EUR' ? '€' : '$';

  let statusMessageId: number | null = null;
  if (chatId) {
    sendTelegramChatAction(token, chatId, 'typing');
    const initMsg = await sendTelegramChatMessage(
      token,
      chatId,
      `🌐 *Enlace de producto detectado*\n\n` +
      `🔗 \`${productUrl}\`\n\n` +
      `⚡ _Analizando producto, extrayendo precio y descargando fotos..._`
    );
    if (initMsg?.result?.message_id) {
      statusMessageId = initMsg.result.message_id;
    }
  }

  console.log(`[Telegram Bot] Scraping product from web URL: ${productUrl}`);

  // 2. Scrape webpage, extract structured data with Gemini or Fast-Path, and download photos to /uploads/
  const scraped = await scrapeAndProcessWebProduct(
    productUrl,
    config.defaultMarginPercent || 30,
    config.currency || 'USD',
    config.taxPercent ?? 15,
    text || ''
  );

  if (!scraped) {
    console.warn(`[Telegram Bot] Failed to scrape web product from: ${productUrl}`);
    if (chatId) {
      const failMsg =
        `⚠️ *No se pudo extraer el producto desde el enlace web*\n\n` +
        `No fue posible obtener los datos de la URL proporcionada (\`${productUrl}\`).\n\n` +
        `Verifica que el enlace sea una página pública directa de un producto comercial.\n\n` +
        `_Nota: Si prefieres, también puedes enviarme directamente la fotografía con su precio y descripción._`;

      if (statusMessageId) {
        await editTelegramMessageText(token, chatId, statusMessageId, failMsg);
      } else {
        await sendTelegramChatMessage(token, chatId, failMsg);
      }
    }
    return { status: 'web_scrape_failed', url: productUrl };
  }

  // Determine effective supplier name based on sender and website domain
  const effectiveSupplier =
    senderName && senderName !== 'Proveedor Telegram' && !senderName.includes('Canal')
      ? `${senderName} (${scraped.domain})`
      : `Web (${scraped.domain})`;

  // 3. Duplicate check
  const existingItem = await findExistingInventoryItem({
    name: scraped.name,
    sku: scraped.sku !== 'AUTO' ? scraped.sku : undefined,
    rawTelegramMessage: text,
    supplierName: effectiveSupplier,
  });

  if (existingItem) {
    console.log(
      `[Telegram Bot] Duplicate detected for web product "${scraped.name}" (SKU: ${existingItem.sku}, ID: ${existingItem.id}).`
    );

    const messageLog = await createTelegramMessageRecord({
      userId,
      telegramMessageId: messageId,
      senderName: effectiveSupplier,
      senderUsername,
      caption: text,
      photoUrl: scraped.primaryImage,
      processedStatus: 'duplicate',
      extractedData: JSON.stringify({
        ...scraped,
        duplicateOfSku: existingItem.sku,
        imagesCount: scraped.images.length,
      }),
      inventoryItemId: existingItem.id,
    });

    if (chatId) {
      const safeWebExistName = escapeTelegramMarkdown(existingItem.name);
      const safeWebExistCategory = escapeTelegramMarkdown(existingItem.category);
      const safeWebDomain = escapeTelegramMarkdown(scraped.domain);

      const duplicateMsg =
        `⚠️ *Producto web ya ingresado*\n\n` +
        `El producto "*${safeWebExistName}*" ya se encuentra registrado en el inventario de Comerxia.\n\n` +
        `🏷️ *Código SKU:* \`${existingItem.sku}\`\n` +
        `📂 *Categoría:* ${safeWebExistCategory}\n` +
        `💰 *Costo Registrado:* ${currencySym}${Number(existingItem.costPrice).toFixed(2)}\n` +
        `🏷️ *PVP Actual:* ${currencySym}${Number(existingItem.salePrice).toFixed(2)}\n` +
        `📊 *Stock en Inventario:* ${existingItem.stock} unidades\n` +
        `🌐 *Fuente:* ${safeWebDomain}\n\n` +
        `ℹ️ _No se ha duplicado el registro para evitar inconsistencias de inventario._`;

      if (statusMessageId) {
        await editTelegramMessageText(token, chatId, statusMessageId, duplicateMsg);
      } else {
        await sendTelegramChatMessage(token, chatId, duplicateMsg);
      }
    }

    return {
      isDuplicate: true,
      existingItem,
      parsed: scraped,
      messageLog,
    };
  }

  // 4. Generate sequential SKU if needed
  let finalSku = scraped.sku;
  const supplierPrefix = getSupplierSkuPrefix(effectiveSupplier);
  if (!finalSku || finalSku === 'AUTO' || !finalSku.toUpperCase().startsWith(supplierPrefix)) {
    finalSku = await generateNextSku(effectiveSupplier);
    scraped.sku = finalSku;
  }

  // Stock is always 0 as requested by the user
  const effectiveStock = 0;
  scraped.stock = 0;

  // 5. Create Inventory Item in PostgreSQL
  const attributesWithGallery = {
    ...scraped.attributes,
    images: scraped.images,
    totalPhotos: scraped.images.length,
    costOptions: scraped.costOptions || [],
    profitMarginPercent: scraped.profitMarginPercent,
    selectedCostPrice: scraped.costPrice,
  };

  const effectiveTaxRate = typeof scraped.taxPercent === 'number' ? scraped.taxPercent : (config.taxPercent ?? 15);
  const effectiveCostWithout = String(
    (
      scraped.costWithoutTax ??
      (effectiveTaxRate > 0 ? scraped.costPrice / (1 + effectiveTaxRate / 100) : scraped.costPrice)
    ).toFixed(2)
  );
  const effectiveCostWith = String((scraped.costWithTax ?? scraped.costPrice).toFixed(2));

  const inventoryItem = await createInventoryItem({
    userId,
    name: scraped.name,
    sku: finalSku,
    barcode: scraped.barcode || undefined,
    description: scraped.description,
    category: scraped.category,
    costPrice: effectiveCostWith,
    costWithoutTax: effectiveCostWithout,
    costWithTax: effectiveCostWith,
    taxRate: String(effectiveTaxRate),
    salePrice: String(scraped.salePrice.toFixed(2)),
    stock: effectiveStock,
    imageUrl: scraped.primaryImage,
    supplierName: effectiveSupplier,
    tags: scraped.tags.join(', '),
    extractedAttributes: JSON.stringify(attributesWithGallery),
    status: 'available',
    rawTelegramMessage: text,
  });

  // 6. Record message log
  const messageLog = await createTelegramMessageRecord({
    userId,
    telegramMessageId: messageId,
    senderName: effectiveSupplier,
    senderUsername,
    caption: text,
    photoUrl: scraped.primaryImage,
    processedStatus: 'processed',
    extractedData: JSON.stringify({
      ...scraped,
      sku: finalSku,
      stock: effectiveStock,
      imagesCount: scraped.images.length,
    }),
    inventoryItemId: inventoryItem.id,
  });

  // 7. Rich Confirmation in Telegram
  if (chatId) {
    sendTelegramChatAction(token, chatId, 'upload_photo');
    const profit = (scraped.salePrice - scraped.costPrice).toFixed(2);
    const photoCountNote =
      scraped.images.length > 1
        ? `📸 *Galería:* ${scraped.images.length} fotografías descargadas y guardadas\n`
        : scraped.images.length === 1
        ? `📸 *Fotografía:* Descargada y guardada localmente\n`
        : `⚠️ *Fotos:* No se detectaron fotos públicas en la página\n`;

    const methodNote = scraped.attributes?.fastPathExtracted
      ? `⚡ *Extracción:* Ultrarrápida (JSON-LD directo sin esperas)\n`
      : `🤖 *Extracción:* Estructurada con Gemini IA\n`;

    const safeWebProdName = escapeTelegramMarkdown(inventoryItem.name);
    const safeWebProdCat = escapeTelegramMarkdown(inventoryItem.category);
    const safeWebDomain = escapeTelegramMarkdown(scraped.domain);

    const responseText =
      `✅ *¡Producto Importado desde la Web!* 🌐\n\n` +
      `📦 *${safeWebProdName}*\n` +
      `🏷️ *Código SKU:* \`${finalSku}\`\n` +
      `📂 *Categoría:* ${safeWebProdCat}\n` +
      `💵 *Costo sin IVA:* ${currencySym}${effectiveCostWithout}\n` +
      `🧾 *Costo con IVA:* ${currencySym}${effectiveCostWith} _(IVA ${effectiveTaxRate}%)_\n` +
      `🏷️ *PVP Sugerido (${scraped.profitMarginPercent}% margen):* ${currencySym}${Number(inventoryItem.salePrice).toFixed(2)}\n` +
      `📈 *Margen Estimado:* +${currencySym}${profit} / unidad\n` +
      `📊 *Stock Registrado:* ${inventoryItem.stock} unidades\n` +
      photoCountNote +
      methodNote +
      `🌐 *Página de Origen:* ${safeWebDomain}\n\n` +
      `⚡ _El producto ya está disponible en tu inventario y listo para la venta en tu tienda online._`;

    if (statusMessageId) {
      const editRes = await editTelegramMessageText(token, chatId, statusMessageId, responseText);
      if (!editRes || !editRes.ok) {
        await sendTelegramChatMessage(token, chatId, responseText);
      }
    } else {
      await sendTelegramChatMessage(token, chatId, responseText);
    }
  }

  console.log(
    `[Telegram Bot] Web product "${scraped.name}" (SKU: ${finalSku}, ID: ${inventoryItem.id}) created from URL: ${productUrl} with ${scraped.images.length} photos.`
  );

  return {
    parsed: scraped,
    inventoryItem,
    messageLog,
  };
}

/**
 * Processes an incoming Telegram message (with album / multi-photo detection)
 */
export async function processTelegramMessage(
  token: string,
  message: any,
  userId: number = 1
) {
  if (!message) return null;

  // Strict check: if bot is paused in configuration, drop and ignore message immediately
  try {
    const config = await getTelegramConfig(userId);
    if (config && config.isActive === false) {
      console.log(`[Telegram Bot] Message ignored: Bot is PAUSED for user ${userId}.`);
      return null;
    }
  } catch (err) {
    console.warn('[Telegram Bot] Notice checking config in processTelegramMessage:', err);
  }

  const chatId = message.chat?.id;
  const messageId = String(message.message_id);
  const text = message.text || message.caption || '';
  const mediaGroupId = message.media_group_id ? String(message.media_group_id) : null;

  const { senderName, senderUsername } = extractSupplierFromMessage(message);

  // 1. Handle commands like /start or /help
  if (text.startsWith('/start') || text.startsWith('/help')) {
    if (chatId) {
      const welcomeMsg =
        `👋 *¡Hola ${senderName}! Tu Bot de Inventario IA está activo.*\n\n` +
        `📦 *¿Cómo funciona?*\n` +
        `• Reenvíame fotos de productos (o *álbumes de varias fotos* del mismo producto) con su precio y detalles en el texto.\n` +
        `• La Inteligencia Artificial analizará la imagen y descripción para crear automáticamente el producto en tu catálogo e inventario.\n\n` +
        `🤖 *Gemini IA* organizará todo en tiempo real.`;

      await sendTelegramChatMessage(token, chatId, welcomeMsg);
    }
    return { status: 'command_handled' };
  }

  // 2. Extract media from message (photos and videos)
  const photoData = await extractPhotoFromMessage(token, message);
  const videoData = await extractVideoFromMessage(token, message);

  // If no photo, no video, and text is too short / empty
  if (!photoData && !videoData && (!text || text.trim().length < 2)) {
    return null;
  }

  // 3. Consecutive Multi-Message Batch Buffer (3 seconds debounce window)
  // Groups photos, video and text sent in two or more messages for the same product.
  const batchKey = chatId ? `chat_${chatId}` : `sender_${userId}_${senderName}`;
  const existingBatch = productBatchBuffers.get(batchKey);

  if (existingBatch) {
    // Cancel previous timer and accumulate all resources into the same batch
    clearTimeout(existingBatch.timer);

    if (photoData) {
      existingBatch.photos.push(photoData);
    }
    if (videoData && !existingBatch.videoUrl) {
      existingBatch.videoUrl = videoData.videoUrl;
    }
    if (text && text.trim().length > 0) {
      existingBatch.captionParts.push(text.trim());
    }
    if (!existingBatch.messageIds.includes(messageId)) {
      existingBatch.messageIds.push(messageId);
    }
    if (senderUsername && !existingBatch.senderUsername) {
      existingBatch.senderUsername = senderUsername;
    }

    if (chatId) {
      sendTelegramChatAction(token, chatId, 'typing').catch(() => {});
    }

    console.log(
      `[Telegram Bot] Extended 3s batch (${batchKey}): now ${existingBatch.photos.length} photo(s), video: ${Boolean(existingBatch.videoUrl)}, ${existingBatch.messageIds.length} message(s)`
    );

    // Reset 3-second debounce window
    existingBatch.timer = setTimeout(() => {
      productBatchBuffers.delete(batchKey);
      enqueueBatchExecution(batchKey, async () => {
        try {
          await executeProductBatch(token, existingBatch);
        } catch (err) {
          console.error('[Telegram Bot] Error executing queued 3-second product batch:', err);
        }
      }).catch((err) => {
        console.error('[Telegram Bot] Queue error for batch:', err);
      });
    }, BATCH_DEBOUNCE_MS);

    return {
      status: 'buffered_in_batch',
      batchKey,
      photosCount: existingBatch.photos.length,
      hasVideo: Boolean(existingBatch.videoUrl),
      messageIdsCount: existingBatch.messageIds.length,
    };
  }

  // 4. Initialize new 3-second product batch buffer
  if (chatId) {
    sendTelegramChatAction(token, chatId, 'typing').catch(() => {});
  }

  console.log(`[Telegram Bot] Starting 3s batch buffer (${batchKey}) for message ${messageId}`);

  const newBatch: ProductBatchBuffer = {
    batchKey,
    token,
    userId,
    chatId,
    senderName,
    senderUsername,
    captionParts: text && text.trim().length > 0 ? [text.trim()] : [],
    photos: photoData ? [photoData] : [],
    videoUrl: videoData ? videoData.videoUrl : null,
    messageIds: [messageId],
    timer: setTimeout(() => {
      productBatchBuffers.delete(batchKey);
      enqueueBatchExecution(batchKey, async () => {
        try {
          await executeProductBatch(token, newBatch);
        } catch (err) {
          console.error('[Telegram Bot] Error executing queued 3-second product batch:', err);
        }
      }).catch((err) => {
        console.error('[Telegram Bot] Queue error for batch:', err);
      });
    }, BATCH_DEBOUNCE_MS),
  };

  productBatchBuffers.set(batchKey, newBatch);

  return {
    status: 'batch_buffer_started',
    batchKey,
    debounceMs: BATCH_DEBOUNCE_MS,
    photosCount: newBatch.photos.length,
    hasVideo: Boolean(newBatch.videoUrl),
  };
}

/**
 * Executes a completed 3-second multi-message product batch:
 * Unifies all photos, videos, and captions into a single product and processes it with Gemini AI.
 */
async function executeProductBatch(token: string, batch: ProductBatchBuffer) {
  const { userId, chatId, senderName, senderUsername, captionParts, photos, videoUrl, messageIds } = batch;

  // Deduplicate and merge caption parts from all consecutive messages
  const fullCaption = mergeCaptionParts(captionParts);

  // If buffer has absolutely nothing (no photos, no video, and caption is empty)
  if (photos.length === 0 && !videoUrl && (!fullCaption || fullCaption.trim().length < 2)) {
    return null;
  }

  // Notify chat that all grouped resources are being analyzed
  if (chatId) {
    const partsDesc: string[] = [];
    if (photos.length > 0) partsDesc.push(`${photos.length} foto${photos.length > 1 ? 's' : ''}`);
    if (videoUrl) partsDesc.push(`1 video`);
    if (messageIds.length > 1) partsDesc.push(`recibidos en ${messageIds.length} mensajes`);

    const summaryStr = partsDesc.length > 0 ? ` (${partsDesc.join(', ')})` : '';
    await sendTelegramChatMessage(
      token,
      chatId,
      `⏳ *Analizando producto con Gemini IA...* Se agruparon todos los recursos${summaryStr}. Extrayendo datos y calculando márgenes...`
    );
  }

  return await processCompleteProduct(token, {
    userId,
    chatId,
    messageIds,
    senderName,
    senderUsername,
    caption: fullCaption,
    photos,
    videoUrl,
  });
}

/**
 * Synchronizes new updates immediately from Telegram (manual trigger or periodic poll)
 */
export async function syncTelegramUpdatesOnce(token?: string, userId: number = 1) {
  try {
    const config = await getTelegramConfig(userId);
    if (config && config.isActive === false) {
      return {
        success: false,
        error: 'El bot de Telegram está en pausa. Actívalo en la configuración para procesar mensajes.',
        isActive: false,
      };
    }
  } catch {}

  const effectiveToken = token || currentBotToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!effectiveToken) {
    return { success: false, error: 'No Bot Token configured' };
  }

  try {
    const url = `https://api.telegram.org/bot${effectiveToken}/getUpdates?offset=${
      lastUpdateId ? lastUpdateId + 1 : 0
    }&limit=20&timeout=2`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok) {
      // If a webhook is active, getUpdates gives 409. We can report that or clear webhook if needed.
      pollingError = data.description || 'Error fetching updates';
      return { success: false, error: data.description };
    }

    pollingError = null;
    const updates = data.result || [];
    const processed: any[] = [];

    for (const update of updates) {
      if (update.update_id >= lastUpdateId) {
        lastUpdateId = update.update_id;
      }

      const msg = update.message || update.channel_post;
      if (msg) {
        try {
          const result = await processTelegramMessage(effectiveToken, msg, userId);
          if (result) processed.push(result);
        } catch (err: any) {
          console.error('[Telegram Bot] Error processing individual update:', err);
        }
      }
    }

    return {
      success: true,
      updatesFound: updates.length,
      processedCount: processed.length,
      items: processed,
    };
  } catch (err: any) {
    pollingError = err.message;
    console.error('[Telegram Bot] Error syncing updates:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Starts continuous long-polling in the background with auto-recovery watchdog
 */
export async function startTelegramPolling(token: string, userId: number = 1) {
  // 0. Ensure bot is active in configuration
  try {
    const config = await getTelegramConfig(userId);
    if (config && config.isActive === false) {
      console.log(`[Telegram Bot] Polling will not start: Bot is PAUSED for user ${userId}.`);
      stopTelegramPolling();
      return;
    }
  } catch (err) {
    console.warn('[Telegram Bot] Error checking bot config on start:', err);
  }

  if (pollingActive && currentBotToken === token && isPollingLoopRunning) {
    return;
  }
  
  stopTelegramPolling();

  currentBotToken = token;
  pollingActive = true;
  pollingAbortController = new AbortController();
  const currentCycleId = ++pollingCycleCounter;

  // 1. Clear any active webhooks so getUpdates works reliably without 409 Conflict
  try {
    const delRes = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
    const delData = await delRes.json();
    if (delData.ok) {
      console.log('[Telegram Bot] Webhooks cleared, ready for automatic Live Polling.');
    }
  } catch (webhookErr) {
    console.warn('[Telegram Bot] Notice while checking deleteWebhook:', webhookErr);
  }

  // 2. Validate token and get bot details
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData = await meRes.json();
    if (meData.ok) {
      currentBotInfo = meData.result;
      console.log(`[Telegram Bot] Connected as @${currentBotInfo?.username} (${currentBotInfo?.first_name})`);
      updateTelegramConfig(userId, {
        botUsername: currentBotInfo?.username || null,
        botFirstName: currentBotInfo?.first_name || null,
      }).catch((err) => {
        console.warn('[Telegram Bot] Failed to persist bot details to config:', err);
      });
    } else {
      pollingError = meData.description || 'Token inválido';
    }
  } catch (err: any) {
    console.error('[Telegram Bot] Error validating getMe:', err);
    pollingError = err.message;
  }

  // 3. Core asynchronous polling runner
  const runPollingCycle = async (cycleId: number) => {
    if (!pollingActive || !currentBotToken || pollingCycleCounter !== cycleId) return;
    isPollingLoopRunning = true;
    console.log(`[Telegram Bot] Automatic Real-Time Polling worker active (cycle #${cycleId})...`);

    while (pollingActive && currentBotToken && pollingCycleCounter === cycleId) {
      try {
        // Continuous guard: verify bot is still active in database
        try {
          const cfg = await getTelegramConfig(userId);
          if (cfg && cfg.isActive === false) {
            console.log('[Telegram Bot] Active polling loop detected bot is PAUSED in database. Terminating worker.');
            stopTelegramPolling();
            break;
          }
        } catch {}

        const url = `https://api.telegram.org/bot${currentBotToken}/getUpdates?offset=${
          lastUpdateId ? lastUpdateId + 1 : 0
        }&limit=10&timeout=4`;

        const res = await fetch(url, { signal: pollingAbortController?.signal });
        if (pollingCycleCounter !== cycleId || !pollingActive) break;
        const data = await res.json();

        if (data.ok) {
          pollingError = null;
          const updates = data.result || [];
          for (const update of updates) {
            if (pollingCycleCounter !== cycleId || !pollingActive) break;
            if (update.update_id >= lastUpdateId) {
              lastUpdateId = update.update_id;
            }
            const msg = update.message || update.channel_post || update.edited_message;
            if (msg) {
              try {
                await processTelegramMessage(currentBotToken, msg, userId);
              } catch (msgErr) {
                console.error('[Telegram Bot] Error processing incoming message update:', msgErr);
              }
            }
          }
        } else {
          // If error 409 conflict, clear webhook immediately and retry
          if (data.error_code === 409) {
            console.log('[Telegram Bot] Resolving webhook/getUpdates conflict...');
            await fetch(`https://api.telegram.org/bot${currentBotToken}/deleteWebhook`);
          } else {
            pollingError = data.description;
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || pollingCycleCounter !== cycleId) break;
        pollingError = err.message;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    if (pollingCycleCounter === cycleId) {
      isPollingLoopRunning = false;
      console.log(`[Telegram Bot] Real-Time Polling worker cycle #${cycleId} ended.`);
    }
  };

  // Launch polling loop
  runPollingCycle(currentCycleId);

  // 4. Watchdog: check every 6 seconds to ensure the polling worker never stalls
  if (watchdogInterval) clearInterval(watchdogInterval);
  watchdogInterval = setInterval(async () => {
    if (pollingActive && currentBotToken && !isPollingLoopRunning) {
      try {
        const cfg = await getTelegramConfig(userId);
        if (cfg && cfg.isActive === false) {
          stopTelegramPolling();
          return;
        }
      } catch {}
      console.log('[Telegram Bot] Watchdog: restarting real-time polling worker...');
      runPollingCycle(pollingCycleCounter);
    }
  }, 6000);
}

/**
 * Stops polling cleanly
 */
export function stopTelegramPolling() {
  pollingActive = false;
  isPollingLoopRunning = false;
  currentBotToken = null;
  pollingCycleCounter++;
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
  if (pollingAbortController) {
    try {
      pollingAbortController.abort();
    } catch {}
    pollingAbortController = null;
  }
  // Clear any pending 3-second product batch buffers
  for (const buffer of productBatchBuffers.values()) {
    if (buffer.timer) {
      clearTimeout(buffer.timer);
    }
  }
  productBatchBuffers.clear();
  console.log('[Telegram Bot] Real-time polling worker completely stopped and paused.');
}

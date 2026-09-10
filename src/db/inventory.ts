import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db, isPostgresConfigured } from './index.ts';
import { aiConfigs, customerOrders, customers, inventoryItems, payments, purchases, serverDomainConfigs, storeConfigs, suppliers, telegramConfigs, telegramMessages, users } from './schema.ts';
import { normalizeEcuadorPhone } from '../utils/phone.ts';
import { validateEcuadorId } from '../utils/ecuadorIdValidator.ts';
import {
  isOrderPartiallyDelivered,
  isOrderConfirmed,
  isOrderLockedFromCancellationOrDeletion,
  getOrderCancellationBlockReason,
  getOrderDeletionBlockReason,
  isPickupDeliveryOrder,
  deriveBankOrAccountFromMethod,
} from '../utils/orderUtils.ts';
export {
  isOrderPartiallyDelivered,
  isOrderConfirmed,
  isOrderLockedFromCancellationOrDeletion,
  deriveBankOrAccountFromMethod,
};
import { storage } from './storage.ts';
import {
  persistImageLocally,
  persistImageListLocally,
  persistVideoLocally,
  extractMediaUrlsFromProduct,
  cleanupUnreferencedMediaList,
  deleteMediaFileIfUnreferenced,
} from '../services/media-storage.ts';

/**
 * Sanitizes numeric strings to guarantee valid SQL NUMERIC/DECIMAL values (e.g., '12.50')
 */
export function cleanNumericString(val: any, fallback: string = '0.00'): string {
  if (val === undefined || val === null || val === '') return fallback;
  const num = Number(val);
  if (isNaN(num) || !isFinite(num)) return fallback;
  return num.toFixed(2);
}

/**
 * Sanitizes integer inputs to guarantee valid SQL INTEGER values
 */
export function cleanInteger(val: any, fallback: number = 0): number {
  if (val === undefined || val === null || val === '') return fallback;
  const num = parseInt(String(val), 10);
  if (isNaN(num) || !isFinite(num)) return fallback;
  return num;
}

/**
 * Resolves a valid user ID from the PostgreSQL users table to satisfy Foreign Key constraints.
 * If the requested userId does not exist, it falls back to the first registered user or creates the system admin.
 */
export async function resolveValidUserId(preferredUserId?: number): Promise<number> {
  if (!isPostgresConfigured()) {
    return preferredUserId || 1;
  }
  try {
    if (preferredUserId && preferredUserId > 0) {
      const user = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, preferredUserId))
        .limit(1);
      if (user.length > 0) {
        return user[0].id;
      }
    }
    // Fallback to the first registered user (usually the administrator)
    const anyUser = await db
      .select({ id: users.id })
      .from(users)
      .orderBy(users.id)
      .limit(1);
    if (anyUser.length > 0) {
      return anyUser[0].id;
    }
    // If no user exists yet in the database, return preferred ID without modifying table
    return preferredUserId || 1;
  } catch (err) {
    console.warn('Error resolving valid user ID in PostgreSQL:', err);
    return preferredUserId || 1;
  }
}

/**
 * Safely parse order/purchase items whether they are an Array, a JSON string,
 * a double-stringified JSON string, or undefined/null.
 */
export function safeParseOrderItems(items: any): any[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    const trimmed = items.trim();
    if (!trimmed || trimmed === '[]' || trimmed === 'null' || trimmed === 'undefined') return [];
    try {
      let parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {}
      }
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Computes the 4 Professional ERP Stock Metrics for every product:
 * 1. Physical Stock (On Hand in Warehouse)
 * 2. Reserved Stock (Allocated to confirmed sales orders awaiting fulfillment)
 * 3. Available to Promise / ATP (Physical - Reserved)
 * 4. Incoming Stock (On order from suppliers in active Purchase Orders)
 */
export function attachErpStockMetricsToItems(
  items: any[],
  ordersList: any[] = storage.getState().customerOrders || [],
  purchasesList: any[] = storage.getState().purchases || []
) {
  return items.map((item) => {
    const physicalStock = Math.max(0, Number(item.stock || 0));

    // Reserved: Confirmed sales orders waiting for shipment / delivery
    let reservedStock = 0;
    for (const ord of ordersList) {
      if (ord.status === 'confirmed') {
        const ordItems = safeParseOrderItems(ord.items);

        for (const oi of ordItems) {
          const isMatch =
            (oi.id && (oi.id === item.id || oi.inventoryItemId === item.id)) ||
            (oi.inventoryItemId && oi.inventoryItemId === item.id) ||
            (oi.sku && item.sku && oi.sku.toLowerCase() === item.sku.toLowerCase()) ||
            (oi.name && item.name && oi.name.trim().toLowerCase() === item.name.trim().toLowerCase());

          if (isMatch) {
            const requested = Number(oi.quantity || 1);
            const delivered = Number(oi.deliveredQuantity || 0);
            const pendingToDeliver = Math.max(0, requested - delivered);
            if (pendingToDeliver > 0) {
              reservedStock += pendingToDeliver;
            }
          }
        }
      }
    }

    // Incoming: Active Purchase Orders with suppliers (ordered, in_transit, partially_received, pending)
    let incomingStock = 0;
    for (const po of purchasesList) {
      if (po.status === 'ordered' || po.status === 'in_transit' || po.status === 'partially_received' || po.status === 'pending') {
        const poItems = safeParseOrderItems(po.items);

        for (const pi of poItems) {
          const isMatch =
            (pi.inventoryItemId && pi.inventoryItemId === item.id) ||
            (pi.sku && item.sku && pi.sku.toLowerCase() === item.sku.toLowerCase()) ||
            (pi.name && item.name && pi.name.trim().toLowerCase() === item.name.trim().toLowerCase());

          if (isMatch) {
            const pendingQty = Number(
              pi.pendingQuantity !== undefined
                ? pi.pendingQuantity
                : Math.max(0, Number(pi.quantity || 1) - Number(pi.receivedQuantity || 0))
            );
            if (pendingQty > 0) {
              incomingStock += pendingQty;
            }
          }
        }
      }
    }

    const availableStock = Math.max(0, physicalStock - reservedStock);

    return {
      ...item,
      physicalStock,
      reservedStock,
      availableStock,
      incomingStock,
    };
  });
}

export function normalizeItemTaxesAndPrices<T extends Record<string, any>>(item: T): T {
  if (!item) return item;
  let costWithoutTax = item.costWithoutTax;
  let costWithTax = item.costWithTax;
  const taxRate = item.taxRate !== undefined && item.taxRate !== null && !isNaN(Number(item.taxRate))
    ? Number(item.taxRate)
    : 15.0;

  let hasPurchaseTax = item.hasPurchaseTax;
  let purchaseTaxPercent = item.purchaseTaxPercent;
  let applySaleTax = item.applySaleTax;
  let saleTaxPercent = item.saleTaxPercent;

  if (item.extractedAttributes) {
    try {
      const parsed = typeof item.extractedAttributes === 'string' ? JSON.parse(item.extractedAttributes) : item.extractedAttributes;
      if (!costWithoutTax && (parsed.costWithoutTax || parsed.baseCostPrice)) {
        costWithoutTax = String(parsed.costWithoutTax || parsed.baseCostPrice);
      }
      if (!costWithTax && (parsed.costWithTax || parsed.costPriceWithTax)) {
        costWithTax = String(parsed.costWithTax || parsed.costPriceWithTax);
      }
      if (hasPurchaseTax === undefined && parsed.hasPurchaseTax !== undefined) {
        hasPurchaseTax = Boolean(parsed.hasPurchaseTax);
      }
      if (purchaseTaxPercent === undefined && parsed.purchaseTaxPercent !== undefined) {
        purchaseTaxPercent = Number(parsed.purchaseTaxPercent);
      }
      if (applySaleTax === undefined && parsed.applySaleTax !== undefined) {
        applySaleTax = Boolean(parsed.applySaleTax);
      }
      if (saleTaxPercent === undefined && parsed.saleTaxPercent !== undefined) {
        saleTaxPercent = Number(parsed.saleTaxPercent);
      }
    } catch {}
  }

  if (hasPurchaseTax === undefined) {
    hasPurchaseTax = taxRate > 0;
  }
  if (purchaseTaxPercent === undefined) {
    purchaseTaxPercent = taxRate > 0 ? taxRate : 15.0;
  }

  if (costWithoutTax === undefined || costWithoutTax === null || costWithTax === undefined || costWithTax === null) {
    const costNum = parseFloat(String(item.costPrice || '0')) || 0;
    if (!costWithTax) {
      costWithTax = costNum > 0 ? costNum.toFixed(2) : '0.00';
    }
    if (!costWithoutTax) {
      const numWith = parseFloat(String(costWithTax)) || costNum;
      costWithoutTax = (numWith / (1 + taxRate / 100)).toFixed(2);
    }
  }

  return {
    ...item,
    costWithoutTax: costWithoutTax ? String(Number(costWithoutTax).toFixed(2)) : '0.00',
    costWithTax: costWithTax ? String(Number(costWithTax).toFixed(2)) : '0.00',
    taxRate: String(taxRate.toFixed(2)),
    hasPurchaseTax: Boolean(hasPurchaseTax),
    purchaseTaxPercent: Number(purchaseTaxPercent),
    applySaleTax: applySaleTax !== undefined ? Boolean(applySaleTax) : false,
    saleTaxPercent: saleTaxPercent !== undefined && !isNaN(Number(saleTaxPercent)) ? Number(saleTaxPercent) : taxRate,
  };
}

export async function getInventoryItems(
  userId?: number,
  filters?: { search?: string; category?: string; status?: string; supplier?: string }
) {
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    let list = [...state.inventoryItems];

    if (filters?.category && filters.category !== 'all') {
      list = list.filter((item) => item.category === filters.category);
    }
    if (filters?.status && filters.status !== 'all') {
      list = list.filter((item) => item.status === filters.status);
    }
    if (filters?.supplier && filters.supplier !== 'all') {
      list = list.filter((item) => item.supplierName === filters.supplier);
    }
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(
        (item) =>
          item.name?.toLowerCase().includes(q) ||
          item.sku?.toLowerCase().includes(q) ||
          (item as any).barcode?.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          item.tags?.toLowerCase().includes(q) ||
          item.supplierName?.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const processed = list.map((item) => {
      let images: string[] = [];
      if (item.extractedAttributes) {
        try {
          const parsed = JSON.parse(item.extractedAttributes);
          if (Array.isArray(parsed.images)) {
            images = parsed.images.filter(Boolean);
          }
        } catch {}
      }
      if (images.length === 0 && item.imageUrl) {
        images = [item.imageUrl];
      }
      return normalizeItemTaxesAndPrices({
        ...item,
        images,
      });
    });

    return attachErpStockMetricsToItems(processed, state.customerOrders, state.purchases);
  }

  try {
    const conditions = [];

    if (filters?.category && filters.category !== 'all') {
      conditions.push(eq(inventoryItems.category, filters.category));
    }

    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(inventoryItems.status, filters.status));
    }

    if (filters?.supplier && filters.supplier !== 'all') {
      conditions.push(eq(inventoryItems.supplierName, filters.supplier));
    }

    if (filters?.search && filters.search.trim()) {
      const q = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(inventoryItems.name, q),
          ilike(inventoryItems.sku, q),
          ilike(inventoryItems.barcode, q),
          ilike(inventoryItems.description, q),
          ilike(inventoryItems.tags, q),
          ilike(inventoryItems.supplierName, q)
        )
      );
    }

    const query = db
      .select()
      .from(inventoryItems)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(inventoryItems.createdAt));

    const rows = await query;
    const processed = rows.map((item) => {
      let images: string[] = [];
      let videoUrl = item.videoUrl || null;
      if (item.extractedAttributes) {
        try {
          const parsed = JSON.parse(item.extractedAttributes);
          if (Array.isArray(parsed.images)) {
            images = parsed.images.filter(Boolean);
          }
          if (!videoUrl && (parsed.videoUrl || parsed.video)) {
            videoUrl = parsed.videoUrl || parsed.video;
          }
        } catch {}
      }
      if (images.length === 0 && item.imageUrl) {
        images = [item.imageUrl];
      }
      return normalizeItemTaxesAndPrices({
        ...item,
        images,
        videoUrl,
      });
    });

    const state = storage.getState();
    return attachErpStockMetricsToItems(processed, state.customerOrders, state.purchases);
  } catch (error) {
    console.warn('Error fetching inventory items from SQL, using local store:', error);
    const state = storage.getState();
    const processed = state.inventoryItems.map((item) => {
      let videoUrl = item.videoUrl || null;
      if (!videoUrl && item.extractedAttributes) {
        try {
          const parsed = JSON.parse(item.extractedAttributes);
          videoUrl = parsed.videoUrl || parsed.video || null;
        } catch {}
      }
      return normalizeItemTaxesAndPrices({
        ...item,
        images: item.imageUrl ? [item.imageUrl] : [],
        videoUrl,
      });
    });
    return attachErpStockMetricsToItems(processed, state.customerOrders, state.purchases);
  }
}

export async function getInventoryItemById(id: number) {
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const item = state.inventoryItems.find((it) => it.id === id);
    if (!item) return null;

    let images: string[] = [];
    let videoUrl = item.videoUrl || null;
    if (item.extractedAttributes) {
      try {
        const parsed = JSON.parse(item.extractedAttributes);
        if (Array.isArray(parsed.images)) {
          images = parsed.images.filter(Boolean);
        }
        if (!videoUrl && (parsed.videoUrl || parsed.video)) {
          videoUrl = parsed.videoUrl || parsed.video;
        }
      } catch {}
    }
    if (images.length === 0 && item.imageUrl) {
      images = [item.imageUrl];
    }
    return normalizeItemTaxesAndPrices({
      ...item,
      images,
      videoUrl,
    });
  }

  try {
    const items = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1);

    if (!items[0]) return null;
    const item = items[0];

    let images: string[] = [];
    let videoUrl = item.videoUrl || null;
    if (item.extractedAttributes) {
      try {
        const parsed = JSON.parse(item.extractedAttributes);
        if (Array.isArray(parsed.images)) {
          images = parsed.images.filter(Boolean);
        }
        if (!videoUrl && (parsed.videoUrl || parsed.video)) {
          videoUrl = parsed.videoUrl || parsed.video;
        }
      } catch {}
    }
    if (images.length === 0 && item.imageUrl) {
      images = [item.imageUrl];
    }

    return normalizeItemTaxesAndPrices({
      ...item,
      images,
      videoUrl,
    });
  } catch (error) {
    console.warn('Error fetching inventory item by id from SQL, fallback:', error);
    const state = storage.getState();
    const item = state.inventoryItems.find((it) => it.id === id);
    if (!item) return null;
    let videoUrl = item.videoUrl || null;
    if (!videoUrl && item.extractedAttributes) {
      try {
        const parsed = JSON.parse(item.extractedAttributes);
        videoUrl = parsed.videoUrl || parsed.video || null;
      } catch {}
    }
    return normalizeItemTaxesAndPrices({
      ...item,
      images: item.imageUrl ? [item.imageUrl] : [],
      videoUrl,
    });
  }
}

export async function appendImagesToInventoryItem(
  id: number,
  newImageUrls: (string | { url: string; fallbackUrl?: string; thumbnailUrl?: string })[],
  setAsCover = true
) {
  try {
    const item = await getInventoryItemById(id);
    if (!item) return null;

    // Automatically persist all incoming external/base64 images locally in /uploads/
    const persistedNewUrls = await persistImageListLocally(newImageUrls as any);
    if (persistedNewUrls.length === 0) {
      return item;
    }

    let parsedAttr: Record<string, any> = {};
    if (item.extractedAttributes) {
      try {
        parsedAttr = JSON.parse(item.extractedAttributes);
      } catch {}
    }

    const currentImages: string[] = [];
    if (Array.isArray(parsedAttr.images)) {
      parsedAttr.images.forEach((u: string) => {
        const c = u?.trim();
        if (c && !currentImages.includes(c)) currentImages.push(c);
      });
    }
    if (Array.isArray((item as any).images)) {
      (item as any).images.forEach((u: string) => {
        const c = u?.trim();
        if (c && !currentImages.includes(c)) currentImages.push(c);
      });
    }
    if (item.imageUrl && item.imageUrl.trim() !== '' && item.imageUrl !== 'null') {
      const c = item.imageUrl.trim();
      if (!currentImages.includes(c)) currentImages.push(c);
    }

    const uniqueNew = persistedNewUrls
      .map((u) => u?.trim())
      .filter((u): u is string => Boolean(u) && !currentImages.includes(u));

    // If setAsCover is true or product previously had no valid image, make the first new photo the cover
    const shouldBeCover = setAsCover || !item.imageUrl || item.imageUrl.trim() === '' || item.imageUrl === 'null' || currentImages.length === 0;

    if (shouldBeCover) {
      // Put new images at the front of the list
      currentImages.unshift(...uniqueNew);
    } else {
      currentImages.push(...uniqueNew);
    }

    parsedAttr.images = currentImages;
    parsedAttr.totalPhotos = currentImages.length;

    const primaryImage = shouldBeCover
      ? persistedNewUrls[0] || uniqueNew[0] || currentImages[0] || null
      : item.imageUrl || currentImages[0] || persistedNewUrls[0] || null;

    let updatedRow: any = null;

    if (isPostgresConfigured()) {
      try {
        const result = await db
          .update(inventoryItems)
          .set({
            imageUrl: primaryImage,
            extractedAttributes: JSON.stringify(parsedAttr),
            updatedAt: new Date(),
          })
          .where(eq(inventoryItems.id, id))
          .returning();

        if (result && result.length > 0) {
          updatedRow = result[0];
        }
      } catch (sqlErr) {
        console.warn('Postgres error in appendImagesToInventoryItem, updating local fallback:', sqlErr);
      }
    }

    // Always keep in-memory/JSON store in sync
    const state = storage.getState();
    const idx = state.inventoryItems.findIndex((it) => it.id === id);
    if (idx !== -1) {
      state.inventoryItems[idx].imageUrl = primaryImage;
      state.inventoryItems[idx].extractedAttributes = JSON.stringify(parsedAttr);
      state.inventoryItems[idx].updatedAt = new Date().toISOString();
      storage.save();
      if (!updatedRow) {
        updatedRow = state.inventoryItems[idx];
      }
    }

    return {
      ...(updatedRow || item),
      imageUrl: primaryImage,
      extractedAttributes: JSON.stringify(parsedAttr),
      images: currentImages,
    };
  } catch (error) {
    console.error('Error appending images to inventory item:', error);
    return null;
  }
}

export async function appendImageToInventoryItem(id: number, newImageUrl: string) {
  return appendImagesToInventoryItem(id, [newImageUrl], true);
}

export async function clearAllImagesFromInventoryItem(id: number) {
  try {
    const item = await getInventoryItemById(id);
    if (!item) return null;

    const previousMediaUrls = extractMediaUrlsFromProduct(item).filter((u) => !u.match(/\.(mp4|webm|mov|ogg|m4v)$/i));

    let parsedAttr: Record<string, any> = {};
    if (item.extractedAttributes) {
      try {
        parsedAttr = JSON.parse(item.extractedAttributes);
      } catch {}
    }

    parsedAttr.images = [];
    parsedAttr.totalPhotos = 0;

    let updatedRow: any = null;

    if (isPostgresConfigured()) {
      try {
        const result = await db
          .update(inventoryItems)
          .set({
            imageUrl: null,
            extractedAttributes: JSON.stringify(parsedAttr),
            updatedAt: new Date(),
          })
          .where(eq(inventoryItems.id, id))
          .returning();

        if (result && result.length > 0) {
          updatedRow = result[0];
        }
      } catch (sqlErr) {
        console.warn('Postgres error in clearAllImagesFromInventoryItem:', sqlErr);
      }
    }

    const state = storage.getState();
    const idx = state.inventoryItems.findIndex((it) => it.id === id);
    if (idx !== -1) {
      state.inventoryItems[idx].imageUrl = null;
      state.inventoryItems[idx].extractedAttributes = JSON.stringify(parsedAttr);
      state.inventoryItems[idx].updatedAt = new Date().toISOString();
      storage.save();
      if (!updatedRow) {
        updatedRow = state.inventoryItems[idx];
      }
    }

    // Clean up media files physically from /uploads if no other product uses them
    if (previousMediaUrls.length > 0) {
      cleanupUnreferencedMediaList(previousMediaUrls, id).catch((err) => {
        console.warn('Error cleaning up unreferenced files in clearAllImagesFromInventoryItem:', err);
      });
    }

    return {
      ...(updatedRow || item),
      imageUrl: null,
      extractedAttributes: JSON.stringify(parsedAttr),
      images: [],
    };
  } catch (error) {
    console.error('Error clearing all images from inventory item:', error);
    return null;
  }
}

export async function removeImageFromInventoryItem(id: number, imageUrlToRemove?: string, photoIndex?: number) {
  try {
    const item = await getInventoryItemById(id);
    if (!item) return null;

    let parsedAttr: Record<string, any> = {};
    if (item.extractedAttributes) {
      try {
        parsedAttr = JSON.parse(item.extractedAttributes);
      } catch {}
    }

    let currentImages: string[] = Array.isArray(parsedAttr.images) && parsedAttr.images.length > 0
      ? [...parsedAttr.images]
      : item.imageUrl
      ? [item.imageUrl]
      : [];

    const norm = (u: string) => {
      try {
        return decodeURIComponent(String(u).trim());
      } catch {
        return String(u).trim();
      }
    };

    let removed = false;
    let removedUrls: string[] = [];

    if (typeof photoIndex === 'number' && photoIndex >= 0 && photoIndex < currentImages.length) {
      const spliced = currentImages.splice(photoIndex, 1);
      removedUrls.push(...spliced);
      removed = true;
    } else if (imageUrlToRemove) {
      const targetNorm = norm(imageUrlToRemove);
      const toKeep: string[] = [];
      for (const img of currentImages) {
        const imgNorm = norm(img);
        if (imgNorm === targetNorm || img === imageUrlToRemove || img.trim() === imageUrlToRemove.trim()) {
          removedUrls.push(img);
        } else {
          toKeep.push(img);
        }
      }
      if (removedUrls.length > 0) {
        currentImages = toKeep;
        removed = true;
      } else {
        if (currentImages.length === 1 || (item.imageUrl && norm(item.imageUrl) === targetNorm)) {
          removedUrls.push(imageUrlToRemove);
          if (item.imageUrl) removedUrls.push(item.imageUrl);
          currentImages = [];
          removed = true;
        }
      }
    } else if (currentImages.length > 0) {
      const popped = currentImages.pop();
      if (popped) removedUrls.push(popped);
      removed = true;
    }

    parsedAttr.images = currentImages;
    parsedAttr.totalPhotos = currentImages.length;

    let newPrimaryImage: string | null = currentImages[0] || null;
    if (item.imageUrl && currentImages.some((img) => norm(img) === norm(item.imageUrl!))) {
      newPrimaryImage = item.imageUrl;
    }

    let updatedRow: any = null;

    if (isPostgresConfigured()) {
      try {
        const result = await db
          .update(inventoryItems)
          .set({
            imageUrl: newPrimaryImage,
            extractedAttributes: JSON.stringify(parsedAttr),
            updatedAt: new Date(),
          })
          .where(eq(inventoryItems.id, id))
          .returning();

        if (result && result.length > 0) {
          updatedRow = result[0];
        }
      } catch (sqlErr) {
        console.warn('Postgres error in removeImageFromInventoryItem:', sqlErr);
      }
    }

    const state = storage.getState();
    const idx = state.inventoryItems.findIndex((it) => it.id === id);
    if (idx !== -1) {
      state.inventoryItems[idx].imageUrl = newPrimaryImage;
      state.inventoryItems[idx].extractedAttributes = JSON.stringify(parsedAttr);
      state.inventoryItems[idx].updatedAt = new Date().toISOString();
      storage.save();
      if (!updatedRow) {
        updatedRow = state.inventoryItems[idx];
      }
    }

    // Clean up removed image files physically from disk if not referenced elsewhere
    if (removedUrls.length > 0) {
      // Filter out URLs that might still remain in currentImages
      const genuinelyRemoved = removedUrls.filter((u) => !currentImages.some((c) => norm(c) === norm(u)));
      if (genuinelyRemoved.length > 0) {
        cleanupUnreferencedMediaList(genuinelyRemoved, id).catch((err) => {
          console.warn('Error cleaning up unreferenced files in removeImageFromInventoryItem:', err);
        });
      }
    }

    return {
      ...(updatedRow || item),
      imageUrl: newPrimaryImage,
      extractedAttributes: JSON.stringify(parsedAttr),
      images: currentImages,
    };
  } catch (error) {
    console.error('Error removing image from inventory item:', error);
    return null;
  }
}

export async function setCoverImageForInventoryItem(id: number, coverImageUrl: string) {
  try {
    const item = await getInventoryItemById(id);
    if (!item) return null;

    let effectiveCoverUrl = coverImageUrl;
    if (effectiveCoverUrl && typeof effectiveCoverUrl === 'string') {
      const persisted = await persistImageLocally(effectiveCoverUrl);
      if (persisted) effectiveCoverUrl = persisted;
    }

    let parsedAttr: Record<string, any> = {};
    if (item.extractedAttributes) {
      try {
        parsedAttr = JSON.parse(item.extractedAttributes);
      } catch {}
    }

    let currentImages: string[] = Array.isArray(parsedAttr.images)
      ? [...parsedAttr.images]
      : item.imageUrl
      ? [item.imageUrl]
      : [];

    if (!currentImages.includes(effectiveCoverUrl)) {
      currentImages.unshift(effectiveCoverUrl);
    } else {
      currentImages = [effectiveCoverUrl, ...currentImages.filter((i) => i !== effectiveCoverUrl)];
    }

    parsedAttr.images = currentImages;
    parsedAttr.totalPhotos = currentImages.length;

    let updatedRow: any = null;

    if (isPostgresConfigured()) {
      try {
        const result = await db
          .update(inventoryItems)
          .set({
            imageUrl: effectiveCoverUrl,
            extractedAttributes: JSON.stringify(parsedAttr),
            updatedAt: new Date(),
          })
          .where(eq(inventoryItems.id, id))
          .returning();

        if (result && result.length > 0) {
          updatedRow = result[0];
        }
      } catch (sqlErr) {
        console.warn('Postgres error in setCoverImageForInventoryItem:', sqlErr);
      }
    }

    const state = storage.getState();
    const idx = state.inventoryItems.findIndex((it) => it.id === id);
    if (idx !== -1) {
      state.inventoryItems[idx].imageUrl = effectiveCoverUrl;
      state.inventoryItems[idx].extractedAttributes = JSON.stringify(parsedAttr);
      state.inventoryItems[idx].updatedAt = new Date().toISOString();
      storage.save();
      if (!updatedRow) {
        updatedRow = state.inventoryItems[idx];
      }
    }

    return {
      ...(updatedRow || item),
      imageUrl: coverImageUrl,
      extractedAttributes: JSON.stringify(parsedAttr),
      images: currentImages,
    };
  } catch (error) {
    console.error('Error setting cover image:', error);
    return null;
  }
}

/**
 * Sets or removes the product video URL, persisting if local video data is provided.
 */
export async function setInventoryItemVideo(id: number, rawVideoUrl: string | null | undefined) {
  try {
    const item = await getInventoryItemById(id);
    if (!item) return null;

    let finalVideoUrl: string | null = null;
    if (rawVideoUrl && typeof rawVideoUrl === 'string' && rawVideoUrl.trim()) {
      const trimmed = rawVideoUrl.trim();
      finalVideoUrl = await persistVideoLocally(trimmed) || trimmed;
    }

    let parsedAttr: Record<string, any> = {};
    if (item.extractedAttributes) {
      try {
        parsedAttr = JSON.parse(item.extractedAttributes);
      } catch {}
    }

    const oldVideoUrl = item.videoUrl;

    if (finalVideoUrl) {
      parsedAttr.videoUrl = finalVideoUrl;
      parsedAttr.video = finalVideoUrl;
    } else {
      delete parsedAttr.videoUrl;
      delete parsedAttr.video;
    }

    let updatedRow: any = null;

    if (isPostgresConfigured()) {
      try {
        const result = await db
          .update(inventoryItems)
          .set({
            videoUrl: finalVideoUrl,
            extractedAttributes: JSON.stringify(parsedAttr),
            updatedAt: new Date(),
          })
          .where(eq(inventoryItems.id, id))
          .returning();

        if (result && result.length > 0) {
          updatedRow = result[0];
        }
      } catch (sqlErr) {
        console.warn('Postgres error in setInventoryItemVideo:', sqlErr);
      }
    }

    const state = storage.getState();
    const idx = state.inventoryItems.findIndex((it) => it.id === id);
    if (idx !== -1) {
      state.inventoryItems[idx].videoUrl = finalVideoUrl;
      state.inventoryItems[idx].extractedAttributes = JSON.stringify(parsedAttr);
      state.inventoryItems[idx].updatedAt = new Date().toISOString();
      storage.save();
      if (!updatedRow) {
        updatedRow = state.inventoryItems[idx];
      }
    }

    // Clean up old video file if replaced or removed and not used elsewhere
    if (oldVideoUrl && oldVideoUrl !== finalVideoUrl) {
      cleanupUnreferencedMediaList([oldVideoUrl], id).catch((err) => {
        console.warn('Error cleaning up unreferenced video file:', err);
      });
    }

    return {
      ...(updatedRow || item),
      videoUrl: finalVideoUrl,
      extractedAttributes: JSON.stringify(parsedAttr),
    };
  } catch (error) {
    console.error('Error setting product video:', error);
    return null;
  }
}

export function getSupplierSkuPrefix(supplierName?: string): string {
  if (!supplierName) return 'PF';
  const clean = supplierName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim();

  if (clean.length === 0) return 'PF';
  return clean.slice(0, 3).toUpperCase();
}

export async function generateNextSku(supplierNameOrPrefix: string = 'PF'): Promise<string> {
  const prefix =
    supplierNameOrPrefix && supplierNameOrPrefix.length <= 4 && /^[a-zA-Z0-9]+$/.test(supplierNameOrPrefix)
      ? supplierNameOrPrefix.trim().toUpperCase()
      : getSupplierSkuPrefix(supplierNameOrPrefix);

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    let maxNum = 0;
    const regex = new RegExp(`^${prefix}(\\d+)$`, 'i');

    for (const item of state.inventoryItems) {
      if (!item.sku) continue;
      const match = item.sku.trim().match(regex);
      if (match && match[1]) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > maxNum) {
          maxNum = n;
        }
      }
    }
    const nextNumber = maxNum + 1;
    return `${prefix}${String(nextNumber).padStart(5, '0')}`;
  }

  try {
    const rows = await db
      .select({ sku: inventoryItems.sku })
      .from(inventoryItems)
      .where(ilike(inventoryItems.sku, `${prefix}%`));

    let maxNum = 0;
    const regex = new RegExp(`^${prefix}(\\d+)$`, 'i');

    for (const row of rows) {
      if (!row.sku) continue;
      const match = row.sku.trim().match(regex);
      if (match && match[1]) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > maxNum) {
          maxNum = n;
        }
      }
    }

    const nextNumber = maxNum + 1;
    return `${prefix}${String(nextNumber).padStart(5, '0')}`;
  } catch (err) {
    const state = storage.getState();
    let maxNum = 0;
    const regex = new RegExp(`^${prefix}(\\d+)$`, 'i');
    for (const item of state.inventoryItems) {
      if (!item.sku) continue;
      const match = item.sku.trim().match(regex);
      if (match && match[1]) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    }
    return `${prefix}${String(maxNum + 1).padStart(5, '0')}`;
  }
}

export async function findExistingInventoryItem(data: {
  name?: string;
  sku?: string;
  rawTelegramMessage?: string;
  supplierName?: string;
}) {
  const normalizeText = (str?: string | null) => {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\sáéíóúüñ]/gi, '')
      .trim();
  };

  const incomingRaw = data.rawTelegramMessage?.trim() || '';
  const incomingNormalized = normalizeText(incomingRaw);

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (data.sku && data.sku.trim()) {
      const match = state.inventoryItems.find((it) => it.sku?.toLowerCase() === data.sku!.trim().toLowerCase());
      if (match) return match;
    }
    if (data.name && data.name.trim()) {
      const match = state.inventoryItems.find((it) => it.name?.toLowerCase() === data.name!.trim().toLowerCase());
      if (match) return match;
    }
    if (incomingRaw.length >= 10) {
      const match = state.inventoryItems.find((it) => {
        if (!it.rawTelegramMessage) return false;
        const storedRaw = it.rawTelegramMessage.trim();
        if (storedRaw === incomingRaw) return true;
        if (incomingNormalized.length >= 10) {
          const storedNorm = normalizeText(storedRaw);
          if (storedNorm === incomingNormalized) return true;
          if (incomingNormalized.length >= 25 && (storedNorm.includes(incomingNormalized) || incomingNormalized.includes(storedNorm))) {
            return true;
          }
        }
        return false;
      });
      if (match) return match;
    }
    return null;
  }

  try {
    if (data.sku && data.sku.trim()) {
      const bySku = await db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.sku, data.sku.trim()))
        .limit(1);
      if (bySku[0]) return bySku[0];
    }

    if (data.name && data.name.trim()) {
      const cleanName = data.name.trim();
      const byName = await db
        .select()
        .from(inventoryItems)
        .where(ilike(inventoryItems.name, cleanName))
        .limit(1);
      if (byName[0]) return byName[0];
    }

    if (incomingRaw.length >= 10) {
      // 1. Exact raw string match
      const byMsgExact = await db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.rawTelegramMessage, incomingRaw))
        .limit(1);
      if (byMsgExact[0]) return byMsgExact[0];

      // 2. Case-insensitive ilike match
      const byMsgIlike = await db
        .select()
        .from(inventoryItems)
        .where(ilike(inventoryItems.rawTelegramMessage, incomingRaw))
        .limit(1);
      if (byMsgIlike[0]) return byMsgIlike[0];

      // 3. Substring match if message contains a significant distinctive description (>= 30 chars)
      if (incomingRaw.length >= 30) {
        const sampleSnippet = incomingRaw.substring(0, Math.min(incomingRaw.length, 120)).trim();
        const bySnippet = await db
          .select()
          .from(inventoryItems)
          .where(ilike(inventoryItems.rawTelegramMessage, `%${sampleSnippet}%`))
          .limit(1);
        if (bySnippet[0]) return bySnippet[0];
      }
    }

    return null;
  } catch (err) {
    console.warn('Error checking for existing inventory item in SQL:', err);
    return null;
  }
}

export async function createInventoryItem(data: {
  userId?: number;
  name: string;
  sku?: string;
  barcode?: string;
  description?: string;
  category: string;
  costPrice: string;
  costWithoutTax?: string | number | null;
  costWithTax?: string | number | null;
  taxRate?: string | number | null;
  salePrice: string;
  discountPercent?: number;
  stock: number;
  imageUrl?: string;
  videoUrl?: string;
  supplierName?: string;
  tags?: string;
  extractedAttributes?: string;
  status?: string;
  rawTelegramMessage?: string;
  marketingCopy?: string;
}) {
  let finalSku = data.sku?.trim();
  if (!finalSku || finalSku === 'AUTO' || finalSku.startsWith('PROD-') || finalSku.startsWith('CAL-') || finalSku.startsWith('GEN-')) {
    finalSku = await generateNextSku(data.supplierName || 'PF');
  }

  const safeDiscount = Math.max(0, Math.min(100, Number(data.discountPercent) || 0));

  const cleanCost = cleanNumericString(data.costPrice, '0.00');
  const cleanSale = cleanNumericString(data.salePrice, '0.00');
  const cleanStock = cleanInteger(data.stock, 0);
  const taxRateNum = data.taxRate !== undefined && data.taxRate !== null && !isNaN(Number(data.taxRate))
    ? Number(data.taxRate)
    : 15.0;
  const cleanTaxRate = taxRateNum.toFixed(2);

  let cleanCostWithoutTax: string | null = null;
  let cleanCostWithTax: string | null = null;

  if (data.costWithoutTax !== undefined && data.costWithoutTax !== null && String(data.costWithoutTax).trim() !== '') {
    cleanCostWithoutTax = cleanNumericString(String(data.costWithoutTax), '0.00');
  }
  if (data.costWithTax !== undefined && data.costWithTax !== null && String(data.costWithTax).trim() !== '') {
    cleanCostWithTax = cleanNumericString(String(data.costWithTax), '0.00');
  }

  // If one is provided and the other isn't, calculate the other
  if (!cleanCostWithoutTax && cleanCostWithTax) {
    const numWith = parseFloat(cleanCostWithTax) || 0;
    cleanCostWithoutTax = (numWith / (1 + taxRateNum / 100)).toFixed(2);
  } else if (!cleanCostWithTax && cleanCostWithoutTax) {
    const numWithout = parseFloat(cleanCostWithoutTax) || 0;
    cleanCostWithTax = (numWithout * (1 + taxRateNum / 100)).toFixed(2);
  } else if (!cleanCostWithoutTax && !cleanCostWithTax) {
    const costNum = parseFloat(cleanCost) || 0;
    cleanCostWithTax = costNum.toFixed(2);
    cleanCostWithoutTax = (costNum / (1 + taxRateNum / 100)).toFixed(2);
  }

  const effectiveCostPrice = cleanCostWithTax || cleanCost;

  // Automatically persist image locally in /uploads/
  let effectiveImageUrl = data.imageUrl || null;
  if (effectiveImageUrl) {
    const persisted = await persistImageLocally(effectiveImageUrl);
    if (persisted) effectiveImageUrl = persisted;
  }

  // Automatically persist video locally if base64
  let effectiveVideoUrl = data.videoUrl || null;
  if (effectiveVideoUrl) {
    const persistedVideo = await persistVideoLocally(effectiveVideoUrl);
    if (persistedVideo) effectiveVideoUrl = persistedVideo;
  }

  let effectiveExtractedAttributes = data.extractedAttributes || null;
  if (effectiveExtractedAttributes) {
    try {
      const parsed = JSON.parse(effectiveExtractedAttributes);
      if (Array.isArray(parsed.images) && parsed.images.length > 0) {
        parsed.images = await persistImageListLocally(parsed.images);
      }
      if (effectiveVideoUrl) {
        parsed.videoUrl = effectiveVideoUrl;
      } else if (parsed.videoUrl || parsed.video) {
        effectiveVideoUrl = parsed.videoUrl || parsed.video;
      }
      if ((data as any).applySaleTax !== undefined) {
        parsed.applySaleTax = Boolean((data as any).applySaleTax);
      }
      if ((data as any).saleTaxPercent !== undefined) {
        parsed.saleTaxPercent = Number((data as any).saleTaxPercent);
      }
      if ((data as any).hasPurchaseTax !== undefined) {
        parsed.hasPurchaseTax = Boolean((data as any).hasPurchaseTax);
      }
      if ((data as any).purchaseTaxPercent !== undefined) {
        parsed.purchaseTaxPercent = Number((data as any).purchaseTaxPercent);
      }
      effectiveExtractedAttributes = JSON.stringify(parsed);
    } catch {}
  } else if (
    (data as any).applySaleTax !== undefined ||
    (data as any).saleTaxPercent !== undefined ||
    (data as any).hasPurchaseTax !== undefined ||
    (data as any).purchaseTaxPercent !== undefined
  ) {
    effectiveExtractedAttributes = JSON.stringify({
      applySaleTax: Boolean((data as any).applySaleTax),
      saleTaxPercent: Number((data as any).saleTaxPercent) || taxRateNum,
      hasPurchaseTax: (data as any).hasPurchaseTax !== undefined ? Boolean((data as any).hasPurchaseTax) : taxRateNum > 0,
      purchaseTaxPercent: Number((data as any).purchaseTaxPercent) || taxRateNum,
    });
  }

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const nextId = state.nextId.inventoryItems++;
    const now = new Date().toISOString();

    const newItem = {
      id: nextId,
      userId: data.userId || 1,
      name: data.name,
      sku: finalSku,
      barcode: data.barcode?.trim() || null,
      description: data.description || '',
      category: data.category || 'General',
      costPrice: effectiveCostPrice,
      costWithoutTax: cleanCostWithoutTax,
      costWithTax: cleanCostWithTax,
      taxRate: cleanTaxRate,
      salePrice: cleanSale,
      discountPercent: safeDiscount,
      stock: Math.max(0, cleanStock),
      imageUrl: effectiveImageUrl,
      videoUrl: effectiveVideoUrl,
      supplierName: data.supplierName || 'Proveedor Telegram',
      tags: data.tags || null,
      extractedAttributes: effectiveExtractedAttributes,
      status: data.status || 'available',
      rawTelegramMessage: data.rawTelegramMessage || null,
      marketingCopy: data.marketingCopy || null,
      createdAt: now,
      updatedAt: now,
    };

    state.inventoryItems.unshift(newItem);
    storage.save();
    return newItem;
  }

  try {
    const targetUserId = await resolveValidUserId(data.userId);
    const result = await db
      .insert(inventoryItems)
      .values({
        userId: targetUserId,
        name: data.name,
        sku: finalSku,
        barcode: data.barcode?.trim() || null,
        description: data.description || '',
        category: data.category || 'General',
        costPrice: effectiveCostPrice,
        costWithoutTax: cleanCostWithoutTax,
        costWithTax: cleanCostWithTax,
        taxRate: cleanTaxRate,
        salePrice: cleanSale,
        discountPercent: safeDiscount,
        stock: Math.max(0, cleanStock),
        imageUrl: effectiveImageUrl,
        videoUrl: effectiveVideoUrl,
        supplierName: data.supplierName || 'Proveedor Telegram',
        tags: data.tags || null,
        extractedAttributes: effectiveExtractedAttributes,
        status: data.status || 'available',
        rawTelegramMessage: data.rawTelegramMessage || null,
        marketingCopy: data.marketingCopy || null,
      })
      .returning();

    const created = result[0];
    // Sync with local memory/disk cache as well
    const state = storage.getState();
    const existingIdx = state.inventoryItems.findIndex((it) => it.id === created.id);
    if (existingIdx !== -1) {
      state.inventoryItems[existingIdx] = created as any;
    } else {
      state.inventoryItems.unshift(created as any);
    }
    storage.save();

    return created;
  } catch (error) {
    console.error('Error creating inventory item in SQL, fallback to local storage:', error);
    const state = storage.getState();
    const nextId = state.nextId.inventoryItems++;
    const now = new Date().toISOString();
    const newItem = {
      id: nextId,
      userId: data.userId || 1,
      name: data.name,
      sku: finalSku,
      barcode: data.barcode?.trim() || null,
      description: data.description || '',
      category: data.category || 'General',
      costPrice: effectiveCostPrice,
      costWithoutTax: cleanCostWithoutTax,
      costWithTax: cleanCostWithTax,
      taxRate: cleanTaxRate,
      salePrice: cleanSale,
      discountPercent: safeDiscount,
      stock: Math.max(0, cleanStock),
      imageUrl: data.imageUrl || null,
      videoUrl: data.videoUrl || null,
      supplierName: data.supplierName || 'Proveedor Telegram',
      tags: data.tags || null,
      extractedAttributes: data.extractedAttributes || null,
      status: data.status || 'available',
      rawTelegramMessage: data.rawTelegramMessage || null,
      marketingCopy: data.marketingCopy || null,
      createdAt: now,
      updatedAt: now,
    };
    state.inventoryItems.unshift(newItem);
    storage.save();
    return newItem;
  }
}

export async function saveProductMarketingCopy(id: number, copyData: any) {
  const jsonString = typeof copyData === 'string' ? copyData : JSON.stringify(copyData);
  return updateInventoryItem(id, { marketingCopy: jsonString });
}

export async function updateInventoryItem(
  id: number,
  data: Partial<typeof inventoryItems.$inferInsert>
) {
  const sanitizedPayload: Record<string, any> = { ...data };
  if (data.costPrice !== undefined) sanitizedPayload.costPrice = cleanNumericString(data.costPrice, '0.00');
  if (data.costWithoutTax !== undefined && data.costWithoutTax !== null && String(data.costWithoutTax).trim() !== '') {
    sanitizedPayload.costWithoutTax = cleanNumericString(String(data.costWithoutTax), '0.00');
  }
  if (data.costWithTax !== undefined && data.costWithTax !== null && String(data.costWithTax).trim() !== '') {
    sanitizedPayload.costWithTax = cleanNumericString(String(data.costWithTax), '0.00');
  }
  if (data.taxRate !== undefined && data.taxRate !== null && String(data.taxRate).trim() !== '') {
    sanitizedPayload.taxRate = cleanNumericString(String(data.taxRate), '0.00');
  }
  if (sanitizedPayload.costWithTax && data.costPrice === undefined) {
    sanitizedPayload.costPrice = sanitizedPayload.costWithTax;
  }
  if (data.salePrice !== undefined) sanitizedPayload.salePrice = cleanNumericString(data.salePrice, '0.00');
  if (data.discountPercent !== undefined) sanitizedPayload.discountPercent = cleanInteger(data.discountPercent, 0);
  if (data.stock !== undefined) sanitizedPayload.stock = cleanInteger(data.stock, 0);

  // Automatically persist image locally in /uploads/
  if (data.imageUrl !== undefined && data.imageUrl !== null && data.imageUrl !== '') {
    const persisted = await persistImageLocally(data.imageUrl);
    if (persisted) sanitizedPayload.imageUrl = persisted;
  }

  // Automatically persist video locally if provided
  if (data.videoUrl !== undefined && data.videoUrl !== null && data.videoUrl !== '') {
    const persistedVideo = await persistVideoLocally(data.videoUrl);
    if (persistedVideo) sanitizedPayload.videoUrl = persistedVideo;
  }

  // Support incoming images array if passed directly
  const incomingImages = (data as any).images || (data as any).imageUrls;

  if (data.extractedAttributes !== undefined && data.extractedAttributes !== null && data.extractedAttributes !== '') {
    try {
      const parsed = JSON.parse(data.extractedAttributes);
      if (Array.isArray(incomingImages) && incomingImages.length > 0) {
        parsed.images = incomingImages;
      }
      if (Array.isArray(parsed.images) && parsed.images.length > 0) {
        parsed.images = await persistImageListLocally(parsed.images);
        parsed.totalPhotos = parsed.images.length;
      }
      if (sanitizedPayload.videoUrl) {
        parsed.videoUrl = sanitizedPayload.videoUrl;
      }
      if ((data as any).applySaleTax !== undefined) {
        parsed.applySaleTax = Boolean((data as any).applySaleTax);
      }
      if ((data as any).saleTaxPercent !== undefined) {
        parsed.saleTaxPercent = Number((data as any).saleTaxPercent);
      }
      sanitizedPayload.extractedAttributes = JSON.stringify(parsed);
    } catch {}
  } else if (Array.isArray(incomingImages) && incomingImages.length > 0) {
    const persistedImages = await persistImageListLocally(incomingImages);
    sanitizedPayload.extractedAttributes = JSON.stringify({
      images: persistedImages,
      totalPhotos: persistedImages.length,
      ...( (data as any).applySaleTax !== undefined ? { applySaleTax: Boolean((data as any).applySaleTax) } : {} ),
      ...( (data as any).saleTaxPercent !== undefined ? { saleTaxPercent: Number((data as any).saleTaxPercent) } : {} ),
    });
  } else if ((data as any).applySaleTax !== undefined || (data as any).saleTaxPercent !== undefined) {
    sanitizedPayload.extractedAttributes = JSON.stringify({
      applySaleTax: Boolean((data as any).applySaleTax),
      saleTaxPercent: Number((data as any).saleTaxPercent),
    });
  }

  const formatItemWithImages = (row: any) => {
    if (!row) return row;
    let imgs: string[] = [];
    try {
      const p = typeof row.extractedAttributes === 'string' ? JSON.parse(row.extractedAttributes) : row.extractedAttributes;
      if (Array.isArray(p?.images)) imgs = p.images.filter(Boolean);
    } catch {}
    if (imgs.length === 0 && row.imageUrl) {
      imgs = [row.imageUrl];
    }
    return normalizeItemTaxesAndPrices({
      ...row,
      images: imgs,
    });
  };

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const idx = state.inventoryItems.findIndex((it) => it.id === id);
    if (idx === -1) {
      throw new Error('Item no encontrado en el inventario');
    }

    const previousItem = state.inventoryItems[idx];
    const previousMediaUrls = extractMediaUrlsFromProduct(previousItem);

    const updated = {
      ...state.inventoryItems[idx],
      ...sanitizedPayload,
      updatedAt: new Date().toISOString(),
    };
    state.inventoryItems[idx] = updated as any;
    storage.save();

    // Check if any previous media files are now removed and unreferenced
    const newMediaUrls = extractMediaUrlsFromProduct(updated);
    const removedMedia = previousMediaUrls.filter((u) => !newMediaUrls.includes(u));
    if (removedMedia.length > 0) {
      cleanupUnreferencedMediaList(removedMedia, id).catch((err) => {
        console.warn('Error cleaning up unreferenced media in updateInventoryItem (local):', err);
      });
    }

    return formatItemWithImages(updated);
  }

  try {
    // Get existing item to track media differences
    const existingItem = await getInventoryItemById(id);
    const previousMediaUrls = existingItem ? extractMediaUrlsFromProduct(existingItem) : [];

    const result = await db
      .update(inventoryItems)
      .set({
        ...sanitizedPayload,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, id))
      .returning();

    const formatted = formatItemWithImages(result[0]);

    if (previousMediaUrls.length > 0) {
      const newMediaUrls = extractMediaUrlsFromProduct(result[0]);
      const removedMedia = previousMediaUrls.filter((u) => !newMediaUrls.includes(u));
      if (removedMedia.length > 0) {
        cleanupUnreferencedMediaList(removedMedia, id).catch((err) => {
          console.warn('Error cleaning up unreferenced media in updateInventoryItem (SQL):', err);
        });
      }
    }

    return formatted;
  } catch (error) {
    console.warn('Error updating inventory item in SQL, fallback to local storage:', error);
    const state = storage.getState();
    const idx = state.inventoryItems.findIndex((it) => it.id === id);
    if (idx !== -1) {
      const previousItem = state.inventoryItems[idx];
      const previousMediaUrls = extractMediaUrlsFromProduct(previousItem);

      state.inventoryItems[idx] = {
        ...state.inventoryItems[idx],
        ...sanitizedPayload,
        updatedAt: new Date().toISOString(),
      } as any;
      storage.save();

      const newMediaUrls = extractMediaUrlsFromProduct(state.inventoryItems[idx]);
      const removedMedia = previousMediaUrls.filter((u) => !newMediaUrls.includes(u));
      if (removedMedia.length > 0) {
        cleanupUnreferencedMediaList(removedMedia, id).catch((err) => {
          console.warn('Error cleaning up unreferenced media in updateInventoryItem (SQL fallback):', err);
        });
      }

      return formatItemWithImages(state.inventoryItems[idx]);
    }
    throw error;
  }
}

/**
 * Check if an inventory item is linked to any sales (customer orders) or purchases (compras a proveedores).
 * In accordance with ERP financial integrity rules, products linked to transactions cannot be deleted.
 */
export async function checkProductSalesAndPurchasesLink(id: number, productSku?: string | null) {
  let targetSku = productSku ? productSku.trim().toLowerCase() : null;
  let productName = '';

  try {
    const item = await getInventoryItemById(id);
    if (item) {
      if (item.name) productName = item.name;
      if (!targetSku && item.sku) {
        targetSku = item.sku.trim().toLowerCase();
      }
    }
  } catch {
    // Ignore error fetching item
  }

  // 1. Check Customer Orders (Ventas / Pedidos de Clientes)
  const orders = await getCustomerOrders().catch(() => []);
  const linkedOrders: Array<{ id: number; orderNumber: string; customerName: string; status: string; quantity: number }> = [];

  for (const ord of orders) {
    const rawItems = safeParseOrderItems(ord.items);
    let matched = false;
    let qty = 0;

    for (const oi of rawItems) {
      if (!oi) continue;
      const oiId = oi.id || oi.inventoryItemId || oi.item?.id || oi.item?.inventoryItemId;
      const oiSku = (oi.sku || oi.item?.sku || '').trim().toLowerCase();

      const idMatch = oiId && Number(oiId) === Number(id);
      const skuMatch = targetSku && oiSku && oiSku === targetSku;

      if (idMatch || skuMatch) {
        matched = true;
        qty += Number(oi.quantity || 1);
      }
    }

    if (matched) {
      linkedOrders.push({
        id: ord.id,
        orderNumber: ord.orderNumber || `#${ord.id}`,
        customerName: ord.customerName || 'Cliente',
        status: ord.status || 'pending',
        quantity: qty,
      });
    }
  }

  // 2. Check Purchases (Compras a Proveedores / Abastecimiento)
  const purchasesList = await getPurchases().catch(() => []);
  const linkedPurchases: Array<{ id: number; purchaseNumber: string; supplierName: string; status: string; quantity: number }> = [];

  for (const p of purchasesList) {
    const rawItems = safeParseOrderItems(p.items);
    let matched = false;
    let qty = 0;

    for (const pi of rawItems) {
      if (!pi) continue;
      const piId = pi.inventoryItemId || pi.id;
      const piSku = (pi.sku || '').trim().toLowerCase();

      const idMatch = piId && Number(piId) === Number(id);
      const skuMatch = targetSku && piSku && piSku === targetSku;

      if (idMatch || skuMatch) {
        matched = true;
        qty += Number(pi.quantity || 1);
      }
    }

    if (matched) {
      linkedPurchases.push({
        id: p.id,
        purchaseNumber: p.purchaseNumber || `#${p.id}`,
        supplierName: p.supplierName || 'Proveedor',
        status: p.status || 'pending',
        quantity: qty,
      });
    }
  }

  const isLinked = linkedOrders.length > 0 || linkedPurchases.length > 0;

  return {
    productId: id,
    productName,
    productSku: targetSku,
    isLinked,
    canDelete: !isLinked,
    linkedOrdersCount: linkedOrders.length,
    linkedPurchasesCount: linkedPurchases.length,
    linkedOrders,
    linkedPurchases,
  };
}

export async function deleteInventoryItem(id: number) {
  // Integrity check: only allow deletion if NOT linked to any sales or purchases
  const linkCheck = await checkProductSalesAndPurchasesLink(id);
  if (linkCheck.isLinked) {
    const reasons: string[] = [];
    if (linkCheck.linkedOrdersCount > 0) {
      reasons.push(
        `${linkCheck.linkedOrdersCount} venta(s)/pedido(s) de clientes (${linkCheck.linkedOrders
          .map((o) => '#' + o.orderNumber)
          .slice(0, 3)
          .join(', ')}${linkCheck.linkedOrdersCount > 3 ? '...' : ''})`
      );
    }
    if (linkCheck.linkedPurchasesCount > 0) {
      reasons.push(
        `${linkCheck.linkedPurchasesCount} compra(s) a proveedores (${linkCheck.linkedPurchases
          .map((p) => '#' + p.purchaseNumber)
          .slice(0, 3)
          .join(', ')}${linkCheck.linkedPurchasesCount > 3 ? '...' : ''})`
      );
    }

    const err: any = new Error(
      `No se puede eliminar el producto ${
        linkCheck.productName ? `"${linkCheck.productName}" ` : ''
      }porque se encuentra vinculado a ${reasons.join(' y a ')}. Solo se pueden eliminar productos sin compras ni ventas asociadas.`
    );
    err.code = 'PRODUCT_LINKED_TO_TRANSACTIONS';
    err.details = linkCheck;
    throw err;
  }

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    // Unlink telegram messages
    state.telegramMessages.forEach((m) => {
      if (m.inventoryItemId === id) m.inventoryItemId = null;
    });

    const idx = state.inventoryItems.findIndex((it) => it.id === id);
    let deleted = null;
    if (idx !== -1) {
      deleted = state.inventoryItems.splice(idx, 1)[0];
      storage.save();
    }

    // Clean up media files physically from /uploads if not referenced elsewhere
    if (deleted) {
      const mediaUrls = extractMediaUrlsFromProduct(deleted);
      if (mediaUrls.length > 0) {
        cleanupUnreferencedMediaList(mediaUrls, id).catch((err) => {
          console.warn('Error cleaning up media files in deleteInventoryItem (local):', err);
        });
      }
    }

    return { success: true, deleted };
  }

  try {
    const existing = await getInventoryItemById(id);

    await db
      .update(telegramMessages)
      .set({ inventoryItemId: null })
      .where(eq(telegramMessages.inventoryItemId, id));

    const result = await db.delete(inventoryItems).where(eq(inventoryItems.id, id)).returning();
    const deletedRow = result[0] || existing || null;

    if (deletedRow) {
      const mediaUrls = extractMediaUrlsFromProduct(deletedRow);
      if (mediaUrls.length > 0) {
        cleanupUnreferencedMediaList(mediaUrls, id).catch((err) => {
          console.warn('Error cleaning up media files in deleteInventoryItem (SQL):', err);
        });
      }
    }

    return { success: true, deleted: result[0] || null };
  } catch (error) {
    console.warn('Error deleting inventory item from SQL, fallback:', error);
    const state = storage.getState();
    const idx = state.inventoryItems.findIndex((it) => it.id === id);
    let deleted = null;
    if (idx !== -1) {
      deleted = state.inventoryItems.splice(idx, 1)[0];
      storage.save();
    }

    if (deleted) {
      const mediaUrls = extractMediaUrlsFromProduct(deleted);
      if (mediaUrls.length > 0) {
        cleanupUnreferencedMediaList(mediaUrls, id).catch((err) => {
          console.warn('Error cleaning up media files in deleteInventoryItem (SQL fallback):', err);
        });
      }
    }

    return { success: true, deleted };
  }
}

export async function deleteBulkInventoryItems(ids: number[]) {
  if (!ids || ids.length === 0) {
    return { success: true, count: 0, deletedCount: 0, blockedCount: 0, blocked: [] };
  }

  const deletableIds: number[] = [];
  const blockedItems: Array<{ id: number; name?: string; sku?: string; reason: string }> = [];

  for (const id of ids) {
    const linkCheck = await checkProductSalesAndPurchasesLink(id);
    if (linkCheck.isLinked) {
      const parts: string[] = [];
      if (linkCheck.linkedOrdersCount > 0) parts.push(`${linkCheck.linkedOrdersCount} venta(s)`);
      if (linkCheck.linkedPurchasesCount > 0) parts.push(`${linkCheck.linkedPurchasesCount} compra(s)`);
      blockedItems.push({
        id,
        name: linkCheck.productName,
        sku: linkCheck.productSku || undefined,
        reason: `Vinculado a ${parts.join(' y ')}`,
      });
    } else {
      deletableIds.push(id);
    }
  }

  if (deletableIds.length === 0) {
    const err: any = new Error(
      `Ninguno de los ${ids.length} productos seleccionados se puede eliminar porque todos se encuentran vinculados a compras o ventas registradas en el ERP.`
    );
    err.code = 'ALL_PRODUCTS_LINKED';
    err.blocked = blockedItems;
    throw err;
  }

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    state.telegramMessages.forEach((m) => {
      if (m.inventoryItemId && deletableIds.includes(m.inventoryItemId)) {
        m.inventoryItemId = null;
      }
    });

    const initialLen = state.inventoryItems.length;
    const deleted = state.inventoryItems.filter((it) => deletableIds.includes(it.id));
    state.inventoryItems = state.inventoryItems.filter((it) => !deletableIds.includes(it.id));
    storage.save();

    // Clean up media files physically from /uploads if not referenced elsewhere
    const allMediaUrls: string[] = [];
    deleted.forEach((d) => {
      allMediaUrls.push(...extractMediaUrlsFromProduct(d));
    });
    if (allMediaUrls.length > 0) {
      cleanupUnreferencedMediaList(allMediaUrls).catch((err) => {
        console.warn('Error cleaning up media files in deleteBulkInventoryItems (local):', err);
      });
    }

    return {
      success: true,
      count: deleted.length,
      deletedCount: deleted.length,
      blockedCount: blockedItems.length,
      deleted,
      blocked: blockedItems,
    };
  }

  try {
    // Gather media URLs before deletion in SQL
    let itemsToDeleteMedia: any[] = [];
    try {
      const state = storage.getState();
      itemsToDeleteMedia = state.inventoryItems.filter((it) => deletableIds.includes(it.id));
      if (itemsToDeleteMedia.length === 0) {
        itemsToDeleteMedia = await db.select().from(inventoryItems).where(inArray(inventoryItems.id, deletableIds));
      }
    } catch {}

    await db
      .update(telegramMessages)
      .set({ inventoryItemId: null })
      .where(inArray(telegramMessages.inventoryItemId, deletableIds));

    const result = await db
      .delete(inventoryItems)
      .where(inArray(inventoryItems.id, deletableIds))
      .returning();

    const mediaSource = (result && result.length > 0) ? result : itemsToDeleteMedia;
    const allMediaUrls: string[] = [];
    mediaSource.forEach((d) => {
      allMediaUrls.push(...extractMediaUrlsFromProduct(d));
    });
    if (allMediaUrls.length > 0) {
      cleanupUnreferencedMediaList(allMediaUrls).catch((err) => {
        console.warn('Error cleaning up media files in deleteBulkInventoryItems (SQL):', err);
      });
    }

    return {
      success: true,
      count: result.length,
      deletedCount: result.length,
      blockedCount: blockedItems.length,
      deleted: result,
      blocked: blockedItems,
    };
  } catch (error) {
    console.warn('Error bulk deleting in SQL, fallback:', error);
    const state = storage.getState();
    const deleted = state.inventoryItems.filter((it) => deletableIds.includes(it.id));
    state.inventoryItems = state.inventoryItems.filter((it) => !deletableIds.includes(it.id));
    storage.save();

    const allMediaUrls: string[] = [];
    deleted.forEach((d) => {
      allMediaUrls.push(...extractMediaUrlsFromProduct(d));
    });
    if (allMediaUrls.length > 0) {
      cleanupUnreferencedMediaList(allMediaUrls).catch((err) => {
        console.warn('Error cleaning up media files in deleteBulkInventoryItems (SQL fallback):', err);
      });
    }

    return {
      success: true,
      count: deleted.length,
      deletedCount: deleted.length,
      blockedCount: blockedItems.length,
      deleted,
      blocked: blockedItems,
    };
  }
}

export async function getTelegramMessages(userId?: number) {
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const list = state.telegramMessages.map((m) => {
      const inv = m.inventoryItemId ? state.inventoryItems.find((it) => it.id === m.inventoryItemId) : null;
      return {
        ...m,
        inventoryItemName: inv?.name || null,
        inventoryItemSku: inv?.sku || null,
        inventoryItemPrice: inv?.salePrice || null,
      };
    });
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list.slice(0, 100);
  }

  try {
    const query = db
      .select({
        id: telegramMessages.id,
        telegramMessageId: telegramMessages.telegramMessageId,
        senderName: telegramMessages.senderName,
        senderUsername: telegramMessages.senderUsername,
        caption: telegramMessages.caption,
        photoUrl: telegramMessages.photoUrl,
        processedStatus: telegramMessages.processedStatus,
        extractedData: telegramMessages.extractedData,
        inventoryItemId: telegramMessages.inventoryItemId,
        createdAt: telegramMessages.createdAt,
        inventoryItemName: inventoryItems.name,
        inventoryItemSku: inventoryItems.sku,
        inventoryItemPrice: inventoryItems.salePrice,
      })
      .from(telegramMessages)
      .leftJoin(inventoryItems, eq(telegramMessages.inventoryItemId, inventoryItems.id))
      .orderBy(desc(telegramMessages.createdAt))
      .limit(100);

    return await query;
  } catch (error) {
    console.warn('Error fetching telegram messages in SQL, fallback:', error);
    const state = storage.getState();
    return state.telegramMessages.slice(0, 100);
  }
}

export async function createTelegramMessageRecord(data: {
  userId: number;
  telegramMessageId?: string;
  senderName?: string;
  senderUsername?: string;
  caption?: string;
  photoUrl?: string;
  processedStatus?: string;
  extractedData?: string;
  inventoryItemId?: number;
}) {
  // Ensure photoUrl is saved to /uploads/ and never stored as raw base64
  let cleanPhotoUrl = data.photoUrl || null;
  if (cleanPhotoUrl && (cleanPhotoUrl.startsWith('data:image/') || cleanPhotoUrl.startsWith('http'))) {
    try {
      const persisted = await persistImageLocally(cleanPhotoUrl);
      if (persisted) cleanPhotoUrl = persisted;
    } catch (e) {
      console.warn('Notice: Failed to persist telegram message photo locally:', e);
    }
  }

  // Ensure extractedData does not store raw base64 data strings
  let cleanExtractedData = data.extractedData || null;
  if (cleanExtractedData && cleanExtractedData.includes('data:image/')) {
    try {
      const parsed = JSON.parse(cleanExtractedData);
      if (Array.isArray(parsed.images)) {
        parsed.images = parsed.images.map((img: any) =>
          typeof img === 'string' && img.startsWith('data:image/') ? cleanPhotoUrl || '/uploads/image.jpg' : img
        );
      }
      if (parsed.attributes && Array.isArray(parsed.attributes.images)) {
        parsed.attributes.images = parsed.attributes.images.map((img: any) =>
          typeof img === 'string' && img.startsWith('data:image/') ? cleanPhotoUrl || '/uploads/image.jpg' : img
        );
      }
      cleanExtractedData = JSON.stringify(parsed);
    } catch {
      cleanExtractedData = cleanExtractedData.replace(/data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, cleanPhotoUrl || '/uploads/image.jpg');
    }
  }

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const nextId = state.nextId.telegramMessages++;
    const now = new Date().toISOString();

    const newRecord = {
      id: nextId,
      userId: data.userId || 1,
      telegramMessageId: data.telegramMessageId || null,
      senderName: data.senderName || 'Proveedor',
      senderUsername: data.senderUsername || null,
      caption: data.caption || '',
      photoUrl: cleanPhotoUrl,
      processedStatus: data.processedStatus || 'processed',
      extractedData: cleanExtractedData,
      inventoryItemId: data.inventoryItemId || null,
      createdAt: now,
    };

    state.telegramMessages.unshift(newRecord);
    if (state.telegramMessages.length > 200) {
      state.telegramMessages = state.telegramMessages.slice(0, 200);
    }
    storage.save();
    return newRecord;
  }

  try {
    const targetUserId = await resolveValidUserId(data.userId);
    const result = await db
      .insert(telegramMessages)
      .values({
        userId: targetUserId,
        telegramMessageId: data.telegramMessageId || null,
        senderName: data.senderName || 'Proveedor',
        senderUsername: data.senderUsername || null,
        caption: data.caption || '',
        photoUrl: cleanPhotoUrl,
        processedStatus: data.processedStatus || 'processed',
        extractedData: cleanExtractedData,
        inventoryItemId: data.inventoryItemId || null,
      })
      .returning();

    const created = result[0];
    const state = storage.getState();
    state.telegramMessages.unshift(created as any);
    if (state.telegramMessages.length > 200) {
      state.telegramMessages = state.telegramMessages.slice(0, 200);
    }
    storage.save();

    return created;
  } catch (error) {
    console.warn('Error recording telegram message in SQL, fallback:', error);
    const state = storage.getState();
    const nextId = state.nextId.telegramMessages++;
    const newRecord = {
      id: nextId,
      userId: data.userId || 1,
      telegramMessageId: data.telegramMessageId || null,
      senderName: data.senderName || 'Proveedor',
      senderUsername: data.senderUsername || null,
      caption: data.caption || '',
      photoUrl: cleanPhotoUrl,
      processedStatus: data.processedStatus || 'processed',
      extractedData: cleanExtractedData,
      inventoryItemId: data.inventoryItemId || null,
      createdAt: new Date().toISOString(),
    };
    state.telegramMessages.unshift(newRecord);
    if (state.telegramMessages.length > 200) {
      state.telegramMessages = state.telegramMessages.slice(0, 200);
    }
    storage.save();
    return newRecord;
  }
}

export async function deleteTelegramMessage(id: number) {
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const idx = state.telegramMessages.findIndex((m) => m.id === id);
    let deleted = null;
    if (idx !== -1) {
      deleted = state.telegramMessages.splice(idx, 1)[0];
      storage.save();
    }
    return { success: true, deleted };
  }

  try {
    const result = await db
      .delete(telegramMessages)
      .where(eq(telegramMessages.id, id))
      .returning();
    return { success: true, deleted: result[0] || null };
  } catch (error) {
    console.warn('Error deleting telegram message in SQL, fallback:', error);
    const state = storage.getState();
    const idx = state.telegramMessages.findIndex((m) => m.id === id);
    let deleted = null;
    if (idx !== -1) {
      deleted = state.telegramMessages.splice(idx, 1)[0];
      storage.save();
    }
    return { success: true, deleted };
  }
}

export async function deleteBulkTelegramMessages(ids: number[]) {
  if (!ids || ids.length === 0) {
    return { success: true, count: 0 };
  }

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const deleted = state.telegramMessages.filter((m) => ids.includes(m.id));
    state.telegramMessages = state.telegramMessages.filter((m) => !ids.includes(m.id));
    storage.save();
    return { success: true, count: deleted.length, deleted };
  }

  try {
    const result = await db
      .delete(telegramMessages)
      .where(inArray(telegramMessages.id, ids))
      .returning();
    return { success: true, count: result.length, deleted: result };
  } catch (error) {
    console.warn('Error deleting bulk telegram messages in SQL, fallback:', error);
    const state = storage.getState();
    const deleted = state.telegramMessages.filter((m) => ids.includes(m.id));
    state.telegramMessages = state.telegramMessages.filter((m) => !ids.includes(m.id));
    storage.save();
    return { success: true, count: deleted.length, deleted };
  }
}

export async function clearAllTelegramMessages(userId?: number) {
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const count = state.telegramMessages.length;
    state.telegramMessages = [];
    storage.save();
    return { success: true, count };
  }

  try {
    const result = await db
      .delete(telegramMessages)
      .where(userId ? eq(telegramMessages.userId, userId) : undefined)
      .returning();
    return { success: true, count: result.length };
  } catch (error) {
    console.warn('Error clearing telegram messages in SQL, fallback:', error);
    const state = storage.getState();
    const count = state.telegramMessages.length;
    state.telegramMessages = [];
    storage.save();
    return { success: true, count };
  }
}

export async function getTelegramConfig(userId: number = 1) {
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    let config = state.telegramConfigs.find((c) => c.botToken && c.botToken.trim().length > 0);
    if (config) return config;

    config = state.telegramConfigs.find((c) => c.userId === userId);
    if (config) return config;

    const newConfig = {
      id: state.nextId.telegramConfigs++,
      userId,
      botToken: null,
      botUsername: null,
      botFirstName: null,
      webhookSecret: null,
      supplierName: 'Proveedor Telegram Principal',
      supplierUsername: null,
      autoApprove: true,
      defaultMarginPercent: 35,
      currency: 'USD',
      defaultStockEnabled: false,
      defaultStockQuantity: 10,
      taxPercent: 15,
      useAi: true,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.telegramConfigs.push(newConfig);
    storage.save();
    return newConfig;
  }

  try {
    const configsWithToken = await db
      .select()
      .from(telegramConfigs)
      .where(sql`${telegramConfigs.botToken} IS NOT NULL AND ${telegramConfigs.botToken} != ''`)
      .limit(1);

    if (configsWithToken.length > 0) {
      return configsWithToken[0];
    }

    const configs = await db
      .select()
      .from(telegramConfigs)
      .where(eq(telegramConfigs.userId, userId))
      .limit(1);

    if (configs.length > 0) {
      return configs[0];
    }

    // Check if any telegram_configs row exists at all
    const anyConfig = await db.select().from(telegramConfigs).limit(1);
    if (anyConfig.length > 0) {
      return anyConfig[0];
    }

    // Resolve a valid user ID from users table to prevent FK constraint errors
    let targetUserId = userId || 1;
    const userCheck = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId)).limit(1);
    if (userCheck.length === 0) {
      const anyUser = await db.select({ id: users.id }).from(users).limit(1);
      if (anyUser.length > 0) {
        targetUserId = anyUser[0].id;
      }
    }

    const created = await db
      .insert(telegramConfigs)
      .values({
        userId: targetUserId,
        supplierName: 'Proveedor Telegram Principal',
        defaultMarginPercent: 35,
        currency: 'USD',
        autoApprove: true,
        defaultStockEnabled: false,
        defaultStockQuantity: 10,
        taxPercent: 15,
        useAi: true,
        isActive: true,
      })
      .returning();

    return created[0];
  } catch (error) {
    console.warn('Error fetching telegram config from SQL, fallback to local store:', error);
    const state = storage.getState();
    return state.telegramConfigs[0] || {
      id: 1,
      userId: 1,
      botToken: null,
      botUsername: null,
      botFirstName: null,
      webhookSecret: null,
      supplierName: 'Proveedor Telegram Principal',
      supplierUsername: null,
      autoApprove: true,
      defaultMarginPercent: 35,
      currency: 'USD',
      defaultStockEnabled: false,
      defaultStockQuantity: 10,
      taxPercent: 15,
      useAi: true,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function updateTelegramConfig(
  userId: number = 1,
  data: Partial<typeof telegramConfigs.$inferInsert> & {
    default_stock_enabled?: boolean;
    default_stock_quantity?: number;
    tax_percent?: number;
    use_ai?: boolean;
    useAi?: boolean;
    is_active?: boolean;
    isActive?: boolean;
  }
) {
  // Normalize fields if passed with snake_case
  const normalizedData: any = { ...data };
  if (data.default_stock_enabled !== undefined && data.defaultStockEnabled === undefined) {
    normalizedData.defaultStockEnabled = data.default_stock_enabled;
  }
  if (data.default_stock_quantity !== undefined && data.defaultStockQuantity === undefined) {
    normalizedData.defaultStockQuantity = data.default_stock_quantity;
  }
  if (data.tax_percent !== undefined && data.taxPercent === undefined) {
    normalizedData.taxPercent = Number(data.tax_percent);
  }
  if (data.taxPercent !== undefined) {
    normalizedData.taxPercent = Number(data.taxPercent);
  }
  if (data.use_ai !== undefined && data.useAi === undefined) {
    normalizedData.useAi = Boolean(data.use_ai);
  }
  if (data.useAi !== undefined) {
    normalizedData.useAi = Boolean(data.useAi);
  }
  if (data.is_active !== undefined && data.isActive === undefined) {
    normalizedData.isActive = Boolean(data.is_active);
  }
  if (data.isActive !== undefined) {
    normalizedData.isActive = Boolean(data.isActive);
  }

  // Always update local fallback memory state too
  const state = storage.getState();
  let localConfig = state.telegramConfigs.find((c) => c.userId === userId) || state.telegramConfigs[0];
  if (!localConfig) {
    localConfig = {
      id: state.nextId.telegramConfigs++,
      userId,
      botToken: null,
      webhookSecret: null,
      supplierName: 'Proveedor Telegram Principal',
      supplierUsername: null,
      autoApprove: true,
      defaultMarginPercent: 35,
      currency: 'USD',
      defaultStockEnabled: false,
      defaultStockQuantity: 10,
      taxPercent: 15,
      useAi: true,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.telegramConfigs.push(localConfig);
  }
  Object.assign(localConfig, normalizedData, { updatedAt: new Date().toISOString() });
  storage.save();

  if (!isPostgresConfigured()) {
    return localConfig;
  }

  try {
    const existing = await getTelegramConfig(userId);

    const sqlPayload: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (normalizedData.botToken !== undefined) sqlPayload.botToken = normalizedData.botToken || null;
    if (normalizedData.botUsername !== undefined) sqlPayload.botUsername = normalizedData.botUsername || null;
    if (normalizedData.botFirstName !== undefined) sqlPayload.botFirstName = normalizedData.botFirstName || null;
    if (normalizedData.webhookSecret !== undefined) sqlPayload.webhookSecret = normalizedData.webhookSecret || null;
    if (normalizedData.supplierName !== undefined) sqlPayload.supplierName = normalizedData.supplierName;
    if (normalizedData.supplierUsername !== undefined) sqlPayload.supplierUsername = normalizedData.supplierUsername || null;
    if (normalizedData.autoApprove !== undefined) sqlPayload.autoApprove = Boolean(normalizedData.autoApprove);
    if (normalizedData.defaultMarginPercent !== undefined) sqlPayload.defaultMarginPercent = Number(normalizedData.defaultMarginPercent);
    if (normalizedData.currency !== undefined) sqlPayload.currency = normalizedData.currency;
    if (normalizedData.defaultStockEnabled !== undefined) sqlPayload.defaultStockEnabled = Boolean(normalizedData.defaultStockEnabled);
    if (normalizedData.defaultStockQuantity !== undefined) sqlPayload.defaultStockQuantity = Number(normalizedData.defaultStockQuantity);
    if (normalizedData.taxPercent !== undefined) sqlPayload.taxPercent = Number(normalizedData.taxPercent);
    if (normalizedData.useAi !== undefined) sqlPayload.useAi = Boolean(normalizedData.useAi);
    if (normalizedData.isActive !== undefined) sqlPayload.isActive = Boolean(normalizedData.isActive);

    if (existing && existing.id) {
      const updated = await db
        .update(telegramConfigs)
        .set(sqlPayload)
        .where(eq(telegramConfigs.id, existing.id))
        .returning();

      if (updated.length > 0) {
        return updated[0];
      }
    }

    // If existing not found or not updated, insert directly
    let targetUserId = userId || 1;
    const userCheck = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId)).limit(1);
    if (userCheck.length === 0) {
      const anyUser = await db.select({ id: users.id }).from(users).limit(1);
      if (anyUser.length > 0) {
        targetUserId = anyUser[0].id;
      }
    }

    const inserted = await db
      .insert(telegramConfigs)
      .values({
        userId: targetUserId,
        supplierName: normalizedData.supplierName || 'Proveedor Telegram Principal',
        botToken: normalizedData.botToken || null,
        botUsername: normalizedData.botUsername || null,
        botFirstName: normalizedData.botFirstName || null,
        defaultMarginPercent: normalizedData.defaultMarginPercent !== undefined ? Number(normalizedData.defaultMarginPercent) : 35,
        currency: normalizedData.currency || 'USD',
        autoApprove: normalizedData.autoApprove !== undefined ? Boolean(normalizedData.autoApprove) : true,
        defaultStockEnabled: normalizedData.defaultStockEnabled !== undefined ? Boolean(normalizedData.defaultStockEnabled) : false,
        defaultStockQuantity: normalizedData.defaultStockQuantity !== undefined ? Number(normalizedData.defaultStockQuantity) : 10,
        taxPercent: normalizedData.taxPercent !== undefined ? Number(normalizedData.taxPercent) : 15,
        useAi: normalizedData.useAi !== undefined ? Boolean(normalizedData.useAi) : true,
        isActive: normalizedData.isActive !== undefined ? Boolean(normalizedData.isActive) : true,
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.warn('Error updating telegram config in SQL, fallback to local store:', error);
    return localConfig;
  }
}

// -------------------------------------------------------------
// GOOGLE GEMINI AI CONFIGURATION HELPERS
// -------------------------------------------------------------

export async function getAiConfig(userId: number = 1) {
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.aiConfigs) {
      state.aiConfigs = [];
    }
    let config = state.aiConfigs.find((c) => c.apiKey && c.apiKey.trim().length > 0);
    if (config) {
      if (
        config.modelName &&
        (config.modelName.includes('gemini-2.5') ||
          config.modelName.includes('gemini-2.0') ||
          config.modelName.includes('gemini-1.5'))
      ) {
        config.modelName = 'gemini-3.7-flash';
        storage.save();
      }
      return config;
    }

    config = state.aiConfigs.find((c) => c.userId === userId);
    if (config) {
      if (
        config.modelName &&
        (config.modelName.includes('gemini-2.5') ||
          config.modelName.includes('gemini-2.0') ||
          config.modelName.includes('gemini-1.5'))
      ) {
        config.modelName = 'gemini-3.7-flash';
        storage.save();
      }
      return config;
    }

    const newConfig = {
      id: state.nextId?.aiConfigs || 1,
      userId,
      apiKey: null,
      accountEmail: null,
      modelName: 'gemini-3.7-flash',
      temperature: 0.2,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.aiConfigs.push(newConfig);
    storage.save();
    return newConfig;
  }

  try {
    const configsWithKey = await db
      .select()
      .from(aiConfigs)
      .where(sql`${aiConfigs.apiKey} IS NOT NULL AND ${aiConfigs.apiKey} != ''`)
      .limit(1);

    if (configsWithKey.length > 0) {
      return configsWithKey[0];
    }

    const configs = await db
      .select()
      .from(aiConfigs)
      .where(eq(aiConfigs.userId, userId))
      .limit(1);

    if (configs.length > 0) {
      return configs[0];
    }

    // Check if any ai_configs row exists
    const anyConfig = await db.select().from(aiConfigs).limit(1);
    if (anyConfig.length > 0) {
      return anyConfig[0];
    }

    // Resolve a valid user ID
    let targetUserId = userId || 1;
    const userCheck = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId)).limit(1);
    if (userCheck.length === 0) {
      const anyUser = await db.select({ id: users.id }).from(users).limit(1);
      if (anyUser.length > 0) {
        targetUserId = anyUser[0].id;
      }
    }

    const created = await db
      .insert(aiConfigs)
      .values({
        userId: targetUserId,
        apiKey: null,
        modelName: 'gemini-3.7-flash',
        temperature: '0.20',
        isActive: true,
      })
      .returning();

    return created[0];
  } catch (error) {
    console.warn('Error fetching ai config from SQL, fallback to local store:', error);
    const state = storage.getState();
    return (state.aiConfigs && state.aiConfigs[0]) || {
      id: 1,
      userId: 1,
      apiKey: null,
      accountEmail: null,
      modelName: 'gemini-3.7-flash',
      temperature: 0.2,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function updateAiConfig(
  userId: number = 1,
  data: {
    apiKey?: string | null;
    accountEmail?: string | null;
    modelName?: string;
    temperature?: number;
    isActive?: boolean;
    is_active?: boolean;
  }
) {
  const state = storage.getState();
  if (!state.aiConfigs) state.aiConfigs = [];

  let modelToUse = data.modelName || 'gemini-3.7-flash';
  if (
    modelToUse.includes('gemini-2.5') ||
    modelToUse.includes('gemini-2.0') ||
    modelToUse.includes('gemini-1.5')
  ) {
    modelToUse = 'gemini-3.7-flash';
  }

  const effectiveIsActive =
    data.isActive !== undefined
      ? Boolean(data.isActive)
      : data.is_active !== undefined
      ? Boolean(data.is_active)
      : undefined;

  let localConfig = state.aiConfigs.find((c) => c.userId === userId);
  if (!localConfig) {
    localConfig = {
      id: (state.nextId?.aiConfigs ? state.nextId.aiConfigs++ : 1),
      userId,
      apiKey: data.apiKey ?? null,
      accountEmail: data.accountEmail ?? null,
      modelName: modelToUse,
      temperature: data.temperature ?? 0.2,
      isActive: effectiveIsActive !== undefined ? effectiveIsActive : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.aiConfigs.push(localConfig);
  } else {
    Object.assign(localConfig, data, {
      modelName: modelToUse,
      ...(effectiveIsActive !== undefined ? { isActive: effectiveIsActive } : {}),
      updatedAt: new Date().toISOString(),
    });
  }
  storage.save();

  if (!isPostgresConfigured()) {
    return localConfig;
  }

  try {
    const existing = await getAiConfig(userId);

    if (existing && existing.id) {
      const updated = await db
        .update(aiConfigs)
        .set({
          apiKey: data.apiKey !== undefined ? data.apiKey : existing.apiKey,
          accountEmail: data.accountEmail !== undefined ? data.accountEmail : existing.accountEmail,
          modelName: modelToUse,
          temperature:
            data.temperature !== undefined
              ? data.temperature.toString()
              : (existing.temperature?.toString() || '0.20'),
          isActive:
            effectiveIsActive !== undefined
              ? effectiveIsActive
              : existing.isActive !== undefined
              ? Boolean(existing.isActive)
              : true,
          updatedAt: new Date(),
        })
        .where(eq(aiConfigs.id, existing.id))
        .returning();

      if (updated.length > 0) {
        return updated[0];
      }
    }

    let targetUserId = userId || 1;
    const userCheck = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId)).limit(1);
    if (userCheck.length === 0) {
      const anyUser = await db.select({ id: users.id }).from(users).limit(1);
      if (anyUser.length > 0) {
        targetUserId = anyUser[0].id;
      }
    }

    const inserted = await db
      .insert(aiConfigs)
      .values({
        userId: targetUserId,
        apiKey: data.apiKey ?? null,
        accountEmail: data.accountEmail ?? null,
        modelName: modelToUse,
        temperature: (data.temperature ?? 0.2).toString(),
        isActive: effectiveIsActive !== undefined ? effectiveIsActive : true,
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.warn('Error updating ai config in SQL, fallback to local store:', error);
    return localConfig;
  }
}

export async function getInventoryStats(userId?: number) {
  try {
    const items = await getInventoryItems(userId);

    const totalProducts = items.length;
    const totalUnits = items.reduce((acc, it) => acc + (Number(it.stock) || 0), 0);
    const totalCostValue = items.reduce(
      (acc, it) => acc + (Number(it.costPrice) || 0) * (Number(it.stock) || 0),
      0
    );
    const totalSaleValue = items.reduce(
      (acc, it) => acc + (Number(it.salePrice) || 0) * (Number(it.stock) || 0),
      0
    );
    const estimatedProfit = totalSaleValue - totalCostValue;

    let totalDiscountValue = 0;
    let totalDiscountedSaleValue = 0;
    let discountedProductsCount = 0;

    items.forEach((it) => {
      const regular = Number(it.salePrice) || 0;
      const stock = Number(it.stock) || 0;
      const disc = Math.max(0, Math.min(100, Number(it.discountPercent) || 0));
      if (disc > 0) {
        discountedProductsCount += 1;
        const discountAmountPerUnit = regular * (disc / 100);
        totalDiscountValue += discountAmountPerUnit * stock;
        const effectiveSalePerUnit = regular * (1 - disc / 100);
        totalDiscountedSaleValue += effectiveSalePerUnit * stock;
      } else {
        totalDiscountedSaleValue += regular * stock;
      }
    });

    const profitWithDiscounts = totalDiscountedSaleValue - totalCostValue;

    const categoryMap: Record<string, { count: number; stock: number }> = {};
    for (const item of items) {
      const cat = item.category || 'General';
      if (!categoryMap[cat]) {
        categoryMap[cat] = { count: 0, stock: 0 };
      }
      categoryMap[cat].count += 1;
      categoryMap[cat].stock += Number(item.stock) || 0;
    }

    return {
      totalProducts,
      totalUnits,
      totalCostValue: Math.round(totalCostValue * 100) / 100,
      totalSaleValue: Math.round(totalSaleValue * 100) / 100,
      estimatedProfit: Math.round(estimatedProfit * 100) / 100,
      totalDiscountValue: Math.round(totalDiscountValue * 100) / 100,
      totalDiscountedSaleValue: Math.round(totalDiscountedSaleValue * 100) / 100,
      profitWithDiscounts: Math.round(profitWithDiscounts * 100) / 100,
      discountedProductsCount,
      categories: Object.entries(categoryMap).map(([name, data]) => ({
        name,
        count: data.count,
        stock: data.stock,
      })),
    };
  } catch (error) {
    console.error('Error computing inventory stats:', error);
    return {
      totalProducts: 0,
      totalUnits: 0,
      totalCostValue: 0,
      totalSaleValue: 0,
      estimatedProfit: 0,
      totalDiscountValue: 0,
      totalDiscountedSaleValue: 0,
      profitWithDiscounts: 0,
      discountedProductsCount: 0,
      categories: [],
    };
  }
}

// -------------------------------------------------------------
// STOREFRONT & CUSTOMER ORDERS HELPERS
// -------------------------------------------------------------

function parseThemeAndColors(rawTheme: string | null | undefined): { theme: string; themeColors?: Record<string, string[]> } {
  if (!rawTheme) return { theme: 'classic' };
  if (rawTheme.startsWith('{')) {
    try {
      const parsed = JSON.parse(rawTheme);
      return {
        theme: parsed.theme || parsed.active || 'classic',
        themeColors: parsed.colors || parsed.themeColors || undefined,
      };
    } catch {}
  }
  if (rawTheme.includes(':::')) {
    try {
      const [themeName, colorsJson] = rawTheme.split(':::');
      return {
        theme: themeName || 'classic',
        themeColors: JSON.parse(colorsJson),
      };
    } catch {}
  }
  return { theme: rawTheme };
}

export async function getStoreConfig(userId: number = 1) {
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (state.storeConfigs.length > 0) {
      const cfg = state.storeConfigs[0];
      const { theme, themeColors } = parseThemeAndColors(cfg.theme);
      const showOutOfStock = cfg.showOutOfStock !== undefined ? cfg.showOutOfStock : true;
      const isActive = cfg.isActive !== undefined ? cfg.isActive : true;
      const maintenanceTitle = cfg.maintenanceTitle || 'Tienda Temporalmente Pausada';
      const maintenanceMessage = cfg.maintenanceMessage || 'Estamos actualizando nuestro catálogo e inventario. ¡Volvemos muy pronto!';
      const allowCatalogBrowsing = cfg.allowCatalogBrowsing !== undefined ? cfg.allowCatalogBrowsing : false;
      return {
        ...cfg,
        theme,
        themeColors,
        showOutOfStock: Boolean(showOutOfStock),
        isActive: Boolean(isActive),
        maintenanceTitle,
        maintenanceMessage,
        allowCatalogBrowsing: Boolean(allowCatalogBrowsing),
      };
    }
    const defaultConfig = {
      id: 1,
      userId: userId || 1,
      storeName: 'Comerxia Store',
      whatsappNumber: '',
      description: 'Catálogo digital con envíos y pedidos directos por WhatsApp',
      bannerText: '🔥 ¡Catálogo actualizado con las últimas novedades en stock!',
      deliveryFee: '0.00',
      minOrderAmount: '0.00',
      currency: 'USD',
      isActive: true,
      maintenanceTitle: 'Tienda Temporalmente Pausada',
      maintenanceMessage: 'Estamos actualizando nuestro catálogo e inventario. ¡Volvemos muy pronto!',
      allowCatalogBrowsing: false,
      showStock: true,
      showOutOfStock: true,
      instagramUrl: null,
      websiteUrl: null,
      address: null,
      logoUrl: null,
      logoDesktopUrl: null,
      courierLogos: null,
      paymentLogos: null,
      theme: 'classic',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.storeConfigs.push(defaultConfig);
    storage.save();
    return defaultConfig;
  }

  try {
    const configs = await db
      .select()
      .from(storeConfigs)
      .orderBy(desc(storeConfigs.updatedAt), desc(storeConfigs.id))
      .limit(1);

    if (configs.length > 0) {
      const cfg = configs[0];
      const { theme, themeColors } = parseThemeAndColors(cfg.theme);
      const showOutOfStock = cfg.showOutOfStock !== undefined ? cfg.showOutOfStock : true;
      const isActive = cfg.isActive !== undefined ? cfg.isActive : true;
      const maintenanceTitle = cfg.maintenanceTitle || 'Tienda Temporalmente Pausada';
      const maintenanceMessage = cfg.maintenanceMessage || 'Estamos actualizando nuestro catálogo e inventario. ¡Volvemos muy pronto!';
      const allowCatalogBrowsing = cfg.allowCatalogBrowsing !== undefined ? cfg.allowCatalogBrowsing : false;
      const enablePagination = cfg.enablePagination !== undefined ? Boolean(cfg.enablePagination) : false;
      const itemsPerPage = cfg.itemsPerPage !== undefined ? Number(cfg.itemsPerPage) : 12;
      return {
        ...cfg,
        theme,
        themeColors,
        showOutOfStock: Boolean(showOutOfStock),
        isActive: Boolean(isActive),
        maintenanceTitle,
        maintenanceMessage,
        allowCatalogBrowsing: Boolean(allowCatalogBrowsing),
        enablePagination,
        itemsPerPage,
      };
    }

    const created = await db
      .insert(storeConfigs)
      .values({
        userId: userId || 1,
        storeName: 'Comerxia Store',
        whatsappNumber: '',
        description: 'Catálogo digital con envíos y pedidos directos por WhatsApp',
        bannerText: '🔥 ¡Catálogo actualizado con las últimas novedades en stock!',
        deliveryFee: '0.00',
        minOrderAmount: '0.00',
        currency: 'USD',
        isActive: true,
        maintenanceTitle: 'Tienda Temporalmente Pausada',
        maintenanceMessage: 'Estamos actualizando nuestro catálogo e inventario. ¡Volvemos muy pronto!',
        allowCatalogBrowsing: false,
        showStock: true,
        showOutOfStock: true,
        websiteUrl: null,
        logoUrl: null,
        logoDesktopUrl: null,
        courierLogos: null,
        paymentLogos: null,
        theme: 'classic',
      })
      .returning();

    const cfg = created[0];
    const { theme, themeColors } = parseThemeAndColors(cfg.theme);
    const showOutOfStock = cfg.showOutOfStock !== undefined ? cfg.showOutOfStock : true;
    const isActive = cfg.isActive !== undefined ? cfg.isActive : true;
    const maintenanceTitle = cfg.maintenanceTitle || 'Tienda Temporalmente Pausada';
    const maintenanceMessage = cfg.maintenanceMessage || 'Estamos actualizando nuestro catálogo e inventario. ¡Volvemos muy pronto!';
    const allowCatalogBrowsing = cfg.allowCatalogBrowsing !== undefined ? cfg.allowCatalogBrowsing : false;
    const enablePagination = cfg.enablePagination !== undefined ? Boolean(cfg.enablePagination) : false;
    const itemsPerPage = cfg.itemsPerPage !== undefined ? Number(cfg.itemsPerPage) : 12;
    return {
      ...cfg,
      theme,
      themeColors,
      showOutOfStock: Boolean(showOutOfStock),
      isActive: Boolean(isActive),
      maintenanceTitle,
      maintenanceMessage,
      allowCatalogBrowsing: Boolean(allowCatalogBrowsing),
      enablePagination,
      itemsPerPage,
    };
  } catch (error) {
    console.warn('Error fetching store config from SQL, fallback to local store:', error);
    const state = storage.getState();
    const cfg = state.storeConfigs[0];
    if (cfg) {
      const { theme, themeColors } = parseThemeAndColors(cfg.theme);
      const showOutOfStock = cfg.showOutOfStock !== undefined ? cfg.showOutOfStock : true;
      const isActive = cfg.isActive !== undefined ? cfg.isActive : true;
      const maintenanceTitle = cfg.maintenanceTitle || 'Tienda Temporalmente Pausada';
      const maintenanceMessage = cfg.maintenanceMessage || 'Estamos actualizando nuestro catálogo e inventario. ¡Volvemos muy pronto!';
      const allowCatalogBrowsing = cfg.allowCatalogBrowsing !== undefined ? cfg.allowCatalogBrowsing : false;
      const enablePagination = cfg.enablePagination !== undefined ? Boolean(cfg.enablePagination) : false;
      const itemsPerPage = cfg.itemsPerPage !== undefined ? Number(cfg.itemsPerPage) : 12;
      return {
        ...cfg,
        theme,
        themeColors,
        showOutOfStock: Boolean(showOutOfStock),
        isActive: Boolean(isActive),
        maintenanceTitle,
        maintenanceMessage,
        allowCatalogBrowsing: Boolean(allowCatalogBrowsing),
        enablePagination,
        itemsPerPage,
      };
    }
    return cfg;
  }
}

export async function updateStoreConfig(
  userId: number = 1,
  data: Partial<typeof storeConfigs.$inferInsert> & Record<string, any>
) {
  const updatePayload: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (data.storeName !== undefined) updatePayload.storeName = String(data.storeName).trim();
  if (data.whatsappNumber !== undefined || data.whatsapp_number !== undefined) {
    const rawNum = data.whatsappNumber !== undefined ? data.whatsappNumber : data.whatsapp_number;
    const normalized = normalizeEcuadorPhone(String(rawNum || ''));
    updatePayload.whatsappNumber = normalized.international || String(rawNum || '').trim();
  }
  if (data.description !== undefined) updatePayload.description = String(data.description).trim();
  if (data.bannerText !== undefined) updatePayload.bannerText = String(data.bannerText).trim();
  if (data.banner_text !== undefined) updatePayload.bannerText = String(data.banner_text).trim();
  if (data.deliveryFee !== undefined) updatePayload.deliveryFee = String(Number(data.deliveryFee) || 0);
  if (data.delivery_fee !== undefined) updatePayload.deliveryFee = String(Number(data.delivery_fee) || 0);
  if (data.minOrderAmount !== undefined) updatePayload.minOrderAmount = String(Number(data.minOrderAmount) || 0);
  if (data.min_order_amount !== undefined) updatePayload.minOrderAmount = String(Number(data.min_order_amount) || 0);
  if (data.currency !== undefined) updatePayload.currency = String(data.currency).trim();
  if (data.isActive !== undefined || data.is_active !== undefined) {
    const rawVal = data.isActive !== undefined ? data.isActive : data.is_active;
    updatePayload.isActive = rawVal === true || rawVal === 'true' || rawVal === 1 || rawVal === '1';
  }
  if (data.maintenanceTitle !== undefined || data.maintenance_title !== undefined) {
    const rawVal = data.maintenanceTitle !== undefined ? data.maintenanceTitle : data.maintenance_title;
    updatePayload.maintenanceTitle = rawVal ? String(rawVal).trim() : 'Tienda Temporalmente Pausada';
  }
  if (data.maintenanceMessage !== undefined || data.maintenance_message !== undefined) {
    const rawVal = data.maintenanceMessage !== undefined ? data.maintenanceMessage : data.maintenance_message;
    updatePayload.maintenanceMessage = rawVal ? String(rawVal).trim() : 'Estamos actualizando nuestro catálogo e inventario. ¡Volvemos muy pronto!';
  }
  if (data.allowCatalogBrowsing !== undefined || data.allow_catalog_browsing !== undefined) {
    const rawVal = data.allowCatalogBrowsing !== undefined ? data.allowCatalogBrowsing : data.allow_catalog_browsing;
    updatePayload.allowCatalogBrowsing = rawVal === true || rawVal === 'true' || rawVal === 1 || rawVal === '1';
  }
  if (data.showStock !== undefined || data.show_stock !== undefined) {
    const rawVal = data.showStock !== undefined ? data.showStock : data.show_stock;
    updatePayload.showStock = rawVal === true || rawVal === 'true' || rawVal === 1 || rawVal === '1';
  }
  if (data.showOutOfStock !== undefined || data.show_out_of_stock !== undefined) {
    const rawVal = data.showOutOfStock !== undefined ? data.showOutOfStock : data.show_out_of_stock;
    updatePayload.showOutOfStock = rawVal === true || rawVal === 'true' || rawVal === 1 || rawVal === '1';
  }
  if (data.enablePagination !== undefined || data.enable_pagination !== undefined) {
    const rawVal = data.enablePagination !== undefined ? data.enablePagination : data.enable_pagination;
    updatePayload.enablePagination = rawVal === true || rawVal === 'true' || rawVal === 1 || rawVal === '1';
  }
  if (data.itemsPerPage !== undefined || data.items_per_page !== undefined) {
    const rawVal = data.itemsPerPage !== undefined ? data.itemsPerPage : data.items_per_page;
    updatePayload.itemsPerPage = Number(rawVal) || 12;
  }
  if (data.instagramUrl !== undefined) updatePayload.instagramUrl = data.instagramUrl ? String(data.instagramUrl).trim() : null;
  if (data.instagram_url !== undefined) updatePayload.instagramUrl = data.instagram_url ? String(data.instagram_url).trim() : null;
  if (data.websiteUrl !== undefined) updatePayload.websiteUrl = data.websiteUrl ? String(data.websiteUrl).trim() : null;
  if (data.website_url !== undefined) updatePayload.websiteUrl = data.website_url ? String(data.website_url).trim() : null;
  if (data.address !== undefined) updatePayload.address = data.address ? String(data.address).trim() : null;
  if (data.logoUrl !== undefined) updatePayload.logoUrl = data.logoUrl ? String(data.logoUrl).trim() : null;
  if (data.logo_url !== undefined) updatePayload.logoUrl = data.logo_url ? String(data.logo_url).trim() : null;
  if (data.logoDesktopUrl !== undefined) updatePayload.logoDesktopUrl = data.logoDesktopUrl ? String(data.logoDesktopUrl).trim() : null;
  if (data.logo_desktop_url !== undefined) updatePayload.logoDesktopUrl = data.logo_desktop_url ? String(data.logo_desktop_url).trim() : null;
  if (data.courierLogos !== undefined) {
    updatePayload.courierLogos = typeof data.courierLogos === 'string' ? data.courierLogos : JSON.stringify(data.courierLogos);
  }
  if (data.courier_logos !== undefined) {
    updatePayload.courierLogos = typeof data.courier_logos === 'string' ? data.courier_logos : JSON.stringify(data.courier_logos);
  }
  if (data.paymentLogos !== undefined) {
    updatePayload.paymentLogos = typeof data.paymentLogos === 'string' ? data.paymentLogos : JSON.stringify(data.paymentLogos);
  }
  if (data.payment_logos !== undefined) {
    updatePayload.paymentLogos = typeof data.payment_logos === 'string' ? data.payment_logos : JSON.stringify(data.payment_logos);
  }
  if (data.promoPopup !== undefined) {
    updatePayload.promoPopup = typeof data.promoPopup === 'string' ? data.promoPopup : JSON.stringify(data.promoPopup);
  }
  if (data.promo_popup !== undefined) {
    updatePayload.promoPopup = typeof data.promo_popup === 'string' ? data.promo_popup : JSON.stringify(data.promo_popup);
  }
  
  const rawTheme = data.theme !== undefined ? String(data.theme).trim() : undefined;
  const rawThemeColors = data.themeColors !== undefined ? data.themeColors : data.theme_colors;

  if (rawTheme !== undefined || rawThemeColors !== undefined) {
    const existing = (await getStoreConfig(userId)) as any;
    const effectiveTheme = rawTheme || existing?.theme || 'classic';
    const effectiveColors = rawThemeColors !== undefined ? rawThemeColors : existing?.themeColors;

    if (effectiveColors) {
      const colorsObj = typeof effectiveColors === 'string' ? JSON.parse(effectiveColors) : effectiveColors;
      updatePayload.theme = JSON.stringify({ theme: effectiveTheme, colors: colorsObj });
    } else {
      updatePayload.theme = effectiveTheme;
    }
  }

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    let current = state.storeConfigs[0];
    if (!current) {
      current = {
        id: 1,
        userId: userId || 1,
        storeName: 'Comerxia Store',
        whatsappNumber: '+593983302390',
        description: 'Catálogo digital con envíos y pedidos directos por WhatsApp',
        bannerText: '🔥 ¡Catálogo actualizado con las últimas novedades en stock!',
        deliveryFee: '0.00',
        minOrderAmount: '0.00',
        currency: 'USD',
        isActive: true,
        maintenanceTitle: 'Tienda Temporalmente Pausada',
        maintenanceMessage: 'Estamos actualizando nuestro catálogo e inventario. ¡Volvemos muy pronto!',
        allowCatalogBrowsing: false,
        showStock: true,
        instagramUrl: null,
        address: null,
        logoUrl: null,
        logoDesktopUrl: null,
        courierLogos: null,
        paymentLogos: null,
        theme: 'classic',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.storeConfigs.push(current);
    }
    Object.assign(current, updatePayload, { updatedAt: new Date().toISOString() });
    storage.save();
    const { theme, themeColors } = parseThemeAndColors(current.theme);
    return { ...current, theme, themeColors };
  }

  try {
    const existing = await getStoreConfig(userId);

    if (existing && existing.id) {
      const updated = await db
        .update(storeConfigs)
        .set(updatePayload)
        .where(eq(storeConfigs.id, existing.id))
        .returning();

      const cfg = updated[0];
      const { theme, themeColors } = parseThemeAndColors(cfg.theme);
      return { ...cfg, theme, themeColors };
    } else {
      const targetUserId = await resolveValidUserId(userId);
      const created = await db
        .insert(storeConfigs)
        .values({
          userId: targetUserId,
          storeName: updatePayload.storeName || 'Comerxia Store',
          whatsappNumber: updatePayload.whatsappNumber || '',
          description: updatePayload.description || 'Catálogo digital con envíos y pedidos directos',
          bannerText: updatePayload.bannerText || '🔥 ¡Catálogo actualizado con las últimas novedades en stock!',
          deliveryFee: updatePayload.deliveryFee || '0.00',
          minOrderAmount: updatePayload.minOrderAmount || '0.00',
          currency: updatePayload.currency || 'USD',
          ...updatePayload,
        })
        .returning();

      const cfg = created[0];
      const { theme, themeColors } = parseThemeAndColors(cfg.theme);
      return { ...cfg, theme, themeColors };
    }
  } catch (error) {
    console.warn('Error updating store config in SQL, fallback to local store:', error);
    const state = storage.getState();
    const current = state.storeConfigs[0];
    if (current) {
      Object.assign(current, updatePayload, { updatedAt: new Date().toISOString() });
      storage.save();
      const { theme, themeColors } = parseThemeAndColors(current.theme);
      return { ...current, theme, themeColors };
    }
    const { theme, themeColors } = parseThemeAndColors(updatePayload.theme);
    return { ...updatePayload, id: 1, userId, theme, themeColors };
  }
}

// -------------------------------------------------------------
// SERVER DOMAIN & SUBDOMAIN ROUTING HELPERS
// -------------------------------------------------------------

export async function getServerDomainConfig(userId: number = 1) {
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (state.serverDomainConfigs && state.serverDomainConfigs.length > 0) {
      return state.serverDomainConfigs[0];
    }
    const defaultDomainConfig = {
      id: 1,
      userId: userId || 1,
      adminDomain: 'admin.dominio1.com',
      storeDomain: 'www.dominio1.com, dominio1.com',
      autoRouting: true,
      defaultFallbackView: 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!state.serverDomainConfigs) state.serverDomainConfigs = [];
    state.serverDomainConfigs.push(defaultDomainConfig);
    storage.save();
    return defaultDomainConfig;
  }

  try {
    const configs = await db
      .select()
      .from(serverDomainConfigs)
      .orderBy(desc(serverDomainConfigs.updatedAt), desc(serverDomainConfigs.id))
      .limit(1);

    if (configs.length > 0) {
      return configs[0];
    }

    const targetUserId = await resolveValidUserId(userId);
    const created = await db
      .insert(serverDomainConfigs)
      .values({
        userId: targetUserId,
        adminDomain: 'admin.dominio1.com',
        storeDomain: 'www.dominio1.com, dominio1.com',
        autoRouting: true,
        defaultFallbackView: 'admin',
      })
      .returning();

    return created[0];
  } catch (error) {
    console.warn('Error fetching server domain config from SQL, fallback to local store:', error);
    const state = storage.getState();
    return (
      (state.serverDomainConfigs && state.serverDomainConfigs[0]) || {
        id: 1,
        userId: userId || 1,
        adminDomain: 'admin.dominio1.com',
        storeDomain: 'www.dominio1.com, dominio1.com',
        autoRouting: true,
        defaultFallbackView: 'admin',
      }
    );
  }
}

export async function updateServerDomainConfig(
  userId: number = 1,
  data: {
    adminDomain?: string;
    storeDomain?: string;
    autoRouting?: boolean;
    defaultFallbackView?: 'store' | 'admin' | string;
  }
) {
  const updatePayload: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (data.adminDomain !== undefined) updatePayload.adminDomain = String(data.adminDomain).trim();
  if (data.storeDomain !== undefined) updatePayload.storeDomain = String(data.storeDomain).trim();
  if (data.autoRouting !== undefined) updatePayload.autoRouting = Boolean(data.autoRouting);
  if (data.defaultFallbackView !== undefined) {
    updatePayload.defaultFallbackView = data.defaultFallbackView === 'admin' ? 'admin' : 'store';
  }

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.serverDomainConfigs) state.serverDomainConfigs = [];
    let current = state.serverDomainConfigs[0];
    if (!current) {
      current = {
        id: 1,
        userId: userId || 1,
        adminDomain: 'admin.dominio1.com',
        storeDomain: 'www.dominio1.com, dominio1.com',
        autoRouting: true,
        defaultFallbackView: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.serverDomainConfigs.push(current);
    }
    Object.assign(current, updatePayload, { updatedAt: new Date().toISOString() });
    storage.save();
    return current;
  }

  try {
    const existing = await getServerDomainConfig(userId);

    if (existing && existing.id) {
      const updated = await db
        .update(serverDomainConfigs)
        .set(updatePayload)
        .where(eq(serverDomainConfigs.id, existing.id))
        .returning();

      return updated[0];
    } else {
      const targetUserId = await resolveValidUserId(userId);
      const created = await db
        .insert(serverDomainConfigs)
        .values({
          userId: targetUserId,
          adminDomain: updatePayload.adminDomain || 'admin.dominio1.com',
          storeDomain: updatePayload.storeDomain || 'www.dominio1.com, dominio1.com',
          autoRouting: updatePayload.autoRouting !== undefined ? updatePayload.autoRouting : true,
          defaultFallbackView: updatePayload.defaultFallbackView || 'admin',
          ...updatePayload,
        })
        .returning();

      return created[0];
    }
  } catch (error) {
    console.warn('Error updating server domain config in SQL, fallback to local store:', error);
    const state = storage.getState();
    if (state.serverDomainConfigs && state.serverDomainConfigs[0]) {
      Object.assign(state.serverDomainConfigs[0], updatePayload, { updatedAt: new Date().toISOString() });
      storage.save();
      return state.serverDomainConfigs[0];
    }
    throw error;
  }
}

// -------------------------------------------------------------
// STOCK MANAGEMENT ON FINALIZED SALES (OPTION A & B)
// -------------------------------------------------------------

/**
 * Helper to check if an order status represents a physically dispatched/delivered state
 * where warehouse physical inventory is deducted from shelves.
 */
export function isPhysicallyDispatchedStatus(status?: string | null): boolean {
  if (!status) return false;
  const s = String(status).trim().toLowerCase();
  return s === 'shipped' || s === 'delivered';
}

/**
 * Helper to check if an order status represents a confirmed sale awaiting fulfillment.
 */
export function isConfirmedSaleStatus(status?: string | null): boolean {
  if (!status) return false;
  const s = String(status).trim().toLowerCase();
  return s === 'confirmed';
}

/**
 * Helper to check if an order status represents a concrete sale (dispatched or delivered).
 * Kept for backward compatibility with physical stock operations.
 */
export function isFinalizedSaleStatus(status?: string | null): boolean {
  return isPhysicallyDispatchedStatus(status);
}

/**
 * ERP ORDER STATE MACHINE
 * Enforces strict, unidirectional forward-flowing states and immutable terminal states:
 *
 * pending   -> confirmed, cancelled
 * confirmed -> shipped, delivered (Una venta confirmada no puede cancelarse ni borrarse)
 * shipped   -> delivered (Una venta en despacho no puede cancelarse ni borrarse)
 * delivered -> TERMINAL (Cerrado - Inmutable)
 * cancelled -> TERMINAL (Anulado - Inmutable)
 */
export const ALLOWED_ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'delivered'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export function isValidOrderStatusTransition(currentStatus: string, nextStatus: string): boolean {
  const curr = String(currentStatus || '').toLowerCase().trim();
  const next = String(nextStatus || '').toLowerCase().trim();
  if (curr === next) return true; // No status change is always permitted (metadata updates)
  const allowed = ALLOWED_ORDER_STATUS_TRANSITIONS[curr];
  if (!allowed) return false;
  return allowed.includes(next);
}

export function getOrderStatusTransitionError(currentStatus: string, nextStatus: string): string {
  const curr = String(currentStatus || '').toLowerCase().trim();
  const next = String(nextStatus || '').toLowerCase().trim();
  if (curr === next) return '';

  if (curr === 'delivered') {
    return 'Integridad de Datos ERP: El pedido ya se encuentra ENTREGADO y cerrado. No es posible alterar su estado para salvaguardar los balances financieros y el inventario.';
  }
  if (curr === 'cancelled') {
    return 'Integridad de Datos ERP: El pedido fue CANCELADO y su stock fue restituido al inventario. No se puede reactivar un pedido anulado; genere un nuevo pedido.';
  }
  if ((curr === 'confirmed' || curr === 'shipped') && next === 'cancelled') {
    return 'Integridad de Datos ERP: Una venta no puede cancelarse cuando está confirmada y/o se encuentra entregada parcialmente.';
  }
  if (curr === 'shipped' && (next === 'pending' || next === 'confirmed')) {
    return 'Integridad de Datos ERP: La mercadería ya fue despachada y está en tránsito. No puede retroceder a pendiente o confirmado.';
  }
  if (curr === 'confirmed' && next === 'pending') {
    return 'Integridad de Datos ERP: Un pedido confirmado con pago registrado no puede retroceder a pendiente.';
  }
  if (curr === 'pending' && (next === 'shipped' || next === 'delivered')) {
    return 'Integridad de Datos ERP: Un pedido pendiente debe ser CONFIRMADO primero con su comprobante de pago antes de poder despacharse o entregarse.';
  }
  return `Transición de estado no válida de '${currentStatus}' a '${nextStatus}' bajo la máquina de estados ERP.`;
}

/**
 * Adjusts inventory stock for an array of cart/order/purchase items.
 * @param items Array of items { id, inventoryItemId, sku, name, quantity, costPrice, salePrice, ... }
 * @param multiplier -1 to deduct stock (sale finalized), +1 to restore or add stock (purchase received / order cancelled)
 */
export async function adjustInventoryStockForItems(items: any[] | string, multiplier: number, defaultUserId: number = 1) {
  if (!multiplier || multiplier === 0) return;
  const parsedItems = safeParseOrderItems(items);

  if (!Array.isArray(parsedItems) || parsedItems.length === 0) return;

  const now = new Date();

  for (const cartItem of parsedItems) {
    if (!cartItem) continue;
    const rawId = cartItem.id || cartItem.inventoryItemId || cartItem.inventoryId || cartItem.item?.id || cartItem.productId;
    const itemId = rawId ? Number(rawId) : NaN;
    const rawSku = cartItem.sku ? String(cartItem.sku).trim() : (cartItem.item?.sku ? String(cartItem.item.sku).trim() : '');
    const rawName = cartItem.name ? String(cartItem.name).trim() : (cartItem.item?.name ? String(cartItem.item.name).trim() : '');
    // Determine the exact number of units to adjust for this item
    let qty = 0;
    if (cartItem.deductQuantity !== undefined) {
      qty = Math.max(0, Number(cartItem.deductQuantity));
    } else if (cartItem.stockDeducted !== undefined && cartItem.stockDeducted > 0) {
      qty = Math.max(0, Number(cartItem.stockDeducted));
    } else if (cartItem.deliveredQuantity !== undefined && Number(cartItem.deliveredQuantity) > 0) {
      qty = Number(cartItem.deliveredQuantity);
    } else if (cartItem.stockAvailable !== undefined && multiplier < 0) {
      qty = Math.min(Math.max(0, Number(cartItem.quantity || 1)), Math.max(0, Number(cartItem.stockAvailable)));
    } else {
      qty = Math.max(0, Number(cartItem.quantity) || 1);
    }

    if (qty <= 0) continue;

    const delta = multiplier * qty; // e.g. -1 * 1 = -1 (deduct stock on confirmation) or +1 * 5 = +5 (received purchase)

    let foundDbItem: any = null;

    if (isPostgresConfigured()) {
      try {
        if (!isNaN(itemId) && itemId > 0) {
          const [found] = await db
            .select()
            .from(inventoryItems)
            .where(eq(inventoryItems.id, itemId))
            .limit(1);
          foundDbItem = found;
        }

        if (!foundDbItem && rawSku) {
          const [foundBySku] = await db
            .select()
            .from(inventoryItems)
            .where(ilike(inventoryItems.sku, rawSku))
            .limit(1);
          foundDbItem = foundBySku;
        }

        if (!foundDbItem && rawName) {
          const [foundByName] = await db
            .select()
            .from(inventoryItems)
            .where(ilike(inventoryItems.name, rawName))
            .limit(1);
          foundDbItem = foundByName;
        }

        if (foundDbItem) {
          const currentStock = Number(foundDbItem.stock) || 0;
          const newStock = Math.max(0, currentStock + delta);
          let newStatus = foundDbItem.status;
          if (foundDbItem.status === 'archived') {
            newStatus = 'archived';
          } else {
            // Keep active products available even with 0 stock so online customers can order them
            newStatus = 'available';
          }

          await db
            .update(inventoryItems)
            .set({ stock: newStock, status: newStatus, updatedAt: now })
            .where(eq(inventoryItems.id, foundDbItem.id));
        } else if (multiplier > 0 && (rawName || rawSku)) {
          // If item is completely new and being received in a purchase, auto-create it in inventory
          const targetUserId = await resolveValidUserId(defaultUserId);
          const costVal = cleanNumericString(cartItem.costPrice || cartItem.salePrice || '0.00');
          const saleVal = cleanNumericString(cartItem.salePrice || (Number(costVal) * 1.3).toFixed(2));
          const [created] = await db
            .insert(inventoryItems)
            .values({
              userId: targetUserId,
              name: rawName || `Producto ${rawSku || Date.now().toString().slice(-4)}`,
              sku: rawSku || `SKU-${Date.now().toString().slice(-6)}`,
              description: 'Ingresado automáticamente desde orden de compra a proveedor',
              category: 'General',
              costPrice: costVal,
              salePrice: saleVal,
              stock: Math.max(0, qty),
              imageUrl: cartItem.imageUrl || null,
              supplierName: cartItem.supplierName || 'Proveedor',
              status: 'available',
            })
            .returning();
          foundDbItem = created;
        }
      } catch (sqlErr) {
        console.warn('Postgres stock adjustment error for item', rawId, rawSku, rawName, sqlErr);
      }
    }

    // Always keep in-memory / fallback storage in sync
    const state = storage.getState();
    if (!state.inventoryItems) state.inventoryItems = [];
    
    let localInv = state.inventoryItems.find((it) => 
      (foundDbItem && it.id === foundDbItem.id) ||
      (!isNaN(itemId) && itemId > 0 && it.id === itemId) ||
      (rawSku && it.sku && it.sku.trim().toLowerCase() === rawSku.toLowerCase()) ||
      (rawName && it.name && it.name.trim().toLowerCase() === rawName.toLowerCase())
    );

    if (localInv) {
      const currentStock = Number(localInv.stock) || 0;
      const newStock = Math.max(0, currentStock + delta);
      let newStatus = localInv.status;
      if (localInv.status === 'archived') {
        newStatus = 'archived';
      } else {
        newStatus = 'available';
      }
      localInv.stock = newStock;
      localInv.status = newStatus as any;
      localInv.updatedAt = now.toISOString();
    } else if (multiplier > 0 && (rawName || rawSku)) {
      const nextId = (state.nextId?.inventoryItems || (state.inventoryItems.length + 1));
      if (state.nextId) state.nextId.inventoryItems = nextId + 1;
      const costVal = cleanNumericString(cartItem.costPrice || cartItem.salePrice || '0.00');
      const saleVal = cleanNumericString(cartItem.salePrice || (Number(costVal) * 1.3).toFixed(2));
      const newItem = {
        id: foundDbItem ? foundDbItem.id : nextId,
        userId: defaultUserId,
        name: rawName || `Producto ${rawSku || Date.now().toString().slice(-4)}`,
        sku: rawSku || `SKU-${Date.now().toString().slice(-6)}`,
        description: 'Ingresado automáticamente desde orden de compra a proveedor',
        category: 'General',
        costPrice: costVal,
        salePrice: saleVal,
        stock: Math.max(0, qty),
        imageUrl: cartItem.imageUrl || null,
        supplierName: cartItem.supplierName || 'Proveedor',
        status: 'available' as any,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      state.inventoryItems.unshift(newItem as any);
    }
  }

  storage.save();
}

export async function createCustomerOrder(data: {
  userId?: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerAddress?: string;
  clientAddress?: string;
  shippingAddress?: string;
  customerCi?: string;
  ci?: string;
  items: any[];
  totalAmount: number | string;
  paymentMethod?: string;
  status?: string;
  paymentVoucher?: string;
  notes?: string;
  deliveryType?: string;
  trackingCarrier?: string;
  trackingNumber?: string;
  trackingNotes?: string;
  decrementStock?: boolean;
  isOnlineStore?: boolean;
  source?: string;
}) {
  const userId = data.userId || 1;
  const orderNumber = `PED-${Date.now().toString().slice(-6)}`;
  const normalizedPhone = normalizeEcuadorPhone(data.customerPhone);
  const cleanCustomerPhone = normalizedPhone.local || data.customerPhone;
  const cleanTotal = cleanNumericString(data.totalAmount, '0.00');
  const isOnlineStoreOrderIncoming = Boolean(
    data.isOnlineStore ||
    data.source === 'online_store' ||
    (data.notes && data.notes.toLowerCase().includes('[tienda online]'))
  );
  // Requisito estricto: Todos los pedidos que ingresen por la tienda online
  // deben tener el campo cédula en blanco (null) hasta su posterior ingreso por parte del vendedor al confirmar
  const cleanCi = isOnlineStoreOrderIncoming ? null : ((data.customerCi || data.ci || '').trim() || null);
  const cleanEmail = (data.customerEmail || '').trim() || null;
  // Regla ERP: Todos los pedidos de venta comienzan siempre en estado 'pending' (flujo unidireccional)
  const initialStatus = 'pending';

  // Retrieve current inventory to check available stock and handle partial fulfillment split
  let currentInventory: any[] = [];
  try {
    currentInventory = await getInventoryItems(userId);
  } catch (invErr) {
    console.warn('Could not fetch inventory stock for new order:', invErr);
  }

  const rawItems = Array.isArray(data.items)
    ? data.items
    : (typeof data.items === 'string' ? JSON.parse(data.items || '[]') : []);

  const isDirectlyFinalized = isFinalizedSaleStatus((data.status || initialStatus) as string);
  const isDirectlyDelivered = (data.status || initialStatus) === 'delivered';

  let totalRequestedUnits = 0;
  let totalAvailableUnits = 0;
  let totalDeficitUnits = 0;
  let totalDeliveredUnits = 0;
  let totalPendingUnits = 0;
  const itemsToDeductInInventory: any[] = [];

  const processedItems = rawItems.map((it: any) => {
    const isCustom = it.sku === 'CUSTOM';
    const invItem = isCustom
      ? null
      : currentInventory.find(
          (inv) =>
            inv.id === it.id ||
            inv.id === it.inventoryItemId ||
            (inv.sku && it.sku && inv.sku.toLowerCase() === it.sku.toLowerCase()) ||
            (inv.name && it.name && inv.name.trim().toLowerCase() === it.name.trim().toLowerCase())
        );

    const availableStock = invItem ? Math.max(0, Number(invItem.stock || 0)) : 0;
    const requestedQty = Math.max(1, Number(it.quantity || 1));
    totalRequestedUnits += requestedQty;

    // What exists in warehouse right now
    const stockInWarehouse = isCustom ? 0 : availableStock;
    const existingReadyToDeliver = Math.min(requestedQty, stockInWarehouse);
    const deficitForSupplier = isCustom ? requestedQty : Math.max(0, requestedQty - stockInWarehouse);

    totalAvailableUnits += existingReadyToDeliver;
    totalDeficitUnits += deficitForSupplier;

    // Delivery tracking
    const initialDelivered = isDirectlyDelivered
      ? requestedQty
      : (it.deliveredQuantity !== undefined ? Number(it.deliveredQuantity) : 0);
    const initialPending = Math.max(0, requestedQty - initialDelivered);

    totalDeliveredUnits += initialDelivered;
    totalPendingUnits += initialPending;

    // Stock deduction tracking
    let initialStockDeducted = 0;
    if (isDirectlyFinalized && !isCustom && existingReadyToDeliver > 0) {
      initialStockDeducted = isDirectlyDelivered ? Math.min(requestedQty, stockInWarehouse) : existingReadyToDeliver;
      itemsToDeductInInventory.push({
        id: invItem ? invItem.id : (it.inventoryItemId || it.id),
        sku: it.sku || invItem?.sku,
        name: it.name || invItem?.name,
        quantity: initialStockDeducted,
        deductQuantity: initialStockDeducted,
        salePrice: it.salePrice,
      });
    }

    return {
      ...it,
      inventoryItemId: invItem ? invItem.id : (isCustom ? undefined : (it.inventoryItemId || it.id)),
      sku: it.sku || invItem?.sku || '',
      name: it.name || invItem?.name || 'Producto',
      quantity: requestedQty,
      stockAvailable: stockInWarehouse,
      deficitQuantity: deficitForSupplier,
      deliveredQuantity: initialDelivered,
      pendingQuantity: initialPending,
      stockDeducted: initialStockDeducted,
      costPrice: it.costPrice !== undefined ? it.costPrice : (invItem?.costPrice || (Number(it.salePrice || 0) * 0.7).toFixed(2)),
      salePrice: it.salePrice !== undefined ? it.salePrice : (invItem?.salePrice || '0.00'),
    };
  });

  const hasOutOfStockItems = totalDeficitUnits > 0;
  const hasPartialStock = totalDeficitUnits > 0 && totalAvailableUnits > 0;

  let initialFulfillmentStatus: string = 'in_stock';
  let initialNotes = data.notes || '';
  if ((data.isOnlineStore || data.source === 'online_store') && !initialNotes.includes('[Tienda Online]')) {
    initialNotes = initialNotes ? `[Tienda Online] ${initialNotes}` : '[Tienda Online] Pedido realizado desde la Tienda Online';
  }

  if (hasPartialStock) {
    initialFulfillmentStatus = 'partial_delivered';
    const splitNote = `📦 [Stock Parcial] ${totalAvailableUnits} un. disponibles en bodega para entrega inmediata. ${totalDeficitUnits} un. faltantes solicitadas automáticamente a proveedor.`;
    if (!initialNotes.includes('[Stock Parcial]') && !initialNotes.includes('[Entrega Inmediata')) {
      initialNotes = (initialNotes ? initialNotes + '\n' : '') + splitNote;
    }
  } else if (hasOutOfStockItems) {
    initialFulfillmentStatus = 'supplier_pending';
    const pendingNote = `🔍 [Bajo Pedido / Sin Stock] ${totalDeficitUnits} un. solicitadas automáticamente a proveedor.`;
    if (!initialNotes.includes('[Bajo Pedido]')) {
      initialNotes = (initialNotes ? initialNotes + '\n' : '') + pendingNote;
    }
  } else {
    initialFulfillmentStatus = 'in_stock';
    const stockNote = `✓ [Stock Disponible] ${totalAvailableUnits} un. disponibles en bodega.`;
    if (!initialNotes.includes('[Stock Disponible]') && !initialNotes.includes('[Stock Completo]')) {
      initialNotes = (initialNotes ? initialNotes + '\n' : '') + stockNote;
    }
  }

  // Deduct available physically delivered units from warehouse inventory ONLY if order was created directly confirmed
  const effectiveInitialStatus = (data.status || initialStatus) as string;
  if (isFinalizedSaleStatus(effectiveInitialStatus) && itemsToDeductInInventory.length > 0) {
    try {
      await adjustInventoryStockForItems(itemsToDeductInInventory, -1, userId);
    } catch (stkErr) {
      console.warn('Could not deduct physical stock for already confirmed order:', stkErr);
    }
  }

  const serializedItems = JSON.stringify(processedItems);

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const nextId = state.nextId.customerOrders++;
    const now = new Date().toISOString();

    const newOrder: any = {
      id: nextId,
      userId,
      orderNumber,
      customerName: data.customerName,
      customerPhone: cleanCustomerPhone,
      customerEmail: cleanEmail,
      customerCi: cleanCi,
      ci: cleanCi,
      customerAddress: data.shippingAddress || data.customerAddress || '',
      clientAddress: data.clientAddress || undefined,
      shippingAddress: data.shippingAddress || data.customerAddress || undefined,
      items: serializedItems,
      totalAmount: cleanTotal,
      paymentMethod: data.paymentMethod || 'whatsapp',
      status: initialStatus,
      paymentVoucher: data.paymentVoucher || null,
      notes: initialNotes,
      deliveryType: data.deliveryType || (data.customerAddress && (data.customerAddress.toLowerCase().includes('retiro') || data.customerAddress.toLowerCase().includes('local')) ? 'pickup' : 'shipping'),
      trackingNumber: data.trackingNumber || null,
      trackingCarrier: data.trackingCarrier || null,
      trackingNotes: data.trackingNotes || null,
      fulfillmentStatus: initialFulfillmentStatus,
      linkedPurchaseId: null,
      linkedPurchaseNumber: null,
      createdAt: now,
    };

    state.customerOrders.unshift(newOrder);
    storage.save();
    try {
      await upsertCustomerFromOrder(newOrder, userId);
    } catch {}

    // Auto-generate supplier purchase order for the exact missing deficit units
    if (hasOutOfStockItems) {
      try {
        const purchaseRes = await autoGeneratePurchaseForOrder(newOrder.id, userId);
        if (purchaseRes && purchaseRes.purchase) {
          newOrder.linkedPurchaseId = purchaseRes.purchase.id;
          newOrder.linkedPurchaseNumber = purchaseRes.purchaseNumber;
          storage.save();
        }
      } catch (pErr) {
        console.warn('Could not auto-generate purchase order in fallback storage:', pErr);
      }
    }

    // Auto-register payment inflow when order is already confirmed / paid with full accounting details
    const effectiveStatusFallback1 = (data.status || initialStatus) as string;
    if (effectiveStatusFallback1 === 'confirmed' || effectiveStatusFallback1 === 'delivered' || effectiveStatusFallback1 === 'shipped' || !!data.paymentVoucher) {
      try {
        const orderAmt = Number(newOrder.totalAmount || 0);
        if (orderAmt > 0) {
          const derivedBank = (data as any).bankOrAccount || deriveBankOrAccountFromMethod(data.paymentMethod, data.notes);
          await createPayment(userId, {
            type: 'inflow',
            category: 'customer_sale',
            amount: orderAmt,
            paymentMethod: data.paymentMethod || 'transferencia_bancaria',
            bankOrAccount: derivedBank,
            referenceNumber: data.paymentVoucher || `PED-${newOrder.orderNumber}`,
            paymentDate: new Date().toISOString(),
            status: 'completed',
            notes: `[Cobro Venta #${newOrder.orderNumber}] ${newOrder.customerName} - ${totalDeliveredUnits}/${totalRequestedUnits} un. entregadas de stock inmediato${totalDeficitUnits > 0 ? `, ${totalDeficitUnits} un. solicitadas a proveedor (OC #${newOrder.linkedPurchaseNumber || ''})` : ''}`,
            orderId: newOrder.id,
            orderNumber: newOrder.orderNumber,
            customerName: newOrder.customerName,
          });
        }
      } catch (payErr) {
        console.warn('Auto-create payment inflow fallback error:', payErr);
      }
    }

    return {
      success: true,
      order: newOrder,
      orderNumber,
      totalDeliveredUnits,
      totalDeficitUnits,
    };
  }

  try {
    const targetUserId = await resolveValidUserId(data.userId);
    const result = await db
      .insert(customerOrders)
      .values({
        userId: targetUserId,
        orderNumber,
        customerName: data.customerName,
        customerPhone: cleanCustomerPhone,
        customerEmail: cleanEmail,
        customerCi: cleanCi,
        customerAddress: data.customerAddress || '',
        items: serializedItems,
        totalAmount: cleanTotal,
        paymentMethod: data.paymentMethod || 'whatsapp',
        status: initialStatus,
        paymentVoucher: data.paymentVoucher || null,
        notes: initialNotes,
        trackingCarrier: data.trackingCarrier || null,
        trackingNumber: data.trackingNumber || null,
        trackingNotes: data.trackingNotes || null,
        fulfillmentStatus: initialFulfillmentStatus,
        deliveryType: data.deliveryType || (data.customerAddress && (data.customerAddress.toLowerCase().includes('retiro') || data.customerAddress.toLowerCase().includes('local')) ? 'pickup' : 'shipping'),
      })
      .returning();

    const createdOrder = result[0];
    const state = storage.getState();
    state.customerOrders.unshift(createdOrder as any);
    storage.save();

    try {
      await upsertCustomerFromOrder({
        ...createdOrder,
        clientAddress: data.clientAddress,
        shippingAddress: data.shippingAddress || data.customerAddress,
      }, targetUserId);
    } catch {}

    // Auto-generate supplier purchase order for the exact missing deficit units
    if (hasOutOfStockItems) {
      try {
        const purchaseRes = await autoGeneratePurchaseForOrder(createdOrder.id, targetUserId);
        if (purchaseRes && purchaseRes.purchase) {
          (createdOrder as any).linkedPurchaseId = purchaseRes.purchase.id;
          (createdOrder as any).linkedPurchaseNumber = purchaseRes.purchaseNumber;
        }
      } catch (pErr) {
        console.warn('Could not auto-generate purchase order in SQL:', pErr);
      }
    }

    // Auto-register payment inflow when order is already confirmed / paid
    const effectiveStatusSql = (data.status || initialStatus) as string;
    if (effectiveStatusSql === 'confirmed' || effectiveStatusSql === 'delivered' || effectiveStatusSql === 'shipped' || !!data.paymentVoucher) {
      try {
        const orderAmt = Number(createdOrder.totalAmount || 0);
        if (orderAmt > 0) {
          const derivedBank = (data as any).bankOrAccount || deriveBankOrAccountFromMethod(data.paymentMethod, data.notes);
          await createPayment(targetUserId, {
            type: 'inflow',
            category: 'customer_sale',
            amount: orderAmt,
            paymentMethod: data.paymentMethod || 'transferencia_bancaria',
            bankOrAccount: derivedBank,
            referenceNumber: data.paymentVoucher || `PED-${createdOrder.orderNumber}`,
            paymentDate: new Date().toISOString(),
            status: 'completed',
            notes: `[Cobro Venta #${createdOrder.orderNumber}] ${createdOrder.customerName} - ${totalDeliveredUnits}/${totalRequestedUnits} un. entregadas de stock inmediato${totalDeficitUnits > 0 ? `, ${totalDeficitUnits} un. solicitadas a proveedor (OC #${(createdOrder as any).linkedPurchaseNumber || ''})` : ''}`,
            orderId: createdOrder.id,
            orderNumber: createdOrder.orderNumber,
            customerName: createdOrder.customerName,
          });
        }
      } catch (payErr) {
        console.warn('Auto-create payment inflow SQL error:', payErr);
      }
    }

    return {
      success: true,
      order: createdOrder,
      orderNumber,
      totalDeliveredUnits,
      totalDeficitUnits,
    };
  } catch (error) {
    console.error('Error creating customer order in SQL, fallback to local store:', error);
    const state = storage.getState();
    const nextId = state.nextId.customerOrders++;
    const now = new Date().toISOString();
    const newOrder: any = {
      id: nextId,
      userId,
      orderNumber,
      customerName: data.customerName,
      customerPhone: cleanCustomerPhone,
      customerEmail: cleanEmail,
      customerCi: cleanCi,
      ci: cleanCi,
      customerAddress: data.customerAddress || '',
      items: serializedItems,
      totalAmount: cleanTotal,
      paymentMethod: data.paymentMethod || 'whatsapp',
      status: initialStatus,
      paymentVoucher: data.paymentVoucher || null,
      notes: initialNotes,
      trackingNumber: null,
      trackingCarrier: null,
      trackingNotes: null,
      fulfillmentStatus: initialFulfillmentStatus,
      linkedPurchaseId: null,
      linkedPurchaseNumber: null,
      createdAt: now,
    };
    state.customerOrders.unshift(newOrder);
    storage.save();

    try {
      await upsertCustomerFromOrder(newOrder, userId);
    } catch {}

    if (hasOutOfStockItems) {
      try {
        const purchaseRes = await autoGeneratePurchaseForOrder(newOrder.id, userId);
        if (purchaseRes && purchaseRes.purchase) {
          newOrder.linkedPurchaseId = purchaseRes.purchase.id;
          newOrder.linkedPurchaseNumber = purchaseRes.purchaseNumber;
          storage.save();
        }
      } catch (pErr) {
        console.warn('Could not auto-generate purchase order fallback:', pErr);
      }
    }

    // Auto-register payment inflow when order is already confirmed / paid
    const effectiveStatusFallback2 = (data.status || initialStatus) as string;
    if (effectiveStatusFallback2 === 'confirmed' || effectiveStatusFallback2 === 'delivered' || effectiveStatusFallback2 === 'shipped' || !!data.paymentVoucher) {
      try {
        const orderAmt = Number(newOrder.totalAmount || 0);
        if (orderAmt > 0) {
          const derivedBank = (data as any).bankOrAccount || deriveBankOrAccountFromMethod(data.paymentMethod, data.notes);
          await createPayment(userId, {
            type: 'inflow',
            category: 'customer_sale',
            amount: orderAmt,
            paymentMethod: data.paymentMethod || 'transferencia_bancaria',
            bankOrAccount: derivedBank,
            referenceNumber: data.paymentVoucher || `PED-${newOrder.orderNumber}`,
            paymentDate: new Date().toISOString(),
            status: 'completed',
            notes: `[Cobro Venta #${newOrder.orderNumber}] ${newOrder.customerName} - ${totalDeliveredUnits}/${totalRequestedUnits} un. entregadas de stock inmediato${totalDeficitUnits > 0 ? `, ${totalDeficitUnits} un. solicitadas a proveedor (OC #${newOrder.linkedPurchaseNumber || ''})` : ''}`,
            orderId: newOrder.id,
            orderNumber: newOrder.orderNumber,
            customerName: newOrder.customerName,
          });
        }
      } catch (payErr) {
        console.warn('Auto-create payment inflow fallback error 2:', payErr);
      }
    }

    return {
      success: true,
      order: newOrder,
      orderNumber,
      totalDeliveredUnits,
      totalDeficitUnits,
    };
  }
}

export async function getCustomerOrders(userId?: number) {
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const list = [...state.customerOrders];
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list.map((ord) => ({
      ...ord,
      items: safeParseOrderItems(ord.items) as any,
    }));
  }

  try {
    const orders = await db
      .select()
      .from(customerOrders)
      .orderBy(desc(customerOrders.createdAt));

    return orders.map((ord) => ({
      ...ord,
      items: safeParseOrderItems(ord.items) as any,
    }));
  } catch (error) {
    console.warn('Error fetching customer orders from SQL, fallback to local store:', error);
    const state = storage.getState();
    return state.customerOrders.map((ord) => ({
      ...ord,
      items: safeParseOrderItems(ord.items) as any,
    }));
  }
}

export async function updateCustomerOrderStatus(
  id: number,
  status: string,
  paymentVoucher?: string,
  notes?: string,
  trackingNumber?: string,
  trackingCarrier?: string,
  trackingNotes?: string,
  purchaseAction?: 'cancel' | 'keep',
  paymentMethod?: string,
  bypassSupplierBlock?: boolean,
  bankOrAccount?: string,
  customerCi?: string
) {
  const updatePayload: Record<string, any> = { status };
  if (paymentVoucher !== undefined) updatePayload.paymentVoucher = paymentVoucher;
  if (notes !== undefined) updatePayload.notes = notes;
  if (trackingNumber !== undefined) updatePayload.trackingNumber = trackingNumber;
  if (trackingCarrier !== undefined) updatePayload.trackingCarrier = trackingCarrier;
  if (trackingNotes !== undefined) updatePayload.trackingNotes = trackingNotes;
  if (paymentMethod !== undefined) updatePayload.paymentMethod = paymentMethod;
  if (customerCi !== undefined && customerCi.trim()) {
    updatePayload.customerCi = customerCi.trim();
    updatePayload.ci = customerCi.trim();
  }

  // Retrieve existing order first to compare previous status & stock impact
  let existingOrder: any = null;
  if (isPostgresConfigured()) {
    try {
      const [ord] = await db
        .select()
        .from(customerOrders)
        .where(eq(customerOrders.id, id))
        .limit(1);
      existingOrder = ord || null;
    } catch {}
  }
  if (!existingOrder) {
    const state = storage.getState();
    existingOrder = state.customerOrders.find((o) => o.id === id) || null;
  }

  if (!existingOrder) {
    throw new Error('Pedido no encontrado');
  }

  const prevStatus = existingOrder.status;

  // ERP State Machine Transition Enforcement
  if (prevStatus !== status) {
    if (!isValidOrderStatusTransition(prevStatus, status)) {
      throw new Error(getOrderStatusTransitionError(prevStatus, status));
    }
    // Para pedidos con envío: El pedido debe estar en estado 'shipped' antes de pasar a 'delivered'
    if (!isPickupDeliveryOrder(existingOrder) && prevStatus === 'confirmed' && status === 'delivered') {
      throw new Error(
        'Integridad de Datos ERP: Para pedidos con envío, el pedido debe pasar primero por el estado ENVIADO antes de registrarse como ENTREGADO.'
      );
    }
    if (status === 'cancelled') {
      if (prevStatus === 'confirmed' || prevStatus === 'shipped' || prevStatus === 'delivered') {
        throw new Error(
          'Integridad de Datos ERP: Una venta no puede cancelarse cuando está confirmada y/o se encuentra entregada parcialmente.'
        );
      }
      if (isOrderPartiallyDelivered(existingOrder)) {
        throw new Error(
          'Integridad de Datos ERP: Una venta no puede cancelarse cuando se encuentra entregada parcialmente. Ya se han entregado unidades al cliente desde bodega.'
        );
      }
    }
  }

  const wasFinalized = isFinalizedSaleStatus(prevStatus);
  const isNowFinalized = isFinalizedSaleStatus(status);

  // Automatic Stock Transition & Auto-Confirmation of Supplier Purchases:
  // Case 1: Sale finalized (pending -> confirmed/shipped/delivered) -> deduct & reserve available stock (-1) + confirm supplier purchase
  if (!wasFinalized && isNowFinalized) {
    let totalDeductedUnits = 0;
    const rawItems = safeParseOrderItems(existingOrder.items);
    const itemsToDeduct: any[] = [];
    const updatedItems = rawItems.map((it: any) => {
      const qty = Number(it.quantity || 1);
      // Determine how many units came from warehouse inventory (excluding supplier deficit)
      const inStock = it.deficitQuantity !== undefined
        ? Math.max(0, qty - Number(it.deficitQuantity))
        : (it.stockAvailable !== undefined ? Number(it.stockAvailable) : qty);
      const targetDeduct = Math.min(qty, Math.max(0, inStock));
      const prevDeducted = Number(it.stockDeducted || 0);
      const netDeduct = Math.max(0, targetDeduct - prevDeducted);

      if (netDeduct > 0) {
        totalDeductedUnits += netDeduct;
        itemsToDeduct.push({
          id: it.inventoryItemId || it.id,
          sku: it.sku,
          name: it.name,
          quantity: netDeduct,
          deductQuantity: netDeduct,
          salePrice: it.salePrice,
        });
      }

      const deliveredQty = status === 'delivered' ? qty : (it.deliveredQuantity !== undefined ? Number(it.deliveredQuantity) : targetDeduct);
      const pendingQty = status === 'delivered' ? 0 : Math.max(0, qty - deliveredQty);

      return {
        ...it,
        stockDeducted: prevDeducted + netDeduct,
        deliveredQuantity: deliveredQty,
        pendingQuantity: pendingQty,
      };
    });

    if (itemsToDeduct.length > 0) {
      await adjustInventoryStockForItems(itemsToDeduct, -1, existingOrder.userId);
    }
    updatePayload.items = JSON.stringify(updatedItems);

    // Auto-confirm supplier purchase order for missing products upon order confirmation
    // SOLO si el pedido no está pasando directamente a entregado ('delivered')
    if (status !== 'delivered') {
      try {
        const allPurchases = await getPurchases(existingOrder.userId);
        let linkedP = allPurchases.find((p) => {
          if (p.status === 'cancelled') return false;
          const matchId = (p.linkedCustomerOrderId !== undefined && p.linkedCustomerOrderId !== null) &&
            (p.linkedCustomerOrderId == id || String(p.linkedCustomerOrderId) === String(id));
          const matchNumber = Boolean(p.linkedCustomerOrderNumber && existingOrder.orderNumber && p.linkedCustomerOrderNumber.trim() === existingOrder.orderNumber.trim());
          const matchLinkedId = Boolean(existingOrder.linkedPurchaseId && (p.id == existingOrder.linkedPurchaseId || String(p.id) === String(existingOrder.linkedPurchaseId)));
          const matchLinkedNumber = Boolean(existingOrder.linkedPurchaseNumber && p.purchaseNumber && String(existingOrder.linkedPurchaseNumber).includes(p.purchaseNumber));
          const matchNotes = Boolean(p.notes && existingOrder.orderNumber && p.notes.includes(existingOrder.orderNumber));
          return Boolean(matchId || matchNumber || matchLinkedId || matchLinkedNumber || matchNotes);
        });

        if (linkedP && linkedP.status === 'pending') {
          const confirmedPurchase = await updatePurchase(linkedP.id, {
            status: 'ordered',
            paymentStatus: 'paid',
            notes: (linkedP.notes ? linkedP.notes + '\n' : '') + `[Confirmación Automática] Compra #${linkedP.purchaseNumber} confirmada y procesada con el proveedor al confirmarse la Venta #${existingOrder.orderNumber}.`,
          });
          if (confirmedPurchase) {
            updatePayload.linkedPurchaseId = confirmedPurchase.id;
            updatePayload.linkedPurchaseNumber = confirmedPurchase.purchaseNumber;
            updatePayload.fulfillmentStatus = totalDeductedUnits > 0 ? 'partial_delivered' : 'supplier_ordered';
            const autoConfirmNote = `✓ [Venta Confirmada] Compra a proveedor #${confirmedPurchase.purchaseNumber} procesada y confirmada automáticamente. Stock en bodega (${totalDeductedUnits} un.) reservado para entrega inmediata.`;
            updatePayload.notes = (existingOrder.notes ? existingOrder.notes + '\n' : '') + autoConfirmNote;
          }
        } else if (linkedP && (linkedP.status === 'ordered' || linkedP.status === 'in_transit')) {
          updatePayload.linkedPurchaseId = linkedP.id;
          updatePayload.linkedPurchaseNumber = linkedP.purchaseNumber;
          if (!existingOrder.fulfillmentStatus || existingOrder.fulfillmentStatus === 'supplier_pending') {
            updatePayload.fulfillmentStatus = totalDeductedUnits > 0 ? 'partial_delivered' : 'supplier_ordered';
          }
        } else if (!linkedP) {
          // Si no existe compra previa y el pedido tiene productos con faltante en bodega, generar orden de compra a proveedor
          const hasMissingStock = rawItems.some((it: any) => {
            const reqQty = Number(it.quantity || 1);
            const defQty = it.deficitQuantity !== undefined
              ? Number(it.deficitQuantity)
              : Math.max(0, reqQty - (Number(it.stockAvailable) || 0));
            return defQty > 0;
          });
          if (hasMissingStock) {
            try {
              const genRes = await autoGeneratePurchaseForOrder(id, existingOrder.userId);
              if (genRes && (genRes.purchase || (genRes.purchases && genRes.purchases.length > 0))) {
                const p = genRes.purchase || genRes.purchases[0];
                updatePayload.linkedPurchaseId = p.id;
                updatePayload.linkedPurchaseNumber = p.purchaseNumber || genRes.purchaseNumber;
                updatePayload.fulfillmentStatus = totalDeductedUnits > 0 ? 'partial_delivered' : 'supplier_ordered';
              }
            } catch (genErr) {
              console.warn('Could not auto-generate purchase order on sale confirmation:', genErr);
            }
          }
        }
      } catch (autoConfirmErr) {
        console.warn('Could not auto-confirm linked purchase on sale confirmation:', autoConfirmErr);
      }
    }
  }
  // Case 2: Sale un-finalized/cancelled (confirmed/shipped/delivered -> pending/cancelled) -> restore stock (+1)
  else if (wasFinalized && !isNowFinalized) {
    const rawItems = safeParseOrderItems(existingOrder.items);
    const itemsToRestore: any[] = [];
    const updatedItems = rawItems.map((it: any) => {
      const prevDeducted = Number(it.stockDeducted || 0);
      if (prevDeducted > 0) {
        itemsToRestore.push({
          id: it.inventoryItemId || it.id,
          sku: it.sku,
          name: it.name,
          quantity: prevDeducted,
          deductQuantity: prevDeducted,
          salePrice: it.salePrice,
        });
      }
      return {
        ...it,
        stockDeducted: 0,
      };
    });

    if (itemsToRestore.length > 0) {
      await adjustInventoryStockForItems(itemsToRestore, 1, existingOrder.userId);
    }
    updatePayload.items = JSON.stringify(updatedItems);
  }

  if (status === 'shipped' && existingOrder.status !== 'shipped') {
    // Comprobar que el pedido esté confirmado para poder enviar el pedido
    if (existingOrder.status !== 'confirmed') {
      throw new Error(
        `Bloqueo: El pedido #${existingOrder.orderNumber} debe estar confirmado para poder ser marcado como ENVIADO.`
      );
    }
  }

  if (status === 'delivered' && existingOrder.status !== 'delivered') {
    // Verificación ERP: Si el pedido fue solicitado bajo pedido / sin stock con compra a proveedor vinculada,
    // NO puede pasar a estado ENTREGADO mientras no se confirme la compra y recepción física del proveedor en bodega
    // (a menos que se suministre bypassSupplierBlock o todos los ítems ya hayan sido físicamente entregados).
    let rawItems = safeParseOrderItems(existingOrder.items);

    // Auto-recuperación si los ítems estaban vacíos pero existe una compra asociada
    if (rawItems.length === 0) {
      try {
        const state = storage.getState();
        const linkedP = (state.purchases || []).find(
          (p: any) => (existingOrder.linkedPurchaseId && p.id === existingOrder.linkedPurchaseId) || p.linkedCustomerOrderId === id
        );
        if (linkedP && linkedP.items) {
          rawItems = safeParseOrderItems(linkedP.items);
        }
      } catch {}
    }

    const isAllItemsPhysicallyDelivered =
      rawItems.length > 0 &&
      rawItems.every((it: any) => Number(it.deliveredQuantity || 0) >= Number(it.quantity || 1) && Number(it.pendingQuantity || 0) === 0);

    if (!bypassSupplierBlock && !isAllItemsPhysicallyDelivered) {
      try {
        const allPurchases = await getPurchases(existingOrder.userId);
        const linkedP = allPurchases.find(
          (p) =>
            ((existingOrder.linkedPurchaseId && p.id === existingOrder.linkedPurchaseId) ||
              p.linkedCustomerOrderId === id) &&
            p.status !== 'cancelled'
        );

        if (linkedP && linkedP.status !== 'received') {
          throw new Error(
            `Bloqueo ERP: Este pedido fue registrado sin stock (bajo encargo) y tiene la orden de compra a proveedor #${
              linkedP.purchaseNumber || linkedP.id
            } en estado '${linkedP.status}'. No puede pasar a estado ENTREGADO hasta que se confirme la compra y recepción de la mercadería del proveedor en el módulo de Compras.`
          );
        }

        if (
          existingOrder.fulfillmentStatus === 'supplier_pending' ||
          existingOrder.fulfillmentStatus === 'supplier_ordered' ||
          existingOrder.fulfillmentStatus === 'awaiting_procurement'
        ) {
          throw new Error(
            `Bloqueo ERP: Este pedido se encuentra en espera de mercadería de proveedor (${existingOrder.fulfillmentStatus}). Debe confirmar la recepción física del proveedor en Compras antes de marcar el pedido como ENTREGADO.`
          );
        }
      } catch (checkErr: any) {
        if (checkErr.message?.startsWith('Bloqueo ERP:')) {
          throw checkErr;
        }
      }
    }

    // Actualización de comprobación de ítems para entrega
    if (rawItems.length > 0) {
      const deliveredItems = rawItems.map((it: any) => {
        const qty = Number(it.quantity || 1);
        return {
          ...it,
          deliveredQuantity: qty,
          pendingQuantity: 0,
          deficitQuantity: 0,
        };
      });
      updatePayload.items = JSON.stringify(deliveredItems);
    }
    updatePayload.fulfillmentStatus = 'delivered';
    updatePayload.verifiedExisted = true;
    updatePayload.deliveryVerifiedAt = new Date().toISOString();
    updatePayload.deliveredAt = new Date().toISOString();
  }

  // Automatic cancellation of linked purchase orders when sale is cancelled (unless explicitly requested to keep)
  if (status === 'cancelled') {
    const effectivePurchaseAction = purchaseAction || 'cancel';
    try {
      const allPurchases = await getPurchases(existingOrder.userId);
      const linkedList = allPurchases.filter(
        (p) =>
          (existingOrder.linkedPurchaseId && p.id === existingOrder.linkedPurchaseId) ||
          p.linkedCustomerOrderId === id ||
          (existingOrder.linkedPurchaseNumber && String(existingOrder.linkedPurchaseNumber).includes(p.purchaseNumber)) ||
          (p.linkedCustomerOrderNumber && String(p.linkedCustomerOrderNumber).trim() === String(existingOrder.orderNumber).trim()) ||
          (Array.isArray(p.items) &&
            p.items.some(
              (it: any) =>
                it.customerOrderId === id ||
                (it.orderNumber && String(it.orderNumber).trim() === String(existingOrder.orderNumber).trim())
            ))
      );

      for (const linkedP of linkedList) {
        if (linkedP.status !== 'received' && linkedP.status !== 'cancelled') {
          if (effectivePurchaseAction === 'cancel') {
            if (linkedP.status === 'pending') {
              await deletePurchase(linkedP.id, true);
            } else {
              await updatePurchase(linkedP.id, {
                status: 'cancelled',
                linkedCustomerOrderId: null,
                linkedCustomerOrderNumber: null,
                notes: (linkedP.notes ? linkedP.notes + '\n' : '') + `[Orden de compra cancelada automáticamente al cancelar el Pedido de Venta #${existingOrder.orderNumber}]`,
              });
            }
          } else if (effectivePurchaseAction === 'keep') {
            let cleanedItems = linkedP.items || [];
            if (Array.isArray(cleanedItems)) {
              cleanedItems = cleanedItems.map((it: any) => ({
                ...it,
                customerOrderId: null,
                orderNumber: null,
                customerName: null,
              }));
            }
            await updatePurchase(linkedP.id, {
              items: cleanedItems,
              linkedCustomerOrderId: null,
              linkedCustomerOrderNumber: null,
              notes: (linkedP.notes ? linkedP.notes + '\n' : '') + `[Desvinculada del Pedido #${existingOrder.orderNumber} por cancelación. Conservada para reposición de stock general en bodega]`,
            });
          }
        }
      }
      if (linkedList.length > 0) {
        updatePayload.linkedPurchaseId = null;
        updatePayload.linkedPurchaseNumber = null;
        updatePayload.fulfillmentStatus = 'in_stock';
        updatePayload.notes = (existingOrder.notes ? existingOrder.notes + '\n' : '') + `[Cancelación] Venta cancelada. ${linkedList.length === 1 ? 'Orden de compra a proveedor cancelada' : `Se cancelaron las ${linkedList.length} órdenes de compra asociadas`} automáticamente.`;
      }
    } catch (pErr) {
      console.warn('Could not handle linked purchase on order cancel:', pErr);
    }
  }

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const ord = state.customerOrders.find((o) => o.id === id);
    if (!ord) throw new Error('Pedido no encontrado');
    Object.assign(ord, updatePayload);
    storage.save();

    try {
      await upsertCustomerFromOrder(ord);
    } catch {}

    // Auto-create payment inflow when client payment is confirmed
    if (status === 'confirmed' || status === 'delivered' || status === 'shipped' || paymentVoucher) {
      try {
        const existingPayments = (state.payments || []).filter(
          (p: any) => Number(p.orderId) === Number(id) && p.type === 'inflow' && p.status !== 'voided'
        );
        if (existingPayments.length === 0) {
          const orderAmount = Number(ord.totalAmount || 0);
          if (orderAmount > 0) {
            const effectiveMethod = paymentMethod || ord.paymentMethod || 'transferencia_bancaria';
            const effectiveNotes = notes !== undefined ? notes : (ord.notes || '');
            const effectiveBank = bankOrAccount || deriveBankOrAccountFromMethod(effectiveMethod, effectiveNotes);
            await createPayment(ord.userId || 1, {
              type: 'inflow',
              category: 'customer_sale',
              amount: orderAmount,
              paymentMethod: effectiveMethod,
              bankOrAccount: effectiveBank,
              referenceNumber: paymentVoucher || ord.paymentVoucher || `PED-${ord.orderNumber}`,
              paymentDate: new Date().toISOString(),
              status: 'completed',
              notes: `[Cobro Confirmado] Pedido #${ord.orderNumber} confirmado. Valor trasladado de CxC a Pago Clientes.`,
              orderId: ord.id,
              orderNumber: ord.orderNumber,
              customerName: ord.customerName,
            });
          }
        }
      } catch (pErr) {
        console.warn('Auto-create payment inflow fallback error:', pErr);
      }
    }

    return {
      ...ord,
      items: safeParseOrderItems(ord.items) as any,
    };
  }

  try {
    const result = await db
      .update(customerOrders)
      .set(updatePayload)
      .where(eq(customerOrders.id, id))
      .returning();

    if (result[0]) {
      const state = storage.getState();
      const localOrd = state.customerOrders.find((o) => o.id === id);
      if (localOrd) {
        Object.assign(localOrd, updatePayload);
        storage.save();
      }

      try {
        await upsertCustomerFromOrder(result[0]);
      } catch {}

      // Auto-create payment inflow when client payment is confirmed
      if (status === 'confirmed' || status === 'delivered' || status === 'shipped' || paymentVoucher) {
        try {
          const existingPayments = await getPayments(result[0].userId, { orderId: id, type: 'inflow' });
          const nonVoided = existingPayments.filter((p: any) => p.status !== 'voided');
          if (nonVoided.length === 0) {
            const orderAmount = Number(result[0].totalAmount || 0);
            if (orderAmount > 0) {
              const effectiveMethod = paymentMethod || result[0].paymentMethod || 'transferencia_bancaria';
              const effectiveNotes = notes !== undefined ? notes : (result[0].notes || '');
              const effectiveBank = bankOrAccount || deriveBankOrAccountFromMethod(effectiveMethod, effectiveNotes);
              await createPayment(result[0].userId, {
                type: 'inflow',
                category: 'customer_sale',
                amount: orderAmount,
                paymentMethod: effectiveMethod,
                bankOrAccount: effectiveBank,
                referenceNumber: paymentVoucher || result[0].paymentVoucher || `PED-${result[0].orderNumber}`,
                paymentDate: new Date().toISOString(),
                status: 'completed',
                notes: `[Cobro Confirmado] Pedido #${result[0].orderNumber} confirmado. Valor trasladado de CxC a Pago Clientes.`,
                orderId: result[0].id,
                orderNumber: result[0].orderNumber,
                customerName: result[0].customerName,
              });
            }
          }
        } catch (pErr) {
          console.warn('Auto-create payment inflow SQL error:', pErr);
        }
      }
    }

    return {
      ...result[0],
      items: safeParseOrderItems(result[0].items) as any,
    };
  } catch (error) {
    console.warn('Error updating order status in SQL, fallback to local store:', error);
    const state = storage.getState();
    const ord = state.customerOrders.find((o) => o.id === id);
    if (ord) {
      Object.assign(ord, updatePayload);
      storage.save();
      try {
        await upsertCustomerFromOrder(ord);
      } catch {}

      if (status === 'confirmed' || status === 'delivered' || status === 'shipped' || paymentVoucher) {
        try {
          const existingPayments = (state.payments || []).filter(
            (p: any) => Number(p.orderId) === Number(id) && p.type === 'inflow' && p.status !== 'voided'
          );
          if (existingPayments.length === 0) {
            const orderAmount = Number(ord.totalAmount || 0);
            if (orderAmount > 0) {
              const effectiveMethod = paymentMethod || ord.paymentMethod || 'transferencia_bancaria';
              const effectiveNotes = notes !== undefined ? notes : (ord.notes || '');
              const effectiveBank = bankOrAccount || deriveBankOrAccountFromMethod(effectiveMethod, effectiveNotes);
              await createPayment(ord.userId || 1, {
                type: 'inflow',
                category: 'customer_sale',
                amount: orderAmount,
                paymentMethod: effectiveMethod,
                bankOrAccount: effectiveBank,
                referenceNumber: paymentVoucher || ord.paymentVoucher || `PED-${ord.orderNumber}`,
                paymentDate: new Date().toISOString(),
                status: 'completed',
                notes: `[Cobro Confirmado] Pedido #${ord.orderNumber} confirmado. Valor trasladado de CxC a Pago Clientes.`,
                orderId: ord.id,
                orderNumber: ord.orderNumber,
                customerName: ord.customerName,
              });
            }
          }
        } catch (pErr) {}
      }

      return {
        ...ord,
        items: safeParseOrderItems(ord.items) as any,
      };
    }
    throw error;
  }
}

export async function updateCustomerOrder(
  id: number,
  data: {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string | null;
  customerAddress?: string;
  clientAddress?: string | null;
  shippingAddress?: string | null;
  deliveryType?: string | null;
  customerCi?: string | null;
  ci?: string | null;
  items?: any[];
  returns?: any[];
  totalAmount?: number | string;
  paymentMethod?: string;
  status?: string;
  paymentVoucher?: string;
  notes?: string;
  trackingNumber?: string;
  trackingCarrier?: string;
  trackingNotes?: string;
  fulfillmentStatus?: string;
  linkedPurchaseId?: number | null;
  linkedPurchaseNumber?: string | null;
  purchaseAction?: 'cancel' | 'keep';
  bypassSupplierBlock?: boolean;
}) {
  const updatePayload: Record<string, any> = {};

  if (data.customerName !== undefined) updatePayload.customerName = data.customerName;
  if (data.customerPhone !== undefined) {
    const normalizedPhone = normalizeEcuadorPhone(data.customerPhone);
    updatePayload.customerPhone = normalizedPhone.local || data.customerPhone;
  }
  if (data.customerEmail !== undefined) {
    updatePayload.customerEmail = data.customerEmail ? data.customerEmail.trim() : null;
  }
  if (data.customerCi !== undefined) {
    updatePayload.customerCi = data.customerCi ? data.customerCi.trim() : null;
    updatePayload.ci = updatePayload.customerCi;
  } else if (data.ci !== undefined) {
    updatePayload.customerCi = data.ci ? data.ci.trim() : null;
    updatePayload.ci = updatePayload.customerCi;
  }
  if (data.customerAddress !== undefined) updatePayload.customerAddress = data.customerAddress;
  if (data.clientAddress !== undefined) {
    const rawClient = data.clientAddress ? data.clientAddress.trim() : null;
    if (!rawClient || !isConcatenatedShippingAddress(rawClient)) {
      updatePayload.clientAddress = rawClient;
    }
  }
  if (data.shippingAddress !== undefined) updatePayload.shippingAddress = data.shippingAddress ? data.shippingAddress.trim() : null;
  if (data.deliveryType !== undefined) updatePayload.deliveryType = data.deliveryType;
  if (data.items !== undefined) {
    updatePayload.items = typeof data.items === 'string' ? data.items : JSON.stringify(data.items);
  }
  if (data.returns !== undefined) {
    updatePayload.returns = Array.isArray(data.returns)
      ? data.returns
      : typeof data.returns === 'string'
      ? JSON.parse(data.returns)
      : [];
  }
  if (data.totalAmount !== undefined) {
    updatePayload.totalAmount = cleanNumericString(data.totalAmount, '0.00');
  }
  if (data.paymentMethod !== undefined) updatePayload.paymentMethod = data.paymentMethod;
  if (data.status !== undefined) updatePayload.status = data.status;
  if (data.paymentVoucher !== undefined) updatePayload.paymentVoucher = data.paymentVoucher;
  if (data.notes !== undefined) updatePayload.notes = data.notes;
  if (data.trackingNumber !== undefined) updatePayload.trackingNumber = data.trackingNumber;
  if (data.trackingCarrier !== undefined) updatePayload.trackingCarrier = data.trackingCarrier;
  if (data.trackingNotes !== undefined) updatePayload.trackingNotes = data.trackingNotes;
  if (data.fulfillmentStatus !== undefined) updatePayload.fulfillmentStatus = data.fulfillmentStatus;
  if (data.linkedPurchaseId !== undefined) updatePayload.linkedPurchaseId = data.linkedPurchaseId;
  if (data.linkedPurchaseNumber !== undefined) updatePayload.linkedPurchaseNumber = data.linkedPurchaseNumber;

  // Retrieve existing order to check status transitions & item differences
  let existingOrder: any = null;
  if (isPostgresConfigured()) {
    try {
      const [ord] = await db
        .select()
        .from(customerOrders)
        .where(eq(customerOrders.id, id))
        .limit(1);
      existingOrder = ord || null;
    } catch {}
  }
  if (!existingOrder) {
    const state = storage.getState();
    existingOrder = state.customerOrders.find((o) => o.id === id) || null;
  }

  if (existingOrder) {
    const prevStatus = existingOrder.status;
    const newStatus = data.status !== undefined ? data.status : prevStatus;

    // ERP State Machine Transition Enforcement
    if (newStatus !== prevStatus) {
      if (!isValidOrderStatusTransition(prevStatus, newStatus)) {
        throw new Error(getOrderStatusTransitionError(prevStatus, newStatus));
      }
      // Para pedidos con envío: El pedido debe estar en estado 'shipped' antes de pasar a 'delivered'
      if (!isPickupDeliveryOrder(existingOrder) && prevStatus === 'confirmed' && newStatus === 'delivered') {
        throw new Error(
          'Integridad de Datos ERP: Para pedidos con envío, el pedido debe pasar primero por el estado ENVIADO antes de registrarse como ENTREGADO.'
        );
      }
      if (newStatus === 'cancelled') {
        if (prevStatus === 'confirmed' || prevStatus === 'shipped' || prevStatus === 'delivered') {
          throw new Error(
            'Integridad de Datos ERP: Una venta no puede cancelarse cuando está confirmada y/o se encuentra entregada parcialmente.'
          );
        }
        if (isOrderPartiallyDelivered(existingOrder)) {
          throw new Error(
            'Integridad de Datos ERP: Una venta no puede cancelarse cuando se encuentra entregada parcialmente. Ya se han entregado unidades al cliente desde bodega.'
          );
        }
      }
    }

    // ERP Data Integrity Enforcement: Partially delivered orders cannot have delivered items removed or quantities reduced below delivered
    if (isOrderPartiallyDelivered(existingOrder) && data.items !== undefined) {
      const prevItems = safeParseOrderItems(existingOrder.items);
      const newItems = safeParseOrderItems(data.items);
      for (const prevIt of prevItems) {
        const prevDelivered = Number(prevIt.deliveredQuantity || 0);
        if (prevDelivered > 0) {
          const matchingNew = newItems.find(
            (ni: any) =>
              (ni.id && (ni.id === prevIt.id || ni.id === prevIt.inventoryItemId)) ||
              (ni.sku && ni.sku === prevIt.sku)
          );
          if (!matchingNew) {
            throw new Error(
              `Integridad de Datos ERP: El producto '${prevIt.name || prevIt.sku}' ya tiene ${prevDelivered} unidades entregadas al cliente y no puede ser eliminado de la venta.`
            );
          }
          if (Number(matchingNew.quantity) < prevDelivered) {
            throw new Error(
              `Integridad de Datos ERP: No se puede reducir la cantidad de '${prevIt.name || prevIt.sku}' a ${matchingNew.quantity} porque ya se entregaron ${prevDelivered} unidades al cliente.`
            );
          }
        }
      }
    }

    // ERP Data Integrity Enforcement: Inmutability of confirmed, terminal & in-transit orders
    const isConfirmedOrTerminal =
      prevStatus === 'confirmed' ||
      prevStatus === 'shipped' ||
      prevStatus === 'delivered' ||
      prevStatus === 'cancelled' ||
      isOrderPartiallyDelivered(existingOrder);

    if (isConfirmedOrTerminal) {
      const parseItems = (val: any) => {
        if (!val) return [];
        if (typeof val === 'string') {
          try { return JSON.parse(val); } catch { return []; }
        }
        return Array.isArray(val) ? val : [];
      };

      const existingItems = parseItems(existingOrder.items);
      let itemsChanged = false;
      if (data.items !== undefined) {
        const newItems = parseItems(data.items);
        if (newItems.length !== existingItems.length) {
          itemsChanged = true;
        } else {
          for (let i = 0; i < existingItems.length; i++) {
            const oldIt = existingItems[i];
            const newIt = newItems[i];
            const oldId = oldIt.inventoryItemId ?? oldIt.id;
            const newId = newIt.inventoryItemId ?? newIt.id;
            if (oldId !== newId) {
              itemsChanged = true;
              break;
            }
            if (Number(oldIt.quantity) !== Number(newIt.quantity)) {
              itemsChanged = true;
              break;
            }
            const oldPrice = Number(oldIt.salePrice ?? oldIt.price ?? 0);
            const newPrice = Number(newIt.salePrice ?? newIt.price ?? 0);
            if (Math.abs(oldPrice - newPrice) > 0.001) {
              itemsChanged = true;
              break;
            }
          }
        }
      }

      const totalChanged =
        data.totalAmount !== undefined &&
        Math.abs(Number(data.totalAmount) - Number(existingOrder.totalAmount || 0)) > 0.01;

      const paymentMethodChanged =
        data.paymentMethod !== undefined &&
        existingOrder.paymentMethod &&
        data.paymentMethod !== existingOrder.paymentMethod;

      if (itemsChanged || totalChanged || paymentMethodChanged) {
        let statusLabel = 'CONFIRMADO';
        if (prevStatus === 'shipped') statusLabel = 'DESPACHADO / EN TRÁNSITO';
        else if (prevStatus === 'delivered') statusLabel = 'ENTREGADO (CERRADO)';
        else if (prevStatus === 'cancelled') statusLabel = 'CANCELADO (ANULADO)';
        else if (isOrderPartiallyDelivered(existingOrder)) statusLabel = 'ENTREGADO PARCIALMENTE';

        throw new Error(
          `Integridad de Datos ERP: No se puede editar el pedido #${existingOrder.orderNumber || id} porque ya fue ${statusLabel}. Las ventas confirmadas son inmutables para proteger el inventario y balances contables.`
        );
      }
    }

    const wasFinalized = isFinalizedSaleStatus(prevStatus);
    const isNowFinalized = isFinalizedSaleStatus(newStatus);

    let wasSuppliedByReservedPurchase = false;
    try {
      const allPurchases = await getPurchases(existingOrder.userId);
      const linkedP = existingOrder.linkedPurchaseId ? allPurchases.find((p) => p.id === existingOrder.linkedPurchaseId) : null;
      wasSuppliedByReservedPurchase = Boolean(linkedP && linkedP.status === 'received');
    } catch {}

    if (!wasFinalized && isNowFinalized) {
      // Transitioning to finalized sale
      if (!wasSuppliedByReservedPurchase) {
        const itemsToDeduct = data.items !== undefined ? data.items : existingOrder.items;
        await adjustInventoryStockForItems(itemsToDeduct, -1);
      }
    } else if (wasFinalized && !isNowFinalized) {
      // Transitioning away from finalized sale
      if (!wasSuppliedByReservedPurchase) {
        await adjustInventoryStockForItems(existingOrder.items, 1);
      }
    }

    if (newStatus === 'shipped' && prevStatus !== 'shipped') {
      // Comprobar que el pedido esté confirmado para poder enviar el pedido
      if (existingOrder.status !== 'confirmed') {
        throw new Error(
          `Bloqueo: El pedido #${existingOrder.orderNumber} debe estar confirmado para poder ser marcado como ENVIADO.`
        );
      }
    }

    if (newStatus === 'delivered' && prevStatus !== 'delivered') {
      // Verificación ERP: Si el pedido fue solicitado bajo pedido / sin stock con compra a proveedor vinculada,
      // NO puede pasar a estado ENTREGADO mientras no se confirme la compra y recepción física del proveedor en bodega
      // (a menos que se suministre bypassSupplierBlock o todos los ítems ya hayan sido físicamente entregados/despachados).
      let rawCurrentItems = safeParseOrderItems(data.items !== undefined ? data.items : existingOrder.items);
      if (rawCurrentItems.length === 0) {
        try {
          const state = storage.getState();
          const linkedP = (state.purchases || []).find(
            (p: any) => (existingOrder.linkedPurchaseId && p.id === existingOrder.linkedPurchaseId) || p.linkedCustomerOrderId === id
          );
          if (linkedP && linkedP.items) {
            rawCurrentItems = safeParseOrderItems(linkedP.items);
          }
        } catch {}
      }

      const isAllItemsPhysicallyDelivered =
        rawCurrentItems.length > 0 &&
        rawCurrentItems.every(
          (it: any) =>
            Number(it.deliveredQuantity || 0) >= Number(it.quantity || 1) &&
            Number(it.pendingQuantity || 0) === 0
        );

      if (!data.bypassSupplierBlock && !isAllItemsPhysicallyDelivered) {
        try {
          const allPurchases = await getPurchases(existingOrder.userId);
          const linkedP = allPurchases.find(
            (p) =>
              ((existingOrder.linkedPurchaseId && p.id === existingOrder.linkedPurchaseId) ||
                p.linkedCustomerOrderId === id) &&
              p.status !== 'cancelled'
          );

          if (linkedP && linkedP.status !== 'received') {
            throw new Error(
              `Bloqueo ERP: Este pedido fue registrado sin stock (bajo encargo) y tiene la orden de compra a proveedor #${
                linkedP.purchaseNumber || linkedP.id
              } en estado '${linkedP.status}'. No puede pasar a estado ENTREGADO hasta que se confirme la compra y recepción de la mercadería del proveedor en el módulo de Compras.`
            );
          }

          if (
            existingOrder.fulfillmentStatus === 'supplier_pending' ||
            existingOrder.fulfillmentStatus === 'supplier_ordered' ||
            existingOrder.fulfillmentStatus === 'awaiting_procurement'
          ) {
            throw new Error(
              `Bloqueo ERP: Este pedido se encuentra en espera de mercadería de proveedor (${existingOrder.fulfillmentStatus}). Debe confirmar la recepción física del proveedor en Compras antes de marcar el pedido como ENTREGADO.`
            );
          }
        } catch (checkErr: any) {
          if (checkErr.message?.startsWith('Bloqueo ERP:')) {
            throw checkErr;
          }
        }
      }

      if (rawCurrentItems.length > 0 && updatePayload.items === undefined) {
        const deliveredItems = rawCurrentItems.map((it: any) => {
          const qty = Number(it.quantity || 1);
          return {
            ...it,
            deliveredQuantity: qty,
            pendingQuantity: 0,
            deficitQuantity: 0,
          };
        });
        updatePayload.items = JSON.stringify(deliveredItems);
      }
      if (updatePayload.fulfillmentStatus === undefined) {
        updatePayload.fulfillmentStatus = 'delivered';
      }
      updatePayload.verifiedExisted = true;
      updatePayload.deliveryVerifiedAt = new Date().toISOString();
      updatePayload.deliveredAt = new Date().toISOString();
    }

    // =========================================================================
    // Sincronización con Órdenes a Proveedores (Regla ERP Multi-Proveedor):
    // Cuando se edita el pedido del cliente y se cambian los productos o sus
    // cantidades, se debe sincronizar automáticamente la cantidad requerida en la
    // orden de compra del proveedor correspondiente de acuerdo a cada producto.
    // REGLA CRÍTICA ERP: Si el pedido de venta ya está entregado o se está marcando
    // como ENTREGADO ('delivered'), NUNCA se deben generar ni regenerar órdenes de compra.
    // =========================================================================
    if (data.items !== undefined) {
      try {
        const updatedOrderItems: any[] = Array.isArray(data.items)
          ? data.items
          : typeof data.items === 'string'
          ? JSON.parse(data.items)
          : [];

        const isOrderDeliveredOrClosed =
          newStatus === 'delivered' ||
          prevStatus === 'delivered' ||
          data.status === 'delivered' ||
          existingOrder.status === 'delivered' ||
          data.fulfillmentStatus === 'delivered' ||
          existingOrder.fulfillmentStatus === 'delivered' ||
          newStatus === 'cancelled';

        if (isOrderDeliveredOrClosed && newStatus !== 'cancelled') {
          updatePayload.fulfillmentStatus = 'delivered';
        }

        const currentInventory = await getInventoryItems(existingOrder.userId);
        const suppliersList = await getSuppliers(existingOrder.userId);
        const allPurchases = await getPurchases(existingOrder.userId);

        // Encontrar todas las órdenes de compra activas vinculadas a este pedido de cliente
        const linkedPurchases = allPurchases.filter(
          (p) =>
            (p.linkedCustomerOrderId === id ||
              (existingOrder.linkedPurchaseId && p.id === existingOrder.linkedPurchaseId) ||
              (existingOrder.linkedPurchaseNumber && String(existingOrder.linkedPurchaseNumber).includes(p.purchaseNumber)) ||
              (Array.isArray(p.items) &&
                p.items.some(
                  (it: any) =>
                    it.customerOrderId === id ||
                    (it.orderNumber && String(it.orderNumber).trim() === String(existingOrder.orderNumber).trim())
                ))) &&
            p.status !== 'cancelled' &&
            p.status !== 'received'
        );

        // Solo procesamos la sincronización si el pedido NO está entregado/cerrado
        // Y si el pedido ya tenía compras vinculadas o requiere abastecimiento
        const allItemsAlreadyDelivered =
          updatedOrderItems.length > 0 &&
          updatedOrderItems.every(
            (it: any) =>
              Number(it.deliveredQuantity || 0) >= Number(it.quantity || 1) &&
              Number(it.pendingQuantity || 0) === 0
          );

        const shouldSyncPurchases =
          !isOrderDeliveredOrClosed &&
          !allItemsAlreadyDelivered &&
          (linkedPurchases.length > 0 ||
            existingOrder.fulfillmentStatus === 'supplier_pending' ||
            existingOrder.fulfillmentStatus === 'supplier_ordered' ||
            existingOrder.linkedPurchaseId ||
            existingOrder.linkedPurchaseNumber);

        // Agrupar los ítems con déficit por su proveedor correspondiente
        const deficitItemsBySupplier = new Map<
          string,
          {
            supplierName: string;
            supplierContact: string;
            items: any[];
          }
        >();

        // También reconstruimos los items del pedido con su stock y déficit actualizados
        const processedOrderItems: any[] = [];
        let totalAllDeficitUnits = 0;

        for (const oItem of updatedOrderItems) {
          const isCustom = oItem.sku === 'CUSTOM';
          const invItem = isCustom
            ? null
            : currentInventory.find(
                (inv) =>
                  inv.id === oItem.id ||
                  inv.id === oItem.inventoryItemId ||
                  (inv.sku && oItem.sku && inv.sku.toLowerCase() === oItem.sku.toLowerCase()) ||
                  (inv.name && oItem.name && inv.name.trim().toLowerCase() === oItem.name.trim().toLowerCase())
              );

          const currentStock = invItem ? Math.max(0, Number(invItem.stock || 0)) : 0;
          const requestedQty = Math.max(0, Number(oItem.quantity || 0));
          const stockInWarehouse = isCustom ? 0 : currentStock;

          // Si el pedido está entregado o cerrándose, todas las unidades están entregadas y déficit es 0
          const itemDeliveredQty = isOrderDeliveredOrClosed
            ? requestedQty
            : (oItem.deliveredQuantity !== undefined ? Number(oItem.deliveredQuantity) : 0);
          const itemPendingQty = isOrderDeliveredOrClosed
            ? 0
            : (oItem.pendingQuantity !== undefined ? Number(oItem.pendingQuantity) : Math.max(0, requestedQty - itemDeliveredQty));

          let missingQty = 0;
          if (!isOrderDeliveredOrClosed && itemPendingQty > 0) {
            missingQty = isCustom ? itemPendingQty : Math.max(0, itemPendingQty - stockInWarehouse);
          }

          totalAllDeficitUnits += missingQty;

          // Determinar costo unitario
          const itemCostPrice = invItem
            ? Number(invItem.costPrice || (Number(invItem.salePrice || 0) * 0.7) || 0)
            : Number(oItem.costPrice || (Number(oItem.salePrice || 0) * 0.7) || 0);

          // Determinar proveedor correspondiente al producto
          let rawSupplier =
            oItem.supplierName ||
            (invItem as any)?.supplierName ||
            (invItem as any)?.supplier ||
            (invItem as any)?.channelTitle ||
            '';

          if (!rawSupplier && suppliersList.length > 0) {
            // Intentar emparejar por coincidencia o usar el primer proveedor si no se especificó otro
            const foundSup = suppliersList.find((s) =>
              invItem?.category && s.name.toLowerCase().includes(invItem.category.toLowerCase())
            );
            if (foundSup) {
              rawSupplier = foundSup.name;
            }
          }

          // Si el producto ya existía en alguna compra vinculada anterior, reutilizar ese proveedor
          if (!rawSupplier && linkedPurchases.length > 0) {
            for (const lp of linkedPurchases) {
              const lpItems = Array.isArray(lp.items) ? lp.items : [];
              const matched = lpItems.find(
                (it: any) =>
                  it.sku === oItem.sku ||
                  it.name === oItem.name ||
                  it.inventoryItemId === oItem.inventoryItemId ||
                  it.inventoryItemId === oItem.id
              );
              if (matched && lp.supplierName) {
                rawSupplier = lp.supplierName;
                break;
              }
            }
          }

          if (!rawSupplier) {
            rawSupplier = 'Proveedor Principal';
          }

          // Normalizar nombre y contacto del proveedor
          const matchedSupplier = suppliersList.find(
            (s) =>
              s.name.trim().toLowerCase() === rawSupplier.trim().toLowerCase() ||
              (s.tradeName && s.tradeName.trim().toLowerCase() === rawSupplier.trim().toLowerCase())
          );
          const finalSupplierName = matchedSupplier?.name || rawSupplier.trim() || 'Proveedor Principal';
          const finalSupplierContact = matchedSupplier?.phone || matchedSupplier?.contact || '';

          processedOrderItems.push({
            ...oItem,
            inventoryItemId: invItem ? invItem.id : (isCustom ? undefined : (oItem.inventoryItemId || oItem.id)),
            sku: oItem.sku || invItem?.sku || '',
            name: oItem.name || invItem?.name || 'Producto',
            quantity: requestedQty,
            deliveredQuantity: itemDeliveredQty,
            pendingQuantity: itemPendingQty,
            stockAvailable: stockInWarehouse,
            deficitQuantity: missingQty,
            costPrice: itemCostPrice.toFixed(2),
            salePrice: oItem.salePrice !== undefined ? oItem.salePrice : (invItem?.salePrice || '0.00'),
            supplierName: finalSupplierName,
          });

          // Si requiere unidades del proveedor (missingQty > 0) y la cantidad pedida > 0:
          if (missingQty > 0 && requestedQty > 0 && !isOrderDeliveredOrClosed) {
            const groupKey = finalSupplierName.trim().toLowerCase();
            if (!deficitItemsBySupplier.has(groupKey)) {
              deficitItemsBySupplier.set(groupKey, {
                supplierName: finalSupplierName,
                supplierContact: finalSupplierContact,
                items: [],
              });
            }

            deficitItemsBySupplier.get(groupKey)!.items.push({
              inventoryItemId: invItem ? invItem.id : (isCustom ? undefined : (oItem.inventoryItemId || oItem.id)),
              name: oItem.name || invItem?.name || 'Producto bajo pedido',
              sku: oItem.sku || invItem?.sku || '',
              barcode: oItem.barcode || (invItem as any)?.barcode || undefined,
              costPrice: itemCostPrice.toFixed(2),
              salePrice: oItem.salePrice,
              quantity: missingQty, // CANTIDAD EXACTA FALTANTE PARA ESTE PROVEEDOR
              requestedInOrder: requestedQty,
              availableInWarehouse: stockInWarehouse,
              deliveredFromWarehouse: itemDeliveredQty,
              imageUrl: oItem.imageUrl || invItem?.imageUrl || null,
              supplierName: finalSupplierName,
              customerOrderId: id,
              orderNumber: existingOrder.orderNumber,
              customerName: data.customerName || existingOrder.customerName,
            });
          }
        }

        // Actualizar el payload de items del pedido con los metadatos completos y actualizados
        updatePayload.items = JSON.stringify(processedOrderItems);

        // Si corresponde sincronizar con las órdenes de compra a proveedores:
        if (shouldSyncPurchases && !isOrderDeliveredOrClosed && newStatus !== 'cancelled') {
          if (deficitItemsBySupplier.size === 0) {
            // Caso: Todos los productos tienen stock suficiente o fueron eliminados
            for (const lp of linkedPurchases) {
              if (lp.status !== 'received') {
                await updatePurchase(lp.id, {
                  status: 'cancelled',
                  notes:
                    (lp.notes ? lp.notes + '\n' : '') +
                    `[Cancelada automáticamente ${new Date().toLocaleDateString('es-EC')}]: Ya no hay productos bajo pedido para ${lp.supplierName} en el Pedido #${existingOrder.orderNumber}.`,
                  isInternalOrderSync: true,
                } as any);
              }
            }
            updatePayload.linkedPurchaseId = null;
            updatePayload.linkedPurchaseNumber = null;
            updatePayload.fulfillmentStatus = 'in_stock';
          } else {
            // Caso: Hay productos bajo pedido agrupados por su proveedor respectivo
            const usedPurchaseIds = new Set<number>();
            const resultingActivePurchases: any[] = [];

            for (const group of deficitItemsBySupplier.values()) {
              const groupItems = group.items;
              const groupUnits = groupItems.reduce((acc, it) => acc + Number(it.quantity || 1), 0);
              const groupCost = groupItems.reduce(
                (acc, it) => acc + Number(it.costPrice || 0) * Number(it.quantity || 1),
                0
              );

              // 1. Buscar si ya existe una orden de compra vinculada a este proveedor específico
              let existingForSupplier = linkedPurchases.find(
                (p) =>
                  !usedPurchaseIds.has(p.id) &&
                  p.supplierName &&
                  p.supplierName.trim().toLowerCase() === group.supplierName.trim().toLowerCase()
              );

              // Si solo hay 1 grupo y 1 compra vinculada sin match exacto de nombre, reutilizarla
              if (
                !existingForSupplier &&
                deficitItemsBySupplier.size === 1 &&
                linkedPurchases.length === 1 &&
                !usedPurchaseIds.has(linkedPurchases[0].id)
              ) {
                existingForSupplier = linkedPurchases[0];
              }

              let finalPurchase: any = null;
              if (existingForSupplier) {
                usedPurchaseIds.add(existingForSupplier.id);
                finalPurchase = await updatePurchase(existingForSupplier.id, {
                  supplierName: group.supplierName,
                  supplierContact: group.supplierContact || existingForSupplier.supplierContact || '',
                  items: groupItems,
                  totalCost: groupCost.toFixed(2),
                  notes:
                    `Orden de Compra para ${group.supplierName} vinculada al Pedido #${existingOrder.orderNumber} ` +
                    `(${data.customerName || existingOrder.customerName}) - Surtido de ${groupUnits} unidades actualizadas`,
                  isInternalOrderSync: true,
                } as any);
                if (!finalPurchase) {
                  finalPurchase = { ...existingForSupplier, items: groupItems, totalCost: groupCost.toFixed(2) };
                }
              } else if (!isOrderDeliveredOrClosed && newStatus !== 'cancelled') {
                // Si este proveedor no tenía orden previa, crear una orden para este proveedor
                const purchaseResult = await createPurchase({
                  userId: existingOrder.userId || 1,
                  supplierName: group.supplierName,
                  supplierContact: group.supplierContact || '',
                  items: groupItems,
                  totalCost: groupCost.toFixed(2),
                  status: 'pending',
                  paymentStatus: 'unpaid',
                  linkedCustomerOrderId: id,
                  linkedCustomerOrderNumber: existingOrder.orderNumber,
                  notes:
                    `Generado automáticamente para ${group.supplierName} desde Pedido de Cliente #${existingOrder.orderNumber} ` +
                    `para ${data.customerName || existingOrder.customerName} (${data.customerPhone || existingOrder.customerPhone}) - Surtido de ${groupUnits} unidades`,
                });
                finalPurchase = purchaseResult.purchase;
              }

              if (finalPurchase) {
                resultingActivePurchases.push(finalPurchase);
              }
            }

            // Cancelar órdenes de compra de proveedores cuyos productos ya no están en el pedido
            for (const unusedP of linkedPurchases) {
              if (!usedPurchaseIds.has(unusedP.id) && unusedP.status !== 'received') {
                await updatePurchase(unusedP.id, {
                  status: 'cancelled',
                  notes:
                    (unusedP.notes ? unusedP.notes + '\n' : '') +
                    `[Cancelada automáticamente ${new Date().toLocaleDateString('es-EC')}]: Ya no hay productos bajo pedido para ${unusedP.supplierName} en el Pedido #${existingOrder.orderNumber}.`,
                  isInternalOrderSync: true,
                } as any);
              }
            }

            // Sincronizar identificadores y notas en el pedido de cliente
            const firstPurchase = resultingActivePurchases[0] || null;
            const purchaseNumbers = resultingActivePurchases
              .map((p) => p.purchaseNumber || `OC-${p.id}`)
              .filter(Boolean)
              .join(', ');

            const summaryBreakdown = resultingActivePurchases
              .map((p) => `#${p.purchaseNumber || p.id} (${p.supplierName}: ${p.items?.length || 0} prod.)`)
              .join(', ');

            updatePayload.fulfillmentStatus = 'supplier_pending';
            updatePayload.linkedPurchaseId = firstPurchase ? firstPurchase.id : null;
            updatePayload.linkedPurchaseNumber = purchaseNumbers;

            const rawNotes = updatePayload.notes !== undefined ? updatePayload.notes : existingOrder.notes;
            const baseNotes = (rawNotes ? String(rawNotes) : '').trim();
            const cleanBaseNotes = baseNotes
              .split('\n')
              .filter(
                (l: string) =>
                  !l.includes('[Bajo Pedido]') &&
                  !l.includes('[Abastecimiento') &&
                  !l.includes('[Abastecimiento por Proveedor]')
              )
              .join('\n')
              .trim();

            const syncNote = `[Abastecimiento por Proveedor] 🔍 ${resultingActivePurchases.length} ${
              resultingActivePurchases.length === 1 ? 'orden actualizada' : 'órdenes actualizadas por proveedor'
            }: ${summaryBreakdown} (${totalAllDeficitUnits} un. faltantes en total)`;

            updatePayload.notes = cleanBaseNotes ? `${cleanBaseNotes}\n${syncNote}` : syncNote;
          }
        }
      } catch (syncErr) {
        console.warn('Could not sync item quantities to linked purchase order(s):', syncErr);
      }
    }

    // Auto-confirm linked purchase order when sale transitions to confirmed
    if (newStatus === 'confirmed' && prevStatus !== 'confirmed') {
      try {
        const allPurchases = await getPurchases(existingOrder.userId);
        let linkedP = existingOrder.linkedPurchaseId
          ? allPurchases.find((p) => p.id === existingOrder.linkedPurchaseId)
          : null;
        if (!linkedP) {
          linkedP = allPurchases.find(
            (p) => p.linkedCustomerOrderId === id && p.status !== 'received' && p.status !== 'cancelled'
          );
        }

        if (linkedP && linkedP.status === 'pending') {
          const confirmedPurchase = await updatePurchase(linkedP.id, {
            status: 'ordered',
            paymentStatus: 'paid',
            notes: (linkedP.notes ? linkedP.notes + '\n' : '') + `[Confirmación Automática] Compra #${linkedP.purchaseNumber} confirmada con el proveedor al confirmarse el Pedido de Venta #${existingOrder.orderNumber}.`,
          });
          if (confirmedPurchase) {
            updatePayload.linkedPurchaseId = confirmedPurchase.id;
            updatePayload.linkedPurchaseNumber = confirmedPurchase.purchaseNumber;
            if (!updatePayload.fulfillmentStatus || updatePayload.fulfillmentStatus === 'supplier_pending') {
              updatePayload.fulfillmentStatus = 'supplier_ordered';
            }
          }
        }
      } catch (autoConfirmErr) {
        console.warn('Could not auto-confirm purchase in updateCustomerOrder:', autoConfirmErr);
      }
    }

    // Automatic cancellation of linked purchase orders upon order cancellation (unless kept)
    if (newStatus === 'cancelled') {
      const effectivePurchaseAction = data.purchaseAction || 'cancel';
      try {
        const allPurchases = await getPurchases(existingOrder.userId);
        const linkedList = allPurchases.filter(
          (p) =>
            (existingOrder.linkedPurchaseId && p.id === existingOrder.linkedPurchaseId) ||
            p.linkedCustomerOrderId === id ||
            (existingOrder.linkedPurchaseNumber && String(existingOrder.linkedPurchaseNumber).includes(p.purchaseNumber)) ||
            (p.linkedCustomerOrderNumber && String(p.linkedCustomerOrderNumber).trim() === String(existingOrder.orderNumber).trim()) ||
            (Array.isArray(p.items) &&
              p.items.some(
                (it: any) =>
                  it.customerOrderId === id ||
                  (it.orderNumber && String(it.orderNumber).trim() === String(existingOrder.orderNumber).trim())
              ))
        );

        for (const linkedP of linkedList) {
          if (linkedP.status !== 'received' && linkedP.status !== 'cancelled') {
            if (effectivePurchaseAction === 'cancel') {
              if (linkedP.status === 'pending') {
                await deletePurchase(linkedP.id, true);
              } else {
                await updatePurchase(linkedP.id, {
                  status: 'cancelled',
                  linkedCustomerOrderId: null,
                  linkedCustomerOrderNumber: null,
                  notes: (linkedP.notes ? linkedP.notes + '\n' : '') + `[Orden de compra cancelada automáticamente al cancelar el Pedido #${existingOrder.orderNumber}]`,
                });
              }
            } else if (effectivePurchaseAction === 'keep') {
              let cleanedItems = linkedP.items || [];
              if (Array.isArray(cleanedItems)) {
                cleanedItems = cleanedItems.map((it: any) => ({
                  ...it,
                  customerOrderId: null,
                  orderNumber: null,
                  customerName: null,
                }));
              }
              await updatePurchase(linkedP.id, {
                items: cleanedItems,
                linkedCustomerOrderId: null,
                linkedCustomerOrderNumber: null,
                notes: (linkedP.notes ? linkedP.notes + '\n' : '') + `[Desvinculada del Pedido #${existingOrder.orderNumber} por cancelación. Conservada para reposición de stock general en bodega]`,
              });
            }
          }
        }
        if (linkedList.length > 0) {
          updatePayload.linkedPurchaseId = null;
          updatePayload.linkedPurchaseNumber = null;
          updatePayload.fulfillmentStatus = 'in_stock';
        }
      } catch (pErr) {
        console.warn('Could not handle linked purchase on order update cancel:', pErr);
      }
    }
  }

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const ord = state.customerOrders.find((o) => o.id === id);
    if (!ord) throw new Error('Order not found');
    Object.assign(ord, updatePayload);
    storage.save();
    try {
      await upsertCustomerFromOrder(ord);
    } catch {}
    return {
      ...ord,
      items: safeParseOrderItems(ord.items) as any,
    };
  }

  try {
    const result = await db
      .update(customerOrders)
      .set(updatePayload)
      .where(eq(customerOrders.id, id))
      .returning();

    if (!result[0]) {
      throw new Error('Order not found');
    }

    const state = storage.getState();
    const localOrd = state.customerOrders.find((o) => o.id === id);
    if (localOrd) {
      Object.assign(localOrd, updatePayload);
      storage.save();
    }

    try {
      await upsertCustomerFromOrder({
        ...result[0],
        clientAddress: data.clientAddress !== undefined ? data.clientAddress : (localOrd as any)?.clientAddress,
        shippingAddress: data.shippingAddress !== undefined ? data.shippingAddress : ((localOrd as any)?.shippingAddress || result[0].customerAddress),
      });
    } catch {}

    return {
      ...result[0],
      items: safeParseOrderItems(result[0].items) as any,
    };
  } catch (error) {
    console.warn('Error updating customer order in SQL, fallback to local store:', error);
    const state = storage.getState();
    const ord = state.customerOrders.find((o) => o.id === id);
    if (ord) {
      Object.assign(ord, updatePayload);
      storage.save();
      try {
        await upsertCustomerFromOrder(ord);
      } catch {}
      return {
        ...ord,
        items: safeParseOrderItems(ord.items) as any,
      };
    }
    throw error;
  }
}

export async function deleteCustomerOrder(id: number, purchaseAction?: 'cancel' | 'keep') {
  // If the order was in a finalized state, restore inventory stock before deleting
  let existingOrder: any = null;
  if (isPostgresConfigured()) {
    try {
      const [ord] = await db
        .select()
        .from(customerOrders)
        .where(eq(customerOrders.id, id))
        .limit(1);
      existingOrder = ord || null;
    } catch {}
  }
  if (!existingOrder) {
    const state = storage.getState();
    existingOrder = state.customerOrders.find((o) => o.id === id) || null;
  }

  if (existingOrder) {
    if (existingOrder.status === 'delivered') {
      throw new Error('Integridad de Datos ERP: Los pedidos entregados y cerrados no se pueden eliminar.');
    }
    if (existingOrder.status === 'confirmed' || existingOrder.status === 'shipped') {
      throw new Error(
        'Integridad de Datos ERP: Una venta no puede borrarse cuando está confirmada y/o se encuentra entregada parcialmente.'
      );
    }
    if (isOrderPartiallyDelivered(existingOrder)) {
      throw new Error(
        'Integridad de Datos ERP: Una venta no puede borrarse cuando se encuentra entregada parcialmente. Ya se han despachado unidades al cliente desde bodega.'
      );
    }
  }

  if (existingOrder && isFinalizedSaleStatus(existingOrder.status)) {
    let wasSuppliedByReservedPurchase = false;
    try {
      const allPurchases = await getPurchases(existingOrder.userId);
      const linkedP = existingOrder.linkedPurchaseId ? allPurchases.find((p) => p.id === existingOrder.linkedPurchaseId) : null;
      wasSuppliedByReservedPurchase = Boolean(linkedP && linkedP.status === 'received');
    } catch {}

    if (!wasSuppliedByReservedPurchase) {
      await adjustInventoryStockForItems(existingOrder.items, 1);
    }
  }

  // Eliminación automática de TODAS las órdenes de compra al proveedor asociadas a esta venta:
  // "si se elimina el pedido de ventas tambien se eliminen todas las ordenes de compras al proveedor vinculadas a esa venta"
  if (existingOrder) {
    try {
      const allPurchases = await getPurchases(existingOrder.userId);
      const linkedPurchasesMap = new Map<number, any>();

      // 1. Check from getPurchases
      allPurchases.forEach((p) => {
        const isMatch =
          (existingOrder.linkedPurchaseId && p.id === existingOrder.linkedPurchaseId) ||
          p.linkedCustomerOrderId === id ||
          (existingOrder.linkedPurchaseNumber && String(existingOrder.linkedPurchaseNumber).includes(p.purchaseNumber)) ||
          (p.linkedCustomerOrderNumber && String(p.linkedCustomerOrderNumber).trim() === String(existingOrder.orderNumber).trim()) ||
          (Array.isArray(p.items) &&
            p.items.some(
              (it: any) =>
                it.customerOrderId === id ||
                (it.orderNumber && String(it.orderNumber).trim() === String(existingOrder.orderNumber).trim())
            ));

        if (isMatch) {
          linkedPurchasesMap.set(p.id, p);
        }
      });

      // 2. Also check SQL database directly if configured
      if (isPostgresConfigured()) {
        try {
          const sqlPurchases = await db
            .select()
            .from(purchases)
            .where(eq(purchases.linkedCustomerOrderId, id));
          sqlPurchases.forEach((sp: any) => linkedPurchasesMap.set(sp.id, sp));
        } catch {}
      }

      // 3. Also check local storage state directly
      const state = storage.getState();
      (state.purchases || []).forEach((lp: any) => {
        if (
          lp.linkedCustomerOrderId === id ||
          (existingOrder.linkedPurchaseId && lp.id === existingOrder.linkedPurchaseId) ||
          (existingOrder.linkedPurchaseNumber && String(existingOrder.linkedPurchaseNumber).includes(lp.purchaseNumber)) ||
          (lp.linkedCustomerOrderNumber && String(lp.linkedCustomerOrderNumber).trim() === String(existingOrder.orderNumber).trim())
        ) {
          linkedPurchasesMap.set(lp.id, lp);
        }
      });

      const linkedList = Array.from(linkedPurchasesMap.values());

      for (const linkedP of linkedList) {
        if (purchaseAction === 'keep') {
          let cleanedItems = linkedP.items || [];
          if (Array.isArray(cleanedItems)) {
            cleanedItems = cleanedItems.map((it: any) => ({
              ...it,
              customerOrderId: null,
              orderNumber: null,
              customerName: null,
            }));
          }
          await updatePurchase(linkedP.id, {
            items: cleanedItems,
            linkedCustomerOrderId: null,
            linkedCustomerOrderNumber: null,
            notes:
              (linkedP.notes ? linkedP.notes + '\n' : '') +
              `[Desvinculada del Pedido #${existingOrder.orderNumber} por eliminación. Conservada para reposición de stock general en bodega]`,
          });
        } else {
          // Eliminación automática directa de TODAS las órdenes de compra generadas por este pedido de venta
          await deletePurchase(linkedP.id, true);
        }
      }
    } catch (pErr) {
      console.warn('Could not handle linked purchases on order deletion:', pErr);
    }
  }

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const idx = state.customerOrders.findIndex((o) => o.id === id);
    let deleted = null;
    if (idx !== -1) {
      deleted = state.customerOrders.splice(idx, 1)[0];
      storage.save();
    }
    return { success: true, deleted };
  }

  try {
    const result = await db
      .delete(customerOrders)
      .where(eq(customerOrders.id, id))
      .returning();

    const state = storage.getState();
    const idx = state.customerOrders.findIndex((o) => o.id === id);
    if (idx !== -1) {
      state.customerOrders.splice(idx, 1);
      storage.save();
    }

    return { success: true, deleted: result[0] || null };
  } catch (error) {
    console.warn('Error deleting customer order from SQL, fallback:', error);
    const state = storage.getState();
    const idx = state.customerOrders.findIndex((o) => o.id === id);
    let deleted = null;
    if (idx !== -1) {
      deleted = state.customerOrders.splice(idx, 1)[0];
      storage.save();
    }
    return { success: true, deleted };
  }
}

// ----------------------------------------------------
// CUSTOMERS MANAGEMENT & CRM SYSTEM
// ----------------------------------------------------

export function isConcatenatedShippingAddress(addr?: string | null): boolean {
  if (!addr || typeof addr !== 'string') return false;
  const clean = addr.trim();
  if (!clean) return false;

  // Detect prefixes like "Provincia:", "Prov:", "Cantón:", "Canton:", "Parroquia:", "Parr:", "Dir:", "Ref:", etc.
  const hasTag = /(?:provincia|prov\.|prov|cant[oó]n|ciudad|can\.|can|parroquia|parr\.|parr|par\.|par|direcci[oó]n|direccion|calles|calle|dir\.|dir|referencia|ref\.|ref)[\s:]+/i.test(clean);
  const hasPipes = clean.includes('|') && (
    /prov/i.test(clean) || /cant/i.test(clean) || /parr/i.test(clean) || /dir/i.test(clean) || /ciudad/i.test(clean)
  );
  const isPickup = clean.toLowerCase().startsWith('retiro en local');

  return hasTag || hasPipes || isPickup;
}

export function parseCustomerShippingData(addressStr?: string | null, fallbackCi?: string | null) {
  let province = '';
  let canton = '';
  let parish = '';
  let exactAddress = '';
  let reference = '';
  let ci = (fallbackCi || '').trim();

  if (!addressStr || typeof addressStr !== 'string') {
    return { province, canton, parish, exactAddress, reference, ci };
  }

  const lines = addressStr.split(/[\n|]/).map((l) => l.trim()).filter(Boolean);
  const unparsedLines: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith('provincia:') || lower.startsWith('prov.:') || lower.startsWith('prov:')) {
      province = line.replace(/^(provincia|prov\.|prov):/i, '').trim();
    } else if (lower.startsWith('cantón:') || lower.startsWith('canton:') || lower.startsWith('ciudad:') || lower.startsWith('can.:') || lower.startsWith('can:')) {
      canton = line.replace(/^(cantón|canton|ciudad|can\.|can):/i, '').trim();
    } else if (lower.startsWith('parroquia:') || lower.startsWith('parr.:') || lower.startsWith('parr:') || lower.startsWith('par.:') || lower.startsWith('par:')) {
      parish = line.replace(/^(parroquia|parr\.|parr|par\.|par):/i, '').trim();
    } else if (lower.startsWith('dirección:') || lower.startsWith('direccion:') || lower.startsWith('calles:') || lower.startsWith('calle:') || lower.startsWith('dir.:') || lower.startsWith('dir:')) {
      exactAddress = line.replace(/^(dirección|direccion|calles|calle|dir\.|dir):/i, '').trim();
    } else if (lower.startsWith('referencia:') || lower.startsWith('ref.:') || lower.startsWith('ref:')) {
      reference = line.replace(/^(referencia|ref\.|ref):/i, '').trim();
    } else if (lower.startsWith('cédula:') || lower.startsWith('cedula:') || lower.startsWith('ci:') || lower.startsWith('ruc:')) {
      if (!ci) {
        ci = line.replace(/^(cédula|cedula|ci|ruc):/i, '').trim();
      }
    } else if (!lower.startsWith('retiro en local')) {
      unparsedLines.push(line);
    }
  }

  if (!exactAddress && unparsedLines.length > 0) {
    exactAddress = unparsedLines.join(', ');
  }

  // Strip any lingering field prefixes from exactAddress
  if (exactAddress) {
    exactAddress = exactAddress.replace(/^(dirección|direccion|calles|calle|dir\.|dir):/i, '').trim();
  }

  return { province, canton, parish, exactAddress, reference, ci };
}

/**
 * Automatically upserts a customer record when an order is created, modified or confirmed.
 */
export async function upsertCustomerFromOrder(order: any, preferredUserId?: number) {
  if (!order || !order.customerPhone) return null;

  // Do not register/upsert if order was cancelled
  const orderStatus = (order.status || '').toLowerCase().trim();
  if (orderStatus === 'cancelled') {
    return null;
  }

  const rawCi = order.customerCi || order.ci || '';
  const parsed = parseCustomerShippingData(order.customerAddress, rawCi);
  const cleanName = (order.customerName || 'Cliente').trim();
  const resolvedCi = (parsed.ci || (rawCi ? String(rawCi).trim() : null));
  const cleanEmail = (order.customerEmail || order.email || '').trim() || null;

  // Regla estricta de negocio:
  // Cuando se genera un pedido de venta por la tienda online, NO se debe guardar al cliente
  // en la base de datos hasta que tenga su cédula ecuatoriana válida.
  // Esto previene que se generen registros incompletos o duplicados en el listado de clientes.
  const isOnlineStoreOrder = Boolean(
    order.isOnlineStore ||
    order.source === 'online_store' ||
    (typeof order.notes === 'string' && order.notes.includes('[Tienda Online]'))
  );

  if (isOnlineStoreOrder) {
    if (!resolvedCi) {
      return null;
    }
    const ciVal = validateEcuadorId(resolvedCi, true);
    if (!ciVal.isValid) {
      return null;
    }
  }

  const phoneNorm = normalizeEcuadorPhone(order.customerPhone);
  const cleanPhone = phoneNorm.formattedInternational || phoneNorm.e164 || order.customerPhone.trim();
  const phoneDigits = phoneNorm.digits || cleanPhone.replace(/\D/g, '');

  const targetUserId = await resolveValidUserId(order.userId || preferredUserId);
  const now = new Date();
  const nowIso = now.toISOString();
  const lastOrderDate = order.createdAt || nowIso;

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.customers) {
      state.customers = [];
    }

    // Match customer by CI first, then phone
    let existingIndex = state.customers.findIndex((c) => {
      const matchCi = resolvedCi && c.ci && String(c.ci).trim().toLowerCase() === String(resolvedCi).trim().toLowerCase();
      if (matchCi) return true;
      const cNorm = normalizeEcuadorPhone(c.phone);
      const cDigits = cNorm.digits || c.phone.replace(/\D/g, '');
      const matchPhone = (phoneDigits.length >= 7 && cDigits.length >= 7 && (phoneDigits === cDigits || phoneDigits.endsWith(cDigits) || cDigits.endsWith(phoneDigits)));
      return matchPhone;
    });

    // Calculate customer order stats from local orders (confirmed orders only)
    const confirmedStatuses = ['confirmed', 'paid', 'shipped', 'delivered', 'completed'];
    const allUserOrders = state.customerOrders.filter((o) => {
      const oNorm = normalizeEcuadorPhone(o.customerPhone);
      const oDigits = oNorm.digits || o.customerPhone.replace(/\D/g, '');
      const matchPhone = (phoneDigits.length >= 7 && oDigits.length >= 7 && (phoneDigits === oDigits || phoneDigits.endsWith(oDigits) || oDigits.endsWith(phoneDigits)));
      const matchCi = resolvedCi && (o.customerCi || o.ci) && String(o.customerCi || o.ci).trim().toLowerCase() === String(resolvedCi).trim().toLowerCase();
      const oStatus = (o.status || '').toLowerCase().trim();
      return (matchPhone || matchCi) && confirmedStatuses.includes(oStatus);
    });

    const totalOrdersCount = allUserOrders.length > 0 ? allUserOrders.length : 1;
    const totalSpentSum = allUserOrders.reduce((sum, o) => sum + (parseFloat(String(o.totalAmount || 0)) || 0), 0);

    if (existingIndex !== -1) {
      const existing = state.customers[existingIndex];
      existing.name = cleanName || existing.name;
      existing.fullName = cleanName || existing.fullName || existing.name;
      existing.phone = cleanPhone || existing.phone;
      if (resolvedCi) existing.ci = resolvedCi;
      if (cleanEmail) existing.email = cleanEmail;
      // Safe address management: Never overwrite an existing fiscal address when shipping progress happens!
      const candidateAddress = (order.clientAddress && typeof order.clientAddress === 'string') ? order.clientAddress.trim() : '';
      const isCandidateConcatenated = isConcatenatedShippingAddress(candidateAddress);
      const existingAddress = (existing.address && typeof existing.address === 'string') ? existing.address.trim() : '';
      const isExistingCorrupted = isConcatenatedShippingAddress(existingAddress);

      if (candidateAddress && !isCandidateConcatenated) {
        if (!existingAddress || isExistingCorrupted) {
          existing.address = candidateAddress;
        }
      } else if (isExistingCorrupted) {
        const parsedOld = parseCustomerShippingData(existingAddress);
        existing.address = parsedOld.exactAddress && !isConcatenatedShippingAddress(parsedOld.exactAddress) ? parsedOld.exactAddress : null;
      }
      // If existing.address is already a valid fiscal address, it is strictly preserved and NEVER overwritten by order shipping cycles.
      const shipDest = order.shippingAddress || order.customerAddress;
      if (shipDest) {
        existing.fullAddress = shipDest;
      }
      if (parsed.province) existing.province = parsed.province;
      if (parsed.canton) existing.canton = parsed.canton;
      if (parsed.parish) existing.parish = parsed.parish;
      if (parsed.exactAddress) existing.exactAddress = parsed.exactAddress;
      if (parsed.reference) existing.reference = parsed.reference;
      existing.totalOrders = Math.max(existing.totalOrders || 0, totalOrdersCount);
      existing.totalSpent = totalSpentSum > 0 ? totalSpentSum.toFixed(2) : existing.totalSpent;
      existing.lastOrderDate = lastOrderDate;
      existing.updatedAt = nowIso;
      storage.save();
      return existing;
    } else {
      const nextId = state.nextId.customers ? state.nextId.customers++ : (state.customers.length + 1);
      if (!state.nextId.customers) state.nextId.customers = nextId + 1;

      const candidateAddress = (order.clientAddress && typeof order.clientAddress === 'string') ? order.clientAddress.trim() : '';
      const isCandidateConcatenated = isConcatenatedShippingAddress(candidateAddress);
      const safeFiscalAddress = candidateAddress && !isCandidateConcatenated ? candidateAddress : null;

      const newCustomer = {
        id: nextId,
        userId: targetUserId,
        name: cleanName,
        fullName: cleanName,
        phone: cleanPhone,
        ci: resolvedCi || null,
        email: cleanEmail || null,
        address: safeFiscalAddress,
        fullAddress: order.shippingAddress || order.customerAddress || null,
        province: parsed.province || null,
        canton: parsed.canton || null,
        parish: parsed.parish || null,
        exactAddress: parsed.exactAddress || null,
        reference: parsed.reference || null,
        totalOrders: totalOrdersCount,
        totalSpent: totalSpentSum > 0 ? totalSpentSum.toFixed(2) : cleanNumericString(order.totalAmount, '0.00'),
        lastOrderDate,
        notes: order.notes ? `Nota de pedido: ${order.notes}` : null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      state.customers.unshift(newCustomer);
      storage.save();
      return newCustomer;
    }
  }

  try {
    // Postgres upsert
    // Search existing customer by CI first or phone
    const ciCondition = resolvedCi && resolvedCi.trim() ? ilike(customers.ci, resolvedCi.trim()) : sql`false`;
    const phoneCondition = phoneDigits.length >= 7 ? ilike(customers.phone, `%${phoneDigits.slice(-8)}%`) : sql`false`;

    const existing = await db
      .select()
      .from(customers)
      .where(or(ciCondition, phoneCondition))
      .limit(1);

    if (existing.length > 0) {
      const current = existing[0];
      const candidateAddress = (order.clientAddress && typeof order.clientAddress === 'string') ? order.clientAddress.trim() : '';
      const isCandidateConcatenated = isConcatenatedShippingAddress(candidateAddress);
      const currentAddress = (current.address && typeof current.address === 'string') ? current.address.trim() : '';
      const isCurrentCorrupted = isConcatenatedShippingAddress(currentAddress);

      let resolvedFiscal = current.address;
      if (candidateAddress && !isCandidateConcatenated) {
        if (!currentAddress || isCurrentCorrupted) {
          resolvedFiscal = candidateAddress;
        }
      } else if (isCurrentCorrupted) {
        const parsedOld = parseCustomerShippingData(currentAddress);
        resolvedFiscal = parsedOld.exactAddress && !isConcatenatedShippingAddress(parsedOld.exactAddress) ? parsedOld.exactAddress : null;
      }

      const updatePayload: Record<string, any> = {
        name: cleanName || current.name,
        phone: cleanPhone || current.phone,
        ci: resolvedCi || current.ci,
        address: resolvedFiscal,
        province: parsed.province || current.province,
        canton: parsed.canton || current.canton,
        parish: parsed.parish || current.parish,
        exactAddress: parsed.exactAddress || order.shippingAddress || current.exactAddress,
        reference: parsed.reference || current.reference,
        totalOrders: sql`${customers.totalOrders} + 1`,
        totalSpent: sql`${customers.totalSpent} + ${parseFloat(cleanNumericString(order.totalAmount, '0.00'))}`,
        lastOrderDate: now,
        updatedAt: now,
      };
      if (cleanEmail) {
        updatePayload.email = cleanEmail;
      }

      const updated = await db
        .update(customers)
        .set(updatePayload)
        .where(eq(customers.id, current.id))
        .returning();

      const enriched = {
        ...updated[0],
        fullName: updated[0].name,
        fullAddress: updated[0].exactAddress || updated[0].address,
      };

      // Keep local state in sync
      const state = storage.getState();
      if (!state.customers) state.customers = [];
      const idx = state.customers.findIndex((c) => c.id === current.id);
      if (idx !== -1) {
        state.customers[idx] = enriched as any;
      } else {
        state.customers.unshift(enriched as any);
      }
      storage.save();

      return enriched;
    } else {
      const candidateAddress = (order.clientAddress && typeof order.clientAddress === 'string') ? order.clientAddress.trim() : '';
      const isCandidateConcatenated = isConcatenatedShippingAddress(candidateAddress);
      const safeFiscalAddress = candidateAddress && !isCandidateConcatenated ? candidateAddress : null;

      const inserted = await db
        .insert(customers)
        .values({
          userId: targetUserId,
          name: cleanName,
          phone: cleanPhone,
          ci: resolvedCi || null,
          email: cleanEmail || null,
          address: safeFiscalAddress,
          province: parsed.province || null,
          canton: parsed.canton || null,
          parish: parsed.parish || null,
          exactAddress: parsed.exactAddress || order.shippingAddress || null,
          reference: parsed.reference || null,
          totalOrders: 1,
          totalSpent: cleanNumericString(order.totalAmount, '0.00'),
          lastOrderDate: now,
          notes: order.notes ? `Nota de pedido: ${order.notes}` : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const enriched = {
        ...inserted[0],
        fullName: inserted[0].name,
        fullAddress: inserted[0].address,
      };

      // Keep local state in sync
      const state = storage.getState();
      if (!state.customers) state.customers = [];
      state.customers.unshift(enriched as any);
      storage.save();

      return enriched;
    }
  } catch (error) {
    console.warn('Error upserting customer to SQL, fallback to local storage:', error);
    const state = storage.getState();
    if (!state.customers) state.customers = [];
    let existingIndex = state.customers.findIndex((c) => {
      const matchCi = resolvedCi && c.ci && String(c.ci).trim().toLowerCase() === String(resolvedCi).trim().toLowerCase();
      if (matchCi) return true;
      const cNorm = normalizeEcuadorPhone(c.phone);
      const cDigits = cNorm.digits || c.phone.replace(/\D/g, '');
      return phoneDigits.length >= 7 && cDigits.length >= 7 && (phoneDigits === cDigits || phoneDigits.endsWith(cDigits) || cDigits.endsWith(phoneDigits));
    });

    if (existingIndex !== -1) {
      const existing = state.customers[existingIndex];
      existing.name = cleanName || existing.name;
      existing.fullName = cleanName || existing.fullName || existing.name;
      existing.phone = cleanPhone || existing.phone;
      if (resolvedCi) existing.ci = resolvedCi;
      if (cleanEmail) existing.email = cleanEmail;
      if (order.customerAddress) existing.address = order.customerAddress;
      existing.lastOrderDate = lastOrderDate;
      existing.updatedAt = nowIso;
      storage.save();
      return existing;
    } else {
      const nextId = state.nextId.customers ? state.nextId.customers++ : (state.customers.length + 1);
      if (!state.nextId.customers) state.nextId.customers = nextId + 1;
      const newCustomer = {
        id: nextId,
        userId: targetUserId,
        name: cleanName,
        fullName: cleanName,
        phone: cleanPhone,
        ci: resolvedCi || null,
        email: cleanEmail || null,
        address: order.customerAddress || null,
        fullAddress: order.customerAddress || null,
        province: parsed.province || null,
        canton: parsed.canton || null,
        parish: parsed.parish || null,
        exactAddress: parsed.exactAddress || null,
        reference: parsed.reference || null,
        totalOrders: 1,
        totalSpent: cleanNumericString(order.totalAmount, '0.00'),
        lastOrderDate,
        notes: order.notes ? `Nota de pedido: ${order.notes}` : null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      state.customers.unshift(newCustomer);
      storage.save();
      return newCustomer;
    }
  }
}

/**
 * Helper to compute live order metrics for customers based strictly on
 * currently registered, confirmed or delivered orders (excluding cancelled, pending, or deleted orders).
 */
export function attachDynamicCustomerStats(customerList: any[], allOrders: any[]) {
  const confirmedStatuses = ['confirmed', 'delivered', 'shipped', 'paid', 'completed'];

  // Only take orders that are currently registered and confirmed/delivered (not pending or cancelled)
  const validOrders = (allOrders || []).filter((ord) => {
    if (!ord || !ord.status) return false;
    const st = String(ord.status).toLowerCase().trim();
    return confirmedStatuses.includes(st) && st !== 'pending' && st !== 'cancelled';
  });

  return customerList.map((c) => {
    const ciClean = c.ci ? String(c.ci).trim().toLowerCase() : '';
    const phoneNorm = normalizeEcuadorPhone(c.phone || '');
    const phoneDigits = phoneNorm.digits || (c.phone ? String(c.phone).replace(/\D/g, '') : '');

    const matchingOrders = validOrders.filter((o) => {
      const oCi = (o.customerCi || o.ci) ? String(o.customerCi || o.ci).trim().toLowerCase() : '';
      if (ciClean && oCi && ciClean === oCi) return true;

      const oNorm = normalizeEcuadorPhone(o.customerPhone || '');
      const oDigits = oNorm.digits || (o.customerPhone ? String(o.customerPhone).replace(/\D/g, '') : '');
      if (phoneDigits.length >= 7 && oDigits.length >= 7) {
        if (phoneDigits === oDigits || phoneDigits.endsWith(oDigits) || oDigits.endsWith(phoneDigits)) {
          return true;
        }
      }

      // If no CI or phone match, check name if present
      if (!ciClean && !phoneDigits && c.name && o.customerName) {
        return c.name.trim().toLowerCase() === o.customerName.trim().toLowerCase();
      }

      return false;
    });

    const totalOrdersCount = matchingOrders.length;
    const totalSpentSum = matchingOrders.reduce((sum, ord) => {
      const amt = parseFloat(String(ord.totalAmount || 0)) || 0;
      return sum + amt;
    }, 0);

    let latestOrderDate = c.lastOrderDate;
    if (matchingOrders.length > 0) {
      const sortedByDate = [...matchingOrders].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      if (sortedByDate[0]?.createdAt) {
        latestOrderDate = sortedByDate[0].createdAt;
      }
    }

    const rawAddress = (c.address && typeof c.address === 'string') ? c.address.trim() : '';
    let sanitizedAddress = c.address;
    if (isConcatenatedShippingAddress(rawAddress)) {
      const parsedAddr = parseCustomerShippingData(rawAddress);
      sanitizedAddress = parsedAddr.exactAddress && !isConcatenatedShippingAddress(parsedAddr.exactAddress)
        ? parsedAddr.exactAddress
        : null;
    }

    return {
      ...c,
      address: sanitizedAddress,
      totalOrders: totalOrdersCount,
      totalSpent: totalSpentSum.toFixed(2),
      lastOrderDate: latestOrderDate,
    };
  });
}

/**
 * Get list of all customers
 */
export async function getCustomers(userId?: number, search?: string) {
  let ordersList: any[] = [];
  try {
    ordersList = await getCustomerOrders(userId);
  } catch (err) {
    console.warn('Could not fetch orders for dynamic customer stats:', err);
  }

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.customers) state.customers = [];

    // Deduplicate state.customers by id defensively
    const seenCustomerIds = new Set<number>();
    state.customers = state.customers.filter((c) => {
      if (!c || c.id === undefined || c.id === null) return false;
      if (seenCustomerIds.has(c.id)) return false;
      seenCustomerIds.add(c.id);
      return true;
    });

    let list = [...state.customers];

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.ci?.toLowerCase().includes(q) ||
          c.province?.toLowerCase().includes(q) ||
          c.canton?.toLowerCase().includes(q) ||
          c.parish?.toLowerCase().includes(q) ||
          c.address?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
      );
    }

    const enrichedList = attachDynamicCustomerStats(list, ordersList);

    enrichedList.sort((a, b) => {
      const dateA = a.lastOrderDate ? new Date(a.lastOrderDate).getTime() : new Date(a.createdAt).getTime();
      const dateB = b.lastOrderDate ? new Date(b.lastOrderDate).getTime() : new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    return enrichedList;
  }

  try {
    let query = db.select().from(customers);

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      const filtered = await db
        .select()
        .from(customers)
        .where(
          or(
            ilike(customers.name, q),
            ilike(customers.phone, q),
            ilike(customers.ci, q),
            ilike(customers.province, q),
            ilike(customers.canton, q),
            ilike(customers.parish, q),
            ilike(customers.address, q),
            ilike(customers.email, q)
          )
        )
        .orderBy(desc(customers.updatedAt));
      return attachDynamicCustomerStats(filtered, ordersList);
    }

    const all = await db
      .select()
      .from(customers)
      .orderBy(desc(customers.updatedAt));

    return attachDynamicCustomerStats(all, ordersList);
  } catch (error) {
    console.warn('Error fetching customers from SQL, fallback to local store:', error);
    const state = storage.getState();
    if (!state.customers) state.customers = [];
    return attachDynamicCustomerStats(state.customers, ordersList);
  }
}

/**
 * Get a single customer by ID
 */
export async function getCustomerById(id: number) {
  let ordersList: any[] = [];
  try {
    ordersList = await getCustomerOrders();
  } catch {}

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const found = state.customers?.find((c) => c.id === id) || null;
    if (!found) return null;
    return attachDynamicCustomerStats([found], ordersList)[0] || found;
  }

  try {
    const [c] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);
    if (!c) return null;
    return attachDynamicCustomerStats([c], ordersList)[0] || c;
  } catch (error) {
    console.warn('Error fetching customer by id from SQL:', error);
    const state = storage.getState();
    const found = state.customers?.find((c) => c.id === id) || null;
    if (!found) return null;
    return attachDynamicCustomerStats([found], ordersList)[0] || found;
  }
}

/**
 * Create a new customer manually
 */
export async function createCustomer(data: {
  userId?: number;
  name?: string;
  fullName?: string;
  phone: string;
  ci?: string | null;
  email?: string | null;
  address?: string | null;
  fullAddress?: string | null;
  province?: string | null;
  canton?: string | null;
  parish?: string | null;
  exactAddress?: string | null;
  reference?: string | null;
  notes?: string | null;
}) {
  const phoneNorm = normalizeEcuadorPhone(data.phone);
  const cleanPhone = phoneNorm.formattedInternational || phoneNorm.e164 || data.phone.trim();
  const cleanCi = data.ci ? data.ci.trim() : null;

  if (!cleanCi) {
    throw new Error('El número de cédula o RUC es obligatorio para registrar un cliente.');
  }

  const ciValidation = validateEcuadorId(cleanCi);
  if (!ciValidation.isValid) {
    throw new Error(`Cédula ecuatoriana inválida: ${ciValidation.error}`);
  }

  const targetUserId = await resolveValidUserId(data.userId);
  const now = new Date().toISOString();
  const resolvedName = (data.fullName || data.name || 'Cliente').trim();

  // Differentiate client registered address (domicilio/fiscal) and shipping address (entrega física)
  const clientAddress = data.address !== undefined ? (data.address ? data.address.trim() : null) : null;
  let shippingAddress = (data.fullAddress || data.exactAddress) ? (data.fullAddress || data.exactAddress)!.trim() : null;
  if (!shippingAddress && (data.province || data.canton || data.exactAddress)) {
    const parts = [];
    if (data.province) parts.push(`Provincia: ${data.province}`);
    if (data.canton) parts.push(`Cantón: ${data.canton}`);
    if (data.parish) parts.push(`Parroquia: ${data.parish}`);
    if (data.exactAddress) parts.push(`Dirección: ${data.exactAddress}`);
    if (data.reference) parts.push(`Referencia: ${data.reference}`);
    shippingAddress = parts.join('\n');
  }

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.customers) state.customers = [];

    // Deduplication by CI (Cédula de Identidad)
    if (cleanCi) {
      const existingIdx = state.customers.findIndex(
        (c) => c.ci && c.ci.trim().toLowerCase() === cleanCi.toLowerCase()
      );
      if (existingIdx !== -1) {
        const existing = state.customers[existingIdx];
        existing.name = resolvedName || existing.name;
        existing.fullName = resolvedName || existing.fullName || existing.name;
        if (cleanPhone) existing.phone = cleanPhone;
        if (data.email !== undefined) existing.email = data.email ? data.email.trim() : null;
        if (clientAddress !== null) {
          existing.address = clientAddress;
        }
        if (shippingAddress !== null) {
          existing.fullAddress = shippingAddress;
        }
        if (data.province !== undefined) existing.province = data.province?.trim() || null;
        if (data.canton !== undefined) existing.canton = data.canton?.trim() || null;
        if (data.parish !== undefined) existing.parish = data.parish?.trim() || null;
        if (data.exactAddress !== undefined) existing.exactAddress = data.exactAddress?.trim() || null;
        if (data.reference !== undefined) existing.reference = data.reference?.trim() || null;
        if (data.notes !== undefined) existing.notes = data.notes?.trim() || null;
        existing.updatedAt = now;
        storage.save();
        return { ...existing, alreadyExisted: true };
      }
    }

    const nextId = state.nextId.customers ? state.nextId.customers++ : (state.customers.length + 1);
    if (!state.nextId.customers) state.nextId.customers = nextId + 1;

    const newCustomer = {
      id: nextId,
      userId: targetUserId,
      name: resolvedName,
      fullName: resolvedName,
      phone: cleanPhone,
      ci: cleanCi,
      email: data.email ? data.email.trim() : null,
      address: clientAddress || null,
      fullAddress: shippingAddress || null,
      province: data.province?.trim() || null,
      canton: data.canton?.trim() || null,
      parish: data.parish?.trim() || null,
      exactAddress: data.exactAddress?.trim() || shippingAddress || null,
      reference: data.reference?.trim() || null,
      totalOrders: 0,
      totalSpent: '0.00',
      lastOrderDate: null,
      notes: data.notes?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };

    state.customers.unshift(newCustomer);
    storage.save();
    return newCustomer;
  }

  try {
    // Deduplication by CI (Cédula de Identidad) in PostgreSQL
    if (cleanCi) {
      const existing = await db
        .select()
        .from(customers)
        .where(ilike(customers.ci, cleanCi))
        .limit(1);

      if (existing.length > 0) {
        const current = existing[0];
        const updatePayload: Record<string, any> = {
          name: resolvedName || current.name,
          phone: cleanPhone || current.phone,
          updatedAt: new Date(),
        };
        if (data.email !== undefined) updatePayload.email = data.email ? data.email.trim() : null;
        if (clientAddress !== null) updatePayload.address = clientAddress;
        if (data.province !== undefined) updatePayload.province = data.province?.trim() || null;
        if (data.canton !== undefined) updatePayload.canton = data.canton?.trim() || null;
        if (data.parish !== undefined) updatePayload.parish = data.parish?.trim() || null;
        if (shippingAddress !== null) updatePayload.exactAddress = shippingAddress;
        if (data.reference !== undefined) updatePayload.reference = data.reference?.trim() || null;
        if (data.notes !== undefined) updatePayload.notes = data.notes?.trim() || null;

        const result = await db
          .update(customers)
          .set(updatePayload)
          .where(eq(customers.id, current.id))
          .returning();

        const updated = result[0];
        const enriched = {
          ...updated,
          fullName: updated.name,
          fullAddress: updated.exactAddress || updated.address,
          alreadyExisted: true,
        };

        const state = storage.getState();
        if (state.customers) {
          const idx = state.customers.findIndex((c) => c.id === current.id);
          if (idx !== -1) {
            state.customers[idx] = enriched as any;
            storage.save();
          }
        }

        return enriched;
      }
    }

    const result = await db
      .insert(customers)
      .values({
        userId: targetUserId,
        name: resolvedName,
        phone: cleanPhone,
        ci: cleanCi,
        email: data.email ? data.email.trim() : null,
        address: clientAddress || null,
        province: data.province?.trim() || null,
        canton: data.canton?.trim() || null,
        parish: data.parish?.trim() || null,
        exactAddress: shippingAddress || data.exactAddress?.trim() || null,
        reference: data.reference?.trim() || null,
        totalOrders: 0,
        totalSpent: '0.00',
        notes: data.notes?.trim() || null,
      })
      .returning();

    const created = result[0];
    const enriched = {
      ...created,
      fullName: created.name,
      fullAddress: created.exactAddress || created.address,
    };
    const state = storage.getState();
    if (!state.customers) state.customers = [];
    state.customers.unshift(enriched as any);
    storage.save();

    return enriched;
  } catch (error) {
    console.warn('Error creating customer in SQL, fallback to local store:', error);
    const state = storage.getState();
    if (!state.customers) state.customers = [];

    // Fallback deduplication by CI
    if (cleanCi) {
      const existingIdx = state.customers.findIndex(
        (c) => c.ci && c.ci.trim().toLowerCase() === cleanCi.toLowerCase()
      );
      if (existingIdx !== -1) {
        const existing = state.customers[existingIdx];
        existing.name = resolvedName || existing.name;
        existing.fullName = resolvedName || existing.fullName || existing.name;
        if (cleanPhone) existing.phone = cleanPhone;
        if (data.email !== undefined) existing.email = data.email ? data.email.trim() : null;
        if (clientAddress !== null) {
          existing.address = clientAddress;
        }
        if (shippingAddress !== null) {
          existing.fullAddress = shippingAddress;
        }
        existing.updatedAt = now;
        storage.save();
        return { ...existing, alreadyExisted: true };
      }
    }

    const nextId = state.nextId.customers ? state.nextId.customers++ : (state.customers.length + 1);
    if (!state.nextId.customers) state.nextId.customers = nextId + 1;

    const newCustomer = {
      id: nextId,
      userId: targetUserId,
      name: resolvedName,
      fullName: resolvedName,
      phone: cleanPhone,
      ci: cleanCi,
      email: data.email ? data.email.trim() : null,
      address: clientAddress || null,
      fullAddress: shippingAddress || null,
      province: data.province?.trim() || null,
      canton: data.canton?.trim() || null,
      parish: data.parish?.trim() || null,
      exactAddress: data.exactAddress?.trim() || shippingAddress || null,
      reference: data.reference?.trim() || null,
      totalOrders: 0,
      totalSpent: '0.00',
      lastOrderDate: null,
      notes: data.notes?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };
    state.customers.unshift(newCustomer);
    storage.save();
    return newCustomer;
  }
}

/**
 * Update an existing customer
 */
export async function updateCustomer(
  id: number,
  data: {
    name?: string;
    fullName?: string;
    phone?: string;
    ci?: string | null;
    email?: string | null;
    address?: string | null;
    fullAddress?: string | null;
    province?: string | null;
    canton?: string | null;
    parish?: string | null;
    exactAddress?: string | null;
    reference?: string | null;
    notes?: string | null;
    totalOrders?: number;
    totalSpent?: string | number;
  }
) {
  const updatePayload: Record<string, any> = {
    updatedAt: new Date(),
  };

  const nameVal = data.fullName !== undefined ? data.fullName : data.name;
  if (nameVal !== undefined) updatePayload.name = nameVal.trim();
  if (data.phone !== undefined) {
    const phoneNorm = normalizeEcuadorPhone(data.phone);
    updatePayload.phone = phoneNorm.formattedInternational || phoneNorm.e164 || data.phone.trim();
  }
  if (data.ci !== undefined) {
    if (data.ci && data.ci.trim()) {
      const ciVal = validateEcuadorId(data.ci.trim());
      if (!ciVal.isValid) {
        throw new Error(`Cédula ecuatoriana inválida: ${ciVal.error}`);
      }
      updatePayload.ci = ciVal.cleaned;
    } else {
      updatePayload.ci = null;
    }
  }
  if (data.email !== undefined) updatePayload.email = data.email ? data.email.trim() : null;
  if (data.address !== undefined) updatePayload.address = data.address ? data.address.trim() : null;
  let updatedShipping = data.fullAddress !== undefined ? (data.fullAddress ? data.fullAddress.trim() : null) : undefined;
  if (data.province !== undefined) updatePayload.province = data.province ? data.province.trim() : null;
  if (data.canton !== undefined) updatePayload.canton = data.canton ? data.canton.trim() : null;
  if (data.parish !== undefined) updatePayload.parish = data.parish ? data.parish.trim() : null;
  if (data.exactAddress !== undefined) updatePayload.exactAddress = data.exactAddress ? data.exactAddress.trim() : null;
  if (data.reference !== undefined) updatePayload.reference = data.reference ? data.reference.trim() : null;
  if (data.notes !== undefined) updatePayload.notes = data.notes;
  if (data.totalOrders !== undefined) updatePayload.totalOrders = cleanInteger(data.totalOrders, 0);
  if (data.totalSpent !== undefined) updatePayload.totalSpent = cleanNumericString(data.totalSpent, '0.00');

  // Rebuild shipping destination if structured fields provided
  if (data.province || data.canton || data.exactAddress) {
    const parts = [];
    if (data.province) parts.push(`Provincia: ${data.province}`);
    if (data.canton) parts.push(`Cantón: ${data.canton}`);
    if (data.parish) parts.push(`Parroquia: ${data.parish}`);
    if (data.exactAddress) parts.push(`Dirección: ${data.exactAddress}`);
    if (data.reference) parts.push(`Referencia: ${data.reference}`);
    updatedShipping = parts.join('\n');
  }

  if (updatedShipping !== undefined) {
    updatePayload.fullAddress = updatedShipping;
    if (updatePayload.exactAddress === undefined) {
      updatePayload.exactAddress = updatedShipping;
    }
  }

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.customers) state.customers = [];
    const customer = state.customers.find((c) => c.id === id);
    if (!customer) throw new Error('Cliente no encontrado');
    Object.assign(customer, {
      ...updatePayload,
      updatedAt: new Date().toISOString(),
    });
    storage.save();
    return customer;
  }

  try {
    const result = await db
      .update(customers)
      .set(updatePayload)
      .where(eq(customers.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error('Cliente no encontrado');
    }

    const updated = result[0];
    const state = storage.getState();
    if (!state.customers) state.customers = [];
    const localIdx = state.customers.findIndex((c) => c.id === id);
    if (localIdx !== -1) {
      state.customers[localIdx] = updated as any;
      storage.save();
    }

    return updated;
  } catch (error) {
    console.warn('Error updating customer in SQL, fallback to local store:', error);
    const state = storage.getState();
    if (!state.customers) state.customers = [];
    const customer = state.customers.find((c) => c.id === id);
    if (customer) {
      Object.assign(customer, {
        ...updatePayload,
        updatedAt: new Date().toISOString(),
      });
      storage.save();
      return customer;
    }
    throw error;
  }
}

/**
 * Delete a customer by ID
 */
export async function deleteCustomer(id: number) {
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.customers) state.customers = [];
    const idx = state.customers.findIndex((c) => c.id === id);
    let deleted = null;
    if (idx !== -1) {
      deleted = state.customers.splice(idx, 1)[0];
      storage.save();
    }
    return { success: true, deleted };
  }

  try {
    const result = await db
      .delete(customers)
      .where(eq(customers.id, id))
      .returning();

    const state = storage.getState();
    if (!state.customers) state.customers = [];
    const idx = state.customers.findIndex((c) => c.id === id);
    if (idx !== -1) {
      state.customers.splice(idx, 1);
      storage.save();
    }

    return { success: true, deleted: result[0] || null };
  } catch (error) {
    console.warn('Error deleting customer from SQL, fallback:', error);
    const state = storage.getState();
    if (!state.customers) state.customers = [];
    const idx = state.customers.findIndex((c) => c.id === id);
    let deleted = null;
    if (idx !== -1) {
      deleted = state.customers.splice(idx, 1)[0];
      storage.save();
    }
    return { success: true, deleted };
  }
}

/**
 * Sync all existing orders into customer directory
 */
export async function syncCustomersFromOrders(userId?: number) {
  const orders = await getCustomerOrders(userId);
  const synced: any[] = [];
  for (const ord of orders) {
    const c = await upsertCustomerFromOrder(ord, userId);
    if (c) synced.push(c);
  }
  return { success: true, totalOrders: orders.length, syncedCount: synced.length };
}

// ----------------------------------------------------
// SUPPLIERS MANAGEMENT & ERP VENDOR SYSTEM
// ----------------------------------------------------

/**
 * Normalizes supplier object from SQL / local storage
 */
export function normalizeSupplier(raw: any): any {
  if (!raw) return null;

  let parsedBankInfo = null;
  if (raw.bankDetails) {
    if (typeof raw.bankDetails === 'object') {
      parsedBankInfo = raw.bankDetails;
    } else if (typeof raw.bankDetails === 'string') {
      try {
        parsedBankInfo = JSON.parse(raw.bankDetails);
      } catch {
        parsedBankInfo = null;
      }
    }
  }

  return {
    id: Number(raw.id),
    userId: Number(raw.userId || raw.user_id || 1),
    name: String(raw.name || '').trim(),
    tradeName: raw.tradeName || raw.trade_name || null,
    ruc: raw.ruc || null,
    phone: raw.phone || null,
    email: raw.email || null,
    contactPerson: raw.contactPerson || raw.contact_person || null,
    contactPersonPhone: raw.contactPersonPhone || raw.contact_person_phone || null,
    contactPersonRole: raw.contactPersonRole || raw.contact_person_role || null,
    category: raw.category || 'General',
    country: raw.country || 'Ecuador',
    city: raw.city || null,
    address: raw.address || null,
    website: raw.website || null,
    paymentTerms: raw.paymentTerms || raw.payment_terms || 'contado',
    creditLimit: cleanNumericString(raw.creditLimit || raw.credit_limit, '0.00'),
    bankDetails: typeof raw.bankDetails === 'object' ? JSON.stringify(raw.bankDetails) : raw.bankDetails || null,
    bankInfo: parsedBankInfo,
    leadTimeDays: cleanInteger(raw.leadTimeDays || raw.lead_time_days, 3),
    rating: Number(raw.rating || 5),
    status: raw.status || 'active',
    notes: raw.notes || null,
    totalPurchases: cleanInteger(raw.totalPurchases || raw.total_purchases, 0),
    totalSpent: cleanNumericString(raw.totalSpent || raw.total_spent, '0.00'),
    productsCount: cleanInteger(raw.productsCount || raw.products_count, 0),
    lastPurchaseDate: raw.lastPurchaseDate || raw.last_purchase_date || null,
    pendingPurchasesCount: cleanInteger(raw.pendingPurchasesCount || raw.pending_purchases_count, 0),
    pendingBalance: cleanNumericString(raw.pendingBalance || raw.pending_balance, '0.00'),
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.updated_at || new Date().toISOString(),
  };
}

/**
 * Helper to compute live ERP purchase, catalog, and payable stats for suppliers
 */
export function attachDynamicSupplierStats(
  supplierList: any[],
  allPurchases: any[],
  allInventory: any[],
  allPayments?: any[]
) {
  const activePurchaseStatuses = ['pending', 'ordered', 'in_transit', 'partially_received'];

  return supplierList.map((s) => {
    const sNameClean = (s.name || '').trim().toLowerCase();
    const sTradeNameClean = (s.tradeName || '').trim().toLowerCase();
    const sRucClean = (s.ruc || '').trim().toLowerCase();

    // Match purchases
    const matchingPurchases = (allPurchases || []).filter((po) => {
      if (!po || po.status === 'cancelled') return false;
      const poSupplier = (po.supplierName || '').trim().toLowerCase();
      if (sNameClean && poSupplier === sNameClean) return true;
      if (sTradeNameClean && poSupplier === sTradeNameClean) return true;
      if (sNameClean && poSupplier.includes(sNameClean)) return true;
      if (poSupplier && sNameClean && sNameClean.includes(poSupplier)) return true;
      return false;
    });

    const totalPurchasesCount = matchingPurchases.length;
    const totalSpentSum = matchingPurchases.reduce((sum, po) => sum + (parseFloat(String(po.totalCost || 0)) || 0), 0);

    const pendingPurchases = matchingPurchases.filter((po) => activePurchaseStatuses.includes(po.status));
    const pendingPurchasesCount = pendingPurchases.length;

    // Accounts Payable calculation
    let pendingBalanceSum = 0;
    matchingPurchases.forEach((po) => {
      const cost = parseFloat(String(po.totalCost || 0)) || 0;
      if (po.paymentStatus === 'paid') {
        // fully paid
      } else {
        // check disbursements in payments if available
        if (allPayments && allPayments.length > 0) {
          const outflows = allPayments.filter((p) => p.status === 'completed' && p.type === 'outflow' && Number(p.purchaseId) === Number(po.id));
          const paidAmt = outflows.reduce((acc, p) => acc + (parseFloat(String(p.amount || 0)) || 0), 0);
          pendingBalanceSum += Math.max(0, cost - paidAmt);
        } else {
          if (po.paymentStatus === 'unpaid') {
            pendingBalanceSum += cost;
          }
        }
      }
    });

    // Match inventory catalog items
    const linkedProducts = (allInventory || []).filter((it) => {
      const itSupplier = (it.supplier || it.supplierName || '').trim().toLowerCase();
      if (sNameClean && itSupplier === sNameClean) return true;
      if (sTradeNameClean && itSupplier === sTradeNameClean) return true;
      if (sNameClean && itSupplier.includes(sNameClean)) return true;
      return false;
    });

    let latestPurchaseDate = s.lastPurchaseDate;
    if (matchingPurchases.length > 0) {
      const sorted = [...matchingPurchases].sort(
        (a, b) => new Date(b.purchaseDate || b.createdAt).getTime() - new Date(a.purchaseDate || a.createdAt).getTime()
      );
      if (sorted[0]) {
        latestPurchaseDate = sorted[0].purchaseDate || sorted[0].createdAt;
      }
    }

    const normalized = normalizeSupplier(s);

    return {
      ...normalized,
      totalPurchases: totalPurchasesCount > 0 ? totalPurchasesCount : normalized.totalPurchases,
      totalSpent: totalSpentSum > 0 ? totalSpentSum.toFixed(2) : normalized.totalSpent,
      pendingPurchasesCount,
      pendingBalance: pendingBalanceSum.toFixed(2),
      productsCount: linkedProducts.length > 0 ? linkedProducts.length : normalized.productsCount,
      lastPurchaseDate: latestPurchaseDate || normalized.lastPurchaseDate,
      linkedProductsCount: linkedProducts.length,
    };
  });
}

/**
 * Get list of all suppliers with ERP stats
 */
export async function getSuppliers(userId?: number, search?: string) {
  let purchasesList: any[] = [];
  let inventoryList: any[] = [];
  let paymentsList: any[] = [];

  try {
    purchasesList = await getPurchases(userId);
    inventoryList = await getInventoryItems(userId);
    paymentsList = await getPayments(userId);
  } catch (err) {
    console.warn('Could not fetch auxiliary data for suppliers:', err);
  }

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.suppliers) state.suppliers = [];
    let list = [...state.suppliers];

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          s.tradeName?.toLowerCase().includes(q) ||
          s.ruc?.toLowerCase().includes(q) ||
          s.phone?.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q) ||
          s.contactPerson?.toLowerCase().includes(q) ||
          s.category?.toLowerCase().includes(q) ||
          s.city?.toLowerCase().includes(q)
      );
    }

    const enrichedList = attachDynamicSupplierStats(list, purchasesList, inventoryList, paymentsList);

    enrichedList.sort((a, b) => {
      const dateA = a.lastPurchaseDate ? new Date(a.lastPurchaseDate).getTime() : new Date(a.createdAt).getTime();
      const dateB = b.lastPurchaseDate ? new Date(b.lastPurchaseDate).getTime() : new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    return enrichedList;
  }

  try {
    let sqlList: any[] = [];
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      sqlList = await db
        .select()
        .from(suppliers)
        .where(
          or(
            ilike(suppliers.name, q),
            ilike(suppliers.tradeName, q),
            ilike(suppliers.ruc, q),
            ilike(suppliers.phone, q),
            ilike(suppliers.email, q),
            ilike(suppliers.contactPerson, q),
            ilike(suppliers.category, q),
            ilike(suppliers.city, q)
          )
        )
        .orderBy(desc(suppliers.updatedAt));
    } else {
      sqlList = await db
        .select()
        .from(suppliers)
        .orderBy(desc(suppliers.updatedAt));
    }

    return attachDynamicSupplierStats(sqlList, purchasesList, inventoryList, paymentsList);
  } catch (error) {
    console.warn('Error fetching suppliers from SQL, fallback to local store:', error);
    const state = storage.getState();
    if (!state.suppliers) state.suppliers = [];
    return attachDynamicSupplierStats(state.suppliers, purchasesList, inventoryList, paymentsList);
  }
}

/**
 * Get a single supplier by ID with full relations (products, purchases, payments)
 */
export async function getSupplierById(id: number) {
  let purchasesList: any[] = [];
  let inventoryList: any[] = [];
  let paymentsList: any[] = [];

  try {
    purchasesList = await getPurchases();
    inventoryList = await getInventoryItems();
    paymentsList = await getPayments();
  } catch {}

  let supplierRaw: any = null;

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    supplierRaw = state.suppliers?.find((s) => Number(s.id) === Number(id)) || null;
  } else {
    try {
      const [s] = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, id))
        .limit(1);
      supplierRaw = s || null;
    } catch (error) {
      console.warn('Error fetching supplier by id from SQL:', error);
      const state = storage.getState();
      supplierRaw = state.suppliers?.find((s) => Number(s.id) === Number(id)) || null;
    }
  }

  if (!supplierRaw) return null;

  const enriched = attachDynamicSupplierStats([supplierRaw], purchasesList, inventoryList, paymentsList)[0];

  const sNameClean = (enriched.name || '').trim().toLowerCase();
  const sTradeNameClean = (enriched.tradeName || '').trim().toLowerCase();

  // Related purchases
  const relatedPurchases = purchasesList.filter((po) => {
    const poSupplier = (po.supplierName || '').trim().toLowerCase();
    return (sNameClean && poSupplier === sNameClean) || (sTradeNameClean && poSupplier === sTradeNameClean) || (sNameClean && poSupplier.includes(sNameClean));
  });

  // Related products
  const relatedProducts = inventoryList.filter((it) => {
    const itSupplier = (it.supplier || it.supplierName || '').trim().toLowerCase();
    return (sNameClean && itSupplier === sNameClean) || (sTradeNameClean && itSupplier === sTradeNameClean) || (sNameClean && itSupplier.includes(sNameClean));
  });

  // Related payments
  const relatedPayments = paymentsList.filter((p) => {
    const pSupplier = (p.supplierName || '').trim().toLowerCase();
    return (sNameClean && pSupplier === sNameClean) || (sTradeNameClean && pSupplier === sTradeNameClean) || (sNameClean && pSupplier.includes(sNameClean));
  });

  return {
    ...enriched,
    purchases: relatedPurchases,
    products: relatedProducts,
    payments: relatedPayments,
  };
}

/**
 * Create a new supplier
 */
export async function createSupplier(data: {
  userId?: number;
  name: string;
  tradeName?: string | null;
  ruc?: string | null;
  phone?: string | null;
  email?: string | null;
  contactPerson?: string | null;
  contactPersonPhone?: string | null;
  contactPersonRole?: string | null;
  category?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  website?: string | null;
  paymentTerms?: string | null;
  creditLimit?: string | number | null;
  bankDetails?: any | null;
  bankInfo?: any | null;
  leadTimeDays?: number | null;
  rating?: number | null;
  status?: string | null;
  notes?: string | null;
}) {
  const cleanName = (data.name || '').trim();
  if (!cleanName) {
    throw new Error('La razón social o nombre del proveedor es obligatorio.');
  }

  const targetUserId = await resolveValidUserId(data.userId);
  const now = new Date().toISOString();

  let formattedPhone = null;
  if (data.phone) {
    const phoneNorm = normalizeEcuadorPhone(data.phone);
    formattedPhone = phoneNorm.formattedInternational || phoneNorm.e164 || data.phone.trim();
  }

  let formattedContactPhone = null;
  if (data.contactPersonPhone) {
    const phoneNorm = normalizeEcuadorPhone(data.contactPersonPhone);
    formattedContactPhone = phoneNorm.formattedInternational || phoneNorm.e164 || data.contactPersonPhone.trim();
  }

  let bankDetailsStr: string | null = null;
  if (data.bankInfo) {
    bankDetailsStr = JSON.stringify(data.bankInfo);
  } else if (data.bankDetails) {
    bankDetailsStr = typeof data.bankDetails === 'object' ? JSON.stringify(data.bankDetails) : String(data.bankDetails);
  }

  const cleanRuc = data.ruc ? data.ruc.trim() : null;

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.suppliers) state.suppliers = [];

    // Deduplication check by RUC or exact Name
    const existingIdx = state.suppliers.findIndex((s) => {
      if (cleanRuc && s.ruc && s.ruc.trim().toLowerCase() === cleanRuc.toLowerCase()) return true;
      if (s.name && s.name.trim().toLowerCase() === cleanName.toLowerCase()) return true;
      return false;
    });

    if (existingIdx !== -1) {
      const existing = state.suppliers[existingIdx];
      existing.tradeName = data.tradeName !== undefined ? (data.tradeName ? data.tradeName.trim() : null) : existing.tradeName;
      if (formattedPhone) existing.phone = formattedPhone;
      if (data.email !== undefined) existing.email = data.email ? data.email.trim() : null;
      if (data.contactPerson !== undefined) existing.contactPerson = data.contactPerson ? data.contactPerson.trim() : null;
      if (formattedContactPhone) existing.contactPersonPhone = formattedContactPhone;
      if (data.contactPersonRole !== undefined) existing.contactPersonRole = data.contactPersonRole ? data.contactPersonRole.trim() : null;
      if (data.category !== undefined) existing.category = data.category ? data.category.trim() : existing.category;
      if (data.country !== undefined) existing.country = data.country ? data.country.trim() : existing.country;
      if (data.city !== undefined) existing.city = data.city ? data.city.trim() : existing.city;
      if (data.address !== undefined) existing.address = data.address ? data.address.trim() : existing.address;
      if (data.website !== undefined) existing.website = data.website ? data.website.trim() : existing.website;
      if (data.paymentTerms !== undefined) existing.paymentTerms = data.paymentTerms ? data.paymentTerms.trim() : existing.paymentTerms;
      if (data.creditLimit !== undefined) existing.creditLimit = cleanNumericString(data.creditLimit, '0.00');
      if (bankDetailsStr !== null) existing.bankDetails = bankDetailsStr;
      if (data.leadTimeDays !== undefined) existing.leadTimeDays = cleanInteger(data.leadTimeDays, 3);
      if (data.rating !== undefined) existing.rating = Number(data.rating || 5);
      if (data.status !== undefined) existing.status = data.status || 'active';
      if (data.notes !== undefined) existing.notes = data.notes ? data.notes.trim() : null;
      existing.updatedAt = now;
      storage.save();
      return normalizeSupplier({ ...existing, alreadyExisted: true });
    }

    const nextId = state.nextId.suppliers ? state.nextId.suppliers++ : (state.suppliers.length + 1);
    if (!state.nextId.suppliers) state.nextId.suppliers = nextId + 1;

    const newSupplier = {
      id: nextId,
      userId: targetUserId,
      name: cleanName,
      tradeName: data.tradeName ? data.tradeName.trim() : null,
      ruc: cleanRuc,
      phone: formattedPhone,
      email: data.email ? data.email.trim() : null,
      contactPerson: data.contactPerson ? data.contactPerson.trim() : null,
      contactPersonPhone: formattedContactPhone,
      contactPersonRole: data.contactPersonRole ? data.contactPersonRole.trim() : null,
      category: data.category ? data.category.trim() : 'General',
      country: data.country ? data.country.trim() : 'Ecuador',
      city: data.city ? data.city.trim() : null,
      address: data.address ? data.address.trim() : null,
      website: data.website ? data.website.trim() : null,
      paymentTerms: data.paymentTerms ? data.paymentTerms.trim() : 'contado',
      creditLimit: cleanNumericString(data.creditLimit, '0.00'),
      bankDetails: bankDetailsStr,
      leadTimeDays: cleanInteger(data.leadTimeDays, 3),
      rating: Number(data.rating || 5),
      status: data.status || 'active',
      notes: data.notes ? data.notes.trim() : null,
      totalPurchases: 0,
      totalSpent: '0.00',
      productsCount: 0,
      lastPurchaseDate: null,
      createdAt: now,
      updatedAt: now,
    };

    state.suppliers.unshift(newSupplier);
    storage.save();
    return normalizeSupplier(newSupplier);
  }

  try {
    // Deduplication check by RUC or Name in Postgres
    const rucCondition = cleanRuc ? eq(suppliers.ruc, cleanRuc) : sql`false`;
    const nameCondition = eq(suppliers.name, cleanName);

    const existing = await db
      .select()
      .from(suppliers)
      .where(or(rucCondition, nameCondition))
      .limit(1);

    if (existing.length > 0) {
      const current = existing[0];
      const updatePayload: Record<string, any> = {
        name: cleanName,
        tradeName: data.tradeName !== undefined ? (data.tradeName ? data.tradeName.trim() : null) : current.tradeName,
        phone: formattedPhone || current.phone,
        email: data.email !== undefined ? (data.email ? data.email.trim() : null) : current.email,
        contactPerson: data.contactPerson !== undefined ? (data.contactPerson ? data.contactPerson.trim() : null) : current.contactPerson,
        contactPersonPhone: formattedContactPhone || current.contactPersonPhone,
        contactPersonRole: data.contactPersonRole !== undefined ? (data.contactPersonRole ? data.contactPersonRole.trim() : null) : current.contactPersonRole,
        category: data.category !== undefined ? (data.category ? data.category.trim() : 'General') : current.category,
        country: data.country !== undefined ? (data.country ? data.country.trim() : 'Ecuador') : current.country,
        city: data.city !== undefined ? (data.city ? data.city.trim() : null) : current.city,
        address: data.address !== undefined ? (data.address ? data.address.trim() : null) : current.address,
        website: data.website !== undefined ? (data.website ? data.website.trim() : null) : current.website,
        paymentTerms: data.paymentTerms !== undefined ? (data.paymentTerms ? data.paymentTerms.trim() : 'contado') : current.paymentTerms,
        creditLimit: data.creditLimit !== undefined ? cleanNumericString(data.creditLimit, '0.00') : current.creditLimit,
        bankDetails: bankDetailsStr !== null ? bankDetailsStr : current.bankDetails,
        leadTimeDays: data.leadTimeDays !== undefined ? cleanInteger(data.leadTimeDays, 3) : current.leadTimeDays,
        rating: data.rating !== undefined ? Number(data.rating || 5) : current.rating,
        status: data.status !== undefined ? (data.status || 'active') : current.status,
        notes: data.notes !== undefined ? (data.notes ? data.notes.trim() : null) : current.notes,
        updatedAt: new Date(),
      };

      const result = await db
        .update(suppliers)
        .set(updatePayload)
        .where(eq(suppliers.id, current.id))
        .returning();

      const updated = result[0];

      const state = storage.getState();
      if (!state.suppliers) state.suppliers = [];
      const idx = state.suppliers.findIndex((s) => s.id === current.id);
      if (idx !== -1) {
        state.suppliers[idx] = updated as any;
      } else {
        state.suppliers.unshift(updated as any);
      }
      storage.save();

      return normalizeSupplier({ ...updated, alreadyExisted: true });
    }

    const result = await db
      .insert(suppliers)
      .values({
        userId: targetUserId,
        name: cleanName,
        tradeName: data.tradeName ? data.tradeName.trim() : null,
        ruc: cleanRuc,
        phone: formattedPhone,
        email: data.email ? data.email.trim() : null,
        contactPerson: data.contactPerson ? data.contactPerson.trim() : null,
        contactPersonPhone: formattedContactPhone,
        contactPersonRole: data.contactPersonRole ? data.contactPersonRole.trim() : null,
        category: data.category ? data.category.trim() : 'General',
        country: data.country ? data.country.trim() : 'Ecuador',
        city: data.city ? data.city.trim() : null,
        address: data.address ? data.address.trim() : null,
        website: data.website ? data.website.trim() : null,
        paymentTerms: data.paymentTerms ? data.paymentTerms.trim() : 'contado',
        creditLimit: cleanNumericString(data.creditLimit, '0.00'),
        bankDetails: bankDetailsStr,
        leadTimeDays: cleanInteger(data.leadTimeDays, 3),
        rating: Number(data.rating || 5),
        status: data.status || 'active',
        notes: data.notes ? data.notes.trim() : null,
      })
      .returning();

    const state = storage.getState();
    if (!state.suppliers) state.suppliers = [];
    state.suppliers.unshift(result[0] as any);
    storage.save();

    return normalizeSupplier(result[0]);
  } catch (error) {
    console.warn('Error creating supplier in SQL, fallback to local storage:', error);
    const state = storage.getState();
    if (!state.suppliers) state.suppliers = [];
    const nextId = state.nextId.suppliers ? state.nextId.suppliers++ : (state.suppliers.length + 1);
    if (!state.nextId.suppliers) state.nextId.suppliers = nextId + 1;

    const newSupplier = {
      id: nextId,
      userId: targetUserId,
      name: cleanName,
      tradeName: data.tradeName ? data.tradeName.trim() : null,
      ruc: cleanRuc,
      phone: formattedPhone,
      email: data.email ? data.email.trim() : null,
      contactPerson: data.contactPerson ? data.contactPerson.trim() : null,
      contactPersonPhone: formattedContactPhone,
      contactPersonRole: data.contactPersonRole ? data.contactPersonRole.trim() : null,
      category: data.category ? data.category.trim() : 'General',
      country: data.country ? data.country.trim() : 'Ecuador',
      city: data.city ? data.city.trim() : null,
      address: data.address ? data.address.trim() : null,
      website: data.website ? data.website.trim() : null,
      paymentTerms: data.paymentTerms ? data.paymentTerms.trim() : 'contado',
      creditLimit: cleanNumericString(data.creditLimit, '0.00'),
      bankDetails: bankDetailsStr,
      leadTimeDays: cleanInteger(data.leadTimeDays, 3),
      rating: Number(data.rating || 5),
      status: data.status || 'active',
      notes: data.notes ? data.notes.trim() : null,
      totalPurchases: 0,
      totalSpent: '0.00',
      productsCount: 0,
      lastPurchaseDate: null,
      createdAt: now,
      updatedAt: now,
    };

    state.suppliers.unshift(newSupplier);
    storage.save();
    return normalizeSupplier(newSupplier);
  }
}

/**
 * Update an existing supplier
 */
export async function updateSupplier(
  id: number,
  data: {
    name?: string;
    tradeName?: string | null;
    ruc?: string | null;
    phone?: string | null;
    email?: string | null;
    contactPerson?: string | null;
    contactPersonPhone?: string | null;
    contactPersonRole?: string | null;
    category?: string | null;
    country?: string | null;
    city?: string | null;
    address?: string | null;
    website?: string | null;
    paymentTerms?: string | null;
    creditLimit?: string | number | null;
    bankDetails?: any | null;
    bankInfo?: any | null;
    leadTimeDays?: number | null;
    rating?: number | null;
    status?: string | null;
    notes?: string | null;
    totalPurchases?: number;
    totalSpent?: string | number;
    productsCount?: number;
  }
) {
  const updatePayload: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) updatePayload.name = data.name.trim();
  if (data.tradeName !== undefined) updatePayload.tradeName = data.tradeName ? data.tradeName.trim() : null;
  if (data.ruc !== undefined) updatePayload.ruc = data.ruc ? data.ruc.trim() : null;
  if (data.phone !== undefined) {
    if (data.phone) {
      const phoneNorm = normalizeEcuadorPhone(data.phone);
      updatePayload.phone = phoneNorm.formattedInternational || phoneNorm.e164 || data.phone.trim();
    } else {
      updatePayload.phone = null;
    }
  }
  if (data.email !== undefined) updatePayload.email = data.email ? data.email.trim() : null;
  if (data.contactPerson !== undefined) updatePayload.contactPerson = data.contactPerson ? data.contactPerson.trim() : null;
  if (data.contactPersonPhone !== undefined) {
    if (data.contactPersonPhone) {
      const phoneNorm = normalizeEcuadorPhone(data.contactPersonPhone);
      updatePayload.contactPersonPhone = phoneNorm.formattedInternational || phoneNorm.e164 || data.contactPersonPhone.trim();
    } else {
      updatePayload.contactPersonPhone = null;
    }
  }
  if (data.contactPersonRole !== undefined) updatePayload.contactPersonRole = data.contactPersonRole ? data.contactPersonRole.trim() : null;
  if (data.category !== undefined) updatePayload.category = data.category ? data.category.trim() : 'General';
  if (data.country !== undefined) updatePayload.country = data.country ? data.country.trim() : 'Ecuador';
  if (data.city !== undefined) updatePayload.city = data.city ? data.city.trim() : null;
  if (data.address !== undefined) updatePayload.address = data.address ? data.address.trim() : null;
  if (data.website !== undefined) updatePayload.website = data.website ? data.website.trim() : null;
  if (data.paymentTerms !== undefined) updatePayload.paymentTerms = data.paymentTerms ? data.paymentTerms.trim() : 'contado';
  if (data.creditLimit !== undefined) updatePayload.creditLimit = cleanNumericString(data.creditLimit, '0.00');
  if (data.bankInfo !== undefined) {
    updatePayload.bankDetails = data.bankInfo ? JSON.stringify(data.bankInfo) : null;
  } else if (data.bankDetails !== undefined) {
    updatePayload.bankDetails = typeof data.bankDetails === 'object' ? JSON.stringify(data.bankDetails) : data.bankDetails;
  }
  if (data.leadTimeDays !== undefined) updatePayload.leadTimeDays = cleanInteger(data.leadTimeDays, 3);
  if (data.rating !== undefined) updatePayload.rating = Number(data.rating || 5);
  if (data.status !== undefined) updatePayload.status = data.status || 'active';
  if (data.notes !== undefined) updatePayload.notes = data.notes ? data.notes.trim() : null;
  if (data.totalPurchases !== undefined) updatePayload.totalPurchases = cleanInteger(data.totalPurchases, 0);
  if (data.totalSpent !== undefined) updatePayload.totalSpent = cleanNumericString(data.totalSpent, '0.00');
  if (data.productsCount !== undefined) updatePayload.productsCount = cleanInteger(data.productsCount, 0);

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.suppliers) state.suppliers = [];
    const sup = state.suppliers.find((s) => Number(s.id) === Number(id));
    if (!sup) throw new Error('Proveedor no encontrado');

    Object.assign(sup, {
      ...updatePayload,
      updatedAt: new Date().toISOString(),
    });
    storage.save();
    return normalizeSupplier(sup);
  }

  try {
    const result = await db
      .update(suppliers)
      .set(updatePayload)
      .where(eq(suppliers.id, id))
      .returning();

    if (!result[0]) {
      throw new Error('Proveedor no encontrado');
    }

    const state = storage.getState();
    if (!state.suppliers) state.suppliers = [];
    const localSup = state.suppliers.find((s) => Number(s.id) === Number(id));
    if (localSup) {
      Object.assign(localSup, {
        ...updatePayload,
        updatedAt: new Date().toISOString(),
      });
      storage.save();
    }

    return normalizeSupplier(result[0]);
  } catch (error) {
    console.warn('Error updating supplier in SQL, fallback to local store:', error);
    const state = storage.getState();
    if (!state.suppliers) state.suppliers = [];
    const sup = state.suppliers.find((s) => Number(s.id) === Number(id));
    if (sup) {
      Object.assign(sup, {
        ...updatePayload,
        updatedAt: new Date().toISOString(),
      });
      storage.save();
      return normalizeSupplier(sup);
    }
    throw error;
  }
}

/**
 * Delete a supplier by ID
 */
export async function deleteSupplier(id: number) {
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.suppliers) state.suppliers = [];
    const idx = state.suppliers.findIndex((s) => Number(s.id) === Number(id));
    let deleted = null;
    if (idx !== -1) {
      deleted = state.suppliers.splice(idx, 1)[0];
      storage.save();
    }
    return { success: true, deleted: normalizeSupplier(deleted) };
  }

  try {
    const result = await db
      .delete(suppliers)
      .where(eq(suppliers.id, id))
      .returning();

    const state = storage.getState();
    if (!state.suppliers) state.suppliers = [];
    const idx = state.suppliers.findIndex((s) => Number(s.id) === Number(id));
    if (idx !== -1) {
      state.suppliers.splice(idx, 1);
      storage.save();
    }

    return { success: true, deleted: normalizeSupplier(result[0] || null) };
  } catch (error) {
    console.warn('Error deleting supplier from SQL, fallback:', error);
    const state = storage.getState();
    if (!state.suppliers) state.suppliers = [];
    const idx = state.suppliers.findIndex((s) => Number(s.id) === Number(id));
    let deleted = null;
    if (idx !== -1) {
      deleted = state.suppliers.splice(idx, 1)[0];
      storage.save();
    }
    return { success: true, deleted: normalizeSupplier(deleted) };
  }
}

/**
 * Sync suppliers strictly from items currently in inventory.
 * Only suppliers of products that currently exist in inventory are registered and maintained.
 * Suppliers with no active products in inventory are pruned.
 */
export async function syncSuppliersFromPurchasesAndInventory(userId?: number) {
  const targetUserId = await resolveValidUserId(userId);
  const inventoryList = await getInventoryItems(targetUserId);
  const purchasesList = await getPurchases(targetUserId);
  const existingSuppliers = await getSuppliers(targetUserId);

  // 1. Gather valid supplier names strictly from products currently in inventory
  const discoveredMap = new Map<
    string,
    {
      name: string;
      source: 'manual_inventory' | 'telegram';
      phone?: string;
      category?: string;
      notes?: string;
    }
  >();

  inventoryList.forEach((it) => {
    const rawSup = (it.supplier || (it as any).supplierName || '').trim();
    if (rawSup && typeof rawSup === 'string' && rawSup.length > 0) {
      const key = rawSup.toLowerCase();
      const isTg = Boolean(
        it.rawTelegramMessage ||
        (it.sku && it.sku.startsWith('TEL-')) ||
        (it.imageUrl && it.imageUrl.includes('telegram'))
      );

      if (!discoveredMap.has(key)) {
        discoveredMap.set(key, {
          name: rawSup,
          source: isTg ? 'telegram' : 'manual_inventory',
          category: it.category || (isTg ? 'Importación Telegram' : 'Catálogo General'),
          notes: isTg
            ? `[Sincronización Telegram] Proveedor asociado al producto "${it.name}" en inventario.`
            : `[Sincronización Manual] Proveedor asociado al producto "${it.name}" en inventario.`,
        });
      }
    }
  });

  // 2. Enrich phone contact from purchases only for suppliers associated with current inventory products
  purchasesList.forEach((po) => {
    if (po.supplierName && po.supplierName.trim()) {
      const key = po.supplierName.trim().toLowerCase();
      if (discoveredMap.has(key) && po.supplierContact && !discoveredMap.get(key)?.phone) {
        discoveredMap.get(key)!.phone = po.supplierContact;
      }
    }
  });

  // 3. Helper to check if an existing supplier matches any product currently in inventory
  const isSupplierInInventory = (sup: any): boolean => {
    const supNameLower = (sup.name || '').toLowerCase().trim();
    const tradeNameLower = (sup.tradeName || '').toLowerCase().trim();

    return inventoryList.some((it) => {
      const itSup = (it.supplier || (it as any).supplierName || '').toLowerCase().trim();
      if (!itSup) return false;
      return (
        supNameLower === itSup ||
        tradeNameLower === itSup ||
        (supNameLower && (supNameLower.includes(itSup) || itSup.includes(supNameLower))) ||
        (tradeNameLower && (tradeNameLower.includes(itSup) || itSup.includes(tradeNameLower)))
      );
    });
  };

  // 4. Prune any suppliers that do not have products currently in inventory
  let deletedCount = 0;
  for (const sup of existingSuppliers) {
    if (!isSupplierInInventory(sup) && sup.id) {
      await deleteSupplier(sup.id).catch(() => {});
      deletedCount++;
    }
  }

  // Refresh remaining suppliers after pruning
  const updatedExistingSuppliers = await getSuppliers(targetUserId);

  // 5. Create suppliers for inventory items that don't already exist in directory
  const newlyCreated: any[] = [];

  for (const [key, data] of Array.from(discoveredMap.entries())) {
    const alreadyExists = updatedExistingSuppliers.some((s) => {
      const sName = (s.name || '').toLowerCase().trim();
      const sTrade = (s.tradeName || '').toLowerCase().trim();
      return (
        sName === key ||
        sTrade === key ||
        (sName && (sName.includes(key) || key.includes(sName))) ||
        (sTrade && (sTrade.includes(key) || key.includes(sTrade)))
      );
    });

    if (!alreadyExists) {
      const created = await createSupplier({
        userId: targetUserId,
        name: data.name,
        tradeName: data.name,
        phone: data.phone || '+593 99 999 9999',
        category: data.category || (data.source === 'telegram' ? 'Importación Telegram' : 'Suministro Directo'),
        city: 'Ecuador',
        country: 'Ecuador',
        paymentTerms: 'contado',
        status: 'active',
        notes: data.notes || `[Sincronización] Proveedor registrado automáticamente (${data.source}).`,
      });

      if (created) newlyCreated.push(created);
    }
  }

  return {
    success: true,
    syncedCount: discoveredMap.size,
    totalDiscovered: discoveredMap.size,
    newlyCreatedCount: newlyCreated.length,
    deletedCount,
    message: discoveredMap.size > 0
      ? `✓ Catálogo sincronizado: ${discoveredMap.size} proveedor(es) correspondiente(s) a los productos en inventario.`
      : `✓ Catálogo sincronizado: No hay productos con proveedores en el inventario actual.`,
  };
}

// ==========================================
// COMPRAS Y PEDIDOS A PROVEEDORES (PURCHASES)
// ==========================================

/**
 * ERP Purchasing State Machine (Abastecimiento y Órdenes a Proveedores):
 *
 * Flujo unidireccional y protegido:
 * pending            -> ordered, in_transit, partially_received, received, cancelled
 * ordered            -> in_transit, partially_received, received, cancelled
 * in_transit         -> partially_received, received, cancelled
 * partially_received -> partially_received, received, cancelled
 * received           -> TERMINAL (Cerrado - Inmutable - Ingreso físico a bodega confirmado)
 * cancelled          -> TERMINAL (Anulado - Inmutable - Orden descartada)
 */
export const ALLOWED_PURCHASE_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['ordered', 'confirmed', 'in_transit', 'partially_received', 'received', 'cancelled'],
  ordered: ['confirmed', 'in_transit', 'partially_received', 'received', 'cancelled'],
  confirmed: ['ordered', 'in_transit', 'partially_received', 'received', 'cancelled'],
  in_transit: ['partially_received', 'received', 'cancelled'],
  partially_received: ['partially_received', 'received', 'cancelled'],
  received: [],
  cancelled: [],
};

export function isValidPurchaseStatusTransition(currentStatus: string, nextStatus: string): boolean {
  const curr = String(currentStatus || '').toLowerCase().trim();
  const next = String(nextStatus || '').toLowerCase().trim();
  if (curr === next) return true; // Mantener el mismo estado para actualizaciones de notas/voucher
  const allowed = ALLOWED_PURCHASE_STATUS_TRANSITIONS[curr];
  if (!allowed) return false;
  return allowed.includes(next);
}

export function getPurchaseStatusTransitionError(currentStatus: string, nextStatus: string): string {
  const curr = String(currentStatus || '').toLowerCase().trim();
  const next = String(nextStatus || '').toLowerCase().trim();
  if (curr === next) return '';

  if (curr === 'received') {
    return 'Integridad de Datos ERP: La orden de compra ya se encuentra RECIBIDA en bodega (Cerrada e Inmutable). El ingreso físico de stock y costo histórico ya fueron asentados. Si requieres devolver productos, utiliza el flujo de Devolución a Proveedor.';
  }
  if (curr === 'cancelled') {
    return 'Integridad de Datos ERP: La orden de compra fue CANCELADA y anulada. No se puede reactivar una orden descartada; genere una nueva orden de compra.';
  }
  if (curr === 'partially_received' && (next === 'pending' || next === 'ordered' || next === 'confirmed' || next === 'in_transit')) {
    return 'Integridad de Datos ERP: La orden ya tiene entregas parciales ingresadas físicamente a bodega. Debe completarse la recepción total o anular el remanente, pero no puede retroceder a estados preliminares.';
  }
  if (curr === 'in_transit' && (next === 'pending' || next === 'ordered' || next === 'confirmed')) {
    return 'Integridad de Datos ERP: La mercadería ya fue despachada por el proveedor y se encuentra en tránsito. No puede retroceder a borrador o pendiente.';
  }
  if ((curr === 'ordered' || curr === 'confirmed') && next === 'pending') {
    return 'Integridad de Datos ERP: Una orden ya confirmada con el proveedor no puede retroceder a borrador pendiente. Si la transacción se anula, debe marcarse como Cancelada.';
  }
  return `Transición de estado de compra no válida de '${currentStatus}' a '${nextStatus}' bajo la máquina de compras ERP.`;
}


export function normalizePurchaseRecord(p: any) {
  if (!p) return null;
  let parsedItems: any[] = [];
  try {
    parsedItems = typeof p.items === 'string' ? JSON.parse(p.items) : (Array.isArray(p.items) ? p.items : []);
  } catch {}

  let parsedReceptions: any[] = [];
  try {
    parsedReceptions = typeof p.receptions === 'string' ? JSON.parse(p.receptions) : (Array.isArray(p.receptions) ? p.receptions : []);
  } catch {}

  let parsedReturns: any[] = [];
  try {
    parsedReturns = typeof p.returns === 'string' ? JSON.parse(p.returns) : (Array.isArray(p.returns) ? p.returns : []);
  } catch {}

  return {
    ...p,
    items: parsedItems,
    receptions: parsedReceptions,
    returns: parsedReturns,
  };
}

export async function getPurchases(
  userId?: number,
  filters?: { status?: string; supplierName?: string; linkedCustomerOrderId?: number }
) {
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.purchases) state.purchases = [];
    let list = [...state.purchases];

    if (filters?.status && filters.status !== 'all') {
      list = list.filter((p) => p.status === filters.status);
    }
    if (filters?.supplierName) {
      const q = filters.supplierName.toLowerCase();
      list = list.filter((p) => p.supplierName?.toLowerCase().includes(q));
    }
    if (filters?.linkedCustomerOrderId) {
      list = list.filter((p) => p.linkedCustomerOrderId === filters.linkedCustomerOrderId);
    }

    list.sort((a, b) => new Date(b.createdAt || b.purchaseDate).getTime() - new Date(a.createdAt || a.purchaseDate).getTime());

    return list.map((p) => normalizePurchaseRecord(p));
  }

  try {
    let query = db.select().from(purchases);
    const conditions: any[] = [];

    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(purchases.status, filters.status));
    }
    if (filters?.supplierName) {
      conditions.push(ilike(purchases.supplierName, `%${filters.supplierName}%`));
    }
    if (filters?.linkedCustomerOrderId) {
      conditions.push(eq(purchases.linkedCustomerOrderId, filters.linkedCustomerOrderId));
    }

    const rows = conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(desc(purchases.createdAt))
      : await query.orderBy(desc(purchases.createdAt));

    return rows.map((p) => normalizePurchaseRecord(p));
  } catch (error) {
    console.warn('Error fetching purchases from SQL, fallback to local store:', error);
    const state = storage.getState();
    if (!state.purchases) state.purchases = [];
    let list = [...state.purchases];
    if (filters?.status && filters.status !== 'all') {
      list = list.filter((p) => p.status === filters.status);
    }
    return list.map((p) => normalizePurchaseRecord(p));
  }
}

export async function getPurchaseById(id: number) {
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.purchases) state.purchases = [];
    const p = state.purchases.find((item) => item.id === id);
    if (!p) return null;
    return normalizePurchaseRecord(p);
  }

  try {
    const rows = await db.select().from(purchases).where(eq(purchases.id, id)).limit(1);
    if (!rows[0]) return null;
    return normalizePurchaseRecord(rows[0]);
  } catch (error) {
    console.warn('Error fetching purchase by id from SQL, fallback:', error);
    const state = storage.getState();
    if (!state.purchases) state.purchases = [];
    const p = state.purchases.find((item) => item.id === id);
    if (!p) return null;
    return normalizePurchaseRecord(p);
  }
}

export async function createPurchase(data: {
  userId?: number;
  supplierName: string;
  supplierContact?: string;
  items: any[];
  totalCost?: number | string;
  status?: string; // 'pending', 'ordered', 'in_transit', 'received', 'cancelled'
  paymentStatus?: string; // 'unpaid', 'paid'
  linkedCustomerOrderId?: number;
  linkedCustomerOrderNumber?: string;
  receiptVoucher?: string;
  notes?: string;
  purchaseDate?: string;
}) {
  const userId = data.userId || 1;
  const purchaseNumber = `COM-${Date.now().toString().slice(-6)}`;
  const status = data.status || 'pending';
  // Regla ERP: Si el estado de la compra es 'pending', el estado de pago SIEMPRE es 'unpaid' (por pagar)
  const paymentStatus = status === 'pending' ? 'unpaid' : (data.paymentStatus || 'unpaid');
  const now = new Date().toISOString();

  // Calculate total cost if not provided
  let calculatedTotal = 0;
  if (Array.isArray(data.items)) {
    calculatedTotal = data.items.reduce((sum, it) => {
      const unitCost = Number(it.costPrice ?? it.salePrice ?? 0);
      const qty = Number(it.quantity ?? 1);
      return sum + (unitCost * qty);
    }, 0);
  }
  const cleanTotal = cleanNumericString(data.totalCost !== undefined ? data.totalCost : calculatedTotal, '0.00');

  // If initial status is already 'received', we should increment inventory stock immediately
  const shouldIncrementStock = status === 'received';

  // If linkedCustomerOrderId is provided, check if the sales order is already delivered/cancelled
  if (data.linkedCustomerOrderId) {
    let checkOrder: any = null;
    if (isPostgresConfigured()) {
      try {
        const [ord] = await db
          .select()
          .from(customerOrders)
          .where(eq(customerOrders.id, data.linkedCustomerOrderId))
          .limit(1);
        checkOrder = ord || null;
      } catch {}
    }
    if (!checkOrder) {
      const state = storage.getState();
      checkOrder = (state.customerOrders || []).find((o) => o.id === data.linkedCustomerOrderId) || null;
    }
    if (
      checkOrder &&
      (checkOrder.status === 'delivered' ||
        checkOrder.status === 'cancelled' ||
        checkOrder.fulfillmentStatus === 'delivered')
    ) {
      throw new Error(
        `Integridad ERP: El pedido de venta #${checkOrder.orderNumber || data.linkedCustomerOrderId} ya se encuentra entregado o cerrado. No se pueden generar nuevas órdenes de compra al proveedor.`
      );
    }
  }

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.purchases) state.purchases = [];
    if (!state.nextId.purchases) state.nextId.purchases = 1;
    const nextId = state.nextId.purchases++;

    const newPurchase = {
      id: nextId,
      userId,
      purchaseNumber,
      supplierName: data.supplierName || 'Proveedor Telegram',
      supplierContact: data.supplierContact || '',
      items: typeof data.items === 'string' ? data.items : JSON.stringify(data.items || []),
      totalCost: cleanTotal,
      status,
      paymentStatus,
      linkedCustomerOrderId: data.linkedCustomerOrderId || null,
      linkedCustomerOrderNumber: data.linkedCustomerOrderNumber || null,
      receiptVoucher: data.receiptVoucher || null,
      notes: data.notes || '',
      purchaseDate: data.purchaseDate || now,
      receivedDate: shouldIncrementStock ? now : null,
      createdAt: now,
      updatedAt: now,
    };

    state.purchases.unshift(newPurchase);

    if (shouldIncrementStock && Array.isArray(data.items)) {
      await adjustInventoryStockForItems(data.items, 1);
    }

    // If linked to a customer order, update the order's fulfillment status (only if order is not already delivered)
    if (data.linkedCustomerOrderId) {
      const linkedOrder = state.customerOrders.find((o) => o.id === data.linkedCustomerOrderId);
      if (linkedOrder && linkedOrder.status !== 'delivered' && linkedOrder.fulfillmentStatus !== 'delivered') {
        linkedOrder.fulfillmentStatus = shouldIncrementStock ? 'supplier_received' : 'supplier_ordered';
        linkedOrder.linkedPurchaseId = newPurchase.id;
        linkedOrder.linkedPurchaseNumber = newPurchase.purchaseNumber;
      }
    }

    storage.save();

    let parsedItems = [];
    try {
      parsedItems = JSON.parse(newPurchase.items);
    } catch {}

    return {
      success: true,
      purchase: { ...newPurchase, items: parsedItems },
      purchaseNumber,
    };
  }

  try {
    const targetUserId = await resolveValidUserId(data.userId);
    const result = await db
      .insert(purchases)
      .values({
        userId: targetUserId,
        purchaseNumber,
        supplierName: data.supplierName || 'Proveedor Telegram',
        supplierContact: data.supplierContact || '',
        items: typeof data.items === 'string' ? data.items : JSON.stringify(data.items || []),
        totalCost: cleanTotal,
        status,
        paymentStatus,
        linkedCustomerOrderId: data.linkedCustomerOrderId || null,
        linkedCustomerOrderNumber: data.linkedCustomerOrderNumber || null,
        receiptVoucher: data.receiptVoucher || null,
        notes: data.notes || '',
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : new Date(),
        receivedDate: shouldIncrementStock ? new Date() : null,
      })
      .returning();

    const created = result[0];

    if (shouldIncrementStock && Array.isArray(data.items)) {
      await adjustInventoryStockForItems(data.items, 1);
    }

    // Sync to local fallback storage
    const state = storage.getState();
    if (!state.purchases) state.purchases = [];
    state.purchases.unshift(created as any);

    if (data.linkedCustomerOrderId) {
      try {
        const [targetOrder] = await db
          .select()
          .from(customerOrders)
          .where(eq(customerOrders.id, data.linkedCustomerOrderId))
          .limit(1);
        if (targetOrder && targetOrder.status !== 'delivered' && targetOrder.fulfillmentStatus !== 'delivered') {
          await db
            .update(customerOrders)
            .set({
              fulfillmentStatus: shouldIncrementStock ? 'supplier_received' : 'supplier_ordered',
              linkedPurchaseId: created.id,
              linkedPurchaseNumber: created.purchaseNumber,
            })
            .where(eq(customerOrders.id, data.linkedCustomerOrderId));
        }
      } catch (linkErr) {
        console.warn('Could not link customer order in SQL:', linkErr);
      }

      const localOrd = state.customerOrders.find((o) => o.id === data.linkedCustomerOrderId);
      if (localOrd && localOrd.status !== 'delivered' && localOrd.fulfillmentStatus !== 'delivered') {
        localOrd.fulfillmentStatus = shouldIncrementStock ? 'supplier_received' : 'supplier_ordered';
        localOrd.linkedPurchaseId = created.id;
        localOrd.linkedPurchaseNumber = created.purchaseNumber;
      }
    }

    storage.save();

    return {
      success: true,
      purchase: normalizePurchaseRecord(created),
      purchaseNumber,
    };
  } catch (error) {
    console.error('Error creating purchase in SQL, fallback to local store:', error);
    const state = storage.getState();
    if (!state.purchases) state.purchases = [];
    if (!state.nextId.purchases) state.nextId.purchases = 1;
    const nextId = state.nextId.purchases++;

    const newPurchase = {
      id: nextId,
      userId,
      purchaseNumber,
      supplierName: data.supplierName || 'Proveedor Telegram',
      supplierContact: data.supplierContact || '',
      items: typeof data.items === 'string' ? data.items : JSON.stringify(data.items || []),
      totalCost: cleanTotal,
      status,
      paymentStatus,
      linkedCustomerOrderId: data.linkedCustomerOrderId || null,
      linkedCustomerOrderNumber: data.linkedCustomerOrderNumber || null,
      receiptVoucher: data.receiptVoucher || null,
      notes: data.notes || '',
      purchaseDate: data.purchaseDate || now,
      receivedDate: shouldIncrementStock ? now : null,
      createdAt: now,
      updatedAt: now,
    };

    state.purchases.unshift(newPurchase);
    if (shouldIncrementStock && Array.isArray(data.items)) {
      await adjustInventoryStockForItems(data.items, 1);
    }
    storage.save();

    return {
      success: true,
      purchase: normalizePurchaseRecord(newPurchase),
      purchaseNumber,
    };
  }
}

export async function updatePurchase(
  id: number,
  data: {
    supplierName?: string;
    supplierContact?: string;
    items?: any[];
    totalCost?: number | string;
    status?: string;
    paymentStatus?: string;
    receiptVoucher?: string;
    shippingGuideNumber?: string;
    receptions?: any[];
    returns?: any[];
    notes?: string;
    purchaseDate?: string;
    receivedDate?: string;
    linkedCustomerOrderId?: number | null;
    linkedCustomerOrderNumber?: string | null;
  }
) {
  const updatePayload: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };

  if (data.supplierName !== undefined) updatePayload.supplierName = data.supplierName;
  if (data.supplierContact !== undefined) updatePayload.supplierContact = data.supplierContact;
  if (data.items !== undefined) {
    updatePayload.items = typeof data.items === 'string' ? data.items : JSON.stringify(data.items);
  }
  if (data.totalCost !== undefined) {
    updatePayload.totalCost = cleanNumericString(data.totalCost, '0.00');
  }
  if (data.status !== undefined) updatePayload.status = data.status;
  if (data.paymentStatus !== undefined) updatePayload.paymentStatus = data.paymentStatus;
  if (data.receiptVoucher !== undefined) updatePayload.receiptVoucher = data.receiptVoucher;
  if (data.shippingGuideNumber !== undefined) updatePayload.shippingGuideNumber = data.shippingGuideNumber;
  if ((data as any).receptions !== undefined) {
    updatePayload.receptions = typeof (data as any).receptions === 'string' ? (data as any).receptions : JSON.stringify((data as any).receptions);
  }
  if ((data as any).returns !== undefined) {
    updatePayload.returns = typeof (data as any).returns === 'string' ? (data as any).returns : JSON.stringify((data as any).returns);
  }
  if (data.notes !== undefined) updatePayload.notes = data.notes;
  if (data.purchaseDate !== undefined) updatePayload.purchaseDate = data.purchaseDate;
  if (data.receivedDate !== undefined) updatePayload.receivedDate = data.receivedDate;
  if (data.linkedCustomerOrderId !== undefined) updatePayload.linkedCustomerOrderId = data.linkedCustomerOrderId;
  if (data.linkedCustomerOrderNumber !== undefined) updatePayload.linkedCustomerOrderNumber = data.linkedCustomerOrderNumber;

  // Check status transition to handle inventory stock adjustments
  let existingPurchase = await getPurchaseById(id);
  if (!existingPurchase) {
    throw new Error('Compra a proveedor no encontrada');
  }

  const prevStatus = existingPurchase.status;
  const newStatus = data.status !== undefined ? data.status : prevStatus;

  // Regla ERP #1: Si el estado resultante es 'pending', el estado de pago SIEMPRE es 'unpaid' (por pagar)
  if (newStatus === 'pending') {
    updatePayload.paymentStatus = 'unpaid';
  }

  // ERP Purchasing State Machine Transition Enforcement
  if (newStatus !== prevStatus) {
    if (!isValidPurchaseStatusTransition(prevStatus, newStatus)) {
      throw new Error(getPurchaseStatusTransitionError(prevStatus, newStatus));
    }
  }

  // Regla ERP #3: Cuando se confirma el pedido por el proveedor ya no se puede modificar ni eliminar el pedido ya que se encuentra pagado, solo se puede recibir
  if (prevStatus !== 'pending' && !(data as any).isInternalOrderSync) {
    const isDirectBaseEdit =
      data.totalCost !== undefined ||
      data.supplierName !== undefined ||
      data.purchaseDate !== undefined ||
      (data.items !== undefined && !data.receptions && !data.returns);

    if (isDirectBaseEdit) {
      const statusLabel =
        prevStatus === 'received'
          ? 'Recibida en Bodega'
          : prevStatus === 'partially_received'
          ? 'Parcialmente Recibida'
          : prevStatus === 'in_transit'
          ? 'En Tránsito'
          : prevStatus === 'cancelled'
          ? 'Cancelada'
          : 'Confirmada con Proveedor';

      throw new Error(
        `Integridad de Datos ERP: La orden #${existingPurchase.purchaseNumber} está en estado '${statusLabel}' y se encuentra pagada. No se puede modificar ni eliminar el pedido; únicamente se puede proceder a recibir la mercadería.`
      );
    }
  }

  const wasReceived = prevStatus === 'received';
  const isNowReceived = newStatus === 'received';

  if (!wasReceived && isNowReceived) {
    // Goods arrived
    const isLinkedOrderPurchase = Boolean(existingPurchase.linkedCustomerOrderId);
    const itemsToAdd = data.items !== undefined ? data.items : existingPurchase.items;

    if (isLinkedOrderPurchase) {
      // Products were bought specifically for the linked customer order.
      // They are tagged as RESERVED for that customer, so they are NOT added to general available stock.
      // This prevents them from being sold to other online store buyers.
      console.log(`[Purchases] Compra #${existingPurchase.purchaseNumber} vinculada al Pedido #${existingPurchase.linkedCustomerOrderNumber || existingPurchase.linkedCustomerOrderId}. Stock RESERVADO para el cliente (no ingresa al stock general de venta).`);
    } else {
      // General inventory replenishment purchase -> increase general available catalog stock
      await adjustInventoryStockForItems(itemsToAdd, 1);
    }

    if (!updatePayload.receivedDate) {
      updatePayload.receivedDate = new Date().toISOString();
    }
  }

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.purchases) state.purchases = [];
    const p = state.purchases.find((item) => item.id === id);
    if (!p) throw new Error('Compra no encontrada');
    Object.assign(p, updatePayload);

    // If purchase was linked to customer order, synchronize customer order fulfillment status (only if order is not delivered)
    if (p.linkedCustomerOrderId && data.status !== undefined) {
      const ord = state.customerOrders.find((o) => o.id === p.linkedCustomerOrderId);
      if (ord && ord.status !== 'delivered' && ord.fulfillmentStatus !== 'delivered') {
        // Check if there are other active purchases linked to this customer order
        const otherLinked = (state.purchases || []).filter(
          (otherP) => otherP.linkedCustomerOrderId === p.linkedCustomerOrderId && otherP.id !== p.id && otherP.status !== 'cancelled'
        );
        const allReceived = newStatus === 'received' && otherLinked.every((otherP) => otherP.status === 'received');

        if (allReceived) {
          let hasPartialDelivered = false;
          try {
            const parsed = typeof ord.items === 'string' ? JSON.parse(ord.items) : ord.items || [];
            hasPartialDelivered = parsed.some((it: any) => (Number(it.deliveredQuantity) || 0) > 0);
          } catch {}
          ord.fulfillmentStatus = hasPartialDelivered ? 'partial_ready' : 'supplier_received';
        } else if (newStatus === 'ordered' || newStatus === 'in_transit' || (newStatus === 'received' && !allReceived)) {
          ord.fulfillmentStatus = 'supplier_ordered';
        } else if (newStatus === 'pending') {
          ord.fulfillmentStatus = 'supplier_pending';
        }
      }
    }

    storage.save();

    return normalizePurchaseRecord(p);
  }

  // Prepare type-safe payload for PostgreSQL (Drizzle PgTimestamp expects Date instances)
  const sqlPayload: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (updatePayload.supplierName !== undefined) sqlPayload.supplierName = updatePayload.supplierName;
  if (updatePayload.supplierContact !== undefined) sqlPayload.supplierContact = updatePayload.supplierContact;
  if (updatePayload.items !== undefined) {
    sqlPayload.items = typeof updatePayload.items === 'string' ? updatePayload.items : JSON.stringify(updatePayload.items);
  }
  if (updatePayload.totalCost !== undefined) sqlPayload.totalCost = updatePayload.totalCost;
  if (updatePayload.status !== undefined) sqlPayload.status = updatePayload.status;
  if (updatePayload.paymentStatus !== undefined) sqlPayload.paymentStatus = updatePayload.paymentStatus;
  if (updatePayload.receiptVoucher !== undefined) sqlPayload.receiptVoucher = updatePayload.receiptVoucher;
  if (updatePayload.receptions !== undefined) {
    sqlPayload.receptions = typeof updatePayload.receptions === 'string' ? updatePayload.receptions : JSON.stringify(updatePayload.receptions);
  }
  if (updatePayload.returns !== undefined) {
    sqlPayload.returns = typeof updatePayload.returns === 'string' ? updatePayload.returns : JSON.stringify(updatePayload.returns);
  }
  if (updatePayload.notes !== undefined) sqlPayload.notes = updatePayload.notes;
  if (updatePayload.purchaseDate !== undefined) {
    sqlPayload.purchaseDate = updatePayload.purchaseDate ? new Date(updatePayload.purchaseDate) : new Date();
  }
  if (updatePayload.receivedDate !== undefined) {
    sqlPayload.receivedDate = updatePayload.receivedDate ? new Date(updatePayload.receivedDate) : null;
  }
  if (updatePayload.linkedCustomerOrderId !== undefined) sqlPayload.linkedCustomerOrderId = updatePayload.linkedCustomerOrderId;
  if (updatePayload.linkedCustomerOrderNumber !== undefined) sqlPayload.linkedCustomerOrderNumber = updatePayload.linkedCustomerOrderNumber;

  try {
    const result = await db
      .update(purchases)
      .set(sqlPayload)
      .where(eq(purchases.id, id))
      .returning();

    const updated = result[0];
    const state = storage.getState();
    if (!state.purchases) state.purchases = [];
    const localP = state.purchases.find((item) => item.id === id);
    if (localP) {
      Object.assign(localP, updatePayload);
      storage.save();
    }

    const targetOrderId = updated?.linkedCustomerOrderId || existingPurchase.linkedCustomerOrderId;
    if (targetOrderId && data.status !== undefined) {
      let foundOrd: any = null;
      try {
        const [ord] = await db
          .select()
          .from(customerOrders)
          .where(eq(customerOrders.id, targetOrderId))
          .limit(1);
        foundOrd = ord || null;
      } catch {}

      if (foundOrd && foundOrd.status !== 'delivered' && foundOrd.fulfillmentStatus !== 'delivered') {
        let targetFulfillment: string | null = null;
        let allOtherPurchases: any[] = [];
        try {
          allOtherPurchases = await db
            .select()
            .from(purchases)
            .where(eq(purchases.linkedCustomerOrderId, targetOrderId));
        } catch {}

        const activeOther = allOtherPurchases.filter((op: any) => op.id !== id && op.status !== 'cancelled');
        const allReceived = newStatus === 'received' && activeOther.every((op: any) => op.status === 'received');

        if (allReceived) {
          let hasPartialDelivered = false;
          try {
            const parsed = typeof foundOrd.items === 'string' ? JSON.parse(foundOrd.items) : foundOrd.items || [];
            hasPartialDelivered = parsed.some((it: any) => (Number(it.deliveredQuantity) || 0) > 0);
          } catch {}
          targetFulfillment = hasPartialDelivered ? 'partial_ready' : 'supplier_received';
        } else if (newStatus === 'ordered' || newStatus === 'in_transit' || (newStatus === 'received' && !allReceived)) {
          targetFulfillment = 'supplier_ordered';
        } else if (newStatus === 'pending') {
          targetFulfillment = 'supplier_pending';
        }

        if (targetFulfillment) {
          try {
            await db
              .update(customerOrders)
              .set({ fulfillmentStatus: targetFulfillment })
              .where(eq(customerOrders.id, targetOrderId));
          } catch (errLink) {
            console.warn('Could not update customer order fulfillment status in SQL:', errLink);
          }

          const localOrd = state.customerOrders?.find((o) => o.id === targetOrderId);
          if (localOrd && localOrd.status !== 'delivered' && localOrd.fulfillmentStatus !== 'delivered') {
            localOrd.fulfillmentStatus = targetFulfillment;
            storage.save();
          }
        }
      }
    }

    return normalizePurchaseRecord(updated || localP);
  } catch (error) {
    console.warn('Error updating purchase in SQL, fallback to local store:', error);
    const state = storage.getState();
    if (!state.purchases) state.purchases = [];
    const p = state.purchases.find((item) => item.id === id);
    if (p) {
      Object.assign(p, updatePayload);
      storage.save();
      return normalizePurchaseRecord(p);
    }
    throw error;
  }
}

/**
 * 1-Click Receive Purchase in Warehouse:
 * Marks purchase as 'received', registers receivedDate, increments stock of all items in catalog,
 * and updates any linked customer order to 'supplier_received' ready for dispatch!
 */
export async function receivePurchase(id: number) {
  const purchase = await getPurchaseById(id);
  if (!purchase) {
    throw new Error('Compra no encontrada');
  }

  if (purchase.status === 'received') {
    return { success: true, message: 'La compra ya fue recibida anteriormente', purchase };
  }

  const updated = await updatePurchase(id, {
    status: 'received',
    receivedDate: new Date().toISOString(),
    paymentStatus: 'paid',
  });

  const isLinked = Boolean(purchase.linkedCustomerOrderId);
  const successMsg = isLinked
    ? `¡Compra #${purchase.purchaseNumber} recibida en bodega! La mercancía ha quedado RESERVADA para el Pedido de Cliente #${purchase.linkedCustomerOrderNumber || purchase.linkedCustomerOrderId} (lista para entrega).`
    : `¡Compra #${purchase.purchaseNumber} recibida exitosamente! El stock de los productos ha sido ingresado al inventario general.`;

  return {
    success: true,
    message: successMsg,
    purchase: updated,
  };
}

/**
 * Confirms a pending purchase with the supplier:
 * Transitions status from 'pending' to 'ordered' (confirmado), locking it against direct deletion,
 * and updates any linked customer order's fulfillment status to 'supplier_ordered'.
 */
export async function confirmPurchase(id: number) {
  const purchase = await getPurchaseById(id);
  if (!purchase) {
    throw new Error('Compra no encontrada');
  }

  if (purchase.status === 'ordered' || purchase.status === 'confirmed' || purchase.status === 'in_transit') {
    return {
      success: true,
      message: `La orden de compra #${purchase.purchaseNumber} ya se encuentra confirmada con el proveedor.`,
      purchase,
    };
  }

  if (purchase.status !== 'pending') {
    throw new Error(
      `No se puede confirmar una orden en estado '${purchase.status}'. Solo las órdenes en estado 'Pendiente' pueden confirmarse.`
    );
  }

  // Regla de Integridad ERP:
  // Si la compra fue generada a partir de un pedido de venta, la compra al proveedor NO puede confirmarse
  // si el pedido de venta no ha sido confirmado primero por el vendedor.
  if (purchase.linkedCustomerOrderId || purchase.linkedCustomerOrderNumber) {
    const orders = await getCustomerOrders();
    const linkedOrder = orders.find(
      (o) =>
        (purchase.linkedCustomerOrderId && Number(o.id) === Number(purchase.linkedCustomerOrderId)) ||
        (purchase.linkedCustomerOrderNumber && o.orderNumber && o.orderNumber.trim() === purchase.linkedCustomerOrderNumber.trim())
    );

    if (linkedOrder) {
      const ordStatus = String(linkedOrder.status || 'pending').toLowerCase().trim();
      const isConfirmed = ordStatus === 'confirmed' || ordStatus === 'shipped' || ordStatus === 'delivered';
      if (!isConfirmed) {
        const orderRef = linkedOrder.orderNumber || purchase.linkedCustomerOrderNumber || purchase.linkedCustomerOrderId;
        throw new Error(
          `No se puede confirmar la compra al proveedor #${purchase.purchaseNumber} porque el Pedido de Venta #${orderRef} se encuentra en estado '${linkedOrder.status === 'pending' ? 'Pendiente' : linkedOrder.status}'. Debe confirmar el pedido de venta antes de confirmar la compra al proveedor.`
        );
      }
    }
  }

  const updated = await updatePurchase(id, {
    status: 'ordered',
    paymentStatus: 'paid',
  });

  return {
    success: true,
    message: `✓ ¡Orden de Compra #${purchase.purchaseNumber} confirmada con el proveedor y marcada como pagada! La orden queda bloqueada contra modificaciones y ahora puedes registrar recepciones parciales o totales cuando llegue la mercadería.`,
    purchase: updated,
  };
}

export async function deletePurchase(id: number, forceFromCustomerOrder: boolean = false) {
  const purchase = await getPurchaseById(id);
  if (!purchase) {
    return { success: true, deleted: null };
  }

  // Regla de Integridad ERP:
  // Los pedidos al proveedor generados a partir de pedidos de venta NO se pueden eliminar directamente.
  // Solo se eliminan automáticamente si el pedido de cliente es eliminado.
  const isGeneratedFromSalesOrder = Boolean(
    purchase.linkedCustomerOrderId ||
    purchase.linkedCustomerOrderNumber ||
    (Array.isArray(purchase.items) && purchase.items.some((it: any) => it.customerOrderId || it.orderNumber))
  );

  if (!forceFromCustomerOrder && isGeneratedFromSalesOrder) {
    const orderRef = purchase.linkedCustomerOrderNumber || purchase.linkedCustomerOrderId || 'de venta';
    throw new Error(
      `No se puede eliminar la orden al proveedor #${purchase.purchaseNumber} porque fue generada a partir del pedido de venta #${orderRef}. Solo se elimina automáticamente si dicho pedido de venta es eliminado.`
    );
  }

  // Regla de Integridad ERP:
  // Solo se pueden eliminar compras en estado 'pending' (Borrador / Averiguación de disponibilidad),
  // a menos que sea una eliminación forzada por anulación del pedido de cliente que la originó.
  if (!forceFromCustomerOrder && purchase.status !== 'pending') {
    const statusLabel =
      purchase.status === 'received'
        ? 'Recibida en Bodega (Cerrada)'
        : purchase.status === 'partially_received'
        ? 'Recepción Parcial'
        : purchase.status === 'in_transit'
        ? 'En Tránsito'
        : purchase.status === 'ordered' || purchase.status === 'confirmed'
        ? 'Confirmada con Proveedor'
        : purchase.status;

    throw new Error(
      `Integridad de Datos ERP: No se puede eliminar la orden de compra #${purchase.purchaseNumber} porque se encuentra en estado '${statusLabel}'. Solo las órdenes en estado 'Pendiente' (Averiguación / Borrador) pueden eliminarse.`
    );
  }

  // Unlink any customer orders that had this linkedPurchaseId
  try {
    if (isPostgresConfigured()) {
      await db
        .update(customerOrders)
        .set({
          linkedPurchaseId: null,
          linkedPurchaseNumber: null,
          fulfillmentStatus: 'supplier_pending',
        })
        .where(eq(customerOrders.linkedPurchaseId, id));
    }
  } catch (linkErr) {
    console.warn('Could not unlink customer orders for purchase in SQL:', linkErr);
  }

  const state = storage.getState();
  if (state.customerOrders) {
    state.customerOrders.forEach((co) => {
      if (co.linkedPurchaseId === id) {
        co.linkedPurchaseId = undefined;
        co.linkedPurchaseNumber = undefined;
        if (co.fulfillmentStatus === 'supplier_ordered' || co.fulfillmentStatus === 'supplier_received') {
          co.fulfillmentStatus = 'supplier_pending';
        }
      }
    });
  }

  if (!isPostgresConfigured()) {
    if (!state.purchases) state.purchases = [];
    const idx = state.purchases.findIndex((p) => p.id === id);
    let deleted = null;
    if (idx !== -1) {
      deleted = state.purchases.splice(idx, 1)[0];
      storage.save();
    }
    return { success: true, deleted };
  }

  try {
    const result = await db.delete(purchases).where(eq(purchases.id, id)).returning();
    if (!state.purchases) state.purchases = [];
    const idx = state.purchases.findIndex((p) => p.id === id);
    if (idx !== -1) {
      state.purchases.splice(idx, 1);
      storage.save();
    }
    return { success: true, deleted: result[0] || null };
  } catch (error) {
    console.warn('Error deleting purchase from SQL, fallback to local store:', error);
    if (!state.purchases) state.purchases = [];
    const idx = state.purchases.findIndex((p) => p.id === id);
    let deleted = null;
    if (idx !== -1) {
      deleted = state.purchases.splice(idx, 1)[0];
      storage.save();
    }
    return { success: true, deleted };
  }
}

/**
 * Records a partial or staged reception of goods from supplier.
 * - Only increments physical stock for the quantities actually received in this batch
 * - Calculates pending remaining quantities
 * - Sets status to 'partially_received' or 'received' (if all delivered)
 * - Updates catalog cost price with current purchase cost price to maintain real profit calculations
 */
export async function recordPurchasePartialReception(
  purchaseId: number,
  data: {
    receptions: Array<{
      itemIndex?: number;
      id?: number;
      inventoryItemId?: number;
      sku?: string;
      name?: string;
      quantity?: number;
      receivedQuantity?: number;
      costPrice?: number | string;
    }>;
    shippingGuideNumber?: string;
    receiptVoucher?: string;
    notes?: string;
    updateProductCost?: boolean;
  },
  userId: number = 1
) {
  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) {
    throw new Error('Compra a proveedor no encontrada');
  }

  if (purchase.status === 'received') {
    throw new Error('Integridad ERP: Esta compra ya se encuentra totalmente RECIBIDA en bodega (Cerrada).');
  }
  if (purchase.status === 'cancelled') {
    throw new Error('Integridad ERP: No se puede recibir mercancía de una compra CANCELADA.');
  }

  let items = Array.isArray(purchase.items) ? [...purchase.items] : [];
  const now = new Date().toISOString();
  const receptionBatchItems: Array<{ inventoryItemId?: number; name: string; sku?: string; quantity: number; costPrice: string | number }> = [];

  let newlyReceivedCount = 0;

  items = items.map((item) => {
    const matched = (data.receptions || []).find(
      (r: any, rIdx: number) =>
        (r.itemIndex !== undefined && r.itemIndex === items.indexOf(item)) ||
        (r.id && (r.id === (item as any).id || String(r.id) === String((item as any).id))) ||
        (r.inventoryItemId && r.inventoryItemId === item.inventoryItemId) ||
        (r.sku && item.sku && r.sku.toLowerCase().trim() === item.sku.toLowerCase().trim()) ||
        (r.name && item.name && r.name.trim().toLowerCase() === item.name.trim().toLowerCase())
    );

    const orderedQty = Number(item.quantity) || 1;
    const previouslyReceived = Number(item.receivedQuantity) || 0;
    const addQty = matched ? Math.max(0, Number(matched.receivedQuantity) || Number(matched.quantity) || 0) : 0;
    const currentTotalReceived = Math.min(orderedQty, previouslyReceived + addQty);
    const pendingQty = Math.max(0, orderedQty - currentTotalReceived);

    if (addQty > 0) {
      newlyReceivedCount += addQty;
      receptionBatchItems.push({
        inventoryItemId: item.inventoryItemId,
        name: item.name,
        sku: item.sku,
        quantity: addQty,
        costPrice: item.costPrice,
      });
    }

    return {
      ...item,
      receivedQuantity: currentTotalReceived,
      pendingQuantity: pendingQty,
    };
  });

  if (newlyReceivedCount === 0) {
    throw new Error('Debe especificar al menos 1 unidad recibida en esta entrega.');
  }

  // Check if all items in the purchase are fully received
  const totalOrdered = items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
  const totalReceivedSoFar = items.reduce((sum, it) => sum + (Number(it.receivedQuantity) || 0), 0);
  const isFullyReceived = totalReceivedSoFar >= totalOrdered;

  const nextStatus = isFullyReceived ? 'received' : 'partially_received';

  // Increment stock in warehouse ONLY for the items received in this batch
  const isLinkedOrderPurchase = Boolean(purchase.linkedCustomerOrderId);
  if (!isLinkedOrderPurchase) {
    await adjustInventoryStockForItems(receptionBatchItems, 1, userId);
  }

  // If updateProductCost !== false, update inventory catalog item cost prices
  if (data.updateProductCost !== false) {
    for (const rItem of receptionBatchItems) {
      if (rItem.costPrice) {
        try {
          const rawCost = cleanNumericString(rItem.costPrice, '0.00');
          if (isPostgresConfigured() && rItem.inventoryItemId) {
            await db
              .update(inventoryItems)
              .set({ costPrice: rawCost, updatedAt: new Date() })
              .where(eq(inventoryItems.id, rItem.inventoryItemId));
          }
          const state = storage.getState();
          if (state.inventoryItems) {
            const found = state.inventoryItems.find((inv) => inv.id === rItem.inventoryItemId || (inv.sku && inv.sku === rItem.sku));
            if (found) {
              found.costPrice = rawCost;
              storage.save();
            }
          }
        } catch (cErr) {
          console.warn('Could not update inventory item cost price:', cErr);
        }
      }
    }
  }

  const receptionRecord = {
    id: `REC-${Date.now()}`,
    date: now,
    guideNumber: data.shippingGuideNumber || '',
    notes: data.notes || '',
    items: receptionBatchItems,
  };

  const existingReceptions = Array.isArray((purchase as any).receptions) ? (purchase as any).receptions : [];
  const updatedReceptions = [...existingReceptions, receptionRecord];

  const updateFields: any = {
    items,
    status: nextStatus,
    receptions: updatedReceptions,
    receivedDate: isFullyReceived ? now : purchase.receivedDate || now,
    notes: (purchase.notes ? purchase.notes + '\n' : '') + `[Recepción Parcial ${new Date().toLocaleDateString('es-EC')}] +${newlyReceivedCount} un. recibidas${data.shippingGuideNumber ? ` (Guía: ${data.shippingGuideNumber})` : ''}`,
  };

  if (data.shippingGuideNumber) updateFields.shippingGuideNumber = data.shippingGuideNumber;
  if (data.receiptVoucher) updateFields.receiptVoucher = data.receiptVoucher;

  const updatedPurchase = await updatePurchase(purchaseId, updateFields);

  return {
    success: true,
    isFullyReceived,
    status: nextStatus,
    receivedUnits: newlyReceivedCount,
    totalReceivedSoFar,
    totalOrdered,
    purchase: updatedPurchase,
    message: isFullyReceived
      ? `✓ ¡Recepción completa! Se ingresaron ${newlyReceivedCount} unidades a bodega. Compra #${purchase.purchaseNumber} cerrada.`
      : `✓ Entrega parcial registrada: +${newlyReceivedCount} unidades ingresadas a bodega. Saldo pendiente: ${totalOrdered - totalReceivedSoFar} unidades.`,
  };
}

/**
 * Records a formal return of goods to supplier (Nota de Devolución / Retorno).
 * - Deducts returned units from warehouse stock (-1 multiplier)
 * - Records return voucher, reason, and credit amount
 * - Automatically registers the refund/credit note in the Payments/Treasury ledger
 * - Keeps accurate audit trail without breaking historical sales
 */
export async function recordPurchaseReturn(
  purchaseId: number,
  data: {
    returns: Array<{
      itemIndex?: number;
      id?: number;
      inventoryItemId?: number;
      sku?: string;
      name?: string;
      quantity?: number;
      returnedQuantity?: number;
      costPrice?: number | string;
    }>;
    reason: string;
    returnVoucher?: string;
    notes?: string;
    settlementType?: 'refund' | 'credit_note'; // 'refund' (ingreso dinero banco/caja) o 'credit_note' (descuento CxP)
    paymentMethod?: string; // 'transferencia_bancaria', 'efectivo', 'deuna', 'cheque', etc.
    bankOrAccount?: string; // 'Banco Pichincha', 'Banco Guayaquil', 'Caja Principal', etc.
    paymentDate?: string;
    processPaymentInTreasury?: boolean;
  },
  userId: number = 1
) {
  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) {
    throw new Error('Compra a proveedor no encontrada');
  }

  if (purchase.status !== 'received' && purchase.status !== 'partially_received') {
    throw new Error('Integridad ERP: Solo se pueden registrar devoluciones sobre compras que ya hayan ingresado mercancía a bodega (Recibidas o Parcialmente Recibidas).');
  }

  let items = Array.isArray(purchase.items) ? [...purchase.items] : [];
  const now = new Date().toISOString();
  const returnBatchItems: Array<{ inventoryItemId?: number; name: string; sku?: string; quantity: number; costPrice: string | number }> = [];

  let totalReturnedUnits = 0;
  let totalRefundValue = 0;

  items = items.map((item, itemIdx) => {
    const matched = (data.returns || []).find(
      (r: any) =>
        (r.itemIndex !== undefined && r.itemIndex === itemIdx) ||
        (r.id && (r.id === (item as any).id || String(r.id) === String((item as any).id))) ||
        (r.inventoryItemId && r.inventoryItemId === item.inventoryItemId) ||
        (r.sku && item.sku && r.sku.toLowerCase().trim() === item.sku.toLowerCase().trim()) ||
        (r.name && item.name && r.name.trim().toLowerCase() === item.name.trim().toLowerCase())
    );

    const returnQty = matched ? Math.max(0, Number(matched.quantity) || Number(matched.returnedQuantity) || Number((matched as any).qty) || 0) : 0;
    const previouslyReturned = Number(item.returnedQuantity) || 0;
    const totalReceived = Number(item.receivedQuantity) || (purchase.status === 'received' ? Number(item.quantity) || 1 : 0);

    if (returnQty > 0) {
      if (returnQty > totalReceived - previouslyReturned) {
        throw new Error(`No se pueden devolver ${returnQty} unidades de '${item.name}' porque solo hay ${totalReceived - previouslyReturned} unidades recibidas disponibles para devolución.`);
      }
      totalReturnedUnits += returnQty;
      const unitCost = Number(item.costPrice) || 0;
      totalRefundValue += unitCost * returnQty;

      returnBatchItems.push({
        inventoryItemId: item.inventoryItemId,
        name: item.name,
        sku: item.sku,
        quantity: returnQty,
        costPrice: item.costPrice,
      });
    }

    return {
      ...item,
      returnedQuantity: previouslyReturned + returnQty,
    };
  });

  if (totalReturnedUnits === 0) {
    throw new Error('Debe especificar al menos 1 unidad a devolver al proveedor.');
  }

  // Deduct returned units from warehouse stock
  const isLinkedOrderPurchase = Boolean(purchase.linkedCustomerOrderId);
  if (!isLinkedOrderPurchase) {
    await adjustInventoryStockForItems(returnBatchItems, -1, userId);
  }

  const validUserId = await resolveValidUserId(userId);
  const settlementType = data.settlementType || 'refund';
  const paymentMethod = data.paymentMethod || (settlementType === 'credit_note' ? 'nota_credito' : 'transferencia_bancaria');
  const bankOrAccount = data.bankOrAccount || (settlementType === 'credit_note' ? 'Nota de Crédito Proveedor' : 'Banco Pichincha');
  const returnRefNumber = data.returnVoucher || `NC-${purchase.purchaseNumber}`;
  const returnRecordId = `DEV-${Date.now()}`;

  let createdPaymentRecord: any = null;
  const shouldProcessPayment = data.processPaymentInTreasury !== false && totalRefundValue > 0;

  if (shouldProcessPayment) {
    try {
      if (settlementType === 'refund') {
        // Dinero devuelto/reembolsado por el proveedor a cuenta de banco o caja (Ingreso a Tesorería)
        createdPaymentRecord = await createPayment(validUserId, {
          type: 'inflow',
          category: 'supplier_refund',
          amount: totalRefundValue,
          paymentMethod,
          bankOrAccount,
          referenceNumber: returnRefNumber,
          paymentDate: data.paymentDate || now,
          status: 'completed',
          notes: `[Devolución Proveedor] Reembolso recibido por devolución en compra #${purchase.purchaseNumber}. Motivo: ${data.reason || 'Devolución'}`,
          purchaseId: purchase.id,
          purchaseNumber: purchase.purchaseNumber,
          supplierName: purchase.supplierName,
          returnId: returnRecordId,
        });
      } else {
        // Nota de Crédito / Descuento contable aplicado a Cuentas por Pagar (CxP)
        createdPaymentRecord = await createPayment(validUserId, {
          type: 'refund',
          category: 'supplier_refund',
          amount: totalRefundValue,
          paymentMethod,
          bankOrAccount,
          referenceNumber: returnRefNumber,
          paymentDate: data.paymentDate || now,
          status: 'completed',
          notes: `[Nota de Crédito Proveedor] Descuento / Crédito por devolución en compra #${purchase.purchaseNumber}. Motivo: ${data.reason || 'Devolución'}`,
          purchaseId: purchase.id,
          purchaseNumber: purchase.purchaseNumber,
          supplierName: purchase.supplierName,
          returnId: returnRecordId,
        });
      }
    } catch (payErr) {
      console.warn('Could not auto-create payment record for purchase return:', payErr);
    }
  }

  const returnRecord = {
    id: returnRecordId,
    date: now,
    reason: data.reason || 'Devolución por defecto / error de despacho',
    notes: data.notes || '',
    refundAmount: totalRefundValue.toFixed(2),
    settlementType,
    paymentId: createdPaymentRecord ? createdPaymentRecord.id : undefined,
    paymentNumber: createdPaymentRecord ? createdPaymentRecord.paymentNumber : undefined,
    items: returnBatchItems,
  };

  const existingReturns = Array.isArray((purchase as any).returns) ? (purchase as any).returns : [];
  const updatedReturns = [...existingReturns, returnRecord];

  const paymentMsg = createdPaymentRecord
    ? ` • Comprobante contable ${createdPaymentRecord.paymentNumber} generado en Pagos/Tesorería (${settlementType === 'refund' ? 'Reembolso recibido en ' + bankOrAccount : 'Nota de Crédito CxP'}).`
    : '';

  const updatedPurchase = await updatePurchase(purchaseId, {
    items,
    returns: updatedReturns,
    notes: (purchase.notes ? purchase.notes + '\n' : '') + `[Devolución a Proveedor ${new Date().toLocaleDateString('es-EC')}] -${totalReturnedUnits} un. devueltas. Motivo: ${data.reason}. Valor: $${totalRefundValue.toFixed(2)}${paymentMsg}`,
  });

  return {
    success: true,
    returnedUnits: totalReturnedUnits,
    refundAmount: totalRefundValue.toFixed(2),
    purchase: updatedPurchase,
    payment: createdPaymentRecord,
    message: `✓ Devolución registrada: -${totalReturnedUnits} unidades descontadas de bodega. ${createdPaymentRecord ? `Comprobante contable ${createdPaymentRecord.paymentNumber} registrado en Módulo Pagos por $${totalRefundValue.toFixed(2)}.` : `Nota de crédito/reembolso: $${totalRefundValue.toFixed(2)}.`}`,
  };
}

/**
 * Automatically Generates or Updates Supplier Purchase Orders from a Customer Order,
 * SEPARATED BY SUPPLIER, containing ONLY the missing deficit quantity of products
 * that lack sufficient physical stock in warehouse.
 */
export async function autoGeneratePurchaseForOrder(orderId: number, userId?: number) {
  const orders = await getCustomerOrders(userId);
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    throw new Error('Pedido del cliente no encontrado');
  }

  // Parse items
  let orderItems: any[] = [];
  if (Array.isArray(order.items)) {
    orderItems = order.items;
  } else if (typeof order.items === 'string') {
    try {
      orderItems = JSON.parse(order.items);
    } catch {
      orderItems = [];
    }
  }

  // Get current inventory to check available stock and supplier details
  const inventory = await getInventoryItems(userId);
  let suppliersList: any[] = [];
  try {
    suppliersList = await getSuppliers(userId);
  } catch {}

  const deficitItemsBySupplier = new Map<
    string,
    {
      supplierName: string;
      supplierContact: string;
      items: any[];
    }
  >();

  for (const it of orderItems) {
    const isCustom = it.sku === 'CUSTOM';
    const invItem = isCustom
      ? null
      : inventory.find(
          (inv) =>
            inv.id === it.id ||
            inv.id === it.inventoryItemId ||
            (inv.sku && it.sku && inv.sku.trim().toLowerCase() === it.sku.trim().toLowerCase()) ||
            (inv.name && it.name && inv.name.trim().toLowerCase() === it.name.trim().toLowerCase())
        );

    const currentStock = invItem ? Math.max(0, Number(invItem.stock || 0)) : 0;
    const requestedQty = Number(it.quantity || 1);

    // EXACT MISSING DEFICIT:
    // SOLO se debe comprar al proveedor la diferencia/cantidad faltante de los productos sin stock suficiente.
    let missingQty = 0;
    if (isCustom) {
      missingQty = requestedQty;
    } else if (it.deficitQuantity !== undefined) {
      // El pedido ya calculó exactamente el faltante de bodega al crearse
      missingQty = Math.max(0, Number(it.deficitQuantity));
    } else {
      // Si no tiene deficitQuantity precalculado, calcular la diferencia entre pedido y stock en bodega
      const warehouseStock = it.stockAvailable !== undefined
        ? Number(it.stockAvailable)
        : (it.stockDeducted !== undefined ? Number(it.stockDeducted) : currentStock);
      missingQty = Math.max(0, requestedQty - warehouseStock);
    }

    // If stock is sufficient (missingQty <= 0), DO NOT add to purchase items!
    if (missingQty <= 0) {
      continue;
    }

    const itemCostPrice = invItem
      ? Number(invItem.costPrice || (Number(invItem.salePrice || 0) * 0.7) || 0)
      : Number(it.costPrice || (Number(it.salePrice || 0) * 0.7) || 0);

    // Determine supplier name for this individual item
    let rawSupplier = '';
    if (it.supplierName && it.supplierName.trim()) {
      rawSupplier = it.supplierName.trim();
    } else if (invItem) {
      if (invItem.supplierName && invItem.supplierName.trim()) {
        rawSupplier = invItem.supplierName.trim();
      } else if ((invItem as any)?.supplier && (invItem as any).supplier.trim()) {
        rawSupplier = (invItem as any).supplier.trim();
      } else if ((invItem as any)?.channelTitle && (invItem as any).channelTitle.trim()) {
        rawSupplier = (invItem as any).channelTitle.trim();
      }
    }

    if (!rawSupplier) {
      rawSupplier = 'Proveedor Telegram Principal';
    }

    // Match with suppliers list to obtain official registered name and phone
    const matchedSupplier = suppliersList.find(
      (s) =>
        (s.name && s.name.trim().toLowerCase() === rawSupplier.trim().toLowerCase()) ||
        (s.tradeName && s.tradeName.trim().toLowerCase() === rawSupplier.trim().toLowerCase())
    );

    const finalSupplierName = matchedSupplier?.name || matchedSupplier?.tradeName || rawSupplier;
    const finalSupplierContact =
      matchedSupplier?.phone ||
      matchedSupplier?.contactPersonPhone ||
      (matchedSupplier as any)?.whatsapp ||
      '';

    const stockInWarehouse = isCustom
      ? 0
      : (it.stockAvailable !== undefined ? Number(it.stockAvailable) : Math.max(0, requestedQty - missingQty));

    const pItem = {
      inventoryItemId: invItem ? invItem.id : (isCustom ? undefined : (it.inventoryItemId || it.id)),
      name: it.name || invItem?.name || 'Producto bajo pedido',
      sku: it.sku || invItem?.sku || '',
      barcode: it.barcode || (invItem as any)?.barcode || undefined,
      costPrice: itemCostPrice.toFixed(2),
      salePrice: it.salePrice,
      quantity: missingQty, // EXACT DEFICIT ONLY! SOLO LA DIFERENCIA FALTANTE
      requestedInOrder: requestedQty,
      availableInWarehouse: stockInWarehouse,
      deliveredFromWarehouse: Number(it.deliveredQuantity || 0),
      imageUrl: it.imageUrl || invItem?.imageUrl || null,
      supplierName: finalSupplierName,
      customerOrderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
    };

    const groupKey = finalSupplierName.trim().toLowerCase();
    if (!deficitItemsBySupplier.has(groupKey)) {
      deficitItemsBySupplier.set(groupKey, {
        supplierName: finalSupplierName,
        supplierContact: finalSupplierContact,
        items: [],
      });
    }
    deficitItemsBySupplier.get(groupKey)!.items.push(pItem);
  }

  // If there are no missing items (all items have enough stock in warehouse)
  if (deficitItemsBySupplier.size === 0) {
    if (order.fulfillmentStatus === 'supplier_pending') {
      await updateCustomerOrder(order.id, { fulfillmentStatus: 'in_stock' });
    }
    return {
      success: true,
      message: 'Todos los productos del pedido cuentan con stock suficiente en bodega. No se requiere orden de compra.',
      purchases: [],
      purchase: null,
      purchaseNumber: '',
      customerOrderNumber: order.orderNumber,
      itemsCount: 0,
      totalMissingUnits: 0,
      suppliersCount: 0,
    };
  }

  // Check if purchase orders already exist for this customer order to PREVENT DUPLICATES
  const allPurchases = await getPurchases(userId);
  const existingOrderPurchases = allPurchases.filter((p) => {
    if (p.status === 'cancelled') return false;
    const matchId = (p.linkedCustomerOrderId !== undefined && p.linkedCustomerOrderId !== null) &&
      (p.linkedCustomerOrderId == order.id || String(p.linkedCustomerOrderId) === String(order.id));
    const matchNumber = Boolean(p.linkedCustomerOrderNumber && order.orderNumber && p.linkedCustomerOrderNumber.trim() === order.orderNumber.trim());
    const matchLinkedId = Boolean(order.linkedPurchaseId && (p.id == order.linkedPurchaseId || String(p.id) === String(order.linkedPurchaseId)));
    const matchLinkedNumber = Boolean(order.linkedPurchaseNumber && p.purchaseNumber && String(order.linkedPurchaseNumber).includes(p.purchaseNumber));
    const matchNotes = Boolean(p.notes && order.orderNumber && p.notes.includes(order.orderNumber));
    return Boolean(matchId || matchNumber || matchLinkedId || matchLinkedNumber || matchNotes);
  });

  const resultingPurchases: any[] = [];
  let totalAllMissingUnits = 0;
  let totalAllMissingItemsCount = 0;
  const usedExistingPurchaseIds = new Set<number>();

  for (const group of deficitItemsBySupplier.values()) {
    const groupItems = group.items;
    const groupUnits = groupItems.reduce((acc, it) => acc + Number(it.quantity || 1), 0);
    const groupCost = groupItems.reduce(
      (acc, it) => acc + (Number(it.costPrice || 0) * Number(it.quantity || 1)),
      0
    );
    totalAllMissingUnits += groupUnits;
    totalAllMissingItemsCount += groupItems.length;

    // Find existing purchase matching this supplier
    let existingForSupplier = existingOrderPurchases.find(
      (p) =>
        !usedExistingPurchaseIds.has(p.id) &&
        p.supplierName &&
        p.supplierName.trim().toLowerCase() === group.supplierName.trim().toLowerCase()
    );

    // If no exact supplier name match, but we have an unused existing purchase for this order, reuse it to avoid duplicate purchase orders
    if (!existingForSupplier && existingOrderPurchases.length > 0) {
      existingForSupplier = existingOrderPurchases.find((p) => !usedExistingPurchaseIds.has(p.id));
    }

    let finalPurchase: any = null;
    if (existingForSupplier) {
      usedExistingPurchaseIds.add(existingForSupplier.id);
      finalPurchase = await updatePurchase(existingForSupplier.id, {
        supplierName: group.supplierName,
        supplierContact: group.supplierContact || existingForSupplier.supplierContact || '',
        items: groupItems,
        totalCost: groupCost.toFixed(2),
        notes: `Orden de Compra para ${group.supplierName} vinculada al Pedido #${order.orderNumber} (${order.customerName} - ${order.customerPhone}) - Surtido de ${groupUnits} unidades faltantes`,
        isInternalOrderSync: true,
      } as any);
    } else {
      const purchaseResult = await createPurchase({
        userId: userId || order.userId || 1,
        supplierName: group.supplierName,
        supplierContact: group.supplierContact || '',
        items: groupItems,
        totalCost: groupCost.toFixed(2),
        status: 'pending',
        paymentStatus: 'unpaid',
        linkedCustomerOrderId: order.id,
        linkedCustomerOrderNumber: order.orderNumber,
        notes: `Generado automáticamente para ${group.supplierName} desde Pedido de Cliente #${order.orderNumber} para ${order.customerName} (${order.customerPhone}) - Surtido de ${groupUnits} unidades faltantes`,
      });
      finalPurchase = purchaseResult.purchase;
    }

    if (finalPurchase) {
      resultingPurchases.push(finalPurchase);
    }
  }

  // Cancel any existing purchase for suppliers whose items are no longer missing in order
  for (const unusedP of existingOrderPurchases) {
    if (!usedExistingPurchaseIds.has(unusedP.id) && unusedP.status !== 'received') {
      await updatePurchase(unusedP.id, {
        status: 'cancelled',
        notes:
          (unusedP.notes ? unusedP.notes + '\n' : '') +
          `[Cancelada automáticamente]: Ya no hay productos bajo pedido para ${unusedP.supplierName} en el Pedido #${order.orderNumber}.`,
        isInternalOrderSync: true,
      } as any);
    }
  }

  const firstPurchase = resultingPurchases[0] || null;
  const purchaseNumbers = resultingPurchases
    .map((p) => p.purchaseNumber || `OC-${p.id}`)
    .filter(Boolean)
    .join(', ');

  const summaryBreakdown = resultingPurchases
    .map((p) => `#${p.purchaseNumber || p.id} (${p.supplierName}: ${p.items?.length || 0} prod.)`)
    .join(', ');

  // Update order fulfillment status to supplier_pending and attach purchase details
  await updateCustomerOrder(order.id, {
    fulfillmentStatus: 'supplier_pending',
    linkedPurchaseId: firstPurchase ? firstPurchase.id : null,
    linkedPurchaseNumber: purchaseNumbers,
    notes:
      (order.notes ? order.notes + '\n' : '') +
      `[Abastecimiento por Proveedor] 🔍 ${resultingPurchases.length} ${
        resultingPurchases.length === 1 ? 'orden generada' : 'órdenes generadas por proveedor'
      }: ${summaryBreakdown} (${totalAllMissingUnits} un. faltantes en total)`,
  });

  return {
    success: true,
    purchases: resultingPurchases,
    purchase: firstPurchase,
    purchaseNumber: purchaseNumbers,
    customerOrderNumber: order.orderNumber,
    itemsCount: totalAllMissingItemsCount,
    totalMissingUnits: totalAllMissingUnits,
    suppliersCount: resultingPurchases.length,
    groups: Array.from(deficitItemsBySupplier.values()).map((g) => ({
      supplierName: g.supplierName,
      itemsCount: g.items.length,
      totalUnits: g.items.reduce((a, b) => a + Number(b.quantity || 1), 0),
      totalCost: g.items.reduce(
        (a, b) => a + Number(b.costPrice || 0) * Number(b.quantity || 1),
        0
      ),
    })),
  };
}

/**
 * Records a partial delivery of items for a customer order.
 * Allows delivering available stock in warehouse now (e.g. 3 of 5),
 * while keeping the remaining deficit pending from supplier.
 */
export async function recordPartialDelivery(
  orderId: number,
  data: {
    deliveries: Array<{
      id?: number;
      inventoryItemId?: number;
      sku?: string;
      deliverQuantity: number;
    }>;
    notes?: string;
    deductStock?: boolean;
  },
  userId?: number
) {
  const orders = await getCustomerOrders(userId);
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    throw new Error('Pedido del cliente no encontrado');
  }

  let orderItems: any[] = [];
  if (Array.isArray(order.items)) {
    orderItems = order.items;
  } else if (typeof order.items === 'string') {
    try {
      orderItems = JSON.parse(order.items);
    } catch {
      orderItems = [];
    }
  }

  const itemsToDeductInInventory: any[] = [];
  let newlyDeliveredCount = 0;
  let totalOrderUnits = 0;
  let totalDeliveredUnits = 0;
  let totalPendingUnits = 0;

  // Check if items were supplied by a linked purchase marked 'received' (reserved goods)
  const allPurchases = await getPurchases(userId);
  const linkedPurchase = order.linkedPurchaseId ? allPurchases.find((p) => p.id === order.linkedPurchaseId) : null;
  const wasSuppliedByReservedPurchase = Boolean(linkedPurchase && linkedPurchase.status === 'received');

  const updatedItems = orderItems.map((item) => {
    const rawTotalQty = Number(item.quantity || 1);
    totalOrderUnits += rawTotalQty;
    const prevDelivered = Number(item.deliveredQuantity || 0);
    const prevStockDeducted = Number(item.stockDeducted || 0);

    const deliveryEntry = data.deliveries.find((d) => {
      if (d.id && item.id && d.id === item.id) return true;
      if (d.inventoryItemId && item.inventoryItemId && d.inventoryItemId === item.inventoryItemId) return true;
      if (d.sku && item.sku && d.sku.toLowerCase() === item.sku.toLowerCase()) return true;
      return false;
    });

    const addDelivery = deliveryEntry ? Math.max(0, Number(deliveryEntry.deliverQuantity || 0)) : 0;
    const maxCanDeliver = Math.max(0, rawTotalQty - prevDelivered);
    const actualAddDelivery = Math.min(addDelivery, maxCanDeliver);

    const newDelivered = prevDelivered + actualAddDelivery;
    const newPending = Math.max(0, rawTotalQty - newDelivered);

    totalDeliveredUnits += newDelivered;
    totalPendingUnits += newPending;
    newlyDeliveredCount += actualAddDelivery;

    // Warehouse stock discount logic:
    // Only deduct newly delivered units that originated from warehouse stock
    const inWarehouse = item.deficitQuantity !== undefined
      ? Math.max(0, rawTotalQty - Number(item.deficitQuantity))
      : (item.stockAvailable !== undefined ? Number(item.stockAvailable) : rawTotalQty);
    const targetWarehouseDeduct = Math.min(newDelivered, Math.max(0, inWarehouse));
    const netExtraToDeduct = Math.max(0, targetWarehouseDeduct - prevStockDeducted);

    let newStockDeducted = prevStockDeducted;
    if (data.deductStock !== false && netExtraToDeduct > 0) {
      itemsToDeductInInventory.push({
        id: item.inventoryItemId || item.id,
        sku: item.sku,
        name: item.name,
        quantity: netExtraToDeduct,
        deductQuantity: netExtraToDeduct,
        salePrice: item.salePrice,
      });
      newStockDeducted = prevStockDeducted + netExtraToDeduct;
    }

    return {
      ...item,
      quantity: rawTotalQty,
      deliveredQuantity: newDelivered,
      pendingQuantity: newPending,
      stockDeducted: newStockDeducted,
    };
  });

  // Deduct newly delivered warehouse items from stock if requested (default: true)
  if (data.deductStock !== false && itemsToDeductInInventory.length > 0) {
    try {
      await adjustInventoryStockForItems(itemsToDeductInInventory, -1, userId || order.userId || 1);
    } catch (stkErr) {
      console.warn('Could not deduct physical stock for partial delivery:', stkErr);
    }
  }

  // Determine new statuses
  const isFullyDelivered = totalPendingUnits === 0;
  const newStatus = isFullyDelivered ? 'delivered' : (order.status === 'delivered' ? 'confirmed' : (order.status || 'confirmed'));
  
  let newFulfillmentStatus: any = order.fulfillmentStatus || 'in_stock';
  if (isFullyDelivered) {
    newFulfillmentStatus = 'delivered';
  } else {
    // If supplier purchase was already received, it's ready to deliver remaining; otherwise partial_delivered
    if (order.fulfillmentStatus === 'supplier_received' || order.fulfillmentStatus === 'partial_ready') {
      newFulfillmentStatus = 'partial_ready';
    } else {
      newFulfillmentStatus = 'partial_delivered';
    }
  }

  const timestamp = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  const deliverySummaryNote = `[${timestamp} Entrega Parcial] 📦 Entregadas ${newlyDeliveredCount} un. hoy. Total entregado: ${totalDeliveredUnits}/${totalOrderUnits} un. (Pendiente: ${totalPendingUnits} un.)`;
  const combinedNotes = (order.notes ? order.notes + '\n' : '') + (data.notes ? `${data.notes} - ` : '') + deliverySummaryNote;

  const updatedOrder = await updateCustomerOrder(order.id, {
    items: updatedItems,
    status: newStatus,
    fulfillmentStatus: newFulfillmentStatus,
    notes: combinedNotes,
    bypassSupplierBlock: true,
  });

  return {
    success: true,
    order: updatedOrder,
    totalOrderUnits,
    totalDeliveredUnits,
    totalPendingUnits,
    newlyDeliveredCount,
    isFullyDelivered,
  };
}

/**
 * Completes the remaining delivery for all pending items in a customer order (e.g. after supplier arrival).
 */
export async function completeOrderRemainingDelivery(orderId: number, userId?: number) {
  const orders = await getCustomerOrders(userId);
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    throw new Error('Pedido del cliente no encontrado');
  }

  const isPickup = isPickupDeliveryOrder(order);
  if (!isPickup && order.status !== 'shipped') {
    throw new Error('Integridad de Datos ERP: Para pedidos con envío, el pedido debe estar en estado ENVIADO antes de registrar la entrega final del saldo restante.');
  }

  let orderItems: any[] = [];
  if (Array.isArray(order.items)) {
    orderItems = order.items;
  } else if (typeof order.items === 'string') {
    try {
      orderItems = JSON.parse(order.items);
    } catch {
      orderItems = [];
    }
  }

  const itemsToDeductInInventory: any[] = [];
  let remainingDeliveredCount = 0;

  const updatedItems = orderItems.map((item) => {
    const rawTotalQty = Number(item.quantity || 1);
    const prevDelivered = Number(item.deliveredQuantity || 0);
    const prevStockDeducted = Number(item.stockDeducted || 0);
    const pendingToDeliver = Math.max(0, rawTotalQty - prevDelivered);

    if (pendingToDeliver > 0) {
      remainingDeliveredCount += pendingToDeliver;
    }

    // Units that originated from warehouse inventory
    const inWarehouse = item.deficitQuantity !== undefined
      ? Math.max(0, rawTotalQty - Number(item.deficitQuantity))
      : (item.stockAvailable !== undefined ? Number(item.stockAvailable) : rawTotalQty);
    const targetWarehouseDeduct = Math.min(rawTotalQty, Math.max(0, inWarehouse));
    const netExtraToDeduct = Math.max(0, targetWarehouseDeduct - prevStockDeducted);

    if (netExtraToDeduct > 0) {
      itemsToDeductInInventory.push({
        id: item.inventoryItemId || item.id,
        sku: item.sku,
        name: item.name,
        quantity: netExtraToDeduct,
        deductQuantity: netExtraToDeduct,
        salePrice: item.salePrice,
      });
    }

    return {
      ...item,
      quantity: rawTotalQty,
      deliveredQuantity: rawTotalQty,
      pendingQuantity: 0,
      stockDeducted: prevStockDeducted + netExtraToDeduct,
    };
  });

  if (itemsToDeductInInventory.length > 0) {
    try {
      await adjustInventoryStockForItems(itemsToDeductInInventory, -1, userId || order.userId || 1);
    } catch (stkErr) {
      console.warn('Could not deduct physical stock for remaining delivery completion:', stkErr);
    }
  }

  const timestamp = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  const finalDeliveryNote = `[${timestamp} Entrega Final] ✅ Entregadas las ${remainingDeliveredCount} unidades restantes al cliente. ¡Pedido 100% completado!`;
  const combinedNotes = (order.notes ? order.notes + '\n' : '') + finalDeliveryNote;

  const updatedOrder = await updateCustomerOrder(order.id, {
    items: updatedItems,
    status: 'delivered',
    fulfillmentStatus: 'delivered',
    notes: combinedNotes,
    bypassSupplierBlock: true,
  });

  return {
    success: true,
    order: updatedOrder,
    remainingDeliveredCount,
  };
}

/**
 * Records a Customer Return (RMA / Devolución de Cliente) on an existing customer order.
 * - If disposition is 'restock', increments physical stock back into inventory (+1)
 * - If disposition is 'defective_warranty', stock is quarantined for warranty/vendor return
 * - Attaches return record to order for auditing and credit note calculations
 */
export async function recordCustomerReturn(
  orderId: number,
  data: {
    returns: Array<{
      itemIndex?: number;
      id?: number;
      inventoryItemId?: number;
      sku?: string;
      name?: string;
      quantity?: number;
      salePrice?: number | string;
      costPrice?: number | string;
    }>;
    reason: string;
    disposition: 'restock' | 'defective_warranty';
    refundAmount?: number | string;
    settlementType?: 'refund' | 'credit_note';
    paymentMethod?: string;
    bankOrAccount?: string;
    returnVoucher?: string;
    processPaymentInTreasury?: boolean;
    paymentDate?: string;
    notes?: string;
  },
  userId: number = 1
) {
  const orders = await getCustomerOrders(userId);
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    throw new Error('Pedido de cliente no encontrado');
  }

  if (order.status !== 'delivered' && order.status !== 'shipped') {
    throw new Error('Integridad ERP: Solo se pueden registrar devoluciones sobre pedidos entregados o despachados.');
  }

  let items = Array.isArray(order.items) ? [...order.items] : [];
  if (typeof order.items === 'string') {
    try {
      items = JSON.parse(order.items);
    } catch {
      items = [];
    }
  }

  const returnBatchItems: Array<{
    inventoryItemId?: number;
    id?: number;
    name: string;
    sku?: string;
    quantity: number;
    salePrice: string | number;
    costPrice?: string | number;
  }> = [];
  let totalReturnedUnits = 0;
  let calculatedRefundAmount = 0;

  for (const ret of data.returns || []) {
    const qty = Math.max(0, Number(ret.quantity || 0));
    if (qty <= 0) continue;

    const matchedItem = items.find(
      (it: any, idx: number) =>
        (ret.itemIndex !== undefined && ret.itemIndex === idx) ||
        (ret.id && (it.id === ret.id || it.inventoryItemId === ret.id)) ||
        (ret.sku && it.sku && it.sku.toLowerCase() === ret.sku.toLowerCase()) ||
        (ret.name && it.name && it.name.trim().toLowerCase() === ret.name.trim().toLowerCase())
    );

    const unitSalePrice = Number(matchedItem?.salePrice || ret.salePrice || 0);
    const unitCostPrice = Number(matchedItem?.costPrice || ret.costPrice || 0);
    const itemName = matchedItem?.name || ret.name || 'Producto';
    const itemSku = matchedItem?.sku || ret.sku || '';

    totalReturnedUnits += qty;
    calculatedRefundAmount += unitSalePrice * qty;

    returnBatchItems.push({
      inventoryItemId: matchedItem?.inventoryItemId || matchedItem?.id || ret.inventoryItemId,
      id: matchedItem?.id || ret.id,
      name: itemName,
      sku: itemSku,
      quantity: qty,
      salePrice: unitSalePrice.toFixed(2),
      costPrice: unitCostPrice.toFixed(2),
    });
  }

  if (totalReturnedUnits === 0) {
    throw new Error('Debe especificar al menos 1 unidad para la devolución del cliente.');
  }

  const finalRefund =
    data.refundAmount !== undefined && data.refundAmount !== '' ? Number(data.refundAmount) : calculatedRefundAmount;

  // If disposition is 'restock', return units to warehouse inventory
  if (data.disposition === 'restock') {
    await adjustInventoryStockForItems(
      returnBatchItems.map((r) => ({
        id: r.inventoryItemId || r.id,
        sku: r.sku,
        name: r.name,
        quantity: r.quantity,
        salePrice: r.salePrice,
      })),
      1,
      userId || order.userId || 1
    );
  }

  const now = new Date().toISOString();
  const validUserId = await resolveValidUserId(userId || order.userId || 1);
  const settlementType = data.settlementType || 'refund';
  const paymentMethod = data.paymentMethod || (settlementType === 'credit_note' ? 'saldo_a_favor' : 'transferencia_bancaria');
  const bankOrAccount = data.bankOrAccount || (settlementType === 'credit_note' ? 'Nota de Crédito / Saldo a Favor' : 'Banco Pichincha');
  const returnRefNumber = data.returnVoucher || `RMA-${order.orderNumber}`;
  const returnRecordId = `RMA-${Date.now()}`;

  let createdPaymentRecord: any = null;
  const shouldProcessPayment = data.processPaymentInTreasury !== false && finalRefund > 0;

  if (shouldProcessPayment) {
    try {
      if (settlementType === 'credit_note') {
        createdPaymentRecord = await createPayment(validUserId, {
          type: 'refund',
          category: 'customer_refund',
          amount: finalRefund,
          paymentMethod,
          bankOrAccount,
          referenceNumber: returnRefNumber,
          paymentDate: data.paymentDate || now,
          status: 'completed',
          notes: `[Nota de Crédito Cliente] Saldo a favor / Nota de crédito emitida al cliente por devolución en pedido #${order.orderNumber}. Motivo: ${data.reason || 'Devolución RMA'}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerId: (order as any).customerId,
          customerName: order.customerName,
          returnId: returnRecordId,
        });
      } else {
        // Direct cash/bank refund to customer (Egreso/Reembolso de Tesorería)
        createdPaymentRecord = await createPayment(validUserId, {
          type: 'refund',
          category: 'customer_refund',
          amount: finalRefund,
          paymentMethod,
          bankOrAccount,
          referenceNumber: returnRefNumber,
          paymentDate: data.paymentDate || now,
          status: 'completed',
          notes: `[Devolución Cliente] Reembolso liquidado al cliente por devolución en pedido #${order.orderNumber}. Motivo: ${data.reason || 'Devolución RMA'}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerId: (order as any).customerId,
          customerName: order.customerName,
          returnId: returnRecordId,
        });
      }
    } catch (payErr) {
      console.warn('Could not auto-create payment record for customer return:', payErr);
    }
  }

  const returnRecord = {
    id: returnRecordId,
    date: now,
    orderId: order.id,
    orderNumber: order.orderNumber,
    reason: data.reason || 'Devolución de cliente',
    disposition: data.disposition || 'restock',
    refundAmount: finalRefund.toFixed(2),
    settlementType,
    paymentMethod,
    bankOrAccount,
    referenceNumber: returnRefNumber,
    paymentId: createdPaymentRecord ? createdPaymentRecord.id : undefined,
    paymentNumber: createdPaymentRecord ? createdPaymentRecord.paymentNumber : undefined,
    notes: data.notes || '',
    items: returnBatchItems,
  };

  const existingReturns = Array.isArray((order as any).returns) ? (order as any).returns : [];
  const updatedReturns = [...existingReturns, returnRecord];

  const dispositionLabel =
    data.disposition === 'restock' ? 'Reingresado a Stock para Reventa' : 'Averiado / Cuarentena Garantía';
  const paymentMsg = createdPaymentRecord
    ? ` • Comprobante contable ${createdPaymentRecord.paymentNumber} registrado en Pagos/Tesorería (${settlementType === 'credit_note' ? 'Nota de Crédito' : 'Reembolso en ' + bankOrAccount}).`
    : '';
  const returnSummaryNote = `[Devolución Cliente ${new Date().toLocaleDateString('es-EC')}] 🔄 Devolución RMA #${returnRecord.id}: -${totalReturnedUnits} un. (${dispositionLabel}). Motivo: ${data.reason}. Reembolso/Crédito: $${finalRefund.toFixed(2)}${paymentMsg}`;
  const combinedNotes = (order.notes ? order.notes + '\n' : '') + returnSummaryNote;

  const updatedOrder = await updateCustomerOrder(order.id, {
    returns: updatedReturns,
    notes: combinedNotes,
  });

  // Maintain Customer CRM data integrity (recalculate or deduct from totalSpent)
  try {
    const custs = await getCustomers(validUserId);
    const matchedCustomer = custs.find((c) => {
      if ((order as any).customerId && c.id === (order as any).customerId) return true;
      if (order.customerPhone && c.phone && c.phone.replace(/\D/g, '') === order.customerPhone.replace(/\D/g, '')) return true;
      if (order.customerCi && c.ci && c.ci.trim() === order.customerCi.trim()) return true;
      if (order.customerName && c.name && c.name.trim().toLowerCase() === order.customerName.trim().toLowerCase()) return true;
      return false;
    });

    if (matchedCustomer && finalRefund > 0) {
      const prevSpent = Number(matchedCustomer.totalSpent || 0);
      const newSpent = Math.max(0, prevSpent - finalRefund);
      await updateCustomer(matchedCustomer.id, {
        totalSpent: newSpent.toFixed(2),
      });
    }
  } catch (custErr) {
    console.warn('Customer CRM totalSpent sync notice on return:', custErr);
  }

  return {
    success: true,
    returnRecord,
    order: updatedOrder,
    totalReturnedUnits,
    refundAmount: finalRefund.toFixed(2),
    paymentRecord: createdPaymentRecord,
    message: `✓ Devolución RMA registrada: ${totalReturnedUnits} un. procesadas (${dispositionLabel}). Monto liquidado: $${finalRefund.toFixed(2)}${createdPaymentRecord ? ' • Registrado en Pagos #' + createdPaymentRecord.paymentNumber : ''}.`,
  };
}

/**
 * Comprehensive Financial Overview & Real Margin Calculation:
 * - Inversión en Compras vs Ingresos por Ventas
 * - Costo de Mercancía Vendida (COGS)
 * - Utilidad Bruta y Margen Neto Real
 * - Valoración del inventario físico inmovilizado
 */
export async function getFinancialSummary(userId?: number, period: string = 'all') {
  const [orders, allPurchases, inventory] = await Promise.all([
    getCustomerOrders(userId),
    getPurchases(userId),
    getInventoryItems(userId),
  ]);

  const now = new Date();
  const filterByDate = (dateVal?: string | Date | null) => {
    if (!dateVal || period === 'all') return true;
    const itemDate = new Date(dateVal);
    if (isNaN(itemDate.getTime())) return true;

    if (period === 'today') {
      return itemDate.toDateString() === now.toDateString();
    }
    if (period === 'week') {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return itemDate >= oneWeekAgo;
    }
    if (period === 'month') {
      return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
    }
    if (period === 'year') {
      return itemDate.getFullYear() === now.getFullYear();
    }
    return true;
  };

  // 1. Purchases Metrics
  const filteredPurchases = allPurchases.filter((p) => filterByDate(p.purchaseDate || p.createdAt));

  let totalPurchasesCost = 0;
  let totalPendingPurchasesCost = 0;
  let totalPurchasesCount = 0;

  for (const p of filteredPurchases) {
    const cost = Number(p.totalCost || 0);
    if (p.status === 'received' || p.paymentStatus === 'paid') {
      totalPurchasesCost += cost;
      totalPurchasesCount++;
    } else if (p.status === 'pending' || p.status === 'ordered' || p.status === 'in_transit') {
      totalPendingPurchasesCost += cost;
    }
  }

  // 2. Sales Metrics (Only confirmed, shipped, delivered count as finalized sales revenue)
  const filteredOrders = orders.filter((o) => filterByDate(o.createdAt));

  let totalSalesRevenue = 0;
  let totalOrdersCount = 0;
  let costOfGoodsSold = 0;

  // Build inventory cost lookup map
  const itemCostMap = new Map<string, number>();
  for (const inv of inventory) {
    const cost = Number(inv.costPrice || 0);
    itemCostMap.set(String(inv.id), cost);
    if (inv.sku) itemCostMap.set(inv.sku.toLowerCase(), cost);
  }

  for (const ord of filteredOrders) {
    const isFinalized = ord.status === 'confirmed' || ord.status === 'shipped' || ord.status === 'delivered';
    if (isFinalized) {
      const orderRev = Number(ord.totalAmount || 0);
      totalSalesRevenue += orderRev;
      totalOrdersCount++;

      // Compute COGS for this order
      if (Array.isArray(ord.items)) {
        for (const it of ord.items) {
          const qty = Number(it.quantity || 1);
          let unitCost = Number(it.costPrice || 0);
          if (unitCost <= 0) {
            unitCost = itemCostMap.get(String(it.id)) || itemCostMap.get((it.sku || '').toLowerCase()) || (Number(it.salePrice || 0) * 0.7);
          }
          costOfGoodsSold += (unitCost * qty);
        }
      }
    }
  }

  // If no COGS could be calculated directly, estimate based on purchased cost
  const effectiveCogs = costOfGoodsSold > 0 ? costOfGoodsSold : totalPurchasesCost;
  const grossProfit = totalSalesRevenue - effectiveCogs;
  const netProfitMarginPercent = totalSalesRevenue > 0 ? Math.round((grossProfit / totalSalesRevenue) * 100) : 0;

  // 3. Current Physical Stock Valuation
  let currentPhysicalStockUnits = 0;
  let currentPhysicalStockCostValue = 0;
  let currentPhysicalStockSaleValue = 0;

  for (const inv of inventory) {
    if (inv.status !== 'archived') {
      const stock = Number(inv.stock || 0);
      if (stock > 0) {
        const cost = Number(inv.costPrice || 0);
        const sale = Number(inv.salePrice || 0);
        currentPhysicalStockUnits += stock;
        currentPhysicalStockCostValue += (cost * stock);
        currentPhysicalStockSaleValue += (sale * stock);
      }
    }
  }

  // 4. Combined Recent Ledger / Transactions
  const recentTransactions: any[] = [];

  for (const ord of filteredOrders.slice(0, 15)) {
    const isFinal = ord.status === 'confirmed' || ord.status === 'shipped' || ord.status === 'delivered';
    const rev = Number(ord.totalAmount || 0);
    recentTransactions.push({
      type: 'sale',
      id: ord.id,
      reference: `#${ord.orderNumber}`,
      description: `Venta a ${ord.customerName} (${ord.items?.length || 1} productos)`,
      amount: rev,
      cost: rev * 0.7,
      profit: isFinal ? (rev * 0.3) : 0,
      date: ord.createdAt,
      status: ord.status,
    });
  }

  for (const p of filteredPurchases.slice(0, 15)) {
    const cost = Number(p.totalCost || 0);
    recentTransactions.push({
      type: 'purchase',
      id: p.id,
      reference: `#${p.purchaseNumber}`,
      description: `Compra a ${p.supplierName} (${p.items?.length || 1} productos)`,
      amount: -cost,
      cost: cost,
      profit: -cost,
      date: p.purchaseDate || p.createdAt,
      status: p.status,
    });
  }

  recentTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    period,
    totalPurchasesCost,
    totalPurchasesCount,
    totalPendingPurchasesCost,
    totalSalesRevenue,
    totalOrdersCount,
    costOfGoodsSold: effectiveCogs,
    grossProfit,
    netProfitMarginPercent,
    currentPhysicalStockUnits,
    currentPhysicalStockCostValue,
    currentPhysicalStockSaleValue,
    recentTransactions: recentTransactions.slice(0, 20),
  };
}

// ==========================================
// TEST DATA CLEANER / RESET TESTING ENVIRONMENT & SEEDING
// ==========================================

export async function getDevTestingStats(_userId?: number) {
  const state = storage.getState();
  let ordersCount = state.customerOrders ? state.customerOrders.length : 0;
  let purchasesCount = state.purchases ? state.purchases.length : 0;
  let customersCount = state.customers ? state.customers.length : 0;
  let suppliersCount = state.suppliers ? state.suppliers.length : 0;
  let paymentsCount = state.payments ? state.payments.length : 0;
  let messagesCount = state.telegramMessages ? state.telegramMessages.length : 0;
  let analyticsCount = state.storeAnalyticsEvents ? state.storeAnalyticsEvents.length : 0;
  let productsCount = state.inventoryItems ? state.inventoryItems.length : 0;
  let totalStockUnits = (state.inventoryItems || []).reduce((acc, it) => acc + (Number(it.stock) || 0), 0);

  let pendingOrdersCount = (state.customerOrders || []).filter(
    (o) => o.status === 'pending' || o.status === 'confirmed'
  ).length;
  let pendingPurchasesCount = (state.purchases || []).filter(
    (p) => p.status === 'pending' || p.status === 'ordered' || p.status === 'in_transit' || p.status === 'partially_received'
  ).length;

  if (isPostgresConfigured()) {
    try {
      const [ordRows, purRows, custRows, supRows, payRows, msgRows, prodRows] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(customerOrders),
        db.select({ count: sql<number>`count(*)` }).from(purchases),
        db.select({ count: sql<number>`count(*)` }).from(customers),
        db.select({ count: sql<number>`count(*)` }).from(suppliers),
        db.select({ count: sql<number>`count(*)` }).from(payments),
        db.select({ count: sql<number>`count(*)` }).from(telegramMessages),
        db.select({ count: sql<number>`count(*)`, totalStock: sql<number>`sum(stock)` }).from(inventoryItems),
      ]);
      ordersCount = Number(ordRows[0]?.count) || ordersCount;
      purchasesCount = Number(purRows[0]?.count) || purchasesCount;
      customersCount = Number(custRows[0]?.count) || customersCount;
      suppliersCount = Number(supRows[0]?.count) || suppliersCount;
      paymentsCount = Number(payRows[0]?.count) || paymentsCount;
      messagesCount = Number(msgRows[0]?.count) || messagesCount;
      productsCount = Number(prodRows[0]?.count) || productsCount;
      if (prodRows[0]?.totalStock !== null && prodRows[0]?.totalStock !== undefined) {
        totalStockUnits = Number(prodRows[0].totalStock) || 0;
      }
    } catch (err) {
      console.warn('Error fetching dev stats from SQL:', err);
    }
  }

  return {
    ordersCount,
    purchasesCount,
    customersCount,
    suppliersCount,
    paymentsCount,
    messagesCount,
    analyticsCount,
    productsCount,
    totalStockUnits,
    pendingOrdersCount,
    pendingPurchasesCount,
  };
}

export async function getCustomerOrderById(orderId: number) {
  const orders = await getCustomerOrders();
  return orders.find((o) => Number(o.id) === Number(orderId)) || null;
}

export async function cleanTestData(
  action:
    | 'orders'
    | 'purchases'
    | 'customers'
    | 'suppliers'
    | 'payments'
    | 'products'
    | 'telegram'
    | 'analytics'
    | 'reset_stock'
    | 'reset_customer_balances'
    | 'reset_supplier_balances'
    | 'all_transactions'
    | 'reset_all'
    | 'reset_all_with_products',
  _userId?: number,
  options?: { targetStockQuantity?: number }
) {
  const state = storage.getState();
  const summary: {
    clearedOrders: number;
    clearedPurchases: number;
    clearedCustomers: number;
    clearedSuppliers: number;
    clearedPayments: number;
    clearedProducts: number;
    clearedTelegram: number;
    clearedAnalytics: boolean;
    stockResetProducts: number;
    message: string;
  } = {
    clearedOrders: 0,
    clearedPurchases: 0,
    clearedCustomers: 0,
    clearedSuppliers: 0,
    clearedPayments: 0,
    clearedProducts: 0,
    clearedTelegram: 0,
    clearedAnalytics: false,
    stockResetProducts: 0,
    message: '',
  };

  // 1. Limpiar Pedidos y Ventas
  if (action === 'orders' || action === 'all_transactions' || action === 'reset_all' || action === 'reset_all_with_products') {
    summary.clearedOrders = state.customerOrders ? state.customerOrders.length : 0;
    if (isPostgresConfigured()) {
      try {
        await db.update(purchases).set({ linkedCustomerOrderId: null, linkedCustomerOrderNumber: null });
        await db.delete(customerOrders);
      } catch (err) {
        console.warn('Error clearing customerOrders in SQL:', err);
      }
    }
    state.customerOrders = [];
    if (!state.nextId) state.nextId = {} as any;
    state.nextId.customerOrders = 1;

    // Desvincular órdenes de compra que apuntaban a estos pedidos
    if (state.purchases) {
      state.purchases.forEach((p) => {
        p.linkedCustomerOrderId = null;
        p.linkedCustomerOrderNumber = null;
      });
    }

    // Resetear contadores de compras en clientes
    if (state.customers) {
      state.customers.forEach((c) => {
        c.totalOrders = 0;
        c.totalSpent = '0.00';
      });
    }
    if (isPostgresConfigured()) {
      try {
        await db.update(customers).set({ totalOrders: 0, totalSpent: '0.00' });
      } catch (err) {
        console.warn('Error resetting customer counters in SQL:', err);
      }
    }
  }

  // 2. Limpiar Compras a Proveedores
  if (action === 'purchases' || action === 'all_transactions' || action === 'reset_all' || action === 'reset_all_with_products') {
    summary.clearedPurchases = state.purchases ? state.purchases.length : 0;
    if (isPostgresConfigured()) {
      try {
        await db.update(customerOrders).set({ linkedPurchaseId: null, linkedPurchaseNumber: null, fulfillmentStatus: 'in_stock' });
        await db.delete(purchases);
      } catch (err) {
        console.warn('Error clearing purchases in SQL:', err);
      }
    }
    state.purchases = [];
    if (!state.nextId) state.nextId = {} as any;
    state.nextId.purchases = 1;

    // Desvincular compras en pedidos de clientes si quedaba alguno
    if (state.customerOrders) {
      state.customerOrders.forEach((o) => {
        o.linkedPurchaseId = null;
        o.linkedPurchaseNumber = null;
        o.fulfillmentStatus = 'in_stock';
      });
    }
  }

  // 3. Limpiar Base de Clientes (CRM)
  if (action === 'customers' || action === 'reset_all' || action === 'reset_all_with_products') {
    summary.clearedCustomers = state.customers ? state.customers.length : 0;
    if (isPostgresConfigured()) {
      try {
        await db.delete(customers);
      } catch (err) {
        console.warn('Error clearing customers in SQL:', err);
      }
    }
    state.customers = [];
    if (!state.nextId) state.nextId = {} as any;
    state.nextId.customers = 1;
  }

  // 3b. Resetear balances de clientes sin borrar sus contactos
  if (action === 'reset_customer_balances') {
    if (state.customers) {
      state.customers.forEach((c) => {
        c.totalOrders = 0;
        c.totalSpent = '0.00';
      });
    }
    if (isPostgresConfigured()) {
      try {
        await db.update(customers).set({ totalOrders: 0, totalSpent: '0.00' });
      } catch (err) {
        console.warn('Error resetting customer balances in SQL:', err);
      }
    }
    summary.clearedCustomers = state.customers ? state.customers.length : 0;
  }

  // 4. Limpiar Directorio de Proveedores
  if (action === 'suppliers' || action === 'reset_all' || action === 'reset_all_with_products') {
    summary.clearedSuppliers = state.suppliers ? state.suppliers.length : 0;
    if (isPostgresConfigured()) {
      try {
        await db.delete(suppliers);
      } catch (err) {
        console.warn('Error clearing suppliers in SQL:', err);
      }
    }
    state.suppliers = [];
    if (!state.nextId) state.nextId = {} as any;
    state.nextId.suppliers = 1;
  }

  // 4b. Resetear balances de proveedores
  if (action === 'reset_supplier_balances') {
    summary.clearedSuppliers = state.suppliers ? state.suppliers.length : 0;
  }

  // 5. Limpiar Catálogo de Productos
  if (action === 'products' || action === 'reset_all_with_products') {
    summary.clearedProducts = state.inventoryItems ? state.inventoryItems.length : 0;
    if (isPostgresConfigured()) {
      try {
        await db.update(telegramMessages).set({ inventoryItemId: null });
        await db.delete(inventoryItems);
      } catch (err) {
        console.warn('Error clearing inventoryItems in SQL:', err);
      }
    }
    if (state.telegramMessages) {
      state.telegramMessages.forEach((m) => {
        m.inventoryItemId = null;
      });
    }
    state.inventoryItems = [];
    if (!state.nextId) state.nextId = {} as any;
    state.nextId.inventoryItems = 1;
  }

  // 6. Limpiar Mensajes / Registro de Telegram
  if (action === 'telegram' || action === 'reset_all' || action === 'reset_all_with_products') {
    summary.clearedTelegram = state.telegramMessages ? state.telegramMessages.length : 0;
    if (isPostgresConfigured()) {
      try {
        await db.delete(telegramMessages);
      } catch (err) {
        console.warn('Error clearing telegramMessages in SQL:', err);
      }
    }
    state.telegramMessages = [];
    if (state.nextId) state.nextId.telegramMessages = 1;
  }

  // 7. Limpiar Eventos de Analítica / Visitas
  if (action === 'analytics' || action === 'all_transactions' || action === 'reset_all' || action === 'reset_all_with_products') {
    state.storeAnalyticsEvents = [];
    if (state.nextId) state.nextId.storeAnalyticsEvents = 1;
    summary.clearedAnalytics = true;
  }

  // 8. Limpiar Pagos y Movimientos de Tesorería (CxC, CxP, Reembolsos, Gastos)
  if (action === 'payments' || action === 'all_transactions' || action === 'reset_all' || action === 'reset_all_with_products') {
    summary.clearedPayments = state.payments ? state.payments.length : 0;
    if (isPostgresConfigured()) {
      try {
        await db.delete(payments);
      } catch (err) {
        console.warn('Error clearing payments in SQL:', err);
      }
    }
    state.payments = [];
    if (state.nextId) state.nextId.payments = 1;
  }

  // 9. Resetear Stock de Productos
  if (action === 'reset_stock') {
    const targetStock = options?.targetStockQuantity !== undefined ? Math.max(0, options.targetStockQuantity) : 0;
    if (state.inventoryItems) {
      state.inventoryItems.forEach((it) => {
        it.stock = targetStock;
        it.status = targetStock > 0 ? 'available' : 'sold_out';
      });
      summary.stockResetProducts = state.inventoryItems.length;
    }
    if (isPostgresConfigured()) {
      try {
        await db.update(inventoryItems).set({
          stock: targetStock,
          status: targetStock > 0 ? 'available' : 'sold_out',
        });
      } catch (err) {
        console.warn('Error resetting products stock in SQL:', err);
      }
    }
  }

  storage.save();

  if (action === 'orders') {
    summary.message = `✓ Se eliminaron ${summary.clearedOrders} pedidos de clientes de prueba. Contador reiniciado a #PED-001 y balances de clientes reseteados.`;
  } else if (action === 'purchases') {
    summary.message = `✓ Se eliminaron ${summary.clearedPurchases} órdenes de compra de prueba. Contador reiniciado a #COM-001 y balances de proveedores reseteados.`;
  } else if (action === 'payments') {
    summary.message = `✓ Se eliminaron ${summary.clearedPayments} registros de cobros, pagos y tesorería. Libro mayor reseteado a cero.`;
  } else if (action === 'products') {
    summary.message = `✓ Se eliminaron los ${summary.clearedProducts} productos del catálogo de inventario. Catálogo listo para cargar nuevo inventario desde cero.`;
  } else if (action === 'customers') {
    summary.message = `✓ Se eliminaron ${summary.clearedCustomers} clientes de prueba del CRM.`;
  } else if (action === 'suppliers') {
    summary.message = `✓ Se eliminaron ${summary.clearedSuppliers} proveedores del directorio.`;
  } else if (action === 'reset_customer_balances') {
    summary.message = `✓ Balances y contadores de compras reseteados a cero en ${summary.clearedCustomers} clientes.`;
  } else if (action === 'reset_supplier_balances') {
    summary.message = `✓ Balances y contadores de compras reseteados a cero en ${summary.clearedSuppliers} proveedores.`;
  } else if (action === 'telegram') {
    summary.message = `✓ Se eliminaron ${summary.clearedTelegram} mensajes de Telegram de prueba del registro.`;
  } else if (action === 'analytics') {
    summary.message = `✓ Métricas y eventos de visitas de tienda online reseteados a cero.`;
  } else if (action === 'reset_stock') {
    summary.message = `✓ Se ajustó el stock a ${options?.targetStockQuantity ?? 0} unidades en todos los ${summary.stockResetProducts} productos del catálogo.`;
  } else if (action === 'reset_all_with_products') {
    summary.message = `✓ Limpieza absoluta completada: ${summary.clearedProducts} productos, ${summary.clearedOrders} pedidos, ${summary.clearedPurchases} compras, ${summary.clearedPayments} pagos, ${summary.clearedCustomers} clientes y ${summary.clearedSuppliers} proveedores eliminados. Base de datos reseteada a 0 (usuarios administradores protegidos).`;
  } else {
    summary.message = `✓ Entorno de pruebas limpio: ${summary.clearedOrders} pedidos, ${summary.clearedPurchases} compras, ${summary.clearedPayments} pagos y registros de prueba reseteados. Tu catálogo de productos y usuarios administradores se mantienen 100% intactos.`;
  }

  return summary;
}

/**
 * Seeds realistic test data for full ERP sandbox cycle (Orders, Purchases, Payments, Customers, Suppliers)
 */
export async function seedTestData(
  userId: number = 1,
  options?: {
    seedOrders?: boolean;
    seedPurchases?: boolean;
    seedCustomers?: boolean;
    seedSuppliers?: boolean;
    seedPayments?: boolean;
  }
) {
  const targetUserId = await resolveValidUserId(userId);
  const state = storage.getState();
  const now = new Date();

  // 1. Seed Demo Suppliers if empty or requested
  let createdSuppliersCount = 0;
  const demoSuppliers = [
    {
      name: 'Importadora Andina Tech S.A.',
      tradeName: 'Andina Tech Ecuador',
      ruc: '1792348592001',
      phone: '0991234567',
      email: 'ventas@andinatech.ec',
      contactPerson: 'Ing. Marcelo Viteri',
      category: 'Tecnología y Electrónica',
      city: 'Quito',
      paymentTerms: 'credito_30',
      creditLimit: '5000.00',
      rating: 5,
    },
    {
      name: 'Distribuidora Mayorista Textil Guayaquil',
      tradeName: 'Textiles del Guayas',
      ruc: '0992837461001',
      phone: '0987654321',
      email: 'pedidos@textilesguayas.com',
      contactPerson: 'Sra. Elena Morales',
      category: 'Ropa y Calzado',
      city: 'Guayaquil',
      paymentTerms: 'contado',
      creditLimit: '2000.00',
      rating: 4,
    },
    {
      name: 'Comercializadora Hogar & Estilo Cía. Ltda.',
      tradeName: 'Hogar Total',
      ruc: '1790482910001',
      phone: '0993344556',
      email: 'abastecimiento@hogartotal.ec',
      contactPerson: 'Lcdo. Roberto Castro',
      category: 'Hogar y Decoración',
      city: 'Cuenca',
      paymentTerms: 'credito_15',
      creditLimit: '3500.00',
      rating: 5,
    },
  ];

  for (const s of demoSuppliers) {
    const existing = (state.suppliers || []).some((ex) => ex.name.toLowerCase() === s.name.toLowerCase() || (ex.ruc && ex.ruc === s.ruc));
    if (!existing) {
      await createSupplier({ userId: targetUserId, ...s });
      createdSuppliersCount++;
    }
  }

  // 2. Seed Demo Customers if empty or requested
  let createdCustomersCount = 0;
  const demoCustomers = [
    {
      name: 'Carlos Mendoza Alarcón',
      phone: '0998877665',
      email: 'carlos.mendoza@gmail.com',
      city: 'Quito',
      address: 'Av. 6 de Diciembre y Orellana, Edif. Prisma piso 4',
      ci: '1718293847',
    },
    {
      name: 'Andrea Paredes Cevallos',
      phone: '0981122334',
      email: 'andrea.paredes@hotmail.com',
      city: 'Guayaquil',
      address: 'Samborondón km 3.5, Urbanización Las Riberas',
      ci: '0928374651',
    },
    {
      name: 'Esteban Valencia Gómez',
      phone: '0995544332',
      email: 'evalencia.g@outlook.com',
      city: 'Cuenca',
      address: 'Calle Larga y Huayna Cápac 4-12',
      ci: '0102938475',
    },
    {
      name: 'Mariana Rosero Cárdenas',
      phone: '0984433221',
      email: 'mariana.rosero@yahoo.es',
      city: 'Ambato',
      address: 'Ficoa, Los Guayambos y Av. Los Guaytambos',
      ci: '1802938471',
    },
  ];

  for (const c of demoCustomers) {
    const existing = (state.customers || []).some((ex) => ex.phone === c.phone || (ex.ci && ex.ci === c.ci));
    if (!existing) {
      await createCustomer({ ...c, userId: targetUserId });
      createdCustomersCount++;
    }
  }

  // Retrieve existing inventory items to use for orders and purchases
  let items = await getInventoryItems(targetUserId);
  if (!items || items.length === 0) {
    // Create base demo inventory items if catalog is empty
    const baseItems = [
      {
        name: 'Auriculares Inalámbricos Bluetooth Pro ANC',
        sku: 'AUR-BT-PRO',
        description: 'Auriculares de alta fidelidad con cancelación activa de ruido y estuche de carga rápida.',
        category: 'Tecnología',
        costPrice: '18.50',
        salePrice: '39.99',
        stock: 25,
        supplier: 'Importadora Andina Tech S.A.',
        supplierName: 'Importadora Andina Tech S.A.',
        status: 'available',
      },
      {
        name: 'Reloj Inteligente Smartwatch Sport Fit 2.0',
        sku: 'SMW-FIT-2',
        description: 'Monitor de ritmo cardíaco, oxímetro, GPS integrado y pantalla AMOLED de 1.4 pulgadas.',
        category: 'Tecnología',
        costPrice: '22.00',
        salePrice: '49.50',
        stock: 18,
        supplier: 'Importadora Andina Tech S.A.',
        supplierName: 'Importadora Andina Tech S.A.',
        status: 'available',
      },
      {
        name: 'Mochila Urbana Impermeable con Puerto USB',
        sku: 'MOC-URB-BLK',
        description: 'Mochila ergonómica para laptop de hasta 15.6 pulgadas con material repelente al agua.',
        category: 'Accesorios',
        costPrice: '12.00',
        salePrice: '28.00',
        stock: 30,
        supplier: 'Distribuidora Mayorista Textil Guayaquil',
        supplierName: 'Distribuidora Mayorista Textil Guayaquil',
        status: 'available',
      },
      {
        name: 'Lámpara de Escritorio LED con Carga Inalámbrica',
        sku: 'LMP-LED-QI',
        description: 'Lámpara flexible de 3 tonalidades de luz con base de carga por inducción Qi 15W.',
        category: 'Hogar y Decoración',
        costPrice: '9.80',
        salePrice: '24.90',
        stock: 15,
        supplier: 'Comercializadora Hogar & Estilo Cía. Ltda.',
        supplierName: 'Comercializadora Hogar & Estilo Cía. Ltda.',
        status: 'available',
      },
    ];

    for (const b of baseItems) {
      await createInventoryItem({ userId: targetUserId, ...b });
    }
    items = await getInventoryItems(targetUserId);
  }

  // 3. Seed Realistic Customer Orders (Ventas)
  let createdOrdersCount = 0;
  if (options?.seedOrders !== false && items.length > 0) {
    const item1 = items[0];
    const item2 = items[1] || items[0];
    const item3 = items[2] || items[0];

    const ordersToCreate = [
      {
        customerName: 'Carlos Mendoza Alarcón',
        customerPhone: '0998877665',
        customerEmail: 'carlos.mendoza@gmail.com',
        customerCi: '1718293847',
        shippingAddress: 'Av. 6 de Diciembre y Orellana, Edif. Prisma piso 4, Quito',
        shippingCity: 'Quito',
        deliveryMethod: 'shipping',
        paymentMethod: 'transferencia_bancaria',
        paymentVoucher: 'TRANS-BP-8839201',
        status: 'delivered',
        fulfillmentStatus: 'in_stock',
        notes: 'Cliente solicitó entrega por la mañana. Pedido completado con éxito.',
        items: [
          {
            inventoryItemId: item1.id,
            id: item1.id,
            name: item1.name,
            sku: item1.sku,
            salePrice: Number(item1.salePrice),
            costPrice: Number(item1.costPrice),
            quantity: 1,
            deliveredQuantity: 1,
            pendingQuantity: 0,
          },
          {
            inventoryItemId: item2.id,
            id: item2.id,
            name: item2.name,
            sku: item2.sku,
            salePrice: Number(item2.salePrice),
            costPrice: Number(item2.costPrice),
            quantity: 1,
            deliveredQuantity: 1,
            pendingQuantity: 0,
          },
        ],
      },
      {
        customerName: 'Andrea Paredes Cevallos',
        customerPhone: '0981122334',
        customerEmail: 'andrea.paredes@hotmail.com',
        customerCi: '0928374651',
        shippingAddress: 'Samborondón km 3.5, Urbanización Las Riberas, Guayaquil',
        shippingCity: 'Guayaquil',
        deliveryMethod: 'shipping',
        paymentMethod: 'deuna',
        paymentVoucher: 'DEUNA-REF-99281',
        status: 'confirmed',
        fulfillmentStatus: 'in_stock',
        notes: 'Pago recibido por Deuna. Pendiente de despacho por Servientrega.',
        items: [
          {
            inventoryItemId: item1.id,
            id: item1.id,
            name: item1.name,
            sku: item1.sku,
            salePrice: Number(item1.salePrice),
            costPrice: Number(item1.costPrice),
            quantity: 2,
            deliveredQuantity: 0,
            pendingQuantity: 0,
          },
        ],
      },
      {
        customerName: 'Esteban Valencia Gómez',
        customerPhone: '0995544332',
        customerEmail: 'evalencia.g@outlook.com',
        customerCi: '0102938475',
        shippingAddress: 'Calle Larga y Huayna Cápac 4-12, Cuenca',
        shippingCity: 'Cuenca',
        deliveryMethod: 'pickup',
        paymentMethod: 'efectivo',
        status: 'pending',
        fulfillmentStatus: 'in_stock',
        notes: 'Cliente retira en bodega central y paga en efectivo.',
        items: [
          {
            inventoryItemId: item3.id,
            id: item3.id,
            name: item3.name,
            sku: item3.sku,
            salePrice: Number(item3.salePrice),
            costPrice: Number(item3.costPrice),
            quantity: 1,
            deliveredQuantity: 0,
            pendingQuantity: 0,
          },
        ],
      },
    ];

    for (const ord of ordersToCreate) {
      const totalAmount = ord.items.reduce((acc, it) => acc + (it.salePrice * it.quantity), 0);
      await createCustomerOrder({
        userId: targetUserId,
        ...ord,
        totalAmount,
      });
      createdOrdersCount++;
    }
  }

  // 4. Seed Realistic Supplier Purchase Orders (Compras)
  let createdPurchasesCount = 0;
  if (options?.seedPurchases !== false && items.length > 0) {
    const item1 = items[0];
    const item2 = items[1] || items[0];

    const purchasesToCreate = [
      {
        supplierName: 'Importadora Andina Tech S.A.',
        supplierContact: '0991234567 - Marcelo Viteri',
        status: 'received',
        paymentStatus: 'paid',
        receiptVoucher: 'FAC-PROV-001-99281',
        shippingGuideNumber: 'GUIA-SERVI-7788291',
        notes: 'Compra de reposición recibida conforme en bodega central.',
        items: [
          {
            inventoryItemId: item1.id,
            id: item1.id,
            name: item1.name,
            sku: item1.sku,
            costPrice: Number(item1.costPrice),
            quantity: 10,
            receivedQuantity: 10,
            pendingQuantity: 0,
          },
        ],
      },
      {
        supplierName: 'Distribuidora Mayorista Textil Guayaquil',
        supplierContact: '0987654321 - Elena Morales',
        status: 'ordered',
        paymentStatus: 'paid',
        receiptVoucher: 'REC-TRANSF-1029384',
        shippingGuideNumber: 'GUIA-TRAMACO-33441',
        notes: 'Orden pagada con transferencia. Proveedor despacha mañana.',
        items: [
          {
            inventoryItemId: item2.id,
            id: item2.id,
            name: item2.name,
            sku: item2.sku,
            costPrice: Number(item2.costPrice),
            quantity: 15,
            receivedQuantity: 0,
            pendingQuantity: 15,
          },
        ],
      },
      {
        supplierName: 'Comercializadora Hogar & Estilo Cía. Ltda.',
        supplierContact: '0993344556 - Roberto Castro',
        status: 'pending',
        paymentStatus: 'unpaid',
        notes: 'Cotización preliminar enviada a proveedor.',
        items: [
          {
            inventoryItemId: items[2]?.id || item1.id,
            id: items[2]?.id || item1.id,
            name: items[2]?.name || item1.name,
            sku: items[2]?.sku || item1.sku,
            costPrice: Number(items[2]?.costPrice || item1.costPrice),
            quantity: 5,
            receivedQuantity: 0,
            pendingQuantity: 5,
          },
        ],
      },
    ];

    for (const po of purchasesToCreate) {
      const totalCost = po.items.reduce((acc, it) => acc + (it.costPrice * it.quantity), 0);
      await createPurchase({
        userId: targetUserId,
        ...po,
        totalCost,
      });
      createdPurchasesCount++;
    }
  }

  // 5. Automatically sync & reconcile payments ledger
  const syncResult = await syncPaymentsFromOrdersAndPurchases(targetUserId);

  return {
    success: true,
    createdOrdersCount,
    createdPurchasesCount,
    createdCustomersCount,
    createdSuppliersCount,
    syncedInflows: syncResult.syncedInflows,
    syncedOutflows: syncResult.syncedOutflows,
    message: `✓ Datos de prueba generados exitosamente: ${createdOrdersCount} pedidos de clientes, ${createdPurchasesCount} órdenes de compra, ${createdCustomersCount} clientes, ${createdSuppliersCount} proveedores y ${syncResult.syncedInflows + syncResult.syncedOutflows} movimientos contables sincronizados en tesorería.`,
  };
}

/* =========================================================================
   ERP PAYMENTS & TREASURY ENGINE (Cuentas por Cobrar, Cuentas por Pagar y Flujo de Caja)
   ========================================================================= */

/**
 * Normalizes payment record from SQL / local storage
 */
export function normalizePayment(raw: any): any {
  if (!raw) return null;
  return {
    id: Number(raw.id),
    userId: Number(raw.userId || raw.user_id || 1),
    paymentNumber: String(raw.paymentNumber || raw.payment_number || `REC-${raw.id}`),
    type: String(raw.type || 'inflow'), // 'inflow' (Cobro), 'outflow' (Pago Proveedor), 'refund' (Reembolso), 'expense' (Gasto)
    category: String(raw.category || (raw.type === 'outflow' ? 'supplier_purchase' : 'customer_sale')),
    amount: cleanNumericString(raw.amount, '0.00'),
    paymentMethod: String(raw.paymentMethod || raw.payment_method || 'transferencia_bancaria'),
    bankOrAccount: String(raw.bankOrAccount || raw.bank_or_account || 'Banco Pichincha'),
    referenceNumber: raw.referenceNumber || raw.reference_number || null,
    paymentDate: raw.paymentDate || raw.payment_date || raw.createdAt || raw.created_at || new Date().toISOString(),
    status: String(raw.status || 'completed'), // 'completed', 'pending', 'voided'
    notes: raw.notes || null,
    voucherUrl: raw.voucherUrl || raw.voucher_url || null,
    orderId: raw.orderId !== undefined && raw.orderId !== null ? Number(raw.orderId) : raw.order_id ? Number(raw.order_id) : null,
    orderNumber: raw.orderNumber || raw.order_number || null,
    customerId: raw.customerId !== undefined && raw.customerId !== null ? Number(raw.customerId) : raw.customer_id ? Number(raw.customer_id) : null,
    customerName: raw.customerName || raw.customer_name || null,
    purchaseId: raw.purchaseId !== undefined && raw.purchaseId !== null ? Number(raw.purchaseId) : raw.purchase_id ? Number(raw.purchase_id) : null,
    purchaseNumber: raw.purchaseNumber || raw.purchase_number || null,
    supplierName: raw.supplierName || raw.supplier_name || null,
    returnId: raw.returnId || raw.return_id || null,
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.updated_at || new Date().toISOString(),
  };
}

/**
 * Robust check if a payment method matches a filter category (e.g. 'transferencia_bancaria', 'deuna', etc.)
 */
export function isPaymentMethodMatch(
  paymentMethod: string | null | undefined,
  filter: string,
  bankOrAccount?: string | null
): boolean {
  if (!filter || filter === 'all') return true;
  if (!paymentMethod && !bankOrAccount) return filter === 'otro';

  const m = (paymentMethod || '').toLowerCase().trim();
  const b = (bankOrAccount || '').toLowerCase().trim();
  const f = filter.toLowerCase().trim();

  // Direct exact match
  if (m === f) return true;

  // Transfer filter ('transferencia_bancaria' or 'transferencia')
  if (f === 'transferencia_bancaria' || f === 'transferencia') {
    // Exclude explicit mobile QR / cash / card unless they are labeled as transfers
    if (m.includes('deuna') && !m.includes('transferencia')) return false;
    if (m.includes('efectivo') || m.includes('cash') || m.includes('contraentrega')) return false;
    if (m.includes('tarjeta') || m.includes('datafast') || m.includes('payphone')) return false;

    // Direct transfer terms
    if (m.includes('transfer') || m.includes('interbancaria')) return true;

    // Any bank name, bank account, or bank partner (Banco Pichincha, Mi Vecino, Banco Guayaquil, Banco del Barrio, Produbanco, etc.)
    if (
      m.includes('banco') ||
      m.includes('pichincha') ||
      m.includes('guayaquil') ||
      m.includes('pacifico') ||
      m.includes('pacífico') ||
      m.includes('produbanco') ||
      m.includes('bolivariano') ||
      m.includes('internacional') ||
      m.includes('austro') ||
      m.includes('cooperativa') ||
      m.includes('jep') ||
      m.includes('vecino') ||
      m.includes('barrio') ||
      m.includes('cuenta') ||
      m.includes('cta') ||
      m.includes('deposito') ||
      m.includes('depósito')
    ) {
      return true;
    }

    // Check if bank account indicates a bank and method is not cash/card
    if (
      (b.includes('banco') || b.includes('pichincha') || b.includes('guayaquil') || b.includes('produbanco')) &&
      !m.includes('efectivo') &&
      !m.includes('tarjeta') &&
      !m.includes('deuna')
    ) {
      return true;
    }

    return false;
  }

  // Deuna filter
  if (f === 'deuna') {
    return m.includes('deuna') || b.includes('deuna');
  }

  // Cash filter
  if (f === 'efectivo') {
    return (
      m.includes('efectivo') ||
      m.includes('cash') ||
      m.includes('contraentrega') ||
      m.includes('contra_entrega') ||
      m.includes('entrega') ||
      b.includes('caja')
    );
  }

  // Card filter
  if (f === 'tarjeta_credito_debito' || f === 'tarjeta') {
    return (
      m.includes('tarjeta') ||
      m.includes('credito') ||
      m.includes('crédito') ||
      m.includes('debito') ||
      m.includes('débito') ||
      m.includes('datafast') ||
      m.includes('payphone') ||
      m.includes('tc')
    );
  }

  // Deposit filter
  if (f === 'deposito' || f === 'deposito_bancario') {
    return m.includes('deposito') || m.includes('depósito') || m.includes('cnb') || m.includes('ventanilla');
  }

  // Cheque filter
  if (f === 'cheque') {
    return m.includes('cheque');
  }

  return m.includes(f) || b.includes(f);
}

/**
 * Retrieves all ERP payments with comprehensive filtering options
 */
export async function getPayments(
  userId?: number,
  filters?: {
    type?: string;
    category?: string;
    status?: string;
    paymentMethod?: string;
    bankOrAccount?: string;
    orderId?: number;
    purchaseId?: number;
    customerId?: number;
    startDate?: string;
    endDate?: string;
    search?: string;
  }
) {
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    let list = Array.isArray(state.payments) ? [...state.payments] : [];

    if (userId && userId > 0) {
      list = list.filter((p) => Number(p.userId) === Number(userId));
    }

    if (filters?.type && filters.type !== 'all') {
      list = list.filter((p) => p.type === filters.type);
    }
    if (filters?.category && filters.category !== 'all') {
      list = list.filter((p) => p.category === filters.category);
    }
    if (filters?.status && filters.status !== 'all') {
      list = list.filter((p) => p.status === filters.status);
    }
    if (filters?.paymentMethod && filters.paymentMethod !== 'all') {
      list = list.filter((p) => isPaymentMethodMatch(p.paymentMethod, filters.paymentMethod!, p.bankOrAccount));
    }
    if (filters?.bankOrAccount && filters.bankOrAccount !== 'all') {
      list = list.filter((p) => (p.bankOrAccount || '').toLowerCase().includes(filters.bankOrAccount!.toLowerCase()));
    }
    if (filters?.orderId) {
      list = list.filter((p) => Number(p.orderId) === Number(filters.orderId));
    }
    if (filters?.purchaseId) {
      list = list.filter((p) => Number(p.purchaseId) === Number(filters.purchaseId));
    }
    if (filters?.customerId) {
      list = list.filter((p) => Number(p.customerId) === Number(filters.customerId));
    }
    if (filters?.startDate) {
      const start = new Date(filters.startDate).getTime();
      list = list.filter((p) => new Date(p.paymentDate).getTime() >= start);
    }
    if (filters?.endDate) {
      const end = new Date(filters.endDate).getTime();
      list = list.filter((p) => new Date(p.paymentDate).getTime() <= end);
    }
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          (p.paymentNumber && p.paymentNumber.toLowerCase().includes(q)) ||
          (p.referenceNumber && p.referenceNumber.toLowerCase().includes(q)) ||
          (p.customerName && p.customerName.toLowerCase().includes(q)) ||
          (p.supplierName && p.supplierName.toLowerCase().includes(q)) ||
          (p.orderNumber && p.orderNumber.toLowerCase().includes(q)) ||
          (p.purchaseNumber && p.purchaseNumber.toLowerCase().includes(q)) ||
          (p.notes && p.notes.toLowerCase().includes(q)) ||
          (p.bankOrAccount && p.bankOrAccount.toLowerCase().includes(q))
      );
    }

    // Sort descending by payment date
    list.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
    return list.map(normalizePayment);
  }

  try {
    const validUserId = await resolveValidUserId(userId);
    let conditions = [eq(payments.userId, validUserId)];

    if (filters?.type && filters.type !== 'all') {
      conditions.push(eq(payments.type, filters.type));
    }
    if (filters?.category && filters.category !== 'all') {
      conditions.push(eq(payments.category, filters.category));
    }
    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(payments.status, filters.status));
    }
    if (filters?.paymentMethod && filters.paymentMethod !== 'all') {
      const pmf = filters.paymentMethod.toLowerCase().trim();
      if (pmf === 'transferencia_bancaria' || pmf === 'transferencia') {
        conditions.push(
          or(
            eq(payments.paymentMethod, 'transferencia_bancaria'),
            eq(payments.paymentMethod, 'transferencia'),
            ilike(payments.paymentMethod, '%banco%'),
            ilike(payments.paymentMethod, '%pichincha%'),
            ilike(payments.paymentMethod, '%guayaquil%'),
            ilike(payments.paymentMethod, '%vecino%'),
            ilike(payments.paymentMethod, '%barrio%'),
            ilike(payments.paymentMethod, '%transfer%'),
            ilike(payments.paymentMethod, '%produbanco%'),
            ilike(payments.paymentMethod, '%bolivariano%'),
            ilike(payments.paymentMethod, '%pacifico%'),
            ilike(payments.paymentMethod, '%pacífico%')
          )!
        );
      } else if (pmf === 'deuna') {
        conditions.push(ilike(payments.paymentMethod, '%deuna%')!);
      } else if (pmf === 'efectivo') {
        conditions.push(
          or(
            ilike(payments.paymentMethod, '%efectivo%'),
            ilike(payments.paymentMethod, '%contraentrega%'),
            ilike(payments.paymentMethod, '%cash%')
          )!
        );
      } else if (pmf === 'tarjeta_credito_debito' || pmf === 'tarjeta') {
        conditions.push(
          or(
            ilike(payments.paymentMethod, '%tarjeta%'),
            ilike(payments.paymentMethod, '%credito%'),
            ilike(payments.paymentMethod, '%debito%'),
            ilike(payments.paymentMethod, '%datafast%'),
            ilike(payments.paymentMethod, '%payphone%')
          )!
        );
      } else if (pmf === 'deposito' || pmf === 'deposito_bancario') {
        conditions.push(
          or(
            ilike(payments.paymentMethod, '%deposito%'),
            ilike(payments.paymentMethod, '%depósito%'),
            ilike(payments.paymentMethod, '%cnb%'),
            ilike(payments.paymentMethod, '%ventanilla%')
          )!
        );
      } else {
        conditions.push(eq(payments.paymentMethod, filters.paymentMethod));
      }
    }
    if (filters?.orderId) {
      conditions.push(eq(payments.orderId, filters.orderId));
    }
    if (filters?.purchaseId) {
      conditions.push(eq(payments.purchaseId, filters.purchaseId));
    }
    if (filters?.customerId) {
      conditions.push(eq(payments.customerId, filters.customerId));
    }
    if (filters?.search && filters.search.trim()) {
      const q = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(payments.paymentNumber, q),
          ilike(payments.referenceNumber, q),
          ilike(payments.customerName, q),
          ilike(payments.supplierName, q),
          ilike(payments.orderNumber, q),
          ilike(payments.purchaseNumber, q),
          ilike(payments.notes, q),
          ilike(payments.bankOrAccount, q)
        )!
      );
    }

    const rows = await db
      .select()
      .from(payments)
      .where(and(...conditions))
      .orderBy(desc(payments.paymentDate));

    return rows.map(normalizePayment);
  } catch (error) {
    console.error('Error in getPayments SQL:', error);
    const state = storage.getState();
    return (state.payments || []).map(normalizePayment);
  }
}

/**
 * Retrieves a single payment record by ID
 */
export async function getPaymentById(id: number) {
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const found = (state.payments || []).find((p) => Number(p.id) === Number(id));
    return found ? normalizePayment(found) : null;
  }
  try {
    const rows = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
    return rows.length > 0 ? normalizePayment(rows[0]) : null;
  } catch (err) {
    console.error('Error fetching payment by id:', err);
    const state = storage.getState();
    const found = (state.payments || []).find((p) => Number(p.id) === Number(id));
    return found ? normalizePayment(found) : null;
  }
}

/**
 * Creates an ERP Payment and handles bidirectional updates on Orders and Purchases
 */
export async function createPayment(
  userId: number,
  data: {
    type?: 'inflow' | 'outflow' | 'refund' | 'expense';
    category?: 'customer_sale' | 'supplier_purchase' | 'supplier_refund' | 'customer_refund' | 'operational_expense' | 'other';
    amount: number | string;
    paymentMethod: string;
    bankOrAccount: string;
    referenceNumber?: string;
    paymentDate?: string;
    status?: 'completed' | 'pending' | 'voided';
    notes?: string;
    voucherUrl?: string;
    orderId?: number;
    orderNumber?: string;
    customerId?: number;
    customerName?: string;
    purchaseId?: number;
    purchaseNumber?: string;
    supplierName?: string;
    returnId?: string;
  }
) {
  const type = data.type || 'inflow';
  const category = data.category || (type === 'outflow' ? 'supplier_purchase' : type === 'refund' ? 'customer_refund' : 'customer_sale');
  const amountStr = cleanNumericString(data.amount, '0.00');
  const numericAmount = Math.max(0, Number(amountStr));
  const validStatus = data.status || 'completed';
  let paymentDate: string;
  if (!data.paymentDate) {
    paymentDate = new Date().toISOString();
  } else {
    const parsed = new Date(data.paymentDate);
    paymentDate = !isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
  }

  // Autoresolve linked order info
  let linkedOrder: any = null;
  let orderNumber = data.orderNumber || null;
  let customerId = data.customerId || null;
  let customerName = data.customerName || null;

  if (data.orderId) {
    linkedOrder = await getCustomerOrderById(data.orderId);
    if (linkedOrder) {
      orderNumber = linkedOrder.orderNumber;
      customerName = customerName || linkedOrder.customerName;
    }
  }

  // Autoresolve linked purchase info
  let linkedPurchase: any = null;
  let purchaseNumber = data.purchaseNumber || null;
  let supplierName = data.supplierName || null;

  if (data.purchaseId) {
    linkedPurchase = await getPurchaseById(data.purchaseId);
    if (linkedPurchase) {
      purchaseNumber = linkedPurchase.purchaseNumber;
      supplierName = supplierName || linkedPurchase.supplierName;
    }
  }

  const validUserId = await resolveValidUserId(userId);

  // Generate correlative payment number
  const prefix = type === 'inflow' ? 'REC' : type === 'outflow' ? 'EGR' : type === 'refund' ? 'DEV' : 'GAS';
  const year = new Date().getFullYear();
  let paymentSeq = 1;

  const state = storage.getState();
  if (!state.payments) state.payments = [];
  if (!state.nextId.payments) state.nextId.payments = 1;

  const currentCount = state.payments.filter((p) => p.type === type).length;
  paymentSeq = currentCount + 1;
  const paymentNumber = `${prefix}-${year}-${String(paymentSeq).padStart(4, '0')}`;

  const paymentRecord: any = {
    id: state.nextId.payments++,
    userId: validUserId,
    paymentNumber,
    type,
    category,
    amount: amountStr,
    paymentMethod: data.paymentMethod || 'transferencia_bancaria',
    bankOrAccount: data.bankOrAccount || 'Banco Pichincha',
    referenceNumber: data.referenceNumber || null,
    paymentDate,
    status: validStatus,
    notes: data.notes || null,
    voucherUrl: data.voucherUrl || null,
    orderId: data.orderId || null,
    orderNumber,
    customerId,
    customerName,
    purchaseId: data.purchaseId || null,
    purchaseNumber,
    supplierName,
    returnId: data.returnId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!isPostgresConfigured()) {
    state.payments.unshift(paymentRecord);
    storage.save();
  } else {
    try {
      const inserted = await db
        .insert(payments)
        .values({
          userId: validUserId,
          paymentNumber,
          type,
          category,
          amount: amountStr,
          paymentMethod: data.paymentMethod || 'transferencia_bancaria',
          bankOrAccount: data.bankOrAccount || 'Banco Pichincha',
          referenceNumber: data.referenceNumber || null,
          paymentDate: new Date(paymentDate),
          status: validStatus,
          notes: data.notes || null,
          voucherUrl: data.voucherUrl || null,
          orderId: data.orderId || null,
          orderNumber,
          customerId,
          customerName,
          purchaseId: data.purchaseId || null,
          purchaseNumber,
          supplierName,
          returnId: data.returnId || null,
        })
        .returning();

      if (inserted && inserted.length > 0) {
        paymentRecord.id = inserted[0].id;
      }
      state.payments.unshift(paymentRecord);
      storage.save();
    } catch (err) {
      console.warn('Postgres error in createPayment, using local fallback:', err);
      state.payments.unshift(paymentRecord);
      storage.save();
    }
  }

  // ERP Log updates on linked Order if applicable
  if (data.orderId && validStatus === 'completed' && type === 'inflow') {
    try {
      const order = linkedOrder || (await getCustomerOrderById(data.orderId));
      if (order) {
        // Calculate cumulative paid
        const allPayments = await getPayments(validUserId, { orderId: data.orderId, status: 'completed', type: 'inflow' });
        const totalPaid = allPayments.reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0);
        const orderTotal = Number(order.totalAmount || 0);

        const methodLabel = data.paymentMethod ? data.paymentMethod.replace(/_/g, ' ') : 'Transferencia';
        const timestamp = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
        const paymentNote = `[${timestamp} Pago Registrado] 💵 ${paymentNumber}: $${numericAmount.toFixed(2)} vía ${methodLabel} (${data.bankOrAccount || 'Banco'}). Total abonado: $${totalPaid.toFixed(2)} / $${orderTotal.toFixed(2)}`;

        const updatedNotes = (order.notes ? order.notes + '\n' : '') + paymentNote;
        await updateCustomerOrder(order.id, {
          paymentVoucher: data.referenceNumber || order.paymentVoucher,
          notes: updatedNotes,
        });
      }
    } catch (ordErr) {
      console.warn('Could not auto-append payment log to order:', ordErr);
    }
  }

  // ERP Log updates on linked Purchase if applicable
  if (data.purchaseId && validStatus === 'completed') {
    try {
      const purchase = linkedPurchase || (await getPurchaseById(data.purchaseId));
      if (purchase) {
        const methodLabel = data.paymentMethod ? data.paymentMethod.replace(/_/g, ' ') : 'Transferencia';
        const timestamp = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });

        if (type === 'outflow') {
          const allDisbursements = await getPayments(validUserId, { purchaseId: data.purchaseId, status: 'completed', type: 'outflow' });
          const totalDisbursed = allDisbursements.reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0);
          const purchaseTotal = Number(purchase.totalCost || 0);

          const newPaymentStatus = totalDisbursed >= (purchaseTotal - 0.001) ? 'paid' : totalDisbursed > 0 ? 'partial' : 'unpaid';
          const paymentNote = `[${timestamp} Egreso Proveedor] 💳 ${paymentNumber}: $${numericAmount.toFixed(2)} vía ${methodLabel} (${data.bankOrAccount || 'Banco'}). Total pagado: $${totalDisbursed.toFixed(2)} / $${purchaseTotal.toFixed(2)}`;
          const updatedNotes = (purchase.notes ? purchase.notes + '\n' : '') + paymentNote;
          
          const updates: any = {
            paymentStatus: newPaymentStatus,
            notes: updatedNotes,
          };

          // Regla ERP: Cuando la compra está en estado 'pending' (borrador), al ingresar el pago se confirma automáticamente con el proveedor
          if (purchase.status === 'pending') {
            updates.status = 'ordered';
          }

          await updatePurchase(purchase.id, updates);
        } else if (category === 'supplier_refund' || type === 'refund') {
          const refundNote = `[${timestamp} Reembolso/Devolución Proveedor] 🔄 ${paymentNumber}: $${numericAmount.toFixed(2)} vía ${methodLabel} (${data.bankOrAccount || 'Banco/Caja'}). Registrado en Tesorería.`;
          const updatedNotes = (purchase.notes ? purchase.notes + '\n' : '') + refundNote;
          await updatePurchase(purchase.id, { notes: updatedNotes });
        }
      }
    } catch (purchErr) {
      console.warn('Could not auto-append disbursement/refund log to purchase:', purchErr);
    }
  }

  return normalizePayment(paymentRecord);
}

/**
 * Updates an existing payment record
 */
export async function updatePayment(id: number, data: Partial<any>) {
  const state = storage.getState();
  const idx = (state.payments || []).findIndex((p) => Number(p.id) === Number(id));
  if (idx === -1 && !isPostgresConfigured()) return null;

  const updatePayload: any = { updatedAt: new Date().toISOString() };
  if (data.amount !== undefined) updatePayload.amount = cleanNumericString(data.amount, '0.00');
  if (data.paymentMethod !== undefined) updatePayload.paymentMethod = data.paymentMethod;
  if (data.bankOrAccount !== undefined) updatePayload.bankOrAccount = data.bankOrAccount;
  if (data.referenceNumber !== undefined) updatePayload.referenceNumber = data.referenceNumber;
  if (data.paymentDate !== undefined) updatePayload.paymentDate = new Date(data.paymentDate).toISOString();
  if (data.status !== undefined) updatePayload.status = data.status;
  if (data.notes !== undefined) updatePayload.notes = data.notes;
  if (data.voucherUrl !== undefined) updatePayload.voucherUrl = data.voucherUrl;

  if (isPostgresConfigured()) {
    try {
      const sqlPayload: any = { updatedAt: new Date() };
      if (updatePayload.amount) sqlPayload.amount = updatePayload.amount;
      if (updatePayload.paymentMethod) sqlPayload.paymentMethod = updatePayload.paymentMethod;
      if (updatePayload.bankOrAccount) sqlPayload.bankOrAccount = updatePayload.bankOrAccount;
      if (updatePayload.referenceNumber !== undefined) sqlPayload.referenceNumber = updatePayload.referenceNumber;
      if (updatePayload.paymentDate) sqlPayload.paymentDate = new Date(updatePayload.paymentDate);
      if (updatePayload.status) sqlPayload.status = updatePayload.status;
      if (updatePayload.notes !== undefined) sqlPayload.notes = updatePayload.notes;
      if (updatePayload.voucherUrl !== undefined) sqlPayload.voucherUrl = updatePayload.voucherUrl;

      await db.update(payments).set(sqlPayload).where(eq(payments.id, id));
    } catch (err) {
      console.warn('SQL update error in updatePayment:', err);
    }
  }

  if (idx !== -1) {
    state.payments[idx] = { ...state.payments[idx], ...updatePayload };
    storage.save();
    return normalizePayment(state.payments[idx]);
  }

  return await getPaymentById(id);
}

/**
 * Voids a payment with full ERP audit trail
 */
export async function voidPayment(id: number, voidReason?: string) {
  const current = await getPaymentById(id);
  if (!current) return null;

  const timestamp = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  const voidNote = `[${timestamp} ANULACIÓN ERP] ⚠️ Comprobante anulado por administración. Motivo: ${voidReason || 'Anulación manual'}`;
  const combinedNotes = (current.notes ? current.notes + '\n' : '') + voidNote;

  const updated = await updatePayment(id, {
    status: 'voided',
    notes: combinedNotes,
  });

  return updated;
}

/**
 * Deletes a payment record
 */
export async function deletePayment(id: number) {
  const state = storage.getState();
  if (state.payments) {
    state.payments = state.payments.filter((p) => Number(p.id) !== Number(id));
    storage.save();
  }
  if (isPostgresConfigured()) {
    try {
      await db.delete(payments).where(eq(payments.id, id));
    } catch (err) {
      console.warn('SQL delete payment error:', err);
    }
  }
  return { success: true };
}

let isAutoReconciling = false;

/**
 * Automatically reconciles payments from confirmed orders and purchases
 */
export async function autoReconcileLedger(userId?: number) {
  if (isAutoReconciling) return;
  isAutoReconciling = true;
  try {
    const validUserId = await resolveValidUserId(userId);
    const existingPayments = await getPayments(validUserId);
    const orders = await getCustomerOrders(validUserId);
    const purchasesList = await getPurchases(validUserId);

    // Auto-reconcile customer sales
    for (const ord of orders) {
      if (ord.status === 'cancelled') continue;
      const hasPayment = existingPayments.some(
        (p) => Number(p.orderId) === Number(ord.id) && p.type === 'inflow' && p.status !== 'voided'
      );
      if (!hasPayment && (ord.paymentVoucher || ord.status === 'confirmed' || ord.status === 'delivered' || ord.status === 'shipped')) {
        const orderAmount = Number(ord.totalAmount || 0);
        if (orderAmount > 0) {
          let items: any[] = [];
          try {
            items = typeof ord.items === 'string' ? JSON.parse(ord.items) : ord.items || [];
          } catch {}
          const totalDelivered = items.reduce((acc, it) => acc + (Number(it.deliveredQuantity) || 0), 0);
          const totalPending = items.reduce((acc, it) => acc + (Number(it.pendingQuantity) || 0), 0);
          const totalReq = items.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0);

          let note = `[Conciliación Automática ERP] Cobro de venta #${ord.orderNumber}`;
          if (totalPending > 0 && totalDelivered > 0) {
            note = `[Conciliación Automática ERP] Cobro venta #${ord.orderNumber} - ${totalDelivered}/${totalReq} un. entregadas de stock inmediato, ${totalPending} un. solicitadas a proveedor${ord.linkedPurchaseNumber ? ' (OC #' + ord.linkedPurchaseNumber + ')' : ''}`;
          } else if (totalPending > 0) {
            note = `[Conciliación Automática ERP] Cobro venta #${ord.orderNumber} - ${totalPending} un. bajo pedido solicitadas a proveedor${ord.linkedPurchaseNumber ? ' (OC #' + ord.linkedPurchaseNumber + ')' : ''}`;
          }

          await createPayment(validUserId, {
            type: 'inflow',
            category: 'customer_sale',
            amount: orderAmount,
            paymentMethod: ord.paymentMethod || 'transferencia_bancaria',
            bankOrAccount: 'Banco Pichincha',
            referenceNumber: ord.paymentVoucher || `AUTO-PED-${ord.orderNumber}`,
            paymentDate: ord.createdAt ? (ord.createdAt instanceof Date ? ord.createdAt.toISOString() : String(ord.createdAt)) : new Date().toISOString(),
            status: 'completed',
            notes: note,
            orderId: ord.id,
            orderNumber: ord.orderNumber,
            customerName: ord.customerName,
          });
        }
      }
    }

    // Auto-reconcile supplier purchases
    for (const po of purchasesList) {
      if (po.status === 'cancelled') continue;
      const hasDisbursement = existingPayments.some(
        (p) => Number(p.purchaseId) === Number(po.id) && p.type === 'outflow' && p.status !== 'voided'
      );
      if (!hasDisbursement && (po.paymentStatus === 'paid' || po.receiptVoucher || po.status === 'received')) {
        const costAmount = Number(po.totalCost || 0);
        if (costAmount > 0) {
          await createPayment(validUserId, {
            type: 'outflow',
            category: 'supplier_purchase',
            amount: costAmount,
            paymentMethod: 'transferencia_bancaria',
            bankOrAccount: 'Banco Pichincha',
            referenceNumber: po.receiptVoucher || `AUTO-COM-${po.purchaseNumber}`,
            paymentDate: (po.purchaseDate || po.createdAt) ? String(po.purchaseDate || po.createdAt) : new Date().toISOString(),
            status: 'completed',
            notes: `[Conciliación Automática ERP] Pago registrado a proveedor por compra #${po.purchaseNumber}`,
            purchaseId: po.id,
            purchaseNumber: po.purchaseNumber,
            supplierName: po.supplierName,
          });
        }
      }
    }
  } catch (err) {
    console.warn('Auto-reconciliation error:', err);
  } finally {
    isAutoReconciling = false;
  }
}

/**
 * Calculates Accounts Receivable (CxC) with status per sales order
 */
export async function getAccountsReceivable(userId?: number) {
  await autoReconcileLedger(userId);
  const orders = await getCustomerOrders(userId);
  const allInflows = await getPayments(userId, { type: 'inflow', status: 'completed' });
  const allRefunds = await getPayments(userId, { type: 'refund', status: 'completed' });

  return orders.map((ord: any) => {
    const totalAmount = Number(ord.totalAmount || 0);
    const ordInflows = allInflows.filter((p) => Number(p.orderId) === Number(ord.id));
    const ordRefunds = allRefunds.filter((p) => Number(p.orderId) === Number(ord.id));

    const totalPaid = ordInflows.reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0);
    const totalRefunded = ordRefunds.reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0);

    const pendingBalance = Math.max(0, totalAmount - totalPaid);

    let paymentStatus: 'paid' | 'partial' | 'unpaid' | 'refunded' = 'unpaid';
    if (totalRefunded >= totalAmount && totalAmount > 0) {
      paymentStatus = 'refunded';
    } else if (pendingBalance <= 0.005 && totalAmount > 0) {
      paymentStatus = 'paid';
    } else if (totalPaid > 0) {
      paymentStatus = 'partial';
    } else {
      paymentStatus = 'unpaid';
    }

    const lastPayment = ordInflows.length > 0 ? ordInflows[0].paymentDate : undefined;

    return {
      orderId: ord.id,
      orderNumber: ord.orderNumber,
      customerName: ord.customerName,
      customerPhone: ord.customerPhone,
      orderDate: ord.createdAt,
      orderStatus: ord.status,
      fulfillmentStatus: ord.fulfillmentStatus,
      totalAmount,
      totalPaid,
      totalRefunded,
      pendingBalance,
      paymentStatus,
      paymentsCount: ordInflows.length,
      lastPaymentDate: lastPayment,
      payments: ordInflows,
    };
  });
}

/**
 * Calculates Accounts Payable (CxP) with status per purchase order
 */
export async function getAccountsPayable(userId?: number) {
  await autoReconcileLedger(userId);
  const purchasesList = await getPurchases(userId);
  const allOutflows = await getPayments(userId, { type: 'outflow', status: 'completed' });
  const allPayments = await getPayments(userId, { status: 'completed' });

  return purchasesList.map((po: any) => {
    const totalCost = Number(po.totalCost || 0);
    const returns = Array.isArray(po.returns) ? po.returns : [];
    const totalReturned = returns.reduce((acc: number, ret: any) => acc + Number(ret.refundAmount || 0), 0);
    const netCost = Math.max(0, totalCost - totalReturned);

    const poOutflows = allOutflows.filter((p) => Number(p.purchaseId) === Number(po.id));
    const poRefunds = allPayments.filter(
      (p) => Number(p.purchaseId) === Number(po.id) && (p.category === 'supplier_refund' || p.type === 'refund')
    );

    const totalPaid = poOutflows.reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0);
    const totalRefunded = poRefunds.reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0);

    const pendingBalance = Math.max(0, netCost - totalPaid);

    let paymentStatus: 'paid' | 'partial' | 'unpaid' | 'refunded' = 'unpaid';
    if (totalReturned >= totalCost && totalCost > 0) {
      paymentStatus = 'refunded';
    } else if (pendingBalance <= 0.005 && totalCost > 0) {
      paymentStatus = 'paid';
    } else if (totalPaid > 0) {
      paymentStatus = 'partial';
    } else {
      paymentStatus = 'unpaid';
    }

    const lastPayment = poOutflows.length > 0 ? poOutflows[0].paymentDate : (poRefunds.length > 0 ? poRefunds[0].paymentDate : undefined);

    return {
      purchaseId: po.id,
      purchaseNumber: po.purchaseNumber,
      supplierName: po.supplierName,
      supplierContact: po.supplierContact,
      purchaseDate: po.purchaseDate || po.createdAt,
      purchaseStatus: po.status,
      totalCost,
      totalReturned,
      netCost,
      totalPaid,
      totalRefunded,
      pendingBalance,
      paymentStatus,
      paymentsCount: poOutflows.length + poRefunds.length,
      lastPaymentDate: lastPayment,
      payments: [...poOutflows, ...poRefunds],
      returns,
    };
  });
}

/**
 * Calculates complete Treasury Dashboard (Flujo de Caja, Balances y Desglose Financiero)
 */
export async function getTreasuryDashboard(userId?: number) {
  await autoReconcileLedger(userId);
  const allPayments = await getPayments(userId);
  const completedPayments = allPayments.filter((p) => p.status === 'completed');

  let totalInflows = 0;
  let totalOutflows = 0;
  let totalRefunds = 0;
  let totalExpenses = 0;

  const byPaymentMethod: Record<
    string,
    { total: number; count: number; inflows: number; outflows: number; inflowsCount: number; outflowsCount: number }
  > = {};
  const byBankOrAccount: Record<
    string,
    { total: number; count: number; inflows: number; outflows: number; inflowsCount: number; outflowsCount: number }
  > = {};

  completedPayments.forEach((p) => {
    const amt = Number(p.amount || 0);
    const method = p.paymentMethod || 'transferencia_bancaria';
    const bank = p.bankOrAccount || 'Banco Pichincha';

    if (p.type === 'inflow') {
      totalInflows += amt;
    } else if (p.type === 'outflow') {
      totalOutflows += amt;
    } else if (p.type === 'refund') {
      totalRefunds += amt;
    } else if (p.type === 'expense') {
      totalExpenses += amt;
    }

    // Method breakdown (Inflows - Outflows) with normalized category
    let canonicalMethod = method;
    if (isPaymentMethodMatch(method, 'transferencia_bancaria', bank)) {
      canonicalMethod = 'transferencia_bancaria';
    } else if (isPaymentMethodMatch(method, 'deuna', bank)) {
      canonicalMethod = 'deuna';
    } else if (isPaymentMethodMatch(method, 'efectivo', bank)) {
      canonicalMethod = 'efectivo';
    } else if (isPaymentMethodMatch(method, 'tarjeta_credito_debito', bank)) {
      canonicalMethod = 'tarjeta_credito_debito';
    } else if (isPaymentMethodMatch(method, 'deposito', bank)) {
      canonicalMethod = 'deposito';
    } else if (isPaymentMethodMatch(method, 'cheque', bank)) {
      canonicalMethod = 'cheque';
    }

    if (!byPaymentMethod[canonicalMethod]) {
      byPaymentMethod[canonicalMethod] = {
        total: 0,
        count: 0,
        inflows: 0,
        outflows: 0,
        inflowsCount: 0,
        outflowsCount: 0,
      };
    }
    byPaymentMethod[canonicalMethod].count += 1;
    if (p.type === 'inflow') {
      byPaymentMethod[canonicalMethod].total += amt;
      byPaymentMethod[canonicalMethod].inflows += amt;
      byPaymentMethod[canonicalMethod].inflowsCount += 1;
    } else if (p.type === 'outflow' || p.type === 'refund' || p.type === 'expense') {
      byPaymentMethod[canonicalMethod].total -= amt;
      byPaymentMethod[canonicalMethod].outflows += amt;
      byPaymentMethod[canonicalMethod].outflowsCount += 1;
    }

    // Bank/Account breakdown
    if (!byBankOrAccount[bank]) {
      byBankOrAccount[bank] = {
        total: 0,
        count: 0,
        inflows: 0,
        outflows: 0,
        inflowsCount: 0,
        outflowsCount: 0,
      };
    }
    byBankOrAccount[bank].count += 1;
    if (p.type === 'inflow') {
      byBankOrAccount[bank].total += amt;
      byBankOrAccount[bank].inflows += amt;
      byBankOrAccount[bank].inflowsCount += 1;
    } else if (p.type === 'outflow' || p.type === 'refund' || p.type === 'expense') {
      byBankOrAccount[bank].total -= amt;
      byBankOrAccount[bank].outflows += amt;
      byBankOrAccount[bank].outflowsCount += 1;
    }
  });

  // Round values for precision
  Object.keys(byPaymentMethod).forEach((k) => {
    byPaymentMethod[k].total = Math.round(byPaymentMethod[k].total * 100) / 100;
    byPaymentMethod[k].inflows = Math.round(byPaymentMethod[k].inflows * 100) / 100;
    byPaymentMethod[k].outflows = Math.round(byPaymentMethod[k].outflows * 100) / 100;
  });
  Object.keys(byBankOrAccount).forEach((k) => {
    byBankOrAccount[k].total = Math.round(byBankOrAccount[k].total * 100) / 100;
    byBankOrAccount[k].inflows = Math.round(byBankOrAccount[k].inflows * 100) / 100;
    byBankOrAccount[k].outflows = Math.round(byBankOrAccount[k].outflows * 100) / 100;
  });

  const netCashBalance = totalInflows - totalOutflows - totalRefunds - totalExpenses;

  // Receivables & Payables summary
  const receivables = await getAccountsReceivable(userId);
  const payables = await getAccountsPayable(userId);

  const totalAccountsReceivablePending = receivables.reduce((acc, r) => acc + r.pendingBalance, 0);
  const totalAccountsPayablePending = payables.reduce((acc, p) => acc + p.pendingBalance, 0);

  const receivablesPaidCount = receivables.filter((r) => r.paymentStatus === 'paid').length;
  const receivablesPendingCount = receivables.filter((r) => r.paymentStatus === 'unpaid' || r.paymentStatus === 'partial').length;
  const payablesPaidCount = payables.filter((p) => p.paymentStatus === 'paid').length;
  const payablesPendingCount = payables.filter((p) => p.paymentStatus === 'unpaid' || p.paymentStatus === 'partial').length;

  return {
    totalInflows: Math.round(totalInflows * 100) / 100,
    totalOutflows: Math.round(totalOutflows * 100) / 100,
    totalRefunds: Math.round(totalRefunds * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netCashBalance: Math.round(netCashBalance * 100) / 100,
    totalAccountsReceivablePending: Math.round(totalAccountsReceivablePending * 100) / 100,
    totalAccountsPayablePending: Math.round(totalAccountsPayablePending * 100) / 100,
    receivablesPaidCount,
    receivablesPendingCount,
    payablesPaidCount,
    payablesPendingCount,
    byPaymentMethod,
    byBankOrAccount,
    recentPayments: allPayments.slice(0, 15),
  };
}

/**
 * ERP Synchronization: Creates ledger receipts for historical orders/purchases that don't have payment records yet
 */
export async function syncPaymentsFromOrdersAndPurchases(userId?: number) {
  const validUserId = await resolveValidUserId(userId);
  const existingPayments = await getPayments(validUserId);
  const orders = await getCustomerOrders(validUserId);
  const purchasesList = await getPurchases(validUserId);

  let syncedInflows = 0;
  let syncedOutflows = 0;

  // Sync customer orders that are confirmed, delivered, shipped, or have vouchers
  for (const ord of orders) {
    if (ord.status === 'cancelled') continue;
    const correctBank = deriveBankOrAccountFromMethod(ord.paymentMethod, ord.notes);

    const orderPayments = existingPayments.filter(
      (p) => Number(p.orderId) === Number(ord.id) && p.type === 'inflow' && p.status !== 'voided'
    );

    if (orderPayments.length === 0 && (ord.paymentVoucher || ord.status === 'confirmed' || ord.status === 'delivered' || ord.status === 'shipped')) {
      const orderAmount = Number(ord.totalAmount || 0);
      if (orderAmount > 0) {
        await createPayment(validUserId, {
          type: 'inflow',
          category: 'customer_sale',
          amount: orderAmount,
          paymentMethod: ord.paymentMethod || 'transferencia_bancaria',
          bankOrAccount: correctBank,
          referenceNumber: ord.paymentVoucher || `AUTO-PED-${ord.orderNumber}`,
          paymentDate: ord.createdAt ? (ord.createdAt instanceof Date ? ord.createdAt.toISOString() : String(ord.createdAt)) : new Date().toISOString(),
          status: 'completed',
          notes: `[Conciliación Automática ERP] Cobro confirmado de venta #${ord.orderNumber}`,
          orderId: ord.id,
          orderNumber: ord.orderNumber,
          customerName: ord.customerName,
        });
        syncedInflows++;
      }
    } else {
      // Auto-heal existing payments whose bank was incorrectly defaulted to Pichincha when customer paid with another bank
      for (const existingPayment of orderPayments) {
        if (
          correctBank &&
          existingPayment.bankOrAccount !== correctBank &&
          (!existingPayment.notes || !existingPayment.notes.includes('manual_bank_override'))
        ) {
          try {
            await updatePayment(existingPayment.id, {
              bankOrAccount: correctBank,
              paymentMethod: ord.paymentMethod || existingPayment.paymentMethod,
            });
          } catch (healErr) {
            console.warn('Failed to heal bank in payment record:', healErr);
          }
        }
      }
    }
  }

  // Sync purchase orders
  for (const po of purchasesList) {
    if (po.status === 'cancelled') continue;
    const hasDisbursement = existingPayments.some(
      (p) => Number(p.purchaseId) === Number(po.id) && p.type === 'outflow' && p.status !== 'voided'
    );
    if (!hasDisbursement && (po.paymentStatus === 'paid' || po.receiptVoucher || po.status === 'received')) {
      const costAmount = Number(po.totalCost || 0);
      if (costAmount > 0) {
        await createPayment(validUserId, {
          type: 'outflow',
          category: 'supplier_purchase',
          amount: costAmount,
          paymentMethod: 'transferencia_bancaria',
          bankOrAccount: 'Banco Pichincha',
          referenceNumber: po.receiptVoucher || `AUTO-COM-${po.purchaseNumber}`,
          paymentDate: (po.purchaseDate || po.createdAt) ? String(po.purchaseDate || po.createdAt) : new Date().toISOString(),
          status: 'completed',
          notes: `[Conciliación Automática ERP] Pago a proveedor por orden de compra #${po.purchaseNumber}`,
          purchaseId: po.id,
          purchaseNumber: po.purchaseNumber,
          supplierName: po.supplierName,
        });
        syncedOutflows++;
      }
    }
  }

  // Sync historical Customer Returns (RMA) if no refund payment exists
  let syncedRefunds = 0;
  for (const ord of orders) {
    const rawReturns = (ord as any).returns;
    const returnsList = Array.isArray(rawReturns)
      ? rawReturns
      : typeof rawReturns === 'string'
      ? (() => {
          try {
            return JSON.parse(rawReturns);
          } catch {
            return [];
          }
        })()
      : [];

    for (const ret of returnsList) {
      const refAmt = Number(ret.refundAmount || 0);
      if (refAmt <= 0) continue;

      const hasRefundRecord = existingPayments.some(
        (p) =>
          (p.type === 'refund' || p.category === 'customer_refund') &&
          ((ret.id && p.returnId === ret.id) || (Number(p.orderId) === Number(ord.id) && Math.abs(Number(p.amount) - refAmt) < 0.01))
      );

      if (!hasRefundRecord) {
        await createPayment(validUserId, {
          type: 'refund',
          category: 'customer_refund',
          amount: refAmt,
          paymentMethod: ret.paymentMethod || 'transferencia_bancaria',
          bankOrAccount: ret.bankOrAccount || 'Banco Pichincha',
          referenceNumber: ret.referenceNumber || `RMA-${ord.orderNumber}`,
          paymentDate: ret.date || new Date().toISOString(),
          status: 'completed',
          notes: `[Conciliación Devolución Venta] Reembolso liquidado por devolución RMA #${ret.id || ord.orderNumber} en pedido #${ord.orderNumber}`,
          orderId: ord.id,
          orderNumber: ord.orderNumber,
          customerId: (ord as any).customerId,
          customerName: ord.customerName,
          returnId: ret.id,
        });
        syncedRefunds++;
      }
    }
  }

  return {
    success: true,
    syncedInflows,
    syncedOutflows,
    syncedRefunds,
    message: `✓ Conciliación ERP automática completada: ${syncedInflows} cobros de pedidos, ${syncedOutflows} pagos a proveedores y ${syncedRefunds} reembolsos de devoluciones registrados en tesorería.`,
  };
}


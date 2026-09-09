/**
 * Client-side Analytics Tracking Service for Comerxia Store
 * Captures user actions (visits, product views, cart additions, WhatsApp checkouts)
 * with debounce and session tracking.
 */

import { safeSessionStorage } from '../utils/safeStorage.ts';

// Generate or retrieve anonymous session ID (lasts for the browser session)
function getSessionId(): string {
  if (typeof window === 'undefined') return 'server_session';
  try {
    let sid = safeSessionStorage.getItem('comerxia_analytics_session_id');
    if (!sid) {
      sid = 'sess_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      safeSessionStorage.setItem('comerxia_analytics_session_id', sid);
    }
    return sid;
  } catch {
    return 'fallback_session_' + Date.now();
  }
}

// Detect device type
function getDeviceType(): 'mobile' | 'desktop' | 'tablet' {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  const isTablet = /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP))))/.test(ua);
  if (isTablet) return 'tablet';
  const isMobile = /mobile|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop|android/i.test(ua);
  if (isMobile) return 'mobile';
  return 'desktop';
}

// In-memory cache to prevent tracking the same product view multiple times in rapid succession (15s throttle)
const productViewThrottleMap = new Map<number, number>();
let lastStoreVisitTrackTime = 0;

export async function sendAnalyticsEvent(data: {
  eventType: 'store_visit' | 'product_view' | 'add_to_cart' | 'whatsapp_click' | 'order_placed';
  productId?: number | null;
  productName?: string | null;
  metadata?: Record<string, any>;
}) {
  try {
    const payload = {
      eventType: data.eventType,
      productId: data.productId || null,
      productName: data.productName || null,
      sessionId: getSessionId(),
      deviceType: getDeviceType(),
      metadata: data.metadata || null,
    };

    // Non-blocking fetch
    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Silent error handling for analytics to never impact UX
    });
  } catch {}
}

/**
 * Tracks when a customer visits the online store (throttled to once every 10 minutes per tab)
 */
export function trackStoreVisit() {
  const now = Date.now();
  if (now - lastStoreVisitTrackTime < 10 * 60 * 1000) {
    return; // Already tracked recently in this session
  }
  lastStoreVisitTrackTime = now;
  sendAnalyticsEvent({ eventType: 'store_visit' });
}

/**
 * Tracks when a customer views a product modal or quick view
 * Throttled to once every 15 seconds per product to avoid double counts on re-renders
 */
export function trackProductView(productId: number, productName?: string, metadata?: Record<string, any>) {
  if (!productId) return;
  const now = Date.now();
  const lastTime = productViewThrottleMap.get(productId) || 0;
  if (now - lastTime < 15 * 1000) {
    return;
  }
  productViewThrottleMap.set(productId, now);
  sendAnalyticsEvent({
    eventType: 'product_view',
    productId,
    productName: productName || undefined,
    metadata,
  });
}

/**
 * Tracks when an item is added to the shopping cart
 */
export function trackAddToCart(productId: number, productName?: string, quantity: number = 1, price?: number | string) {
  if (!productId) return;
  sendAnalyticsEvent({
    eventType: 'add_to_cart',
    productId,
    productName: productName || undefined,
    metadata: { quantity, price },
  });
}

/**
 * Tracks when a customer clicks to proceed to WhatsApp with their order
 */
export function trackWhatsAppClick(totalAmount?: number | string, itemsCount?: number, orderNumber?: string) {
  sendAnalyticsEvent({
    eventType: 'whatsapp_click',
    metadata: { totalAmount, itemsCount, orderNumber },
  });
}

/**
 * Tracks a completed order
 */
export function trackOrderPlaced(orderNumber: string, totalAmount?: number | string, itemsCount?: number) {
  sendAnalyticsEvent({
    eventType: 'order_placed',
    metadata: { orderNumber, totalAmount, itemsCount },
  });
}

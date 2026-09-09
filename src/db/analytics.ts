import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db, isPostgresConfigured } from './index.ts';
import { customerOrders, inventoryItems, storeAnalyticsEvents, users } from './schema.ts';
import { storage } from './storage.ts';

export interface AnalyticsEventInput {
  userId?: number;
  eventType: 'store_visit' | 'product_view' | 'add_to_cart' | 'whatsapp_click' | 'order_placed';
  productId?: number | null;
  productName?: string | null;
  sessionId?: string | null;
  deviceType?: 'mobile' | 'desktop' | 'tablet' | string;
  metadata?: Record<string, any> | null;
}

export interface AnalyticsDashboardFilter {
  userId?: number;
  period?: 'today' | '7d' | '30d' | '90d' | 'year' | 'all';
  productId?: number | null;
}

// Helper to calculate date cutoff
function getPeriodStartDate(period: string = '7d'): Date | null {
  const now = new Date();
  if (period === 'today') {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return today;
  }
  if (period === '7d') {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === '30d') {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === '90d') {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === 'year') {
    const d = new Date(now.getFullYear(), 0, 1);
    return d;
  }
  return null; // 'all'
}

/**
 * Records an analytics event (visit, view, cart, whatsapp click)
 */
export async function recordAnalyticsEvent(event: AnalyticsEventInput) {
  const now = new Date();
  const userId = event.userId || 1;
  const metadataStr = event.metadata ? JSON.stringify(event.metadata) : null;
  const device = event.deviceType || 'desktop';

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.storeAnalyticsEvents) {
      state.storeAnalyticsEvents = [];
    }
    const newId = (state.nextId.storeAnalyticsEvents = (state.nextId.storeAnalyticsEvents || 1) + 1);

    state.storeAnalyticsEvents.push({
      id: newId,
      userId,
      eventType: event.eventType,
      productId: event.productId || null,
      productName: event.productName || null,
      sessionId: event.sessionId || null,
      deviceType: device,
      metadata: metadataStr,
      createdAt: now.toISOString(),
    });

    // Keep array bounded to prevent memory growth (keep last 50,000 events)
    if (state.storeAnalyticsEvents.length > 50000) {
      state.storeAnalyticsEvents.splice(0, state.storeAnalyticsEvents.length - 50000);
    }

    storage.save();
    return { success: true, id: newId };
  }

  try {
    // Resolve user ID
    let targetUserId = userId;
    const userCheck = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId)).limit(1);
    if (userCheck.length === 0) {
      const anyUser = await db.select({ id: users.id }).from(users).limit(1);
      if (anyUser.length > 0) {
        targetUserId = anyUser[0].id;
      }
    }

    const inserted = await db
      .insert(storeAnalyticsEvents)
      .values({
        userId: targetUserId,
        eventType: event.eventType,
        productId: event.productId || null,
        productName: event.productName || null,
        sessionId: event.sessionId || null,
        deviceType: device,
        metadata: metadataStr,
        createdAt: now,
      })
      .returning({ id: storeAnalyticsEvents.id });

    return { success: true, id: inserted[0]?.id };
  } catch (error) {
    console.warn('Error inserting analytics event into PostgreSQL, fallback to memory:', error);
    const state = storage.getState();
    if (!state.storeAnalyticsEvents) state.storeAnalyticsEvents = [];
    const newId = (state.nextId.storeAnalyticsEvents = (state.nextId.storeAnalyticsEvents || 1) + 1);
    state.storeAnalyticsEvents.push({
      id: newId,
      userId,
      eventType: event.eventType,
      productId: event.productId || null,
      productName: event.productName || null,
      sessionId: event.sessionId || null,
      deviceType: device,
      metadata: metadataStr,
      createdAt: now.toISOString(),
    });
    storage.save();
    return { success: true, id: newId };
  }
}

/**
 * Gets aggregated dashboard statistics with date and product filtering
 */
export async function getStoreAnalyticsDashboard(filter: AnalyticsDashboardFilter = {}) {
  const period = filter.period || '7d';
  const targetProductId = filter.productId ? Number(filter.productId) : null;
  const startDate = getPeriodStartDate(period);

  let rawEvents: any[] = [];
  let rawOrders: any[] = [];
  let rawItems: any[] = [];

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    rawEvents = (state.storeAnalyticsEvents || []).filter((ev) => {
      if (!startDate) return true;
      return new Date(ev.createdAt) >= startDate;
    });
    rawOrders = (state.customerOrders || []).filter((ord) => {
      if (!startDate) return true;
      return new Date(ord.createdAt) >= startDate;
    });
    rawItems = state.inventoryItems || [];
  } else {
    try {
      if (startDate) {
        rawEvents = await db
          .select()
          .from(storeAnalyticsEvents)
          .where(gte(storeAnalyticsEvents.createdAt, startDate));
        rawOrders = await db
          .select()
          .from(customerOrders)
          .where(gte(customerOrders.createdAt, startDate));
      } else {
        rawEvents = await db.select().from(storeAnalyticsEvents);
        rawOrders = await db.select().from(customerOrders);
      }
      rawItems = await db.select().from(inventoryItems);
    } catch (err) {
      console.warn('Postgres error loading analytics, using fallback state:', err);
      const state = storage.getState();
      rawEvents = (state.storeAnalyticsEvents || []).filter((ev) => {
        if (!startDate) return true;
        return new Date(ev.createdAt) >= startDate;
      });
      rawOrders = (state.customerOrders || []).filter((ord) => {
        if (!startDate) return true;
        return new Date(ord.createdAt) >= startDate;
      });
      rawItems = state.inventoryItems || [];
    }
  }

  // Filter by single product if requested
  if (targetProductId) {
    rawEvents = rawEvents.filter((ev) => ev.productId === targetProductId);
  }

  // 1. KPI Counts
  let totalVisits = 0;
  const uniqueVisitorSessions = new Set<string>();
  let totalProductViews = 0;
  let totalCartAdditions = 0;
  let totalWhatsappClicks = 0;

  const viewsByProduct: Record<number, number> = {};
  const cartAddsByProduct: Record<number, number> = {};
  const deviceCounts: Record<string, number> = { mobile: 0, desktop: 0, tablet: 0 };

  rawEvents.forEach((ev) => {
    const dev = (ev.deviceType || 'desktop').toLowerCase();
    deviceCounts[dev] = (deviceCounts[dev] || 0) + 1;

    if (ev.eventType === 'store_visit') {
      totalVisits++;
      if (ev.sessionId) uniqueVisitorSessions.add(ev.sessionId);
    } else if (ev.eventType === 'product_view') {
      totalProductViews++;
      if (ev.productId) {
        viewsByProduct[ev.productId] = (viewsByProduct[ev.productId] || 0) + 1;
      }
      if (ev.sessionId) uniqueVisitorSessions.add(ev.sessionId);
    } else if (ev.eventType === 'add_to_cart') {
      totalCartAdditions++;
      if (ev.productId) {
        cartAddsByProduct[ev.productId] = (cartAddsByProduct[ev.productId] || 0) + 1;
      }
    } else if (ev.eventType === 'whatsapp_click') {
      totalWhatsappClicks++;
    }
  });

  const uniqueVisitors = uniqueVisitorSessions.size || totalVisits;

  // 2. Orders & Sales Breakdown
  let totalOrdersCount = 0;
  let totalRevenue = 0;
  const salesByProduct: Record<number, { units: number; revenue: number; name?: string }> = {};
  const ordersByDayOfWeek: Record<number, { count: number; revenue: number }> = {
    0: { count: 0, revenue: 0 }, // Domingo
    1: { count: 0, revenue: 0 }, // Lunes
    2: { count: 0, revenue: 0 }, // Martes
    3: { count: 0, revenue: 0 }, // Miércoles
    4: { count: 0, revenue: 0 }, // Jueves
    5: { count: 0, revenue: 0 }, // Viernes
    6: { count: 0, revenue: 0 }, // Sábado
  };
  const ordersByHour: Record<number, { count: number; revenue: number }> = {};
  for (let h = 0; h < 24; h++) {
    ordersByHour[h] = { count: 0, revenue: 0 };
  }

  // Daily aggregate map for timeline
  const dailyTimelineMap: Record<string, {
    date: string;
    label: string;
    visits: number;
    productViews: number;
    cartAdds: number;
    orders: number;
    revenue: number;
  }> = {};

  // Initialize timeline slots based on period
  const daySpan = period === 'today' ? 1 : period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 30;
  const now = new Date();
  for (let i = daySpan - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' });
    dailyTimelineMap[dateStr] = {
      date: dateStr,
      label: dayName,
      visits: 0,
      productViews: 0,
      cartAdds: 0,
      orders: 0,
      revenue: 0,
    };
  }

  // Populate events into daily timeline
  rawEvents.forEach((ev) => {
    const dateStr = new Date(ev.createdAt).toISOString().split('T')[0];
    if (!dailyTimelineMap[dateStr]) {
      const d = new Date(ev.createdAt);
      dailyTimelineMap[dateStr] = {
        date: dateStr,
        label: d.toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' }),
        visits: 0,
        productViews: 0,
        cartAdds: 0,
        orders: 0,
        revenue: 0,
      };
    }
    if (ev.eventType === 'store_visit') dailyTimelineMap[dateStr].visits++;
    if (ev.eventType === 'product_view') dailyTimelineMap[dateStr].productViews++;
    if (ev.eventType === 'add_to_cart') dailyTimelineMap[dateStr].cartAdds++;
  });

  // Process orders
  rawOrders.forEach((order) => {
    // Ignore cancelled orders for revenue
    const isCancelled = order.status === 'cancelled';
    const ordDate = new Date(order.createdAt);
    const dateStr = ordDate.toISOString().split('T')[0];
    const amount = parseFloat(order.totalAmount || '0') || 0;
    const dayOfWeek = ordDate.getDay();
    const hour = ordDate.getHours();

    // Parse items
    let items: any[] = [];
    try {
      items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items || [];
    } catch {}

    // Check if matching target product filter
    let orderMatchesTarget = !targetProductId;
    let orderTargetRevenue = 0;
    let orderTargetUnits = 0;

    items.forEach((it: any) => {
      const pId = Number(it.productId || it.id);
      const qty = Number(it.quantity || 1) || 1;
      const unitPrice = parseFloat(it.salePrice || it.price || '0') || 0;
      const itemSubtotal = qty * unitPrice;

      if (!salesByProduct[pId]) {
        salesByProduct[pId] = { units: 0, revenue: 0, name: it.name || it.productName };
      }
      if (!isCancelled) {
        salesByProduct[pId].units += qty;
        salesByProduct[pId].revenue += itemSubtotal;
      }

      if (targetProductId && pId === targetProductId) {
        orderMatchesTarget = true;
        orderTargetRevenue += itemSubtotal;
        orderTargetUnits += qty;
      }
    });

    if (orderMatchesTarget) {
      totalOrdersCount++;
      const effectiveAmount = targetProductId ? orderTargetRevenue : amount;

      if (!isCancelled) {
        totalRevenue += effectiveAmount;
      }

      if (ordersByDayOfWeek[dayOfWeek]) {
        ordersByDayOfWeek[dayOfWeek].count++;
        if (!isCancelled) ordersByDayOfWeek[dayOfWeek].revenue += effectiveAmount;
      }

      if (ordersByHour[hour]) {
        ordersByHour[hour].count++;
        if (!isCancelled) ordersByHour[hour].revenue += effectiveAmount;
      }

      if (dailyTimelineMap[dateStr]) {
        dailyTimelineMap[dateStr].orders++;
        if (!isCancelled) dailyTimelineMap[dateStr].revenue += effectiveAmount;
      } else {
        dailyTimelineMap[dateStr] = {
          date: dateStr,
          label: ordDate.toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' }),
          visits: 0,
          productViews: 0,
          cartAdds: 0,
          orders: 1,
          revenue: !isCancelled ? effectiveAmount : 0,
        };
      }
    }
  });

  // Timeline array sorted by date
  const timeline = Object.values(dailyTimelineMap).sort((a, b) => a.date.localeCompare(b.date));

  // 3. Product Catalog Enrichment & Ranking
  const itemsMap = new Map<number, any>();
  rawItems.forEach((it) => itemsMap.set(it.id, it));

  // Table of all products with complete analytics metrics
  const productPerformance = rawItems.map((item) => {
    const views = viewsByProduct[item.id] || 0;
    const cartAdds = cartAddsByProduct[item.id] || 0;
    const sales = salesByProduct[item.id] || { units: 0, revenue: 0 };
    const price = parseFloat(item.salePrice || '0') || 0;
    const conversion = views > 0 ? (sales.units / views) * 100 : 0;
    const cartConversion = cartAdds > 0 ? (sales.units / cartAdds) * 100 : 0;

    let parsedImages: string[] = [];
    if (item.extractedAttributes) {
      try {
        const parsed = JSON.parse(item.extractedAttributes);
        if (Array.isArray(parsed.images)) parsedImages = parsed.images;
      } catch {}
    }
    const displayImage = item.imageUrl || parsedImages[0] || null;

    return {
      id: item.id,
      name: item.name,
      sku: item.sku,
      category: item.category || 'General',
      salePrice: price,
      stock: item.stock || 0,
      imageUrl: displayImage,
      videoUrl: item.videoUrl || null,
      views,
      cartAdds,
      unitsSold: sales.units,
      revenue: sales.revenue,
      conversionRate: Math.min(100, parseFloat(conversion.toFixed(1))),
      cartConversionRate: Math.min(100, parseFloat(cartConversion.toFixed(1))),
    };
  });

  // Top 10 Most Viewed Products
  const topViewedProducts = [...productPerformance]
    .filter((p) => p.views > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  // Top 10 Best Selling Products (by revenue & units)
  const topPurchasedProducts = [...productPerformance]
    .filter((p) => p.unitsSold > 0 || p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue || b.unitsSold - a.unitsSold)
    .slice(0, 10);

  // Star Product (Most Sold)
  const starProduct = topPurchasedProducts[0] || null;
  // Most Viewed Product
  const mostViewedProduct = topViewedProducts[0] || null;

  // Conversion rates
  const globalConversionRate = totalVisits > 0 ? Math.min(100, (totalOrdersCount / totalVisits) * 100) : 0;
  const viewToCartRate = totalProductViews > 0 ? Math.min(100, (totalCartAdditions / totalProductViews) * 100) : 0;
  const cartToWhatsappRate = totalCartAdditions > 0 ? Math.min(100, (totalWhatsappClicks / totalCartAdditions) * 100) : 0;

  // Days of Week formatted for charts
  const dayNamesEs = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const dayOfWeekDistribution = [1, 2, 3, 4, 5, 6, 0].map((dayIdx) => ({
    dayIndex: dayIdx,
    dayName: dayNamesEs[dayIdx],
    orders: ordersByDayOfWeek[dayIdx]?.count || 0,
    revenue: parseFloat((ordersByDayOfWeek[dayIdx]?.revenue || 0).toFixed(2)),
  }));

  // Find peak selling day
  const peakDay = [...dayOfWeekDistribution].sort((a, b) => b.orders - a.orders || b.revenue - a.revenue)[0];

  // Hourly distribution for charts
  const hourlyDistribution = Array.from({ length: 24 }, (_, h) => ({
    hour: `${h.toString().padStart(2, '0')}:00`,
    hourNumber: h,
    orders: ordersByHour[h]?.count || 0,
    revenue: parseFloat((ordersByHour[h]?.revenue || 0).toFixed(2)),
  }));

  // Peak selling hour
  const peakHour = [...hourlyDistribution].sort((a, b) => b.orders - a.orders)[0];

  return {
    period,
    targetProductId,
    summary: {
      totalVisits,
      uniqueVisitors,
      totalProductViews,
      totalCartAdditions,
      totalWhatsappClicks,
      totalOrdersCount,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      conversionRate: parseFloat(globalConversionRate.toFixed(1)),
      viewToCartRate: parseFloat(viewToCartRate.toFixed(1)),
      cartToWhatsappRate: parseFloat(cartToWhatsappRate.toFixed(1)),
      peakDayName: peakDay && peakDay.orders > 0 ? peakDay.dayName : 'Sin ventas aún',
      peakHourTime: peakHour && peakHour.orders > 0 ? peakHour.hour : 'Sin ventas aún',
      starProduct: starProduct ? {
        id: starProduct.id,
        name: starProduct.name,
        unitsSold: starProduct.unitsSold,
        revenue: starProduct.revenue,
        imageUrl: starProduct.imageUrl,
        salePrice: starProduct.salePrice,
      } : null,
      mostViewedProduct: mostViewedProduct ? {
        id: mostViewedProduct.id,
        name: mostViewedProduct.name,
        views: mostViewedProduct.views,
        imageUrl: mostViewedProduct.imageUrl,
        salePrice: mostViewedProduct.salePrice,
      } : null,
    },
    funnel: [
      { step: 'Visitas a la Tienda', count: totalVisits, percent: 100 },
      { step: 'Visualizaciones de Productos', count: totalProductViews, percent: totalVisits > 0 ? Math.min(100, Math.round((totalProductViews / totalVisits) * 100)) : 0 },
      { step: 'Añadidos al Carrito', count: totalCartAdditions, percent: totalProductViews > 0 ? Math.min(100, Math.round((totalCartAdditions / totalProductViews) * 100)) : 0 },
      { step: 'Consultas / Clic WhatsApp', count: totalWhatsappClicks, percent: totalCartAdditions > 0 ? Math.min(100, Math.round((totalWhatsappClicks / totalCartAdditions) * 100)) : 0 },
      { step: 'Pedidos Registrados', count: totalOrdersCount, percent: totalVisits > 0 ? Math.min(100, Math.round((totalOrdersCount / totalVisits) * 100)) : 0 },
    ],
    timeline,
    topViewedProducts,
    topPurchasedProducts,
    dayOfWeekDistribution,
    hourlyDistribution,
    deviceBreakdown: [
      { name: 'Móvil / Celular', value: deviceCounts.mobile || 0 },
      { name: 'Computadora / Escritorio', value: deviceCounts.desktop || 0 },
      { name: 'Tablet', value: deviceCounts.tablet || 0 },
    ],
    productPerformance: productPerformance.sort((a, b) => b.views - a.views || b.unitsSold - a.unitsSold),
  };
}

/**
 * Resets all recorded analytics events
 */
export async function resetStoreAnalytics(userId?: number) {
  const targetUserId = userId || 1;
  if (!isPostgresConfigured()) {
    const state = storage.getState();
    state.storeAnalyticsEvents = [];
    storage.save();
    return { success: true, message: 'Estadísticas de tráfico y visualizaciones reiniciadas correctamente' };
  }

  try {
    if (userId && userId > 1) {
      await db.delete(storeAnalyticsEvents).where(eq(storeAnalyticsEvents.userId, targetUserId));
    } else {
      await db.delete(storeAnalyticsEvents);
    }
    const state = storage.getState();
    if (state.storeAnalyticsEvents) {
      state.storeAnalyticsEvents = [];
      storage.save();
    }
    return { success: true, message: 'Estadísticas de tráfico y visualizaciones reiniciadas correctamente en PostgreSQL' };
  } catch (err) {
    console.warn('Error resetting analytics in PostgreSQL, fallback to memory:', err);
    const state = storage.getState();
    state.storeAnalyticsEvents = [];
    storage.save();
    return { success: true, message: 'Estadísticas reiniciadas correctamente' };
  }
}

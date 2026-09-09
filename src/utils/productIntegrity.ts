import { CustomerOrder, InventoryItem } from '../types.ts';

export interface ProductTransactionLink {
  isLinked: boolean;
  canDelete: boolean;
  salesCount: number;
  purchasesCount: number;
  salesDetails: Array<{ id: number; orderNumber: string; customerName: string; status: string; quantity: number }>;
  purchasesDetails: Array<{ id: number; purchaseNumber: string; supplierName: string; status: string; quantity: number }>;
  reasonText?: string;
}

/**
 * Checks whether a given product is linked to any customer sale (order) or supplier purchase.
 * Under ERP accounting & financial rules, products linked to transactions cannot be deleted.
 */
export function checkProductTransactionLink(
  product: { id: number; sku?: string | null; name?: string },
  orders: CustomerOrder[] = [],
  purchases: any[] = []
): ProductTransactionLink {
  const targetId = Number(product.id);
  const targetSku = (product.sku || '').trim().toLowerCase();

  const salesDetails: Array<{ id: number; orderNumber: string; customerName: string; status: string; quantity: number }> = [];
  const purchasesDetails: Array<{ id: number; purchaseNumber: string; supplierName: string; status: string; quantity: number }> = [];

  // Helper to parse items safely
  const parseItems = (raw: any): any[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  // 1. Check Customer Orders (Ventas / Pedidos de Clientes)
  for (const ord of (orders || [])) {
    const rawItems = parseItems(ord.items);
    let matched = false;
    let qty = 0;

    for (const oi of rawItems) {
      if (!oi) continue;
      const oiId = oi.id || oi.inventoryItemId || oi.item?.id || oi.item?.inventoryItemId;
      const oiSku = (oi.sku || oi.item?.sku || '').trim().toLowerCase();

      const idMatch = oiId && Number(oiId) === targetId;
      const skuMatch = targetSku && oiSku && oiSku === targetSku;

      if (idMatch || skuMatch) {
        matched = true;
        qty += Number(oi.quantity || 1);
      }
    }

    if (matched) {
      salesDetails.push({
        id: ord.id,
        orderNumber: ord.orderNumber || `#${ord.id}`,
        customerName: ord.customerName || 'Cliente',
        status: ord.status || 'pending',
        quantity: qty,
      });
    }
  }

  // 2. Check Purchases (Compras a Proveedores / Abastecimiento)
  for (const p of (purchases || [])) {
    const rawItems = parseItems(p.items);
    let matched = false;
    let qty = 0;

    for (const pi of rawItems) {
      if (!pi) continue;
      const piId = pi.inventoryItemId || pi.id;
      const piSku = (pi.sku || '').trim().toLowerCase();

      const idMatch = piId && Number(piId) === targetId;
      const skuMatch = targetSku && piSku && piSku === targetSku;

      if (idMatch || skuMatch) {
        matched = true;
        qty += Number(pi.quantity || 1);
      }
    }

    if (matched) {
      purchasesDetails.push({
        id: p.id,
        purchaseNumber: p.purchaseNumber || `#${p.id}`,
        supplierName: p.supplierName || 'Proveedor',
        status: p.status || 'pending',
        quantity: qty,
      });
    }
  }

  const isLinked = salesDetails.length > 0 || purchasesDetails.length > 0;
  let reasonText: string | undefined = undefined;

  if (isLinked) {
    const parts: string[] = [];
    if (salesDetails.length > 0) parts.push(`${salesDetails.length} venta(s)`);
    if (purchasesDetails.length > 0) parts.push(`${purchasesDetails.length} compra(s)`);
    reasonText = `Vinculado a ${parts.join(' y ')}`;
  }

  return {
    isLinked,
    canDelete: !isLinked,
    salesCount: salesDetails.length,
    purchasesCount: purchasesDetails.length,
    salesDetails,
    purchasesDetails,
    reasonText,
  };
}

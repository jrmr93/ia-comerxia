/**
 * Utility functions for Order processing, customer identification (C.I. / Cédula),
 * and address normalization.
 */

/**
 * Extracts or retrieves the customer's identification (Cédula de Identidad, RUC, DNI, Passport)
 * from direct properties (customerCi, ci, idCard) or extracts it from the address/notes text.
 */
export function getCustomerCi(order: any): string {
  if (!order) return '';

  // 1. Direct field checks
  if (typeof order.customerCi === 'string' && order.customerCi.trim()) {
    return order.customerCi.trim();
  }
  if (typeof order.ci === 'string' && order.ci.trim()) {
    return order.ci.trim();
  }
  if (typeof order.idCard === 'string' && order.idCard.trim()) {
    return order.idCard.trim();
  }

  // Regla estricta Tienda Online: Todos los pedidos que ingresen por la tienda online
  // el campo cédula debe estar en blanco hasta su posterior ingreso por parte del vendedor.
  // No se debe inferir de la dirección o notas si el vendedor no la ha registrado explícitamente.
  if (isOnlineStoreOrder(order)) {
    return '';
  }

  // 2. Check within customerAddress
  const address = order.customerAddress || '';
  if (typeof address === 'string' && address.trim()) {
    // Regex for: CI: 0912345678, Cédula: 0912345678, C.I.: 0912345678, Identificación: ..., RUC: ..., DNI: ...
    const ciMatch = address.match(/(?:C\.?I\.?|C[eé]dula(?:\s+de\s+identidad)?|Identificaci[oó]n|RUC|DNI)[\s:]*([0-9A-Za-z-]{5,20})/i);
    if (ciMatch && ciMatch[1]) {
      return ciMatch[1].trim();
    }
  }

  // 3. Check within order notes
  const notes = order.notes || '';
  if (typeof notes === 'string' && notes.trim()) {
    const ciMatch = notes.match(/(?:C\.?I\.?|C[eé]dula(?:\s+de\s+identidad)?|Identificaci[oó]n|RUC|DNI)[\s:]*([0-9A-Za-z-]{5,20})/i);
    if (ciMatch && ciMatch[1]) {
      return ciMatch[1].trim();
    }
  }

  return '';
}

/**
 * Strips C.I., Cédula, RUC, DNI or identification segments from an address string.
 * This guarantees the delivery address field never displays or duplicates the customer's ID card.
 */
export function stripCiFromAddress(rawAddress: string | null | undefined): string {
  if (!rawAddress) return '';
  let cleaned = String(rawAddress)
    // Remove parenthesized or bracketed C.I., e.g. (C.I: 1234567890), (Cédula: 1234567890)
    .replace(/\(\s*(?:C\.?I\.?|C[eé]dula(?:\s+de\s+identidad)?|Identificaci[oó]n|RUC|DNI)[\s:]*[0-9A-Za-z-]{5,20}\s*\)/gi, '')
    .replace(/\[\s*(?:C\.?I\.?|C[eé]dula(?:\s+de\s+identidad)?|Identificaci[oó]n|RUC|DNI)[\s:]*[0-9A-Za-z-]{5,20}\s*\]/gi, '')
    // Remove C.I: 1234567890, Cédula: 1234567890, etc. with surrounding pipes, dashes or spaces
    .replace(/(?:^|[|\n,;\-–—])\s*(?:C\.?I\.?|C[eé]dula(?:\s+de\s+identidad)?|Identificaci[oó]n|RUC|DNI)[\s:]*[0-9A-Za-z-]{5,20}/gi, '')
    // Also remove standalone "C.I: [number]" pattern anywhere
    .replace(/(?:C\.?I\.?|C[eé]dula(?:\s+de\s+identidad)?|Identificaci[oó]n|RUC|DNI)[\s:]*[0-9A-Za-z-]{5,20}/gi, '')
    // Clean up empty pipe artifacts " | | " -> " | "
    .replace(/\s*\|\s*\|\s*/g, ' | ')
    .replace(/\s*,\s*,\s*/g, ', ')
    .replace(/\s*-\s*-\s*/g, ' - ')
    // Strip leading/trailing delimiters
    .replace(/^[|\s,;\-–—]+|[|\s,;\-–—]+$/g, '')
    .trim();

  return cleaned;
}

/**
 * Returns a display-ready clean address, stripping any duplicate C.I. tags.
 */
export function getCleanAddress(rawAddress: string | null | undefined): string {
  const cleaned = stripCiFromAddress(rawAddress);
  if (!cleaned) return 'No especificada';
  return cleaned;
}

/**
 * Determines whether a sale/order has been partially delivered.
 * In ERP workflows, an order that is partially delivered has units that already left
 * the warehouse to the customer and cannot be cancelled or deleted.
 */
export function isOrderPartiallyDelivered(order: any): boolean {
  if (!order) return false;

  const fs = String(order.fulfillmentStatus || '').toLowerCase().trim();
  if (fs === 'partial_delivered' || fs === 'partial_ready') {
    return true;
  }

  const rawItems = Array.isArray(order.items)
    ? order.items
    : typeof order.items === 'string'
    ? (() => {
        try {
          return JSON.parse(order.items);
        } catch {
          return [];
        }
      })()
    : [];

  if (rawItems.length > 0) {
    const totalDelivered = rawItems.reduce(
      (acc: number, it: any) => acc + (Number(it.deliveredQuantity) || 0),
      0
    );
    const totalOrdered = rawItems.reduce(
      (acc: number, it: any) => acc + (Number(it.quantity) || 1),
      0
    );

    // If units were partially delivered (at least 1 delivered, but some pending)
    if (totalDelivered > 0 && totalDelivered < totalOrdered) {
      return true;
    }

    // Also check if any item in the order has partial delivery recorded
    if (
      rawItems.some(
        (it: any) =>
          (Number(it.deliveredQuantity) || 0) > 0 &&
          (Number(it.pendingQuantity) !== undefined
            ? Number(it.pendingQuantity) > 0
            : (Number(it.deliveredQuantity) || 0) < (Number(it.quantity) || 1))
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether an order is confirmed (status is confirmed, shipped, or delivered).
 */
export function isOrderConfirmed(order: any): boolean {
  if (!order) return false;
  const status = String(order.status || '').toLowerCase().trim();
  return status === 'confirmed' || status === 'shipped' || status === 'delivered';
}

/**
 * Checks whether an order is locked from being cancelled or deleted under ERP data integrity rules:
 * "una venta no puede cancelarse ni borrarse cuando este confirmada y/o se encuntra entregada parcialmente"
 */
export function isOrderLockedFromCancellationOrDeletion(order: any): boolean {
  if (!order) return false;
  return isOrderConfirmed(order) || isOrderPartiallyDelivered(order);
}

/**
 * Returns user-friendly explanation why an order cannot be cancelled.
 */
export function getOrderCancellationBlockReason(order: any): string | null {
  if (!order) return null;
  const isConfirmed = isOrderConfirmed(order);
  const isPartial = isOrderPartiallyDelivered(order);
  if (isConfirmed && isPartial) {
    return 'Una venta no puede cancelarse cuando está confirmada y/o se encuentra entregada parcialmente.';
  }
  if (isConfirmed) {
    return 'Una venta no puede cancelarse cuando está confirmada.';
  }
  if (isPartial) {
    return 'Una venta no puede cancelarse cuando se encuentra entregada parcialmente (ya salieron unidades de bodega).';
  }
  if (order.status === 'delivered') {
    return 'Un pedido entregado y cerrado no puede cancelarse.';
  }
  return null;
}

/**
 * Returns user-friendly explanation why an order cannot be deleted.
 */
export function getOrderDeletionBlockReason(order: any): string | null {
  if (!order) return null;
  const isConfirmed = isOrderConfirmed(order);
  const isPartial = isOrderPartiallyDelivered(order);
  if (isConfirmed && isPartial) {
    return 'Una venta no puede borrarse cuando está confirmada y/o se encuentra entregada parcialmente.';
  }
  if (order.status === 'delivered') {
    return 'Los pedidos entregados y cerrados no se pueden eliminar para preservar el balance contable y de inventario.';
  }
  if (isConfirmed) {
    return 'Una venta no puede borrarse cuando está confirmada.';
  }
  if (isPartial) {
    return 'Una venta no puede borrarse cuando se encuentra entregada parcialmente (ya salieron unidades de bodega).';
  }
  return null;
}

/**
 * Checks whether an order is locked from being edited under ERP data integrity rules:
 * "tampoco se puede editar el pedido si esq ya fue confirmado"
 */
export function isOrderLockedFromEditing(order: any): boolean {
  if (!order) return false;
  const status = String(order.status || '').toLowerCase().trim();
  return (
    status === 'confirmed' ||
    status === 'shipped' ||
    status === 'delivered' ||
    status === 'cancelled' ||
    isOrderPartiallyDelivered(order)
  );
}

/**
 * Returns user-friendly explanation why an order cannot be edited.
 */
export function getOrderEditBlockReason(order: any): string | null {
  if (!order) return null;
  const status = String(order.status || '').toLowerCase().trim();
  if (status === 'confirmed') {
    return 'No se puede editar el pedido porque ya fue confirmado. Las ventas confirmadas son inmutables para proteger el inventario y balances contables.';
  }
  if (status === 'shipped') {
    return 'No se puede editar el pedido porque ya fue despachado a entrega.';
  }
  if (status === 'delivered') {
    return 'No se puede editar el pedido porque ya fue entregado y cerrado.';
  }
  if (status === 'cancelled') {
    return 'No se puede editar el pedido porque ya fue cancelado / anulado.';
  }
  if (isOrderPartiallyDelivered(order)) {
    return 'No se puede editar el pedido porque ya se encuentra entregado parcialmente.';
  }
  return null;
}

/**
 * Determines whether an order's delivery method is shipping (envío a domicilio / agencia).
 */
export function isShippingDeliveryOrder(order: any): boolean {
  if (!order) return false;
  const deliveryType = String(order.deliveryType || '').toLowerCase().trim();
  if (deliveryType === 'shipping') return true;
  if (deliveryType === 'pickup') return false;

  const address = String(order.customerAddress || '').toLowerCase().trim();
  if (
    address.includes('retiro en local') ||
    address.includes('retiro') ||
    address.includes('retira') ||
    address.includes('en tienda') ||
    address.startsWith('retiro')
  ) {
    return false;
  }
  return true;
}

/**
 * Determines whether an order is for in-store pickup (retiro en local).
 */
export function isPickupDeliveryOrder(order: any): boolean {
  return !isShippingDeliveryOrder(order);
}

/**
 * Validates whether a shipping guide can be generated for an order:
 * "cuando el pedido es unicamente por envio debe comprobar que haya existencias en stock del producto
 * o que si se creo una compra al proveedor debe esperar que el estado de esa compra este entregado para poder generar recien la guia de envio"
 */
export function canGenerateShippingGuide(
  order: any,
  inventoryItems: any[] = [],
  purchases: any[] = []
): {
  canGenerate: boolean;
  reason: string | null;
  linkedPurchase?: any;
  missingStockItems?: Array<{ name: string; required: number; available: number }>;
} {
  if (!order) return { canGenerate: false, reason: 'Pedido no encontrado' };

  // Si el pedido ya está en estado 'shipped' o 'delivered', la guía ya fue generada previamente
  if (order.status === 'shipped' || order.status === 'delivered') {
    return { canGenerate: true, reason: null };
  }

  // Comprobar si el pedido tiene órdenes de compra a proveedores vinculadas
  const linkedPurchases = purchases?.filter((p: any) =>
    ((order.linkedPurchaseId && p.id === order.linkedPurchaseId) ||
      p.linkedCustomerOrderId === order.id ||
      (order.linkedPurchaseNumber && String(order.linkedPurchaseNumber).includes(p.purchaseNumber))) &&
    p.status !== 'cancelled'
  ) || [];

  // Regla 1: Si se crearon compras a proveedores, DEBE esperar que el estado de todas esté recibido/entregado
  if (linkedPurchases.length > 0) {
    const unreceivedPurchases = linkedPurchases.filter((p: any) => p.status !== 'received');
    if (unreceivedPurchases.length > 0) {
      const pendingListStr = unreceivedPurchases
        .map((lp: any) => {
          const purchaseStatusLabel =
            lp.status === 'pending'
              ? 'Pendiente'
              : lp.status === 'ordered'
              ? 'Enviada / En Espera de Proveedor'
              : lp.status === 'in_transit'
              ? 'En Tránsito'
              : lp.status === 'partially_received'
              ? 'Recibida Parcialmente'
              : lp.status;
          return `#${lp.purchaseNumber || lp.id} (${lp.supplierName || 'Proveedor'}: ${purchaseStatusLabel})`;
        })
        .join(', ');

      return {
        canGenerate: false,
        reason: `Este pedido tiene compras a proveedores pendientes de recepción: ${pendingListStr}. Debes esperar a que todas las compras de los proveedores estén en estado ENTREGADO / RECIBIDO en Compras para poder despachar y generar la guía de envío.`,
        linkedPurchase: unreceivedPurchases[0],
      };
    }

    // Todas las compras a proveedores ya fueron entregadas y recibidas en bodega
    return { canGenerate: true, reason: null, linkedPurchase: linkedPurchases[0] };
  }

  // Regla 2: Si NO se creó compra al proveedor, DEBE comprobar que haya existencias en stock del producto
  const rawItems = Array.isArray(order.items)
    ? order.items
    : typeof order.items === 'string'
    ? (() => {
        try {
          return JSON.parse(order.items);
        } catch {
          return [];
        }
      })()
    : [];

  const missingStockItems: Array<{ name: string; required: number; available: number }> = [];

  for (const it of rawItems) {
    const qtyOrdered = Number(it.quantity) || 1;
    const delivered = Number(it.deliveredQuantity) || 0;
    const needed = Math.max(0, qtyOrdered - delivered);

    if (needed <= 0) continue;

    // Buscar el producto en inventario
    const inv = inventoryItems.find((invItem: any) => {
      if (it.inventoryItemId && invItem.id === it.inventoryItemId) return true;
      if (it.id && invItem.id === it.id) return true;
      if (it.sku && invItem.sku && String(invItem.sku).toLowerCase() === String(it.sku).toLowerCase()) return true;
      return false;
    });

    const deducted = Number(it.stockDeducted) || 0;
    const currentStock = inv?.stock !== undefined ? Number(inv.stock) : (Number(it.stockAvailable) || 0);
    // Unidades disponibles en total (las ya descontadas/reservadas para este pedido + las que quedan en bodega)
    const effectiveStock = deducted > 0 ? deducted + Math.max(0, currentStock) : currentStock;

    // Si tiene déficit registrado al momento de la venta y el stock en bodega no lo cubre
    const deficit = Number(it.deficitQuantity) || 0;
    if (deficit > 0 && currentStock < deficit) {
      missingStockItems.push({
        name: it.name || it.sku || 'Producto',
        required: needed,
        available: Math.max(0, currentStock),
      });
    } else if (effectiveStock < needed) {
      missingStockItems.push({
        name: it.name || it.sku || 'Producto',
        required: needed,
        available: Math.max(0, currentStock),
      });
    }
  }

  if (missingStockItems.length > 0) {
    const missingDetails = missingStockItems
      .map((m) => `${m.name} (Necesario: ${m.required}, En Stock: ${m.available})`)
      .join(', ');

    return {
      canGenerate: false,
      reason: `No hay suficientes existencias en stock para este pedido (${missingDetails}). Debes reponer existencias en inventario o generar la compra al proveedor y esperar su entrega para poder generar la guía de envío.`,
      missingStockItems,
    };
  }

  return { canGenerate: true, reason: null };
}

/**
 * Checks whether an order is currently waiting for products to enter the warehouse (bodega)
 * from a supplier purchase order before it can be delivered or dispatched:
 * "esperar que los productos entren a bodega por parte del pedido a proveedor para ser entregados,
 * en caso que sea con envio del mismo modo se debe esperar que entren los productos para que se puedan enviar"
 */
export function isOrderWaitingForWarehouseProducts(
  order: any,
  inventoryItems: any[] = [],
  purchases: any[] = []
): {
  isWaiting: boolean;
  reason: string | null;
  linkedPurchases: any[];
} {
  if (!order) return { isWaiting: false, reason: null, linkedPurchases: [] };

  const status = String(order.status || '').toLowerCase().trim();
  // Si ya está enviado o entregado, los productos ya salieron o fueron entregados
  if (status === 'shipped' || status === 'delivered') {
    return { isWaiting: false, reason: null, linkedPurchases: [] };
  }

  // 1. Comprobar órdenes de compra a proveedores vinculadas
  const linkedPurchases = (purchases || []).filter(
    (p: any) =>
      p.status !== 'cancelled' &&
      ((order.linkedPurchaseId && p.id === order.linkedPurchaseId) ||
        p.linkedCustomerOrderId === order.id ||
        (order.linkedPurchaseNumber && String(order.linkedPurchaseNumber).includes(p.purchaseNumber)) ||
        (p.linkedCustomerOrderNumber && String(p.linkedCustomerOrderNumber).trim() === String(order.orderNumber).trim()) ||
        (Array.isArray(p.items) &&
          p.items.some(
            (it: any) =>
              it.customerOrderId === order.id ||
              (it.orderNumber && String(it.orderNumber).trim() === String(order.orderNumber).trim())
          )))
  );

  if (linkedPurchases.length > 0) {
    const unreceived = linkedPurchases.filter((p: any) => p.status !== 'received');
    if (unreceived.length > 0) {
      return {
        isWaiting: true,
        reason: `Esperando recepción de orden(es) de compra a proveedor #${unreceived.map((p: any) => p.purchaseNumber || p.id).join(', ')} en Compras.`,
        linkedPurchases: unreceived,
      };
    }
  }

  // 2. Comprobar fulfillmentStatus
  const fStatus = String(order.fulfillmentStatus || '').toLowerCase().trim();
  if (
    fStatus === 'supplier_pending' ||
    fStatus === 'supplier_ordered' ||
    fStatus === 'awaiting_procurement'
  ) {
    return {
      isWaiting: true,
      reason: 'Esperando recepción de mercadería de proveedor en bodega.',
      linkedPurchases,
    };
  }

  // 3. Comprobar déficit en inventario si se proporcionó la lista de inventario
  if (inventoryItems && inventoryItems.length > 0) {
    const guideVal = canGenerateShippingGuide(order, inventoryItems, purchases);
    if (!guideVal.canGenerate) {
      return {
        isWaiting: true,
        reason: guideVal.reason || 'Esperando ingreso de existencias a bodega.',
        linkedPurchases,
      };
    }
  }

  return { isWaiting: false, reason: null, linkedPurchases };
}

/**
 * Validates whether an order can be marked as shipped:
 * Comprueba que el pedido esté en estado 'confirmed' (confirmado) para poder ser enviado.
 */
export function canOrderBeMarkedAsShipped(order: any): { canShip: boolean; reason: string | null } {
  if (!order) return { canShip: false, reason: 'Pedido no encontrado' };

  // Si ya está enviado o entregado, ya superó la etapa de confirmación
  if (order.status === 'shipped' || order.status === 'delivered') {
    return { canShip: true, reason: null };
  }

  // Condición estricta: El pedido debe estar confirmado para poder enviarse
  if (order.status !== 'confirmed') {
    return {
      canShip: false,
      reason: 'El pedido debe estar confirmado para poder ser marcado como enviado.',
    };
  }

  return { canShip: true, reason: null };
}

/**
 * Validates whether an order can be marked as delivered ('delivered'):
 * - Para pedidos con Retiro en Local: Debe estar confirmado ('confirmed') para entregarse en el local.
 * - Para pedidos con Envío a Domicilio: Debe cumplir el ciclo de vida estricto y estar en estado 'shipped' (Enviado).
 *   El botón de entregar y el registro de entrega solo deben permitirse cuando el pedido esté en estado 'shipped'.
 */
export function canOrderBeDelivered(order: any): { canDeliver: boolean; reason: string | null } {
  if (!order) return { canDeliver: false, reason: 'Pedido no encontrado' };

  if (order.status === 'delivered') {
    return { canDeliver: true, reason: null };
  }

  const isPickup = isPickupDeliveryOrder(order);

  if (isPickup) {
    if (order.status !== 'confirmed') {
      return {
        canDeliver: false,
        reason: 'El pedido con retiro en local debe estar confirmado antes de poder ser entregado.',
      };
    }
    return { canDeliver: true, reason: null };
  }

  // Pedidos con Envío: Solo pueden entregarse cuando están en estado 'shipped' (Enviado)
  if (order.status !== 'shipped') {
    return {
      canDeliver: false,
      reason: 'Para pedidos con envío, el botón de entregar solo aparece cuando el pedido está en estado ENVIADO (con su guía de despacho generada).',
    };
  }

  return { canDeliver: true, reason: null };
}

/**
 * Checks if a given string contains structured shipping tags or delimiters
 * (e.g., "Provincia: ...", "Prov: ...", "Cantón: ...", "Parr: ...", "Dir: ...", "Ref: ...", or "Retiro en local").
 * This is used to prevent shipping strings from contaminating or overwriting the customer's fiscal/residential address.
 */
export function isConcatenatedShippingAddress(addr?: string | null): boolean {
  if (!addr || typeof addr !== 'string') return false;
  const clean = addr.trim();
  if (!clean) return false;

  const hasTag = /(?:provincia|prov\.|prov|cant[oó]n|ciudad|can\.|can|parroquia|parr\.|parr|par\.|par|direcci[oó]n|direccion|calles|calle|dir\.|dir|referencia|ref\.|ref)[\s:]+/i.test(clean);
  const hasPipes = clean.includes('|') && (
    /prov/i.test(clean) || /cant/i.test(clean) || /parr/i.test(clean) || /dir/i.test(clean) || /ciudad/i.test(clean)
  );
  const isPickup = clean.toLowerCase().startsWith('retiro en local');

  return hasTag || hasPipes || isPickup;
}

/**
 * Parses structured shipping metadata from a shipping string.
 */
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

  if (exactAddress) {
    exactAddress = exactAddress.replace(/^(dirección|direccion|calles|calle|dir\.|dir):/i, '').trim();
  }

  return { province, canton, parish, exactAddress, reference, ci };
}

/**
 * Resolves the financial entity, bank, or cash account in Treasury (Caja y Bancos)
 * associated with an order's payment method, notes, or voucher details.
 */
export function deriveBankOrAccountFromMethod(
  rawMethod?: string | null,
  rawNotes?: string | null
): string {
  const method = String(rawMethod || '').trim();
  const notes = String(rawNotes || '').trim();
  const combined = `${method} ${notes}`.toLowerCase();

  // 1. Direct bank or wallet matches
  if (combined.includes('guayaquil') || combined.includes('barrio') || combined.includes('del barrio')) {
    return 'Banco Guayaquil';
  }
  if (combined.includes('pichincha') || combined.includes('vecino') || combined.includes('mi vecino')) {
    return 'Banco Pichincha';
  }
  if (combined.includes('deuna')) {
    return 'Deuna!';
  }
  if (combined.includes('produbanco') || combined.includes('promerica')) {
    return 'Produbanco';
  }
  if (combined.includes('bolivariano') || combined.includes('punto bb')) {
    return 'Banco Bolivariano';
  }
  if (combined.includes('pacifico') || combined.includes('pacífico')) {
    return 'Banco del Pacífico';
  }
  if (combined.includes('internacional')) {
    return 'Banco Internacional';
  }
  if (combined.includes('austro')) {
    return 'Banco del Austro';
  }
  if (combined.includes('solidario')) {
    return 'Banco Solidario';
  }
  if (combined.includes('machala')) {
    return 'Banco Machala';
  }
  if (combined.includes('rumiñahui') || combined.includes('ruminahui') || combined.includes('bgr')) {
    return 'Banco General Rumiñahui';
  }
  if (combined.includes('jep')) {
    return 'Cooperativa JEP';
  }
  if (combined.includes('policía nacional') || combined.includes('policia nacional') || combined.includes('cpn')) {
    return 'Cooperativa Policía Nacional';
  }
  if (combined.includes('alianza del valle') || combined.includes('alianza')) {
    return 'Cooperativa Alianza del Valle';
  }
  if (combined.includes('29 de octubre')) {
    return 'Cooperativa 29 de Octubre';
  }
  if (combined.includes('chibuleo')) {
    return 'Cooperativa Chibuleo';
  }
  if (combined.includes('mushuc runa')) {
    return 'Cooperativa Mushuc Runa';
  }
  if (combined.includes('zelle')) {
    return 'Zelle (USD)';
  }
  if (
    combined.includes('tarjeta') ||
    combined.includes('visa') ||
    combined.includes('mastercard') ||
    combined.includes('datafast') ||
    combined.includes('payphone') ||
    combined.includes('kushki') ||
    combined.includes('pluxee')
  ) {
    return 'Tarjeta / Pasarela';
  }
  if (
    combined.includes('efectivo') ||
    combined.includes('contraentrega') ||
    combined.includes('contra entrega') ||
    combined.includes('cash')
  ) {
    return 'Caja Principal (Efectivo)';
  }

  // 2. Custom bank or financial cooperative
  if (
    method.toLowerCase().startsWith('banco ') ||
    method.toLowerCase().startsWith('cooperativa ') ||
    method.toLowerCase().startsWith('coop. ') ||
    method.toLowerCase().startsWith('caja ')
  ) {
    const primaryName = method.split('/')[0].trim();
    if (primaryName) return primaryName;
  }

  // 3. Clean custom name if not generic keyword
  if (method && method.toLowerCase() !== 'whatsapp' && method.toLowerCase() !== 'transferencia_bancaria') {
    const clean = method.split('/')[0].trim();
    if (clean) return clean;
  }

  return 'Banco Pichincha';
}

/**
 * Determines if an order was created by a customer from the Online Store (Tienda Online).
 * Detects explicit flags, notes tags ([Tienda Online]), or origin markers.
 */
export function isOnlineStoreOrder(order: any): boolean {
  if (!order) return false;
  if (order.isOnlineStore === true || order.source === 'online_store') {
    return true;
  }
  const notes = (order.notes || '').toLowerCase();
  if (
    notes.includes('[tienda online]') ||
    notes.includes('tienda online') ||
    notes.includes('tienda_online') ||
    notes.includes('catálogo web') ||
    notes.includes('catalogo web') ||
    notes.includes('pedido web') ||
    notes.includes('pedido online')
  ) {
    return true;
  }
  return false;
}


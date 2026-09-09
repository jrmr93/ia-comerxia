import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Package,
  Plus,
  Search,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  DollarSign,
  Send,
  MessageCircle,
  Copy,
  Printer,
  Trash2,
  Edit3,
  ExternalLink,
  Receipt,
  X,
  FileText,
  ChevronDown,
  ChevronUp,
  Boxes,
  ArrowRight,
  Filter,
  BarChart3,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Loader2,
  Barcode,
  Layers,
  List,
  Hash,
  Lock,
  ShieldCheck,
  History,
  Calendar,
  Eye,
  CreditCard,
  Building2,
} from 'lucide-react';
import { PurchaseOrder, PurchaseItem, InventoryItem, CustomerOrder, FinancialReportSummary, Supplier, StoreConfig } from '../types.ts';
import { PurchasePartialReceptionModal } from './PurchasePartialReceptionModal.tsx';
import { PurchaseSupplierContactModal } from './PurchaseSupplierContactModal.tsx';
import { PurchaseRecordCard } from './PurchaseRecordCard.tsx';
import { directPrintOrder } from '../utils/directOrderPrint.ts';
import {
  extractPurchasePhotos,
  generatePurchasePhotosCollage,
  copyBlobToClipboard,
  groupPurchasePhotosBySupplier,
} from '../utils/purchasePhotosClipboard.ts';
import {
  formatExactCurrency,
  formatSmartCurrency,
  getMetricFontSizeClass,
} from '../utils/metricFormatters.ts';

interface PurchasesViewProps {
  purchases?: PurchaseOrder[];
  inventoryItems?: InventoryItem[];
  customerOrders?: CustomerOrder[];
  orders?: CustomerOrder[];
  suppliers?: Supplier[];
  storeConfig?: Partial<StoreConfig> | null;
  currency?: string;
  authFetch?: (url: string, init?: RequestInit) => Promise<Response>;
  onReceivePurchase?: (purchaseId: number) => Promise<void> | void;
  onRefreshPurchases?: () => Promise<void> | void;
  onCreatePurchase?: (data: any) => Promise<boolean>;
  onUpdatePurchase?: (id: number, data: any) => Promise<boolean>;
  onDeletePurchase?: (id: number) => Promise<boolean>;
  showToast?: (msg: string) => void;
  onGoToStoreOrders?: (orderNumber?: string) => void;
  onGoToInventory?: () => void;
  onOpenPayableForPurchase?: (purchase: { id: number; purchaseNumber?: string; supplierName?: string; totalCost?: number | string }) => void;
  onGoToPayments?: () => void;
  highlightPurchaseId?: number;
  filterOrderNumber?: string | null;
  onClearFilterOrderNumber?: () => void;
}

export const getPurchaseStatusStyles = (status?: string) => {
  switch (status) {
    case 'received':
      return {
        cardClass: 'bg-emerald-50/25 border-2 border-emerald-200/90 hover:border-emerald-300 border-l-[6px] border-l-emerald-500 ring-1 ring-emerald-100/70',
        numberPill: 'bg-emerald-100/90 border-emerald-300 text-emerald-950 ring-1 ring-emerald-300/40',
        statusDot: 'bg-emerald-500',
        badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold',
        label: '✅ Recibido en Bodega',
      };
    case 'partially_received':
      return {
        cardClass: 'bg-amber-50/35 border-2 border-amber-400/90 hover:border-amber-500 border-l-[6px] border-l-amber-500 ring-1 ring-amber-200/80',
        numberPill: 'bg-amber-100/90 border-amber-400 text-amber-950 ring-1 ring-amber-400/50',
        statusDot: 'bg-amber-500 animate-pulse',
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-black animate-pulse',
        label: '📦 Parcialmente Recibida',
      };
    case 'in_transit':
      return {
        cardClass: 'bg-purple-50/25 border-2 border-purple-200/90 hover:border-purple-300 border-l-[6px] border-l-purple-500 ring-1 ring-purple-100/70',
        numberPill: 'bg-purple-100/90 border-purple-300 text-purple-950 ring-1 ring-purple-300/40',
        statusDot: 'bg-purple-500',
        badgeClass: 'bg-purple-100 text-purple-900 border-purple-300 font-bold',
        label: '🚚 En Tránsito / Despachado',
      };
    case 'ordered':
      return {
        cardClass: 'bg-sky-50/25 border-2 border-sky-200/90 hover:border-sky-300 border-l-[6px] border-l-sky-500 ring-1 ring-sky-100/70',
        numberPill: 'bg-sky-100/90 border-sky-300 text-sky-950 ring-1 ring-sky-300/40',
        statusDot: 'bg-sky-500',
        badgeClass: 'bg-sky-100 text-sky-900 border-sky-300 font-bold',
        label: '🔵 Pedido a Proveedor',
      };
    case 'cancelled':
      return {
        cardClass: 'bg-rose-50/20 border-2 border-rose-200/80 hover:border-rose-300 border-l-[6px] border-l-rose-400 ring-1 ring-rose-100/50 opacity-90',
        numberPill: 'bg-rose-100/90 border-rose-200 text-rose-950 ring-1 ring-rose-200/40',
        statusDot: 'bg-rose-500',
        badgeClass: 'bg-rose-100 text-rose-900 border-rose-200 font-bold',
        label: '❌ Cancelado',
      };
    case 'pending':
    default:
      return {
        cardClass: 'bg-amber-50/20 border-2 border-amber-300/90 hover:border-amber-400 border-l-[6px] border-l-amber-500 ring-1 ring-amber-100/60',
        numberPill: 'bg-amber-100/80 border-amber-300 text-amber-950 ring-1 ring-amber-300/40',
        statusDot: 'bg-amber-500',
        badgeClass: 'bg-amber-100/90 text-amber-950 border-amber-300 font-bold',
        label: '⏳ Pendiente',
      };
  }
};

export const PurchasesView: React.FC<PurchasesViewProps> = ({
  purchases = [],
  inventoryItems = [],
  customerOrders,
  orders = [],
  suppliers = [],
  storeConfig,
  currency = 'USD',
  authFetch = window.fetch.bind(window),
  onReceivePurchase,
  onRefreshPurchases = async () => {},
  onCreatePurchase,
  onUpdatePurchase,
  onDeletePurchase,
  showToast = (_msg: string) => {},
  onGoToStoreOrders,
  onGoToInventory,
  onOpenPayableForPurchase,
  onGoToPayments,
  highlightPurchaseId,
  filterOrderNumber,
  onClearFilterOrderNumber,
}) => {
  const allCustomerOrders = customerOrders || orders || [];

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [groupByOrder, setGroupByOrder] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<number | null>(highlightPurchaseId || null);

  useEffect(() => {
    if (highlightPurchaseId) {
      setExpandedPurchaseId(highlightPurchaseId);
    }
  }, [highlightPurchaseId]);

  // Sincronizar filtro exclusivo cuando se presiona "Ver Compra" desde el módulo de Ventas
  useEffect(() => {
    if (filterOrderNumber && String(filterOrderNumber).trim() !== '') {
      const cleanFilter = String(filterOrderNumber).trim();
      setSearchQuery(cleanFilter);
      setStatusFilter('all');
      setSupplierFilter('all');
      setGroupByOrder(true);
    }
  }, [filterOrderNumber]);

  // Modals
  const [isNewPurchaseModalOpen, setIsNewPurchaseModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<PurchaseOrder | null>(null);
  const [isFinancialModalOpen, setIsFinancialModalOpen] = useState(false);
  const [financialPeriod, setFinancialPeriod] = useState<string>('month');
  const [financialSummary, setFinancialSummary] = useState<FinancialReportSummary | null>(null);
  const [loadingFinancial, setLoadingFinancial] = useState(false);

  // In-App Action Modals (Zero Dependency on blocked window.confirm)
  const [purchaseToConfirm, setPurchaseToConfirm] = useState<PurchaseOrder | null>(null);
  const [isConfirmingPurchase, setIsConfirmingPurchase] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState<PurchaseOrder | null>(null);
  const [isDeletingPurchase, setIsDeletingPurchase] = useState(false);
  const [purchaseToReceive, setPurchaseToReceive] = useState<PurchaseOrder | null>(null);
  const [isReceivingPurchase, setIsReceivingPurchase] = useState(false);
  const [purchaseForPartialReception, setPurchaseForPartialReception] = useState<PurchaseOrder | null>(null);

  // Supplier Contact & Photos Clipboard Modal State
  const [contactModalPurchase, setContactModalPurchase] = useState<PurchaseOrder | null>(null);
  const [contactModalInitialAction, setContactModalInitialAction] = useState<'whatsapp' | 'copy_photos' | null>(null);
  const [isCopyingPhotosForPurchaseId, setIsCopyingPhotosForPurchaseId] = useState<number | null>(null);

  const handleOpenWhatsappModal = (purchase: PurchaseOrder, action: 'whatsapp' | 'copy_photos' | null = null) => {
    setContactModalPurchase(purchase);
    setContactModalInitialAction(action);
  };

  const handleQuickCopyPhotos = async (purchase: PurchaseOrder) => {
    setIsCopyingPhotosForPurchaseId(purchase.id);
    try {
      const groups = groupPurchasePhotosBySupplier(purchase, inventoryItems, suppliers);
      if (groups.length === 0) {
        showToast('⚠️ Esta orden no tiene artículos con foto de portada disponible.');
        setContactModalPurchase(purchase);
        setContactModalInitialAction(null);
        return;
      }

      if (groups.length > 1) {
        showToast(`📦 Esta orden tiene ${groups.length} proveedores distintos. Selecciona el proveedor.`);
        setContactModalPurchase(purchase);
        setContactModalInitialAction(null);
        return;
      }

      const targetGroup = groups[0];
      if (!targetGroup.photoItems || targetGroup.photoItems.length === 0) {
        showToast('⚠️ Esta orden no tiene artículos con foto de portada disponible.');
        setContactModalPurchase(purchase);
        setContactModalInitialAction(null);
        return;
      }

      const { blob } = await generatePurchasePhotosCollage(purchase, targetGroup.photoItems, targetGroup.supplierName);
      await copyBlobToClipboard(blob);
      showToast(`✓ ¡Portadas de ${targetGroup.supplierName} copiadas! Ahora presiona Ctrl+V en WhatsApp.`);
      setContactModalPurchase(purchase);
      setContactModalInitialAction('copy_photos');
    } catch (err: any) {
      console.error('Error copying purchase photos:', err);
      showToast(err?.message || 'No se pudo copiar directo. Abriendo gestor de portadas...');
      setContactModalPurchase(purchase);
      setContactModalInitialAction('copy_photos');
    } finally {
      setIsCopyingPhotosForPurchaseId(null);
    }
  };

  const handleUpdatePurchaseContact = async (purchaseId: number, phone: string) => {
    if (onUpdatePurchase) {
      await onUpdatePurchase(purchaseId, { supplierContact: phone });
      await onRefreshPurchases();
    }
  };

  // Fetch Financial Summary
  const fetchFinancialSummary = async (period: string) => {
    setLoadingFinancial(true);
    try {
      const res = await authFetch(`/api/finances/summary?period=${period}`);
      if (res && res.ok) {
        const data = await res.json();
        setFinancialSummary(data);
      }
    } catch (err) {
      console.warn('Error fetching financial summary:', err);
    } finally {
      setLoadingFinancial(false);
    }
  };

  useEffect(() => {
    if (isFinancialModalOpen) {
      fetchFinancialSummary(financialPeriod);
    }
  }, [isFinancialModalOpen, financialPeriod]);

  // Normalized Purchases guaranteeing array types for items, receptions, and returns
  const normalizedPurchases = useMemo(() => {
    return (purchases || []).map((p) => {
      let parsedItems = Array.isArray(p.items) ? p.items : [];
      if (typeof p.items === 'string') {
        try { parsedItems = JSON.parse(p.items); } catch {}
      }

      let parsedReceptions = Array.isArray(p.receptions) ? p.receptions : [];
      if (typeof p.receptions === 'string') {
        try { parsedReceptions = JSON.parse(p.receptions); } catch {}
      }

      let parsedReturns = Array.isArray(p.returns) ? p.returns : [];
      if (typeof p.returns === 'string') {
        try { parsedReturns = JSON.parse(p.returns); } catch {}
      }

      return {
        ...p,
        items: Array.isArray(parsedItems) ? parsedItems : [],
        receptions: Array.isArray(parsedReceptions) ? parsedReceptions : [],
        returns: Array.isArray(parsedReturns) ? parsedReturns : [],
      };
    });
  }, [purchases]);

  // Unique Suppliers list
  const uniqueSuppliers = useMemo(() => {
    const set = new Set<string>();
    normalizedPurchases.forEach((p) => {
      if (p?.supplierName) set.add(p.supplierName.trim());
    });
    (inventoryItems || []).forEach((it) => {
      if ((it as any)?.supplier) set.add((it as any).supplier.trim());
      if ((it as any)?.channelTitle) set.add((it as any).channelTitle.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [normalizedPurchases, inventoryItems]);

  // Filtered Purchases
  const filteredPurchases = useMemo(() => {
    return normalizedPurchases.filter((p) => {
      if (!p) return false;
      // Status filter
      if (statusFilter !== 'all' && p.status !== statusFilter) {
        return false;
      }
      // Supplier filter
      if (supplierFilter !== 'all' && p.supplierName !== supplierFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const cleanQ = q.startsWith('#') ? q.slice(1).trim() : q;
        const matchNumber = p.purchaseNumber?.toLowerCase().includes(q) || (Boolean(cleanQ) && p.purchaseNumber?.toLowerCase().includes(cleanQ));
        const matchSupplier = p.supplierName?.toLowerCase().includes(q);
        const matchOrder =
          p.linkedCustomerOrderNumber?.toLowerCase().includes(q) ||
          (Boolean(cleanQ) && p.linkedCustomerOrderNumber?.toLowerCase().includes(cleanQ)) ||
          (Boolean(p.linkedCustomerOrderId) && String(p.linkedCustomerOrderId).includes(cleanQ || q));
        const matchNotes = p.notes?.toLowerCase().includes(q);
        const matchItems = Array.isArray(p.items) && p.items.some(
          (it: any) =>
            it?.name?.toLowerCase().includes(q) ||
            it?.sku?.toLowerCase().includes(q) ||
            it?.barcode?.toLowerCase().includes(q) ||
            (it?.orderNumber && (String(it.orderNumber).toLowerCase().includes(q) || (Boolean(cleanQ) && String(it.orderNumber).toLowerCase().includes(cleanQ)))) ||
            (it?.customerOrderId && String(it.customerOrderId).includes(cleanQ || q))
        );
        if (!matchNumber && !matchSupplier && !matchOrder && !matchNotes && !matchItems) {
          return false;
        }
      }
      return true;
    });
  }, [normalizedPurchases, statusFilter, supplierFilter, searchQuery]);

  // Grouping logic: Visually group automatically generated purchases by their customer sales order
  const groupedPurchaseBlocks = useMemo(() => {
    if (!groupByOrder) {
      return filteredPurchases.map((p) => ({
        type: 'single' as const,
        key: `single-${p.id}`,
        purchase: p,
      }));
    }

    const orderGroupsMap = new Map<
      string,
      {
        orderKey: string;
        orderNumber: string;
        customerOrderId?: number;
        customerName?: string;
        purchases: typeof filteredPurchases;
      }
    >();

    const standalonePurchases: typeof filteredPurchases = [];

    filteredPurchases.forEach((p) => {
      let linkedKey: string | null = null;
      let orderNum: string | null = null;
      let customerId: number | undefined = undefined;

      if (p.linkedCustomerOrderId) {
        linkedKey = `id-${p.linkedCustomerOrderId}`;
        customerId = Number(p.linkedCustomerOrderId);
      } else if (p.linkedCustomerOrderNumber) {
        linkedKey = `num-${p.linkedCustomerOrderNumber.trim().toUpperCase()}`;
        orderNum = p.linkedCustomerOrderNumber;
      } else if (Array.isArray(p.items)) {
        for (const it of p.items) {
          if (it.customerOrderId) {
            linkedKey = `id-${it.customerOrderId}`;
            customerId = Number(it.customerOrderId);
            break;
          }
          if (it.orderNumber) {
            linkedKey = `num-${String(it.orderNumber).trim().toUpperCase()}`;
            orderNum = String(it.orderNumber);
            break;
          }
        }
      }

      if (linkedKey) {
        if (!orderGroupsMap.has(linkedKey)) {
          const matchingOrder = (allCustomerOrders || []).find(
            (o) =>
              (customerId && o.id === customerId) ||
              (orderNum && String(o.orderNumber).trim().toUpperCase() === orderNum.trim().toUpperCase())
          );
          const finalOrderNum = matchingOrder?.orderNumber || orderNum || String(customerId) || 'Sin Número';
          const finalCustName = matchingOrder?.customerName || '';

          orderGroupsMap.set(linkedKey, {
            orderKey: linkedKey,
            orderNumber: finalOrderNum,
            customerOrderId: customerId || matchingOrder?.id,
            customerName: finalCustName,
            purchases: [],
          });
        }
        orderGroupsMap.get(linkedKey)!.purchases.push(p);
      } else {
        standalonePurchases.push(p);
      }
    });

    const blocks: Array<
      | {
          type: 'group';
          key: string;
          orderNumber: string;
          customerOrderId?: number;
          customerName?: string;
          purchases: typeof filteredPurchases;
        }
      | {
          type: 'single';
          key: string;
          purchase: (typeof filteredPurchases)[0];
        }
    > = [];

    // Add sales order groups first
    orderGroupsMap.forEach((group) => {
      blocks.push({
        type: 'group',
        key: `group-${group.orderKey}`,
        orderNumber: group.orderNumber,
        customerOrderId: group.customerOrderId,
        customerName: group.customerName,
        purchases: group.purchases,
      });
    });

    // Add standalone purchases
    standalonePurchases.forEach((p) => {
      blocks.push({
        type: 'single',
        key: `standalone-${p.id}`,
        purchase: p,
      });
    });

    return blocks;
  }, [filteredPurchases, groupByOrder, allCustomerOrders]);

  // KPI Metrics
  const metrics = useMemo(() => {
    let totalInvested = 0;
    let pendingPurchasesCost = 0;
    let pendingCount = 0;
    let receivedCount = 0;
    let customerLinkedCount = 0;

    normalizedPurchases.forEach((p) => {
      if (!p) return;
      const cost = Number(p.totalCost || 0);
      if (p.status === 'received' || p.paymentStatus === 'paid') {
        totalInvested += cost;
      }
      if (p.status === 'pending' || p.status === 'ordered' || p.status === 'in_transit' || p.status === 'partially_received') {
        pendingPurchasesCost += cost;
        pendingCount++;
      }
      if (p.status === 'received') {
        receivedCount++;
      }
      if (p.linkedCustomerOrderId) {
        customerLinkedCount++;
      }
    });

    return {
      totalInvested,
      pendingPurchasesCost,
      pendingCount,
      receivedCount,
      customerLinkedCount,
      totalCount: normalizedPurchases.length,
    };
  }, [normalizedPurchases]);

  // Confirm Purchase with Supplier Execution (Unidirectional State Machine: pending -> ordered/confirmado)
  const executeConfirmPurchase = async (purchase: PurchaseOrder) => {
    if (!purchase) return;

    // Regla ERP: La compra al proveedor no puede confirmarse si no se confirma el pedido de venta
    const isAuto = Boolean(purchase.linkedCustomerOrderId || purchase.linkedCustomerOrderNumber);
    if (isAuto) {
      const ord = (allCustomerOrders || []).find(
        (o) =>
          (purchase.linkedCustomerOrderId &&
            (Number(o.id) === Number(purchase.linkedCustomerOrderId) ||
              String(o.id) === String(purchase.linkedCustomerOrderId))) ||
          (purchase.linkedCustomerOrderNumber &&
            o.orderNumber &&
            o.orderNumber.trim() === purchase.linkedCustomerOrderNumber.trim())
      );
      const isConfirmed = ord && (ord.status === 'confirmed' || ord.status === 'shipped' || ord.status === 'delivered');
      if (!isConfirmed) {
        showToast(
          `⚠️ No se puede confirmar la compra al proveedor: El Pedido de Venta #${purchase.linkedCustomerOrderNumber || purchase.linkedCustomerOrderId} aún no ha sido confirmado. Confirma primero el pedido de venta.`
        );
        return;
      }
    }

    setIsConfirmingPurchase(true);
    try {
      const res = await authFetch(`/api/purchases/${purchase.id}/confirm`, {
        method: 'POST',
      });
      if (res && res.ok) {
        const data = await res.json();
        showToast(data.message || `✓ ¡Compra #${purchase.purchaseNumber} confirmada con el proveedor!`);
        await onRefreshPurchases();
        setPurchaseToConfirm(null);
      } else {
        const errData = await res?.json().catch(() => ({}));
        showToast(`❌ Error: ${errData?.error || 'No se pudo confirmar la compra con el proveedor'}`);
      }
    } catch (err) {
      console.error('Error confirming purchase:', err);
      showToast('❌ Error de conexión al confirmar la compra');
    } finally {
      setIsConfirmingPurchase(false);
    }
  };

  // 1-Click Receive Stock in Warehouse Execution
  const executeReceivePurchase = async () => {
    if (!purchaseToReceive) return;
    const purchase = purchaseToReceive;
    if (purchase.status === 'received') {
      setPurchaseToReceive(null);
      return;
    }

    setIsReceivingPurchase(true);
    try {
      if (onReceivePurchase) {
        await onReceivePurchase(purchase.id);
        showToast(`✓ Compra #${purchase.purchaseNumber} recibida y stock sumado a bodega.`);
      } else {
        const res = await authFetch(`/api/purchases/${purchase.id}/receive`, {
          method: 'POST',
        });
        if (res && res.ok) {
          const data = await res.json();
          showToast(data.message || `✓ Compra #${purchase.purchaseNumber} recibida y stock sumado a bodega.`);
        } else {
          const errData = await res?.json().catch(() => ({}));
          showToast(`❌ Error: ${errData?.error || 'No se pudo recibir la compra'}`);
        }
      }
      await onRefreshPurchases();
      setPurchaseToReceive(null);
    } catch (err) {
      console.error('Error receiving purchase:', err);
      showToast('❌ Error de conexión al recibir la compra');
    } finally {
      setIsReceivingPurchase(false);
    }
  };

  // Delete Purchase Execution
  const executeDeletePurchase = async () => {
    if (!purchaseToDelete) return;
    const purchase = purchaseToDelete;
    setIsDeletingPurchase(true);

    try {
      let isSuccess = false;
      if (onDeletePurchase) {
        const res = await onDeletePurchase(purchase.id);
        isSuccess = res !== false;
      } else {
        const res = await authFetch(`/api/purchases/${purchase.id}`, {
          method: 'DELETE',
        });
        isSuccess = !!(res && res.ok);
      }

      if (isSuccess) {
        showToast(`✓ Compra #${purchase.purchaseNumber} eliminada correctamente`);
        await onRefreshPurchases();
        setPurchaseToDelete(null);
        if (editingPurchase?.id === purchase.id) {
          setIsNewPurchaseModalOpen(false);
          setEditingPurchase(null);
        }
      } else {
        showToast('❌ No se pudo eliminar la compra. Intente nuevamente.');
      }
    } catch (err) {
      console.error('Error deleting purchase:', err);
      showToast('❌ Error de conexión al eliminar la compra');
    } finally {
      setIsDeletingPurchase(false);
    }
  };

  // Format supplier message for Telegram / WhatsApp
  const handleCopySupplierMessage = (purchase: PurchaseOrder) => {
    let text = `📦 *ORDEN DE COMPRA / PEDIDO A PROVEEDOR*\n`;
    text += `*N° Compra:* #${purchase.purchaseNumber}\n`;
    text += `*Proveedor:* ${purchase.supplierName}\n`;
    text += `*Fecha:* ${new Date(purchase.purchaseDate || purchase.createdAt).toLocaleDateString('es-EC')}\n\n`;
    text += `*PRODUCTOS SOLICITADOS:*\n`;

    purchase.items.forEach((it, idx) => {
      text += `${idx + 1}. *${it.name}* (Cant: *${it.quantity}*)${it.sku ? ` - SKU: ${it.sku}` : ''}${it.costPrice ? ` - Costo: $${Number(it.costPrice).toFixed(2)}` : ''}\n`;
    });

    text += `\n💰 *Total Estimado:* $${Number(purchase.totalCost || 0).toFixed(2)} ${currency}\n`;
    if (purchase.notes) {
      text += `📝 *Observaciones:* ${purchase.notes}\n`;
    }
    text += `\nPor favor confirmar disponibilidad y tiempo de entrega. ¡Muchas gracias!`;

    navigator.clipboard.writeText(text);
    showToast('✓ Mensaje de pedido para proveedor copiado al portapapeles');
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              Gestión de Compras y Abastecimiento
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                {purchases.length} {purchases.length === 1 ? 'compra' : 'compras'}
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Administra las compras a proveedores, abastece pedidos sin stock y controla la inversión real de tu negocio
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center flex-wrap gap-2.5">
          <button
            id="btn-sync-purchases"
            onClick={async () => {
              setIsRefreshing(true);
              await onRefreshPurchases();
              setIsRefreshing(false);
              showToast('✓ Compras sincronizadas');
            }}
            disabled={isRefreshing}
            title="Sincronizar listado de compras con proveedores"
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl border border-slate-200 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>

          <button
            id="btn-purchases-financial"
            onClick={() => setIsFinancialModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl border border-slate-200 transition cursor-pointer"
            title="Ver balance financiero y margen real de compras"
          >
            <BarChart3 className="w-3.5 h-3.5 text-violet-600" />
            <span>Balance y Margen</span>
          </button>

          <button
            id="btn-new-purchase"
            onClick={() => {
              setEditingPurchase(null);
              setIsNewPurchaseModalOpen(true);
            }}
            className="flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 active:scale-95 rounded-xl shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Compra</span>
          </button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between min-h-[124px]">
            <div className="flex items-start justify-between gap-2 min-h-[34px]">
              <span className="text-xs font-bold text-slate-700 leading-snug" title="Inversión en Compras">
                Inversión en Compras
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div
                className={`font-mono text-slate-900 leading-tight whitespace-nowrap ${getMetricFontSizeClass(formatSmartCurrency(metrics.totalInvested, currency))}`}
                title={`Valor exacto: ${formatExactCurrency(metrics.totalInvested, currency)}`}
              >
                {formatSmartCurrency(metrics.totalInvested, currency)}
              </div>
              <p className="text-[11px] font-medium text-slate-500 mt-1 leading-tight">
                Pagado / Recibido en bodega
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 hover:border-amber-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between min-h-[124px]">
            <div className="flex items-start justify-between gap-2 min-h-[34px]">
              <span className="text-xs font-bold text-slate-700 leading-snug" title="Pedidos en Camino">
                Pedidos en Camino
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 tracking-tight whitespace-nowrap">
                {metrics.pendingCount}
                <span className="text-xs font-semibold text-slate-400 ml-1">órdenes</span>
              </div>
              <p
                className="text-[11px] font-medium text-slate-500 mt-1 leading-tight"
                title={`Comprometido: ${formatExactCurrency(metrics.pendingPurchasesCost, currency)}`}
              >
                {formatSmartCurrency(metrics.pendingPurchasesCost, currency)} comprometidos
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 hover:border-sky-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between min-h-[124px]">
            <div className="flex items-start justify-between gap-2 min-h-[34px]">
              <span className="text-xs font-bold text-slate-700 leading-snug" title="Recibidas en Bodega">
                Recibidas en Bodega
              </span>
              <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 tracking-tight whitespace-nowrap">
                {metrics.receivedCount}
                <span className="text-xs font-semibold text-slate-400 ml-1">completadas</span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 mt-1 leading-tight">
                Stock sumado al catálogo
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 hover:border-purple-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between min-h-[124px]">
            <div className="flex items-start justify-between gap-2 min-h-[34px]">
              <span className="text-xs font-bold text-slate-700 leading-snug" title="Ventas Bajo Pedido">
                Ventas Bajo Pedido
              </span>
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shrink-0">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 tracking-tight whitespace-nowrap">
                {metrics.customerLinkedCount}
                <span className="text-xs font-semibold text-slate-400 ml-1">pedidos</span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 mt-1 leading-tight">
                Originados por clientes online
              </p>
            </div>
          </div>
        </div>

      {/* Toolbar & Filters (Dos Barras Horizontales Estáticas) */}
      <div
        id="purchases-search-container"
        className="sticky top-16 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-300 p-2.5 sm:p-3 shadow-sm space-y-2 transition-all max-w-full"
      >
        {/* Barra 1: Búsqueda y Selector de Modo de Vista */}
        <div className="flex items-center gap-1.5 sm:gap-2 w-full">
          {/* Search Box */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por N° compra, proveedor, producto, SKU o pedido cliente..."
              className="w-full pl-8.5 sm:pl-9 pr-8 sm:pr-14 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer"
                title="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5 sm:hidden" />
                <span className="hidden sm:inline">Limpiar</span>
              </button>
            )}
          </div>

          {/* View Mode Toggle: Grouped by Sales Order vs Flat List */}
          <div className="flex items-center bg-slate-100 border border-slate-300 p-1 rounded-xl text-xs shrink-0">
            <button
              type="button"
              onClick={() => setGroupByOrder(true)}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                groupByOrder
                  ? 'bg-white text-indigo-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Agrupar visualmente las órdenes generadas por pedido de venta"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden xs:inline">Agrupado</span>
            </button>
            <button
              type="button"
              onClick={() => setGroupByOrder(false)}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                !groupByOrder
                  ? 'bg-white text-indigo-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Ver lista plana individual de compras"
            >
              <List className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden xs:inline">Lista</span>
            </button>
          </div>
        </div>

        {/* Barra 2: Filtro horizontal continuo (deslizable con el dedo en móvil) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x py-1 w-full scroll-smooth pt-2 border-t border-slate-200/80 select-none">
          <span className="text-[11px] text-slate-500 font-bold shrink-0 mr-0.5">Estado:</span>

          {[
            { id: 'all', label: 'Todas', count: purchases.length },
            { id: 'pending', label: '⏳ Pendientes', count: purchases.filter((p) => p.status === 'pending').length },
            { id: 'ordered', label: '🔵 Pedidas', count: purchases.filter((p) => p.status === 'ordered').length },
            { id: 'in_transit', label: '🚚 En Tránsito', count: purchases.filter((p) => p.status === 'in_transit').length },
            { id: 'partially_received', label: '📦 Parciales', count: purchases.filter((p) => p.status === 'partially_received').length },
            { id: 'received', label: '✅ En Bodega', count: purchases.filter((p) => p.status === 'received').length },
            { id: 'cancelled', label: '❌ Canceladas', count: purchases.filter((p) => p.status === 'cancelled').length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer flex items-center gap-1 text-[11px] shrink-0 whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${statusFilter === tab.id ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {tab.count}
              </span>
            </button>
          ))}

          {/* Supplier Filter */}
          {uniqueSuppliers.length > 0 && (
            <>
              <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />
              <div className="flex items-center shrink-0">
                <select
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer shrink-0"
                >
                  <option value="all">Todos los Proveedores ({uniqueSuppliers.length})</option>
                  {uniqueSuppliers.map((sup) => (
                    <option key={sup} value={sup}>
                      👤 {sup}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Indicador de filtro exclusivo cuando se consulta desde Ventas */}
          {filterOrderNumber && (
            <>
              <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />
              <button
                type="button"
                id="btn-purchases-clear-filter"
                onClick={() => {
                  setSearchQuery('');
                  if (onClearFilterOrderNumber) onClearFilterOrderNumber();
                }}
                className="px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 text-indigo-950 font-bold transition flex items-center gap-1.5 cursor-pointer text-[11px] flex-shrink-0 whitespace-nowrap shadow-2xs"
                title="Quitar filtro exclusivo de compra por pedido"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse shrink-0" />
                <span>Pedido #{String(filterOrderNumber).replace(/^#/, '')}</span>
                <X className="w-3 h-3 text-indigo-700 shrink-0" />
              </button>
            </>
          )}

          {/* Botón Restablecer */}
          {(searchQuery || statusFilter !== 'all' || supplierFilter !== 'all' || filterOrderNumber) && (
            <>
              <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setSupplierFilter('all');
                  if (onClearFilterOrderNumber) onClearFilterOrderNumber();
                }}
                className="text-[11px] text-rose-800 hover:text-rose-950 font-bold px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-300 transition cursor-pointer flex items-center space-x-1 shadow-2xs shrink-0 whitespace-nowrap"
                title="Restablecer filtros de compras"
              >
                <X className="w-3 h-3 shrink-0" />
                <span>Restablecer</span>
              </button>
            </>
          )}
        </div>
      </div>



      {/* Indicador de filtro exclusivo cuando se consulta desde Ventas */}
      {filterOrderNumber && (
        <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs shadow-2xs mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse flex-shrink-0" />
            <span>
              Filtrando exclusivamente la compra correspondiente al Pedido <strong>#{String(filterOrderNumber).replace(/^#/, '')}</strong>
            </span>
          </div>
          <button
            type="button"
            id="btn-purchases-clear-filter"
            onClick={() => {
              setSearchQuery('');
              if (onClearFilterOrderNumber) onClearFilterOrderNumber();
            }}
            className="px-2.5 py-1 rounded-lg bg-white border border-indigo-300 hover:bg-indigo-100 text-indigo-800 font-bold transition flex items-center gap-1 cursor-pointer text-[11px] flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            <span>Ver todas las compras</span>
          </button>
        </div>
      )}

      {/* Purchases List */}
      {filteredPurchases.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center shadow-xs">
          <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Boxes className="w-7 h-7" />
          </div>
          <h3 className="text-base font-black text-slate-800">
            {filterOrderNumber
              ? `No se encontraron compras vinculadas al Pedido #${String(filterOrderNumber).replace(/^#/, '')}`
              : 'No hay compras registradas con este filtro'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            {filterOrderNumber
              ? 'Este pedido de venta aún no tiene una orden de compra generada hacia el proveedor.'
              : 'Cuando tus clientes compren productos bajo pedido o cuando decidas reabastecer a tus proveedores de Telegram, las compras aparecerán aquí.'}
          </p>
          {filterOrderNumber ? (
            <button
              onClick={() => {
                setSearchQuery('');
                if (onClearFilterOrderNumber) onClearFilterOrderNumber();
              }}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer transition shadow-xs"
            >
              <X className="w-4 h-4" />
              <span>Ver todas las compras</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setEditingPurchase(null);
                setIsNewPurchaseModalOpen(true);
              }}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer transition shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Primera Compra a Proveedor</span>
            </button>
          )}
        </div>
      ) : (
        (() => {
          const renderPurchaseCard = (purchase: PurchaseOrder, isInGroup: boolean = false, isFirstRecord: boolean = false) => {
            const statusStyles = getPurchaseStatusStyles(purchase.status);

            return (
              <div
                key={purchase.id}
                id={isFirstRecord ? 'purchases-first-record' : `purchase-record-${purchase.id}`}
                className="w-full"
              >
                <PurchaseRecordCard
                  purchase={purchase}
                  isInGroup={isInGroup}
                  currency={currency}
                  storeConfig={storeConfig}
                  customerOrders={allCustomerOrders}
                  showToast={showToast}
                  onConfirmPay={(p) => {
                    const isAuto = Boolean(p.linkedCustomerOrderId || p.linkedCustomerOrderNumber);
                    if (isAuto) {
                      const ord = (allCustomerOrders || []).find(
                        (o) =>
                          (p.linkedCustomerOrderId &&
                            (Number(o.id) === Number(p.linkedCustomerOrderId) ||
                              String(o.id) === String(p.linkedCustomerOrderId))) ||
                          (p.linkedCustomerOrderNumber &&
                            o.orderNumber &&
                            o.orderNumber.trim() === p.linkedCustomerOrderNumber.trim())
                      );
                      const isConfirmed =
                        ord && (ord.status === 'confirmed' || ord.status === 'shipped' || ord.status === 'delivered');
                      if (!isConfirmed) {
                        showToast(
                          `⚠️ No se puede confirmar la compra al proveedor: El Pedido de Venta #${p.linkedCustomerOrderNumber || p.linkedCustomerOrderId} aún no ha sido confirmado. Confirma primero el pedido de venta.`
                        );
                        return;
                      }
                    }
                    setPurchaseToConfirm(p);
                  }}
                  isConfirming={isConfirmingPurchase && purchaseToConfirm?.id === purchase.id}
                  onReceive={(p) => setPurchaseToReceive(p)}
                  isReceiving={isReceivingPurchase && purchaseToReceive?.id === purchase.id}
                  onPartialReceive={(p) => setPurchaseForPartialReception(p)}
                  onOpenWhatsapp={(p, mode) => handleOpenWhatsappModal(p, mode)}
                  onQuickCopyPhotos={(p) => handleQuickCopyPhotos(p)}
                  isCopyingPhotos={isCopyingPhotosForPurchaseId === purchase.id}
                  onEditOrDetail={(p) => {
                    setEditingPurchase(p);
                    setIsNewPurchaseModalOpen(true);
                  }}
                  onDelete={(p) => setPurchaseToDelete(p)}
                  onGoToStoreOrders={onGoToStoreOrders}
                  statusStyles={statusStyles}
                />
              </div>
            );
          };

          return (
            <div id="purchases-list-container" className="space-y-4">
              {groupedPurchaseBlocks.map((block, index) => {
                const isFirst = index === 0;
                if (block.type === 'single') {
                  return renderPurchaseCard(block.purchase, false, isFirst);
                }

                const group = block;
                const groupTotalCost = group.purchases.reduce((sum, p) => sum + (Number(p.totalCost) || 0), 0);
                const uniqueGroupSuppliers = Array.from(new Set(group.purchases.map((p) => p.supplierName).filter(Boolean)));
                const allGroupReceived = group.purchases.every((p) => p.status === 'received');
                const hasGroupPending = group.purchases.some((p) => p.status === 'pending' || p.status === 'ordered');

                return (
                  <div
                    key={group.key}
                    id={isFirst ? 'purchases-first-record' : undefined}
                    className="rounded-2xl border-2 border-indigo-200/90 bg-gradient-to-b from-indigo-50/70 via-slate-50/40 to-slate-50/90 p-4 sm:p-5 shadow-xs space-y-3.5 transition-all hover:border-indigo-300/90"
                  >
                    {/* Visual Group Banner Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-indigo-100/90">
                      <div className="flex items-start space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0 mt-0.5">
                          <Layers className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-black uppercase tracking-wide text-indigo-950 bg-indigo-100 border border-indigo-300 px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 shadow-2xs">
                              <ShoppingBag className="w-3.5 h-3.5 text-indigo-700" />
                              Pedido de Venta #{group.orderNumber}
                            </span>
                            {group.customerName && (
                              <span className="text-xs font-bold text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                                Cliente: <span className="text-indigo-950 font-black">{group.customerName}</span>
                              </span>
                            )}
                            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs">
                              <Sparkles className="w-3 h-3 text-amber-600" />
                              {group.purchases.length} {group.purchases.length === 1 ? 'Compra generada por proveedor' : 'Compras separadas por proveedor'}
                            </span>
                            {allGroupReceived ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Todas en Bodega
                              </span>
                            ) : hasGroupPending ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-100 text-sky-900 border border-sky-300 flex items-center gap-1">
                                <Truck className="w-3 h-3 text-sky-600" />
                                En Abastecimiento
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-600 font-medium mt-1">
                            Proveedores involucrados: <span className="font-bold text-slate-900">{uniqueGroupSuppliers.join(', ') || 'Sin asignar'}</span>
                          </p>
                        </div>
                      </div>

                      {/* Group Combined Cost & Action */}
                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <div className="text-right">
                          <div className="text-[10px] uppercase font-bold text-slate-500">Costo Combinado ({group.purchases.length} {group.purchases.length === 1 ? 'OC' : 'OCs'})</div>
                          <div className="font-mono font-black text-sm sm:text-base text-slate-900">
                            ${groupTotalCost.toFixed(2)} <span className="text-xs text-slate-500">{currency}</span>
                          </div>
                        </div>
                        {onGoToStoreOrders && (
                          <button
                            type="button"
                            onClick={() => onGoToStoreOrders(group.orderNumber)}
                            className="text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-white hover:bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl transition cursor-pointer shadow-2xs flex items-center gap-1.5"
                            title="Ver este pedido en la sección de ventas"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Ver Venta</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* List of Supplier Purchases under this sales order */}
                    <div className="space-y-3 pl-0 sm:pl-3 border-l-0 sm:border-l-2 sm:border-indigo-300/80">
                      {group.purchases.map((purchase) => renderPurchaseCard(purchase, true))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()
      )}

      {/* MODAL: Nueva / Editar Compra a Proveedor */}
      {isNewPurchaseModalOpen && (
        <PurchaseFormModal
          purchase={editingPurchase}
          allPurchases={purchases}
          inventoryItems={inventoryItems}
          customerOrders={allCustomerOrders}
          currency={currency}
          authFetch={authFetch}
          onClose={() => {
            setIsNewPurchaseModalOpen(false);
            setEditingPurchase(null);
          }}
          onDeleteClick={(p) => {
            setPurchaseToDelete(p);
          }}
          onSaved={async () => {
            setIsNewPurchaseModalOpen(false);
            setEditingPurchase(null);
            await onRefreshPurchases();
          }}
          onOpenPayableForPurchase={onOpenPayableForPurchase}
          onConfirmPayment={(p) => {
            setIsNewPurchaseModalOpen(false);
            setEditingPurchase(null);
            setPurchaseToConfirm(p);
          }}
          onOpenContactModal={handleOpenWhatsappModal}
          showToast={showToast}
        />
      )}

      {/* MODAL: Estado de Resultados Financiero y Margen Real */}
      {isFinancialModalOpen && (
        <FinancialSummaryModal
          summary={financialSummary}
          period={financialPeriod}
          onPeriodChange={(p) => setFinancialPeriod(p)}
          loading={loadingFinancial}
          currency={currency}
          onClose={() => setIsFinancialModalOpen(false)}
        />
      )}

      {/* MODAL DE CONFIRMACIÓN: Eliminar Compra a Proveedor */}
      {purchaseToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-slate-900">
                ¿Eliminar Orden de Compra #{purchaseToDelete.purchaseNumber}?
              </h3>
              <p className="text-xs text-slate-500">
                Proveedor: <strong className="text-slate-700">{purchaseToDelete.supplierName}</strong> • Inversión: <strong className="text-slate-700 font-mono">${Number(purchaseToDelete.totalCost || 0).toFixed(2)} {currency}</strong>
              </p>
            </div>

            {purchaseToDelete.linkedCustomerOrderId ? (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 text-xs text-amber-950 flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="block font-bold text-amber-900">Acción Bloqueada (Integridad ERP):</strong>
                  <p className="leading-relaxed">
                    Esta orden al proveedor fue generada automáticamente a partir del <strong>Pedido de Venta #{purchaseToDelete.linkedCustomerOrderNumber || purchaseToDelete.linkedCustomerOrderId}</strong>.
                  </p>
                  <p className="font-semibold text-amber-900 mt-1">
                    No se puede eliminar de forma manual. Solo se eliminará automáticamente si el pedido de cliente correspondiente es eliminado.
                  </p>
                </div>
              </div>
            ) : purchaseToDelete.status === 'received' ? (
              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold mb-0.5">Aviso de Stock en Bodega:</strong>
                  Esta compra ya fue recibida. Al eliminarla, el stock ingresado ({Array.isArray(purchaseToDelete.items) ? purchaseToDelete.items.reduce((s, it) => s + (Number(it.quantity) || 1), 0) : 0} unidades) se restará automáticamente de tu inventario físico.
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPurchaseToDelete(null)}
                disabled={isDeletingPurchase}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition disabled:opacity-50"
              >
                {purchaseToDelete.linkedCustomerOrderId ? 'Entendido / Cerrar' : 'Cancelar'}
              </button>
              {!purchaseToDelete.linkedCustomerOrderId && (
                <button
                  type="button"
                  onClick={executeDeletePurchase}
                  disabled={isDeletingPurchase}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer transition shadow-xs disabled:opacity-50 active:scale-95"
                >
                  {isDeletingPurchase ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Eliminando...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Sí, Eliminar Compra</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN: Solicitar datos de Pago a Proveedores al Confirmar Compra */}
      {purchaseToConfirm && (
        <PurchaseConfirmPaymentModal
          purchase={purchaseToConfirm}
          currency={currency}
          customerOrders={allCustomerOrders}
          authFetch={authFetch}
          onClose={() => setPurchaseToConfirm(null)}
          onSuccess={async () => {
            setPurchaseToConfirm(null);
            await onRefreshPurchases();
          }}
          onOpenFullPayable={onOpenPayableForPurchase}
          showToast={showToast}
        />
      )}

      {/* MODAL DE CONFIRMACIÓN: Recibir Compra en Bodega */}
      {purchaseToReceive && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-slate-900">
                ¿Ingresar Compra #{purchaseToReceive.purchaseNumber} a Bodega?
              </h3>
              <p className="text-xs text-slate-500">
                Proveedor: <strong className="text-slate-700">{purchaseToReceive.supplierName}</strong>
              </p>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 text-xs text-emerald-900 space-y-1">
              <p className="font-bold">Productos que se sumarán al inventario físico:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-emerald-800">
                {Array.isArray(purchaseToReceive.items) && purchaseToReceive.items.map((it, idx) => (
                  <li key={idx}>
                    <strong>+{it.quantity || 1}</strong> {it.name}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPurchaseToReceive(null)}
                disabled={isReceivingPurchase}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeReceivePurchase}
                disabled={isReceivingPurchase}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs cursor-pointer transition shadow-xs disabled:opacity-50 active:scale-95"
              >
                {isReceivingPurchase ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Ingresando stock...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirmar Ingreso a Bodega</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Recepción Parcial de Mercancía / Entregas Incompletas */}
      {purchaseForPartialReception && (
        <PurchasePartialReceptionModal
          purchase={purchaseForPartialReception}
          currency={currency}
          authFetch={authFetch}
          onClose={() => setPurchaseForPartialReception(null)}
          onSuccess={async () => {
            setPurchaseForPartialReception(null);
            await onRefreshPurchases();
          }}
          showToast={showToast}
        />
      )}

      {/* MODAL: Contactar Proveedor por WhatsApp & Copiar Portadas al Portapapeles */}
      <PurchaseSupplierContactModal
        isOpen={Boolean(contactModalPurchase)}
        onClose={() => {
          setContactModalPurchase(null);
          setContactModalInitialAction(null);
        }}
        purchase={contactModalPurchase}
        inventoryItems={inventoryItems}
        suppliers={suppliers}
        onUpdatePurchaseContact={handleUpdatePurchaseContact}
        showToast={showToast}
        initialAction={contactModalInitialAction}
      />
    </div>
  );
};

// ==========================================
// SUB-COMPONENT: Modal Formulario de Compra
// ==========================================

interface PurchaseFormModalProps {
  purchase: PurchaseOrder | null;
  allPurchases?: PurchaseOrder[];
  inventoryItems?: InventoryItem[];
  customerOrders?: CustomerOrder[];
  currency: string;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onDeleteClick?: (purchase: PurchaseOrder) => void;
  onSaved: () => Promise<void>;
  onOpenPayableForPurchase?: (purchase: any) => void;
  onConfirmPayment?: (purchase: PurchaseOrder) => void;
  onOpenContactModal?: (purchase: PurchaseOrder, action?: 'whatsapp' | 'copy_photos') => void;
  showToast: (msg: string) => void;
}

const PurchaseFormModal: React.FC<PurchaseFormModalProps> = ({
  purchase,
  allPurchases = [],
  inventoryItems = [],
  customerOrders = [],
  currency,
  authFetch,
  onClose,
  onDeleteClick,
  onSaved,
  onOpenPayableForPurchase,
  onConfirmPayment,
  onOpenContactModal,
  showToast,
}) => {
  const isEditing = Boolean(purchase);
  const isAutoGeneratedFromSale = Boolean(
    purchase && (purchase.linkedCustomerOrderId || purchase.linkedCustomerOrderNumber)
  );
  // Regla ERP: Únicamente las compras generadas automáticamente por ventas NO deben poder ser editadas desde el menú de compras.
  // Las órdenes regulares confirmadas por el proveedor (o recibidas/canceladas) son inmutables según norma ERP.
  const isImmutable = (isEditing && purchase?.status !== 'pending') || isAutoGeneratedFromSale;

  // Extract all existing registered suppliers from inventory items and previous purchases
  const { knownSuppliers, supplierContactsMap } = useMemo(() => {
    const set = new Set<string>();
    const contactsMap: Record<string, string> = {};

    (inventoryItems || []).forEach((it) => {
      if (it?.supplierName && it.supplierName.trim()) {
        const s = it.supplierName.trim();
        set.add(s);
      }
      if ((it as any)?.supplier && (it as any).supplier.trim()) {
        set.add((it as any).supplier.trim());
      }
      if ((it as any)?.channelTitle && (it as any).channelTitle.trim()) {
        set.add((it as any).channelTitle.trim());
      }
    });

    (allPurchases || []).forEach((p) => {
      if (p?.supplierName && p.supplierName.trim()) {
        const s = p.supplierName.trim();
        set.add(s);
        if (p.supplierContact && p.supplierContact.trim() && !contactsMap[s.toLowerCase()]) {
          contactsMap[s.toLowerCase()] = p.supplierContact.trim();
        }
      }
    });

    return {
      knownSuppliers: Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b)),
      supplierContactsMap: contactsMap,
    };
  }, [inventoryItems, allPurchases]);

  const [supplierName, setSupplierName] = useState(
    purchase?.supplierName || (knownSuppliers.length === 1 ? knownSuppliers[0] : (knownSuppliers[0] || 'Proveedor Telegram Principal'))
  );
  const [supplierContact, setSupplierContact] = useState(purchase?.supplierContact || '');
  const [status, setStatus] = useState<string>(purchase?.status || 'pending');
  // Regla ERP #1: cuando el estado es 'pending', paymentStatus SIEMPRE es 'unpaid'
  const [paymentStatus, setPaymentStatus] = useState<string>(
    purchase?.paymentStatus || (purchase?.status === 'pending' || !purchase ? 'unpaid' : 'paid')
  );
  const [linkedOrderId, setLinkedOrderId] = useState<string>(
    purchase?.linkedCustomerOrderId ? String(purchase.linkedCustomerOrderId) : ''
  );
  const [notes, setNotes] = useState(purchase?.notes || '');
  const [purchaseDate, setPurchaseDate] = useState(
    purchase?.purchaseDate
      ? new Date(purchase.purchaseDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );

  // Vínculo con Pedido de Venta y validación de estado de confirmación
  const linkedCustomerOrder = useMemo(() => {
    return (customerOrders || []).find(
      (ord) =>
        (linkedOrderId &&
          (Number(ord.id) === Number(linkedOrderId) || String(ord.id) === String(linkedOrderId))) ||
        (purchase?.linkedCustomerOrderId &&
          (Number(ord.id) === Number(purchase.linkedCustomerOrderId) ||
            String(ord.id) === String(purchase.linkedCustomerOrderId))) ||
        (purchase?.linkedCustomerOrderNumber &&
          ord.orderNumber &&
          ord.orderNumber.trim() === purchase.linkedCustomerOrderNumber.trim())
    );
  }, [customerOrders, linkedOrderId, purchase]);

  const isLinkedOrderConfirmed = Boolean(
    linkedCustomerOrder &&
      (linkedCustomerOrder.status === 'confirmed' ||
        linkedCustomerOrder.status === 'shipped' ||
        linkedCustomerOrder.status === 'delivered')
  );

  const isLinkedOrderUnconfirmed = Boolean(
    (isAutoGeneratedFromSale || Boolean(purchase?.linkedCustomerOrderId || purchase?.linkedCustomerOrderNumber || linkedOrderId)) &&
      !isLinkedOrderConfirmed
  );

  // Manejador de cambio de estado sincronizado con regla ERP de pago y confirmación de venta
  const handleStatusChange = (newStatus: string) => {
    if (newStatus !== 'pending' && newStatus !== 'cancelled' && isLinkedOrderUnconfirmed) {
      showToast(
        `⚠️ No se puede confirmar la compra al proveedor: El Pedido de Venta #${linkedCustomerOrder?.orderNumber || purchase?.linkedCustomerOrderNumber || purchase?.linkedCustomerOrderId} no ha sido confirmado aún por el vendedor.`
      );
      return;
    }
    setStatus(newStatus);
    if (newStatus === 'pending') {
      setPaymentStatus('unpaid');
    } else if (newStatus === 'ordered' || newStatus === 'received' || newStatus === 'in_transit') {
      setPaymentStatus('paid');
    }
  };

  // Helper to select an existing supplier and auto-populate contact info if available
  const handleSelectSupplier = (selected: string) => {
    if (!selected) return;
    setSupplierName(selected);
    const existingContact = supplierContactsMap[selected.toLowerCase()];
    if (existingContact && (!supplierContact || supplierContact.trim() === '')) {
      setSupplierContact(existingContact);
    }
  };

  // Items in Purchase
  const [items, setItems] = useState<PurchaseItem[]>(
    purchase?.items && Array.isArray(purchase.items) ? [...purchase.items] : []
  );

  // Item Picker state with barcode reader support
  const [productSearch, setProductSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filtered catalog products for picker
  const filteredCatalog = useMemo(() => {
    if (!productSearch.trim()) return [];
    const q = productSearch.toLowerCase();
    return inventoryItems
      .filter((it) => 
        it.name?.toLowerCase().includes(q) || 
        it.sku?.toLowerCase().includes(q) ||
        (it.barcode && it.barcode.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [inventoryItems, productSearch]);

  // Regla ERP #2: Control de productos duplicados al agregar desde el catálogo
  const handleAddCatalogItem = (it: InventoryItem) => {
    const cost = Number(it.costPrice || it.salePrice || 0);
    const itemSupplier = it.supplierName || (it as any).supplier || (it as any).channelTitle || supplierName;
    
    // Auto-update order supplier if it's currently the default generic placeholder and the item has a specific supplier
    if (
      (!supplierName || supplierName === 'Proveedor Telegram Principal' || supplierName === 'Proveedor Telegram') &&
      it.supplierName &&
      it.supplierName !== 'Proveedor Telegram Principal'
    ) {
      handleSelectSupplier(it.supplierName);
    }

    // Comprobación de duplicidad por ID, SKU o Nombre exacto
    const existingIndex = items.findIndex(
      (existing) =>
        (existing.inventoryItemId && existing.inventoryItemId === it.id) ||
        (existing.sku && it.sku && existing.sku.trim().toLowerCase() === it.sku.trim().toLowerCase()) ||
        (existing.name && it.name && existing.name.trim().toLowerCase() === it.name.trim().toLowerCase())
    );

    if (existingIndex !== -1) {
      // El producto ya estaba agregado -> se controla y se incrementa la cantidad
      const existingItem = items[existingIndex];
      const currentQty = Number(existingItem.quantity) || 1;
      const updatedQty = currentQty + 1;

      setItems((prev) => {
        const next = [...prev];
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: updatedQty,
        };
        return next;
      });

      showToast(`✓ "${it.name}": Se incrementó la cantidad a ${updatedQty} unidades.`);
      setProductSearch('');
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        inventoryItemId: it.id,
        name: it.name,
        sku: it.sku,
        barcode: it.barcode || undefined,
        costPrice: cost.toFixed(2),
        salePrice: it.salePrice,
        quantity: 1,
        imageUrl: it.imageUrl || null,
        supplierName: itemSupplier,
      },
    ]);
    showToast(`✓ Agregado: "${it.name}"`);
    setProductSearch('');
  };

  // Soporte para lector de código de barras (pistola / escáner envía código + Enter)
  const handleProductSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();

      const term = productSearch.trim();
      if (!term) return;

      const termLower = term.toLowerCase();

      // 1. Prioridad #1: Coincidencia exacta por Código de Barras (EAN / UPC / Code-128)
      let matchedItem = inventoryItems.find(
        (it) => it.barcode && it.barcode.trim().toLowerCase() === termLower
      );

      // 2. Prioridad #2: Coincidencia exacta por SKU
      if (!matchedItem) {
        matchedItem = inventoryItems.find(
          (it) => it.sku && it.sku.trim().toLowerCase() === termLower
        );
      }

      // 3. Prioridad #3: Coincidencia exacta por Nombre
      if (!matchedItem) {
        matchedItem = inventoryItems.find(
          (it) => it.name && it.name.trim().toLowerCase() === termLower
        );
      }

      // 4. Prioridad #4: Si hay resultados filtrados, seleccionar el primero
      if (!matchedItem && filteredCatalog.length > 0) {
        matchedItem = filteredCatalog[0];
      }

      if (matchedItem) {
        handleAddCatalogItem(matchedItem);
        setProductSearch('');
        // Mantener el foco en el campo para que el lector siga escaneando productos seguidos
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 30);
      } else {
        showToast(`⚠️ No se encontró ningún producto registrado con código o búsqueda: "${term}"`);
      }
    }
  };

  const handleUpdateItem = (index: number, field: keyof PurchaseItem, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculate total cost
  const totalCost = useMemo(() => {
    return items.reduce((sum, it) => {
      const cost = Number(it.costPrice || 0);
      const qty = Number(it.quantity || 1);
      return sum + cost * qty;
    }, 0);
  }, [items]);

  const handleSavePurchase = async (openPaymentAfterSave = false) => {
    if (openPaymentAfterSave || status === 'ordered' || status === 'received' || status === 'in_transit' || paymentStatus === 'paid') {
      if (isLinkedOrderUnconfirmed) {
        showToast(
          `⚠️ No se puede confirmar la compra al proveedor: El Pedido de Venta #${linkedCustomerOrder?.orderNumber || purchase?.linkedCustomerOrderNumber || purchase?.linkedCustomerOrderId} aún no ha sido confirmado. Confirma primero el pedido de venta.`
        );
        return;
      }
    }

    if (isAutoGeneratedFromSale) {
      if (openPaymentAfterSave && purchase && onConfirmPayment) {
        onClose();
        onConfirmPayment(purchase);
        return;
      }
      showToast('ℹ️ Esta compra fue generada automáticamente por un pedido de venta y no puede ser editada desde el menú de compras.');
      onClose();
      return;
    }

    if (isImmutable) {
      showToast('ℹ️ Esta orden ya está confirmada y pagada con el proveedor (Modo sólo lectura).');
      onClose();
      return;
    }

    if (!supplierName.trim()) {
      showToast('⚠️ Ingresa el nombre del proveedor');
      return;
    }
    if (items.length === 0) {
      showToast('⚠️ Agrega al menos un producto a la compra');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalPaymentStatus = status === 'pending' ? 'unpaid' : paymentStatus;
      const payload = {
        supplierName: supplierName.trim(),
        supplierContact: supplierContact.trim(),
        items,
        totalCost: totalCost.toFixed(2),
        status,
        paymentStatus: finalPaymentStatus,
        linkedCustomerOrderId: linkedOrderId ? parseInt(linkedOrderId, 10) : null,
        notes: notes.trim(),
        purchaseDate,
      };

      let res: Response;
      if (isEditing && purchase) {
        res = await authFetch(`/api/purchases/${purchase.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await authFetch('/api/purchases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        const responseData = await res.json().catch(() => ({}));
        const savedPurchase = responseData?.purchase || {
          id: responseData?.id || purchase?.id,
          purchaseNumber: responseData?.purchaseNumber || purchase?.purchaseNumber,
          supplierName: supplierName.trim(),
          totalCost: totalCost.toFixed(2),
          status,
        };

        showToast(
          openPaymentAfterSave
            ? '✓ Compra guardada. Abriendo Cuenta por Pagar para ingresar el pago y confirmar...'
            : isEditing
            ? '✓ Compra actualizada exitosamente'
            : '✓ Compra registrada exitosamente'
        );

        await onSaved();
        onClose();

        if (openPaymentAfterSave && onOpenPayableForPurchase && savedPurchase?.id) {
          onOpenPayableForPurchase(savedPurchase);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(`❌ Error: ${errData.error || 'No se pudo guardar la compra'}`);
      }
    } catch (err) {
      console.error('Error saving purchase:', err);
      showToast('❌ Error de conexión al guardar la compra');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Si el usuario eligió confirmar la compra o marcarla pagada, abrir formulario de pago a proveedores
    const shouldOpenPayment = status === 'ordered' || status === 'received' || paymentStatus === 'paid';
    await handleSavePurchase(shouldOpenPayment);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              {isAutoGeneratedFromSale ? (
                <>
                  <span>Detalle de Compra #{purchase?.purchaseNumber}</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-amber-700" />
                    Auto por Venta (Sólo Lectura)
                  </span>
                </>
              ) : isImmutable ? (
                `Detalle de Compra #${purchase?.purchaseNumber} (Sólo Lectura)`
              ) : isEditing ? (
                `Editar Compra #${purchase?.purchaseNumber}`
              ) : (
                'Nueva Compra / Pedido a Proveedor'
              )}
            </h2>
            <p className="text-xs text-slate-500">
              {isAutoGeneratedFromSale
                ? `Generada automáticamente para el Pedido de Venta #${purchase?.linkedCustomerOrderNumber || purchase?.linkedCustomerOrderId} (No editable)`
                : isImmutable
                ? 'Consulta los datos de la orden cerrada y recepción de mercadería'
                : isEditing
                ? 'Modifica los datos de la orden en borrador o consulta su detalle'
                : 'Registra los productos que compraste o solicitaste a tus proveedores de Telegram'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
              title="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* ERP Immutability Banner */}
          {isAutoGeneratedFromSale ? (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 text-xs text-amber-950 flex items-start gap-2.5 shadow-2xs">
              <Lock className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold mb-0.5 text-amber-900 flex items-center gap-1.5">
                  <span>🔒 Compra Generada Automáticamente por Pedido de Venta #{purchase?.linkedCustomerOrderNumber || purchase?.linkedCustomerOrderId}</span>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900 uppercase">Sólo Lectura</span>
                </strong>
                <p className="leading-relaxed">
                  Esta orden de compra fue generada de forma automática para abastecer los productos faltantes del <strong>Pedido de Venta #{purchase?.linkedCustomerOrderNumber || purchase?.linkedCustomerOrderId}</strong>. Por normas de integridad comercial y trazabilidad de inventario, no puede ser editada directamente desde el menú de compras.
                </p>
              </div>
            </div>
          ) : isImmutable ? (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 text-xs text-amber-950 flex items-start gap-2.5 shadow-2xs">
              <Lock className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold mb-0.5 text-amber-900">
                  🔒 Orden Confirmada y Pagada / Protegida por Integridad ERP
                </strong>
                Esta orden ya fue confirmada con el proveedor y se encuentra pagada. Por normas estrictas de trazabilidad e integridad de inventario ERP, no se puede modificar ni eliminar. Únicamente puedes proceder a registrar la <strong>recepción parcial o total</strong> en bodega cuando llegue la mercadería.
              </div>
            </div>
          ) : null}

          {/* Supplier & Contact Info Section */}
          <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                  <span>Nombre del Proveedor *</span>
                  {!isImmutable && knownSuppliers.length > 0 && (
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                      {knownSuppliers.length} registrados
                    </span>
                  )}
                </label>
                {!isImmutable && knownSuppliers.length > 0 && (
                  <span className="text-[10px] text-slate-500">
                    Elige de la lista o escribe uno nuevo
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                {/* Input text with datalist */}
                <div className={`${!isImmutable && knownSuppliers.length > 0 ? 'sm:col-span-7' : 'sm:col-span-12'} relative`}>
                  <input
                    type="text"
                    required
                    disabled={isImmutable}
                    list={isImmutable ? undefined : "purchase-registered-suppliers-list"}
                    value={supplierName}
                    onChange={(e) => handleSelectSupplier(e.target.value)}
                    placeholder="Ej. Proveedor Calzados Telegram"
                    className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold ${
                      isImmutable
                        ? 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                        : 'bg-white border-slate-300 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                    }`}
                  />
                  {!isImmutable && (
                    <datalist id="purchase-registered-suppliers-list">
                      {knownSuppliers.map((sup) => (
                        <option key={sup} value={sup} />
                      ))}
                    </datalist>
                  )}
                </div>

                {/* Quick select dropdown */}
                {!isImmutable && knownSuppliers.length > 0 && (
                  <div className="sm:col-span-5">
                    <select
                      value={knownSuppliers.includes(supplierName) ? supplierName : ''}
                      onChange={(e) => {
                        if (e.target.value) handleSelectSupplier(e.target.value);
                      }}
                      className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="">▼ Seleccionar registrado...</option>
                      {knownSuppliers.map((sup) => (
                        <option key={sup} value={sup}>
                          📦 {sup}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Quick clickable chips of existing suppliers */}
              {!isImmutable && knownSuppliers.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200/60">
                  <div className="text-[10px] font-bold text-slate-500 mb-1 flex items-center space-x-1">
                    <span>⚡ Proveedores de ingresos y catálogo:</span>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                    {knownSuppliers.map((sup) => {
                      const isSelected = supplierName.trim().toLowerCase() === sup.trim().toLowerCase();
                      return (
                        <button
                          type="button"
                          key={sup}
                          onClick={() => handleSelectSupplier(sup)}
                          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          <span>🏷️</span>
                          <span className="truncate max-w-[150px]">{sup}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Supplier Contact and Purchase Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200/60">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Teléfono / WhatsApp / Telegram (Opcional)
                </label>
                <input
                  type="text"
                  disabled={isImmutable}
                  value={supplierContact}
                  onChange={(e) => setSupplierContact(e.target.value)}
                  placeholder="Ej. +51 987 654 321 o @proveedor_canal"
                  className={`w-full px-3 py-2 border rounded-xl text-xs ${
                    isImmutable
                      ? 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                      : 'bg-white border-slate-300 text-slate-900 focus:outline-none focus:border-indigo-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Fecha de la Compra</label>
                <input
                  type="date"
                  disabled={isImmutable}
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-xl text-xs ${
                    isImmutable
                      ? 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                      : 'bg-white border-slate-300 text-slate-900 focus:outline-none focus:border-indigo-500'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Status & Payment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Estado de la Compra
                {status === 'received' && (
                  <span className="ml-1.5 text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    + Suma stock
                  </span>
                )}
              </label>
              <select
                value={status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={isImmutable}
                className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer ${
                  isImmutable ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                {!isEditing ? (
                  <>
                    <option value="pending">⏳ Pendiente (Averiguar disponibilidad y precio con proveedor - Recomendado)</option>
                    <option value="ordered">🔵 Confirmada con Proveedor (Orden en firme)</option>
                    <option value="received">✅ Recibida en Bodega (Ingreso físico inmediato a stock)</option>
                  </>
                ) : (
                  <>
                    {purchase?.status === 'pending' && (
                      <option value="pending">⏳ Pendiente (Averiguando disponibilidad)</option>
                    )}
                    {(purchase?.status === 'pending' || purchase?.status === 'ordered' || purchase?.status === 'in_transit') && (
                      <>
                        <option value="ordered">🔵 Confirmada / Pedida al Proveedor</option>
                        <option value="in_transit">🚚 En Tránsito / Despachada por Proveedor</option>
                      </>
                    )}
                    {(purchase?.status === 'pending' || purchase?.status === 'ordered' || purchase?.status === 'in_transit' || purchase?.status === 'partially_received') && (
                      <option value="partially_received">📦 Parcialmente Recibida</option>
                    )}
                    <option value="received">✅ Recibida en Bodega (Ingreso total a stock)</option>
                    <option value="cancelled">❌ Cancelada (Anular orden)</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Estado del Pago
                {status === 'pending' && (
                  <span className="ml-1 text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                    Fijo por pagar
                  </span>
                )}
              </label>
              <select
                value={status === 'pending' ? 'unpaid' : paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                disabled={status === 'pending' || isImmutable}
                className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer ${
                  status === 'pending' || isImmutable
                    ? 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                    : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <option value="unpaid">⚠️ Por pagar (Pendiente de pago)</option>
                <option value="paid">💳 Pagado al proveedor</option>
              </select>
            </div>
          </div>

          {/* Link to Customer Order - Non-editable as requested */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700">
                ¿Vincular a un Pedido de Cliente Bajo Pedido? (Opcional)
              </label>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-500" />
                Automático (No editable)
              </span>
            </div>
            <select
              value={linkedOrderId}
              disabled={true}
              className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-600 cursor-not-allowed font-medium"
              title="La vinculación se realiza exclusivamente de forma automática por el sistema cuando un pedido de venta genera su compra"
            >
              <option value="">Ninguno (Compra directa para inventario propio)</option>
              {(customerOrders || []).map((ord) => (
                <option key={ord.id} value={ord.id}>
                  Pedido #{ord.orderNumber} - {ord.customerName} (${Number(ord.totalAmount).toFixed(2)})
                </option>
              ))}
              {linkedOrderId && !(customerOrders || []).some(o => String(o.id) === String(linkedOrderId)) && (
                <option value={linkedOrderId}>
                  Pedido #{purchase?.linkedCustomerOrderNumber || linkedOrderId} (Vinculado automáticamente)
                </option>
              )}
            </select>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <span>ℹ️</span>
              <span>
                {linkedCustomerOrder || linkedOrderId
                  ? `Esta compra está vinculada automáticamente al Pedido de Venta #${linkedCustomerOrder?.orderNumber || purchase?.linkedCustomerOrderNumber || linkedOrderId}.`
                  : 'Las compras a proveedores sólo se vinculan automáticamente por el sistema al crearse desde una venta.'}
              </span>
            </p>
          </div>

          {/* Items Section - Enhanced Visual Layout */}
          <div className="bg-gradient-to-b from-indigo-50/70 via-slate-50 to-slate-50/90 border border-indigo-100 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-900 uppercase tracking-wider">
                    Artículos de la Compra
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {items.length} {items.length === 1 ? 'producto cargado' : 'productos cargados'}
                  </span>
                </div>
              </div>

              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 font-bold text-[11px] border border-emerald-200 shadow-2xs">
                <Barcode className="w-3.5 h-3.5 text-emerald-600" />
                <span>Compatible con Lector de Barras</span>
              </span>
            </div>

            {/* Smart Search catalog picker with barcode & SKU scanner support */}
            {!isImmutable && (
              <div className="relative">
                <Search className="w-4 h-4 text-indigo-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  onKeyDown={handleProductSearchKeyDown}
                  placeholder="🔍 Escanea con lector de código de barras (envía Enter) o busca por SKU/Nombre..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-indigo-200/90 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition shadow-xs"
                />
                {filteredCatalog.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1.5 bg-white border border-indigo-100 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                    <div className="p-2 bg-indigo-50/50 text-[10px] font-bold text-indigo-800 uppercase tracking-wider flex items-center justify-between">
                      <span>Resultados del catálogo</span>
                      <span>{filteredCatalog.length} coincidencias</span>
                    </div>
                    {filteredCatalog.map((it) => (
                      <div
                        key={it.id}
                        onClick={() => handleAddCatalogItem(it)}
                        className="p-3 hover:bg-indigo-50/80 cursor-pointer flex items-center justify-between text-xs transition group"
                      >
                        <div className="flex items-center space-x-3 truncate">
                          {it.imageUrl ? (
                            <img src={it.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border border-slate-200 shadow-xs" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center flex-shrink-0 border border-slate-200">
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                          <div className="truncate">
                            <div className="font-bold text-slate-900 truncate group-hover:text-indigo-700 transition">
                              {it.name}
                            </div>
                            <div className="flex items-center space-x-2 text-[10px] mt-0.5 text-slate-500">
                              {it.sku && (
                                <span className="font-mono font-bold text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200">
                                  SKU: {it.sku}
                                </span>
                              )}
                              {it.barcode && (
                                <span className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 flex items-center space-x-1">
                                  <Barcode className="w-2.5 h-2.5" />
                                  <span>{it.barcode}</span>
                                </span>
                              )}
                              {it.category && <span>• {it.category}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="text-right ml-2 flex-shrink-0">
                          <span className="text-[10px] text-slate-500 block">Costo sugerido</span>
                          <span className="font-mono font-black text-amber-700 text-xs sm:text-sm">
                            ${Number(it.costPrice || it.salePrice || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Items List - High Contrast Cards */}
            {items.length === 0 ? (
              <div className="text-center py-6 px-4 bg-white/80 border border-dashed border-indigo-200 rounded-xl space-y-2">
                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto">
                  <Package className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-700">No hay productos agregados a esta orden</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Escanea el código de barras con el lector (envía Enter automáticamente) o busca por SKU/Nombre para agregar productos registrados en el catálogo.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {items.map((it, idx) => {
                  const unitCost = Number(it.costPrice || 0);
                  const qty = Number(it.quantity || 1);
                  const lineTotal = unitCost * qty;

                  return (
                    <div
                      key={idx}
                      className="bg-white border border-slate-200/90 hover:border-indigo-300 rounded-xl p-3 shadow-xs transition space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        {/* Product Image / Icon & Name Input */}
                        <div className="flex items-start space-x-2.5 flex-1 min-w-0">
                          {it.imageUrl ? (
                            <img
                              src={it.imageUrl}
                              alt=""
                              className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-slate-200 mt-0.5 shadow-xs"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Package className="w-5 h-5" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0 space-y-1">
                            <input
                              type="text"
                              value={it.name}
                              disabled={isImmutable}
                              onChange={(e) => handleUpdateItem(idx, 'name', e.target.value)}
                              placeholder="Nombre del producto"
                              className={`w-full font-bold text-slate-900 bg-transparent border-0 p-0 focus:ring-0 focus:outline-none text-xs sm:text-sm placeholder:text-slate-400 ${
                                isImmutable ? 'cursor-not-allowed text-slate-600' : ''
                              }`}
                            />
                            
                            {/* Badges for SKU and Barcode */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <div className="inline-flex items-center space-x-1 bg-sky-50 text-sky-800 border border-sky-200 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                                <span>SKU:</span>
                                <input
                                  type="text"
                                  value={it.sku || ''}
                                  disabled={isImmutable}
                                  onChange={(e) => handleUpdateItem(idx, 'sku', e.target.value)}
                                  placeholder="Auto"
                                  className="w-16 bg-transparent border-0 p-0 font-mono text-sky-900 focus:outline-none font-bold text-[10px] disabled:text-slate-600"
                                />
                              </div>

                              {it.barcode && (
                                <span className="inline-flex items-center space-x-1 bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                  <Barcode className="w-2.5 h-2.5 text-slate-500" />
                                  <span>{it.barcode}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Remove Action Button */}
                        {!isImmutable && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            title="Eliminar producto de la lista"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {isImmutable && (
                          <span title="Producto protegido en orden cerrada" className="p-1 text-slate-400">
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                          </span>
                        )}
                      </div>

                      {/* Controls Bar: Quantity, Cost per unit & Subtotal */}
                      <div className="grid grid-cols-12 gap-2 pt-2 border-t border-slate-100 items-center">
                        {/* Quantity Controls */}
                        <div className="col-span-5 sm:col-span-4">
                          <label className="text-[10px] font-bold text-slate-600 block mb-0.5">
                            Cantidad (Uds)
                          </label>
                          <div className="flex items-center space-x-1">
                            {!isImmutable && (
                              <button
                                type="button"
                                onClick={() => handleUpdateItem(idx, 'quantity', Math.max(1, qty - 1))}
                                className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg flex items-center justify-center text-xs cursor-pointer"
                              >
                                -
                              </button>
                            )}
                            <input
                              type="number"
                              min="1"
                              value={it.quantity}
                              disabled={isImmutable}
                              onChange={(e) => handleUpdateItem(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                              className={`w-12 h-7 px-1 bg-slate-50 border border-slate-300 rounded-lg font-bold text-center text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white ${
                                isImmutable ? 'cursor-not-allowed bg-slate-100 text-slate-600' : ''
                              }`}
                            />
                            {!isImmutable && (
                              <button
                                type="button"
                                onClick={() => handleUpdateItem(idx, 'quantity', qty + 1)}
                                className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg flex items-center justify-center text-xs cursor-pointer"
                              >
                                +
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Unit Cost */}
                        <div className="col-span-4 sm:col-span-4">
                          <label className="text-[10px] font-bold text-slate-600 block mb-0.5">
                            Costo Unit. ($)
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={it.costPrice}
                              disabled={isImmutable}
                              onChange={(e) => handleUpdateItem(idx, 'costPrice', e.target.value)}
                              className={`w-full h-7 px-2 border rounded-lg font-mono font-bold text-xs text-right focus:outline-none ${
                                isImmutable
                                  ? 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                                  : 'bg-amber-50/60 border-amber-300/80 text-amber-900 focus:border-amber-500 focus:bg-white'
                              }`}
                            />
                          </div>
                        </div>

                        {/* Subtotal */}
                        <div className="col-span-3 sm:col-span-4 text-right">
                          <span className="text-[10px] font-bold text-slate-500 block">Subtotal</span>
                          <span className="font-mono font-black text-xs sm:text-sm text-emerald-700">
                            ${lineTotal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Notas / Guía de Proveedor</label>
            <textarea
              rows={2}
              disabled={isImmutable}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Instrucciones especiales, números de guía del proveedor o acuerdos de pago..."
              className={`w-full px-3 py-2 border rounded-xl text-xs ${
                isImmutable
                  ? 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                  : 'bg-slate-50 border-slate-200 text-slate-900 focus:outline-none focus:border-indigo-500'
              }`}
            />
          </div>
        </div>

        {/* FIXED BOTTOM PANEL: Resumen de Entrada Fijo + Botones de Acción Organizados */}
        <div className="flex-shrink-0 border-t border-slate-200 bg-white p-3.5 sm:p-4 space-y-3 shadow-lg z-10">
          {/* Panel de Resumen de Entrada Fijo en la parte inferior */}
          <div className="bg-slate-900 text-white rounded-xl p-3 sm:p-3.5 flex items-center justify-between shadow-xs">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/30 flex items-center justify-center text-indigo-300 flex-shrink-0">
                <Boxes className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Resumen de Entrada</span>
                <span className="text-xs font-bold text-slate-200">
                  {items.reduce((s, it) => s + (Number(it.quantity) || 1), 0)} unidades totales ({items.length} {items.length === 1 ? 'producto' : 'productos'})
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-300 block">
                Total Inversión de Compra
              </span>
              <span className="font-mono font-black text-base sm:text-lg text-emerald-400">
                ${totalCost.toFixed(2)} <span className="text-xs text-slate-300">{currency}</span>
              </span>
            </div>
          </div>

          {/* Botones de acción situados, alineados y organizados en la parte inferior */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-0.5">
            {/* Lado izquierdo */}
            <div className="w-full sm:w-auto flex items-center gap-2">
              {isEditing && purchase && isAutoGeneratedFromSale ? (
                <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-900 text-xs font-bold border border-amber-300">
                  <Lock className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
                  <span>Vinculada al Pedido #{purchase.linkedCustomerOrderNumber || purchase.linkedCustomerOrderId} (Ineliminable)</span>
                </span>
              ) : isEditing && purchase && (purchase.linkedCustomerOrderId || purchase.linkedCustomerOrderNumber) ? (
                <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 text-xs font-semibold border border-amber-200">
                  <Lock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                  <span>Vinculada al Pedido #{purchase.linkedCustomerOrderNumber || purchase.linkedCustomerOrderId}</span>
                </span>
              ) : isEditing && purchase && purchase.status === 'pending' && onDeleteClick ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onDeleteClick(purchase);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs cursor-pointer transition border border-rose-200/80 shadow-2xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar Orden (Borrador)</span>
                </button>
              ) : isImmutable ? (
                <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200">
                  <Lock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span>Orden Cerrada (Ineliminable)</span>
                </span>
              ) : null}
            </div>

            {/* Lado derecho */}
            <div className="w-full sm:w-auto flex items-center justify-end space-x-2">
              {isImmutable ? (
                <>
                  {purchase?.status === 'pending' && onConfirmPayment && (
                    isLinkedOrderUnconfirmed ? (
                      <button
                        type="button"
                        onClick={() => {
                          showToast(
                            `⚠️ No se puede confirmar la compra: El Pedido de Venta #${linkedCustomerOrder?.orderNumber || purchase?.linkedCustomerOrderNumber || purchase?.linkedCustomerOrderId} aún no ha sido confirmado. Confirma primero el pedido de venta.`
                          );
                        }}
                        className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs cursor-pointer transition shadow-2xs"
                        title="Venta sin confirmar"
                      >
                        <Lock className="w-3.5 h-3.5 text-amber-700" />
                        <span>Venta Sin Confirmar</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onConfirmPayment(purchase);
                        }}
                        className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-black text-xs cursor-pointer transition shadow-xs active:scale-95"
                        title="Confirmar pago a proveedor"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Confirmar Pago</span>
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs cursor-pointer transition shadow-xs"
                  >
                    Cerrar Detalle
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition"
                  >
                    Cancelar
                  </button>
                  {isLinkedOrderUnconfirmed ? (
                    <button
                      type="button"
                      onClick={() => {
                        showToast(
                          `⚠️ No se puede confirmar con pago: El Pedido de Venta #${linkedCustomerOrder?.orderNumber || purchase?.linkedCustomerOrderNumber || purchase?.linkedCustomerOrderId} aún no ha sido confirmado por el vendedor.`
                        );
                      }}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs cursor-pointer transition shadow-2xs"
                      title="Venta sin confirmar"
                    >
                      <Lock className="w-3.5 h-3.5 text-amber-700" />
                      <span>Venta Sin Confirmar</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSavePurchase(true)}
                      disabled={isSubmitting}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-black text-xs cursor-pointer transition shadow-xs disabled:opacity-50 active:scale-95"
                      title="Guarda la orden y abre el formulario para registrar los datos de pago al proveedor"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Confirmar con Pago</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer transition shadow-xs disabled:opacity-50"
                  >
                    {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Guardar Pendiente'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// SUB-COMPONENT: Modal Resumen Financiero
// ==========================================

interface FinancialSummaryModalProps {
  summary: FinancialReportSummary | null;
  period: string;
  onPeriodChange: (p: string) => void;
  loading: boolean;
  currency: string;
  onClose: () => void;
}

const FinancialSummaryModal: React.FC<FinancialSummaryModalProps> = ({
  summary,
  period,
  onPeriodChange,
  loading,
  currency,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-violet-600" />
              Estado de Resultados & Rentabilidad Real
            </h2>
            <p className="text-xs text-slate-500">
              Compara tus ingresos reales por ventas frente a los costos de compra a proveedores
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Period selector */}
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            {[
              { id: 'today', label: 'Hoy' },
              { id: 'week', label: 'Esta Semana' },
              { id: 'month', label: 'Este Mes' },
              { id: 'year', label: 'Este Año' },
              { id: 'all', label: 'Histórico Total' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => onPeriodChange(tab.id)}
                className={`flex-1 py-1.5 rounded-lg font-bold text-center transition cursor-pointer text-xs ${
                  period === tab.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs font-semibold">
              Calculando estado de resultados...
            </div>
          ) : summary ? (
            <div className="space-y-6">
              {/* Top Financial Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col justify-between min-h-[116px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">
                      Ingresos por Ventas
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
                      <DollarSign className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="text-xl sm:text-2xl font-black font-mono text-emerald-900 tracking-tight truncate">
                      ${summary.totalSalesRevenue.toFixed(2)}
                    </div>
                    <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
                      {summary.totalOrdersCount} ventas concretadas
                    </p>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col justify-between min-h-[116px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">
                      Costo Mercancía (COGS)
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0">
                      <Truck className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="text-xl sm:text-2xl font-black font-mono text-rose-900 tracking-tight truncate">
                      ${summary.costOfGoodsSold.toFixed(2)}
                    </div>
                    <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
                      Pagado a proveedores
                    </p>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col justify-between min-h-[116px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">
                      Utilidad Bruta Real
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 border border-violet-100 flex items-center justify-center shrink-0">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="text-xl sm:text-2xl font-black font-mono text-violet-900 tracking-tight truncate">
                      ${summary.grossProfit.toFixed(2)}
                    </div>
                    <p className="text-[11px] font-semibold text-violet-700 mt-0.5 truncate">
                      Margen: {summary.netProfitMarginPercent}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Physical Inventory Valuation */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Valoración de Stock Físico en Bodega
                </h3>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Unidades Físicas:</span>
                    <strong className="text-slate-900 text-sm font-mono">{summary.currentPhysicalStockUnits} unid.</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Valor a Costo (Inversión):</span>
                    <strong className="text-slate-900 text-sm font-mono">${summary.currentPhysicalStockCostValue.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Valor a Venta Estimado:</span>
                    <strong className="text-emerald-700 text-sm font-mono">${summary.currentPhysicalStockSaleValue.toFixed(2)}</strong>
                  </div>
                </div>
              </div>

              {/* Recent Ledger / Transactions */}
              {summary.recentTransactions && summary.recentTransactions.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Libro de Movimientos Recientes
                  </h3>
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                    {summary.recentTransactions.map((tx, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                        <div className="flex items-center space-x-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              tx.type === 'sale'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-rose-50 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {tx.type === 'sale' ? 'Venta' : 'Compra'}
                          </span>
                          <div>
                            <span className="font-bold text-slate-900">{tx.reference}</span>
                            <span className="text-slate-500 ml-2 text-[11px]">{tx.description}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div
                            className={`font-mono font-bold ${
                              tx.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {tx.amount >= 0 ? `+$${tx.amount.toFixed(2)}` : `-$${Math.abs(tx.amount).toFixed(2)}`}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {new Date(tx.date).toLocaleDateString('es-EC')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: Modal para Solicitar Datos y Registrar Pago a Proveedor
// =========================================================================

interface PurchaseConfirmPaymentModalProps {
  purchase: PurchaseOrder;
  currency: string;
  customerOrders?: CustomerOrder[];
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  onOpenFullPayable?: (purchase: any) => void;
  showToast: (msg: string) => void;
}

const getLocalSystemDatetimeString = (d: Date = new Date()): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const PurchaseConfirmPaymentModal: React.FC<PurchaseConfirmPaymentModalProps> = ({
  purchase,
  currency,
  customerOrders,
  authFetch,
  onClose,
  onSuccess,
  onOpenFullPayable,
  showToast,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const linkedCustomerOrder = useMemo(() => {
    return (customerOrders || []).find(
      (ord) =>
        (purchase.linkedCustomerOrderId &&
          (Number(ord.id) === Number(purchase.linkedCustomerOrderId) ||
            String(ord.id) === String(purchase.linkedCustomerOrderId))) ||
        (purchase.linkedCustomerOrderNumber &&
          ord.orderNumber &&
          ord.orderNumber.trim() === purchase.linkedCustomerOrderNumber.trim())
    );
  }, [customerOrders, purchase]);

  const isLinkedOrderConfirmed = Boolean(
    linkedCustomerOrder &&
      (linkedCustomerOrder.status === 'confirmed' ||
        linkedCustomerOrder.status === 'shipped' ||
        linkedCustomerOrder.status === 'delivered')
  );

  const isLinkedOrderUnconfirmed = Boolean(
    (Boolean(purchase.linkedCustomerOrderId || purchase.linkedCustomerOrderNumber)) &&
      !isLinkedOrderConfirmed
  );

  const initialAmount = Number(purchase.totalCost || 0).toFixed(2);
  const [amount, setAmount] = useState<string>(initialAmount);
  const [paymentMethod, setPaymentMethod] = useState<string>('transferencia_bancaria');
  const [bankOrAccount, setBankOrAccount] = useState<string>('Banco Pichincha');
  const [referenceNumber, setReferenceNumber] = useState<string>(
    purchase.receiptVoucher || `PAG-COM-${purchase.purchaseNumber}`
  );
  const [paymentDate, setPaymentDate] = useState<string>(() =>
    getLocalSystemDatetimeString(new Date())
  );
  const [notes, setNotes] = useState<string>(
    `Pago registrado al proveedor ${purchase.supplierName} por compra #${purchase.purchaseNumber}`
  );

  const handleRegisterPaymentAndConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLinkedOrderUnconfirmed) {
      showToast(
        `⚠️ No se puede confirmar la compra al proveedor: El Pedido de Venta #${linkedCustomerOrder?.orderNumber || purchase.linkedCustomerOrderNumber || purchase.linkedCustomerOrderId} aún no ha sido confirmado por el vendedor.`
      );
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('⚠️ Ingresa un monto de pago válido mayor a 0');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create ERP outflow payment
      const paymentPayload = {
        type: 'outflow',
        category: 'supplier_purchase',
        amount: numAmount,
        paymentMethod,
        bankOrAccount,
        referenceNumber: referenceNumber.trim() || `PAG-COM-${purchase.purchaseNumber}`,
        paymentDate: new Date(paymentDate).toISOString(),
        status: 'completed',
        notes: notes.trim(),
        purchaseId: purchase.id,
        purchaseNumber: purchase.purchaseNumber,
        supplierName: purchase.supplierName,
      };

      const payRes = await authFetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentPayload),
      });

      if (!payRes.ok) {
        const err = await payRes.json().catch(() => ({}));
        showToast(`❌ Error al registrar pago: ${err.error || 'No se pudo guardar el pago'}`);
        return;
      }

      // 2. Ensure purchase is marked confirmed (ordered) and paid
      const putRes = await authFetch(`/api/purchases/${purchase.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'ordered',
          paymentStatus: 'paid',
          receiptVoucher: referenceNumber.trim() || null,
          isInternalOrderSync: true,
        }),
      });

      if (!putRes.ok) {
        const putErr = await putRes.json().catch(() => ({}));
        console.warn('Warning updating purchase after payment:', putErr);
      }

      showToast(`✓ ¡Compra #${purchase.purchaseNumber} confirmada y registrada en Pago a Proveedores exitosamente!`);
      await onSuccess();
    } catch (err) {
      console.error('Error confirming purchase with payment:', err);
      showToast('❌ Error de conexión al registrar el pago al proveedor');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shadow-xs">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                Confirmar Pago
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Orden #{purchase.purchaseNumber} • {purchase.supplierName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Purchase Summary Alert */}
        <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-3 text-xs text-amber-950 flex items-center justify-between">
          <div>
            <span className="font-bold text-amber-900 block">Total de la Compra:</span>
            <span className="text-[11px] text-amber-800">
              {purchase.items?.length || 0} producto(s) cargado(s)
            </span>
          </div>
          <div className="text-right">
            <div className="font-mono font-black text-lg text-amber-950">
              ${Number(purchase.totalCost || 0).toFixed(2)}{' '}
              <span className="text-xs font-semibold text-amber-700">{currency}</span>
            </div>
          </div>
        </div>

        {/* Warning if linked sales order is not confirmed */}
        {isLinkedOrderUnconfirmed && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-950 flex items-start gap-2 shadow-2xs">
            <Lock className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold text-amber-900">
                ⚠️ Bloqueado: Pedido de Venta Sin Confirmar
              </strong>
              <p className="mt-0.5 leading-relaxed">
                Esta compra está vinculada al Pedido de Venta #{linkedCustomerOrder?.orderNumber || purchase.linkedCustomerOrderNumber || purchase.linkedCustomerOrderId}. No se puede confirmar ni registrar el pago al proveedor hasta que el vendedor confirme primero el pedido de venta.
              </p>
            </div>
          </div>
        )}

        {/* Payment Form */}
        <form onSubmit={handleRegisterPaymentAndConfirm} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Amount */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Monto a Pagar ($) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Payment Date & Time */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  Fecha y Hora del Pago *
                </label>
                <button
                  type="button"
                  onClick={() => setPaymentDate(getLocalSystemDatetimeString(new Date()))}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer"
                  title="Establecer a la fecha y hora actual del sistema"
                >
                  🕒 Hora actual
                </button>
              </div>
              <input
                type="datetime-local"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Payment Method */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Método de Pago *
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="transferencia_bancaria">🏦 Transferencia Bancaria</option>
                <option value="deuna">📱 Deuna! (Pichincha)</option>
                <option value="efectivo">💵 Efectivo</option>
                <option value="tarjeta_debito">💳 Tarjeta Débito / Crédito</option>
                <option value="deposito_bancario">📄 Depósito Bancario</option>
                <option value="cheque">📑 Cheque</option>
                <option value="otro">🔄 Otro medio</option>
              </select>
            </div>

            {/* Bank / Origin Account */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Cuenta o Caja Origen *
              </label>
              <select
                value={bankOrAccount}
                onChange={(e) => setBankOrAccount(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="Banco Pichincha">Banco Pichincha</option>
                <option value="Banco Guayaquil">Banco Guayaquil</option>
                <option value="Produbanco">Produbanco</option>
                <option value="Banco del Pacífico">Banco del Pacífico</option>
                <option value="Cooperativa JEP">Cooperativa JEP</option>
                <option value="Caja Efectivo Principal">Caja Efectivo Principal</option>
                <option value="Otra Cuenta">Otra Cuenta / Billetera</option>
              </select>
            </div>
          </div>

          {/* Reference / Voucher number */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              N° Comprobante / Referencia de Transferencia
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Ej. #09841284 o PAG-COM-1002"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Observaciones del Pago (Opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalle o referencia para tesorería..."
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition disabled:opacity-50"
            >
              Cancelar
            </button>
            {isLinkedOrderUnconfirmed ? (
              <button
                type="button"
                onClick={() => {
                  showToast(
                    `⚠️ Bloqueado: Confirma primero el Pedido de Venta #${linkedCustomerOrder?.orderNumber || purchase.linkedCustomerOrderNumber || purchase.linkedCustomerOrderId} en la sección de ventas antes de confirmar la compra.`
                  );
                }}
                className="inline-flex items-center space-x-2 px-5 py-2 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs cursor-pointer transition shadow-2xs"
                title="Venta sin confirmar"
              >
                <Lock className="w-4 h-4 text-amber-700" />
                <span>Venta Sin Confirmar</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center space-x-2 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-black text-xs cursor-pointer transition shadow-xs disabled:opacity-50 active:scale-95 text-center"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Registrando pago...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>Confirmar Pago</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

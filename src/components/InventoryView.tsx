import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Barcode,
  Bot,
  Boxes,
  Check,
  CheckCircle2,
  CheckSquare,
  Database,
  Edit,
  Eye,
  Film,
  Filter,
  Grid,
  Images,
  Layers,
  List,
  Lock,
  MessageSquare,
  Minus,
  Package,
  PackageCheck,
  PackagePlus,
  Plus,
  Power,
  RefreshCw,
  Scale,
  Search,
  Send,
  Settings,
  Sparkles,
  Square,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  X,
} from 'lucide-react';
import { CustomerOrder, InventoryItem, StoreConfig, TelegramMessage } from '../types.ts';
import { TelegramMessagesFeed } from './TelegramMessagesFeed.tsx';
import { safeLocalStorage } from '../utils/safeStorage.ts';
import { ProductMarketingCopyModal } from './ProductMarketingCopyModal.tsx';
import { ProductBarcodeModal } from './ProductBarcodeModal.tsx';
import { ProductMediaDisplay } from './ProductMediaDisplay.tsx';
import { parseVideoUrl } from '../utils/video-helper.ts';
import { checkProductTransactionLink } from '../utils/productIntegrity.ts';
import { DeactivateConfirmationModal } from './DeactivateConfirmationModal.tsx';

interface InventoryViewProps {
  items: InventoryItem[];
  messages?: TelegramMessage[];
  orders?: CustomerOrder[];
  purchases?: any[];
  storeConfig?: StoreConfig;
  onSelectItem: (item: InventoryItem) => void;
  onOpenDetailById?: (id: number) => void;
  onEditItem: (item: InventoryItem) => void;
  onDeleteItem?: (id: number) => void;
  onBulkDelete?: (items: InventoryItem[]) => void;
  onToggleStatus?: (id: number) => void;
  onBulkToggleStatus?: (items: InventoryItem[], newStatus: 'available' | 'archived') => void;
  onUpdateStock?: (id: number, currentStock: number, delta: number) => void;
  onOpenAddProduct: () => void;
  onOpenSimulator: () => void;
  onOpenConfig?: () => void;
  onManualSync?: () => void;
  isSyncing?: boolean;
  onDeleteMessage?: (id: number) => Promise<boolean>;
  onBulkDeleteMessages?: (ids: number[]) => Promise<boolean>;
  onClearAllMessages?: () => Promise<boolean>;
  currency?: string;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  selectedSupplier: string;
  setSelectedSupplier: (supplier: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  showOffersOnly?: boolean;
  setShowOffersOnly?: (v: boolean) => void;
  initialSubTab?: 'products' | 'messages';
  unseenProductIds?: Set<number>;
  unseenMessageIds?: Set<number>;
  unseenProductsCount?: number;
  unseenMessagesCount?: number;
  onMarkAllProductsAsSeen?: () => void;
  onMarkAllMessagesAsSeen?: () => void;
  onMarkAllAsSeen?: () => void;
  onMarkProductAsSeen?: (id: number) => void;
  onMarkMessageAsSeen?: (id: number) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  items,
  messages = [],
  orders = [],
  purchases = [],
  storeConfig,
  onSelectItem,
  onOpenDetailById,
  onEditItem,
  onDeleteItem,
  onBulkDelete,
  onToggleStatus,
  onBulkToggleStatus,
  onUpdateStock,
  onOpenAddProduct,
  onOpenSimulator,
  onOpenConfig,
  onManualSync,
  isSyncing = false,
  onDeleteMessage,
  onBulkDeleteMessages,
  onClearAllMessages,
  currency = 'USD',
  selectedCategory,
  setSelectedCategory,
  selectedSupplier,
  setSelectedSupplier,
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  showOffersOnly,
  setShowOffersOnly,
  initialSubTab = 'products',
  unseenProductIds,
  unseenMessageIds,
  unseenProductsCount = 0,
  unseenMessagesCount = 0,
  onMarkAllProductsAsSeen,
  onMarkAllMessagesAsSeen,
  onMarkAllAsSeen,
  onMarkProductAsSeen,
  onMarkMessageAsSeen,
}) => {
  const [subTab, setSubTab] = useState<'products' | 'messages'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = safeLocalStorage.getItem('comerxia_inventory_subtab');
        if (saved === 'products' || saved === 'messages') {
          return saved;
        }
      } catch {}
    }
    return initialSubTab;
  });

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        safeLocalStorage.setItem('comerxia_inventory_subtab', subTab);
      } catch {}
    }
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedSupplier('all');
    if (setStatusFilter) setStatusFilter('all');
    if (setShowOffersOnly) setShowOffersOnly(false);
  }, [subTab]);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = safeLocalStorage.getItem('comerxia_inventory_view_mode');
        if (saved === 'grid' || saved === 'table') {
          return saved;
        }
      } catch {}
    }
    return 'grid';
  });

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        safeLocalStorage.setItem('comerxia_inventory_view_mode', viewMode);
      } catch {}
    }
  }, [viewMode]);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showSuppliersFilter, setShowSuppliersFilter] = useState(false);
  const [marketingCopyItem, setMarketingCopyItem] = useState<InventoryItem | null>(null);
  const [barcodeItems, setBarcodeItems] = useState<InventoryItem[] | null>(null);
  const [localShowOffersOnly, setLocalShowOffersOnly] = useState(false);
  const [statusConfirmTarget, setStatusConfirmTarget] = useState<{
    mode: 'activate' | 'deactivate';
    item?: InventoryItem | null;
    bulkItems?: InventoryItem[];
  } | null>(null);
  const [isProcessingStatus, setIsProcessingStatus] = useState(false);

  // Keep marketingCopyItem in sync with items without losing newly appended images
  useEffect(() => {
    if (marketingCopyItem) {
      const fresh = items.find((it) => it.id === marketingCopyItem.id);
      if (fresh) {
        setMarketingCopyItem((prev) => {
          if (!prev) return fresh;
          const freshImages = Array.isArray(fresh.images) ? fresh.images : [];
          const prevImages = Array.isArray(prev.images) ? prev.images : [];
          const merged = [...new Set([...freshImages, ...prevImages])].filter(Boolean);
          return {
            ...fresh,
            ...prev,
            images: merged.length > 0 ? merged : (freshImages.length > 0 ? freshImages : prevImages),
            imageUrl: fresh.imageUrl || prev.imageUrl,
            extractedAttributes: fresh.extractedAttributes || prev.extractedAttributes,
          };
        });
      }
    }
  }, [items]);

  const activeShowOffersOnly = showOffersOnly !== undefined ? showOffersOnly : localShowOffersOnly;
  const setActiveShowOffersOnly = setShowOffersOnly || setLocalShowOffersOnly;

  // Extract total offers count
  const offersCount = items.filter((it) => (Number(it.discountPercent) || 0) > 0).length;

  // Extract available categories from current items
  const categoriesCount: Record<string, number> = {};
  items.forEach((it) => {
    const cat = it.category || 'General';
    categoriesCount[cat] = (categoriesCount[cat] || 0) + 1;
  });
  const categories = ['all', ...Object.keys(categoriesCount)];

  // Extract available suppliers from current items
  const suppliersCount: Record<string, number> = {};
  items.forEach((it) => {
    const sup = (it.supplierName && it.supplierName.trim()) || 'Proveedor Telegram';
    suppliersCount[sup] = (suppliersCount[sup] || 0) + 1;
  });
  const suppliers = ['all', ...Object.keys(suppliersCount)];

  // Global Stock Breakdown Aggregates (Requirement #3)
  const totalPhysicalStock = items.reduce(
    (sum, it) => sum + (it.physicalStock !== undefined ? it.physicalStock : (it.stock || 0)),
    0
  );
  const totalAvailableStock = items.reduce(
    (sum, it) => sum + (it.availableStock !== undefined ? it.availableStock : (it.stock || 0)),
    0
  );
  const totalReservedStock = items.reduce((sum, it) => sum + (it.reservedStock || 0), 0);
  const totalIncomingStock = items.reduce((sum, it) => sum + (it.incomingStock || 0), 0);

  // Filter items
  const filteredItems = items.filter((it) => {
    const matchesCategory =
      selectedCategory === 'all' || (it.category || 'General') === selectedCategory;
    const matchesSupplier =
      selectedSupplier === 'all' ||
      ((it.supplierName && it.supplierName.trim()) || 'Proveedor Telegram') === selectedSupplier;
    const disc = Math.max(0, Math.min(100, Number(it.discountPercent) || 0));
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'offers'
        ? disc > 0
        : it.status === statusFilter;
    const matchesOffer = !activeShowOffersOnly || disc > 0;
    const matchesSearch =
      !searchQuery.trim() ||
      it.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      it.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (it.barcode && it.barcode.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (it.description && it.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (it.tags && it.tags.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (it.supplierName && it.supplierName.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesSupplier && matchesStatus && matchesOffer && matchesSearch;
  });

  const hasActiveFilters =
    selectedCategory !== 'all' ||
    selectedSupplier !== 'all' ||
    statusFilter !== 'all' ||
    activeShowOffersOnly ||
    Boolean(searchQuery.trim());

  const handleResetFilters = () => {
    setSelectedCategory('all');
    setSelectedSupplier('all');
    setStatusFilter('all');
    setActiveShowOffersOnly(false);
    setSearchQuery('');
  };

  const toggleSelectOne = (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map((it) => it.id));
    }
  };

  const handleTriggerBulkActivate = () => {
    const selectedItemsList = items.filter((it) => selectedIds.includes(it.id));
    if (selectedItemsList.length > 0) {
      setStatusConfirmTarget({ mode: 'activate', bulkItems: selectedItemsList });
    }
  };

  const handleRequestToggleStatus = (item: InventoryItem) => {
    if (item.status === 'archived') {
      // Prompt confirmation before reactivating an inactive product
      setStatusConfirmTarget({ mode: 'activate', item });
    } else {
      // Prompt confirmation before deactivating an active product
      setStatusConfirmTarget({ mode: 'deactivate', item });
    }
  };

  const handleTriggerBulkDeactivate = () => {
    const selectedItemsList = items.filter((it) => selectedIds.includes(it.id));
    if (selectedItemsList.length > 0) {
      setStatusConfirmTarget({ mode: 'deactivate', bulkItems: selectedItemsList });
    }
  };

  const handleConfirmStatusChange = async () => {
    if (!statusConfirmTarget || isProcessingStatus) return;
    setIsProcessingStatus(true);
    try {
      const { mode, item, bulkItems } = statusConfirmTarget;
      const targetStatus = mode === 'activate' ? 'available' : 'archived';
      if (item && onToggleStatus) {
        await onToggleStatus(item.id);
      } else if (bulkItems && bulkItems.length > 0 && onBulkToggleStatus) {
        await onBulkToggleStatus(bulkItems, targetStatus);
        setSelectedIds([]);
      }
    } finally {
      setIsProcessingStatus(false);
      setStatusConfirmTarget(null);
    }
  };

  const getStatusBadge = (status: string, stock: number) => {
    if (status === 'archived') {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs">
          ⏸️ Inactivo
        </span>
      );
    }
    if (stock <= 0 || status === 'sold_out') {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
          🔴 Agotado
        </span>
      );
    }
    if (stock <= 5 || status === 'low_stock') {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
          🟡 Stock Bajo ({stock})
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
        🟢 Disponible ({stock})
      </span>
    );
  };

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-clip">
      {/* SubTab Navigation: Catálogo vs Mensajes Proveedor */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white border border-slate-300/90 p-2 sm:p-2.5 rounded-2xl shadow-sm">
        <div className="grid grid-cols-2 sm:flex items-center gap-1.5 sm:space-x-2 w-full sm:w-auto">
          <button
            onClick={() => setSubTab('products')}
            className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-1.5 sm:space-x-2 transition cursor-pointer ${
              subTab === 'products'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Catálogo</span>
            <span
              className={`text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full font-mono font-black ${
                subTab === 'products' ? 'bg-sky-900/80 text-sky-100' : 'bg-slate-200 text-slate-800 border border-slate-300'
              }`}
            >
              {items.length}
            </span>
            {unseenProductsCount > 0 && (
              <span
                title={`${unseenProductsCount} productos recién agregados sin ver`}
                className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-mono font-black animate-pulse shadow-xs"
              >
                +{unseenProductsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setSubTab('messages')}
            className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-1.5 sm:space-x-2 transition cursor-pointer ${
              subTab === 'messages'
                ? 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100'
            }`}
          >
            <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Mensajes</span>
            <span
              className={`text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full font-mono font-black ${
                subTab === 'messages' ? 'bg-indigo-900/80 text-indigo-100' : 'bg-slate-200 text-slate-800 border border-slate-300'
              }`}
            >
              {messages.length}
            </span>
            {unseenMessagesCount > 0 && (
              <span
                title={`${unseenMessagesCount} mensajes nuevos de proveedor sin ver`}
                className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-mono font-black animate-pulse shadow-xs"
              >
                +{unseenMessagesCount}
              </span>
            )}
          </button>
        </div>

        {/* Solo el botón de acción correspondiente a la pestaña seleccionada */}
        <div className="flex items-center w-full sm:w-auto">
          {/* Si está seleccionado Catálogo: ÚNICAMENTE Nuevo Producto */}
          {subTab === 'products' && (
            <button
              onClick={onOpenAddProduct}
              className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-black text-xs shadow-xs transition cursor-pointer active:scale-95"
              title="Agregar nuevo producto manual"
            >
              <Plus className="w-4 h-4 mr-1.5 stroke-[2.5]" />
              <span>Nuevo Producto</span>
            </button>
          )}

          {/* Si está seleccionado Mensajes Proveedor: ÚNICAMENTE Simular Mensaje Telegram */}
          {subTab === 'messages' && (
            <button
              onClick={onOpenSimulator}
              className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-black text-xs shadow-xs transition cursor-pointer active:scale-95"
              title="Abrir Simulador de Mensajes Telegram"
            >
              <Sparkles className="w-4 h-4 mr-1.5 text-sky-200 animate-pulse" />
              <span>Simular Mensaje Telegram</span>
            </button>
          )}
        </div>
      </div>

      {/* Unseen Items & Messages Banner for Administrator */}
      {(unseenProductsCount > 0 || unseenMessagesCount > 0) && (
        <div className="bg-gradient-to-r from-amber-500/20 via-sky-500/15 to-indigo-500/20 border-2 border-amber-400 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center space-x-3 text-slate-900 text-xs sm:text-sm">
            <span className="flex h-3.5 w-3.5 relative flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500"></span>
            </span>
            <div className="font-semibold text-slate-900">
              {unseenProductsCount > 0 ? (
                <span>
                  Hay <strong className="text-amber-950 font-black">{unseenProductsCount} producto(s) recién agregado(s)</strong>
                </span>
              ) : null}
              {unseenProductsCount > 0 && unseenMessagesCount > 0 ? ' y ' : ''}
              {unseenMessagesCount > 0 ? (
                <span>
                  <strong className="text-indigo-950 font-black">{unseenMessagesCount} mensaje(s) de proveedor nuevo(s)</strong>
                </span>
              ) : null}
              {' '}pendientes de revisión. Al verlos o hacer clic en marcar como vistos, el aviso del botón Inventario desaparecerá.
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {onMarkAllAsSeen && (
              <button
                type="button"
                onClick={onMarkAllAsSeen}
                className="px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-extrabold text-xs shadow-sm transition flex items-center space-x-1.5 cursor-pointer active:scale-95 border border-slate-800"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Marcar todo como visto</span>
              </button>
            )}
          </div>
        </div>
      )}

      {subTab === 'messages' ? (
        <TelegramMessagesFeed
          messages={messages}
          onSelectItem={(id) => {
            if (onOpenDetailById) {
              onOpenDetailById(id);
            } else {
              const found = items.find((it) => it.id === id);
              if (found) {
                if (onMarkProductAsSeen) onMarkProductAsSeen(found.id);
                onSelectItem(found);
              }
            }
          }}
          onOpenSimulator={onOpenSimulator}
          onDeleteMessage={onDeleteMessage || (async () => true)}
          onBulkDeleteMessages={onBulkDeleteMessages || (async () => true)}
          onClearAllMessages={onClearAllMessages || (async () => true)}
          unseenMessageIds={unseenMessageIds}
          onMarkAllMessagesAsSeen={onMarkAllMessagesAsSeen}
          onMarkMessageAsSeen={onMarkMessageAsSeen}
        />
      ) : (
        <div className="space-y-4">
          {/* Enhanced Stock Status Breakdown Panel (Requirement #3) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            {/* Físico Total en Bodega */}
            <div className="p-2.5 sm:p-3.5 rounded-2xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 text-white shadow-md shadow-sky-500/15 border border-sky-400/40 relative overflow-hidden group">
              <div className="absolute right-0 top-0 translate-x-3 -translate-y-2 opacity-15 pointer-events-none group-hover:scale-110 transition duration-300">
                <Boxes className="w-16 h-16 sm:w-20 sm:h-20" />
              </div>
              <div className="flex items-center space-x-2 sm:space-x-3 relative z-10">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white shadow-xs shrink-0 border border-white/30">
                  <Boxes className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1 sm:space-x-1.5">
                    <p className="text-[10px] font-black text-sky-100 uppercase tracking-wider truncate">Físico</p>
                    <span className="hidden xs:inline-block text-[9px] px-1.5 py-0.2 rounded-full bg-sky-900/50 text-sky-200 font-bold border border-sky-300/30 shrink-0">Almacén</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-black text-white font-mono leading-tight mt-0.5 truncate">
                    {totalPhysicalStock} <span className="text-xs font-bold text-sky-200">u.</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Disponible para Venta */}
            <div className="p-2.5 sm:p-3.5 rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-500/15 border border-emerald-400/40 relative overflow-hidden group">
              <div className="absolute right-0 top-0 translate-x-3 -translate-y-2 opacity-15 pointer-events-none group-hover:scale-110 transition duration-300">
                <PackageCheck className="w-16 h-16 sm:w-20 sm:h-20" />
              </div>
              <div className="flex items-center space-x-2 sm:space-x-3 relative z-10">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white shadow-xs shrink-0 border border-white/30">
                  <PackageCheck className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1 sm:space-x-1.5">
                    <p className="text-[10px] font-black text-emerald-100 uppercase tracking-wider truncate">Disponible</p>
                    <span className="hidden xs:inline-block text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-900/50 text-emerald-200 font-bold border border-emerald-300/30 shrink-0">Listo</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-black text-white font-mono leading-tight mt-0.5 truncate">
                    {totalAvailableStock} <span className="text-xs font-bold text-emerald-200">u.</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Reservado en Pedidos */}
            <div className="p-2.5 sm:p-3.5 rounded-2xl bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 text-white shadow-md shadow-amber-500/15 border border-amber-400/40 relative overflow-hidden group">
              <div className="absolute right-0 top-0 translate-x-3 -translate-y-2 opacity-15 pointer-events-none group-hover:scale-110 transition duration-300">
                <Lock className="w-16 h-16 sm:w-20 sm:h-20" />
              </div>
              <div className="flex items-center space-x-2 sm:space-x-3 relative z-10">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white shadow-xs shrink-0 border border-white/30">
                  <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1 sm:space-x-1.5">
                    <p className="text-[10px] font-black text-amber-100 uppercase tracking-wider truncate">Reservado</p>
                    <span className="hidden xs:inline-block text-[9px] px-1.5 py-0.2 rounded-full bg-amber-900/50 text-amber-200 font-bold border border-amber-300/30 shrink-0">Pedidos</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-black text-white font-mono leading-tight mt-0.5 truncate">
                    {totalReservedStock} <span className="text-xs font-bold text-amber-200">u.</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Por Recibir (En Tránsito) */}
            <div className="p-2.5 sm:p-3.5 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-700 text-white shadow-md shadow-indigo-500/15 border border-indigo-400/40 relative overflow-hidden group">
              <div className="absolute right-0 top-0 translate-x-3 -translate-y-2 opacity-15 pointer-events-none group-hover:scale-110 transition duration-300">
                <Truck className="w-16 h-16 sm:w-20 sm:h-20" />
              </div>
              <div className="flex items-center space-x-2 sm:space-x-3 relative z-10">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white shadow-xs shrink-0 border border-white/30">
                  <Truck className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1 sm:space-x-1.5">
                    <p className="text-[10px] font-black text-indigo-100 uppercase tracking-wider truncate">Tránsito</p>
                    <span className="hidden xs:inline-block text-[9px] px-1.5 py-0.2 rounded-full bg-indigo-900/50 text-indigo-200 font-bold border border-indigo-300/30 shrink-0">Por recibir</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-black text-white font-mono leading-tight mt-0.5 truncate">
                    +{totalIncomingStock} <span className="text-xs font-bold text-indigo-200">u.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Controls Bar: Search (Barra 1) & Filtros (Barra 2) */}
          <div id="inventory-controls-container" className="sticky top-16 z-20 bg-white/95 backdrop-blur-md border border-slate-300 rounded-2xl p-2.5 sm:p-3 shadow-sm space-y-2 max-w-full">
            {/* Barra 1: Búsqueda y Selector de Vista / Selección */}
            <div className="flex items-center gap-1.5 sm:gap-2 w-full">
              {/* Search Box */}
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, código de barras, SKU..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-8.5 sm:pl-9 pr-8 sm:pr-14 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100 focus:bg-white transition font-medium"
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

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Quick Offer Filter Toggle */}
                <button
                  onClick={() => setActiveShowOffersOnly(!activeShowOffersOnly)}
                  className={`px-2.5 py-2 rounded-xl text-xs font-bold transition border flex items-center space-x-1 cursor-pointer shadow-2xs shrink-0 ${
                    activeShowOffersOnly || statusFilter === 'offers'
                      ? 'bg-rose-600 border-rose-700 text-white shadow-xs font-black'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:text-slate-950 hover:bg-slate-100'
                  }`}
                  title="Filtrar productos con porcentaje de descuento u oferta activa"
                >
                  <Sparkles className={`w-3.5 h-3.5 shrink-0 ${activeShowOffersOnly || statusFilter === 'offers' ? 'text-amber-200 fill-amber-200' : 'text-rose-500'}`} />
                  <span className="hidden xs:inline">Ofertas</span>
                  {offersCount > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full font-black text-[10px] ${
                        activeShowOffersOnly || statusFilter === 'offers'
                          ? 'bg-rose-950 text-rose-100'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {offersCount}
                    </span>
                  )}
                </button>

                {/* Bulk Selection Toggle */}
                {filteredItems.length > 0 && (
                  <button
                    onClick={handleSelectAll}
                    className={`px-2.5 py-2 rounded-xl text-xs font-bold transition border flex items-center space-x-1 cursor-pointer shadow-2xs shrink-0 ${
                      selectedIds.length > 0
                        ? 'bg-sky-50 text-sky-900 border-sky-400'
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                    title={
                      selectedIds.length === filteredItems.length
                        ? 'Deseleccionar todos'
                        : 'Seleccionar todos'
                    }
                  >
                    {selectedIds.length === filteredItems.length && filteredItems.length > 0 ? (
                      <CheckSquare className="w-3.5 h-3.5 text-sky-600 stroke-[2.5] shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    )}
                    <span className="hidden xs:inline">
                      {selectedIds.length === filteredItems.length && filteredItems.length > 0
                        ? 'Todos'
                        : 'Sel.'}
                    </span>
                    {selectedIds.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-sky-600 text-white font-black text-[10px]">
                        {selectedIds.length}
                      </span>
                    )}
                  </button>
                )}

                {/* View Mode Toggle */}
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-300 shrink-0">
                  <button
                    onClick={() => setViewMode('grid')}
                    title="Vista en tarjetas"
                    className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                      viewMode === 'grid'
                        ? 'bg-white text-sky-700 shadow-xs font-bold'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    title="Vista en tabla compacta"
                    className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                      viewMode === 'table'
                        ? 'bg-white text-sky-700 shadow-xs font-bold'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Barra 2: Filtro horizontal continuo (deslizable con el dedo en móvil) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x py-1 w-full scroll-smooth pt-2 border-t border-slate-200/80 select-none">
              {/* Filtros de Estado */}
              <span className="text-[11px] text-slate-500 font-bold shrink-0 mr-0.5">Estado:</span>
              {['all', 'available', 'offers', 'low_stock', 'sold_out'].map((st) => (
                <button
                  key={st}
                  onClick={() => {
                    setStatusFilter(st);
                    if (st === 'offers') {
                      setActiveShowOffersOnly(true);
                    } else if (activeShowOffersOnly && st !== 'offers') {
                      setActiveShowOffersOnly(false);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition cursor-pointer flex items-center gap-1 shrink-0 whitespace-nowrap ${
                    statusFilter === st || (st === 'offers' && activeShowOffersOnly)
                      ? st === 'offers'
                        ? 'bg-rose-600 text-white shadow-xs font-black'
                        : 'bg-slate-900 text-white shadow-xs'
                      : st === 'offers'
                      ? 'text-rose-700 bg-rose-50/70 hover:bg-rose-100/70 border border-rose-200 font-black'
                      : 'text-slate-700 bg-slate-100/80 hover:bg-slate-200/80 border border-slate-200'
                  }`}
                >
                  {st === 'offers' && <Sparkles className="w-3 h-3 text-rose-400 fill-current shrink-0" />}
                  <span>
                    {st === 'all'
                      ? 'Todos'
                      : st === 'available'
                      ? 'Disponibles'
                      : st === 'offers'
                      ? `En Oferta (${offersCount})`
                      : st === 'low_stock'
                      ? 'Stock Bajo'
                      : 'Agotados'}
                  </span>
                </button>
              ))}

              {/* Separador */}
              <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />

              {/* Filtros de Categoría */}
              <span className="text-[11px] text-slate-500 font-bold flex items-center shrink-0 mr-0.5">
                <Tag className="w-3 h-3 mr-1 text-sky-600 shrink-0" />
                Categoría:
              </span>
              {categories.map((cat) => {
                const count = cat === 'all' ? items.length : categoriesCount[cat] || 0;
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center space-x-1 cursor-pointer shadow-2xs shrink-0 whitespace-nowrap ${
                      isSelected
                        ? 'bg-sky-600 text-white border border-sky-600'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                    }`}
                  >
                    <span>{cat === 'all' ? 'Todas' : cat}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                        isSelected ? 'bg-sky-900 text-sky-100' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}

              {/* Filtros de Proveedor (si existen) */}
              {suppliers.length > 1 && (
                <>
                  <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />
                  <span className="text-[11px] text-slate-500 font-bold flex items-center shrink-0 mr-0.5">
                    <Filter className="w-3 h-3 mr-1 text-purple-600 shrink-0" />
                    Proveedor:
                  </span>
                  {suppliers.map((sup) => {
                    const count = sup === 'all' ? items.length : suppliersCount[sup] || 0;
                    const isSelected = selectedSupplier === sup;
                    return (
                      <button
                        key={sup}
                        onClick={() => setSelectedSupplier(sup)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center space-x-1 cursor-pointer shadow-2xs shrink-0 whitespace-nowrap ${
                          isSelected
                            ? 'bg-purple-700 text-white border border-purple-700'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                        }`}
                      >
                        <span>{sup === 'all' ? 'Todos' : sup}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                            isSelected ? 'bg-purple-950 text-purple-100' : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </>
              )}

              {/* Botón Restablecer */}
              {hasActiveFilters && (
                <>
                  <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />
                  <button
                    onClick={handleResetFilters}
                    className="text-[11px] text-rose-800 hover:text-rose-950 font-bold px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-300 transition cursor-pointer flex items-center space-x-1 shadow-2xs shrink-0 whitespace-nowrap"
                    title="Restablecer todos los filtros"
                  >
                    <X className="w-3 h-3 shrink-0" />
                    <span>Restablecer</span>
                  </button>
                </>
              )}
            </div>
          </div>

      {/* Floating Bulk Action Bar (Activate/Deactivate or Print Barcodes) */}
      {selectedIds.length > 0 && (
        <div className="p-3 bg-sky-50 border border-sky-200 rounded-2xl shadow-md flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center space-x-3">
            <span className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {selectedIds.length}
            </span>
            <div>
              <h4 className="text-xs font-bold text-sky-950">
                {selectedIds.length === 1
                  ? '1 producto seleccionado'
                  : `${selectedIds.length} productos seleccionados`}
              </h4>
              <p className="text-[11px] text-sky-700">
                Puedes cambiar su estado de disponibilidad o imprimir sus códigos de barras en lote.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <button
              onClick={() => {
                const selectedProducts = items.filter((it) => selectedIds.includes(it.id));
                setBarcodeItems(selectedProducts);
              }}
              className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
              title="Imprimir etiquetas de código de barras para todos los productos seleccionados"
            >
              <Barcode className="w-3.5 h-3.5" />
              <span>Imprimir Códigos ({selectedIds.length})</span>
            </button>
            <button
              onClick={handleTriggerBulkActivate}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
              title="Activar productos seleccionados para la venta"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Activar ({selectedIds.length})</span>
            </button>
            <button
              onClick={handleTriggerBulkDeactivate}
              className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
              title="Desactivar productos seleccionados (ocultar de la venta)"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Desactivar ({selectedIds.length})</span>
            </button>
            {onBulkDelete && (
              <button
                onClick={() => {
                  const selectedProducts = items.filter((it) => selectedIds.includes(it.id));
                  onBulkDelete(selectedProducts);
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                title="Eliminar productos seleccionados (solo se eliminarán los que no tengan compras ni ventas vinculadas)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar ({selectedIds.length})</span>
              </button>
            )}
            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium transition cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Telegram Newly Arrived Products Highlight Announcement Banner */}
      {unseenProductIds && unseenProductIds.size > 0 && (
        <div className="mb-5 p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-400/20 to-amber-500/10 border-2 border-amber-400 text-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md shadow-amber-500/10 animate-fadeIn">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 flex items-center justify-center font-black shadow-sm flex-shrink-0 animate-bounce ring-2 ring-amber-300">
              <Sparkles className="w-5 h-5 fill-slate-950" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="text-xs font-black text-slate-950 uppercase tracking-wider">
                  ¡{unseenProductIds.size} Producto{unseenProductIds.size > 1 ? 's' : ''} Nuevo{unseenProductIds.size > 1 ? 's' : ''} de Telegram Resaltado{unseenProductIds.size > 1 ? 's' : ''}!
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] shadow-2xs border border-amber-500/30">
                  ✨ RECIÉN INGRESADO
                </span>
              </div>
              <p className="text-xs text-slate-700 font-medium mt-0.5">
                Los productos con halo dorado y etiqueta brillante acaban de ingresar por Telegram. La etiqueta se quitará automáticamente al salir o volver a abrir el inventario.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 self-end sm:self-auto flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                if (onMarkAllProductsAsSeen) onMarkAllProductsAsSeen();
                else if (onMarkAllAsSeen) onMarkAllAsSeen();
              }}
              className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black transition shadow-xs cursor-pointer active:scale-95 flex items-center space-x-1.5 border border-amber-500/40"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>Entendido / Quitar Resaltado</span>
            </button>
          </div>
        </div>
      )}

      {/* Product Content / Empty State */}
      {filteredItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center my-6 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {items.length === 0
              ? 'El inventario está vacío'
              : 'No hay productos que coincidan con la búsqueda'}
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-6">
            {items.length === 0
              ? 'Puedes simular un mensaje de tu proveedor con foto y descripción o agregar productos manualmente.'
              : 'Intenta cambiar los filtros de categoría o el término de búsqueda.'}
          </p>
          {items.length === 0 && (
            <div className="flex items-center justify-center space-x-3">
              <button
                onClick={onOpenSimulator}
                className="inline-flex items-center px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs shadow-xs transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4 mr-2 text-sky-200" />
                <span>Simular Mensaje Telegram</span>
              </button>
              <button
                onClick={onOpenAddProduct}
                className="inline-flex items-center px-4 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 text-xs font-medium transition cursor-pointer"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                <span>Agregar Manualmente</span>
              </button>
            </div>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.map((item) => {
            const cost = parseFloat(item.costPrice) || 0;
            const sale = parseFloat(item.salePrice) || 0;
            const profit = sale - cost;
            const margin = cost > 0 ? Math.round((profit / cost) * 100) : 0;
            const isSelected = selectedIds.includes(item.id);
            const isUnseen = Boolean(
              unseenProductIds && unseenProductIds.has(item.id) && item.rawTelegramMessage
            );

            const handleItemClick = () => {
              if (isUnseen && onMarkProductAsSeen) {
                onMarkProductAsSeen(item.id);
              }
              onSelectItem(item);
            };

            return (
              <div
                key={item.id}
                onClick={() => {
                  if (isUnseen && onMarkProductAsSeen) {
                    onMarkProductAsSeen(item.id);
                  }
                }}
                className={`bg-white border rounded-2xl overflow-hidden transition-all duration-300 flex flex-col justify-between group relative ${
                  isSelected
                    ? 'border-sky-500 ring-2 ring-sky-500/30 shadow-md'
                    : isUnseen
                    ? 'border-amber-400 ring-2 ring-amber-400 bg-gradient-to-b from-amber-100/40 via-amber-50/20 to-white shadow-xl shadow-amber-500/20 scale-[1.015]'
                    : 'border-slate-300 hover:border-slate-400 hover:shadow-md shadow-sm'
                }`}
              >
                {/* Top Image Preview & Badges */}
                <div>
                  <div
                    onClick={handleItemClick}
                    className="relative aspect-video w-full bg-slate-100 cursor-pointer overflow-hidden border-b border-slate-200"
                    title="Haz clic para ver detalles"
                  >
                    <ProductMediaDisplay
                      imageUrl={item.imageUrl}
                      videoUrl={item.videoUrl}
                      name={item.name}
                      className="w-full h-full relative"
                      imageClassName="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      videoClassName="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      autoPlayVideo={true}
                      showPlayBadge={true}
                      placeholderText="Sin imagen ni video"
                    />

                    {/* Selection Checkbox Pill */}
                    <button
                      type="button"
                      onClick={(e) => toggleSelectOne(item.id, e)}
                      className={`absolute top-2.5 left-2.5 z-10 w-6 h-6 rounded-lg flex items-center justify-center transition shadow-xs backdrop-blur-md cursor-pointer ${
                        isSelected
                          ? 'bg-sky-600 text-white ring-2 ring-white/80'
                          : 'bg-white/90 text-slate-800 hover:bg-white border border-slate-400'
                      }`}
                      title={isSelected ? 'Deseleccionar' : 'Seleccionar'}
                    >
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      ) : (
                        <Square className="w-3.5 h-3.5 opacity-60" />
                      )}
                    </button>

                    {/* Status badge */}
                    <div className="absolute top-2.5 left-10">
                      {getStatusBadge(item.status, item.stock)}
                    </div>

                    {/* Category & New badge */}
                    <div className="absolute top-2.5 right-2.5 flex items-center space-x-1.5 z-10">
                      {Math.max(0, Math.min(100, Number(item.discountPercent) || 0)) > 0 && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-xs animate-pulse">
                          -{item.discountPercent}% OFF
                        </span>
                      )}
                      {isUnseen && (
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300 flex items-center space-x-1 animate-pulse">
                          <Sparkles className="w-3.5 h-3.5 text-slate-950 fill-slate-950" />
                          <span>NUEVO TELEGRAM</span>
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white text-slate-800 border border-slate-300 shadow-2xs">
                        {item.category}
                      </span>
                    </div>

                    {/* Multi-photo badge if multiple photos */}
                    {item.images && item.images.length > 1 && (
                      <div className="absolute bottom-2 right-2 z-10">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-white text-purple-800 border border-purple-300 flex items-center space-x-1 shadow-xs">
                          <Images className="w-3 h-3 text-purple-600" />
                          <span>{item.images.length} fotos</span>
                        </span>
                      </div>
                    )}

                    {/* Video badge if video exists */}
                    {item.videoUrl && (
                      <div className="absolute bottom-2 left-2 z-10">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-950/90 text-sky-300 border border-sky-400/40 flex items-center space-x-1 shadow-xs backdrop-blur-xs">
                          <Film className="w-3 h-3 text-sky-400" />
                          <span>Video</span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Body Info */}
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center space-x-1.5 flex-wrap">
                        <span className="font-mono text-[11px] font-black text-sky-800 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-300" title="Código SKU">
                          {item.sku}
                        </span>
                        {item.barcode && (
                          <span className="font-mono text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-300 flex items-center space-x-1" title={`Código de barras del producto: ${item.barcode}`}>
                            <Barcode className="w-2.5 h-2.5 text-slate-500" />
                            <span className="max-w-[85px] truncate">{item.barcode}</span>
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSupplier(item.supplierName || 'Proveedor Telegram');
                        }}
                        className="text-[11px] text-slate-600 hover:text-purple-800 hover:bg-purple-50 px-2 py-0.5 rounded-lg transition truncate max-w-[130px] font-bold cursor-pointer border border-transparent hover:border-purple-200"
                        title={`Filtrar por proveedor: ${item.supplierName || 'Proveedor Telegram'}`}
                      >
                        👤 {item.supplierName || 'Proveedor Telegram'}
                      </button>
                    </div>

                    <h3
                      onClick={handleItemClick}
                      className="font-extrabold text-sm text-slate-900 line-clamp-2 hover:text-sky-600 cursor-pointer transition leading-snug"
                    >
                      {item.name}
                    </h3>

                    {/* Telegram new item indicator ribbon in card body */}
                    {isUnseen && (
                      <div className="p-2 rounded-xl bg-amber-100 border border-amber-400 text-[11px] font-black text-amber-950 flex items-center justify-between shadow-2xs">
                        <div className="flex items-center space-x-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                          <span>Ingresado por Telegram</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onMarkProductAsSeen) onMarkProductAsSeen(item.id);
                          }}
                          className="text-[10px] text-amber-900 hover:text-amber-950 font-black hover:underline cursor-pointer"
                          title="Desmarcar este producto"
                        >
                          Listo ✓
                        </button>
                      </div>
                    )}

                    {item.description && (
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed font-medium">
                        {item.description}
                      </p>
                    )}

                    {/* Pricing Block (Cost is confidential and only in Edit modal) */}
                    <div className="pt-2.5 border-t border-slate-200 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                        <div>
                          <span className="text-[10px] text-slate-500 block font-bold uppercase tracking-wider">
                            {Math.max(0, Math.min(100, Number(item.discountPercent) || 0)) > 0 ? 'Precio Oferta' : 'Precio PVP'}
                          </span>
                          {Math.max(0, Math.min(100, Number(item.discountPercent) || 0)) > 0 ? (
                            <div className="flex items-baseline space-x-1.5 mt-0.5">
                              <span className="font-black text-rose-600 text-base font-mono">
                                ${(sale * (1 - (Number(item.discountPercent) || 0) / 100)).toFixed(2)}
                              </span>
                              <span className="text-xs line-through text-slate-400 font-mono font-medium">
                                ${sale.toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <span className="font-black text-emerald-700 text-base font-mono mt-0.5 block">
                              ${sale.toFixed(2)} {currency}
                            </span>
                          )}
                        </div>

                        {Math.max(0, Math.min(100, Number(item.discountPercent) || 0)) > 0 ? (
                          <span className="px-2 py-1 rounded-lg text-[10px] font-black bg-rose-600 text-white shadow-2xs animate-pulse">
                            🔥 -{item.discountPercent}%
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Activo
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Controls: Stock Status & Actions */}
                <div className="p-2.5 sm:p-3 bg-slate-100/90 border-t border-slate-200 flex flex-col xs:flex-row xs:items-center justify-between gap-2">
                  {/* Stock indicator badges (Requirement #3) */}
                  <div
                    className="flex items-center space-x-1.5 flex-wrap gap-y-1"
                    title={`Físico: ${item.physicalStock ?? item.stock} u. | Disponible: ${item.availableStock ?? item.stock} u. | Reservado: ${item.reservedStock ?? 0} u. | Por recibir: ${item.incomingStock ?? 0} u.`}
                  >
                    {(item.physicalStock !== undefined ? item.physicalStock : item.stock) > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-950 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-lg shadow-2xs">
                        <PackageCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{item.availableStock !== undefined ? item.availableStock : item.stock} disp.</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-black text-purple-950 bg-purple-100 border border-purple-300 px-2 py-0.5 rounded-lg shadow-2xs">
                        <Package className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        <span>0 u.</span>
                      </span>
                    )}

                    {(item.reservedStock || 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-950 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded-md shadow-2xs">
                        <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>{item.reservedStock} res.</span>
                      </span>
                    )}

                    {(item.incomingStock || 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-950 bg-indigo-100 border border-indigo-300 px-1.5 py-0.5 rounded-md shadow-2xs">
                        <Truck className="w-3 h-3 text-indigo-600 shrink-0" />
                        <span>+{item.incomingStock}</span>
                      </span>
                    )}
                  </div>

                  {/* Buttons */}
                  <div className="flex items-center justify-end space-x-1 shrink-0 pt-1 xs:pt-0 border-t xs:border-t-0 border-slate-200">
                    <button
                      onClick={() => setBarcodeItems([item])}
                      title="Imprimir etiqueta de código de barras para pegar al producto"
                      className="p-1.5 rounded-lg text-sky-700 hover:text-sky-900 hover:bg-sky-100 transition cursor-pointer"
                    >
                      <Barcode className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setMarketingCopyItem(item)}
                      title="Generar publicaciones con IA para Marketplace, WhatsApp y Redes"
                      className="p-1.5 rounded-lg text-indigo-700 hover:text-indigo-900 hover:bg-indigo-100 transition cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onSelectItem(item)}
                      title="Ver detalle completo"
                      className="p-1.5 rounded-lg text-slate-600 hover:text-sky-700 hover:bg-sky-100 transition cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onEditItem(item)}
                      title="Editar producto y costos"
                      className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition cursor-pointer"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleRequestToggleStatus(item)}
                      title={item.status === 'archived' ? 'Activar producto (Disponible)' : 'Desactivar producto (Inactivo)'}
                      className={`p-1.5 rounded-lg transition cursor-pointer ${
                        item.status === 'archived'
                          ? 'text-slate-400 hover:text-emerald-700 hover:bg-emerald-50'
                          : 'text-emerald-600 hover:text-amber-700 hover:bg-amber-50'
                      }`}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    {onDeleteItem && (() => {
                      const linkCheck = checkProductTransactionLink(item, orders, purchases);
                      return linkCheck.isLinked ? (
                        <button
                          onClick={() => onDeleteItem(item.id)}
                          title={`Protegido contra eliminación (${linkCheck.reasonText}). Haz clic para ver detalles.`}
                          className="p-1.5 rounded-lg text-amber-600 hover:text-amber-800 hover:bg-amber-50 transition cursor-pointer"
                        >
                          <Lock className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => onDeleteItem(item.id)}
                          title="Eliminar producto definitivamente (sin compras ni ventas vinculadas)"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white border border-slate-300 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto touch-pan-x">
            <table className="w-full min-w-[680px] text-left text-xs text-slate-800">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                <tr>
                  <th className="p-3.5 w-10">
                    <button
                      onClick={handleSelectAll}
                      className="cursor-pointer text-slate-600 hover:text-sky-700"
                    >
                      {selectedIds.length === filteredItems.length && filteredItems.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-sky-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="p-3.5">Producto</th>
                  <th className="p-3.5">Proveedor</th>
                  <th className="p-3.5">SKU</th>
                  <th className="p-3.5">Categoría</th>
                  <th className="p-3.5">Precio Venta (PVP)</th>
                  <th className="p-3.5">Stock</th>
                  <th className="p-3.5">Estado</th>
                  <th className="p-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredItems.map((item) => {
                  const sale = parseFloat(item.salePrice) || 0;
                  const isSelected = selectedIds.includes(item.id);
                  const isUnseen = Boolean(
                    unseenProductIds && unseenProductIds.has(item.id) && item.rawTelegramMessage
                  );

                  const handleItemClick = () => {
                    if (isUnseen && onMarkProductAsSeen) {
                      onMarkProductAsSeen(item.id);
                    }
                    onSelectItem(item);
                  };

                  return (
                    <tr
                      key={item.id}
                      onClick={() => {
                        if (isUnseen && onMarkProductAsSeen) {
                          onMarkProductAsSeen(item.id);
                        }
                      }}
                      className={`transition duration-200 ${
                        isSelected
                          ? 'bg-sky-50/60'
                          : isUnseen
                          ? 'bg-amber-50/90 hover:bg-amber-100/90 border-l-4 border-l-amber-500 ring-1 ring-amber-300/80 shadow-xs'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="p-3.5">
                        <button
                          type="button"
                          onClick={(e) => toggleSelectOne(item.id, e)}
                          className="cursor-pointer text-slate-500 hover:text-sky-600"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-sky-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0 relative">
                            <ProductMediaDisplay
                              imageUrl={item.imageUrl}
                              videoUrl={item.videoUrl}
                              name={item.name}
                              className="w-full h-full relative"
                              imageClassName="w-full h-full object-cover"
                              videoClassName="w-full h-full object-cover"
                              autoPlayVideo={true}
                              showPlayBadge={false}
                              placeholderText=""
                            />
                            {item.videoUrl && !item.imageUrl && (
                              <span className="absolute bottom-0.5 right-0.5 bg-slate-950/90 text-sky-300 text-[7px] font-black px-0.5 rounded">
                                VID
                              </span>
                            )}
                            {item.images && item.images.length > 1 && (
                              <span className="absolute bottom-0.5 right-0.5 bg-white/90 text-purple-700 text-[8px] font-bold px-1 rounded shadow-2xs">
                                {item.images.length}
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span
                                onClick={handleItemClick}
                                className="font-bold text-slate-900 hover:text-sky-600 cursor-pointer block truncate max-w-[220px]"
                              >
                                {item.name}
                              </span>
                              {isUnseen && (
                                <span className="inline-flex items-center space-x-1 text-[9px] px-2 py-0.5 rounded-md font-black bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-slate-950 border border-amber-500 shadow-xs animate-pulse">
                                  <Sparkles className="w-3 h-3 text-slate-950 fill-slate-950" />
                                  <span>NUEVO TELEGRAM</span>
                                </span>
                              )}
                              {item.images && item.images.length > 1 && (
                                <span className="text-[10px] text-purple-600 font-medium">
                                  ({item.images.length} fotos)
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 block truncate max-w-[150px]">
                              {item.category}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <button
                          type="button"
                          onClick={() => setSelectedSupplier(item.supplierName || 'Proveedor Telegram')}
                          className="text-slate-700 hover:text-purple-700 font-medium block truncate max-w-[140px] text-left hover:underline cursor-pointer"
                          title={`Filtrar por proveedor: ${item.supplierName || 'Proveedor Telegram'}`}
                        >
                          👤 {item.supplierName || 'Proveedor Telegram'}
                        </button>
                      </td>
                      <td className="p-3.5 font-mono">
                        <span className="text-sky-700 font-bold block">{item.sku}</span>
                        {item.barcode && (
                          <span className="text-[10px] text-slate-500 font-normal flex items-center space-x-1 mt-0.5" title={`Código de barras: ${item.barcode}`}>
                            <Barcode className="w-2.5 h-2.5 text-slate-400" />
                            <span>{item.barcode}</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-700">{item.category}</td>
                      <td className="p-3.5">
                        {(() => {
                          const disc = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
                          if (disc > 0) {
                            const effSale = sale * (1 - disc / 100);
                            return (
                              <div>
                                <div className="flex items-baseline space-x-1">
                                  <span className="font-black text-rose-600 font-mono text-sm">
                                    ${effSale.toFixed(2)}
                                  </span>
                                  <span className="text-[10px] line-through text-slate-400 font-mono">
                                    ${sale.toFixed(2)}
                                  </span>
                                </div>
                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 border border-rose-200">
                                  -{disc}% OFF
                                </span>
                              </div>
                            );
                          }
                          return <span className="font-bold text-emerald-700 font-mono">${sale.toFixed(2)}</span>;
                        })()}
                      </td>
                      <td className="p-3.5">
                        <div
                          className="flex flex-col space-y-1 font-mono text-xs"
                          title={`Físico: ${item.physicalStock ?? item.stock} u. | Reservado: ${item.reservedStock ?? 0} u. | Disponible: ${item.availableStock ?? item.stock} u. | Por recibir: ${item.incomingStock ?? 0} u.`}
                        >
                          <div className="flex items-center space-x-1 flex-wrap gap-1">
                            {(item.physicalStock !== undefined ? item.physicalStock : item.stock) > 0 ? (
                              <span className="font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-950 border border-emerald-300 shadow-2xs text-[11px] flex items-center gap-1">
                                <PackageCheck className="w-3 h-3 text-emerald-700" />
                                <span>{item.availableStock !== undefined ? item.availableStock : item.stock} u. Disp.</span>
                              </span>
                            ) : (
                              <span className="font-black px-2 py-0.5 rounded-md bg-purple-100 text-purple-950 border border-purple-300 shadow-2xs text-[11px] flex items-center gap-1">
                                <Package className="w-3 h-3 text-purple-700" />
                                <span>0 u. Disp.</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-1.5 text-[10px] flex-wrap gap-1 pt-0.5">
                            <span className="font-bold text-sky-900 bg-sky-100 border border-sky-300 px-1.5 py-0.2 rounded" title="Stock físico total en almacén">
                              📦 {item.physicalStock !== undefined ? item.physicalStock : item.stock} fís.
                            </span>
                            {(item.reservedStock || 0) > 0 && (
                              <span className="font-bold text-amber-950 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded" title="Reservado para pedidos confirmados">
                                🔒 {item.reservedStock} res.
                              </span>
                            )}
                            {(item.incomingStock || 0) > 0 && (
                              <span className="font-bold text-indigo-950 bg-indigo-100 border border-indigo-300 px-1.5 py-0.2 rounded" title="En camino por órdenes de compra">
                                🚚 +{item.incomingStock} rec.
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3.5">{getStatusBadge(item.status, item.stock)}</td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => setBarcodeItems([item])}
                            title="Imprimir etiqueta de código de barras para pegar al producto"
                            className="p-1.5 rounded-lg text-sky-600 hover:text-sky-800 hover:bg-sky-50 transition cursor-pointer"
                          >
                            <Barcode className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setMarketingCopyItem(item)}
                            title="Generar publicaciones con IA para Marketplace, WhatsApp y Redes"
                            className="p-1.5 rounded-lg text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition cursor-pointer"
                          >
                            <Sparkles className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onSelectItem(item)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition cursor-pointer"
                            title="Ver detalle"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onEditItem(item)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                            title="Editar producto y costos"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRequestToggleStatus(item)}
                            title={item.status === 'archived' ? 'Activar producto' : 'Desactivar producto'}
                            className={`p-1.5 rounded-lg transition cursor-pointer ${
                              item.status === 'archived'
                                ? 'text-slate-400 hover:text-emerald-700 hover:bg-emerald-50'
                                : 'text-emerald-600 hover:text-amber-700 hover:bg-amber-50'
                            }`}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          {onDeleteItem && (() => {
                            const linkCheck = checkProductTransactionLink(item, orders, purchases);
                            return linkCheck.isLinked ? (
                              <button
                                onClick={() => onDeleteItem(item.id)}
                                title={`Protegido contra eliminación (${linkCheck.reasonText}). Haz clic para ver detalles.`}
                                className="p-1.5 rounded-lg text-amber-600 hover:text-amber-800 hover:bg-amber-50 transition cursor-pointer"
                              >
                                <Lock className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => onDeleteItem(item.id)}
                                title="Eliminar producto definitivamente (sin compras ni ventas vinculadas)"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </div>
      )}

      {/* Multiplatform AI Marketing Copy Modal */}
      {marketingCopyItem && (
        <ProductMarketingCopyModal
          item={marketingCopyItem}
          onClose={() => setMarketingCopyItem(null)}
          onItemUpdated={(updated) => {
            setMarketingCopyItem(updated);
            onManualSync?.();
          }}
          currency={currency}
        />
      )}

      {/* Barcode Label Printing Modal */}
      {barcodeItems && barcodeItems.length > 0 && (
        <ProductBarcodeModal
          isOpen={Boolean(barcodeItems && barcodeItems.length > 0)}
          onClose={() => setBarcodeItems(null)}
          items={barcodeItems}
          storeConfig={storeConfig}
          currency={currency}
        />
      )}

      {/* Product Status Change Confirmation Modal (Activate & Deactivate) */}
      <DeactivateConfirmationModal
        isOpen={Boolean(statusConfirmTarget)}
        mode={statusConfirmTarget?.mode || 'deactivate'}
        item={statusConfirmTarget?.item}
        bulkItems={statusConfirmTarget?.bulkItems || []}
        currency={currency}
        onClose={() => {
          if (!isProcessingStatus) {
            setStatusConfirmTarget(null);
          }
        }}
        onConfirm={handleConfirmStatusChange}
        isProcessing={isProcessingStatus}
      />
    </div>
  );
};

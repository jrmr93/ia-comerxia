import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  Search,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Phone,
  MessageCircle,
  MapPin,
  FileText,
  Mail,
  Calendar,
  DollarSign,
  Star,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  ChevronRight,
  Filter,
  Boxes,
  Package,
  CreditCard,
  Clock,
  Landmark,
  LayoutGrid,
  List,
  ArrowUpDown,
  AlertTriangle,
} from 'lucide-react';
import { Supplier, InventoryItem } from '../types.ts';
import { SupplierModal } from './SupplierModal.tsx';
import { SupplierDetailModal } from './SupplierDetailModal.tsx';
import { DeleteConfirmationModal } from './DeleteConfirmationModal.tsx';
import { normalizeEcuadorPhone, buildWhatsAppLink } from '../utils/phone.ts';
import { formatExactCurrency } from '../utils/metricFormatters.ts';

interface SuppliersViewProps {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  showToast: (message: string) => void;
  currency?: string;
  onOpenNewPurchaseForSupplier?: (supplierName: string, supplierPhone?: string) => void;
  onOpenItemDetail?: (item: InventoryItem) => void;
  onSuppliersCountChange?: (count: number) => void;
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({
  authFetch,
  showToast,
  currency = '$',
  onOpenNewPurchaseForSupplier,
  onOpenItemDetail,
  onSuppliersCountChange,
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPaymentTerms, setSelectedPaymentTerms] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [sortBy, setSortBy] = useState<'name' | 'purchases' | 'debt' | 'rating'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Fetch suppliers from API
  const fetchSuppliers = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await authFetch('/api/suppliers');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSuppliers(data);
        }
      } else {
        if (!silent) console.error('Error fetching suppliers:', res.statusText);
      }
    } catch (error) {
      if (!silent) console.error('Error fetching suppliers:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
    const interval = setInterval(() => {
      fetchSuppliers(true);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Safely notify parent about suppliers count changes in useEffect
  useEffect(() => {
    onSuppliersCountChange?.(suppliers.length);
  }, [suppliers.length, onSuppliersCountChange]);

  // Sync suppliers from purchases & inventory
  const handleSyncSuppliers = async () => {
    setIsSyncing(true);
    try {
      const res = await authFetch('/api/suppliers/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        showToast(data.message || `✓ Catálogo sincronizado: ${data.syncedCount ?? 0} proveedor(es) en inventario`);
        await fetchSuppliers();
      } else {
        showToast('❌ Error al sincronizar proveedores');
      }
    } catch (err: any) {
      showToast('❌ Error al sincronizar: ' + (err.message || 'Error de conexión'));
    } finally {
      setIsSyncing(false);
    }
  };

  // Save (Create or Update)
  const handleSaveSupplier = async (data: Partial<Supplier>): Promise<boolean> => {
    try {
      let res;
      if (editingSupplier) {
        res = await authFetch(`/api/suppliers/${editingSupplier.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      } else {
        res = await authFetch('/api/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      }

      if (res.ok) {
        const saved = await res.json();
        const displayName = saved.name || 'Proveedor';
        showToast(
          editingSupplier
            ? `✓ Proveedor "${displayName}" actualizado con éxito`
            : `✓ Proveedor "${displayName}" registrado con éxito`
        );
        fetchSuppliers();
        return true;
      } else {
        const err = await res.json();
        showToast(`❌ Error: ${err.error || 'No se pudo guardar el proveedor'}`);
        return false;
      }
    } catch (error: any) {
      showToast(`❌ Error: ${error.message || 'Error al guardar'}`);
      return false;
    }
  };

  // Delete Supplier
  const handleDeleteSupplier = async () => {
    if (!supplierToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await authFetch(`/api/suppliers/${supplierToDelete.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const displayName = supplierToDelete.name || 'Proveedor';
        showToast(`✓ Proveedor "${displayName}" eliminado correctamente`);
        setSuppliers((prev) => prev.filter((s) => s.id !== supplierToDelete.id));
        setSupplierToDelete(null);
        if (viewingSupplier?.id === supplierToDelete.id) {
          setViewingSupplier(null);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`❌ Error al eliminar proveedor: ${err.error || res.statusText}`);
      }
    } catch (error: any) {
      showToast('❌ Error al eliminar: ' + (error.message || 'Error'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Categories list for filter
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    suppliers.forEach((s) => {
      if (s.category && s.category.trim()) {
        set.add(s.category.trim());
      }
    });
    return Array.from(set).sort();
  }, [suppliers]);

  // Filtered & Sorted suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers
      .filter((s) => {
        if (selectedCategory !== 'all' && s.category !== selectedCategory) {
          return false;
        }
        if (selectedPaymentTerms !== 'all' && s.paymentTerms !== selectedPaymentTerms) {
          return false;
        }
        if (selectedStatus === 'active' && s.status !== 'active') return false;
        if (selectedStatus === 'inactive' && s.status !== 'inactive') return false;
        if (selectedStatus === 'with_debt' && (Number(s.pendingBalance) || 0) <= 0) return false;

        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const name = (s.name || '').toLowerCase();
        const trade = (s.tradeName || '').toLowerCase();
        const ruc = (s.ruc || '').toLowerCase();
        const phone = (s.phone || '').toLowerCase();
        const email = (s.email || '').toLowerCase();
        const contact = (s.contactPerson || '').toLowerCase();
        const city = (s.city || '').toLowerCase();
        const cat = (s.category || '').toLowerCase();

        return (
          name.includes(q) ||
          trade.includes(q) ||
          ruc.includes(q) ||
          phone.includes(q) ||
          email.includes(q) ||
          contact.includes(q) ||
          city.includes(q) ||
          cat.includes(q)
        );
      })
      .sort((a, b) => {
        let valA: any = 0;
        let valB: any = 0;

        if (sortBy === 'name') {
          valA = (a.name || '').toLowerCase();
          valB = (b.name || '').toLowerCase();
          return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else if (sortBy === 'purchases') {
          valA = Number(a.totalSpent) || 0;
          valB = Number(b.totalSpent) || 0;
        } else if (sortBy === 'debt') {
          valA = Number(a.pendingBalance) || 0;
          valB = Number(b.pendingBalance) || 0;
        } else if (sortBy === 'rating') {
          valA = Number(a.rating) || 5;
          valB = Number(b.rating) || 5;
        }

        return sortOrder === 'asc' ? valA - valB : valB - valA;
      });
  }, [suppliers, searchQuery, selectedCategory, selectedPaymentTerms, selectedStatus, sortBy, sortOrder]);

  // Global ERP Metrics
  const metrics = useMemo(() => {
    const total = suppliers.length;
    const activeCount = suppliers.filter((s) => s.status === 'active').length;
    const totalSpent = suppliers.reduce((acc, s) => acc + (Number(s.totalSpent) || 0), 0);
    const totalPendingDebt = suppliers.reduce((acc, s) => acc + (Number(s.pendingBalance) || 0), 0);
    const totalCreditLimit = suppliers.reduce((acc, s) => acc + (Number(s.creditLimit) || 0), 0);
    const suppliersWithDebt = suppliers.filter((s) => (Number(s.pendingBalance) || 0) > 0).length;

    const avgLeadTime = suppliers.length > 0
      ? Math.round(suppliers.reduce((acc, s) => acc + (Number(s.leadTimeDays) || 2), 0) / suppliers.length)
      : 2;

    return {
      total,
      activeCount,
      totalSpent,
      totalPendingDebt,
      totalCreditLimit,
      suppliersWithDebt,
      avgLeadTime,
    };
  }, [suppliers]);

  const handleCopySupplier = (s: Supplier) => {
    const b = s.bankInfo;
    const lines = [
      `🏢 PROVEEDOR: ${s.name}`,
      s.tradeName ? `🏷️ Alias: ${s.tradeName}` : null,
      s.ruc ? `🪪 RUC: ${s.ruc}` : null,
      `📱 Teléfono: ${s.phone}`,
      s.email ? `📧 Email: ${s.email}` : null,
      s.contactPerson ? `👤 Asesor: ${s.contactPerson}` : null,
      s.city ? `📍 Ciudad: ${s.city}` : null,
      `💳 Condición: ${s.paymentTerms || 'Contado'}`,
      b?.accountNumber ? `🏛️ Banco: ${b.bankName} - ${b.accountType} #${b.accountNumber} (${b.accountHolder || s.name})` : null,
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(lines);
    setCopiedId(s.id);
    showToast('✓ Datos del proveedor copiados');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenWhatsApp = (phone: string, _name: string) => {
    const norm = normalizeEcuadorPhone(phone);
    if (!norm.whatsappDigits || !norm.isValid) {
      showToast('⚠️ Teléfono no válido para WhatsApp');
      return;
    }
    // Directly open chat without automatic pre-filled text
    const link = buildWhatsAppLink(norm.whatsappDigits);
    window.open(link, '_blank');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              Gestión de Proveedores (ERP)
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                {suppliers.length} {suppliers.length === 1 ? 'proveedor' : 'proveedores'}
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Directorio de compras, cuentas bancarias CxP, líneas de crédito, condiciones y lead time
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            id="btn-sync-suppliers"
            onClick={handleSyncSuppliers}
            disabled={isSyncing}
            title="Sincronizar proveedores a partir de los productos que se encuentran actualmente en inventario"
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl border border-slate-200 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Catálogo'}</span>
          </button>

          <button
            id="btn-add-supplier"
            onClick={() => {
              setEditingSupplier(null);
              setIsModalOpen(true);
            }}
            className="flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-xl shadow-xs transition cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Proveedor</span>
          </button>
        </div>
      </div>

      {/* Global ERP Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Proveedores Registrados</span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 font-mono">
              {metrics.total}
            </span>
            <span className="text-[11px] font-bold text-emerald-600">
              ({metrics.activeCount} activos)
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium block mt-0.5">
            Tiempo de entrega prom: {metrics.avgLeadTime} días
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Volumen Total de Compras</span>
            <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-slate-900 font-mono">
              {formatExactCurrency(metrics.totalSpent, currency)}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium block mt-0.5">
            Acumulado histórico facturado
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Cuentas por Pagar (CxP)</span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              metrics.totalPendingDebt > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className={`text-2xl font-black font-mono ${
              metrics.totalPendingDebt > 0 ? 'text-rose-600' : 'text-slate-900'
            }`}>
              {formatExactCurrency(metrics.totalPendingDebt, currency)}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium block mt-0.5">
            {metrics.suppliersWithDebt} proveedor(es) con saldo pendiente
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Línea de Crédito Otorgada</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-slate-900 font-mono">
              {formatExactCurrency(metrics.totalCreditLimit, currency)}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium block mt-0.5">
            Cupo comercial autorizado
          </span>
        </div>
      </div>

      {/* Filter & Search Bar (Dos Barras Horizontales Estáticas) */}
      <div
        id="suppliers-search-container"
        className="sticky top-16 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-300 p-2.5 sm:p-3 shadow-sm space-y-2 transition-all max-w-full"
      >
        {/* Barra 1: Búsqueda y Modos de Visualización / Orden */}
        <div className="flex items-center gap-2 w-full">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, RUC, asesor, teléfono, correo, ciudad o categoría..."
              className="w-full pl-8.5 sm:pl-9 pr-8 sm:pr-14 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-900 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer"
                title="Limpiar búsqueda"
              >
                <span className="sm:hidden">✕</span>
                <span className="hidden sm:inline">Limpiar</span>
              </button>
            )}
          </div>

          {/* View Mode & Sorter */}
          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-9 px-2 sm:px-3 text-xs font-semibold rounded-xl border border-slate-300 bg-slate-50 text-slate-700 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="name">Nombre</option>
              <option value="purchases">Compras ($)</option>
              <option value="debt">Saldo CxP</option>
              <option value="rating">Calificación</option>
            </select>

            <button
              onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              title={`Orden ${sortOrder === 'asc' ? 'Ascendente' : 'Descendente'}`}
              className="p-2 h-9 w-9 flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer shrink-0"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>

            <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-slate-50 p-0.5 shrink-0">
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'cards' ? 'bg-white text-amber-700 shadow-2xs font-bold' : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Vista de Cuadrícula"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'table' ? 'bg-white text-amber-700 shadow-2xs font-bold' : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Vista de Tabla ERP"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            <span className="text-xs font-bold px-2 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 shrink-0 hidden md:inline-block">
              {filteredSuppliers.length} prov.
            </span>
          </div>
        </div>

        {/* Barra 2: Filtros Horizontales Continuos (Deslizables en móvil) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x py-1 w-full scroll-smooth pt-2 border-t border-slate-200/80 select-none">
          <span className="text-[11px] text-slate-500 font-bold shrink-0 mr-0.5 flex items-center gap-1">
            <Filter className="w-3 h-3 text-amber-600" />
            <span>Estado:</span>
          </span>

          {/* Status chips */}
          {[
            { id: 'all', label: 'Todos', count: suppliers.length },
            { id: 'active', label: 'Activos', count: metrics.activeCount },
            { id: 'inactive', label: 'Inactivos', count: suppliers.length - metrics.activeCount },
            { id: 'with_debt', label: 'Con Saldo CxP', count: metrics.suppliersWithDebt },
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setSelectedStatus(st.id)}
              className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer flex items-center gap-1 text-[11px] shrink-0 whitespace-nowrap ${
                selectedStatus === st.id
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <span>{st.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${selectedStatus === st.id ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {st.count}
              </span>
            </button>
          ))}

          <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />

          {/* Category Dropdown */}
          <div className="flex items-center shrink-0 gap-1">
            <span className="text-[11px] text-slate-500 font-medium shrink-0">Categoría:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-2.5 py-1 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer shrink-0"
            >
              <option value="all">Todas ({categoriesList.length})</option>
              {categoriesList.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />

          {/* Payment Terms Dropdown */}
          <div className="flex items-center shrink-0 gap-1">
            <span className="text-[11px] text-slate-500 font-medium shrink-0">Condición:</span>
            <select
              value={selectedPaymentTerms}
              onChange={(e) => setSelectedPaymentTerms(e.target.value)}
              className="px-2.5 py-1 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer shrink-0"
            >
              <option value="all">Todas las Condiciones</option>
              <option value="contado">Contado</option>
              <option value="contra_entrega">Contra Entrega</option>
              <option value="credito_15">Crédito 15 Días</option>
              <option value="credito_30">Crédito 30 Días</option>
              <option value="credito_60">Crédito 60 Días</option>
              <option value="consignacion">Consignación</option>
            </select>
          </div>

          {/* Restablecer Filtros */}
          {(selectedCategory !== 'all' || selectedPaymentTerms !== 'all' || selectedStatus !== 'all' || searchQuery) && (
            <>
              <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setSelectedPaymentTerms('all');
                  setSelectedStatus('all');
                  setSearchQuery('');
                }}
                className="text-[11px] text-rose-800 hover:text-rose-950 font-bold px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-300 transition cursor-pointer flex items-center space-x-1 shadow-2xs shrink-0 whitespace-nowrap"
                title="Restablecer filtros de proveedores"
              >
                <span>✕</span>
                <span>Restablecer</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content: Grid vs Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mb-3" />
          <span className="text-xs font-bold text-slate-600">Cargando directorio de proveedores...</span>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white rounded-2xl border-2 border-dashed border-slate-200">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No se encontraron proveedores</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
            {searchQuery || selectedCategory !== 'all' || selectedStatus !== 'all'
              ? 'No hay registros que coincidan con los filtros seleccionados.'
              : 'Empieza registrando a tus proveedores o sincronízalos automáticamente desde las compras registradas.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleSyncSuppliers}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Sincronizar Compras
            </button>
            <button
              onClick={() => {
                setEditingSupplier(null);
                setIsModalOpen(true);
              }}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
            >
              + Registrar Primer Proveedor
            </button>
          </div>
        </div>
      ) : viewMode === 'cards' ? (
        /* CARDS GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((supplier) => {
            const hasDebt = (Number(supplier.pendingBalance) || 0) > 0;
            const b = supplier.bankInfo;

            return (
              <div
                key={supplier.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-amber-300 transition-all shadow-2xs hover:shadow-md flex flex-col justify-between overflow-hidden group"
              >
                {/* Card Top */}
                <div className="p-5 space-y-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase border border-slate-200">
                          {supplier.category || 'General'}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          supplier.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {supplier.status === 'active' ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>

                      <h3
                        onClick={() => setViewingSupplier(supplier)}
                        className="text-base font-extrabold text-slate-900 tracking-tight mt-1 truncate hover:text-amber-600 transition cursor-pointer"
                        title={supplier.name}
                      >
                        {supplier.name}
                      </h3>

                      {supplier.tradeName && (
                        <p className="text-xs text-slate-500 font-medium truncate">
                          {supplier.tradeName}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      <span className="text-xs font-black text-amber-800 font-mono">
                        {supplier.rating || 5}
                      </span>
                    </div>
                  </div>

                  {/* Contact & Fiscal details */}
                  <div className="space-y-1.5 text-xs text-slate-600 font-medium">
                    {supplier.ruc && (
                      <div className="flex items-center gap-2 font-mono text-slate-700">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>RUC: {supplier.ruc}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-mono truncate">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{supplier.phone}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenWhatsApp(supplier.phone, supplier.name)}
                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md transition cursor-pointer"
                        title="Enviar WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    </div>

                    {supplier.contactPerson && (
                      <div className="flex items-center gap-2 truncate text-slate-500">
                        <span className="text-[11px] font-bold text-slate-400">Asesor:</span>
                        <span className="truncate">{supplier.contactPerson}</span>
                      </div>
                    )}

                    {supplier.city && (
                      <div className="flex items-center gap-2 text-slate-500">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{supplier.city}, {supplier.country || 'Ecuador'}</span>
                      </div>
                    )}
                  </div>

                  {/* Financial & ERP Metrics Bar */}
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 bg-slate-50/70 p-2.5 rounded-xl text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Compras</span>
                      <span className="text-xs font-black text-slate-800 font-mono">
                        {formatExactCurrency(Number(supplier.totalSpent) || 0, currency)}
                      </span>
                      <span className="text-[10px] text-slate-400 block font-medium">
                        {supplier.totalPurchases || 0} órdenes
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Saldo CxP</span>
                      <span className={`text-xs font-black font-mono ${
                        hasDebt ? 'text-rose-600' : 'text-emerald-700'
                      }`}>
                        {formatExactCurrency(Number(supplier.pendingBalance) || 0, currency)}
                      </span>
                      <span className="text-[10px] text-slate-400 block font-medium uppercase truncate">
                        {supplier.paymentTerms?.replace('_', ' ') || 'Contado'}
                      </span>
                    </div>
                  </div>

                  {/* Bank Account pill if available */}
                  {b?.accountNumber && (
                    <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50/50 border border-amber-100 text-[11px] text-amber-900 font-mono">
                      <div className="flex items-center gap-1.5 truncate">
                        <Landmark className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="font-sans font-semibold truncate">{b.bankName}:</span>
                        <span>#{b.accountNumber}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopySupplier(supplier)}
                        className="p-1 hover:bg-amber-100 rounded text-amber-700 transition cursor-pointer"
                        title="Copiar datos"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setViewingSupplier(supplier)}
                    className="text-xs font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1 transition cursor-pointer"
                  >
                    <span>Ver Ficha ERP</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1.5">
                    {onOpenNewPurchaseForSupplier && (
                      <button
                        type="button"
                        onClick={() => onOpenNewPurchaseForSupplier(supplier.name, supplier.phone)}
                        className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg text-xs font-bold transition cursor-pointer"
                        title="Crear Orden de Compra"
                      >
                        <Boxes className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setEditingSupplier(supplier);
                        setIsModalOpen(true);
                      }}
                      className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg text-xs font-bold transition cursor-pointer"
                      title="Editar Proveedor"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setSupplierToDelete(supplier)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold transition cursor-pointer"
                      title="Eliminar Proveedor"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW (ERP DENSE) */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Proveedor / Razón Social</th>
                  <th className="py-3.5 px-4">RUC / Fiscal</th>
                  <th className="py-3.5 px-4">Contacto & Teléfono</th>
                  <th className="py-3.5 px-4">Categoría</th>
                  <th className="py-3.5 px-4">Condición Pago</th>
                  <th className="py-3.5 px-4 text-right">Compras Acumuladas</th>
                  <th className="py-3.5 px-4 text-right">Saldo Deudor (CxP)</th>
                  <th className="py-3.5 px-4 text-center">Estado</th>
                  <th className="py-3.5 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSuppliers.map((supplier) => {
                  const hasDebt = (Number(supplier.pendingBalance) || 0) > 0;
                  return (
                    <tr
                      key={supplier.id}
                      className="hover:bg-amber-50/30 transition cursor-pointer"
                      onClick={() => setViewingSupplier(supplier)}
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-xs">
                          {supplier.name}
                        </div>
                        {supplier.tradeName && (
                          <div className="text-[11px] text-slate-400 font-medium">
                            {supplier.tradeName}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-700 text-xs">
                        {supplier.ruc || '—'}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-slate-800">
                          <span>{supplier.phone}</span>
                        </div>
                        {supplier.contactPerson && (
                          <div className="text-[11px] text-slate-400">
                            {supplier.contactPerson}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          {supplier.category || 'General'}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-medium uppercase text-[11px] text-slate-600">
                        {supplier.paymentTerms?.replace('_', ' ') || 'Contado'}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatExactCurrency(Number(supplier.totalSpent) || 0, currency)}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-black">
                        <span className={hasDebt ? 'text-rose-600' : 'text-emerald-600'}>
                          {formatExactCurrency(Number(supplier.pendingBalance) || 0, currency)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          supplier.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {supplier.status === 'active' ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenWhatsApp(supplier.phone, supplier.name)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                            title="WhatsApp"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingSupplier(supplier);
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setSupplierToDelete(supplier)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Supplier Modal (Create / Edit) */}
      <SupplierModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingSupplier(null);
        }}
        onSave={handleSaveSupplier}
        supplier={editingSupplier}
        existingSuppliers={suppliers}
      />

      {/* Supplier Detail Dossier Modal */}
      <SupplierDetailModal
        isOpen={Boolean(viewingSupplier)}
        onClose={() => setViewingSupplier(null)}
        supplier={viewingSupplier}
        onEdit={(s) => {
          setViewingSupplier(null);
          setEditingSupplier(s);
          setIsModalOpen(true);
        }}
        onDelete={(s) => {
          setSupplierToDelete(s);
        }}
        onNewPurchaseForSupplier={onOpenNewPurchaseForSupplier}
        onOpenItemDetail={onOpenItemDetail}
        currency={currency}
        showToast={showToast}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={Boolean(supplierToDelete)}
        onClose={() => setSupplierToDelete(null)}
        onConfirm={handleDeleteSupplier}
        isDeleting={isDeleting}
        title="¿Eliminar Proveedor?"
        message={`¿Estás seguro de eliminar al proveedor "${supplierToDelete?.name}"? Esta acción no se puede deshacer.`}
      />
    </div>
  );
};

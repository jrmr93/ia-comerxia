import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Phone,
  MessageCircle,
  MapPin,
  FileText,
  Building2,
  Mail,
  Calendar,
  ShoppingBag,
  DollarSign,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Filter,
  Home,
  Truck,
  X,
} from 'lucide-react';
import { Customer } from '../types.ts';
import { CustomerModal } from './CustomerModal.tsx';
import { DeleteConfirmationModal } from './DeleteConfirmationModal.tsx';
import { normalizeEcuadorPhone, buildWhatsAppLink } from '../utils/phone.ts';
import {
  formatExactCurrency,
  formatSmartCurrency,
  getMetricFontSizeClass,
} from '../utils/metricFormatters.ts';
import { isConcatenatedShippingAddress, parseCustomerShippingData } from '../utils/orderUtils.ts';

interface CustomersViewProps {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  showToast: (message: string) => void;
  currency?: string;
  onOpenStoreOrders?: () => void;
  onCustomersCountChange?: (count: number) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  authFetch,
  showToast,
  currency = '$',
  onOpenStoreOrders,
  onCustomersCountChange,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProvince, setSelectedProvince] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Fetch customers from API
  const fetchCustomers = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await authFetch('/api/customers');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setCustomers(data);
        }
      } else {
        if (!silent) console.error('Error fetching customers:', res.statusText);
      }
    } catch (error) {
      if (!silent) console.error('Error fetching customers:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
    const interval = setInterval(() => {
      fetchCustomers(true);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Safely notify parent about customers count changes in useEffect
  useEffect(() => {
    onCustomersCountChange?.(customers.length);
  }, [customers.length, onCustomersCountChange]);

  // Sync customers from orders history
  const handleSyncOrders = async () => {
    setIsSyncing(true);
    try {
      const res = await authFetch('/api/customers/sync-orders', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        showToast(`✓ Sincronización completa: ${data.syncedCount || 0} clientes registrados`);
        await fetchCustomers();
      } else {
        showToast('❌ Error al sincronizar clientes desde pedidos');
      }
    } catch (err: any) {
      showToast('❌ Error al sincronizar: ' + (err.message || 'Error de conexión'));
    } finally {
      setIsSyncing(false);
    }
  };

  // Save (Create or Update)
  const handleSaveCustomer = async (data: Partial<Customer>): Promise<boolean> => {
    try {
      let res;
      if (editingCustomer) {
        res = await authFetch(`/api/customers/${editingCustomer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      } else {
        res = await authFetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      }

      if (res.ok) {
        const saved = await res.json();
        const displayName = saved.fullName || saved.name || 'Cliente';
        if (saved.alreadyExisted) {
          showToast(`✓ Cliente con cédula ${saved.ci || ''} ya existía: datos actualizados sin duplicar`);
        } else {
          showToast(
            editingCustomer
              ? `✓ Cliente "${displayName}" modificado con éxito`
              : `✓ Cliente "${displayName}" registrado con éxito`
          );
        }
        fetchCustomers();
        return true;
      } else {
        const err = await res.json();
        showToast(`❌ Error: ${err.error || 'No se pudo guardar el cliente'}`);
        return false;
      }
    } catch (error: any) {
      showToast(`❌ Error: ${error.message || 'Error al guardar'}`);
      return false;
    }
  };

  // Delete Customer
  const handleDeleteCustomer = async () => {
    if (!customerToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await authFetch(`/api/customers/${customerToDelete.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const displayName = customerToDelete.fullName || customerToDelete.name || 'Cliente';
        showToast(`✓ Cliente "${displayName}" eliminado correctamente`);
        setCustomers((prev) => prev.filter((c) => c.id !== customerToDelete.id));
        setCustomerToDelete(null);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`❌ Error al eliminar cliente: ${err.error || res.statusText}`);
      }
    } catch (error: any) {
      showToast('❌ Error al eliminar: ' + (error.message || 'Error'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Deduplicate customers by ID defensively
  const uniqueCustomers = useMemo(() => {
    const seen = new Set<string | number>();
    return customers.filter((c, idx) => {
      const key = c.id !== undefined && c.id !== null ? c.id : `idx-${idx}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [customers]);

  // Provinces list for filter
  const provincesList = useMemo(() => {
    const set = new Set<string>();
    uniqueCustomers.forEach((c) => {
      if (c.province && c.province.trim()) {
        set.add(c.province.trim());
      }
    });
    return Array.from(set).sort();
  }, [uniqueCustomers]);

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    return uniqueCustomers.filter((c) => {
      if (selectedProvince !== 'all' && c.province !== selectedProvince) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const name = (c.fullName || c.name || '').toLowerCase();
      const clientAddr = (c.address || '').toLowerCase();
      const shipAddr = (c.fullAddress || c.exactAddress || '').toLowerCase();
      return (
        name.includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.ci && c.ci.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.province && c.province.toLowerCase().includes(q)) ||
        (c.canton && c.canton.toLowerCase().includes(q)) ||
        (c.parish && c.parish.toLowerCase().includes(q)) ||
        clientAddr.includes(q) ||
        shipAddr.includes(q) ||
        (c.reference && c.reference.toLowerCase().includes(q))
      );
    });
  }, [uniqueCustomers, searchQuery, selectedProvince]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = uniqueCustomers.length;
    const withCi = uniqueCustomers.filter((c) => c.ci && c.ci.trim().length > 0).length;
    const withAddress = uniqueCustomers.filter(
      (c) =>
        (c.fullAddress && c.fullAddress.trim().length > 0) ||
        (c.address && c.address.trim().length > 0) ||
        (c.province && c.province.trim().length > 0)
    ).length;
    const totalOrders = uniqueCustomers.reduce((acc, c) => acc + (Number(c.totalOrders) || 0), 0);
    const totalSpent = uniqueCustomers.reduce((acc, c) => acc + (Number(c.totalSpent) || 0), 0);

    return { total, withCi, withAddress, totalOrders, totalSpent };
  }, [uniqueCustomers]);

  const handleCopyCustomer = (c: Customer) => {
    const displayName = c.fullName || c.name || 'Cliente';
    const shipAddr = c.fullAddress || c.exactAddress;
    const lines = [
      `👤 Cliente: ${displayName}`,
      `📱 Teléfono: ${c.phone}`,
      c.ci ? `🪪 Cédula/RUC: ${c.ci}` : null,
      c.email ? `📧 Email: ${c.email}` : null,
      c.address ? `🏠 Dirección Cliente (Domicilio/Fiscal): ${c.address}` : null,
      c.province ? `🏛️ Provincia Envío: ${c.province}` : null,
      c.canton ? `🏙️ Cantón Envío: ${c.canton}` : null,
      c.parish ? `📍 Parroquia Envío: ${c.parish}` : null,
      shipAddr ? `📦 Destino de Envío: ${shipAddr}` : null,
      c.reference ? `📌 Referencia Envío: ${c.reference}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(lines);
    setCopiedId(c.id);
    showToast('✓ Datos del cliente copiados');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenWhatsApp = (phone: string, name: string) => {
    const norm = normalizeEcuadorPhone(phone);
    if (!norm.whatsappDigits || !norm.isValid) {
      showToast('⚠️ Teléfono no válido para WhatsApp');
      return;
    }
    const msg = `¡Hola *${name || 'estimado/a'}*! 👋 Te saludamos de nuestra tienda. ¿En qué podemos ayudarte el día de hoy?`;
    const link = buildWhatsAppLink(norm.whatsappDigits, msg);
    window.open(link, '_blank');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              Gestión de Clientes
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                {customers.length} {customers.length === 1 ? 'cliente' : 'clientes'}
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Directorio centralizado con datos completos de envío, cédula y pedidos confirmados
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            id="btn-sync-customers"
            onClick={handleSyncOrders}
            disabled={isSyncing}
            title="Sincronizar clientes desde pedidos confirmados que cuenten con cédula"
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl border border-slate-200 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Pedidos'}</span>
          </button>

          <button
            id="btn-add-customer"
            onClick={() => {
              setEditingCustomer(null);
              setIsModalOpen(true);
            }}
            className="flex items-center space-x-2 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 active:scale-98 rounded-xl shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="bg-white border border-slate-200 hover:border-sky-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between min-h-[116px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate" title="Total Clientes">
              Total Clientes
            </span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 tracking-tight truncate">
              {metrics.total}
              <span className="text-xs font-semibold text-slate-400 ml-1">registrados</span>
            </div>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
              {metrics.withCi} con cédula / {metrics.withAddress} con dirección
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 hover:border-amber-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between min-h-[116px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate" title="Total Pedidos Generados">
              Pedidos de Clientes
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 tracking-tight whitespace-nowrap">
              {metrics.totalOrders}
              <span className="text-xs font-semibold text-slate-400 ml-1">pedidos</span>
            </div>
            <p
              className="text-[11px] font-medium text-slate-500 mt-0.5 truncate"
              title={`Total exacto: ${formatExactCurrency(metrics.totalSpent, currency)}`}
            >
              Total en compras: {formatSmartCurrency(metrics.totalSpent, currency)}
            </p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar (Dos Barras Horizontales Estáticas) */}
      <div
        id="customers-search-container"
        className="sticky top-16 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-300 p-2.5 sm:p-3 shadow-sm space-y-2 transition-all max-w-full"
      >
        {/* Barra 1: Búsqueda */}
        <div className="flex items-center gap-2 w-full">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, teléfono, CI, ciudad, dirección de envío..."
              className="w-full pl-8.5 sm:pl-9 pr-8 sm:pr-14 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition font-medium text-slate-900 placeholder:text-slate-400"
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

          <span className="text-xs font-bold px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
            {filteredCustomers.length} {filteredCustomers.length === 1 ? 'cliente' : 'clientes'}
          </span>
        </div>

        {/* Barra 2: Filtro horizontal continuo (deslizable con el dedo en móvil) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x py-1 w-full scroll-smooth pt-2 border-t border-slate-200/80 select-none">
          <span className="text-[11px] text-slate-500 font-bold shrink-0 mr-0.5 flex items-center gap-1">
            <Filter className="w-3 h-3 text-sky-600" />
            <span>Provincia:</span>
          </span>

          <button
            onClick={() => setSelectedProvince('all')}
            className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer flex items-center gap-1 text-[11px] shrink-0 whitespace-nowrap ${
              selectedProvince === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            <span>Todas</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${selectedProvince === 'all' ? 'bg-sky-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
              {uniqueCustomers.length}
            </span>
          </button>

          {provincesList.map((prov) => {
            const count = uniqueCustomers.filter((c) => c.province === prov).length;
            const isSelected = selectedProvince === prov;
            return (
              <button
                key={prov}
                onClick={() => setSelectedProvince(prov)}
                className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer flex items-center gap-1 text-[11px] shrink-0 whitespace-nowrap ${
                  isSelected
                    ? 'bg-sky-600 text-white shadow-2xs'
                    : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <span>{prov}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${isSelected ? 'bg-sky-800 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {count}
                </span>
              </button>
            );
          })}

          {provincesList.length > 4 && (
            <>
              <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />
              <div className="flex items-center shrink-0">
                <select
                  value={selectedProvince}
                  onChange={(e) => setSelectedProvince(e.target.value)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500 cursor-pointer shrink-0"
                >
                  <option value="all">Selector completo ({provincesList.length})</option>
                  {provincesList.map((prov) => (
                    <option key={prov} value={prov}>
                      {prov}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Botón Restablecer */}
          {(selectedProvince !== 'all' || searchQuery) && (
            <>
              <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />
              <button
                type="button"
                onClick={() => {
                  setSelectedProvince('all');
                  setSearchQuery('');
                }}
                className="text-[11px] text-rose-800 hover:text-rose-950 font-bold px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-300 transition cursor-pointer flex items-center space-x-1 shadow-2xs shrink-0 whitespace-nowrap"
                title="Restablecer filtros de clientes"
              >
                <X className="w-3 h-3 shrink-0" />
                <span>Restablecer</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Customers List Table / Cards */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <RefreshCw className="w-8 h-8 text-sky-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">Cargando directorio de clientes...</p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-3.5">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">
            {searchQuery ? 'No se encontraron clientes' : 'No hay clientes registrados aún'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-5">
            {searchQuery
              ? 'Intenta con otro término de búsqueda o limpia el filtro'
              : 'Los clientes se guardan automáticamente al confirmar pedidos, o puedes registrarlos o sincronizarlos manualmente.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Limpiar Búsqueda
              </button>
            )}
            <button
              onClick={handleSyncOrders}
              className="px-4 py-2 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition cursor-pointer"
            >
              Sincronizar desde Pedidos
            </button>
            <button
              onClick={() => {
                setEditingCustomer(null);
                setIsModalOpen(true);
              }}
              className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs transition cursor-pointer"
            >
              Registrar Primer Cliente
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Contacto</th>
                  <th className="py-3 px-4">Correo</th>
                  <th className="py-3 px-4">Dirección Cliente (Domicilio/Fiscal)</th>
                  <th className="py-3 px-4">Destino de Envío (Entrega Física)</th>
                  <th className="py-3 px-4 text-center" title="Solo pedidos confirmados o entregados actualmente registrados">
                    Pedidos Confirmados
                  </th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredCustomers.map((c, idx) => {
                  const phoneNorm = normalizeEcuadorPhone(c.phone);
                  const displayName = c.fullName || c.name || 'Cliente';
                  const rawAddress = (c.address || '').trim();
                  const clientAddress = isConcatenatedShippingAddress(rawAddress)
                    ? (parseCustomerShippingData(rawAddress).exactAddress || '')
                    : rawAddress;
                  const shippingDestination = c.fullAddress || c.exactAddress || '';
                  const initials = (displayName || 'CL')
                    .split(' ')
                    .filter(Boolean)
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <tr
                      key={`customer-${c.id ?? idx}`}
                      className="hover:bg-slate-50/60 transition group"
                    >
                      {/* Cliente Name & CI */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500/10 to-indigo-500/10 text-sky-700 font-extrabold flex items-center justify-center text-xs border border-sky-200/60 shrink-0">
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 group-hover:text-sky-700 transition">
                              {displayName}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {c.ci ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-mono font-semibold border border-indigo-200/60">
                                  <ShieldCheck className="w-2.5 h-2.5" />
                                  CI: {c.ci}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">Sin CI</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Phone & WhatsApp */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-slate-800">
                              {phoneNorm.formattedLocal || phoneNorm.local || c.phone}
                            </span>
                            <button
                              onClick={() => handleCopyCustomer(c)}
                              title="Copiar datos completos"
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition cursor-pointer"
                            >
                              {copiedId === c.id ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <button
                            onClick={() => handleOpenWhatsApp(c.phone, displayName)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-200 transition cursor-pointer"
                          >
                            <MessageCircle className="w-3 h-3 text-emerald-600" />
                            <span>WhatsApp</span>
                          </button>
                        </div>
                      </td>

                      {/* Correo Electrónico (Dedicated Column) */}
                      <td className="py-3.5 px-4">
                        {c.email && c.email.trim() ? (
                          <div className="flex items-center gap-2 max-w-[220px]">
                            <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 border border-sky-100">
                              <Mail className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <a
                                href={`mailto:${c.email}`}
                                className="text-xs font-semibold text-slate-800 hover:text-sky-700 hover:underline truncate block"
                                title={`Enviar correo a ${c.email}`}
                              >
                                {c.email}
                              </a>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-400 text-xs italic">
                            <Mail className="w-3 h-3 text-slate-300" />
                            <span>Sin correo</span>
                          </div>
                        )}
                      </td>

                      {/* Dirección del Cliente (Domicilio / Fiscal) */}
                      <td className="py-3.5 px-4 max-w-xs">
                        {clientAddress && clientAddress.trim() ? (
                          <div className="flex items-start gap-1.5">
                            <Home className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <p className="text-slate-800 text-xs font-medium line-clamp-2" title={clientAddress}>
                              {clientAddress}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Sin registrar</span>
                        )}
                      </td>

                      {/* Destino de Envío (Entrega Física) */}
                      <td className="py-3.5 px-4 max-w-xs">
                        {(shippingDestination || c.province || c.canton) ? (
                          <div className="space-y-1">
                            {(c.province || c.canton) && (
                              <div className="font-semibold text-slate-900 flex items-center gap-1 text-[11px]">
                                <MapPin className="w-3 h-3 text-sky-600 shrink-0" />
                                <span>
                                  {c.province || 'Ecuador'}
                                  {c.canton ? ` - ${c.canton}` : ''}
                                </span>
                              </div>
                            )}
                            {shippingDestination ? (
                              <div className="flex items-start gap-1.5">
                                <Truck className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                                <p className="text-slate-800 text-xs font-medium line-clamp-2" title={shippingDestination}>
                                  {shippingDestination}
                                </p>
                              </div>
                            ) : null}
                            {c.reference && (
                              <p className="text-[10px] text-slate-500 italic line-clamp-1 pl-5" title={c.reference}>
                                Ref: {c.reference}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Sin destino de envío</span>
                        )}
                      </td>

                      {/* Orders & Total Spent (Confirmed/Delivered only) */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span
                            className={`font-mono font-bold px-2 py-0.5 rounded-md text-xs ${
                              (c.totalOrders || 0) > 0
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                            title="Total de pedidos confirmados o entregados actualmente registrados"
                          >
                            {c.totalOrders || 0} {(c.totalOrders || 0) === 1 ? 'pedido' : 'pedidos'}
                          </span>
                          <span
                            className={`text-[11px] font-mono font-bold mt-0.5 ${
                              Number(c.totalSpent) > 0 ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                            title="Valor total facturado en pedidos confirmados o entregados"
                          >
                            ${Number(c.totalSpent || 0).toFixed(2)}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            id={`btn-edit-customer-${c.id}`}
                            onClick={() => {
                              setEditingCustomer(c);
                              setIsModalOpen(true);
                            }}
                            title="Modificar datos del cliente"
                            className="p-1.5 text-slate-500 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            id={`btn-delete-customer-${c.id}`}
                            onClick={() => setCustomerToDelete(c)}
                            title="Eliminar cliente"
                            className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
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

      {/* Customer Modal (Create / Edit) */}
      <CustomerModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCustomer(null);
        }}
        onSave={handleSaveCustomer}
        customer={editingCustomer}
        existingCustomers={customers}
      />

      {/* Delete Confirmation Modal */}
      {customerToDelete && (
        <DeleteConfirmationModal
          isOpen={Boolean(customerToDelete)}
          title="¿Eliminar cliente?"
          message={`¿Estás seguro de que deseas eliminar permanentemente a "${customerToDelete.fullName || customerToDelete.name || 'este cliente'}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar Cliente"
          isDeleting={isDeleting}
          onClose={() => {
            if (!isDeleting) setCustomerToDelete(null);
          }}
          onConfirm={handleDeleteCustomer}
        />
      )}
    </div>
  );
};

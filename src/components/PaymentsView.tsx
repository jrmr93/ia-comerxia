import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Printer,
  Trash2,
  Edit3,
  ExternalLink,
  Receipt,
  X,
  FileText,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Filter,
  BarChart3,
  RefreshCw,
  Sparkles,
  Loader2,
  Calendar,
  Eye,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Building2,
  Ban,
  ShieldCheck,
  Check,
  PackageCheck,
  Boxes,
  Users,
  Copy,
  Sliders,
} from 'lucide-react';
import { PaymentRecord, AccountsReceivableItem, AccountsPayableItem, TreasurySummary, CustomerOrder, StoreConfig } from '../types.ts';
import {
  formatExactCurrency,
  formatSmartCurrency,
  getMetricFontSizeClass,
} from '../utils/metricFormatters.ts';
import { deriveBankOrAccountFromMethod } from '../utils/orderUtils.ts';

interface PaymentsViewProps {
  currency?: string;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  showToast: (msg: string) => void;
  orders?: CustomerOrder[];
  purchases?: any[];
  storeConfig?: StoreConfig;
  onGoToOrders?: () => void;
  onGoToPurchases?: () => void;
  onRefreshData?: () => void;
  initialConfig?: {
    subTab?: 'treasury' | 'receivables' | 'payables' | 'accounts';
    openModal?: boolean;
    prefill?: {
      type?: 'inflow' | 'outflow' | 'refund' | 'expense';
      orderId?: number;
      orderNumber?: string;
      customerId?: number;
      customerName?: string;
      purchaseId?: number;
      purchaseNumber?: string;
      supplierName?: string;
      amount?: number;
      notes?: string;
    };
  } | null;
  onClearInitialConfig?: () => void;
}

// Helper to robustly match payment methods
export const isPaymentMethodMatch = (
  paymentMethod: string | null | undefined,
  filter: string,
  bankOrAccount?: string | null
): boolean => {
  if (!filter || filter === 'all') return true;
  if (!paymentMethod && !bankOrAccount) return filter === 'otro';

  const m = (paymentMethod || '').toLowerCase().trim();
  const b = (bankOrAccount || '').toLowerCase().trim();
  const f = filter.toLowerCase().trim();

  // Direct exact match
  if (m === f) return true;

  // Transfer filter ('transferencia_bancaria' or 'transferencia')
  if (f === 'transferencia_bancaria' || f === 'transferencia') {
    // Exclude explicit mobile apps / cash / card unless they are explicitly bank transfers
    if (m.includes('deuna') && !m.includes('transferencia')) return false;
    if (m.includes('efectivo') || m.includes('cash') || m.includes('contraentrega')) return false;
    if (m.includes('tarjeta') || m.includes('datafast') || m.includes('payphone')) return false;

    // Direct transfer matches
    if (m.includes('transfer') || m.includes('interbancaria')) return true;

    // Bank accounts, partners & institutions (Banco Pichincha, Mi Vecino, Banco Guayaquil, Banco del Barrio, Produbanco, etc.)
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
};

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  currency = 'USD',
  authFetch,
  showToast,
  orders = [],
  purchases = [],
  storeConfig,
  onGoToOrders,
  onGoToPurchases,
  onRefreshData,
  initialConfig,
  onClearInitialConfig,
}) => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [receivables, setReceivables] = useState<AccountsReceivableItem[]>([]);
  const [payables, setPayables] = useState<AccountsPayableItem[]>([]);
  const [treasury, setTreasury] = useState<TreasurySummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Sub-tabs: 'treasury' | 'receivables' | 'payables' | 'accounts'
  const [activeSubTab, setActiveSubTab] = useState<'treasury' | 'receivables' | 'payables' | 'accounts'>('treasury');

  // Filters for payments table
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMethod, setFilterMethod] = useState<string>('all');
  const [filterBank, setFilterBank] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Filters specifically for Cajas y Bancos (accounts sub-tab)
  const [accountsSelectedBank, setAccountsSelectedBank] = useState<string>('all');
  const [accountsMovementType, setAccountsMovementType] = useState<'all' | 'outflow' | 'inflow'>('outflow');
  const [accountsSearch, setAccountsSearch] = useState<string>('');

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [selectedPaymentDetail, setSelectedPaymentDetail] = useState<PaymentRecord | null>(null);
  const [prefilledData, setPrefilledData] = useState<{
    type?: 'inflow' | 'outflow' | 'refund' | 'expense';
    orderId?: number;
    orderNumber?: string;
    customerId?: number;
    customerName?: string;
    purchaseId?: number;
    purchaseNumber?: string;
    supplierName?: string;
    amount?: number;
    notes?: string;
  } | null>(null);

  // Deep link or initial configuration handler (e.g. from Purchases confirmation)
  useEffect(() => {
    if (initialConfig) {
      if (initialConfig.subTab) {
        setActiveSubTab(initialConfig.subTab);
      }
      if (initialConfig.prefill) {
        setPrefilledData(initialConfig.prefill);
      }
      if (initialConfig.openModal) {
        setIsFormModalOpen(true);
      }
    }
  }, [initialConfig]);

  const isFetchingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  // Safe fetch helper with retry for resilient loading
  const fetchJsonSafe = async (url: string, retries = 2): Promise<any> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await authFetch(url);
        if (res && res.ok) {
          return await res.json();
        }
        return null;
      } catch (err: any) {
        if (err?.name === 'AbortError') return null;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
      }
    }
    return null;
  };

  // Load all payments, receivables, payables and treasury data
  const fetchAllPaymentsData = async (silent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!silent) setLoading(true);

    try {
      const [payResult, recResult, payableResult, trsResult] = await Promise.allSettled([
        fetchJsonSafe('/api/payments'),
        fetchJsonSafe('/api/payments/receivables/list'),
        fetchJsonSafe('/api/payments/payables/list'),
        fetchJsonSafe('/api/payments/treasury/dashboard'),
      ]);

      if (!isMountedRef.current) return;

      if (payResult.status === 'fulfilled' && Array.isArray(payResult.value)) {
        setPayments(payResult.value);
      }
      if (recResult.status === 'fulfilled' && Array.isArray(recResult.value)) {
        setReceivables(recResult.value);
      }
      if (payableResult.status === 'fulfilled' && Array.isArray(payableResult.value)) {
        setPayables(payableResult.value);
      }
      if (trsResult.status === 'fulfilled' && trsResult.value && typeof trsResult.value === 'object') {
        setTreasury(trsResult.value);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && !silent) {
        console.warn('Payments data notice:', err?.message || err);
      }
    } finally {
      isFetchingRef.current = false;
      if (!silent && isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    fetchAllPaymentsData();

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchAllPaymentsData(true);
      }
    }, 6000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  // Sync historical ledger
  const handleSyncLedger = async () => {
    setIsSyncing(true);
    try {
      const res = await authFetch('/api/payments/sync-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || '✓ Sincronización ERP completada');
        await fetchAllPaymentsData();
        if (onRefreshData) onRefreshData();
      } else {
        showToast(data.error || 'Error al sincronizar historial');
      }
    } catch (err) {
      console.error('Failed to sync ledger:', err);
      showToast('Error de conexión al sincronizar tesorería');
    } finally {
      setIsSyncing(false);
    }
  };

  // Available banks list derived dynamically from payments and treasury
  const availableBanks = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => {
      if (p.bankOrAccount && p.bankOrAccount.trim()) {
        set.add(p.bankOrAccount.trim());
      }
    });
    if (treasury?.byBankOrAccount) {
      Object.keys(treasury.byBankOrAccount).forEach((b) => {
        if (b && b.trim()) set.add(b.trim());
      });
    }
    if (set.size === 0) {
      set.add('Banco Pichincha');
      set.add('Banco Guayaquil');
      set.add('Caja Principal (Efectivo)');
    }
    return Array.from(set);
  }, [payments, treasury]);

  // Filtered payments list for main ledger
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (filterType !== 'all') {
        if (filterType === 'outflow') {
          if (p.type !== 'outflow' && p.type !== 'expense') return false;
        } else if (filterType === 'supplier_purchase') {
          if (p.category !== 'supplier_purchase' && p.type !== 'outflow') return false;
        } else if (filterType === 'expense') {
          if (p.type !== 'expense' && p.category !== 'operational_expense') return false;
        } else if (filterType === 'inflow') {
          if (p.type !== 'inflow') return false;
        } else if (filterType === 'refund') {
          if (p.type !== 'refund') return false;
        } else if (p.type !== filterType) {
          return false;
        }
      }
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      if (filterMethod !== 'all' && !isPaymentMethodMatch(p.paymentMethod, filterMethod, p.bankOrAccount)) {
        return false;
      }
      if (filterBank !== 'all') {
        const bankName = (p.bankOrAccount || '').toLowerCase().trim();
        const selected = filterBank.toLowerCase().trim();
        if (bankName !== selected && !bankName.includes(selected) && !selected.includes(bankName)) {
          return false;
        }
      }
      if (startDate) {
        const sTime = new Date(startDate).getTime();
        if (new Date(p.paymentDate).getTime() < sTime) return false;
      }
      if (endDate) {
        const eTime = new Date(endDate).getTime() + 86400000;
        if (new Date(p.paymentDate).getTime() > eTime) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const numMatch = p.paymentNumber?.toLowerCase().includes(q);
        const refMatch = p.referenceNumber?.toLowerCase().includes(q);
        const custMatch = p.customerName?.toLowerCase().includes(q);
        const suppMatch = p.supplierName?.toLowerCase().includes(q);
        const ordMatch = p.orderNumber?.toLowerCase().includes(q);
        const purMatch = p.purchaseNumber?.toLowerCase().includes(q);
        const bankMatch = p.bankOrAccount?.toLowerCase().includes(q);
        const noteMatch = p.notes?.toLowerCase().includes(q);
        const methodMatch =
          p.paymentMethod?.toLowerCase().includes(q) ||
          getMethodLabel(p.paymentMethod).toLowerCase().includes(q);
        if (
          !numMatch &&
          !refMatch &&
          !custMatch &&
          !suppMatch &&
          !ordMatch &&
          !purMatch &&
          !bankMatch &&
          !noteMatch &&
          !methodMatch
        ) {
          return false;
        }
      }
      return true;
    });
  }, [payments, filterType, filterStatus, filterMethod, filterBank, searchQuery, startDate, endDate]);

  // Filtered payments list specifically for Cajas y Bancos (Accounts sub-tab)
  const accountsFilteredPayments = useMemo(() => {
    return payments.filter((p) => {
      // Bank filter
      if (accountsSelectedBank !== 'all') {
        const bankName = (p.bankOrAccount || '').toLowerCase().trim();
        const selected = accountsSelectedBank.toLowerCase().trim();
        if (bankName !== selected && !bankName.includes(selected) && !selected.includes(bankName)) {
          return false;
        }
      }

      // Movement type filter
      if (accountsMovementType === 'outflow') {
        if (p.type !== 'outflow' && p.type !== 'expense' && p.type !== 'refund') {
          return false;
        }
      } else if (accountsMovementType === 'inflow') {
        if (p.type !== 'inflow') {
          return false;
        }
      }

      // Search filter
      if (accountsSearch.trim()) {
        const q = accountsSearch.trim().toLowerCase();
        const numMatch = p.paymentNumber?.toLowerCase().includes(q);
        const refMatch = p.referenceNumber?.toLowerCase().includes(q);
        const custMatch = p.customerName?.toLowerCase().includes(q);
        const suppMatch = p.supplierName?.toLowerCase().includes(q);
        const ordMatch = p.orderNumber?.toLowerCase().includes(q);
        const purMatch = p.purchaseNumber?.toLowerCase().includes(q);
        const bankMatch = p.bankOrAccount?.toLowerCase().includes(q);
        const noteMatch = p.notes?.toLowerCase().includes(q);
        if (!numMatch && !refMatch && !custMatch && !suppMatch && !ordMatch && !purMatch && !bankMatch && !noteMatch) {
          return false;
        }
      }

      return true;
    });
  }, [payments, accountsSelectedBank, accountsMovementType, accountsSearch]);

  // Method Labels helper
  const getMethodLabel = (m: string) => {
    if (!m) return 'Otro';
    const lower = m.toLowerCase().trim();
    if (lower === 'transferencia_bancaria' || lower === 'transferencia') return 'Transferencia Bancaria';
    if (lower.includes('deuna')) return 'Deuna! (QR/Celular)';
    if (lower.includes('efectivo') || lower.includes('contraentrega') || lower.includes('cash')) return 'Efectivo';
    if (lower.includes('tarjeta') || lower.includes('credito') || lower.includes('debito')) return 'Tarjeta Débito/Crédito';
    if (lower.includes('deposito') || lower.includes('depósito')) return 'Depósito Bancario';
    if (lower.includes('cheque')) return 'Cheque';
    if (
      lower.includes('banco') ||
      lower.includes('pichincha') ||
      lower.includes('guayaquil') ||
      lower.includes('pacifico') ||
      lower.includes('produbanco') ||
      lower.includes('vecino') ||
      lower.includes('barrio')
    ) {
      return `Transferencia (${m})`;
    }
    return m.replace(/_/g, ' ');
  };

  // Open modal prefilled for an order
  const handleOpenReceiveForOrder = (item: AccountsReceivableItem) => {
    setPrefilledData({
      type: 'inflow',
      orderId: item.orderId,
      orderNumber: item.orderNumber,
      customerName: item.customerName,
      amount: item.pendingBalance > 0 ? item.pendingBalance : item.totalAmount,
    });
    setIsFormModalOpen(true);
  };

  // Open modal prefilled for a purchase
  const handleOpenPayForPurchase = (item: AccountsPayableItem) => {
    setPrefilledData({
      type: 'outflow',
      purchaseId: item.purchaseId,
      purchaseNumber: item.purchaseNumber,
      supplierName: item.supplierName,
      amount: item.pendingBalance > 0 ? item.pendingBalance : item.totalCost,
    });
    setIsFormModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header with Title and Quick Actions */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center space-x-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-600 to-emerald-700 text-white flex items-center justify-center shadow-sm shadow-emerald-500/20 shrink-0 mt-1 sm:mt-0">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Gestión de Pagos y Tesorería
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                ERP Financiero
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
              Control integral de Cobros a Clientes (CxC), Pagos a Proveedores (CxP), Reembolsos y Flujo de Caja.
            </p>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50/80 text-emerald-800 font-bold text-[11px] shadow-2xs mt-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Conciliación Automática Activa</span>
            </div>
          </div>
        </div>

        {/* Organized and Aligned Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap self-stretch sm:self-auto shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
          <button
            onClick={handleSyncLedger}
            disabled={isSyncing}
            title="Sincronizar y recalcular balances ahora"
            className="h-10 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs disabled:opacity-50 active:scale-98 flex-1 sm:flex-initial"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Recalcular Saldos'}</span>
          </button>

          <button
            onClick={() => {
              setPrefilledData(null);
              setIsFormModalOpen(true);
            }}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 flex-1 sm:flex-initial"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Movimiento / Pago</span>
          </button>
        </div>
      </div>

      {/* Financial KPIs Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* KPI 1: Saldo Neto en Caja/Bancos */}
        <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-emerald-900 via-teal-900 to-slate-900 rounded-2xl p-4 sm:p-5 text-white shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              Saldo Neto Disponible
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white">
              ${treasury?.netCashBalance !== undefined ? treasury.netCashBalance.toFixed(2) : '0.00'}
            </div>
            <p className="text-[10px] text-emerald-200/80 mt-0.5">
              Caja + Cuentas Bancarias conciliadas
            </p>
          </div>
        </div>

        {/* KPI 2: Total Cobrado / Ingresos */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Cobros a Clientes
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-emerald-600">
              +${treasury?.totalInflows !== undefined ? treasury.totalInflows.toFixed(2) : '0.00'}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {treasury?.receivablesPaidCount ?? 0} pedidos cobrados
            </p>
          </div>
        </div>

        {/* KPI 3: Total Pagado Proveedores */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Pagos a Proveedores
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-amber-700">
              -${treasury?.totalOutflows !== undefined ? treasury.totalOutflows.toFixed(2) : '0.00'}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {treasury?.payablesPaidCount ?? 0} compras liquidadas
            </p>
          </div>
        </div>

        {/* KPI 4: Cuentas por Cobrar Pendientes (CxC) */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              CxC Por Cobrar
            </span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-sky-700">
              ${treasury?.totalAccountsReceivablePending !== undefined ? treasury.totalAccountsReceivablePending.toFixed(2) : '0.00'}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {treasury?.receivablesPendingCount ?? 0} ventas pendientes
            </p>
          </div>
        </div>

        {/* KPI 5: Cuentas por Pagar Pendientes (CxP) */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              CxP Por Pagar
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-rose-600">
              ${treasury?.totalAccountsPayablePending !== undefined ? treasury.totalAccountsPayablePending.toFixed(2) : '0.00'}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {treasury?.payablesPendingCount ?? 0} órdenes a proveedores
            </p>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="bg-slate-100/90 rounded-2xl p-1.5 border border-slate-200 shadow-2xs flex items-center gap-1.5 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('treasury')}
          className={`h-10 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
            activeSubTab === 'treasury'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Libro de Comprobantes</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-lg font-bold font-mono ${
            activeSubTab === 'treasury' ? 'bg-slate-100 text-slate-800' : 'bg-slate-200/70 text-slate-600'
          }`}>
            {payments.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('receivables')}
          className={`h-10 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
            activeSubTab === 'receivables'
              ? 'bg-white text-sky-700 shadow-xs border border-sky-200 ring-1 ring-sky-300/40'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          }`}
        >
          <PackageCheck className="w-4 h-4" />
          <span>Cuentas por Cobrar (CxC)</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-lg font-bold font-mono ${
            activeSubTab === 'receivables' ? 'bg-sky-50 text-sky-700' : 'bg-slate-200/70 text-slate-600'
          }`}>
            {receivables.length}
          </span>
          {treasury?.receivablesPendingCount ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800 font-bold border border-sky-200">
              {treasury.receivablesPendingCount} pend.
            </span>
          ) : null}
        </button>

        <button
          onClick={() => setActiveSubTab('payables')}
          className={`h-10 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
            activeSubTab === 'payables'
              ? 'bg-white text-amber-800 shadow-xs border border-amber-200 ring-1 ring-amber-300/40'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Cuentas por Pagar (CxP)</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-lg font-bold font-mono ${
            activeSubTab === 'payables' ? 'bg-amber-50 text-amber-800' : 'bg-slate-200/70 text-slate-600'
          }`}>
            {payables.length}
          </span>
          {treasury?.payablesPendingCount ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-200">
              {treasury.payablesPendingCount} pend.
            </span>
          ) : null}
        </button>

        <button
          onClick={() => setActiveSubTab('accounts')}
          className={`h-10 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
            activeSubTab === 'accounts'
              ? 'bg-white text-emerald-800 shadow-xs border border-emerald-200 ring-1 ring-emerald-300/40'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Cajas y Bancos</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* SUB-VIEW 1: LIBRO DE COMPROBANTES / HISTORIAL DE MOVIMIENTOS */}
      {/* ============================================================ */}
      {activeSubTab === 'treasury' && (
        <div className="space-y-4">
          {/* Toolbar & Filters (Dos Barras Horizontales Estáticas) */}
          <div
            id="payments-search-container"
            className="sticky top-16 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-300 p-2.5 sm:p-3 shadow-sm space-y-2 transition-all max-w-full"
          >
            {/* Barra 1: Búsqueda y Botón de Nuevo Registro */}
            <div className="flex items-center gap-2 w-full">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por comprobante, cliente, proveedor, referencia o banco..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8.5 sm:pl-9 pr-8 sm:pr-14 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white transition font-medium"
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

              <button
                onClick={() => {
                  setPrefilledData(null);
                  setIsFormModalOpen(true);
                }}
                className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Nuevo Comprobante</span>
                <span className="sm:hidden">Nuevo</span>
              </button>
            </div>

            {/* Barra 2: Filtro horizontal continuo (deslizable con el dedo en móvil) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x py-1 w-full scroll-smooth pt-2 border-t border-slate-200/80 select-none">
              <span className="text-[11px] text-slate-500 font-bold shrink-0 mr-0.5 flex items-center gap-1">
                <Filter className="w-3 h-3 text-emerald-600" />
                <span>Tipo:</span>
              </span>

              {/* Type chips */}
              {[
                { id: 'all', label: 'Todos', count: payments.length },
                { id: 'inflow', label: '📥 Cobros', count: payments.filter((p) => p.type === 'inflow').length },
                { id: 'outflow', label: '📤 Egresos', count: payments.filter((p) => p.type === 'outflow' || p.type === 'expense').length },
                { id: 'supplier_purchase', label: '📦 Compras', count: payments.filter((p) => p.type === 'outflow' && p.purchaseId).length },
                { id: 'expense', label: '🏷️ Gastos', count: payments.filter((p) => p.type === 'expense').length },
                { id: 'refund', label: '🔄 Reembolsos', count: payments.filter((p) => p.type === 'refund').length },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setFilterType(t.id)}
                  className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer flex items-center gap-1 text-[11px] shrink-0 whitespace-nowrap ${
                    filterType === t.id
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  <span>{t.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${filterType === t.id ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {t.count}
                  </span>
                </button>
              ))}

              <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />

              {/* Status chips */}
              <span className="text-[11px] text-slate-500 font-bold shrink-0">Estado:</span>
              {[
                { id: 'all', label: 'Todos' },
                { id: 'completed', label: '✅ Completado' },
                { id: 'pending', label: '⏳ Pendiente' },
                { id: 'voided', label: '❌ Anulado' },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setFilterStatus(st.id)}
                  className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer text-[11px] shrink-0 whitespace-nowrap ${
                    filterStatus === st.id
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {st.label}
                </button>
              ))}

              <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />

              {/* Bank/Account selector */}
              <div className="flex items-center shrink-0">
                <select
                  value={filterBank}
                  onChange={(e) => setFilterBank(e.target.value)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer shrink-0"
                >
                  <option value="all">Todas las Cuentas ({availableBanks.length})</option>
                  {availableBanks.map((b) => (
                    <option key={b} value={b}>🏦 {b}</option>
                  ))}
                </select>
              </div>

              {/* Payment Method selector */}
              <div className="flex items-center shrink-0">
                <select
                  value={filterMethod}
                  onChange={(e) => setFilterMethod(e.target.value)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer shrink-0"
                >
                  <option value="all">Todos los Métodos</option>
                  <option value="transferencia_bancaria">🏦 Transferencia</option>
                  <option value="deuna">📱 Deuna!</option>
                  <option value="efectivo">💵 Efectivo</option>
                  <option value="tarjeta_credito_debito">💳 Tarjetas</option>
                  <option value="deposito">📥 Depósito</option>
                  <option value="cheque">📜 Cheque</option>
                </select>
              </div>

              {/* Clear filters button if active */}
              {(filterType !== 'all' || filterStatus !== 'all' || filterMethod !== 'all' || filterBank !== 'all' || searchQuery) && (
                <>
                  <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setFilterType('all');
                      setFilterStatus('all');
                      setFilterMethod('all');
                      setFilterBank('all');
                      setSearchQuery('');
                      setStartDate('');
                      setEndDate('');
                    }}
                    className="text-[11px] text-rose-800 hover:text-rose-950 font-bold px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-300 transition cursor-pointer flex items-center space-x-1 shadow-2xs shrink-0 whitespace-nowrap"
                    title="Restablecer filtros de tesorería"
                  >
                    <X className="w-3 h-3 shrink-0" />
                    <span>Restablecer</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Payments Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-2" />
                <p className="text-sm font-medium">Cargando comprobantes contables...</p>
              </div>
            ) : filteredPayments.length === 0 ? (
              <div className="py-16 px-4 text-center">
                <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-700">No hay movimientos registrados</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                  {searchQuery || filterType !== 'all'
                    ? 'No se encontraron comprobantes con los filtros seleccionados.'
                    : 'Aún no has registrado pagos, cobros o egresos en la tesorería.'}
                </p>
                <button
                  onClick={() => setIsFormModalOpen(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition"
                >
                  Registrar Primer Pago / Cobro
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Comprobante / Fecha</th>
                      <th className="py-3 px-4">Tipo & Concepto</th>
                      <th className="py-3 px-4">Relación ERP</th>
                      <th className="py-3 px-4">Método / Cuenta</th>
                      <th className="py-3 px-4 text-right">Monto</th>
                      <th className="py-3 px-4 text-center">Estado</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPayments.map((payment) => {
                      const isVoided = payment.status === 'voided';
                      const isInflow = payment.type === 'inflow';
                      const isOutflow = payment.type === 'outflow';
                      const isRefund = payment.type === 'refund';
                      const numAmount = Number(payment.amount || 0);

                      return (
                        <tr
                          key={payment.id}
                          className={`hover:bg-slate-50/80 transition ${
                            isVoided ? 'opacity-50 bg-slate-50/50' : ''
                          }`}
                        >
                          {/* Comprobante / Fecha */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{payment.paymentNumber}</span>
                              {payment.referenceNumber && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded border border-slate-200" title={`Referencia Bancaria: ${payment.referenceNumber}`}>
                                  Ref: {payment.referenceNumber}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>{new Date(payment.paymentDate).toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </td>

                          {/* Tipo & Concepto */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              {isInflow ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                                  Cobro Venta
                                </span>
                              ) : isOutflow ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                  <ArrowUpRight className="w-3 h-3 text-amber-700" />
                                  Pago Proveedor
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                  <FileText className="w-3 h-3 text-purple-600" />
                                  Gasto Operacional
                                </span>
                              )}
                            </div>
                            {payment.notes && (
                              <p className="text-[11px] text-slate-500 truncate max-w-[220px] mt-0.5" title={payment.notes}>
                                {payment.notes}
                              </p>
                            )}
                          </td>

                          {/* Relación ERP (Pedido / Compra / Cliente) */}
                          <td className="py-3.5 px-4">
                            {payment.orderNumber ? (
                              <div>
                                <div className="font-bold text-sky-700 flex items-center gap-1">
                                  <PackageCheck className="w-3.5 h-3.5" />
                                  <span>Pedido #{payment.orderNumber}</span>
                                </div>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  {payment.customerName || 'Cliente'}
                                </span>
                              </div>
                            ) : payment.purchaseNumber ? (
                              <div>
                                <div className="font-bold text-amber-800 flex items-center gap-1">
                                  <Boxes className="w-3.5 h-3.5" />
                                  <span>Compra #{payment.purchaseNumber}</span>
                                </div>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  {payment.supplierName || 'Proveedor'}
                                </span>
                              </div>
                            ) : payment.customerName ? (
                              <div className="text-slate-700 font-medium">
                                {payment.customerName}
                              </div>
                            ) : payment.supplierName ? (
                              <div className="text-slate-700 font-medium">
                                {payment.supplierName}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs italic">Movimiento General</span>
                            )}
                          </td>

                          {/* Método / Cuenta Bancaria */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-800">
                              {getMethodLabel(payment.paymentMethod)}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              <span>{payment.bankOrAccount || 'Banco Pichincha'}</span>
                            </div>
                          </td>

                          {/* Monto */}
                          <td className="py-3.5 px-4 text-right">
                            <div
                              className={`text-base font-black font-mono tracking-tight ${
                                isVoided
                                  ? 'line-through text-slate-400'
                                  : isInflow
                                  ? 'text-emerald-600'
                                  : 'text-slate-900'
                              }`}
                            >
                              {isInflow ? '+' : '-'}${numAmount.toFixed(2)}
                            </div>
                          </td>

                          {/* Estado */}
                          <td className="py-3.5 px-4 text-center">
                            {isVoided ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                <Ban className="w-2.5 h-2.5 text-rose-600" />
                                ANULADO
                              </span>
                            ) : payment.status === 'completed' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                Completado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                <Clock className="w-2.5 h-2.5 text-amber-600" />
                                Pendiente
                              </span>
                            )}
                          </td>

                          {/* Acciones */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              <button
                                onClick={() => setSelectedPaymentDetail(payment)}
                                title="Ver detalle y recibo imprimible"
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SUB-VIEW 2: CUENTAS POR COBRAR (CxC - PEDIDOS DE CLIENTES)   */}
      {/* ============================================================ */}
      {activeSubTab === 'receivables' && (
        <div className="space-y-4">
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-sky-900 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center font-bold">
                <PackageCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-sm">Cartera de Clientes y Cuentas por Cobrar (CxC)</h4>
                <p className="text-xs text-sky-700">
                  Control de abonos parciales, saldos pendientes y cobranzas automáticas vinculadas a tus pedidos.
                </p>
              </div>
            </div>
            {onGoToOrders && (
              <button
                onClick={onGoToOrders}
                className="h-9 px-3.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-2xs shrink-0 cursor-pointer"
              >
                <span>Ver Módulo de Ventas</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {receivables.length === 0 ? (
              <div className="py-16 px-4 text-center">
                <PackageCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-700">No hay cuentas por cobrar registradas</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  Cuando generes pedidos de clientes en la tienda o por WhatsApp, aparecerán aquí con su balance financiero.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Pedido / Fecha</th>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4 text-right">Total Venta</th>
                      <th className="py-3 px-4 text-right">Total Abonado</th>
                      <th className="py-3 px-4 text-right">Saldo Pendiente</th>
                      <th className="py-3 px-4 text-center">Estado Cobranza</th>
                      <th className="py-3 px-4 text-right">Acción Rápida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {receivables.map((item) => {
                      const isFullyPaid = item.paymentStatus === 'paid';
                      const isPartial = item.paymentStatus === 'partial';
                      const isUnpaid = item.paymentStatus === 'unpaid';
                      const isRefunded = item.paymentStatus === 'refunded';

                      const pct = item.totalAmount > 0 ? Math.min(100, (item.totalPaid / item.totalAmount) * 100) : 0;

                      return (
                        <tr key={item.orderId} className="hover:bg-slate-50/80 transition">
                          {/* Pedido */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>#{item.orderNumber}</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {new Date(item.orderDate).toLocaleDateString('es-EC', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                          </td>

                          {/* Cliente */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-800">{item.customerName}</div>
                            {item.customerPhone && (
                              <div className="text-[11px] text-slate-500 font-mono">{item.customerPhone}</div>
                            )}
                          </td>

                          {/* Total Venta */}
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                            ${item.totalAmount.toFixed(2)}
                          </td>

                          {/* Total Abonado */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="font-mono font-bold text-emerald-600">
                              ${item.totalPaid.toFixed(2)}
                            </div>
                            <div className="w-20 ml-auto bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                              <div
                                className="bg-emerald-500 h-full rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </td>

                          {/* Saldo Pendiente */}
                          <td className="py-3.5 px-4 text-right">
                            <div
                              className={`font-mono font-black text-sm ${
                                item.pendingBalance > 0 ? 'text-rose-600' : 'text-slate-400'
                              }`}
                            >
                              ${item.pendingBalance.toFixed(2)}
                            </div>
                          </td>

                          {/* Estado Cobranza */}
                          <td className="py-3.5 px-4 text-center">
                            {isFullyPaid ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                100% Pagado
                              </span>
                            ) : isPartial ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                <Clock className="w-3 h-3 text-amber-700" />
                                Abono Parcial ({pct.toFixed(0)}%)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                                <AlertCircle className="w-3 h-3 text-slate-500" />
                                Sin Cobro (0%)
                              </span>
                            )}
                          </td>

                          {/* Acción rápida */}
                          <td className="py-3.5 px-4 text-right">
                            {item.pendingBalance > 0 ? (
                              <button
                                onClick={() => handleOpenReceiveForOrder(item)}
                                className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-2xs transition flex items-center gap-1.5 ml-auto cursor-pointer active:scale-95"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                                <span>Cobrar / Abonar</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-emerald-600 font-bold flex items-center justify-end gap-1">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Saldo en Cero
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SUB-VIEW 3: CUENTAS POR PAGAR (CxP - COMPRAS A PROVEEDORES)  */}
      {/* ============================================================ */}
      {activeSubTab === 'payables' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-950 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center font-bold">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-sm">Obligaciones y Cuentas por Pagar a Proveedores (CxP)</h4>
                <p className="text-xs text-amber-800">
                  Registro y liquidación de facturas, órdenes de compra y desembolsos a tus proveedores mayoristas.
                </p>
              </div>
            </div>
            {onGoToPurchases && (
              <button
                onClick={onGoToPurchases}
                className="h-9 px-3.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-2xs shrink-0 cursor-pointer"
              >
                <span>Ver Módulo de Compras</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {payables.length === 0 ? (
              <div className="py-16 px-4 text-center">
                <Boxes className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-700">No hay órdenes de compra registradas</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  Las órdenes de compra registradas en el módulo de compras aparecerán aquí con su estado de desembolso.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Orden de Compra</th>
                      <th className="py-3 px-4">Proveedor</th>
                      <th className="py-3 px-4 text-right">Costo Total</th>
                      <th className="py-3 px-4 text-right">Total Pagado</th>
                      <th className="py-3 px-4 text-right">Saldo Por Pagar</th>
                      <th className="py-3 px-4 text-center">Estado Pago</th>
                      <th className="py-3 px-4 text-right">Acción Rápida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payables.map((item) => {
                      const isFullyPaid = item.paymentStatus === 'paid';
                      const isPartial = item.paymentStatus === 'partial';
                      const isRefunded = item.paymentStatus === 'refunded';
                      const effectiveCost = (item.totalCost || 0) - (item.totalReturned || 0);
                      const pct = effectiveCost > 0 ? Math.min(100, (item.totalPaid / effectiveCost) * 100) : (item.totalReturned > 0 ? 100 : 0);

                      return (
                        <tr key={item.purchaseId} className="hover:bg-slate-50/80 transition">
                          {/* Compra */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>#{item.purchaseNumber}</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {new Date(item.purchaseDate).toLocaleDateString('es-EC', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                          </td>

                          {/* Proveedor */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-800">{item.supplierName}</div>
                            {item.supplierContact && (
                              <div className="text-[11px] text-slate-500 font-mono">{item.supplierContact}</div>
                            )}
                          </td>

                          {/* Costo Total */}
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                            ${item.totalCost.toFixed(2)}
                          </td>

                          {/* Total Pagado */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="font-mono font-bold text-amber-700">
                              ${item.totalPaid.toFixed(2)}
                            </div>
                            {effectiveCost > 0 && (
                              <div className="w-20 ml-auto bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                                <div
                                  className="bg-amber-500 h-full rounded-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                          </td>

                          {/* Saldo Por Pagar */}
                          <td className="py-3.5 px-4 text-right">
                            <div
                              className={`font-mono font-black text-sm ${
                                item.pendingBalance > 0 ? 'text-rose-600' : 'text-slate-400'
                              }`}
                            >
                              ${item.pendingBalance.toFixed(2)}
                            </div>
                          </td>

                          {/* Estado */}
                          <td className="py-3.5 px-4 text-center">
                            {isFullyPaid ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                100% Liquidado
                              </span>
                            ) : isPartial ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                <Clock className="w-3 h-3 text-amber-700" />
                                Pago Parcial ({pct.toFixed(0)}%)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                <AlertCircle className="w-3 h-3 text-rose-600" />
                                Pendiente de Pago
                              </span>
                            )}
                          </td>

                          {/* Acción rápida */}
                          <td className="py-3.5 px-4 text-right">
                            {item.pendingBalance > 0 ? (
                              <button
                                onClick={() => handleOpenPayForPurchase(item)}
                                className="h-8 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-2xs transition flex items-center gap-1.5 ml-auto cursor-pointer active:scale-95"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                                <span>Pagar a Proveedor</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-emerald-600 font-bold flex items-center justify-end gap-1">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Liquidado
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SUB-VIEW 4: CAJAS Y CUENTAS BANCARIAS                       */}
      {/* ============================================================ */}
      {activeSubTab === 'accounts' && (
        <div className="space-y-6">
          {/* Header informativo y estadísticas de liquidez */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-emerald-700" />
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  Cajas y Cuentas Bancarias
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Monitoreo en tiempo real de saldos disponibles, ingresos cobrados y egresos desembolsados por cuenta bancaria y caja física.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setPrefilledData({ type: 'outflow' });
                  setIsFormModalOpen(true);
                }}
                className="h-10 px-4 rounded-xl text-xs sm:text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2 transition cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar Egreso / Pago</span>
              </button>

              <button
                onClick={() => {
                  setPrefilledData({ type: 'inflow' });
                  setIsFormModalOpen(true);
                }}
                className="h-10 px-4 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 transition cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar Ingreso / Cobro</span>
              </button>
            </div>
          </div>

          {/* Tarjetas de Cuentas Bancarias y Métodos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Desglose por Banco / Cuenta con Ingresos y Egresos */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-sm sm:text-base">Saldo por Banco / Caja</h3>
                    <p className="text-xs text-slate-400">Distribución de liquidez con detalle de ingresos y egresos</p>
                  </div>
                </div>
              </div>

              {treasury?.byBankOrAccount && Object.keys(treasury.byBankOrAccount).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(treasury.byBankOrAccount).map(([bank, data]) => {
                    const isSelected = accountsSelectedBank === bank;
                    return (
                      <div
                        key={bank}
                        className={`p-4 rounded-2xl border transition-all ${
                          isSelected
                            ? 'bg-emerald-50/50 border-emerald-300 ring-1 ring-emerald-300/60 shadow-xs'
                            : 'bg-slate-50 border-slate-200/80 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-900 text-sm">{bank}</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                {data.count} mov.
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Cuenta conciliada en Tesorería
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                              Saldo Disponible
                            </div>
                            <div
                              className={`text-lg font-black font-mono tracking-tight ${
                                data.total >= 0 ? 'text-emerald-700' : 'text-rose-600'
                              }`}
                            >
                              ${data.total.toFixed(2)}
                            </div>
                          </div>
                        </div>

                        {/* Desglose visual de Ingresos vs Egresos */}
                        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-200/60">
                          <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200/60">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                                <ArrowDownLeft className="w-3 h-3" />
                                Ingresos
                              </span>
                              <span className="text-[10px] font-medium text-slate-500">
                                {data.inflowsCount || 0} cobro(s)
                              </span>
                            </div>
                            <div className="text-sm font-black font-mono text-emerald-600 mt-1">
                              +${(data.inflows || 0).toFixed(2)}
                            </div>
                          </div>

                          <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200/60">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-amber-700 flex items-center gap-1">
                                <ArrowUpRight className="w-3 h-3" />
                                Egresos
                              </span>
                              <span className="text-[10px] font-medium text-slate-500">
                                {data.outflowsCount || 0} pago(s)
                              </span>
                            </div>
                            <div className="text-sm font-black font-mono text-amber-800 mt-1">
                              -${(data.outflows || 0).toFixed(2)}
                            </div>
                          </div>
                        </div>

                        {/* Botón para ver los egresos de este banco */}
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <button
                            onClick={() => {
                              setAccountsSelectedBank(isSelected ? 'all' : bank);
                              setAccountsMovementType('outflow');
                            }}
                            className={`text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition cursor-pointer ${
                              isSelected && accountsMovementType === 'outflow'
                                ? 'bg-amber-600 text-white'
                                : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/60'
                            }`}
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>Ver Egresos de {bank.split(' ')[0]}</span>
                          </button>

                          <button
                            onClick={() => {
                              setAccountsSelectedBank(isSelected ? 'all' : bank);
                              setAccountsMovementType('all');
                            }}
                            className={`text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition cursor-pointer ${
                              isSelected && accountsMovementType === 'all'
                                ? 'bg-slate-800 text-white'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            <span>{isSelected ? 'Ver Todos' : 'Ver Historial'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-6 text-center italic">
                  Aún no hay movimientos conciliados por entidad bancaria.
                </p>
              )}
            </div>

            {/* Desglose por Método de Pago */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-sm sm:text-base">Flujo por Método de Pago</h3>
                    <p className="text-xs text-slate-400">Canales de pago utilizados (Transferencia, Deuna, Efectivo)</p>
                  </div>
                </div>
              </div>

              {treasury?.byPaymentMethod && Object.keys(treasury.byPaymentMethod).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(treasury.byPaymentMethod).map(([method, data]) => (
                    <div
                      key={method}
                      className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2.5"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-black text-slate-900 text-sm">{getMethodLabel(method)}</div>
                          <div className="text-[11px] text-slate-500 font-medium">{data.count} transacción(es)</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            Saldo Neto
                          </div>
                          <div
                            className={`text-base font-black font-mono ${
                              data.total >= 0 ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            ${data.total.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-xs font-mono">
                        <div className="text-emerald-700">
                          <span className="text-[10px] font-sans font-bold block text-slate-400">Ingresos</span>
                          +${(data.inflows || 0).toFixed(2)}
                        </div>
                        <div className="text-amber-800 text-right">
                          <span className="text-[10px] font-sans font-bold block text-slate-400">Egresos</span>
                          -${(data.outflows || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-6 text-center italic">
                  Aún no hay movimientos registrados por método de pago.
                </p>
              )}
            </div>
          </div>

          {/* ========================================================= */}
          {/* LIBRO DE MOVIMIENTOS Y EGRESOS DE CAJAS Y BANCOS          */}
          {/* ========================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Header del libro de movimientos */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-700" />
                  <h4 className="font-black text-slate-900 text-sm sm:text-base">
                    {accountsMovementType === 'outflow'
                      ? 'Egresos y Pagos Realizados en Cajas y Bancos'
                      : accountsMovementType === 'inflow'
                      ? 'Ingresos y Cobros Recibidos en Cajas y Bancos'
                      : 'Historial Completo de Movimientos de Cajas y Bancos'}
                  </h4>
                  {accountsSelectedBank !== 'all' && (
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Cuenta: {accountsSelectedBank}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Comprobantes contables, liquidaciones a proveedores y gastos registrados
                </p>
              </div>

              {/* Botones de conmutación de tipo */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setAccountsMovementType('outflow')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    accountsMovementType === 'outflow'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>📤 Egresos ({payments.filter((p) => p.type === 'outflow' || p.type === 'expense').length})</span>
                </button>

                <button
                  onClick={() => setAccountsMovementType('inflow')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    accountsMovementType === 'inflow'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>📥 Ingresos ({payments.filter((p) => p.type === 'inflow').length})</span>
                </button>

                <button
                  onClick={() => setAccountsMovementType('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    accountsMovementType === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Todos ({payments.length})</span>
                </button>
              </div>
            </div>

            {/* Barra de filtros de la tabla de Cajas y Bancos (Dos Barras Horizontales) */}
            <div className="p-2.5 sm:p-3 bg-slate-50 border-b border-slate-200/80 space-y-2">
              {/* Barra 1: Búsqueda */}
              <div className="flex items-center gap-2 w-full">
                <div className="flex-1 min-w-0 relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar en movimientos por comprobante, proveedor, compra #, referencia..."
                    value={accountsSearch}
                    onChange={(e) => setAccountsSearch(e.target.value)}
                    className="w-full h-9 pl-9 pr-8 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 placeholder:text-slate-400"
                  />
                  {accountsSearch && (
                    <button
                      onClick={() => setAccountsSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer"
                      title="Limpiar búsqueda"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <span className="text-xs font-bold px-2.5 py-1.5 rounded-xl bg-white text-slate-700 border border-slate-200 shrink-0">
                  {accountsFilteredPayments.length} mov.
                </span>
              </div>

              {/* Barra 2: Filtros Horizontales Continuos (Deslizables en móvil) */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x py-0.5 w-full scroll-smooth pt-1.5 border-t border-slate-200/80 select-none">
                <span className="text-[11px] text-slate-500 font-bold shrink-0 mr-0.5 flex items-center gap-1">
                  <Filter className="w-3 h-3 text-emerald-600" />
                  <span>Filtros:</span>
                </span>

                <span className="text-[11px] text-slate-500 font-medium shrink-0">Cuenta:</span>
                <select
                  value={accountsSelectedBank}
                  onChange={(e) => setAccountsSelectedBank(e.target.value)}
                  className="h-8 px-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 transition cursor-pointer shrink-0"
                >
                  <option value="all">Todas las Cuentas ({availableBanks.length})</option>
                  {availableBanks.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>

                <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />

                <span className="text-[11px] text-slate-500 font-medium shrink-0">Tipo:</span>
                <button
                  type="button"
                  onClick={() => setAccountsMovementType('outflow')}
                  className={`h-8 px-2.5 rounded-xl font-bold transition text-xs shrink-0 whitespace-nowrap cursor-pointer ${
                    accountsMovementType === 'outflow'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Egresos / Pagos
                </button>
                <button
                  type="button"
                  onClick={() => setAccountsMovementType('all')}
                  className={`h-8 px-2.5 rounded-xl font-bold transition text-xs shrink-0 whitespace-nowrap cursor-pointer ${
                    accountsMovementType === 'all'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Todos los Flujos
                </button>

                {(accountsSelectedBank !== 'all' || accountsSearch || accountsMovementType !== 'outflow') && (
                  <>
                    <div className="h-4 w-px bg-slate-300 shrink-0 mx-1" />
                    <button
                      onClick={() => {
                        setAccountsSelectedBank('all');
                        setAccountsSearch('');
                        setAccountsMovementType('outflow');
                      }}
                      className="h-8 px-2.5 text-[11px] font-bold text-rose-800 hover:text-rose-950 bg-rose-50 border border-rose-300 rounded-xl transition cursor-pointer flex items-center gap-1 shrink-0 whitespace-nowrap"
                    >
                      <X className="w-3 h-3" />
                      <span>Restablecer</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Tabla de movimientos */}
            {accountsFilteredPayments.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">No se encontraron movimientos registrados</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  {accountsMovementType === 'outflow'
                    ? 'No hay egresos o pagos coincidentes con los filtros seleccionados.'
                    : 'No hay transacciones registradas para este criterio.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-200/80 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Comprobante</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Tipo / Concepto</th>
                      <th className="px-4 py-3">Tercero (Proveedor / Cliente)</th>
                      <th className="px-4 py-3">Caja / Banco</th>
                      <th className="px-4 py-3">Método / Referencia</th>
                      <th className="px-4 py-3 text-right">Monto</th>
                      <th className="px-4 py-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {accountsFilteredPayments.map((p) => {
                      const isOut = p.type === 'outflow' || p.type === 'expense' || p.type === 'refund';
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                                isOut
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-emerald-100 text-emerald-900'
                              }`}
                            >
                              {p.paymentNumber}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                            {new Date(p.paymentDate).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900">
                              {p.category === 'supplier_purchase'
                                ? 'Pago a Proveedor'
                                : p.category === 'operational_expense'
                                ? 'Gasto Operacional'
                                : p.category === 'customer_sale'
                                ? 'Cobro de Venta'
                                : p.category === 'customer_refund'
                                ? 'Reembolso Cliente'
                                : p.category === 'supplier_refund'
                                ? 'Reembolso Proveedor'
                                : 'Movimiento'}
                            </div>
                            {p.purchaseNumber && (
                              <div className="text-[11px] text-amber-800 font-bold">
                                Compra #{p.purchaseNumber}
                              </div>
                            )}
                            {p.orderNumber && (
                              <div className="text-[11px] text-sky-700 font-bold">
                                Pedido #{p.orderNumber}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900">
                              {p.supplierName || p.customerName || '—'}
                            </div>
                            {p.notes && (
                              <div className="text-[11px] text-slate-400 line-clamp-1 max-w-xs">
                                {p.notes}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">
                            {p.bankOrAccount || 'Banco Pichincha'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-slate-800 font-bold">
                              {getMethodLabel(p.paymentMethod)}
                            </div>
                            {p.referenceNumber && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                Ref: {p.referenceNumber}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-black text-sm whitespace-nowrap">
                            <span className={isOut ? 'text-amber-800' : 'text-emerald-700'}>
                              {isOut ? '-' : '+'}${Number(p.amount || 0).toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <button
                              onClick={() => setSelectedPaymentDetail(p)}
                              className="px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer inline-flex items-center gap-1"
                              title="Ver detalle y recibo imprimible"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Ver</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 1: FORMULARIO DE REGISTRO / EDICIÓN DE PAGO O COBRO    */}
      {/* ============================================================ */}
      {isFormModalOpen && (
        <PaymentFormModal
          isOpen={isFormModalOpen}
          onClose={() => {
            setIsFormModalOpen(false);
            setPrefilledData(null);
            if (onClearInitialConfig) onClearInitialConfig();
          }}
          prefilledData={prefilledData}
          orders={orders}
          purchases={purchases}
          authFetch={authFetch}
          onSaved={async (savedPaymentData?: any) => {
            setIsFormModalOpen(false);
            const pNumber = prefilledData?.purchaseNumber || savedPaymentData?.purchaseNumber;
            setPrefilledData(null);
            if (onClearInitialConfig) onClearInitialConfig();

            if (pNumber) {
              showToast(`✓ ¡Pago registrado exitosamente y Orden de Compra #${pNumber} CONFIRMADA con el proveedor!`);
            } else {
              showToast('✓ Movimiento contable registrado con éxito');
            }
            await fetchAllPaymentsData();
            if (onRefreshData) onRefreshData();
          }}
        />
      )}

      {/* ============================================================ */}
      {/* MODAL 2: DETALLE Y RECIBO IMPRIMIBLE DE COMPROBANTE          */}
      {/* ============================================================ */}
      {selectedPaymentDetail && (
        <PaymentDetailModal
          payment={selectedPaymentDetail}
          onClose={() => setSelectedPaymentDetail(null)}
          getMethodLabel={getMethodLabel}
          showToast={showToast}
        />
      )}
    </div>
  );
};

/* =========================================================================
   SUB-COMPONENT: FORMULARIO MODAL DE REGISTRO DE MOVIMIENTO / PAGO
   ========================================================================= */
interface PaymentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefilledData?: any;
  orders: CustomerOrder[];
  purchases: any[];
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onSaved: (savedData?: any) => void;
}

const getSystemCurrentLocalDateTimeString = (d: Date = new Date()): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const PaymentFormModal: React.FC<PaymentFormModalProps> = ({
  isOpen,
  onClose,
  prefilledData,
  orders,
  purchases,
  authFetch,
  onSaved,
}) => {
  const [type, setType] = useState<'inflow' | 'outflow' | 'refund' | 'expense'>(
    prefilledData?.type || 'inflow'
  );
  const [amount, setAmount] = useState<string>(
    prefilledData?.amount !== undefined ? String(prefilledData.amount) : ''
  );
  const [paymentMethod, setPaymentMethod] = useState<string>('transferencia_bancaria');
  const [bankOrAccount, setBankOrAccount] = useState<string>('Banco Pichincha');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(() => getSystemCurrentLocalDateTimeString());
  const [notes, setNotes] = useState<string>(prefilledData?.notes || '');
  const [voucherUrl, setVoucherUrl] = useState<string>('');

  // Linked ERP relations
  const [selectedOrderId, setSelectedOrderId] = useState<number | undefined>(prefilledData?.orderId);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | undefined>(prefilledData?.purchaseId);
  const [customerName, setCustomerName] = useState<string>(prefilledData?.customerName || '');
  const [supplierName, setSupplierName] = useState<string>(prefilledData?.supplierName || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Sync internal state when modal opens or prefilledData changes
  useEffect(() => {
    if (isOpen) {
      if (prefilledData) {
        if (prefilledData.type) setType(prefilledData.type);
        if (prefilledData.amount !== undefined) setAmount(String(prefilledData.amount));
        if (prefilledData.purchaseId) setSelectedPurchaseId(prefilledData.purchaseId);
        if (prefilledData.supplierName) setSupplierName(prefilledData.supplierName);
        if (prefilledData.orderId) setSelectedOrderId(prefilledData.orderId);
        if (prefilledData.customerName) setCustomerName(prefilledData.customerName);
        if (prefilledData.notes) setNotes(prefilledData.notes);
        if (prefilledData.paymentDate) {
          const d = new Date(prefilledData.paymentDate);
          setPaymentDate(!isNaN(d.getTime()) ? getSystemCurrentLocalDateTimeString(d) : getSystemCurrentLocalDateTimeString());
        } else {
          setPaymentDate(getSystemCurrentLocalDateTimeString());
        }
      } else {
        // Reset to current system date and time when opening fresh form
        setPaymentDate(getSystemCurrentLocalDateTimeString());
      }
    }
  }, [isOpen, prefilledData]);

  // If order is selected, auto-fill customer, payment method, bank and default amount
  useEffect(() => {
    if (selectedOrderId) {
      const ord = orders.find((o) => Number(o.id) === Number(selectedOrderId));
      if (ord) {
        setCustomerName(ord.customerName);
        if (!amount || amount === '0') {
          setAmount(String(ord.totalAmount));
        }
        if (ord.paymentMethod) {
          const derivedBank = deriveBankOrAccountFromMethod(ord.paymentMethod, ord.notes);
          setBankOrAccount(derivedBank);
          const lowMethod = ord.paymentMethod.toLowerCase();
          if (lowMethod.includes('deuna')) {
            setPaymentMethod('deuna');
          } else if (lowMethod.includes('efectivo') || lowMethod.includes('contraentrega')) {
            setPaymentMethod('efectivo');
          } else if (lowMethod.includes('tarjeta')) {
            setPaymentMethod('tarjeta_credito');
          } else {
            setPaymentMethod('transferencia_bancaria');
          }
        }
        if (ord.paymentVoucher && !referenceNumber) {
          setReferenceNumber(ord.paymentVoucher);
        }
      }
    }
  }, [selectedOrderId, orders]);

  // If purchase is selected, auto-fill supplier and default amount
  useEffect(() => {
    if (selectedPurchaseId) {
      const purch = purchases.find((p) => Number(p.id) === Number(selectedPurchaseId));
      if (purch) {
        setSupplierName(purch.supplierName);
        if (!amount || amount === '0') {
          setAmount(String(purch.totalCost));
        }
      }
    }
  }, [selectedPurchaseId, purchases]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numAmt = Number(amount);
    if (isNaN(numAmt) || numAmt <= 0) {
      setError('Por favor ingresa un monto válido mayor a 0.00');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: any = {
        type,
        amount: numAmt,
        paymentMethod,
        bankOrAccount,
        referenceNumber: referenceNumber.trim() || undefined,
        paymentDate: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString(),
        status: 'completed',
        notes: notes.trim() || undefined,
        voucherUrl: voucherUrl.trim() || undefined,
        orderId: type === 'inflow' || type === 'refund' ? selectedOrderId : undefined,
        customerName: customerName.trim() || undefined,
        purchaseId: type === 'outflow' ? selectedPurchaseId : undefined,
        supplierName: supplierName.trim() || undefined,
      };

      const res = await authFetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        onSaved(data);
      } else {
        setError(data.error || 'Error al guardar el comprobante');
      }
    } catch (err: any) {
      console.error('Failed to submit payment:', err);
      setError(err.message || 'Error de conexión');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-100 my-auto overflow-hidden">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg">Registrar Movimiento de Tesorería</h3>
              <p className="text-xs text-slate-400">Comprobante de cobro, pago o egreso ERP</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Type Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Tipo de Movimiento Contable:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('inflow')}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition cursor-pointer ${
                  type === 'inflow'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <ArrowDownLeft className="w-4 h-4" />
                <span>Cobro Cliente</span>
              </button>

              <button
                type="button"
                onClick={() => setType('outflow')}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition cursor-pointer ${
                  type === 'outflow'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>Pago Proveedor</span>
              </button>

              <button
                type="button"
                onClick={() => setType('expense')}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition cursor-pointer ${
                  type === 'expense'
                    ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Gasto Operación</span>
              </button>
            </div>
          </div>

          {/* If Inflow: select order */}
          {type === 'inflow' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Vincular a Pedido de Venta (Opcional):
              </label>
              <select
                value={selectedOrderId || ''}
                onChange={(e) => setSelectedOrderId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              >
                <option value="">-- Sin vincular a pedido específico --</option>
                {orders.map((ord) => (
                  <option key={ord.id} value={ord.id}>
                    #{ord.orderNumber} - {ord.customerName} (${Number(ord.totalAmount).toFixed(2)}) [{ord.status}]
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* If Outflow: select purchase */}
          {type === 'outflow' && (
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Vincular a Orden de Compra a Proveedor (Opcional):
                </label>
                <select
                  value={selectedPurchaseId || ''}
                  onChange={(e) => setSelectedPurchaseId(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                >
                  <option value="">-- Sin vincular a orden específica --</option>
                  {purchases.map((purch) => (
                    <option key={purch.id} value={purch.id}>
                      #{purch.purchaseNumber} - {purch.supplierName} (${Number(purch.totalCost).toFixed(2)}) [{purch.status === 'pending' ? 'Pendiente / Por Confirmar' : purch.status}]
                    </option>
                  ))}
                </select>
              </div>

              {selectedPurchaseId && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Flujo de Confirmación de Compra:</strong>
                    Al guardar este egreso, la Orden de Compra{' '}
                    <span className="font-mono font-bold">
                      #{prefilledData?.purchaseNumber || purchases.find((p) => p.id === selectedPurchaseId)?.purchaseNumber || selectedPurchaseId}
                    </span>{' '}
                    quedará <strong>confirmada con el proveedor</strong> y se actualizará su estado de pago.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Amount and Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Monto del Pago / Abono ($ USD) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  Fecha y Hora del Movimiento:
                </label>
                <button
                  type="button"
                  onClick={() => setPaymentDate(getSystemCurrentLocalDateTimeString(new Date()))}
                  className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 hover:underline cursor-pointer transition"
                  title="Establecer a la fecha y hora actual del sistema"
                >
                  <Clock className="w-3 h-3" />
                  <span>Hora actual</span>
                </button>
              </div>
              <input
                type="datetime-local"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Method and Bank / Account */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Método de Pago:
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              >
                <option value="transferencia_bancaria">🏦 Transferencia Bancaria</option>
                <option value="deuna">📱 Deuna! (QR / Celular)</option>
                <option value="efectivo">💵 Efectivo / Caja</option>
                <option value="tarjeta_credito_debito">💳 Tarjeta Débito / Crédito</option>
                <option value="deposito">📥 Depósito en Ventanilla / CNB</option>
                <option value="cheque">📜 Cheque</option>
                <option value="otro">⚙️ Otro</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Caja / Cuenta Bancaria de Destino/Egreso:
              </label>
              <select
                value={bankOrAccount}
                onChange={(e) => setBankOrAccount(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              >
                <option value="Banco Pichincha">Banco Pichincha</option>
                <option value="Banco Guayaquil">Banco Guayaquil</option>
                <option value="Deuna!">Deuna! (App / QR)</option>
                <option value="Produbanco">Produbanco / Promerica</option>
                <option value="Banco Bolivariano">Banco Bolivariano</option>
                <option value="Banco del Pacífico">Banco del Pacífico</option>
                <option value="Banco Internacional">Banco Internacional</option>
                <option value="Banco del Austro">Banco del Austro</option>
                <option value="Banco Solidario">Banco Solidario</option>
                <option value="Banco Machala">Banco Machala</option>
                <option value="Cooperativa JEP">Cooperativa JEP</option>
                <option value="Cooperativa Policía Nacional">Cooperativa Policía Nacional</option>
                <option value="Cooperativa Alianza del Valle">Cooperativa Alianza del Valle</option>
                <option value="Zelle (USD)">Zelle (USD)</option>
                <option value="Caja Principal (Efectivo)">Caja Principal (Efectivo)</option>
                <option value="Caja Chica">Caja Chica</option>
                <option value="Otra Cuenta">Otra Cuenta / Billetera</option>
                {bankOrAccount && ![
                  'Banco Pichincha', 'Banco Guayaquil', 'Deuna!', 'Produbanco', 'Banco Bolivariano',
                  'Banco del Pacífico', 'Banco Internacional', 'Banco del Austro', 'Banco Solidario',
                  'Banco Machala', 'Cooperativa JEP', 'Cooperativa Policía Nacional', 'Cooperativa Alianza del Valle',
                  'Zelle (USD)', 'Caja Principal (Efectivo)', 'Caja Chica', 'Otra Cuenta'
                ].includes(bankOrAccount) && (
                  <option value={bankOrAccount}>{bankOrAccount}</option>
                )}
              </select>
            </div>
          </div>

          {/* Reference and Client/Supplier Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                N° de Referencia / Comprobante Bancario:
              </label>
              <input
                type="text"
                placeholder="Ej: 04918239 o #Trans-998"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {type === 'outflow' ? 'Nombre del Proveedor:' : 'Nombre del Cliente / Titular:'}
              </label>
              <input
                type="text"
                placeholder={type === 'outflow' ? 'Proveedor mayorista' : 'Nombre del cliente'}
                value={type === 'outflow' ? supplierName : customerName}
                onChange={(e) => (type === 'outflow' ? setSupplierName(e.target.value) : setCustomerName(e.target.value))}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Notas y Observaciones Contables:
            </label>
            <textarea
              rows={2}
              placeholder="Detalle o justificación contable del pago o cobro..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Registrando...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Guardar Comprobante</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* =========================================================================
   SUB-COMPONENT: DETALLE Y RECIBO IMPRIMIBLE DE COMPROBANTE
   ========================================================================= */
interface PaymentDetailModalProps {
  payment: PaymentRecord;
  onClose: () => void;
  getMethodLabel: (m: string) => string;
  showToast?: (msg: string) => void;
}

const PaymentDetailModal: React.FC<PaymentDetailModalProps> = ({
  payment,
  onClose,
  getMethodLabel,
  showToast,
}) => {
  const isVoided = payment.status === 'voided';
  const isInflow = payment.type === 'inflow';
  const numAmount = Number(payment.amount || 0);
  const [thermalWidth, setThermalWidth] = useState<'44mm' | '48mm' | '58mm' | '80mm'>('58mm');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  const widthConfigs = {
    '44mm': { mm: 44, heightMm: 135, baseSize: '7.5px', titleSize: '9.5px', pad: '2mm' },
    '48mm': { mm: 48, heightMm: 130, baseSize: '8px', titleSize: '10px', pad: '2.5mm' },
    '58mm': { mm: 58, heightMm: 120, baseSize: '8.5px', titleSize: '11px', pad: '3mm' },
    '80mm': { mm: 80, heightMm: 115, baseSize: '10px', titleSize: '13px', pad: '4mm' },
  };

  const currentReceiptCfg = widthConfigs[thermalWidth] || widthConfigs['58mm'];

  // Global media print override to force thermal dimensions if window.print or Ctrl+P is used
  useEffect(() => {
    const cfg = currentReceiptCfg;
    const styleId = 'receipt-print-page-override-style';
    let styleTag = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }

    styleTag.innerHTML = `
      @media print {
        @page {
          size: ${cfg.mm}mm auto portrait;
          margin: 0mm;
        }
        html, body {
          width: ${cfg.mm}mm !important;
          max-width: ${cfg.mm}mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
        }
        body * {
          visibility: hidden !important;
        }
        #printable-payment-receipt,
        #printable-payment-receipt * {
          visibility: visible !important;
        }
        #printable-payment-receipt {
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          width: ${cfg.mm}mm !important;
          max-width: ${cfg.mm}mm !important;
          margin: 0 !important;
          padding: ${cfg.pad} !important;
          border: 1px dashed #000000 !important;
          box-shadow: none !important;
          background: #ffffff !important;
          z-index: 9999999 !important;
          max-height: none !important;
          overflow: visible !important;
        }
        .no-print,
        #payment-modal-overlay,
        #payment-modal-header,
        #payment-modal-footer {
          display: none !important;
        }
      }
    `;

    return () => {
      const el = document.getElementById(styleId);
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    };
  }, [thermalWidth, currentReceiptCfg]);

  const generateReceiptHtml = () => {
    const cfg = currentReceiptCfg;
    const dateFormatted = new Date(payment.paymentDate).toLocaleString('es-EC', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${cfg.mm}mm, initial-scale=1.0" />
  <title>Recibo_${payment.paymentNumber}_${thermalWidth}</title>
  <style>
    @page {
      size: ${cfg.mm}mm auto portrait;
      margin: 2mm 1mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      max-width: ${cfg.mm}mm;
      margin: 0 auto;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: ${cfg.baseSize};
      line-height: 1.3;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .receipt-box {
      width: 100%;
      max-width: ${cfg.mm}mm;
      padding: ${cfg.pad};
      border: 1px dashed #94a3b8;
      background: #ffffff;
      margin: 0 auto;
    }
    .title {
      text-align: center;
      font-size: ${cfg.titleSize};
      font-weight: 900;
      text-transform: uppercase;
      margin-bottom: 2px;
      letter-spacing: -0.2px;
    }
    .meta {
      text-align: center;
      font-size: calc(${cfg.baseSize} - 0.5px);
      color: #475569;
      margin-bottom: 5px;
      padding-bottom: 4px;
      border-bottom: 1px dashed #cbd5e1;
    }
    .amount-badge {
      text-align: center;
      padding: 5px 3px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      margin-bottom: 6px;
    }
    .amount-type {
      font-size: calc(${cfg.baseSize} - 1px);
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
    }
    .amount-num {
      font-size: calc(${cfg.titleSize} + 2.5px);
      font-weight: 900;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: #0f172a;
      margin: 1px 0;
    }
    .amount-category {
      font-size: calc(${cfg.baseSize} - 1px);
      font-weight: 800;
      color: #334155;
    }
    .info-table {
      width: 100%;
      margin-bottom: 6px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 2.5px 0;
      border-bottom: 1px dotted #e2e8f0;
    }
    .row:last-child {
      border-bottom: none;
    }
    .row-label {
      color: #64748b;
      font-weight: 600;
      white-space: nowrap;
      padding-right: 4px;
    }
    .row-val {
      font-weight: 800;
      color: #0f172a;
      text-align: right;
      word-break: break-word;
    }
    .note-box {
      margin-top: 5px;
      padding: 4px 6px;
      background: #f8fafc;
      border-left: 2px solid #0284c7;
      font-size: calc(${cfg.baseSize} - 1px);
      color: #475569;
      line-height: 1.35;
    }
    .footer {
      margin-top: 6px;
      padding-top: 4px;
      border-top: 1px dashed #cbd5e1;
      text-align: center;
      font-size: calc(${cfg.baseSize} - 1px);
      color: #94a3b8;
    }
  </style>
  <script>
    window.addEventListener('DOMContentLoaded', function() {
      setTimeout(function() {
        try {
          window.focus();
          window.print();
        } catch (e) {
          console.error(e);
        }
      }, 300);
    });
  </script>
</head>
<body>
  <div class="receipt-box">
    <div class="title">Comprobante de Tesorería</div>
    <div class="meta">${payment.paymentNumber} • ${dateFormatted}</div>
    <div class="amount-badge">
      <div class="amount-type">
        ${isInflow ? 'Monto Cobrado (Ingreso)' : 'Monto Desembolsado (Egreso)'}
      </div>
      <div class="amount-num" ${isVoided ? 'style="text-decoration: line-through; color: #94a3b8;"' : ''}>
        $${numAmount.toFixed(2)} USD
      </div>
      <div class="amount-category">
        ${payment.category.replace(/_/g, ' ').toUpperCase()}
      </div>
    </div>
    <div class="info-table">
      <div class="row"><span class="row-label">Método:</span><span class="row-val">${getMethodLabel(payment.paymentMethod)}</span></div>
      <div class="row"><span class="row-label">Caja/Banco:</span><span class="row-val">${payment.bankOrAccount}</span></div>
      ${payment.referenceNumber ? `<div class="row"><span class="row-label">Referencia:</span><span class="row-val">${payment.referenceNumber}</span></div>` : ''}
      ${payment.orderNumber ? `<div class="row"><span class="row-label">Pedido:</span><span class="row-val">#${payment.orderNumber}</span></div>` : ''}
      ${payment.purchaseNumber ? `<div class="row"><span class="row-label">Compra:</span><span class="row-val">#${payment.purchaseNumber}</span></div>` : ''}
      ${payment.customerName ? `<div class="row"><span class="row-label">Cliente:</span><span class="row-val">${payment.customerName}</span></div>` : ''}
      ${payment.supplierName ? `<div class="row"><span class="row-label">Proveedor:</span><span class="row-val">${payment.supplierName}</span></div>` : ''}
    </div>
    ${payment.notes ? `<div class="note-box"><strong>Nota:</strong> ${payment.notes}</div>` : ''}
    <div class="footer">Documento de control interno • Impresora térmica ${thermalWidth}</div>
  </div>
</body>
</html>`;
  };

  const handlePrint = () => {
    setIsPrinting(true);
    if (showToast) {
      showToast(`Preparando impresión de recibo (${thermalWidth})...`);
    }

    const htmlContent = generateReceiptHtml();

    // 1. Try opening popup window first (most reliable across browsers and iframe embeds)
    try {
      const printWindow = window.open('', '_blank', 'width=520,height=720,toolbar=0,menubar=0,location=0,status=0');
      if (printWindow && !printWindow.closed) {
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();

        setTimeout(() => {
          try {
            printWindow.focus();
            printWindow.print();
          } catch (e) {
            console.warn('Popup print exception:', e);
          }
          setIsPrinting(false);
        }, 350);
        return;
      }
    } catch (popupErr) {
      console.warn('Popup window blocked or error:', popupErr);
    }

    // 2. Fallback: Hidden iframe attached to document
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '100px';
      iframe.style.height = '100px';
      iframe.style.border = '0';
      iframe.style.opacity = '0.01';
      iframe.style.zIndex = '-99999';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(htmlContent);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (err) {
            console.warn('Iframe print error, falling back to window.print():', err);
            window.print();
          }
          setIsPrinting(false);
          setTimeout(() => {
            if (iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }
          }, 4000);
        }, 400);
        return;
      }
    } catch (err) {
      console.error('Iframe creation error:', err);
    }

    // 3. Fallback: Main window print
    try {
      window.print();
    } catch (winErr) {
      console.error('Final window.print error:', winErr);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleOpenInNewTab = () => {
    const htmlContent = generateReceiptHtml();
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    if (showToast) {
      showToast('Recibo abierto en nueva pestaña para imprimir');
    }
  };

  const handleCopySummary = () => {
    const text = `🧾 *COMPROBANTE DE TESORERÍA - ${payment.paymentNumber}*\n` +
      `📅 Fecha: ${new Date(payment.paymentDate).toLocaleString('es-EC')}\n` +
      `💰 Monto: $${numAmount.toFixed(2)} USD (${isInflow ? 'Ingreso' : 'Egreso'})\n` +
      `📂 Categoría: ${payment.category.replace(/_/g, ' ').toUpperCase()}\n` +
      `💳 Método: ${getMethodLabel(payment.paymentMethod)}\n` +
      `🏦 Caja/Banco: ${payment.bankOrAccount}\n` +
      (payment.referenceNumber ? `🔢 Referencia: ${payment.referenceNumber}\n` : '') +
      (payment.orderNumber ? `📦 Pedido: #${payment.orderNumber}\n` : '') +
      (payment.purchaseNumber ? `🏷️ Compra: #${payment.purchaseNumber}\n` : '') +
      (payment.customerName ? `👤 Cliente: ${payment.customerName}\n` : '') +
      (payment.supplierName ? `🏢 Proveedor: ${payment.supplierName}\n` : '') +
      (payment.notes ? `📝 Notas: ${payment.notes}\n` : '');

    navigator.clipboard.writeText(text);
    if (showToast) {
      showToast('✓ Resumen del comprobante copiado al portapapeles');
    }
  };

  return (
    <div id="payment-modal-overlay" className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 my-auto overflow-hidden">
        {/* Top Header */}
        <div id="payment-modal-header" className="p-5 bg-slate-900 text-white flex items-center justify-between no-print">
          <div className="flex items-center space-x-2.5">
            <Receipt className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-black text-sm sm:text-base">Comprobante de Tesorería</h3>
              <p className="text-xs text-slate-400 font-mono">{payment.paymentNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thermal Width Selector */}
        <div className="px-5 pt-3 pb-1 bg-slate-50 border-b border-slate-100 no-print">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-extrabold text-slate-600 flex items-center gap-1">
              <Sliders className="w-3 h-3 text-sky-600" />
              <span>Ancho de Impresora Térmica:</span>
            </span>
            <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
              {thermalWidth}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {(['44mm', '48mm', '58mm', '80mm'] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setThermalWidth(w)}
                className={`py-1 rounded-lg text-xs font-bold text-center border transition cursor-pointer ${
                  thermalWidth === w
                    ? 'bg-sky-600 text-white border-sky-600 shadow-2xs ring-1 ring-sky-200'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between text-[10px] bg-sky-50/80 border border-sky-200/80 rounded-lg px-2 py-1 mt-1.5 text-sky-950">
            <span className="font-semibold flex items-center gap-1">
              <span className="text-sky-600 font-bold">✓ Formato enviado:</span>
              <strong>{currentReceiptCfg.mm} mm (Rollo continuo)</strong>
            </span>
            <span className="text-[9px] font-bold text-sky-700 bg-white px-1.5 py-0.5 rounded border border-sky-200">
              Rollo térmico (Sin A4)
            </span>
          </div>
        </div>

        {/* Printable Ticket Receipt Area */}
        <div id="printable-payment-receipt" className="p-5 space-y-3.5 text-xs text-slate-700 max-h-[60vh] overflow-y-auto">
          {isVoided && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-center font-black">
              ⚠️ COMPROBANTE ANULADO
            </div>
          )}

          {/* Amount Badge */}
          <div className="text-center py-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
              {isInflow ? 'Monto Cobrado (Ingreso)' : 'Monto Desembolsado (Egreso)'}
            </span>
            <div
              className={`text-2xl sm:text-3xl font-black font-mono tracking-tight mt-1 ${
                isVoided ? 'line-through text-slate-400' : isInflow ? 'text-emerald-600' : 'text-slate-900'
              }`}
            >
              ${numAmount.toFixed(2)} USD
            </div>
            <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold">
              {payment.category.replace(/_/g, ' ').toUpperCase()}
            </span>
          </div>

          {/* Information Rows */}
          <div className="space-y-2 border-t border-b border-slate-100 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">N° Comprobante:</span>
              <span className="font-mono font-bold text-slate-900">{payment.paymentNumber}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">Fecha y Hora:</span>
              <span className="font-bold text-slate-900">
                {new Date(payment.paymentDate).toLocaleString('es-EC', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">Método de Pago:</span>
              <span className="font-bold text-slate-900">{getMethodLabel(payment.paymentMethod)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">Caja / Banco:</span>
              <span className="font-bold text-slate-900">{payment.bankOrAccount}</span>
            </div>

            {payment.referenceNumber && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Referencia Bancaria:</span>
                <span className="font-mono font-bold text-slate-900">{payment.referenceNumber}</span>
              </div>
            )}

            {payment.orderNumber && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Pedido Vinculado:</span>
                <span className="font-bold text-sky-700">#{payment.orderNumber}</span>
              </div>
            )}

            {payment.purchaseNumber && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Compra Proveedor:</span>
                <span className="font-bold text-amber-800">#{payment.purchaseNumber}</span>
              </div>
            )}

            {payment.customerName && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Cliente:</span>
                <span className="font-bold text-slate-900">{payment.customerName}</span>
              </div>
            )}

            {payment.supplierName && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Proveedor:</span>
                <span className="font-bold text-slate-900">{payment.supplierName}</span>
              </div>
            )}
          </div>

          {/* Audit Notes */}
          {payment.notes && (
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Observaciones y Auditoría ERP:</span>
              <p className="text-[11px] text-slate-600 whitespace-pre-line font-mono">{payment.notes}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div id="payment-modal-footer" className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 no-print">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            Cerrar
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySummary}
              type="button"
              title="Copiar texto del comprobante"
              className="p-2 text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer border border-slate-200 bg-white"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleOpenInNewTab}
              type="button"
              title="Abrir comprobante en nueva pestaña"
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer border border-slate-200"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Nueva Pestaña</span>
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              type="button"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              <span>Imprimir Recibo ({thermalWidth})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

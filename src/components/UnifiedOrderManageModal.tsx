import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  Barcode,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  Edit3,
  ExternalLink,
  Lock,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Phone,
  Plus,
  Printer,
  Receipt,
  Search,
  Sparkles,
  Store,
  Trash2,
  Truck,
  User,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { CustomerOrder, StoreConfig, InventoryItem, CourierPartner, PaymentMethodPartner } from '../types.ts';
import {
  getCustomerCi,
  stripCiFromAddress,
  isConcatenatedShippingAddress,
  parseCustomerShippingData,
  isOrderLockedFromEditing,
  getOrderEditBlockReason,
  isOrderPartiallyDelivered,
  isOnlineStoreOrder,
  deriveBankOrAccountFromMethod,
} from '../utils/orderUtils.ts';
import { normalizeEcuadorPhone, buildWhatsAppLink, isCashPayment } from '../utils/phone.ts';
import { validateEcuadorId } from '../utils/ecuadorIdValidator.ts';
import { directPrintShippingTicket } from './ShippingTicketModal.tsx';
import { directPrintOrder } from '../utils/directOrderPrint.ts';
import { OrderPrintA4Modal } from './OrderPrintA4Modal.tsx';
import { calculateLineItem, calculateInvoiceTotals, extractBaseUnitPriceWithoutTax, extractItemTaxPercent } from '../utils/ecuadorTaxCalculator.ts';

export interface UnifiedOrderManageModalProps {
  order: CustomerOrder | null;
  isOpen: boolean;
  isManualCreate?: boolean;
  onClose: () => void;
  storeConfig: StoreConfig;
  currency: string;
  products: InventoryItem[];
  purchases?: any[];
  dbCustomers?: any[];
  paymentPartners: PaymentMethodPartner[];
  courierPartners: CourierPartner[];
  onCreateOrder?: (orderData: any) => Promise<{ success: boolean; order?: CustomerOrder; orderNumber?: string }>;
  onUpdateOrder?: (id: number, orderData: Partial<CustomerOrder>) => Promise<boolean>;
  onUpdateOrderStatus: (
    id: number,
    status: CustomerOrder['status'],
    paymentVoucher?: string,
    notes?: string,
    trackingNumber?: string,
    trackingCarrier?: string,
    trackingNotes?: string,
    shippingCost?: string,
    paymentMethod?: string,
    bankOrAccount?: string,
    customerCi?: string,
    cardCommissionPercent?: number | string
  ) => Promise<boolean>;
  showToast: (msg: string) => void;
  onOpenShippingTicket?: (order: CustomerOrder) => void;
  onOpenPrintA4Order?: (order: CustomerOrder) => void;
  onCancelOrderClick?: (order: CustomerOrder) => void;
  onGenerateSupplierPurchase?: (order: CustomerOrder) => void | Promise<void>;
  onOpenPendingShipping?: (order: CustomerOrder) => void;
}

const DEFAULT_COURIER_LOGOS: Record<string, string> = {
  servientrega: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=160&auto=format&fit=crop&q=80',
  laarcourier: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=160&auto=format&fit=crop&q=80',
  urbano: 'https://images.unsplash.com/photo-1616401784845-180882ba9ba8?w=160&auto=format&fit=crop&q=80',
  tramaco: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=160&auto=format&fit=crop&q=80',
  motorizado: 'https://images.unsplash.com/photo-1526367790999-0150786686a2?w=160&auto=format&fit=crop&q=80',
};

const DEFAULT_PAYMENT_LOGOS: Record<string, string> = {
  pichincha: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=160&auto=format&fit=crop&q=80',
  guayaquil: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=160&auto=format&fit=crop&q=80',
  deuna: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=160&auto=format&fit=crop&q=80',
  zelle: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=160&auto=format&fit=crop&q=80',
  tarjeta: 'https://images.unsplash.com/photo-1556742049-0a67c557689c?w=160&auto=format&fit=crop&q=80',
  efectivo: 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=160&auto=format&fit=crop&q=80',
};

const getPartnerLogo = (partner: { logoUrl?: string; name: string; id?: string }, type: 'courier' | 'payment'): string | null => {
  if (partner.logoUrl) return partner.logoUrl;
  const nameLower = (partner.name || '').toLowerCase();
  const idLower = (partner.id || '').toLowerCase();
  const dict = type === 'courier' ? DEFAULT_COURIER_LOGOS : DEFAULT_PAYMENT_LOGOS;
  for (const [key, url] of Object.entries(dict)) {
    if (nameLower.includes(key) || idLower.includes(key)) return url;
  }
  return null;
};

export const UnifiedOrderManageModal: React.FC<UnifiedOrderManageModalProps> = ({
  order,
  isOpen,
  isManualCreate = false,
  onClose,
  storeConfig,
  currency,
  products,
  purchases,
  dbCustomers = [],
  paymentPartners,
  courierPartners,
  onCreateOrder,
  onUpdateOrder,
  onUpdateOrderStatus,
  showToast,
  onOpenShippingTicket,
  onOpenPrintA4Order,
  onCancelOrderClick,
  onGenerateSupplierPurchase,
  onOpenPendingShipping,
}) => {
  const isCreateMode = isManualCreate || !order;

  if (!isOpen) return null;

  // Active configured payment partners (registered in store settings)
  const activePaymentPartners = useMemo(() => {
    return (paymentPartners || []).filter((p) => p.active !== false);
  }, [paymentPartners]);

  // Active courier partners (registered in store settings)
  const activeCouriers = useMemo(() => {
    return (courierPartners || []).filter((c) => c.active !== false);
  }, [courierPartners]);

  // Helper to resolve official quote / tarifario portal for a courier company
  const getCourierQuoteUrl = (carrierNameOrObj: string | CourierPartner): string => {
    if (typeof carrierNameOrObj === 'object' && carrierNameOrObj?.quoteUrl) {
      return carrierNameOrObj.quoteUrl;
    }
    const name = typeof carrierNameOrObj === 'string' ? carrierNameOrObj : carrierNameOrObj?.name || '';
    const match = activeCouriers.find(
      (c) => c.name.toLowerCase() === name.toLowerCase() || c.id?.toLowerCase() === name.toLowerCase()
    );
    if (match?.quoteUrl) return match.quoteUrl;

    const lower = name.toLowerCase();
    if (lower.includes('servientrega')) return 'https://www.servientrega.com.ec/tarifario';
    if (lower.includes('laar')) return 'https://laarcourier.com/cotizador';
    if (lower.includes('urbano')) return 'https://www.urbano.com.ec/';
    if (lower.includes('tramaco')) return 'https://www.tramaco.com.ec/';
    if (lower.includes('envia')) return 'https://envia.com/';
    if (lower.includes('motorizado') || lower.includes('express')) return 'https://www.google.com/maps';
    return `https://www.google.com/search?q=${encodeURIComponent(name + ' cotizador envios ecuador')}`;
  };

  // Customer Data State
  const [customerCi, setCustomerCi] = useState<string>('');
  const [docType, setDocType] = useState<'05' | '04' | '07' | '06'>('05');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [customerFiscalAddress, setCustomerFiscalAddress] = useState<string>('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState<boolean>(false);
  const [matchedCustomerInfo, setMatchedCustomerInfo] = useState<any | null>(null);
  const [ecuadorApiStatus, setEcuadorApiStatus] = useState<{ loading: boolean; source?: string; message?: string } | null>(null);

  const handleSelectDocType = (newType: '05' | '04' | '07' | '06') => {
    setDocType(newType);
    if (newType === '07') {
      setCustomerCi('9999999999999');
      setCustomerPhone('0000000000');
      if (!customerName.trim() || customerName.trim().toUpperCase() === 'CONSUMIDOR FINAL') {
        setCustomerName('CONSUMIDOR FINAL');
      }
    } else {
      if (customerCi.trim() === '9999999999999') {
        setCustomerCi('');
      }
      if (customerPhone === '0000000000') {
        setCustomerPhone('');
      }
      if (customerName.trim().toUpperCase() === 'CONSUMIDOR FINAL') {
        setCustomerName('');
      }

      if (customerCi) {
        let formatted = customerCi.trim();
        if (newType === '05') {
          formatted = formatted.replace(/\D/g, '').slice(0, 10);
        } else if (newType === '04') {
          formatted = formatted.replace(/\D/g, '').slice(0, 13);
        } else if (newType === '06') {
          formatted = formatted.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 20);
        }
        setCustomerCi(formatted);
      }
    }
  };

  // Facturación Electrónica SRI State
  const [sriEmitting, setSriEmitting] = useState(false);
  const [sriInvoiceRecord, setSriInvoiceRecord] = useState<any | null>(null);
  const [sriEmissionResult, setSriEmissionResult] = useState<{
    estado: string;
    motivo?: string;
    autorizado: boolean;
    devuelto: boolean;
    emisorUsado?: any;
  } | null>(null);

  useEffect(() => {
    setSriEmissionResult(null);
    if (order && order.id) {
      fetch('/api/sri/facturas')
        .then((res) => res.json())
        .then((data) => {
          if (data.invoices) {
            const match = data.invoices.find((inv: any) => inv.orderId === order.id && (inv.estadoAutorizacion === 'AUTORIZADO' || inv.estadoAutorizacion === 'SIMULADO_OK'));
            setSriInvoiceRecord(match || null);
          }
        })
        .catch(() => {});
    } else {
      setSriInvoiceRecord(null);
    }
  }, [order]);

  // Fetch Payphone API configuration when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setPayphoneUrl(null);
    fetch('/api/payphone/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.config) {
          setPayphoneConfig({
            isActive: data.config.isActive !== false,
            hasToken: Boolean(data.config.hasToken),
          });
        }
      })
      .catch(() => {});
  }, [isOpen]);

  const handleEmitSriInvoice = async () => {
    if (!order || !order.id) {
      showToast('⚠️ Debes guardar el pedido antes de emitir la Factura Electrónica SRI.');
      return;
    }

    setSriEmitting(true);
    setSriEmissionResult(null);
    try {
      const res = await fetch(`/api/sri/emitir/${order.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceSimulated: false }),
      });
      const data = await res.json();
      const isAuth = Boolean(data.success || data.autorizado || data.estado === 'AUTORIZADO');
      if (data.invoice && isAuth) {
        setSriInvoiceRecord(data.invoice);
      }
      const resultObj = {
        estado: data.estado || (isAuth ? 'AUTORIZADO' : 'DEVUELTO'),
        motivo: data.motivo || data.error || '',
        autorizado: isAuth,
        devuelto: !isAuth,
        emisorUsado: data.emisorUsado,
      };

      setSriEmissionResult(resultObj);

      if (isAuth) {
        showToast(`✓ Factura Electrónica SRI #${data.invoice?.secuencial || ''} AUTORIZADA exitosamente`);
      } else {
        const errorMsg = data.motivo || data.error || 'Factura DEVUELTA por el SRI';
        showToast(`❌ Factura SRI DEVUELTA: ${errorMsg}`);
      }
    } catch (err: any) {
      console.error('Error emitting SRI invoice:', err);
      setSriEmissionResult({
        estado: 'ERROR DE CONEXION',
        motivo: err.message || 'Error al conectar con el web service del SRI',
        autorizado: false,
        devuelto: true,
      });
      showToast('⚠️ Error de conexión al comunicarse con el SRI');
    } finally {
      setSriEmitting(false);
    }
  };

  // Auto-fetch Ecuador API (Cedula/RUC) if customer is not found in local CRM database
  useEffect(() => {
    if (!isOpen) return;
    const cleanDigits = (customerCi || '').replace(/\D/g, '');
    if (cleanDigits.length !== 10 && cleanDigits.length !== 13) {
      setEcuadorApiStatus(null);
      return;
    }

    // 1. Check if customer already exists in local database (dbCustomers)
    const foundInLocal = (dbCustomers || []).find((c: any) => {
      const cCi = (c.ci || '').replace(/\D/g, '');
      return cCi && cCi === cleanDigits;
    });

    if (foundInLocal) {
      setEcuadorApiStatus(null);
      return; // Already matched locally from CRM
    }

    // 2. Not found in local database -> query Ecuador API with short debounce
    const timer = setTimeout(async () => {
      setEcuadorApiStatus({ loading: true });
      try {
        const isRuc = cleanDigits.length === 13;
        const endpoint = isRuc ? `/api/ecuador-api/rucs/${cleanDigits}` : `/api/ecuador-api/cedulas/${cleanDigits}`;
        const res = await fetch(endpoint);
        const data = await res.json();

        if (res.ok && data.success && data.data) {
          const name = isRuc
            ? (data.data.business_name || data.data.trade_name || '')
            : (data.data.full_name || `${data.data.first_name || ''} ${data.data.last_name || ''}`.trim());

          if (name) {
            setCustomerName(name);
            const resolvedAddress = data.data.address ? data.data.address.trim() : '';
            if (resolvedAddress && !customerFiscalAddress) {
              setCustomerFiscalAddress(resolvedAddress);
            }

            // Auto-save customer to CRM DB immediately even if prefactura is not saved
            try {
              const saveRes = await fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: name,
                  fullName: name,
                  ci: cleanDigits,
                  phone: (customerPhone || '').trim() || '0000000000',
                  address: resolvedAddress || undefined,
                  notes: 'Registrado automáticamente desde consulta Ecuador API',
                }),
              });
              if (saveRes.ok) {
                const savedCust = await saveRes.json();
                setMatchedCustomerInfo({
                  ci: cleanDigits,
                  name: name,
                  phone: savedCust?.phone || customerPhone || '0000000000',
                  source: 'Ecuador API (Guardado en CRM)',
                });
              }
            } catch (saveErr) {
              console.warn('Error auto-saving customer from Ecuador API:', saveErr);
            }

            setEcuadorApiStatus({
              loading: false,
              source: 'Ecuador API',
              message: `✓ ${isRuc ? 'Razón Social' : 'Nombre'} autocompletado y guardado en CRM`,
            });
          } else {
            setEcuadorApiStatus(null);
          }
        } else {
          setEcuadorApiStatus(null);
        }
      } catch (err) {
        console.error('Error auto-fetching Ecuador API:', err);
        setEcuadorApiStatus(null);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [customerCi, dbCustomers, isOpen]);

  // Delivery & Logistics Data State
  const [deliveryType, setDeliveryType] = useState<'pickup' | 'shipping'>('pickup');
  const [province, setProvince] = useState<string>('');
  const [canton, setCanton] = useState<string>('');
  const [parish, setParish] = useState<string>('');
  const [exactAddress, setExactAddress] = useState<string>('');
  const [reference, setReference] = useState<string>('');

  const lastSavedCustomerRef = useRef<string>('');

  // Real-time customer auto-sync effect (debounced 600ms)
  useEffect(() => {
    if (!isOpen || docType === '07') return;
    const cleanDigits = (customerCi || '').replace(/\D/g, '');
    if (cleanDigits.length !== 10 && cleanDigits.length !== 13) return;
    if (cleanDigits === '9999999999999') return;
    if (!customerName || customerName.trim().length < 2) return;

    const payload = {
      ci: cleanDigits,
      name: customerName.trim(),
      fullName: customerName.trim(),
      phone: (customerPhone || '').trim(),
      email: (customerEmail || '').trim() || undefined,
      address: (customerFiscalAddress || '').trim() || undefined,
      province: (province || '').trim() || undefined,
      canton: (canton || '').trim() || undefined,
      parish: (parish || '').trim() || undefined,
      exactAddress: (exactAddress || '').trim() || undefined,
      reference: (reference || '').trim() || undefined,
    };

    const payloadKey = JSON.stringify(payload);
    if (payloadKey === lastSavedCustomerRef.current) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const savedCust = await res.json();
          lastSavedCustomerRef.current = payloadKey;
          setMatchedCustomerInfo({
            ci: cleanDigits,
            name: customerName.trim(),
            phone: savedCust?.phone || customerPhone || '',
            source: 'Actualizado en CRM (Tiempo real)',
          });
        }
      } catch (saveErr) {
        console.warn('Real-time customer auto-sync warning in OrderModal:', saveErr);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [
    isOpen,
    docType,
    customerCi,
    customerName,
    customerPhone,
    customerEmail,
    customerFiscalAddress,
    province,
    canton,
    parish,
    exactAddress,
    reference,
  ]);

  const [trackingCarrier, setTrackingCarrier] = useState<string>(activeCouriers[0]?.name || 'Servientrega');
  const [trackingNumber, setTrackingNumber] = useState<string>('');
  const [trackingNotes, setTrackingNotes] = useState<string>('');
  const [shippingCost, setShippingCost] = useState<string>('0');
  const [showPrintA4Modal, setShowPrintA4Modal] = useState<boolean>(false);

  // Items List
  const [items, setItems] = useState<
    Array<{
      id?: number;
      inventoryItemId?: number;
      name: string;
      sku: string;
      barcode?: string;
      costPrice?: number;
      supplierName?: string;
      salePrice: number;
      discount?: number;
      discountPercent?: number;
      quantity: number;
      imageUrl?: string | null;
      saleTaxPercent?: number;
      supplierCode?: string;
    }>
  >([]);

  // Synchronize delivery fee as a 0% IVA line item ("Servicios de entrega")
  useEffect(() => {
    if (!isOpen) return;

    const shipVal = deliveryType === 'shipping' ? Math.max(0, Number(shippingCost) || 0) : 0;

    setItems((prev) => {
      const existingIdx = prev.findIndex(
        (it) => it.sku === 'ENVIO-DOMICILIO' || it.name === 'Servicios de entrega' || it.id === -999
      );

      if (shipVal > 0) {
        const shippingItemObj = {
          id: -999,
          inventoryItemId: -999,
          name: 'Servicios de entrega',
          sku: 'ENVIO-DOMICILIO',
          barcode: 'FLETE-001',
          costPrice: 0,
          marginPercent: 0,
          salePrice: shipVal,
          discount: 0,
          discountPercent: 0,
          quantity: 1,
          saleTaxPercent: 0,
          imageUrl: null,
        };

        if (existingIdx >= 0) {
          const currentItem = prev[existingIdx];
          if (currentItem.salePrice === shipVal && (currentItem as any).saleTaxPercent === 0) {
            return prev;
          }
          return prev.map((it, idx) => (idx === existingIdx ? { ...it, salePrice: shipVal, saleTaxPercent: 0 } : it));
        } else {
          return [...prev, shippingItemObj];
        }
      } else {
        if (existingIdx >= 0) {
          return prev.filter((_, idx) => idx !== existingIdx);
        }
        return prev;
      }
    });
  }, [deliveryType, shippingCost, isOpen]);

  // Product Search for Adding
  const [productSearch, setProductSearch] = useState<string>('');
  const [showProductDropdown, setShowProductDropdown] = useState<boolean>(false);

  // Payment & Treasury
  const [paymentMethod, setPaymentMethod] = useState<string>('whatsapp');
  const [cardCommissionPercent, setCardCommissionPercent] = useState<number>(5.75);
  const [bankOrAccount, setBankOrAccount] = useState<string>('');
  const [voucherInput, setVoucherInput] = useState<string>('');
  const [notesInput, setNotesInput] = useState<string>('');
  const [autoCreatePurchase, setAutoCreatePurchase] = useState<boolean>(false);
  // Tax & Invoice state (Ecuador Tax Standard: 15% IVA)
  const [applySaleTax, setApplySaleTax] = useState<boolean>(false);
  const [saleTaxPercent, setSaleTaxPercent] = useState<number>(15);

  // Execution states
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);

  // Payphone API State
  const [payphoneConfig, setPayphoneConfig] = useState<{ isActive: boolean; hasToken: boolean } | null>(null);
  const [payphoneUrl, setPayphoneUrl] = useState<string | null>(null);
  const [payphoneGenerating, setPayphoneGenerating] = useState(false);
  const [payphoneSendingEmail, setPayphoneSendingEmail] = useState(false);
  const [lastPayphoneClientTxId, setLastPayphoneClientTxId] = useState<string | null>(null);
  const [payphoneVerifying, setPayphoneVerifying] = useState(false);
  const [payphoneResultModal, setPayphoneResultModal] = useState<{
    open: boolean;
    status: 'APPROVED' | 'REJECTED' | 'PENDING';
    transactionId?: string;
    authorizationCode?: string;
    amount?: number;
    cardType?: string;
    isTestMode?: boolean;
    message?: string;
  }>({ open: false, status: 'PENDING' });

  // Order status
  const orderStatus = order?.status || 'pending';
  const isConfirmed = orderStatus === 'confirmed';
  const isShipped = orderStatus === 'shipped';
  const isDelivered = orderStatus === 'delivered';
  const isCancelled = orderStatus === 'cancelled';
  const isPartial = order ? isOrderPartiallyDelivered(order) : false;
  // Las pre-facturas (pedidos en estado 'pending') son SIEMPRE editables hasta que se confirman.
  const isLockedFromEdit = !isCreateMode && orderStatus !== 'pending' && (isConfirmed || isShipped || isDelivered || isCancelled || isPartial);

  // Guard session initialization to prevent background polling or re-renders from wiping user inputs
  const initializedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      initializedSessionRef.current = null;
    }
  }, [isOpen]);

  // Initialize or reset form state on open / order change (strictly once per open session)
  useEffect(() => {
    if (!isOpen) return;

    const currentSessionKey = isCreateMode ? 'create-new-order' : `edit-order-${order?.id}`;
    if (initializedSessionRef.current === currentSessionKey) {
      return;
    }

    initializedSessionRef.current = currentSessionKey;

    if (isCreateMode) {
      // Initialize fresh for manual creation
      setCustomerCi('');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setCustomerFiscalAddress('');
      setMatchedCustomerInfo(null);
      setDeliveryType('pickup');
      setProvince('');
      setCanton('');
      setParish('');
      setExactAddress('');
      setReference('');
      setTrackingCarrier(activeCouriers[0]?.name || 'Servientrega');
      setTrackingNumber('');
      setTrackingNotes('');
      setShippingCost(String(storeConfig.deliveryFee || '0'));
      setItems([]);
      setProductSearch('');
      setPaymentMethod(activePaymentPartners[0]?.name || 'whatsapp');
      setCardCommissionPercent(5.75);
      setBankOrAccount(activePaymentPartners[0]?.name || '');
      setVoucherInput('');
      setNotesInput('');
      setAutoCreatePurchase(false);
      setApplySaleTax(true);
      setSaleTaxPercent(15);
      setVoucherError(null);
    } else if (order) {
      // Initialize from existing order
      const cleanCi = isOnlineStoreOrder(order)
        ? ((order as any).customerCi || (order as any).ci || '').trim()
        : (getCustomerCi(order) || '');
      setCustomerCi(cleanCi);
      setCustomerName(order.customerName || '');
      setCustomerPhone(order.customerPhone || '');
      setCustomerEmail(order.customerEmail || (order as any).email || '');

      // Identify customer in CRM
      const cleanPhoneDigits = (order.customerPhone || '').replace(/\D/g, '');
      const foundCust = (dbCustomers || []).find(
        (c: any) =>
          (c.ci && cleanCi && c.ci.trim().toLowerCase() === cleanCi.trim().toLowerCase()) ||
          (c.phone && cleanPhoneDigits && c.phone.replace(/\D/g, '') === cleanPhoneDigits)
      );
      if (foundCust) {
        setMatchedCustomerInfo({
          ci: foundCust.ci,
          name: foundCust.fullName || foundCust.name,
          phone: foundCust.phone,
          source: 'CRM de Clientes',
        });
      } else {
        setMatchedCustomerInfo(null);
      }

      // Fiscal address
      let initialFiscal = (order as any).clientAddress || foundCust?.address || '';
      if (isConcatenatedShippingAddress(initialFiscal)) {
        const parsed = parseCustomerShippingData(initialFiscal);
        initialFiscal = parsed.exactAddress || '';
      }
      setCustomerFiscalAddress(initialFiscal);

      // Delivery Type & Address
      const rawType = (order as any).deliveryType || (order.customerAddress?.toLowerCase().includes('retiro en local') ? 'pickup' : 'shipping');
      setDeliveryType(rawType === 'pickup' ? 'pickup' : 'shipping');

      const rawShipAddr = (order as any).shippingAddress || stripCiFromAddress(order.customerAddress) || '';

      // Parse structured address from raw address
      const parsedAddr = parseCustomerShippingData(rawShipAddr);
      setProvince(parsedAddr.province || '');
      setCanton(parsedAddr.canton || '');
      setParish(parsedAddr.parish || '');
      setExactAddress(parsedAddr.exactAddress || (parsedAddr.province ? '' : rawShipAddr));
      setReference(parsedAddr.reference || '');

      setTrackingCarrier((order as any).trackingCarrier || activeCouriers[0]?.name || 'Servientrega');
      setTrackingNumber((order as any).trackingNumber || '');
      setTrackingNotes((order as any).trackingNotes || '');

      // Parse existing items
      const rawItems = Array.isArray(order.items) ? order.items : [];
      const orderApplyTax = (order as any).applySaleTax !== false;
      const orderTaxPct = Number((order as any).saleTaxPercent || 15);
      const parsedItems = rawItems.map((it: any) => {
        const isShippingLine = it.sku === 'ENVIO-DOMICILIO' || (it.name && it.name.trim() === 'Servicios de entrega') || it.id === -999;
        const targetId = isShippingLine ? -999 : (it.inventoryItemId || it.id);
        const matchingProduct = isShippingLine ? null : products.find((p) => p.id === targetId || (it.sku && p.sku && p.sku.toLowerCase() === it.sku.toLowerCase()));
        const cPrice = isShippingLine ? 0 : Number(it.costPrice ?? matchingProduct?.costWithoutTax ?? matchingProduct?.costPrice ?? 0);
        const hasItemSalePrice = (it.salePrice !== undefined && it.salePrice !== null && !isNaN(Number(it.salePrice))) ||
                                 (it.item?.salePrice !== undefined && it.item?.salePrice !== null && !isNaN(Number(it.item.salePrice)));
        const rawSale = Number(it.salePrice || it.item?.salePrice || matchingProduct?.salePrice || 0);
        const itemTaxPct = isShippingLine ? 0 : extractItemTaxPercent(it, orderTaxPct, matchingProduct);
        const itemApplyTax = itemTaxPct > 0;
        const pricingMode = isShippingLine
          ? 'EXCLUDING_TAX'
          : (hasItemSalePrice
              ? (it.pricingMode ? it.pricingMode : (itemApplyTax && matchingProduct?.salePrice && Math.abs(rawSale - Number(matchingProduct.salePrice)) < 0.01 ? 'INCLUDING_TAX' : 'EXCLUDING_TAX'))
              : (itemApplyTax ? 'INCLUDING_TAX' : 'EXCLUDING_TAX'));
        const basePriceInfo = extractBaseUnitPriceWithoutTax({
          rawSalePrice: rawSale,
          costWithoutTax: cPrice,
          pricingMode,
          applySaleTax: itemApplyTax,
          saleTaxPercent: itemTaxPct,
          marginPercent: it.marginPercent !== undefined ? Number(it.marginPercent) : (matchingProduct as any)?.marginPercent,
        });
        const baseSalePrice = isShippingLine ? rawSale : basePriceInfo.unitPriceWithoutTax;
        const marginPct = isShippingLine ? 0 : basePriceInfo.marginPercent;
        let discVal = isShippingLine ? 0 : Number(it.discount ?? 0);
        if (!isShippingLine && discVal === 0 && (it.discountPercent || matchingProduct?.discountPercent)) {
          const pct = Number(it.discountPercent || matchingProduct?.discountPercent || 0);
          if (pct > 0) {
            discVal = Math.round((baseSalePrice * pct / 100) * 100) / 100;
          }
        }
        return {
          id: targetId,
          inventoryItemId: targetId,
          name: isShippingLine ? 'Servicios de entrega' : (it.name || it.item?.name || 'Producto'),
          sku: isShippingLine ? 'ENVIO-DOMICILIO' : (it.sku || it.item?.sku || ''),
          barcode: isShippingLine ? 'FLETE-001' : (it.barcode || matchingProduct?.barcode || undefined),
          costPrice: cPrice,
          marginPercent: marginPct,
          supplierName: isShippingLine ? undefined : (it.supplierName || (matchingProduct as any)?.supplier || undefined),
          salePrice: baseSalePrice,
          discount: discVal,
          discountPercent: isShippingLine ? 0 : (it.discountPercent ? Number(it.discountPercent) : (matchingProduct?.discountPercent ? Number(matchingProduct.discountPercent) : 0)),
          quantity: isShippingLine ? 1 : Number(it.quantity || 1),
          saleTaxPercent: isShippingLine ? 0 : itemTaxPct,
          imageUrl: isShippingLine ? null : (it.imageUrl || it.item?.imageUrl || matchingProduct?.imageUrl || null),
        };
      });
      setItems(parsedItems);

      // Shipping cost calculation from existing items or explicit/derived fallback
      const existingShippingItem = parsedItems.find((it: any) => it.sku === 'ENVIO-DOMICILIO' || it.name === 'Servicios de entrega' || it.id === -999);
      if (existingShippingItem) {
        const shipPrice = Number(existingShippingItem.salePrice || 0);
        setShippingCost(String(shipPrice));
        if (shipPrice > 0) {
          setDeliveryType('shipping');
        }
      } else {
        const calculatedItemsForShipping = parsedItems.map((it: any) => {
          const match = products.find((p) => p.id === it.id || (it.sku && p.sku && p.sku.toLowerCase() === it.sku.toLowerCase()));
          const unitCost = Number(it.costPrice ?? match?.costWithoutTax ?? match?.costPrice ?? 0);
          const unitSale = Number(it.salePrice || 0);
          const itemTaxPercent = extractItemTaxPercent(it, orderTaxPct, match);

          return calculateLineItem({
            id: it.id,
            name: it.name,
            sku: it.sku,
            costWithoutTax: unitCost,
            unitSalePrice: unitSale,
            discount: Number(it.discount || 0),
            quantity: Number(it.quantity || 1),
            applySaleTax: itemTaxPercent > 0,
            saleTaxPercent: itemTaxPercent,
          });
        });
        const itemsTotalWithTax = calculatedItemsForShipping.reduce((acc, it) => acc + it.lineTotal, 0);
        const explicitShip = Number((order as any).shippingCost);
        if (!isNaN(explicitShip) && (order as any).shippingCost !== undefined && (order as any).shippingCost !== null) {
          setShippingCost(String(explicitShip));
        } else {
          const isStore = isOnlineStoreOrder(order);
          const orderTotal = Number(order.totalAmount || 0);
          const derivedShip = Math.max(0, orderTotal - itemsTotalWithTax);
          // For online store orders or negligible differences, keep shipping cost at 0
          setShippingCost(!isStore && derivedShip >= 0.05 ? derivedShip.toFixed(2) : '0');
        }
      }

      // Payment & Notes
      const initialMethod = order.paymentMethod || activePaymentPartners[0]?.name || 'whatsapp';
      setPaymentMethod(initialMethod);
      setCardCommissionPercent(Number((order as any).cardCommissionPercent || 5.75));
      const derivedBank = deriveBankOrAccountFromMethod(initialMethod, order.notes || (order as any).bankOrAccount);
      setBankOrAccount((order as any).bankOrAccount || derivedBank);
      setVoucherInput(order.paymentVoucher || '');
      setNotesInput(order.notes || '');
      setApplySaleTax((order as any).applySaleTax !== false);
      setSaleTaxPercent(Number((order as any).saleTaxPercent || 15));
      setVoucherError(null);
    }
  }, [isOpen, isCreateMode, order?.id]);

  // Customer Autocomplete Suggestions
  const matchingCustomerSuggestions = useMemo(() => {
    const q = customerCi.trim().toLowerCase();
    if (!q || q.length < 2 || docType === '07') return [];

    const map = new Map<string, any>();
    // Add from dbCustomers
    (dbCustomers || []).forEach((c: any) => {
      const ci = (c.ci || '').trim();
      const cleanDigits = ci.replace(/\D/g, '');

      // Strict filter by SRI docType:
      if (docType === '05' && cleanDigits.length !== 10) return;
      if (docType === '04' && cleanDigits.length !== 13) return;
      if (docType === '06' && (cleanDigits.length === 10 || cleanDigits.length === 13)) return;

      if (ci && (ci.toLowerCase().includes(q) || (c.fullName || c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q))) {
        map.set(ci.toLowerCase(), {
          ci,
          name: c.fullName || c.name || '',
          phone: c.phone || '',
          email: c.email || '',
          address: c.address || '',
          source: 'CRM de Clientes',
        });
      }
    });

    return Array.from(map.values()).slice(0, 6);
  }, [customerCi, dbCustomers, docType]);

  const handleSelectCustomer = (cust: any) => {
    const rawCi = (cust.ci || '').trim();
    setCustomerCi(rawCi);
    const cleanDigits = rawCi.replace(/\D/g, '');
    if (rawCi === '9999999999999') {
      setDocType('07');
    } else if (cleanDigits.length === 10) {
      setDocType('05');
    } else if (cleanDigits.length === 13) {
      setDocType('04');
    } else if (rawCi.length > 0) {
      setDocType('06');
    }

    if (cust.name) setCustomerName(cust.name);
    if (cust.phone) setCustomerPhone(cust.phone);
    if (cust.email) setCustomerEmail(cust.email);
    if (cust.address) {
      if (!isConcatenatedShippingAddress(cust.address)) {
        setCustomerFiscalAddress(cust.address);
      } else {
        const parsed = parseCustomerShippingData(cust.address);
        setProvince(parsed.province || '');
        setCanton(parsed.canton || '');
        setParish(parsed.parish || '');
        setExactAddress(parsed.exactAddress || '');
        setReference(parsed.reference || '');
      }
    }
    setMatchedCustomerInfo({
      ci: cust.ci,
      name: cust.name,
      phone: cust.phone,
      source: cust.source || 'CRM de Clientes',
    });
    setShowCustomerDropdown(false);
  };

  // Products Search Filter
  const filteredCatalogProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => {
        const nameMatch = (p.name || '').toLowerCase().includes(q);
        const skuMatch = (p.sku || '').toLowerCase().includes(q);
        const barMatch = (p.barcode || '').toLowerCase().includes(q);
        return nameMatch || skuMatch || barMatch;
      })
      .slice(0, 8);
  }, [productSearch, products]);

  const handleAddProduct = (prod: InventoryItem) => {
    setItems((prev) => {
      const existingIdx = prev.findIndex((it) => it.id === prod.id || (prod.sku && it.sku && it.sku.toLowerCase() === prod.sku.toLowerCase()));
      
      const cPrice = Number(prod.costWithoutTax ?? prod.costPrice ?? 0);
      const rawSale = Number(prod.salePrice || 0);
      const prodTaxPercent = extractItemTaxPercent(prod, 15);
      const prodApplyTax = prodTaxPercent > 0;

      const basePriceInfo = extractBaseUnitPriceWithoutTax({
        rawSalePrice: rawSale,
        costWithoutTax: cPrice,
        pricingMode: prodApplyTax ? 'INCLUDING_TAX' : 'EXCLUDING_TAX',
        applySaleTax: prodApplyTax,
        saleTaxPercent: prodTaxPercent,
        marginPercent: (prod as any).marginPercent !== undefined ? Number((prod as any).marginPercent) : undefined,
      });
      const sPrice = basePriceInfo.unitPriceWithoutTax;
      const marginPct = basePriceInfo.marginPercent;
      let discVal = 0;
      if (prod.discountPercent && prod.discountPercent > 0) {
        discVal = Math.round((sPrice * prod.discountPercent / 100) * 100) / 100;
      } else if ((prod as any).discount) {
        discVal = Number((prod as any).discount || 0);
      }

      const existingItem = existingIdx >= 0 ? prev[existingIdx] : null;
      const newItemObj = {
        id: prod.id,
        inventoryItemId: prod.id,
        name: prod.name,
        sku: prod.sku || '',
        barcode: prod.barcode || undefined,
        costPrice: cPrice,
        marginPercent: marginPct,
        supplierName: (prod as any).supplier || (prod as any).supplierName || undefined,
        salePrice: sPrice,
        discount: discVal,
        discountPercent: prod.discountPercent || 0,
        quantity: existingItem ? existingItem.quantity + 1 : 1,
        imageUrl: prod.imageUrl || null,
      };

      const rest = prev.filter((_, idx) => idx !== existingIdx);
      return [newItemObj, ...rest];
    });
    setProductSearch('');
    setShowProductDropdown(false);
  };

  // Barcode / SKU scanner compatibility: 100% exact match auto-adds when Enter is pressed
  const handleProductSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = productSearch.trim().toLowerCase();
      if (!query) return;

      // Check 100% match on Barcode or SKU
      const exactBarcodeOrSkuMatch = products.find((p) => {
        const bar = (p.barcode || '').trim().toLowerCase();
        const sku = (p.sku || '').trim().toLowerCase();
        return (bar && bar === query) || (sku && sku === query);
      });

      if (exactBarcodeOrSkuMatch) {
        handleAddProduct(exactBarcodeOrSkuMatch);
        showToast(`✓ Producto agregado por código: ${exactBarcodeOrSkuMatch.name}`);
        return;
      }

      // Check 100% match on Name
      const exactNameMatch = products.find((p) => (p.name || '').trim().toLowerCase() === query);
      if (exactNameMatch) {
        handleAddProduct(exactNameMatch);
        showToast(`✓ Producto agregado: ${exactNameMatch.name}`);
        return;
      }

      // If only 1 product matches the search filter
      if (filteredCatalogProducts.length === 1) {
        handleAddProduct(filteredCatalogProducts[0]);
        showToast(`✓ Producto agregado: ${filteredCatalogProducts[0].name}`);
      }
    }
  };

  // Stock deficit analysis
  const stockAnalysis = useMemo(() => {
    let totalDeficitUnits = 0;
    const itemsWithDeficit: Array<{
      name: string;
      requested: number;
      available: number;
      missing: number;
    }> = [];

    items.forEach((it) => {
      if (it.sku === 'ENVIO-DOMICILIO' || it.name === 'Servicios de entrega' || it.id === -999) return;
      const match = products.find((p) => p.id === it.id || (it.sku && p.sku && p.sku.toLowerCase() === it.sku.toLowerCase()));
      const avail = match ? Math.max(0, Number(match.stock || 0)) : 0;
      if (it.quantity > avail) {
        const missing = it.quantity - avail;
        totalDeficitUnits += missing;
        itemsWithDeficit.push({
          name: it.name,
          requested: it.quantity,
          available: avail,
          missing,
        });
      }
    });

    return {
      hasDeficit: totalDeficitUnits > 0,
      totalDeficitUnits,
      itemsWithDeficit,
    };
  }, [items, products]);

  const isCardPaymentMethod = useMemo(() => {
    if (!paymentMethod) return false;
    const pm = paymentMethod.toLowerCase().trim();
    return pm === 'tarjeta' || pm === 'payphone' || pm.includes('tarjeta') || pm.includes('payphone') || pm.includes('card');
  }, [paymentMethod]);

  // Financial Calculations - SRI Ecuador Central Engine
  const invoiceTotals = useMemo(() => {
    const calculatedItems = items.map((it) => {
      const isShippingLine = it.sku === 'ENVIO-DOMICILIO' || it.name === 'Servicios de entrega' || it.id === -999;
      const match = isShippingLine ? null : products.find((p) => p.id === it.id || (it.sku && p.sku && p.sku.toLowerCase() === it.sku.toLowerCase()));
      const unitCost = Number(it.costPrice ?? match?.costWithoutTax ?? match?.costPrice ?? 0);
      const unitSale = Number(it.salePrice || 0);
      const itemTaxPercent = isShippingLine ? 0 : extractItemTaxPercent(it, 15, match);

      return calculateLineItem({
        id: it.id,
        name: it.name,
        sku: it.sku,
        costWithoutTax: unitCost,
        unitSalePrice: unitSale,
        pricingMode: 'EXCLUDING_TAX',
        discount: Number(it.discount || 0),
        quantity: Number(it.quantity || 1),
        applySaleTax: itemTaxPercent > 0,
        saleTaxPercent: itemTaxPercent,
        isCardPayment: isCardPaymentMethod,
        cardCommissionPercent: isCardPaymentMethod ? cardCommissionPercent : 0,
      });
    });

    return calculateInvoiceTotals(calculatedItems, { shippingFee: 0 });
  }, [items, products, isCardPaymentMethod, cardCommissionPercent]);

  const productsSubtotal = invoiceTotals.subtotalNoTax;
  const totalDiscountAmount = invoiceTotals.totalDiscount;
  const salesTaxAmount = invoiceTotals.totalTax;
  const shippingFee = invoiceTotals.shippingFee;
  const totalOrderAmount = invoiceTotals.totalInvoiceAmount;

  const isConsumidorFinal = docType === '07' || customerCi.trim() === '9999999999999';
  const isExceedingConsumidorFinalLimit = useMemo(() => {
    return isConsumidorFinal && totalOrderAmount > 199.99;
  }, [isConsumidorFinal, totalOrderAmount]);

  // Payphone API Helpers & Payphone Payment Detection (ONLY when Payphone option is explicitly selected)
  const isPayphonePaymentMethod = useMemo(() => {
    const m = (paymentMethod || '').toLowerCase().trim();
    return m === 'payphone' || m.includes('payphone');
  }, [paymentMethod]);

  const handleGeneratePayphoneLink = async () => {
    if (payphoneGenerating) return;
    setPayphoneGenerating(true);

    try {
      const res = await fetch('/api/payphone/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order?.id || 0,
          orderNumber: order?.orderNumber || 'PRE-FACTURA',
          totalAmount: invoiceTotals.totalInvoiceAmount,
          subtotal0: invoiceTotals.subtotalZero0,
          subtotal15: invoiceTotals.subtotalTaxable15,
          tax15: invoiceTotals.totalTax,
          customerName: customerName || 'Cliente',
          customerPhone: customerPhone || '',
          customerEmail: customerEmail || '',
          reference: `Pedido #${order?.orderNumber || 'NUEVO'} - ${customerName || 'Cliente'}`,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success && data.payUrl) {
        setPayphoneUrl(data.payUrl);
        if (data.clientTransactionId) {
          setLastPayphoneClientTxId(data.clientTransactionId);
        }
        showToast('✓ Link de pago Payphone generado exitosamente');
      } else {
        const msg = data.error || 'Error al generar enlace de pago en Payphone';
        showToast(`❌ ${msg}`);
      }
    } catch (err: any) {
      console.error('Error generating Payphone link:', err);
      showToast('⚠️ Error de conexión con el servidor al generar link Payphone');
    } finally {
      setPayphoneGenerating(false);
    }
  };

  // Rastreo Automático de Estado Payphone en Segundo Plano (Auto-Polling)
  useEffect(() => {
    if (!lastPayphoneClientTxId || !payphoneUrl || payphoneResultModal.status === 'APPROVED') {
      return;
    }

    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/payphone/verify-transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientTransactionId: lastPayphoneClientTxId, id: lastPayphoneClientTxId }),
        });
        const data = await res.json();
        if (res.ok && data.success && data.transactionStatus === 'APPROVED') {
          const confirmCode = String(data.transactionId || data.numericId || data.authorizationCode || lastPayphoneClientTxId);
          setVoucherInput(confirmCode);
          if (!bankOrAccount || bankOrAccount.trim() === '') {
            setBankOrAccount('Pasarela Payphone');
          }
          setPayphoneResultModal({
            open: true,
            status: 'APPROVED',
            transactionId: confirmCode,
            authorizationCode: data.authorizationCode,
            amount: data.amount || invoiceTotals.totalInvoiceAmount,
            cardType: data.cardType,
            isTestMode: Boolean(data.isTestMode),
            message: data.message || '¡El pago fue realizado correctamente a través de la pasarela Payphone!',
          });
          showToast(`✓ ¡Pago Payphone Aprobado en Tiempo Real! Comprobante #${confirmCode} asignado automáticamente`);
          clearInterval(timer);
        }
      } catch (e) {
        // Ignorar errores temporales durante el polling automático
      }
    }, 10000);

    return () => clearInterval(timer);
  }, [lastPayphoneClientTxId, payphoneUrl, payphoneResultModal.status, bankOrAccount, invoiceTotals.totalInvoiceAmount, showToast]);

  const handleVerifyPayphoneTransaction = async (overrideTxId?: string) => {
    const inputVal = voucherInput && !voucherInput.startsWith('http') ? voucherInput.trim() : '';
    const txToVerify = overrideTxId || inputVal || lastPayphoneClientTxId;
    if (!txToVerify) {
      showToast('⚠️ Genera primero un enlace de pago Payphone o ingresa el ID de recibo / transacción');
      return;
    }
    setPayphoneVerifying(true);
    try {
      const res = await fetch('/api/payphone/verify-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientTransactionId: txToVerify, id: txToVerify }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPayphoneResultModal({
          open: true,
          status: 'REJECTED',
          isTestMode: Boolean(data?.isTestMode),
          message: data.error || data.message || 'No se pudo verificar la transacción con Payphone API',
        });
        return;
      }

      if (data.transactionStatus === 'APPROVED') {
        const confirmCode = String(data.transactionId || data.numericId || data.authorizationCode || txToVerify);
        setVoucherInput(confirmCode);
        if (!bankOrAccount || bankOrAccount.trim() === '') {
          setBankOrAccount('Pasarela Payphone');
        }
        setPayphoneResultModal({
          open: true,
          status: 'APPROVED',
          transactionId: confirmCode,
          authorizationCode: data.authorizationCode,
          amount: data.amount || invoiceTotals.totalInvoiceAmount,
          cardType: data.cardType,
          isTestMode: Boolean(data.isTestMode),
          message: data.message || '¡El pago fue realizado correctamente a través de la pasarela Payphone!',
        });
        showToast(`✓ Pago Payphone Aprobado${data.isTestMode ? ' (Modo Prueba)' : ''}. Comprobante #${confirmCode} asignado automáticamente`);
      } else {
        setPayphoneResultModal({
          open: true,
          status: data.transactionStatus === 'REJECTED' ? 'REJECTED' : 'PENDING',
          isTestMode: Boolean(data.isTestMode),
          message: data.message || 'No se realizó el pago o la transacción no fue completada en Payphone.',
        });
        showToast('⚠️ No se realizó el pago con Payphone');
      }
    } catch (err: any) {
      console.error('Error enviando verificación a Payphone:', err);
      setPayphoneResultModal({
        open: true,
        status: 'REJECTED',
        message: err.message || 'Error de conexión al verificar con Payphone API',
      });
    } finally {
      setPayphoneVerifying(false);
    }
  };

  const handleSendPayphoneEmail = async () => {
    if (!payphoneUrl) {
      showToast('⚠️ Primero genera el enlace de pago Payphone');
      return;
    }
    if (!customerEmail || !customerEmail.includes('@')) {
      showToast('⚠️ Ingresa un correo electrónico válido del cliente');
      return;
    }

    setPayphoneSendingEmail(true);
    try {
      const res = await fetch('/api/payphone/send-email-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: customerEmail.trim(),
          customerName: customerName || 'Cliente',
          orderNumber: order?.orderNumber || '0',
          totalAmount: invoiceTotals.totalInvoiceAmount,
          payUrl: payphoneUrl,
          itemsSummary: items.map((it) => `${it.quantity}x ${it.name}`).join(', '),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`✓ Enlace de pago enviado a ${customerEmail}`);
      } else {
        showToast(`❌ ${data.error || 'Error al enviar correo'}`);
      }
    } catch (err: any) {
      console.error('Error sending Payphone email link:', err);
      showToast('⚠️ Error de conexión al enviar correo de Payphone');
    } finally {
      setPayphoneSendingEmail(false);
    }
  };

  // Cash payment detection
  const isCash = useMemo(() => {
    return isCashPayment(paymentMethod) || isCashPayment(bankOrAccount);
  }, [paymentMethod, bankOrAccount]);

  // Build unified final shipping destination
  const getCompiledShippingDestination = (): string => {
    if (deliveryType === 'pickup') {
      return `Retiro en Local (${storeConfig.address || 'Local Principal de la Tienda'})`;
    }
    const parts: string[] = [];
    if (province.trim()) parts.push(`Prov: ${province.trim()}`);
    if (canton.trim()) parts.push(`Cantón: ${canton.trim()}`);
    if (parish.trim()) parts.push(`Parr: ${parish.trim()}`);
    if (exactAddress.trim()) parts.push(`Dir: ${exactAddress.trim()}`);
    if (reference.trim()) parts.push(`Ref: ${reference.trim()}`);
    const compiled = parts.join(' | ');
    if (compiled.trim()) return compiled;
    return customerFiscalAddress.trim() || 'Envío a Domicilio';
  };

  // Ecuador ID validation live feedback
  const idValidation = useMemo(() => {
    const trimmed = customerCi.trim();
    if (!trimmed || docType === '07' || docType === '06') return null;
    const res = validateEcuadorId(trimmed, true);
    if (docType === '05' && res.type !== 'cedula') {
      return { isValid: false, type: 'cedula', error: 'Se requiere una Cédula de 10 dígitos' };
    }
    if (docType === '04' && !String(res.type).startsWith('ruc')) {
      return { isValid: false, type: 'ruc_natural', error: 'Se requiere un RUC de 13 dígitos' };
    }
    return res;
  }, [customerCi, docType]);

  // Phone validation live feedback
  const phoneValidation = useMemo(() => {
    const trimmed = customerPhone.trim();
    if (!trimmed) return null;
    return normalizeEcuadorPhone(trimmed);
  }, [customerPhone]);

  // Unified live order object for ticket printing (works in both manual creation and editing)
  const currentOrderForTicket = useMemo<CustomerOrder>(() => {
    const isPick = deliveryType === 'pickup';
    const finalDest = getCompiledShippingDestination();
    const cleanPhone = customerPhone.trim() || (order?.customerPhone || '');
    const cleanName = customerName.trim() || (order?.customerName || 'Cliente');

    if (order) {
      return {
        ...order,
        customerName: cleanName,
        customerPhone: cleanPhone,
        customerCi: customerCi.trim() || order.customerCi,
        customerAddress: finalDest,
        clientAddress: customerFiscalAddress.trim() || order.clientAddress,
        customerFiscalAddress: customerFiscalAddress.trim() || (order as any).customerFiscalAddress,
        customerEmail: customerEmail.trim() || order.customerEmail || (order as any).email,
        shippingAddress: finalDest,
        deliveryType,
        trackingCarrier: !isPick ? trackingCarrier : undefined,
        trackingNumber: !isPick ? (trackingNumber.trim() || undefined) : undefined,
        shippingCost: shippingFee,
        items: items as any,
        subtotalAmount: productsSubtotal.toFixed(2),
        taxAmount: salesTaxAmount.toFixed(2),
        applySaleTax,
        saleTaxPercent,
        totalAmount: totalOrderAmount.toFixed(2),
        paymentMethod,
        paymentVoucher: voucherInput.trim() || undefined,
        notes: notesInput.trim() || undefined,
      };
    }

    return {
      id: 999999,
      userId: 1,
      orderNumber: 'PRE-FACTURA',
      customerName: cleanName,
      customerPhone: cleanPhone || '0980000000',
      customerCi: customerCi.trim() || undefined,
      customerAddress: finalDest,
      clientAddress: customerFiscalAddress.trim() || undefined,
      customerFiscalAddress: customerFiscalAddress.trim() || undefined,
      customerEmail: customerEmail.trim() || undefined,
      shippingAddress: finalDest,
      deliveryType,
      trackingCarrier: !isPick ? trackingCarrier : undefined,
      trackingNumber: !isPick ? (trackingNumber.trim() || undefined) : undefined,
      shippingCost: shippingFee,
      items: items as any,
      subtotalAmount: productsSubtotal.toFixed(2),
      taxAmount: salesTaxAmount.toFixed(2),
      applySaleTax,
      saleTaxPercent,
      totalAmount: totalOrderAmount.toFixed(2),
      paymentMethod,
      paymentVoucher: voucherInput.trim() || undefined,
      notes: notesInput.trim() || undefined,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    } as CustomerOrder;
  }, [
    order,
    customerName,
    customerPhone,
    customerCi,
    customerFiscalAddress,
    deliveryType,
    province,
    canton,
    parish,
    exactAddress,
    reference,
    trackingCarrier,
    trackingNumber,
    shippingFee,
    items,
    totalOrderAmount,
    paymentMethod,
    voucherInput,
    notesInput,
  ]);

  // ================= SAVE ORDER HANDLER (CREATION OR EDIT) =================
  const handleSaveOrder = async (
    notifyViaWhatsApp = false,
    openShippingWorkflow = false,
    isConfirmationRequest = false
  ) => {
    if (isLockedFromEdit) {
      showToast('🔒 Este pedido ya está confirmado y no puede ser modificado ni confirmado más de una vez.');
      return;
    }

    if (!customerPhone.trim()) {
      showToast('⚠️ Ingresa el número de teléfono o WhatsApp del cliente');
      return;
    }
    if (customerCi.trim()) {
      const val = validateEcuadorId(customerCi.trim(), true);
      if (!val.isValid) {
        showToast(`⚠️ Cédula o RUC ecuatoriano inválido: ${val.error}`);
        return;
      }
    }
    if (isConsumidorFinal && totalOrderAmount > 199.99) {
      const err = 'Por normativa fiscal del SRI en Ecuador, las ventas superiores a $199.99 no pueden ser emitidas a Consumidor Final. Ingrese Cédula o RUC del cliente.';
      showToast(`⚠️ ${err}`);
      return;
    }

    if (items.length === 0) {
      showToast('⚠️ Agrega al menos 1 producto al detalle del pedido');
      return;
    }

    setIsSaving(true);
    try {
      const finalDest = getCompiledShippingDestination();
      const normPhone = normalizeEcuadorPhone(customerPhone);
      const cleanPhone = normPhone.formattedLocal || normPhone.local || customerPhone.trim();
      const finalCi = customerCi.trim() || undefined;
      const cleanCustomerName = customerName.trim() || 'Cliente';

      // Notes handling - strictly user entered, no auto-generation
      const finalNotes = notesInput.trim();

      if (isCreateMode) {
        // CREATE MANUAL ORDER
        if (!onCreateOrder) {
          throw new Error('Función para crear pedido no disponible');
        }

        const payload = {
          customerName: cleanCustomerName,
          customerPhone: cleanPhone,
          customerEmail: customerEmail.trim() || undefined,
          customerCi: finalCi,
          ci: finalCi,
          customerAddress: finalDest,
          clientAddress: customerFiscalAddress.trim() || undefined,
          shippingAddress: deliveryType === 'shipping' ? finalDest : undefined,
          deliveryType,
          trackingCarrier: deliveryType === 'shipping' ? (trackingCarrier.trim() || undefined) : undefined,
          trackingNumber: deliveryType === 'shipping' ? (trackingNumber.trim() || undefined) : undefined,
          paymentMethod: paymentMethod || 'whatsapp',
          cardCommissionPercent: isCardPaymentMethod ? cardCommissionPercent : 0,
          isCardPayment: isCardPaymentMethod,
          bankOrAccount: bankOrAccount || deriveBankOrAccountFromMethod(paymentMethod, finalNotes),
          status: 'pending',
          paymentVoucher: voucherInput.trim() || undefined,
          notes: finalNotes || undefined,
          items: items,
          totalAmount: totalOrderAmount,
          decrementStock: true,
        };

        const result = await onCreateOrder(payload);
        if (result.success) {
          const ordNum = result.orderNumber || result.order?.orderNumber || 'PED-REC';
          showToast(`✓ Pedido manual #${ordNum} registrado exitosamente`);

          if ((autoCreatePurchase || stockAnalysis.hasDeficit) && result.order && onGenerateSupplierPurchase) {
            try {
              await onGenerateSupplierPurchase(result.order);
            } catch (pErr) {
              console.warn('Error auto-generating purchase:', pErr);
            }
          }

          if (openShippingWorkflow && deliveryType === 'shipping' && result.order && onOpenPendingShipping) {
            onOpenPendingShipping(result.order);
          }

          if (notifyViaWhatsApp && normPhone.whatsappDigits && normPhone.isValid) {
            if (isConfirmationRequest) {
              sendWhatsAppConfirmationRequest(ordNum, cleanCustomerName, normPhone.whatsappDigits);
            } else {
              sendWhatsAppDetail(ordNum, cleanCustomerName, normPhone.whatsappDigits, false);
            }
          }

          onClose();
        }
      } else if (order && onUpdateOrder) {
        // UPDATE EXISTING ORDER
        await onUpdateOrder(order.id, {
          customerName: cleanCustomerName,
          customerPhone: cleanPhone,
          customerEmail: customerEmail.trim() || null,
          customerCi: finalCi || null,
          ci: finalCi || null,
          customerAddress: finalDest,
          clientAddress: customerFiscalAddress.trim() || null,
          shippingAddress: deliveryType === 'shipping' ? finalDest : (storeConfig.address || 'Retiro en Local'),
          deliveryType,
          trackingCarrier: deliveryType === 'shipping' ? (trackingCarrier.trim() || null) : null,
          trackingNumber: deliveryType === 'shipping' ? (trackingNumber.trim() || null) : null,
          trackingNotes: deliveryType === 'shipping' ? (trackingNotes.trim() || null) : null,
          paymentMethod,
          cardCommissionPercent: isCardPaymentMethod ? cardCommissionPercent : 0,
          isCardPayment: isCardPaymentMethod,
          bankOrAccount: bankOrAccount || deriveBankOrAccountFromMethod(paymentMethod, finalNotes),
          paymentVoucher: voucherInput.trim() || null,
          notes: finalNotes || null,
          items: items as any,
          totalAmount: totalOrderAmount.toFixed(2),
        } as any);

        showToast(`✓ Pedido #${order.orderNumber} actualizado correctamente`);

        if ((autoCreatePurchase || stockAnalysis.hasDeficit) && onGenerateSupplierPurchase) {
          try {
            await onGenerateSupplierPurchase({ ...order, items: items as any });
          } catch (pErr) {
            console.warn('Error auto-generating purchase for updated order:', pErr);
          }
        }

        if (notifyViaWhatsApp && normPhone.whatsappDigits && normPhone.isValid) {
          if (isConfirmationRequest) {
            sendWhatsAppConfirmationRequest(order.orderNumber, cleanCustomerName, normPhone.whatsappDigits);
          } else {
            sendWhatsAppDetail(order.orderNumber, cleanCustomerName, normPhone.whatsappDigits, false);
          }
        }

        onClose();
      }
    } catch (err: any) {
      console.error('Error saving order:', err);
      showToast('❌ Error al guardar el pedido: ' + (err.message || 'Error'));
    } finally {
      setIsSaving(false);
    }
  };

  // ================= CONFIRM ORDER HANDLER (CREATION & EDIT) =================
  const handleConfirmOrder = async (sendWhatsApp = false) => {
    if (isLockedFromEdit || (!isCreateMode && order && order.status !== 'pending')) {
      const err = 'Este pedido ya está confirmado y no puede ser modificado ni confirmado más de una vez.';
      setVoucherError(err);
      showToast(`🔒 ${err}`);
      return;
    }

    if (!customerPhone.trim()) {
      setVoucherError('Ingresa el número de teléfono o WhatsApp del cliente.');
      showToast('⚠️ Ingresa el número de teléfono o WhatsApp del cliente');
      return;
    }

    const ciToValidate = customerCi.trim();
    if (isConsumidorFinal && totalOrderAmount > 199.99) {
      const err = 'Por normativa fiscal del SRI en Ecuador, las ventas superiores a $199.99 no pueden ser emitidas a Consumidor Final. Ingrese Cédula o RUC del cliente.';
      setVoucherError(err);
      showToast(`⚠️ ${err}`);
      return;
    }

    if (ciToValidate) {
      const val = validateEcuadorId(ciToValidate, true);
      if (!val.isValid) {
        setVoucherError(`Cédula o RUC ecuatoriano inválido: ${val.error}`);
        showToast(`⚠️ Cédula o RUC ecuatoriano inválido: ${val.error}`);
        return;
      }
    }

    if (order && isOnlineStoreOrder(order) && !ciToValidate) {
      const err = 'Para confirmar un pedido de la tienda online es obligatorio ingresar la cédula del cliente.';
      setVoucherError(err);
      showToast(`⚠️ ${err}`);
      return;
    }

    if (items.length === 0) {
      const err = 'El pedido debe incluir al menos 1 producto';
      setVoucherError(err);
      showToast(`⚠️ ${err}`);
      return;
    }

    // Voucher validation for non-cash payments
    if (!isCash && !voucherInput.trim()) {
      const err = 'El pedido permanecerá pendiente hasta que ingreses el comprobante de pago o transferencia. Si el cliente aún no realiza el pago, usa "Guardar".';
      setVoucherError(err);
      showToast(`⚠️ ${err}`);
      return;
    }

    setIsConfirming(true);
    setVoucherError(null);
    try {
      const voucherToSave = voucherInput.trim() || (isCash ? 'EFECTIVO - CONTRAENTREGA' : 'CONFIRMADO');
      const selectedBank = bankOrAccount || deriveBankOrAccountFromMethod(paymentMethod, notesInput);
      const isPick = deliveryType === 'pickup';
      const finalDest = getCompiledShippingDestination();
      const normPhone = normalizeEcuadorPhone(customerPhone);
      const cleanPhone = normPhone.formattedLocal || normPhone.local || customerPhone.trim() || (order?.customerPhone || '');
      const cleanName = customerName.trim() || (order?.customerName || 'Cliente');

      // Notes handling - strictly user entered, no auto-generation
      const finalNotes = notesInput.trim();

      if (isCreateMode) {
        // CREATE DIRECTLY AS CONFIRMED
        if (!onCreateOrder) {
          throw new Error('Función para crear pedido no disponible');
        }

        const payload = {
          customerName: cleanName,
          customerPhone: cleanPhone,
          customerEmail: customerEmail.trim() || undefined,
          customerCi: ciToValidate || undefined,
          ci: ciToValidate || undefined,
          customerAddress: finalDest,
          clientAddress: customerFiscalAddress.trim() || undefined,
          customerFiscalAddress: customerFiscalAddress.trim() || undefined,
          shippingAddress: !isPick ? finalDest : undefined,
          deliveryType,
          trackingCarrier: !isPick ? (trackingCarrier.trim() || undefined) : undefined,
          trackingNumber: !isPick ? (trackingNumber.trim() || undefined) : undefined,
          trackingNotes: !isPick ? (trackingNotes.trim() || undefined) : undefined,
          shippingCost: !isPick ? shippingFee : 0,
          paymentMethod: paymentMethod || 'whatsapp',
          cardCommissionPercent: isCardPaymentMethod ? cardCommissionPercent : 0,
          isCardPayment: isCardPaymentMethod,
          bankOrAccount: selectedBank,
          status: 'confirmed',
          paymentVoucher: voucherToSave,
          notes: finalNotes || undefined,
          items: items,
          subtotalAmount: productsSubtotal.toFixed(2),
          taxAmount: salesTaxAmount.toFixed(2),
          applySaleTax,
          saleTaxPercent,
          totalAmount: totalOrderAmount.toFixed(2),
          decrementStock: true,
        };

        const result = await onCreateOrder(payload);
        if (result.success) {
          const ordNum = result.orderNumber || result.order?.orderNumber || 'PED-REC';

          // Ensure status update in treasury/accounting if order was created
          if (result.order?.id && result.order.status !== 'confirmed') {
            await onUpdateOrderStatus(
              result.order.id,
              'confirmed',
              voucherToSave,
              finalNotes || undefined,
              isPick ? undefined : (trackingNumber.trim() || undefined),
              isPick ? undefined : (trackingCarrier.trim() || undefined),
              isPick ? undefined : (trackingNotes.trim() || undefined),
              isPick ? '0' : String(shippingFee),
              paymentMethod,
              selectedBank,
              ciToValidate || undefined,
              isCardPaymentMethod ? cardCommissionPercent : 0
            );
          }

          showToast(`✓ Pedido manual #${ordNum} creado y CONFIRMADO ${isCash ? 'con pago en efectivo' : `con comprobante: ${voucherToSave}`}.`);

          // Verificar si ya existe una orden de compra vinculada para no duplicar pedidos al confirmar
          const hasLinkedPurchaseInResult = Boolean(
            (result.order as any)?.linkedPurchaseId ||
            (result.order as any)?.linkedPurchaseNumber ||
            (purchases && purchases.some((p: any) =>
              p.status !== 'cancelled' && (
                ((result.order as any)?.id && (p.linkedCustomerOrderId == (result.order as any).id || String(p.linkedCustomerOrderId) === String((result.order as any).id))) ||
                (ordNum && p.linkedCustomerOrderNumber && p.linkedCustomerOrderNumber.trim() === ordNum.trim()) ||
                (p.notes && ordNum && p.notes.includes(ordNum))
              )
            ))
          );

          if (!hasLinkedPurchaseInResult && (autoCreatePurchase || stockAnalysis.hasDeficit) && result.order && onGenerateSupplierPurchase) {
            try {
              await onGenerateSupplierPurchase(result.order);
            } catch (pErr) {
              console.warn('Error auto-generating purchase:', pErr);
            }
          }

          if (sendWhatsApp && normPhone.whatsappDigits && normPhone.isValid) {
            sendWhatsAppDetail(ordNum, cleanName, normPhone.whatsappDigits, true);
          }

          onClose();
        }
      } else if (order) {
        // CONFIRM EXISTING ORDER - First save 100% of current modal changes
        if (onUpdateOrder) {
          await onUpdateOrder(order.id, {
            customerName: cleanName,
            customerPhone: cleanPhone,
            customerEmail: customerEmail.trim() || null,
            customerCi: ciToValidate || null,
            ci: ciToValidate || null,
            customerAddress: finalDest,
            clientAddress: customerFiscalAddress.trim() || null,
            customerFiscalAddress: customerFiscalAddress.trim() || null,
            shippingAddress: !isPick ? finalDest : (storeConfig.address || 'Retiro en Local'),
            deliveryType,
            trackingCarrier: isPick ? null : (trackingCarrier.trim() || null),
            trackingNumber: isPick ? null : (trackingNumber.trim() || null),
            trackingNotes: isPick ? null : (trackingNotes.trim() || null),
            shippingCost: isPick ? 0 : shippingFee,
            paymentMethod,
            cardCommissionPercent: isCardPaymentMethod ? cardCommissionPercent : 0,
            isCardPayment: isCardPaymentMethod,
            bankOrAccount: selectedBank,
            paymentVoucher: voucherToSave,
            notes: finalNotes || null,
            items: items as any,
            subtotalAmount: productsSubtotal.toFixed(2),
            taxAmount: salesTaxAmount.toFixed(2),
            applySaleTax,
            saleTaxPercent,
            totalAmount: totalOrderAmount.toFixed(2),
            status: 'confirmed',
          } as any);
        }

        const ok = await onUpdateOrderStatus(
          order.id,
          'confirmed',
          voucherToSave,
          finalNotes || undefined,
          isPick ? undefined : (trackingNumber.trim() || undefined),
          isPick ? undefined : (trackingCarrier.trim() || undefined),
          isPick ? undefined : (trackingNotes.trim() || undefined),
          isPick ? '0' : String(shippingFee),
          paymentMethod,
          selectedBank,
          ciToValidate || undefined,
          isCardPaymentMethod ? cardCommissionPercent : 0
        );

        if (ok) {
          showToast(`✓ Pedido #${order.orderNumber} confirmado ${isCash ? 'con pago en efectivo' : `con comprobante: ${voucherToSave}`}.`);

          // Verificar si ya existe una orden de compra previa/vinculada para no generar compras duplicadas al confirmar
          const hasExistingLinkedPurchase = Boolean(
            order.linkedPurchaseId ||
            order.linkedPurchaseNumber ||
            (purchases && purchases.some((p: any) =>
              p.status !== 'cancelled' && (
                (order.id && (p.linkedCustomerOrderId == order.id || String(p.linkedCustomerOrderId) === String(order.id))) ||
                (order.orderNumber && p.linkedCustomerOrderNumber && p.linkedCustomerOrderNumber.trim() === order.orderNumber.trim()) ||
                (order.linkedPurchaseId && (p.id == order.linkedPurchaseId || String(p.id) === String(order.linkedPurchaseId))) ||
                (p.notes && order.orderNumber && p.notes.includes(order.orderNumber))
              )
            ))
          );

          if (!hasExistingLinkedPurchase && (autoCreatePurchase || stockAnalysis.hasDeficit) && onGenerateSupplierPurchase) {
            try {
              await onGenerateSupplierPurchase({ ...order, items: items as any });
            } catch (pErr) {
              console.warn('Error auto-generating purchase for confirmed order:', pErr);
            }
          }

          if (sendWhatsApp && normPhone.whatsappDigits && normPhone.isValid) {
            sendWhatsAppDetail(order.orderNumber, cleanName, normPhone.whatsappDigits, true);
          }

          onClose();
        }
      }
    } catch (err: any) {
      console.error('Error confirming order:', err);
      showToast('❌ Error al confirmar el pedido: ' + (err.message || 'Error'));
    } finally {
      setIsConfirming(false);
    }
  };

  // WhatsApp Messaging helper
  const sendWhatsAppDetail = (orderNum: string, clientName: string, waDigits: string, isConfirmedState: boolean) => {
    const matchedPartner = activePaymentPartners.find((p) => p.name === paymentMethod);
    const partnerName = matchedPartner ? matchedPartner.name : paymentMethod;
    const partnerDetails = matchedPartner?.details?.trim();
    const isPick = deliveryType === 'pickup';

    let msg = `¡Hola *${clientName}*! 👋\n\n`;
    if (isConfirmedState) {
      msg += `¡Excelente noticia! Tu *Pedido #${orderNum}* en *${storeConfig.storeName || 'nuestra tienda'}* ha sido *CONFIRMADO* con éxito. 🎉\n\n`;
    } else {
      msg += `Detalle de tu *Pedido #${orderNum}* registrado en *${storeConfig.storeName || 'nuestra tienda'}*:\n\n`;
    }

    msg += `📦 *Detalle de Productos:*\n`;
    items.forEach((it) => {
      const netUnit = Math.max(0, Number(it.salePrice || 0) - Number(it.discount || 0));
      const lineSub = netUnit * Number(it.quantity || 1);
      msg += `• ${it.quantity}x ${it.name} - $${lineSub.toFixed(2)}\n`;
    });

    if (!isPick && shippingFee > 0) {
      msg += `\n📦 *Subtotal Productos:* $${productsSubtotal.toFixed(2)} ${currency}\n`;
      msg += `🚚 *Costo de Envío (${trackingCarrier}):* $${shippingFee.toFixed(2)} ${currency}\n`;
    }
    msg += `\n💰 *Total:* $${totalOrderAmount.toFixed(2)} ${currency}\n`;

    if (customerCi.trim()) {
      msg += `🪪 *Cédula/RUC:* ${customerCi.trim()}\n`;
    }
    msg += `📍 *Modalidad:* ${isPick ? 'Retiro en Local' : `Envío: ${getCompiledShippingDestination()}`}\n`;

    if (!isPick && trackingCarrier) {
      msg += `🚚 *Transporte:* ${trackingCarrier}\n`;
      if (trackingNumber.trim()) {
        msg += `🏷️ *N° Guía:* ${trackingNumber.trim()}\n`;
      }
    }

    msg += `💳 *Método de Pago:* ${partnerName}\n`;
    if (partnerDetails && !isConfirmedState) {
      msg += `📝 *Datos para Transferencia:*\n${partnerDetails}\n\n`;
    }

    if (voucherInput.trim()) {
      msg += `🧾 *Comprobante:* ${voucherInput.trim()}\n`;
    }

    if (isConfirmedState) {
      if (isCash) {
        msg += `\n💵 *Pago:* Efectivo acordado para entrega/retiro.`;
      } else {
        msg += `\n✅ *Pago:* Comprobante registrado y validado en tesorería.`;
      }
      msg += `\nEstamos procesando tu despacho. ¡Muchas gracias por tu preferencia!`;
    } else {
      if (isCash) {
        msg += `\n💵 *Modalidad:* Pago en efectivo acordado contraentrega o al retirar en tienda.`;
      } else {
        msg += `\n📲 *Instrucción de Pago:* Por favor envíanos la foto o captura del comprobante por aquí para agilizar tu entrega.`;
      }
    }

    const waLink = buildWhatsAppLink(waDigits, msg);
    window.open(waLink, '_blank');
  };

  // WhatsApp Confirmation Request (asks client to confirm if they want the order)
  const sendWhatsAppConfirmationRequest = (orderNum: string, clientName: string, waDigits: string) => {
    const matchedPartner = activePaymentPartners.find((p) => p.name === paymentMethod);
    const partnerName = matchedPartner ? matchedPartner.name : paymentMethod;
    const partnerDetails = matchedPartner?.details?.trim();
    const isPick = deliveryType === 'pickup';

    let msg = `¡Hola *${clientName}*! 👋\n\n`;
    msg += `Te saludamos de *${storeConfig.storeName || 'nuestra tienda'}*.\n`;
    msg += `Te compartimos el detalle de tu *Pedido #${orderNum}* para verificar los productos solicitados:\n\n`;

    msg += `📦 *Detalle de Productos:*\n`;
    items.forEach((it) => {
      const netUnit = Math.max(0, Number(it.salePrice || 0) - Number(it.discount || 0));
      const lineSub = netUnit * Number(it.quantity || 1);
      msg += `• ${it.quantity}x ${it.name} - $${lineSub.toFixed(2)}\n`;
    });

    msg += `\n📦 *Subtotal Productos:* $${productsSubtotal.toFixed(2)} ${currency}\n`;
    if (!isPick && shippingFee > 0) {
      msg += `🚚 *Costo de Envío (${trackingCarrier}):* $${shippingFee.toFixed(2)} ${currency}\n`;
    }
    msg += `💰 *Total a Pagar:* $${totalOrderAmount.toFixed(2)} ${currency}\n\n`;

    if (customerCi.trim()) {
      msg += `🪪 *Cédula/RUC:* ${customerCi.trim()}\n`;
    }
    msg += `📍 *Modalidad:* ${isPick ? 'Retiro en Local' : `Envío: ${getCompiledShippingDestination()}`}\n`;
    msg += `💳 *Método de Pago:* ${partnerName}\n`;
    if (partnerDetails && !isCash) {
      msg += `📝 *Datos para Pago / Transferencia:*\n${partnerDetails}\n`;
    }

    msg += `\n¿Nos confirmas por favor si deseas que procedamos con tu pedido para coordinar el despacho? ¡Quedamos muy atentos a tu respuesta! 😊`;

    const waLink = buildWhatsAppLink(waDigits, msg);
    window.open(waLink, '_blank');
  };

  // Handler for "Notificar al cliente la proforma actual"
  const handleNotifyClientProforma = async () => {
    if (!customerPhone.trim()) {
      showToast('⚠️ Ingresa el número de teléfono o WhatsApp del cliente');
      return;
    }
    if (items.length === 0) {
      showToast('⚠️ Agrega al menos 1 producto al detalle del pedido');
      return;
    }

    if (isLockedFromEdit) {
      // Para pedidos confirmados/bloqueados, envía la proforma por WhatsApp directamente sin modificar el pedido
      const normPhone = normalizeEcuadorPhone(customerPhone);
      const cleanCustomerName = customerName.trim() || (order?.customerName || 'Cliente');
      const ordNum = order?.orderNumber || 'PED';
      if (normPhone.whatsappDigits && normPhone.isValid) {
        sendWhatsAppConfirmationRequest(ordNum, cleanCustomerName, normPhone.whatsappDigits);
        showToast(`📲 Proforma enviada por WhatsApp al cliente para el pedido #${ordNum}`);
      } else {
        showToast('⚠️ El número de teléfono no es válido para enviar WhatsApp');
      }
      return;
    }

    await handleSaveOrder(true, false, true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full shadow-2xl space-y-0 my-auto animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col overflow-hidden">
        {/* ================= MODAL HEADER ================= */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center text-white backdrop-blur-xs shrink-0 shadow-inner">
              <BadgeCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>{isCreateMode ? 'Creación de Pre-Factura (Desglose Fiscal Ecuador)' : (isConfirmed ? 'Factura Comercial (SRI Ecuador)' : 'Gestión de Pre-Factura de Venta')}</span>
                  <span className="px-2 py-0.5 rounded bg-purple-500/30 text-purple-200 border border-purple-400/40 text-[9px] font-mono font-bold">
                    SRI ECUADOR
                  </span>
                </h3>
                {isCreateMode ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 text-[10px] font-bold uppercase tracking-wider">
                    Nueva Pre-Factura
                  </span>
                ) : (
                  <span className="text-xs font-mono font-bold text-slate-300">
                    #{order?.orderNumber}
                  </span>
                )}
                {!isCreateMode && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      isConfirmed
                        ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400/40'
                        : isShipped
                        ? 'bg-blue-500/30 text-blue-200 border-blue-400/40'
                        : isDelivered
                        ? 'bg-purple-500/30 text-purple-200 border-purple-400/40'
                        : isCancelled
                        ? 'bg-rose-500/30 text-rose-200 border-rose-400/40'
                        : 'bg-amber-500/30 text-amber-200 border-amber-400/40'
                    }`}
                  >
                    {isConfirmed ? 'Factura Emitida' : isShipped ? 'Factura (En Tránsito)' : isDelivered ? 'Factura (Entregada)' : isCancelled ? 'Anulada' : 'Pre-Factura (Pendiente)'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-200/90 mt-0.5">
                Formato de Factura con desglose fiscal de Ecuador: Valor unitario = Costo sin IVA + Margen de ganancia, más desglose SRI.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Direct Print Actions */}
            <button
              type="button"
              disabled={items.length === 0}
              onClick={() => {
                if (onOpenPrintA4Order && currentOrderForTicket) {
                  onOpenPrintA4Order(currentOrderForTicket);
                } else {
                  setShowPrintA4Modal(true);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition cursor-pointer border border-white/20 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
              title="Imprimir prefactura"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir prefactura</span>
            </button>
            {deliveryType === 'shipping' && (
              <button
                type="button"
                disabled={items.length === 0}
                onClick={() => {
                  if (onOpenShippingTicket) {
                    onOpenShippingTicket(currentOrderForTicket);
                  } else {
                    directPrintShippingTicket({ order: currentOrderForTicket, storeConfig, currency, showToast });
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/30 hover:bg-sky-500/50 text-white text-xs font-bold transition cursor-pointer border border-sky-300/30 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                title="Imprimir ticket de envío"
              >
                <Truck className="w-3.5 h-3.5 text-sky-200" />
                <span>Imprimir Ticket de envio</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="text-slate-300 hover:text-white p-2 rounded-xl hover:bg-white/15 transition cursor-pointer ml-1"
              title="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================= MODAL SCROLLABLE BODY (SINGLE TAB / VIEW) ================= */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 text-xs bg-slate-50/60">
          {/* Banner de Resultado de Emisión SRI */}
          {sriEmissionResult && (
            <div className={`p-4 rounded-2xl border text-xs space-y-2 shadow-xl ${
              sriEmissionResult.autorizado
                ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-100'
                : 'bg-rose-950/90 border-rose-500/60 text-rose-100'
            }`}>
              <div className="flex items-center justify-between font-black text-sm flex-wrap gap-2">
                <span className="flex items-center gap-2">
                  {sriEmissionResult.autorizado ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  )}
                  ESTADO SRI: {sriEmissionResult.autorizado ? '✓ AUTORIZADO' : '❌ DEVUELTO / NO AUTORIZADO'}
                </span>
                {sriEmissionResult.emisorUsado && (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-900/80 border border-slate-700 font-mono text-slate-300">
                    RUC: {sriEmissionResult.emisorUsado.ruc} | Est: {sriEmissionResult.emisorUsado.estab}-{sriEmissionResult.emisorUsado.ptoEmi} | Sec: #{sriEmissionResult.emisorUsado.secuencial}
                  </span>
                )}
              </div>

              {sriEmissionResult.motivo ? (
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-medium space-y-1">
                  <div className="font-bold text-slate-300 uppercase tracking-wide text-[10px]">
                    Motivo / Respuesta del SRI:
                  </div>
                  <div className="text-slate-200 font-mono leading-relaxed">
                    {sriEmissionResult.motivo}
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {/* Lock notice if order is in terminal or confirmed state */}
          {isLockedFromEdit && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Pedido en estado {orderStatus.toUpperCase()}:</strong> {getOrderEditBlockReason(order!)}
                </span>
              </div>
              <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full shrink-0">
                Solo lectura comercial
              </span>
            </div>
          )}

          {/* Validation error banner */}
          {voucherError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2 shadow-2xs animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-xs">{voucherError}</p>
              </div>
              <button
                type="button"
                onClick={() => setVoucherError(null)}
                className="text-rose-400 hover:text-rose-700 text-xs p-1"
              >
                ✕
              </button>
            </div>
          )}

          {/* ================= SECTION 1: DATOS DEL CLIENTE ================= */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center justify-center font-black text-xs shadow-2xs">
                  1
                </div>
                <div>
                  <span className="font-bold text-slate-900 text-xs sm:text-sm tracking-tight block">
                    Datos del Cliente y Facturación
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    Identificación con validador ecuatoriano, contacto y razón social
                  </span>
                </div>
              </div>
              {matchedCustomerInfo ? (
                <span className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Cliente Reconocido ({matchedCustomerInfo.source})</span>
                </span>
              ) : (
                <span className="text-[11px] text-slate-400 font-medium">
                  Campos con <span className="text-rose-500 font-bold">*</span> son obligatorios
                </span>
              )}
            </div>

            {/* SRI Warning Banner if Consumidor Final exceeds $199.99 limit */}
            {isExceedingConsumidorFinalLimit && (
              <div className="p-3 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-900 flex items-start gap-2.5 shadow-xs animate-in fade-in duration-200">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <strong className="font-bold text-rose-950 block text-xs sm:text-sm">⚠️ Alerta Normativa SRI Ecuador (Límite Consumidor Final $199.99 USD):</strong>
                  <span className="leading-relaxed">
                    El total de la pre-factura actual es <strong>${totalOrderAmount.toFixed(2)} USD</strong>. Por disposición legal del SRI, las facturas superiores a <strong>$199.99 USD</strong> no pueden emitirse a Consumidor Final. Seleccione el tipo de documento Cédula (05) o RUC (04) e ingrese los datos del cliente.
                  </span>
                </div>
              </div>
            )}

            {/* 4 Columns with Proportional Widths: CI (4 cols), Name (3 cols), Phone (3 cols), Email (2 cols) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
              {/* 1. Cédula / RUC con autocompletado y validación (4 Columns) */}
              <div className="lg:col-span-4 relative flex flex-col justify-start">
                <div className="h-6 flex items-center justify-between mb-1.5">
                  <label className="text-slate-700 font-bold text-xs flex items-center gap-1">
                    <span>Documento SRI:</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleSelectDocType('07')}
                    className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition flex items-center gap-1 border cursor-pointer ${
                      docType === '07' || customerCi.trim() === '9999999999999'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                        : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200'
                    }`}
                    title="Asignar Consumidor Final (9999999999999)"
                  >
                    <span>⚡ Consumidor Final</span>
                  </button>
                </div>
                
                <div className="flex gap-1.5">
                  {/* Selector de Tipo de Documento */}
                  <select
                    value={docType}
                    onChange={(e) => handleSelectDocType(e.target.value as any)}
                    className="h-10 px-2 rounded-xl bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-800 focus:outline-none focus:border-emerald-500 transition cursor-pointer shrink-0"
                  >
                    <option value="05">Cédula (05)</option>
                    <option value="04">RUC (04)</option>
                    <option value="07">Cons. Final (07)</option>
                    <option value="06">Pasaporte (06)</option>
                  </select>

                  <div className="relative flex-1">
                    <CreditCard className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
                    <input
                      type="text"
                      value={customerCi}
                      disabled={docType === '07'}
                      maxLength={docType === '05' ? 10 : docType === '04' ? 13 : docType === '06' ? 20 : 13}
                      title={customerCi || 'Número de Identificación Cédula/RUC/Pasaporte'}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (docType === '05') {
                          val = val.replace(/\D/g, '').slice(0, 10);
                        } else if (docType === '04') {
                          val = val.replace(/\D/g, '').slice(0, 13);
                        } else if (docType === '06') {
                          val = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 20);
                        } else if (docType === '07') {
                          val = '9999999999999';
                        }
                        setCustomerCi(val);
                        if (val.trim().length >= 2 && docType !== '07') {
                          setShowCustomerDropdown(true);
                        }
                      }}
                      onFocus={() => {
                        if (customerCi.trim().length >= 2 && matchingCustomerSuggestions.length > 0 && docType !== '07') {
                          setShowCustomerDropdown(true);
                        }
                      }}
                      placeholder={
                        docType === '07'
                          ? '9999999999999'
                          : docType === '04'
                          ? '13 dígitos (RUC)'
                          : docType === '06'
                          ? 'Pasaporte (Alfanumérico)'
                          : '10 dígitos (Cédula)'
                      }
                      className={`w-full h-10 pl-8 pr-7 rounded-xl font-mono text-xs sm:text-sm focus:outline-none font-semibold transition ${
                        docType === '07'
                          ? 'bg-purple-50/80 border border-purple-300 text-purple-900 font-bold'
                          : customerCi.trim()
                          ? idValidation?.isValid
                            ? 'bg-emerald-50/50 border border-emerald-400 text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                            : 'bg-rose-50/50 border border-rose-400 text-slate-900 focus:border-rose-600 focus:ring-2 focus:ring-rose-100'
                          : 'bg-slate-50 border border-slate-200 text-slate-900 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100'
                      }`}
                    />
                    {customerCi && docType !== '07' && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerCi('');
                          setMatchedCustomerInfo(null);
                          setShowCustomerDropdown(false);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-1 rounded-full hover:bg-slate-200 transition cursor-pointer"
                        title="Borrar"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Dropdown Suggestions */}
                {showCustomerDropdown && matchingCustomerSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-emerald-300 rounded-xl shadow-xl z-40 overflow-hidden divide-y divide-slate-100 max-h-52 overflow-y-auto">
                    <div className="px-3 py-2 bg-emerald-50 text-[11px] font-bold text-emerald-800 flex items-center justify-between">
                      <span>Clientes sugeridos:</span>
                      <button
                        type="button"
                        onClick={() => setShowCustomerDropdown(false)}
                        className="text-slate-400 hover:text-slate-600 text-xs p-0.5 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    {matchingCustomerSuggestions.map((cust, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectCustomer(cust)}
                        className="w-full text-left px-3 py-2 hover:bg-emerald-50 transition flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-xs truncate">{cust.name || 'Cliente'}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                            <span className="text-emerald-700 font-bold">CI: {cust.ci}</span>
                            {cust.phone && <span>• Tel: {cust.phone}</span>}
                          </div>
                        </div>
                        <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono shrink-0">
                          {cust.source}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="min-h-[22px] flex items-center mt-1">
                  {ecuadorApiStatus?.loading ? (
                    <div className="text-[10px] text-teal-700 flex items-center gap-1 font-semibold truncate animate-pulse">
                      <Loader2 className="w-3 h-3 text-teal-600 animate-spin shrink-0" />
                      <span className="truncate">Consultando Ecuador API...</span>
                    </div>
                  ) : ecuadorApiStatus?.message ? (
                    <p className="text-[10px] text-emerald-700 font-bold flex items-center gap-1 truncate">
                      <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="truncate">{ecuadorApiStatus.message}</span>
                    </p>
                  ) : matchedCustomerInfo ? (
                    <div className="text-[10px] text-emerald-700 flex items-center gap-1 font-semibold truncate">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="truncate">Cliente: <strong>{matchedCustomerInfo.name || matchedCustomerInfo.ci}</strong></span>
                    </div>
                  ) : customerCi.trim() ? (
                    idValidation?.isValid ? (
                      <p className="text-[10px] text-emerald-700 font-bold flex items-center gap-1 truncate">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span className="truncate">✓ {idValidation.type === 'cedula' ? 'Cédula Válida' : 'RUC Válido'} ({(idValidation as any).provinceName || 'Ecuador'})</span>
                      </p>
                    ) : (
                      <p className="text-[10px] text-rose-600 font-medium flex items-center gap-1 truncate" title={idValidation?.error}>
                        <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                        <span className="truncate">{idValidation?.error || 'Inválido'}</span>
                      </p>
                    )
                  ) : (
                    <p className="text-[10px] text-slate-400">10 dígitos para cédula / 13 RUC</p>
                  )}
                </div>
              </div>

              {/* 2. Nombre o Razón Social (3 Columns) */}
              <div className="lg:col-span-3 flex flex-col justify-start">
                <div className="h-6 flex items-center justify-between mb-1.5">
                  <label className="text-slate-700 font-bold text-xs">
                    Nombre o Razón Social:
                  </label>
                </div>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={customerName}
                    title={customerName || 'Nombre o Razón Social'}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ej. María Gómez"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition font-medium"
                  />
                </div>
                <div className="min-h-[22px] flex items-center mt-1">
                  <p className="text-[10px] text-slate-400">Titular de la factura o ticket</p>
                </div>
              </div>

              {/* 3. Teléfono / WhatsApp (3 Columns) */}
              <div className="lg:col-span-3 flex flex-col justify-start">
                <div className="h-6 flex items-center justify-between mb-1.5">
                  <label className="text-slate-700 font-bold text-xs">
                    Teléfono / WhatsApp: <span className="text-rose-500 font-bold">*</span>
                  </label>
                  {phoneValidation?.isValid && phoneValidation.whatsappDigits && (
                    <button
                      type="button"
                      onClick={() => {
                        const link = buildWhatsAppLink(phoneValidation.whatsappDigits, `¡Hola ${customerName.trim() || 'cliente'}!`);
                        window.open(link, '_blank');
                      }}
                      className="text-[10px] text-emerald-700 font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
                      title="Abrir chat de WhatsApp"
                    >
                      <MessageCircle className="w-3 h-3 text-emerald-600" />
                      <span>Chat</span>
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={customerPhone}
                    title={customerPhone || 'Número de contacto WhatsApp'}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Ej. 0983302390"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-xs sm:text-sm focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition"
                  />
                </div>
                <div className="min-h-[22px] flex items-center mt-1">
                  {customerPhone.trim() ? (
                    phoneValidation?.isValid ? (
                      <div className="text-[10px] text-emerald-700 flex items-center gap-1 font-mono font-medium truncate">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>WhatsApp: {phoneValidation.formattedLocal}</span>
                      </div>
                    ) : (
                      <p className="text-[10px] text-amber-600 font-mono">10 dígitos (Ej: 0983302390)</p>
                    )
                  ) : (
                    <p className="text-[10px] text-slate-400">Para ticket y contacto directo</p>
                  )}
                </div>
              </div>

              {/* 4. Correo Electrónico (2 Columns) */}
              <div className="lg:col-span-2 flex flex-col justify-start">
                <div className="h-6 flex items-center justify-between mb-1.5">
                  <label className="text-slate-700 font-bold text-xs">
                    Correo Electrónico:
                  </label>
                </div>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    value={customerEmail}
                    title={customerEmail || 'Correo Electrónico'}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="cliente@ejemplo.com"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition font-medium"
                  />
                </div>
                <div className="min-h-[22px] flex items-center mt-1">
                  <p className="text-[10px] text-slate-400">Opcional</p>
                </div>
              </div>
            </div>

            {/* Dirección Residencial / Fiscal (Opcional) en Datos del Cliente */}
            <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex items-center gap-1.5 shrink-0">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                <label className="text-xs font-bold text-slate-700">
                  Dirección Residencial / Fiscal (Opcional):
                </label>
              </div>
              <input
                type="text"
                value={customerFiscalAddress}
                title={customerFiscalAddress || 'Dirección residencial o fiscal del cliente'}
                onChange={(e) => setCustomerFiscalAddress(e.target.value)}
                placeholder="Domicilio fiscal o residencial del cliente para facturación o registro en CRM..."
                className="flex-1 h-10 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 font-medium transition"
              />
            </div>
          </div>

          {/* ================= SECTION 2: MODALIDAD DE ENTREGA Y LOGÍSTICA ================= */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-sky-50 text-sky-700 border border-sky-200/60 flex items-center justify-center font-black text-xs shadow-2xs">
                  2
                </div>
                <div>
                  <span className="font-bold text-slate-900 text-xs sm:text-sm tracking-tight block">
                    Modalidad de Entrega y Logística
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    Selecciona retiro en local o despacho a domicilio con las empresas registradas
                  </span>
                </div>
              </div>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                  deliveryType === 'pickup'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-sky-50 text-sky-800 border-sky-200'
                }`}
              >
                {deliveryType === 'pickup' ? 'Retiro en Local' : 'Despacho a Domicilio'}
              </span>
            </div>

            {/* Toggle Delivery Type & Courier/Fee Bar */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-start">
                {/* 1. Delivery Selector (5 cols) */}
                <div className="sm:col-span-5 space-y-1.5">
                  <label className="block text-slate-700 font-bold text-xs">Tipo de Entrega:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDeliveryType('pickup')}
                      className={`h-10 px-3 rounded-xl font-bold flex items-center justify-center gap-2 transition text-xs cursor-pointer border ${
                        deliveryType === 'pickup'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-200'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Store className={`w-4 h-4 shrink-0 ${deliveryType === 'pickup' ? 'text-white' : 'text-emerald-600'}`} />
                      <span>Retiro en Local</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeliveryType('shipping');
                        if (Number(shippingCost) === 0 && Number(storeConfig.deliveryFee) > 0) {
                          setShippingCost(String(storeConfig.deliveryFee));
                        }
                      }}
                      className={`h-10 px-3 rounded-xl font-bold flex items-center justify-center gap-2 transition text-xs cursor-pointer border ${
                        deliveryType === 'shipping'
                          ? 'bg-sky-600 text-white border-sky-600 shadow-xs ring-2 ring-sky-200'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Truck className={`w-4 h-4 shrink-0 ${deliveryType === 'shipping' ? 'text-white' : 'text-sky-600'}`} />
                      <span>A Domicilio</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {deliveryType === 'pickup'
                      ? 'El cliente retira personalmente en la tienda'
                      : 'Envío mediante courier o transporte configurado'}
                  </p>
                </div>

                {/* 2. Pickup Address OR Shipping Fee (7 cols) */}
                <div className="sm:col-span-7 space-y-1.5">
                  {deliveryType === 'pickup' ? (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-slate-700 font-bold text-xs">Ubicación de Retiro en Tienda:</label>
                        <span className="text-[10px] text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded font-bold border border-emerald-300 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-emerald-700" />
                          <span>Punto Oficial de Entrega</span>
                        </span>
                      </div>
                      <div className="relative">
                        <Store className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          readOnly
                          disabled
                          value={storeConfig.address || 'Local Principal de la Tienda'}
                          className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold cursor-not-allowed select-none"
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Horarios de atención: {(storeConfig as any).schedule || 'Lunes a Sábado'}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-semibold text-slate-700">Costo de Envío ($):</label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setShippingCost('0')}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition ${
                              Number(shippingCost) === 0
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                            }`}
                          >
                            Gratis $0
                          </button>
                          {Number(storeConfig.deliveryFee) > 0 && (
                            <button
                              type="button"
                              onClick={() => setShippingCost(String(storeConfig.deliveryFee))}
                              className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-sky-100 text-sky-800 border border-sky-300 hover:bg-sky-200 cursor-pointer transition"
                            >
                              Tarifa Tienda: ${storeConfig.deliveryFee}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">$</span>
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          value={shippingCost}
                          onChange={(e) => setShippingCost(e.target.value)}
                          placeholder="0.00"
                          className="w-full h-10 pl-6 pr-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-bold focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Courier Selection with Logos (ONLY Couriers registered in Store Config) */}
              {deliveryType === 'shipping' && (
                <div className="space-y-1.5 pt-1 border-t border-slate-200/80">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-bold text-slate-700">
                      Empresas de Envío Registradas en la Tienda:
                    </label>
                    <span className="text-[10px] text-slate-400">Selecciona el courier para el despacho</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(activeCouriers.length > 0
                      ? activeCouriers
                      : [
                          { id: 'servientrega', name: 'Servientrega' },
                          { id: 'laarcourier', name: 'LaarCourier' },
                          { id: 'tramaco', name: 'Tramaco Express' },
                        ]
                    ).map((c) => {
                      const isSelected = trackingCarrier.toLowerCase() === c.name.toLowerCase();
                      const logo = getPartnerLogo(c, 'courier');
                      return (
                        <button
                          key={c.id || c.name}
                          type="button"
                          onClick={() => setTrackingCarrier(c.name)}
                          className={`p-2 rounded-xl border text-left transition cursor-pointer flex items-center gap-2.5 ${
                            isSelected
                              ? 'bg-sky-50/90 border-sky-500 ring-2 ring-sky-200 shadow-xs'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0 shadow-2xs">
                            <img src={logo} alt={c.name} className="max-w-full max-h-full object-contain" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-xs text-slate-900 truncate">{c.name}</p>
                            {c.quoteUrl && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(getCourierQuoteUrl(c), '_blank');
                                }}
                                className="text-[9px] text-sky-600 hover:underline flex items-center gap-0.5 mt-0.5 font-semibold"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                                <span>Cotizar</span>
                              </span>
                            )}
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Full Detailed Shipping Address Fields (ONLY Structured Fields, NO free text, NO tracking input) */}
              {deliveryType === 'shipping' && (
                <div className="p-3.5 rounded-xl bg-white border border-sky-200/90 space-y-2.5 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-sky-600" />
                      <span className="text-xs font-bold text-slate-800">Dirección y Destino del Envío:</span>
                    </div>

                    {customerFiscalAddress && (
                      <button
                        type="button"
                        onClick={() => {
                          const parsed = parseCustomerShippingData(customerFiscalAddress);
                          setProvince(parsed.province || '');
                          setCanton(parsed.canton || '');
                          setParish(parsed.parish || '');
                          setExactAddress(parsed.exactAddress || customerFiscalAddress);
                          setReference(parsed.reference || '');
                        }}
                        className="text-[10px] text-sky-700 hover:text-sky-900 font-bold underline cursor-pointer"
                      >
                        Copiar dir. fiscal del cliente
                      </button>
                    )}
                  </div>

                  {/* Strictly Structured Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 pt-1">
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Provincia:</label>
                      <input
                        type="text"
                        value={province}
                        title={province || 'Provincia'}
                        onChange={(e) => setProvince(e.target.value)}
                        placeholder="Ej. Pichincha, Guayas..."
                        className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:border-sky-500 focus:bg-white transition"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Cantón / Ciudad:</label>
                      <input
                        type="text"
                        value={canton}
                        title={canton || 'Cantón / Ciudad'}
                        onChange={(e) => setCanton(e.target.value)}
                        placeholder="Ej. Quito, Guayaquil..."
                        className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:border-sky-500 focus:bg-white transition"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Parroquia / Sector:</label>
                      <input
                        type="text"
                        value={parish}
                        title={parish || 'Parroquia / Sector'}
                        onChange={(e) => setParish(e.target.value)}
                        placeholder="Ej. Iñaquito, Cumbayá..."
                        className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:border-sky-500 focus:bg-white transition"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Dirección Exacta (Calles y N°):</label>
                      <input
                        type="text"
                        value={exactAddress}
                        title={exactAddress || 'Dirección Exacta'}
                        onChange={(e) => setExactAddress(e.target.value)}
                        placeholder="Ej. Av. Amazonas N24-102 y República, Edif. Torre Azul, Dpto 4B"
                        className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:border-sky-500 focus:bg-white transition"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Referencia de Entrega:</label>
                      <input
                        type="text"
                        value={reference}
                        title={reference || 'Referencia de Entrega'}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="Ej. Frente al parque / Enviar a Agencia"
                        className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:border-sky-500 focus:bg-white transition"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ================= SECTION 3: DETALLE DE PRODUCTOS ================= */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-purple-50 text-purple-700 border border-purple-200/60 flex items-center justify-center font-black text-xs shadow-2xs">
                  3
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-xs sm:text-sm tracking-tight flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-purple-600" />
                      Detalle de Productos del Pedido
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-mono text-[10px] font-bold border border-purple-200">
                      {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
                    </span>
                    {items.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-mono text-[10px] font-bold border border-slate-200">
                        {items.reduce((sum, i) => sum + i.quantity, 0)} unidades
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 font-normal">
                    Busca productos en inventario, ajusta precios unitarios y cantidades
                  </span>
                </div>
              </div>
            </div>

            {/* Product Search Input with Autocomplete */}
            <div className="relative">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setShowProductDropdown(true);
                  }}
                  onFocus={() => {
                    if (productSearch.trim().length > 0) setShowProductDropdown(true);
                  }}
                  onKeyDown={handleProductSearchKeyDown}
                  placeholder="Buscar producto por nombre, SKU o código de barras (Enter para agregar)..."
                  className="w-full h-10 pl-9 pr-8 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-100 font-medium transition"
                />
                {productSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setProductSearch('');
                      setShowProductDropdown(false);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-1 rounded-full hover:bg-slate-200 transition cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {showProductDropdown && filteredCatalogProducts.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-purple-200 rounded-xl shadow-xl z-40 overflow-hidden divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  <div className="px-3 py-1.5 bg-purple-50 text-[10px] font-bold text-purple-800 flex items-center justify-between">
                    <span>Productos disponibles ({filteredCatalogProducts.length}):</span>
                    <button
                      type="button"
                      onClick={() => setShowProductDropdown(false)}
                      className="text-slate-400 hover:text-slate-600 text-xs p-0.5 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  {filteredCatalogProducts.map((prod) => {
                    const isAlreadyIn = items.some((it) => it.id === prod.id || (prod.sku && it.sku === prod.sku));
                    const stock = Math.max(0, Number(prod.stock || 0));

                    // Desglose Tributario Ecuador SRI para Búsqueda
                    const unitCost = Number(prod.costWithoutTax ?? prod.costPrice ?? 0);
                    const rawSale = Number(prod.salePrice || 0);
                    const prodTaxPercent = extractItemTaxPercent(prod, 15);
                    const prodApplyTax = prodTaxPercent > 0;

                    const basePriceInfo = extractBaseUnitPriceWithoutTax({
                      rawSalePrice: rawSale,
                      costWithoutTax: unitCost,
                      pricingMode: prodApplyTax ? 'INCLUDING_TAX' : 'EXCLUDING_TAX',
                      applySaleTax: prodApplyTax,
                      saleTaxPercent: prodTaxPercent,
                      marginPercent: (prod as any).marginPercent !== undefined ? Number((prod as any).marginPercent) : undefined,
                    });

                    const sPrice = basePriceInfo.unitPriceWithoutTax;
                    let discVal = 0;
                    if (prod.discountPercent && prod.discountPercent > 0) {
                      discVal = Math.round((sPrice * prod.discountPercent / 100) * 100) / 100;
                    } else if ((prod as any).discount) {
                      discVal = Number((prod as any).discount || 0);
                    }

                    const calculated = calculateLineItem({
                      id: prod.id,
                      name: prod.name,
                      sku: prod.sku,
                      costWithoutTax: unitCost,
                      unitSalePrice: sPrice,
                      discount: discVal,
                      quantity: 1,
                      applySaleTax: prodApplyTax,
                      saleTaxPercent: prodTaxPercent,
                    });

                    const pvpMarcado = rawSale;
                    const subtotalSinIva = calculated.netUnitPrice;
                    const pvpFinal = calculated.lineTotal;
                    const taxRate = calculated.lineTaxPercent;

                    return (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => handleAddProduct(prod)}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-purple-50/60 transition flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                            {prod.imageUrl ? (
                              <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 text-xs truncate">{prod.name}</p>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                              {prod.sku && <span>SKU: {prod.sku}</span>}
                              <span>• Stock: {stock} un.</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <div className="text-right flex flex-col items-end">
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                              <span title="PVP Marcado de lista (Catálogo)">PVP Marcado: <strong className="text-slate-700">${pvpMarcado.toFixed(2)}</strong></span>
                              <span>•</span>
                              <span title="Subtotal sin IVA (Base Imponible)">Subtotal: <strong className="text-slate-700">${subtotalSinIva.toFixed(2)}</strong></span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono font-extrabold text-purple-700 text-xs">${pvpFinal.toFixed(2)}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-purple-100 text-purple-800">
                                PVP Final ({taxRate > 0 ? `IVA ${taxRate}%` : 'IVA 0%'})
                              </span>
                            </div>
                          </div>
                          {isAlreadyIn ? (
                            <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">En pedido</span>
                          ) : (
                            <span className="text-[9px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-bold">+ Agregar</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Products Table */}
            {items.length === 0 ? (
              <div className="py-8 px-4 rounded-xl border-2 border-dashed border-slate-200 text-center bg-slate-50/50 flex flex-col items-center justify-center">
                <Package className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-xs text-slate-800 font-bold">No has agregado productos a este pedido</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Busca productos en el catálogo superior o escanea su código para agregarlos.
                </p>
              </div>
            ) : (
              <div className="border border-slate-300 rounded-xl overflow-hidden shadow-xs bg-white">
                {/* Table Header (Formato Prefactura SRI 7 Columnas Exactas) */}
                <div className="hidden lg:grid lg:grid-cols-12 gap-2 px-3 py-2 bg-slate-900 text-white text-[10px] font-extrabold uppercase tracking-wider border-b border-slate-800">
                  <div className="col-span-1 text-center">N°</div>
                  <div className="col-span-2 flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-purple-400" />
                    <span>Código / SKU</span>
                  </div>
                  <div className="col-span-3">Producto</div>
                  <div className="col-span-1 text-center">Cantidad</div>
                  <div className="col-span-2 text-right" title="Precio unitario de venta sin IVA">Precio Sin IVA ($)</div>
                  <div className="col-span-1 text-right" title="Descuento unitario otorgado en dólares">Descuento ($)</div>
                  <div className="col-span-2 text-right" title="Subtotal base imponible de la línea sin IVA">Total ($)</div>
                </div>

                {/* Items List - Formato Prefactura SRI (7 Columnas) */}
                <div className="divide-y divide-slate-200 max-h-72 overflow-y-auto">
                  {items.map((it, idx) => {
                    const match = products.find((p) => p.id === it.id || (it.sku && p.sku && p.sku.toLowerCase() === it.sku.toLowerCase()));
                    const avail = match ? Math.max(0, Number(match.stock || 0)) : 0;
                    const unitCost = Number(it.costPrice ?? match?.costWithoutTax ?? match?.costPrice ?? 0);
                    const calculatedRow = calculateLineItem({
                      costWithoutTax: unitCost,
                      unitSalePrice: Number(it.salePrice || 0),
                      profitValue: (it as any).marginPercent !== undefined ? Number((it as any).marginPercent) : undefined,
                      profitCalculationMode: 'MARKUP_PERCENT',
                      discount: Number(it.discount || 0),
                      quantity: Number(it.quantity || 1),
                      applySaleTax,
                      saleTaxPercent,
                    });
                    const itemSubtotal = calculatedRow.lineSubtotal;

                    return (
                      <div key={idx} className="p-3 lg:px-3 lg:py-2.5 lg:grid lg:grid-cols-12 gap-2 items-center hover:bg-purple-50/30 transition border-b border-slate-200/80 text-xs">
                        {/* 1. N° (Número de producto) */}
                        <div className="col-span-1 flex items-center justify-center font-mono font-bold text-slate-500 text-xs mb-1 lg:mb-0">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] border border-slate-200">#{idx + 1}</span>
                        </div>

                        {/* 2. Código de barras / SKU / SKU Proveedor */}
                        <div className="col-span-2 flex flex-col font-mono text-xs truncate mb-1 lg:mb-0">
                          <span className="truncate font-bold text-purple-900" title={it.barcode || it.sku}>{it.barcode || it.sku || (it.id ? `PRD-${it.id}` : '—')}</span>
                          {((it as any).supplierCode || match?.supplierCode) && (
                            <button
                              type="button"
                              onClick={() => {
                                const supplierCode = (it as any).supplierCode || match?.supplierCode;
                                if (supplierCode) {
                                  navigator.clipboard.writeText(supplierCode);
                                  showToast(`✓ SKU Proveedor (${supplierCode}) copiado`);
                                }
                              }}
                              className="inline-flex items-center gap-1 text-[10px] text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1 py-0.2 rounded font-semibold cursor-pointer w-max transition"
                              title="Copiar SKU Proveedor al portapapeles"
                            >
                              <span className="truncate max-w-[75px]">Prov: {(it as any).supplierCode || match?.supplierCode}</span>
                              <Copy className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
                            </button>
                          )}
                        </div>

                        {/* 3. Nombre del producto */}
                        <div className="col-span-3 flex items-center gap-2 min-w-0 mb-1 lg:mb-0">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                            {it.imageUrl ? (
                              <img src={it.imageUrl} alt={it.name} className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-slate-900 truncate text-xs">{it.name}</p>
                            {avail < it.quantity && (
                              <span className="text-[9px] font-bold text-rose-700 bg-rose-50 px-1 rounded">
                                Faltan {it.quantity - avail} un.
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 4. Cantidad */}
                        <div className="col-span-1 flex justify-center mb-1 lg:mb-0">
                          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50 h-7">
                            <button
                              type="button"
                              onClick={() => {
                                if (it.quantity > 1) {
                                  setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, quantity: item.quantity - 1 } : item)));
                                } else {
                                  if (it.sku === 'ENVIO-DOMICILIO' || it.name === 'Servicios de entrega' || it.id === -999) {
                                    setShippingCost('0');
                                    setDeliveryType('pickup');
                                  }
                                  setItems((prev) => prev.filter((_, i) => i !== idx));
                                }
                              }}
                              className="w-5 h-full hover:bg-slate-200 text-slate-600 transition flex items-center justify-center cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-5 text-center text-xs font-mono font-bold text-slate-900">{it.quantity}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, quantity: item.quantity + 1 } : item)));
                              }}
                              className="w-5 h-full hover:bg-slate-200 text-slate-600 transition flex items-center justify-center cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* 5. Precio sin IVA ($) */}
                        <div className="col-span-2 flex items-center justify-between lg:justify-end gap-1 mb-1 lg:mb-0">
                          <span className="text-[10px] text-slate-500 font-bold lg:hidden">Precio sin IVA:</span>
                          <div className="relative flex items-center" title={`Precio de venta unitario sin IVA: $${Number(it.salePrice || 0).toFixed(2)}`}>
                            <span className="text-xs text-purple-600 font-bold absolute left-2 pointer-events-none">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={it.salePrice}
                              onChange={(e) => {
                                const newP = Math.max(0, Number(e.target.value) || 0);
                                const baseCost = Number(it.costPrice || 0);
                                const newMargin = baseCost > 0 ? Math.round(((newP - baseCost) / baseCost) * 100) : 0;
                                if (it.sku === 'ENVIO-DOMICILIO' || it.name === 'Servicios de entrega' || it.id === -999) {
                                  setShippingCost(String(newP));
                                }
                                setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, salePrice: newP, marginPercent: newMargin } : item)));
                              }}
                              className="w-24 h-8 pl-5 pr-1.5 rounded-lg bg-purple-50/40 border border-purple-200 text-right font-mono font-bold text-purple-950 text-xs focus:outline-none focus:bg-white focus:border-purple-600 transition"
                            />
                          </div>
                        </div>

                        {/* 6. Descuento ($) */}
                        <div className="col-span-1 flex items-center justify-between lg:justify-end gap-1 mb-1 lg:mb-0">
                          <span className="text-[10px] text-slate-500 font-bold lg:hidden">Descuento:</span>
                          <div className="relative flex items-center" title={`Descuento aplicado: $${Number(it.discount || 0).toFixed(2)}`}>
                            <span className="text-xs text-slate-400 font-bold absolute left-2 pointer-events-none">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={it.discount ?? 0}
                              onChange={(e) => {
                                const newDisc = Math.max(0, Number(e.target.value) || 0);
                                setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, discount: newDisc } : item)));
                              }}
                              className="w-20 h-8 pl-4 pr-1.5 rounded-lg bg-slate-50 border border-slate-200 text-right font-mono font-bold text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-purple-500 transition"
                            />
                          </div>
                        </div>

                        {/* 7. Total ($) */}
                        <div className="col-span-2 flex items-center justify-between lg:justify-end gap-1">
                          <span className="text-[10px] text-slate-500 font-bold lg:hidden">Total:</span>
                          <span className="font-mono font-bold text-xs text-purple-950 bg-purple-100 px-2 py-0.5 rounded-lg border border-purple-200 inline-block">
                            ${itemSubtotal.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (it.sku === 'ENVIO-DOMICILIO' || it.name === 'Servicios de entrega' || it.id === -999) {
                                setShippingCost('0');
                                setDeliveryType('pickup');
                              }
                              setItems((prev) => prev.filter((_, i) => i !== idx));
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition cursor-pointer ml-1"
                            title="Quitar ítem"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Subtotal Footer */}
                <div className="px-4 py-2 bg-slate-900 text-white flex items-center justify-between text-xs border-t border-slate-800">
                  <span className="text-slate-300 font-medium">
                    Ítems: <strong className="text-white">{items.length}</strong> • Unidades Totales: <strong className="text-white">{items.reduce((s, i) => s + i.quantity, 0)}</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-bold uppercase text-[10px]">Base Imponible Sin IVA:</span>
                    <span className="font-mono font-black text-purple-300 text-sm">
                      ${productsSubtotal.toFixed(2)} {currency}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Deficit Warning Card */}
            {stockAnalysis.hasDeficit && (
              <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-1.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="font-bold text-xs">
                      Modalidad Bajo Pedido ({stockAnalysis.totalDeficitUnits} un. sin stock físico en bodega)
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-800 bg-white/80 px-2 py-0.5 rounded font-bold border border-amber-200">
                    {stockAnalysis.itemsWithDeficit.length} productos por abastecer
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {stockAnalysis.itemsWithDeficit.map((def, dIdx) => (
                    <span key={dIdx} className="bg-white px-2 py-0.5 rounded border border-amber-200 text-[10px] text-slate-700">
                      <strong>{def.name}:</strong> <span className="text-rose-600 font-bold">Faltan {def.missing} un.</span>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2.5 text-xs font-bold text-emerald-950 p-2.5 rounded-xl bg-emerald-50 border border-emerald-300">
                  <div className="w-5 h-5 rounded-md bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                  <div className="flex-1">
                    <span>Generar automáticamente Orden de Compra a Proveedor con las unidades faltantes ({stockAnalysis.totalDeficitUnits} un.)</span>
                    <span className="block text-[10px] text-emerald-800 font-normal mt-0.5">
                      ✓ Esta opción está siempre activa al existir unidades faltantes (aviso automático del sistema, no se puede deseleccionar).
                    </span>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* ================= SECTION 4: PAGO, TESORERÍA Y RESUMEN FINANCIERO ================= */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center justify-center font-black text-xs shadow-2xs">
                  4
                </div>
                <div>
                  <span className="font-bold text-slate-900 text-xs sm:text-sm tracking-tight block">
                    Pago, Tesorería y Confirmación
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    Registra el método, cuenta receptora y número de comprobante o transacción
                  </span>
                </div>
              </div>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                  isCash ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {isCash ? 'Pago en Efectivo / Contraentrega' : 'Transferencia / Electrónico'}
              </span>
            </div>

            {/* Payment Method Badges with Logos */}
            <div className="space-y-1.5">
              <label className="block text-slate-700 font-bold text-xs">Métodos de Pago Registrados:</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {activePaymentPartners.map((partner) => {
                  const isSelected = paymentMethod === partner.name || paymentMethod === partner.id;
                  const logo = getPartnerLogo(partner, 'payment');
                  return (
                    <button
                      key={partner.id || partner.name}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(partner.name);
                        setBankOrAccount(partner.name);
                      }}
                      className={`p-2 rounded-xl border text-left transition cursor-pointer flex items-center gap-2.5 ${
                        isSelected
                          ? 'bg-emerald-50/90 border-emerald-500 shadow-xs ring-2 ring-emerald-200'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0 shadow-2xs">
                        <img src={logo} alt={partner.name} className="max-w-full max-h-full object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-xs text-slate-900 truncate">{partner.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                        </div>
                        <span className="text-[10px] text-slate-500 line-clamp-1 block">
                          {(partner as any).accountNumber || partner.details || 'Cuenta configurada'}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {/* Cash Option */}
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('Efectivo / Contraentrega');
                    setBankOrAccount('Caja Chica / Efectivo');
                  }}
                  className={`p-2 rounded-xl border text-left transition cursor-pointer flex items-center gap-2.5 ${
                    paymentMethod === 'Efectivo / Contraentrega'
                      ? 'bg-emerald-50/90 border-emerald-500 shadow-xs ring-2 ring-emerald-200'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0 shadow-2xs">
                    <img src={DEFAULT_PAYMENT_LOGOS['cash']} alt="Efectivo" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs text-slate-900 truncate">Efectivo</span>
                      {paymentMethod === 'Efectivo / Contraentrega' && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                    </div>
                    <span className="text-[10px] text-slate-500 line-clamp-1 block">Cobro en entrega</span>
                  </div>
                </button>

                {/* Dedicated Payphone API Option */}
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('Payphone');
                    setBankOrAccount('Payphone API / Pasarela Online');
                  }}
                  className={`p-2 rounded-xl border text-left transition cursor-pointer flex items-center gap-2.5 ${
                    isPayphonePaymentMethod
                      ? 'bg-orange-50/90 border-orange-500 shadow-xs ring-2 ring-orange-200'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-orange-100 border border-orange-200 p-1 flex items-center justify-center shrink-0 shadow-2xs">
                    <CreditCard className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs text-slate-900 truncate">Payphone</span>
                      {isPayphonePaymentMethod && <Check className="w-3.5 h-3.5 text-orange-600 shrink-0" />}
                    </div>
                    <span className="text-[10px] text-slate-500 line-clamp-1 block">Pasarela Enlace API</span>
                  </div>
                </button>
              </div>

            {/* Commission percentage input box (appears ONLY when Tarjeta or PayPhone is selected) */}
            {isCardPaymentMethod && (
              <div className="p-3.5 bg-sky-50/90 border border-sky-200 rounded-2xl space-y-2 animate-in fade-in duration-200 shadow-2xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-xs font-bold text-sky-950 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-sky-600" />
                    <span>Porcentaje de Comisión por Tarjeta / PayPhone (%)</span>
                  </label>
                  <span className="text-[10px] text-sky-700 font-mono bg-white px-2 py-0.5 rounded border border-sky-200 font-bold">
                    Fórmula: Subtotal / (1 - %Comisión)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="99"
                      value={cardCommissionPercent}
                      onChange={(e) => setCardCommissionPercent(Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="5.75"
                      className="w-full h-9 pl-3 pr-7 rounded-xl bg-white border border-sky-300 text-sky-950 font-mono font-bold text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none shadow-2xs"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-sky-600">%</span>
                  </div>
                  <div className="flex gap-1">
                    {[5.75, 7.5, 10, 12].map((comm) => (
                      <button
                        key={comm}
                        type="button"
                        onClick={() => setCardCommissionPercent(comm)}
                        className={`px-2 py-1 text-[10px] font-mono font-bold rounded-lg border transition cursor-pointer ${
                          cardCommissionPercent === comm
                            ? 'bg-sky-600 text-white border-sky-600'
                            : 'bg-white text-sky-800 border-sky-200 hover:bg-sky-100'
                        }`}
                      >
                        {comm}%
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[10.5px] text-sky-800 leading-tight">
                  💡 Al seleccionar este método de pago, los subtotales de cada producto y el desglose fiscal SRI se calcularán con la comisión ({cardCommissionPercent}%).
                </p>
              </div>
            )}
            </div>

            {/* Bloque Integración Payphone API (Solo cuando se selecciona el método de pago Payphone) */}
            {isPayphonePaymentMethod && payphoneConfig?.isActive && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-orange-950 via-slate-900 to-indigo-950 text-white space-y-3 shadow-md border border-orange-500/30">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-orange-400" />
                    <span className="font-bold text-xs text-white">Pasarela Payphone (Visa / Mastercard)</span>
                  </div>
                  <span className="text-[10px] bg-orange-500/30 text-orange-200 border border-orange-400/30 px-2 py-0.5 rounded-full font-bold">
                    Cobro por Link API
                  </span>
                </div>

                {!payphoneConfig?.hasToken ? (
                  <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Para generar enlaces de cobro con tarjeta, ingresa tu Token de Payphone en <strong>Ajustes &gt; Payphone API</strong>.</span>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {!payphoneUrl ? (
                      <button
                        type="button"
                        onClick={handleGeneratePayphoneLink}
                        disabled={payphoneGenerating || items.length === 0}
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {payphoneGenerating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Generando Enlace Payphone...</span>
                          </>
                        ) : (
                          <>
                            <CreditCard className="w-4 h-4 text-white" />
                            <span>Generar Link de Pago Payphone (${invoiceTotals.totalInvoiceAmount.toFixed(2)} USD)</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-orange-500/50 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="text-[10px] text-orange-300 font-bold uppercase tracking-wider block">Enlace de Pago Generado:</span>
                            <p className="font-mono text-xs text-white truncate">{payphoneUrl}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(payphoneUrl);
                              showToast('✓ Link de pago Payphone copiado');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shrink-0 cursor-pointer shadow-2xs"
                          >
                            Copiar Link
                          </button>
                        </div>

                        {/* Botones de Notificación: WhatsApp y Correo Gmail */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              const norm = normalizeEcuadorPhone(customerPhone);
                              const msg = `Hola ${customerName || 'Cliente'}, se ha generado su enlace de pago en línea con tarjeta Visa/Mastercard para el pedido #${order?.orderNumber || 'Venta'} por un total de $${invoiceTotals.totalInvoiceAmount.toFixed(2)} USD:\n\n${payphoneUrl}\n\nHaga clic en el enlace para realizar su pago seguro.`;
                              const url = buildWhatsAppLink(norm.whatsappDigits || customerPhone, msg);
                              window.open(url, '_blank');
                            }}
                            className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                          >
                            <MessageCircle className="w-3.5 h-3.5 fill-current" />
                            <span>Enviar por WhatsApp</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleSendPayphoneEmail}
                            disabled={payphoneSendingEmail}
                            className="py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-60"
                          >
                            {payphoneSendingEmail ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Enviando...</span>
                              </>
                            ) : (
                              <>
                                <Mail className="w-3.5 h-3.5" />
                                <span>Enviar por Correo (Gmail)</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Botón de Verificación de Estado de Pago Payphone */}
                        <button
                          type="button"
                          onClick={() => handleVerifyPayphoneTransaction()}
                          disabled={payphoneVerifying}
                          className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md disabled:opacity-60"
                        >
                          {payphoneVerifying ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                              <span>Verificando Pago en Payphone...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                              <span>Verificar Estado de Pago PayPhone (Confirmar Comprobante)</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Account in Treasury & Voucher Input */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <div className="h-5 flex items-center justify-between mb-1">
                  <label className="text-slate-700 font-bold text-xs">Cuenta Receptora en Tesorería:</label>
                </div>
                <div className="relative">
                  <Wallet className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={bankOrAccount}
                    title={bankOrAccount || 'Cuenta Receptora en Tesorería'}
                    onChange={(e) => setBankOrAccount(e.target.value)}
                    placeholder="Ej. Banco Pichincha Ahorros / Caja"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs sm:text-sm font-semibold focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <div className="h-5 flex items-center justify-between mb-1">
                  <label className="text-slate-700 font-bold text-xs">
                    N° de Comprobante / Transacción: {!isCash && <span className="text-rose-500 font-bold">*</span>}
                  </label>
                  <span className="text-[10px] text-slate-400">{isCash ? 'Opcional para efectivo' : 'Requerido para confirmar'}</span>
                </div>
                <div className="relative">
                  <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={voucherInput}
                    title={voucherInput || 'Número de Comprobante / Transacción'}
                    onChange={(e) => {
                      setVoucherInput(e.target.value);
                      if (voucherError) setVoucherError(null);
                    }}
                    placeholder={isCash ? 'EFECTIVO - CONTRAENTREGA' : 'Ej. 004829148'}
                    className={`w-full h-10 pl-9 pr-3 rounded-xl font-mono text-xs sm:text-sm font-bold focus:outline-none transition ${
                      voucherInput.trim()
                        ? 'bg-emerald-50/50 border border-emerald-400 text-slate-900 focus:border-emerald-600'
                        : isCash
                        ? 'bg-slate-50 border border-slate-200 text-slate-900'
                        : 'bg-slate-50 border border-slate-200 text-slate-900 focus:border-emerald-500 focus:bg-white'
                    }`}
                  />
                </div>
                {!isCash && (
                  <div className="mt-1.5">
                    {!voucherInput.trim() ? (
                      <p className="text-[11px] text-amber-800 flex items-start gap-1.5 font-medium bg-amber-50/80 p-2 rounded-lg border border-amber-200/80">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          El pedido permanecerá <strong>Pendiente</strong> hasta que se ingrese el comprobante de pago. Si el cliente aún no te envía el comprobante, usa el botón <strong>&quot;Guardar&quot;</strong>.
                        </span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-emerald-800 flex items-center gap-1.5 font-bold bg-emerald-50/90 p-2 rounded-lg border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>
                          ✓ Comprobante listo: Al confirmar, el pedido continuará su flujo a <strong>Confirmado</strong> y se registrará en tesorería.
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Notes Input */}
            <div>
              <label className="block text-slate-700 font-bold mb-1 text-xs">Notas u Observaciones del Pedido:</label>
              <textarea
                rows={2}
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                placeholder="Observaciones de entrega, indicaciones de empaque o referencias de pago..."
                className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-emerald-500 focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* FIXED BOTTOM PANEL: Resumen de Venta Fijo con Desglose SRI (Mismo estilo y ubicación que compras) */}
        <div className="flex-shrink-0 border-t border-slate-200 bg-slate-900 p-3 sm:p-3.5 space-y-3 shadow-lg z-10">
          <div className="text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5">
              <div className="w-8.5 h-8.5 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-300 flex-shrink-0">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Resumen de Venta & Facturación SRI</span>
                <span className="text-xs font-bold text-slate-200">
                  {items.reduce((s, i) => s + i.quantity, 0)} unidades totales ({items.length} {items.length === 1 ? 'producto' : 'productos'})
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Modalidad: <strong className="text-slate-200">{deliveryType === 'pickup' ? 'Retiro en Local' : 'Envío a Domicilio'}</strong>
                </span>
              </div>
            </div>

            {/* SRI Totals Breakdown (Desglose Tributario Oficial) */}
            <div className="w-full sm:w-auto bg-slate-800/90 rounded-xl p-3 border border-slate-700 text-xs font-mono space-y-1 min-w-[300px]">
              {/* 1. Subtotal 0% */}
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Subtotal 0%:</span>
                <span className="font-bold text-slate-200">${invoiceTotals.subtotalZero0.toFixed(2)}</span>
              </div>
              {/* 2. Subtotal 15% */}
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Subtotal 15%:</span>
                <span className="font-bold text-slate-200">${invoiceTotals.subtotalTaxable15.toFixed(2)}</span>
              </div>
              {/* 3. Subtotal 5% */}
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Subtotal 5%:</span>
                <span className="font-bold text-slate-200">${invoiceTotals.subtotalTaxable5.toFixed(2)}</span>
              </div>
              {/* 4. Subtotal Sin Impuestos */}
              <div className="flex justify-between text-slate-300 font-bold text-[11px] pt-1 border-t border-slate-700/80">
                <span>Subtotal Sin Impuestos:</span>
                <span className="text-white">${invoiceTotals.subtotalNoTax.toFixed(2)}</span>
              </div>
              {/* 5. Total Descuento */}
              <div className="flex justify-between text-purple-300 text-[11px]">
                <span>Total Descuento:</span>
                <span className="font-bold">-${totalDiscountAmount.toFixed(2)}</span>
              </div>
              {/* 6. IVA 15% */}
              <div className="flex justify-between text-amber-300 text-[11px]">
                <span>IVA 15%:</span>
                <span className="font-bold">+${(invoiceTotals.taxAmount15 || (salesTaxAmount > 0 ? salesTaxAmount : 0)).toFixed(2)}</span>
              </div>
              {/* 7. IVA 5% */}
              <div className="flex justify-between text-amber-300 text-[11px]">
                <span>IVA 5%:</span>
                <span className="font-bold">+${(invoiceTotals.taxAmount5 || 0).toFixed(2)}</span>
              </div>
              {/* 8. Valor Envío (Opcional) */}
              {deliveryType === 'shipping' && shippingFee > 0 && (
                <div className="flex justify-between text-sky-300 text-[11px]">
                  <span>Valor Envío ({trackingCarrier}):</span>
                  <span className="font-bold">+${shippingFee.toFixed(2)}</span>
                </div>
              )}
              {/* 9. Total Final */}
              <div className="flex justify-between text-emerald-400 font-black text-sm pt-1.5 border-t border-slate-700">
                <span>TOTAL PREFACTURA:</span>
                <span>${totalOrderAmount.toFixed(2)} {currency}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ================= MODAL FOOTER & ACTIONS (CANCELAR, GUARDAR PRE-FACTURA, EMITIR FACTURA, NOTIFICAR POR WHATSAPP) ================= */}
        <div className="px-5 sm:px-6 py-3.5 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 shadow-xs">
          {/* Botón: Cancelar */}
          <button
            type="button"
            disabled={isSaving || isConfirming}
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-xs font-semibold transition cursor-pointer"
          >
            Cancelar
          </button>

          <div className="w-full sm:w-auto flex flex-wrap items-center justify-end gap-2 sm:gap-2.5">
            {isLockedFromEdit ? (
              <div className="px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold flex items-center gap-2 shadow-2xs">
                <Lock className="w-4 h-4 text-slate-500" />
                <span>Factura Comercial (Confirmada e Inmutable)</span>
              </div>
            ) : (
              <>
                {/* Botón: Guardar Pre-Factura */}
                <button
                  type="button"
                  disabled={isSaving || isConfirming || items.length === 0 || !customerPhone.trim() || isExceedingConsumidorFinalLimit}
                  onClick={() => handleSaveOrder(false, false)}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                  title={isExceedingConsumidorFinalLimit ? "Venta mayor a $199.99 no permite Consumidor Final" : "Guarda la pre-factura sin emitir la factura comercial"}
                >
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>{isSaving ? 'Guardando...' : 'Guardar Pre-Factura'}</span>
                </button>

                {/* Botón: Emitir y Confirmar Factura */}
                <button
                  type="button"
                  disabled={isSaving || isConfirming || items.length === 0 || !customerPhone.trim() || isExceedingConsumidorFinalLimit}
                  onClick={() => handleConfirmOrder(false)}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm ring-2 ring-emerald-200"
                  title={isExceedingConsumidorFinalLimit ? "Venta mayor a $199.99 no permite Consumidor Final" : "Valida la pre-factura y emite la factura comercial confirmada"}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isConfirming ? 'Emitiendo Factura...' : '✓ Emitir y Confirmar Factura'}</span>
                </button>
              </>
            )}

            {/* Botón: Notificar al cliente la pre-factura actual */}
            <button
              type="button"
              disabled={isSaving || isConfirming || items.length === 0 || !customerPhone.trim()}
              onClick={handleNotifyClientProforma}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black transition flex items-center justify-center space-x-2 cursor-pointer shadow-sm ring-2 ring-teal-200"
              title="Guarda y envía la pre-factura con el desglose actual por WhatsApp"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Notificar Pre-Factura por WhatsApp</span>
            </button>
          </div>
        </div>
      </div>

      {showPrintA4Modal && (
        <OrderPrintA4Modal
          order={currentOrderForTicket}
          inventoryItems={products}
          storeConfig={storeConfig}
          currency={currency}
          onClose={() => setShowPrintA4Modal(false)}
          showToast={showToast}
        />
      )}

      {/* Modal Emergente de Notificación de Resultado de Pago PayPhone */}
      {payphoneResultModal.open && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 text-center relative overflow-hidden">
            {payphoneResultModal.status === 'APPROVED' ? (
              <>
                {payphoneResultModal.isTestMode && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-black uppercase tracking-wider mx-auto">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>🧪 MODO PRUEBA / SANDBOX (PAYPHONE API)</span>
                  </div>
                )}
                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-white">
                    {payphoneResultModal.isTestMode ? '¡Pago de Prueba Realizado Correctamente!' : '¡Pago Realizado Correctamente!'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {payphoneResultModal.message || 'El pago fue procesado con éxito por la pasarela Payphone.'}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-800/80 border border-emerald-500/30 text-left space-y-2 text-xs">
                  <div className="flex justify-between items-center border-b border-slate-700/50 pb-2">
                    <span className="text-slate-400">N° de Comprobante:</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">{payphoneResultModal.transactionId}</span>
                  </div>
                  {payphoneResultModal.authorizationCode && (
                    <div className="flex justify-between items-center border-b border-slate-700/50 pb-2">
                      <span className="text-slate-400">Código Autorización:</span>
                      <span className="font-mono font-bold text-slate-200">{payphoneResultModal.authorizationCode}</span>
                    </div>
                  )}
                  {payphoneResultModal.amount !== undefined && (
                    <div className="flex justify-between items-center border-b border-slate-700/50 pb-2">
                      <span className="text-slate-400">Monto Cobrado:</span>
                      <span className="font-bold text-white text-sm">${payphoneResultModal.amount.toFixed(2)} USD</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Método:</span>
                    <span className="font-bold text-orange-400">Payphone ({payphoneResultModal.cardType || 'Visa/Mastercard'})</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] text-center font-medium">
                  ✓ El número de comprobante ha sido colocado automáticamente en la casilla de confirmación.
                </div>

                <button
                  type="button"
                  onClick={() => setPayphoneResultModal({ ...payphoneResultModal, open: false })}
                  className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition cursor-pointer shadow-lg shadow-emerald-900/30"
                >
                  Aceptar y Continuar
                </button>
              </>
            ) : (
              <>
                <div className="mx-auto w-16 h-16 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center text-rose-400">
                  <XCircle className="w-10 h-10" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-white">No se realizó el pago</h3>
                  <p className="text-xs text-slate-300">
                    {payphoneResultModal.message || 'La transacción de Payphone no pudo ser completada o fue rechazada.'}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-800/80 border border-rose-500/30 text-left space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Estado de Pasarela:</span>
                    <span className="font-bold text-rose-400 uppercase tracking-wider">{payphoneResultModal.status}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Verifique si el cliente completó la transacción en su tarjeta o intente generar un nuevo enlace de cobro.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setPayphoneResultModal({ ...payphoneResultModal, open: false })}
                  className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm transition cursor-pointer border border-slate-700"
                >
                  Cerrar Ventana
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

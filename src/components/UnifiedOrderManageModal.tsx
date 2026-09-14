import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  Barcode,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
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
    customerCi?: string
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
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [customerFiscalAddress, setCustomerFiscalAddress] = useState<string>('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState<boolean>(false);
  const [matchedCustomerInfo, setMatchedCustomerInfo] = useState<any | null>(null);
  const [ecuadorApiStatus, setEcuadorApiStatus] = useState<{ loading: boolean; source?: string; message?: string } | null>(null);

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
            if (data.data.address && !customerFiscalAddress) {
              setCustomerFiscalAddress(data.data.address);
            }
            setEcuadorApiStatus({
              loading: false,
              source: 'Ecuador API',
              message: `✓ ${isRuc ? 'Razón Social' : 'Nombre'} autocompletado por Ecuador API`,
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
    }>
  >([]);

  // Product Search for Adding
  const [productSearch, setProductSearch] = useState<string>('');
  const [showProductDropdown, setShowProductDropdown] = useState<boolean>(false);

  // Payment & Treasury
  const [paymentMethod, setPaymentMethod] = useState<string>('whatsapp');
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

  // Order status
  const orderStatus = order?.status || 'pending';
  const isConfirmed = orderStatus === 'confirmed';
  const isShipped = orderStatus === 'shipped';
  const isDelivered = orderStatus === 'delivered';
  const isCancelled = orderStatus === 'cancelled';
  const isPartial = order ? isOrderPartiallyDelivered(order) : false;
  const isLockedFromEdit = !isCreateMode && (isConfirmed || isShipped || isDelivered || isCancelled || isPartial);

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
        const targetId = it.inventoryItemId || it.id;
        const matchingProduct = products.find((p) => p.id === targetId || (it.sku && p.sku && p.sku.toLowerCase() === it.sku.toLowerCase()));
        const cPrice = Number(it.costPrice ?? matchingProduct?.costWithoutTax ?? matchingProduct?.costPrice ?? 0);
        const rawSale = Number(it.salePrice || it.item?.salePrice || matchingProduct?.salePrice || 0);
        const itemTaxPct = extractItemTaxPercent(it, orderTaxPct, matchingProduct);
        const itemApplyTax = itemTaxPct > 0;
        const basePriceInfo = extractBaseUnitPriceWithoutTax({
          rawSalePrice: rawSale,
          costWithoutTax: cPrice,
          pricingMode: itemApplyTax ? 'INCLUDING_TAX' : 'EXCLUDING_TAX',
          applySaleTax: itemApplyTax,
          saleTaxPercent: itemTaxPct,
          marginPercent: it.marginPercent !== undefined ? Number(it.marginPercent) : (matchingProduct as any)?.marginPercent,
        });
        const baseSalePrice = basePriceInfo.unitPriceWithoutTax;
        const marginPct = basePriceInfo.marginPercent;
        let discVal = Number(it.discount ?? 0);
        if (discVal === 0 && (it.discountPercent || matchingProduct?.discountPercent)) {
          const pct = Number(it.discountPercent || matchingProduct?.discountPercent || 0);
          if (pct > 0) {
            discVal = Math.round((baseSalePrice * pct / 100) * 100) / 100;
          }
        }
        return {
          id: targetId,
          inventoryItemId: it.inventoryItemId || it.id,
          name: it.name || it.item?.name || 'Producto',
          sku: it.sku || it.item?.sku || '',
          barcode: it.barcode || matchingProduct?.barcode || undefined,
          costPrice: cPrice,
          marginPercent: marginPct,
          supplierName: it.supplierName || (matchingProduct as any)?.supplier || undefined,
          salePrice: baseSalePrice,
          discount: discVal,
          discountPercent: it.discountPercent ? Number(it.discountPercent) : (matchingProduct?.discountPercent ? Number(matchingProduct.discountPercent) : 0),
          quantity: Number(it.quantity || 1),
          imageUrl: it.imageUrl || it.item?.imageUrl || matchingProduct?.imageUrl || null,
        };
      });
      setItems(parsedItems);

      // Shipping cost calculation
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
        const orderTotal = Number(order.totalAmount || 0);
        const derivedShip = Math.max(0, orderTotal - itemsTotalWithTax);
        setShippingCost(derivedShip > 0 ? derivedShip.toFixed(2) : '0');
      }

      // Payment & Notes
      const initialMethod = order.paymentMethod || activePaymentPartners[0]?.name || 'whatsapp';
      setPaymentMethod(initialMethod);
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
    if (!q || q.length < 2) return [];

    const map = new Map<string, any>();
    // Add from dbCustomers
    (dbCustomers || []).forEach((c: any) => {
      const ci = (c.ci || '').trim();
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
  }, [customerCi, dbCustomers]);

  const handleSelectCustomer = (cust: any) => {
    setCustomerCi(cust.ci || '');
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

  // Financial Calculations - SRI Ecuador Central Engine
  const invoiceTotals = useMemo(() => {
    const calculatedItems = items.map((it) => {
      const match = products.find((p) => p.id === it.id || (it.sku && p.sku && p.sku.toLowerCase() === it.sku.toLowerCase()));
      const unitCost = Number(it.costPrice ?? match?.costWithoutTax ?? match?.costPrice ?? 0);
      const unitSale = Number(it.salePrice || 0);
      const itemTaxPercent = extractItemTaxPercent(it, 15, match);

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
      });
    });

    const fee = deliveryType === 'pickup' ? 0 : Math.max(0, Number(shippingCost) || 0);
    return calculateInvoiceTotals(calculatedItems, { shippingFee: fee });
  }, [items, products, deliveryType, shippingCost]);

  const productsSubtotal = invoiceTotals.subtotalNoTax;
  const totalDiscountAmount = invoiceTotals.totalDiscount;
  const salesTaxAmount = invoiceTotals.totalTax;
  const shippingFee = invoiceTotals.shippingFee;
  const totalOrderAmount = invoiceTotals.totalInvoiceAmount;

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
    if (!trimmed) return null;
    return validateEcuadorId(trimmed, true);
  }, [customerCi]);

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
          shippingAddress: !isPick ? finalDest : undefined,
          deliveryType,
          trackingCarrier: !isPick ? (trackingCarrier.trim() || undefined) : undefined,
          trackingNumber: !isPick ? (trackingNumber.trim() || undefined) : undefined,
          paymentMethod: paymentMethod || 'whatsapp',
          bankOrAccount: selectedBank,
          status: 'confirmed',
          paymentVoucher: voucherToSave,
          notes: finalNotes || undefined,
          items: items,
          totalAmount: totalOrderAmount,
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
              ciToValidate || undefined
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
        // CONFIRM EXISTING ORDER
        if (onUpdateOrder) {
          await onUpdateOrder(order.id, {
            customerName: cleanName,
            customerPhone: cleanPhone,
            customerEmail: customerEmail.trim() || null,
            customerCi: ciToValidate || null,
            ci: ciToValidate || null,
            customerAddress: finalDest,
            clientAddress: customerFiscalAddress.trim() || null,
            shippingAddress: finalDest,
            deliveryType,
            trackingCarrier: isPick ? null : (trackingCarrier.trim() || null),
            trackingNumber: isPick ? null : (trackingNumber.trim() || null),
            trackingNotes: isPick ? null : (trackingNotes.trim() || null),
            paymentMethod,
            bankOrAccount: selectedBank,
            paymentVoucher: voucherToSave,
            notes: finalNotes || null,
            items: items as any,
            totalAmount: totalOrderAmount.toFixed(2),
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
          ciToValidate || undefined
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
            {/* Direct Print Actions for both modes */}
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
              title="Imprimir vista previa de venta"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Venta</span>
            </button>
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
              title="Imprimir ticket térmico de rotulado"
            >
              <Truck className="w-3.5 h-3.5 text-sky-200" />
              <span>Imprimir Ticket Rotulado</span>
            </button>

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

            {/* 4 Clean Columns: CI, Name, Phone, Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. Cédula / RUC con autocompletado y validación */}
              <div className="relative flex flex-col justify-start">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-700 font-bold text-xs">Cédula / RUC:</label>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-mono font-medium border border-emerald-200/60">
                    Ecuador
                  </span>
                </div>
                <div className="relative">
                  <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
                  <input
                    type="text"
                    value={customerCi}
                    onChange={(e) => {
                      setCustomerCi(e.target.value);
                      if (e.target.value.trim().length >= 2) {
                        setShowCustomerDropdown(true);
                      }
                    }}
                    onFocus={() => {
                      if (customerCi.trim().length >= 2 && matchingCustomerSuggestions.length > 0) {
                        setShowCustomerDropdown(true);
                      }
                    }}
                    placeholder="Ej. 1712345678"
                    className={`w-full h-10 pl-9 pr-8 rounded-xl font-mono text-xs focus:outline-none font-semibold transition ${
                      customerCi.trim()
                        ? idValidation?.isValid
                          ? 'bg-emerald-50/50 border border-emerald-400 text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                          : 'bg-rose-50/50 border border-rose-400 text-slate-900 focus:border-rose-600 focus:ring-2 focus:ring-rose-100'
                        : 'bg-slate-50 border border-slate-200 text-slate-900 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100'
                    }`}
                  />
                  {customerCi && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerCi('');
                        setMatchedCustomerInfo(null);
                        setShowCustomerDropdown(false);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-1 rounded-full hover:bg-slate-200 transition cursor-pointer"
                      title="Borrar"
                    >
                      ✕
                    </button>
                  )}
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

                <div className="h-5 mt-1">
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
                        <span className="truncate">✓ {idValidation.type === 'cedula' ? 'Cédula Válida' : 'RUC Válido'} ({idValidation.provinceName})</span>
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

              {/* 2. Nombre o Razón Social */}
              <div className="flex flex-col justify-start">
                <label className="block text-slate-700 font-bold mb-1.5 text-xs">
                  Nombre o Razón Social:
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ej. María Gómez"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition font-medium"
                  />
                </div>
                <div className="h-5 mt-1">
                  <p className="text-[10px] text-slate-400">Titular de la factura o ticket</p>
                </div>
              </div>

              {/* 3. Teléfono / WhatsApp */}
              <div className="flex flex-col justify-start">
                <div className="flex items-center justify-between mb-1.5">
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
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Ej. 0983302390"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition"
                  />
                </div>
                <div className="h-5 mt-1">
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

              {/* 4. Correo Electrónico */}
              <div className="flex flex-col justify-start">
                <label className="block text-slate-700 font-bold mb-1.5 text-xs">
                  Correo Electrónico:
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="cliente@ejemplo.com"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition font-medium"
                  />
                </div>
                <div className="h-5 mt-1">
                  <p className="text-[10px] text-slate-400">Opcional para recibo o factura digital</p>
                </div>
              </div>
            </div>

            {/* Dirección Residencial / Fiscal (Opcional) en Datos del Cliente */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex items-center gap-1.5 shrink-0">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                <label className="text-xs font-bold text-slate-700">
                  Dirección Residencial / Fiscal (Opcional):
                </label>
              </div>
              <input
                type="text"
                value={customerFiscalAddress}
                onChange={(e) => setCustomerFiscalAddress(e.target.value)}
                placeholder="Domicilio fiscal o residencial del cliente para facturación o registro en CRM..."
                className="flex-1 h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 font-medium transition"
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
                        onChange={(e) => setProvince(e.target.value)}
                        placeholder="Ej. Pichincha, Guayas..."
                        className="w-full h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:border-sky-500 focus:bg-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Cantón / Ciudad:</label>
                      <input
                        type="text"
                        value={canton}
                        onChange={(e) => setCanton(e.target.value)}
                        placeholder="Ej. Quito, Guayaquil..."
                        className="w-full h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:border-sky-500 focus:bg-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Parroquia / Sector:</label>
                      <input
                        type="text"
                        value={parish}
                        onChange={(e) => setParish(e.target.value)}
                        placeholder="Ej. Iñaquito, Cumbayá..."
                        className="w-full h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:border-sky-500 focus:bg-white"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Dirección Exacta (Calles y N°):</label>
                      <input
                        type="text"
                        value={exactAddress}
                        onChange={(e) => setExactAddress(e.target.value)}
                        placeholder="Ej. Av. Amazonas N24-102 y República, Edif. Torre Azul, Dpto 4B"
                        className="w-full h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:border-sky-500 focus:bg-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Referencia de Entrega:</label>
                      <input
                        type="text"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="Ej. Frente al parque / Enviar a Agencia"
                        className="w-full h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:border-sky-500 focus:bg-white"
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
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-bold text-purple-700 text-xs">${Number(prod.salePrice || 0).toFixed(2)}</span>
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

                        {/* 2. Código de barras / SKU */}
                        <div className="col-span-2 flex items-center gap-1 font-mono font-bold text-purple-900 text-xs truncate mb-1 lg:mb-0">
                          <span className="truncate" title={it.barcode || it.sku}>{it.barcode || it.sku || (it.id ? `PRD-${it.id}` : '—')}</span>
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
                          <div className="relative flex items-center" title={`Precio de venta unitario sin IVA`}>
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
                                setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, salePrice: newP, marginPercent: newMargin } : item)));
                              }}
                              className="w-20 h-7 pl-5 pr-1 rounded-lg bg-purple-50/40 border border-purple-200 text-right font-mono font-bold text-purple-950 text-xs focus:outline-none focus:bg-white focus:border-purple-600"
                            />
                          </div>
                        </div>

                        {/* 6. Descuento ($) */}
                        <div className="col-span-1 flex items-center justify-between lg:justify-end gap-1 mb-1 lg:mb-0">
                          <span className="text-[10px] text-slate-500 font-bold lg:hidden">Descuento:</span>
                          <div className="relative flex items-center">
                            <span className="text-xs text-slate-400 font-bold absolute left-1.5 pointer-events-none">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={it.discount ?? 0}
                              onChange={(e) => {
                                const newDisc = Math.max(0, Number(e.target.value) || 0);
                                setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, discount: newDisc } : item)));
                              }}
                              className="w-14 h-7 pl-3.5 pr-1 rounded-lg bg-slate-50 border border-slate-200 text-right font-mono font-bold text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-purple-500"
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
                            onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
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
              </div>
            </div>

            {/* Account in Treasury & Voucher Input */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-slate-700 font-bold mb-1 text-xs">Cuenta Receptora en Tesorería:</label>
                <div className="relative">
                  <Wallet className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={bankOrAccount}
                    onChange={(e) => setBankOrAccount(e.target.value)}
                    placeholder="Ej. Banco Pichincha Ahorros / Caja"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs font-semibold focus:outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
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
                    onChange={(e) => {
                      setVoucherInput(e.target.value);
                      if (voucherError) setVoucherError(null);
                    }}
                    placeholder={isCash ? 'EFECTIVO - CONTRAENTREGA' : 'Ej. 004829148'}
                    className={`w-full h-10 pl-9 pr-3 rounded-xl font-mono text-xs font-bold focus:outline-none transition ${
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
                  disabled={isSaving || isConfirming || items.length === 0 || !customerPhone.trim()}
                  onClick={() => handleSaveOrder(false, false)}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                  title="Guarda la pre-factura sin emitir la factura comercial"
                >
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>{isSaving ? 'Guardando...' : 'Guardar Pre-Factura'}</span>
                </button>

                {/* Botón: Emitir y Confirmar Factura */}
                <button
                  type="button"
                  disabled={isSaving || isConfirming || items.length === 0 || !customerPhone.trim()}
                  onClick={() => handleConfirmOrder(false)}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm ring-2 ring-emerald-200"
                  title="Valida la pre-factura y emite la factura comercial confirmada"
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
    </div>
  );
};

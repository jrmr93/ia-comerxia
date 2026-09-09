import React, { useState, useMemo } from 'react';
import {
  X,
  Truck,
  MessageCircle,
  Copy,
  Check,
  Send,
  CreditCard,
  Receipt,
  Edit3,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Building2,
  DollarSign,
  Package,
  Phone,
  MapPin,
  Clock,
  ArrowRight,
  ExternalLink,
  Printer,
  FileText,
  User,
  ShieldCheck,
} from 'lucide-react';
import { CustomerOrder, CourierPartner, PaymentMethodPartner, StoreConfig } from '../types.ts';
import { directPrintShippingTicket } from './ShippingTicketModal.tsx';
import { normalizeEcuadorPhone, buildWhatsAppLink, isCashPayment } from '../utils/phone.ts';
import { getCustomerCi, stripCiFromAddress, isPickupDeliveryOrder, deriveBankOrAccountFromMethod, isOnlineStoreOrder } from '../utils/orderUtils.ts';
import { validateEcuadorId } from '../utils/ecuadorIdValidator.ts';

interface ManagePendingShippingModalProps {
  order: CustomerOrder | null;
  storeConfig: StoreConfig;
  courierPartners?: CourierPartner[];
  paymentPartners?: PaymentMethodPartner[];
  currency?: string;
  onClose: () => void;
  onUpdateOrder?: (orderId: number, data: Partial<CustomerOrder>) => Promise<any>;
  onUpdateOrderStatus: (
    orderId: number,
    status: CustomerOrder['status'],
    voucher?: string,
    notes?: string,
    trackingNumber?: string,
    trackingCarrier?: string,
    trackingNotes?: string,
    purchaseAction?: 'cancel' | 'keep',
    paymentMethod?: string,
    bankOrAccount?: string,
    customerCi?: string
  ) => Promise<any>;
  onOpenEditOrder: (order: CustomerOrder) => void;
  onOpenDeleteOrder: (order: CustomerOrder) => void;
  onPrintShippingTicket?: (order: CustomerOrder) => void;
  showToast: (msg: string) => void;
}

export const ManagePendingShippingModal: React.FC<ManagePendingShippingModalProps> = ({
  order,
  storeConfig,
  courierPartners = [],
  paymentPartners = [],
  currency = '$',
  onClose,
  onUpdateOrder,
  onUpdateOrderStatus,
  onOpenEditOrder,
  onOpenDeleteOrder,
  onPrintShippingTicket,
  showToast,
}) => {
  if (!order) return null;

  const phoneNorm = normalizeEcuadorPhone(order.customerPhone);
  const isPickup = isPickupDeliveryOrder(order);
  const activeCouriers = courierPartners.filter((c) => c.active !== false);
  const activePayments = paymentPartners.filter((p) => p.active !== false);

  // Calculate items subtotal
  const items = Array.isArray(order.items) ? order.items : [];
  const itemsSubtotal = items.reduce(
    (acc: number, it: any) =>
      acc + (Number(it.salePrice || it.item?.salePrice || 0) * (Number(it.quantity) || 1)),
    0
  );
  const currentTotal = Number(order.totalAmount) || 0;
  const initialShipCost = currentTotal > itemsSubtotal + 0.01 ? (currentTotal - itemsSubtotal).toFixed(2) : String(storeConfig.deliveryFee || '0');

  // =========================================================================
  // 1.- WHATSAPP TEMPLATE ASKING FOR COMPLETE SHIPPING DATA
  // =========================================================================
  const [copiedTemplate, setCopiedTemplate] = useState(false);

  // Short message asking client for complete shipping details to quote
  const buildCompleteShippingAskText = useMemo(() => {
    const itemsSummary = items
      .map(
        (it: any) =>
          `• ${it.quantity || 1}x ${it.name || it.item?.name || 'Producto'} ($${Number(it.salePrice || it.item?.salePrice || 0).toFixed(2)})`
      )
      .join('\n');

    let text = `¡Hola *${order.customerName || 'estimado/a'}*! 👋 Gracias por tu pedido en *${storeConfig.storeName || 'nuestra tienda'}* (Pedido #${order.orderNumber}).\n\n`;
    text += `📦 *Detalle del Pedido:* \n${itemsSummary || '• Productos varios'}\n`;
    text += `💵 *Subtotal:* $${itemsSubtotal.toFixed(2)} ${currency}\n\n`;
    text += `Para cotizarte el costo exacto de envío y preparar tu paquete para despacho, por favor confírmanos tus *datos completos de entrega*:\n\n`;
    text += `👤 *Nombres y Apellidos:* \n`;
    text += `🪪 *N° de Cédula (para la guía):* \n`;
    text += `🏛️ *Provincia:* \n`;
    text += `🏙️ *Cantón / Ciudad:* \n`;
    text += `📍 *Parroquia:* \n`;
    text += `🏠 *Barrio / Sector / Dirección exacta (calles y N° de casa):* \n`;
    text += `📌 *Referencia de entrega o Agencia de preferencia:* \n`;
    text += `📱 *Teléfono de contacto:* \n\n`;
    text += `¡Quedamos atentos a tus datos para enviarte el total con el envío y los datos de pago de inmediato! 🚚`;
    return text;
  }, [order, items, itemsSubtotal, storeConfig.storeName, currency]);

  // =========================================================================
  // 2.- DESTINATION & RECIPIENT DATA FORM STATE
  // =========================================================================
  const parseAddress = (rawAddress: string, existingCi: string) => {
    let prov = '';
    let can = '';
    let par = '';
    let dir = stripCiFromAddress(rawAddress || '');

    const provMatch = rawAddress.match(/(?:Provincia|Prov\.?)[\s:]*([^\n|]+)/i);
    if (provMatch) prov = stripCiFromAddress(provMatch[1]).trim();

    const canMatch = rawAddress.match(/(?:Cant[oó]n|Ciudad|Cant\.?)[\s:]*([^\n|]+)/i);
    if (canMatch) can = stripCiFromAddress(canMatch[1]).trim();

    const parMatch = rawAddress.match(/(?:Parroquia|Parr\.?)[\s:]*([^\n|]+)/i);
    if (parMatch) par = stripCiFromAddress(parMatch[1]).trim();

    const dirMatch = rawAddress.match(/(?:Direcci[oó]n|Direccion)[\s:]*([\s\S]+)/i);
    if (dirMatch) {
      dir = stripCiFromAddress(dirMatch[1]).trim();
    } else {
      if (existingCi) {
        dir = dir
          .replace(new RegExp(`(?:C\\.?I\\.?|C[eé]dula)[\\s:]*${existingCi}`, 'i'), '')
          .replace(/^[|\s,;-]+|[|\s,;-]+$/g, '')
          .trim();
      }
    }

    return { prov, can, par, dir };
  };

  const isStore = isOnlineStoreOrder(order);
  // Para pedidos que ingresen por la tienda online el campo cédula debe estar en blanco hasta su posterior ingreso por el vendedor
  const initialCi = isStore ? ((order as any)?.customerCi || (order as any)?.ci || '').trim() : getCustomerCi(order);
  const parsed = parseAddress(order.customerAddress || '', initialCi);

  const [ciInput, setCiInput] = useState<string>(initialCi);
  const ciValidation = useMemo(() => (ciInput.trim() ? validateEcuadorId(ciInput.trim()) : null), [ciInput]);
  const [nameInput, setNameInput] = useState<string>(order.customerName || '');
  const [provinceInput, setProvinceInput] = useState<string>(parsed.prov);
  const [cantonInput, setCantonInput] = useState<string>(parsed.can);
  const [parishInput, setParishInput] = useState<string>(parsed.par);
  const [exactAddressInput, setExactAddressInput] = useState<string>(parsed.dir);
  const [directAddressInput, setDirectAddressInput] = useState<string>(stripCiFromAddress(order.customerAddress || ''));
  const [addressMode, setAddressMode] = useState<'structured' | 'direct'>('structured');
  const [isSavingDest, setIsSavingDest] = useState<boolean>(false);

  // Build final compiled address
  const buildFinalAddress = () => {
    if (addressMode === 'direct') {
      return stripCiFromAddress(directAddressInput).trim() || 'Envío a Domicilio';
    }

    const lines: string[] = [];
    if (provinceInput.trim()) lines.push(`Provincia: ${provinceInput.trim()}`);
    if (cantonInput.trim()) lines.push(`Cantón: ${cantonInput.trim()}`);
    if (parishInput.trim()) lines.push(`Parroquia: ${parishInput.trim()}`);
    if (exactAddressInput.trim()) lines.push(`Dirección: ${exactAddressInput.trim()}`);

    return lines.length > 0 ? lines.join(' | ') : (stripCiFromAddress(directAddressInput).trim() || 'Envío a Domicilio');
  };

  // =========================================================================
  // 3.- SHIPPING COST & QUOTE STATE
  // =========================================================================
  const [shippingCarrier, setShippingCarrier] = useState<string>(
    order.trackingCarrier || activeCouriers[0]?.name || ''
  );
  const [shippingCostInput, setShippingCostInput] = useState<string>(initialShipCost);

  // Find courier matching current selection to get configured quoteUrl
  const matchedCourier = useMemo(() => {
    return activeCouriers.find(
      (c) =>
        c.name.toLowerCase() === (shippingCarrier || '').trim().toLowerCase() ||
        (shippingCarrier && c.name.toLowerCase().includes(shippingCarrier.trim().toLowerCase())) ||
        (shippingCarrier && shippingCarrier.trim().toLowerCase().includes(c.name.toLowerCase()))
    );
  }, [activeCouriers, shippingCarrier]);

  // Active couriers with configured quote URLs
  const activeCouriersWithQuote = useMemo(() => {
    return activeCouriers.filter((c) => !!c.quoteUrl?.trim());
  }, [activeCouriers]);

  // Open quote URL in a new window/tab safely
  const handleOpenQuoteUrl = (url?: string) => {
    if (!url || !url.trim()) return;
    const clean = url.trim();
    const target = clean.startsWith('http://') || clean.startsWith('https://') ? clean : `https://${clean}`;
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  // Impresión directa del ticket para etiquetar el paquete de envío
  const handleDirectPrintTicket = () => {
    const tempOrder: CustomerOrder = {
      ...order,
      customerName: nameInput.trim() || order.customerName,
      customerCi: ciInput.trim() || (order as any).customerCi,
      ci: ciInput.trim() || (order as any).ci,
      customerPhone: order.customerPhone,
      customerAddress: buildFinalAddress(),
      shippingAddress: buildFinalAddress(),
      trackingCarrier: shippingCarrier.trim() || order.trackingCarrier,
      totalAmount: calculatedQuoteTotal.toFixed(2),
    };
    directPrintShippingTicket({
      order: tempOrder,
      storeConfig,
      currency,
      showToast,
    });
  };
  const [quotePaymentMethodId, setQuotePaymentMethodId] = useState<string>(() => {
    const matched = activePayments.find(
      (p) =>
        p.id === order.paymentMethod ||
        p.name.toLowerCase() === (order.paymentMethod || '').toLowerCase() ||
        (order.paymentMethod && p.name.toLowerCase().includes(order.paymentMethod.toLowerCase())) ||
        (order.paymentMethod && order.paymentMethod.toLowerCase().includes(p.name.toLowerCase()))
    );
    return matched ? matched.id : activePayments[0]?.id || '';
  });
  const [quoteNotes, setQuoteNotes] = useState<string>('');
  const [isSavingQuote, setIsSavingQuote] = useState<boolean>(false);

  // Dynamic calculated total with new shipping cost
  const numericShipCost = Math.max(0, Number(shippingCostInput) || 0);
  const calculatedQuoteTotal = itemsSubtotal + numericShipCost;

  // Selected payment partner object
  const selectedQuotePartner = activePayments.find((p) => p.id === quotePaymentMethodId) || activePayments[0];
  const isCash = isCashPayment(order.paymentMethod) || (selectedQuotePartner && isCashPayment(selectedQuotePartner.name));

  // Short message with quote & payment details
  const buildShortQuotePaymentText = useMemo(() => {
    const carrierName = shippingCarrier.trim() || order.trackingCarrier || 'Servientrega';
    const totalToPay = calculatedQuoteTotal.toFixed(2);
    const partnerName = selectedQuotePartner ? selectedQuotePartner.name : order.paymentMethod;
    const destAddr = buildFinalAddress();

    let text = `¡Hola *${nameInput.trim() || order.customerName || 'estimado/a'}*! 👋 Aquí tienes la cotización de tu *Pedido #${order.orderNumber}* en *${storeConfig.storeName || 'nuestra tienda'}*:\n\n`;
    text += `💵 *Subtotal Productos:* $${itemsSubtotal.toFixed(2)} ${currency}\n`;
    text += `🚚 *Envío (${carrierName}):* $${numericShipCost.toFixed(2)} ${currency}\n`;
    text += `💰 *TOTAL A PAGAR:* $${totalToPay} ${currency}\n`;
    if (destAddr && destAddr !== 'Envío a Domicilio') {
      text += `📍 *Destino:* ${destAddr}\n`;
    }
    text += `\n💳 *Datos para Transferencia / Depósito (${partnerName}):*\n`;
    if (selectedQuotePartner?.details?.trim()) {
      text += `${selectedQuotePartner.details.trim()}\n`;
    }
    if (quoteNotes.trim()) {
      text += `📌 *Nota:* ${quoteNotes.trim()}\n`;
    }
    if (isCash) {
      text += `\n💵 *Modalidad:* Pago contraentrega al recibir tu paquete.`;
    } else {
      text += `\n📲 *Por favor envíanos la foto o comprobante del pago por aquí para confirmar y despachar tu paquete.* ¡Muchas gracias!`;
    }
    return text;
  }, [
    order,
    nameInput,
    provinceInput,
    cantonInput,
    parishInput,
    exactAddressInput,
    directAddressInput,
    addressMode,
    itemsSubtotal,
    numericShipCost,
    calculatedQuoteTotal,
    shippingCarrier,
    selectedQuotePartner,
    quoteNotes,
    isCash,
    storeConfig.storeName,
    currency,
  ]);

  // =========================================================================
  // 4.- CONFIRM VOUCHER STATE
  // =========================================================================
  const [voucherInput, setVoucherInput] = useState<string>(order.paymentVoucher || '');
  const [voucherNotesInput, setVoucherNotesInput] = useState<string>(order.notes || '');
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [isConfirmingOrder, setIsConfirmingOrder] = useState<boolean>(false);

  // Handler: Copy Template (Punto 1)
  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(buildCompleteShippingAskText);
    setCopiedTemplate(true);
    showToast('✓ Mensaje copiado al portapapeles');
    setTimeout(() => setCopiedTemplate(false), 2500);
  };

  // Handler: Send Ask Details via WhatsApp (Punto 1)
  const handleSendWhatsAppTemplate = () => {
    if (!phoneNorm.whatsappDigits || !phoneNorm.isValid) {
      showToast('⚠️ El cliente no tiene un teléfono válido registrado. Modifica el pedido para ingresar el número.');
      return;
    }
    const link = buildWhatsAppLink(phoneNorm.whatsappDigits, buildCompleteShippingAskText);
    window.open(link, '_blank');
  };

  // Handler: Save Destination Data (Punto 2)
  const handleSaveDestinationData = async () => {
    if (ciInput.trim()) {
      const val = validateEcuadorId(ciInput.trim());
      if (!val.isValid) {
        showToast(`❌ Cédula/RUC inválido: ${val.error}`);
        return;
      }
    }
    setIsSavingDest(true);
    try {
      const finalAddress = buildFinalAddress();
      const finalName = nameInput.trim() || order.customerName;
      const finalCi = ciInput.trim() ? validateEcuadorId(ciInput.trim()).cleaned : '';

      const payload: Partial<CustomerOrder> & { clientAddress?: string; shippingAddress?: string } = {
        customerName: finalName,
        customerAddress: finalAddress,
        shippingAddress: finalAddress,
        clientAddress: (order as any).clientAddress || undefined,
        customerCi: finalCi,
      };

      if (onUpdateOrder) {
        await onUpdateOrder(order.id, payload);
      } else {
        await onUpdateOrderStatus(
          order.id,
          order.status,
          order.paymentVoucher || undefined,
          order.notes || undefined,
          order.trackingNumber || undefined,
          shippingCarrier.trim() || order.trackingCarrier || undefined
        );
      }

      showToast('✓ Datos de destino y destinatario guardados');
    } catch (err: any) {
      showToast('❌ Error al guardar datos: ' + (err.message || 'Error'));
    } finally {
      setIsSavingDest(false);
    }
  };

  // Handler: Save Quote and optionally send via WhatsApp (Punto 3)
  const handleSaveShippingQuote = async (sendWhatsApp: boolean = false) => {
    setIsSavingQuote(true);
    try {
      const carrierName = shippingCarrier.trim() || order.trackingCarrier || 'Courier';
      const updatedTotal = calculatedQuoteTotal.toFixed(2);
      const finalAddress = buildFinalAddress();
      const finalName = nameInput.trim() || order.customerName;
      const finalCi = ciInput.trim();

      const payload: Partial<CustomerOrder> & { clientAddress?: string; shippingAddress?: string } = {
        totalAmount: updatedTotal,
        trackingCarrier: carrierName,
        paymentMethod: selectedQuotePartner ? selectedQuotePartner.name : order.paymentMethod,
        customerName: finalName,
        customerAddress: finalAddress,
        shippingAddress: finalAddress,
        clientAddress: (order as any).clientAddress || undefined,
        customerCi: finalCi,
        notes: quoteNotes.trim() ? (order.notes ? `${order.notes} | ${quoteNotes.trim()}` : quoteNotes.trim()) : order.notes,
      };

      if (onUpdateOrder) {
        await onUpdateOrder(order.id, payload);
      } else {
        await onUpdateOrderStatus(
          order.id,
          order.status,
          order.paymentVoucher || undefined,
          payload.notes || undefined,
          order.trackingNumber || undefined,
          carrierName
        );
      }

      showToast(`✓ Cotización ($${numericShipCost.toFixed(2)}) guardada. Total: $${updatedTotal}`);

      if (sendWhatsApp) {
        if (phoneNorm.whatsappDigits && phoneNorm.isValid) {
          const link = buildWhatsAppLink(phoneNorm.whatsappDigits, buildShortQuotePaymentText);
          window.open(link, '_blank');
        } else {
          showToast('⚠️ No se pudo abrir WhatsApp: Teléfono no válido');
        }
      }
    } catch (err: any) {
      showToast('❌ Error al guardar cotización: ' + (err.message || 'Error'));
    } finally {
      setIsSavingQuote(false);
    }
  };

  // Handler: Confirm Order with Voucher (Punto 4)
  const handleConfirmOrder = async (sendWhatsApp: boolean = false) => {
    if (!isCash && !voucherInput.trim()) {
      setVoucherError('Debes ingresar el número de comprobante de pago o transferencia antes de confirmar.');
      return;
    }

    setIsConfirmingOrder(true);
    setVoucherError(null);
    try {
      const voucherToSave = voucherInput.trim() || (isCash ? 'EFECTIVO - PAGO CONTRAENTREGA' : 'CONFIRMADO');
      const carrierToSave = shippingCarrier.trim() || order.trackingCarrier || undefined;
      const finalAddress = buildFinalAddress();
      const finalName = nameInput.trim() || order.customerName;
      const finalCi = ciInput.trim();

      if (onUpdateOrder) {
        await onUpdateOrder(order.id, {
          customerName: finalName,
          customerAddress: finalAddress,
          shippingAddress: finalAddress,
          clientAddress: (order as any).clientAddress || undefined,
          customerCi: finalCi,
          totalAmount: calculatedQuoteTotal.toFixed(2),
          trackingCarrier: carrierToSave,
          paymentMethod: selectedQuotePartner ? selectedQuotePartner.name : order.paymentMethod,
        });
      }

      const methodToUse = selectedQuotePartner ? selectedQuotePartner.name : (order.paymentMethod || 'Banco Pichincha');
      const bankToUse = isCash ? 'Caja Principal (Efectivo)' : deriveBankOrAccountFromMethod(methodToUse, voucherNotesInput);

      const ok = await onUpdateOrderStatus(
        order.id,
        'confirmed',
        voucherToSave,
        voucherNotesInput.trim() || (isCash ? 'Pago en efectivo verificado/acordado' : undefined),
        order.trackingNumber || undefined,
        carrierToSave,
        undefined,
        undefined,
        methodToUse,
        bankToUse,
        finalCi || undefined
      );

      if (ok) {
        showToast(`✓ Pedido #${order.orderNumber} CONFIRMADO exitosamente`);

        if (sendWhatsApp && phoneNorm.whatsappDigits && phoneNorm.isValid) {
          let msg = `✅ ¡Hola *${finalName}*! Tu pago ha sido verificado con éxito.\n\n`;
          msg += `🧾 *Pedido #${order.orderNumber} CONFIRMADO*\n`;
          msg += `💰 *Total Pagado:* $${calculatedQuoteTotal.toFixed(2)} ${currency}\n`;
          if (finalCi) {
            msg += `🪪 *Cédula/RUC:* ${finalCi}\n`;
          }
          if (carrierToSave) {
            msg += `🚚 *Envío:* ${carrierToSave}\n`;
          }
          if (voucherToSave && !isCash) {
            msg += `📝 *Comprobante:* #${voucherToSave}\n`;
          }
          msg += `\nEstamos preparando tu paquete para su despacho. ¡Muchas gracias por tu compra! 📦✨`;

          const link = buildWhatsAppLink(phoneNorm.whatsappDigits, msg);
          window.open(link, '_blank');
        }

        if (onClose) onClose();
      } else {
        setVoucherError('No se pudo confirmar el pedido. Revisa los datos e intenta nuevamente.');
      }
    } catch (err: any) {
      setVoucherError(err.message || 'Error al confirmar el pedido');
    } finally {
      setIsConfirmingOrder(false);
    }
  };

  const handleOpenDirectWhatsApp = () => {
    if (phoneNorm.whatsappDigits && phoneNorm.isValid) {
      const link = buildWhatsAppLink(phoneNorm.whatsappDigits);
      window.open(link, '_blank');
    } else {
      showToast('⚠️ No hay un número de WhatsApp válido registrado para este cliente');
    }
  };

  // Check if destination fields are filled
  const hasDestinationData = Boolean(
    (nameInput.trim() || order.customerName) &&
    (provinceInput.trim() || cantonInput.trim() || exactAddressInput.trim() || directAddressInput.trim())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-sky-200 rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-5 my-auto animate-scaleUp max-h-[94vh] flex flex-col">
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 flex-shrink-0">
          <div className="flex items-center space-x-3 text-purple-700">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-50 via-indigo-50 to-sky-100 border border-purple-200 flex items-center justify-center shadow-xs">
              <Truck className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-slate-900">
                  Confirmar Pedido con Envío
                </h2>
                <span className="font-mono font-black text-sky-700 text-xs px-2.5 py-0.5 bg-sky-50 rounded-lg border border-sky-200 shadow-2xs">
                  #{order.orderNumber}
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 uppercase tracking-wide">
                  🕒 Pendiente
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Datos de dirección del cliente, cotización de envío y confirmación de pago
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ORDER RECAP SUMMARY PILL */}
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 flex-shrink-0">
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] text-slate-400 font-bold uppercase">Cliente</span>
              <p className="font-bold text-slate-800 truncate">{nameInput || order.customerName}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <p className="font-mono text-[11px] text-slate-500 truncate">{order.customerPhone || 'Sin teléfono'}</p>
                <button
                  type="button"
                  onClick={handleOpenDirectWhatsApp}
                  className={`p-1 px-2 rounded-lg border text-[10px] font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs ${
                    phoneNorm.isValid
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 active:scale-95'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                  }`}
                  title="Abrir chat de WhatsApp directamente con el cliente (sin mensaje)"
                >
                  <MessageCircle className="w-3 h-3 fill-current" />
                  <span>{phoneNorm.isValid ? 'WhatsApp' : 'Añadir Tel.'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 flex-shrink-0">
              <MapPin className="w-3.5 h-3.5 text-rose-500" />
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] text-slate-400 font-bold uppercase">Modalidad</span>
              <p className="font-bold text-slate-800 truncate">
                {isPickup ? 'Retiro en Local' : 'Envío a Domicilio'}
              </p>
              <p className="text-[11px] text-slate-500 truncate" title={buildFinalAddress()}>
                {buildFinalAddress() || 'Por coordinar'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:justify-end">
            <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 flex-shrink-0">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-left sm:text-right">
              <span className="block text-[10px] text-slate-400 font-bold uppercase">Total Actual</span>
              <p className="font-mono font-black text-emerald-700 text-sm">
                ${Number(order.totalAmount).toFixed(2)} {currency}
              </p>
              <span className="text-[10px] text-slate-400 font-semibold">{items.length} productos</span>
            </div>
          </div>
        </div>

        {/* SCROLLABLE BODY WITH THE 4 NUMBERED SECTIONS IN EXACT ORDER */}
        <div className="space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
          
          {/* ========================================================================= */}
          {/* 1.- SOLICITAR DATOS DE ENVÍO COMPLETOS POR WHATSAPP (MENSAJE CORTO) */}
          {/* ========================================================================= */}
          <div className="p-4 rounded-2xl bg-white border-2 border-emerald-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                  1
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <MessageCircle className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                    <span>Pedir Datos de Envío Completos por WhatsApp</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Envía un mensaje pidiendo provincia, cantón, parroquia, dirección y cédula para cotizar
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex-shrink-0">
                Mensaje de Envío
              </span>
            </div>

            {/* Template Preview Box */}
            <div className="relative">
              <div className="p-3 rounded-xl bg-slate-900 text-emerald-400 font-mono text-[11px] leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap select-all border border-slate-800 shadow-inner">
                {buildCompleteShippingAskText}
              </div>
            </div>

            {/* Action Buttons for Section 1 */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSendWhatsAppTemplate}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs active:scale-95"
              >
                <MessageCircle className="w-3.5 h-3.5 fill-current" />
                <span>Abrir WhatsApp y Pedir Datos de Envío</span>
              </button>

              <button
                type="button"
                onClick={handleCopyTemplate}
                className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 transition flex items-center space-x-1.5 cursor-pointer"
              >
                {copiedTemplate ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span>{copiedTemplate ? '¡Copiado!' : 'Copiar Mensaje'}</span>
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 2.- INGRESAR DATOS DE DESTINO Y DESTINATARIO (PARA COTIZAR Y ROTULAR) */}
          {/* ========================================================================= */}
          <div className="p-4 rounded-2xl bg-white border-2 border-amber-200 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <span className="w-6 h-6 rounded-full bg-amber-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                  2
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-amber-600" />
                    <span>Ingresar Datos de Destino y Destinatario</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Ingresa los datos proporcionados por el cliente para calcular flete y rotular el paquete
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-100 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setAddressMode('structured')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                    addressMode === 'structured' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Estructurado
                </button>
                <button
                  type="button"
                  onClick={() => setAddressMode('direct')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                    addressMode === 'direct' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Texto Libre
                </button>
              </div>
            </div>

            {/* Recipient & Identification */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-slate-700 font-bold mb-1 text-[11px]">
                  👤 Nombres del Destinatario:
                </label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Ej. Juan Carlos Pérez"
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs font-semibold focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1 text-[11px] flex items-center justify-between">
                  <span>🪪 N° Cédula / RUC (para la guía):</span>
                  <span className="text-[10px] text-slate-400 font-medium">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={ciInput}
                  onChange={(e) => {
                    setCiInput(e.target.value);
                    if (voucherError) setVoucherError(null);
                  }}
                  placeholder="Ej. 0912345678"
                  className="w-full px-3 py-1.5 rounded-xl text-xs font-mono font-semibold focus:outline-none bg-slate-50 border border-slate-200 text-slate-900 focus:border-amber-500 focus:bg-white"
                />
              </div>
            </div>

            {/* Destination Address Fields */}
            {addressMode === 'structured' ? (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-0.5 text-[10px]">
                      🏛️ Provincia:
                    </label>
                    <input
                      type="text"
                      value={provinceInput}
                      onChange={(e) => setProvinceInput(e.target.value)}
                      placeholder="Ej. Guayas, Pichincha, Azuay..."
                      className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-amber-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-0.5 text-[10px]">
                      🏙️ Cantón / Ciudad:
                    </label>
                    <input
                      type="text"
                      value={cantonInput}
                      onChange={(e) => setCantonInput(e.target.value)}
                      placeholder="Ej. Guayaquil, Quito, Cuenca..."
                      className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-amber-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-0.5 text-[10px]">
                      📍 Parroquia:
                    </label>
                    <input
                      type="text"
                      value={parishInput}
                      onChange={(e) => setParishInput(e.target.value)}
                      placeholder="Ej. Tarqui, Calderón..."
                      className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-amber-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-0.5 text-[10px]">
                    🏠 Dirección exacta, Calles y Referencia / Agencia de Envío:
                  </label>
                  <input
                    type="text"
                    value={exactAddressInput}
                    onChange={(e) => setExactAddressInput(e.target.value)}
                    placeholder="Ej. Av. 9 de Octubre 1205 y Lorenzo de Garaycoa | Edif. Torre Azul 2do Piso"
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-slate-600 font-semibold mb-0.5 text-[10px]">
                  📍 Dirección Completa de Entrega (Texto Libre):
                </label>
                <textarea
                  rows={2}
                  value={directAddressInput}
                  onChange={(e) => setDirectAddressInput(e.target.value)}
                  placeholder="Provincia, Cantón, Parroquia, Calles y Referencia..."
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>
            )}

            {/* Action Buttons for Section 2 (Destination & Printing Ticket) */}
            <div className="pt-2 flex items-center justify-between gap-2 flex-wrap border-t border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={isSavingDest}
                  onClick={handleSaveDestinationData}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs disabled:opacity-50 active:scale-95"
                  title="Guardar datos del destinatario y dirección en el pedido"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isSavingDest ? 'Guardando...' : 'Guardar Datos de Destino'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDirectPrintTicket}
                  className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs active:scale-95"
                  title="Impresión directa del ticket para etiquetar el paquete de envío"
                >
                  <Printer className="w-3.5 h-3.5 text-sky-100" />
                  <span>Imprimir Ticket de Envío</span>
                </button>
              </div>

              <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                {hasDestinationData ? '✓ Destino listo para cotizar e imprimir rótulo' : 'Ingresa la ubicación para cotizar'}
              </span>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 3.- INGRESAR PRECIOS DE ENVÍO Y ENVIAR COTIZACIÓN / DATOS DE PAGO */}
          {/* ========================================================================= */}
          <div className="p-4 rounded-2xl bg-white border-2 border-sky-200 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <span className="w-6 h-6 rounded-full bg-sky-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                  3
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-sky-600" />
                    <span>Ingresar Precios de Envío y Enviar Datos de Pago</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Calcula el total con el envío y envía los datos de tu cuenta bancaria al cliente
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-sky-800 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200 flex-shrink-0">
                Cotización & Pago
              </span>
            </div>

            {/* Courier Combobox & Quick Badges */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-slate-800 font-bold text-xs">
                  Empresa de Transporte / Courier (Configurados en Tienda):
                </label>
                <span className="text-[10px] text-slate-400">
                  {activeCouriers.length} couriers activos
                </span>
              </div>

              {/* Combobox Select Dropdown (Only Store Config Couriers) */}
              <select
                value={shippingCarrier}
                onChange={(e) => setShippingCarrier(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs font-semibold focus:outline-none focus:border-sky-500 focus:bg-white transition cursor-pointer"
              >
                {activeCouriers.length === 0 ? (
                  <option value="" disabled>Sin couriers en ajustes de tienda</option>
                ) : (
                  activeCouriers.map((c) => (
                    <option key={c.id || c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))
                )}
                {shippingCarrier && !activeCouriers.some((c) => c.name.toLowerCase() === shippingCarrier.trim().toLowerCase()) && (
                  <option value={shippingCarrier}>
                    {shippingCarrier} (Registrado)
                  </option>
                )}
              </select>

              {/* Quick Badges only from store couriers */}
              {activeCouriers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {activeCouriers.map((c) => (
                    <button
                      key={c.id || c.name}
                      type="button"
                      onClick={() => setShippingCarrier(c.name)}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                        shippingCarrier.toLowerCase() === c.name.toLowerCase()
                          ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {c.logoUrl ? (
                        <img src={c.logoUrl} alt={c.name} className="w-3.5 h-3.5 object-contain rounded bg-white p-0.2" />
                      ) : (
                        <Truck className="w-3 h-3 text-sky-600" />
                      )}
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* OPINIÓN/OPCIÓN PARA ABRIR EL LINK DE COTIZACIÓN EN VENTANA NUEVA */}
              {matchedCourier?.quoteUrl?.trim() ? (
                <div className="mt-2 p-2.5 rounded-xl bg-sky-50/90 border border-sky-200 flex items-center justify-between gap-2.5">
                  <div className="flex items-center space-x-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
                      <ExternalLink className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-sky-950 truncate flex items-center gap-1.5">
                        <span>Cotizador Web de {matchedCourier.name}</span>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-md">
                          Listo para cotizar
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 truncate">
                        {matchedCourier.quoteUrl}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    id="btn-open-courier-quote-window"
                    onClick={() => handleOpenQuoteUrl(matchedCourier.quoteUrl)}
                    className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 active:scale-95 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-xs cursor-pointer flex-shrink-0"
                    title={`Abrir ${matchedCourier.name} en una ventana nueva para calcular el flete`}
                  >
                    <span>Abrir Cotizador</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : activeCouriersWithQuote.length > 0 ? (
                <div className="mt-2 p-2 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1.5">
                    <span className="font-bold flex items-center gap-1">
                      <ExternalLink className="w-3 h-3 text-sky-600" />
                      Abrir cotizador web en ventana nueva:
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeCouriersWithQuote.map((c) => (
                      <button
                        key={c.id || c.name}
                        type="button"
                        onClick={() => {
                          setShippingCarrier(c.name);
                          handleOpenQuoteUrl(c.quoteUrl);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-sky-50 text-slate-700 hover:text-sky-800 border border-slate-200 hover:border-sky-300 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                        title={`Seleccionar y abrir cotizador de ${c.name} en una ventana nueva`}
                      >
                        {c.logoUrl ? (
                          <img src={c.logoUrl} alt={c.name} className="w-3 h-3 object-contain rounded" />
                        ) : (
                          <Truck className="w-3 h-3 text-sky-600" />
                        )}
                        <span>{c.name}</span>
                        <ExternalLink className="w-3 h-3 text-sky-500 opacity-80" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Shipping Cost Inputs & Presets */}
            <div className="space-y-1.5">
              <label className="block text-slate-800 font-bold text-xs">
                Valor del Envío / Flete ($):
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={shippingCostInput}
                    onChange={(e) => setShippingCostInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 rounded-xl bg-slate-50 border border-sky-300 text-emerald-700 font-mono font-bold focus:outline-none focus:border-sky-500 focus:bg-white text-sm"
                  />
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {['0.00', '3.50', '5.00', '7.00'].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setShippingCostInput(val)}
                      className={`px-2.5 py-2 rounded-xl text-[11px] font-mono font-bold border transition cursor-pointer ${
                        Number(shippingCostInput) === Number(val)
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-sky-300'
                      }`}
                    >
                      {val === '0.00' ? 'Gratis ($0)' : `$${val}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Calculation Box */}
            <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200 flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <div className="text-slate-600">Subtotal Productos: <span className="font-mono font-bold text-slate-900">${itemsSubtotal.toFixed(2)}</span></div>
                <div className="text-slate-600">(+) Valor Envío: <span className="font-mono font-bold text-sky-700">${numericShipCost.toFixed(2)}</span></div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Nuevo Total a Cobrar</span>
                <span className="font-mono font-black text-emerald-700 text-base">
                  ${calculatedQuoteTotal.toFixed(2)} {currency}
                </span>
              </div>
            </div>

            {/* Payment Method Details to append in WhatsApp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">
                  Cuenta / Método de Pago para Transferencia:
                </label>
                <select
                  value={quotePaymentMethodId}
                  onChange={(e) => setQuotePaymentMethodId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs font-semibold focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  {activePayments.map((p) => (
                    <option key={p.id} value={p.id}>
                      💳 {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">
                  Nota adicional de entrega (Opcional):
                </label>
                <input
                  type="text"
                  value={quoteNotes}
                  onChange={(e) => setQuoteNotes(e.target.value)}
                  placeholder="Ej. Tiempo estimado 24 a 48 horas"
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Action Buttons for Section 3 */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isSavingQuote}
                onClick={() => handleSaveShippingQuote(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs active:scale-95"
              >
                <MessageCircle className="w-3.5 h-3.5 fill-current" />
                <span>{isSavingQuote ? 'Guardando...' : 'Cotizar y Enviar por WhatsApp'}</span>
              </button>

              <button
                type="button"
                disabled={isSavingQuote}
                onClick={() => handleSaveShippingQuote(false)}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 transition flex items-center space-x-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 text-slate-500" />
                <span>Solo Guardar Cotización</span>
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 4.- INGRESAR COMPROBANTE DE PAGO Y CONFIRMAR PEDIDO */}
          {/* ========================================================================= */}
          <div className="p-4 rounded-2xl bg-white border-2 border-purple-200 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <span className="w-6 h-6 rounded-full bg-purple-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                  4
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-purple-600" />
                    <span>Ingresar Comprobante y Confirmar Pedido</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Ingresa el comprobante de transferencia para pasar el pedido a estado Confirmado
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-purple-800 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200 flex-shrink-0">
                Pasa a Confirmado
              </span>
            </div>

            {/* Notice */}
            {isCash ? (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>
                  <strong>Pago en Efectivo / Contraentrega:</strong> El comprobante es opcional. Puedes confirmar directamente.
                </span>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs flex items-center space-x-2">
                <Receipt className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <span>
                  <strong>Pago por Transferencia / Depósito:</strong> Ingresa el número de comprobante para verificar y confirmar el pedido.
                </span>
              </div>
            )}

            {/* Cédula/RUC Informativo si ya está registrada */}
            {ciInput.trim() && (
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                <span className="text-slate-600 font-medium flex items-center gap-1.5">
                  <span>🪪</span>
                  <span>Cédula / RUC del cliente:</span>
                </span>
                <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {ciInput.trim()}
                </span>
              </div>
            )}

            {/* Voucher Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-slate-800 font-bold text-xs mb-1">
                  N° Comprobante / Transacción {!isCash && <span className="text-rose-500">*</span>}:
                </label>
                <div className="relative">
                  <Receipt className="w-3.5 h-3.5 text-purple-600 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={voucherInput}
                    onChange={(e) => {
                      setVoucherInput(e.target.value);
                      if (voucherError) setVoucherError(null);
                    }}
                    placeholder={isCash ? 'Opcional (Ej. Efectivo cobrado)' : 'Ej. TRANSF-0918239 / DEP-0021'}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-purple-300 text-purple-900 font-mono font-bold text-xs focus:outline-none focus:border-purple-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold text-xs mb-1">
                  Notas de Confirmación (Opcional):
                </label>
                <input
                  type="text"
                  value={voucherNotesInput}
                  onChange={(e) => setVoucherNotesInput(e.target.value)}
                  placeholder="Ej. Transferencia Banco Pichincha verificada"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-purple-500 focus:bg-white"
                />
              </div>
            </div>

            {voucherError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                <span>{voucherError}</span>
              </div>
            )}

            {/* Action Buttons for Section 4 */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isConfirmingOrder || (!isCash && !voucherInput.trim())}
                onClick={() => handleConfirmOrder(false)}
                className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs active:scale-95"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isConfirmingOrder ? 'Confirmando...' : 'Confirmar Pedido'}</span>
              </button>

              <button
                type="button"
                disabled={isConfirmingOrder || (!isCash && !voucherInput.trim())}
                onClick={() => handleConfirmOrder(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs active:scale-95"
              >
                <MessageCircle className="w-3.5 h-3.5 fill-current" />
                <span>Confirmar y Notificar por WhatsApp</span>
              </button>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER WITH MODIFICAR PEDIDO, ELIMINAR PEDIDO & CERRAR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-slate-100 flex-shrink-0">
          <div className="flex items-center space-x-2">
            {/* MODIFICAR PEDIDO BUTTON */}
            <button
              type="button"
              onClick={() => {
                if (onClose) onClose();
                onOpenEditOrder(order);
              }}
              className="px-3.5 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-2xs"
              title="Modificar productos, cantidades y datos del cliente"
            >
              <Edit3 className="w-3.5 h-3.5 text-sky-600" />
              <span>Modificar Pedido</span>
            </button>

            {/* ELIMINAR PEDIDO BUTTON */}
            <button
              type="button"
              onClick={() => {
                if (onClose) onClose();
                onOpenDeleteOrder(order);
              }}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer shadow-2xs"
              title="Eliminar este pedido permanentemente"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>Eliminar Pedido</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleDirectPrintTicket}
              className="px-3.5 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs active:scale-95"
              title="Impresión directa del ticket para etiquetar el paquete de envío"
            >
              <Printer className="w-3.5 h-3.5 text-sky-200" />
              <span>Imprimir Ticket de Envío</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 transition cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

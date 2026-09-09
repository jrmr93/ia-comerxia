import React, { useState } from 'react';
import {
  X,
  Building2,
  Phone,
  Mail,
  MapPin,
  Globe,
  Star,
  CreditCard,
  Clock,
  DollarSign,
  Package,
  Boxes,
  Landmark,
  Copy,
  ExternalLink,
  MessageCircle,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  Layers,
  ChevronRight,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Supplier, PurchaseOrder, InventoryItem } from '../types.ts';
import { normalizeEcuadorPhone, buildWhatsAppLink } from '../utils/phone.ts';
import { formatExactCurrency } from '../utils/metricFormatters.ts';

interface SupplierDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier | null;
  onEdit: (supplier: Supplier) => void;
  onDelete: (supplier: Supplier) => void;
  onNewPurchaseForSupplier?: (supplierName: string, supplierPhone?: string) => void;
  onOpenItemDetail?: (item: InventoryItem) => void;
  currency?: string;
  showToast: (msg: string) => void;
}

export const SupplierDetailModal: React.FC<SupplierDetailModalProps> = ({
  isOpen,
  onClose,
  supplier,
  onEdit,
  onDelete,
  onNewPurchaseForSupplier,
  onOpenItemDetail,
  currency = '$',
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'purchases' | 'products' | 'bank'>('profile');
  const [copiedBank, setCopiedBank] = useState(false);

  if (!isOpen || !supplier) return null;

  const phoneInfo = normalizeEcuadorPhone(supplier.phone || '');
  const contactPhoneInfo = supplier.contactPersonPhone
    ? normalizeEcuadorPhone(supplier.contactPersonPhone)
    : null;

  const handleWhatsApp = (targetPhone: string, _name: string) => {
    const norm = normalizeEcuadorPhone(targetPhone);
    if (!norm.whatsappDigits || !norm.isValid) {
      showToast('⚠️ Número de teléfono no válido para WhatsApp');
      return;
    }
    // Directly open chat without automatic pre-filled text
    const link = buildWhatsAppLink(norm.whatsappDigits);
    window.open(link, '_blank');
  };

  const handleCopyBankInfo = () => {
    const b = supplier.bankInfo;
    if (!b || !b.accountNumber) {
      showToast('⚠️ Este proveedor no tiene cuenta bancaria registrada');
      return;
    }

    const lines = [
      `🏛️ BANCO: ${b.bankName}`,
      `💳 TIPO: ${b.accountType === 'corriente' ? 'Cuenta Corriente' : 'Cuenta de Ahorros'}`,
      `🔢 NÚMERO: ${b.accountNumber}`,
      `👤 BENEFICIARIO: ${b.accountHolder || supplier.name}`,
      b.holderId ? `🪪 RUC / CI: ${b.holderId}` : null,
      b.holderEmail ? `📧 CORREO: ${b.holderEmail}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(lines);
    setCopiedBank(true);
    showToast('✓ Datos bancarios copiados al portapapeles');
    setTimeout(() => setCopiedBank(false), 2500);
  };

  const handleCopySupplierDossier = () => {
    const lines = [
      `🏢 PROVEEDOR: ${supplier.name}`,
      supplier.tradeName ? `🏷️ NOMBRE COMERCIAL: ${supplier.tradeName}` : null,
      supplier.ruc ? `🪪 RUC: ${supplier.ruc}` : null,
      `📂 CATEGORÍA: ${supplier.category || 'General'}`,
      `📱 TELÉFONO: ${supplier.phone}`,
      supplier.email ? `📧 EMAIL: ${supplier.email}` : null,
      supplier.contactPerson ? `👤 ASESOR: ${supplier.contactPerson} (${supplier.contactPersonPhone || 'Sin tel.'})` : null,
      supplier.address ? `📍 DIRECCIÓN: ${supplier.address}` : null,
      supplier.city ? `🏙️ CIUDAD: ${supplier.city}, ${supplier.country || 'Ecuador'}` : null,
      `💳 CONDICIÓN PAGO: ${supplier.paymentTerms || 'Contado'}`,
      supplier.creditLimit ? `💰 LÍMITE CRÉDITO: $${Number(supplier.creditLimit).toFixed(2)}` : null,
      supplier.leadTimeDays ? `⏱️ TIEMPO ENTREGA: ${supplier.leadTimeDays} días` : null,
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(lines);
    showToast('✓ Ficha completa del proveedor copiada');
  };

  const totalSpent = Number(supplier.totalSpent) || 0;
  const pendingBalance = Number(supplier.pendingBalance) || 0;
  const creditLimit = Number(supplier.creditLimit) || 0;
  const creditAvailable = Math.max(0, creditLimit - pendingBalance);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 text-white relative">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition cursor-pointer absolute right-4 top-4"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pr-8">
            <div className="flex items-start sm:items-center space-x-3.5">
              <div className="w-13 h-13 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
                <Building2 className="w-7 h-7" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
                    {supplier.name}
                  </h2>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      supplier.status === 'active'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {supplier.status === 'active' ? 'Activo' : 'Inactivo'}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {supplier.category || 'General'}
                  </span>
                </div>

                {supplier.tradeName && (
                  <p className="text-xs text-amber-200/90 font-semibold mt-0.5">
                    Alias Comercial: {supplier.tradeName}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 mt-1.5 font-medium">
                  {supplier.ruc && (
                    <span className="flex items-center gap-1 font-mono text-amber-300">
                      <FileText className="w-3.5 h-3.5" />
                      RUC: {supplier.ruc}
                    </span>
                  )}
                  {supplier.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {supplier.city}, {supplier.country || 'Ecuador'}
                    </span>
                  )}
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-3.5 h-3.5 ${
                          star <= (supplier.rating || 5)
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-600'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions in Header */}
            <div className="flex items-center gap-2 shrink-0">
              {onNewPurchaseForSupplier && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNewPurchaseForSupplier(supplier.name, supplier.phone);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
                >
                  <Boxes className="w-3.5 h-3.5" />
                  <span>Nueva Compra</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onEdit(supplier)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                title="Editar Proveedor"
              >
                <Edit2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onDelete(supplier)}
                className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition cursor-pointer"
                title="Eliminar Proveedor"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mini KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 bg-slate-50 border-b border-slate-200 divide-x divide-slate-200">
          <div className="p-3.5 text-center">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Compras Totales
            </span>
            <span className="text-base font-black text-slate-900 font-mono">
              {formatExactCurrency(totalSpent, currency)}
            </span>
            <span className="text-[10px] text-slate-400 font-medium block">
              {supplier.totalPurchases || 0} órdenes emitidas
            </span>
          </div>

          <div className="p-3.5 text-center">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Deuda Pendiente (CxP)
            </span>
            <span className={`text-base font-black font-mono ${
              pendingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}>
              {formatExactCurrency(pendingBalance, currency)}
            </span>
            <span className="text-[10px] text-slate-400 font-medium block">
              {supplier.pendingPurchasesCount || 0} órdenes por liquidar
            </span>
          </div>

          <div className="p-3.5 text-center">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Límite de Crédito
            </span>
            <span className="text-base font-black text-slate-900 font-mono">
              {creditLimit > 0 ? formatExactCurrency(creditLimit, currency) : 'Sin cupo'}
            </span>
            <span className="text-[10px] text-slate-400 font-medium block">
              {creditLimit > 0 ? `Disp: ${formatExactCurrency(creditAvailable, currency)}` : 'Pago contado'}
            </span>
          </div>

          <div className="p-3.5 text-center">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Tiempo de Entrega
            </span>
            <span className="text-base font-black text-slate-900 font-mono">
              {supplier.leadTimeDays ?? 2} días
            </span>
            <span className="text-[10px] text-slate-400 font-medium block">
              Lead time promedio
            </span>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center border-b border-slate-200 px-6 bg-white gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'profile'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Ficha General & Contactos</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bank')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'bank'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>Datos Bancarios (CxP)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('purchases')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'purchases'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Historial de Compras ({supplier.purchaseOrders?.length || supplier.totalPurchases || 0})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'products'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Productos Suministrados ({supplier.suppliedProducts?.length || supplier.productsCount || 0})</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: PROFILE & CONTACTS */}
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Contact Card */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3.5">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Phone className="w-4 h-4 text-amber-600" />
                    Canales de Contacto Directo
                  </h3>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200">
                      <div className="flex items-center gap-2.5">
                        <Phone className="w-4 h-4 text-slate-400" />
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block">Teléfono Principal</span>
                          <span className="text-xs font-bold text-slate-800 font-mono">{supplier.phone}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {phoneInfo.whatsappDigits && (
                          <button
                            type="button"
                            onClick={() => handleWhatsApp(supplier.phone, supplier.name)}
                            className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                            title="Abrir WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </button>
                        )}
                        <a
                          href={`tel:${supplier.phone}`}
                          className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-bold transition"
                        >
                          Llamar
                        </a>
                      </div>
                    </div>

                    {supplier.email && (
                      <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200">
                        <div className="flex items-center gap-2.5">
                          <Mail className="w-4 h-4 text-slate-400" />
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 block">Correo Electrónico</span>
                            <span className="text-xs font-semibold text-slate-800">{supplier.email}</span>
                          </div>
                        </div>
                        <a
                          href={`mailto:${supplier.email}`}
                          className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-bold transition"
                        >
                          Enviar Correo
                        </a>
                      </div>
                    )}

                    {supplier.website && (
                      <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200">
                        <div className="flex items-center gap-2.5">
                          <Globe className="w-4 h-4 text-slate-400" />
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 block">Sitio Web / Catálogo</span>
                            <span className="text-xs font-semibold text-slate-800 truncate max-w-[200px] block">
                              {supplier.website}
                            </span>
                          </div>
                        </div>
                        <a
                          href={supplier.website.startsWith('http') ? supplier.website : `https://${supplier.website}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-lg text-xs font-bold flex items-center gap-1 transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Visitar</span>
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Commercial Terms Card */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3.5">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-amber-600" />
                    Condiciones Comerciales ERP
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-slate-200">
                      <span className="text-slate-500 font-medium">Condición de Pago:</span>
                      <span className="font-bold text-slate-900 uppercase">
                        {supplier.paymentTerms?.replace('_', ' ') || 'Contado'}
                      </span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-200">
                      <span className="text-slate-500 font-medium">Límite de Crédito Otorgado:</span>
                      <span className="font-bold text-slate-900 font-mono">
                        {formatExactCurrency(creditLimit, currency)}
                      </span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-200">
                      <span className="text-slate-500 font-medium">Lead Time Promedio:</span>
                      <span className="font-bold text-slate-900">
                        {supplier.leadTimeDays ?? 2} días hábiles
                      </span>
                    </div>

                    <div className="flex justify-between py-1.5">
                      <span className="text-slate-500 font-medium">Ubicación / Bodega:</span>
                      <span className="font-bold text-slate-900 text-right max-w-[200px] truncate">
                        {supplier.address || 'No especificada'}
                      </span>
                    </div>
                  </div>

                  {supplier.contactPerson && (
                    <div className="p-2.5 bg-amber-50/80 rounded-xl border border-amber-200 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-amber-800 uppercase block">Asesor Asignado</span>
                        <span className="text-xs font-bold text-amber-950">{supplier.contactPerson}</span>
                        {supplier.contactPersonRole && (
                          <span className="text-[11px] text-amber-700 block">{supplier.contactPersonRole}</span>
                        )}
                      </div>
                      {supplier.contactPersonPhone && (
                        <button
                          type="button"
                          onClick={() => handleWhatsApp(supplier.contactPersonPhone!, supplier.contactPerson!)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {supplier.notes && (
                <div className="p-4 rounded-2xl border border-slate-200 bg-amber-50/30">
                  <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-amber-600" />
                    Notas Comerciales y Políticas
                  </h4>
                  <p className="text-xs text-slate-700 font-medium whitespace-pre-line leading-relaxed">
                    {supplier.notes}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCopySupplierDossier}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Ficha Completa</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: BANK INFO (CxP) */}
          {activeTab === 'bank' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {supplier.bankInfo && supplier.bankInfo.accountNumber ? (
                <div className="max-w-xl mx-auto p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white border border-slate-700 shadow-xl space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-700/80 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-400/30">
                        <Landmark className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-white">{supplier.bankInfo.bankName}</h4>
                        <span className="text-xs text-amber-300 font-semibold uppercase tracking-wider">
                          {supplier.bankInfo.accountType === 'corriente' ? 'Cuenta Corriente' : 'Cuenta de Ahorros'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyBankInfo}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 text-xs font-black transition cursor-pointer shadow-sm"
                    >
                      {copiedBank ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedBank ? '¡Copiado!' : 'Copiar Datos'}</span>
                    </button>
                  </div>

                  <div className="space-y-3 font-mono text-xs">
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-700/50">
                      <span className="text-[10px] text-slate-400 font-sans uppercase font-bold block mb-0.5">
                        Número de Cuenta
                      </span>
                      <span className="text-lg font-black text-amber-400 tracking-wider">
                        {supplier.bankInfo.accountNumber}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-2.5 bg-slate-950/40 rounded-xl border border-slate-700/40">
                        <span className="text-[10px] text-slate-400 font-sans uppercase font-bold block mb-0.5">
                          Titular / Beneficiario
                        </span>
                        <span className="text-xs font-bold text-slate-100 font-sans block truncate">
                          {supplier.bankInfo.accountHolder || supplier.name}
                        </span>
                      </div>

                      <div className="p-2.5 bg-slate-950/40 rounded-xl border border-slate-700/40">
                        <span className="text-[10px] text-slate-400 font-sans uppercase font-bold block mb-0.5">
                          RUC / Cédula
                        </span>
                        <span className="text-xs font-bold text-slate-100 font-mono block">
                          {supplier.bankInfo.holderId || supplier.ruc || 'Sin registrar'}
                        </span>
                      </div>
                    </div>

                    {supplier.bankInfo.holderEmail && (
                      <div className="p-2.5 bg-slate-950/40 rounded-xl border border-slate-700/40">
                        <span className="text-[10px] text-slate-400 font-sans uppercase font-bold block mb-0.5">
                          Correo para Notificación de Transferencia
                        </span>
                        <span className="text-xs font-semibold text-slate-200 font-sans">
                          {supplier.bankInfo.holderEmail}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 px-4 rounded-2xl border-2 border-dashed border-slate-200">
                  <Landmark className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <h4 className="text-sm font-bold text-slate-700">Sin Datos Bancarios Registrados</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                    Agrega la cuenta bancaria del proveedor para facilitar la emisión de pagos de compras y liquidación de deudas.
                  </p>
                  <button
                    type="button"
                    onClick={() => onEdit(supplier)}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Agregar Cuenta Bancaria
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PURCHASES HISTORY */}
          {activeTab === 'purchases' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {supplier.purchaseOrders && supplier.purchaseOrders.length > 0 ? (
                <div className="space-y-3">
                  {supplier.purchaseOrders.map((po) => (
                    <div
                      key={po.id}
                      className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-900">
                            #{po.purchaseNumber}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                            po.status === 'received'
                              ? 'bg-emerald-100 text-emerald-800'
                              : po.status === 'ordered'
                              ? 'bg-amber-100 text-amber-800'
                              : po.status === 'in_transit'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {po.status}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            po.paymentStatus === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {po.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente Pago'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 font-medium">
                          {new Date(po.purchaseDate || po.createdAt).toLocaleDateString('es-EC', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                          {' · '}
                          {po.items?.length || 0} producto(s)
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-slate-900 font-mono">
                          {formatExactCurrency(Number(po.totalCost) || 0, currency)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 px-4 rounded-2xl border-2 border-dashed border-slate-200">
                  <Boxes className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <h4 className="text-sm font-bold text-slate-700">Sin Órdenes de Compra Registradas</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                    Aún no se han emitido órdenes de compra para {supplier.name}.
                  </p>
                  {onNewPurchaseForSupplier && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onNewPurchaseForSupplier(supplier.name, supplier.phone);
                      }}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      Crear Primera Orden de Compra
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PRODUCTS CATALOG */}
          {activeTab === 'products' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {supplier.suppliedProducts && supplier.suppliedProducts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {supplier.suppliedProducts.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => onOpenItemDetail?.(p)}
                      className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-amber-400 hover:shadow-xs transition cursor-pointer flex items-center space-x-3"
                    >
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                          <Package className="w-6 h-6" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <h5 className="text-xs font-bold text-slate-900 truncate">{p.name}</h5>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] font-mono font-bold text-slate-500">
                            SKU: {p.sku}
                          </span>
                          <span className="text-[11px] font-bold text-slate-700">
                            Stock: {p.stock} un.
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-black text-amber-700 font-mono">
                            Costo: {formatExactCurrency(Number(p.costPrice) || 0, currency)}
                          </span>
                          <span className="text-xs font-bold text-slate-600 font-mono">
                            Venta: {formatExactCurrency(Number(p.salePrice) || 0, currency)}
                          </span>
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 px-4 rounded-2xl border-2 border-dashed border-slate-200">
                  <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <h4 className="text-sm font-bold text-slate-700">Sin Productos Vinculados</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    Los productos registrados con el nombre de este proveedor aparecerán automáticamente aquí.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">
            Registrado el {new Date(supplier.createdAt).toLocaleDateString('es-EC')}
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Cerrar Ficha
          </button>
        </div>
      </div>
    </div>
  );
};

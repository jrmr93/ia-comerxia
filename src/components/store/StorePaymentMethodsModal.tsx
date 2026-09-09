import React from 'react';
import {
  X,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Lock,
  MessageCircle,
  ExternalLink,
  QrCode,
  Building2,
  Banknote,
} from 'lucide-react';
import { PaymentMethodPartner, StoreTheme } from '../../types.ts';
import { normalizeEcuadorPhone, buildWhatsAppLink } from '../../utils/phone.ts';
import { DEFAULT_FALLBACK_PAYMENTS } from './StoreLogisticsAndPaymentsSlider.tsx';

interface StorePaymentMethodsModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentPartners?: PaymentMethodPartner[];
  whatsappNumber?: string;
  storeName?: string;
  currency?: string;
  activeTheme?: StoreTheme | string;
}

export const StorePaymentMethodsModal: React.FC<StorePaymentMethodsModalProps> = ({
  isOpen,
  onClose,
  paymentPartners,
  whatsappNumber,
  storeName = 'Tienda',
  currency = 'USD',
  activeTheme = 'classic',
}) => {
  if (!isOpen) return null;

  const rawList =
    paymentPartners && paymentPartners.length > 0
      ? paymentPartners
      : DEFAULT_FALLBACK_PAYMENTS;
  const activePayments = rawList.filter((p) => p.active !== false);

  const isBoutique = activeTheme === 'boutique';
  const isCyber = activeTheme === 'cyber';
  const isBrutalist = activeTheme === 'brutalist';

  const handleOpenWhatsApp = () => {
    const norm = normalizeEcuadorPhone(whatsappNumber || '0999999999');
    const msg = `¡Hola ${storeName}! Quisiera consultar sobre los métodos de pago disponibles o solicitar datos para transferencia.`;
    window.open(buildWhatsAppLink(norm.whatsappDigits, msg), '_blank');
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-xl max-h-[88vh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300 border ${
          isBoutique
            ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
            : isCyber
            ? 'bg-[#08101e] border-cyan-500/40 text-cyan-100 shadow-[0_0_30px_rgba(6,182,212,0.2)]'
            : isBrutalist
            ? 'bg-white border-2 border-black text-black shadow-[6px_6px_0px_#000]'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between flex-shrink-0 ${
            isBoutique
              ? 'border-zinc-800 bg-zinc-900/70'
              : isCyber
              ? 'border-cyan-900 bg-[#0c192e]'
              : isBrutalist
              ? 'border-b-2 border-black bg-amber-300'
              : 'border-slate-100 bg-slate-50/80'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 border shadow-xs ${
                isBoutique
                  ? 'bg-amber-400/10 text-amber-400 border-amber-400/30'
                  : isCyber
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                  : isBrutalist
                  ? 'bg-white text-black border border-black'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              <CreditCard className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight leading-snug">
                Métodos de Pago
              </h3>
              <p className="text-xs opacity-70">
                Opciones seguras, rápidas y 100% verificadas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition cursor-pointer active:scale-90 ${
              isBoutique
                ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100'
                : isCyber
                ? 'bg-cyan-950/70 hover:bg-cyan-900 text-cyan-400'
                : isBrutalist
                ? 'bg-white hover:bg-black hover:text-white border border-black text-black'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900'
            }`}
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY (Scrollable) */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Security Banner */}
          <div
            className={`p-3.5 rounded-2xl border flex items-center space-x-3 ${
              isBoutique
                ? 'bg-zinc-900/80 border-zinc-800 text-zinc-300'
                : isCyber
                ? 'bg-cyan-950/40 border-cyan-900 text-cyan-200'
                : isBrutalist
                ? 'bg-zinc-100 border border-black text-black'
                : 'bg-emerald-50/70 border-emerald-200/80 text-emerald-950'
            }`}
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="text-xs">
              <span className="font-black block">Transacciones Protegidas</span>
              <span className="opacity-80">
                Paga de forma directa y segura. Tras realizar tu pedido, te confirmamos y coordinamos el comprobante de inmediato.
              </span>
            </div>
          </div>

          {/* List of Payment Methods */}
          <div className="space-y-2.5">
            {activePayments.map((payment) => (
              <div
                key={payment.id}
                className={`p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                  isBoutique
                    ? 'bg-zinc-900/60 border-zinc-800/80 hover:border-amber-400/40'
                    : isCyber
                    ? 'bg-[#0c192e]/80 border-cyan-950 hover:border-cyan-500/50'
                    : isBrutalist
                    ? 'bg-white border border-black hover:bg-amber-50 shadow-[2px_2px_0px_#000]'
                    : 'bg-slate-50/90 border-slate-200/80 hover:border-emerald-300 hover:bg-white'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  {/* Icon / Logo */}
                  <div
                    className={`w-12 h-12 rounded-xl border flex items-center justify-center flex-shrink-0 overflow-hidden ${
                      isBoutique
                        ? 'bg-zinc-950 border-zinc-800'
                        : isCyber
                        ? 'bg-[#060c18] border-cyan-900'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    {payment.logoUrl ? (
                      <img
                        src={payment.logoUrl}
                        alt={payment.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <CreditCard className="w-6 h-6 text-emerald-600" />
                    )}
                  </div>

                  {/* Title & Details */}
                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5 flex-wrap">
                      <h4 className="text-xs sm:text-sm font-black truncate">
                        {payment.name}
                      </h4>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-black bg-emerald-100/80 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                        Activo
                      </span>
                    </div>
                    <p className="text-[11px] sm:text-xs opacity-75 mt-0.5 leading-snug line-clamp-2">
                      {payment.details || 'Transferencia, depósito o pago directo'}
                    </p>
                  </div>
                </div>

                <div className="flex-shrink-0 hidden sm:block">
                  <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-200/60 text-slate-700">
                    {currency}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Pillars of Trust */}
          <div className="grid grid-cols-3 gap-2 pt-2 text-center text-[10px] font-bold">
            <div className="p-2.5 rounded-xl border border-slate-200/60 bg-slate-50/50 flex flex-col items-center justify-center space-y-1">
              <Lock className="w-4 h-4 text-sky-600" />
              <span>100% Confiable</span>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-200/60 bg-slate-50/50 flex flex-col items-center justify-center space-y-1">
              <QrCode className="w-4 h-4 text-emerald-600" />
              <span>Deuna & QR</span>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-200/60 bg-slate-50/50 flex flex-col items-center justify-center space-y-1">
              <Banknote className="w-4 h-4 text-amber-600" />
              <span>Sin Recargos</span>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div
          className={`p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0 ${
            isBoutique
              ? 'border-zinc-800 bg-zinc-900/50'
              : isCyber
              ? 'border-cyan-900 bg-[#0a1526]'
              : isBrutalist
              ? 'border-t-2 border-black bg-zinc-100'
              : 'border-slate-100 bg-slate-50/60'
          }`}
        >
          <p className="text-[11px] opacity-70 text-center sm:text-left">
            ¿Tienes dudas con tu cuenta o transferencia?
          </p>
          <button
            type="button"
            onClick={handleOpenWhatsApp}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center space-x-2 cursor-pointer active:scale-95 shadow-xs"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Consultar por WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  );
};

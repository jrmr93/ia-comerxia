import React, { useState, useEffect } from 'react';
import {
  Truck,
  CreditCard,
  ShieldCheck,
  BadgeCheck,
  ExternalLink,
  Lock,
  Sparkles,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { CourierPartner, PaymentMethodPartner, StoreTheme } from '../../types.ts';

interface StoreLogisticsAndPaymentsSliderProps {
  courierPartners?: CourierPartner[];
  paymentPartners?: PaymentMethodPartner[];
  activeTheme?: StoreTheme | string;
  className?: string;
  showTitle?: boolean;
  compact?: boolean;
}

// Fallback high-quality defaults for Ecuador & international shipping and payments
export const DEFAULT_FALLBACK_COURIERS: CourierPartner[] = [
  {
    id: 'servientrega',
    name: 'Servientrega',
    logoUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=160&auto=format&fit=crop&q=80',
    quoteUrl: 'https://www.servientrega.com.ec/',
    active: true,
  },
  {
    id: 'laarcourier',
    name: 'LaarCourier',
    logoUrl: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=160&auto=format&fit=crop&q=80',
    quoteUrl: 'https://laarcourier.com/',
    active: true,
  },
  {
    id: 'urbano',
    name: 'Urbano Express',
    logoUrl: 'https://images.unsplash.com/photo-1616401784845-180882ba9ba8?w=160&auto=format&fit=crop&q=80',
    quoteUrl: 'https://www.urbano.com.ec/',
    active: true,
  },
  {
    id: 'tramaco',
    name: 'Tramaco Express',
    logoUrl: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=160&auto=format&fit=crop&q=80',
    quoteUrl: 'https://www.tramaco.com.ec/',
    active: true,
  },
  {
    id: 'motorizado',
    name: 'Delivery Express / Motorizado',
    logoUrl: 'https://images.unsplash.com/photo-1526367790999-0150786686a2?w=160&auto=format&fit=crop&q=80',
    active: true,
  },
];

export const DEFAULT_FALLBACK_PAYMENTS: PaymentMethodPartner[] = [
  {
    id: 'banco-pichincha',
    name: 'Banco Pichincha / Mi Vecino',
    details: 'Transferencia o depósito bancario',
    logoUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=160&auto=format&fit=crop&q=80',
    active: true,
  },
  {
    id: 'banco-guayaquil',
    name: 'Banco Guayaquil / Banco del Barrio',
    details: 'Transferencia directa o depósito',
    logoUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=160&auto=format&fit=crop&q=80',
    active: true,
  },
  {
    id: 'deuna',
    name: 'Deuna / Pago Móvil QR',
    details: 'Cobro inmediato con QR o celular',
    logoUrl: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=160&auto=format&fit=crop&q=80',
    active: true,
  },
  {
    id: 'zelle',
    name: 'Zelle (USD)',
    details: 'Pagos directos en dólares',
    logoUrl: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=160&auto=format&fit=crop&q=80',
    active: true,
  },
  {
    id: 'tarjeta',
    name: 'Tarjetas Visa & Mastercard',
    details: 'Débito o crédito con link seguro',
    logoUrl: 'https://images.unsplash.com/photo-1556742049-0a67c557689c?w=160&auto=format&fit=crop&q=80',
    active: true,
  },
  {
    id: 'efectivo',
    name: 'Efectivo / Contraentrega',
    details: 'Paga al recibir tu paquete',
    logoUrl: 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=160&auto=format&fit=crop&q=80',
    active: true,
  },
];

export const StoreLogisticsAndPaymentsSlider: React.FC<StoreLogisticsAndPaymentsSliderProps> = ({
  courierPartners,
  paymentPartners,
  activeTheme = 'classic',
  className = '',
  showTitle = true,
  compact = false,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'shipping' | 'payments'>('all');
  const [animationKey, setAnimationKey] = useState(0);

  // Filter active partners or use fallback
  const rawCouriers = courierPartners && courierPartners.length > 0 ? courierPartners : DEFAULT_FALLBACK_COURIERS;
  const rawPayments = paymentPartners && paymentPartners.length > 0 ? paymentPartners : DEFAULT_FALLBACK_PAYMENTS;

  const activeCouriers = rawCouriers.filter((c) => c.active !== false);
  const activePayments = rawPayments.filter((p) => p.active !== false);

  // Re-trigger slow appearance animation when tab changes
  const handleTabChange = (tab: 'all' | 'shipping' | 'payments') => {
    setActiveTab(tab);
    setAnimationKey((prev) => prev + 1);
  };

  const handleReplayAnimation = () => {
    setAnimationKey((prev) => prev + 1);
  };

  // Theme styling helpers
  const isBoutique = activeTheme === 'boutique';
  const isCyber = activeTheme === 'cyber';
  const isBrutalist = activeTheme === 'brutalist';

  const containerBg = isBoutique
    ? 'bg-zinc-900/95 border-zinc-800 text-zinc-100'
    : isCyber
    ? 'bg-[#08101e]/95 border-cyan-500/30 text-cyan-100 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
    : isBrutalist
    ? 'bg-white border-2 border-black text-black shadow-[4px_4px_0px_#000]'
    : 'bg-white/95 border-slate-200/90 text-slate-800 shadow-xs';

  const cardBg = isBoutique
    ? 'bg-zinc-950/90 border-zinc-800 hover:border-amber-400/50 hover:bg-zinc-900 text-zinc-200'
    : isCyber
    ? 'bg-[#0b172a]/90 border-cyan-900 hover:border-cyan-400 text-cyan-200 shadow-2xs'
    : isBrutalist
    ? 'bg-amber-50 border border-black hover:bg-white text-black shadow-[2px_2px_0px_#000]'
    : 'bg-slate-50/90 border-slate-200/80 hover:border-sky-300 hover:bg-white text-slate-800 shadow-2xs';

  const subHeaderBg = isBoutique
    ? 'border-zinc-800/80 bg-zinc-950/50'
    : isCyber
    ? 'border-cyan-900/60 bg-[#060c18]/60'
    : isBrutalist
    ? 'border-black bg-zinc-100'
    : 'border-slate-100 bg-slate-50/70';

  return (
    <div
      key={`logistics-panel-${animationKey}`}
      className={`rounded-2xl sm:rounded-3xl border overflow-hidden transition-all relative ${containerBg} ${className}`}
    >
      {/* Header bar: Compact, professional and informative */}
      {showTitle && (
        <div
          className={`px-3.5 sm:px-5 py-2.5 sm:py-3 border-b flex flex-wrap items-center justify-between gap-2.5 ${subHeaderBg}`}
        >
          {/* Title & Certified Badges */}
          <div className="flex items-center space-x-2">
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 border shadow-2xs ${
                isBoutique
                  ? 'bg-amber-400/10 text-amber-400 border-amber-400/30'
                  : isCyber
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <h4 className="text-xs sm:text-sm font-black tracking-tight">
                  Envíos Nacionales & Métodos de Pago
                </h4>
                <span
                  className={`hidden xs:inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black border ${
                    isBoutique
                      ? 'bg-amber-400/10 text-amber-300 border-amber-400/30'
                      : isCyber
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                  100% Verificado
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] opacity-70 leading-none mt-0.5">
                Despachos a todo el país y transacciones certificadas
              </p>
            </div>
          </div>

          {/* Interactive filter tabs */}
          <div className="flex items-center space-x-1.5">
            <div
              className={`flex items-center rounded-xl p-0.5 text-[10px] sm:text-[11px] font-bold border ${
                isBoutique
                  ? 'bg-zinc-950 border-zinc-800'
                  : isCyber
                  ? 'bg-[#0b1528] border-cyan-900'
                  : 'bg-white border-slate-200 shadow-2xs'
              }`}
            >
              <button
                type="button"
                onClick={() => handleTabChange('all')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  activeTab === 'all'
                    ? isBoutique
                      ? 'bg-zinc-800 text-amber-300 shadow-2xs'
                      : isCyber
                      ? 'bg-cyan-500 text-black font-black'
                      : 'bg-slate-900 text-white shadow-2xs'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                Todos ({activeCouriers.length + activePayments.length})
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('shipping')}
                className={`px-2 py-1 rounded-lg transition cursor-pointer flex items-center space-x-1 ${
                  activeTab === 'shipping'
                    ? isBoutique
                      ? 'bg-zinc-800 text-amber-300 shadow-2xs'
                      : isCyber
                      ? 'bg-cyan-500 text-black font-black'
                      : 'bg-slate-900 text-white shadow-2xs'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <Truck className="w-3 h-3" />
                <span className="hidden xs:inline">Envíos</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('payments')}
                className={`px-2 py-1 rounded-lg transition cursor-pointer flex items-center space-x-1 ${
                  activeTab === 'payments'
                    ? isBoutique
                      ? 'bg-zinc-800 text-amber-300 shadow-2xs'
                      : isCyber
                      ? 'bg-cyan-500 text-black font-black'
                      : 'bg-slate-900 text-white shadow-2xs'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <CreditCard className="w-3 h-3" />
                <span className="hidden xs:inline">Pagos</span>
              </button>
            </div>

            {/* Replay gentle appearance button */}
            <button
              type="button"
              onClick={handleReplayAnimation}
              className={`p-1.5 rounded-lg border transition cursor-pointer active:scale-95 text-slate-500 hover:text-slate-800 ${
                isBoutique
                  ? 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                  : 'bg-white hover:bg-slate-100 border-slate-200 shadow-2xs'
              }`}
              title="Volver a reproducir aparición de ítems"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* BODY: SLOW, STAGGERED APPEARANCE OF EACH ITEM (Aparición Lenta de Cada Ítem) */}
      <div className="p-3.5 sm:p-5 space-y-4 sm:space-y-5">
        {/* 1. SHIPPING COURIERS SECTION */}
        {(activeTab === 'all' || activeTab === 'shipping') && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Truck className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[11px] font-black uppercase tracking-wider opacity-80">
                  Empresas de Envíos & Cobertura Nacional
                </span>
              </div>
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full">
                🚚 Entregas directas
              </span>
            </div>

            {/* Grid with slow appearance of each courier item */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3">
              {activeCouriers.map((courier, idx) => {
                // Staggered slow appearance timing: 140ms per item
                const delayMs = idx * 140;
                return (
                  <div
                    key={`courier-${courier.id || courier.name}-${animationKey}`}
                    style={{
                      animationDelay: `${delayMs}ms`,
                      animationDuration: '1.2s',
                    }}
                    className={`animate-slow-item-appear p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border transition-all duration-300 flex flex-col justify-between space-y-2 ${cardBg} hover:-translate-y-0.5 hover:shadow-sm`}
                  >
                    <div className="flex items-start justify-between space-x-2">
                      {/* Courier Logo */}
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white border border-slate-200/90 p-1 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-2xs">
                        {courier.logoUrl ? (
                          <img
                            src={courier.logoUrl}
                            alt={courier.name}
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <Truck className="w-5 h-5 text-sky-600" />
                        )}
                      </div>

                      {/* Optional quote link */}
                      {courier.quoteUrl && (
                        <a
                          href={courier.quoteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition"
                          title="Consultar cobertura oficial"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {/* Details */}
                    <div>
                      <div className="flex items-center space-x-1">
                        <span className="text-xs font-black truncate tracking-tight text-slate-900">
                          {courier.name}
                        </span>
                        <BadgeCheck className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                      </div>
                      <span className="text-[10px] text-slate-500 block font-medium mt-0.5 truncate">
                        Despacho a todo el país
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. PAYMENT METHODS SECTION */}
        {(activeTab === 'all' || activeTab === 'payments') && (
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <CreditCard className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[11px] font-black uppercase tracking-wider opacity-80">
                  Métodos de Pago & Bancos Disponibles
                </span>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                🔒 Transacciones seguras
              </span>
            </div>

            {/* Grid with slow appearance of each payment item */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
              {activePayments.map((payment, idx) => {
                // If in 'all' view, start after couriers for a progressive natural flow
                const baseOffset = activeTab === 'all' ? activeCouriers.length * 100 : 0;
                const delayMs = baseOffset + idx * 130;

                return (
                  <div
                    key={`payment-${payment.id || payment.name}-${animationKey}`}
                    style={{
                      animationDelay: `${delayMs}ms`,
                      animationDuration: '1.2s',
                    }}
                    className={`animate-slow-item-appear p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border transition-all duration-300 flex flex-col justify-between space-y-2 ${cardBg} hover:-translate-y-0.5 hover:shadow-sm`}
                  >
                    <div className="flex items-start justify-between space-x-2">
                      {/* Payment Logo */}
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white border border-slate-200/90 p-1 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-2xs">
                        {payment.logoUrl ? (
                          <img
                            src={payment.logoUrl}
                            alt={payment.name}
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <CreditCard className="w-5 h-5 text-emerald-600" />
                        )}
                      </div>

                      <Lock className="w-3 h-3 text-emerald-500 flex-shrink-0 mt-1" />
                    </div>

                    {/* Details */}
                    <div>
                      <span className="text-xs font-black truncate block tracking-tight text-slate-900">
                        {payment.name}
                      </span>
                      <span className="text-[10px] text-slate-500 block font-medium mt-0.5 line-clamp-1">
                        {payment.details || 'Pago directo seguro'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Sub-Bar: Certified Guarantees */}
      {!compact && (
        <div
          className={`px-3.5 sm:px-5 py-2.5 border-t flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-[11px] font-semibold opacity-85 ${subHeaderBg}`}
        >
          <div className="flex items-center space-x-3 sm:space-x-5 flex-wrap gap-y-1">
            <span className="flex items-center text-slate-700">
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-500 flex-shrink-0" />
              Garantía Oficial de Compra
            </span>
            <span className="flex items-center text-slate-700">
              <Lock className="w-3 h-3 mr-1 text-sky-500 flex-shrink-0" />
              Pagos y Depósitos Protegidos
            </span>
            <span className="flex items-center text-slate-700">
              <Truck className="w-3.5 h-3.5 mr-1 text-amber-500 flex-shrink-0" />
              Guía de Seguimiento Inmediata
            </span>
          </div>

          <span className="text-[10px] text-slate-500 font-medium">
            Aparición suave y estática sin saltos de scroll
          </span>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { Home, CreditCard, Truck, MessageCircle } from 'lucide-react';
import { StoreTheme } from '../../types.ts';
import { normalizeEcuadorPhone, buildWhatsAppLink } from '../../utils/phone.ts';

interface StoreBottomBarProps {
  onGoHome: () => void;
  onOpenPayments: () => void;
  onOpenShipping: () => void;
  whatsappNumber?: string;
  storeName?: string;
  activeTheme?: StoreTheme | string;
  isProductDetailOpen?: boolean;
  activeModal?: 'none' | 'payments' | 'shipping';
}

export const StoreBottomBar: React.FC<StoreBottomBarProps> = ({
  onGoHome,
  onOpenPayments,
  onOpenShipping,
  whatsappNumber,
  storeName = 'Tienda',
  activeTheme = 'classic',
  isProductDetailOpen = false,
  activeModal = 'none',
}) => {
  const isBoutique = activeTheme === 'boutique';
  const isCyber = activeTheme === 'cyber';
  const isBrutalist = activeTheme === 'brutalist';

  const handleOpenWhatsApp = () => {
    const norm = normalizeEcuadorPhone(whatsappNumber || '0999999999');
    const storeGreeting = storeName ? `¡Hola ${storeName}! ` : '¡Hola! ';
    const msg = `${storeGreeting}Quisiera consultar información sobre sus productos y pedidos.`;
    const url = buildWhatsAppLink(norm.whatsappDigits, msg);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Outer container theme styling
  const barContainerClasses = isBoutique
    ? 'bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800 text-zinc-300 shadow-[0_-4px_25px_rgba(0,0,0,0.5)]'
    : isCyber
    ? 'bg-[#070e1c]/95 backdrop-blur-md border-t border-cyan-500/40 text-cyan-300 shadow-[0_-4px_25px_rgba(6,182,212,0.2)]'
    : isBrutalist
    ? 'bg-white border-t-2 border-black text-black shadow-[0_-4px_0px_#000]'
    : 'bg-white/95 backdrop-blur-md border-t border-slate-200/90 text-slate-700 shadow-[0_-4px_24px_rgba(0,0,0,0.07)]';

  const isHomeActive = !isProductDetailOpen && activeModal === 'none';
  const isPaymentsActive = activeModal === 'payments';
  const isShippingActive = activeModal === 'shipping';

  return (
    <nav
      aria-label="Navegación inferior de la tienda"
      className={`fixed bottom-0 left-0 right-0 z-[60] select-none transition-all duration-200 ${barContainerClasses}`}
      style={{
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.35rem)',
      }}
    >
      <div className="max-w-md sm:max-w-lg mx-auto px-3 pt-1.5 pb-1">
        <div className="grid grid-cols-4 items-center justify-items-center gap-1">
          {/* 1. INICIO / CATÁLOGO (Casa) */}
          <button
            type="button"
            onClick={onGoHome}
            className={`w-full flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer active:scale-90 group relative ${
              isHomeActive
                ? isBoutique
                  ? 'text-amber-400 font-black'
                  : isCyber
                  ? 'text-cyan-400 font-black'
                  : isBrutalist
                  ? 'text-black font-black bg-amber-200/80 rounded-lg'
                  : 'text-amber-600 font-black'
                : 'opacity-70 hover:opacity-100 hover:text-slate-900'
            }`}
            title="Volver al inicio del catálogo"
          >
            <div className="relative flex items-center justify-center">
              <Home
                className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 ${
                  isHomeActive ? 'stroke-[2.5]' : 'stroke-[2]'
                }`}
              />
              {isHomeActive && (
                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              )}
            </div>
            <span className="text-[10px] sm:text-[11px] font-bold mt-1 tracking-tight leading-none whitespace-nowrap">
              Inicio
            </span>
          </button>

          {/* 2. MÉTODOS DE PAGO */}
          <button
            type="button"
            onClick={onOpenPayments}
            className={`w-full flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer active:scale-90 group relative ${
              isPaymentsActive
                ? isBoutique
                  ? 'text-amber-400 font-black'
                  : isCyber
                  ? 'text-cyan-400 font-black'
                  : isBrutalist
                  ? 'text-black font-black bg-amber-200/80 rounded-lg'
                  : 'text-emerald-600 font-black'
                : 'opacity-70 hover:opacity-100 hover:text-slate-900'
            }`}
            title="Ver métodos de pago disponibles"
          >
            <div className="relative flex items-center justify-center">
              <CreditCard
                className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 ${
                  isPaymentsActive ? 'stroke-[2.5]' : 'stroke-[2]'
                }`}
              />
              {isPaymentsActive && (
                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </div>
            <span className="text-[10px] sm:text-[11px] font-bold mt-1 tracking-tight leading-none whitespace-nowrap">
              Pagos
            </span>
          </button>

          {/* 3. EMPRESAS DE ENVÍO */}
          <button
            type="button"
            onClick={onOpenShipping}
            className={`w-full flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer active:scale-90 group relative ${
              isShippingActive
                ? isBoutique
                  ? 'text-amber-400 font-black'
                  : isCyber
                  ? 'text-cyan-400 font-black'
                  : isBrutalist
                  ? 'text-black font-black bg-amber-200/80 rounded-lg'
                  : 'text-sky-600 font-black'
                : 'opacity-70 hover:opacity-100 hover:text-slate-900'
            }`}
            title="Ver empresas de envío y despachos"
          >
            <div className="relative flex items-center justify-center">
              <Truck
                className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 ${
                  isShippingActive ? 'stroke-[2.5]' : 'stroke-[2]'
                }`}
              />
              {isShippingActive && (
                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-sky-500" />
              )}
            </div>
            <span className="text-[10px] sm:text-[11px] font-bold mt-1 tracking-tight leading-none whitespace-nowrap">
              Envíos
            </span>
          </button>

          {/* 4. WHATSAPP */}
          <button
            type="button"
            onClick={handleOpenWhatsApp}
            className="w-full flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer active:scale-90 group relative text-emerald-600 hover:text-emerald-500"
            title="Abrir chat de WhatsApp de la tienda"
          >
            <div className="relative flex items-center justify-center">
              <div className="w-5 h-5 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 stroke-[2.3] group-hover:scale-115 transition-transform duration-200 text-emerald-600 drop-shadow-2xs" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            </div>
            <span className="text-[10px] sm:text-[11px] font-black mt-1 tracking-tight leading-none whitespace-nowrap text-emerald-700">
              WhatsApp
            </span>
          </button>
        </div>
      </div>
    </nav>
  );
};

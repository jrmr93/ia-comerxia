import React from 'react';
import {
  PauseCircle,
  MessageCircle,
  Instagram,
  Globe,
  MapPin,
  Clock,
  Phone,
  Store,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { StoreConfig } from '../../types.ts';
import { normalizeEcuadorPhone } from '../../utils/phone.ts';

interface StoreMaintenanceScreenProps {
  storeConfig: StoreConfig;
  isCustomerMode?: boolean;
  isCustomerOnly?: boolean;
  onExitCustomerMode?: () => void;
}

export const StoreMaintenanceScreen: React.FC<StoreMaintenanceScreenProps> = ({
  storeConfig,
  isCustomerMode = false,
  isCustomerOnly = false,
  onExitCustomerMode,
}) => {
  const storeName = storeConfig.storeName || 'Comerxia Store';
  const title = storeConfig.maintenanceTitle || 'Tienda Temporalmente Pausada';
  const message =
    storeConfig.maintenanceMessage ||
    'Estamos actualizando nuestro inventario y catálogo de productos para ofrecerte la mejor experiencia de compra. ¡Muy pronto estaremos de vuelta!';

  const whatsappPhone = storeConfig.whatsappNumber;
  const normalizedPhone = whatsappPhone ? normalizeEcuadorPhone(whatsappPhone) : null;
  const whatsappLink = normalizedPhone?.whatsappDigits
    ? `https://wa.me/${normalizedPhone.whatsappDigits}?text=${encodeURIComponent(
        `¡Hola ${storeName}! Vi que la tienda online se encuentra en mantenimiento y quisiera hacer una consulta.`
      )}`
    : null;

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4 sm:p-6 animate-fadeIn">
      {/* Admin Testing Notification */}
      {isCustomerMode && !isCustomerOnly && (
        <div className="w-full max-w-xl mb-6 bg-amber-950/80 border border-amber-500/50 rounded-2xl p-3 sm:p-4 text-amber-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center space-x-2 text-xs">
            <PauseCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              <strong>Vista Previa de Mantenimiento:</strong> Tus clientes verán esta pantalla mientras la tienda esté pausada.
            </span>
          </div>
          {onExitCustomerMode && (
            <button
              onClick={onExitCustomerMode}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition flex-shrink-0 cursor-pointer shadow-xs active:scale-95"
            >
              Salir de Vista Previa
            </button>
          )}
        </div>
      )}

      {/* Main Maintenance Card */}
      <div className="w-full max-w-xl bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-10 text-center shadow-xl relative overflow-hidden">
        {/* Top decorative accent */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600" />

        {/* Store Logo / Icon */}
        <div className="flex justify-center mb-6">
          {/* Mobile view */}
          <div className="sm:hidden">
            {storeConfig.logoUrl ? (
              <div className="w-24 h-24 rounded-2xl p-2 bg-white border-2 border-slate-100 shadow-md flex items-center justify-center overflow-hidden">
                <img
                  src={storeConfig.logoUrl}
                  alt={storeName}
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : storeConfig.logoDesktopUrl ? (
              <div className="w-24 h-24 rounded-2xl p-2 bg-white border-2 border-slate-100 shadow-md flex items-center justify-center overflow-hidden">
                <img
                  src={storeConfig.logoDesktopUrl}
                  alt={storeName}
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg flex items-center justify-center">
                <Store className="w-10 h-10" />
              </div>
            )}
          </div>

          {/* Desktop view */}
          <div className="hidden sm:block">
            {storeConfig.logoDesktopUrl ? (
              <div className="h-20 max-w-[280px] rounded-2xl px-4 py-2 bg-white border-2 border-slate-100 shadow-md flex items-center justify-center overflow-hidden">
                <img
                  src={storeConfig.logoDesktopUrl}
                  alt={storeName}
                  className="h-full w-auto max-w-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : storeConfig.logoUrl ? (
              <div className="w-28 h-28 rounded-2xl p-2 bg-white border-2 border-slate-100 shadow-md flex items-center justify-center overflow-hidden">
                <img
                  src={storeConfig.logoUrl}
                  alt={storeName}
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg flex items-center justify-center">
                <Store className="w-12 h-12" />
              </div>
            )}
          </div>
        </div>

        {/* Badge */}
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-black uppercase tracking-wider mb-4">
          <PauseCircle className="w-3.5 h-3.5 text-amber-700" />
          <span>Modo Mantenimiento</span>
        </div>

        {/* Store Name & Title */}
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">
          {storeName}
        </h1>
        <h2 className="text-base sm:text-lg font-bold text-amber-800 mb-4">
          {title}
        </h2>

        {/* Message */}
        <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed mb-8">
          {message}
        </p>

        {/* Direct Contact Actions */}
        <div className="space-y-3 max-w-md mx-auto">
          {whatsappLink && (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/25 transition flex items-center justify-center space-x-2.5 active:scale-98"
            >
              <MessageCircle className="w-5 h-5 fill-white" />
              <span>Contactar por WhatsApp</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {storeConfig.instagramUrl && (
              <a
                href={storeConfig.instagramUrl.startsWith('http') ? storeConfig.instagramUrl : `https://${storeConfig.instagramUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center space-x-1.5 border border-slate-200"
              >
                <Instagram className="w-3.5 h-3.5 text-pink-600" />
                <span>Instagram</span>
              </a>
            )}

            {storeConfig.websiteUrl && (
              <a
                href={storeConfig.websiteUrl.startsWith('http') ? storeConfig.websiteUrl : `https://${storeConfig.websiteUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center space-x-1.5 border border-slate-200"
              >
                <Globe className="w-3.5 h-3.5 text-sky-600" />
                <span>Sitio Web</span>
              </a>
            )}
          </div>
        </div>

        {/* Location / Phone metadata */}
        {(storeConfig.address || storeConfig.whatsappNumber) && (
          <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500">
            {storeConfig.address && (
              <div className="flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>{storeConfig.address}</span>
              </div>
            )}
            {storeConfig.whatsappNumber && (
              <div className="flex items-center space-x-1 font-mono">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{storeConfig.whatsappNumber}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Branding */}
      <div className="mt-6 text-center text-[11px] text-slate-400 flex items-center justify-center space-x-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
        <span>Atención y pedidos respaldados por el comercio oficial</span>
      </div>
    </div>
  );
};

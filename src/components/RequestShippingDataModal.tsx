import React, { useState } from 'react';
import {
  X,
  MessageCircle,
  MapPin,
  Copy,
  Check,
  Building2,
  FileText,
  User,
  ShieldCheck,
  Send,
  Sparkles,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { normalizeEcuadorPhone } from '../utils/phone.ts';
import { getCustomerCi } from '../utils/orderUtils.ts';
import { validateEcuadorId } from '../utils/ecuadorIdValidator.ts';

interface RequestShippingDataModalProps {
  order: any;
  storeConfig: {
    storeName?: string;
    currency?: string;
    logoUrl?: string | null;
  };
  onClose: () => void;
  onSaveAddress: (orderId: number | string, updatedData: { customerAddress: string; customerName?: string }) => Promise<void | boolean>;
  showToast: (msg: string) => void;
  buildWhatsAppLink: (phone: string, text: string) => string;
}

export const RequestShippingDataModal: React.FC<RequestShippingDataModalProps> = ({
  order,
  storeConfig,
  onClose,
  onSaveAddress,
  showToast,
  buildWhatsAppLink,
}) => {
  const [isSaving, setIsSaving] = useState(false);

  // Helper to pre-parse existing address
  const initialParsed = (() => {
    const raw = order.customerAddress || '';
    const ci = getCustomerCi(order);
    let prov = '';
    let can = '';
    let par = '';
    let dir = raw;

    const provMatch = raw.match(/(?:Provincia|Prov\.?)[\s:]*([^\n|]+)/i);
    if (provMatch) prov = provMatch[1].trim();

    const canMatch = raw.match(/(?:Cant[oó]n|Ciudad|Cant\.?)[\s:]*([^\n|]+)/i);
    if (canMatch) can = canMatch[1].trim();

    const parMatch = raw.match(/(?:Parroquia|Parr\.?)[\s:]*([^\n|]+)/i);
    if (parMatch) par = parMatch[1].trim();

    const dirMatch = raw.match(/(?:Direcci[oó]n|Direccion)[\s:]*([\s\S]+)/i);
    if (dirMatch) {
      dir = dirMatch[1].trim();
    }

    return { ci, prov, can, par, dir };
  })();

  // Form Fields for structured shipping data
  const [idCard, setIdCard] = useState(initialParsed.ci);
  const [fullName, setFullName] = useState(order.customerName || '');
  const [province, setProvince] = useState(initialParsed.prov);
  const [canton, setCanton] = useState(initialParsed.can);
  const [parish, setParish] = useState(initialParsed.par);
  const [exactAddress, setExactAddress] = useState(initialParsed.dir);

  const idValidation = idCard.trim() ? validateEcuadorId(idCard.trim(), true) : null;

  // Consolidated address that will be saved in the order
  const [consolidatedAddress, setConsolidatedAddress] = useState(order.customerAddress || '');
  const [mode, setMode] = useState<'structured' | 'direct'>('structured');

  const phoneNorm = normalizeEcuadorPhone(order.customerPhone);

  // WhatsApp Message Template asking for exact shipping data
  const generateWhatsAppMessage = () => {
    let msg = `¡Hola *${order.customerName || 'Cliente'}*! 👋\n\n`;
    msg += `Tu pedido *#${order.orderNumber}* en *${storeConfig.storeName || 'nuestra tienda'}* ya está confirmado y listo para preparar el despacho. 📦✨\n\n`;
    msg += `Por favor, ayúdanos respondiendo con tus *datos exactos de envío* para emitir la guía de transporte y tu etiqueta:\n\n`;
    msg += `🪪 *Cédula de Identidad:*\n`;
    msg += `👤 *Nombres completos:*\n`;
    msg += `🏛️ *Provincia:*\n`;
    msg += `🏙️ *Cantón:*\n`;
    msg += `📍 *Parroquia:*\n`;
    msg += `🏠 *Dirección exacta y referencia:*\n\n`;
    msg += `¡Quedamos atentos a tu respuesta para procesar tu entrega lo más pronto posible! 🚚`;
    return msg;
  };

  // Handler to send WhatsApp
  const handleSendWhatsApp = () => {
    if (!phoneNorm.whatsappDigits || !phoneNorm.isValid) {
      showToast('⚠️ El número de WhatsApp no es válido o no está registrado');
      return;
    }
    const msg = generateWhatsAppMessage();
    const link = buildWhatsAppLink(phoneNorm.whatsappDigits, msg);
    window.open(link, '_blank');
    showToast('✓ Abriendo WhatsApp con solicitud de datos de envío');
  };

  // Handler to copy template
  const handleCopyTemplate = () => {
    const msg = generateWhatsAppMessage();
    navigator.clipboard.writeText(msg);
    showToast('✓ Plantilla de solicitud copiada al portapapeles');
  };

  // Save new address into the order
  const handleSave = async () => {
    const finalAddress = mode === 'structured'
      ? (() => {
          const lines: string[] = [];
          if (idCard.trim()) lines.push(`C.I: ${idCard.trim()}`);
          if (province.trim()) lines.push(`Provincia:\n${province.trim()}`);
          if (canton.trim()) lines.push(`Cantón:\n${canton.trim()}`);
          if (parish.trim()) lines.push(`Parroquia:\n${parish.trim()}`);
          if (exactAddress.trim()) lines.push(`Dirección:\n${exactAddress.trim()}`);
          return lines.length > 0 ? lines.join('\n\n') : consolidatedAddress.trim();
        })()
      : consolidatedAddress.trim();

    if (!finalAddress) {
      showToast('⚠️ Ingresa la dirección de envío para actualizar el pedido');
      return;
    }

    if (idCard.trim()) {
      const v = validateEcuadorId(idCard.trim(), true);
      if (!v.isValid) {
        showToast(`⚠️ Cédula inválida: ${v.error}`);
        return;
      }
    }

    setIsSaving(true);
    try {
      await onSaveAddress(order.id, {
        customerAddress: finalAddress,
        customerName: fullName.trim() || order.customerName,
      });
      showToast(`✓ Dirección de envío del pedido #${order.orderNumber} actualizada exitosamente`);
      if (onClose) onClose();
    } catch (err: any) {
      showToast(`Error al guardar: ${err.message || 'Intente nuevamente'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-emerald-500 via-teal-600 to-emerald-600 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white border border-white/30 shadow-inner">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base leading-tight flex items-center gap-1.5">
                Datos Exactos de Envío
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-white font-mono text-[11px] border border-white/30">
                  #{order.orderNumber}
                </span>
              </h3>
              <p className="text-emerald-100 text-xs mt-0.5">
                Solicitar por WhatsApp y reemplazar dirección en el pedido
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 text-xs text-slate-700">
          {/* Summary Box */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Cliente & Teléfono</span>
              <span className="font-bold text-slate-900 text-sm">{order.customerName}</span>
              <span className="text-slate-500 font-mono text-xs ml-2">({order.customerPhone || 'Sin teléfono'})</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Pedido</span>
              <span className="font-mono font-bold text-emerald-700 text-sm">
                ${Number(order.totalAmount).toFixed(2)} {storeConfig.currency || '$'}
              </span>
            </div>
          </div>

          {/* PASO 1: ENVIAR MENSAJE POR WHATSAPP */}
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-black text-emerald-950 text-xs flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                Paso 1: Solicitar Datos de Envío por WhatsApp
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-200/70 text-emerald-800 font-bold text-[10px]">
                Plantilla Oficial
              </span>
            </div>

            <div className="p-3 rounded-lg bg-white border border-emerald-200/80 text-[11px] font-mono leading-relaxed text-slate-800 whitespace-pre-wrap shadow-2xs">
              {generateWhatsAppMessage()}
            </div>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="flex-1 py-2.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Enviar Mensaje a WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleCopyTemplate}
                className="py-2.5 px-3 rounded-xl bg-white hover:bg-emerald-100/70 text-emerald-800 border border-emerald-300 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                title="Copiar texto de solicitud"
              >
                <Copy className="w-4 h-4 text-emerald-700" />
                <span>Copiar</span>
              </button>
            </div>
          </div>

          {/* PASO 2: INGRESAR Y REEMPLAZAR DIRECCIÓN */}
          <div className="p-4 rounded-xl bg-sky-50/70 border border-sky-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-black text-sky-950 text-xs flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-sky-600" />
                Paso 2: Ingresar Datos Recibidos y Reemplazar Dirección
              </span>
              <div className="flex items-center bg-white rounded-lg p-0.5 border border-sky-200">
                <button
                  type="button"
                  onClick={() => setMode('structured')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                    mode === 'structured' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Formulario
                </button>
                <button
                  type="button"
                  onClick={() => setMode('direct')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                    mode === 'direct' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Texto Directo
                </button>
              </div>
            </div>

            {/* Current / Initial Address Info */}
            <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-[11px]">
              <span className="font-bold text-slate-500 block mb-0.5">Dirección original registrada al inicio:</span>
              <p className="text-slate-800 italic">
                {order.customerAddress || 'No especificada previamente'}
              </p>
            </div>

            {mode === 'structured' ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                      🪪 Cédula de Identidad:
                    </label>
                    <input
                      type="text"
                      value={idCard}
                      onChange={(e) => {
                        setIdCard(e.target.value);
                      }}
                      placeholder="Ej. 1712345678"
                      className={`w-full px-2.5 py-1.5 rounded-lg font-mono text-xs focus:outline-none transition ${
                        idValidation
                          ? idValidation.isValid
                            ? 'bg-emerald-50/50 border border-emerald-400 text-slate-900 font-semibold focus:border-emerald-600'
                            : 'bg-rose-50/50 border border-rose-400 text-slate-900 font-semibold focus:border-rose-600'
                          : 'bg-white border border-slate-300 text-slate-900 focus:border-sky-500'
                      }`}
                    />
                    <div className="min-h-4 mt-0.5">
                      {idValidation ? (
                        idValidation.isValid ? (
                          <p className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>✓ {idValidation.type === 'cedula' ? 'Cédula Válida' : 'RUC Válido'} ({idValidation.provinceName})</span>
                          </p>
                        ) : (
                          <p className="text-[10px] text-rose-600 font-medium flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                            <span>{idValidation.error}</span>
                          </p>
                        )
                      ) : (
                        <p className="text-[9.5px] text-slate-400">10 dígitos (Cédula ecuatoriana)</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                      👤 Nombres Completos (Destinatario):
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Nombre del cliente o quien recibe"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 font-medium text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                      🏛️ Provincia:
                    </label>
                    <input
                      type="text"
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      placeholder="Ej. Pichincha"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                      🏙️ Cantón / Ciudad:
                    </label>
                    <input
                      type="text"
                      value={canton}
                      onChange={(e) => setCanton(e.target.value)}
                      placeholder="Ej. Quito"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                      📍 Parroquia:
                    </label>
                    <input
                      type="text"
                      value={parish}
                      onChange={(e) => setParish(e.target.value)}
                      placeholder="Ej. Iñaquito / Cumbayá"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                    🏠 Dirección exacta, calles y referencia:
                  </label>
                  <textarea
                    rows={2}
                    value={exactAddress}
                    onChange={(e) => setExactAddress(e.target.value)}
                    placeholder="Ej. Av. Amazonas N34-120 y Naciones Unidas, Edificio Platinum Of. 402 (Frente al CCI)"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                  Pegar o escribir la dirección completa recibida del cliente:
                </label>
                <textarea
                  rows={4}
                  value={consolidatedAddress}
                  onChange={(e) => setConsolidatedAddress(e.target.value)}
                  placeholder="Pega aquí la respuesta del cliente (C.I, Nombres, Provincia, Cantón, Parroquia, Dirección)..."
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-sky-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs transition cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            <span>{isSaving ? 'Guardando cambios...' : 'Guardar y Reemplazar Dirección'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

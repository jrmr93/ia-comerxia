import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  MapPin,
  FileText,
  Mail,
  Save,
  AlertCircle,
  CreditCard,
  Home,
  CheckCircle2,
  Truck,
  Building2,
  Sparkles,
} from 'lucide-react';
import { Customer } from '../types.ts';
import { normalizeEcuadorPhone } from '../utils/phone.ts';
import { validateEcuadorId } from '../utils/ecuadorIdValidator.ts';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (customerData: Partial<Customer>) => Promise<boolean>;
  customer?: Customer | null;
  existingCustomers?: Customer[];
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  customer,
  existingCustomers = [],
}) => {
  // 1. Cédula / RUC
  const [ci, setCi] = useState('');
  // 2. Nombre Completo
  const [fullName, setFullName] = useState('');
  // 3. Dirección (Datos Generales)
  const [generalAddress, setGeneralAddress] = useState('');
  // 4. Teléfono o WhatsApp
  const [phone, setPhone] = useState('');
  // 5. Correo Electrónico
  const [email, setEmail] = useState('');

  // Delivery / Shipping location details
  const [shippingAddress, setShippingAddress] = useState('');
  const [province, setProvince] = useState('');
  const [canton, setCanton] = useState('');
  const [parish, setParish] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Autocomplete suggestions
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [matchedCustomerInfo, setMatchedCustomerInfo] = useState<Customer | null>(null);

  useEffect(() => {
    if (customer) {
      setCi(customer.ci || '');
      setFullName(customer.fullName || customer.name || '');
      setGeneralAddress(customer.address || '');
      setPhone(customer.phone || '');
      setEmail(customer.email || '');
      setShippingAddress(customer.exactAddress || customer.fullAddress || '');
      setProvince(customer.province || '');
      setCanton(customer.canton || '');
      setParish(customer.parish || '');
      setReference(customer.reference || '');
      setNotes(customer.notes || '');
      setMatchedCustomerInfo(null);
    } else {
      setCi('');
      setFullName('');
      setGeneralAddress('');
      setPhone('');
      setEmail('');
      setShippingAddress('');
      setProvince('');
      setCanton('');
      setParish('');
      setReference('');
      setNotes('');
      setMatchedCustomerInfo(null);
    }
    setError(null);
    setShowSuggestions(false);
  }, [customer, isOpen]);

  if (!isOpen) return null;

  // Filter existing customers matching input CI or name
  const cleanInputCi = ci.trim().toLowerCase();
  const matchingSuggestions = !customer && cleanInputCi.length >= 2
    ? existingCustomers.filter((c) => {
        const cCi = (c.ci || '').trim().toLowerCase();
        const cName = (c.fullName || c.name || '').trim().toLowerCase();
        const cPhone = (c.phone || '').trim().toLowerCase();
        return cCi.includes(cleanInputCi) || cName.includes(cleanInputCi) || cPhone.includes(cleanInputCi);
      }).slice(0, 6)
    : [];

  const ciValidation = ci.trim() ? validateEcuadorId(ci.trim()) : null;

  const handleCiChange = (newCi: string) => {
    setCi(newCi);
    const clean = newCi.trim().toLowerCase();
    const cleanDigits = clean.replace(/\D/g, '');

    if (!customer && (clean.length >= 2 || cleanDigits.length >= 2)) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }

    if (!customer && (clean.length >= 8 || cleanDigits.length >= 8)) {
      const match = existingCustomers.find((c) => {
        const cCi = (c.ci || '').trim().toLowerCase();
        const cDigits = cCi.replace(/\D/g, '');
        return cCi === clean || (cleanDigits.length >= 8 && cDigits === cleanDigits);
      });
      if (match) {
        handleAutofillFromExisting(match);
      }
    }

    if ((cleanDigits.length === 10 || cleanDigits.length === 13) && !province) {
      const val = validateEcuadorId(cleanDigits);
      if (val.isValid && val.provinceName) {
        setProvince(val.provinceName);
      }
    }
  };

  const handleAutofillFromExisting = (ex: Customer) => {
    setMatchedCustomerInfo(ex);
    if (ex.ci) setCi(ex.ci);
    if (ex.fullName || ex.name) setFullName(ex.fullName || ex.name || '');
    setGeneralAddress(ex.address || '');
    if (ex.phone) setPhone(ex.phone);
    if (ex.email) setEmail(ex.email);
    setShippingAddress(ex.exactAddress || ex.fullAddress || '');
    if (ex.province) setProvince(ex.province);
    if (ex.canton) setCanton(ex.canton);
    if (ex.parish) setParish(ex.parish);
    if (ex.reference) setReference(ex.reference);
    if (ex.notes) setNotes(ex.notes);
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ci.trim()) {
      setError('El número de cédula o RUC es obligatorio para registrar al cliente');
      return;
    }

    const ciValidation = validateEcuadorId(ci.trim());
    if (!ciValidation.isValid) {
      setError(`Cédula ecuatoriana inválida: ${ciValidation.error}`);
      return;
    }

    if (!fullName.trim()) {
      setError('El nombre completo es obligatorio');
      return;
    }
    if (!phone.trim()) {
      setError('El número de teléfono o WhatsApp es obligatorio');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const payload: Partial<Customer> = {
        name: fullName.trim(),
        fullName: fullName.trim(),
        ci: ciValidation.cleaned,
        phone: phone.trim(),
        email: email.trim() || undefined,
        address: generalAddress.trim() || undefined,
        fullAddress: shippingAddress.trim() || undefined,
        exactAddress: shippingAddress.trim() || undefined,
        province: province.trim() || ciValidation.provinceName || undefined,
        canton: canton.trim() || undefined,
        parish: parish.trim() || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      const success = await onSave(payload);
      if (success) {
        if (onClose) onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Error al guardar cliente');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  {customer ? 'Modificar Datos de Cliente' : 'Registrar Nuevo Cliente'}
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Venta Directa / CRM
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {customer
                  ? `Editando cliente #${customer.id} - ${customer.fullName || customer.name}`
                  : 'Ingresa los mismos datos requeridos al crear pedidos manuales'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: 5 Aligned Columns for Customer Data in exact order: Cédula, Nombre, Dirección, Teléfono, Correo */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-xs">
                  1
                </span>
                <span className="font-black text-slate-900 text-xs sm:text-sm tracking-tight">
                  Datos del Cliente (Identificación y Contacto)
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Campos estándar de registro de pedidos
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 items-start">
              {/* 1. Cédula / RUC */}
              <div className="relative flex flex-col">
                <label className="text-slate-700 font-bold mb-1.5 text-xs h-5 flex items-center justify-between">
                  <span>Cédula / RUC: <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-mono font-medium">Autocompletado</span>
                </label>
                <div className="relative">
                  <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
                  <input
                    type="text"
                    required
                    autoFocus={!customer}
                    value={ci}
                    onChange={(e) => handleCiChange(e.target.value)}
                    onFocus={() => {
                      if (ci.trim().length >= 2 && matchingSuggestions.length > 0) {
                        setShowSuggestions(true);
                      }
                    }}
                    placeholder="Ej. 1712345678"
                    className={`w-full h-10 pl-9 pr-8 rounded-xl font-mono text-xs focus:outline-none focus:ring-2 font-semibold transition ${
                      ciValidation
                        ? ciValidation.isValid
                          ? 'bg-emerald-50/40 border border-emerald-300 text-slate-900 focus:border-emerald-500 focus:ring-emerald-100'
                          : 'bg-rose-50/40 border border-rose-300 text-slate-900 focus:border-rose-500 focus:ring-rose-100'
                        : 'bg-slate-50 border border-slate-200 text-slate-900 focus:border-emerald-500 focus:bg-white focus:ring-emerald-100'
                    }`}
                  />
                  {ci && (
                    <button
                      type="button"
                      onClick={() => {
                        setCi('');
                        setMatchedCustomerInfo(null);
                        setShowSuggestions(false);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-1 rounded-full hover:bg-slate-200 transition cursor-pointer"
                      title="Borrar identificación"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {showSuggestions && matchingSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-emerald-300 rounded-xl shadow-xl z-40 overflow-hidden divide-y divide-slate-100 max-h-52 overflow-y-auto">
                    <div className="px-3 py-2 bg-emerald-50 text-[11px] font-bold text-emerald-800 flex items-center justify-between">
                      <span>Clientes encontrados con esta C.I.:</span>
                      <button
                        type="button"
                        onClick={() => setShowSuggestions(false)}
                        className="text-slate-400 hover:text-slate-600 text-xs p-0.5 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    {matchingSuggestions.map((cust, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleAutofillFromExisting(cust)}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-emerald-50 transition flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-xs truncate">
                            {cust.fullName || cust.name || 'Cliente registrado'}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono mt-0.5">
                            <span className="text-emerald-700 font-bold">CI: {cust.ci}</span>
                            {cust.phone && <span>• Tel: {cust.phone}</span>}
                          </div>
                        </div>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono flex-shrink-0 font-medium">
                          Existente
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="min-h-5 mt-1.5">
                  {matchedCustomerInfo ? (
                    <div className="text-[10px] text-emerald-700 flex items-center gap-1 font-semibold truncate">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span className="truncate">Datos de <strong>{matchedCustomerInfo.fullName || matchedCustomerInfo.name}</strong></span>
                    </div>
                  ) : ciValidation ? (
                    ciValidation.isValid ? (
                      <div className="text-[10.5px] text-emerald-700 flex items-center gap-1 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span>✓ {ciValidation.type === 'cedula' ? 'Cédula Válida' : 'RUC Válido'} ({ciValidation.provinceName})</span>
                      </div>
                    ) : (
                      <div className="text-[10px] text-rose-600 flex items-center gap-1 font-medium leading-tight">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                        <span>{ciValidation.error}</span>
                      </div>
                    )
                  ) : (
                    <p className="text-[10px] text-slate-400">
                      10 dígitos numéricos (Cédula de Ecuador)
                    </p>
                  )}
                </div>
              </div>

              {/* 2. Nombre Completo */}
              <div className="flex flex-col">
                <label className="text-slate-700 font-bold mb-1.5 text-xs h-5 flex items-center">
                  <span>Nombre Completo: <span className="text-rose-500">*</span></span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ej. María Gómez"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition font-medium"
                  />
                </div>
                <div className="h-5 mt-1.5">
                  <p className="text-[10px] text-slate-400">
                    Nombre o razón social
                  </p>
                </div>
              </div>

              {/* 3. Dirección (Datos Generales) */}
              <div className="flex flex-col">
                <label className="text-slate-700 font-bold mb-1.5 text-xs h-5 flex items-center">
                  <span>Dirección del Cliente (Domicilio / Fiscal):</span>
                </label>
                <div className="relative">
                  <Home className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={generalAddress}
                    onChange={(e) => setGeneralAddress(e.target.value)}
                    placeholder="Ej. Av. 10 de Agosto N24-15"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition font-medium"
                  />
                </div>
                <div className="h-5 mt-1.5">
                  <p className="text-[10px] text-slate-400">
                    Dirección propia del cliente (no afecta dirección de envío)
                  </p>
                </div>
              </div>

              {/* 4. Teléfono o WhatsApp */}
              <div className="flex flex-col">
                <label className="text-slate-700 font-bold mb-1.5 text-xs h-5 flex items-center">
                  <span>Teléfono o WhatsApp: <span className="text-rose-500 font-bold">*</span></span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ej. 0983302390"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition font-semibold"
                  />
                </div>
                <div className="h-5 mt-1.5">
                  {phone.trim() ? (
                    (() => {
                      const norm = normalizeEcuadorPhone(phone);
                      if (norm.isValid) {
                        return (
                          <div className="text-[10px] text-emerald-700 flex items-center gap-1 font-mono font-medium truncate">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                            <span className="truncate">WA ({norm.formattedLocal})</span>
                          </div>
                        );
                      }
                      return (
                        <p className="text-[10px] text-amber-600 font-mono truncate">
                          10 dígitos (Ej: 0983302390)
                        </p>
                      );
                    })()
                  ) : (
                    <p className="text-[10px] text-slate-400">
                      Para ticket y contacto directo
                    </p>
                  )}
                </div>
              </div>

              {/* 5. Correo Electrónico */}
              <div className="flex flex-col">
                <label className="text-slate-700 font-bold mb-1.5 text-xs h-5 flex items-center">
                  <span>Correo Electrónico:</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="cliente@ejemplo.com"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition font-medium"
                  />
                </div>
                <div className="h-5 mt-1.5">
                  <p className="text-[10px] text-slate-400">
                    Para envío de comprobante
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Dirección y Ubicación de Envío / Destino */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-sky-600 text-white flex items-center justify-center font-black text-xs">
                  2
                </span>
                <span className="font-black text-slate-900 text-xs sm:text-sm tracking-tight flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-sky-600" />
                  Dirección y Destino de Envío / Ubicación
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Lugar de entrega física para despachos y transportistas
              </span>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1.5 text-xs">
                Dirección / Destino de Envío:
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-sky-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="Ej. Av. Amazonas y República, Edif. Centro, Depto 402, Quito"
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100 transition font-medium"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Dirección específica de entrega física del paquete (puede ser diferente a la dirección general del cliente).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Provincia
                </label>
                <input
                  type="text"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  placeholder="Ej. Pichincha"
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Cantón / Ciudad
                </label>
                <input
                  type="text"
                  value={canton}
                  onChange={(e) => setCanton(e.target.value)}
                  placeholder="Ej. Quito"
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Parroquia
                </label>
                <input
                  type="text"
                  value={parish}
                  onChange={(e) => setParish(e.target.value)}
                  placeholder="Ej. Iñaquito / Cumbayá"
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Referencia de Entrega / Agencia de Preferencia
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Ej. Frente a la farmacia Fybeca / Retiro en Agencia Servientrega"
                className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition font-medium"
              />
            </div>
          </div>

          {/* Section 3: Notes / Observaciones */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Notas adicionales / Observaciones del cliente
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Preferencias de entrega, observaciones, cliente frecuente, requerimientos especiales..."
              className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition font-medium resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center space-x-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 rounded-xl shadow-xs transition cursor-pointer"
            >
              {isSaving ? (
                <span>Guardando...</span>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{customer ? 'Guardar Cambios' : 'Registrar Cliente'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


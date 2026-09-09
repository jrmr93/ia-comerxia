import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Phone,
  Mail,
  MapPin,
  FileText,
  CreditCard,
  Calendar,
  Save,
  Star,
  Globe,
  User,
  Clock,
  DollarSign,
  AlertCircle,
  Landmark,
  CheckCircle2,
} from 'lucide-react';
import { Supplier, SupplierBankInfo } from '../types.ts';
import { validateEcuadorId } from '../utils/ecuadorIdValidator.ts';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (supplierData: Partial<Supplier>) => Promise<boolean>;
  supplier?: Supplier | null;
  existingSuppliers?: Supplier[];
  initialName?: string;
}

const COMMON_CATEGORIES = [
  'Mayorista General',
  'Importador Directo',
  'Fabricante',
  'Tecnología y Electrónica',
  'Moda y Calzado',
  'Hogar y Bazar',
  'Salud y Belleza',
  'Alimentos y Bebidas',
  'Repuestos y Accesorios',
  'Servicios e Insumos',
  'Otro',
];

const COMMON_BANKS = [
  'Banco Pichincha',
  'Banco Guayaquil',
  'Produbanco',
  'Banco del Pacífico',
  'Banco Bolivariano',
  'Banco Internacional',
  'Banco del Austro',
  'Cooperativa JEP',
  'Deuna! / Billetera Digital',
  'Otro Banco / Cooperativa',
];

export const SupplierModal: React.FC<SupplierModalProps> = ({
  isOpen,
  onClose,
  onSave,
  supplier,
  existingSuppliers = [],
  initialName = '',
}) => {
  const [activeFormTab, setActiveFormTab] = useState<'general' | 'contact' | 'commercial' | 'bank'>('general');

  // General & Fiscal
  const [name, setName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [ruc, setRuc] = useState('');
  const [category, setCategory] = useState('Mayorista General');
  const [customCategory, setCustomCategory] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [rating, setRating] = useState<number>(5);

  // Contact & Location
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactPersonPhone, setContactPersonPhone] = useState('');
  const [contactPersonRole, setContactPersonRole] = useState('');
  const [country, setCountry] = useState('Ecuador');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');

  // Commercial & ERP Terms
  const [paymentTerms, setPaymentTerms] = useState<string>('contado');
  const [creditLimit, setCreditLimit] = useState<string>('0');
  const [leadTimeDays, setLeadTimeDays] = useState<string>('2');
  const [notes, setNotes] = useState('');

  // Bank Info
  const [bankName, setBankName] = useState('');
  const [customBankName, setCustomBankName] = useState('');
  const [accountType, setAccountType] = useState<'corriente' | 'ahorros'>('corriente');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [holderId, setHolderId] = useState('');
  const [holderEmail, setHolderEmail] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (supplier) {
      setName(supplier.name || '');
      setTradeName(supplier.tradeName || '');
      setRuc(supplier.ruc || '');
      
      const cat = supplier.category || 'Mayorista General';
      if (COMMON_CATEGORIES.includes(cat)) {
        setCategory(cat);
        setCustomCategory('');
      } else {
        setCategory('Otro');
        setCustomCategory(cat);
      }

      setStatus(supplier.status || 'active');
      setRating(supplier.rating || 5);

      setPhone(supplier.phone || '');
      setEmail(supplier.email || '');
      setContactPerson(supplier.contactPerson || '');
      setContactPersonPhone(supplier.contactPersonPhone || '');
      setContactPersonRole(supplier.contactPersonRole || '');
      setCountry(supplier.country || 'Ecuador');
      setCity(supplier.city || '');
      setAddress(supplier.address || '');
      setWebsite(supplier.website || '');

      setPaymentTerms(supplier.paymentTerms || 'contado');
      setCreditLimit(String(supplier.creditLimit ?? '0'));
      setLeadTimeDays(String(supplier.leadTimeDays ?? '2'));
      setNotes(supplier.notes || '');

      const b = supplier.bankInfo;
      if (b) {
        if (COMMON_BANKS.includes(b.bankName)) {
          setBankName(b.bankName);
          setCustomBankName('');
        } else {
          setBankName('Otro Banco / Cooperativa');
          setCustomBankName(b.bankName || '');
        }
        setAccountType(b.accountType === 'ahorros' ? 'ahorros' : 'corriente');
        setAccountNumber(b.accountNumber || '');
        setAccountHolder(b.accountHolder || '');
        setHolderId(b.holderId || '');
        setHolderEmail(b.holderEmail || '');
      } else {
        setBankName('');
        setCustomBankName('');
        setAccountType('corriente');
        setAccountNumber('');
        setAccountHolder('');
        setHolderId('');
        setHolderEmail('');
      }
    } else {
      setName(initialName || '');
      setTradeName('');
      setRuc('');
      setCategory('Mayorista General');
      setCustomCategory('');
      setStatus('active');
      setRating(5);

      setPhone('');
      setEmail('');
      setContactPerson('');
      setContactPersonPhone('');
      setContactPersonRole('');
      setCountry('Ecuador');
      setCity('');
      setAddress('');
      setWebsite('');

      setPaymentTerms('contado');
      setCreditLimit('0');
      setLeadTimeDays('2');
      setNotes('');

      setBankName('');
      setCustomBankName('');
      setAccountType('corriente');
      setAccountNumber('');
      setAccountHolder('');
      setHolderId('');
      setHolderEmail('');
    }
    setError(null);
    setActiveFormTab('general');
  }, [supplier, isOpen, initialName]);

  if (!isOpen) return null;

  const rucValidation = ruc.trim() ? validateEcuadorId(ruc.trim(), true) : null;
  const holderIdValidation = holderId.trim() ? validateEcuadorId(holderId.trim(), true) : null;

  const handleCopyHolderFromFiscal = () => {
    if (name && !accountHolder) setAccountHolder(name);
    if (ruc && !holderId) setHolderId(ruc);
    if (email && !holderEmail) setHolderEmail(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre o razón social del proveedor es obligatorio');
      setActiveFormTab('general');
      return;
    }

    if (ruc.trim()) {
      const rVal = validateEcuadorId(ruc.trim(), true);
      if (!rVal.isValid) {
        setError(`RUC o Cédula del proveedor inválida: ${rVal.error}`);
        setActiveFormTab('general');
        return;
      }
    }

    if (!phone.trim()) {
      setError('El teléfono o celular de contacto es obligatorio');
      setActiveFormTab('contact');
      return;
    }

    if (holderId.trim()) {
      const hVal = validateEcuadorId(holderId.trim(), true);
      if (!hVal.isValid) {
        setError(`RUC o Cédula del titular bancario inválida: ${hVal.error}`);
        setActiveFormTab('bank');
        return;
      }
    }

    setIsSaving(true);
    setError(null);

    const finalCategory = category === 'Otro' ? (customCategory.trim() || 'General') : category;
    const finalBankName = bankName === 'Otro Banco / Cooperativa' ? customBankName.trim() : bankName;

    const bankInfoObj: SupplierBankInfo | undefined = finalBankName || accountNumber
      ? {
          bankName: finalBankName || 'Sin especificar',
          accountType,
          accountNumber: accountNumber.trim(),
          accountHolder: accountHolder.trim() || name.trim(),
          holderId: holderId.trim() || ruc.trim() || undefined,
          holderEmail: holderEmail.trim() || email.trim() || undefined,
        }
      : undefined;

    const supplierPayload: Partial<Supplier> = {
      name: name.trim(),
      tradeName: tradeName.trim() || undefined,
      ruc: ruc.trim() || undefined,
      category: finalCategory,
      status,
      rating: Number(rating) || 5,
      phone: phone.trim(),
      email: email.trim() || undefined,
      contactPerson: contactPerson.trim() || undefined,
      contactPersonPhone: contactPersonPhone.trim() || undefined,
      contactPersonRole: contactPersonRole.trim() || undefined,
      country: country.trim() || 'Ecuador',
      city: city.trim() || undefined,
      address: address.trim() || undefined,
      website: website.trim() || undefined,
      paymentTerms,
      creditLimit: parseFloat(creditLimit) || 0,
      leadTimeDays: parseInt(leadTimeDays, 10) || 0,
      bankInfo: bankInfoObj,
      bankDetails: bankInfoObj ? JSON.stringify(bankInfoObj) : undefined,
      notes: notes.trim() || undefined,
    };

    try {
      const success = await onSave(supplierPayload);
      if (success) {
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Error al guardar proveedor');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-amber-50/40">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm shadow-amber-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                {supplier ? 'Editar Proveedor' : 'Registrar Nuevo Proveedor (ERP)'}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Catálogo de compras, condiciones comerciales, cuentas bancarias y tiempo de entrega
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation inside Modal */}
        <div className="flex items-center border-b border-slate-200 px-6 bg-slate-50/70 gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveFormTab('general')}
            className={`py-2.5 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeFormTab === 'general'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Datos Fiscales & Razón Social</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFormTab('contact')}
            className={`py-2.5 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeFormTab === 'contact'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Contacto & Ubicación</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFormTab('commercial')}
            className={`py-2.5 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeFormTab === 'commercial'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Condiciones de Pago & Crédito</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFormTab('bank')}
            className={`py-2.5 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeFormTab === 'bank'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>Datos Bancarios (CxP)</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* TAB 1: GENERAL & FISCAL */}
          {activeFormTab === 'general' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Razón Social / Nombre Oficial del Proveedor <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ej: Distribuidora Mayorista El Triunfo S.A."
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nombre Comercial / Alias
                  </label>
                  <input
                    type="text"
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                    placeholder="Ej: El Triunfo Mayorista"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    RUC / Identificación Fiscal
                  </label>
                  <input
                    type="text"
                    value={ruc}
                    onChange={(e) => setRuc(e.target.value)}
                    placeholder="Ej: 1792345678001"
                    className={`w-full px-3 py-2 text-sm rounded-xl font-mono transition focus:outline-none focus:ring-2 ${
                      rucValidation
                        ? rucValidation.isValid
                          ? 'border-emerald-300 bg-emerald-50/40 text-slate-900 focus:border-emerald-500 focus:ring-emerald-100 font-semibold'
                          : 'border-rose-300 bg-rose-50/40 text-slate-900 focus:border-rose-500 focus:ring-rose-100 font-semibold'
                        : 'border-slate-200 focus:ring-amber-500/20 focus:border-amber-500'
                    }`}
                  />
                  <div className="min-h-5 mt-1">
                    {rucValidation ? (
                      rucValidation.isValid ? (
                        <p className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>✓ {rucValidation.type === 'cedula' ? 'Cédula Válida' : 'RUC Válido'} ({rucValidation.provinceName})</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span>{rucValidation.error}</span>
                        </p>
                      )
                    ) : (
                      <p className="text-[10px] text-slate-400">
                        13 dígitos para RUC o 10 para Cédula (Ecuador)
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Categoría / Giro Comercial
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                  >
                    {COMMON_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {category === 'Otro' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Especifique Categoría
                    </label>
                    <input
                      type="text"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      placeholder="Ej: Joyería Fina"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Estado del Proveedor
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                  >
                    <option value="active">Activo (Habilitado para Compras)</option>
                    <option value="inactive">Inactivo / Bloqueado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Calificación de Confiabilidad
                  </label>
                  <div className="flex items-center gap-1 py-1.5 px-3 bg-slate-50 rounded-xl border border-slate-200">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="p-1 hover:scale-110 transition cursor-pointer text-slate-300"
                      >
                        <Star
                          className={`w-5 h-5 ${
                            star <= rating
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-slate-300'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="text-xs font-bold text-slate-600 ml-2">
                      {rating} {rating === 1 ? 'estrella' : 'estrellas'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CONTACT & LOCATION */}
          {activeFormTab === 'contact' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Teléfono / WhatsApp Principal <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Ej: 0991234567 o +593991234567"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Correo Electrónico de Contacto
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ventas@proveedor.com"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Persona de Contacto / Asesor Comercial
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={contactPerson}
                      onChange={(e) => setContactPerson(e.target.value)}
                      placeholder="Ej: Carlos Mendoza"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Teléfono Directo del Asesor
                  </label>
                  <input
                    type="tel"
                    value={contactPersonPhone}
                    onChange={(e) => setContactPersonPhone(e.target.value)}
                    placeholder="Ej: 0987654321"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cargo / Rol del Contacto
                  </label>
                  <input
                    type="text"
                    value={contactPersonRole}
                    onChange={(e) => setContactPersonRole(e.target.value)}
                    placeholder="Ej: Ejecutivo de Cuentas Clave"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Sitio Web / Catálogo Virtual
                  </label>
                  <div className="relative">
                    <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://www.proveedor.com"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ciudad / Localidad
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ej: Guayaquil, Quito, Cuenca..."
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    País de Origen
                  </label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Ecuador, China, Colombia, USA..."
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Dirección Física / Bodega de Despacho
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Ej: Av. Juan Tanca Marengo Km 2.5 y Rodrigo Chávez"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: COMMERCIAL & ERP TERMS */}
          {activeFormTab === 'commercial' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Condición de Pago Acordada
                  </label>
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                  >
                    <option value="contado">Contado / Anticipado (100% al ordenar)</option>
                    <option value="contra_entrega">Contra Entrega / Pago al recibir</option>
                    <option value="credito_15">Crédito Comercial a 15 Días</option>
                    <option value="credito_30">Crédito Comercial a 30 Días</option>
                    <option value="credito_60">Crédito Comercial a 60 Días</option>
                    <option value="credito_90">Crédito Comercial a 90 Días</option>
                    <option value="consignacion">Venta en Consignación</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Límite de Crédito Autorizado ($ USD)
                  </label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono font-bold"
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Cupo máximo permitido para compras a crédito pendientes de liquidación.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tiempo de Entrega Promedio (Días de Lead Time)
                  </label>
                  <div className="relative">
                    <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="number"
                      min="0"
                      max="180"
                      value={leadTimeDays}
                      onChange={(e) => setLeadTimeDays(e.target.value)}
                      placeholder="2"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Días hábiles que demora el proveedor en despachar pedidos a bodega.
                  </span>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Observaciones y Políticas Comerciales
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Monto mínimo de pedido, días de despacho, políticas de garantía, acuerdos de descuento por volumen..."
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: BANK INFO (CxP) */}
          {activeFormTab === 'bank' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs">
                <div>
                  <p className="font-bold">Datos Bancarios para Transferencias de Tesorería ERP</p>
                  <p className="text-[11px] text-amber-700">Se utilizarán para emitir comprobantes de pagos a proveedores y registrar cuentas por pagar (CxP).</p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyHolderFromFiscal}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition cursor-pointer shrink-0"
                >
                  Copiar de Datos Fiscales
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Institución Financiera / Banco
                  </label>
                  <select
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                  >
                    <option value="">Seleccionar Banco...</option>
                    {COMMON_BANKS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                {bankName === 'Otro Banco / Cooperativa' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nombre de la Institución
                    </label>
                    <input
                      type="text"
                      value={customBankName}
                      onChange={(e) => setCustomBankName(e.target.value)}
                      placeholder="Ej: Cooperativa Policía Nacional"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tipo de Cuenta
                  </label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value as 'corriente' | 'ahorros')}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                  >
                    <option value="corriente">Cuenta Corriente</option>
                    <option value="ahorros">Cuenta de Ahorros</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Número de Cuenta Bancaria
                  </label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="Ej: 2100123456"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Titular de la Cuenta
                  </label>
                  <input
                    type="text"
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    placeholder="Nombre completo o Razón Social del beneficiario"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    RUC / Cédula del Titular
                  </label>
                  <input
                    type="text"
                    value={holderId}
                    onChange={(e) => setHolderId(e.target.value)}
                    placeholder="Ej: 1792345678001"
                    className={`w-full px-3 py-2 text-sm rounded-xl font-mono transition focus:outline-none focus:ring-2 ${
                      holderIdValidation
                        ? holderIdValidation.isValid
                          ? 'border-emerald-300 bg-emerald-50/40 text-slate-900 focus:border-emerald-500 focus:ring-emerald-100 font-semibold'
                          : 'border-rose-300 bg-rose-50/40 text-slate-900 focus:border-rose-500 focus:ring-rose-100 font-semibold'
                        : 'border-slate-200 focus:ring-amber-500/20 focus:border-amber-500'
                    }`}
                  />
                  <div className="min-h-5 mt-1">
                    {holderIdValidation ? (
                      holderIdValidation.isValid ? (
                        <p className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>✓ {holderIdValidation.type === 'cedula' ? 'Cédula Válida' : 'RUC Válido'} ({holderIdValidation.provinceName})</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span>{holderIdValidation.error}</span>
                        </p>
                      )
                    ) : (
                      <p className="text-[10px] text-slate-400">
                        Cédula (10 dígitos) o RUC (13 dígitos) del titular
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Correo para Envío de Comprobantes
                  </label>
                  <input
                    type="email"
                    value={holderEmail}
                    onChange={(e) => setHolderEmail(e.target.value)}
                    placeholder="pagos@proveedor.com"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <span>* Campos requeridos</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Guardando...' : supplier ? 'Actualizar Proveedor' : 'Guardar Proveedor'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

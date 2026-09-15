import React, { useState, useEffect } from 'react';
import { Key, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Upload, Eye, EyeOff, Building, FileText, Sparkles, Server, Search, Hash, FileCheck } from 'lucide-react';
import { SriConfig } from '../types';

interface SriConfigTabProps {
  onSaved?: () => void;
}

export const SriConfigTab: React.FC<SriConfigTabProps> = ({ onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [ruc, setRuc] = useState('1700000000001');
  const [estadoRuc, setEstadoRuc] = useState('ACTIVO');
  const [razonSocial, setRazonSocial] = useState('COMERXIA E-COMMERCE S.A.');
  const [nombreComercial, setNombreComercial] = useState('COMERXIA ECUADOR');
  const [estab, setEstab] = useState('001');
  const [ptoEmi, setPtoEmi] = useState('001');
  const [dirMatriz, setDirMatriz] = useState('Quito, Ecuador');
  const [obligadoContabilidad, setObligadoContabilidad] = useState<'SI' | 'NO'>('NO');
  const [contribuyenteEspecial, setContribuyenteEspecial] = useState('');
  const [regimenRimpe, setRegimenRimpe] = useState<'CONTRIBUYENTE_RIMPE' | 'EMPRENDEDOR_RIMPE' | 'NEGOCIO_POPULAR_RIMPE' | 'NO'>('NO');
  const [ambiente, setAmbiente] = useState<'1' | '2'>('1');

  // Secuenciales por documento
  const [lastFacturaSecuencial, setLastFacturaSecuencial] = useState<number | string>(0);
  const [lastNotaCreditoSecuencial, setLastNotaCreditoSecuencial] = useState<number | string>(0);
  const [lastNotaDebitoSecuencial, setLastNotaDebitoSecuencial] = useState<number | string>(0);
  const [lastGuiaRemisionSecuencial, setLastGuiaRemisionSecuencial] = useState<number | string>(0);
  const [lastRetencionSecuencial, setLastRetencionSecuencial] = useState<number | string>(0);
  const [lastLiquidacionSecuencial, setLastLiquidacionSecuencial] = useState<number | string>(0);

  // EcuadorAPI State
  const [ecuadorApiStatus, setEcuadorApiStatus] = useState<{ loading: boolean; source?: string; message?: string; rucStatus?: string } | null>(null);

  // Certificate state
  const [p12Base64, setP12Base64] = useState<string | null>(null);
  const [p12Password, setP12Password] = useState('');
  const [p12Filename, setP12Filename] = useState('');
  const [hasP12Certificate, setHasP12Certificate] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sri/config');
      const data = await res.json();
      if (res.ok && data.config) {
        setRuc(data.config.ruc || '1700000000001');
        setEstadoRuc(data.config.estadoRuc || 'ACTIVO');
        setRazonSocial(data.config.razonSocial || 'COMERXIA E-COMMERCE S.A.');
        setNombreComercial(data.config.nombreComercial || 'COMERXIA ECUADOR');
        setEstab(data.config.estab || '001');
        setPtoEmi(data.config.ptoEmi || '001');
        setDirMatriz(data.config.dirMatriz || 'Quito, Ecuador');
        setObligadoContabilidad(data.config.obligadoContabilidad || 'NO');
        setContribuyenteEspecial(data.config.contribuyenteEspecial || '');
        setRegimenRimpe(data.config.regimenRimpe || 'NO');
        setAmbiente(data.config.ambiente || '1');
        setLastFacturaSecuencial(data.config.lastFacturaSecuencial ?? 0);
        setLastNotaCreditoSecuencial(data.config.lastNotaCreditoSecuencial ?? 0);
        setLastNotaDebitoSecuencial(data.config.lastNotaDebitoSecuencial ?? 0);
        setLastGuiaRemisionSecuencial(data.config.lastGuiaRemisionSecuencial ?? 0);
        setLastRetencionSecuencial(data.config.lastRetencionSecuencial ?? 0);
        setLastLiquidacionSecuencial(data.config.lastLiquidacionSecuencial ?? 0);
        setHasP12Certificate(Boolean(data.config.hasP12Certificate));
        setP12Filename(data.config.p12Filename || '');
      } else {
        setError(data.error || 'No se pudo cargar la configuración del SRI');
      }
    } catch (err: any) {
      console.error('Error fetching SRI config:', err);
      setError('Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const isValidEcuadorianRuc = (rucStr: string): boolean => {
    const clean = rucStr.trim().replace(/\D/g, '');
    if (clean.length !== 13) return false;

    const prov = parseInt(clean.substring(0, 2), 10);
    if (prov < 1 || (prov > 24 && prov !== 30)) return false;

    const thirdDigit = parseInt(clean.substring(2, 3), 10);
    if (thirdDigit < 0 || thirdDigit > 9) return false;

    const estabNum = parseInt(clean.substring(10, 13), 10);
    if (estabNum < 1) return false;

    return true;
  };

  const handleLookupRuc = async (targetRuc?: string) => {
    const cleanRuc = (targetRuc || ruc || '').trim().replace(/\D/g, '');
    if (!cleanRuc) {
      setEcuadorApiStatus({ loading: false, message: 'Ingrese el número de RUC a consultar' });
      return;
    }

    if (!isValidEcuadorianRuc(cleanRuc)) {
      setEcuadorApiStatus({
        loading: false,
        message: '⚠ RUC no válido. Debe tener 13 dígitos numéricos y un código de provincia/establecimiento correcto.',
      });
      return;
    }

    setEcuadorApiStatus({ loading: true, message: 'Consultando RUC en SRI / EcuadorAPI...' });
    try {
      const res = await fetch(`/api/ecuador-api/rucs/${cleanRuc}`);
      const data = await res.json();
      if (res.ok && (data.data || data.business_name || data.razonSocial)) {
        const info = data.data || data;

        const bName = (
          info.business_name ||
          info.razonSocial ||
          info.razon_social ||
          info.full_name ||
          info.nombre ||
          info.name ||
          ''
        ).trim();

        const tName = (
          info.trade_name ||
          info.nombreComercial ||
          info.nombre_comercial ||
          bName
        ).trim();

        const addr = (
          info.address ||
          info.dirMatriz ||
          info.dir_matriz ||
          info.main_address ||
          info.dirEstablecimiento ||
          info.dir_establecimiento ||
          info.direccion ||
          ''
        ).trim();

        if (bName) setRazonSocial(bName);
        if (tName) setNombreComercial(tName);
        if (addr) setDirMatriz(addr);

        const accVal =
          info.accounting_obligated ??
          info.obligadoContabilidad ??
          info.obligado_contabilidad ??
          info.accounting ??
          info.obligado;

        if (accVal !== undefined && accVal !== null) {
          const accStr = String(accVal).toUpperCase();
          if (accVal === true || accStr === 'SI' || accStr === 'YES' || accStr === 'TRUE') {
            setObligadoContabilidad('SI');
          } else {
            setObligadoContabilidad('NO');
          }
        }

        const rawRegimen = String(
          info.tax_regime ||
          info.regimenRimpe ||
          info.regimen_rimpe ||
          info.regimen ||
          info.rimpe ||
          ''
        ).toUpperCase();

        if (rawRegimen.includes('POPULAR') || rawRegimen.includes('NEGOCIO_POPULAR')) {
          setRegimenRimpe('NEGOCIO_POPULAR_RIMPE');
        } else if (rawRegimen.includes('EMPRENDEDOR')) {
          setRegimenRimpe('EMPRENDEDOR_RIMPE');
        } else if (rawRegimen.includes('RIMPE') || rawRegimen.includes('CONTRIBUYENTE')) {
          setRegimenRimpe('CONTRIBUYENTE_RIMPE');
        } else if (rawRegimen.includes('GENERAL') || rawRegimen === 'NO') {
          setRegimenRimpe('NO');
        }

        const specTaxpayer = info.special_taxpayer || info.contribuyenteEspecial || info.contribuyente_especial;
        if (specTaxpayer) {
          setContribuyenteEspecial(String(specTaxpayer));
        }

        if (info.establishment_number || info.estab) {
          setEstab(String(info.establishment_number || info.estab).padStart(3, '0'));
        }
        if (info.emission_point || info.ptoEmi) {
          setPtoEmi(String(info.emission_point || info.ptoEmi).padStart(3, '0'));
        }

        const rucStatusStr = String(
          info.status || info.estadoRuc || info.estado_ruc || info.estado || 'ACTIVO'
        ).toUpperCase();

        setEstadoRuc(rucStatusStr);

        setEcuadorApiStatus({
          loading: false,
          source: data.source || 'EcuadorAPI (SRI)',
          message: `✓ RUC ${rucStatusStr}: Datos cargados correctamente`,
          rucStatus: rucStatusStr,
        });
      } else {
        setEcuadorApiStatus({
          loading: false,
          message: data.error || 'No se encontraron datos para este RUC en el SRI',
        });
      }
    } catch (err: any) {
      console.error('Error fetching EcuadorAPI RUC:', err);
      setEcuadorApiStatus({ loading: false, message: 'Error al conectar con la API del SRI' });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.p12') && !file.name.toLowerCase().endsWith('.pfx')) {
      setError('El archivo seleccionado debe ser un certificado digital en formato .p12 o .pfx');
      return;
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const result = uploadEvent.target?.result as string;
      const base64Data = result.split(',')[1] || result;
      setP12Base64(base64Data);
      setP12Filename(file.name);
      setSuccess(`✓ Certificado "${file.name}" cargado exitosamente. Ingresa la contraseña de la firma para guardar.`);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: any = {
        ruc: ruc.trim(),
        estadoRuc: estadoRuc.trim(),
        razonSocial: razonSocial.trim(),
        nombreComercial: nombreComercial.trim(),
        estab: estab.trim(),
        ptoEmi: ptoEmi.trim(),
        dirMatriz: dirMatriz.trim(),
        obligadoContabilidad,
        contribuyenteEspecial: contribuyenteEspecial.trim() || undefined,
        regimenRimpe,
        ambiente,
        lastFacturaSecuencial: Number(lastFacturaSecuencial || 0),
        lastNotaCreditoSecuencial: Number(lastNotaCreditoSecuencial || 0),
        lastNotaDebitoSecuencial: Number(lastNotaDebitoSecuencial || 0),
        lastGuiaRemisionSecuencial: Number(lastGuiaRemisionSecuencial || 0),
        lastRetencionSecuencial: Number(lastRetencionSecuencial || 0),
        lastLiquidacionSecuencial: Number(lastLiquidacionSecuencial || 0),
      };

      if (p12Base64) {
        payload.p12Base64 = p12Base64;
        payload.p12Filename = p12Filename;
      }
      if (p12Password) {
        payload.p12Password = p12Password;
      }

      const res = await fetch('/api/sri/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess('✓ Configuración fiscal del SRI guardada exitosamente');
        fetchConfig();
        if (onSaved) onSaved();
      } else {
        setError(data.error || 'Error al guardar la configuración fiscal');
      }
    } catch (err: any) {
      console.error('Error saving SRI config:', err);
      setError('Error al conectar con el servidor para guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-sky-500" />
        <p className="text-sm font-medium">Cargando datos de facturación SRI...</p>
      </div>
    );
  }

  const nextFacturaNum = (Number(lastFacturaSecuencial || 0) + 1).toString().padStart(9, '0');
  const previewFacturaSec = `${estab.padStart(3, '0')}-${ptoEmi.padStart(3, '0')}-${nextFacturaNum}`;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden text-slate-100">
      <form onSubmit={handleSave} className="flex flex-col h-full min-h-0">
        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1 pb-6">
          {/* Header Banner */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-sky-950 via-slate-900 to-indigo-950 text-white shadow-xl relative overflow-hidden border border-sky-800/40">
            <div className="absolute top-0 right-0 transform translate-x-6 -translate-y-6 opacity-10 pointer-events-none">
              <Building className="w-56 h-56 text-sky-400" />
            </div>
            <div className="relative z-10 space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30 text-[11px] font-bold tracking-wide uppercase flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-sky-400" /> Facturación Electrónica Nativa
                </span>
                {hasP12Certificate ? (
                  <span className="flex items-center gap-1 text-[11px] bg-emerald-500/30 text-emerald-200 px-2.5 py-0.5 rounded-full font-semibold border border-emerald-400/30">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Firma .p12 Activa
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] bg-amber-500/30 text-amber-200 px-2.5 py-0.5 rounded-full font-semibold border border-amber-400/30">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400" /> Modo Sandbox / Pruebas (Sin .p12)
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                SRI Ecuador - Datos de Emisor, Secuenciales y Firma Digital
              </h2>
              <p className="text-xs sm:text-sm text-sky-200/80 max-w-2xl">
                Configura los datos fiscales del emisor, consulta automáticamente con <strong className="text-sky-300">EcuadorAPI / SRI</strong> y gestiona los secuenciales consecutivos por documento.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-rose-950/70 border border-rose-700/50 text-rose-200 text-xs sm:text-sm flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-700/50 text-emerald-200 text-xs sm:text-sm flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Datos Tributarios del Emisor */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-black uppercase text-sky-400 tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4" /> Datos de Identificación Fiscal (Emisor SRI)
            </h3>
            {ecuadorApiStatus && (
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium flex items-center gap-1.5 ${
                ecuadorApiStatus.loading
                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                  : ecuadorApiStatus.rucStatus?.includes('ACTIVO')
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {ecuadorApiStatus.loading && <RefreshCw className="w-3 h-3 animate-spin" />}
                {ecuadorApiStatus.message}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                RUC de la Empresa (13 dígitos) <span className="text-rose-400">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={13}
                  required
                  value={ruc}
                  onChange={(e) => setRuc(e.target.value)}
                  placeholder="1700000000001"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={() => handleLookupRuc()}
                  disabled={ecuadorApiStatus?.loading}
                  title="Consultar datos en SRI / EcuadorAPI"
                  className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-md disabled:opacity-50"
                >
                  {ecuadorApiStatus?.loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span className="hidden sm:inline">Consultar RUC</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Estado del RUC en el SRI
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={estadoRuc}
                  onChange={(e) => setEstadoRuc(e.target.value.toUpperCase())}
                  placeholder="ACTIVO"
                  className={`w-full px-3 py-2 pr-24 rounded-xl bg-slate-950 border text-sm font-bold focus:outline-none ${
                    estadoRuc.includes('ACTIVO')
                      ? 'text-emerald-400 border-emerald-500/50 bg-emerald-950/20'
                      : estadoRuc.includes('SUSPENDIDO') || estadoRuc.includes('PASIVO')
                      ? 'text-rose-400 border-rose-500/50 bg-rose-950/20'
                      : 'text-amber-400 border-amber-500/50 bg-amber-950/20'
                  }`}
                />
                <span className={`absolute right-2 px-2.5 py-0.5 rounded-lg text-[10px] font-black tracking-wide uppercase border pointer-events-none ${
                  estadoRuc.includes('ACTIVO')
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : estadoRuc.includes('SUSPENDIDO') || estadoRuc.includes('PASIVO')
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
                  {estadoRuc || 'ACTIVO'}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Razón Social <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                placeholder="COMERXIA E-COMMERCE S.A."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nombre Comercial <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={nombreComercial}
                onChange={(e) => setNombreComercial(e.target.value)}
                placeholder="COMERXIA ECUADOR"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Dirección Matriz <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={dirMatriz}
                onChange={(e) => setDirMatriz(e.target.value)}
                placeholder="Av. Amazonas y Colón, Quito, Ecuador"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Establecimiento (3 dígitos)
                </label>
                <input
                  type="text"
                  maxLength={3}
                  value={estab}
                  onChange={(e) => setEstab(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  onBlur={() => {
                    if (estab) setEstab(estab.padStart(3, '0'));
                  }}
                  placeholder="001"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Punto de Emisión (3 dígitos)
                </label>
                <input
                  type="text"
                  maxLength={3}
                  value={ptoEmi}
                  onChange={(e) => setPtoEmi(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  onBlur={() => {
                    if (ptoEmi) setPtoEmi(ptoEmi.padStart(3, '0'));
                  }}
                  placeholder="001"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Obligado a Llevar Contabilidad
              </label>
              <select
                value={obligadoContabilidad}
                onChange={(e) => setObligadoContabilidad(e.target.value as 'SI' | 'NO')}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-sky-500"
              >
                <option value="NO">NO</option>
                <option value="SI">SI</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Régimen Tributario RIMPE
              </label>
              <select
                value={regimenRimpe}
                onChange={(e) => setRegimenRimpe(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-sky-500"
              >
                <option value="NO">NO APLICA (Régimen General)</option>
                <option value="CONTRIBUYENTE_RIMPE">CONTRIBUYENTE RÉGIMEN RIMPE</option>
                <option value="EMPRENDEDOR_RIMPE">CONTRIBUYENTE RIMPE EMPRENDEDOR</option>
                <option value="NEGOCIO_POPULAR_RIMPE">CONTRIBUYENTE RIMPE NEGOCIO POPULAR</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Ambiente del SRI
              </label>
              <select
                value={ambiente}
                onChange={(e) => setAmbiente(e.target.value as '1' | '2')}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-sky-500"
              >
                <option value="1">1 - Ambientes de Pruebas (celcer.sri.gob.ec)</option>
                <option value="2">2 - Ambiente de Producción (cel.sri.gob.ec)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Secuenciales de Comprobantes Emitidos */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-black uppercase text-teal-400 tracking-wider flex items-center gap-2">
              <Hash className="w-4 h-4" /> Control de Secuenciales Tributarios (Último Emitido)
            </h3>
            <span className="text-xs px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/30 font-mono flex items-center gap-1">
              <FileCheck className="w-3.5 h-3.5 text-teal-400" /> Próx. Factura: <strong className="text-white">{previewFacturaSec}</strong>
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Ingresa el <strong>último número secuencial emitido</strong> en tu sistema anterior o facturación física. El ERP calculará el siguiente secuencial de forma consecutiva e incremental sin romper la secuencia tributaria exigida por el SRI.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Última Factura Emitida (CodDoc 01)
              </label>
              <input
                type="number"
                min={0}
                value={lastFacturaSecuencial}
                onChange={(e) => setLastFacturaSecuencial(e.target.value)}
                placeholder="47"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-teal-500"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Próxima a emitir: #{nextFacturaNum}</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Última Nota de Crédito (CodDoc 04)
              </label>
              <input
                type="number"
                min={0}
                value={lastNotaCreditoSecuencial}
                onChange={(e) => setLastNotaCreditoSecuencial(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Última Guía de Remisión (CodDoc 06)
              </label>
              <input
                type="number"
                min={0}
                value={lastGuiaRemisionSecuencial}
                onChange={(e) => setLastGuiaRemisionSecuencial(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Última Retención (CodDoc 07)
              </label>
              <input
                type="number"
                min={0}
                value={lastRetencionSecuencial}
                onChange={(e) => setLastRetencionSecuencial(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Última Nota de Débito (CodDoc 05)
              </label>
              <input
                type="number"
                min={0}
                value={lastNotaDebitoSecuencial}
                onChange={(e) => setLastNotaDebitoSecuencial(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Última Liquidación (CodDoc 03)
              </label>
              <input
                type="number"
                min={0}
                value={lastLiquidacionSecuencial}
                onChange={(e) => setLastLiquidacionSecuencial(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>
        </div>

        {/* Carga de Firma Electrónica .p12 */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <h3 className="text-sm font-black uppercase text-sky-400 tracking-wider flex items-center gap-2">
            <Key className="w-4 h-4" /> Firma Electrónica (.p12 / .pfx)
          </h3>

          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-dashed border-sky-700/60 bg-sky-950/30 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className={`w-8 h-8 ${hasP12Certificate || p12Base64 ? 'text-emerald-400' : 'text-slate-500'}`} />
                <div>
                  <h4 className="text-sm font-bold text-slate-200">
                    {hasP12Certificate || p12Filename ? `Certificado Activo: ${p12Filename || 'firma_digital.p12'}` : 'Sin Firma Electrónica Cargada'}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {hasP12Certificate || p12Filename
                      ? 'La firma está lista para autenticar comprobantes electrónicos ante el SRI.'
                      : 'El sistema funcionará automáticamente en Modo Simulado para pruebas.'}
                  </p>
                </div>
              </div>

              <label className="cursor-pointer px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-md shrink-0">
                <Upload className="w-4 h-4" />
                {hasP12Certificate ? 'Reemplazar Certificado .p12' : 'Cargar Archivo .p12'}
                <input type="file" accept=".p12,.pfx" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Contraseña de la Firma Electrónica (.p12)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={p12Password}
                  onChange={(e) => setP12Password(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 pr-10 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

        {/* Footer Fijo en la parte inferior para Guardar */}
        <div className="shrink-0 pt-3 pb-3 px-4 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 sticky bottom-0 z-20 flex items-center justify-between gap-3 shadow-2xl rounded-b-2xl mt-2">
          <div className="flex items-center space-x-2 min-w-0">
            {success ? (
              <span className="text-xs font-bold text-emerald-300 bg-emerald-950/70 px-3 py-1.5 rounded-xl border border-emerald-700/50 flex items-center gap-1.5 truncate">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                {success}
              </span>
            ) : error ? (
              <span className="text-xs font-bold text-rose-300 bg-rose-950/70 px-3 py-1.5 rounded-xl border border-rose-700/50 flex items-center gap-1.5 truncate">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                {error}
              </span>
            ) : (
              <span className="text-xs text-slate-400 font-medium truncate hidden sm:inline">
                Guarda los datos tributarios, secuenciales y firma electrónica del SRI.
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-teal-600 hover:from-sky-500 hover:to-teal-500 text-white font-bold text-xs sm:text-sm shadow-lg hover:shadow-sky-500/25 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95 shrink-0"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Guardando...
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" /> Guardar Configuración SRI
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

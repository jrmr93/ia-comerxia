import React, { useState, useEffect } from 'react';
import { Key, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Upload, Eye, EyeOff, Building, FileText, Sparkles, Server } from 'lucide-react';
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
  const [razonSocial, setRazonSocial] = useState('COMERXIA E-COMMERCE S.A.');
  const [nombreComercial, setNombreComercial] = useState('COMERXIA ECUADOR');
  const [estab, setEstab] = useState('001');
  const [ptoEmi, setPtoEmi] = useState('001');
  const [dirMatriz, setDirMatriz] = useState('Quito, Ecuador');
  const [obligadoContabilidad, setObligadoContabilidad] = useState<'SI' | 'NO'>('NO');
  const [contribuyenteEspecial, setContribuyenteEspecial] = useState('');
  const [regimenRimpe, setRegimenRimpe] = useState<'CONTRIBUYENTE_RIMPE' | 'EMPRENDEDOR_RIMPE' | 'NEGOCIO_POPULAR_RIMPE' | 'NO'>('NO');
  const [ambiente, setAmbiente] = useState<'1' | '2'>('1');

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
        setRazonSocial(data.config.razonSocial || 'COMERXIA E-COMMERCE S.A.');
        setNombreComercial(data.config.nombreComercial || 'COMERXIA ECUADOR');
        setEstab(data.config.estab || '001');
        setPtoEmi(data.config.ptoEmi || '001');
        setDirMatriz(data.config.dirMatriz || 'Quito, Ecuador');
        setObligadoContabilidad(data.config.obligadoContabilidad || 'NO');
        setContribuyenteEspecial(data.config.contribuyenteEspecial || '');
        setRegimenRimpe(data.config.regimenRimpe || 'NO');
        setAmbiente(data.config.ambiente || '1');
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
        razonSocial: razonSocial.trim(),
        nombreComercial: nombreComercial.trim(),
        estab: estab.trim(),
        ptoEmi: ptoEmi.trim(),
        dirMatriz: dirMatriz.trim(),
        obligadoContabilidad,
        contribuyenteEspecial: contribuyenteEspecial.trim() || undefined,
        regimenRimpe,
        ambiente,
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

  return (
    <div className="flex-1 overflow-y-auto space-y-5 pr-1 pb-6 text-slate-100">
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
            SRI Ecuador - Datos de Emisor y Firma Digital
          </h2>
          <p className="text-xs sm:text-sm text-sky-200/80 max-w-2xl">
            Emite facturas electrónicas con la norma oficial XAdES-BES y clave de acceso de 49 dígitos. Puedes operar en modo <strong className="text-sky-300">Sandbox Simulado</strong> para pruebas inmediatas o cargar tu archivo de <strong className="text-sky-300">Firma Electrónica (.p12)</strong> para producción.
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

      <form onSubmit={handleSave} className="space-y-6">
        {/* Datos Tributarios del Emisor */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <h3 className="text-sm font-black uppercase text-sky-400 tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4" /> Datos de Identificación Fiscal (Emisor SRI)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                RUC de la Empresa (13 dígitos) <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                maxLength={13}
                required
                value={ruc}
                onChange={(e) => setRuc(e.target.value)}
                placeholder="1700000000001"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-sky-500"
              />
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
                  Establecimiento
                </label>
                <input
                  type="text"
                  maxLength={3}
                  value={estab}
                  onChange={(e) => setEstab(e.target.value.padStart(3, '0'))}
                  placeholder="001"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Punto de Emisión
                </label>
                <input
                  type="text"
                  maxLength={3}
                  value={ptoEmi}
                  onChange={(e) => setPtoEmi(e.target.value.padStart(3, '0'))}
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

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-sky-600 to-teal-600 hover:from-sky-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg hover:shadow-sky-500/25 transition flex items-center gap-2 disabled:opacity-50"
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

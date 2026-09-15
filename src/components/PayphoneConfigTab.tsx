import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  ExternalLink,
  Sparkles,
  Link as LinkIcon,
  Store,
  Send,
} from 'lucide-react';

interface PayphoneConfigTabProps {
  onSaved?: () => void;
}

export const PayphoneConfigTab: React.FC<PayphoneConfigTabProps> = ({ onSaved }) => {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [tokenMasked, setTokenMasked] = useState('');
  const [storeId, setStoreId] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Testing state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    payUrl?: string;
    clientTransactionId?: string;
    [key: string]: any;
  } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/payphone/config');
      const data = await res.json();
      if (res.ok && data.config) {
        setHasToken(data.config.hasToken);
        setTokenMasked(data.config.tokenMasked || '');
        setStoreId(data.config.storeId || '');
        setEnvironment(data.config.environment || 'production');
        setIsActive(data.config.isActive !== false);
      } else {
        setError(data.error || 'No se pudo cargar la configuración de Payphone API');
      }
    } catch (err: any) {
      console.error('Error fetching Payphone API config:', err);
      setError('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/payphone/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.trim(),
          storeId: storeId.trim(),
          environment,
          isActive,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess('✓ Configuración de Payphone API guardada exitosamente');
        setToken('');
        setShowToken(false);
        fetchConfig();
        if (onSaved) onSaved();
      } else {
        setError(data.error || 'Error al guardar la configuración de Payphone API');
      }
    } catch (err: any) {
      console.error('Error saving Payphone API config:', err);
      setError('Error de conexión al guardar configuración de Payphone API');
    } finally {
      setSaving(false);
    }
  };

  const handleTestGenerateLink = async () => {
    setTesting(true);
    setTestError(null);
    setTestResult(null);

    try {
      const res = await fetch('/api/payphone/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: 9999,
          orderNumber: 'TEST-001',
          totalAmount: 1.15,
          subtotal0: 0,
          subtotal15: 1.00,
          tax15: 0.15,
          customerName: 'Prueba Payphone',
          reference: 'Prueba de Enlace Payphone $1.15',
        }),
      });
      const data = await res.json();

      if (res.ok && data.success && data.payUrl) {
        setTestResult(data);
      } else {
        setTestError(data.error || 'No se pudo generar el link de prueba con Payphone API');
      }
    } catch (err: any) {
      console.error('Error testing Payphone link:', err);
      setTestError('Error al comunicarse con la API de Payphone');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3 text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin text-orange-600" />
        <p className="text-sm font-medium">Cargando configuración de Payphone API...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-5 pr-1 pb-6">
      {/* Header Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-orange-950 via-slate-900 to-indigo-950 text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 transform translate-x-4 -translate-y-4 opacity-10 pointer-events-none">
          <CreditCard className="w-48 h-48 text-orange-400" />
        </div>
        <div className="relative z-10 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-400/30 text-[11px] font-bold tracking-wide uppercase">
              Pasarela de Pagos Ecuador
            </span>
            {hasToken ? (
              <span className="flex items-center gap-1 text-[11px] bg-emerald-500/30 text-emerald-200 px-2 py-0.5 rounded-full font-semibold border border-emerald-400/30">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Token Configurado
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full font-semibold border border-amber-400/30">
                <AlertCircle className="w-3 h-3 text-amber-400" /> Pendiente de Token
              </span>
            )}
            <span className="text-[11px] bg-blue-500/20 text-blue-200 px-2 py-0.5 rounded-full font-bold border border-blue-400/30">
              VISA / Mastercard
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Payphone API (Links de Cobro en Línea)
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            Genera enlaces de pago digitales cifrados en 1-clic para cobros con tarjetas de crédito y débito Visa y Mastercard. Envía los links por WhatsApp y Correo electrónico (Gmail) al cliente en el proceso de venta.
          </p>
        </div>
      </div>

      {/* Error & Success Messages */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5 shadow-2xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{success}</span>
        </div>
      )}

      {/* Main Configuration Form Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Credenciales Payphone Developer</h3>
              <p className="text-[11px] text-slate-500">Configura el Token Bearer de la aplicación y la sucursal</p>
            </div>
          </div>
          <a
            href="https://live.payphonetodoesposible.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1 hover:underline cursor-pointer"
          >
            Payphone Business <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Switch Toggle Activar / Desactivar Payphone API */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-slate-800">Estado de Integración con Payphone API</h4>
              <p className="text-[11px] text-slate-500">
                {isActive
                  ? '✓ ACTIVADO: Al seleccionar pago con Tarjeta Visa/Mastercard se habilitará la opción de generar Link de Pago Payphone.'
                  : '✕ DESACTIVADO: La opción de cobro por link permanecerá oculta y solo se solicitará el comprobante manual.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isActive ? 'bg-orange-600' : 'bg-slate-300'
              }`}
              title={isActive ? 'Desactivar Payphone API' : 'Activar Payphone API'}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  isActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Entorno Producción En Vivo */}
          <div className="p-3.5 rounded-xl bg-orange-50/70 border border-orange-200/80 flex items-center justify-between">
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-orange-950 flex items-center gap-1.5">
                Entorno de Ejecución: Producción (En vivo)
              </h4>
              <p className="text-[11px] text-slate-600">
                Las solicitudes procesadas se dirigen a los servidores en vivo de Payphone.
              </p>
            </div>
            <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-800 border border-emerald-500/30 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              LIVE
            </span>
          </div>

          {/* Token Bearer */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Token de Autenticación de Aplicación (<code className="text-orange-700 bg-orange-50 px-1 py-0.5 rounded font-mono">Authorization Bearer</code>):
            </label>
            <div className="relative flex items-center">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={hasToken ? `Token guardado: ${tokenMasked}` : 'Ingresa el Token de aplicación generado en Payphone Developer'}
                className="w-full pl-3 pr-10 py-2.5 text-xs font-mono rounded-xl border border-slate-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition shadow-2xs"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                title={showToken ? 'Ocultar token' : 'Mostrar token'}
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {hasToken && !token && (
              <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                El Token activo es <span className="font-mono font-semibold text-slate-700">{tokenMasked}</span>. Déjalo en blanco si no deseas cambiarlo.
              </p>
            )}
          </div>

          {/* Store ID */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ID de Sucursal / Tienda (<code className="text-orange-700 bg-orange-50 px-1 py-0.5 rounded font-mono">storeId</code> - Opcional):
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                placeholder="Ej. your_storeId (Identificador de la sucursal en Payphone Developer)"
                className="w-full pl-9 pr-3 py-2.5 text-xs font-mono rounded-xl border border-slate-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition shadow-2xs"
              />
              <Store className="w-4 h-4 text-slate-400 absolute left-3" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Si manejas múltiples sucursales en Payphone, ingresa el identificador único asignado a esta tienda.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <ShieldCheck className="w-4 h-4 text-orange-600 shrink-0" />
              <span>Conexión cifrada a <span className="font-mono text-slate-700">pay.payphonetodoesposible.com/api/Links</span></span>
            </div>
            <button
              type="submit"
              disabled={saving || (!token && !hasToken)}
              className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Guardando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Guardar Configuración
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Probador de Generación de Link */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-800 flex items-center justify-center">
              <LinkIcon className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Probador de API Payphone</h3>
              <p className="text-[11px] text-slate-500">Genera una solicitud POST de prueba de $1.15 ($1.00 base + $0.15 IVA) para comprobar el token</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleTestGenerateLink}
            disabled={testing || !hasToken}
            className="px-3.5 py-1.5 rounded-xl bg-orange-700 hover:bg-orange-800 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Conectando...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" /> Probar API Links
              </>
            )}
          </button>
        </div>

        {testError && (
          <div className="p-3 rounded-xl bg-rose-100/70 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{testError}</span>
          </div>
        )}

        {testResult && testResult.payUrl && (
          <div className="p-4 rounded-xl bg-white border border-orange-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-orange-800 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-orange-600" /> Link de Pago Generado Exitosamente
              </span>
              <span className="text-[10px] font-mono bg-orange-50 text-orange-800 px-2 py-0.5 rounded font-bold">
                TX: {testResult.clientTransactionId}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 text-white font-mono text-xs flex items-center justify-between gap-2 overflow-x-auto">
              <span className="text-orange-400 font-bold truncate">{testResult.payUrl}</span>
              <a
                href={testResult.payUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white text-xs font-sans font-bold rounded-lg shrink-0 flex items-center gap-1"
              >
                Abrir Link <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

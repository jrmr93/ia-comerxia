import React, { useState, useEffect } from 'react';
import { Key, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Search, UserCheck, Eye, EyeOff, ExternalLink, Sparkles, Building2 } from 'lucide-react';

interface EcuadorApiConfigTabProps {
  onSaved?: () => void;
}

export const EcuadorApiConfigTab: React.FC<EcuadorApiConfigTabProps> = ({ onSaved }) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Testing state
  const [testCedula, setTestCedula] = useState('1700000000');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    id?: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
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
      const res = await fetch('/api/ecuador-api/config');
      const data = await res.json();
      if (res.ok && data.config) {
        setHasKey(data.config.hasApiKey);
        setApiKeyMasked(data.config.apiKeyMasked || '');
        setIsActive(data.config.isActive !== false);
      } else {
        setError(data.error || 'No se pudo cargar la configuración de Ecuador API');
      }
    } catch (err: any) {
      console.error('Error fetching Ecuador API config:', err);
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
      const res = await fetch('/api/ecuador-api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), isActive }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess('✓ Clave ECUADORAPI_KEY guardada exitosamente en el servidor');
        setApiKey('');
        setShowKey(false);
        fetchConfig();
        if (onSaved) onSaved();
      } else {
        setError(data.error || 'Error al guardar la clave API');
      }
    } catch (err: any) {
      console.error('Error saving Ecuador API config:', err);
      setError('Error de conexión al guardar la clave API');
    } finally {
      setSaving(false);
    }
  };

  const handleTestLookup = async () => {
    const clean = testCedula.trim();
    if (!clean || (!/^\d{10}$/.test(clean) && !/^\d{13}$/.test(clean))) {
      setTestError('Ingresa un número válido de 10 dígitos (Cédula) o 13 dígitos (RUC)');
      return;
    }

    setTesting(true);
    setTestError(null);
    setTestResult(null);

    const isRuc = clean.length === 13;
    const endpoint = isRuc ? `/api/ecuador-api/rucs/${encodeURIComponent(clean)}` : `/api/ecuador-api/cedulas/${encodeURIComponent(clean)}`;

    try {
      const res = await fetch(endpoint);
      const data = await res.json();

      if (res.ok && data.success && data.data) {
        setTestResult(data.data);
      } else {
        setTestError(data.error || `No se encontraron datos para el ${isRuc ? 'RUC' : 'número de cédula'} ingresado`);
      }
    } catch (err: any) {
      console.error('Error testing identification lookup:', err);
      setTestError('Error al comunicarse con la API de Ecuador');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3 text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
        <p className="text-sm font-medium">Cargando configuración de Ecuador API...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-5 pr-1 pb-6">
      {/* Header Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 transform translate-x-4 -translate-y-4 opacity-10 pointer-events-none">
          <Building2 className="w-48 h-48 text-emerald-300" />
        </div>
        <div className="relative z-10 space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[11px] font-bold tracking-wide uppercase">
              Integración Nacional SRI
            </span>
            {hasKey ? (
              <span className="flex items-center gap-1 text-[11px] bg-emerald-500/30 text-emerald-200 px-2 py-0.5 rounded-full font-semibold border border-emerald-400/30">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> API Activa
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full font-semibold border border-amber-400/30">
                <AlertCircle className="w-3 h-3 text-amber-400" /> Pendiente de Clave
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Ecuador API (Cédulas y RUCs)
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            Permite la búsqueda automatizada e instantánea de Nombres, Apellidos y Razones Sociales de contribuyentes en Ecuador mediante Cédula (10 dígitos) o RUC (13 dígitos) en el módulo de Ventas y Registro de Clientes.
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

      {/* Main Configuration Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Credenciales del Servidor (ECUADORAPI_KEY)</h3>
              <p className="text-[11px] text-slate-500">Configura la clave de autorización enviada como Header Bearer Token</p>
            </div>
          </div>
          <a
            href="https://api.ecuadorapi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 hover:underline cursor-pointer"
          >
            Obtener API Key <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Clave de API (<code className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded font-mono">ECUADORAPI_KEY</code>):
            </label>
            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasKey ? `Clave guardada: ${apiKeyMasked}` : 'Ingresa la API Key de api.ecuadorapi.com'}
                className="w-full pl-3 pr-10 py-2.5 text-xs font-mono rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition shadow-2xs"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                title={showKey ? 'Ocultar clave' : 'Mostrar clave'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {hasKey && !apiKey && (
              <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                La clave actualmente activa es <span className="font-mono font-semibold text-slate-700">{apiKeyMasked}</span>. Déjalo en blanco si no deseas modificarla.
              </p>
            )}
          </div>

          {/* Switch toggle para activar / desactivar Ecuador API */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-slate-800">Estado de Integración con Ecuador API</h4>
              <p className="text-[11px] text-slate-500">
                {isActive
                  ? '✓ Activo: Se consultarán automáticamente Cédulas y RUCs no registrados en las ventas.'
                  : '✕ Desactivado: El sistema no realizará peticiones externas a la API.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isActive ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
              title={isActive ? 'Desactivar Ecuador API' : 'Activar Ecuador API'}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  isActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="pt-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Conexión cifrada a <span className="font-mono text-slate-700">api.ecuadorapi.com</span></span>
            </div>
            <button
              type="submit"
              disabled={saving || (!apiKey && !hasKey)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Tester Section */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
              <Search className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Probador de Consulta (Cédulas y RUCs)</h3>
              <p className="text-[11px] text-slate-500">Prueba la consulta de Cédulas (10 dígitos) o RUCs (13 dígitos) en tiempo real</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={testCedula}
              maxLength={13}
              onChange={(e) => setTestCedula(e.target.value.replace(/\D/g, ''))}
              placeholder="Ingresa Cédula (10 dígitos) o RUC (13 dígitos, ej. 1790012345001)"
              className="w-full pl-3 pr-3 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 bg-white"
            />
          </div>
          <button
            type="button"
            onClick={handleTestLookup}
            disabled={testing || !testCedula || (testCedula.length !== 10 && testCedula.length !== 13)}
            className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Consultando...
              </>
            ) : (
              <>
                <UserCheck className="w-3.5 h-3.5" /> Consultar {testCedula.length === 13 ? 'RUC' : 'Cédula'}
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

        {testResult && (
          <div className="p-4 rounded-xl bg-white border border-teal-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-teal-800 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" /> Datos Obtenidos Exitosamente
              </span>
              <span className="text-[10px] font-mono bg-teal-50 text-teal-700 px-2 py-0.5 rounded font-semibold">
                ID: {testResult.id || testCedula}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-0.5 sm:col-span-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {testResult.business_name ? 'Razón Social / Empresa' : 'Nombre Completo'}
                </span>
                <p className="font-bold text-slate-900 truncate">
                  {testResult.business_name || testResult.full_name || testResult.fullName || 'N/A'}
                </p>
              </div>

              {testResult.trade_name && (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nombre Comercial</span>
                  <p className="font-semibold text-slate-800 truncate">{testResult.trade_name}</p>
                </div>
              )}

              {testResult.taxpayer_type && (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo de Contribuyente</span>
                  <p className="font-semibold text-slate-800 truncate">{testResult.taxpayer_type}</p>
                </div>
              )}

              {testResult.first_name && (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nombres</span>
                  <p className="font-semibold text-slate-800 truncate">{testResult.first_name}</p>
                </div>
              )}

              {testResult.last_name && (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Apellidos</span>
                  <p className="font-semibold text-slate-800 truncate">{testResult.last_name}</p>
                </div>
              )}

              {testResult.address && (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-0.5 sm:col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dirección Fiscal / Matriz</span>
                  <p className="font-medium text-slate-800 truncate">{testResult.address}</p>
                </div>
              )}

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado de Registro</span>
                <p className="font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {testResult.status || 'Verificado por Ecuador API'}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <details className="text-[10px] text-slate-500">
                <summary className="cursor-pointer font-semibold text-slate-600 hover:text-slate-800">
                  Ver respuesta JSON cruda
                </summary>
                <pre className="mt-2 p-2.5 rounded-lg bg-slate-900 text-emerald-400 font-mono overflow-x-auto text-[11px]">
                  {JSON.stringify({ data: testResult, error: null, message: null }, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

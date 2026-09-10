import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Key,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  Power,
  Save,
  X,
  Play,
  Cpu,
  Sliders,
  Check,
  Zap,
  HelpCircle,
  BrainCircuit,
  Layers,
  Mail,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { GoogleAiConfig } from '../types.ts';

interface GoogleAiConfigModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onConfigSaved?: () => void;
  embedded?: boolean;
}

const PRESET_MESSAGES = [
  {
    label: '👟 Calzado Deportivo',
    text: `🔥 LLEGÓ LOTE EXCLUSIVO ZAPATILLAS NIKE AIR ZOOM PEGASUS 40
Tallas del 38 al 44
Precio por unidad: $45.00
Precio por mayor (a partir de 6 pares): $38.00
Stock disponible: 25 pares
Colores: Negro con blanco, azul marino, gris
Calidad 1.1 importada con caja original y etiquetas`,
  },
  {
    label: '⌚ Smartwatch T500',
    text: `⚡ NUEVO SMARTWATCH RELOJ INTELIGENTE T500 PRO SERIE 8
Pantalla táctil HD, mide ritmo cardíaco, oxímetro, llamadas Bluetooth.
Costo mayorista: $14.50 c/u
Costo por unidad muestra: $18.00
Lote de 50 unidades en stock
Colores: Negro, Rosa y Plata`,
  },
  {
    label: '👗 Ropa y Moda',
    text: `✨ CASACAS TÉRMICAS IMPERMEABLES UNISEX NORTH FACE
Costo mayorista: $28.00
Precio sugerido venta: $49.99
Disponibles 15 unidades en colores negro y verde militar
Material impermeable con forro polar interior`,
  },
];

export const GoogleAiConfigModal: React.FC<GoogleAiConfigModalProps> = ({
  isOpen = true,
  onClose,
  onConfigSaved,
  embedded = false,
}) => {
  const { authFetch, user } = useAuth();
  const [provider, setProvider] = useState<'google' | 'lmstudio'>('google');
  const [localEndpoint, setLocalEndpoint] = useState('http://localhost:1234/v1');
  const [localModelName, setLocalModelName] = useState('qwen2.5-coder-7b-instruct');
  const [apiKey, setApiKey] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [modelName, setModelName] = useState('gemini-3.6-flash');
  const [temperature, setTemperature] = useState(0.2);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [togglingActive, setTogglingActive] = useState(false);
  const [toggleFeedback, setToggleFeedback] = useState<string | null>(null);

  const prevIsOpenRef = useRef(false);

  const [loadingConfig, setLoadingConfig] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [testingLmStudio, setTestingLmStudio] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);
  const [lmStudioResult, setLmStudioResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    availableModels?: string[];
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Playground state
  const [playgroundText, setPlaygroundText] = useState(PRESET_MESSAGES[0].text);
  const [testingExtraction, setTestingExtraction] = useState(false);
  const [extractionResult, setExtractionResult] = useState<any | null>(null);

  useEffect(() => {
    const isNowOpen = Boolean(isOpen || embedded);
    const becameOpen = isNowOpen && !prevIsOpenRef.current;
    prevIsOpenRef.current = isNowOpen;

    if (becameOpen) {
      fetchCurrentConfig();
      setSavedSuccess(false);
      setTestResult(null);
      setLmStudioResult(null);
      setError(null);
      setExtractionResult(null);
      setToggleFeedback(null);
    }
  }, [isOpen, embedded]);

  const fetchCurrentConfig = async () => {
    setLoadingConfig(true);
    try {
      const res = await authFetch('/api/ai/config');
      if (res.ok) {
        const data: GoogleAiConfig = await res.json();
        if (data.provider) {
          setProvider(data.provider);
        }
        if (data.localEndpoint) {
          setLocalEndpoint(data.localEndpoint);
        }
        if (data.localModelName) {
          setLocalModelName(data.localModelName);
        }
        if (data.apiKey) {
          setApiKey(data.apiKey);
        }
        if (data.modelName) {
          setModelName(data.modelName);
        }
        if (typeof data.temperature === 'number') {
          setTemperature(data.temperature);
        }
        if (typeof data.isActive === 'boolean') {
          setIsActive(data.isActive);
        }
        if (data.accountEmail) {
          setAccountEmail(data.accountEmail);
        } else if (user?.email) {
          setAccountEmail(user.email);
        }
      }
    } catch (err) {
      console.warn('Error fetching AI config:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  if (!isOpen) return null;

  const handleTestApiKey = async () => {
    if (!apiKey.trim()) {
      setError('Por favor ingresa primero una clave API para verificar.');
      return;
    }

    setTestingKey(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await fetch('/api/ai/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          modelName,
        }),
      });

      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message || (data.success ? 'Conexión exitosa' : 'Error al conectar'),
        latencyMs: data.latencyMs,
      });

      if (!data.success) {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión al probar la API Key');
      setTestResult({
        success: false,
        message: 'No se pudo contactar el servidor para validar la clave',
      });
    } finally {
      setTestingKey(false);
    }
  };

  const handleTestLmStudio = async () => {
    setTestingLmStudio(true);
    setLmStudioResult(null);
    setError(null);

    try {
      const res = await fetch('/api/ai/test-lmstudio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localEndpoint: localEndpoint.trim(),
          localModelName: localModelName.trim(),
        }),
      });

      const data = await res.json();
      setLmStudioResult({
        success: data.success,
        message: data.message || (data.success ? 'Conexión exitosa' : 'Error de conexión'),
        latencyMs: data.latencyMs,
        availableModels: data.availableModels,
      });

      if (data.availableModels && data.availableModels.length > 0 && !localModelName.trim()) {
        setLocalModelName(data.availableModels[0]);
      }

      if (!data.success) {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión con LM Studio local');
      setLmStudioResult({
        success: false,
        message: 'No se pudo conectar con el servidor local de LM Studio',
      });
    } finally {
      setTestingLmStudio(false);
    }
  };

  const handleClearApiKey = async () => {
    if (!confirm('¿Estás seguro de que deseas desconectar la API Key de Google Gemini?')) return;
    setApiKey('');
    setTestResult(null);
    setError(null);
    try {
      await authFetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: '',
          modelName,
          temperature,
          isActive: false,
          provider: 'google',
        }),
      });
      setIsActive(false);
      if (onConfigSaved) onConfigSaved();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleActive = async () => {
    const nextStatus = !isActive;
    setIsActive(nextStatus);
    setTogglingActive(true);
    setToggleFeedback(null);
    setError(null);

    try {
      const res = await authFetch('/api/ai/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        setIsActive(!nextStatus);
        throw new Error(data.error || 'Error al cambiar estado de la IA');
      }

      setToggleFeedback(
        nextStatus
          ? '¡Motor de Inteligencia Artificial activado en tiempo real!'
          : 'Motor de Inteligencia Artificial en pausa. Se utilizarán reglas locales.'
      );
      if (onConfigSaved) onConfigSaved();
      setTimeout(() => setToggleFeedback(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Error al actualizar el estado de la IA');
    } finally {
      setTogglingActive(false);
    }
  };

  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedSuccess(false);

    try {
      const res = await authFetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          accountEmail: accountEmail.trim() || user?.email || 'jrmr93@gmail.com',
          modelName,
          temperature: Number(temperature),
          isActive: Boolean(isActive),
          provider,
          localEndpoint: localEndpoint.trim(),
          localModelName: localModelName.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al guardar la configuración de IA');
      }

      setSavedSuccess(true);
      if (onConfigSaved) onConfigSaved();
      setTimeout(() => {
        setSavedSuccess(false);
      }, 3500);
    } catch (err: any) {
      setError(err.message || 'Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleTestExtraction = async () => {
    if (!playgroundText.trim()) {
      setError('Escribe o selecciona un mensaje de prueba para extraer.');
      return;
    }

    setTestingExtraction(true);
    setExtractionResult(null);
    setError(null);

    try {
      const res = await authFetch('/api/ai/test-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: playgroundText.trim(),
          marginPercent: 35,
          currency: 'USD',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al procesar la extracción');
      }

      setExtractionResult(data.result);
    } catch (err: any) {
      setError(err.message || 'Error al ejecutar extracción de prueba');
    } finally {
      setTestingExtraction(false);
    }
  };

  if (!embedded && !isOpen) return null;

  if (embedded) {
    return (
      <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1 pb-4">
          {/* Header bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  Configuración de Google Gemini AI
                  <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    Google AI Studio
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Extracción inteligente de productos, fotos, costos múltiples y categorías mediante IA.
                </p>
              </div>
            </div>
          </div>

        {/* Info Banner */}
        <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/80 text-xs text-slate-700 space-y-2.5">
          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-amber-600" />
            ¿Cómo obtener o actualizar tu clave API de Google Gemini?
          </div>
          <ol className="list-decimal pl-4 space-y-1 text-slate-600">
            <li>
              Ingresa a Google AI Studio con tu cuenta de Google.
            </li>
            <li>
              Genera tu clave en{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-amber-700 underline font-semibold inline-flex items-center gap-1"
              >
                aistudio.google.com/app/apikey <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li>
              Pégala a continuación y presiona <strong>"Guardar Configuración"</strong>.
            </li>
          </ol>
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-4">
          {/* AI Activation Switch */}
          <div className={`p-4 rounded-2xl border transition-all ${
            isActive 
              ? 'bg-purple-50/70 border-purple-200' 
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold transition-colors ${
                  isActive ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-500'
                }`}>
                  <Power className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      Activar/Desactivar IA
                    </span>
                    <span className={`inline-flex items-center text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      isActive 
                        ? 'bg-purple-100 text-purple-800 border border-purple-300' 
                        : 'bg-slate-200 text-slate-700 border border-slate-300'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full mr-1 ${isActive ? 'bg-purple-500 animate-pulse' : 'bg-slate-400'}`} />
                      {isActive ? 'IA ACTIVADA' : 'IA DESACTIVADA'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isActive 
                      ? 'El motor de Gemini está activo para extracción automática de productos, copys y descripciones.' 
                      : 'La IA del sistema está en pausa. Se usarán únicamente reglas y expresiones regulares locales.'}
                  </p>
                </div>
              </div>

              {/* Switch button with instant persistence */}
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  role="switch"
                  aria-checked={isActive}
                  disabled={togglingActive}
                  onClick={handleToggleActive}
                  className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 ${
                    isActive ? 'bg-purple-600' : 'bg-slate-300'
                  }`}
                  title={isActive ? 'Clic para pausar la IA' : 'Clic para activar la IA'}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      isActive ? 'translate-x-7' : 'translate-x-0'
                    }`}
                  />
                </button>
                {togglingActive && (
                  <span className="text-[10px] text-slate-400 font-medium animate-pulse flex items-center gap-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> Guardando...
                  </span>
                )}
              </div>
            </div>

            {/* Instant feedback notification */}
            {toggleFeedback && (
              <div className="mt-3 pt-2.5 border-t border-purple-200/70 flex items-center justify-between text-xs font-semibold text-purple-900 animate-fadeIn">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>{toggleFeedback}</span>
                </div>
                <span className="text-[10px] text-purple-700 uppercase tracking-wider font-bold bg-purple-100 px-2 py-0.5 rounded-md">
                  Auto-guardado
                </span>
              </div>
            )}
          </div>

          {/* AI Provider Selection */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Proveedor de Inteligencia Artificial
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setProvider('google')}
                className={`flex items-start p-3.5 rounded-xl border transition-all text-left cursor-pointer ${
                  provider === 'google'
                    ? 'bg-amber-50/80 border-amber-400 ring-2 ring-amber-400/20 text-slate-900'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold mr-3 shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
                    Google Gemini
                    <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      Nube API
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    API en la nube de Google. Alta velocidad y cotización de mercado.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setProvider('lmstudio')}
                className={`flex items-start p-3.5 rounded-xl border transition-all text-left cursor-pointer ${
                  provider === 'lmstudio'
                    ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-400/20 text-slate-900'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold mr-3 shrink-0">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
                    LM Studio (IA Local)
                    <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      $0.00 Gratis
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Ejecuta modelos en tu propia PC. 100% privado y sin costo.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Conditional Config: LM Studio Local vs Google Gemini */}
          {provider === 'lmstudio' ? (
            <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-emerald-200/70 pb-3">
                <label className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-700" />
                  Servidor Local de LM Studio
                </label>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Compatibilidad OpenAI Local
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    URL Endpoint Local *
                  </label>
                  <input
                    type="text"
                    value={localEndpoint}
                    onChange={(e) => setLocalEndpoint(e.target.value)}
                    placeholder="http://localhost:1234/v1"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-500 bg-white"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Inicia el servidor local en LM Studio (puerto por defecto: 1234).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Modelo Local Cargado
                  </label>
                  <input
                    type="text"
                    value={localModelName}
                    onChange={(e) => setLocalModelName(e.target.value)}
                    placeholder="qwen2.5-coder-7b-instruct o local-model"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-500 bg-white"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Nombre o ID del modelo activo en LM Studio.
                  </p>
                </div>
              </div>

              {/* Test LM Studio Button */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleTestLmStudio}
                  disabled={testingLmStudio || !localEndpoint.trim()}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {testingLmStudio ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 text-white" />
                  )}
                  <span>Probar Conexión con LM Studio</span>
                </button>

                {lmStudioResult && (
                  <span
                    className={`text-xs font-bold flex items-center gap-1.5 ${
                      lmStudioResult.success ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {lmStudioResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    {lmStudioResult.message}{' '}
                    {lmStudioResult.latencyMs ? `(${lmStudioResult.latencyMs}ms)` : ''}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Key className="w-4 h-4 text-amber-600" />
                  Gemini API Key *
                </label>
              </div>

              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setTestResult(null);
                    setError(null);
                  }}
                  placeholder="AQ... o AIzaSy..."
                  className="w-full pl-3 pr-20 py-2.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
                <div className="absolute right-2 top-2 flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded transition cursor-pointer"
                    title={showKey ? 'Ocultar' : 'Mostrar'}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Test Key Button */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleTestApiKey}
                  disabled={testingKey || !apiKey.trim()}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {testingKey ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 text-amber-600" />
                  )}
                  <span>Probar y Validar API Key</span>
                </button>

                {testResult && (
                  <span
                    className={`text-xs font-bold flex items-center gap-1.5 ${
                      testResult.success ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    {testResult.message}{' '}
                    {testResult.latencyMs ? `(${testResult.latencyMs}ms)` : ''}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Account Association */}
          {provider === 'google' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs">
              <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Mail className="w-4 h-4 text-purple-600" />
                Cuenta de Google asociada
              </label>
              <p className="text-xs text-slate-500 leading-relaxed">
                Indica la cuenta de Google / correo electrónico a la que pertenece esta clave API de Gemini. Se mostrará en el encabezado superior para identificar fácilmente la cuenta en uso.
              </p>
              <input
                type="email"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                placeholder={user?.email || 'jrmr93@gmail.com'}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-purple-500 focus:bg-white transition"
              />
            </div>
          )}

          {/* Model & Parameters */}
          {provider === 'google' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
                Modelo y Parámetros
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Modelo de Gemini
                  </label>
                  <select
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                  >
                    <option value="gemini-3.6-flash">gemini-3.6-flash (Recomendado - Ultra Rápido & Alta Inteligencia)</option>
                    <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Ligero & Eficiente)</option>
                    <option value="gemini-flash-latest">gemini-flash-latest (Última versión Flash)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      Temperatura ({temperature})
                    </label>
                    <span className="text-[10px] text-slate-500">Baja = Mayor precisión</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Interactive Playground for Testing */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-amber-600" />
                Probador Interactivo de Extracción
              </h4>
              <span className="text-[11px] text-slate-500">Prueba cómo Gemini procesa mensajes reales</span>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-2">
              {PRESET_MESSAGES.map((msg, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPlaygroundText(msg.text)}
                  className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition cursor-pointer"
                >
                  {msg.label}
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              value={playgroundText}
              onChange={(e) => setPlaygroundText(e.target.value)}
              placeholder="Pega un mensaje de proveedor aquí para probar la extracción..."
              className="w-full p-3 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:border-amber-500"
            />

            <button
              type="button"
              onClick={handleTestExtraction}
              disabled={testingExtraction || !playgroundText.trim()}
              className="px-4 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-xs flex items-center space-x-1.5 transition disabled:opacity-50 cursor-pointer"
            >
              {testingExtraction ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-amber-950" />
              )}
              <span>Probar Extracción con Gemini</span>
            </button>

            {extractionResult && (
              <div className="p-3.5 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono space-y-1.5 mt-3 overflow-x-auto">
                <div className="text-amber-400 font-bold">Resultado de Extracción:</div>
                <div><strong>Nombre:</strong> {extractionResult.name}</div>
                <div><strong>Categoría:</strong> {extractionResult.category}</div>
                <div><strong>Costo Extraído:</strong> ${extractionResult.costPrice} | <strong>Venta:</strong> ${extractionResult.salePrice}</div>
                <div><strong>Stock:</strong> {extractionResult.stock}</div>
                <div><strong>Tags:</strong> {Array.isArray(extractionResult.tags) ? extractionResult.tags.join(', ') : extractionResult.tags}</div>
              </div>
            )}
          </div>

          {savedSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Configuración de Google Gemini AI guardada con éxito.</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl">
              {error}
            </div>
          )}
        </form>
        </div>

        {/* Footer Fijo en la parte inferior */}
        <div className="shrink-0 pt-3 pb-2 px-3 sm:px-4 bg-white border-t border-slate-200 sticky bottom-0 z-20 flex items-center justify-between gap-3 shadow-md rounded-b-xl">
          <div className="flex items-center space-x-2 min-w-0">
            {savedSuccess ? (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5 truncate">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ¡Ajustes de IA guardados con éxito!
              </span>
            ) : error ? (
              <span className="text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200 flex items-center gap-1.5 truncate">
                <X className="w-4 h-4 text-rose-600 shrink-0" />
                {error}
              </span>
            ) : (
              <span className="text-xs text-slate-500 font-medium truncate hidden sm:inline">
                Guarda la API Key de Google Gemini y el modelo deseado.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => handleSaveConfig()}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50 shrink-0 active:scale-95"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : <Save className="w-4 h-4 text-slate-950" />}
            <span>{saving ? 'Guardando...' : 'Guardar Configuración IA'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      id="google-ai-config-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div
        id="google-ai-config-modal-card"
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] my-auto animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 tracking-wide">
                  Configuración de Google Gemini AI
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  Google AI Studio
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Extracción inteligente de productos, fotos, costos múltiples y categorías
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Info Banner */}
          <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/80 text-xs text-slate-700 space-y-2.5">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-amber-600" />
              ¿Cómo obtener o actualizar tu clave API de Google Gemini?
            </div>
            <ol className="list-decimal pl-4 space-y-1 text-slate-600">
              <li>
                Ingresa a Google AI Studio con tu cuenta de Google.
              </li>
              <li>
                Genera tu clave en{' '}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-700 hover:text-amber-900 underline font-medium inline-flex items-center gap-1"
                >
                  aistudio.google.com/app/apikey
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                Pega tu <strong>API Key</strong> abajo, selecciona el modelo y haz clic en{' '}
                <strong className="text-slate-900">"Guardar Configuración"</strong>.
              </li>
            </ol>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            {/* AI Activation Switch */}
            <div className={`p-4 rounded-2xl border transition-all ${
              isActive 
                ? 'bg-purple-50/70 border-purple-200' 
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold transition-colors ${
                    isActive ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-500'
                  }`}>
                    <Power className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        Activar/Desactivar IA
                      </span>
                      <span className={`inline-flex items-center text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        isActive 
                          ? 'bg-purple-100 text-purple-800 border border-purple-300' 
                          : 'bg-slate-200 text-slate-700 border border-slate-300'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1 ${isActive ? 'bg-purple-500 animate-pulse' : 'bg-slate-400'}`} />
                        {isActive ? 'IA ACTIVADA' : 'IA DESACTIVADA'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isActive 
                        ? 'El motor de Gemini está activo para extracción automática de productos, copys y descripciones.' 
                        : 'La IA del sistema está en pausa. Se usarán únicamente reglas y expresiones regulares locales.'}
                    </p>
                  </div>
                </div>

                {/* Switch button */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={isActive}
                  onClick={() => setIsActive(!isActive)}
                  className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                    isActive ? 'bg-purple-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      isActive ? 'translate-x-7' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* API Key Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-600" />
                  Google Gemini API Key
                </label>
              </div>
              <div className="flex space-x-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AQ... o AIzaSy..."
                    disabled={loadingConfig}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3.5 pr-10 py-2.5 text-sm text-slate-900 font-mono focus:outline-none focus:border-amber-500 focus:bg-white transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer transition"
                    title={showKey ? 'Ocultar clave' : 'Ver clave'}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleTestApiKey}
                  disabled={testingKey || !apiKey.trim()}
                  className="px-4 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer shadow-2xs active:scale-95"
                >
                  {testingKey ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 text-amber-600" />
                  )}
                  <span>Probar Conexión</span>
                </button>
              </div>

              {/* Test Result Feedback */}
              {testResult && (
                <div
                  className={`mt-2.5 p-3 rounded-xl border flex items-center justify-between text-xs transition ${
                    testResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                  {testResult.latencyMs !== undefined && testResult.latencyMs > 0 && (
                    <span className="font-mono text-[11px] opacity-80 shrink-0 ml-2">
                      {testResult.latencyMs}ms
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Account Association */}
            {provider === 'google' && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-purple-600" />
                  Cuenta de Google asociada a la clave
                </label>
                <input
                  type="email"
                  value={accountEmail}
                  onChange={(e) => setAccountEmail(e.target.value)}
                  placeholder={user?.email || 'jrmr93@gmail.com'}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:border-purple-500 transition"
                />
                <p className="text-[11px] text-slate-500">
                  Se muestra en el panel superior para saber qué cuenta de Google es dueña de la API Key.
                </p>
              </div>
            )}

            {/* Model & Parameters Grid */}
            {provider === 'google' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                {/* Model selection */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-sky-600" />
                    Modelo de Gemini
                  </label>
                  <div className="space-y-1.5">
                    {[
                      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash (Recomendado)', tag: 'Oficial Google, rápido y de alta precisión' },
                      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite (Ultra Rápido)', tag: 'Mínima latencia (<1s), ideal para alto volumen' },
                      { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', tag: 'Última versión estable general de Flash' },
                    ].map((m) => (
                      <label
                        key={m.id}
                        onClick={() => setModelName(m.id)}
                        className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition ${
                          modelName === m.id
                            ? 'bg-amber-50 border-amber-300 text-amber-900'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/70'
                        }`}
                      >
                        <input
                          type="radio"
                          name="geminiModel"
                          checked={modelName === m.id}
                          onChange={() => setModelName(m.id)}
                          className="mt-0.5 text-amber-600 focus:ring-0"
                        />
                        <div>
                          <div className="font-semibold text-slate-900">{m.name}</div>
                          <div className="text-[11px] text-slate-500">{m.tag}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Temperature & Instructions */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-purple-600" />
                        Temperatura (Creatividad / Precisión)
                      </label>
                      <span className="text-xs font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                        {temperature}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                      <span>0.0 (Estricto / Preciso)</span>
                      <span className="text-amber-800 font-medium">0.2 (Óptimo)</span>
                      <span>1.0 (Creativo)</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-600 space-y-1">
                    <div className="font-semibold text-slate-900 flex items-center gap-1">
                      <BrainCircuit className="w-3 h-3 text-emerald-600" />
                      Capacidad Multimodal Activa
                    </div>
                    <p className="text-slate-500">
                      Procesa mensajes de texto y hasta 5 fotos en alta resolución simultáneamente para reconocer marcas, tallas y especificaciones.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Live Playground / Tester */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-xs font-semibold text-slate-900">
                    Probador de Extracción en Vivo
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_MESSAGES.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPlaygroundText(preset.text)}
                      className="px-2 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-700 text-[11px] border border-slate-200 transition cursor-pointer shadow-2xs"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                rows={3}
                value={playgroundText}
                onChange={(e) => setPlaygroundText(e.target.value)}
                placeholder="Pega un mensaje de proveedor aquí para probar la extracción..."
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-900 font-mono focus:outline-none focus:border-amber-500 resize-none shadow-inner"
              />

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  Prueba la extracción en tiempo real usando tu modelo y clave actual.
                </span>
                <button
                  type="button"
                  onClick={handleTestExtraction}
                  disabled={testingExtraction || !playgroundText.trim()}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-xs font-semibold text-slate-900 transition flex items-center space-x-1.5 disabled:opacity-50 shadow-xs cursor-pointer active:scale-95"
                >
                  {testingExtraction ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  <span>Probar Extracción IA</span>
                </button>
              </div>

              {/* Extraction result viewer */}
              {extractionResult && (
                <div className="mt-3 p-3.5 rounded-xl bg-white border border-amber-300 space-y-2.5 animate-in fade-in duration-200 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="font-bold text-xs text-amber-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Resultado de Extracción IA
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Confianza: {extractionResult.confidenceScore}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Producto</span>
                      <span className="font-semibold text-slate-900 truncate block">
                        {extractionResult.name}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Categoría</span>
                      <span className="font-semibold text-sky-700 truncate block">
                        {extractionResult.category}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Costo / Venta</span>
                      <span className="font-semibold text-emerald-700 font-mono block">
                        ${extractionResult.costPrice?.toFixed(2)} → ${extractionResult.salePrice?.toFixed(2)}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Stock Detectado</span>
                      <span className="font-semibold text-amber-800 font-mono block">
                        {extractionResult.stock} unds
                      </span>
                    </div>
                  </div>

                  {extractionResult.costOptions && extractionResult.costOptions.length > 1 && (
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px]">
                      <span className="text-slate-700 font-semibold block mb-1">
                        Múltiples opciones de costo detectadas:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {extractionResult.costOptions.map((opt: any, i: number) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-white text-slate-800 border border-slate-200 font-mono text-[10px]"
                          >
                            {opt.label}: ${opt.price?.toFixed(2)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{error}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-rose-600 hover:text-rose-900 ml-2 font-bold"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Success Message */}
            {savedSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center space-x-2 animate-in fade-in duration-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">
                  ¡Configuración de Google Gemini AI guardada y aplicada con éxito!
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 bg-slate-50 border border-slate-200 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-300 transition shadow-xs flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer active:scale-95"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-900" />
                ) : (
                  <Save className="w-3.5 h-3.5 text-slate-900" />
                )}
                <span>Guardar Configuración</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

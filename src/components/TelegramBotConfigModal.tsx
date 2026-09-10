import React, { useState, useEffect, useRef } from 'react';
import { safeLocalStorage } from '../utils/safeStorage.ts';
import {
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  HelpCircle,
  Key,
  Layers,
  Link,
  Loader2,
  Power,
  Radio,
  RefreshCw,
  Save,
  Send,
  Shield,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { TelegramConfig } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface TelegramBotConfigModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  config: TelegramConfig | null;
  onConfigSaved: () => void;
  embedded?: boolean;
}

export const TelegramBotConfigModal: React.FC<TelegramBotConfigModalProps> = ({
  isOpen = true,
  onClose,
  config,
  onConfigSaved,
  embedded = false,
}) => {
  const { authFetch } = useAuth();
  const [botToken, setBotToken] = useState(config?.botToken || '');
  const [showToken, setShowToken] = useState(false);
  const [supplierName, setSupplierName] = useState(config?.supplierName || 'Proveedor Telegram');
  const [defaultMarginPercent, setDefaultMarginPercent] = useState(
    config?.defaultMarginPercent || 35
  );
  const [taxPercent, setTaxPercent] = useState(config?.taxPercent ?? 15);
  const [currency, setCurrency] = useState(config?.currency || 'USD');
  const [isActive, setIsActive] = useState<boolean>(config?.isActive ?? true);
  const [togglingActive, setTogglingActive] = useState(false);
  const [toggleFeedback, setToggleFeedback] = useState<string | null>(null);

  const prevIsOpenRef = useRef(false);

  const [testingBot, setTestingBot] = useState(false);
  const [syncingUpdates, setSyncingUpdates] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [botInfo, setBotInfo] = useState<{ id: number; first_name: string; username: string } | null>(
    null
  );
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Sync from config ONLY when modal is opened or on embedded view initial mount
  useEffect(() => {
    const isNowOpen = Boolean(isOpen || embedded);
    const becameOpen = isNowOpen && !prevIsOpenRef.current;
    prevIsOpenRef.current = isNowOpen;

    if (becameOpen) {
      const initialToken = config?.botToken || safeLocalStorage.getItem('cached_tg_bot_token') || '';
      setBotToken(initialToken);
      setSupplierName(config?.supplierName || 'Proveedor Telegram');
      setDefaultMarginPercent(config?.defaultMarginPercent || 35);
      setTaxPercent(config?.taxPercent ?? 15);
      setCurrency(config?.currency || 'USD');
      setIsActive(config?.isActive ?? true);
      setError(null);
      setSyncMessage(null);
      setSavedSuccess(false);
      setToggleFeedback(null);

      // If token already exists, perform silent connection check
      if (initialToken.trim()) {
        handleTestToken(initialToken.trim(), false);
      }
    }
  }, [isOpen, embedded]);

  if (!embedded && !isOpen) return null;

  const currentAppUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const webhookUrl = `${currentAppUrl}/api/telegram/webhook`;

  const handleTestToken = async (tokenToTest: string, showErrors = true) => {
    if (!tokenToTest.trim()) {
      if (showErrors) setError('Introduce primero el token de tu bot de Telegram');
      return;
    }

    setTestingBot(true);
    setError(null);
    try {
      const res = await fetch('/api/telegram/test-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: tokenToTest.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Token inválido');
      }

      setBotInfo(data.bot);
      if (showErrors) {
        setSyncMessage(`✅ Conexión exitosa con @${data.bot.username} (${data.bot.first_name})`);
      }
    } catch (err: any) {
      if (showErrors) {
        setError(err.message || 'Error al conectar con Telegram API');
      }
      setBotInfo(null);
    } finally {
      setTestingBot(false);
    }
  };

  const handleTestBot = async (showErrors = true) => {
    return handleTestToken(botToken, showErrors);
  };

  const handleClearToken = async () => {
    if (!confirm('¿Estás seguro de que deseas desconectar el bot de Telegram?')) return;
    setBotToken('');
    setBotInfo(null);
    setError(null);
    setSyncMessage(null);
    safeLocalStorage.removeItem('cached_tg_bot_token');
    try {
      await authFetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: '',
          supplierName,
          defaultMarginPercent: Number(defaultMarginPercent),
          taxPercent: Number(taxPercent) || 15,
          currency,
          autoApprove: true,
          defaultStockEnabled: true,
          defaultStockQuantity: 0,
          isActive: false,
        }),
      });
      setIsActive(false);
      onConfigSaved();
      setSyncMessage('Bot desconectado correctamente.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleSyncUpdatesNow = async () => {
    if (!botToken.trim()) {
      setError('Configura tu token primero para sincronizar mensajes.');
      return;
    }

    setSyncingUpdates(true);
    setSyncMessage(null);
    setError(null);

    try {
      const res = await authFetch('/api/telegram/sync-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: botToken.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al sincronizar con Telegram');
      }

      if (data.updatesFound > 0) {
        setSyncMessage(`🎉 ¡Se recibieron y procesaron ${data.updatesFound} mensaje(s) nuevos!`);
      } else {
        setSyncMessage('✅ Sincronizado. No hay mensajes nuevos pendientes en Telegram.');
      }
      onConfigSaved();
    } catch (err: any) {
      setError(err.message || 'Error al comprobar mensajes');
    } finally {
      setSyncingUpdates(false);
    }
  };

  const handleSetWebhook = async () => {
    if (!botToken.trim()) {
      setError('Debes configurar un token de Bot primero');
      return;
    }

    setSettingWebhook(true);
    setError(null);
    setWebhookStatus(null);

    try {
      const res = await authFetch('/api/telegram/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: botToken.trim() }),
      });

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Error al configurar webhook');
      }

      setWebhookStatus(`¡Webhook conectado con éxito a: ${data.webhookUrl}!`);
      onConfigSaved();
    } catch (err: any) {
      setError(err.message || 'No se pudo registrar el webhook con Telegram');
    } finally {
      setSettingWebhook(false);
    }
  };

  const handleToggleActive = async () => {
    const nextStatus = !isActive;
    setIsActive(nextStatus);
    setTogglingActive(true);
    setToggleFeedback(null);
    setError(null);

    try {
      const res = await authFetch('/api/telegram/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        // Rollback on failure
        setIsActive(!nextStatus);
        throw new Error(data.error || 'Error al cambiar estado del bot');
      }

      setToggleFeedback(
        nextStatus
          ? '¡Bot activado en tiempo real! Escuchando mensajes...'
          : 'Bot pausado. No procesará nuevos mensajes.'
      );
      if (onConfigSaved) onConfigSaved();
      setTimeout(() => setToggleFeedback(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Error al actualizar el estado del bot');
    } finally {
      setTogglingActive(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedSuccess(false);

    try {
      const trimmedToken = botToken.trim();
      if (trimmedToken) {
        safeLocalStorage.setItem('cached_tg_bot_token', trimmedToken);
      } else {
        safeLocalStorage.removeItem('cached_tg_bot_token');
      }

      const res = await authFetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: trimmedToken,
          supplierName,
          defaultMarginPercent: Number(defaultMarginPercent),
          taxPercent: Number(taxPercent) || 15,
          currency,
          autoApprove: true,
          defaultStockEnabled: true,
          defaultStockQuantity: 0,
          isActive: Boolean(isActive),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar la configuración');
      }

      setSavedSuccess(true);
      onConfigSaved();

      // Trigger a verification in the background
      if (trimmedToken) {
        handleTestToken(trimmedToken, false);
      }

      // DO NOT close modal on save - keep modal open as requested
      setTimeout(() => {
        setSavedSuccess(false);
      }, 4000);
    } catch (err: any) {
      setError(err.message || 'Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (embedded) {
    return (
      <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1 pb-4">
          {/* Header banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  Configuración del Bot de Telegram
                  <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Radio className="w-2.5 h-2.5 mr-1 animate-pulse text-emerald-600" />
                    Tiempo Real
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Vincula tu bot de Telegram para recibir fotos, descripciones y precios de proveedores automáticamente.
                </p>
              </div>
            </div>
          </div>

        {/* Instructions Box */}
        <div className="p-4 rounded-xl bg-sky-50/60 border border-sky-200 text-xs text-slate-700 space-y-2.5">
          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-sky-600" />
            ¿Cómo cambiar o conseguir tu API Key / Token de Telegram?
          </div>
          <ol className="list-decimal pl-4 space-y-1.5 text-slate-600">
            <li>
              Abre Telegram, habla con <strong className="text-sky-700">@BotFather</strong> y escribe <code className="bg-white px-1 py-0.5 rounded text-sky-700 border border-slate-200">/newbot</code> (o <code className="bg-white px-1 py-0.5 rounded text-sky-700 border border-slate-200">/token</code> para ver el token existente).
            </li>
            <li>
              Pega el nuevo <strong>HTTP API Token</strong> abajo y haz clic en <strong>"Guardar y Activar Token"</strong>.
            </li>
            <li>
              El sistema actualiza de forma automática la persistencia en PostgreSQL y activa el receptor de mensajes de inmediato.
            </li>
          </ol>
          <div className="pt-2 border-t border-sky-200/60 text-[11px] text-sky-800 flex items-center gap-1.5 font-medium">
            <span className="font-bold">✨ Agrupación Inteligente:</span> Puedes enviar un producto en varios mensajes sucesivos (ej: foto con precio, video y fotos adicionales). El bot espera <strong>3 segundos</strong> de inactividad para unificar todos los recursos en un solo producto.
          </div>
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-4">
          {/* Bot Activation Switch */}
          <div className={`p-4 rounded-2xl border transition-all ${
            isActive 
              ? 'bg-emerald-50/70 border-emerald-200' 
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold transition-colors ${
                  isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                }`}>
                  <Power className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      Estado del Bot de Telegram
                    </span>
                    <span className={`inline-flex items-center text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      isActive 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                        : 'bg-slate-200 text-slate-700 border border-slate-300'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full mr-1 ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                      {isActive ? 'BOT ACTIVADO' : 'BOT DESACTIVADO'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isActive 
                      ? 'El bot está escuchando mensajes y procesando catálogos automáticamente.' 
                      : 'El bot está en pausa. No procesará nuevos mensajes ni fotos de Telegram.'}
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
                  className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:opacity-50 ${
                    isActive ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                  title={isActive ? 'Clic para pausar el bot' : 'Clic para activar el bot'}
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
              <div className="mt-3 pt-2.5 border-t border-emerald-200/70 flex items-center justify-between text-xs font-semibold text-emerald-800 animate-fadeIn">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{toggleFeedback}</span>
                </div>
                <span className="text-[10px] text-emerald-600 uppercase tracking-wider font-bold bg-emerald-100/90 px-2 py-0.5 rounded-md">
                  Auto-guardado
                </span>
              </div>
            )}
          </div>

          {/* Bot Token Input */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Key className="w-4 h-4 text-sky-600" />
                Token de Telegram Bot *
              </label>
              {botInfo && (
                <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />@{botInfo.username} ({botInfo.first_name})
                </span>
              )}
            </div>

            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={botToken}
                onChange={(e) => {
                  setBotToken(e.target.value);
                  setError(null);
                  setSyncMessage(null);
                }}
                placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                className="w-full pl-3 pr-10 py-2.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
              <div className="absolute right-2 top-2 flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded transition cursor-pointer"
                  title={showToken ? 'Ocultar token' : 'Mostrar token'}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Test connection buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleTestBot(true)}
                disabled={testingBot || !botToken.trim()}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {testingBot ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span>Probar Conexión con Telegram API</span>
              </button>

              <button
                type="button"
                onClick={handleSyncUpdatesNow}
                disabled={syncingUpdates || !botToken.trim()}
                className="px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {syncingUpdates ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-sky-600" />
                )}
                <span>Sincronizar Mensajes Pendientes</span>
              </button>

              <button
                type="button"
                onClick={handleSetWebhook}
                disabled={settingWebhook || !botToken.trim()}
                className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {settingWebhook ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                ) : (
                  <Globe className="w-3.5 h-3.5 text-indigo-600" />
                )}
                <span>Activar Webhook en Vivo</span>
              </button>
            </div>

            {syncMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{syncMessage}</span>
              </div>
            )}

            {webhookStatus && (
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-800">
                {webhookStatus}
              </div>
            )}
          </div>

          {/* Supplier Name & Default Parameters */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
              Parámetros de Importación Automática
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre de Proveedor
                </label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Ej: Distribuidora Central"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Margen (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={defaultMarginPercent}
                  onChange={(e) => setDefaultMarginPercent(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  IVA Actual (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Si dice &quot;más IVA&quot;
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Moneda
                </label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          </div>

          {savedSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Configuración y Token guardados exitosamente. Bot activo.</span>
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
                ¡Token y ajustes guardados!
              </span>
            ) : error ? (
              <span className="text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200 flex items-center gap-1.5 truncate">
                <X className="w-4 h-4 text-rose-600 shrink-0" />
                {error}
              </span>
            ) : (
              <span className="text-xs text-slate-500 font-medium truncate hidden sm:inline">
                Guarda los cambios de token y parámetros del Bot de Telegram.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs shadow-md shadow-sky-500/20 transition cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50 shrink-0 active:scale-95"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{saving ? 'Guardando...' : 'Guardar y Activar Token'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Configuración del Bot de Telegram
                <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Radio className="w-3 h-3 mr-1 animate-pulse text-emerald-600" />
                  Conexión en Vivo
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Modifica el Token de tu Bot de Telegram para recibir fotos y catálogos de proveedores en tiempo real.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 py-4 space-y-5">
          {/* Instructions Box */}
          <div className="p-4 rounded-xl bg-sky-50/60 border border-sky-200 text-xs text-slate-700 space-y-2.5">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-sky-600" />
              ¿Cómo cambiar o conseguir tu API Key / Token de Telegram?
            </div>
            <ol className="list-decimal pl-4 space-y-1.5 text-slate-600">
              <li>
                Abre Telegram, habla con <strong className="text-sky-700">@BotFather</strong> y escribe <code className="bg-white px-1 py-0.5 rounded text-sky-700 border border-slate-200">/newbot</code> (o <code className="bg-white px-1 py-0.5 rounded text-sky-700 border border-slate-200">/token</code> para ver el token existente).
              </li>
              <li>
                Pega el nuevo <strong>HTTP API Token</strong> abajo y haz clic en <strong>"Guardar y Conectar"</strong>.
              </li>
              <li>
                El sistema actualiza de forma automática la persistencia en PostgreSQL y activa el receptor de mensajes de inmediato.
              </li>
            </ol>
            <div className="pt-2 border-t border-sky-200/60 text-[11px] text-sky-800 flex items-center gap-1.5 font-medium">
              <span className="font-bold">✨ Agrupación Inteligente:</span> Puedes enviar un producto en varios mensajes sucesivos (ej: foto con precio, video y fotos adicionales). El bot espera <strong>3 segundos</strong> de inactividad para unificar todos los recursos en un solo producto.
            </div>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            {/* Bot Activation Switch */}
            <div className={`p-4 rounded-2xl border transition-all ${
              isActive 
                ? 'bg-emerald-50/70 border-emerald-200' 
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold transition-colors ${
                    isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                  }`}>
                    <Power className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        Estado del Bot de Telegram
                      </span>
                      <span className={`inline-flex items-center text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        isActive 
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                          : 'bg-slate-200 text-slate-700 border border-slate-300'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1 ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        {isActive ? 'BOT ACTIVADO' : 'BOT DESACTIVADO'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isActive 
                        ? 'El bot está escuchando mensajes y procesando catálogos automáticamente.' 
                        : 'El bot está en pausa. No procesará nuevos mensajes ni fotos de Telegram.'}
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
                    className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:opacity-50 ${
                      isActive ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                    title={isActive ? 'Clic para pausar el bot' : 'Clic para activar el bot'}
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
                <div className="mt-3 pt-2.5 border-t border-emerald-200/70 flex items-center justify-between text-xs font-semibold text-emerald-800 animate-fadeIn">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{toggleFeedback}</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 uppercase tracking-wider font-bold bg-emerald-100/90 px-2 py-0.5 rounded-md">
                    Auto-guardado
                  </span>
                </div>
              )}
            </div>

            {/* Bot Token Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  Telegram Bot API Token (HTTP API Key)
                </label>
              </div>
              <div className="flex space-x-2">
                <div className="relative flex-1">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-10 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:border-sky-500 focus:bg-white transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showToken ? 'Ocultar token' : 'Ver token'}
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleTestBot(true)}
                  disabled={testingBot || !botToken.trim()}
                  className="px-3.5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700 transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  {testingBot ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Key className="w-3.5 h-3.5 text-sky-600" />
                  )}
                  <span>Verificar</span>
                </button>

                <button
                  type="button"
                  onClick={handleSyncUpdatesNow}
                  disabled={syncingUpdates || !botToken.trim()}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white transition flex items-center space-x-1.5 disabled:opacity-50 shadow-xs cursor-pointer"
                  title="Comprobar mensajes nuevos ahora"
                >
                  {syncingUpdates ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>Sincronizar</span>
                </button>
              </div>

              {/* Bot Info card & direct link */}
              {botInfo && (
                <div className="mt-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs text-emerald-800">
                    <span className="font-semibold text-slate-900">Bot Conectado y Activo:</span> {botInfo.first_name} (<span className="font-mono">@{botInfo.username}</span>)
                  </div>
                  <a
                    href={`https://t.me/${botInfo.username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition"
                  >
                    <Send className="w-3 h-3 mr-1" />
                    Abrir Chat en Telegram
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </div>
              )}

              {syncMessage && (
                <div className="mt-2 p-2.5 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-800 flex items-center justify-between">
                  <span>{syncMessage}</span>
                  <button type="button" onClick={() => setSyncMessage(null)} className="text-sky-600 hover:text-sky-900 font-bold">✕</button>
                </div>
              )}
            </div>

            {/* Webhook Connection Box (Alternative) */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-900 block">
                    URL de Webhook (Opcional si usas Polling)
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono block truncate max-w-sm">
                    {webhookUrl}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(webhookUrl)}
                    className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs transition cursor-pointer shadow-2xs"
                    title="Copiar URL"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleSetWebhook}
                    disabled={settingWebhook || !botToken}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium transition flex items-center space-x-1 disabled:opacity-50 cursor-pointer shadow-2xs"
                  >
                    {settingWebhook ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 text-sky-600" />
                    )}
                    <span>Registrar Webhook</span>
                  </button>
                </div>
              </div>

              {webhookStatus && (
                <div className="text-xs text-emerald-700 font-medium">{webhookStatus}</div>
              )}
            </div>

            {/* Business parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Margen (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="500"
                  value={defaultMarginPercent}
                  onChange={(e) => setDefaultMarginPercent(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white transition"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Calcula PVP
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  IVA Actual (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white transition"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Si dice &quot;más IVA&quot;
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Moneda
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white transition"
                >
                  <option value="USD">USD ($ - Dólares)</option>
                  <option value="EUR">EUR (€ - Euros)</option>
                  <option value="MXN">MXN ($ - Pesos Mexicanos)</option>
                  <option value="COP">COP ($ - Pesos Colombianos)</option>
                  <option value="PEN">PEN (S/ - Soles)</option>
                  <option value="ARS">ARS ($ - Pesos Argentinos)</option>
                  <option value="CLP">CLP ($ - Pesos Chilenos)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Proveedor
                </label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white transition"
                  placeholder="Ej. Proveedor Principal"
                />
              </div>
            </div>

            {savedSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Configuración y Token guardados exitosamente. Bot activo.</span>
              </div>
            )}

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl">
                {error}
              </div>
            )}

            <div className="pt-3 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition flex items-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Guardar y Activar Token</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};


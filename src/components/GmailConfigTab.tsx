import React, { useState, useEffect } from 'react';
import {
  Mail,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Save,
  Send,
  HelpCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Sparkles,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { GoogleEmailConfig } from '../types.ts';

interface GmailConfigTabProps {
  onSaved?: () => void;
}

export const GmailConfigTab: React.FC<GmailConfigTabProps> = ({ onSaved }) => {
  const { getEmailConfig, saveEmailConfig, testEmailConfig } = useAuth();

  // State for email config
  const [googleEmail, setGoogleEmail] = useState('');
  const [googleAppPassword, setGoogleAppPassword] = useState('');
  const [senderName, setSenderName] = useState('Comerxia App');
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState<number>(465);
  const [requireActivationGlobal, setRequireActivationGlobal] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [showAppPassword, setShowAppPassword] = useState(false);
  const [showHelpInstructions, setShowHelpInstructions] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Test email state
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  const fetchEmailConfiguration = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const cfg = await getEmailConfig();
      if (cfg) {
        setGoogleEmail(cfg.googleEmail || '');
        setGoogleAppPassword(cfg.googleAppPassword || '');
        setSenderName(cfg.senderName || 'Comerxia App');
        setSmtpHost(cfg.smtpHost || 'smtp.gmail.com');
        setSmtpPort(cfg.smtpPort || 465);
        setRequireActivationGlobal(Boolean(cfg.requireActivationGlobal));
        setIsConfigured(Boolean(cfg.isConfigured));
      }
    } catch (err: any) {
      console.error('Error fetching email configuration:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmailConfiguration();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!googleEmail.trim()) {
      setError('El correo de Google (Gmail) es obligatorio');
      return;
    }

    setIsSaving(true);
    try {
      const res = await saveEmailConfig({
        googleEmail: googleEmail.trim(),
        googleAppPassword: googleAppPassword.trim(),
        senderName: senderName.trim() || 'Comerxia App',
        smtpHost: smtpHost.trim() || 'smtp.gmail.com',
        smtpPort: smtpPort || 465,
        requireActivationGlobal,
      });

      if (!res.success) {
        setError(res.error || 'Error al guardar la configuración de correo');
      } else {
        setSuccess('✓ Configuración de correo Gmail guardada exitosamente en el servidor');
        setIsConfigured(Boolean(res.config?.isConfigured));
        if (onSaved) onSaved();
        setTimeout(() => {
          setSuccess(null);
        }, 4000);
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión con el servidor');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailAddress.trim()) {
      setTestResult({ success: false, error: 'Ingresa un correo destinatario para la prueba' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await testEmailConfig(testEmailAddress.trim());
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message || 'Error al enviar correo de prueba' });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-6 h-6 text-sky-600 animate-spin" />
        <span className="text-xs text-slate-500 font-medium">Cargando configuración de correo...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Mail className="w-4 h-4 text-rose-500" />
            Configuración de Correo Google (Gmail SMTP)
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Envía códigos de activación de cuenta, verificación y recuperación de contraseñas mediante Gmail o Google Workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchEmailConfiguration}
          className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
          title="Recargar configuración"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Recargar</span>
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2 font-medium">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Status Banner */}
      <div
        className={`p-4 rounded-2xl border flex items-start justify-between ${
          isConfigured
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
            : 'bg-amber-50/70 border-amber-200 text-amber-900'
        }`}
      >
        <div className="flex items-start space-x-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
              isConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            <Mail className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold">
              {isConfigured
                ? 'Servicio de Correo Google Configurado y Listo'
                : 'Configuración de Correo Google Pendiente'}
            </h3>
            <p className="text-[11px] opacity-90 mt-0.5">
              {isConfigured
                ? `Los correos de activación y recuperación de contraseña se envían a través de ${googleEmail || 'tu cuenta de Google'}.`
                : 'Configura una cuenta de Gmail para enviar códigos de activación y recuperación de contraseñas por correo.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowHelpInstructions(!showHelpInstructions)}
          className="text-xs font-bold underline flex items-center space-x-1 cursor-pointer shrink-0 ml-2 text-slate-800 hover:text-slate-950"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>{showHelpInstructions ? 'Ocultar Guía' : '¿Cómo configurar?'}</span>
        </button>
      </div>

      {/* Step by step guide */}
      {showHelpInstructions && (
        <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 text-xs space-y-2.5 shadow-md border border-slate-800 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-emerald-400 flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4" />
              <span>Cómo generar tu Contraseña de Aplicación de Google (16 caracteres)</span>
            </span>
          </div>
          <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300">
            <li>
              Accede a tu cuenta de Google en{' '}
              <a
                href="https://myaccount.google.com/security"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 underline font-semibold inline-flex items-center space-x-0.5"
              >
                <span>myaccount.google.com/security</span>
                <ExternalLink className="w-2.5 h-2.5 inline" />
              </a>
            </li>
            <li>Asegúrate de tener activada la <strong>Verificación en dos pasos (2FA)</strong>.</li>
            <li>
              Ve directamente a{' '}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 underline font-semibold inline-flex items-center space-x-0.5"
              >
                <span>Contraseñas de aplicación (App Passwords)</span>
                <ExternalLink className="w-2.5 h-2.5 inline" />
              </a>
            </li>
            <li>Escribe un nombre identificador (ej: <code>Comerxia App</code>) y presiona <strong>Crear</strong>.</li>
            <li>Copia la contraseña generada de 16 caracteres (ej: <code>abcd efgh ijkl mnop</code>) y pégala abajo.</li>
          </ol>
        </div>
      )}

      {/* Main Email Config Form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Google Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Correo de Google (Gmail / Google Workspace) *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                required
                value={googleEmail}
                onChange={(e) => setGoogleEmail(e.target.value)}
                placeholder="tu-correo@gmail.com"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-sky-500 transition"
              />
            </div>
          </div>

          {/* Google App Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Contraseña de Aplicación de Google * (16 letras)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type={showAppPassword ? 'text' : 'password'}
                value={googleAppPassword}
                onChange={(e) => setGoogleAppPassword(e.target.value)}
                placeholder="•••• •••• •••• ••••"
                className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-sky-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowAppPassword(!showAppPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showAppPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Sender Name */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Nombre del Remitente
            </label>
            <input
              type="text"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Comerxia App"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-sky-500 transition"
            />
          </div>

          {/* SMTP Host */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Servidor SMTP (Host)
            </label>
            <input
              type="text"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.gmail.com"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-sky-500 transition"
            />
          </div>

          {/* SMTP Port */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Puerto (465 SSL / 587 TLS)
            </label>
            <input
              type="number"
              value={smtpPort}
              onChange={(e) => setSmtpPort(Number(e.target.value))}
              placeholder="465"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-sky-500 transition"
            />
          </div>
        </div>

        {/* Global Require Activation Toggle */}
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-start space-x-3">
          <input
            type="checkbox"
            id="gmailRequireActivationCheckbox"
            checked={requireActivationGlobal}
            onChange={(e) => setRequireActivationGlobal(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
          />
          <label htmlFor="gmailRequireActivationCheckbox" className="text-xs text-slate-800 cursor-pointer select-none">
            <span className="font-semibold block flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
              Requerir activación obligatoria para nuevos usuarios
            </span>
            <span className="text-[11px] text-slate-500 block">
              Cuando esta opción está activa, los nuevos operadores creados deberán ingresar el código enviado a su correo electrónico antes de ingresar.
            </span>
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition flex items-center space-x-2 shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Guardando Configuración...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Guardar Configuración de Correo Gmail</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Test Email Section */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 mt-4">
        <div className="flex items-center space-x-2">
          <Send className="w-4 h-4 text-sky-600" />
          <span className="text-xs font-bold text-slate-900">Probar Envío de Correo (Test SMTP)</span>
        </div>
        <p className="text-[11px] text-slate-600">
          Envía un correo de prueba a cualquier dirección para verificar que la cuenta de Google y la contraseña de aplicación funcionan correctamente.
        </p>

        {testResult && (
          <div
            className={`p-3 rounded-xl text-xs font-medium flex items-start space-x-2 ${
              testResult.success
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-800'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <span>{testResult.message || testResult.error}</span>
          </div>
        )}

        <form onSubmit={handleTestEmail} className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            required
            value={testEmailAddress}
            onChange={(e) => setTestEmailAddress(e.target.value)}
            placeholder="ejemplo-destinatario@correo.com"
            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500 transition"
          />
          <button
            type="submit"
            disabled={isTesting || !isConfigured}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer shrink-0"
          >
            {isTesting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Enviando Prueba...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Enviar Correo de Prueba</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

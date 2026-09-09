import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  ShoppingBag,
  Database,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  UserPlus,
  Mail,
  Send,
  ArrowLeft,
  Key,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { StoreConfig } from '../types.ts';

interface AdminLoginScreenProps {
  onViewCustomerStore: () => void;
  storeConfig?: StoreConfig;
}

type ScreenMode = 'login' | 'setup' | 'activate' | 'forgot_password';

export const AdminLoginScreen: React.FC<AdminLoginScreenProps> = ({
  onViewCustomerStore,
  storeConfig,
}) => {
  const {
    login,
    setupAdmin,
    hasAdmin,
    activateAccount,
    resendActivation,
    forgotPassword,
    resetPassword,
  } = useAuth();

  const [mode, setMode] = useState<ScreenMode>('login');

  // Login & Setup Inputs
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [adminName, setAdminName] = useState<string>('Administrador Principal');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  
  // Activation Inputs
  const [activationIdentifier, setActivationIdentifier] = useState<string>('');
  const [activationCode, setActivationCode] = useState<string>('');
  const [activationEmail, setActivationEmail] = useState<string>('');

  // Password Recovery Inputs
  const [recoveryIdentifier, setRecoveryIdentifier] = useState<string>('');
  const [recoveryCode, setRecoveryCode] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');
  const [recoveryStep, setRecoveryStep] = useState<'request' | 'confirm'>('request');
  const [maskedEmail, setMaskedEmail] = useState<string>('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    // When setup status is known, automatically switch to setup mode if no admin exists
    if (hasAdmin === false) {
      setMode('setup');
    } else if (hasAdmin === true && mode === 'setup') {
      setMode('login');
    }
  }, [hasAdmin]);

  const clearFeedback = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    const cleanInput = loginEmail.trim();
    if (!cleanInput || !password.trim()) {
      setErrorMessage('Por favor ingresa tu correo electrónico y contraseña');
      return;
    }

    setLoading(true);

    try {
      const res = await login(cleanInput, password.trim());
      if (!res.success) {
        if (res.requiresActivation) {
          setActivationIdentifier(cleanInput);
          setActivationEmail(res.user?.email || '');
          setMode('activate');
          setErrorMessage('Tu cuenta requiere activación previa. Por favor revisa tu correo electrónico y tu carpeta de Spam / Correo no deseado para ingresar el código de 6 dígitos.');
        } else {
          setErrorMessage(res.error || 'Correo electrónico o contraseña incorrectos');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    const cleanEmail = adminEmail.trim().toLowerCase();
    const cleanPassword = password.trim();
    const cleanConfirm = confirmPassword.trim();
    const cleanName = adminName.trim() || 'Administrador Principal';

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('Debes ingresar un correo electrónico válido para el administrador');
      return;
    }

    if (!cleanPassword || !cleanConfirm) {
      setErrorMessage('Debes ingresar y confirmar la contraseña del administrador');
      return;
    }

    if (cleanPassword.length < 4) {
      setErrorMessage('La contraseña debe tener al menos 4 caracteres');
      return;
    }

    if (cleanPassword !== cleanConfirm) {
      setErrorMessage('Las dos contraseñas no coinciden. Por favor verifícalas');
      return;
    }

    setLoading(true);

    try {
      const res = await setupAdmin(cleanEmail, cleanPassword, cleanConfirm, cleanName);
      if (!res.success) {
        setErrorMessage(res.error || 'Error al crear la cuenta de administrador');
      } else {
        setSuccessMessage('✓ ¡Administrador configurado con éxito! Iniciando sesión...');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al configurar el administrador');
    } finally {
      setLoading(false);
    }
  };

  const handleActivationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!activationIdentifier.trim() || !activationCode.trim()) {
      setErrorMessage('Por favor ingresa tu correo electrónico y el código de 6 dígitos');
      return;
    }

    setLoading(true);
    try {
      const res = await activateAccount(activationIdentifier.trim(), activationCode.trim());
      if (!res.success) {
        setErrorMessage(res.error || 'Código de activación incorrecto o expirado');
      } else {
        setSuccessMessage('✓ ¡Cuenta activada con éxito! Ingresando al panel...');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al activar la cuenta');
    } finally {
      setLoading(false);
    }
  };

  const handleResendActivationCode = async () => {
    if (!activationIdentifier.trim()) {
      setErrorMessage('Ingresa tu correo electrónico para reenviar el código');
      return;
    }

    clearFeedback();
    setLoading(true);
    try {
      const res = await resendActivation(activationIdentifier.trim());
      if (!res.success) {
        setErrorMessage(res.error || 'Error al reenviar código');
      } else {
        setSuccessMessage('✓ Se ha enviado un nuevo código de activación. Por favor revisa tu bandeja de entrada y tu carpeta de Spam / Correo no deseado.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al reenviar código');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestRecoveryCode = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!recoveryIdentifier.trim()) {
      setErrorMessage('Ingresa tu correo electrónico registrado');
      return;
    }

    setLoading(true);
    try {
      const res = await forgotPassword(recoveryIdentifier.trim());
      if (!res.success) {
        setErrorMessage(res.error || 'Error al solicitar código de recuperación');
      } else {
        setMaskedEmail(res.maskedEmail || '');
        setRecoveryStep('confirm');
        setSuccessMessage(res.message || '✓ Código de recuperación enviado por correo.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!recoveryCode.trim()) {
      setErrorMessage('Ingresa el código de 6 dígitos recibido por correo');
      return;
    }

    if (!newPassword.trim() || newPassword.trim().length < 4) {
      setErrorMessage('La nueva contraseña debe tener al menos 4 caracteres');
      return;
    }

    if (newPassword.trim() !== confirmNewPassword.trim()) {
      setErrorMessage('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      const res = await resetPassword(recoveryIdentifier.trim(), recoveryCode.trim(), newPassword.trim());
      if (!res.success) {
        setErrorMessage(res.error || 'Error al restablecer contraseña');
      } else {
        setSuccessMessage('✓ ¡Contraseña restablecida exitosamente! Ya puedes iniciar sesión.');
        setTimeout(() => {
          setMode('login');
          setLoginEmail(recoveryIdentifier);
          setPassword('');
          setRecoveryCode('');
          setNewPassword('');
          setConfirmNewPassword('');
          setRecoveryStep('request');
        }, 2000);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al restablecer contraseña');
    } finally {
      setLoading(false);
    }
  };

  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword;

  const newPasswordsMatch = newPassword.length > 0 && confirmNewPassword.length > 0 && newPassword === confirmNewPassword;
  const newPasswordsMismatch = newPassword.length > 0 && confirmNewPassword.length > 0 && newPassword !== confirmNewPassword;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between relative overflow-hidden font-sans select-none">
      {/* Background Decorative Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-100/60 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] rounded-full bg-sky-100/60 blur-[140px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-indigo-50/80 blur-[160px] pointer-events-none" />

      {/* Top Header Bar */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-sky-500 p-0.5 shadow-md flex items-center justify-center shrink-0 overflow-hidden">
            {storeConfig?.logoUrl ? (
              <img
                src={storeConfig.logoUrl}
                alt={storeConfig.storeName || 'Comerxia Logo'}
                className="w-full h-full object-cover rounded-[10px]"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-emerald-600" />
              </div>
            )}
          </div>
          <div>
            <h1 className="font-extrabold text-lg tracking-tight text-slate-900">
              {storeConfig?.storeName || 'Comerxia Store'}
            </h1>
            <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Gestión de Inventario & Tienda Online SQL
            </p>
          </div>
        </div>

        {/* Direct Access to Customer Storefront */}
        <button
          type="button"
          onClick={onViewCustomerStore}
          className="group px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-xs font-bold flex items-center space-x-2 transition-all duration-200 shadow-2xs cursor-pointer"
        >
          <ShoppingBag className="w-4 h-4 text-sky-600 group-hover:scale-110 transition-transform" />
          <span>Ver Tienda (Vista Cliente)</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {/* Card Container */}
          <div className="bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xl relative">
            
            {/* Top Badge */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>
                  {mode === 'setup'
                    ? 'Configuración Inicial'
                    : mode === 'activate'
                    ? 'Activación de Cuenta'
                    : mode === 'forgot_password'
                    ? 'Recuperación de Acceso'
                    : 'Acceso Administrativo'}
                </span>
              </div>
              <div className="flex items-center space-x-1.5 text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                <Database className="w-3 h-3 text-sky-600" />
                <span>PostgreSQL DB</span>
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2.5 animate-shake font-medium">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Success Message */}
            {successMessage && (
              <div className="mb-5 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start space-x-2.5 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Loading Check State */}
            {hasAdmin === null ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
                <div className="w-8 h-8 border-3 border-emerald-500/30 border-t-emerald-600 rounded-full animate-spin"></div>
                <p className="text-xs text-slate-500 font-medium">Verificando estado del sistema...</p>
              </div>
            ) : mode === 'setup' && hasAdmin === false ? (
              /* SETUP MODE: Create First Admin */
              <div>
                <div className="mb-6 text-left">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold mb-2">
                    <UserPlus className="w-3.5 h-3.5 text-amber-600" />
                    <span>Primer Acceso al Sistema</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Configurar Administrador Principal
                  </h2>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    No se encontró ningún administrador. Registra tu correo electrónico y define tu contraseña para inicializar el sistema por única vez.
                  </p>
                </div>

                <form onSubmit={handleSetupSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Correo Electrónico del Administrador <span className="text-emerald-600">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="admin@tuempresa.com"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-medium"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Este correo será tu identificador principal para iniciar sesión y recuperar acceso</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Nombre o Razón Social (Opcional)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                        placeholder="Ej: Administrador Principal"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Contraseña <span className="text-emerald-600">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Ingresa la contraseña (mínimo 4 caracteres)"
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                      <span>Confirmar Contraseña <span className="text-emerald-600">*</span></span>
                      {passwordsMatch && (
                        <span className="text-[11px] text-emerald-700 flex items-center gap-1 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Coinciden
                        </span>
                      )}
                      {passwordsMismatch && (
                        <span className="text-[11px] text-rose-700 flex items-center gap-1 font-bold">
                          <AlertCircle className="w-3.5 h-3.5" />
                          No coinciden
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repite la contraseña para confirmar"
                        className={`w-full pl-10 pr-10 py-2.5 bg-slate-50 border rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white transition font-medium ${
                          passwordsMatch
                            ? 'border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                            : passwordsMismatch
                            ? 'border-rose-300 focus:ring-1 focus:ring-rose-500'
                            : 'border-slate-200 focus:border-emerald-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || (confirmPassword.length > 0 && !passwordsMatch)}
                    className="w-full py-3 px-4 mt-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-sm transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Inicializando administrador...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Crear Administrador y Entrar</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            ) : mode === 'activate' ? (
              /* ACTIVATION MODE */
              <div>
                <div className="mb-6 text-left">
                  <button
                    type="button"
                    onClick={() => {
                      clearFeedback();
                      setMode('login');
                    }}
                    className="inline-flex items-center space-x-1 text-xs font-bold text-slate-500 hover:text-slate-800 mb-3 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Volver al inicio de sesión</span>
                  </button>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Activar Cuenta
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Ingresa el código de 6 dígitos que fue enviado a tu correo electrónico para activar tu cuenta.
                  </p>
                </div>

                {/* Email & Spam notice banner */}
                <div className="mb-4 p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-start space-x-2.5 shadow-2xs">
                  <Mail className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    <span className="font-bold block text-amber-950">Revisa tu correo y tu carpeta de Spam:</span>
                    <span>
                      Enviamos el código de 6 dígitos a tu dirección registrada. Si no lo visualizas en tu bandeja principal, asegúrate de revisar tu <strong>carpeta de Spam o Correo no deseado</strong>.
                    </span>
                  </div>
                </div>

                <form onSubmit={handleActivationSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Correo Electrónico Registrado
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={activationIdentifier}
                        onChange={(e) => setActivationIdentifier(e.target.value)}
                        placeholder="tu-correo@gmail.com"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Código de Activación (6 dígitos)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Key className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={activationCode}
                        onChange={(e) => setActivationCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="123456"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-lg font-mono font-black text-center tracking-widest text-emerald-700 placeholder-slate-300 focus:outline-none focus:bg-white focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-sm transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Activando cuenta...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Validar Código y Entrar</span>
                      </>
                    )}
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={handleResendActivationCode}
                      disabled={loading}
                      className="text-xs font-semibold text-sky-600 hover:text-sky-800 underline inline-flex items-center space-x-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>¿No recibiste el correo? Reenviar código</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : mode === 'forgot_password' ? (
              /* PASSWORD RECOVERY MODE */
              <div>
                <div className="mb-6 text-left">
                  <button
                    type="button"
                    onClick={() => {
                      clearFeedback();
                      setMode('login');
                      setRecoveryStep('request');
                    }}
                    className="inline-flex items-center space-x-1 text-xs font-bold text-slate-500 hover:text-slate-800 mb-3 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Volver al inicio de sesión</span>
                  </button>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Recuperar Contraseña
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {recoveryStep === 'request'
                      ? 'Ingresa tu correo electrónico registrado. Te enviaremos un código de seguridad para restablecer tu contraseña.'
                      : `Ingresa el código enviado a ${maskedEmail || 'tu correo'} y define tu nueva contraseña.`}
                  </p>
                </div>

                {recoveryStep === 'request' ? (
                  <form onSubmit={handleRequestRecoveryCode} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Correo Electrónico Registrado
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Mail className="w-4 h-4" />
                        </div>
                        <input
                          type="email"
                          required
                          value={recoveryIdentifier}
                          onChange={(e) => setRecoveryIdentifier(e.target.value)}
                          placeholder="tu-correo@gmail.com"
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 font-medium"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-sm transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Enviando código...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Enviar Código de Recuperación</span>
                        </>
                      )}
                    </button>

                    <div className="pt-2 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          clearFeedback();
                          setRecoveryStep('confirm');
                        }}
                        className="text-xs font-semibold text-slate-500 hover:text-emerald-600 transition underline cursor-pointer"
                      >
                        ¿Ya tienes un código de 6 dígitos? Ingrésalo aquí
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Código de Recuperación (6 dígitos)
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Key className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          required
                          maxLength={6}
                          value={recoveryCode}
                          onChange={(e) => setRecoveryCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="123456"
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-lg font-mono font-black text-center tracking-widest text-emerald-700 placeholder-slate-300 focus:outline-none focus:bg-white focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Nueva Contraseña (mín. 4 caracteres)
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Lock className="w-4 h-4" />
                        </div>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Nueva contraseña"
                          className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                        <span>Confirmar Nueva Contraseña</span>
                        {newPasswordsMatch && (
                          <span className="text-[11px] text-emerald-700 flex items-center gap-1 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Coinciden
                          </span>
                        )}
                        {newPasswordsMismatch && (
                          <span className="text-[11px] text-rose-700 flex items-center gap-1 font-bold">
                            <AlertCircle className="w-3.5 h-3.5" />
                            No coinciden
                          </span>
                        )}
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Repite la nueva contraseña"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 font-medium"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading || (confirmNewPassword.length > 0 && !newPasswordsMatch)}
                      className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-sm transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Guardando nueva contraseña...</span>
                        </>
                      ) : (
                        <>
                          <KeyRound className="w-4 h-4" />
                          <span>Restablecer Contraseña e Iniciar Sesión</span>
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              /* LOGIN MODE */
              <div>
                <div className="mb-6 text-left">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Iniciar Sesión
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Ingresa con tu correo electrónico y contraseña de acceso.
                  </p>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  {/* Email / Username field */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Correo Electrónico
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="tu-correo@gmail.com"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-medium"
                      />
                    </div>
                  </div>

                  {/* Password field */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-700">
                        Contraseña
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          clearFeedback();
                          setRecoveryIdentifier(loginEmail);
                          setMode('forgot_password');
                        }}
                        className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Ingresa tu contraseña"
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-sm transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Autenticando con base de datos...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Ingresar al Panel</span>
                      </>
                    )}
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        clearFeedback();
                        setActivationIdentifier(loginEmail);
                        setMode('activate');
                      }}
                      className="text-xs font-medium text-slate-500 hover:text-slate-800 underline cursor-pointer"
                    >
                      ¿Tienes un código de activación de cuenta? Haz clic aquí
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Divider */}
            <div className="relative my-6 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <span className="relative px-3 bg-white text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                O visita la tienda
              </span>
            </div>

            {/* Customer Store Button */}
            <button
              type="button"
              onClick={onViewCustomerStore}
              className="w-full py-2.5 px-4 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 hover:border-sky-300 text-sky-800 font-bold text-xs transition flex items-center justify-center space-x-2 shadow-2xs cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 text-sky-600" />
              <span>Ver Catálogo y Tienda (Sin Iniciar Sesión)</span>
              <ArrowRight className="w-3.5 h-3.5 text-sky-600" />
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center text-xs text-slate-500">
        <p>
          Comerxia &bull; Base de datos PostgreSQL con autenticación directa y recuperación por Google Email
        </p>
      </footer>
    </div>
  );
};

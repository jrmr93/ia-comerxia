import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Lock,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
  Save,
  Users,
  UserPlus,
  Trash2,
  ShieldAlert,
  Clock,
  Sparkles,
  Send,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  HelpCircle,
  Check,
  ExternalLink,
  CheckCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { OperatorUser } from '../types.ts';

interface AdminProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminProfileModal: React.FC<AdminProfileModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    user,
    isAdmin,
    isOperator,
    updateProfile,
    getOperators,
    createOperator,
    toggleOperatorActive,
    deleteOperator,
    resendActivation,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'operators'>('profile');

  // Profile Form state
  const [name, setName] = useState(user?.name || 'Administrador');
  const [username, setUsername] = useState(user?.username || 'admin');
  const [email, setEmail] = useState(user?.email || 'admin@comerxia.com');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Operators Management state
  const [operators, setOperators] = useState<OperatorUser[]>([]);
  const [isLoadingOperators, setIsLoadingOperators] = useState(false);
  const [isCreatingOperator, setIsCreatingOperator] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actionInProgressId, setActionInProgressId] = useState<number | null>(null);
  const [operatorToDelete, setOperatorToDelete] = useState<OperatorUser | null>(null);

  // New Operator Form inputs
  const [newOpUsername, setNewOpUsername] = useState('');
  const [newOpName, setNewOpName] = useState('');
  const [newOpEmail, setNewOpEmail] = useState('');
  const [newOpPassword, setNewOpPassword] = useState('');
  const [newOpRequireActivation, setNewOpRequireActivation] = useState(false);
  const [showNewOpPassword, setShowNewOpPassword] = useState(false);
  const [operatorError, setOperatorError] = useState<string | null>(null);
  const [operatorSuccess, setOperatorSuccess] = useState<string | null>(null);

  const fetchOperatorsList = async () => {
    if (!isAdmin) return;
    setIsLoadingOperators(true);
    try {
      const list = await getOperators();
      setOperators(list);
    } catch (err) {
      console.error('Error fetching operators list:', err);
    } finally {
      setIsLoadingOperators(false);
    }
  };

  // Sync state when opening modal
  useEffect(() => {
    if (isOpen && user) {
      setName(user.name || (isAdmin ? 'Administrador' : 'Operador'));
      setUsername(user.username || (isAdmin ? 'admin' : 'operador'));
      setEmail(user.email || (isAdmin ? 'admin@comerxia.com' : 'operador@comerxia.com'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
      setSuccessMsg(null);
      setOperatorError(null);
      setOperatorSuccess(null);

      if (isAdmin) {
        fetchOperatorsList();
      } else {
        setActiveTab('profile');
      }
    }
  }, [isOpen, user, isAdmin]);

  if (!isOpen) return null;

  const handleSubmitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Validation
    if (!username.trim()) {
      setError('El nombre de usuario es obligatorio');
      return;
    }

    if (newPassword.trim()) {
      if (!currentPassword.trim()) {
        setError('Debes ingresar tu contraseña actual para cambiar la contraseña');
        return;
      }
      if (newPassword.trim().length < 4) {
        setError('La nueva contraseña debe tener al menos 4 caracteres');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('La nueva contraseña y su confirmación no coinciden');
        return;
      }
    }

    setIsSaving(true);
    try {
      const res = await updateProfile({
        name: name.trim(),
        username: username.trim(),
        email: email.trim(),
        currentPassword: currentPassword.trim() || undefined,
        newPassword: newPassword.trim() || undefined,
      });

      if (!res.success) {
        setError(res.error || 'Error al actualizar perfil');
      } else {
        setSuccessMsg('✓ Perfil y credenciales actualizadas correctamente en la base de datos SQL');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setSuccessMsg(null);
        }, 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Error al guardar los cambios');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    setOperatorError(null);
    setOperatorSuccess(null);

    const cleanEmail = newOpEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setOperatorError('Debes ingresar un correo electrónico válido para el operador');
      return;
    }

    const cleanUsername = (newOpUsername.trim() || cleanEmail).toLowerCase();

    if (!newOpPassword.trim() || newOpPassword.trim().length < 4) {
      setOperatorError('La contraseña del operador debe tener al menos 4 caracteres');
      return;
    }

    setIsCreatingOperator(true);
    try {
      const res = await createOperator({
        email: cleanEmail,
        username: cleanUsername,
        name: newOpName.trim() || cleanUsername,
        password: newOpPassword.trim(),
        requireActivation: newOpRequireActivation,
      });

      if (!res.success) {
        setOperatorError(res.error || 'Error al registrar el operador');
      } else {
        const activationNote = newOpRequireActivation
          ? ' Se envió un código de activación al correo del operador (recuérdale revisar su bandeja de entrada y la carpeta de Spam / Correo no deseado).'
          : '';
        setOperatorSuccess(`✓ Operador con correo "${cleanEmail}" creado exitosamente.${activationNote}`);
        setNewOpUsername('');
        setNewOpName('');
        setNewOpEmail('');
        setNewOpPassword('');
        setNewOpRequireActivation(false);
        setShowCreateForm(false);
        await fetchOperatorsList();
      }
    } catch (err: any) {
      setOperatorError(err.message || 'Error al crear operador');
    } finally {
      setIsCreatingOperator(false);
    }
  };

  const handleToggleOperatorStatus = async (op: OperatorUser) => {
    const nextStatus = !op.isActive;
    setActionInProgressId(op.id);
    setOperatorError(null);
    setOperatorSuccess(null);
    try {
      const res = await toggleOperatorActive(op.id, nextStatus);
      if (!res.success) {
        setOperatorError(res.error || 'Error al cambiar estado del operador');
      } else {
        setOperatorSuccess(
          `✓ Cuenta de "@${op.username}" ${nextStatus ? 'activada' : 'desactivada'} correctamente`
        );
        await fetchOperatorsList();
      }
    } catch (err: any) {
      setOperatorError(err.message || 'Error al cambiar estado');
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleResendActivation = async (op: OperatorUser) => {
    if (!op.email) {
      setOperatorError(`El operador @${op.username} no tiene un correo registrado.`);
      return;
    }

    setActionInProgressId(op.id);
    setOperatorError(null);
    setOperatorSuccess(null);
    try {
      const res = await resendActivation(op.username);
      if (!res.success) {
        setOperatorError(res.error || 'Error al reenviar código de activación');
      } else {
        setOperatorSuccess(`✓ Nuevo código de activación enviado a ${op.email}. Pídele revisar su correo y su carpeta de Spam.`);
        await fetchOperatorsList();
      }
    } catch (err: any) {
      setOperatorError(err.message || 'Error al reenviar código');
    } finally {
      setActionInProgressId(null);
    }
  };

  const confirmDeleteOperatorAction = async () => {
    if (!operatorToDelete) return;
    const op = operatorToDelete;

    // Protection: never delete currently active account
    if (
      (user?.id && op.id === user.id) ||
      (user?.username && op.username && op.username.toLowerCase() === user.username.toLowerCase())
    ) {
      setOperatorError('No está permitido eliminar la cuenta con la que has iniciado sesión actualmente.');
      setOperatorToDelete(null);
      return;
    }

    setDeletingId(op.id);
    setOperatorError(null);
    setOperatorSuccess(null);
    try {
      const res = await deleteOperator(op.id);
      if (!res.success) {
        setOperatorError(res.error || 'Error al eliminar operador');
      } else {
        setOperatorSuccess(`✓ Cuenta de operador "@${op.username}" eliminada correctamente`);
        setOperatorToDelete(null);
        await fetchOperatorsList();
      }
    } catch (err: any) {
      setOperatorError(err.message || 'Error al eliminar operador');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div
        className="w-full max-w-2xl bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-2xl relative overflow-hidden text-slate-800 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-2xs border ${
                isAdmin
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                  : 'bg-sky-50 border-sky-200 text-sky-600'
              }`}
            >
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  {isAdmin ? 'Panel de Administrador' : 'Perfil de Usuario'}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    isAdmin
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-sky-100 text-sky-800 border border-sky-300'
                  }`}
                >
                  {isAdmin ? 'Administrador' : 'Operador'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {isAdmin
                  ? 'Credenciales, activación de cuentas y operadores'
                  : 'Administra tus datos personales y actualiza tu contraseña de acceso'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs (Only for Admin) */}
        {isAdmin && (
          <div className="flex border-b border-slate-200 mt-4 space-x-1 sm:space-x-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('profile')}
              className={`pb-2.5 px-3 text-xs font-bold transition border-b-2 flex items-center space-x-1.5 cursor-pointer shrink-0 ${
                activeTab === 'profile'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Mi Perfil</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('operators');
                fetchOperatorsList();
              }}
              className={`pb-2.5 px-3 text-xs font-bold transition border-b-2 flex items-center space-x-1.5 cursor-pointer shrink-0 ${
                activeTab === 'operators'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Operadores ({operators.length})</span>
            </button>
          </div>
        )}

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto pr-1 mt-4 space-y-4">
          {/* TAB 1: PERFIL */}
          {activeTab === 'profile' && (
            <div>
              {/* Feedback Alerts */}
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2 font-medium mb-4">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2 font-medium mb-4">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmitProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Display Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nombre Completo
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Nombre de usuario"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 transition"
                      />
                    </div>
                  </div>

                  {/* Username */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Usuario de Acceso
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="admin"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Email address */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Correo Electrónico (para recuperación de contraseña)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@comerxia.com"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 transition"
                    />
                  </div>
                </div>

                {/* Password Change Section */}
                <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200 space-y-3">
                  <div className="flex items-center space-x-2">
                    <Lock className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800">Cambiar Contraseña (Opcional)</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Contraseña Actual (requerida solo si deseas cambiarla)
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPass ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Ingresa tu contraseña actual"
                        className="w-full pl-3 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Nueva Contraseña (mín. 4 caracteres)
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPass ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Nueva contraseña"
                          className="w-full pl-3 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500 transition"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPass(!showNewPass)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Confirmar Nueva Contraseña
                      </label>
                      <input
                        type={showNewPass ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repite la nueva contraseña"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500 transition"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition cursor-pointer"
                  >
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center space-x-2 shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Guardando en SQL...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Guardar Cambios</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: OPERADORES */}
          {activeTab === 'operators' && (
            <div className="space-y-4">
              {/* Feedback Alerts */}
              {operatorError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{operatorError}</span>
                </div>
              )}

              {operatorSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{operatorSuccess}</span>
                </div>
              )}

              {/* Action bar */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-600">
                  Los operadores tienen acceso exclusivo a inventario y órdenes. No pueden modificar la base de datos ni los ajustes del servidor.
                </p>
                {!showCreateForm && (
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-xs cursor-pointer shrink-0 ml-2"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Nuevo Operador</span>
                  </button>
                )}
              </div>

              {/* Create Operator Form Drawer */}
              {showCreateForm && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-emerald-200 shadow-xs space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <div className="flex items-center space-x-2">
                      <UserPlus className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-slate-900">
                        Registrar Nuevo Operador
                      </span>
                    </div>
                    <button
                      onClick={() => setShowCreateForm(false)}
                      className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>

                  <form onSubmit={handleCreateOperator} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Correo Electrónico de Acceso <span className="text-emerald-600">*</span>
                        </label>
                        <input
                          type="email"
                          required
                          value={newOpEmail}
                          onChange={(e) => setNewOpEmail(e.target.value)}
                          placeholder="operador@comerxia.com"
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Nombre Completo
                        </label>
                        <input
                          type="text"
                          value={newOpName}
                          onChange={(e) => setNewOpName(e.target.value)}
                          placeholder="Ej. Juan Pérez"
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Usuario / Alias (Opcional)
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 text-xs font-mono font-bold">@</span>
                          <input
                            type="text"
                            value={newOpUsername}
                            onChange={(e) => setNewOpUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                            placeholder="operador1"
                            className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Contraseña de Acceso <span className="text-emerald-600">*</span> (Mín. 4 caracteres)
                        </label>
                        <div className="relative">
                          <input
                            type={showNewOpPassword ? 'text' : 'password'}
                            required
                            value={newOpPassword}
                            onChange={(e) => setNewOpPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full pl-3 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewOpPassword(!showNewOpPassword)}
                            className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {showNewOpPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Require Email Activation Checkbox */}
                    <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-200/80 flex items-start space-x-2.5">
                      <input
                        type="checkbox"
                        id="requireActivationCheckbox"
                        checked={newOpRequireActivation}
                        onChange={(e) => setNewOpRequireActivation(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <label htmlFor="requireActivationCheckbox" className="text-xs text-blue-900 cursor-pointer select-none">
                        <span className="font-semibold block">Requerir activación de cuenta por correo electrónico</span>
                        <span className="text-[11px] text-blue-700 block">
                          Se enviará automáticamente un código de 6 dígitos al correo del operador antes de que pueda iniciar sesión.
                        </span>
                      </label>
                    </div>

                    <div className="flex justify-end space-x-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowCreateForm(false)}
                        className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-300 transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isCreatingOperator}
                        className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        {isCreatingOperator ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Registrando...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5" />
                            <span>Crear Operador</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Operators List */}
              {isLoadingOperators ? (
                <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center">
                  <div className="w-5 h-5 border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin mb-2"></div>
                  <span>Cargando operadores registrados en SQL...</span>
                </div>
              ) : operators.length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-center">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-2">
                    <Users className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">No hay operadores creados aún</p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                    Crea cuentas de operador para que tus colaboradores puedan operar el inventario y pedidos sin acceder a la configuración del servidor ni ajustes de la tienda.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {operators.map((op) => {
                    const isCurrentAccount = Boolean(
                      (user?.id && op.id === user.id) ||
                      (user?.username && op.username && op.username.toLowerCase() === user.username.toLowerCase())
                    );

                    return (
                      <div
                        key={op.id}
                        className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center font-bold text-xs shrink-0">
                            {op.name ? op.name.charAt(0).toUpperCase() : 'O'}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2 flex-wrap gap-1">
                              <span className="text-xs font-bold text-slate-900">{op.name || 'Operador'}</span>
                              <span className="text-[11px] font-mono text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                @{op.username}
                              </span>

                              {/* Current Active Session Badge */}
                              {isCurrentAccount && (
                                <span className="inline-flex items-center space-x-1 text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold border border-slate-300">
                                  <ShieldCheck className="w-2.5 h-2.5 text-slate-600" />
                                  <span>Tu sesión actual</span>
                                </span>
                              )}
                              
                              {/* Status Badge */}
                              {op.isActive ? (
                                <span className="inline-flex items-center space-x-1 text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold border border-emerald-300">
                                  <Check className="w-2.5 h-2.5" />
                                  <span>Activo</span>
                                </span>
                              ) : (
                                <span
                                  title="El operador debe activar su cuenta con el código enviado por correo (revisar bandeja y spam)"
                                  className="inline-flex items-center space-x-1 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold border border-amber-300"
                                >
                                  <Clock className="w-2.5 h-2.5" />
                                  <span>Pendiente Activación (Revisar Correo/Spam)</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-3 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                              {op.email && <span className="flex items-center text-slate-600"><Mail className="w-3 h-3 mr-1 text-slate-400" />{op.email}</span>}
                              {op.createdAt && (
                                <span className="flex items-center text-[10px] text-slate-400">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {new Date(op.createdAt).toLocaleDateString('es-ES')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center space-x-1.5 self-end sm:self-center">
                          {/* Resend activation if pending */}
                          {!op.isActive && op.email && (
                            <button
                              onClick={() => handleResendActivation(op)}
                              disabled={actionInProgressId === op.id}
                              title="Reenviar código de activación por correo (recordar revisar spam)"
                              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-semibold transition flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                            >
                              <Send className="w-3 h-3" />
                              <span>Reenviar Código</span>
                            </button>
                          )}

                          {/* Toggle active / inactive */}
                          <button
                            onClick={() => handleToggleOperatorStatus(op)}
                            disabled={actionInProgressId === op.id}
                            title={op.isActive ? 'Desactivar acceso de operador' : 'Activar cuenta de operador directamente'}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center space-x-1 border cursor-pointer disabled:opacity-50 ${
                              op.isActive
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                            }`}
                          >
                            {op.isActive ? (
                              <>
                                <ToggleRight className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Desactivar</span>
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="w-3.5 h-3.5 text-slate-400" />
                                <span>Activar</span>
                              </>
                            )}
                          </button>

                          {/* Delete Operator Button - disabled/locked for current session account */}
                          {isCurrentAccount ? (
                            <span
                              title="Tu cuenta de sesión actual no puede ser eliminada"
                              className="p-1.5 rounded-lg text-slate-300 bg-slate-50 border border-slate-200 cursor-not-allowed flex items-center"
                            >
                              <Lock className="w-4 h-4" />
                            </span>
                          ) : (
                            <button
                              onClick={() => setOperatorToDelete(op)}
                              disabled={deletingId === op.id}
                              title="Eliminar cuenta de operador"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer disabled:opacity-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bottom action button */}
              <div className="flex items-center justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Custom Confirmation Modal for Deleting Operator (replaces blocked window.confirm) */}
        {operatorToDelete && (
          <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-5 shadow-2xl relative text-slate-800 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-start space-x-3 mb-3.5">
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    ¿Eliminar operador @{operatorToDelete.username}?
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Se eliminará permanentemente la cuenta de <strong>{operatorToDelete.name || operatorToDelete.username}</strong> de la base de datos SQL y se revocará de inmediato su acceso al sistema.
                  </p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs mb-4 space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span className="text-slate-400">Usuario:</span>
                  <span className="font-mono font-bold text-slate-900">@{operatorToDelete.username}</span>
                </div>
                {operatorToDelete.email && (
                  <div className="flex justify-between text-slate-600">
                    <span className="text-slate-400">Correo:</span>
                    <span className="text-slate-800 truncate max-w-[180px]">{operatorToDelete.email}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span className="text-slate-400">Rol:</span>
                  <span className="text-sky-700 font-semibold uppercase text-[10px]">Operador Comercial</span>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2">
                <button
                  type="button"
                  disabled={deletingId !== null}
                  onClick={() => setOperatorToDelete(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deletingId !== null}
                  onClick={confirmDeleteOperatorAction}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {deletingId === operatorToDelete.id ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Eliminando...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Sí, Eliminar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

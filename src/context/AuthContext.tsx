import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthUser, OperatorUser, GoogleEmailConfig } from '../types.ts';
import { safeLocalStorage } from '../utils/safeStorage.ts';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  hasAdmin: boolean | null;
  isAdmin: boolean;
  isOperator: boolean;
  checkSetupStatus: () => Promise<boolean>;
  setupAdmin: (email: string, password: string, confirmPassword: string, name?: string, username?: string) => Promise<{ success: boolean; error?: string }>;
  login: (emailOrUsername: string, password: string) => Promise<{ success: boolean; error?: string; requiresActivation?: boolean; user?: Partial<AuthUser> }>;
  logout: () => Promise<void>;
  updateProfile: (data: {
    username?: string;
    name?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
    photoUrl?: string;
  }) => Promise<{ success: boolean; error?: string; user?: AuthUser }>;
  getOperators: () => Promise<OperatorUser[]>;
  createOperator: (data: {
    username: string;
    password?: string;
    name?: string;
    email?: string;
    requireActivation?: boolean;
  }) => Promise<{ success: boolean; error?: string; operator?: OperatorUser }>;
  toggleOperatorActive: (id: number, isActive: boolean) => Promise<{ success: boolean; error?: string }>;
  deleteOperator: (id: number) => Promise<{ success: boolean; error?: string }>;
  activateAccount: (username: string, code: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  resendActivation: (username: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  forgotPassword: (username: string) => Promise<{ success: boolean; error?: string; message?: string; maskedEmail?: string }>;
  resetPassword: (username: string, code: string, newPassword: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  getEmailConfig: () => Promise<GoogleEmailConfig | null>;
  saveEmailConfig: (config: Partial<GoogleEmailConfig>) => Promise<{ success: boolean; error?: string; config?: GoogleEmailConfig }>;
  testEmailConfig: (testEmail: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  hasAdmin: null,
  isAdmin: false,
  isOperator: false,
  checkSetupStatus: async () => false,
  setupAdmin: async () => ({ success: false }),
  login: async () => ({ success: false }),
  logout: async () => {},
  updateProfile: async () => ({ success: false }),
  getOperators: async () => [],
  createOperator: async () => ({ success: false }),
  toggleOperatorActive: async () => ({ success: false }),
  deleteOperator: async () => ({ success: false }),
  activateAccount: async () => ({ success: false }),
  resendActivation: async () => ({ success: false }),
  forgotPassword: async () => ({ success: false }),
  resetPassword: async () => ({ success: false }),
  getEmailConfig: async () => null,
  saveEmailConfig: async () => ({ success: false }),
  testEmailConfig: async () => ({ success: false }),
  authFetch: async () => new Response(),
});

const TOKEN_KEY = 'comerxia_sql_auth_token';
const USER_KEY = 'comerxia_sql_auth_user';
const LAST_ACTIVITY_KEY = 'comerxia_last_activity_timestamp';
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour (3,600,000 ms)

const updateLastActivity = () => {
  try {
    safeLocalStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
  } catch {}
};

const getLastActivity = (): number => {
  try {
    const val = safeLocalStorage.getItem(LAST_ACTIVITY_KEY);
    if (!val) return 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  } catch {
    return 0;
  }
};

async function parseSafeJson<T = any>(
  res: Response,
  defaultError = 'Error de conexión con el servidor'
): Promise<{ ok: boolean; data: any }> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const data = await res.json();
      return { ok: res.ok, data };
    } catch {
      return {
        ok: false,
        data: { success: false, error: 'Respuesta inválida del servidor (formato JSON corrupto)' },
      };
    }
  }

  // Handle HTML or non-JSON responses gracefully (e.g. 502 Bad Gateway, 404, or plain text)
  try {
    const text = await res.text();
    const cleanText = text.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    const snippet = cleanText.length > 150 ? cleanText.slice(0, 150) + '...' : cleanText;
    return {
      ok: false,
      data: {
        success: false,
        error: snippet || `${defaultError} (${res.status} ${res.statusText || 'Error'})`,
      },
    };
  } catch {
    return {
      ok: false,
      data: {
        success: false,
        error: `${defaultError} (${res.status} ${res.statusText || 'Error'})`,
      },
    };
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);

  const checkSetupStatus = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/setup-status');
      const { ok, data } = await parseSafeJson(res, 'Error al verificar estado de administrador');
      if (ok && data) {
        const exists = Boolean(data.hasAdmin);
        setHasAdmin(exists);
        return exists;
      }
    } catch (e) {
      console.warn('Error checking setup status:', e);
    }
    return false;
  };

  // Initialize and verify session on boot / page refresh
  useEffect(() => {
    const initAuth = async () => {
      // 1. Check if admin user exists in SQL DB
      await checkSetupStatus();

      // 2. Restore persistent session if valid and not expired by inactivity (1 hour limit)
      try {
        const savedToken = safeLocalStorage.getItem(TOKEN_KEY);
        const savedUserStr = safeLocalStorage.getItem(USER_KEY);
        const lastActivity = getLastActivity();
        const now = Date.now();

        if (savedToken && savedUserStr) {
          // If more than 1 hour without activity has passed since the last action
          if (lastActivity > 0 && now - lastActivity > INACTIVITY_TIMEOUT_MS) {
            safeLocalStorage.removeItem(TOKEN_KEY);
            safeLocalStorage.removeItem(USER_KEY);
            safeLocalStorage.removeItem(LAST_ACTIVITY_KEY);
            setUser(null);
            setToken(null);
          } else {
            // Session is active and valid within the 1-hour window!
            const parsedUser = JSON.parse(savedUserStr);
            setUser(parsedUser);
            setToken(savedToken);
            updateLastActivity();

            // Background verification with /api/auth/me to keep user data fresh
            fetch('/api/auth/me', {
              headers: { Authorization: `Bearer ${savedToken}` },
            })
              .then(async (res) => {
                if (res.ok) {
                  const data = await res.json();
                  if (data.success && data.user) {
                    setUser(data.user);
                    safeLocalStorage.setItem(USER_KEY, JSON.stringify(data.user));
                    updateLastActivity();
                  }
                } else if (res.status === 401 || res.status === 403) {
                  // Token expired on server or user disabled
                  safeLocalStorage.removeItem(TOKEN_KEY);
                  safeLocalStorage.removeItem(USER_KEY);
                  safeLocalStorage.removeItem(LAST_ACTIVITY_KEY);
                  setUser(null);
                  setToken(null);
                }
              })
              .catch((err) => {
                console.warn('Silent auth check warning:', err);
              });
          }
        } else {
          setUser(null);
          setToken(null);
        }
      } catch (err) {
        console.error('Error restoring session:', err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // Listen to user interaction and monitor inactivity (1 hour limit)
  useEffect(() => {
    if (!token || !user) return;

    // Record activity (throttled to avoid excessive localStorage writes)
    let lastRecordedTime = 0;
    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastRecordedTime > 3000) {
        lastRecordedTime = now;
        updateLastActivity();
      }
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove', 'click'];
    events.forEach((evt) => {
      window.addEventListener(evt, handleUserActivity, { passive: true });
    });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const lastAct = getLastActivity();
        if (lastAct > 0 && Date.now() - lastAct > INACTIVITY_TIMEOUT_MS) {
          logout();
        } else {
          handleUserActivity();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Cross-tab synchronization
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY && !e.newValue) {
        setUser(null);
        setToken(null);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Periodic check for inactivity timeout (every 15 seconds)
    const intervalId = setInterval(() => {
      const lastAct = getLastActivity();
      if (lastAct > 0 && Date.now() - lastAct > INACTIVITY_TIMEOUT_MS) {
        console.log('Sesión cerrada automáticamente por 1 hora de inactividad.');
        logout();
      }
    }, 15000);

    return () => {
      events.forEach((evt) => {
        window.removeEventListener(evt, handleUserActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(intervalId);
    };
  }, [token, user]);

  const setupAdmin = async (
    email: string,
    password: string,
    confirmPassword: string,
    name?: string,
    username?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/setup-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, confirmPassword, name, username }),
      });

      const { ok, data } = await parseSafeJson(res, 'Error al configurar administrador');
      if (!ok || !data.success) {
        return { success: false, error: data.error || 'Error al configurar administrador' };
      }

      setUser(data.user);
      setToken(data.token);
      setHasAdmin(true);
      safeLocalStorage.setItem(TOKEN_KEY, data.token);
      safeLocalStorage.setItem(USER_KEY, JSON.stringify(data.user));
      safeLocalStorage.setItem('comerxia_active_main_tab', 'inventory');
      updateLastActivity();
      return { success: true };
    } catch (err: any) {
      console.error('Error during admin setup:', err);
      return { success: false, error: err.message || 'Error de conexión con el servidor' };
    }
  };

  const login = async (
    emailOrUsername: string,
    password: string
  ): Promise<{ success: boolean; error?: string; requiresActivation?: boolean; user?: Partial<AuthUser> }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailOrUsername, username: emailOrUsername, password }),
      });

      const { ok, data } = await parseSafeJson(res, 'Error al iniciar sesión');
      if (!ok || !data.success) {
        if (data.requiresActivation) {
          return {
            success: false,
            requiresActivation: true,
            error: data.error,
            user: { username: data.username, email: data.email },
          };
        }
        return { success: false, error: data.error || 'Credenciales incorrectas' };
      }

      setUser(data.user);
      setToken(data.token);
      safeLocalStorage.setItem(TOKEN_KEY, data.token);
      safeLocalStorage.setItem(USER_KEY, JSON.stringify(data.user));
      safeLocalStorage.setItem('comerxia_active_main_tab', 'inventory');
      updateLastActivity();
      return { success: true, user: data.user };
    } catch (err: any) {
      console.error('Error during login:', err);
      return { success: false, error: err.message || 'Error de conexión con el servidor' };
    }
  };

  const logout = async () => {
    try {
      if (token) {
        fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    } finally {
      setUser(null);
      setToken(null);
      safeLocalStorage.removeItem(TOKEN_KEY);
      safeLocalStorage.removeItem(USER_KEY);
      safeLocalStorage.removeItem(LAST_ACTIVITY_KEY);
    }
  };

  const updateProfile = async (data: {
    username?: string;
    name?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
    photoUrl?: string;
  }): Promise<{ success: boolean; error?: string; user?: AuthUser }> => {
    try {
      const res = await authFetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const { ok, data: resData } = await parseSafeJson(res, 'Error al actualizar perfil');
      if (!ok || !resData.success) {
        return { success: false, error: resData.error || 'Error al actualizar perfil' };
      }

      if (resData.user) {
        setUser(resData.user);
        safeLocalStorage.setItem(USER_KEY, JSON.stringify(resData.user));
        updateLastActivity();
      }
      if (resData.token) {
        setToken(resData.token);
        safeLocalStorage.setItem(TOKEN_KEY, resData.token);
        updateLastActivity();
      }

      return { success: true, user: resData.user };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error al actualizar perfil' };
    }
  };

  const authFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      updateLastActivity();
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401 && token) {
      // Auto-logout if session is terminated on server
      logout();
    }

    return response;
  };

  const getOperators = async (): Promise<OperatorUser[]> => {
    try {
      const res = await authFetch('/api/users/operators');
      const { ok, data } = await parseSafeJson(res);
      if (ok && data) {
        return data.operators || [];
      }
      return [];
    } catch (err) {
      console.error('Error fetching operators:', err);
      return [];
    }
  };

  const createOperator = async (data: {
    username: string;
    password?: string;
    name?: string;
    email?: string;
    requireActivation?: boolean;
  }): Promise<{ success: boolean; error?: string; operator?: OperatorUser }> => {
    try {
      const res = await authFetch('/api/users/operators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const { ok, data: resData } = await parseSafeJson(res, 'Error al crear operador');
      if (!ok || !resData.success) {
        return { success: false, error: resData.error || 'Error al crear operador' };
      }

      return { success: true, operator: resData.operator };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión' };
    }
  };

  const toggleOperatorActive = async (id: number, isActive: boolean): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await authFetch(`/api/users/operators/${id}/toggle-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });

      const { ok, data: resData } = await parseSafeJson(res, 'Error al cambiar estado del operador');
      if (!ok || !resData.success) {
        return { success: false, error: resData.error || 'Error al cambiar estado del operador' };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión' };
    }
  };

  const deleteOperator = async (id: number): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await authFetch(`/api/users/operators/${id}`, {
        method: 'DELETE',
      });

      const { ok, data: resData } = await parseSafeJson(res, 'Error al eliminar operador');
      if (!ok || !resData.success) {
        return { success: false, error: resData.error || 'Error al eliminar operador' };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión' };
    }
  };

  const activateAccount = async (
    username: string,
    code: string
  ): Promise<{ success: boolean; error?: string; message?: string }> => {
    try {
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, code }),
      });

      const { ok, data: resData } = await parseSafeJson(res, 'Error al activar la cuenta');
      if (!ok || !resData.success) {
        return { success: false, error: resData.error || 'Código de activación incorrecto o expirado' };
      }

      if (resData.user && resData.token) {
        setUser(resData.user);
        setToken(resData.token);
        safeLocalStorage.setItem(TOKEN_KEY, resData.token);
        safeLocalStorage.setItem(USER_KEY, JSON.stringify(resData.user));
        safeLocalStorage.setItem('comerxia_active_main_tab', 'inventory');
        updateLastActivity();
      }

      return { success: true, message: resData.message };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión' };
    }
  };

  const resendActivation = async (
    username: string
  ): Promise<{ success: boolean; error?: string; message?: string }> => {
    try {
      const res = await fetch('/api/auth/resend-activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      const { ok, data: resData } = await parseSafeJson(res, 'Error al reenviar código de activación');
      if (!ok || !resData.success) {
        return { success: false, error: resData.error || 'Error al reenviar código de activación' };
      }

      return { success: true, message: resData.message };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión' };
    }
  };

  const forgotPassword = async (
    username: string
  ): Promise<{ success: boolean; error?: string; message?: string; maskedEmail?: string }> => {
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      const { ok, data: resData } = await parseSafeJson(res, 'Error al solicitar código de recuperación');
      if (!ok || !resData.success) {
        return { success: false, error: resData.error || 'Error al solicitar código de recuperación' };
      }

      return { success: true, message: resData.message, maskedEmail: resData.maskedEmail };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión' };
    }
  };

  const resetPassword = async (
    username: string,
    code: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string; message?: string }> => {
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, code, newPassword }),
      });

      const { ok, data: resData } = await parseSafeJson(res, 'Error al restablecer la contraseña');
      if (!ok || !resData.success) {
        return { success: false, error: resData.error || 'Error al restablecer la contraseña' };
      }

      return { success: true, message: resData.message };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión' };
    }
  };

  const getEmailConfig = async (): Promise<GoogleEmailConfig | null> => {
    try {
      const res = await authFetch('/api/email/config');
      const { ok, data } = await parseSafeJson(res);
      if (ok && data) {
        return data.config || null;
      }
      return null;
    } catch (err) {
      console.error('Error fetching email config:', err);
      return null;
    }
  };

  const saveEmailConfig = async (
    config: Partial<GoogleEmailConfig>
  ): Promise<{ success: boolean; error?: string; config?: GoogleEmailConfig }> => {
    try {
      const res = await authFetch('/api/email/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const { ok, data } = await parseSafeJson(res, 'Error al guardar configuración de correo');
      if (!ok || !data.success) {
        return { success: false, error: data.error || 'Error al guardar configuración de correo' };
      }

      return { success: true, config: data.config };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión' };
    }
  };

  const testEmailConfig = async (
    testEmail: string
  ): Promise<{ success: boolean; error?: string; message?: string }> => {
    try {
      const res = await authFetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testEmail }),
      });

      const { ok, data } = await parseSafeJson(res, 'Error al enviar correo de prueba');
      if (!ok || !data.success) {
        return { success: false, error: data.error || 'Error al enviar correo de prueba' };
      }

      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión' };
    }
  };

  const isAdmin = Boolean(user && (user.role === 'admin' || !user.role));
  const isOperator = Boolean(user && (user.role === 'operador' || user.role === 'operator'));

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        hasAdmin,
        isAdmin,
        isOperator,
        checkSetupStatus,
        setupAdmin,
        login,
        logout,
        updateProfile,
        getOperators,
        createOperator,
        toggleOperatorActive,
        deleteOperator,
        activateAccount,
        resendActivation,
        forgotPassword,
        resetPassword,
        getEmailConfig,
        saveEmailConfig,
        testEmailConfig,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);


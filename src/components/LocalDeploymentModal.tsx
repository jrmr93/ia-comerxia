import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileCode,
  Globe,
  HardDrive,
  Layers,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  Server,
  Settings,
  Settings2,
  Shield,
  ShieldCheck,
  Sparkles,
  Store,
  Terminal,
  Trash2,
  X,
  Zap,
  Mail,
  Image,
  Upload,
  FolderArchive,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { safeLocalStorage } from '../utils/safeStorage.ts';
import { TelegramConfig, StoreConfig } from '../types.ts';
import { TelegramBotConfigModal } from './TelegramBotConfigModal.tsx';
import { GoogleAiConfigModal } from './GoogleAiConfigModal.tsx';
import { StoreSettingsTab } from './StoreSettingsTab.tsx';
import { GmailConfigTab } from './GmailConfigTab.tsx';
import { DevTestingTab } from './DevTestingTab.tsx';

interface LocalDeploymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'deploy' | 'status' | 'domains' | 'security' | 'backup' | 'telegram' | 'ai' | 'store' | 'email' | 'sandbox';
  config?: TelegramConfig | null;
  onConfigSaved?: () => void;
  storeConfig?: StoreConfig | null;
  onStoreConfigSaved?: () => void;
  items?: any[];
  messages?: any[];
  orders?: any[];
}

export const LocalDeploymentModal: React.FC<LocalDeploymentModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'store',
  config,
  onConfigSaved,
  storeConfig,
  onStoreConfigSaved,
}) => {
  const { authFetch, token } = useAuth();
  const [downloadingType, setDownloadingType] = useState<string | null>(null);

  // Modal Main Navigation
  const [activeTab, setActiveTab] = useState<'deploy' | 'status' | 'domains' | 'security' | 'backup' | 'telegram' | 'ai' | 'store' | 'email' | 'sandbox'>(initialTab || 'store');

  // Sub-tabs inside "Despliegue"
  const [deploySubTab, setDeploySubTab] = useState<'guide' | 'scripts'>('guide');
  const [dbOptionInGuide, setDbOptionInGuide] = useState<'create' | 'existing-keep' | 'existing-reset'>('create');

  // Sub-tabs inside "Seguridad"
  const [securitySubTab, setSecuritySubTab] = useState<'cloudflare' | 'hardening'>('cloudflare');

  // Database status and tester state
  const [dbInfo, setDbInfo] = useState<any>(null);
  const [loadingDbInfo, setLoadingDbInfo] = useState<boolean>(false);

  // Domain & Subdomain Routing State
  const [adminDomain, setAdminDomain] = useState<string>('admin.dominio1.com');
  const [storeDomain, setStoreDomain] = useState<string>('www.dominio1.com, dominio1.com');
  const [autoRouting, setAutoRouting] = useState<boolean>(true);
  const [defaultFallbackView, setDefaultFallbackView] = useState<'store' | 'admin'>('admin');
  const [loadingDomainConfig, setLoadingDomainConfig] = useState<boolean>(false);
  const [savingDomainConfig, setSavingDomainConfig] = useState<boolean>(false);
  const [domainConfigFeedback, setDomainConfigFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Interactive Subdomain Simulator
  const [simulatorHostInput, setSimulatorHostInput] = useState<string>('admin.dominio1.com');

  // Connection tester form state
  const [testHost, setTestHost] = useState<string>('127.0.0.1');
  const [testPort, setTestPort] = useState<string>('5432');
  const [testUser, setTestUser] = useState<string>('postgres');
  const [testPassword, setTestPassword] = useState<string>('postgres');
  const [testDbName, setTestDbName] = useState<string>('comerxia_db');
  const [testConnString, setTestConnString] = useState<string>('');
  const [useConnString, setUseConnString] = useState<boolean>(false);

  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; pingMs?: number; version?: string } | null>(null);

  // Script viewer inside Despliegue
  const [activeScriptTab, setActiveScriptTab] = useState<'init-db' | 'env' | 'deploy-sh' | 'package' | 'pm2'>('init-db');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Media / Images backup state
  const [mediaStats, setMediaStats] = useState<{ count: number; totalSizeMb: string } | null>(null);
  const [loadingMediaStats, setLoadingMediaStats] = useState<boolean>(false);
  const [restoringZip, setRestoringZip] = useState<boolean>(false);
  const [restoringMaster, setRestoringMaster] = useState<boolean>(false);
  const [mediaDiagnostics, setMediaDiagnostics] = useState<{
    totalChecked: number;
    existingCount: number;
    missingCount: number;
    missingFiles: string[];
    uploadsTotalFiles: number;
  } | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState<boolean>(false);
  const [restoreFeedback, setRestoreFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null);
  const [showRestoreConfirmModal, setShowRestoreConfirmModal] = useState<boolean>(false);

  // Fetch db info and domain config on open
  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      fetchDatabaseInfo();
      fetchDomainConfig();
      fetchMediaStats();
    }
  }, [isOpen, initialTab]);

  const fetchMediaStats = async () => {
    try {
      setLoadingMediaStats(true);
      const res = await authFetch('/api/media/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setMediaStats({
            count: data.count || 0,
            totalSizeMb: data.totalSizeMb || '0.00',
          });
        }
      }
    } catch (e) {
      console.warn('Could not fetch media stats:', e);
    } finally {
      setLoadingMediaStats(false);
    }
  };

  if (!isOpen) return null;

  const fetchDomainConfig = async () => {
    try {
      setLoadingDomainConfig(true);
      const res = await authFetch('/api/server/domain-config');
      if (res.ok) {
        const data = await res.json();
        if (data) {
          if (data.adminDomain) setAdminDomain(data.adminDomain);
          if (data.storeDomain) setStoreDomain(data.storeDomain);
          if (typeof data.autoRouting === 'boolean') setAutoRouting(data.autoRouting);
          if (data.defaultFallbackView) setDefaultFallbackView(data.defaultFallbackView);
        }
      }
    } catch (e) {
      console.error('Failed to load domain config:', e);
    } finally {
      setLoadingDomainConfig(false);
    }
  };

  const handleSaveDomainConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingDomainConfig(true);
    setDomainConfigFeedback(null);

    try {
      const res = await authFetch('/api/server/domain-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminDomain: adminDomain.trim(),
          storeDomain: storeDomain.trim(),
          autoRouting,
          defaultFallbackView,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        try {
          safeLocalStorage.setItem(
            'comerxia_domain_config_cache',
            JSON.stringify({
              adminDomain: adminDomain.trim(),
              storeDomain: storeDomain.trim(),
              autoRouting,
              defaultFallbackView,
            })
          );
        } catch {}
        onStoreConfigSaved?.();
        setDomainConfigFeedback({
          type: 'success',
          message: '¡Configuración de subdominios guardada con éxito en la base de datos y aplicada inmediatamente!',
        });
      } else {
        setDomainConfigFeedback({
          type: 'error',
          message: data.error || 'Error al guardar la configuración de subdominios',
        });
      }
    } catch (err: any) {
      setDomainConfigFeedback({
        type: 'error',
        message: err.message || 'Error de conexión con el servidor',
      });
    } finally {
      setSavingDomainConfig(false);
      setTimeout(() => {
        setDomainConfigFeedback(null);
      }, 5000);
    }
  };

  const fetchDatabaseInfo = async () => {
    try {
      setLoadingDbInfo(true);
      const res = await authFetch('/api/server/database-info');
      if (res.ok) {
        const data = await res.json();
        setDbInfo(data);
      }
    } catch (e) {
      console.error('Failed to load db runtime info:', e);
    } finally {
      setLoadingDbInfo(false);
    }
  };

  const handleTestConnection = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setTesting(true);
    setTestResult(null);

    try {
      const payload = useConnString
        ? { connectionString: testConnString.trim() }
        : {
            host: testHost.trim(),
            port: parseInt(testPort, 10) || 5432,
            user: testUser.trim(),
            password: testPassword,
            database: testDbName.trim(),
          };

      const res = await authFetch('/api/server/test-db-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: err.message || 'Error al comunicarse con el servidor para la prueba',
      });
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const triggerDownload = (path: string, fallbackFilename: string, typeKey: string) => {
    setDownloadingType(typeKey);
    const url = token ? `${path}?token=${encodeURIComponent(token)}` : path;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fallbackFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      setDownloadingType((curr) => (curr === typeKey ? null : curr));
    }, 2500);
  };

  const handleDownloadMasterZip = () => {
    triggerDownload('/api/export-master-zip', 'comerxia_master_backup.zip', 'master');
  };

  const handleDownloadSql = () => {
    triggerDownload('/api/export-sql', 'comerxia_backup_completo.sql', 'sql');
  };

  const handleDownloadJson = () => {
    triggerDownload('/api/export-backup-json', 'comerxia_backup_completo.json', 'json');
  };

  const handleDownloadImagesZip = () => {
    triggerDownload('/api/export-uploads-zip', 'comerxia_uploads_media.zip', 'images');
  };

  const handleRunDiagnostics = async () => {
    try {
      setLoadingDiagnostics(true);
      const res = await authFetch('/api/media/diagnostics');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setMediaDiagnostics(data);
        }
      }
    } catch (err) {
      console.error('Error fetching media diagnostics:', err);
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  const handleSelectZipForRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.zip')) {
      setRestoreFeedback({
        type: 'error',
        message: 'Por favor selecciona un archivo comprimido .zip válido.',
      });
      e.target.value = '';
      return;
    }

    setPendingRestoreFile(file);
    setShowRestoreConfirmModal(true);
    e.target.value = '';
  };

  const handleConfirmRestoreMasterZip = async () => {
    if (!pendingRestoreFile) return;

    setRestoringMaster(true);
    setRestoreFeedback(null);

    try {
      const formData = new FormData();
      formData.append('file', pendingRestoreFile);

      const res = await authFetch('/api/restore-master-zip', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setRestoreFeedback({
          type: 'success',
          message: data.message || `¡Respaldo maestro restaurado exitosamente!`,
        });
        fetchMediaStats();
        handleRunDiagnostics();
      } else {
        setRestoreFeedback({
          type: 'error',
          message: data.error || 'Error al procesar el respaldo maestro.',
        });
      }
    } catch (err: any) {
      setRestoreFeedback({
        type: 'error',
        message: err?.message || 'Error de conexión al procesar el archivo ZIP.',
      });
    } finally {
      setRestoringMaster(false);
      setShowRestoreConfirmModal(false);
      setPendingRestoreFile(null);
    }
  };

  const handleCancelRestore = () => {
    if (restoringMaster) return;
    setShowRestoreConfirmModal(false);
    setPendingRestoreFile(null);
  };

  const handleRestoreImagesZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      setRestoreFeedback({
        type: 'error',
        message: 'Por favor selecciona un archivo comprimido .zip válido.',
      });
      return;
    }

    setRestoringZip(true);
    setRestoreFeedback(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await authFetch('/api/restore-uploads-zip', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setRestoreFeedback({
          type: 'success',
          message: data.message || `Se restauraron exitosamente las imágenes.`,
        });
        fetchMediaStats();
      } else {
        setRestoreFeedback({
          type: 'error',
          message: data.error || 'Error al restaurar el archivo de imágenes.',
        });
      }
    } catch (err: any) {
      setRestoreFeedback({
        type: 'error',
        message: err?.message || 'Error de conexión al subir el respaldo de imágenes.',
      });
    } finally {
      setRestoringZip(false);
      // Reset input value
      e.target.value = '';
    }
  };

  const initDbSqlContent = `-- ====================================================================
-- ESQUEMA COMPLETO POSTGRESQL PARA COMERXIA APP (Node.js Directo)
-- Base de Datos: comerxia_db
-- ====================================================================

-- 1. Tabla de Usuarios Administradores y Operadores
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  uid TEXT UNIQUE,
  username TEXT UNIQUE,
  password TEXT NOT NULL DEFAULT 'admin',
  email TEXT NOT NULL DEFAULT 'admin@comerxia.com',
  name TEXT DEFAULT 'Administrador',
  role TEXT DEFAULT 'admin',
  photo_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  activation_code TEXT,
  activation_expires_at TIMESTAMP,
  reset_code TEXT,
  reset_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Tabla de Configuración de Bot de Telegram y Proveedor
CREATE TABLE IF NOT EXISTS telegram_configs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_token TEXT,
  webhook_secret TEXT,
  supplier_name TEXT DEFAULT 'Proveedor Telegram Principal',
  supplier_username TEXT,
  auto_approve BOOLEAN DEFAULT TRUE,
  default_margin_percent INTEGER DEFAULT 35,
  currency TEXT DEFAULT 'USD',
  default_stock_enabled BOOLEAN DEFAULT FALSE,
  default_stock_quantity INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Tabla de Artículos de Inventario
CREATE TABLE IF NOT EXISTS inventory_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  sale_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  discount_percent INTEGER DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 1,
  image_url TEXT,
  supplier_name TEXT DEFAULT 'Proveedor Telegram',
  tags TEXT,
  extracted_attributes TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  raw_telegram_message TEXT,
  marketing_copy TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Tabla de Mensajes Recibidos de Telegram
CREATE TABLE IF NOT EXISTS telegram_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_message_id TEXT,
  sender_name TEXT,
  sender_username TEXT,
  caption TEXT,
  photo_url TEXT,
  processed_status TEXT NOT NULL DEFAULT 'processed',
  extracted_data TEXT,
  inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Tabla de Directorio de Clientes (CRM)
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  ci TEXT,
  email TEXT,
  address TEXT,
  province TEXT,
  canton TEXT,
  parish TEXT,
  exact_address TEXT,
  reference TEXT,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_spent NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  last_order_date TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. Tabla de Pedidos de Clientes (Tienda Online)
CREATE TABLE IF NOT EXISTS customer_orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_ci TEXT,
  customer_address TEXT,
  items TEXT NOT NULL DEFAULT '[]',
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  payment_method TEXT DEFAULT 'whatsapp',
  status TEXT NOT NULL DEFAULT 'pending',
  payment_voucher TEXT,
  notes TEXT,
  tracking_number TEXT,
  tracking_carrier TEXT,
  tracking_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 7. Tabla de Configuración de la Tienda Online
CREATE TABLE IF NOT EXISTS store_configs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_name TEXT DEFAULT 'Comerxia Store',
  whatsapp_number TEXT DEFAULT '',
  description TEXT DEFAULT 'Catálogo digital con envíos y pedidos directos',
  banner_text TEXT DEFAULT '🔥 ¡Catálogo actualizado con las últimas novedades en stock!',
  delivery_fee NUMERIC(12, 2) DEFAULT 0.00,
  min_order_amount NUMERIC(12, 2) DEFAULT 0.00,
  currency TEXT DEFAULT 'USD',
  show_stock BOOLEAN DEFAULT TRUE,
  instagram_url TEXT,
  website_url TEXT,
  address TEXT,
  logo_url TEXT,
  logo_desktop_url TEXT,
  courier_logos TEXT,
  payment_logos TEXT,
  theme TEXT DEFAULT 'classic',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 8. Tabla de Configuración de Inteligencia Artificial (Gemini)
CREATE TABLE IF NOT EXISTS ai_configs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key TEXT,
  model_name TEXT DEFAULT 'gemini-3.7-flash',
  temperature NUMERIC(3, 2) DEFAULT 0.20,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 9. Tabla de Configuración de Dominios y Subdominios (Enrutamiento)
CREATE TABLE IF NOT EXISTS server_domain_configs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_domain TEXT DEFAULT 'admin.dominio1.com',
  store_domain TEXT DEFAULT 'www.dominio1.com, dominio1.com',
  auto_routing BOOLEAN DEFAULT TRUE,
  default_fallback_view TEXT DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 10. Tabla de Configuración de Correo Electrónico (Gmail SMTP)
CREATE TABLE IF NOT EXISTS email_configs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_email TEXT,
  google_app_password TEXT,
  sender_name TEXT DEFAULT 'Comerxia App',
  smtp_host TEXT DEFAULT 'smtp.gmail.com',
  smtp_port INTEGER DEFAULT 465,
  smtp_secure BOOLEAN DEFAULT TRUE,
  require_activation BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);`;

  const envLocalContent = `# =================================================================
# VARIABLES DE ENTORNO PARA SERVIDOR LOCAL (Node.js + PostgreSQL)
# Archivo: .env (Copiar desde .env.example)
# Permisos recomendados: chmod 600 .env
# =================================================================

PORT=3000
NODE_ENV=production
APP_URL=http://localhost:3000
JWT_SECRET=comerxia_clave_secreta_jwt_local_2026

# Conexión a Base de Datos PostgreSQL Local
SQL_HOST=127.0.0.1
SQL_PORT=5432
SQL_USER=postgres
SQL_PASSWORD=postgres
SQL_DB_NAME=comerxia_db
SQL_SSL=false

# O Cadena de conexión directa completa (recomendada):
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/comerxia_db

# Claves de Integración (Opcionales)
GEMINI_API_KEY=
TELEGRAM_BOT_TOKEN=

# Configuración de Correo Google (Gmail SMTP)
GOOGLE_EMAIL=
GOOGLE_APP_PASSWORD=
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_FROM_NAME=Comerxia App`;

  const deployShContent = `#!/bin/bash
# ==========================================================
# Script de Despliegue Directo con Node.js y PostgreSQL
# Ejecutar como usuario: root (root@servidor:~#)
# ==========================================================
set -e

# Verificar ejecución como root
if [ "$EUID" -ne 0 ]; then
  echo "⚠️ Por favor ejecuta este script como usuario root: sudo bash deploy-local.sh"
  exit 1
fi

echo "🚀 Iniciando despliegue de Comerxia en Servidor (Usuario: root)..."

# 1. Verificar archivo de variables de entorno
if [ ! -f .env ]; then
  echo "⚠️ Creando archivo .env desde .env.example..."
  cp .env.example .env
  chmod 600 .env
fi

# 2. Instalar dependencias de Node.js
echo "📦 Instalando dependencias de Node.js..."
npm install --production=false

# 3. Compilar aplicación (Frontend Vite + Backend Express CJS)
echo "⚙️ Compilando aplicación para producción..."
npm run build

# 4. Iniciar servidor con PM2 o Node.js directo
if command -v pm2 &> /dev/null; then
  echo "✅ Iniciando / Recargando aplicación con PM2..."
  pm2 restart comerxia || pm2 start dist/server.cjs --name "comerxia"
  pm2 save
else
  echo "✅ ¡Compilación exitosa! Iniciando servidor en puerto 3000..."
  node dist/server.cjs
fi`;

  const pm2ConfigContent = `// ecosystem.config.cjs
// Mantener Comerxia activo 24/7 en segundo plano con PM2
module.exports = {
  apps: [
    {
      name: 'comerxia-app',
      script: 'dist/server.cjs',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-6xl w-full p-4 sm:p-6 shadow-2xl relative max-h-[94vh] flex flex-col text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center shadow-xs text-sky-600 shrink-0">
              <Settings className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-xl font-bold text-slate-900 tracking-tight">
                  Configuración del Sistema
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <Database className="w-3 h-3 text-emerald-600" />
                  PostgreSQL Directo
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate sm:whitespace-normal">
                Ajustes de tienda, canales (Telegram, IA, Gmail), servidor local y base de datos.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition cursor-pointer shrink-0"
            title="Cerrar configuración"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MAIN BODY: Vertical Sidebar Menu on Left + Content Panel on Right */}
        <div className="flex-1 flex flex-col md:flex-row gap-4 lg:gap-6 min-h-0 overflow-hidden pt-3 sm:pt-4">
          
          {/* Vertical Menu on the Left */}
          <aside className="w-full md:w-64 lg:w-72 shrink-0 flex md:flex-col overflow-x-auto md:overflow-x-visible md:overflow-y-auto no-scrollbar border-b md:border-b-0 md:border-r border-slate-200/80 pr-0 md:pr-4 pb-2.5 md:pb-0 gap-3 md:gap-4">
            {/* Group 1: Tienda & Canales */}
            <div className="shrink-0 min-w-max md:min-w-0 w-full">
              <div className="hidden md:block px-2.5 pb-1 text-[10px] font-black tracking-wider text-slate-400 uppercase">
                Tienda & Canales
              </div>
              <div className="flex md:flex-col gap-1.5 md:space-y-1">
                {/* 1. Ajustes de Tienda - Primer elemento */}
                <button
                  type="button"
                  onClick={() => setActiveTab('store')}
                  className={`text-left px-3 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between shrink-0 group ${
                    activeTab === 'store'
                      ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 bg-slate-50 md:bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition ${
                      activeTab === 'store'
                        ? 'bg-white/20 text-white'
                        : 'bg-emerald-100 text-emerald-700 group-hover:scale-105'
                    }`}>
                      <Store className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">Ajustes de Tienda</div>
                      <div className={`text-[10px] hidden sm:block truncate ${activeTab === 'store' ? 'text-emerald-100' : 'text-slate-400'}`}>
                        Datos, moneda y logo
                      </div>
                    </div>
                  </div>
                  {activeTab === 'store' && (
                    <span className="w-1.5 h-5 rounded-full bg-white shrink-0 hidden md:block" />
                  )}
                </button>

                {/* 2. Bot Telegram */}
                <button
                  type="button"
                  onClick={() => setActiveTab('telegram')}
                  className={`text-left px-3 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between shrink-0 group ${
                    activeTab === 'telegram'
                      ? 'bg-sky-600 text-white shadow-xs font-semibold'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 bg-slate-50 md:bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition ${
                      activeTab === 'telegram'
                        ? 'bg-white/20 text-white'
                        : 'bg-sky-100 text-sky-700 group-hover:scale-105'
                    }`}>
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">Bot Telegram</div>
                      <div className={`text-[10px] hidden sm:block truncate ${activeTab === 'telegram' ? 'text-sky-100' : 'text-slate-400'}`}>
                        Catálogo y fotos de stock
                      </div>
                    </div>
                  </div>
                  {activeTab === 'telegram' && (
                    <span className="w-1.5 h-5 rounded-full bg-white shrink-0 hidden md:block" />
                  )}
                </button>

                {/* 3. IA Google */}
                <button
                  type="button"
                  onClick={() => setActiveTab('ai')}
                  className={`text-left px-3 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between shrink-0 group ${
                    activeTab === 'ai'
                      ? 'bg-purple-600 text-white shadow-xs font-semibold'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 bg-slate-50 md:bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition ${
                      activeTab === 'ai'
                        ? 'bg-white/20 text-white'
                        : 'bg-purple-100 text-purple-700 group-hover:scale-105'
                    }`}>
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">IA Google (Gemini)</div>
                      <div className={`text-[10px] hidden sm:block truncate ${activeTab === 'ai' ? 'text-purple-100' : 'text-slate-400'}`}>
                        Extracción inteligente
                      </div>
                    </div>
                  </div>
                  {activeTab === 'ai' && (
                    <span className="w-1.5 h-5 rounded-full bg-white shrink-0 hidden md:block" />
                  )}
                </button>

                {/* 4. Correo Gmail */}
                <button
                  type="button"
                  onClick={() => setActiveTab('email')}
                  className={`text-left px-3 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between shrink-0 group ${
                    activeTab === 'email'
                      ? 'bg-rose-600 text-white shadow-xs font-semibold'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 bg-slate-50 md:bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition ${
                      activeTab === 'email'
                        ? 'bg-white/20 text-white'
                        : 'bg-rose-100 text-rose-700 group-hover:scale-105'
                    }`}>
                      <Mail className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">Correo Gmail</div>
                      <div className={`text-[10px] hidden sm:block truncate ${activeTab === 'email' ? 'text-rose-100' : 'text-slate-400'}`}>
                        Notificaciones SMTP
                      </div>
                    </div>
                  </div>
                  {activeTab === 'email' && (
                    <span className="w-1.5 h-5 rounded-full bg-white shrink-0 hidden md:block" />
                  )}
                </button>
              </div>
            </div>

            {/* Group 2: Servidor & Sistema */}
            <div className="shrink-0 min-w-max md:min-w-0 w-full">
              <div className="hidden md:block px-2.5 pb-1 text-[10px] font-black tracking-wider text-slate-400 uppercase">
                Servidor & Base de Datos
              </div>
              <div className="flex md:flex-col gap-1.5 md:space-y-1">
                {/* 5. Despliegue */}
                <button
                  type="button"
                  onClick={() => setActiveTab('deploy')}
                  className={`text-left px-3 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between shrink-0 group ${
                    activeTab === 'deploy'
                      ? 'bg-slate-900 text-white shadow-xs font-semibold'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 bg-slate-50 md:bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition ${
                      activeTab === 'deploy'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 text-slate-700 group-hover:scale-105'
                    }`}>
                      <Server className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">Despliegue</div>
                      <div className={`text-[10px] hidden sm:block truncate ${activeTab === 'deploy' ? 'text-slate-300' : 'text-slate-400'}`}>
                        Guía Node.js y scripts
                      </div>
                    </div>
                  </div>
                  {activeTab === 'deploy' && (
                    <span className="w-1.5 h-5 rounded-full bg-sky-400 shrink-0 hidden md:block" />
                  )}
                </button>

                {/* 6. Diagnostico DB */}
                <button
                  type="button"
                  onClick={() => setActiveTab('status')}
                  className={`text-left px-3 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between shrink-0 group ${
                    activeTab === 'status'
                      ? 'bg-slate-900 text-white shadow-xs font-semibold'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 bg-slate-50 md:bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition ${
                      activeTab === 'status'
                        ? 'bg-white/20 text-white'
                        : 'bg-indigo-100 text-indigo-700 group-hover:scale-105'
                    }`}>
                      <Database className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">Diagnóstico DB</div>
                      <div className={`text-[10px] hidden sm:block truncate ${activeTab === 'status' ? 'text-slate-300' : 'text-slate-400'}`}>
                        Estado PostgreSQL y test
                      </div>
                    </div>
                  </div>
                  {activeTab === 'status' && (
                    <span className="w-1.5 h-5 rounded-full bg-indigo-400 shrink-0 hidden md:block" />
                  )}
                </button>

                {/* 7. Subdominios */}
                <button
                  type="button"
                  onClick={() => setActiveTab('domains')}
                  className={`text-left px-3 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between shrink-0 group ${
                    activeTab === 'domains'
                      ? 'bg-slate-900 text-white shadow-xs font-semibold'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 bg-slate-50 md:bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition ${
                      activeTab === 'domains'
                        ? 'bg-white/20 text-white'
                        : 'bg-sky-100 text-sky-700 group-hover:scale-105'
                    }`}>
                      <Globe className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">Subdominios</div>
                      <div className={`text-[10px] hidden sm:block truncate ${activeTab === 'domains' ? 'text-slate-300' : 'text-slate-400'}`}>
                        Rutas admin y tienda
                      </div>
                    </div>
                  </div>
                  {activeTab === 'domains' && (
                    <span className="w-1.5 h-5 rounded-full bg-sky-400 shrink-0 hidden md:block" />
                  )}
                </button>

                {/* 8. Seguridad */}
                <button
                  type="button"
                  onClick={() => setActiveTab('security')}
                  className={`text-left px-3 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between shrink-0 group ${
                    activeTab === 'security'
                      ? 'bg-slate-900 text-white shadow-xs font-semibold'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 bg-slate-50 md:bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition ${
                      activeTab === 'security'
                        ? 'bg-white/20 text-white'
                        : 'bg-amber-100 text-amber-700 group-hover:scale-105'
                    }`}>
                      <Shield className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">Seguridad & SSL</div>
                      <div className={`text-[10px] hidden sm:block truncate ${activeTab === 'security' ? 'text-slate-300' : 'text-slate-400'}`}>
                        Cloudflare y hardening
                      </div>
                    </div>
                  </div>
                  {activeTab === 'security' && (
                    <span className="w-1.5 h-5 rounded-full bg-amber-400 shrink-0 hidden md:block" />
                  )}
                </button>

                {/* 9. Backup */}
                <button
                  type="button"
                  onClick={() => setActiveTab('backup')}
                  className={`text-left px-3 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between shrink-0 group ${
                    activeTab === 'backup'
                      ? 'bg-slate-900 text-white shadow-xs font-semibold'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 bg-slate-50 md:bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition ${
                      activeTab === 'backup'
                        ? 'bg-white/20 text-white'
                        : 'bg-teal-100 text-teal-700 group-hover:scale-105'
                    }`}>
                      <Download className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">Copias de Seguridad</div>
                      <div className={`text-[10px] hidden sm:block truncate ${activeTab === 'backup' ? 'text-slate-300' : 'text-slate-400'}`}>
                        Dump SQL y multimedia
                      </div>
                    </div>
                  </div>
                  {activeTab === 'backup' && (
                    <span className="w-1.5 h-5 rounded-full bg-teal-400 shrink-0 hidden md:block" />
                  )}
                </button>
              </div>
            </div>

            {/* Group 3: Mantenimiento Dev */}
            <div className="shrink-0 min-w-max md:min-w-0 w-full">
              <div className="hidden md:block px-2.5 pb-1 text-[10px] font-black tracking-wider text-slate-400 uppercase">
                Mantenimiento
              </div>
              <div className="flex md:flex-col gap-1.5 md:space-y-1">
                {/* 10. Limpieza de datos */}
                <button
                  type="button"
                  onClick={() => setActiveTab('sandbox')}
                  className={`text-left px-3 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between shrink-0 group ${
                    activeTab === 'sandbox'
                      ? 'bg-rose-600 text-white shadow-xs font-semibold'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 bg-slate-50 md:bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition ${
                      activeTab === 'sandbox'
                        ? 'bg-white/20 text-white'
                        : 'bg-rose-100 text-rose-700 group-hover:scale-105'
                    }`}>
                      <RotateCcw className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">Limpiar Pruebas</div>
                      <div className={`text-[10px] hidden sm:block truncate ${activeTab === 'sandbox' ? 'text-rose-100' : 'text-slate-400'}`}>
                        Purga de registros dummy
                      </div>
                    </div>
                  </div>
                  {activeTab === 'sandbox' && (
                    <span className="w-1.5 h-5 rounded-full bg-white shrink-0 hidden md:block" />
                  )}
                </button>
              </div>
            </div>
          </aside>

          {/* Right Main Content Panel */}
          <main className="flex-1 min-w-0 overflow-y-auto pl-0 md:pl-2 pr-1 space-y-4">
          {/* ========================================================
              TAB: MODO DEV / LIMPIEZA DE DATOS DE PRUEBA (SANDBOX)
             ======================================================== */}
          {activeTab === 'sandbox' && (
            <DevTestingTab onSuccess={onConfigSaved} />
          )}

          {/* ========================================================
              TAB: TELEGRAM BOT
             ======================================================== */}
          {activeTab === 'telegram' && (
            <TelegramBotConfigModal
              embedded={true}
              config={config || null}
              onConfigSaved={onConfigSaved || (() => {})}
              onClose={onClose}
            />
          )}

          {/* ========================================================
              TAB: GOOGLE AI GEMINI
             ======================================================== */}
          {activeTab === 'ai' && (
            <GoogleAiConfigModal
              embedded={true}
              onConfigSaved={onConfigSaved || (() => {})}
              onClose={onClose}
            />
          )}

          {/* ========================================================
              TAB: CORREO GMAIL (SMTP)
             ======================================================== */}
          {activeTab === 'email' && (
            <GmailConfigTab onSaved={onConfigSaved} />
          )}

          {/* ========================================================
              TAB: AJUSTES DE TIENDA
             ======================================================== */}
          {activeTab === 'store' && (
            <StoreSettingsTab
              initialConfig={storeConfig}
              onSaved={onStoreConfigSaved}
            />
          )}

          {/* ========================================================
              TAB: DIAGNÓSTICO Y PROBADOR DB
             ======================================================== */}
          {activeTab === 'status' && (
            <div className="space-y-4">
              {/* Current Server DB Status */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Database className="w-4 h-4 text-sky-600" />
                    Estado del Motor de Base de Datos Activo
                  </h3>
                  <button
                    onClick={fetchDatabaseInfo}
                    disabled={loadingDbInfo}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingDbInfo ? 'animate-spin' : ''}`} />
                    <span>Actualizar Estado</span>
                  </button>
                </div>

                {dbInfo ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                      <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                        <p className="text-[10px] text-slate-500 font-semibold uppercase">Modo Activo</p>
                        <p className={`text-xs font-bold truncate mt-0.5 ${dbInfo.connected ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {dbInfo.modeLabel || (dbInfo.connected ? 'Conectado' : 'Pendiente')}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                        <p className="text-[10px] text-slate-500 font-semibold uppercase">Host / Servidor</p>
                        <p className="text-xs font-bold text-sky-700 font-mono truncate mt-0.5">{dbInfo.host}:{dbInfo.port}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                        <p className="text-[10px] text-slate-500 font-semibold uppercase">Base de Datos</p>
                        <p className="text-xs font-bold text-indigo-700 font-mono truncate mt-0.5">{dbInfo.database}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                        <p className="text-[10px] text-slate-500 font-semibold uppercase">Latencia (Ping)</p>
                        <p className="text-xs font-bold text-emerald-700 font-mono mt-0.5">
                          {dbInfo.pingMs ? `${dbInfo.pingMs} ms` : (dbInfo.connected ? 'Local directo' : 'N/A')}
                        </p>
                      </div>
                    </div>

                    {dbInfo.error && (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-semibold">Información del entorno actual:</p>
                          <p className="text-[11px] text-amber-800 leading-relaxed">
                            {dbInfo.hint || dbInfo.error}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-slate-500">Cargando diagnóstico...</div>
                )}
              </div>

              {/* Interactive Connection Tester */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-indigo-600" />
                    Probar Conexión con PostgreSQL Local
                  </h3>
                  <button
                    type="button"
                    onClick={() => setUseConnString(!useConnString)}
                    className="text-xs text-sky-600 hover:text-sky-700 underline cursor-pointer font-medium"
                  >
                    {useConnString ? 'Usar campos separados' : 'Usar URL de conexión'}
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Verifica que tus credenciales y servidor PostgreSQL local respondan correctamente en el puerto configurado.
                </p>

                <form onSubmit={handleTestConnection} className="space-y-3 pt-1">
                  {useConnString ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Cadena de Conexión (DATABASE_URL):
                      </label>
                      <input
                        type="text"
                        value={testConnString}
                        onChange={(e) => setTestConnString(e.target.value)}
                        placeholder="postgresql://postgres:postgres@127.0.0.1:5432/comerxia_db"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">Host / IP:</label>
                        <input
                          type="text"
                          value={testHost}
                          onChange={(e) => setTestHost(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-mono text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">Puerto:</label>
                        <input
                          type="text"
                          value={testPort}
                          onChange={(e) => setTestPort(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-mono text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">Base de Datos:</label>
                        <input
                          type="text"
                          value={testDbName}
                          onChange={(e) => setTestDbName(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-mono text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">Usuario:</label>
                        <input
                          type="text"
                          value={testUser}
                          onChange={(e) => setTestUser(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-mono text-slate-900"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">Contraseña:</label>
                        <input
                          type="password"
                          value={testPassword}
                          onChange={(e) => setTestPassword(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-mono text-slate-900"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="submit"
                      disabled={testing}
                      className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center space-x-2 transition shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      <span>{testing ? 'Comprobando conexión...' : 'Probar Conexión SQL'}</span>
                    </button>
                  </div>
                </form>

                {/* Test Result Box */}
                {testResult && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs flex items-start space-x-2.5 ${
                      testResult.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {testResult.ok ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <p className="font-bold">{testResult.message}</p>
                      {testResult.version && (
                        <p className="text-[11px] text-emerald-700 font-mono">
                          Versión detectada: {testResult.version} (Ping: {testResult.pingMs}ms)
                        </p>
                      )}
                      {(testResult as any).hint && (
                        <p className="text-[11px] text-rose-700/90 leading-relaxed pt-1">
                          {(testResult as any).hint}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================
              TAB 2: SUBDOMINIOS Y ENRUTAMIENTO DINÁMICO
             ======================================================== */}
          {activeTab === 'domains' && (
            <div className="space-y-4">
              {/* Header Banner */}
              <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-sky-600" />
                    Enrutamiento por Subdominio y Dominios Personalizados
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Configura qué pantalla se muestra automáticamente según el subdominio o dominio que el usuario o cliente escriba en su navegador.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchDomainConfig}
                  disabled={loadingDomainConfig}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition cursor-pointer shadow-2xs self-start sm:self-auto"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingDomainConfig ? 'animate-spin' : ''}`} />
                  <span>Recargar</span>
                </button>
              </div>

              {/* Main Subdomain Configuration Form */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-sky-600" />
                      Reglas de Mapeo de Subdominios
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Los cambios se guardan en la base de datos PostgreSQL / Servidor y se aplican inmediatamente.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSaveDomainConfig} className="space-y-4">
                  {/* Field 1: Admin & Login Subdomain */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-indigo-600" />
                        Subdominio para Pantalla de Login / Panel Administrador:
                      </span>
                      <span className="text-[10px] font-normal text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                        Acceso Administrativo
                      </span>
                    </label>
                    <input
                      type="text"
                      value={adminDomain}
                      onChange={(e) => setAdminDomain(e.target.value)}
                      placeholder="admin.dominio1.com, panel.dominio1.com"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition"
                    />
                    <p className="text-[11px] text-slate-500">
                      Ejemplo: <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">admin.dominio1.com</code> o <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">panel.dominio1.com</code>. Quien ingrese por esta URL verá directamente el formulario de inicio de sesión seguro.
                    </p>
                  </div>

                  {/* Field 2: Public Storefront Domain(s) */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-emerald-600" />
                        Subdominio(s) / Dominio para Tienda Online Pública (Clientes):
                      </span>
                      <span className="text-[10px] font-normal text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Catálogo Público
                      </span>
                    </label>
                    <input
                      type="text"
                      value={storeDomain}
                      onChange={(e) => setStoreDomain(e.target.value)}
                      placeholder="www.dominio1.com, dominio1.com, tienda.dominio1.com"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition"
                    />
                    <p className="text-[11px] text-slate-500">
                      Puedes ingresar varios dominios separados por comas. Ejemplo: <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">www.dominio1.com, dominio1.com</code>. Cualquier cliente que ingrese por estas URLs verá el catálogo de compras.
                    </p>
                  </div>

                  {/* Switch & Fallback controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {/* Auto-Routing Switch */}
                    <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">Enrutamiento Inteligente Activo</span>
                        <input
                          type="checkbox"
                          checked={autoRouting}
                          onChange={(e) => setAutoRouting(e.target.checked)}
                          className="w-4 h-4 text-sky-600 rounded cursor-pointer"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Detecta automáticamente el dominio en <code className="font-mono">window.location.hostname</code> sin requerir recargar la página.
                      </p>
                    </div>

                    {/* Fallback View Selector */}
                    <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5">
                      <label className="block text-xs font-bold text-slate-800">
                        Vista si se entra por IP / Localhost:
                      </label>
                      <select
                        value={defaultFallbackView}
                        onChange={(e) => setDefaultFallbackView(e.target.value as 'store' | 'admin')}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 cursor-pointer focus:outline-none focus:border-sky-500"
                      >
                        <option value="store">🛒 Tienda Online Pública (Por defecto)</option>
                        <option value="admin">🔐 Pantalla de Login / Panel Administrador</option>
                      </select>
                    </div>
                  </div>

                  {/* Feedback Toast */}
                  {domainConfigFeedback && (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                        domainConfigFeedback.type === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border-rose-200 text-rose-800'
                      }`}
                    >
                      {domainConfigFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span className="font-medium">{domainConfigFeedback.message}</span>
                    </div>
                  )}

                  {/* Save Button */}
                  <div className="flex items-center justify-end pt-2">
                    <button
                      type="submit"
                      disabled={savingDomainConfig}
                      className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center space-x-2 transition shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      {savingDomainConfig ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      <span>{savingDomainConfig ? 'Guardando en Base de Datos...' : 'Guardar Configuración de Dominios'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Interactive Live Subdomain Simulator & Tester */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    Probador y Simulador de Enrutamiento en Vivo
                  </h4>
                  <span className="text-[10px] text-slate-500 font-medium">Prueba en tiempo real</span>
                </div>
                <p className="text-xs text-slate-500">
                  Escribe cualquier dominio para verificar qué pantalla abrirá el sistema con las reglas actuales:
                </p>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={simulatorHostInput}
                    onChange={(e) => setSimulatorHostInput(e.target.value)}
                    placeholder="Escribe ej: admin.dominio1.com o www.dominio1.com"
                    className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSimulatorHostInput('admin.dominio1.com')}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold cursor-pointer"
                    >
                      Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimulatorHostInput('www.dominio1.com')}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold cursor-pointer"
                    >
                      www (Tienda)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimulatorHostInput('dominio1.com')}
                      className="px-2.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-xs font-semibold cursor-pointer"
                    >
                      Apex (Tienda)
                    </button>
                  </div>
                </div>

                {/* Simulation Result */}
                {(() => {
                  const cleanSim = simulatorHostInput.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
                  const adminArr = adminDomain.split(/[,;\n]/).map(d => d.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].trim().toLowerCase()).filter(Boolean);
                  const storeArr = storeDomain.split(/[,;\n]/).map(d => d.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].trim().toLowerCase()).filter(Boolean);
                  
                  let matchedType: 'admin' | 'store' | 'fallback' = 'fallback';
                  let reason = '';

                  if (adminArr.some(d => cleanSim === d || cleanSim.endsWith('.' + d))) {
                    matchedType = 'admin';
                    reason = `Coincide con la regla de administrador configurada (${adminArr.find(d => cleanSim === d || cleanSim.endsWith('.' + d))})`;
                  } else if (storeArr.some(d => cleanSim === d || cleanSim.endsWith('.' + d))) {
                    matchedType = 'store';
                    reason = `Coincide con la regla de tienda pública configurada (${storeArr.find(d => cleanSim === d || cleanSim.endsWith('.' + d))})`;
                  } else if (autoRouting && (cleanSim.startsWith('admin.') || cleanSim === 'admin')) {
                    matchedType = 'admin';
                    reason = 'Prefijo admin.* detectado automáticamente';
                  } else if (autoRouting && (cleanSim.startsWith('www.') || cleanSim.startsWith('tienda.') || cleanSim.startsWith('store.'))) {
                    matchedType = 'store';
                    reason = 'Prefijo de tienda pública detectado automáticamente';
                  } else {
                    matchedType = defaultFallbackView === 'admin' ? 'admin' : 'store';
                    reason = `Dominio no registrado específicamente -> Aplicando vista fallback: ${defaultFallbackView === 'admin' ? 'Panel/Login' : 'Tienda Online'}`;
                  }

                  return (
                    <div
                      className={`p-3.5 rounded-xl border flex items-start space-x-3 transition-all ${
                        matchedType === 'admin'
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      }`}
                    >
                      {matchedType === 'admin' ? (
                        <Lock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                      ) : (
                        <Store className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      )}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">
                            Resultado al visitar <span className="font-mono">{cleanSim || 'ejemplo.com'}</span>:
                          </span>
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                              matchedType === 'admin'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-emerald-600 text-white'
                            }`}
                          >
                            {matchedType === 'admin' ? '🔐 Pantalla de Login / Admin' : '🛒 Tienda Online Pública'}
                          </span>
                        </div>
                        <p className="text-[11px] opacity-90">{reason}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Web Server Reverse Proxy Generators (Nginx & Cloudflare) */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-sky-600" />
                  Configuraciones Generadas para Servidores Web (Nginx / Cloudflare)
                </h4>
                <p className="text-xs text-slate-500">
                  Copia estas configuraciones listas para producción en tu servidor:
                </p>

                {/* Nginx Block */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700">1. Bloque Nginx (/etc/nginx/sites-available/comerxia):</span>
                    <button
                      onClick={() => {
                        const nginxCode = `# Configuración Nginx para Comerxia App
server {
    listen 80;
    server_name ${adminDomain.split(/[,;\n]/).join(' ')} ${storeDomain.split(/[,;\n]/).join(' ')};

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;
                        copyToClipboard(nginxCode, 'nginx-config-snippet');
                      }}
                      className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === 'nginx-config-snippet' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === 'nginx-config-snippet' ? '¡Copiado!' : 'Copiar Nginx'}</span>
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-900 rounded-xl font-mono text-[11px] text-emerald-400 overflow-x-auto">
{`server {
    listen 80;
    server_name ${adminDomain.split(/[,;\n]/).join(' ')} ${storeDomain.split(/[,;\n]/).join(' ')};

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              TAB 3: DESPLIEGUE (Solo Node.js directo + Recrear DB + Scripts)
             ======================================================== */}
          {activeTab === 'deploy' && (
            <div className="space-y-4">
              {/* Sub-Navigation inside Despliegue */}
              <div className="flex items-center space-x-2 border-b border-slate-200 pb-2.5">
                <button
                  onClick={() => setDeploySubTab('guide')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                    deploySubTab === 'guide'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Server className="w-3.5 h-3.5" />
                  <span>1. Pasos de Despliegue (Node.js Directo - Usuario Root)</span>
                </button>

                <button
                  onClick={() => setDeploySubTab('scripts')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                    deploySubTab === 'scripts'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>2. Archivos y Scripts del Proyecto</span>
                </button>
              </div>

              {/* SUB-VIEW 1: PASOS DE DESPLIEGUE NODE.JS DIRECTO (COMO ROOT) */}
              {deploySubTab === 'guide' && (
                <div className="space-y-4">
                  {/* Banner Usuario Root */}
                  <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white border border-slate-700 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[11px] font-bold border border-emerald-500/30">
                          root@servidor:~#
                        </span>
                        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                          Despliegue Nativo como Usuario Root
                        </h3>
                      </div>
                      <p className="text-xs text-slate-300">
                        Todos los comandos de esta guía están diseñados para ejecutarse directamente como superusuario <strong className="text-white font-mono">root</strong> en la terminal de tu VPS o servidor dedicado.
                      </p>
                    </div>
                    <div className="shrink-0">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 text-slate-200 text-xs font-medium border border-white/10">
                        <Shield className="w-3.5 h-3.5 text-emerald-400" />
                        Privilegios de Administrador
                      </span>
                    </div>
                  </div>

                  {/* Step 1: Requisitos e Instalación */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-sky-600 text-white font-bold text-xs flex items-center justify-center">1</span>
                      <h4 className="text-xs font-bold text-slate-900">Preparación del Servidor e Instalación de Requisitos (como Root)</h4>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed pl-8">
                      Si aún no tienes Node.js 20 ni PostgreSQL instalados en tu sistema operativo (Ubuntu/Debian), ejecuta como <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-900 font-bold">root</code>:
                    </p>
                    <div className="pl-8 space-y-2">
                      <div className="p-3 bg-slate-900 rounded-xl font-mono text-xs text-emerald-400 space-y-2 relative">
                        <button
                          onClick={() => copyToClipboard(`apt-get update && apt-get install -y curl git postgresql postgresql-contrib\ncurl -fsSL https://deb.nodesource.com/setup_20.x | bash -\napt-get install -y nodejs`, 'step-1-cmd')}
                          className="absolute right-2.5 top-2.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === 'step-1-cmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'step-1-cmd' ? 'Copiado' : 'Copiar'}</span>
                        </button>
                        <p className="text-slate-400"># 1. Instalar PostgreSQL y herramientas base:</p>
                        <p>apt-get update && apt-get install -y curl git postgresql postgresql-contrib</p>
                        <p className="text-slate-400 mt-2"># 2. Instalar Node.js 20 LTS:</p>
                        <p>curl -fsSL https://deb.nodesource.com/setup_20.x | bash -</p>
                        <p>apt-get install -y nodejs</p>
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Clonar Repositorio GitHub */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-6 h-6 rounded-full bg-sky-600 text-white font-bold text-xs flex items-center justify-center">2</span>
                        <h4 className="text-xs font-bold text-slate-900">Clonar Repositorio de la Aplicación desde GitHub</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(`git clone <URL_DE_TU_REPOSITORIO_GITHUB> comerxia\ncd comerxia`, 'step-2-git')}
                        className="px-2.5 py-1 rounded bg-sky-100 hover:bg-sky-200 text-sky-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'step-2-git' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === 'step-2-git' ? '¡Comando Copiado!' : 'Copiar Comando Git'}</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed pl-8">
                      Descarga el código fuente de Comerxia en la carpeta de tu servidor e ingresa al directorio del proyecto:
                    </p>
                    <div className="pl-8 space-y-2">
                      <div className="p-3 bg-slate-900 rounded-xl font-mono text-xs text-emerald-400 space-y-1 relative">
                        <button
                          onClick={() => copyToClipboard(`git clone <URL_DE_TU_REPOSITORIO_GITHUB> comerxia\ncd comerxia`, 'step-2-git')}
                          className="absolute right-2.5 top-2.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === 'step-2-git' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'step-2-git' ? 'Copiado' : 'Copiar'}</span>
                        </button>
                        <p className="text-slate-400"># Clonar repositorio de GitHub y entrar a la carpeta:</p>
                        <p>git clone &lt;URL_DE_TU_REPOSITORIO_GITHUB&gt; comerxia</p>
                        <p>cd comerxia</p>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Base de Datos PostgreSQL con 3 opciones integradas */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-6 h-6 rounded-full bg-sky-600 text-white font-bold text-xs flex items-center justify-center">3</span>
                        <h4 className="text-xs font-bold text-slate-900">Base de Datos PostgreSQL (Nueva, Existente o Reiniciar)</h4>
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium hidden sm:inline-block">Selecciona tu caso:</span>
                    </div>

                    {/* Selector de Casos de Base de Datos */}
                    <div className="pl-8 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setDbOptionInGuide('create')}
                          className={`p-2.5 rounded-lg text-left transition cursor-pointer border ${
                            dbOptionInGuide === 'create'
                              ? 'bg-sky-50 border-sky-500 text-sky-950 shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold">
                            <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                            <span>Opción A: BD Nueva</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">Primera instalación desde cero.</p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDbOptionInGuide('existing-keep')}
                          className={`p-2.5 rounded-lg text-left transition cursor-pointer border ${
                            dbOptionInGuide === 'existing-keep'
                              ? 'bg-amber-50 border-amber-500 text-amber-950 shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            <span>Opción B: BD ya Existe</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">Conservar datos y aplicar esquema.</p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDbOptionInGuide('existing-reset')}
                          className={`p-2.5 rounded-lg text-left transition cursor-pointer border ${
                            dbOptionInGuide === 'existing-reset'
                              ? 'bg-rose-50 border-rose-500 text-rose-950 shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold">
                            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                            <span>Opción C: Limpiar / Recrear</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">Borrar todo y volver a crear limpia.</p>
                        </button>
                      </div>

                      {/* CASO A: BASE DE DATOS NUEVA */}
                      {dbOptionInGuide === 'create' && (
                        <div className="space-y-2">
                          <p className="text-xs text-slate-600">
                            Crea la base de datos <code className="font-mono bg-white px-1 py-0.5 rounded border text-sky-800 font-bold">comerxia_db</code> e importa el esquema limpio ejecutando como <code className="font-mono bg-white px-1 py-0.5 rounded border font-bold">root</code>:
                          </p>
                          <div className="p-3 bg-slate-900 rounded-xl font-mono text-xs text-emerald-400 space-y-1 relative">
                            <button
                              onClick={() => copyToClipboard(`sudo -u postgres psql -c "CREATE DATABASE comerxia_db;"\nsudo -u postgres psql -d comerxia_db -f init-db.sql`, 'step-2-cmd-create')}
                              className="absolute right-2.5 top-2.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1 cursor-pointer"
                            >
                              {copiedKey === 'step-2-cmd-create' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedKey === 'step-2-cmd-create' ? 'Copiado' : 'Copiar'}</span>
                            </button>
                            <p className="text-slate-400"># 1. Crear base de datos como root vía PostgreSQL</p>
                            <p>sudo -u postgres psql -c "CREATE DATABASE comerxia_db;"</p>
                            <p className="text-slate-400 mt-2"># 2. Inicializar tablas con init-db.sql (Sin usuarios precargados)</p>
                            <p>sudo -u postgres psql -d comerxia_db -f init-db.sql</p>
                          </div>
                        </div>
                      )}

                      {/* CASO B: SI YA EXISTE LA BASE DE DATOS (CONSERVAR DATOS) */}
                      {dbOptionInGuide === 'existing-keep' && (
                        <div className="space-y-2">
                          <p className="text-xs text-slate-600">
                            Si ya tienes creada la base de datos <code className="font-mono bg-white px-1 py-0.5 rounded border text-amber-800 font-bold">comerxia_db</code> y quieres mantener tus datos aplicando las tablas que falten:
                          </p>
                          <div className="p-3 bg-slate-900 rounded-xl font-mono text-xs text-emerald-400 space-y-1 relative">
                            <button
                              onClick={() => copyToClipboard(`sudo -u postgres psql -d comerxia_db -f init-db.sql`, 'step-2-cmd-keep')}
                              className="absolute right-2.5 top-2.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1 cursor-pointer"
                            >
                              {copiedKey === 'step-2-cmd-keep' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedKey === 'step-2-cmd-keep' ? 'Copiado' : 'Copiar'}</span>
                            </button>
                            <p className="text-slate-400"># Aplicar esquema seguro (CREATE TABLE IF NOT EXISTS) sin borrar datos:</p>
                            <p>sudo -u postgres psql -d comerxia_db -f init-db.sql</p>
                          </div>
                        </div>
                      )}

                      {/* CASO C: SI YA EXISTE LA BASE DE DATOS Y DESEAS RECREARLA / LIMPIARLA */}
                      {dbOptionInGuide === 'existing-reset' && (
                        <div className="space-y-2">
                          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <p className="text-[11px] leading-relaxed">
                              <strong>Atención:</strong> Esta opción desconecta todas las conexiones, elimina completamente <code className="font-mono font-bold">comerxia_db</code> y la vuelve a crear limpia desde cero.
                            </p>
                          </div>
                          <div className="p-3 bg-slate-900 rounded-xl font-mono text-xs text-emerald-400 space-y-1 relative">
                            <button
                              onClick={() => copyToClipboard(`sudo -u postgres psql -c "DROP DATABASE IF EXISTS comerxia_db WITH (FORCE);" && sudo -u postgres psql -c "CREATE DATABASE comerxia_db;" && sudo -u postgres psql -d comerxia_db -f init-db.sql`, 'step-2-cmd-reset')}
                              className="absolute right-2.5 top-2.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1 cursor-pointer"
                            >
                              {copiedKey === 'step-2-cmd-reset' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedKey === 'step-2-cmd-reset' ? 'Copiado' : 'Copiar'}</span>
                            </button>
                            <p className="text-slate-400"># Borrar base previa, recrear limpia e inicializar en 1 solo comando:</p>
                            <p className="break-all">sudo -u postgres psql -c "DROP DATABASE IF EXISTS comerxia_db WITH (FORCE);" && sudo -u postgres psql -c "CREATE DATABASE comerxia_db;" && sudo -u postgres psql -d comerxia_db -f init-db.sql</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 4: Variables de Entorno */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-6 h-6 rounded-full bg-sky-600 text-white font-bold text-xs flex items-center justify-center">4</span>
                        <h4 className="text-xs font-bold text-slate-900">Crear Archivo de Variables de Entorno (.env) como Root</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(`cat << 'EOF' > .env\nPORT=3000\nNODE_ENV=production\nAPP_URL=http://localhost:3000\nJWT_SECRET=comerxia_jwt_secret_local_2026_super_secure_key\nDATABASE_URL=postgresql://postgres:postgres@localhost:5432/comerxia_db\nSQL_HOST=127.0.0.1\nSQL_PORT=5432\nSQL_USER=postgres\nSQL_PASSWORD=postgres\nSQL_DB_NAME=comerxia_db\nSQL_SSL=false\nGEMINI_API_KEY=\nTELEGRAM_BOT_TOKEN=\nEOF\nchmod 600 .env`, 'step-3-heredoc')}
                        className="px-2.5 py-1 rounded bg-sky-100 hover:bg-sky-200 text-sky-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'step-3-heredoc' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === 'step-3-heredoc' ? '¡Comando Copiado!' : 'Copiar Comando .env'}</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed pl-8">
                      Crea directamente el archivo <code className="font-mono bg-white px-1 py-0.5 rounded border text-slate-900 font-bold">.env</code> y fija los permisos seguros (<code className="font-mono text-slate-900 font-bold">chmod 600</code>) pegando este bloque en tu terminal:
                    </p>
                    <div className="pl-8 space-y-2">
                      <div className="p-3 bg-slate-900 rounded-xl font-mono text-xs text-emerald-400 space-y-1 relative">
                        <button
                          onClick={() => copyToClipboard(`cat << 'EOF' > .env\nPORT=3000\nNODE_ENV=production\nAPP_URL=http://localhost:3000\nJWT_SECRET=comerxia_jwt_secret_local_2026_super_secure_key\nDATABASE_URL=postgresql://postgres:postgres@localhost:5432/comerxia_db\nSQL_HOST=127.0.0.1\nSQL_PORT=5432\nSQL_USER=postgres\nSQL_PASSWORD=postgres\nSQL_DB_NAME=comerxia_db\nSQL_SSL=false\nGEMINI_API_KEY=\nTELEGRAM_BOT_TOKEN=\nEOF\nchmod 600 .env`, 'step-3-heredoc')}
                          className="absolute right-2.5 top-2.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === 'step-3-heredoc' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'step-3-heredoc' ? 'Copiado' : 'Copiar'}</span>
                        </button>
                        <p className="text-slate-400"># Crear .env y asignar permisos chmod 600 directamente:</p>
                        <p>cat &lt;&lt; 'EOF' &gt; .env</p>
                        <p>PORT=3000</p>
                        <p>NODE_ENV=production</p>
                        <p>APP_URL=http://localhost:3000</p>
                        <p>JWT_SECRET=comerxia_jwt_secret_local_2026_super_secure_key</p>
                        <p>DATABASE_URL=postgresql://postgres:postgres@localhost:5432/comerxia_db</p>
                        <p>SQL_HOST=127.0.0.1</p>
                        <p>SQL_PORT=5432</p>
                        <p>SQL_USER=postgres</p>
                        <p>SQL_PASSWORD=postgres</p>
                        <p>SQL_DB_NAME=comerxia_db</p>
                        <p>SQL_SSL=false</p>
                        <p>GEMINI_API_KEY=</p>
                        <p>TELEGRAM_BOT_TOKEN=</p>
                        <p>EOF</p>
                        <p>chmod 600 .env</p>
                      </div>
                    </div>
                  </div>

                  {/* Step 5: Instalar y Compilar */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                    <div className="flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-sky-600 text-white font-bold text-xs flex items-center justify-center">5</span>
                      <h4 className="text-xs font-bold text-slate-900">Instalar Dependencias y Compilar (como Root)</h4>
                    </div>
                    <div className="pl-8">
                      <div className="p-3 bg-slate-900 rounded-xl font-mono text-xs text-emerald-400 space-y-1 relative">
                        <button
                          onClick={() => copyToClipboard(`npm install --production=false\nnpm run build`, 'step-4-cmd')}
                          className="absolute right-2.5 top-2.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === 'step-4-cmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'step-4-cmd' ? 'Copiado' : 'Copiar'}</span>
                        </button>
                        <p>npm install --production=false</p>
                        <p>npm run build</p>
                      </div>
                    </div>
                  </div>

                  {/* Step 6: Iniciar Servidor */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">6</span>
                      <h4 className="text-xs font-bold text-slate-900">Iniciar Servidor Comerxia</h4>
                    </div>

                    <div className="pl-8 space-y-3">
                      {/* Opción 1: Ejecución directa en primer plano */}
                      <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                            <span className="text-xs font-bold text-slate-900">Opción 1: Ejecución Directa en Primer Plano (Pruebas / Terminal)</span>
                          </div>
                          <button
                            onClick={() => copyToClipboard(`npm start`, 'step-5-opt1')}
                            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            {copiedKey === 'step-5-opt1' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedKey === 'step-5-opt1' ? 'Copiado' : 'Copiar Código'}</span>
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          Inicia el servidor directamente en la consola actual (útil para pruebas rápidas):
                        </p>
                        <div className="p-3 bg-slate-900 rounded-lg font-mono text-xs text-emerald-400">
                          <p>npm start</p>
                        </div>
                      </div>

                      {/* Opción 2: Servicio permanente 24/7 con PM2 */}
                      <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                            <span className="text-xs font-bold text-slate-900">Opción 2: Servicio Permanente 24/7 en Segundo Plano con PM2 (Producción)</span>
                          </div>
                          <button
                            onClick={() => copyToClipboard(`npm install -g pm2\npm2 start dist/server.cjs --name "comerxia"\npm2 startup\npm2 save`, 'step-5-opt2')}
                            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            {copiedKey === 'step-5-opt2' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedKey === 'step-5-opt2' ? 'Copiado' : 'Copiar Código'}</span>
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          Instala PM2 para mantener Comerxia corriendo 24/7 y reiniciar automáticamente ante reinicios del VPS:
                        </p>
                        <div className="p-3 bg-slate-900 rounded-lg font-mono text-xs text-emerald-400 space-y-1">
                          <p className="text-slate-400"># 1. Instalar PM2 globalmente</p>
                          <p>npm install -g pm2</p>
                          <p className="text-slate-400 pt-1"># 2. Iniciar proceso en background con el nombre "comerxia"</p>
                          <p>pm2 start dist/server.cjs --name "comerxia"</p>
                          <p className="text-slate-400 pt-1"># 3. Configurar arranque automático del sistema y guardar</p>
                          <p>pm2 startup</p>
                          <p>pm2 save</p>
                        </div>
                      </div>

                      <p className="text-xs text-emerald-700 font-semibold pt-1">
                        🎉 ¡Listo! Tu servidor está activo y escuchando en el puerto 3000 (<span className="underline">http://localhost:3000</span> o tu IP/Dominio).
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-VIEW 2: ARCHIVOS Y SCRIPTS DEL PROYECTO */}
              {deploySubTab === 'scripts' && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 border-b border-slate-200 pb-2 overflow-x-auto">
                    <button
                      onClick={() => setActiveScriptTab('init-db')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                        activeScriptTab === 'init-db'
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>init-db.sql (Esquema DDL)</span>
                    </button>

                    <button
                      onClick={() => setActiveScriptTab('env')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                        activeScriptTab === 'env'
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      <span>.env.example</span>
                    </button>

                    <button
                      onClick={() => setActiveScriptTab('deploy-sh')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                        activeScriptTab === 'deploy-sh'
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>deploy-local.sh</span>
                    </button>

                    <button
                      onClick={() => setActiveScriptTab('pm2')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                        activeScriptTab === 'pm2'
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <HardDrive className="w-3.5 h-3.5" />
                      <span>ecosystem.config.cjs (PM2)</span>
                    </button>
                  </div>

                  {/* Active Script Content */}
                  <div className="rounded-xl border border-slate-200 bg-slate-900 overflow-hidden shadow-xs">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800">
                      <span className="text-xs font-mono text-slate-300">
                        {activeScriptTab === 'init-db' && 'init-db.sql'}
                        {activeScriptTab === 'env' && '.env.example'}
                        {activeScriptTab === 'deploy-sh' && 'deploy-local.sh'}
                        {activeScriptTab === 'pm2' && 'ecosystem.config.cjs'}
                      </span>
                      <button
                        onClick={() => {
                          const content =
                            activeScriptTab === 'init-db'
                              ? initDbSqlContent
                              : activeScriptTab === 'env'
                              ? envLocalContent
                              : activeScriptTab === 'deploy-sh'
                              ? deployShContent
                              : pm2ConfigContent;
                          copyToClipboard(content, `script-${activeScriptTab}`);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center space-x-1 cursor-pointer"
                      >
                        {copiedKey === `script-${activeScriptTab}` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedKey === `script-${activeScriptTab}` ? '¡Copiado!' : 'Copiar Archivo'}</span>
                      </button>
                    </div>
                    <pre className="p-4 text-xs font-mono text-emerald-400 overflow-x-auto leading-relaxed max-h-[380px]">
                      {activeScriptTab === 'init-db' && initDbSqlContent}
                      {activeScriptTab === 'env' && envLocalContent}
                      {activeScriptTab === 'deploy-sh' && deployShContent}
                      {activeScriptTab === 'pm2' && pm2ConfigContent}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================
              TAB 3: SEGURIDAD (Cloudflare Zero Trust + Hardening)
             ======================================================== */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              {/* Sub-Navigation inside Seguridad */}
              <div className="flex items-center space-x-2 border-b border-slate-200 pb-2.5">
                <button
                  onClick={() => setSecuritySubTab('cloudflare')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                    securitySubTab === 'cloudflare'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Cloudflare Zero Trust (Túnel Seguro & HTTPS)</span>
                </button>

                <button
                  onClick={() => setSecuritySubTab('hardening')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                    securitySubTab === 'hardening'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Buenas Prácticas & Seguridad Local</span>
                </button>
              </div>

              {/* SUB-VIEW 1: CLOUDFLARE ZERO TRUST */}
              {securitySubTab === 'cloudflare' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <Globe className="w-5 h-5 text-amber-600" />
                        <h3 className="text-sm font-bold text-amber-950">
                          Cloudflare Zero Trust (Acceso Remoto Seguro sin abrir puertos)
                        </h3>
                      </div>
                      <p className="text-xs text-amber-900/90 leading-relaxed">
                        Publica tu servidor local con HTTPS oficial y dominio propio (ej. <span className="font-mono font-bold">tienda.tudominio.com</span>) sin abrir puertos en tu router ni exponer tu IP pública.
                      </p>
                    </div>
                    <a
                      href="https://one.dash.cloudflare.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center space-x-1.5 transition shadow-xs whitespace-nowrap self-start sm:self-auto cursor-pointer"
                    >
                      <span>Panel Zero Trust</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  {/* Cloudflare Tunnel Steps */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
                        1
                      </div>
                      <h4 className="text-xs font-bold text-slate-900">Crear Túnel en Cloudflare</h4>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Ingresa a <strong>Zero Trust &gt; Networks &gt; Tunnels</strong> y haz clic en <em>Add a tunnel</em> (Cloudflared).
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
                        2
                      </div>
                      <h4 className="text-xs font-bold text-slate-900">Ejecutar el Conector Local</h4>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Copia el comando generado por Cloudflare e instálalo como servicio en tu servidor local (Windows, Linux o macOS).
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
                        3
                      </div>
                      <h4 className="text-xs font-bold text-slate-900">Apuntar a localhost:3000</h4>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        En la pestaña <em>Public Hostname</em>, selecciona tu dominio y apunta el servicio a <code className="text-sky-700 font-bold">HTTP // localhost:3000</code>.
                      </p>
                    </div>
                  </div>

                  {/* Command snippet for Linux / Mac / Windows */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-amber-600" />
                      Comando de Instalación de Cloudflared (Linux / Ubuntu / Debian)
                    </h4>
                    <div className="p-3 bg-slate-900 rounded-xl font-mono text-xs text-emerald-400 space-y-1 relative">
                      <button
                        onClick={() => copyToClipboard(`curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb\nsudo dpkg -i cloudflared.deb\nsudo cloudflared service install <TU_TOKEN_CLOUDFLARE>`, 'cf-cmd')}
                        className="absolute right-2.5 top-2.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'cf-cmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === 'cf-cmd' ? 'Copiado' : 'Copiar'}</span>
                      </button>
                      <p className="text-slate-400"># 1. Descargar paquete oficial</p>
                      <p>curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb</p>
                      <p className="text-slate-400 mt-2"># 2. Instalar</p>
                      <p>sudo dpkg -i cloudflared.deb</p>
                      <p className="text-slate-400 mt-2"># 3. Vincular con tu token de Zero Trust:</p>
                      <p>sudo cloudflared service install &lt;TU_TOKEN_DE_TUNNEL&gt;</p>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-VIEW 2: HARDENING & BUENAS PRÁCTICAS */}
              {securitySubTab === 'hardening' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Reglas de Seguridad para tu Servidor Local
                    </h3>
                    <div className="space-y-2.5 text-xs text-slate-600">
                      <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
                        <p className="font-bold text-slate-900">1. Proteger el archivo .env</p>
                        <p className="text-[11px]">
                          Nunca subas el archivo <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">.env</code> a repositorios públicos de GitHub. Contiene tu clave secreta JWT y la contraseña de PostgreSQL.
                        </p>
                      </div>

                      <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
                        <p className="font-bold text-slate-900">2. Restringir PostgreSQL a localhost (127.0.0.1)</p>
                        <p className="text-[11px]">
                          Asegúrate de que en <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">postgresql.conf</code> la directiva sea <code className="font-mono font-bold text-emerald-700">listen_addresses = 'localhost'</code> para evitar conexiones externas no autorizadas desde Internet.
                        </p>
                      </div>

                      <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
                        <p className="font-bold text-slate-900">3. Generar un JWT_SECRET robusto</p>
                        <p className="text-[11px]">
                          En producción, utiliza una clave aleatoria larga para firmar las sesiones de administrador. Puedes generarla ejecutando:
                        </p>
                        <code className="block mt-1 font-mono text-sky-700 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                          node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
                        </code>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================
              TAB 4: BACKUP (Descargar SQL Dump + JSON + Restauración)
             ======================================================== */}
          {activeTab === 'backup' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-teal-950 flex items-center gap-2">
                    <Download className="w-4 h-4 text-teal-600" />
                    Copias de Seguridad y Respaldo de Datos (100% del Sistema)
                  </h3>
                  <p className="text-xs text-teal-800">
                    Respalda el 100% de tu sistema: base de datos completa con todas las tablas, clientes, compras, finanzas y todos los archivos físicos de fotos y videos.
                  </p>
                </div>
              </div>

              {/* Master Full System Backup (All-in-One: SQL + JSON + Uploads / Media + Script) */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white shadow-md border border-emerald-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5 max-w-xl">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold tracking-wide uppercase">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    Recomendado para Migración a Nuevo Servidor
                  </div>
                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                    <FolderArchive className="w-5 h-5 text-emerald-400" />
                    Respaldo Maestro 100% (Base de Datos + Fotos y Videos)
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Descarga en un solo archivo ZIP todo el sistema: Dump SQL para PostgreSQL, JSON estructurado, script <code className="font-mono bg-black/40 text-emerald-300 px-1 py-0.5 rounded">restaurar.sh</code> y la carpeta física completa de imágenes y videos <code className="font-mono bg-black/40 text-emerald-300 px-1 py-0.5 rounded">/uploads</code> para que nunca falte ninguna foto al migrar.
                  </p>
                </div>

                <div className="shrink-0">
                  <button
                    onClick={handleDownloadMasterZip}
                    disabled={downloadingType !== null}
                    className="w-full sm:w-auto px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-75 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 transition shadow-lg cursor-pointer"
                  >
                    {downloadingType === 'master' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                        <span>Iniciando descarga...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 text-slate-950" />
                        <span>Descargar Respaldo Maestro (.ZIP)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Individual Download Action Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* 1. Backup SQL Dump */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <Database className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-900">Dump SQL Completo (.sql)</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      100% de tablas PostgreSQL: productos, pedidos, clientes CRM, compras, proveedores, finanzas, usuarios y configuraciones.
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadSql}
                    disabled={downloadingType !== null}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-75 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs cursor-pointer"
                  >
                    {downloadingType === 'sql' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Descargando SQL...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>Descargar SQL</span>
                      </>
                    )}
                  </button>
                </div>

                {/* 2. Backup JSON Snapshot */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
                      <FileCode className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-900">Catálogo JSON (.json)</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Copia estructurada con metadatos completos y tablas relacionadas en formato JSON para migraciones rápidas.
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadJson}
                    disabled={downloadingType !== null}
                    className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-75 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs cursor-pointer"
                  >
                    {downloadingType === 'json' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Descargando JSON...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>Descargar JSON</span>
                      </>
                    )}
                  </button>
                </div>

                {/* 3. Backup Images ZIP */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-indigo-200 bg-indigo-50/30 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                        <FolderArchive className="w-5 h-5" />
                      </div>
                      {mediaStats && (
                        <span className="text-[11px] font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-full">
                          {mediaStats.count} archivos ({mediaStats.totalSizeMb} MB)
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-bold text-slate-900">Fotos y Videos (.zip)</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Descarga únicamente la carpeta física <code className="font-mono bg-white px-1 py-0.5 rounded border border-indigo-200 font-bold text-indigo-800">/uploads</code> con todas las fotos y videos de productos.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <button
                      onClick={handleDownloadImagesZip}
                      disabled={downloadingType !== null}
                      className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-75 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs cursor-pointer"
                    >
                      {downloadingType === 'images' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Descargando Multimedia...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>Descargar Multimedia ZIP</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Feedback Alert for Restore Operations */}
              {restoreFeedback && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                    restoreFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {restoreFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{restoreFeedback.message}</span>
                  </div>
                  <button
                    onClick={() => setRestoreFeedback(null)}
                    className="p-1 hover:bg-black/5 rounded text-slate-500 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Restauración desde la UI */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50/60 via-white to-sky-50/60 border border-indigo-100 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                      <Upload className="w-4 h-4 text-indigo-600" />
                      Restaurar en este Servidor desde Archivo ZIP
                    </h4>
                    <p className="text-[11px] text-slate-600">
                      Sube tu <strong>Respaldo Maestro ZIP</strong> (restaura base de datos + fotos/videos a <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200 font-bold text-indigo-900">/uploads</code>) o un archivo ZIP solo de fotos.
                    </p>
                  </div>

                  <label className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm transition cursor-pointer shrink-0">
                    {restoringMaster || restoringZip ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                        <span>Restaurando sistema...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5 text-white" />
                        <span>Subir y Restaurar ZIP</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept=".zip"
                      onChange={handleSelectZipForRestore}
                      disabled={restoringMaster || restoringZip}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Diagnóstico de Integridad de Multimedia */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-teal-600" />
                      Diagnóstico de Integridad de Fotos y Videos
                    </h4>
                    <p className="text-[11px] text-slate-600">
                      Verifica si todas las fotos y videos del catálogo existen físicamente en la carpeta <code className="font-mono text-slate-800 font-bold">/uploads</code> de este servidor.
                    </p>
                  </div>
                  <button
                    onClick={handleRunDiagnostics}
                    disabled={loadingDiagnostics}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold cursor-pointer shrink-0 shadow-2xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${loadingDiagnostics ? 'animate-spin' : ''}`} />
                    <span>{loadingDiagnostics ? 'Verificando...' : 'Verificar Ahora'}</span>
                  </button>
                </div>

                {mediaDiagnostics && (
                  <div className={`p-3 rounded-lg border text-xs ${
                    mediaDiagnostics.missingCount === 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}>
                    <div className="flex items-center gap-2 font-bold mb-1">
                      {mediaDiagnostics.missingCount === 0 ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                      )}
                      <span>
                        {mediaDiagnostics.missingCount === 0
                          ? '¡Integridad 100% Perfecta! Todas las imágenes y videos están en el servidor.'
                          : `Atención: Se encontraron ${mediaDiagnostics.missingCount} archivo(s) faltantes en /uploads/`}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
                      <span>Multimedia en catálogo: <strong>{mediaDiagnostics.totalChecked}</strong></span>
                      <span>Encontrados en servidor: <strong className="text-emerald-700">{mediaDiagnostics.existingCount}</strong></span>
                      <span>Archivos totales en uploads: <strong>{mediaDiagnostics.uploadsTotalFiles}</strong></span>
                    </div>
                    {mediaDiagnostics.missingCount > 0 && (
                      <p className="mt-2 text-[11px] text-amber-800">
                        💡 <strong>Solución:</strong> Descarga el archivo de imágenes o el Respaldo Maestro del servidor original y súbelo aquí arriba para restaurar los archivos faltantes.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Guía de Comandos de Terminal para Respaldar */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-600" />
                    Guía de Terminal: Comandos para Respaldar (Hacer Backup en Servidor)
                  </h4>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-mono bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                    <span>Credenciales: <strong>postgres / postgres</strong> @ comerxia_db</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Método 1: Script de Respaldo Total */}
                  <div className="p-3.5 rounded-xl bg-white border border-emerald-200 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[11px]">1</span>
                      <span>Método 1: Script de Respaldo Total (Automático)</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Ejecuta el script <code className="font-mono text-emerald-800 font-bold">respaldar.sh</code> para volcar la BD y empaquetar multimedia en un archivo comprimido:
                    </p>
                    <div className="p-2.5 bg-slate-900 rounded-lg font-mono text-[11px] text-emerald-400 space-y-1 relative">
                      <button
                        onClick={() => copyToClipboard(`bash respaldar.sh`, 'cmd-backup-script')}
                        className="absolute right-2 top-2 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'cmd-backup-script' ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                        <span>{copiedKey === 'cmd-backup-script' ? 'Copiado' : 'Copiar'}</span>
                      </button>
                      <p className="text-slate-400"># Respaldo de BD + fotos con 1 comando:</p>
                      <p>bash respaldar.sh</p>
                    </div>
                  </div>

                  {/* Método 2: pg_dump directo con credenciales postgres/postgres */}
                  <div className="p-3.5 rounded-xl bg-white border border-sky-200 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-sky-950">
                      <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-800 flex items-center justify-center text-[11px]">2</span>
                      <span>Método 2: Comando Directo pg_dump (TCP / Red)</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Utiliza <code className="font-mono text-sky-800 font-bold">pg_dump</code> enviando la contraseña <code className="font-mono font-bold">postgres</code> sin solicitar prompt interactivo:
                    </p>
                    <div className="p-2.5 bg-slate-900 rounded-lg font-mono text-[11px] text-emerald-400 space-y-1 relative">
                      <button
                        onClick={() => copyToClipboard(`PGPASSWORD='postgres' pg_dump -h 127.0.0.1 -p 5432 -U postgres -d comerxia_db -F p -f comerxia_backup_completo.sql`, 'cmd-backup-pgdump')}
                        className="absolute right-2 top-2 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'cmd-backup-pgdump' ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                        <span>{copiedKey === 'cmd-backup-pgdump' ? 'Copiado' : 'Copiar'}</span>
                      </button>
                      <p className="text-slate-400"># Exportar con usuario postgres y contraseña postgres:</p>
                      <p className="break-all">PGPASSWORD='postgres' pg_dump -h 127.0.0.1 -p 5432 -U postgres -d comerxia_db -F p -f comerxia_backup_completo.sql</p>
                    </div>
                  </div>

                  {/* Método 3: Respaldo Total Manual (Dump SQL + Fotos) */}
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-[11px]">3</span>
                      <span>Método 3: Respaldo Total Manual (BD + /uploads)</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Vuelca la base de datos y genera un comprimido <code className="font-mono text-slate-800 font-bold">.tar.gz</code> con todas las fotos:
                    </p>
                    <div className="p-2.5 bg-slate-900 rounded-lg font-mono text-[11px] text-emerald-400 space-y-1 relative">
                      <button
                        onClick={() => copyToClipboard(`PGPASSWORD='postgres' pg_dump -h 127.0.0.1 -p 5432 -U postgres -d comerxia_db -f comerxia_backup_completo.sql && tar -czvf comerxia_respaldo_total_$(date +%Y%m%d).tar.gz comerxia_backup_completo.sql uploads/`, 'cmd-backup-tar')}
                        className="absolute right-2 top-2 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'cmd-backup-tar' ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                        <span>{copiedKey === 'cmd-backup-tar' ? 'Copiado' : 'Copiar'}</span>
                      </button>
                      <p className="text-slate-400"># Dump SQL + empaquetado de uploads:</p>
                      <p className="break-all">PGPASSWORD='postgres' pg_dump -h 127.0.0.1 -p 5432 -U postgres -d comerxia_db -f comerxia_backup_completo.sql && tar -czvf comerxia_respaldo_total_$(date +%Y%m%d).tar.gz comerxia_backup_completo.sql uploads/</p>
                    </div>
                  </div>

                  {/* Método 4: Con usuario local del sistema (sudo) */}
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-[11px]">4</span>
                      <span>Método 4: Vía Socket Local (sudo -u postgres)</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Si estás conectado como <code className="font-mono text-slate-800 font-bold">root</code> en el servidor Linux:
                    </p>
                    <div className="p-2.5 bg-slate-900 rounded-lg font-mono text-[11px] text-emerald-400 space-y-1 relative">
                      <button
                        onClick={() => copyToClipboard(`sudo -u postgres pg_dump comerxia_db > comerxia_backup_completo.sql`, 'cmd-backup-sudo')}
                        className="absolute right-2 top-2 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'cmd-backup-sudo' ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                        <span>{copiedKey === 'cmd-backup-sudo' ? 'Copiado' : 'Copiar'}</span>
                      </button>
                      <p className="text-slate-400"># Volcar base de datos usando socket unix local:</p>
                      <p className="break-all">sudo -u postgres pg_dump comerxia_db &gt; comerxia_backup_completo.sql</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Explanation / Guide for Restoring Backups */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-slate-700" />
                  Guía de Terminal: ¿Cómo restaurar en un Servidor Nuevo / Remoto?
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Opción 1: Respaldo Maestro Automático */}
                  <div className="p-3.5 rounded-xl bg-white border border-teal-200 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-teal-950">
                      <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-[11px]">A</span>
                      <span>Método 1: Restaurar Respaldo Maestro (Automático)</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      El Respaldo Maestro incluye <code className="font-mono text-teal-800 font-bold">restaurar.sh</code> configurado para <code className="font-mono font-bold">postgres / postgres</code>:
                    </p>
                    <div className="p-2.5 bg-slate-900 rounded-lg font-mono text-[11px] text-emerald-400 space-y-1 relative">
                      <button
                        onClick={() => copyToClipboard(`unzip -o comerxia_respaldo_maestro_*.zip\nbash restaurar.sh`, 'cmd-restore-master')}
                        className="absolute right-2 top-2 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'cmd-restore-master' ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                        <span>{copiedKey === 'cmd-restore-master' ? 'Copiado' : 'Copiar'}</span>
                      </button>
                      <p className="text-slate-400"># Restaurar todo con 1 comando:</p>
                      <p>unzip -o comerxia_respaldo_maestro_*.zip</p>
                      <p>bash restaurar.sh</p>
                    </div>
                  </div>

                  {/* Opción 2: Restauración Manual SQL + Uploads */}
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[11px]">B</span>
                      <span>Método 2: Restaurar SQL y Fotos Manualmente</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Con usuario <code className="font-mono font-bold">postgres</code> y contraseña <code className="font-mono font-bold">postgres</code>:
                    </p>
                    <div className="p-2.5 bg-slate-900 rounded-lg font-mono text-[11px] text-emerald-400 space-y-1 relative">
                      <button
                        onClick={() => copyToClipboard(`PGPASSWORD='postgres' psql -h 127.0.0.1 -p 5432 -U postgres -d comerxia_db -f comerxia_backup_completo.sql\nmkdir -p uploads && unzip -o comerxia_imagenes_*.zip -d uploads/\nchmod -R 755 uploads/`, 'cmd-restore-manual')}
                        className="absolute right-2 top-2 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'cmd-restore-manual' ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                        <span>{copiedKey === 'cmd-restore-manual' ? 'Copiado' : 'Copiar'}</span>
                      </button>
                      <p className="text-slate-400"># 1. Base de datos con PGPASSWORD=postgres:</p>
                      <p className="break-all">PGPASSWORD='postgres' psql -h 127.0.0.1 -p 5432 -U postgres -d comerxia_db -f comerxia_backup_completo.sql</p>
                      <p className="text-slate-400 mt-1"># 2. Extraer fotos:</p>
                      <p>mkdir -p uploads &amp;&amp; unzip -o *.zip -d uploads/</p>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-teal-50/70 border border-teal-200/80 rounded-lg text-[11px] text-teal-950 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                  <p>
                    <strong>Garantía de Compatibilidad:</strong> Tanto en el Inventario como en la Tienda Online y en la ficha de producto, los recursos multimedia cuentan con detección inteligente con rutas estáticas (<code className="font-mono bg-white px-1 py-0.2 rounded border border-teal-200">/uploads/...</code>) y respaldo dinámico por streaming (<code className="font-mono bg-white px-1 py-0.2 rounded border border-teal-200">/api/media/...</code>) para asegurar que ninguna imagen o video falle en ningún servidor.
                  </p>
                </div>
              </div>
            </div>
          )}
          </main>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Motor PostgreSQL listo para despliegue en servidor local</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Modal de Confirmación de Restauración del Respaldo ZIP */}
      {showRestoreConfirmModal && pendingRestoreFile && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            {/* Cabecera del modal de confirmación */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    ¿Confirmar Restauración del Sistema?
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Se requiere tu confirmación para aplicar este respaldo ZIP
                  </p>
                </div>
              </div>
              {!restoringMaster && (
                <button
                  type="button"
                  onClick={handleCancelRestore}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
                  title="Cerrar confirmación"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Contenido */}
            <div className="p-6 space-y-4 text-xs text-slate-600">
              {/* Tarjeta de información del archivo seleccionado */}
              <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-200/80 flex items-center space-x-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <FolderArchive className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 truncate text-xs">
                    {pendingRestoreFile.name}
                  </p>
                  <p className="text-[11px] text-indigo-700 font-mono">
                    Tamaño: {(pendingRestoreFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>

              {/* Advertencia de impacto en el sistema */}
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11.5px] leading-relaxed">
                    <strong>Advertencia importante:</strong> Al continuar, se actualizarán los datos de tu base de datos (catálogo de productos, clientes, pedidos, inventario) y se descomprimirán las imágenes y videos en la carpeta de medios (<code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-950 font-bold">/uploads</code>).
                  </div>
                </div>
                <ul className="text-[11px] space-y-1 pl-6 list-disc text-amber-800">
                  <li>Se sincronizarán y crearán los registros incluidos en el archivo ZIP.</li>
                  <li>Las imágenes y recursos multimedia se restaurarán en el servidor.</li>
                  <li>Si tienes cambios recientes sin respaldar, asegúrate de haber generado un respaldo previo antes de proceder.</li>
                </ul>
              </div>

              {/* Estado de carga durante la restauración */}
              {restoringMaster && (
                <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 flex items-center space-x-3">
                  <Loader2 className="w-5 h-5 animate-spin text-sky-600 shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold text-sky-950">Restaurando base de datos y archivos multimedia...</p>
                    <p className="text-[11px] text-sky-700">Por favor, no cierres esta ventana mientras finaliza la operación.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Acciones */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={handleCancelRestore}
                disabled={restoringMaster}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRestoreMasterZip}
                disabled={restoringMaster}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black text-xs shadow-md shadow-indigo-900/20 transition flex items-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-500"
              >
                {restoringMaster ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Restaurando...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Sí, Continuar con la Restauración</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

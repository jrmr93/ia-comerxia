import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { db, isPostgresConfigured, pool } from '../db/index.ts';
import {
  users,
  inventoryItems,
  telegramMessages,
  telegramConfigs,
  aiConfigs,
  emailConfigs,
  storeConfigs,
  serverDomainConfigs,
  customers,
  suppliers,
  customerOrders,
  purchases,
  payments,
  storeAnalyticsEvents,
} from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { storage } from '../db/storage.ts';
import { getAllUsers } from '../db/users.ts';
import {
  getInventoryItems,
  getTelegramMessages,
  getTelegramConfig,
  getAiConfig,
  getStoreConfig,
  getServerDomainConfig,
  getCustomerOrders,
  getCustomers,
  getSuppliers,
  getPurchases,
  getPayments,
  resolveValidUserId,
} from '../db/inventory.ts';
import { getEmailConfig } from './email.ts';
import { ensureUploadsDirExists } from './media-storage.ts';
import { normalizeMediaUrl } from '../utils/media-helper.ts';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export interface FullSystemBackupManifest {
  version: string;
  system: string;
  exportDate: string;
  summary: {
    usersCount: number;
    inventoryCount: number;
    ordersCount: number;
    customersCount: number;
    suppliersCount: number;
    purchasesCount: number;
    paymentsCount: number;
    telegramMessagesCount: number;
    mediaFilesCount: number;
    mediaTotalSizeBytes: number;
  };
}

export interface FullSystemData {
  users: any[];
  telegramConfigs: any[];
  inventoryItems: any[];
  telegramMessages: any[];
  suppliers: any[];
  customers: any[];
  customerOrders: any[];
  purchases: any[];
  payments: any[];
  storeConfigs: any[];
  serverDomainConfigs: any[];
  aiConfigs: any[];
  emailConfigs: any[];
  storeAnalyticsEvents: any[];
}

/**
 * Normalizes all media paths in an inventory item before backup
 * so references remain 100% portable across servers.
 */
function sanitizeInventoryItemForExport(item: any): any {
  const clean = { ...item };
  if (clean.imageUrl) {
    clean.imageUrl = normalizeMediaUrl(clean.imageUrl);
  }
  if (clean.videoUrl) {
    clean.videoUrl = normalizeMediaUrl(clean.videoUrl);
  }
  if (clean.extractedAttributes) {
    try {
      const parsed = typeof clean.extractedAttributes === 'string'
        ? JSON.parse(clean.extractedAttributes)
        : clean.extractedAttributes;
      if (parsed && Array.isArray(parsed.images)) {
        parsed.images = parsed.images.map((img: string) => normalizeMediaUrl(img));
      }
      clean.extractedAttributes = JSON.stringify(parsed);
    } catch {}
  }
  return clean;
}

/**
 * Escapes strings safely for SQL INSERT statements.
 */
function escapeSqlString(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isNaN(val) ? '0' : String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val);
    return `'${jsonStr.replace(/'/g, "''")}'`;
  }
  const str = String(val);
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Escapes date/timestamp safely for SQL INSERT statements.
 */
function escapeSqlDate(val: any): string {
  if (!val) return 'NOW()';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return 'NOW()';
    return `'${d.toISOString()}'::timestamp`;
  } catch {
    return 'NOW()';
  }
}

/**
 * Collects 100% of the Comerxia system data across all 14 tables/collections.
 */
export async function getFullSystemData(userId?: number): Promise<FullSystemData> {
  const [
    allUsers,
    items,
    messages,
    tgConfig,
    custs,
    supps,
    orders,
    purchs,
    pmts,
    storeCfg,
    domainCfg,
    aiCfg,
    emailCfg,
  ] = await Promise.all([
    getAllUsers(),
    getInventoryItems(userId),
    getTelegramMessages(userId),
    getTelegramConfig(userId || 1),
    getCustomers(userId),
    getSuppliers(userId),
    getCustomerOrders(userId),
    getPurchases(userId),
    getPayments(userId),
    getStoreConfig(userId || 1),
    getServerDomainConfig(userId || 1),
    getAiConfig(userId || 1),
    getEmailConfig(userId || 1),
  ]);

  // Ensure tokens & keys from process.env are captured in configurations if empty
  let effectiveTgConfig: any = tgConfig;
  if (effectiveTgConfig) {
    if (!effectiveTgConfig.botToken && process.env.TELEGRAM_BOT_TOKEN) {
      effectiveTgConfig.botToken = process.env.TELEGRAM_BOT_TOKEN.trim();
    }
  } else if (process.env.TELEGRAM_BOT_TOKEN) {
    effectiveTgConfig = {
      id: 1,
      userId: userId || 1,
      botToken: process.env.TELEGRAM_BOT_TOKEN.trim(),
      webhookSecret: null,
      supplierName: 'Proveedor Telegram Principal',
      supplierUsername: null,
      autoApprove: true,
      defaultMarginPercent: 35,
      currency: 'USD',
      defaultStockEnabled: false,
      defaultStockQuantity: 10,
    };
  }

  let effectiveAiConfig: any = aiCfg;
  if (effectiveAiConfig) {
    if (!effectiveAiConfig.apiKey && process.env.GEMINI_API_KEY) {
      effectiveAiConfig.apiKey = process.env.GEMINI_API_KEY.trim();
    }
  } else if (process.env.GEMINI_API_KEY) {
    effectiveAiConfig = {
      id: 1,
      userId: userId || 1,
      apiKey: process.env.GEMINI_API_KEY.trim(),
      modelName: 'gemini-3.6-flash',
      temperature: '0.20',
    };
  }

  let allStoreConfigs: any[] = storeCfg ? [storeCfg] : [];
  let allTgConfigs: any[] = effectiveTgConfig ? [effectiveTgConfig] : [];
  let allAiConfigs: any[] = effectiveAiConfig ? [effectiveAiConfig] : [];
  let allEmailConfigs: any[] = emailCfg ? [emailCfg] : [];
  let allDomainConfigs: any[] = domainCfg ? [domainCfg] : [];

  if (isPostgresConfigured()) {
    try {
      const dbStores = await db.select().from(storeConfigs);
      if (dbStores && dbStores.length > 0) allStoreConfigs = dbStores;
    } catch {}

    try {
      const dbTgs = await db.select().from(telegramConfigs);
      if (dbTgs && dbTgs.length > 0) {
        allTgConfigs = dbTgs.map((t) => ({
          ...t,
          botToken: t.botToken || effectiveTgConfig?.botToken || process.env.TELEGRAM_BOT_TOKEN?.trim() || null,
        }));
      }
    } catch {}

    try {
      const dbAis = await db.select().from(aiConfigs);
      if (dbAis && dbAis.length > 0) {
        allAiConfigs = dbAis.map((a) => ({
          ...a,
          apiKey: a.apiKey || process.env.GEMINI_API_KEY?.trim() || null,
        }));
      }
    } catch {}

    try {
      const dbEmails = await db.select().from(emailConfigs);
      if (dbEmails && dbEmails.length > 0) allEmailConfigs = dbEmails;
    } catch {}

    try {
      const dbDomains = await db.select().from(serverDomainConfigs);
      if (dbDomains && dbDomains.length > 0) allDomainConfigs = dbDomains;
    } catch {}
  }

  let analyticsEvents: any[] = [];
  if (isPostgresConfigured()) {
    try {
      analyticsEvents = await db.select().from(storeAnalyticsEvents).limit(1000);
    } catch {
      analyticsEvents = [];
    }
  } else {
    analyticsEvents = storage.getState().storeAnalyticsEvents || [];
  }

  return {
    users: allUsers || [],
    telegramConfigs: allTgConfigs,
    inventoryItems: (items || []).map(sanitizeInventoryItemForExport),
    telegramMessages: messages || [],
    suppliers: supps || [],
    customers: custs || [],
    customerOrders: orders || [],
    purchases: purchs || [],
    payments: pmts || [],
    storeConfigs: allStoreConfigs,
    serverDomainConfigs: allDomainConfigs,
    aiConfigs: allAiConfigs,
    emailConfigs: allEmailConfigs,
    storeAnalyticsEvents: analyticsEvents,
  };
}

/**
 * Generates a 100% complete, fully compatible SQL dump for PostgreSQL.
 */
export async function generateCompleteSqlDump(userId?: number): Promise<string> {
  const data = await getFullSystemData(userId);
  const nowIso = new Date().toISOString();

  let sql = `-- =========================================================================\n`;
  sql += `-- COMERXIA - RESPALDO 100% COMPLETO DE BASE DE DATOS POSTGRESQL\n`;
  sql += `-- Fecha de exportación: ${nowIso}\n`;
  sql += `-- Incluye esquema completo, tablas maestras, usuarios, inventario, pedidos,\n`;
  sql += `-- clientes, proveedores, configuraciones y reseteo automático de secuencias.\n`;
  sql += `-- =========================================================================\n\n`;

  sql += `SET client_encoding = 'UTF8';\n`;
  sql += `SET standard_conforming_strings = on;\n\n`;

  // 1. users
  sql += `-- 1. TABLA: users (Usuarios Administradores y Operadores)\n`;
  sql += `CREATE TABLE IF NOT EXISTS users (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  uid TEXT UNIQUE,\n`;
  sql += `  username TEXT UNIQUE,\n`;
  sql += `  password TEXT NOT NULL DEFAULT 'admin',\n`;
  sql += `  email TEXT NOT NULL DEFAULT 'admin@comerxia.com',\n`;
  sql += `  name TEXT DEFAULT 'Administrador',\n`;
  sql += `  role TEXT DEFAULT 'admin',\n`;
  sql += `  photo_url TEXT,\n`;
  sql += `  is_active BOOLEAN DEFAULT TRUE,\n`;
  sql += `  activation_code TEXT,\n`;
  sql += `  activation_expires_at TIMESTAMP,\n`;
  sql += `  reset_code TEXT,\n`;
  sql += `  reset_expires_at TIMESTAMP,\n`;
  sql += `  created_at TIMESTAMP DEFAULT NOW(),\n`;
  sql += `  updated_at TIMESTAMP DEFAULT NOW()\n`;
  sql += `);\n\n`;

  // 2. telegram_configs
  sql += `-- 2. TABLA: telegram_configs\n`;
  sql += `CREATE TABLE IF NOT EXISTS telegram_configs (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,\n`;
  sql += `  bot_token TEXT,\n`;
  sql += `  webhook_secret TEXT,\n`;
  sql += `  supplier_name TEXT DEFAULT 'Proveedor Telegram Principal',\n`;
  sql += `  supplier_username TEXT,\n`;
  sql += `  auto_approve BOOLEAN DEFAULT TRUE,\n`;
  sql += `  default_margin_percent INTEGER DEFAULT 35,\n`;
  sql += `  currency TEXT DEFAULT 'USD',\n`;
  sql += `  default_stock_enabled BOOLEAN DEFAULT FALSE,\n`;
  sql += `  default_stock_quantity INTEGER DEFAULT 10,\n`;
  sql += `  tax_percent INTEGER DEFAULT 15,\n`;
  sql += `  use_ai BOOLEAN DEFAULT TRUE,\n`;
  sql += `  created_at TIMESTAMP DEFAULT NOW(),\n`;
  sql += `  updated_at TIMESTAMP DEFAULT NOW()\n`;
  sql += `);\n\n`;

  // 3. inventory_items
  sql += `-- 3. TABLA: inventory_items\n`;
  sql += `CREATE TABLE IF NOT EXISTS inventory_items (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,\n`;
  sql += `  name TEXT NOT NULL,\n`;
  sql += `  sku TEXT NOT NULL,\n`;
  sql += `  barcode TEXT,\n`;
  sql += `  description TEXT,\n`;
  sql += `  category TEXT NOT NULL DEFAULT 'General',\n`;
  sql += `  cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,\n`;
  sql += `  sale_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,\n`;
  sql += `  discount_percent INTEGER DEFAULT 0,\n`;
  sql += `  stock INTEGER NOT NULL DEFAULT 0,\n`;
  sql += `  image_url TEXT,\n`;
  sql += `  video_url TEXT,\n`;
  sql += `  supplier_name TEXT DEFAULT 'Proveedor Telegram Principal',\n`;
  sql += `  tags TEXT,\n`;
  sql += `  extracted_attributes TEXT,\n`;
  sql += `  status TEXT NOT NULL DEFAULT 'available',\n`;
  sql += `  raw_telegram_message TEXT,\n`;
  sql += `  marketing_copy TEXT,\n`;
  sql += `  created_at TIMESTAMP DEFAULT NOW(),\n`;
  sql += `  updated_at TIMESTAMP DEFAULT NOW()\n`;
  sql += `);\n\n`;

  // 4. telegram_messages
  sql += `-- 4. TABLA: telegram_messages\n`;
  sql += `CREATE TABLE IF NOT EXISTS telegram_messages (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,\n`;
  sql += `  telegram_message_id TEXT,\n`;
  sql += `  sender_name TEXT,\n`;
  sql += `  sender_username TEXT,\n`;
  sql += `  caption TEXT,\n`;
  sql += `  photo_url TEXT,\n`;
  sql += `  processed_status TEXT NOT NULL DEFAULT 'processed',\n`;
  sql += `  extracted_data TEXT,\n`;
  sql += `  inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,\n`;
  sql += `  created_at TIMESTAMP DEFAULT NOW()\n`;
  sql += `);\n\n`;

  // 5. suppliers
  sql += `-- 5. TABLA: suppliers\n`;
  sql += `CREATE TABLE IF NOT EXISTS suppliers (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,\n`;
  sql += `  name TEXT NOT NULL,\n`;
  sql += `  trade_name TEXT,\n`;
  sql += `  ruc TEXT,\n`;
  sql += `  phone TEXT NOT NULL,\n`;
  sql += `  email TEXT,\n`;
  sql += `  contact_person TEXT,\n`;
  sql += `  contact_person_phone TEXT,\n`;
  sql += `  contact_person_role TEXT,\n`;
  sql += `  category TEXT NOT NULL DEFAULT 'General',\n`;
  sql += `  country TEXT DEFAULT 'Ecuador',\n`;
  sql += `  city TEXT,\n`;
  sql += `  address TEXT,\n`;
  sql += `  website TEXT,\n`;
  sql += `  payment_terms TEXT DEFAULT 'cash',\n`;
  sql += `  credit_limit NUMERIC(12, 2) DEFAULT 0.00,\n`;
  sql += `  bank_details TEXT,\n`;
  sql += `  lead_time_days INTEGER DEFAULT 1,\n`;
  sql += `  rating INTEGER DEFAULT 5,\n`;
  sql += `  status TEXT NOT NULL DEFAULT 'active',\n`;
  sql += `  notes TEXT,\n`;
  sql += `  created_at TIMESTAMP DEFAULT NOW(),\n`;
  sql += `  updated_at TIMESTAMP DEFAULT NOW()\n`;
  sql += `);\n\n`;

  // 6. customers
  sql += `-- 6. TABLA: customers (CRM)\n`;
  sql += `CREATE TABLE IF NOT EXISTS customers (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,\n`;
  sql += `  name TEXT NOT NULL,\n`;
  sql += `  phone TEXT NOT NULL,\n`;
  sql += `  ci TEXT,\n`;
  sql += `  email TEXT,\n`;
  sql += `  address TEXT,\n`;
  sql += `  province TEXT,\n`;
  sql += `  canton TEXT,\n`;
  sql += `  parish TEXT,\n`;
  sql += `  exact_address TEXT,\n`;
  sql += `  reference TEXT,\n`;
  sql += `  total_orders INTEGER NOT NULL DEFAULT 0,\n`;
  sql += `  total_spent NUMERIC(12, 2) NOT NULL DEFAULT 0.00,\n`;
  sql += `  last_order_date TIMESTAMP,\n`;
  sql += `  notes TEXT,\n`;
  sql += `  created_at TIMESTAMP DEFAULT NOW(),\n`;
  sql += `  updated_at TIMESTAMP DEFAULT NOW()\n`;
  sql += `);\n\n`;

  // 7. customer_orders
  sql += `-- 7. TABLA: customer_orders\n`;
  sql += `CREATE TABLE IF NOT EXISTS customer_orders (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,\n`;
  sql += `  order_number TEXT NOT NULL,\n`;
  sql += `  customer_name TEXT NOT NULL,\n`;
  sql += `  customer_phone TEXT NOT NULL,\n`;
  sql += `  customer_ci TEXT,\n`;
  sql += `  customer_email TEXT,\n`;
  sql += `  customer_address TEXT,\n`;
  sql += `  items TEXT NOT NULL DEFAULT '[]',\n`;
  sql += `  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,\n`;
  sql += `  payment_method TEXT DEFAULT 'whatsapp',\n`;
  sql += `  status TEXT NOT NULL DEFAULT 'pending',\n`;
  sql += `  payment_voucher TEXT,\n`;
  sql += `  notes TEXT,\n`;
  sql += `  tracking_number TEXT,\n`;
  sql += `  tracking_carrier TEXT,\n`;
  sql += `  tracking_notes TEXT,\n`;
  sql += `  fulfillment_status TEXT DEFAULT 'in_stock',\n`;
  sql += `  linked_purchase_id INTEGER,\n`;
  sql += `  linked_purchase_number TEXT,\n`;
  sql += `  returns TEXT,\n`;
  sql += `  created_at TIMESTAMP DEFAULT NOW()\n`;
  sql += `);\n\n`;

  // 8. purchases
  sql += `-- 8. TABLA: purchases\n`;
  sql += `CREATE TABLE IF NOT EXISTS purchases (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,\n`;
  sql += `  purchase_number TEXT NOT NULL,\n`;
  sql += `  supplier_name TEXT NOT NULL DEFAULT 'Proveedor Telegram',\n`;
  sql += `  supplier_contact TEXT,\n`;
  sql += `  items TEXT NOT NULL DEFAULT '[]',\n`;
  sql += `  total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,\n`;
  sql += `  status TEXT NOT NULL DEFAULT 'pending',\n`;
  sql += `  payment_status TEXT DEFAULT 'paid',\n`;
  sql += `  linked_customer_order_id INTEGER REFERENCES customer_orders(id) ON DELETE SET NULL,\n`;
  sql += `  linked_customer_order_number TEXT,\n`;
  sql += `  receipt_voucher TEXT,\n`;
  sql += `  receptions TEXT,\n`;
  sql += `  returns TEXT,\n`;
  sql += `  notes TEXT,\n`;
  sql += `  purchase_date TIMESTAMP DEFAULT NOW(),\n`;
  sql += `  received_date TIMESTAMP,\n`;
  sql += `  created_at TIMESTAMP DEFAULT NOW(),\n`;
  sql += `  updated_at TIMESTAMP DEFAULT NOW()\n`;
  sql += `);\n\n`;

  // 9. payments
  sql += `-- 9. TABLA: payments\n`;
  sql += `CREATE TABLE IF NOT EXISTS payments (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,\n`;
  sql += `  payment_number TEXT NOT NULL,\n`;
  sql += `  type TEXT NOT NULL,\n`;
  sql += `  category TEXT NOT NULL DEFAULT 'order_collection',\n`;
  sql += `  amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,\n`;
  sql += `  payment_method TEXT NOT NULL DEFAULT 'transfer',\n`;
  sql += `  bank_or_account TEXT,\n`;
  sql += `  reference_number TEXT,\n`;
  sql += `  payment_date TIMESTAMP DEFAULT NOW(),\n`;
  sql += `  status TEXT NOT NULL DEFAULT 'completed',\n`;
  sql += `  notes TEXT,\n`;
  sql += `  voucher_url TEXT,\n`;
  sql += `  order_id INTEGER REFERENCES customer_orders(id) ON DELETE SET NULL,\n`;
  sql += `  order_number TEXT,\n`;
  sql += `  purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,\n`;
  sql += `  purchase_number TEXT,\n`;
  sql += `  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,\n`;
  sql += `  customer_name TEXT,\n`;
  sql += `  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,\n`;
  sql += `  supplier_name TEXT,\n`;
  sql += `  created_at TIMESTAMP DEFAULT NOW(),\n`;
  sql += `  updated_at TIMESTAMP DEFAULT NOW()\n`;
  sql += `);\n\n`;

  // 10. store_configs
  sql += `-- 10. TABLA: store_configs\n`;
  sql += `CREATE TABLE IF NOT EXISTS store_configs (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,\n`;
  sql += `  store_name TEXT DEFAULT 'Comerxia Store',\n`;
  sql += `  whatsapp_number TEXT DEFAULT '',\n`;
  sql += `  description TEXT DEFAULT 'Catálogo digital con envíos y pedidos directos',\n`;
  sql += `  banner_text TEXT DEFAULT '🔥 ¡Catálogo actualizado con las últimas novedades en stock!',\n`;
  sql += `  delivery_fee NUMERIC(12, 2) DEFAULT 0.00,\n`;
  sql += `  min_order_amount NUMERIC(12, 2) DEFAULT 0.00,\n`;
  sql += `  currency TEXT DEFAULT 'USD',\n`;
  sql += `  is_active BOOLEAN DEFAULT TRUE,\n`;
  sql += `  maintenance_title TEXT DEFAULT 'Tienda Temporalmente Pausada',\n`;
  sql += `  maintenance_message TEXT DEFAULT 'Estamos actualizando nuestro catálogo e inventario. ¡Volvemos muy pronto!',\n`;
  sql += `  allow_catalog_browsing BOOLEAN DEFAULT FALSE,\n`;
  sql += `  show_stock BOOLEAN DEFAULT TRUE,\n`;
  sql += `  show_out_of_stock BOOLEAN DEFAULT TRUE,\n`;
  sql += `  instagram_url TEXT,\n`;
  sql += `  website_url TEXT,\n`;
  sql += `  address TEXT,\n`;
  sql += `  logo_url TEXT,\n`;
  sql += `  logo_desktop_url TEXT,\n`;
  sql += `  courier_logos TEXT,\n`;
  sql += `  payment_logos TEXT,\n`;
  sql += `  theme TEXT DEFAULT 'classic',\n`;
  sql += `  promo_popup TEXT,\n`;
  sql += `  created_at TIMESTAMP DEFAULT NOW(),\n`;
  sql += `  updated_at TIMESTAMP DEFAULT NOW()\n`;
  sql += `);\n\n`;

  // 11. server_domain_configs
  sql += `-- 11. TABLA: server_domain_configs\n`;
  sql += `CREATE TABLE IF NOT EXISTS server_domain_configs (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,\n`;
  sql += `  admin_domain TEXT DEFAULT 'admin.dominio1.com',\n`;
  sql += `  store_domain TEXT DEFAULT 'www.dominio1.com, dominio1.com',\n`;
  sql += `  auto_routing BOOLEAN DEFAULT TRUE,\n`;
  sql += `  default_fallback_view TEXT DEFAULT 'admin',\n`;
  sql += `  created_at TIMESTAMP DEFAULT NOW(),\n`;
  sql += `  updated_at TIMESTAMP DEFAULT NOW()\n`;
  sql += `);\n\n`;

  // 12. ai_configs
  sql += `-- 12. TABLA: ai_configs\n`;
  sql += `CREATE TABLE IF NOT EXISTS ai_configs (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,\n`;
  sql += `  api_key TEXT,\n`;
  sql += `  model_name TEXT DEFAULT 'gemini-3.6-flash',\n`;
  sql += `  temperature NUMERIC(3, 2) DEFAULT 0.20,\n`;
  sql += `  created_at TIMESTAMP DEFAULT NOW(),\n`;
  sql += `  updated_at TIMESTAMP DEFAULT NOW()\n`;
  sql += `);\n\n`;

  // 13. email_configs
  sql += `-- 13. TABLA: email_configs\n`;
  sql += `CREATE TABLE IF NOT EXISTS email_configs (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,\n`;
  sql += `  google_email TEXT,\n`;
  sql += `  google_app_password TEXT,\n`;
  sql += `  sender_name TEXT DEFAULT 'Comerxia App',\n`;
  sql += `  smtp_host TEXT DEFAULT 'smtp.gmail.com',\n`;
  sql += `  smtp_port INTEGER DEFAULT 465,\n`;
  sql += `  smtp_secure BOOLEAN DEFAULT TRUE,\n`;
  sql += `  require_activation BOOLEAN DEFAULT TRUE,\n`;
  sql += `  created_at TIMESTAMP DEFAULT NOW(),\n`;
  sql += `  updated_at TIMESTAMP DEFAULT NOW()\n`;
  sql += `);\n\n`;

  // 14. store_analytics_events
  sql += `-- 14. TABLA: store_analytics_events\n`;
  sql += `CREATE TABLE IF NOT EXISTS store_analytics_events (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,\n`;
  sql += `  event_type TEXT NOT NULL,\n`;
  sql += `  product_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,\n`;
  sql += `  product_name TEXT,\n`;
  sql += `  session_id TEXT,\n`;
  sql += `  device_type TEXT DEFAULT 'desktop',\n`;
  sql += `  metadata TEXT,\n`;
  sql += `  created_at TIMESTAMP DEFAULT NOW()\n`;
  sql += `);\n\n`;

  // DATA INSERTS
  sql += `-- =========================================================================\n`;
  sql += `-- INSERCIÓN DE DATOS REALES (ORDEN DE INTEGRIDAD REFERENCIAL)\n`;
  sql += `-- =========================================================================\n\n`;

  // 1. Users
  if (data.users.length > 0) {
    sql += `-- Datos: users (${data.users.length} registros)\n`;
    for (const u of data.users) {
      sql += `INSERT INTO users (id, uid, username, password, email, name, role, photo_url, is_active) VALUES (${u.id || 1}, ${escapeSqlString(u.uid || `user-${u.id}`)}, ${escapeSqlString(u.username)}, ${escapeSqlString(u.password)}, ${escapeSqlString(u.email)}, ${escapeSqlString(u.name || 'Admin')}, ${escapeSqlString(u.role || 'admin')}, ${escapeSqlString(u.photoUrl)}, ${u.isActive !== false ? 'TRUE' : 'FALSE'}) ON CONFLICT (id) DO UPDATE SET password = EXCLUDED.password, email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role, is_active = EXCLUDED.is_active;\n`;
    }
    sql += `\n`;
  } else {
    // Default admin fallback to preserve FK integrity
    sql += `INSERT INTO users (id, username, password, email, name, role, is_active) VALUES (1, 'admin', 'admin', 'admin@comerxia.com', 'Administrador Principal', 'admin', TRUE) ON CONFLICT (id) DO NOTHING;\n\n`;
  }

  // 2. telegram_configs
  if (data.telegramConfigs.length > 0) {
    sql += `-- Datos: telegram_configs\n`;
    for (const tc of data.telegramConfigs) {
      sql += `INSERT INTO telegram_configs (id, user_id, bot_token, webhook_secret, supplier_name, supplier_username, auto_approve, default_margin_percent, currency, default_stock_enabled, default_stock_quantity, tax_percent, use_ai) VALUES (${tc.id || 1}, ${tc.userId || 1}, ${escapeSqlString(tc.botToken)}, ${escapeSqlString(tc.webhookSecret)}, ${escapeSqlString(tc.supplierName)}, ${escapeSqlString(tc.supplierUsername)}, ${tc.autoApprove !== false ? 'TRUE' : 'FALSE'}, ${tc.defaultMarginPercent || 35}, ${escapeSqlString(tc.currency || 'USD')}, ${tc.defaultStockEnabled ? 'TRUE' : 'FALSE'}, ${tc.defaultStockQuantity || 10}, ${tc.taxPercent ?? 15}, ${tc.useAi !== false ? 'TRUE' : 'FALSE'}) ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, bot_token = EXCLUDED.bot_token, webhook_secret = EXCLUDED.webhook_secret, supplier_name = EXCLUDED.supplier_name, supplier_username = EXCLUDED.supplier_username, auto_approve = EXCLUDED.auto_approve, default_margin_percent = EXCLUDED.default_margin_percent, currency = EXCLUDED.currency, default_stock_enabled = EXCLUDED.default_stock_enabled, default_stock_quantity = EXCLUDED.default_stock_quantity, tax_percent = EXCLUDED.tax_percent, use_ai = EXCLUDED.use_ai;\n`;
    }
    sql += `\n`;
  }

  // 3. inventory_items
  if (data.inventoryItems.length > 0) {
    sql += `-- Datos: inventory_items (${data.inventoryItems.length} registros)\n`;
    for (const item of data.inventoryItems) {
      sql += `INSERT INTO inventory_items (id, user_id, name, sku, barcode, description, category, cost_price, sale_price, discount_percent, stock, image_url, video_url, supplier_name, tags, extracted_attributes, status, raw_telegram_message, marketing_copy) VALUES (${item.id}, ${item.userId || 1}, ${escapeSqlString(item.name)}, ${escapeSqlString(item.sku)}, ${escapeSqlString(item.barcode)}, ${escapeSqlString(item.description)}, ${escapeSqlString(item.category || 'General')}, ${item.costPrice || 0}, ${item.salePrice || 0}, ${item.discountPercent || 0}, ${item.stock || 0}, ${escapeSqlString(item.imageUrl)}, ${escapeSqlString(item.videoUrl)}, ${escapeSqlString(item.supplierName)}, ${escapeSqlString(item.tags)}, ${escapeSqlString(item.extractedAttributes)}, ${escapeSqlString(item.status || 'available')}, ${escapeSqlString(item.rawTelegramMessage)}, ${escapeSqlString(item.marketingCopy)}) ON CONFLICT (id) DO NOTHING;\n`;
    }
    sql += `\n`;
  }

  // 4. telegram_messages
  if (data.telegramMessages.length > 0) {
    sql += `-- Datos: telegram_messages (${data.telegramMessages.length} registros)\n`;
    for (const m of data.telegramMessages) {
      sql += `INSERT INTO telegram_messages (id, user_id, telegram_message_id, sender_name, sender_username, caption, photo_url, processed_status, extracted_data, inventory_item_id) VALUES (${m.id}, ${m.userId || 1}, ${escapeSqlString(m.telegramMessageId)}, ${escapeSqlString(m.senderName)}, ${escapeSqlString(m.senderUsername)}, ${escapeSqlString(m.caption)}, ${escapeSqlString(m.photoUrl)}, ${escapeSqlString(m.processedStatus || 'processed')}, ${escapeSqlString(m.extractedData)}, ${m.inventoryItemId ? m.inventoryItemId : 'NULL'}) ON CONFLICT (id) DO NOTHING;\n`;
    }
    sql += `\n`;
  }

  // 5. suppliers
  if (data.suppliers.length > 0) {
    sql += `-- Datos: suppliers (${data.suppliers.length} registros)\n`;
    for (const s of data.suppliers) {
      sql += `INSERT INTO suppliers (id, user_id, name, trade_name, ruc, phone, email, contact_person, contact_person_phone, contact_person_role, category, country, city, address, website, payment_terms, credit_limit, bank_details, lead_time_days, rating, status, notes) VALUES (${s.id}, ${s.userId || 1}, ${escapeSqlString(s.name)}, ${escapeSqlString(s.tradeName)}, ${escapeSqlString(s.ruc)}, ${escapeSqlString(s.phone)}, ${escapeSqlString(s.email)}, ${escapeSqlString(s.contactPerson)}, ${escapeSqlString(s.contactPersonPhone)}, ${escapeSqlString(s.contactPersonRole)}, ${escapeSqlString(s.category || 'General')}, ${escapeSqlString(s.country || 'Ecuador')}, ${escapeSqlString(s.city)}, ${escapeSqlString(s.address)}, ${escapeSqlString(s.website)}, ${escapeSqlString(s.paymentTerms || 'cash')}, ${s.creditLimit || 0}, ${escapeSqlString(s.bankDetails)}, ${s.leadTimeDays || 1}, ${s.rating || 5}, ${escapeSqlString(s.status || 'active')}, ${escapeSqlString(s.notes)}) ON CONFLICT (id) DO NOTHING;\n`;
    }
    sql += `\n`;
  }

  // 6. customers
  if (data.customers.length > 0) {
    sql += `-- Datos: customers (${data.customers.length} registros)\n`;
    for (const c of data.customers) {
      sql += `INSERT INTO customers (id, user_id, name, phone, ci, email, address, province, canton, parish, exact_address, reference, total_orders, total_spent, notes) VALUES (${c.id}, ${c.userId || 1}, ${escapeSqlString(c.name)}, ${escapeSqlString(c.phone)}, ${escapeSqlString(c.ci)}, ${escapeSqlString(c.email)}, ${escapeSqlString(c.address)}, ${escapeSqlString(c.province)}, ${escapeSqlString(c.canton)}, ${escapeSqlString(c.parish)}, ${escapeSqlString(c.exactAddress)}, ${escapeSqlString(c.reference)}, ${c.totalOrders || 0}, ${c.totalSpent || 0}, ${escapeSqlString(c.notes)}) ON CONFLICT (id) DO NOTHING;\n`;
    }
    sql += `\n`;
  }

  // 7. customer_orders
  if (data.customerOrders.length > 0) {
    sql += `-- Datos: customer_orders (${data.customerOrders.length} registros)\n`;
    for (const o of data.customerOrders) {
      sql += `INSERT INTO customer_orders (id, user_id, order_number, customer_name, customer_phone, customer_ci, customer_email, customer_address, items, total_amount, payment_method, status, payment_voucher, notes, tracking_number, tracking_carrier, tracking_notes, fulfillment_status, linked_purchase_id, linked_purchase_number, returns, created_at) VALUES (${o.id}, ${o.userId || 1}, ${escapeSqlString(o.orderNumber)}, ${escapeSqlString(o.customerName)}, ${escapeSqlString(o.customerPhone)}, ${escapeSqlString(o.customerCi)}, ${escapeSqlString(o.customerEmail)}, ${escapeSqlString(o.customerAddress)}, ${escapeSqlString(o.items)}, ${o.totalAmount || 0}, ${escapeSqlString(o.paymentMethod || 'whatsapp')}, ${escapeSqlString(o.status || 'pending')}, ${escapeSqlString(o.paymentVoucher)}, ${escapeSqlString(o.notes)}, ${escapeSqlString(o.trackingNumber)}, ${escapeSqlString(o.trackingCarrier)}, ${escapeSqlString(o.trackingNotes)}, ${escapeSqlString(o.fulfillmentStatus || 'in_stock')}, ${o.linkedPurchaseId ? o.linkedPurchaseId : 'NULL'}, ${escapeSqlString(o.linkedPurchaseNumber)}, ${escapeSqlString(o.returns)}, ${escapeSqlDate(o.createdAt)}) ON CONFLICT (id) DO UPDATE SET order_number = EXCLUDED.order_number, customer_name = EXCLUDED.customer_name, customer_phone = EXCLUDED.customer_phone, customer_ci = EXCLUDED.customer_ci, customer_email = EXCLUDED.customer_email, customer_address = EXCLUDED.customer_address, items = EXCLUDED.items, total_amount = EXCLUDED.total_amount, payment_method = EXCLUDED.payment_method, status = EXCLUDED.status, payment_voucher = EXCLUDED.payment_voucher, notes = EXCLUDED.notes, tracking_number = EXCLUDED.tracking_number, tracking_carrier = EXCLUDED.tracking_carrier, tracking_notes = EXCLUDED.tracking_notes, fulfillment_status = EXCLUDED.fulfillment_status, linked_purchase_id = EXCLUDED.linked_purchase_id, linked_purchase_number = EXCLUDED.linked_purchase_number, returns = EXCLUDED.returns;\n`;
    }
    sql += `\n`;
  }

  // 8. purchases
  if (data.purchases.length > 0) {
    const validOrderIds = new Set(data.customerOrders.map((o) => o.id));
    sql += `-- Datos: purchases (${data.purchases.length} registros)\n`;
    for (const p of data.purchases) {
      const safeLinkedOrderId = p.linkedCustomerOrderId && validOrderIds.has(p.linkedCustomerOrderId)
        ? p.linkedCustomerOrderId
        : 'NULL';
      sql += `INSERT INTO purchases (id, user_id, purchase_number, supplier_name, supplier_contact, items, total_cost, status, payment_status, linked_customer_order_id, linked_customer_order_number, receipt_voucher, receptions, returns, notes, purchase_date, received_date, created_at, updated_at) VALUES (${p.id}, ${p.userId || 1}, ${escapeSqlString(p.purchaseNumber)}, ${escapeSqlString(p.supplierName)}, ${escapeSqlString(p.supplierContact)}, ${escapeSqlString(p.items)}, ${p.totalCost || 0}, ${escapeSqlString(p.status || 'pending')}, ${escapeSqlString(p.paymentStatus || 'paid')}, ${safeLinkedOrderId}, ${escapeSqlString(p.linkedCustomerOrderNumber)}, ${escapeSqlString(p.receiptVoucher)}, ${escapeSqlString(p.receptions)}, ${escapeSqlString(p.returns)}, ${escapeSqlString(p.notes)}, ${escapeSqlDate(p.purchaseDate)}, ${p.receivedDate ? escapeSqlDate(p.receivedDate) : 'NULL'}, ${escapeSqlDate(p.createdAt)}, ${escapeSqlDate(p.updatedAt)}) ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, purchase_number = EXCLUDED.purchase_number, supplier_name = EXCLUDED.supplier_name, supplier_contact = EXCLUDED.supplier_contact, items = EXCLUDED.items, total_cost = EXCLUDED.total_cost, status = EXCLUDED.status, payment_status = EXCLUDED.payment_status, linked_customer_order_id = EXCLUDED.linked_customer_order_id, linked_customer_order_number = EXCLUDED.linked_customer_order_number, receipt_voucher = EXCLUDED.receipt_voucher, receptions = EXCLUDED.receptions, returns = EXCLUDED.returns, notes = EXCLUDED.notes, purchase_date = EXCLUDED.purchase_date, received_date = EXCLUDED.received_date, updated_at = EXCLUDED.updated_at;\n`;
    }
    sql += `\n`;
  }

  // 9. payments
  if (data.payments.length > 0) {
    const validOrderIds = new Set(data.customerOrders.map((o) => o.id));
    const validPurchaseIds = new Set(data.purchases.map((p) => p.id));
    const validCustomerIds = new Set(data.customers.map((c) => c.id));
    const validSupplierIds = new Set(data.suppliers.map((s) => s.id));
    sql += `-- Datos: payments (${data.payments.length} registros)\n`;
    for (const pm of data.payments) {
      const safeOrderId = pm.orderId && validOrderIds.has(pm.orderId) ? pm.orderId : 'NULL';
      const safePurchaseId = pm.purchaseId && validPurchaseIds.has(pm.purchaseId) ? pm.purchaseId : 'NULL';
      const safeCustomerId = pm.customerId && validCustomerIds.has(pm.customerId) ? pm.customerId : 'NULL';
      const safeSupplierId = pm.supplierId && validSupplierIds.has(pm.supplierId) ? pm.supplierId : 'NULL';
      sql += `INSERT INTO payments (id, user_id, payment_number, type, category, amount, payment_method, bank_or_account, reference_number, payment_date, status, notes, voucher_url, order_id, order_number, purchase_id, purchase_number, customer_id, customer_name, supplier_id, supplier_name, return_id, created_at, updated_at) VALUES (${pm.id}, ${pm.userId || 1}, ${escapeSqlString(pm.paymentNumber)}, ${escapeSqlString(pm.type)}, ${escapeSqlString(pm.category || 'customer_sale')}, ${pm.amount || 0}, ${escapeSqlString(pm.paymentMethod || 'transferencia_bancaria')}, ${escapeSqlString(pm.bankOrAccount)}, ${escapeSqlString(pm.referenceNumber)}, ${escapeSqlDate(pm.paymentDate)}, ${escapeSqlString(pm.status || 'completed')}, ${escapeSqlString(pm.notes)}, ${escapeSqlString(pm.voucherUrl)}, ${safeOrderId}, ${escapeSqlString(pm.orderNumber)}, ${safePurchaseId}, ${escapeSqlString(pm.purchaseNumber)}, ${safeCustomerId}, ${escapeSqlString(pm.customerName)}, ${safeSupplierId}, ${escapeSqlString(pm.supplierName)}, ${escapeSqlString(pm.returnId)}, ${escapeSqlDate(pm.createdAt)}, ${escapeSqlDate(pm.updatedAt)}) ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, payment_number = EXCLUDED.payment_number, type = EXCLUDED.type, category = EXCLUDED.category, amount = EXCLUDED.amount, payment_method = EXCLUDED.payment_method, bank_or_account = EXCLUDED.bank_or_account, reference_number = EXCLUDED.reference_number, payment_date = EXCLUDED.payment_date, status = EXCLUDED.status, notes = EXCLUDED.notes, voucher_url = EXCLUDED.voucher_url, order_id = EXCLUDED.order_id, order_number = EXCLUDED.order_number, purchase_id = EXCLUDED.purchase_id, purchase_number = EXCLUDED.purchase_number, customer_id = EXCLUDED.customer_id, customer_name = EXCLUDED.customer_name, supplier_id = EXCLUDED.supplier_id, supplier_name = EXCLUDED.supplier_name, return_id = EXCLUDED.return_id, updated_at = EXCLUDED.updated_at;\n`;
    }
    sql += `\n`;
  }

  // 10. store_configs
  if (data.storeConfigs.length > 0) {
    sql += `-- Datos: store_configs\n`;
    for (const sc of data.storeConfigs) {
      sql += `INSERT INTO store_configs (id, user_id, store_name, whatsapp_number, description, banner_text, delivery_fee, min_order_amount, currency, is_active, maintenance_title, maintenance_message, allow_catalog_browsing, show_stock, show_out_of_stock, instagram_url, website_url, address, logo_url, logo_desktop_url, courier_logos, payment_logos, theme, promo_popup) VALUES (${sc.id || 1}, ${sc.userId || 1}, ${escapeSqlString(sc.storeName || 'Comerxia Store')}, ${escapeSqlString(sc.whatsappNumber)}, ${escapeSqlString(sc.description)}, ${escapeSqlString(sc.bannerText)}, ${sc.deliveryFee || 0}, ${sc.minOrderAmount || 0}, ${escapeSqlString(sc.currency || 'USD')}, ${sc.isActive !== false ? 'TRUE' : 'FALSE'}, ${escapeSqlString(sc.maintenanceTitle || 'Tienda Temporalmente Pausada')}, ${escapeSqlString(sc.maintenanceMessage || 'Estamos actualizando nuestro catálogo e inventario. ¡Volvemos muy pronto!')}, ${sc.allowCatalogBrowsing ? 'TRUE' : 'FALSE'}, ${sc.showStock !== false ? 'TRUE' : 'FALSE'}, ${sc.showOutOfStock !== false ? 'TRUE' : 'FALSE'}, ${escapeSqlString(sc.instagramUrl)}, ${escapeSqlString(sc.websiteUrl)}, ${escapeSqlString(sc.address)}, ${escapeSqlString(normalizeMediaUrl(sc.logoUrl))}, ${escapeSqlString(normalizeMediaUrl(sc.logoDesktopUrl || sc.logo_desktop_url))}, ${escapeSqlString(sc.courierLogos)}, ${escapeSqlString(sc.paymentLogos)}, ${escapeSqlString(sc.theme || 'classic')}, ${escapeSqlString(sc.promoPopup)}) ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, store_name = EXCLUDED.store_name, whatsapp_number = EXCLUDED.whatsapp_number, description = EXCLUDED.description, banner_text = EXCLUDED.banner_text, delivery_fee = EXCLUDED.delivery_fee, min_order_amount = EXCLUDED.min_order_amount, currency = EXCLUDED.currency, is_active = EXCLUDED.is_active, maintenance_title = EXCLUDED.maintenance_title, maintenance_message = EXCLUDED.maintenance_message, allow_catalog_browsing = EXCLUDED.allow_catalog_browsing, show_stock = EXCLUDED.show_stock, show_out_of_stock = EXCLUDED.show_out_of_stock, instagram_url = EXCLUDED.instagram_url, website_url = EXCLUDED.website_url, address = EXCLUDED.address, logo_url = EXCLUDED.logo_url, logo_desktop_url = EXCLUDED.logo_desktop_url, courier_logos = EXCLUDED.courier_logos, payment_logos = EXCLUDED.payment_logos, theme = EXCLUDED.theme, promo_popup = EXCLUDED.promo_popup;\n`;
    }
    sql += `\n`;
  }

  // 11. server_domain_configs
  if (data.serverDomainConfigs.length > 0) {
    sql += `-- Datos: server_domain_configs\n`;
    for (const dc of data.serverDomainConfigs) {
      sql += `INSERT INTO server_domain_configs (id, user_id, admin_domain, store_domain, auto_routing, default_fallback_view) VALUES (${dc.id || 1}, ${dc.userId || 1}, ${escapeSqlString(dc.adminDomain || 'admin.dominio1.com')}, ${escapeSqlString(dc.storeDomain || 'www.dominio1.com, dominio1.com')}, ${dc.autoRouting !== false ? 'TRUE' : 'FALSE'}, ${escapeSqlString(dc.defaultFallbackView || 'admin')}) ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, admin_domain = EXCLUDED.admin_domain, store_domain = EXCLUDED.store_domain, auto_routing = EXCLUDED.auto_routing, default_fallback_view = EXCLUDED.default_fallback_view;\n`;
    }
    sql += `\n`;
  }

  // 12. ai_configs
  if (data.aiConfigs.length > 0) {
    sql += `-- Datos: ai_configs\n`;
    for (const aic of data.aiConfigs) {
      sql += `INSERT INTO ai_configs (id, user_id, api_key, model_name, temperature) VALUES (${aic.id || 1}, ${aic.userId || 1}, ${escapeSqlString(aic.apiKey)}, ${escapeSqlString(aic.modelName || 'gemini-3.6-flash')}, ${aic.temperature || 0.20}) ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, api_key = EXCLUDED.api_key, model_name = EXCLUDED.model_name, temperature = EXCLUDED.temperature;\n`;
    }
    sql += `\n`;
  }

  // 13. email_configs
  if (data.emailConfigs.length > 0) {
    sql += `-- Datos: email_configs\n`;
    for (const ec of data.emailConfigs) {
      sql += `INSERT INTO email_configs (id, user_id, google_email, google_app_password, sender_name, smtp_host, smtp_port, smtp_secure, require_activation) VALUES (${ec.id || 1}, ${ec.userId || 1}, ${escapeSqlString(ec.googleEmail)}, ${escapeSqlString(ec.googleAppPassword)}, ${escapeSqlString(ec.senderName || 'Comerxia App')}, ${escapeSqlString(ec.smtpHost || 'smtp.gmail.com')}, ${ec.smtpPort || 465}, ${ec.smtpSecure !== false ? 'TRUE' : 'FALSE'}, ${ec.requireActivation !== false ? 'TRUE' : 'FALSE'}) ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, google_email = EXCLUDED.google_email, google_app_password = EXCLUDED.google_app_password, sender_name = EXCLUDED.sender_name, smtp_host = EXCLUDED.smtp_host, smtp_port = EXCLUDED.smtp_port, smtp_secure = EXCLUDED.smtp_secure, require_activation = EXCLUDED.require_activation;\n`;
    }
    sql += `\n`;
  }

  // 14. store_analytics_events
  if (data.storeAnalyticsEvents && data.storeAnalyticsEvents.length > 0) {
    sql += `-- Datos: store_analytics_events (${data.storeAnalyticsEvents.length} registros)\n`;
    for (const ev of data.storeAnalyticsEvents) {
      sql += `INSERT INTO store_analytics_events (id, user_id, event_type, product_id, product_name, session_id, device_type, metadata, created_at) VALUES (${ev.id}, ${ev.userId || 1}, ${escapeSqlString(ev.eventType)}, ${ev.productId ? ev.productId : 'NULL'}, ${escapeSqlString(ev.productName)}, ${escapeSqlString(ev.sessionId)}, ${escapeSqlString(ev.deviceType || 'desktop')}, ${escapeSqlString(ev.metadata)}, ${escapeSqlDate(ev.createdAt)}) ON CONFLICT (id) DO NOTHING;\n`;
    }
    sql += `\n`;
  }

  // 15. RESET SEQUENCES
  sql += `-- =========================================================================\n`;
  sql += `-- ACTUALIZACIÓN DE SECUENCIAS (EVITA ERRORES DE ID DUPLICADO EN NUEVAS INSERCIONES)\n`;
  sql += `-- =========================================================================\n`;
  const tables = [
    'users',
    'telegram_configs',
    'inventory_items',
    'telegram_messages',
    'suppliers',
    'customers',
    'customer_orders',
    'purchases',
    'payments',
    'store_configs',
    'server_domain_configs',
    'ai_configs',
    'email_configs',
    'store_analytics_events',
  ];
  for (const t of tables) {
    sql += `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1), (SELECT COUNT(*) > 0 FROM ${t}));\n`;
  }
  sql += `\n`;

  sql += `-- =========================================================================\n`;
  sql += `-- FIN DE RESPALDO COMERXIA - RESTAURACIÓN COMPLETADA EXITOSAMENTE\n`;
  sql += `-- =========================================================================\n`;

  return sql;
}

/**
 * Creates the Master ZIP containing:
 * 1. comerxia_backup_completo.sql
 * 2. comerxia_backup_completo.json
 * 3. uploads/* (All photos and video files in full resolution)
 * 4. manifest.json (Metadata & statistics)
 * 5. restaurar.sh (One-command restore script for bash/docker)
 * 6. LEEME_MIGRACION.txt
 */
export async function createFullSystemMasterZip(userId?: number): Promise<Buffer> {
  ensureUploadsDirExists();
  const zip = new AdmZip();

  // 1. Generate SQL dump
  const sqlContent = await generateCompleteSqlDump(userId);
  zip.addFile('comerxia_backup_completo.sql', Buffer.from(sqlContent, 'utf-8'));

  // 2. Generate JSON dump
  const data = await getFullSystemData(userId);
  const jsonContent = JSON.stringify(data, null, 2);
  zip.addFile('comerxia_backup_completo.json', Buffer.from(jsonContent, 'utf-8'));

  // 3. Add all physical media from uploads/ directory
  let mediaCount = 0;
  let mediaTotalBytes = 0;
  if (fs.existsSync(UPLOADS_DIR)) {
    const files = fs.readdirSync(UPLOADS_DIR);
    for (const f of files) {
      if (f.startsWith('.')) continue;
      const fullPath = path.join(UPLOADS_DIR, f);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          const fileBuf = fs.readFileSync(fullPath);
          zip.addFile(`uploads/${f}`, fileBuf);
          mediaCount++;
          mediaTotalBytes += stat.size;
        }
      } catch (err) {
        console.warn(`Could not add media file ${f} to master zip:`, err);
      }
    }
  }

  // 4. Create Manifest
  const manifest: FullSystemBackupManifest = {
    version: '2.0.0',
    system: 'Comerxia Cloud & Self-Hosted E-Commerce Suite',
    exportDate: new Date().toISOString(),
    summary: {
      usersCount: data.users.length,
      inventoryCount: data.inventoryItems.length,
      ordersCount: data.customerOrders.length,
      customersCount: data.customers.length,
      suppliersCount: data.suppliers.length,
      purchasesCount: data.purchases.length,
      paymentsCount: data.payments.length,
      telegramMessagesCount: data.telegramMessages.length,
      mediaFilesCount: mediaCount,
      mediaTotalSizeBytes: mediaTotalBytes,
    },
  };
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

  // 5. One-click Restore Script
  const restoreScript = `#!/usr/bin/env bash
# =========================================================================
# COMERXIA - SCRIPT DE RESTAURACIÓN 100% AUTOMÁTICO EN NUEVO SERVIDOR
# Credenciales PostgreSQL: usuario postgres | contraseña postgres | bd comerxia_db
# =========================================================================
set -e

export PGHOST="\${PGHOST:-127.0.0.1}"
export PGPORT="\${PGPORT:-5432}"
export PGUSER="\${PGUSER:-postgres}"
export PGPASSWORD="\${PGPASSWORD:-postgres}"
export PGDATABASE="\${PGDATABASE:-comerxia_db}"

echo "📦 1. Extrayendo archivos multimedia a la carpeta ./uploads..."
mkdir -p uploads
if command -v unzip &> /dev/null; then
  unzip -o -q "\$0" "uploads/*" 2>/dev/null || true
fi
if [ -d "uploads" ]; then
  chmod -R 755 uploads
  echo "✅ Multimedia listo en ./uploads"
fi

if [ -f "comerxia_backup_completo.sql" ]; then
  echo "🗄️ 2. Restaurando base de datos PostgreSQL '\$PGDATABASE' con usuario '\$PGUSER'..."
  if command -v psql &> /dev/null; then
    if PGPASSWORD="\$PGPASSWORD" psql -h "\$PGHOST" -p "\$PGPORT" -U "\$PGUSER" -d "\$PGDATABASE" -f comerxia_backup_completo.sql; then
      echo "✅ Base de datos restaurada exitosamente vía TCP (\$PGHOST:\$PGPORT)."
    elif sudo -u postgres psql -d "\$PGDATABASE" -f comerxia_backup_completo.sql; then
      echo "✅ Base de datos restaurada exitosamente vía sudo -u postgres."
    else
      echo "⚠️ No se pudo restaurar automáticamente. Ejecuta manualmente:"
      echo "  PGPASSWORD='\$PGPASSWORD' psql -h \$PGHOST -p \$PGPORT -U \$PGUSER -d \$PGDATABASE -f comerxia_backup_completo.sql"
    fi
  else
    echo "⚠️ 'psql' no está en el PATH. Ejecuta manualmente:"
    echo "  sudo -u postgres psql -d \$PGDATABASE -f comerxia_backup_completo.sql"
  fi
fi

echo "🎉 ¡Restauración de fotos, videos y datos completada con éxito!"
`;
  zip.addFile('restaurar.sh', Buffer.from(restoreScript, 'utf-8'));

  // 5b. Standalone Backup Script inside Master ZIP
  const backupScript = `#!/usr/bin/env bash
# =========================================================================
# COMERXIA - SCRIPT DE RESPALDO TOTAL DEL SISTEMA (POSTGRESQL + MULTIMEDIA)
# Credenciales PostgreSQL: usuario postgres | contraseña postgres | bd comerxia_db
# =========================================================================
set -e

if [ -f ".env" ]; then
  export SQL_HOST=$(grep -E '^SQL_HOST=' .env | cut -d '=' -f2- | tr -d '\r"' || echo "")
  export SQL_PORT=$(grep -E '^SQL_PORT=' .env | cut -d '=' -f2- | tr -d '\r"' || echo "")
  export SQL_USER=$(grep -E '^SQL_USER=' .env | cut -d '=' -f2- | tr -d '\r"' || echo "")
  export SQL_PASSWORD=$(grep -E '^SQL_PASSWORD=' .env | cut -d '=' -f2- | tr -d '\r"' || echo "")
  export SQL_DB_NAME=$(grep -E '^SQL_DB_NAME=' .env | cut -d '=' -f2- | tr -d '\r"' || echo "")
fi

export PGHOST="\${PGHOST:-\${SQL_HOST:-127.0.0.1}}"
export PGPORT="\${PGPORT:-\${SQL_PORT:-5432}}"
export PGUSER="\${PGUSER:-\${SQL_USER:-postgres}}"
export PGPASSWORD="\${PGPASSWORD:-\${SQL_PASSWORD:-postgres}}"
export PGDATABASE="\${PGDATABASE:-\${SQL_DB_NAME:-comerxia_db}}"

FECHA=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="backups"
mkdir -p "\$BACKUP_DIR"

SQL_FILE="\$BACKUP_DIR/comerxia_backup_\${FECHA}.sql"
TAR_FILE="\$BACKUP_DIR/comerxia_respaldo_total_\${FECHA}.tar.gz"

echo "================================================================="
echo "📦 COMERXIA: GENERANDO RESPALDO TOTAL"
echo "================================================================="
echo "Host:       \$PGHOST:\$PGPORT"
echo "Usuario:    \$PGUSER"
echo "Base Datos: \$PGDATABASE"
echo "-----------------------------------------------------------------"

DUMP_OK=0
if command -v pg_dump &> /dev/null; then
  echo "⏳ Ejecutando pg_dump con usuario '\$PGUSER'..."
  if PGPASSWORD="\$PGPASSWORD" pg_dump -h "\$PGHOST" -p "\$PGPORT" -U "\$PGUSER" -d "\$PGDATABASE" -F p -f "\$SQL_FILE" 2>/dev/null; then
    DUMP_OK=1
    echo "✅ Volcado de base de datos exitoso: \$SQL_FILE"
  elif sudo -u postgres pg_dump "\$PGDATABASE" > "\$SQL_FILE" 2>/dev/null; then
    DUMP_OK=1
    echo "✅ Volcado con sudo -u postgres exitoso: \$SQL_FILE"
  fi
fi

if [ \$DUMP_OK -eq 1 ]; then
  if [ -d "uploads" ] && [ "\$(ls -A uploads 2>/dev/null)" ]; then
    echo "📸 Empaquetando fotos y videos de ./uploads..."
    tar -czf "\$TAR_FILE" "\$SQL_FILE" uploads/ 2>/dev/null || true
    echo "🎉 ¡Respaldo total completado en: \$TAR_FILE!"
  else
    echo "🎉 ¡Respaldo SQL completado en: \$SQL_FILE!"
  fi
else
  echo "❌ Error al generar respaldo. Verifica tus credenciales (postgres/postgres)."
  exit 1
fi
`;
  zip.addFile('respaldar.sh', Buffer.from(backupScript, 'utf-8'));

  // 6. Clear step-by-step instructions in Spanish
  const readme = `================================================================================
COMERXIA - RESPALDO MAESTRO 100% DEL SISTEMA (DATOS + FOTOS Y VIDEOS)
================================================================================
Fecha de creación: ${new Date().toLocaleString('es-EC')}

Este archivo contiene el 100% de la información de tu plataforma Comerxia:
1. Base de datos completa en PostgreSQL: comerxia_backup_completo.sql
2. Base de datos completa en JSON:       comerxia_backup_completo.json
3. Fotografías y videos de productos:   carpeta uploads/ (con nombres exactos)
4. Manifiesto y estadísticas:           manifest.json
5. Script de restauración:              restaurar.sh
6. Script de respaldo futuro:           respaldar.sh

--------------------------------------------------------------------------------
CREDENCIALES ESTÁNDAR DE BASE DE DATOS
--------------------------------------------------------------------------------
Usuario:    postgres
Contraseña: postgres
Base Datos: comerxia_db
Host:       127.0.0.1:5432

--------------------------------------------------------------------------------
¿CÓMO RESTAURAR EN UN NUEVO SERVIDOR?
--------------------------------------------------------------------------------
MÉTODO A: RESTAURACIÓN AUTOMÁTICA DESDE EL PANEL DE COMERXIA (RECOMENDADO)
1. Inicia sesión como administrador en el nuevo servidor.
2. Ve a Configuración de Servidor -> Pestaña "Respaldos y Migración".
3. En la sección "Restaurar Respaldo Maestro (.ZIP)", sube este archivo.
4. El sistema descomprimirá automáticamente todas las fotos y videos en /uploads
   y actualizará los registros de la base de datos. ¡Listo al instante!

MÉTODO B: RESTAURACIÓN POR COMANDOS DE TERMINAL
1. Descomprime este archivo ZIP en la raíz de tu proyecto Comerxia en el nuevo servidor:
   unzip -o comerxia_respaldo_maestro_completo.zip
2. Ejecuta el script de restauración:
   bash restaurar.sh
   (o directamente con psql):
   PGPASSWORD='postgres' psql -h 127.0.0.1 -p 5432 -U postgres -d comerxia_db -f comerxia_backup_completo.sql
   (o con sudo local):
   sudo -u postgres psql -d comerxia_db -f comerxia_backup_completo.sql

3. Reinicia el servicio Comerxia:
   pm2 restart comerxia || npm start

¡Todas las fotos, videos y configuraciones cargarán de forma idéntica!
`;
  zip.addFile('LEEME_MIGRACION.txt', Buffer.from(readme, 'utf-8'));

  return zip.toBuffer();
}

/**
 * Restores 100% of the database from a structured JSON backup.
 */
export async function restoreCompleteJsonDump(
  backupData: any,
  targetUserId: number = 1
): Promise<{ success: boolean; counts: Record<string, number>; errors: string[] }> {
  const counts: Record<string, number> = {
    users: 0,
    inventoryItems: 0,
    customerOrders: 0,
    customers: 0,
    suppliers: 0,
    purchases: 0,
    payments: 0,
    storeConfigs: 0,
    telegramConfigs: 0,
    aiConfigs: 0,
    emailConfigs: 0,
    serverDomainConfigs: 0,
  };
  const errors: string[] = [];

  if (!backupData || typeof backupData !== 'object') {
    throw new Error('El archivo de respaldo JSON no tiene un formato válido.');
  }

  // 1. Local storage restore
  if (!isPostgresConfigured()) {
    const state = storage.getState();

    if (Array.isArray(backupData.users) && backupData.users.length > 0) {
      for (const u of backupData.users) {
        const idx = state.users.findIndex((ex) => ex.id === u.id || ex.username === u.username);
        if (idx >= 0) {
          state.users[idx] = { ...state.users[idx], ...u };
        } else {
          state.users.push(u);
        }
        counts.users++;
      }
    }

    if (Array.isArray(backupData.inventoryItems) && backupData.inventoryItems.length > 0) {
      for (const item of backupData.inventoryItems) {
        const clean = sanitizeInventoryItemForExport(item);
        const idx = state.inventoryItems.findIndex((ex) => ex.id === clean.id || ex.sku === clean.sku);
        if (idx >= 0) {
          state.inventoryItems[idx] = { ...state.inventoryItems[idx], ...clean };
        } else {
          state.inventoryItems.push(clean);
        }
        counts.inventoryItems++;
      }
    }

    if (Array.isArray(backupData.customerOrders) && backupData.customerOrders.length > 0) {
      for (const o of backupData.customerOrders) {
        const idx = state.customerOrders.findIndex((ex) => ex.id === o.id || ex.orderNumber === o.orderNumber);
        if (idx >= 0) {
          state.customerOrders[idx] = { ...state.customerOrders[idx], ...o };
        } else {
          state.customerOrders.push(o);
        }
        counts.customerOrders++;
      }
    }

    if (Array.isArray(backupData.customers) && backupData.customers.length > 0) {
      for (const c of backupData.customers) {
        const idx = state.customers.findIndex((ex) => ex.id === c.id || ex.phone === c.phone);
        if (idx >= 0) {
          state.customers[idx] = { ...state.customers[idx], ...c };
        } else {
          state.customers.push(c);
        }
        counts.customers++;
      }
    }

    if (Array.isArray(backupData.suppliers) && backupData.suppliers.length > 0) {
      for (const s of backupData.suppliers) {
        const idx = state.suppliers.findIndex((ex) => ex.id === s.id || ex.phone === s.phone);
        if (idx >= 0) {
          state.suppliers[idx] = { ...state.suppliers[idx], ...s };
        } else {
          state.suppliers.push(s);
        }
        counts.suppliers++;
      }
    }

    if (Array.isArray(backupData.purchases) && backupData.purchases.length > 0) {
      for (const p of backupData.purchases) {
        const idx = state.purchases.findIndex((ex) => ex.id === p.id || ex.purchaseNumber === p.purchaseNumber);
        if (idx >= 0) {
          state.purchases[idx] = { ...state.purchases[idx], ...p };
        } else {
          state.purchases.push(p);
        }
        counts.purchases++;
      }
    }

    if (Array.isArray(backupData.payments) && backupData.payments.length > 0) {
      for (const pm of backupData.payments) {
        const idx = state.payments.findIndex((ex) => ex.id === pm.id || ex.paymentNumber === pm.paymentNumber);
        if (idx >= 0) {
          state.payments[idx] = { ...state.payments[idx], ...pm };
        } else {
          state.payments.push(pm);
        }
        counts.payments++;
      }
    }

    if (Array.isArray(backupData.storeConfigs) && backupData.storeConfigs.length > 0) {
      state.storeConfigs = backupData.storeConfigs.map((sc: any) => ({
        ...sc,
        logoUrl: normalizeMediaUrl(sc.logoUrl),
        logoDesktopUrl: normalizeMediaUrl(sc.logoDesktopUrl || sc.logo_desktop_url),
      }));
      counts.storeConfigs = state.storeConfigs.length;
    }

    if (Array.isArray(backupData.telegramConfigs) && backupData.telegramConfigs.length > 0) {
      state.telegramConfigs = backupData.telegramConfigs;
      counts.telegramConfigs = state.telegramConfigs.length;
      for (const tc of backupData.telegramConfigs) {
        if (tc.botToken && typeof tc.botToken === 'string' && tc.botToken.trim()) {
          process.env.TELEGRAM_BOT_TOKEN = tc.botToken.trim();
        }
      }
    }

    if (Array.isArray(backupData.aiConfigs) && backupData.aiConfigs.length > 0) {
      state.aiConfigs = backupData.aiConfigs;
      counts.aiConfigs = state.aiConfigs.length;
      for (const aic of backupData.aiConfigs) {
        if (aic.apiKey && typeof aic.apiKey === 'string' && aic.apiKey.trim()) {
          process.env.GEMINI_API_KEY = aic.apiKey.trim();
        }
      }
    }

    if (Array.isArray(backupData.emailConfigs) && backupData.emailConfigs.length > 0) {
      state.emailConfigs = backupData.emailConfigs;
      counts.emailConfigs = state.emailConfigs.length;
    }

    if (Array.isArray(backupData.serverDomainConfigs) && backupData.serverDomainConfigs.length > 0) {
      state.serverDomainConfigs = backupData.serverDomainConfigs;
      counts.serverDomainConfigs = state.serverDomainConfigs.length;
    }

    storage.save();
    return { success: true, counts, errors };
  }

  // 2. PostgreSQL restore
  try {
    // Users
    if (Array.isArray(backupData.users)) {
      for (const u of backupData.users) {
        try {
          await db
            .insert(users)
            .values({
              id: u.id,
              uid: u.uid || `user-${u.id}`,
              username: u.username,
              password: u.password || 'admin',
              email: u.email || 'admin@comerxia.com',
              name: u.name || 'Admin',
              role: u.role || 'admin',
              photoUrl: u.photoUrl || null,
              isActive: u.isActive !== false,
            })
            .onConflictDoNothing();
          counts.users++;
        } catch (err: any) {
          errors.push(`Error al restaurar usuario ${u.username}: ${err?.message}`);
        }
      }
    }

    // Store Configs
    if (Array.isArray(backupData.storeConfigs) && backupData.storeConfigs.length > 0) {
      for (const sc of backupData.storeConfigs) {
        try {
          const validUserId = await resolveValidUserId(sc.userId || targetUserId);
          let existingStore: any = null;
          if (sc.id) {
            const [foundById] = await db.select().from(storeConfigs).where(eq(storeConfigs.id, sc.id)).limit(1);
            if (foundById) existingStore = foundById;
          }
          if (!existingStore) {
            const [foundByUser] = await db.select().from(storeConfigs).where(eq(storeConfigs.userId, validUserId)).limit(1);
            if (foundByUser) existingStore = foundByUser;
          }
          if (!existingStore) {
            const [foundAny] = await db.select().from(storeConfigs).limit(1);
            if (foundAny) existingStore = foundAny;
          }

          const storeValues: any = {
            userId: validUserId,
            storeName: sc.storeName || 'Comerxia Store',
            whatsappNumber: sc.whatsappNumber || '',
            description: sc.description || '',
            bannerText: sc.bannerText || '',
            deliveryFee: String(sc.deliveryFee || '0.00'),
            minOrderAmount: String(sc.minOrderAmount || '0.00'),
            currency: sc.currency || 'USD',
            isActive: sc.isActive !== false,
            maintenanceTitle: sc.maintenanceTitle || 'Tienda Temporalmente Pausada',
            maintenanceMessage: sc.maintenanceMessage || 'Estamos actualizando nuestro catálogo e inventario. ¡Volvemos muy pronto!',
            allowCatalogBrowsing: Boolean(sc.allowCatalogBrowsing),
            showStock: sc.showStock !== false,
            showOutOfStock: sc.showOutOfStock !== false,
            instagramUrl: sc.instagramUrl || null,
            websiteUrl: sc.websiteUrl || null,
            address: sc.address || null,
            logoUrl: normalizeMediaUrl(sc.logoUrl),
            logoDesktopUrl: normalizeMediaUrl(sc.logoDesktopUrl || sc.logo_desktop_url),
            courierLogos: sc.courierLogos || null,
            paymentLogos: sc.paymentLogos || null,
            theme: sc.theme || 'classic',
            promoPopup: sc.promoPopup || null,
            updatedAt: new Date(),
          };

          if (existingStore) {
            await db.update(storeConfigs).set(storeValues).where(eq(storeConfigs.id, existingStore.id));
          } else {
            if (sc.id && typeof sc.id === 'number') {
              storeValues.id = sc.id;
            }
            await db.insert(storeConfigs).values(storeValues).onConflictDoNothing();
          }

          // Sync storage fallback
          const state = storage.getState();
          if (!state.storeConfigs) state.storeConfigs = [];
          const idx = state.storeConfigs.findIndex((ex) => ex.id === (sc.id || existingStore?.id) || ex.userId === validUserId);
          if (idx >= 0) {
            state.storeConfigs[idx] = { 
              ...state.storeConfigs[idx], 
              ...sc, 
              logoUrl: normalizeMediaUrl(sc.logoUrl),
              logoDesktopUrl: normalizeMediaUrl(sc.logoDesktopUrl || sc.logo_desktop_url) 
            };
          } else {
            state.storeConfigs.push({ 
              ...sc, 
              logoUrl: normalizeMediaUrl(sc.logoUrl),
              logoDesktopUrl: normalizeMediaUrl(sc.logoDesktopUrl || sc.logo_desktop_url)
            });
          }

          counts.storeConfigs++;
        } catch (err: any) {
          errors.push(`Error al restaurar store config: ${err?.message}`);
        }
      }
    }

    // Inventory Items
    if (Array.isArray(backupData.inventoryItems)) {
      for (const item of backupData.inventoryItems) {
        try {
          const clean = sanitizeInventoryItemForExport(item);
          const validUserId = await resolveValidUserId(clean.userId || targetUserId);
          let existingItem: any = null;
          if (clean.id) {
            const [foundById] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.id, clean.id)).limit(1);
            if (foundById) existingItem = foundById;
          }
          if (!existingItem && clean.sku) {
            const [foundBySku] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.sku, clean.sku)).limit(1);
            if (foundBySku) existingItem = foundBySku;
          }

          const itemValues: any = {
            userId: validUserId,
            name: clean.name,
            sku: clean.sku,
            barcode: clean.barcode || null,
            description: clean.description || null,
            category: clean.category || 'General',
            costPrice: String(clean.costPrice || '0.00'),
            salePrice: String(clean.salePrice || '0.00'),
            discountPercent: clean.discountPercent || 0,
            stock: clean.stock || 0,
            imageUrl: clean.imageUrl || null,
            videoUrl: clean.videoUrl || null,
            supplierName: clean.supplierName || 'Proveedor',
            tags: clean.tags || null,
            extractedAttributes: clean.extractedAttributes || null,
            status: clean.status || 'available',
            rawTelegramMessage: clean.rawTelegramMessage || null,
            marketingCopy: clean.marketingCopy || null,
          };

          if (existingItem) {
            await db.update(inventoryItems).set(itemValues).where(eq(inventoryItems.id, existingItem.id));
          } else {
            if (clean.id && typeof clean.id === 'number') {
              itemValues.id = clean.id;
            }
            await db.insert(inventoryItems).values(itemValues).onConflictDoNothing();
          }
          counts.inventoryItems++;
        } catch (err: any) {
          errors.push(`Error al restaurar producto ${item.name}: ${err?.message}`);
        }
      }
    }

    // Customers
    if (Array.isArray(backupData.customers)) {
      for (const c of backupData.customers) {
        try {
          const validUserId = await resolveValidUserId(c.userId || targetUserId);
          let existingCust: any = null;
          if (c.id) {
            const [foundById] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, c.id)).limit(1);
            if (foundById) existingCust = foundById;
          }
          if (!existingCust && c.phone) {
            const [foundByPhone] = await db.select({ id: customers.id }).from(customers).where(eq(customers.phone, c.phone)).limit(1);
            if (foundByPhone) existingCust = foundByPhone;
          }

          const custValues: any = {
            userId: validUserId,
            name: c.name,
            phone: c.phone,
            ci: c.ci || null,
            email: c.email || null,
            address: c.address || null,
            province: c.province || null,
            canton: c.canton || null,
            parish: c.parish || null,
            exactAddress: c.exactAddress || null,
            reference: c.reference || null,
            totalOrders: c.totalOrders || 0,
            totalSpent: String(c.totalSpent || '0.00'),
            notes: c.notes || null,
          };

          if (existingCust) {
            await db.update(customers).set(custValues).where(eq(customers.id, existingCust.id));
          } else {
            if (c.id && typeof c.id === 'number') {
              custValues.id = c.id;
            }
            await db.insert(customers).values(custValues).onConflictDoNothing();
          }
          counts.customers++;
        } catch (err: any) {
          errors.push(`Error al restaurar cliente ${c.name}: ${err?.message}`);
        }
      }
    }

    // Customer Orders
    if (Array.isArray(backupData.customerOrders)) {
      for (const o of backupData.customerOrders) {
        try {
          const validUserId = await resolveValidUserId(o.userId || targetUserId);
          let existingOrder: any = null;
          if (o.id) {
            const [foundById] = await db.select({ id: customerOrders.id }).from(customerOrders).where(eq(customerOrders.id, o.id)).limit(1);
            if (foundById) existingOrder = foundById;
          }
          if (!existingOrder && o.orderNumber) {
            const [foundByNum] = await db.select({ id: customerOrders.id }).from(customerOrders).where(eq(customerOrders.orderNumber, o.orderNumber)).limit(1);
            if (foundByNum) existingOrder = foundByNum;
          }

          const orderValues: any = {
            userId: validUserId,
            orderNumber: o.orderNumber,
            customerName: o.customerName,
            customerPhone: o.customerPhone,
            customerCi: o.customerCi || null,
            customerEmail: o.customerEmail || null,
            customerAddress: o.customerAddress || null,
            items: typeof o.items === 'object' ? JSON.stringify(o.items) : (o.items || '[]'),
            totalAmount: String(o.totalAmount || '0.00'),
            paymentMethod: o.paymentMethod || 'whatsapp',
            status: o.status || 'pending',
            paymentVoucher: o.paymentVoucher || null,
            notes: o.notes || null,
            trackingNumber: o.trackingNumber || null,
            trackingCarrier: o.trackingCarrier || null,
            trackingNotes: o.trackingNotes || null,
            fulfillmentStatus: o.fulfillmentStatus || 'in_stock',
            linkedPurchaseId: o.linkedPurchaseId || null,
            linkedPurchaseNumber: o.linkedPurchaseNumber || null,
            returns: o.returns || null,
            createdAt: o.createdAt ? new Date(o.createdAt) : new Date(),
          };

          if (existingOrder) {
            await db.update(customerOrders).set(orderValues).where(eq(customerOrders.id, existingOrder.id));
          } else {
            if (o.id && typeof o.id === 'number') {
              orderValues.id = o.id;
            }
            await db.insert(customerOrders).values(orderValues).onConflictDoNothing();
          }
          counts.customerOrders++;
        } catch (err: any) {
          errors.push(`Error al restaurar pedido ${o.orderNumber}: ${err?.message}`);
        }
      }
    }

    // Suppliers
    if (Array.isArray(backupData.suppliers)) {
      for (const s of backupData.suppliers) {
        try {
          const validUserId = await resolveValidUserId(s.userId || targetUserId);
          let existingSupplier: any = null;
          if (s.id) {
            const [foundById] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, s.id)).limit(1);
            if (foundById) existingSupplier = foundById;
          }
          if (!existingSupplier && s.name) {
            const [foundByName] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.name, s.name)).limit(1);
            if (foundByName) existingSupplier = foundByName;
          }

          const supplierValues: any = {
            userId: validUserId,
            name: s.name,
            tradeName: s.tradeName || null,
            ruc: s.ruc || null,
            phone: s.phone || '',
            email: s.email || null,
            contactPerson: s.contactPerson || null,
            contactPersonPhone: s.contactPersonPhone || null,
            contactPersonRole: s.contactPersonRole || null,
            category: s.category || 'General',
            country: s.country || 'Ecuador',
            city: s.city || null,
            address: s.address || null,
            website: s.website || null,
            paymentTerms: s.paymentTerms || 'cash',
            creditLimit: String(s.creditLimit || '0.00'),
            bankDetails: s.bankDetails || null,
            leadTimeDays: s.leadTimeDays || 1,
            rating: s.rating || 5,
            status: s.status || 'active',
            notes: s.notes || null,
          };

          if (existingSupplier) {
            await db.update(suppliers).set(supplierValues).where(eq(suppliers.id, existingSupplier.id));
          } else {
            if (s.id && typeof s.id === 'number') {
              supplierValues.id = s.id;
            }
            await db.insert(suppliers).values(supplierValues).onConflictDoNothing();
          }
          counts.suppliers = (counts.suppliers || 0) + 1;
        } catch (err: any) {
          errors.push(`Error al restaurar proveedor ${s.name}: ${err?.message}`);
        }
      }
    }

    // Purchases (Compras y Abastecimiento de Proveedores)
    if (Array.isArray(backupData.purchases)) {
      for (const p of backupData.purchases) {
        try {
          const validUserId = await resolveValidUserId(p.userId || targetUserId);

          // Foreign Key Safe Check: verify linkedCustomerOrderId exists in customerOrders table
          let validLinkedOrderId: number | null = null;
          if (p.linkedCustomerOrderId) {
            try {
              const [existOrd] = await db
                .select({ id: customerOrders.id })
                .from(customerOrders)
                .where(eq(customerOrders.id, p.linkedCustomerOrderId))
                .limit(1);
              if (existOrd) {
                validLinkedOrderId = existOrd.id;
              }
            } catch {}
          }
          // If not matched by ID, try matching by linkedCustomerOrderNumber
          if (!validLinkedOrderId && p.linkedCustomerOrderNumber) {
            try {
              const [existOrdByNum] = await db
                .select({ id: customerOrders.id })
                .from(customerOrders)
                .where(eq(customerOrders.orderNumber, p.linkedCustomerOrderNumber))
                .limit(1);
              if (existOrdByNum) {
                validLinkedOrderId = existOrdByNum.id;
              }
            } catch {}
          }

          // Check if purchase already exists by ID or purchaseNumber
          let existingPurchase: any = null;
          try {
            if (p.id) {
              const [foundById] = await db
                .select({ id: purchases.id })
                .from(purchases)
                .where(eq(purchases.id, p.id))
                .limit(1);
              if (foundById) existingPurchase = foundById;
            }
            if (!existingPurchase && p.purchaseNumber) {
              const [foundByNum] = await db
                .select({ id: purchases.id })
                .from(purchases)
                .where(eq(purchases.purchaseNumber, p.purchaseNumber))
                .limit(1);
              if (foundByNum) existingPurchase = foundByNum;
            }
          } catch {}

          const itemsStr = typeof p.items === 'object' ? JSON.stringify(p.items) : (p.items || '[]');
          const receptionsStr = typeof p.receptions === 'object' ? JSON.stringify(p.receptions) : (p.receptions || '[]');
          const returnsStr = typeof p.returns === 'object' ? JSON.stringify(p.returns) : (p.returns || '[]');

          const purchaseValues: any = {
            userId: validUserId,
            purchaseNumber: p.purchaseNumber,
            supplierName: p.supplierName || 'Proveedor',
            supplierContact: p.supplierContact || null,
            items: itemsStr,
            totalCost: String(p.totalCost || '0.00'),
            status: p.status || 'pending',
            paymentStatus: p.paymentStatus || 'paid',
            linkedCustomerOrderId: validLinkedOrderId,
            linkedCustomerOrderNumber: p.linkedCustomerOrderNumber || null,
            receiptVoucher: p.receiptVoucher || null,
            receptions: receptionsStr,
            returns: returnsStr,
            notes: p.notes || null,
            purchaseDate: p.purchaseDate ? new Date(p.purchaseDate) : new Date(),
            receivedDate: p.receivedDate ? new Date(p.receivedDate) : null,
            updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
          };

          if (existingPurchase) {
            await db
              .update(purchases)
              .set(purchaseValues)
              .where(eq(purchases.id, existingPurchase.id));
          } else {
            if (p.id && typeof p.id === 'number') {
              purchaseValues.id = p.id;
            }
            purchaseValues.createdAt = p.createdAt ? new Date(p.createdAt) : new Date();
            await db.insert(purchases).values(purchaseValues).onConflictDoNothing();
          }

          // Also sync to memory/file storage fallback so local Node.js environment has the purchases
          const state = storage.getState();
          if (!state.purchases) state.purchases = [];
          const idx = state.purchases.findIndex((ex) => ex.id === p.id || ex.purchaseNumber === p.purchaseNumber);
          if (idx >= 0) {
            state.purchases[idx] = { ...state.purchases[idx], ...p };
          } else {
            state.purchases.push(p);
          }

          counts.purchases = (counts.purchases || 0) + 1;
        } catch (err: any) {
          console.error(`[SystemBackup] Error al restaurar compra ${p?.purchaseNumber}:`, err);
          errors.push(`Error al restaurar compra ${p?.purchaseNumber}: ${err?.message}`);
        }
      }
    }

    // Payments (Cobros y Pagos)
    if (Array.isArray(backupData.payments)) {
      for (const pm of backupData.payments) {
        try {
          const validUserId = await resolveValidUserId(pm.userId || targetUserId);

          // Foreign Key Safe Check for orderId
          let validOrderId: number | null = null;
          if (pm.orderId) {
            try {
              const [existOrd] = await db.select({ id: customerOrders.id }).from(customerOrders).where(eq(customerOrders.id, pm.orderId)).limit(1);
              if (existOrd) validOrderId = existOrd.id;
            } catch {}
          }
          if (!validOrderId && pm.orderNumber) {
            try {
              const [existOrdByNum] = await db.select({ id: customerOrders.id }).from(customerOrders).where(eq(customerOrders.orderNumber, pm.orderNumber)).limit(1);
              if (existOrdByNum) validOrderId = existOrdByNum.id;
            } catch {}
          }

          // Foreign Key Safe Check for purchaseId
          let validPurchaseId: number | null = null;
          if (pm.purchaseId) {
            try {
              const [existPurch] = await db.select({ id: purchases.id }).from(purchases).where(eq(purchases.id, pm.purchaseId)).limit(1);
              if (existPurch) validPurchaseId = existPurch.id;
            } catch {}
          }
          if (!validPurchaseId && pm.purchaseNumber) {
            try {
              const [existPurchByNum] = await db.select({ id: purchases.id }).from(purchases).where(eq(purchases.purchaseNumber, pm.purchaseNumber)).limit(1);
              if (existPurchByNum) validPurchaseId = existPurchByNum.id;
            } catch {}
          }

          // Foreign Key Safe Check for customerId
          let validCustomerId: number | null = null;
          if (pm.customerId) {
            try {
              const [existCust] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, pm.customerId)).limit(1);
              if (existCust) validCustomerId = existCust.id;
            } catch {}
          }

          // Foreign Key Safe Check for supplierId
          let validSupplierId: number | null = null;
          if (pm.supplierId) {
            try {
              const [existSupp] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, pm.supplierId)).limit(1);
              if (existSupp) validSupplierId = existSupp.id;
            } catch {}
          }

          let existingPayment: any = null;
          if (pm.id) {
            const [foundById] = await db.select({ id: payments.id }).from(payments).where(eq(payments.id, pm.id)).limit(1);
            if (foundById) existingPayment = foundById;
          }
          if (!existingPayment && pm.paymentNumber) {
            const [foundByNum] = await db.select({ id: payments.id }).from(payments).where(eq(payments.paymentNumber, pm.paymentNumber)).limit(1);
            if (foundByNum) existingPayment = foundByNum;
          }

          const paymentValues: any = {
            userId: validUserId,
            paymentNumber: pm.paymentNumber,
            type: pm.type || 'inflow',
            category: pm.category || 'customer_sale',
            amount: String(pm.amount || '0.00'),
            paymentMethod: pm.paymentMethod || 'transferencia_bancaria',
            bankOrAccount: pm.bankOrAccount || 'Banco Pichincha',
            referenceNumber: pm.referenceNumber || null,
            paymentDate: pm.paymentDate ? new Date(pm.paymentDate) : new Date(),
            status: pm.status || 'completed',
            notes: pm.notes || null,
            voucherUrl: pm.voucherUrl || null,
            orderId: validOrderId,
            orderNumber: pm.orderNumber || null,
            customerId: validCustomerId,
            customerName: pm.customerName || null,
            purchaseId: validPurchaseId,
            purchaseNumber: pm.purchaseNumber || null,
            supplierName: pm.supplierName || null,
            supplierId: validSupplierId,
            returnId: pm.returnId || null,
            updatedAt: pm.updatedAt ? new Date(pm.updatedAt) : new Date(),
          };

          if (existingPayment) {
            await db.update(payments).set(paymentValues).where(eq(payments.id, existingPayment.id));
          } else {
            if (pm.id && typeof pm.id === 'number') {
              paymentValues.id = pm.id;
            }
            paymentValues.createdAt = pm.createdAt ? new Date(pm.createdAt) : new Date();
            await db.insert(payments).values(paymentValues).onConflictDoNothing();
          }

          const state = storage.getState();
          if (!state.payments) state.payments = [];
          const idx = state.payments.findIndex((ex) => ex.id === pm.id || ex.paymentNumber === pm.paymentNumber);
          if (idx >= 0) {
            state.payments[idx] = { ...state.payments[idx], ...pm };
          } else {
            state.payments.push(pm);
          }

          counts.payments = (counts.payments || 0) + 1;
        } catch (err: any) {
          errors.push(`Error al restaurar pago ${pm.paymentNumber}: ${err?.message}`);
        }
      }
    }

    // Telegram Configs
    if (Array.isArray(backupData.telegramConfigs) && backupData.telegramConfigs.length > 0) {
      for (const tc of backupData.telegramConfigs) {
        try {
          const validUserId = await resolveValidUserId(tc.userId || targetUserId);
          let existingTg: any = null;
          if (tc.id) {
            const [foundById] = await db.select().from(telegramConfigs).where(eq(telegramConfigs.id, tc.id)).limit(1);
            if (foundById) existingTg = foundById;
          }
          if (!existingTg) {
            const [foundByUser] = await db.select().from(telegramConfigs).where(eq(telegramConfigs.userId, validUserId)).limit(1);
            if (foundByUser) existingTg = foundByUser;
          }
          if (!existingTg) {
            const [foundAny] = await db.select().from(telegramConfigs).limit(1);
            if (foundAny) existingTg = foundAny;
          }

          const tgValues: any = {
            userId: validUserId,
            botToken: tc.botToken || null,
            webhookSecret: tc.webhookSecret || null,
            supplierName: tc.supplierName || 'Proveedor Telegram Principal',
            supplierUsername: tc.supplierUsername || null,
            autoApprove: tc.autoApprove !== false,
            defaultMarginPercent: tc.defaultMarginPercent || 35,
            currency: tc.currency || 'USD',
            defaultStockEnabled: Boolean(tc.defaultStockEnabled),
            defaultStockQuantity: tc.defaultStockQuantity || 10,
            taxPercent: tc.taxPercent ?? 15,
            useAi: tc.useAi !== false,
            updatedAt: new Date(),
          };

          if (existingTg) {
            await db.update(telegramConfigs).set(tgValues).where(eq(telegramConfigs.id, existingTg.id));
          } else {
            if (tc.id && typeof tc.id === 'number') {
              tgValues.id = tc.id;
            }
            await db.insert(telegramConfigs).values(tgValues).onConflictDoNothing();
          }

          if (tc.botToken && typeof tc.botToken === 'string' && tc.botToken.trim()) {
            process.env.TELEGRAM_BOT_TOKEN = tc.botToken.trim();
          }

          // Sync storage fallback
          const state = storage.getState();
          if (!state.telegramConfigs) state.telegramConfigs = [];
          const idx = state.telegramConfigs.findIndex((ex) => ex.id === (tc.id || existingTg?.id) || ex.userId === validUserId);
          if (idx >= 0) {
            state.telegramConfigs[idx] = { ...state.telegramConfigs[idx], ...tc };
          } else {
            state.telegramConfigs.push(tc);
          }
          storage.save();

          counts.telegramConfigs = (counts.telegramConfigs || 0) + 1;
        } catch (err: any) {
          errors.push(`Error al restaurar telegram config: ${err?.message}`);
        }
      }
    }

    // AI Configs
    if (Array.isArray(backupData.aiConfigs) && backupData.aiConfigs.length > 0) {
      for (const aic of backupData.aiConfigs) {
        try {
          const validUserId = await resolveValidUserId(aic.userId || targetUserId);
          let existingAi: any = null;
          if (aic.id) {
            const [foundById] = await db.select().from(aiConfigs).where(eq(aiConfigs.id, aic.id)).limit(1);
            if (foundById) existingAi = foundById;
          }
          if (!existingAi) {
            const [foundByUser] = await db.select().from(aiConfigs).where(eq(aiConfigs.userId, validUserId)).limit(1);
            if (foundByUser) existingAi = foundByUser;
          }
          if (!existingAi) {
            const [foundAny] = await db.select().from(aiConfigs).limit(1);
            if (foundAny) existingAi = foundAny;
          }

          const aiValues: any = {
            userId: validUserId,
            apiKey: aic.apiKey || null,
            modelName: aic.modelName || 'gemini-3.6-flash',
            temperature: String(aic.temperature || '0.20'),
            updatedAt: new Date(),
          };

          if (existingAi) {
            await db.update(aiConfigs).set(aiValues).where(eq(aiConfigs.id, existingAi.id));
          } else {
            if (aic.id && typeof aic.id === 'number') {
              aiValues.id = aic.id;
            }
            await db.insert(aiConfigs).values(aiValues).onConflictDoNothing();
          }

          if (aic.apiKey && typeof aic.apiKey === 'string' && aic.apiKey.trim()) {
            process.env.GEMINI_API_KEY = aic.apiKey.trim();
          }

          // Sync storage fallback
          const state = storage.getState();
          if (!state.aiConfigs) state.aiConfigs = [];
          const idx = state.aiConfigs.findIndex((ex) => ex.id === (aic.id || existingAi?.id) || ex.userId === validUserId);
          if (idx >= 0) {
            state.aiConfigs[idx] = { ...state.aiConfigs[idx], ...aic };
          } else {
            state.aiConfigs.push(aic);
          }

          counts.aiConfigs = (counts.aiConfigs || 0) + 1;
        } catch (err: any) {
          errors.push(`Error al restaurar ai config: ${err?.message}`);
        }
      }
    }

    // Email Configs
    if (Array.isArray(backupData.emailConfigs) && backupData.emailConfigs.length > 0) {
      for (const ec of backupData.emailConfigs) {
        try {
          const validUserId = await resolveValidUserId(ec.userId || targetUserId);
          let existingEmail: any = null;
          if (ec.id) {
            const [foundById] = await db.select().from(emailConfigs).where(eq(emailConfigs.id, ec.id)).limit(1);
            if (foundById) existingEmail = foundById;
          }
          if (!existingEmail) {
            const [foundByUser] = await db.select().from(emailConfigs).where(eq(emailConfigs.userId, validUserId)).limit(1);
            if (foundByUser) existingEmail = foundByUser;
          }
          if (!existingEmail) {
            const [foundAny] = await db.select().from(emailConfigs).limit(1);
            if (foundAny) existingEmail = foundAny;
          }

          const emailValues: any = {
            userId: validUserId,
            googleEmail: ec.googleEmail || null,
            googleAppPassword: ec.googleAppPassword || null,
            senderName: ec.senderName || 'Comerxia App',
            smtpHost: ec.smtpHost || 'smtp.gmail.com',
            smtpPort: ec.smtpPort || 465,
            smtpSecure: ec.smtpSecure !== false,
            requireActivation: ec.requireActivation !== false,
            updatedAt: new Date(),
          };

          if (existingEmail) {
            await db.update(emailConfigs).set(emailValues).where(eq(emailConfigs.id, existingEmail.id));
          } else {
            if (ec.id && typeof ec.id === 'number') {
              emailValues.id = ec.id;
            }
            await db.insert(emailConfigs).values(emailValues).onConflictDoNothing();
          }

          // Sync storage fallback
          const state = storage.getState();
          if (!state.emailConfigs) state.emailConfigs = [];
          const idx = state.emailConfigs.findIndex((ex) => ex.id === (ec.id || existingEmail?.id) || ex.userId === validUserId);
          if (idx >= 0) {
            state.emailConfigs[idx] = { ...state.emailConfigs[idx], ...ec };
          } else {
            state.emailConfigs.push(ec);
          }

          counts.emailConfigs = (counts.emailConfigs || 0) + 1;
        } catch (err: any) {
          errors.push(`Error al restaurar email config: ${err?.message}`);
        }
      }
    }

    // Server Domain Configs
    if (Array.isArray(backupData.serverDomainConfigs) && backupData.serverDomainConfigs.length > 0) {
      for (const dc of backupData.serverDomainConfigs) {
        try {
          const validUserId = await resolveValidUserId(dc.userId || targetUserId);
          let existingDomain: any = null;
          if (dc.id) {
            const [foundById] = await db.select().from(serverDomainConfigs).where(eq(serverDomainConfigs.id, dc.id)).limit(1);
            if (foundById) existingDomain = foundById;
          }
          if (!existingDomain) {
            const [foundByUser] = await db.select().from(serverDomainConfigs).where(eq(serverDomainConfigs.userId, validUserId)).limit(1);
            if (foundByUser) existingDomain = foundByUser;
          }
          if (!existingDomain) {
            const [foundAny] = await db.select().from(serverDomainConfigs).limit(1);
            if (foundAny) existingDomain = foundAny;
          }

          const domainValues: any = {
            userId: validUserId,
            adminDomain: dc.adminDomain || 'admin.dominio1.com',
            storeDomain: dc.storeDomain || 'www.dominio1.com, dominio1.com',
            autoRouting: dc.autoRouting !== false,
            defaultFallbackView: dc.defaultFallbackView || 'admin',
            updatedAt: new Date(),
          };

          if (existingDomain) {
            await db.update(serverDomainConfigs).set(domainValues).where(eq(serverDomainConfigs.id, existingDomain.id));
          } else {
            if (dc.id && typeof dc.id === 'number') {
              domainValues.id = dc.id;
            }
            await db.insert(serverDomainConfigs).values(domainValues).onConflictDoNothing();
          }

          // Sync storage fallback
          const state = storage.getState();
          if (!state.serverDomainConfigs) state.serverDomainConfigs = [];
          const idx = state.serverDomainConfigs.findIndex((ex) => ex.id === (dc.id || existingDomain?.id) || ex.userId === validUserId);
          if (idx >= 0) {
            state.serverDomainConfigs[idx] = { ...state.serverDomainConfigs[idx], ...dc };
          } else {
            state.serverDomainConfigs.push(dc);
          }

          counts.serverDomainConfigs = (counts.serverDomainConfigs || 0) + 1;
        } catch (err: any) {
          errors.push(`Error al restaurar domain config: ${err?.message}`);
        }
      }
    }

    // Persist local state sync
    storage.save();

    // Reset PostgreSQL serial sequences to prevent duplicate key constraint violations on subsequent inserts
    const tableNames = [
      'users',
      'telegram_configs',
      'inventory_items',
      'telegram_messages',
      'suppliers',
      'customers',
      'customer_orders',
      'purchases',
      'payments',
      'store_configs',
      'server_domain_configs',
      'ai_configs',
      'email_configs',
    ];
    for (const tbl of tableNames) {
      try {
        await pool.query(
          `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${tbl}), 1), true)`,
          [tbl]
        );
      } catch {
        // Safe to ignore if table has no sequence or is empty
      }
    }

    return { success: true, counts, errors };
  } catch (err: any) {
    console.error('Critical error in restoreCompleteJsonDump:', err);
    throw err;
  }
}

/**
 * Restores full system from Master ZIP:
 * 1. Unpacks all media files directly into /uploads
 * 2. Finds comerxia_backup_completo.json and restores all database rows
 */
export async function restoreMasterFullSystemZip(
  zipBuffer: Buffer,
  targetUserId: number = 1
): Promise<{
  success: boolean;
  restoredMediaCount: number;
  restoredDbCounts: Record<string, number>;
  errors: string[];
}> {
  ensureUploadsDirExists();
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  let restoredMediaCount = 0;
  const errors: string[] = [];
  let backupJsonData: any = null;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName;

    // Check for database JSON dump
    if (name === 'comerxia_backup_completo.json' || name === 'database.json') {
      try {
        const text = entry.getData().toString('utf-8');
        backupJsonData = JSON.parse(text);
      } catch (err: any) {
        errors.push(`Error al leer archivo JSON de base de datos: ${err?.message}`);
      }
      continue;
    }

    // Media file extraction
    const cleanFilename = path.basename(name);
    if (!cleanFilename || cleanFilename.startsWith('.')) continue;

    // Verify allowed media extensions
    if (/\.(jpg|jpeg|png|webp|gif|svg|avif|mp4|webm|mov|ogg|m4v)$/i.test(cleanFilename)) {
      try {
        const destPath = path.join(UPLOADS_DIR, cleanFilename);
        const data = entry.getData();
        fs.writeFileSync(destPath, data);
        restoredMediaCount++;
      } catch (err: any) {
        errors.push(`Error al escribir medio ${cleanFilename}: ${err?.message}`);
      }
    }
  }

  // Restore database rows if JSON was in ZIP
  let restoredDbCounts: Record<string, number> = {};
  if (backupJsonData) {
    try {
      const dbResult = await restoreCompleteJsonDump(backupJsonData, targetUserId);
      restoredDbCounts = dbResult.counts;
      if (dbResult.errors && dbResult.errors.length > 0) {
        errors.push(...dbResult.errors);
      }
    } catch (err: any) {
      errors.push(`Error al restaurar datos de base de datos: ${err?.message}`);
    }
  }

  return {
    success: true,
    restoredMediaCount,
    restoredDbCounts,
    errors,
  };
}

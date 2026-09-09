import dotenv from 'dotenv';
dotenv.config();

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const getPgConfig = () => {
  const connStr = (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.PG_URL ||
    ''
  ).trim();

  const host =
    process.env.SQL_HOST ||
    process.env.POSTGRES_HOST ||
    process.env.PGHOST ||
    process.env.DB_HOST ||
    '127.0.0.1';

  const portRaw =
    process.env.SQL_PORT ||
    process.env.POSTGRES_PORT ||
    process.env.PGPORT ||
    process.env.DB_PORT ||
    '5432';
  const port = parseInt(portRaw, 10);

  const user =
    process.env.SQL_USER ||
    process.env.POSTGRES_USER ||
    process.env.PGUSER ||
    process.env.DB_USER ||
    'postgres';

  const password =
    process.env.SQL_PASSWORD ??
    process.env.POSTGRES_PASSWORD ??
    process.env.PGPASSWORD ??
    process.env.DB_PASSWORD ??
    'postgres';

  const database =
    process.env.SQL_DB_NAME ||
    process.env.POSTGRES_DB ||
    process.env.PGDATABASE ||
    process.env.DB_NAME ||
    'comerxia_db';

  const isSsl =
    process.env.SQL_SSL === 'true' ||
    process.env.POSTGRES_SSL === 'true' ||
    connStr.includes('sslmode=require');

  return {
    connectionString: connStr.length > 0 ? connStr : undefined,
    host,
    port: isNaN(port) ? 5432 : port,
    user,
    password,
    database,
    ssl: isSsl,
  };
};

export const isPostgresConfigured = (): boolean => {
  // Always true: Comerxia operates strictly with SQL Database (PostgreSQL)
  return true;
};

export const createPool = () => {
  if (!global._postgresPool) {
    const config = getPgConfig();

    if (config.connectionString) {
      global._postgresPool = new Pool({
        connectionString: config.connectionString,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
        max: 15,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 7000,
      });
    } else {
      global._postgresPool = new Pool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
        max: 15,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 7000,
      });
    }

    global._postgresPool.on('error', (err) => {
      console.warn('PostgreSQL pool connection notice:', err.message);
    });
  }
  return global._postgresPool;
};

export const pool = createPool();

export const db = drizzle(pool, { schema });

export async function ensureTablesCreated() {
  if (!isPostgresConfigured()) {
    console.log('📦 Base de datos local persistente inicializada correctamente (modo integrado)');
    return;
  }

  const pgCfg = getPgConfig();
  const targetDbName = pgCfg.database;

  // Helper to attempt creating database if it does not exist yet
  const attemptCreateDatabaseIfNotExists = async () => {
    try {
      let adminPool: Pool | null = null;

      if (pgCfg.connectionString) {
        const adminConnStr = pgCfg.connectionString.replace(/\/[a-zA-Z0-9_\-]+(\?.*)?$/, '/postgres$1');
        adminPool = new Pool({
          connectionString: adminConnStr,
          ssl: pgCfg.ssl ? { rejectUnauthorized: false } : undefined,
          connectionTimeoutMillis: 5000,
        });
      } else {
        adminPool = new Pool({
          host: pgCfg.host,
          port: pgCfg.port,
          user: pgCfg.user,
          password: pgCfg.password,
          database: 'postgres',
          ssl: pgCfg.ssl ? { rejectUnauthorized: false } : undefined,
          connectionTimeoutMillis: 5000,
        });
      }

      const adminClient = await adminPool.connect();
      try {
        const checkRes = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDbName]);
        if (checkRes.rowCount === 0) {
          console.log(`🔨 Creando base de datos "${targetDbName}" en PostgreSQL local...`);
          await adminClient.query(`CREATE DATABASE "${targetDbName}"`);
          console.log(`✅ Base de datos "${targetDbName}" creada exitosamente.`);
        }
      } finally {
        adminClient.release();
        await adminPool.end().catch(() => {});
      }
    } catch (createErr: any) {
      // Ignore if postgres database is not accessible or if target db already existed
    }
  };

  try {
    // Attempt auto database creation first
    await attemptCreateDatabaseIfNotExists();

    let client;
    try {
      client = await pool.connect();
    } catch (connErr: any) {
      if (connErr.message && connErr.message.includes('does not exist')) {
        await attemptCreateDatabaseIfNotExists();
        client = await pool.connect();
      } else {
        throw connErr;
      }
    }

    try {
      // 1. Create users table if not exists
      await client.query(`
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
      `);

      // Ensure columns exist if table was created in an older schema version
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS uid TEXT UNIQUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT DEFAULT 'admin';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT DEFAULT 'admin@comerxia.com';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Administrador';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_code TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_expires_at TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires_at TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      `);

      // 2. Create telegram_configs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS telegram_configs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
          bot_token TEXT,
          bot_username TEXT,
          bot_first_name TEXT,
          webhook_secret TEXT,
          supplier_name TEXT DEFAULT 'Proveedor Telegram',
          supplier_username TEXT,
          auto_approve BOOLEAN DEFAULT TRUE,
          default_margin_percent INTEGER DEFAULT 30,
          currency TEXT DEFAULT 'USD',
          default_stock_enabled BOOLEAN DEFAULT FALSE,
          default_stock_quantity INTEGER DEFAULT 10,
          tax_percent INTEGER DEFAULT 15,
          use_ai BOOLEAN DEFAULT TRUE,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE telegram_configs ADD COLUMN IF NOT EXISTS bot_token TEXT;
        ALTER TABLE telegram_configs ADD COLUMN IF NOT EXISTS bot_username TEXT;
        ALTER TABLE telegram_configs ADD COLUMN IF NOT EXISTS bot_first_name TEXT;
        ALTER TABLE telegram_configs ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
        ALTER TABLE telegram_configs ADD COLUMN IF NOT EXISTS supplier_name TEXT DEFAULT 'Proveedor Telegram';
        ALTER TABLE telegram_configs ADD COLUMN IF NOT EXISTS supplier_username TEXT;
        ALTER TABLE telegram_configs ADD COLUMN IF NOT EXISTS auto_approve BOOLEAN DEFAULT TRUE;
        ALTER TABLE telegram_configs ADD COLUMN IF NOT EXISTS default_margin_percent INTEGER DEFAULT 30;
        ALTER TABLE telegram_configs ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
        ALTER TABLE telegram_configs ADD COLUMN IF NOT EXISTS default_stock_enabled BOOLEAN DEFAULT FALSE;
        ALTER TABLE telegram_configs ADD COLUMN IF NOT EXISTS default_stock_quantity INTEGER DEFAULT 10;
        ALTER TABLE telegram_configs ADD COLUMN IF NOT EXISTS tax_percent INTEGER DEFAULT 15;
        ALTER TABLE telegram_configs ADD COLUMN IF NOT EXISTS use_ai BOOLEAN DEFAULT TRUE;
        ALTER TABLE telegram_configs ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
        ALTER TABLE telegram_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      `);

      // 3. Create inventory_items table
      await client.query(`
        CREATE TABLE IF NOT EXISTS inventory_items (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
          name TEXT NOT NULL,
          sku TEXT NOT NULL,
          barcode TEXT,
          description TEXT,
          category TEXT NOT NULL DEFAULT 'General',
          cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
          cost_without_tax NUMERIC(12, 2),
          cost_with_tax NUMERIC(12, 2),
          tax_rate NUMERIC(5, 2) DEFAULT 15.00,
          sale_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
          discount_percent INTEGER DEFAULT 0,
          stock INTEGER NOT NULL DEFAULT 1,
          image_url TEXT,
          video_url TEXT,
          supplier_name TEXT DEFAULT 'Proveedor Telegram',
          tags TEXT,
          extracted_attributes TEXT,
          status TEXT NOT NULL DEFAULT 'available',
          raw_telegram_message TEXT,
          marketing_copy TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS barcode TEXT;
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General';
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2) DEFAULT 0.00;
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS cost_without_tax NUMERIC(12, 2);
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS cost_with_tax NUMERIC(12, 2);
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2) DEFAULT 15.00;
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12, 2) DEFAULT 0.00;
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS discount_percent INTEGER DEFAULT 0;
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 1;
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS image_url TEXT;
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS video_url TEXT;
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS supplier_name TEXT DEFAULT 'Proveedor Telegram';
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS tags TEXT;
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS extracted_attributes TEXT;
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available';
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS raw_telegram_message TEXT;
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS marketing_copy TEXT;
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      `);

      // 4. Create telegram_messages table
      await client.query(`
        CREATE TABLE IF NOT EXISTS telegram_messages (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
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
      `);

      await client.query(`
        ALTER TABLE telegram_messages ADD COLUMN IF NOT EXISTS telegram_message_id TEXT;
        ALTER TABLE telegram_messages ADD COLUMN IF NOT EXISTS sender_name TEXT;
        ALTER TABLE telegram_messages ADD COLUMN IF NOT EXISTS sender_username TEXT;
        ALTER TABLE telegram_messages ADD COLUMN IF NOT EXISTS caption TEXT;
        ALTER TABLE telegram_messages ADD COLUMN IF NOT EXISTS photo_url TEXT;
        ALTER TABLE telegram_messages ADD COLUMN IF NOT EXISTS processed_status TEXT DEFAULT 'processed';
        ALTER TABLE telegram_messages ADD COLUMN IF NOT EXISTS extracted_data TEXT;
        ALTER TABLE telegram_messages ADD COLUMN IF NOT EXISTS inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL;
      `);

      // 5. Create customer_orders table
      await client.query(`
        CREATE TABLE IF NOT EXISTS customer_orders (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
          order_number TEXT NOT NULL,
          customer_name TEXT NOT NULL,
          customer_phone TEXT NOT NULL,
          customer_email TEXT,
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
          fulfillment_status TEXT DEFAULT 'in_stock',
          delivery_type TEXT DEFAULT 'shipping',
          linked_purchase_id INTEGER,
          linked_purchase_number TEXT,
          returns TEXT DEFAULT '[]',
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_ci TEXT;
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_address TEXT;
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS items TEXT DEFAULT '[]';
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2) DEFAULT 0.00;
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'whatsapp';
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS payment_voucher TEXT;
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS tracking_carrier TEXT;
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS tracking_notes TEXT;
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS fulfillment_status TEXT DEFAULT 'in_stock';
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'shipping';
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS linked_purchase_id INTEGER;
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS linked_purchase_number TEXT;
        ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS returns TEXT DEFAULT '[]';
      `);

      // 5b. Create purchases table (Compras y Abastecimiento de Proveedores)
      await client.query(`
        CREATE TABLE IF NOT EXISTS purchases (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
          purchase_number TEXT NOT NULL,
          supplier_name TEXT NOT NULL DEFAULT 'Proveedor Telegram',
          supplier_contact TEXT,
          items TEXT NOT NULL DEFAULT '[]',
          total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
          status TEXT NOT NULL DEFAULT 'pending',
          payment_status TEXT DEFAULT 'paid',
          linked_customer_order_id INTEGER REFERENCES customer_orders(id) ON DELETE SET NULL,
          linked_customer_order_number TEXT,
          receipt_voucher TEXT,
          receptions TEXT DEFAULT '[]',
          returns TEXT DEFAULT '[]',
          notes TEXT,
          purchase_date TIMESTAMP DEFAULT NOW(),
          received_date TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS purchase_number TEXT;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_name TEXT DEFAULT 'Proveedor Telegram';
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_contact TEXT;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS items TEXT DEFAULT '[]';
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12, 2) DEFAULT 0.00;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'paid';
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS linked_customer_order_id INTEGER;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS linked_customer_order_number TEXT;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS receipt_voucher TEXT;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS receptions TEXT DEFAULT '[]';
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS returns TEXT DEFAULT '[]';
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS purchase_date TIMESTAMP DEFAULT NOW();
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS received_date TIMESTAMP;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      `);

      // 5c. Create customers table
      await client.query(`
        CREATE TABLE IF NOT EXISTS customers (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
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
      `);

      await client.query(`
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS ci TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS province TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS canton TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS parish TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS exact_address TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS reference TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spent NUMERIC(12, 2) DEFAULT 0.00;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_order_date TIMESTAMP;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      `);

      // 5d. Create suppliers table (Catálogo y Directorio Maestro de Proveedores ERP)
      await client.query(`
        CREATE TABLE IF NOT EXISTS suppliers (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
          name TEXT NOT NULL,
          trade_name TEXT,
          ruc TEXT,
          phone TEXT NOT NULL,
          email TEXT,
          contact_person TEXT,
          contact_person_phone TEXT,
          contact_person_role TEXT,
          category TEXT DEFAULT 'General',
          country TEXT DEFAULT 'Ecuador',
          city TEXT,
          address TEXT,
          website TEXT,
          payment_terms TEXT DEFAULT 'contado',
          credit_limit NUMERIC(12, 2) DEFAULT 0.00,
          bank_details TEXT,
          lead_time_days INTEGER DEFAULT 3,
          rating INTEGER DEFAULT 5,
          status TEXT NOT NULL DEFAULT 'active',
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS trade_name TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS ruc TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person_phone TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person_role TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General';
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Ecuador';
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS city TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS website TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'contado';
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12, 2) DEFAULT 0.00;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_details TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 3;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS rating INTEGER DEFAULT 5;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      `);

      // 6. Create store_configs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS store_configs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
          store_name TEXT DEFAULT 'Comerxia Store',
          whatsapp_number TEXT DEFAULT '',
          description TEXT DEFAULT 'Catálogo digital con envíos y pedidos directos',
          banner_text TEXT DEFAULT '🔥 ¡Catálogo actualizado con las últimas novedades en stock!',
          delivery_fee NUMERIC(12, 2) DEFAULT 0.00,
          min_order_amount NUMERIC(12, 2) DEFAULT 0.00,
          currency TEXT DEFAULT 'USD',
          is_active BOOLEAN DEFAULT TRUE,
          maintenance_title TEXT DEFAULT 'Tienda Temporalmente Pausada',
          maintenance_message TEXT DEFAULT 'Estamos actualizando nuestro catálogo e inventario. ¡Volvemos muy pronto!',
          allow_catalog_browsing BOOLEAN DEFAULT FALSE,
          show_stock BOOLEAN DEFAULT TRUE,
          show_out_of_stock BOOLEAN DEFAULT TRUE,
          instagram_url TEXT,
          website_url TEXT,
          address TEXT,
          logo_url TEXT,
          logo_desktop_url TEXT,
          courier_logos TEXT,
          payment_logos TEXT,
          theme TEXT DEFAULT 'classic',
          promo_popup TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS store_name TEXT DEFAULT 'Comerxia Store';
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS whatsapp_number TEXT DEFAULT '';
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS description TEXT DEFAULT 'Catálogo digital con envíos y pedidos directos';
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS banner_text TEXT DEFAULT '🔥 ¡Catálogo actualizado con las últimas novedades en stock!';
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(12, 2) DEFAULT 0.00;
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(12, 2) DEFAULT 0.00;
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS maintenance_title TEXT DEFAULT 'Tienda Temporalmente Pausada';
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS maintenance_message TEXT DEFAULT 'Estamos actualizando nuestro catálogo e inventario. ¡Volvemos muy pronto!';
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS allow_catalog_browsing BOOLEAN DEFAULT FALSE;
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS show_stock BOOLEAN DEFAULT TRUE;
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS show_out_of_stock BOOLEAN DEFAULT TRUE;
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS instagram_url TEXT;
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS website_url TEXT;
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS address TEXT;
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS logo_url TEXT;
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS logo_desktop_url TEXT;
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS courier_logos TEXT;
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS payment_logos TEXT;
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'classic';
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS promo_popup TEXT;
        ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      `);

      // 7. Create ai_configs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ai_configs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
          api_key TEXT,
          account_email TEXT,
          model_name TEXT DEFAULT 'gemini-3.7-flash',
          temperature NUMERIC(3, 2) DEFAULT 0.20,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS api_key TEXT;
        ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS account_email TEXT;
        ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS model_name TEXT DEFAULT 'gemini-3.7-flash';
        ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS temperature NUMERIC(3, 2) DEFAULT 0.20;
        ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
        ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      `);

      // 8. Create server_domain_configs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS server_domain_configs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
          admin_domain TEXT DEFAULT 'admin.dominio1.com',
          store_domain TEXT DEFAULT 'www.dominio1.com, dominio1.com',
          auto_routing BOOLEAN DEFAULT TRUE,
          default_fallback_view TEXT DEFAULT 'admin',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE server_domain_configs ADD COLUMN IF NOT EXISTS admin_domain TEXT DEFAULT 'admin.dominio1.com';
        ALTER TABLE server_domain_configs ADD COLUMN IF NOT EXISTS store_domain TEXT DEFAULT 'www.dominio1.com, dominio1.com';
        ALTER TABLE server_domain_configs ADD COLUMN IF NOT EXISTS auto_routing BOOLEAN DEFAULT TRUE;
        ALTER TABLE server_domain_configs ADD COLUMN IF NOT EXISTS default_fallback_view TEXT DEFAULT 'admin';
        ALTER TABLE server_domain_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      `);

      // 9. Create email_configs table for Google Email (Gmail SMTP / Google Workspace)
      await client.query(`
        CREATE TABLE IF NOT EXISTS email_configs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
          google_email TEXT,
          google_app_password TEXT,
          sender_name TEXT DEFAULT 'Comerxia App',
          smtp_host TEXT DEFAULT 'smtp.gmail.com',
          smtp_port INTEGER DEFAULT 465,
          smtp_secure BOOLEAN DEFAULT TRUE,
          require_activation BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE email_configs ADD COLUMN IF NOT EXISTS google_email TEXT;
        ALTER TABLE email_configs ADD COLUMN IF NOT EXISTS google_app_password TEXT;
        ALTER TABLE email_configs ADD COLUMN IF NOT EXISTS sender_name TEXT DEFAULT 'Comerxia App';
        ALTER TABLE email_configs ADD COLUMN IF NOT EXISTS smtp_host TEXT DEFAULT 'smtp.gmail.com';
        ALTER TABLE email_configs ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT 465;
        ALTER TABLE email_configs ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN DEFAULT TRUE;
        ALTER TABLE email_configs ADD COLUMN IF NOT EXISTS require_activation BOOLEAN DEFAULT TRUE;
        ALTER TABLE email_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      `);

      // 10. Create store_analytics_events table
      await client.query(`
        CREATE TABLE IF NOT EXISTS store_analytics_events (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL,
          product_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
          product_name TEXT,
          session_id TEXT,
          device_type TEXT DEFAULT 'desktop',
          metadata TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE store_analytics_events ADD COLUMN IF NOT EXISTS product_id INTEGER;
        ALTER TABLE store_analytics_events ADD COLUMN IF NOT EXISTS product_name TEXT;
        ALTER TABLE store_analytics_events ADD COLUMN IF NOT EXISTS session_id TEXT;
        ALTER TABLE store_analytics_events ADD COLUMN IF NOT EXISTS device_type TEXT DEFAULT 'desktop';
        ALTER TABLE store_analytics_events ADD COLUMN IF NOT EXISTS metadata TEXT;
        ALTER TABLE store_analytics_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
      `);

      // 11. Create payments table (Módulo de Pagos, Cuentas por Cobrar, Cuentas por Pagar y Tesorería ERP)
      await client.query(`
        CREATE TABLE IF NOT EXISTS payments (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
          payment_number TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'inflow',
          category TEXT DEFAULT 'customer_sale',
          amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
          payment_method TEXT NOT NULL DEFAULT 'transferencia_bancaria',
          bank_or_account TEXT NOT NULL DEFAULT 'Banco Pichincha',
          reference_number TEXT,
          payment_date TIMESTAMP DEFAULT NOW(),
          status TEXT NOT NULL DEFAULT 'completed',
          notes TEXT,
          voucher_url TEXT,
          order_id INTEGER REFERENCES customer_orders(id) ON DELETE SET NULL,
          order_number TEXT,
          customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
          customer_name TEXT,
          purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
          purchase_number TEXT,
          supplier_name TEXT,
          return_id TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_number TEXT;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'inflow';
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'customer_sale';
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2) DEFAULT 0.00;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'transferencia_bancaria';
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS bank_or_account TEXT DEFAULT 'Banco Pichincha';
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference_number TEXT;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP DEFAULT NOW();
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS voucher_url TEXT;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS order_id INTEGER;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS order_number TEXT;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_id INTEGER;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_name TEXT;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS purchase_id INTEGER;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS purchase_number TEXT;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS supplier_name TEXT;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS return_id TEXT;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      `);

      // 12. Synchronize tables
      console.log('✅ PostgreSQL connection verified and database schemas synchronized');
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Database initialization note:', err?.message || err);
  }
}

export async function getDatabaseRuntimeInfo() {
  const isPostgres = isPostgresConfigured();
  const pgCfg = getPgConfig();
  const host = pgCfg.connectionString ? 'Cadena de conexión (DATABASE_URL)' : pgCfg.host;
  const port = pgCfg.port;
  const database = pgCfg.database;
  const user = pgCfg.user;

  if (!isPostgres) {
    return {
      connected: true,
      mode: 'integrated_local',
      modeLabel: 'Modo Local Integrado',
      host: 'Local In-Memory / File Storage',
      port: 0,
      database: 'comerxia_local',
      user: 'admin',
      type: 'Almacenamiento Local Directo',
      canSwitchToPostgres: true,
    };
  }

  try {
    const client = await pool.connect();
    try {
      const startTime = Date.now();
      const res = await client.query('SELECT version(), current_database(), current_user, NOW() as server_time');
      const pingMs = Date.now() - startTime;
      const row = res.rows[0];

      return {
        connected: true,
        mode: 'postgresql',
        modeLabel: 'PostgreSQL Conectado y Activo',
        host,
        port,
        database: row.current_database || database,
        user: row.current_user || user,
        serverVersion: row.version ? row.version.split(' ')[0] + ' ' + row.version.split(' ')[1] : 'PostgreSQL',
        pingMs,
        serverTime: row.server_time,
        canSwitchToPostgres: true,
      };
    } finally {
      client.release();
    }
  } catch (error: any) {
    return {
      connected: false,
      mode: 'postgresql_error',
      modeLabel: 'Servidor Local (No conectado en el contenedor Cloud)',
      host,
      port,
      database,
      user,
      error: error.message || 'No se pudo conectar a la base de datos PostgreSQL en esta instancia',
      hint: 'Si tu PostgreSQL está en tu PC local (127.0.0.1) y estás probando desde la vista previa web en la nube, el contenedor no puede alcanzar tu 127.0.0.1 privado. Al ejecutar npm start en tu servidor local conectará de inmediato.',
      canSwitchToPostgres: true,
    };
  }
}

export async function verifyDatabaseConnectivity(): Promise<{
  ok: boolean;
  message?: string;
  dbName?: string;
  user?: string;
  version?: string;
  isPostgres: boolean;
}> {
  const isPostgres = isPostgresConfigured();
  if (!isPostgres) {
    return {
      ok: true,
      dbName: 'comerxia_local',
      user: 'admin',
      isPostgres: false,
    };
  }

  try {
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT version(), current_database(), current_user');
      const row = res.rows[0];
      return {
        ok: true,
        dbName: row.current_database,
        user: row.current_user,
        version: row.version,
        isPostgres: true,
      };
    } finally {
      client.release();
    }
  } catch (error: any) {
    return {
      ok: false,
      message: error.message || 'No se pudo conectar a la base de datos PostgreSQL',
      isPostgres: true,
    };
  }
}

export async function testDatabaseConnection(params: {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
}) {
  let testPool: Pool | null = null;
  try {
    const isConnStr = Boolean(params.connectionString && params.connectionString.trim().length > 0);
    const connStr = params.connectionString?.trim() || '';

    if (isConnStr) {
      const isSsl = params.ssl || connStr.includes('sslmode=require') || !connStr.includes('127.0.0.1');
      testPool = new Pool({
        connectionString: connStr,
        ssl: isSsl ? { rejectUnauthorized: false } : undefined,
        connectionTimeoutMillis: 4000,
      });
    } else {
      const host = params.host?.trim() || '127.0.0.1';
      const port = params.port || 5432;
      const isSsl = params.ssl || (host !== '127.0.0.1' && host !== 'localhost');

      testPool = new Pool({
        host,
        port,
        user: params.user?.trim() || 'postgres',
        password: params.password || '',
        database: params.database?.trim() || 'comerxia_db',
        ssl: isSsl ? { rejectUnauthorized: false } : undefined,
        connectionTimeoutMillis: 4000,
      });
    }

    const startTime = Date.now();
    const client = await testPool.connect();
    try {
      const res = await client.query('SELECT version(), current_database(), current_user, NOW() as server_time');
      const pingMs = Date.now() - startTime;
      const row = res.rows[0];
      return {
        ok: true,
        message: '¡Conexión a PostgreSQL exitosa!',
        version: row.version,
        database: row.current_database,
        user: row.current_user,
        pingMs,
      };
    } finally {
      client.release();
    }
  } catch (error: any) {
    const errorMsg = error.message || 'Error al conectar a PostgreSQL';
    const isLocalhostError =
      errorMsg.includes('ECONNREFUSED') ||
      errorMsg.includes('timeout') ||
      errorMsg.includes('127.0.0.1') ||
      errorMsg.includes('localhost');

    let contextualHint = '';
    if (isLocalhostError) {
      contextualHint = 'Nota: La dirección 127.0.0.1 / localhost apunta al equipo local donde se ejecuta el proceso Node.js. Al desplegar e iniciar Comerxia en tu propia máquina o VPS con "npm start", conectará de forma directa e instantánea a tu PostgreSQL local.';
    }

    return {
      ok: false,
      message: errorMsg,
      hint: contextualHint,
    };
  } finally {
    if (testPool) {
      testPool.end().catch(() => {});
    }
  }
}

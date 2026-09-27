import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { normalizeEcuadorPhone } from '../utils/phone.ts';

export interface LocalUser {
  id: number;
  uid: string;
  username: string;
  password: string;
  email: string;
  name: string;
  role: string;
  photoUrl?: string | null;
  isActive?: boolean;
  activationCode?: string | null;
  activationExpiresAt?: string | null;
  resetCode?: string | null;
  resetExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalInventoryItem {
  id: number;
  userId: number;
  name: string;
  sku: string;
  description?: string;
  category: string;
  costPrice: string;
  salePrice: string;
  discountPercent?: number | null;
  stock: number;
  imageUrl?: string | null;
  videoUrl?: string | null;
  images?: string[] | null;
  supplierName: string;
  tags?: string | null;
  extractedAttributes?: string | null;
  status: string;
  rawTelegramMessage?: string | null;
  marketingCopy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalTelegramMessage {
  id: number;
  userId: number;
  telegramMessageId?: string | null;
  senderName?: string;
  senderUsername?: string | null;
  caption?: string;
  photoUrl?: string | null;
  processedStatus: string;
  extractedData?: string | null;
  inventoryItemId?: number | null;
  createdAt: string;
}

export interface LocalTelegramConfig {
  id: number;
  userId: number;
  botToken?: string | null;
  botUsername?: string | null;
  botFirstName?: string | null;
  webhookSecret?: string | null;
  supplierName: string;
  supplierUsername?: string | null;
  autoApprove: boolean;
  defaultMarginPercent: number;
  currency: string;
  defaultStockEnabled?: boolean | null;
  defaultStockQuantity?: number | null;
  taxPercent?: number | null;
  useAi?: boolean | null;
  isActive?: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalAiConfig {
  id: number;
  userId: number;
  apiKey?: string | null;
  accountEmail?: string | null;
  modelName: string;
  temperature: number;
  isActive?: boolean | null;
  provider?: 'google' | 'lmstudio';
  localEndpoint?: string | null;
  localModelName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalStoreConfig {
  id: number;
  userId: number;
  storeName: string;
  whatsappNumber: string;
  description: string;
  bannerText: string;
  deliveryFee: string;
  minOrderAmount: string;
  currency: string;
  isActive?: boolean | null;
  maintenanceTitle?: string | null;
  maintenanceMessage?: string | null;
  allowCatalogBrowsing?: boolean | null;
  showStock?: boolean | null;
  showOutOfStock?: boolean | null;
  prioritizeOffersFirst?: boolean | null;
  websiteUrl?: string | null;
  website_url?: string | null;
  instagramUrl?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  logoDesktopUrl?: string | null;
  courierLogos?: string | null;
  paymentLogos?: string | null;
  theme?: string | null;
  themeColors?: string | null;
  promoPopup?: string | null;
  enablePagination?: boolean | null;
  itemsPerPage?: number | null;
  defaultProductSort?: string | null;
  defaultInitialCategory?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalServerDomainConfig {
  id: number;
  userId: number;
  adminDomain: string;
  storeDomain: string;
  autoRouting: boolean;
  defaultFallbackView: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalEmailConfig {
  id: number;
  userId: number;
  googleEmail?: string | null;
  googleAppPassword?: string | null;
  senderName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  requireActivation: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocalCustomer {
  id: number;
  userId: number;
  name: string;
  fullName?: string | null;
  phone: string;
  ci?: string | null;
  email?: string | null;
  address?: string | null;
  fullAddress?: string | null;
  province?: string | null;
  canton?: string | null;
  parish?: string | null;
  exactAddress?: string | null;
  reference?: string | null;
  totalOrders: number;
  totalSpent: string;
  lastOrderDate?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSupplier {
  id: number;
  userId: number;
  name: string;
  tradeName?: string | null;
  ruc?: string | null;
  phone: string;
  email?: string | null;
  contactPerson?: string | null;
  contactPersonPhone?: string | null;
  contactPersonRole?: string | null;
  category?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  website?: string | null;
  paymentTerms?: string | null;
  creditLimit?: string | number | null;
  bankDetails?: string | null;
  leadTimeDays?: number | null;
  rating?: number | null;
  status: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalCustomerOrder {
  id: number;
  userId: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerCi?: string | null;
  ci?: string | null;
  customerAddress?: string;
  items: string; // JSON
  totalAmount: string;
  paymentMethod: string;
  status: string;
  paymentVoucher?: string | null;
  notes?: string;
  trackingNumber?: string | null;
  trackingCarrier?: string | null;
  trackingNotes?: string | null;
  fulfillmentStatus?: string | null;
  linkedPurchaseId?: number | null;
  linkedPurchaseNumber?: string | null;
  createdAt: string;
}

export interface LocalPurchase {
  id: number;
  userId: number;
  purchaseNumber: string;
  supplierName: string;
  supplierContact?: string | null;
  items: string; // JSON string of PurchaseItem[]
  totalCost: string;
  status: string; // 'pending', 'ordered', 'in_transit', 'received', 'cancelled'
  paymentStatus: string; // 'unpaid', 'paid'
  linkedCustomerOrderId?: number | null;
  linkedCustomerOrderNumber?: string | null;
  receiptVoucher?: string | null;
  notes?: string | null;
  purchaseDate: string;
  receivedDate?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface LocalPayment {
  id: number;
  userId: number;
  paymentNumber: string;
  type: 'inflow' | 'outflow' | 'refund' | 'expense';
  category: 'customer_sale' | 'supplier_purchase' | 'customer_refund' | 'operational_expense' | 'other';
  amount: string;
  paymentMethod: string;
  bankOrAccount: string;
  referenceNumber?: string | null;
  paymentDate: string;
  status: 'completed' | 'pending' | 'voided';
  notes?: string | null;
  voucherUrl?: string | null;
  orderId?: number | null;
  orderNumber?: string | null;
  customerId?: number | null;
  customerName?: string | null;
  purchaseId?: number | null;
  purchaseNumber?: string | null;
  supplierName?: string | null;
  returnId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalAnalyticsEvent {
  id: number;
  userId?: number | null;
  eventType: string; // 'store_visit', 'product_view', 'add_to_cart', 'whatsapp_click', 'order_placed'
  productId?: number | null;
  productName?: string | null;
  sessionId?: string | null;
  deviceType?: string;
  metadata?: string | null;
  createdAt: string;
}

export interface LocalEcuadorApiConfig {
  id: number;
  userId: number;
  apiKey?: string | null;
  isActive?: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalPayphoneConfig {
  id: number;
  userId: number;
  token?: string | null;
  storeId?: string | null;
  environment?: string | null;
  isActive?: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseState {
  users: LocalUser[];
  inventoryItems: LocalInventoryItem[];
  telegramMessages: LocalTelegramMessage[];
  telegramConfigs: LocalTelegramConfig[];
  aiConfigs: LocalAiConfig[];
  emailConfigs: LocalEmailConfig[];
  ecuadorApiConfigs: LocalEcuadorApiConfig[];
  payphoneConfigs?: LocalPayphoneConfig[];
  sriConfigs?: any[];
  sriInvoices?: any[];
  advertisingVideos?: any[];
  advertisingPlaylists?: any[];
  advertisingPlaylistItems?: any[];
  advertisingDisplays?: any[];
  storeConfigs: LocalStoreConfig[];
  serverDomainConfigs: LocalServerDomainConfig[];
  customers: LocalCustomer[];
  suppliers: LocalSupplier[];
  customerOrders: LocalCustomerOrder[];
  purchases: LocalPurchase[];
  payments: LocalPayment[];
  storeAnalyticsEvents: LocalAnalyticsEvent[];
  nextId: {
    users: number;
    inventoryItems: number;
    telegramMessages: number;
    telegramConfigs: number;
    aiConfigs: number;
    emailConfigs: number;
    ecuadorApiConfigs: number;
    sriConfigs?: number;
    sriInvoices?: number;
    storeConfigs: number;
    serverDomainConfigs: number;
    customers: number;
    suppliers: number;
    customerOrders: number;
    purchases: number;
    payments: number;
    storeAnalyticsEvents: number;
  };
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

class StorageManager {
  private state: DatabaseState;
  private isLoaded = false;

  constructor() {
    this.state = this.getDefaultState();
    this.init();
  }

  private getDefaultState(): DatabaseState {
    return {
      users: [],
      inventoryItems: [],
      telegramMessages: [],
      telegramConfigs: [
        {
          id: 1,
          userId: 1,
          botToken: null,
          webhookSecret: null,
          supplierName: 'Proveedor Telegram Principal',
          supplierUsername: null,
          autoApprove: true,
          defaultMarginPercent: 35,
          currency: 'USD',
          defaultStockEnabled: false,
          defaultStockQuantity: 10,
          taxPercent: 15,
          useAi: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      aiConfigs: [
        {
          id: 1,
          userId: 1,
          apiKey: null,
          modelName: 'gemini-3.6-flash',
          temperature: 0.2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      emailConfigs: [
        {
          id: 1,
          userId: 1,
          googleEmail: null,
          googleAppPassword: null,
          senderName: 'Comerxia App',
          smtpHost: 'smtp.gmail.com',
          smtpPort: 465,
          smtpSecure: true,
          requireActivation: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      ecuadorApiConfigs: [
        {
          id: 1,
          userId: 1,
          apiKey: null,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      sriConfigs: [
        {
          id: 1,
          userId: 1,
          ruc: '1700000000001',
          razonSocial: 'COMERXIA E-COMMERCE S.A.',
          nombreComercial: 'COMERXIA ECUADOR',
          estab: '001',
          ptoEmi: '001',
          dirMatriz: 'Quito, Ecuador',
          obligadoContabilidad: 'NO',
          contribuyenteEspecial: null,
          regimenRimpe: 'NO',
          ambiente: '1',
          p12Base64: null,
          p12Password: null,
          p12Filename: null,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      sriInvoices: [],
      storeConfigs: [
        {
          id: 1,
          userId: 1,
          storeName: 'Comerxia Store',
          whatsappNumber: '',
          description: 'Catálogo digital con envíos y pedidos directos por WhatsApp',
          bannerText: '🔥 ¡Catálogo actualizado con las últimas novedades en stock!',
          deliveryFee: '0.00',
          minOrderAmount: '0.00',
          currency: 'USD',
          showStock: true,
          showOutOfStock: true,
          prioritizeOffersFirst: true,
          instagramUrl: null,
          address: null,
          logoUrl: null,
          logoDesktopUrl: null,
          courierLogos: null,
          paymentLogos: null,
          promoPopup: JSON.stringify({
            active: true,
            theme: 'christmas',
            badge: '🎄 OFERTA ESPECIAL',
            title: '¡Gran Venta Especial y Descuentos!',
            description: 'Aprovecha promociones exclusivas, envíos rápidos a todo el país y atención personalizada vía WhatsApp.',
            imageUrl: 'https://images.unsplash.com/photo-1543258103-a62bd96b300b?auto=format&fit=crop&w=900&q=85',
            couponCode: 'OFERTA2026',
            buttonText: '¡Pedir con Descuento por WhatsApp!',
            actionType: 'whatsapp',
            actionUrl: ''
          }),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      serverDomainConfigs: [
        {
          id: 1,
          userId: 1,
          adminDomain: 'admin.dominio1.com',
          storeDomain: 'www.dominio1.com, dominio1.com',
          autoRouting: true,
          defaultFallbackView: 'admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      customers: [],
      suppliers: [],
      customerOrders: [],
      purchases: [],
      payments: [],
      storeAnalyticsEvents: [],
      nextId: {
        users: 1,
        inventoryItems: 1,
        telegramMessages: 1,
        telegramConfigs: 2,
        aiConfigs: 2,
        emailConfigs: 2,
        ecuadorApiConfigs: 2,
        sriConfigs: 2,
        sriInvoices: 1,
        storeConfigs: 2,
        serverDomainConfigs: 2,
        customers: 1,
        suppliers: 1,
        customerOrders: 1,
        purchases: 1,
        payments: 1,
        storeAnalyticsEvents: 1,
      },
    };
  }

  private init() {
    // Memory state only - No disk file database.json creation
    this.state = this.getDefaultState();
    this.isLoaded = true;
  }

  public save() {
    // Memory state only - Disk persistence to database.json is disabled
  }

  public saveSync() {
    // Memory state only - Disk persistence to database.json is disabled
  }

  private async executeAsyncSave() {
    // Memory state only - Disk persistence to database.json is disabled
  }

  public getState(): DatabaseState {
    return this.state;
  }
}

export const storage = new StorageManager();

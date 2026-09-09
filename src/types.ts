export interface AuthUser {
  id: number;
  username: string;
  email: string;
  name: string;
  role: 'admin' | 'operador' | string;
  photoUrl?: string | null;
  isActive?: boolean;
  createdAt?: string;
}

export interface OperatorUser {
  id: number;
  username: string;
  email: string;
  name: string;
  role: 'operador';
  photoUrl?: string | null;
  isActive?: boolean;
  activationCode?: string | null;
  createdAt?: string;
}

export interface GoogleEmailConfig {
  id?: number;
  userId?: number;
  googleEmail: string;
  googleAppPassword?: string;
  hasAppPassword?: boolean;
  senderName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  requireActivation: boolean;
  requireActivationGlobal?: boolean;
  isConfigured?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryItem {
  id: number;
  userId: number;
  name: string;
  sku: string;
  barcode?: string | null;
  description: string | null;
  category: string;
  costPrice: string;
  costWithoutTax?: string | number | null;
  costWithTax?: string | number | null;
  taxRate?: string | number | null;
  hasPurchaseTax?: boolean;
  purchaseTaxPercent?: number;
  applySaleTax?: boolean;
  saleTaxPercent?: number;
  salePrice: string;
  discountPercent?: number;
  stock: number;
  physicalStock?: number;
  reservedStock?: number;
  availableStock?: number;
  incomingStock?: number;
  imageUrl: string | null;
  images?: string[];
  videoUrl?: string | null;
  supplierName: string | null;
  tags: string | null;
  extractedAttributes: string | null;
  status: 'available' | 'low_stock' | 'sold_out' | 'archived';
  rawTelegramMessage: string | null;
  marketingCopy?: string | ProductMarketingCopy | null;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramMessage {
  id: number;
  telegramMessageId: string | null;
  senderName: string | null;
  senderUsername: string | null;
  caption: string | null;
  photoUrl: string | null;
  processedStatus: 'processed' | 'pending' | 'error';
  extractedData: string | null;
  inventoryItemId: number | null;
  inventoryItemName?: string | null;
  inventoryItemSku?: string | null;
  inventoryItemPrice?: string | null;
  createdAt: string;
}

export interface TelegramConfig {
  id: number;
  userId: number;
  botToken: string | null;
  botUsername?: string | null;
  botFirstName?: string | null;
  webhookSecret: string | null;
  supplierName: string;
  supplierUsername: string | null;
  autoApprove: boolean;
  defaultMarginPercent: number;
  currency: string;
  defaultStockEnabled?: boolean;
  defaultStockQuantity?: number;
  taxPercent?: number;
  useAi?: boolean;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleAiConfig {
  id?: number;
  userId?: number;
  apiKey: string | null;
  hasKey?: boolean;
  accountEmail?: string | null;
  modelName: string;
  temperature: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryStats {
  totalProducts: number;
  totalUnits: number;
  totalCostValue: number;
  totalSaleValue: number;
  estimatedProfit: number;
  totalDiscountValue?: number;
  totalDiscountedSaleValue?: number;
  profitWithDiscounts?: number;
  discountedProductsCount?: number;
  categories: { name: string; count: number; stock: number }[];
}

export interface CostOption {
  label: string;
  price: number;
  costWithoutTax?: number;
  costWithTax?: number;
  taxRate?: number;
  unitCost?: number;
  isAffiliate?: boolean;
}

export interface CartItem {
  item: InventoryItem;
  quantity: number;
}

export interface SupplierBankInfo {
  bankName?: string;
  accountType?: 'corriente' | 'ahorros' | 'virtual' | string;
  accountNumber?: string;
  accountHolder?: string;
  holderId?: string; // RUC / CI
  holderEmail?: string;
  notificationEmail?: string;
}

export interface Supplier {
  id: number;
  userId?: number;
  name: string; // Razón Social o Nombre Principal
  tradeName?: string | null; // Nombre Comercial
  ruc?: string | null; // RUC o Cédula Fiscal
  phone: string;
  email?: string | null;
  contactPerson?: string | null;
  contactPersonPhone?: string | null;
  contactPersonRole?: string | null;
  category?: string | null; // e.g. Tecnología, Calzado, Ropa, Abarrotes, Importador, Mayorista, Fabricante
  country?: string | null;
  city?: string | null;
  address?: string | null;
  website?: string | null;
  paymentTerms?: 'contado' | 'credito_15' | 'credito_30' | 'credito_60' | 'credito_90' | 'consignacion' | string | null;
  creditLimit?: number | string | null;
  bankDetails?: string | null; // JSON string or raw text
  bankInfo?: SupplierBankInfo | null;
  leadTimeDays?: number | null; // Tiempo de entrega promedio en días
  rating?: number | null; // 1 a 5 estrellas
  status: 'active' | 'inactive';
  notes?: string | null;
  totalPurchases?: number;
  totalSpent?: string | number;
  productsCount?: number;
  lastPurchaseDate?: string | null;
  pendingPurchasesCount?: number;
  pendingBalance?: number | string | null;
  suppliedProducts?: InventoryItem[];
  purchaseOrders?: PurchaseOrder[];
  createdAt: string;
  updatedAt?: string;
}

export interface Customer {
  id: number;
  userId?: number;
  name: string;
  fullName?: string;
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
  totalSpent: string | number;
  lastOrderDate?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CustomerOrderItem {
  id: number;
  inventoryItemId?: number;
  name: string;
  sku: string;
  salePrice: string;
  costPrice?: string;
  quantity: number;
  deliveredQuantity?: number;
  pendingQuantity?: number;
  stockAvailable?: number;
  deficitQuantity?: number;
  stockDeducted?: number;
  imageUrl?: string | null;
  supplierName?: string | null;
  isCustomOrder?: boolean;
}

export interface CustomerReturnRecord {
  id: string;
  date: string;
  orderId?: number;
  orderNumber?: string;
  reason: string; // 'defective', 'wrong_item', 'size_exchange', 'customer_remorse', 'warranty', 'other'
  disposition: 'restock' | 'defective_warranty'; // 'restock' returns to sellable inventory, 'defective_warranty' goes to warranty/supplier return
  refundAmount: number | string;
  settlementType?: 'refund' | 'credit_note';
  paymentId?: number;
  paymentNumber?: string;
  paymentMethod?: string;
  bankOrAccount?: string;
  referenceNumber?: string;
  notes?: string;
  items: Array<{
    inventoryItemId?: number;
    name: string;
    sku?: string;
    quantity: number;
    salePrice: string | number;
    costPrice?: string | number;
  }>;
}

export interface CustomerOrder {
  id: number;
  userId: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerAddress: string | null;
  clientAddress?: string | null;
  shippingAddress?: string | null;
  deliveryType?: string | null;
  customerCi?: string | null;
  ci?: string | null;
  items: CustomerOrderItem[];
  totalAmount: string;
  paymentMethod: string;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  paymentVoucher?: string | null;
  notes: string | null;
  trackingNumber?: string | null;
  trackingCarrier?: string | null;
  trackingNotes?: string | null;
  fulfillmentStatus?: 'in_stock' | 'awaiting_procurement' | 'supplier_pending' | 'supplier_ordered' | 'supplier_received' | 'ready_for_dispatch' | 'partial_delivered' | 'partial_ready' | 'delivered';
  linkedPurchaseId?: number | null;
  linkedPurchaseNumber?: string | null;
  purchaseId?: number | null;
  purchaseNumber?: string | null;
  returns?: CustomerReturnRecord[];
  createdAt: string;
}

export interface PurchaseReceptionRecord {
  id: string;
  date: string;
  guideNumber?: string;
  shippingGuideNumber?: string;
  receiptVoucher?: string;
  notes?: string;
  items: Array<{
    inventoryItemId?: number;
    name: string;
    sku?: string;
    quantity: number;
    costPrice: string | number;
  }>;
}

export interface PurchaseReturnRecord {
  id: string;
  date: string;
  reason: string;
  notes?: string;
  refundAmount: number | string;
  paymentId?: number;
  paymentNumber?: string;
  settlementType?: 'refund' | 'credit_note';
  items: Array<{
    inventoryItemId?: number;
    name: string;
    sku?: string;
    quantity: number;
    costPrice: string | number;
  }>;
}

export interface PurchaseItem {
  inventoryItemId?: number;
  name: string;
  sku?: string;
  barcode?: string | null;
  costPrice: string | number;
  salePrice?: string | number;
  quantity: number;
  receivedQuantity?: number;
  pendingQuantity?: number;
  returnedQuantity?: number;
  requestedInOrder?: number;
  availableInWarehouse?: number;
  deliveredFromWarehouse?: number;
  imageUrl?: string | null;
  supplierName?: string | null;
  customerOrderId?: number | null;
  orderNumber?: string | null;
  customerName?: string | null;
}

export interface PurchaseOrder {
  id: number;
  userId: number;
  purchaseNumber: string;
  supplierName: string;
  supplierContact?: string | null;
  items: PurchaseItem[];
  totalCost: string | number;
  status: 'pending' | 'ordered' | 'in_transit' | 'partially_received' | 'received' | 'cancelled';
  paymentStatus: 'unpaid' | 'paid';
  linkedCustomerOrderId?: number | null;
  linkedCustomerOrderNumber?: string | null;
  receiptVoucher?: string | null;
  shippingGuideNumber?: string | null;
  receptions?: PurchaseReceptionRecord[];
  returns?: PurchaseReturnRecord[];
  notes?: string | null;
  purchaseDate: string;
  receivedDate?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface PaymentRecord {
  id: number;
  userId: number;
  paymentNumber: string;
  type: 'inflow' | 'outflow' | 'refund' | 'expense';
  category: 'customer_sale' | 'supplier_purchase' | 'supplier_refund' | 'customer_refund' | 'operational_expense' | 'other';
  amount: number | string;
  paymentMethod: string; // 'transferencia_bancaria', 'efectivo', 'deuna', 'tarjeta_credito_debito', 'deposito', 'cheque', 'nota_credito', 'otro'
  bankOrAccount: string; // 'Banco Pichincha', 'Banco Guayaquil', 'Deuna!', 'Caja Principal', 'Produbanco', 'Nota de Crédito', etc.
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
  updatedAt?: string;
}

export interface AccountsReceivableItem {
  orderId: number;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  orderDate: string;
  orderStatus: string;
  totalAmount: number;
  totalPaid: number;
  totalRefunded: number;
  pendingBalance: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid' | 'refunded';
  paymentsCount: number;
  lastPaymentDate?: string;
}

export interface AccountsPayableItem {
  purchaseId: number;
  purchaseNumber: string;
  supplierName: string;
  supplierContact?: string;
  purchaseDate: string;
  purchaseStatus: string;
  totalCost: number;
  totalReturned: number;
  netCost: number;
  totalPaid: number;
  totalRefunded: number;
  pendingBalance: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid' | 'refunded';
  paymentsCount: number;
  lastPaymentDate?: string;
  returns?: PurchaseReturnRecord[];
}

export interface TreasuryAccountBreakdown {
  total: number;
  count: number;
  inflows: number;
  outflows: number;
  inflowsCount: number;
  outflowsCount: number;
}

export interface TreasurySummary {
  totalInflows: number;
  totalOutflows: number;
  totalRefunds: number;
  totalExpenses: number;
  netCashBalance: number;
  totalAccountsReceivablePending: number;
  totalAccountsPayablePending: number;
  receivablesPaidCount: number;
  receivablesPendingCount: number;
  payablesPaidCount: number;
  payablesPendingCount: number;
  byPaymentMethod: Record<string, TreasuryAccountBreakdown>;
  byBankOrAccount: Record<string, TreasuryAccountBreakdown>;
  recentPayments?: PaymentRecord[];
  monthlyCashFlow?: Array<{
    month: string;
    inflows: number;
    outflows: number;
    net: number;
  }>;
}

export interface FinancialReportSummary {
  period: string;
  totalPurchasesCost: number;
  totalPurchasesCount: number;
  totalPendingPurchasesCost: number;
  totalSalesRevenue: number;
  totalOrdersCount: number;
  costOfGoodsSold: number;
  grossProfit: number;
  netProfitMarginPercent: number;
  currentPhysicalStockUnits: number;
  currentPhysicalStockCostValue: number;
  currentPhysicalStockSaleValue: number;
  recentTransactions: Array<{
    type: 'purchase' | 'sale';
    id: number;
    reference: string;
    description: string;
    amount: number;
    cost?: number;
    profit?: number;
    date: string;
    status: string;
  }>;
}

export interface CourierPartner {
  id: string;
  name: string;
  logoUrl?: string;
  quoteUrl?: string; // URL to quote shipping costs from the courier / tarifario web
  active: boolean;
}

export interface PaymentMethodPartner {
  id: string;
  name: string;
  logoUrl?: string;
  details?: string;
  active: boolean;
}

export type StoreTheme = 'classic' | 'boutique' | 'brutalist' | 'cyber' | 'minimal' | 'fresh';

export interface StorePromoPopupConfig {
  active: boolean;
  theme?: 'christmas' | 'black_friday' | 'super_deals' | 'new_year' | 'clearance' | 'custom' | string;
  badge?: string; // e.g. "🎄 OFERTA NAVIDEÑA"
  title: string; // e.g. "¡Gran Venta Especial de Navidad!"
  description: string; // e.g. "Aprovecha hasta un 30% de descuento en regalos seleccionados y envíos rápidos."
  imageUrl?: string | null; // AI generated or custom promotional banner
  couponCode?: string; // e.g. "NAVIDAD2026"
  buttonText?: string; // e.g. "Aprovechar Descuento por WhatsApp"
  actionType?: 'whatsapp' | 'catalog' | 'url' | 'product';
  actionUrl?: string;
  featuredProductId?: number | string;
  featuredProductName?: string;
  featuredProductPrice?: number | string;
  featuredProductImage?: string;
  featuredCategory?: string;
}

export interface StoreConfig {
  id?: number;
  userId?: number;
  storeName: string;
  whatsappNumber: string;
  description: string;
  bannerText: string;
  deliveryFee: number;
  minOrderAmount: number;
  currency: string;
  isActive?: boolean;
  maintenanceTitle?: string | null;
  maintenanceMessage?: string | null;
  allowCatalogBrowsing?: boolean;
  showStock?: boolean;
  showOutOfStock?: boolean;
  instagramUrl?: string;
  websiteUrl?: string | null;
  address?: string;
  logoUrl?: string | null; // Logo cuadrado para vista celular / móvil (1:1)
  logoDesktopUrl?: string | null; // Logo rectangular horizontal para vista PC / escritorio
  courierLogos?: CourierPartner[] | string;
  paymentLogos?: PaymentMethodPartner[] | string;
  theme?: StoreTheme | string;
  themeColors?: Record<string, string[]> | string;
  enablePagination?: boolean;
  itemsPerPage?: number;
  promoPopup?: StorePromoPopupConfig | string | null;
  domain?: string;
}

export interface ProductMarketingOptions {
  showStock?: boolean;
  showPhone?: boolean;
  showSku?: boolean;
  showWebsite?: boolean;
  websiteUrl?: string;
  tone?: string;
  customPrice?: string;
  cityOrRegion?: string;
  whatsappContact?: string;
  storeAddress?: string;
  paymentTitlesInput?: string;
  shippingCompaniesInput?: string;
}

export interface ProductMarketingCopy {
  title?: string;
  price?: string;
  sku?: string;
  tags?: string[];
  universalDescription: string;
  paymentTitles?: string[];
  shippingCompanies?: string[];
  allInOne?: string;
  savedAt?: string;
  options?: ProductMarketingOptions;
  showStock?: boolean;
  showPhone?: boolean;
  showSku?: boolean;
  showWebsite?: boolean;
  websiteUrl?: string;
  marketplace?: {
    title: string;
    price: string;
    condition: string;
    description: string;
    fullText: string;
  };
  instagram?: {
    hook: string;
    body: string;
    callToAction: string;
    hashtags: string[];
    fullText: string;
  };
  whatsapp?: {
    shortMessage: string;
    fullCatalogText: string;
  };
  ecommerce?: {
    seoTitle: string;
    bulletPoints: string[];
    technicalDescription: string;
    fullText: string;
  };
}

export interface ServerDomainConfig {
  id?: number;
  userId?: number;
  adminDomain: string; // e.g. "admin.dominio1.com" or comma separated
  storeDomain: string; // e.g. "www.dominio1.com, dominio1.com"
  autoRouting: boolean; // whether to automatically route based on hostname
  defaultFallbackView: 'store' | 'admin'; // what to show if domain doesn't match
  createdAt?: string;
  updatedAt?: string;
}

export interface ParsedProductResult {
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  costPrice: number;
  costWithoutTax: number;
  costWithTax: number;
  baseCostPrice?: number;
  taxStatus?: 'INCLUDED' | 'PLUS_TAX' | 'NOT_SPECIFIED';
  taxPercent?: number;
  costOptions?: CostOption[];
  profitMarginPercent?: number;
  salePrice: number;
  stock: number;
  description: string;
  tags: string[];
  attributes: Record<string, any>;
  supplierNotes?: string;
  confidenceScore: number;
}

export interface StoreAnalyticsSummary {
  totalVisits: number;
  uniqueVisitors: number;
  totalProductViews: number;
  totalCartAdditions: number;
  totalWhatsappClicks: number;
  totalOrdersCount: number;
  totalRevenue: number;
  conversionRate: number;
  viewToCartRate: number;
  cartToWhatsappRate: number;
  peakDayName: string;
  peakHourTime: string;
  starProduct?: {
    id: number;
    name: string;
    unitsSold: number;
    revenue: number;
    imageUrl?: string | null;
    salePrice: number;
  } | null;
  mostViewedProduct?: {
    id: number;
    name: string;
    views: number;
    imageUrl?: string | null;
    salePrice: number;
  } | null;
}

export interface StoreAnalyticsTimelinePoint {
  date: string;
  label: string;
  visits: number;
  productViews: number;
  cartAdds: number;
  orders: number;
  revenue: number;
}

export interface StoreAnalyticsProductPerformance {
  id: number;
  name: string;
  sku: string;
  category: string;
  salePrice: number;
  stock: number;
  imageUrl?: string | null;
  videoUrl?: string | null;
  views: number;
  cartAdds: number;
  unitsSold: number;
  revenue: number;
  conversionRate: number;
  cartConversionRate: number;
}

export interface StoreAnalyticsDashboardData {
  period: 'today' | '7d' | '30d' | '90d' | 'year' | 'all';
  targetProductId?: number | null;
  summary: StoreAnalyticsSummary;
  funnel: Array<{ step: string; count: number; percent: number }>;
  timeline: StoreAnalyticsTimelinePoint[];
  topViewedProducts: StoreAnalyticsProductPerformance[];
  topPurchasedProducts: StoreAnalyticsProductPerformance[];
  dayOfWeekDistribution: Array<{
    dayIndex: number;
    dayName: string;
    orders: number;
    revenue: number;
  }>;
  hourlyDistribution: Array<{
    hour: string;
    hourNumber: number;
    orders: number;
    revenue: number;
  }>;
  deviceBreakdown: Array<{ name: string; value: number }>;
  productPerformance: StoreAnalyticsProductPerformance[];
}

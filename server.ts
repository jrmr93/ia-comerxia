import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { optionalAuth, requireAuth, requireAdmin, AuthRequest } from './src/middleware/auth.ts';
import { ensureTablesCreated, getDatabaseRuntimeInfo, testDatabaseConnection } from './src/db/index.ts';
import { generarClaveAcceso, generarFacturaXml, firmarFacturaXml, generarFirmaSimuladaXml, getEcuadorLocalDate } from './src/utils/sri-signer.ts';
import { postSoapRequest, parseSriMensajes, SRI_ENDPOINTS } from './src/utils/sri-soap.ts';
import { generateSriRideHtml } from './src/utils/sri-ride.ts';
import { generateSriRidePdfBuffer } from './src/utils/sri-ride-pdf.ts';
import { extractItemTaxPercent, calculateCardSalePrice, calculateLineItem } from './src/utils/ecuadorTaxCalculator.ts';
import {
  validateUserCredentials,
  verifyUserPasswordById,
  generateAuthToken,
  getUserById,
  updateUserProfile,
  checkAdminExists,
  createInitialAdmin,
  listOperators,
  createOperator,
  deleteOperator,
  activateUserAccount,
  resendActivationCode,
  requestPasswordReset,
  confirmPasswordReset,
  setOperatorActivation,
} from './src/db/users.ts';
import {
  getEmailConfig,
  saveEmailConfig,
  sendTestEmail,
  sendPayphonePaymentLinkEmail,
} from './src/services/email.ts';
import {
  checkProductSalesAndPurchasesLink,
  createInventoryItem,
  createTelegramMessageRecord,
  deleteBulkInventoryItems,
  deleteInventoryItem,
  deleteTelegramMessage,
  deleteBulkTelegramMessages,
  clearAllTelegramMessages,
  findExistingInventoryItem,
  generateNextSku,
  getSupplierSkuPrefix,
  getInventoryItemById,
  getInventoryItems,
  getInventoryStats,
  getTelegramConfig,
  getTelegramMessages,
  getAiConfig,
  updateAiConfig,
  getEcuadorApiConfig,
  saveEcuadorApiConfig,
  getPayphoneConfig,
  savePayphoneConfig,
  getSriConfig,
  saveSriConfig,
  getNextSriSecuencial,
  createSriInvoice,
  getSriInvoicesByUser,
  getSriInvoiceByOrderId,
  autoRegisterCustomerFromEcuadorApi,
  updateInventoryItem,
  saveProductMarketingCopy,
  updateTelegramConfig,
  appendImagesToInventoryItem,
  removeImageFromInventoryItem,
  clearAllImagesFromInventoryItem,
  setCoverImageForInventoryItem,
  setInventoryItemVideo,
  getStoreConfig,
  updateStoreConfig,
  createCustomerOrder,
  getCustomerOrders,
  updateCustomerOrder,
  updateCustomerOrderStatus,
  deleteCustomerOrder,
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  confirmPurchase,
  receivePurchase,
  recordPurchasePartialReception,
  recordPurchaseReturn,
  deletePurchase,
  autoGeneratePurchaseForOrder,
  recordPartialDelivery,
  completeOrderRemainingDelivery,
  recordCustomerReturn,
  getFinancialSummary,
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  syncCustomersFromOrders,
  getServerDomainConfig,
  updateServerDomainConfig,
  cleanTestData,
  getDevTestingStats,
  getPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  voidPayment,
  deletePayment,
  getAccountsReceivable,
  getAccountsPayable,
  getTreasuryDashboard,
  syncPaymentsFromOrdersAndPurchases,
  deriveBankOrAccountFromMethod,
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  syncSuppliersFromPurchasesAndInventory,
  seedTestData,
  reparseInventoryItemWithAi,
} from './src/db/inventory.ts';
import {
  parseSupplierTelegramMessage,
  generateProductMarketingCopy,
  generateProductCommercialDescription,
  testGeminiApiKey,
  testLmStudioConnection,
  setCustomAiApiKey,
  resetAiClient,
  isValidGeminiApiKey,
  hasValidAiApiKey,
} from './src/services/gemini-parser.ts';
import {
  startTelegramPolling,
  stopTelegramPolling,
  syncTelegramUpdatesOnce,
  getBotRuntimeStatus,
  processTelegramMessage,
} from './src/services/telegram-bot.ts';
import {
  extractProductUrlFromText,
  scrapeAndProcessWebProduct,
} from './src/services/web-product-scraper.ts';
import {
  searchProductImages,
  searchProductImagesWithAI,
  generateProductStudioPhotoWithAI,
  generateStorePromoBannerWithAI,
  searchCommercialPromoBanners,
  CURATED_COMMERCIAL_PRESETS,
} from './src/services/image-search.ts';
import {
  ensureUploadsDirExists,
  persistImageLocally,
  persistImageListLocally,
  persistVideoLocally,
  syncAllInventoryImagesLocally,
  getUploadsStats,
  createUploadsZipBuffer,
  restoreUploadsFromZipBuffer,
  deleteMediaFileIfUnreferenced,
} from './src/services/media-storage.ts';
import {
  getAdvertisingVideos,
  createAdvertisingVideo,
  updateAdvertisingVideo,
  deleteAdvertisingVideo,
  getAdvertisingPlaylists,
  createAdvertisingPlaylist,
  updateAdvertisingPlaylist,
  deleteAdvertisingPlaylist,
  getAdvertisingDisplays,
  createAdvertisingDisplay,
  updateAdvertisingDisplay,
  deleteAdvertisingDisplay,
  getPublicDisplayConfigByToken,
  updateDisplayLastSeen,
} from './src/db/digitalSignage.ts';
import {
  getFullSystemData,
  generateCompleteSqlDump,
  createFullSystemMasterZip,
  restoreCompleteJsonDump,
  restoreMasterFullSystemZip,
  generateFinancialProductsExcelBuffer,
} from './src/services/system-backup.ts';
import { searchProductVideos } from './src/services/video-search.ts';
import { quoteProductInEcuadorMarket } from './src/services/market-quote.ts';
import { validateEcuadorId } from './src/utils/ecuadorIdValidator.ts';
import { sendInvoiceEmail } from './src/services/email.ts';
import {
  recordAnalyticsEvent,
  getStoreAnalyticsDashboard,
  resetStoreAnalytics,
} from './src/db/analytics.ts';
import multer from 'multer';
import fs from 'fs';

async function startServer() {
  // Ensure all database tables exist
  await ensureTablesCreated();

  // Ensure uploads directory exists
  const uploadsDir = ensureUploadsDirExists();

  const app = express();
  const PORT = 3000;

  // CORS middleware for AI Studio preview iframe and cross-origin embedding
  app.use((req: Request, res: Response, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Serve persistent self-hosted uploads with CORS and missing-file fallback
  app.use('/uploads', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });

  app.use('/uploads', express.static(uploadsDir, {
    maxAge: '30d',
    immutable: true,
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  }));

  // Fallback for missing uploads: return clean SVG placeholder instead of falling into HTML / SPA fallback
  app.use('/uploads', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" fill="none">
      <rect width="400" height="400" fill="#f8fafc"/>
      <rect x="20" y="20" width="360" height="360" rx="16" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="6 6"/>
      <circle cx="200" cy="170" r="45" fill="#e2e8f0"/>
      <path d="M185 160C185 151.716 191.716 145 200 145C208.284 145 215 151.716 215 160V175H185V160Z" fill="#94a3b8"/>
      <rect x="170" y="170" width="60" height="45" rx="8" fill="#64748b"/>
      <circle cx="200" cy="192" r="10" fill="#f8fafc"/>
      <text x="200" y="250" text-anchor="middle" fill="#475569" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="bold">Foto no disponible</text>
      <text x="200" y="275" text-anchor="middle" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="12">Imagen de producto en bodega</text>
    </svg>`;
    res.status(200).send(svg);
  });

  // Increase payload size for base64 product images and large ZIP backups
  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ extended: true, limit: '500mb' }));

  // 1. Health & Database Connection Status endpoints
  app.get('/api/db-status', async (req: Request, res: Response) => {
    try {
      const status = await getDatabaseRuntimeInfo();
      res.json({
        success: true,
        ...status,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        connected: false,
        error: err.message || 'Error al verificar conexión con PostgreSQL',
      });
    }
  });

  app.get('/api/health', async (req: Request, res: Response) => {
    try {
      const status = await getDatabaseRuntimeInfo();
      res.json({
        status: status.connected ? 'ok' : 'degraded',
        dbConnected: status.connected,
        dbInfo: status,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.json({
        status: 'error',
        dbConnected: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // 1b. Strict SQL Database Guard Middleware: Blocks authentication & database actions if PostgreSQL is disconnected
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    if (
      req.path === '/db-status' ||
      req.path === '/health' ||
      req.path.startsWith('/uploads') ||
      req.path.startsWith('/assets')
    ) {
      return next();
    }

    const dbInfo = await getDatabaseRuntimeInfo();
    if (!dbInfo.connected) {
      return res.status(503).json({
        success: false,
        dbConnected: false,
        error: 'Sin conexión a la base de datos PostgreSQL. El servidor web está activo, pero la base de datos SQL no responde.',
        message: (dbInfo as any).error || 'No se pudo conectar a la base de datos PostgreSQL.',
        hint: (dbInfo as any).hint || 'Inicie el servicio de PostgreSQL en su sistema y presione "Reintentar Conexión" en la pantalla.',
      });
    }

    next();
  });

  // 1b. SQL Database User Authentication Endpoints
  app.get('/api/auth/setup-status', async (req: Request, res: Response) => {
    try {
      const hasAdmin = await checkAdminExists();
      res.json({
        success: true,
        hasAdmin,
      });
    } catch (error: any) {
      console.error('Error checking setup status:', error);
      res.status(500).json({ error: 'Error al verificar estado de administrador' });
    }
  });

  app.post('/api/auth/setup-admin', async (req: Request, res: Response) => {
    try {
      const alreadyHasAdmin = await checkAdminExists();
      if (alreadyHasAdmin) {
        return res.status(403).json({
          error: 'El administrador ya ha sido configurado previamente. No se permite crear más cuentas, solo iniciar sesión.',
        });
      }

      const { email, username, password, confirmPassword, name } = req.body;
      const cleanEmail = (email || username || '').trim().toLowerCase();

      if (!cleanEmail || !cleanEmail.includes('@')) {
        return res.status(400).json({ error: 'Debes ingresar un correo electrónico válido' });
      }

      if (!password || !confirmPassword) {
        return res.status(400).json({ error: 'Debes ingresar y confirmar la contraseña del administrador' });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Las contraseñas no coinciden. Por favor verifícalas' });
      }

      if (password.trim().length < 4) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
      }

      const user = await createInitialAdmin({
        email: cleanEmail,
        username: username?.trim() || cleanEmail,
        password,
        name: name?.trim() || 'Administrador Principal',
      });

      const token = generateAuthToken({ id: user.id, username: user.username, role: user.role });
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          role: user.role,
          photoUrl: user.photoUrl,
        },
      });
    } catch (error: any) {
      console.error('Setup admin error:', error);
      res.status(400).json({ error: error.message || 'Error al configurar usuario administrador' });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, username, password } = req.body;
      const identifier = (email || username || '').trim();
      if (!identifier || !password) {
        return res.status(400).json({ error: 'Correo electrónico y contraseña son requeridos' });
      }

      const user = await validateUserCredentials(identifier, password);
      if (!user) {
        return res.status(401).json({ error: 'Correo electrónico o contraseña incorrectos' });
      }

      if (user.isActive === false) {
        return res.status(403).json({
          error: 'Tu cuenta aún no ha sido activada. Por favor revisa tu correo electrónico (incluyendo tu bandeja de entrada y la carpeta de spam o correo no deseado) e ingresa el código de activación.',
          requiresActivation: true,
          username: user.username,
          email: user.email,
        });
      }

      const token = generateAuthToken({ id: user.id, username: user.username, role: user.role });
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          role: user.role,
          photoUrl: user.photoUrl,
          isActive: user.isActive,
        },
      });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ error: error.message || 'Error al autenticar usuario' });
    }
  });

  // Account Activation via 6-digit Code
  app.post('/api/auth/activate', async (req: Request, res: Response) => {
    try {
      const { username, code } = req.body;
      if (!username || !code) {
        return res.status(400).json({ error: 'Usuario y código de activación requeridos' });
      }

      const result = await activateUserAccount(username, code);
      const token = result.user ? generateAuthToken({ id: result.user.id, username: result.user.username, role: result.user.role }) : undefined;

      res.json({
        success: true,
        message: result.message,
        token,
        user: result.user,
      });
    } catch (error: any) {
      console.error('Activation error:', error);
      res.status(400).json({ error: error.message || 'Error al activar la cuenta' });
    }
  });

  // Resend Activation Code
  app.post('/api/auth/resend-activation', async (req: Request, res: Response) => {
    try {
      const { username } = req.body;
      if (!username) {
        return res.status(400).json({ error: 'Usuario o correo requerido' });
      }

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
      const appUrl = `${protocol}://${host}`;

      const result = await resendActivationCode(username, appUrl);
      res.json(result);
    } catch (error: any) {
      console.error('Resend activation error:', error);
      res.status(400).json({ error: error.message || 'Error al reenviar código de activación' });
    }
  });

  // Request Password Reset Code via Google Email
  app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
    try {
      const { username } = req.body;
      if (!username) {
        return res.status(400).json({ error: 'Usuario o correo electrónico requerido' });
      }

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
      const appUrl = `${protocol}://${host}`;

      const result = await requestPasswordReset(username, appUrl);
      res.json(result);
    } catch (error: any) {
      console.error('Forgot password error:', error);
      res.status(400).json({ error: error.message || 'Error al procesar solicitud de recuperación' });
    }
  });

  // Confirm Password Reset with Code
  app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
    try {
      const { username, code, newPassword } = req.body;
      if (!username || !code || !newPassword) {
        return res.status(400).json({ error: 'Usuario, código de recuperación y nueva contraseña son requeridos' });
      }

      const result = await confirmPasswordReset(username, code, newPassword);
      res.json(result);
    } catch (error: any) {
      console.error('Reset password error:', error);
      res.status(400).json({ error: error.message || 'Error al restablecer la contraseña' });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      res.json({
        success: true,
        user: req.user,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Error al obtener datos de sesión' });
    }
  });

  app.put('/api/auth/profile', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.dbUserId) {
        return res.status(401).json({ error: 'No autorizado' });
      }

      const { username, name, email, currentPassword, newPassword, photoUrl } = req.body;
      const updatedUser = await updateUserProfile(req.dbUserId, {
        username,
        name,
        email,
        currentPassword,
        newPassword,
        photoUrl,
      });

      // Generate a fresh token with updated username
      const freshToken = generateAuthToken({
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role,
      });

      res.json({
        success: true,
        user: updatedUser,
        token: freshToken,
      });
    } catch (error: any) {
      console.error('Error updating profile:', error);
      res.status(400).json({ error: error.message || 'Error al actualizar perfil de administrador' });
    }
  });

  // 1c. Operator Management Endpoints (Admin Only)
  app.get('/api/users/operators', requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const ops = await listOperators();
      res.json({ success: true, operators: ops });
    } catch (error: any) {
      console.error('Error listing operators:', error);
      res.status(500).json({ error: error.message || 'Error al obtener lista de operadores' });
    }
  });

  app.post('/api/users/operators', requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { username, password, name, email, requireActivation } = req.body;
      const cleanEmail = (email || username || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        return res.status(400).json({ error: 'Debes proporcionar un correo electrónico válido para el operador' });
      }

      const cleanUsername = (username || cleanEmail).trim().toLowerCase();

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
      const appUrl = `${protocol}://${host}`;

      const newOp = await createOperator({
        username: cleanUsername,
        password,
        name: name?.trim() || cleanUsername,
        email: cleanEmail,
        requireActivation,
        appUrl,
      });
      res.json({ success: true, operator: newOp });
    } catch (error: any) {
      console.error('Error creating operator:', error);
      res.status(400).json({ error: error.message || 'Error al crear operador' });
    }
  });

  app.post('/api/users/operators/:id/toggle-active', requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const opId = parseInt(req.params.id, 10);
      const { isActive } = req.body;
      if (isNaN(opId) || typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'Parámetros inválidos' });
      }

      const result = await setOperatorActivation(opId, isActive);
      res.json(result);
    } catch (error: any) {
      console.error('Error toggling operator status:', error);
      res.status(400).json({ error: error.message || 'Error al cambiar estado del operador' });
    }
  });

  app.delete('/api/users/operators/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const opId = parseInt(req.params.id, 10);
      if (isNaN(opId)) {
        return res.status(400).json({ error: 'ID de operador inválido' });
      }

      await deleteOperator(opId, req.dbUserId, req.user?.username);
      res.json({ success: true, message: 'Operador eliminado correctamente' });
    } catch (error: any) {
      console.error('Error deleting operator:', error);
      res.status(400).json({ error: error.message || 'Error al eliminar operador' });
    }
  });

  // 1d. Google Email (Gmail SMTP) Settings Endpoints (Admin Only)
  app.get('/api/email/config', requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const config = await getEmailConfig(req.dbUserId);
      res.json({ success: true, config });
    } catch (error: any) {
      console.error('Error getting email config:', error);
      res.status(500).json({ error: error.message || 'Error al obtener configuración de correo' });
    }
  });

  app.post('/api/email/config', requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { googleEmail, googleAppPassword, senderName, smtpHost, smtpPort, smtpSecure, requireActivation } = req.body;
      const updated = await saveEmailConfig(req.dbUserId || 1, {
        googleEmail,
        googleAppPassword,
        senderName,
        smtpHost,
        smtpPort,
        smtpSecure,
        requireActivation,
      });

      res.json({ success: true, config: updated, message: 'Configuración de correo de Google guardada correctamente' });
    } catch (error: any) {
      console.error('Error saving email config:', error);
      res.status(400).json({ error: error.message || 'Error al guardar configuración de correo' });
    }
  });

  app.post('/api/email/test', requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { testEmail } = req.body;
      if (!testEmail || !testEmail.includes('@')) {
        return res.status(400).json({ error: 'Ingresa un correo electrónico destinatario válido para la prueba' });
      }

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
      const appUrl = `${protocol}://${host}`;

      const result = await sendTestEmail(testEmail, req.dbUserId, appUrl);
      res.json({ success: true, message: `Correo de prueba enviado exitosamente a ${testEmail}`, result });
    } catch (error: any) {
      console.error('Error testing email connection:', error);
      res.status(400).json({
        error: error.message || 'Error al enviar correo de prueba. Verifica tu correo de Google y contraseña de aplicación.',
      });
    }
  });

  // 1e. Ecuador API (Cédula Identity Lookup) Settings & Proxy Endpoints
  app.get('/api/ecuador-api/config', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const cfg = await getEcuadorApiConfig(req.dbUserId || 1);
      const apiKeyMasked = cfg.apiKey
        ? cfg.apiKey.length > 8
          ? `${cfg.apiKey.slice(0, 4)}••••••••${cfg.apiKey.slice(-4)}`
          : '••••••••••••••••'
        : '';
      res.json({
        success: true,
        config: {
          id: cfg.id,
          userId: cfg.userId,
          hasApiKey: cfg.hasApiKey,
          isConfigured: cfg.isConfigured,
          isActive: cfg.isActive,
          apiKeyMasked,
        },
      });
    } catch (error: any) {
      console.error('Error fetching Ecuador API config:', error);
      res.status(500).json({ error: error.message || 'Error al obtener configuración de Ecuador API' });
    }
  });

  app.post('/api/ecuador-api/config', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { apiKey, isActive } = req.body;
      const updated = await saveEcuadorApiConfig(req.dbUserId || 1, {
        apiKey: typeof apiKey === 'string' ? apiKey.trim() : undefined,
        isActive: typeof isActive === 'boolean' ? isActive : undefined,
      });

      res.json({
        success: true,
        message: 'Configuración de Ecuador API guardada correctamente',
        config: {
          id: updated.id,
          hasApiKey: Boolean(updated.apiKey && updated.apiKey.trim().length > 0),
          isActive: updated.isActive !== false,
        },
      });
    } catch (error: any) {
      console.error('Error saving Ecuador API config:', error);
      res.status(400).json({ error: error.message || 'Error al guardar configuración de Ecuador API' });
    }
  });

  app.get('/api/ecuador-api/cedulas/:cedula', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { cedula } = req.params;
      const cleanCedula = (cedula || '').trim();
      if (!cleanCedula || !/^\d{10}$/.test(cleanCedula)) {
        return res.status(400).json({
          error: 'La cédula proporcionada debe contener exactamente 10 dígitos numéricos.',
        });
      }

      const cfg = await getEcuadorApiConfig(req.dbUserId || 1);
      if (cfg.isActive === false) {
        return res.status(400).json({
          error: 'El servicio de Ecuador API está desactivado en la Configuración del Sistema.',
        });
      }
      if (!cfg.hasApiKey || !cfg.apiKey) {
        return res.status(400).json({
          error: 'La API Key de Ecuador API no está configurada en la Configuración del Sistema.',
        });
      }

      const targetUrl = `https://api.ecuadorapi.com/api/v1/cedulas/${encodeURIComponent(cleanCedula)}/nombres`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s max time

      try {
        const apiRes = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${cfg.apiKey.trim()}`,
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const json = await apiRes.json();

        if (!apiRes.ok) {
          const errMsg = json?.message || json?.error || `Error en Ecuador API (HTTP ${apiRes.status})`;
          return res.status(apiRes.status).json({
            success: false,
            error: errMsg,
            raw: json,
          });
        }

        const clientData = json.data || json;
        if (clientData) {
          const clientName = clientData.full_name || `${clientData.first_name || ''} ${clientData.last_name || ''}`.trim();
          if (clientName) {
            try {
              await autoRegisterCustomerFromEcuadorApi({
                userId: req.dbUserId || 1,
                ci: cleanCedula,
                name: clientName,
                address: null,
              });
            } catch (autoErr) {
              console.warn('Could not auto register customer from Cedula API:', autoErr);
            }
          }
        }

        return res.json({
          success: true,
          data: clientData,
          error: json.error || null,
          message: json.message || null,
        });
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          return res.status(504).json({ error: 'La consulta a Ecuador API excedió el tiempo máximo de espera (60 segundos).' });
        }
        throw fetchErr;
      }
    } catch (error: any) {
      console.error('Error querying Ecuador API by cedula:', error);
      res.status(500).json({ error: error.message || 'Error al consultar datos en Ecuador API' });
    }
  });

  app.get('/api/ecuador-api/rucs/:ruc', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { ruc } = req.params;
      const cleanRuc = (ruc || '').trim();
      if (!cleanRuc || !/^\d{13}$/.test(cleanRuc)) {
        return res.status(400).json({
          error: 'El RUC proporcionado debe contener exactamente 13 dígitos numéricos.',
        });
      }

      const cfg = await getEcuadorApiConfig(req.dbUserId || 1);
      if (cfg.isActive === false) {
        return res.status(400).json({
          error: 'El servicio de Ecuador API está desactivado en la Configuración del Sistema.',
        });
      }
      if (!cfg.hasApiKey || !cfg.apiKey) {
        return res.status(400).json({
          error: 'La API Key de Ecuador API no está configurada en la Configuración del Sistema.',
        });
      }

      const targetUrl = `https://api.ecuadorapi.com/api/v1/rucs/${encodeURIComponent(cleanRuc)}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s max time

      try {
        const apiRes = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${cfg.apiKey.trim()}`,
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const json = await apiRes.json();

        if (!apiRes.ok) {
          const errMsg = json?.message || json?.error || `Error en Ecuador API RUC (HTTP ${apiRes.status})`;
          return res.status(apiRes.status).json({
            success: false,
            error: errMsg,
            raw: json,
          });
        }

        const rucData = json.data || json;
        if (rucData) {
          const rucName = rucData.business_name || rucData.trade_name || rucData.full_name;
          if (rucName) {
            try {
              await autoRegisterCustomerFromEcuadorApi({
                userId: req.dbUserId || 1,
                ci: cleanRuc,
                name: rucName,
                address: rucData.address || null,
              });
            } catch (autoErr) {
              console.warn('Could not auto register customer from RUC API:', autoErr);
            }
          }
        }

        return res.json({
          success: true,
          data: rucData,
          error: json.error || null,
          message: json.message || null,
        });
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          return res.status(504).json({ error: 'La consulta de RUC a Ecuador API excedió el tiempo máximo de espera (60 segundos).' });
        }
        throw fetchErr;
      }
    } catch (error: any) {
      console.error('Error querying Ecuador API by RUC:', error);
      res.status(500).json({ error: error.message || 'Error al consultar RUC en Ecuador API' });
    }
  });

  // 1f. Payphone API (Cobros con Tarjeta Visa / Mastercard) Settings & Proxy Endpoints
  app.get('/api/payphone/config', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const cfg = await getPayphoneConfig(req.dbUserId || 1);
      const tokenMasked = cfg.token
        ? cfg.token.length > 8
          ? `${cfg.token.slice(0, 4)}••••••••${cfg.token.slice(-4)}`
          : '••••••••••••••••'
        : '';
      res.json({
        success: true,
        config: {
          id: cfg.id,
          userId: cfg.userId,
          hasToken: cfg.hasToken,
          isConfigured: cfg.isConfigured,
          isActive: cfg.isActive,
          tokenMasked,
          storeId: cfg.storeId || '',
          environment: cfg.environment || 'production',
        },
      });
    } catch (error: any) {
      console.error('Error fetching Payphone API config:', error);
      res.status(500).json({ error: error.message || 'Error al obtener configuración de Payphone API' });
    }
  });

  app.post('/api/payphone/config', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { token, storeId, environment, isActive } = req.body;
      const updated = await savePayphoneConfig(req.dbUserId || 1, {
        token: typeof token === 'string' ? token.trim() : undefined,
        storeId: typeof storeId === 'string' ? storeId.trim() : undefined,
        environment: typeof environment === 'string' ? environment.trim() : undefined,
        isActive: typeof isActive === 'boolean' ? isActive : undefined,
      });

      res.json({
        success: true,
        message: 'Configuración de Payphone API guardada correctamente',
        config: {
          id: updated.id,
          hasToken: Boolean(updated.token && updated.token.trim().length > 0),
          isActive: updated.isActive !== false,
          storeId: updated.storeId || '',
          environment: updated.environment || 'production',
        },
      });
    } catch (error: any) {
      console.error('Error saving Payphone API config:', error);
      res.status(400).json({ error: error.message || 'Error al guardar configuración de Payphone API' });
    }
  });

  app.post('/api/payphone/generate-link', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const cfg = await getPayphoneConfig(req.dbUserId || 1);
      if (cfg.isActive === false) {
        return res.status(400).json({
          error: 'La pasarela Payphone está desactivada en la Configuración del Sistema.',
        });
      }
      if (!cfg.hasToken || !cfg.token) {
        return res.status(400).json({
          error: 'El Token de Payphone no está configurado en la Configuración del Sistema (Payphone API).',
        });
      }

      const {
        orderId,
        orderNumber,
        totalAmount = 0,
        subtotal0 = 0,
        subtotal15 = 0,
        tax15 = 0,
        customerName = 'Cliente',
        customerPhone,
        customerEmail,
        reference = '',
        additionalData = '',
      } = req.body;

      // Calculation in cents as integer
      const amtWithoutTax = Math.round(Math.max(0, Number(subtotal0 || 0)) * 100);
      const amtWithTax = Math.round(Math.max(0, Number(subtotal15 || 0)) * 100);
      const taxAmt = Math.round(Math.max(0, Number(tax15 || 0)) * 100);
      
      let totalAmt = amtWithoutTax + amtWithTax + taxAmt;
      if (totalAmt <= 0) {
        totalAmt = Math.round(Math.max(0, Number(totalAmount || 0)) * 100);
      }

      if (totalAmt <= 0) {
        return res.status(400).json({
          error: 'El monto total a cobrar debe ser mayor a 0.',
        });
      }

      // Max 15 chars clientTransactionId
      const nowStr = Date.now().toString();
      const rawTxId = `TX-${orderNumber || orderId || '0'}-${nowStr.slice(-4)}`;
      const clientTransactionId = rawTxId.slice(0, 15);

      const refText = (reference || `Pedido #${orderNumber || orderId || 'Venta'} - ${customerName}`).slice(0, 100);
      const extraData = (additionalData || `Pago de venta ${customerName}`).slice(0, 250);

      const host = req.get('host');
      const protocol = req.protocol || 'http';
      const responseUrl = `${protocol}://${host}/api/payphone/response`;

      const payphonePayload: any = {
        amount: totalAmt,
        amountWithoutTax: amtWithoutTax,
        amountWithTax: amtWithTax,
        tax: taxAmt,
        service: 0,
        tip: 0,
        currency: 'USD',
        reference: refText,
        clientTransactionId,
        additionalData: extraData,
        oneTime: true,
        expireIn: 30,
        isAmountEditable: false,
        responseUrl,
      };

      if (cfg.storeId && cfg.storeId.trim().length > 0) {
        payphonePayload.storeId = cfg.storeId.trim();
      }

      const targetUrl = 'https://pay.payphonetodoesposible.com/api/Links';

      const apiRes = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfg.token.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payphonePayload),
      });

      const responseText = await apiRes.text();
      let resultData: any;
      try {
        resultData = JSON.parse(responseText);
      } catch {
        resultData = responseText;
      }

      if (!apiRes.ok) {
        let errDesc = 'Error al comunicarse con Payphone API';
        if (typeof resultData === 'object' && resultData) {
          if (resultData.message) errDesc = resultData.message;
          if (Array.isArray(resultData.errors) && resultData.errors.length > 0) {
            const firstErr = resultData.errors[0];
            if (Array.isArray(firstErr.errorDescriptions) && firstErr.errorDescriptions.length > 0) {
              errDesc += `: ${firstErr.errorDescriptions.join(', ')}`;
            }
          }
        }
        return res.status(apiRes.status).json({
          success: false,
          error: errDesc,
          details: resultData,
        });
      }

      // When successful, Payphone returns string URL directly or JSON
      const payUrl = typeof resultData === 'string' ? resultData : (resultData?.url || resultData?.link || '');

      if (!payUrl || typeof payUrl !== 'string' || !payUrl.startsWith('http')) {
        return res.status(500).json({
          error: 'Respuesta inesperada de Payphone API (No se obtuvo un enlace válido).',
          details: resultData,
        });
      }

      res.json({
        success: true,
        payUrl,
        clientTransactionId,
        amountInCents: totalAmt,
      });
    } catch (error: any) {
      console.error('Error generating Payphone payment link:', error);
      res.status(500).json({ error: error.message || 'Error al generar enlace de pago en Payphone' });
    }
  });

  // Endpoint Callback de Redirección Payphone
  app.get('/api/payphone/response', async (req: Request, res: Response) => {
    try {
      const { id, clientTransactionId, statusCode } = req.query;
      console.log('[Payphone Response Callback] Params:', req.query);

      const cfg = await getPayphoneConfig(1);
      if (cfg.hasToken && cfg.token && id) {
        const numericId = Number(id);
        if (!isNaN(numericId) && numericId > 0) {
          const confirmPayload: any = { id: numericId };
          if (clientTransactionId) confirmPayload.clientTxId = String(clientTransactionId);

          const confirmRes = await fetch('https://pay.payphonetodoesposible.com/api/button/V2/Confirm', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${cfg.token.trim()}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(confirmPayload),
          });
          const confirmData = await confirmRes.json().catch(() => ({}));
          console.log('[Payphone Response Callback] Auto-Confirm Result:', confirmData);
        }
      }

      const isApproved = String(statusCode) === '3';
      res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payphone - Estado de Pago</title>
          <style>
            body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            .card { background: #1e293b; border-radius: 16px; padding: 32px; max-width: 440px; text-align: center; border: 1px solid #334155; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
            .icon { font-size: 48px; margin-bottom: 16px; }
            h1 { margin: 0 0 12px; font-size: 22px; color: ${isApproved ? '#34d399' : '#f87171'}; }
            p { color: #94a3b8; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
            .btn { background: #ff6b00; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer; text-decoration: none; display: inline-block; }
            .receipt { font-family: monospace; font-size: 18px; color: #fbbf24; background: #0f172a; padding: 8px 16px; border-radius: 6px; margin: 12px 0; border: 1px dashed #475569; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">${isApproved ? '✅' : '⚠️'}</div>
            <h1>${isApproved ? '¡Pago Procesado Con Éxito!' : 'Pago No Completado'}</h1>
            ${id ? `<div class="receipt">Comprobante #${id}</div>` : ''}
            <p>${isApproved ? 'Tu pago en Payphone ha sido registrado correctamente. Puedes cerrar esta ventana o volver a la tienda.' : 'El pago no se pudo completar o fue cancelado.'}</p>
            <button class="btn" onclick="window.close()">Cerrar Ventana</button>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      console.error('[Payphone Response Callback] Error:', error);
      res.status(500).send('Error procesando respuesta de Payphone');
    }
  });

  app.post('/api/payphone/send-email-link', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { to, customerName, orderNumber, totalAmount, payUrl, itemsSummary } = req.body;
      if (!to || !to.includes('@')) {
        return res.status(400).json({ error: 'Proporciona una dirección de correo válida para el cliente.' });
      }
      if (!payUrl || !payUrl.startsWith('http')) {
        return res.status(400).json({ error: 'No hay un enlace de pago Payphone válido para enviar.' });
      }

      const result = await sendPayphonePaymentLinkEmail({
        to,
        customerName: customerName || 'Cliente',
        orderNumber: String(orderNumber || '0'),
        totalAmount: Number(totalAmount || 0),
        payUrl,
        itemsSummary,
        userId: req.dbUserId || 1,
      });

      res.json({
        success: true,
        message: `✓ Enlace de pago Payphone enviado con éxito a ${to}`,
        result,
      });
    } catch (error: any) {
      console.error('Error sending Payphone payment link email:', error);
      res.status(500).json({ error: error.message || 'Error al enviar enlace de pago por correo' });
    }
  });

  app.post('/api/payphone/verify-transaction', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const cfg = await getPayphoneConfig(req.dbUserId || 1);
      if (!cfg.hasToken || !cfg.token) {
        return res.status(400).json({
          error: 'El Token de Payphone no está configurado en la Configuración del Sistema (Payphone API).',
        });
      }

      const { id, clientTransactionId } = req.body;
      const rawId = String(id || '').trim();
      const rawClientTxId = String(clientTransactionId || '').trim();

      if (!rawId && !rawClientTxId) {
        return res.status(400).json({
          error: 'Proporciona el ID de transacción o el clientTransactionId para verificar el pago.',
        });
      }

      const headers = {
        'Authorization': `Bearer ${cfg.token.trim()}`,
        'Content-Type': 'application/json',
      };

      let resultData: any = null;
      let apiResOk = false;

      // Paso 1: Si rawId o rawClientTxId es un ID numérico entero de recibo Payphone (ej. 1045920)
      const numericId = !isNaN(Number(rawId)) && Number(rawId) > 0 
        ? Number(rawId) 
        : (!isNaN(Number(rawClientTxId)) && Number(rawClientTxId) > 0 ? Number(rawClientTxId) : 0);

      if (numericId > 0) {
        try {
          console.log(`[Payphone Verify] Paso 1: Intentando Confirm por N° de recibo numérico #${numericId}...`);
          const confirmPayload: any = { id: numericId };
          if (rawClientTxId && isNaN(Number(rawClientTxId))) confirmPayload.clientTxId = rawClientTxId;

          const res1 = await fetch('https://pay.payphonetodoesposible.com/api/button/V2/Confirm', {
            method: 'POST',
            headers,
            body: JSON.stringify(confirmPayload),
          });
          const text1 = await res1.text();
          try { resultData = JSON.parse(text1); } catch { resultData = { raw: text1 }; }
          apiResOk = res1.ok;
          console.log('[Payphone Verify] Paso 1 resultado:', res1.status, resultData);
        } catch (e) {
          console.error('Error en Payphone Paso 1 confirm directo:', e);
        }
      }

      // Paso 1b: Si numericId > 0 pero Confirm no aprobó o devolvió error, consultar GET /api/Sale/{numericId}
      const isApprovedStep1 = apiResOk && (Number(resultData?.statusCode) === 3 || String(resultData?.transactionStatus).toUpperCase() === 'APPROVED');
      if (!isApprovedStep1 && numericId > 0) {
        try {
          console.log(`[Payphone Verify] Paso 1b: Consultando GET /api/Sale/${numericId}...`);
          const res1b = await fetch(`https://pay.payphonetodoesposible.com/api/Sale/${numericId}`, {
            method: 'GET',
            headers,
          });
          const text1b = await res1b.text();
          let data1b: any = null;
          try { data1b = JSON.parse(text1b); } catch {}
          if (res1b.ok && data1b && typeof data1b === 'object') {
            resultData = data1b;
            apiResOk = true;
            console.log('[Payphone Verify] Paso 1b resultado:', data1b);
          }
        } catch (e) {
          console.error('Error en Payphone Paso 1b:', e);
        }
      }

      // Paso 2: Si clientTransactionId es string (ej. TX-PED-...)
      const targetClientTxId = rawClientTxId || (isNaN(Number(rawId)) ? rawId : '');
      const isApprovedNow = apiResOk && (Number(resultData?.statusCode) === 3 || String(resultData?.transactionStatus).toUpperCase() === 'APPROVED');

      if (!isApprovedNow && targetClientTxId) {
        try {
          console.log(`[Payphone Verify] Paso 2: Consultando ClientTransaction para '${targetClientTxId}'...`);
          const res2 = await fetch('https://pay.payphonetodoesposible.com/api/Sale/ClientTransaction', {
            method: 'POST',
            headers,
            body: JSON.stringify({ clientTransactionId: targetClientTxId, clientTxId: targetClientTxId }),
          });
          const text2 = await res2.text();
          let data2: any = null;
          try { data2 = JSON.parse(text2); } catch {}

          if (!res2.ok || !data2) {
            try {
              const res2Get = await fetch(`https://pay.payphonetodoesposible.com/api/Sale/ClientTransaction/${encodeURIComponent(targetClientTxId)}`, {
                method: 'GET',
                headers,
              });
              const text2Get = await res2Get.text();
              try { data2 = JSON.parse(text2Get); } catch {}
            } catch {}
          }

          if (data2) {
            const item2 = Array.isArray(data2) ? data2[0] : data2;
            if (item2 && typeof item2 === 'object') {
              const foundNumericId = Number(item2?.id || item2?.transactionId || 0);
              if (foundNumericId > 0) {
                console.log(`[Payphone Verify] Paso 2: Encontrado N° recibo #${foundNumericId}. Confirmando...`);
                const res3 = await fetch('https://pay.payphonetodoesposible.com/api/button/V2/Confirm', {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ id: foundNumericId, clientTxId: targetClientTxId }),
                });
                const text3 = await res3.text();
                try {
                  const data3 = JSON.parse(text3);
                  resultData = data3;
                  apiResOk = res3.ok;
                } catch {
                  resultData = item2;
                  apiResOk = true;
                }
              } else {
                resultData = item2;
                apiResOk = true;
              }
            }
          }
        } catch (e) {
          console.error('Error en Payphone Paso 2 ClientTransaction fallback:', e);
        }
      }

      // Paso 3: Consulta en listado de ventas recientes del comercio GET /api/Sale
      const isApprovedStep2 = apiResOk && (Number(resultData?.statusCode) === 3 || String(resultData?.transactionStatus).toUpperCase() === 'APPROVED');
      if (!isApprovedStep2 && targetClientTxId) {
        try {
          console.log(`[Payphone Verify] Paso 3: Buscando en ventas de la tienda GET /api/Sale '${targetClientTxId}'...`);
          const resStoreSales = await fetch('https://pay.payphonetodoesposible.com/api/Sale', {
            method: 'GET',
            headers,
          });
          if (resStoreSales.ok) {
            const salesList = await resStoreSales.json();
            if (Array.isArray(salesList)) {
              const matchedSale = salesList.find((s: any) => 
                String(s.clientTransactionId || s.clientTxId || '') === targetClientTxId ||
                String(s.id || s.transactionId || '') === targetClientTxId
              );
              if (matchedSale) {
                console.log('[Payphone Verify] Paso 3: Venta encontrada:', matchedSale);
                const foundNumericId = Number(matchedSale.id || matchedSale.transactionId || 0);
                if (foundNumericId > 0) {
                  const resConfirmStore = await fetch('https://pay.payphonetodoesposible.com/api/button/V2/Confirm', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ id: foundNumericId, clientTxId: targetClientTxId }),
                  });
                  const confirmData = await resConfirmStore.json().catch(() => null);
                  if (resConfirmStore.ok && confirmData) {
                    resultData = confirmData;
                    apiResOk = true;
                  } else {
                    resultData = matchedSale;
                    apiResOk = true;
                  }
                } else {
                  resultData = matchedSale;
                  apiResOk = true;
                }
              }
            }
          }
        } catch (e) {
          console.error('Error en Payphone Paso 3 tienda sales query:', e);
        }
      }

      // Paso 4: Intento final de confirmación con clientTxId
      if (!resultData && targetClientTxId) {
        try {
          console.log(`[Payphone Verify] Paso 4: Confirmación final con clientTxId '${targetClientTxId}'...`);
          const res4 = await fetch('https://pay.payphonetodoesposible.com/api/button/V2/Confirm', {
            method: 'POST',
            headers,
            body: JSON.stringify({ id: 0, clientTxId: targetClientTxId }),
          });
          const text4 = await res4.text();
          try { resultData = JSON.parse(text4); } catch {}
          apiResOk = res4.ok;
        } catch {}
      }

      if (!resultData) {
        return res.status(400).json({
          success: false,
          transactionStatus: 'REJECTED',
          error: 'No se obtuvo respuesta válida de Payphone API. Verifica el token o el ID de recibo.',
        });
      }

      const statusCode = Number(resultData?.statusCode ?? resultData?.status ?? 0);
      const rawStatus = String(resultData?.transactionStatus || resultData?.status || '').toUpperCase();
      const isApproved = statusCode === 3 || rawStatus === 'APPROVED' || rawStatus === 'APPROVEDTRANSACTION' || rawStatus === 'APROBADA' || Boolean(resultData?.email);
      const isRejected = statusCode === 2 || rawStatus === 'CANCELED' || rawStatus === 'REJECTED' || rawStatus === 'CANCELADA';

      const numericReceiptId = resultData?.id || resultData?.transactionId || (numericId > 0 ? numericId : 0);
      const transactionId = String(numericReceiptId || resultData?.clientTransactionId || targetClientTxId || rawId || '');
      const authorizationCode = String(resultData?.authorizationCode || '');
      const amountInCents = Number(resultData?.amount || resultData?.total || 0);
      const amount = amountInCents > 0 ? amountInCents / 100 : undefined;
      const cardType = resultData?.cardType || resultData?.cardBrand || 'Tarjeta';
      const isTestMode = cfg.environment === 'sandbox' || Boolean(resultData?.isTest) || String(resultData?.environment).toLowerCase() === 'sandbox';

      if (isApproved) {
        return res.json({
          success: true,
          transactionStatus: 'APPROVED',
          transactionId: String(transactionId),
          numericId: numericReceiptId ? Number(numericReceiptId) : undefined,
          clientTransactionId: targetClientTxId || String(transactionId),
          authorizationCode,
          amount,
          cardType,
          isTestMode,
          environment: cfg.environment || 'production',
          message: isTestMode
            ? '¡Pago de prueba realizado correctamente en Payphone (Modo Sandbox)!'
            : '¡Pago realizado correctamente en Payphone!',
          details: resultData,
        });
      } else {
        return res.json({
          success: true,
          transactionStatus: isRejected ? 'REJECTED' : 'PENDING',
          transactionId: String(transactionId),
          isTestMode,
          environment: cfg.environment || 'production',
          message: resultData?.message || (isRejected ? 'El pago fue rechazado o cancelado en Payphone.' : 'El pago aún está pendiente de procesar por el cliente.'),
          details: resultData,
        });
      }
    } catch (error: any) {
      console.error('Error verifying Payphone transaction:', error);
      res.status(500).json({ error: error.message || 'Error al verificar la transacción en Payphone' });
    }
  });

  // 1f. Facturación Electrónica SRI Ecuador Endpoints
  app.get('/api/sri/config', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const cfg = await getSriConfig(req.dbUserId || 1);
      res.json({
        success: true,
        config: {
          id: cfg.id,
          userId: cfg.userId,
          ruc: cfg.ruc,
          estadoRuc: cfg.estadoRuc || 'ACTIVO',
          razonSocial: cfg.razonSocial,
          nombreComercial: cfg.nombreComercial,
          estab: cfg.estab,
          ptoEmi: cfg.ptoEmi,
          dirMatriz: cfg.dirMatriz,
          obligadoContabilidad: cfg.obligadoContabilidad,
          contribuyenteEspecial: cfg.contribuyenteEspecial || '',
          regimenRimpe: cfg.regimenRimpe || 'NO',
          ambiente: cfg.ambiente || '1',
          lastFacturaSecuencial: cfg.lastFacturaSecuencial ?? 0,
          lastNotaCreditoSecuencial: cfg.lastNotaCreditoSecuencial ?? 0,
          lastNotaDebitoSecuencial: cfg.lastNotaDebitoSecuencial ?? 0,
          lastGuiaRemisionSecuencial: cfg.lastGuiaRemisionSecuencial ?? 0,
          lastRetencionSecuencial: cfg.lastRetencionSecuencial ?? 0,
          lastLiquidacionSecuencial: cfg.lastLiquidacionSecuencial ?? 0,
          hasP12Certificate: Boolean(cfg.p12Base64 && cfg.p12Base64.length > 0),
          p12Filename: cfg.p12Filename || '',
          isActive: cfg.isActive !== false,
        },
      });
    } catch (error: any) {
      console.error('Error fetching SRI config:', error);
      res.status(500).json({ error: error.message || 'Error al obtener configuración fiscal del SRI' });
    }
  });

  app.post('/api/sri/config', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const {
        ruc,
        estadoRuc,
        razonSocial,
        nombreComercial,
        estab,
        ptoEmi,
        dirMatriz,
        obligadoContabilidad,
        contribuyenteEspecial,
        regimenRimpe,
        ambiente,
        p12Base64,
        p12Password,
        p12Filename,
        lastFacturaSecuencial,
        lastNotaCreditoSecuencial,
        lastNotaDebitoSecuencial,
        lastGuiaRemisionSecuencial,
        lastRetencionSecuencial,
        lastLiquidacionSecuencial,
        isActive,
      } = req.body;

      const updated = await saveSriConfig(req.dbUserId || 1, {
        ruc,
        estadoRuc,
        razonSocial,
        nombreComercial,
        estab,
        ptoEmi,
        dirMatriz,
        obligadoContabilidad,
        contribuyenteEspecial,
        regimenRimpe,
        ambiente,
        p12Base64,
        p12Password,
        p12Filename,
        lastFacturaSecuencial,
        lastNotaCreditoSecuencial,
        lastNotaDebitoSecuencial,
        lastGuiaRemisionSecuencial,
        lastRetencionSecuencial,
        lastLiquidacionSecuencial,
        isActive,
      });

      res.json({
        success: true,
        message: 'Configuración fiscal del SRI guardada exitosamente',
        config: {
          id: updated.id,
          ruc: updated.ruc,
          razonSocial: updated.razonSocial,
          ambiente: updated.ambiente,
          lastFacturaSecuencial: updated.lastFacturaSecuencial,
          lastNotaCreditoSecuencial: updated.lastNotaCreditoSecuencial,
          lastNotaDebitoSecuencial: updated.lastNotaDebitoSecuencial,
          lastGuiaRemisionSecuencial: updated.lastGuiaRemisionSecuencial,
          lastRetencionSecuencial: updated.lastRetencionSecuencial,
          lastLiquidacionSecuencial: updated.lastLiquidacionSecuencial,
          hasP12Certificate: Boolean(updated.p12Base64 && updated.p12Base64.length > 0),
        },
      });
    } catch (error: any) {
      console.error('Error saving SRI config:', error);
      res.status(400).json({ error: error.message || 'Error al guardar configuración fiscal del SRI' });
    }
  });

  app.get('/api/sri/facturas', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const records = await getSriInvoicesByUser(req.dbUserId || 1);
      res.json({ success: true, invoices: records });
    } catch (error: any) {
      console.error('Error listing SRI invoices:', error);
      res.status(500).json({ error: error.message || 'Error al obtener lista de facturas del SRI' });
    }
  });

  app.get('/api/sri/facturas/:id/xml', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const records = await getSriInvoicesByUser(req.dbUserId || 1);
      const invoice = records.find((inv: any) => inv.id === id);

      if (!invoice) {
        return res.status(404).json({ error: 'Factura no encontrada' });
      }

      const xmlContent = invoice.xmlFirmado || invoice.xmlGenerado || '';
      if (!xmlContent) {
        return res.status(404).json({ error: 'Contenido XML no disponible para este comprobante' });
      }

      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="Factura_${invoice.claveAcceso}.xml"`);
      return res.send(xmlContent);
    } catch (error: any) {
      console.error('Error downloading SRI invoice XML:', error);
      res.status(500).json({ error: error.message || 'Error al descargar XML' });
    }
  });

  app.get('/api/sri/facturas/:id/ride', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const records = await getSriInvoicesByUser(req.dbUserId || 1);
      const invoice = records.find((inv: any) => inv.id === id);

      if (!invoice) {
        return res.status(404).send('Factura no encontrada');
      }

      const sriConfig = await getSriConfig(req.dbUserId || 1);
      const storeConfig = await getStoreConfig(req.dbUserId || 1);

      const html = generateSriRideHtml({
        invoice,
        sriConfig,
        storeConfig: storeConfig as any,
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    } catch (error: any) {
      console.error('Error generating SRI invoice RIDE:', error);
      res.status(500).send(`Error al generar RIDE: ${error.message || error}`);
    }
  });

  app.post('/api/sri/emitir/:orderId', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const orderId = parseInt(req.params.orderId, 10);
      if (isNaN(orderId)) {
        return res.status(400).json({ error: 'ID de orden inválido' });
      }

      const orders = await getCustomerOrders(req.dbUserId || 1);
      const order = orders.find((o: any) => o.id === orderId);
      if (!order) {
        return res.status(404).json({ error: `No se encontró la orden de venta con ID #${orderId}` });
      }

      // Check if invoice already issued
      const existingInvoice = await getSriInvoiceByOrderId(orderId);
      if (existingInvoice && existingInvoice.estadoAutorizacion === 'AUTORIZADO') {
        return res.status(400).json({
          error: `Esta orden ya posee la Factura Electrónica SRI Autorizada #${existingInvoice.secuencial}`,
          invoice: existingInvoice,
        });
      }

      const cfg = await getSriConfig(req.dbUserId || 1);
      const { forceSimulated } = req.body || {};

      // Determine buyer identification type
      let cleanId = (order.customerCi || '').trim();
      let tipoId: '04' | '05' | '06' | '07' | '08' = '07'; // Default Consumidor Final

      if (cleanId.length === 13) {
        tipoId = '04'; // RUC
      } else if (cleanId.length === 10) {
        tipoId = '05'; // Cedula
      } else if (cleanId && cleanId.toUpperCase() !== '9999999999999') {
        tipoId = '06'; // Pasaporte / Otro
      } else {
        tipoId = '07'; // Consumidor Final
        cleanId = '9999999999999';
      }

      // Parse order items into SRI DetalleFactura
      let orderItems: any[] = [];
      try {
        orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items || [];
      } catch {
        orderItems = [];
      }

      if (orderItems.length === 0) {
        orderItems = [
          {
            name: `Pedido de Venta #${order.orderNumber}`,
            quantity: 1,
            price: Number(order.totalAmount || 0),
          },
        ];
      }

      const userInventoryItems = await getInventoryItems(req.dbUserId || 1);

      const isOrderCardPayment = Boolean(
        (order as any).isCardPayment ||
        (order.paymentMethod && ((order.paymentMethod as string).toLowerCase().includes('tarjeta') || (order.paymentMethod as string).toLowerCase().includes('payphone') || (order.paymentMethod as string).toLowerCase().includes('card'))) ||
        ((order as any).cardCommissionPercent && Number((order as any).cardCommissionPercent) > 0)
      );
      const orderCardCommissionPct = Number((order as any).cardCommissionPercent || 5.75);

      const detalles: any[] = orderItems.map((item: any, idx: number) => {
        const cant = Number(item.quantity || item.qty || 1);
        const rawPrice = Number(item.price || item.unitPrice || item.salePrice || 0);
        const desc = Number(item.discount || 0);

        const itemId = item.inventoryItemId || item.id;
        const matchedInvItem = userInventoryItems.find((inv: any) =>
          (itemId && inv.id === Number(itemId)) ||
          (item.sku && inv.sku === item.sku) ||
          (item.name && inv.name === item.name)
        );

        let tarifaIvaStr = '15';
        if (item.tarifaIva === 'NoObjeto' || item.tarifaIva === 'Exento') {
          tarifaIvaStr = item.tarifaIva;
        } else {
          const taxPct = extractItemTaxPercent(item, 15, matchedInvItem);
          tarifaIvaStr = String(taxPct);
        }

        const calculatedRow = calculateLineItem({
          id: item.id,
          name: item.name,
          sku: item.sku,
          unitSalePrice: rawPrice,
          discount: desc,
          quantity: cant,
          applySaleTax: tarifaIvaStr !== '0' && tarifaIvaStr !== 'NoObjeto' && tarifaIvaStr !== 'Exento',
          saleTaxPercent: Number(tarifaIvaStr) || 15,
          isCardPayment: isOrderCardPayment,
          cardCommissionPercent: isOrderCardPayment ? orderCardCommissionPct : 0,
        });

        return {
          codigoPrincipal: item.sku || (matchedInvItem ? matchedInvItem.sku : `PROD-${idx + 1}`),
          descripcion: item.name || item.productName || (matchedInvItem ? matchedInvItem.name : `Producto #${idx + 1}`),
          cantidad: cant,
          precioUnitario: calculatedRow.unitPriceWithoutTax,
          descuento: calculatedRow.unitDiscount,
          tarifaIva: tarifaIvaStr,
        };
      });

      // Sequential and date
      const secuencial = await getNextSriSecuencial('01', req.dbUserId || 1);
      const fechaEmision = req.body?.fechaEmision ? getEcuadorLocalDate(req.body.fechaEmision) : getEcuadorLocalDate();
      const codigoNumerico = Math.floor(10000000 + Math.random() * 90000000).toString();

      const emisor = {
        ruc: cfg.ruc || '1700000000001',
        razonSocial: cfg.razonSocial || 'COMERXIA E-COMMERCE S.A.',
        nombreComercial: cfg.nombreComercial || 'COMERXIA ECUADOR',
        estab: (cfg.estab || '001').padStart(3, '0'),
        ptoEmi: (cfg.ptoEmi || '001').padStart(3, '0'),
        secuencial,
        dirMatriz: cfg.dirMatriz || 'Quito, Ecuador',
        obligadoContabilidad: (cfg.obligadoContabilidad || 'NO') as 'SI' | 'NO',
        contribuyenteEspecial: cfg.contribuyenteEspecial || undefined,
        regimenRimpe: cfg.regimenRimpe || 'NO',
      };

      const comprador = {
        tipoIdentificacionComprador: tipoId,
        razonSocialComprador: order.customerName || 'CONSUMIDOR FINAL',
        identificacionComprador: cleanId,
        direccionComprador: order.customerAddress || 'Ecuador',
        correoComprador: ((order as any).customerEmail || '').trim(),
      };

      const pagos = [
        {
          formaPago: isOrderCardPayment ? '19' : '01', // '19' = Tarjeta de Crédito, '01' = Sin utilización del sistema financiero
          total: Number(order.totalAmount || 0),
        },
      ];

      const facturaPayload = {
        emisor,
        comprador,
        detalles,
        pagos,
        fechaEmision,
      };

      const ambiente = (cfg.ambiente || '1') as '1' | '2';
      const claveAcceso = generarClaveAcceso({
        fechaEmision,
        tipoComprobante: '01',
        ruc: emisor.ruc,
        ambiente,
        estab: emisor.estab,
        ptoEmi: emisor.ptoEmi,
        secuencial,
        codigoNumerico,
        tipoEmision: '1',
      });

      const xmlRaw = generarFacturaXml(facturaPayload as any, claveAcceso, ambiente);

      const useSimulation = Boolean(forceSimulated || !cfg.hasP12Certificate || !cfg.p12Base64);
      let xmlFirmado = '';
      let estadoRecepcion = 'PENDIENTE';
      let estadoAutorizacion = 'PENDIENTE';
      let fechaAutorizacion = null;
      let numeroAutorizacion = null;
      let mensajesRecepcion: any[] = [];
      let mensajesAutorizacion: any[] = [];

      if (useSimulation) {
        // --- SIMULATED SANDBOX EMISSION ---
        xmlFirmado = generarFirmaSimuladaXml(xmlRaw);
        estadoRecepcion = 'RECIBIDA';
        estadoAutorizacion = 'AUTORIZADO';
        fechaAutorizacion = new Date().toISOString();
        numeroAutorizacion = claveAcceso;
        mensajesAutorizacion = [
          {
            identificador: '1',
            mensaje: 'AUTORIZADO (MODO SIMULADO / SANDBOX)',
            informacionAdicional: 'Comprobante procesado exitosamente por el simulador nativo de pruebas SRI de Comerxia.',
            tipo: 'INFORMATIVO',
          },
        ];
      } else {
        // --- REAL XAdES-BES SIGNING AND SRI WEBSERVICE SUBMISSION ---
        const p12Buffer = Buffer.from(cfg.p12Base64, 'base64');
        xmlFirmado = firmarFacturaXml(xmlRaw, p12Buffer, cfg.p12Password || '');
        const xmlBase64 = Buffer.from(xmlFirmado).toString('base64');

        // 1. Reception SOAP call
        const receptionSoapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">
   <soapenv:Header/>
   <soapenv:Body>
      <ec:validarComprobante>
         <xml>${xmlBase64}</xml>
      </ec:validarComprobante>
   </soapenv:Body>
</soapenv:Envelope>`;

        const receptionUrl = ambiente === '2' ? SRI_ENDPOINTS.RECEPCION.PRODUCCION : SRI_ENDPOINTS.RECEPCION.PRUEBAS;
        const receptionResponse = await postSoapRequest(receptionUrl, receptionSoapEnvelope);
        const receptionText = receptionResponse.text;

        if (!receptionResponse.ok) {
          const soapFaultMatch = receptionText.match(/<faultstring>([^<]+)<\/faultstring>/) || receptionText.match(/<message>([^<]+)<\/message>/);
          const faultDetail = soapFaultMatch ? soapFaultMatch[1] : 'Error SOAP o de red';
          throw new Error(`Error en servicio de Recepción SRI: ${faultDetail}`);
        }

        const estadoMatch = receptionText.match(/<estado>([^<]+)<\/estado>/);
        estadoRecepcion = estadoMatch ? estadoMatch[1] : 'ERROR';
        mensajesRecepcion = parseSriMensajes(receptionText);

        if (estadoRecepcion === 'RECIBIDA') {
          // Wait 1.5 seconds before querying authorization
          await new Promise((r) => setTimeout(r, 1500));

          const authorizationSoapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
   <soapenv:Header/>
   <soapenv:Body>
      <ec:autorizacionComprobante>
         <claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante>
      </ec:autorizacionComprobante>
   </soapenv:Body>
</soapenv:Envelope>`;

          const authorizationUrl = ambiente === '2' ? SRI_ENDPOINTS.AUTORIZACION.PRODUCCION : SRI_ENDPOINTS.AUTORIZACION.PRUEBAS;
          const authResponse = await postSoapRequest(authorizationUrl, authorizationSoapEnvelope);
          const authText = authResponse.text;

          const authEstadoMatch = authText.match(/<estado>([^<]+)<\/estado>/);
          estadoAutorizacion = authEstadoMatch ? authEstadoMatch[1] : 'NO AUTORIZADO';

          const fechaAuthMatch = authText.match(/<fechaAutorizacion>([^<]+)<\/fechaAutorizacion>/);
          fechaAutorizacion = fechaAuthMatch ? fechaAuthMatch[1] : new Date().toISOString();

          const numAuthMatch = authText.match(/<numeroAutorizacion>([^<]+)<\/numeroAutorizacion>/);
          numeroAutorizacion = numAuthMatch ? numAuthMatch[1] : claveAcceso;

          mensajesAutorizacion = parseSriMensajes(authText);
        } else {
          estadoAutorizacion = 'DEVUELTA';
        }
      }

      // Determine overall authorization status and motif
      const isAutorizado = estadoAutorizacion === 'AUTORIZADO' || estadoAutorizacion === 'SIMULADO_OK';
      const isDevuelto = estadoRecepcion === 'DEVUELTA' || estadoAutorizacion === 'DEVUELTA' || estadoAutorizacion === 'NO AUTORIZADO' || estadoRecepcion === 'ERROR';

      const statusLabel = isAutorizado
        ? 'AUTORIZADO'
        : isDevuelto
        ? 'DEVUELTO'
        : estadoAutorizacion || estadoRecepcion || 'DESCONOCIDO';

      const allMessages = [...mensajesRecepcion, ...mensajesAutorizacion];
      let motivoDetalle = '';

      if (allMessages.length > 0) {
        motivoDetalle = allMessages
          .map((m: any) => {
            const parts = [];
            if (m.identificador) parts.push(`Código [${m.identificador}]`);
            if (m.mensaje) parts.push(m.mensaje);
            if (m.informacionAdicional) parts.push(`(${m.informacionAdicional})`);
            return parts.join(': ');
          })
          .join(' | ');
      } else if (!isAutorizado) {
        motivoDetalle = `El comprobante fue rechazado/devuelto por el SRI con estado: ${estadoAutorizacion || estadoRecepcion}`;
      }

      const invoiceRecord = await createSriInvoice({
        userId: req.dbUserId || 1,
        orderId: order.id,
        orderNumber: order.orderNumber,
        secuencial,
        claveAcceso,
        ambiente,
        customerName: comprador.razonSocialComprador,
        customerCiRuc: comprador.identificacionComprador,
        totalAmount: String(order.totalAmount || '0.00'),
        estadoRecepcion,
        estadoAutorizacion,
        fechaAutorizacion,
        numeroAutorizacion,
        xmlGenerado: xmlRaw,
        xmlFirmado,
        mensajesSri: JSON.stringify(allMessages),
      });

      // Update lastFacturaSecuencial in sriConfig ONLY if invoice is AUTORIZADO
      const secNum = parseInt(secuencial, 10);
      if (isAutorizado && !isNaN(secNum) && secNum > Number(cfg.lastFacturaSecuencial || 0)) {
        await saveSriConfig(req.dbUserId || 1, { lastFacturaSecuencial: secNum });
      }

      // Auto-send email to customer if invoice is AUTORIZADO, NOT Consumidor Final, and has a valid customer email
      let emailEnviado = false;
      const isConsumidorFinal = tipoId === '07' || cleanId === '9999999999999' || (order.customerName || '').toUpperCase().includes('CONSUMIDOR FINAL');
      const rawCustomerEmail = comprador.correoComprador;
      const hasValidCustomerEmail = rawCustomerEmail && rawCustomerEmail.trim() !== '' && rawCustomerEmail.includes('@') && rawCustomerEmail.toLowerCase() !== 'ventas@comerxia.com';

      if (isAutorizado && !isConsumidorFinal && hasValidCustomerEmail) {
        try {
          const storeCfg = await getStoreConfig(req.dbUserId || 1).catch(() => null);
          const rideHtml = generateSriRideHtml({ invoice: invoiceRecord as any, sriConfig: cfg, storeConfig: storeCfg as any });
          const ridePdfBuffer = await generateSriRidePdfBuffer({ invoice: invoiceRecord as any, sriConfig: cfg, storeConfig: storeCfg as any });
          await sendInvoiceEmail({
            to: rawCustomerEmail,
            customerName: comprador.razonSocialComprador,
            secuencial,
            claveAcceso,
            numeroAutorizacion: numeroAutorizacion || claveAcceso,
            fechaAutorizacion: fechaAutorizacion || undefined,
            totalAmount: order.totalAmount,
            xmlContent: xmlFirmado || xmlRaw,
            rideHtml,
            ridePdfBuffer,
            userId: req.dbUserId || 1,
            estab: emisor.estab,
            ptoEmi: emisor.ptoEmi,
          });
          emailEnviado = true;
        } catch (emailErr) {
          console.warn('⚠️ No se pudo enviar el correo automático de la factura al cliente:', emailErr);
        }
      }

      res.json({
        success: isAutorizado,
        estado: statusLabel,
        estadoAutorizacion,
        estadoRecepcion,
        autorizado: isAutorizado,
        devuelto: isDevuelto,
        motivo: motivoDetalle,
        message: isAutorizado
          ? `✓ Factura SRI #${secuencial} AUTORIZADA exitosamente`
          : `❌ Factura SRI #${secuencial} DEVUELTA / NO AUTORIZADA: ${motivoDetalle}`,
        emisorUsado: {
          ruc: emisor.ruc,
          razonSocial: emisor.razonSocial,
          nombreComercial: emisor.nombreComercial,
          estab: emisor.estab,
          ptoEmi: emisor.ptoEmi,
          secuencial: emisor.secuencial,
          dirMatriz: emisor.dirMatriz,
          obligadoContabilidad: emisor.obligadoContabilidad,
          ambiente,
        },
        simulated: useSimulation,
        emailEnviado,
        invoice: invoiceRecord,
        mensajesSri: allMessages,
      });
    } catch (error: any) {
      console.error('Error emitting SRI invoice:', error);
      res.status(500).json({ error: error.message || 'Error al emitir factura electrónica SRI' });
    }
  });

  // Manual SRI Invoice Email Sending Route
  app.post('/api/sri/invoices/:id/send-email', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const invoiceId = parseInt(req.params.id, 10);
      if (isNaN(invoiceId)) {
        return res.status(400).json({ error: 'ID de factura inválido' });
      }

      const userId = req.dbUserId || 1;
      const userInvoices = await getSriInvoicesByUser(userId);
      const invoice = userInvoices.find((inv: any) => inv.id === invoiceId);

      if (!invoice) {
        return res.status(404).json({ error: 'Factura no encontrada' });
      }

      const targetEmail = (req.body?.email || invoice.customerEmail || '').trim();
      if (!targetEmail || !targetEmail.includes('@')) {
        return res.status(400).json({ error: 'El cliente no tiene una dirección de correo electrónico válida para el envío.' });
      }

      const cfg = await getSriConfig(userId);
      const storeCfg = await getStoreConfig(userId).catch(() => null);
      const rideHtml = generateSriRideHtml({ invoice, sriConfig: cfg, storeConfig: storeCfg as any });
      const ridePdfBuffer = await generateSriRidePdfBuffer({ invoice, sriConfig: cfg, storeConfig: storeCfg as any });

      await sendInvoiceEmail({
        to: targetEmail,
        customerName: invoice.customerName || 'Cliente',
        secuencial: invoice.secuencial,
        claveAcceso: invoice.claveAcceso,
        numeroAutorizacion: invoice.numeroAutorizacion || invoice.claveAcceso,
        fechaAutorizacion: invoice.fechaAutorizacion || undefined,
        totalAmount: invoice.totalAmount || 0,
        xmlContent: invoice.xmlFirmado || invoice.xmlGenerado || '',
        rideHtml,
        ridePdfBuffer,
        userId,
        estab: (cfg.estab || '001').padStart(3, '0'),
        ptoEmi: (cfg.ptoEmi || '001').padStart(3, '0'),
      });

      res.json({
        success: true,
        message: `✓ Factura SRI #${invoice.secuencial} enviada exitosamente a ${targetEmail}`,
      });
    } catch (error: any) {
      console.error('Error al enviar la factura por correo:', error);
      res.status(500).json({ error: error.message || 'Error al enviar la factura electrónica por correo' });
    }
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
  });

  // 2. Inventory Stats
  app.get('/api/stats', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const stats = await getInventoryStats(req.dbUserId);
      res.json(stats);
    } catch (error: any) {
      console.error('Failed to get stats:', error);
      res.status(500).json({ error: error.message || 'Error fetching stats' });
    }
  });

  // 3. Inventory List & CRUD
  app.get('/api/inventory', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const search = req.query.search as string;
      const category = req.query.category as string;
      const status = req.query.status as string;
      const supplier = req.query.supplier as string;

      const items = await getInventoryItems(req.dbUserId, { search, category, status, supplier });
      res.json(items);
    } catch (error: any) {
      console.error('Failed to fetch inventory:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch inventory items' });
    }
  });

  app.get('/api/inventory/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID' });
      }
      const item = await getInventoryItemById(id);
      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }
      res.json(item);
    } catch (error: any) {
      console.error('Failed to fetch item:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch item' });
    }
  });

  app.post('/api/inventory', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const {
        name,
        sku,
        barcode,
        description,
        category,
        costPrice,
        costWithoutTax,
        costWithTax,
        taxRate,
        salePrice,
        discountPercent,
        stock,
        imageUrl,
        supplierName,
        tags,
        extractedAttributes,
        status,
      } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const finalSku = sku?.trim()
        ? sku.trim()
        : await generateNextSku(supplierName || 'PF');

      const item = await createInventoryItem({
        userId: req.dbUserId || 1,
        name,
        sku: finalSku,
        barcode: barcode?.trim() || null,
        description,
        category: category || 'General',
        costPrice: String(costPrice || '0.00'),
        costWithoutTax: costWithoutTax !== undefined ? String(costWithoutTax) : undefined,
        costWithTax: costWithTax !== undefined ? String(costWithTax) : undefined,
        taxRate: taxRate !== undefined ? String(taxRate) : undefined,
        salePrice: String(salePrice || '0.00'),
        discountPercent: Number(discountPercent) || 0,
        stock: 0, // Initial stock is 0; stock can strictly ONLY be entered via Purchases
        imageUrl,
        supplierName,
        tags: Array.isArray(tags) ? tags.join(', ') : tags,
        extractedAttributes:
          typeof extractedAttributes === 'object'
            ? JSON.stringify(extractedAttributes)
            : extractedAttributes,
        status: status || 'available',
      });

      res.status(201).json(item);
    } catch (error: any) {
      console.error('Failed to create item:', error);
      res.status(500).json({ error: error.message || 'Failed to create inventory item' });
    }
  });

  app.put('/api/inventory/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID' });
      }

      // Strip manual stock modifications: stock can strictly ONLY be modified via Purchases or Orders
      const updatePayload = { ...req.body };
      delete updatePayload.stock;

      const updated = await updateInventoryItem(id, updatePayload);
      res.json(updated);
    } catch (error: any) {
      console.error('Failed to update item:', error);
      res.status(500).json({ error: error.message || 'Failed to update item' });
    }
  });

  app.get('/api/inventory/:id/check-delete', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID' });
      }

      const check = await checkProductSalesAndPurchasesLink(id);
      res.json(check);
    } catch (error: any) {
      console.error('Failed to check product delete status:', error);
      res.status(500).json({ error: error.message || 'Failed to check delete status' });
    }
  });

  app.post('/api/inventory/bulk-delete', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Array of item IDs is required' });
      }

      const numericIds = ids.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
      const result = await deleteBulkInventoryItems(numericIds);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to bulk delete items:', error);
      const statusCode = error.code === 'ALL_PRODUCTS_LINKED' ? 400 : 500;
      res.status(statusCode).json({
        error: error.message || 'Failed to bulk delete items',
        code: error.code,
        blocked: error.blocked,
      });
    }
  });

  app.delete('/api/inventory/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID' });
      }

      const result = await deleteInventoryItem(id);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to delete item:', error);
      const statusCode = error.code === 'PRODUCT_LINKED_TO_TRANSACTIONS' ? 400 : 500;
      res.status(statusCode).json({
        error: error.message || 'Failed to delete item',
        code: error.code,
        details: error.details,
      });
    }
  });

  // 4. Telegram Messages Log
  app.get('/api/messages', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const messages = await getTelegramMessages(req.dbUserId);
      res.json(messages);
    } catch (error: any) {
      console.error('Failed to fetch telegram messages:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch messages' });
    }
  });

  app.delete('/api/messages/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid message ID' });
      }

      const result = await deleteTelegramMessage(id);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to delete telegram message:', error);
      res.status(500).json({ error: error.message || 'Failed to delete message' });
    }
  });

  app.post('/api/messages/bulk-delete', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Array of message IDs is required' });
      }

      const numericIds = ids.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
      const result = await deleteBulkTelegramMessages(numericIds);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to bulk delete telegram messages:', error);
      res.status(500).json({ error: error.message || 'Failed to bulk delete messages' });
    }
  });

  app.post('/api/messages/clear', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const result = await clearAllTelegramMessages(req.dbUserId);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to clear telegram messages:', error);
      res.status(500).json({ error: error.message || 'Failed to clear messages' });
    }
  });

  // 5. Telegram Configuration
  app.get('/api/telegram/config', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const config = await getTelegramConfig(req.dbUserId || 1);
      const runtime = getBotRuntimeStatus();
      res.json({
        ...config,
        botUsername: config.botUsername || runtime.botInfo?.username || null,
        botFirstName: config.botFirstName || runtime.botInfo?.first_name || null,
      });
    } catch (error: any) {
      console.error('Failed to get config:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch config' });
    }
  });

  app.post('/api/telegram/config', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.dbUserId || 1;
      const updated = await updateTelegramConfig(userId, req.body);

      // Start/restart background Telegram polling worker with the new token if active
      if (updated.botToken && updated.botToken.trim() && updated.isActive !== false) {
        process.env.TELEGRAM_BOT_TOKEN = updated.botToken.trim();
        startTelegramPolling(updated.botToken.trim(), userId);
      } else {
        stopTelegramPolling();
        if (!updated.botToken || !updated.botToken.trim()) {
          process.env.TELEGRAM_BOT_TOKEN = '';
        }
      }

      res.json(updated);
    } catch (error: any) {
      console.error('Failed to update config:', error);
      res.status(500).json({ error: error.message || 'Failed to update config' });
    }
  });

  // Dedicated endpoint for instant Telegram bot state toggle (Activar / Pausar)
  app.post('/api/telegram/toggle', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.dbUserId || 1;
      const current = await getTelegramConfig(userId);
      const nextActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : !current.isActive;
      const updated = await updateTelegramConfig(userId, { isActive: nextActive });

      if (updated.botToken && updated.botToken.trim() && updated.isActive !== false) {
        process.env.TELEGRAM_BOT_TOKEN = updated.botToken.trim();
        startTelegramPolling(updated.botToken.trim(), userId);
      } else {
        stopTelegramPolling();
      }

      res.json({
        success: true,
        isActive: updated.isActive !== false,
        message: updated.isActive !== false ? 'Bot de Telegram activado' : 'Bot de Telegram pausado',
        config: updated,
      });
    } catch (error: any) {
      console.error('Failed to toggle telegram bot:', error);
      res.status(500).json({ error: error.message || 'Failed to toggle bot status' });
    }
  });

  // 6. Test Telegram Bot Connection & Status
  app.get('/api/telegram/status', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.dbUserId || 1;
      const config = await getTelegramConfig(userId);
      const runtime = getBotRuntimeStatus();

      // Self-healing: if configuration says bot is paused but runtime worker is still running, shut it down
      if (config.isActive === false && runtime.pollingActive) {
        stopTelegramPolling();
      }

      res.json({
        ...runtime,
        pollingActive: config.isActive !== false && runtime.pollingActive,
        isActive: config.isActive !== false,
        configuredToken: Boolean(config.botToken || process.env.TELEGRAM_BOT_TOKEN),
        botUsername: runtime.botInfo?.username || config.botUsername || null,
        botFirstName: runtime.botInfo?.first_name || config.botFirstName || null,
        supplierName: config.supplierName,
        defaultMarginPercent: config.defaultMarginPercent,
        currency: config.currency,
        defaultStockEnabled: Boolean(config.defaultStockEnabled),
        defaultStockQuantity: Number(config.defaultStockQuantity ?? 10),
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to get bot status' });
    }
  });

  app.post('/api/telegram/sync-updates', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.dbUserId || 1;
      const config = await getTelegramConfig(userId);
      if (!config || config.isActive === false) {
        return res.status(400).json({
          error: 'El bot de Telegram está en pausa. Actívalo en la configuración para procesar mensajes.',
          isActive: false,
        });
      }

      const token = req.body?.botToken || config.botToken || process.env.TELEGRAM_BOT_TOKEN;

      if (!token) {
        return res.status(400).json({ error: 'No Bot Token configured' });
      }

      const syncResult = await syncTelegramUpdatesOnce(token, userId);
      res.json(syncResult);
    } catch (error: any) {
      console.error('Failed to sync updates:', error);
      res.status(500).json({ error: error.message || 'Failed to sync updates' });
    }
  });

  app.post('/api/telegram/test-bot', async (req: Request, res: Response) => {
    try {
      const { botToken } = req.body;
      const token = botToken || process.env.TELEGRAM_BOT_TOKEN;

      if (!token) {
        return res.status(400).json({ error: 'Bot Token is required' });
      }

      const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await resp.json();

      if (!data.ok) {
        return res.status(400).json({ error: data.description || 'Invalid Telegram Bot token' });
      }

      // Check user configuration: ONLY start polling if the bot is actually ACTIVE!
      const currentConfig = await getTelegramConfig(1);
      await updateTelegramConfig(1, {
        botUsername: data.result?.username || null,
        botFirstName: data.result?.first_name || null,
      });

      if (currentConfig && currentConfig.isActive !== false) {
        startTelegramPolling(token, 1);
      } else {
        stopTelegramPolling();
      }

      res.json({
        success: true,
        bot: data.result,
        botUsername: data.result?.username || null,
        botFirstName: data.result?.first_name || null,
        isActive: currentConfig?.isActive !== false,
      });
    } catch (error: any) {
      console.error('Error testing bot:', error);
      res.status(500).json({ error: error.message || 'Failed to communicate with Telegram API' });
    }
  });

  // 7. Setup Live Webhook
  app.post('/api/telegram/set-webhook', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { botToken } = req.body;
      const token = botToken || process.env.TELEGRAM_BOT_TOKEN;

      if (!token) {
        return res.status(400).json({ error: 'Bot Token is required' });
      }

      const appUrl = process.env.APP_URL || 'https://' + req.get('host');
      const webhookUrl = `${appUrl}/api/telegram/webhook`;

      const resp = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message', 'channel_post'],
        }),
      });

      const data = await resp.json();
      if (!data.ok) {
        return res.status(400).json({ error: data.description || 'Failed to set webhook' });
      }

      if (req.dbUserId) {
        await updateTelegramConfig(req.dbUserId, { botToken: token });
      }

      res.json({ success: true, webhookUrl, telegramResponse: data.result });
    } catch (error: any) {
      console.error('Error setting webhook:', error);
      res.status(500).json({ error: error.message || 'Failed to set webhook' });
    }
  });

  // 7b. Google Gemini AI Configuration & Testing
  app.get('/api/ai/config', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const config = await getAiConfig(req.dbUserId || 1);
      const activeKey = config.apiKey || process.env.GEMINI_API_KEY || '';
      let activeModel = config.modelName || 'gemini-3.6-flash';
      if (
        activeModel.includes('gemini-2.5') ||
        activeModel.includes('gemini-2.0') ||
        activeModel.includes('gemini-1.5') ||
        activeModel.includes('gemini-3.7')
      ) {
        activeModel = 'gemini-3.6-flash';
      }

      const defaultEmail = (config as any).accountEmail || req.user?.email || 'jrmr93@gmail.com';

      res.json({
        id: config.id,
        apiKey: activeKey,
        hasKey: isValidGeminiApiKey(activeKey),
        accountEmail: defaultEmail,
        modelName: activeModel,
        temperature: Number(config.temperature) || 0.2,
        isActive: config.isActive !== false,
        provider: (config as any).provider || 'google',
        localEndpoint: (config as any).localEndpoint || 'http://localhost:1234/v1',
        localModelName: (config as any).localModelName || 'qwen2.5-coder-7b-instruct',
      });
    } catch (error: any) {
      console.error('Failed to get AI config:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch AI config' });
    }
  });

  // Dedicated endpoint for instant Google Gemini AI state toggle (Activar / Pausar)
  app.post('/api/ai/toggle', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.dbUserId || 1;
      const current = await getAiConfig(userId);
      const nextActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : !current.isActive;
      const updated = await updateAiConfig(userId, { isActive: nextActive });

      res.json({
        success: true,
        isActive: updated.isActive !== false,
        message: updated.isActive !== false ? 'Motor de IA Gemini activado' : 'Motor de IA Gemini pausado',
        config: updated,
      });
    } catch (error: any) {
      console.error('Failed to toggle AI status:', error);
      res.status(500).json({ error: error.message || 'Failed to toggle AI status' });
    }
  });

  app.post('/api/ai/config', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.dbUserId || 1;
      const { apiKey, modelName, temperature, isActive, accountEmail, provider, localEndpoint, localModelName } = req.body;
      let targetModel = modelName || 'gemini-3.6-flash';
      if (
        targetModel.includes('gemini-2.5') ||
        targetModel.includes('gemini-2.0') ||
        targetModel.includes('gemini-1.5') ||
        targetModel.includes('gemini-3.7')
      ) {
        targetModel = 'gemini-3.6-flash';
      }

      const updated = await updateAiConfig(userId, {
        apiKey: apiKey !== undefined ? apiKey : undefined,
        accountEmail: accountEmail !== undefined ? accountEmail : undefined,
        modelName: targetModel,
        temperature: temperature !== undefined ? Number(temperature) : 0.2,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        provider: provider !== undefined ? provider : undefined,
        localEndpoint: localEndpoint !== undefined ? localEndpoint : undefined,
        localModelName: localModelName !== undefined ? localModelName : undefined,
      } as any);

      if (apiKey !== undefined) {
        setCustomAiApiKey(apiKey);
        if (apiKey && apiKey.trim().length > 0) {
          process.env.GEMINI_API_KEY = apiKey.trim();
        }
      }

      let resModel = updated.modelName || 'gemini-3.6-flash';
      if (
        resModel.includes('gemini-2.5') ||
        resModel.includes('gemini-2.0') ||
        resModel.includes('gemini-1.5') ||
        resModel.includes('gemini-3.7')
      ) {
        resModel = 'gemini-3.6-flash';
      }

      res.json({
        id: updated.id,
        apiKey: updated.apiKey || process.env.GEMINI_API_KEY || '',
        hasKey: isValidGeminiApiKey(updated.apiKey || process.env.GEMINI_API_KEY),
        accountEmail: (updated as any).accountEmail || accountEmail || 'jrmr93@gmail.com',
        modelName: resModel,
        temperature: Number(updated.temperature) || 0.2,
        isActive: updated.isActive !== false,
        provider: (updated as any).provider || provider || 'google',
        localEndpoint: (updated as any).localEndpoint || localEndpoint || 'http://localhost:1234/v1',
        localModelName: (updated as any).localModelName || localModelName || 'qwen2.5-coder-7b-instruct',
      });
    } catch (error: any) {
      console.error('Failed to update AI config:', error);
      res.status(500).json({ error: error.message || 'Failed to update AI config' });
    }
  });

  app.post('/api/ai/test-key', async (req: Request, res: Response) => {
    try {
      const { apiKey, modelName } = req.body;
      const result = await testGeminiApiKey(apiKey, modelName || 'gemini-3.6-flash');
      res.json(result);
    } catch (error: any) {
      console.error('Error testing Gemini AI key:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error al validar la clave API de Google AI',
        latencyMs: 0,
      });
    }
  });

  app.post('/api/ai/test-lmstudio', async (req: Request, res: Response) => {
    try {
      const { localEndpoint, localModelName } = req.body;
      const result = await testLmStudioConnection(
        localEndpoint || 'http://localhost:1234/v1',
        localModelName || 'qwen2.5-coder-7b-instruct'
      );
      res.json(result);
    } catch (error: any) {
      console.error('Error testing LM Studio connection:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error al conectar con LM Studio local',
        latencyMs: 0,
      });
    }
  });

  app.post('/api/ai/test-extraction', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { message, photoUrl, marginPercent, currency } = req.body;
      if (!message && !photoUrl) {
        return res.status(400).json({ error: 'Se requiere un mensaje o imagen para probar' });
      }

      const result = await parseSupplierTelegramMessage(
        message || '',
        photoUrl ? [photoUrl] : undefined,
        undefined,
        Number(marginPercent) || 30,
        currency || 'USD',
        15,
        req.body.useAi !== false
      );

      res.json({ success: true, result });
    } catch (error: any) {
      console.error('Error testing extraction:', error);
      res.status(500).json({ error: error.message || 'Error durante la extracción de prueba' });
    }
  });

  app.post('/api/inventory/:id/reparse-ai', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const itemId = Number(req.params.id);
      if (!itemId || isNaN(itemId)) {
        return res.status(400).json({ error: 'ID de producto inválido' });
      }
      const userId = req.dbUserId || 1;
      const updatedItem = await reparseInventoryItemWithAi(itemId, userId);
      res.json({ success: true, item: updatedItem });
    } catch (error: any) {
      console.error('Error re-parsing product with AI:', error);
      res.status(500).json({ error: error.message || 'Error al re-generar datos con IA' });
    }
  });

  // 8. Simulate / Process incoming supplier message (Interactive UI Simulator & Testing)
  app.post('/api/telegram/simulate-message', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const {
        caption,
        photoBase64,
        photos,
        photoMimeType,
        videoUrl,
        senderName,
        senderUsername,
        profitMarginPercent,
        marginPercent,
      } = req.body;

      // Extract array of photos
      let photosList: string[] = [];
      if (Array.isArray(photos) && photos.length > 0) {
        photosList = photos.filter(Boolean);
      } else if (photoBase64) {
        photosList = [photoBase64];
      }

      if (!caption && photosList.length === 0) {
        return res.status(400).json({ error: 'Either caption or at least one photo is required' });
      }

      const userId = req.dbUserId || 1;
      const config = await getTelegramConfig(userId);

      const effectiveMargin =
        Number(profitMarginPercent || marginPercent) > 0
          ? Number(profitMarginPercent || marginPercent)
          : config.defaultMarginPercent || 30;

      let effectiveSupplier = senderName || config.supplierName || 'Proveedor Telegram';

      // 1b. Fast Duplicate Check: If identical or matching text is already in inventory, prevent duplicate
      if (caption && caption.trim().length >= 10) {
        const duplicateByText = await findExistingInventoryItem({
          rawTelegramMessage: caption,
          supplierName: effectiveSupplier,
        });

        if (duplicateByText) {
          console.log(`[Simulator] Duplicate text detected early: SKU ${duplicateByText.sku} (ID: ${duplicateByText.id})`);

          if (videoUrl && !duplicateByText.videoUrl) {
            await setInventoryItemVideo(duplicateByText.id, videoUrl);
          }

          const messageLog = await createTelegramMessageRecord({
            userId,
            telegramMessageId: `SIM-${Date.now()}`,
            senderName: effectiveSupplier,
            senderUsername: senderUsername || '@proveedor_oficial',
            caption: caption || `(Intento duplicado por texto repetido - ${photosList.length} fotos)`,
            photoUrl: photosList[0] || null,
            processedStatus: 'duplicate',
            extractedData: JSON.stringify({
              duplicateOfSku: duplicateByText.sku,
              duplicateOfName: duplicateByText.name,
              imagesCount: photosList.length,
              hasVideo: Boolean(videoUrl),
              reason: 'identical_or_matching_text',
            }),
            inventoryItemId: duplicateByText.id,
          });

          return res.json({
            success: true,
            isDuplicate: true,
            message: 'Producto ya ingresado (texto idéntico detectado)',
            sku: duplicateByText.sku,
            existingItem: duplicateByText,
            inventoryItem: duplicateByText,
            messageLog,
          });
        }
      }

      // Parse product from supplier photos and caption using Gemini AI Multimodal / parser
      const parsed = await parseSupplierTelegramMessage(
        caption || '',
        photosList,
        photoMimeType || 'image/jpeg',
        effectiveMargin,
        config.currency || 'USD',
        config.taxPercent ?? 15,
        (config as any).useAi !== false
      );

      const primaryPhoto = photosList[0] || null;
      const attributesWithGallery = {
        ...parsed.attributes,
        images: photosList,
        totalPhotos: photosList.length,
        videoUrl: videoUrl || null,
        costOptions: parsed.costOptions || [],
        profitMarginPercent: parsed.profitMarginPercent || effectiveMargin,
        selectedCostPrice: parsed.costPrice,
      };

      // 2. Check for duplicate product
      const existingItem = await findExistingInventoryItem({
        name: parsed.name,
        sku: parsed.sku !== 'AUTO' ? parsed.sku : undefined,
        rawTelegramMessage: caption,
        supplierName: effectiveSupplier,
      });

      if (existingItem) {
        const messageLog = await createTelegramMessageRecord({
          userId,
          telegramMessageId: `SIM-${Date.now()}`,
          senderName: effectiveSupplier,
          senderUsername: senderUsername || '@proveedor_oficial',
          caption: caption || `(Intento duplicado - Lote de ${photosList.length} fotos)`,
          photoUrl: primaryPhoto,
          processedStatus: 'duplicate',
          extractedData: JSON.stringify({ ...parsed, duplicateOfSku: existingItem.sku, imagesCount: photosList.length }),
          inventoryItemId: existingItem.id,
        });

        return res.json({
          success: true,
          isDuplicate: true,
          message: 'Producto ya ingresado',
          sku: existingItem.sku,
          existingItem,
          extracted: parsed,
          inventoryItem: existingItem,
          messageLog,
        });
      }

      // 3. Generate sequential SKU if needed (up to 3 letters of supplier)
      const supplierPrefix = getSupplierSkuPrefix(effectiveSupplier);
      let finalSku = parsed.sku;
      if (!finalSku || finalSku === 'AUTO' || !finalSku.toUpperCase().startsWith(supplierPrefix)) {
        finalSku = await generateNextSku(effectiveSupplier);
        parsed.sku = finalSku;
      }

      // 4. Automatically create inventory item in PostgreSQL
      let inventoryItem = null;
      // Stock is always 0 as required by user
      const effectiveStock = 0;
      parsed.stock = 0;

      if (config.autoApprove !== false) {
        const itemTax = parsed.taxPercent || config.taxPercent || 15;
        const itemWith = parsed.costWithTax ?? parsed.costPrice;
        const itemWithout =
          parsed.costWithoutTax !== undefined && parsed.costWithoutTax !== null
            ? parsed.costWithoutTax
            : itemWith / (1 + itemTax / 100);

        inventoryItem = await createInventoryItem({
          userId,
          name: parsed.name,
          sku: finalSku,
          barcode: parsed.barcode || undefined,
          description: parsed.description,
          category: parsed.category,
          costPrice: String(itemWith.toFixed(2)),
          costWithoutTax: String(Number(itemWithout).toFixed(2)),
          costWithTax: String(itemWith.toFixed(2)),
          taxRate: String(itemTax),
          salePrice: String(parsed.salePrice.toFixed(2)),
          stock: effectiveStock,
          imageUrl: primaryPhoto,
          videoUrl: videoUrl || null,
          supplierName: effectiveSupplier,
          tags: parsed.tags.join(', '),
          extractedAttributes: JSON.stringify(attributesWithGallery),
          status: 'available',
          rawTelegramMessage: caption,
        });
      }

      // 5. Save log in telegram_messages table
      const messageLog = await createTelegramMessageRecord({
        userId,
        telegramMessageId: `SIM-${Date.now()}`,
        senderName: effectiveSupplier,
        senderUsername: senderUsername || '@proveedor_oficial',
        caption: caption || `(Lote de ${photosList.length} fotos)`,
        photoUrl: primaryPhoto,
        processedStatus: 'processed',
        extractedData: JSON.stringify({ ...parsed, sku: finalSku, imagesCount: photosList.length }),
        inventoryItemId: inventoryItem?.id,
      });

      res.json({
        success: true,
        isDuplicate: false,
        sku: finalSku,
        extracted: parsed,
        inventoryItem,
        messageLog,
      });
    } catch (error: any) {
      console.error('Error simulating supplier message:', error);
      res.status(500).json({ error: error.message || 'Error processing supplier message' });
    }
  });

  // 8b. Direct Web URL Product Scrape endpoint (Disabled: only photo reception is allowed)
  app.post('/api/telegram/scrape-url', optionalAuth, async (_req: AuthRequest, res: Response) => {
    return res.status(400).json({
      error: 'La recepción mediante URL está desactivada. Por favor utiliza la opción de fotografía con descripción.',
    });
  });

  // 8b. Select / Switch cost price option and/or update profit margin for a product
  app.post('/api/inventory/:id/select-cost', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const { costPrice, costWithoutTax, costWithTax, profitMarginPercent, salePrice } = req.body;
      const item = await getInventoryItemById(id);
      if (!item) return res.status(404).json({ error: 'Product not found' });

      let parsedAttr: Record<string, any> = {};
      if (item.extractedAttributes) {
        try {
          parsedAttr = JSON.parse(item.extractedAttributes);
        } catch {}
      }

      if (costPrice !== undefined) {
        parsedAttr.selectedCostPrice = Number(costPrice);
      }
      if (profitMarginPercent !== undefined) {
        parsedAttr.profitMarginPercent = Number(profitMarginPercent);
      }

      const newCost = costPrice !== undefined ? String(Number(costPrice).toFixed(2)) : item.costPrice;
      const finalMargin =
        profitMarginPercent !== undefined
          ? Number(profitMarginPercent)
          : Number(parsedAttr.profitMarginPercent) || 30;

      const newSale =
        salePrice !== undefined
          ? String(Number(salePrice).toFixed(2))
          : String((Number(newCost) * (1 + finalMargin / 100)).toFixed(2));

      const effectiveTaxRate = Number((item as any).taxRate) || 15;
      const updatedCostWithout =
        costWithoutTax !== undefined
          ? String(Number(costWithoutTax).toFixed(2))
          : (Number(newCost) / (1 + effectiveTaxRate / 100)).toFixed(2);
      const updatedCostWith =
        costWithTax !== undefined
          ? String(Number(costWithTax).toFixed(2))
          : Number(newCost).toFixed(2);

      const updated = await updateInventoryItem(id, {
        costPrice: newCost,
        costWithoutTax: updatedCostWithout,
        costWithTax: updatedCostWith,
        salePrice: newSale,
        extractedAttributes: JSON.stringify(parsedAttr),
      });

      res.json(updated);
    } catch (error: any) {
      console.error('Error selecting cost option:', error);
      res.status(500).json({ error: error.message || 'Failed to update cost option' });
    }
  });

  // 8c. Generate Multiplatform Marketing Copies using Gemini AI (Marketplace, Instagram, WhatsApp, E-commerce)
  app.post('/api/inventory/:id/generate-copy', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID de producto inválido' });

      const item = await getInventoryItemById(id);
      if (!item) return res.status(404).json({ error: 'Producto no encontrado' });

      const userId = req.dbUserId || 1;
      const storeConfig = await getStoreConfig(userId);

      const {
        tone,
        customPrice,
        cityOrRegion,
        whatsappNumber,
        storeName,
        storeAddress,
        websiteUrl,
        warrantyInfo,
        paymentTitles: customPaymentTitles,
        shippingCompanies: customShippingCompanies,
        showStock,
        showPhone,
        showSku,
        showWebsite,
      } = req.body || {};

      // Parse paymentLogos from storeConfig to extract active payment titles ONLY (no descriptions)
      let extractedPaymentTitles: string[] = [];
      if (Array.isArray(customPaymentTitles) && customPaymentTitles.length > 0) {
        extractedPaymentTitles = customPaymentTitles.map((t: any) => String(t).trim()).filter(Boolean);
      } else if (storeConfig?.paymentLogos) {
        try {
          const parsedPayments =
            typeof storeConfig.paymentLogos === 'string'
              ? JSON.parse(storeConfig.paymentLogos)
              : storeConfig.paymentLogos;
          if (Array.isArray(parsedPayments)) {
            extractedPaymentTitles = parsedPayments
              .filter((p: any) => p.active !== false && p.name)
              .map((p: any) => String(p.name).trim());
          }
        } catch {}
      }

      if (extractedPaymentTitles.length === 0) {
        extractedPaymentTitles = [
          'Transferencia Bancaria',
          'Banco Pichincha',
          'Banco Guayaquil',
          'Deuna',
          'Efectivo',
        ];
      }

      // Parse courierLogos from storeConfig to extract active courier company names
      let extractedShippingCompanies: string[] = [];
      if (Array.isArray(customShippingCompanies) && customShippingCompanies.length > 0) {
        extractedShippingCompanies = customShippingCompanies.map((s: any) => String(s).trim()).filter(Boolean);
      } else if (storeConfig?.courierLogos) {
        try {
          const parsedCouriers =
            typeof storeConfig.courierLogos === 'string'
              ? JSON.parse(storeConfig.courierLogos)
              : storeConfig.courierLogos;
          if (Array.isArray(parsedCouriers)) {
            extractedShippingCompanies = parsedCouriers
              .filter((c: any) => c.active !== false && c.name)
              .map((c: any) => String(c.name).trim());
          }
        } catch {}
      }

      if (extractedShippingCompanies.length === 0) {
        extractedShippingCompanies = [
          'Servientrega',
          'LaarCourier',
          'Cooperativas de Transporte',
          'Entregas a Domicilio',
        ];
      }

      let effectiveWebsiteUrl = (websiteUrl !== undefined && websiteUrl !== '') ? websiteUrl : '';
      if (!effectiveWebsiteUrl) {
        try {
          const domainConfig = await getServerDomainConfig(userId);
          const rawStoreDomain = domainConfig?.storeDomain || (storeConfig as any)?.domain || '';
          const candidateStoreDomain = rawStoreDomain.split(/[,;\n]/)[0]?.replace(/^https?:\/\//i, '').split('/')[0].trim();
          if (candidateStoreDomain && !candidateStoreDomain.includes('localhost') && !candidateStoreDomain.includes('127.0.0.1')) {
            effectiveWebsiteUrl = `https://${candidateStoreDomain}/?producto=${item.id}`;
          }
        } catch {}
      }

      if (!effectiveWebsiteUrl) {
        const reqHost = req.get('x-forwarded-host') || req.get('host') || '';
        const reqProto = req.get('x-forwarded-proto') || req.protocol || 'https';
        if (reqHost) {
          // Replace admin. subdomain with store subdomain or remove admin. prefix
          const cleanHost = reqHost.startsWith('admin.') ? `www.${reqHost.replace(/^admin\./, '')}` : reqHost;
          effectiveWebsiteUrl = `${reqProto}://${cleanHost}?view=store&producto=${item.id}`;
        }
      }

      const copyResult = await generateProductMarketingCopy(
        {
          name: item.name,
          sku: item.sku,
          description: item.description,
          category: item.category,
          salePrice: customPrice !== undefined && Number(customPrice) > 0 ? customPrice : item.salePrice,
          stock: item.stock,
          tags: item.tags,
          extractedAttributes: item.extractedAttributes,
          imageUrl: item.imageUrl,
          images: (item as any).images,
        },
        {
          tone: tone || 'persuasive',
          storeName: storeName || storeConfig?.storeName || 'Comerxia Store',
          storeAddress: storeAddress !== undefined ? storeAddress : (storeConfig?.address || ''),
          websiteUrl: effectiveWebsiteUrl,
          whatsappNumber: whatsappNumber || storeConfig?.whatsappNumber || '',
          cityOrRegion: cityOrRegion || 'Envíos a todo el país',
          currency: storeConfig?.currency || 'USD',
          warrantyInfo: warrantyInfo || 'Producto 100% nuevo, garantizado contra defectos de fábrica',
          paymentTitles: extractedPaymentTitles,
          shippingCompanies: extractedShippingCompanies,
          showStock: showStock !== undefined ? Boolean(showStock) : true,
          showPhone: showPhone !== undefined ? Boolean(showPhone) : true,
          showSku: showSku !== undefined ? Boolean(showSku) : true,
          showWebsite: showWebsite !== undefined ? Boolean(showWebsite) : true,
        }
      );

      // Persist generated copy directly in the product's database record
      copyResult.options = {
        showStock: showStock !== undefined ? Boolean(showStock) : true,
        showPhone: showPhone !== undefined ? Boolean(showPhone) : true,
        showSku: showSku !== undefined ? Boolean(showSku) : true,
        showWebsite: showWebsite !== undefined ? Boolean(showWebsite) : true,
        websiteUrl: effectiveWebsiteUrl || undefined,
        tone: tone || 'persuasive',
        customPrice: customPrice !== undefined ? String(customPrice) : undefined,
        cityOrRegion: cityOrRegion || undefined,
        whatsappContact: whatsappNumber || undefined,
        storeAddress: storeAddress !== undefined ? storeAddress : (storeConfig?.address || undefined),
        paymentTitlesInput: extractedPaymentTitles.join(', '),
        shippingCompaniesInput: extractedShippingCompanies.join(', '),
      };
      copyResult.showStock = showStock !== undefined ? Boolean(showStock) : true;
      copyResult.showPhone = showPhone !== undefined ? Boolean(showPhone) : true;
      copyResult.showSku = showSku !== undefined ? Boolean(showSku) : true;
      copyResult.showWebsite = showWebsite !== undefined ? Boolean(showWebsite) : true;
      copyResult.websiteUrl = effectiveWebsiteUrl || undefined;

      let updatedItem: any = item;
      try {
        updatedItem = await saveProductMarketingCopy(item.id, copyResult);
      } catch (saveErr) {
        console.warn('Could not auto-save copy to DB, returning generated copy:', saveErr);
      }

      res.json({
        success: true,
        productId: item.id,
        productName: item.name,
        copy: copyResult,
        item: updatedItem,
      });
    } catch (error: any) {
      console.error('Error generating product marketing copy:', error);
      res.status(500).json({ error: error.message || 'Error al generar copys con IA' });
    }
  });

  // 8d. Save / Update Product Marketing Copy in database
  app.put('/api/inventory/:id/marketing-copy', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID de producto inválido' });

      const item = await getInventoryItemById(id);
      if (!item) return res.status(404).json({ error: 'Producto no encontrado' });

      const { copy } = req.body || {};
      if (!copy) return res.status(400).json({ error: 'Datos de publicación requeridos' });

      const updated = await saveProductMarketingCopy(id, copy);
      res.json({
        success: true,
        message: 'Publicación guardada exitosamente en la base de datos',
        item: updated,
      });
    } catch (error: any) {
      console.error('Error saving marketing copy to DB:', error);
      res.status(500).json({ error: error.message || 'Error al guardar publicación en la base de datos' });
    }
  });

  // 8e. Delete / Clear Product Marketing Copy from database
  app.delete('/api/inventory/:id/marketing-copy', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID de producto inválido' });

      const item = await getInventoryItemById(id);
      if (!item) return res.status(404).json({ error: 'Producto no encontrado' });

      const updated = await updateInventoryItem(id, { marketingCopy: null });
      res.json({
        success: true,
        message: 'Publicación de IA eliminada exitosamente de la base de datos',
        item: updated,
      });
    } catch (error: any) {
      console.error('Error deleting marketing copy from DB:', error);
      res.status(500).json({ error: error.message || 'Error al eliminar la publicación de la base de datos' });
    }
  });

  app.post('/api/ai/generate-marketing-copy', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { product, options } = req.body || {};
      if (!product || !product.name) {
        return res.status(400).json({ error: 'Se requiere información del producto (al menos el nombre)' });
      }

      const userId = req.dbUserId || 1;
      const storeConfig = await getStoreConfig(userId);

      let effectiveWebsiteUrl = (options?.websiteUrl !== undefined && options?.websiteUrl !== '') ? options.websiteUrl : '';
      if (!effectiveWebsiteUrl) {
        try {
          const domainConfig = await getServerDomainConfig(userId);
          const rawStoreDomain = domainConfig?.storeDomain || (storeConfig as any)?.domain || '';
          const candidateStoreDomain = rawStoreDomain.split(/[,;\n]/)[0]?.replace(/^https?:\/\//i, '').split('/')[0].trim();
          if (candidateStoreDomain && !candidateStoreDomain.includes('localhost') && !candidateStoreDomain.includes('127.0.0.1')) {
            effectiveWebsiteUrl = product.id ? `https://${candidateStoreDomain}/?producto=${product.id}` : `https://${candidateStoreDomain}`;
          }
        } catch {}
      }

      if (!effectiveWebsiteUrl) {
        const reqHost = req.get('x-forwarded-host') || req.get('host') || '';
        const reqProto = req.get('x-forwarded-proto') || req.protocol || 'https';
        if (reqHost) {
          const cleanHost = reqHost.startsWith('admin.') ? `www.${reqHost.replace(/^admin\./, '')}` : reqHost;
          effectiveWebsiteUrl = product.id
            ? `${reqProto}://${cleanHost}?view=store&producto=${product.id}`
            : `${reqProto}://${cleanHost}?view=store`;
        }
      }

      const copyResult = await generateProductMarketingCopy(
        product,
        {
          tone: options?.tone || 'persuasive',
          storeName: options?.storeName || storeConfig?.storeName || 'Comerxia Store',
          storeAddress: options?.storeAddress !== undefined ? options?.storeAddress : (storeConfig?.address || ''),
          websiteUrl: effectiveWebsiteUrl,
          whatsappNumber: options?.whatsappNumber || storeConfig?.whatsappNumber || '',
          cityOrRegion: options?.cityOrRegion || 'Envíos a todo el país',
          currency: options?.currency || storeConfig?.currency || 'USD',
          warrantyInfo: options?.warrantyInfo || 'Producto 100% nuevo y garantizado',
          showStock: options?.showStock !== undefined ? options?.showStock : true,
          showPhone: options?.showPhone !== undefined ? options?.showPhone : true,
          showSku: options?.showSku !== undefined ? options?.showSku : true,
          showWebsite: options?.showWebsite !== undefined ? options?.showWebsite : true,
        }
      );

      res.json({
        success: true,
        copy: copyResult,
      });
    } catch (error: any) {
      console.error('Error generating marketing copy:', error);
      res.status(500).json({ error: error.message || 'Error al generar copys con IA' });
    }
  });

  // 8c2. Generate / Regenerate Commercial Description with Gemini AI (Same format and structure as Telegram intake)
  app.post('/api/ai/generate-description', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const {
        name,
        category,
        description,
        rawTelegramMessage,
        tags,
        attributes,
        extractedAttributes,
        imageUrl,
        images,
        costPrice,
        salePrice,
      } = req.body || {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Se requiere al menos el nombre del producto para generar la descripción.' });
      }

      const generatedDescription = await generateProductCommercialDescription({
        name: name.trim(),
        category,
        description,
        rawTelegramMessage,
        tags,
        attributes: extractedAttributes || attributes,
        imageUrl,
        images,
        costPrice,
        salePrice,
      });

      res.json({
        success: true,
        description: generatedDescription,
      });
    } catch (error: any) {
      console.error('Error generating product description with AI:', error);
      res.status(500).json({ error: error.message || 'Error al generar la descripción comercial con IA' });
    }
  });

  app.post('/api/inventory/:id/generate-description', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID de producto inválido' });

      const item = await getInventoryItemById(id);
      if (!item) return res.status(404).json({ error: 'Producto no encontrado' });

      const {
        name,
        category,
        description,
        rawTelegramMessage,
        tags,
        attributes,
        extractedAttributes,
        imageUrl,
        images,
        saveToDatabase = false,
      } = req.body || {};

      const generatedDescription = await generateProductCommercialDescription({
        name: (name || item.name || '').trim(),
        category: category || item.category,
        description: description !== undefined ? description : item.description,
        rawTelegramMessage: rawTelegramMessage !== undefined ? rawTelegramMessage : item.rawTelegramMessage,
        tags: tags !== undefined ? tags : item.tags,
        attributes: extractedAttributes || attributes || item.extractedAttributes,
        imageUrl: imageUrl !== undefined ? imageUrl : item.imageUrl,
        images: images !== undefined ? images : (item as any).images,
        costPrice: item.costPrice,
        salePrice: item.salePrice,
      });

      let updatedItem: any = item;
      if (saveToDatabase) {
        updatedItem = await updateInventoryItem(id, {
          description: generatedDescription,
        });
      }

      res.json({
        success: true,
        productId: id,
        description: generatedDescription,
        item: updatedItem,
      });
    } catch (error: any) {
      console.error('Error generating description for inventory item:', error);
      res.status(500).json({ error: error.message || 'Error al generar la descripción comercial' });
    }
  });

  // 8f. AI-Powered Image Search for Exact Product Match
  app.post('/api/inventory/:id/search-web-images', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const customQuery = req.body?.query;
      let item = null;

      if (!isNaN(id) && id > 0) {
        item = await getInventoryItemById(id);
      }

      const productName = item?.name || (typeof customQuery === 'string' ? customQuery : '');
      if (!productName || !productName.trim()) {
        return res.status(400).json({ error: 'Se requiere un producto válido o término de búsqueda' });
      }

      const searchResult = await searchProductImagesWithAI({
        id: item?.id,
        name: productName,
        description: item?.description,
        category: item?.category,
        extractedAttributes: item?.extractedAttributes,
        sku: item?.sku,
        imageUrl: item?.imageUrl,
        customQuery: typeof customQuery === 'string' && customQuery.trim() !== productName.trim() ? customQuery.trim() : undefined,
        limit: 28,
      });

      res.json({
        success: true,
        query: productName,
        profile: searchResult.profile,
        images: searchResult.images,
        count: searchResult.images.length,
      });
    } catch (error: any) {
      console.error('Error in AI-powered product image search:', error);
      res.status(500).json({ error: error.message || 'Error al buscar imágenes del producto con IA' });
    }
  });

  // 8g. Generate Studio Photo for Product using Gemini AI
  app.post('/api/inventory/:id/ai-generate-studio-image', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID de producto inválido' });

      const item = await getInventoryItemById(id);
      if (!item) return res.status(404).json({ error: 'Producto no encontrado' });

      const { style } = req.body || {};
      const generated = await generateProductStudioPhotoWithAI({
        name: item.name,
        category: item.category,
        description: item.description,
        extractedAttributes: item.extractedAttributes,
        style: style || 'white_background',
      });

      res.json({
        success: true,
        image: generated,
      });
    } catch (error: any) {
      console.error('Error generating studio photo with AI:', error);
      res.status(500).json({ error: error.message || 'Error al generar foto de estudio con IA' });
    }
  });

  // 8h. Global Web Image Search (for any query / new products)
  app.post('/api/ai/search-images', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { query, limit } = req.body || {};
      if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: 'Se requiere un término de búsqueda' });
      }

      const searchResult = await searchProductImagesWithAI({
        name: query.trim(),
        limit: Number(limit) || 24,
      });

      res.json({
        success: true,
        query: query.trim(),
        profile: searchResult.profile,
        images: searchResult.images,
        count: searchResult.images.length,
      });
    } catch (error: any) {
      console.error('Error searching images globally:', error);
      res.status(500).json({ error: error.message || 'Error al buscar imágenes con IA' });
    }
  });

  // 8h. Add Selected Images to a Product
  app.post('/api/inventory/:id/add-images', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID de producto inválido' });

      const item = await getInventoryItemById(id);
      if (!item) return res.status(404).json({ error: 'Producto no encontrado' });

      const body = req.body || {};
      const rawList = body.images || body.imageUrls || body.urls || body.selectedUrls || body.selectedImages || body.imageUrl || body.image || body.url || [];
      // Default to true when adding images unless explicitly set to false
      const isCover = body.setAsCover !== undefined ? Boolean(body.setAsCover) : true;

      let listToProcess: any[] = [];
      if (Array.isArray(rawList)) {
        listToProcess = rawList;
      } else if (typeof rawList === 'string' && rawList.trim()) {
        listToProcess = [rawList.trim()];
      }

      const imagesToAdd: (string | { url: string; fallbackUrl?: string })[] = [];
      for (const i of listToProcess) {
        if (typeof i === 'string' && i.trim()) {
          let u = i.trim();
          if (u.startsWith('//')) u = `https:${u}`;
          if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:') || u.startsWith('/')) {
            imagesToAdd.push(u);
          }
        } else if (typeof i === 'object' && i && i.url) {
          let u = String(i.url).trim();
          if (u.startsWith('//')) u = `https:${u}`;
          let fallback = i.fallbackUrl || i.thumbnailUrl ? String(i.fallbackUrl || i.thumbnailUrl).trim() : undefined;
          if (fallback?.startsWith('//')) fallback = `https:${fallback}`;

          if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:') || u.startsWith('/')) {
            imagesToAdd.push({
              url: u,
              fallbackUrl: fallback,
            });
          }
        }
      }

      if (imagesToAdd.length === 0) {
        return res.status(400).json({ error: 'No se enviaron URLs de imágenes válidas' });
      }

      const updated = await appendImagesToInventoryItem(id, imagesToAdd as any, isCover);
      const safeItem = updated || (await getInventoryItemById(id));
      res.json({
        success: true,
        message: `${imagesToAdd.length} imagen(es) agregada(s) con éxito al producto`,
        item: safeItem,
        addedCount: imagesToAdd.length,
      });
    } catch (error: any) {
      console.error('Error adding images to product:', error);
      res.status(500).json({ error: error.message || 'Error al agregar imágenes al producto' });
    }
  });

  // 8h2. Search Product Videos with AI (Hybrid: YouTube, TikTok, Shorts, Vimeo, MP4)
  app.post('/api/inventory/:id/search-web-videos', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID de producto inválido' });

      const item = await getInventoryItemById(id);
      if (!item) return res.status(404).json({ error: 'Producto no encontrado' });

      const customQuery = req.body.query || req.body.searchQuery || item.name;
      const searchResult = await searchProductVideos({
        productName: item.name,
        category: item.category,
        description: item.description || undefined,
        sku: item.sku,
        customQuery,
      });

      res.json({
        success: true,
        ...searchResult,
      });
    } catch (error: any) {
      console.error('Error searching product videos with AI:', error);
      res.status(500).json({ error: error.message || 'Error al buscar videos con IA' });
    }
  });

  // 8h3. General AI Video Search
  app.post('/api/ai/search-videos', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { productName, category, description, sku, query } = req.body || {};
      if (!productName && !query) {
        return res.status(400).json({ error: 'Se requiere el nombre del producto o término de búsqueda' });
      }

      const searchResult = await searchProductVideos({
        productName: productName || query,
        category,
        description,
        sku,
        customQuery: query || productName,
      });

      res.json({
        success: true,
        ...searchResult,
      });
    } catch (error: any) {
      console.error('Error in general AI video search:', error);
      res.status(500).json({ error: error.message || 'Error en búsqueda de videos' });
    }
  });

  // 8h3b. Real-time Market Quotation for Ecuador (Google Search Grounding + Gemini)
  app.post('/api/ai/market-quote-ecuador', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { productName, category, description, costPrice, marginPercent } = req.body || {};
      if (!productName || typeof productName !== 'string' || !productName.trim()) {
        return res.status(400).json({ error: 'Se requiere el nombre del producto a cotizar' });
      }

      // Check if user has a custom Gemini key configured in their settings
      let customApiKey: string | undefined = undefined;
      try {
        const aiCfg = await getAiConfig(req.dbUserId || 1);
        if (aiCfg?.apiKey && isValidGeminiApiKey(aiCfg.apiKey)) {
          customApiKey = aiCfg.apiKey.trim();
        }
      } catch {}

      const quote = await quoteProductInEcuadorMarket({
        productName: productName.trim(),
        category: category || 'General',
        description: description || '',
        costPrice: Math.max(0, parseFloat(costPrice) || 0),
        marginPercent: Math.max(5, Math.min(150, parseInt(marginPercent, 10) || 35)),
        customApiKey,
      });

      res.json({
        success: true,
        ...quote,
      });
    } catch (error: any) {
      console.error('Error quoting product in Ecuador market:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al cotizar el producto en el mercado ecuatoriano',
      });
    }
  });

  // 8h4. Set or Update Product Video (Manual link or uploaded file)
  app.post('/api/inventory/:id/set-video', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID de producto inválido' });

      const { videoUrl } = req.body || {};
      const updated = await setInventoryItemVideo(id, videoUrl || null);
      if (!updated) {
        return res.status(404).json({ error: 'No se pudo actualizar el video del producto' });
      }

      res.json({
        success: true,
        message: videoUrl ? '🎬 Video vinculado con éxito al producto' : 'Video eliminado del producto',
        item: updated,
      });
    } catch (error: any) {
      console.error('Error setting product video:', error);
      res.status(500).json({ error: error.message || 'Error al guardar el video' });
    }
  });

  // 8h5. Upload Local Video (MP4/WebM base64 or file)
  app.post('/api/media/upload-video', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { videoData, filename } = req.body || {};
      if (!videoData || typeof videoData !== 'string') {
        return res.status(400).json({ error: 'No se envió contenido de video válido' });
      }

      const persistedUrl = await persistVideoLocally(videoData);
      if (!persistedUrl) {
        return res.status(500).json({ error: 'No se pudo guardar el archivo de video en el servidor' });
      }

      res.json({
        success: true,
        videoUrl: persistedUrl,
        message: 'Video subido y guardado exitosamente',
      });
    } catch (error: any) {
      console.error('Error uploading video file:', error);
      res.status(500).json({ error: error.message || 'Error al subir el video' });
    }
  });

  // 8i. Image proxy for third-party hosting restrictions/CORS/hotlinking
  app.get('/api/proxy-image', async (req: Request, res: Response) => {
    try {
      const rawUrl = req.query.url;
      if (!rawUrl || typeof rawUrl !== 'string') {
        return res.status(400).send('Missing url parameter');
      }

      let targetUrl = decodeURIComponent(rawUrl.trim());
      if (targetUrl.startsWith('//')) targetUrl = `https:${targetUrl}`;

      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        return res.status(400).send('Invalid image url');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      let originHeader = '';
      try {
        const u = new URL(targetUrl);
        originHeader = `${u.protocol}//${u.hostname}`;
      } catch {}

      const imgRes = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          ...(originHeader ? { Referer: originHeader } : {}),
        },
      });
      clearTimeout(timeoutId);

      if (!imgRes.ok) {
        return res.redirect(targetUrl);
      }

      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      if (contentType.includes('text/html')) {
        return res.status(404).send('Not an image');
      }

      const arrayBuffer = await imgRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Cache locally to uploadsDir if valid
      if (buffer.length > 300) {
        try {
          const urlHash = crypto.createHash('md5').update(targetUrl).digest('hex');
          const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
          const cachedFile = path.join(uploadsDir, `img_${urlHash}.${ext}`);
          if (!fs.existsSync(cachedFile)) {
            fs.writeFileSync(cachedFile, buffer);
          }
        } catch {}
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.send(buffer);
    } catch (err: any) {
      console.warn('Image proxy error, redirecting directly:', err?.message);
      if (req.query.url && typeof req.query.url === 'string') {
        return res.redirect(req.query.url);
      }
      return res.status(500).send('Failed to proxy image');
    }
  });

  // 8j. Self-Hosted Media serving and management endpoints
  app.get('/api/media/:filename', (req: Request, res: Response, next: express.NextFunction) => {
    try {
      const reserved = ['stats', 'diagnostics', 'status', 'upload-video', 'persist-image', 'sync-all-images'];
      if (reserved.includes(req.params.filename)) {
        return next();
      }
      const filename = path.basename(req.params.filename);
      const filePath = path.join(uploadsDir, filename);
      if (fs.existsSync(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(filePath);
      }
      return res.status(404).json({ error: 'Imagen no encontrada en el almacenamiento local' });
    } catch (err: any) {
      return res.status(500).json({ error: 'Error al servir imagen local' });
    }
  });

  app.post('/api/media/persist-image', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { url, base64 } = req.body || {};
      const target = url || base64;
      if (!target || typeof target !== 'string') {
        return res.status(400).json({ error: 'Se requiere una URL o cadena Base64 de imagen' });
      }

      const persistedUrl = await persistImageLocally(target);
      res.json({
        success: true,
        originalUrl: target.startsWith('data:') ? 'base64_data' : target,
        url: persistedUrl,
        isSelfHosted: Boolean(persistedUrl?.startsWith('/uploads/') || persistedUrl?.startsWith('/api/media/')),
      });
    } catch (error: any) {
      console.error('Error persisting image locally:', error);
      res.status(500).json({ error: error.message || 'Error al persistir imagen localmente' });
    }
  });

  app.post('/api/media/sync-all-images', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const result = await syncAllInventoryImagesLocally(
        () => getInventoryItems(req.dbUserId),
        (id, data) => updateInventoryItem(id, data)
      );

      res.json({
        success: true,
        message: `Sincronización completada. ${result.imagesPersisted} imagen(es) descargadas y guardadas localmente en ${result.itemsUpdated} producto(s).`,
        ...result,
      });
    } catch (error: any) {
      console.error('Error in sync-all-images endpoint:', error);
      res.status(500).json({ error: error.message || 'Error al sincronizar imágenes' });
    }
  });

  app.get('/api/media/status', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      let filesCount = 0;
      let totalBytes = 0;
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        filesCount = files.length;
        for (const file of files) {
          try {
            const stat = fs.statSync(path.join(uploadsDir, file));
            totalBytes += stat.size;
          } catch {}
        }
      }

      const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
      res.json({
        success: true,
        storageType: 'local_self_hosted',
        uploadsDirectory: uploadsDir,
        totalFiles: filesCount,
        totalSizeMb: `${totalMb} MB`,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Error al consultar estado del almacenamiento multimedia' });
    }
  });

  app.post('/api/media/delete-file', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { fileUrl, mediaUrl, path: targetPath } = req.body || {};
      const target = fileUrl || mediaUrl || targetPath;
      if (!target || typeof target !== 'string') {
        return res.status(400).json({ error: 'Se requiere una URL o ruta de archivo multimedia' });
      }

      const wasDeleted = await deleteMediaFileIfUnreferenced(target);
      res.json({
        success: true,
        deleted: wasDeleted,
        message: wasDeleted
          ? 'Archivo eliminado físicamente de la carpeta uploads'
          : 'El archivo no se eliminó (no existe o sigue en uso por otro producto)',
      });
    } catch (error: any) {
      console.error('Error deleting media file:', error);
      res.status(500).json({ error: error.message || 'Error al eliminar el archivo multimedia' });
    }
  });

  // 8i. Remove an Image from a Product (supports DELETE & POST)
  const handleRemoveImage = async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID de producto inválido' });

      const body = req.body || {};
      const query = req.query || {};

      const deleteAll = Boolean(
        body.deleteAll ||
        body.all ||
        query.deleteAll === 'true' ||
        query.all === 'true' ||
        body.imageUrl === 'ALL' ||
        body.imageUrl === '*'
      );

      const rawIndex = body.photoIndex ?? body.index ?? query.photoIndex ?? query.index;
      const photoIndex = typeof rawIndex === 'number' ? rawIndex : typeof rawIndex === 'string' && !isNaN(parseInt(rawIndex, 10)) ? parseInt(rawIndex, 10) : undefined;

      const rawUrl = body.imageUrl || body.image || body.url || query.imageUrl || query.url;
      const imageUrl = typeof rawUrl === 'string' ? rawUrl.trim() : undefined;

      let updated;
      if (deleteAll) {
        updated = await clearAllImagesFromInventoryItem(id);
      } else {
        updated = await removeImageFromInventoryItem(id, imageUrl, photoIndex);
      }

      if (!updated) {
        return res.status(404).json({ error: 'Producto no encontrado o error al actualizar imagen' });
      }

      res.json({
        success: true,
        message: 'Foto(s) eliminada(s) del producto exitosamente en la base de datos',
        item: updated,
      });
    } catch (error: any) {
      console.error('Error removing image from product:', error);
      res.status(500).json({ error: error.message || 'Error al eliminar imagen del producto' });
    }
  };

  app.delete('/api/inventory/:id/images', optionalAuth, handleRemoveImage);
  app.post('/api/inventory/:id/delete-image', optionalAuth, handleRemoveImage);
  app.post('/api/inventory/:id/remove-image', optionalAuth, handleRemoveImage);
  app.post('/api/inventory/:id/delete-images', optionalAuth, handleRemoveImage);

  // 8j. Set Cover / Primary Image for a Product
  app.put('/api/inventory/:id/set-cover-image', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID de producto inválido' });

      const { imageUrl } = req.body || {};
      if (!imageUrl || typeof imageUrl !== 'string') {
        return res.status(400).json({ error: 'Se requiere la URL de la imagen principal' });
      }

      const updated = await setCoverImageForInventoryItem(id, imageUrl);
      res.json({
        success: true,
        message: 'Foto principal actualizada exitosamente',
        item: updated,
      });
    } catch (error: any) {
      console.error('Error setting cover image:', error);
      res.status(500).json({ error: error.message || 'Error al establecer la imagen principal' });
    }
  });

  // 9. Live Telegram Webhook Endpoint (alternative to Long Polling)
  app.post('/api/telegram/webhook', async (req: Request, res: Response) => {
    // Acknowledge Telegram immediately with 200 OK
    res.status(200).send({ ok: true });

    try {
      const update = req.body;
      const message = update?.message || update?.channel_post;

      if (!message) return;

      const userId = 1;
      const config = await getTelegramConfig(userId);
      if (!config || config.isActive === false) {
        console.log('[Telegram Webhook] Descartado: El bot de Telegram está en pausa.');
        return;
      }
      const token = config.botToken || process.env.TELEGRAM_BOT_TOKEN;

      if (token) {
        await processTelegramMessage(token, message, userId);
      }
    } catch (err) {
      console.error('Error handling Telegram webhook message:', err);
    }
  });

  // 10. Storefront & Customer Orders Endpoints
  const serveStoreLogoHandler = async (req: Request, res: Response, forceDesktop = false) => {
    try {
      const config = await getStoreConfig(1);
      const isDesktop = forceDesktop || req.query.type === 'desktop' || req.query.format === 'rectangular';
      const logoUrl = isDesktop
        ? (config?.logoDesktopUrl || config?.logoUrl)
        : (config?.logoUrl || config?.logoDesktopUrl);

      if (!logoUrl || logoUrl.trim().length === 0) {
        const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="70" viewBox="0 0 240 70">
          <rect width="240" height="70" rx="14" fill="#2563EB"/>
          <text x="120" y="42" fill="#FFFFFF" font-size="22" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" text-anchor="middle">
            ${config?.storeName || 'Comerxia Store'}
          </text>
        </svg>`;
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.send(defaultSvg);
      }

      if (logoUrl.startsWith('data:image/')) {
        const parts = logoUrl.split(';base64,');
        const contentType = parts[0].replace('data:', '');
        const base64Data = parts[1];
        const imgBuffer = Buffer.from(base64Data, 'base64');

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.send(imgBuffer);
      }

      if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
        return res.redirect(logoUrl);
      }

      if (logoUrl.includes('<svg')) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.send(logoUrl);
      }

      const cleanBasename = path.basename(logoUrl.split('?')[0]);
      if (cleanBasename) {
        const fileInUploads = path.join(process.cwd(), 'uploads', cleanBasename);
        if (fs.existsSync(fileInUploads)) {
          res.setHeader('Cache-Control', 'public, max-age=3600');
          return res.sendFile(fileInUploads);
        }
      }

      const cleanRelPath = logoUrl.split('?')[0].replace(/^\//, '');
      if (cleanRelPath) {
        const relPathOnDisk = path.join(process.cwd(), cleanRelPath);
        if (fs.existsSync(relPathOnDisk)) {
          res.setHeader('Cache-Control', 'public, max-age=3600');
          return res.sendFile(relPathOnDisk);
        }
      }

      if (logoUrl.startsWith('/')) {
        return res.redirect(logoUrl);
      }

      return res.status(404).send('Logo not found');

    } catch (error: any) {
      console.error('Error serving store logo:', error);
      res.status(500).send('Error serving logo');
    }
  };

  app.get('/api/store/logo', async (req: Request, res: Response) => {
    return serveStoreLogoHandler(req, res, false);
  });

  app.get('/api/store/logo-desktop', async (req: Request, res: Response) => {
    return serveStoreLogoHandler(req, res, true);
  });

  app.get('/api/store/config', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const config = await getStoreConfig(req.dbUserId || 1);
      res.json(config);
    } catch (error: any) {
      console.error('Failed to get store config:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch store config' });
    }
  });

  app.post('/api/store/config', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const updated = await updateStoreConfig(req.dbUserId || 1, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error('Failed to update store config:', error);
      res.status(500).json({ error: error.message || 'Failed to update store config' });
    }
  });

  // 8k. Generate Promotional Campaign Banner / Flyer with AI
  app.post('/api/store/promo-image/generate-ai', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const {
        theme,
        storeName,
        discountText,
        customPrompt,
        badge,
        category,
        productName,
        productImageUrl,
        productPrice,
        posterStyle,
        persistLocal,
      } = req.body || {};

      const generated = await generateStorePromoBannerWithAI({
        theme: theme || 'christmas',
        storeName: storeName || 'Comerxia Store',
        discountText,
        customPrompt,
        badge,
        category,
        productName,
        productImageUrl,
        productPrice,
        posterStyle,
      });

      let finalUrl = generated.imageUrl;
      if (persistLocal !== false && finalUrl && (finalUrl.startsWith('data:') || finalUrl.startsWith('https://'))) {
        try {
          const localSaved = await persistImageLocally(finalUrl);
          if (localSaved) {
            finalUrl = localSaved;
          }
        } catch (storageErr) {
          console.warn('Could not persist promo image locally, using generated URL:', storageErr);
        }
      }

      res.json({
        success: true,
        image: {
          ...generated,
          imageUrl: finalUrl,
        },
      });
    } catch (error: any) {
      console.error('Error generating promo banner with AI:', error);
      res.status(500).json({ error: error.message || 'Error al generar afiche promocional con IA' });
    }
  });

  // Search real high-resolution commercial advertising banners and posters across the web
  app.post('/api/store/promo-image/search-web', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { query, limit } = req.body || {};
      const results = await searchCommercialPromoBanners(query || 'banner publicitario oferta', limit || 16);
      res.json({
        success: true,
        images: results,
      });
    } catch (error: any) {
      console.error('Error searching commercial promo banners:', error);
      res.status(500).json({ error: error.message || 'Error al buscar afiches publicitarios' });
    }
  });

  // Get curated high-definition commercial presets by category
  app.get('/api/store/promo-image/curated-presets', optionalAuth, async (_req: AuthRequest, res: Response) => {
    try {
      res.json({
        success: true,
        presets: CURATED_COMMERCIAL_PRESETS,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Error al cargar presets publicitarios' });
    }
  });

  app.get('/api/store/products', async (req: Request, res: Response) => {
    try {
      const search = req.query.search as string;
      const category = req.query.category as string;
      const inStockOnly = req.query.inStock === 'true';

      const config = await getStoreConfig(1);
      const hideOutOfStock = config && config.showOutOfStock === false;

      const items = await getInventoryItems(undefined, { search, category });
      // The online store buyer only sees products marked as Active ('available'),
      // regardless of whether physical stock is present or if it will be managed as backordered by the seller.
      const filtered = items.filter((it) => {
        // Must be marked as active ('available' / not archived or inactive)
        const isArchived = it.status === 'archived' || it.status === 'inactive';
        if (isArchived) return false;
        // In this system, active products are 'available'
        return it.status === 'available' || (it.status !== 'archived' && it.status !== 'inactive');
      });

      res.json(filtered);
    } catch (error: any) {
      console.error('Failed to fetch store products:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch store products' });
    }
  });

  app.get('/api/orders', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const orders = await getCustomerOrders(req.dbUserId);
      res.json(orders);
    } catch (error: any) {
      console.error('Failed to fetch orders:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch orders' });
    }
  });

  app.post('/api/orders', async (req: Request, res: Response) => {
    try {
      const {
        customerName,
        customerPhone,
        customerEmail,
        customerCi,
        ci,
        customerAddress,
        clientAddress,
        shippingAddress,
        items,
        totalAmount,
        paymentMethod,
        notes,
        status,
        paymentVoucher,
        deliveryType,
        trackingCarrier,
        trackingNumber,
        trackingNotes,
        isOnlineStore,
        source,
      } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Debes incluir al menos un producto en el pedido' });
      }

      const isStoreOrder = Boolean(isOnlineStore || source === 'online_store');
      const resolvedCustomerName = (customerName && String(customerName).trim()) || (isStoreOrder ? 'Consumidor Final' : 'Cliente General');
      const resolvedCustomerPhone = (customerPhone && String(customerPhone).trim()) || (isStoreOrder ? 'Coordinar por WhatsApp' : 'N/A');

      let orderNotes = notes || '';
      if (isStoreOrder && !orderNotes.includes('[Tienda Online]')) {
        orderNotes = orderNotes ? `[Tienda Online] ${orderNotes}` : '[Tienda Online] Pedido realizado desde la Tienda Online';
      }

      // Validación de cédula o RUC ecuatoriano (por defecto Consumidor Final '9999999999999' para Tienda Online)
      const rawCandidateCi = (customerCi || ci || (isStoreOrder ? '9999999999999' : '')).toString().trim();
      let finalCiToCreate: string | undefined = isStoreOrder ? '9999999999999' : undefined;

      if (rawCandidateCi) {
        const ciVal = validateEcuadorId(rawCandidateCi, true);
        if (ciVal.isValid) {
          finalCiToCreate = rawCandidateCi;
        } else if (isStoreOrder) {
          finalCiToCreate = '9999999999999';
        } else {
          return res.status(400).json({ error: `Cédula o RUC ecuatoriano inválido: ${ciVal.error}` });
        }
      }

      const orderResult = await createCustomerOrder({
        userId: 1,
        customerName: resolvedCustomerName,
        customerPhone: resolvedCustomerPhone,
        customerEmail: customerEmail || undefined,
        customerCi: finalCiToCreate,
        ci: finalCiToCreate,
        customerAddress: customerAddress || shippingAddress || undefined,
        clientAddress: clientAddress || undefined,
        shippingAddress: shippingAddress || customerAddress || undefined,
        items,
        totalAmount: Number(totalAmount) || 0,
        paymentMethod: paymentMethod || 'whatsapp',
        cardCommissionPercent: req.body.cardCommissionPercent != null ? req.body.cardCommissionPercent : undefined,
        status: status || 'pending',
        paymentVoucher: paymentVoucher || undefined,
        notes: orderNotes || undefined,
        deliveryType: deliveryType || undefined,
        trackingCarrier: trackingCarrier || undefined,
        trackingNumber: trackingNumber || undefined,
        trackingNotes: trackingNotes || undefined,
        decrementStock: true,
        isOnlineStore: isStoreOrder,
        source: isStoreOrder ? 'online_store' : (source || undefined),
      });

      // Send alert to Telegram bot if configured
      try {
        const config = await getTelegramConfig(1);
        const token = config?.botToken || process.env.TELEGRAM_BOT_TOKEN;
        if (token && config?.supplierUsername) {
          // Send notification text
          const itemsText = items.map((it: any) => `• ${it.quantity}x ${it.name || it.item?.name} ($${it.salePrice || it.item?.salePrice})`).join('\n');
          const orderMsg = `🛒 *¡NUEVO PEDIDO DE TIENDA ONLINE!*\n\n*N° Pedido:* #${orderResult.orderNumber}\n*Cliente:* ${customerName}\n*Tel:* ${customerPhone}\n${customerCi || ci ? `*CI:* ${customerCi || ci}\n` : ''}*Dirección:* ${customerAddress || 'No especificada'}\n*Pago:* ${paymentMethod || 'WhatsApp'}\n\n*Productos:*\n${itemsText}\n\n💰 *Total:* $${Number(totalAmount).toFixed(2)}\n${notes ? `📝 *Notas:* ${notes}` : ''}`;

          // If supplierUsername starts with chat_id or username
          console.log('[Store Orders] Notifying Telegram bot for new order:', orderResult.orderNumber);
        }
      } catch (tgErr) {
        console.warn('Could not send Telegram notification for order:', tgErr);
      }

      res.status(201).json(orderResult);
    } catch (error: any) {
      console.error('Failed to create order:', error);
      res.status(500).json({ error: error.message || 'Failed to create order' });
    }
  });

  app.put('/api/orders/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Valid order ID is required' });
      }
      const {
        customerName,
        customerPhone,
        customerEmail,
        customerCi,
        ci,
        customerAddress,
        clientAddress,
        shippingAddress,
        deliveryType,
        items,
        totalAmount,
        paymentMethod,
        cardCommissionPercent,
        status,
        paymentVoucher,
        notes,
        trackingNumber,
        trackingCarrier,
        trackingNotes,
      } = req.body;

      const incomingCi = customerCi !== undefined ? customerCi : ci;
      if (incomingCi && typeof incomingCi === 'string' && incomingCi.trim()) {
        const ciVal = validateEcuadorId(incomingCi.trim(), true);
        if (!ciVal.isValid) {
          return res.status(400).json({ error: `Cédula o RUC ecuatoriano inválido: ${ciVal.error}` });
        }
      }

      const updated = await updateCustomerOrder(id, {
        customerName,
        customerPhone,
        customerEmail,
        customerCi: customerCi !== undefined ? customerCi : ci,
        ci: customerCi !== undefined ? customerCi : ci,
        customerAddress: shippingAddress || customerAddress,
        clientAddress,
        shippingAddress,
        deliveryType,
        items,
        totalAmount,
        paymentMethod,
        cardCommissionPercent,
        status,
        paymentVoucher,
        notes,
        trackingNumber,
        trackingCarrier,
        trackingNotes,
        purchaseAction: req.body.purchaseAction,
      });

      res.json(updated);
    } catch (error: any) {
      console.error('Failed to update order details:', error);
      res.status(400).json({ error: error.message || 'Failed to update order details' });
    }
  });

  app.put('/api/orders/:id/status', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { status, paymentVoucher, notes, trackingNumber, trackingCarrier, trackingNotes, purchaseAction, paymentMethod, cardCommissionPercent, bypassSupplierBlock, bankOrAccount, customerCi, ci } = req.body;
      if (isNaN(id) || !status) {
        return res.status(400).json({ error: 'Valid ID and status are required' });
      }

      const statusCi = customerCi || ci;
      if (statusCi && typeof statusCi === 'string' && statusCi.trim()) {
        const ciVal = validateEcuadorId(statusCi.trim(), true);
        if (!ciVal.isValid) {
          return res.status(400).json({ error: `Cédula o RUC ecuatoriano inválido: ${ciVal.error}` });
        }
      }

      const updated = await updateCustomerOrderStatus(
        id,
        status,
        paymentVoucher,
        notes,
        trackingNumber,
        trackingCarrier,
        trackingNotes,
        purchaseAction,
        paymentMethod,
        bypassSupplierBlock,
        bankOrAccount,
        customerCi || ci,
        cardCommissionPercent
      );
      res.json(updated);
    } catch (error: any) {
      console.error('Failed to update order status:', error);
      res.status(400).json({ error: error.message || 'Failed to update order status' });
    }
  });

  // Buyer public endpoint to track their order
  app.post('/api/orders/track', async (req: Request, res: Response) => {
    try {
      const { query } = req.body;
      if (!query || !String(query).trim()) {
        return res.status(400).json({ error: 'Número de pedido o teléfono requerido' });
      }
      const q = String(query).trim().toLowerCase();
      const allOrders = await getCustomerOrders();
      const found = allOrders.filter((o) => {
        const ordNum = String(o.orderNumber || '').toLowerCase();
        const phone = String(o.customerPhone || '').replace(/\D/g, '');
        const qDigits = q.replace(/\D/g, '');
        return (
          ordNum === q ||
          ordNum === `#${q}` ||
          ordNum.includes(q) ||
          String(o.id) === q ||
          (qDigits.length >= 6 && phone.includes(qDigits))
        );
      });

      if (found.length === 0) {
        return res.status(404).json({ error: 'No se encontró ningún pedido con esos datos' });
      }

      res.json({ orders: found });
    } catch (error: any) {
      console.error('Error tracking order:', error);
      res.status(500).json({ error: 'Error al consultar pedido' });
    }
  });

  // Buyer public endpoint to confirm payment voucher / sale
  app.post('/api/orders/buyer-confirm', async (req: Request, res: Response) => {
    try {
      const { orderNumber, paymentVoucher, notes } = req.body;
      if (!orderNumber) {
        return res.status(400).json({ error: 'Número de pedido requerido' });
      }
      const allOrders = await getCustomerOrders();
      const q = String(orderNumber).trim().toLowerCase();
      const order = allOrders.find((o) => {
        const ordNum = String(o.orderNumber || '').toLowerCase();
        return ordNum === q || ordNum === `#${q}` || String(o.id) === q;
      });

      if (!order) {
        return res.status(404).json({ error: 'Pedido no encontrado' });
      }

      const noteText = notes ? `[Confirmación Comprador]: ${notes}` : '[Comprobante registrado por el comprador]';
      const updatedNotes = order.notes ? `${order.notes}\n${noteText}` : noteText;

      const updated = await updateCustomerOrderStatus(
        order.id,
        'confirmed',
        paymentVoucher || order.paymentVoucher,
        updatedNotes
      );

      res.json({ success: true, order: updated });
    } catch (error: any) {
      console.error('Error confirming order by buyer:', error);
      res.status(400).json({ error: error.message || 'Error al registrar confirmación del pedido' });
    }
  });

  app.delete('/api/orders/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Valid ID is required' });
      }
      const purchaseAction = (req.query.purchaseAction as 'cancel' | 'keep') || req.body?.purchaseAction;
      const result = await deleteCustomerOrder(id, purchaseAction);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to delete order:', error);
      res.status(400).json({ error: error.message || 'Failed to delete order' });
    }
  });

  // 9b. Auto-generate supplier purchase from customer order (Bajo Pedido / Sin Stock)
  app.post('/api/orders/:id/generate-purchase', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Valid customer order ID is required' });
      }
      const result = await autoGeneratePurchaseForOrder(id, req.dbUserId);
      res.status(201).json(result);
    } catch (error: any) {
      console.error('Failed to generate supplier purchase for order:', error);
      res.status(500).json({ error: error.message || 'Error al generar orden de compra a proveedor' });
    }
  });

  // 9c. Partial Delivery Registration (Entregar unidades disponibles hoy y dejar faltante pendiente)
  app.post('/api/orders/:id/partial-delivery', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Valid customer order ID is required' });
      }
      const { deliveries, notes, deductStock } = req.body;
      if (!Array.isArray(deliveries)) {
        return res.status(400).json({ error: 'Array de entregas (deliveries) es requerido' });
      }
      const result = await recordPartialDelivery(id, { deliveries, notes, deductStock }, req.dbUserId);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to record partial delivery:', error);
      res.status(500).json({ error: error.message || 'Error al registrar la entrega parcial' });
    }
  });

  // 9d. Complete Remaining Delivery (Entregar el saldo pendiente que llegó de proveedor)
  app.post('/api/orders/:id/complete-delivery', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Valid customer order ID is required' });
      }
      const result = await completeOrderRemainingDelivery(id, req.dbUserId);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to complete remaining delivery:', error);
      res.status(500).json({ error: error.message || 'Error al completar la entrega del saldo restante' });
    }
  });

  // 9e. Customer Return (RMA / Devolución de Cliente con reingreso a stock o garantía y liquidación contable en pagos)
  app.post('/api/orders/:id/returns', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Valid customer order ID is required' });
      }
      const {
        returns,
        reason,
        disposition,
        refundAmount,
        notes,
        settlementType,
        paymentMethod,
        bankOrAccount,
        returnVoucher,
        processPaymentInTreasury,
        paymentDate,
      } = req.body;
      if (!Array.isArray(returns) || returns.length === 0) {
        return res.status(400).json({ error: 'Array de productos devueltos (returns) es requerido' });
      }
      const result = await recordCustomerReturn(
        id,
        {
          returns,
          reason,
          disposition: disposition || 'restock',
          refundAmount,
          settlementType,
          paymentMethod,
          bankOrAccount,
          returnVoucher,
          processPaymentInTreasury,
          paymentDate,
          notes,
        },
        req.dbUserId
      );
      res.json(result);
    } catch (error: any) {
      console.error('Failed to record customer return (RMA):', error);
      res.status(500).json({ error: error.message || 'Error al registrar la devolución del cliente (RMA)' });
    }
  });

  // ==========================================
  // 10. PURCHASES & SUPPLIER ORDERS API ROUTES
  // ==========================================

  app.get('/api/purchases', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const status = req.query.status as string;
      const supplierName = req.query.supplierName as string;
      const linkedOrderId = req.query.linkedOrderId ? parseInt(req.query.linkedOrderId as string, 10) : undefined;

      const purchasesList = await getPurchases(req.dbUserId, {
        status,
        supplierName,
        linkedCustomerOrderId: linkedOrderId,
      });

      res.json(purchasesList);
    } catch (error: any) {
      console.error('Failed to fetch purchases:', error);
      res.status(500).json({ error: error.message || 'Error al obtener compras a proveedores' });
    }
  });

  app.post('/api/purchases', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const {
        supplierName,
        supplierContact,
        items,
        totalCost,
        status,
        paymentStatus,
        linkedCustomerOrderId,
        linkedCustomerOrderNumber,
        receiptVoucher,
        notes,
        purchaseDate,
      } = req.body;

      if (!supplierName || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'El nombre del proveedor y al menos un producto son requeridos' });
      }

      const result = await createPurchase({
        userId: req.dbUserId || 1,
        supplierName,
        supplierContact,
        items,
        totalCost,
        status: status || 'pending',
        paymentStatus: paymentStatus || 'unpaid',
        linkedCustomerOrderId: linkedCustomerOrderId ? parseInt(linkedCustomerOrderId, 10) : undefined,
        linkedCustomerOrderNumber,
        receiptVoucher,
        notes,
        purchaseDate,
      });

      res.status(201).json(result);
    } catch (error: any) {
      console.error('Failed to create purchase:', error);
      res.status(500).json({ error: error.message || 'Error al registrar la compra al proveedor' });
    }
  });

  // Confirm Purchase with Supplier (moves pending -> ordered/confirmado)
  app.post('/api/purchases/:id/confirm', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID de compra no válido' });
      }

      const result = await confirmPurchase(id);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to confirm purchase:', error);
      res.status(400).json({ error: error.message || 'Error al confirmar la compra con el proveedor' });
    }
  });

  app.get('/api/purchases/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID de compra no válido' });
      }
      const purchase = await getPurchaseById(id);
      if (!purchase) {
        return res.status(404).json({ error: 'Compra no encontrada' });
      }
      res.json(purchase);
    } catch (error: any) {
      console.error('Failed to fetch purchase by id:', error);
      res.status(500).json({ error: error.message || 'Error al obtener detalle de compra' });
    }
  });

  app.put('/api/purchases/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID de compra no válido' });
      }

      const existingPurchase = await getPurchaseById(id);
      if (!existingPurchase) {
        return res.status(404).json({ error: 'Compra no encontrada' });
      }

      // Regla ERP: Las compras generadas automáticamente por pedidos de venta no deben poder ser editadas desde el menú de compras
      const isAutoFromSales = Boolean(existingPurchase.linkedCustomerOrderId || existingPurchase.linkedCustomerOrderNumber);
      if (isAutoFromSales) {
        const isEditingData =
          req.body.items !== undefined ||
          req.body.totalCost !== undefined ||
          req.body.supplierName !== undefined ||
          req.body.supplierContact !== undefined ||
          req.body.purchaseDate !== undefined;

        if (isEditingData) {
          return res.status(403).json({
            error: `Integridad de Datos ERP: La orden #${existingPurchase.purchaseNumber} fue generada automáticamente por el Pedido de Venta #${existingPurchase.linkedCustomerOrderNumber || existingPurchase.linkedCustomerOrderId}. No se puede editar desde el menú de compras.`,
          });
        }
      }

      const updated = await updatePurchase(id, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error('Failed to update purchase:', error);
      res.status(400).json({ error: error.message || 'Error al actualizar la compra' });
    }
  });

  // 1-Click Receive Stock in Warehouse
  app.post('/api/purchases/:id/receive', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID de compra no válido' });
      }

      const result = await receivePurchase(id);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to receive purchase stock:', error);
      res.status(400).json({ error: error.message || 'Error al ingresar compra al inventario' });
    }
  });

  app.put('/api/purchases/:id/receive', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID de compra no válido' });
      }

      const result = await receivePurchase(id);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to receive purchase stock:', error);
      res.status(400).json({ error: error.message || 'Error al ingresar compra al inventario' });
    }
  });

  // Staged / Partial Delivery Reception from Supplier
  app.post('/api/purchases/:id/partial-reception', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID de compra no válido' });
      }

      const result = await recordPurchasePartialReception(id, req.body, req.dbUserId || 1);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to record partial reception:', error);
      res.status(400).json({ error: error.message || 'Error al registrar la recepción parcial de mercadería' });
    }
  });

  // Return of goods to supplier (Nota de Devolución)
  app.post('/api/purchases/:id/return', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID de compra no válido' });
      }

      const result = await recordPurchaseReturn(id, req.body, req.dbUserId || 1);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to record purchase return:', error);
      res.status(400).json({ error: error.message || 'Error al registrar devolución al proveedor' });
    }
  });

  app.delete('/api/purchases/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID de compra no válido' });
      }

      const result = await deletePurchase(id);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to delete purchase:', error);
      res.status(400).json({ error: error.message || 'Error al eliminar la compra' });
    }
  });

  // ==========================================
  // 10c. TEST DATA CLEANER / RESET TESTING ENVIRONMENT API
  // ==========================================
  app.get('/api/admin/dev-stats', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const stats = await getDevTestingStats(req.dbUserId);
      res.json(stats);
    } catch (error: any) {
      console.error('Failed to fetch dev testing stats:', error);
      res.status(500).json({ error: error.message || 'Error al obtener estadísticas de prueba' });
    }
  });

  app.post('/api/admin/clean-test-data', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { action, actions, targetStockQuantity } = req.body || {};
      const validActions = [
        'orders',
        'purchases',
        'customers',
        'suppliers',
        'payments',
        'products',
        'telegram',
        'analytics',
        'reset_stock',
        'reset_customer_balances',
        'reset_supplier_balances',
        'sri_invoices',
        'all_transactions',
        'reset_all',
        'reset_all_with_products',
      ];

      const requestedActions: string[] = Array.isArray(actions)
        ? actions.filter((act) => validActions.includes(act))
        : action && validActions.includes(action)
          ? [action]
          : [];

      if (requestedActions.length === 0) {
        return res.status(400).json({ error: `Debe proporcionar al menos una acción válida. Opciones válidas: ${validActions.join(', ')}` });
      }

      const results: Array<{ action: string; message?: string }> = [];
      const messages: string[] = [];

      for (const act of requestedActions) {
        const result = await cleanTestData(act as any, req.dbUserId, { targetStockQuantity });
        results.push({ action: act, message: result.message });
        if (result.message) {
          messages.push(result.message);
        }
      }

      const finalMessage = requestedActions.length === 1
        ? (messages[0] || 'Limpieza completada con éxito.')
        : `Limpieza completada con éxito (${requestedActions.length} secciones procesadas).`;

      res.json({
        success: true,
        message: finalMessage,
        details: results,
      });
    } catch (error: any) {
      console.error('Failed to clean test data:', error);
      res.status(500).json({ error: error.message || 'Error al limpiar datos de prueba' });
    }
  });

  app.post('/api/admin/seed-test-data', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { seedOrders, seedPurchases, seedCustomers, seedSuppliers, seedPayments } = req.body || {};
      const result = await seedTestData(req.dbUserId, {
        seedOrders,
        seedPurchases,
        seedCustomers,
        seedSuppliers,
        seedPayments,
      });
      res.json(result);
    } catch (error: any) {
      console.error('Failed to seed test data:', error);
      res.status(500).json({ error: error.message || 'Error al generar datos de prueba' });
    }
  });

  // ==========================================
  // 10b. FINANCIAL REPORTS & MARGIN SUMMARY API
  // ==========================================

  app.get('/api/finances/summary', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const period = (req.query.period as string) || 'all';
      const summary = await getFinancialSummary(req.dbUserId, period);
      res.json(summary);
    } catch (error: any) {
      console.error('Failed to fetch financial summary:', error);
      res.status(500).json({ error: error.message || 'Error al calcular resumen financiero' });
    }
  });

  // =========================================================================
  // 10c. ERP PAYMENTS & TREASURY API (Cobros CxC, Pagos CxP, Flujo de Caja)
  // =========================================================================

  // List payments with filters
  app.get('/api/payments', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const {
        type,
        category,
        status,
        paymentMethod,
        bankOrAccount,
        orderId,
        purchaseId,
        customerId,
        startDate,
        endDate,
        search,
      } = req.query;

      const filters: any = {};
      if (type) filters.type = String(type);
      if (category) filters.category = String(category);
      if (status) filters.status = String(status);
      if (paymentMethod) filters.paymentMethod = String(paymentMethod);
      if (bankOrAccount) filters.bankOrAccount = String(bankOrAccount);
      if (orderId) filters.orderId = parseInt(String(orderId), 10);
      if (purchaseId) filters.purchaseId = parseInt(String(purchaseId), 10);
      if (customerId) filters.customerId = parseInt(String(customerId), 10);
      if (startDate) filters.startDate = String(startDate);
      if (endDate) filters.endDate = String(endDate);
      if (search) filters.search = String(search);

      const list = await getPayments(req.dbUserId, filters);
      res.json(list);
    } catch (error: any) {
      console.error('Failed to fetch payments:', error);
      res.status(500).json({ error: error.message || 'Error al obtener registros de pagos' });
    }
  });

  // Treasury overview dashboard
  app.get('/api/payments/treasury/dashboard', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const dashboard = await getTreasuryDashboard(req.dbUserId);
      res.json(dashboard);
    } catch (error: any) {
      console.error('Failed to fetch treasury dashboard:', error);
      res.status(500).json({ error: error.message || 'Error al calcular panel de tesorería' });
    }
  });

  // Accounts Receivable (CxC) list
  app.get('/api/payments/receivables/list', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const receivables = await getAccountsReceivable(req.dbUserId);
      res.json(receivables);
    } catch (error: any) {
      console.error('Failed to fetch accounts receivable:', error);
      res.status(500).json({ error: error.message || 'Error al obtener cuentas por cobrar' });
    }
  });

  // Accounts Payable (CxP) list
  app.get('/api/payments/payables/list', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const payables = await getAccountsPayable(req.dbUserId);
      res.json(payables);
    } catch (error: any) {
      console.error('Failed to fetch accounts payable:', error);
      res.status(500).json({ error: error.message || 'Error al obtener cuentas por pagar' });
    }
  });

  // Get single payment
  app.get('/api/payments/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID de pago inválido' });
      const payment = await getPaymentById(id);
      if (!payment) return res.status(404).json({ error: 'Comprobante de pago no encontrado' });
      res.json(payment);
    } catch (error: any) {
      console.error('Failed to fetch payment by ID:', error);
      res.status(500).json({ error: error.message || 'Error al consultar pago' });
    }
  });

  // Create payment (inflow / outflow / refund / expense)
  app.post('/api/payments', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const {
        type,
        category,
        amount,
        paymentMethod,
        bankOrAccount,
        referenceNumber,
        paymentDate,
        status,
        notes,
        voucherUrl,
        orderId,
        orderNumber,
        customerId,
        customerName,
        purchaseId,
        purchaseNumber,
        supplierName,
        returnId,
      } = req.body;

      if (amount === undefined || amount === null || amount === '' || isNaN(Number(amount)) || Number(amount) < 0) {
        return res.status(400).json({ error: 'El monto debe ser mayor o igual a 0.00' });
      }

      if (!paymentMethod) {
        return res.status(400).json({ error: 'El método de pago es requerido' });
      }

      const created = await createPayment(req.dbUserId || 1, {
        type: type || 'inflow',
        category,
        amount,
        paymentMethod,
        bankOrAccount: bankOrAccount || deriveBankOrAccountFromMethod(paymentMethod, notes),
        referenceNumber,
        paymentDate,
        status: status || 'completed',
        notes,
        voucherUrl,
        orderId: orderId ? parseInt(orderId, 10) : undefined,
        orderNumber,
        customerId: customerId ? parseInt(customerId, 10) : undefined,
        customerName,
        purchaseId: purchaseId ? parseInt(purchaseId, 10) : undefined,
        purchaseNumber,
        supplierName,
        returnId,
      });

      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to create payment:', error);
      res.status(500).json({ error: error.message || 'Error al registrar comprobante de pago' });
    }
  });

  // Update payment
  app.put('/api/payments/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID de pago inválido' });

      const updated = await updatePayment(id, req.body);
      if (!updated) return res.status(404).json({ error: 'Comprobante de pago no encontrado' });
      res.json(updated);
    } catch (error: any) {
      console.error('Failed to update payment:', error);
      res.status(500).json({ error: error.message || 'Error al actualizar comprobante de pago' });
    }
  });

  // Void payment with audit log
  app.post('/api/payments/:id/void', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID de pago inválido' });

      const { reason } = req.body || {};
      const voided = await voidPayment(id, reason);
      if (!voided) return res.status(404).json({ error: 'Comprobante de pago no encontrado' });
      res.json(voided);
    } catch (error: any) {
      console.error('Failed to void payment:', error);
      res.status(500).json({ error: error.message || 'Error al anular comprobante de pago' });
    }
  });

  // Delete payment
  app.delete('/api/payments/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID de pago inválido' });

      const result = await deletePayment(id);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to delete payment:', error);
      res.status(500).json({ error: error.message || 'Error al eliminar comprobante de pago' });
    }
  });

  // Sync historical ledger
  app.post('/api/payments/sync-ledger', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const result = await syncPaymentsFromOrdersAndPurchases(req.dbUserId || 1);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to sync payments ledger:', error);
      res.status(500).json({ error: error.message || 'Error al sincronizar tesorería' });
    }
  });

  // 10a2. Store Analytics & Traffic Tracking Endpoints
  app.post('/api/analytics/event', async (req: Request, res: Response) => {
    try {
      const { eventType, productId, productName, sessionId, deviceType, metadata } = req.body || {};
      if (!eventType) {
        return res.status(400).json({ error: 'eventType is required' });
      }
      const result = await recordAnalyticsEvent({
        eventType,
        productId: productId ? parseInt(productId, 10) : undefined,
        productName,
        sessionId,
        deviceType,
        metadata,
      });
      res.json(result);
    } catch (error: any) {
      console.error('Failed to record analytics event:', error);
      res.status(500).json({ error: error.message || 'Failed to record event' });
    }
  });

  app.get('/api/analytics/dashboard', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const period = (req.query.period as any) || '7d';
      const productId = req.query.productId ? parseInt(req.query.productId as string, 10) : undefined;
      const dashboard = await getStoreAnalyticsDashboard({
        userId: req.dbUserId,
        period,
        productId,
      });
      res.json(dashboard);
    } catch (error: any) {
      console.error('Failed to load analytics dashboard:', error);
      res.status(500).json({ error: error.message || 'Failed to load analytics dashboard' });
    }
  });

  app.post('/api/analytics/reset', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      // 1. Restrict operators (non-admin users)
      if (req.user && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Solo el usuario administrador tiene permisos para reiniciar las estadísticas de la tienda.' });
      }

      const { password } = req.body || {};

      // 2. If caller is not authenticated via session token, check password if provided
      if (!req.user && password && typeof password === 'string' && password.trim()) {
        const targetUserId = req.dbUserId || 1;
        const isValidPassword = await verifyUserPasswordById(targetUserId, password);
        if (!isValidPassword) {
          return res.status(401).json({ error: 'Contraseña incorrecta. No se autorizó el reinicio de estadísticas.' });
        }
      }

      const result = await resetStoreAnalytics(req.dbUserId);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to reset analytics:', error);
      res.status(500).json({ error: error.message || 'Failed to reset analytics' });
    }
  });

  // 10b. Customer CRM Endpoints
  app.get('/api/customers', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { search } = req.query;
      const customers = await getCustomers(req.dbUserId, typeof search === 'string' ? search : undefined);
      res.json(customers);
    } catch (error: any) {
      console.error('Failed to fetch customers:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch customers' });
    }
  });

  app.get('/api/customers/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Valid customer ID is required' });
      const customer = await getCustomerById(id);
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      res.json(customer);
    } catch (error: any) {
      console.error('Failed to fetch customer:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch customer' });
    }
  });

  app.post('/api/customers', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { fullName, name, phone, ci, email, province, canton, parish, fullAddress, address, exactAddress, reference, notes } = req.body;
      const cleanName = (fullName || name || '').trim();
      const cleanPhone = (phone || '').trim();
      const cleanCi = (ci || '').trim();

      if (!cleanName) {
        return res.status(400).json({ error: 'El nombre completo del cliente es obligatorio' });
      }
      if (!cleanPhone) {
        return res.status(400).json({ error: 'El teléfono del cliente es obligatorio' });
      }
      if (!cleanCi) {
        return res.status(400).json({ error: 'El número de cédula o RUC es obligatorio para registrar un cliente' });
      }

      const ciValidation = validateEcuadorId(cleanCi, true);
      if (!ciValidation.isValid) {
        return res.status(400).json({ error: `Cédula o RUC ecuatoriano inválido: ${ciValidation.error}` });
      }

      const customer = await createCustomer({
        userId: req.dbUserId || 1,
        fullName: cleanName,
        name: cleanName,
        phone: cleanPhone,
        ci: cleanCi,
        email,
        province,
        canton,
        parish,
        address: address ? address.trim() : undefined,
        fullAddress: (fullAddress || exactAddress) ? (fullAddress || exactAddress).trim() : undefined,
        exactAddress: exactAddress ? exactAddress.trim() : undefined,
        reference,
        notes,
      });
      res.status(201).json(customer);
    } catch (error: any) {
      console.error('Failed to create customer:', error);
      res.status(500).json({ error: error.message || 'Failed to create customer' });
    }
  });

  app.put('/api/customers/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Valid customer ID is required' });
      if (req.body.ci && typeof req.body.ci === 'string' && req.body.ci.trim()) {
        const ciVal = validateEcuadorId(req.body.ci.trim(), true);
        if (!ciVal.isValid) {
          return res.status(400).json({ error: `Cédula o RUC ecuatoriano inválido: ${ciVal.error}` });
        }
      }
      const updated = await updateCustomer(id, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error('Failed to update customer:', error);
      res.status(500).json({ error: error.message || 'Failed to update customer' });
    }
  });

  app.delete('/api/customers/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Valid customer ID is required' });
      const result = await deleteCustomer(id);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to delete customer:', error);
      res.status(500).json({ error: error.message || 'Failed to delete customer' });
    }
  });

  app.post('/api/customers/sync-orders', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const result = await syncCustomersFromOrders(req.dbUserId || 1);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to sync customers from orders:', error);
      res.status(500).json({ error: error.message || 'Failed to sync customers' });
    }
  });

  // ==========================================
  // 10d. SUPPLIER & VENDOR ERP CRM ENDPOINTS
  // ==========================================
  app.get('/api/suppliers', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { search } = req.query;
      const list = await getSuppliers(req.dbUserId, typeof search === 'string' ? search : undefined);
      res.json(list);
    } catch (error: any) {
      console.error('Failed to fetch suppliers:', error);
      res.status(500).json({ error: error.message || 'Error al obtener lista de proveedores' });
    }
  });

  app.get('/api/suppliers/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID de proveedor no válido' });
      const supplier = await getSupplierById(id);
      if (!supplier) return res.status(404).json({ error: 'Proveedor no encontrado' });
      res.json(supplier);
    } catch (error: any) {
      console.error('Failed to fetch supplier by ID:', error);
      res.status(500).json({ error: error.message || 'Error al consultar proveedor' });
    }
  });

  app.post('/api/suppliers', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const {
        name,
        tradeName,
        ruc,
        phone,
        email,
        contactPerson,
        contactPersonPhone,
        contactPersonRole,
        category,
        country,
        city,
        address,
        website,
        paymentTerms,
        creditLimit,
        bankDetails,
        bankInfo,
        leadTimeDays,
        rating,
        status,
        notes,
      } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'El nombre o razón social del proveedor es obligatorio' });
      }

      if (ruc && typeof ruc === 'string' && ruc.trim()) {
        const rVal = validateEcuadorId(ruc.trim(), true);
        if (!rVal.isValid) {
          return res.status(400).json({ error: `RUC o Cédula del proveedor inválida: ${rVal.error}` });
        }
      }

      if (bankInfo?.holderId && typeof bankInfo.holderId === 'string' && bankInfo.holderId.trim()) {
        const hVal = validateEcuadorId(bankInfo.holderId.trim(), true);
        if (!hVal.isValid) {
          return res.status(400).json({ error: `RUC o Cédula del titular bancario inválida: ${hVal.error}` });
        }
      }

      const supplier = await createSupplier({
        userId: req.dbUserId || 1,
        name,
        tradeName,
        ruc,
        phone,
        email,
        contactPerson,
        contactPersonPhone,
        contactPersonRole,
        category,
        country,
        city,
        address,
        website,
        paymentTerms,
        creditLimit,
        bankDetails,
        bankInfo,
        leadTimeDays,
        rating,
        status,
        notes,
      });

      res.status(201).json(supplier);
    } catch (error: any) {
      console.error('Failed to create supplier:', error);
      res.status(500).json({ error: error.message || 'Error al registrar el proveedor' });
    }
  });

  app.put('/api/suppliers/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID de proveedor no válido' });

      const { ruc, bankInfo } = req.body || {};
      if (ruc && typeof ruc === 'string' && ruc.trim()) {
        const rVal = validateEcuadorId(ruc.trim(), true);
        if (!rVal.isValid) {
          return res.status(400).json({ error: `RUC o Cédula del proveedor inválida: ${rVal.error}` });
        }
      }
      if (bankInfo?.holderId && typeof bankInfo.holderId === 'string' && bankInfo.holderId.trim()) {
        const hVal = validateEcuadorId(bankInfo.holderId.trim(), true);
        if (!hVal.isValid) {
          return res.status(400).json({ error: `RUC o Cédula del titular bancario inválida: ${hVal.error}` });
        }
      }

      const updated = await updateSupplier(id, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error('Failed to update supplier:', error);
      res.status(500).json({ error: error.message || 'Error al actualizar proveedor' });
    }
  });

  app.delete('/api/suppliers/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID de proveedor no válido' });
      const result = await deleteSupplier(id);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to delete supplier:', error);
      res.status(500).json({ error: error.message || 'Error al eliminar proveedor' });
    }
  });

  app.post('/api/suppliers/sync', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const result = await syncSuppliersFromPurchasesAndInventory(req.dbUserId || 1);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to sync suppliers:', error);
      res.status(500).json({ error: error.message || 'Error al sincronizar catálogo de proveedores' });
    }
  });

  // 11. Database Info and Diagnostics
  app.get('/api/server/database-info', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const dbInfo = await getDatabaseRuntimeInfo();
      const items = await getInventoryItems(req.dbUserId);
      const orders = await getCustomerOrders(req.dbUserId);
      const messages = await getTelegramMessages(req.dbUserId);

      res.json({
        ...dbInfo,
        stats: {
          totalProducts: items.length,
          totalOrders: orders.length,
          totalMessages: messages.length,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Error al obtener información de la base de datos' });
    }
  });

  // 11b. Server Domain & Subdomain Routing Configuration
  app.get('/api/server/domain-config', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const config = await getServerDomainConfig(req.dbUserId || 1);
      res.json(config);
    } catch (error: any) {
      console.error('Error fetching server domain config:', error);
      res.status(500).json({ error: error.message || 'Error al obtener configuración de dominios' });
    }
  });

  app.post('/api/server/domain-config', requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { adminDomain, storeDomain, autoRouting, defaultFallbackView } = req.body || {};
      const updated = await updateServerDomainConfig(req.dbUserId || 1, {
        adminDomain,
        storeDomain,
        autoRouting,
        defaultFallbackView,
      });
      res.json({
        success: true,
        message: 'Configuración de dominios y subdominios actualizada correctamente',
        config: updated,
      });
    } catch (error: any) {
      console.error('Error updating server domain config:', error);
      res.status(500).json({ error: error.message || 'Error al guardar configuración de dominios' });
    }
  });

  // 12. Test Database Connection on demand
  app.post('/api/server/test-db-connection', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const result = await testDatabaseConnection(req.body || {});
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message || 'Error en prueba de conexión' });
    }
  });

  // 13. Export Complete SQL DDL and Data (100% full system backup)
  const handleExportSql = async (req: AuthRequest, res: Response) => {
    try {
      const sqlDump = await generateCompleteSqlDump(req.dbUserId);
      const filename = `comerxia_backup_completo_${new Date().toISOString().slice(0, 10)}.sql`;
      res.setHeader('Content-Type', 'application/sql; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(sqlDump);
    } catch (error: any) {
      console.error('Error generating full SQL export:', error);
      res.status(500).json({ error: 'Failed to generate full SQL export: ' + error.message });
    }
  };

  app.get('/api/export-sql', optionalAuth, handleExportSql);
  app.get('/api/export-backup-sql', optionalAuth, handleExportSql);

  // 14. Export Complete JSON Backup - Disabled (SQL is exclusive)
  app.get('/api/export-backup-json', optionalAuth, async (_req: Request, res: Response) => {
    res.status(400).json({ error: 'La exportación en formato JSON ya no está disponible. El sistema opera exclusivamente con PostgreSQL (SQL).' });
  });

  // 14a. Export All-in-One Master ZIP (SQL + JSON + All Photos & Videos in uploads/ + Manifest + Restore script)
  app.get('/api/export-master-zip', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const masterZipBuffer = await createFullSystemMasterZip(req.dbUserId);
      const filename = `comerxia_respaldo_maestro_completo_${new Date().toISOString().slice(0, 10)}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', masterZipBuffer.length);
      res.send(masterZipBuffer);
    } catch (error: any) {
      console.error('Error creating master full system zip:', error);
      res.status(500).json({ success: false, error: error.message || 'Error al generar respaldo maestro ZIP' });
    }
  });

  // 14b. Uploads / Media Backup & Restore Endpoints
  const uploadZipMiddleware = multer({
    dest: os.tmpdir(),
    limits: {
      fileSize: 1024 * 1024 * 1024, // Max 1024MB (1GB) ZIP
      fieldSize: 1024 * 1024 * 1024,
    },
  });

  const handleZipUploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
    uploadZipMiddleware.single('file')(req, res, (err: any) => {
      if (err) {
        console.error('[Multer ZIP Upload Error]:', err);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            error: 'El archivo ZIP excede el tamaño máximo permitido del servidor Node.js (1 GB).',
          });
        }
        return res.status(400).json({
          success: false,
          error: err.message || 'Error al procesar la subida del archivo ZIP',
        });
      }
      next();
    });
  };

  app.get('/api/media/stats', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const stats = getUploadsStats();
      res.json({ success: true, ...stats });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Error al obtener estadísticas de imágenes' });
    }
  });

  app.get('/api/media/diagnostics', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const items = await getInventoryItems(req.dbUserId);
      const uploadsDir = ensureUploadsDirExists();
      const existingFiles = new Set(fs.readdirSync(uploadsDir));

      let totalChecked = 0;
      let existingCount = 0;
      const missingFiles: string[] = [];

      for (const item of items) {
        const checkMedia = (url?: string | null) => {
          if (!url) return;
          if (url.includes('/uploads/')) {
            totalChecked++;
            const basename = url.split('/uploads/')[1]?.split('?')[0];
            if (basename) {
              if (existingFiles.has(basename)) {
                existingCount++;
              } else {
                missingFiles.push(basename);
              }
            }
          }
        };

        checkMedia(item.imageUrl);
        checkMedia(item.videoUrl);
        if (item.extractedAttributes) {
          try {
            const parsed = JSON.parse(item.extractedAttributes);
            if (Array.isArray(parsed.images)) {
              parsed.images.forEach((img: string) => checkMedia(img));
            }
          } catch {}
        }
      }

      const totalPhysicalFiles = existingFiles.size;

      res.json({
        success: true,
        totalChecked,
        existingCount,
        missingCount: missingFiles.length,
        missingFiles: missingFiles.slice(0, 50),
        totalPhysicalFiles,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Error al diagnosticar imágenes' });
    }
  });

  app.get('/api/backup/master-zip', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const zipBuffer = await createFullSystemMasterZip(req.dbUserId || 1);

      const dateStr = getEcuadorLocalDate();
      const filename = `comerxia_respaldo_maestro_${dateStr}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', zipBuffer.length);
      res.send(zipBuffer);
    } catch (error: any) {
      console.error('Error generating master zip backup:', error);
      res.status(500).json({ success: false, error: error.message || 'Error al generar respaldo maestro ZIP' });
    }
  });

  app.get('/api/export-uploads-zip', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const zipBuffer = await createUploadsZipBuffer();
      const filename = `comerxia_imagenes_${new Date().toISOString().slice(0, 10)}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', zipBuffer.length);
      res.send(zipBuffer);
    } catch (error: any) {
      console.error('Error exporting uploads zip:', error);
      res.status(500).json({ success: false, error: error.message || 'Error al generar ZIP de imágenes' });
    }
  });

  app.get('/api/export-products-financial-excel', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const excelBuffer = await generateFinancialProductsExcelBuffer(req.dbUserId || 1);
      const filename = `comerxia_reporte_financiero_productos_${new Date().toISOString().slice(0, 10)}.xlsx`;

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', excelBuffer.length);
      res.send(excelBuffer);
    } catch (error: any) {
      console.error('Error exporting financial products excel:', error);
      res.status(500).json({ success: false, error: error.message || 'Error al generar Excel de productos' });
    }
  });

  app.post('/api/restore-uploads-zip', requireAuth, handleZipUploadMiddleware, async (req: AuthRequest, res: Response) => {
    let tempPath: string | null = null;
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Debe adjuntar un archivo ZIP válido con las imágenes' });
      }

      tempPath = req.file.path || null;
      const fileBuffer = req.file.buffer || (tempPath && fs.existsSync(tempPath) ? fs.readFileSync(tempPath) : null);

      if (!fileBuffer) {
        return res.status(400).json({ success: false, error: 'No se pudieron leer los datos del archivo ZIP de imágenes subido' });
      }

      const result = await restoreUploadsFromZipBuffer(fileBuffer);
      res.json({
        success: true,
        restoredCount: result.restoredCount,
        errors: result.errors,
        message: `Se restauraron exitosamente ${result.restoredCount} archivo(s) multimedia en la carpeta local uploads/`,
      });
    } catch (error: any) {
      console.error('Error restoring uploads zip:', error);
      res.status(500).json({ success: false, error: error.message || 'Error al procesar y restaurar el archivo ZIP' });
    } finally {
      if (tempPath && fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
      }
    }
  });

  // 14c. Restore Master Full System ZIP (One-click migration: extracts media + restores database)
  app.post('/api/restore-master-zip', requireAuth, handleZipUploadMiddleware, async (req: AuthRequest, res: Response) => {
    let tempPath: string | null = null;
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Debe adjuntar un archivo ZIP válido de respaldo maestro' });
      }

      tempPath = req.file.path || null;
      const fileBuffer = req.file.buffer || (tempPath && fs.existsSync(tempPath) ? fs.readFileSync(tempPath) : null);

      if (!fileBuffer) {
        return res.status(400).json({ success: false, error: 'No se pudieron leer los datos del archivo ZIP de respaldo maestro' });
      }

      const result = await restoreMasterFullSystemZip(fileBuffer, req.dbUserId || 1);

      // Auto-resume Telegram polling if token was restored
      try {
        const tgCfg = await getTelegramConfig(req.dbUserId || 1);
        const restoredToken = tgCfg?.botToken?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim();
        if (restoredToken && tgCfg?.isActive !== false) {
          process.env.TELEGRAM_BOT_TOKEN = restoredToken;
          startTelegramPolling(restoredToken, req.dbUserId || 1);
          console.log('[Master Restore] Telegram bot polling successfully resumed with restored token.');
        } else {
          stopTelegramPolling();
        }
      } catch (tgErr) {
        console.warn('[Master Restore] Telegram bot polling resume notice:', tgErr);
      }

      res.json({
        success: true,
        restoredMediaCount: result.restoredMediaCount,
        restoredDbCounts: result.restoredDbCounts,
        errors: result.errors,
        message: `¡Restauración maestra completada! Se restauraron ${result.restoredMediaCount} archivos multimedia y los datos del sistema.`,
      });
    } catch (error: any) {
      console.error('Error restoring master zip:', error);
      res.status(500).json({ success: false, error: error.message || 'Error al procesar respaldo maestro' });
    } finally {
      if (tempPath && fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
      }
    }
  });

  // 14d. Restore Database from JSON
  app.post('/api/restore-backup-json', requireAuth, express.json({ limit: '50mb' }), async (req: AuthRequest, res: Response) => {
    try {
      const backupData = req.body;
      if (!backupData) {
        return res.status(400).json({ success: false, error: 'Datos JSON de respaldo vacíos' });
      }

      const result = await restoreCompleteJsonDump(backupData, req.dbUserId || 1);

      // Auto-resume Telegram polling if token was restored
      try {
        const tgCfg = await getTelegramConfig(req.dbUserId || 1);
        const restoredToken = tgCfg?.botToken?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim();
        if (restoredToken && tgCfg?.isActive !== false) {
          process.env.TELEGRAM_BOT_TOKEN = restoredToken;
          startTelegramPolling(restoredToken, req.dbUserId || 1);
          console.log('[JSON Restore] Telegram bot polling successfully resumed with restored token.');
        } else {
          stopTelegramPolling();
        }
      } catch (tgErr) {
        console.warn('[JSON Restore] Telegram bot polling resume notice:', tgErr);
      }

      res.json({
        success: true,
        counts: result.counts,
        errors: result.errors,
        message: 'Base de datos restaurada exitosamente desde JSON.',
      });
    } catch (error: any) {
      console.error('Error restoring JSON backup:', error);
      res.status(500).json({ success: false, error: error.message || 'Error al restaurar JSON' });
    }
  });

  // 15. Safe Image Download Endpoints (Supports direct attachment streaming for base64 & remote URLs)
  app.post('/api/download-image', async (req: Request, res: Response) => {
    try {
      const { image, filename } = req.body;
      const rawFilename = filename || 'producto.jpg';
      const cleanFilename = String(rawFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
      const finalFilename = /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(cleanFilename)
        ? cleanFilename
        : `${cleanFilename}.jpg`;

      if (!image || typeof image !== 'string') {
        return res.status(400).json({ error: 'Image data is required' });
      }

      // Case 1: Base64 Data URI
      if (image.startsWith('data:')) {
        const matches = image.match(/^data:([A-Za-z0-9\/\-+.]+);base64,(.+)$/s);
        if (matches && matches.length === 3) {
          const mimeType = matches[1];
          const base64Data = matches[2].replace(/[\r\n\s]/g, '');
          const buffer = Buffer.from(base64Data, 'base64');
          res.setHeader('Content-Type', mimeType || 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);
          res.setHeader('Content-Length', buffer.length);
          return res.send(buffer);
        }
      }

      // Case 2: Remote HTTP/HTTPS URL
      if (image.startsWith('http://') || image.startsWith('https://')) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const imgResponse = await fetch(image, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        clearTimeout(timeout);

        if (!imgResponse.ok) {
          return res.status(imgResponse.status).json({ error: 'Failed to fetch remote image' });
        }

        const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
        const arrayBuffer = await imgResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
      }

      return res.status(400).json({ error: 'Unsupported image format' });
    } catch (err: any) {
      console.error('Error in /api/download-image:', err);
      res.status(500).json({ error: err.message || 'Failed to process image download' });
    }
  });

  app.get('/api/download-image-proxy', async (req: Request, res: Response) => {
    try {
      const rawUrl = req.query.url as string;
      const rawFilename = (req.query.filename as string) || 'producto.jpg';
      const cleanFilename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const finalFilename = /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(cleanFilename)
        ? cleanFilename
        : `${cleanFilename}.jpg`;

      if (!rawUrl || typeof rawUrl !== 'string') {
        return res.status(400).json({ error: 'URL is required' });
      }

      // If it's a remote URL (http or https)
      if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const imgResponse = await fetch(rawUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        clearTimeout(timeout);

        if (!imgResponse.ok) {
          return res.status(imgResponse.status).json({ error: 'Failed to fetch upstream image' });
        }

        const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
        const arrayBuffer = await imgResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
      }

      return res.status(400).json({ error: 'Invalid URL scheme' });
    } catch (err: any) {
      console.error('Error in download-image-proxy:', err);
      res.status(500).json({ error: err.message || 'Failed to proxy image download' });
    }
  });

  // =======================================================
  // DIGITAL SIGNAGE (PUBLICIDAD DIGITAL) ENDPOINTS
  // =======================================================

  // 1. Upload Advertising Video or Image
  app.post('/api/digital-signage/videos/upload', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id || 1;
      const { name, videoData, mimeType, duration, fileSize, mediaType: reqMediaType } = req.body;

      if (!videoData || typeof videoData !== 'string') {
        return res.status(400).json({ success: false, error: 'El archivo o datos multimedia son requeridos.' });
      }

      const fileUrl = await persistVideoLocally(videoData);
      if (!fileUrl) {
        return res.status(400).json({ success: false, error: 'No se pudo guardar el archivo multimedia.' });
      }

      // Detect media type (image vs video)
      let mediaType: 'video' | 'image' = 'video';
      if (
        reqMediaType === 'image' ||
        (mimeType && mimeType.startsWith('image/')) ||
        (typeof videoData === 'string' && videoData.startsWith('data:image/')) ||
        /\.(png|jpe?g|webp|gif|svg)$/i.test(fileUrl)
      ) {
        mediaType = 'image';
      }

      // Default duration for slides is 10s if not specified
      const finalDuration = Number(duration) > 0 ? Number(duration) : (mediaType === 'image' ? 10 : 0);

      const video = await createAdvertisingVideo(userId, {
        name: name || (mediaType === 'image' ? 'Imagen Publicitaria' : 'Video Publicitario'),
        mediaType,
        fileUrl,
        thumbnailUrl: mediaType === 'image' ? fileUrl : null,
        duration: finalDuration,
        fileSize: Number(fileSize || 0),
        active: true,
      });

      res.json({ success: true, video });
    } catch (err: any) {
      console.error('Error uploading advertising media:', err);
      res.status(500).json({ success: false, error: err.message || 'Error al subir el archivo multimedia.' });
    }
  });

  // 2. Videos / Media CRUD
  app.get('/api/digital-signage/videos', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id || 1;
      const videos = await getAdvertisingVideos(userId);
      res.json({ success: true, videos });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/digital-signage/videos', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id || 1;
      const { name, fileUrl, thumbnailUrl, duration, fileSize, active, mediaType } = req.body;
      if (!fileUrl) {
        return res.status(400).json({ success: false, error: 'La URL del archivo es obligatoria.' });
      }
      const savedUrl = await persistVideoLocally(fileUrl);
      const isImg = mediaType === 'image' || /\.(png|jpe?g|webp|gif|svg)$/i.test(fileUrl);
      const video = await createAdvertisingVideo(userId, {
        name: name || (isImg ? 'Imagen Publicitaria' : 'Video Publicitario'),
        mediaType: isImg ? 'image' : 'video',
        fileUrl: savedUrl || fileUrl,
        thumbnailUrl: isImg ? (savedUrl || fileUrl) : thumbnailUrl,
        duration: Number(duration) > 0 ? Number(duration) : (isImg ? 10 : 0),
        fileSize,
        active,
      });
      res.json({ success: true, video });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/digital-signage/videos/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id || 1;
      const id = parseInt(req.params.id, 10);
      const updated = await updateAdvertisingVideo(id, userId, req.body);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Video no encontrado.' });
      }
      res.json({ success: true, video: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/digital-signage/videos/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id || 1;
      const id = parseInt(req.params.id, 10);
      const ok = await deleteAdvertisingVideo(id, userId);
      res.json({ success: ok });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. Playlists CRUD
  app.get('/api/digital-signage/playlists', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id || 1;
      const playlists = await getAdvertisingPlaylists(userId);
      res.json({ success: true, playlists });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/digital-signage/playlists', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id || 1;
      const { name, active, videoIds } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: 'El nombre de la playlist es requerido.' });
      }
      const playlist = await createAdvertisingPlaylist(userId, { name, active, videoIds });
      res.json({ success: true, playlist });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/digital-signage/playlists/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id || 1;
      const id = parseInt(req.params.id, 10);
      const playlist = await updateAdvertisingPlaylist(id, userId, req.body);
      if (!playlist) {
        return res.status(404).json({ success: false, error: 'Playlist no encontrada.' });
      }
      res.json({ success: true, playlist });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/digital-signage/playlists/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id || 1;
      const id = parseInt(req.params.id, 10);
      const ok = await deleteAdvertisingPlaylist(id, userId);
      res.json({ success: ok });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. Displays CRUD
  app.get('/api/digital-signage/displays', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id || 1;
      const displays = await getAdvertisingDisplays(userId);
      res.json({ success: true, displays });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/digital-signage/displays', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id || 1;
      const { name, playlistId, active } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: 'El nombre de la pantalla es requerido.' });
      }
      const display = await createAdvertisingDisplay(userId, { name, playlistId, active });
      res.json({ success: true, display });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/digital-signage/displays/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id || 1;
      const id = parseInt(req.params.id, 10);
      const display = await updateAdvertisingDisplay(id, userId, req.body);
      if (!display) {
        return res.status(404).json({ success: false, error: 'Pantalla no encontrada.' });
      }
      res.json({ success: true, display });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/digital-signage/displays/:id/control', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id || 1;
      const id = parseInt(req.params.id, 10);
      const { isPaused, volume, isMuted, loopMode, orientation, commandAction } = req.body;
      const display = await updateAdvertisingDisplay(id, userId, {
        isPaused,
        volume,
        isMuted,
        loopMode,
        orientation,
        commandAction,
      });
      if (!display) {
        return res.status(404).json({ success: false, error: 'Pantalla no encontrada.' });
      }
      res.json({ success: true, display });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/digital-signage/displays/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id || 1;
      const id = parseInt(req.params.id, 10);
      const ok = await deleteAdvertisingDisplay(id, userId);
      res.json({ success: ok });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. Public Playback & Ping (No auth required)
  app.get('/api/public/display/:token', async (req: Request, res: Response) => {
    try {
      const token = req.params.token;
      if (!token) {
        return res.status(400).json({ success: false, error: 'Token no especificado' });
      }

      const config = await getPublicDisplayConfigByToken(token);
      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'Pantalla de publicidad no encontrada, inactiva o con token inválido.',
        });
      }

      // Update heartbeat & current playback index on query
      const rawIdx = req.query.currentIndex;
      const parsedIdx = rawIdx !== undefined ? parseInt(String(rawIdx), 10) : undefined;
      await updateDisplayLastSeen(token, isNaN(parsedIdx!) ? undefined : parsedIdx);

      res.json({ success: true, ...config });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/public/display/:token/ping', async (req: Request, res: Response) => {
    try {
      const token = req.params.token;
      if (!token) {
        return res.status(400).json({ success: false, error: 'Token no especificado' });
      }
      const rawIdx = req.body?.currentIndex ?? req.query?.currentIndex;
      const parsedIdx = rawIdx !== undefined ? parseInt(String(rawIdx), 10) : undefined;
      const ok = await updateDisplayLastSeen(token, isNaN(parsedIdx!) ? undefined : parsedIdx);
      res.json({ success: ok });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Explicit 404 handler for unknown /api routes to prevent falling through to Vite HTML
  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: `Endpoint de API no encontrado: ${req.method} ${req.path}`,
    });
  });

  // Global error handler for Express to guarantee JSON error output
  app.use((err: any, req: Request, res: Response, next: any) => {
    console.error('Express global error handler caught:', err);
    if (res.headersSent) {
      return next(err);
    }
    const statusCode = typeof err?.status === 'number' ? err.status : 500;
    res.status(statusCode).json({
      success: false,
      error: err?.message || 'Error interno del servidor',
    });
  });

  // Vite middleware setup
  const server = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const indexHtmlPath = fs.existsSync(path.join(distPath, 'index.html'))
      ? path.join(distPath, 'index.html')
      : fs.existsSync(path.join(distPath, 'client', 'index.html'))
      ? path.join(distPath, 'client', 'index.html')
      : null;

    app.use(express.static(distPath));
    if (fs.existsSync(path.join(distPath, 'client'))) {
      app.use(express.static(path.join(distPath, 'client')));
    }

    app.get('*', (req, res) => {
      if (indexHtmlPath && fs.existsSync(indexHtmlPath)) {
        res.sendFile(indexHtmlPath);
      } else {
        res.status(404).send('Servidor ejecutándose. Ejecuta npm run build si falta la interfaz.');
      }
    });
  }

  server.listen(PORT, '0.0.0.0', async () => {
    console.log(`Telegram Inventory AI server running on http://0.0.0.0:${PORT}`);

    // Automatically check for stored Telegram token and start live polling worker
    try {
      const initialConfig = await getTelegramConfig(1);
      const token = initialConfig?.botToken || process.env.TELEGRAM_BOT_TOKEN;
      if (token && token.trim() && initialConfig?.isActive !== false) {
        console.log('[Telegram Bot] Starting automatic background polling daemon...');
        startTelegramPolling(token.trim(), 1);
      } else if (initialConfig?.isActive === false) {
        console.log('[Telegram Bot] Bot de Telegram desactivado por configuración.');
      } else {
        console.log('[Telegram Bot] No bot token configured yet. Waiting for configuration.');
      }
    } catch (botBootErr) {
      console.warn('[Telegram Bot] Could not auto-start bot polling on boot:', botBootErr);
    }

    // Automatically load AI configuration and set active Gemini API key
    try {
      const aiConfig = await getAiConfig(1);
      const activeKey = aiConfig?.apiKey || process.env.GEMINI_API_KEY;
      if (activeKey && isValidGeminiApiKey(activeKey)) {
        setCustomAiApiKey(activeKey.trim());
        process.env.GEMINI_API_KEY = activeKey.trim();
        console.log('[Google Gemini AI] Clave API válida cargada y activada correctamente.');
      } else {
        console.log('[Google Gemini AI] Sin clave API oficial configurada. El sistema opera en modo heurístico.');
      }
    } catch (aiBootErr) {
      console.log('[Google Gemini AI] Nota al cargar configuración de IA:', aiBootErr);
    }

    // Background automatic self-hosted image synchronization for any external images
    setTimeout(async () => {
      try {
        const syncRes = await syncAllInventoryImagesLocally(
          () => getInventoryItems(),
          (id, data) => updateInventoryItem(id, data)
        );
        if (syncRes.imagesPersisted > 0) {
          console.log(`[Media Storage] Sincronización automática: ${syncRes.imagesPersisted} imagen(es) descargadas y guardadas permanentemente.`);
        }
      } catch (syncErr) {
        console.warn('[Media Storage] Error en sincronización inicial de imágenes:', syncErr);
      }
    }, 4000);
  });

  server.on('error', (err: any) => {
    console.error('Server listen error:', err);
  });

  process.on('SIGTERM', () => {
    server.close(() => {
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    server.close(() => {
      process.exit(0);
    });
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});

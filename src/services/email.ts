import nodemailer from 'nodemailer';
import { eq } from 'drizzle-orm';
import { db, isPostgresConfigured } from '../db/index.ts';
import { emailConfigs, users } from '../db/schema.ts';
import { storage } from '../db/storage.ts';
import { getStoreConfig } from '../db/inventory.ts';
import { GoogleEmailConfig } from '../types.ts';

/**
 * Retrieve Google Email (Gmail SMTP) configuration
 * Prioritizes SQL database, falls back to storage and then environment variables.
 */
export async function getEmailConfig(userId?: number): Promise<GoogleEmailConfig> {
  const envGoogleEmail = process.env.GOOGLE_EMAIL || process.env.SMTP_USER || '';
  const envAppPassword = process.env.GOOGLE_APP_PASSWORD || process.env.SMTP_PASS || '';
  const envHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const envPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
  const envSecure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : envPort === 465;
  const envFromName = process.env.SMTP_FROM_NAME || 'Comerxia App';

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const found = state.emailConfigs?.find((c) => (userId ? c.userId === userId : true)) || state.emailConfigs?.[0];

    const email = found?.googleEmail || '';
    const password = found?.googleAppPassword || '';

    return {
      id: found?.id || 1,
      userId: found?.userId || userId || 1,
      googleEmail: email,
      googleAppPassword: password ? '••••••••••••••••' : '',
      hasAppPassword: Boolean(password && password.trim().length > 0),
      senderName: found?.senderName || envFromName,
      smtpHost: found?.smtpHost || envHost,
      smtpPort: found?.smtpPort || envPort,
      smtpSecure: found?.smtpSecure ?? envSecure,
      requireActivation: found?.requireActivation ?? true,
      isConfigured: Boolean(email && email.includes('@') && password && password.trim().length > 0),
      createdAt: found?.createdAt,
      updatedAt: found?.updatedAt,
    };
  }

  try {
    const rows = await db
      .select()
      .from(emailConfigs)
      .where(userId ? eq(emailConfigs.userId, userId) : undefined)
      .limit(1);

    if (rows.length > 0) {
      const c = rows[0];
      const email = c.googleEmail || '';
      const password = c.googleAppPassword || '';

      return {
        id: c.id,
        userId: c.userId,
        googleEmail: email,
        googleAppPassword: password ? '••••••••••••••••' : '',
        hasAppPassword: Boolean(password && password.trim().length > 0),
        senderName: c.senderName || envFromName,
        smtpHost: c.smtpHost || envHost,
        smtpPort: c.smtpPort || envPort,
        smtpSecure: c.smtpSecure ?? envSecure,
        requireActivation: c.requireActivation ?? true,
        isConfigured: Boolean(email && email.includes('@') && password && password.trim().length > 0),
        createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : undefined,
        updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : undefined,
      };
    }
  } catch (error) {
    console.warn('Could not fetch email config from PostgreSQL:', error);
  }

  // Fallback to empty default
  return {
    id: 1,
    userId: userId || 1,
    googleEmail: '',
    googleAppPassword: '',
    hasAppPassword: false,
    senderName: envFromName,
    smtpHost: envHost,
    smtpPort: envPort,
    smtpSecure: envSecure,
    requireActivation: true,
    isConfigured: false,
  };
}

/**
 * Get internal credentials including raw password for sending emails
 */
async function getRawEmailCredentials(userId?: number) {
  const envGoogleEmail = process.env.GOOGLE_EMAIL || process.env.SMTP_USER || '';
  const envAppPassword = process.env.GOOGLE_APP_PASSWORD || process.env.SMTP_PASS || '';
  const envHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const envPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
  const envSecure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : envPort === 465;
  const envFromName = process.env.SMTP_FROM_NAME || 'Comerxia App';

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    const found = state.emailConfigs?.find((c) => (userId ? c.userId === userId : true)) || state.emailConfigs?.[0];

    return {
      googleEmail: (found?.googleEmail || '').trim(),
      googleAppPassword: (found?.googleAppPassword || '').replace(/\s+/g, ''),
      senderName: found?.senderName || envFromName,
      smtpHost: found?.smtpHost || envHost,
      smtpPort: found?.smtpPort || envPort,
      smtpSecure: found?.smtpSecure ?? envSecure,
    };
  }

  try {
    const rows = await db
      .select()
      .from(emailConfigs)
      .where(userId ? eq(emailConfigs.userId, userId) : undefined)
      .limit(1);

    if (rows.length > 0) {
      const c = rows[0];
      return {
        googleEmail: (c.googleEmail || '').trim(),
        googleAppPassword: (c.googleAppPassword || '').replace(/\s+/g, ''),
        senderName: c.senderName || envFromName,
        smtpHost: c.smtpHost || envHost,
        smtpPort: c.smtpPort || envPort,
        smtpSecure: c.smtpSecure ?? envSecure,
      };
    }
  } catch (err) {
    console.warn('Could not query raw email config in PostgreSQL:', err);
  }

  return {
    googleEmail: '',
    googleAppPassword: '',
    senderName: envFromName,
    smtpHost: envHost,
    smtpPort: envPort,
    smtpSecure: envSecure,
  };
}

/**
 * Save or update Google Email configuration in SQL database
 */
export async function saveEmailConfig(
  userId: number,
  data: {
    googleEmail?: string;
    googleAppPassword?: string;
    senderName?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    requireActivation?: boolean;
  }
) {
  const cleanEmail = data.googleEmail?.trim() || '';
  const cleanPassword = data.googleAppPassword !== undefined ? data.googleAppPassword.trim() : undefined;
  const cleanSenderName = data.senderName?.trim() || 'Comerxia App';
  const cleanHost = data.smtpHost?.trim() || 'smtp.gmail.com';
  const cleanPort = data.smtpPort || (cleanHost === 'smtp.gmail.com' ? 465 : 587);
  const cleanSecure = data.smtpSecure !== undefined ? data.smtpSecure : cleanPort === 465;
  const cleanActivation = data.requireActivation !== undefined ? data.requireActivation : true;

  if (!isPostgresConfigured()) {
    const state = storage.getState();
    if (!state.emailConfigs) state.emailConfigs = [];

    let existing = state.emailConfigs.find((c) => c.userId === userId) || state.emailConfigs[0];
    const now = new Date().toISOString();

    if (existing) {
      if (data.googleEmail !== undefined) existing.googleEmail = cleanEmail;
      // Only overwrite password if it's not a masked string placeholder
      if (cleanPassword !== undefined && !cleanPassword.startsWith('•••')) {
        existing.googleAppPassword = cleanPassword;
      }
      if (data.senderName !== undefined) existing.senderName = cleanSenderName;
      if (data.smtpHost !== undefined) existing.smtpHost = cleanHost;
      if (data.smtpPort !== undefined) existing.smtpPort = cleanPort;
      if (data.smtpSecure !== undefined) existing.smtpSecure = cleanSecure;
      if (data.requireActivation !== undefined) existing.requireActivation = cleanActivation;
      existing.updatedAt = now;
    } else {
      const nextId = (state.nextId.emailConfigs = (state.nextId.emailConfigs || 1) + 1);
      existing = {
        id: nextId,
        userId,
        googleEmail: cleanEmail,
        googleAppPassword: cleanPassword && !cleanPassword.startsWith('•••') ? cleanPassword : null,
        senderName: cleanSenderName,
        smtpHost: cleanHost,
        smtpPort: cleanPort,
        smtpSecure: cleanSecure,
        requireActivation: cleanActivation,
        createdAt: now,
        updatedAt: now,
      };
      state.emailConfigs.push(existing);
    }
    storage.save();
    return getEmailConfig(userId);
  }

  try {
    const rows = await db.select().from(emailConfigs).where(eq(emailConfigs.userId, userId)).limit(1);

    const updatePayload: Partial<typeof emailConfigs.$inferInsert> = {
      senderName: cleanSenderName,
      smtpHost: cleanHost,
      smtpPort: cleanPort,
      smtpSecure: cleanSecure,
      requireActivation: cleanActivation,
      updatedAt: new Date(),
    };

    if (data.googleEmail !== undefined) {
      updatePayload.googleEmail = cleanEmail;
    }

    if (cleanPassword !== undefined && !cleanPassword.startsWith('•••')) {
      updatePayload.googleAppPassword = cleanPassword;
    }

    if (rows.length > 0) {
      await db.update(emailConfigs).set(updatePayload).where(eq(emailConfigs.id, rows[0].id));
    } else {
      await db.insert(emailConfigs).values({
        userId,
        googleEmail: cleanEmail,
        googleAppPassword: cleanPassword && !cleanPassword.startsWith('•••') ? cleanPassword : null,
        senderName: cleanSenderName,
        smtpHost: cleanHost,
        smtpPort: cleanPort,
        smtpSecure: cleanSecure,
        requireActivation: cleanActivation,
      });
    }

    return getEmailConfig(userId);
  } catch (error: any) {
    console.error('Error saving email config in SQL:', error);
    throw new Error('Error al guardar la configuración de correo: ' + (error.message || error));
  }
}

/**
 * Creates and verifies nodemailer transport for Google SMTP
 */
export async function createEmailTransporter(userId?: number) {
  const creds = await getRawEmailCredentials(userId);

  if (!creds.googleEmail || !creds.googleEmail.includes('@')) {
    throw new Error('No se ha configurado la dirección de correo emisor de Google (Gmail). Configúralo en los ajustes del Administrador.');
  }

  if (!creds.googleAppPassword || creds.googleAppPassword.trim().length === 0) {
    throw new Error('No se ha configurado la Contraseña de Aplicación de Google (App Password de 16 caracteres). Genera una en tu cuenta de Google.');
  }

  const transporter = nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort,
    secure: creds.smtpSecure,
    auth: {
      user: creds.googleEmail,
      pass: creds.googleAppPassword,
    },
    tls: {
      rejectUnauthorized: false, // Prevents self-signed cert blocks in dev
    },
  });

  return {
    transporter,
    senderEmail: creds.googleEmail,
    senderName: creds.senderName,
  };
}

/**
 * Helper to generate an embedded HTML logo for emails
 */
function buildStoreLogoHeader(storeName: string, logoUrl?: string | null, attachments: any[] = []) {
  if (logoUrl && logoUrl.trim().length > 0) {
    const raw = logoUrl.trim();
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return `
        <div style="margin-bottom: 16px; text-align: center;">
          <img src="${raw}" alt="${storeName}" style="max-height: 64px; max-width: 220px; object-fit: contain; vertical-align: middle; border-radius: 12px; background-color: #ffffff; padding: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.12); display: inline-block;" />
        </div>
      `;
    }

    if (raw.startsWith('data:image/')) {
      const match = raw.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (match) {
        const rawExt = match[1];
        const ext = rawExt.includes('svg') ? 'svg' : rawExt === 'jpeg' ? 'jpg' : rawExt;
        const base64Data = match[2];
        const cid = 'store-logo@comerxia';

        attachments.push({
          filename: `store-logo.${ext}`,
          content: Buffer.from(base64Data, 'base64'),
          cid,
          contentType: `image/${rawExt}`,
          contentDisposition: 'inline',
        });

        return `
          <div style="margin-bottom: 16px; text-align: center;">
            <img src="cid:${cid}" alt="${storeName}" style="max-height: 64px; max-width: 220px; object-fit: contain; vertical-align: middle; border-radius: 12px; background-color: #ffffff; padding: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.12); display: inline-block;" />
          </div>
        `;
      }
    }
  }

  // Fallback elegant store badge
  return `
    <div style="margin-bottom: 12px; text-align: center;">
      <span style="display: inline-block; background: rgba(255,255,255,0.22); border: 1.5px solid rgba(255,255,255,0.45); border-radius: 14px; padding: 6px 14px; font-size: 22px;">🏪</span>
    </div>
  `;
}

/**
 * Formats SMTP and Nodemailer errors into clear, actionable messages for the user
 */
export function formatSmtpError(err: any): Error {
  const msg = err?.message || String(err || '');
  const code = err?.code || '';
  const response = err?.response || '';

  if (
    code === 'EAUTH' ||
    msg.includes('535') ||
    msg.includes('Username and Password not accepted') ||
    msg.includes('BadCredentials') ||
    response.includes('535') ||
    response.includes('5.7.8')
  ) {
    return new Error(
      'Error de autenticación con Google Gmail (535): La Contraseña de Aplicación es incorrecta o no fue aceptada por Google. ' +
      'Asegúrate de: 1) Tener la "Verificación en 2 pasos" activada en tu cuenta Google, 2) Generar una "Contraseña de aplicación" de 16 caracteres en myaccount.google.com/apppasswords (no tu contraseña normal), y 3) Pegar los 16 caracteres en la pestaña Ajustes > Configuración Gmail.'
    );
  }

  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ESOCKET' || msg.includes('ETIMEDOUT')) {
    return new Error(
      'No se pudo establecer conexión con el servidor SMTP de Google. Verifica la conexión a internet del servidor y el puerto configurado (465 SSL o 587 TLS).'
    );
  }

  if (msg.includes('EENVELOPE') || msg.includes('No recipients defined')) {
    return new Error('La dirección de correo destinatario es inválida o no está especificada.');
  }

  return new Error(msg || 'Error al enviar correo electrónico');
}

/**
 * Sends a generic HTML email via Google SMTP
 */
export async function sendGoogleEmail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  userId?: number;
  attachments?: Array<{
    filename: string;
    content?: Buffer | string;
    path?: string;
    cid?: string;
    contentType?: string;
    contentDisposition?: 'inline' | 'attachment';
  }>;
}) {
  const { transporter, senderEmail, senderName } = await createEmailTransporter(options.userId);

  const from = `"${senderName}" <${senderEmail}>`;

  try {
    const info: any = await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text || options.subject,
      html: options.html,
      attachments: options.attachments,
    });

    return {
      success: true,
      messageId: info?.messageId || 'sent',
    };
  } catch (err: any) {
    console.error(`[Google Email Service] Error enviando correo a ${options.to}:`, err);
    throw formatSmtpError(err);
  }
}

/**
 * Sends an Account Activation Email displaying only the 6-digit activation code and store logo (without activation button or attachments)
 */
export async function sendActivationEmail(params: {
  to: string;
  name?: string;
  username: string;
  code: string;
  appUrl?: string;
  userId?: number;
}) {
  const storeConfig = await getStoreConfig(params.userId || 1).catch(() => null);
  const storeName = storeConfig?.storeName || 'Comerxia App';
  const attachments: any[] = [];
  const logoHtml = buildStoreLogoHeader(storeName, storeConfig?.logoUrl, attachments);

  const greeting = params.name ? `Hola, ${params.name}` : `Hola @${params.username}`;

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; color: #1e293b; }
        .container { max-width: 580px; margin: 30px auto; background-color: #ffffff; border-radius: 18px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 6px 18px rgba(0,0,0,0.06); }
        .header { background: linear-gradient(135deg, #0284c7, #4f46e5); padding: 36px 24px 28px 24px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 25px; font-weight: 800; letter-spacing: -0.5px; }
        .header p { margin: 6px 0 0 0; font-size: 13px; opacity: 0.92; }
        .content { padding: 32px 28px; }
        .code-box { background: #f0fdf4; border: 2px dashed #16a34a; border-radius: 14px; padding: 22px; text-align: center; margin: 24px 0; }
        .code { font-family: 'Courier New', monospace; font-size: 38px; font-weight: 900; letter-spacing: 8px; color: #15803d; margin: 4px 0; }
        .instructions { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0; font-size: 13px; color: #334155; line-height: 1.6; }
        .footer { background-color: #f1f5f9; padding: 22px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
        .badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; margin-bottom: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${logoHtml}
          <h1>${storeName}</h1>
          <p>Activación de Cuenta de Usuario</p>
        </div>
        <div class="content">
          <div class="badge">Nueva Cuenta de Acceso</div>
          <h2 style="margin-top: 0; font-size: 20px; color: #0f172a;">${greeting}</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #475569;">
            Se ha creado una cuenta para ti con el usuario <strong>@${params.username}</strong> en <strong>${storeName}</strong>.
          </p>
          <p style="font-size: 14px; line-height: 1.6; color: #475569;">
            Para habilitar tu acceso y verificar tu correo, ingresa el siguiente código de 6 dígitos:
          </p>
          
          <div class="code-box">
            <p style="margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; font-weight: 800; color: #166534; letter-spacing: 1.2px;">Código de Activación</p>
            <p class="code">${params.code}</p>
            <p style="margin: 6px 0 0 0; font-size: 12px; color: #64748b;">Válido por 24 horas</p>
          </div>

          <div class="instructions">
            <strong style="color: #0f172a; display: block; margin-bottom: 6px;">📝 ¿Cómo activar tu cuenta?</strong>
            1. Abre la pantalla de acceso en la aplicación.<br>
            2. Ingresa tu usuario <strong>@${params.username}</strong> y tu contraseña.<br>
            3. Escribe o pega el código <strong>${params.code}</strong> en el campo de verificación.
          </div>

          <p style="font-size: 12px; line-height: 1.5; color: #94a3b8; margin-top: 24px;">
            Si no solicitaste esta cuenta o crees que se trata de un error, puedes ignorar este mensaje de forma segura.
          </p>
        </div>
        <div class="footer">
          <p style="margin: 0;"><strong>${storeName}</strong> • Sistema de Gestión Comercial</p>
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #94a3b8;">Enviado de forma segura mediante Google SMTP</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendGoogleEmail({
    to: params.to,
    subject: `🔑 Código de Activación: ${params.code} - ${storeName}`,
    html,
    text: `Hola ${params.name || params.username}. Tu código de activación en ${storeName} es: ${params.code}. Ingresa este código en la aplicación para activar tu cuenta. Válido por 24 horas.`,
    userId: params.userId,
    attachments,
  });
}

/**
 * Sends a Password Reset Email with a 6-digit OTP code and store logo (without attachments)
 */
export async function sendPasswordResetEmail(params: {
  to: string;
  name?: string;
  username: string;
  code: string;
  appUrl?: string;
  userId?: number;
}) {
  const storeConfig = await getStoreConfig(params.userId || 1).catch(() => null);
  const storeName = storeConfig?.storeName || 'Comerxia App';
  const attachments: any[] = [];
  const logoHtml = buildStoreLogoHeader(storeName, storeConfig?.logoUrl, attachments);

  const greeting = params.name ? `Hola, ${params.name}` : `Hola @${params.username}`;

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; color: #1e293b; }
        .container { max-width: 580px; margin: 30px auto; background-color: #ffffff; border-radius: 18px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 6px 18px rgba(0,0,0,0.06); }
        .header { background: linear-gradient(135deg, #e11d48, #9333ea); padding: 36px 24px 28px 24px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 25px; font-weight: 800; letter-spacing: -0.5px; }
        .header p { margin: 6px 0 0 0; font-size: 13px; opacity: 0.92; }
        .content { padding: 32px 28px; }
        .code-box { background: #fff1f2; border: 2px dashed #e11d48; border-radius: 14px; padding: 22px; text-align: center; margin: 24px 0; }
        .code { font-family: 'Courier New', monospace; font-size: 38px; font-weight: 900; letter-spacing: 8px; color: #be123c; margin: 4px 0; }
        .footer { background-color: #f1f5f9; padding: 22px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
        .alert { background: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 16px; border-radius: 8px; font-size: 13px; color: #991b1b; margin-top: 20px; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${logoHtml}
          <h1>${storeName}</h1>
          <p>Recuperación de Contraseña</p>
        </div>
        <div class="content">
          <h2 style="margin-top: 0; font-size: 20px; color: #0f172a;">${greeting}</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #475569;">
            Recibimos una solicitud para restablecer la contraseña de tu cuenta <strong>@${params.username}</strong> en <strong>${storeName}</strong>.
          </p>
          <p style="font-size: 14px; line-height: 1.6; color: #475569;">
            Ingresa este código de seguridad de 6 dígitos en la aplicación para establecer tu nueva contraseña:
          </p>
          
          <div class="code-box">
            <p style="margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; font-weight: 800; color: #9f1239; letter-spacing: 1.2px;">Código de Seguridad OTP</p>
            <p class="code">${params.code}</p>
            <p style="margin: 6px 0 0 0; font-size: 12px; color: #881337; font-weight: 600;">Expira en 15 minutos</p>
          </div>

          <div class="alert">
            <strong>🔒 Aviso de Seguridad:</strong> Si no solicitaste este código, puedes ignorar este correo con tranquilidad. Tu contraseña permanecerá intacta.
          </div>
        </div>
        <div class="footer">
          <p style="margin: 0;"><strong>${storeName}</strong> • Sistema de Gestión Comercial</p>
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #94a3b8;">Enviado automáticamente por el servicio de seguridad</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendGoogleEmail({
    to: params.to,
    subject: `🔐 Código de Recuperación: ${params.code} - ${storeName}`,
    html,
    text: `Hola ${params.name || params.username}. Tu código para restablecer tu contraseña en ${storeName} es: ${params.code}. Expira en 15 minutos.`,
    userId: params.userId,
    attachments,
  });
}

/**
 * Sends a Test Email to verify connection and credentials, displaying the store logo (without attachments)
 */
export async function sendTestEmail(targetEmail: string, userId?: number, appUrl?: string) {
  const storeConfig = await getStoreConfig(userId || 1).catch(() => null);
  const storeName = storeConfig?.storeName || 'Comerxia App';
  const attachments: any[] = [];
  const logoHtml = buildStoreLogoHeader(storeName, storeConfig?.logoUrl, attachments);

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; padding: 20px; }
        .card { max-width: 520px; margin: 0 auto; background: white; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 6px 14px rgba(0,0,0,0.06); text-align: center; }
        .success { color: #16a34a; font-weight: 800; font-size: 20px; margin-bottom: 8px; }
      </style>
    </head>
    <body>
      <div class="card">
        ${logoHtml}
        <h2 style="margin: 0 0 16px 0; font-size: 22px; color: #0f172a;">${storeName}</h2>
        <div class="success">✓ ¡Conexión con Google SMTP Exitosa!</div>
        <p style="font-size: 14px; color: #475569; line-height: 1.6; text-align: left;">
          Este es un correo de prueba enviado desde <strong>${storeName}</strong> usando tu cuenta de Google y Contraseña de Aplicación configurada.
        </p>
        <div style="background: #f1f5f9; padding: 14px; border-radius: 10px; font-size: 12px; color: #334155; margin: 20px 0; text-align: left;">
          <p style="margin: 0 0 6px 0;"><strong>Destinatario de prueba:</strong> ${targetEmail}</p>
          <p style="margin: 0 0 6px 0;"><strong>Fecha y hora:</strong> ${new Date().toLocaleString()}</p>
          <p style="margin: 0;"><strong>Estado:</strong> Listo para enviar códigos de activación y recuperación</p>
        </div>
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">${storeName} - Sistema de Gestión Comercial</p>
      </div>
    </body>
    </html>
  `;

  return sendGoogleEmail({
    to: targetEmail,
    subject: `✓ Correo de prueba exitoso - ${storeName} Google SMTP`,
    html,
    text: `¡Felicidades! La conexión de correo Google SMTP de ${storeName} está funcionando correctamente.`,
    userId,
    attachments,
  });
}

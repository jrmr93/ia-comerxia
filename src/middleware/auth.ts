import { Request, Response, NextFunction } from 'express';
import { getUserById, verifyAuthToken } from '../db/users.ts';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    email: string;
    name: string;
    role: string;
    photoUrl?: string | null;
  };
  dbUserId?: number;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : undefined;
  const rawToken = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split('Bearer ')[1]
    : queryToken;

  if (!rawToken) {
    return res.status(401).json({ error: 'No autorizado: Token de sesión requerido' });
  }

  try {
    const verified = verifyAuthToken(rawToken);
    if (!verified) {
      return res.status(401).json({ error: 'No autorizado: Token inválido o expirado' });
    }

    const user = await getUserById(verified.id);
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado en base de datos' });
    }

    req.user = user;
    req.dbUserId = user.id;
    next();
  } catch (error) {
    console.error('Error verifying SQL auth token:', error);
    return res.status(401).json({ error: 'No autorizado: Error de autenticación' });
  }
};

// Optional auth helper for operations that work publicly or with authenticated admin
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : undefined;
  const rawToken = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split('Bearer ')[1]
    : queryToken;

  if (rawToken) {
    try {
      const verified = verifyAuthToken(rawToken);
      if (verified) {
        const user = await getUserById(verified.id);
        if (user) {
          req.user = user;
          req.dbUserId = user.id;
          return next();
        }
      }
    } catch (e: any) {
      // Ignore token parse errors in optional auth
    }
  }

  // Fallback to default admin (id: 1) so public endpoints and Telegram bot daemon operate smoothly
  req.dbUserId = 1;
  next();
};

// Admin-only middleware: checks authentication AND admin role
export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  await requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        error: 'Acceso denegado: Solo el usuario Administrador tiene permisos para realizar esta acción.',
      });
    }
    next();
  });
};


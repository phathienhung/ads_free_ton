import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../modules/auth';

export interface AuthRequest extends Request {
  userId?: string;
  telegramId?: string;
  userRole?: string;
}

/**
 * Middleware to verify JWT token from Authorization header
 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);
    req.userId = decoded.userId;
    req.telegramId = decoded.telegramId;
    req.userRole = decoded.role;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Admin-only middleware
 */
export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.userRole !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

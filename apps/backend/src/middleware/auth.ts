import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../modules/auth';
import { supabase } from '../lib/supabase';

export interface AuthRequest extends Request {
  userId?: string;
  telegramId?: string;
  userRole?: string;
}

/**
 * Middleware to verify JWT token from Authorization header
 */
export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const decoded = verifyToken(token);
    req.userId = decoded.userId;
    req.telegramId = decoded.telegramId;
    req.userRole = decoded.role;

    // Check if user is banned
    const { data: user, error } = await supabase.from('User').select('isBanned').eq('id', decoded.userId).single();
    if (error || !user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    if (user.isBanned) {
      res.status(403).json({ error: 'Your account has been banned' });
      return;
    }

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

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'change-me-refresh';

export interface TelegramInitData {
  query_id?: string;
  user?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    photo_url?: string;
    is_premium?: boolean;
  };
  auth_date: number;
  hash: string;
}

/**
 * Validate Telegram Mini App initData using HMAC-SHA256
 */
export function validateInitData(initDataRaw: string): TelegramInitData | null {
  try {
    const urlParams = new URLSearchParams(initDataRaw);
    const hash = urlParams.get('hash');
    if (!hash) return null;

    urlParams.delete('hash');
    const dataCheckArr: string[] = [];
    urlParams.sort();
    urlParams.forEach((value, key) => {
      dataCheckArr.push(`${key}=${value}`);
    });
    const dataCheckString = dataCheckArr.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (computedHash !== hash) return null;

    // Check auth_date is not too old (24 hours)
    const authDate = parseInt(urlParams.get('auth_date') || '0');
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) return null;

    // Parse user data
    const userStr = urlParams.get('user');
    const user = userStr ? JSON.parse(userStr) : null;

    return {
      query_id: urlParams.get('query_id') || undefined,
      user,
      auth_date: authDate,
      hash,
    };
  } catch (error) {
    console.error('initData validation error:', error);
    return null;
  }
}

function generateReferralCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Authenticate user from Telegram initData, create if not exists
 */
export async function authenticateUser(initDataRaw: string, ipAddress?: string, userAgent?: string) {
  const initData = validateInitData(initDataRaw);
  if (!initData || !initData.user) {
    throw new Error('Invalid Telegram authentication data');
  }

  const tgUser = initData.user;

  // Upsert user
  let user = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgUser.id) },
    include: { wallet: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId: BigInt(tgUser.id),
        username: tgUser.username,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name,
        photoUrl: tgUser.photo_url,
        languageCode: tgUser.language_code || 'en',
        referralCode: generateReferralCode(),
        lastIp: ipAddress,
        wallet: {
          create: {},
        },
      },
      include: { wallet: true },
    });
  } else {
    // Update user info
    await prisma.user.update({
      where: { id: user.id },
      data: {
        username: tgUser.username,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name,
        photoUrl: tgUser.photo_url,
        lastActiveAt: new Date(),
        lastIp: ipAddress,
      },
    });
  }

  if (user.isBanned) {
    throw new Error('Account is banned');
  }

  // Generate JWT tokens
  const accessToken = jwt.sign(
    { userId: user.id, telegramId: tgUser.id.toString(), role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  const refreshToken = jwt.sign(
    { userId: user.id },
    JWT_REFRESH_SECRET,
    { expiresIn: '30d' }
  );

  return {
    user: serializeUser(user),
    accessToken,
    refreshToken,
  };
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): { userId: string; telegramId: string; role: string } {
  return jwt.verify(token, JWT_SECRET) as { userId: string; telegramId: string; role: string };
}

/**
 * Serialize user for API response (handle BigInt)
 */
export function serializeUser(user: any) {
  return {
    ...user,
    telegramId: user.telegramId.toString(),
    wallet: user.wallet ? {
      ...user.wallet,
      balance: user.wallet.balance.toString(),
      frozenBalance: user.wallet.frozenBalance.toString(),
      totalEarned: user.wallet.totalEarned.toString(),
      totalSpent: user.wallet.totalSpent.toString(),
    } : null,
  };
}

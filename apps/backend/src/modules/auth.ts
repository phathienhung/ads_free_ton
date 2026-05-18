import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { supabase } from '../lib/supabase';

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

  // Upsert user using Supabase SDK
  const { data: userRaw, error: fetchError } = await supabase
    .from('User')
    .select('*, wallet:Wallet(*)')
    .eq('telegramId', tgUser.id)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "No rows found"
    console.error('Error fetching user from Supabase:', fetchError);
    throw new Error('Database fetch error');
  }

  let user = userRaw;

  if (!user) {
    const userId = uuidv4();
    // Create user with explicit NOT NULL fields
    const { data: newUser, error: createError } = await supabase
      .from('User')
      .insert({
        id: userId,
        telegramId: tgUser.id,
        username: tgUser.username,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name,
        photoUrl: tgUser.photo_url,
        languageCode: tgUser.language_code || 'en',
        referralCode: generateReferralCode(),
        lastIp: ipAddress,
        role: 'USER',
        level: 1,
        xp: 0,
        energy: 100,
        maxEnergy: 100,
        energyUpdatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating user in Supabase:', createError);
      throw new Error(`Database create error (User): ${createError.message} (${createError.code})`);
    }

    // Create wallet for new user with explicit NOT NULL fields
    const { data: newWallet, error: walletError } = await supabase
      .from('Wallet')
      .insert({ 
        id: uuidv4(),
        userId: newUser.id,
        balance: 0,
        frozenBalance: 0,
        totalEarned: 0,
        totalSpent: 0,
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (walletError) {
      console.error('Error creating wallet in Supabase:', walletError);
      throw new Error(`Database create error (Wallet): ${walletError.message} (${walletError.code})`);
    }

    user = { ...newUser, wallet: newWallet };
  } else {
    // Update user info
    const { error: updateError } = await supabase
      .from('User')
      .update({
        username: tgUser.username,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name,
        photoUrl: tgUser.photo_url,
        lastActiveAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), // Ensure updatedAt is updated
        lastIp: ipAddress,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating user in Supabase:', updateError);
    }
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
 * Serialize user for API response (handle BigInt and Decimal safely)
 */
export function serializeUser(user: any) {
  if (!user) return null;

  // Supabase might return wallet as an array if it's a join
  const walletData = Array.isArray(user.wallet) ? user.wallet[0] : user.wallet;

  return {
    ...user,
    telegramId: user.telegramId ? user.telegramId.toString() : null,
    wallet: walletData ? {
      ...walletData,
      balance: walletData.balance?.toString() || "0",
      frozenBalance: walletData.frozenBalance?.toString() || "0",
      totalEarned: walletData.totalEarned?.toString() || "0",
      totalSpent: walletData.totalSpent?.toString() || "0",
    } : null,
  };
}

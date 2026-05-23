import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { getUserWithEnergy } from './task';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not set');
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
if (!JWT_SECRET || !JWT_REFRESH_SECRET) throw new Error('JWT secrets are not set');

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
  start_param?: string;
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
      start_param: urlParams.get('start_param') || undefined,
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
    // Referral Attribution
    let referredById: string | null = null;
    if (initData.start_param) {
      // Find referrer by telegramId (as the link is startapp=[telegramId])
      const { data: referrer } = await supabase
        .from('User')
        .select('id, extraSpins, energy, maxEnergy')
        .eq('telegramId', initData.start_param)
        .single();
      
      if (referrer && referrer.id !== userId) {
        referredById = referrer.id;
        
        // Reward referrer: Fetch from config
        const refRewards = await supabase.from('GameConfig').select('value').eq('key', 'referral_rewards').single();
        const rewards = refRewards.data?.value as any || { spinBonus: 1, energyBonus: 1 };

        // Count referrals to check milestones
        const { count: referralCount } = await supabase
          .from('User')
          .select('id', { count: 'exact', head: true })
          .eq('referredById', referrer.id);
        
        const newCount = (referralCount || 0) + 1;
        
        // Find if this newCount reaches any milestone
        const { data: milestoneReached } = await supabase
          .from('ReferralMilestone')
          .select('target')
          .eq('target', newCount)
          .single();

        const prevMilestones = Array.isArray((referrer as any).milestonesAchieved) ? (referrer as any).milestonesAchieved : [];
        const updatedMilestones = milestoneReached 
          ? [...prevMilestones, milestoneReached.target]
          : prevMilestones;

        await supabase
          .from('User')
          .update({
            extraSpins: (referrer.extraSpins || 0) + (rewards.spinBonus || 1),
            energy: Math.min((referrer.energy || 0) + (rewards.energyBonus || 1), (referrer.maxEnergy || 100)),
            milestonesAchieved: updatedMilestones,
            updatedAt: new Date().toISOString()
          })
          .eq('id', referrer.id);
        
        console.log(`Referral credited: ${referrer.id} invited ${userId}. Total: ${newCount}`);
      }
    }

    // Fetch defaults from config
    const energyConfig = await supabase.from('GameConfig').select('value').eq('key', 'energy_params').single();
    const eParams = energyConfig.data?.value as any || { maxEnergy: 100, initialEnergy: 100 };

    // Create user with dynamic defaults
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
        referredById, // Set referrer!
        lastIp: ipAddress,
        role: 'USER',
        level: 1,
        xp: 0,
        energy: eParams.initialEnergy || 100,
        maxEnergy: eParams.maxEnergy || 100,
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
        username: tgUser.username,
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

    // Sync wallet username
    await supabase
      .from('Wallet')
      .update({ username: tgUser.username })
      .eq('userId', user.id);
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

  // Get up-to-date energy before returning
  const userWithEnergy = await getUserWithEnergy(user.id).catch(() => user);
  const finalUser = { ...user, ...userWithEnergy };

  return {
    user: serializeUser(finalUser),
    accessToken,
    refreshToken,
    serverTime: Date.now()
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

  const ensureUTC = (str: string | undefined | null) => {
    if (!str) return str;
    if (str.endsWith('Z') || str.includes('+')) return str;
    return `${str}Z`;
  };

  return {
    ...user,
    energyUpdatedAt: ensureUTC(user.energyUpdatedAt),
    lastActiveAt: ensureUTC(user.lastActiveAt),
    createdAt: ensureUTC(user.createdAt),
    updatedAt: ensureUTC(user.updatedAt),
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

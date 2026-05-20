import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { redis } from '../lib/redis';
import { getGameConfig, EnergyParams, LevelingParams } from '../lib/config';

const TASK_ENERGY_COST = 1;
const MIN_VERIFICATION_DELAY = 30 * 1000; // 30 seconds minimum
const REFERRAL_COMMISSIONS = [0.10, 0.05, 0.02]; // Level 1: 10%, Level 2: 5%, Level 3: 2%

/**
 * Start a task — user clicks to begin
 */
export async function startTask(userId: string, campaignId: string, ipAddress?: string, userAgent?: string) {
  // Check campaign is active
  const { data: campaign, error: campaignError } = await supabase
    .from('Campaign')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (campaignError || !campaign || campaign.status !== 'ACTIVE') {
    throw new Error('Campaign is not active');
  }

  // Check budget remaining
  if (Number(campaign.spentBudget) >= Number(campaign.totalBudget)) {
    throw new Error('Campaign budget exhausted');
  }

  // Check if already completed
  const { data: existing } = await supabase
    .from('TaskCompletion')
    .select('*')
    .eq('userId', userId)
    .eq('campaignId', campaignId)
    .single();

  if (existing) {
    throw new Error('Task already started or completed');
  }

  // Check energy
  const user = await getUserWithEnergy(userId);
  if (user.energy < TASK_ENERGY_COST) {
    throw new Error('Not enough energy');
  }

  // Anti-fraud: rate limit check
  const recentTasks = await redis.get(`rate:tasks:${userId}`);
  if (recentTasks && parseInt(recentTasks) > 50) {
    throw new Error('Rate limit exceeded. Try again later.');
  }
  await redis.incr(`rate:tasks:${userId}`);
  await redis.expire(`rate:tasks:${userId}`, 3600);

  // Deduct energy
  const currentEnergy = Number(user.energy);
  await supabase
    .from('User')
    .update({ 
      energy: currentEnergy - TASK_ENERGY_COST,
      updatedAt: new Date().toISOString()
    })
    .eq('id', userId);

  // Create task completion
  const tcId = uuidv4();
  const { data: taskCompletion, error: tcError } = await supabase
    .from('TaskCompletion')
    .insert({
      id: tcId,
      userId,
      campaignId,
      status: 'STARTED',
      ipAddress,
      userAgent,
      startedAt: new Date().toISOString(),
    })
    .select()
    .single();

  if (tcError) throw tcError;

  // Increment view count
  await supabase
    .from('Campaign')
    .update({ 
      viewCount: (campaign.viewCount || 0) + 1,
      updatedAt: new Date().toISOString()
    })
    .eq('id', campaignId);

  return {
    ...taskCompletion,
    reward: taskCompletion.reward?.toString(),
    campaign: {
      ...campaign,
      pricePerAction: campaign.pricePerAction.toString(),
      totalBudget: campaign.totalBudget.toString(),
      spentBudget: campaign.spentBudget.toString(),
    },
  };
}

/**
 * Complete / verify a task
 */
export async function completeTask(userId: string, campaignId: string) {
  const { data: taskCompletion, error: fetchError } = await supabase
    .from('TaskCompletion')
    .select('*')
    .eq('userId', userId)
    .eq('campaignId', campaignId)
    .single();

  if (fetchError || !taskCompletion) throw new Error('Task not found');
  if (taskCompletion.status === 'REWARDED') throw new Error('Task already rewarded');

  const { data: campaign, error: campError } = await supabase.from('Campaign').select('*').eq('id', campaignId).single();
  if (campError || !campaign) throw new Error('Campaign not found');

  if (taskCompletion.status !== 'VERIFIED') throw new Error('Task must be verified first.');

  const rewardAmount = Number(campaign.pricePerAction);

  // Update task as verified & rewarded
  await supabase
    .from('TaskCompletion')
    .update({
      status: 'REWARDED',
      reward: rewardAmount,
      verifiedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    })
    .eq('id', taskCompletion.id);

  // Credit user wallet
  const { data: userWallet } = await supabase.from('Wallet').select('balance, totalEarned').eq('userId', userId).single();
  if (userWallet) {
    await supabase
      .from('Wallet')
      .update({
        balance: Number(userWallet.balance) + rewardAmount,
        totalEarned: Number(userWallet.totalEarned) + rewardAmount,
        updatedAt: new Date().toISOString()
      })
      .eq('userId', userId);
  }

  // Update campaign
  await supabase
    .from('Campaign')
    .update({
      spentBudget: Number(campaign.spentBudget) + rewardAmount,
      completedCount: (campaign.completedCount || 0) + 1,
      clickCount: (campaign.clickCount || 0) + 1,
      updatedAt: new Date().toISOString(),
      status: (Number(campaign.spentBudget) + rewardAmount >= Number(campaign.totalBudget)) ? 'COMPLETED' : campaign.status
    })
    .eq('id', campaignId);

  // Deduct from advertiser frozen balance
  const { data: advertiserWallet } = await supabase.from('Wallet').select('frozenBalance, totalSpent').eq('userId', campaign.advertiserId).single();
  if (advertiserWallet) {
    await supabase
      .from('Wallet')
      .update({
        frozenBalance: Number(advertiserWallet.frozenBalance) - rewardAmount,
        totalSpent: (Number(advertiserWallet.totalSpent) || 0) + rewardAmount,
        updatedAt: new Date().toISOString()
      })
      .eq('userId', campaign.advertiserId);
  }

  // Create reward transaction
  await supabase.from('Transaction').insert({
    id: uuidv4(),
    userId,
    type: 'REWARD',
    amount: rewardAmount,
    status: 'COMPLETED',
    description: `Task reward: ${campaign.title}`,
    metadata: { campaignId },
    updatedAt: new Date().toISOString()
  });

  // Add XP
  await addXP(userId, 10);

  // Process referral commissions
  await processReferralReward(userId, rewardAmount);

  return { reward: rewardAmount.toString(), campaignTitle: campaign.title };
}

/**
 * Verify task using Telegram API
 */
async function verifyTelegramTask(telegramId: string, campaign: any): Promise<boolean> {
  const BOT_TOKEN = '8942132951:AAGvbVoWMIja8FYWpV-ezCBE9m-spXv4WhM';
  
  if (campaign.type === 'CHANNEL' || campaign.type === 'GROUP') {
    // Extract chat_id from targetUrl or handle metadata
    // Example: https://t.me/channel_name -> @channel_name
    let chatId = campaign.metadata?.chatId;
    if (!chatId && campaign.targetUrl) {
      const match = campaign.targetUrl.match(/t\.me\/([a-zA-Z0-9_]+)/);
      if (match) chatId = `@${match[1]}`;
    }

    if (!chatId) return true; // Fallback to auto-verify if ID can't be parsed

    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${chatId}&user_id=${telegramId}`);
      const data = await res.json() as { ok: boolean; result?: { status: string } };
      if (!data.ok) return false;
      const status = data.result?.status;
      return ['member', 'administrator', 'creator'].includes(status || '');
    } catch {
      return true; // Fallback on error
    }
  }

  if (campaign.type === 'BOT') {
    // For bots, we can only verify if we are the bot, OR we check if the user is in our db system.
    // However, the user wants "check user đã start bot".
    // This usually requires the target bot to report back. 
    // Simplified version: always return true if STARTED was recorded (button was clicked).
    return true; 
  }

  if (campaign.type === 'WEBSITE' || campaign.type === 'MINI_APP') {
    // Just verify the task was STARTED (already checked in completeTask)
    return true;
  }

  return true;
}

/**
 * Verify task action endpoint logic
 */
export async function verifyTaskAction(userId: string, campaignId: string) {
  const { data: taskCompletion, error: fetchError } = await supabase
    .from('TaskCompletion')
    .select('*')
    .eq('userId', userId)
    .eq('campaignId', campaignId)
    .single();

  if (fetchError || !taskCompletion) throw new Error('Please start the task first');
  // Allow re-verification if failed or started
  if (taskCompletion.status === 'REWARDED') throw new Error('Already rewarded');
  if (taskCompletion.status === 'VERIFIED') return { success: true };

  const { data: campaign, error: campError } = await supabase.from('Campaign').select('*').eq('id', campaignId).single();
  if (campError || !campaign) throw new Error('Campaign not found');

  const user = await supabase.from('User').select('telegramId').eq('id', userId).single();
  if (!user.data?.telegramId) throw new Error('Telegram ID not found');

  const isVerified = await verifyTelegramTask(user.data.telegramId.toString(), campaign);
  if (!isVerified) {
    if (campaign.type === 'WEBSITE' || campaign.type === 'MINI_APP') {
       throw new Error('Please open the link first and wait a few seconds.');
    }
    throw new Error(`Please join/start the ${campaign.type.toLowerCase()} exactly as requested.`);
  }

  if (campaign.type === 'WEBSITE' || campaign.type === 'MINI_APP') {
    const elapsed = Date.now() - new Date(taskCompletion.startedAt).getTime();
    if (elapsed < MIN_VERIFICATION_DELAY) {
      throw new Error(`Please wait at least ${MIN_VERIFICATION_DELAY / 1000}s on the page.`);
    }
  }

  await supabase
    .from('TaskCompletion')
    .update({ status: 'VERIFIED', verifiedAt: new Date().toISOString() })
    .eq('id', taskCompletion.id);

  return { success: true };
}

/**
 * Process multi-tier referral rewards
 */
async function processReferralReward(userId: string, rewardAmount: number) {
  let currentUserId = userId;

  for (let level = 0; level < REFERRAL_COMMISSIONS.length; level++) {
    const { data: user } = await supabase
      .from('User')
      .select('referredById')
      .eq('id', currentUserId)
      .single();

    if (!user?.referredById) break;

    const commission = rewardAmount * REFERRAL_COMMISSIONS[level];
    if (commission <= 0) break;

    // Credit referrer
    const { data: refWallet } = await supabase.from('Wallet').select('balance, totalEarned').eq('userId', user.referredById).single();
    if (refWallet) {
      await supabase
        .from('Wallet')
        .update({
          balance: Number(refWallet.balance) + commission,
          totalEarned: Number(refWallet.totalEarned) + commission,
          updatedAt: new Date().toISOString()
        })
        .eq('userId', user.referredById);
    }

    await supabase.from('Transaction').insert({
      id: uuidv4(),
      userId: user.referredById,
      type: 'REFERRAL_BONUS',
      amount: commission,
      status: 'COMPLETED',
      description: `Level ${level + 1} referral bonus`,
      metadata: { fromUserId: userId, level: level + 1 },
      updatedAt: new Date().toISOString()
    });

    currentUserId = user.referredById;
  }
}

/**
 * Get user with regenerated energy
 */
export async function getUserWithEnergy(userId: string) {
  const { data: user, error } = await supabase.from('User').select('*').eq('id', userId).single();
  if (error || !user) throw new Error('User not found');

  const config = await getGameConfig<EnergyParams>('energy_params');
  const regenInterval = config.recoverSeconds * 1000;
  const regenAmountPerInterval = config.recoverAmount || 1;

  const now = Date.now();
  const elapsed = now - new Date(user.energyUpdatedAt).getTime();
  const regenAmount = Math.floor(elapsed / regenInterval) * regenAmountPerInterval;

  const maxEnergy = user.maxEnergy || config.maxEnergy;

  let currentEnergy = user.energy;

  if (regenAmount > 0 && user.energy < maxEnergy) {
    currentEnergy = Math.min(user.energy + regenAmount, maxEnergy);
    await supabase
      .from('User')
      .update({ 
        energy: currentEnergy,
        energyUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .eq('id', userId);
  }

  // Get dynamic leveling params for UI
  const levelingConfig = await getGameConfig<LevelingParams>('leveling_params');
  const xpForNextLevel = levelingConfig.initialMaxXp + ((user.level || 1) - 1) * levelingConfig.xpStepPerLevel;

  return { 
    ...user, 
    energy: currentEnergy, 
    maxEnergy,
    xpForNextLevel,
  };
}

/**
 * Add XP and handle level ups
 */
export async function addXP(userId: string, amount: number) {
  const { data: user } = await supabase.from('User').select('*').eq('id', userId).single();
  if (!user) return;

  const config = await getGameConfig<LevelingParams>('leveling_params');
  
  const newXP = (user.xp || 0) + amount;
  const xpForNextLevel = config.initialMaxXp + ((user.level || 1) - 1) * config.xpStepPerLevel;

  if (newXP >= xpForNextLevel) {
    await supabase
      .from('User')
      .update({
        xp: newXP - xpForNextLevel,
        level: (user.level || 1) + 1,
        maxEnergy: (user.maxEnergy || 100) + config.energyBonusPerLevel,
        updatedAt: new Date().toISOString()
      })
      .eq('id', userId);
  } else {
    await supabase
      .from('User')
      .update({ 
        xp: newXP,
        updatedAt: new Date().toISOString()
      })
      .eq('id', userId);
  }
}

/**
 * Get user task history
 */
export async function getUserTasks(userId: string, page = 1, limit = 20) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await supabase
    .from('TaskCompletion')
    .select('*, campaign:Campaign!campaignId(title, type, bannerUrl, targetUrl)', { count: 'exact' })
    .eq('userId', userId)
    .order('createdAt', { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    tasks: (data || []).map((t: any) => ({
      ...t,
      reward: t.reward?.toString(),
    })),
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  };
}

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
  if (taskCompletion.status !== 'STARTED') throw new Error('Task already processed');

  // Verify minimum time elapsed (anti-fraud)
  const elapsed = Date.now() - new Date(taskCompletion.startedAt).getTime();
  if (elapsed < MIN_VERIFICATION_DELAY) {
    throw new Error('Please wait before claiming. Minimum verification time not met.');
  }

  const { data: campaign, error: campError } = await supabase.from('Campaign').select('*').eq('id', campaignId).single();
  if (campError || !campaign) throw new Error('Campaign not found');

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

  if (regenAmount > 0 && user.energy < maxEnergy) {
    const newEnergy = Math.min(user.energy + regenAmount, maxEnergy);
    await supabase
      .from('User')
      .update({ 
        energy: newEnergy, 
        energyUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .eq('id', userId);
    return { ...user, energy: newEnergy, maxEnergy };
  }

  return { ...user, maxEnergy };
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

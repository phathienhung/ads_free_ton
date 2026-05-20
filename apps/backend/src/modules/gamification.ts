import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { redis } from '../lib/redis';
import { getGameConfig, EnergyParams } from '../lib/config';
import { addXP } from './task';
import { getWithdrawalLimit } from './wallet';

/**
 * Get leaderboard (earners, advertisers, or referrals)
 */
export async function getLeaderboard(
  type: 'earner' | 'advertiser' | 'referral',
  period: 'daily' | 'weekly' | 'monthly' | 'all',
  limit = 50
) {
  const cacheKey = `leaderboard:${type}:${period}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  let result: any[] = [];

  if (type === 'earner') {
    // Top earners by totalEarned
    const { data: wallets, error } = await supabase
      .from('Wallet')
      .select('*, user:User!userId(username, firstName, id, photoUrl, level, telegramId)')
      .order('totalEarned', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Leaderboard fetch error:', error);
      throw error;
    }

    result = (wallets || []).map((w: any, i: number) => ({
      rank: i + 1,
      username: w.user?.username || w.user?.firstName || 'Anonymous',
      photoUrl: w.user?.photoUrl,
      level: w.user?.level,
      telegramId: w.user?.telegramId?.toString(),
      score: w.totalEarned?.toString(),
    }));
  } else if (type === 'advertiser') {
    // Top advertisers by spending
    const { data: wallets, error } = await supabase
      .from('Wallet')
      .select('*, user:User!userId(username, firstName, id, photoUrl, level, telegramId)')
      .order('totalSpent', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Leaderboard fetch error:', error);
      throw error;
    }

    result = (wallets || []).map((w: any, i: number) => ({
      rank: i + 1,
      username: w.user?.username || w.user?.firstName || 'Anonymous',
      photoUrl: w.user?.photoUrl,
      level: w.user?.level,
      telegramId: w.user?.telegramId?.toString(),
      score: w.totalSpent?.toString(),
    }));
  } else if (type === 'referral') {
    // Top referrers by referral count
    // Note: Complex aggregation is better with rpc/view in Supabase, 
    // but for now we'll do a simple select if the schema supports it.
    // In our schema, we don't have a count column, so we'd need a view or a complex query.
    // Simplifying for now: return empty or fix later with SQL view.
    const { data: users, error } = await supabase
      .from('User')
      .select('username, firstName, photoUrl, level, telegramId')
      .limit(limit);
    
    // We'll skip the counts for referral type for now to keep it stable, 
    // OR the user can create a view.
    result = (users || []).map((u, i) => ({
      rank: i + 1,
      username: u.username || u.firstName || 'Anonymous',
      photoUrl: u.photoUrl,
      level: u.level,
      telegramId: u.telegramId?.toString(),
      score: "0",
    }));
  }

  // Cache for 5 minutes
  await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
  return result;
}

/**
 * Get daily tasks for user
 */
export async function getDailyTasks(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: tasks, error: taskError } = await supabase
    .from('DailyTask')
    .select('*')
    .eq('isActive', true);

  if (taskError) throw taskError;

  const { data: progress, error: progressError } = await supabase
    .from('UserDailyTask')
    .select('*')
    .eq('userId', userId)
    .eq('date', today.toISOString().split('T')[0]);

  if (progressError) throw progressError;

  const progressMap = new Map<string, any>(progress.map((p: any) => [p.dailyTaskId, p]));

  return tasks.map((task: any) => {
    const p = progressMap.get(task.id);
    return {
      ...task,
      coinReward: task.coinReward.toString(),
      progress: p?.progress || 0,
      completed: p?.completed || false,
      claimed: p?.claimed || false,
    };
  });
}

/**
 * Claim daily task reward
 */
export async function claimDailyTask(userId: string, dailyTaskId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: progress, error: fetchError } = await supabase
    .from('UserDailyTask')
    .select('*')
    .eq('userId', userId)
    .eq('dailyTaskId', dailyTaskId)
    .eq('date', today.toISOString().split('T')[0])
    .single();

  if (fetchError || !progress || !progress.completed || progress.claimed) {
    throw new Error('Task not completed or already claimed');
  }

  const { data: task, error: taskError } = await supabase
    .from('DailyTask')
    .select('*')
    .eq('id', dailyTaskId)
    .single();

  if (taskError || !task) throw new Error('Task not found');

  // Mark as claimed
  await supabase
    .from('UserDailyTask')
    .update({ claimed: true })
    .eq('id', progress.id);

  // Credit reward
  const coinReward = Number(task.coinReward);
  if (coinReward > 0) {
    // Increment balance
    const { data: wallet } = await supabase.from('Wallet').select('balance, totalEarned').eq('userId', userId).single();
    if (wallet) {
      await supabase
        .from('Wallet')
        .update({
          balance: Number(wallet.balance) + coinReward,
          totalEarned: Number(wallet.totalEarned) + coinReward,
          updatedAt: new Date().toISOString()
        })
        .eq('userId', userId);
    }

    await supabase.from('Transaction').insert({
      id: uuidv4(),
      userId,
      type: 'DAILY_BONUS',
      amount: coinReward,
      status: 'COMPLETED',
      description: `Daily task: ${task.title}`,
      updatedAt: new Date().toISOString()
    });
  }

  // Add XP
  if (task.xpReward > 0) {
    const { data: u } = await supabase.from('User').select('xp').eq('id', userId).single();
    if (u) {
      await supabase.from('User').update({ xp: (u.xp || 0) + task.xpReward }).eq('id', userId);
    }
  }

  return { coinReward: coinReward.toString(), xpReward: task.xpReward };
}

/**
 * Get spin status for user
 */
export async function getSpinStatus(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Check if user already spun today for free
  const { count: todaySpins, error: countError } = await supabase
    .from('SpinHistory')
    .select('id', { count: 'exact', head: true })
    .eq('userId', userId)
    .gte('createdAt', today.toISOString())
    .lt('createdAt', tomorrow.toISOString());

  if (countError) throw countError;

  const { data: user } = await supabase.from('User').select('extraSpins').eq('id', userId).single();
  const { data: segments } = await supabase.from('SpinReward').select('*').eq('isActive', true);

  return {
    canFreeSpin: !todaySpins || todaySpins < 1,
    extraSpins: user?.extraSpins || 0,
    segments: segments || [],
  };
}

/**
 * Lucky spin
 */
export async function doSpin(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Check free spin
  const { count: todaySpins } = await supabase
    .from('SpinHistory')
    .select('id', { count: 'exact', head: true })
    .eq('userId', userId)
    .gte('createdAt', today.toISOString())
    .lt('createdAt', tomorrow.toISOString());

  let useExtra = false;
  if (todaySpins && todaySpins >= 1) {
    // Check extra spins
    const { data: user } = await supabase.from('User').select('extraSpins').eq('id', userId).single();
    if (!user || (user.extraSpins || 0) <= 0) {
      throw new Error('You already used your free spin today. Earn more spins by completing tasks!');
    }
    useExtra = true;
  }

  // Get reward pool
  const { data: rewards, error: poolError } = await supabase
    .from('SpinReward')
    .select('*')
    .eq('isActive', true);

  if (poolError || !rewards || rewards.length === 0) throw new Error('No spin rewards configured');

  // Weighted random selection
  const totalWeight = rewards.reduce((sum: number, r: any) => sum + r.probability, 0);
  let random = Math.random() * totalWeight;
  let selected = rewards[0];

  for (const reward of rewards) {
    random -= reward.probability;
    if (random <= 0) {
      selected = reward;
      break;
    }
  }

  const amount = Number(selected.amount);

  // Deduct extra spin if used
  if (useExtra) {
    const { data: u } = await supabase.from('User').select('extraSpins').eq('id', userId).single();
    await supabase.from('User').update({ extraSpins: Math.max(0, (u?.extraSpins || 0) - 1) }).eq('id', userId);
  }

  // Record spin
  await supabase.from('SpinHistory').insert({
    id: uuidv4(),
    userId,
    reward: amount,
    label: selected.label,
  });

  // Credit reward
  if (amount > 0) {
    if (selected.label.includes('Energy')) {
      // Reward Energy
      const config = await getGameConfig<EnergyParams>('energy_params');
      const { data: u } = await supabase.from('User').select('energy, maxEnergy').eq('id', userId).single();
      if (u) {
        const maxEnergy = u.maxEnergy || config.maxEnergy;
        const newEnergy = Math.min((u.energy || 0) + amount, maxEnergy);
        await supabase.from('User').update({ 
          energy: newEnergy,
          updatedAt: new Date().toISOString()
        }).eq('id', userId);
      }
    } else if (selected.label.includes('XP')) {
      // Reward XP (Use shared addXP helper)
      await addXP(userId, amount);
    } else if (selected.label.includes('+Spin')) {
      // Reward Extra Spin
      const { data: u } = await supabase.from('User').select('extraSpins').eq('id', userId).single();
      await supabase.from('User').update({ 
        extraSpins: (u?.extraSpins || 0) + amount,
        updatedAt: new Date().toISOString()
      }).eq('id', userId);
    } else {
      // Reward TON (Wallet)
      const { data: wallet } = await supabase.from('Wallet').select('balance, totalEarned').eq('userId', userId).single();
      if (wallet) {
        await supabase
          .from('Wallet')
          .update({
            balance: Number(wallet.balance) + amount,
            totalEarned: Number(wallet.totalEarned) + amount,
            updatedAt: new Date().toISOString()
          })
          .eq('userId', userId);
      }

      await supabase.from('Transaction').insert({
        id: uuidv4(),
        userId,
        type: 'SPIN_REWARD',
        amount,
        status: 'COMPLETED',
        description: `Lucky spin: ${selected.label}`,
        updatedAt: new Date().toISOString()
      });
    }
  }

  // Get final spin status
  const finalStatus = await getSpinStatus(userId);

  return {
    reward: amount.toString(),
    label: selected.label,
    icon: selected.icon,
    color: selected.color,
    canFreeSpin: finalStatus.canFreeSpin,
    extraSpins: finalStatus.extraSpins,
  };
}

/**
 * Get user referral stats
 */
export async function getReferralStats(userId: string) {
  const { data: user, error: userError } = await supabase
    .from('User')
    .select('referralCode, telegramId')
    .eq('id', userId)
    .single();

  if (userError || !user) throw new Error('User not found');

  const referralLink = `https://t.me/ads_free_ton_bot/app?startapp=${user.telegramId}`;

  const { count: directReferrals, error: countError } = await supabase
    .from('User')
    .select('id', { count: 'exact', head: true })
    .eq('referredById', userId);

  if (countError) throw countError;

  // Simple sum for earnings
  const { data: transactions, error: sumError } = await supabase
    .from('Transaction')
    .select('amount')
    .eq('userId', userId)
    .eq('type', 'REFERRAL_BONUS');

  if (sumError) throw sumError;

  const totalEarnings = (transactions || []).reduce((sum, t) => sum + Number(t.amount), 0);

  const { data: recentReferrals, error: recentError } = await supabase
    .from('User')
    .select('username, firstName, photoUrl, createdAt')
    .eq('referredById', userId)
    .order('createdAt', { ascending: false })
    .limit(10);

  if (recentError) throw recentError;

  // Get current withdrawal limit and all milestones
  const withdrawalLimit = await getWithdrawalLimit(userId);
  const { data: milestones } = await supabase
    .from('ReferralMilestone')
    .select('*')
    .order('target', { ascending: true });

  return {
    referralCode: user.referralCode,
    referralLink,
    totalReferrals: directReferrals || 0,
    totalEarnings: totalEarnings.toString(),
    withdrawalLimit: withdrawalLimit.toString(),
    milestones: milestones || [],
    recentReferrals: recentReferrals || [],
  };
}

/**
 * Apply referral code
 */
export async function applyReferralCode(userId: string, referralCode: string) {
  const { data: user, error: userError } = await supabase.from('User').select('*').eq('id', userId).single();
  if (userError || !user) throw new Error('User not found');
  if (user.referredById) throw new Error('Already referred by someone');

  const { data: referrer, error: refError } = await supabase
    .from('User')
    .select('id, username, firstName')
    .eq('referralCode', referralCode)
    .single();

  if (refError || !referrer) throw new Error('Invalid referral code');
  if (referrer.id === userId) throw new Error('Cannot refer yourself');

  await supabase
    .from('User')
    .update({ 
      referredById: referrer.id,
      updatedAt: new Date().toISOString()
    })
    .eq('id', userId);

  return { referrerUsername: referrer.username || referrer.firstName || 'Anonymous' };
}

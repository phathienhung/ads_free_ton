import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

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
    const wallets = await prisma.wallet.findMany({
      orderBy: { totalEarned: 'desc' },
      take: limit,
      include: {
        user: { select: { username: true, firstName: true, lastName: true, photoUrl: true, level: true, telegramId: true } },
      },
    });
    result = wallets.map((w, i) => ({
      rank: i + 1,
      username: w.user.username || w.user.firstName || 'Anonymous',
      photoUrl: w.user.photoUrl,
      level: w.user.level,
      telegramId: w.user.telegramId.toString(),
      score: w.totalEarned.toString(),
    }));
  } else if (type === 'advertiser') {
    // Top advertisers by spending
    const wallets = await prisma.wallet.findMany({
      orderBy: { totalSpent: 'desc' },
      take: limit,
      include: {
        user: { select: { username: true, firstName: true, photoUrl: true, level: true, telegramId: true } },
      },
    });
    result = wallets.map((w, i) => ({
      rank: i + 1,
      username: w.user.username || w.user.firstName || 'Anonymous',
      photoUrl: w.user.photoUrl,
      level: w.user.level,
      telegramId: w.user.telegramId.toString(),
      score: w.totalSpent.toString(),
    }));
  } else if (type === 'referral') {
    // Top referrers by referral count
    const users = await prisma.user.findMany({
      orderBy: { referrals: { _count: 'desc' } },
      take: limit,
      select: {
        username: true,
        firstName: true,
        photoUrl: true,
        level: true,
        telegramId: true,
        _count: { select: { referrals: true } },
      },
    } as any);
    result = (users as any[]).map((u, i) => ({
      rank: i + 1,
      username: u.username || u.firstName || 'Anonymous',
      photoUrl: u.photoUrl,
      level: u.level,
      telegramId: u.telegramId.toString(),
      score: u._count.referrals.toString(),
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

  const tasks = await prisma.dailyTask.findMany({
    where: { isActive: true },
  });

  const progress = await prisma.userDailyTask.findMany({
    where: { userId, date: today },
  });

  const progressMap = new Map(progress.map((p) => [p.dailyTaskId, p]));

  return tasks.map((task) => {
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

  const progress = await prisma.userDailyTask.findFirst({
    where: { userId, dailyTaskId, date: today },
  });

  if (!progress || !progress.completed || progress.claimed) {
    throw new Error('Task not completed or already claimed');
  }

  const task = await prisma.dailyTask.findUnique({ where: { id: dailyTaskId } });
  if (!task) throw new Error('Task not found');

  // Mark as claimed
  await prisma.userDailyTask.update({
    where: { id: progress.id },
    data: { claimed: true },
  });

  // Credit reward
  const coinReward = Number(task.coinReward);
  if (coinReward > 0) {
    await prisma.wallet.update({
      where: { userId },
      data: {
        balance: { increment: coinReward },
        totalEarned: { increment: coinReward },
      },
    });

    await prisma.transaction.create({
      data: {
        userId,
        type: 'DAILY_BONUS',
        amount: coinReward,
        status: 'COMPLETED',
        description: `Daily task: ${task.title}`,
      },
    });
  }

  // Add XP
  if (task.xpReward > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { xp: { increment: task.xpReward } },
    });
  }

  return { coinReward: coinReward.toString(), xpReward: task.xpReward };
}

/**
 * Lucky spin
 */
export async function doSpin(userId: string) {
  // Check if user already spun today for free
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todaySpins = await prisma.spinHistory.count({
    where: {
      userId,
      createdAt: { gte: today, lt: tomorrow },
    },
  });

  if (todaySpins >= 1) {
    throw new Error('You already used your free spin today');
  }

  // Get reward pool
  const rewards = await prisma.spinReward.findMany({ where: { isActive: true } });
  if (rewards.length === 0) throw new Error('No spin rewards configured');

  // Weighted random selection
  const totalWeight = rewards.reduce((sum, r) => sum + r.probability, 0);
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

  // Record spin
  await prisma.spinHistory.create({
    data: {
      userId,
      reward: amount,
      label: selected.label,
    },
  });

  // Credit reward
  if (amount > 0) {
    await prisma.wallet.update({
      where: { userId },
      data: {
        balance: { increment: amount },
        totalEarned: { increment: amount },
      },
    });

    await prisma.transaction.create({
      data: {
        userId,
        type: 'SPIN_REWARD',
        amount,
        status: 'COMPLETED',
        description: `Lucky spin: ${selected.label}`,
      },
    });
  }

  return {
    reward: amount.toString(),
    label: selected.label,
    icon: selected.icon,
    color: selected.color,
  };
}

/**
 * Get user referral stats
 */
export async function getReferralStats(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });

  if (!user) throw new Error('User not found');

  const directReferrals = await prisma.user.count({
    where: { referredById: userId },
  });

  const referralEarnings = await prisma.transaction.aggregate({
    where: { userId, type: 'REFERRAL_BONUS' },
    _sum: { amount: true },
  });

  const recentReferrals = await prisma.user.findMany({
    where: { referredById: userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { username: true, firstName: true, photoUrl: true, createdAt: true },
  });

  return {
    referralCode: user.referralCode,
    totalReferrals: directReferrals,
    totalEarnings: referralEarnings._sum.amount?.toString() || '0',
    recentReferrals,
  };
}

/**
 * Apply referral code
 */
export async function applyReferralCode(userId: string, referralCode: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');
  if (user.referredById) throw new Error('Already referred by someone');

  const referrer = await prisma.user.findUnique ({
    where: { referralCode },
  });
  if (!referrer) throw new Error('Invalid referral code');
  if (referrer.id === userId) throw new Error('Cannot refer yourself');

  await prisma.user.update({
    where: { id: userId },
    data: { referredById: referrer.id },
  });

  return { referrerUsername: referrer.username || referrer.firstName || 'Anonymous' };
}

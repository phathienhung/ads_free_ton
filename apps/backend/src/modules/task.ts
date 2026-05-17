import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

const ENERGY_REGEN_RATE = 1; // 1 energy per 5 minutes
const ENERGY_REGEN_INTERVAL = 5 * 60 * 1000; // 5 minutes in ms
const TASK_ENERGY_COST = 1;
const MIN_VERIFICATION_DELAY = 30 * 1000; // 30 seconds minimum
const REFERRAL_COMMISSIONS = [0.10, 0.05, 0.02]; // Level 1: 10%, Level 2: 5%, Level 3: 2%

/**
 * Start a task — user clicks to begin
 */
export async function startTask(userId: string, campaignId: string, ipAddress?: string, userAgent?: string) {
  // Check campaign is active
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== 'ACTIVE') {
    throw new Error('Campaign is not active');
  }

  // Check budget remaining
  if (Number(campaign.spentBudget) >= Number(campaign.totalBudget)) {
    throw new Error('Campaign budget exhausted');
  }

  // Check if already completed
  const existing = await prisma.taskCompletion.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
  });
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
  await prisma.user.update({
    where: { id: userId },
    data: { energy: { decrement: TASK_ENERGY_COST } },
  });

  // Create task completion
  const taskCompletion = await prisma.taskCompletion.create({
    data: {
      userId,
      campaignId,
      status: 'STARTED',
      ipAddress,
      userAgent,
    },
  });

  // Increment view count
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { viewCount: { increment: 1 } },
  });

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
  const taskCompletion = await prisma.taskCompletion.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
  });

  if (!taskCompletion) throw new Error('Task not found');
  if (taskCompletion.status !== 'STARTED') throw new Error('Task already processed');

  // Verify minimum time elapsed (anti-fraud)
  const elapsed = Date.now() - taskCompletion.startedAt.getTime();
  if (elapsed < MIN_VERIFICATION_DELAY) {
    throw new Error('Please wait before claiming. Minimum verification time not met.');
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaign not found');

  const rewardAmount = Number(campaign.pricePerAction);

  // Update task as verified & rewarded
  await prisma.taskCompletion.update({
    where: { id: taskCompletion.id },
    data: {
      status: 'REWARDED',
      reward: rewardAmount,
      verifiedAt: new Date(),
      completedAt: new Date(),
    },
  });

  // Credit user wallet
  await prisma.wallet.update({
    where: { userId },
    data: {
      balance: { increment: rewardAmount },
      totalEarned: { increment: rewardAmount },
    },
  });

  // Deduct from campaign budget
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      spentBudget: { increment: rewardAmount },
      completedCount: { increment: 1 },
      clickCount: { increment: 1 },
    },
  });

  // Deduct from advertiser frozen balance
  await prisma.wallet.update({
    where: { userId: campaign.advertiserId },
    data: {
      frozenBalance: { decrement: rewardAmount },
      totalSpent: { increment: rewardAmount },
    },
  });

  // Check if campaign budget exhausted
  const updatedCampaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (updatedCampaign && Number(updatedCampaign.spentBudget) >= Number(updatedCampaign.totalBudget)) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'COMPLETED' },
    });
  }

  // Create reward transaction
  await prisma.transaction.create({
    data: {
      userId,
      type: 'REWARD',
      amount: rewardAmount,
      status: 'COMPLETED',
      description: `Task reward: ${campaign.title}`,
      metadata: { campaignId },
    },
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
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { referredById: true },
    });

    if (!user?.referredById) break;

    const commission = rewardAmount * REFERRAL_COMMISSIONS[level];
    if (commission <= 0) break;

    // Credit referrer
    await prisma.wallet.update({
      where: { userId: user.referredById },
      data: {
        balance: { increment: commission },
        totalEarned: { increment: commission },
      },
    });

    await prisma.transaction.create({
      data: {
        userId: user.referredById,
        type: 'REFERRAL_BONUS',
        amount: commission,
        status: 'COMPLETED',
        description: `Level ${level + 1} referral bonus`,
        metadata: { fromUserId: userId, level: level + 1 },
      },
    });

    currentUserId = user.referredById;
  }
}

/**
 * Get user with regenerated energy
 */
export async function getUserWithEnergy(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const now = Date.now();
  const elapsed = now - user.energyUpdatedAt.getTime();
  const regenAmount = Math.floor(elapsed / ENERGY_REGEN_INTERVAL) * ENERGY_REGEN_RATE;

  if (regenAmount > 0 && user.energy < user.maxEnergy) {
    const newEnergy = Math.min(user.energy + regenAmount, user.maxEnergy);
    await prisma.user.update({
      where: { id: userId },
      data: { energy: newEnergy, energyUpdatedAt: new Date() },
    });
    return { ...user, energy: newEnergy };
  }

  return user;
}

/**
 * Add XP and handle level ups
 */
async function addXP(userId: string, amount: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const newXP = user.xp + amount;
  const xpForNextLevel = user.level * 100;

  if (newXP >= xpForNextLevel) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        xp: newXP - xpForNextLevel,
        level: { increment: 1 },
        maxEnergy: { increment: 5 },
      },
    });
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: { xp: newXP },
    });
  }
}

/**
 * Get user task history
 */
export async function getUserTasks(userId: string, page = 1, limit = 20) {
  const [tasks, total] = await Promise.all([
    prisma.taskCompletion.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        campaign: { select: { title: true, type: true, bannerUrl: true, targetUrl: true } },
      },
    }),
    prisma.taskCompletion.count({ where: { userId } }),
  ]);

  return {
    tasks: tasks.map((t) => ({
      ...t,
      reward: t.reward?.toString(),
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

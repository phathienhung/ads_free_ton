import { prisma } from '../lib/prisma';

/**
 * Get admin dashboard stats
 */
export async function getAdminStats() {
  const [
    totalUsers,
    totalCampaigns,
    activeCampaigns,
    pendingCampaigns,
    totalTransactions,
    pendingWithdrawals,
    fraudLogs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.campaign.count(),
    prisma.campaign.count({ where: { status: 'ACTIVE' } }),
    prisma.campaign.count({ where: { status: 'PENDING_REVIEW' } }),
    prisma.transaction.count(),
    prisma.transaction.count({ where: { type: 'WITHDRAWAL', status: 'PENDING' } }),
    prisma.fraudLog.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } }),
  ]);

  // Revenue stats
  const totalRevenue = await prisma.transaction.aggregate({
    where: { type: 'WITHDRAWAL', status: 'COMPLETED' },
    _sum: { fee: true },
  });

  const totalDeposits = await prisma.transaction.aggregate({
    where: { type: 'DEPOSIT', status: 'COMPLETED' },
    _sum: { amount: true },
  });

  // Daily new users (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const dailyUsers = await prisma.user.groupBy({
    by: ['createdAt'],
    where: { createdAt: { gte: sevenDaysAgo } },
    _count: true,
  });

  return {
    totalUsers,
    totalCampaigns,
    activeCampaigns,
    pendingCampaigns,
    totalTransactions,
    pendingWithdrawals,
    fraudLogsToday: fraudLogs,
    totalRevenue: totalRevenue._sum.fee?.toString() || '0',
    totalDeposits: totalDeposits._sum.amount?.toString() || '0',
  };
}

/**
 * Get all users (admin)
 */
export async function getUsers(page = 1, limit = 20, search?: string) {
  const where = search
    ? {
        OR: [
          { username: { contains: search, mode: 'insensitive' as const } },
          { firstName: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        wallet: { select: { balance: true, totalEarned: true, totalSpent: true } },
        _count: { select: { taskCompletions: true, referrals: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map((u: any) => ({
      ...u,
      telegramId: u.telegramId.toString(),
      wallet: u.wallet
        ? {
            balance: u.wallet.balance.toString(),
            totalEarned: u.wallet.totalEarned.toString(),
            totalSpent: u.wallet.totalSpent.toString(),
          }
        : null,
      completedTasks: (u as any)._count.taskCompletions,
      totalReferrals: (u as any)._count.referrals,
      _count: undefined,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Ban/unban user
 */
export async function toggleBanUser(userId: string, ban: boolean, reason?: string, adminId?: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      isBanned: ban,
      bannedReason: ban ? reason : null,
    },
  });

  if (adminId) {
    await prisma.adminAuditLog.create({
      data: {
        adminId,
        action: ban ? 'BAN_USER' : 'UNBAN_USER',
        target: userId,
        details: { reason },
      },
    });
  }

  return { success: true };
}

/**
 * Get pending withdrawals (admin)
 */
export async function getPendingWithdrawals(page = 1, limit = 20) {
  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { type: 'WITHDRAWAL', status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { username: true, firstName: true, telegramId: true } },
      },
    }),
    prisma.transaction.count({ where: { type: 'WITHDRAWAL', status: 'PENDING' } }),
  ]);

  return {
    transactions: transactions.map((t: any) => ({
      ...t,
      amount: t.amount.toString(),
      fee: t.fee.toString(),
      user: {
        ...(t as any).user,
        telegramId: (t as any).user.telegramId.toString(),
      },
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get fraud logs (admin)
 */
export async function getFraudLogs(page = 1, limit = 20) {
  const [logs, total] = await Promise.all([
    prisma.fraudLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { username: true, firstName: true, telegramId: true } },
      },
    }),
    prisma.fraudLog.count(),
  ]);

  return {
    logs: logs.map((l: any) => ({
      ...l,
      user: {
        ...(l as any).user,
        telegramId: (l as any).user.telegramId.toString(),
      },
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

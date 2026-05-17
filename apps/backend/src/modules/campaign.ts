import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Create a new campaign
 */
export async function createCampaign(data: {
  advertiserId: string;
  title: string;
  description: string;
  bannerUrl?: string;
  type: 'CHANNEL' | 'GROUP' | 'BOT' | 'WEBSITE' | 'MINI_APP';
  targetUrl: string;
  pricingModel?: 'CPC' | 'CPM' | 'CPE';
  pricePerAction: number;
  totalBudget: number;
  targetCount?: number;
  targetCountries?: string[];
  targetLanguages?: string[];
  minUserLevel?: number;
  startDate?: Date;
  endDate?: Date;
}) {
  // Check advertiser wallet balance
  const wallet = await prisma.wallet.findUnique({
    where: { userId: data.advertiserId },
  });

  if (!wallet || Number(wallet.balance) < data.totalBudget) {
    throw new Error('Insufficient balance to create campaign');
  }

  // Freeze budget from wallet
  await prisma.wallet.update({
    where: { userId: data.advertiserId },
    data: {
      balance: { decrement: data.totalBudget },
      frozenBalance: { increment: data.totalBudget },
    },
  });

  // Create campaign
  const campaign = await prisma.campaign.create({
    data: {
      advertiserId: data.advertiserId,
      title: data.title,
      description: data.description,
      bannerUrl: data.bannerUrl,
      type: data.type,
      targetUrl: data.targetUrl,
      pricingModel: data.pricingModel || 'CPE',
      pricePerAction: data.pricePerAction,
      totalBudget: data.totalBudget,
      targetCount: data.targetCount || Math.floor(data.totalBudget / data.pricePerAction),
      targetCountries: data.targetCountries || [],
      targetLanguages: data.targetLanguages || [],
      minUserLevel: data.minUserLevel || 1,
      startDate: data.startDate,
      endDate: data.endDate,
    },
  });

  // Create transaction record
  await prisma.transaction.create({
    data: {
      userId: data.advertiserId,
      type: 'CAMPAIGN_SPEND',
      amount: data.totalBudget,
      status: 'COMPLETED',
      description: `Campaign: ${data.title}`,
      metadata: { campaignId: campaign.id },
    },
  });

  return serializeCampaign(campaign);
}

/**
 * Get campaigns for task browsing (active and matching user)
 */
export async function getAvailableCampaigns(userId: string, page = 1, limit = 20) {
  // Get user's completed tasks to exclude
  const completedCampaignIds = await prisma.taskCompletion.findMany({
    where: { userId },
    select: { campaignId: true },
  });

  const excludeIds = completedCampaignIds.map((t: { campaignId: string }) => t.campaignId);

  const campaigns = await prisma.campaign.findMany({
    where: {
      status: 'ACTIVE',
      id: { notIn: excludeIds },
      OR: [
        { endDate: null },
        { endDate: { gte: new Date() } },
      ],
    },
    orderBy: [
      { isPriority: 'desc' },
      { createdAt: 'desc' },
    ],
    skip: (page - 1) * limit,
    take: limit,
  });

  const total = await prisma.campaign.count({
    where: {
      status: 'ACTIVE',
      id: { notIn: excludeIds },
    },
  });

  return {
    campaigns: campaigns.map(serializeCampaign),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get campaigns owned by an advertiser
 */
export async function getAdvertiserCampaigns(advertiserId: string) {
  const campaigns = await prisma.campaign.findMany({
    where: { advertiserId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { taskCompletions: true } },
    },
  });

  return campaigns.map((c: any) => ({
    ...serializeCampaign(c),
    completions: (c as any)._count.taskCompletions,
  }));
}

/**
 * Get a single campaign by id
 */
export async function getCampaignById(id: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { _count: { select: { taskCompletions: true } } },
  });
  if (!campaign) throw new Error('Campaign not found');
  return {
    ...serializeCampaign(campaign),
    completions: (campaign as any)._count.taskCompletions,
  };
}

/**
 * Admin: Approve or reject a campaign
 */
export async function reviewCampaign(campaignId: string, status: 'ACTIVE' | 'REJECTED', adminId: string) {
  const campaign = await prisma.campaign.update({
    where: { id: campaignId },
    data: { status },
  });

  // If rejected, refund budget
  if (status === 'REJECTED') {
    await prisma.wallet.update({
      where: { userId: campaign.advertiserId },
      data: {
        balance: { increment: Number(campaign.totalBudget) },
        frozenBalance: { decrement: Number(campaign.totalBudget) },
      },
    });
  }

  // Audit log
  await prisma.adminAuditLog.create({
    data: {
      adminId,
      action: `CAMPAIGN_${status}`,
      target: campaignId,
    },
  });

  return serializeCampaign(campaign);
}

/**
 * Get all campaigns for admin
 */
export async function getAllCampaigns(status?: string, page = 1, limit = 20) {
  const where = status ? { status: status as any } : {};

  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        advertiser: { select: { username: true, firstName: true, telegramId: true } },
        _count: { select: { taskCompletions: true } },
      },
    }),
    prisma.campaign.count({ where }),
  ]);

  return {
    campaigns: campaigns.map((c: any) => ({
      ...serializeCampaign(c),
      advertiser: {
        ...(c as any).advertiser,
        telegramId: (c as any).advertiser.telegramId.toString(),
      },
      completions: (c as any)._count.taskCompletions,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

function serializeCampaign(campaign: any) {
  return {
    ...campaign,
    pricePerAction: campaign.pricePerAction?.toString(),
    totalBudget: campaign.totalBudget?.toString(),
    spentBudget: campaign.spentBudget?.toString(),
    _count: undefined,
  };
}

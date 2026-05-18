import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';

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
  const { data: wallet, error: walletError } = await supabase
    .from('Wallet')
    .select('balance, frozenBalance')
    .eq('userId', data.advertiserId)
    .single();

  if (walletError || !wallet || Number(wallet.balance) < data.totalBudget) {
    throw new Error('Insufficient balance to create campaign');
  }

  // Freeze budget from wallet
  await supabase
    .from('Wallet')
    .update({
      balance: Number(wallet.balance) - data.totalBudget,
      frozenBalance: Number(wallet.frozenBalance) + data.totalBudget,
      updatedAt: new Date().toISOString()
    })
    .eq('userId', data.advertiserId);

  // Create campaign
  const campaignId = uuidv4();
  const { data: campaign, error: campError } = await supabase
    .from('Campaign')
    .insert({
      id: campaignId,
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
      status: 'ACTIVE',
      startDate: data.startDate?.toISOString(),
      endDate: data.endDate?.toISOString(),
      updatedAt: new Date().toISOString()
    })
    .select()
    .single();

  if (campError) throw campError;

  // Create transaction record
  await supabase.from('Transaction').insert({
    id: uuidv4(),
    userId: data.advertiserId,
    type: 'CAMPAIGN_SPEND',
    amount: data.totalBudget,
    status: 'COMPLETED',
    description: `Campaign: ${data.title}`,
    metadata: { campaignId: campaign.id },
    updatedAt: new Date().toISOString()
  });

  return serializeCampaign(campaign);
}

/**
 * Get campaigns for task browsing (active and matching user)
 */
export async function getAvailableCampaigns(userId: string, page = 1, limit = 20) {
  // Get user's completed tasks to exclude
  const { data: completedTasks } = await supabase
    .from('TaskCompletion')
    .select('campaignId')
    .eq('userId', userId);

  const excludeIds = (completedTasks || []).map(t => t.campaignId);

  let query = supabase
    .from('Campaign')
    .select('*', { count: 'exact' })
    .eq('status', 'ACTIVE');

  if (excludeIds.length > 0) {
    query = query.not('id', 'in', `(${excludeIds.join(',')})`);
  }

  const { data: campaigns, count, error } = await query
    .or(`endDate.is.null,endDate.gte.${new Date().toISOString()}`)
    .order('isPriority', { ascending: false })
    .order('createdAt', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (error) throw error;
  const total = count || 0;

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
  const { data: campaigns, error } = await supabase
    .from('Campaign')
    .select('*')
    .eq('advertiserId', advertiserId)
    .order('createdAt', { ascending: false });

  if (error) throw error;

  return (campaigns || []).map((c: any) => ({
    ...serializeCampaign(c),
    completions: 0, // Simplified or fix with rpc
  }));
}

/**
 * Get a single campaign by id
 */
export async function getCampaignById(id: string) {
  const { data: campaign, error } = await supabase
    .from('Campaign')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !campaign) throw new Error('Campaign not found');
  return {
    ...serializeCampaign(campaign),
    completions: 0,
  };
}

/**
 * Admin: Approve or reject a campaign
 */
export async function reviewCampaign(campaignId: string, status: 'ACTIVE' | 'REJECTED', adminId: string) {
  const { data: campaign, error: fetchError } = await supabase.from('Campaign').select('*').eq('id', campaignId).single();
  if (fetchError || !campaign) throw new Error('Campaign not found');

  const { data: updatedCampaign, error } = await supabase
    .from('Campaign')
    .update({ status, updatedAt: new Date().toISOString() })
    .eq('id', campaignId)
    .select()
    .single();

  if (error) throw error;

  // If rejected, refund budget
  if (status === 'REJECTED') {
    const { data: wallet } = await supabase.from('Wallet').select('balance, frozenBalance').eq('userId', campaign.advertiserId).single();
    if (wallet) {
      await supabase
        .from('Wallet')
        .update({
          balance: Number(wallet.balance) + Number(campaign.totalBudget),
          frozenBalance: Number(wallet.frozenBalance) - Number(campaign.totalBudget),
          updatedAt: new Date().toISOString()
        })
        .eq('userId', campaign.advertiserId);
    }
  }

  // Audit log
  await supabase.from('AdminAuditLog').insert({
    id: uuidv4(),
    adminId,
    action: `CAMPAIGN_${status}`,
    target: campaignId,
    updatedAt: new Date().toISOString()
  });

  return serializeCampaign(updatedCampaign);
}

/**
 * Get all campaigns for admin
 */
export async function getAllCampaigns(status?: string, page = 1, limit = 20) {
  let query = supabase
    .from('Campaign')
    .select('*, advertiser:User!advertiserId(username, firstName, telegramId)', { count: 'exact' });

  if (status) query = query.eq('status', status);

  const { data, count, error } = await query
    .order('createdAt', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (error) throw error;

  return {
    campaigns: (data || []).map((c: any) => ({
      ...serializeCampaign(c),
      advertiser: c.advertiser ? {
        ...c.advertiser,
        telegramId: c.advertiser.telegramId?.toString(),
      } : null,
      completions: 0,
    })),
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
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

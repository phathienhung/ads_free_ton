import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';

/**
 * Get admin dashboard stats
 */
export async function getAdminStats() {
  const { count: totalUsers } = await supabase.from('User').select('*', { count: 'exact', head: true });
  const { count: totalCampaigns } = await supabase.from('Campaign').select('*', { count: 'exact', head: true });
  const { count: activeCampaigns } = await supabase.from('Campaign').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE');
  const { count: pendingCampaigns } = await supabase.from('Campaign').select('*', { count: 'exact', head: true }).eq('status', 'PENDING_REVIEW');
  const { count: totalTransactions } = await supabase.from('Transaction').select('*', { count: 'exact', head: true });
  const { count: pendingWithdrawals } = await supabase.from('Transaction').select('*', { count: 'exact', head: true }).eq('type', 'WITHDRAWAL').eq('status', 'PENDING');
  
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const { count: fraudLogs } = await supabase.from('FraudLog').select('*', { count: 'exact', head: true }).gte('createdAt', yesterday);

  // Revenue stats
  const { data: withdrawalFees } = await supabase.from('Transaction').select('fee').eq('type', 'WITHDRAWAL').eq('status', 'COMPLETED');
  const totalRevenue = (withdrawalFees || []).reduce((sum, t) => sum + Number(t.fee || 0), 0);

  const { data: depositAmounts } = await supabase.from('Transaction').select('amount').eq('type', 'DEPOSIT').eq('status', 'COMPLETED');
  const totalDeposits = (depositAmounts || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);

  return {
    totalUsers: totalUsers || 0,
    totalCampaigns: totalCampaigns || 0,
    activeCampaigns: activeCampaigns || 0,
    pendingCampaigns: pendingCampaigns || 0,
    totalTransactions: totalTransactions || 0,
    pendingWithdrawals: pendingWithdrawals || 0,
    fraudLogsToday: fraudLogs || 0,
    totalRevenue: totalRevenue.toString(),
    totalDeposits: totalDeposits.toString(),
  };
}

/**
 * Get all users (admin)
 */
export async function getUsers(page = 1, limit = 20, search?: string) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('User')
    .select('*, wallet:Wallet(*)', { count: 'exact' });

  if (search) {
    query = query.or(`username.ilike.%${search}%,firstName.ilike.%${search}%`);
  }

  const { data: users, count, error } = await query
    .order('createdAt', { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    users: (users || []).map((u: any) => ({
      ...u,
      telegramId: u.telegramId?.toString(),
      wallet: u.wallet ? (Array.isArray(u.wallet) ? u.wallet[0] : u.wallet) : null,
      // We'll skip complex counts for now or fix later with views
      completedTasks: 0,
      totalReferrals: 0,
    })).map((u: any) => ({
      ...u,
      wallet: u.wallet ? {
        balance: u.wallet.balance?.toString() || "0",
        totalEarned: u.wallet.totalEarned?.toString() || "0",
        totalSpent: u.wallet.totalSpent?.toString() || "0",
      } : null
    })),
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  };
}

/**
 * Ban/unban user
 */
export async function toggleBanUser(userId: string, ban: boolean, reason?: string, adminId?: string) {
  await supabase
    .from('User')
    .update({
      isBanned: ban,
      bannedReason: ban ? reason : null,
      updatedAt: new Date().toISOString()
    })
    .eq('id', userId);

  if (adminId) {
    await supabase.from('AdminAuditLog').insert({
      id: uuidv4(),
      adminId,
      action: ban ? 'BAN_USER' : 'UNBAN_USER',
      target: userId,
      details: { reason },
    });
  }

  return { success: true };
}

/**
 * Get pending withdrawals (admin)
 */
export async function getPendingWithdrawals(page = 1, limit = 20) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await supabase
    .from('Transaction')
    .select('*, user:User!userId(username, firstName, telegramId)', { count: 'exact' })
    .eq('type', 'WITHDRAWAL')
    .eq('status', 'PENDING')
    .order('createdAt', { ascending: true })
    .range(from, to);

  if (error) throw error;

  return {
    transactions: (data || []).map((t: any) => ({
      ...t,
      amount: t.amount.toString(),
      fee: t.fee.toString(),
      user: t.user ? {
        ...t.user,
        telegramId: t.user.telegramId?.toString(),
      } : null,
    })),
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  };
}

/**
 * Get fraud logs (admin)
 */
export async function getFraudLogs(page = 1, limit = 20) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await supabase
    .from('FraudLog')
    .select('*, user:User!userId(username, firstName, telegramId)', { count: 'exact' })
    .order('createdAt', { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    logs: (data || []).map((l: any) => ({
      ...l,
      user: l.user ? {
        ...l.user,
        telegramId: l.user.telegramId?.toString(),
      } : null,
    })),
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  };
}

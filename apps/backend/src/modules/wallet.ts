import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { getGameConfig, WithdrawalFee } from '../lib/config';
import { redis } from '../lib/redis';
import { verifyTonTransaction } from '../lib/ton';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = '1597337885';
const CHANNEL_CHAT_ID = '@ads_free_withdrawals';

function generateShortId(length = 8) {
  return Math.random().toString(36).substring(2, 2 + length).toUpperCase();
}

async function notifyTelegram(chatId: string, text: string, replyMarkup?: any) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      })
    });
  } catch (err) {
    console.error('Telegram notification error:', err);
  }
}

/**
 * Get wallet balance for a user
 */
export async function getWallet(userId: string) {
  const { data: wallet, error } = await supabase
    .from('Wallet')
    .select('*')
    .eq('userId', userId)
    .single();

  if (error || !wallet) throw new Error('Wallet not found');

  return {
    ...wallet,
    balance: wallet.balance.toString(),
    frozenBalance: wallet.frozenBalance.toString(),
    totalEarned: wallet.totalEarned.toString(),
    totalSpent: wallet.totalSpent.toString(),
  };
}

/**
 * Deposit funds via TON Connect transaction
 */
export async function deposit(userId: string, amount: number, boc?: string) {
  if (amount <= 0) throw new Error('Amount must be positive');

  if (boc) {
    const isValid = await verifyTonTransaction(boc, amount);
    if (!isValid) throw new Error('Invalid TON transaction. Please check your transaction.');
    console.log(`[DEPOSIT] User ${userId} sent TON Connect tx, BOC verified`);
  } else {
    // If no boc, it's a manual deposit. For now, we should restrict manual deposits to admins, 
    // but we'll let it pass if that's the current business logic.
  }

  // Fetch current
  const { data: wallet } = await supabase.from('Wallet').select('balance').eq('userId', userId).single();
  if (!wallet) throw new Error('Wallet not found');

  await supabase
    .from('Wallet')
    .update({
      balance: Number(wallet.balance) + amount,
      updatedAt: new Date().toISOString()
    })
    .eq('userId', userId);

  const txId = generateShortId();
  const { data: tx, error } = await supabase.from('Transaction').insert({
    id: txId,
    userId,
    type: 'DEPOSIT',
    amount,
    status: 'COMPLETED',
    description: boc ? 'TON Connect deposit' : 'TON deposit',
    metadata: boc ? { boc: boc.substring(0, 100) } : undefined,
    updatedAt: new Date().toISOString()
  }).select('*, user:User(username, firstName)').single();

  if (error) throw error;

  // Notify Bot
  const userLabel = (tx as any).user?.username ? `@${(tx as any).user.username}` : (tx as any).user?.firstName || 'User';
  const method = boc ? '🔗 TON Connect' : '💳 Manual';
  const msg = `💳 <b>NEW DEPOSIT</b>\nUser: ${userLabel}\nAmount: <b>${amount} TON</b>\nMethod: ${method}\nID: <code>${txId}</code>`;
  await notifyTelegram(ADMIN_CHAT_ID, msg);
  await notifyTelegram(CHANNEL_CHAT_ID, msg);

  return { transactionId: tx.id, amount: amount.toString() };
}

/**
 * Request withdrawal
 */
export async function requestWithdrawal(userId: string, amount: number, tonAddress: string) {
  const lockKey = `lock:withdraw:${userId}`;
  const lock = await redis.set(lockKey, 'locked', 'EX', 5, 'NX');
  if (!lock) throw new Error('Withdrawal is already processing');

  // const FEE_RATE = 0.05; // 5% withdrawal fee
  const feeConfig = await getGameConfig<WithdrawalFee>('withdrawal_fee').catch(() => ({ rate: 0.05, minFee: 0.01 }));
  const FEE_RATE = feeConfig.rate;
  const MIN_WITHDRAWAL = 0.1;

  if (amount < MIN_WITHDRAWAL) {
    throw new Error(`Minimum withdrawal is ${MIN_WITHDRAWAL}`);
  }

  // Check daily milestone limit (Cumulative)
  const limit = await getWithdrawalLimit(userId);
  const totalToday = await getWithdrawalTotalToday(userId);
  
  if (totalToday + amount > limit) {
    throw new Error(`Your daily withdrawal limit is ${limit} TON. You have already withdrawn ${totalToday} TON today. Invite more friends to increase your limit!`);
  }

  const { data: wallet } = await supabase.from('Wallet').select('balance, frozenBalance').eq('userId', userId).single();
  if (!wallet || Number(wallet.balance) < amount) {
    throw new Error('Insufficient balance');
  }

  const fee = Math.max(amount * FEE_RATE, feeConfig.minFee);
  const netAmount = amount - fee;

  if (netAmount <= 0) {
    throw new Error(`Withdrawal amount too low. After fees (${fee} TON), you would receive 0. Try a larger amount.`);
  }

  // Freeze withdrawal amount
  await supabase
    .from('Wallet')
    .update({
      balance: Number(wallet.balance) - amount,
      frozenBalance: Number(wallet.frozenBalance) + amount,
      tonAddress,
      updatedAt: new Date().toISOString()
    })
    .eq('userId', userId);

  const txId = generateShortId();
  const { data: tx, error } = await supabase.from('Transaction').insert({
    id: txId,
    userId,
    type: 'WITHDRAWAL',
    amount: netAmount,
    fee,
    status: 'PENDING',
    description: `Withdrawal to ${tonAddress}`,
    metadata: { tonAddress },
    updatedAt: new Date().toISOString()
  }).select('*, user:User(username, firstName)').single();

  if (error) throw error;

  // Notify Admin with button
  const userLabel = (tx as any).user?.username ? `@${(tx as any).user.username}` : (tx as any).user?.firstName || 'User';
  const username = (tx as any).user?.username || 'user';
  const msg = `📤 <b>WITHDRAWAL REQUEST</b>\nUser: ${userLabel}\nAmount: <b>${netAmount} TON</b>\nAddress: <code>${tonAddress}</code>\nID: <code>${txId}</code>`;
  
  const amountInNanotons = Math.floor(netAmount * 1e9);
  const transferUrl = `ton://transfer/${tonAddress}?amount=${amountInNanotons}`;

  const replyMarkup = {
    inline_keyboard: [
      [{ text: "💸 CHUYỂN TIỀN (TON WALLET)", url: transferUrl }],
      [{ text: "✅ XÁC NHẬN ĐÃ CHUYỂN", callback_data: `DONE_${txId}_${username}_${netAmount}` }]
    ]
  };

  await notifyTelegram(ADMIN_CHAT_ID, msg, replyMarkup);

  return {
    transactionId: tx.id,
    amount: netAmount.toString(),
    fee: fee.toString(),
    status: 'PENDING',
  };
}

/**
 * Get transaction history
 */
export async function getTransactions(userId: string, page = 1, limit = 20) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await supabase
    .from('Transaction')
    .select('*', { count: 'exact' })
    .eq('userId', userId)
    .order('createdAt', { ascending: false })
    .range(from, to);

  if (error) throw error;

  const transactions = data || [];
  const total = count || 0;

  return {
    transactions: transactions.map((t: any) => ({
      ...t,
      amount: t.amount.toString(),
      fee: t.fee.toString(),
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Admin: Approve or reject withdrawal
 */
export async function processWithdrawal(
  transactionId: string,
  status: 'COMPLETED' | 'FAILED',
  adminId: string,
  tonTxHash?: string
) {
  const { data: tx, error: txError } = await supabase
    .from('Transaction')
    .select('*')
    .eq('id', transactionId)
    .single();

  if (txError || !tx || tx.type !== 'WITHDRAWAL' || tx.status !== 'PENDING') {
    throw new Error('Invalid transaction');
  }

  const totalAmount = Number(tx.amount) + Number(tx.fee);

  const { data: wallet } = await supabase.from('Wallet').select('balance, frozenBalance, totalSpent').eq('userId', tx.userId).single();
  if (!wallet) throw new Error('Wallet not found');

  if (status === 'COMPLETED') {
    // Deduct from frozen balance
    await supabase
      .from('Wallet')
      .update({
        frozenBalance: Number(wallet.frozenBalance) - totalAmount,
        totalSpent: (Number(wallet.totalSpent) || 0) + totalAmount,
        updatedAt: new Date().toISOString()
      })
      .eq('userId', tx.userId);
  } else {
    // Refund to balance
    await supabase
      .from('Wallet')
      .update({
        balance: Number(wallet.balance) + totalAmount,
        frozenBalance: Number(wallet.frozenBalance) - totalAmount,
        updatedAt: new Date().toISOString()
      })
      .eq('userId', tx.userId);
  }

  await supabase
    .from('Transaction')
    .update({ status, tonTxHash, updatedAt: new Date().toISOString() })
    .eq('id', transactionId);

  await supabase.from('AdminAuditLog').insert({
    id: uuidv4(),
    adminId,
    action: `WITHDRAWAL_${status}`,
    target: transactionId,
    details: { userId: tx.userId, amount: tx.amount.toString() },
  });

  return { status };
}

/**
 * Get total withdrawn by user in the last 24 hours
 */
export async function getWithdrawalTotalToday(userId: string): Promise<number> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('Transaction')
    .select('amount, fee')
    .eq('userId', userId)
    .eq('type', 'WITHDRAWAL')
    .in('status', ['PENDING', 'COMPLETED'])
    .gte('createdAt', oneDayAgo);

  if (error || !data) return 0;

  // We sum (amount + fee) to get the total raw value deducted from balance
  return data.reduce((sum, tx) => sum + Number(tx.amount) + Number(tx.fee), 0);
}

/**
 * Get current withdrawal limit based on referral milestones
 */
export async function getWithdrawalLimit(userId: string): Promise<number> {
  const { data: user, error: userError } = await supabase
    .from('User')
    .select('milestonesAchieved')
    .eq('id', userId)
    .single();

  if (userError || !user) return 0;

  const milestonesArray = Array.isArray(user.milestonesAchieved) ? user.milestonesAchieved : [];
  
  // 1. Fetch available milestones from system
  const { data: milestones } = await supabase
    .from('ReferralMilestone')
    .select('*')
    .order('target', { ascending: false });

  if (!milestones || milestones.length === 0) return 0.1;

  // 2. Find the highest achieved milestone using the JSONB array
  let maxTarget = 0;
  if (milestonesArray.length > 0) {
    maxTarget = Math.max(...milestonesArray.map(m => Number(m)));
  }

  const achieved = milestones.find(m => maxTarget >= m.target);
  
  if (!achieved) {
    return 0; 
  }

  return Number(achieved.withdrawalLimit);
}

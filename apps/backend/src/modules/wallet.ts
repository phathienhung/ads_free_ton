import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';

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
 * Deposit funds (simulated — in production use TON Connect)
 */
export async function deposit(userId: string, amount: number) {
  if (amount <= 0) throw new Error('Amount must be positive');

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

  const txId = uuidv4();
  const { data: tx, error } = await supabase.from('Transaction').insert({
    id: txId,
    userId,
    type: 'DEPOSIT',
    amount,
    status: 'COMPLETED',
    description: 'TON deposit',
    updatedAt: new Date().toISOString()
  }).select().single();

  if (error) throw error;

  return { transactionId: tx.id, amount: amount.toString() };
}

/**
 * Request withdrawal
 */
export async function requestWithdrawal(userId: string, amount: number, tonAddress: string) {
  if (amount <= 0) throw new Error('Amount must be positive');
  
  const FEE_RATE = 0.05; // 5% withdrawal fee
  const MIN_WITHDRAWAL = 0.1;

  if (amount < MIN_WITHDRAWAL) {
    throw new Error(`Minimum withdrawal is ${MIN_WITHDRAWAL}`);
  }

  const { data: wallet } = await supabase.from('Wallet').select('balance, frozenBalance').eq('userId', userId).single();
  if (!wallet || Number(wallet.balance) < amount) {
    throw new Error('Insufficient balance');
  }

  const fee = amount * FEE_RATE;
  const netAmount = amount - fee;

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

  const txId = uuidv4();
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
  }).select().single();

  if (error) throw error;

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

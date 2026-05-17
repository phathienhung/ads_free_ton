import { prisma } from '../lib/prisma';

/**
 * Get wallet balance for a user
 */
export async function getWallet(userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new Error('Wallet not found');

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

  await prisma.wallet.update({
    where: { userId },
    data: {
      balance: { increment: amount },
    },
  });

  const tx = await prisma.transaction.create({
    data: {
      userId,
      type: 'DEPOSIT',
      amount,
      status: 'COMPLETED',
      description: 'TON deposit',
    },
  });

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

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || Number(wallet.balance) < amount) {
    throw new Error('Insufficient balance');
  }

  const fee = amount * FEE_RATE;
  const netAmount = amount - fee;

  // Freeze withdrawal amount
  await prisma.wallet.update({
    where: { userId },
    data: {
      balance: { decrement: amount },
      frozenBalance: { increment: amount },
      tonAddress,
    },
  });

  const tx = await prisma.transaction.create({
    data: {
      userId,
      type: 'WITHDRAWAL',
      amount: netAmount,
      fee,
      status: 'PENDING',
      description: `Withdrawal to ${tonAddress}`,
      metadata: { tonAddress },
    },
  });

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
  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transaction.count({ where: { userId } }),
  ]);

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
  const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!tx || tx.type !== 'WITHDRAWAL' || tx.status !== 'PENDING') {
    throw new Error('Invalid transaction');
  }

  const totalAmount = Number(tx.amount) + Number(tx.fee);

  if (status === 'COMPLETED') {
    // Deduct from frozen balance
    await prisma.wallet.update({
      where: { userId: tx.userId },
      data: {
        frozenBalance: { decrement: totalAmount },
        totalSpent: { increment: totalAmount },
      },
    });
  } else {
    // Refund to balance
    await prisma.wallet.update({
      where: { userId: tx.userId },
      data: {
        balance: { increment: totalAmount },
        frozenBalance: { decrement: totalAmount },
      },
    });
  }

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { status, tonTxHash },
  });

  await prisma.adminAuditLog.create({
    data: {
      adminId,
      action: `WITHDRAWAL_${status}`,
      target: transactionId,
      details: { userId: tx.userId, amount: tx.amount.toString() },
    },
  });

  return { status };
}

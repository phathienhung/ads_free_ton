import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1597337885';
const CHANNEL_CHAT_ID = process.env.CHANNEL_CHAT_ID || '@ads_free_withdrawals';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

export async function handleTelegramWebhook(req: Request, res: Response) {
  const secretToken = req.headers['x-telegram-bot-api-secret-token'];
  if (WEBHOOK_SECRET && secretToken !== WEBHOOK_SECRET) {
    console.warn('Unauthorized webhook request');
    return res.status(401).send('Unauthorized');
  }

  const update = req.body;
  console.log('Telegram Update received:', JSON.stringify(update));

  try {
    // 1. Handle Callback Query (Xác nhận đã chuyển)
    if (update.callback_query) {
      const cb = update.callback_query;
      const data = cb.data as string;
      
      if (data && data.startsWith('DONE_')) {
        const [_, txId, username, amount] = data.split('_');
        console.log(`Webhook: Processing DONE for tx ${txId}`);

        // Sync with Supabase
        const { data: tx } = await supabase
          .from('Transaction')
          .select('*')
          .eq('id', txId)
          .single();

        if (tx && tx.status === 'PENDING') {
          const totalAmount = Number(tx.amount) + Number(tx.fee);

          // Mark Transaction as Completed
          await supabase
            .from('Transaction')
            .update({ status: 'COMPLETED', updatedAt: new Date().toISOString() })
            .eq('id', txId);

          // Deduct from Frozen Balance
          const { data: wallet } = await supabase
            .from('Wallet')
            .select('*')
            .eq('userId', tx.userId)
            .single();

          if (wallet) {
            await supabase
              .from('Wallet')
              .update({
                frozenBalance: Math.max(0, Number(wallet.frozenBalance) - totalAmount),
                totalSpent: (Number(wallet.totalSpent) || 0) + totalAmount,
                updatedAt: new Date().toISOString()
              })
              .eq('userId', tx.userId);
          }

          // Edit admin message
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: ADMIN_CHAT_ID,
              message_id: cb.message.message_id,
              text: `✅ <b>PAYMENT CONFIRMED (#${txId})</b>\nUser: @${username}\nAmount: <b>${amount} TON</b>\nStatus: <b>SUCCESS</b>`,
              parse_mode: 'HTML'
            })
          });

          // Notify Channel
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: CHANNEL_CHAT_ID,
              text: `✅ <b>WITHDRAWAL SUCCESSFUL</b>\nUser: @${username}\nAmount: <b>${amount} TON</b>\nStatus: <b>CONFIRMED BY ADMIN</b>`,
              parse_mode: 'HTML'
            })
          });

          // Delete admin notification message
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: ADMIN_CHAT_ID,
              message_id: cb.message.message_id
            })
          });
          
          console.log(`Withdrawal ${txId} confirmed and message deleted`);
        }

        // Answer callback to remove loading state
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: cb.id,
            text: "Xác nhận thành công!",
            show_alert: true
          })
        });
      }
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
  }

  res.status(200).send('OK');
}

import { VercelRequest, VercelResponse } from '@vercel/node';

const BOT_TOKEN = '8942132951:AAGvbVoWMIja8FYWpV-ezCBE9m-spXv4WhM';
const ADMIN_CHAT_ID = '1597337885';
const CHANNEL_CHAT_ID = '@ads_free_withdrawals';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(200).send('OK');

    const update = req.body;
    
    try {
        // === 1. Handle Callback Query from inline buttons (callback_data) ===
        if (update.callback_query) {
            const cb = update.callback_query;
            const data = cb.data;
            console.log('Callback Query received:', data);
            
            if (data && data.startsWith('DONE_')) {
                const parts = data.split('_');
                const id = parts[1];
                const username = parts[2];
                const amount = parts[3];

                console.log(`Processing withdrawal #${id} for @${username} (Amount: ${amount})`);

                // === Supabase Sync ===
                const supabaseUrl = process.env.SUPABASE_URL || 'https://ewxbxlqjryfuvhlyveqi.supabase.co';
                const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

                if (supabaseKey) {
                    try {
                        // 1. Get Transaction
                        const txRes = await fetch(`${supabaseUrl}/rest/v1/Transaction?id=eq.${id}&select=*`, {
                            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                        });
                        const [tx] = await txRes.json();

                        if (tx && tx.status === 'PENDING') {
                            const totalAmount = Number(tx.amount) + Number(tx.fee);
                            
                            // 2. Update Transaction
                            await fetch(`${supabaseUrl}/rest/v1/Transaction?id=eq.${id}`, {
                                method: 'PATCH',
                                headers: { 
                                    'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
                                    'Content-Type': 'application/json', 'Prefer': 'return=representation'
                                },
                                body: JSON.stringify({ status: 'COMPLETED', updatedAt: new Date().toISOString() })
                            });

                            // 3. Update Wallet
                            const walletRes = await fetch(`${supabaseUrl}/rest/v1/Wallet?userId=eq.${tx.userId}&select=*`, {
                                headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                            });
                            const [wallet] = await walletRes.json();

                            if (wallet) {
                                await fetch(`${supabaseUrl}/rest/v1/Wallet?userId=eq.${tx.userId}`, {
                                    method: 'PATCH',
                                    headers: { 
                                        'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        frozenBalance: Number(wallet.frozenBalance) - totalAmount,
                                        totalSpent: (Number(wallet.totalSpent) || 0) + totalAmount,
                                        updatedAt: new Date().toISOString()
                                    })
                                });
                            }
                        }
                    } catch (dbErr) {
                        console.error('Database sync error in webhook:', dbErr);
                    }
                }

                // 1. Edit Bot message (Need to check whether the bot has edit permission)
                const editRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: ADMIN_CHAT_ID,
                        message_id: cb.message.message_id,
                        text: `✅ <b>PAYMENT CONFIRMED (#${id})</b>\nUser: @${username}\nAmount: <b>${amount} TON</b>\nStatus: <b>SUCCESS</b>`,
                        parse_mode: 'HTML'
                    })
                });
                const editData = await editRes.json();
                console.log('EditMessage result:', JSON.stringify(editData));

                // 2. Send notification to the Channel
                const sendRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: CHANNEL_CHAT_ID,
                        text: `✅ <b>WITHDRAWAL SUCCESSFUL</b>\nUser: @${username}\nAmount: <b>${amount} TON</b>\nStatus: <b>CONFIRMED BY ADMIN</b>`,
                        parse_mode: 'HTML'
                    })
                });
                const sendData = await sendRes.json();
                console.log('SendMessage (Channel) result:', JSON.stringify(sendData));

                // 3. Answer Callback (IMPORTANT: prevents the button from loading forever)
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        callback_query_id: cb.id, 
                        text: "Confirmation successful!",
                        show_alert: true 
                    })
                });
            } else {
                console.log('Ignored callback data:', data);
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        callback_query_id: cb.id, 
                        text: `Invalid command: ${data}`, 
                        show_alert: true 
                    })
                });
            }
        }

        // === 2. Fallback: Handle /start DONE_xxx (from old URL button) ===
        if (update.message && update.message.text) {
            const text = update.message.text;
            const match = text.match(/^\/start\s+DONE_(\S+)/i);
            if (match) {
                const payload = match[1]; // e.g. "ID_username_amount" or just "ID"
                const chatId = update.message.chat.id;

                // Send confirmation to admin
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: `✅ <b>PAYMENT CONFIRMED</b>\nWithdrawal ID: <code>${payload}</code>\nStatus: <b>SUCCESS</b>`,
                        parse_mode: 'HTML'
                    })
                });

                // Send notification to the channel
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: CHANNEL_CHAT_ID,
                        text: `✅ <b>WITHDRAWAL SUCCESSFUL</b>\nWithdrawal ID: <code>${payload}</code>\nStatus: <b>CONFIRMED BY ADMIN</b>`,
                        parse_mode: 'HTML'
                    })
                });
            }
        }
    } catch (e) {
        console.error('Webhook error:', e);
    }

    return res.status(200).send('OK');
}
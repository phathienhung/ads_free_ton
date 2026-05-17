import { Bot, InlineKeyboard } from 'grammy';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MINI_APP_URL = process.env.TELEGRAM_MINI_APP_URL || 'http://localhost:3000';

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// /start command
bot.command('start', async (ctx) => {
  const referralCode = ctx.match; // e.g., /start REF_CODE
  const welcomeText = `🚀 *Welcome to AdsFree!*

The #1 Telegram advertising platform where you can:

💰 *Earn rewards* by completing simple tasks
📢 *Promote* your channel, group, or bot
🎯 *Target* real Telegram users
🎰 *Spin the wheel* for bonus rewards
🏆 *Compete* on the leaderboard

${referralCode ? `🎁 You were invited with code: \`${referralCode}\`` : ''}

Click the button below to start earning! 👇`;

  const keyboard = new InlineKeyboard()
    .webApp('🎮 Open AdsFree', `${MINI_APP_URL}${referralCode ? `?ref=${referralCode}` : ''}`)
    .row()
    .url('📢 Channel', 'https://t.me/adsfree_official')
    .url('💬 Community', 'https://t.me/adsfree_chat');

  await ctx.reply(welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
});

// /balance command
bot.command('balance', async (ctx) => {
  await ctx.reply(
    '💳 To check your balance, open the mini app:',
    {
      reply_markup: new InlineKeyboard().webApp('💰 Check Balance', `${MINI_APP_URL}/wallet`),
    }
  );
});

// /referral command
bot.command('referral', async (ctx) => {
  await ctx.reply(
    '👥 Share your referral link and earn commissions on 3 levels!\n\n' +
    '• Level 1: 10% commission\n' +
    '• Level 2: 5% commission\n' +
    '• Level 3: 2% commission\n\n' +
    'Open the app to get your link:',
    {
      reply_markup: new InlineKeyboard().webApp('🔗 Get Referral Link', `${MINI_APP_URL}/referral`),
    }
  );
});

// /advertise command
bot.command('advertise', async (ctx) => {
  await ctx.reply(
    '📢 *Promote your channel, group, bot or website!*\n\n' +
    '✅ Real Telegram users\n' +
    '✅ Anti-fraud protection\n' +
    '✅ Detailed analytics\n' +
    '✅ Pay per action (CPC/CPE)\n\n' +
    'Create your first campaign:',
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().webApp('🚀 Create Campaign', `${MINI_APP_URL}/advertiser`),
    }
  );
});

// /help command
bot.command('help', async (ctx) => {
  await ctx.reply(
    '❓ *AdsFree Help*\n\n' +
    '*Commands:*\n' +
    '/start - Start the bot\n' +
    '/balance - Check your balance\n' +
    '/referral - Get your referral link\n' +
    '/advertise - Create an ad campaign\n' +
    '/help - Show this help\n\n' +
    '*How to earn:*\n' +
    '1. Open the mini app\n' +
    '2. Browse available tasks\n' +
    '3. Join channels or complete tasks\n' +
    '4. Claim your rewards!\n\n' +
    '*Support:* @adsfree_support',
    { parse_mode: 'Markdown' }
  );
});

// Handle any text message
bot.on('message:text', async (ctx) => {
  await ctx.reply(
    'Use the mini app to browse tasks and earn rewards! 🎮',
    {
      reply_markup: new InlineKeyboard().webApp('🎮 Open AdsFree', MINI_APP_URL),
    }
  );
});

// Error handling
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Start bot
bot.start({
  onStart: () => {
    console.log('🤖 AdsFree Bot is running!');
  },
});

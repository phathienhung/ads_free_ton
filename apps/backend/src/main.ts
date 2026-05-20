// AdsFree API Main Entry Point - Deploy Version 1.0.1
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Load env
if (process.env.NODE_ENV !== 'production') {
  dotenv.config(); // Standard load for local environments
  dotenv.config({ path: '../../.env' }); // Fallback for local monorepo setup
}

import { authenticateUser, serializeUser } from './modules/auth';
import { authMiddleware, adminMiddleware, AuthRequest } from './middleware/auth';
import {
  createCampaign,
  getAvailableCampaigns,
  getAdvertiserCampaigns,
  getCampaignById,
  reviewCampaign,
  getAllCampaigns,
} from './modules/campaign';
import { startTask, completeTask, getUserTasks, getUserWithEnergy } from './modules/task';
import { getWallet, deposit, requestWithdrawal, getTransactions, processWithdrawal } from './modules/wallet';
import {
  getLeaderboard,
  getDailyTasks,
  claimDailyTask,
  getSpinStatus,
  doSpin,
  getReferralStats,
  applyReferralCode,
} from './modules/gamification';
import { getAdminStats, getUsers, toggleBanUser, getPendingWithdrawals, getFraudLogs } from './modules/admin';
import { handleTelegramWebhook } from './modules/webhook';
import { getGameConfig, EnergyParams, LevelingParams } from './lib/config';
import { supabase } from './lib/supabase';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const PORT = process.env.PORT || process.env.BACKEND_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Root route
app.get('/', (_req, res) => {
  res.json({ message: 'AdsFree API is running', version: '1.0.0' });
});

// Health check
app.get('/api/health', async (_req, res) => {
  const { data, error } = await supabase.from('User').select('count', { count: 'exact', head: true });
  res.json({ 
    status: 'ok', 
    supabase: error ? 'error' : 'connected',
    timestamp: new Date().toISOString() 
  });
});

// Telegram Webhook
app.post('/api/webhook', handleTelegramWebhook);

// Game Config (Public)
app.get('/api/config', async (_req, res) => {
  try {
    const [energy, leveling] = await Promise.all([
      getGameConfig<EnergyParams>('energy_params'),
      getGameConfig<LevelingParams>('leveling_params'),
    ]);
    res.json({ energy, leveling });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health/supabase', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('User').select('id').limit(1);
    if (error) throw error;
    res.json({ status: 'connected', sampleData: data });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==================== AUTH ====================
app.post('/api/auth/login', async (req: express.Request, res: express.Response) => {
  try {
    const { initData } = req.body;
    const ip = req.ip || req.socket.remoteAddress;
    const ua = req.headers['user-agent'];
    const result = await authenticateUser(initData, ip, ua);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

// Dev login (for testing without Telegram)
app.post('/api/auth/dev-login', async (req: express.Request, res: express.Response) => {
  try {
    const { telegramId, username, firstName } = req.body;
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Dev login disabled in production' });
    }

    let { data: user } = await supabase
      .from('User')
      .select('*, wallet:Wallet(*)')
      .eq('telegramId', telegramId || 123456789)
      .single();

    if (!user) {
      const { data: newUser, error: createError } = await supabase
        .from('User')
        .insert({
          id: uuidv4(),
          telegramId: telegramId || 123456789,
          username: username || 'dev_user',
          firstName: firstName || 'Dev',
          referralCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
          role: 'USER',
          level: 1,
          xp: 0,
          energy: 100,
          maxEnergy: 100,
          energyUpdatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .select()
        .single();
      
      if (createError) throw createError;

      const { data: newWallet } = await supabase.from('Wallet').insert({
        id: uuidv4(),
        userId: newUser.id,
        balance: 0,
        frozenBalance: 0,
        totalEarned: 0,
        totalSpent: 0,
        updatedAt: new Date().toISOString()
      }).select().single();

      user = { ...newUser, wallet: newWallet };
    }

    const accessToken = jwt.sign(
      { userId: user.id, telegramId: user.telegramId.toString(), role: user.role },
      process.env.JWT_SECRET || 'change-me',
      { expiresIn: '24h' }
    );

    res.json({
      user: serializeUser(user),
      accessToken,
      refreshToken: accessToken,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== USER ====================
app.get('/api/user/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await getUserWithEnergy(req.userId!);
    const { data: wallet } = await supabase.from('Wallet').select('*').eq('userId', req.userId!).single();
    res.json(serializeUser({ ...user, wallet }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== CAMPAIGNS ====================
app.get('/api/campaigns', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await getAvailableCampaigns(req.userId!, page, limit);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/campaigns/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const campaign = await getCampaignById(req.params.id as string);
    res.json(campaign);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

app.post('/api/campaigns', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const campaign = await createCampaign({
      advertiserId: req.userId!,
      ...req.body,
    });
    res.status(201).json(campaign);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/advertiser/campaigns', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const campaigns = await getAdvertiserCampaigns(req.userId!);
    res.json(campaigns);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TASKS ====================
app.post('/api/tasks/:campaignId/start', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress;
    const ua = req.headers['user-agent'];
    const result = await startTask(req.userId!, req.params.campaignId as string, ip, ua);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/tasks/:campaignId/complete', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await completeTask(req.userId!, req.params.campaignId as string);
    // Emit realtime reward event
    io.to(req.userId!).emit('reward', result);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/tasks/history', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const result = await getUserTasks(req.userId!, page);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== WALLET ====================
app.get('/api/wallet', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const wallet = await getWallet(req.userId!);
    res.json(wallet);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/wallet/deposit', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await deposit(req.userId!, req.body.amount);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/wallet/withdraw', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await requestWithdrawal(req.userId!, req.body.amount, req.body.tonAddress);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/wallet/transactions', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const result = await getTransactions(req.userId!, page);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== GAMIFICATION ====================
app.get('/api/leaderboard/:type', async (req: express.Request, res: express.Response) => {
  try {
    const type = req.params.type as 'earner' | 'advertiser' | 'referral';
    const period = (req.query.period as string) || 'all';
    const result = await getLeaderboard(type, period as any);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/daily-tasks', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tasks = await getDailyTasks(req.userId!);
    res.json(tasks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/daily-tasks/:id/claim', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await claimDailyTask(req.userId!, req.params.id as string);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/spin/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await getSpinStatus(req.userId!);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/spin', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await doSpin(req.userId!);
    io.to(req.userId!).emit('spin-reward', result);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/referral', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const stats = await getReferralStats(req.userId!);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/referral/apply', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await applyReferralCode(req.userId!, req.body.referralCode);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== ADMIN ====================
app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const stats = await getAdminStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req: express.Request, res: express.Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const search = req.query.search as string;
    const result = await getUsers(page, 20, search);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users/:id/ban', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await toggleBanUser(req.params.id as string, req.body.ban, req.body.reason, req.userId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/campaigns', authMiddleware, adminMiddleware, async (req: express.Request, res: express.Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const status = req.query.status as string;
    const result = await getAllCampaigns(status, page);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/campaigns/:id/review', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await reviewCampaign(req.params.id as string, req.body.status, req.userId!);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/withdrawals', authMiddleware, adminMiddleware, async (req: express.Request, res: express.Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const result = await getPendingWithdrawals(page);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/withdrawals/:id/process', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await processWithdrawal(req.params.id as string, req.body.status, req.userId!, req.body.tonTxHash);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/fraud-logs', authMiddleware, adminMiddleware, async (req: express.Request, res: express.Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const result = await getFraudLogs(page);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== WEBSOCKET ====================
io.on('connection', (socket: any) => {
  const userId = socket.handshake.query.userId as string;
  if (userId) {
    socket.join(userId);
    console.log(`User ${userId} connected to WebSocket`);
  }

  socket.on('disconnect', () => {
    console.log(`User disconnected from WebSocket`);
  });
});

// ==================== START SERVER ====================
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  httpServer.listen(PORT, () => {
    console.log(`🚀 AdsFree API server running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket ready (Local/Dev only)`);
  });
}

export default app;

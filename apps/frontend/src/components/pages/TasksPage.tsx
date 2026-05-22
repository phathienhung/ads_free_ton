'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAppStore } from '@/stores/useAppStore';

const typeIcons: Record<string, string> = {
  CHANNEL: '📢', GROUP: '👥', BOT: '🤖', WEBSITE: '🌐', MINI_APP: '🎮',
};

const typeFilters = ['ALL', 'CHANNEL', 'GROUP', 'BOT', 'WEBSITE'];

export default function TasksPage() {
  const { user, setUser, showReward, refreshUser } = useAppStore();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [startedTasks, setStartedTasks] = useState<Set<string>>(new Set());
  const [verifiedTasks, setVerifiedTasks] = useState<Set<string>>(new Set());
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [dailyTasks, setDailyTasks] = useState<any[]>([]);

  useEffect(() => {
    loadCampaigns();
    loadDailyTasks();
  }, []);

  async function loadDailyTasks() {
    try {
      const data = await api.getDailyTasks();
      setDailyTasks(data);
    } catch (err) {
      console.error('Daily tasks load error:', err);
    }
  }

  async function loadCampaigns() {
    try {
      setLoading(true);
      const data = await api.getCampaigns(1);
      
      const newStarted = new Set<string>();
      const newVerified = new Set<string>();
      const newCompleted = new Set<string>();
      
      data.campaigns.forEach((c: any) => {
        if (c.userStatus === 'STARTED') {
          newStarted.add(c.id);
        }
        if (c.userStatus === 'VERIFIED') {
          newVerified.add(c.id);
        }
        if (c.userStatus === 'REWARDED') {
          newCompleted.add(c.id);
        }
      });
      
      setStartedTasks(prev => new Set([...prev, ...newStarted]));
      setVerifiedTasks(prev => new Set([...prev, ...newVerified]));
      setCompletedTasks(prev => new Set([...prev, ...newCompleted]));
      setCampaigns(data.campaigns);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function handleVerify(campaignId: string) {
    try {
      setActionLoading(campaignId);
      // Ensure it is started, wait briefly to ensure state
      await api.startTask(campaignId).catch(() => {});
      await api.verifyTask(campaignId);
      setVerifiedTasks((s) => new Set(s).add(campaignId));
    } catch (err: any) {
      alert(err.message);
    }
    setActionLoading(null);
  }

  async function handleComplete(campaignId: string) {
    try {
      setActionLoading(campaignId);

      // Trigger Adsgram ad display before completing the task
      if (typeof window !== 'undefined' && (window as any).Adsgram) {
        try {
          const AdController = (window as any).Adsgram.init({ blockId: "30736" });
          await AdController.show();
        } catch (adErr) {
          console.warn('Adsgram show failed or skipped', adErr);
          throw new Error('You must watch the ad to claim the reward. Please disable your AdBlocker and try again.');
        }
      }

      const result = await api.completeTask(campaignId);
      setCompletedTasks((s) => new Set(s).add(campaignId));
      showReward(result.reward, `Task: ${result.campaignTitle}`);
      await refreshUser();
      await loadCampaigns(); // Refresh campaigns to show completion
    } catch (err: any) {
      alert(err.message);
    }
    setActionLoading(null);
  }

  async function handleClaimDaily(taskId: string) {
    try {
      setActionLoading(`daily-${taskId}`);
      const result = await api.claimDailyTask(taskId);
      showReward(result.coinReward, 'Daily Bonus Claimed!');
      await refreshUser();
      await loadDailyTasks();
    } catch (err: any) {
      alert(err.message);
    }
    setActionLoading(null);
  }

  const filtered = filter === 'ALL' ? campaigns : campaigns.filter((c) => c.type === filter);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">📋 Ad Tasks</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{filtered.length} available</span>
      </div>

      {/* Filter Tabs */}
      <div className="tabs" style={{ overflowX: 'auto', paddingBottom: 4 }}>
        {['ALL', 'DAILY', ...typeFilters.slice(1)].map((f) => (
          <button
            key={f}
            className={`tab ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
            style={{ whiteSpace: 'nowrap' }}
          >
            {f === 'ALL' ? '🔥 All' : f === 'DAILY' ? '📅 Daily' : `${typeIcons[f]} ${f.charAt(0) + f.slice(1).toLowerCase()}`}
          </button>
        ))}
      </div>

      {/* Daily Tasks Section (Sticky/Pinned if not filtered out) */}
      {(filter === 'ALL' || filter === 'DAILY') && dailyTasks.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 className="section-title" style={{ marginBottom: 0, fontSize: 18 }}>📅 Daily Rewards</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dailyTasks.map((dt) => (
              <div key={dt.id} className="glass-card" style={{ padding: 12, borderLeft: dt.completed && !dt.claimed ? '4px solid var(--accent-green)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ fontSize: 24 }}>{dt.icon || '🎁'}</div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{dt.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reward: {dt.coinReward} TON + {dt.xpReward} XP</div>
                    </div>
                  </div>
                  {dt.claimed ? (
                    <span className="badge badge-gray">Claimed</span>
                  ) : dt.completed ? (
                    <button 
                      className="btn btn-primary btn-sm" 
                      onClick={() => handleClaimDaily(dt.id)}
                      disabled={actionLoading === `daily-${dt.id}`}
                    >
                      {actionLoading === `daily-${dt.id}` ? '...' : 'Claim'}
                    </button>
                  ) : (
                    <span className="badge badge-blue">{dt.progress || 0}/{dt.target}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tasks List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1,2,3,4,5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-text">No tasks available for this category</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((c, i) => {
            const isVerified = verifiedTasks.has(c.id) || completedTasks.has(c.id);
            const isStarted = startedTasks.has(c.id) || isVerified;
            const isCompleted = completedTasks.has(c.id);
            const isProcessing = actionLoading === c.id;
            const isOtherProcessing = actionLoading !== null && actionLoading !== c.id && !actionLoading.startsWith('daily-');

            return (
              <div
                key={c.id}
                className="glass-card animate-fade-in"
                style={{
                  padding: 16,
                  animationDelay: `${i * 0.05}s`,
                  opacity: isOtherProcessing ? 0.4 : 1,
                  pointerEvents: isOtherProcessing ? 'none' : 'auto',
                  transition: 'opacity 0.3s ease',
                }}
              >
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <div className="campaign-icon" style={{ width: 56, height: 56, fontSize: 28 }}>
                    {typeIcons[c.type] || '📢'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div className="campaign-title" style={{ fontSize: 16 }}>{c.title}</div>
                      <div className="campaign-reward" style={{ fontSize: 16 }}>
                        +{parseFloat(c.pricePerAction).toFixed(4)}
                      </div>
                    </div>
                    <div className="campaign-desc" style={{ marginTop: 4 }}>{c.description}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <span className="badge badge-blue">{c.type}</span>
                      <span className="badge badge-green">{c.pricingModel}</span>
                    </div>
                  </div>
                </div>

                {/* Budget Progress */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                    <span>{c.completedCount}/{c.targetCount} completed</span>
                    <span>{((parseFloat(c.spentBudget) / parseFloat(c.totalBudget)) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{
                      width: `${(parseFloat(c.spentBudget) / parseFloat(c.totalBudget)) * 100}%`,
                    }} />
                  </div>
                </div>

                {/* Action Button */}
                {isCompleted ? (
                  <button className="btn btn-success btn-full" disabled>
                    ✅ Completed
                  </button>
                ) : isVerified ? (
                  <button
                    className="btn btn-success btn-full"
                    disabled={isProcessing || isOtherProcessing}
                    onClick={() => handleComplete(c.id)}
                  >
                    {isProcessing ? '⏳ Claiming...' : '🎁 Claim Reward'}
                  </button>
                ) : isStarted ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '12px', flexShrink: 0 }}
                      disabled={isOtherProcessing}
                      title="Open link again"
                      onClick={() => {
                        const url = c.targetUrl;
                        if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
                          const tg = (window as any).Telegram.WebApp;
                          if (url.includes('t.me') || url.includes('tg://')) {
                            tg.openTelegramLink(url);
                          } else {
                            tg.openLink(url);
                          }
                        } else {
                          window.open(url, '_blank');
                        }
                      }}
                    >
                      🔗
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      disabled={isProcessing || isOtherProcessing}
                      onClick={() => handleVerify(c.id)}
                    >
                      {isProcessing ? '⏳ Checking...' : '✅ I Did It'}
                    </button>
                  </div>
                ) : (
                  <button
                    className={`btn btn-primary btn-full${isOtherProcessing ? ' disabled' : ''}`}
                    style={{
                      pointerEvents: isOtherProcessing ? 'none' : 'auto',
                    }}
                    disabled={isOtherProcessing}
                    onClick={() => {
                      if (actionLoading) return;
                      
                      // 0. Optimistically deduct energy in UI so it updates instantly
                      // We must also update energyUpdatedAt, otherwise useLiveEnergy will 
                      // immediately regenerate the energy based on the old timestamp!
                      if (user) {
                        setUser({ 
                          ...user, 
                          energy: Math.max(0, user.energy - 1),
                          energyUpdatedAt: new Date().toISOString()
                        });
                      }

                      // 1. Fire startTask FIRST using keepalive fetch (survives page close)
                      api.startTaskBeacon(c.id);
                      
                      // 2. Mark as started locally
                      setStartedTasks(s => new Set(s).add(c.id));
                      
                      // 3. Navigate using Telegram Native API
                      const url = c.targetUrl;
                      if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
                        const tg = (window as any).Telegram.WebApp;
                        if (url.includes('t.me') || url.includes('tg://')) {
                          tg.openTelegramLink(url);
                        } else {
                          tg.openLink(url);
                        }
                      } else {
                        window.open(url, '_blank');
                      }
                    }}
                  >
                    {c.type === 'CHANNEL' || c.type === 'GROUP' ? '📢 Join' :
                     c.type === 'BOT' ? '🤖 Start Bot' : '🌐 Visit'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

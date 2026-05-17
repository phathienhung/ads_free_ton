'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAppStore } from '@/stores/useAppStore';

const typeIcons: Record<string, string> = {
  CHANNEL: '📢', GROUP: '👥', BOT: '🤖', WEBSITE: '🌐', MINI_APP: '🎮',
};

const typeFilters = ['ALL', 'CHANNEL', 'GROUP', 'BOT', 'WEBSITE'];

export default function TasksPage() {
  const { showReward, refreshUser } = useAppStore();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [startedTasks, setStartedTasks] = useState<Set<string>>(new Set());
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    try {
      setLoading(true);
      const data = await api.getCampaigns(1);
      setCampaigns(data.campaigns);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function handleStart(campaignId: string) {
    try {
      setActionLoading(campaignId);
      await api.startTask(campaignId);
      setStartedTasks((s) => new Set(s).add(campaignId));
    } catch (err: any) {
      alert(err.message);
    }
    setActionLoading(null);
  }

  async function handleComplete(campaignId: string) {
    try {
      setActionLoading(campaignId);
      const result = await api.completeTask(campaignId);
      setCompletedTasks((s) => new Set(s).add(campaignId));
      showReward(result.reward, `Task: ${result.campaignTitle}`);
      await refreshUser();
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
      <div className="tabs">
        {typeFilters.map((f) => (
          <button
            key={f}
            className={`tab ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'ALL' ? '🔥 All' : `${typeIcons[f]} ${f.charAt(0) + f.slice(1).toLowerCase()}`}
          </button>
        ))}
      </div>

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
            const isStarted = startedTasks.has(c.id);
            const isCompleted = completedTasks.has(c.id);
            const isProcessing = actionLoading === c.id;

            return (
              <div key={c.id} className="glass-card animate-fade-in" style={{ padding: 16, animationDelay: `${i * 0.05}s` }}>
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
                ) : isStarted ? (
                  <button
                    className="btn btn-success btn-full"
                    disabled={isProcessing}
                    onClick={() => handleComplete(c.id)}
                  >
                    {isProcessing ? '⏳ Verifying...' : '🎁 Claim Reward'}
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a
                      href={c.targetUrl}
                      target="_blank"
                      rel="noopener"
                      className="btn btn-ghost"
                      style={{ flex: 1, textDecoration: 'none' }}
                    >
                      {c.type === 'CHANNEL' || c.type === 'GROUP' ? '📢 Join' :
                       c.type === 'BOT' ? '🤖 Start Bot' : '🌐 Visit'}
                    </a>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      disabled={isProcessing}
                      onClick={() => handleStart(c.id)}
                    >
                      {isProcessing ? '⏳...' : '✅ I Did It'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

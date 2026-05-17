'use client';

import { useAppStore } from '@/stores/useAppStore';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const campaignIcons: Record<string, string> = {
  CHANNEL: '📢',
  GROUP: '👥',
  BOT: '🤖',
  WEBSITE: '🌐',
  MINI_APP: '🎮',
};

export default function HomePage() {
  const { user, setActiveTab } = useAppStore();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalTasks: 0, totalEarned: '0' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [campaignData, taskData] = await Promise.all([
          api.getCampaigns(1),
          api.getTaskHistory(1),
        ]);
        setCampaigns(campaignData.campaigns.slice(0, 5));
        setStats({
          totalTasks: taskData.total,
          totalEarned: user?.wallet?.totalEarned || '0',
        });
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
    load();
  }, [user]);

  const energyPercent = user ? (user.energy / user.maxEnergy) * 100 : 0;

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Welcome back</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{user?.firstName || user?.username || 'User'} 👋</div>
        </div>
        <div className="energy-bar">
          <span className="energy-icon">⚡</span>
          <span>{user?.energy || 0}/{user?.maxEnergy || 100}</span>
        </div>
      </div>

      {/* Balance Card */}
      <div className="glass-card animate-fade-in" style={{
        padding: 24, marginBottom: 20, textAlign: 'center',
        background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -30, right: -30, fontSize: 100, opacity: 0.05 }}>💎</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
          Your Balance
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 900, marginTop: 8,
          background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          {parseFloat(user?.wallet?.balance || '0').toFixed(4)}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>TON</div>
        
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setActiveTab('wallet')}>
            💳 Deposit
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setActiveTab('wallet')}>
            📤 Withdraw
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div className="glass-card stat-card animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="stat-value">{user?.level || 1}</div>
          <div className="stat-label">Level</div>
        </div>
        <div className="glass-card stat-card animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="stat-value">{stats.totalTasks}</div>
          <div className="stat-label">Tasks Done</div>
        </div>
        <div className="glass-card stat-card animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <div className="stat-value" style={{ fontSize: 18 }}>{parseFloat(stats.totalEarned).toFixed(2)}</div>
          <div className="stat-label">Earned</div>
        </div>
      </div>

      {/* Energy & Level Progress */}
      <div className="glass-card animate-fade-in" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>⚡ Energy</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{user?.energy}/{user?.maxEnergy}</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{
            width: `${energyPercent}%`,
            background: energyPercent < 30 ? 'var(--accent-red)' : 'var(--gradient-success)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>🏆 Level {user?.level}</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>XP: {user?.xp}/{(user?.level || 1) * 100}</span>
        </div>
        <div className="progress-bar" style={{ marginTop: 6 }}>
          <div className="progress-fill" style={{
            width: `${((user?.xp || 0) / ((user?.level || 1) * 100)) * 100}%`,
          }} />
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <button className="glass-card animate-fade-in" onClick={() => setActiveTab('spin')} style={{
          padding: 20, textAlign: 'center', cursor: 'pointer', border: 'none', background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)', animationDelay: '0.4s', transition: 'all 0.3s',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎰</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Lucky Spin</div>
          <div style={{ fontSize: 11, color: 'var(--accent-green)' }}>Free daily spin!</div>
        </button>
        <button className="glass-card animate-fade-in" onClick={() => setActiveTab('referral')} style={{
          padding: 20, textAlign: 'center', cursor: 'pointer', border: 'none', background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)', animationDelay: '0.5s', transition: 'all 0.3s',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Referrals</div>
          <div style={{ fontSize: 11, color: 'var(--accent-orange)' }}>Earn 10% bonus</div>
        </button>
      </div>

      {/* Available Tasks */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 className="section-title" style={{ marginBottom: 0 }}>🔥 Hot Tasks</h2>
          <button onClick={() => setActiveTab('tasks')} style={{
            background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            See all →
          </button>
        </div>
        
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1,2,3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="glass-card empty-state">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-text">No tasks available right now</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {campaigns.map((c, i) => (
              <div key={c.id} className="glass-card campaign-card animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }}
                onClick={() => setActiveTab('tasks')}>
                <div className="campaign-icon">
                  {campaignIcons[c.type] || '📢'}
                </div>
                <div className="campaign-info">
                  <div className="campaign-title">{c.title}</div>
                  <div className="campaign-desc">{c.description}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <span className={`badge badge-${c.type === 'CHANNEL' ? 'blue' : c.type === 'BOT' ? 'purple' : 'green'}`}>
                      {c.type}
                    </span>
                  </div>
                </div>
                <div className="campaign-reward">
                  +{parseFloat(c.pricePerAction).toFixed(4)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Advertiser CTA */}
      <div className="glass-card animate-fade-in" style={{
        padding: 20, textAlign: 'center', marginBottom: 20,
        background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(239,68,68,0.1))',
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📢</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Promote Your Channel</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Get real Telegram members with targeted campaigns
        </div>
        <button className="btn btn-primary" onClick={() => setActiveTab('advertiser')}>
          🚀 Create Campaign
        </button>
      </div>
    </div>
  );
}

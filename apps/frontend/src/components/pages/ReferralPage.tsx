'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAppStore } from '@/stores/useAppStore';

export default function ReferralPage() {
  const { user } = useAppStore();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const data = await api.getReferralStats();
      setStats(data);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const referralLink = stats?.referralLink || `https://t.me/ads_free_ton_bot/app?startapp=${user?.telegramId || ''}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = referralLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="page">
      <h1 className="page-title" style={{ marginBottom: 8 }}>👥 Referral Program</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
        Invite friends and earn passive income on 3 levels!
      </p>

      {/* Referral Link */}
      <div className="glass-card animate-fade-in" style={{
        padding: 20, marginBottom: 20, textAlign: 'center',
        background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
      }}>
        <div style={{ fontSize: 42, marginBottom: 12 }}>🔗</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Your Referral Link</div>
        <div style={{
          background: 'var(--bg-glass)', borderRadius: 'var(--radius-md)', padding: '10px 14px',
          fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
          wordBreak: 'break-all', marginBottom: 12,
        }}>
          {referralLink}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={copyLink}>
            {copied ? '✅ Copied!' : '📋 Copy Link'}
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => {
            window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Join AdsFree and start earning! 🚀')}`, '_blank');
          }}>
            📤 Share
          </button>
        </div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--accent-orange)', textAlign: 'center', marginBottom: 20, fontWeight: 600 }}>
        🎁 Rewards +1 spin and +1 energy for each friend invited!
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div className="glass-card stat-card animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="stat-value">{stats?.totalReferrals || 0}</div>
          <div className="stat-label">Total Referrals</div>
        </div>
        <div className="glass-card stat-card animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="stat-value" style={{ fontSize: 18, background: 'var(--gradient-success)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {parseFloat(stats?.totalEarnings || '0').toFixed(4)}
          </div>
          <div className="stat-label">Total Earned</div>
        </div>
      </div>

      <div className="glass-card animate-fade-in" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Daily Withdrawal Limit</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-orange)' }}>
          {stats?.withdrawalLimit || '0'} TON
        </div>
      </div>

      {/* Withdrawal Milestones */}
      <div className="glass-card animate-fade-in" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📊 Withdrawal Milestones</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Invite friends to increase your daily withdrawal capacity!
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {stats?.milestones?.map((m: any, i: number) => {
            const achievedArr: number[] = Array.isArray(stats?.milestonesAchieved) ? stats.milestonesAchieved : [];
            const isReached = achievedArr.includes(m.target);
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 'var(--radius-md)',
                background: isReached ? 'rgba(34,197,94,0.1)' : 'var(--bg-glass)',
                border: isReached ? '1px solid var(--accent-green)' : '1px solid var(--border-color)',
                opacity: isReached ? 1 : 0.7
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{isReached ? '✅' : '🔒'}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Invite {m.target} Friends</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Limit: {m.withdrawalLimit} TON / day</div>
                  </div>
                </div>
                {isReached && <span className="badge badge-green">UNLOCKED</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Commission Tiers */}

      {/* Recent Referrals */}
      <h3 className="section-title">🕐 Recent Referrals</h3>
      {loading ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : !stats?.recentReferrals?.length ? (
        <div className="glass-card empty-state">
          <div className="empty-state-icon">👥</div>
          <div className="empty-state-text">No referrals yet. Share your link!</div>
        </div>
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          {stats.recentReferrals.map((ref: any, i: number) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderBottom: i < stats.recentReferrals.length - 1 ? '1px solid var(--border-color)' : 'none',
            }}>
              <div className="rank-avatar" style={{ width: 36, height: 36, fontSize: 14 }}>
                {(ref.firstName || ref.username || '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{ref.firstName || ref.username || 'Anonymous'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Joined {new Date(ref.createdAt).toLocaleDateString()}
                </div>
              </div>
              <span className="badge badge-green">Active</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

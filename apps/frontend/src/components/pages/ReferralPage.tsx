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

  const referralLink = `https://t.me/AdsFreeBot?start=${stats?.referralCode || user?.referralCode || ''}`;

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

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
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

      {/* Commission Tiers */}
      <div className="glass-card animate-fade-in" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>💰 Commission Tiers</h3>
        {[
          { level: 1, rate: '10%', color: 'var(--accent-green)', icon: '🟢' },
          { level: 2, rate: '5%', color: 'var(--accent-blue)', icon: '🔵' },
          { level: 3, rate: '2%', color: 'var(--accent-purple)', icon: '🟣' },
        ].map((tier) => (
          <div key={tier.level} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
            borderBottom: tier.level < 3 ? '1px solid var(--border-color)' : 'none',
          }}>
            <span style={{ fontSize: 20 }}>{tier.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Level {tier.level}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {tier.level === 1 ? 'Direct referrals' : tier.level === 2 ? 'Referrals of referrals' : '3rd generation'}
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, color: tier.color }}>
              {tier.rate}
            </div>
          </div>
        ))}
      </div>

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

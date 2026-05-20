'use client';

import { useAppStore } from '@/stores/useAppStore';
import { useState, useEffect } from 'react';

export default function ProfilePage() {
  const { user, gameConfig, setActiveTab, logout } = useAppStore();

  // Energy countdown timer
  const recoverSeconds = gameConfig?.energy?.recoverSeconds || 300;
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (!user || user.energy >= user.maxEnergy) {
      setCountdown('');
      return;
    }
    const tick = () => {
      const elapsed = (Date.now() - new Date(user.energyUpdatedAt || Date.now()).getTime()) / 1000;
      const sinceLastRegen = elapsed % recoverSeconds;
      const remaining = Math.max(0, recoverSeconds - sinceLastRegen);
      const mins = Math.floor(remaining / 60);
      const secs = Math.floor(remaining % 60);
      setCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [user, recoverSeconds]);

  const menuItems = [
    { icon: '📢', label: 'My Campaigns', desc: 'Manage your ad campaigns', tab: 'advertiser' },
    { icon: '👥', label: 'Referrals', desc: 'Invite friends & earn', tab: 'referral' },
    { icon: '🎰', label: 'Lucky Spin', desc: 'Daily free spin', tab: 'spin' },
    { icon: '🏆', label: 'Leaderboard', desc: 'See top earners', tab: 'leaderboard' },
  ];

  const energyPercent = user ? (user.energy / user.maxEnergy) * 100 : 0;
  const xpPercent = user && user.xpForNextLevel ? (user.xp / user.xpForNextLevel) * 100 : 0;

  return (
    <div className="page">
      {/* Profile Header */}
      <div className="glass-card animate-fade-in" style={{
        padding: 28, textAlign: 'center', marginBottom: 20,
        background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15))',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -40, right: -40, fontSize: 120, opacity: 0.04 }}>👤</div>
        
        <div className="rank-avatar animate-pulse-glow" style={{
          width: 80, height: 80, fontSize: 32, margin: '0 auto 12px',
          background: 'var(--gradient-primary)',
        }}>
          {(user?.firstName || user?.username || '?').charAt(0).toUpperCase()}
        </div>
        
        <div style={{ fontSize: 20, fontWeight: 800 }}>
          {user?.firstName} {user?.lastName || ''}
        </div>
        {user?.username && (
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>@{user.username}</div>
        )}
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <span className="badge badge-blue">Level {user?.level}</span>
          <span className="badge badge-purple">{user?.role}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        <div className="glass-card stat-card">
          <div className="stat-value" style={{ fontSize: 18 }}>
            {parseFloat(user?.wallet?.balance || '0').toFixed(2)}
          </div>
          <div className="stat-label">Balance</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-value" style={{ fontSize: 18 }}>
            {parseFloat(user?.wallet?.totalEarned || '0').toFixed(2)}
          </div>
          <div className="stat-label">Earned</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-value" style={{ fontSize: 18 }}>{user?.level}</div>
          <div className="stat-label">Level</div>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="glass-card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ marginBottom: 16 }}>
          {countdown && (
            <div style={{
              textAlign: 'center', marginBottom: 10, padding: '6px 0',
              background: 'rgba(59,130,246,0.08)', borderRadius: 'var(--radius-md)',
            }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 6 }}>⏱ Next energy in</span>
              <span style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--accent-blue)' }}>
                {countdown}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>⚡ Energy</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {user?.energy}/{user?.maxEnergy}
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{
              width: `${energyPercent}%`,
              background: energyPercent < 30 ? 'var(--accent-red)' : 'var(--gradient-success)',
            }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Regenerates 1 per {Math.round(recoverSeconds / 60)} minutes
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>🏆 XP Progress</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {user?.xp}/{user?.xpForNextLevel || (user?.level || 1) * 100}
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${xpPercent}%` }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Level up for +{gameConfig?.leveling?.energyBonusPerLevel || 5} max energy
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="glass-card" style={{ overflow: 'hidden', marginBottom: 20 }}>
        {menuItems.map((item, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(item.tab)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
              width: '100%', background: 'none', border: 'none', color: 'var(--text-primary)',
              cursor: 'pointer', textAlign: 'left',
              borderBottom: i < menuItems.length - 1 ? '1px solid var(--border-color)' : 'none',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-glass-hover)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
          >
            <span style={{ fontSize: 24 }}>{item.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.desc}</div>
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>›</span>
          </button>
        ))}
      </div>

      {/* Logout */}
      <button className="btn btn-ghost btn-full" onClick={logout} style={{ marginBottom: 20 }}>
        🚪 Logout
      </button>

      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
        AdsFree v1.0.0 • Telegram ID: {user?.telegramId}
      </div>
    </div>
  );
}

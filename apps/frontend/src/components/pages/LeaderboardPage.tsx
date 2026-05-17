'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function LeaderboardPage() {
  const [type, setType] = useState<'earner' | 'advertiser' | 'referral'>('earner');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, [type]);

  async function loadLeaderboard() {
    try {
      setLoading(true);
      const result = await api.getLeaderboard(type);
      setData(result);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const rankColors = ['', 'gold', 'silver', 'bronze'];
  const rankEmojis = ['', '🥇', '🥈', '🥉'];

  return (
    <div className="page">
      <h1 className="page-title" style={{ marginBottom: 20 }}>🏆 Leaderboard</h1>

      {/* Tabs */}
      <div className="tabs">
        {[
          { id: 'earner', label: '💰 Earners' },
          { id: 'advertiser', label: '📢 Advertisers' },
          { id: 'referral', label: '👥 Referrals' },
        ].map((tab) => (
          <button
            key={tab.id}
            className={`tab ${type === tab.id ? 'active' : ''}`}
            onClick={() => setType(tab.id as any)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Top 3 Podium */}
      {!loading && data.length >= 3 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 12, marginBottom: 24, paddingTop: 20 }}>
          {/* 2nd place */}
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div className="rank-avatar" style={{ width: 50, height: 50, margin: '0 auto 8px', background: 'linear-gradient(135deg, #c0c0c0, #808080)' }}>
              {data[1].username?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{data[1].username}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-green)' }}>
              {parseFloat(data[1].score).toFixed(2)}
            </div>
            <div style={{ background: 'linear-gradient(135deg, #c0c0c0, #808080)', height: 60, borderRadius: '8px 8px 0 0', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
              🥈
            </div>
          </div>

          {/* 1st place */}
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 32, marginBottom: 4 }}>👑</div>
            <div className="rank-avatar animate-pulse-glow" style={{ width: 60, height: 60, margin: '0 auto 8px', background: 'linear-gradient(135deg, #ffd700, #ff8c00)' }}>
              {data[0].username?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{data[0].username}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--accent-green)', fontWeight: 700 }}>
              {parseFloat(data[0].score).toFixed(2)}
            </div>
            <div style={{ background: 'linear-gradient(135deg, #ffd700, #ff8c00)', height: 80, borderRadius: '8px 8px 0 0', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
              🥇
            </div>
          </div>

          {/* 3rd place */}
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div className="rank-avatar" style={{ width: 50, height: 50, margin: '0 auto 8px', background: 'linear-gradient(135deg, #cd7f32, #8b4513)' }}>
              {data[2].username?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{data[2].username}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-green)' }}>
              {parseFloat(data[2].score).toFixed(2)}
            </div>
            <div style={{ background: 'linear-gradient(135deg, #cd7f32, #8b4513)', height: 40, borderRadius: '8px 8px 0 0', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
              🥉
            </div>
          </div>
        </div>
      )}

      {/* Rest of list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3,4,5].map((i) => <div key={i} className="skeleton" style={{ height: 56 }} />)}
        </div>
      ) : data.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-state-icon">🏆</div>
          <div className="empty-state-text">No participants yet</div>
        </div>
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          {data.slice(3).map((item, i) => (
            <div key={i} className="rank-item">
              <div className="rank-number">{item.rank}</div>
              <div className="rank-avatar" style={{ fontSize: 14 }}>
                {item.username?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="rank-info">
                <div className="rank-name">{item.username}</div>
                <div className="rank-level">Level {item.level}</div>
              </div>
              <div className="rank-score">{parseFloat(item.score).toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

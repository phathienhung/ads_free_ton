'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function LeaderboardPage() {
  const [type, setType] = useState<'earner' | 'advertiser' | 'spin'>('earner');
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

  const formatScore = (score: string) => {
    const num = parseFloat(score);
    return type === 'spin' ? num.toString() : num.toFixed(2);
  };

  return (
    <div className="page pb-24">
      <h1 className="page-title text-center mb-6" style={{ marginBottom: 20 }}>🏆 Leaderboard</h1>

      {/* Tabs */}
      <div className="tabs mb-8">
        {[
          { id: 'earner', label: '💰 Earners' },
          { id: 'advertiser', label: '📢 Advertisers' },
          { id: 'spin', label: '🎡 Spins' },
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
      {!loading && data.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 12, marginBottom: 24, paddingTop: 20 }}>
          {/* 2nd place */}
          <div style={{ textAlign: 'center', flex: 1, opacity: data[1] ? 1 : 0.5 }}>
            <div className="rank-avatar" style={{ width: 50, height: 50, margin: '0 auto 8px', background: 'linear-gradient(135deg, #c0c0c0, #808080)' }}>
              {data[1] ? (data[1].username?.charAt(0)?.toUpperCase() || '?') : '-'}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{data[1]?.username || '---'}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-green)' }}>
              {data[1] ? formatScore(data[1].score) : '-'}
            </div>
            <div style={{ background: 'linear-gradient(135deg, #c0c0c0, #808080)', height: 60, borderRadius: '8px 8px 0 0', marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 28, fontWeight: 'bold', color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>2</span>
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
              {formatScore(data[0].score)}
            </div>
            <div style={{ background: 'linear-gradient(135deg, #ffd700, #ff8c00)', height: 80, borderRadius: '8px 8px 0 0', marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 36, fontWeight: 'bold', color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>1</span>
            </div>
          </div>

          {/* 3rd place */}
          <div style={{ textAlign: 'center', flex: 1, opacity: data[2] ? 1 : 0.5 }}>
            <div className="rank-avatar" style={{ width: 50, height: 50, margin: '0 auto 8px', background: 'linear-gradient(135deg, #cd7f32, #8b4513)' }}>
              {data[2] ? (data[2].username?.charAt(0)?.toUpperCase() || '?') : '-'}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{data[2]?.username || '---'}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-green)' }}>
              {data[2] ? formatScore(data[2].score) : '-'}
            </div>
            <div style={{ background: 'linear-gradient(135deg, #cd7f32, #8b4513)', height: 40, borderRadius: '8px 8px 0 0', marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 24, fontWeight: 'bold', color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>3</span>
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
        <div className="glass-card empty-state text-center p-8">
          <div className="empty-state-icon text-4xl mb-4">🏆</div>
          <div className="empty-state-text text-gray-400">No participants yet</div>
        </div>
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          {data.length < 3 ? data.map((item, i) => (
             <div key={i} className="rank-item p-3 border-b border-white/5 flex items-center gap-3">
               <div className="rank-number font-bold w-6 text-center">{item.rank}</div>
               <div className="rank-avatar w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold">
                 {item.username?.charAt(0)?.toUpperCase() || '?'}
               </div>
               <div className="rank-info flex-1">
                 <div className="rank-name font-semibold">{item.username}</div>
                 <div className="rank-level text-xs text-gray-400">Level {item.level}</div>
               </div>
               <div className="rank-score text-green-400 font-mono">{formatScore(item.score)}</div>
             </div>
          )) : data.slice(3).map((item, i) => (
            <div key={i} className="rank-item p-3 border-b border-white/5 flex items-center gap-3">
              <div className="rank-number font-bold w-6 text-center text-gray-400">{item.rank}</div>
              <div className="rank-avatar w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold">
                {item.username?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="rank-info flex-1">
                <div className="rank-name font-semibold">{item.username}</div>
                <div className="rank-level text-xs text-gray-400">Level {item.level}</div>
              </div>
              <div className="rank-score text-green-400 font-mono">{formatScore(item.score)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

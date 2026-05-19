'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAppStore } from '@/stores/useAppStore';

export default function SpinPage() {
  const { showReward, refreshUser, user } = useAppStore();
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [segments, setSegments] = useState<any[]>([]);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const res = await api.get<any>('/api/spin/status');
      setStatus(res);
      setSegments(res.segments || []);
    } catch (err) { console.error(err); }
  }

  async function handleSpin() {
    if (spinning || !status) return;
    if (!status.canFreeSpin && status.extraSpins <= 0) {
      alert('No spins left! Earn more spins by completing tasks.');
      return;
    }

    try {
      setSpinning(true);
      setResult(null);
      const res = await api.spin();
      
      // Find segment index for animation
      const segmentIndex = segments.findIndex(s => s.label === res.label);
      const safeIndex = segmentIndex >= 0 ? segmentIndex : 0;
      
      // Spin animation logic
      const segmentAngle = 360 / segments.length;
      // Target angle: (segments.length - 1 - index) * segmentAngle + gap
      // Because wheel rotates clockwise, target index is in reverse relative to start positions
      const targetRotation = (segments.length - safeIndex) * segmentAngle - (segmentAngle / 2);
      const newRotation = rotation + (360 * 8) + targetRotation - (rotation % 360);
      
      setRotation(newRotation);
      
      setTimeout(async () => {
        setResult(res);
        setSpinning(false);
        showReward(res.reward, `🎰 ${res.label}`);
        await refreshUser();
        // Update status locally to avoid fetch lag
        setStatus({
          canFreeSpin: res.canFreeSpin,
          extraSpins: res.extraSpins,
          segments: segments
        });
      }, 4000);
    } catch (err: any) {
      alert(err.message);
      setSpinning(false);
    }
  }

  if (segments.length === 0) {
    return <div className="page"><div className="skeleton" style={{ height: 300 }} /></div>;
  }

  const segmentAngle = 360 / segments.length;

  return (
    <div className="page" style={{ textAlign: 'center' }}>
      <h1 className="page-title" style={{ marginBottom: 8 }}>🎰 Lucky Spin</h1>
      
      <div className="glass-card" style={{ display: 'inline-flex', padding: '8px 16px', gap: 12, marginBottom: 24, borderRadius: 20 }}>
        <div style={{ fontSize: 13 }}>
          Free Spin: <span style={{ fontWeight: 800, color: status?.canFreeSpin ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {status?.canFreeSpin ? 'Available' : 'Used'}
          </span>
        </div>
        <div style={{ height: 16, width: 1, background: 'var(--border-color)' }} />
        <div style={{ fontSize: 13 }}>
          Extra Spins: <span style={{ fontWeight: 800, color: 'var(--accent-cyan)' }}>{status?.extraSpins || 0}</span>
        </div>
      </div>

      {/* Wheel */}
      <div className="spin-container" style={{ marginBottom: 32 }}>
        <div className="spin-pointer" />
        
        <svg
          viewBox="0 0 300 300"
          className="spin-wheel"
          style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)' }}
        >
          {segments.map((seg, i) => {
            const startAngle = i * segmentAngle;
            const endAngle = startAngle + segmentAngle;
            const startRad = (startAngle - 90) * (Math.PI / 180);
            const endRad = (endAngle - 90) * (Math.PI / 180);
            const x1 = 150 + 140 * Math.cos(startRad);
            const y1 = 150 + 140 * Math.sin(startRad);
            const x2 = 150 + 140 * Math.cos(endRad);
            const y2 = 150 + 140 * Math.sin(endRad);
            const largeArc = segmentAngle > 180 ? 1 : 0;
            
            const midAngle = ((startAngle + endAngle) / 2 - 90) * (Math.PI / 180);
            const textX = 150 + 90 * Math.cos(midAngle);
            const textY = 150 + 90 * Math.sin(midAngle);
            const textRotate = (startAngle + endAngle) / 2;

            return (
              <g key={i}>
                <path
                  d={`M 150 150 L ${x1} ${y1} A 140 140 0 ${largeArc} 1 ${x2} ${y2} Z`}
                  fill={seg.color || '#333'}
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="1"
                />
                <text
                  x={textX}
                  y={textY}
                  fill="white"
                  fontSize="8"
                  fontWeight="900"
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`rotate(${textRotate}, ${textX}, ${textY})`}
                >
                  {seg.label}
                </text>
              </g>
            );
          })}
          <circle cx="150" cy="150" r="25" fill="var(--bg-secondary)" stroke="var(--border-color)" strokeWidth="2" />
          <circle cx="150" cy="150" r="15" fill="var(--bg-primary)" />
        </svg>

        <button
          className="spin-button"
          onClick={handleSpin}
          disabled={spinning || (!status?.canFreeSpin && (status?.extraSpins || 0) <= 0)}
          style={{ 
            opacity: (spinning || (!status?.canFreeSpin && (status?.extraSpins || 0) <= 0)) ? 0.6 : 1,
            transform: spinning ? 'translate(-50%, -50%) scale(0.95)' : 'translate(-50%, -50%) scale(1)'
           }}
        >
          {spinning ? '...' : (status?.canFreeSpin ? 'FREE SPIN' : 'USE EXTRA')}
        </button>
      </div>

      {/* Info */}
      <div className="glass-card" style={{ padding: 20, textAlign: 'left' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>ℹ️ Spin Rules</h3>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
            🎰 <span>1 free spin per day</span>
          </li>
          <li style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
            🎁 <span>Win extra spins (+Spin) as rewards</span>
          </li>
          <li style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
            💰 <span>Prizes: TON, Energy, XP, Bonus Spins</span>
          </li>
        </ul>
      </div>
    </div>
  );
}


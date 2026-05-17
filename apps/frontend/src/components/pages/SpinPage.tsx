'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAppStore } from '@/stores/useAppStore';

const WHEEL_SEGMENTS = [
  { label: '0.001 TON', color: '#3b82f6' },
  { label: '0.005 TON', color: '#8b5cf6' },
  { label: '0.002 TON', color: '#06b6d4' },
  { label: '0.01 TON', color: '#22c55e' },
  { label: '0.001 TON', color: '#f59e0b' },
  { label: '0.05 TON', color: '#ef4444' },
  { label: '0.002 TON', color: '#ec4899' },
  { label: '0.001 TON', color: '#14b8a6' },
];

export default function SpinPage() {
  const { showReward, refreshUser, user } = useAppStore();
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<any>(null);

  async function handleSpin() {
    if (spinning) return;
    try {
      setSpinning(true);
      setResult(null);
      const res = await api.spin();
      
      // Spin animation
      const segmentAngle = 360 / WHEEL_SEGMENTS.length;
      const randomSegment = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
      const newRotation = rotation + 360 * 5 + (randomSegment * segmentAngle) + Math.random() * segmentAngle;
      setRotation(newRotation);
      
      setTimeout(async () => {
        setResult(res);
        setSpinning(false);
        showReward(res.reward, `🎰 ${res.label}`);
        await refreshUser();
      }, 4000);
    } catch (err: any) {
      alert(err.message);
      setSpinning(false);
    }
  }

  const segmentAngle = 360 / WHEEL_SEGMENTS.length;

  return (
    <div className="page" style={{ textAlign: 'center' }}>
      <h1 className="page-title" style={{ marginBottom: 8 }}>🎰 Lucky Spin</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
        Spin the wheel daily for a chance to win TON!
      </p>

      {/* Wheel */}
      <div className="spin-container" style={{ marginBottom: 32 }}>
        <div className="spin-pointer" />
        
        <svg
          viewBox="0 0 300 300"
          className="spin-wheel"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          {WHEEL_SEGMENTS.map((seg, i) => {
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
                  fill={seg.color}
                  stroke="rgba(0,0,0,0.2)"
                  strokeWidth="1"
                />
                <text
                  x={textX}
                  y={textY}
                  fill="white"
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="'JetBrains Mono', monospace"
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`rotate(${textRotate}, ${textX}, ${textY})`}
                >
                  {seg.label}
                </text>
              </g>
            );
          })}
          {/* Center circle */}
          <circle cx="150" cy="150" r="30" fill="var(--bg-primary)" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
        </svg>

        <button
          className="spin-button"
          onClick={handleSpin}
          disabled={spinning}
          style={{ opacity: spinning ? 0.6 : 1 }}
        >
          {spinning ? '...' : 'SPIN'}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="glass-card animate-fade-in" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>You won</div>
          <div className="reward-amount">+{result.reward} TON</div>
        </div>
      )}

      {/* Info */}
      <div className="glass-card" style={{ padding: 20, textAlign: 'left' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>ℹ️ Spin Rules</h3>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
            🎰 <span>1 free spin per day</span>
          </li>
          <li style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
            ⏰ <span>Resets at UTC midnight</span>
          </li>
          <li style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
            💰 <span>Rewards credited instantly</span>
          </li>
          <li style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
            📈 <span>Higher levels = bigger prizes</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

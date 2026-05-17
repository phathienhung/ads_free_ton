'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/stores/useAppStore';

export default function RewardPopup({ amount, label }: { amount: string; label: string }) {
  const hideReward = useAppStore((s) => s.hideReward);

  useEffect(() => {
    const timer = setTimeout(hideReward, 3000);
    return () => clearTimeout(timer);
  }, [hideReward]);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={hideReward}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          zIndex: 999, backdropFilter: 'blur(4px)',
        }}
      />
      {/* Popup */}
      <div className="reward-toast show">
        <div className="animate-coin-bounce" style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>{label}</div>
        <div className="reward-amount">+{amount}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Added to your balance</div>
      </div>
    </>
  );
}

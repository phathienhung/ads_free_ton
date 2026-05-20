'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { api } from '@/lib/api';
import BottomNav from '@/components/BottomNav';
import HomePage from '@/components/pages/HomePage';
import TasksPage from '@/components/pages/TasksPage';
import WalletPage from '@/components/pages/WalletPage';
import LeaderboardPage from '@/components/pages/LeaderboardPage';
import ProfilePage from '@/components/pages/ProfilePage';
import SpinPage from '@/components/pages/SpinPage';
import ReferralPage from '@/components/pages/ReferralPage';
import AdvertiserPage from '@/components/pages/AdvertiserPage';
import RewardPopup from '@/components/RewardPopup';

export default function App() {
  const { user, isLoading, isAuthenticated, activeTab, login, fetchConfig, rewardPopup } = useAppStore();
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const init = async () => {
      // Check for existing token
      const token = api.getToken();
      if (token) {
        try {
          const [user] = await Promise.all([
            api.getMe(),
            fetchConfig()
          ]);
          useAppStore.getState().setUser(user);
          setInitializing(false);
          return;
        } catch {
          api.clearToken();
        }
      }

      // Auto-login if inside Telegram
      if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
        const tg = (window as any).Telegram.WebApp;
        const initData = tg.initData;
        
        if (initData) {
          try {
            await login(initData);
            // fetchConfig is already called inside login() in useAppStore
            setInitializing(false);
            return;
          } catch (err: any) {
            console.error('Auto-login failed:', err);
          }
        }
      }
      
      setInitializing(false);
    };
    init();
  }, [login]);

  // Loading screen
  if (initializing) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', gap: '20px',
      }}>
        <div className="animate-pulse-glow" style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'var(--gradient-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36,
        }}>
          🚀
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          AdsFree
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  // Login screen
  if (!isAuthenticated) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', gap: '24px', padding: '24px',
      }}>
        <div className="animate-pulse-glow" style={{
          width: 100, height: 100, borderRadius: '50%',
          background: 'var(--gradient-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 48,
        }}>
          🚀
        </div>
        <h1 style={{
          fontSize: 32, fontWeight: 900,
          background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          AdsFree
        </h1>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
          color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 300
        }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Connecting to account...</div>
          <button className="btn btn-primary btn-lg" onClick={() => window.location.reload()}>
            🔄 Retry Connection
          </button>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: '12px' }}>
            Please ensure you are opening this via the official Telegram Bot
          </p>
        </div>
      </div>
    );
  }

  const renderPage = () => {
    switch (activeTab) {
      case 'home': return <HomePage />;
      case 'tasks': return <TasksPage />;
      case 'wallet': return <WalletPage />;
      case 'leaderboard': return <LeaderboardPage />;
      case 'profile': return <ProfilePage />;
      case 'spin': return <SpinPage />;
      case 'referral': return <ReferralPage />;
      case 'advertiser': return <AdvertiserPage />;
      default: return <HomePage />;
    }
  };

  return (
    <main>
      {renderPage()}
      <BottomNav />
      {rewardPopup && <RewardPopup amount={rewardPopup.amount} label={rewardPopup.label} />}
    </main>
  );
}

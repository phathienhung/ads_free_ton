'use client';

import { useAppStore } from '@/stores/useAppStore';

const tabs = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'tasks', label: 'Tasks', icon: '📋' },
  { id: 'spin', label: 'Spin', icon: '🎰' },
  { id: 'shop', label: 'Shop', icon: '🛒' },
  { id: 'wallet', label: 'Wallet', icon: '💰' },
  { id: 'profile', label: 'Profile', icon: '👤' },
];

export default function BottomNav() {
  const { activeTab, setActiveTab } = useAppStore();

  return (
    <nav className="tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          <span style={{ fontSize: 20 }}>{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

import { create } from 'zustand';
import { api } from '@/lib/api';

interface User {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  level: number;
  xp: number;
  xpForNextLevel: number;
  energy: number;
  maxEnergy: number;
  referralCode: string;
  role: string;
  wallet: {
    balance: string;
    frozenBalance: string;
    totalEarned: string;
    totalSpent: string;
  } | null;
}

interface AppState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  activeTab: string;
  rewardPopup: { show: boolean; amount: string; label: string } | null;

  setUser: (user: User) => void;
  setActiveTab: (tab: string) => void;
  showReward: (amount: string, label: string) => void;
  hideReward: () => void;
  
  login: (initData?: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  activeTab: 'home',
  rewardPopup: null,

  setUser: (user) => set({ user, isAuthenticated: true, isLoading: false }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  showReward: (amount, label) => {
    set({ rewardPopup: { show: true, amount, label } });
    setTimeout(() => set({ rewardPopup: null }), 3000);
  },

  hideReward: () => set({ rewardPopup: null }),

  login: async (initData) => {
    try {
      set({ isLoading: true });
      if (initData) {
        const result = await api.login(initData);
        api.setToken(result.accessToken);
        set({ user: result.user, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (err: any) {
      console.error('Login error:', err);
      alert(`Login failed: ${err.message || 'Network error (check API_URL)'}`);
      set({ isLoading: false });
    }
  },

  refreshUser: async () => {
    try {
      const user = await api.getMe();
      set({ user });
    } catch (err) {
      console.error('Refresh error:', err);
    }
  },

  logout: () => {
    api.clearToken();
    set({ user: null, isAuthenticated: false });
  },
}));

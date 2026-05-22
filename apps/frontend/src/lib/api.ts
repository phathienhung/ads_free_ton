const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ads-free-ton-backend.vercel.app';

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('adsfree_token', token);
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('adsfree_token');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('adsfree_token');
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  get<T>(endpoint: string) {
    return this.request<T>(endpoint);
  }

  // Auth
  login(initData: string) {
    return this.request<{ user: any; accessToken: string; refreshToken: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ initData }),
    });
  }

  devLogin(telegramId?: number, username?: string) {
    return this.request<{ user: any; accessToken: string }>('/api/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ telegramId, username }),
    });
  }

  // Config
  getConfig() {
    return this.request<{ energy: any; leveling: any }>('/api/config');
  }

  // User
  getMe() {
    return this.request<any>('/api/user/me', { cache: 'no-store' });
  }

  // Campaigns
  getCampaigns(page = 1) {
    return this.request<{ campaigns: any[]; total: number; page: number; totalPages: number }>(`/api/campaigns?page=${page}`);
  }

  getCampaign(id: string) {
    return this.request<any>(`/api/campaigns/${id}`);
  }

  createCampaign(data: any) {
    return this.request<any>('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  getAdvertiserCampaigns() {
    return this.request<any[]>('/api/advertiser/campaigns');
  }

  // Tasks
  startTask(campaignId: string) {
    return this.request<any>(`/api/tasks/${campaignId}/start`, { method: 'POST' });
  }

  /**
   * Fire-and-forget startTask that survives page navigation/unload.
   * Uses fetch with keepalive:true (survives page close) with sendBeacon fallback.
   */
  startTaskBeacon(campaignId: string): void {
    const token = this.getToken();
    // Pass token in URL query because sendBeacon cannot set custom headers
    const url = `${API_URL}/api/tasks/${campaignId}/start${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Try fetch with keepalive first (modern browsers, survives navigation)
    try {
      fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Fallback: sendBeacon (very reliable for fire-and-forget but limited)
      try {
        const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
        navigator.sendBeacon(url, blob);
      } catch {
        // Last resort - just ignore, the user can retry
      }
    }
  }

  verifyTask(campaignId: string) {
    return this.request<any>(`/api/tasks/${campaignId}/verify`, { method: 'POST' });
  }

  completeTask(campaignId: string) {
    return this.request<any>(`/api/tasks/${campaignId}/complete`, { method: 'POST' });
  }

  getTaskHistory(page = 1) {
    return this.request<any>(`/api/tasks/history?page=${page}`);
  }

  // Wallet
  getWallet() {
    return this.request<any>('/api/wallet');
  }

  deposit(amount: number, boc?: string) {
    return this.request<any>('/api/wallet/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount, boc }),
    });
  }

  withdraw(amount: number, tonAddress: string) {
    return this.request<any>('/api/wallet/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount, tonAddress }),
    });
  }

  getTransactions(page = 1) {
    return this.request<any>(`/api/wallet/transactions?page=${page}`);
  }

  // Gamification
  getLeaderboard(type: string, period = 'all') {
    return this.request<any[]>(`/api/leaderboard/${type}?period=${period}`);
  }

  getDailyTasks() {
    return this.request<any[]>('/api/daily-tasks');
  }

  claimDailyTask(id: string) {
    return this.request<any>(`/api/daily-tasks/${id}/claim`, { method: 'POST' });
  }

  spin() {
    return this.request<any>('/api/spin', { method: 'POST' });
  }

  getReferralStats() {
    return this.request<any>('/api/referral');
  }

  applyReferral(referralCode: string) {
    return this.request<any>('/api/referral/apply', {
      method: 'POST',
      body: JSON.stringify({ referralCode }),
    });
  }

  // Shop
  getShopPackages() {
    return this.request<any[]>('/api/shop/packages');
  }

  purchasePackage(packageId: string, boc?: string) {
    return this.request<any>('/api/shop/purchase', {
      method: 'POST',
      body: JSON.stringify({ packageId, boc }),
    });
  }

  // Admin
  getAdminStats() {
    return this.request<any>('/api/admin/stats');
  }

  getAdminUsers(page = 1, search?: string) {
    return this.request<any>(`/api/admin/users?page=${page}${search ? `&search=${search}` : ''}`);
  }

  banUser(userId: string, ban: boolean, reason?: string) {
    return this.request<any>(`/api/admin/users/${userId}/ban`, {
      method: 'POST',
      body: JSON.stringify({ ban, reason }),
    });
  }

  getAdminCampaigns(status?: string, page = 1) {
    return this.request<any>(`/api/admin/campaigns?page=${page}${status ? `&status=${status}` : ''}`);
  }

  reviewCampaign(id: string, status: string) {
    return this.request<any>(`/api/admin/campaigns/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  }

  getPendingWithdrawals(page = 1) {
    return this.request<any>(`/api/admin/withdrawals?page=${page}`);
  }

  processWithdrawal(id: string, status: string, tonTxHash?: string) {
    return this.request<any>(`/api/admin/withdrawals/${id}/process`, {
      method: 'POST',
      body: JSON.stringify({ status, tonTxHash }),
    });
  }
}

export const api = new ApiClient();

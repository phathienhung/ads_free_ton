'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAppStore } from '@/stores/useAppStore';

const campaignTypes = [
  { value: 'CHANNEL', label: '📢 Channel', desc: 'Telegram Channel' },
  { value: 'GROUP', label: '👥 Group', desc: 'Telegram Group' },
  { value: 'BOT', label: '🤖 Bot', desc: 'Telegram Bot' },
  { value: 'WEBSITE', label: '🌐 Website', desc: 'External Website' },
  { value: 'MINI_APP', label: '🎮 Mini App', desc: 'Telegram Mini App' },
];

export default function AdvertiserPage() {
  const { user, refreshUser } = useAppStore();
  const [tab, setTab] = useState<'campaigns' | 'create'>('campaigns');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [form, setForm] = useState({
    title: '', description: '', type: 'CHANNEL', targetUrl: '',
    pricePerAction: '0.001', totalBudget: '0.1', pricingModel: 'CPE',
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    try {
      const data = await api.getAdvertiserCampaigns();
      setCampaigns(data);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  async function handleCreate() {
    try {
      setCreating(true);
      await api.createCampaign({
        ...form,
        pricePerAction: parseFloat(form.pricePerAction),
        totalBudget: parseFloat(form.totalBudget),
      });
      await refreshUser();
      await loadCampaigns();
      setTab('campaigns');
      setForm({ title: '', description: '', type: 'CHANNEL', targetUrl: '', pricePerAction: '0.001', totalBudget: '0.1', pricingModel: 'CPE' });
    } catch (err: any) {
      alert(err.message);
    }
    setCreating(false);
  }

  const statusColors: Record<string, string> = {
    PENDING_REVIEW: 'orange', ACTIVE: 'green', PAUSED: 'blue', COMPLETED: 'purple', REJECTED: 'red',
  };

  return (
    <div className="page">
      <h1 className="page-title" style={{ marginBottom: 8 }}>📢 Advertiser</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
        Promote your channel, bot, or website to real users
      </p>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'campaigns' ? 'active' : ''}`} onClick={() => setTab('campaigns')}>
          📊 My Campaigns
        </button>
        <button className={`tab ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>
          ➕ Create New
        </button>
      </div>

      {tab === 'campaigns' ? (
        <>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1,2,3].map((i) => <div key={i} className="skeleton" style={{ height: 140 }} />)}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="glass-card empty-state">
              <div className="empty-state-icon">📢</div>
              <div className="empty-state-text">No campaigns yet</div>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setTab('create')}>
                🚀 Create First Campaign
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {campaigns.map((c) => (
                <div key={c.id} className="glass-card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{c.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{c.type} • {c.pricingModel}</div>
                    </div>
                    <span className={`badge badge-${statusColors[c.status]}`}>{c.status.replace(/_/g, ' ')}</span>
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: 'var(--accent-blue)' }}>
                        {c.viewCount}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Views</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: 'var(--accent-green)' }}>
                        {c.completedCount}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Joins</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: 'var(--accent-orange)' }}>
                        {parseFloat(c.spentBudget).toFixed(4)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Spent</div>
                    </div>
                  </div>

                  {/* Budget Progress */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                      <span>Budget used</span>
                      <span>{parseFloat(c.spentBudget).toFixed(4)} / {parseFloat(c.totalBudget).toFixed(4)} TON</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{
                        width: `${(parseFloat(c.spentBudget) / parseFloat(c.totalBudget)) * 100}%`,
                      }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Create Campaign Form */
        <div className="glass-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>🚀 Create Campaign</h3>

          <div style={{ marginBottom: 16 }}>
            <label className="input-label">Campaign Title</label>
            <input className="input-field" placeholder="e.g., Join our crypto channel"
              value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="input-label">Description</label>
            <textarea className="input-field" placeholder="Short description of your channel/bot..."
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="input-label">Campaign Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {campaignTypes.map((t) => (
                <button key={t.value} onClick={() => setForm({ ...form, type: t.value })} style={{
                  padding: '12px', background: form.type === t.value ? 'rgba(59,130,246,0.2)' : 'var(--bg-glass)',
                  border: `1px solid ${form.type === t.value ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                  borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left',
                  color: 'var(--text-primary)', transition: 'all 0.2s',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="input-label">Target URL / Link</label>
            <input className="input-field" placeholder="https://t.me/your_channel"
              value={form.targetUrl} onChange={(e) => setForm({ ...form, targetUrl: e.target.value })} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label className="input-label">Price Per Action (TON)</label>
              <input className="input-field" type="number" step="0.001"
                value={form.pricePerAction} onChange={(e) => setForm({ ...form, pricePerAction: e.target.value })} />
            </div>
            <div>
              <label className="input-label">Total Budget (TON)</label>
              <input className="input-field" type="number" step="0.01"
                value={form.totalBudget} onChange={(e) => setForm({ ...form, totalBudget: e.target.value })} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="input-label">Pricing Model</label>
            <select className="input-field" value={form.pricingModel}
              onChange={(e) => setForm({ ...form, pricingModel: e.target.value })}>
              <option value="CPE">CPE — Cost per Engagement</option>
              <option value="CPC">CPC — Cost per Click</option>
              <option value="CPM">CPM — Cost per 1000 Impressions</option>
            </select>
          </div>

          {/* Summary */}
          <div style={{
            background: 'var(--bg-glass)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📊 Campaign Summary</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>Estimated completions:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {form.pricePerAction && form.totalBudget
                  ? Math.floor(parseFloat(form.totalBudget) / parseFloat(form.pricePerAction))
                  : 0}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Your balance:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-green)' }}>
                {parseFloat(user?.wallet?.balance || '0').toFixed(4)} TON
              </span>
            </div>
          </div>

          <button
            className="btn btn-primary btn-full btn-lg"
            disabled={!form.title || !form.targetUrl || !form.pricePerAction || !form.totalBudget || creating}
            onClick={handleCreate}
          >
            {creating ? '⏳ Creating...' : '🚀 Create Campaign'}
          </button>

          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 12 }}>
            Campaign will be reviewed before going live
          </div>
        </div>
      )}
    </div>
  );
}

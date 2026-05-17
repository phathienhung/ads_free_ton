'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAppStore } from '@/stores/useAppStore';

export default function WalletPage() {
  const { user, refreshUser } = useAppStore();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amount, setAmount] = useState('');
  const [tonAddress, setTonAddress] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadTransactions();
  }, []);

  async function loadTransactions() {
    try {
      const data = await api.getTransactions(1);
      setTransactions(data.transactions);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  async function handleDeposit() {
    try {
      setProcessing(true);
      await api.deposit(parseFloat(amount));
      await refreshUser();
      await loadTransactions();
      setShowDeposit(false);
      setAmount('');
    } catch (err: any) { alert(err.message); }
    setProcessing(false);
  }

  async function handleWithdraw() {
    try {
      setProcessing(true);
      await api.withdraw(parseFloat(amount), tonAddress);
      await refreshUser();
      await loadTransactions();
      setShowWithdraw(false);
      setAmount('');
      setTonAddress('');
    } catch (err: any) { alert(err.message); }
    setProcessing(false);
  }

  const txIcons: Record<string, string> = {
    DEPOSIT: '💳', WITHDRAWAL: '📤', REWARD: '🎁', CAMPAIGN_SPEND: '📢',
    REFERRAL_BONUS: '👥', SPIN_REWARD: '🎰', DAILY_BONUS: '📅', PURCHASE: '🛒',
    CAMPAIGN_REFUND: '↩️',
  };
  const txColors: Record<string, string> = {
    DEPOSIT: 'var(--accent-green)', WITHDRAWAL: 'var(--accent-red)',
    REWARD: 'var(--accent-green)', CAMPAIGN_SPEND: 'var(--accent-red)',
    REFERRAL_BONUS: 'var(--accent-orange)', SPIN_REWARD: 'var(--accent-purple)',
    DAILY_BONUS: 'var(--accent-cyan)', PURCHASE: 'var(--accent-red)',
    CAMPAIGN_REFUND: 'var(--accent-green)',
  };

  return (
    <div className="page">
      <h1 className="page-title" style={{ marginBottom: 20 }}>💰 Wallet</h1>

      {/* Balance Card */}
      <div className="glass-card" style={{
        padding: 28, textAlign: 'center', marginBottom: 20,
        background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(6,182,212,0.15))',
      }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Available Balance
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 40, fontWeight: 900, marginTop: 8,
          background: 'var(--gradient-success)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          {parseFloat(user?.wallet?.balance || '0').toFixed(4)}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>TON</div>

        {user?.wallet?.frozenBalance && parseFloat(user.wallet.frozenBalance) > 0 && (
          <div style={{ fontSize: 12, color: 'var(--accent-orange)', marginTop: 8 }}>
            🔒 Frozen: {parseFloat(user.wallet.frozenBalance).toFixed(4)} TON
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button className="btn btn-success" style={{ flex: 1 }} onClick={() => setShowDeposit(true)}>
            💳 Deposit
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowWithdraw(true)}>
            📤 Withdraw
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div className="glass-card stat-card">
          <div className="stat-value" style={{ fontSize: 18, background: 'var(--gradient-success)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {parseFloat(user?.wallet?.totalEarned || '0').toFixed(4)}
          </div>
          <div className="stat-label">Total Earned</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-value" style={{ fontSize: 18, background: 'var(--gradient-warm)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {parseFloat(user?.wallet?.totalSpent || '0').toFixed(4)}
          </div>
          <div className="stat-label">Total Spent</div>
        </div>
      </div>

      {/* Transaction History */}
      <h2 className="section-title">📊 Transaction History</h2>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3,4].map((i) => <div key={i} className="skeleton" style={{ height: 56 }} />)}
        </div>
      ) : transactions.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-text">No transactions yet</div>
        </div>
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          {transactions.map((tx, i) => (
            <div key={tx.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderBottom: i < transactions.length - 1 ? '1px solid var(--border-color)' : 'none',
            }}>
              <div style={{ fontSize: 24, width: 36, textAlign: 'center' }}>
                {txIcons[tx.type] || '💱'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {tx.type.replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {new Date(tx.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14,
                color: txColors[tx.type] || 'var(--text-primary)',
              }}>
                {['WITHDRAWAL', 'CAMPAIGN_SPEND', 'PURCHASE'].includes(tx.type) ? '-' : '+'}
                {parseFloat(tx.amount).toFixed(4)}
              </div>
              <div className={`badge badge-${tx.status === 'COMPLETED' ? 'green' : tx.status === 'PENDING' ? 'orange' : 'red'}`}>
                {tx.status}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deposit Modal */}
      {showDeposit && (
        <Modal onClose={() => setShowDeposit(false)} title="💳 Deposit TON">
          <div style={{ marginBottom: 16 }}>
            <label className="input-label">Amount (TON)</label>
            <input className="input-field" type="number" step="0.01" placeholder="0.1"
              value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <button className="btn btn-success btn-full" disabled={!amount || processing} onClick={handleDeposit}>
            {processing ? '⏳ Processing...' : '💳 Deposit'}
          </button>
        </Modal>
      )}

      {/* Withdraw Modal */}
      {showWithdraw && (
        <Modal onClose={() => setShowWithdraw(false)} title="📤 Withdraw TON">
          <div style={{ marginBottom: 16 }}>
            <label className="input-label">Amount (TON)</label>
            <input className="input-field" type="number" step="0.01" placeholder="0.1"
              value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="input-label">TON Wallet Address</label>
            <input className="input-field" placeholder="EQ..."
              value={tonAddress} onChange={(e) => setTonAddress(e.target.value)} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--accent-orange)', marginBottom: 16, padding: '8px 12px', background: 'rgba(245,158,11,0.1)', borderRadius: 8 }}>
            ⚠️ 5% withdrawal fee. Min withdrawal: 0.1 TON
          </div>
          <button className="btn btn-primary btn-full" disabled={!amount || !tonAddress || processing} onClick={handleWithdraw}>
            {processing ? '⏳ Processing...' : '📤 Withdraw'}
          </button>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: 999, backdropFilter: 'blur(4px)',
      }} />
      <div className="animate-fade-in" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-secondary)', borderRadius: '20px 20px 0 0',
        padding: 24, zIndex: 1000, maxHeight: '80vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{
            background: 'var(--bg-glass)', border: 'none', color: 'var(--text-primary)',
            width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 16,
          }}>✕</button>
        </div>
        {children}
      </div>
    </>
  );
}

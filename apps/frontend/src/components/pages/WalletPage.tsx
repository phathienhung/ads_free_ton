'use client';

import { useEffect, useState } from 'react';
import { useTonConnectUI, useTonWallet, useTonAddress } from '@tonconnect/ui-react';
import { api } from '@/lib/api';
import { useAppStore } from '@/stores/useAppStore';

// Platform wallet address to receive deposits
const PLATFORM_WALLET = process.env.NEXT_PUBLIC_PLATFORM_WALLET || 'UQBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

export default function WalletPage() {
  const { user, refreshUser, gameConfig } = useAppStore();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amount, setAmount] = useState('');
  const [tonAddress, setTonAddress] = useState('');
  const [processing, setProcessing] = useState(false);

  // TON Connect hooks
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const userFriendlyAddress = useTonAddress();

  useEffect(() => {
    loadTransactions();
  }, []);

  // Auto-fill withdrawal address when wallet is connected
  useEffect(() => {
    if (userFriendlyAddress && !tonAddress) {
      setTonAddress(userFriendlyAddress);
    }
  }, [userFriendlyAddress]);

  async function loadTransactions() {
    try {
      const data = await api.getTransactions(1);
      setTransactions(data.transactions);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  function handleConnectWallet() {
    tonConnectUI.openModal();
  }

  function handleDisconnectWallet() {
    tonConnectUI.disconnect();
  }

  async function handleDeposit() {
    if (!wallet) {
      alert('Please connect your TON wallet first!');
      tonConnectUI.openModal();
      return;
    }

    const depositAmount = parseFloat(amount);
    if (!depositAmount || depositAmount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    try {
      setProcessing(true);

      // Send real TON transaction via TON Connect
      const amountInNanoton = BigInt(Math.floor(depositAmount * 1e9)).toString();

      const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 600, // 10 minutes
        messages: [
          {
            address: PLATFORM_WALLET,
            amount: amountInNanoton,
          },
        ],
      };

      const result = await tonConnectUI.sendTransaction(transaction);

      // Notify backend about the deposit with the BOC (Bag of Cells)
      await api.deposit(depositAmount, result.boc);
      await refreshUser();
      await loadTransactions();
      setShowDeposit(false);
      setAmount('');
    } catch (err: any) {
      if (err?.message?.includes('User rejects')) {
        // User cancelled the transaction
      } else {
        alert(err.message || 'Deposit failed');
      }
    }
    setProcessing(false);
  }

  async function handleWithdraw() {
    const withdrawAddress = tonAddress || userFriendlyAddress;
    if (!withdrawAddress) {
      alert('Please connect your wallet or enter a TON address');
      return;
    }
    try {
      setProcessing(true);
      await api.withdraw(parseFloat(amount), withdrawAddress);
      await refreshUser();
      await loadTransactions();
      setShowWithdraw(false);
      setAmount('');
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

      {/* Wallet Connection Card */}
      <div className="glass-card animate-fade-in" style={{
        padding: 16, marginBottom: 16,
        background: wallet
          ? 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(6,182,212,0.12))'
          : 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(59,130,246,0.12))',
        border: wallet ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(139,92,246,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: wallet ? 'rgba(34,197,94,0.2)' : 'rgba(139,92,246,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>
              {wallet ? '✅' : '🔗'}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {wallet ? 'Wallet Connected' : 'Connect TON Wallet'}
              </div>
              {wallet ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {userFriendlyAddress.slice(0, 6)}...{userFriendlyAddress.slice(-6)}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Connect to deposit & withdraw TON
                </div>
              )}
            </div>
          </div>
          {wallet ? (
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={handleDisconnectWallet}
            >
              Disconnect
            </button>
          ) : (
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '8px 16px' }}
              onClick={handleConnectWallet}
            >
              🔗 Connect
            </button>
          )}
        </div>
      </div>

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
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              (Pending withdrawal — will be released when processed)
            </div>
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
          {!wallet ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
                Connect your TON wallet to deposit
              </div>
              <button className="btn btn-primary btn-full" onClick={handleConnectWallet}>
                🔗 Connect Wallet
              </button>
            </div>
          ) : (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                background: 'rgba(34,197,94,0.08)', borderRadius: 'var(--radius-md)', marginBottom: 16,
              }}>
                <span>✅</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Connected Wallet</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {userFriendlyAddress.slice(0, 10)}...{userFriendlyAddress.slice(-8)}
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label className="input-label">Amount (TON)</label>
                <input className="input-field" type="number" step="0.01" placeholder="0.1"
                  value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, padding: '8px 12px', background: 'var(--bg-glass)', borderRadius: 8 }}>
                💡 You will be asked to confirm the transaction in your wallet app.
              </div>
              <button className="btn btn-success btn-full" disabled={!amount || processing} onClick={handleDeposit}>
                {processing ? '⏳ Confirming in wallet...' : '💳 Deposit via TON Connect'}
              </button>
            </>
          )}
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
            {wallet && !tonAddress && (
              <button
                style={{ fontSize: 11, color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, padding: 0 }}
                onClick={() => setTonAddress(userFriendlyAddress)}
              >
                📋 Use connected wallet address
              </button>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--accent-orange)', marginBottom: 16, padding: '8px 12px', background: 'rgba(245,158,11,0.1)', borderRadius: 8 }}>
            ⚠️ {gameConfig?.withdrawFee?.rate || 5}% withdrawal fee. Min withdrawal: {gameConfig?.withdrawFee?.minFee || 0.1} TON
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

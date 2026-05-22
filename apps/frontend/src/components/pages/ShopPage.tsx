import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import { useAppStore } from '@/stores/useAppStore';
import { ShoppingCart, Zap, Star, Gift, Package } from 'lucide-react';

export default function ShopPage() {
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null);
  
  const [tonConnectUI] = useTonConnectUI();
  const address = useTonAddress();
  const { user, refreshUser } = useAppStore();

  useEffect(() => {
    loadPackages();
  }, []);

  async function loadPackages() {
    try {
      setLoading(true);
      const data = await api.getShopPackages();
      setPackages(data);
    } catch (err) {
      console.error('Failed to load shop packages', err);
    }
    setLoading(false);
  }

  async function handleBuy(pkg: any) {
    if (!user) {
      alert('Please login first!');
      return;
    }

    try {
      setPurchaseLoading(pkg.id);
      
      const price = parseFloat(pkg.priceTon);
      const balance = parseFloat(user.wallet?.balance || "0");
      const remainingPrice = Math.max(0, price - balance);
      
      let boc = '';

      if (remainingPrice > 0) {
        if (!address) {
          alert('You do not have enough internal balance. Please connect your TON wallet to pay the remaining amount!');
          document.getElementById('tc-connect-btn')?.click();
          setPurchaseLoading(null);
          return;
        }

        const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET || '0QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE9X';
        const amountNano = (remainingPrice * 1e9).toString();

        const tx = {
          validUntil: Math.floor(Date.now() / 1000) + 360,
          messages: [
            {
              address: platformWallet,
              amount: amountNano,
            }
          ]
        };

        const txResult = await tonConnectUI.sendTransaction(tx);
        boc = txResult.boc;
      }
      
      // Send boc to backend to complete purchase
      await api.purchasePackage(pkg.id, boc);
      
      alert(`Successfully purchased ${pkg.name}!`);
      await refreshUser();
      await loadPackages(); // refresh in case it's a one-time package
      
    } catch (err: any) {
      console.error('Purchase failed', err);
      alert(err.message || 'Purchase failed or was cancelled.');
    } finally {
      setPurchaseLoading(null);
    }
  }

  const getIcon = (type: string) => {
    switch(type) {
      case 'ENERGY': return <Zap className="text-yellow-400" size={32} />;
      case 'XP': return <Star className="text-blue-400" size={32} />;
      case 'SPIN': return <Gift className="text-pink-400" size={32} />;
      case 'BUNDLE': return <Package className="text-purple-400" size={32} />;
      default: return <ShoppingCart size={32} />;
    }
  };

  return (
    <div className="page pb-24">
      <div className="page-header text-center mb-6">
        <h1 className="page-title text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent inline-flex items-center gap-2">
          <ShoppingCart /> Premium Shop
        </h1>
        <p className="text-gray-400 mt-2 text-sm">Boost your progress with premium items</p>
      </div>

      {!address && (
        <div className="glass-card mb-6 p-4 text-center border border-pink-500/30">
          <p className="text-sm mb-3">Connect your wallet to make purchases</p>
          <button 
            className="btn btn-primary w-full"
            onClick={() => document.getElementById('tc-connect-btn')?.click()}
          >
            Connect TON Wallet
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-4">
          {[1,2,3].map(i => <div key={i} className="skeleton h-32 rounded-xl" />)}
        </div>
      ) : packages.length === 0 ? (
        <div className="glass-card empty-state text-center p-8">
          <div className="text-4xl mb-2">🛍️</div>
          <p>No packages available at the moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {packages.map((pkg, i) => (
            <div 
              key={pkg.id} 
              className={`glass-card p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 ${pkg.isOneTime ? 'border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : ''}`}
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              {pkg.isOneTime && (
                <div className="absolute top-0 right-0 bg-gradient-to-l from-purple-600 to-pink-600 text-xs font-bold px-3 py-1 rounded-bl-lg z-10 shadow-lg">
                  ONE TIME OFFER
                </div>
              )}
              
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center shrink-0 shadow-inner border border-white/10">
                  {getIcon(pkg.type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-[15px] leading-tight mb-1.5 truncate text-white">{pkg.name}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {pkg.energyAmount > 0 && <span className="badge badge-yellow text-[10px] px-1.5 py-0.5">+{pkg.energyAmount} ⚡</span>}
                    {pkg.xpAmount > 0 && <span className="badge badge-blue text-[10px] px-1.5 py-0.5">+{pkg.xpAmount} ⭐</span>}
                    {pkg.spinAmount > 0 && <span className="badge badge-pink text-[10px] px-1.5 py-0.5">+{pkg.spinAmount} 🎰</span>}
                  </div>
                </div>
                
                <button 
                  className="btn btn-primary shrink-0 py-1.5 px-3 flex flex-col items-center justify-center gap-0.5 font-bold shadow-[0_0_10px_rgba(59,130,246,0.3)] transition-all hover:shadow-[0_0_15px_rgba(59,130,246,0.6)]"
                  style={{ minWidth: '85px', borderRadius: '12px' }}
                  onClick={() => handleBuy(pkg)}
                  disabled={purchaseLoading === pkg.id || !address}
                >
                  {purchaseLoading === pkg.id ? (
                    <span className="text-xs">Wait...</span>
                  ) : (
                    <>
                      <span className="text-[10px] font-normal text-blue-100 uppercase tracking-wider">Buy</span>
                      <div className="flex items-center gap-1 text-[13px]">
                        <img src="/ton-logo.png" alt="TON" className="w-3.5 h-3.5 brightness-0 invert" onError={(e) => e.currentTarget.style.display = 'none'} />
                        <span>{parseFloat(pkg.priceTon)}</span>
                      </div>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

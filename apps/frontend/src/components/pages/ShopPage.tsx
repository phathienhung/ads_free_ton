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
    if (!address) {
      alert('Please connect your TON wallet first!');
      return;
    }

    try {
      setPurchaseLoading(pkg.id);
      
      const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET || '0QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE9X';
      const amountNano = (parseFloat(pkg.priceTon) * 1e9).toString();

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
      
      // Send boc to backend to complete purchase
      await api.purchasePackage(pkg.id, txResult.boc);
      
      alert(`Successfully purchased ${pkg.name}!`);
      await refreshUser();
      await loadPackages(); // refresh in case it's a one-time package
      
    } catch (err: any) {
      console.error('Purchase failed', err);
      alert('Purchase failed or was cancelled.');
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
        <div className="grid grid-cols-2 gap-4">
          {packages.map((pkg, i) => {
            const isBundle = pkg.type === 'BUNDLE';
            return (
              <div 
                key={pkg.id} 
                className={`glass-card relative flex flex-col items-center text-center overflow-hidden transition-all duration-300 hover:-translate-y-1 ${
                  isBundle 
                    ? 'col-span-2 border border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.2)] bg-gradient-to-br from-white/5 to-purple-500/10' 
                    : 'p-5'
                }`}
                style={{ animationDelay: `${i * 0.1}s`, padding: isBundle ? '24px 20px' : '20px 16px' }}
              >
                {pkg.isOneTime && (
                  <div className="absolute top-0 inset-x-0 bg-gradient-to-r from-purple-600 to-pink-600 text-[10px] font-bold py-1 text-center shadow-lg uppercase tracking-wider">
                    One Time Offer
                  </div>
                )}
                
                <div className={`w-20 h-20 rounded-full bg-black/20 flex items-center justify-center shrink-0 shadow-inner mb-3 ${isBundle ? 'mt-4 w-24 h-24' : 'mt-2'}`}>
                  {getIcon(pkg.type)}
                </div>
                
                <h3 className={`font-bold mb-1 ${isBundle ? 'text-2xl text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400' : 'text-lg'}`}>
                  {pkg.name}
                </h3>
                
                {pkg.description && (
                  <p className="text-sm text-gray-400 mb-3 px-2">
                    {pkg.description}
                  </p>
                )}
                
                <div className={`flex flex-wrap justify-center gap-2 mb-4 mt-auto w-full ${isBundle ? 'max-w-md' : ''}`}>
                  {pkg.energyAmount > 0 && <span className="badge badge-yellow text-[10px] py-1 px-2">+{pkg.energyAmount} Energy</span>}
                  {pkg.xpAmount > 0 && <span className="badge badge-blue text-[10px] py-1 px-2">+{pkg.xpAmount} XP</span>}
                  {pkg.spinAmount > 0 && <span className="badge badge-pink text-[10px] py-1 px-2">+{pkg.spinAmount} Spins</span>}
                </div>
                
                <button 
                  className={`btn w-full py-2.5 flex items-center justify-center gap-2 font-bold transition-all ${
                    isBundle 
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_15px_rgba(217,70,239,0.5)] hover:shadow-[0_0_25px_rgba(217,70,239,0.8)]'
                      : 'btn-primary shadow-[0_0_10px_rgba(59,130,246,0.3)] hover:shadow-[0_0_15px_rgba(59,130,246,0.6)]'
                  }`}
                  onClick={() => handleBuy(pkg)}
                  disabled={purchaseLoading === pkg.id || !address}
                >
                  {purchaseLoading === pkg.id ? 'Processing...' : (
                    <>
                      <img src="/ton-logo.png" alt="TON" className="w-5 h-5 brightness-0 invert opacity-90" onError={(e) => e.currentTarget.style.display = 'none'} />
                      {parseFloat(pkg.priceTon)} TON
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

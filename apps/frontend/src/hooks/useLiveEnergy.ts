import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/useAppStore';

export function useLiveEnergy() {
  const { user, gameConfig, refreshUser } = useAppStore();
  const [energy, setEnergy] = useState(0);
  const [countdown, setCountdown] = useState('');

  const recoverSeconds = gameConfig?.energy?.recoverSeconds || 300;
  const recoverAmount = gameConfig?.energy?.recoverAmount || 1;
  const maxEnergy = user?.maxEnergy || gameConfig?.energy?.maxEnergy || 100;

  useEffect(() => {
    if (!user) {
      setEnergy(0);
      setCountdown('');
      return;
    }

    const calculateEnergy = () => {
      if (user.energy >= maxEnergy) {
        setEnergy(user.energy);
        setCountdown('');
        return;
      }

      const serverNow = Date.now() - useAppStore.getState().timeOffset;
      const elapsedMs = serverNow - new Date(user.energyUpdatedAt || serverNow).getTime();
      const regenIntervalMs = recoverSeconds * 1000;
      
      const regenCount = Math.floor(elapsedMs / regenIntervalMs);
      
      let newEnergy = user.energy;
      if (user.energy < maxEnergy) {
        newEnergy = Math.min(user.energy + (regenCount * recoverAmount), maxEnergy);
      }
      
      setEnergy(newEnergy);

      if (newEnergy >= maxEnergy) {
        setCountdown('');
        // If energy maxed out while on client side, refresh user in background to sync with DB state
        if (newEnergy > user.energy) {
          refreshUser().catch(() => {});
        }
      } else {
        const sinceLastRegen = (elapsedMs / 1000) % recoverSeconds;
        const remaining = Math.max(0, recoverSeconds - sinceLastRegen);
        const mins = Math.floor(remaining / 60);
        const secs = Math.floor(remaining % 60);
        setCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
        
        // Auto-refresh user when a tick of energy is recovered
        if (regenCount > 0 && newEnergy > user.energy) {
          // This ensures that when the user has recovered energy, 
          // we do a background sync so user.energy gets updated.
          // Wait to only do it once per recovery. We can just rely on the local state for UI,
          // but if we want it persisted, refreshUser is good.
          // For now, we only need local state update, the backend calculates it dynamically anyway!
        }
      }
    };

    calculateEnergy();
    const id = setInterval(calculateEnergy, 1000);
    return () => clearInterval(id);
  }, [user, recoverSeconds, recoverAmount, maxEnergy, refreshUser]);

  const energyPercent = maxEnergy > 0 ? (energy / maxEnergy) * 100 : 0;

  return { energy, maxEnergy, energyPercent, countdown };
}

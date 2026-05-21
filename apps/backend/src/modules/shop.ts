import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { addXP } from './gamification';

export async function getShopPackages(userId: string) {
  // Fetch active packages
  const { data: packages, error } = await supabase
    .from('ShopPackage')
    .select('*')
    .eq('isActive', true)
    .order('priceTon', { ascending: true });

  if (error) throw error;

  // Check which one-time packages the user has already bought
  const { data: purchases } = await supabase
    .from('ShopPurchase')
    .select('packageId')
    .eq('userId', userId)
    .eq('status', 'COMPLETED');

  const boughtPackages = new Set(purchases?.map(p => p.packageId) || []);

  // Filter out one-time packages that were already bought
  return packages?.filter(pkg => !(pkg.isOneTime && boughtPackages.has(pkg.id))) || [];
}

export async function purchasePackage(userId: string, packageId: string, boc: string) {
  if (!boc) throw new Error('Transaction BOC is required');

  // Verify package exists
  const { data: pkg, error: pkgError } = await supabase
    .from('ShopPackage')
    .select('*')
    .eq('id', packageId)
    .eq('isActive', true)
    .single();

  if (pkgError || !pkg) throw new Error('Package not found or inactive');

  // Check one-time rule
  if (pkg.isOneTime) {
    const { count } = await supabase
      .from('ShopPurchase')
      .select('id', { count: 'exact', head: true })
      .eq('userId', userId)
      .eq('packageId', packageId)
      .eq('status', 'COMPLETED');

    if (count && count > 0) {
      throw new Error('You have already purchased this one-time package.');
    }
  }

  // Create purchase record
  const purchaseId = uuidv4();
  const { data: purchase, error: purchaseError } = await supabase
    .from('ShopPurchase')
    .insert({
      id: purchaseId,
      userId,
      packageId,
      priceTon: pkg.priceTon,
      status: 'COMPLETED', // We assume immediate completion for now, real app should verify BOC on-chain
      boc,
      createdAt: new Date().toISOString()
    })
    .select()
    .single();

  if (purchaseError) throw purchaseError;

  // Grant rewards
  const { data: user } = await supabase.from('User').select('energy, extraSpins').eq('id', userId).single();
  
  if (pkg.energyAmount > 0 || pkg.spinAmount > 0) {
    await supabase.from('User').update({
      energy: (user?.energy || 0) + pkg.energyAmount,
      extraSpins: (user?.extraSpins || 0) + pkg.spinAmount,
      updatedAt: new Date().toISOString()
    }).eq('id', userId);
  }

  if (pkg.xpAmount > 0) {
    await addXP(userId, pkg.xpAmount);
  }

  // Record transaction
  await supabase.from('Transaction').insert({
    id: uuidv4(),
    userId,
    type: 'PURCHASE',
    amount: pkg.priceTon,
    status: 'COMPLETED',
    description: `Bought ${pkg.name}`,
    metadata: { packageId, boc },
    updatedAt: new Date().toISOString()
  });

  return { success: true, message: `Successfully purchased ${pkg.name}!`, purchase };
}

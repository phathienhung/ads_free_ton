import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Starting data synchronization...');

  // 1. Sync Usernames to Wallets
  console.log('\n--- Syncing Usernames to Wallets ---');
  const { data: users, error: userError } = await supabase.from('User').select('id, username');
  
  if (userError) {
    console.error('Error fetching users:', userError);
  } else {
    let syncedWallets = 0;
    for (const user of users || []) {
      if (user.username) {
        const { error } = await supabase
          .from('Wallet')
          .update({ username: user.username })
          .eq('userId', user.id);
        
        if (error) {
          console.error(`Failed to update wallet for user ${user.id}:`, error);
        } else {
          syncedWallets++;
        }
      }
    }
    console.log(`Successfully synced username for ${syncedWallets} wallets.`);
  }

  // 2. Calculate and Backfill totalSpins
  console.log('\n--- Backfilling totalSpins ---');
  const { data: spins, error: spinError } = await supabase.from('SpinHistory').select('userId');
  
  if (spinError) {
    console.error('Error fetching spin history:', spinError);
  } else {
    // Count spins per user
    const spinCounts: Record<string, number> = {};
    for (const spin of spins || []) {
      spinCounts[spin.userId] = (spinCounts[spin.userId] || 0) + 1;
    }

    let syncedSpins = 0;
    for (const [userId, count] of Object.entries(spinCounts)) {
      const { error } = await supabase
        .from('User')
        .update({ totalSpins: count })
        .eq('id', userId);
      
      if (error) {
        console.error(`Failed to update totalSpins for user ${userId}:`, error);
      } else {
        syncedSpins++;
      }
    }
    console.log(`Successfully backfilled totalSpins for ${syncedSpins} users.`);
  }

  console.log('\nSynchronization complete!');
}

main().catch(console.error);

-- ==================== SHOP TABLES ====================

CREATE TABLE "ShopPackage" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL, -- "ENERGY", "XP", "SPIN", "BUNDLE"
  "energyAmount" INTEGER NOT NULL DEFAULT 0,
  "xpAmount" INTEGER NOT NULL DEFAULT 0,
  "spinAmount" INTEGER NOT NULL DEFAULT 0,
  "priceTon" DECIMAL(20, 8) NOT NULL,
  "isOneTime" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ShopPackage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopPurchase" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "priceTon" DECIMAL(20, 8) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "boc" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ShopPurchase_pkey" PRIMARY KEY ("id")
);

-- Add Foreign Keys
ALTER TABLE "ShopPurchase" ADD CONSTRAINT "ShopPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopPurchase" ADD CONSTRAINT "ShopPurchase_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ShopPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add Indexes
CREATE INDEX "ShopPurchase_userId_idx" ON "ShopPurchase"("userId");
CREATE INDEX "ShopPurchase_packageId_idx" ON "ShopPurchase"("packageId");

-- ==================== SEED DATA ====================
-- Insert default shop packages
INSERT INTO "ShopPackage" ("id", "name", "description", "type", "energyAmount", "xpAmount", "spinAmount", "priceTon", "isOneTime") VALUES
(gen_random_uuid()::text, 'Energy Refill', 'Instantly receive 500 Energy to continue your tasks.', 'ENERGY', 500, 0, 0, 0.5, false),
(gen_random_uuid()::text, 'XP Boost', 'Gain 1000 XP to level up faster.', 'XP', 0, 1000, 0, 0.8, false),
(gen_random_uuid()::text, 'Lucky Spins', 'Get 10 extra spins for the lucky wheel.', 'SPIN', 0, 0, 10, 1.0, false),
(gen_random_uuid()::text, 'Starter Bundle', 'The ultimate starter pack! Includes 500 Energy, 1000 XP, and 10 lucky spins.', 'BUNDLE', 500, 1000, 10, 1.5, true);

ALTER TABLE "User"
ADD COLUMN "stripeCustomerId" TEXT,
ADD COLUMN "paystackCustomerId" TEXT;

ALTER TABLE "Subscription"
ADD COLUMN "providerSubscriptionToken" TEXT;

CREATE UNIQUE INDEX "User_stripeCustomerId_key"
ON "User"("stripeCustomerId");

CREATE UNIQUE INDEX "User_paystackCustomerId_key"
ON "User"("paystackCustomerId");

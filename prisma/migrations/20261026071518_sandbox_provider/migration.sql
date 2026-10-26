-- CreateTable
CREATE TABLE "sandbox_transactions" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "feeMinor" BIGINT NOT NULL DEFAULT 0,
    "email" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "refunds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sandbox_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sandbox_transactions_reference_key" ON "sandbox_transactions"("reference");

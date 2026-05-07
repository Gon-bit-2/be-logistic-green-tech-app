-- CreateEnum
CREATE TYPE "CodSettlementBatchStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'COMPLETED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CodSettlementItemStatus" AS ENUM ('PENDING', 'COMPLETED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SlaAlertType" AS ENUM ('DELIVERY_WINDOW_BREACH', 'ETA_DELAY');

-- CreateEnum
CREATE TYPE "SlaAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SlaAlertStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "cod_settlement_batches" (
    "id" SERIAL NOT NULL,
    "batchCode" VARCHAR(64) NOT NULL,
    "driverId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "completedById" INTEGER,
    "status" "CodSettlementBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "note" VARCHAR(1000),
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "disputedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cod_settlement_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cod_settlement_items" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "transactionId" INTEGER,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "CodSettlementItemStatus" NOT NULL DEFAULT 'PENDING',
    "disputeReason" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cod_settlement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_alerts" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "tripId" INTEGER,
    "alertType" "SlaAlertType" NOT NULL,
    "severity" "SlaAlertSeverity" NOT NULL DEFAULT 'WARNING',
    "status" "SlaAlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "etaAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "message" VARCHAR(1000),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cod_settlement_batches_batchCode_key" ON "cod_settlement_batches"("batchCode");

-- CreateIndex
CREATE INDEX "cod_settlement_batches_driverId_status_idx" ON "cod_settlement_batches"("driverId", "status");

-- CreateIndex
CREATE INDEX "cod_settlement_batches_status_createdAt_idx" ON "cod_settlement_batches"("status", "createdAt");

-- CreateIndex
CREATE INDEX "cod_settlement_batches_createdById_idx" ON "cod_settlement_batches"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "cod_settlement_items_batchId_orderId_key" ON "cod_settlement_items"("batchId", "orderId");

-- CreateIndex
CREATE INDEX "cod_settlement_items_orderId_idx" ON "cod_settlement_items"("orderId");

-- CreateIndex
CREATE INDEX "cod_settlement_items_transactionId_idx" ON "cod_settlement_items"("transactionId");

-- CreateIndex
CREATE INDEX "cod_settlement_items_status_idx" ON "cod_settlement_items"("status");

-- CreateIndex
CREATE INDEX "sla_alerts_orderId_status_idx" ON "sla_alerts"("orderId", "status");

-- CreateIndex
CREATE INDEX "sla_alerts_tripId_status_idx" ON "sla_alerts"("tripId", "status");

-- CreateIndex
CREATE INDEX "sla_alerts_alertType_status_idx" ON "sla_alerts"("alertType", "status");

-- CreateIndex
CREATE INDEX "sla_alerts_createdAt_idx" ON "sla_alerts"("createdAt");

-- AddForeignKey
ALTER TABLE "cod_settlement_batches" ADD CONSTRAINT "cod_settlement_batches_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cod_settlement_batches" ADD CONSTRAINT "cod_settlement_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cod_settlement_batches" ADD CONSTRAINT "cod_settlement_batches_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cod_settlement_items" ADD CONSTRAINT "cod_settlement_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "cod_settlement_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cod_settlement_items" ADD CONSTRAINT "cod_settlement_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cod_settlement_items" ADD CONSTRAINT "cod_settlement_items_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sla_alerts" ADD CONSTRAINT "sla_alerts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sla_alerts" ADD CONSTRAINT "sla_alerts_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

/*
  Warnings:

  - Added the required column `receiverName` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `receiverPhone` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `senderName` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `senderPhone` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "currentTripId" INTEGER,
ADD COLUMN     "receiverName" TEXT NOT NULL,
ADD COLUMN     "receiverPhone" TEXT NOT NULL,
ADD COLUMN     "senderName" TEXT NOT NULL,
ADD COLUMN     "senderPhone" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "hubId" INTEGER,
ALTER COLUMN "deletedAt" DROP NOT NULL,
ALTER COLUMN "deletedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "orders_currentTripId_idx" ON "orders"("currentTripId");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_currentTripId_fkey" FOREIGN KEY ("currentTripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

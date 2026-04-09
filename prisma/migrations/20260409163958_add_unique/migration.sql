/*
  Warnings:

  - You are about to drop the `Language` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VehicleTranslation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Language" DROP CONSTRAINT "Language_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Language" DROP CONSTRAINT "Language_deletedById_fkey";

-- DropForeignKey
ALTER TABLE "Language" DROP CONSTRAINT "Language_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "VehicleTranslation" DROP CONSTRAINT "VehicleTranslation_createdById_fkey";

-- DropForeignKey
ALTER TABLE "VehicleTranslation" DROP CONSTRAINT "VehicleTranslation_deletedById_fkey";

-- DropForeignKey
ALTER TABLE "VehicleTranslation" DROP CONSTRAINT "VehicleTranslation_languageId_fkey";

-- DropForeignKey
ALTER TABLE "VehicleTranslation" DROP CONSTRAINT "VehicleTranslation_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "VehicleTranslation" DROP CONSTRAINT "VehicleTranslation_vehicleId_fkey";

-- DropForeignKey
ALTER TABLE "hub_translations" DROP CONSTRAINT "hub_translations_languageId_fkey";

-- DropForeignKey
ALTER TABLE "user_translations" DROP CONSTRAINT "user_translations_languageId_fkey";

-- AlterTable
ALTER TABLE "hub_translations" ALTER COLUMN "languageId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "hubs" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_translations" ALTER COLUMN "languageId" SET DATA TYPE TEXT;

-- DropTable
DROP TABLE "Language";

-- DropTable
DROP TABLE "VehicleTranslation";

-- CreateTable
CREATE TABLE "languages" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_translations" (
    "id" SERIAL NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "languageId" VARCHAR(10) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "createdById" INTEGER,
    "updatedById" INTEGER,

    CONSTRAINT "vehicle_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "languages_code_key" ON "languages"("code");

-- CreateIndex
CREATE UNIQUE INDEX "languages_id_code_key" ON "languages"("id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_translations_vehicleId_languageId_key" ON "vehicle_translations"("vehicleId", "languageId");

-- AddForeignKey
ALTER TABLE "user_translations" ADD CONSTRAINT "user_translations_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "languages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "languages" ADD CONSTRAINT "languages_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "languages" ADD CONSTRAINT "languages_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "languages" ADD CONSTRAINT "languages_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vehicle_translations" ADD CONSTRAINT "vehicle_translations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vehicle_translations" ADD CONSTRAINT "vehicle_translations_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "languages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vehicle_translations" ADD CONSTRAINT "vehicle_translations_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vehicle_translations" ADD CONSTRAINT "vehicle_translations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vehicle_translations" ADD CONSTRAINT "vehicle_translations_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hub_translations" ADD CONSTRAINT "hub_translations_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "languages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

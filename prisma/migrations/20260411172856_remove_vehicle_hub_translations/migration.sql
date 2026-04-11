/*
  Warnings:

  - You are about to drop the `hub_translations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `vehicle_translations` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "hub_translations" DROP CONSTRAINT "hub_translations_createdById_fkey";

-- DropForeignKey
ALTER TABLE "hub_translations" DROP CONSTRAINT "hub_translations_deletedById_fkey";

-- DropForeignKey
ALTER TABLE "hub_translations" DROP CONSTRAINT "hub_translations_hubId_fkey";

-- DropForeignKey
ALTER TABLE "hub_translations" DROP CONSTRAINT "hub_translations_languageId_fkey";

-- DropForeignKey
ALTER TABLE "hub_translations" DROP CONSTRAINT "hub_translations_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_translations" DROP CONSTRAINT "vehicle_translations_createdById_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_translations" DROP CONSTRAINT "vehicle_translations_deletedById_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_translations" DROP CONSTRAINT "vehicle_translations_languageId_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_translations" DROP CONSTRAINT "vehicle_translations_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_translations" DROP CONSTRAINT "vehicle_translations_vehicleId_fkey";

-- DropTable
DROP TABLE "hub_translations";

-- DropTable
DROP TABLE "vehicle_translations";

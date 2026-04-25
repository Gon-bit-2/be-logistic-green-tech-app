CREATE TYPE "DriverAssignmentRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DRIVER_ASSIGNMENT_REQUEST_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DRIVER_ASSIGNMENT_REQUEST_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DRIVER_ASSIGNMENT_REQUEST_REJECTED';

CREATE TABLE "driver_assignment_requests" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "driverId" INTEGER NOT NULL,
    "hubId" INTEGER NOT NULL,
    "status" "DriverAssignmentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" INTEGER,
    "reviewNote" VARCHAR(1000),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_assignment_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "driver_assignment_requests_orderId_idx" ON "driver_assignment_requests"("orderId");
CREATE INDEX "driver_assignment_requests_driverId_idx" ON "driver_assignment_requests"("driverId");
CREATE INDEX "driver_assignment_requests_hubId_idx" ON "driver_assignment_requests"("hubId");
CREATE INDEX "driver_assignment_requests_status_idx" ON "driver_assignment_requests"("status");
CREATE INDEX "driver_assignment_requests_driverId_status_idx" ON "driver_assignment_requests"("driverId", "status");
CREATE INDEX "driver_assignment_requests_hubId_status_idx" ON "driver_assignment_requests"("hubId", "status");
CREATE INDEX "driver_assignment_requests_orderId_driverId_status_idx" ON "driver_assignment_requests"("orderId", "driverId", "status");

ALTER TABLE "driver_assignment_requests"
  ADD CONSTRAINT "driver_assignment_requests_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "driver_assignment_requests"
  ADD CONSTRAINT "driver_assignment_requests_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "driver_assignment_requests"
  ADD CONSTRAINT "driver_assignment_requests_hubId_fkey"
  FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "driver_assignment_requests"
  ADD CONSTRAINT "driver_assignment_requests_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

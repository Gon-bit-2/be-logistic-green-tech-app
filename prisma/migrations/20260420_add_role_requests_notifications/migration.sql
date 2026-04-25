-- CreateEnum
CREATE TYPE "RoleRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ROLE_REQUEST_SUBMITTED', 'ROLE_REQUEST_APPROVED', 'ROLE_REQUEST_REJECTED');

-- CreateTable
CREATE TABLE "role_requests" (
    "id" SERIAL NOT NULL,
    "requesterId" INTEGER NOT NULL,
    "currentRoleId" INTEGER NOT NULL,
    "targetRoleId" INTEGER NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "status" "RoleRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" VARCHAR(1000),
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "assignedHubId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "payload" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_requests_requesterId_idx" ON "role_requests"("requesterId");

-- CreateIndex
CREATE INDEX "role_requests_status_idx" ON "role_requests"("status");

-- CreateIndex
CREATE INDEX "role_requests_targetRoleId_idx" ON "role_requests"("targetRoleId");

-- CreateIndex
CREATE INDEX "role_requests_requesterId_status_idx" ON "role_requests"("requesterId", "status");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_isRead_idx" ON "notifications"("isRead");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_currentRoleId_fkey" FOREIGN KEY ("currentRoleId") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_targetRoleId_fkey" FOREIGN KEY ("targetRoleId") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_assignedHubId_fkey" FOREIGN KEY ("assignedHubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

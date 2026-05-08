-- Realtime notifications and production observability v1.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SLA_ALERT_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SLA_ALERT_RESOLVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COD_COLLECTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COD_SETTLEMENT_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COD_SETTLEMENT_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COD_SETTLEMENT_DISPUTED';

CREATE TYPE "NotificationDeliveryChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH', 'SMS');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');

ALTER TABLE "notifications" ADD COLUMN "dedupeKey" VARCHAR(255);

CREATE TABLE "notification_preferences" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "type" "NotificationType" NOT NULL,
  "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_deliveries" (
  "id" SERIAL NOT NULL,
  "notificationId" INTEGER,
  "userId" INTEGER NOT NULL,
  "channel" "NotificationDeliveryChannel" NOT NULL DEFAULT 'IN_APP',
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" VARCHAR(1000),
  "deliveredAt" TIMESTAMP(3),
  "nextRetryAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "slow_request_logs" (
  "id" SERIAL NOT NULL,
  "requestId" VARCHAR(64),
  "method" VARCHAR(16) NOT NULL,
  "path" VARCHAR(500) NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "contentLength" VARCHAR(64),
  "userId" INTEGER,
  "userAgent" VARCHAR(255),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "slow_request_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" SERIAL NOT NULL,
  "actorUserId" INTEGER,
  "action" VARCHAR(100) NOT NULL,
  "entityType" VARCHAR(64) NOT NULL,
  "entityId" VARCHAR(64) NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_userId_dedupeKey_key" ON "notifications"("userId", "dedupeKey");
CREATE INDEX "notification_preferences_userId_idx" ON "notification_preferences"("userId");
CREATE INDEX "notification_preferences_type_idx" ON "notification_preferences"("type");
CREATE UNIQUE INDEX "notification_preferences_userId_type_key" ON "notification_preferences"("userId", "type");
CREATE INDEX "notification_deliveries_notificationId_idx" ON "notification_deliveries"("notificationId");
CREATE INDEX "notification_deliveries_userId_status_idx" ON "notification_deliveries"("userId", "status");
CREATE INDEX "notification_deliveries_channel_status_idx" ON "notification_deliveries"("channel", "status");
CREATE INDEX "notification_deliveries_createdAt_idx" ON "notification_deliveries"("createdAt");
CREATE INDEX "slow_request_logs_durationMs_idx" ON "slow_request_logs"("durationMs");
CREATE INDEX "slow_request_logs_statusCode_idx" ON "slow_request_logs"("statusCode");
CREATE INDEX "slow_request_logs_createdAt_idx" ON "slow_request_logs"("createdAt");
CREATE INDEX "slow_request_logs_userId_createdAt_idx" ON "slow_request_logs"("userId", "createdAt");
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_actorUserId_idx" ON "audit_logs"("actorUserId");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "slow_request_logs"
  ADD CONSTRAINT "slow_request_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

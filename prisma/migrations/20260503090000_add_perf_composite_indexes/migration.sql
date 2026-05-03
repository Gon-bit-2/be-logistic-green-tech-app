-- Composite indexes for the hottest filtered list queries.
-- These are additive and safe for existing API contracts.

CREATE INDEX IF NOT EXISTS "orders_deletedAt_status_currentHubId_createdAt_idx"
ON "orders"("deletedAt", "status", "currentHubId", "createdAt");

CREATE INDEX IF NOT EXISTS "trips_status_driverId_idx"
ON "trips"("status", "driverId");

CREATE INDEX IF NOT EXISTS "trips_status_vehicleId_idx"
ON "trips"("status", "vehicleId");

CREATE INDEX IF NOT EXISTS "notifications_userId_isRead_createdAt_idx"
ON "notifications"("userId", "isRead", "createdAt");

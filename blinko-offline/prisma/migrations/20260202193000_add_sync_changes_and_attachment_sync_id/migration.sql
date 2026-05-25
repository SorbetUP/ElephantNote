-- Add syncId to attachments for remote sync mapping
ALTER TABLE "attachments" ADD COLUMN "syncId" VARCHAR;

CREATE INDEX "attachments_accountId_syncId_idx" ON "attachments"("accountId", "syncId");

-- Sync changes log for local-first sync
CREATE TABLE "sync_changes" (
  "id" SERIAL PRIMARY KEY,
  "accountId" INTEGER NOT NULL,
  "entityType" VARCHAR NOT NULL,
  "entityId" VARCHAR NOT NULL,
  "op" VARCHAR NOT NULL,
  "payloadJson" TEXT NOT NULL,
  "ts" TIMESTAMPTZ(6) NOT NULL,
  "deviceId" VARCHAR NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "sync_changes_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "sync_changes_accountId_id_idx" ON "sync_changes"("accountId", "id");
CREATE INDEX "sync_changes_accountId_entityType_idx" ON "sync_changes"("accountId", "entityType");

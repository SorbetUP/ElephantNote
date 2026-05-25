-- Add sync-mode fields to server notes so /changes can materialize notes and web UI edits can emit sync ops.

ALTER TABLE "notes" ADD COLUMN     "syncId" VARCHAR;
ALTER TABLE "notes" ADD COLUMN     "syncRev" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "notes" ADD COLUMN     "syncDeviceId" VARCHAR NOT NULL DEFAULT '';
ALTER TABLE "notes" ADD COLUMN     "syncCreatedAt" TIMESTAMPTZ(6);
ALTER TABLE "notes" ADD COLUMN     "syncUpdatedAt" TIMESTAMPTZ(6);
ALTER TABLE "notes" ADD COLUMN     "syncDeletedAt" TIMESTAMPTZ(6);

CREATE INDEX "notes_accountId_syncId_idx" ON "notes"("accountId", "syncId");
CREATE UNIQUE INDEX "notes_accountId_syncId_key" ON "notes"("accountId", "syncId");

-- DropForeignKey
ALTER TABLE "sync_changes" DROP CONSTRAINT "sync_changes_accountId_fkey";

-- AddForeignKey
ALTER TABLE "sync_changes" ADD CONSTRAINT "sync_changes_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

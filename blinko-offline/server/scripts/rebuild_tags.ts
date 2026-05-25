import { prisma } from '../prisma';
import { rebuildTagsForAccount } from '../lib/sync_notes';

async function main(): Promise<void> {
  const raw = process.argv[2] ?? process.env.ACCOUNT_ID ?? '';
  const accountId = Number(raw || 1);
  if (!Number.isFinite(accountId) || accountId <= 0) {
    throw new Error(`Invalid accountId: ${raw}`);
  }

  // eslint-disable-next-line no-console
  console.log(`[rebuild_tags] accountId=${accountId}`);
  const res = await rebuildTagsForAccount(prisma, accountId);
  // eslint-disable-next-line no-console
  console.log(`[rebuild_tags] done`, res);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[rebuild_tags] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


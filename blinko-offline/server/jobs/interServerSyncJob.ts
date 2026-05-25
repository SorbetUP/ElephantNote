import { BaseScheduleJob } from "./baseScheduleJob";
import { prisma } from "../prisma";
import { runServerSyncOnce } from "../lib/serverSyncRunner";

export class InterServerSyncJob extends BaseScheduleJob {
  protected static taskName = "inter-server-sync";
  protected static cronSchedule = "*/5 * * * *"; // every 5 minutes

  protected static async RunTask() {
    return await runServerSyncOnce(prisma);
  }
}


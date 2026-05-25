import { test, expect } from "bun:test";
import express from "express";

test("POST /api/file/overwrite returns 401 without auth (does not require DB)", async () => {
  // Importing server modules constructs PrismaClient; it requires a datasource URL
  // even if the request itself does not hit the DB.
  process.env.DATABASE_URL ||= "postgresql://user:pass@127.0.0.1:5432/blinko_test?schema=public";

  const { default: overwriteRouter } = await import("../routerExpress/file/overwrite");

  const app = express();
  app.use("/api/file/overwrite", overwriteRouter);

  const server = app.listen(0);
  try {
    const { port } = server.address() as any;
    const res = await fetch(`http://127.0.0.1:${port}/api/file/overwrite`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

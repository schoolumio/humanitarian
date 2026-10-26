/** Drain due background jobs once (for local development or a non-Vercel scheduler). */
import { runDueJobs } from "../src/server/jobs";
import { db } from "../src/lib/db";

runDueJobs(100)
  .then((r) => console.log(JSON.stringify(r)))
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());

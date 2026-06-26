// Run a sync from your terminal:
//   npm run sync:local
// Loads .env, calls runSync(), prints the result. Useful for debugging
// without going through Vercel Cron.

import { config as loadEnv } from "dotenv";
loadEnv();

import { runSync } from "../lib/sync";

runSync().then((r) => {
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
});

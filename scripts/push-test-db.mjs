// Applies the schema to the dedicated test database (TEST_DATABASE_URL).
import { spawnSync } from "node:child_process";
const url = process.env.TEST_DATABASE_URL;
if (!url) { console.error("Set TEST_DATABASE_URL"); process.exit(1); }
const r = spawnSync("node", ["node_modules/drizzle-kit/bin.cjs", "push", "--force"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
process.exit(r.status ?? 1);

// Runs first on every deploy and explains missing settings in plain English instead of a cryptic build error.
const need = [
  ["DATABASE_URL", "your Neon database address (starts with postgresql://)"],
  ["ADMIN_EMAIL", "the email you will log in to /admin with"],
  ["ADMIN_PASSWORD", "the password you will log in to /admin with (10+ characters)"],
];
const missing = need.filter(([k]) => !process.env[k]);
if (missing.length) {
  console.error("\n=== SETUP INCOMPLETE ===\nAdd these in Vercel: Settings > Environment Variables, then Redeploy:\n");
  for (const [k, d] of missing) console.error(`  ${k}  -  ${d}`);
  console.error("");
  process.exit(1);
}
if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)) { console.error("\nDATABASE_URL must start with postgresql://  (copy it again from Neon > Connect)\n"); process.exit(1); }
if (/channel_binding/.test(process.env.DATABASE_URL)) { console.error("\nDATABASE_URL ends with &channel_binding=require. Delete that part so it ends with ?sslmode=require\n"); process.exit(1); }
if (process.env.ADMIN_PASSWORD.length < 10) { console.error("\nADMIN_PASSWORD must be at least 10 characters\n"); process.exit(1); }
console.log("preflight: settings look good");

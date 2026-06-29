import { promises as fs } from "node:fs";
import path from "node:path";

await loadDotEnv();

const [{ readStore }, { writeStore, testSupabaseStoreConnection }, { dataStoreStatus }] =
  await Promise.all([
    import("../src/lib/store"),
    import("../src/repositories/supabaseStore"),
    import("../src/lib/supabase/config")
  ]);

const status = dataStoreStatus();

if (status.activeProvider !== "supabase") {
  console.error(
    [
      "Supabase store is not active.",
      `requested=${status.requestedProvider}`,
      `active=${status.activeProvider}`,
      `urlConfigured=${status.supabaseUrlConfigured}`,
      `serviceRoleConfigured=${status.supabaseServiceRoleConfigured}`,
      "Set DATA_STORE_PROVIDER=supabase, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY before migrating."
    ].join("\n")
  );
  process.exit(1);
}

const connection = await testSupabaseStoreConnection();

if (!connection.ok) {
  console.error(`Supabase connection failed: ${connection.message}`);
  process.exit(1);
}

const localDb = await readStore();
process.env.SUPABASE_ALLOW_FULL_STORE_WRITE = "true";
await writeStore(localDb);

console.log(
  [
    "Migrated local store snapshot to Supabase.",
    `runs=${localDb.runs.length}`,
    `importJobs=${localDb.importJobs.length}`,
    `companies=${localDb.companies.length}`,
    `evidence=${localDb.evidence.length}`,
    `emailDrafts=${localDb.emailDrafts.length}`,
    `emailLogs=${localDb.emailLogs.length}`,
    `companyNotes=${localDb.companyNotes.length}`
  ].join("\n")
);

async function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");

  try {
    const content = await fs.readFile(envPath, "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^["']|["']$/g, "");

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // The script can still run when environment variables are supplied by the shell.
  }
}

import "dotenv/config";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  fetchAndDecrypt,
  listBackups,
  openBackupStore,
  runBackup,
  verifyBackup,
} from "@/lib/backup";
import { restoreDecryptedBackup } from "@/lib/backup/restore";

/**
 * System backup, by hand.
 *
 *   npm run backup                       take a backup now (same as the nightly job)
 *   npm run backup -- list               every stored backup, newest first
 *   npm run backup -- verify [key|file]  decrypt and check one (default: newest)
 *   npm run backup -- download <key> <file>
 *   npm run backup -- restore <key|file> --target <postgres-url> [--wipe] [--storage-dir <dir>]
 *
 * RESTORING. Create an empty database, then from the commit named in the
 * backup's manifest:
 *
 *   DIRECT_DATABASE_URL=<target> npx prisma migrate deploy
 *   npm run backup -- restore daily/rta-backup-….rtabak --target <target>
 *
 * Point DATABASE_URL at it once the restore reports success. Restoring over
 * the live database is refused unless --overwrite-live is given as well as
 * --wipe; restoring into a fresh database and switching over is safer, and
 * keeps the damaged one around to examine.
 */

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const has = (name: string) => process.argv.includes(name);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

async function newestKey(): Promise<string> {
  const [latest] = await listBackups();
  if (!latest) throw new Error("No backups in the store yet.");
  return latest.key;
}

async function main() {
  const [command = "run", ...rest] = process.argv.slice(2).filter((a) => !a.startsWith("--"));

  switch (command) {
    case "run": {
      const result = await runBackup();
      console.log(`\nBackup ${result.file} (${formatBytes(result.bytes)})`);
      console.log(`  stored in   ${result.store}`);
      console.log(`  tiers       ${result.tiers.join(", ")}`);
      console.log(`  contents    ${result.rows} rows in ${result.tables} tables, ${result.files} files`);
      if (result.deleted.length) console.log(`  aged out    ${result.deleted.join(", ")}`);
      for (const warning of result.warnings) console.warn(`\n  WARNING: ${warning}`);
      break;
    }

    case "list": {
      const store = await openBackupStore();
      const backups = await listBackups(store);
      console.log(`\n${backups.length} backups in ${store.description}\n`);
      for (const b of backups) {
        console.log(`  ${b.tier.padEnd(8)} ${b.takenAt.toISOString()}  ${formatBytes(b.size).padStart(9)}  ${b.key}`);
      }
      break;
    }

    case "verify": {
      const source = rest[0] ?? (await newestKey());
      const summary = await verifyBackup(source);
      console.log(`\nOK  ${source}`);
      console.log(`  taken       ${summary.manifest.createdAt} from ${summary.manifest.database} (Postgres ${summary.manifest.serverVersion})`);
      console.log(`  commit      ${summary.manifest.appCommit ?? "unknown"}`);
      console.log(`  schema      ${summary.manifest.migrations.length} migrations, last ${summary.manifest.migrations.at(-1) ?? "-"}`);
      console.log(`  contents    ${summary.rows} rows in ${summary.manifest.tables.length} tables, ${summary.files} files`);
      break;
    }

    case "download": {
      const [key, dest] = rest;
      if (!key || !dest) throw new Error("usage: download <key> <file>");
      await (await openBackupStore()).get(key, dest);
      console.log(`Downloaded ${key} → ${dest} (still encrypted)`);
      break;
    }

    case "restore": {
      const source = rest[0];
      const target = flag("--target");
      if (!source || !target) {
        throw new Error("usage: restore <key|file> --target <postgres-url> [--wipe] [--storage-dir <dir>]");
      }

      const live = [process.env.DATABASE_URL, process.env.DIRECT_DATABASE_URL].filter(Boolean);
      if (live.includes(target) && !(has("--wipe") && has("--overwrite-live"))) {
        throw new Error(
          "--target is this deployment's own database. Restore into a fresh database instead, or pass both --wipe and --overwrite-live if you really mean to replace it."
        );
      }

      const work = await mkdtemp(path.join(os.tmpdir(), "rta-restore-"));
      try {
        const plain = await fetchAndDecrypt(source, work);
        const result = await restoreDecryptedBackup(plain, {
          targetUrl: target,
          wipe: has("--wipe"),
          storageDir: flag("--storage-dir"),
          log: (m) => console.log(m),
        });
        console.log(
          `\nRestored ${result.rowsRestored} rows${result.filesWritten ? ` and ${result.filesWritten} files` : ""}. Every foreign key re-validated and every table count matches the backup.`
        );
      } finally {
        await rm(work, { recursive: true, force: true });
      }
      break;
    }

    default:
      throw new Error(`Unknown command "${command}". Use run, list, verify, download or restore.`);
  }
}

main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

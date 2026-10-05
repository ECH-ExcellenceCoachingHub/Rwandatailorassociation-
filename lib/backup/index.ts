import { execFileSync } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getEnv } from "@/lib/env";
import {
  decryptBackupFile,
  parseEncryptionKey,
  sha256File,
  verifyDecryptedBackup,
  writeBackupFile,
  type BackupSummary,
} from "@/lib/backup/archive";
import {
  TIERS,
  backupFileName,
  backupKey,
  dueTiers,
  expiredKeys,
  parseBackupTime,
  type Tier,
} from "@/lib/backup/schedule";
import { localStore, s3Store, type BackupStore, type StoredBackup } from "@/lib/backup/store";

/**
 * SYSTEM BACKUP.
 *
 * One run, from the worker each night or from `npm run backup`:
 *
 *   1. dump the whole database (and any files on disk) into one encrypted file
 *   2. read it back locally and check it is complete before trusting it
 *   3. upload it as today's daily, and copy it into weekly / monthly when the
 *      current week / month has none yet
 *   4. download the stored copy and check it is byte-identical — a backup that
 *      was never read back is a hope, not a backup
 *   5. delete whatever has aged out of each tier's retention window
 *
 * Retention runs only after a new backup has been stored and verified, so a
 * run that fails can never leave fewer backups behind than it found.
 */

export function databaseUrlForBackup(): string {
  // Direct, not pooled, where available: the dump holds one transaction open
  // for its whole duration.
  return process.env.DIRECT_DATABASE_URL || getEnv().DATABASE_URL;
}

export async function openBackupStore(): Promise<BackupStore> {
  const env = getEnv();
  if (env.BACKUP_DRIVER === "s3") {
    if (!env.BACKUP_S3_BUCKET || !env.BACKUP_S3_ACCESS_KEY_ID || !env.BACKUP_S3_SECRET_ACCESS_KEY) {
      throw new Error(
        "BACKUP_DRIVER=s3 requires BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID and BACKUP_S3_SECRET_ACCESS_KEY"
      );
    }
    return s3Store({
      bucket: env.BACKUP_S3_BUCKET!,
      region: env.BACKUP_S3_REGION,
      endpoint: env.BACKUP_S3_ENDPOINT,
      accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID!,
      secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY!,
      prefix: env.BACKUP_S3_PREFIX,
    });
  }
  return localStore(env.BACKUP_LOCAL_PATH);
}

function currentCommit(): string | null {
  // Render exposes the deployed commit; elsewhere ask git, if it is there.
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

export interface BackupRunResult {
  file: string;
  bytes: number;
  tiers: Tier[];
  store: string;
  tables: number;
  rows: number;
  files: number;
  deleted: string[];
  warnings: string[];
}

export async function runBackup(now: Date = new Date()): Promise<BackupRunResult> {
  const env = getEnv();
  const key = parseEncryptionKey(env.BACKUP_ENCRYPTION_KEY);
  const store = await openBackupStore();
  const warnings: string[] = [];

  if (env.NODE_ENV === "production" && env.BACKUP_DRIVER === "local") {
    warnings.push(
      "BACKUP_DRIVER=local in production: unless BACKUP_LOCAL_PATH is a persistent volume, these backups are lost with the server. Use s3."
    );
  }

  const work = await mkdtemp(path.join(os.tmpdir(), "rta-backup-"));
  try {
    const name = backupFileName(now);
    const file = path.join(work, name);

    const summary = await writeBackupFile(file, key, {
      databaseUrl: databaseUrlForBackup(),
      storageDir: env.STORAGE_LOCAL_PATH,
      appCommit: currentCommit(),
    });

    // Prove the file decrypts and is complete before anything is uploaded.
    const plain = path.join(work, "check.gz");
    await decryptBackupFile(file, key, plain);
    await verifyDecryptedBackup(plain);
    await rm(plain);

    const { size } = await stat(file);
    const checksum = await sha256File(file);

    const tiers = dueTiers(
      {
        weekly: (await store.list("weekly/")).map((b) => b.key),
        monthly: (await store.list("monthly/")).map((b) => b.key),
      },
      now
    );

    const primary = backupKey("daily", now);
    await store.put(file, primary);
    for (const tier of tiers) {
      if (tier !== "daily") await store.copy(primary, backupKey(tier, now));
    }

    // Read every stored copy back and compare it with what was written.
    for (const tier of tiers) {
      const copy = path.join(work, `stored-${tier}`);
      await store.get(backupKey(tier, now), copy);
      if ((await sha256File(copy)) !== checksum) {
        throw new Error(`Stored ${tier} backup does not match the file that was uploaded`);
      }
      await rm(copy);
    }

    const keep = {
      daily: env.BACKUP_KEEP_DAILY,
      weekly: env.BACKUP_KEEP_WEEKLY,
      monthly: env.BACKUP_KEEP_MONTHLY,
    };
    const deleted: string[] = [];
    for (const tier of TIERS) {
      const keys = (await store.list(`${tier}/`)).map((b) => b.key);
      for (const expired of expiredKeys(keys, tier, keep[tier])) {
        await store.remove(expired);
        deleted.push(expired);
      }
    }

    return {
      file: name,
      bytes: size,
      tiers,
      store: store.description,
      tables: summary.manifest.tables.length,
      rows: summary.rows,
      files: summary.files,
      deleted,
      warnings,
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export interface ListedBackup extends StoredBackup {
  tier: Tier;
  takenAt: Date;
}

/** Every backup in the store, newest first. */
export async function listBackups(store?: BackupStore): Promise<ListedBackup[]> {
  const s = store ?? (await openBackupStore());
  const all: ListedBackup[] = [];
  for (const tier of TIERS) {
    for (const item of await s.list(`${tier}/`)) {
      const takenAt = parseBackupTime(item.key);
      if (takenAt) all.push({ ...item, tier, takenAt });
    }
  }
  return all.sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime());
}

/**
 * Fetches a backup (a store key, or a path to a local .rtabak file), decrypts
 * it into `workDir`, and returns the path of the decrypted, gzipped layout.
 */
export async function fetchAndDecrypt(source: string, workDir: string): Promise<string> {
  const key = parseEncryptionKey(getEnv().BACKUP_ENCRYPTION_KEY);

  let encrypted = source;
  const isLocalFile = await stat(source).then((s) => s.isFile()).catch(() => false);
  if (!isLocalFile) {
    encrypted = path.join(workDir, path.basename(source));
    await (await openBackupStore()).get(source, encrypted);
  }

  const plain = path.join(workDir, "backup.gz");
  await decryptBackupFile(encrypted, key, plain);
  return plain;
}

export async function verifyBackup(source: string): Promise<BackupSummary> {
  const work = await mkdtemp(path.join(os.tmpdir(), "rta-verify-"));
  try {
    return await verifyDecryptedBackup(await fetchAndDecrypt(source, work));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

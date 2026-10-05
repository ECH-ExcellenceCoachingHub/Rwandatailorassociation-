import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import pg from "pg";

/**
 * THE BACKUP FILE: ONE CONSISTENT SNAPSHOT OF THE WHOLE SYSTEM, ENCRYPTED.
 *
 * Why not pg_dump: pg_dump refuses to dump a server newer than itself, and the
 * production database (Neon) runs a newer Postgres than the client shipped by
 * Debian or installed on a typical developer machine. A backup that silently
 * stops working the day the provider upgrades is not a backup. This format
 * needs nothing but the `pg` driver the app already uses.
 *
 * WHAT IS IN IT. Every table in the schema, row by row, read inside a single
 * REPEATABLE READ transaction, so the whole file is the database as it stood
 * at one instant — a payment can never appear in the ledger but not in the
 * account it credited. Photographs and other binary columns are rows like any
 * other. Anything under STORAGE_LOCAL_PATH is included after the tables.
 *
 * Rows are written as Postgres's own `row_to_json` text and restored with
 * `json_populate_recordset`, so a value never passes through a JavaScript
 * number. Money stays exact to the last digit.
 *
 * LAYOUT, before compression:
 *
 *     RTA-BACKUP 1
 *     @manifest {...}
 *     @table "users"
 *     {"id":"...",...}          ← one line per row
 *     @end {"table":"users","rows":123}
 *     @sequences [...]
 *     @file {"path":"a/b.pdf","size":10,"sha256":"..."}
 *     <base64 of the file>
 *     @done {"tables":{"users":123,...},"files":1}
 *
 * A file without its `@done` line was cut short and is rejected.
 *
 * ON DISK: "RTABAK01" | 12-byte IV | AES-256-GCM(gzip(layout)) | 16-byte tag.
 * The tag authenticates everything, so a truncated, corrupted or tampered file
 * fails to decrypt instead of restoring something subtly wrong.
 */

const MAGIC = Buffer.from("RTABAK01", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_LINE = "RTA-BACKUP 1";
const FETCH_ROWS = 500;

export interface BackupManifest {
  format: 1;
  createdAt: string;
  database: string;
  serverVersion: string;
  /** The app commit that took the backup. Restore with the same schema. */
  appCommit: string | null;
  /** Applied Prisma migrations at backup time — the schema the rows fit. */
  migrations: string[];
  tables: string[];
}

export interface SequenceValue {
  name: string;
  lastValue: string | null;
}

export interface BackupSummary {
  manifest: BackupManifest;
  tables: Record<string, number>;
  rows: number;
  files: number;
  sequences: SequenceValue[];
}

export type BackupEvent =
  | { kind: "manifest"; manifest: BackupManifest }
  | { kind: "table"; table: string }
  | { kind: "row"; table: string; json: string }
  | { kind: "end"; table: string; rows: number }
  | { kind: "sequences"; sequences: SequenceValue[] }
  | { kind: "file"; path: string; size: number; sha256: string; data: Buffer }
  | { kind: "done"; tables: Record<string, number>; files: number };

/**
 * Decodes BACKUP_ENCRYPTION_KEY: 32 bytes, as base64 or 64 hex characters.
 * Generate one with:
 *
 *     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
export function parseEncryptionKey(value: string | undefined): Buffer {
  if (!value) {
    throw new Error(
      "BACKUP_ENCRYPTION_KEY is not set. Backups hold every member's personal and financial records and are never written unencrypted. " +
        `Generate a key with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }

  const trimmed = value.trim();
  const key = /^[0-9a-f]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");

  if (key.length !== 32) {
    throw new Error("BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 or hex)");
  }
  return key;
}

/** SHA-256 of a file's bytes, for checking an uploaded copy matches the original. */
export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

/**
 * Writes lines through gzip and AES-256-GCM into `file`, framing the output
 * with the magic, IV and auth tag.
 */
function openEncryptedWriter(file: string, key: Buffer) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const gzip = createGzip({ level: 6 });

  async function* frame(source: AsyncIterable<Buffer>) {
    yield Buffer.concat([MAGIC, iv]);
    for await (const chunk of source) yield chunk;
    // The cipher has finalised by the time its output is exhausted.
    yield cipher.getAuthTag();
  }

  let failure: unknown = null;
  const done = pipeline(gzip, cipher, frame, createWriteStream(file)).catch((error) => {
    failure = error;
    throw error;
  });
  // Surfaced through write()/close(); this only stops an unhandled rejection
  // if the caller bails out before reaching either.
  done.catch(() => {});

  return {
    async write(line: string) {
      if (failure) throw failure;
      if (!gzip.write(line + "\n")) {
        await Promise.race([new Promise((resolve) => gzip.once("drain", resolve)), done]);
      }
    },
    async close() {
      gzip.end();
      await done;
    },
  };
}

async function listFiles(root: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) found.push(full);
    }
  }

  try {
    await walk(root);
  } catch (error) {
    // No storage directory yet simply means nothing has been uploaded to disk.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return found.sort();
}

/**
 * Dumps the database at `databaseUrl` (and `storageDir`, if any) into an
 * encrypted backup at `file`.
 */
export async function writeBackupFile(
  file: string,
  key: Buffer,
  options: { databaseUrl: string; storageDir?: string; appCommit: string | null }
): Promise<BackupSummary> {
  const client = new pg.Client({ connectionString: options.databaseUrl });
  await client.connect();

  const writer = openEncryptedWriter(file, key);

  try {
    // One snapshot for every table. READ ONLY so a bug here can never write.
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

    const info = await client.query<{ database: string; version: string }>(
      "SELECT current_database() AS database, current_setting('server_version') AS version"
    );
    const tableRows = await client.query<{ name: string }>(
      `SELECT table_name AS name FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
        ORDER BY table_name`
    );
    const tables = tableRows.rows.map((r) => r.name);

    const migrations = tables.includes("_prisma_migrations")
      ? (
          await client.query<{ name: string }>(
            `SELECT migration_name AS name FROM _prisma_migrations
              WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
              ORDER BY migration_name`
          )
        ).rows.map((r) => r.name)
      : [];

    const manifest: BackupManifest = {
      format: 1,
      createdAt: new Date().toISOString(),
      database: info.rows[0].database,
      serverVersion: info.rows[0].version,
      appCommit: options.appCommit,
      migrations,
      tables,
    };

    await writer.write(HEADER_LINE);
    await writer.write(`@manifest ${JSON.stringify(manifest)}`);

    const counts: Record<string, number> = {};
    let total = 0;

    for (const table of tables) {
      await writer.write(`@table ${JSON.stringify(table)}`);
      await client.query(
        `DECLARE backup_rows NO SCROLL CURSOR FOR
           SELECT row_to_json(t)::text AS r FROM ${client.escapeIdentifier(table)} t`
      );

      let rows = 0;
      for (;;) {
        const batch = await client.query<{ r: string }>(`FETCH ${FETCH_ROWS} FROM backup_rows`);
        for (const row of batch.rows) await writer.write(row.r);
        rows += batch.rows.length;
        if (batch.rows.length < FETCH_ROWS) break;
      }

      await client.query("CLOSE backup_rows");
      await writer.write(`@end ${JSON.stringify({ table, rows })}`);
      counts[table] = rows;
      total += rows;
    }

    const sequences = (
      await client.query<{ name: string; lastValue: string | null }>(
        `SELECT sequencename AS name, last_value::text AS "lastValue"
           FROM pg_sequences WHERE schemaname = current_schema() ORDER BY sequencename`
      )
    ).rows;
    await writer.write(`@sequences ${JSON.stringify(sequences)}`);

    await client.query("COMMIT");

    const files = options.storageDir ? await listFiles(options.storageDir) : [];
    for (const full of files) {
      const data = await readFile(full);
      const meta = {
        path: path.relative(options.storageDir!, full).split(path.sep).join("/"),
        size: data.length,
        sha256: createHash("sha256").update(data).digest("hex"),
      };
      await writer.write(`@file ${JSON.stringify(meta)}`);
      await writer.write(data.toString("base64"));
    }

    await writer.write(`@done ${JSON.stringify({ tables: counts, files: files.length })}`);
    await writer.close();

    return { manifest, tables: counts, rows: total, files: files.length, sequences };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    await writer.close().catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Decrypts `file` into `plainGzFile`, which then holds the gzipped layout.
 * Throws — and leaves nothing trustworthy behind — if the auth tag does not
 * match: wrong key, truncated upload, bit rot or tampering all end here.
 */
export async function decryptBackupFile(file: string, key: Buffer, plainGzFile: string) {
  const { size } = await stat(file);
  if (size < MAGIC.length + IV_BYTES + TAG_BYTES) {
    throw new Error(`${path.basename(file)} is too small to be a backup`);
  }

  const handle = await open(file, "r");
  const header = Buffer.alloc(MAGIC.length + IV_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    await handle.read(header, 0, header.length, 0);
    await handle.read(tag, 0, TAG_BYTES, size - TAG_BYTES);
  } finally {
    await handle.close();
  }

  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error(`${path.basename(file)} is not an RTA backup file`);
  }

  const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(MAGIC.length));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);

  try {
    await pipeline(
      createReadStream(file, { start: header.length, end: size - TAG_BYTES - 1 }),
      decipher,
      createWriteStream(plainGzFile)
    );
  } catch (error) {
    throw new Error(
      `${path.basename(file)} failed authentication — wrong BACKUP_ENCRYPTION_KEY, or the file is corrupt or incomplete (${
        error instanceof Error ? error.message : String(error)
      })`
    );
  }
}

/** Reads a decrypted backup (from decryptBackupFile) as a stream of events. */
export async function* readBackupEvents(plainGzFile: string): AsyncGenerator<BackupEvent> {
  const lines = createInterface({
    input: createReadStream(plainGzFile).pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  let first = true;
  let table: string | null = null;
  let pendingFile: { path: string; size: number; sha256: string } | null = null;

  for await (const line of lines) {
    if (first) {
      if (line !== HEADER_LINE) throw new Error(`Unsupported backup format: ${line.slice(0, 40)}`);
      first = false;
      continue;
    }

    if (pendingFile) {
      yield { kind: "file", ...pendingFile, data: Buffer.from(line, "base64") };
      pendingFile = null;
      continue;
    }

    if (table !== null && line.startsWith("{")) {
      yield { kind: "row", table, json: line };
      continue;
    }

    const space = line.indexOf(" ");
    const tag = space === -1 ? line : line.slice(0, space);
    const body = space === -1 ? "" : line.slice(space + 1);

    switch (tag) {
      case "@manifest":
        yield { kind: "manifest", manifest: JSON.parse(body) };
        break;
      case "@table":
        table = JSON.parse(body);
        yield { kind: "table", table: table! };
        break;
      case "@end": {
        const end = JSON.parse(body) as { table: string; rows: number };
        table = null;
        yield { kind: "end", ...end };
        break;
      }
      case "@sequences":
        yield { kind: "sequences", sequences: JSON.parse(body) };
        break;
      case "@file":
        pendingFile = JSON.parse(body);
        break;
      case "@done":
        yield { kind: "done", ...JSON.parse(body) };
        break;
      default:
        throw new Error(`Unexpected line in backup: ${line.slice(0, 60)}`);
    }
  }
}

/**
 * Reads a whole decrypted backup and checks it is complete and self-consistent:
 * every table's row count matches its trailer, every file matches its
 * checksum, and the `@done` line is present.
 */
export async function verifyDecryptedBackup(plainGzFile: string): Promise<BackupSummary> {
  let manifest: BackupManifest | null = null;
  let sequences: SequenceValue[] = [];
  let current: { table: string; rows: number } | null = null;
  const tables: Record<string, number> = {};
  let files = 0;
  let done: { tables: Record<string, number>; files: number } | null = null;

  for await (const event of readBackupEvents(plainGzFile)) {
    switch (event.kind) {
      case "manifest":
        manifest = event.manifest;
        break;
      case "table":
        current = { table: event.table, rows: 0 };
        break;
      case "row":
        current!.rows++;
        break;
      case "end":
        if (!current || current.table !== event.table || current.rows !== event.rows) {
          throw new Error(
            `Table ${event.table}: trailer says ${event.rows} rows, file holds ${current?.rows ?? 0}`
          );
        }
        tables[event.table] = event.rows;
        current = null;
        break;
      case "sequences":
        sequences = event.sequences;
        break;
      case "file": {
        const actual = createHash("sha256").update(event.data).digest("hex");
        if (actual !== event.sha256 || event.data.length !== event.size) {
          throw new Error(`Stored file ${event.path} does not match its checksum`);
        }
        files++;
        break;
      }
      case "done":
        done = { tables: event.tables, files: event.files };
        break;
    }
  }

  if (!manifest) throw new Error("Backup has no manifest");
  if (!done) throw new Error("Backup is incomplete — it ends before its @done line");

  const missing = manifest.tables.filter((t) => tables[t] !== done!.tables[t]);
  if (missing.length > 0 || files !== done.files) {
    throw new Error(`Backup contents do not match its summary (tables: ${missing.join(", ") || "ok"})`);
  }

  const rows = Object.values(tables).reduce((sum, n) => sum + n, 0);
  return { manifest, tables, rows, files, sequences };
}

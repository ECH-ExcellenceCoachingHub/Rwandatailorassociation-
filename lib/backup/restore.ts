import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { readBackupEvents, verifyDecryptedBackup, type BackupSummary } from "@/lib/backup/archive";

/**
 * PUTS A BACKUP BACK.
 *
 * The target must already have the schema the backup was taken under — create
 * an empty database, run `prisma migrate deploy` against it from the commit
 * named in the manifest, then restore. The migration lists are compared
 * exactly; restoring rows into a different schema is refused rather than
 * attempted, because columns that moved would land as NULLs without a sound.
 *
 * The backup is read through once in full before the target is touched, so a
 * corrupt file fails without leaving a half-restored database. The load itself
 * is one transaction: it either all lands or none of it does.
 *
 * Foreign keys are dropped for the load and re-added at the end — which
 * re-validates every one of them, so the restored data is proven to hang
 * together — rather than ordering tables by dependency, which the schema's
 * self-references would defeat.
 */

const MIGRATIONS_TABLE = "_prisma_migrations";
const BATCH_ROWS = 500;
const BATCH_CHARS = 8 * 1024 * 1024;

export interface RestoreOptions {
  targetUrl: string;
  /** Empty every table in the target first. Without it a non-empty target is refused. */
  wipe?: boolean;
  /** Where to write stored files. Without it they are counted but not written. */
  storageDir?: string;
  log?: (message: string) => void;
}

export interface RestoreResult {
  summary: BackupSummary;
  rowsRestored: number;
  filesWritten: number;
}

export async function restoreDecryptedBackup(
  plainGzFile: string,
  options: RestoreOptions
): Promise<RestoreResult> {
  const log = options.log ?? (() => {});

  log("Verifying backup contents…");
  const summary = await verifyDecryptedBackup(plainGzFile);
  const { manifest } = summary;
  log(
    `Backup of ${manifest.database} taken ${manifest.createdAt}: ${summary.rows} rows in ${manifest.tables.length} tables, ${summary.files} files`
  );

  const client = new pg.Client({ connectionString: options.targetUrl });
  await client.connect();
  const ident = (name: string) => client.escapeIdentifier(name);

  try {
    const targetTables = new Set(
      (
        await client.query<{ name: string }>(
          `SELECT table_name AS name FROM information_schema.tables
            WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`
        )
      ).rows.map((r) => r.name)
    );

    if (!targetTables.has(MIGRATIONS_TABLE)) {
      throw new Error(
        "Target has no schema. Run `npx prisma migrate deploy` against it first" +
          (manifest.appCommit ? `, from commit ${manifest.appCommit}.` : ".")
      );
    }

    const targetMigrations = (
      await client.query<{ name: string }>(
        `SELECT migration_name AS name FROM ${MIGRATIONS_TABLE}
          WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
          ORDER BY migration_name`
      )
    ).rows.map((r) => r.name);

    const onlyInBackup = manifest.migrations.filter((m) => !targetMigrations.includes(m));
    const onlyInTarget = targetMigrations.filter((m) => !manifest.migrations.includes(m));
    if (onlyInBackup.length > 0 || onlyInTarget.length > 0) {
      throw new Error(
        "Target schema does not match the backup.\n" +
          (onlyInBackup.length ? `  missing in target: ${onlyInBackup.join(", ")}\n` : "") +
          (onlyInTarget.length ? `  not in backup:     ${onlyInTarget.join(", ")}\n` : "") +
          `Migrate the target from commit ${manifest.appCommit ?? "(unknown)"} — the code that took this backup.`
      );
    }

    const dataTables = manifest.tables.filter((t) => t !== MIGRATIONS_TABLE);
    const absent = dataTables.filter((t) => !targetTables.has(t));
    if (absent.length > 0) throw new Error(`Target is missing tables: ${absent.join(", ")}`);

    if (!options.wipe) {
      const occupied: string[] = [];
      for (const table of targetTables) {
        if (table === MIGRATIONS_TABLE) continue;
        const { rows } = await client.query<{ any: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM ${ident(table)}) AS any`
        );
        if (rows[0].any) occupied.push(table);
      }
      if (occupied.length > 0) {
        throw new Error(
          `Target already holds data (${occupied.slice(0, 5).join(", ")}${occupied.length > 5 ? ", …" : ""}). ` +
            "Restore into an empty database, or pass --wipe to empty this one first."
        );
      }
    }

    await client.query("BEGIN");

    if (options.wipe) {
      const all = [...targetTables].filter((t) => t !== MIGRATIONS_TABLE);
      if (all.length > 0) {
        log(`Emptying ${all.length} tables in the target…`);
        await client.query(`TRUNCATE ${all.map(ident).join(", ")}`);
      }
    }

    const foreignKeys = (
      await client.query<{ table: string; name: string; definition: string }>(
        `SELECT conrelid::regclass::text AS table, conname AS name,
                pg_get_constraintdef(oid) AS definition
           FROM pg_constraint
          WHERE contype = 'f' AND connamespace = current_schema()::regnamespace`
      )
    ).rows;
    for (const fk of foreignKeys) {
      await client.query(`ALTER TABLE ${fk.table} DROP CONSTRAINT ${ident(fk.name)}`);
    }

    let rowsRestored = 0;
    let filesWritten = 0;
    let batch: string[] = [];
    let batchChars = 0;
    let currentTable: string | null = null;

    const flush = async () => {
      if (!currentTable || batch.length === 0) return;
      const target = ident(currentTable);
      await client.query(
        `INSERT INTO ${target} SELECT * FROM json_populate_recordset(NULL::${target}, $1::json)`,
        [`[${batch.join(",")}]`]
      );
      rowsRestored += batch.length;
      batch = [];
      batchChars = 0;
    };

    for await (const event of readBackupEvents(plainGzFile)) {
      switch (event.kind) {
        case "table":
          // Prisma's own bookkeeping was written by `migrate deploy`.
          currentTable = event.table === MIGRATIONS_TABLE ? null : event.table;
          break;
        case "row":
          if (!currentTable) break;
          batch.push(event.json);
          batchChars += event.json.length;
          if (batch.length >= BATCH_ROWS || batchChars >= BATCH_CHARS) await flush();
          break;
        case "end":
          await flush();
          if (currentTable) log(`  ${currentTable}: ${event.rows}`);
          currentTable = null;
          break;
        case "sequences":
          for (const seq of event.sequences) {
            if (seq.lastValue === null) continue;
            await client.query("SELECT setval(quote_ident($1), $2::bigint)", [seq.name, seq.lastValue]);
          }
          break;
        case "file":
          if (options.storageDir) {
            const dest = path.join(options.storageDir, ...event.path.split("/"));
            const root = path.resolve(options.storageDir);
            // A crafted path must not climb out of the storage directory.
            if (!path.resolve(dest).startsWith(root + path.sep)) {
              throw new Error(`Refusing to write stored file outside storage: ${event.path}`);
            }
            await mkdir(path.dirname(dest), { recursive: true });
            await writeFile(dest, event.data);
            filesWritten++;
          }
          break;
      }
    }

    log(`Re-adding and validating ${foreignKeys.length} foreign keys…`);
    for (const fk of foreignKeys) {
      await client.query(`ALTER TABLE ${fk.table} ADD CONSTRAINT ${ident(fk.name)} ${fk.definition}`);
    }

    for (const table of dataTables) {
      const { rows } = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${ident(table)}`);
      if (Number(rows[0].n) !== summary.tables[table]) {
        throw new Error(`${table}: restored ${rows[0].n} rows, backup holds ${summary.tables[table]}`);
      }
    }

    await client.query("COMMIT");
    return { summary, rowsRestored, filesWritten };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

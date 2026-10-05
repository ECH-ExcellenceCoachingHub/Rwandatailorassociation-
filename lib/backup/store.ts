import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * WHERE BACKUPS LIVE.
 *
 *   local — a directory. Fine on a machine with a disk that outlives the
 *           process (a VPS, a mounted volume, the office PC). USELESS on a
 *           host with an ephemeral filesystem such as a plain Render service:
 *           the backups vanish on the next deploy, along with the server.
 *   s3    — any S3-compatible bucket: AWS S3, Cloudflare R2, Backblaze B2,
 *           Wasabi, MinIO. Off-site, which is the point of a backup.
 *
 * Keys are `<tier>/<file>`; the S3 store prepends its configured prefix.
 */

export interface StoredBackup {
  key: string;
  size: number;
}

export interface BackupStore {
  readonly description: string;
  put(localFile: string, key: string): Promise<void>;
  get(key: string, localFile: string): Promise<void>;
  copy(fromKey: string, toKey: string): Promise<void>;
  list(prefix: string): Promise<StoredBackup[]>;
  remove(key: string): Promise<void>;
}

export function localStore(root: string): BackupStore {
  const resolved = path.resolve(root);
  const full = (key: string) => path.join(resolved, ...key.split("/"));

  return {
    description: `local directory ${resolved}`,

    async put(localFile, key) {
      await mkdir(path.dirname(full(key)), { recursive: true });
      // Copy under a temporary name, then rename: a crash mid-copy must not
      // leave a half-written file under a real backup's name.
      const partial = `${full(key)}.partial`;
      await copyFile(localFile, partial);
      await rename(partial, full(key));
    },

    async get(key, localFile) {
      await copyFile(full(key), localFile);
    },

    async copy(fromKey, toKey) {
      await this.put(full(fromKey), toKey);
    },

    async list(prefix) {
      const dir = full(prefix.replace(/\/$/, ""));
      let names: string[];
      try {
        names = await readdir(dir);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }

      const found: StoredBackup[] = [];
      for (const name of names.sort()) {
        if (name.endsWith(".partial")) continue;
        const info = await stat(path.join(dir, name));
        if (info.isFile()) found.push({ key: `${prefix.replace(/\/$/, "")}/${name}`, size: info.size });
      }
      return found;
    },

    async remove(key) {
      await rm(full(key), { force: true });
    },
  };
}

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
}

export async function s3Store(config: S3Config): Promise<BackupStore> {
  // Loaded only when S3 is configured, so a local-disk setup never pays for it.
  const {
    S3Client,
    GetObjectCommand,
    CopyObjectCommand,
    ListObjectsV2Command,
    DeleteObjectCommand,
  } = await import("@aws-sdk/client-s3");
  const { Upload } = await import("@aws-sdk/lib-storage");

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    // R2, B2 and MinIO expect bucket-in-path addressing.
    forcePathStyle: Boolean(config.endpoint),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const prefix = config.prefix ? config.prefix.replace(/\/?$/, "/") : "";
  const full = (key: string) => `${prefix}${key}`;

  return {
    description: `s3://${config.bucket}/${prefix}${config.endpoint ? ` at ${config.endpoint}` : ""}`,

    async put(localFile, key) {
      // Multipart, streamed: a backup is never held in memory whole.
      await new Upload({
        client,
        params: {
          Bucket: config.bucket,
          Key: full(key),
          Body: createReadStream(localFile),
          ContentType: "application/octet-stream",
        },
      }).done();
    },

    async get(key, localFile) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: full(key) })
      );
      if (!result.Body) throw new Error(`Empty response downloading ${key}`);
      await pipeline(result.Body as Readable, createWriteStream(localFile));
    },

    async copy(fromKey, toKey) {
      await client.send(
        new CopyObjectCommand({
          Bucket: config.bucket,
          CopySource: encodeURI(`${config.bucket}/${full(fromKey)}`),
          Key: full(toKey),
        })
      );
    },

    async list(listPrefix) {
      const found: StoredBackup[] = [];
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: full(listPrefix),
            ContinuationToken: token,
          })
        );
        for (const object of page.Contents ?? []) {
          if (!object.Key) continue;
          found.push({ key: object.Key.slice(prefix.length), size: object.Size ?? 0 });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return found.sort((a, b) => a.key.localeCompare(b.key));
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: full(key) }));
    },
  };
}

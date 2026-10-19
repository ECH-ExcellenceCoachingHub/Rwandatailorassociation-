import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/lib/env";
import { nanoid } from "nanoid";

/**
 * WHERE EVIDENCE DOCUMENTS LIVE.
 *
 *   local — a directory under STORAGE_LOCAL_PATH. Fine on a host whose disk
 *           outlives the process.
 *   s3    — any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2,
 *           Wasabi, MinIO). Off-site, so evidence survives a deploy.
 *
 * Keys are `documents/<associationId>/<random>/<originalFileName>` so that
 * two uploads can never collide and a compromised key only reveals one file.
 * Access is brokered by an authorised route handler — documents are never
 * directly fetchable by URL.
 */

export interface StoredDocument {
  key: string;
  size: number;
  mimeType: string;
  originalName: string;
  /// The file bytes. Populated by `get`; never by `list` (which is
  /// lightweight). Callers that only need metadata should ignore it.
  buffer?: Buffer | Uint8Array;
}

export interface DocumentStore {
  readonly description: string;
  /** Store a document buffer. Returns the storage key under which it lives. */
  put(buffer: Buffer, mimeType: string, originalName: string): Promise<string>;
  /** Retrieve a document by key. */
  get(key: string): Promise<StoredDocument | null>;
  /** Delete a document by key. */
  remove(key: string): Promise<void>;
  /** List documents under a prefix (most recent first). */
  list(prefix: string): Promise<StoredDocument[]>;
}

function nowKeySegment(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

export function localDocumentStore(root: string): DocumentStore {
  const resolved = path.resolve(root);
  const full = (key: string) => path.join(resolved, ...key.split("/"));

  return {
    description: `local directory ${resolved}`,

    async put(buffer, mimeType, originalName) {
      const safeName = originalName.replace(/[^A-Za-z0-9._-]/g, "_");
      const key = `documents/${nowKeySegment()}/${nanoid(8)}/${safeName}`;
      await mkdir(path.dirname(full(key)), { recursive: true });
      const partial = `${full(key)}.partial`;
      await writeFile(partial, buffer);
      await rename(partial, full(key));
      return key;
    },

    async get(key) {
      const file = full(key);
      let info;
      try {
        info = await stat(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      if (!info.isFile()) return null;
      const buffer = await readFile(file);
      const originalName = key.split("/").pop() ?? key;
      const mimeType = mimeFor(originalName);
      return { key, size: info.size, mimeType, originalName, buffer };
    },

    async remove(key) {
      await rm(full(key), { force: true });
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

      const found: StoredDocument[] = [];
      for (const name of names.sort().reverse()) {
        if (name.endsWith(".partial")) continue;
        const info = await stat(path.join(dir, name));
        if (info.isFile()) {
          found.push({
            key: `${prefix.replace(/\/$/, "")}/${name}`,
            size: info.size,
            mimeType: mimeFor(name),
            originalName: name,
          });
        }
      }
      return found;
    },
  };
}

function mimeFor(name: string): string {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".csv":
      return "text/csv";
    default:
      return "application/octet-stream";
  }
}

export interface S3DocumentConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
}

export async function s3DocumentStore(config: S3DocumentConfig): Promise<DocumentStore> {
  // Loaded only when S3 is configured, so a local-disk setup never pays for it.
  const { S3Client, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } =
    await import("@aws-sdk/client-s3");
  const { Upload } = await import("@aws-sdk/lib-storage");

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: Boolean(config.endpoint),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const s3Prefix = config.prefix ? config.prefix.replace(/\/?$/, "/") : "";
  const full = (key: string) => `${s3Prefix}${key}`;

  return {
    description: `s3://${config.bucket}/${s3Prefix}${config.endpoint ? ` at ${config.endpoint}` : ""}`,

    async put(buffer, mimeType, originalName) {
      const safeName = originalName.replace(/[^A-Za-z0-9._-]/g, "_");
      const key = `documents/${nowKeySegment()}/${nanoid(8)}/${safeName}`;
      await new Upload({
        client,
        params: {
          Bucket: config.bucket,
          Key: full(key),
          Body: buffer,
          ContentType: mimeType,
        },
      }).done();
      return key;
    },

    async get(key) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: full(key) })
      );
      if (!result.Body) return null;
      const chunks: Buffer[] = [];
      for await (const chunk of result.Body as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const originalName = key.split("/").pop() ?? key;
      const mimeType = result.ContentType ?? mimeFor(originalName);
      return {
        key,
        size: buffer.length,
        mimeType,
        originalName,
        buffer,
      };
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: full(key) }));
    },

    async list(listPrefix) {
      const found: StoredDocument[] = [];
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
          found.push({
            key: object.Key.slice(s3Prefix.length),
            size: object.Size ?? 0,
            mimeType: mimeFor(object.Key.split("/").pop() ?? ""),
            originalName: object.Key.split("/").pop() ?? "",
          });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return found.sort((a, b) => b.key.localeCompare(a.key));
    },
  };
}

/** Build the document store from server env. Local by default; S3 when configured. */
export async function documentStore(): Promise<DocumentStore> {
  const env = getEnv();
  if (env.STORAGE_DRIVER === "s3") {
    return s3DocumentStore({
      bucket: env.STORAGE_S3_BUCKET!,
      region: env.STORAGE_S3_REGION,
      endpoint: env.STORAGE_S3_ENDPOINT,
      accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID!,
      secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY!,
      prefix: env.STORAGE_S3_PREFIX,
    });
  }
  return localDocumentStore(env.STORAGE_LOCAL_PATH);
}

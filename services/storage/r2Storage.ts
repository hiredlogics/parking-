import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  buildStorageKey,
  SIGNED_URL_TTL_SECONDS,
  type PutInput,
  type StorageProvider,
  type StoredObject,
  type StoredObjectMeta,
} from "./types";

/**
 * Cloudflare R2 (S3-compatible) object storage.
 *
 * The bucket must stay PRIVATE. Nothing here makes an object public;
 * downloads go through a short-lived presigned URL issued only after
 * the API layer has verified case ownership.
 *
 * Any S3-compatible endpoint works — set S3_ENDPOINT instead of the R2
 * variables and this provider is unchanged.
 */
export class R2StorageProvider implements StorageProvider {
  readonly id = "r2";
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: R2Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // R2 requires path-style addressing.
      forcePathStyle: true,
    });
  }

  async put(input: PutInput): Promise<StoredObjectMeta> {
    const storageKey = buildStorageKey({
      namespace: input.namespace,
      fileName: input.fileName,
    });
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const uploadedAt = new Date().toISOString();

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: input.bytes,
        ContentType: input.mimeType,
        ChecksumSHA256: Buffer.from(sha256, "hex").toString("base64"),
        // Original filename and hash travel with the object so the
        // bucket is still meaningful without the database.
        Metadata: {
          originalname: encodeURIComponent(input.fileName),
          sha256,
          uploadedat: uploadedAt,
        },
      }),
    );

    return {
      storageKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      sha256,
      uploadedAt,
    };
  }

  async get(storageKey: string): Promise<StoredObject | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      if (!res.Body) return null;
      const bytes = new Uint8Array(
        await res.Body.transformToByteArray(),
      );
      return {
        ...metaFromHeaders(storageKey, res.Metadata, res.ContentType, bytes.byteLength),
        bytes,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async head(storageKey: string): Promise<StoredObjectMeta | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      return metaFromHeaders(
        storageKey,
        res.Metadata,
        res.ContentType,
        res.ContentLength ?? 0,
      );
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
  }

  async signedUrl(
    storageKey: string,
    opts: { expiresInSeconds?: number; downloadName?: string } = {},
  ): Promise<string | null> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      // Force a download with the original filename rather than the key.
      ResponseContentDisposition: opts.downloadName
        ? `attachment; filename="${opts.downloadName.replace(/"/g, "")}"`
        : undefined,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: opts.expiresInSeconds ?? SIGNED_URL_TTL_SECONDS,
    });
  }
}

export interface R2Config {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/**
 * Read R2 configuration from the environment.
 *
 * Returns null when storage is not configured, so the factory can fall
 * back to memory rather than crashing a local dev server.
 */
export type StorageEnv = Record<string, string | undefined>;

export function readR2Config(env: StorageEnv = process.env): R2Config | null {
  const bucket = env.R2_BUCKET?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const endpoint =
    env.R2_ENDPOINT?.trim() ||
    env.S3_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) return null;

  return {
    bucket,
    endpoint,
    accessKeyId,
    secretAccessKey,
    // R2 ignores region but the SDK requires one.
    region: env.R2_REGION?.trim() || "auto",
  };
}

/** Which config values are missing, for a precise error message. */
export function missingR2Vars(env: StorageEnv = process.env): string[] {
  const missing: string[] = [];
  if (!env.R2_BUCKET?.trim()) missing.push("R2_BUCKET");
  if (!env.R2_ACCESS_KEY_ID?.trim()) missing.push("R2_ACCESS_KEY_ID");
  if (!env.R2_SECRET_ACCESS_KEY?.trim()) missing.push("R2_SECRET_ACCESS_KEY");
  if (
    !env.R2_ENDPOINT?.trim() &&
    !env.S3_ENDPOINT?.trim() &&
    !env.R2_ACCOUNT_ID?.trim()
  ) {
    missing.push("R2_ACCOUNT_ID (or R2_ENDPOINT)");
  }
  return missing;
}

function metaFromHeaders(
  storageKey: string,
  metadata: Record<string, string> | undefined,
  contentType: string | undefined,
  sizeBytes: number,
): StoredObjectMeta {
  const original = metadata?.originalname;
  return {
    storageKey,
    fileName: original ? safeDecode(original) : storageKey.split("/").pop() || storageKey,
    mimeType: contentType ?? "application/octet-stream",
    sizeBytes,
    sha256: metadata?.sha256 ?? "",
    uploadedAt: metadata?.uploadedat ?? new Date().toISOString(),
  };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
  return name === "NoSuchKey" || name === "NotFound" || status === 404;
}

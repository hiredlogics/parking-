/**
 * Storage abstraction for evidence uploads.
 *
 * Implementations must not enforce business logic beyond the mechanics
 * of put/get/delete. Ownership and access control live in the API layer
 * — a storage key is NEVER a capability on its own.
 */

/** Metadata about a stored object, without the bytes. */
export interface StoredObjectMeta {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Content hash, for integrity and duplicate detection. */
  sha256: string;
  uploadedAt: string;
}

export interface StoredObject extends StoredObjectMeta {
  bytes: Uint8Array;
}

export interface PutInput {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  /**
   * Namespace the object belongs to, normally the case id. Keys are
   * scoped by it so a leaked key cannot be mutated into another
   * customer's key.
   */
  namespace?: string;
}

export interface StorageProvider {
  readonly id: string;

  put(input: PutInput): Promise<StoredObjectMeta>;

  /** Full object including bytes. Null when the key does not exist. */
  get(storageKey: string): Promise<StoredObject | null>;

  /** Metadata only — avoids pulling bytes just to check existence. */
  head(storageKey: string): Promise<StoredObjectMeta | null>;

  delete(storageKey: string): Promise<void>;

  /**
   * A short-lived, pre-authenticated download URL.
   *
   * Returns null when the provider cannot issue one (the in-memory
   * provider), in which case the caller streams the bytes instead.
   */
  signedUrl(
    storageKey: string,
    opts?: { expiresInSeconds?: number; downloadName?: string },
  ): Promise<string | null>;
}

/** Default lifetime for a signed URL. Deliberately short. */
export const SIGNED_URL_TTL_SECONDS = 120;

/**
 * Build a storage key.
 *
 * Two properties matter:
 *   - the namespace prefix keeps each case's objects separated;
 *   - the random segment means a key cannot be guessed from the
 *     filename, so knowing a case id is not enough to fetch its files.
 */
export function buildStorageKey(input: {
  namespace?: string;
  fileName: string;
}): string {
  const prefix = input.namespace
    ? `cases/${sanitiseSegment(input.namespace)}/evidence`
    : "unscoped";
  const random = randomSegment();
  return `${prefix}/${random}-${sanitiseFileName(input.fileName)}`;
}

/** Strip anything that could traverse or escape the key namespace. */
export function sanitiseSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "unknown";
}

export function sanitiseFileName(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    // Collapse any remaining dot run. S3 keys are flat strings, but some
    // S3-compatible gateways normalise paths, so no ".." survives here.
    .replace(/\.{2,}/g, "_")
    .slice(0, 100);
  return cleaned || "file";
}

function randomSegment(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

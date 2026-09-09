import { createHash } from "node:crypto";
import {
  buildStorageKey,
  type PutInput,
  type StorageProvider,
  type StoredObject,
  type StoredObjectMeta,
} from "./types";

/**
 * In-memory storage — local development only.
 *
 * Data is lost on restart and is not shared between processes, so it is
 * unusable behind more than one server instance. Production uses the R2
 * provider.
 */
export class MemoryStorageProvider implements StorageProvider {
  readonly id = "memory";
  private store = new Map<string, StoredObject>();

  async put(input: PutInput): Promise<StoredObjectMeta> {
    const storageKey = buildStorageKey({
      namespace: input.namespace,
      fileName: input.fileName,
    });
    const object: StoredObject = {
      storageKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
      uploadedAt: new Date().toISOString(),
      bytes: input.bytes,
    };
    this.store.set(storageKey, object);
    return meta(object);
  }

  async get(storageKey: string): Promise<StoredObject | null> {
    return this.store.get(storageKey) ?? null;
  }

  async head(storageKey: string): Promise<StoredObjectMeta | null> {
    const found = this.store.get(storageKey);
    return found ? meta(found) : null;
  }

  async delete(storageKey: string): Promise<void> {
    this.store.delete(storageKey);
  }

  /** No signing available; the caller streams the bytes instead. */
  async signedUrl(): Promise<string | null> {
    return null;
  }

  async list(): Promise<StoredObjectMeta[]> {
    return Array.from(this.store.values()).map(meta);
  }
}

function meta(o: StoredObject): StoredObjectMeta {
  const { bytes: _bytes, ...rest } = o;
  void _bytes;
  return rest;
}

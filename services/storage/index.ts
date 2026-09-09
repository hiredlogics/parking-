import { MemoryStorageProvider } from "./memoryStorage";
import { R2StorageProvider, missingR2Vars, readR2Config } from "./r2Storage";
import type { StorageProvider } from "./types";

let cached: StorageProvider | null = null;

export class StorageConfigurationError extends Error {}

/**
 * Storage factory.
 *
 *   STORAGE_PROVIDER=memory  (default) local development
 *   STORAGE_PROVIDER=r2                production, Cloudflare R2 or any
 *                                      S3-compatible endpoint
 *
 * Selecting `r2` without complete credentials throws rather than
 * silently falling back — quietly writing customer evidence to a store
 * that vanishes on restart would be worse than failing loudly.
 */
export function getStorageProvider(): StorageProvider {
  if (cached) return cached;

  const configured = (process.env.STORAGE_PROVIDER ?? "memory").toLowerCase();

  if (configured === "r2" || configured === "s3") {
    const config = readR2Config();
    if (!config) {
      throw new StorageConfigurationError(
        `STORAGE_PROVIDER=${configured} but storage is not configured. Missing: ${missingR2Vars().join(", ")}.`,
      );
    }
    cached = new R2StorageProvider(config);
    return cached;
  }

  if (configured !== "memory") {
    throw new StorageConfigurationError(
      `Unknown STORAGE_PROVIDER "${configured}". Use "memory" or "r2".`,
    );
  }

  cached = new MemoryStorageProvider();
  return cached;
}

/** True when evidence survives a restart. */
export function isDurableStorage(): boolean {
  return (process.env.STORAGE_PROVIDER ?? "memory").toLowerCase() !== "memory";
}

/** Reset the cached provider — tests only. */
export function resetStorageProvider(): void {
  cached = null;
}

export { MemoryStorageProvider, R2StorageProvider };
export * from "./types";

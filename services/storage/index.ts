import { refuseInProduction } from "@/lib/config/production";
import { MemoryStorageProvider } from "./memoryStorage";
import { R2StorageProvider, missingR2Vars, readR2Config } from "./r2Storage";
import type { StorageProvider } from "./types";

let cached: StorageProvider | null = null;

export class StorageConfigurationError extends Error {}

/**
 * Storage factory.
 *
 *   STORAGE_PROVIDER=memory  (default) local development
 *   STORAGE_PROVIDER=r2|s3|spaces   durable S3-compatible storage
 *                                   (Cloudflare R2 or DigitalOcean Spaces)
 *
 * Selecting a durable provider without complete credentials throws rather
 * than silently falling back — quietly writing customer evidence to a
 * store that vanishes on restart would be worse than failing loudly.
 */
export function getStorageProvider(): StorageProvider {
  if (cached) return cached;

  const configured = (process.env.STORAGE_PROVIDER ?? "memory").toLowerCase();

  if (configured === "r2" || configured === "s3" || configured === "spaces") {
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
      `Unknown STORAGE_PROVIDER "${configured}". Use "memory", "r2", "s3", or "spaces".`,
    );
  }

  /*
   * An unset STORAGE_PROVIDER used to mean "keep customer evidence in a
   * Map", which in production means losing it on every restart and
   * hiding it from every other instance.
   */
  refuseInProduction(
    "STORAGE_PROVIDER",
    "Storage would default to an in-process Map, so customer evidence and generated PDFs would be lost on restart. Set STORAGE_PROVIDER=s3 with S3_ENDPOINT for DigitalOcean Spaces.",
  );

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

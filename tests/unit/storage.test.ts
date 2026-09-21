/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryStorageProvider } from "@/services/storage/memoryStorage";
import {
  buildStorageKey,
  sanitiseFileName,
  sanitiseSegment,
  SIGNED_URL_TTL_SECONDS,
} from "@/services/storage/types";
import {
  isSpacesEndpoint,
  missingR2Vars,
  readR2Config,
  regionForEndpoint,
} from "@/services/storage/r2Storage";
import {
  getStorageProvider,
  isDurableStorage,
  resetStorageProvider,
  StorageConfigurationError,
} from "@/services/storage";

/**
 * P1-a — object storage.
 *
 * These cover key construction (which is a security boundary), the
 * provider factory's fail-closed behaviour, and the memory provider.
 */

describe("MemoryStorageProvider", () => {
  it("stores, retrieves and deletes objects", async () => {
    const s = new MemoryStorageProvider();
    const stored = await s.put({
      fileName: "a.txt",
      mimeType: "text/plain",
      bytes: new Uint8Array([1, 2, 3, 4]),
      namespace: "case_1",
    });
    const got = await s.get(stored.storageKey);
    expect(got?.sizeBytes).toBe(4);
    await s.delete(stored.storageKey);
    expect(await s.get(stored.storageKey)).toBeNull();
  });

  it("computes a sha256 for integrity", async () => {
    const s = new MemoryStorageProvider();
    const stored = await s.put({
      fileName: "a.txt",
      mimeType: "text/plain",
      bytes: new TextEncoder().encode("hello"),
    });
    // Known SHA-256 of "hello".
    expect(stored.sha256).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("returns metadata without bytes from head", async () => {
    const s = new MemoryStorageProvider();
    const stored = await s.put({
      fileName: "a.txt",
      mimeType: "text/plain",
      bytes: new Uint8Array([1, 2]),
    });
    const head = await s.head(stored.storageKey);
    expect(head).not.toBeNull();
    expect(head).not.toHaveProperty("bytes");
  });

  it("cannot sign, so callers fall back to streaming", async () => {
    expect(await new MemoryStorageProvider().signedUrl()).toBeNull();
  });

  it("gives every upload a distinct key", async () => {
    const s = new MemoryStorageProvider();
    const a = await s.put({
      fileName: "same.pdf", mimeType: "application/pdf",
      bytes: new Uint8Array([1]), namespace: "case_1",
    });
    const b = await s.put({
      fileName: "same.pdf", mimeType: "application/pdf",
      bytes: new Uint8Array([1]), namespace: "case_1",
    });
    expect(a.storageKey).not.toBe(b.storageKey);
  });
});

/* ===================== Key construction (security) ===================== */

describe("Storage key construction", () => {
  it("namespaces keys by case", () => {
    const key = buildStorageKey({ namespace: "case_abc", fileName: "x.pdf" });
    expect(key.startsWith("cases/case_abc/evidence/")).toBe(true);
  });

  it("includes an unguessable segment", () => {
    // Knowing the case id and filename must not be enough to build the key.
    const a = buildStorageKey({ namespace: "case_abc", fileName: "x.pdf" });
    const b = buildStorageKey({ namespace: "case_abc", fileName: "x.pdf" });
    expect(a).not.toBe(b);
  });

  it("strips path traversal from the namespace", () => {
    const key = buildStorageKey({
      namespace: "../../etc",
      fileName: "x.pdf",
    });
    expect(key).not.toContain("..");
    // The namespace must stay exactly one segment deep.
    expect(key.split("/")).toHaveLength(4);
    expect(key.startsWith("cases/etc/evidence/")).toBe(true);
  });

  it("strips path traversal from the filename", () => {
    const key = buildStorageKey({
      namespace: "case_1",
      fileName: "../../../etc/passwd",
    });
    expect(key).not.toContain("..");
    expect(key.startsWith("cases/case_1/evidence/")).toBe(true);
  });

  it("sanitises separators and leading dots in filenames", () => {
    expect(sanitiseFileName("a/b\\c.pdf")).toBe("a-b-c.pdf");
    expect(sanitiseFileName("...hidden")).toBe("hidden");
    expect(sanitiseFileName("")).toBe("file");
  });

  it("never yields an empty namespace segment", () => {
    expect(sanitiseSegment("!!!")).toBe("unknown");
  });

  it("keeps signed URLs short-lived", () => {
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(300);
  });
});

/* ========================= R2 configuration ========================= */

describe("R2 configuration", () => {
  const full = {
    R2_BUCKET: "b",
    R2_ACCESS_KEY_ID: "k",
    R2_SECRET_ACCESS_KEY: "s",
    R2_ACCOUNT_ID: "acct",
  };

  it("derives the endpoint from the account id", () => {
    const cfg = readR2Config(full);
    expect(cfg?.endpoint).toBe("https://acct.r2.cloudflarestorage.com");
  });

  it("prefers an explicit endpoint for non-R2 S3", () => {
    const cfg = readR2Config({ ...full, R2_ENDPOINT: "https://s3.example.com" });
    expect(cfg?.endpoint).toBe("https://s3.example.com");
  });

  it("returns null when incomplete", () => {
    expect(readR2Config({ R2_BUCKET: "b" })).toBeNull();
  });

  it("names exactly what is missing", () => {
    const missing = missingR2Vars({ R2_BUCKET: "b" });
    expect(missing.some((m) => m.includes("R2_ACCESS_KEY_ID"))).toBe(true);
    expect(missing.some((m) => m.includes("R2_SECRET_ACCESS_KEY"))).toBe(true);
    expect(missing.some((m) => m.includes("R2_BUCKET"))).toBe(false);
  });
});

/* ========================= Provider factory ========================= */

describe("Provider factory", () => {
  const saved = { ...process.env };
  beforeEach(() => resetStorageProvider());
  afterEach(() => {
    process.env = { ...saved };
    resetStorageProvider();
  });

  it("defaults to memory", () => {
    delete process.env.STORAGE_PROVIDER;
    expect(getStorageProvider().id).toBe("memory");
    expect(isDurableStorage()).toBe(false);
  });

  it("fails closed when r2 is selected but unconfigured", () => {
    // Silently writing evidence to a store that vanishes on restart
    // would be worse than refusing to start.
    process.env.STORAGE_PROVIDER = "r2";
    delete process.env.R2_BUCKET;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ENDPOINT;
    expect(() => getStorageProvider()).toThrow(StorageConfigurationError);
  });

  it("builds the R2 provider when configured", () => {
    process.env.STORAGE_PROVIDER = "r2";
    process.env.R2_BUCKET = "b";
    process.env.R2_ACCESS_KEY_ID = "k";
    process.env.R2_SECRET_ACCESS_KEY = "s";
    process.env.R2_ACCOUNT_ID = "acct";
    expect(getStorageProvider().id).toBe("r2");
    expect(isDurableStorage()).toBe(true);
  });

  it("accepts STORAGE_PROVIDER=spaces with SPACES_* vars", () => {
    process.env.STORAGE_PROVIDER = "spaces";
    process.env.SPACES_BUCKET = "appeals";
    process.env.SPACES_KEY = "key";
    process.env.SPACES_SECRET = "secret";
    process.env.SPACES_ENDPOINT = "https://lon1.digitaloceanspaces.com";
    expect(getStorageProvider().id).toBe("r2");
    expect(isDurableStorage()).toBe(true);
  });

  it("rejects an unknown provider rather than guessing", () => {
    process.env.STORAGE_PROVIDER = "dropbox";
    expect(() => getStorageProvider()).toThrow(/Unknown STORAGE_PROVIDER/);
  });
});

/**
 * DigitalOcean Spaces compatibility.
 *
 * The provider was written against Cloudflare R2, where the region is
 * ignored and the SDK's additional-checksum header is accepted. Spaces
 * differs on both counts, and both differences fail the upload rather
 * than degrading, so they are pinned here.
 */
describe("DigitalOcean Spaces endpoints", () => {
  it("derives the signing region from the Spaces endpoint", () => {
    // Signing with "auto" against Spaces fails AuthorizationHeaderMalformed.
    expect(regionForEndpoint("https://lon1.digitaloceanspaces.com")).toBe("lon1");
    expect(regionForEndpoint("https://ams3.digitaloceanspaces.com")).toBe("ams3");
    expect(regionForEndpoint("https://nyc3.digitaloceanspaces.com")).toBe("nyc3");
  });

  it("keeps 'auto' for R2 endpoints, which ignore the region", () => {
    expect(regionForEndpoint("https://acct.r2.cloudflarestorage.com")).toBe("auto");
  });

  it("recognises a Spaces endpoint", () => {
    expect(isSpacesEndpoint("https://lon1.digitaloceanspaces.com")).toBe(true);
    expect(isSpacesEndpoint("https://acct.r2.cloudflarestorage.com")).toBe(false);
  });

  it("uses the derived region when R2_REGION is not set", () => {
    const config = readR2Config({
      R2_BUCKET: "appeals",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      S3_ENDPOINT: "https://lon1.digitaloceanspaces.com",
    });
    expect(config?.region).toBe("lon1");
  });

  it("reads SPACES_* aliases for DigitalOcean", () => {
    const config = readR2Config({
      SPACES_BUCKET: "appeals",
      SPACES_KEY: "key",
      SPACES_SECRET: "secret",
      SPACES_ENDPOINT: "https://ams3.digitaloceanspaces.com",
    });
    expect(config?.bucket).toBe("appeals");
    expect(config?.endpoint).toBe("https://ams3.digitaloceanspaces.com");
    expect(config?.region).toBe("ams3");
  });

  it("lets an explicit R2_REGION win", () => {
    const config = readR2Config({
      R2_BUCKET: "appeals",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      S3_ENDPOINT: "https://lon1.digitaloceanspaces.com",
      R2_REGION: "fra1",
    });
    expect(config?.region).toBe("fra1");
  });
});

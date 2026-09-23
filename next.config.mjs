import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Optional subdirectory deploy (usually empty — Mojo preserves /appeal). */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || undefined;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: __dirname,
  /*
   * `pg` must be required at runtime, not bundled: it reaches for `fs`
   * via pg-connection-string and for the optional `pg-native` binding,
   * neither of which webpack can resolve.
   */
  serverExternalPackages: ["pg"],
  /*
   * `serverExternalPackages` only covers the Node server build. Middleware
   * makes Next compile instrumentation for edge as well, and that build
   * still follows `pg` into `fs` / `pg-native`. Nothing outside Node ever
   * executes the pool (instrumentation.ts guards on NEXT_RUNTIME), so the
   * module is resolved away entirely for those compilations.
   */
  webpack: (config, { isServer, nextRuntime }) => {
    if (!isServer || nextRuntime === "edge") {
      config.resolve.alias = {
        ...config.resolve.alias,
        pg: false,
        "pg-native": false,
      };
    }
    return config;
  },
  ...(basePath && basePath !== "/"
    ? { basePath: basePath.replace(/\/$/, "") }
    : {}),
  eslint: {
    ignoreDuringBuilds: false,
  },
  typedRoutes: false,
};

export default nextConfig;

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
  ...(basePath && basePath !== "/"
    ? { basePath: basePath.replace(/\/$/, "") }
    : {}),
  eslint: {
    ignoreDuringBuilds: false,
  },
  typedRoutes: false,
};

export default nextConfig;

import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["mapbox-gl"],
  // Évite que Next prenne un lockfile parent (ex. ~/package-lock.json) comme racine workspace.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["@darkflow/ui", "@darkflow/auth", "@darkflow/db", "@darkflow/sync", "@darkflow/js"],
  turbopack: {
    root: path.resolve(configDir, "../.."),
  },
};

export default nextConfig;

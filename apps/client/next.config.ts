import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@darkflow/ui", "@darkflow/auth", "@darkflow/db"],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  outputFileTracingIncludes: {
    "/api/reports/export": ["./src/lib/fonts/**/*"],
  },
  reactStrictMode: false,
};

export default nextConfig;

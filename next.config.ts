import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Prisma ships native bindings (.node files) that Turbopack cannot bundle.
  // Mark it as a server-external package so Next loads it from node_modules
  // at runtime via require() instead of trying to bundle the binary.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;

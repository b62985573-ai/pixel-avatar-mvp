import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  outputFileTracingIncludes: {
    "/api/pixelate": [
      "./node_modules/sharp/**/*",
      "./node_modules/@img/**/*",
      "./node_modules/.pnpm/sharp*/**/*",
      "./node_modules/.pnpm/@img+sharp*/**/*",
    ],
  },
};

export default nextConfig;

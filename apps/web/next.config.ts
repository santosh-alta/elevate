import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@elevate/shared"],
  images: { unoptimized: true },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tourism/contracts", "@tourism/ui"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
    ],
  },
  poweredByHeader: false,
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/internal/:path*',
        destination: 'http://localhost:4000/internal/:path*',
      },
    ];
  },
};

export default nextConfig;

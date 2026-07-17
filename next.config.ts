import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // the workbench graduated out of /dev
    return [
      { source: "/dev/workbench", destination: "/workbench", permanent: true },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server be previewed at 127.0.0.1 as well as localhost.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;

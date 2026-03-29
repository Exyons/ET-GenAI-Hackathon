import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" is required for Docker deployment (copies minimal node_modules into .next/standalone).
  // For Vercel (serverless), comment out or remove this line — Vercel handles bundling automatically.
  // output: "standalone",
};

export default nextConfig;

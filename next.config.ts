import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'whatsapp-web.js', 'unzipper'],
};
export default nextConfig;

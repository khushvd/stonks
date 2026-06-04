/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module — never bundle it; load it at runtime in Node.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;

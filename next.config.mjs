/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module — never bundle it; load it at runtime in Node.
  serverExternalPackages: ["better-sqlite3"],
  // ESM source files use .js extensions (TypeScript's Node16/bundler convention).
  // Teach webpack to resolve .js → .ts so App Router routes can import from src/.
  webpack(config) {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;

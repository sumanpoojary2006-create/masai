import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.resolve("./"),
  serverExternalPackages: ["playwright", "xlsx"]
};

export default nextConfig;
